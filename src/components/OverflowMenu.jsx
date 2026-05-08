import { useEffect, useId, useRef, useState } from "react";

export default function OverflowMenu({
  onEdit,
  onDelete,
  editLabel = "Edit",
  deleteLabel = "Delete",
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef(null);

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
    setOpen(false);
    action?.();
  }

  return (
    <div className="overflow-menu" ref={ref}>
      <button
        type="button"
        className="overflow-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More actions"
        onClick={toggleMenu}
      >
        ⋯
      </button>

      {open ? (
        <div className="overflow-menu-list" role="menu">
          {onEdit ? (
            <button type="button" role="menuitem" onClick={() => runAction(onEdit)}>
              {editLabel}
            </button>
          ) : null}
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
      ) : null}
    </div>
  );
}
