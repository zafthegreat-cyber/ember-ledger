import { useState } from "react";
import { PortfolioItemGrid } from "./CollectionPortfolioViews.jsx";
import { getPortfolioItemValuation } from "../utils/collectionPortfolio.mjs";
import "./collection-sets.css";

const EMPTY_ROWS = Object.freeze([]);
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function artworkUrl(value) {
  if (typeof value !== "string") return "";
  const url = value.trim();
  return /^(?:https?:\/\/|\/(?!\/)|\.{1,2}\/)/i.test(url) ? url : "";
}

// Set releases are calendar dates. UTC formatting keeps the date unchanged in
// the collector's time zone, and malformed dates are never shown as releases.
function releaseDate(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{4})[-/](\d{2})[-/](\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = `${year}-${month}-${day}`;
  const timestamp = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(timestamp.getTime()) || timestamp.toISOString().slice(0, 10) !== date) return null;
  return { date, label: dateFormat.format(timestamp) };
}

function setTitle(row) { return row.name || row.setName || "Unnamed set"; }

export function SetArtwork({ row = {} }) {
  const [failedSources, setFailedSources] = useState([]);
  const logo = [artworkUrl(row.logoUrl), artworkUrl(row.symbolUrl)].find((source) => source && !failedSources.includes(source));
  const date = releaseDate(row.releaseDate);
  return <span className="collection-sets-artwork" data-artwork={logo ? "logo" : "fallback"} data-has-release={Boolean(date)}>
    {logo ? <img className="collection-sets-artwork-logo" src={logo} alt={`${setTitle(row)} set artwork`} loading="lazy" decoding="async" onError={() => setFailedSources((previous) => previous.includes(logo) ? previous : [...previous, logo])} /> : <span className="collection-sets-artwork-fallback"><strong>{setTitle(row)}</strong><span>Set artwork unavailable</span></span>}
    {date ? <time className="collection-sets-release" dateTime={date.date}>{date.label}</time> : null}
  </span>;
}

function SetSavedValue({ row, showValues }) {
  if (!showValues) return <span className="collection-sets-value">Value hidden</span>;
  const itemCount = Number.isSafeInteger(row.itemCount) && row.itemCount >= 0 ? row.itemCount : 0;
  const knownCount = Number.isSafeInteger(row.knownValueCount) && row.knownValueCount >= 0 ? Math.min(row.knownValueCount, itemCount) : 0;
  const total = typeof row.totalValue === "number" && Number.isFinite(row.totalValue) && row.totalValue >= 0 ? row.totalValue : null;
  if (total == null || (itemCount > 0 && knownCount === 0)) return <span className="collection-sets-value collection-sets-muted">No saved value</span>;
  return <><span className="collection-sets-value">Saved value <strong>{money.format(total)}</strong></span>{knownCount < itemCount ? <span className="collection-sets-value-coverage">{knownCount} of {itemCount} records valued</span> : null}</>;
}

export function CollectionSetGrid({ rows = EMPTY_ROWS, onOpen, showValues = true }) {
  const nameCounts = new Map();
  for (const row of rows) { const name = setTitle(row).toLocaleLowerCase(); nameCounts.set(name, (nameCounts.get(name) || 0) + 1); }
  return <ul className="collection-sets-grid" aria-label="Trading card sets">{rows.map((row, index) => {
    const progress = typeof row.progressPercent === "number" && Number.isFinite(row.progressPercent) && row.progressPercent >= 0 && row.progressPercent <= 100 ? row.progressPercent : null;
    return <li key={row.id || row.key || `${row.code || setTitle(row)}-${index}`}><button type="button" className="collection-sets-card" data-set-id={row.id} aria-label={`Open ${setTitle(row)}${nameCounts.get(setTitle(row).toLocaleLowerCase()) > 1 ? ` (${row.gameName || "Game not recorded"})` : ""}`} onClick={() => onOpen?.(row)}>
      <SetArtwork row={row} />
      <span className="collection-sets-card-copy"><strong className="collection-sets-card-name">{setTitle(row)}</strong>{row.gameName || row.series ? <span className="collection-sets-card-series">{[row.gameName, row.series].filter(Boolean).join(" · ")}</span> : null}<span className="collection-sets-progress-label">{row.progressLabel || "Checklist unavailable"}</span>{progress != null ? <progress className="collection-sets-progress" value={progress} max="100" aria-label={`${setTitle(row)} collection completion`}>{Math.round(progress)}%</progress> : null}<SetSavedValue row={row} showValues={showValues} /></span>
    </button></li>;
  })}</ul>;
}

function itemValue(item) { return getPortfolioItemValuation(item).value; }

export function CollectionSetItems({ items = EMPTY_ROWS, onOpenItem, resolveItemImage, showValues = true }) {
  return <div className="collection-sets-items"><PortfolioItemGrid items={items} onOpen={onOpenItem} resolveItemImage={resolveItemImage} valueForItem={itemValue} hidden={!showValues} mode="grid" /></div>;
}
