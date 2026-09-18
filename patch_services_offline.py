import sys
import os

with open("backend/services.py", "r") as f:
    content = f.read()

# Fix 1: Force HuggingFace offline mode so it doesn't wait 113 seconds for timeouts
if "os.environ['TRANSFORMERS_OFFLINE']" not in content:
    content = "import os\nos.environ['TRANSFORMERS_OFFLINE'] = '1'\nos.environ['HF_HUB_OFFLINE'] = '1'\n" + content

# Fix 2: Force rembg to use u2net instead of crashing on bria-rmbg
old_rembg_new = "_rembg_session = rembg.new_session()"
new_rembg_new = "_rembg_session = rembg.new_session('u2net')"
content = content.replace(old_rembg_new, new_rembg_new)

with open("backend/services.py", "w") as f:
    f.write(content)
