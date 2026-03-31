"use client";

import { useEffect, useRef, useState } from "react";

interface WaterProps {
  color?: string;
  height?: number;
  opacity?: number;
}

export default function Water({
  color = "#7b93ff",
  height = 70,
  opacity = 0.25,
}: WaterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tiltRef = useRef({ x: 0, y: 0 });
  const smoothTiltRef = useRef({ x: 0, y: 0 });
  const [hasPermission, setHasPermission] = useState(false);
  const animRef = useRef<number>(0);

  // Calm, gentle waves
  const wavesRef = useRef([
    { amplitude: 6, frequency: 0.015, speed: 0.012, phase: 0 },
    { amplitude: 4, frequency: 0.025, speed: -0.008, phase: 2 },
    { amplitude: 2.5, frequency: 0.04, speed: 0.015, phase: 4 },
  ]);

  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      const gamma = (e.gamma || 0) / 45;
      tiltRef.current = {
        x: Math.max(-1, Math.min(1, gamma)),
        y: Math.max(-1, Math.min(1, ((e.beta || 0) - 45) / 45)),
      };
      if (!hasPermission) setHasPermission(true);
    };

    // iOS 13+ permission
    const requestPermission = async () => {
      if (typeof DeviceOrientationEvent !== "undefined" && "requestPermission" in DeviceOrientationEvent) {
        try {
          const perm = await (DeviceOrientationEvent as unknown as { requestPermission: () => Promise<string> }).requestPermission();
          if (perm === "granted") window.addEventListener("deviceorientation", handleOrientation);
        } catch {}
      } else {
        window.addEventListener("deviceorientation", handleOrientation);
      }
    };
    requestPermission();

    // Mouse/touch fallback
    const handleMouse = (e: MouseEvent) => {
      tiltRef.current = { x: (e.clientX / window.innerWidth - 0.5) * 2, y: (e.clientY / window.innerHeight - 0.5) * 2 };
    };
    const handleTouch = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        tiltRef.current = { x: (e.touches[0].clientX / window.innerWidth - 0.5) * 2, y: (e.touches[0].clientY / window.innerHeight - 0.5) * 2 };
      }
    };
    window.addEventListener("mousemove", handleMouse);
    window.addEventListener("touchmove", handleTouch, { passive: true });

    return () => {
      window.removeEventListener("deviceorientation", handleOrientation);
      window.removeEventListener("mousemove", handleMouse);
      window.removeEventListener("touchmove", handleTouch);
    };
  }, [hasPermission]);

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

      // Smooth interpolation of tilt — makes it feel fluid, not jittery
      const lerp = 0.04;
      smoothTiltRef.current.x += (tiltRef.current.x - smoothTiltRef.current.x) * lerp;
      smoothTiltRef.current.y += (tiltRef.current.y - smoothTiltRef.current.y) * lerp;
      const tiltX = smoothTiltRef.current.x;

      const waves = wavesRef.current;
      waves.forEach((w) => { w.phase += w.speed + tiltX * 0.005; });

      // Draw 3 translucent wave layers
      for (let layer = 0; layer < 3; layer++) {
        const layerOpacity = opacity - layer * 0.06;
        const layerOffset = layer * 6;

        ctx.beginPath();
        ctx.moveTo(0, height);

        for (let x = 0; x <= width; x += 2) {
          let y = layerOffset;
          waves.forEach((w) => {
            const a = w.amplitude * (1 + Math.abs(tiltX) * 0.5);
            y += Math.sin(x * w.frequency + w.phase + tiltX * 1.5) * a;
          });
          // Water level shifts gently with tilt
          y += tiltX * 8 * ((x / width - 0.5) * 2);
          ctx.lineTo(x, y + 18);
        }

        ctx.lineTo(width, height);
        ctx.closePath();

        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, hexToRgba(color, Math.max(0, layerOpacity - 0.05)));
        gradient.addColorStop(1, hexToRgba(color, layerOpacity));
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [color, height, opacity]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed bottom-0 left-0 right-0 pointer-events-none"
      style={{ height, zIndex: 50 }}
    />
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
