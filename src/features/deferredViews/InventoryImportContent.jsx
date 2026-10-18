import { PrivateStorageImage } from "../../components/PrivateReceipt.jsx";
// Rendering is deferred; the owning App retains record state and action handlers.
export default function InventoryImportContent({ scope }) {
  const {
    BATCH_INTAKE_MODES,
    Field,
    IMPORT_CONDITION_OPTIONS,
    IMPORT_DESTINATION_OPTIONS,
    IMPORT_DUPLICATE_ACTIONS,
    IMPORT_FIELD_OPTIONS,
    IMPORT_SOURCE_GUIDES,
    addCatalogProductToImportBatch,
    addManualImportRow,
    applyImportBulkUpdates,
    batchIntakeMode,
    catalogExpansionName,
    catalogImage,
    catalogProductTypeLabel,
    catalogTitle,
    closeFlowModal,
    confirmInventoryImport,
    createManualCatalogItemFromImport,
    defaultImportDestination,
    findImportDuplicate,
    getImportSourceGuide,
    handleImportFileUpload,
    importAssistantOpen,
    importBatchMessage,
    importBulkApply,
    importCatalogSearch,
    importCatalogSearchResults,
    importColumnHeaders,
    importColumnMapping,
    importConfidenceLabel,
    importFileName,
    importLastBatchResult,
    importLink,
    importManualRow,
    importOptions,
    importRows,
    importSourceType,
    importText,
    removeImportRow,
    renderProductImageFallback,
    runImportParse,
    selectImportRowCatalogMatch,
    setBatchIntakeMode,
    setImportBulkApply,
    setImportCatalogSearch,
    setImportColumnMapping,
    setImportLink,
    setImportManualRow,
    setImportOptions,
    setImportRows,
    setImportSourceType,
    setImportText,
    updateImportRow,
  } = scope;

  function renderInventoryImportAssistant() {
    if (!importAssistantOpen) return null;
    const currentGuide = getImportSourceGuide();
    const sourceOptions = IMPORT_SOURCE_GUIDES.filter((guide) => guide.mode === batchIntakeMode || guide.value === importSourceType);
    const reviewableRows = importRows.filter((row) => row.importStatus !== "skipped" && row.destination !== "Skip");
    const unresolvedRows = reviewableRows.filter((row) => row.needsReview && row.importStatus !== "reviewed");
    const duplicateCount = reviewableRows.reduce((count, row) => {
      const destinations = row.destination === "Both" ? ["Forge", "Vault"] : [row.destination || defaultImportDestination()];
      return count + (destinations.some((destination) => destination !== "Skip" && findImportDuplicate(row, destination)) ? 1 : 0);
    }, 0);
    return (
      <section className="panel import-assistant-panel batch-intake-panel">
        <div className="compact-card-header">
          <div>
            <h2>{batchIntakeMode === BATCH_INTAKE_MODES.BULK_ADD ? "Bulk Add Review" : "Import / Transfer Collection"}</h2>
            <p>Input, parse, match, review, choose destination, then confirm. Nothing is saved until you approve the batch.</p>
          </div>
          <button type="button" className="secondary-button" onClick={() => closeFlowModal()}>Close</button>
        </div>

        <div className="quick-action-rail">
          <button
            type="button"
            className={batchIntakeMode === BATCH_INTAKE_MODES.TRANSFER ? "primary" : "secondary-button"}
            onClick={() => {
              setBatchIntakeMode(BATCH_INTAKE_MODES.TRANSFER);
              if (importSourceType.startsWith("bulk_")) setImportSourceType("spreadsheet_csv");
            }}
          >
            Transfer Collection
          </button>
          <button
            type="button"
            className={batchIntakeMode === BATCH_INTAKE_MODES.BULK_ADD ? "primary" : "secondary-button"}
            onClick={() => {
              setBatchIntakeMode(BATCH_INTAKE_MODES.BULK_ADD);
              if (!importSourceType.startsWith("bulk_")) setImportSourceType("bulk_paste");
            }}
          >
            Bulk Add
          </button>
        </div>

        <div className="cards mini-cards">
          <div className="card"><p>Source</p><h2>{currentGuide.label}</h2></div>
          <div className="card"><p>Review Rows</p><h2>{importRows.length}</h2></div>
          <div className="card"><p>Needs Review</p><h2>{unresolvedRows.length}</h2></div>
          <div className="card"><p>Duplicate Warnings</p><h2>{duplicateCount}</h2></div>
        </div>

        <div className="form">
          <Field label="Import Source">
            <select value={importSourceType} onChange={(event) => setImportSourceType(event.target.value)}>
              {sourceOptions.map((guide) => (
                <option key={guide.value} value={guide.value}>{guide.label}</option>
              ))}
            </select>
          </Field>
          <div className="drawer-info-card">
            <strong>{currentGuide.instructions}</strong>
            <p className="compact-subtitle">Best format: {currentGuide.bestFormat}</p>
          </div>
          {batchIntakeMode === BATCH_INTAKE_MODES.BULK_ADD ? (
            <div className="small-empty-state">
              <strong>Bulk import mapping is coming soon.</strong>
              <span>You can paste rows or add multiple manual items now; each row still gets reviewed before anything saves.</span>
            </div>
          ) : null}
          {importSourceType !== "no_tracker" ? (
            <Field label="Upload File">
              <input type="file" accept=".csv,.txt,.tsv,.xlsx,.xls,.pdf,image/*" onChange={handleImportFileUpload} />
            </Field>
          ) : null}
          {importFileName ? <p className="compact-subtitle">Selected file: {importFileName}</p> : null}
          {importColumnHeaders.length ? (
            <details className="forge-import-mapping" open>
              <summary>Column mapping</summary>
              <div className="forge-import-columns">
                {importColumnHeaders.map((header, index) => (
                  <label key={`${header}-${index}`} className="mapping-column-row">
                    <span>{header || `Column ${index + 1}`}</span>
                    <select
                      value={importColumnMapping[index] || ""}
                      onChange={(event) => setImportColumnMapping((current) => ({ ...current, [index]: event.target.value }))}
                    >
                      <option value="">Ignore</option>
                      {IMPORT_FIELD_OPTIONS.map((field) => <option key={field.value} value={field.value}>{field.label}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </details>
          ) : null}
          <Field label={importSourceType === "photo_reference" ? "Type visible text from photo/screenshot" : "Paste Text / List"}>
            <textarea
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder={"Example:\nName,Quantity,Cost Paid,Market Value,MSRP,Product Type,Set,Condition,Notes\nPrismatic Evolutions ETB,2,59.99,90,49.99,Elite Trainer Box,Prismatic Evolutions,Sealed,Keep one\n2x Surging Sparks Booster Bundle"}
            />
          </Field>
          {batchIntakeMode === BATCH_INTAKE_MODES.TRANSFER ? (
          <Field label="Paste inventory/collection link">
            <input value={importLink} onChange={(event) => setImportLink(event.target.value)} placeholder="Google Sheets, Excel/OneDrive, TCGPlayer, PriceCharting, Collectr, eBay, Whatnot export link" />
          </Field>
          ) : null}
          {importSourceType === "link" ? (
            <div className="empty-state">
              <h3>Link import beta</h3>
              <p>Save source link, then attempt import if supported. Automatic link import is coming soon. You can paste the list or upload a CSV for now.</p>
              <p className="compact-subtitle">Later examples: Google Sheets, Excel/OneDrive, TCGPlayer collection/export, PriceCharting collection/export, Collectr export, eBay inventory/drafts export, and Whatnot inventory/export if available.</p>
            </div>
          ) : null}
        </div>

        <div className="quick-actions">
          <button type="button" onClick={runImportParse}>Parse and Review Matches</button>
          <button type="button" className="secondary-button" onClick={() => setImportRows([])}>Clear Review</button>
        </div>

        <details className="forge-form-step forge-optional-details" open={batchIntakeMode === BATCH_INTAKE_MODES.BULK_ADD}>
          <summary>Bulk Add: search and manual rows</summary>
          <div className="form">
            <Field label="Search catalog and add to batch">
              <input value={importCatalogSearch} onChange={(event) => setImportCatalogSearch(event.target.value)} placeholder="Search Market Watch catalog..." />
            </Field>
            {importCatalogSearchResults.length ? (
              <div className="catalog-picker-grid">
                {importCatalogSearchResults.map((product) => (
                  <button key={product.id || catalogTitle(product)} type="button" className="catalog-picker-card" onClick={() => addCatalogProductToImportBatch(product)}>
                    <div className="catalog-thumb">
                      {catalogImage(product) ? (
                        <>
                          <PrivateStorageImage
                            src={catalogImage(product)}
                            alt=""
                            onError={(event) => {
                              event.currentTarget.style.display = "none";
                              event.currentTarget.nextElementSibling?.removeAttribute("hidden");
                            }}
                          />
                          {renderProductImageFallback(product, { hidden: true })}
                        </>
                      ) : (
                        renderProductImageFallback(product)
                      )}
                    </div>
                    <span className="catalog-picker-copy">
                      <strong>{catalogTitle(product)}</strong>
                      <small>{catalogProductTypeLabel(product)}{catalogExpansionName(product) ? ` | ${catalogExpansionName(product)}` : ""}</small>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            <form className="form flow-form-grid" onSubmit={addManualImportRow}>
              <Field label="Manual row item">
                <input value={importManualRow.itemName} onChange={(event) => setImportManualRow((current) => ({ ...current, itemName: event.target.value }))} placeholder="Charizard ex or Prismatic Evolutions ETB" />
              </Field>
              <Field label="Quantity">
                <input type="number" min="1" value={importManualRow.quantity} onChange={(event) => setImportManualRow((current) => ({ ...current, quantity: event.target.value }))} />
              </Field>
              <Field label="Destination">
                <select value={importManualRow.destination} onChange={(event) => setImportManualRow((current) => ({ ...current, destination: event.target.value }))}>
                  {IMPORT_DESTINATION_OPTIONS.filter((option) => option.value !== "Both").map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </Field>
              <Field label="Purchaser">
                <input value={importManualRow.purchaserName} onChange={(event) => setImportManualRow((current) => ({ ...current, purchaserName: event.target.value }))} placeholder="Zena, Dillon, or buyer name" />
              </Field>
              <Field label="Condition">
                <select value={importManualRow.condition} onChange={(event) => setImportManualRow((current) => ({ ...current, condition: event.target.value }))}>
                  {IMPORT_CONDITION_OPTIONS.map((condition) => <option key={condition}>{condition}</option>)}
                </select>
              </Field>
              <Field label="Cost">
                <input type="number" step="0.01" value={importManualRow.costPaid} onChange={(event) => setImportManualRow((current) => ({ ...current, costPaid: event.target.value }))} />
              </Field>
              <Field label="Store/source">
                <input value={importManualRow.store} onChange={(event) => setImportManualRow((current) => ({ ...current, store: event.target.value }))} />
              </Field>
              <Field label="Purchase date">
                <input type="date" value={importManualRow.purchaseDate} onChange={(event) => setImportManualRow((current) => ({ ...current, purchaseDate: event.target.value }))} />
              </Field>
              <Field label="UPC / barcode">
                <input value={importManualRow.upcSku} onChange={(event) => setImportManualRow((current) => ({ ...current, upcSku: event.target.value }))} placeholder="Typed or scanned code" />
              </Field>
              <Field label="Notes">
                <input value={importManualRow.notes} onChange={(event) => setImportManualRow((current) => ({ ...current, notes: event.target.value }))} />
              </Field>
              <div className="flow-form-footer">
                <button type="submit">Add Manual Row</button>
              </div>
            </form>
          </div>
        </details>

        <div className="settings-subsection">
          <h3>Review Controls</h3>
          <div className="form import-review-grid">
            <Field label="Apply destination to all">
              <select value={importBulkApply.destination} onChange={(event) => setImportBulkApply((current) => ({ ...current, destination: event.target.value }))}>
                <option value="">No bulk destination</option>
                {IMPORT_DESTINATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
            <Field label="Apply condition to all">
              <select value={importBulkApply.condition} onChange={(event) => setImportBulkApply((current) => ({ ...current, condition: event.target.value }))}>
                <option value="">No bulk condition</option>
                {IMPORT_CONDITION_OPTIONS.map((condition) => <option key={condition}>{condition}</option>)}
              </select>
            </Field>
            <Field label="Apply store/source to all">
              <input value={importBulkApply.store} onChange={(event) => setImportBulkApply((current) => ({ ...current, store: event.target.value }))} placeholder="Target, Walmart, collection app..." />
            </Field>
            <Field label="Apply purchase date to all">
              <input type="date" value={importBulkApply.purchaseDate} onChange={(event) => setImportBulkApply((current) => ({ ...current, purchaseDate: event.target.value }))} />
            </Field>
          </div>
          <div className="quick-actions">
            <button type="button" className="secondary-button" onClick={applyImportBulkUpdates}>Apply to Review Rows</button>
          </div>
          <div className="toggle-list">
            <label className="toggle-row">
              <span>Pin imported high-value items to Home Market Watch</span>
              <input type="checkbox" checked={importOptions.pinHighValue} onChange={(event) => setImportOptions((current) => ({ ...current, pinHighValue: event.target.checked }))} />
            </label>
            <label className="toggle-row">
              <span>Add imported matched items to Watchlist</span>
              <input type="checkbox" checked={importOptions.addToWatchlist} onChange={(event) => setImportOptions((current) => ({ ...current, addToWatchlist: event.target.checked }))} />
            </label>
            <label className="toggle-row">
              <span>Update market values after import if possible</span>
              <input type="checkbox" checked={importOptions.updateMarketValues} onChange={(event) => setImportOptions((current) => ({ ...current, updateMarketValues: event.target.checked }))} />
            </label>
            <label className="toggle-row">
              <span>Default duplicate action</span>
              <select value={importOptions.duplicateAction} onChange={(event) => setImportOptions((current) => ({ ...current, duplicateAction: event.target.value }))}>
                {IMPORT_DUPLICATE_ACTIONS.map((action) => <option key={action.value} value={action.value}>{action.label}</option>)}
              </select>
            </label>
          </div>
        </div>

        {importBatchMessage ? <p className="compact-subtitle">{importBatchMessage}</p> : null}
        {importLastBatchResult?.failures?.length ? (
          <div className="empty-state small-empty-state">
            <h3>Partial save issue</h3>
            {importLastBatchResult.failures.map((failure) => <p key={failure.rowId}>{failure.itemName}: {failure.error}</p>)}
          </div>
        ) : null}

        {importRows.length ? (
          <div className="inventory-list compact-inventory-list">
            {importRows.map((row) => {
              const rowDestinations = row.destination === "Both" ? ["Forge", "Vault"] : [row.destination || defaultImportDestination()];
              const duplicate = rowDestinations.map((destination) => findImportDuplicate(row, destination)).find(Boolean);
              return (
              <div className={`inventory-card compact-card ${row.importStatus === "skipped" ? "is-muted" : ""}`} key={row.importedItemId}>
                <div className="compact-card-header">
                  <div>
                    <h3>{row.itemName}</h3>
                    <p>{row.possibleMatchName ? `Match: ${row.possibleMatchName}` : "No catalog match yet"}</p>
                    <small>{row.confidenceLabel || importConfidenceLabel(row.confidenceScore)} confidence ({row.confidenceScore}%) | {row.needsReview ? "Needs Review" : "Good Match"} | {row.sourceType}</small>
                    <small>Original: {row.originalText}</small>
                    {duplicate ? <small className="danger-text">Duplicate possible: {duplicate.name}</small> : null}
                  </div>
                  <span className="status-badge">{row.importStatus}</span>
                </div>
                <div className="form import-review-grid">
                  <Field label="Item Name">
                    <input value={row.itemName} onChange={(event) => updateImportRow(row.importedItemId, { itemName: event.target.value, importStatus: "reviewed" })} />
                  </Field>
                  <Field label="Destination">
                    <select value={row.destination} onChange={(event) => updateImportRow(row.importedItemId, { destination: event.target.value, importStatus: "reviewed" })}>
                      {IMPORT_DESTINATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Catalog Match">
                    <select value={row.matchedCatalogItemId || ""} onChange={(event) => selectImportRowCatalogMatch(row.importedItemId, event.target.value)}>
                      <option value="">No match / add manually</option>
                      {(row.alternateMatches || []).map((product) => <option key={product.id} value={product.id}>{catalogTitle(product)}</option>)}
                    </select>
                  </Field>
                  <Field label="Quantity">
                    <input type="number" min="1" value={row.quantity} onChange={(event) => updateImportRow(row.importedItemId, { quantity: event.target.value, importStatus: "reviewed" })} />
                  </Field>
                  <Field label="Purchaser">
                    <input value={row.purchaserName || ""} onChange={(event) => updateImportRow(row.importedItemId, { purchaserName: event.target.value, importStatus: "reviewed" })} />
                  </Field>
                  <Field label="Cost Paid">
                    <input type="number" step="0.01" value={row.costPaid} onChange={(event) => updateImportRow(row.importedItemId, { costPaid: event.target.value, importStatus: "reviewed" })} />
                  </Field>
                  <Field label="Market Value">
                    <input type="number" step="0.01" value={row.marketValue} onChange={(event) => updateImportRow(row.importedItemId, { marketValue: event.target.value, importStatus: "reviewed" })} />
                  </Field>
                  <Field label="Product Type">
                    <input value={row.productType} onChange={(event) => updateImportRow(row.importedItemId, { productType: event.target.value, importStatus: "reviewed" })} />
                  </Field>
                  <Field label="Set Name">
                    <input value={row.setName} onChange={(event) => updateImportRow(row.importedItemId, { setName: event.target.value, importStatus: "reviewed" })} />
                  </Field>
                  <Field label="Condition">
                    <select value={row.condition || "Unknown"} onChange={(event) => updateImportRow(row.importedItemId, { condition: event.target.value, importStatus: "reviewed" })}>
                      {IMPORT_CONDITION_OPTIONS.map((condition) => <option key={condition}>{condition}</option>)}
                    </select>
                  </Field>
                  <Field label="Variant">
                    <input value={row.variant || ""} onChange={(event) => updateImportRow(row.importedItemId, { variant: event.target.value, importStatus: "reviewed" })} />
                  </Field>
                  <Field label="Store/source">
                    <input value={row.store || row.location || ""} onChange={(event) => updateImportRow(row.importedItemId, { store: event.target.value, location: event.target.value, importStatus: "reviewed" })} />
                  </Field>
                  <Field label="Purchase date">
                    <input type="date" value={row.purchaseDate || ""} onChange={(event) => updateImportRow(row.importedItemId, { purchaseDate: event.target.value, importStatus: "reviewed" })} />
                  </Field>
                  <Field label="UPC/SKU">
                    <input value={row.upcSku || ""} onChange={(event) => updateImportRow(row.importedItemId, { upcSku: event.target.value, importStatus: "reviewed" })} />
                  </Field>
                  <Field label="Duplicate action">
                    <select value={row.duplicateAction || importOptions.duplicateAction} onChange={(event) => updateImportRow(row.importedItemId, { duplicateAction: event.target.value, importStatus: "reviewed" })}>
                      {IMPORT_DUPLICATE_ACTIONS.map((action) => <option key={action.value} value={action.value}>{action.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Notes">
                    <input value={row.notes} onChange={(event) => updateImportRow(row.importedItemId, { notes: event.target.value, importStatus: "reviewed" })} />
                  </Field>
                </div>
                <div className="quick-actions">
                  <button type="button" onClick={() => updateImportRow(row.importedItemId, { importStatus: "reviewed", needsReview: false })}>Mark Reviewed</button>
                  <button type="button" className="secondary-button" onClick={() => updateImportRow(row.importedItemId, { importStatus: "skipped" })}>Skip</button>
                  <button type="button" className="secondary-button" onClick={() => removeImportRow(row.importedItemId)}>Remove</button>
                  <button type="button" className="secondary-button" onClick={() => createManualCatalogItemFromImport(row)}>Create Manual Catalog Item</button>
                </div>
              </div>
            );})}
          </div>
        ) : (
          <div className="empty-state">
            <h3>Start a batch</h3>
            <p>Upload CSV, paste a list, search catalog items, or add manual rows. The batch stays temporary until you confirm.</p>
          </div>
        )}

        <div className="quick-actions">
          <button type="button" disabled={!importRows.length} onClick={confirmInventoryImport}>Confirm Import</button>
          <button type="button" className="secondary-button" onClick={() => closeFlowModal()}>Cancel</button>
        </div>
      </section>
    );
  }

  return renderInventoryImportAssistant();
}
