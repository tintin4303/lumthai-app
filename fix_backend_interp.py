import re
with open("backend/main.py", "r") as f:
    content = f.read()

# Change the parameter list to accept frames_per_transition
new_signature = """@app.post("/api/pipeline-mesh")
async def pipeline_mesh(
    files: List[UploadFile] = File(...),
    frames_per_transition: int = Form(10),
    shift_amount: float = Form(0.8),
    grid_size: int = Form(15),
    shift_step: int = Form(6)
):"""
content = re.sub(r'@app\.post\("/api/pipeline-mesh"\)\nasync def pipeline_mesh\(files: List\[UploadFile\] = File\(\.\.\.\)\):', new_signature, content)

# Change the skeleton skipping to actually call the 3D landmarkers
new_skeleton = """
            # Extract full 33-point 3D world landmarks for True 3D Skeleton view
            pose_3d = services.extract_pose_landmarks_3d(img)
            hands_3d = services.extract_hand_landmarks_3d(img)

            preview = img.copy()
            hx1, hy1, hx2, hy2 = hand_box
            bx1, by1, bx2, by2 = body_box
"""
content = re.sub(r'# Skip 3D skeleton extraction since we don\'t render it in the UI anymore.*?bx1, by1, bx2, by2 = body_box', new_skeleton.strip(), content, flags=re.DOTALL)

# Add interpolation at the end of pipeline_mesh
new_return = """
        frame_results = [f for f in frame_results if f is not None]
        
        # --- Generate Interpolation Video ---
        raw_imgs = [img for _, img in images]
        interp = services.process_interpolation(raw_imgs, frames_per_transition)

        return {
            "frames": frame_results,
            "video_id": interp["video_id"],
            "interp_frames": interp["frames_b64"],
            "model_errors": []
        }
"""
content = re.sub(r'frame_results = \[f for f in frame_results if f is not None\]\s*return \{"frames": frame_results\}', new_return.strip(), content, flags=re.DOTALL)

with open("backend/main.py", "w") as f:
    f.write(content)
