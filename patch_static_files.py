with open("backend/main.py", "r") as f:
    content = f.read()

content = content.replace("app.mount('/jobs', StaticFiles(directory='backend/data/jobs'), name='jobs')",
                          "import os\nos.makedirs(os.path.join(os.path.dirname(__file__), 'data/jobs'), exist_ok=True)\napp.mount('/jobs', StaticFiles(directory=os.path.join(os.path.dirname(__file__), 'data/jobs')), name='jobs')")

content = content.replace('f"backend/data/jobs/{job_id}"', 'os.path.join(os.path.dirname(__file__), "data/jobs", job_id)')
content = content.replace('f"backend/data/jobs/{job_id}/output/model.obj"', 'os.path.join(os.path.dirname(__file__), "data/jobs", job_id, "output", "model.obj")')

with open("backend/main.py", "w") as f:
    f.write(content)
