import Tesseract from 'tesseract.js';
import * as tf from '@tensorflow/tfjs';

const HF_BASE = "https://mutarisi-lynksign.hf.space";

/**
 * 1. Process Text/Speech to Sign (The Bridge to Python)
 * Handles local cleanup or remote Llama 3.3 translation.
 */
export const processTextToSign = async (text, fromLang = 'en') => {
  console.log(`Translating Text: "${text}" from ${fromLang} to Sign Language Glosses... utility.js`);
  if (fromLang === 'en') {
    console.log("No translation needed, normalizing text for signing...");
    return text.replace(/[^a-zA-Z0-9\s]/g, "").trim().toUpperCase();
  }

  try {
    const response = await fetch(`${HF_BASE}/translate-speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        text: text, 
        from_lang: fromLang 
      })
    });
    
    const data = await response.json();
    return data.gloss; 
  } catch (error) {
    console.error("Translation Error:", error);
    return text.toUpperCase(); 
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

  if (window._recognition) {
    window._recognition.stop();
  }

  const recognition = new SpeechRecognition();
  recognition.lang = langCode;
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onstart = () => console.log("🎙️ Speech Recognition Activated");

  recognition.onresult = (event) => {
    let finalTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      finalTranscript += event.results[i][0].transcript;
    }
    onResult(finalTranscript.trim()); 
  };

  recognition.onerror = (event) => console.error("Speech Recognition Error:", event.error);

  try {
    recognition.start();
    window._recognition = recognition; 
  } catch (e) {
    console.error("Failed to start recognition:", e);
  }
};

export const stopSpeechRecognition = () => {
  if (window._recognition) {
    window._recognition.stop();
    window._recognition = null; 
  }
  // NOTE: We no longer stop the sharedStream tracks here. 
  // This allows YAMNet to immediately use the mic once Speech stops.
};

// --- WebSocket Utilities (Sign-to-Text) ---
let socket = null;

export const initSignSocket = (mode, onResult) => {
  if (socket) socket.close();
  socket = new WebSocket(`wss://mutarisi-lynksign.hf.space/ws/translate/${mode}`);
  window._socket = socket;
  
  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    onResult(data); 
  };

  socket.onopen = () => console.log(`🚀 Connected to AI Stream: ${mode}`);
  socket.onclose = () => console.log("🔌 AI Stream Disconnected");
};

export const sendFrameBatch = (frames) => {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ frames: frames }));
  } 
};

export const finalizeSignSentence = (text, lang) => {
  if (window._socket && window._socket.readyState === WebSocket.OPEN) {
    window._socket.send(JSON.stringify({
      command: "FINALIZE_SENTENCE",
      history: text,
      target_lang: lang 
    }));
  }
};

export const disconnectSocket = () => { if (socket) socket.close(); };

// --- Audio & Guard Management ---
let sharedStream = null;

export const getSharedStream = async () => {
  if (sharedStream && sharedStream.active) return sharedStream;

  sharedStream = await navigator.mediaDevices.getUserMedia({ 
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false 
    } 
  });
  return sharedStream;
};

/**
 * REFINED FOR YAMNET:
 * This now just ensures the stream is alive. 
 * YAMNet's Tasks API handles its own AudioContext internally.
 */
export const startParallelGuard = async () => {
  const stream = await getSharedStream();
  console.log("🛡️ Shared Stream Warm for YAMNet");
  return stream;
};

/**
 * Stops any residual manual audio processing.
 */
export const stopParallelGuard = async () => {
  console.log("🛑 Parallel Guard transition skipped (guard stays active)");
};