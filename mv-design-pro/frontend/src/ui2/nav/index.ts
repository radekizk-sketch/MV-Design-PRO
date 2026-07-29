/*
 * Publiczne API modułu `ui2/nav` (karta E1.2). Integracja z powłoką
 * (AppShell) to osobna karta zarządcy — tu wyłącznie eksport czystego
 * komponentu i adapterów.
 */

export { ContextTree, type ContextTreeProps } from './ContextTree';

export {
  LICZNIKI_ZERO,
  TRYBY_DRZEWA_TOPOLOGII,
  licznikiLaczne,
  splaszczWidoczne,
  widocznyWTrybie,
  type AkcjaPusty,
  type IkonaWezla,
  type LicznikiWezla,
  type TrybDrzewaTopologii,
  type TrybMin,
  type WezelDrzewa,
  type WidocznyWiersz,
  type ZrodloZaznaczenia,
} from './treeModel';

export { filtrujProblemy, filtrujTryb, zastosujFiltry } from './treeFilters';

export { NAV_STRINGS, licznikTitle, trybDrzewaLabel } from './strings';

export {
  mapowanieTopologiiDoDrzewa,
  useTopologyTree,
} from './adapters/topologyTreeAdapter';

export {
  mapowaniePrzypadkowDoDrzewa,
  useCasesTree,
} from './adapters/casesTreeAdapter';

export {
  mapowaniePrzebiegowDoDrzewa,
  useRunsTree,
} from './adapters/runsTreeAdapter';
