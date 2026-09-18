import re
with open("src/app/page.tsx", "r") as f:
    content = f.read()

# Extract PhotogrammetryViewer
viewer_regex = r"function PhotogrammetryViewer\(\{ modelUrl \}: \{ modelUrl: string \}\) \{.*?\n\}\n"
match = re.search(viewer_regex, content, flags=re.DOTALL)
if match:
    viewer_code = match.group(0)
    # Remove it from the top
    content = content.replace(viewer_code, "")
    
    # Place it after imports
    import_anchor = "import { ObjModel } from '../components/ObjViewer';\n"
    content = content.replace(import_anchor, import_anchor + "\n" + viewer_code)

with open("src/app/page.tsx", "w") as f:
    f.write(content)
