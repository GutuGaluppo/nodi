import Foundation
import PDFKit
import ImageIO
import UniformTypeIdentifiers

// Server-only preflight. This binary is never included in the desktop bundle.
// Never print content, filenames, decoder errors or provider credentials.
let data = FileHandle.standardInput.readDataToEndOfFile()
func reject() -> Never {
    FileHandle.standardOutput.write(Data("{\"error\":\"invalid_file\"}".utf8))
    exit(1)
}
guard !data.isEmpty, data.count <= 20_000_000 else { reject() }

// `--jpeg`: re-encodes one HEIC or TIFF frame as JPEG on stdout, keeping its
// orientation, for a model that does not read those formats.
if CommandLine.arguments.dropFirst().first == "--jpeg" {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil),
          let type = CGImageSourceGetType(source) as String?,
          type == UTType.heic.identifier || type == UTType.tiff.identifier,
          CGImageSourceGetCount(source) == 1 else { reject() }
    let output = NSMutableData()
    guard let destination = CGImageDestinationCreateWithData(output, UTType.jpeg.identifier as CFString, 1, nil) else { reject() }
    CGImageDestinationAddImageFromSource(destination, source, 0, [kCGImageDestinationLossyCompressionQuality: 0.92] as CFDictionary)
    guard CGImageDestinationFinalize(destination), output.length > 0, output.length <= 20_000_000 else { reject() }
    FileHandle.standardOutput.write(output as Data)
    exit(0)
}

var pages = 0
var mime = ""
var ext = ""
if data.starts(with: Data("%PDF-".utf8)) {
    guard let document = PDFDocument(data: data), !document.isEncrypted else { reject() }
    pages = document.pageCount
    guard pages > 0, pages <= 70 else { reject() }
    for index in 0..<pages {
        guard let page = document.page(at: index) else { reject() }
        let bounds = page.bounds(for: .mediaBox)
        guard bounds.width.isFinite, bounds.height.isFinite, bounds.width > 0, bounds.height > 0 else { reject() }
    }
    mime = "application/pdf"
    ext = "pdf"
} else {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil), let sourceType = CGImageSourceGetType(source) else { reject() }
    let type = sourceType as String
    let types: [String: (String, String)] = [
        UTType.png.identifier: ("image/png", "png"),
        UTType.jpeg.identifier: ("image/jpeg", "jpg"),
        UTType.tiff.identifier: ("image/tiff", "tiff"),
        UTType.heic.identifier: ("image/heic", "heic"),
        UTType.gif.identifier: ("image/gif", "gif"),
        UTType.webP.identifier: ("image/webp", "webp")
    ]
    guard let format = types[type], CGImageSourceGetCount(source) == 1 else { reject() }
    // Multi-frame formats are refused until their billing semantics are verified.
    guard let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
          let width = properties[kCGImagePropertyPixelWidth] as? Int,
          let height = properties[kCGImagePropertyPixelHeight] as? Int,
          width > 0, height > 0, width <= 20000, height <= 20000, width * height <= 40_000_000,
          CGImageSourceGetStatus(source) == .statusComplete,
          CGImageSourceCreateImageAtIndex(source, 0, [kCGImageSourceShouldCache: false] as CFDictionary) != nil else { reject() }
    pages = 1
    mime = format.0
    ext = format.1
}
let result: [String: Any] = ["pages": pages, "mime": mime, "extension": ext]
guard let json = try? JSONSerialization.data(withJSONObject: result) else { reject() }
FileHandle.standardOutput.write(json)
