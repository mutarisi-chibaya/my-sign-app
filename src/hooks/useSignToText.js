import { useState, useRef, useEffect, useCallback } from 'react';
import { initSignSocket, sendFrameBatch, disconnectSocket } from '../utils/utils';

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
      frameBuffer.current = [];
      setStatus('idle');
      isSocketReady.current = false;
      disconnectSocket(); 
    }
  }, [status]);

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
    if (status !== 'idle') {
      isSocketReady.current = false; // Block until connected/heartbeat

      initSignSocket(activeMode, (result) => {
        isSocketReady.current = true; 

        let val = result.prediction || result.letter || result.word;
        if (val && val.toLowerCase() === "space") val = " ";

        const forbiddenValues = ["...", "READY", "Unknown", ""];
        
        if (val && !forbiddenValues.includes(val)) {
          setDetectedHistory(prev => {
            // MODE-SPECIFIC FILTERING
            if (activeMode === 'glosses') {
              // Strictly block repeating words like "Hello Hello"
              if (prev.length > 0 && prev[prev.length - 1].trim() === val.trim()) {
                return prev; 
              }
              return [...prev, val + " "]; // Add space for words
            }

            // Alphabet/Numbers: Allow repeats like "77" or "PP"
            return [...prev, val]; 
          });

          const rawConf = result.confidence || result.confidenceLetter || 0;
          setAccuracy(rawConf > 1 ? Math.round(rawConf) : Math.round(rawConf * 100));
        }
        
        // Always revert to 'recording' after processing a result
        setStatus(current => current === 'idle' ? 'idle' : 'recording'); 
      });

      // DEADLOCK FIX: Force ready after 500ms to allow first batch
      const readyTimer = setTimeout(() => {
        if (status !== 'idle') isSocketReady.current = true;
      }, 500);

      return () => {
        clearTimeout(readyTimer);
        isSocketReady.current = false;
        disconnectSocket();
      };
    }
  }, [activeMode, status === 'idle']); 

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