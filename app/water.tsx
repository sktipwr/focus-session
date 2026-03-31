"use client";

import { useEffect, useRef, useState } from "react";

interface WaterProps {
  color?: string;
  opacity?: number;
}

export default function Water({
  color = "#7b93ff",
  opacity = 0.14,
}: WaterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Raw tilt from device (-1 to 1 on each axis)
  const tiltRef = useRef({ x: 0, y: 0 });
  // Smoothed tilt — this is what makes water "flow" not "snap"
  const smoothRef = useRef({ x: 0, y: 0 });
  const [hasPermission, setHasPermission] = useState(false);
  const animRef = useRef<number>(0);
  const phaseRef = useRef(0);

  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      // gamma: left-right tilt (-90 to 90). Positive = tilted right.
      // beta: front-back tilt (-180 to 180). ~0 = flat on table, 90 = upright.
      // We normalize so that holding phone upright (~beta 45-90) is "neutral"
      const gamma = e.gamma || 0;
      const beta = e.beta || 0;

      // Normalize to -1..1 range
      // gamma/40 gives full range at ~40 degrees tilt
      // (beta - 60)/40 so "normal hold" (~60 deg) is neutral
      tiltRef.current = {
        x: Math.max(-1, Math.min(1, gamma / 40)),
        y: Math.max(-1, Math.min(1, (beta - 60) / 40)),
      };
      if (!hasPermission) setHasPermission(true);
    };

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
          if (perm === "granted")
            window.addEventListener("deviceorientation", handleOrientation);
        } catch {}
      } else {
        window.addEventListener("deviceorientation", handleOrientation);
      }
    };
    requestPermission();

    return () => {
      window.removeEventListener("deviceorientation", handleOrientation);
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

      // Smooth interpolation — water flows gradually, not snapping
      // Lower = slower/more fluid movement
      const lerp = 0.02;
      smoothRef.current.x += (tiltRef.current.x - smoothRef.current.x) * lerp;
      smoothRef.current.y += (tiltRef.current.y - smoothRef.current.y) * lerp;

      const tx = smoothRef.current.x; // -1 left, +1 right
      const ty = smoothRef.current.y; // -1 forward/up, +1 back/down

      // Surface ripple phase
      phaseRef.current += 0.008;
      const phase = phaseRef.current;

      // ── PHYSICS MODEL ──
      // Think of the screen as a rectangular container viewed from above.
      // Gravity pulls water to the lowest point.
      //
      // For each pixel (x, y), compute its "height" in the gravity field:
      //   gravityHeight = tx * xNorm + ty * yNorm
      //
      // Where xNorm goes -1 (left) to +1 (right)
      //       yNorm goes -1 (top) to +1 (bottom)
      //
      // Pixels with LOW gravityHeight are "lower" — water pools there.
      // The water surface is at a threshold: pixels below it are underwater.
      //
      // When flat (tx≈0, ty≈0): gravityHeight ≈ 0 everywhere,
      //   but we add a bias so water defaults to the bottom (yNorm > 0).
      //
      // When tilted right: right side has high tx*xNorm, so LEFT side
      //   (negative xNorm) has lower height → water pools left.
      //   Wait — tilting RIGHT means gravity pulls RIGHT.
      //   So we want: gravityHeight = -tx * xNorm - ty * yNorm
      //   Lower height = where gravity pulls toward.

      // How much of the screen area is "water" (0 to 1)
      const waterVolume = 0.08; // 8% of screen area

      // Render using a scanline approach for performance
      // For each pixel row/column, determine the water boundary

      const tiltMagnitude = Math.sqrt(tx * tx + ty * ty);

      // Default gravity bias: when flat, water sits at bottom
      // As tilt increases, the bias fades and tilt takes over
      const flatBias = Math.max(0, 1 - tiltMagnitude * 3); // fades out by ~0.33 tilt

      // Scan every pixel and determine if it's underwater
      // For performance, use imageData at 2x downscale
      const scale = 2;
      const sw = Math.ceil(width / scale);
      const sh = Math.ceil(height / scale);
      const imageData = ctx.createImageData(sw, sh);
      const data = imageData.data;

      // Parse color
      const cr = parseInt(color.slice(1, 3), 16);
      const cg = parseInt(color.slice(3, 5), 16);
      const cb = parseInt(color.slice(5, 7), 16);

      // For each pixel, compute gravity height
      // Water fills the lowest waterVolume fraction
      // We need to find the threshold. Instead of sorting all pixels,
      // use the analytical approach: the water surface is a plane.

      // The water surface plane: gravityHeight = threshold
      // We set threshold so that ~waterVolume of the screen is below it.
      //
      // For a uniform rectangle, the fraction below threshold t is:
      //   area where (-tx * xNorm - ty * yNorm + flatBias * yNorm) < t
      //
      // This is complex analytically. Instead, use a simpler approach:
      // the water surface is at a distance from the "lowest corner".

      // Find the lowest corner
      // gravityDir points toward where gravity pulls water
      const gx = tx; // positive = water goes right
      const gy = -flatBias + ty; // positive = water goes down (with flat bias)

      // Normalize gravity direction
      const gLen = Math.sqrt(gx * gx + gy * gy) || 0.001;
      const gnx = gx / gLen;
      const gny = gy / gLen;

      // Water depth from the "low edge" inward
      // More tilt = water compresses to a thinner band on one side
      const depthFraction = waterVolume / Math.max(0.3, tiltMagnitude * 1.5 + 0.3);
      const maxDepth = Math.max(width, height) * depthFraction;

      for (let sy = 0; sy < sh; sy++) {
        for (let sx = 0; sx < sw; sx++) {
          const px = sx * scale;
          const py = sy * scale;

          // Normalized position: -1 to 1
          const xn = (px / width) * 2 - 1;
          const yn = (py / height) * 2 - 1;

          // Distance along gravity direction from center
          // Positive = toward where gravity pulls (water goes here)
          const gravDist = xn * gnx + yn * gny;

          // Water fills from the maximum gravDist inward
          // maxGravDist is ~1.41 (corner)
          const maxGravDist = Math.abs(gnx) + Math.abs(gny); // max possible
          const waterEdge = maxGravDist - maxDepth / (Math.max(width, height) * 0.5);

          if (gravDist > waterEdge) {
            // This pixel is underwater
            const depth = (gravDist - waterEdge) / (maxGravDist - waterEdge + 0.001);
            const clampedDepth = Math.min(1, Math.max(0, depth));

            // Surface ripple near the edge
            const distFromEdge = gravDist - waterEdge;
            const isNearSurface = distFromEdge < 0.15;
            let ripple = 0;
            if (isNearSurface) {
              ripple = Math.sin(px * 0.03 + phase * 3) * 3 +
                       Math.sin(py * 0.02 + phase * 2.5 + 1) * 2;
              // Convert ripple to a surface shift
              const surfaceShift = ripple * 0.02;
              if (distFromEdge + surfaceShift < 0) {
                // Ripple pushed this pixel above water
                continue;
              }
            }

            // Opacity: deeper = more opaque, surface = transparent
            const alpha = opacity * clampedDepth * (0.5 + clampedDepth * 0.5);

            const idx = (sy * sw + sx) * 4;
            data[idx] = cr;
            data[idx + 1] = cg;
            data[idx + 2] = cb;
            data[idx + 3] = Math.round(alpha * 255);
          }
        }
      }

      // Draw at 2x scale
      const offscreen = new OffscreenCanvas(sw, sh);
      const offCtx = offscreen.getContext("2d")!;
      offCtx.putImageData(imageData, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(offscreen, 0, 0, width, height);

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
