import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  type ClipboardEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import Icon from "../../components/ui/Icon";
import { createNote, type Note } from "../../db/repositories/noteRepository";
import type { StoredAttachment } from "../../lib/attachments/storedAttachment";
import {
  type HandwritingClient,
  HandwritingError,
  handwritingClient,
  handwritingUsageKey,
  type Job,
  type Quote,
  validateFile,
} from "../handwriting/client";
import { handwritingLimits } from "../handwriting/plans";
import { imageTextKeys } from "../images/useImageInsertion";
import { notesKeys } from "../notes/useNotes";
import { searchKeys } from "../search/searchQueries";
import {
  createImageTextNote,
  imageNoteDocument,
  plainText,
  titleFromText,
} from "./imageToNote";

interface Props {
  notebookId: string | null;
  onClose: () => void;
  onCreated: (noteId: string) => void;
  /** Leaves the dialog for Settings › Plan and usage. */
  onOpenPlanUsage?: () => void;
  client?: HandwritingClient;
}
type Phase =
  | "choosing"
  | "quoting"
  | "confirming"
  | "submitting"
  | "processing"
  | "pending"
  | "review"
  | "saving";
const FOCUSABLE =
  "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href]";

export default function ImageToTextDialog({
  notebookId,
  onClose,
  onCreated,
  onOpenPlanUsage,
  client = handwritingClient,
}: Props) {
  const cache = useQueryClient();
  const usage = useQuery({
    queryKey: handwritingUsageKey,
    queryFn: () => client.usage(),
    enabled: client.available,
    retry: false,
  });
  const jobs = useQuery({
    queryKey: ["handwriting-jobs"],
    queryFn: () => client.jobs(),
    enabled: client.available,
    retry: false,
  });
  const [phase, setPhase] = useState<Phase>("choosing");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [text, setText] = useState("");
  const [recognizedText, setRecognizedText] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const dialog = useRef<HTMLDivElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const mounted = useRef(true);
  const pollAttempt = useRef(0);
  const checkLock = useRef(false);
  const [pollDelay, setPollDelay] = useState(5000);
  const saveLock = useRef(false);
  const storedFile = useRef<StoredAttachment | null>(null);

  useEffect(() => {
    mounted.current = true;
    const opener = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => {
      mounted.current = false;
      opener?.focus();
    };
  }, []);
  useEffect(() => {
    if (
      !file ||
      file.type === "application/pdf" ||
      file.type === "image/tiff" ||
      file.type === "image/heic"
    ) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (phase === "review") editor.current?.focus();
  }, [phase]);

  function select(selected: File): void {
    try {
      validateFile(selected);
      setFile(selected);
      setQuote(null);
      setJob(null);
      storedFile.current = null;
      setPhase("choosing");
      setError("");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Arquivo inválido.",
      );
    }
  }
  function paste(event: ClipboardEvent<HTMLDivElement>): void {
    if (phase !== "choosing") return;
    const selected = Array.from(event.clipboardData.files).find((item) =>
      item.type.startsWith("image/"),
    );
    if (selected) {
      event.preventDefault();
      select(selected);
    }
  }
  function keyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape" && phase !== "saving") {
      event.preventDefault();
      onClose();
    }
    if (event.key !== "Tab") return;
    const targets = Array.from(
      dialog.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
    );
    const first = targets[0];
    const last = targets[targets.length - 1];
    if (
      first &&
      (document.activeElement === dialog.current ||
        (!event.shiftKey && document.activeElement === last))
    ) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    }
  }
  async function validate(): Promise<void> {
    if (!file || !consent || phase === "quoting") return;
    setPhase("quoting");
    setError("");
    try {
      const result = await client.quote(file);
      if (mounted.current) {
        setQuote(result);
        setPhase("confirming");
        await usage.refetch();
      }
    } catch (failure) {
      if (mounted.current) {
        setError(
          failure instanceof Error
            ? failure.message
            : "Não foi possível validar o arquivo.",
        );
        setPhase("choosing");
      }
    }
  }
  async function submit(): Promise<void> {
    if (!quote || phase !== "confirming") return;
    setPhase("submitting");
    setError("");
    try {
      const result = await client.submit(quote.id);
      if (mounted.current) {
        setJob({ id: result.id, pages: quote.pages, status: "pending" });
        setPhase("processing");
      }
    } catch (failure) {
      if (mounted.current) {
        setError(
          failure instanceof Error ? failure.message : "Envio não confirmado.",
        );
        setPhase(
          failure instanceof HandwritingError &&
            ["insufficient_credits", "quote_expired", "invalid_file"].includes(
              failure.code,
            )
            ? "confirming"
            : "pending",
        );
      }
    } finally {
      void cache.invalidateQueries({ queryKey: handwritingUsageKey });
    }
  }
  async function check(id: string): Promise<void> {
    if (checkLock.current) return;
    checkLock.current = true;
    try {
      const result = await client.status(id);
      if (!mounted.current) return;
      setJob(result);
      if (result.status === "processed") {
        setText(result.text ?? "");
        setRecognizedText(result.text ?? "");
        setPhase("review");
        setError("");
        void cache.invalidateQueries({ queryKey: handwritingUsageKey });
      } else if (result.status === "failed" || result.status === "expired") {
        setPhase("pending");
        setError(
          result.status === "failed"
            ? "A transcrição falhou. Os créditos foram devolvidos. Uma nova tentativa requer confirmar o custo novamente."
            : "O texto expirou no servidor. Para transcrever novamente, confirme um novo consumo de páginas.",
        );
        void cache.invalidateQueries({ queryKey: handwritingUsageKey });
      } else {
        pollAttempt.current += 1;
        setPollDelay(
          Math.min(
            30000,
            Math.max(
              result.retryAfterMs ?? 5000,
              5000 * 2 ** Math.min(pollAttempt.current, 3),
            ),
          ),
        );
        setPhase(pollAttempt.current >= 8 ? "pending" : "processing");
      }
    } catch (failure) {
      if (!mounted.current) return;
      setError(
        failure instanceof Error
          ? failure.message
          : "Não foi possível consultar o processamento.",
      );
      setPollDelay(
        failure instanceof HandwritingError ? failure.retryAfterMs : 10000,
      );
      setPhase("pending");
    } finally {
      checkLock.current = false;
    }
  }
  // GET only. Closing this dialog never cancels or releases a server reservation.
  useEffect(() => {
    if (phase !== "processing" || !job) return;
    const timer = setTimeout(() => void check(job.id), pollDelay);
    return () => clearTimeout(timer);
  });
  async function resume(): Promise<void> {
    setError("");
    pollAttempt.current = 0;
    if (job) {
      setPhase("processing");
      await check(job.id);
    } else if (quote) {
      try {
        const existing = await client.lookup(quote.id);
        if (existing) {
          setJob({ id: existing.id, pages: quote.pages, status: "pending" });
          setPhase("processing");
        } else {
          setPhase("confirming");
          setNotice(
            "O servidor confirmou que não recebeu o envio. Você pode confirmar novamente.",
          );
        }
      } catch (failure) {
        setError(
          failure instanceof Error
            ? failure.message
            : "Envio ainda não confirmado.",
        );
      }
    }
  }
  async function save(): Promise<void> {
    if (saveLock.current || !text.trim()) return;
    saveLock.current = true;
    setPhase("saving");
    setError("");
    try {
      let note: Note;
      if (file) {
        if (!storedFile.current)
          storedFile.current = await invoke<StoredAttachment>(
            "import_handwriting_bytes",
            new Uint8Array(await file.arrayBuffer()),
          );
        note = await createImageTextNote({
          image: storedFile.current,
          text,
          recognizedText,
          notebookId,
        });
      } else {
        note = await createNote({
          title: titleFromText(text),
          contentJson: JSON.stringify(imageNoteDocument(text)),
          contentText: plainText(text),
          notebookId,
        });
      }
      await Promise.all(
        [notesKeys.all, imageTextKeys.all, searchKeys.all].map((queryKey) =>
          cache.invalidateQueries({ queryKey }),
        ),
      );
      if (mounted.current) onCreated(note.id);
    } catch (failure) {
      if (mounted.current) {
        setError(
          failure instanceof Error
            ? failure.message
            : "Não foi possível salvar a nota.",
        );
        setPhase("review");
      }
    } finally {
      saveLock.current = false;
    }
  }
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Texto copiado.");
    } catch {
      setNotice("Selecione o texto e copie manualmente.");
    }
  }
  async function exportText(): Promise<void> {
    if (isTauri()) {
      try {
        const saved = await invoke<boolean>("export_handwriting_text", {
          text,
        });
        setNotice(saved ? "Texto exportado." : "Exportação cancelada.");
      } catch {
        setError("Não foi possível exportar o texto. Tente novamente.");
      }
      return;
    }
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "nodi-transcription.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const balance = usage.data
    ? usage.data.monthlyRemaining +
      usage.data.trialRemaining +
      usage.data.additional.reduce((sum, pack) => sum + pack.remaining, 0)
    : null;
  const shortfall =
    balance !== null && quote !== null && balance < quote.credits;
  const busy = ["quoting", "submitting", "processing", "saving"].includes(
    phase,
  );
  const reviewing = phase === "review" || phase === "saving";
  return (
    <div className="dialog-backdrop">
      <div
        ref={dialog}
        className="image-to-text-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-to-text-title"
        aria-describedby="image-to-text-help"
        aria-busy={busy}
        tabIndex={-1}
        onKeyDown={keyDown}
        onPaste={paste}
      >
        <header className="image-to-text-header">
          <h2 id="image-to-text-title">
            {reviewing
              ? "Revisar texto extraído"
              : "Handwriting · imagem ou PDF"}
          </h2>
          <button
            type="button"
            className="icon-action"
            aria-label="Fechar"
            disabled={phase === "saving"}
            onClick={onClose}
          >
            <Icon name="x" />
          </button>
        </header>
        <p id="image-to-text-help" className="image-to-text-help">
          {reviewing
            ? "Revise o texto antes de criar a nota. Nenhuma palavra é corrigida automaticamente."
            : "Transcreva com Handwriting OCR. Uma imagem ou página usa um crédito. O custo aparece antes da transcrição."}
        </p>
        {!client.available ? (
          <p className="handwriting-notice" role="status">
            Handwriting ainda não está disponível. A conexão segura está sendo
            preparada.
          </p>
        ) : null}
        {usage.isError ? <p role="alert">{usage.error.message}</p> : null}
        {error ? (
          <p className="image-to-text-error" role="alert">
            {error}
          </p>
        ) : null}
        <p role="status">{notice}</p>
        {phase === "choosing" || phase === "quoting" ? (
          <div className="handwriting-choice">
            <label htmlFor="handwriting-file">Escolher imagem ou PDF</label>
            <input
              id="handwriting-file"
              type="file"
              accept={handwritingLimits.mimeTypes.join(",")}
              disabled={phase === "quoting"}
              onChange={(event) => {
                const selected = event.target.files?.[0];
                if (selected) select(selected);
              }}
            />
            <p className="image-to-text-help">
              PDF, JPEG, PNG, TIFF, HEIC ou GIF · até 20 MB e 70 páginas.
              Imagens devem ter um único quadro e até 40 megapixels. Você também
              pode colar uma imagem (⌘V).
            </p>
            <label className="handwriting-consent">
              <input
                type="checkbox"
                checked={consent}
                disabled={phase === "quoting"}
                onChange={(event) => setConsent(event.target.checked)}
              />
              Autorizo enviar este arquivo ao NODI para validar as páginas e ao
              Handwriting OCR após confirmar a transcrição.
            </label>
            <p className="image-to-text-help">
              Arquivos não enviados para transcrição expiram no servidor em 15
              minutos. Originais enviados e resultados ficam no servidor por até
              1 hora. A exclusão no Handwriting é solicitada após{" "}
              {Math.round((usage.data?.deleteAfterSeconds ?? 3600) / 60)}{" "}
              minutos. A nota aprovada e seu original ficam neste Mac.
            </p>
            {jobs.data?.length ? (
              <details>
                <summary>
                  Processamentos recentes · recuperar sem cobrar novamente
                </summary>
                {jobs.data.map((item) => (
                  <button
                    className="secondary-button"
                    type="button"
                    key={item.id}
                    onClick={() => {
                      setFile(null);
                      setQuote(null);
                      setJob(item);
                      pollAttempt.current = 0;
                      setPhase("processing");
                    }}
                  >
                    {item.pages} página(s) · {item.status}
                  </button>
                ))}
                <p>
                  Ao recuperar, o texto pode ser salvo sem o arquivo original.
                </p>
              </details>
            ) : null}
          </div>
        ) : null}
        {phase === "confirming" && quote ? (
          <div className="handwriting-notice">
            <p>
              <strong>
                {quote.pages} página(s) · {quote.credits} crédito(s)
              </strong>
            </p>
            <p>
              Saldo disponível:{" "}
              {balance === null
                ? "aguardando confirmação"
                : `${balance} página(s)`}
              . O servidor confirma e reserva o saldo ao enviar.
            </p>
            {shortfall ? (
              <p id="handwriting-shortfall" className="image-to-text-error">
                Saldo insuficiente: este arquivo usa {quote.credits} crédito(s)
                e você tem {balance}. Compre páginas ou mude de plano em{" "}
                {onOpenPlanUsage ? (
                  <button
                    type="button"
                    className="inline-link-button"
                    onClick={onOpenPlanUsage}
                  >
                    Settings › Plan and usage
                  </button>
                ) : (
                  "Settings › Plan and usage"
                )}
              </p>
            ) : null}
          </div>
        ) : null}
        {busy ? (
          <p className="image-to-text-progress" role="status">
            <span className="image-to-text-spinner" aria-hidden="true" />
            {phase === "quoting"
              ? "Validando páginas…"
              : phase === "saving"
                ? "Criando a nota…"
                : "Aguardando Handwriting OCR…"}
          </p>
        ) : null}
        {phase === "pending" ? (
          <p>
            O processamento fica registrado no servidor. Consultar o resultado
            não consome novos créditos.
          </p>
        ) : null}
        {reviewing ? (
          <div className="image-to-text-review">
            {preview ? (
              <figure className="image-to-text-preview">
                <img src={preview} alt="Documento original" />
              </figure>
            ) : (
              <p>{file?.name ?? "Texto recuperado"}</p>
            )}
            <div className="image-to-text-editor">
              <label htmlFor="image-to-text-text">
                Texto extraído — edite conforme necessário
              </label>
              <textarea
                ref={editor}
                id="image-to-text-text"
                value={text}
                disabled={phase === "saving"}
                onChange={(event) => setText(event.target.value)}
              />
            </div>
          </div>
        ) : null}
        <div className="dialog-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={phase === "saving"}
            onClick={onClose}
          >
            {busy ? "Fechar · manter processamento" : "Fechar"}
          </button>
          {phase === "choosing" ? (
            <button
              type="button"
              className="primary-button"
              disabled={!client.available || !file || !consent}
              onClick={() => void validate()}
            >
              Validar páginas
            </button>
          ) : null}
          {phase === "confirming" ? (
            <>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setQuote(null);
                  setPhase("choosing");
                }}
              >
                Voltar
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={balance === null || shortfall}
                aria-describedby={
                  shortfall ? "handwriting-shortfall" : undefined
                }
                onClick={() => void submit()}
              >
                Transcrever · {quote?.credits} crédito(s)
              </button>
            </>
          ) : null}
          {(phase === "pending" || phase === "processing") &&
          job?.status !== "failed" &&
          job?.status !== "expired" ? (
            <button
              type="button"
              className="primary-button"
              onClick={() => void resume()}
            >
              Consultar processamento
            </button>
          ) : null}
          {reviewing ? (
            <>
              <button
                type="button"
                className="secondary-button"
                disabled={phase === "saving"}
                onClick={() => void copy()}
              >
                Copiar
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={phase === "saving"}
                onClick={() => void exportText()}
              >
                Exportar TXT
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={phase === "saving" || !text.trim()}
                onClick={() => void save()}
              >
                Gerar nota
              </button>
            </>
          ) : null}
          {phase === "review" ||
          (phase === "pending" &&
            (job?.status === "failed" || job?.status === "expired")) ? (
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setQuote(null);
                setJob(null);
                setPhase("choosing");
                setNotice(
                  "Transcrever novamente exige validar as páginas e confirmar um novo consumo.",
                );
              }}
            >
              Nova transcrição
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
