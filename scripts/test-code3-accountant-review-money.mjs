import assert from "node:assert/strict";
import { formatAccountantReviewMoney } from "../src/features/purchaseReceiving/accountantReview/moneyDisplay.js";

let assertions = 0;
const equal = (actual, expected, message) => { assert.equal(actual, expected, message); assertions += 1; };

equal(formatAccountantReviewMoney(Number.MAX_SAFE_INTEGER, "USD"), "$90,071,992,547,409.91", "large safe integer minor units retain both cents");
equal(formatAccountantReviewMoney(-Number.MAX_SAFE_INTEGER, "USD"), "-$90,071,992,547,409.91", "large negative values remain exact without signed-delta styling");
equal(formatAccountantReviewMoney(Number.MAX_SAFE_INTEGER, "USD", { signed: true }), "+$90,071,992,547,409.91", "large positive adjustment retains exact cents and an explicit sign");
equal(formatAccountantReviewMoney(-Number.MAX_SAFE_INTEGER, "USD", { signed: true }), "−$90,071,992,547,409.91", "large negative adjustment retains exact cents and an explicit sign");
equal(formatAccountantReviewMoney(0, "USD", { signed: true }), "$0.00", "zero is never presented with a misleading adjustment sign");
equal(formatAccountantReviewMoney(12345, "EUR"), "€123.45", "currency formatting remains available for exact bounded values");
equal(formatAccountantReviewMoney(1.5, "USD"), "Not available", "floating-point minor units are rejected");
equal(formatAccountantReviewMoney(Number.POSITIVE_INFINITY, "USD"), "Not available", "non-finite money is rejected");

console.log(`Code 3 Accountant Review exact money: ${assertions} assertions passed.`);
