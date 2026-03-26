"""
camera_test_new.py
────────────────────────────────────────────────────────────────
Tests your newly trained sign-language model live via webcam.
Loads directly from:
  models/best_model.keras
  models/label_map.txt

Controls:
  SPACE   start recording
  R       clear last result
  Q       quit
────────────────────────────────────────────────────────────────
"""

import cv2
import numpy as np
import time
import mediapipe as mp
from tensorflow.keras.models import load_model

# ── CONFIG ────────────────────────────────────────────────────
MODEL_PATH        = "models/best_model.keras"
LABEL_MAP_PATH    = "models/label_map.txt"
SEQUENCE_LENGTH   = 30
TOTAL_COORDS      = 1662
CONFIDENCE_THRESH = 0.7
CAPTURE_FPS       = 10
CAMERA_INDEX      = 0

# landmark slice indices
NUM_POSE  = 33 * 4
NUM_HAND  = 21 * 3
NUM_FACE  = 468 * 3
POSE_END  = NUM_POSE
LH_END    = POSE_END + NUM_HAND
RH_END    = LH_END   + NUM_HAND
FACE_END  = RH_END   + NUM_FACE

# UI colours (BGR)
COL_RED   = (0,  50,  220)
COL_GREEN = (0, 210,   80)
COL_AMBER = (0, 180,  240)
COL_WHITE = (255, 255, 255)
COL_BLACK = (0,   0,    0)
COL_DARK  = (20,  20,   20)


# ── load model + labels ───────────────────────────────────────
print("[INFO] Loading model ...")
model = load_model(MODEL_PATH)
print(f"[INFO] Model loaded from '{MODEL_PATH}'")

id_to_gloss = {}
with open(LABEL_MAP_PATH, "r") as f:
    for line in f:
        idx, gloss = line.strip().split(",", 1)
        id_to_gloss[int(idx)] = gloss
print(f"[INFO] {len(id_to_gloss)} classes: {list(id_to_gloss.values())}")

# ── mediapipe ────────────────────────────────────────────────
mp_holistic = mp.solutions.holistic
mp_draw     = mp.solutions.drawing_utils
holistic    = mp_holistic.Holistic(
    static_image_mode=False,
    model_complexity=1,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5,
)


# ── landmark extraction ───────────────────────────────────────
def extract_landmarks(results) -> np.ndarray:
    frame = np.zeros(TOTAL_COORDS, dtype=np.float32)
    idx   = 0

    if results.pose_landmarks:
        for lm in results.pose_landmarks.landmark:
            frame[idx:idx+4] = [lm.x, lm.y, lm.z, lm.visibility]
    idx += NUM_POSE

    if results.left_hand_landmarks:
        for lm in results.left_hand_landmarks.landmark:
            frame[idx:idx+3] = [lm.x, lm.y, lm.z]
    idx += NUM_HAND

    if results.right_hand_landmarks:
        for lm in results.right_hand_landmarks.landmark:
            frame[idx:idx+3] = [lm.x, lm.y, lm.z]
    idx += NUM_HAND

    if results.face_landmarks:
        for lm in results.face_landmarks.landmark:
            frame[idx:idx+3] = [lm.x, lm.y, lm.z]

    return frame


# ── normalisation (matches record_landmarks.py) ───────────────
def normalize_sequence(sequence: np.ndarray) -> np.ndarray:
    parts_cfg = [
        (0,        POSE_END, 4),
        (POSE_END, LH_END,   3),
        (LH_END,   RH_END,   3),
        (RH_END,   FACE_END, 3),
    ]
    normalized = []
    for frame in sequence:
        parts_out = []
        for start, end, stride in parts_cfg:
            chunk = frame[start:end].copy()
            if np.all(chunk == 0):
                parts_out.append(chunk)
                continue
            lms = chunk.reshape(-1, stride)
            xyz = lms[:, :3]
            xyz -= xyz.mean(axis=0)
            scale = np.max(np.linalg.norm(xyz, axis=1))
            if scale > 1e-6:
                xyz /= scale
            lms[:, :3] = xyz
            parts_out.append(lms.flatten())
        normalized.append(np.concatenate(parts_out))
    return np.array(normalized, dtype=np.float32)


def pad_or_truncate(seq: np.ndarray) -> np.ndarray:
    if len(seq) < SEQUENCE_LENGTH:
        pad = np.zeros((SEQUENCE_LENGTH - len(seq), TOTAL_COORDS), dtype=np.float32)
        return np.vstack([seq, pad])
    return seq[:SEQUENCE_LENGTH]


# ── inference ─────────────────────────────────────────────────
def predict(frame_sequence: list) -> tuple:
    seq  = np.array(frame_sequence, dtype=np.float32)
    seq  = normalize_sequence(seq)
    seq  = pad_or_truncate(seq)
    seq  = np.expand_dims(seq, axis=0)           # (1, 30, 1662)

    preds      = model.predict(seq, verbose=0)
    pred_id    = int(np.argmax(preds))
    confidence = float(np.max(preds))
    word       = id_to_gloss.get(pred_id, "Unknown")

    return (word if confidence >= CONFIDENCE_THRESH else ""), confidence


# ── HUD ───────────────────────────────────────────────────────
def draw_hud(frame, state, n_frames, result_word, result_conf):
    h, w = frame.shape[:2]

    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (w, 54), COL_DARK, -1)
    cv2.addWeighted(overlay, 0.6, frame, 0.4, 0, frame)

    status_map = {
        "idle":       (f"IDLE  —  SPACE to record",              COL_WHITE),
        "recording":  (f"RECORDING  {n_frames}/{SEQUENCE_LENGTH} frames", COL_RED),
        "processing": ("PROCESSING ...",                          COL_AMBER),
    }
    label, col = status_map.get(state, ("", COL_WHITE))
    cv2.putText(frame, label, (12, 34),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, col, 2, cv2.LINE_AA)

    # progress bar while recording
    if state == "recording":
        bar = int(w * n_frames / SEQUENCE_LENGTH)
        cv2.rectangle(frame, (0, 50), (w, 56),  (60, 60, 60), -1)
        cv2.rectangle(frame, (0, 50), (bar, 56), COL_RED,      -1)

    # result
    if result_word:
        pct  = f"{result_conf*100:.1f}%"
        text = f"{result_word}  ({pct})"
        rcol = COL_GREEN if result_conf >= CONFIDENCE_THRESH else COL_AMBER
        cv2.putText(frame, text, (12, h - 18),
                    cv2.FONT_HERSHEY_DUPLEX, 1.3, COL_BLACK, 6, cv2.LINE_AA)
        cv2.putText(frame, text, (12, h - 18),
                    cv2.FONT_HERSHEY_DUPLEX, 1.3, rcol,      2, cv2.LINE_AA)
    elif state == "idle":
        cv2.putText(frame, "No prediction yet", (12, h - 18),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (120, 120, 120), 1, cv2.LINE_AA)

    cv2.putText(frame, "SPACE: record   R: clear   Q: quit",
                (w - 370, h - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.42, (140, 140, 140), 1, cv2.LINE_AA)


# ── main loop ─────────────────────────────────────────────────
def main():
    cap = cv2.VideoCapture(CAMERA_INDEX)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open camera {CAMERA_INDEX}")
    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    print("\n" + "="*50)
    print("  Sign Language Camera Tester")
    print("="*50)
    print(f"  Model      : {MODEL_PATH}")
    print(f"  Classes    : {list(id_to_gloss.values())}")
    print(f"  Seq length : {SEQUENCE_LENGTH} frames @ {CAPTURE_FPS} fps")
    print(f"  Threshold  : {CONFIDENCE_THRESH*100:.0f}%")
    print("="*50 + "\n")

    state          = "idle"
    frame_buf      = []        # list of raw landmark arrays
    result_word    = ""
    result_conf    = 0.0
    last_cap_t     = 0.0
    frame_interval = 1.0 / CAPTURE_FPS

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                continue

            rgb     = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = holistic.process(rgb)

            # draw skeleton on preview
            mp_draw.draw_landmarks(frame, results.pose_landmarks,
                                   mp_holistic.POSE_CONNECTIONS,
                                   mp_draw.DrawingSpec(color=(80,110,10),  thickness=1, circle_radius=1),
                                   mp_draw.DrawingSpec(color=(80,256,121), thickness=1, circle_radius=1))
            mp_draw.draw_landmarks(frame, results.left_hand_landmarks,
                                   mp_holistic.HAND_CONNECTIONS,
                                   mp_draw.DrawingSpec(color=(121,22,76),  thickness=2, circle_radius=2),
                                   mp_draw.DrawingSpec(color=(121,44,250), thickness=2, circle_radius=2))
            mp_draw.draw_landmarks(frame, results.right_hand_landmarks,
                                   mp_holistic.HAND_CONNECTIONS,
                                   mp_draw.DrawingSpec(color=(245,117,66), thickness=2, circle_radius=2),
                                   mp_draw.DrawingSpec(color=(245,66,230), thickness=2, circle_radius=2))

            key = cv2.waitKey(1) & 0xFF
            if key == ord('q'):
                break
            elif key == ord('r'):
                result_word = ""
                result_conf = 0.0
                state       = "idle"
                frame_buf.clear()
            elif key == ord(' ') and state == "idle":
                print("[INFO] Recording ...")
                frame_buf.clear()
                state     = "recording"
                last_cap_t = time.time()

            # capture frames at fixed rate
            if state == "recording":
                now = time.time()
                if now - last_cap_t >= frame_interval:
                    lms = extract_landmarks(results)
                    frame_buf.append(lms)
                    last_cap_t = now
                    print(f"  frame {len(frame_buf)}/{SEQUENCE_LENGTH}", end="\r")

                    if len(frame_buf) >= SEQUENCE_LENGTH:
                        print()
                        state = "processing"

            # run inference
            if state == "processing":
                draw_hud(frame, state, len(frame_buf), result_word, result_conf)
                cv2.imshow("Sign Language Tester", frame)
                cv2.waitKey(1)

                print("[INFO] Running inference ...")
                result_word, result_conf = predict(frame_buf)

                if result_word:
                    print(f"[RESULT] '{result_word}'  ({result_conf*100:.1f}%)")
                else:
                    print(f"[RESULT] Below threshold  ({result_conf*100:.1f}%)")

                frame_buf.clear()
                state = "idle"

            draw_hud(frame, state, len(frame_buf), result_word, result_conf)
            cv2.imshow("Sign Language Tester", frame)

    finally:
        cap.release()
        holistic.close()
        cv2.destroyAllWindows()
        print("\n[INFO] Closed.")


if __name__ == "__main__":
    main()