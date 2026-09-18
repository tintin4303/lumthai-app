with open("src/app/page.tsx", "r") as f:
    content = f.read()

new_content = """
          {activeTab === 'pipeline' && (
            <div className="flex flex-col gap-16">
              <PhotogrammetryPipeline />
              
              <div className="w-full h-px bg-gray-200"></div>
              
              <div>
                <div className="mb-12">
                  <h1 className="text-4xl font-bold mb-4 tracking-tight">Phase 2: Motion Analysis & Interpolation</h1>
                  <p className="text-gray-600 text-lg max-w-3xl">
                    Extract 3D skeletal data, isolate hand gestures, and generate fluid motion interpolations between keyframes.
                  </p>
                </div>
                <PipelineModule />
              </div>
            </div>
          )}
"""
content = content.replace("{activeTab === 'pipeline' && <PhotogrammetryPipeline />}", new_content.strip())

with open("src/app/page.tsx", "w") as f:
    f.write(content)
