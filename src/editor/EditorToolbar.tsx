import { type Editor, useEditorState } from "@tiptap/react";

interface EditorToolbarProps {
  editor: Editor;
}

interface ToolbarButtonProps {
  label: string;
  isActive?: boolean;
  onClick: () => void;
}

function ToolbarButton({
  label,
  isActive = false,
  onClick,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className="toolbar-button"
      aria-pressed={isActive}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function EditorToolbar({ editor }: EditorToolbarProps) {
  const active = useEditorState({
    editor,
    selector: ({ editor: instance }) => ({
      bold: instance.isActive("bold"),
      italic: instance.isActive("italic"),
      underline: instance.isActive("underline"),
      highlight: instance.isActive("highlight"),
      h1: instance.isActive("heading", { level: 1 }),
      h2: instance.isActive("heading", { level: 2 }),
      bulletList: instance.isActive("bulletList"),
      orderedList: instance.isActive("orderedList"),
      taskList: instance.isActive("taskList"),
      link: instance.isActive("link"),
    }),
  });

  function editLink() {
    const current = editor.getAttributes("link").href as string | undefined;
    const next = window.prompt("Link URL", current ?? "https://");
    if (next === null) {
      return;
    }

    const chain = editor.chain().focus().extendMarkRange("link");
    if (next === "") {
      chain.unsetLink().run();
    } else {
      chain.setLink({ href: next }).run();
    }
  }

  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Formatting">
      <ToolbarButton
        label="Bold"
        isActive={active.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolbarButton
        label="Italic"
        isActive={active.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToolbarButton
        label="Underline"
        isActive={active.underline}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      />
      <ToolbarButton
        label="Highlight"
        isActive={active.highlight}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
      />
      <span className="toolbar-divider" aria-hidden="true" />
      <ToolbarButton
        label="Heading 1"
        isActive={active.h1}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      />
      <ToolbarButton
        label="Heading 2"
        isActive={active.h2}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      />
      <span className="toolbar-divider" aria-hidden="true" />
      <ToolbarButton
        label="Bullet list"
        isActive={active.bulletList}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        label="Numbered list"
        isActive={active.orderedList}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <ToolbarButton
        label="Task list"
        isActive={active.taskList}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      />
      <span className="toolbar-divider" aria-hidden="true" />
      <ToolbarButton label="Link" isActive={active.link} onClick={editLink} />
      <ToolbarButton
        label="Insert table"
        onClick={() =>
          editor
            .chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run()
        }
      />
    </div>
  );
}

export default EditorToolbar;
