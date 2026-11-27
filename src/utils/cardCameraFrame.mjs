// Card camera frame geometry (CardCameraFrame.jsx). Pure, for tests.
export const CARD_ASPECT = 63 / 88;

/** Pure: where the on-screen frame falls in the video's own pixels (object-fit: cover). */
export function frameToVideoRect({ boxWidth, boxHeight, videoWidth, videoHeight, frame }) {
  const scale = Math.max(boxWidth / videoWidth, boxHeight / videoHeight);
  const shownWidth = videoWidth * scale, shownHeight = videoHeight * scale;
  const offsetX = (boxWidth - shownWidth) / 2, offsetY = (boxHeight - shownHeight) / 2;
  const x = (frame.x - offsetX) / scale, y = (frame.y - offsetY) / scale;
  const w = frame.width / scale, h = frame.height / scale;
  const clampX = Math.max(0, x), clampY = Math.max(0, y);
  return { x: clampX, y: clampY, width: Math.min(videoWidth - clampX, w), height: Math.min(videoHeight - clampY, h) };
}

/** Pure: the other way round. Where a rect in the video's own pixels shows on screen, in the box's pixels. */
export function videoToBoxRect({ boxWidth, boxHeight, videoWidth, videoHeight, rect }) {
  const scale = Math.max(boxWidth / videoWidth, boxHeight / videoHeight);
  const offsetX = (boxWidth - videoWidth * scale) / 2, offsetY = (boxHeight - videoHeight * scale) / 2;
  return { x: rect.x * scale + offsetX, y: rect.y * scale + offsetY, width: rect.width * scale, height: rect.height * scale };
}
