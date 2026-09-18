with open("src/app/page.tsx", "r") as f:
    content = f.read()

if "import SplatViewer" not in content:
    content = content.replace("import TripoMeshViewer from '@/components/TripoMeshViewer';", 
                              "import TripoMeshViewer from '@/components/TripoMeshViewer';\nimport SplatViewer from '@/components/SplatViewer';")
    with open("src/app/page.tsx", "w") as f:
        f.write(content)
