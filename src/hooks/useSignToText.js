import { useState, useRef, useEffect, useCallback } from 'react';
import { initSignSocket, sendFrameBatch, disconnectSocket,finalizeSignSentence } from '../utils/utils';

export const useSignToText = (activeMode, setActiveMode) => {
  const [status, setStatus] = useState('idle');
  const [detectedHistory, setDetectedHistory] = useState([]);
  const [accuracy, setAccuracy] = useState(0);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const frameBuffer = useRef([]);
  const isSocketReady = useRef(false);

  // --- 1. THE SEAMLESS MODE SWITCH FIX ---
  const handleModeChange = useCallback((newMode) => {
    // If we were recording/processing, stay in 'recording'. If idle, stay idle.
    setStatus(prev => (prev === 'idle' ? 'idle' : 'recording'));
    
    // Wipe the buffer so old mode frames don't leak into the new model
    frameBuffer.current = [];
    setAccuracy(0);
    
    // Kill socket immediately so the useEffect can restart it fresh
    isSocketReady.current = false;
    disconnectSocket();
    
    // Update the actual mode state (passed in as a prop or defined in parent)
    if (setActiveMode) setActiveMode(newMode);
  }, [setActiveMode]);

  // --- 2. TOGGLE LOGIC ---
  const toggleRecording = useCallback(() => {
    if (status === 'idle') {
      frameBuffer.current = []; 
      setAccuracy(0);
      setStatus('recording');
    } else {
      if (detectedHistory.length > 0) {
        // 1. Tell the UI we are waiting for the final result
        setStatus('processing'); 
        
        // 2. Send the data to the backend
        finalizeSignSentence(detectedHistory);
        
        // NOTE: We DO NOT call disconnectSocket() here anymore!
        // We wait for the 'onmessage' in the useEffect to receive the data 
        // and THEN it will set status to 'idle' and disconnect.
      } else {
        // If there's no history, just stop normally
        setStatus('idle');
        disconnectSocket();
      }
    }
  }, [status, detectedHistory]);

  // --- 3. CAMERA SETUP ---
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(s => { if (videoRef.current) videoRef.current.srcObject = s; })
      .catch(err => console.error("Camera error:", err));
    
    return () => {
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // --- 4. FRAME CAPTURE ---
  const captureFrame = (frameCount) => {
    // Guard: Don't capture if idle, processing, or socket isn't ready
    if (status !== 'recording' || !isSocketReady.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || video.readyState < 2) return; 

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const frameData = canvas.toDataURL('image/jpeg', 0.4);
    frameBuffer.current.push(frameData);

    if (frameBuffer.current.length >= frameCount) {
      const framesToSend = [...frameBuffer.current];
      frameBuffer.current = []; 
      setStatus('processing');
      sendFrameBatch(framesToSend);
    }
  };

  // --- 5. SOCKET LISTENER ---
  useEffect(() => {
    // Only initialize the socket if we aren't idle
    if (status !== 'idle') {
      isSocketReady.current = false; // Block captureFrame until connected

      initSignSocket(activeMode, (result) => {
        console.log("📡 Socket Result:", result);
        // --- A. HANDLE POLISHED LLM RESULT ---
        // This catches the 'final_result' from your Groq/Llama backend
        if (result.type === "final_result") {
          console.log("✨ Polished Sentence Received:", result.data.translated);
          
          // Replace the messy history list with the single clean sentence
          setDetectedHistory([result.data.translated]); 
          
          // Accuracy is 100% now that it's finalized
          setAccuracy(100);
          
          // Transition back to idle state now that processing is done
          setStatus('idle');
          disconnectSocket(); // Clean up the socket connection
          return; // Exit early; don't process this as a normal prediction
        }

        // --- B. HANDLE REAL-TIME PREDICTIONS ---
        isSocketReady.current = true; 

        // Extract value regardless of backend naming (prediction, letter, or word)
        let val = result.prediction || result.letter || result.word;
        
        if (val) console.log("✋ Predicted Sign:", val);
        // Handle special "Space" token
        if (val && val.toLowerCase() === "space") val = " ";

        const forbiddenValues = ["...", "READY", "Unknown", ""];
        
        if (val && !forbiddenValues.includes(val)) {
          setDetectedHistory(prev => {
            // MODE-SPECIFIC FILTERING
            if (activeMode === 'glosses') {
              // Block repeats for Words (e.g., don't allow "Hello Hello")
              if (prev.length > 0 && prev[prev.length - 1].trim() === val.trim()) {
                return prev; 
              }
              return [...prev, val + " "]; // Add space after words
            }

            // Alphabet/Numbers: Allow repeats (e.g., "77" or "PP")
            return [...prev, val]; 
          });

          // Update Accuracy/Confidence
          const rawConf = result.confidence || result.confidenceLetter || 0;
          setAccuracy(rawConf > 1 ? Math.round(rawConf) : Math.round(rawConf * 100));
        }
        
        // Always revert to 'recording' from 'processing' once a result arrives
        // unless the user manually set the status to 'idle'
        setStatus(current => current === 'idle' ? 'idle' : 'recording'); 
      });

      // --- C. DEADLOCK & CLEANUP ---
      // Force ready after 500ms to allow first batch if handshake is slow
      const readyTimer = setTimeout(() => {
        if (status !== 'idle') isSocketReady.current = true;
      }, 500);

      return () => {
        clearTimeout(readyTimer);
        isSocketReady.current = false;
        disconnectSocket(); // Kill the socket when switching modes or stopping
      };
    }
  }, [activeMode, status === 'idle']); // Re-runs when mode changes or toggle starts

  const clearResults = () => {
    setDetectedHistory([]);
    setAccuracy(0);
  };

  return {
    status, 
    toggleRecording,
    handleModeChange, // <--- Use this for your mode switch buttons
    detectedHistory, 
    setDetectedHistory,
    accuracy, 
    videoRef, 
    canvasRef,
    captureFrame, 
    clearResults
  };
};