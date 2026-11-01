import { safeExternalWebUrl } from "../utils/externalLink.mjs";

export default function ExternalWebLink({ href, children, className, style }) {
  const url = safeExternalWebUrl(href);
  if (!url) return <span className={className} style={style}>{children} (link unavailable)</span>;
  return <a className={className} style={style} href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
    {children}<span className="sr-only"> at {new URL(url).hostname} (opens a new tab)</span>
  </a>;
}
