/**
 * Reference Engine V1 — parytet ścieżki DANYCH pola z profilami referencyjnymi
 * (REFERENCE_ENGINE_SPEC_V1.md §8 pkt 2, V12K-060).
 *
 * KOREKTA (karta GEOMETRIA-STACJI §0 pkt 4, rejestr GEOMETRIA-STACJI-BRAK-WYPOSAZENIA):
 * słownik konwencji §12.4 (`apparatusSymbolsForRole` — typowa sekwencja aparatów roli
 * rysowana bez rekordów modelu) SKASOWANY. Intencja testu zostaje: nie istnieje drugi sposób
 * definiowania pól (pkt 10/12 dyrektywy właściciela 2026-07-17) — JEDYNĄ definicją pola są
 * profile pakietu iec62271, a rysunek ścieżki danych (`resolveBayApparatusSymbolIds`
 * + `symbolIdForPrimaryDeviceKind`, pakiet iec60617) musi zachować ich kolejność i zbiór.
 * Pole bez rekordów aparatów nie ma sekwencji do porównania (sylwetka braku danych).
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
  SYMBOL_QET_RODZAJU,
  WARIANT_RYSUNKU_QET,
  planApparatusSymbolIds,
  resolveBayApparatusSymbolIds,
  symbolIdForPrimaryDeviceKind,
} from '../apparatusSequence';
import type { FieldRole } from '../../../v2/domain/apparatusContracts';

/** Stos symboli ścieżki DANYCH dla pola, którego rekordy aparatów są dokładnie
 *  kanonicznym porządkiem profilu (rozdzielnica zbudowana wg profilu) uzupełnionym
 *  o wymagane aparaty boczne (`canonical_order` profilu opisuje tylko tor główny). */
function stosZDanychProfilu(
  role: FieldRole,
  profile: { readonly canonical_order: readonly BayPrimaryDeviceKind[]; readonly required: readonly BayPrimaryDeviceKind[]; readonly lateral_only: readonly BayPrimaryDeviceKind[] },
): readonly string[] {
  const kinds = [
    ...profile.canonical_order,
    ...profile.required.filter((kind) => profile.lateral_only.includes(kind) && !profile.canonical_order.includes(kind)),
  ];
  return resolveBayApparatusSymbolIds({
    fieldRole: role,
    primaryDevices: kinds.map((kind, i) => ({ deviceRef: `ref-${i}-${kind}`, kind, placement: 'MIDSTREAM' as const })),
  }).symbolIds;
}

const DER_ROLES = new Set<string>([FIELD_ROLE.DER_PV, FIELD_ROLE.DER_BESS, FIELD_ROLE.DER_FW, FIELD_ROLE.DER_UNKNOWN]);

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

  it('każda rola aparatowa ma profil, a stos ścieżki danych z rekordów profilu spełnia profil', () => {
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
      const stack = stosZDanychProfilu(role, profile!);
      expect(stack.length, `rola ${role}: profil bez kanonicznego porządku`).toBeGreaterThan(0);
      const kinds = kindsForStack(stack);
      const violations = profileViolationsForKinds(kinds, profile!);
      expect(violations, `rola ${role} (profil ${profileId}): ${violations.join('; ')}`).toEqual(
        [],
      );
    }
  });

  it('aparaty boczne stosów ścieżki danych ⊆ lateral_only profilu (§18.1)', () => {
    for (const role of ALL_FIELD_ROLES) {
      const profileId = referenceProfileIdForFieldRole(role);
      if (profileId == null) continue;
      const profile = REFERENCE_FIELD_PROFILES.get(profileId)!;
      const plan = planApparatusSymbolIds(stosZDanychProfilu(role, profile) as never);
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
      ...stosZDanychProfilu(FIELD_ROLE.RMU_LINE, profile),
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

  it('SYMBOL_QET_RODZAJU ≡ `frontend_symbol_id_qet` pakietu iec60617 (wariant rysunku QET, karta UX-04)', () => {
    const zPakietu = Object.fromEntries(
      IEC60617_PACK.symbol_map
        .filter((entry) => entry.frontend_symbol_id_qet != null)
        .map((entry) => [entry.kind, entry.frontend_symbol_id_qet]),
    );
    expect(zPakietu).toEqual(SYMBOL_QET_RODZAJU);
    for (const entry of IEC60617_PACK.symbol_map) {
      expect(
        symbolIdForPrimaryDeviceKind(entry.kind, WARIANT_RYSUNKU_QET),
        `kind ${entry.kind}: wariant QET frontendu ≠ pakiet iec60617`,
      ).toBe(entry.frontend_symbol_id_qet ?? entry.frontend_symbol_id);
    }
  });
});
