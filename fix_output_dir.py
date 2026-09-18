import os
with open("backend/main.py", "r") as f:
    content = f.read()

content = content.replace(
    'output_obj = os.path.join(os.path.dirname(__file__), "data/jobs", job_id, "output", "model.obj")',
    'output_obj = os.path.join(os.path.dirname(__file__), "data/jobs", job_id, "output/")'
)

# And in job-status, we look for anything ending in .obj in that directory, or model.obj.
# Let's see what name Apple generates. For now, let's just find the first .obj in that dir.
new_status = """
    output_dir = os.path.join(os.path.dirname(__file__), "data/jobs", job_id, "output")
    if os.path.exists(output_dir):
        for f in os.listdir(output_dir):
            if f.endswith(".obj"):
                return {"status": "complete", "model_url": f"http://127.0.0.1:8000/jobs/{job_id}/output/{f}"}
"""
import re
content = re.sub(r'output_obj = os\.path\.join\(os\.path\.dirname\(__file__\), "data/jobs", job_id, "output", "model\.obj"\)\n\s*if os\.path\.exists\(output_obj\):\n\s*return \{"status": "complete", "model_url": f"http://127\.0\.0\.1:8000/jobs/\{job_id\}/output/model\.obj"\}', new_status, content)

with open("backend/main.py", "w") as f:
    f.write(content)
