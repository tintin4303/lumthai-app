with open("backend/main.py", "r") as f:
    lines = f.readlines()

out = []
in_return = False
for line in lines:
    if 'return {' in line and '"id": i' in "".join(lines[lines.index(line):lines.index(line)+5]):
        in_return = True
        out.append(line)
        continue
    
    if in_return:
        if '}' in line:
            # Add missing fields before the closing brace
            out.append('                "hand_depth": body_depth_b64,\n')
            out.append('                "full_image": encode_img(img),\n')
            out.append('                "pose_3d": pose_3d,\n')
            out.append('                "hands_3d": hands_3d\n')
            out.append(line)
            in_return = False
        continue
    
    out.append(line)

with open("backend/main.py", "w") as f:
    f.writelines(out)
