/*
 * Sekcja inspektora „Pętla zwarcia u źródła (nN)" dla stacji (G-STK-4). Domyka
 * łańcuch uziemienia G-STK-1: pobiera z backendu policzoną impedancję pętli
 * zwarcia u źródła (szyna nN) i prąd Ik dla wybranej stacji. ZERO fizyki w UI —
 * wszystkie liczby (Z_loop, Ik, Z transformatora) pochodzą z solvera
 * (IEC 60364-4-41), tu tylko prezentacja i uczciwe stany.
 */

import { useEffect, useState } from 'react';

import { useAppStateStore } from '../../ui/app-state';

interface KomponentPetli {
  readonly label: string;
  readonly r_ohm: number;
  readonly x_ohm: number;
  readonly magnitude_ohm: number;
}

interface WynikPetli {
  readonly z_loop_ohm: { readonly magnitude: number };
  readonly ik_min_a: number;
  readonly ik_max_a: number;
  readonly components: readonly KomponentPetli[];
}

interface WidokPetli {
  readonly status: string;
  readonly network_system?: string;
  readonly reason_pl?: string;
  readonly note_pl?: string;
  readonly missing_data?: readonly string[];
  readonly transformer_impedance_ohm?: { readonly r: number; readonly x: number };
  readonly fault_loop?: WynikPetli;
}

type Stan =
  | { readonly rodzaj: 'ladowanie' }
  | { readonly rodzaj: 'blad'; readonly komunikat: string }
  | { readonly rodzaj: 'gotowe'; readonly dane: WidokPetli };

/** Deterministyczny format liczby z przecinkiem PL. */
function fmt(n: number, miejsca: number): string {
  return n.toFixed(miejsca).replace('.', ',');
}

/** Prąd [A] → czytelnie (kA gdy ≥ 1000). */
function fmtPrad(a: number): string {
  return a >= 1000 ? `${fmt(a / 1000, 2)} kA` : `${fmt(a, 0)} A`;
}

export function SekcjaPetlaZwarcia({ stationRef }: { stationRef: string }) {
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const [stan, setStan] = useState<Stan>({ rodzaj: 'ladowanie' });

  useEffect(() => {
    if (!activeCaseId || !stationRef) return;
    let anulowane = false;
    setStan({ rodzaj: 'ladowanie' });
    const url =
      `/api/cases/${encodeURIComponent(activeCaseId)}/enm/station-fault-loop`
      + `?station_ref=${encodeURIComponent(stationRef)}`;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Zapytanie ${url} nie powiodło się: ${r.status}`);
        return r.json() as Promise<WidokPetli>;
      })
      .then((dane) => {
        if (!anulowane) setStan({ rodzaj: 'gotowe', dane });
      })
      .catch((err: unknown) => {
        if (!anulowane) {
          setStan({ rodzaj: 'blad', komunikat: err instanceof Error ? err.message : 'Błąd' });
        }
      });
    return () => {
      anulowane = true;
    };
  }, [activeCaseId, stationRef]);

  if (stan.rodzaj === 'ladowanie') {
    return (
      <section className="mvd-insp-petla" data-testid="mvd-insp-petla-ladowanie">
        <h4 className="mvd-insp-petla-tytul">Pętla zwarcia u źródła (nN)</h4>
        <p className="mvd-insp-petla-info">Wczytywanie…</p>
      </section>
    );
  }
  if (stan.rodzaj === 'blad') {
    return (
      <section className="mvd-insp-petla" data-testid="mvd-insp-petla-blad">
        <h4 className="mvd-insp-petla-tytul">Pętla zwarcia u źródła (nN)</h4>
        <p className="mvd-insp-petla-info">{stan.komunikat}</p>
      </section>
    );
  }

  const d = stan.dane;
  return (
    <section className="mvd-insp-petla" data-testid="mvd-insp-petla">
      <h4 className="mvd-insp-petla-tytul">Pętla zwarcia u źródła (nN)</h4>
      {d.network_system ? (
        <p className="mvd-insp-petla-uklad">Układ sieci nN: {d.network_system}</p>
      ) : null}

      {d.status === 'OK' && d.fault_loop ? (
        <>
          <dl className="mvd-insp-petla-dl">
            <div className="mvd-insp-petla-para">
              <dt>Impedancja pętli Z_s</dt>
              <dd className="mvd-num">{fmt(d.fault_loop.z_loop_ohm.magnitude, 4)} Ω</dd>
            </div>
            <div className="mvd-insp-petla-para">
              <dt>Prąd zwarcia Ik (min / max)</dt>
              <dd className="mvd-num">
                {fmtPrad(d.fault_loop.ik_min_a)} / {fmtPrad(d.fault_loop.ik_max_a)}
              </dd>
            </div>
            {d.transformer_impedance_ohm ? (
              <div className="mvd-insp-petla-para">
                <dt>Impedancja transformatora (R + jX)</dt>
                <dd className="mvd-num">
                  {fmt(d.transformer_impedance_ohm.r, 4)} + j{fmt(d.transformer_impedance_ohm.x, 4)} Ω
                </dd>
              </div>
            ) : null}
          </dl>
          {d.note_pl ? <p className="mvd-insp-petla-info">{d.note_pl}</p> : null}
        </>
      ) : null}

      {d.status === 'nie dotyczy' ? (
        <p className="mvd-insp-petla-info" data-testid="mvd-insp-petla-niedotyczy">
          {d.reason_pl}
        </p>
      ) : null}

      {d.status === 'brak danych' ? (
        <p className="mvd-insp-petla-info" data-testid="mvd-insp-petla-brak">
          Brak danych do wyznaczenia pętli: {(d.missing_data ?? []).join(', ') || '—'}.
          Uzupełnij transformator i układ uziemienia w kreatorze stacji.
        </p>
      ) : null}
    </section>
  );
}
