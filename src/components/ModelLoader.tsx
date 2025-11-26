import React, { useEffect, useState } from 'react';
import { Loader2, Cpu, Wifi, HardDrive } from 'lucide-react';

interface Props {
  status: 'idle' | 'loading_model' | 'ready' | 'analyzing' | 'error';
  progress: { file: string; progress: number; status: string } | null;
}

export function ModelLoader({ status, progress }: Props) {
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.');
    }, 500);
    return () => clearInterval(interval);
  }, []);

  if (status === 'ready' || status === 'idle') return null;

  const isDownloading = status === 'loading_model';
  const percent = progress ? Math.round(progress.progress) : 0;
  const fileName = progress ? progress.file : 'Initialize...';

  return (
    <div className="fixed inset-0 z-50 bg-neutral-950/90 backdrop-blur-md flex items-center justify-center text-amber-500 font-mono">
      <div className="w-full max-w-md p-8 border border-amber-900/50 bg-black/80 rounded-lg shadow-2xl relative overflow-hidden">
        
        {/* Scanline effect */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-0 pointer-events-none bg-[length:100%_2px,3px_100%] opacity-20" />

        <div className="relative z-10 flex flex-col gap-6">
          <div className="flex items-center justify-between border-b border-amber-900/30 pb-4">
            <h2 className="text-xl font-bold tracking-widest flex items-center gap-3">
              <Cpu className="w-6 h-6 animate-pulse" />
              AI VISION SYSTEM
            </h2>
            <span className="text-xs text-amber-700">v2.0.4-ALPHA</span>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm text-amber-400/80">
              <span className="flex items-center gap-2">
                {isDownloading ? <Wifi className="w-4 h-4" /> : <HardDrive className="w-4 h-4" />}
                {isDownloading ? 'DOWNLOADING NEURAL NETWORK' : 'ANALYZING VISUAL DATA'}
              </span>
              <span>{isDownloading ? `${percent}%` : 'PROCESSING'}</span>
            </div>

            {/* Progress Bar */}
            <div className="h-2 bg-amber-900/30 rounded-full overflow-hidden border border-amber-900/50">
              <div 
                className="h-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)] transition-all duration-200 ease-out relative"
                style={{ width: `${isDownloading ? percent : 100}%` }}
              >
                {!isDownloading && (
                  <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                )}
              </div>
            </div>

            <div className="h-12 bg-neutral-900/50 border border-amber-900/30 rounded p-2 font-mono text-xs text-amber-300/70 overflow-hidden flex flex-col justify-end">
              <p>{'>'} {fileName}</p>
              <p>{'>'} {isDownloading ? 'Allocating memory...' : 'Extracting features...'}{dots}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
