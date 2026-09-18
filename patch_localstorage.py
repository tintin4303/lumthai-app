import re

with open("src/components/PhotogrammetryPipeline.tsx", "r") as f:
    content = f.read()

# Add localStorage saving
new_run_pipeline = """
      const data = await response.json();
      if (data.job_id) {
        setJobId(data.job_id);
        localStorage.setItem("photogrammetry_job_id", data.job_id);
        setStatus('processing');
"""
content = re.sub(r'const data = await response.json\(\);\s*if \(data\.job_id\) \{\s*setJobId\(data\.job_id\);\s*setStatus\(\'processing\'\);', new_run_pipeline, content)

# Add useEffect for initial load
new_use_effect = """
  useEffect(() => {
    const savedJobId = localStorage.getItem("photogrammetry_job_id");
    if (savedJobId && status === 'idle') {
      setJobId(savedJobId);
      setStatus('processing');
      setProgressMsg('Recovered active processing job. Waiting for Apple Neural Engine...');
    }
  }, []);

  useEffect(() => {
"""
content = content.replace("  useEffect(() => {\n    if (status !== 'processing' || !jobId) return;", new_use_effect + "    if (status !== 'processing' || !jobId) return;")

# Clear localStorage on completion
new_complete = """
        if (data.status === 'complete') {
          setModelUrl(data.model_url);
          setStatus('complete');
          setProgressMsg('3D Statue Capture Complete!');
          localStorage.removeItem("photogrammetry_job_id");
          clearInterval(interval);
"""
content = re.sub(r'if \(data\.status === \'complete\'\) \{\s*setModelUrl\(data\.model_url\);\s*setStatus\(\'complete\'\);\s*setProgressMsg\(\'3D Statue Capture Complete!\'\);\s*clearInterval\(interval\);', new_complete, content)

with open("src/components/PhotogrammetryPipeline.tsx", "w") as f:
    f.write(content)
