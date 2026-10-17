import { type Effort, handwritingLimits, type PlanId } from "./plans";

export interface Usage {
  plan: PlanId;
  monthlyRemaining: number;
  trialRemaining: number;
  additional: { remaining: number; expiresAt: string }[];
  renewalAt: string | null;
  /** The OpenAI model the server transcribes with. */
  model: string;
  /** The effort preselected by the server. */
  effort?: Effort;
  paymentsAvailable: boolean;
  restoreAvailable: boolean;
}
export interface Quote {
  id: string;
  pages: number;
  credits: number;
  expiresAt: string;
}
export interface Job {
  id: string;
  pages: number;
  status:
    | "pending"
    | "queued"
    | "processing"
    | "processed"
    | "failed"
    | "expired";
  text?: string;
  retryAfterMs?: number;
}
export interface HandwritingClient {
  available: boolean;
  usage(): Promise<Usage>;
  quote(file: File): Promise<Quote>;
  submit(quoteId: string, effort: Effort): Promise<{ id: string }>;
  status(id: string): Promise<Job>;
  jobs(): Promise<Job[]>;
  lookup(quoteId: string): Promise<{ id: string } | null>;
  checkout(product: string): Promise<{ url: string }>;
  restore(): Promise<Usage>;
}

const messages: Record<string, string> = {
  service_unconfigured:
    "A transcrição ainda não está disponível. A conexão segura está sendo preparada.",
  unauthenticated: "Entre na sua conta para transcrever documentos.",
  insufficient_credits:
    "Páginas insuficientes. Confira seu saldo em Plan and usage.",
  invalid_file:
    "Arquivo inválido. Use PDF, JPEG, PNG, WEBP, HEIC, TIFF ou GIF.",
  file_too_large: "O arquivo deve ter no máximo 20 MB.",
  quote_expired:
    "A confirmação de páginas expirou. Valide o arquivo novamente.",
  rate_limited: "O serviço está ocupado. Aguarde antes de consultar novamente.",
  provider_auth: "A conexão com a OpenAI precisa ser atualizada pelo NODI.",
  provider_credits:
    "O serviço de transcrição está temporariamente indisponível.",
  provider_timeout:
    "Não foi possível falar com o servidor. Consulte o processamento novamente.",
  invalid_effort: "Escolha um esforço de leitura válido.",
  payments_unconfigured: "As compras ainda não estão disponíveis.",
};
export class HandwritingError extends Error {
  constructor(
    public code: string,
    public retryAfterMs = 5000,
  ) {
    super(
      messages[code] ||
        "O serviço está indisponível. Tente consultar novamente mais tarde.",
    );
  }
}

const endpoint = import.meta.env.VITE_HANDWRITING_BACKEND_URL as
  | string
  | undefined;
/**
 * Development only, removed from production builds: a server on this Mac's
 * loopback address and a token from the developer's environment.
 */
const localDevelopment =
  import.meta.env.DEV &&
  /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(endpoint ?? "");
const validEndpoint =
  endpoint && (/^https:\/\//.test(endpoint) || localDevelopment);

/** Called only by a future, verified sign-in integration. Token is memory-only. */
let sessionToken: string | null = localDevelopment
  ? ((import.meta.env.VITE_HANDWRITING_DEV_TOKEN as string | undefined) ?? null)
  : null;
export function setHandwritingSession(token: string | null): void {
  sessionToken = token;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!validEndpoint) throw new HandwritingError("service_unconfigured");
  if (!sessionToken) throw new HandwritingError("unauthenticated");
  let response: Response;
  try {
    response = await fetch(
      `${endpoint.replace(/\/$/, "")}/v1/handwriting/${path}`,
      {
        ...options,
        redirect: "error",
        credentials: "omit",
        signal: AbortSignal.timeout(30000),
        headers: {
          ...options.headers,
          Authorization: `Bearer ${sessionToken}`,
        },
      },
    );
  } catch {
    throw new HandwritingError("provider_timeout");
  }
  if (!response.ok) {
    const data = await response
      .json()
      .catch(() => ({ code: "service_unavailable" }));
    throw new HandwritingError(
      data.code,
      Math.max(5000, Number(response.headers.get("Retry-After") || 5) * 1000),
    );
  }
  return response.json() as Promise<T>;
}
export function validateFile(file: File): void {
  if (file.size === 0 || !handwritingLimits.mimeTypes.includes(file.type))
    throw new HandwritingError("invalid_file");
  if (file.size > handwritingLimits.maxBytes)
    throw new HandwritingError("file_too_large");
}
export const handwritingClient: HandwritingClient = {
  available: Boolean(validEndpoint),
  usage: () => request("usage"),
  quote: (file) => {
    validateFile(file);
    return request("quote", {
      method: "POST",
      body: file,
      headers: {
        "Content-Type": file.type,
        "X-Processing-Consent": "handwriting",
      },
    });
  },
  submit: (quoteId, effort) =>
    request("documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quoteId, effort }),
    }),
  jobs: () => request("documents"),
  lookup: (quoteId) =>
    request(`quotes/${encodeURIComponent(quoteId)}/document`),
  status: (id) => request(`documents/${encodeURIComponent(id)}`),
  checkout: (product) =>
    request("checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product }),
    }),
  restore: () => request("restore", { method: "POST" }),
};

export const handwritingUsageKey = ["handwriting-usage"];
