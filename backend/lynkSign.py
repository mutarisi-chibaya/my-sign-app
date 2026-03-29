import os
import asyncio
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from engine import engine as SignEngine
from translator import TextProcessor
from dotenv import load_dotenv

# --- 1. INITIALIZATION ---
load_dotenv()
app = FastAPI(title="LynkSign AI Core")
GROQ_KEY = "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"

# --- 2. CORS SETUP ---
# Ensures your React frontend (usually port 3000) can talk to this FastAPI server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 3. MODELS & DATA STRUCTURES ---
class SpeechRequest(BaseModel):
    text: str
    from_lang: str  # 'sn', 'zu', 'xh', 'af', 'en'

# --- 4. GLOBAL INSTANCES ---
print("⏳ Loading AI Models and SignEngine...")
try:
    # Initialize the CV Engine (MediaPipe + LSTM/TCN)
    engine_instance = SignEngine()
    print("🚀 SignEngine: Ready!")
except Exception as e:
    print(f"❌ CRITICAL ERROR: Could not load SignEngine: {e}")
    engine_instance = None

# Initialize the TextProcessor (Llama 3.3 via Groq)
text_processor = TextProcessor(groq_key=GROQ_KEY)

# --- 5. REST ENDPOINTS ---

@app.get("/health")
async def health():
    """System check for the frontend HUD status."""
    return {
        "status": "online", 
        "engine_loaded": engine_instance is not None,
        "llm_active": GROQ_KEY is not None
    }

@app.post("/translate-speech")
async def translate_speech(request: SpeechRequest):
    """
    SPEECH-TO-SIGN PIVOT:
    Converts native text (e.g., Shona) into English ASL Glosses.
    Used by the Avatar Synthesis module.
    """
    print(f"🎙️ [Speech-to-Sign] Input: '{request.text}' Source: {request.from_lang}")
    
    # Run the LLM translation in a separate thread to keep FastAPI responsive
    gloss = await asyncio.to_thread(
        text_processor.translate_to_gloss, 
        request.text, 
        request.from_lang
    )
    
    print(f"✨ [Speech-to-Sign] Output Glosses: {gloss}")
    return {"gloss": gloss}

# --- 6. WEBSOCKET FOR REAL-TIME SIGN RECOGNITION ---

@app.websocket("/ws/translate/{mode}")
async def websocket_endpoint(websocket: WebSocket, mode: str):
    """
    SIGN-TO-TEXT STREAM:
    Handles continuous video frames for live sign language translation.
    Modes: 'signToText', 'duoMode'
    """
    await websocket.accept()
    print(f"✅ WebSocket Handshake Successful | Mode: {mode}")

    if engine_instance is None:
        await websocket.send_json({"error": "Engine not initialized"})
        await websocket.close()
        return

    try:
        while True:
            # Receive data packet from React
            data = await websocket.receive_json()

            # --- A. SPECIAL COMMAND: FINALIZE SENTENCE ---
            # Used when user stops signing and wants a polished translation
            if data.get("command") == "FINALIZE_SENTENCE":
                history = data.get("history", [])
                target = data.get("target_lang", "en")
                
                print(f"🧠 [LLM Polisher] History: {history} -> Target: {target}")
                
                # Convert raw sign glosses into natural spoken language
                result = await asyncio.to_thread(
                    text_processor.polish_and_translate, history, target
                )
                
                await websocket.send_json({"type": "final_result", "data": result})
                continue

            # --- B. STANDARD FRAME PROCESSING ---
            # Process the raw landmarks/keypoints from MediaPipe
            frames = data.get("frames", [])

            if not frames:
                await websocket.send_json({"prediction": "...", "status": "searching"})
                continue

            # Heavy inference logic executed in background thread
            result = await asyncio.to_thread(engine_instance.process_frames, frames, mode)
            
            # Tag as prediction so frontend renders it as 'Live Text'
            result["type"] = "prediction"
            await websocket.send_json(result)

    except WebSocketDisconnect:
        print(f"🔌 Client disconnected from {mode} stream.")
    except Exception as e:
        print(f"⚠️ Stream Error: {e}")
        try:
            await websocket.send_json({"error": str(e)})
        except:
            pass

# --- 7. SERVER START ---
if __name__ == "__main__":
    # Note: 'lynkSign:app' assumes this file is named lynkSign.py
    print("📡 Starting LynkSign Core on http://127.0.0.1:8000")
    uvicorn.run("lynkSign:app", host="127.0.0.1", port=8000, reload=True)