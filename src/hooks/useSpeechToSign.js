import { useState, useRef, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { 
  processTextToSign, 
  processImageToSign, 
  startSpeechRecognition,
  stopSpeechRecognition 
} from '../utils/utils';

export const useSpeechToSign = () => {
  const { selectedLang } = useOutletContext();
  const [status, setStatus] = useState('idle'); 
  const [transcript, setTranscript] = useState("");
  const [inputText, setInputText] = useState("");
  const [liveText, setLiveText] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [replayTrigger, setReplayTrigger] = useState(0);
  const [originalText, setOriginalText] = useState("");
  const fileInputRef = useRef(null);

  const langMap = {
    'en': 'en-US',
    'zu': 'zu-ZA',
    'af': 'af-ZA',
    'xh': 'xh-ZA',
    'sn': 'sn-ZW'
  };

  // Cleanup object URLs to avoid memory leaks
  useEffect(() => {
    return () => {
      if (selectedImage) URL.revokeObjectURL(selectedImage);
    };
  }, [selectedImage]);

  const handleSendText = async (e) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;

    const textToProcess = inputText;
    setOriginalText(textToProcess);
    const currentLang = selectedLang; // Capture current lang state
    setInputText("");
    setStatus('processing');

    try {
      // Pass the selectedLang so the backend knows to translate SN/ZU to Glosses
      const result = await processTextToSign(textToProcess, currentLang);
      console.log("Translated Glosses:", result);
      setTranscript(result);
      setStatus('success');
    } catch (error) {
      console.error("Text Processing Error:", error);
      setStatus('error');
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    setSelectedImage(previewUrl);
    setStatus('processing');

    try {
      const result = await processImageToSign(file);
      setOriginalText(result); // Show the raw OCR text in the UI
      const translatedGlosses = await processTextToSign(result, selectedLang); 
      setTranscript(translatedGlosses); // This goes to the XBot
      setStatus('success');
    } catch (error) {
      console.error("Image Processing Error:", error);
      setStatus('error');
    }
  };

  const handleToggleMic = async () => {
    // --- 1. STOP RECORDING CASE ---
    if (status === 'recording') {
      stopSpeechRecognition();
      
      if (liveText) {
        // Save the exact spoken words (e.g., "Unjani") to display in the UI
        setOriginalText(liveText); 
        setStatus('processing');

        try {
          // Send the native text to Python to get English ASL Glosses for the avatar
          // Note: processTextToSign in utils.js already handles the 'en' check internally now
          const result = await processTextToSign(liveText, selectedLang);
          
          setTranscript(result); // This goes to the XBot (e.g., "HOW YOU")
          setStatus('success');
        } catch (error) {
          console.error("Mic Translation Error:", error);
          setStatus('error');
        }
      } else {
        // User stopped mic without saying anything
        setStatus('idle');
      }
    } 
    // --- 2. START RECORDING CASE ---
    else {
      // Reset states for the new recording session
      setLiveText("");
      setTranscript(""); 
      setOriginalText(""); 
      setStatus('recording');

      try {
        // Start the browser listener with the specific language locale (e.g., 'zu-ZA')
        await startSpeechRecognition((text) => {
          setLiveText(text); // Updates the "Listening..." text in real-time
        }, langMap[selectedLang]); 

      } catch (error) {
        console.error("Speech Recognition Start Error:", error);
        setStatus('error');
      }
    }
  };

  const handleReplay = () => {
    if (!transcript) return;
     window.speechSynthesis.speak(new SpeechSynthesisUtterance(originalText));
    setReplayTrigger(prev => prev + 1);
  };

  return {
    state: { status, transcript,originalText ,inputText, liveText, replayTrigger,selectedLang },
    refs: { fileInputRef },
    actions: {
      setInputText,
      handleSendText,
      handleImageUpload,
      handleToggleMic,
      handleReplay,
      resetSystem: () => {
        setTranscript("");
        setOriginalText("");
        setLiveText("");
        setSelectedImage(null);
        setStatus('idle');
      }
    }
  };
};