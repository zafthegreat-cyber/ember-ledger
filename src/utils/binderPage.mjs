// Binder page scanning (Nov 17 2026): splits one photo of a binder page or a
// laid-out grid of cards into one cell per card, so each can be read alone.

export const BINDER_LAYOUTS = Object.freeze([
  { key: "3x3", label: "9-pocket page (3 x 3)", columns: 3, rows: 3 },
  { key: "2x2", label: "4-pocket page (2 x 2)", columns: 2, rows: 2 },
  { key: "4x3", label: "12-pocket page (4 x 3)", columns: 4, rows: 3 },
  { key: "2x1", label: "Two cards side by side", columns: 2, rows: 1 },
  { key: "3x1", label: "Three cards in a row", columns: 3, rows: 1 },
]);

/**
 * Cell rectangles in image pixels. Each cell is trimmed by `inset` (a fraction
 * of the cell) so pocket edges and neighbouring cards stay out of the read.
 */
export function binderCells(width, height, { columns = 3, rows = 3, inset = 0.03 } = {}) {
  if (!(width > 0 && height > 0 && columns > 0 && rows > 0)) return [];
  const cellW = width / columns, cellH = height / rows;
  const cells = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const dx = cellW * inset, dy = cellH * inset;
      cells.push({
        index: row * columns + column,
        row, column,
        x: Math.round(column * cellW + dx),
        y: Math.round(row * cellH + dy),
        width: Math.round(cellW - dx * 2),
        height: Math.round(cellH - dy * 2),
      });
    }
  }
  return cells;
}

/** Plain-language label for a pocket, e.g. "Row 2, pocket 3". */
export const pocketLabel = (cell) => `Row ${cell.row + 1}, pocket ${cell.column + 1}`;
