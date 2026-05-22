import type { EnergyNetworkModel } from '../../types/enm';

type NamedEnmElement = {
  id?: string | null;
  ref_id?: string | null;
  name?: string | null;
  label?: string | null;
  branch_point_type?: string | null;
};

type SnapshotLike = Partial<
  Pick<
    EnergyNetworkModel,
    | 'generators'
    | 'substations'
    | 'bays'
    | 'branches'
    | 'transformers'
    | 'sources'
    | 'loads'
    | 'measurements'
    | 'protection_assignments'
    | 'buses'
  >
> & {
  branch_points?: readonly NamedEnmElement[];
  corridors?: readonly NamedEnmElement[];
};

const INTERNAL_REF_PREFIX = `(?:${[
  'gpz',
  'stn',
  'seg',
  'bus',
  'bay',
  'branch',
  'source',
  'load',
  'pv',
  'bess',
  'fw',
  'tr',
  'trafo',
  'bp',
].join('|')})`;
const INTERNAL_REF_PATTERN = new RegExp(`\\b${INTERNAL_REF_PREFIX}\\/[\\w./:#-]+`, 'gi');
const QUOTED_INTERNAL_REF_PATTERN = new RegExp(`['"](${INTERNAL_REF_PREFIX}\\/[^'"]+)['"]`, 'gi');

export function isInternalElementIdentifier(value: string): boolean {
  const normalized = value.trim();
  const lower = normalized.toLowerCase();
  if (!normalized) return false;
  if (/[0-9a-f]{24,}/i.test(normalized)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)) return true;
  if (/\/segment\b/i.test(normalized)) return true;
  if (lower.includes('snapshot')) return true;
  if (/^(project|case|run|snapshot|proof-pack|export|variant|catalog|result-hash|hash)(?:[-:/_][\w./:-]+)$/i.test(normalized)) return true;
  return new RegExp(`^${INTERNAL_REF_PREFIX}\\/`, 'i').test(normalized);
}

function fallbackElementLabelFromRef(elementRef: string): string {
  if (/^bp\/.+\/zksn\b/i.test(elementRef)) return 'ZKSN';
  if (/^bp\//i.test(elementRef)) return 'słup rozgałęźny SN';
  if (/^seg\//i.test(elementRef)) return 'odcinek SN';
  if (/^gpz\/.+\/source\//i.test(elementRef)) return 'źródło zasilania GPZ';
  if (/^gpz\/.+\/bay\//i.test(elementRef)) return 'pole SN GPZ';
  if (/^gpz\//i.test(elementRef)) return 'układ GPZ';
  if (/^stn\//i.test(elementRef)) return 'stacja SN/nN';
  if (/^pv\//i.test(elementRef)) return 'źródło PV';
  if (/^bess\//i.test(elementRef)) return 'magazyn energii';
  if (/^fw\//i.test(elementRef)) return 'źródło wiatrowe';
  if (/^bus\//i.test(elementRef)) return 'szyna SN';
  if (/^(tr|trafo)\//i.test(elementRef)) return 'transformator';
  return 'obiekt układu sieci';
}

function resolveElementName(snapshot: SnapshotLike | null | undefined, elementRef: string): string {
  const candidates: readonly NamedEnmElement[] = [
    ...((snapshot?.generators ?? []) as readonly NamedEnmElement[]),
    ...((snapshot?.substations ?? []) as readonly NamedEnmElement[]),
    ...((snapshot?.bays ?? []) as readonly NamedEnmElement[]),
    ...((snapshot?.branches ?? []) as readonly NamedEnmElement[]),
    ...((snapshot?.transformers ?? []) as readonly NamedEnmElement[]),
    ...((snapshot?.sources ?? []) as readonly NamedEnmElement[]),
    ...((snapshot?.loads ?? []) as readonly NamedEnmElement[]),
    ...((snapshot?.measurements ?? []) as readonly NamedEnmElement[]),
    ...((snapshot?.protection_assignments ?? []) as readonly NamedEnmElement[]),
    ...((snapshot?.buses ?? []) as readonly NamedEnmElement[]),
    ...((snapshot?.branch_points ?? []) as readonly NamedEnmElement[]),
    ...((snapshot?.corridors ?? []) as readonly NamedEnmElement[]),
  ];
  const match = candidates.find((item) => item.ref_id === elementRef || item.id === elementRef);
  return match?.name ?? match?.label ?? elementRef;
}

export function publicElementLabelFromRef(
  snapshot: SnapshotLike | null | undefined,
  elementRef: string,
): string {
  const resolvedName = resolveElementName(snapshot, elementRef);
  return isInternalElementIdentifier(resolvedName)
    ? fallbackElementLabelFromRef(elementRef)
    : resolvedName;
}

export function sanitizePublicReadinessMessage(
  message: string,
  snapshot?: SnapshotLike | null,
): string {
  return message
    .replace(
      /Brak\s+źródła\s+zasilania\s+w\s+modelu\s+sieci\.?/gi,
      'Skonfiguruj GPZ jako kompletny układ zasilania z katalogu.',
    )
    .replace(
      /Brak\s+szyn\s+\(węzłów\)\s+w\s+modelu\s+sieci\.?/gi,
      'Wybierz wariant rozdzielni SN i sekcji szyn z katalogu GPZ.',
    )
    .replace(
      /ZKSN\s+['"]?bp\/[^\s'"]+['"]?\s+nie\s+ma\s+stanu\s+łącznika\s+\(switch_state\)\.?/gi,
      'ZKSN wymaga wskazania stanu normalnego łącznika.',
    )
    .replace(
      /słup\s+rozgałęźny(?:\s+SN)?\s+['"]?bp\/[^\s'"]+['"]?\s+nie\s+ma\s+stanu\s+łącznika\s+\(switch_state\)\.?/gi,
      'Słup rozgałęźny SN wymaga wskazania stanu normalnego łącznika.',
    )
    .replace(/\bOdcinek\s+\/segment\b/gi, 'odcinek SN')
    .replace(/\bodcinek\s+SN\s+SN\b/gi, 'odcinek SN')
    .replace(/Gałąź\s+['"]([^'"]+)['"]/gi, (_match, ref: string) => publicElementLabelFromRef(snapshot, ref))
    .replace(/Źródło\s+['"]([^'"]+)['"]/gi, (_match, ref: string) => publicElementLabelFromRef(snapshot, ref))
    .replace(/Obiekt\s+['"]([^'"]+)['"]/gi, (_match, ref: string) => publicElementLabelFromRef(snapshot, ref))
    .replace(QUOTED_INTERNAL_REF_PATTERN, (_match, ref: string) => publicElementLabelFromRef(snapshot, ref))
    .replace(INTERNAL_REF_PATTERN, (ref: string) => publicElementLabelFromRef(snapshot, ref))
    .replace(/\bswitch_state\b/gi, 'stan normalny łącznika')
    .replace(/\s+/g, ' ')
    .trim();
}
