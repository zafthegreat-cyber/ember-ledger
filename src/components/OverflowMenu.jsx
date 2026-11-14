import { useEffect, useId, useRef, useState } from "react";

export default function OverflowMenu({
  onEdit,
  onDelete,
  actions = [],
  editLabel = "Edit",
  deleteLabel = "Delete",
  buttonLabel = "More",
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef(null);
  const trigger = useRef(null);
  const initialFocus = useRef('first');
  useEffect(() => {
    if (!open) return;
    const items = [...(ref.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') || [])];
    (initialFocus.current === 'last' ? items.at(-1) : items[0])?.focus();
    initialFocus.current = 'first';
  }, [open]);

  useEffect(() => {
    function closeOnOutsideClick(event) {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    }

    function closeOtherMenus(event) {
      if (event.detail !== id) setOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("overflow-menu-open", closeOtherMenus);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("overflow-menu-open", closeOtherMenus);
    };
  }, [id]);

  function toggleMenu() {
    setOpen((current) => {
      const next = !current;
      if (next) {
        window.dispatchEvent(new CustomEvent("overflow-menu-open", { detail: id }));
      }
      return next;
    });
  }

  function runAction(action) {
    if (typeof action === "function") {
      setOpen(false);
      trigger.current?.focus();
      action();
      return;
    }
    if (!action || action.disabled) return;
    setOpen(false);
    trigger.current?.focus();
    action.onClick?.();
  }

  function keyboard(event) {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); return; }
    if (event.key === 'Tab' && open) { trigger.current?.focus(); setOpen(false); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    if (!open) { initialFocus.current = event.key === 'ArrowUp' || event.key === 'End' ? 'last' : 'first'; toggleMenu(); return; }
    const items = [...(ref.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') || [])];
    const current = items.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
    items[next]?.focus();
  }

  return (
    <div className={`overflow-menu${open ? " open" : ""}`} ref={ref} onKeyDown={keyboard}>
      <button
        ref={trigger}
        type="button"
        className="overflow-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-actions` : undefined}
        aria-label="More actions"
        onClick={toggleMenu}
      >
        {buttonLabel}
      </button>

      {open ? (
        <>
          <div className="overflow-menu-backdrop" aria-hidden="true" onClick={() => { setOpen(false); trigger.current?.focus(); }} />
          <div id={`${id}-actions`} className="overflow-menu-list" role="menu" aria-label="More actions">
            {onEdit ? (
              <button type="button" role="menuitem" onClick={() => runAction(onEdit)}>
                {editLabel}
              </button>
            ) : null}
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                className={[action.danger ? "overflow-menu-delete" : "", action.disabled ? "overflow-menu-disabled" : ""].filter(Boolean).join(" ")}
                disabled={Boolean(action.disabled)}
                aria-disabled={action.disabled ? "true" : undefined}
                title={action.reason || undefined}
                onClick={() => runAction(action)}
              >
                <span>{action.label}</span>
                {action.reason ? <small>{action.reason}</small> : null}
              </button>
            ))}
            {onDelete ? (
              <button
                type="button"
                role="menuitem"
                className="overflow-menu-delete"
                onClick={() => runAction(onDelete)}
              >
                {deleteLabel}
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
