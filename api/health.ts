import app from "../backend/src/server";

// The signed eBay callback is rewritten here to reuse the existing backend
// function within the hosting plan's function limit. Express parses its raw body.
export const config = { api: { bodyParser: false } };
export default app;
