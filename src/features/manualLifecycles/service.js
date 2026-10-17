import { buildLifecycleRecord, validateLifecycleTransition } from "./contracts.js";

export function createManualLifecycleService(repository, { now = () => new Date().toISOString(), makeId = () => `operation-${globalThis.crypto.randomUUID()}`, isOwnerAuthorized = () => false } = {}) {
  return Object.freeze({
    previewReturn(returnId) { return repository.previewSaleReturn(returnId, { isOwnerAuthorized }); },
    applyReturn(command) { return repository.applySaleReturn(command, { isOwnerAuthorized, now }); },
    previewReturnCorrection(returnId, proposal) { return repository.previewReturnCorrection(returnId, proposal, { isOwnerAuthorized }); },
    applyReturnCorrection(command) { return repository.applyReturnCorrection(command, { isOwnerAuthorized, now }); },
    async save(type, values, { id = "", expectedVersion = 0 } = {}) {
      return repository.runLocked(() => {
        const current = repository.load();
        if (repository.getLastError()) throw new Error(repository.getLastError());
        const previous = current.manualLifecycles.find((row) => row.id === id);
        if ((id && !previous) || (previous?.recordVersion || 0) !== expectedVersion || (previous && previous.type !== type)) throw new Error("This record changed. Reload it before saving; your draft has been preserved.");
        const record = buildLifecycleRecord(type, values, previous, { id: id || makeId(), at: now() });
        const next = { ...current, manualLifecycles: previous ? current.manualLifecycles.map((row) => row.id === id ? record : row) : [...current.manualLifecycles, record] };
        validateLifecycleTransition(current, next);
        const result = repository.save(next);
        if (result.error) throw new Error(result.error);
        return { record, state: result.state };
      });
    },
  });
}
