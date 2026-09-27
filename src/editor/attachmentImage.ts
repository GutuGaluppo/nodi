import { Image } from "@tiptap/extension-image";
import { attachmentUrl } from "../lib/attachments/attachmentUrl";

/**
 * Tiptap's image node, extended for images stored as attachments (ATT-003).
 * The note keeps only the stored path; the display URL is computed when the
 * image renders, so the Tiptap JSON never holds a machine-specific URL.
 */
export const AttachmentImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-path")
            ? null
            : element.getAttribute("src"),
        renderHTML: (attributes) => ({
          src: attributes.path
            ? attachmentUrl(attributes.path)
            : attributes.src,
        }),
      },
      path: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-path"),
        renderHTML: (attributes) =>
          attributes.path ? { "data-path": attributes.path } : {},
      },
      attachmentId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-attachment-id"),
        renderHTML: (attributes) =>
          attributes.attachmentId
            ? { "data-attachment-id": attributes.attachmentId }
            : {},
      },
    };
  },
});
