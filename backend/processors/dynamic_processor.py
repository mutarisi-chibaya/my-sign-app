import numpy as np
import tensorflow as tf
import mediapipe as mp
import pickle

# --- SETTINGS ---
SEQUENCE_LENGTH = 10  # Matches your numFrames >= 10 logic
FEATURE_DIM = 63      # 21 landmarks * 3 coordinates (x, y, z)

# --- MODEL LOADING ---
jz_model = tf.keras.models.load_model('../models/JZ_moedel/JZModel.keras')
with open('../models/jz_model/labelEncoder.pickle', 'rb') as f:
    jz_label_encoder = pickle.load(f)

def interpolate_landmarks(sequence):
    """
    Fills in None values by calculating the average position 
    between the previous and next known frames.
    """
    for i in range(len(sequence)):
        if sequence[i] is None:
            prev_idx = -1
            for j in range(i - 1, -1, -1):
                if sequence[j] is not None:
                    prev_idx = j
                    break
            
            next_idx = -1
            for j in range(i + 1, len(sequence)):
                if sequence[j] is not None:
                    next_idx = j
                    break
            
            if prev_idx != -1 and next_idx != -1:
                prev_data = np.array(sequence[prev_idx])
                next_data = np.array(sequence[next_idx])
                t = (i - prev_idx) / (next_idx - prev_idx)
                sequence[i] = (prev_data + (next_data - prev_data) * t).tolist()
            elif prev_idx != -1:
                sequence[i] = sequence[prev_idx]
            elif next_idx != -1:
                sequence[i] = sequence[next_idx]
    return sequence

def process_dynamic_sign(sequence_landmarks):
    """
    Takes a list of landmark arrays, interpolates, 
    reshapes, and predicts J or Z.
    """
    # 1. Fill missing frames
    clean_sequence = interpolate_landmarks(sequence_landmarks)
    
    # 2. Check if we have enough data after interpolation
    if None in clean_sequence or len(clean_sequence) < SEQUENCE_LENGTH:
        return {"letter": "", "confidence": 0.0}

    # 3. Shape for LSTM: (1, Frames, 63)
    # We take exactly the number of frames the model expects
    input_data = np.array(clean_sequence[:SEQUENCE_LENGTH], dtype=np.float32)
    input_data = input_data.reshape(1, SEQUENCE_LENGTH, FEATURE_DIM)

    # 4. Predict
    prediction = jz_model.predict(input_data, verbose=0)
    idx = np.argmax(prediction, axis=1)[0]
    confidence = float(np.max(prediction))
    
    label = jz_label_encoder.inverse_transform([idx])[0]
    
    return {
        "letter": label if confidence >= 0.6 else "",
        "confidence": confidence
    }