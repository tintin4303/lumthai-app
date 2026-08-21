import services, cv2, sys

services.init_ai_models()
print("HAND:", "OK" if services._hand_landmarker else "FAILED")
print("MIDAS:", "OK" if services._midas else "FAILED")
print("ERRORS:", services._model_errors)

img = cv2.imread('/Users/nyunt/Desktop/Computer Vision/project/wong_bon.jpg')
if img is None:
    print("ERROR: Could not load test image")
    sys.exit(1)

h, w = img.shape[:2]
fallback = (w // 2, 0, w, h // 2)

box = services.detect_hand(img)
print("BOX:", box)
print("HAND DETECTED:", box != fallback)

depth = services.estimate_depth(img)
print("DEPTH RANGE:", int(depth.min()), "-", int(depth.max()))

lf = services.create_light_field(img, depth, box)
print("LIGHT FIELD:", lf.shape)

print("ALL CHECKS PASSED")
