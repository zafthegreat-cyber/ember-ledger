import { isNativePlatform } from "./nativeRuntime.js";

export function safeExportFilename(value) {
  const name = String(value || "code3-backup.json");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._ -]{0,149}$/.test(name) || name.includes("..")) throw new Error("Choose a simple file name for this export.");
  return name;
}

export function exportFileStatus(result) {
  return result.shared ? "Share sheet closed. Confirm the file was saved to your chosen location." : "Download started. Keep the downloaded file somewhere private.";
}

export function exportFileError(error) {
  return error?.name === "AbortError" ? "Export cancelled. No saved backup was confirmed; your records are unchanged." : "The file could not be exported. Your records are unchanged; try saving again.";
}

export async function exportFile({ blob, filename, signal, assertCurrent = () => {} }) {
  const check = () => {
    if (signal?.aborted) throw new DOMException("Export cancelled.", "AbortError");
    assertCurrent();
  };
  check();
  const name = safeExportFilename(filename);
  if (!(blob instanceof Blob)) throw new Error("The export file is unavailable.");
  if (!isNativePlatform()) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = name;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { shared: false };
  }
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import("@capacitor/filesystem"), import("@capacitor/share")]);
  check();
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1]);
    reader.onerror = () => reject(new Error("The export could not be prepared."));
    reader.readAsDataURL(blob);
  });
  check();
  const path = `code3-exports/${crypto.randomUUID()}-${name}`;
  let shareStarted = false;
  try {
    const file = await Filesystem.writeFile({ path, directory: Directory.Cache, data, recursive: true });
    check();
    shareStarted = true;
    await Share.share({ title: "Code 3 TCG export", files: [file.uri], dialogTitle: "Save your Code 3 TCG file" });
    check();
    return { shared: true };
  } catch (error) {
    if (error?.name === "AbortError" || /cancel/i.test(String(error?.message || ""))) throw new DOMException("Export cancelled.", "AbortError");
    throw error;
  } finally {
    // Leave enough time for the selected share target to read its granted file.
    // The OS also owns eviction of this cache directory.
    if (shareStarted) setTimeout(() => { Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {}); }, 60_000);
    else await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {});
  }
}
