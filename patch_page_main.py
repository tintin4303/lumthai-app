with open("src/app/page.tsx", "r") as f:
    content = f.read()

# Add import
if "import PhotogrammetryPipeline" not in content:
    content = content.replace("import WebcamTracker from '../components/WebcamTracker';", "import PhotogrammetryPipeline from '../components/PhotogrammetryPipeline';\nimport WebcamTracker from '../components/WebcamTracker';")

# Swap component
content = content.replace("{activeTab === 'pipeline' && <PipelineModule />}", "{activeTab === 'pipeline' && <PhotogrammetryPipeline />}")

with open("src/app/page.tsx", "w") as f:
    f.write(content)
