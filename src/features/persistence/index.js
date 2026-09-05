export {
  PERSISTENCE_MODES,
  PersistenceModeError,
  resolvePersistenceMode,
  isWriteEnabledForMode,
  createPersistenceGateway,
} from "./persistenceMode.js";

export {
  DataSourceError,
  assertClientCannotSelectOwner,
  assertCanonicalDataSource,
  createLocalCollectionDataSource,
  createRemoteHttpDataSource,
} from "./dataSources.js";

export {
  CANONICAL_DOMAINS,
  MIGRATION_SOURCE_CLASSIFICATIONS,
  MIGRATION_SOURCE_REGISTRY,
  getMigrationSource,
  classifyMigrationSources,
  extractMigrationCandidates,
  validateMigrationSourceRegistry,
} from "./migrationSourceRegistry.js";

export {
  MONEY_PREVIEW_STATUS,
  CURRENCY_MINOR_DIGITS,
  LEGACY_MONEY_FIELDS,
  previewMoneyToMinor,
  inspectRecordMoney,
  validateCanonicalMoney,
} from "./moneyConversion.js";

export {
  FILE_ASSET_METADATA_VERSION,
  validateFileAssetMetadata,
} from "./fileAsset.js";

export {
  CANONICAL_INPUT_LIMITS,
  CANONICAL_STATUS_CONTRACT,
  CANONICAL_RELATION_CONTRACT,
  IMMUTABLE_CANONICAL_DOMAINS,
  NEGATIVE_AMOUNT_DOMAINS,
  NEGATIVE_QUANTITY_DOMAINS,
  normalizeLegacyStatus,
  validateCanonicalWireInput,
  isCanonicalUuid,
} from "./canonicalWireContract.js";

export {
  REMOTE_BACKUP_EXPORT_FORMAT,
  REMOTE_BACKUP_EXPORT_VERSION,
  REMOTE_BACKUP_STATES,
  REMOTE_BACKUP_COVERAGE,
  validateRemoteBackupExport,
  createUnavailableRemoteBackupAdapter,
  createRemoteBackupExportAdapter,
  remoteCoverageState,
} from "./remoteBackupAdapter.js";

export {
  MIGRATION_PREVIEW_STATUSES,
  MIGRATION_ACTIONS,
  MIGRATION_PLAN_FORMAT,
  MIGRATION_PLAN_VERSION,
  CANONICAL_PERSISTENCE_TARGET,
  createMigrationPreview,
  runLocalMigrationPreview,
  assertMigrationPlanIsReadOnly,
  toCanonicalDryRunRequest,
} from "./migrationPreview.js";
