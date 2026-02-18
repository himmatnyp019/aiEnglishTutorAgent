
import React, { useEffect, useRef } from 'react';
import { TranscriptionEntry } from '../types';

interface TranscriptProps {
  entries: TranscriptionEntry[];
}

const Transcript: React.FC<TranscriptProps> = ({ entries }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  return (
    <div 
      ref={scrollRef}
      className="flex-1 overflow-y-auto p-4 space-y-4 bg-white rounded-xl shadow-inner border border-slate-200"
    >
      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-2">
          <p className="text-sm italic">"Hello! I am your English tutor. Let's start practicing!"</p>
          <div className="text-xs">Click 'Start Session' to begin speaking.</div>
        </div>
      ) : (
        entries.map((entry, idx) => (
          <div 
            key={idx} 
            className={`flex flex-col ${entry.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div 
              className={`max-w-[80%] px-4 py-2 rounded-2xl text-sm ${
                entry.role === 'user' 
                  ? 'bg-blue-600 text-white rounded-tr-none' 
                  : 'bg-slate-100 text-slate-800 rounded-tl-none'
              }`}
            >
              {entry.content}
            </div>
            <span className="text-[10px] text-slate-400 mt-1 uppercase font-medium">
              {entry.role === 'assistant' ? 'tutor' : entry.role}
            </span>
          </div>
        ))
      )}
    </div>
  );
};

export default Transcript;
