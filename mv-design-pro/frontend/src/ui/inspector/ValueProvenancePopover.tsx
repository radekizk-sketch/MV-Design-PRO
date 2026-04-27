/**
 * ValueProvenancePopover — V12 § 5.6 tryb Audyt
 *
 * Popover wyświetlający pełne informacje o pochodzeniu wartości:
 * - Typ źródła (katalog / instancja / obliczenie / system)
 * - Opis po polsku
 * - Powiązany katalog lub uruchomienie obliczeń
 * - Wersja modelu ENM
 * - Status aktualności
 *
 * ZASADY:
 * - Nie wykonuje żadnych obliczeń fizycznych.
 * - Brak zakazanych terminów (PCC, snapshot, run, proof, case, feeder, branch).
 * - Brak pola „source" wyświetla komunikat „brak śladu" — nie generuje sztucznego uzasadnienia.
 * - Otwierany przez kliknięcie ikony przy wartości w PropertyGrid.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { ValueProvenance } from './types';

const FRESHNESS_LABELS: Readonly<Record<string, string>> = Object.freeze({
  FRESH: 'Aktualne',
  OUTDATED: 'Nieaktualne',
  NONE: 'Brak',
});

const FRESHNESS_COLORS: Readonly<Record<string, string>> = Object.freeze({
  FRESH: 'text-emerald-600',
  OUTDATED: 'text-amber-600',
  NONE: 'text-slate-400',
});

interface ValueProvenancePopoverProps {
  fieldLabel: string;
  provenance: ValueProvenance | undefined;
}

/** Ikona „i" wyświetlana przy wartości, otwierająca popover. */
export function ValueProvenanceIcon({
  fieldLabel,
  provenance,
}: ValueProvenancePopoverProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Zamknij po kliknięciu poza popoverem
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  return (
    <div
      ref={ref}
      className="relative inline-flex"
      data-testid={`provenance-icon-${fieldLabel}`}
    >
      <button
        type="button"
        onClick={toggle}
        className="ml-1 flex h-4 w-4 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-[9px] font-bold text-blue-600 hover:bg-blue-100"
        title="Pokaż pochodzenie wartości"
        aria-label={`Pochodzenie wartości: ${fieldLabel}`}
        aria-expanded={open}
        data-testid={`provenance-btn-${fieldLabel}`}
      >
        ź
      </button>

      {open && (
        <div
          className="absolute bottom-full right-0 z-50 mb-1 w-64 rounded border border-slate-200 bg-white p-3 shadow-lg"
          data-testid="provenance-popover"
          role="dialog"
          aria-label="Pochodzenie wartości"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">Pochodzenie wartości</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-slate-400 hover:text-slate-600"
              aria-label="Zamknij"
            >
              ×
            </button>
          </div>

          {provenance ? (
            <dl className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <dt className="text-slate-500">Pole</dt>
                <dd className="font-medium text-slate-800">{fieldLabel}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Źródło</dt>
                <dd className="font-medium text-slate-800">{provenance.sourceLabel}</dd>
              </div>
              <div>
                <dt className="mb-0.5 text-slate-500">Opis</dt>
                <dd className="rounded bg-slate-50 px-2 py-1 text-slate-700">
                  {provenance.descriptionPl}
                </dd>
              </div>
              {provenance.catalogId && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Wpis w katalogu</dt>
                  <dd className="font-mono text-[10px] text-slate-600">{provenance.catalogId}</dd>
                </div>
              )}
              {provenance.runId && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Uruchomienie obliczeń</dt>
                  <dd className="font-mono text-[10px] text-slate-600">
                    {provenance.runId.slice(0, 8)}…
                  </dd>
                </div>
              )}
              {provenance.enmRevision !== undefined && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Wersja modelu ENM</dt>
                  <dd className="font-mono text-slate-600">rev. {provenance.enmRevision}</dd>
                </div>
              )}
              {provenance.updatedAt && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Zaktualizowano</dt>
                  <dd className="text-slate-600">
                    {new Date(provenance.updatedAt).toLocaleString('pl-PL')}
                  </dd>
                </div>
              )}
              {provenance.freshness && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Status</dt>
                  <dd className={`font-semibold ${FRESHNESS_COLORS[provenance.freshness] ?? 'text-slate-400'}`}>
                    {FRESHNESS_LABELS[provenance.freshness] ?? provenance.freshness}
                  </dd>
                </div>
              )}
            </dl>
          ) : (
            <div className="rounded border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700" data-testid="provenance-no-trace">
              Brak śladu obliczeniowego dla tej wartości.
              <br />
              <span className="text-amber-600">
                Wartość pochodzi bezpośrednio z modelu lub katalogu.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ValueProvenanceIcon;
