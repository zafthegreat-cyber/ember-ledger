import { BRAND_CONFIG } from "../../config/brand.js";

export function BrandIdentity({ className = "", variant = "emblem", onDark = false }) {
  const name = BRAND_CONFIG.applicationDisplayName;
  const numberIndex = name.indexOf("3");

  if (variant === "wordmark") {
    return <span className={["code3-brand-identity", "code3-brand-identity--wordmark", className].filter(Boolean).join(" ")} aria-hidden="true"><img src={onDark ? BRAND_CONFIG.wordmarkOnDarkReference : BRAND_CONFIG.wordmarkReference} width="2172" height="724" alt="" /></span>;
  }

  return (
    <span className={["code3-brand-identity", className].filter(Boolean).join(" ")} aria-hidden="true">
      <img className="code3-brand-identity__emblem" src={BRAND_CONFIG.logoReference} width="48" height="48" alt="" />
      <span className="code3-brand-identity__label">
        {numberIndex < 0 ? name : <>{name.slice(0, numberIndex)}<span className="code3-brand-identity__number">3</span>{name.slice(numberIndex + 1)}</>}
      </span>
    </span>
  );
}
