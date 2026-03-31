"use client";

import { useEffect, useRef, useState } from "react";

interface WaterProps {
  color?: string;
  opacity?: number;
}

export default function Water({
  color = "#7b93ff",
  opacity = 0.15,
}: WaterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tiltRef = useRef({ x: 0, y: 0 });
  const smoothRef = useRef({ x: 0, y: 0 });
  const [hasPermission, setHasPermission] = useState(false);
  const animRef = useRef<number>(0);

  const wavesRef = useRef([
    { amplitude: 4, frequency: 0.015, speed: 0.009, phase: 0 },
    { amplitude: 2.5, frequency: 0.025, speed: -0.006, phase: 2 },
    { amplitude: 1.5, frequency: 0.04, speed: 0.012, phase: 4 },
  ]);

  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      tiltRef.current = {
        x: Math.max(-1, Math.min(1, (e.gamma || 0) / 30)),
        y: Math.max(-1, Math.min(1, ((e.beta || 0) - 45) / 30)),
      };
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

    const handleMouse = (e: MouseEvent) => {
      tiltRef.current = {
        x: (e.clientX / window.innerWidth - 0.5) * 2,
        y: (e.clientY / window.innerHeight - 0.5) * 2,
      };
    };
    const handleTouch = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        tiltRef.current = {
          x: (e.touches[0].clientX / window.innerWidth - 0.5) * 2,
          y: (e.touches[0].clientY / window.innerHeight - 0.5) * 2,
        };
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

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      // Smooth interpolation
      const lerp = 0.025;
      smoothRef.current.x += (tiltRef.current.x - smoothRef.current.x) * lerp;
      smoothRef.current.y += (tiltRef.current.y - smoothRef.current.y) * lerp;
      const tx = smoothRef.current.x;
      const ty = smoothRef.current.y;

      const waves = wavesRef.current;
      waves.forEach((w) => { w.phase += w.speed; });

      // Determine which single edge the water pools on.
      // Like a real glass: water flows to the lowest point.
      // Default (no tilt): bottom.
      // Tilt right (tx > threshold): right edge.
      // Tilt left (tx < -threshold): left edge.
      // Tilt forward (ty < -threshold): top edge.
      //
      // Use the dominant axis to pick ONE edge.
      const absX = Math.abs(tx);
      const absY = Math.abs(ty);
      const threshold = 0.15;

      type Edge = "bottom" | "top" | "left" | "right";
      let edge: Edge = "bottom";
      let strength = 0.5 + Math.max(absX, absY) * 0.5; // 0.5 to 1.0

      if (absX > absY && absX > threshold) {
        edge = tx > 0 ? "right" : "left";
        strength = 0.5 + absX * 0.5;
      } else if (absY > absX && absY > threshold) {
        edge = ty > 0 ? "bottom" : "top";
        strength = 0.5 + absY * 0.5;
      }

      // Water depth: how far into the screen the water extends
      const maxDepth = edge === "bottom" || edge === "top" ? height * 0.12 : width * 0.1;
      const depth = maxDepth * strength;

      for (let layer = 0; layer < 2; layer++) {
        const layerOpacity = opacity - layer * 0.04;
        const layerShift = layer * 4;

        ctx.beginPath();

        if (edge === "bottom") {
          ctx.moveTo(0, height);
          for (let x = 0; x <= width; x += 2) {
            let waveY = 0;
            waves.forEach((w) => { waveY += Math.sin(x * w.frequency + w.phase + layer) * w.amplitude; });
            // Glass tilt slope: water is deeper on the side gravity pulls toward
            const slope = tx * ((x / width) - 0.5) * depth * 0.6;
            ctx.lineTo(x, height - depth - layerShift + waveY + slope);
          }
          ctx.lineTo(width, height);
          ctx.closePath();
          const grad = ctx.createLinearGradient(0, height, 0, height - depth * 2);
          grad.addColorStop(0, hexToRgba(color, layerOpacity));
          grad.addColorStop(1, hexToRgba(color, 0));
          ctx.fillStyle = grad;

        } else if (edge === "top") {
          ctx.moveTo(0, 0);
          for (let x = 0; x <= width; x += 2) {
            let waveY = 0;
            waves.forEach((w) => { waveY += Math.sin(x * w.frequency + w.phase + layer) * w.amplitude; });
            const slope = tx * ((x / width) - 0.5) * depth * 0.6;
            ctx.lineTo(x, depth + layerShift + waveY + slope);
          }
          ctx.lineTo(width, 0);
          ctx.closePath();
          const grad = ctx.createLinearGradient(0, 0, 0, depth * 2);
          grad.addColorStop(0, hexToRgba(color, layerOpacity));
          grad.addColorStop(1, hexToRgba(color, 0));
          ctx.fillStyle = grad;

        } else if (edge === "left") {
          ctx.moveTo(0, 0);
          for (let y = 0; y <= height; y += 2) {
            let waveX = 0;
            waves.forEach((w) => { waveX += Math.sin(y * w.frequency * 0.7 + w.phase + layer) * w.amplitude; });
            const slope = ty * ((y / height) - 0.5) * depth * 0.6;
            ctx.lineTo(depth + layerShift + waveX + slope, y);
          }
          ctx.lineTo(0, height);
          ctx.closePath();
          const grad = ctx.createLinearGradient(0, 0, depth * 2, 0);
          grad.addColorStop(0, hexToRgba(color, layerOpacity));
          grad.addColorStop(1, hexToRgba(color, 0));
          ctx.fillStyle = grad;

        } else if (edge === "right") {
          ctx.moveTo(width, 0);
          for (let y = 0; y <= height; y += 2) {
            let waveX = 0;
            waves.forEach((w) => { waveX += Math.sin(y * w.frequency * 0.7 + w.phase + layer) * w.amplitude; });
            const slope = ty * ((y / height) - 0.5) * depth * 0.6;
            ctx.lineTo(width - depth - layerShift + waveX + slope, y);
          }
          ctx.lineTo(width, height);
          ctx.closePath();
          const grad = ctx.createLinearGradient(width, 0, width - depth * 2, 0);
          grad.addColorStop(0, hexToRgba(color, layerOpacity));
          grad.addColorStop(1, hexToRgba(color, 0));
          ctx.fillStyle = grad;
        }

        ctx.fill();
      }

      animRef.current = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [color, opacity]);

  return (
    <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none" style={{ zIndex: 50 }} />
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
