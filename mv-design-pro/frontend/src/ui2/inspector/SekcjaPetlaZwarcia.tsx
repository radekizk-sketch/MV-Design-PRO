/*
 * Sekcja inspektora „Pętla zwarcia u źródła (nN)" dla stacji (G-STK-4). Domyka
 * łańcuch uziemienia G-STK-1: pobiera z backendu policzoną impedancję pętli
 * zwarcia u źródła (szyna nN) i prąd Ik dla wybranej stacji. ZERO fizyki w UI —
 * wszystkie liczby (Z_loop, Ik, Z transformatora) pochodzą z solvera
 * (IEC 60364-4-41), tu tylko prezentacja i uczciwe stany.
 */

import { useEffect, useState } from 'react';

import { useAppStateStore } from '../../ui/app-state';
import { MathInline } from '../../ui/proof/MathRenderer';

interface KomponentPetli {
  readonly label: string;
  readonly r_ohm: number;
  readonly x_ohm: number;
  readonly magnitude_ohm: number;
}

/** Wynik pętli doziemnej TT/IT solvera (`WynikTtIt.to_dict()`) — odczyt, zero fizyki w UI. */
interface WynikTtIt {
  readonly uklad: 'TT' | 'IT';
  readonly rodzaj_pradu_pl: string;
  readonly r_a_ohm: number | null;
  readonly r_b_ohm: number | null;
  readonly i_delta_n_a: number | null;
  readonly u_dotyk_v: number | null;
  readonly c_e_f: number | null;
  readonly czestotliwosc_hz: number | null;
  readonly i_d_pierwsze_zwarcie_a: number | null;
  readonly u_dotyk_pierwsze_zwarcie_v: number | null;
  readonly i_d2_min_a: number | null;
  readonly i_d2_max_a: number | null;
}

interface WynikPetli {
  readonly z_loop_ohm: { readonly magnitude: number };
  readonly ik_min_a: number;
  readonly ik_max_a: number;
  readonly components: readonly KomponentPetli[];
  /** Karta W5-E-TTIT: obecne wyłącznie dla układu TT/IT. */
  readonly tt_it?: WynikTtIt | null;
}

interface WidokPetli {
  readonly status: string;
  readonly network_system?: string;
  readonly reason_pl?: string;
  /** Kod odmowy nazwanej (`nn.brak_r_a`, `nn.brak_r_b`, `nn.brak_pojemnosci_doziemnej`, pasmo nN). */
  readonly kod_odmowy?: string | null;
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

/** Prąd [A] → czytelnie (kA gdy ≥ 1000, mA gdy < 1). */
function fmtPrad(a: number): string {
  if (a >= 1000) return `${fmt(a / 1000, 2)} kA`;
  if (a < 1) return `${fmt(a * 1000, 0)} mA`;
  return `${fmt(a, a < 100 ? 2 : 0)} A`;
}

/** Wartość z jednostką albo uczciwy brak (dana nieobecna w wyniku solvera). */
function fmtLubBrak(v: number | null | undefined, format: (x: number) => string): string {
  return v === null || v === undefined ? 'brak danej' : format(v);
}

/** Wiersze pętli doziemnej TT/IT (karta W5-E-TTIT) — wyłącznie odczyt wyniku solvera. */
function WierszeTtIt({ tt }: { readonly tt: WynikTtIt }) {
  if (tt.uklad === 'TT') {
    return (
      <>
        <div className="mvd-insp-petla-para">
          <dt>
            Uziomy <MathInline latex="R_B" /> (stacja) / <MathInline latex="R_A" /> (instalacja)
          </dt>
          <dd className="mvd-num">
            {fmtLubBrak(tt.r_b_ohm, (x) => `${fmt(x, 2)} Ω`)} / {fmtLubBrak(tt.r_a_ohm, (x) => `${fmt(x, 2)} Ω`)}
          </dd>
        </div>
        <div className="mvd-insp-petla-para">
          <dt>
            Prąd różnicowy RCD <MathInline latex="I_{\Delta n}" />
          </dt>
          <dd className="mvd-num">{fmtLubBrak(tt.i_delta_n_a, fmtPrad)}</dd>
        </div>
        <div className="mvd-insp-petla-para">
          <dt>
            Napięcie dotykowe <MathInline latex="R_A \cdot I_{\Delta n}" />
          </dt>
          <dd className="mvd-num">{fmtLubBrak(tt.u_dotyk_v, (x) => `${fmt(x, 2)} V`)}</dd>
        </div>
      </>
    );
  }
  return (
    <>
      <div className="mvd-insp-petla-para">
        <dt>
          Pojemność doziemna sieci <MathInline latex="C_e" />
        </dt>
        <dd className="mvd-num">{fmtLubBrak(tt.c_e_f, (x) => `${fmt(x * 1e6, 3)} µF`)}</dd>
      </div>
      <div className="mvd-insp-petla-para">
        <dt>
          Prąd pierwszego zwarcia doziemnego <MathInline latex="I_d" />
        </dt>
        <dd className="mvd-num">{fmtLubBrak(tt.i_d_pierwsze_zwarcie_a, fmtPrad)}</dd>
      </div>
      <div className="mvd-insp-petla-para">
        <dt>
          Napięcie dotykowe pierwszego zwarcia <MathInline latex="R_A \cdot I_d" />
        </dt>
        <dd className="mvd-num">{fmtLubBrak(tt.u_dotyk_pierwsze_zwarcie_v, (x) => `${fmt(x, 2)} V`)}</dd>
      </div>
      <div className="mvd-insp-petla-para">
        <dt>
          Prąd drugiego zwarcia <MathInline latex="I_{d2}" /> (min / max)
        </dt>
        <dd className="mvd-num">
          {fmtLubBrak(tt.i_d2_min_a, fmtPrad)} / {fmtLubBrak(tt.i_d2_max_a, fmtPrad)}
        </dd>
      </div>
    </>
  );
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
              <dt>
                Impedancja pętli <MathInline latex="Z_s" />
              </dt>
              <dd className="mvd-num">{fmt(d.fault_loop.z_loop_ohm.magnitude, 4)} Ω</dd>
            </div>
            <div className="mvd-insp-petla-para">
              <dt>
                {d.fault_loop.tt_it ? (
                  `Prąd zwarcia doziemnego ${d.fault_loop.tt_it.rodzaj_pradu_pl} (min / max)`
                ) : (
                  <>
                    Prąd zwarcia <MathInline latex="I_k" /> (min / max)
                  </>
                )}
              </dt>
              <dd className="mvd-num">
                {fmtPrad(d.fault_loop.ik_min_a)} / {fmtPrad(d.fault_loop.ik_max_a)}
              </dd>
            </div>
            {d.fault_loop.tt_it ? <WierszeTtIt tt={d.fault_loop.tt_it} /> : null}
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
        <p className="mvd-insp-petla-info" data-testid="mvd-insp-petla-brak" data-kod-odmowy={d.kod_odmowy ?? undefined}>
          {d.kod_odmowy && d.reason_pl
            ? `${d.reason_pl} (kod odmowy: ${d.kod_odmowy})`
            : `Brak danych do wyznaczenia pętli: ${(d.missing_data ?? []).join(', ') || '—'}. Uzupełnij transformator i układ uziemienia w kreatorze stacji.`}
        </p>
      ) : null}
    </section>
  );
}
