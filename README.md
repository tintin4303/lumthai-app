# LumThai: Fon Leb 3D Reconstruction 🇹🇭✨

LumThai is an advanced, multi-modal computer vision application dedicated to the preservation, analysis, and interactive coaching of Northern Thai classical dance (*Fon Leb*). 

The platform leverages state-of-the-art AI to reconstruct photorealistic 3D volumetric avatars from standard 2D video/images, while also providing real-time biomechanical scoring and Vision Language Model (VLM) feedback to dance practitioners.

---

## 🌟 Key Features

### 1. Volumetric Reconstruction Pipeline
Transform a dataset of dance poses (or an uploaded MP4 video) into interactive 3D point clouds and meshes.
* **Browser-Side Video Extraction:** Upload an `.mp4` and the frontend will instantly scrub and extract high-quality frames directly in your browser without slow server uploads.
* **AI Processing:** The FastAPI backend isolates the dancer using `rembg`, estimates spatial relief using **DepthAnything V2**, and tracks hands using **YOLOv8**.
* **Photogrammetry:** Uses **Apple Object Capture** to construct a highly-detailed 3D mesh (including the iconic brass nail extensions).
* **3D Point Clouds:** View the isolated subject and cropped hand gestures as interactive 3D point clouds in the browser, powered by React Three Fiber.
* **Asset Exporting:** Download the complete 3D model as a `.zip` (with `.obj`, `.mtl`, and `.png` textures) or export the raw depth point clouds as `.ply` files.

### 2. Interactive Sequence Coach
A private, fully local browser-based practice mirror that scores your biomechanical alignment against a curated master reference video.
* **Intelligent Mirroring:** Flips and swaps left/right kinematic tracking data natively so your practice screen acts like a true mirror.
* **Granular Scoring:** Independently scores your Hand/Fingers, Wrist, Arm curve, and overall Body balance.
* **Privacy First:** Webcam frames for this module never leave your browser.

### 3. Posture Comparison (Groq VLM)
An AI-powered instructor that provides corrective, conversational feedback on your poses.
* Analyzes a reference image alongside your practice frame using the **Qwen 3.8-27b Vision Language Model**.
* Runs on the ultra-fast **Groq LPU Inference Engine** for near-instantaneous multimodal visual processing.
* Returns highly actionable, plain-text feedback (e.g., *"Adjust your wrist height and bend to match the reference gesture"*).

### 4. Live Practice Mirror
A real-time webcam tracking interface visualizing your skeletal structure using **MediaPipe Holistic**. Conditionally swaps to a dedicated `Hands` model with lowered confidence thresholds to natively handle complex, overlapping finger gestures common in Thai dance.

---

## 🏗️ Architecture & Stack

### Frontend (Next.js)
* **Framework:** React 18 / Next.js (App Router)
* **Styling:** Tailwind CSS (Zinc/Amber dark mode design system)
* **3D Engine:** Three.js / React Three Fiber / Drei
* **Tracking:** MediaPipe Holistic / Hands (Client-side)

### Backend (FastAPI)
* **Server:** Python FastAPI
* **Computer Vision:** OpenCV, PyTorch, YOLOv8, MediaPipe (Server-side)
* **Depth & Matting:** DepthAnything V2, `rembg` (u2net)
* **LLM / VLM API:** Groq Python Client (Qwen-Vision)
* **3D Generation:** Apple Object Capture (Swift)

---

## 🚀 Getting Started

### Prerequisites
* **macOS** (Required for Apple Object Capture photogrammetry features)
* **Node.js** (v18+)
* **Python** (v3.10+)

### 1. Install Backend Dependencies
```bash
# Navigate to the backend directory
cd backend

# Create and activate a virtual environment
python3 -m venv venv
source venv/bin/activate

# Install Python requirements
pip install -r requirements.txt
```
*(Note: You will also need to export your `GROQ_API_KEY` in your environment for the Posture Comparison VLM to function).*

### 2. Install Frontend Dependencies
```bash
# From the project root directory
npm install
```

### 3. Run the Application
You will need two terminal windows to run both the frontend and backend simultaneously.

**Terminal 1 (Backend):**
```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

**Terminal 2 (Frontend):**
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to start using LumThai.

---

## 📂 Project Structure

```text
lumthai-app/
├── backend/
│   ├── data/              # Ephemeral pipeline output (Git ignored)
│   ├── main.py            # FastAPI entry point & API routes
│   ├── services.py        # CV, depth, and VLM logic
│   └── run_photogrammetry.swift # Apple Object Capture script
├── src/
│   ├── app/
│   │   ├── page.tsx       # Main dashboard & pipeline UI
│   │   └── layout.tsx
│   ├── components/
│   │   ├── FonLebCoach.tsx    # Interactive sequence coach UI
│   │   ├── PostureCoach.tsx   # Groq VLM comparison UI
│   │   └── WebcamTracker.tsx  # MediaPipe webcam mirror
│   └── lib/
│       └── fonLeb/        # Algorithmic scoring logic & sequences
```

---

## 📝 License
Proprietary / Educational Use. Developed for the preservation and study of classical Northern Thai dance.
