/**
 * Karta GPZ-H5-SLD pkt 3d — E065 (sekcja GPZ bez zasilania) i cała klasa kodów BRAKU
 * ZASILANIA w OBU grupowaniach gotowości: panel gotowości (`celDlaKodu` przez
 * `naProblemGotowosci`) i licznik / przegląd budowy sieci (`kategoriaBlokera`).
 *
 * Iloczyn cech: kod {każdy z `KODY_BRAKU_ZASILANIA`} × postać zgłoszenia {kod kanoniczny
 * wprost, kod walidatora + `canonical_code` z mostu} × grupowanie {panel, budowa sieci}.
 * Kody walidatora z mostu `backend/src/domain/readiness_bridge.py` (E001, E065, E066,
 * `sources.bus_missing`) — dokładnie te, które emituje backend (sonda na fiksturze H5
 * 2×2 z jednym źródłem i otwartymi łącznikami: E065 + E066, oba BLOCKER).
 */
import { describe, expect, it } from 'vitest';

import { kategoriaBlokera, selectBlockersByCategory } from '../../../../ui/network-build/networkBuildStore';
import type { ReadinessIssue } from '../../../../ui/types';
import { celDlaKodu, grupujProblemyWgCelu, KODY_BRAKU_ZASILANIA } from '../grupowanieCelow';

const KOD_WALIDATORA: Readonly<Record<string, string>> = {
  'source.grid_supply_missing': 'E001',
  'source.connection_missing': 'sources.bus_missing',
  'source.gpz_section_unsupplied': 'E065',
  'source.gpz_transformer_hv_unsupplied': 'E066',
  'source.multiple_grid_sources_in_island': 'source.multiple_grid_sources_in_island',
};

function zgloszenie(code: string, canonical?: string): ReadinessIssue {
  return {
    code,
    severity: 'BLOCKER',
    message_pl: 'Sekcja GPZ bez zasilania.',
    element_ref: 'gpz/h5/section/002/bus_sn',
    element_refs: ['gpz/h5/section/002/bus_sn'],
    wizard_step_hint: '',
    fix_action: null,
    ...(canonical ? { canonical_code: canonical } : {}),
  } as ReadinessIssue;
}

describe('kody braku zasilania — oba grupowania gotowości (iloczyn)', () => {
  it('lista pokrywa każdy kod mostu walidatora z tej klasy', () => {
    expect([...KODY_BRAKU_ZASILANIA].sort()).toEqual(Object.keys(KOD_WALIDATORA).sort());
  });

  for (const kanon of KODY_BRAKU_ZASILANIA) {
    for (const postac of ['kanoniczny', 'walidatora'] as const) {
      const issue = postac === 'kanoniczny' ? zgloszenie(kanon) : zgloszenie(KOD_WALIDATORA[kanon], kanon);
      it(`${kanon} (${postac}: ${issue.code}) — panel: „Do uruchomienia obliczeń", budowa: „Topologia"`, () => {
        const grupy = grupujProblemyWgCelu([issue]);
        expect(grupy.map((g) => g.cel)).toEqual(['wspolne']);
        expect(kategoriaBlokera(issue.code, issue.canonical_code)).toBe('topologia');
        expect(selectBlockersByCategory([issue]).topologia).toBe(1);
      });
    }
  }

  it('parametry zwarciowe źródła zostają w grupie zwarć (granica klasy)', () => {
    expect(celDlaKodu('source.sk3_invalid')).toBe('zwarcia');
    expect(celDlaKodu('source.sk_min_missing')).toBe('zwarcia');
  });
});
