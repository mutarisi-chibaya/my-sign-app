import React, { Suspense, useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { Model as Xbot } from '../../XBot';

// Helper to signal when the 3D scene is painted
const SceneWatcher = ({ onReady }) => {
  useEffect(() => {
    const timer = setTimeout(() => onReady(true), 1500);
    return () => clearTimeout(timer);
  }, [onReady]);
  return null;
};

const EmergencyModal = ({ isOpen, reason, onDismiss, transcript }) => {
  const [isReady, setIsReady] = useState(false);
  const [loopTrigger, setLoopTrigger] = useState(0); // <--- ADDED THIS

  // 1. Reset loading state and handle Auto-Loop
  useEffect(() => {
    if (!isOpen) {
      setIsReady(false);
      return;
    }

    // Auto-replay every 6 seconds while modal is open
    const interval = setInterval(() => {
      setLoopTrigger(prev => prev + 1);
    }, 6000);

    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-[#05070a]/95 backdrop-blur-2xl transition-all">
      <div className="relative w-full max-w-2xl bg-[#111827] border-2 border-red-500/50 rounded-[3rem] p-8 shadow-[0_0_100px_rgba(239,68,68,0.4)] overflow-hidden">
        
        {/* AVATAR STAGE */}
        <div className="relative w-full h-[300px] bg-black/20 rounded-3xl mb-6 border border-white/5 overflow-hidden">
          
          {/* Loading Overlay */}
          {!isReady && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-[#111827]">
              <Loader2 className="w-8 h-8 text-red-500 animate-spin mb-2" />
              <span className="text-[10px] font-black text-red-500/40 uppercase tracking-widest">Warming Engine...</span>
            </div>
          )}

          <Canvas camera={{ position: [0, 1.5, 5], fov: 15 }}>
            <Suspense fallback={null}>
              <ambientLight intensity={2} />
              <pointLight position={[10, 10, 10]} intensity={5} />
              
              <Xbot 
                scale={1.2} 
                position={[0, -1.3, 0]} 
                status="error"
                transcript={transcript || "DANGER FIRE"} 
                replayTrigger={loopTrigger} // <--- Now it has a value!
              />
              
              <SceneWatcher onReady={setIsReady} />
              <OrbitControls enableZoom={false} />
            </Suspense>
          </Canvas>
          
          <div className="absolute top-4 left-4 px-3 py-1 bg-red-500 rounded-full">
            <span className="text-[10px] font-black text-white uppercase tracking-tighter">Live Protocol</span>
          </div>
        </div>

        <div className="relative z-10 flex flex-col items-center text-center">
          <h2 className="text-3xl font-black text-white mb-2 uppercase tracking-tighter">
            {reason || "Danger Detected"}
          </h2>
          
          {/* NEW: DYNAMIC WRITTEN INSTRUCTIONS */}
          {/* NEW: DYNAMIC WRITTEN INSTRUCTIONS */}
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 mb-8 w-full">
            <p className="text-white text-lg font-bold leading-relaxed">
              {/* Normalize to lowercase for better matching */}
              {reason?.toLowerCase().includes("fire") || reason?.toLowerCase().includes("alarm") || reason?.toLowerCase().includes("smoke")
                ? "FIRE ALARM DETECTED: EXIT THE BUILDING IMMEDIATELY. DO NOT USE ELEVATORS." 
                : reason?.toLowerCase().includes("siren") || reason?.toLowerCase().includes("police") || reason?.toLowerCase().includes("ambulance")
                ? "EMERGENCY SIREN DETECTED: MOVE TO THE SIDE OF THE ROAD OR SEEK SAFETY."
                : reason?.toLowerCase().includes("impact") || reason?.toLowerCase().includes("explosion") || reason?.toLowerCase().includes("gunshot")
                ? "HIGH-IMPACT SOUND DETECTED: SEEK COVER, STAY AWAY FROM WINDOWS, AND REMAIN QUIET."
                : "UNUSUAL ACTIVITY DETECTED: PLEASE FOLLOW THE AVATAR'S SIGNING AND MOVE TO A SAFE AREA."
              }
            </p>
          </div>

          <button 
            onClick={onDismiss}
            className="w-full py-4 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-black uppercase tracking-widest transition-all shadow-lg active:scale-95"
          >
            Dismiss & Reset System
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmergencyModal;