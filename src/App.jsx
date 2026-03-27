import React, { useState, useRef, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, Outlet, useLocation } from 'react-router-dom';
import { Languages, Shield, Zap, Cpu, ChevronDown } from 'lucide-react';
import 'flag-icons/css/flag-icons.min.css';

// Import your page components
import SignToText from './pages/signToText';
import SpeechToSign from './pages/speechToSign';
import DuoMode from './pages/duoMode';

// --- 1. LAYOUT COMPONENT ---
const MainLayout = () => {
  const [selectedLang, setSelectedLang] = useState('en');
  const [isLangOpen, setIsLangOpen] = useState(false);
  const dropdownRef = useRef(null);
  const location = useLocation();

  const languages = [
    { code: 'en', label: 'English', short: 'ENG', flag: 'fi fi-us' },
    { code: 'zu', label: 'isiZulu', short: 'ZUL', flag: 'fi fi-za' },
    { code: 'af', label: 'Afrikaans', short: 'AFR', flag: 'fi fi-za' },
    { code: 'xh', label: 'isiXhosa', short: 'XHO', flag: 'fi fi-za' },
    { code: 'sn', label: 'chiShona', short: 'SHO', flag: 'fi fi-zw' },
  ];

  const currentLang = languages.find(l => l.code === selectedLang) || languages[0];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsLangOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isActive = (path) => location.pathname === path;

  const getModuleInfo = () => {
    if (isActive('/')) return { 
      name: "Sign Interpreter", 
      color: "text-emerald-500", 
      glow: "bg-emerald-500/20",
    };
    if (isActive('/speechToSign')) return { 
      name: "Avatar Synthesis", 
      color: "text-blue-500", 
      glow: "bg-blue-500/20",
    };
    if (isActive('/duoMode')) return { 
      name: "Duo-Link Active", 
      color: "text-purple-500", 
      glow: "bg-purple-500/20",
    };
    return { name: "System Idle", color: "text-slate-500", glow: "bg-slate-500/10" };
  };

  const module = getModuleInfo();

  return (
    <div className="min-h-screen flex flex-col overflow-hidden bg-[#05070a] text-slate-200">
      
      {/* --- PREMIUM TOP BAR --- */}
      <nav className="relative z-50 flex items-center justify-between px-8 py-6 backdrop-blur-xl border-b border-white/5 bg-black/40">
        
        {/* LEFT: LOGO */}
        <Link to="/" className="flex items-center gap-3 group transition-transform active:scale-95">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Languages className="text-slate-900" size={20} />
          </div>
          <h1 className="text-xl font-black tracking-tighter uppercase italic text-white">
            Lynk <span className="text-emerald-500 not-italic">Sign</span>
          </h1>
        </Link>

        {/* --- CENTER: CONTEXTUAL BREADCRUMB --- */}
        <div className="absolute left-1/2 -translate-x-1/2 hidden lg:flex items-center">
          <div className="flex items-center gap-4 px-6 py-2 rounded-full border border-white/5 bg-slate-900/40 backdrop-blur-md">
            <Cpu size={14} className={`${module.color} animate-pulse`} />
            <div className="flex flex-col">
              <span className="text-[7px] font-black text-slate-500 uppercase tracking-[0.3em]">AI Engine</span>
              <span className={`text-[10px] font-black uppercase tracking-widest transition-colors ${module.color}`}>
                {module.name}
              </span>
            </div>
            <div className={`w-2 h-2 rounded-full blur-[2px] animate-pulse shadow-[0_0_8px_currentColor] ${module.color}`} />
          </div>
        </div>

        {/* --- RIGHT: HUD STATUS & LANGUAGE --- */}
        <div className="flex items-center gap-8">
          
          {/* SYSTEM STATS */}
          <div className="hidden xl:flex items-center gap-8 text-[9px] font-black uppercase tracking-[0.2em]">
            <span className="flex items-center gap-2 text-slate-400">
              <Shield size={12} className="text-emerald-500" /> 
              Encrypted
            </span>
            <span className={`flex items-center gap-2 transition-colors ${module.color}`}>
              <Zap size={12} className="fill-current" /> 
              4ms Latency
            </span>
          </div>

          {/* CUSTOM LANGUAGE DROPDOWN */}
          <div className="relative" ref={dropdownRef}>
            <button 
              onClick={() => setIsLangOpen(!isLangOpen)}
              className="flex items-center gap-3 px-4 py-2.5 bg-slate-900/60 border border-white/10 rounded-xl hover:bg-slate-800 transition-all backdrop-blur-md group"
            >
              <span className={`${currentLang.flag} fis`}></span>
              <span className="text-[10px] font-black tracking-[0.2em] text-white group-hover:text-emerald-400 transition-colors uppercase">
                {currentLang.short}
              </span>
              <ChevronDown 
                size={14} 
                className={`text-slate-500 transition-transform duration-300 ${isLangOpen ? 'rotate-180' : 'rotate-0'}`} 
              />
            </button>

            {/* DROPDOWN MENU */}
            {isLangOpen && (
              <div className="absolute right-0 mt-3 w-52 bg-[#0a0d12]/95 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-2xl shadow-2xl animate-in fade-in slide-in-from-top-2">
                <div className="p-2 flex flex-col gap-1">
                  <div className="px-3 py-2 text-[7px] font-black text-slate-500 uppercase tracking-[0.3em] border-b border-white/5 mb-1">
                    Select Signal Frequency
                  </div>
                  {languages.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => {
                        setSelectedLang(lang.code);
                        setIsLangOpen(false);
                      }}
                      className={`flex items-center justify-between px-4 py-3 rounded-xl transition-all ${
                        selectedLang === lang.code 
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10' 
                        : 'hover:bg-white/5 text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`${lang.flag} fis`}></span>
                        <span className="text-[11px] font-bold tracking-wider">{lang.label}</span>
                      </div>
                      {selectedLang === lang.code && (
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* --- CONTENT AREA --- */}
      <main className="flex-grow relative overflow-y-auto bg-[#05070a]">
        <div className={`absolute inset-0 pointer-events-none transition-opacity duration-1000 opacity-20 ${module.glow}`} />
        <Outlet context={{ isDarkMode: true, selectedLang, setSelectedLang }} />
      </main>
      
    </div>
  );
};

// --- 2. MAIN APP COMPONENT ---
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<SignToText />} />
          <Route path="/speechToSign" element={<SpeechToSign />} />
          <Route path="/duoMode" element={<DuoMode />} />
        </Route>

        {/* 404 PAGE */}
        <Route path="*" element={
          <div className="h-screen bg-[#05070a] flex flex-col items-center justify-center text-center p-6">
            <div className="w-24 h-24 bg-red-500/10 rounded-3xl flex items-center justify-center text-red-500 mb-8 border border-red-500/20">
              <Zap size={40} />
            </div>
            <h1 className="text-8xl font-black text-white mb-2 tracking-tighter">404</h1>
            <p className="text-slate-500 font-bold uppercase tracking-[0.4em] mb-12">Signal Lost in Space</p>
            <Link 
              to="/" 
              className="px-10 py-4 bg-white text-black rounded-full font-black text-xs uppercase tracking-widest hover:bg-emerald-400 transition-all shadow-2xl active:scale-95"
            >
              Return to Base
            </Link>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  );
}

export default App;