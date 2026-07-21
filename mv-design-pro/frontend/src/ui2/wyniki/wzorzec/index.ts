/*
 * Publiczny interfejs WSPÓLNEGO WZORCA EKRANU ANALIZY (ui2/wyniki/wzorzec,
 * karta E8.1). Fundament wszystkich okien wyników U3/U4 — reużywany przez
 * konkretne analizy (np. `ui2/wyniki/rozplyw`).
 */

export { EkranAnalizy } from './EkranAnalizy';
export { TabelaWynikow } from './TabelaWynikow';
export { SekcjaZalozen } from './SekcjaZalozen';
export { WZORZEC_STRINGS } from './strings';
export { usePoprawWModelu } from './usePoprawWModelu';
export type {
  EkranAnalizyProps,
  NaglowekAnalizy,
  WierszZalozenia,
  WartoscKomorki,
  DefinicjaKolumny,
  WierszTabeli,
  WyrownanieKolumny,
  KierunekSortowania,
  StanSortowania,
} from './wzorzecModel';
