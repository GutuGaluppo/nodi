import { useState } from "react";
import Icon from "../../components/ui/Icon";
import { handwritingLimits } from "../handwriting/plans";

interface Props {
  file: File | null;
  preview: string | null;
  disabled?: boolean;
  onSelect: (file: File) => void;
}

function size(bytes: number): string {
  return bytes < 1000000
    ? `${Math.max(1, Math.round(bytes / 1000))} KB`
    : `${(bytes / 1000000).toFixed(1)} MB`;
}

/** The file input covers the whole zone, so clicking or dropping a file both work. */
export default function FileDrop({ file, preview, disabled, onSelect }: Props) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className="file-drop"
      data-dragging={dragging || undefined}
      data-selected={file ? true : undefined}
    >
      <input
        id="handwriting-file"
        type="file"
        accept={handwritingLimits.mimeTypes.join(",")}
        aria-describedby="handwriting-file-hint"
        disabled={disabled}
        onDragEnter={() => setDragging(true)}
        onDragLeave={() => setDragging(false)}
        onDrop={() => setDragging(false)}
        onChange={(event) => {
          const selected = event.target.files?.[0];
          if (selected) onSelect(selected);
          event.target.value = "";
        }}
      />
      {file ? (
        <>
          {preview ? (
            <img className="file-drop-preview" src={preview} alt="" />
          ) : (
            <span className="file-drop-icon" aria-hidden="true">
              <Icon name="note" />
            </span>
          )}
          <span className="file-drop-name">{file.name}</span>
          <span id="handwriting-file-hint" className="file-drop-hint">
            {size(file.size)} · clique, arraste ou cole outro arquivo para
            trocar
          </span>
          <label htmlFor="handwriting-file" className="visually-hidden">
            Escolher imagem ou PDF
          </label>
        </>
      ) : (
        <>
          <span className="file-drop-icon" aria-hidden="true">
            <Icon name="image" />
          </span>
          <label htmlFor="handwriting-file" className="file-drop-title">
            Escolher imagem ou PDF
          </label>
          <span id="handwriting-file-hint" className="file-drop-hint">
            Clique, arraste ou cole (⌘V) · PDF, JPEG, PNG, WEBP, HEIC, TIFF ou
            GIF até 20 MB
          </span>
        </>
      )}
    </div>
  );
}
