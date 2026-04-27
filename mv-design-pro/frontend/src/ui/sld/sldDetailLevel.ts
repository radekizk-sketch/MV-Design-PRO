/**
 * SLD Detail Levels (LOD) — V12 § 5.7
 *
 * Cel: deterministyczne, zoom-zależne sterowanie WIDOCZNOŚCIĄ symboli i etykiet
 * bez modyfikacji geometrii. Same pozycje (x, y) i routing pozostają niezmienne.
 *
 * Zasady:
 * - Czysta funkcja `getLodBand(zoom)` zwraca pasmo szczegółowości.
 * - Klasy widocznych typów elementów per pasmo są stałe (frozen).
 * - Brak heurystyk, brak progów uzależnionych od liczby elementów.
 * - Widoczność = filtr wizualny (display none / opacity), nie zmiana modelu.
 *
 * Pasma:
 * - PRZEGLAD       (zoom < 0.50): szkielet sieci — szyny, magistrale, GPZ, stacje, ZKSN
 * - GLOWNE_POLA    (0.50–0.99):   + odgałęzienia, NOP, słupy rozgałęźne, transformatory, źródła
 * - SZCZEGOLY      (1.00–1.49):   + łączniki, odbiory, pomiary
 * - PELNY          (≥ 1.50):      + zabezpieczenia, opisy techniczne, znaczniki uziemienia
 */

import type { ElementType } from '../types';

export type LodBand = 'PRZEGLAD' | 'GLOWNE_POLA' | 'SZCZEGOLY' | 'PELNY';

export const LOD_BAND_LABELS_PL: Readonly<Record<LodBand, string>> = Object.freeze({
  PRZEGLAD: 'Przegląd',
  GLOWNE_POLA: 'Główne pola',
  SZCZEGOLY: 'Szczegóły',
  PELNY: 'Pełny',
});

/**
 * Tabela pasm — frozen. Zmiana wymaga eksplicit edycji + nowych testów.
 */
export interface LodBandRange {
  band: LodBand;
  /** Dolny próg włącznie. */
  zoomMin: number;
  /** Górny próg wyłącznie (Infinity dla ostatniego). */
  zoomMaxExclusive: number;
}

export const LOD_BANDS: ReadonlyArray<LodBandRange> = Object.freeze([
  Object.freeze({ band: 'PRZEGLAD', zoomMin: 0, zoomMaxExclusive: 0.5 }),
  Object.freeze({ band: 'GLOWNE_POLA', zoomMin: 0.5, zoomMaxExclusive: 1.0 }),
  Object.freeze({ band: 'SZCZEGOLY', zoomMin: 1.0, zoomMaxExclusive: 1.5 }),
  Object.freeze({ band: 'PELNY', zoomMin: 1.5, zoomMaxExclusive: Infinity }),
]) as ReadonlyArray<LodBandRange>;

/**
 * Czysta funkcja: zoom → pasmo. Deterministyczna.
 */
export function getLodBand(zoom: number): LodBand {
  if (Number.isNaN(zoom) || zoom < 0) return 'PRZEGLAD';
  for (const range of LOD_BANDS) {
    if (zoom >= range.zoomMin && zoom < range.zoomMaxExclusive) {
      return range.band;
    }
  }
  return 'PELNY';
}

/**
 * Klasa szkieletowa elementu — semantyka topologii.
 *
 * SZKIELET     — niezbędne do oceny topologii (szyny, magistrale, GPZ, stacje).
 * GLOWNY       — pole/odgałęzienie/transformator/źródło — istotny operacyjnie.
 * SZCZEGOL     — łączniki, odbiory, pomiary, pomocnicze elementy.
 * OPIS         — uziemienia, ograniczniki, opisy.
 */
export type ElementImportance = 'SZKIELET' | 'GLOWNY' | 'SZCZEGOL' | 'OPIS';

const IMPORTANCE_BY_TYPE: Readonly<Record<ElementType, ElementImportance>> = Object.freeze({
  // Szkielet topologii SN
  Bus: 'SZKIELET',
  BusNN: 'SZKIELET',
  BusSectionNN: 'SZKIELET',
  BusCouplerNN: 'SZKIELET',
  AuxBus: 'SZKIELET',
  Source: 'SZKIELET',
  Station: 'SZKIELET',
  ZKSN: 'SZKIELET',
  BranchPole: 'SZKIELET',
  Terminal: 'SZKIELET',
  PortBranch: 'SZKIELET',
  LineBranch: 'SZKIELET',
  SecondaryLink: 'SZKIELET',
  NOP: 'SZKIELET',
  // Główne pola operacyjne
  TransformerBranch: 'GLOWNY',
  BaySN: 'GLOWNY',
  MainBreakerNN: 'GLOWNY',
  FeederNN: 'GLOWNY',
  SegmentNN: 'GLOWNY',
  SwitchboardNN: 'GLOWNY',
  SourceFieldNN: 'GLOWNY',
  PVInverter: 'GLOWNY',
  BESSInverter: 'GLOWNY',
  EnergyStorage: 'GLOWNY',
  Genset: 'GLOWNY',
  UPS: 'GLOWNY',
  Generator: 'GLOWNY',
  Load: 'GLOWNY',
  LoadNN: 'GLOWNY',
  ConnectionPoint: 'GLOWNY',
  // Szczegóły operacyjne
  Switch: 'SZCZEGOL',
  SwitchNN: 'SZCZEGOL',
  Relay: 'SZCZEGOL',
  ProtectionAssignment: 'SZCZEGOL',
  ProtectionNN: 'SZCZEGOL',
  Measurement: 'SZCZEGOL',
  MeasurementNN: 'SZCZEGOL',
  EnergyMeter: 'SZCZEGOL',
  PowerQualityMeter: 'SZCZEGOL',
  MeteringBlock: 'SZCZEGOL',
  CableJointNN: 'SZCZEGOL',
  InternalJunction: 'SZCZEGOL',
  ReserveLink: 'SZCZEGOL',
  TelecontrolDevice: 'SZCZEGOL',
  SourceController: 'SZCZEGOL',
  FaultCurrentLimiter: 'SZCZEGOL',
  FilterCompensator: 'SZCZEGOL',
  // Opisy / pomocnicze
  SurgeArresterNN: 'OPIS',
  Earthing: 'OPIS',
  SyncPoint: 'OPIS',
  SourceDisconnect: 'OPIS',
  PowerLimit: 'OPIS',
  WorkProfile: 'OPIS',
  OperatingMode: 'OPIS',
  ConnectionConstraints: 'OPIS',
  DescriptiveElement: 'OPIS',
});

export function getElementImportance(type: ElementType): ElementImportance {
  return IMPORTANCE_BY_TYPE[type] ?? 'SZCZEGOL';
}

/**
 * Zestaw klas widocznych w danym paśmie LOD. Kolejność = od szkieletu w górę.
 */
const LOD_VISIBLE_IMPORTANCE: Readonly<Record<LodBand, ReadonlySet<ElementImportance>>> =
  Object.freeze({
    PRZEGLAD: Object.freeze(new Set<ElementImportance>(['SZKIELET'])),
    GLOWNE_POLA: Object.freeze(new Set<ElementImportance>(['SZKIELET', 'GLOWNY'])),
    SZCZEGOLY: Object.freeze(new Set<ElementImportance>(['SZKIELET', 'GLOWNY', 'SZCZEGOL'])),
    PELNY: Object.freeze(
      new Set<ElementImportance>(['SZKIELET', 'GLOWNY', 'SZCZEGOL', 'OPIS']),
    ),
  });

export function isElementVisibleAtLod(type: ElementType, band: LodBand): boolean {
  return LOD_VISIBLE_IMPORTANCE[band].has(getElementImportance(type));
}

/**
 * Czy w danym paśmie LOD pokazujemy pełne etykiety techniczne.
 */
export function shouldShowTechnicalLabels(band: LodBand): boolean {
  return band === 'PELNY';
}

/**
 * Czy w danym paśmie LOD pokazujemy znaczniki stanu (otwarte/zamknięte, ZWARCIE itd.).
 */
export function shouldShowStateBadges(band: LodBand): boolean {
  return band === 'SZCZEGOLY' || band === 'PELNY';
}
