import Foundation
import RealityKit
import Metal

guard let commandLineArgs = ProcessInfo.processInfo.arguments as? [String], commandLineArgs.count >= 3 else {
    print("Usage: swift run_photogrammetry.swift <input_folder> <output_file> [fast|detailed]")
    exit(1)
}

let inputFolder = URL(fileURLWithPath: commandLineArgs[1])
let outputFile = URL(fileURLWithPath: commandLineArgs[2], isDirectory: true)
let mode = commandLineArgs.count >= 4 ? commandLineArgs[3] : "fast"

print("Starting Apple Object Capture (Photogrammetry)...")
print("Input: \(inputFolder.path)")
print("Output: \(outputFile.path)")
print("Mode: \(mode)")

guard MTLCreateSystemDefaultDevice() != nil else {
    print("Error: Metal is not supported on this device.")
    exit(1)
}

guard PhotogrammetrySession.isSupported else {
    print("Error: PhotogrammetrySession is not supported on this Mac.")
    exit(1)
}

var configuration = PhotogrammetrySession.Configuration()
if mode == "detailed" {
    configuration.featureSensitivity = .high
    configuration.isObjectMaskingEnabled = false
} else {
    configuration.featureSensitivity = .normal
}
configuration.sampleOrdering = .unordered

let session: PhotogrammetrySession
do {
    session = try PhotogrammetrySession(input: inputFolder, configuration: configuration)
} catch {
    print("Failed to create session: \(error)")
    exit(1)
}

let waiter = DispatchGroup()
waiter.enter()

Task {
    do {
        for try await output in session.outputs {
            switch output {
            case .requestProgress(_, let fractionComplete):
                print("Progress: \(Int(fractionComplete * 100))%")
            case .requestComplete(_, _):
                print("Request completed!")
                waiter.leave()
            case .requestError(_, let error):
                print("Request failed: \(error)")
                exit(1)
            case .processingComplete:
                print("Processing complete!")
            case .inputComplete:
                print("Data ingestion complete.")
            case .invalidSample(let id, let reason):
                print("Invalid sample \(id): \(reason)")
            case .skippedSample(let id):
                print("Skipped sample \(id)")
            case .automaticDownsampling:
                print("Automatic downsampling applied.")
            case .processingCancelled:
                print("Processing cancelled.")
                exit(1)
            default:
                break
            }
        }
    } catch {
        print("Output processing error: \(error)")
        exit(1)
    }
}

// Using .usdz format first to ensure compatibility, then we can rename/export
let detailLevel: PhotogrammetrySession.Request.Detail = .full
let request = PhotogrammetrySession.Request.modelFile(url: outputFile, detail: detailLevel)
do {
    try session.process(requests: [request])
} catch {
    print("Failed to start processing: \(error)")
    exit(1)
}

waiter.wait()
print("Success! Saved to \(outputFile.path)")
