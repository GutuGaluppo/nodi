# NODI agent contract

- Read the active task before touching code.
- Tauri + React + TypeScript is the application stack.
- SQLite is the persistent structured source of truth.
- Tiptap JSON is canonical note content.
- Attachments live outside SQLite.
- No backend exists in V1.
- No cloud dependency may be introduced without explicit approval.
- Do not refactor unrelated code.
- Do not add dependencies without justification.
- Prefer existing abstractions.
- Migrations are immutable after commit.
- Persistent data changes require tests.
- Accessibility is mandatory.
- Run the project validation command before completion.
- At the end of every implementation task, capture the current NODI window and add a permanent chronological entry to the in-app ABOUT page. Never replace an older screenshot.
