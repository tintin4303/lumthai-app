import sys
with open('backend/main.py', 'r') as f:
    content = f.read()

# Modify the endpoint to return 3D skeleton instead of TripoSR mesh
new_endpoint = """@app.post("/api/pipeline-mesh")
async def pipeline_mesh(files: List[UploadFile] = File(...)):
    \"\"\"
    Runs detection on each uploaded image to get clean body/hand crops,
    and extracts full 33-point 3D world landmarks for the True 3D Skeleton view.
    \"\"\"
    import base64
    try:
        results = []
        for i, f in enumerate(files):
            contents = await f.read()
            nparr = np.frombuffer(contents, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            services.init_ai_models()

            hand_box = services.detect_hand(img)
            body_box = services.detect_body(img)
            
            # Extract 3D skeleton
            pose_3d = services.extract_pose_landmarks_3d(img)

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
            body_crop_b64 = encode_crop(img, body_box)
            hand_crop_b64 = encode_crop(img, hand_box)

            results.append({
                "id": i,
                "preview": preview_b64,
                "body_crop": body_crop_b64,
                "hand_crop": hand_crop_b64,
                "pose_3d": pose_3d,
            })

        return JSONResponse({"frames": results})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"error": str(e)}, status_code=500)
"""

import re
content = re.sub(r'@app.post\("/api/pipeline-mesh"\).*?(?=\n\n|\Z)', new_endpoint, content, flags=re.DOTALL)

with open('backend/main.py', 'w') as f:
    f.write(content)
