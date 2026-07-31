/**
 * Klient czterech kryteriów wyposażenia stacji (karta KD-3).
 *
 * Końcówki: `POST /api/solver/{ct-burden-check,vt-burden-check,
 * cable-thermal-aging,transformer-losses}` → `backend/src/api/equipment_checks.py`
 * → solwery `network_model/solvers/equipment_checks/**`.
 *
 * ZERO FIZYKI W PREZENTACJI. Ten moduł niczego nie liczy — wysyła dane obwodu
 * (albo temperaturę / współczynnik obciążenia) i ODBIERA gotowe wielkości wraz ze
 * śladem WHITE BOX, założeniami i kodami gotowości. Wielkości znamionowe
 * pochodzą wyłącznie z katalogu po stronie backendu (`catalog_ref`), więc UI nie
 * ma nawet możliwości ich podstawić.
 *
 * Kształt odpowiedzi jest SPRAWDZANY, nie zakładany (precedens V12K-262:
 * rzutowanie `as` przepuszczało każdą odpowiedź, a pierwszy odczyt pola wywracał
 * ekran).
 */

/** Werdykt kryterium. `UNAVAILABLE` = brak podstawy do oceny (patrz kody). */
export type WerdyktKryterium = 'PASS' | 'FAIL' | 'UNAVAILABLE';

/** Krok śladu WHITE BOX (kanon pięciu pól). */
export interface KrokSladu {
  readonly step: number;
  readonly key: string;
  readonly title: string;
  readonly formula_latex: string;
  readonly inputs: Record<string, unknown>;
  readonly substitution: string;
  readonly result: Record<string, unknown>;
  readonly notes: string;
}

export interface ObciazenieAparatu {
  readonly nazwa: string;
  readonly moc_va: number;
}

export interface BilansCtOdpowiedz {
  readonly status: WerdyktKryterium;
  readonly status_obciazenia: WerdyktKryterium;
  readonly status_nasycenia: WerdyktKryterium;
  readonly rezystancja_przewodow_ohm: number | null;
  readonly moc_przewodow_va: number | null;
  readonly moc_aparatow_va: number | null;
  readonly moc_obliczeniowa_va: number | null;
  readonly moc_wewnetrzna_va: number | null;
  readonly wykorzystanie_mocy: number | null;
  readonly alf_efektywny: number | null;
  readonly zapas_alf: number | null;
  readonly wariant_alf: string | null;
  readonly readiness_codes: readonly string[];
  readonly formula_ref: string;
  readonly assumptions: readonly string[];
  readonly white_box_trace: readonly KrokSladu[];
  readonly pozycja_katalogowa: string;
  readonly klasa_dokladnosci: string | null;
  readonly moc_znamionowa_va: number | null;
  readonly prad_wtorny_znamionowy_a: number | null;
}

export interface BilansVtOdpowiedz {
  readonly status: WerdyktKryterium;
  readonly status_obciazenia: WerdyktKryterium;
  readonly status_spadku: WerdyktKryterium;
  readonly rezystancja_przewodow_ohm: number | null;
  readonly moc_aparatow_va: number | null;
  readonly moc_obliczeniowa_va: number | null;
  readonly wykorzystanie_mocy: number | null;
  readonly prad_obwodu_a: number | null;
  readonly delta_u_v: number | null;
  readonly delta_u_procent: number | null;
  readonly limit_delta_u_procent: number | null;
  readonly kategoria_uzwojenia: string | null;
  readonly readiness_codes: readonly string[];
  readonly formula_ref: string;
  readonly assumptions: readonly string[];
  readonly white_box_trace: readonly KrokSladu[];
  readonly pozycja_katalogowa: string;
  readonly klasa_dokladnosci: string | null;
  readonly moc_znamionowa_va: number | null;
  readonly napiecie_wtorne_v: number | null;
}

export interface StarzenieKablaOdpowiedz {
  readonly status: WerdyktKryterium;
  readonly roznica_temperatur_c: number | null;
  readonly wspolczynnik_starzenia: number | null;
  readonly wzgledna_zywotnosc: number | null;
  readonly temperatura_znamionowa_c: number | null;
  readonly typ_izolacji: string | null;
  readonly readiness_codes: readonly string[];
  readonly formula_ref: string;
  readonly assumptions: readonly string[];
  readonly white_box_trace: readonly KrokSladu[];
  readonly pozycja_katalogowa: string;
}

export interface StratyTransformatoraOdpowiedz {
  readonly status: WerdyktKryterium;
  readonly straty_jalowe_kw: number | null;
  readonly straty_obciazeniowe_kw: number | null;
  readonly straty_calkowite_kw: number | null;
  readonly beta: number | null;
  readonly beta_optymalny: number | null;
  readonly straty_przy_beta_opt_kw: number | null;
  readonly moc_obciazenia_mva: number | null;
  readonly udzial_strat_jalowych: number | null;
  readonly readiness_codes: readonly string[];
  readonly formula_ref: string;
  readonly assumptions: readonly string[];
  readonly white_box_trace: readonly KrokSladu[];
  readonly pozycja_katalogowa: string;
  readonly moc_znamionowa_mva: number | null;
}

const WERDYKTY: readonly string[] = ['PASS', 'FAIL', 'UNAVAILABLE'];

function maKsztaltWyniku(dane: unknown): dane is { status: WerdyktKryterium } {
  if (typeof dane !== 'object' || dane === null || Array.isArray(dane)) return false;
  const d = dane as Record<string, unknown>;
  return (
    typeof d.status === 'string'
    && WERDYKTY.includes(d.status)
    && typeof d.formula_ref === 'string'
    && Array.isArray(d.readiness_codes)
    && Array.isArray(d.assumptions)
    && Array.isArray(d.white_box_trace)
  );
}

async function wyslij<T>(
  sciezka: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const odpowiedz = await fetch(sciezka, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  if (!odpowiedz.ok) {
    throw new Error(`Nie udało się policzyć kryterium (HTTP ${odpowiedz.status}).`);
  }
  const dane: unknown = await odpowiedz.json();
  if (!maKsztaltWyniku(dane)) {
    throw new Error('Wynik kryterium ma nieoczekiwany kształt — sprawdź wersję API.');
  }
  return dane as T;
}

/** Bilans mocy wtórnej i nasycenie przekładnika prądowego (IEC 61869-2). */
export function pobierzBilansCt(
  zadanie: {
    ct_catalog_ref: string;
    dlugosc_przewodu_m?: number | null;
    przekroj_przewodu_mm2?: number | null;
    obciazenia_aparatow?: readonly ObciazenieAparatu[];
    alf_wymagany?: number | null;
  },
  signal?: AbortSignal,
): Promise<BilansCtOdpowiedz> {
  return wyslij<BilansCtOdpowiedz>('/api/solver/ct-burden-check', { ...zadanie }, signal);
}

/** Bilans mocy wtórnej i zmiana napięcia obwodu przekładnika napięciowego. */
export function pobierzBilansVt(
  zadanie: {
    vt_catalog_ref: string;
    uzwojenie?: 'POMIAROWE' | 'ZABEZPIECZENIOWE';
    dlugosc_przewodu_m?: number | null;
    przekroj_przewodu_mm2?: number | null;
    obciazenia_aparatow?: readonly ObciazenieAparatu[];
  },
  signal?: AbortSignal,
): Promise<BilansVtOdpowiedz> {
  return wyslij<BilansVtOdpowiedz>('/api/solver/vt-burden-check', { ...zadanie }, signal);
}

/** Względne starzenie izolacji kabla (reguła Montsingera). */
export function pobierzStarzenieKabla(
  zadanie: { cable_catalog_ref: string; temperatura_pracy_c?: number | null },
  signal?: AbortSignal,
): Promise<StarzenieKablaOdpowiedz> {
  return wyslij<StarzenieKablaOdpowiedz>('/api/solver/cable-thermal-aging', { ...zadanie }, signal);
}

/** Straty transformatora i optymalny współczynnik obciążenia. */
export function pobierzStratyTransformatora(
  zadanie: { transformer_catalog_ref: string; beta?: number | null },
  signal?: AbortSignal,
): Promise<StratyTransformatoraOdpowiedz> {
  return wyslij<StratyTransformatoraOdpowiedz>(
    '/api/solver/transformer-losses',
    { ...zadanie },
    signal,
  );
}
