import uuid
import subprocess
from fastapi import BackgroundTasks
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
import os
import cv2
import numpy as np
from typing import List
import services
import tripo_service
from fastapi.staticfiles import StaticFiles
import os

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

# Mount the triposr output directory to serve .obj files statically
os.makedirs("output/triposr", exist_ok=True)
app.mount("/static/triposr", StaticFiles(directory="output/triposr"), name="triposr")


import os
os.makedirs(os.path.join(os.path.dirname(__file__), 'data/jobs'), exist_ok=True)
app.mount('/jobs', StaticFiles(directory=os.path.join(os.path.dirname(__file__), 'data/jobs')), name='jobs')

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


@app.post("/api/pipeline-mesh")
async def pipeline_mesh(
    files: List[UploadFile] = File(...),
    frames_per_transition: int = Form(10),
    shift_amount: float = Form(0.8),
    grid_size: int = Form(15),
    shift_step: int = Form(6),
    dataset_type: str = Form("full_body")
):
    """
    Runs detection on each uploaded image to get clean body/hand crops,
    and extracts full 33-point 3D world landmarks for the True 3D Skeleton view.
    """
    import base64, json
    try:
        services.init_ai_models()
        
        # Read all images into memory first
        images = []
        for i, f in enumerate(files):
            contents = await f.read()
            nparr = np.frombuffer(contents, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            images.append((i, img))

        def process_single_image(args):
            i, img = args
            
            # --- Downscale large images to max 1024px to prevent AI choking ---
            MAX_DIM = 1024
            h, w = img.shape[:2]
            if max(h, w) > MAX_DIM:
                scale = MAX_DIM / max(h, w)
                img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)

            hand_boxes = services.detect_hands(img)
            
            if dataset_type == "hands_only":
                body_box = (0, 0, w, h)
                pose_3d = None
            else:
                body_box = services.detect_body(img)
                pose_3d = services.extract_pose_landmarks_3d(img)
            
            hands_3d = services.extract_hand_landmarks_3d(img)

            preview = img.copy()
            bx1, by1, bx2, by2 = body_box
            
            for hb in hand_boxes:
                hx1, hy1, hx2, hy2 = hb
                cv2.rectangle(preview, (hx1, hy1), (hx2, hy2), (0, 255, 0), 2)
                cv2.putText(preview, "Hand", (hx1, hy1 - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
            
            if dataset_type != "hands_only":
                cv2.rectangle(preview, (bx1, by1), (bx2, by2), (0, 165, 255), 2)
                cv2.putText(preview, "Body", (bx1, by1 - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 165, 255), 1)

            def encode_crop(image, box):
                x1, y1, x2, y2 = box
                crop = image[y1:y2, x1:x2]
                if crop.size == 0:
                    return ""
                _, buf = cv2.imencode('.jpg', crop, [cv2.IMWRITE_JPEG_QUALITY, 90])
                return base64.b64encode(buf).decode('utf-8')

            def encode_img(image):
                _, buf = cv2.imencode('.jpg', image, [cv2.IMWRITE_JPEG_QUALITY, 90])
                return base64.b64encode(buf).decode('utf-8')

            preview_b64 = encode_img(preview)
            
            # 1. Depth Anything V2 estimation for the image
            depth_raw = services.estimate_depth(img)
            depth_color = cv2.applyColorMap(depth_raw, cv2.COLORMAP_INFERNO)
            depth_map_b64 = encode_img(depth_color)

            # Also export raw grayscale depth as PNG for 3D mesh displacement
            _, depth_raw_buf = cv2.imencode('.png', depth_raw)
            depth_raw_b64 = base64.b64encode(depth_raw_buf).decode('utf-8')

            # Also export raw full image as PNG (for coloring the displaced mesh)
            _, full_png_buf = cv2.imencode('.png', img)
            full_png_b64 = base64.b64encode(full_png_buf).decode('utf-8')

            # 2. Hand crop & hand depth
            # Merge hand boxes for the crop
            if hand_boxes:
                xs = [x for hb in hand_boxes for x in (hb[0], hb[2])]
                ys = [y for hb in hand_boxes for y in (hb[1], hb[3])]
                combined_hand_box = (min(xs), min(ys), max(xs), max(ys))
            else:
                combined_hand_box = (w // 4, 0, 3 * w // 4, h // 2)

            hand_crop_b64 = encode_crop(img, combined_hand_box)
            hx1, hy1, hx2, hy2 = combined_hand_box
            if hy2 > hy1 and hx2 > hx1:
                hand_depth_crop = depth_raw[hy1:hy2, hx1:hx2]
            else:
                hand_depth_crop = depth_raw
            _, hand_depth_buf = cv2.imencode('.png', hand_depth_crop)
            hand_depth_b64 = base64.b64encode(hand_depth_buf).decode('utf-8')

            # 3. Isolated subject & depth (rembg or depth-based fallback)
            body_rgba_b64, body_depth_b64 = services.isolate_and_depth(img, body_box)
            if not body_depth_b64:
                _, body_depth_buf = cv2.imencode('.png', depth_raw)
                body_depth_b64 = base64.b64encode(body_depth_buf).decode('utf-8')

            return {
                "id": i,
                "preview": preview_b64,
                "depth_map": depth_map_b64,
                "depth_raw": depth_raw_b64,
                "depth_color_full": encode_img(depth_color),
                "full_png": full_png_b64,
                "body_rgba": body_rgba_b64,
                "body_depth": body_depth_b64,
                "hand_crop": hand_crop_b64,
                "hand_depth": hand_depth_b64,
                "full_image": encode_img(img),
                "pose_3d": pose_3d,
                "hands_3d": hands_3d
            }

        # Sample 5 representative images evenly spaced across the dataset for per-frame analysis
        n_images = len(images)
        if n_images <= 5:
            sample_images = images
        else:
            indices = [int(i * (n_images - 1) / 4) for i in range(5)]
            sample_images = [images[idx] for idx in sorted(list(set(indices)))]

        frame_results = []
        for args in sample_images:
            frame_results.append(process_single_image(args))
            
        # --- Generate Interpolation Video ---
        raw_imgs = [img for _, img in images]
        if len(raw_imgs) > 20:
            step = len(raw_imgs) / 20.0
            interp_imgs = [raw_imgs[int(i * step)] for i in range(20)]
        else:
            interp_imgs = raw_imgs

        try:
            fpt = int(frames_per_transition)
        except Exception:
            fpt = 10
        interp = services.process_interpolation(interp_imgs, fpt)

        payload = {
            "frames": frame_results,
            "video_id": interp["video_id"],
            "interp_frames": interp["frames_b64"],
            "model_errors": []
        }

        # --- Persist results to disk so frontend can restore after page refresh ---
        result_id = str(uuid.uuid4())
        pipeline_dir = os.path.join(os.path.dirname(__file__), "data/pipeline")
        os.makedirs(pipeline_dir, exist_ok=True)
        result_path = os.path.join(pipeline_dir, f"{result_id}.json")
        with open(result_path, "w") as f:
            json.dump(payload, f)

        payload["result_id"] = result_id
        return JSONResponse(payload)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/api/pipeline-results/{result_id}")
async def get_pipeline_results(result_id: str):
    """Retrieve persisted pipeline results by result_id for page refresh restoration."""
    # Sanitize to prevent path traversal
    safe_id = result_id.replace("..", "").replace("/", "").replace("\\", "")
    result_path = os.path.join(os.path.dirname(__file__), "data/pipeline", f"{safe_id}.json")
    if not os.path.exists(result_path):
        return JSONResponse({"error": "Results not found."}, status_code=404)
    import json
    with open(result_path, "r") as f:
        data = json.load(f)
    return JSONResponse(data)


@app.post("/api/pipeline-photogrammetry")
async def start_photogrammetry(background_tasks: BackgroundTasks, files: List[UploadFile] = File(...)):
    job_id = str(uuid.uuid4())
    job_dir = os.path.join(os.path.dirname(__file__), "data/jobs", job_id)
    images_dir = f"{job_dir}/images"
    inferno_dir = f"{job_dir}/inferno_images"
    output_dir = f"{job_dir}/output"
    
    os.makedirs(images_dir, exist_ok=True)
    os.makedirs(inferno_dir, exist_ok=True)
    os.makedirs(output_dir, exist_ok=True)
    
    for file in files:
        file_location = f"{images_dir}/{file.filename}"
        with open(file_location, "wb+") as file_object:
            file_object.write(file.file.read())
            
    # Apple's Object Capture requires a directory URL for .obj export
    full_output_dir = os.path.join(output_dir, "full")
    inferno_output_dir = os.path.join(output_dir, "inferno")
    os.makedirs(full_output_dir, exist_ok=True)
    os.makedirs(inferno_output_dir, exist_ok=True)
    
    def run_photogrammetry():
        swift_script = os.path.join(os.path.dirname(__file__), "run_photogrammetry.swift")
        print(f"Starting photogrammetry for job {job_id}...")

        # Run Object Capture on original images (full quality)
        print("Running photogrammetry on original dataset (Full quality)...")
        subprocess.run(["swift", swift_script, images_dir, full_output_dir + "/", "fast"], check=False)
        
        # Apple Object Capture generates .exr displacement maps which Three.js TextureLoader crashes on.
        # We must sanitize the .mtl file to remove the 'disp' line.
        if os.path.exists(full_output_dir):
            for file in os.listdir(full_output_dir):
                if file.endswith(".mtl"):
                    mtl_path = os.path.join(full_output_dir, file)
                    with open(mtl_path, "r") as f:
                        lines = f.readlines()
                    with open(mtl_path, "w") as f:
                        for line in lines:
                            if not line.strip().startswith("disp ") and not ".exr" in line:
                                f.write(line)
        
        print(f"Job {job_id} complete!")

    background_tasks.add_task(run_photogrammetry)
    return {"job_id": job_id, "status": "processing", "message": f"Processing {len(files)} images."}


@app.get("/api/job-status/{job_id}")
async def get_job_status(job_id: str):
    job_dir = os.path.join(os.path.dirname(__file__), "data/jobs", job_id)
    full_dir = os.path.join(job_dir, "output", "full")
    inferno_dir = os.path.join(job_dir, "output", "inferno")
    
    if os.path.exists(full_dir):
        obj_files = [f for f in os.listdir(full_dir) if f.endswith(".obj")]
        if obj_files:
            resp = {
                "status": "complete",
                "model_url": f"http://127.0.0.1:8000/jobs/{job_id}/output/full/{obj_files[0]}"
            }
            # Check if INFERNO model is also ready
            if os.path.exists(inferno_dir):
                inferno_objs = [f for f in os.listdir(inferno_dir) if f.endswith(".obj")]
                if inferno_objs:
                    resp["inferno_model_url"] = f"http://127.0.0.1:8000/jobs/{job_id}/output/inferno/{inferno_objs[0]}"
            return resp
    
    if not os.path.exists(job_dir):
        return {"status": "error", "message": "Job not found."}
        
    return {"status": "processing"}
