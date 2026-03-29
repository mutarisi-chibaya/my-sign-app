1. Backend Setup (Python)
Navigate to the backend directory and set up your environment:

cd backend

# Install dependencies
pip install -r requirements.txt

2. Environment Configuration
Create a .env file in the backend/ directory and add your credentials:

# backend/.env
GROQ_API_KEY=your_groq_api_key_here
PORT=8000
HOST=127.0.0.1


Running the Application
To get the full system running, you will need two terminal windows:

first npm install in root directory

Terminal 1:
npm run dev

Terminal 2:
cd backend
uvicorn lynkSign:app --host 0.0.0.0 --port 8000 --reload