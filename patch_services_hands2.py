import sys
with open('backend/services.py', 'r') as f:
    content = f.read()

# Replace the previous hand extraction function with one that includes handedness
old_fn = """        all_hands = []
        for hand_lms in result.hand_world_landmarks:"""

new_fn = """        all_hands = []
        for idx, hand_lms in enumerate(result.hand_world_landmarks):
            handedness = result.handedness[idx][0].category_name if result.handedness else "Unknown"
"""

content = content.replace(old_fn, new_fn)

old_append = """                })
            all_hands.append(points)"""

new_append = """                })
            all_hands.append({
                "handedness": handedness,
                "points": points
            })"""

content = content.replace(old_append, new_append)

with open('backend/services.py', 'w') as f:
    f.write(content)
