import { DetailList, SelectField, TextField } from './operations/RecordExperience.jsx';
import { EmptyState, QuietButton, SearchField } from './operations/OperationsUI.jsx';
import { SALE_STATUSES } from '../features/flipScout/constants.js';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const money = value => value === '' || value == null || !Number.isFinite(Number(value)) ? 'Not recorded' : currency.format(Number(value));

export default function SaleFormFields({ step, form, set, selectedInventory, choices, inventoryQuery, onInventoryQuery, quantityError, available, suggestedCogs, saleResult, onAddInventory }) {
  const amount = (key, label, extra = {}) => <TextField label={label} type="number" inputMode="decimal" min="0" step="0.01" value={form[key] ?? ''} onChange={set(key)} {...extra} />;
  if (step === 0) return <>
    {!choices.some(option => !option.disabled) && !inventoryQuery ? <div className="is-wide"><EmptyState title="No saleable inventory" action={onAddInventory ? <QuietButton onClick={onAddInventory}>Add inventory</QuietButton> : null}>Add stock before recording a new sale. Sold-out and unknown-quantity records stay in your history.</EmptyState></div> : null}
    <SearchField label="Find inventory for this sale" value={inventoryQuery} onChange={onInventoryQuery} placeholder="Name, barcode, SKU, storage" />
    <SelectField label="Inventory item" required value={form.inventoryItemId} onChange={set('inventoryItemId')} options={[{ value: '', label: 'Choose a purchase record' }, ...choices]} helper="Choose the original purchase record. Its cost and sale history stay linked." />
    <TextField label="Quantity sold" type="number" inputMode="numeric" min="1" value={form.quantitySold} onChange={set('quantitySold')} error={quantityError} helper={selectedInventory ? `${available ?? 'Unknown'} available from this purchase record.` : ''} />
    <TextField label="Sales channel" value={form.salesChannel} onChange={set('salesChannel')} />
    <TextField label="Sale date" type="date" value={form.saleDate} onChange={set('saleDate')} />
    {amount('grossSalePrice', 'Sale price — transaction total', { helper: Number(form.quantitySold) > 1 && form.grossSalePrice !== '' ? `${money(Number(form.grossSalePrice) / Number(form.quantitySold))} per item × ${form.quantitySold}. Enter the total for all items, before fees.` : 'Total for all items in this sale, before fees. Shipping charged to the buyer is entered separately.' })}
  </>;
  if (step === 1) return <>
    {amount('sellingFees', 'Selling fees')}{amount('actualOutboundShipping', 'Outbound shipping cost')}
    <TextField label="Allocated cost of goods sold" helper={selectedInventory?.provenanceManaged === true ? 'Exact cost from the original acquisition lot; it cannot be overridden.' : suggestedCogs ? `Suggested for this quantity: ${money(suggestedCogs)}` : 'Cost assigned to the sold quantity.'} type="number" inputMode="decimal" min="0" step="0.01" value={selectedInventory?.provenanceManaged === true ? suggestedCogs : form.allocatedCostOfGoodsSold} onChange={set('allocatedCostOfGoodsSold')} disabled={selectedInventory?.provenanceManaged === true} />
    <details className="sale-additional-costs"><summary>Additional costs & adjustments</summary><div>{amount('discounts', 'Discounts')}{amount('paymentFees', 'Payment fees')}{amount('shippingChargedToBuyer', 'Shipping charged to buyer')}{amount('packaging', 'Packaging')}{amount('refunds', 'Refunds')}{amount('otherCosts', 'Other costs')}</div></details>
  </>;
  return <>
    <SelectField label="Sale status" value={form.status} onChange={set('status')} options={SALE_STATUSES} helper={['draft', 'cancelled'].includes(String(form.status).toLowerCase()) ? 'This status does not consume inventory.' : 'Saving this sale consumes its recorded quantity. Refunds require an inspected return before stock is restored.'} />
    <div className="sale-review-summary"><h3>Review sale</h3><DetailList items={[
      { label: 'Item', value: selectedInventory?.name || selectedInventory?.title || 'Choose inventory' },
      { label: 'Purchase record', value: [selectedInventory?.purchaseDate, selectedInventory?.purchaseSource, selectedInventory?.storageLocation].filter(Boolean).join(' · ') || 'No acquisition details recorded' },
      { label: 'Quantity sold', value: form.quantitySold }, { label: 'Sale date', value: form.saleDate }, { label: 'Sales channel', value: form.salesChannel || 'Not recorded' },
      { label: 'Sale price — transaction total', value: money(form.grossSalePrice) },
      { label: 'Shipping charged to buyer', value: money(form.shippingChargedToBuyer) }, { label: 'Discounts / refunds', value: `${money(form.discounts)} / ${money(form.refunds)}` },
      { label: 'Selling / payment fees', value: `${money(form.sellingFees)} / ${money(form.paymentFees)}` }, { label: 'Shipping / packaging / other costs', value: [form.actualOutboundShipping, form.packaging, form.otherCosts].map(money).join(' / ') },
      { label: 'Cost of goods sold', value: money(selectedInventory?.provenanceManaged === true || form.allocatedCostOfGoodsSold === '' ? suggestedCogs : form.allocatedCostOfGoodsSold) },
      { label: 'Net proceeds', value: money(saleResult.netProceeds) }, { label: 'Realized profit', value: money(saleResult.realizedProfit) },
    ]} />{quantityError ? <p role="alert" className="ops-form-error">{quantityError}</p> : null}</div>
    <TextField className="is-wide" label="Notes" multiline value={form.notes} onChange={set('notes')} />
  </>;
}
