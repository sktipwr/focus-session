"use client";

import { useEffect, useRef } from "react";

interface WaterProps {
  color?: string;
  height?: number;
  opacity?: number;
}

export default function Water({
  color = "#e8d44d",
  height = 50,
  opacity = 0.1,
}: WaterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const phaseRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => { canvas.width = window.innerWidth; canvas.height = height; };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const { width } = canvas;
      ctx.clearRect(0, 0, width, height);
      phaseRef.current += 0.006;
      const p = phaseRef.current;

      for (let layer = 0; layer < 2; layer++) {
        const a = opacity - layer * 0.03;
        ctx.beginPath();
        ctx.moveTo(0, height);
        for (let x = 0; x <= width; x += 2) {
          const y = layer * 4 + 16
            + Math.sin(x * 0.012 + p + layer) * 4
            + Math.sin(x * 0.02 + p * 1.3 + 2) * 2.5
            + Math.sin(x * 0.035 + p * 0.8 + 4) * 1.5;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(width, height);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, 0, 0, height);
        g.addColorStop(0, hexToRgba(color, a * 0.5));
        g.addColorStop(1, hexToRgba(color, a));
        ctx.fillStyle = g;
        ctx.fill();
      }
      animRef.current = requestAnimationFrame(draw);
    };
    draw();

    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener("resize", resize); };
  }, [color, height, opacity]);

  return <canvas ref={canvasRef} className="fixed bottom-0 left-0 right-0 pointer-events-none" style={{ height, zIndex: 30 }} />;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
