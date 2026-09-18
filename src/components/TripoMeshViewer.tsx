"use client";

import React, { useState, Suspense, useCallback, useMemo } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls, Stage } from '@react-three/drei';
import { useDropzone } from 'react-dropzone';
import * as THREE from 'three';

// Uses the exact PointCloud algorithm from the original pipeline,
// but optimized for the isolated RGBA dancer.
function PointCloudScene({ rgbaB64, depthB64 }: { rgbaB64: string, depthB64: string }) {
  const texture = useLoader(THREE.TextureLoader, `data:image/png;base64,${rgbaB64}`);
  const depthTex = useLoader(THREE.TextureLoader, `data:image/png;base64,${depthB64}`);

  const geometry = useMemo(() => {
    const img = texture.image;
    const dep = depthTex.image;
    if (!img?.width || !dep?.width) return new THREE.BufferGeometry();

    const SAMPLE = 2; // High detail point cloud
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
    const DEPTH_SCALE = 1.0; // The physical thickness of the point cloud

    for (let py = 0; py < ch; py += SAMPLE) {
      for (let px = 0; px < cw; px += SAMPLE) {
        const i = (py * cw + px) * 4;
        
        // Skip transparent background pixels
        if (colorData[i + 3] < 10) continue; 
        
        const depthVal = depData[i]; // Depth (0 = background, pushed to 255)
        // Skip background depth pixels that were masked out
        if (depthVal < 10) continue;

        // Map pixel to 3D space
        const x = (px / cw) * W - W / 2;
        const y = -(py / ch) * H + H / 2;
        
        // 255 is close, 0 is far
        const z = (depthVal / 255) * DEPTH_SCALE - (DEPTH_SCALE / 2);

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
    <points>
      <primitive object={geometry} />
      <pointsMaterial size={0.02} vertexColors sizeAttenuation />
    </points>
  );
}

type MeshFrame = {
  id: number;
  preview: string;
  body_rgba: string;
  body_depth: string;
};

export default function TripoMeshViewer() {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [frames, setFrames] = useState<MeshFrame[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((accepted: File[]) => {
    setFiles(accepted);
    setPreviews(accepted.map(f => URL.createObjectURL(f)));
    setFrames([]);
    setError(null);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: true,
  });

  const handleGenerate = async () => {
    if (!files.length) return;
    setLoading(true);
    setError(null);
    setFrames([]);
    setProgress(`Isolating dancer and computing 3D depth volume for ${files.length} image(s)...`);

    const formData = new FormData();
    files.forEach(f => formData.append('files', f));

    try {
      const res = await fetch('http://localhost:8000/api/pipeline-mesh', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setFrames(data.frames);
      setProgress('');
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      setProgress('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full flex flex-col gap-8">
      <div className="text-center">
        <h2 className="text-3xl font-bold mb-2">2.5D Depth Volume Rendering</h2>
        <p className="text-gray-500 text-sm">
          Isolates the dancer from the background and extrudes realistic 3D volume using deep depth estimation.
        </p>
      </div>

      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-black bg-gray-50' : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <input {...getInputProps()} />
        <p className="text-gray-500 text-sm">
          {isDragActive ? 'Drop images here...' : 'Drag and drop pose images here, or click to select'}
        </p>
        {previews.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4 justify-center">
            {previews.map((src, i) => (
              <img key={i} src={src} className="h-20 w-auto rounded border border-gray-200 object-cover" />
            ))}
          </div>
        )}
      </div>

      <button
        onClick={handleGenerate}
        disabled={!files.length || loading}
        className="w-full py-3 bg-black text-white font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-800 transition-colors"
      >
        {loading ? 'Processing...' : `Generate 3D Volume${files.length > 1 ? ` (${files.length} images)` : ''}`}
      </button>

      {progress && (
        <p className="text-center text-sm text-gray-500 animate-pulse">{progress}</p>
      )}
      {error && (
        <p className="text-center text-sm text-red-500 font-medium">{error}</p>
      )}

      {frames.length > 0 && (
        <div className="flex flex-col gap-10">
          {frames.map((frame, i) => (
            <div key={frame.id} className="border border-gray-100 rounded-xl p-6 shadow-sm bg-white">
              <h3 className="font-bold text-lg mb-5">Frame {i + 1}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

                <div className="bg-gray-50 rounded-lg p-2 border border-gray-100">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Isolated Dancer</p>
                  {frame.body_rgba
                    ? <img src={`data:image/png;base64,${frame.body_rgba}`} className="w-full h-auto rounded bg-[url('https://upload.wikimedia.org/wikipedia/commons/4/48/Light_Grey_Checkerboard.svg')]" />
                    : <p className="text-xs text-gray-400">No body detected</p>
                  }
                </div>

                <div className="bg-gray-50 rounded-lg p-2 border border-gray-100">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Depth Map</p>
                  {frame.body_depth
                    ? <img src={`data:image/png;base64,${frame.body_depth}`} className="w-full h-auto rounded bg-black" />
                    : <p className="text-xs text-gray-400">No depth computed</p>
                  }
                </div>

                <div className="bg-gray-900 rounded-lg overflow-hidden border border-gray-800 h-64 relative cursor-move">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 p-2 absolute z-10 text-white shadow-black drop-shadow-md">3D Volume</p>
                  {frame.body_rgba && frame.body_depth ? (
                    <Canvas camera={{ position: [0, 0, 3], fov: 45 }}>
                      <ambientLight intensity={1} />
                      <directionalLight position={[0, 0, 5]} intensity={1} />
                      <Suspense fallback={null}>
                        <PointCloudScene rgbaB64={frame.body_rgba} depthB64={frame.body_depth} />
                      </Suspense>
                      {/* Limit rotation to frontal 60 degrees to hide flat back */}
                      <OrbitControls 
                        autoRotate 
                        autoRotateSpeed={1}
                        minAzimuthAngle={-Math.PI / 3}
                        maxAzimuthAngle={Math.PI / 3}
                        minPolarAngle={Math.PI / 4}
                        maxPolarAngle={Math.PI / 1.5}
                      />
                    </Canvas>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-500 text-xs">
                      No 3D generated
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
