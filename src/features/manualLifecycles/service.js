import { createCollectionLifecycleActions } from './collectionActions.js';
import { buildLifecycleRecord, validateLifecycleTransition } from "./contracts.js";

export function createManualLifecycleService(repository, { now = () => new Date().toISOString(), makeId = () => `operation-${globalThis.crypto.randomUUID()}`, isOwnerAuthorized = () => false } = {}) {
  const collectionActions=createCollectionLifecycleActions(repository,{isOwnerAuthorized,now,makeId});
  return Object.freeze({
    moveAssignment: collectionActions.moveAssignment,
    previewReturn(returnId) { return repository.previewSaleReturn(returnId, { isOwnerAuthorized }); },
    applyReturn(command) { return repository.applySaleReturn(command, { isOwnerAuthorized, now }); },
    previewReturnCorrection(returnId, proposal) { return repository.previewReturnCorrection(returnId, proposal, { isOwnerAuthorized }); },
    applyReturnCorrection(command) { return repository.applyReturnCorrection(command, { isOwnerAuthorized, now }); },
    // Build-11 fix: a refunded purchase return can mark the linked inventory as
    // returned in one tap. It only touches status/disposition on items that
    // came from that purchase and are not sold; quantities and costs stay so
    // the purchase history still reconciles.
    async markPurchaseReturned(returnId) {
      return repository.runLocked(() => {
        const current = repository.load();
        if (repository.getLastError()) throw new Error(repository.getLastError());
        const record = (current.manualLifecycles || []).find((row) => row.id === returnId && row.type === "purchaseReturn");
        if (!record) throw new Error("That return record is missing. Reload the current records.");
        if (!["Refunded", "Closed"].includes(record.status)) throw new Error("Mark items returned once the refund is recorded.");
        const stamp = now();
        let changed = 0;
        const inventory = current.inventory.map((item) => {
          if (item.purchaseId !== record.purchaseId) return item;
          if (/sold|returned|disposed/i.test(String(item.currentStatus || item.status || ""))) return item;
          changed += 1;
          return { ...item, status: "Returned", currentStatus: "Returned", disposition: "Returned to seller", returnedAt: stamp, returnRecordId: record.id, updatedAt: stamp };
        });
        if (!changed) return { changed: 0, state: current };
        const result = repository.save({ ...current, inventory });
        if (result.error) throw new Error(result.error);
        return { changed, state: result.state };
      });
    },
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
