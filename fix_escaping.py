import re

with open("src/components/TripoMeshViewer.tsx", "r") as f:
    content = f.read()

# Replace escaped backticks
content = content.replace(r"\`", "`")
# Replace escaped dollars
content = content.replace(r"\$", "$")

with open("src/components/TripoMeshViewer.tsx", "w") as f:
    f.write(content)
