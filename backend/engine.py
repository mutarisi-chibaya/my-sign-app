import base64
import numpy as np
# Import the actual functions from our new processors
from processors.letters_processor import detect_fingerspelling
from processors.words_processor import WordProcessor
from processors.translator import translate_gloss_to_english


class engine:
    def __init__(self):
        self._word_processor = WordProcessor()
        print("🚀 SignEngine: All models and processors linked.")
        self.gloss_buffer = []

    def process_frames(self, frames_base64, mode):
        """
        Decodes frames and routes to the appropriate processor based on UI mode.
        """
        # 1. Decode Base64 strings to raw bytes
        byte_frames = []
        for f in frames_base64:
            try:
                # Handle cases with or without the base64 header
                data = f.split(",")[-1]
                byte_frames.append(base64.b64decode(data))
            except Exception as e:
                print(f"⚠️ Decode Error: {e}")
                continue

        if not byte_frames:
            return {"prediction": "Waiting for feed...", "confidence": 0}

        # 2. ROUTING LOGIC

        # --- ALPHABET & NUMBER MODES ---
        if mode == "alpha" or mode == "num":
            # detect_fingerspelling handles both Static (A-Z, 0-9) and Dynamic (J, Z)
            result = detect_fingerspelling(byte_frames, mode=mode)

            # Map the specific return keys from letters_processor.py
            prediction = result.get('letter') if mode == "alpha" else result.get('number')
            confidence = result.get('confidence', 0)

            return {
                "prediction": prediction or "...",
                "confidence": round(confidence * 100, 1),
                "status": "success"
            }

        # --- GLOSS (WORDS) MODE ---
        elif mode == "glosses":
            # Feed frames into the processor one by one
            for frame_bytes in byte_frames:
                try:
                    self._word_processor.add_frame_from_bytes(frame_bytes)
                except Exception as e:
                    print(f"⚠️ Frame extraction error: {e}")

            # Not enough frames yet — keep collecting
            if not self._word_processor.ready:
                return {
                    "prediction": "...",
                    "confidence": 0,
                    "status": "collecting",
                    "frames": self._word_processor.buffer_size
                }

            # Run inference then clear buffer for next sequence
            result = self._word_processor.predict()
            self._word_processor.clear()

            detected_word = result.get("word", "")
            conf = result.get("confidence", 0)
            print(f"🔍 Detected: '{detected_word}' with confidence {conf:.2f}")
            # Only act if it's a real word and NOT 'READY'
            if detected_word and detected_word not in ["READY", "Unknown", ""]:
              
                return {
                    "prediction": detected_word,
                    "confidence": round(conf * 100, 1),
                    "status": "success"
                }

            # If no new word was found, tell React to wait
            return {"prediction": "...", "confidence": 0, "status": "searching"}

    def reset_buffer(self):
        """Clears the sentence memory so the user can start a new sentence."""
        self.gloss_buffer = []
        self._word_processor.clear()
        print("🧹 Buffer Cleared.")