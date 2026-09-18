with open("backend/main.py", "r") as f:
    content = f.read()

content = content.replace(
    'pose_3d = services.extract_pose_landmarks_3d(img)',
    'pose_3d = services.extract_pose_landmarks_3d(img)\n            hands_3d = services.extract_hand_landmarks_3d(img)'
)

content = content.replace(
    '"pose_3d": pose_3d,',
    '"pose_3d": pose_3d,\n                "hands_3d": hands_3d,'
)

with open("backend/main.py", "w") as f:
    f.write(content)
