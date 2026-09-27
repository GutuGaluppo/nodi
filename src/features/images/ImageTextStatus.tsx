import { useQuery } from "@tanstack/react-query";
import { getImageTextStatus } from "../../db/repositories/attachmentTextRepository";
import { imageTextProgressKey } from "./ImageTextIndexer";
import { imageTextKeys } from "./useImageInsertion";

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** The "Image text" row on the "Your data" page (OCR-002). */
function ImageTextStatus() {
  const status = useQuery({
    queryKey: [...imageTextKeys.all, "status"],
    queryFn: getImageTextStatus,
  });
  const progress = useQuery<{ done: number; total: number } | null>({
    queryKey: imageTextProgressKey,
    queryFn: () => null,
    staleTime: Number.POSITIVE_INFINITY,
  });

  return (
    <div className="data-row">
      <dt>Image text</dt>
      <dd>
        {status.data ? (
          <>
            <span>
              {plural(status.data.recognized, "image", "images")} readable in
              search
              {status.data.waiting > 0
                ? ` · ${status.data.waiting} waiting`
                : ""}
            </span>
            {progress.data ? (
              <span className="data-note" role="status">
                Reading image {progress.data.done} of {progress.data.total}…
              </span>
            ) : null}
            <span className="data-note">
              Text in images is recognized on this Mac with Apple's Vision
              framework. Images in private notes are never read.
            </span>
          </>
        ) : status.isError ? (
          "Unavailable."
        ) : (
          "Reading…"
        )}
      </dd>
    </div>
  );
}

export default ImageTextStatus;
