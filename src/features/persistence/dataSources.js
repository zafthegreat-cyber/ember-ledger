const REQUIRED_DATA_SOURCE_METHODS = Object.freeze(["list", "getById", "create", "update", "archive"]);
const PROHIBITED_OWNER_FIELDS = new Set(["owner", "ownerSubject", "owner_subject", "ownerId", "owner_id"]);

export class DataSourceError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "DataSourceError";
    this.code = code;
    this.details = details;
    if (code === "VERSION_CONFLICT") this.status = 409;
  }
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function assertPlainRecord(value, label = "Record") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DataSourceError("INVALID_RECORD", `${label} must be a plain object.`);
  }
  for (const key of Object.keys(value)) {
    if (["__proto__", "constructor", "prototype"].includes(key)) {
      throw new DataSourceError("PROHIBITED_FIELD", `${label} contains a prohibited field.`);
    }
  }
}

export function assertClientCannotSelectOwner(value) {
  assertPlainRecord(value);
  const suppliedOwnerField = Object.keys(value).find((key) => PROHIBITED_OWNER_FIELDS.has(key));
  if (suppliedOwnerField) {
    throw new DataSourceError(
      "CLIENT_OWNER_FIELD_REJECTED",
      "Owner identity is derived by the server and cannot be selected by the client.",
      { field: suppliedOwnerField },
    );
  }
}

export function assertCanonicalDataSource(dataSource) {
  if (!dataSource || typeof dataSource !== "object") {
    throw new DataSourceError("INVALID_DATA_SOURCE", "A canonical data source object is required.");
  }
  for (const method of REQUIRED_DATA_SOURCE_METHODS) {
    if (typeof dataSource[method] !== "function") {
      throw new DataSourceError("INVALID_DATA_SOURCE", `Canonical data source is missing ${method}().`);
    }
  }
  return dataSource;
}

function normalizeLimit(value, maximum = 100) {
  const parsed = Number(value ?? 50);
  if (!Number.isInteger(parsed) || parsed < 1) return 50;
  return Math.min(parsed, maximum);
}

function sortableCreatedAt(record) {
  const value = String(record?.createdAt || "");
  return Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : "1970-01-01T00:00:00.000Z";
}

function encodeLocalCursor(record) {
  return `local:${encodeURIComponent(sortableCreatedAt(record))}|${encodeURIComponent(String(record?.id || ""))}`;
}

function decodeLocalCursor(cursor) {
  if (!cursor) return null;
  const match = /^local:([^|]+)\|(.+)$/.exec(String(cursor));
  if (!match) throw new DataSourceError("INVALID_CURSOR", "The pagination cursor is invalid.");
  try {
    const createdAt = decodeURIComponent(match[1]);
    const id = decodeURIComponent(match[2]);
    if (!Number.isFinite(Date.parse(createdAt)) || !id) throw new Error("invalid cursor values");
    return { createdAt: new Date(createdAt).toISOString(), id };
  } catch {
    throw new DataSourceError("INVALID_CURSOR", "The pagination cursor is invalid.");
  }
}

function followsCursor(record, cursor) {
  if (!cursor) return true;
  const createdAt = sortableCreatedAt(record);
  const id = String(record?.id || "");
  return createdAt > cursor.createdAt || (createdAt === cursor.createdAt && id > cursor.id);
}

export function createLocalCollectionDataSource(options = {}) {
  const repository = options.repository;
  const collection = String(options.collection || "");
  if (!repository?.load || !repository?.save || !collection) {
    throw new DataSourceError("INVALID_LOCAL_ADAPTER", "Local adapters require a repository and collection name.");
  }
  const now = options.now || (() => new Date().toISOString());
  const idFactory = options.idFactory || (() => globalThis.crypto?.randomUUID?.());

  function loadRows() {
    const state = repository.load();
    if (!Array.isArray(state?.[collection])) {
      throw new DataSourceError("INVALID_LOCAL_COLLECTION", `Local collection ${collection} is unavailable.`);
    }
    return { state, rows: state[collection] };
  }

  const adapter = {
    kind: "LOCAL",
    collection,
    async list(query = {}) {
      const { rows } = loadRows();
      const limit = normalizeLimit(query.limit);
      const cursor = decodeLocalCursor(query.cursor);
      const sorted = [...rows]
        .filter((record) => query.includeArchived === true || !record?.archivedAt)
        .filter((record) => !query.status || record?.status === query.status)
        .filter((record) => followsCursor(record, cursor))
        .sort((left, right) => sortableCreatedAt(left).localeCompare(sortableCreatedAt(right))
          || String(left?.id || "").localeCompare(String(right?.id || "")));
      const page = sorted.slice(0, limit + 1);
      const records = page.slice(0, limit).map(clone);
      const last = records.at(-1);
      return {
        records,
        nextCursor: page.length > limit && last ? encodeLocalCursor(last) : null,
      };
    },
    async getById(id) {
      const { rows } = loadRows();
      return clone(rows.find((record) => String(record?.id) === String(id)) || null);
    },
    async create(input) {
      assertClientCannotSelectOwner(input);
      const { state, rows } = loadRows();
      const timestamp = now();
      const id = String(input.id || idFactory?.() || "").trim();
      if (!id) throw new DataSourceError("STABLE_ID_REQUIRED", "A stable record ID is required.");
      if (rows.some((record) => String(record?.id) === id)) {
        throw new DataSourceError("DUPLICATE_ID", `A record with ID ${id} already exists.`);
      }
      const record = { ...clone(input), id, recordVersion: 1, createdAt: input.createdAt || timestamp, updatedAt: timestamp };
      repository.save({ ...state, [collection]: [...rows, record] });
      return clone(record);
    },
    async update(id, input, expectedVersion) {
      assertClientCannotSelectOwner(input);
      const { state, rows } = loadRows();
      const index = rows.findIndex((record) => String(record?.id) === String(id));
      if (index < 0) throw new DataSourceError("NOT_FOUND", "The requested record was not found.");
      const current = rows[index];
      const currentVersion = Number.isInteger(current.recordVersion) ? current.recordVersion : 1;
      if (!Number.isInteger(expectedVersion) || expectedVersion !== currentVersion) {
        throw new DataSourceError("VERSION_CONFLICT", "The record changed after it was loaded.", {
          recordId: String(id),
          currentVersion,
          updatedAt: current.updatedAt || null,
          conflictType: "STALE_VERSION",
        });
      }
      const updated = {
        ...current,
        ...clone(input),
        id: current.id,
        recordVersion: currentVersion + 1,
        updatedAt: now(),
      };
      const nextRows = [...rows];
      nextRows[index] = updated;
      repository.save({ ...state, [collection]: nextRows });
      return clone(updated);
    },
    async archive(id, expectedVersion) {
      return adapter.update(id, { status: "ARCHIVED", archivedAt: now() }, expectedVersion);
    },
  };

  return Object.freeze(assertCanonicalDataSource(adapter));
}

function queryString(query = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === "") continue;
    params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

export function createRemoteHttpDataSource(options = {}) {
  const request = options.request;
  const route = String(options.route || "").replace(/\/$/, "");
  if (typeof request !== "function" || !route.startsWith("/api/code3/")) {
    throw new DataSourceError("INVALID_REMOTE_ADAPTER", "Remote adapters require an owner-authorized Code 3 API request function and route.");
  }

  async function send(path, init) {
    const requestInit = {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers || {}),
      },
      ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    };
    const response = await request(`${route}${path}`, requestInit);
    if (!response || typeof response !== "object") {
      throw new DataSourceError("INVALID_REMOTE_RESPONSE", "The remote repository returned an invalid response.");
    }
    const isHttpResponse = typeof response.json === "function";
    const payload = isHttpResponse ? await response.json() : response;
    const failed = isHttpResponse ? response.ok === false : payload.ok === false;
    if (failed) {
      const remoteError = payload?.error || {};
      const status = Number(response.status || remoteError.status || 0);
      const normalizedCode = status === 409 && remoteError.conflict
        ? "VERSION_CONFLICT"
        : remoteError.code || "REMOTE_REQUEST_FAILED";
      const error = new DataSourceError(
        normalizedCode,
        remoteError.message || "The remote repository request failed.",
        { ...(remoteError.conflict || {}), ...(remoteError.code ? { remoteCode: remoteError.code } : {}) },
      );
      error.status = status;
      throw error;
    }
    if (!payload || payload.ok !== true) {
      throw new DataSourceError("INVALID_REMOTE_RESPONSE", "The remote repository returned an invalid response envelope.");
    }
    return payload;
  }

  return Object.freeze(assertCanonicalDataSource({
    kind: "REMOTE",
    route,
    async list(query = {}) {
      const payload = await send(queryString(query), { method: "GET", cache: "no-store" });
      if (!Array.isArray(payload.records)) throw new DataSourceError("INVALID_REMOTE_RESPONSE", "Remote list response is missing records.");
      return { records: clone(payload.records), nextCursor: payload.nextCursor || null };
    },
    async getById(id) {
      const payload = await send(`/${encodeURIComponent(String(id))}`, { method: "GET", cache: "no-store" });
      if (!payload.record || typeof payload.record !== "object") throw new DataSourceError("INVALID_REMOTE_RESPONSE", "Remote get response is missing a record.");
      return clone(payload.record);
    },
    async create(input) {
      assertClientCannotSelectOwner(input);
      const payload = await send("", { method: "POST", body: clone(input) });
      if (!payload.record || typeof payload.record !== "object") throw new DataSourceError("INVALID_REMOTE_RESPONSE", "Remote create response is missing a record.");
      return clone(payload.record);
    },
    async update(id, input, expectedVersion) {
      assertClientCannotSelectOwner(input);
      const payload = await send(`/${encodeURIComponent(String(id))}`, {
        method: "PATCH",
        body: { ...clone(input), expectedVersion },
      });
      if (!payload.record || typeof payload.record !== "object") throw new DataSourceError("INVALID_REMOTE_RESPONSE", "Remote update response is missing a record.");
      return clone(payload.record);
    },
    async archive(id, expectedVersion) {
      const payload = await send(`/${encodeURIComponent(String(id))}/archive`, {
        method: "POST",
        body: { expectedVersion },
      });
      if (!payload.record || typeof payload.record !== "object") throw new DataSourceError("INVALID_REMOTE_RESPONSE", "Remote archive response is missing a record.");
      return clone(payload.record);
    },
  }));
}
