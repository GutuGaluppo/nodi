import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { listEmbeddings } from "../../db/repositories/embeddingRepository";
import { relatedKeys } from "./RelatedNotesIndexer";
import { decodeVector, findRelated } from "./similarity";

interface RelatedNotesProps {
  noteId: string;
  onOpenNote: (noteId: string) => void;
}

/**
 * Up to five notes whose meaning is close to this one (REL-002), computed on
 * this Mac. Shown only when there is something worth showing.
 */
function RelatedNotes({ noteId, onOpenNote }: RelatedNotesProps) {
  const embeddings = useQuery({
    queryKey: relatedKeys.all,
    queryFn: async () =>
      (await listEmbeddings()).map((item) => ({
        noteId: item.noteId,
        title: item.title,
        language: item.language,
        vector: decodeVector(item.vector),
      })),
  });
  const related = useMemo(
    () => (embeddings.data ? findRelated(noteId, embeddings.data) : []),
    [embeddings.data, noteId],
  );

  if (related.length === 0) return null;

  return (
    <aside className="related-notes" aria-labelledby="related-notes-heading">
      <h3 id="related-notes-heading" className="section-label">
        Related notes
      </h3>
      <ul>
        {related.map((item) => (
          <li key={item.noteId}>
            <button type="button" onClick={() => onOpenNote(item.noteId)}>
              {item.title.trim() || "Untitled"}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export default RelatedNotes;
