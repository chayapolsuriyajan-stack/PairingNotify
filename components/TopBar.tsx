import type { ReactNode } from 'react';

/** Screen header: tiny mono caption, big uppercase title, a readout on the right. */
export function TopBar({ caption, title, right }: { caption: string; title: ReactNode; right?: ReactNode }) {
  return (
    <header className="ef-top">
      <div className="ef-top__text">
        <p className="ef-top__caption" aria-hidden="true">
          {caption}
        </p>
        <h1 className="ef-top__title">{title}</h1>
      </div>
      {right && <div className="ef-top__right">{right}</div>}
    </header>
  );
}

/** "SYNC 14:02" readout, with an OFFLINE chip when showing a saved copy. */
export function SyncReadout({ label, offline, onRefresh }: { label: string; offline?: boolean; onRefresh?: () => void }) {
  return (
    <div className="ef-sync">
      {offline && <span className="ef-chip ef-chip--alert">Offline</span>}
      <span className="ef-sync__label">{label}</span>
      {onRefresh && (
        <button type="button" className="ef-iconbtn" onClick={onRefresh} aria-label="Refresh">
          ↻
        </button>
      )}
    </div>
  );
}
