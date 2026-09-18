with open("src/app/page.tsx", "r") as f:
    content = f.read()

# Remove any existing "use client"
content = content.replace('"use client";\n', '')
content = content.replace("'use client';\n", '')

# Add it exactly at the very top
content = '"use client";\n' + content

with open("src/app/page.tsx", "w") as f:
    f.write(content)
