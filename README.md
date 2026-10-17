# NODI

Local-first notes for macOS, built with Tauri 2, React, TypeScript, and Vite.

**Website:** [gutugaluppo.github.io/nodi](https://gutugaluppo.github.io/nodi/). The landing page source lives in [`landing/`](landing/).

## Development

```bash
pnpm install
pnpm tauri dev
```

## Installation and updates

See the Portuguese guide for [installing and updating NODI](docs/INSTALACAO_E_ATUALIZACAO.md) on macOS.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/)
- [Tauri extension](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Handwriting transcription

The image-to-note workflow transcribes images and PDFs with OpenAI's `gpt-5.4`, with explicit consent and server-managed page credits. It remains unavailable until the authenticated service, OpenAI key, payments and launch review are configured. See [setup, implementation status and what is still needed](docs/HANDWRITING_SETUP.md).
