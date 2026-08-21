import cv2
import numpy as np
import base64
import os
from datetime import datetime

# Global AI model handles
_hand_landmarker = None
_midas = None
_midas_transforms = None
_device = None
_models_initialized = False
_model_errors = []

HAND_LANDMARKER_MODEL = os.path.join(os.path.dirname(__file__), "hand_landmarker.task")

def init_ai_models():
    global _hand_landmarker, _models_initialized, _model_errors
    if _models_initialized:
        return
    _models_initialized = True
    _model_errors = []

    # Hand detection uses YOLOv8 Pose
    try:
        from ultralytics import YOLO
        import torch
        _hand_landmarker = YOLO("yolov8n-pose.pt")
        # Ensure model is downloaded and loaded
        _hand_landmarker.info(verbose=False)
        print("Hand detection: using YOLOv8 pose.")
    except Exception as e:
        _model_errors.append(f"YOLOv8 Pose: {e}")
        print(f"Hand detection fallback: OpenCV skin-tone.")

    print("Depth estimation: using green-screen heuristic.")



# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def label_image(img, label):
    out = img.copy()
    cv2.rectangle(out, (0, 0), (out.shape[1], 28), (0, 0, 0), -1)
    cv2.putText(out, label, (6, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
    return out

def img_to_base64(img):
    _, buffer = cv2.imencode(".png", img)
    return base64.b64encode(buffer).decode("utf-8")


# ---------------------------------------------------------------------------
# 1. Hand Detection (MediaPipe Tasks API)
# ---------------------------------------------------------------------------

def detect_hand(img):
    """Detect hand using YOLOv8 pose model (keypoints 9 and 10)."""
    h, w = img.shape[:2]
    fallback = (w // 2, 0, w, h // 2)

    try:
        if hasattr(_hand_landmarker, 'predict'):
            results = _hand_landmarker(img, verbose=False)
            if len(results) > 0 and results[0].keypoints is not None:
                kpts = results[0].keypoints.xy[0].cpu().numpy()
                conf = results[0].keypoints.conf[0].cpu().numpy()
                
                # Check wrists (9, 10), elbows (7, 8), shoulders (5, 6)
                candidates = []
                for idx in [9, 10, 7, 8, 5, 6]:
                    if conf[idx] > 0.4:
                        candidates.append(kpts[idx])
                
                if candidates:
                    # Pick the highest point (minimum y) - usually the active raised hand in Thai dance
                    best_pt = min(candidates, key=lambda p: p[1])
                    cx, cy = int(best_pt[0]), int(best_pt[1])
                    
                    # 250x250 crop around the joint
                    box_size = 250
                    x1 = max(0, cx - box_size // 2)
                    y1 = max(0, cy - box_size // 2)
                    x2 = min(w, x1 + box_size)
                    y2 = min(h, y1 + box_size)
                    return (x1, y1, x2, y2)
                    
        # Fallback to OpenCV heuristic if YOLO fails or isn't loaded
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        ycrcb = cv2.cvtColor(img, cv2.COLOR_BGR2YCrCb)
        mask_hsv = cv2.inRange(hsv, np.array([0, 20, 70]), np.array([20, 255, 255]))
        mask_ycrcb = cv2.inRange(ycrcb, np.array([0, 133, 77]), np.array([255, 173, 127]))
        skin_mask = cv2.bitwise_and(mask_hsv, mask_ycrcb)

        cv2.rectangle(skin_mask, (0, int(h * 0.75)), (w, h), 0, -1)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        face_cascade = cv2.CascadeClassifier(cascade_path)
        
        if not face_cascade.empty():
            faces = face_cascade.detectMultiScale(gray, 1.1, 4)
            for (fx, fy, fw, fh) in faces:
                cv2.rectangle(skin_mask, (max(0, fx-30), max(0, fy-30)), (min(w, fx+fw+30), min(h, fy+fh+60)), 0, -1)

        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
        skin_mask = cv2.morphologyEx(skin_mask, cv2.MORPH_CLOSE, kernel)
        skin_mask = cv2.morphologyEx(skin_mask, cv2.MORPH_OPEN, kernel)
        contours, _ = cv2.findContours(skin_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        valid_contours = [c for c in contours if cv2.contourArea(c) > 300]
        if not valid_contours: return fallback

        best_contour = None
        max_dist = -1
        for c in valid_contours:
            M = cv2.moments(c)
            if M["m00"] != 0:
                cx = int(M["m10"] / M["m00"])
                dist = abs(cx - w / 2)
                if dist > max_dist:
                    max_dist = dist
                    best_contour = c

        if best_contour is None: return fallback
        M = cv2.moments(best_contour)
        cx, cy = int(M["m10"] / M["m00"]), int(M["m01"] / M["m00"])
        box_size = 250
        return (max(0, cx - box_size // 2), max(0, cy - box_size // 2), min(w, max(0, cx - box_size // 2) + box_size), min(h, max(0, cy - box_size // 2) + box_size))

    except Exception as e:
        print(f"Hand detection error: {e}")
        return fallback


# ---------------------------------------------------------------------------
# 2. Light Field (Chapter 14 style, from original script)
# ---------------------------------------------------------------------------

def create_light_field(img, depth_map, crop_box, grid_size=5, shift_step=6):
    """Generates a synthetic left/center/right multi-view montage with true 3D parallax."""
    x1, y1, x2, y2 = crop_box
    crop_img = img[y1:y2, x1:x2]
    crop_depth = depth_map[y1:y2, x1:x2]

    if crop_img.size == 0 or crop_depth.size == 0:
        return img

    # Resize to fixed height for montage
    target_h = 300
    scale = target_h / crop_img.shape[0]
    target_w = int(crop_img.shape[1] * scale)
    crop_img = cv2.resize(crop_img, (target_w, target_h), interpolation=cv2.INTER_AREA)
    crop_depth = cv2.resize(crop_depth, (target_w, target_h), interpolation=cv2.INTER_AREA)

    baseline = 2.0
    # shift_step in UI is 1-20. Let's scale it to shift_amount (e.g. 0.0 to 1.5)
    amount = shift_step / 10.0

    left_view = render_depth_view(crop_img, crop_depth, shift_amount=-amount, baseline=baseline)
    center_view = render_depth_view(crop_img, crop_depth, shift_amount=0.0, baseline=baseline)
    right_view = render_depth_view(crop_img, crop_depth, shift_amount=amount, baseline=baseline)

    left_view = label_image(left_view, "Left View")
    center_view = label_image(center_view, "Center")
    right_view = label_image(right_view, "Right View")

    return np.hstack([left_view, center_view, right_view])


# ---------------------------------------------------------------------------
# 3. Depth Estimation (MiDaS)
# ---------------------------------------------------------------------------

def estimate_depth(img):
    """Return a grayscale depth map the same size as img."""
def estimate_green_screen_foreground(img):
    """Estimate dancer mask from the green background in the Thai pose images."""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

    # Green-screen range. This intentionally catches the bright green background.
    lower_green = np.array([35, 35, 35], dtype=np.uint8)
    upper_green = np.array([90, 255, 255], dtype=np.uint8)
    green_mask = cv2.inRange(hsv, lower_green, upper_green)

    foreground = cv2.bitwise_not(green_mask)
    kernel = np.ones((7, 7), np.uint8)
    foreground = cv2.morphologyEx(foreground, cv2.MORPH_OPEN, kernel, iterations=1)
    foreground = cv2.morphologyEx(foreground, cv2.MORPH_CLOSE, kernel, iterations=3)

    contours, _ = cv2.findContours(foreground, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    clean = np.zeros(foreground.shape, dtype=np.uint8)
    if contours:
        large = [c for c in contours if cv2.contourArea(c) > 800]
        cv2.drawContours(clean, large, -1, 255, -1)

    return cv2.GaussianBlur(clean, (21, 21), 0)


def estimate_depth(img, side_bias=0.0):
    """
    Create an approximate depth map replacing the neural network model.
    Darker pixels (lower values) are treated as closer in the rendering math.
    """
    h, w = img.shape[:2]
    foreground = estimate_green_screen_foreground(img).astype(np.float32) / 255.0

    x = np.linspace(0, 1, w, dtype=np.float32)[None, :]
    y = np.linspace(0, 1, h, dtype=np.float32)[:, None]

    # Background stays far (235). Dancer foreground is closer.
    depth = np.full((h, w), 235, dtype=np.float32)
    depth -= foreground * 145

    # Lower body and center body are treated as slightly closer for stronger parallax.
    center_x = np.exp(-5.0 * (x - 0.5) ** 2)
    lower_body = np.exp(-5.0 * (y - 0.68) ** 2)
    depth -= foreground * center_x * lower_body * 35

    # Optional side bias
    depth += foreground * side_bias * (x - 0.5) * 45

    return np.clip(depth, 60, 255).astype(np.uint8)


# ---------------------------------------------------------------------------
# 4. Depth-Based Rendering (from user's script)
# ---------------------------------------------------------------------------

def render_depth_view(color_img, depth_img, shift_amount=0.8, baseline=2.0):
    """
    Renders a new viewpoint from a color image and its depth map.
    Follows the Chapter 14 teacher sample 3D warping approximation.
    """
    h, w = color_img.shape[:2]

    if depth_img.max() > 1:
        depth_norm = depth_img.astype(np.float32) / 255.0
    else:
        depth_norm = depth_img.astype(np.float32)

    y, x = np.mgrid[0:h, 0:w]
    x = x - w / 2
    y = y - h / 2

    focal_length = 500
    depth_epsilon = 0.1
    disparity = baseline * focal_length / (depth_norm * 100 + depth_epsilon)

    map_x = (x + disparity * shift_amount + w / 2).astype(np.float32)
    map_y = (y + h / 2).astype(np.float32)

    new_view = cv2.remap(
        color_img,
        map_x,
        map_y,
        cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REFLECT101,
    )
    return new_view


# ---------------------------------------------------------------------------
# 5. Interpolation (from original interpolation.py)
# ---------------------------------------------------------------------------

def process_interpolation(images, frames_per_transition=10, fps=15):
    if len(images) < 2:
        raise ValueError("At least 2 images required.")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = os.path.join("output", f"transition_{timestamp}")
    os.makedirs(output_dir, exist_ok=True)

    # Resize all images to match the first frame
    height, width = images[0].shape[:2]
    video_filename = os.path.join(output_dir, "transition.mp4")

    # Try H.264 (avc1) first — browser-compatible. Fall back to mp4v.
    for fourcc_str in ["avc1", "H264", "mp4v"]:
        fourcc = cv2.VideoWriter_fourcc(*fourcc_str)
        video_writer = cv2.VideoWriter(video_filename, fourcc, fps, (width, height))
        if video_writer.isOpened():
            break
        video_writer.release()

    total_transitions = len(images) - 1
    all_frames = []

    for idx in range(total_transitions):
        img1 = images[idx].astype(np.float32)
        img2 = images[idx + 1]
        if img2.shape[:2] != (height, width):
            img2 = cv2.resize(img2, (width, height))
        img2 = img2.astype(np.float32)

        steps = frames_per_transition if idx == total_transitions - 1 else frames_per_transition - 1
        for i in range(steps):
            alpha = i / float(max(frames_per_transition - 1, 1))
            frame = np.clip((1 - alpha) * img1 + alpha * img2, 0, 255).astype(np.uint8)
            video_writer.write(frame)
            all_frames.append(frame)

    video_writer.release()

    # Also save each frame as PNG so the frontend can display them as a slideshow fallback
    frames_b64 = []
    for frame in all_frames:
        frames_b64.append(img_to_base64(frame))

    return {
        "video_id": f"transition_{timestamp}",
        "frames_b64": frames_b64,
    }


# ---------------------------------------------------------------------------
# Master Pipeline
# ---------------------------------------------------------------------------

def process_unified_pipeline(images, frames_per_transition=10, shift_amount=0.8, grid_size=5, shift_step=6):
    init_ai_models()

    frame_results = []
    for idx, img in enumerate(images):
        # Step 1: Depth estimation (do this first so we can use it for 3D light field)
        depth_map = estimate_depth(img)
        # Convert grayscale depth to 3-channel for display
        depth_display = cv2.applyColorMap(depth_map, cv2.COLORMAP_INFERNO)

        # Step 2: Detect hand region (face-excluded skin detection)
        crop_box = detect_hand(img)
        hand_detected = _hand_landmarker is not None

        # Annotate source image with detected box
        preview = img.copy()
        color = (0, 200, 0) if hand_detected else (0, 100, 255)
        cv2.rectangle(preview, (crop_box[0], crop_box[1]), (crop_box[2], crop_box[3]), color, 4)
        label = "Hand (Skin/Highest Point)" if hand_detected else "Fallback Region"
        label_image(preview, label)

        # Generate rotating views for hand
        x1, y1, x2, y2 = crop_box
        crop_img = img[y1:y2, x1:x2]
        crop_depth = depth_map[y1:y2, x1:x2]
        
        hand_views = []
        if crop_img.size > 0:
            target_h = 300
            scale = target_h / crop_img.shape[0]
            target_w = int(crop_img.shape[1] * scale)
            c_img = cv2.resize(crop_img, (target_w, target_h), interpolation=cv2.INTER_AREA)
            c_depth = cv2.resize(crop_depth, (target_w, target_h), interpolation=cv2.INTER_AREA)
            
            # sweep from -shift_step/10 to +shift_step/10
            max_shift = shift_step / 10.0
            for s in np.linspace(-max_shift, max_shift, 15):
                v = render_depth_view(c_img, c_depth, shift_amount=s)
                hand_views.append(img_to_base64(v))
        else:
            hand_views = [img_to_base64(img)]

        # Generate rotating views for body
        body_views = []
        for s in np.linspace(-shift_amount, shift_amount, 15):
            v = render_depth_view(img, depth_map, shift_amount=s)
            body_views.append(img_to_base64(v))

        frame_results.append({
            "id": idx,
            "hand_detected": hand_detected,
            "crop_box": [int(x) for x in crop_box],
            "preview": img_to_base64(preview),
            "depth_map": img_to_base64(depth_display),
            "hand_views": hand_views,
            "body_views": body_views,
        })

    # Step 5: Interpolation across sequence
    interp = process_interpolation(images, frames_per_transition)

    return {
        "frames": frame_results,
        "video_id": interp["video_id"],
        "interp_frames": interp["frames_b64"],
        "model_errors": _model_errors,
    }
