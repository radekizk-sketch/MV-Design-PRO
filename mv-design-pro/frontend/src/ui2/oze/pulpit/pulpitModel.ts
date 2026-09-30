/*
 * Model danych + czyste adaptery pulpitu instalacji OZE (karta P47; kontrakt V2 — karta
 * AB-1a Pakiet D2 §6).
 *
 * WARSTWA PREZENTACJI (NOT-A-SOLVER): zero fizyki, zero ocen własnych, zero agregatów.
 * Adaptery zestawiają ISTNIEJĄCE dane:
 *   - opisy modułów modelu (`opisyModulow` z macierzy — REUŻYCIE, bez duplikacji),
 *   - wynik modułu (klasyfikacja, dowód certyfikatu, powód odrzucenia tabliczki albo jawny
 *     brak) i rekordy wymagań WYŁĄCZNIE z oceny zatwierdzonego modelu przypadku
 *     (`ZgodnoscPrzypadkuNcRfg` — ta sama trasa co certyfikat; dane modułów i dowód
 *     wyprowadza serwer z modelu) — bez statusu modułu i bez liczników,
 *   - dane magazynu (BESS) wyłącznie z realnego kształtu `StationDerConnection`.
 *
 * Zasada uczciwości: oceny niewczytanej nie udaje się — jawny stan; moduł pominięty przez
 * serwer niesie powód z serwera (o objęciu modułu oceną rozstrzyga WYŁĄCZNIE most modelu —
 * klient nie powtarza jego reguły brak mocy / napięcia); brak realnych danych magazynu →
 * sekcja pominięta (nie atrapa). Determinizm: kolejność modułów = kolejność `opisyModulow`
 * (sort po id).
 */

import type {
  ConnectionSide,
  DerCatalogSelections,
  DerKindUnified,
  StationDerConnection,
} from '../../../ui/network-build/station-der';
import type { ExecutionRun } from '../../../ui/study-cases/types';
import type { RekordKonwertera, WidokAdekwatnosciQ, WidokSilySieci } from '../api';
import { ocenaWymaganModulu, wynikModulu, type OpisModuluModelu } from '../macierz';
import type {
  CertyfikatOdrzucony,
  OcenaWymaganModulu,
  WynikModuluNcRfg,
  ZgodnoscPrzypadkuNcRfg,
} from '../ncrfg/typy';

// =============================================================================
// Typy warstwy prezentacji
// =============================================================================

/**
 * Pozycja modułu pulpitu (lista i karta): dane z modelu oraz — po wczytaniu oceny modelu —
 * wynik modułu (klasyfikacja, technologia, źródło danych, dowód certyfikatu albo jawny brak),
 * powód odrzucenia tabliczki, rekordy wymagań profilu albo powód pominięcia przez serwer.
 * Bez statusu modułu i bez liczników (kontrakt V2 ich nie ma).
 */
export interface PozycjaModulu {
  readonly derRef: string;
  readonly nazwa: string;
  readonly rodzaj: DerKindUnified;
  /** Wynik modułu z oceny modelu; `null` bez oceny albo dla modułu spoza oceny. */
  readonly wynik: WynikModuluNcRfg | null;
  /** Rekordy wymagań profilu (`ocena_wymagan`); `null` bez wyniku modułu. */
  readonly ocena: OcenaWymaganModulu | null;
  /** Powód odrzucenia tabliczki certyfikatu przez serwer (`certyfikaty_odrzucone`). */
  readonly odrzucony: CertyfikatOdrzucony | null;
  /** Powód pominięcia modułu przez serwer (`pominiete[].powod_pl`) albo `null`. */
  readonly pominietyPowodPl: string | null;
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

/**
 * Pozycje modułów projektu: opis z warsztatu wytwórców + wynik modułu, rekordy wymagań,
 * odrzucenie tabliczki i pominięcie — WYŁĄCZNIE z oceny zatwierdzonego modelu (serwer jest
 * jedynym autorytetem: moduł, który serwer ocenił, pokazuje wynik także wtedy, gdy warsztat
 * nie zna jego mocy albo napięcia).
 */
export function zbudujPozycje(
  opisy: readonly OpisModuluModelu[],
  zgodnosc: ZgodnoscPrzypadkuNcRfg | null,
): PozycjaModulu[] {
  const bieg = zgodnosc?.bieg ?? null;
  return opisy.map((opis) => {
    const wynikPozycji = wynikModulu(bieg, opis.derRef);
    return {
      derRef: opis.derRef,
      nazwa: opis.nazwa,
      rodzaj: opis.rodzaj,
      wynik: wynikPozycji,
      ocena: wynikPozycji ? ocenaWymaganModulu(bieg, opis.derRef) : null,
      odrzucony:
        zgodnosc?.certyfikaty_odrzucone.find((o) => o.der_ref === opis.derRef) ?? null,
      pominietyPowodPl: zgodnosc?.pominiete.find((d) => d.der_ref === opis.derRef)?.powod_pl ?? null,
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
  { klucz: 'battery_catalog_ref', etykieta: 'Bateria magazynu' },
  { klucz: 'block_transformer_catalog_ref', etykieta: 'Transformator dedykowany' },
  { klucz: 'protection_catalog_ref', etykieta: 'Zabezpieczenie' },
  { klucz: 'dynamic_model_ref', etykieta: 'Model dynamiczny' },
];

/**
 * Polska nazwa pola, po którym dopasowano rekord magazynu (karta #145: klucz pola
 * `battery_catalog_ref`/`device_catalog_ref` nie trafia na ekran). Mapa typowana
 * unią pola dopasowania — nowe pole nie skompiluje się bez nazwy.
 */
const ETYKIETA_POLA_DOPASOWANIA: Readonly<Record<'battery_catalog_ref' | 'device_catalog_ref', string>> = {
  battery_catalog_ref: 'Bateria magazynu',
  device_catalog_ref: 'Urządzenie wytwórcze',
};

export function etykietaOdnosnika(klucz: 'battery_catalog_ref' | 'device_catalog_ref'): string {
  return ETYKIETA_POLA_DOPASOWANIA[klucz];
}

/** Sekcja 1: dane modułu read-only (rodzaj, moc, napięcie, strona, odnośniki). */
export function daneModulu(opis: OpisModuluModelu, der: StationDerConnection): DaneModulu {
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

/**
 * Węzeł przyłączenia modułu w widoku siły sieci (P47b). Skanuje wiersze węzłów
 * i zwraca `bus_ref` wiersza, którego lista modułów (`modules[]`, dodana w §2.1)
 * zawiera moduł o referencji `derRef`. Brak dopasowania → `null` (uczciwie —
 * moduł bez węzła w wynikach analizy). Bez zgadywania: dopasowanie po pełnej
 * równości referencji.
 */
export function busRefModuluSily(widok: WidokSilySieci, derRef: string): string | null {
  for (const wpis of widok.entries) {
    if (wpis.modules.some((modul) => modul.ref === derRef)) return wpis.bus_ref;
  }
  return null;
}

/**
 * Węzeł przyłączenia modułu w widoku adekwatności Q (P47b). Reużywa ISTNIEJĄCEGO
 * pola `bus_ref` źródeł (`source_q_actuals`, D13) — nie wymaga nowego pola. Zwraca
 * `bus_ref` źródła o referencji `derRef`; brak źródła lub źródło bez węzła → `null`.
 */
export function busRefModuluQ(widok: WidokAdekwatnosciQ, derRef: string): string | null {
  const zrodlo = widok.sources.find((s) => s.ref === derRef);
  return zrodlo ? zrodlo.bus_ref : null;
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
