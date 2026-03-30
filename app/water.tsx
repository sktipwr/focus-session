"use client";

import { useEffect, useRef, useState } from "react";

interface WaterProps {
  color?: string;
  height?: number;
  opacity?: number;
}

export default function Water({
  color = "#5c7cfa",
  height = 80,
  opacity = 0.3,
}: WaterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tiltRef = useRef({ x: 0, y: 0 });
  const [hasPermission, setHasPermission] = useState(false);
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);

  // Water simulation params
  const wavesRef = useRef([
    { amplitude: 12, frequency: 0.02, speed: 0.03, phase: 0 },
    { amplitude: 8, frequency: 0.035, speed: -0.02, phase: 2 },
    { amplitude: 5, frequency: 0.05, speed: 0.04, phase: 4 },
  ]);

  useEffect(() => {
    // Try to get device orientation
    const handleOrientation = (e: DeviceOrientationEvent) => {
      const gamma = (e.gamma || 0) / 45; // left-right tilt, normalized -1 to 1
      const beta = ((e.beta || 0) - 45) / 45; // front-back tilt
      tiltRef.current = {
        x: Math.max(-1, Math.min(1, gamma)),
        y: Math.max(-1, Math.min(1, beta)),
      };
      if (!hasPermission) setHasPermission(true);
    };

    // For iOS 13+ permission
    const requestPermission = async () => {
      if (
        typeof DeviceOrientationEvent !== "undefined" &&
        "requestPermission" in DeviceOrientationEvent
      ) {
        try {
          const perm = await (
            DeviceOrientationEvent as unknown as {
              requestPermission: () => Promise<string>;
            }
          ).requestPermission();
          if (perm === "granted") {
            window.addEventListener("deviceorientation", handleOrientation);
          }
        } catch {
          // fallback to mouse
        }
      } else {
        window.addEventListener("deviceorientation", handleOrientation);
      }
    };

    requestPermission();

    // Mouse/touch fallback for desktop
    const handleMouse = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 2;
      const y = (e.clientY / window.innerHeight - 0.5) * 2;
      tiltRef.current = { x, y };
    };

    const handleTouch = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const x = (e.touches[0].clientX / window.innerWidth - 0.5) * 2;
        const y = (e.touches[0].clientY / window.innerHeight - 0.5) * 2;
        tiltRef.current = { x, y };
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

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = height;
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const { width } = canvas;
      timeRef.current += 1;
      ctx.clearRect(0, 0, width, height);

      const tiltX = tiltRef.current.x;
      const waves = wavesRef.current;

      // Update wave phases based on tilt
      waves.forEach((w) => {
        w.phase += w.speed + tiltX * 0.02;
      });

      // Draw multiple wave layers
      for (let layer = 0; layer < 3; layer++) {
        const layerOpacity = opacity - layer * 0.08;
        const layerOffset = layer * 8;

        ctx.beginPath();
        ctx.moveTo(0, height);

        for (let x = 0; x <= width; x += 2) {
          let y = layerOffset;
          waves.forEach((w) => {
            const tiltAmplitude = w.amplitude * (1 + Math.abs(tiltX) * 0.8);
            y +=
              Math.sin(x * w.frequency + w.phase + tiltX * 2) * tiltAmplitude;
          });
          // Add a slight water level shift based on tilt
          y += tiltX * 15 * ((x / width - 0.5) * 2);
          ctx.lineTo(x, y + 20);
        }

        ctx.lineTo(width, height);
        ctx.closePath();

        // Gradient fill
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(
          0,
          hexToRgba(color, Math.max(0, layerOpacity - 0.1))
        );
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
