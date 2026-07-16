/*
 * Model danych + czyste adaptery pulpitu instalacji OZE (karta P47).
 *
 * WARSTWA PREZENTACJI (NOT-A-SOLVER): zero fizyki, zero ocen własnych. Adaptery
 * agregują ISTNIEJĄCE dane:
 *   - opisy modułów z P39 (`zbudujModuly` — REUŻYCIE, bez duplikacji),
 *   - werdykty i klasa modułu WYŁĄCZNIE z `NcRfgRunResult` (backend),
 *   - dane magazynu (BESS) wyłącznie z realnego kształtu `StationDerConnection`.
 *
 * Zasada uczciwości: brak biegu → stan „testy nieprzeprowadzone" (nie „brak
 * danych"); brak realnych danych magazynu → sekcja pominięta (nie atrapa).
 * Determinizm: kolejność modułów = kolejność `zbudujModuly` (sort po id).
 */

import type {
  NcRfgModuleResult,
  NcRfgRunResult,
  NcRfgTestResult,
} from '../../../ui/ncrfg-tests/api';
import type {
  ConnectionSide,
  DerCatalogSelections,
  DerKindUnified,
  StationDerConnection,
} from '../../../ui/network-build/station-der';
import type { ExecutionRun } from '../../../ui/study-cases/types';
import type { RekordKonwertera } from '../api';
import { podsumowanieModulu, type OpisModulu } from '../macierz';

// =============================================================================
// Typy warstwy prezentacji
// =============================================================================

/** Status modułu na liście pulpitu (jawne rozróżnienie „przed biegiem"). */
export type StatusPulpitu = 'nieprzeprowadzone' | 'zgodny' | 'niezgodny' | 'brak_danych';

/** Pozycja lewej listy modułów pulpitu. */
export interface PozycjaModulu {
  readonly derRef: string;
  readonly nazwa: string;
  readonly rodzaj: DerKindUnified;
  /** Czy dla tego modułu istnieje wynik biegu. */
  readonly przeprowadzono: boolean;
  /** Klasa modułu z odpowiedzi backendu (`module_type`); null przed biegiem. */
  readonly klasa: string | null;
  readonly status: StatusPulpitu;
  readonly passCount: number;
  readonly requiredCount: number;
  /** Moduł zablokowany brakiem danych wejściowych (poza biegiem). */
  readonly zablokowany: boolean;
}

/** Odnośnik katalogowy modułu (etykieta PL + wartość-identyfikator). */
export interface OdnosnikKatalogowy {
  readonly etykieta: string;
  readonly wartosc: string;
}

/** Dane modułu (sekcja 1 — read-only z modelu/katalogu). */
export interface DaneModulu {
  readonly rodzaj: DerKindUnified;
  readonly mocKw: number | null;
  readonly napiecieKv: number | null;
  readonly stronaPrzylaczenia: ConnectionSide;
  readonly odnosniki: readonly OdnosnikKatalogowy[];
}

/** Zgodność NC RfG modułu (sekcja 2). */
export interface ZgodnoscModulu {
  readonly przeprowadzono: boolean;
  readonly klasa: string | null;
  readonly status: StatusPulpitu;
  readonly passCount: number;
  readonly requiredCount: number;
  /** Testy niespełnione (werdykt `fail`) — z akcjami naprawczymi backendu. */
  readonly niespelnione: readonly NcRfgTestResult[];
}

/** Praca magazynu (sekcja 3 — tylko BESS, tylko gdy dane realnie istnieją). */
export interface PracaMagazynu {
  /** Katalog baterii (`battery_catalog_ref`) — identyfikator, tryb ekspercki. */
  readonly bateriaRef: string | null;
  /** Tryby pracy magazynu (`bess_operation_mode_refs`). */
  readonly trybyPracy: readonly string[];
}

/**
 * Dopasowanie magazynu (BESS) do rekordu katalogu konwerterów. `dopasowanoPo`
 * mówi, które pole referencji modułu (`battery_catalog_ref`/`device_catalog_ref`)
 * dokładnie zgadza się z `id` rekordu — bez heurystyk, bez dopasowania częściowego.
 */
export interface DopasowanieMagazynu {
  readonly rekord: RekordKonwertera;
  readonly dopasowanoPo: 'battery_catalog_ref' | 'device_catalog_ref';
}

// =============================================================================
// Adaptery
// =============================================================================

function wynikModulu(wynik: NcRfgRunResult | null, derRef: string): NcRfgModuleResult | null {
  if (!wynik) return null;
  return wynik.modules.find((m) => m.der_ref === derRef) ?? null;
}

/** Status listy: przed biegiem „nieprzeprowadzone", zablokowany „brak danych". */
function statusPozycji(
  opis: OpisModulu,
  wynik: NcRfgModuleResult | null,
): StatusPulpitu {
  if (opis.powodBlokady !== null) return 'brak_danych';
  if (!wynik) return 'nieprzeprowadzone';
  return wynik.overall_status;
}

/** Lista modułów projektu (lewa kolumna): klasa + status zgodności po biegu. */
export function zbudujPozycje(
  opisy: readonly OpisModulu[],
  wynik: NcRfgRunResult | null,
): PozycjaModulu[] {
  return opisy.map((opis) => {
    const w = opis.powodBlokady !== null ? null : wynikModulu(wynik, opis.derRef);
    const p = podsumowanieModulu(opis, wynik);
    return {
      derRef: opis.derRef,
      nazwa: opis.nazwa,
      rodzaj: opis.rodzaj,
      przeprowadzono: w !== null,
      klasa: w?.module_type ?? null,
      status: statusPozycji(opis, w),
      passCount: p.passCount,
      requiredCount: p.requiredCount,
      zablokowany: opis.powodBlokady !== null,
    };
  });
}

/** Kolejność i etykiety odnośników katalogowych obecnych na module. */
const ODNOSNIKI_KOLEJNOSC: readonly {
  readonly klucz: keyof DerCatalogSelections;
  readonly etykieta: string;
}[] = [
  { klucz: 'device_catalog_ref', etykieta: 'Urządzenie wytwórcze' },
  { klucz: 'ptpiree_certificate_ref', etykieta: 'Certyfikat PTPiREE' },
  { klucz: 'controller_catalog_ref', etykieta: 'Regulator instalacji' },
  { klucz: 'battery_catalog_ref', etykieta: 'Bateria magazynu' },
  { klucz: 'transformer_catalog_ref', etykieta: 'Transformator dedykowany' },
  { klucz: 'cable_catalog_ref', etykieta: 'Kabel wewnętrzny' },
  { klucz: 'protection_catalog_ref', etykieta: 'Zabezpieczenie' },
  { klucz: 'dynamic_model_ref', etykieta: 'Model dynamiczny' },
];

/** Sekcja 1: dane modułu read-only (rodzaj, moc, napięcie, strona, odnośniki). */
export function daneModulu(opis: OpisModulu, der: StationDerConnection): DaneModulu {
  const odnosniki: OdnosnikKatalogowy[] = [];
  for (const { klucz, etykieta } of ODNOSNIKI_KOLEJNOSC) {
    const wartosc = der.catalogs[klucz];
    if (wartosc) odnosniki.push({ etykieta, wartosc });
  }
  return {
    rodzaj: opis.rodzaj,
    mocKw: opis.mocKw,
    napiecieKv: opis.napiecieKv,
    stronaPrzylaczenia: der.connection_side,
    odnosniki,
  };
}

/** Sekcja 2: zgodność NC RfG (X/Y, klasa, testy niespełnione z akcjami). */
export function zgodnoscModulu(
  opis: OpisModulu,
  wynik: NcRfgRunResult | null,
): ZgodnoscModulu {
  const w = opis.powodBlokady !== null ? null : wynikModulu(wynik, opis.derRef);
  const p = podsumowanieModulu(opis, wynik);
  return {
    przeprowadzono: w !== null,
    klasa: w?.module_type ?? null,
    status: statusPozycji(opis, w),
    passCount: p.passCount,
    requiredCount: p.requiredCount,
    niespelnione: w ? w.tests.filter((t) => t.verdict === 'fail') : [],
  };
}

/**
 * Sekcja 3: praca magazynu — WYŁĄCZNIE dla BESS i tylko gdy dane realnie
 * istnieją w `StationDerConnection`. Kształt danych magazynu w modelu ogranicza
 * się do katalogu baterii i trybów pracy (brak jawnego pola pojemności/energii);
 * jeśli żadna z tych danych nie jest ustawiona → `null` (sekcja pominięta).
 */
export function pracaMagazynu(der: StationDerConnection): PracaMagazynu | null {
  if (der.der_kind !== 'BESS') return null;
  const bateriaRef = der.catalogs.battery_catalog_ref;
  const trybyPracy = der.profiles.bess_operation_mode_refs;
  if (!bateriaRef && trybyPracy.length === 0) return null;
  return { bateriaRef, trybyPracy };
}

/**
 * Sekcja 3 (P47a): dokładne dopasowanie magazynu (BESS) do rekordu katalogu
 * konwerterów. Sprawdzamy kolejno `battery_catalog_ref`, potem
 * `device_catalog_ref` — pierwszy, którego wartość jest identyczna z `id`
 * rekordu, wygrywa. Zwraca `null` gdy DER nie jest magazynem albo żadna
 * referencja nie ma odpowiednika (uczciwy stan „pozycja nieodnaleziona").
 *
 * Format referencji: `device_catalog_ref` magazynu przyjmuje identyfikatory
 * konwerterów backendu (np. `conv-bess-nn-1mw-0p4kv`), zgodne z `item_id`
 * rekordów katalogu — dlatego dopasowanie jest po pełnej równości, bez zgadywania.
 */
export function dopasujMagazyn(
  der: StationDerConnection,
  rekordy: readonly RekordKonwertera[],
): DopasowanieMagazynu | null {
  if (der.der_kind !== 'BESS') return null;
  const kandydaci: readonly ('battery_catalog_ref' | 'device_catalog_ref')[] = [
    'battery_catalog_ref',
    'device_catalog_ref',
  ];
  for (const pole of kandydaci) {
    const ref = der.catalogs[pole];
    if (!ref) continue;
    const rekord = rekordy.find((r) => r.id === ref);
    if (rekord) return { rekord, dopasowanoPo: pole };
  }
  return null;
}

/**
 * Wskazanie przebiegu zwarciowego dla siły sieci (SCR/WSCR): aktywny przebieg,
 * jeśli jest zakończonym zwarciem (`SC_*`/`DONE`), w przeciwnym razie ostatni
 * zakończony przebieg zwarciowy z listy. Brak → `null` (bez automatyzmu).
 */
export function wybierzPrzebiegZwarciowy(
  runs: readonly ExecutionRun[],
  activeRunId: string | null,
): string | null {
  return wybierzPrzebieg(runs, activeRunId, (r) => r.analysis_type.startsWith('SC_'));
}

/**
 * Wskazanie przebiegu rozpływu mocy dla adekwatności Q: aktywny przebieg, jeśli
 * jest zakończonym rozpływem (`LOAD_FLOW`/`DONE`), w przeciwnym razie ostatni
 * zakończony rozpływ z listy. Brak → `null`.
 */
export function wybierzPrzebiegRozplywu(
  runs: readonly ExecutionRun[],
  activeRunId: string | null,
): string | null {
  return wybierzPrzebieg(runs, activeRunId, (r) => r.analysis_type === 'LOAD_FLOW');
}

function wybierzPrzebieg(
  runs: readonly ExecutionRun[],
  activeRunId: string | null,
  pasuje: (run: ExecutionRun) => boolean,
): string | null {
  const zakonczone = runs.filter((r) => r.status === 'DONE' && pasuje(r));
  if (zakonczone.length === 0) return null;
  const aktywny = zakonczone.find((r) => r.id === activeRunId);
  if (aktywny) return aktywny.id;
  return zakonczone[zakonczone.length - 1].id;
}
