with open("src/app/page.tsx", "r") as f:
    content = f.read()

content = content.replace(
    "import { Canvas } from '@react-three/fiber';",
    "import { Canvas, useLoader, useFrame } from '@react-three/fiber';"
)

with open("src/app/page.tsx", "w") as f:
    f.write(content)
