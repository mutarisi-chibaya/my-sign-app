from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from engine import engine as SignEngine  # Import the class
import json

app = FastAPI()

# --- INITIALIZE THE ENGINE INSTANCE ---
# This creates one instance of your AI models when the server starts
engine_instance = SignEngine()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.websocket("/ws/translate/{mode}")
async def websocket_endpoint(websocket: WebSocket, mode: str):
    await websocket.accept()
    print(f"✅ Connection open. Mode: {mode}")
    
    try:
        while True:
            # Receive data from React
            data = await websocket.receive_json()
            frames = data.get("frames", [])
            
            if not frames:
                continue

            # --- FIX: Use the instance AND the correct method name ---
            # We changed '.predict' to '.process_frames' to match your engine.py
            result = engine_instance.process_frames(frames, mode)
            
            # Send result back to React
            await websocket.send_json(result)

    except WebSocketDisconnect:
        print(f"❌ Client disconnected from {mode} stream")
    except Exception as e:
        print(f"⚠️ Error during processing: {e}")
        # Don't always close the socket on small errors, but print them for debugging
        # await websocket.close() 

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)