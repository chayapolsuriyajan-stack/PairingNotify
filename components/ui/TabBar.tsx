'use client';

import Link from '@/components/NavLink';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export interface TabItem {
  href: string;
  label: string;
  icon?: ReactNode;
}

/**
 * Bottom navigation. A yellow bar slides to the active tab; inactive tabs stay visible
 * but muted.
 */
export function TabBar({ items }: { items: TabItem[] }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
  const index = items.findIndex((item) => isActive(item.href));

  return (
    <nav className="ef-tabs" aria-label="Main" style={{ viewTransitionName: 'tab-bar' }}>
      {index >= 0 && (
        <span
          className="ef-tabs__ink"
          aria-hidden="true"
          style={{ width: `${100 / items.length}%`, transform: `translateX(${index * 100}%)` }}
        />
      )}
      {items.map((item, i) => (
        <Link
          key={item.href}
          href={item.href}
          className={`ef-tab${i === index ? ' ef-tab--active' : ''}`}
          aria-current={i === index ? 'page' : undefined}
        >
          {item.icon}
          <span className="ef-tab__label">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
