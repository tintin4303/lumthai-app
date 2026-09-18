import sys

with open("backend/main.py", "r") as f:
    content = f.read()

resize_logic = """
        def process_single_image(args):
            i, img = args
            
            # --- Downscale large images to max 1024px to prevent AI choking ---
            MAX_DIM = 1024
            h, w = img.shape[:2]
            if max(h, w) > MAX_DIM:
                scale = MAX_DIM / max(h, w)
                img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
"""

content = content.replace("        def process_single_image(args):\n            i, img = args", resize_logic)

with open("backend/main.py", "w") as f:
    f.write(content)
