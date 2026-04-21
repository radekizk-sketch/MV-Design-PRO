/**
 * engine/index.ts — Eksporty silnika SLD.
 *
 * ARCHITEKTURA:
 *   Krok 1: adapterSemantyczny (Snapshot → SiecSld)
 *   Krok 2: polaEfektywne (jawne + niejawne)
 *   Krok 3: sortowanieAntykrzyzowaniowe
 *   Krok 4-7: geometriaSzyny (busbar + pola + aparatura + porty)
 *   Krok 8: trasowanieOrtogonalne (Manhattan routing)
 *   Krok 9: rendererSld (SVG)
 *   Pipeline: pipelineSld (orkiestrator)
 */

// Kontrakty
export type {
  Punkt2D,
  Prostokat,
  ObiektSld,
  PoleSld,
  ElementAparatury,
  PolaczenieSld,
  SiecSld,
  PortSld,
  GeometriaSzyny,
  GeometriaPola,
  GeometriaObiektu,
  PunktLamania,
  TrasaPolaczenia,
  WynikUkladuSld,
} from './sldContracts';

export {
  TypObiektuSld,
  TypPola,
  KierunekPola,
  TypAparatu,
  TypPolaczenia,
  RolaPortu,
  ETYKIETY_TYPY_OBIEKTOW,
  ETYKIETY_TYPY_POL,
  ETYKIETY_APARATY,
} from './sldContracts';

// Pipeline
export { uruchomPipelineSld, uruchomPipelineZSieci } from './pipelineSld';
export type { DaneWejsciowe, ObiektWejsciowy, PolaWejsciowe, PolaczenieWejsciowe } from './pipelineSld';

// Renderer
export { RendererSld } from './rendererSld';
export type { RendererSldProps } from './rendererSld';

// Sieci kontrolne
export {
  siecProstaMagistrala,
  siecZOdgalezieniem,
  siecPierscienZNop,
  siecZGeneracjaOze,
  siecStacjaSekcyjna,
} from './sieciKontrolne';
