// Text in images (OCR-001, OCR-003), compiled into NODI by build.rs.
//
// Reading returns every recognized line with its position, and the Rust side
// lays the lines out as text. On macOS 26 and later, Vision's document
// reader also groups lines into paragraphs; earlier systems use the line
// reader, and paragraphs are inferred from the gaps between lines.
//
// Spelling uses the Mac's own spell checker, offline, to point out words that
// were probably misread.

import AppKit
import Foundation
import Vision

/// One recognized line. Coordinates are normalized, origin bottom-left.
private struct ReadLine: Encodable {
  let text: String
  let paragraph: Int?
  let top: Double
  let bottom: Double
  let left: Double
  let right: Double

  init(_ text: String, paragraph: Int?, box: CGRect) {
    self.text = text
    self.paragraph = paragraph
    top = Double(box.maxY)
    bottom = Double(box.minY)
    left = Double(box.minX)
    right = Double(box.maxX)
  }
}

private struct Reading: Encodable {
  let engine: String
  let lines: [ReadLine]
}

private struct DoubtfulWord: Encodable {
  let word: String
  let suggestions: [String]
}

private enum ReaderError: Error {
  case failed(String)
}

private func readLines(_ url: URL) throws -> Reading {
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.usesLanguageCorrection = true
  request.automaticallyDetectsLanguage = true
  try VNImageRequestHandler(url: url).perform([request])
  let lines = (request.results ?? []).compactMap { observation -> ReadLine? in
    guard let best = observation.topCandidates(1).first,
      !best.string.trimmingCharacters(in: .whitespaces).isEmpty
    else { return nil }
    return ReadLine(best.string, paragraph: nil, box: observation.boundingBox)
  }
  return Reading(engine: "lines", lines: lines)
}

@available(macOS 26, *)
private func readDocument(_ url: URL) throws -> Reading {
  var outcome: Result<Reading, Error> = .failure(ReaderError.failed("no result"))
  let done = DispatchSemaphore(value: 0)
  Task {
    do {
      let observations = try await RecognizeDocumentsRequest().perform(on: url)
      var lines: [ReadLine] = []
      var paragraph = 0
      for observation in observations {
        for block in observation.document.paragraphs {
          for line in block.lines {
            let text = line.transcript
            if text.trimmingCharacters(in: .whitespaces).isEmpty { continue }
            let box = line.boundingRegion.boundingBox
            lines.append(
              ReadLine(
                text, paragraph: paragraph,
                box: CGRect(
                  x: box.origin.x, y: box.origin.y, width: box.width, height: box.height)))
          }
          paragraph += 1
        }
      }
      outcome = .success(Reading(engine: "document", lines: lines))
    } catch {
      outcome = .failure(error)
    }
    done.signal()
  }
  done.wait()
  return try outcome.get()
}

private func read(_ path: String) throws -> Reading {
  guard FileManager.default.isReadableFile(atPath: path) else {
    throw ReaderError.failed("the image file is missing")
  }
  let url = URL(fileURLWithPath: path)
  if #available(macOS 26, *) {
    return try readDocument(url)
  }
  return try readLines(url)
}

/// Misspelled words, once each, with the spell checker's guesses. Words the
/// checker accepts in English are left alone, since notes mix both languages,
/// unless a guess is written elsewhere in the text ("manus" beside "menus").
private func doubtfulWords(_ text: String) -> [DoubtfulWord] {
  let checker = NSSpellChecker.shared
  let tag = NSSpellChecker.uniqueSpellDocumentTag()
  defer { checker.closeSpellDocument(withTag: tag) }
  let ns = text as NSString
  let textWords = Set(
    text.lowercased().components(separatedBy: CharacterSet.letters.inverted).filter {
      !$0.isEmpty
    })
  var seen = Set<String>()
  var words: [DoubtfulWord] = []
  var start = 0
  while start < ns.length {
    let range = checker.checkSpelling(
      of: text, startingAt: start, language: "pt_BR", wrap: false,
      inSpellDocumentWithTag: tag, wordCount: nil)
    if range.location == NSNotFound || range.length == 0 { break }
    start = range.location + range.length
    let word = ns.substring(with: range)
    if word.count < 2 || word.rangeOfCharacter(from: .decimalDigits) != nil { continue }
    if !seen.insert(word).inserted { continue }
    let guesses =
      checker.guesses(
        forWordRange: range, in: text, language: "pt_BR", inSpellDocumentWithTag: tag) ?? []
    let english = checker.checkSpelling(
      of: word, startingAt: 0, language: "en", wrap: false,
      inSpellDocumentWithTag: tag, wordCount: nil)
    let echoed = guesses.contains { textWords.contains($0.lowercased()) }
    if english.location == NSNotFound && !echoed { continue }
    words.append(DoubtfulWord(word: word, suggestions: Array(guesses.prefix(6))))
  }
  return words
}

private func json<T: Encodable>(_ value: T) throws -> String {
  String(decoding: try JSONEncoder().encode(value), as: UTF8.self)
}

private func output(_ text: String, _ out: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>) {
  out.pointee = strdup(text)
}

/// Reads the image at `path`. Returns 0 with the reading as JSON in `out`, or
/// 1 with an error message.
@_cdecl("nodi_text_read")
public func nodiTextRead(
  _ path: UnsafePointer<CChar>, _ out: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>
) -> Int32 {
  do {
    output(try json(read(String(cString: path))), out)
    return 0
  } catch ReaderError.failed(let message) {
    output(message, out)
    return 1
  } catch {
    output(error.localizedDescription, out)
    return 1
  }
}

/// Checks the spelling of `text`. Returns 0 with the doubtful words as JSON in
/// `out`, or 1 with an error message. Call it on the main thread.
@_cdecl("nodi_text_check_spelling")
public func nodiTextCheckSpelling(
  _ text: UnsafePointer<CChar>, _ out: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>
) -> Int32 {
  do {
    output(try json(doubtfulWords(String(cString: text))), out)
    return 0
  } catch {
    output(error.localizedDescription, out)
    return 1
  }
}

@_cdecl("nodi_text_free")
public func nodiTextFree(_ text: UnsafeMutablePointer<CChar>?) {
  free(text)
}
