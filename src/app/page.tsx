"use client";

import { Canvas, useLoader, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import { ObjModel } from '../components/ObjViewer';



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
  body_rgba: string;
  full_image: string;
  full_png: string;
  depth_map: string;
  depth_raw: string;
  pose_3d: any;
  hands_3d: any;
};

// Point-cloud renderer: each pixel → a 3D point displaced by its depth value.
// Background pixels (depth > threshold) are discarded so only the subject is shown.
function PointCloudScene({ imageBase64, depthBase64 }: { imageBase64: string, depthBase64: string }) {
  const meshRef = useRef<THREE.Points>(null);

  const imgSrc = imageBase64.startsWith('data:') ? imageBase64 : `data:image/png;base64,${imageBase64}`;
  const depSrc = depthBase64.startsWith('data:') ? depthBase64 : `data:image/png;base64,${depthBase64}`;

  const texture = useLoader(THREE.TextureLoader, imgSrc);
  const depthTex = useLoader(THREE.TextureLoader, depSrc);

  // Build point cloud geometry from textures via offscreen canvas
  const geometry = useMemo(() => {
    const img = texture.image as HTMLImageElement;
    const dep = depthTex.image as HTMLImageElement;
    if (!img?.width || !dep?.width) return new THREE.BufferGeometry();

    const SAMPLE = 2; // sample every 2nd pixel for dense, sharp point cloud
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
    const DEPTH_SCALE = 1.4;

    for (let py = 0; py < ch; py += SAMPLE) {
      for (let px = 0; px < cw; px += SAMPLE) {
        const i = (py * cw + px) * 4;
        const alpha = colorData[i + 3];
        // If image has alpha channel (isolated subject), discard transparent background pixels!
        if (alpha < 50) continue;

        const depthVal = depData[i]; // R channel
        if (depthVal < 10) continue; // skip zero/background depth

        const x = (px / cw - 0.5) * W;
        const y = -(py / ch - 0.5) * H;
        const z = (depthVal / 255 - 0.5) * DEPTH_SCALE;

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
      <pointsMaterial size={0.022} vertexColors sizeAttenuation />
    </points>
  );
}

function True3DViewer({ imageBase64, depthBase64, title }: { imageBase64: string, depthBase64: string, title: string }) {
  if (!imageBase64 || !depthBase64) {
    return (
      <div className="bg-[#0f0f11] rounded-xl p-6 border border-zinc-800/80 flex flex-col items-center justify-center h-[440px] shadow-inner">
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-2 w-full text-left">{title}</h4>
        <span className="text-xs text-zinc-600">Point cloud data unavailable</span>
      </div>
    );
  }
  return (
    <div className="bg-[#0f0f11] rounded-xl p-5 border border-zinc-800/80 flex flex-col items-center h-[460px] shadow-inner">
      <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1 w-full text-left">{title}</h4>
      <p className="text-[10px] text-zinc-500 mb-3 w-full text-left">Drag to rotate 3D point cloud · Scroll to zoom</p>
      <div className="w-full h-full bg-black rounded-lg overflow-hidden cursor-move relative shadow-xl border border-zinc-800">
        <Canvas camera={{ position: [0, 0, 3.5], fov: 50 }}>
          <ambientLight intensity={1.0} />
          <Suspense fallback={null}>
            <PointCloudScene imageBase64={imageBase64} depthBase64={depthBase64} />
          </Suspense>
          <OrbitControls enableZoom={true} autoRotate autoRotateSpeed={0.8} />
        </Canvas>
      </div>
    </div>
  );
}

// DepthMeshScene: solid displaced 3D terrain from the INFERNO depth colormap
function DepthMeshScene({ colorImageBase64, depthBase64 }: { colorImageBase64: string, depthBase64: string }) {
  const SEGMENTS = 220;
  const meshRef = useRef<THREE.Mesh>(null);

  const colorSrc = colorImageBase64.startsWith('data:') ? colorImageBase64 : `data:image/jpeg;base64,${colorImageBase64}`;
  const depSrc   = depthBase64.startsWith('data:')      ? depthBase64      : `data:image/png;base64,${depthBase64}`;

  const colorTex = useLoader(THREE.TextureLoader, colorSrc);
  const depthTex = useLoader(THREE.TextureLoader, depSrc);

  // Slow auto-rotate
  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.15;
  });

  const geometry = useMemo(() => {
    const dep = depthTex.image as HTMLImageElement;
    if (!dep?.width) return new THREE.PlaneGeometry(4, 4 / 1, SEGMENTS, SEGMENTS);

    const dw = dep.naturalWidth || dep.width;
    const dh = dep.naturalHeight || dep.height;
    const aspect = dw / dh;

    const depCanvas = document.createElement('canvas');
    depCanvas.width = dw; depCanvas.height = dh;
    const depCtx = depCanvas.getContext('2d')!;
    depCtx.drawImage(dep, 0, 0, dw, dh);
    const depData = depCtx.getImageData(0, 0, dw, dh).data;

    const geo = new THREE.PlaneGeometry(4 * aspect, 4, SEGMENTS, SEGMENTS);
    const positions = geo.attributes.position.array as Float32Array;

    for (let i = 0; i < positions.length / 3; i++) {
      const u = positions[i * 3] / (4 * aspect) + 0.5;
      const v = positions[i * 3 + 1] / 4 + 0.5;
      const px = Math.min(Math.floor(u * dw), dw - 1);
      const py = Math.min(Math.floor((1 - v) * dh), dh - 1);
      const depthVal = depData[(py * dw + px) * 4] / 255;
      // Objects with high depth value (closer) protrude toward viewer
      positions[i * 3 + 2] = (depthVal - 0.3) * 2.2;
    }

    geo.computeVertexNormals();
    return geo;
  }, [depthTex]);

  return (
    <mesh ref={meshRef} geometry={geometry} rotation={[0.25, 0, 0]}>
      <meshStandardMaterial map={colorTex} side={THREE.DoubleSide} roughness={0.6} metalness={0.1} />
    </mesh>
  );
}

function DepthMeshViewer({ colorImageBase64, depthBase64 }: { colorImageBase64: string, depthBase64: string }) {
  if (!colorImageBase64 || !depthBase64) return null;
  return (
    <div className="bg-[#0f0f11] rounded-xl overflow-hidden h-[500px] relative border border-zinc-800/80 shadow-inner">
      <Canvas camera={{ position: [0, 0, 4.0], fov: 55 }}>
        <color attach="background" args={['#0f0f11']} />
        <ambientLight intensity={1.2} />
        <directionalLight position={[3, 5, 5]} intensity={1.0} />
        <directionalLight position={[-3, -2, -3]} intensity={0.3} />
        <Suspense fallback={null}>
          <DepthMeshScene colorImageBase64={colorImageBase64} depthBase64={depthBase64} />
        </Suspense>
        <OrbitControls enableZoom={true} enableDamping />
      </Canvas>
      <div className="absolute bottom-3 left-0 right-0 text-center pointer-events-none">
        <p className="text-zinc-500 text-[11px] font-semibold tracking-wide">DRAG TO ROTATE · SCROLL TO ZOOM</p>
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
        className="w-24 h-24 rounded-lg border-2 border-zinc-700 overflow-hidden cursor-grab active:cursor-grabbing bg-zinc-900 relative group-hover:border-amber-500 transition-colors flex items-center justify-center shadow-md"
      >
        <img src={item.preview} alt="preview" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span className="text-white text-xs font-bold tracking-wider">DRAG</span>
        </div>
      </div>
      <button 
        type="button" 
        onClick={() => onRemove(item.id)} 
        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-red-600 font-bold shadow-sm"
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
      <div className="flex items-center gap-4 max-w-2xl bg-[#0f0f11] p-3 rounded-xl border border-zinc-800 shadow-inner">
        <button
          onClick={() => setPlaying(p => !p)}
          className="px-4 py-1.5 text-sm font-semibold border border-zinc-700 bg-zinc-800 text-zinc-200 rounded-md hover:bg-zinc-700 hover:text-white transition-colors"
        >
          {playing ? "Pause" : "Play"}
        </button>
        <input
          type="range"
          min={0}
          max={frames.length - 1}
          value={currentFrame}
          onChange={e => { setPlaying(false); setCurrentFrame(parseInt(e.target.value)); }}
          className="flex-1 accent-amber-500 h-2 bg-zinc-800 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-amber-500 [&::-webkit-slider-thumb]:rounded-full cursor-pointer"
        />
        <span className="text-xs text-zinc-500 tabular-nums font-mono">
          {currentFrame + 1} / {frames.length}
        </span>
        <a
          href={`/api/video/${videoId}`}
          download="transition.mp4"
          className="px-4 py-1.5 text-sm font-semibold border border-amber-500/50 bg-amber-500/10 text-amber-500 rounded-md hover:bg-amber-500 hover:text-black transition-colors"
        >
          Download MP4
        </a>
      </div>
    </div>
  );
}


function PhotogrammetryViewer({ modelUrl }: { modelUrl: string }) {
  return (
    <>
      <Canvas camera={{ position: [0, 1.5, 4], fov: 45 }}>
        <color attach="background" args={['#0f0f11']} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
        <Environment preset="city" />
        <Suspense fallback={null}>
          <ObjModel url={modelUrl} />
          <ContactShadows position={[0, -1, 0]} opacity={0.5} scale={10} blur={2} far={4} />
        </Suspense>
        <OrbitControls autoRotate autoRotateSpeed={1.0} target={[0, 0, 0]} />
      </Canvas>
      <div className="absolute bottom-6 left-0 right-0 text-center pointer-events-none">
        <p className="text-zinc-500 text-[11px] font-semibold tracking-wide drop-shadow-md uppercase">Drag to orbit the reconstructed 3D pose</p>
      </div>
      <a href={modelUrl} download className="absolute top-4 right-4 bg-zinc-900/80 border border-zinc-700 backdrop-blur px-4 py-2 rounded-full text-sm font-semibold text-zinc-300 shadow-lg hover:bg-zinc-800 hover:text-white transition-colors z-10">
        Download .obj
      </a>
    </>
  );
}

function PipelineModule() {
  const [images, setImages] = useState<ImageFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  
  // Photogrammetry State
  const [photoStatus, setPhotoStatus] = useState<'idle' | 'processing' | 'complete' | 'error'>('idle');
  const [photoJobId, setPhotoJobId] = useState<string | null>(null);
  const [photoModelUrl, setPhotoModelUrl] = useState<string | null>(null);
  const [photoHandModelUrl, setPhotoHandModelUrl] = useState<string | null>(null);
  const [photoInfernoModelUrl, setPhotoInfernoModelUrl] = useState<string | null>(null);
  
  // Options
  const [framesPerTransition, setFramesPerTransition] = useState(10);
  const [shiftAmount, setShiftAmount] = useState(0.8);
  const [gridSize, setGridSize] = useState(15);
  const [shiftStep, setShiftStep] = useState(6);
  const [datasetType, setDatasetType] = useState('full_body');

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
    setPhotoStatus('idle');
    setPhotoModelUrl(null);
    setPhotoHandModelUrl(null);
    localStorage.removeItem("unified_job_id");
    localStorage.removeItem("unified_result_id");
    localStorage.removeItem("unified_results");
    
    const formData = new FormData();
    images.forEach((img, i) => formData.append("files", img.file, `image_${i}.jpg`));
    formData.append("frames_per_transition", framesPerTransition.toString());
    formData.append("shift_amount", shiftAmount.toString());
    formData.append("grid_size", gridSize.toString());
    formData.append("shift_step", shiftStep.toString());
    formData.append("dataset_type", datasetType);

    try {
      // Step 1: Interpolation + per-frame analysis
      const res = await fetch("http://127.0.0.1:8000/api/pipeline-mesh", { method: "POST", body: formData });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setResults(data);
      // Persist only the tiny result_id — not the 50MB of base64 images
      if (data.result_id) {
        localStorage.setItem("unified_result_id", data.result_id);
      }

      // Step 2: Photogrammetry (Automatic)
      const photoFormData = new FormData();
      images.forEach((img, i) => photoFormData.append("files", img.file, `image_${i}.jpg`));
      
      const photoRes = await fetch('http://127.0.0.1:8000/api/pipeline-photogrammetry', { method: 'POST', body: photoFormData });
      const photoData = await photoRes.json();
      
      if (photoData.job_id) {
        setPhotoJobId(photoData.job_id);
        localStorage.setItem("unified_job_id", photoData.job_id);
        setPhotoStatus('processing');
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Restore 3D avatar job if still processing
    const savedJobId = localStorage.getItem("unified_job_id");
    if (savedJobId) {
      setPhotoJobId(savedJobId);
      setPhotoStatus('processing');
    }
    // Restore pipeline results from server using persisted result_id
    const savedResultId = localStorage.getItem("unified_result_id");
    if (savedResultId) {
      fetch(`http://127.0.0.1:8000/api/pipeline-results/${savedResultId}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setResults(data); })
        .catch(() => {});
    }
  }, []); // run once on mount only

  useEffect(() => {
    if (photoStatus !== 'processing' || !photoJobId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:8000/api/job-status/${photoJobId}`);
        const data = await res.json();
        if (data.status === 'complete') {
          setPhotoModelUrl(data.model_url);
          if (data.hand_model_url) {
            setPhotoHandModelUrl(data.hand_model_url);
          }
          if (data.inferno_model_url) {
            setPhotoInfernoModelUrl(data.inferno_model_url);
          }
          setPhotoStatus('complete');
          localStorage.removeItem("unified_job_id");
          clearInterval(interval);
        } else if (data.status === 'error') {
          setPhotoStatus('error');
          clearInterval(interval);
        }
      } catch (err) {
        console.error(err);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [photoStatus, photoJobId]);

  return (
    <div className="space-y-12">
      <div>
        <div className="mb-6 flex flex-col gap-2">
          <h2 className="text-2xl font-bold tracking-tight text-white">1. Dataset Upload</h2>
          <p className="text-sm text-zinc-400">Upload your 20-100 photos here. The AI will automatically extract the skeleton data and then build the photorealistic 3D avatar.</p>
        </div>
        
        <div className="bg-[#18181b] border-2 border-dashed border-zinc-700 hover:border-zinc-500 rounded-xl p-8 mb-6 transition-colors">
          <input type="file" multiple accept="image/*" onChange={handleFileUpload} className="hidden" id="file-upload" />
          <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center justify-center text-zinc-400 hover:text-zinc-200 transition-colors">
            <svg className="w-8 h-8 mb-3 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            <span className="font-medium">Click to upload images</span>
          </label>
        </div>

        {images.length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={images.map(i => i.id)} strategy={horizontalListSortingStrategy}>
              <div className="flex flex-wrap gap-4 p-5 bg-[#18181b] rounded-xl border border-zinc-800 shadow-inner">
                {images.map(item => (
                  <SortableItem key={item.id} item={item} onRemove={handleRemove} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white mb-6">2. Processing Options</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 bg-[#18181b] p-6 rounded-xl border border-zinc-800">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Dataset Type</label>
            <select value={datasetType} onChange={e => setDatasetType(e.target.value)} className="w-full border border-zinc-700 rounded-md p-2.5 bg-zinc-900 text-zinc-200 focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all">
              <option value="full_body">Full Body (Body + Hands)</option>
              <option value="hands_only">Hands Only</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Frames / Transition</label>
            <input type="number" min="2" max="60" value={framesPerTransition} onChange={e => setFramesPerTransition(Number(e.target.value))} className="w-full border border-zinc-700 rounded-md p-2.5 bg-zinc-900 text-zinc-200 focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all font-mono" />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">3D Shift Amount</label>
            <input type="number" step="0.1" value={shiftAmount} onChange={e => setShiftAmount(Number(e.target.value))} className="w-full border border-zinc-700 rounded-md p-2.5 bg-zinc-900 text-zinc-200 focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all font-mono" />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Rotation Frames</label>
            <input type="number" min="3" max="45" step="2" value={gridSize} onChange={e => setGridSize(Number(e.target.value))} className="w-full border border-zinc-700 rounded-md p-2.5 bg-zinc-900 text-zinc-200 focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all font-mono" />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Hand Rotation Int.</label>
            <input type="number" min="1" max="20" value={shiftStep} onChange={e => setShiftStep(Number(e.target.value))} className="w-full border border-zinc-700 rounded-md p-2.5 bg-zinc-900 text-zinc-200 focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all font-mono" />
          </div>
        </div>
      </div>

      <div className="pt-4">
        <button 
          onClick={runPipeline} 
          disabled={loading || images.length < 2} 
          className="w-full py-4 bg-zinc-100 text-black font-semibold rounded-xl hover:bg-white hover:scale-[1.01] active:scale-100 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:hover:scale-100 disabled:cursor-not-allowed transition-all shadow-lg flex items-center justify-center gap-3 text-lg"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-6 w-6 text-amber-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Computing Neural Models...</span>
            </>
          ) : (
            'Run Volumetric Processing'
          )}
        </button>
      </div>

      {results && (
        <div className="mt-16 border-t border-zinc-800 pt-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="flex items-center gap-4 mb-10">
            <h2 className="text-3xl font-bold tracking-tight text-white">Volumetric Processing Results</h2>
            <div className="px-3 py-1 bg-amber-500/10 text-amber-500 text-xs font-bold rounded-full border border-amber-500/20">SUCCESS</div>
          </div>
          
          {/* Interpolated Video */}
          <div className="mb-20">
            <h3 className="text-xl font-semibold mb-6 text-zinc-200">Interpolated Sequence</h3>
            
            {/* Video Player */}
            <div className="mb-10 bg-[#18181b] p-4 rounded-xl border border-zinc-800 shadow-lg">
              {results.interp_frames?.length > 0
                ? <FramePlayer frames={results.interp_frames} videoId={results.video_id} />
                : <p className="text-sm text-zinc-500">No interpolation frames returned.</p>
              }
            </div>

            {/* Transition Steps Filmstrip */}
            {results.interp_frames?.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 mb-4">Transition Steps (Filmstrip)</h4>
                <div className="flex overflow-x-auto gap-6 pb-6 snap-x border-b border-zinc-800 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
                  {results.interp_frames.map((frameB64: string, idx: number) => (
                    <div key={idx} className="flex-none w-32 md:w-48 snap-center">
                      <div className="bg-[#18181b] p-3 rounded-xl border border-zinc-800 shadow-md transition-transform hover:scale-105">
                        <img 
                          src={`data:image/jpeg;base64,${frameB64}`} 
                          alt={`Transition Step ${idx + 1}`} 
                          className="w-full h-auto rounded-lg"
                        />
                        <p className="text-xs text-center text-zinc-500 mt-3 font-medium">Step {idx + 1}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-end gap-3 mb-8">
              <h3 className="text-xl font-semibold text-zinc-200">Per-Frame Analysis</h3>
              <span className="text-sm text-zinc-500 font-normal pb-0.5">({results.frames?.length || 0} samples from dataset)</span>
            </div>
            
            <div className="space-y-12">
              {results.frames?.map((frame: FrameResult, i: number) => (
                <div key={i} className="bg-[#18181b] rounded-2xl border border-zinc-800 p-8 shadow-xl">
                  <h4 className="font-bold text-lg mb-6 text-white border-b border-zinc-800/50 pb-4">Sample Frame <span className="text-amber-500">{i + 1}</span></h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* 1. Detection preview */}
                    <div className="bg-[#0f0f11] rounded-xl p-4 border border-zinc-800/80 flex flex-col shadow-inner">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500"></span> Detection (YOLOv8)
                      </h4>
                      <div className="flex-1 flex items-center justify-center bg-black rounded-lg overflow-hidden min-h-[260px] relative">
                        {frame.preview ? <img src={`data:image/jpeg;base64,${frame.preview}`} alt="Preview" className="w-full h-auto" /> : <div className="text-xs text-zinc-600">No detection</div>}
                      </div>
                    </div>

                    {/* 2. Holistic skeleton overlay */}
                    <div className="bg-[#0f0f11] rounded-xl p-4 border border-zinc-800/80 flex flex-col shadow-inner">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span> AI Skeleton Mapping
                      </h4>
                      <div className="flex-1 flex items-center justify-center bg-black rounded-lg overflow-hidden min-h-[260px] relative">
                        {frame.full_image
                          ? <StaticHolisticView imageBase64={frame.full_image} title="" datasetType={datasetType} />
                          : <div className="text-xs text-zinc-600 p-4">No image</div>
                        }
                      </div>
                    </div>

                    {/* 3. Depth Anything V2 Map */}
                    <div className="bg-[#0f0f11] rounded-xl p-4 border border-zinc-800/80 flex flex-col shadow-inner">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500"></span> Depth Anything V2 Map
                      </h4>
                      <div className="flex-1 flex items-center justify-center bg-black rounded-lg overflow-hidden min-h-[260px] relative">
                        {frame.depth_map ? (
                          <img src={`data:image/jpeg;base64,${frame.depth_map}`} alt="Depth" className="w-full h-auto" />
                        ) : (
                          <div className="text-xs text-zinc-600 p-4">Calculating...</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* AUTOMATIC 3D STATUE RENDER & DEPTH MESH & VOLUMETRIC POINT CLOUDS */}
      {(photoStatus === 'processing' || photoModelUrl || (results && results.frames?.length > 0)) && (
        <div className="mt-20 border-t border-zinc-800 pt-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="mb-10">
            <h2 className="text-3xl font-bold tracking-tight text-white mb-2">3D Volumetric & Avatar Outputs</h2>
            <p className="text-zinc-400">Photorealistic 3D avatar from Apple Object Capture, alongside a Depth Anything V2 displaced mesh terrain.</p>
          </div>
          
          {photoStatus === 'processing' && (
            <div className="p-4 bg-amber-500/10 text-amber-500 rounded-xl text-sm border border-amber-500/20 flex items-center gap-4 mb-10 shadow-inner">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
              </span>
              <span className="font-semibold tracking-wide">COMPUTING PHOTOREALISTIC 3D MESH IN BACKGROUND (APPLE OBJECT CAPTURE)...</span>
              <button onClick={() => { localStorage.removeItem("unified_job_id"); setPhotoStatus('idle'); }} className="ml-auto text-amber-500/60 hover:text-amber-500 underline transition-colors">Cancel</button>
            </div>
          )}

          {/* Row 1: Photogrammetry & Displaced Mesh */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-12">
            
            {/* Left: Original Photogrammetry */}
            <div className="bg-[#18181b] p-6 rounded-2xl border border-zinc-800 shadow-xl">
              <h3 className="text-lg font-bold text-white mb-1">Photorealistic 3D Avatar</h3>
              <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-4 font-semibold">Apple Object Capture · Apple Neural Engine</p>
              {photoModelUrl ? (
                <div className="bg-[#0f0f11] rounded-xl overflow-hidden shadow-inner h-[500px] relative border border-zinc-800/80">
                  <PhotogrammetryViewer modelUrl={photoModelUrl} />
                </div>
              ) : (
                <div className="bg-[#0f0f11] rounded-xl h-[500px] flex items-center justify-center border border-zinc-800/80 shadow-inner">
                  <p className="text-sm text-zinc-600 font-medium">Generating 3D avatar in background...</p>
                </div>
              )}
            </div>

            {/* Right: Depth Anything V2 — 3D displaced mesh */}
            <div className="bg-[#18181b] p-6 rounded-2xl border border-zinc-800 shadow-xl">
              <h3 className="text-lg font-bold text-white mb-1">Depth Anything V2 — 3D Relief</h3>
              <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-4 font-semibold">Photo displaced by DA V2 depth · True 3D</p>
              {results && results.frames && results.frames[0]?.depth_raw ? (
                <DepthMeshViewer
                  colorImageBase64={results.frames[0].full_image}
                  depthBase64={results.frames[0].depth_raw}
                />
              ) : (
                <div className="bg-[#0f0f11] rounded-xl h-[500px] flex items-center justify-center border border-zinc-800/80 shadow-inner">
                  <p className="text-sm text-zinc-600 font-medium">
                    {photoStatus === 'processing' ? 'Process a dataset to see the 3D relief.' : 'Process a dataset to generate.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Row 2: Point Clouds */}
          {results && results.frames && results.frames.length > 0 && (
            <div className="bg-[#18181b] p-8 rounded-2xl border border-zinc-800 shadow-xl">
              <h3 className="text-xl font-bold text-white mb-2">3D Point Cloud Reconstructions</h3>
              <p className="text-sm text-zinc-400 mb-8 border-b border-zinc-800/50 pb-6">Interactive 3D depth-displaced point clouds using isolated subject segmentation and Depth Anything V2.</p>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <True3DViewer 
                  imageBase64={results.frames[0].body_rgba || results.frames[0].full_image} 
                  depthBase64={results.frames[0].body_depth} 
                  title="3D Body Point Cloud (Isolated Subject)" 
                />
                <True3DViewer 
                  imageBase64={results.frames[0].hand_crop} 
                  depthBase64={results.frames[0].hand_depth} 
                  title="3D Hand Gesture Point Cloud" 
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>

  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<'pipeline' | 'practice' | 'comparison'>('pipeline');

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-300 font-sans selection:bg-amber-500/30">
      <main className="max-w-7xl mx-auto px-4 py-8">
        
        {/* Main App Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold tracking-tight text-white mb-3">LumThai: <span className="text-amber-500">Fon Leb</span> 3D Reconstruction</h1>
          <p className="text-zinc-400 max-w-2xl mx-auto">Upload image datasets of Northern Thai dance poses (full body or hands only) to extract skeletal maps and reconstruct 3D volumetric avatars with photorealistic nail extensions.</p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap justify-center gap-4 mb-10 border-b border-zinc-800 pb-6">
          <button 
            onClick={() => setActiveTab('pipeline')}
            className={`px-5 py-2 text-sm rounded-md font-medium transition-all ${activeTab === 'pipeline' ? 'bg-zinc-100 text-black shadow-md' : 'bg-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 border border-zinc-800'}`}
          >
            1. Volumetric Reconstruction
          </button>
          <button 
            onClick={() => setActiveTab('practice')}
            className={`px-5 py-2 text-sm rounded-md font-medium transition-all ${activeTab === 'practice' ? 'bg-zinc-100 text-black shadow-md' : 'bg-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 border border-zinc-800'}`}
          >
            2. Live Practice Mirror
          </button>
          <button 
            onClick={() => setActiveTab('comparison')}
            className={`px-5 py-2 text-sm rounded-md font-medium transition-all ${activeTab === 'comparison' ? 'bg-zinc-100 text-black shadow-md' : 'bg-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 border border-zinc-800'}`}
          >
            3. Posture Comparison
          </button>
        </div>

        <div className="bg-[#121212] p-6 md:p-10 rounded-2xl border border-zinc-800/80 shadow-2xl">
          <div className={activeTab === 'pipeline' ? 'block' : 'hidden'}>
            <PipelineModule />
          </div>
          <div className={activeTab === 'practice' ? 'block' : 'hidden'}>
            <WebcamTracker />
          </div>
          <div className={activeTab === 'comparison' ? 'block' : 'hidden'}>
            <PostureCoach />
          </div>
        </div>
      </main>
    </div>
  );
}
