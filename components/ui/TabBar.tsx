'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface TabItem {
  href: string;
  label: string;
}

/** Bottom navigation. Active tab gets the yellow bar; inactive tabs stay visible but muted. */
export function TabBar({ items }: { items: TabItem[] }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="ef-tabs" aria-label="Main">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`ef-tab${isActive(item.href) ? ' ef-tab--active' : ''}`}
          aria-current={isActive(item.href) ? 'page' : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
