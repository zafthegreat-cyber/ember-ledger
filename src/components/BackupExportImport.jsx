export default function BackupExportImport({
  storageStatus,
  importPreview,
  importMessage,
  onExport,
  onImportFile,
  onApplyImport,
  onClearDemoData,
}) {
  return (
    <section className="backup-panel">
      <div className="beta-data-note">
        <strong>Beta data note</strong>
        <span>Your beta data is stored on this device unless you export it or connect cloud sync.</span>
      </div>

      <div className="backup-actions">
        <button type="button" className="drawer-link" onClick={onExport}>
          Export Beta Data
        </button>
        <label className="drawer-link backup-file-label">
          Import Backup
          <input type="file" accept="application/json,.json" onChange={onImportFile} />
        </label>
        <button type="button" className="drawer-link drawer-danger-link" onClick={onClearDemoData}>
          Clear Demo Data
        </button>
      </div>

      <details className="storage-status-card">
        <summary>Storage Status</summary>
        <dl>
          {storageStatus.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      </details>

      {importPreview ? (
        <div className="backup-preview">
          <h4>Backup Preview</h4>
          <p>{importPreview.fileName}</p>
          <ul>
            {importPreview.summary.map((item) => (
              <li key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </li>
            ))}
          </ul>
          <p className="compact-subtitle">
            Importing will update this device only. Choose merge to add backup records to your current data, or replace
            to overwrite the current local beta data.
          </p>
          <div className="backup-import-actions">
            <button type="button" onClick={() => onApplyImport("merge")}>Merge Backup</button>
            <button type="button" className="secondary-button" onClick={() => onApplyImport("replace")}>Replace Local Data</button>
          </div>
        </div>
      ) : null}

      {importMessage ? <p className="backup-message">{importMessage}</p> : null}
    </section>
  );
}
