import Foundation
import RealityKit

let inputFolder = URL(fileURLWithPath: "/Users/nyunt/Desktop/Computer Vision/project/khaimuk/jpg_converted/final_dataset")
let outputFile = URL(fileURLWithPath: "/Users/nyunt/Desktop/Computer Vision/project/khaimuk/3d_export/test_model.obj")

var configuration = PhotogrammetrySession.Configuration()
configuration.featureSensitivity = .normal
configuration.sampleOrdering = .unordered

let session = try! PhotogrammetrySession(input: inputFolder, configuration: configuration)
let request = PhotogrammetrySession.Request.modelFile(url: outputFile, detail: .reduced)

do {
    try session.process(requests: [request])
    print("Process started successfully")
} catch {
    print("Error: \(error)")
}
