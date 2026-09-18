with open("src/app/page.tsx", "r") as f:
    content = f.read()

content = content.replace(
    'fetch("http://127.0.0.1:8000/api/pipeline", { method: "POST", body: formData });',
    'fetch("http://127.0.0.1:8000/api/pipeline-mesh", { method: "POST", body: formData });'
)

with open("src/app/page.tsx", "w") as f:
    f.write(content)
