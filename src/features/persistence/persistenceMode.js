export const PERSISTENCE_MODES = Object.freeze({
  LOCAL_ONLY: "LOCAL_ONLY",
  MIGRATION_PREVIEW: "MIGRATION_PREVIEW",
  REMOTE_ACTIVE: "REMOTE_ACTIVE",
});

const VALID_MODES = new Set(Object.values(PERSISTENCE_MODES));

export class PersistenceModeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PersistenceModeError";
    this.code = code;
  }
}

export function resolvePersistenceMode(requestedMode = PERSISTENCE_MODES.LOCAL_ONLY, options = {}) {
  const mode = String(requestedMode || PERSISTENCE_MODES.LOCAL_ONLY).trim().toUpperCase();
  if (!VALID_MODES.has(mode)) {
    throw new PersistenceModeError("INVALID_PERSISTENCE_MODE", `Unsupported persistence mode: ${mode || "empty"}.`);
  }

  if (mode === PERSISTENCE_MODES.REMOTE_ACTIVE) {
    if (options.explicitRemoteActivation !== true || options.remoteActivationReason !== "OWNER_CONFIRMED_CUTOVER") {
      throw new PersistenceModeError(
        "REMOTE_ACTIVATION_REQUIRED",
        "Remote persistence requires an explicit owner-confirmed cutover. It cannot be enabled by defaults or environment discovery.",
      );
    }
  }

  return mode;
}

export function isWriteEnabledForMode(mode) {
  return mode === PERSISTENCE_MODES.LOCAL_ONLY || mode === PERSISTENCE_MODES.REMOTE_ACTIVE;
}

export function createPersistenceGateway(options = {}) {
  const mode = resolvePersistenceMode(options.mode, options);
  const localDataSource = options.localDataSource;
  const remoteDataSource = options.remoteDataSource;

  if (!localDataSource) {
    throw new PersistenceModeError("LOCAL_DATA_SOURCE_REQUIRED", "A local data source is required during the migration period.");
  }
  if (mode === PERSISTENCE_MODES.REMOTE_ACTIVE && !remoteDataSource) {
    throw new PersistenceModeError("REMOTE_DATA_SOURCE_REQUIRED", "Remote persistence was explicitly selected but no remote data source was provided.");
  }

  const activeDataSource = mode === PERSISTENCE_MODES.REMOTE_ACTIVE ? remoteDataSource : localDataSource;
  const rejectPreviewWrite = () => {
    throw new PersistenceModeError(
      "MIGRATION_PREVIEW_IS_READ_ONLY",
      "Migration Preview is read-only. No local or remote record was changed.",
    );
  };

  return Object.freeze({
    mode,
    persistenceTarget: mode === PERSISTENCE_MODES.REMOTE_ACTIVE ? "REMOTE" : "LOCAL",
    list: (...args) => activeDataSource.list(...args),
    getById: (...args) => activeDataSource.getById(...args),
    getRemoteSnapshot: async (...args) => {
      if (!remoteDataSource) return { status: "UNAVAILABLE", records: [] };
      const result = await remoteDataSource.list(...args);
      return { status: "AVAILABLE", ...result };
    },
    create: mode === PERSISTENCE_MODES.MIGRATION_PREVIEW ? rejectPreviewWrite : (...args) => activeDataSource.create(...args),
    update: mode === PERSISTENCE_MODES.MIGRATION_PREVIEW ? rejectPreviewWrite : (...args) => activeDataSource.update(...args),
    archive: mode === PERSISTENCE_MODES.MIGRATION_PREVIEW ? rejectPreviewWrite : (...args) => activeDataSource.archive(...args),
  });
}
