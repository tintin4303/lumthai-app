import sys
with open('backend/services.py', 'r') as f:
    content = f.read()

hand_fn = """
def extract_hand_landmarks_3d(img):
    \"\"\"
    Returns a list of detected hands, where each hand is a list of 21 dictionaries
    with x, y, z world coordinates.
    \"\"\"
    if _hand_landmarker is None:
        return []
        
    try:
        import mediapipe as mp
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_rgb)
        
        result = _hand_landmarker.detect(mp_image)
        if not result.hand_world_landmarks or len(result.hand_world_landmarks) == 0:
            return []
            
        all_hands = []
        for hand_lms in result.hand_world_landmarks:
            points = []
            for lm in hand_lms:
                points.append({
                    "x": lm.x,
                    "y": lm.y,
                    "z": lm.z
                })
            all_hands.append(points)
            
        return all_hands
    except Exception as e:
        print(f"Hand extraction error: {e}")
        return []
"""

if 'def extract_hand_landmarks_3d' not in content:
    content += "\n" + hand_fn

with open('backend/services.py', 'w') as f:
    f.write(content)
