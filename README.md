To ensure the AI models and 3D rendering engine run correctly, please verify your environment matches these versions:

Python 3.11.0: Required for compatibility with tensorflow==2.19.0 and mediapipe.

Node.js v24.11.1: Required for the React frontend and @react-three/fiber animations.

Git LFS (Large File Storage): CRITICAL. You must have Git LFS installed to pull the actual Keras (.keras / .h5) model files. Without this, Git will only download small "pointer" files, and the backend will fail to load the model.

1. Backend Setup (Python)
in the root directory

# Install dependencies
pip install -r requirements.txt

2. Environment Configuration
Create a .env file in the backend/ directory and add your credentials:

# backend/.env
GROQ_API_KEY=your_groq_api_key_here
PORT=8000
HOST=127.0.0.1

the key will be in the zip sentences


Running the Application
To get the full system running, you will need two terminal windows:

first npm install in root directory

Terminal 1:
npm run dev

Terminal 2:
cd backend
uvicorn lynkSign:app --host 0.0.0.0 --port 8000 --reload