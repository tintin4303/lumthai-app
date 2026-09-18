with open("src/app/page.tsx", "r") as f:
    content = f.read()

# Add imports
if "import TripoMeshViewer" not in content:
    content = content.replace("import PostureCoach from '../components/PostureCoach';",
                              "import PostureCoach from '../components/PostureCoach';\nimport TripoMeshViewer from '../components/TripoMeshViewer';\nimport SplatViewer from '../components/SplatViewer';")
else:
    content = content.replace("import TripoMeshViewer from '../components/TripoMeshViewer';",
                              "import TripoMeshViewer from '../components/TripoMeshViewer';\nimport SplatViewer from '../components/SplatViewer';")

# Update activeTab type
content = content.replace(
    "const [activeTab, setActiveTab] = useState<'pipeline' | 'practice' | 'comparison'>('pipeline');",
    "const [activeTab, setActiveTab] = useState<'pipeline' | 'practice' | 'comparison' | 'tripo' | 'splat'>('pipeline');"
)

# Add buttons
old_buttons = """          <button 
            onClick={() => setActiveTab('comparison')}
            className={`px-6 py-2 rounded-full font-semibold transition-colors ${activeTab === 'comparison' ? 'bg-black text-white' : 'bg-gray-200 text-black hover:bg-gray-300'}`}
          >
            Posture Comparison
          </button>
        </div>"""

new_buttons = """          <button 
            onClick={() => setActiveTab('comparison')}
            className={`px-6 py-2 rounded-full font-semibold transition-colors ${activeTab === 'comparison' ? 'bg-black text-white' : 'bg-gray-200 text-black hover:bg-gray-300'}`}
          >
            Posture Comparison
          </button>
          <button 
            onClick={() => setActiveTab('tripo')}
            className={`px-6 py-2 rounded-full font-semibold transition-colors ${activeTab === 'tripo' ? 'bg-black text-white' : 'bg-gray-200 text-black hover:bg-gray-300'}`}
          >
            2.5D Volumetric Mesh
          </button>
          <button 
            onClick={() => setActiveTab('splat')}
            className={`px-6 py-2 rounded-full font-semibold transition-colors ${activeTab === 'splat' ? 'bg-black text-white' : 'bg-gray-200 text-black hover:bg-gray-300'}`}
          >
            Gaussian Splatting
          </button>
        </div>"""

content = content.replace(old_buttons, new_buttons)

# Add components
old_comps = """          {activeTab === 'pipeline' && <PipelineModule />}
          {activeTab === 'practice' && <WebcamTracker />}
          {activeTab === 'comparison' && <PostureCoach />}
        </div>
      </main>
    </div>
  );
}"""

new_comps = """          {activeTab === 'pipeline' && <PipelineModule />}
          {activeTab === 'practice' && <WebcamTracker />}
          {activeTab === 'comparison' && <PostureCoach />}
          {activeTab === 'tripo' && <TripoMeshViewer />}
          {activeTab === 'splat' && <SplatViewer />}
        </div>
      </main>
    </div>
  );
}"""

content = content.replace(old_comps, new_comps)

with open("src/app/page.tsx", "w") as f:
    f.write(content)
