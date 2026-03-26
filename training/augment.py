"""
augment_landmarks.py
────────────────────────────────────────────────────────────────
Loads the landmarks CSV produced by record_landmarks.py and
applies multiple augmentation techniques to multiply the dataset.

Each original sample is augmented N times per technique, giving
you a much larger and more diverse training set.

Output:
  data/landmarks_augmented.csv  ← original + all augmented samples

Augmentation techniques applied:
  1.  Gaussian noise          – tiny random jitter on all coords
  2.  Temporal jitter         – randomly drop & repeat frames
  3.  Speed perturbation      – slow down or speed up the sequence
  4.  Spatial scaling         – make the sign slightly bigger/smaller
  5.  Spatial translation     – shift the sign left/right/up/down
  6.  Mirror (horizontal)     – flip left↔right (swap hands too)
  7.  Frame masking           – zero out random frames (occlusion)
  8.  Rotation (2-D)          – small in-plane rotation of XY coords
  9.  Combined                – noise + scale + translate together
────────────────────────────────────────────────────────────────
"""

import os
import numpy as np
import pandas as pd
from tqdm import tqdm

# ── CONFIG ────────────────────────────────────────────────────
INPUT_CSV       = "data/landmarks.csv"
OUTPUT_CSV      = "data/landmarks_augmented.csv"
SEQUENCE_LENGTH = 30
TOTAL_COORDS    = 1662          # must match recorder / trainer

AUGMENTS_PER_TECHNIQUE = 3     # how many augmented copies per technique per sample
                                # 9 techniques × 3 copies + 1 original = 28× dataset size
RANDOM_SEED     = 42

# landmark slice indices (must match record_landmarks.py)
NUM_POSE  = 33 * 4   # 132
NUM_HAND  = 21 * 3   # 63
NUM_FACE  = 468 * 3  # 1404

POSE_END  = NUM_POSE
LH_END    = POSE_END + NUM_HAND
RH_END    = LH_END   + NUM_HAND
FACE_END  = RH_END   + NUM_FACE   # == TOTAL_COORDS


# ── augmentation functions ────────────────────────────────────
# Each function receives a numpy array of shape (SEQUENCE_LENGTH, TOTAL_COORDS)
# and returns an augmented copy of the same shape.

def aug_gaussian_noise(seq: np.ndarray, std=0.008) -> np.ndarray:
    """Add small Gaussian noise to all coordinates."""
    noise = np.random.normal(0, std, seq.shape).astype(np.float32)
    return seq + noise


def aug_temporal_jitter(seq: np.ndarray, max_drops=4) -> np.ndarray:
    """Randomly replace up to max_drops frames with the previous frame."""
    aug = seq.copy()
    n_drops = np.random.randint(1, max_drops + 1)
    drop_indices = np.random.choice(np.arange(1, len(aug)), n_drops, replace=False)
    for i in drop_indices:
        aug[i] = aug[i - 1]
    return aug


def aug_speed_perturbation(seq: np.ndarray, factor_range=(0.7, 1.3)) -> np.ndarray:
    """Stretch or compress the sequence in time then re-sample to original length."""
    t      = len(seq)
    factor = np.random.uniform(*factor_range)
    new_t  = max(2, int(t * factor))

    # interpolate to new_t frames
    old_idx = np.linspace(0, t - 1, new_t)
    new_idx = np.arange(t)
    aug = np.zeros_like(seq)
    for c in range(seq.shape[1]):
        aug[:, c] = np.interp(new_idx, old_idx, seq[np.round(old_idx).astype(int).clip(0, t-1), c])
    return aug.astype(np.float32)


def aug_spatial_scale(seq: np.ndarray, scale_range=(0.85, 1.15)) -> np.ndarray:
    """Scale XYZ coordinates of each body part uniformly."""
    aug   = seq.copy()
    scale = np.random.uniform(*scale_range)
    # apply to pose xyz (skip visibility at every 4th col)
    pose  = aug[:, :POSE_END].reshape(SEQUENCE_LENGTH, 33, 4)
    pose[:, :, :3] *= scale
    aug[:, :POSE_END] = pose.reshape(SEQUENCE_LENGTH, -1)
    # apply to hands and face
    for start, end in [(POSE_END, LH_END), (LH_END, RH_END), (RH_END, FACE_END)]:
        aug[:, start:end] *= scale
    return aug.astype(np.float32)


def aug_spatial_translation(seq: np.ndarray, shift_range=0.05) -> np.ndarray:
    """Shift all XY coordinates by a random offset."""
    aug    = seq.copy()
    shift  = np.random.uniform(-shift_range, shift_range, 2).astype(np.float32)

    # pose: cols 0,1 of every 4-col group
    pose = aug[:, :POSE_END].reshape(SEQUENCE_LENGTH, 33, 4)
    pose[:, :, 0] += shift[0]
    pose[:, :, 1] += shift[1]
    aug[:, :POSE_END] = pose.reshape(SEQUENCE_LENGTH, -1)

    # hands & face: cols 0,1 of every 3-col group
    for start, end, n in [(POSE_END, LH_END, 21),
                          (LH_END,   RH_END, 21),
                          (RH_END,   FACE_END, 468)]:
        part = aug[:, start:end].reshape(SEQUENCE_LENGTH, n, 3)
        part[:, :, 0] += shift[0]
        part[:, :, 1] += shift[1]
        aug[:, start:end] = part.reshape(SEQUENCE_LENGTH, -1)

    return aug.astype(np.float32)


def aug_mirror(seq: np.ndarray) -> np.ndarray:
    """
    Flip horizontally: negate X coords and swap left ↔ right hand.
    This is the most semantically meaningful augmentation for sign language.
    """
    aug = seq.copy()

    # negate X in pose (every 4-col group, col 0)
    pose = aug[:, :POSE_END].reshape(SEQUENCE_LENGTH, 33, 4)
    pose[:, :, 0] *= -1
    aug[:, :POSE_END] = pose.reshape(SEQUENCE_LENGTH, -1)

    # negate X in left hand, right hand, face
    for start, end, n in [(POSE_END, LH_END, 21),
                          (LH_END,   RH_END, 21),
                          (RH_END,   FACE_END, 468)]:
        part = aug[:, start:end].reshape(SEQUENCE_LENGTH, n, 3)
        part[:, :, 0] *= -1
        aug[:, start:end] = part.reshape(SEQUENCE_LENGTH, -1)

    # swap left hand ↔ right hand columns
    lh_cols = aug[:, POSE_END:LH_END].copy()
    rh_cols = aug[:, LH_END:RH_END].copy()
    aug[:, POSE_END:LH_END] = rh_cols
    aug[:, LH_END:RH_END]   = lh_cols

    return aug.astype(np.float32)


def aug_frame_masking(seq: np.ndarray, max_mask=4) -> np.ndarray:
    """Zero out a random block of consecutive frames (simulates occlusion)."""
    aug       = seq.copy()
    mask_len  = np.random.randint(1, max_mask + 1)
    start_idx = np.random.randint(0, max(1, len(aug) - mask_len))
    aug[start_idx:start_idx + mask_len] = 0.0
    return aug.astype(np.float32)


def aug_rotation_2d(seq: np.ndarray, angle_range=(-15, 15)) -> np.ndarray:
    """Rotate XY coordinates by a small random angle (degrees)."""
    aug   = seq.copy()
    angle = np.radians(np.random.uniform(*angle_range))
    cos_a, sin_a = np.cos(angle), np.sin(angle)

    def rotate_xy(part, n, stride):
        p = part.reshape(SEQUENCE_LENGTH, n, stride)
        x, y = p[:, :, 0].copy(), p[:, :, 1].copy()
        p[:, :, 0] = cos_a * x - sin_a * y
        p[:, :, 1] = sin_a * x + cos_a * y
        return p.reshape(SEQUENCE_LENGTH, -1)

    aug[:, :POSE_END]        = rotate_xy(aug[:, :POSE_END],        33,  4)
    aug[:, POSE_END:LH_END]  = rotate_xy(aug[:, POSE_END:LH_END],  21,  3)
    aug[:, LH_END:RH_END]    = rotate_xy(aug[:, LH_END:RH_END],    21,  3)
    aug[:, RH_END:FACE_END]  = rotate_xy(aug[:, RH_END:FACE_END],  468, 3)

    return aug.astype(np.float32)


def aug_combined(seq: np.ndarray) -> np.ndarray:
    """Apply noise + scale + translation together."""
    aug = aug_gaussian_noise(seq, std=0.005)
    aug = aug_spatial_scale(aug, scale_range=(0.9, 1.1))
    aug = aug_spatial_translation(aug, shift_range=0.03)
    return aug


# registry: name → function
AUGMENTATIONS = {
    "noise":       aug_gaussian_noise,
    "temporal":    aug_temporal_jitter,
    "speed":       aug_speed_perturbation,
    "scale":       aug_spatial_scale,
    "translate":   aug_spatial_translation,
    "mirror":      aug_mirror,
    "mask":        aug_frame_masking,
    "rotation":    aug_rotation_2d,
    "combined":    aug_combined,
}


# ── main ─────────────────────────────────────────────────────
def main():
    np.random.seed(RANDOM_SEED)
    os.makedirs(os.path.dirname(OUTPUT_CSV) or ".", exist_ok=True)

    print(f"[INFO] Loading '{INPUT_CSV}' ...")
    df = pd.read_csv(INPUT_CSV)

    glosses  = df["gloss"].values
    features = df.drop(columns=["gloss"]).values.astype(np.float32)

    expected = SEQUENCE_LENGTH * TOTAL_COORDS
    if features.shape[1] != expected:
        raise ValueError(
            f"CSV has {features.shape[1]} cols but expected {expected}. "
            f"Check SEQUENCE_LENGTH and TOTAL_COORDS."
        )

    n_original = len(features)
    print(f"[INFO] Original samples : {n_original}")
    print(f"[INFO] Techniques       : {len(AUGMENTATIONS)}")
    print(f"[INFO] Copies each      : {AUGMENTS_PER_TECHNIQUE}")
    expected_total = n_original * (1 + len(AUGMENTATIONS) * AUGMENTS_PER_TECHNIQUE)
    print(f"[INFO] Expected total   : {expected_total}\n")

    # build output rows
    all_glosses  = list(glosses)
    all_features = list(features)

    for i in tqdm(range(n_original), desc="Augmenting"):
        seq   = features[i].reshape(SEQUENCE_LENGTH, TOTAL_COORDS)
        gloss = glosses[i]

        for aug_name, aug_fn in AUGMENTATIONS.items():
            for _ in range(AUGMENTS_PER_TECHNIQUE):
                try:
                    aug_seq = aug_fn(seq)
                except Exception as e:
                    print(f"[WARN] {aug_name} failed on sample {i}: {e}")
                    aug_seq = seq.copy()

                all_glosses.append(gloss)
                all_features.append(aug_seq.flatten())

    # assemble dataframe
    print("\n[INFO] Building output dataframe ...")
    feat_cols = [f"f{i}" for i in range(SEQUENCE_LENGTH * TOTAL_COORDS)]
    out_df    = pd.DataFrame(all_features, columns=feat_cols, dtype=np.float32)
    out_df.insert(0, "gloss", all_glosses)

    # shuffle
    out_df = out_df.sample(frac=1, random_state=RANDOM_SEED).reset_index(drop=True)

    out_df.to_csv(OUTPUT_CSV, index=False)

    print(f"[INFO] Saved {len(out_df)} samples → '{OUTPUT_CSV}'")
    print("\n── Per-class counts ──")
    print(out_df["gloss"].value_counts().to_string())
    print(f"\n[DONE] Use '{OUTPUT_CSV}' as your CSV_PATH in train_model.py")


if __name__ == "__main__":
    main()