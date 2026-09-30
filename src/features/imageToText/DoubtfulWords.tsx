import { useRef } from "react";
import {
  containsWord,
  type DoubtfulWord,
  rankSuggestions,
} from "./imageToNote";

interface DoubtfulWordsProps {
  words: DoubtfulWord[];
  /** The text as it is now, so fixed words drop out of the list. */
  text: string;
  disabled: boolean;
  onReplace: (word: string, replacement: string) => void;
  onKeep: (word: string) => void;
  /** Where focus goes when the last word is handled. */
  onDone: () => void;
}

/**
 * Words the Mac's spell checker does not know, each with its best guesses
 * (OCR-003). Nothing is changed until the person picks a guess; "Manter"
 * keeps a word that is right, like a name.
 */
function DoubtfulWords({
  words,
  text,
  disabled,
  onReplace,
  onKeep,
  onDone,
}: DoubtfulWordsProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const pending = words.filter((doubtful) => containsWord(text, doubtful.word));

  function handled(action: () => void): void {
    action();
    // The row goes away; continue with the next word, or back to the text.
    requestAnimationFrame(() => {
      const next = listRef.current?.querySelector<HTMLButtonElement>("button");
      if (next) next.focus();
      else onDone();
    });
  }

  if (pending.length === 0) {
    return (
      <p id="image-to-text-doubtful" className="image-to-text-doubtful-empty">
        {words.length > 0
          ? "Todas as palavras duvidosas foram revistas."
          : "Nenhuma palavra duvidosa encontrada."}
      </p>
    );
  }

  return (
    <section
      id="image-to-text-doubtful"
      className="image-to-text-doubtful"
      aria-labelledby="image-to-text-doubtful-title"
    >
      <h3 id="image-to-text-doubtful-title">
        Palavras duvidosas ({pending.length})
      </h3>
      <ul ref={listRef}>
        {pending.map((doubtful) => {
          const suggestions = rankSuggestions(doubtful, text);
          return (
            <li key={doubtful.word}>
              <span className="image-to-text-doubtful-word">
                {doubtful.word}
              </span>
              <span className="image-to-text-doubtful-actions">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="image-to-text-suggestion"
                    aria-label={`Trocar ${doubtful.word} por ${suggestion}`}
                    disabled={disabled}
                    onClick={() =>
                      handled(() => onReplace(doubtful.word, suggestion))
                    }
                  >
                    {suggestion}
                  </button>
                ))}
                <button
                  type="button"
                  className="image-to-text-keep"
                  aria-label={`Manter ${doubtful.word}`}
                  disabled={disabled}
                  onClick={() => handled(() => onKeep(doubtful.word))}
                >
                  Manter
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default DoubtfulWords;
