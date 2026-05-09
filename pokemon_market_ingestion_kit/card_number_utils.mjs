export function toIntegerOrNull(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

export function parsePokemonCardNumber(value, fallbackPrintedTotal = null) {
  const raw = String(value || '').trim();
  const fallbackTotal = toIntegerOrNull(fallbackPrintedTotal);
  if (!raw) {
    return {
      card_number: null,
      card_number_prefix: null,
      card_number_suffix: null,
      card_number_sort: null,
      printed_total: fallbackTotal,
    };
  }

  const firstPart = raw.split('/')[0] || raw;
  const prefix = (firstPart.match(/^[A-Za-z]+/)?.[0] || '').toUpperCase();
  const firstNumber = raw.match(/\d+/)?.[0] || '';
  const suffix = (firstPart.match(/^[A-Za-z]*\d+\s*([A-Za-z]+)$/)?.[1] || '').toUpperCase();
  const printedTotalText = (raw.split('/')[1] || '').match(/\d+/)?.[0] || '';

  return {
    card_number: raw,
    card_number_prefix: prefix || null,
    card_number_suffix: suffix || null,
    card_number_sort: firstNumber ? Number(firstNumber) : null,
    printed_total: printedTotalText ? Number(printedTotalText) : fallbackTotal,
  };
}
