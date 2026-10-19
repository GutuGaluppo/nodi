// Text in images (OCR-001, OCR-003), compiled into NODI by build.rs.
//
// Reading returns every recognized line with its position, and the Rust side
// lays the lines out as text. On macOS 26 and later, Vision's document
// reader also groups lines into paragraphs; earlier systems use the line
// reader, and paragraphs are inferred from the gaps between lines.
//
// Vision also returns other readings of each line. They are kept per word as
// variants ("Grap" was also read "Group"), and the spelling check offers them
// as suggestions, alongside the Mac's own spell checker, offline, which points
// out words that were probably misread.

import AppKit
import Foundation
import NaturalLanguage
import Vision

/// Other readings of each line Vision is asked for.
private let candidateCount = 10

/// One recognized line. Coordinates are normalized, origin bottom-left.
private struct ReadLine: Encodable {
  let text: String
  let paragraph: Int?
  let top: Double
  let bottom: Double
  let left: Double
  let right: Double
  /// Other readings of the line's words, by word.
  let variants: [String: [String]]

  init(_ text: String, paragraph: Int?, box: CGRect, readings: [String] = []) {
    self.text = text
    self.paragraph = paragraph
    top = Double(box.maxY)
    bottom = Double(box.minY)
    left = Double(box.minX)
    right = Double(box.maxX)
    variants = wordVariants(of: text, in: readings)
  }
}

private func bare(_ token: Substring) -> String {
  token.trimmingCharacters(in: CharacterSet.letters.inverted)
}

/// Pairs the words of `text` with the words other readings have in their
/// place. Readings with as many words are paired word by word; otherwise
/// only a single differing word is paired ("Loses-bility" for "Losessibility").
private func wordVariants(of text: String, in readings: [String]) -> [String: [String]] {
  let words = text.split(separator: " ")
  var variants: [String: [String]] = [:]
  func add(_ word: String, _ variant: String) {
    guard !word.isEmpty, !variant.isEmpty, variant != word,
      !(variants[word] ?? []).contains(variant)
    else { return }
    variants[word, default: []].append(variant)
  }
  for reading in readings where reading != text {
    let other = reading.split(separator: " ")
    if other.count == words.count {
      for (word, variant) in zip(words, other) { add(bare(word), bare(variant)) }
      continue
    }
    let shorter = min(other.count, words.count)
    var prefix = 0
    while prefix < shorter && other[prefix] == words[prefix] { prefix += 1 }
    var suffix = 0
    while suffix < shorter - prefix
      && other[other.count - 1 - suffix] == words[words.count - 1 - suffix]
    {
      suffix += 1
    }
    let changed = words[prefix..<(words.count - suffix)]
    let replaced = other[prefix..<(other.count - suffix)]
    if changed.count == 1, !replaced.isEmpty {
      add(bare(changed.first!), replaced.map(bare).joined(separator: " "))
    }
  }
  return variants
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
    let readings = observation.topCandidates(candidateCount).map(\.string)
    guard let best = readings.first,
      !best.trimmingCharacters(in: .whitespaces).isEmpty
    else { return nil }
    return ReadLine(
      best, paragraph: nil, box: observation.boundingBox, readings: Array(readings.dropFirst()))
  }
  return Reading(engine: "lines", lines: lines)
}

/// Other readings of the lines in the image, with their boxes. The document
/// reader gives one reading per line, so both line readers are asked: they
/// misread differently, and a word one gets wrong the other often gets right.
@available(macOS 26, *)
private func otherReadings(_ url: URL) async -> [(box: CGRect, readings: [String])] {
  var found: [(box: CGRect, readings: [String])] = []
  var request = RecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.automaticallyDetectsLanguage = true
  if let observations = try? await request.perform(on: url) {
    for observation in observations {
      let box = observation.boundingBox
      found.append(
        (
          CGRect(x: box.origin.x, y: box.origin.y, width: box.width, height: box.height),
          observation.topCandidates(candidateCount).map(\.string)
        ))
    }
  }
  let legacy = VNRecognizeTextRequest()
  legacy.recognitionLevel = .accurate
  legacy.automaticallyDetectsLanguage = true
  if (try? VNImageRequestHandler(url: url).perform([legacy])) != nil {
    for observation in legacy.results ?? [] {
      found.append(
        (observation.boundingBox, observation.topCandidates(candidateCount).map(\.string)))
    }
  }
  return found
}

/// The readings whose box overlaps `box` more than any other line's.
private func readings(
  for index: Int, boxes: [CGRect], among others: [(box: CGRect, readings: [String])]
) -> [String] {
  func shared(_ a: CGRect, _ b: CGRect) -> CGFloat {
    let overlap = a.intersection(b)
    return overlap.isNull ? 0 : overlap.width * overlap.height
  }
  return others.flatMap { other -> [String] in
    let overlaps = boxes.map { shared($0, other.box) }
    guard let best = overlaps.indices.max(by: { overlaps[$0] < overlaps[$1] }),
      best == index, overlaps[best] > 0
    else { return [] }
    return other.readings
  }
}

@available(macOS 26, *)
private func readDocument(_ url: URL) throws -> Reading {
  var outcome: Result<Reading, Error> = .failure(ReaderError.failed("no result"))
  let done = DispatchSemaphore(value: 0)
  Task {
    do {
      let observations = try await RecognizeDocumentsRequest().perform(on: url)
      var found: [(text: String, paragraph: Int, box: CGRect)] = []
      var paragraph = 0
      for observation in observations {
        for block in observation.document.paragraphs {
          for line in block.lines {
            let text = line.transcript
            if text.trimmingCharacters(in: .whitespaces).isEmpty { continue }
            let box = line.boundingRegion.boundingBox
            found.append(
              (
                text, paragraph,
                CGRect(x: box.origin.x, y: box.origin.y, width: box.width, height: box.height)
              ))
          }
          paragraph += 1
        }
      }
      let others = await otherReadings(url)
      let boxes = found.map(\.box)
      let lines = found.enumerated().map { index, line in
        ReadLine(
          line.text, paragraph: line.paragraph, box: line.box,
          readings: readings(for: index, boxes: boxes, among: others))
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

/// The languages notes are written in, most likely first.
private let noteLanguages = ["pt_BR", "en"]

/// The languages to guess in for `text`: only the one it is written in when
/// that is clear, so an English line gets no Portuguese guesses.
private func guessLanguages(for text: String) -> [String] {
  let recognizer = NLLanguageRecognizer()
  recognizer.languageConstraints = [.portuguese, .english]
  recognizer.processString(text)
  let hypotheses = recognizer.languageHypotheses(withMaximum: 2)
  let english = hypotheses[.english] ?? 0
  let portuguese = hypotheses[.portuguese] ?? 0
  if english >= 0.9 { return ["en"] }
  if portuguese >= 0.9 { return ["pt_BR"] }
  return english > portuguese ? ["en", "pt_BR"] : noteLanguages
}

private struct SpellingInput: Decodable {
  let text: String
  /// Other readings of the text's words, by word.
  let variants: [String: [String]]
}

/// Words neither Portuguese nor English, once each, unless a guess is
/// written elsewhere in the text ("manus" beside "menus"). Suggestions come
/// from the spell checker, in the language of the word's line first, and
/// from what Vision read in the word's place. A suggestion more of them agree
/// on comes first: "Group" is both a guess for "Grap" and another reading.
private func doubtfulWords(_ input: SpellingInput) -> [DoubtfulWord] {
  let checker = NSSpellChecker.shared
  let tag = NSSpellChecker.uniqueSpellDocumentTag()
  defer { checker.closeSpellDocument(withTag: tag) }
  let text = input.text
  let ns = text as NSString
  let textWords = Set(
    text.lowercased().components(separatedBy: CharacterSet.letters.inverted).filter {
      !$0.isEmpty
    })
  func known(_ word: String, _ language: String) -> Bool {
    checker.checkSpelling(
      of: word, startingAt: 0, language: language, wrap: false,
      inSpellDocumentWithTag: tag, wordCount: nil
    ).location == NSNotFound
  }
  func isWord(_ word: String) -> Bool {
    word.split(separator: " ").allSatisfy { part in noteLanguages.contains { known(String(part), $0) } }
  }
  func guesses(_ word: String, _ languages: [String]) -> [String] {
    let range = NSRange(location: 0, length: (word as NSString).length)
    return languages.flatMap {
      checker.guesses(forWordRange: range, in: word, language: $0, inSpellDocumentWithTag: tag)
        ?? []
    }
  }
  var seen = Set<String>()
  var words: [DoubtfulWord] = []
  var start = 0
  while start < ns.length {
    let range = checker.checkSpelling(
      of: text, startingAt: start, language: noteLanguages[0], wrap: false,
      inSpellDocumentWithTag: tag, wordCount: nil)
    if range.location == NSNotFound || range.length == 0 { break }
    start = range.location + range.length
    let word = ns.substring(with: range)
    if word.count < 2 || word.rangeOfCharacter(from: .decimalDigits) != nil { continue }
    if !seen.insert(word).inserted { continue }
    let languages = guessLanguages(for: ns.substring(with: ns.lineRange(for: range)))
    let own = guesses(word, languages)
    let echoed = own.contains { textWords.contains($0.lowercased()) }
    if known(word, "en") && !echoed { continue }
    // Each source votes once for each suggestion: the word's own guesses,
    // then each other reading, as itself when it is a word and by its guesses.
    let variants = input.variants[word] ?? []
    var order: [String] = []
    var votes: [String: Int] = [:]
    func vote(_ suggestions: [String]) {
      var counted = Set<String>()
      for suggestion in suggestions {
        // "In" and "in" are one suggestion, spelled as it first came.
        let key = suggestion.lowercased()
        guard key != word.lowercased(), counted.insert(key).inserted else { continue }
        if votes[key] == nil { order.append(suggestion) }
        votes[key, default: 0] += 1
      }
    }
    vote(own)
    for variant in variants {
      vote((isWord(variant) ? [variant] : []) + guesses(variant, languages))
    }
    let ranked = order.enumerated().sorted {
      (votes[$0.element.lowercased()]!, -$0.offset) > (votes[$1.element.lowercased()]!, -$1.offset)
    }.map(\.element)
    words.append(DoubtfulWord(word: word, suggestions: Array(ranked.prefix(6))))
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

/// Checks the spelling of the text in `input`, JSON with the text and its
/// words' other readings. Returns 0 with the doubtful words as JSON in `out`,
/// or 1 with an error message. Call it on the main thread.
@_cdecl("nodi_text_check_spelling")
public func nodiTextCheckSpelling(
  _ input: UnsafePointer<CChar>, _ out: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>
) -> Int32 {
  do {
    let decoded = try JSONDecoder().decode(
      SpellingInput.self, from: Data(String(cString: input).utf8))
    output(try json(doubtfulWords(decoded)), out)
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
