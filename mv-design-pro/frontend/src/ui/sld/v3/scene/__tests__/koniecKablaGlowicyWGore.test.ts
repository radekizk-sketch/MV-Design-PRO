// @vitest-environment node
/**
 * Karta UX-04/ROZDZIELNICA-SN-KOREKTA (D1): koniec kabla głowicy (port S definicji) w układzie
 * sceny zależy od orientacji toru — glif pola zasilającego nad szyną (`kierunekToru` = `w-gore`)
 * jest odbity w pionie, więc strona kabla stoi u GÓRY symbolu. Jedno źródło (`portKoncaKablaGlowicy`)
 * dla wyroczni `fieldEntryConnectionsReachCableHead` i podpisu „koniec toru".
 *
 * Iloczyn: orientacja {w-dol, w-gore} × przewód dochodzi {od góry, od dołu}. Głowica jest końcem
 * toru (wolny koniec kabla) dokładnie wtedy, gdy przewód NIE dochodzi do strony kabla.
 */
import { describe, expect, it } from 'vitest';

import { SYMBOL_DEFS } from '../../symbols/defs';
import { fieldEntryConnectionsReachCableHead, type SceneV3 } from '../buildScene';

const GLOWICA = 'qetCableHead' as const;

function scena(kierunekToru: 'w-dol' | 'w-gore', przewodOd: 'gora' | 'dol'): SceneV3 {
  const def = SYMBOL_DEFS[GLOWICA];
  const x = 100;
  const y = 200;
  const osX = x + (def.ports.find((p) => p.dir === 'N')?.x ?? def.width / 2);
  const punkt = przewodOd === 'gora' ? { x: osX, y } : { x: osX, y: y + def.height };
  const drugi = przewodOd === 'gora' ? { x: osX, y: y - 40 } : { x: osX, y: y + def.height + 40 };
  return {
    symbols: [{ symbolId: GLOWICA, x, y, kierunekToru, meta: { ownerRef: 'pole' } }],
    segments: [{ points: [drugi, punkt], meta: { parityKeys: [] } }],
  } as unknown as SceneV3;
}

describe('koniec kabla głowicy × orientacja toru', () => {
  const przypadki = [
    // [orientacja, przewód od, czy głowica jest wolnym końcem toru]
    ['w-dol', 'gora', true],
    ['w-dol', 'dol', false],
    ['w-gore', 'gora', false],
    ['w-gore', 'dol', true],
  ] as const;
  for (const [kierunek, od, wolnyKoniec] of przypadki) {
    it(`${kierunek} × przewód od ${od === 'gora' ? 'góry' : 'dołu'} → ${wolnyKoniec ? 'koniec toru' : 'kabel połączony'}`, () => {
      expect(fieldEntryConnectionsReachCableHead(scena(kierunek, od)).length).toBe(wolnyKoniec ? 1 : 0);
    });
  }
});
