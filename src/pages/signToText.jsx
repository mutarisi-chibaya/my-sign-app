import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Volume2, Square, Circle, Loader2, Activity, 
  Lightbulb, Trash2, ArrowLeft, Type, Hash, MessageSquare 
} from 'lucide-react';
import { useSignToText } from '../hooks/useSignToText';

const SignToText = () => {
  const navigate = useNavigate();
  
  const modes = [
    { id: 'alpha', label: 'Alphabets', icon: <Type size={14} />, frameCount: 20 },
    { id: 'num', label: 'Numbers', icon: <Hash size={14} />, frameCount: 20 },
    { id: 'glosses', label: 'Words', icon: <MessageSquare size={14} />, frameCount: 30 }
  ];
  
  const [activeMode, setActiveMode] = useState('alpha');

  // Logic extracted to our custom hook
  const {
    status,
    setStatus,
    detectedHistory,
    setDetectedHistory,
    accuracy,
    setAccuracy,
    videoRef,
    canvasRef,
    captureFrame,
    clearResults,
    toggleRecording,
    handleModeChange
  } = useSignToText(activeMode,setActiveMode);

  // Interval Manager: restored the specific frameCount logic per mode
  useEffect(() => {
    const modeConfig = modes.find(m => m.id === activeMode);
    const targetCount = modeConfig ? modeConfig.frameCount : 20;
    
    let interval;
    if (status === 'recording') {
      interval = setInterval(() => captureFrame(targetCount), 100);
    }
    return () => clearInterval(interval);
  }, [status, activeMode, captureFrame]);

 

  const getBorderColor = () => {
    switch (status) {
      case 'recording': return 'border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.15)]';
      case 'processing': return 'border-amber-400 shadow-[0_0_30px_rgba(251,191,36,0.15)]';
      default: return 'border-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.15)]';
    }
  };

  return (
    <div className="min-h-screen bg-[#06080c] text-slate-300 p-4 md:p-8">
      
      {/* TOP NAVIGATION BAR */}
      <div className="max-w-[1500px] mx-auto mb-8 flex items-center justify-between">
        <button 
          onClick={() => navigate('/duoMode')}
          className="flex items-center gap-3 px-4 py-2 bg-slate-900/50 hover:bg-slate-800 border border-white/5 rounded-xl text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-white transition-all group"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          Back
        </button>
        
        <div className="hidden md:block">
          <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em]">Sign Language Translator v2.0</span>
        </div>
      </div>

      <div className="max-w-[1500px] mx-auto flex flex-col lg:flex-row gap-8">
        
        {/* LEFT SECTION: CAMERA + TABS */}
        <div className="w-full lg:flex-[1.4] flex flex-col gap-6">
          
          {/* FLOATING TAB BAR */}
          <div className="flex justify-center">
            <div className="inline-flex p-1.5 bg-slate-900/40 backdrop-blur-2xl border border-white/5 rounded-2xl shadow-xl">
              {modes.map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => handleModeChange(mode.id)}
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${
                    activeMode === mode.id 
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' 
                      : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                  }`}
                >
                  {mode.icon}
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          {/* CAMERA FEED */}
          <div className={`relative aspect-video lg:h-[50vh] rounded-[3rem] bg-black border-4 transition-all duration-500 overflow-hidden shadow-2xl ${getBorderColor()}`}>
            <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover -scale-x-100" />
            <canvas ref={canvasRef} width="640" height="480" style={{ display: 'none' }} />

            {status === 'processing' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[2px] z-10">
                <Loader2 className="w-12 h-12 text-amber-400 animate-spin" />
              </div>
            )}
          </div>

          {/* STATUS LEGEND */}
          <div className="flex flex-wrap items-center justify-center gap-8 py-4 bg-slate-900/20 rounded-3xl border border-white/5">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Idle</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Live</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Analyzing</span>
            </div>
          </div>

          {/* MAIN ACTION BUTTONS */}
          <div className="flex flex-row items-center justify-center gap-4">
            <button 
             
              onClick={toggleRecording} 
              
              className={`group flex items-center gap-4 px-10 py-5 rounded-full font-black transition-all duration-300 transform active:scale-95 ${
                status !== 'idle' 
                  ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' 
                  : 'bg-emerald-500 text-white hover:bg-emerald-400 shadow-lg shadow-emerald-500/20'
              }`}
            >
              {status !== 'idle' ? <Square size={18} fill="currentColor" /> : <Circle size={18} />}
              <span className="tracking-[0.2em] text-xs uppercase">
                {status !== 'idle' ? "Stop Session" : "Start Live Stream"}
              </span>
            </button>

            <button 
              onClick={clearResults}
              disabled={status !== 'idle'}
              className="group flex items-center gap-3 px-8 py-5 rounded-full font-black bg-slate-900 text-slate-400 border border-white/5 hover:border-white/20 hover:text-white transition-all disabled:opacity-30"
            >
              <Trash2 size={18} />
              <span className="tracking-[0.2em] text-xs uppercase">Clear</span>
            </button>
          </div>
        </div>

        {/* RIGHT SECTION: RESULTS HISTORY */}
        <div className="w-full lg:flex-1 flex flex-col gap-6">
          <div className="bg-[#0c0f16] border border-white/5 rounded-[3rem] p-8 md:p-12 flex flex-col relative shadow-2xl min-h-[420px]">
            <div className="flex items-center gap-2 mb-8">
              <Activity className="text-emerald-500" size={16} />
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                Transcription History
              </span>
            </div>
            
            <div className="flex-grow flex flex-wrap content-start gap-x-1 gap-y-2 overflow-y-auto max-h-[300px] custom-scrollbar">
              {detectedHistory.length === 0 ? (
                <p className="text-4xl md:text-5xl lg:text-6xl font-bold text-slate-800 tracking-tighter">READY</p>
              ) : (
                detectedHistory.map((item, index) => (
                  <span 
                    key={index} 
                    className={`text-xl md:text-2xl lg:text-4xl font-bold text-white leading-tight animate-in fade-in slide-in-from-bottom-2 duration-300 ${item === "\u00A0" ? "px-4" : ""}`}
                  >
                    {item}
                  </span>
                ))
              )}
            </div>

            <div className="flex items-center justify-between mt-8 pt-8 border-t border-white/5">
              <button 
                onClick={() => {
                  const speech = detectedHistory.join(activeMode === 'glosses' ? " " : "");
                  window.speechSynthesis.speak(new SpeechSynthesisUtterance(speech));
                }} 
                disabled={detectedHistory.length === 0}
                className="w-14 h-14 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center transition-all border border-emerald-500/20 disabled:opacity-10"
              >
                <Volume2 size={24} />
              </button>
              
              <div className="text-right">
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Latest Confidence</p>
                <p className="text-3xl font-black text-emerald-400">{accuracy}%</p>
              </div>
            </div>
          </div>

          {/* DYNAMIC TIPS */}
          <div className="bg-emerald-500/5 border border-emerald-500/10 p-6 rounded-[2.5rem]">
            <div className="flex items-center gap-3 mb-4 text-emerald-400">
              <Lightbulb size={18} />
              <h3 className="text-xs font-black uppercase tracking-[0.2em]">Translation Tips</h3>
            </div>
            <ul className="space-y-3 text-[11px] text-slate-400">
              <li className="flex gap-2">
                <span className="text-emerald-500">•</span> 
                {activeMode === 'glosses' ? 'Move through the entire word clearly.' : 'Hold finger positions for a moment.'}
              </li>
              <li className="flex gap-2"><span className="text-emerald-500">•</span> Maintain high-contrast lighting.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignToText;