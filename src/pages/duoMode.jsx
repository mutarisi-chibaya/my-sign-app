import React, { Suspense, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom'; 
import { 
  Mic, MicOff, Loader2, Volume2, RotateCcw, 
  Maximize2, Trash2, Send, Upload, Sparkles, Cpu,Type, Hash, MessageSquare 
} from 'lucide-react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { Model as Xbot } from '../../XBot';
import { useDuoMode } from '../hooks/useDuoMode'; 

const DuoMode = () => {
  const navigate = useNavigate();
  const { isDarkMode } = useOutletContext(); 
  
  const { state, refs, actions } = useDuoMode();
  const { activeMode,liveText,glossText ,signerStatus, signerText, speakerStatus, speakerText, manualText, replayTrigger,accuracy } = state;
  
  useEffect(() => {
    let interval;
    // ONLY capture if status is 'recording'. 
    // If it's 'processing', the interval does nothing, which is what we want!
    if (signerStatus === 'recording') {
      const frameCount = activeMode === 'glosses' ? 30 : 20;
      interval = setInterval(() => {
        actions.captureFrame(frameCount);
      }, 100);
    }
    return () => clearInterval(interval);
  }, [signerStatus, activeMode, actions]);

  const modes = [
    { id: 'alpha', label: 'Alpha', icon: <Type size={12} /> },
    { id: 'num', label: 'Num', icon: <Hash size={12} /> },
    { id: 'glosses', label: 'Words', icon: <MessageSquare size={12} /> }
  ];
  // Restored Dynamic Border Logic
  const getSignerBorder = () => {
    switch (signerStatus) {
      case 'recording': return 'border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.15)]';
      case 'processing': return 'border-amber-400 shadow-[0_0_30px_rgba(251,191,36,0.15)]';
      default: return 'border-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.15)]';
    }
  };

  const getSpeakerBorder = () => {
    switch (speakerStatus) {
      case 'recording': return 'border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.2)]';
      case 'processing': return 'border-indigo-500 shadow-[0_0_30px_rgba(99,102,241,0.2)]';
      default: return 'border-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.2)]';
    }
  };
  

  return (
    <div className={`min-h-screen transition-colors duration-700 p-4 md:p-8 overflow-y-auto pb-40 ${
      isDarkMode ? 'bg-transparent text-slate-400' : 'bg-slate-50 text-slate-600'
    }`}>
      <div className="max-w-[1400px] mx-auto flex flex-col gap-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          
          {/* --- SIGNER SIDE --- */}
          <div className="group flex flex-col gap-4">
            <div className="flex items-center justify-between px-2">
              <span className={`text-[10px] font-black uppercase tracking-widest ${isDarkMode ? 'text-emerald-500' : 'text-emerald-600'}`}>Sign to Text (Camera)</span>
              <div className={`inline-flex p-1 rounded-xl border transition-all ${
                isDarkMode ? 'bg-slate-900/40 border-white/5' : 'bg-white border-black/5 shadow-sm'
              }`}>
                {modes.map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => actions.handleModeChange(mode.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-tighter transition-all ${
                      activeMode === mode.id 
                        ? 'bg-emerald-500 text-white shadow-md' 
                        : 'text-slate-500 hover:text-emerald-500'
                    }`}
                  >
                    {mode.icon}
                    <span className="hidden sm:inline">{mode.label}</span>
                  </button>
                ))}
              </div>
              <button onClick={() => navigate('/')} className={`p-2 rounded-lg transition-all ${isDarkMode ? 'bg-white/5 hover:bg-emerald-500/20 text-emerald-500' : 'bg-black/5 hover:bg-emerald-500/10 text-emerald-600'}`}>
                <Maximize2 size={14} />
              </button>
            </div>

            <div className={`relative aspect-video rounded-[2.5rem] bg-black border-4 transition-all duration-500 overflow-hidden ${getSignerBorder()}`}>
              <video ref={refs.videoRef} autoPlay muted className={`w-full h-full object-cover -scale-x-100 ${signerStatus !== 'idle' ? 'opacity-100' : 'opacity-40'}`} />
              <canvas ref={refs.canvasRef} width="640" height="480" className="hidden" />
              {signerStatus === 'recording' && accuracy > 0 && (
                <div className="absolute top-6 right-6 px-4 py-2 bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 flex flex-col items-end animate-in fade-in zoom-in duration-300">
                  <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Confidence</span>
                  <span className="text-xs font-black text-emerald-500">{accuracy}%</span>
                </div>
              )}
              {signerStatus === 'processing' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-md z-10">
                  <Loader2 className="w-10 h-10 text-amber-400 animate-spin" />
                </div>
              )}
            </div>

            {/* STATUS LEGEND */}
            <div className={`flex items-center justify-center gap-6 py-3 rounded-2xl border transition-all ${isDarkMode ? 'bg-slate-900/20 border-white/5' : 'bg-white border-black/5 shadow-sm'}`}>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-[8px] font-bold text-slate-500 uppercase">Idle</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[8px] font-bold text-slate-500 uppercase">Live</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-[8px] font-bold text-slate-500 uppercase">Processing</span>
              </div>
            </div>

            <div className={`min-h-[70px] flex items-center justify-between gap-4 px-6 py-4 rounded-3xl border transition-all ${isDarkMode ? 'bg-white/[0.03] border-white/5' : 'bg-white border-black/5 shadow-sm'}`}>
              {/* Left Side: The Text Display */}
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="p-2 bg-emerald-500/10 rounded-lg shrink-0">
                  <Volume2 size={16} className="text-emerald-500" />
                </div>

                {/* UPDATED CONTAINER: Removed 'truncate', added 'max-h' and 'overflow-y-auto' */}
                <div className="flex-1 min-w-0 max-h-[80px] overflow-y-auto custom-scrollbar">
                  <p className={`text-sm font-semibold leading-relaxed ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    {signerText || (
                      <span className="text-slate-400 italic text-xs uppercase tracking-widest">
                        Awaiting signs...
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {signerText && (
                  <>
                    <button onClick={() => actions.speakText(signerText)} className="p-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-full text-emerald-500 transition-all">
                      <Volume2 size={16} />
                    </button>
                    <button onClick={() => actions.setSignerText("")} className="p-2.5 bg-red-500/10 hover:bg-red-500/20 rounded-full text-red-500 transition-all">
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>

            <button
              onClick={() => {
                if (signerStatus === 'idle') {
                  // STARTING:
                  actions.setSignerStatus('recording');
                } else {
                  // STOPPING: 
                  // We call handleStopSigner because it clears the frame buffer 
                  // and speaks the text automatically.
                  actions.handleStopSigner(); 
                }
              }}
              className={`py-5 rounded-[1.5rem] font-black text-[10px] uppercase tracking-[0.3em] transition-all ${
                signerStatus !== 'idle'
                  ? 'bg-red-500 text-white shadow-lg shadow-red-500/20'
                  : 'bg-emerald-500 text-white hover:bg-emerald-400 shadow-lg shadow-emerald-500/20'
              }`}
            >
              {signerStatus !== 'idle' ? "Stop Signer Stream" : "Start Signer Stream"}
            </button>
          </div>

          {/* --- SPEAKER SIDE --- */}
          <div className="group flex flex-col gap-4">
            <div className="flex items-center justify-between px-2">
              <span className={`text-[10px] font-black uppercase tracking-widest ${isDarkMode ? 'text-blue-500' : 'text-blue-600'}`}>AI Interpreter (Avatar)</span>
              <button onClick={() => navigate('/speechToSign')} className={`p-2 rounded-lg transition-all ${isDarkMode ? 'bg-white/5 hover:bg-blue-500/20 text-blue-500' : 'bg-black/5 hover:bg-blue-500/10 text-blue-600'}`}>
                <Maximize2 size={14} />
              </button>
            </div>

            <div className={`relative aspect-video rounded-[2.5rem] overflow-hidden border-4 transition-all duration-500 shadow-2xl ${getSpeakerBorder()}`}>
              <Canvas camera={{ position: [0, 1.5, 5], fov: 15 }} style={{ background: '#111827' }}>
                <Suspense fallback={<Html center><Loader2 className="animate-spin text-blue-500" /></Html>}>
                  <ambientLight intensity={2} />
                  <pointLight position={[10, 10, 10]} intensity={5} />
                  <Xbot
                    scale={1}
                    position={[0, -1.2, 0]}
                    status={speakerStatus === 'idle' ? 'success' : speakerStatus}
                    transcript={glossText} 
                    replayTrigger={replayTrigger} 
                  />
                  <OrbitControls makeDefault enableZoom={false} />
                </Suspense>
              </Canvas>

              {speakerStatus === 'processing' && (
                <div className={`absolute inset-0 flex flex-col items-center justify-center backdrop-blur-md z-10 transition-colors ${
                  isDarkMode ? 'bg-black/60' : 'bg-white/70'
                }`}>
                  <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-3" />
                  <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Generating Signs</span>
                </div>
              )}

              <div className="absolute bottom-6 left-6 flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${speakerStatus === 'recording' ? 'bg-red-500 animate-pulse' : 'bg-blue-500'}`} />
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">
                  {speakerStatus === 'recording' ? 'Listening' : speakerStatus === 'processing' ? 'Processing' : 'Translation Active'}
                </span>
              </div>
            </div>

            <div className={`min-h-[70px] flex items-center justify-between gap-4 px-6 py-4 rounded-3xl border transition-all ${isDarkMode ? 'bg-white/[0.03] border-white/5' : 'bg-white border-black/5 shadow-sm'}`}>
              <div className="flex items-center gap-4 overflow-hidden">
                <Mic size={16} className="text-blue-500/50 shrink-0" />
                <p className={`text-sm font-semibold truncate italic ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  {speakerStatus === 'recording' ? (
                    <span>{liveText || "Listening..."}</span>
                  ) : (
                    speakerText || <span className="text-slate-400 italic text-xs uppercase tracking-widest">Awaiting input...</span>
                  )}
                </p>
              </div>
              
              <button 
                disabled={!speakerText || speakerStatus === 'processing'}
                onClick={actions.handleReplay} 
                className={`p-2.5 rounded-full transition-all duration-300 ${
                  isDarkMode ? 'bg-white/5 text-slate-400 hover:text-blue-400' : 'bg-black/5 text-slate-500 hover:text-blue-600'
                } disabled:opacity-20`}
                title="Replay Sign & Audio"
              >
                <RotateCcw size={18} />
              </button>
            </div>

            <div className={`flex flex-col gap-3 p-4 rounded-[2rem] border transition-all ${isDarkMode ? 'bg-white/[0.02] border-white/5' : 'bg-white border-black/5 shadow-sm'}`}>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={manualText}
                  onChange={(e) => actions.setManualText(e.target.value)}
                  placeholder="Type a message to sign..."
                  className={`flex-grow border rounded-xl px-4 py-3 text-xs transition-all focus:outline-none ${
                    isDarkMode 
                    ? 'bg-slate-900/50 border-white/10 text-white focus:border-blue-500/50' 
                    : 'bg-slate-50 border-black/10 text-slate-900 focus:border-blue-600/50'
                  }`}
                />

                <button onClick={actions.handleManualSend} className="p-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-white transition-all shadow-lg shadow-blue-600/20">
                  <Send size={16} />
                </button>

                <button 
                  onClick={() => refs.fileInputRef.current.click()} 
                  className={`p-3 rounded-xl transition-all ${isDarkMode ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}
                  title="Upload Image for OCR"
                >
                  <Upload size={16} />
                </button>

                <input type="file" ref={refs.fileInputRef} onChange={actions.handleImageUpload} className="hidden" accept="image/*" />
              </div>
              
              <button 
                onClick={actions.handleToggleSpeakerMic}
                className={`flex items-center justify-center gap-4 py-4 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] transition-all ${
                  speakerStatus === 'recording' 
                  ? 'bg-red-500 text-white shadow-lg animate-pulse' 
                  : 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg'
                }`}
              >
                {speakerStatus === 'recording' ? <MicOff size={16} /> : <Mic size={16} />}
                {speakerStatus === 'recording' ? "Stop Recording" : "Use Microphone Input"}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default DuoMode;