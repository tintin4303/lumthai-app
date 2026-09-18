with open("src/components/PhotogrammetryPipeline.tsx", "r") as f:
    content = f.read()

new_button = """
        {status === 'processing' && (
          <div className="mt-4 text-center">
            <button
              onClick={() => {
                localStorage.removeItem("photogrammetry_job_id");
                setJobId(null);
                setStatus('idle');
                setProgressMsg('');
              }}
              className="text-sm text-red-500 hover:text-red-700 underline font-medium"
            >
              Cancel / Reset Stuck Job
            </button>
          </div>
        )}
      </div>
"""
content = content.replace("      </div>\n\n      {modelUrl && (", new_button + "\n      {modelUrl && (")

with open("src/components/PhotogrammetryPipeline.tsx", "w") as f:
    f.write(content)
