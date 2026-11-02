export type ShareResult = "shared" | "copied" | "cancelled" | "failed";

/** The system share sheet where there is one, else the link goes to the clipboard. */
export async function shareLink(url: string, title: string): Promise<ShareResult> {
  const absolute = new URL(url, window.location.origin).toString();
  if (navigator.share) {
    try {
      await navigator.share({ url: absolute, title });
      return "shared";
    } catch (error) {
      if ((error as Error).name === "AbortError") return "cancelled";
    }
  }
  try {
    await navigator.clipboard.writeText(absolute);
    return "copied";
  } catch {
    return "failed";
  }
}
