export const returnMoney = (minor, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(minor || 0) / 100);
