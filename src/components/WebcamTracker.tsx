"use client";
import React, { useEffect, useRef, useState } from 'react';

// Extracted to avoid multiple declarations
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

export default function WebcamTracker() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement>(null);
  const staticCanvasRef = useRef<HTMLCanvasElement>(null);
  
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Ghost Overlay State
  const [overlayImage, setOverlayImage] = useState<string | null>(null);
  const [isProcessingRef, setIsProcessingRef] = useState(false);
  
  const referenceLandmarksRef = useRef<any>(null);
  const originalImageRef = useRef<HTMLImageElement | null>(null);

  const handleOverlayUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const url = URL.createObjectURL(e.target.files[0]);
      setOverlayImage(url);
      processReferenceImage(url);
    }
  };

  const processReferenceImage = async (url: string) => {
    setIsProcessingRef(true);
    await loadMediaPipe();
    const w = window as any;
    
    const img = new Image();
    img.src = url;
    img.onload = async () => {
      originalImageRef.current = img;
      const refHolistic = new w.Holistic({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`
      });
      refHolistic.setOptions({
        modelComplexity: 1,
        smoothLandmarks: false,
        enableSegmentation: false,
        refineFaceLandmarks: false,
        minDetectionConfidence: 0.5,
      });

      refHolistic.onResults((results: any) => {
        referenceLandmarksRef.current = {
          pose: results.poseLandmarks,
          leftHand: results.leftHandLandmarks,
          rightHand: results.rightHandLandmarks
        };
        
        // Draw static side-by-side reference
        if (staticCanvasRef.current) {
          const ctx = staticCanvasRef.current.getContext('2d');
          if (ctx) {
            staticCanvasRef.current.width = img.width;
            staticCanvasRef.current.height = img.height;
            ctx.drawImage(img, 0, 0, img.width, img.height);
            
            if (results.poseLandmarks) {
              w.drawConnectors(ctx, results.poseLandmarks, w.POSE_CONNECTIONS, {color: '#0000FF', lineWidth: 6});
              w.drawLandmarks(ctx, results.poseLandmarks, {color: '#00FFFF', lineWidth: 3});
            }
            if (results.leftHandLandmarks) {
              w.drawConnectors(ctx, results.leftHandLandmarks, w.HAND_CONNECTIONS, {color: '#0000FF', lineWidth: 4});
            }
            if (results.rightHandLandmarks) {
              w.drawConnectors(ctx, results.rightHandLandmarks, w.HAND_CONNECTIONS, {color: '#0000FF', lineWidth: 4});
            }
          }
        }
        refHolistic.close();
        setIsProcessingRef(false);
      });
      
      await refHolistic.send({ image: img });
    };
  };

  useEffect(() => {
    let camera: any = null;
    let holistic: any = null;
    let isActiveRef = true;

    const startLiveTracker = async () => {
      await loadMediaPipe();
      if (!isActiveRef || !videoRef.current || !liveCanvasRef.current) return;

      const videoElement = videoRef.current;
      const canvasElement = liveCanvasRef.current;
      const canvasCtx = canvasElement.getContext('2d');
      const w = window as any;

      holistic = new w.Holistic({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`
      });

      holistic.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        refineFaceLandmarks: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      holistic.onResults((results: any) => {
        if (!canvasCtx || !videoElement) return;
        
        canvasElement.width = videoElement.videoWidth;
        canvasElement.height = videoElement.videoHeight;

        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        
        // 1. Draw Live Webcam Feed
        canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

        // 2. Draw Ghost Reference Skeleton (Blue) if available
        const refMarks = referenceLandmarksRef.current;
        if (refMarks) {
          if (refMarks.pose) {
            w.drawConnectors(canvasCtx, refMarks.pose, w.POSE_CONNECTIONS, {color: 'rgba(0, 100, 255, 0.6)', lineWidth: 8});
            w.drawLandmarks(canvasCtx, refMarks.pose, {color: 'rgba(0, 255, 255, 0.6)', lineWidth: 4});
          }
          if (refMarks.leftHand) w.drawConnectors(canvasCtx, refMarks.leftHand, w.HAND_CONNECTIONS, {color: 'rgba(0, 100, 255, 0.6)', lineWidth: 4});
          if (refMarks.rightHand) w.drawConnectors(canvasCtx, refMarks.rightHand, w.HAND_CONNECTIONS, {color: 'rgba(0, 100, 255, 0.6)', lineWidth: 4});
        }

        // 3. Draw Live User Skeleton (Green/Red)
        if (results.poseLandmarks) {
          w.drawConnectors(canvasCtx, results.poseLandmarks, w.POSE_CONNECTIONS, {color: '#00FF00', lineWidth: 4});
          w.drawLandmarks(canvasCtx, results.poseLandmarks, {color: '#FF0000', lineWidth: 2});
        }
        if (results.leftHandLandmarks) {
          w.drawConnectors(canvasCtx, results.leftHandLandmarks, w.HAND_CONNECTIONS, {color: '#CC0000', lineWidth: 3});
          w.drawLandmarks(canvasCtx, results.leftHandLandmarks, {color: '#00FF00', lineWidth: 1});
        }
        if (results.rightHandLandmarks) {
          w.drawConnectors(canvasCtx, results.rightHandLandmarks, w.HAND_CONNECTIONS, {color: '#00CC00', lineWidth: 3});
          w.drawLandmarks(canvasCtx, results.rightHandLandmarks, {color: '#FF0000', lineWidth: 1});
        }
        
        canvasCtx.restore();
      });

      camera = new w.Camera(videoElement, {
        onFrame: async () => {
          if (videoRef.current && isActiveRef) {
            await holistic.send({image: videoRef.current});
          }
        },
        width: 640,
        height: 480
      });

      camera.start().catch((err: any) => {
        console.error(err);
        setError("Could not start webcam.");
        setIsActive(false);
      });
    };

    if (isActive) {
      startLiveTracker();
    }

    return () => {
      isActiveRef = false;
      if (camera) camera.stop();
      if (holistic) holistic.close();
    };
  }, [isActive]);

  return (
    <div className="flex flex-col items-center bg-white rounded-xl p-6 md:p-8 border border-gray-200 shadow-sm w-full">
      <h2 className="text-2xl font-bold mb-2">Live Practice Mirror</h2>
      <p className="text-gray-500 mb-8 text-center max-w-xl">
        Upload a reference pose to extract its skeletal map, then align your live blue ghost skeleton side-by-side!
      </p>

      {/* Ghost Overlay Controls */}
      <div className="mb-8 w-full flex flex-col sm:flex-row gap-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
        <div className="flex-1">
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">1. Upload Reference Pose</label>
          <input type="file" accept="image/*" onChange={handleOverlayUpload} className="text-sm w-full file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-black file:text-white hover:file:bg-gray-800 cursor-pointer" />
        </div>
      </div>

      {isProcessingRef && <p className="text-blue-600 font-bold mb-4 animate-pulse">Extracting Reference Skeleton...</p>}
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 w-full max-w-6xl mb-8">
        {/* Left Side: Reference Pose */}
        <div className="flex flex-col items-center w-full">
          <h3 className="font-semibold text-gray-700 mb-4 uppercase tracking-wider text-sm">Reference Pose Map</h3>
          <div className="w-full aspect-[4/3] bg-gray-100 rounded-xl overflow-hidden border border-gray-200 shadow-inner flex items-center justify-center relative">
            {!overlayImage && <span className="text-gray-400">No Reference Uploaded</span>}
            <canvas ref={staticCanvasRef} className="absolute inset-0 w-full h-full object-contain -scale-x-100"></canvas>
          </div>
        </div>

        {/* Right Side: Live Mirror */}
        <div className="flex flex-col items-center w-full">
          <h3 className="font-semibold text-gray-700 mb-4 uppercase tracking-wider text-sm">Live Alignment Mirror</h3>
          {!isActive ? (
            <div className="w-full aspect-[4/3] bg-gray-100 rounded-xl flex items-center justify-center border border-gray-200">
              <button 
                onClick={() => setIsActive(true)}
                className="bg-black text-white px-8 py-4 rounded-full font-bold shadow-lg hover:bg-gray-800 transition-colors"
              >
                Start Webcam Tracker
              </button>
            </div>
          ) : (
            <div className="relative w-full aspect-[4/3] bg-black rounded-xl overflow-hidden shadow-2xl border border-gray-800 flex items-center justify-center">
              {error && <div className="absolute inset-0 flex items-center justify-center text-red-500 bg-black/80 z-30 p-4 text-center font-semibold">{error}</div>}
              
              <video ref={videoRef} className="hidden" playsInline></video>
              
              <canvas ref={liveCanvasRef} className="absolute inset-0 w-full h-full object-contain z-10 -scale-x-100"></canvas>

              <button 
                onClick={() => setIsActive(false)}
                className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-red-600 text-white px-6 py-2 rounded-full font-bold shadow-lg hover:bg-red-700 transition-colors z-30"
              >
                Stop Mirror
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
