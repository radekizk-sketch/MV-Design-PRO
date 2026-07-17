/*
 * Publiczny interfejs okna „Zgodność powykonawcza" (ui2/wyniki/odbior, karta U4
 * P45) — porównanie pomiarów z obiektu z wynikiem rozpływu i jawnymi tolerancjami
 * na wspólnym wzorcu ekranu analizy.
 *
 * UWAGA: generyczne formatery (`fmtProcent`, `fmtWartosc`, `parsujLiczbaPL`, …)
 * NIE są re-eksportowane stąd — te nazwy istnieją już w `ui2/wyniki/zwarcia`,
 * a barrel nadrzędny `ui2/wyniki/index.ts` robi `export *` z obu modułów
 * (kolizja TS2308). Konsumenci wewnątrz modułu importują je wprost z `./strings`.
 */

export { EkranOdbioru } from './EkranOdbioru';
export type { EkranOdbioruProps } from './EkranOdbioru';

export {
  KOLUMNY_ZGODNOSCI,
  KLUCZ_WIERSZA_ZGODNOSCI,
  WIERSZ_EDYTORA_DOMYSLNY,
  kluczWierszaZgodnosci,
  wierszPusty,
  mapujWierszZgodnosci,
  naWierszeZgodnosci,
  naZalozeniaZgodnosci,
  zbudujZadanie,
} from './odbiorModel';
export type { TrybWejscia, WierszEdytora, WynikBudowy, WejscieBudowy } from './odbiorModel';

export {
  ODBIOR_STRINGS,
  WERDYKT_ZGODNOSCI,
  WIELKOSC_PL,
  JEDNOSTKA_WIELKOSCI,
  istotnoscWerdyktu,
  wielkoscPL,
} from './strings';
export type { IstotnoscWerdyktu } from './strings';

export { postZgodnoscPowykonawcza } from './api';
export type {
  WielkoscPomiaru,
  PomiarWejscie,
  TolerancjeWejscie,
  ZgodnoscZadanie,
  WierszZgodnosci,
  PodsumowanieZgodnosci,
  TolerancjeZgodnosci,
  WidokZgodnosci,
} from './api';
