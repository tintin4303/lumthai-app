with open("backend/main.py", "r") as f:
    content = f.read()

new_imports = "import uuid\nimport subprocess\nfrom fastapi import BackgroundTasks\n"
content = new_imports + content

with open("backend/main.py", "w") as f:
    f.write(content)
