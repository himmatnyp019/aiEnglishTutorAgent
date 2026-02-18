
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { ConnectionStatus, TranscriptionEntry } from './types';
import { decode, decodeAudioData, createBlob } from './utils/audioUtils';
import Visualizer from './components/Visualizer';
import Transcript from './components/Transcript';

// Base URL for your Node.js backend
// Ensure your backend has CORS enabled: app.use(cors())
const BACKEND_URL = 'http://localhost:4000/api/ai';
const MOCK_USER_ID = 'student_123';

const App: React.FC = () => {
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [transcripts, setTranscripts] = useState<TranscriptionEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [questionNumber, setQuestionNumber] = useState<number>(0);
  // Initialize with a safe default to prevent "Failed to fetch" from breaking the UI
  const [userProfile, setUserProfile] = useState<any>({ currentLevel: 'Beginner', xp: 0 });
  const [isSyncing, setIsSyncing] = useState(false);

  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const currentInputRef = useRef('');
  const currentOutputRef = useRef('');
  const sessionRef = useRef<any>(null);

  // 1. Fetch User Profile from Backend on Mount with Resiliency
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/profile/${MOCK_USER_ID}`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          mode: 'cors'
        });
        
        if (response.ok) {
          const data = await response.json();
          setUserProfile(data);
          console.log("Profile loaded from MongoDB:", data.currentLevel);
        }
      } catch (e) {
        // Log error but keep the default 'Beginner' state so the app is usable
        console.warn("Backend unreachable. Running in offline/mock mode.", e);
      }
    };
    fetchProfile();
  }, []);

  // 2. Sync Final Data to Backend - Mapping to ConversationLog Schema
  const saveSessionToBackend = async (finalTranscript: TranscriptionEntry[]) => {
    setIsSyncing(true);
    try {
      const response = await fetch(`${BACKEND_URL}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        mode: 'cors',
        body: JSON.stringify({
          userId: MOCK_USER_ID,
          message: "SESSION_COMPLETE_TRANSCRIPT",
          fullTranscript: finalTranscript // Matches handleChat logic in controller.js
        }),
      });
      
      if (response.ok) {
        console.log("Session successfully synchronized with MongoDB collections.");
      }
    } catch (e) {
      console.error("Failed to sync session to backend:", e);
    } finally {
      setIsSyncing(false);
    }
  };

  const stopSession = useCallback(() => {
    if (sessionRef.current) sessionRef.current = null;
    activeSourcesRef.current.forEach(source => { try { source.stop(); } catch(e) {} });
    activeSourcesRef.current.clear();
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    if (inputAudioContextRef.current) inputAudioContextRef.current.close();
    if (outputAudioContextRef.current) outputAudioContextRef.current.close();
    inputAudioContextRef.current = null;
    outputAudioContextRef.current = null;
    nextStartTimeRef.current = 0;
    
    // Save the conversation to MongoDB if it happened
    if (transcripts.length > 0) {
      saveSessionToBackend(transcripts);
    }

    setQuestionNumber(0);
    setStatus(ConnectionStatus.DISCONNECTED);
  }, [transcripts]);

  const startSession = async () => {
    try {
      setStatus(ConnectionStatus.CONNECTING);
      setError(null);
      setTranscripts([]);

      const currentLevel = userProfile?.currentLevel || 'Beginner';
      const DYNAMIC_INSTRUCTION = `You are the "LinguaLive Interviewer". User Level: ${currentLevel}.
      
      STRICT PROTOCOL:
      1. START: Introduce yourself and ask Level ${currentLevel} Question 1 of 10.
      2. FLOW: Ask 10 questions total. Always prefix with "Question X of 10:".
      3. LEVELING: 
         - Beginner: Simple present, family, colors, basic needs.
         - Intermediate: Past/Future tenses, hobbies, career, travel.
         - Advanced: Abstract concepts, complex workplace problem solving, idioms.
      4. TOPIC GATE: ONLY discuss English learning. If user goes off-topic, bring them back.
      5. FINAL REPORT: After 10 answers, output "FINAL PROGRESS REPORT" followed by:
         FLUENCY SCORE: [X]/100
         GRAMMAR SCORE: [X]/100
         VOCABULARY SCORE: [X]/100
         Feedback: [Your summary]`;

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      analyzerRef.current = inputAudioContextRef.current.createAnalyser();
      analyzerRef.current.fftSize = 256;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setStatus(ConnectionStatus.CONNECTED);
            if (!inputAudioContextRef.current || !streamRef.current) return;
            const source = inputAudioContextRef.current.createMediaStreamSource(streamRef.current);
            const scriptProcessor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
            source.connect(analyzerRef.current!);
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob })).catch(() => {});
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.inputTranscription) {
              currentInputRef.current += message.serverContent.inputTranscription.text;
            } else if (message.serverContent?.outputTranscription) {
              const text = message.serverContent.outputTranscription.text;
              currentOutputRef.current += text;
              
              const match = text.match(/Question (\d+) of 10/i);
              if (match) setQuestionNumber(parseInt(match[1]));
              if (text.toUpperCase().includes("FINAL PROGRESS REPORT")) setQuestionNumber(11);
            }

            if (message.serverContent?.turnComplete) {
              const userText = currentInputRef.current.trim();
              const tutorText = currentOutputRef.current.trim();
              const newEntries: TranscriptionEntry[] = [];
              // Using MongoDB schema properties: role/content
              if (userText) newEntries.push({ role: 'user', content: userText, timestamp: Date.now() });
              if (tutorText) newEntries.push({ role: 'assistant', content: tutorText, timestamp: Date.now() });
              if (newEntries.length > 0) setTranscripts(prev => [...prev, ...newEntries]);
              currentInputRef.current = '';
              currentOutputRef.current = '';
            }

            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData && outputAudioContextRef.current) {
              const ctx = outputAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const buffer = await decodeAudioData(decode(audioData), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = buffer;
              source.connect(ctx.destination);
              source.onended = () => activeSourcesRef.current.delete(source);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              activeSourcesRef.current.add(source);
            }

            if (message.serverContent?.interrupted) {
              activeSourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
              activeSourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onerror: (err) => { setError("AI Error: Connection failed."); stopSession(); },
          onclose: () => stopSession()
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: DYNAMIC_INSTRUCTION,
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      setError(err.message || "Failed to start.");
      setStatus(ConnectionStatus.DISCONNECTED);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-5xl mx-auto p-4 md:p-6 lg:p-8">
      <header className="flex items-center justify-between mb-8 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center shadow-indigo-200 shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight">LinguaLive AI</h1>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-bold text-indigo-600 px-2 py-0.5 bg-indigo-50 rounded-full uppercase tracking-widest">
                {userProfile?.currentLevel || 'Beginner'}
              </span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">XP: {userProfile?.xp || 0}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {isSyncing && (
            <div className="flex items-center text-[10px] font-bold text-indigo-400 animate-pulse uppercase tracking-widest">
              Syncing to MongoDB...
            </div>
          )}
          <div className={`px-3 py-1 rounded-full border border-slate-200 flex items-center space-x-2 ${status === ConnectionStatus.CONNECTED ? 'bg-green-50' : 'bg-slate-50'}`}>
            <div className={`w-2 h-2 rounded-full ${status === ConnectionStatus.CONNECTED ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`} />
            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{status}</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col space-y-4 overflow-hidden">
        <Transcript entries={transcripts} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-6">
          <div className="md:col-span-2 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Interview Progress</span>
              <span className="text-xs font-bold text-indigo-600">{questionNumber <= 10 ? `${questionNumber}/10` : 'Final Review'}</span>
            </div>
            <Visualizer analyser={analyzerRef.current} isActive={status === ConnectionStatus.CONNECTED} />
          </div>

          <div className="flex flex-col space-y-3">
            {status !== ConnectionStatus.CONNECTED ? (
              <button
                onClick={startSession}
                disabled={status === ConnectionStatus.CONNECTING}
                className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl shadow-lg transition-all active:scale-[0.98] flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                <span>Start {userProfile?.currentLevel} Interview</span>
              </button>
            ) : (
              <button
                onClick={stopSession}
                className="flex-1 py-4 bg-slate-900 hover:bg-black text-white font-black rounded-2xl shadow-lg transition-all active:scale-[0.98] flex items-center justify-center space-x-2"
              >
                <span>End & Sync Progress</span>
              </button>
            )}
            <p className="text-[9px] text-center text-slate-400 font-bold uppercase tracking-widest leading-none">
              Auto-sync to profile: {MOCK_USER_ID}
            </p>
          </div>
        </div>
      </main>

      {error && (
        <div className="fixed bottom-6 right-6 bg-red-600 text-white px-6 py-3 rounded-xl shadow-2xl text-sm font-bold animate-bounce">
          {error}
        </div>
      )}
    </div>
  );
};

export default App;
