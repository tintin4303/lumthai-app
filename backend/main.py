from fastapi import FastAPI, File, UploadFile, Form
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
import os
import cv2
import numpy as np
from typing import List
import services
from dotenv import load_dotenv

# Load custom YOLO model globally so it's ready in memory (we will try/except in case it's still training)
try:
    from ultralytics import YOLO
    # Look for the model in the backend folder by default
    custom_model_path = os.path.join(os.path.dirname(__file__), "lumthai_classifier.pt")
    if os.path.exists(custom_model_path):
        custom_classifier = YOLO(custom_model_path)
    else:
        custom_classifier = None
except ImportError:
    custom_classifier = None

# Load environment variables from .env file
load_dotenv()

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

@app.post("/api/classify")
async def classify_dance(image: UploadFile = File(...)):
    """Classify the uploaded image as Fon Leap or Fon Mean using our custom trained model."""
    global custom_classifier
    if custom_classifier is None:
        # Try to reload it in case training just finished
        if os.path.exists(custom_model_path):
            custom_classifier = YOLO(custom_model_path)
        else:
            return JSONResponse(status_code=503, content={"error": "Custom model is still training or not found."})
            
    # Read image
    contents = await image.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    # Run inference
    results = custom_classifier(img)
    
    # Parse results
    top_class_idx = results[0].probs.top1
    confidence = float(results[0].probs.top1conf.cpu().numpy())
    class_name = results[0].names[top_class_idx]
    
    return {
        "class": class_name,
        "confidence": confidence
    }

@app.post("/api/analyze-pose")
async def analyze_pose(
    user_image: UploadFile = File(...),
    master_image: UploadFile = File(...)
):
    import os
    from groq import Groq
    import base64
    
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        return JSONResponse(status_code=400, content={"error": "GROQ_API_KEY environment variable is not set."})
        
    try:
        user_bytes = await user_image.read()
        master_bytes = await master_image.read()
        
        user_b64 = base64.b64encode(user_bytes).decode('utf-8')
        master_b64 = base64.b64encode(master_bytes).decode('utf-8')
        
        client = Groq(api_key=api_key)
        
        prompt = "You are an expert in Thai classical dance. Compare the practice pose (first image) to the reference pose (second image). What is the practitioner doing wrong anatomically? Be brief and actionable (e.g. 'Raise your right elbow')."
        
        completion = client.chat.completions.create(
            model="qwen/qwen3.8-27b",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{user_b64}"}},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{master_b64}"}}
                    ]
                }
            ],
            max_tokens=300,
        )
        
        return {"feedback": completion.choices[0].message.content}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/api/video/{video_id}")
async def get_video(video_id: str):
    safe_id = video_id.replace("..", "").replace("/", "")
    path = os.path.join("output", safe_id, "transition.mp4")
    if not os.path.exists(path):
        return JSONResponse(status_code=404, content={"error": "Video not found"})
    return FileResponse(path, media_type="video/mp4")

