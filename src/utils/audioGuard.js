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

const YAMNET_URL = '/yamnet/model.json';
const YAMNET_CLASSES_URL = '/yamnet/yamnet_class_map.csv';

let yamnetClasses = [];
let onDetectionCallback = null; // Shared callback for both start and resume

const loadYamnetClasses = async () => {
  if (yamnetClasses.length > 0) return;
  const res = await fetch(YAMNET_CLASSES_URL);
  const text = await res.text();
  yamnetClasses = text.split('\n').slice(1).map(line => {
    const parts = line.split(',');
    return parts[2]?.replace(/"/g, '').trim();
  }).filter(Boolean);
};

// Private shared detect loop — used by both startEmergencyGuard and resumeEmergencyGuard
const runDetectLoop = () => {
  if (!analyserNode || !audioContext) return;

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

      const result = classifier.execute(inputTensor);
      scoresTensor = Array.isArray(result) ? result[0] : result;

      meanScores = scoresTensor.mean(0);
      const scoresArray = await meanScores.data();

      const maxIdx = scoresArray.indexOf(Math.max(...scoresArray));
      const topScore = scoresArray[maxIdx];
      const topLabel = yamnetClasses[maxIdx] || 'Unknown';
      
      // Update live heartbeat UI
      onDetectionCallback(null, topLabel);

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
        onDetectionCallback(`Emergency: ${topLabel} Detected`);
        lastAlertTime = currentTime;
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
        return;
      }

    } catch (inferenceError) {
      console.warn("Inference error (skipping frame):", inferenceError);
    } finally {
      if (inputTensor) inputTensor.dispose();
      if (scoresTensor) scoresTensor.dispose();
      if (meanScores) meanScores.dispose();
    }

    animFrameId = requestAnimationFrame(detect);
  };

  frameCount = 0;
  detect();
};

export const startEmergencyGuard = async (sharedStream, onDetection) => {
  try {
    if (!classifier) {
      console.log("⏳ Loading YAMNet Engine...");
      await tf.setBackend('webgl');
      await tf.ready();
      classifier = await tf.loadGraphModel(YAMNET_URL);
      await loadYamnetClasses();
      console.log("📋 First 5 classes:", yamnetClasses.slice(0, 5));
      console.log("📋 Total classes:", yamnetClasses.length);
      console.log("✅ YAMNet Loaded Successfully");
    }

    // Close any existing AudioContext before creating a new one
    if (audioContext) {
      await audioContext.close();
      audioContext = null;
    }

    audioContext = new AudioContext({ sampleRate: 16000 });
    mediaStreamSource = audioContext.createMediaStreamSource(sharedStream);
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 16384;
    mediaStreamSource.connect(analyserNode);

    // Store callback so resumeEmergencyGuard can reuse it
    onDetectionCallback = onDetection;

    runDetectLoop();
    console.log("🛡️ YAMNet Guard Active.");

  } catch (error) {
    console.error("Critical: YAMNet failed to start.", error);
  }
};

// Soft pause — cancels the loop but keeps AudioContext and analyserNode alive
// Full teardown — closes everything, called only on component unmount
export const stopEmergencyGuard = async (options = {}) => {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  if (options.fullTeardown) {
    if (analyserNode) { analyserNode.disconnect(); analyserNode = null; }
    if (mediaStreamSource) { mediaStreamSource.disconnect(); mediaStreamSource = null; }
    if (audioContext) { try { await audioContext.close(); } catch (e) {} audioContext = null; }
    console.log("🛡️ YAMNet Guard fully offline");
  } else {
    console.log("🛡️ YAMNet Guard paused");
  }
};

// Resume the detect loop without rebuilding the AudioContext pipeline
export const resumeEmergencyGuard = () => {
  if (!analyserNode || !audioContext) {
    console.warn("🛡️ Cannot resume — guard was fully torn down. Call startEmergencyGuard instead.");
    return;
  }
  if (animFrameId) {
    console.log("🛡️ Guard already running, skipping resume.");
    return;
  }
  runDetectLoop();
  console.log("🛡️ YAMNet Guard Resumed");
};