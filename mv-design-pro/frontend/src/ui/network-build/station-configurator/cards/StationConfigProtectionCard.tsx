/**
 * Karta 8 — Zabezpieczenia i automatyka (PR-8a, brief §8 karta 8).
 *
 * Dwa werdykty inżynierskie tej karty pochodzą Z BACKENDU i karta ich NIE LICZY:
 *  - zgodność przekładnika napięciowego ze sposobem uziemienia (IEC 61869-3) —
 *    `WalidacjaVtPolaSekcja` (V12K-257),
 *  - wytrzymałość zwarciowa aparatury I_dyn / I_th (IEC 60909) —
 *    `WalidacjaWytrzymalosciAparaturySekcja` (K7-B, 2026-07-31).
 * Karta zestawia dane pól i pokazuje odpowiedzi; reguła NOT-A-SOLVER.
 *
 * Przekaźniki pochodzą z modelu (`przekaznikiStacji.ts`: `Bay.protection_ref` →
 * `ProtectionAssignment`). Dawne sekcje „Automatyka”, „Uzależnienia łączeniowe” i „Sterowanie”
 * usunięte: zasilała je stała bez źródła w modelu (pusta lista, `false`, „lokalne”) — automatykę
 * i blokady pola pokazuje ekran zabezpieczeń i automatyki z read-modelu pól.
 */

import { useEffect, useState } from 'react';

import { fetchVtTypes } from '../../../catalog/api';
import type { VTCatalogType } from '../../../catalog/types';
import { WalidacjaVtPolaSekcja, type KontekstUziemieniaStacji } from './WalidacjaVtPolaSekcja';
import { WalidacjaWytrzymalosciAparaturySekcja } from './WalidacjaWytrzymalosciAparaturySekcja';

export interface ProtectionRow {
  readonly relayId: string;
  readonly bayDesignation: string;
  readonly typePl: string;
  readonly functionsPl: readonly string[];  // np. ["50/51", "51N", "67"]
  readonly settingsCount: number;
  /** `ProtectionAssignment.is_enabled` — zabezpieczenie wyłączone w modelu jest widoczne jako takie. */
  readonly enabled: boolean;
  /** Naprawa eng.20: catalog_ref VT używanego dla pól zabezpieczeniowych. */
  readonly vtCatalogRef?: string | null;
}

/** Naprawa eng.18: dane wytrzymałości aparatury w polu (z katalogu device_withstand). */
export interface DeviceWithstandRow {
  readonly bayDesignation: string;
  readonly deviceCatalogRef: string;
  readonly i_peak_calculated_ka: number;
  readonly i_thermal_calculated_ka: number;
  readonly t_clearing_s: number;
}

export interface StationConfigProtectionCardProps {
  readonly relays: readonly ProtectionRow[];
  /** Stacja projektu, z której modelu backend czyta sposób uziemienia sieci SN pól
   *  (zgodność przekładników, karta UX-04/POLE-ZU); `null` — brak projektu albo stacji. */
  readonly kontekstUziemienia?: KontekstUziemieniaStacji | null;
  /** Naprawa eng.18: lista aparatów do walidacji wytrzymałości. */
  readonly deviceWithstandRows?: readonly DeviceWithstandRow[];
  /** Phase 18: VT onChange (per bay). */
  readonly onChangeVt?: (bayDesignation: string, vtId: string | null) => void;
}

export function StationConfigProtectionCard(
  props: StationConfigProtectionCardProps,
): JSX.Element {
  const {
    relays,
    kontekstUziemienia,
    deviceWithstandRows,
    onChangeVt,
  } = props;

  // WYBOR Z KATALOGU BACKENDU, NIE Z LOKALNEJ LISTY (V12K-257). Poprzednia wersja
  // oferowala cztery typy zapisane w pliku frontu; ich identyfikatory nie istnialy
  // w katalogu backendu, wiec zapisany wybor byl referencja donikad — dobor
  // przekladnika (V12K-255) widzial „typ nieznany katalogowi".
  const [typyVt, setTypyVt] = useState<readonly VTCatalogType[] | null>(null);
  useEffect(() => {
    if (!onChangeVt) return;
    let aktualne = true;
    void fetchVtTypes()
      .then((typy) => {
        if (aktualne) setTypyVt(typy);
      })
      .catch(() => {
        if (aktualne) setTypyVt([]);
      });
    return () => {
      aktualne = false;
    };
  }, [onChangeVt]);

  return (
    <div data-testid="station-config-protection" className="flex flex-col gap-2 text-xs">
      <div className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
        Zabezpieczenia i automatyka
      </div>

      <div data-testid="protection-relays-list">
        <div className="text-[10px] font-medium text-scada-muted">Przekaźniki ({relays.length})</div>
        {relays.length === 0 ? (
          <div className="italic text-scada-muted">
            Pola SN tej stacji nie mają przypiętych zabezpieczeń — zabezpieczenie dodaje się z menu
            pola SN albo z wariantu pola z pakietem zabezpieczeniowym.
          </div>
        ) : (
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-scada-border text-scada-muted">
                <th className="text-left">Pole</th>
                <th className="text-left">Typ</th>
                <th className="text-left">Funkcje</th>
                <th className="text-right">Nastawy</th>
                <th className="text-left">Przekł. napięciowy pola</th>
              </tr>
            </thead>
            <tbody>
              {relays.map((r) => (
                <tr key={r.relayId} data-testid={`relay-row-${r.relayId}`} className="border-b border-scada-border/40">
                  <td className="font-mono">{r.bayDesignation}</td>
                  <td>
                    {r.typePl}
                    {!r.enabled && (
                      <span data-testid={`relay-wylaczone-${r.relayId}`} className="ml-1 text-status-warn">
                        (wyłączone w modelu)
                      </span>
                    )}
                  </td>
                  <td className="font-mono text-[10px]">{r.functionsPl.join(', ')}</td>
                  <td className="text-right font-mono">{r.settingsCount}</td>
                  <td>
                    {/* Phase 18: VT select per row gdy onChangeVt dostarczony. */}
                    {onChangeVt ? (
                      <select
                        data-testid={`relay-vt-select-${r.relayId}`}
                        value={r.vtCatalogRef ?? ''}
                        onChange={(e) => onChangeVt(r.bayDesignation, e.target.value || null)}
                        className="rounded border border-scada-border bg-scada-bg px-1 py-0.5 text-[10px]"
                      >
                        <option value="">—</option>
                        {(typyVt ?? []).map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-[10px] text-scada-muted">
                        {r.vtCatalogRef ?? '—'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <WalidacjaVtPolaSekcja
        pola={relays.map((r) => ({
          bayDesignation: r.bayDesignation,
          vtCatalogRef: r.vtCatalogRef ?? null,
        }))}
        kontekst={kontekstUziemienia ?? null}
      />

      <WalidacjaWytrzymalosciAparaturySekcja pola={deviceWithstandRows ?? []} />
    </div>
  );
}
