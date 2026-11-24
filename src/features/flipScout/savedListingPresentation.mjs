export function hasRecordedAmount(value) {
  return (typeof value === "number" || typeof value === "string") &&
    String(value).trim() !== "" && Number.isFinite(Number(value));
}

export function savedListingPrice(record) {
  return hasRecordedAmount(record.currentBid)
    ? { label: "Saved bid", value: record.currentBid }
    : { label: "Saved price", value: record.askingPrice };
}
