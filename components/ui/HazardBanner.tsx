import type { ReactNode } from 'react';

/** Hazard-stripe top edge, alert label, then a plain-language explanation. */
export function HazardBanner({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ef-hazard" role="status">
      <div className="ef-hazard__stripe" aria-hidden="true" />
      <div className="ef-hazard__body">
        <p className="ef-hazard__label">{label}</p>
        <p className="ef-hazard__text">{children}</p>
      </div>
    </div>
  );
}
