/*
 * Publiczny interfejs okna „Ranking punktów przyłączenia" (ui2/oze/ranking).
 * Warstwa prezentacji: wartości pochodzą wyłącznie z backendu (NOT-A-SOLVER); typ modułu
 * NC RfG z klasyfikacji backendu (`/api/ncrfg-tests/modul`). Nazwy adapterów
 * prefiksowane tematycznie (barrel OZE robi `export *` — prefiks zapobiega kolizji).
 * Uwaga: `wybierzPrzebiegRozplywu` NIE jest tu re-eksportowane (kolizja w barrelu OZE —
 * selektor pochodzi z `../zdolnosc/zdolnoscModel`).
 */

export { EkranRankingu } from './EkranRankingu';
export type { EkranRankinguProps } from './EkranRankingu';
export {
  KLUCZ_WIERSZA_RANKINGU,
  kolumnyRankingu,
  napieciaPrzyGranicy,
  przyrostStratKw,
  scenariuszGraniczny,
  wierszeRankingu,
  zapytanieKlasyfikacjiWezla,
} from './rankingModel';
export type { NapieciaGraniczne, OdczytKlasyfikacji } from './rankingModel';
export { RANKING_STRINGS } from './strings';
