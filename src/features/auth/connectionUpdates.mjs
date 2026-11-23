// Refresh observers only after the existing callback verification has succeeded.
// No identity, session token, or account record is stored in this signal.
export function withConnectionUpdates(service) {
  const listeners = new Set();
  return {
    ...service,
    subscribeConnections(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async finish(callback) {
      const result = await service.finish(callback);
      for (const listener of listeners) listener();
      return result;
    },
  };
}
