import re
with open("backend/main.py", "r") as f:
    content = f.read()

new_status_fn = """
@app.get("/api/job-status/{job_id}")
async def get_job_status(job_id: str):
    output_dir = os.path.join(os.path.dirname(__file__), "data/jobs", job_id, "output")
    if os.path.exists(output_dir):
        for f in os.listdir(output_dir):
            if f.endswith(".obj"):
                return {"status": "complete", "model_url": f"http://127.0.0.1:8000/jobs/{job_id}/output/{f}"}
    
    if not os.path.exists(os.path.join(os.path.dirname(__file__), "data/jobs", job_id)):
        return {"status": "error", "message": "Job not found."}
        
    return {"status": "processing"}
"""

# Replace the entire get_job_status function
content = re.sub(r'@app\.get\("/api/job-status/\{job_id\}"\).*?return \{"status": "processing"\}', new_status_fn.strip(), content, flags=re.DOTALL)

with open("backend/main.py", "w") as f:
    f.write(content)
