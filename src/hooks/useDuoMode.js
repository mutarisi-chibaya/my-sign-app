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
import { useOutletContext } from 'react-router-dom';

export const useDuoMode = () => {
  const { selectedLang } = useOutletContext();
  const [liveText, setLiveText] = useState("");
  const [signerStatus, setSignerStatus] = useState('idle');
  const [signerText, setSignerText] = useState("");
  const [accuracy, setAccuracy] = useState(0);
  const [speakerStatus, setSpeakerStatus] = useState('idle');
  const [speakerText, setSpeakerText] = useState("");
  const [manualText, setManualText] = useState(""); 
  const [glossText, setGlossText] = useState("");
  const [replayTrigger, setReplayTrigger] = useState(0);
  const [activeMode, setActiveMode] = useState('alpha');
  const isSocketReady = useRef(false);
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const frameBuffer = useRef([]);

   const speakText = useCallback((text) => {
    if (!text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Map your codes to browser voices
    const langMap = {
      'en': 'en-US',
      'zu': 'zu-ZA',
      'af': 'af-ZA',
      'xh': 'xh-ZA',
      'sn': 'sn-ZW'
    };
    
    utterance.lang = langMap[selectedLang] || 'en-US';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }, [selectedLang]);

  // --- WebSocket & Translation Logic ---
  useEffect(() => {
    if (signerStatus !== 'idle') {
      isSocketReady.current = false;

      initSignSocket(activeMode, (result) => {
        // --- A. NEW: HANDLE POLISHED LLM RESULT ---
        if (result.type === "final_result") {
          console.log("✨ DuoMode Polished Sentence:", result.data.translated);
          const translatedSentence = result.data.translated;
          // Overwrite the messy glosses with the beautiful sentence
          setSignerText(translatedSentence); 
          setAccuracy(100);
          
          // Trigger TTS for the polished sentence automatically if you like
          speakText(translatedSentence);

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
  }, [activeMode, signerStatus === 'idle',speakText]);

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
 

  // --- Speaker Side Handlers (Mic, Input, Image) ---
  const handleToggleSpeakerMic = async () => {
    // 1. STOP RECORDING CASE
    if (speakerStatus === 'recording') {
      stopSpeechRecognition();
      
      if (liveText) {
        // Show exactly what was said (e.g., "Unjani") in the UI
        setSpeakerText(liveText); 
        setSpeakerStatus('processing');
        
        try {
          // Translate the native speech into English Glosses for the Avatar
          const result = await processTextToSign(liveText, selectedLang);
          
          // This is what we pass to the XBot component
          setGlossText(result); 
          setSpeakerStatus('success');
          
          // Optional: Trigger text-to-speech so the user hears the confirmation
          speakText(liveText); 
        } catch (error) {
          console.error("Translation Error:", error);
          setSpeakerStatus('error');
        }
      } else {
        setSpeakerStatus('idle');
      }
    } 
    
    // 2. START RECORDING CASE
    else {
      // Reset states for a fresh session
      setLiveText("");
      setGlossText("");
      setSpeakerText("");
      setSpeakerStatus('recording');

      // Map your short codes (zu, sn) to browser locales (zu-ZA, sn-ZW)
      const langMap = {
        'en': 'en-US',
        'zu': 'zu-ZA',
        'af': 'af-ZA',
        'xh': 'xh-ZA',
        'sn': 'sn-ZW'
      };

      try {
        // This triggers the browser's native speech-to-text
        await startSpeechRecognition((text) => {
          setLiveText(text); // Updates the "Listening..." text in the UI
        }, langMap[selectedLang] || 'en-US'); 
        
      } catch (error) {
        console.error("Mic Start Error:", error);
        setSpeakerStatus('error');
      }
    }
  };

  const handleManualSend = async () => {
    // 1. Validation: Don't send empty text
    if (!manualText.trim()) return;

    const textToProcess = manualText;
    
    // 2. UI Update: Show the typed word in the speaker's bubble
    setSpeakerText(textToProcess); 
    setManualText(""); // Clear the input field for the next message
    setSpeakerStatus('processing');

    try {
      // 3. THE BRIDGE: Convert the typed native word into English Glosses
      // result will be "HOW YOU" if you typed "Unjani"
      const result = await processTextToSign(textToProcess, selectedLang);
      
      // 4. XBOT UPDATE: Send only the English Gloss to the avatar
      setGlossText(result); 
      setSpeakerStatus('success');

      // Optional: Make the computer speak the typed text aloud
      if (typeof speakText === 'function') {
        speakText(textToProcess);
      }
      
    } catch (error) {
      console.error("Manual Send Translation Error:", error);
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
      const historyArray = signerText.trim().split(" ").filter(word => word !== "");
      
      // 3. Request the polish
      finalizeSignSentence(historyArray,selectedLang);
      
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
  }, [signerText, activeMode,selectedLang]);

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
      glossText,
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