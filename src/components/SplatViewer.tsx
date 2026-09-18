"use client";

import React, { useState, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Gltf, Environment, ContactShadows } from '@react-three/drei';

export default function SplatViewer() {
  const [modelUrl, setModelUrl] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setModelUrl(url);
    }
  };

  return (
    <div className="w-full flex flex-col gap-8">
      <div className="text-center">
        <h2 className="text-3xl font-bold mb-2">Photorealistic 3D (Polycam Export)</h2>
        <p className="text-gray-500 text-sm">
          Upload a <code>.gltf</code> or <code>.glb</code> file exported from Polycam to view the 3D render.
        </p>
      </div>

      <div className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center bg-gray-50">
        <input 
          type="file" 
          accept=".gltf,.glb" 
          onChange={handleFileUpload}
          className="mx-auto block text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-black file:text-white hover:file:bg-gray-800"
        />
      </div>

      {modelUrl && (
        <div className="bg-gray-100 rounded-xl overflow-hidden shadow-2xl h-[600px] relative cursor-move border border-gray-200">
          <Canvas camera={{ position: [0, 1.5, 4], fov: 45 }}>
            <color attach="background" args={['#f3f4f6']} />
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
            <Environment preset="city" />
            
            <Suspense fallback={null}>
              <Gltf src={modelUrl} position={[0, -1, 0]} receiveShadow castShadow />
              <ContactShadows position={[0, -1, 0]} opacity={0.5} scale={10} blur={2} far={4} />
            </Suspense>
            
            <OrbitControls autoRotate autoRotateSpeed={1.0} target={[0, 0, 0]} />
          </Canvas>
          <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none">
            <p className="text-gray-500 font-medium text-sm drop-shadow-md">Orbit around the 3D scene</p>
          </div>
        </div>
      )}
    </div>
  );
}
