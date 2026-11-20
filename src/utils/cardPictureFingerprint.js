// Browser-only: decodes a card photo on this device and returns its fingerprint.
// The photo itself never leaves this function.
import { fingerprintCardGray } from "./cardPictureMemory.mjs";

const SAMPLE_WIDTH = 240;

export async function fingerprintCardFile(file) {
  if (!file || typeof document === "undefined") return "";
  let bitmap = null;
  let url = "";
  try {
    let source;
    if (typeof createImageBitmap === "function") {
      bitmap = await createImageBitmap(file);
      source = bitmap;
    } else {
      url = URL.createObjectURL(file);
      source = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = url;
      });
    }
    let width = source.width;
    let height = source.height;
    if (!width || !height) return "";
    // Cards are portrait; turn a landscape photo upright before sampling.
    const rotate = width > height * 1.15;
    const outW = SAMPLE_WIDTH;
    const outH = Math.round(SAMPLE_WIDTH * (rotate ? width / height : height / width));
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (rotate) {
      context.translate(outW, 0);
      context.rotate(Math.PI / 2);
      context.drawImage(source, 0, 0, outH, outW);
    } else {
      context.drawImage(source, 0, 0, outW, outH);
    }
    const { data } = context.getImageData(0, 0, outW, outH);
    const gray = new Uint8Array(outW * outH);
    for (let index = 0, pixel = 0; index < gray.length; index += 1, pixel += 4) {
      gray[index] = Math.round(data[pixel] * 0.299 + data[pixel + 1] * 0.587 + data[pixel + 2] * 0.114);
    }
    width = outW;
    height = outH;
    return fingerprintCardGray(gray, width, height);
  } catch {
    return "";
  } finally {
    bitmap?.close?.();
    if (url) URL.revokeObjectURL(url);
  }
}
