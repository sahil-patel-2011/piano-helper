import { useEffect, useState } from "react";
import { getPiano } from "../../lib/piano-api";
import { AppMark } from "./AppMark";

const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);

export function Titlebar() {
  const showWinButtons = !isMac;
  const [maxed, setMaxed] = useState(false);
  const api = getPiano();

  useEffect(() => {
    if (!showWinButtons) return;
    void api.isMaximized?.().then(setMaxed);
    return api.onMaximizeChange?.(setMaxed);
  }, [api, showWinButtons]);

  return (
    <header className={`titlebar${isMac ? " mac" : ""}`} onDoubleClick={() => api.toggleMaximize?.()}>
      <div className="titlebar-brand">
        <AppMark size={18} />
        <span className="serif">Piano Helper</span>
      </div>
      <div className="titlebar-drag" />
      {showWinButtons && (
        <div className="win-controls">
          <button type="button" className="win-btn" aria-label="Minimize" onClick={() => api.minimize?.()}>
            <svg viewBox="0 0 12 12" width="10" height="10">
              <path d="M1 6h10" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
          <button type="button" className="win-btn" aria-label="Maximize" onClick={() => api.toggleMaximize?.()}>
            {maxed ? (
              <svg viewBox="0 0 12 12" width="10" height="10">
                <path d="M3.5 4.5h5v5h-5zM4.5 3.5h5v5" fill="none" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            ) : (
              <svg viewBox="0 0 12 12" width="10" height="10">
                <rect x="2.2" y="2.2" width="7.6" height="7.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            )}
          </button>
          <button type="button" className="win-btn close" aria-label="Close" onClick={() => api.closeWindow?.()}>
            <svg viewBox="0 0 12 12" width="10" height="10">
              <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        </div>
      )}
    </header>
  );
}
