/** True when running on macOS, iPadOS, or iOS, where ⌘ is the primary modifier. */
export function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  const source = navigator.platform || navigator.userAgent || "";
  return /Mac|iPhone|iPad|iPod/.test(source);
}
