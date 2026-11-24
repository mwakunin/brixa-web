import { api } from "@/lib/api/client";
import { ApiError, failureText, refusalOf } from "@/lib/api/refusal";
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

/** The browser refused to open a tab for a document: pop-ups are blocked. */
export class TabBlocked extends Error {
  constructor() {
    super("The browser blocked the document's tab");
    this.name = "TabBlocked";
  }
}

/** Why a document did not open, in words for the member of staff. */
export function documentFailureText(error: unknown): string {
  return error instanceof TabBlocked ? en.documents.blocked : failureText(error);
}

/**
 * Opens a printed document's PDF (`GET /documents/{id}/pdf`, audited) in
 * `tab`, or in a new one, for the browser to print. The PDF is held in
 * memory only, and let go once the tab has it. A tab given is closed if
 * the document cannot be read; with no tab to open it in, it fails with
 * `TabBlocked`, so the screen can say so.
 */
export async function openDocument(documentId: string, tab: Window | null = null): Promise<void> {
  try {
    const { data, error, response } = await api.GET("/documents/{id}/pdf", { params: { path: { id: documentId } }, parseAs: "blob" });
    if (!data)
      throw new ApiError(refusalOf(response.status, error), response.status);
    const url = URL.createObjectURL(data);
    if (tab && !tab.closed) {
      tab.location.replace(url);
    }
    else if (!window.open(url, "_blank")) {
      URL.revokeObjectURL(url);
      throw new TabBlocked();
    }
    setTimeout(() => URL.revokeObjectURL(url), KEPT_MS);
  }
  catch (error) {
    tab?.close();
    throw error;
  }
}
