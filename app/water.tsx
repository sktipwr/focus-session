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
  opacity = 0.22,
}: WaterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tiltRef = useRef(0); // -1 (left) to 1 (right)
  const smoothTiltRef = useRef(0);
  const [hasPermission, setHasPermission] = useState(false);
  const animRef = useRef<number>(0);

  // Gentle wave params
  const wavesRef = useRef([
    { amplitude: 4, frequency: 0.018, speed: 0.01, phase: 0 },
    { amplitude: 2.5, frequency: 0.03, speed: -0.007, phase: 2 },
    { amplitude: 1.5, frequency: 0.045, speed: 0.013, phase: 4 },
  ]);

  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      // gamma: left-right tilt in degrees (-90 to 90)
      // Positive gamma = tilted right, negative = tilted left
      // We invert it: tilt right → water pools right (positive = right side higher)
      tiltRef.current = Math.max(-1, Math.min(1, (e.gamma || 0) / 35));
      if (!hasPermission) setHasPermission(true);
    };

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

    // Mouse/touch fallback for desktop
    const handleMouse = (e: MouseEvent) => {
      tiltRef.current = (e.clientX / window.innerWidth - 0.5) * 2;
    };
    const handleTouch = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        tiltRef.current = (e.touches[0].clientX / window.innerWidth - 0.5) * 2;
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

      // Smooth interpolation — water eases toward tilt like real liquid
      const lerp = 0.03;
      smoothTiltRef.current += (tiltRef.current - smoothTiltRef.current) * lerp;
      const tilt = smoothTiltRef.current; // -1 (tilted left) to 1 (tilted right)

      const waves = wavesRef.current;
      waves.forEach((w) => { w.phase += w.speed; });

      // Draw 3 wave layers
      for (let layer = 0; layer < 3; layer++) {
        const layerOpacity = opacity - layer * 0.05;
        const layerOffset = layer * 5;

        ctx.beginPath();
        ctx.moveTo(0, height);

        for (let x = 0; x <= width; x += 2) {
          // Base wave ripple (gentle surface movement)
          let waveY = 0;
          waves.forEach((w) => {
            waveY += Math.sin(x * w.frequency + w.phase) * w.amplitude;
          });

          // GRAVITY / GLASS PHYSICS:
          // When tilt > 0 (phone tilted right), water pools on the right.
          // The water surface becomes a slope: left side lower, right side higher.
          // This is like tilting a glass — the water level follows gravity.
          //
          // xNorm goes from -1 (left edge) to +1 (right edge)
          const xNorm = (x / width) * 2 - 1;
          // Water displacement: tilt * xNorm gives a linear slope
          // Positive tilt + positive xNorm (right side) = water rises on right
          const gravityOffset = tilt * xNorm * 25;

          // Combined: base offset + ripple + gravity
          const y = layerOffset + 15 + waveY + gravityOffset;

          ctx.lineTo(x, y);
        }

        ctx.lineTo(width, height);
        ctx.closePath();

        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, hexToRgba(color, Math.max(0, layerOpacity * 0.6)));
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
