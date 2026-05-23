/**
 * routerCardComponents — drobne komponenty UI z WorkspaceSurfaceRouter
 * (Phase 0 #11 - dziesiąta fala decompose).
 *
 * Pure presentational components bez side-effects / store dependencies.
 */

import type { ReactNode } from 'react';

interface SectionCardProps {
  title: string;
  eyebrow?: string;
  children: ReactNode;
}

export function SectionCard({ title, eyebrow, children }: SectionCardProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {eyebrow && (
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{eyebrow}</div>
      )}
      <h3 className="mt-1 text-sm font-semibold text-slate-900">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

interface KeyValueRow {
  label: string;
  value: string;
}

interface KeyValueGridProps {
  rows: KeyValueRow[];
  columns?: 2 | 3;
}

export function KeyValueGrid({ rows, columns = 2 }: KeyValueGridProps) {
  return (
    <div className={`grid gap-3 ${columns === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
      {rows.map((row) => (
        <div key={row.label} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-normal text-slate-500">{row.label}</div>
          <div className="mt-1 text-sm text-slate-800">{row.value}</div>
        </div>
      ))}
    </div>
  );
}

