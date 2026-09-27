import Cocoa

/// NODI's Share extension (MAC-003). It shows no window of its own: it reads
/// what was shared (a page link, selected text, plain text), hands it to NODI
/// through the local `nodi://new` URL, and finishes. Nothing leaves the Mac.
final class ShareViewController: NSViewController {
    override func loadView() {
        view = NSView(frame: NSRect(x: 0, y: 0, width: 1, height: 1))
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        Task { @MainActor in await share() }
    }

    @MainActor
    private func share() async {
        guard let context = extensionContext else { return }
        var title = ""
        var texts: [String] = []
        var link: URL?

        for case let item as NSExtensionItem in context.inputItems {
            if let text = item.attributedContentText?.string, !text.isEmpty {
                texts.append(text)
            }
            if let heading = item.attributedTitle?.string, !heading.isEmpty {
                title = heading
            }
            for provider in item.attachments ?? [] {
                if provider.hasItemConformingToTypeIdentifier("public.url"),
                    let url = asURL(await load(provider, "public.url")),
                    !url.isFileURL
                {
                    link = url
                } else if provider.hasItemConformingToTypeIdentifier("public.plain-text"),
                    let text = await load(provider, "public.plain-text") as? String,
                    !text.isEmpty
                {
                    texts.append(text)
                }
            }
        }

        var components = URLComponents()
        components.scheme = "nodi"
        components.host = "new"
        var query = [
            URLQueryItem(name: "title", value: title),
            URLQueryItem(name: "text", value: texts.joined(separator: "\n\n")),
        ]
        if let link { query.append(URLQueryItem(name: "url", value: link.absoluteString)) }
        components.queryItems = query

        if let url = components.url {
            NSWorkspace.shared.open(url)
        }
        context.completeRequest(returningItems: nil, completionHandler: nil)
    }

    /// A shared link can arrive as a URL, as its data representation, or as text.
    private func asURL(_ item: Any?) -> URL? {
        switch item {
        case let url as URL: return url
        case let data as Data: return URL(dataRepresentation: data, relativeTo: nil)
        case let text as String: return URL(string: text)
        default: return nil
        }
    }

    private func load(_ provider: NSItemProvider, _ type: String) async -> Any? {
        await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: type, options: nil) { item, _ in
                continuation.resume(returning: item)
            }
        }
    }
}
