"use client";
import React, { useEffect, useRef, useState } from 'react';

// Shared script loader
const loadMediaPipe = async (datasetType: string) => {
  const loadScript = (src: string) => new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = src;
    s.crossOrigin = 'anonymous';
    s.onload = resolve;
    document.head.appendChild(s);
  });
  
  if (!(window as any).drawConnectors) {
    await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
    await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js');
  }
  
  if (datasetType === 'hands_only' && !(window as any).Hands) {
    await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js');
  } else if (datasetType !== 'hands_only' && !(window as any).Holistic) {
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

export default function StaticHolisticView({ imageBase64, title = "Holistic Skeletal Map", datasetType = "full_body" }: { imageBase64: string, title?: string, datasetType?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let holistic: any = null;
    let isMounted = true;

    const task = async () => {
      await loadMediaPipe(datasetType);
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

          if (datasetType === 'hands_only') {
            holistic = new w.Hands({
              locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
            });
            holistic.setOptions({
              maxNumHands: 2,
              modelComplexity: 1,
              minDetectionConfidence: 0.1,
              minTrackingConfidence: 0.1
            });
            holistic.onResults((results: any) => {
              if (!isMounted) {
                if (holistic) holistic.close();
                return;
              }
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              if (results.multiHandLandmarks) {
                for (const landmarks of results.multiHandLandmarks) {
                  w.drawConnectors(ctx, landmarks, w.HAND_CONNECTIONS, {color: '#00CC00', lineWidth: 4});
                  w.drawLandmarks(ctx, landmarks, {color: '#FF0000', lineWidth: 2});
                }
              }
              setLoading(false);
              if (holistic) holistic.close();
              resolve(true);
            });
          } else {
            holistic = new w.Holistic({
              locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`
            });
            holistic.setOptions({
              modelComplexity: 1,
              smoothLandmarks: false,
              enableSegmentation: false,
              refineFaceLandmarks: false,
              minDetectionConfidence: 0.1,
              minTrackingConfidence: 0.1
            });
            holistic.onResults((results: any) => {
              if (!isMounted) {
                if (holistic) holistic.close();
                return;
              }
              
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
              if (holistic) holistic.close();
              resolve(true);
            });
          }

          if (!isMounted) {
            if (holistic) holistic.close();
            resolve(true);
            return;
          }

          try {
            await holistic.send({ image: img });
          } catch (e) {
            console.error("MediaPipe Wasm Error:", e);
            resolve(true);
          }
        };
      });
    };

    extractionQueue.push(task);
    processNextInQueue();

    return () => {
      isMounted = false;
      // We do not call holistic.close() here because it could interrupt a running holistic.send() and crash WASM.
      // Instead, we let the promise finish and close it inside onResults or the checks above.
    };
  }, [imageBase64]);

  return (
    <div className="relative w-full flex-grow flex items-center justify-center bg-black rounded-lg overflow-hidden h-full">
      {loading && <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-zinc-500 z-10 animate-pulse bg-[#0f0f11]/80 backdrop-blur-sm">Extracting Skeleton...</div>}
      <canvas ref={canvasRef} className="w-full h-auto object-contain"></canvas>
    </div>
  );
}
