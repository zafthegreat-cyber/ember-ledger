import { useRef } from "react";
import CollectionGamePicker from "./CollectionGamePicker.jsx";
import { COLLECTIBLE_GAMES } from "../utils/collectibleGames.mjs";

export default function CollectionGameFilter({ value = "all", onChange }) {
  const disclosure = useRef(null);
  const name = value === "all" ? "All games" : COLLECTIBLE_GAMES.find((game) => game.id === value)?.name || "Unspecified / other";
  return <details className="collection-game-filter" ref={disclosure}>
    <summary aria-label={`Filter by game: ${name}`}><span>Game</span><strong>{name}</strong></summary>
    <div className="collection-game-filter-content">
      <CollectionGamePicker value={value} includeUnspecified onChange={(next) => {
        onChange(next);
        if (disclosure.current) {
          disclosure.current.open = false;
          disclosure.current.querySelector("summary")?.focus({ preventScroll: true });
        }
      }} />
      <p className="collection-game-filter-note">Track all five games with your saved cards, sets, photos, and estimates. Live catalog search is currently available for Pokémon. Other games use manual entry.</p>
    </div>
  </details>;
}
