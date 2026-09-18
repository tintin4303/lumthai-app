import sys
import os

with open("backend/main.py", "r") as f:
    content = f.read()

# Add standard library imports
if "import uuid" not in content:
    content = content.replace("from fastapi import FastAPI, UploadFile, File, Form", "import uuid\nimport subprocess\nimport os\nfrom fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks")

# Add StaticFiles if not present
if "from fastapi.staticfiles import StaticFiles" not in content:
    content = content.replace("from fastapi.middleware.cors import CORSMiddleware", "from fastapi.middleware.cors import CORSMiddleware\nfrom fastapi.staticfiles import StaticFiles")

# Mount jobs directory
if "app.mount('/jobs'" not in content:
    os.makedirs("backend/data/jobs", exist_ok=True)
    content = content.replace("app.add_middleware(", "app.mount('/jobs', StaticFiles(directory='backend/data/jobs'), name='jobs')\n\napp.add_middleware(")

# Add new endpoints
new_endpoints = """
@app.post("/api/pipeline-photogrammetry")
async def start_photogrammetry(background_tasks: BackgroundTasks, files: List[UploadFile] = File(...)):
    job_id = str(uuid.uuid4())
    job_dir = f"backend/data/jobs/{job_id}"
    images_dir = f"{job_dir}/images"
    output_dir = f"{job_dir}/output"
    
    os.makedirs(images_dir, exist_ok=True)
    os.makedirs(output_dir, exist_ok=True)
    
    for file in files:
        file_location = f"{images_dir}/{file.filename}"
        with open(file_location, "wb+") as file_object:
            file_object.write(file.file.read())
            
    # Run the photogrammetry process in the background
    output_obj = f"{os.getcwd()}/{output_dir}/model.obj"
    input_folder = f"{os.getcwd()}/{images_dir}"
    
    def run_photogrammetry():
        swift_script = f"{os.getcwd()}/backend/run_photogrammetry.swift"
        print(f"Starting photogrammetry for job {job_id}...")
        subprocess.run(["swift", swift_script, input_folder, output_obj], check=False)
        print(f"Job {job_id} complete!")

    background_tasks.add_task(run_photogrammetry)
    return {"job_id": job_id, "status": "processing", "message": f"Processing {len(files)} images."}

@app.get("/api/job-status/{job_id}")
async def get_job_status(job_id: str):
    output_obj = f"backend/data/jobs/{job_id}/output/model.obj"
    if os.path.exists(output_obj):
        return {"status": "complete", "model_url": f"http://127.0.0.1:8000/jobs/{job_id}/output/model.obj"}
    
    # Check if job exists
    if not os.path.exists(f"backend/data/jobs/{job_id}"):
        return {"status": "error", "message": "Job not found."}
        
    return {"status": "processing"}
"""

if "/api/pipeline-photogrammetry" not in content:
    content = content + "\n" + new_endpoints

with open("backend/main.py", "w") as f:
    f.write(content)

print("Backend patched successfully")
