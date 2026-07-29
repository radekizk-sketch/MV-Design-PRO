/*
 * Publiczny interfejs okna „Estymacja stanu (WLS)" (ui2/wyniki/estymacja) —
 * estymacja stanu metodą ważonych najmniejszych kwadratów na gotowym przebiegu
 * rozpływu i pomiarach telemetrycznych, na wspólnym wzorcu ekranu analizy.
 *
 * UWAGA: nazwy generyczne, które istnieją już w innych modułach re-eksportowanych
 * przez nadrzędny barrel `ui2/wyniki/index.ts` (`export *`), NIE są re-eksportowane
 * stąd, aby uniknąć kolizji nazw (TS2308): formatery (`fmt*`, `parsujLiczbaPL`) oraz
 * nazwy wspólne z `odbior` (`WIERSZ_EDYTORA_DOMYSLNY`, `zbudujZadanie`, `wierszPusty`,
 * `WierszEdytora`, `WynikBudowy`, `WejscieBudowy`, `PomiarWejscie`). Konsumenci
 * wewnątrz modułu importują je wprost z `./model` / `./strings` / `./api`.
 */

export { EkranEstymacji } from './EkranEstymacji';
export type { EkranEstymacjiProps } from './EkranEstymacji';

export {
  przebiegRozplywuEstymacji,
  KOLUMNY_WEZLY,
  KLUCZ_WIERSZA_WEZLY,
  KOLUMNY_POMIARY,
  KLUCZ_WIERSZA_POMIARY,
  ALFA_DOMYSLNA,
  PROG_LNR_DOMYSLNY,
  typPomiaruPL,
  wymagaWezlaJ,
  kluczPomiaru,
  mapujWierszWezla,
  mapujWierszPomiaru,
  naWierszeWezlow,
  naWierszePomiarow,
  naZalozeniaEstymacji,
} from './model';

export {
  ESTYMACJA_STRINGS,
  ZNACZNIK_SYNTETYCZNY,
  istotnoscZbieznosci,
} from './strings';
export type { IstotnoscStanu } from './strings';

export { fetchWymaganiaEstymacji, postEstymacjaStanu } from './api';
export type {
  KontekstEstymacji,
  TypPomiaru,
  MetaTypuPomiaru,
  WezelWymagan,
  WymaganiaEstymacji,
  EstymacjaZadanie,
  WezelStanu,
  RezyduumPomiaru,
  PodejrzanyPomiar,
  RaportZlychDanych,
  BrakDanych,
  KrokSladu,
  WidokEstymacji,
} from './api';
