with open("src/app/page.tsx", "r") as f:
    content = f.read()

content = content.replace(
    'const res = await fetch("/api/pipeline", { method: "POST", body: formData });',
    'const res = await fetch("http://127.0.0.1:8000/api/pipeline", { method: "POST", body: formData });'
)

with open("src/app/page.tsx", "w") as f:
    f.write(content)
