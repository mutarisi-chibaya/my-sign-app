import os
import cv2
import numpy as np
import pickle
import tensorflow as tf
import mediapipe as mp

# --- DYNAMIC PATH RESOLUTION ---
# This finds the absolute path to your 'backend' folder
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(BASE_DIR, 'models')

def load_backend_model(model_name):
    path = os.path.join(MODELS_DIR, model_name)
    if not os.path.exists(path):
        raise FileNotFoundError(f"FATAL: Model not found at {path}. Check your folder structure!")
    return tf.keras.models.load_model(path)

# --- MODEL LOADING ---
static_letters_model = load_backend_model('detectLettersModel.keras')

with open(os.path.join(MODELS_DIR, 'labelEncoder.pickle'), 'rb') as f:
    label_encoder = pickle.load(f)

# For JZ_model subfolder
jz_model_path = os.path.join(MODELS_DIR, 'JZ_model', 'JZModel.keras')
jz_dynamic_model = tf.keras.models.load_model(jz_model_path)

with open(os.path.join(MODELS_DIR, 'JZ_model', 'labelEncoder.pickle'), 'rb') as f:
    jz_label_encoder = pickle.load(f)

numbers_model = load_backend_model('detectNumbersModel.keras')

with open(os.path.join(MODELS_DIR, 'numLabelEncoder.pickle'), 'rb') as f:
    num_label_encoder = pickle.load(f)

# --- MEDIAPIPE SETUP ---
mp_hands = mp.solutions.hands.Hands(
    static_image_mode=True, 
    max_num_hands=1, 
    min_detection_confidence=0.5
)

def extract_hand_features(image_bytes, sequence_mode=False):
    """
    Decodes image and extracts normalized landmarks.
    sequence_mode=True returns 63 features (for J/Z)
    sequence_mode=False returns 42 features (for Static A-Z/0-9)
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None: return None

    img_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    results = mp_hands.process(img_rgb)

    if not results.multi_hand_landmarks:
        return None

    hand_lms = results.multi_hand_landmarks[0]
    x_list, y_list = [], []
    for lm in hand_lms.landmark:
        x_list.append(lm.x)
        y_list.append(lm.y)

    data_aux = []
    for lm in hand_lms.landmark:
        # Normalization: relative to the bounding box of the hand
        data_aux.append(lm.x - min(x_list))
        data_aux.append(lm.y - min(y_list))
        if sequence_mode:
            data_aux.append(lm.z) # J/Z model usually needs Z-depth

    return data_aux

def interpolate_sequence(processed_sequence):
    """Fills in missing frames where MediaPipe failed to detect a hand."""
    for i in range(len(processed_sequence)):
        if processed_sequence[i] is None:
            prev_idx = next((j for j in range(i-1, -1, -1) if processed_sequence[j] is not None), -1)
            next_idx = next((j for j in range(i+1, len(processed_sequence)) if processed_sequence[j] is not None), -1)
            
            if prev_idx != -1 and next_idx != -1:
                t = (i - prev_idx) / (next_idx - prev_idx)
                processed_sequence[i] = (np.array(processed_sequence[prev_idx]) + 
                                        (np.array(processed_sequence[next_idx]) - 
                                         np.array(processed_sequence[prev_idx])) * t).tolist()
            elif prev_idx != -1:
                processed_sequence[i] = processed_sequence[prev_idx]
            elif next_idx != -1:
                processed_sequence[i] = processed_sequence[next_idx]
    return processed_sequence

def detect_fingerspelling(sequence_bytes_list, mode="alpha"):
    """
    Main entry point for Alphabet and Number modes.
    Handles static snapshots and dynamic J/Z sequences.
    """
    num_frames = len(sequence_bytes_list)
    
    # 1. HANDLE STATIC PREDICTION (Last Frame)
    # Most alphabets and all numbers are predicted from the final hand pose
    last_frame_features = extract_hand_features(sequence_bytes_list[-1], sequence_mode=False)
    
    if last_frame_features is None:
        return {"letter": "", "confidence": 0.0}

    input_static = np.array(last_frame_features, dtype=np.float32).reshape(1, 42)
    
    if mode == "num":
        preds = numbers_model.predict(input_static, verbose=0)
        idx = np.argmax(preds)
        return {"number": str(num_label_encoder.inverse_transform([idx])[0]), "confidence": float(np.max(preds))}

    # 2. HANDLE ALPHABETS (With J/Z Check)
    preds_static = static_letters_model.predict(input_static, verbose=0)
    idx_static = np.argmax(preds_static)
    label_static = str(label_encoder.inverse_transform([idx_static])[0])
    conf_static = float(np.max(preds_static))

    # If the static model thinks it's I or Z (common confusion for J/Z), trigger the sequence model
    if label_static in ['J', 'Z', 'I'] and num_frames >= 10:
        sequence_features = [extract_hand_features(b, sequence_mode=True) for b in sequence_bytes_list]
        clean_sequence = interpolate_sequence(sequence_features)
        
        if None not in clean_sequence:
            # Reshape to (Batch, Frames, Features) -> (1, 20, 63)
            input_dynamic = np.array(clean_sequence, dtype=np.float32).reshape(1, num_frames, 63)
            preds_dynamic = jz_dynamic_model.predict(input_dynamic, verbose=0)
            idx_dyn = np.argmax(preds_dynamic)
            label_dyn = str(jz_label_encoder.inverse_transform([idx_dyn])[0])
            conf_dyn = float(np.max(preds_dynamic))
            
            if conf_dyn > 0.7:
                return {"letter": label_dyn, "confidence": conf_dyn}

    return {"letter": label_static, "confidence": conf_static}