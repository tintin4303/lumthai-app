import sys
with open('backend/services.py', 'r') as f:
    content = f.read()

new_fn = """
def isolate_and_depth(img, box):
    \"\"\"
    Takes a BGR image and a bounding box.
    Crops it, removes background (rembg), and estimates depth on the foreground.
    Returns (rgba_b64, depth_b64).
    \"\"\"
    x1, y1, x2, y2 = box
    crop = img[y1:y2, x1:x2]
    if crop.size == 0:
        return "", ""
        
    try:
        import rembg
        from PIL import Image
        import io
        import base64
        
        # 1. Remove background
        crop_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
        pil_img = Image.fromarray(crop_rgb)
        pil_rgba = rembg.remove(pil_img)
        
        # Convert back to numpy to extract alpha mask
        rgba_np = np.array(pil_rgba)
        alpha_mask = rgba_np[:, :, 3] > 0
        
        # 2. Estimate depth using existing model
        global _depth_estimator
        if _depth_estimator is None:
            init_ai_models()
            
        if _depth_estimator:
            # Depth model expects RGB PIL image
            rgb_only = Image.fromarray(rgba_np[:, :, :3])
            depth_result = _depth_estimator(rgb_only)
            depth_map = depth_result["depth"]
            depth_np = np.array(depth_map)
            
            # Mask depth map: set background to pure black (furthest away)
            depth_np[~alpha_mask] = 0
            
            # Normalize foreground depth
            fg_depth = depth_np[alpha_mask]
            if len(fg_depth) > 0:
                min_val = fg_depth.min()
                max_val = fg_depth.max()
                if max_val > min_val:
                    # Scale to 50-255 so it pushes out
                    depth_np[alpha_mask] = ((depth_np[alpha_mask] - min_val) / (max_val - min_val) * 205 + 50).astype(np.uint8)
            
            # Convert depth to base64
            _, depth_buf = cv2.imencode('.png', depth_np)
            depth_b64 = base64.b64encode(depth_buf).decode('utf-8')
        else:
            depth_b64 = ""
            
        # Convert RGBA to base64
        _, rgba_buf = cv2.imencode('.png', cv2.cvtColor(rgba_np, cv2.COLOR_RGBA2BGRA))
        rgba_b64 = base64.b64encode(rgba_buf).decode('utf-8')
        
        return rgba_b64, depth_b64
    except Exception as e:
        print(f"Isolate and depth error: {e}")
        return "", ""
"""

if 'def isolate_and_depth' not in content:
    content += "\n" + new_fn

with open('backend/services.py', 'w') as f:
    f.write(content)
