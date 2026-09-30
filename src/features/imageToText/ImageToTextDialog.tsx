import {
  type ClipboardEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import Icon from "../../components/ui/Icon";
import { attachmentUrl } from "../../lib/attachments/attachmentUrl";
import DoubtfulWords from "./DoubtfulWords";
import { type ReadImage, replaceWord } from "./imageToNote";
import { useImageToNote } from "./useImageToNote";

interface ImageToTextDialogProps {
  notebookId: string | null;
  onClose: () => void;
  onCreated: (noteId: string) => void;
  /** Replaces the Vision reader in tests. */
  read?: ReadImage;
}

const FOCUSABLE =
  'button:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/**
 * Turns an image into a note (OCR-003). The image is chosen or pasted, its
 * text is read on this Mac with Apple's Vision framework, and nothing
 * becomes a note until the person reviews the text and approves it.
 */
function ImageToTextDialog({
  notebookId,
  onClose,
  onCreated,
  read,
}: ImageToTextDialogProps) {
  const flow = useImageToNote({ notebookId, onCreated, read });
  const { phase, image, result, error } = flow.state;
  const [text, setText] = useState("");
  const [kept, setKept] = useState<string[]>([]);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstActionRef = useRef<HTMLButtonElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Seeded once per reading, so edits survive a failed save.
  useEffect(() => {
    if (result) {
      setText(result.text);
      setKept([]);
    }
  }, [result]);

  useEffect(() => {
    if (phase === "review") {
      textRef.current?.focus();
    } else if (phase === "reading" || phase === "saving") {
      // Keep focus inside the dialog while its buttons are replaced.
      dialogRef.current?.focus();
    } else {
      firstActionRef.current?.focus();
    }
  }, [phase]);

  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    return () => opener?.focus();
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape" && phase !== "saving") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab" || dialogRef.current === null) return;
    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>): void {
    if (phase !== "choosing" && phase !== "error") return;
    const file = Array.from(event.clipboardData.files).find((item) =>
      item.type.startsWith("image/"),
    );
    if (file) {
      event.preventDefault();
      void flow.paste(file);
    }
  }

  const busy = phase === "reading" || phase === "saving";

  return (
    <div className="dialog-backdrop">
      <div
        ref={dialogRef}
        className="image-to-text-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-to-text-title"
        aria-describedby="image-to-text-help"
        aria-busy={busy}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
      >
        <header className="image-to-text-header">
          <h2 id="image-to-text-title">
            {phase === "review" || phase === "saving"
              ? "Revisar texto extraído"
              : "Nota a partir de imagem"}
          </h2>
          <button
            className="icon-action"
            type="button"
            aria-label="Fechar"
            title="Fechar"
            disabled={phase === "saving"}
            onClick={onClose}
          >
            <Icon name="x" />
          </button>
        </header>

        <p id="image-to-text-help" className="image-to-text-help">
          {phase === "review" || phase === "saving"
            ? 'Corrija o que for preciso. Uma linha em branco separa parágrafos, "- " começa um item de lista, e a imagem fica guardada na nota.'
            : "Escolha ou cole (⌘V) uma foto com texto. O texto é lido neste Mac, sem enviar nada."}
        </p>

        <div className="image-to-text-status" aria-live="polite">
          {phase === "reading" ? (
            <p className="image-to-text-progress">
              <span className="image-to-text-spinner" aria-hidden="true" />
              Lendo o texto da imagem…
            </p>
          ) : phase === "saving" ? (
            <p className="image-to-text-progress">
              <span className="image-to-text-spinner" aria-hidden="true" />
              Criando a nota…
            </p>
          ) : null}
        </div>

        {error ? (
          <p className="image-to-text-error" role="alert">
            {error.message}
          </p>
        ) : null}

        {(phase === "review" || phase === "saving") && image && result ? (
          <div className="image-to-text-review">
            <figure className="image-to-text-preview">
              <img
                src={attachmentUrl(image.relativePath)}
                alt="A imagem de onde o texto foi lido"
              />
            </figure>
            <div className="image-to-text-editor">
              <label htmlFor="image-to-text-text">
                Texto extraído - edite conforme necessário
              </label>
              <textarea
                id="image-to-text-text"
                ref={textRef}
                value={text}
                disabled={phase === "saving"}
                aria-describedby="image-to-text-doubtful"
                onChange={(event) => setText(event.target.value)}
              />
              {result.text === "" ? (
                <p
                  id="image-to-text-doubtful"
                  className="image-to-text-doubtful-empty"
                >
                  Nenhum texto encontrado. Você pode escrever o texto, ou tentar
                  outra imagem.
                </p>
              ) : (
                <DoubtfulWords
                  words={result.doubtfulWords.filter(
                    (doubtful) => !kept.includes(doubtful.word),
                  )}
                  text={text}
                  disabled={phase === "saving"}
                  onReplace={(word, replacement) =>
                    setText((current) =>
                      replaceWord(current, word, replacement),
                    )
                  }
                  onKeep={(word) => setKept((current) => [...current, word])}
                  onDone={() => textRef.current?.focus()}
                />
              )}
            </div>
          </div>
        ) : null}

        <div className="dialog-actions">
          {phase === "choosing" ? (
            <>
              <button
                className="secondary-button"
                type="button"
                onClick={onClose}
              >
                Cancelar
              </button>
              <button
                ref={firstActionRef}
                className="primary-button"
                type="button"
                onClick={() => void flow.choose()}
              >
                <Icon name="image" />
                Escolher imagem
              </button>
            </>
          ) : phase === "reading" ? (
            <button
              className="secondary-button"
              type="button"
              onClick={flow.reset}
            >
              Cancelar leitura
            </button>
          ) : phase === "error" ? (
            <>
              <button
                className="secondary-button"
                type="button"
                onClick={onClose}
              >
                Cancelar
              </button>
              {error?.step === "save" ? (
                <button
                  ref={firstActionRef}
                  className="primary-button"
                  type="button"
                  onClick={flow.backToReview}
                >
                  Voltar à revisão
                </button>
              ) : error?.step === "read" ? (
                <>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void flow.choose()}
                  >
                    Outra imagem
                  </button>
                  <button
                    ref={firstActionRef}
                    className="primary-button"
                    type="button"
                    onClick={flow.retry}
                  >
                    Tentar novamente
                  </button>
                </>
              ) : (
                <button
                  ref={firstActionRef}
                  className="primary-button"
                  type="button"
                  onClick={() => void flow.choose()}
                >
                  Escolher outra imagem
                </button>
              )}
            </>
          ) : (
            <>
              <button
                className="secondary-button"
                type="button"
                disabled={phase === "saving"}
                onClick={onClose}
              >
                Cancelar
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={phase === "saving"}
                onClick={flow.retry}
              >
                Ler novamente
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={phase === "saving" || text.trim() === ""}
                onClick={() => void flow.save(text)}
              >
                Gerar nota
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ImageToTextDialog;
