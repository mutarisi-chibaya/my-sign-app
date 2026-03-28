import * as tf from '@tensorflow/tfjs';

let classifier = null;
let audioContext = null;
let mediaStreamSource = null;
let analyserNode = null;
let animFrameId = null;
let lastAlertTime = 0;
let frameCount = 0;
const FRAME_SKIP = 10;
const COOLDOWN_MS = 5000;

// ✅ Correct local paths — Vite serves everything in /public from root
const YAMNET_URL = '/yamnet/model.json';
const YAMNET_CLASSES_URL = '/yamnet/yamnet_class_map.csv';

let yamnetClasses = [];

const loadYamnetClasses = async () => {

  if (yamnetClasses.length > 0) return;
  const res = await fetch(YAMNET_CLASSES_URL);
  const text = await res.text();
  yamnetClasses = text.split('\n').slice(1).map(line => {
    const parts = line.split(',');
    return parts[2]?.replace(/"/g, '').trim();
  }).filter(Boolean);
};

export const startEmergencyGuard = async (sharedStream, onDetection) => {
  try {
    if (!classifier) {
      console.log("⏳ Loading YAMNet Engine...");
      await tf.setBackend('webgl');
      await tf.ready();
      classifier = await tf.loadGraphModel(YAMNET_URL); // ✅ no fromTFHub
      await loadYamnetClasses();
      console.log("📋 First 5 classes:", yamnetClasses.slice(0, 5));
      console.log("📋 Total classes:", yamnetClasses.length);
      console.log("✅ YAMNet Loaded Successfully");
    }

    if (audioContext) {
      await audioContext.close();
      audioContext = null;
    }

    audioContext = new AudioContext({ sampleRate: 16000 });
    mediaStreamSource = audioContext.createMediaStreamSource(sharedStream);
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 16384
    mediaStreamSource.connect(analyserNode);

    const buffer = new Float32Array(analyserNode.fftSize);

    const detect = async () => {
      if (!analyserNode || !audioContext) return;

      frameCount++;

      if (frameCount % FRAME_SKIP !== 0) {
        animFrameId = requestAnimationFrame(detect);
        return;
      }

      analyserNode.getFloatTimeDomainData(buffer);

      let inputTensor, scoresTensor, meanScores;
      try {
        inputTensor = tf.tensor1d(buffer);
        
        // execute() returns an array — YAMNet output[0] is the scores tensor
        const result = classifier.execute(inputTensor);
        scoresTensor = Array.isArray(result) ? result[0] : result;
        
        // scoresTensor shape is [num_frames, 521] — mean across frames
        meanScores = scoresTensor.mean(0);
        const scoresArray = await meanScores.data();

        const maxIdx = scoresArray.indexOf(Math.max(...scoresArray));
        const topScore = scoresArray[maxIdx];
        const topLabel = yamnetClasses[maxIdx] || 'Unknown';
        //console.log(`🔢 maxIdx: ${maxIdx}, total classes: ${yamnetClasses.length}, scores length: ${scoresArray.length}`);
        // Update live heartbeat UI
        onDetection(null, topLabel);
        //console.log(`🔊 Hearing: ${topLabel} (${(topScore * 100).toFixed(1)}%)`);

        const label = topLabel.toLowerCase();
        const isEmergency =
          label.includes('alarm') ||
          label.includes('siren') ||
          label.includes('fire') ||
          label.includes('explosion') ||
          label.includes('screaming') ||
          label.includes('gunshot') ||
          label.includes('bang') ||
          label.includes('smoke');

        const currentTime = Date.now();
        if (isEmergency && topScore > 0.50 && currentTime - lastAlertTime > COOLDOWN_MS) {
          console.log(`🚨 TRIGGERED: ${topLabel} (${(topScore * 100).toFixed(1)}%)`);
          onDetection(`Emergency: ${topLabel} Detected`);
          lastAlertTime = currentTime;
          cancelAnimationFrame(animFrameId);
          animFrameId = null;
          return; // Exit early to stop further processing until next frame
        }

      } catch (inferenceError) {
        console.warn("Inference error (skipping frame):", inferenceError);
      } finally {
        // Dispose all tensors
        if (inputTensor) inputTensor.dispose();
        if (scoresTensor) scoresTensor.dispose();
        if (meanScores) meanScores.dispose();
      }

      animFrameId = requestAnimationFrame(detect);
    };
    
    frameCount = 0;
    detect();
    console.log("🛡️ YAMNet Guard Active.");

  } catch (error) {
    console.error("Critical: YAMNet failed to start.", error);
  }
};

export const stopEmergencyGuard = async () => {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  if (analyserNode) {
    analyserNode.disconnect();
    analyserNode = null;
  }
  if (mediaStreamSource) {
    mediaStreamSource.disconnect();
    mediaStreamSource = null;
  }
  if (audioContext) {
    try { await audioContext.close(); } catch (e) {}
    audioContext = null;
  }
  console.log("🛡️ YAMNet Guard Offline");
};