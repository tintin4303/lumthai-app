import sys
with open("backend/services.py", "r") as f:
    content = f.read()

# Add _rembg_session to globals
if "_rembg_session = None" not in content:
    content = content.replace("_depth_estimator = None", "_depth_estimator = None\n_rembg_session = None")

# Initialize it in init_ai_models
if "global _rembg_session" not in content:
    content = content.replace("global _hand_landmarker, _pose_landmarker, _yolo_pose, _models_initialized, _model_errors, _depth_estimator", 
                              "global _hand_landmarker, _pose_landmarker, _yolo_pose, _models_initialized, _model_errors, _depth_estimator, _rembg_session")

rembg_init = """    # --- Background Removal: rembg (U2Net) ---
    try:
        import rembg
        _rembg_session = rembg.new_session()
        print("Background removal: using rembg U2Net.")
    except Exception as e:
        _model_errors.append(f"rembg: {e}")
        print(f"Background removal failed: {e}")
"""
if "Background removal: using rembg U2Net." not in content:
    # Insert it right before Depth estimator
    content = content.replace("    # --- Depth:", rembg_init + "\n    # --- Depth:")

# Update isolate_and_depth to use the session
old_rembg = "pil_rgba = rembg.remove(pil_img)"
new_rembg = """global _rembg_session
        if _rembg_session is None:
            _rembg_session = rembg.new_session()
        pil_rgba = rembg.remove(pil_img, session=_rembg_session)"""

if old_rembg in content:
    content = content.replace(old_rembg, new_rembg)
    with open("backend/services.py", "w") as f:
        f.write(content)
        print("Success")
else:
    print("Failed to replace old rembg call")
