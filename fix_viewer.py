import re
with open("src/app/page.tsx", "r") as f:
    content = f.read()

viewer_code = """
function PhotogrammetryViewer({ modelUrl }: { modelUrl: string }) {
  return (
    <>
      <Canvas camera={{ position: [0, 1.5, 4], fov: 45 }}>
        <color attach="background" args={['#f3f4f6']} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
        <Environment preset="city" />
        <React.Suspense fallback={null}>
          <ObjModel url={modelUrl} />
          <ContactShadows position={[0, -1, 0]} opacity={0.5} scale={10} blur={2} far={4} />
        </React.Suspense>
        <OrbitControls autoRotate autoRotateSpeed={1.0} target={[0, 0, 0]} />
      </Canvas>
      <div className="absolute bottom-6 left-0 right-0 text-center pointer-events-none">
        <p className="text-gray-500 font-medium drop-shadow-md">Drag to orbit the reconstructed 3D pose</p>
      </div>
      <a href={modelUrl} download className="absolute top-4 right-4 bg-white/90 backdrop-blur px-4 py-2 rounded-full text-sm font-semibold shadow hover:bg-black hover:text-white transition-colors">
        Download .obj
      </a>
    </>
  );
}
"""

# Insert it above function PipelineModule()
content = content.replace("function PipelineModule() {", viewer_code + "\nfunction PipelineModule() {")

with open("src/app/page.tsx", "w") as f:
    f.write(content)
