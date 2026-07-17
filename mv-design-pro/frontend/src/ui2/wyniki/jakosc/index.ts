/*
 * Publiczny interfejs okna „Jakość wyników" (ui2/wyniki/jakosc, karta E8.4 /
 * W-607) — wiarygodność zwarciowa + walidacja energetyczna na wspólnym wzorcu
 * ekranu analizy.
 *
 * UWAGA: generyczne formatery (`fmtKA`, `fmtProcent`, …) NIE są re-eksportowane
 * stąd — te nazwy istnieją już w `ui2/wyniki/zwarcia`, a barrel nadrzędny
 * `ui2/wyniki/index.ts` robi `export *` z obu modułów (kolizja TS2308).
 */

export {
  EkranJakosci,
  SekcjaWiarygodnosci,
  SekcjaWalidacji,
  SekcjaMigotania,
} from './EkranJakosci';
export type { EkranJakosciProps } from './EkranJakosci';

export {
  przebiegZwarciowy,
  przebiegRozplywu,
  jestPrzebiegiemZwarciowym,
  kluczWalidacji,
  KOLUMNY_WIARYGODNOSCI,
  KLUCZ_WIARYGODNOSCI_WEZEL,
  KOLUMNY_WALIDACJI,
  KLUCZ_WALIDACJI_OBIEKT,
  KLUCZ_WIERSZA_WALIDACJI,
  KOLUMNY_MIGOTANIE,
  KLUCZ_WIERSZA_MIGOTANIE,
  mapujWierszWiarygodnosci,
  naWierszeWiarygodnosci,
  naZalozeniaWiarygodnosci,
  mapujWierszWalidacji,
  naWierszeWalidacji,
  naZalozeniaWalidacji,
  mapujWierszMigotania,
  naWierszeMigotania,
  naZalozeniaMigotania,
} from './jakoscModel';

export {
  JAKOSC_STRINGS,
  RODZAJ_KONTROLI_PL,
  STATUS_WALIDACJI_PL,
  STATUS_WIARYGODNOSCI,
  WERDYKT_MIGOTANIA,
  rodzajKontroliPL,
  statusWalidacjiPL,
  istotnoscWalidacji,
  istotnoscWiarygodnosci,
  istotnoscMigotania,
} from './strings';
export type { IstotnoscStatusu } from './strings';

export {
  fetchWiarygodnoscZwarciowa,
  fetchWalidacjaEnergetyczna,
  fetchMigotanie,
} from './api';
export type {
  KontekstJakosci,
  WiarygodnoscItem,
  WiarygodnoscSummary,
  WiarygodnoscResponse,
  RodzajKontroli,
  StatusWalidacji,
  WalidacjaItem,
  WalidacjaConfig,
  WalidacjaSummary,
  WalidacjaResponse,
  KrokMigotania,
  ModulMigotania,
  WezelMigotania,
  KonfiguracjaMigotania,
  PodsumowanieMigotania,
  MigotanieResponse,
} from './api';
