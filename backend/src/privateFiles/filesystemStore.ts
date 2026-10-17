import { randomUUID } from "node:crypto";
import { mkdir, lstat, open, readFile, rename, unlink, type FileHandle } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import type { OwnerContext } from "../code3/types";
import { PRIVATE_FILE_FORMAT, PRIVATE_FILE_LIMITS, fileError, type PrivateFileState, type PrivateFileStore } from "./contracts";
import { digest, validateStoredFile } from "./validation";

const MAX_STATE_BYTES = 48 * 1024 * 1024;
const code = (error: unknown) => error && typeof error === "object" && "code" in error ? error.code : "";

/** Explicitly constructed private filesystem adapter. Never place its root in a web-served directory.
 * Each owner document contains metadata and bytes together; a rename publishes one complete revision.
 * Exclusive lock files coordinate independent instances. A crashed lock fails closed and is never stolen.
 * Node file flushes are used; host filesystem/power-loss guarantees still require deployment validation.
 */
export class FilesystemPrivateFileStore implements PrivateFileStore {
  private readonly root: string;
  constructor(root: string) {
    if (!isAbsolute(root)) throw new Error("A private absolute storage directory is required.");
    this.root = resolve(root);
  }

  private async directory(owner: OwnerContext) {
    if (!owner?.ownerSubject || owner.ownerSubject !== `${owner.principal.provider}:${owner.principal.subject}`) throw fileError("owner_required", 401, "Sign in is required.");
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    if (!(await lstat(this.root)).isDirectory() || (await lstat(this.root)).isSymbolicLink()) throw fileError("file_store_unavailable", 503, "Private file storage is unavailable.");
    const ownerHash = digest(owner.ownerSubject);
    const directory = join(this.root, ownerHash);
    await mkdir(directory, { mode: 0o700 }).catch((error) => { if (code(error) !== "EEXIST") throw error; });
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw fileError("file_store_unavailable", 503, "Private file storage is unavailable.");
    return { directory, ownerHash };
  }

  private async load(directory: string, ownerHash: string): Promise<PrivateFileState> {
    const path = join(directory, "files.json");
    try {
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_STATE_BYTES) throw new Error("Invalid document");
      const state = JSON.parse(await readFile(path, "utf8")) as PrivateFileState;
      if (state.format !== PRIVATE_FILE_FORMAT || state.ownerHash !== ownerHash || !Number.isSafeInteger(state.revision) || state.revision < 0
        || !Array.isArray(state.files) || state.files.length > PRIVATE_FILE_LIMITS.files || !Array.isArray(state.receipts) || state.receipts.length > 4096
        || Object.keys(state).some((key) => !["format", "ownerHash", "revision", "files", "receipts"].includes(key))) throw new Error("Invalid document");
      state.files = state.files.map(validateStoredFile);
      if (new Set(state.files.map((file) => file.id)).size !== state.files.length) throw new Error("Duplicate identity");
      return state;
    } catch (error) {
      if (code(error) === "ENOENT") return { format: PRIVATE_FILE_FORMAT, ownerHash, revision: 0, files: [], receipts: [] };
      throw fileError("file_store_unreadable", 503, "Private file storage is unreadable. Existing files have not been replaced.");
    }
  }

  async read(owner: OwnerContext) {
    const { directory, ownerHash } = await this.directory(owner);
    // Reads participate in the same lock to avoid presenting a stale restore/export snapshot.
    return this.exclusive(directory, () => this.load(directory, ownerHash));
  }

  private async exclusive<T>(directory: string, operation: () => Promise<T>): Promise<T> {
    const path = join(directory, "operation.lock");
    let lock: FileHandle;
    try { lock = await open(path, "wx", 0o600); }
    catch (error) {
      if (code(error) === "EEXIST") throw fileError("file_operation_pending", 409, "Another file operation is pending. Retry after it finishes; an interrupted operation requires storage review.");
      throw fileError("file_store_unavailable", 503, "Private file storage is unavailable.");
    }
    try { return await operation(); }
    finally { await lock.close(); await unlink(path); }
  }

  async transaction<T>(owner: OwnerContext, operation: (state: PrivateFileState) => Promise<T>) {
    const { directory, ownerHash } = await this.directory(owner);
    return this.exclusive(directory, async () => {
      const state = await this.load(directory, ownerHash);
      const result = await operation(state);
      state.revision += 1;
      const payload = JSON.stringify(state);
      if (Buffer.byteLength(payload) > MAX_STATE_BYTES || state.receipts.length > 4096) throw fileError("file_store_full", 409, "Private file storage is full. Export and review existing files before continuing.");
      const temporary = join(directory, `${randomUUID()}.pending`);
      const handle = await open(temporary, "wx", 0o600);
      let published = false;
      try {
        await handle.writeFile(payload, "utf8");
        await handle.sync();
        await handle.close();
        await rename(temporary, join(directory, "files.json"));
        published = true;
      } finally {
        await handle.close().catch(() => undefined);
        if (!published) await unlink(temporary).catch(() => undefined);
      }
      // Surface an unreadable or unexpected commit as failure; never claim a verified backup from it.
      const readback = await this.load(directory, ownerHash);
      if (JSON.stringify(readback) !== payload) throw fileError("file_commit_unverified", 503, "The file save could not be verified. Reload before retrying.");
      return result;
    });
  }
}
