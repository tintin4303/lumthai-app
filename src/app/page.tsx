"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Suspense } from 'react';
import WebcamTracker from '../components/WebcamTracker';
import PostureCoach from '../components/PostureCoach';
import StaticHolisticView from '../components/StaticHolisticView';
import StyleClassifier from '../components/StyleClassifier';

type ImageFile = {
  id: string;
  file: File;
  preview: string;
};

type FrameResult = {
  id: number;
  hand_detected: boolean;
  crop_box: number[];
  preview: string;
  hand_crop: string;
  hand_depth: string;
  body_crop: string;
  body_depth: string;
  full_image: string;
  depth_map: string;
};

// Point-cloud renderer: each pixel → a 3D point displaced by its depth value.
// Background pixels (depth > threshold) are discarded so only the subject is shown.
function PointCloudScene({ imageBase64, depthBase64 }: { imageBase64: string, depthBase64: string }) {
  const meshRef = useRef<THREE.Points>(null);

  const texture = useLoader(THREE.TextureLoader, `data:image/jpeg;base64,${imageBase64}`);
  const depthTex = useLoader(THREE.TextureLoader, `data:image/jpeg;base64,${depthBase64}`);

  // Build point cloud geometry from textures via offscreen canvas
  const geometry = useMemo(() => {
    const img = texture.image as HTMLImageElement;
    const dep = depthTex.image as HTMLImageElement;
    if (!img?.width || !dep?.width) return new THREE.BufferGeometry();

    const SAMPLE = 3; // sample every Nth pixel for performance
    const cw = img.naturalWidth || img.width;
    const ch = img.naturalHeight || img.height;

    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = cw; colorCanvas.height = ch;
    const colorCtx = colorCanvas.getContext('2d')!;
    colorCtx.drawImage(img, 0, 0, cw, ch);
    const colorData = colorCtx.getImageData(0, 0, cw, ch).data;

    const depCanvas = document.createElement('canvas');
    depCanvas.width = cw; depCanvas.height = ch;
    const depCtx = depCanvas.getContext('2d')!;
    depCtx.drawImage(dep, 0, 0, cw, ch);
    const depData = depCtx.getImageData(0, 0, cw, ch).data;

    const posArr: number[] = [];
    const colArr: number[] = [];

    const aspect = cw / ch;
    const W = 4 * aspect;
    const H = 4;
    const DEPTH_THRESHOLD = 210; // discard far background
    const DEPTH_SCALE = 1.5;

    for (let py = 0; py < ch; py += SAMPLE) {
      for (let px = 0; px < cw; px += SAMPLE) {
        const i = (py * cw + px) * 4;
        const depthVal = depData[i]; // R channel

        if (depthVal > DEPTH_THRESHOLD) continue; // skip background

        const x = (px / cw - 0.5) * W;
        const y = -(py / ch - 0.5) * H;
        const z = (1 - depthVal / 255) * DEPTH_SCALE;

        posArr.push(x, y, z);
        colArr.push(colorData[i] / 255, colorData[i+1] / 255, colorData[i+2] / 255);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colArr, 3));
    return geo;
  }, [texture, depthTex]);

  return (
    <points ref={meshRef} geometry={geometry}>
      <pointsMaterial size={0.018} vertexColors sizeAttenuation />
    </points>
  );
}

function True3DViewer({ imageBase64, depthBase64, title }: { imageBase64: string, depthBase64: string, title: string, isHand?: boolean }) {
  return (
    <div className="bg-black/5 rounded-lg p-3 border border-black/10 flex flex-col items-center h-[300px]">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-black/60 mb-2 w-full text-left">{title}</h4>
      <p className="text-[10px] text-gray-500 mb-2 w-full text-left">Drag to orbit · Scroll to zoom</p>
      <div className="w-full h-full bg-black rounded overflow-hidden cursor-move">
        <Canvas camera={{ position: [0, 0, 3.5], fov: 50 }}>
          <Suspense fallback={null}>
            <PointCloudScene imageBase64={imageBase64} depthBase64={depthBase64} />
          </Suspense>
          <OrbitControls enableZoom={true} />
        </Canvas>
      </div>
    </div>
  );
}

function SortableItem({ item, onRemove }: { item: ImageFile; onRemove: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className="relative group flex flex-col items-center">
      <div 
        {...attributes} 
        {...listeners}
        className="w-24 h-24 rounded-lg border-2 border-gray-200 overflow-hidden cursor-grab active:cursor-grabbing bg-gray-100 relative group-hover:border-black transition-colors flex items-center justify-center"
      >
        <img src={item.preview} alt="preview" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span className="text-white text-xs font-bold">DRAG</span>
        </div>
      </div>
      <button 
        type="button" 
        onClick={() => onRemove(item.id)} 
        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-red-600 font-bold"
      >
        ✕
      </button>
    </div>
  );
}

function FramePlayer({ frames, videoId }: { frames: string[]; videoId: string }) {
  const [currentFrame, setCurrentFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (playing && frames.length > 1) {
      intervalRef.current = setInterval(() => {
        setCurrentFrame(f => (f + 1) % frames.length);
      }, 80); // ~12fps playback
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing, frames.length]);

  if (!frames || frames.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="bg-black rounded-xl overflow-hidden max-w-2xl">
        <img
          src={`data:image/png;base64,${frames[currentFrame]}`}
          alt={`Frame ${currentFrame + 1}`}
          className="w-full h-auto"
        />
      </div>
      <div className="flex items-center gap-3 max-w-2xl">
        <button
          onClick={() => setPlaying(p => !p)}
          className="px-4 py-1.5 text-sm font-medium border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
        >
          {playing ? "Pause" : "Play"}
        </button>
        <input
          type="range"
          min={0}
          max={frames.length - 1}
          value={currentFrame}
          onChange={e => { setPlaying(false); setCurrentFrame(parseInt(e.target.value)); }}
          className="flex-1 accent-black"
        />
        <span className="text-xs text-gray-500 tabular-nums">
          {currentFrame + 1} / {frames.length}
        </span>
        <a
          href={`/api/video/${videoId}`}
          download="transition.mp4"
          className="px-4 py-1.5 text-sm font-medium border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
        >
          Download MP4
        </a>
      </div>
    </div>
  );
}

function PipelineModule() {
  const [images, setImages] = useState<ImageFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  
  // Options
  const [framesPerTransition, setFramesPerTransition] = useState(10);
  const [shiftAmount, setShiftAmount] = useState(0.8);
  const [gridSize, setGridSize] = useState(15);
  const [shiftStep, setShiftStep] = useState(6);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).map(file => ({
        id: Math.random().toString(36).substr(2, 9),
        file,
        preview: URL.createObjectURL(file)
      }));
      setImages(prev => [...prev, ...newFiles]);
    }
  };

  const handleRemove = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setImages((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const runPipeline = async () => {
    if (images.length < 2) return;
    setLoading(true);
    setResults(null);
    
    const formData = new FormData();
    images.forEach((img, i) => formData.append("files", img.file, `image_${i}.jpg`));
    formData.append("frames_per_transition", framesPerTransition.toString());
    formData.append("shift_amount", shiftAmount.toString());
    formData.append("grid_size", gridSize.toString());
    formData.append("shift_step", shiftStep.toString());

    try {
      const res = await fetch("/api/pipeline", { method: "POST", body: formData });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setResults(data);
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">1. Sequence Order</h2>
        <p className="text-sm text-gray-500 mb-4">Upload and drag images to set the transition order (minimum 2).</p>
        
        <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-6 mb-6">
          <input type="file" multiple accept="image/*" onChange={handleFileUpload} className="hidden" id="file-upload" />
          <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center justify-center text-gray-500 hover:text-black transition-colors">
            <span className="font-medium underline">Click to upload images</span>
          </label>
        </div>

        {images.length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={images.map(i => i.id)} strategy={horizontalListSortingStrategy}>
              <div className="flex flex-wrap gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
                {images.map(item => (
                  <SortableItem key={item.id} item={item} onRemove={handleRemove} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">2. Pipeline Options</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 bg-gray-50 p-6 rounded-xl border border-gray-200">
          <div>
            <label className="block text-sm font-medium mb-1">Frames / Transition</label>
            <input type="number" min="2" max="60" value={framesPerTransition} onChange={e => setFramesPerTransition(Number(e.target.value))} className="w-full border border-gray-300 rounded-md p-2" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">3D Shift Amount</label>
            <input type="number" step="0.1" value={shiftAmount} onChange={e => setShiftAmount(Number(e.target.value))} className="w-full border border-gray-300 rounded-md p-2" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Rotation Frames</label>
            <input type="number" min="3" max="45" step="2" value={gridSize} onChange={e => setGridSize(Number(e.target.value))} className="w-full border border-gray-300 rounded-md p-2" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Hand Rotation Intensity</label>
            <input type="number" min="1" max="20" value={shiftStep} onChange={e => setShiftStep(Number(e.target.value))} className="w-full border border-gray-300 rounded-md p-2" />
          </div>
        </div>
      </div>

      <div className="mb-8">
        <button
          onClick={runPipeline}
          disabled={images.length < 2 || loading}
          className="w-full py-3 bg-black text-white font-medium rounded-lg hover:bg-gray-800 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-all shadow-sm flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processing...
            </>
          ) : "Run"}
        </button>
      </div>

      {results && (
        <div className="mt-12 border-t border-gray-200 pt-12">
          <h2 className="text-2xl font-semibold mb-8">Pipeline Results</h2>
          
          <div className="mb-16">
            <h3 className="text-xl font-semibold mb-4">Interpolated Sequence</h3>
            
            {/* Video Player */}
            <div className="mb-8">
              <FramePlayer frames={results.interp_frames} videoId={results.video_id} />
            </div>

            {/* Transition Steps Filmstrip */}
            <div>
              <h4 className="text-md font-medium text-gray-700 mb-4">Transition Steps (Filmstrip)</h4>
              <div className="flex overflow-x-auto gap-4 pb-4 snap-x border-b border-gray-200">
                {results.interp_frames.map((frameB64: string, idx: number) => (
                  <div key={idx} className="flex-none w-32 md:w-48 snap-center">
                    <div className="bg-white p-2 rounded-lg border border-gray-200 shadow-sm">
                      <img 
                        src={`data:image/jpeg;base64,${frameB64}`} 
                        alt={`Transition Step ${idx + 1}`} 
                        className="w-full h-auto rounded"
                      />
                      <p className="text-xs text-center text-gray-500 mt-2 font-medium">Step {idx + 1}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-medium mb-6">Per-Frame Analysis</h3>
            <div className="space-y-12">
              {results.frames.map((frame: FrameResult, i: number) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h4 className="font-semibold text-lg mb-4">Frame {i + 1}</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                    {/* Detection preview with both bounding boxes */}
                    <div className="bg-black/5 rounded-lg p-2 border border-black/10">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-black/60 mb-2">Detection</h4>
                      <img src={`data:image/jpeg;base64,${frame.preview}`} alt="Preview" className="w-full h-auto rounded" />
                    </div>

                    {/* Hand crop + depth → point-cloud */}
                    <True3DViewer imageBase64={frame.hand_crop} depthBase64={frame.hand_depth} title="3D Hand (Cropped)" />

                    {/* Depth map (full body, colorized) */}
                    <div className="bg-black/5 rounded-lg p-2 border border-black/10">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-black/60 mb-2">Depth Map</h4>
                      <img src={`data:image/jpeg;base64,${frame.depth_map}`} alt="Depth Map" className="w-full h-auto rounded" />
                    </div>

                    {/* Body crop + depth → point-cloud */}
                    <True3DViewer imageBase64={frame.body_crop} depthBase64={frame.body_depth} title="3D Body (Cropped)" />

                    {/* Holistic skeleton overlay */}
                    <StaticHolisticView imageBase64={frame.full_image} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<'pipeline' | 'practice' | 'comparison'>('pipeline');

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <main className="max-w-6xl mx-auto px-4 py-8">
        
        {/* Header Tabs */}
        <div className="flex flex-wrap justify-center gap-4 mb-8">
          <button 
            onClick={() => setActiveTab('pipeline')}
            className={`px-6 py-2 rounded-full font-semibold transition-colors ${activeTab === 'pipeline' ? 'bg-black text-white' : 'bg-gray-200 text-black hover:bg-gray-300'}`}
          >
            3D Dance Pipeline
          </button>
          <button 
            onClick={() => setActiveTab('practice')}
            className={`px-6 py-2 rounded-full font-semibold transition-colors ${activeTab === 'practice' ? 'bg-black text-white' : 'bg-gray-200 text-black hover:bg-gray-300'}`}
          >
            Live Practice Mirror
          </button>
          <button 
            onClick={() => setActiveTab('comparison')}
            className={`px-6 py-2 rounded-full font-semibold transition-colors ${activeTab === 'comparison' ? 'bg-black text-white' : 'bg-gray-200 text-black hover:bg-gray-300'}`}
          >
            Posture Comparison
          </button>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          {activeTab === 'pipeline' && <PipelineModule />}
          {activeTab === 'practice' && <WebcamTracker />}
          {activeTab === 'comparison' && <PostureCoach />}
        </div>
      </main>
    </div>
  );
}
