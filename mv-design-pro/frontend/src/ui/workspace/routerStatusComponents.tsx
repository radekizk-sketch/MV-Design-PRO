/**
 * routerStatusComponents — drobne komponenty statusu z WorkspaceSurfaceRouter
 * (Phase 0 #11 - dziewiąta fala decompose).
 */

import { formatContractValue } from './analysisRunContract';

interface ContractStatusCardProps {
  tone: 'loading' | 'error' | 'idle';
  title: string;
  message: string;
}

export function ContractStatusCard({ tone, title, message }: ContractStatusCardProps) {
  const toneClass =
    tone === 'error'
      ? 'border-sygnal-blokada/40 bg-sygnal-blokada-tlo text-sygnal-blokada-tusz'
      : tone === 'loading'
        ? 'border-slate-200 bg-slate-50 text-slate-600'
        : 'border-slate-200 bg-slate-50 text-slate-700';

  return (
    <div className={`rounded-lg border px-4 py-4 text-sm ${toneClass}`}>
      <div className="font-semibold">{title}</div>
      <div className="mt-1">{message}</div>
    </div>
  );
}

interface ScopePillsProps {
  scopes: string[];
}

export function ScopePills({ scopes }: ScopePillsProps) {
  if (scopes.length === 0) {
    return <div className="text-sm text-slate-600">Nie zadano zakresu stosowalności.</div>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {scopes.map((scope) => (
        <span
          key={scope}
          className="rounded-full border border-sygnal-ok/40 bg-sygnal-ok-tlo px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-sygnal-ok-tusz"
        >
          {formatContractValue(scope)}
        </span>
      ))}
    </div>
  );
}
