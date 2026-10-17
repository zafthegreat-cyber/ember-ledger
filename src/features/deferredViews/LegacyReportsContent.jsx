// App owns state, authority and handlers; only this existing renderer is deferred.
export default function LegacyReportsContent({ scope }) {
  const {
    ActionReport,
    Field,
    INFO_TOOLTIP_COPY,
    InfoTooltip,
    PAYOUT_ASSIST_DISCLAIMER,
    ReportList,
    activeForgeWorkspace,
    deductibleExpenseCategoryRows,
    downloadMileageRecords,
    downloadSalesRecords,
    downloadYearEndTaxSummary,
    estimatedProfitAfterMarketing,
    expensesByCategory,
    inventoryByCategory,
    inventoryByStatus,
    listedItems,
    lowStockItems,
    missingBarcodeItems,
    missingMarketPriceItems,
    missingMsrpItems,
    missingProductTypeItems,
    missingSalePriceItems,
    money,
    monthlyMarketingSpend,
    needsMarketCheckItems,
    needsPhotosItems,
    openPurchaserManager,
    payoutAssistRows,
    payoutAssistSummary,
    personLedgerFilter,
    prepareRestock,
    quickUpdatePlannedSalePrice,
    readyToListItems,
    reportFocus,
    salesByPlatform,
    selectedPayoutAssistRows,
    setActiveTab,
    setPersonLedgerFilter,
    setReportFocus,
    setTaxSummaryYear,
    startEditingItem,
    taxExpenseCategoryRows,
    taxSummaryYear,
    taxSummaryYearOptions,
    totalMarketingSpend,
    yearEndRecordCount,
    yearEndTaxSummary,
  } = scope;

  function renderDeferredLegacyReports() {
    return (<>
            <section className="panel forge-tax-overview-panel">
              <div className="compact-card-header">
                <div>
                  <p className="eyebrow">Taxes / Export</p>
                  <h2>Business recordkeeping summary</h2>
                  <p>For recordkeeping. Confirm with your tax professional.</p>
                </div>
                {reportFocus ? (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setReportFocus("")}
                  >
                    Show All
                  </button>
                ) : null}
              </div>
              <div className="forge-tax-command-grid">
                <div className="tax-command-card tax-command-card--primary">
                  <span>Revenue</span>
                  <strong>{money(yearEndTaxSummary.sales.revenue)}</strong>
                  <small>{yearEndTaxSummary.sales.count} sale{yearEndTaxSummary.sales.count === 1 ? "" : "s"} recorded for {taxSummaryYear}</small>
                </div>
                <div className="tax-command-card">
                  <span>Cost basis</span>
                  <strong>{money(yearEndTaxSummary.sales.estimatedCostBasis || yearEndTaxSummary.inventory.costBasis)}</strong>
                  <small>Known sold-item cost plus tracked inventory context</small>
                </div>
                <div className={`tax-command-card ${yearEndTaxSummary.sales.profit < 0 ? "is-negative" : "is-positive"}`}>
                  <span>Profit / loss</span>
                  <strong>{money(yearEndTaxSummary.sales.profit)}</strong>
                  <small>After known sales costs, fees, and shipping</small>
                </div>
                <div className="tax-command-card">
                  <span>Fees + shipping</span>
                  <strong>{money((yearEndTaxSummary.sales.estimatedFees || 0) + (yearEndTaxSummary.sales.estimatedShippingCosts || 0))}</strong>
                  <small>{money(yearEndTaxSummary.sales.estimatedFees || 0)} fees / {money(yearEndTaxSummary.sales.estimatedShippingCosts || 0)} shipping</small>
                </div>
                <div className="tax-command-card">
                  <span>Expenses</span>
                  <strong>{money(yearEndTaxSummary.expenses.total)}</strong>
                  <small>{yearEndTaxSummary.expenses.count} receipt or expense record{yearEndTaxSummary.expenses.count === 1 ? "" : "s"}</small>
                </div>
                <div className="tax-command-card">
                  <span>Mileage</span>
                  <strong>{yearEndTaxSummary.mileage.totalMiles.toFixed(1)} mi</strong>
                  <small>{money(yearEndTaxSummary.mileage.totalValue)} recordkeeping estimate</small>
                </div>
              </div>
            </section>

            <section className="panel payout-assist-panel">
              <div className="compact-card-header">
                <div>
                  <p className="eyebrow">Payout Assist</p>
                  <h2>Person ledger and payout planning</h2>
                  <p>{PAYOUT_ASSIST_DISCLAIMER}</p>
                </div>
                <button type="button" className="secondary-button" onClick={() => openPurchaserManager(activeForgeWorkspace?.id)}>
                  Manage People
                </button>
              </div>
              <div className="payout-summary-grid">
                <div>
                  <span>Gross sales</span>
                  <strong>{money(payoutAssistSummary.grossSales)}</strong>
                  <small>Recorded sales</small>
                </div>
                <div>
                  <span>Cost of goods <InfoTooltip label="About cost basis">{INFO_TOOLTIP_COPY.costBasis}</InfoTooltip></span>
                  <strong>{money(payoutAssistSummary.costOfGoods)}</strong>
                  <small>Known sale cost basis</small>
                </div>
                <div>
                  <span>Expenses</span>
                  <strong>{money(payoutAssistSummary.expenses)}</strong>
                  <small>Business expenses</small>
                </div>
                <div>
                  <span>Mileage <InfoTooltip label="About mileage">{INFO_TOOLTIP_COPY.mileage}</InfoTooltip></span>
                  <strong>{money(payoutAssistSummary.mileageReimbursement)}</strong>
                  <small>Reimbursement estimate</small>
                </div>
                <div>
                  <span>Net profit <InfoTooltip label="About net profit">{INFO_TOOLTIP_COPY.netProfit}</InfoTooltip></span>
                  <strong>{money(payoutAssistSummary.netProfit)}</strong>
                  <small>After known costs</small>
                </div>
                <div>
                  <span>Payout estimate <InfoTooltip label="About payout estimate">{INFO_TOOLTIP_COPY.payoutEstimate}</InfoTooltip></span>
                  <strong>{money(payoutAssistSummary.suggestedPayout)}</strong>
                  <small>Planning only</small>
                </div>
              </div>
              <div className="person-ledger-tabs" role="tablist" aria-label="Person ledger filters">
                <button type="button" className={personLedgerFilter === "all" ? "active" : ""} onClick={() => setPersonLedgerFilter("all")}>All</button>
                {payoutAssistRows.slice(0, 8).map((row) => (
                  <button type="button" key={row.name} className={personLedgerFilter === row.name ? "active" : ""} onClick={() => setPersonLedgerFilter(row.name)}>
                    {row.name}
                  </button>
                ))}
              </div>
              {selectedPayoutAssistRows.length ? (
                <div className="person-ledger-grid">
                  {selectedPayoutAssistRows.map((row) => (
                    <article className="person-ledger-card" key={row.name}>
                      <div className="compact-card-header">
                        <div>
                          <h3>{row.name}</h3>
                          <p className="compact-subtitle">{row.type} | {row.inventoryCount} item{row.inventoryCount === 1 ? "" : "s"} | {row.salesCount} sale{row.salesCount === 1 ? "" : "s"}</p>
                        </div>
                        <span className="neon-chip">Person</span>
                      </div>
                      <div className="person-ledger-stats">
                        <div><span>Purchased</span><strong>{money(row.inventoryCost)}</strong></div>
                        <div><span>Expenses paid</span><strong>{money(row.expensesPaid)}</strong></div>
                        <div><span>Mileage</span><strong>{money(row.mileageValue)}</strong></div>
                        <div><span>Gross sales</span><strong>{money(row.grossSales)}</strong></div>
                        <div><span>Net profit</span><strong>{money(row.netProfit)}</strong></div>
                        <div><span>Payout estimate</span><strong>{money(row.suggestedPayout)}</strong></div>
                      </div>
                      <p className="compact-subtitle">
                        Reimbursements owed: {money(row.reimbursementsOwed)}. Receipts linked: {row.receiptCount}. This is planning support, not payroll.
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="small-empty-state">
                  <strong>No people activity yet.</strong>
                  <span>Add a person on an item, expense, receipt, sale, or mileage log to start Payout Assist.</span>
                </div>
              )}
            </section>

            <section className="panel tax-readiness-panel">
              <div className="compact-card-header">
                <div>
                  <p className="eyebrow">Yearly records</p>
                  <h2>{taxSummaryYear} business summary</h2>
                  <p>For recordkeeping. Confirm with your tax professional. Source records stay underneath for review.</p>
                </div>
                <Field label="Year">
                  <select value={taxSummaryYear} onChange={(event) => setTaxSummaryYear(event.target.value)}>
                    {taxSummaryYearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
                  </select>
                </Field>
              </div>
              {yearEndRecordCount ? (
                <>
                  <div className="tax-year-summary-grid">
                    <div><span>Revenue</span><strong>{money(yearEndTaxSummary.sales.revenue)}</strong><small>{yearEndTaxSummary.sales.count} sale{yearEndTaxSummary.sales.count === 1 ? "" : "s"}</small></div>
                    <div><span>Cost basis</span><strong>{money(yearEndTaxSummary.inventory.costBasis)}</strong><small>{yearEndTaxSummary.inventory.quantity} inventory unit{yearEndTaxSummary.inventory.quantity === 1 ? "" : "s"}</small></div>
                    <div><span>Profit / loss</span><strong>{money(yearEndTaxSummary.sales.profit)}</strong><small>Known sales record estimate</small></div>
                    <div><span>Fees</span><strong>{money(yearEndTaxSummary.sales.estimatedFees || 0)}</strong><small>Platform and payment fees when recorded</small></div>
                    <div><span>Shipping</span><strong>{money(yearEndTaxSummary.sales.estimatedShippingCosts || 0)}</strong><small>Shipping costs when recorded</small></div>
                    <div><span>Supplies / expenses</span><strong>{money(yearEndTaxSummary.expenses.total)}</strong><small>{yearEndTaxSummary.expenses.count} expense record{yearEndTaxSummary.expenses.count === 1 ? "" : "s"}</small></div>
                  </div>

                  <div className="tax-recordkeeping-layout">
                    <div className="tax-record-card tax-record-card--focus">
                      <h3>Record health</h3>
                      <p><span>Missing receipts</span><strong>{yearEndTaxSummary.expenses.missingReceiptCount + yearEndTaxSummary.inventory.missingReceiptCount}</strong></p>
                      <p><span>Sales references</span><strong>{yearEndTaxSummary.sales.receiptCoverage?.withReference || 0}/{yearEndTaxSummary.sales.receiptCoverage?.total || 0}</strong></p>
                      <p><span>Missing cost basis</span><strong>{yearEndTaxSummary.inventory.missingCostCount || 0}</strong></p>
                      <p className="compact-subtitle">Review missing receipts, sale references, and costs before sharing exports with a tax professional.</p>
                    </div>
                    <div className="tax-record-card">
                      <h3>Deductible categories</h3>
                      {deductibleExpenseCategoryRows.slice(0, 5).map((row) => (
                        <p key={row.category}><span>{row.category}</span><strong>{money(row.amount)}</strong></p>
                      ))}
                      {!deductibleExpenseCategoryRows.length ? <p className="compact-subtitle">No deductible categories marked for {taxSummaryYear}.</p> : null}
                    </div>
                    <div className="tax-record-card">
                      <h3>Expense categories</h3>
                      {taxExpenseCategoryRows.map((row) => (
                        <p key={row.category}><span>{row.category}</span><strong>{money(row.amount)}</strong></p>
                      ))}
                      {!taxExpenseCategoryRows.length ? <p className="compact-subtitle">No expense records for {taxSummaryYear}.</p> : null}
                    </div>
                    <div className="tax-record-card">
                      <h3>Sales channels</h3>
                      {yearEndTaxSummary.sales.byPlatform.slice(0, 5).map((group) => (
                        <p key={group.label}><span>{group.label}</span><strong>{money(group.grossSales)}</strong></p>
                      ))}
                      {!yearEndTaxSummary.sales.byPlatform.length ? <p className="compact-subtitle">No sales records for {taxSummaryYear}.</p> : null}
                    </div>
                  </div>

                  <details className="forge-report-details">
                    <summary>View source breakdown</summary>
                    <div className="tax-record-grid">
                      <div className="tax-record-card">
                        <h3>Top expense vendors</h3>
                        {yearEndTaxSummary.expenses.vendorGroups.slice(0, 5).map((group) => (
                          <p key={group.key}><span>{group.vendorName}</span><strong>{money(group.total)}</strong></p>
                        ))}
                        {!yearEndTaxSummary.expenses.vendorGroups.length ? <p className="compact-subtitle">No expense records for {taxSummaryYear}.</p> : null}
                      </div>
                      <div className="tax-record-card">
                        <h3>Mileage by vehicle</h3>
                        {yearEndTaxSummary.mileage.vehicleGroups.slice(0, 5).map((group) => (
                          <p key={group.key}><span>{group.vehicleName}</span><strong>{group.totalMiles.toFixed(1)} mi</strong></p>
                        ))}
                        {!yearEndTaxSummary.mileage.vehicleGroups.length ? <p className="compact-subtitle">No mileage records for {taxSummaryYear}.</p> : null}
                      </div>
                      <div className="tax-record-card">
                        <h3>Inventory by purchaser</h3>
                        {yearEndTaxSummary.inventory.purchaserTotals.slice(0, 5).map((group) => (
                          <p key={group.name}><span>{group.name}</span><strong>{money(group.costBasis)}</strong></p>
                        ))}
                        {!yearEndTaxSummary.inventory.purchaserTotals.length ? <p className="compact-subtitle">No inventory cost basis for {taxSummaryYear}.</p> : null}
                      </div>
                    </div>
                  </details>
                </>
              ) : (
                <div className="tax-empty-state">
                  <span className="trust-badge trust-badge--secure">Recordkeeping</span>
                  <h3>Start recording sales to build your tax summary.</h3>
                  <p>Add sales, inventory cost basis, expenses, and mileage in Forge. Exports will stay for recordkeeping and review.</p>
                  <div className="quick-actions">
                    <button type="button" onClick={() => setActiveTab("sales")}>Record a sale</button>
                    <button type="button" className="secondary-button" onClick={() => setActiveTab("expenses")}>Add expense</button>
                  </div>
                </div>
              )}

              <div className="tax-export-panel">
                <div>
                  <p className="eyebrow">Export</p>
                  <h3>End-of-year report</h3>
                  <p>Exports organize records for review. They are not tax advice or a filing.</p>
                </div>
                <div className="tax-export-actions">
                  <button type="button" onClick={() => downloadYearEndTaxSummary("csv")}>Export summary CSV</button>
                  <button type="button" className="secondary-button" onClick={() => downloadYearEndTaxSummary("json")}>Export report JSON</button>
                  <button type="button" className="secondary-button" onClick={() => downloadSalesRecords("csv")}>Export sales CSV</button>
                  <button type="button" className="secondary-button" onClick={() => downloadMileageRecords("csv")}>Export mileage CSV</button>
                </div>
              </div>
            </section>

            {!reportFocus && (
              <>
                <ReportList title="Forge Sales by Platform" data={salesByPlatform} moneyValues />
                <ReportList title="Expenses by Category" data={expensesByCategory} moneyValues />
                <section className="panel">
                  <h2>Marketing Summary</h2>
                  <p>All-time Marketing Spend: {money(totalMarketingSpend)}</p>
                  <p>Monthly Marketing Spend: {money(monthlyMarketingSpend)}</p>
                  <p>Profit After Marketing: {money(estimatedProfitAfterMarketing)}</p>
                  <p>Marketing ROI: Unavailable until linked sales are connected.</p>
                </section>
                <ReportList title="Forge Inventory by Category" data={inventoryByCategory} />
                <ReportList title="Inventory by Status" data={inventoryByStatus} />
              </>
            )}

            {(!reportFocus || reportFocus === "needsPhotos") && (
              <ActionReport
                title="Needs Photos"
                items={needsPhotosItems}
                button="Update Item"
                action={startEditingItem}
              />
            )}

            {(!reportFocus || reportFocus === "needsMarket") && (
              <ActionReport
                title="Needs Market Check"
                items={needsMarketCheckItems}
                button="Update Market"
                action={startEditingItem}
              />
            )}

            {(!reportFocus || reportFocus === "missingMsrp") && (
              <ActionReport
                title="Missing MSRP"
                items={missingMsrpItems}
                button="Add MSRP"
                action={startEditingItem}
              />
            )}

            {(!reportFocus || reportFocus === "missingMarket") && (
              <ActionReport
                title="Missing Market Price"
                items={missingMarketPriceItems}
                button="Add Market Price"
                action={startEditingItem}
              />
            )}

            {(!reportFocus || reportFocus === "missingBarcode") && (
              <ActionReport
                title="Missing UPC / Barcode"
                items={missingBarcodeItems}
                button="Add UPC"
                action={startEditingItem}
              />
            )}

            {(!reportFocus || reportFocus === "missingType") && (
              <ActionReport
                title="Missing Product Type"
                items={missingProductTypeItems}
                button="Add Type"
                action={startEditingItem}
              />
            )}

            {(!reportFocus || reportFocus === "missingSalePrice") && (
              <ActionReport
                title="Missing Sale Price"
                items={missingSalePriceItems}
                button="Add Sale Price"
                action={startEditingItem}
                secondaryButton="Quick Price"
                secondaryAction={quickUpdatePlannedSalePrice}
              />
            )}

            {(!reportFocus || reportFocus === "readyToList") && (
              <ActionReport
                title="Ready to List"
                items={readyToListItems}
                button="Update Listing"
                action={startEditingItem}
              />
            )}

            {(!reportFocus || reportFocus === "listed") && (
              <ActionReport
                title="Listed Items"
                items={listedItems}
                button="Update Item"
                action={startEditingItem}
              />
            )}

            {(!reportFocus || reportFocus === "lowStock") && (
              <ActionReport
                title="Low Stock / Sold Out"
                items={lowStockItems}
                button="Restock / Rebuy"
                action={prepareRestock}
              />
            )}
          </>);
  }

  return renderDeferredLegacyReports();
}
