import type { LodBand } from './sldDetailLevel';

export type SldLodLevel =
  | 'LOD-0'
  | 'LOD-1'
  | 'LOD-2'
  | 'LOD-3'
  | 'LOD-4'
  | 'LOD-5'
  | 'LOD-6'
  | 'LOD-7';

export interface SldLodDefinition {
  level: SldLodLevel;
  labelPl: string;
  purposePl: string;
  zoomMin: number;
  zoomMaxExclusive: number;
}

export interface SldLodContext {
  zoom: number;
  hasActiveResults?: boolean;
  auditActive?: boolean;
  hasCriticalIssues?: boolean;
  focusedObject?: boolean;
  density?: 'niska' | 'standardowa' | 'wysoka';
}

export const SLD_LOD_DEFINITIONS: ReadonlyArray<SldLodDefinition> = Object.freeze([
  Object.freeze({
    level: 'LOD-0',
    labelPl: 'Widok systemowy',
    purposePl: 'Cała sieć, magistrale i agregaty topologiczne.',
    zoomMin: 0,
    zoomMaxExclusive: 0.15,
  }),
  Object.freeze({
    level: 'LOD-1',
    labelPl: 'Widok magistral i pierścieni',
    purposePl: 'GPZ, magistrale, stacje, ZKSN i punkty normalnie otwarte.',
    zoomMin: 0.15,
    zoomMaxExclusive: 0.30,
  }),
  Object.freeze({
    level: 'LOD-2',
    labelPl: 'Widok projektowy sieci SN',
    purposePl: 'Odcinki, stacje, ZKSN, słupy i długości torów SN.',
    zoomMin: 0.30,
    zoomMaxExclusive: 0.55,
  }),
  Object.freeze({
    level: 'LOD-3',
    labelPl: 'Widok pól i aparatów podstawowych',
    purposePl: 'Pola SN i aparaty podstawowe bez pełnej aparatury pomocniczej.',
    zoomMin: 0.55,
    zoomMaxExclusive: 0.90,
  }),
  Object.freeze({
    level: 'LOD-4',
    labelPl: 'Widok aparaturowy',
    purposePl: 'Pełna aparatura pól i stacji SN/nN.',
    zoomMin: 0.90,
    zoomMaxExclusive: 1.40,
  }),
  Object.freeze({
    level: 'LOD-5',
    labelPl: 'Widok zabezpieczeń i automatyki',
    purposePl: 'Funkcje zabezpieczeń, automatyka i nastawy.',
    zoomMin: 1.40,
    zoomMaxExclusive: 2.20,
  }),
  Object.freeze({
    level: 'LOD-6',
    labelPl: 'Widok wynikowy',
    purposePl: "Ik'', P/Q/I/U, wyniki i statusy jakości.",
    zoomMin: 2.20,
    zoomMaxExclusive: Infinity,
  }),
  Object.freeze({
    level: 'LOD-7',
    labelPl: 'Widok audytowy',
    purposePl: 'Jakość danych, uzasadnienia, migawki i raportowość.',
    zoomMin: 2.20,
    zoomMaxExclusive: Infinity,
  }),
]);

export function getSldLodLevel(context: SldLodContext): SldLodLevel {
  if (context.auditActive) return 'LOD-7';
  if (context.hasActiveResults) return 'LOD-6';
  if (context.hasCriticalIssues || context.focusedObject) {
    const base = getSldLodLevel({ zoom: context.zoom });
    if (base === 'LOD-0') return 'LOD-1';
    if (base === 'LOD-1') return 'LOD-2';
    return base;
  }

  const zoom = Number.isFinite(context.zoom) && context.zoom > 0 ? context.zoom : 0;
  for (const definition of SLD_LOD_DEFINITIONS) {
    if (definition.level === 'LOD-6' || definition.level === 'LOD-7') continue;
    if (zoom >= definition.zoomMin && zoom < definition.zoomMaxExclusive) {
      return definition.level;
    }
  }
  return 'LOD-5';
}

export function mapSldLodToLegacyBand(level: SldLodLevel): LodBand {
  switch (level) {
    case 'LOD-0':
    case 'LOD-1':
      return 'PRZEGLAD';
    case 'LOD-2':
    case 'LOD-3':
      return 'GLOWNE_POLA';
    case 'LOD-4':
      return 'SZCZEGOLY';
    case 'LOD-5':
    case 'LOD-6':
    case 'LOD-7':
      return 'PELNY';
  }
}

export function shouldRenderFullApparatus(level: SldLodLevel): boolean {
  return level === 'LOD-4'
    || level === 'LOD-5'
    || level === 'LOD-6'
    || level === 'LOD-7';
}
