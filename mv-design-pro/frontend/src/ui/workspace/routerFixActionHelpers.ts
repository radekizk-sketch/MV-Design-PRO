/**
 * routerFixActionHelpers — pure helpers do mapowania fix actions na element typy/etykiety
 * (Phase 0 #11 cd. - czwarta fala decompose).
 *
 * Wszystkie pure, bez side-effects.
 */

import type { EnergyNetworkModel, FixAction } from '../../types/enm';
import type { ElementType } from '../types';
import { isInternalIdentifier } from './routerDisplayHelpers';

export function inferElementTypeForFixAction(
  snapshot: EnergyNetworkModel | null,
  elementRef: string,
): ElementType {
  if ((snapshot?.generators ?? []).some((item) => item.ref_id === elementRef || item.id === elementRef)) {
    const generator = snapshot?.generators.find((item) => item.ref_id === elementRef || item.id === elementRef);
    if (generator?.gen_type === 'pv_inverter') return 'PVInverter';
    if (generator?.gen_type === 'bess') return 'BESSInverter';
    return 'Generator';
  }
  if ((snapshot?.substations ?? []).some((item) => item.ref_id === elementRef || item.id === elementRef)) return 'Station';
  if ((snapshot?.bays ?? []).some((item) => item.ref_id === elementRef || item.id === elementRef)) return 'BaySN';
  if ((snapshot?.branches ?? []).some((item) => item.ref_id === elementRef || item.id === elementRef)) return 'LineBranch';
  if ((snapshot?.transformers ?? []).some((item) => item.ref_id === elementRef || item.id === elementRef)) return 'TransformerBranch';
  if ((snapshot?.sources ?? []).some((item) => item.ref_id === elementRef || item.id === elementRef)) return 'Source';
  if ((snapshot?.loads ?? []).some((item) => item.ref_id === elementRef || item.id === elementRef)) return 'Load';
  if ((snapshot?.measurements ?? []).some((item) => item.ref_id === elementRef || item.id === elementRef)) return 'Measurement';
  if ((snapshot?.protection_assignments ?? []).some((item) => item.ref_id === elementRef || item.id === elementRef)) return 'ProtectionAssignment';
  return 'Bus';
}

export function resolveElementNameForFixAction(
  snapshot: EnergyNetworkModel | null,
  elementRef: string,
): string {
  const candidates = [
    ...(snapshot?.generators ?? []),
    ...(snapshot?.substations ?? []),
    ...(snapshot?.bays ?? []),
    ...(snapshot?.branches ?? []),
    ...(snapshot?.transformers ?? []),
    ...(snapshot?.sources ?? []),
    ...(snapshot?.loads ?? []),
    ...(snapshot?.measurements ?? []),
    ...(snapshot?.protection_assignments ?? []),
    ...(snapshot?.buses ?? []),
  ];
  return candidates.find((item) => item.ref_id === elementRef || item.id === elementRef)?.name ?? elementRef;
}

export function fallbackElementLabelFromRef(elementRef: string): string {
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
  if (/^tr|^trafo\//i.test(elementRef)) return 'transformator';
  return 'obiekt układu sieci';
}

export function publicElementLabel(
  snapshot: EnergyNetworkModel | null,
  elementRef: string,
): string {
  const resolvedName = resolveElementNameForFixAction(snapshot, elementRef);
  return isInternalIdentifier(resolvedName) ? fallbackElementLabelFromRef(elementRef) : resolvedName;
}

export function sanitizeReadinessMessage(
  message: string,
  snapshot: EnergyNetworkModel | null,
): string {
  return message
    .replace(
      /ZKSN\s+['"]?bp\/[^\s'"]+['"]?\s+nie\s+ma\s+stanu\s+łącznika\s+\(switch_state\)\.?/gi,
      'ZKSN wymaga wskazania stanu normalnego łącznika.',
    )
    .replace(/\bOdcinek\s+\/segment\b/gi, 'odcinek SN')
    .replace(/\bodcinek\s+SN\s+SN\b/gi, 'odcinek SN')
    .replace(/Gałąź\s+'([^']+)'/g, (_match, ref: string) => publicElementLabel(snapshot, ref))
    .replace(/Źródło\s+'([^']+)'/g, (_match, ref: string) => publicElementLabel(snapshot, ref))
    .replace(/Obiekt\s+'([^']+)'/g, (_match, ref: string) => publicElementLabel(snapshot, ref))
    .replace(/'(gpz|seg|stn|bus|bay|branch|source|load|pv|bess|fw|tr|trafo|bp)\/[^']+'/gi, (match) =>
      publicElementLabel(snapshot, match.slice(1, -1)),
    )
    .replace(/\b(gpz|seg|stn|bus|bay|branch|source|load|pv|bess|fw|tr|trafo|bp)\/[^\s,;.]+/gi, (ref: string) =>
      publicElementLabel(snapshot, ref),
    )
    .replace(/\bswitch_state\b/gi, 'stan normalny łącznika');
}

export function fallbackFixActionFromBlocker(blocker: {
  code: string;
  element_ref: string | null;
}): FixAction {
  return {
    code: blocker.code,
    action_type: 'ADD_MISSING_DEVICE',
    element_ref: blocker.element_ref,
    modal_type: null,
    panel: null,
    step: null,
    focus: null,
    payload_hint: null,
    surface_descriptor: null,
    message_pl: blocker.element_ref ? 'Przejdź do elementu i skonfiguruj układ' : 'Pokaż szczegóły techniczne',
  };
}

export function derAxisStatusLabel(status: string): string {
  if (status === 'ready') return 'do analizy';
  if (status === 'partial') return 'w konfiguracji';
  if (status === 'blocked') return 'do konfiguracji';
  return 'kontrola';
}
