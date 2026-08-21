from fastapi import FastAPI, File, UploadFile, Form
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
import os
import cv2
import numpy as np
from typing import List
import services

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("output", exist_ok=True)

@app.post("/api/pipeline")
async def unified_pipeline(
    files: List[UploadFile] = File(...),
    frames_per_transition: int = Form(10),
    shift_amount: float = Form(0.8),
    grid_size: int = Form(5),
    shift_step: int = Form(6)
):
    images = []
    for f in files:
        contents = await f.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        images.append(img)
        
    try:
        results = services.process_unified_pipeline(
            images, 
            frames_per_transition, 
            shift_amount, 
            grid_size, 
            shift_step
        )
        return JSONResponse(content=results)
    except Exception as e:
        return JSONResponse(status_code=400, content={"error": str(e)})

@app.get("/api/video/{video_id}")
async def get_video(video_id: str):
    # video_id is e.g. transition_20260820_130843
    safe_id = video_id.replace("..", "").replace("/", "")
    path = os.path.join("output", safe_id, "transition.mp4")
    if not os.path.exists(path):
        return JSONResponse(status_code=404, content={"error": "Video not found"})
    return FileResponse(path, media_type="video/mp4")

