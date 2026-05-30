/**
 * sourceConnectionVariant — kanoniczny wariant przyłączenia źródła OZE (V1).
 *
 * Mostek między ENM `Generator.connection_variant` (z aliasami legacy) a kanonicznym
 * zestawem wariantów używanym przez SLD (`topologyInputReader`, `stationBlockBuilder`).
 *
 * Kanoniczne warianty (mirror ENM GeneratorConnectionVariant — część kanoniczna):
 *  - LV_BEHIND_STATION_TRANSFORMER : po stronie nN, za transformatorem stacji SN/nN
 *  - DEDICATED_MV_CONNECTION       : dedykowane pole SN + transformator przyłączeniowy
 *  - SOURCE_CONNECTION_STATION     : osobna stacja przyłączeniowa źródła
 *
 * Aliasy legacy akceptowane na wejściu (normalizowane):
 *  - 'nn_side'          → LV_BEHIND_STATION_TRANSFORMER
 *  - 'block_transformer'→ DEDICATED_MV_CONNECTION
 *
 * Zero heurystyk stringowych poza tym jawnym słownikiem.
 */

/** Kanoniczne warianty (runtime enum + typ). */
export const SourceConnectionVariantV1 = {
  LV_BEHIND_STATION_TRANSFORMER: 'LV_BEHIND_STATION_TRANSFORMER',
  DEDICATED_MV_CONNECTION: 'DEDICATED_MV_CONNECTION',
  SOURCE_CONNECTION_STATION: 'SOURCE_CONNECTION_STATION',
} as const;

export type SourceConnectionVariantV1 =
  (typeof SourceConnectionVariantV1)[keyof typeof SourceConnectionVariantV1];

/**
 * Typ wejściowy: kanoniczny wariant LUB akceptowany alias legacy.
 * Czytnik przechowuje znormalizowaną wartość kanoniczną (lub null).
 */
export type SourceConnectionVariantInputV1 = SourceConnectionVariantV1;

/** Aliasy legacy → kanoniczny wariant. */
const LEGACY_ALIASES: Readonly<Record<string, SourceConnectionVariantV1>> = {
  nn_side: SourceConnectionVariantV1.LV_BEHIND_STATION_TRANSFORMER,
  block_transformer: SourceConnectionVariantV1.DEDICATED_MV_CONNECTION,
};

const CANONICAL_SET: ReadonlySet<string> = new Set<string>(
  Object.values(SourceConnectionVariantV1),
);

/**
 * Czy surowa wartość jest wspieranym wariantem (kanonicznym lub aliasem legacy)?
 */
export function isSupportedSourceConnectionVariant(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return CANONICAL_SET.has(raw) || raw in LEGACY_ALIASES;
}

/**
 * Normalizuj surowy wariant do postaci kanonicznej. Nieznany/brak → null.
 */
export function normalizeSourceConnectionVariant(
  raw: string | null | undefined,
): SourceConnectionVariantV1 | null {
  if (!raw) return null;
  if (CANONICAL_SET.has(raw)) return raw as SourceConnectionVariantV1;
  return LEGACY_ALIASES[raw] ?? null;
}

export function isLvBehindStationTransformerVariant(
  v: SourceConnectionVariantInputV1 | null | undefined,
): boolean {
  return v === SourceConnectionVariantV1.LV_BEHIND_STATION_TRANSFORMER;
}

export function isDedicatedMvConnectionVariant(
  v: SourceConnectionVariantInputV1 | null | undefined,
): boolean {
  return v === SourceConnectionVariantV1.DEDICATED_MV_CONNECTION;
}

export function isSourceConnectionStationVariant(
  v: SourceConnectionVariantInputV1 | null | undefined,
): boolean {
  return v === SourceConnectionVariantV1.SOURCE_CONNECTION_STATION;
}
