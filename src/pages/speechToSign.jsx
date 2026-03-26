import React, { Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { 
  Mic, MicOff, Volume2, Loader2, Activity, 
  Lightbulb, Send, Image as ImageIcon, 
  RotateCcw, ArrowLeft 
} from 'lucide-react';

import { Model as Xbot } from '../../XBot';
import { useSpeechToSign } from '../hooks/useSpeechToSign';

const SpeechToSign = () => {
  const navigate = useNavigate();
  const { state, refs, actions } = useSpeechToSign();
  const { status, transcript, inputText, liveText, replayTrigger } = state;

  const getBorderColor = () => {
    switch (status) {
      case 'recording': return 'border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.2)]';
      case 'processing': return 'border-indigo-500 shadow-[0_0_30px_rgba(99,102,241,0.2)]';
      case 'success': return 'border-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.2)]';
      case 'error': return 'border-orange-500 shadow-[0_0_30px_rgba(249,115,22,0.2)]';
      default: return 'border-white/10';
    }
  };

  return (
    <div className="min-h-screen bg-[#05070a] p-4 md:p-8">
      
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
          <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em]">Speech Engine v2.0</span>
        </div>
      </div>

      <div className="max-w-[1500px] mx-auto flex flex-col lg:flex-row gap-8">
        
        {/* LEFT: 3D AVATAR STAGE */}
        <div className="w-full lg:flex-[1.4] flex flex-col gap-6">
          <div className={`relative aspect-video lg:h-[55vh] rounded-[3rem] bg-[#111827] border-4 transition-all duration-500 overflow-hidden shadow-2xl ${getBorderColor()}`}>
            
            <Canvas camera={{ position: [0, 1.5, 5], fov: 15 }}>
              <Suspense fallback={<Html center><Loader2 className="animate-spin text-blue-500" /></Html>}>
                <ambientLight intensity={2} /> 
                <pointLight position={[10, 10, 10]} intensity={5} />
                <Xbot 
                  scale={1} 
                  position={[0, -1.2, 0]}
                  status={status}
                  transcript={transcript}
                  replayTrigger={replayTrigger}
                />
                <OrbitControls makeDefault />
              </Suspense>
            </Canvas>

            {status === 'processing' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-30">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-12 h-12 text-blue-400 animate-spin" />
                    <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Analyzing Input...</span>
                </div>
              </div>
            )}

            <div className="absolute bottom-8 left-8 flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${status === 'recording' ? 'bg-red-500 animate-pulse' : 'bg-blue-500'}`} />
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">
                {status === 'recording' ? 'Voice Engine Active' : 'Neural Link Standby'}
              </span>
            </div>
          </div>

          {/* INPUT BAR & CONTROLS */}
          <div className="flex flex-col md:flex-row items-center gap-4">
            <div className="flex-grow w-full flex items-center gap-2 bg-slate-900/50 border border-white/10 p-2 rounded-full shadow-lg">
                <button 
                  onClick={() => refs.fileInputRef.current.click()} 
                  className="p-3 text-slate-500 hover:text-white transition-colors"
                  title="Upload Image for OCR"
                >
                  <ImageIcon size={20} />
                </button>
                <input type="file" ref={refs.fileInputRef} className="hidden" onChange={actions.handleImageUpload} accept="image/*" />
                
                <form onSubmit={actions.handleSendText} className="flex-grow flex items-center">
                  <input 
                    type="text" 
                    placeholder="Type to translate to sign language..."
                    value={inputText}
                    onChange={(e) => actions.setInputText(e.target.value)}
                    className="bg-transparent border-none outline-none text-white text-sm px-2 w-full placeholder:text-slate-600"
                  />
                  <button 
                    type="submit" 
                    disabled={!inputText.trim() || status === 'processing'}
                    className="p-2 text-blue-500 hover:scale-110 transition-transform disabled:opacity-20"
                  >
                    <Send size={18} />
                  </button>
                </form>
            </div>

            <div className="flex gap-4">
              <button 
                onClick={actions.handleToggleMic}
                className={`flex items-center gap-4 px-8 py-4 rounded-full font-black transition-all shadow-xl ${
                  status === 'recording' ? 'bg-red-500 text-white animate-pulse' : 'bg-blue-600 text-white hover:bg-blue-500'
                }`}
              >
                {status === 'recording' ? <MicOff size={18} /> : <Mic size={18} />}
                <span className="tracking-[0.1em] text-[10px] uppercase">
                  {status === 'recording' ? "Stop Recording" : "Voice Input"}
                </span>
              </button>

              <button 
                disabled={!transcript || status === 'processing'}
                onClick={actions.handleReplay} 
                className="p-4 rounded-full bg-slate-900 text-slate-400 border border-white/5 hover:text-blue-400 disabled:opacity-20 transition-all duration-300 shadow-xl"
                title="Replay Sign & Audio"
              >
                <RotateCcw size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: TRANSCRIPT DISPLAY */}
        <div className="w-full lg:flex-1 flex flex-col gap-6">
          <div className={`bg-[#0c0f16] border rounded-[3rem] p-8 flex flex-col relative shadow-2xl min-h-[350px] transition-all duration-500 ${status === 'success' ? 'border-blue-500/40' : 'border-white/5'}`}>
            <div className="flex items-center gap-2 mb-8 text-blue-500">
              <Activity size={16} />
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Translation Output</span>
            </div>
            
            <div className="flex-grow flex flex-col justify-center">
              <div className={`text-3xl md:text-4xl font-bold text-white leading-tight transition-all duration-300 ${status === 'processing' ? 'opacity-20 blur-md' : 'opacity-100'}`}>
                {status === 'recording' ? (
                   <span>{liveText || "Listening..."}</span>
                ) : (
                   transcript ? `"${transcript}"` : <span className="text-slate-800 italic text-2xl">Awaiting input...</span>
                )}
              </div>
            </div>

            <div className="mt-8 pt-8 border-t border-white/5 flex justify-between items-center">
               <button 
                disabled={!transcript}
                onClick={() => actions.handleReplay()} 
                className="flex items-center gap-3 px-6 py-3 bg-blue-500/10 text-blue-400 rounded-2xl border border-blue-500/20 hover:bg-blue-500/20 transition-all disabled:opacity-10"
               >
                 <Volume2 size={20} />
                 <span className="text-[10px] font-bold uppercase tracking-widest text-xs">Audio Replay</span>
               </button>
               
               <div className="flex items-center gap-2">
                 <div className={`w-2 h-2 rounded-full ${status === 'success' ? 'bg-blue-500 shadow-[0_0_10px_#3b82f6]' : 'bg-slate-700'}`} />
                 <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">NLP Engine</span>
               </div>
            </div>
          </div>

          {/* DEV INFO BOX */}
          <div className="bg-blue-500/5 border border-blue-500/10 p-6 rounded-[2.5rem]">
            <div className="flex items-center gap-3 mb-4 text-blue-400">
              <Lightbulb size={18} />
              <h3 className="text-xs font-black uppercase tracking-[0.2em]">Bridge Mode</h3>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
              3D Render pipeline active. Animation blending is driven by the <code className="text-blue-400 px-1 bg-blue-400/10 rounded">transcript</code> stream.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpeechToSign;