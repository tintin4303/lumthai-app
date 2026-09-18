import sys
import re

with open("backend/main.py", "r") as f:
    content = f.read()

# Replace the sequential loop with a ThreadPoolExecutor
old_loop = """        results = []
        for i, f in enumerate(files):
            contents = await f.read()
            nparr = np.frombuffer(contents, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            services.init_ai_models()

            hand_box = services.detect_hand(img)
            body_box = services.detect_body(img)
            
            # Extract 3D skeleton
            pose_3d = services.extract_pose_landmarks_3d(img)
            hands_3d = services.extract_hand_landmarks_3d(img)

            preview = img.copy()
            hx1, hy1, hx2, hy2 = hand_box
            bx1, by1, bx2, by2 = body_box
            cv2.rectangle(preview, (hx1, hy1), (hx2, hy2), (0, 255, 0), 2)
            cv2.putText(preview, "Hand", (hx1, hy1 - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
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
            body_rgba_b64, body_depth_b64 = services.isolate_and_depth(img, body_box)
            hand_crop_b64 = encode_crop(img, hand_box)

            results.append({
                "id": i,
                "preview": preview_b64,
                "body_rgba": body_rgba_b64,
                "body_depth": body_depth_b64,
                "hand_crop": hand_crop_b64,
                "pose_3d": pose_3d,
                "hands_3d": hands_3d,
            })"""

new_loop = """        services.init_ai_models()
        
        # Read all images into memory first
        images = []
        for i, f in enumerate(files):
            contents = await f.read()
            nparr = np.frombuffer(contents, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            images.append((i, img))
            
        import concurrent.futures
        
        def process_single_image(args):
            i, img = args
            hand_box = services.detect_hand(img)
            body_box = services.detect_body(img)
            
            # Skip 3D skeleton extraction since we don't render it in the UI anymore
            pose_3d = None
            hands_3d = None

            preview = img.copy()
            hx1, hy1, hx2, hy2 = hand_box
            bx1, by1, bx2, by2 = body_box
            cv2.rectangle(preview, (hx1, hy1), (hx2, hy2), (0, 255, 0), 2)
            cv2.putText(preview, "Hand", (hx1, hy1 - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
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
            
            # Heavy operations (rembg + depth)
            body_rgba_b64, body_depth_b64 = services.isolate_and_depth(img, body_box)
            
            hand_crop_b64 = encode_crop(img, hand_box)

            return {
                "id": i,
                "preview": preview_b64,
                "body_rgba": body_rgba_b64,
                "body_depth": body_depth_b64,
                "hand_crop": hand_crop_b64,
                "pose_3d": pose_3d,
                "hands_3d": hands_3d,
            }

        # Run heavily parallelized
        results = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(len(images), 5)) as executor:
            results = list(executor.map(process_single_image, images))
            
        # Sort by ID to ensure original order
        results.sort(key=lambda x: x["id"])"""

if old_loop in content:
    content = content.replace(old_loop, new_loop)
    with open("backend/main.py", "w") as f:
        f.write(content)
        print("Success")
else:
    print("Failed to find old loop")
