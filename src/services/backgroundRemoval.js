/**
 * Placeholder for a clipping / background-removal API (remove.bg, Clipdrop, etc.).
 * Returns the same File after a short delay so the upload pipeline stays unchanged.
 */
export async function placeholderRemoveBackground(file) {
  if (!(file instanceof Blob)) return file;
  await new Promise((r) => setTimeout(r, 400));
  return file;
}
