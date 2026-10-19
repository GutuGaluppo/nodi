import { type Effort, handwritingEfforts } from "../handwriting/plans";

const levels: Record<Effort, { name: string; hint: string; speed: string }> = {
  none: {
    name: "Rápido",
    hint: "Texto impresso ou letra bem legível.",
    speed: "a resposta mais rápida",
  },
  low: {
    name: "Leve",
    hint: "Manuscrito claro, com poucas dúvidas.",
    speed: "resposta rápida",
  },
  medium: {
    name: "Equilibrado",
    hint: "Manuscrito comum do dia a dia.",
    speed: "um pouco mais lento",
  },
  high: {
    name: "Cuidadoso",
    hint: "Letra difícil, rasuras ou anotações.",
    speed: "bem mais lento",
  },
  xhigh: {
    name: "Máximo",
    hint: "Documentos muito difíceis.",
    speed: "o mais lento",
  },
};
const base = handwritingEfforts[0];
const plural = (credits: number) =>
  `${credits} ${credits === 1 ? "crédito" : "créditos"}`;

export function effortCredits(effort: Effort, pages: number): number {
  const level = handwritingEfforts.find((item) => item.id === effort) ?? base;
  return level.credits * pages;
}

/** Spending for the chosen effort, compared with the fastest one. */
export function effortCost(effort: Effort, pages: number | null): string {
  const { name, speed } = levels[effort];
  const perPage = effortCredits(effort, 1);
  const comparison =
    effort === base.id
      ? "a opção mais econômica"
      : perPage === base.credits
        ? `mesmo custo do ${levels[base.id].name}`
        : `${perPage / base.credits}× o custo do ${levels[base.id].name}`;
  if (pages === null)
    return `${name}: ${perPage} crédito(s) por página, ${comparison}; ${speed}. O total aparece depois de validar as páginas.`;
  const extra = (perPage - base.credits) * pages;
  return `${name}: ${perPage * pages} crédito(s) para ${pages} página(s), ${comparison}${extra ? ` (+${extra} crédito(s))` : ""}; ${speed}.`;
}

interface Props {
  value: Effort;
  /** Known after the pages are validated; otherwise costs are per page. */
  pages: number | null;
  disabled?: boolean;
  onChange: (effort: Effort) => void;
}

export default function EffortPicker({
  value,
  pages,
  disabled,
  onChange,
}: Props) {
  return (
    <fieldset className="effort-picker" disabled={disabled}>
      <legend>Esforço de leitura</legend>
      <div className="effort-options">
        {handwritingEfforts.map(({ id, credits }) => {
          const cost =
            pages === null
              ? `${credits} crédito(s) por página`
              : `${credits * pages} crédito(s)`;
          return (
            <label key={id} className="effort-option">
              <input
                type="radio"
                name="handwriting-effort"
                value={id}
                checked={value === id}
                aria-label={`${levels[id].name}, ${cost}`}
                aria-describedby={`handwriting-effort-${id}`}
                onChange={() => onChange(id)}
              />
              <span className="effort-name">{levels[id].name}</span>
              <span className="effort-credits" aria-hidden="true">
                {plural(pages === null ? credits : credits * pages)}
                {pages === null ? " / pág." : ""}
              </span>
              <span id={`handwriting-effort-${id}`} className="effort-hint">
                {levels[id].hint}
              </span>
            </label>
          );
        })}
      </div>
      <p
        id="handwriting-effort-cost"
        className="effort-cost"
        aria-live="polite"
      >
        {effortCost(value, pages)}
      </p>
    </fieldset>
  );
}
