/**
 * Test parytetu (TODO-UI2 §1 p. 13): grupowanie celów wobec kanonicznego
 * rejestru kodów gotowości backendu (`READINESS_CODES`,
 * `backend/src/domain/canonical_operations.py`, wystawione przez
 * `GET /api/readiness/registry` — `backend/src/api/readiness_registry.py`).
 *
 * Fixture `fixtures/readiness_registry_snapshot.json` jest SNAPSHOTEM
 * odpowiedzi tego endpointu (para `code`+`area`, ten sam wzorzec co
 * `backend/schemas/openapi_snapshot.json`). Regeneracja (po zmianie
 * kanonicznego rejestru backendu — wywołać z `backend/`, `PY` = brief
 * wykonawcy):
 *
 *   PYTHONPATH=$PWD:$PWD/src $PY -c "
 *   import json
 *   from domain.readiness_bridge import widok_rejestru
 *   w = widok_rejestru()
 *   kody = [{'code': k['code'], 'area': k['area']} for k in w['codes']]
 *   print(json.dumps({'codes': kody, 'count': len(kody)}, ensure_ascii=False, indent=2, sort_keys=True))
 *   " > frontend/src/ui2/spaces/gotowosc/__tests__/fixtures/readiness_registry_snapshot.json
 *
 * Kryterium (karta §1 p. 13): KAŻDY kod kanonicznego rejestru ma grupę —
 * `celDlaKodu(code) !== 'pozostale'`. „Pozostałe" jest zarezerwowane dla
 * kodów SPOZA rejestru (generyczne E/W/I bez separatora kropkowego z
 * `enm/validator.py` — ograniczenie 1 w nagłówku `grupowanieCelow.ts`, jawnie
 * NIE rejestrowane tu jako regresja, bo rejestr kanoniczny ich nie zna).
 */
import { describe, expect, it } from 'vitest';

import { celDlaKodu } from '../grupowanieCelow';
import rejestr from './fixtures/readiness_registry_snapshot.json';

interface WpisRejestru {
  code: string;
  area: string;
}

const KODY_REJESTRU: WpisRejestru[] = (rejestr as { codes: WpisRejestru[] }).codes;

describe('grupowanieCelow — parytet z kanonicznym rejestrem READINESS_CODES (TODO-UI2 §1 p. 13)', () => {
  it('fixture niepusty (dowód, że snapshot nie jest zdegenerowany do [])', () => {
    expect(KODY_REJESTRU.length).toBeGreaterThan(100);
  });

  it.each(KODY_REJESTRU.map((wpis): [string, string] => [wpis.code, wpis.area]))(
    'kod kanonu "%s" (obszar %s) ma grupę celu (≠ "pozostale")',
    (code) => {
      expect(celDlaKodu(code)).not.toBe('pozostale');
    },
  );

  it('każdy kod kanonu mapuje się na dokładnie jeden z ośmiu zdefiniowanych celów', () => {
    const CELE_ZNANE = new Set([
      'stacje',
      'zgodnoscReferencyjna',
      'wspolne',
      'zwarcia',
      'rozplyw',
      'zabezpieczenia',
      'wniosekOsd',
    ]);
    for (const wpis of KODY_REJESTRU) {
      expect(CELE_ZNANE.has(celDlaKodu(wpis.code))).toBe(true);
    }
  });
});
