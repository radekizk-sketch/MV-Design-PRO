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
 *   (`GET /analysis-runs/{id}/snapshot` → EnergyNetworkModel): zespoły uziemiające sieci SN
 *   (`zespoly_uziemiajace`, karta UX-04/POLE-ZU-SKLADOWA-ZEROWA — jedyny nośnik uziemienia
 *   sieci SN obok uzwojenia transformatora), `Source.neutral_grounding` (wyłącznie sieć
 *   110 kV za granicą modelu) oraz `Transformer.hv_neutral`/`lv_neutral`. Ekran WYPISUJE
 *   zainstalowane aparaty; wariantu pracy sieci (stany odłączników, AWSC) ani Z_N nie liczy
 *   — robi to backend (`enm.uziemienie_sekcji`, dane przyjęte wiersza i ślad White Box).
 *
 * ROZPOZNANIE LICZBY ZESPOLONEJ (karta WB-2, KLASA NIE INSTANCJA — czwarte
 * miejsce znalezione przy inwentarzu klasy): `naZespolona` woła WSPÓLNE
 * miejsce duck-typingu `{re, im}` całego frontu,
 * `ui/results-inspector/traceValue.ts::rozpakujWartoscSladu`, zamiast
 * własnej, osobnej kopii sprawdzenia kształtu.
 */

import type { EnergyNetworkModel, GroundingConfig, ZespolUziemiajacy } from '../../../types/enm';
import type {
  DoziemienieSieci,
  ExtendedTrace,
  ShortCircuitRow,
} from '../../../ui/results-inspector/types';
import type { DefinicjaKolumny, WartoscKomorki, WierszTabeli, WierszZalozenia } from '../wzorzec';
import {
  fmtCzas,
  fmtKA,
  fmtKappa,
  fmtOhm,
  fmtLiczba,
  fmtWspolczynnik,
  rodzajZwarciaPL,
} from '../zwarcia/strings';
import { rozpakujWartoscSladu } from '../../../ui/results-inspector/traceValue';
import { wielkoscPl } from '../wzorzec/KartaWerdyktu';
import { SKLADOWE_STRINGS as T, uziemieniePL } from './strings';

// ---------------------------------------------------------------------------
// Wybór przebiegu zwarcia niesymetrycznego (1F / 2F / 2F+Z)
// ---------------------------------------------------------------------------

/** Typy przebiegów zwarć NIESYMETRYCZNYCH (kontrakt ExecutionAnalysisType). */
export const TYPY_NIESYMETRYCZNE = new Set<string>(['SC_1F', 'SC_2F', 'SC_2F_G']);

export interface PrzebiegDoWyboru {
  readonly id: string;
  readonly analysis_type: string;
}

/**
 * Przebieg ekranu składowych (karta K8): AKTYWNY bieg rodziny „zwarcie" z magazynu
 * kontekstu wyniku — ten sam, który jest na schemacie, pasku stanu i w panelu dolnym.
 * Składowe interpretują wyłącznie zwarcie niesymetryczne, więc gdy aktywny bieg zwarcia
 * jest symetryczny (3F), ekran NIE wybiera po cichu innego biegu: zwraca kandydata
 * (najnowszy zakończony bieg niesymetryczny — `biegiZwarcia` są od najnowszego) do
 * JAWNEGO przełączenia kontekstu. Brak biegu niesymetrycznego → `brak` (stan zerowy).
 */
export type WyborPrzebieguSkladowych<T extends PrzebiegDoWyboru> =
  | { readonly rodzaj: 'aktywny'; readonly przebieg: T }
  | { readonly rodzaj: 'aktywnySymetryczny'; readonly aktywny: T; readonly kandydat: T }
  | { readonly rodzaj: 'brak' };

export function wyborPrzebieguSkladowych<T extends PrzebiegDoWyboru>(
  aktywnyZwarcia: T | null,
  biegiZwarcia: readonly T[],
): WyborPrzebieguSkladowych<T> {
  if (aktywnyZwarcia && TYPY_NIESYMETRYCZNE.has(aktywnyZwarcia.analysis_type)) {
    return { rodzaj: 'aktywny', przebieg: aktywnyZwarcia };
  }
  const kandydat = biegiZwarcia.find((r) => TYPY_NIESYMETRYCZNE.has(r.analysis_type));
  if (aktywnyZwarcia && kandydat) return { rodzaj: 'aktywnySymetryczny', aktywny: aktywnyZwarcia, kandydat };
  return { rodzaj: 'brak' };
}

// ---------------------------------------------------------------------------
// Założenia przebiegu (część wyniku — W-602). Rodzaj zwarcia i t_k WPROST z
// pierwszego wiersza kanonicznego (stałe per przebieg — jedna konfiguracja).
// Współczynnik c NIE jest stały per przebieg (karta WSPOLCZYNNIK-C-JEDEN-NOSNIK:
// backend dobiera c per węzeł z tabeli 1 IEC 60909-0) — jedna liczba tylko wtedy,
// gdy WSZYSTKIE wiersze niosą tę samą parę (c, podstawa c); inaczej odesłanie do
// kolumn tabeli punktów.
// ---------------------------------------------------------------------------

function wierszWspolczynnikaC(rows: readonly ShortCircuitRow[]): WierszZalozenia {
  const pary = new Set(rows.map((r) => `${r.c_factor ?? ''}|${r.c_zrodlo ?? ''}`));
  const pierwszy = rows[0];
  if (!pierwszy || pierwszy.c_factor == null) {
    return { etykieta: T.zalWspolczynnikC, wartosc: T.kreska };
  }
  if (pary.size > 1) {
    return { etykieta: T.zalWspolczynnikC, wartosc: T.zalWspolczynnikCPerWezel };
  }
  const wartosc = fmtWspolczynnik(pierwszy.c_factor);
  const zrodlo = pierwszy.c_zrodlo?.trim() ? pierwszy.c_zrodlo : null;
  return {
    etykieta: T.zalWspolczynnikC,
    // Podstawa c w treści wiersza (nie tylko w dymku) — c bez podstawy jest liczbą bez dowodu.
    wartosc: zrodlo ? `${wartosc} (${zrodlo})` : wartosc,
  };
}

export function naZalozeniaSkladowych(rows: readonly ShortCircuitRow[]): WierszZalozenia[] {
  const pierwszy = rows[0];
  return [
    {
      etykieta: T.zalRodzaj,
      wartosc: pierwszy ? rodzajZwarciaPL(pierwszy.fault_type) : T.kreska,
    },
    { etykieta: T.zalMetoda, wartosc: T.zalMetodaWartosc },
    wierszWspolczynnikaC(rows),
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
  { klucz: 'c', etykieta: T.kolC, mono: true },
  { klucz: 'cZrodlo', etykieta: T.kolCZrodlo, wyrownanie: 'lewo', sortowalna: false },
  { klucz: 'werdykt', etykieta: T.kolWerdykt, wyrownanie: 'lewo', sortowalna: false },
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

/** Werdykt raportowalności wiersza — PL z backendu; brak etykiety → kreska, nigdy kod (#145). */
export function werdyktPL(row: ShortCircuitRow): string {
  return row.reporting_status_pl ?? T.kreska;
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
      c: komorka(row.c_factor, fmtWspolczynnik, dowodRef),
      cZrodlo: { wartosc: row.c_zrodlo?.trim() ? row.c_zrodlo : T.kreska },
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
  const { re, im } = rozpakujWartoscSladu(wartosc);
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
    // Kontrakt pól kroku (karta DOWOD-CIEPLNY): LaTeX WYŁĄCZNIE z `substitution_latex`;
    // `substitution` jest prozą i nie trafia do KaTeX-a.
    substitutionLatex:
      typeof krok.substitution_latex === 'string' ? krok.substitution_latex : null,
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

/**
 * Opis zespołu uziemiającego z ZAINSTALOWANYCH elementów punktu neutralnego (dane modelu,
 * bez wyprowadzania wariantu pracy): uziemienie bezpośrednie, dławik gaszący (z rezystorem
 * wymuszającym AWSC), rezystor uziemiający; zespół bez elementu — nazwany brak.
 */
function opisZespolu(zespol: ZespolUziemiajacy): string {
  const elementy: string[] = [];
  if (zespol.uziemienie_bezposrednie) elementy.push(T.zespolBezposrednie);
  if (zespol.dlawik) elementy.push(zespol.dlawik.awsc ? T.zespolDlawikAwsc : T.zespolDlawik);
  if (zespol.rezystor) elementy.push(T.zespolRezystor);
  return elementy.length > 0 ? elementy.join(' ‖ ') : T.zespolBezElementu;
}

function wpisZespolu(zespol: ZespolUziemiajacy): UziemienieWpis {
  return {
    element: zespol.name || zespol.ref_id,
    strona: T.uziemienieZespol,
    opis: opisZespolu(zespol),
    rOhm: zespol.rezystor?.r_ohm ?? null,
    xOhm: null,
  };
}

function zespolySieci(snapshot: EnergyNetworkModel): ZespolUziemiajacy[] {
  return [...(snapshot.zespoly_uziemiajace ?? [])].sort((a, b) => a.ref_id.localeCompare(b.ref_id));
}

/**
 * Uziemienie punktu neutralnego NA SZYNIE wybranego punktu (dopasowanie po ref_id/element_id
 * szyny): zespół uziemiający na tej szynie (sieć SN, karta UX-04/POLE-ZU), a bez niego
 * opis punktu neutralnego sieci 110 kV za granicą modelu (`Source.neutral_grounding` źródła
 * na tej szynie). Uziemienie sieci SN z innej szyny tej samej sieci (sekcje sprzęgnięte)
 * pokazuje lista sieci niżej i dane przyjęte wiersza zwarcia z backendu.
 */
export function uziemieniePunktu(
  snapshot: EnergyNetworkModel | null,
  elementId: string | null,
): UziemienieWpis | null {
  if (!snapshot || !elementId) return null;
  const szyna = snapshot.buses.find((bus) => bus.ref_id === elementId || bus.id === elementId);
  if (!szyna) return null;
  const zespol = zespolySieci(snapshot).find((z) => z.bus_ref === szyna.ref_id);
  if (zespol) return wpisZespolu(zespol);
  const zrodlo = snapshot.sources.find((s) => s.bus_ref === szyna.ref_id && s.neutral_grounding);
  if (!zrodlo?.neutral_grounding) return null;
  return wpisUziemienia(zrodlo.name || zrodlo.ref_id, T.uziemienieZrodlo, zrodlo.neutral_grounding);
}

/**
 * Wszystkie jawne konfiguracje punktu neutralnego w zamrożonej wersji układu: źródła
 * z `neutral_grounding` (sieć 110 kV za granicą modelu), zespoły uziemiające sieci SN oraz
 * strony GN/DN transformatorów. Pusta lista = model bez jawnego uziemienia (uczciwy
 * komunikat z akcją naprawczą).
 */
export function uziemieniaSieci(snapshot: EnergyNetworkModel | null): UziemienieWpis[] {
  if (!snapshot) return [];
  const wpisy: UziemienieWpis[] = [];
  for (const zrodlo of snapshot.sources) {
    if (zrodlo.neutral_grounding) {
      wpisy.push(wpisUziemienia(zrodlo.name || zrodlo.ref_id, T.uziemienieZrodlo, zrodlo.neutral_grounding));
    }
  }
  for (const zespol of zespolySieci(snapshot)) wpisy.push(wpisZespolu(zespol));
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

// ---------------------------------------------------------------------------
// Doziemienie sieci SN wg sposobu pracy punktu neutralnego (karta UX-04, warunek
// odbioru 2026-10-29) — WYŁĄCZNIE formatowanie liczb backendu (solver
// `doziemienie_sn`); żadnej wielkości UI nie wylicza.
// ---------------------------------------------------------------------------

export interface WartoscDoziemienia {
  readonly klucz: string;
  readonly etykieta: string;
  readonly wartosc: string;
}

export interface WidokDoziemienia {
  readonly naglowek: string;
  readonly wartosci: readonly WartoscDoziemienia[];
  readonly wzorLatex: string;
  readonly opisUziemienia: string | null;
  readonly podstawa: string;
  readonly zastrzezenia: readonly string[];
  readonly brak: string | null;
  readonly podwojne: string | null;
  readonly danePrzyjete: readonly { nazwa: string; wartosc: string | null; powod: string }[];
  readonly niepelny: boolean;
}

function fmtA(n: number | null): string | null {
  return n == null ? null : `${fmtLiczba(n, 2)} ${T.jednA}`;
}

function fmtV(n: number | null): string | null {
  return n == null ? null : `${fmtLiczba(n, 0)} ${T.jednV}`;
}

/** Wiersz zwarcia jednofazowego (token backendu „1F"; dopuszczalny prefiks „SC_"). */
export function jestZwarciemJednofazowym(row: ShortCircuitRow | null): boolean {
  return (row?.fault_type ?? '').trim().toUpperCase().replace(/^SC_/, '') === '1F';
}

/** Widok doziemienia sieci SN wiersza; `null`, gdy wiersz go nie niesie (nie 1F / nie SN). */
export function doziemienieWiersza(row: ShortCircuitRow | null): WidokDoziemienia | null {
  const d: DoziemienieSieci | null | undefined = row?.doziemienie_sieci;
  if (!d) return null;
  const kandydaci: [string, string, string | null][] = [
    ['prad', `${T.doziemieniePrad} (${d.charakter_pl})`, fmtA(d.prad_a)],
    ['i_c', T.doziemienieIC, fmtA(d.i_c_a)],
    ['i_l', T.doziemienieIL, fmtA(d.i_l_a)],
    ['i_w', T.doziemienieIW, fmtA(d.i_w_a)],
    ['v', T.doziemienieV, d.rozstrojenie == null ? null : fmtLiczba(d.rozstrojenie, 4)],
    ['u_f', T.doziemienieUF, fmtV(d.u_f_v)],
    ['u0', T.doziemienieU0, fmtV(d.u0_v)],
    ['u_b', T.doziemienieUB, fmtV(d.u_faza_b_v)],
    ['u_c', T.doziemienieUC, fmtV(d.u_faza_c_v)],
    ['k', T.doziemienieK, d.wspolczynnik_k == null ? null : fmtKappa(d.wspolczynnik_k)],
    ['z_f', T.doziemienieZF, d.z_f_ohm ? `${fmtZespolona(d.z_f_ohm)} ${T.jednOhm}` : null],
  ];
  return {
    naglowek: `${d.tryb_pl} — ${d.charakter_pl}`,
    wartosci: kandydaci
      .filter((k): k is [string, string, string] => k[2] !== null)
      .map(([klucz, etykieta, wartosc]) => ({ klucz, etykieta, wartosc })),
    wzorLatex: d.wzor_latex,
    opisUziemienia: d.opis_uziemienia_pl ?? null,
    podstawa: d.podstawa_pl,
    zastrzezenia: d.zastrzezenia_pl,
    brak: d.brak_pl,
    podwojne: d.podwojne_doziemienie_pl,
    danePrzyjete: (d.dane_przyjete ?? []).map((dana) => ({
      nazwa: dana.nazwa_pl,
      // Ten sam zapis liczb co karta werdyktu (pl-PL, 4 cyfry znaczące) — nie surowy zapis JS.
      wartosc: dana.wartosc ? wielkoscPl(dana.wartosc) : null,
      powod: dana.powod_pl,
    })),
    niepelny: d.kompletnosc_dowodu === 'NIEPELNY',
  };
}
