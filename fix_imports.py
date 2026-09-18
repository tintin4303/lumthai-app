with open("src/app/page.tsx", "r") as f:
    content = f.read()

# Remove the duplicated block I just added at the top
content = content.replace("import { useEffect } from 'react';\nimport { Canvas } from '@react-three/fiber';\nimport { OrbitControls, Environment, ContactShadows } from '@react-three/drei';\nimport { ObjModel } from '../components/ObjViewer';\n\n", "")

# Now find where the main imports are and add the missing ones
new_imports = """import React, { useState, useRef, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import { ObjModel } from '../components/ObjViewer';
"""

content = content.replace("import React, { useState, useRef, useEffect } from 'react';", new_imports)

with open("src/app/page.tsx", "w") as f:
    f.write(content)
