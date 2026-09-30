/**
 * Test parytetu (TODO-UI2 §1 p. 13): grupowanie celów wobec kanonicznego
 * rejestru kodów gotowości backendu (`READINESS_CODES`,
 * `backend/src/domain/canonical_operations.py`, wystawione przez
 * `GET /api/readiness/registry` — `backend/src/api/readiness_registry.py`).
 *
 * Fixture `fixtures/readiness_registry_snapshot.json` jest SNAPSHOTEM
 * rejestru (kod, obszar, nawigacja naprawcza; od karty C-12 także odwzorowanie
 * kodów walidatora i emitery akcji naprawczych). Równość z backendem pilnuje
 * `backend/tests/domain/test_fikstura_rejestru_gotowosci_frontu.py`; regeneracja
 * (z katalogu `backend/`):
 *
 *   PYTHONPATH=$PWD:$PWD/src python tests/domain/test_fikstura_rejestru_gotowosci_frontu.py
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
