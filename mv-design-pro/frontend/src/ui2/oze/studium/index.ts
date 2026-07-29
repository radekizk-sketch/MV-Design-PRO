/*
 * Publiczny interfejs kreatora studium przyłączenia (ui2/oze/studium, karta P35).
 * Warstwa PREZENTACJI: orkiestracja wyłącznie istniejących końcówek OZE, zero
 * fizyki i zero ocen lokalnych (NOT-A-SOLVER). Nazwy adapterów/typów sufiksowane
 * „Studium", bo barrel OZE robi `export *` — sufiks zapobiega kolizji nazw (TS2308).
 */

export { KreatorStudium } from './KreatorStudium';
export type { KreatorStudiumProps } from './KreatorStudium';
export {
  FAZY_STUDIUM,
  KLUCZ_WIERSZA_STUDIUM,
  domyslnyKonwerter,
  kindKataloguDlaRodzaju,
  kolumnyStudium,
  konwerteryRodzaju,
  opcjeRodzajuStudium,
  pasmoQwPunkcie,
  przeprowadzStudium,
  pustyWariantStudium,
  stanPoczatkowyStudium,
  wariantWToku,
  werdyktPokryciaPL,
  wezelWariantu,
  wierszStudium,
  wierszeStudium,
  wierzcholekNajblizszy,
  zastosujZdarzenieStudium,
} from './studiumModel';
export type {
  FazaStudium,
  KlientStudium,
  KontekstWierszaStudium,
  OpcjaRodzajuStudium,
  ParametryStudium,
  RodzajZrodlaStudium,
  StanFazyStudium,
  StanStudium,
  StatusFazyStudium,
  WynikWariantuStudium,
  ZdarzenieStudium,
} from './studiumModel';
export { STUDIUM_STRINGS, nazwaPlikuDokumentuStudium } from './strings';
