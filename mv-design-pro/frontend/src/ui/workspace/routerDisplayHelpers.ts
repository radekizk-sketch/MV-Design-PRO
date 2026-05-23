/**
 * routerDisplayHelpers — pure display helpers wyekstraktowane z
 * WorkspaceSurfaceRouter.tsx (Phase 0 #11 - kontynuacja decompose).
 *
 * Funkcje czyste, bez side-effects, bez useState/useEffect.
 * Konsumowane przez różne Surface komponenty.
 */

import { isInternalElementIdentifier } from '../shared/publicReadinessMessage';
import { isGenericSegmentName } from '../shared/publicTechnicalLabels';
import { stripTechnicalSuffix } from '../shell/publicNames';

export function isInternalIdentifier(value: string): boolean {
  return isInternalElementIdentifier(value);
}

export function displayValueOrAuditTrace(
  value: string | null | undefined,
  fallback: string,
): string {
  if (!value?.trim()) return fallback;
  const normalized = value.trim();
  return isInternalIdentifier(normalized) || isGenericSegmentName(normalized)
    ? fallback
    : normalized;
}

export function displayProjectLabel(value: string | null | undefined): string {
  if (!value?.trim()) return 'Aktywny projekt';
  if (isInternalIdentifier(value.trim())) return 'Aktywny projekt';
  return stripTechnicalSuffix(value) || 'Aktywny projekt';
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  project: 'Projekt',
  gpz: 'GPZ',
  gpz_section: 'Sekcja szyn GPZ',
  sn_bay: 'Pole SN',
  BaySN: 'Pole SN',
  Source: 'Źródło GPZ',
  station: 'Stacja SN/nN',
  Station: 'Stacja SN/nN',
  station_lv_side: 'Strona nN stacji',
  segment: 'Odcinek SN',
  LineBranch: 'Odcinek SN',
  zksn: 'ZKSN',
  ZKSN: 'ZKSN',
  branch_pole: 'Słup rozgałęźny SN',
  BranchPole: 'Słup rozgałęźny SN',
  branch: 'Odgałęzienie SN',
  ring: 'Pierścień SN',
  nop: 'NOP',
  pv_source: 'Źródło PV',
  bess_source: 'Magazyn BESS',
  fw_source: 'Źródło wiatrowe',
  analysis_case: 'Zakres obliczeń',
  analysis_run: 'Aktywne obliczenie',
  proof_pack: 'Dowody inżynierskie',
  report: 'Raport techniczny',
  export_artifact: 'Eksport techniczny',
};

export function publicEntityTypeLabel(value: string | null | undefined): string {
  if (!value?.trim()) return 'Aktywny kontekst układu';
  const normalized = value.trim();
  return ENTITY_TYPE_LABELS[normalized] ?? normalized.replace(/_/g, ' ');
}

const AUDIT_EXTENSION_LABELS: Record<string, string> = {
  power_flow_extensions: 'rozszerzony rozpływ mocy',
  tap_position_changes: 'regulacja zaczepów transformatorów',
  grounding_z0_z1_ratio: 'konfiguracja uziemienia punktu neutralnego',
  bess_reserved_capacity: 'rezerwa mocy magazynu BESS',
  cable_thermal_aging: 'starzenie termiczne kabla',
  protection_settings_freeze: 'zamrożenie nastaw zabezpieczeń',
  load_profile_demand: 'profil zapotrzebowania mocy',
};

export function publicAuditExtensionLabel(value: string): string {
  return AUDIT_EXTENSION_LABELS[value] ?? value.replace(/_/g, ' ');
}

const PROOF_TYPE_TAGS: Record<string, string> = {
  short_circuit: 'SC',
  power_flow: 'PF',
  voltage_drop: 'ΔU',
  protection: 'Zab.',
  voltage_profile: 'U-prof.',
  losses: 'Straty',
  equipment_proof: 'Aparat.',
};

export function publicProofTypeTag(value: string): string {
  return PROOF_TYPE_TAGS[value] ?? value;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value?.trim()) return '—';
  try {
    return new Date(value).toLocaleString('pl-PL', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return value;
  }
}

export function payloadString(payload: Record<string, unknown> | undefined, key: string): string | null {
  const value = payload?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
