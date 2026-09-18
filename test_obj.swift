import Foundation
import RealityKit

let inputFolder = URL(fileURLWithPath: "/Users/nyunt/Desktop/Computer Vision/project/khaimuk/jpg_converted/final_dataset")
let outputFile = URL(fileURLWithPath: "/Users/nyunt/Desktop/Computer Vision/project/khaimuk/3d_export/test_output.obj")

print(outputFile)
let request = PhotogrammetrySession.Request.modelFile(url: outputFile, detail: .reduced)
print("Request created successfully")
