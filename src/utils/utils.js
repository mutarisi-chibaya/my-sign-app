import Tesseract from 'tesseract.js';

/**
 * 1. Process Text/Speech to Sign (The Bridge to Python)
 * Now handles translating Native Languages to English Glosses.
 */
export const processTextToSign = async (text, fromLang = 'en') => {
  // If it's already English, we just clean it up locally
  if (fromLang === 'en') {
    return text.replace(/[^a-zA-Z0-9\s]/g, "").trim().toUpperCase();
  }

  // If it's Shona, Zulu, etc., we send it to our Python Backend for Llama 3.3 to Gloss
  try {
    const response = await fetch('http://127.0.0.1:8000/translate-speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        text: text, 
        from_lang: fromLang 
      })
    });
    
    const data = await response.json();
    return data.gloss; // Returns "WANT EAT MEAT"
  } catch (error) {
    console.error("Translation Error:", error);
    return text.toUpperCase(); // Fallback to raw text if backend is down
  }
};

/**
 * 2. Process Uploaded Image (OCR)
 */
export const processImageToSign = async (imageFile) => {
  try {
    const { data: { text } } = await Tesseract.recognize(imageFile, 'eng');
    return text.replace(/[^a-zA-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  } catch (error) {
    console.error("OCR Error:", error);
    throw new Error("Failed to read text from image.");
  }
};

/**
 * 3. Speech Recognition (Web Speech API)
 */
export const startSpeechRecognition = (onResult, langCode = 'en-US') => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("Speech Recognition not supported in this browser.");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = langCode; // <--- Uses the code from the Dropdown (e.g., 'sn-ZW')
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    let finalTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      finalTranscript += event.results[i][0].transcript;
    }
    onResult(finalTranscript.trim()); 
  };

  recognition.start();
  window._recognition = recognition; 
};

export const stopSpeechRecognition = () => {
  if (window._recognition) {
    window._recognition.stop();
  }
};

// --- WebSocket Utilities (Sign-to-Text) ---

let socket = null;

export const initSignSocket = (mode, onResult) => {
  if (socket) socket.close();

  socket = new WebSocket(`ws://localhost:8000/ws/translate/${mode}`);
  window._socket = socket;
  
  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    onResult(data); 
  };

  socket.onopen = () => console.log(`🚀 Connected to AI Stream: ${mode}`);
  socket.onerror = (err) => console.error("Socket Error:", err);
  socket.onclose = () => console.log("🔌 AI Stream Disconnected");
};

export const sendFrameBatch = (frames) => {
  if (!frames || frames.length === 0) return;

  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ frames: frames }));
  } 
};

export const finalizeSignSentence = (text, lang) => {
  if (window._socket && window._socket.readyState === WebSocket.OPEN) {
    const payload = {
      command: "FINALIZE_SENTENCE",
      history: text,
      target_lang: lang // <--- Now uses the selected language for the output!
    };
    window._socket.send(JSON.stringify(payload));
  }
};

// Cleanup function for when component unmounts
export const disconnectSocket = () => {
  if (socket) socket.close();
};