/*
 * Moduł procesu projektanta — kanoniczna oś etapów E1–E8 i reguła następnej
 * najlepszej akcji. Jedyne wejście publiczne dla przestrzeni powłoki; nikt nie
 * zakłada drugiego rejestru etapów ani drugiej reguły następnego kroku.
 */

export { ETAPY, ETAPY_IDS, etapPoId, pozycjaEtapu } from './etapy';
export type { EtapId, EtapProcesu } from './etapy';

export {
  porownajProblemy,
  wybierzBlokadeDoNaprawy,
  wyznaczNastepnaAkcje,
} from './nastepnaAkcja';
export type { NastepnaAkcja, RodzajNastepnejAkcji, SygnalyProcesu } from './nastepnaAkcja';

export {
  aktualnoscWynikow,
  czyJestZakonczonyPrzebieg,
  useNastepnaAkcja,
  useSygnalyProcesu,
} from './adapters/procesAdapter';

export { MapaProcesu } from './MapaProcesu';
export type { MapaProcesuProps } from './MapaProcesu';
export { PanelNastepnejAkcji } from './PanelNastepnejAkcji';
export type { PanelNastepnejAkcjiProps } from './PanelNastepnejAkcji';

export { PROCES_STRINGS } from './strings';
