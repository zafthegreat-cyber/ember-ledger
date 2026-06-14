const NAV_ICON_SIZE = 20;

export function AppNavIcon({ kind, className = "" }) {
  const iconClass = `app-nav-icon ${className}`.trim();
  const common = {
    width: NAV_ICON_SIZE,
    height: NAV_ICON_SIZE,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    className: iconClass,
  };

  switch (kind) {
    case "home":
      return (
        <svg {...common}>
          <path d="M3 12c1.4 0 2.6-1 4-1s2.6 1 4 1 2.6-1 4-1 2.6 1 4 1" />
          <path d="M3 16c1.4 0 2.6-1 4-1s2.6 1 4 1 2.6-1 4-1 2.6 1 4 1" />
          <path d="M3 8c1.4 0 2.6-1 4-1s2.6 1 4 1 2.6-1 4-1 2.6 1 4 1" />
        </svg>
      );
    case "vault":
      return (
        <svg {...common}>
          <path d="M3 5.5l9-3.8 9 3.8v6.6a7.5 7.5 0 0 1-18 0V5.5z" />
          <path d="M9 12h6" />
          <path d="M12 9v6" />
        </svg>
      );
    case "forge":
      return (
        <svg {...common}>
          <path d="M2 12h20" />
          <path d="M5 12V7.5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2V12" />
          <path d="M7 20h2v-6" />
          <path d="M15 20h2v-6" />
          <path d="M12 22v-8" />
          <path d="M12 12 21 16" />
          <path d="M12 12 3 16" />
          <path d="M8 12h8" />
        </svg>
      );
    case "market":
      return (
        <svg {...common}>
          <path d="M4 7h16" />
          <path d="M7 7v10a5 5 0 0 0 10 0V7" />
          <path d="M9 12h6" />
          <path d="M10 16h4" />
          <path d="M12 8v6" />
        </svg>
      );
    case "scout":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 4v4" />
          <path d="M12 16v4" />
          <path d="M4 12h4" />
          <path d="M16 12h4" />
          <path d="M7.1 7.1 12 12" />
          <path d="M16.9 16.9 12 12" />
          <path d="M16.9 7.1 12 12" />
          <path d="M7.1 16.9 12 12" />
        </svg>
      );
    case "pool":
      return (
        <svg {...common}>
          <path d="M4 12h16" />
          <path d="M8 8c0 2.4-2 2.5-2 5 0 2.5 2 2.6 2 5h8c0-2.4 2-2.5 2-5 0-2.5-2-2.6-2-5z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "plus":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v8" />
          <path d="M8 12h8" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="M16.65 16.65 21 21" />
        </svg>
      );
    case "scan":
      return (
        <svg {...common}>
          <path d="M4 7h16" />
          <path d="M4 17h16" />
          <path d="M7 4v4" />
          <path d="M17 16v4" />
          <path d="M17 4v4" />
          <path d="M7 16v4" />
          <path d="M9 11h6" />
          <path d="M12 8v6" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M7 2v4" />
          <path d="M17 2v4" />
          <path d="M3 9h18" />
          <path d="M8 13h8" />
          <path d="M8 17h6" />
        </svg>
      );
    case "clipboard":
      return (
        <svg {...common}>
          <rect x="8" y="3" width="8" height="18" rx="1" />
          <path d="M9 3h6" />
          <path d="M9 7h6" />
          <path d="M10 11h4" />
          <path d="M10 15h4" />
          <path d="M10 19h4" />
        </svg>
      );
    case "bell":
      return (
        <svg {...common}>
          <path d="M6 18h12" />
          <path d="M12 3a5 5 0 0 0-3.5 8.7V15l-1.5 2h10l-1.5-2v-3.3A5 5 0 0 0 12 3" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="M4.93 4.93l1.42 1.42" />
          <path d="M17.66 17.66l1.42 1.42" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="M4.93 19.07l1.42-1.42" />
          <path d="M17.66 6.34l1.42-1.42" />
          <circle cx="12" cy="12" r="4" />
          <path d="m9.5 9.5 5 5" />
          <path d="m9.5 14.5 5-5" />
        </svg>
      );
    case "account":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      );
    case "workspace":
      return (
        <svg {...common}>
          <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />
          <path d="M8 13h8" />
        </svg>
      );
    case "tcg-os":
      return (
        <svg {...common}>
          <rect x="4" y="4" width="6" height="6" rx="1.5" />
          <rect x="14" y="4" width="6" height="6" rx="1.5" />
          <rect x="4" y="14" width="6" height="6" rx="1.5" />
          <path d="M16 15l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" />
        </svg>
      );
    case "data":
      return (
        <svg {...common}>
          <ellipse cx="12" cy="6" rx="7" ry="3" />
          <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
          <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
          <path d="M12 10v8" />
          <path d="m9 15 3 3 3-3" />
        </svg>
      );
    case "help":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <path d="M9.5 9a2.8 2.8 0 0 1 5 1.8c0 2-2.5 2.2-2.5 4.2" />
          <path d="M12 18h.01" />
        </svg>
      );
    case "community":
      return (
        <svg {...common}>
          <path d="M4 19v-4a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v4" />
          <circle cx="9" cy="7" r="3" />
          <circle cx="17" cy="8" r="2" />
          <path d="M4 19h16" />
        </svg>
      );
    case "plan":
      return (
        <svg {...common}>
          <path d="M12 3l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.3 6.8 19l1-5.8-4.2-4.1 5.8-.8z" />
        </svg>
      );
    case "admin":
      return (
        <svg {...common}>
          <path d="M12 3l7 3v5c0 4.5-2.8 8.4-7 10-4.2-1.6-7-5.5-7-10V6z" />
          <path d="m9 12 2 2 4-5" />
        </svg>
      );
    case "spark":
      return (
        <svg {...common}>
          <path d="M12 2c-2.5 2.7-2.3 5.2-1.8 6.8C8.7 7.5 7.8 5.9 8 4.1 4.8 7 3.5 10.2 4 13.5 4.7 18 8.2 21 12.6 21c4.2 0 7.7-2.6 8.3-6.6.4-2.5-.5-4.8-2.7-6.9.1 1.8-.5 3.2-1.8 4.1.1-2.9-1.1-5.7-4.4-9.6Z" />
          <path d="M8 15c2.2 1.4 4.4 1.8 6.6 1.1 1.4-.4 2.8-1.2 4.2-1.2" />
        </svg>
      );
    default:
      return null;
  }
}
