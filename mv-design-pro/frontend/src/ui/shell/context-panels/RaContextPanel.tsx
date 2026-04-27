/**
 * RaContextPanel — Panel kontekstu obszaru RA (Raporty).
 *
 * Wyświetla:
 *  - Listę szablonów raportów (Proof Pack types)
 *  - Status aktywnego przypadku (czy są wyniki)
 *  - Eksport (PDF / DOCX / JSON)
 *
 * Catalog-first, no codenames, dark SCADA palette.
 */

import { clsx } from 'clsx';
import { useAppStateStore } from '../../app-state/store';

interface ReportTemplate {
  id: string;
  label: string;
  description: string;
  requires: 'SC' | 'LF' | 'PROT' | 'ANY';
}

const TEMPLATES: ReportTemplate[] = [
  { id: 'SC3F', label: 'Zwarcie 3-fazowe', description: 'IEC 60909, krok-po-kroku', requires: 'SC' },
  { id: 'SC1F', label: 'Zwarcie 1-fazowe doziemne', description: 'IEC 60909, składowe symetryczne', requires: 'SC' },
  { id: 'VDROP', label: 'Spadek napięcia', description: 'Profil napięcia, IEC 60038', requires: 'LF' },
  { id: 'EQUIPMENT', label: 'Wytrzymałość aparatów', description: 'Termiczna i dynamiczna', requires: 'SC' },
  { id: 'POWER_FLOW', label: 'Rozpływ mocy', description: 'Newton-Raphson, profil U/P/Q', requires: 'LF' },
  { id: 'LOSSES', label: 'Bilans strat', description: 'Straty czynne i bierne', requires: 'LF' },
  { id: 'PROTECTION', label: 'Koordynacja zabezpieczeń', description: 'Krzywe TCC, selektywność', requires: 'PROT' },
  { id: 'EARTHING', label: 'Uziemienia', description: 'Napięcie dotykowe i rażenia', requires: 'SC' },
];

function getRequiresLabel(requires: ReportTemplate['requires']): string {
  switch (requires) {
    case 'SC': return 'wymaga zwarć';
    case 'LF': return 'wymaga rozpływu';
    case 'PROT': return 'wymaga zabezp.';
    default: return '';
  }
}

export function RaContextPanel() {
  const activeCaseName = useAppStateStore((s) => s.activeCaseName);
  const resultStatus = useAppStateStore((s) => s.activeCaseResultStatus);
  const hasResults = resultStatus === 'FRESH';
  const isOutdated = resultStatus === 'OUTDATED';

  return (
    <div
      data-testid="ra-context-panel"
      className="flex h-full flex-col overflow-hidden bg-scada-panel"
    >
      <div className="border-b border-scada-border px-3 py-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
          Raporty i uzasadnienia
        </span>
        <div className="mt-1 text-[11px] text-scada-text">
          <span className="text-scada-muted">Przypadek: </span>
          <span className="font-mono">{activeCaseName ?? '—'}</span>
        </div>
        <div
          data-testid="ra-results-status"
          className={clsx(
            'mt-1 inline-block rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
            hasResults
              ? 'bg-scada-energized/15 text-scada-energized'
              : isOutdated
                ? 'bg-scada-grounded/15 text-scada-grounded'
                : 'bg-scada-dead/15 text-scada-muted',
          )}
        >
          {hasResults
            ? 'Wyniki aktualne'
            : isOutdated
              ? 'Wymaga ponownego obliczenia'
              : 'Brak wyników'}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto" data-testid="ra-template-list">
        <ul className="divide-y divide-scada-border">
          {TEMPLATES.map((tpl) => (
            <li
              key={tpl.id}
              data-testid={`ra-template-${tpl.id}`}
              className="flex flex-col gap-0.5 px-3 py-2 hover:bg-scada-hover-nav"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9px] text-scada-muted">[{tpl.id}]</span>
                <span className="flex-1 text-[12px] font-semibold text-scada-text">{tpl.label}</span>
              </div>
              <div className="text-[10px] text-scada-muted">{tpl.description}</div>
              {tpl.requires !== 'ANY' && (
                <div className="text-[9px] uppercase tracking-wider text-scada-grounded">
                  {getRequiresLabel(tpl.requires)}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="shrink-0 border-t border-scada-border bg-scada-bg p-2">
        <div className="text-[10px] text-scada-muted">
          Eksport raportu uruchamia się z Inspektora po wybraniu szablonu i zatwierdzeniu danych.
        </div>
      </div>
    </div>
  );
}
