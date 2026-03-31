"use client";

import { useEffect, useRef, useState } from "react";

interface WaterProps {
  color?: string;
  opacity?: number;
}

export default function Water({
  color = "#7b93ff",
  opacity = 0.12,
}: WaterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tiltRef = useRef({ x: 0, y: 0 }); // x: left-right, y: front-back
  const smoothRef = useRef({ x: 0, y: 0 });
  const [hasPermission, setHasPermission] = useState(false);
  const animRef = useRef<number>(0);

  const wavesRef = useRef([
    { amplitude: 3, frequency: 0.012, speed: 0.008, phase: 0 },
    { amplitude: 2, frequency: 0.02, speed: -0.006, phase: 2 },
    { amplitude: 1.2, frequency: 0.035, speed: 0.01, phase: 4 },
  ]);

  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      // gamma: left-right (-90 to 90), beta: front-back (-180 to 180)
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

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      // Smooth interpolation
      const lerp = 0.025;
      smoothRef.current.x += (tiltRef.current.x - smoothRef.current.x) * lerp;
      smoothRef.current.y += (tiltRef.current.y - smoothRef.current.y) * lerp;
      const tx = smoothRef.current.x; // -1 left, +1 right
      const ty = smoothRef.current.y; // -1 top, +1 bottom

      const waves = wavesRef.current;
      waves.forEach((w) => { w.phase += w.speed; });

      // Water level calculation:
      // Think of the screen as a container. The "water" always has
      // the same volume. Gravity pulls it toward the lowest corner.
      //
      // We compute for each pixel (x, y) how "deep" the water is there.
      // depth = baseFill + tiltX_contribution + tiltY_contribution
      //
      // tiltX: when tx > 0, right side is lower → water pools right
      // tiltY: when ty > 0, bottom is lower → water pools at bottom
      //        when ty < 0, top is lower → water flows to top
      //
      // xNorm: -1 (left) to +1 (right)
      // yNorm: -1 (top) to +1 (bottom)
      //
      // Water depth at (x,y) = base + tx * xNorm * strength + ty * yNorm * strength

      const baseWaterLevel = 0.15; // 15% of screen covered when flat
      const tiltStrength = 0.35; // how much tilt shifts the water

      for (let layer = 0; layer < 2; layer++) {
        const layerOpacity = opacity - layer * 0.03;
        ctx.beginPath();

        // We need to trace the water surface contour around the screen.
        // The water fills from the edges inward based on gravity.
        // For each edge, compute the water height at that point.

        // Helper: compute water depth at normalized position
        const waterDepth = (xNorm: number, yNorm: number): number => {
          // Tilt contribution: positive means more water here
          const tiltContrib = tx * xNorm * tiltStrength + ty * yNorm * tiltStrength;
          return baseWaterLevel + tiltContrib;
        };

        // Draw water on all 4 edges based on gravity
        // Bottom edge
        const bottomPoints: [number, number][] = [];
        for (let x = 0; x <= width; x += 3) {
          const xNorm = (x / width) * 2 - 1;
          const depth = waterDepth(xNorm, 1); // bottom edge yNorm = 1
          if (depth > 0) {
            let waveY = 0;
            waves.forEach((w) => { waveY += Math.sin(x * w.frequency + w.phase + layer) * w.amplitude; });
            bottomPoints.push([x, height - depth * height * 0.7 + waveY]);
          }
        }

        // Top edge
        const topPoints: [number, number][] = [];
        for (let x = 0; x <= width; x += 3) {
          const xNorm = (x / width) * 2 - 1;
          const depth = waterDepth(xNorm, -1); // top edge yNorm = -1
          if (depth > 0) {
            let waveY = 0;
            waves.forEach((w) => { waveY += Math.sin(x * w.frequency + w.phase + layer + 1) * w.amplitude; });
            topPoints.push([x, depth * height * 0.7 + waveY]);
          }
        }

        // Left edge
        const leftPoints: [number, number][] = [];
        for (let y = 0; y <= height; y += 3) {
          const yNorm = (y / height) * 2 - 1;
          const depth = waterDepth(-1, yNorm); // left edge xNorm = -1
          if (depth > 0) {
            let waveY = 0;
            waves.forEach((w) => { waveY += Math.sin(y * w.frequency * 0.8 + w.phase + layer + 2) * w.amplitude; });
            leftPoints.push([depth * width * 0.5 + waveY, y]);
          }
        }

        // Right edge
        const rightPoints: [number, number][] = [];
        for (let y = 0; y <= height; y += 3) {
          const yNorm = (y / height) * 2 - 1;
          const depth = waterDepth(1, yNorm); // right edge xNorm = 1
          if (depth > 0) {
            let waveY = 0;
            waves.forEach((w) => { waveY += Math.sin(y * w.frequency * 0.8 + w.phase + layer + 3) * w.amplitude; });
            rightPoints.push([width - depth * width * 0.5 + waveY, y]);
          }
        }

        // Draw bottom water
        if (bottomPoints.length > 1) {
          ctx.beginPath();
          ctx.moveTo(0, height);
          bottomPoints.forEach(([x, y]) => ctx.lineTo(x, y));
          ctx.lineTo(width, height);
          ctx.closePath();
          const grad = ctx.createLinearGradient(0, height, 0, height * 0.5);
          grad.addColorStop(0, hexToRgba(color, layerOpacity));
          grad.addColorStop(1, hexToRgba(color, layerOpacity * 0.3));
          ctx.fillStyle = grad;
          ctx.fill();
        }

        // Draw top water
        if (topPoints.length > 1) {
          ctx.beginPath();
          ctx.moveTo(0, 0);
          topPoints.forEach(([x, y]) => ctx.lineTo(x, y));
          ctx.lineTo(width, 0);
          ctx.closePath();
          const grad = ctx.createLinearGradient(0, 0, 0, height * 0.5);
          grad.addColorStop(0, hexToRgba(color, layerOpacity));
          grad.addColorStop(1, hexToRgba(color, layerOpacity * 0.3));
          ctx.fillStyle = grad;
          ctx.fill();
        }

        // Draw left water
        if (leftPoints.length > 1) {
          ctx.beginPath();
          ctx.moveTo(0, 0);
          leftPoints.forEach(([x, y]) => ctx.lineTo(x, y));
          ctx.lineTo(0, height);
          ctx.closePath();
          const grad = ctx.createLinearGradient(0, 0, width * 0.5, 0);
          grad.addColorStop(0, hexToRgba(color, layerOpacity));
          grad.addColorStop(1, hexToRgba(color, layerOpacity * 0.3));
          ctx.fillStyle = grad;
          ctx.fill();
        }

        // Draw right water
        if (rightPoints.length > 1) {
          ctx.beginPath();
          ctx.moveTo(width, 0);
          rightPoints.forEach(([x, y]) => ctx.lineTo(x, y));
          ctx.lineTo(width, height);
          ctx.closePath();
          const grad = ctx.createLinearGradient(width, 0, width * 0.5, 0);
          grad.addColorStop(0, hexToRgba(color, layerOpacity));
          grad.addColorStop(1, hexToRgba(color, layerOpacity * 0.3));
          ctx.fillStyle = grad;
          ctx.fill();
        }
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
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 50 }}
    />
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
