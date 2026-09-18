with open("backend/run_photogrammetry.swift", "r") as f:
    content = f.read()

content = content.replace("let outputFile = URL(fileURLWithPath: commandLineArgs[2])", "let outputFile = URL(fileURLWithPath: commandLineArgs[2], isDirectory: true)")

with open("backend/run_photogrammetry.swift", "w") as f:
    f.write(content)
