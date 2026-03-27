import os
import asyncio
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from engine import engine as SignEngine
from translator import TextProcessor
from dotenv import load_dotenv

app = FastAPI()
load_dotenv()
GROQ_KEY = os.getenv("GROQ_API_KEY")

# --- 1. CORS SETUP ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 2. GLOBAL INSTANCES ---
print("⏳ Loading AI Models and SignEngine...")
try:
    engine_instance = SignEngine()
    print("🚀 SignEngine: Ready!")
except Exception as e:
    print(f"❌ CRITICAL ERROR: Could not load SignEngine: {e}")
    engine_instance = None

# Initialize the TextProcessor (Polisher + Translator)
# Tip: Put your key in a .env file as GROQ_API_KEY

text_processor = TextProcessor(groq_key=GROQ_KEY)

@app.get("/health")
async def health():
    return {"status": "online", "engine_loaded": engine_instance is not None}

@app.websocket("/ws/translate/{mode}")
async def websocket_endpoint(websocket: WebSocket, mode: str):
    await websocket.accept()
    print(f"✅ WebSocket Handshake Successful | Mode: {mode}")

    if engine_instance is None:
        await websocket.send_json({"error": "Engine not initialized"})
        await websocket.close()
        return

    try:
        while True:
            data = await websocket.receive_json()

            # --- 3. SPECIAL COMMAND HANDLING ---
            # If the frontend sends {"command": "FINALIZE_SENTENCE", ...}
            if data.get("command") == "FINALIZE_SENTENCE":
                history = data.get("history", [])
                target = data.get("target_lang", "en") # 'zu', 'af', 'en'
                
                print(f"🧠 Polishing history: {history} to {target}")
                
                # Run LLM + Translation in a separate thread
                result = await asyncio.to_thread(
                    text_processor.polish_and_translate, history, target
                )
                
                # Send back as a specific type so the frontend knows how to handle it
                await websocket.send_json({"type": "final_result", "data": result})
                continue

            # --- 4. STANDARD FRAME PROCESSING ---
            frames = data.get("frames", [])

            if not frames:
                await websocket.send_json({"prediction": "...", "status": "searching"})
                continue

            # Heavy CV math remains non-blocking
            result = await asyncio.to_thread(engine_instance.process_frames, frames, mode)
            
            # Add a type tag so frontend knows this is a real-time prediction
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

if __name__ == "__main__":
    print("📡 Starting Uvicorn Server on http://127.0.0.1:8000")
    uvicorn.run("lynkSign:app", host="127.0.0.1", port=8000, reload=True)