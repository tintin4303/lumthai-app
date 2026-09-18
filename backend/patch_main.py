import sys
with open('main.py', 'r') as f:
    content = f.read()

import_statement = "import tripo_service\nfrom fastapi.staticfiles import StaticFiles\nimport os\n"

if 'import tripo_service' not in content:
    content = content.replace('import services', 'import services\n' + import_statement)

static_mount = """
app = FastAPI()

# Mount the triposr output directory to serve .obj files statically
os.makedirs("output/triposr", exist_ok=True)
app.mount("/static/triposr", StaticFiles(directory="output/triposr"), name="triposr")
"""
if 'app.mount("/static/triposr"' not in content:
    content = content.replace('app = FastAPI()', static_mount)

endpoint = """
from io import BytesIO
from PIL import Image

@app.post("/api/generate-mesh")
async def generate_mesh(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        image = Image.open(BytesIO(contents))
        # Ensure RGB
        image = image.convert("RGB")
        
        # Call tripo service
        obj_filename = tripo_service.generate_mesh_from_image(image)
        
        # Return URL to the static file
        return JSONResponse({"url": f"http://localhost:8000/static/triposr/{obj_filename}"})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"error": str(e)}, status_code=500)
"""
if '@app.post("/api/generate-mesh")' not in content:
    content += endpoint

with open('main.py', 'w') as f:
    f.write(content)
