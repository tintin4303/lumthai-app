import re

with open("src/app/page.tsx", "r") as f:
    content = f.read()

new_state = """
  const [images, setImages] = useState<ImageFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  
  // Photogrammetry state
  const [photoStatus, setPhotoStatus] = useState<'idle' | 'processing' | 'complete' | 'error'>('idle');
  const [photoJobId, setPhotoJobId] = useState<string | null>(null);
  const [photoModelUrl, setPhotoModelUrl] = useState<string | null>(null);
"""
content = re.sub(r'const \[images, setImages\] = useState<ImageFile\[\]>\(\[\]\);\s*const \[loading, setLoading\] = useState\(false\);\s*const \[results, setResults\] = useState<any>\(null\);', new_state.strip(), content)

new_run = """
  const runPipeline = async () => {
    if (images.length < 2) return;
    setLoading(true);
    setResults(null);
    setPhotoStatus('idle');
    setPhotoModelUrl(null);
    
    const formData = new FormData();
    images.forEach((img, i) => formData.append("files", img.file, `image_${i}.jpg`));
    formData.append("frames_per_transition", framesPerTransition.toString());
    formData.append("shift_amount", shiftAmount.toString());
    formData.append("grid_size", gridSize.toString());
    formData.append("shift_step", shiftStep.toString());

    try {
      // Step 1: Interpolation
      const res = await fetch("http://127.0.0.1:8000/api/pipeline", { method: "POST", body: formData });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setResults(data);

      // Step 2: Automatically start Photogrammetry
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
    const savedJobId = localStorage.getItem("unified_job_id");
    if (savedJobId && photoStatus === 'idle') {
      setPhotoJobId(savedJobId);
      setPhotoStatus('processing');
    }
  }, [photoStatus]);

  useEffect(() => {
    if (photoStatus !== 'processing' || !photoJobId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:8000/api/job-status/${photoJobId}`);
        const data = await res.json();
        if (data.status === 'complete') {
          setPhotoModelUrl(data.model_url);
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
"""
content = re.sub(r'const runPipeline = async \(\) => \{.*?\n  \};\n', new_run, content, flags=re.DOTALL)

# Now append the 3D Viewer to the UI
new_ui_end = """
          </div>
        </div>
      )}

      {/* AUTOMATIC 3D STATUE RENDER */}
      {(photoStatus === 'processing' || photoModelUrl) && (
        <div className="mt-16 border-t border-gray-200 pt-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <h2 className="text-3xl font-bold mb-4">Step 2: 3D Statue Generation</h2>
          <p className="text-gray-600 mb-8">Apple Neural Engine is converting the sequence into a photorealistic 3D mesh.</p>
          
          {photoStatus === 'processing' && (
            <div className="p-4 bg-blue-50 text-blue-800 rounded-lg text-sm border border-blue-100 flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
              </span>
              <b>Status:</b> Reconstructing 3D Geometry in the background...
              <button onClick={() => { localStorage.removeItem("unified_job_id"); setPhotoStatus('idle'); }} className="ml-auto text-red-500 underline">Cancel</button>
            </div>
          )}

          {photoModelUrl && (
            <div className="bg-gray-100 rounded-2xl overflow-hidden shadow-2xl h-[700px] relative border border-gray-200">
              <PhotogrammetryViewer modelUrl={photoModelUrl} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
"""

content = content.replace("        </div>\n      )}\n    </div>\n  );\n}", new_ui_end)

# Add imports for useEffect and ObjViewer to page.tsx
if "import { ObjModel }" not in content:
    content = content.replace("import WebcamTracker", "import { useEffect } from 'react';\nimport { Canvas } from '@react-three/fiber';\nimport { OrbitControls, Environment, ContactShadows } from '@react-three/drei';\nimport { ObjModel } from '../components/ObjViewer';\n\nfunction PhotogrammetryViewer({ modelUrl }: { modelUrl: string }) {\n  return (\n    <>\n      <Canvas camera={{ position: [0, 1.5, 4], fov: 45 }}>\n        <color attach=\"background\" args={['#f3f4f6']} />\n        <ambientLight intensity={0.5} />\n        <directionalLight position={[10, 10, 5]} intensity={1} castShadow />\n        <Environment preset=\"city\" />\n        <React.Suspense fallback={null}>\n          <ObjModel url={modelUrl} />\n          <ContactShadows position={[0, -1, 0]} opacity={0.5} scale={10} blur={2} far={4} />\n        </React.Suspense>\n        <OrbitControls autoRotate autoRotateSpeed={1.0} target={[0, 0, 0]} />\n      </Canvas>\n      <div className=\"absolute bottom-6 left-0 right-0 text-center pointer-events-none\">\n        <p className=\"text-gray-500 font-medium drop-shadow-md\">Drag to orbit the reconstructed 3D pose</p>\n      </div>\n      <a href={modelUrl} download className=\"absolute top-4 right-4 bg-white/90 backdrop-blur px-4 py-2 rounded-full text-sm font-semibold shadow hover:bg-black hover:text-white transition-colors\">\n        Download .obj\n      </a>\n    </>\n  );\n}\n\nimport WebcamTracker")

# Change the render block in Home to only render PipelineModule
content = re.sub(r'\{activeTab === \'pipeline\' && \(\s*<div className="flex flex-col gap-16">.*?<PipelineModule />\s*</div>\s*\)\}', "{activeTab === 'pipeline' && <PipelineModule />}", content, flags=re.DOTALL)

with open("src/app/page.tsx", "w") as f:
    f.write(content)
