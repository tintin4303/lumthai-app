with open("src/app/page.tsx", "r") as f:
    content = f.read()

content = content.replace(">\\n            Gaussian Splatting\\n          </button>", ">\\n            Photorealistic 3D\\n          </button>")

with open("src/app/page.tsx", "w") as f:
    f.write(content)
