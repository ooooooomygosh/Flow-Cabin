// Saves a Blob as a file. The anchor is attached while it is clicked (Chromium ignores `download`
// on detached anchors in some builds) and the object URL lives long enough for a slow save dialog.
export function downloadBlob(blob, filename, { document: doc = globalThis.document, url: urls = globalThis.URL, keepMs = 60000 } = {}) {
  if (globalThis.albumMobile?.saveFile) return globalThis.albumMobile.saveFile(blob, filename).catch(error => { globalThis.dispatchEvent(new CustomEvent('cabin:mobile-notice', { detail: error.message || '文件未能保存，请重试。' })); return { failed: true }; });
  const url = urls.createObjectURL(blob), anchor = doc.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.rel = 'noopener'; anchor.style.display = 'none';
  doc.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => urls.revokeObjectURL(url), keepMs);
}
