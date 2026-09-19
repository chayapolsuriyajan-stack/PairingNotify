import type { ReactNode } from 'react';

/**
 * Flat chamfered panel: a header strip with a section code (`02 / NOTIFY`), an
 * optional status chip, the content, and an optional serial string in the corner.
 */
export function Panel({
  code,
  title,
  status,
  serial,
  active = false,
  children,
}: {
  code?: string;
  title: string;
  status?: ReactNode;
  serial?: string;
  active?: boolean;
  children?: ReactNode;
}) {
  return (
    <section className={`ef-panel${active ? ' ef-panel--active' : ''}`}>
      <header className="ef-panel__head">
        <div>
          {code && <p className="ef-panel__code" aria-hidden="true">{code}</p>}
          <h3 className="ef-panel__title">{title}</h3>
        </div>
        {status}
      </header>
      <div className="ef-panel__body">{children}</div>
      {serial && <p className="ef-panel__serial" aria-hidden="true">{serial}</p>}
    </section>
  );
}
