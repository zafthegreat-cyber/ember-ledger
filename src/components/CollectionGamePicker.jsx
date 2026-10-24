import { useState } from "react";
import { COLLECTIBLE_GAMES } from "../utils/collectibleGames.mjs";
import { resolveGameArtwork } from "../utils/setArtwork.mjs";
import "./collection-games.css";

function resultCount(counts, id) {
  if (!Object.prototype.hasOwnProperty.call(counts, id)) return null;
  const count = counts[id];
  return typeof count === "number" && Number.isSafeInteger(count) && count >= 0
    ? count
    : null;
}

function GameMark({ id, shortName }) {
  const [failedSource, setFailedSource] = useState("");
  const logo = resolveGameArtwork(id)?.logoUrl;
  if (logo && failedSource !== logo) return <img src={logo} alt="" loading="lazy" decoding="async" onError={() => setFailedSource(logo)} />;
  if (id === "all") {
    return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>;
  }
  return <span aria-hidden="true">{shortName || "TCG"}</span>;
}

/** A small, shared set of game filters. Selection never edits collection records. */
export default function CollectionGamePicker({
  value = "all",
  onChange,
  counts = {},
  compact = false,
  includeAll = true,
  includeUnspecified = false,
  registry = COLLECTIBLE_GAMES,
}) {
  const options = [
    ...(includeAll ? [{ id: "all", name: "All games", shortName: "ALL" }] : []),
    ...registry,
    ...(includeUnspecified ? [{ id: "unspecified", name: "Unspecified / other", shortName: "TCG" }] : []),
  ];

  return (
    <div className="collection-game-picker" data-compact={compact ? "true" : "false"} role="group" aria-label="Trading card game">
      {options.map((game) => {
        const selected = value === game.id;
        const count = resultCount(counts, game.id);
        return (
          <button
            key={game.id}
            type="button"
            className="collection-game-option"
            data-game={game.id}
            aria-label={game.name}
            aria-pressed={selected}
            onClick={() => onChange?.(game.id)}
          >
            <span className="collection-game-mark" data-has-logo={Boolean(resolveGameArtwork(game.id))}><GameMark id={game.id} shortName={game.shortName} /></span>
            <span className="collection-game-copy">
              <strong>{game.name}</strong>
              {count !== null && <span className="collection-game-count">{count.toLocaleString()}<span className="collection-game-sr-only"> results</span></span>}
            </span>
            <span className="collection-game-selected" aria-hidden="true">{selected ? "✓" : ""}</span>
          </button>
        );
      })}
    </div>
  );
}
