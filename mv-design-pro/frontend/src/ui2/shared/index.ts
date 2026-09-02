/** Barrel `ui2/shared` — prymitywy generyczne dzielone przez wiele modułów ui2. */
export { EdytowalnaTabela } from './EdytowalnaTabela';
export type { EdytowalnaTabelaProps } from './EdytowalnaTabela';
export type {
  KolumnaEdytowalna,
  EdytorKomorki,
  OpcjaWyboruTabeli,
  StanZapisuKomorki,
  StanSortowaniaTabeli,
} from './edytowalnaTabelaModel';
export { posortujWiersze, kluczSortKolumny, obliczOknoWirtualizacji } from './edytowalnaTabelaModel';
