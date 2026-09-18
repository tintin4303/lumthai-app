import Foundation
import RealityKit

let inputFolder = URL(fileURLWithPath: "/Users/nyunt/Desktop/Computer Vision/project/khaimuk/jpg_converted/final_dataset")
let outputDir = URL(fileURLWithPath: "/Users/nyunt/Desktop/Computer Vision/project/khaimuk/3d_export/test_dir_output/")

var configuration = PhotogrammetrySession.Configuration()
configuration.featureSensitivity = .normal
configuration.sampleOrdering = .unordered

let session = try! PhotogrammetrySession(input: inputFolder, configuration: configuration)
let request = PhotogrammetrySession.Request.modelFile(url: outputDir, detail: .reduced)

do {
    try session.process(requests: [request])
    print("Process started successfully")
} catch {
    print("Error: \(error)")
}
