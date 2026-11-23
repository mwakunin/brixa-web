import { api } from "@/lib/api/client";
import { ApiError, refusalOf } from "@/lib/api/refusal";
import { en } from "@/strings/en";

/** How long a document's PDF stays in memory once its tab has it. */
const KEPT_MS = 60_000;

/**
 * A tab opened at the press of the button that leads to a document, so the
 * browser does not take the document's later opening for a pop-up. It says
 * the document is on its way.
 */
export function documentTab(): Window | null {
  const tab = window.open("", "_blank");
  if (tab) {
    tab.document.title = en.documents.preparing;
    tab.document.body.textContent = en.documents.preparing;
  }
  return tab;
}

/**
 * Opens a printed document's PDF (`GET /documents/{id}/pdf`, audited) in
 * `tab`, or in a new one, for the browser to print. The PDF is held in
 * memory only, and let go once the tab has it. A tab given is closed if
 * the document cannot be read.
 */
export async function openDocument(documentId: string, tab: Window | null = null): Promise<void> {
  try {
    const { data, error, response } = await api.GET("/documents/{id}/pdf", { params: { path: { id: documentId } }, parseAs: "blob" });
    if (!data)
      throw new ApiError(refusalOf(response.status, error), response.status);
    const url = URL.createObjectURL(data);
    if (tab && !tab.closed)
      tab.location.replace(url);
    else
      window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), KEPT_MS);
  }
  catch (error) {
    tab?.close();
    throw error;
  }
}
