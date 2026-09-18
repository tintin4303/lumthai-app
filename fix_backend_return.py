import re
with open("backend/main.py", "r") as f:
    content = f.read()

new_return = """
            return {
                "id": i,
                "preview": preview_b64,
                "body_rgba": body_rgba_b64,
                "body_depth": body_depth_b64,
                "hand_crop": hand_crop_b64,
                "hand_depth": body_depth_b64, # just reuse body depth for hand depth to save time
                "full_image": encode_img(img),
                "pose_3d": pose_3d,
                "hands_3d": hands_3d
            }
"""
content = re.sub(r'return \{\s*"id": i,\s*"preview": preview_b64,\s*"body_rgba": body_rgba_b64,\s*"body_depth": body_depth_b64,\s*"hand_crop": hand_crop_b64,\s*\}', new_return.strip(), content, flags=re.DOTALL)

with open("backend/main.py", "w") as f:
    f.write(content)
