import { remainingStockCost } from '../utils/businessInventoryTotals.mjs';
import { useId, useState } from 'react';
import { DetailList, SelectField, TextField } from './operations/RecordExperience.jsx';
import { BottomSheet, EmptyState, QuietButton, SearchField } from './operations/OperationsUI.jsx';
import { SALE_STATUSES } from '../features/flipScout/constants.js';
import { possibleDuplicateSales, saleStockPreview, saleCalculationRows } from '../utils/saleReviewPresentation.mjs';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const money = value => value === '' || value == null || !Number.isFinite(Number(value)) ? 'Not recorded' : currency.format(Number(value));

export default function SaleFormFields({ step, form, set, selectedInventory, choices, inventoryQuery, onInventoryQuery, quantityError, available, suggestedCogs, saleResult, onAddInventory, sales = [] }) {
  const channelId=useId(),inventoryPickerId=useId(),[peek,setPeek]=useState(null);
  const channels=[...new Set(sales.map(row=>String(row.salesChannel||'').trim()).filter(Boolean))].sort();
  const duplicates=possibleDuplicateSales(sales,form),stock=saleStockPreview(available,form);
  const cogs=selectedInventory?.provenanceManaged===true||form.allocatedCostOfGoodsSold===''?suggestedCogs:form.allocatedCostOfGoodsSold;
  const peekDialog=<BottomSheet open={Boolean(peek)} title={peek?.kind==='purchase'?'Original acquisition':'Possible existing sale'} onClose={()=>{const returnToPicker=peek?.kind==="purchase";setPeek(null);if(returnToPicker)window.requestAnimationFrame(()=>document.getElementById(inventoryPickerId)?.focus());}}>{peek?<DetailList items={peek.kind==='purchase'?[{label:'Item',value:peek.record.name||peek.record.title},{label:'Purchase date',value:peek.record.purchaseDate||'Not recorded'},{label:'Source',value:peek.record.purchaseSource||peek.record.store||peek.record.source||'Not recorded'},{label:'Condition',value:peek.record.condition||'Not recorded'},{label:'Recorded purchase cost',value:money(remainingStockCost(peek.record,0))},{label:'Storage',value:peek.record.storageLocation||'Not assigned'}]:[{label:'Sale date',value:peek.record.saleDate},{label:'Channel',value:peek.record.salesChannel},{label:'Quantity',value:peek.record.quantitySold},{label:'Total (USD)',value:money(peek.record.grossSalePrice)},{label:'Status',value:peek.record.status},{label:'Sale reference',value:peek.record.id}]}/>:null}<p>Read-only reference. Your sale draft stays open and unchanged.</p></BottomSheet>;
  const duplicateNotice=duplicates.length?<section className="sale-duplicate-review is-wide" aria-label="Possible duplicate sale"><strong>This may already be recorded</strong><p>{duplicates.length} existing sale{duplicates.length===1?' matches':'s match'} this purchase, date, channel, quantity and total. Review before saving again; separate real sales can have the same details.</p>{duplicates.map(row=><QuietButton key={row.id} onClick={()=>setPeek({kind:'sale',record:row})}>Review sale · {row.saleDate} · {row.status}</QuietButton>)}<small>Nothing is combined or removed. Continue only if this is a separate sale.</small></section>:null;
  const incompleteAmounts=['sellingFees','paymentFees','actualOutboundShipping','packaging','otherCosts','discounts','refunds','shippingChargedToBuyer'].some(key=>form[key]===''||form[key]==null);
  const netLabel=incompleteAmounts?'Estimated net proceeds':'Net proceeds',profitLabel=incompleteAmounts?'Estimated profit':'Realized profit';
  const amount = (key, label, extra = {}) => <TextField label={label} type="number" inputMode="decimal" min="0" step="0.01" value={form[key] ?? ''} onChange={set(key)} {...extra} />;
  if (step === 0) return <>
    <p className="sale-currency-note is-wide">Amounts are in <strong>USD</strong>. No currency conversion is applied.</p>
    <SelectField label="Recording as" value={form.status} onChange={set('status')} options={SALE_STATUSES} helper={stock.consumes?'A completed sale uses its recorded inventory quantity.':'Draft and cancelled sales do not consume stock.'}/>
    {!choices.some(option => !option.disabled) && !inventoryQuery ? <div className="is-wide"><EmptyState title="No saleable inventory" action={onAddInventory ? <QuietButton onClick={onAddInventory}>Add inventory</QuietButton> : null}>Add stock before recording a new sale. Sold-out and unknown-quantity records stay in your history.</EmptyState></div> : null}
    <SearchField label="Find inventory for this sale" value={inventoryQuery} onChange={onInventoryQuery} placeholder="Name, barcode, SKU, storage" />
    <SelectField id={inventoryPickerId} label="Inventory item" required value={form.inventoryItemId} onChange={set('inventoryItemId')} options={[{ value: '', label: 'Choose a purchase record' }, ...choices]} helper="Choose the original purchase record. Its cost and sale history stay linked." />
    {selectedInventory?<QuietButton onClick={()=>setPeek({kind:'purchase',record:selectedInventory})}>Inspect acquisition</QuietButton>:null}
    <TextField label="Quantity sold" type="number" inputMode="numeric" min="1" value={form.quantitySold} onChange={set('quantitySold')} error={quantityError} helper={selectedInventory ? `${available ?? 'Unknown'} available from this purchase record.` : ''} />
    <TextField label="Sales channel" value={form.salesChannel} onChange={set('salesChannel')} list={channelId} /><datalist id={channelId}>{channels.map(channel=><option key={channel} value={channel}/>)}</datalist>
    <TextField label="Sale date" type="date" value={form.saleDate} onChange={set('saleDate')} />
    {amount('grossSalePrice', 'Sale price — transaction total', { helper: Number(form.quantitySold) > 1 && form.grossSalePrice !== '' ? `${money(Number(form.grossSalePrice) / Number(form.quantitySold))} per item × ${form.quantitySold}. Enter the total for all items, before fees.` : 'Total for all items in this sale, before fees. Shipping charged to the buyer is entered separately.' })}
    {duplicateNotice}{peekDialog}
  </>;
  if (step === 1) return <>
    <p className="sale-currency-note is-wide">USD amounts. Blank optional expenses contribute $0 to this calculation but remain unrecorded; enter 0 only when you know no expense occurred.</p>
    {amount('sellingFees', 'Selling fees')}{amount('actualOutboundShipping', 'Outbound shipping cost')}
    <TextField label="Allocated cost of goods sold" helper={selectedInventory?.provenanceManaged === true ? 'Exact cost from the original acquisition lot; it cannot be overridden.' : suggestedCogs ? `Suggested for this quantity: ${money(suggestedCogs)}` : 'Cost assigned to the sold quantity.'} type="number" inputMode="decimal" min="0" step="0.01" value={selectedInventory?.provenanceManaged === true ? suggestedCogs : form.allocatedCostOfGoodsSold} onChange={set('allocatedCostOfGoodsSold')} disabled={selectedInventory?.provenanceManaged === true} />
    <details className="sale-additional-costs"><summary>Additional costs & adjustments</summary><div>{amount('discounts', 'Discounts')}{amount('paymentFees', 'Payment fees')}{amount('shippingChargedToBuyer', 'Shipping charged to buyer')}{amount('packaging', 'Packaging')}{amount('refunds', 'Refunds')}{amount('otherCosts', 'Other costs')}</div></details>
  </>;
  return <>
    <p className="sale-currency-note is-wide">Sale review · USD</p>
    <SelectField label="Sale status" value={form.status} onChange={set('status')} options={SALE_STATUSES} helper={['draft', 'cancelled'].includes(String(form.status).toLowerCase()) ? 'This status does not consume inventory.' : 'Saving this sale consumes its recorded quantity. Refunds require an inspected return before stock is restored.'} />
    <div className="sale-review-summary"><h3>Review sale</h3><DetailList items={[
      { label: 'Item', value: selectedInventory?.name || selectedInventory?.title || 'Choose inventory' },
      { label: 'Purchase record', value: [selectedInventory?.purchaseDate, selectedInventory?.purchaseSource, selectedInventory?.storageLocation].filter(Boolean).join(' · ') || 'No acquisition details recorded' },
      { label: 'Quantity sold', value: form.quantitySold }, { label: 'Available before', value: stock.available ?? 'Unknown' }, { label: 'Available after saving', value: stock.after ?? 'Unknown' }, { label: 'Stock effect', value: stock.consumes ? 'Recorded quantity will be used' : 'No stock used for this status' }, { label: 'Sale date', value: form.saleDate }, { label: 'Sales channel', value: form.salesChannel || 'Not recorded' },
      { label: 'Sale price — transaction total', value: money(form.grossSalePrice) },
      { label: 'Shipping charged to buyer', value: money(form.shippingChargedToBuyer) }, { label: 'Discounts / refunds', value: `${money(form.discounts)} / ${money(form.refunds)}` },
      { label: 'Selling / payment fees', value: `${money(form.sellingFees)} / ${money(form.paymentFees)}` }, { label: 'Shipping / packaging / other costs', value: [form.actualOutboundShipping, form.packaging, form.otherCosts].map(money).join(' / ') },
      { label: 'Cost of goods sold', value: money(selectedInventory?.provenanceManaged === true || form.allocatedCostOfGoodsSold === '' ? suggestedCogs : form.allocatedCostOfGoodsSold) },
      { label: netLabel, value: money(saleResult.netProceeds) }, { label: profitLabel, value: money(saleResult.realizedProfit) },
    ]} />{quantityError ? <p role="alert" className="ops-form-error">{quantityError}</p> : null}</div>
    <details className="sale-calculation is-wide"><summary>How the profit is calculated</summary><p>Blank optional fields are calculated as zero but stay unrecorded in your saved sale. Purchase costs are not market prices.</p><DetailList items={saleCalculationRows(form,cogs).map(row=>({label:row.label,value:(row.amount<0?'−':'+')+money(Math.abs(row.amount))+(row.unrecorded?' · unrecorded; calculated as $0':'')}))}/><p><strong>{netLabel} {money(saleResult.netProceeds)} · {profitLabel} {money(saleResult.realizedProfit)} USD</strong></p></details>
    {duplicateNotice}{peekDialog}
    <TextField className="is-wide" label="Notes" multiline value={form.notes} onChange={set('notes')} />
  </>;
}
