"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import { ObjModel } from './ObjViewer';

export default function PhotogrammetryPipeline() {
  const [images, setImages] = useState<File[]>([]);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'complete' | 'error'>('idle');
  const [progressMsg, setProgressMsg] = useState<string>('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [modelUrl, setModelUrl] = useState<string | null>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setImages(Array.from(e.target.files));
    }
  };

  const runPipeline = async () => {
    if (images.length === 0) return;
    setStatus('uploading');
    setProgressMsg('Uploading images directly to processing engine...');

    const formData = new FormData();
    images.forEach(img => formData.append('files', img));

    try {
      const response = await fetch('http://127.0.0.1:8000/api/pipeline-photogrammetry', {
        method: 'POST',
        body: formData,
      });
      
      
      const data = await response.json();
      if (data.job_id) {
        setJobId(data.job_id);
        localStorage.setItem("photogrammetry_job_id", data.job_id);
        setStatus('processing');

        setProgressMsg('Apple Neural Engine is reconstructing 3D Geometry (This takes 30-120 mins)...');
      } else {
        throw new Error("No Job ID returned");
      }
    } catch (err) {
      setStatus('error');
      setProgressMsg('Failed to start processing pipeline.');
      console.error(err);
    }
  };


  useEffect(() => {
    const savedJobId = localStorage.getItem("photogrammetry_job_id");
    if (savedJobId && status === 'idle') {
      setJobId(savedJobId);
      setStatus('processing');
      setProgressMsg('Recovered active processing job. Waiting for Apple Neural Engine...');
    }
  }, []);

  useEffect(() => {
    if (status !== 'processing' || !jobId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:8000/api/job-status/${jobId}`);
        const data = await res.json();
        
        
        if (data.status === 'complete') {
          setModelUrl(data.model_url);
          setStatus('complete');
          setProgressMsg('3D Statue Capture Complete!');
          localStorage.removeItem("photogrammetry_job_id");
          clearInterval(interval);

        } else if (data.status === 'error') {
          setStatus('error');
          setProgressMsg('Processing failed.');
          clearInterval(interval);
        }
      } catch (err) {
        console.error("Polling error", err);
      }
    }, 10000); // poll every 10 seconds

    return () => clearInterval(interval);
  }, [status, jobId]);

  return (
    <div>
      <div className="mb-12">
        <h1 className="text-4xl font-bold mb-4 tracking-tight">Step 2: Photorealistic 3D Reconstruction</h1>
        <p className="text-gray-600 text-lg max-w-3xl">
          Once you have verified the skeletons above, re-upload the same dataset here to generate the final 3D photorealistic avatar. 
          The pipeline will use Apple's native Neural Engine to generate a photorealistic 3D avatar of the dancer.
        </p>
      </div>

      <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm mb-12">
        <h2 className="text-xl font-semibold mb-4">Final Dataset Upload</h2>
        <div className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center bg-gray-50 mb-6 transition-colors hover:border-black hover:bg-gray-100">
          <input 
            type="file" 
            multiple 
            accept="image/*"
            onChange={handleImageUpload}
            className="mx-auto block text-sm text-gray-500 file:mr-4 file:py-3 file:px-6 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-black file:text-white hover:file:bg-gray-800 transition-colors"
          />
          <p className="mt-4 text-sm text-gray-500">
            {images.length > 0 ? `${images.length} images selected ready for processing.` : "Select 20-100 photos of the exact same pose from different angles."}
          </p>
        </div>

        <button
          onClick={runPipeline}
          disabled={images.length < 20 || status === 'uploading' || status === 'processing'}
          className="w-full py-4 bg-black text-white font-medium text-lg rounded-xl hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-all shadow-sm flex items-center justify-center gap-3"
        >
          {status === 'processing' || status === 'uploading' ? (
            <>
              <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              {progressMsg}
            </>
          ) : images.length < 20 ? "Please select at least 20 images to run pipeline" : "Start 3D Reconstruction Pipeline"}
        </button>

        {status === 'processing' && (
          <div className="mt-6 p-4 bg-blue-50 text-blue-800 rounded-lg text-sm border border-blue-100 flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
            </span>
            <b>Status:</b> Apple Neural Engine is currently processing your job ({jobId}). You can leave this page open.
          </div>
        )}

        {status === 'processing' && (
          <div className="mt-4 text-center">
            <button
              onClick={() => {
                localStorage.removeItem("photogrammetry_job_id");
                setJobId(null);
                setStatus('idle');
                setProgressMsg('');
              }}
              className="text-sm text-red-500 hover:text-red-700 underline font-medium"
            >
              Cancel / Reset Stuck Job
            </button>
          </div>
        )}
      </div>

      {modelUrl && (
        <div className="mt-12 border-t border-gray-200 pt-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <h2 className="text-2xl font-semibold mb-8">Pipeline Result: 3D Statue</h2>
          <div className="bg-gray-100 rounded-2xl overflow-hidden shadow-2xl h-[700px] relative border border-gray-200">
            <Canvas camera={{ position: [0, 1.5, 4], fov: 45 }}>
              <color attach="background" args={['#f3f4f6']} />
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
              <p className="text-gray-500 font-medium drop-shadow-md">Drag to orbit the reconstructed 3D pose</p>
            </div>
            <a 
              href={modelUrl} 
              download
              className="absolute top-4 right-4 bg-white/90 backdrop-blur px-4 py-2 rounded-full text-sm font-semibold shadow hover:bg-black hover:text-white transition-colors"
            >
              Download .obj
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
