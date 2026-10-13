"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

// 4x4 Bayer dithering matrix
const BAYER_4X4 = new Uint8Array([
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
]);

// Permutation table for Ken Perlin's Improved Noise
const PERM_TABLE = new Uint8Array(512);
const PERM_BASE = Array.from({ length: 256 }, (_, i) => i);

// Deterministic seed for stable initialization across runs
for (let i = 255; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [PERM_BASE[i], PERM_BASE[j]] = [PERM_BASE[j], PERM_BASE[i]];
}

PERM_BASE.forEach((val, idx) => {
  PERM_TABLE[idx] = val;
  PERM_TABLE[256 + idx] = val;
});

function grad(hash: number, x: number, y: number, z: number): number {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

function noise3D(x: number, y: number, z: number): number {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const Z = Math.floor(z) & 255;

  const fx = x - Math.floor(x);
  const fy = y - Math.floor(y);
  const fz = z - Math.floor(z);

  // Quintic fade curves: 6t^5 - 15t^4 + 10t^3
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const w = fz * fz * fz * (fz * (fz * 6 - 15) + 10);

  const A = PERM_TABLE[X] + Y;
  const AA = PERM_TABLE[A] + Z;
  const AB = PERM_TABLE[A + 1] + Z;
  const B = PERM_TABLE[X + 1] + Y;
  const BA = PERM_TABLE[B] + Z;
  const BB = PERM_TABLE[B + 1] + Z;

  const g000 = grad(PERM_TABLE[AA], fx, fy, fz);
  const g100 = grad(PERM_TABLE[BA], fx - 1, fy, fz);
  const g010 = grad(PERM_TABLE[AB], fx, fy - 1, fz);
  const g110 = grad(PERM_TABLE[BB], fx - 1, fy - 1, fz);
  const g001 = grad(PERM_TABLE[AA + 1], fx, fy, fz - 1);
  const g101 = grad(PERM_TABLE[BA + 1], fx - 1, fy, fz - 1);
  const g011 = grad(PERM_TABLE[AB + 1], fx, fy - 1, fz - 1);
  const g111 = grad(PERM_TABLE[BB + 1], fx - 1, fy - 1, fz - 1);

  const x1 = g000 + u * (g100 - g000);
  const x2 = g010 + u * (g110 - g010);
  const y1 = x1 + v * (x2 - x1);

  const x3 = g001 + u * (g101 - g001);
  const x4 = g011 + u * (g111 - g011);
  const y2 = x3 + v * (x4 - x3);

  return y1 + w * (y2 - y1);
}

function parseHexColor(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  if (clean.length === 3) {
    const r = ((num >> 8) & 0xf) * 17;
    const g = ((num >> 4) & 0xf) * 17;
    const b = (num & 0xf) * 17;
    return [r, g, b];
  }
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export interface MarketingPixelBackgroundProps {
  pixelSize?: number;
  color?: string;
  darkColor?: string;
  scale?: number;
  speed?: number;
  band?: boolean;
  edgeFade?: number;
  fixed?: boolean;
  className?: string;
  style?: React.CSSProperties;
  "data-testid"?: string;
}

export function MarketingPixelBackground({
  pixelSize = 5,
  color = "#1e7d62",
  darkColor = "#1b8266",
  scale = 0.025,
  speed = 0.25,
  band = true,
  edgeFade = 0.15,
  fixed = true,
  className,
  style,
  "data-testid": testId = "marketing-background",
}: MarketingPixelBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
    if (!ctx) return;

    const [baseR, baseG, baseB] = parseHexColor(color);
    const baseColorUint32 = (baseR | (baseG << 8) | (baseB << 16)) >>> 0;

    const [darkR, darkG, darkB] = parseHexColor(darkColor);
    const darkColorUint32 = (darkR | (darkG << 8) | (darkB << 16)) >>> 0;

    const getSize = () =>
      fixed || !canvas.parentElement
        ? { w: window.innerWidth, h: window.innerHeight }
        : { w: canvas.parentElement.clientWidth, h: canvas.parentElement.clientHeight };

    let cols = Math.ceil(getSize().w / pixelSize);
    let rows = Math.ceil(getSize().h / pixelSize);

    canvas.width = cols;
    canvas.height = rows;

    let imgData = ctx.createImageData(cols, rows);
    let pixelBuf = new Uint32Array(imgData.data.buffer);
    let energyBuf = new Float32Array(cols * rows);

    let currentCols = cols;
    let currentRows = rows;

    const handleResize = () => {
      const nextCols = Math.ceil(getSize().w / pixelSize);
      const nextRows = Math.ceil(getSize().h / pixelSize);
      currentCols = nextCols;
      currentRows = nextRows;

      if (nextCols > cols || nextRows > rows) {
        cols = Math.max(cols, nextCols);
        rows = Math.max(rows, nextRows);
        canvas.width = cols;
        canvas.height = rows;
        imgData = ctx.createImageData(cols, rows);
        pixelBuf = new Uint32Array(imgData.data.buffer);
        energyBuf = new Float32Array(cols * rows);
      }
    };

    window.addEventListener("resize", handleResize, { passive: true });
    const resizeObserver = !fixed && canvas.parentElement ? new ResizeObserver(handleResize) : null;
    resizeObserver?.observe(canvas.parentElement!);

    // Mouse excitation ripple
    const handleMouseMove = (e: MouseEvent) => {
      const rect = fixed ? undefined : canvas.getBoundingClientRect();
      const mouseX = (e.clientX - (rect?.left ?? 0)) / pixelSize;
      const mouseY = (e.clientY - (rect?.top ?? 0)) / pixelSize;

      for (let dy = -6; dy <= 6; dy++) {
        const py = (mouseY + dy) | 0;
        if (py < 0 || py >= rows) continue;
        const rowOffset = py * cols;
        for (let dx = -6; dx <= 6; dx++) {
          const px = (mouseX + dx) | 0;
          if (px < 0 || px >= cols) continue;
          const distSq = (dx * dx + dy * dy) / 36;
          if (distSq > 1) continue;
          const idx = rowOffset + px;
          const impulse = (1 - distSq) * 0.4;
          if (energyBuf[idx] < 1) {
            energyBuf[idx] = Math.min(1, energyBuf[idx] + impulse);
          }
        }
      }
    };

    if (band) {
      window.addEventListener("mousemove", handleMouseMove, { passive: true });
    }

    let lastTime = 0;
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const renderFrame = (timestamp: number) => {
      const isDark = document.documentElement.classList.contains("dark");
      const curR = isDark ? darkR : baseR;
      const curG = isDark ? darkG : baseG;
      const curB = isDark ? darkB : baseB;
      const curBaseColorUint32 = isDark ? darkColorUint32 : baseColorUint32;

      // Dark mode: soft luminous mint highlight instead of harsh pure white glare
      // Light mode: Requo primary emerald highlight (rgb: 0, 128, 96).
      const highlightR = isDark ? 150 : 0;
      const highlightG = isDark ? 210 : 128;
      const highlightB = isDark ? 180 : 96;

      const timeOffset = timestamp * 0.001 * speed;
      const halfCols = currentCols / 2 || 1;
      const edgeFadeDistance = halfCols * edgeFade;

      for (let y = 0; y < currentRows; y++) {
        const rowNoiseY = y * scale;
        const rowOffset = y * cols;
        const bayerRowIndex = (y & 3) * 4;
        for (let x = 0; x < currentCols; x++) {
          // Normalized noise in [0, 1]
          const noiseVal = 0.5 * noise3D(x * scale, rowNoiseY, timeOffset) + 0.5;

          if (band) {
            const edgeFactor = Math.min(1, Math.min(x, currentCols - 1 - x) / edgeFadeDistance);
            const density = edgeFactor;

            const pixelIdx = rowOffset + x;
            const energy = energyBuf[pixelIdx];

            // Diffuse ripple to 4 adjacent neighbor pixels
            if (energy > 0.004) {
              energyBuf[pixelIdx] = 0.72 * energy;
              const diffusion = 0.04 * energy;
              if (x > 0) energyBuf[pixelIdx - 1] += diffusion;
              if (x < currentCols - 1) energyBuf[pixelIdx + 1] += diffusion;
              if (y > 0) energyBuf[pixelIdx - cols] += diffusion;
              if (y < currentRows - 1) energyBuf[pixelIdx + cols] += diffusion;
            } else if (energy) {
              energyBuf[pixelIdx] = 0;
            }

            let threshold = 1.65 * Math.max(noiseVal - 0.44, 0) * density;
            if (threshold > 0.5) threshold = 0.5;

            // Dithering against 4x4 Bayer matrix
            if (threshold > 0.0625 * BAYER_4X4[bayerRowIndex + (x & 3)]) {
              // Gentle, subtle alpha matching Autumn's delicate stipple aesthetic
              let alpha = Math.min(180, Math.max(45, (55 + 45 * noiseVal) * density));
              const smoothedEnergy = energyBuf[(y & ~1) * cols + (x & ~1)];
              let boost = 0;

              if (smoothedEnergy > 0.45) {
                alpha += 70 * density;
                boost = 0.45 * density;
              } else if (smoothedEnergy > 0.22) {
                alpha += 40 * density;
                boost = 0.28 * density;
              } else if (smoothedEnergy > 0.1) {
                alpha += 20 * density;
                boost = 0.15 * density;
              }

              const clampedAlpha = alpha > 255 ? 255 : (alpha | 0);

              if (boost) {
                const r = (curR + (highlightR - curR) * boost) | 0;
                const g = (curG + (highlightG - curG) * boost) | 0;
                const b = (curB + (highlightB - curB) * boost) | 0;
                pixelBuf[pixelIdx] = r | (g << 8) | (b << 16) | (clampedAlpha << 24);
              } else {
                pixelBuf[pixelIdx] = curBaseColorUint32 | (clampedAlpha << 24);
              }
            } else {
              pixelBuf[pixelIdx] = 0;
            }
            continue;
          }

          // Non-banded fallback
          if (2.5 * Math.max(noiseVal - 0.45, 0) > 0.0625 * BAYER_4X4[bayerRowIndex + (x & 3)]) {
            const alpha = (18 + 50 * noiseVal) | 0;
            pixelBuf[rowOffset + x] = curBaseColorUint32 | (alpha << 24);
          } else {
            pixelBuf[rowOffset + x] = 0;
          }
        }
      }

      ctx.putImageData(imgData, 0, 0);
    };

    const loop = (timestamp: number) => {
      animFrameRef.current = requestAnimationFrame(loop);
      // Throttle to ~15fps (66ms) for authentic pixel-art rhythm & near-zero CPU usage
      if (timestamp - lastTime < 66) return;
      lastTime = timestamp;

      renderFrame(timestamp);
    };

    // Render the first frame immediately for instant visual feedback,
    // then start the animation loop for subsequent frames.
    renderFrame(performance.now());

    if (!reducedMotionQuery.matches) {
      animFrameRef.current = requestAnimationFrame(loop);
    }

    const handleReducedMotionChange = (e: MediaQueryListEvent) => {
      cancelAnimationFrame(animFrameRef.current);
      if (e.matches) {
        renderFrame(0);
      } else {
        animFrameRef.current = requestAnimationFrame(loop);
      }
    };
    reducedMotionQuery.addEventListener("change", handleReducedMotionChange);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        cancelAnimationFrame(animFrameRef.current);
      } else if (!reducedMotionQuery.matches) {
        animFrameRef.current = requestAnimationFrame(loop);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      reducedMotionQuery.removeEventListener("change", handleReducedMotionChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      resizeObserver?.disconnect();
    };
  }, [pixelSize, color, darkColor, scale, speed, fixed, band, edgeFade]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid={testId}
      className={cn(
        fixed ? "fixed inset-0 w-full h-full" : "absolute inset-0 w-full h-full",
        "pointer-events-none z-[-1] print:hidden",
        "hidden sm:block",
        "opacity-28 sm:opacity-32 dark:opacity-28 sm:dark:opacity-32",
        className,
      )}
      style={{
        width: fixed ? "100vw" : "100%",
        height: fixed ? "100vh" : "100%",
        imageRendering: "pixelated",
        WebkitMaskImage:
          "linear-gradient(180deg, black 0%, black 75%, rgba(0,0,0,0.35) 88%, transparent 96%)",
        maskImage:
          "linear-gradient(180deg, black 0%, black 75%, rgba(0,0,0,0.35) 88%, transparent 96%)",
        ...style,
      }}
    />
  );
}
