/**
 * Framework kreatorów ui2 — barrel. Wspólna rama, pola i komponenty stanu dla
 * wszystkich kreatorów budowy sieci. Import: `../rama` z modułu kreatora.
 */

export { KreatorRama, KreatorSekcja, KreatorInfo, KreatorSiatka } from './KreatorRama';
export type { KreatorRamaProps, KreatorSekcjaProps, AkcjaKreatora } from './KreatorRama';

export {
  PoleTekstowe,
  PoleLiczbowe,
  PoleWyboru,
  PolePrzelacznik,
  PolePrzelacznikBinarny,
  PoleKatalogu,
} from './pola';
export type {
  PoleTekstoweProps,
  PoleLiczboweProps,
  PoleWyboruProps,
  PolePrzelacznikProps,
  PolePrzelacznikBinarnyProps,
  PoleKataloguProps,
} from './pola';

export {
  RzadWartosci,
  KreatorPodsumowanie,
  KreatorGotowosc,
  KreatorNastepnyKrok,
} from './gotowosc';
export type {
  RzadWartosciProps,
  KreatorPodsumowanieProps,
  KreatorGotowoscProps,
  KreatorNastepnyKrokProps,
} from './gotowosc';

export { PanelTeorii, PANEL_TEORII_WYMOG_PREFIX } from './panelTeorii';
export type { PanelTeoriiProps } from './panelTeorii';

export { TekstZWzorami } from './tekstZWzorami';
export type { TekstZWzoramiProps } from './tekstZWzorami';

export { VBW, VBH, PAD, PLW, PLH, px, py, RamkaWykresu } from './wykresPomoc';

export {
  useSelekcjaPoOperacji,
  useSelekcjaPoOperacjiBezNawigacji,
  mapujTypElementu,
  refZOperacji,
  kanonicznyRefZOperacji,
} from './selekcjaPoOperacji';
export type { SelekcjaFallback } from './selekcjaPoOperacji';

export { bladPola } from './model';
export type {
  OpcjaWyboru,
  StanGotowosci,
  WierszGotowosci,
  BladPola,
  StatusPobrania,
  KrokKreatora,
} from './model';
