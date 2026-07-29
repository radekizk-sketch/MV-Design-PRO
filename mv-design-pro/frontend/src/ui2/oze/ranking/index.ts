/*
 * Publiczny interfejs okna „Ranking punktów przyłączenia" (ui2/oze/ranking).
 * Warstwa prezentacji: wartości pochodzą wyłącznie z backendu (NOT-A-SOLVER); klasa
 * NC RfG to mapowanie słownikowe z progów katalogu operatora. Nazwy adapterów
 * prefiksowane tematycznie (barrel OZE robi `export *` — prefiks zapobiega kolizji).
 * Uwaga: `wybierzPrzebiegRozplywu` NIE jest tu re-eksportowane (kolizja w barrelu OZE —
 * selektor pochodzi z `../zdolnosc/zdolnoscModel`).
 */

export { EkranRankingu } from './EkranRankingu';
export type { EkranRankinguProps } from './EkranRankingu';
export {
  KLUCZ_WIERSZA_RANKINGU,
  klasaNcRfg,
  klasyOperatora,
  kolumnyRankingu,
  napieciaPrzyGranicy,
  przyrostStratKw,
  scenariuszGraniczny,
  wierszeRankingu,
} from './rankingModel';
export type { NapieciaGraniczne } from './rankingModel';
export { RANKING_STRINGS } from './strings';
