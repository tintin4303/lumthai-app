import sys
with open('backend/services.py', 'r') as f:
    content = f.read()

pose_fn = """
def extract_pose_landmarks_3d(img):
    \"\"\"
    Returns a list of 33 dictionaries with x, y, z world coordinates and visibility.
    \"\"\"
    if _pose_landmarker is None:
        return None
        
    try:
        import mediapipe as mp
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_rgb)
        
        result = _pose_landmarker.detect(mp_image)
        if not result.pose_world_landmarks or len(result.pose_world_landmarks) == 0:
            return None
            
        landmarks = result.pose_world_landmarks[0]
        
        points = []
        for lm in landmarks:
            points.append({
                "x": lm.x,
                "y": lm.y,
                "z": lm.z,
                "visibility": lm.visibility
            })
            
        return points
    except Exception as e:
        print(f"Pose extraction error: {e}")
        return None
"""

if 'def extract_pose_landmarks_3d' not in content:
    content += "\n" + pose_fn

with open('backend/services.py', 'w') as f:
    f.write(content)
