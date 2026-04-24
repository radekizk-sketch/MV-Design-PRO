export const SourceConnectionVariantV1 = {
  LV_BEHIND_STATION_TRANSFORMER: 'LV_BEHIND_STATION_TRANSFORMER',
  DEDICATED_MV_CONNECTION: 'DEDICATED_MV_CONNECTION',
  SOURCE_CONNECTION_STATION: 'SOURCE_CONNECTION_STATION',
} as const;

export type CanonicalSourceConnectionVariantV1 =
  (typeof SourceConnectionVariantV1)[keyof typeof SourceConnectionVariantV1];

export type LegacySourceConnectionVariantV1 = 'nn_side' | 'block_transformer';

export type SourceConnectionVariantInputV1 =
  | CanonicalSourceConnectionVariantV1
  | LegacySourceConnectionVariantV1;

const VARIANT_ALIASES: Record<string, CanonicalSourceConnectionVariantV1> = {
  [SourceConnectionVariantV1.LV_BEHIND_STATION_TRANSFORMER]: SourceConnectionVariantV1.LV_BEHIND_STATION_TRANSFORMER,
  [SourceConnectionVariantV1.DEDICATED_MV_CONNECTION]: SourceConnectionVariantV1.DEDICATED_MV_CONNECTION,
  [SourceConnectionVariantV1.SOURCE_CONNECTION_STATION]: SourceConnectionVariantV1.SOURCE_CONNECTION_STATION,
  nn_side: SourceConnectionVariantV1.LV_BEHIND_STATION_TRANSFORMER,
  block_transformer: SourceConnectionVariantV1.DEDICATED_MV_CONNECTION,
};

export function normalizeSourceConnectionVariant(
  value: string | null | undefined,
): CanonicalSourceConnectionVariantV1 | null {
  if (!value) return null;
  return VARIANT_ALIASES[value] ?? null;
}

export function isSupportedSourceConnectionVariant(value: string | null | undefined): boolean {
  if (!value) return false;
  return normalizeSourceConnectionVariant(value) !== null;
}

export function isLvBehindStationTransformerVariant(value: string | null | undefined): boolean {
  return normalizeSourceConnectionVariant(value) === SourceConnectionVariantV1.LV_BEHIND_STATION_TRANSFORMER;
}

export function isDedicatedMvConnectionVariant(value: string | null | undefined): boolean {
  return normalizeSourceConnectionVariant(value) === SourceConnectionVariantV1.DEDICATED_MV_CONNECTION;
}

export function isSourceConnectionStationVariant(value: string | null | undefined): boolean {
  return normalizeSourceConnectionVariant(value) === SourceConnectionVariantV1.SOURCE_CONNECTION_STATION;
}

export const SOURCE_CONNECTION_VARIANT_LABELS_PL: Record<CanonicalSourceConnectionVariantV1, string> = {
  [SourceConnectionVariantV1.LV_BEHIND_STATION_TRANSFORMER]: 'po stronie nN istniejacej stacji',
  [SourceConnectionVariantV1.DEDICATED_MV_CONNECTION]: 'dedykowane pole SN i transformator przylaczeniowy',
  [SourceConnectionVariantV1.SOURCE_CONNECTION_STATION]: 'osobna stacja przylaczeniowa zrodla',
};
