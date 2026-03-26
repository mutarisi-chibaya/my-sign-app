"""
record_landmarks.py
────────────────────────────────────────────────────────────────
Records sign-language landmark sequences from your webcam and
saves them to a CSV ready for train_model.py.

Folder structure created:
  data/
    landmarks.csv   ← appended after every recording session

Controls:
  SPACE  – start / stop a recording
  N      – next word (when done recording all samples for current word)
  Q      – quit and save CSV
────────────────────────────────────────────────────────────────
"""

import cv2
import csv
import os
import time
import numpy as np
import mediapipe as mp

# ── CONFIG ────────────────────────────────────────────────────
WORDS = [
    "hello",
    "how are you",
    "me",           # Used for "I am..." and "My..."
    "good",         # Used for "I am good"
    "you",          # Used for "And you?" or "Your..."
    "name",         # Used for "What is your name?" and "My name is..."
    "fine",         # An alternative to "good" for variety
    "thank you",
    "goodbye"
]

VIDEOS_PER_WORD = 50          # recordings per word
SEQUENCE_LENGTH = 30          # frames captured per recording
CAMERA_INDEX    = 0
OUTPUT_CSV      = "data/landmarks.csv"
ENCODE_QUALITY  = 90

# ── MediaPipe setup ───────────────────────────────────────────
mp_holistic = mp.solutions.holistic
mp_draw     = mp.solutions.drawing_utils

NUM_POSE_COORDS  = 33 * 4
NUM_HAND_COORDS  = 21 * 3
NUM_FACE_COORDS  = 468 * 3
TOTAL_COORDS     = NUM_POSE_COORDS + NUM_HAND_COORDS * 2 + NUM_FACE_COORDS  # 1662

# ── helpers ───────────────────────────────────────────────────
COL_RED    = (0,   50, 220)
COL_GREEN  = (0,  210,  80)
COL_AMBER  = (0,  180, 240)
COL_WHITE  = (255, 255, 255)
COL_DARK   = (20,  20,  20)


def extract_landmarks(results) -> np.ndarray:
    """Pull landmark coords from a MediaPipe holistic result → 1-D array."""
    frame_lms = np.zeros(TOTAL_COORDS, dtype=np.float32)
    idx = 0

    if results.pose_landmarks:
        for lm in results.pose_landmarks.landmark:
            frame_lms[idx:idx+4] = [lm.x, lm.y, lm.z, lm.visibility]
    idx += NUM_POSE_COORDS

    if results.left_hand_landmarks:
        for lm in results.left_hand_landmarks.landmark:
            frame_lms[idx:idx+3] = [lm.x, lm.y, lm.z]
    idx += NUM_HAND_COORDS

    if results.right_hand_landmarks:
        for lm in results.right_hand_landmarks.landmark:
            frame_lms[idx:idx+3] = [lm.x, lm.y, lm.z]
    idx += NUM_HAND_COORDS

    if results.face_landmarks:
        for lm in results.face_landmarks.landmark:
            frame_lms[idx:idx+3] = [lm.x, lm.y, lm.z]

    return frame_lms


def normalize_sequence(sequence: np.ndarray) -> np.ndarray:
    """Centre + scale each body part independently per frame."""
    normalized = []
    parts_cfg = [
        (0,                                    NUM_POSE_COORDS,                4),
        (NUM_POSE_COORDS,                      NUM_POSE_COORDS+NUM_HAND_COORDS,3),
        (NUM_POSE_COORDS+NUM_HAND_COORDS,      NUM_POSE_COORDS+NUM_HAND_COORDS*2, 3),
        (NUM_POSE_COORDS+NUM_HAND_COORDS*2,    TOTAL_COORDS,                   3),
    ]

    for frame in sequence:
        parts_out = []
        for start, end, stride in parts_cfg:
            chunk = frame[start:end].copy()
            if np.all(chunk == 0):
                parts_out.append(chunk)
                continue
            lms = chunk.reshape(-1, stride)
            xyz = lms[:, :3]
            mean = xyz.mean(axis=0)
            xyz  -= mean
            scale = np.max(np.linalg.norm(xyz, axis=1))
            if scale > 1e-6:
                xyz /= scale
            lms[:, :3] = xyz
            parts_out.append(lms.flatten())
        normalized.append(np.concatenate(parts_out))

    return np.array(normalized, dtype=np.float32)


def draw_hud(frame, word, word_idx, sample_idx, state, countdown):
    h, w = frame.shape[:2]
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (w, 55), COL_DARK, -1)
    cv2.addWeighted(overlay, 0.6, frame, 0.4, 0, frame)

    # word + progress
    cv2.putText(frame, f"Word: {word}  [{word_idx+1}/{len(WORDS)}]",
                (12, 30), cv2.FONT_HERSHEY_DUPLEX, 0.75, COL_WHITE, 2, cv2.LINE_AA)
    cv2.putText(frame, f"Sample {sample_idx}/{VIDEOS_PER_WORD}",
                (12, 52), cv2.FONT_HERSHEY_SIMPLEX, 0.55, COL_AMBER, 1, cv2.LINE_AA)

    # state banner
    if state == "idle":
        msg, col = "SPACE to record", COL_WHITE
    elif state == "countdown":
        msg, col = f"Get ready … {countdown}", COL_AMBER
    elif state == "recording":
        msg, col = f"RECORDING", COL_RED
    elif state == "done_word":
        msg, col = "All samples done!  N = next word  Q = quit", COL_GREEN
    else:
        msg, col = "", COL_WHITE

    cv2.putText(frame, msg, (12, h - 15),
                cv2.FONT_HERSHEY_SIMPLEX, 0.65, col, 2, cv2.LINE_AA)

    hints = "SPACE: record    N: next word    Q: quit"
    cv2.putText(frame, hints, (w - 390, h - 15),
                cv2.FONT_HERSHEY_SIMPLEX, 0.42, (140, 140, 140), 1, cv2.LINE_AA)


def ensure_csv(path):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    if not os.path.exists(path):
        with open(path, "w", newline="") as f:
            header = ["gloss"] + [f"f{i}" for i in range(SEQUENCE_LENGTH * TOTAL_COORDS)]
            csv.writer(f).writerow(header)
        print(f"[INFO] Created {path}")


def append_to_csv(path, gloss, sequence):
    """Append one (gloss, flattened-sequence) row to the CSV."""
    flat = sequence.flatten().tolist()
    with open(path, "a", newline="") as f:
        csv.writer(f).writerow([gloss] + flat)


# ── main ──────────────────────────────────────────────────────
def main():
    ensure_csv(OUTPUT_CSV)

    cap = cv2.VideoCapture(CAMERA_INDEX)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open camera {CAMERA_INDEX}")
    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    holistic = mp_holistic.Holistic(
        static_image_mode=False,
        model_complexity=1,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    )

    print("\n" + "="*55)
    print("  Sign Language Landmark Recorder")
    print("="*55)
    print(f"  Words          : {WORDS}")
    print(f"  Samples / word : {VIDEOS_PER_WORD}")
    print(f"  Frames / sample: {SEQUENCE_LENGTH}")
    print(f"  Output CSV     : {OUTPUT_CSV}")
    print("="*55 + "\n")

    word_idx    = 0
    sample_idx  = 0          # how many samples saved for current word
    state       = "idle"     # idle | countdown | recording | done_word
    frame_buf   = []
    countdown_start = 0.0
    COUNTDOWN_SEC   = 2.0

    try:
        while word_idx < len(WORDS):
            ok, frame = cap.read()
            if not ok:
                continue

            rgb     = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = holistic.process(rgb)

            # draw landmarks on preview
            mp_draw.draw_landmarks(frame, results.pose_landmarks,
                                   mp_holistic.POSE_CONNECTIONS)
            mp_draw.draw_landmarks(frame, results.left_hand_landmarks,
                                   mp_holistic.HAND_CONNECTIONS)
            mp_draw.draw_landmarks(frame, results.right_hand_landmarks,
                                   mp_holistic.HAND_CONNECTIONS)

            key = cv2.waitKey(1) & 0xFF

            # ── key handling ──────────────────────────────────
            if key == ord('q'):
                print("\n[INFO] Quit — saving progress.")
                break

            if key == ord('n') and state == "done_word":
                word_idx   += 1
                sample_idx  = 0
                state       = "idle"
                if word_idx < len(WORDS):
                    print(f"\n[INFO] Next word → '{WORDS[word_idx]}'")
                continue

            if key == ord(' ') and state == "idle":
                state = "countdown"
                countdown_start = time.time()
                frame_buf.clear()

            # ── countdown → recording ─────────────────────────
            countdown = 0
            if state == "countdown":
                elapsed   = time.time() - countdown_start
                countdown = max(0, int(COUNTDOWN_SEC - elapsed) + 1)
                if elapsed >= COUNTDOWN_SEC:
                    state = "recording"

            # ── capture frames ────────────────────────────────
            if state == "recording":
                lms = extract_landmarks(results)
                frame_buf.append(lms)

                # progress bar
                prog = int(frame.shape[1] * len(frame_buf) / SEQUENCE_LENGTH)
                cv2.rectangle(frame, (0, 55), (prog, 62), COL_RED, -1)

                if len(frame_buf) >= SEQUENCE_LENGTH:
                    seq = normalize_sequence(np.array(frame_buf, dtype=np.float32))
                    append_to_csv(OUTPUT_CSV, WORDS[word_idx], seq)
                    sample_idx += 1
                    print(f"  ✓ Saved sample {sample_idx}/{VIDEOS_PER_WORD} for '{WORDS[word_idx]}'")
                    frame_buf.clear()
                    state = "done_word" if sample_idx >= VIDEOS_PER_WORD else "idle"

            # ── HUD & display ─────────────────────────────────
            draw_hud(frame, WORDS[word_idx], word_idx, sample_idx, state, countdown)
            cv2.imshow("Landmark Recorder", frame)

    finally:
        cap.release()
        holistic.close()
        cv2.destroyAllWindows()
        print(f"\n[INFO] Done. Landmarks saved to '{OUTPUT_CSV}'")


if __name__ == "__main__":
    main()