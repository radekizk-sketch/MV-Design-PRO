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
