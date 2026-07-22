/*
 * Model i adaptery ekranu „Składowe symetryczne i sieć zerowa" (E-29, karta P-3).
 * Czyste projekcje read-only — ZERO fizyki, ZERO pobrań, ZERO mutacji.
 *
 * ŹRÓDŁA DANYCH — realny kontrakt (mapowanie plik:linia, zero zgadywania):
 * - Wiersze kanoniczne zwarcia: `ShortCircuitRow` (`ui/results-inspector/types.ts`)
 *   budowane w `build_short_circuit_results` (enm/canonical_analysis.py:1949-1992):
 *   bilans F1 (rk/xk/zk/xr/kappa/c_factor/tk_s), fault_type, werdykt raportowalności
 *   (reporting_status_pl — pole addytywne lustra, canonical_analysis.py:1974-1985).
 * - Impedancje składowych Z1/Z2/Z0: WYŁĄCZNIE ślad WHITE BOX przebiegu — krok
 *   solvera FROZEN o key="Zk" (short_circuit_iec60909.py:291-339: inputs
 *   z1_ohm/z2_ohm/z0_ohm jako complex {re, im}, formula_latex, substitution_latex),
 *   dostępny przez `GET /analysis-runs/{id}/results/trace` (`ExtendedTrace`).
 *   Kontrakt to_dict solvera NIE niesie z1/z2/z0 poza śladem (GAP — patrz raport P-3).
 * - Uziemienie punktu neutralnego: ZAMROŻONA wersja układu przebiegu
 *   (`GET /analysis-runs/{id}/snapshot` → EnergyNetworkModel): `Bus.grounding`
 *   oraz `Transformer.hv_neutral`/`lv_neutral` (types/enm.ts:117,232-233).
 */

import type { EnergyNetworkModel, GroundingConfig } from '../../../types/enm';
import type {
  ExtendedTrace,
  ShortCircuitRow,
} from '../../../ui/results-inspector/types';
import type { DefinicjaKolumny, WartoscKomorki, WierszTabeli, WierszZalozenia } from '../wzorzec';
import {
  fmtCzas,
  fmtKA,
  fmtKappa,
  fmtOhm,
  fmtWspolczynnik,
  rodzajZwarciaPL,
} from '../zwarcia/strings';
import { SKLADOWE_STRINGS as T, uziemieniePL } from './strings';

// ---------------------------------------------------------------------------
// Wybór przebiegu zwarcia niesymetrycznego (1F / 2F / 2F+Z)
// ---------------------------------------------------------------------------

/** Typy przebiegów zwarć NIESYMETRYCZNYCH (kontrakt ExecutionAnalysisType). */
export const TYPY_NIESYMETRYCZNE = new Set<string>(['SC_1F', 'SC_2F', 'SC_2F_G']);

const STATUS_ZAKONCZONY = 'DONE';

export interface PrzebiegDoWyboru {
  readonly id: string;
  readonly analysis_type: string;
  readonly status: string;
  readonly finished_at?: string | null;
  readonly started_at?: string | null;
}

/**
 * Wybiera przebieg do interpretacji składowych: aktywny przebieg, jeśli jest
 * zakończonym zwarciem niesymetrycznym; inaczej najnowszy zakończony przebieg
 * niesymetryczny (sort deterministyczny po finished_at/started_at malejąco);
 * brak → null (uczciwy stan zerowy ekranu).
 */
export function wybierzPrzebiegNiesymetryczny<T extends PrzebiegDoWyboru>(
  przebiegi: readonly T[],
  activeRunId: string | null,
): T | null {
  const niesymetryczne = przebiegi.filter(
    (r) => r.status === STATUS_ZAKONCZONY && TYPY_NIESYMETRYCZNE.has(r.analysis_type),
  );
  if (niesymetryczne.length === 0) return null;
  const aktywny = activeRunId ? niesymetryczne.find((r) => r.id === activeRunId) : undefined;
  if (aktywny) return aktywny;
  return [...niesymetryczne].sort((a, b) =>
    String(b.finished_at ?? b.started_at ?? '').localeCompare(
      String(a.finished_at ?? a.started_at ?? ''),
    ),
  )[0];
}

// ---------------------------------------------------------------------------
// Założenia przebiegu (część wyniku — W-602). Wartości WPROST z pierwszego
// wiersza kanonicznego (c_factor/tk_s są stałe per przebieg — jedna konfiguracja).
// ---------------------------------------------------------------------------

export function naZalozeniaSkladowych(rows: readonly ShortCircuitRow[]): WierszZalozenia[] {
  const pierwszy = rows[0];
  return [
    {
      etykieta: T.zalRodzaj,
      wartosc: pierwszy ? rodzajZwarciaPL(pierwszy.fault_type) : T.kreska,
    },
    { etykieta: T.zalMetoda, wartosc: T.zalMetodaWartosc },
    {
      etykieta: T.zalWspolczynnikC,
      wartosc:
        pierwszy?.c_factor != null ? fmtWspolczynnik(pierwszy.c_factor) : T.kreska,
    },
    {
      etykieta: T.zalCzasTrwania,
      wartosc: pierwszy?.tk_s != null ? fmtCzas(pierwszy.tk_s) : T.kreska,
      jednostka: pierwszy?.tk_s != null ? T.jednS : undefined,
    },
    { etykieta: T.zalLiczbaPunktow, wartosc: rows.length },
  ];
}

// ---------------------------------------------------------------------------
// Tabela punktów zwarcia — bilans impedancyjny + werdykt raportowalności
// ---------------------------------------------------------------------------

export const KLUCZ_PUNKT = 'identyfikator';

export const KOLUMNY_SKLADOWYCH: DefinicjaKolumny[] = [
  { klucz: 'punkt', etykieta: T.kolPunkt, wyrownanie: 'lewo' },
  { klucz: 'rodzaj', etykieta: T.kolRodzaj, wyrownanie: 'lewo' },
  { klucz: 'zk', etykieta: T.kolZk, jednostka: T.jednOhm, mono: true },
  { klucz: 'rk', etykieta: T.kolRk, jednostka: T.jednOhm, mono: true, tylkoEkspercki: true },
  { klucz: 'xk', etykieta: T.kolXk, jednostka: T.jednOhm, mono: true, tylkoEkspercki: true },
  { klucz: 'xr', etykieta: T.kolXR, mono: true },
  { klucz: 'kappa', etykieta: T.kolKappa, mono: true, tylkoEkspercki: true },
  { klucz: 'ikss', etykieta: T.kolIkss, jednostka: T.jednKA, mono: true },
  { klucz: 'werdykt', etykieta: T.kolWerdykt, wyrownanie: 'lewo', sortowalna: false },
  {
    klucz: KLUCZ_PUNKT,
    etykieta: T.kolIdentyfikator,
    mono: true,
    wyrownanie: 'lewo',
    tylkoEkspercki: true,
  },
];

function komorka(
  wartosc: number | null | undefined,
  format: (n: number) => string,
  dowodRef: string,
): WartoscKomorki {
  if (wartosc == null) {
    return { wartosc: T.kreska, sortKey: Number.NEGATIVE_INFINITY };
  }
  return { wartosc: format(wartosc), sortKey: wartosc, dowodRef };
}

/** Werdykt raportowalności wiersza — PL z backendu; starszy wynik → kreska. */
export function werdyktPL(row: ShortCircuitRow): string {
  return row.reporting_status_pl ?? row.reporting_status ?? T.kreska;
}

export function naWierszeSkladowych(rows: readonly ShortCircuitRow[]): WierszTabeli[] {
  return rows.map((row) => {
    const dowodRef = row.element_id ?? row.target_id;
    return {
      punkt: { wartosc: row.target_name ?? T.kreska },
      rodzaj: { wartosc: rodzajZwarciaPL(row.fault_type) },
      zk: komorka(row.zk_ohm, fmtOhm, dowodRef),
      rk: komorka(row.rk_ohm, fmtOhm, dowodRef),
      xk: komorka(row.xk_ohm, fmtOhm, dowodRef),
      xr: komorka(row.xr_ratio, fmtKappa, dowodRef),
      kappa: komorka(row.kappa, fmtKappa, dowodRef),
      ikss: komorka(row.ikss_ka, fmtKA, dowodRef),
      werdykt: { wartosc: werdyktPL(row) },
      [KLUCZ_PUNKT]: { wartosc: row.target_id },
    };
  });
}

// ---------------------------------------------------------------------------
// Impedancje składowych Z1/Z2/Z0 — ze śladu WHITE BOX (krok "Zk" solvera FROZEN)
// ---------------------------------------------------------------------------

/** Liczba zespolona kontraktu solvera (`serialize_complex`: {re, im}). */
export interface Zespolona {
  readonly re: number;
  readonly im: number;
}

/** Składowe wybranego punktu — projekcja read-only kroku śladu "Zk". */
export interface SkladoweSladu {
  readonly z1: Zespolona | null;
  readonly z2: Zespolona | null;
  readonly z0: Zespolona | null;
  readonly formulaLatex: string | null;
  readonly substitutionLatex: string | null;
}

export function naZespolona(wartosc: unknown): Zespolona | null {
  if (typeof wartosc !== 'object' || wartosc === null) return null;
  const re = (wartosc as Record<string, unknown>)['re'];
  const im = (wartosc as Record<string, unknown>)['im'];
  if (typeof re !== 'number' || typeof im !== 'number') return null;
  return { re, im };
}

/**
 * Wyszukuje w śladzie WHITE BOX krok impedancji zastępczej (key="Zk") dla
 * wskazanego punktu i wyciąga składowe z1/z2/z0 z jego danych wejściowych.
 * Brak kroku / pól → null (uczciwy brak — sekcja pokazuje komunikat, nie liczy).
 */
export function skladoweZeSladu(
  slad: ExtendedTrace | null,
  targetId: string | null,
): SkladoweSladu | null {
  if (!slad || !targetId) return null;
  const krok = slad.white_box_trace.find(
    (step) => step.key === 'Zk' && step.target_id === targetId,
  );
  if (!krok) return null;
  const inputs = (krok.inputs ?? {}) as Record<string, unknown>;
  return {
    z1: naZespolona(inputs['z1_ohm']),
    z2: naZespolona(inputs['z2_ohm']),
    z0: naZespolona(inputs['z0_ohm']),
    formulaLatex: typeof krok.formula_latex === 'string' ? krok.formula_latex : null,
    substitutionLatex:
      typeof krok.substitution === 'string'
        ? krok.substitution
        : typeof (krok as Record<string, unknown>)['substitution_latex'] === 'string'
          ? String((krok as Record<string, unknown>)['substitution_latex'])
          : null,
  };
}

/**
 * Składowe wybranego punktu — RESULT-FIRST (delta FROZEN V12K-128): najpierw
 * pola wyniku kanonicznego (`z1_ohm`/`z2_ohm`/`z0_ohm` z solvera FROZEN), a ślad
 * WHITE BOX ("Zk") jako FALLBACK dla starszych biegów bez tych pól oraz jako
 * źródło wzoru/podstawienia KaTeX (te są wyłącznie w śladzie). Zero fizyki,
 * zero fabrykacji: gdy ani wynik, ani ślad nie niosą składowych → null.
 */
export function skladowePunktu(
  row: ShortCircuitRow | null,
  slad: ExtendedTrace | null,
  targetId: string | null,
): SkladoweSladu | null {
  const zeSladu = skladoweZeSladu(slad, targetId);
  const z1 = naZespolona(row?.z1_ohm ?? null) ?? zeSladu?.z1 ?? null;
  const z2 = naZespolona(row?.z2_ohm ?? null) ?? zeSladu?.z2 ?? null;
  const z0 = naZespolona(row?.z0_ohm ?? null) ?? zeSladu?.z0 ?? null;
  const formulaLatex = zeSladu?.formulaLatex ?? null;
  const substitutionLatex = zeSladu?.substitutionLatex ?? null;
  if (z1 === null && z2 === null && z0 === null && formulaLatex === null && substitutionLatex === null) {
    return null;
  }
  return { z1, z2, z0, formulaLatex, substitutionLatex };
}

/**
 * Format zespolonej impedancji „R ± jX" z przecinkiem PL (czyste formatowanie
 * prezentacyjne wartości backendu — bez arytmetyki).
 */
export function fmtZespolona(z: Zespolona): string {
  const znak = z.im >= 0 ? '+' : '−';
  const im = z.im >= 0 ? z.im : -z.im;
  return `${fmtOhm(z.re)} ${znak} j ${fmtOhm(im)}`;
}

// ---------------------------------------------------------------------------
// Uziemienie punktu neutralnego — z ZAMROŻONEJ wersji układu przebiegu
// ---------------------------------------------------------------------------

/** Wpis konfiguracji uziemienia (szyna albo strona transformatora). */
export interface UziemienieWpis {
  readonly element: string;
  readonly strona: string | null;
  readonly opis: string;
  readonly rOhm: number | null;
  readonly xOhm: number | null;
}

function wpisUziemienia(
  element: string,
  strona: string | null,
  config: GroundingConfig,
): UziemienieWpis {
  return {
    element,
    strona,
    opis: uziemieniePL(config.type),
    rOhm: config.r_ohm ?? null,
    xOhm: config.x_ohm ?? null,
  };
}

/** Uziemienie szyny wybranego punktu (dopasowanie po ref_id/element_id). */
export function uziemieniePunktu(
  snapshot: EnergyNetworkModel | null,
  elementId: string | null,
): UziemienieWpis | null {
  if (!snapshot || !elementId) return null;
  const szyna = snapshot.buses.find((bus) => bus.ref_id === elementId || bus.id === elementId);
  if (!szyna || !szyna.grounding) return null;
  return wpisUziemienia(szyna.name || szyna.ref_id, null, szyna.grounding);
}

/**
 * Wszystkie jawne konfiguracje punktu neutralnego w zamrożonej wersji układu:
 * szyny z polem `grounding` oraz strony GN/DN transformatorów. Pusta lista =
 * model bez jawnego uziemienia (uczciwy komunikat z akcją naprawczą).
 */
export function uziemieniaSieci(snapshot: EnergyNetworkModel | null): UziemienieWpis[] {
  if (!snapshot) return [];
  const wpisy: UziemienieWpis[] = [];
  for (const bus of snapshot.buses) {
    if (bus.grounding) wpisy.push(wpisUziemienia(bus.name || bus.ref_id, null, bus.grounding));
  }
  for (const trafo of snapshot.transformers) {
    if (trafo.hv_neutral) {
      wpisy.push(wpisUziemienia(trafo.name || trafo.ref_id, T.uziemienieStronaGN, trafo.hv_neutral));
    }
    if (trafo.lv_neutral) {
      wpisy.push(wpisUziemienia(trafo.name || trafo.ref_id, T.uziemienieStronaDN, trafo.lv_neutral));
    }
  }
  return wpisy;
}

/** Format wpisu impedancji uziemienia (R/X w Ω) — kreska przy braku. */
export function fmtImpedancjaUziemienia(wpis: UziemienieWpis): string | null {
  const czesci: string[] = [];
  if (wpis.rOhm != null) czesci.push(`${T.uziemienieRezystancja} = ${fmtOhm(wpis.rOhm)} ${T.jednOhm}`);
  if (wpis.xOhm != null) czesci.push(`${T.uziemienieReaktancja} = ${fmtOhm(wpis.xOhm)} ${T.jednOhm}`);
  return czesci.length > 0 ? czesci.join(' · ') : null;
}
