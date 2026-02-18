
import React, { useRef, useEffect } from 'react';
import { AudioVisualizerProps } from '../types';

const Visualizer: React.FC<AudioVisualizerProps> = ({ analyser, isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Initialize animationRef with 0 to satisfy TypeScript's useRef argument requirement
  const animationRef = useRef<number>(0);

  useEffect(() => {
    if (!canvasRef.current || !analyser) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] / 2;

        if (isActive) {
          ctx.fillStyle = `rgb(59, 130, 246)`; // Tailwind blue-500
        } else {
          ctx.fillStyle = `rgb(203, 213, 225)`; // Tailwind slate-300
        }

        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [analyser, isActive]);

  return (
    <canvas 
      ref={canvasRef} 
      className="w-full h-24 rounded-lg bg-slate-100/50"
      width={600}
      height={100}
    />
  );
};

export default Visualizer;
