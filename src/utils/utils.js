import Tesseract from 'tesseract.js';

/**
 * 1. Process Typed Text
 * Simple passthrough for now, but can be used for text sanitization or 
 * mapping slang to official sign language words.
 */
export const processTextToSign = async (text) => {
  // 1. Remove special characters so "Hello!" becomes "Hello"
  // 2. Trim extra whitespace
  // 3. This ensures when the Model splits by space, it doesn't get empty strings
  const cleanText = text.replace(/[^a-zA-Z0-9\s]/g, "").trim();
  return cleanText;
};

/**
 * 2. Process Uploaded Image (OCR)
 * Extracts text from an image file using Tesseract.js.
 */
export const processImageToSign = async (imageFile) => {
  try {
    const { data: { text } } = await Tesseract.recognize(
      imageFile,
      'eng'
    );

    // Clean OCR artifacts: keep only letters, numbers, and spaces
    return text.replace(/[^a-zA-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  } catch (error) {
    console.error("OCR Error:", error);
    throw new Error("Failed to read text from image.");
  }
};

/**
 * 3. Speech Recognition (Web Speech API)
 * Listens to microphone and returns text stream to the XBot via the onResult callback.
 */
// In your utils.js
let recognition; // Keep a reference outside the function

// utils.js logic
export const startSpeechRecognition = (onResult) => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    let finalTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      finalTranscript += event.results[i][0].transcript;
    }
    // This sends the full string to our liveTranscript.current
    onResult(finalTranscript.trim()); 
  };

  recognition.start();
  window._recognition = recognition; // Simple global ref for the stop function
};

export const stopSpeechRecognition = () => {
  if (window._recognition) {
    window._recognition.stop();
  }
};

/**
 * Utility functions for Sign Language Processing
 * Handles Alphabet, Number, and Gloss (Word) Recognition
 */

// --- socketUtils.js ---

let socket = null;

/**
 * Initialize the WebSocket connection based on the mode
 * @param {String} mode - 'alpha', 'num', or 'glosses'
 * @param {Function} onResult - Callback function for when AI returns data
 */
export const initSignSocket = (mode, onResult) => {
  // Close existing socket if switching modes
  if (socket) socket.close();

  // Connect to the FastAPI WebSocket endpoint
  socket = new WebSocket(`ws://localhost:8000/ws/translate/${mode}`);

  socket.onopen = () => console.log(`🚀 Connected to AI Stream: ${mode}`);
  
  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    onResult(data); // Send result back to React component
  };

  socket.onerror = (err) => console.error("Socket Error:", err);
  socket.onclose = () => console.log("🔌 AI Stream Disconnected");
};

/**
 * Send a batch of frames via the open socket
 * @param {Array} frames - Array of Blobs (Binary) or Base64
 */
export const sendFrameBatch = (frames) => {
  // 1. Safety Check: Don't send if the array is empty
  if (!frames || frames.length === 0) return;

  // 2. State Check: 1 means OPEN. 0 means CONNECTING.
  if (socket && socket.readyState === WebSocket.OPEN) {
    const payload = JSON.stringify({ frames: frames }); 
    socket.send(payload);
    console.log(`🚀 Sent batch of ${frames.length} to AI`);
  } 
  else if (socket && socket.readyState === WebSocket.CONNECTING) {
    // This is the "State: 0" you saw. We just wait for the next interval.
    console.warn("⏳ Socket still connecting... skipping this batch.");
  }
  else {
    // This is State: 2 (CLOSING) or 3 (CLOSED)
    console.error("❌ Socket is closed or dead. State:", socket?.readyState);
  }
};

// Cleanup function for when component unmounts
export const disconnectSocket = () => {
  if (socket) socket.close();
};