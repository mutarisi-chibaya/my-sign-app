import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  processTextToSign, 
  startSpeechRecognition, 
  stopSpeechRecognition,
  processImageToSign, 
  initSignSocket, 
  sendFrameBatch, 
  disconnectSocket,
  finalizeSignSentence
} from '../utils/utils';

export const useDuoMode = () => {
  const [liveText, setLiveText] = useState("");
  const [signerStatus, setSignerStatus] = useState('idle');
  const [signerText, setSignerText] = useState("");
  const [accuracy, setAccuracy] = useState(0);
  const [speakerStatus, setSpeakerStatus] = useState('idle');
  const [speakerText, setSpeakerText] = useState("");
  const [manualText, setManualText] = useState(""); 
  const [replayTrigger, setReplayTrigger] = useState(0);
  const [activeMode, setActiveMode] = useState('alpha');
  const isSocketReady = useRef(false);
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const frameBuffer = useRef([]);

  // --- WebSocket & Translation Logic ---
  useEffect(() => {
    if (signerStatus !== 'idle') {
      isSocketReady.current = false;

      initSignSocket(activeMode, (result) => {
        // --- A. NEW: HANDLE POLISHED LLM RESULT ---
        if (result.type === "final_result") {
          console.log("✨ DuoMode Polished Sentence:", result.data.translated);
          
          // Overwrite the messy glosses with the beautiful sentence
          setSignerText(result.data.translated); 
          setAccuracy(100);
          
          // Trigger TTS for the polished sentence automatically if you like
          speakText(result.data.translated);

          // Now we are truly done
          setSignerStatus('idle');
          disconnectSocket();
          return;
        }

        // --- B. EXISTING PREDICTION LOGIC ---
        isSocketReady.current = true;

        if (result.status === 'collecting') {
          setSignerStatus(current => current === 'idle' ? 'idle' : 'recording');
          return;
        }

        let val = result.prediction || result.letter || result.word;
        const forbiddenValues = ["...", "READY", "Unknown", ""];

        if (val && !forbiddenValues.includes(val)) {
          const formattedVal = val.toLowerCase() === "space" ? " " : val;
          setSignerText(prev => {
            const separator = activeMode === 'glosses' ? " " : "";
            if (activeMode === 'glosses') {
              const words = prev.trim().split(" ");
              const lastWord = words[words.length - 1];
              if (lastWord === formattedVal.trim()) return prev;
            }
            return prev + formattedVal + separator;
          });

          const rawConf = result.confidence || 0;
          setAccuracy(rawConf > 1 ? Math.round(rawConf) : Math.round(rawConf * 100));
        }

        setSignerStatus(current => current === 'idle' ? 'idle' : 'recording');
      });

      const timer = setTimeout(() => {
        if (signerStatus !== 'idle') isSocketReady.current = true;
      }, 500);

      return () => {
        clearTimeout(timer);
        isSocketReady.current = false;
        disconnectSocket();
      };
    }
  }, [activeMode, signerStatus === 'idle']);

  // --- Frame Capture Logic ---
  const captureFrame = useCallback((frameCount = 20) => {
    if (!videoRef.current || !canvasRef.current || signerStatus !== 'recording' || !isSocketReady.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (video.readyState < 2) return;

    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const frameData = canvas.toDataURL('image/jpeg', 0.4);
    frameBuffer.current.push(frameData);

    if (frameBuffer.current.length >= frameCount) {
      const framesToSend = [...frameBuffer.current];
      frameBuffer.current = [];
      setSignerStatus('processing');
      sendFrameBatch(framesToSend);
    }
  }, [signerStatus]);

  // --- Camera Hardware Initialization ---
  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: 640, height: 480 } 
        });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (err) { 
        console.error("Camera Hardware Error:", err); 
      }
    };
    startCamera();
    return () => streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  // --- Text-to-Speech (TTS) ---
  const speakText = (text) => {
    if (!text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };

  // --- Speaker Side Handlers (Mic, Input, Image) ---
  const handleToggleSpeakerMic = async () => {
    if (speakerStatus === 'recording') {
      stopSpeechRecognition();
      setSpeakerText(liveText || "");
      setSpeakerStatus('idle');
    } else {
      setLiveText("");
      setSpeakerText("");
      setSpeakerStatus('recording');
      try {
        await startSpeechRecognition((text) => setLiveText(text));
      } catch (error) {
        setSpeakerStatus('error');
      }
    }
  };

  const handleManualSend = async () => {
    if (!manualText.trim()) return;
    setSpeakerStatus('processing');
    try {
      const result = await processTextToSign(manualText);
      setSpeakerText(result);
      setManualText("");
      setSpeakerStatus('idle');
    } catch (error) {
      setSpeakerStatus('error');
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSpeakerStatus('processing');
    setSpeakerText("");
    try {
      const result = await processImageToSign(file);
      if (result) {
        setSpeakerText(result);
        setSpeakerStatus('idle');
      }
    } catch (error) {
      setSpeakerStatus('error');
      setSpeakerText("Failed to read image text.");
    } finally {
      e.target.value = null;
    }
  };

  const handleReplay = () => {
    speakText(speakerText);
    setReplayTrigger(prev => prev + 1);
  };

  const handleStopSigner = useCallback(() => {
    if (signerText.trim()) {
      // 1. Change status to processing so the UI shows a loader/spinner
      setSignerStatus('processing');

      // 2. Since DuoMode uses a string 'signerText', we convert it back to an array for the backend
      const historyArray = signerText.trim().split(" ");
      
      // 3. Request the polish
      finalizeSignSentence(historyArray);
      
      console.log("🧠 DuoMode: Requesting final polish for:", historyArray);

      // We DO NOT set status to 'idle' or disconnect here. 
      // The socket listener above will handle that when the result arrives.
    } else {
      // If nothing was signed, just close up shop
      setSignerStatus('idle');
      disconnectSocket();
    }
    
    frameBuffer.current = [];
    setAccuracy(0);
  }, [signerText, activeMode]);

  const handleModeChange = useCallback((newMode) => {
    // Stay in current state but wipe buffer so old frames don't leak
    setSignerStatus(prev => (prev === 'idle' ? 'idle' : 'recording'));
    frameBuffer.current = [];
    setAccuracy(0);
    // Kill socket so useEffect restarts it fresh with the new mode
    isSocketReady.current = false;
    disconnectSocket();
    setActiveMode(newMode);
  }, []);

  return {
    state: { 
      liveText, 
      signerStatus, 
      accuracy, 
      signerText, 
      speakerStatus, 
      speakerText, 
      manualText, 
      replayTrigger, 
      activeMode 
    },
    refs: { 
      videoRef, 
      fileInputRef, 
      canvasRef 
    },
    actions: { 
      setSignerStatus, 
      setSignerText, 
      setManualText, 
      speakText, 
      handleToggleSpeakerMic, 
      handleManualSend, 
      handleImageUpload, 
      handleReplay, 
      setActiveMode, 
      captureFrame,
      handleStopSigner,
      handleModeChange
    }
  };
};