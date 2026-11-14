export function cameraFailureMessage(error) {
  const message = String(error?.message || "");
  if (error?.name === "NotAllowedError" || /permission|denied/i.test(message)) return "Camera permission is blocked. Allow Camera in this app or browser’s settings, then try again. You can also enter the barcode manually.";
  if (error?.name === "NotFoundError") return "No camera was found. Connect a camera or enter the barcode manually.";
  if (error?.name === "NotReadableError") return "The camera is in use or could not be opened. Close other camera apps, then try again.";
  if (/secure|https/i.test(message)) return "Open Code 3 TCG using its secure HTTPS address to use the camera.";
  if (/fetch|network|import/i.test(message)) return "The scanner could not finish loading. Check your connection and try again, or enter the barcode manually.";
  return message || "The camera could not start. Try again or enter the barcode manually.";
}
