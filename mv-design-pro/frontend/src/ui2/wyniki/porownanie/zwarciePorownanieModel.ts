/*
 * Model i CZYSTE adaptery trybu ZWARCIOWEGO okna „Porównanie przebiegów"
 * (karta E12.2). Read-only; zero fizyki, zero mutacji, zero wołań API/store'ów
 * w tym pliku (klient i store czytane w `TrybZwarciowy`).
 *
 * ROZSTRZYGNIĘCIE RECON (karta §2.1 — ścieżka danych delt) — plik:linia:
 *   Backend ma DWIE ścieżki porównań, ale ŻADNA nie daje PEŁNYCH delt zwarciowych
 *   per punkt zgodnych z wymaganiami karty (per węzeł + uczciwe oznaczenie punktów
 *   bez odpowiednika):
 *   1. `api/comparison.py` → `application/comparison/service.py:_compare_short_circuit`
 *      (136-176): zwraca POJEDYNCZĄ, ZAGREGOWANĄ deltę SC (jeden ikss/ip/ith/sk
 *      z jednego payloadu na przebieg) — NIE per węzeł. Odrzucone.
 *   2. `api/batch_execution.py` → `ScComparisonService` → `domain/sc_comparison.py`
 *      `build_comparison` (216-249): liczy delty per element (`deltas_by_source`),
 *      ALE punkty bez odpowiednika w drugim przebiegu są CICHO POMIJANE
 *      (linie 224-227: `if base_er is None or other_er is None: continue`) —
 *      kontrakt nie niesie żadnego znacznika osieroconego punktu, więc karta §2.2
 *      („wiersze bez odpowiednika … uczciwie oznaczone") nie może być spełniona.
 *      Odrzucone jako niepełne.
 *   WNIOSEK (karta §2.1, klauzula STOP): korzystamy z DOPUSZCZONEJ prezentacyjnej
 *   różnicy dwóch wartości JUŻ zwróconych przez backend dla tych samych punktów.
 *   Źródło A i B to per-punktowe wyniki zwarciowe każdego przebiegu
 *   (`ShortCircuitRow`: `ui/results-inspector/types.ts` — ikss_ka, ip_ka,
 *   ith_ka, sk_mva oraz addytywny pełny bilans F1: rk/xk/zk_ohm, xr_ratio,
 *   i2t_ka2s — karta S-C, tryb ekspercki; endpoint
 *   `/analysis-runs/{runId}/results/short-circuit`, `ui/results-inspector/api.ts:107`).
 *   Delta B−A liczona WYŁĄCZNIE do prezentacji w `trio()` — jedyne dozwolone
 *   działanie liczbowe w UI (No-Physics), opisane komentarzem. Punkty bez
 *   odpowiednika: sufiks „(tylko A)"/„(tylko B)", brak Δ. Starsze wyniki bez pól
 *   bilansu → uczciwe kreski.
 */

import type { ShortCircuitRow } from '../../../ui/results-inspector/types';
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
// Adapter czysty: dwa zestawy wyników per punkt → wiersze tabeli wzorca
// ---------------------------------------------------------------------------

interface Trojka {
  a: WartoscKomorki;
  b: WartoscKomorki;
  d: WartoscKomorki;
}

/**
 * Komórka wartości źródłowej lub „—" przy braku danej (null w kontrakcie).
 * Wartość obecna dostaje `dowodRef` strony (R3-C: 2×klik → dowód WŁAŚCIWEGO
 * przebiegu, patrz `dowodPorownania.ts`); kreska nie ma wartości, więc nie ma
 * też dowodu (zero martwych klików).
 */
function komorka(
  wartosc: number | null,
  format: (n: number) => string,
  dowodRef: string,
): WartoscKomorki {
  return wartosc === null
    ? { wartosc: SZ.kreska }
    : { wartosc: format(wartosc), sortKey: wartosc, dowodRef };
}

/**
 * Trójka A · B · Δ dla jednej wielkości. Delta B−A liczona TU jest JEDYNYM
 * dozwolonym działaniem liczbowym w UI (karta E12.2 §2.1 — prezentacyjna różnica
 * dwóch wartości już zwróconych przez backend). Gdy brakuje którejkolwiek strony
 * (punkt bez odpowiednika lub null w kontrakcie) — Δ pozostaje „—" (bez zgadywania).
 * Komórka Δ jest ZAWSZE bez `dowodRef` (R3-C): różnica nie ma pojedynczego
 * wywodu WHITE BOX — nie istnieje ślad „przebiegu Δ".
 */
function trio(
  va: number | null,
  vb: number | null,
  format: (n: number) => string,
  formatDelty: (n: number) => string,
  refA: string,
  refB: string,
): Trojka {
  const a = komorka(va, format, refA);
  const b = komorka(vb, format, refB);
  if (va === null || vb === null) {
    return { a, b, d: { wartosc: SZ.kreska } };
  }
  const abs = vb - va;
  const pct = va !== 0 ? (abs / va) * 100 : null;
  return { a, b, d: { wartosc: `${formatDelty(abs)}${fmtDeltaProcent(pct)}`, sortKey: abs } };
}

/**
 * Łączy per-punktowe wyniki dwóch przebiegów (A, B) po `target_id` i buduje
 * wiersze tabeli wzorca. Kolejność wierszy: unia identyfikatorów posortowana
 * rosnąco (deterministycznie). Punkt obecny tylko w jednym przebiegu dostaje
 * sufiks „(tylko A)"/„(tylko B)" i puste Δ — uczciwe oznaczenie (karta §2.2).
 */
export function naWierszePunktowZwarciowych(
  rowsA: ShortCircuitRow[],
  rowsB: ShortCircuitRow[],
): WierszTabeli[] {
  const mapaA = new Map(rowsA.map((r) => [r.target_id, r]));
  const mapaB = new Map(rowsB.map((r) => [r.target_id, r]));
  const klucze = Array.from(new Set([...mapaA.keys(), ...mapaB.keys()])).sort();

  return klucze.map((k) => {
    const ra = mapaA.get(k) ?? null;
    const rb = mapaB.get(k) ?? null;
    const nazwa = ra?.target_name ?? rb?.target_name ?? k;
    const sufiks = ra && !rb ? SZ.tylkoA : !ra && rb ? SZ.tylkoB : '';
    const refA = refDowoduPorownania('A', k);
    const refB = refDowoduPorownania('B', k);

    const ikss = trio(ra?.ikss_ka ?? null, rb?.ikss_ka ?? null, fmtKA, fmtDeltaKA, refA, refB);
    const ip = trio(ra?.ip_ka ?? null, rb?.ip_ka ?? null, fmtKA, fmtDeltaKA, refA, refB);
    const ith = trio(ra?.ith_ka ?? null, rb?.ith_ka ?? null, fmtKA, fmtDeltaKA, refA, refB);
    const sk = trio(ra?.sk_mva ?? null, rb?.sk_mva ?? null, fmtMVA, fmtDeltaMVA, refA, refB);
    // Pełny bilans IEC 60909 (karta S-C): pola addytywne wierszy kanonicznych
    // (ZWARCIA-PRO F1); starszy wynik bez pól → null → uczciwa kreska bez Δ.
    const rk = trio(ra?.rk_ohm ?? null, rb?.rk_ohm ?? null, fmtOhm, fmtDeltaOhm, refA, refB);
    const xk = trio(ra?.xk_ohm ?? null, rb?.xk_ohm ?? null, fmtOhm, fmtDeltaOhm, refA, refB);
    const zk = trio(ra?.zk_ohm ?? null, rb?.zk_ohm ?? null, fmtOhm, fmtDeltaOhm, refA, refB);
    const xr = trio(ra?.xr_ratio ?? null, rb?.xr_ratio ?? null, fmtXR, fmtDeltaXR, refA, refB);
    const i2t = trio(
      ra?.i2t_ka2s ?? null,
      rb?.i2t_ka2s ?? null,
      fmtKA2s,
      fmtDeltaKA2s,
      refA,
      refB,
    );

    return {
      punkt: { wartosc: `${nazwa}${sufiks}` },
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
