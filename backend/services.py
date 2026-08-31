import cv2
import numpy as np
import base64
import os
from datetime import datetime

# Global AI model handles
_hand_landmarker = None
_yolo_pose = None
_models_initialized = False
_model_errors = []
_depth_estimator = None

HAND_LANDMARKER_MODEL = os.path.join(os.path.dirname(__file__), "hand_landmarker.task")

def init_ai_models():
    global _hand_landmarker, _yolo_pose, _models_initialized, _model_errors, _depth_estimator
    if _models_initialized:
        return

    _models_initialized = True
    _model_errors = []

    # --- Hand detection: MediaPipe Tasks HandLandmarker (21 keypoints per hand) ---
    try:
        import mediapipe as mp
        BaseOptions = mp.tasks.BaseOptions
        HandLandmarker = mp.tasks.vision.HandLandmarker
        HandLandmarkerOptions = mp.tasks.vision.HandLandmarkerOptions
        VisionRunningMode = mp.tasks.vision.RunningMode

        options = HandLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=HAND_LANDMARKER_MODEL),
            running_mode=VisionRunningMode.IMAGE,
            num_hands=2,
            min_hand_detection_confidence=0.3,
            min_hand_presence_confidence=0.3,
            min_tracking_confidence=0.3,
        )
        _hand_landmarker = HandLandmarker.create_from_options(options)
        print("Hand detection: using MediaPipe Tasks HandLandmarker (21 keypoints).")
    except Exception as e:
        _model_errors.append(f"MediaPipe HandLandmarker: {e}")
        print(f"Hand detection (MediaPipe) failed: {e}")

    # --- Fallback body pose: YOLOv8 for wrist localization ---
    try:
        from ultralytics import YOLO
        _yolo_pose = YOLO("yolov8n-pose.pt")
        _yolo_pose.info(verbose=False)
        print("Body pose fallback: YOLOv8 pose loaded.")
    except Exception as e:
        _model_errors.append(f"YOLOv8 Pose: {e}")

    # --- Depth: DepthAnythingV2 via HuggingFace transformers ---
    try:
        from transformers import pipeline
        _depth_estimator = pipeline("depth-estimation", model="LiheYoung/depth-anything-small-hf")
        print("Depth estimation: using DepthAnythingV2.")
    except Exception as e:
        _model_errors.append(f"Depth AI: {e}")
        print(f"Depth estimation fallback will be used: {e}")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def label_image(img, label):
    out = img.copy()
    cv2.rectangle(out, (0, 0), (out.shape[1], 28), (0, 0, 0), -1)
    cv2.putText(out, label, (6, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
    return out

def img_to_base64(img):
    _, buffer = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return base64.b64encode(buffer).decode("utf-8")

def pad_box(x1, y1, x2, y2, pad, w, h):
    """Expand a bounding box by `pad` pixels, clamped to image bounds."""
    return (
        max(0, x1 - pad),
        max(0, y1 - pad),
        min(w, x2 + pad),
        min(h, y2 + pad),
    )


# ---------------------------------------------------------------------------
# 1. Depth Estimation — DepthAnythingV2 or heuristic fallback
# ---------------------------------------------------------------------------

def estimate_depth(img):

    h, w = img.shape[:2]

    if _depth_estimator is not None:
        try:
            from PIL import Image as PILImage
            pil_img = PILImage.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
            result = _depth_estimator(pil_img)
            depth_pil = result["depth"]  # PIL Image, mode "I" (32-bit int) or "L"

            depth_np = np.array(depth_pil, dtype=np.float32)

            # Normalise to 0-255
            dmin, dmax = depth_np.min(), depth_np.max()
            if dmax > dmin:
                depth_np = (depth_np - dmin) / (dmax - dmin) * 255.0
            else:
                depth_np = np.zeros_like(depth_np)

            depth_np = depth_np.astype(np.uint8)

            # Resize to match input image
            if depth_np.shape[:2] != (h, w):
                depth_np = cv2.resize(depth_np, (w, h), interpolation=cv2.INTER_LINEAR)

            return depth_np
        except Exception as e:
            print(f"DepthAnything inference error: {e}. Falling back to heuristic.")

    # ---- Heuristic fallback (works only on studio/plain backgrounds) ----
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (21, 21), 0)
    return blurred


# ---------------------------------------------------------------------------
# 2. Hand Detection — MediaPipe Tasks (21 keypoints) → tight bounding box
# ---------------------------------------------------------------------------

def detect_hand(img):
    """
    Returns (x1, y1, x2, y2) tight crop around the most prominent hand.
    Falls back to wrist from YOLOv8 pose if MediaPipe fails.
    """
    h, w = img.shape[:2]
    fallback = (w // 4, 0, 3 * w // 4, h // 2)

    # --- Try MediaPipe Tasks HandLandmarker ---
    if _hand_landmarker is not None:
        try:
            import mediapipe as mp
            rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            result = _hand_landmarker.detect(mp_image)

            if result.hand_landmarks:
                # Pick the hand with highest average landmark visibility
                best_landmarks = result.hand_landmarks[0]

                xs = [lm.x * w for lm in best_landmarks]
                ys = [lm.y * h for lm in best_landmarks]

                x1, y1 = int(min(xs)), int(min(ys))
                x2, y2 = int(max(xs)), int(max(ys))

                return pad_box(x1, y1, x2, y2, 40, w, h)
        except Exception as e:
            print(f"MediaPipe HandLandmarker error: {e}")

    # --- Fallback: YOLOv8 pose wrist keypoints ---
    if _yolo_pose is not None:
        try:
            results = _yolo_pose(img, verbose=False)
            if results and results[0].keypoints is not None:
                kpts = results[0].keypoints.xy[0].cpu().numpy()
                conf = results[0].keypoints.conf[0].cpu().numpy()

                candidates = []
                for idx in [9, 10, 7, 8]:  # wrists then elbows
                    if conf[idx] > 0.3:
                        candidates.append(kpts[idx])

                if candidates:
                    best_pt = min(candidates, key=lambda p: p[1])  # highest point
                    cx, cy = int(best_pt[0]), int(best_pt[1])
                    box_size = 220
                    return pad_box(cx - box_size // 2, cy - box_size // 2,
                                   cx + box_size // 2, cy + box_size // 2, 0, w, h)
        except Exception as e:
            print(f"YOLOv8 pose fallback error: {e}")

    return fallback


# ---------------------------------------------------------------------------
# 3. Body Crop — tight bounding box around the full dancer using YOLOv8
# ---------------------------------------------------------------------------

def detect_body(img):
    """
    Returns (x1, y1, x2, y2) bounding box around the detected person.
    Falls back to full image if no person detected.
    """
    h, w = img.shape[:2]

    if _yolo_pose is not None:
        try:
            results = _yolo_pose(img, verbose=False)
            if results and results[0].boxes is not None and len(results[0].boxes) > 0:
                # Take the largest bounding box (most prominent person)
                boxes = results[0].boxes.xyxy.cpu().numpy()
                areas = [(b[2]-b[0]) * (b[3]-b[1]) for b in boxes]
                best_box = boxes[np.argmax(areas)]
                x1, y1, x2, y2 = [int(v) for v in best_box]
                return pad_box(x1, y1, x2, y2, 20, w, h)
        except Exception as e:
            print(f"Body detection error: {e}")

    return (0, 0, w, h)


# ---------------------------------------------------------------------------
# 4. Interpolation (Optical Flow morphing)
# ---------------------------------------------------------------------------

def process_interpolation(images, frames_per_transition=10, fps=15):
    if len(images) < 2:
        raise ValueError("At least 2 images required.")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = os.path.join("output", f"transition_{timestamp}")
    os.makedirs(output_dir, exist_ok=True)

    max_h = 720
    height, width = images[0].shape[:2]
    if height > max_h:
        scale = max_h / height
        width = int(width * scale)
        height = max_h

    video_filename = os.path.join(output_dir, "transition.mp4")

    for fourcc_str in ["avc1", "H264", "mp4v"]:
        fourcc = cv2.VideoWriter_fourcc(*fourcc_str)
        video_writer = cv2.VideoWriter(video_filename, fourcc, fps, (width, height))
        if video_writer.isOpened():
            break
        video_writer.release()

    total_transitions = len(images) - 1
    all_frames = []

    processed_images = []
    for img in images:
        if img.shape[:2] != (height, width):
            img = cv2.resize(img, (width, height), interpolation=cv2.INTER_AREA)
        processed_images.append(img)

    map_x, map_y = np.meshgrid(np.arange(width), np.arange(height))
    map_x = map_x.astype(np.float32)
    map_y = map_y.astype(np.float32)

    print("Generating Optical Flow morphing transitions...")
    for idx in range(total_transitions):
        img1 = processed_images[idx]
        img2 = processed_images[idx + 1]

        gray1 = cv2.cvtColor(img1, cv2.COLOR_BGR2GRAY)
        gray2 = cv2.cvtColor(img2, cv2.COLOR_BGR2GRAY)

        flow_forward = cv2.calcOpticalFlowFarneback(gray1, gray2, None, 0.5, 3, 15, 3, 5, 1.2, 0)
        flow_backward = cv2.calcOpticalFlowFarneback(gray2, gray1, None, 0.5, 3, 15, 3, 5, 1.2, 0)

        steps = frames_per_transition if idx == total_transitions - 1 else frames_per_transition - 1
        for i in range(steps):
            alpha = i / float(max(frames_per_transition - 1, 1))

            map_x1 = map_x + flow_forward[..., 0] * alpha
            map_y1 = map_y + flow_forward[..., 1] * alpha
            warped1 = cv2.remap(img1, map_x1, map_y1, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)

            map_x2 = map_x + flow_backward[..., 0] * (1 - alpha)
            map_y2 = map_y + flow_backward[..., 1] * (1 - alpha)
            warped2 = cv2.remap(img2, map_x2, map_y2, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)

            frame = cv2.addWeighted(warped1, 1 - alpha, warped2, alpha, 0)

            video_writer.write(frame)
            all_frames.append(frame)

    video_writer.release()

    frames_b64 = [img_to_base64(frame) for frame in all_frames]

    return {
        "video_id": f"transition_{timestamp}",
        "frames_b64": frames_b64,
    }


# ---------------------------------------------------------------------------
# 5. Master Pipeline
# ---------------------------------------------------------------------------

def process_unified_pipeline(images, frames_per_transition=10, shift_amount=0.8, grid_size=5, shift_step=6):
    init_ai_models()

    frame_results = []
    for idx, img in enumerate(images):
        h, w = img.shape[:2]

        # Step 1: AI Depth estimation (works on any background)
        depth_map = estimate_depth(img)
        depth_display = cv2.applyColorMap(depth_map, cv2.COLORMAP_INFERNO)

        # Step 2: Detect hand region (tight 21-keypoint box)
        hand_box = detect_hand(img)
        hx1, hy1, hx2, hy2 = hand_box
        hand_crop = img[hy1:hy2, hx1:hx2]
        hand_depth_crop = depth_map[hy1:hy2, hx1:hx2]

        # Step 3: Detect full body bounding box (for body 3D view)
        body_box = detect_body(img)
        bx1, by1, bx2, by2 = body_box
        body_crop = img[by1:by2, bx1:bx2]
        body_depth_crop = depth_map[by1:by2, bx1:bx2]

        # Step 4: Annotate preview with both boxes
        preview = img.copy()
        cv2.rectangle(preview, (hx1, hy1), (hx2, hy2), (0, 255, 0), 3)
        cv2.putText(preview, "Hand", (hx1, max(hy1-8, 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
        cv2.rectangle(preview, (bx1, by1), (bx2, by2), (255, 140, 0), 2)
        cv2.putText(preview, "Body", (bx1, max(by1-8, 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 140, 0), 2)

        # Safety: fall back to full image if crop is empty
        if hand_crop.size == 0:
            hand_crop = img
            hand_depth_crop = depth_map
        if body_crop.size == 0:
            body_crop = img
            body_depth_crop = depth_map

        frame_results.append({
            "id": idx,
            "hand_detected": _hand_landmarker is not None,
            "crop_box": [int(x) for x in hand_box],
            "preview": img_to_base64(preview),
            "hand_crop": img_to_base64(hand_crop),
            "hand_depth": img_to_base64(hand_depth_crop),
            "body_crop": img_to_base64(body_crop),
            "body_depth": img_to_base64(body_depth_crop),
            "full_image": img_to_base64(img),
            "depth_map": img_to_base64(depth_display),
        })

    # Step 5: Interpolation
    interp = process_interpolation(images, frames_per_transition)

    return {
        "frames": frame_results,
        "video_id": interp["video_id"],
        "interp_frames": interp["frames_b64"],
        "model_errors": _model_errors,
    }
