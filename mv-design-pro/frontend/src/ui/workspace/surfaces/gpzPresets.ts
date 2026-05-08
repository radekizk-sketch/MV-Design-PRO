/**
 * gpzPresets.ts — typowe konfiguracje GPZ dla inżyniera projektanta (R39).
 *
 * Każdy preset to atomic configuration: transformator + ilość sekcji + S''k +
 * zalecany system szyn. Gdy inżynier wybiera preset, formularz wypełnia
 * WSZYSTKIE pola jednym kliknięciem (zamiast 7 pól ręcznie).
 *
 * Realne kategoryzacje techniczne stosowane przez OSD (PSE/Energa/Tauron/Enea/PGE):
 *   - GPZ rozproszony (low density area, single trafo)
 *   - GPZ rozdzielczy podstawowy (standard distribution, N-1)
 *   - GPZ rozdzielczy aglomeracyjny (high density, gęsty popyt)
 *   - GPZ rozdzielczy aglomeracyjny N-2 (centra dużych miast, niezawodność N-2)
 *   - GPZ przemysłowy (sieci izolowane: huty, kopalnie, wielkie zakłady)
 *   - GPZ węzłowy WN/SN (autotrafo 220/110, tranzyt PSE)
 *
 * Klasyfikacja oparta na:
 *   - Klasie mocy (Sn) + topologii N-1 vs N-2
 *   - Sieci izolowanej vs uziemionej (przemysłowy = izolowany)
 *   - Funkcji w sieci (rozdzielczy vs węzłowy/tranzytowy)
 *
 * @see HV_TRANSFORMER_CATALOG dla pełnych danych transformatorów
 */

/**
 * Kategoria techniczna GPZ — klasyfikacja używana przez polskie OSD.
 */
export type GpzCategory =
  | 'distributed'              // GPZ rozproszony (small Sn, single trafo)
  | 'distribution_standard'    // GPZ rozdzielczy podstawowy (N-1)
  | 'distribution_dense'       // GPZ rozdzielczy aglomeracyjny (high density)
  | 'distribution_n_minus_2'   // GPZ rozdzielczy aglomeracyjny N-2 (centrum aglomeracji)
  | 'industrial'               // GPZ przemysłowy (sieć izolowana)
  | 'transmission_node';       // GPZ węzłowy WN/SN (autotransformator)

export const GPZ_CATEGORY_LABELS_PL: Readonly<Record<GpzCategory, string>> = {
  distributed: 'Rozproszony',
  distribution_standard: 'Rozdzielczy podstawowy',
  distribution_dense: 'Rozdzielczy aglomeracyjny',
  distribution_n_minus_2: 'Rozdzielczy aglomeracyjny N-2',
  industrial: 'Przemysłowy (sieć izolowana)',
  transmission_node: 'Węzłowy WN/SN (tranzytowy)',
};

export interface GpzPreset {
  /** Stable id (lower-snake-case). */
  readonly id: string;
  /** Polska nazwa preset'a — techniczna klasyfikacja. */
  readonly label: string;
  /** Krótki opis dla inżyniera. */
  readonly description: string;
  /** Typowy use case (techniczny). */
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
  /** Typowa moc zwarciowa S''k 110 kV [MVA] dla tej kategorii. */
  readonly typicalSk3Mva: number;
  /** Typowy R/X dla kategorii. */
  readonly typicalRX: number;
  /** Liczba pól liniowych per sekcja (rekomendacja). */
  readonly typicalLineFieldsPerSection: number;
  /** Kategoria techniczna GPZ. */
  readonly category: GpzCategory;
}

export const GPZ_PRESETS: readonly GpzPreset[] = [
  {
    id: 'preset-distributed',
    label: 'GPZ rozproszony',
    description: '1× 16 MVA, 110/15 kV, 2 sekcje, sprzęgło. Single trafo, ≤ 8 ciągów SN.',
    useCase: 'Obszar o niskiej gęstości obciążenia, lekkie warunki sieci',
    transformerCatalogId: 'abb-trt3-110-30-16',
    transformerCount: 1,
    sectionsCount: 2,
    hasCoupler: true,
    busbarSystem: 'pojedynczy sekcjonowany',
    typicalSk3Mva: 800,
    typicalRX: 0.15,
    typicalLineFieldsPerSection: 4,
    category: 'distributed',
  },
  {
    id: 'preset-distribution-standard',
    label: 'GPZ rozdzielczy podstawowy',
    description: '2× 25 MVA, 110/15 kV, 2 sekcje, sprzęgło. Topologia N-1.',
    useCase: 'Standardowa rozdzielnia rozdzielcza, średni popyt, rezerwa N-1',
    transformerCatalogId: 'abb-trt3-110-15-25',
    transformerCount: 2,
    sectionsCount: 2,
    hasCoupler: true,
    busbarSystem: 'pojedynczy sekcjonowany',
    typicalSk3Mva: 1500,
    typicalRX: 0.12,
    typicalLineFieldsPerSection: 8,
    category: 'distribution_standard',
  },
  {
    id: 'preset-distribution-dense',
    label: 'GPZ rozdzielczy aglomeracyjny',
    description: '2× 40 MVA, 110/20 kV, 2 sekcje, sprzęgło. Gęsta sieć kablowa SN.',
    useCase: 'Wysoka gęstość obciążenia, kable SN dominują nad liniami',
    transformerCatalogId: 'sgb-power-110-20-40',
    transformerCount: 2,
    sectionsCount: 2,
    hasCoupler: true,
    busbarSystem: 'pojedynczy sekcjonowany',
    typicalSk3Mva: 2500,
    typicalRX: 0.10,
    typicalLineFieldsPerSection: 12,
    category: 'distribution_dense',
  },
  {
    id: 'preset-distribution-n-2',
    label: 'GPZ rozdzielczy aglomeracyjny N-2',
    description: '2× 63 MVA, 110/15 kV, 4 sekcje, 3 sprzęgła. Niezawodność N-2.',
    useCase: 'Centrum aglomeracji, wysokie obciążenie, niezawodność N-2',
    transformerCatalogId: 'siemens-ktw-110-15-63',
    transformerCount: 2,
    sectionsCount: 4,
    hasCoupler: true,
    busbarSystem: 'podwojny',
    typicalSk3Mva: 4000,
    typicalRX: 0.08,
    typicalLineFieldsPerSection: 15,
    category: 'distribution_n_minus_2',
  },
  {
    id: 'preset-industrial',
    label: 'GPZ przemysłowy (sieć izolowana)',
    description: '2× 25 MVA, 110/6 kV, 2 sekcje, sprzęgło. Sieć izolowana, odbiorca dedykowany.',
    useCase: 'Wielki zakład przemysłowy, odbiorcy 6 kV bezpośrednio (huty, kopalnie)',
    transformerCatalogId: 'sgb-power-110-6-25',
    transformerCount: 2,
    sectionsCount: 2,
    hasCoupler: true,
    busbarSystem: 'pojedynczy sekcjonowany',
    typicalSk3Mva: 2000,
    typicalRX: 0.10,
    typicalLineFieldsPerSection: 10,
    category: 'industrial',
  },
  {
    id: 'preset-transmission-node',
    label: 'GPZ węzłowy WN/SN (220/110 kV)',
    description: '2× 160 MVA autotransformator, 220/110 kV, 2 sekcje. Tranzyt PSE.',
    useCase: 'Sieć przesyłowa 220/110 kV, węzeł dystrybucyjny PSE',
    transformerCatalogId: 'abb-tao-220-110-160',
    transformerCount: 2,
    sectionsCount: 2,
    hasCoupler: true,
    busbarSystem: 'podwojny obwodnicowy',
    typicalSk3Mva: 8000,
    typicalRX: 0.05,
    typicalLineFieldsPerSection: 6,
    category: 'transmission_node',
  },
];

/** Lookup preset by id. */
export function getGpzPresetById(id: string): GpzPreset | null {
  return GPZ_PRESETS.find((p) => p.id === id) ?? null;
}

/** Filter presets by category. */
export function filterGpzPresetsByCategory(category: GpzCategory): readonly GpzPreset[] {
  return GPZ_PRESETS.filter((p) => p.category === category);
}
