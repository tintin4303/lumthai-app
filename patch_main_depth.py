with open("backend/main.py", "r") as f:
    content = f.read()

old_block = """            preview_b64 = encode_img(preview)
            body_crop_b64 = encode_crop(img, body_box)
            hand_crop_b64 = encode_crop(img, hand_box)"""

new_block = """            preview_b64 = encode_img(preview)
            body_rgba_b64, body_depth_b64 = services.isolate_and_depth(img, body_box)
            hand_crop_b64 = encode_crop(img, hand_box)"""

content = content.replace(old_block, new_block)

old_return = """                "body_crop": body_crop_b64,
                "hand_crop": hand_crop_b64,
                "pose_3d": pose_3d,
                "hands_3d": hands_3d,"""

new_return = """                "body_rgba": body_rgba_b64,
                "body_depth": body_depth_b64,
                "hand_crop": hand_crop_b64,
                "pose_3d": pose_3d,
                "hands_3d": hands_3d,"""

content = content.replace(old_return, new_return)

with open("backend/main.py", "w") as f:
    f.write(content)
