import re
with open("backend/main.py", "r") as f:
    content = f.read()

new_end = """
        # Run sequentially to avoid PyTorch/ONNX thread thrashing on Apple Silicon
        results = []
        for args in images:
            results.append(process_single_image(args))
            
        # --- Generate Interpolation Video ---
        raw_imgs = [img for _, img in images]
        interp = services.process_interpolation(raw_imgs, frames_per_transition)

        return JSONResponse({
            "frames": results,
            "video_id": interp["video_id"],
            "interp_frames": interp["frames_b64"],
            "model_errors": []
        })
"""
content = re.sub(r'# Run sequentially to avoid PyTorch/ONNX thread thrashing on Apple Silicon.*?return JSONResponse\(\{"frames": results\}\)', new_end.strip(), content, flags=re.DOTALL)

with open("backend/main.py", "w") as f:
    f.write(content)
