with open("backend/run_photogrammetry.swift", "r") as f:
    content = f.read()

# Change .preview to .reduced (which is supported for .obj)
content = content.replace("detail: .preview", "detail: .reduced")

with open("backend/run_photogrammetry.swift", "w") as f:
    f.write(content)
