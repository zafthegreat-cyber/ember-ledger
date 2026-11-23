import "./picture-matches.css";

/**
 * Picture memory suggestions: earlier scans whose card picture looks like this
 * photo. Fingerprints come only from cards the user confirmed on this device.
 */
export default function PictureMatches({ hash, matches, rememberedCount, onPick, onForget, disabled = false }) {
  if (!hash) return null;
  return (
    <section className="scanner-picture-matches" aria-label="Looks like a card you scanned before">
      {matches.length ? (
        <>
          <strong>Looks like a card you scanned before</strong>
          <ul>
            {matches.map((match) => (
              <li key={match.catalogItemId}>
                <button type="button" disabled={disabled} onClick={() => onPick(match)}>
                  <span>{match.name || "Card"}</span>
                  <small>{[match.setName, match.cardNumber && `#${match.cardNumber}`, `${match.similarity}% alike`].filter(Boolean).join(" · ")}</small>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>{rememberedCount ? "No card you scanned before looks like this one." : "When you add a card from a photo, its picture is remembered on this device so the same card is quicker next time."}</p>
      )}
      <p className="scanner-picture-matches__note">
        Only a picture fingerprint is kept, on this device, never the photo.
        {rememberedCount ? <> {rememberedCount} remembered. <button type="button" className="ghost-button" onClick={onForget}>Forget them</button></> : null}
      </p>
    </section>
  );
}
