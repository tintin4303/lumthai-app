with open("src/app/page.tsx", "r") as f:
    content = f.read()

content = content.replace("Phase 2: Motion Analysis & Interpolation", "Step 1: Motion Analysis & Interpolation")
content = content.replace("Phase 1: 3D Statue Capture (Photogrammetry)", "Step 2: 3D Statue Capture")
content = content.replace("Extract 3D skeletal data, isolate hand gestures, and generate fluid motion interpolations between keyframes.", "First, upload your dataset here to extract 3D skeletal data and generate fluid motion interpolations.")

with open("src/app/page.tsx", "w") as f:
    f.write(content)

with open("src/components/PhotogrammetryPipeline.tsx", "r") as f:
    content = f.read()

content = content.replace("Main Pipeline: 3D Statue Capture", "Step 2: Photorealistic 3D Reconstruction")
content = content.replace("Upload 20 to 100 high-resolution photos of a single, frozen pose from all angles.", "Once you have verified the skeletons above, re-upload the same dataset here to generate the final 3D photorealistic avatar.")
content = content.replace("1. Dataset Upload", "Final Dataset Upload")

with open("src/components/PhotogrammetryPipeline.tsx", "w") as f:
    f.write(content)
