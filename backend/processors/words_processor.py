"""
word_processor.py
────────────────────────────────────────────────────────────────
Handles landmark extraction and model inference only.
No camera logic — feed it frames from wherever you like.

Usage:
    from word_processor import WordProcessor

    processor = WordProcessor()

    # feed a single frame (numpy BGR image from opencv or bytes)
    processor.add_frame(frame)

    # once you have enough frames get a prediction
    result = processor.predict()
    # returns { "word": "hello", "confidence": 0.97 }
    # or      { "word": "",      "confidence": 0.43 }  ← below threshold
────────────────────────────────────────────────────────────────
"""

import numpy as np
import mediapipe as mp
from tensorflow.keras.models import load_model

# ── CONFIG ────────────────────────────────────────────────────
MODEL_PATH        = "models/words/best_model.keras"
LABEL_MAP_PATH    = "models/words/label_map.txt"
SEQUENCE_LENGTH   = 30
TOTAL_COORDS      = 1662
CONFIDENCE_THRESH = 0.7

# landmark slice indices
NUM_POSE  = 33 * 4    # 132
NUM_HAND  = 21 * 3    # 63
NUM_FACE  = 468 * 3   # 1404
POSE_END  = NUM_POSE
LH_END    = POSE_END + NUM_HAND
RH_END    = LH_END   + NUM_HAND
FACE_END  = RH_END   + NUM_FACE   # == TOTAL_COORDS


class WordProcessor:
    def __init__(
        self,
        model_path: str          = MODEL_PATH,
        label_map_path: str      = LABEL_MAP_PATH,
        sequence_length: int     = SEQUENCE_LENGTH,
        confidence_thresh: float = CONFIDENCE_THRESH,
    ):
        self.sequence_length   = sequence_length
        self.confidence_thresh = confidence_thresh
        self._frame_buffer: list[np.ndarray] = []

        # ── load model ────────────────────────────────────────
        print(f"[WordProcessor] Loading model from '{model_path}' ...")
        self._model = load_model(model_path)
        print("[WordProcessor] Model ready.")

        # ── load label map ────────────────────────────────────
        self._id_to_gloss: dict[int, str] = {}
        with open(label_map_path, "r") as f:
            for line in f:
                idx, gloss = line.strip().split(",", 1)
                self._id_to_gloss[int(idx)] = gloss
        print(f"[WordProcessor] {len(self._id_to_gloss)} classes loaded: "
              f"{list(self._id_to_gloss.values())}")

        # ── mediapipe holistic — lazy init ────────────────────
        # Not created here — spawned on first frame to keep startup clean
        self._holistic = None

    # ── internal: lazy mediapipe getter ──────────────────────
    def _get_holistic(self):
        if self._holistic is None:
            self._holistic = mp.solutions.holistic.Holistic(
                static_image_mode=False,
                model_complexity=1,
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5,
            )
        return self._holistic

    # ── public API ────────────────────────────────────────────

    def add_frame(self, frame: np.ndarray) -> int:
        """
        Extract landmarks from a BGR numpy frame and add to buffer.

        Parameters
        ----------
        frame : np.ndarray
            BGR image (e.g. directly from cv2.VideoCapture.read())

        Returns
        -------
        int
            Number of frames currently in the buffer.
        """
        import cv2
        rgb     = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self._get_holistic().process(rgb)
        lms     = self._extract_landmarks(results)
        self._frame_buffer.append(lms)
        return len(self._frame_buffer)

    def add_frame_from_bytes(self, image_bytes: bytes) -> int:
        """
        Same as add_frame() but accepts raw image bytes (JPEG/PNG).
        Useful when receiving frames from Node over a socket.

        Parameters
        ----------
        image_bytes : bytes
            Raw image bytes e.g. from a multipart POST or WebSocket message.

        Returns
        -------
        int
            Number of frames currently in the buffer.
        """
        import cv2
        nparr = np.frombuffer(image_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError("Could not decode image bytes.")
        return self.add_frame(frame)

    @property
    def buffer_size(self) -> int:
        """How many frames are currently buffered."""
        return len(self._frame_buffer)

    @property
    def ready(self) -> bool:
        """True when enough frames have been collected to run inference."""
        return len(self._frame_buffer) >= self.sequence_length

    def predict(self) -> dict:
        """
        Run inference on the current frame buffer.
        Can be called at any time — buffer is padded/truncated automatically.

        Returns
        -------
        dict with keys:
            "word"       : str   – predicted gloss, or "" if below threshold
            "confidence" : float – raw softmax confidence (0–1)
            "all_scores" : dict  – {gloss: confidence} for every class
        """
        if not self._frame_buffer:
            return {"word": "", "confidence": 0.0, "all_scores": {}}

        seq = np.array(self._frame_buffer, dtype=np.float32)
        seq = self._normalize_sequence(seq)
        seq = self._pad_or_truncate(seq)
        seq = np.expand_dims(seq, axis=0)   # → (1, 30, 1662)

        preds      = self._model.predict(seq, verbose=0)[0]
        pred_id    = int(np.argmax(preds))
        confidence = float(preds[pred_id])
        word       = self._id_to_gloss.get(pred_id, "Unknown")

        all_scores = {
            self._id_to_gloss.get(i, str(i)): float(preds[i])
            for i in range(len(preds))
        }

        return {
            "word":       word if confidence >= self.confidence_thresh else "",
            "confidence": confidence,
            "all_scores": all_scores,
        }

    def clear(self):
        """Clear the frame buffer — call after predict() to start fresh."""
        self._frame_buffer.clear()

    def close(self):
        """Release MediaPipe resources."""
        if self._holistic is not None:
            self._holistic.close()
            self._holistic = None

    # ── context manager support ───────────────────────────────
    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()

    # ── internal helpers ──────────────────────────────────────

    def _extract_landmarks(self, results) -> np.ndarray:
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

    def _normalize_sequence(self, sequence: np.ndarray) -> np.ndarray:
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

    def _pad_or_truncate(self, seq: np.ndarray) -> np.ndarray:
        if len(seq) < self.sequence_length:
            pad = np.zeros(
                (self.sequence_length - len(seq), TOTAL_COORDS), dtype=np.float32)
            return np.vstack([seq, pad])
        return seq[:self.sequence_length]