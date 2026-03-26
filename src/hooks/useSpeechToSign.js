import { useState, useRef, useEffect } from 'react';
import { 
  processTextToSign, 
  processImageToSign, 
  startSpeechRecognition,
  stopSpeechRecognition 
} from '../utils/utils';

export const useSpeechToSign = () => {
  const [status, setStatus] = useState('idle'); 
  const [transcript, setTranscript] = useState("");
  const [inputText, setInputText] = useState("");
  const [liveText, setLiveText] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [replayTrigger, setReplayTrigger] = useState(0);
  const fileInputRef = useRef(null);

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
    setInputText("");
    setStatus('processing');

    try {
      const result = await processTextToSign(textToProcess);
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
      setTranscript(result);
      setStatus('success');
    } catch (error) {
      console.error("Image Processing Error:", error);
      setStatus('error');
    }
  };

  const handleToggleMic = async () => {
    if (status === 'recording') {
      stopSpeechRecognition();
      if (liveText) {
        setTranscript(liveText);
        setStatus('success');
      } else {
        setStatus('idle');
      }
    } else {
      setLiveText("");
      setTranscript(""); 
      setStatus('recording');

      try {
        await startSpeechRecognition((text) => {
          setLiveText(text);
        });
      } catch (error) {
        console.error("Speech Recognition Error:", error);
        setStatus('error');
      }
    }
  };

  const handleReplay = () => {
    if (!transcript) return;
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(transcript));
    setReplayTrigger(prev => prev + 1);
  };

  return {
    state: { status, transcript, inputText, liveText, replayTrigger },
    refs: { fileInputRef },
    actions: {
      setInputText,
      handleSendText,
      handleImageUpload,
      handleToggleMic,
      handleReplay,
      resetSystem: () => {
        setTranscript("");
        setLiveText("");
        setSelectedImage(null);
        setStatus('idle');
      }
    }
  };
};