import os
import sys
import numpy as np
import rembg
import torch
from PIL import Image
import uuid
import base64
from io import BytesIO

# Add TripoSR directory to path so we can import tsr
current_dir = os.path.dirname(os.path.abspath(__file__))
tripo_dir = os.path.join(current_dir, "TripoSR")
sys.path.append(tripo_dir)

from tsr.system import TSR
from tsr.utils import remove_background, resize_foreground

# Global instances
tripo_model = None
tripo_device = "cpu"
rembg_session = None

def init_triposr():
    global tripo_model, tripo_device, rembg_session

    if tripo_model is not None:
        return

    print("Initializing TripoSR model...")
    # Force CPU: torchmcubes (used inside extract_mesh) does not support MPS or CUDA.
    # The neural network inference is fast enough on CPU for single images.
    tripo_device = "cpu"
    print(f"Using device: {tripo_device}")
    
    # Load TSR model
    tripo_model = TSR.from_pretrained(
        "stabilityai/TripoSR",
        config_name="config.yaml",
        weight_name="model.ckpt",
    )
    tripo_model.renderer.set_chunk_size(8192)
    tripo_model.to(tripo_device)
    
    # Load rembg session
    rembg_session = rembg.new_session()
    print("TripoSR model initialized.")

def generate_mesh_from_image(image: Image.Image) -> str:
    """
    Takes a PIL Image, removes background, generates a 3D mesh using TripoSR,
    saves it to an .obj file, and returns the file URL or base64.
    """
    if tripo_model is None:
        init_triposr()
        
    device = tripo_device

    print("Removing background and preparing image...")
    # Preprocess image for TripoSR
    img = remove_background(image, rembg_session)
    img = resize_foreground(img, 0.85)
    
    img_arr = np.array(img).astype(np.float32) / 255.0
    # Blend with gray background as TripoSR expects
    img_arr = img_arr[:, :, :3] * img_arr[:, :, 3:4] + (1 - img_arr[:, :, 3:4]) * 0.5
    img_processed = Image.fromarray((img_arr * 255.0).astype(np.uint8))
    
    print("Running TripoSR inference...")
    with torch.no_grad():
        scene_codes = tripo_model([img_processed], device=device)
        
    print("Extracting mesh...")
    # extract_mesh returns a list of trimesh.Trimesh objects
    # resolution=256 creates a detailed mesh
    meshes = tripo_model.extract_mesh(scene_codes, has_vertex_color=True, resolution=256)
    
    # Save mesh
    output_dir = os.path.join(current_dir, "output", "triposr")
    os.makedirs(output_dir, exist_ok=True)
    
    filename = f"mesh_{uuid.uuid4().hex[:8]}.obj"
    out_path = os.path.join(output_dir, filename)
    
    print(f"Saving mesh to {out_path}...")
    meshes[0].export(out_path)
    
    return filename
