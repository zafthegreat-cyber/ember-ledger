// #21: nine-pocket binder pages in card-number order. Kept outside
// SetBinderView.jsx so that component module exports only components.

export const BINDER_POCKETS_PER_PAGE = 9;

export function buildBinderPages(rows = [], pocketsPerPage = BINDER_POCKETS_PER_PAGE) {
  const ordered = [...(Array.isArray(rows) ? rows : [])];
  const pages = [];
  for (let index = 0; index < ordered.length; index += pocketsPerPage) {
    const pocketRows = ordered.slice(index, index + pocketsPerPage);
    while (pocketRows.length < pocketsPerPage) pocketRows.push(null);
    pages.push({ number: pages.length + 1, pockets: pocketRows });
  }
  return pages.length ? pages : [{ number: 1, pockets: Array.from({ length: pocketsPerPage }, () => null) }];
}
