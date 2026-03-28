import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  processTextToSign, 
  startSpeechRecognition, 
  stopSpeechRecognition,
  processImageToSign, 
  initSignSocket, 
  sendFrameBatch, 
  disconnectSocket,
  finalizeSignSentence,
  stopParallelGuard
} from '../utils/utils';
import { useOutletContext } from 'react-router-dom';
import { startEmergencyGuard, stopEmergencyGuard,resumeEmergencyGuard } from '../utils/audioGuard'; 
import { getSharedStream } from '../utils/utils';

export const useDuoMode = () => {
  const [emergencyAlert, setEmergencyAlert] = useState(null);
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
  const [canvasKey, setCanvasKey] = useState(0);
  const isSocketReady = useRef(false);
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const frameBuffer = useRef([]);

  const emergencyHandlerRef = useRef(null);
  const emergencyAlertRef = useRef(null);
  emergencyAlertRef.current = emergencyAlert;

  const handleEmergencyTrigger = useCallback((reason) => {
    if (reason) {
      setEmergencyAlert(reason);
      setSignerStatus('idle');
      setSpeakerStatus('idle');
      disconnectSocket();
      stopSpeechRecognition();

      let emergencyGloss = "DANGER HELP";
      const lower = reason.toLowerCase();
      if (lower.includes("fire") || lower.includes("alarm") || lower.includes("smoke") || lower.includes("siren")) {
        emergencyGloss = "FIRE OUTSIDE EXIT BUILDING NOW";
      } else if (lower.includes("impact") || lower.includes("gunshot") || lower.includes("explosion") || lower.includes("bang")) {
        emergencyGloss = "DANGER EXTREME HIDE STAY QUIET";
      }
      setGlossText(emergencyGloss);

    } else {
      // ✅ Full reset on dismiss + restart guard
      setEmergencyAlert(null);
      setCanvasKey(prev => prev + 1);
      setSpeakerStatus('idle');
      setSignerStatus('idle');
      setReplayTrigger(prev => prev + 1);
      setGlossText("");

    
      resumeEmergencyGuard();
    }
  }, []);

  // ✅ Keep ref updated
  emergencyHandlerRef.current = handleEmergencyTrigger;

  useEffect(() => {
  const initGuard = async () => {
    try {
      const activeStream = await getSharedStream();  // ← add const here
      await startEmergencyGuard(activeStream, (reason, label) => {
        if (label) return;
        emergencyHandlerRef.current(reason);
      });
    } catch (err) {
      console.error("DuoMode Audio Guard Error:", err);
    }
  };

  initGuard();
  return () => {
    stopEmergencyGuard({ fullTeardown: true });
    stopParallelGuard();
  };
}, []);

  const speakText = useCallback((text) => {
    if (!text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const langMap = {
      'en': 'en-US', 'zu': 'zu-ZA', 'af': 'af-ZA', 'xh': 'xh-ZA', 'sn': 'sn-ZW'
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
        if (result.type === "final_result") {
          console.log("✨ DuoMode Polished Sentence:", result.data.translated);
          const translatedSentence = result.data.translated;
          setSignerText(translatedSentence); 
          setAccuracy(100);
          speakText(translatedSentence);
          setSignerStatus('idle');
          disconnectSocket();
          return;
        }

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
  }, [activeMode, signerStatus === 'idle', speakText]);
  
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

  // --- Speaker Side Handlers (Mic, Input, Image) ---
  const handleToggleSpeakerMic = async () => {
    if (emergencyAlertRef.current) return; // ✅ ref

    if (speakerStatus === 'recording') {
      stopSpeechRecognition();

      if (liveText) {
        setSpeakerText(liveText); 
        setSpeakerStatus('processing');
        try {
          const result = await processTextToSign(liveText, selectedLang);
          setGlossText(result); 
          setSpeakerStatus('success');
          speakText(liveText); 
        } catch (error) {
          console.error("Translation Error:", error);
          setSpeakerStatus('error');
        }
      } else {
        setSpeakerStatus('idle');
      }
    } else {
      setLiveText("");
      setGlossText("");
      setSpeakerText("");
      setSpeakerStatus('recording');

      const langMap = {
        'en': 'en-US', 'zu': 'zu-ZA', 'af': 'af-ZA', 'xh': 'xh-ZA', 'sn': 'sn-ZW'
      };

      try {
        startSpeechRecognition((text) => {
          setLiveText(text);
        }, langMap[selectedLang] || 'en-US'); 
      } catch (error) {
        console.error("Mic Start Error:", error);
        setSpeakerStatus('error');
      }
    }
  };

  const handleManualSend = async () => {
    if (!manualText.trim()) return;
    const textToProcess = manualText;
    setSpeakerText(textToProcess); 
    setManualText("");
    setSpeakerStatus('processing');
    try {
      const result = await processTextToSign(textToProcess, selectedLang);
      setGlossText(result); 
      setSpeakerStatus('success');
      if (typeof speakText === 'function') speakText(textToProcess);
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
        const translatedGlosses = await processTextToSign(result, selectedLang);
        setGlossText(translatedGlosses); // ✅ update the gloss
        setReplayTrigger(prev => prev + 1); // ✅ force XBot to re-animate
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

  const clearSignerOutput = () => {
    setSignerText("");
    setAccuracy(0);
    setSignerStatus('idle');
    // Also clear the frame buffer if they were in the middle of recording
    frameBuffer.current = [];
  };

  const clearSpeakerOutput = () => {
    setSpeakerText("");
    setGlossText("");
    setLiveText("");
    setManualText("");
    setSpeakerStatus('idle');
  };

  return {
    state: { 
      canvasKey,
      liveText, 
      signerStatus, 
      emergencyAlert,
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
      handleModeChange,
      clearSignerOutput,
      clearSpeakerOutput,
      simulateFire: () => handleEmergencyTrigger("Manual Test: Fire Alarm Detected"),
      resetSystem: () => handleEmergencyTrigger(null)
    }
  };
};