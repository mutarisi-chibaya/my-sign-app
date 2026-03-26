import cv2
import numpy as np
import base64
import io
from PIL import Image

def base64_to_cv2(b64_string):
    """
    Converts a Base64 image string (from React/WebSockets) 
    into a standard OpenCV BGR image.
    """
    try:
        # 1. Remove the header if it exists (e.g., "data:image/jpeg;base64,")
        if "," in b64_string:
            _, data = b64_string.split(",", 1)
        else:
            data = b64_string

        # 2. Decode the base64 string to bytes
        img_bytes = base64.b64decode(data)

        # 3. Convert bytes to a NumPy array
        nparr = np.frombuffer(img_bytes, np.uint8)

        # 4. Decode the array into an OpenCV image (BGR)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        return img
    except Exception as e:
        print(f"Image Helper Error: {e}")
        return None

def prepare_image_for_mediapipe(cv2_img):
    """
    MediaPipe requires RGB, while OpenCV defaults to BGR.
    This helper ensures the colors are flipped correctly.
    """
    if cv2_img is None:
        return None
    return cv2.cvtColor(cv2_img, cv2.COLOR_BGR2RGB)

def resize_for_performance(cv2_img, width=640):
    """
    If the user's camera is 4K or 1080p, MediaPipe will lag.
    Resizing to 640px wide significantly speeds up the AI pipeline.
    """
    if cv2_img is None:
        return None
        
    height, old_width = cv2_img.shape[:2]
    aspect_ratio = height / old_width
    new_height = int(width * aspect_ratio)
    
    return cv2.resize(cv2_img, (width, new_height), interpolation=cv2.INTER_AREA)

def get_raw_bytes(b64_string):
    """
    Useful for your detectFromImageBytes functions which 
    expect a list of raw byte objects.
    """
    if "," in b64_string:
        _, data = b64_string.split(",", 1)
    else:
        data = b64_string
    return base64.b64decode(data)