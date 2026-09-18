with open("src/components/PhotogrammetryPipeline.tsx", "r") as f:
    content = f.read()

if "import { ObjModel }" not in content:
    content = content.replace("import { OrbitControls, Gltf, Environment, ContactShadows } from '@react-three/drei';", "import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';\nimport { ObjModel } from './ObjViewer';")

content = content.replace("<Gltf src={modelUrl} position={[0, -1, 0]} receiveShadow castShadow />", "<ObjModel url={modelUrl} />")

with open("src/components/PhotogrammetryPipeline.tsx", "w") as f:
    f.write(content)
