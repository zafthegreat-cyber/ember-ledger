import { groupCollectionCopies } from './collectionCopyGroups.mjs';
import { businessRecordMatchesQuery, filterBusinessInventory } from './businessInventorySearch.mjs';
import { getRecordGame } from './collectibleGames.mjs';

export const inventoryName = row => row.name || row.title || row.cardName || row.productName || 'Untitled item';
export const inventoryType = row => row.productClassification || row.productType || 'Unspecified';
export const inventoryStorage = row => row.storageLocation || 'Not assigned';

// Presentation only: groups retain original lot objects. Never save a group.
export function inventoryGroups(records, { available, cost }) {
  return groupCollectionCopies(records).map(group => {
    const quantities = group.records.map(available);
    const costs = group.records.map(cost);
    const estimates = group.records.map(row => row.projectedResaleMid).filter(value => value !== '' && value != null && Number.isFinite(Number(value)) && Number(value) >= 0).map(Number);
    return { ...group, quantity: quantities.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0),
      unknownQuantity: quantities.filter(value => !Number.isFinite(value)).length,
      cost: costs.some(Number.isFinite) ? costs.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0) : null,
      unknownCost: costs.filter(value => !Number.isFinite(value)).length,
      resaleLow: estimates.length ? Math.min(...estimates) : null, resaleHigh: estimates.length ? Math.max(...estimates) : null,
      locations: [...new Set(group.records.map(inventoryStorage))],
      newestPurchase: group.records.map(row => row.purchaseDate || row.createdAt || '').sort().at(-1) || '' };
  });
}

export function inventoryStockLabel(records, available) {
  const quantities = records.map(available);
  if (quantities.some(value => !Number.isFinite(value))) return 'Quantity needs review';
  if (quantities.every(value => value === 0)) return 'Sold out';
  const active = records.filter((_, index) => quantities[index] > 0);
  const states = new Set(active.map(row => String(row.currentStatus || row.status || '').trim().toLowerCase()));
  if (states.size === 1 && states.has('listed')) return 'Listed';
  if (states.size === 1 && states.has('preparing')) return 'Preparing';
  return 'Available';
}

export function filterInventoryRows(records, { query = '', stock = 'available', game = 'all', type = 'all', storage = 'all', missingCost = false, unknownQuantityOnly = false, available, cost }) {
  return filterBusinessInventory(records, { stockFilter: stock, getAvailableQuantity: available }).filter(row =>
    businessRecordMatchesQuery(row, query) && (game === 'all' || getRecordGame(row) === game)
    && (type === 'all' || inventoryType(row) === type) && (storage === 'all' || inventoryStorage(row) === storage)
    && (!missingCost || cost(row) == null) && (!unknownQuantityOnly || !Number.isFinite(available(row))));
}

export function sortInventoryGroups(groups, sort = 'name', direction = 'default') {
  const descendingDefault = ['date','quantity','cost'].includes(sort);
  const multiplier = direction === 'default' || (direction === 'desc') === descendingDefault ? 1 : -1;
  return [...groups].sort((a, b) => multiplier * ((sort === 'date' ? b.newestPurchase.localeCompare(a.newestPurchase)
    : sort === 'quantity' ? b.quantity - a.quantity
      : sort === 'cost' ? (b.cost ?? -1) - (a.cost ?? -1)
        : sort === 'storage' ? a.locations.join(', ').localeCompare(b.locations.join(', ')) : 0)
    || inventoryName(a.item).localeCompare(inventoryName(b.item), undefined, { numeric: true })) || a.key.localeCompare(b.key));
}

export const inventoryRecordKey = row => `${row._recordOrigin || 'repository'}:${row.id}`;
export function inventoryLocationQuantities(records, available) {
  const locations = new Map();
  for (const row of records) { const label=inventoryStorage(row), quantity=available(row), current=locations.get(label)||{label,quantity:0,unknown:0}; if(Number.isFinite(quantity))current.quantity+=quantity;else current.unknown++;locations.set(label,current); }
  return [...locations.values()].sort((a,b)=>a.label.localeCompare(b.label));
}
export function browseInventoryLots(records, query='', order='newest') {
  return records.filter(row=>businessRecordMatchesQuery({...row,description:[row.description,row.purchaseDate,row.purchaseSource,row.source].filter(Boolean).join(' ')},query)).slice().sort((a,b)=>(order==='oldest'?1:-1)*String(a.purchaseDate||a.createdAt||'').localeCompare(String(b.purchaseDate||b.createdAt||''))||inventoryRecordKey(a).localeCompare(inventoryRecordKey(b)));
}

export function saleInventoryChoices(records, { available, editingItemId = '', selectedId = '', query = '' }) {
  return records.filter(row => row.id === selectedId || businessRecordMatchesQuery(row, query)).map(row => {
    const quantity = available(row);
    const historical = row.id === editingItemId;
    const unavailable = !Number.isFinite(quantity) || quantity <= 0;
    return { value: row.id, disabled: unavailable && !historical,
      label: [inventoryName(row), Number.isFinite(quantity) ? `${quantity} available` : 'quantity not recorded', row.purchaseDate, row.storageLocation,
        unavailable ? historical ? 'historical sale item' : 'unavailable for a new sale' : ''].filter(Boolean).join(' · ') };
  });
}

export function filterSalesHistory(records, { query = '', status = 'all', from = '', to = '' } = {}, inventory = []) {
  const byId = new Map(inventory.map(row => [row.id, row]));
  return records.filter(row => {
    const date = String(row.saleDate || '').slice(0, 10);
    return (status === 'all' || String(row.status || '').toLowerCase() === status)
      && (!from || date >= from) && (!to || (date && date <= to))
      && (!query.trim() || businessRecordMatchesQuery(row, query) || businessRecordMatchesQuery(byId.get(row.inventoryItemId) || {}, query));
  }).slice().sort((a, b) => String(b.saleDate || '').localeCompare(String(a.saleDate || '')));
}
