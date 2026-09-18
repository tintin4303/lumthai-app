"use client";

import { useEffect, useRef, useState } from "react";
import { FON_LEB_SEQUENCE, FonLebMovement, formatTimestamp } from "../lib/fonLeb/fonLebSequence";
import { coachingCue, FonLebScores, Landmark, scoreFonLebPose, mirrorPoseLandmarks, mirrorHandLandmarks } from "../lib/fonLeb/landmarkScoring";

type HolisticResult = {
  image: CanvasImageSource;
  poseLandmarks?: Landmark[];
  leftHandLandmarks?: Landmark[];
  rightHandLandmarks?: Landmark[];
};

type HolisticModel = {
  setOptions: (options: Record<string, unknown>) => void;
  onResults: (callback: (results: HolisticResult) => void) => void;
  send: (input: { image: HTMLVideoElement }) => Promise<void>;
  close: () => void;
};

type LandmarkReference = {
  pose?: Landmark[];
  leftHand?: Landmark[];
  rightHand?: Landmark[];
};

const REFERENCE_VIDEO_SRC = "/references/fon-leb-reference.mp4";

let mediaPipePromise: Promise<void> | null = null;

const getHolisticConstructor = () =>
  (window as Window & { Holistic?: new (options: Record<string, unknown>) => HolisticModel }).Holistic;

const loadMediaPipeHolistic = () => {
  if (getHolisticConstructor()) return Promise.resolve();
  if (mediaPipePromise) return mediaPipePromise;

  mediaPipePromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@mediapipe/holistic/holistic.js";
    script.crossOrigin = "anonymous";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("MediaPipe Holistic could not be loaded. Check your internet connection and try again."));
    document.head.appendChild(script);
  });
  return mediaPipePromise;
};

const createHolistic = () => {
  const Holistic = getHolisticConstructor();
  if (!Holistic) throw new Error("MediaPipe Holistic is not available.");
  const model = new Holistic({
    locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`,
  });
  model.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    refineFaceLandmarks: false,
    enableSegmentation: false,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6,
  });
  return model;
};

const POSE_CONNECTIONS: Array<[number, number]> = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
];
const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10],
  [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18],
  [18, 19], [19, 20], [0, 17],
];

const drawLandmarks = (
  context: CanvasRenderingContext2D,
  points: Landmark[] | undefined,
  connections: Array<[number, number]>,
  width: number,
  height: number,
  color: string,
) => {
  if (!points) return;
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 3;
  for (const [start, end] of connections) {
    const a = points[start];
    const b = points[end];
    if (!a || !b) continue;
    context.beginPath();
    context.moveTo(a.x * width, a.y * height);
    context.lineTo(b.x * width, b.y * height);
    context.stroke();
  }
  for (const point of points) {
    context.beginPath();
    context.arc(point.x * width, point.y * height, 2.5, 0, Math.PI * 2);
    context.fill();
  }
};

const scoreLabel = (score: number | null) => (score === null ? "Not detected" : `${score}/100`);

export default function FonLebCoach() {
  const referenceVideoRef = useRef<HTMLVideoElement>(null);
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const referenceModelRef = useRef<HolisticModel | null>(null);
  const liveModelRef = useRef<HolisticModel | null>(null);
  const referenceRef = useRef<LandmarkReference | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const processingRef = useRef(false);
  const [selectedMovement, setSelectedMovement] = useState<FonLebMovement>(FON_LEB_SEQUENCE[0]);
  const [referenceReady, setReferenceReady] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [loadingReference, setLoadingReference] = useState(false);
  const [scores, setScores] = useState<FonLebScores | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stopCamera = () => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    liveModelRef.current?.close();
    liveModelRef.current = null;
    processingRef.current = false;
    setCameraActive(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
      referenceModelRef.current?.close();
    };
  }, []);

  useEffect(() => {
    const video = referenceVideoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_METADATA) return;
    video.pause();
    video.currentTime = selectedMovement.startTime;
  }, [selectedMovement]);

  const seekReferenceVideo = (video: HTMLVideoElement, seconds: number) =>
    new Promise<void>((resolve, reject) => {
      const handleSeeked = () => {
        video.removeEventListener("seeked", handleSeeked);
        resolve();
      };
      const handleError = () => {
        video.removeEventListener("error", handleError);
        reject(new Error("The selected reference video could not be read."));
      };
      video.addEventListener("seeked", handleSeeked, { once: true });
      video.addEventListener("error", handleError, { once: true });
      video.currentTime = seconds;
    });

  const analyseReferencePose = async () => {
    const video = referenceVideoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_METADATA) {
      setError("The Fon Leb reference video is still loading. Please try again in a moment.");
      return;
    }
    setError(null);
    setLoadingReference(true);
    setReferenceReady(false);
    try {
      await loadMediaPipeHolistic();
      if (!referenceModelRef.current) referenceModelRef.current = createHolistic();
      await seekReferenceVideo(video, selectedMovement.startTime);

      await new Promise<void>((resolve, reject) => {
        const model = referenceModelRef.current;
        if (!model) {
          reject(new Error("The reference detector was not created."));
          return;
        }
        model.onResults((results) => {
          referenceRef.current = {
            pose: results.poseLandmarks,
            leftHand: results.leftHandLandmarks,
            rightHand: results.rightHandLandmarks,
          };
          if (!results.poseLandmarks) {
            reject(new Error("No full-body reference pose was detected at this movement's selected time."));
            return;
          }
          setReferenceReady(true);
          resolve();
        });
        void model.send({ image: video }).catch(reject);
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Reference-pose analysis failed.");
    } finally {
      setLoadingReference(false);
    }
  };

  const startCamera = async () => {
    if (!referenceReady) {
      setError("Analyse the selected reference movement before starting the webcam.");
      return;
    }
    setError(null);
    try {
      await loadMediaPipeHolistic();
      const video = liveVideoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) throw new Error("The webcam display is not ready.");

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();

      const model = createHolistic();
      liveModelRef.current = model;
      model.onResults((results) => {
        const context = canvas.getContext("2d");
        if (!context) return;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // Draw image directly. We will mirror the entire canvas via CSS.
        context.drawImage(results.image, 0, 0, canvas.width, canvas.height);

        drawLandmarks(context, results.poseLandmarks, POSE_CONNECTIONS, canvas.width, canvas.height, "#34d399");
        drawLandmarks(context, results.leftHandLandmarks, HAND_CONNECTIONS, canvas.width, canvas.height, "#fbbf24");
        drawLandmarks(context, results.rightHandLandmarks, HAND_CONNECTIONS, canvas.width, canvas.height, "#fbbf24");

        const reference = referenceRef.current;
        
        // Mirror the learner's poses before scoring so they align with the unflipped reference
        const mirroredPose = mirrorPoseLandmarks(results.poseLandmarks);
        // Important: Swap left and right hands because the mirrored left hand is visually the right hand
        const mirroredLeftHand = mirrorHandLandmarks(results.rightHandLandmarks);
        const mirroredRightHand = mirrorHandLandmarks(results.leftHandLandmarks);

        setScores(scoreFonLebPose(
          reference?.pose,
          mirroredPose,
          reference?.leftHand,
          mirroredLeftHand,
          reference?.rightHand,
          mirroredRightHand,
        ));
      });

      setCameraActive(true);
      const processFrame = async () => {
        if (!liveModelRef.current || !liveVideoRef.current || !streamRef.current) return;
        if (!processingRef.current && liveVideoRef.current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          processingRef.current = true;
          try {
            await liveModelRef.current.send({ image: liveVideoRef.current });
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Live landmark detection stopped unexpectedly.");
            stopCamera();
            return;
          } finally {
            processingRef.current = false;
          }
        }
        animationRef.current = requestAnimationFrame(processFrame);
      };
      animationRef.current = requestAnimationFrame(processFrame);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The webcam could not be started.");
      stopCamera();
    }
  };

  const previewReferenceClip = async () => {
    const video = referenceVideoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_METADATA) {
      setError("The Fon Leb reference video is still loading. Please try again in a moment.");
      return;
    }
    setError(null);
    video.currentTime = selectedMovement.startTime;
    try {
      await video.play();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The reference clip could not start.");
    }
  };

  const stopReferencePreview = () => {
    referenceVideoRef.current?.pause();
  };

  const selectMovement = (movement: FonLebMovement) => {
    stopCamera();
    stopReferencePreview();
    referenceRef.current = null;
    setSelectedMovement(movement);
    setReferenceReady(false);
    setScores(null);
    setError(null);
  };

  return (
    <section className="w-full rounded-xl border border-zinc-800 bg-[#18181b] p-6 shadow-sm md:p-8">
      <div className="mb-6">
        <h2 className="mt-1 text-2xl font-bold text-white">Fon Leb Pose Quality Coach</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
          Practise one selected movement at a time. The coach compares normalised body, arm, wrist, and 21-point hand landmarks locally in the browser.
        </p>
      </div>

      <div className="mb-6 rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-400">
        Camera frames stay in this browser. Webcam video is not sent to the classifier or Groq feedback service.
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="rounded-xl border border-zinc-800 bg-[#0f0f11] p-4">
          <p className="text-sm font-semibold text-zinc-200">Curated Fon Leb reference</p>
          <p className="mt-2 text-xs leading-5 text-zinc-500">This coach uses the project&apos;s fixed reference video. Each selected movement starts at its configured frame, stops before the next pose, and loops only within that clip.</p>

          <div className="mt-5 max-h-80 space-y-1 overflow-y-auto pr-1">
            {FON_LEB_SEQUENCE.map((movement, index) => (
              <button
                key={movement.id}
                type="button"
                onClick={() => selectMovement(movement)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${selectedMovement.id === movement.id ? "bg-zinc-100 text-black text-white" : "hover:bg-gray-200 text-zinc-200"}`}
              >
                <span>{index + 1}. {movement.name}</span>
                <span className="text-xs opacity-75">{formatTimestamp(movement.startTime)}-{formatTimestamp(movement.endTime)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-800 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Current movement</p>
                <h3 className="mt-1 text-lg font-bold text-white">{selectedMovement.name} <span className="font-normal text-zinc-500">({selectedMovement.thaiName})</span></h3>
                <p className="mt-1 text-sm text-zinc-400">Reference frame: {formatTimestamp(selectedMovement.startTime)}. Preview loop: {formatTimestamp(selectedMovement.startTime)}-{formatTimestamp(selectedMovement.endTime)}.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void previewReferenceClip()} className="rounded-full border border-zinc-700 px-4 py-2 text-sm font-bold text-white">Play loop</button>
                <button type="button" onClick={stopReferencePreview} className="rounded-full border border-zinc-700 px-4 py-2 text-sm font-bold text-white">Stop</button>
                <button type="button" onClick={analyseReferencePose} disabled={loadingReference} className="rounded-full bg-zinc-100 text-black px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
                  {loadingReference ? "Analysing..." : "Analyse reference pose"}
                </button>
              </div>
            </div>
            <video
              ref={referenceVideoRef}
              src={REFERENCE_VIDEO_SRC}
              controls
              muted
              playsInline
              preload="metadata"
              onLoadedMetadata={(event) => {
                event.currentTarget.currentTime = selectedMovement.startTime;
              }}
              onTimeUpdate={(event) => {
                const video = event.currentTarget;
                if (video.currentTime >= selectedMovement.endTime) {
                  video.currentTime = selectedMovement.startTime;
                  void video.play();
                }
              }}
              className="mt-4 aspect-video w-full rounded-lg bg-black object-contain"
            />
          </div>

          <div className="rounded-xl border border-zinc-800 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Live practice camera</p>
                <p className="mt-1 text-xs text-zinc-500">Keep both hands, elbows, and shoulders in the frame for detailed scoring.</p>
              </div>
              {cameraActive ? (
                <button type="button" onClick={stopCamera} className="rounded-full bg-red-600 px-4 py-2 text-sm font-bold text-white">Stop camera</button>
              ) : (
                <button type="button" onClick={startCamera} disabled={!referenceReady} className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">Start camera</button>
              )}
            </div>
            <div className="relative mt-4 aspect-video overflow-hidden rounded-lg bg-black">
              <video ref={liveVideoRef} className="hidden" playsInline muted />
              <canvas ref={canvasRef} className="h-full w-full object-contain -scale-x-100" />
              {!cameraActive && <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-zinc-400">Analyse the reference pose, then start the practice camera.</div>}
            </div>
          </div>
        </div>
      </div>

      {error && <p className="mt-5 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm font-medium text-red-400">{error}</p>}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {([
          ["Overall", scores?.overall ?? null],
          ["Hand and fingers", scores?.hand ?? null],
          ["Wrist", scores?.wrist ?? null],
          ["Arm curve", scores?.arm ?? null],
          ["Body balance", scores?.body ?? null],
        ] as Array<[string, number | null]>).map(([label, score]) => (
          <div key={label} className="rounded-lg border border-zinc-800 bg-[#0f0f11] p-3">
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">{label}</p>
            <p className="mt-1 text-xl font-black text-white">{scoreLabel(score)}</p>
          </div>
        ))}
      </div>

      <p className="mt-4 rounded-lg bg-emerald-500/10 p-4 text-sm font-medium leading-6 text-emerald-400">{coachingCue(scores)}</p>
    </section>
  );
}
