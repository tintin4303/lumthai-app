with open("src/app/page.tsx", "r") as f:
    lines = f.readlines()

new_lines = []
imports_seen = set()

for line in lines:
    if "import { Canvas }" in line:
        if "Canvas" in imports_seen: continue
        imports_seen.add("Canvas")
    if "import { OrbitControls" in line:
        if "OrbitControls" in imports_seen: continue
        imports_seen.add("OrbitControls")
    if "import { ObjModel" in line:
        if "ObjModel" in imports_seen: continue
        imports_seen.add("ObjModel")
        
    new_lines.append(line)

content = "".join(new_lines)
content = content.replace("React.Suspense", "Suspense")
content = content.replace("import React, { useState, useRef, useEffect }", "import React, { useState, useRef, useEffect, Suspense }")

with open("src/app/page.tsx", "w") as f:
    f.write(content)
