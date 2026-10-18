import { createHash } from "node:crypto";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { AuthPrincipal } from "../auth/authPrincipal";
import {
  MAILBOX_IMPORT_FORMAT, MAILBOX_IMPORT_LIMITS, MailboxImportError, validateMailboxImportInput,
  type MailboxImportInput, type MailboxPreview, type MailboxProvider, type MailboxReceipt, type ReceiptParserInput,
} from "./contracts";
import { isPurchaseReceiptHeader, parsePurchaseReceipt } from "./receiptParser";

// No user-supplied hostname, port, proxy, or TLS option reaches the IMAP client.
const HOSTS: Readonly<Record<MailboxProvider, string>> = Object.freeze({
  aol: "imap.aol.com", gmail: "imap.gmail.com", yahoo: "imap.mail.yahoo.com",
});

type Header = {
  uid: number;
  size?: number;
  internalDate?: Date | string;
  envelope?: { subject?: string; from?: { address?: string }[] };
  source?: Buffer;
};

export interface ReadOnlyMailboxClient {
  mailbox: false | { exists: number; uidValidity: bigint | number | string; readOnly?: boolean };
  connect(): Promise<void>;
  getMailboxLock(path: string, options: { readOnly: true }): Promise<{ release(): void }>;
  fetch(range: string, query: { uid: true; envelope: true; internalDate: true; size: true }): AsyncIterable<Header>;
  fetchOne(uid: number, query: { source: { start: number; maxLength: number } }, options: { uid: true }): Promise<Header | false | undefined>;
  close(): void;
  on(event: "error", handler: (error: unknown) => void): unknown;
}

export type MailboxClientOptions = {
  host: string;
  port: number;
  secure: true;
  auth: { user: string; pass: string };
  logger: false;
  logRaw: false;
  emitLogs: false;
  disableAutoIdle: true;
  disableCompression: true;
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
  maxLineLength: number;
  maxLiteralSize: number;
  maxResponseSize: number;
  tls: { rejectUnauthorized: true; minVersion: "TLSv1.2" };
};

type PullOptions = {
  clientFactory?: (options: MailboxClientOptions) => ReadOnlyMailboxClient;
  parseMime?: (source: Buffer) => Promise<{ text?: string; html?: string | false }>;
  parseReceipt?: (input: ReceiptParserInput) => MailboxReceipt | null;
  isReceiptHeader?: (input: { subject: string; senderAddress: string }) => boolean;
  now?: () => number;
  maximumDurationMs?: number;
};

const digest = (parts: readonly string[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");

export function mailboxAccountReference(principal: AuthPrincipal, provider: MailboxProvider, mailboxAddress: string): string {
  return `mailbox:${digest(["code3-mailbox-v1", principal.provider, principal.subject, provider, mailboxAddress.trim().toLowerCase()])}`;
}

export function mailboxMessageSourceId(accountReference: string, uidValidity: string, uid: number): string {
  return `email:${digest(["code3-mailbox-message-v1", accountReference, "INBOX", uidValidity, String(uid)])}`;
}

export function requireRealMailboxOwner(principal: AuthPrincipal, now = Date.now()): void {
  // A local-development UI preview is not authority to send credentials or read
  // a mailbox. The route must first validate a genuine owner session.
  if (!principal || principal.provider !== "supabase" || !principal.subject
    || !Number.isFinite(principal.expiresAt) || principal.expiresAt * 1_000 <= now) {
    throw new MailboxImportError("mailbox_owner_required", "Sign in with the verified owner account to preview purchase emails.", 403);
  }
}

function safeFailure(error: unknown): MailboxImportError {
  if (error instanceof MailboxImportError) return error;
  const value = error && typeof error === "object" ? error as { authenticationFailed?: boolean; code?: string; serverResponseCode?: string } : {};
  if (value.authenticationFailed || value.serverResponseCode === "AUTHENTICATIONFAILED") {
    return new MailboxImportError("mailbox_authentication_failed", "The mail provider did not accept this app password. Check the mailbox address and generate a new app password if needed.", 401);
  }
  if (["ETIMEDOUT", "ETIMEOUT", "CONNECT_TIMEOUT", "GREETING_TIMEOUT"].includes(value.code || "")) {
    return new MailboxImportError("mailbox_timeout", "The mailbox preview took too long. Try again later or use a shorter date range.", 504);
  }
  return new MailboxImportError("mailbox_unavailable", "The mailbox preview could not finish. No emails or saved records were changed.", 503);
}

export function createMailboxPull(options: PullOptions = {}) {
  const now = options.now || Date.now;
  const clientFactory = options.clientFactory || ((input: MailboxClientOptions) => new ImapFlow(input));
  const parseMime = options.parseMime || (async (source: Buffer) => {
    const parsed = await simpleParser(source, {
      skipHtmlToText: true, skipTextToHtml: true, skipImageLinks: true, skipTextLinks: true,
      maxHtmlLengthToParse: MAILBOX_IMPORT_LIMITS.bodyBytes,
    });
    return { text: parsed.text, html: parsed.html };
  });
  const parseReceipt = options.parseReceipt || parsePurchaseReceipt;
  const isReceiptHeader = options.isReceiptHeader || isPurchaseReceiptHeader;
  const maximumDurationMs = Math.min(options.maximumDurationMs || MAILBOX_IMPORT_LIMITS.durationMs, MAILBOX_IMPORT_LIMITS.durationMs);

  return async function pull(principal: AuthPrincipal, input: MailboxImportInput, signal?: AbortSignal): Promise<MailboxPreview> {
    requireRealMailboxOwner(principal, now());
    const validated = validateMailboxImportInput(input);
    if (signal?.aborted) throw new MailboxImportError("mailbox_cancelled", "Mailbox preview cancelled.", 499);
    const startedAt = now();
    const cutoff = startedAt - validated.days * 86_400_000;
    const accountReference = mailboxAccountReference(principal, validated.provider, validated.mailboxAddress);
    const auth = { user: validated.mailboxAddress, pass: validated.appPassword };
    let client: ReadOnlyMailboxClient | undefined;
    let lock: { release(): void } | undefined;
    let interrupted: MailboxImportError | null = null;
    let rejectInterruption: (error: MailboxImportError) => void = () => undefined;
    const interruption = new Promise<never>((_resolve, reject) => { rejectInterruption = reject; });
    const close = () => { try { client?.close(); } catch { /* Never expose provider errors. */ } };
    const stop = (error: MailboxImportError) => {
      if (interrupted) return;
      interrupted = error;
      close();
      rejectInterruption(error);
    };
    const abort = () => stop(new MailboxImportError("mailbox_cancelled", "Mailbox preview cancelled.", 499));
    const timeout = setTimeout(() => stop(new MailboxImportError("mailbox_timeout", "The mailbox preview took too long. Try again later or use a shorter date range.", 504)), maximumDurationMs);
    signal?.addEventListener("abort", abort, { once: true });
    const check = () => {
      if (interrupted) throw interrupted;
      if (signal?.aborted) { abort(); throw interrupted; }
      requireRealMailboxOwner(principal, now());
    };
    const work = async (): Promise<MailboxPreview> => {
      client = clientFactory({
        host: HOSTS[validated.provider], port: 993, secure: true, auth,
        logger: false, logRaw: false, emitLogs: false, disableAutoIdle: true, disableCompression: true,
        connectionTimeout: MAILBOX_IMPORT_LIMITS.connectionTimeoutMs, greetingTimeout: 5_000, socketTimeout: 10_000,
        maxLineLength: 64 * 1_024, maxLiteralSize: MAILBOX_IMPORT_LIMITS.bodyBytes,
        maxResponseSize: MAILBOX_IMPORT_LIMITS.bodyBytes + 64 * 1_024,
        tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
      });
      client.on("error", (error) => stop(safeFailure(error)));
      check();
      await client.connect();
      check();
      lock = await client.getMailboxLock("INBOX", { readOnly: true });
      check();
      const mailbox = client.mailbox;
      if (!mailbox || mailbox.readOnly !== true || !Number.isSafeInteger(mailbox.exists) || mailbox.exists < 0
        || !/^[1-9][0-9]{0,19}$/.test(String(mailbox.uidValidity))) {
        throw new MailboxImportError("mailbox_unavailable", "The mailbox did not confirm safe read-only access.", 503);
      }
      const uidValidity = String(mailbox.uidValidity);
      let scannedMessages = 0;
      let bodies = 0;
      let totalBodyBytes = 0;
      let truncated = mailbox.exists > MAILBOX_IMPORT_LIMITS.messages;
      const headers: Header[] = [];
      // A sequence window bounds server work even on providers without ESEARCH.
      // UIDs are retained for body reads, so expunges cannot rebind a receipt.
      if (mailbox.exists > 0) {
        const start = Math.max(1, mailbox.exists - MAILBOX_IMPORT_LIMITS.messages + 1);
        for await (const header of client.fetch(`${start}:${mailbox.exists}`, { uid: true, envelope: true, internalDate: true, size: true })) {
          check();
          if (++scannedMessages > MAILBOX_IMPORT_LIMITS.messages) throw new MailboxImportError("mailbox_unavailable", "The mailbox returned more messages than requested.", 503);
          // Keep only bounded fields needed below, not all envelope addresses
          // or unrelated mailbox metadata returned by the provider.
          const subject = header.envelope?.subject;
          const senders = header.envelope?.from;
          if (typeof subject !== "string" || subject.length > 1_024 || senders?.length !== 1
            || typeof senders[0].address !== "string" || senders[0].address.length > 320) continue;
          headers.push({ uid: header.uid, size: header.size, internalDate: header.internalDate,
            envelope: { subject, from: [{ address: senders[0].address }] } });
        }
      }
      const candidates: MailboxReceipt[] = [];
      const seen = new Set<number>();
      for (const header of headers.reverse()) {
        check();
        if (!Number.isSafeInteger(header.uid) || header.uid < 1 || seen.has(header.uid)) continue;
        seen.add(header.uid);
        const received = new Date(header.internalDate || "").getTime();
        const subject = header.envelope?.subject || "";
        const senders = header.envelope?.from || [];
        if (!Number.isFinite(received) || received < cutoff || received > startedAt
          || subject.length > 2_000 || senders.length !== 1) continue;
        const senderAddress = senders[0].address || "";
        if (!isReceiptHeader({ subject, senderAddress })) continue;
        if (bodies >= MAILBOX_IMPORT_LIMITS.bodies || !Number.isSafeInteger(header.size) || Number(header.size) < 1
          || Number(header.size) > MAILBOX_IMPORT_LIMITS.bodyBytes
          || totalBodyBytes + Number(header.size) > MAILBOX_IMPORT_LIMITS.totalBodyBytes) {
          truncated = true;
          continue;
        }
        bodies += 1;
        const maxLength = Math.min(MAILBOX_IMPORT_LIMITS.bodyBytes, MAILBOX_IMPORT_LIMITS.totalBodyBytes - totalBodyBytes);
        const message = await client.fetchOne(header.uid, { source: { start: 0, maxLength } }, { uid: true });
        check();
        if (!message || !Buffer.isBuffer(message.source)) continue;
        const source = message.source;
        totalBodyBytes += source.length;
        if (totalBodyBytes > MAILBOX_IMPORT_LIMITS.totalBodyBytes) { truncated = true; break; }
        if (message.uid !== header.uid) continue;
        // Never classify a truncated MIME document as complete purchase evidence.
        if (source.length !== header.size || source.length > MAILBOX_IMPORT_LIMITS.bodyBytes
          || totalBodyBytes > MAILBOX_IMPORT_LIMITS.totalBodyBytes) { truncated = true; continue; }
        let parsed: { text?: string; html?: string | false };
        try { parsed = await parseMime(source); } catch { continue; }
        check();
        const candidate = parseReceipt({
          sourceId: mailboxMessageSourceId(accountReference, uidValidity, header.uid),
          provider: validated.provider, accountReference, receivedAt: new Date(received).toISOString(),
          subject, senderAddress,
          text: typeof parsed.text === "string" ? parsed.text.slice(0, MAILBOX_IMPORT_LIMITS.bodyBytes) : "",
          html: typeof parsed.html === "string" ? parsed.html.slice(0, MAILBOX_IMPORT_LIMITS.bodyBytes) : "",
        });
        if (candidate) candidates.push(candidate);
      }
      check();
      return Object.freeze({
        format: MAILBOX_IMPORT_FORMAT, candidates: Object.freeze(candidates), scannedMessages,
        skippedMessages: scannedMessages - candidates.length, truncated, days: validated.days,
      });
    };
    try {
      return await Promise.race([work(), interruption]);
    } catch (error) {
      throw safeFailure(error);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      // Stop the socket even if provider logout is unavailable or unresponsive.
      // Closing a read-only connection never deletes or marks a message read.
      try { lock?.release(); } catch { /* No provider diagnostic data is returned. */ }
      close();
      auth.pass = "";
      input.appPassword = "";
      validated.appPassword = "";
    }
  };
}
