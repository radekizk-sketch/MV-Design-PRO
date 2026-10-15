/**
 * Interpretacja wykresu TCC — odstępy czasowe par zabezpieczeń liczbami backendu.
 *
 * Panel obok wykresu TCC wymienia KAŻDĄ parę stopniowania w punkcie zwarcia o najmniejszym
 * odstępie: kto zadziała (fakt z backendu, `stan_pl`), czasy i prąd, odstęp obok wymaganego
 * i zdanie backendu z tymi liczbami (`notes_pl`). Koordynacja nie wydaje werdyktów (zakaz
 * P-06) — panel nie wybiera par „wymagających uwagi", nie koloruje liczb i nie porównuje ich
 * z progami; liczby ocenia projektant. Brak ocenianych par jest stanem nazwanym, nigdy
 * „brakiem konfliktów".
 */

import { useState } from 'react';
import type { SelectivityCheck, CoordinationDevice } from './types';
import { LABELS } from './types';

interface TccInterpretationPanelProps {
  /** Sprawdzenia selektywności par (backend) */
  selectivityChecks: SelectivityCheck[];
  /** Urządzenia wyniku (nazwy z modelu) */
  devices: CoordinationDevice[];
  /** Czy panel jest domyślnie zwinięty */
  defaultCollapsed?: boolean;
}

function formatS(wartosc: number | null): string {
  return wartosc === null ? '—' : `${wartosc.toFixed(3)} s`;
}

function formatA(wartosc: number | null): string {
  return wartosc === null ? '—' : `${wartosc.toFixed(0)} A`;
}

function odmianaPar(liczba: number): string {
  if (liczba === 1) return 'para';
  const reszta10 = liczba % 10;
  const reszta100 = liczba % 100;
  return reszta10 >= 2 && reszta10 <= 4 && (reszta100 < 12 || reszta100 > 14) ? 'pary' : 'par';
}

export function TccInterpretationPanel({
  selectivityChecks,
  devices,
  defaultCollapsed = false,
}: TccInterpretationPanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const nazwa = (id: string): string =>
    devices.find((d) => d.id === id)?.name ?? LABELS.devices.nieznaneUrzadzenie;
  const liczbaPar = selectivityChecks.length;
  const bezOdstepu = selectivityChecks.filter((c) => c.margin_s === null).length;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50" data-testid="tcc-interpretation-panel">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-3 text-slate-800 font-semibold text-left hover:opacity-80 transition-opacity"
        aria-expanded={!collapsed}
        aria-controls="tcc-interpretation-content"
      >
        <span className="text-base">Odstępy czasowe par</span>
        <svg
          className={`h-5 w-5 transition-transform ${collapsed ? '' : 'rotate-180'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!collapsed && (
        <div id="tcc-interpretation-content" className="px-4 pb-4 space-y-4">
          <p className="text-sm text-slate-600" data-testid="tcc-interpretation-podsumowanie">
            {liczbaPar === 0
              ? 'Koordynacja nie wyznaczyła odstępu dla żadnej pary zabezpieczeń — selektywność nie jest potwierdzona. Przyczyny braku par są wymienione nad wynikiem.'
              : `${liczbaPar} ${odmianaPar(liczbaPar)} stopniowania; bez odstępu czasowego: ${bezOdstepu}. Odstęp każdej pary w punkcie zwarcia o najmniejszym odstępie, obok wymaganego z kryteriów.`}
          </p>

          {selectivityChecks.map((check, idx) => (
            <div
              key={`${check.upstream_device_id}-${check.downstream_device_id}`}
              className="rounded border border-slate-200 bg-white p-3"
              data-testid={`conflict-item-${idx}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-slate-800">{idx + 1}.</span>
                  <span className="text-sm font-medium text-slate-900">
                    {nazwa(check.downstream_device_id)}
                  </span>
                  <span className="text-slate-400">↔</span>
                  <span className="text-sm font-medium text-slate-900">
                    {nazwa(check.upstream_device_id)}
                  </span>
                </div>
                <span className="text-xs text-slate-600" data-testid={`conflict-item-${idx}-stan`}>
                  {check.stan_pl}
                </span>
              </div>

              <div className="text-xs text-slate-500 mb-2">
                <span className="font-medium">Prąd przekaźnika podrzędnego:</span>{' '}
                <span className="font-mono">{formatA(check.analysis_current_a)}</span>
                <span className="mx-2">|</span>
                <span className="font-medium">t<sub>pod</sub>:</span>{' '}
                <span className="font-mono">{formatS(check.t_downstream_s)}</span>
                <span className="mx-2">|</span>
                <span className="font-medium">t<sub>nad</sub>:</span>{' '}
                <span className="font-mono">{formatS(check.t_upstream_s)}</span>
                <span className="mx-2">|</span>
                <span className="font-medium">Odstęp czasowy:</span>{' '}
                <span className="font-mono">{formatS(check.margin_s)}</span>
                <span className="mx-2">|</span>
                <span className="font-medium">Wymagany:</span>{' '}
                <span className="font-mono">{formatS(check.required_margin_s)}</span>
              </div>

              <div className="text-sm">
                <span className="text-slate-600">{check.notes_pl}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default TccInterpretationPanel;
