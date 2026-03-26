import os
import cv2
import numpy as np
import pandas as pd
import tensorflow as tf
import mediapipe as mp

# --- DYNAMIC PATH RESOLUTION ---
# Finds the absolute path to your 'backend' folder
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(BASE_DIR, 'models')

# Define absolute paths for the Word model and CSV mapping
MODEL_PATH = os.path.join(MODELS_DIR, 'best_sign_classifier_model_40_words_seq90.keras')
CSV_PATH = os.path.join(MODELS_DIR, 'wlasl_40_words_personal_final_processed_data_augmented_seq90.csv')

# --- CONFIGURATION ---
SEQUENCE_LENGTH = 30  # Standardized sequence length for LSTM input
EXPECTED_COORDS = 1662
CONFIDENCE_THRESHOLD = 0.7

# --- MODEL & DATA LOADING ---
if not os.path.exists(MODEL_PATH):
    raise FileNotFoundError(f"❌ Word model not found at: {MODEL_PATH}")
if not os.path.exists(CSV_PATH):
    raise FileNotFoundError(f"❌ CSV mapping file not found at: {CSV_PATH}")

# Load the trained Keras model
model = tf.keras.models.load_model(MODEL_PATH)

# Load the CSV to map model indices back to English words (Glosses)
df = pd.read_csv(CSV_PATH)
unique_glosses = df['gloss'].unique()
id_to_gloss = {i: g for i, g in enumerate(unique_glosses)}

# --- MEDIAPIPE HOLISTIC SETUP ---
mp_holistic = mp.solutions.holistic.Holistic(
    static_image_mode=False,
    model_complexity=1,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

# Coordinate Counts for Normalization (Pose, Left Hand, Right Hand, Face)
NUM_POSE = 33 * 4
NUM_HAND = 21 * 3
NUM_FACE = 468 * 3

def normalize_landmarks(frame_lms):
    """
    Translates landmarks to origin (0,0,0) and scales them.
    Ensures 'distance from camera' doesn't break the model.
    """
    if np.all(frame_lms == 0):
        return np.zeros(EXPECTED_COORDS, dtype=np.float32)

    # Split the flat array back into anatomical parts
    parts = [
        (frame_lms[0:NUM_POSE], 4),                                  # Pose (x, y, z, visibility)
        (frame_lms[NUM_POSE : NUM_POSE + NUM_HAND], 3),              # Left Hand (x, y, z)
        (frame_lms[NUM_POSE + NUM_HAND : NUM_POSE + NUM_HAND*2], 3), # Right Hand (x, y, z)
        (frame_lms[NUM_POSE + NUM_HAND*2 : ], 3)                     # Face (x, y, z)
    ]

    normalized_parts = []
    for flat_lms, coords_per_lm in parts:
        if np.all(flat_lms == 0):
            normalized_parts.append(flat_lms)
            continue
        
        # Reshape to (Landmarks, Coords)
        lms_array = flat_lms.reshape(-1, coords_per_lm)
        coords_for_mean = lms_array[:, :3] # Use X, Y, Z for geometric center
        
        mean_coords = np.mean(coords_for_mean, axis=0)
        translated = lms_array.copy()
        translated[:, :3] -= mean_coords
        
        # Scale normalization based on the maximum distance from the center
        scale = np.max(np.linalg.norm(translated[:, :3], axis=1))
        if scale > 1e-6:
            translated[:, :3] /= scale
            
        normalized_parts.append(translated.flatten())

    return np.concatenate(normalized_parts).astype(np.float32)

def process_word_sequence(sequence_bytes):
    """
    Main entry point for Word (Gloss) mode.
    Converts a batch of frames -> landmarks -> normalization -> prediction.
    """
    sequence_data = []

    for img_bytes in sequence_bytes:
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None: continue

        # MediaPipe expects RGB
        results = mp_holistic.process(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
        
        frame_lms = np.zeros(EXPECTED_COORDS, dtype=np.float32)
        
        # 1. Extract Pose (33 points)
        if results.pose_landmarks:
            p = [[lm.x, lm.y, lm.z, lm.visibility] for lm in results.pose_landmarks.landmark]
            frame_lms[0:NUM_POSE] = np.array(p).flatten()
            
        # 2. Extract Hands (21 points each)
        if results.left_hand_landmarks:
            lh = [[lm.x, lm.y, lm.z] for lm in results.left_hand_landmarks.landmark]
            frame_lms[NUM_POSE : NUM_POSE + NUM_HAND] = np.array(lh).flatten()
            
        if results.right_hand_landmarks:
            rh = [[lm.x, lm.y, lm.z] for lm in results.right_hand_landmarks.landmark]
            frame_lms[NUM_POSE + NUM_HAND : NUM_POSE + NUM_HAND*2] = np.array(rh).flatten()
            
        # 3. Extract Face (468 points)
        if results.face_landmarks:
            f = [[lm.x, lm.y, lm.z] for lm in results.face_landmarks.landmark]
            frame_lms[NUM_POSE + NUM_HAND*2 : ] = np.array(f).flatten()

        # 4. Normalize landmarks for this specific frame
        sequence_data.append(normalize_landmarks(frame_lms))

    if not sequence_data:
        return {"word": "Unknown", "confidence": 0.0}

    # --- TEMPORAL HANDLING (30 Frames) ---
    seq_np = np.array(sequence_data, dtype=np.float32)
    
    # Pad with zeros if sequence is short; truncate if too long
    if len(seq_np) < SEQUENCE_LENGTH:
        padding = np.zeros((SEQUENCE_LENGTH - len(seq_np), EXPECTED_COORDS))
        seq_np = np.vstack((seq_np, padding))
    else:
        seq_np = seq_np[:SEQUENCE_LENGTH, :]

    # Reshape for LSTM: (Batch, Timesteps, Features) -> (1, 30, 1662)
    input_final = np.expand_dims(seq_np, axis=0)
    
    # Inference
    preds = model.predict(input_final, verbose=0)
    idx = np.argmax(preds)
    conf = float(np.max(preds))
    word = id_to_gloss.get(idx, "Unknown")

    return {
        "word": word if conf >= CONFIDENCE_THRESHOLD else "READY",
        "confidence": conf
    }