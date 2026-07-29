/**
 * Reference Engine V1 — parytet słownika konwencji §12.4 z profilami
 * referencyjnymi (REFERENCE_ENGINE_SPEC_V1.md §8 pkt 2, V12K-060).
 *
 * Słownik `apparatusSymbolsForRole` i mapowanie `symbolIdForPrimaryDeviceKind`
 * są IMPLEMENTACJAMI pakietów referencyjnych (iec62271 — profile pól,
 * iec60617 — słownik symboli). Rozjazd = czerwono: nie istnieje drugi sposób
 * definiowania pól (pkt 10/12 dyrektywy właściciela 2026-07-17).
 * Obowiązkowy NEGATYW-SABOTAŻ: zepsuty stos musi oblać sprawdzenie.
 */

import { describe, expect, it } from 'vitest';

import type { BayPrimaryDeviceKind } from '../../../../../types/enm';
import { ALL_FIELD_ROLES, FIELD_ROLE } from '../../../v2/domain/apparatusContracts';
import {
  IEC60617_PACK,
  IEC62271_PACK,
  REFERENCE_FIELD_PROFILES,
  REFERENCE_KIND_BY_SYMBOL_ID,
  profileViolationsForKinds,
  referenceProfileIdForFieldRole,
} from '../../../reference/referenceProfiles';
import {
  apparatusSymbolsForRole,
  planApparatusSymbolIds,
  symbolIdForPrimaryDeviceKind,
} from '../apparatusSequence';

const DER_ROLES = new Set<string>([FIELD_ROLE.DER_PV, FIELD_ROLE.DER_BESS, FIELD_ROLE.DER_FW]);

function kindsForStack(stack: readonly string[]): BayPrimaryDeviceKind[] {
  return stack.map((symbolId) => {
    const kind = REFERENCE_KIND_BY_SYMBOL_ID.get(symbolId);
    if (kind == null) {
      throw new Error(`symbol ${symbolId} bez kinda w słowniku iec60617`);
    }
    return kind;
  });
}

describe('parytet słownika §12.4 z pakietem iec62271 (profile pól)', () => {
  it('pakiety lustrzane mają wersję (pkt 11 dyrektywy)', () => {
    expect(IEC62271_PACK.version).toBeTruthy();
    expect(IEC60617_PACK.version).toBeTruthy();
  });

  it('każda rola aparatowa ma profil, a stos konwencji spełnia profil', () => {
    for (const role of ALL_FIELD_ROLES) {
      const profileId = referenceProfileIdForFieldRole(role);
      if (DER_ROLES.has(role)) {
        // Udokumentowany wyjątek: mini-bloki DER = symbole źródła.
        expect(profileId).toBeNull();
        continue;
      }
      expect(profileId, `rola ${role} bez profilu referencyjnego`).not.toBeNull();
      const profile = REFERENCE_FIELD_PROFILES.get(profileId as string);
      expect(profile, `profil ${profileId} nie istnieje w pakiecie`).toBeDefined();
      const stack = apparatusSymbolsForRole(role);
      const kinds = kindsForStack(stack);
      const violations = profileViolationsForKinds(kinds, profile!);
      expect(violations, `rola ${role} (profil ${profileId}): ${violations.join('; ')}`).toEqual(
        [],
      );
    }
  });

  it('aparaty boczne stosów konwencji ⊆ lateral_only profilu (§18.1)', () => {
    for (const role of ALL_FIELD_ROLES) {
      const profileId = referenceProfileIdForFieldRole(role);
      if (profileId == null) continue;
      const profile = REFERENCE_FIELD_PROFILES.get(profileId)!;
      const plan = planApparatusSymbolIds(apparatusSymbolsForRole(role));
      const lateralKinds = plan.laterals.map((lateral) =>
        REFERENCE_KIND_BY_SYMBOL_ID.get(lateral.symbolId),
      );
      for (const kind of lateralKinds) {
        expect(profile.lateral_only).toContain(kind);
      }
    }
  });

  it('NEGATYW-SABOTAŻ: transformator wstrzyknięty do stosu rmu_line obala profil', () => {
    const profile = REFERENCE_FIELD_PROFILES.get('rmu_line')!;
    const sabotaged = kindsForStack([
      ...apparatusSymbolsForRole(FIELD_ROLE.RMU_LINE),
      'transformer2W',
    ]);
    const violations = profileViolationsForKinds(sabotaged, profile);
    expect(violations.some((v) => v.includes('zakazany'))).toBe(true);
  });

  it('NEGATYW-SABOTAŻ: odwrócona kolejność toru głównego obala profil', () => {
    const profile = REFERENCE_FIELD_PROFILES.get('rmu_line')!;
    const violations = profileViolationsForKinds(
      kindsForStack(['cableHead', 'loadBreakSwitch', 'earthSwitch']),
      profile,
    );
    expect(violations.some((v) => v.includes('kolejność'))).toBe(true);
  });
});

describe('parytet mapowania kind→symbol z pakietem iec60617', () => {
  it('symbolIdForPrimaryDeviceKind ≡ symbol_map pakietu (pełne pokrycie kindów)', () => {
    expect(IEC60617_PACK.symbol_map.length).toBeGreaterThan(0);
    for (const entry of IEC60617_PACK.symbol_map) {
      expect(
        symbolIdForPrimaryDeviceKind(entry.kind),
        `kind ${entry.kind}: mapowanie frontendu ≠ pakiet iec60617`,
      ).toBe(entry.frontend_symbol_id);
    }
  });
});
