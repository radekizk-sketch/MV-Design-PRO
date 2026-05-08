/**
 * gpzPresets.ts — typowe konfiguracje GPZ dla inżyniera projektanta (R39).
 *
 * Każdy preset to atomic configuration: transformator + ilość sekcji + S''k +
 * zalecany system szyn. Gdy inżynier wybiera preset, formularz wypełnia
 * WSZYSTKIE pola jednym kliknięciem (zamiast 7 pól ręcznie).
 *
 * Realne preset'y z polskiej energetyki dystrybucyjnej:
 *   - GPZ wiejski mały (1×16 MVA, 110/15)
 *   - GPZ wiejski standardowy (2×25 MVA, 110/15)
 *   - GPZ miejski rozdzielczy (2×40 MVA, 110/20)
 *   - GPZ dużego miasta (2×63 MVA, 110/15)
 *   - GPZ przemysłowy (huta/kopalnia) (2×25 MVA, 110/6)
 *   - GPZ węzłowy/tranzytowy (2×40 MVA, 220/110)
 *
 * @see HV_TRANSFORMER_CATALOG dla pełnych danych transformatorów
 */

export interface GpzPreset {
  /** Stable id (lower-snake-case). */
  readonly id: string;
  /** Polska nazwa preset'a. */
  readonly label: string;
  /** Krótki opis dla inżyniera. */
  readonly description: string;
  /** Typowy use case. */
  readonly useCase: string;
  /** ID katalogu HV transformatora (pasuje do HV_TRANSFORMER_CATALOG). */
  readonly transformerCatalogId: string;
  /** Liczba transformatorów (1 dla małego, 2 dla typowego N-1). */
  readonly transformerCount: number;
  /** Liczba sekcji szyn SN. */
  readonly sectionsCount: number;
  /** Czy ma sprzęgło międzysekcyjne (zwykle TAK). */
  readonly hasCoupler: boolean;
  /** System szyn. */
  readonly busbarSystem: 'pojedynczy sekcjonowany' | 'pojedynczy bez sekcji' | 'podwojny' | 'podwojny obwodnicowy';
  /** Typowa moc zwarciowa S''k 110 kV [MVA] dla tego typu obszaru. */
  readonly typicalSk3Mva: number;
  /** Typowy R/X dla obszaru. */
  readonly typicalRX: number;
  /** Liczba pól liniowych per sekcja (rekomendacja). */
  readonly typicalLineFieldsPerSection: number;
  /** Tag lokalizacji (informacyjne). */
  readonly locationTag: 'wiejski' | 'miejski' | 'przemysłowy' | 'tranzytowy';
}

export const GPZ_PRESETS: readonly GpzPreset[] = [
  {
    id: 'preset-rural-small',
    label: 'GPZ wiejski mały',
    description: '1× 16 MVA, 110/15 kV, 2 sekcje, sprzęgło. Typowy GPZ obsługujący 1-3 wsi (≤ 8 ciągów SN).',
    useCase: 'Obszar wiejski rozproszony, mały popyt mocy',
    transformerCatalogId: 'abb-trt3-110-30-16',
    transformerCount: 1,
    sectionsCount: 2,
    hasCoupler: true,
    busbarSystem: 'pojedynczy sekcjonowany',
    typicalSk3Mva: 800,
    typicalRX: 0.15,
    typicalLineFieldsPerSection: 4,
    locationTag: 'wiejski',
  },
  {
    id: 'preset-rural-standard',
    label: 'GPZ wiejski standardowy',
    description: '2× 25 MVA, 110/15 kV, 2 sekcje, sprzęgło. N-1 reserve. Typowy GPZ powiatowy.',
    useCase: 'Obszar wiejski/podmiejski, średni popyt, rezerwa N-1',
    transformerCatalogId: 'abb-trt3-110-15-25',
    transformerCount: 2,
    sectionsCount: 2,
    hasCoupler: true,
    busbarSystem: 'pojedynczy sekcjonowany',
    typicalSk3Mva: 1500,
    typicalRX: 0.12,
    typicalLineFieldsPerSection: 8,
    locationTag: 'wiejski',
  },
  {
    id: 'preset-urban-medium',
    label: 'GPZ miejski rozdzielczy',
    description: '2× 40 MVA, 110/20 kV, 2 sekcje, sprzęgło. Typowy GPZ obsługujący 1 dzielnicę dużego miasta.',
    useCase: 'Dzielnica miejska, gęsty popyt, kable SN dominują',
    transformerCatalogId: 'sgb-power-110-20-40',
    transformerCount: 2,
    sectionsCount: 2,
    hasCoupler: true,
    busbarSystem: 'pojedynczy sekcjonowany',
    typicalSk3Mva: 2500,
    typicalRX: 0.10,
    typicalLineFieldsPerSection: 12,
    locationTag: 'miejski',
  },
  {
    id: 'preset-urban-large',
    label: 'GPZ dużego miasta (centrum)',
    description: '2× 63 MVA, 110/15 kV, 4 sekcje, 3 sprzęgła. GPZ dla aglomeracji (Warszawa/Kraków/Wrocław centrum).',
    useCase: 'Aglomeracja gęsta, wysokie obciążenie, niezawodność N-2',
    transformerCatalogId: 'siemens-ktw-110-15-63',
    transformerCount: 2,
    sectionsCount: 4,
    hasCoupler: true,
    busbarSystem: 'podwojny',
    typicalSk3Mva: 4000,
    typicalRX: 0.08,
    typicalLineFieldsPerSection: 15,
    locationTag: 'miejski',
  },
  {
    id: 'preset-industrial',
    label: 'GPZ przemysłowy (huta/kopalnia)',
    description: '2× 25 MVA, 110/6 kV, 2 sekcje, sprzęgło. Sieć izolowana — wysokie I_n nN.',
    useCase: 'Huta, kopalnia, wielki zakład — odbiorcy 6 kV bezpośrednio',
    transformerCatalogId: 'sgb-power-110-6-25',
    transformerCount: 2,
    sectionsCount: 2,
    hasCoupler: true,
    busbarSystem: 'pojedynczy sekcjonowany',
    typicalSk3Mva: 2000,
    typicalRX: 0.10,
    typicalLineFieldsPerSection: 10,
    locationTag: 'przemysłowy',
  },
  {
    id: 'preset-transit-220',
    label: 'GPZ węzłowy 220/110 kV',
    description: '2× 160 MVA autotransformator, 220/110 kV, 2 sekcje. GPZ tranzytowy PSE.',
    useCase: 'Sieć przesyłowa 220/110 kV, węzeł dystrybucyjny PSE',
    transformerCatalogId: 'abb-tao-220-110-160',
    transformerCount: 2,
    sectionsCount: 2,
    hasCoupler: true,
    busbarSystem: 'podwojny obwodnicowy',
    typicalSk3Mva: 8000,
    typicalRX: 0.05,
    typicalLineFieldsPerSection: 6,
    locationTag: 'tranzytowy',
  },
];

/** Lookup preset by id. */
export function getGpzPresetById(id: string): GpzPreset | null {
  return GPZ_PRESETS.find((p) => p.id === id) ?? null;
}

/** Filter presets by location tag. */
export function filterGpzPresetsByLocation(tag: GpzPreset['locationTag']): readonly GpzPreset[] {
  return GPZ_PRESETS.filter((p) => p.locationTag === tag);
}
