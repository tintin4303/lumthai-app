import cv2
import time
import numpy as np
import sys
import os

sys.path.append(os.path.join(os.getcwd(), 'backend'))
import services

img = np.zeros((1024, 1024, 3), dtype=np.uint8)

start = time.time()
services.init_ai_models()
init_time = time.time()

print(f"Init time: {init_time - start:.2f}s")

body_box = (0, 0, 1024, 1024)

start = time.time()
services.isolate_and_depth(img, body_box)
end = time.time()

print(f"Process time: {end - start:.2f}s")
