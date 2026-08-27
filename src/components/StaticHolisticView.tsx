"use client";
import React, { useEffect, useRef, useState } from 'react';

// Shared script loader
const loadMediaPipe = async () => {
  if (!(window as any).Holistic) {
    const loadScript = (src: string) => new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = src;
      s.crossOrigin = 'anonymous';
      s.onload = resolve;
      document.head.appendChild(s);
    });
    await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
    await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js');
    await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/holistic/holistic.js');
  }
};

// Global queue to prevent Wasm "Module.arguments" collision crash when instantiating multiple models concurrently
const extractionQueue: (() => Promise<void>)[] = [];
let isExtracting = false;

const processNextInQueue = () => {
  if (extractionQueue.length === 0 || isExtracting) return;
  isExtracting = true;
  const task = extractionQueue.shift();
  if (task) {
    task().finally(() => {
      isExtracting = false;
      // Small delay to ensure memory cleanup before next Wasm instantiation
      setTimeout(processNextInQueue, 100);
    });
  }
};

export default function StaticHolisticView({ imageBase64, title = "Holistic Skeletal Map" }: { imageBase64: string, title?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let holistic: any = null;
    let isMounted = true;

    const task = async () => {
      await loadMediaPipe();
      if (!isMounted || !canvasRef.current) return;

      const w = window as any;
      const img = new Image();
      img.src = `data:image/jpeg;base64,${imageBase64}`;
      
      await new Promise((resolve) => {
        img.onload = async () => {
          if (!isMounted || !canvasRef.current) {
            resolve(true);
            return;
          }
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(true);
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;

          holistic = new w.Holistic({
            locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`
          });

          holistic.setOptions({
            modelComplexity: 1,
            smoothLandmarks: false,
            enableSegmentation: false,
            refineFaceLandmarks: false,
            minDetectionConfidence: 0.5,
          });

          holistic.onResults((results: any) => {
            if (!isMounted) return;
            
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            // Draw Body
            if (results.poseLandmarks) {
              w.drawConnectors(ctx, results.poseLandmarks, w.POSE_CONNECTIONS, {color: '#00FF00', lineWidth: 6});
              w.drawLandmarks(ctx, results.poseLandmarks, {color: '#FF0000', lineWidth: 3});
            }
            // Draw Left Hand
            if (results.leftHandLandmarks) {
              w.drawConnectors(ctx, results.leftHandLandmarks, w.HAND_CONNECTIONS, {color: '#CC0000', lineWidth: 4});
              w.drawLandmarks(ctx, results.leftHandLandmarks, {color: '#00FF00', lineWidth: 2});
            }
            // Draw Right Hand
            if (results.rightHandLandmarks) {
              w.drawConnectors(ctx, results.rightHandLandmarks, w.HAND_CONNECTIONS, {color: '#00CC00', lineWidth: 4});
              w.drawLandmarks(ctx, results.rightHandLandmarks, {color: '#FF0000', lineWidth: 2});
            }
            
            setLoading(false);
            holistic.close();
            resolve(true);
          });

          await holistic.send({ image: img });
        };
      });
    };

    extractionQueue.push(task);
    processNextInQueue();

    return () => {
      isMounted = false;
      if (holistic) holistic.close();
    };
  }, [imageBase64]);

  return (
    <div className="bg-black/5 rounded-lg p-2 border border-black/10 relative w-full flex flex-col h-full">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-black/60 mb-2">{title}</h4>
      <div className="relative w-full flex-grow flex items-center justify-center bg-gray-100 rounded overflow-hidden">
        {loading && <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-gray-500 z-10 animate-pulse bg-white/80">Extracting Skeleton...</div>}
        <canvas ref={canvasRef} className="w-full h-auto object-contain"></canvas>
      </div>
    </div>
  );
}
