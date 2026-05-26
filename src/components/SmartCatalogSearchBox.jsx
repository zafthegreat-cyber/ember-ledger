import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  detectCatalogSearchMode,
  getCachedCatalogRecommendations,
  getCatalogRecommendations,
  isCatalogSearchDebugEnabled,
  normalizeCatalogQuery,
} from "../services/pokemonCatalogSearch";
import { searchCatalog } from "../utils/catalogSearchUtils";
import {
  getProductDisplayTitle,
  getProductImageFallback,
  getProductImageUrl,
  getProductSetLabel,
  getProductTypeLabel,
} from "../utils/productDisplayUtils";

function renderHighlighted(label, query) {
  const text = String(label || "");
  const needle = normalizeCatalogQuery(query);
  if (!needle || needle.length < 2) return text;
  const haystack = normalizeCatalogQuery(text);
  const index = haystack.indexOf(needle);
  if (index < 0) return text;
  const before = text.slice(0, index);
  const match = text.slice(index, index + needle.length);
  const after = text.slice(index + needle.length);
  return (
    <>
      {before}<mark>{match}</mark>{after}
    </>
  );
}

function CatalogSuggestionThumbnail({ suggestion }) {
  const [failed, setFailed] = useState(false);
  const product = suggestion.product || {};
  const imageUrl = !failed ? suggestion.imageUrl || getProductImageUrl(product) : "";
  if (suggestion.iconText && !suggestion.product) {
    return (
      <span className="smart-catalog-suggestion-thumb smart-catalog-scope-thumb">
        {suggestion.iconText}
      </span>
    );
  }
  const fallback = getProductImageFallback(product, {
    title: suggestion.label || getProductDisplayTitle(product),
    setName: getProductSetLabel(product),
    productType: suggestion.type || getProductTypeLabel(product),
  });

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span className="smart-catalog-suggestion-thumb branded-product-fallback">
      <strong>{fallback.title}</strong>
      <small>{fallback.meta}</small>
    </span>
  );
}

export default function SmartCatalogSearchBox({
  value,
  onChange,
  onSearch,
  onSelectSuggestion,
  supabase,
  isSupabaseConfigured,
  mapRow,
  productGroup = "All",
  dataFilter = "All",
  placeholder = "Search Pokemon catalog...",
  className = "",
  inputClassName = "",
  closeSignal = 0,
  maxSuggestions = 5,
  suggestionFilter = null,
  inlineResults = false,
  emptyMessage = "No matches found.",
  renderEmptyActions = null,
  money = (amount) => `$${Number(amount || 0).toFixed(2)}`,
  autoFocus = false,
  inputLabel = "",
  localCatalogProducts = [],
  includeScopeSuggestions = false,
  searchCategories = [],
  scopeSets = [],
  scopeProductTypes = [],
  suppressSuggestions = false,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [lastTiming, setLastTiming] = useState(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const requestId = useRef(0);
  const abortRef = useRef(null);
  const mapRowRef = useRef(mapRow);
  const deferredValue = useDeferredValue(value);
  const cleanedValue = normalizeCatalogQuery(deferredValue);
  const immediateCleanedValue = normalizeCatalogQuery(value);
  const showTiming = isCatalogSearchDebugEnabled();

  function titleForProduct(product = {}) {
    return getProductDisplayTitle(product) || "Catalog item";
  }

  function typeForProduct(product = {}) {
    return getProductTypeLabel(product) || "Product";
  }

  function buildLocalSuggestions(queryValue = "") {
    if (!Array.isArray(localCatalogProducts) || !localCatalogProducts.length) return [];
    return searchCatalog(queryValue, localCatalogProducts, Math.max(maxSuggestions, 8))
      .map((result, index) => {
        const product = result.item || {};
        const label = titleForProduct(product);
        const productType = typeForProduct(product);
        return {
          id: `local-${product.id || label}-${index}`,
          section: "Catalog Seeds",
          type: productType,
          label,
          description: [
            product.setName || product.set_name || product.expansion || "Set optional",
            productType,
            result.reason,
          ].filter(Boolean).join(" | "),
          badge: productType,
          searchValue: label,
          imageUrl: getProductImageUrl(product),
          marketPrice: product.marketPrice || product.market_price || product.marketValue || product.market_value || 0,
          product,
        };
      });
  }

  function buildScopeSuggestions(queryValue = "") {
    if (!includeScopeSuggestions) return [];
    const labelQuery = String(queryValue || "").trim();
    const normalized = normalizeCatalogQuery(labelQuery);
    const mode = detectCatalogSearchMode(labelQuery);
    const exactIdentifier = ["barcode", "id"].includes(mode);
    if (!normalized || (normalized.length < 2 && !exactIdentifier)) return [];

    const suggestions = [];
    const addSuggestion = (suggestion) => {
      if (!suggestion?.label) return;
      suggestions.push({
        section: "Narrow your search",
        searchValue: labelQuery,
        ...suggestion,
      });
    };

    if (exactIdentifier) {
      addSuggestion({
        id: `scope-barcode-${normalized}`,
        type: "UPC / SKU",
        label: "UPC / SKU lookup",
        description: "Search exact barcode, SKU, or product ID",
        badge: "UPC/SKU",
        mode: "barcode",
        iconText: "UPC",
      });
    }

    const category = searchCategories[0];
    if (category) {
      addSuggestion({
        id: `scope-category-${normalizeCatalogQuery(category.value || category.label || "pokemon")}`,
        type: "Category",
        label: `in ${category.label || category.value}`,
        description: category.description || `Search ${labelQuery} in ${category.label || category.value}`,
        badge: "Category",
        mode: "category",
        category: category.value || category.label,
        iconText: "TCG",
      });
    }

    const matchingSets = (Array.isArray(scopeSets) ? scopeSets : [])
      .map((set) => {
        const name = set.name || set.setName || set.label || "";
        const aliases = [name, set.code, set.setCode, set.series, ...(set.setAliases || []), ...(set.aliases || [])]
          .filter(Boolean)
          .map((item) => normalizeCatalogQuery(item));
        const bestMatch = aliases.some((alias) => {
          if (!alias) return false;
          if (alias.length <= 2 || normalized.length <= 2) return alias === normalized || normalized.split(" ").includes(alias);
          return alias.includes(normalized) || normalized.includes(alias);
        });
        return bestMatch && name ? { ...set, name } : null;
      })
      .filter(Boolean)
      .slice(0, 2);

    matchingSets.forEach((set, index) => {
      addSuggestion({
        id: `scope-set-${normalizeCatalogQuery(set.name)}-${index}`,
        type: "Set",
        label: `in Set: ${set.name}`,
        description: set.series ? `${set.series} expansion` : "Filter to this set or expansion",
        badge: "Set",
        mode: "set",
        setName: set.name,
        iconText: "SET",
      });
    });

    const sealedIntent = /\b(etb|elite trainer|booster|bundle|box|sealed|tin|blister|collection|upc|ultra premium|pack)\b/.test(normalized);
    const cardIntent = /\b(card|sir|ir|ex|gx|vmax|vstar|trainer|energy|reverse|holo|rare|pikachu|charizard|mew|eevee)\b/.test(normalized) ||
      /^(tg|gg|svp|h|rc)?\d{1,4}(\/(tg|gg|svp|h|rc)?\d{1,4})?$/.test(normalized);
    const baseTypes = Array.isArray(scopeProductTypes) && scopeProductTypes.length
      ? scopeProductTypes
      : [
          { label: "Card", filterKind: "card", description: "Individual cards and code cards" },
          { label: "Sealed", filterKind: "sealed", description: "Boxes, bundles, tins, packs, and sealed products" },
          { label: "Product", filterKind: "All", description: "All catalog products" },
        ];
    const orderedTypes = [...baseTypes].sort((a, b) => {
      const aLabel = String(a.label || a.value || a).toLowerCase();
      const bLabel = String(b.label || b.value || b).toLowerCase();
      const score = (label) => {
        if (sealedIntent && label.includes("sealed")) return -2;
        if (cardIntent && label.includes("card")) return -2;
        if (label.includes("product")) return 1;
        return 0;
      };
      return score(aLabel) - score(bLabel);
    });

    orderedTypes.slice(0, 3).forEach((type) => {
      const label = type.label || type.value || type;
      addSuggestion({
        id: `scope-kind-${normalizeCatalogQuery(label)}`,
        type: "Type",
        label: `type ${label}`,
        description: type.description || `Limit results to ${label}`,
        badge: label,
        mode: "catalogKind",
        filterKind: type.filterKind || type.kind || type.value || label,
        productType: type.productType || "",
        iconText: String(label).slice(0, 3).toUpperCase(),
      });
    });

    return suggestions.slice(0, 5);
  }

  function dedupeSuggestionList(list = []) {
    const seen = new Set();
    return list.filter((suggestion) => {
      const product = suggestion.product || {};
      const key = String(product.id || suggestion.id || `${suggestion.mode || ""}-${suggestion.label}-${suggestion.description}`).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  useEffect(() => {
    mapRowRef.current = mapRow;
  }, [mapRow]);

  useEffect(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, [closeSignal]);

  useEffect(() => {
    if (!suppressSuggestions) return;
    setOpen(false);
    setActiveIndex(-1);
    setLoading(false);
  }, [suppressSuggestions]);

  useEffect(() => {
    if (suppressSuggestions) {
      setOpen(false);
      setActiveIndex(-1);
      setLoading(false);
      return;
    }
    const mode = detectCatalogSearchMode(deferredValue);
    const exactIdentifier = ["barcode", "id"].includes(mode);
    if (!cleanedValue || (cleanedValue.length < 2 && !exactIdentifier)) {
      setSuggestions([]);
      setLoading(false);
      setErrorMessage("");
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (!isSupabaseConfigured || !supabase) {
      const localSuggestions = dedupeSuggestionList([
        ...buildScopeSuggestions(deferredValue),
        ...buildLocalSuggestions(deferredValue),
      ]).slice(0, maxSuggestions);
      setSuggestions(localSuggestions);
      setLoading(false);
      setErrorMessage("");
      setOpen(true);
      setActiveIndex(localSuggestions.length ? 0 : -1);
      setLastTiming({ sourceName: "catalog seed", cacheState: "local", searchPhase: "local" });
      return;
    }

    const currentRequestId = requestId.current + 1;
    requestId.current = currentRequestId;
    abortRef.current?.abort?.();
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    abortRef.current = controller;

    const cached = getCachedCatalogRecommendations({
      query: deferredValue,
      productGroup,
      dataFilter,
      limit: maxSuggestions,
    });
    if (cached) {
      const filteredSuggestions = typeof suggestionFilter === "function"
        ? (cached.suggestions || []).filter((suggestion) => suggestionFilter(suggestion))
        : (cached.suggestions || []);
      const nextSuggestions = dedupeSuggestionList([
        ...buildScopeSuggestions(deferredValue),
        ...buildLocalSuggestions(deferredValue),
        ...filteredSuggestions,
      ]).slice(0, maxSuggestions);
      setSuggestions(nextSuggestions);
      setLoading(false);
      setErrorMessage("");
      setOpen(true);
      setActiveIndex(nextSuggestions.length ? 0 : -1);
      setLastTiming({ elapsedMs: cached.elapsedMs, sourceName: cached.sourceName, cacheState: "hit", searchPhase: cached.searchPhase });
    }

    if (!cached) setSuggestions([]);
    setLoading(!cached);
    setErrorMessage("");
    setOpen(true);
    setActiveIndex(-1);

    const timer = window.setTimeout(async () => {
      if (requestId.current !== currentRequestId) return;
      try {
        const result = await getCatalogRecommendations({
          supabase,
          query: deferredValue,
          productGroup,
          dataFilter,
          mapRow: mapRowRef.current,
          limit: maxSuggestions,
          signal: controller?.signal,
        });
        if (requestId.current !== currentRequestId) return;
        const filteredSuggestions = typeof suggestionFilter === "function"
          ? (result.suggestions || []).filter((suggestion) => suggestionFilter(suggestion))
          : (result.suggestions || []);
        const nextSuggestions = dedupeSuggestionList([
          ...buildScopeSuggestions(deferredValue),
          ...buildLocalSuggestions(deferredValue),
          ...filteredSuggestions,
        ]).slice(0, maxSuggestions);
        setSuggestions(nextSuggestions);
        setOpen(true);
        setActiveIndex(nextSuggestions.length ? 0 : -1);
        setErrorMessage("");
        setLastTiming({ elapsedMs: result.elapsedMs, sourceName: result.sourceName, cacheState: result.cached ? "hit" : result.cacheState, searchPhase: result.searchPhase });
      } catch (error) {
        if (requestId.current !== currentRequestId) return;
        if (error?.name === "AbortError") return;
        setSuggestions([]);
        setOpen(true);
        setErrorMessage(error?.message || "Catalog search is unavailable. Try again.");
        setActiveIndex(-1);
      } finally {
        if (requestId.current === currentRequestId) setLoading(false);
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller?.abort?.();
    };
  }, [cleanedValue, dataFilter, deferredValue, includeScopeSuggestions, isSupabaseConfigured, localCatalogProducts, maxSuggestions, productGroup, scopeProductTypes, scopeSets, searchCategories, supabase, suggestionFilter, suppressSuggestions]);

  const groupedSuggestions = useMemo(() => {
    return suggestions.reduce((groups, suggestion, index) => {
      const section = suggestion.section || "Suggestions";
      groups[section] = [...(groups[section] || []), { ...suggestion, index }];
      return groups;
    }, {});
  }, [suggestions]);

  function selectSuggestion(suggestion) {
    const nextValue = suggestion.searchValue || suggestion.label || value;
    onChange?.(nextValue);
    setOpen(false);
    setActiveIndex(-1);
    if (typeof document !== "undefined") document.activeElement?.blur?.();
    onSelectSuggestion?.({ ...suggestion, searchValue: nextValue });
  }

  function handleKeyDown(event) {
    if (event.key === "ArrowDown" && suggestions.length) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(suggestions.length - 1, current + 1));
      return;
    }
    if (event.key === "ArrowUp" && suggestions.length) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.max(0, current - 1));
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (event.key === "Enter" && open && activeIndex >= 0 && suggestions[activeIndex]) {
      event.preventDefault();
      selectSuggestion(suggestions[activeIndex]);
      return;
    }
    if (event.key === "Enter" && onSearch) {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
      onSearch(value);
    }
  }

  return (
    <div className={`smart-catalog-search ${className}`}>
      <input
        className={inputClassName}
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;
          const nextCleanedValue = normalizeCatalogQuery(nextValue);
          const nextMode = detectCatalogSearchMode(nextValue);
          const nextExactIdentifier = ["barcode", "id"].includes(nextMode);
          const cached = getCachedCatalogRecommendations({
            query: nextValue,
            productGroup,
            dataFilter,
            limit: maxSuggestions,
          });
          const cachedSuggestions = cached?.suggestions || [];
          const scopeSuggestions = buildScopeSuggestions(nextValue);
          setSuggestions(scopeSuggestions);
          setErrorMessage("");
          setActiveIndex(scopeSuggestions.length ? 0 : -1);
          if (cached) {
            const nextSuggestions = dedupeSuggestionList([...scopeSuggestions, ...cachedSuggestions]).slice(0, maxSuggestions);
            setSuggestions(nextSuggestions);
            setLoading(false);
            setActiveIndex(nextSuggestions.length ? 0 : -1);
          } else {
            setLoading(Boolean(nextCleanedValue && (nextCleanedValue.length >= 2 || nextExactIdentifier)));
          }
          onChange?.(nextValue);
          if (!suppressSuggestions) setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => suggestions.length && !suppressSuggestions && setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label={inputLabel || placeholder}
        role="combobox"
        aria-expanded={!suppressSuggestions && open && suggestions.length > 0}
        aria-autocomplete="list"
      />
      {!suppressSuggestions && open && (suggestions.length > 0 || loading || errorMessage || cleanedValue.length >= 2) ? (
        <div
          className={`smart-catalog-suggestions ${inlineResults ? "smart-catalog-suggestions--inline" : ""}`}
          role="listbox"
          onMouseDown={(event) => event.preventDefault()}
        >
          {loading ? <div className="smart-catalog-suggestion-status">Finding smart matches...</div> : null}
          {!loading && errorMessage ? <div className="smart-catalog-suggestion-status error">{errorMessage}</div> : null}
          {showTiming && !loading && !errorMessage && lastTiming?.elapsedMs ? (
            <div className="smart-catalog-suggestion-status">Search completed in {lastTiming.elapsedMs}ms via {lastTiming.sourceName || "catalog"} ({lastTiming.cacheState || "miss"}).</div>
          ) : null}
          {!loading && !errorMessage && suggestions.length === 0 && immediateCleanedValue.length >= 2 ? (
            <div className="smart-catalog-suggestion-status smart-catalog-empty-state">
              <span>{emptyMessage}</span>
              {typeof renderEmptyActions === "function" ? renderEmptyActions() : null}
            </div>
          ) : null}
          {Object.entries(groupedSuggestions).map(([section, items]) => (
            <div className="smart-catalog-suggestion-section" key={section}>
              <div className="smart-catalog-suggestion-heading">{section}</div>
              {items.map((suggestion) => (
                <button
                  type="button"
                  key={suggestion.id}
                  className={suggestion.index === activeIndex ? "smart-catalog-suggestion active" : "smart-catalog-suggestion"}
                  onMouseEnter={() => setActiveIndex(suggestion.index)}
                  onClick={() => selectSuggestion(suggestion)}
                  role="option"
                  aria-selected={suggestion.index === activeIndex}
                >
                  <CatalogSuggestionThumbnail suggestion={suggestion} />
                  <span className="smart-catalog-suggestion-copy">
                    <strong>{renderHighlighted(suggestion.label, value)}</strong>
                    <small>{suggestion.description || suggestion.searchValue}</small>
                  </span>
                  <span className="smart-catalog-suggestion-meta">
                    <span className="status-badge">{suggestion.badge || suggestion.type}</span>
                    {Number(suggestion.marketPrice || 0) > 0 ? <small>{money(suggestion.marketPrice)}</small> : null}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
