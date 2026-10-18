import { PrivateStorageImage } from "../../components/PrivateReceipt.jsx";
// App owns state, authority and handlers; only this existing renderer is deferred.
export default function CatalogWorkspaceContent({ scope }) {
  const {
    BarcodeScanner,
    CATALOG_IMPORT_SOURCES,
    CATALOG_SORT_OPTIONS,
    CATEGORIES,
    CollapsibleFeatureSection,
    Field,
    LazyToolBoundary,
    POKEMON_SETS,
    SEALED_PRODUCT_TYPES,
    SmartAddCatalog,
    addCatalogProduct,
    adminToolsVisible,
    blankCatalog,
    bulkImportPreview,
    bulkImportText,
    cardCatalogCount,
    catalogConditionFilter,
    catalogConditionOptions,
    catalogDuplicateWarnings,
    catalogEraFilter,
    catalogEraOptions,
    catalogForm,
    catalogGradedFilter,
    catalogHistoryFilter,
    catalogImage,
    catalogImportStatus,
    catalogKindFilter,
    catalogMarketPriceCount,
    catalogMaxValue,
    catalogMinValue,
    catalogOwnedFilter,
    catalogProducts,
    catalogRarityFilter,
    catalogRarityOptions,
    catalogSearch,
    catalogSearchHasRun,
    catalogSetFilter,
    catalogSetOptions,
    catalogSort,
    catalogTitle,
    catalogTypeFilter,
    catalogTypeOptions,
    catalogUpcCount,
    catalogValidationWarnings,
    catalogVariantFilter,
    catalogVariantOptions,
    catalogWatchlistFilter,
    catalogYearFilter,
    catalogYearOptions,
    editingCatalogId,
    filteredCatalogProducts,
    getCatalogKindLabel,
    getImageSourceLabel,
    handleBulkCatalogFileUpload,
    handleImageUpload,
    importBulkCatalogProducts,
    isFeatureSectionOpen,
    openCatalogDetails,
    previewBulkCatalogImport,
    renderCatalogMeta,
    renderProductImageFallback,
    sealedCatalogCount,
    setBulkImportText,
    setCatalogConditionFilter,
    setCatalogEraFilter,
    setCatalogForm,
    setCatalogGradedFilter,
    setCatalogHistoryFilter,
    setCatalogKindFilter,
    setCatalogMaxValue,
    setCatalogMinValue,
    setCatalogOwnedFilter,
    setCatalogRarityFilter,
    setCatalogSetFilter,
    setCatalogSort,
    setCatalogTypeFilter,
    setCatalogVariantFilter,
    setCatalogWatchlistFilter,
    setCatalogYearFilter,
    setEditingCatalogId,
    setShowCatalogScanner,
    showCatalogScanner,
    supabaseImportStatus,
    toggleFeatureSection,
    updateCatalogForm,
    updateCatalogSearchInput,
    useSmartCatalogProduct,
    workspaceWatchlist,
  } = scope;

  function renderDeferredCatalogWorkspace() {
    return (<>
            <section className="panel">
              <h2>Shared Pokemon Product Catalog</h2>
              <p>
                Market Watch Catalog is the shared product and value system for Forge, Scout, Vault, and Deal Finder.
              </p>
              <p>
                Market values are labeled Live, Cached, Manual, or Estimated. Estimated values stay labeled until live or cached sources are connected.
              </p>
              <div className="cards mini-cards">
                <div className="card"><p>Sealed Products</p><h2>{sealedCatalogCount}</h2></div>
                <div className="card"><p>Individual Cards</p><h2>{cardCatalogCount}</h2></div>
                <div className="card"><p>Watchlist</p><h2>{workspaceWatchlist.length}</h2></div>
              </div>
            </section>
            {adminToolsVisible ? (
            <section className="panel">
              <h2>Catalog Admin / Data Tools</h2>
              <p className="compact-subtitle">Beta/dev structure for future imports from Pokemon TCG API/Scrydex, TCGdex, TCGCSV, official Pokemon product data, and manual CSVs. No live keys are required.</p>
              <div className="cards mini-cards">
                <div className="card"><p>Set Records</p><h2>{POKEMON_SETS.length}</h2></div>
                <div className="card"><p>Catalog Rows</p><h2>{supabaseImportStatus.totalPokemonProducts ?? catalogProducts.length}</h2></div>
                <div className="card"><p>Imported Cards</p><h2>{catalogImportStatus.cardsImported || 0}</h2></div>
                <div className="card"><p>Imported Sealed</p><h2>{catalogImportStatus.sealedProductsImported || 0}</h2></div>
                <div className="card"><p>UPC/SKU Links</p><h2>{catalogUpcCount}</h2></div>
                <div className="card"><p>Market Price Rows</p><h2>{catalogMarketPriceCount}</h2></div>
                <div className="card"><p>Duplicate Warnings</p><h2>{catalogDuplicateWarnings.length}</h2></div>
                <div className="card"><p>Validation Warnings</p><h2>{catalogValidationWarnings.length}</h2></div>
              </div>
              <p className="compact-subtitle">
                Last catalog import: {catalogImportStatus.lastImportedAt ? new Date(catalogImportStatus.lastImportedAt).toLocaleString() : "No generated import yet"}.
                Source: {catalogImportStatus.source || "local catalog"}.
              </p>
              <div className="quick-action-rail">
                {CATALOG_IMPORT_SOURCES.map((source) => (
                  <button type="button" className="secondary-button" key={source} disabled>{source}</button>
                ))}
              </div>
              <p className="compact-subtitle">Provider import buttons stay disabled until approved API/CSV sources are connected. CSV/manual catalog import remains available below.</p>
            </section>
            ) : (
            <section className="panel">
              <h2>Catalog Status</h2>
              <p className="compact-subtitle">Catalog import and data-control tools are admin-only. Search and add-to-Vault/Forge stay available based on tier access.</p>
              <div className="cards mini-cards">
                <div className="card"><p>Set Records</p><h2>{POKEMON_SETS.length}</h2></div>
                <div className="card"><p>Catalog Rows</p><h2>{catalogProducts.length}</h2></div>
              </div>
            </section>
            )}
          <CollapsibleFeatureSection title={adminToolsVisible ? "Manual Catalog Item" : "Catalog Suggestions"} summary={adminToolsVisible ? "Add or edit missing sealed products and individual cards locally" : "Suggest missing products, UPC/SKU links, and corrections for admin review"} open={isFeatureSectionOpen("catalog_manual")} onToggle={() => toggleFeatureSection("catalog_manual")}>
          {adminToolsVisible ? (
          <>
          <LazyToolBoundary label="Loading catalog match tools...">
            <SmartAddCatalog onUseProduct={useSmartCatalogProduct} localCatalogProducts={catalogProducts} />
          </LazyToolBoundary>
          <section className="panel">
  <h2>Bulk Import Catalog Items</h2>
  <p>
    Paste a list or upload a CSV/text file. Format each line like:
  </p>

  <pre className="import-example">
Product Name, Category, Set, Product Type, Barcode, Market Price, Low, Mid, High, MSRP, Set Code, Expansion, Product Line, Pack Count, Notes
Perfect Order ETB, Pokemon, Perfect Order, Elite Trainer Box, 123456789, 70.27, 60, 70.27, 85, 59.99, POR, Perfect Order, Mega Evolution, 9, Target restock itemPerfect Order Booster Bundle, Pokemon, Perfect Order, Booster Bundle, 987654321, 24.99, 20, 24.99, 32, Good flip
  </pre>

  <div className="form">
    <Field label="Upload CSV / Text File">
      <input
        type="file"
        accept=".csv,.txt"
        onChange={handleBulkCatalogFileUpload}
      />
    </Field>

    <button type="button" onClick={previewBulkCatalogImport}>
      Preview Import
    </button>
  </div>

  <textarea
    className="search-input"
    style={{ minHeight: "220px" }}
    value={bulkImportText}
    onChange={(event) => setBulkImportText(event.target.value)}
    placeholder="Paste one item per line..."
  />

  {bulkImportPreview.length > 0 && (
    <div>
      <h3>Preview: {bulkImportPreview.length} items</h3>

      <div className="inventory-list">
        {bulkImportPreview.map((item) => (
          <div className="inventory-card compact-card" key={item.tempId}>
            <h3>{item.name}</h3>
            <p>Category: {item.category}</p>
            <p>Set: {item.setName || "Not listed"}</p>
            <p>Type: {item.productType || "Not listed"}</p>
            <p>Barcode: {item.barcode || "Not listed"}</p>
            <p>Market Watch Value: ${Number(item.marketPrice || 0).toFixed(2)}</p>
          </div>
        ))}
      </div>

      <button type="button" onClick={importBulkCatalogProducts}>
        Import {bulkImportPreview.length} Products to Catalog
      </button>
    </div>
  )}
</section>
          </>
          ) : (
            <div className="small-empty-state">
              <strong>Suggestions only for beta users.</strong>
              <span>Catalog changes are universal data. Submit missing products or corrections below so an admin can review them.</span>
            </div>
          )}
            <section className="panel">
              <h2>{adminToolsVisible ? (editingCatalogId ? "Edit Catalog Product" : "Add Product Catalog Item") : (editingCatalogId ? "Suggest Product Correction" : "Suggest Missing Product")}</h2>
              <button type="button" className="secondary-button" onClick={() => setShowCatalogScanner(true)}>Open Catalog Scanner</button>
              {showCatalogScanner && <BarcodeScanner onScan={(code) => { updateCatalogForm("barcode", code); setShowCatalogScanner(false); }} onClose={() => setShowCatalogScanner(false)} />}
              <form onSubmit={addCatalogProduct} className="form">
                <Field label="Catalog Type"><select value={catalogForm.catalogType} onChange={(e) => updateCatalogForm("catalogType", e.target.value)}><option value="sealed">Sealed Product</option><option value="card">Individual Card</option></select></Field>
                <Field label={catalogForm.catalogType === "card" ? "Card Name" : "Product Name"}><input value={catalogForm.catalogType === "card" ? catalogForm.cardName : catalogForm.productName || catalogForm.name} onChange={(e) => { updateCatalogForm(catalogForm.catalogType === "card" ? "cardName" : "productName", e.target.value); updateCatalogForm("name", e.target.value); }} /></Field>
                {catalogForm.catalogType === "card" && <Field label="Pokemon / Character Name"><input value={catalogForm.pokemonName} onChange={(e) => updateCatalogForm("pokemonName", e.target.value)} /></Field>}
                <Field label="Category"><select value={catalogForm.category} onChange={(e) => updateCatalogForm("category", e.target.value)}>{CATEGORIES.map((x) => <option key={x}>{x}</option>)}</select></Field>
                <Field label="Set / Collection"><input value={catalogForm.setName} onChange={(e) => updateCatalogForm("setName", e.target.value)} /></Field>
                <Field label="Product Type"><input list="sealed-product-types" value={catalogForm.productType} onChange={(e) => updateCatalogForm("productType", e.target.value)} /><datalist id="sealed-product-types">{SEALED_PRODUCT_TYPES.map((type) => <option key={type} value={type} />)}</datalist></Field>
                <Field label="Barcode / UPC"><input value={catalogForm.barcode} onChange={(e) => updateCatalogForm("barcode", e.target.value)} /></Field>
                <Field label="SKU"><input value={catalogForm.sku} onChange={(e) => updateCatalogForm("sku", e.target.value)} /></Field>
                <Field label="Upload Photo"><input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, (url) => {
                  updateCatalogForm("imageUrl", url);
                  updateCatalogForm("imageSource", "user");
                  updateCatalogForm("imageStatus", "user");
                  updateCatalogForm("imageLastUpdated", new Date().toISOString());
                  updateCatalogForm("imageNeedsReview", false);
                }, "catalog-products")} /></Field>
                <Field label="Manual Image URL"><input value={catalogForm.imageUrl} onChange={(e) => {
                  updateCatalogForm("imageUrl", e.target.value);
                  updateCatalogForm("imageSource", e.target.value ? "manual" : "placeholder");
                  updateCatalogForm("imageStatus", e.target.value ? "manual" : "placeholder");
                  updateCatalogForm("imageLastUpdated", e.target.value ? new Date().toISOString() : "");
                }} placeholder="Paste image URL" /></Field>
                <Field label="Image Source"><select value={catalogForm.imageSource} onChange={(e) => updateCatalogForm("imageSource", e.target.value)}>
                  <option value="pokemon_tcg_api">Pokemon TCG API</option>
                  <option value="tcgdex">TCGdex</option>
                  <option value="best_buy">Best Buy</option>
                  <option value="ebay">Marketplace / eBay</option>
                  <option value="tcgcsv">TCGCSV</option>
                  <option value="user">User uploaded</option>
                  <option value="manual">Manual URL</option>
                  <option value="estimated">Estimated</option>
                  {adminToolsVisible ? <option value="mock">Estimated fallback</option> : null}
                  <option value="placeholder">Placeholder</option>
                  <option value="unknown">Unknown</option>
                </select></Field>
                <Field label="Image Status"><select value={catalogForm.imageStatus} onChange={(e) => updateCatalogForm("imageStatus", e.target.value)}>
                  <option value="official">Official/API</option>
                  <option value="api">API</option>
                  <option value="retailer">Retailer</option>
                  <option value="marketplace">Marketplace</option>
                  <option value="user">User</option>
                  <option value="manual">Manual</option>
                  <option value="estimated">Estimated</option>
                  {adminToolsVisible ? <option value="mock">Estimated fallback</option> : null}
                  <option value="placeholder">Placeholder</option>
                  <option value="unknown">Unknown</option>
                </select></Field>
                <Field label="Image Source URL"><input value={catalogForm.imageSourceUrl} onChange={(e) => updateCatalogForm("imageSourceUrl", e.target.value)} placeholder="Source or product page URL" /></Field>
                <label className="toggle-row">
                  <input type="checkbox" checked={Boolean(catalogForm.imageNeedsReview)} onChange={(e) => updateCatalogForm("imageNeedsReview", e.target.checked)} />
                  Image needs review
                </label>
                {catalogForm.imageUrl ? (
                  <div className="receipt-preview">
                    <p>Catalog Photo • {getImageSourceLabel(catalogForm)}</p>
                    <PrivateStorageImage src={catalogForm.imageUrl} alt="Catalog" />
                    <button type="button" className="secondary-button" onClick={() => {
                      updateCatalogForm("imageUrl", "");
                      updateCatalogForm("imageSmall", "");
                      updateCatalogForm("imageLarge", "");
                      updateCatalogForm("imageSource", "placeholder");
                      updateCatalogForm("imageStatus", "placeholder");
                      updateCatalogForm("imageNeedsReview", false);
                    }}>Remove Image</button>
                  </div>
                ) : null}
                <Field label="Market Watch Product ID"><input value={catalogForm.externalProductId} onChange={(e) => updateCatalogForm("externalProductId", e.target.value)} /></Field>
                <Field label="Market Source URL"><input value={catalogForm.marketUrl} onChange={(e) => updateCatalogForm("marketUrl", e.target.value)} /></Field>
                <Field label="Market Data Label"><select value={catalogForm.sourceType} onChange={(e) => updateCatalogForm("sourceType", e.target.value)}><option value="manual">Manual</option><option value="estimated">Estimated</option>{adminToolsVisible ? <option value="mock">Mock</option> : null}<option value="cached">Cached</option><option value="live">Live</option></select></Field>
                <Field label="Market Source Name"><input value={catalogForm.marketSource} onChange={(e) => updateCatalogForm("marketSource", e.target.value)} placeholder="Manual, Estimated, TCGPlayer, PriceCharting..." /></Field>
                <Field label="Confidence"><input value={catalogForm.marketConfidenceLevel} onChange={(e) => updateCatalogForm("marketConfidenceLevel", e.target.value)} placeholder="Manual, Estimated, Low, Medium, High" /></Field>
                <Field label="Market Last Updated"><input type="date" value={catalogForm.marketLastUpdated} onChange={(e) => updateCatalogForm("marketLastUpdated", e.target.value)} /></Field>
                <Field label="MSRP Price">
  <input
    type="number"
    step="0.01"
    value={catalogForm.msrpPrice}
    onChange={(e) => updateCatalogForm("msrpPrice", e.target.value)}
  />
</Field>

<Field label="Set Code">
  <input
    value={catalogForm.setCode}
    onChange={(e) => updateCatalogForm("setCode", e.target.value)}
  />
</Field>

<Field label="Expansion">
  <input
    value={catalogForm.expansion}
    onChange={(e) => updateCatalogForm("expansion", e.target.value)}
  />
</Field>

<Field label="Release Year">
  <input value={catalogForm.releaseYear} onChange={(e) => updateCatalogForm("releaseYear", e.target.value)} />
</Field>

<Field label="Release Date">
  <input type="date" value={catalogForm.releaseDate} onChange={(e) => updateCatalogForm("releaseDate", e.target.value)} />
</Field>

<Field label="Product Line">
  <input
    value={catalogForm.productLine}
    onChange={(e) => updateCatalogForm("productLine", e.target.value)}
  />
</Field>

<Field label="Pack Count">
  <input
    type="number"
    value={catalogForm.packCount}
    onChange={(e) => updateCatalogForm("packCount", e.target.value)}
  />
</Field>
                {catalogForm.catalogType === "card" && (
                  <>
                    <Field label="Card Number"><input value={catalogForm.cardNumber} onChange={(e) => updateCatalogForm("cardNumber", e.target.value)} /></Field>
                    <Field label="Rarity"><input value={catalogForm.rarity} onChange={(e) => updateCatalogForm("rarity", e.target.value)} /></Field>
                    <Field label="Variant"><input value={catalogForm.variant} onChange={(e) => updateCatalogForm("variant", e.target.value)} /></Field>
                    <Field label="Condition"><input value={catalogForm.condition} onChange={(e) => updateCatalogForm("condition", e.target.value)} /></Field>
                    <Field label="Language"><input value={catalogForm.language} onChange={(e) => updateCatalogForm("language", e.target.value)} /></Field>
                    <Field label="Graded"><select value={catalogForm.graded ? "yes" : "no"} onChange={(e) => updateCatalogForm("graded", e.target.value === "yes")}><option value="no">Ungraded</option><option value="yes">Graded</option></select></Field>
                    <Field label="Grading Company"><input value={catalogForm.gradingCompany} onChange={(e) => updateCatalogForm("gradingCompany", e.target.value)} /></Field>
                    <Field label="Grade"><input value={catalogForm.grade} onChange={(e) => updateCatalogForm("grade", e.target.value)} /></Field>
                    <Field label="Raw Market Value"><input type="number" step="0.01" value={catalogForm.marketValueRaw} onChange={(e) => updateCatalogForm("marketValueRaw", e.target.value)} /></Field>
                    <Field label="Near Mint Market Value"><input type="number" step="0.01" value={catalogForm.marketValueNearMint} onChange={(e) => updateCatalogForm("marketValueNearMint", e.target.value)} /></Field>
                    <Field label="Light Played Market Value"><input type="number" step="0.01" value={catalogForm.marketValueLightPlayed} onChange={(e) => updateCatalogForm("marketValueLightPlayed", e.target.value)} /></Field>
                    <Field label="Graded Market Value"><input type="number" step="0.01" value={catalogForm.marketValueGraded} onChange={(e) => updateCatalogForm("marketValueGraded", e.target.value)} /></Field>
                  </>
                )}
                <Field label="Market Watch Price"><input type="number" step="0.01" value={catalogForm.marketPrice} onChange={(e) => updateCatalogForm("marketPrice", e.target.value)} /></Field>
                <Field label="Low Price"><input type="number" step="0.01" value={catalogForm.lowPrice} onChange={(e) => updateCatalogForm("lowPrice", e.target.value)} /></Field>
                <Field label="Mid Price"><input type="number" step="0.01" value={catalogForm.midPrice} onChange={(e) => updateCatalogForm("midPrice", e.target.value)} /></Field>
                <Field label="High Price"><input type="number" step="0.01" value={catalogForm.highPrice} onChange={(e) => updateCatalogForm("highPrice", e.target.value)} /></Field>
                <Field label="Notes"><input value={catalogForm.notes} onChange={(e) => updateCatalogForm("notes", e.target.value)} /></Field>
                <button type="submit">{adminToolsVisible ? (editingCatalogId ? "Save Catalog Product" : "Add Catalog Product") : "Submit for Review"}</button>
                {editingCatalogId && <button type="button" className="secondary-button" onClick={() => { setEditingCatalogId(null); setCatalogForm(blankCatalog); }}>Cancel Edit</button>}
              </form>
            </section>
          </CollapsibleFeatureSection>
            <section className="panel">
              <h2>Product Catalog</h2>
              <input className="search-input" value={catalogSearch} onChange={(e) => updateCatalogSearchInput(e.target.value)} placeholder="Search products, cards, Pokemon, set, UPC, SKU, rarity..." />
              <div className="filter-grid">
                <Field label="Sealed vs Card">
                  <select value={catalogKindFilter} onChange={(e) => setCatalogKindFilter(e.target.value)}>
                    <option value="All">All catalog types</option>
                    <option value="sealed">Sealed Products</option>
                    <option value="card">Individual Cards</option>
                  </select>
                </Field>
                <Field label="Filter by Set">
                  <select value={catalogSetFilter} onChange={(e) => setCatalogSetFilter(e.target.value)}>
                    {catalogSetOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </Field>
                <Field label="Filter by Product Type">
                  <select value={catalogTypeFilter} onChange={(e) => setCatalogTypeFilter(e.target.value)}>
                    {catalogTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </Field>
                <Field label="Filter by Era">
                  <select value={catalogEraFilter} onChange={(e) => setCatalogEraFilter(e.target.value)}>
                    {catalogEraOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </Field>
                <Field label="Filter by Year">
                  <select value={catalogYearFilter} onChange={(e) => setCatalogYearFilter(e.target.value)}>
                    {catalogYearOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </Field>
                <Field label="Rarity">
                  <select value={catalogRarityFilter} onChange={(e) => setCatalogRarityFilter(e.target.value)}>
                    {catalogRarityOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </Field>
                <Field label="Variant">
                  <select value={catalogVariantFilter} onChange={(e) => setCatalogVariantFilter(e.target.value)}>
                    {catalogVariantOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </Field>
                <Field label="Condition">
                  <select value={catalogConditionFilter} onChange={(e) => setCatalogConditionFilter(e.target.value)}>
                    {catalogConditionOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </Field>
                <Field label="Graded">
                  <select value={catalogGradedFilter} onChange={(e) => setCatalogGradedFilter(e.target.value)}>
                    <option>All</option>
                    <option>Graded</option>
                    <option>Ungraded</option>
                  </select>
                </Field>
                <Field label="Owned">
                  <select value={catalogOwnedFilter} onChange={(e) => setCatalogOwnedFilter(e.target.value)}>
                    <option>All</option>
                    <option>Owned</option>
                    <option>Not owned</option>
                  </select>
                </Field>
                <Field label="Watchlist">
                  <select value={catalogWatchlistFilter} onChange={(e) => setCatalogWatchlistFilter(e.target.value)}>
                    <option>All</option>
                    <option>Watchlist</option>
                    <option>Not watched</option>
                  </select>
                </Field>
                <Field label="Price History">
                  <select value={catalogHistoryFilter} onChange={(e) => setCatalogHistoryFilter(e.target.value)}>
                    <option>All</option>
                    <option>Has price history</option>
                    <option>Missing price history</option>
                    <option>Price changed recently</option>
                    <option>High volatility</option>
                    <option>Low volatility</option>
                  </select>
                </Field>
                <Field label="Min Market Value">
                  <input type="number" step="0.01" value={catalogMinValue} onChange={(e) => setCatalogMinValue(e.target.value)} />
                </Field>
                <Field label="Max Market Value">
                  <input type="number" step="0.01" value={catalogMaxValue} onChange={(e) => setCatalogMaxValue(e.target.value)} />
                </Field>
              </div>
              <p>
                {catalogSearchHasRun
                  ? `Showing ${filteredCatalogProducts.length} paged search results.`
                  : "Search from Market Watch first before browsing imported catalog rows."}
              </p>
              <Field label="Sort Catalog">
                <select
                  value={catalogSort}
                  onChange={(e) => setCatalogSort(e.target.value)}
                >
                  {CATALOG_SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </Field>
              <div className="catalog-results-list">
                {(catalogSearchHasRun ? filteredCatalogProducts : []).map((p) => (
                  <div className="catalog-result-card" key={p.id}>
                    <button type="button" className="catalog-result-main" onClick={() => openCatalogDetails(p.id)}>
                      <div className="catalog-thumb">
                        {catalogImage(p) ? (
                          <>
                            <PrivateStorageImage
                              src={catalogImage(p)}
                              alt=""
                              onError={(event) => {
                                event.currentTarget.style.display = "none";
                                event.currentTarget.nextElementSibling?.removeAttribute("hidden");
                              }}
                            />
                            {renderProductImageFallback(p, { hidden: true, badge: getCatalogKindLabel(p) })}
                          </>
                        ) : (
                          renderProductImageFallback(p, { badge: getCatalogKindLabel(p) })
                        )}
                      </div>
                      <div>
                        <span className="catalog-pill">{getCatalogKindLabel(p)}</span>
                        <h3>{catalogTitle(p)}</h3>
                        {renderCatalogMeta(p)}
                        {adminToolsVisible ? <p className="image-source-line">
                          Image: {getImageSourceLabel(p)}
                          {p.imageNeedsReview ? " • Needs review" : ""}
                        </p> : null}
                        {adminToolsVisible ? <p className="compact-subtitle">Source: {p.marketSource || p.sourceType || "Unknown"}{p.priceSubtype ? ` | ${p.priceSubtype}` : ""}</p> : null}
                        {p.historySnapshotCount > 0 ? (
                          <p className="compact-subtitle">History available: {p.historySnapshotCount} snapshot{p.historySnapshotCount === 1 ? "" : "s"}</p>
                        ) : null}
                      </div>
                    </button>
                  </div>
                ))}
                {!catalogSearchHasRun ? (
                  <div className="empty-state">
                    <h3>Search first</h3>
                    <p>Imported catalog rows are not listed by default. Use Market Watch Search & Catalog to search by name, set, card number, product ID, or barcode.</p>
                  </div>
                ) : null}
              </div>
            </section>
          </>);
  }

  return renderDeferredCatalogWorkspace();
}
