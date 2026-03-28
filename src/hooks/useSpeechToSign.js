import { useState, useRef, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { 
  processTextToSign, 
  processImageToSign, 
  startSpeechRecognition,
  stopSpeechRecognition,
  getSharedStream,
  stopParallelGuard
} from '../utils/utils';
import { startEmergencyGuard, stopEmergencyGuard } from '../utils/audioGuard'; 

export const useSpeechToSign = () => {
  const { selectedLang } = useOutletContext();
  const [status, setStatus] = useState('idle'); 
  const [transcript, setTranscript] = useState("");
  const [inputText, setInputText] = useState("");
  const [liveText, setLiveText] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [replayTrigger, setReplayTrigger] = useState(0);
  const [originalText, setOriginalText] = useState("");
  const [emergencyAlert, setEmergencyAlert] = useState(null);
  const [currentSound, setCurrentSound] = useState("Silent");
  const fileInputRef = useRef(null);
  const emergencyHandlerRef = useRef(null);
  const emergencyAlertRef = useRef(null);
  emergencyAlertRef.current = emergencyAlert;
 
  const langMap = {
    'en': 'en-US', 'zu': 'zu-ZA', 'af': 'af-ZA', 'xh': 'xh-ZA', 'sn': 'sn-ZW'
  };

  const clearOutput = () => {
    setTranscript("");
    setOriginalText("");
    setLiveText("");
    setInputText(""); // Optional: clear the input field too
    setStatus('idle');
    // If an image was selected, revoke its URL to save memory
    if (selectedImage) {
      URL.revokeObjectURL(selectedImage);
      setSelectedImage(null);
    }
  };

  /**
   * CENTRAL EMERGENCY HANDLER
   * This handles the logic for both the TF.js Guard and the Manual Simulation Button.
   */
  const handleEmergencyTrigger = (reason) => {
    if (reason) {
      let emergencyGloss = "DANGER HELP"; 
      let uiMessage = "Emergency detected. Please stay calm.";
      const lowercaseReason = reason.toLowerCase();

      if (
        lowercaseReason.includes("fire") || 
        lowercaseReason.includes("alarm") || 
        lowercaseReason.includes("smoke") || 
        lowercaseReason.includes("siren")
      ) {
        emergencyGloss = "FIRE OUTSIDE EXIT BUILDING NOW";
        uiMessage = "Fire alarm or siren detected! Please exit the building immediately.";
      } else if (
        lowercaseReason.includes("impact") || 
        lowercaseReason.includes("gunshot") || 
        lowercaseReason.includes("explosion") ||
        lowercaseReason.includes("bang")
      ) {
        emergencyGloss = "DANGER EXTREME HIDE STAY QUIET";
        uiMessage = "Loud impact detected. Please seek cover and stay quiet.";
      }

      setTranscript(emergencyGloss);
      setOriginalText(uiMessage);
      setEmergencyAlert(reason);
      setStatus('error');
      stopSpeechRecognition(); 

    } else {
      // ✅ Full reset on dismiss
      setEmergencyAlert(null);
      setTranscript("");
      setOriginalText("");
      setStatus('idle');
      
      // ✅ Restart the guard after dismiss
      getSharedStream().then(stream => {
        startEmergencyGuard(stream, (reason, label) => {
          if (label) { setCurrentSound(label); return; }
          emergencyHandlerRef.current(reason);
        });
      });
    }
  };

  emergencyHandlerRef.current = handleEmergencyTrigger;


  // --- Initialize Audio Guard ---
  useEffect(() => {
    let activeStream = null;
    const initGuard = async () => {
      try {
        activeStream = await getSharedStream();
        await startEmergencyGuard(activeStream, (reason, label) => {
          if (label) { setCurrentSound(label); return; }
          emergencyHandlerRef.current(reason);
        });
      } catch (err) {
        console.error("Failed to initialize Audio Guard:", err);
      }
    };
    initGuard();
    return () => {
      stopEmergencyGuard();
      stopParallelGuard();
    };
  }, []);

  // --- Cleanup Image URLs ---
  useEffect(() => {
    return () => { if (selectedImage) URL.revokeObjectURL(selectedImage); };
  }, [selectedImage]);

  // --- Translation Actions ---
  const handleSendText = async (e) => {
    if (e) e.preventDefault();
    console.log("1. handleSendText called");
    console.log("2. inputText:", inputText);
    console.log("3. selectedLang:", selectedLang);
    
    if (!inputText.trim()) {
      console.log("BLOCKED: empty input");
      return;
    }

    setOriginalText(inputText);
    setInputText("");
    setStatus('processing');
    
    console.log("4. calling processTextToSign...");
    try {
      const result = await processTextToSign(inputText, selectedLang);
      console.log("5. result:", result);
      setTranscript(result);
      setStatus('success');
    } catch (error) { 
      console.log("6. ERROR:", error);
      setStatus('error'); 
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || emergencyAlertRef.current) return;
    const previewUrl = URL.createObjectURL(file);
    setSelectedImage(previewUrl);
    setStatus('processing');
    try {
      const result = await processImageToSign(file);
      setOriginalText(result); 
      const translatedGlosses = await processTextToSign(result, selectedLang); 
      setTranscript(translatedGlosses);
      setStatus('success');
    } catch (error) { setStatus('error'); }
  };

  const handleToggleMic = async () => {
    if (emergencyAlertRef.current) return;

    if (status === 'recording') {
      // 1. STOP SPEECH RECOGNITION
      stopSpeechRecognition();
      
      // 2. RE-START EMERGENCY GUARD
      const stream = await getSharedStream();
      await startEmergencyGuard(stream, (reason, label) => {
        if (label) { setCurrentSound(label); return; }
        emergencyHandlerRef.current(reason);
      });

      if (liveText) {
        setOriginalText(liveText); 
        setStatus('processing');
        try {
          const result = await processTextToSign(liveText, selectedLang);
          setTranscript(result);
          setStatus('success');
        } catch (error) { setStatus('error'); }
      } else { setStatus('idle'); }
    } else {
      // 1. STOP EMERGENCY GUARD FIRST (CRITICAL)
      setStatus('recording');
      await stopEmergencyGuard();
      await stopParallelGuard();

      // 2. START SPEECH RECOGNITION
      setLiveText(""); 
      setTranscript(""); 
      setOriginalText(""); 
      
      try {
        startSpeechRecognition((text) => setLiveText(text), langMap[selectedLang]); 
      } catch (error) { 
        console.error("Mic Switch Error:", error);
        setStatus('error');
        // Restart guard if mic fails
        const stream = await getSharedStream();
        startEmergencyGuard(stream, (reason) => emergencyHandlerRef.current(reason)); // ✅ ref
      }
    }
  };

  const handleReplay = () => {
    if (!transcript) return;
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(originalText));
    setReplayTrigger(prev => prev + 1);
  };

  return {
    state: { status, transcript, originalText, inputText, liveText, replayTrigger, selectedLang, emergencyAlert,currentSound },
    refs: { fileInputRef },
    actions: {
      setInputText,
      setCurrentSound,
      handleSendText,
      handleImageUpload,
      handleToggleMic,
      handleReplay,
      clearOutput,
      // Map setEmergencyAlert to our specialized handler
      setEmergencyAlert: handleEmergencyTrigger, 
      resetSystem: () => handleEmergencyTrigger(null)
    }
  };
};