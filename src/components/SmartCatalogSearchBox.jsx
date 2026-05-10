import { useEffect, useMemo, useRef, useState } from "react";
import {
  detectCatalogSearchMode,
  getCachedCatalogRecommendations,
  getCatalogRecommendations,
  normalizeCatalogQuery,
} from "../services/pokemonCatalogSearch";

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
  money = (amount) => `$${Number(amount || 0).toFixed(2)}`,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const requestId = useRef(0);
  const mapRowRef = useRef(mapRow);
  const cleanedValue = normalizeCatalogQuery(value);

  useEffect(() => {
    mapRowRef.current = mapRow;
  }, [mapRow]);

  useEffect(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, [closeSignal]);

  useEffect(() => {
    const mode = detectCatalogSearchMode(value);
    const exactIdentifier = ["barcode", "id"].includes(mode);
    if (!isSupabaseConfigured || !supabase || (!cleanedValue || (cleanedValue.length < 2 && !exactIdentifier))) {
      setSuggestions([]);
      setLoading(false);
      setErrorMessage("");
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    const currentRequestId = requestId.current + 1;
    requestId.current = currentRequestId;

    const cached = getCachedCatalogRecommendations({
      query: value,
      productGroup,
      dataFilter,
      limit: maxSuggestions,
    });
    if (cached) {
      const filteredSuggestions = typeof suggestionFilter === "function"
        ? (cached.suggestions || []).filter((suggestion) => suggestionFilter(suggestion))
        : (cached.suggestions || []);
      const nextSuggestions = filteredSuggestions.slice(0, maxSuggestions);
      setSuggestions(nextSuggestions);
      setLoading(false);
      setErrorMessage("");
      setOpen(true);
      setActiveIndex(nextSuggestions.length ? 0 : -1);
      return;
    }

    const timer = window.setTimeout(async () => {
      if (requestId.current !== currentRequestId) return;
      setLoading(true);
      setErrorMessage("");
      try {
        const result = await getCatalogRecommendations({
          supabase,
          query: value,
          productGroup,
          dataFilter,
          mapRow: mapRowRef.current,
          limit: maxSuggestions,
        });
        if (requestId.current !== currentRequestId) return;
        const filteredSuggestions = typeof suggestionFilter === "function"
          ? (result.suggestions || []).filter((suggestion) => suggestionFilter(suggestion))
          : (result.suggestions || []);
        const nextSuggestions = filteredSuggestions.slice(0, maxSuggestions);
        setSuggestions(nextSuggestions);
        setOpen(true);
        setActiveIndex(nextSuggestions.length ? 0 : -1);
        setErrorMessage("");
      } catch (error) {
        if (requestId.current !== currentRequestId) return;
        setSuggestions([]);
        setOpen(true);
        setErrorMessage(error?.message || "Catalog search is unavailable. Try again.");
        setActiveIndex(-1);
      } finally {
        if (requestId.current === currentRequestId) setLoading(false);
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [cleanedValue, dataFilter, isSupabaseConfigured, maxSuggestions, productGroup, supabase, suggestionFilter, value]);

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
          onChange?.(event.target.value);
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => suggestions.length && setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open && suggestions.length > 0}
        aria-autocomplete="list"
      />
      {open && (suggestions.length > 0 || loading || errorMessage || cleanedValue.length >= 2) ? (
        <div className="smart-catalog-suggestions" role="listbox" onMouseDown={(event) => event.preventDefault()}>
          {loading ? <div className="smart-catalog-suggestion-status">Finding smart matches...</div> : null}
          {!loading && errorMessage ? <div className="smart-catalog-suggestion-status error">{errorMessage}</div> : null}
          {!loading && !errorMessage && suggestions.length === 0 ? <div className="smart-catalog-suggestion-status">No matches found.</div> : null}
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
                  {suggestion.imageUrl ? <img src={suggestion.imageUrl} alt="" /> : <span className="smart-catalog-suggestion-thumb">{suggestion.badge || suggestion.type}</span>}
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
