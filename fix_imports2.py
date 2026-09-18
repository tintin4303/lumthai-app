with open("src/app/page.tsx", "r") as f:
    content = f.read()

# Make sure we have the imports
imports = """
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import { ObjModel } from '../components/ObjViewer';
"""

content = imports + "\n" + content

with open("src/app/page.tsx", "w") as f:
    f.write(content)
