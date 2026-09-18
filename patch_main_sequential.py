import sys

with open("backend/main.py", "r") as f:
    content = f.read()

old_loop = """        # Run heavily parallelized
        results = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(len(images), 5)) as executor:
            results = list(executor.map(process_single_image, images))
            
        # Sort by ID to ensure original order
        results.sort(key=lambda x: x["id"])"""

new_loop = """        # Run sequentially to avoid PyTorch/ONNX thread thrashing on Apple Silicon
        results = []
        for args in images:
            results.append(process_single_image(args))"""

content = content.replace(old_loop, new_loop)

with open("backend/main.py", "w") as f:
    f.write(content)
