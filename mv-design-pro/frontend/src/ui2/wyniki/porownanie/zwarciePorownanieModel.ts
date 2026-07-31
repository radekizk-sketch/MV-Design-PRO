/*
 * Model i CZYSTE adaptery trybu ZWARCIOWEGO okna „Porównanie przebiegów"
 * (karta E12.2). Read-only; zero fizyki, zero mutacji, zero wołań API/store'ów
 * w tym pliku (klient i store czytane w `TrybZwarciowy`).
 *
 * DELTY LICZY BACKEND (karta KD-3, pozycja 11 — dług V12K-290). Wcześniej ten
 * plik odejmował dwie wartości i dzielił je przez siebie, żeby pokazać procent —
 * czyli arytmetyka na wynikach solvera w warstwie prezentacji. Dokładnie ta sama
 * klasa, którą dla porównań ROZPŁYWU zamknęła luka L-13 (karta KD-2).
 *
 * Teraz źródłem jest `POST /api/short-circuit-comparisons`
 * (`backend/src/api/zwarcia_porownania.py` → `domain/zwarcia_porownanie.py`):
 * odpowiedź niesie wartości A i B ORAZ delty bezwzględne i względne per punkt,
 * a punkt bez odpowiednika ma jawny znacznik obecności (`obecny_w`). Tutaj
 * zostaje wyłącznie FORMATOWANIE: liczba → napis z jednostką, brak → kreska.
 */

import type { PunktPorownaniaZwarciowego } from './zwarciaPorownanieApi';
import type { ExecutionRun } from '../../../ui/study-cases/types';
import { ANALYSIS_TYPE_LABELS } from '../../../ui/study-cases/types';
import type { DefinicjaKolumny, WartoscKomorki, WierszTabeli } from '../wzorzec';
import { refDowoduPorownania } from './dowodPorownania';
import {
  ZWARCIA_POROWNANIE_STRINGS as SZ,
  fmtData,
  fmtDeltaKA,
  fmtDeltaKA2s,
  fmtDeltaMVA,
  fmtDeltaOhm,
  fmtDeltaProcent,
  fmtDeltaXR,
  fmtKA,
  fmtKA2s,
  fmtMVA,
  fmtOhm,
  fmtXR,
} from './strings';

// ---------------------------------------------------------------------------
// Kolumny tabeli punktów zwarciowych (A · B · Δ dla każdej wielkości)
// ---------------------------------------------------------------------------

export const KOLUMNY_PUNKTOW_ZWARCIOWYCH: DefinicjaKolumny[] = [
  { klucz: 'punkt', etykieta: SZ.kolPunkt, wyrownanie: 'lewo' },
  { klucz: 'ikssA', etykieta: SZ.kolIkssA, jednostka: SZ.jednKA, mono: true },
  { klucz: 'ikssB', etykieta: SZ.kolIkssB, jednostka: SZ.jednKA, mono: true },
  { klucz: 'ikssD', etykieta: SZ.kolIkssD, jednostka: SZ.jednKA, mono: true },
  { klucz: 'ipA', etykieta: SZ.kolIpA, jednostka: SZ.jednKA, mono: true },
  { klucz: 'ipB', etykieta: SZ.kolIpB, jednostka: SZ.jednKA, mono: true },
  { klucz: 'ipD', etykieta: SZ.kolIpD, jednostka: SZ.jednKA, mono: true },
  { klucz: 'ithA', etykieta: SZ.kolIthA, jednostka: SZ.jednKA, mono: true },
  { klucz: 'ithB', etykieta: SZ.kolIthB, jednostka: SZ.jednKA, mono: true },
  { klucz: 'ithD', etykieta: SZ.kolIthD, jednostka: SZ.jednKA, mono: true },
  { klucz: 'skA', etykieta: SZ.kolSkA, jednostka: SZ.jednMVA, mono: true },
  { klucz: 'skB', etykieta: SZ.kolSkB, jednostka: SZ.jednMVA, mono: true },
  { klucz: 'skD', etykieta: SZ.kolSkD, jednostka: SZ.jednMVA, mono: true },
  // Pełny bilans IEC 60909 (karta S-C, addytywnie): delty Rk/Xk/|Zk|/X/R/I²t
  // z pól kanonicznych wierszy (ZWARCIA-PRO F1) — tryb ekspercki; starsze
  // wyniki bez pól → uczciwe kreski.
  { klucz: 'rkA', etykieta: SZ.kolRkA, jednostka: SZ.jednOhm, mono: true, tylkoEkspercki: true },
  { klucz: 'rkB', etykieta: SZ.kolRkB, jednostka: SZ.jednOhm, mono: true, tylkoEkspercki: true },
  { klucz: 'rkD', etykieta: SZ.kolRkD, jednostka: SZ.jednOhm, mono: true, tylkoEkspercki: true },
  { klucz: 'xkA', etykieta: SZ.kolXkA, jednostka: SZ.jednOhm, mono: true, tylkoEkspercki: true },
  { klucz: 'xkB', etykieta: SZ.kolXkB, jednostka: SZ.jednOhm, mono: true, tylkoEkspercki: true },
  { klucz: 'xkD', etykieta: SZ.kolXkD, jednostka: SZ.jednOhm, mono: true, tylkoEkspercki: true },
  { klucz: 'zkA', etykieta: SZ.kolZkA, jednostka: SZ.jednOhm, mono: true, tylkoEkspercki: true },
  { klucz: 'zkB', etykieta: SZ.kolZkB, jednostka: SZ.jednOhm, mono: true, tylkoEkspercki: true },
  { klucz: 'zkD', etykieta: SZ.kolZkD, jednostka: SZ.jednOhm, mono: true, tylkoEkspercki: true },
  { klucz: 'xrA', etykieta: SZ.kolXrA, mono: true, tylkoEkspercki: true },
  { klucz: 'xrB', etykieta: SZ.kolXrB, mono: true, tylkoEkspercki: true },
  { klucz: 'xrD', etykieta: SZ.kolXrD, mono: true, tylkoEkspercki: true },
  { klucz: 'i2tA', etykieta: SZ.kolI2tA, jednostka: SZ.jednKA2s, mono: true, tylkoEkspercki: true },
  { klucz: 'i2tB', etykieta: SZ.kolI2tB, jednostka: SZ.jednKA2s, mono: true, tylkoEkspercki: true },
  { klucz: 'i2tD', etykieta: SZ.kolI2tD, jednostka: SZ.jednKA2s, mono: true, tylkoEkspercki: true },
];

// ---------------------------------------------------------------------------
// Selekcja przebiegów zwarciowych (runStore, filtr SC_*/DONE)
// ---------------------------------------------------------------------------

/** Czy przebieg jest zwarciowy (typ `SC_*`) i zakończony (status DONE). */
export function czyPrzebiegZwarciowy(run: ExecutionRun): boolean {
  return run.analysis_type.startsWith('SC_') && run.status === 'DONE';
}

/** Data przebiegu do etykiety: zakończenie, a przy braku — rozpoczęcie. */
function dataPrzebiegu(run: ExecutionRun): string | null {
  return run.finished_at ?? run.started_at;
}

/**
 * Zakończone przebiegi zwarciowe, najnowsze pierwsze (po dacie, remis → id).
 * Sortowanie deterministyczne (Determinism Rule), bez mutacji wejścia.
 */
export function przebiegiZwarciowe(runs: ExecutionRun[]): ExecutionRun[] {
  return runs
    .filter(czyPrzebiegZwarciowy)
    .slice()
    .sort((a, b) => {
      const da = dataPrzebiegu(a) ?? '';
      const db = dataPrzebiegu(b) ?? '';
      if (da !== db) return da < db ? 1 : -1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

/**
 * Polska etykieta przebiegu zwarciowego dla selektora A/B: rodzaj zwarcia + data
 * (+ nazwa przypadku, gdy znana ze store'u). Brak nazwy → etykieta bez niej
 * (zero zgadywania). Identyfikatory (id przypadku/przebiegu) WYŁĄCZNIE w trybie
 * eksperckim (MODEL_INTERAKCJI §2.7).
 */
export function etykietaPrzebieguZwarciowego(
  run: ExecutionRun,
  trybEkspercki: boolean,
  nazwaPrzypadku?: string | null,
): string {
  const czlony = [ANALYSIS_TYPE_LABELS[run.analysis_type], fmtData(dataPrzebiegu(run))];
  if (nazwaPrzypadku) czlony.push(nazwaPrzypadku);
  const podstawa = czlony.join(' · ');
  if (!trybEkspercki) return podstawa;
  return `${podstawa} · ${run.study_case_id} · ${run.id}`;
}

// ---------------------------------------------------------------------------
// Adapter czysty: punkty porównania Z BACKENDU → wiersze tabeli wzorca
// ---------------------------------------------------------------------------

interface Trojka {
  a: WartoscKomorki;
  b: WartoscKomorki;
  d: WartoscKomorki;
}

/**
 * Komórka wartości źródłowej lub „—" przy braku danej (pole nieobecne w
 * odpowiedzi). Wartość obecna dostaje `dowodRef` strony (R3-C: 2×klik → dowód
 * WŁAŚCIWEGO przebiegu, patrz `dowodPorownania.ts`); kreska nie ma wartości,
 * więc nie ma też dowodu (zero martwych klików).
 */
function komorka(
  wartosc: number | null | undefined,
  format: (n: number) => string,
  dowodRef: string,
): WartoscKomorki {
  return typeof wartosc !== 'number'
    ? { wartosc: SZ.kreska }
    : { wartosc: format(wartosc), sortKey: wartosc, dowodRef };
}

/**
 * Trójka A · B · Δ dla jednej wielkości. FORMATOWANIE, nie rachunek: delta
 * bezwzględna i względna przychodzą GOTOWE z backendu (`delta_*`,
 * `delta_*_percent`) — prezentacja nie odejmuje i nie dzieli. Brak pola w
 * odpowiedzi (punkt bez odpowiednika, A = 0, starszy wynik) daje kreskę.
 * Komórka Δ jest ZAWSZE bez `dowodRef` (R3-C): różnica nie ma pojedynczego
 * wywodu WHITE BOX — nie istnieje ślad „przebiegu Δ".
 */
function trio(
  va: number | null | undefined,
  vb: number | null | undefined,
  delta: number | null | undefined,
  deltaProcent: number | null | undefined,
  format: (n: number) => string,
  formatDelty: (n: number) => string,
  refA: string,
  refB: string,
): Trojka {
  const a = komorka(va, format, refA);
  const b = komorka(vb, format, refB);
  if (typeof delta !== 'number') {
    return { a, b, d: { wartosc: SZ.kreska } };
  }
  const procent = typeof deltaProcent === 'number' ? deltaProcent : null;
  return { a, b, d: { wartosc: `${formatDelty(delta)}${fmtDeltaProcent(procent)}`, sortKey: delta } };
}

/**
 * Buduje wiersze tabeli wzorca z punktów porównania zwróconych przez backend.
 * Kolejność wierszy pochodzi z odpowiedzi (backend sortuje deterministycznie).
 * Punkt obecny tylko po jednej stronie ma znacznik `obecny_w` i dostaje sufiks
 * „(tylko A)"/„(tylko B)" oraz puste Δ — uczciwe oznaczenie (karta §2.2).
 */
export function naWierszePunktowZwarciowych(
  punkty: readonly PunktPorownaniaZwarciowego[],
): WierszTabeli[] {
  return punkty.map((p) => {
    const sufiks = p.obecny_w === 'A' ? SZ.tylkoA : p.obecny_w === 'B' ? SZ.tylkoB : '';
    const refA = refDowoduPorownania('A', p.target_id);
    const refB = refDowoduPorownania('B', p.target_id);

    const ikss = trio(
      p.ikss_ka_a,
      p.ikss_ka_b,
      p.delta_ikss_ka,
      p.delta_ikss_percent,
      fmtKA,
      fmtDeltaKA,
      refA,
      refB,
    );
    const ip = trio(
      p.ip_ka_a,
      p.ip_ka_b,
      p.delta_ip_ka,
      p.delta_ip_percent,
      fmtKA,
      fmtDeltaKA,
      refA,
      refB,
    );
    const ith = trio(
      p.ith_ka_a,
      p.ith_ka_b,
      p.delta_ith_ka,
      p.delta_ith_percent,
      fmtKA,
      fmtDeltaKA,
      refA,
      refB,
    );
    const sk = trio(
      p.sk_mva_a,
      p.sk_mva_b,
      p.delta_sk_mva,
      p.delta_sk_percent,
      fmtMVA,
      fmtDeltaMVA,
      refA,
      refB,
    );
    // Pełny bilans IEC 60909 (karta S-C) — tryb ekspercki; starszy wynik bez
    // pól nie ma ich też w odpowiedzi porównania → uczciwa kreska bez Δ.
    const rk = trio(
      p.rk_ohm_a,
      p.rk_ohm_b,
      p.delta_rk_ohm,
      p.delta_rk_percent,
      fmtOhm,
      fmtDeltaOhm,
      refA,
      refB,
    );
    const xk = trio(
      p.xk_ohm_a,
      p.xk_ohm_b,
      p.delta_xk_ohm,
      p.delta_xk_percent,
      fmtOhm,
      fmtDeltaOhm,
      refA,
      refB,
    );
    const zk = trio(
      p.zk_ohm_a,
      p.zk_ohm_b,
      p.delta_zk_ohm,
      p.delta_zk_percent,
      fmtOhm,
      fmtDeltaOhm,
      refA,
      refB,
    );
    const xr = trio(
      p.xr_ratio_a,
      p.xr_ratio_b,
      p.delta_xr_ratio,
      p.delta_xr_percent,
      fmtXR,
      fmtDeltaXR,
      refA,
      refB,
    );
    const i2t = trio(
      p.i2t_ka2s_a,
      p.i2t_ka2s_b,
      p.delta_i2t_ka2s,
      p.delta_i2t_percent,
      fmtKA2s,
      fmtDeltaKA2s,
      refA,
      refB,
    );

    return {
      punkt: { wartosc: `${p.target_name}${sufiks}` },
      ikssA: ikss.a,
      ikssB: ikss.b,
      ikssD: ikss.d,
      ipA: ip.a,
      ipB: ip.b,
      ipD: ip.d,
      ithA: ith.a,
      ithB: ith.b,
      ithD: ith.d,
      skA: sk.a,
      skB: sk.b,
      skD: sk.d,
      rkA: rk.a,
      rkB: rk.b,
      rkD: rk.d,
      xkA: xk.a,
      xkB: xk.b,
      xkD: xk.d,
      zkA: zk.a,
      zkB: zk.b,
      zkD: zk.d,
      xrA: xr.a,
      xrB: xr.b,
      xrD: xr.d,
      i2tA: i2t.a,
      i2tB: i2t.b,
      i2tD: i2t.d,
    };
  });
}
