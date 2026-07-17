/**
 * Reference Engine V1 — dostęp frontendu do pakietów referencyjnych
 * (REFERENCE_ENGINE_SPEC_V1.md §8, V12K-060).
 *
 * Dane pochodzą z LUSTRZANYCH kopii pakietów backendu
 * (`backend/src/reference_engine/packs/<id>/pack.json` →
 * `./<id>.pack.json`) — identyczność BAJTOWĄ egzekwuje test backendu
 * `tests/reference_engine/test_pack_parity.py` (jedno źródło prawdy,
 * pkt 10/12 dyrektywy właściciela 2026-07-17). Zmiana referencji = edycja
 * JSON po stronie backendu + synchronizacja kopii (czerwone CI przy
 * rozjeździe).
 *
 * Zgodność słownika konwencji §12.4 (`apparatusSymbolsForRole`) z profilami
 * egzekwuje `compose/__tests__/apparatusSequence.referenceParity.test.ts`
 * (z negatywem-sabotażem).
 */

import type { BayPrimaryDeviceKind } from '../../../types/enm';
import type { FieldRole } from '../v2/domain/apparatusContracts';
import { FIELD_ROLE } from '../v2/domain/apparatusContracts';
import iec60617PackJson from './iec60617.pack.json';
import iec62271PackJson from './iec62271.pack.json';

export interface ReferenceFieldProfile {
  readonly profile_id: string;
  readonly name_pl: string;
  readonly required: readonly BayPrimaryDeviceKind[];
  readonly one_of_groups: readonly (readonly BayPrimaryDeviceKind[])[];
  readonly optional: readonly BayPrimaryDeviceKind[];
  readonly forbidden: readonly BayPrimaryDeviceKind[];
  readonly canonical_order: readonly BayPrimaryDeviceKind[];
  readonly lateral_only: readonly BayPrimaryDeviceKind[];
  readonly notes_pl?: string;
}

export interface ReferenceSymbolMapEntry {
  readonly kind: BayPrimaryDeviceKind;
  readonly symbol_name_pl: string;
  readonly frontend_symbol_id: string | null;
}

interface Iec62271Pack {
  readonly pack_id: string;
  readonly version: string;
  readonly field_profiles: readonly ReferenceFieldProfile[];
}

interface Iec60617Pack {
  readonly pack_id: string;
  readonly version: string;
  readonly symbol_map: readonly ReferenceSymbolMapEntry[];
}

export const IEC62271_PACK = iec62271PackJson as unknown as Iec62271Pack;
export const IEC60617_PACK = iec60617PackJson as unknown as Iec60617Pack;

/** Profile pól po `profile_id` (pakiet iec62271 — jedyny nośnik profili). */
export const REFERENCE_FIELD_PROFILES: ReadonlyMap<string, ReferenceFieldProfile> =
  new Map(IEC62271_PACK.field_profiles.map((profile) => [profile.profile_id, profile]));

/** Słownik symboli: kind aparatu → `SymbolId` (null dla kindów DER). */
export const REFERENCE_SYMBOL_ID_BY_KIND: ReadonlyMap<BayPrimaryDeviceKind, string | null> =
  new Map(IEC60617_PACK.symbol_map.map((entry) => [entry.kind, entry.frontend_symbol_id]));

/** Odwrotność słownika symboli: `SymbolId` → kind aparatu. */
export const REFERENCE_KIND_BY_SYMBOL_ID: ReadonlyMap<string, BayPrimaryDeviceKind> = new Map(
  IEC60617_PACK.symbol_map
    .filter((entry) => entry.frontend_symbol_id != null)
    .map((entry) => [entry.frontend_symbol_id as string, entry.kind]),
);

/**
 * Mapowanie rola pola (frontend) → profil referencyjny — lustro backendowego
 * `reference_engine/registry.py::profile_id_for_bay` (spec §5). Role DER
 * zwracają `null`: mini-bloki DER to symbole ŹRÓDŁA, nie stos aparatów pola
 * (udokumentowany wyjątek — nagłówek `apparatusSequence.ts`).
 */
export function referenceProfileIdForFieldRole(role: FieldRole): string | null {
  switch (role) {
    case FIELD_ROLE.RMU_LINE:
      return 'rmu_line';
    case FIELD_ROLE.RMU_TRANSFORMER:
      return 'rmu_transformer';
    case FIELD_ROLE.TRANSFORMER:
      return 'transformer_fuse';
    case FIELD_ROLE.MEASUREMENT:
      return 'measurement';
    case FIELD_ROLE.COUPLER:
      return 'coupler';
    case FIELD_ROLE.LINE_IN:
    case FIELD_ROLE.LINE_OUT:
    case FIELD_ROLE.LINE_BRANCH:
    case FIELD_ROLE.GPZ_LINE_BAY:
      return 'line_breaker';
    case FIELD_ROLE.DER_PV:
    case FIELD_ROLE.DER_BESS:
    case FIELD_ROLE.DER_FW:
      return null;
    default:
      return null;
  }
}

/**
 * Naruszenia profilu przez sekwencję kindów aparatów (kolejność od szyny w
 * dół) — te same sprawdzenia co silnik backendu (`compliance.py`): required /
 * one_of / forbidden / kolejność toru głównego podciągiem. Zwraca listę
 * komunikatów PL (pusta = zgodne). Aparaty z `lateral_only` są poza
 * sprawdzeniem kolejności (§18.1 — z definicji boczne).
 */
export function profileViolationsForKinds(
  kinds: readonly BayPrimaryDeviceKind[],
  profile: ReferenceFieldProfile,
): string[] {
  const violations: string[] = [];
  const present = new Set(kinds);
  for (const required of profile.required) {
    if (!present.has(required)) {
      violations.push(`brak wymaganego aparatu ${required}`);
    }
  }
  for (const group of profile.one_of_groups) {
    if (!group.some((kind) => present.has(kind))) {
      violations.push(`brak funkcji łączeniowej toru (jeden z: ${group.join('/')})`);
    }
  }
  for (const forbidden of profile.forbidden) {
    if (present.has(forbidden)) {
      violations.push(`aparat zakazany ${forbidden}`);
    }
  }
  const lateral = new Set(profile.lateral_only);
  const mainKinds = kinds.filter((kind) => !lateral.has(kind));
  const template = profile.canonical_order.filter((kind) => !lateral.has(kind));
  let cursor = 0;
  for (const kind of mainKinds) {
    let found = -1;
    for (let i = cursor; i < template.length; i++) {
      if (template[i] === kind) {
        found = i;
        break;
      }
    }
    if (found < 0) {
      violations.push(`błędna kolejność aparatów toru głównego (${mainKinds.join('→')})`);
      break;
    }
    cursor = found + 1;
  }
  return violations;
}
