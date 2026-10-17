import { useEffect, useRef } from "react";
import { BRAND_CONFIG } from "../../config/brand.js";
import { AppNavIcon } from "../../components/command-system/AppNavIcon.jsx";
import "./workspace-shell.css";

export default function WorkspaceSwitcher({
  contextLabel,
  currentWorkspaceId = "",
  workspaces = [],
  onSelect,
}) {
  const disclosureRef = useRef(null);

  useEffect(() => {
    const closeOnOutsidePointer = (event) => {
      if (disclosureRef.current?.open && !disclosureRef.current.contains(event.target)) {
        disclosureRef.current.open = false;
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, []);

  const selectWorkspace = (workspace) => {
    if (disclosureRef.current) {
      disclosureRef.current.open = false;
      disclosureRef.current.querySelector("summary")?.focus();
    }
    onSelect?.(workspace);
  };

  return (
    <details
      ref={disclosureRef}
      className="code3-workspace-switcher"
      data-testid="workspace-switcher"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !disclosureRef.current?.open) return;
        event.preventDefault();
        disclosureRef.current.open = false;
        disclosureRef.current.querySelector("summary")?.focus();
      }}
    >
      <summary aria-label={`${contextLabel}. Switch Code 3 workspace`}>
        <span className="code3-workspace-switcher__brand">{BRAND_CONFIG.applicationShortName}</span>
        <strong>{contextLabel}</strong>
        <span className="code3-workspace-switcher__chevron" aria-hidden="true">⌄</span>
      </summary>
      <div className="code3-workspace-switcher__menu" aria-label="Code 3 workspaces">
        <span>Switch workspace</span>
        {workspaces.map((workspace) => (
          <button
            key={workspace.id}
            type="button"
            className={workspace.id === currentWorkspaceId ? "is-current" : ""}
            aria-current={workspace.id === currentWorkspaceId ? "page" : undefined}
            onClick={() => selectWorkspace(workspace)}
          >
            <AppNavIcon kind={workspace.icon || "home"} />
            <span>
              <strong>{workspace.label}</strong>
              <small>{workspace.shortPurpose}</small>
            </span>
            {workspace.ownerOnly ? <em>Owner</em> : null}
          </button>
        ))}
      </div>
    </details>
  );
}
