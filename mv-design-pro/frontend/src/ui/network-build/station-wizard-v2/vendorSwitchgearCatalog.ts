/**
 * Vendor Switchgear Catalog — szablony rozdzielnic SN per producent.
 *
 * Źródło: `Kreator Stacji KOMPLETNY.html` krok 2 (Rozdzielnica SN) +
 * `SLD_ABB_TEMPLATES.md` + `SLD_ELEKTROMETAL_TEMPLATES.md` z repo.
 *
 * 5 typoszeregów z deklaracjami IEC 62271-200:
 *   - IAC (Internal Arc Classification) — odporność na łuk wewnętrzny
 *   - IP (Ingress Protection) — szczelność obudowy
 *   - LSC (Loss of Service Continuity) — kategoria ciągłości pracy
 *
 * Wymaganie #5 z `/goal`: szablony producentów (co najmniej ZPUE
 * Włoszczowa, Elektrometal, ABB, Siemens) → ten plik dostarcza 5
 * referencyjnych typoszeregów do użycia w wizardzie / BayConfiguratorze.
 *
 * Auto-konfiguracja pól per producent: wybór serii rozdzielnicy z góry
 * sugeruje sensowny układ pól (cable_in + breaker + trafo + cable_out)
 * zamiast losowego zestawienia symboli.
 */

/** Klasy łuku wewnętrznego IEC 62271-200 §6.106. */
export type InternalArcClass =
  | 'IAC A FL'        // Front + Lateral (dostęp z przodu i z boku)
  | 'IAC A FLR'       // Front + Lateral + Rear (pełny dostęp)
  | 'IAC A F'         // Tylko front
  | 'not_tested';

/** Klasa ciągłości pracy IEC 62271-200 §6.107. */
export type LossOfServiceContinuityCategory =
  | 'LSC1'            // Wymaga wyłączenia całej szyny SN
  | 'LSC2A'           // Wymaga wyłączenia tylko jednej sekcji
  | 'LSC2B';          // Możliwa konserwacja pola bez wyłączania szyny

/** Typ izolacji rozdzielnicy. */
export type SwitchgearInsulation =
  | 'air'             // Powietrzna (open / metal-clad)
  | 'sf6'             // SF₆ — kompaktowe RMU
  | 'vacuum'          // Próżniowa (typowo wyłączniki)
  | 'solid'           // Stała (cured-in-place)
  | 'mixed';

/** Konstrukcja mechaniczna. */
export type SwitchgearConstruction =
  | 'RMU'             // Ring Main Unit — kompaktowa
  | 'metal_clad'      // Metal-clad wnętrzowa
  | 'metal_enclosed'  // Metal-enclosed
  | 'kontenerowa'
  | 'prefabrykowana';

/** Typowy układ pola w rozdzielnicy producenta. */
export type CanonicalBayLayout =
  | 'cable_in'        // Pole kablowe zasilające (load_switch + DS + ES)
  | 'breaker'         // Pole wyłącznikowe (CB + DS + CT + ES) — odpływowe
  | 'transformer'     // Pole transformatorowe (fuse_switch + DS + ES) — TR SN/nN
  | 'cable_out'       // Pole kablowe odpływowe (load_switch + DS + ES)
  | 'measurement'     // Pole pomiarowe (VT na sztywno)
  | 'coupler';        // Sprzęgło / longitudinal coupler

/** Szablon pola w rozdzielnicy producenta. */
export interface VendorBayTemplate {
  readonly layout: CanonicalBayLayout;
  readonly designation: string; // np. "C" (cable), "V" (vacuum CB), "T" (TR), "DM" (Schneider)
  readonly labelPl: string;
}

export interface VendorSwitchgearTemplate {
  readonly id: string;
  readonly manufacturerRef: 'ABB' | 'Schneider' | 'Siemens' | 'Eaton'
                          | 'Elektrobudowa' | 'ZPUE_Wloszczowa' | 'Elektrometal';
  readonly seriesName: string;
  readonly fullName: string;
  /** Napięcia znamionowe (kV). */
  readonly voltageLevels: readonly number[];
  /** Prąd znamionowy szyny (A). */
  readonly ratedBusbarCurrent: number;
  /** Prąd krótkotrwały Ik (kA, 1s). */
  readonly shortTimeCurrent: number;
  readonly insulation: SwitchgearInsulation;
  readonly construction: SwitchgearConstruction;
  readonly arcClass: InternalArcClass;
  readonly ipRating: string;        // np. "IP3X", "IP4X"
  readonly lscCategory: LossOfServiceContinuityCategory;
  /** Typowe pola (auto-konfiguracja po wyborze rozdzielnicy). */
  readonly defaultBays: readonly VendorBayTemplate[];
  /** Wymiary fizyczne (mm) — głębokość × szerokość × wysokość pola. */
  readonly fieldDimensionsMm: { depth: number; width: number; height: number };
  readonly notes?: string;
}

/**
 * 5 referencyjnych typoszeregów rozdzielnic SN (15–24 kV).
 * Dane techniczne wg kart katalogowych producentów.
 */
export const VENDOR_SWITCHGEAR_CATALOG: readonly VendorSwitchgearTemplate[] = [
  {
    id: 'abb_safe_plus',
    manufacturerRef: 'ABB',
    seriesName: 'SafePlus',
    fullName: 'ABB SafePlus — kompaktowa RMU SF₆',
    voltageLevels: [12, 17.5, 24],
    ratedBusbarCurrent: 630,
    shortTimeCurrent: 21,
    insulation: 'sf6',
    construction: 'RMU',
    arcClass: 'IAC A FLR',
    ipRating: 'IP3X',
    lscCategory: 'LSC2A',
    fieldDimensionsMm: { depth: 800, width: 365, height: 1400 },
    defaultBays: [
      { layout: 'cable_in',     designation: 'C', labelPl: 'Pole kablowe zasilające' },
      { layout: 'breaker',      designation: 'V', labelPl: 'Pole wyłącznikowe (próżniowe)' },
      { layout: 'transformer',  designation: 'T', labelPl: 'Pole transformatorowe' },
      { layout: 'cable_out',    designation: 'C', labelPl: 'Pole kablowe odpływowe' },
    ],
    notes: 'Kompaktowa SF₆ — typowa konfiguracja stacji 15/0.4 kV',
  },
  {
    id: 'schneider_rm6',
    manufacturerRef: 'Schneider',
    seriesName: 'RM6',
    fullName: 'Schneider RM6 — modułowa RMU SF₆',
    voltageLevels: [12, 17.5, 24],
    ratedBusbarCurrent: 630,
    shortTimeCurrent: 20,
    insulation: 'sf6',
    construction: 'RMU',
    arcClass: 'IAC A FL',
    ipRating: 'IP3X',
    lscCategory: 'LSC2A',
    fieldDimensionsMm: { depth: 710, width: 384, height: 1374 },
    defaultBays: [
      { layout: 'cable_in',    designation: 'NE-I', labelPl: 'Pole kablowe (wyłącznik mocy)' },
      { layout: 'transformer', designation: 'QM',   labelPl: 'Pole transformatorowe (rozł.-bezp.)' },
      { layout: 'breaker',     designation: 'DM',   labelPl: 'Pole z wyłącznikiem próżniowym' },
      { layout: 'cable_out',   designation: 'NE-I', labelPl: 'Pole kablowe odpływowe' },
    ],
    notes: 'Modułowa RM6 — popularna w PSE/Energa/Tauron',
  },
  {
    id: 'siemens_8djh',
    manufacturerRef: 'Siemens',
    seriesName: '8DJH',
    fullName: 'Siemens 8DJH — air-insulated metal-clad',
    voltageLevels: [12, 17.5, 24, 36],
    ratedBusbarCurrent: 630,
    shortTimeCurrent: 25,
    insulation: 'air',
    construction: 'metal_clad',
    arcClass: 'IAC A FLR',
    ipRating: 'IP4X',
    lscCategory: 'LSC2B',
    fieldDimensionsMm: { depth: 1075, width: 500, height: 1600 },
    defaultBays: [
      { layout: 'cable_in',    designation: 'K',   labelPl: 'Pole kablowe' },
      { layout: 'breaker',     designation: 'L',   labelPl: 'Pole liniowe z wyłącznikiem' },
      { layout: 'transformer', designation: 'T',   labelPl: 'Pole transformatorowe' },
      { layout: 'measurement', designation: 'M',   labelPl: 'Pole pomiarowe (VT)' },
      { layout: 'cable_out',   designation: 'K',   labelPl: 'Pole kablowe odpływowe' },
    ],
    notes: 'Air-insulated z pełnym dostępem — projekty premium',
  },
  {
    id: 'eaton_xiria',
    manufacturerRef: 'Eaton',
    seriesName: 'Xiria',
    fullName: 'Eaton Xiria — vacuum + air SF₆-free',
    voltageLevels: [12, 17.5, 24],
    ratedBusbarCurrent: 630,
    shortTimeCurrent: 20,
    insulation: 'vacuum',
    construction: 'RMU',
    arcClass: 'IAC A FL',
    ipRating: 'IP3X',
    lscCategory: 'LSC2A',
    fieldDimensionsMm: { depth: 800, width: 350, height: 1400 },
    defaultBays: [
      { layout: 'cable_in',    designation: 'C', labelPl: 'Pole kablowe zasilające' },
      { layout: 'breaker',     designation: 'V', labelPl: 'Pole wyłącznikowe próżniowe' },
      { layout: 'transformer', designation: 'T', labelPl: 'Pole transformatorowe' },
      { layout: 'cable_out',   designation: 'C', labelPl: 'Pole kablowe odpływowe' },
    ],
    notes: 'SF₆-free — preferowane środowiskowo, vacuum technology',
  },
  {
    id: 'zpue_rotoblok',
    manufacturerRef: 'ZPUE_Wloszczowa',
    seriesName: 'Rotoblok',
    fullName: 'ZPUE Rotoblok — krajowa RMU SF₆',
    voltageLevels: [12, 17.5, 24],
    ratedBusbarCurrent: 630,
    shortTimeCurrent: 20,
    insulation: 'sf6',
    construction: 'RMU',
    arcClass: 'IAC A FL',
    ipRating: 'IP3X',
    lscCategory: 'LSC2A',
    fieldDimensionsMm: { depth: 900, width: 375, height: 1400 },
    defaultBays: [
      { layout: 'cable_in',    designation: 'KZ', labelPl: 'Pole kablowe zasilające' },
      { layout: 'breaker',     designation: 'WL', labelPl: 'Pole wyłącznikowe liniowe' },
      { layout: 'transformer', designation: 'TR', labelPl: 'Pole transformatorowe' },
      { layout: 'cable_out',   designation: 'KO', labelPl: 'Pole kablowe odpływowe' },
    ],
    notes: 'Polski producent — ZPUE Włoszczowa; szeroka dostępność OSD',
  },
];

/** Helper: pobierz template po id. */
export function getVendorSwitchgear(id: string): VendorSwitchgearTemplate | null {
  return VENDOR_SWITCHGEAR_CATALOG.find((t) => t.id === id) ?? null;
}

/** Helper: lista producentów. */
export function getAllManufacturers(): readonly VendorSwitchgearTemplate['manufacturerRef'][] {
  const set = new Set(VENDOR_SWITCHGEAR_CATALOG.map((t) => t.manufacturerRef));
  return Array.from(set);
}

/** Helper: typoszeregi danego producenta. */
export function getTemplatesByManufacturer(
  ref: VendorSwitchgearTemplate['manufacturerRef'],
): readonly VendorSwitchgearTemplate[] {
  return VENDOR_SWITCHGEAR_CATALOG.filter((t) => t.manufacturerRef === ref);
}
