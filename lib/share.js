// Share a DigitBox link: the native share sheet where there is one (phones),
// otherwise copy it. Resolves to "shared", "copied", "cancelled" or "failed".
export async function shareLink(path, title) {
  const url = new URL(path, window.location.origin).toString();
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return "shared";
    } catch (error) {
      if (error && error.name === "AbortError") return "cancelled";
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
