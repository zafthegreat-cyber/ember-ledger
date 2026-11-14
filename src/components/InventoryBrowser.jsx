import { useMemo, useState } from 'react';
import { BottomSheet, EmptyState, PrimaryButton, QuietButton, SearchField, StatusBadge } from './operations/OperationsUI.jsx';
import { SelectField } from './operations/RecordExperience.jsx';
import ItemPhoto from './ItemPhoto.jsx';
import { BUSINESS_INVENTORY_STOCK_FILTERS } from '../utils/businessInventorySearch.mjs';
import { getRecordGame, getRecordGameLabel } from '../utils/collectibleGames.mjs';
import { filterInventoryRows, inventoryGroups, inventoryName, inventoryStockLabel, inventoryStorage, inventoryType, sortInventoryGroups } from '../utils/inventoryBrowse.mjs';
import { priceMetadataLabel } from '../utils/collectionBrowse.mjs';
import './inventory-browser.css';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const money = value => value == null ? 'Not recorded' : currency.format(value);
const options = (rows, value, label = value) => [...new Map(rows.map(row => [value(row), label(row)])).entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label }));
const resale = group => group.resaleLow == null ? 'Not recorded' : group.resaleLow === group.resaleHigh ? money(group.resaleLow) : `${money(group.resaleLow)}–${money(group.resaleHigh)}`;

export default function InventoryBrowser({ records, available, cost, onOpen, onAdd, resolveItemImage, totals }) {
  const [query, setQuery] = useState(''), [stock, setStock] = useState('available');
  const [game, setGame] = useState('all'), [type, setType] = useState('all'), [storage, setStorage] = useState('all');
  const [missingCost, setMissingCost] = useState(false), [sort, setSort] = useState('name'), [view, setView] = useState('cards');
  const [limit, setLimit] = useState(24), [selectedKey, setSelectedKey] = useState('');
  const filtered = useMemo(() => filterInventoryRows(records, { query, stock, game, type, storage, missingCost, available, cost }), [records, query, stock, game, type, storage, missingCost, available, cost]);
  const allGroups = useMemo(() => inventoryGroups(records, { available, cost }), [records, available, cost]);
  const groups = useMemo(() => sortInventoryGroups(inventoryGroups(filtered, { available, cost }), sort), [filtered, available, cost, sort]);
  const selected = allGroups.find(group => group.key === selectedKey);
  const missing = records.filter(row => cost(row) == null);
  const hasFilters = query.trim() || stock !== 'available' || game !== 'all' || type !== 'all' || storage !== 'all' || missingCost;
  const update = setter => value => { setter(value); setLimit(24); };
  const reset = () => { setQuery(''); setStock('available'); setGame('all'); setType('all'); setStorage('all'); setMissingCost(false); setLimit(24); };
  const open = group => { const whole = allGroups.find(candidate => candidate.records.includes(group.item)); setSelectedKey(whole?.key || group.key); };
  const stockCounts = Object.fromEntries(BUSINESS_INVENTORY_STOCK_FILTERS.map(filter => [filter.key, inventoryGroups(filterInventoryRows(records, { stock: filter.key, available, cost }), { available, cost }).length]));
  const quantity = group => `${group.quantity}${group.unknownQuantity ? ` + ${group.unknownQuantity} lot${group.unknownQuantity === 1 ? '' : 's'} to review` : ''}`;
  const costLabel = group => `${money(group.cost)}${group.unknownCost && group.cost != null ? ' known' : ''}`;
  return <section className="inventory-browser" aria-label="Current inventory">
    <div className="inventory-browser-search"><SearchField label="Search inventory" value={query} onChange={update(setQuery)} placeholder="Name, set, barcode or storage" /><QuietButton disabled={!hasFilters} onClick={reset}>Reset filters</QuietButton></div>
    <div className="business-inventory-filters" role="group" aria-label="Inventory stock filters">{BUSINESS_INVENTORY_STOCK_FILTERS.map(filter => <button className="business-inventory-filter" type="button" key={filter.key} aria-pressed={stock === filter.key} onClick={() => update(setStock)(filter.key)}>{filter.label} <span>{stockCounts[filter.key]}</span></button>)}</div>
    <div className="inventory-browser-controls">
      <SelectField label="Game" value={game} onChange={update(setGame)} options={[{ value: 'all', label: 'All games' }, ...options(records, getRecordGame, getRecordGameLabel)]} />
      <SelectField label="Product type" value={type} onChange={update(setType)} options={[{ value: 'all', label: 'All product types' }, ...options(records, inventoryType)]} />
      <SelectField label="Storage" value={storage} onChange={update(setStorage)} options={[{ value: 'all', label: 'All locations' }, ...options(records, inventoryStorage)]} />
      <SelectField label="Sort inventory" value={sort} onChange={setSort} options={[{ value: 'name', label: 'Name' }, { value: 'date', label: 'Newest acquisition' }, { value: 'quantity', label: 'Most available' }, { value: 'storage', label: 'Storage' }, { value: 'cost', label: 'Highest available cost' }]} />
    </div>
    <div className="inventory-browser-meta"><p role="status">Showing {Math.min(limit, groups.length)} of {groups.length} product{groups.length === 1 ? '' : 's'} · {filtered.length} purchase record{filtered.length === 1 ? '' : 's'}</p><div role="group" aria-label="Inventory view">{['cards', 'table'].map(mode => <QuietButton key={mode} aria-pressed={view === mode} onClick={() => setView(mode)}>{mode === 'cards' ? 'Cards' : 'Table'}</QuietButton>)}</div></div>
    {totals}
    {missing.length ? <div className="business-inventory-attention"><span>{missing.length} purchase record{missing.length === 1 ? ' needs' : 's need'} costs</span><QuietButton aria-pressed={missingCost} onClick={() => { setMissingCost(value => !value); setStock('all'); setQuery(''); setGame('all'); setType('all'); setStorage('all'); setLimit(24); }}>{missingCost ? 'Close cost review' : 'Review missing costs'}</QuietButton></div> : null}
    {missingCost ? <p className="inventory-browser-note">Cost review: choose any purchase record below. Original quantities, purchase dates, and prices are kept.</p> : null}
    {!records.length ? <EmptyState title="No resale inventory" action={<PrimaryButton onClick={onAdd}>Add inventory</PrimaryButton>}>Add acquired inventory or move a collection item to resale.</EmptyState>
      : !groups.length ? <EmptyState title="No matching inventory" action={<><QuietButton onClick={reset}>Reset filters</QuietButton><QuietButton onClick={() => { reset(); setStock('all'); }}>Show all inventory</QuietButton></>}>Your {records.length} purchase record{records.length === 1 ? ' is' : 's are'} still saved. Try another search or stock filter.</EmptyState>
        : view === 'table' ? <div className="inventory-browser-table" tabIndex={0} role="region" aria-label="Inventory table, scroll horizontally on smaller screens"><table><caption className="sr-only">Matching inventory products</caption><thead><tr>{['Product', 'Available', 'Available cost', 'Resale per unit', 'Storage'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{groups.slice(0, limit).map(group => <tr key={group.key}><th scope="row"><button type="button" onClick={() => open(group)}>{inventoryName(group.item)}<small>{group.records.length} purchase record{group.records.length === 1 ? '' : 's'} · {inventoryStockLabel(group.records, available)}</small></button></th><td>{quantity(group)}</td><td>{costLabel(group)}</td><td>{resale(group)}</td><td>{group.locations.join(', ')}</td></tr>)}</tbody></table></div>
          : <div className="inventory-browser-products">{groups.slice(0, limit).map(group => <button type="button" key={group.key} className="inventory-product" onClick={() => open(group)} aria-label={`Open ${inventoryName(group.item)}, ${quantity(group)} available, ${group.records.length} purchase record${group.records.length === 1 ? '' : 's'}`}><ItemPhoto src={resolveItemImage(group.item)} alt="" /><span className="inventory-product-body"><span className="inventory-product-heading"><strong>{inventoryName(group.item)}</strong><StatusBadge>{inventoryStockLabel(group.records, available)}</StatusBadge></span><span className="inventory-product-context">{getRecordGameLabel(group.item)} · {group.records.length} purchase record{group.records.length === 1 ? '' : 's'}</span>{priceMetadataLabel(group.records) ? <small className="inventory-product-context">{priceMetadataLabel(group.records)}</small> : null}<span className="inventory-product-facts"><span>Available<strong>{quantity(group)}</strong></span><span>Available cost<strong>{costLabel(group)}</strong></span><span>Resale per unit<strong>{resale(group)}</strong></span><span>Storage<strong>{group.locations.join(', ')}</strong></span></span></span></button>)}</div>}
    {groups.length > limit ? <QuietButton onClick={() => setLimit(value => value + 24)}>Show next {Math.min(24, groups.length - limit)} · {groups.length - limit} remaining</QuietButton> : null}
    <BottomSheet open={Boolean(selected)} title={selected ? inventoryName(selected.item) : 'Purchase records'} onClose={() => setSelectedKey('')}>
      {selected ? <div className="inventory-lots"><p>{quantity(selected)} available across {selected.records.length} original purchase record{selected.records.length === 1 ? '' : 's'}. Choose a record to view its costs, details, or record a sale.</p>{selected.records.map((row, index) => <button type="button" key={`${row._recordOrigin}:${row.id}:${index}`} onClick={() => { setSelectedKey(''); onOpen(row); }}><strong>{row.purchaseDate || 'Purchase date not recorded'} · {inventoryStorage(row)}</strong><span>{inventoryStockLabel([row], available)} · {available(row) ?? 'Unknown'} available · {money(cost(row))} available cost</span><small>{[row.purchaseSource || row.source, row.lotId ? `Lot ${row.lotId}` : '', row.status ? `Recorded status: ${row.status}` : ''].filter(Boolean).join(' · ')}</small></button>)}</div> : null}
    </BottomSheet>
  </section>;
}
