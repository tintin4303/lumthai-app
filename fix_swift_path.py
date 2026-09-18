with open("backend/main.py", "r") as f:
    content = f.read()

content = content.replace(
    'swift_script = f"{os.getcwd()}/backend/run_photogrammetry.swift"',
    'swift_script = os.path.join(os.path.dirname(__file__), "run_photogrammetry.swift")'
)

content = content.replace(
    'output_obj = f"{os.getcwd()}/{output_dir}/model.obj"',
    'output_obj = os.path.join(os.path.dirname(__file__), "data/jobs", job_id, "output", "model.obj")'
)

content = content.replace(
    'input_folder = f"{os.getcwd()}/{images_dir}"',
    'input_folder = os.path.join(os.path.dirname(__file__), "data/jobs", job_id, "images")'
)

with open("backend/main.py", "w") as f:
    f.write(content)
