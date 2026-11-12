/**
 * Karta SLD-SKALA-I-NAWIGACJA, R5 — znaczniki stanu o stałym rozmiarze ekranowym.
 *
 * Intencja: znak rozstrzygający o topologii i uwadze projektanta (łącznik otwarty, punkt N.O.,
 * zaznaczenie, miejsce zwarcia, przekroczenie w wynikach) nie znika z rysunku razem ze skalą.
 * Testy są ILOCZYNEM cech: {rodzaj znaku} × {drabina skal} × {nośnik rozpoznawalny / nie},
 * {przekroczenie} × {pismo wyników czytelne / nie} (predykat w parze z warstwą liczb wyników),
 * {uziemnik otwarty} (stan normalny — bez znaku), determinizm kolejności wejścia, a na kanwie
 * {NOP} × {skala przeglądu / skala czytania} ścieżką renderu użytkownika.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, type SceneV3 } from '../../scene/buildScene';
import { MIN_SYMBOL_SCREEN_PX, SYMBOL_DEFS, type SymbolId } from '../../symbols/defs';
import { LABEL_TYPOGRAPHY } from '../../core/text';
import { czytelnyNaEkranie } from '../gestoscInformacji';
import { SldCanvasV3, kotwiceWynikow, layoutResultLabels } from '../SldCanvasV3';
import {
  REJESTR_ZNACZNIKOW_STANU,
  nosnikRozpoznawalny,
  nosnikiZnacznikowStanu,
  znacznikiStanu,
  type NosnikZnacznika,
  type RodzajZnacznikaStanu,
} from '../znacznikiStanu';
import { zPunktemPodzialuWStacji } from '../../../../../test/punktPodzialu';
import { kameraNaPunkcieSceny } from './kameraTestowa';
import type { ResultLabelEntry } from '../resultLabels';

afterEach(cleanup);

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json');
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

const SKALE = [0.001, 0.02, 0.1, 0.25, 0.5, 0.63, 0.8, 1, 1.5, 3, 8];
const RODZAJE = Object.keys(REJESTR_ZNACZNIKOW_STANU) as RodzajZnacznikaStanu[];

function nosnik(rodzaj: RodzajZnacznikaStanu, rozmiarSwiata: number, ref = `ref-${rodzaj}`): NosnikZnacznika {
  return { rodzaj, ref, x: 100, y: 200, rozmiarSwiata, severity: rodzaj === 'przekroczenie' ? 'CRITICAL' : undefined };
}

describe('R5 — rejestr znaczników stanu jest danymi', () => {
  it('każdy wpis: klucz = rodzaj, opis polski niepusty, znacznik ≥ próg rozpoznawalności symbolu', () => {
    for (const rodzaj of RODZAJE) {
      const wpis = REJESTR_ZNACZNIKOW_STANU[rodzaj];
      expect(wpis.rodzaj).toBe(rodzaj);
      expect(wpis.opis.length).toBeGreaterThan(0);
      expect(wpis.rozmiarEkranPx).toBeGreaterThanOrEqual(MIN_SYMBOL_SCREEN_PX);
    }
  });

  it('rejestr obejmuje znaki karty, a blokada gotowości nie ma wpisu (kanwa nie dostaje tego stanu — brak fabrykacji)', () => {
    expect(new Set(RODZAJE)).toEqual(
      new Set(['lacznik-otwarty', 'punkt-rozciecia', 'zaznaczenie', 'miejsce-zwarcia', 'przekroczenie']),
    );
  });
});

describe('R5 — ILOCZYN {rodzaj} × {skala}: znacznik wtedy i tylko wtedy, gdy nośnik nierozpoznawalny', () => {
  it('nośnik gabarytowy 16 j.św.: znacznik ⇔ 16·skala < 8 px, średnica na ekranie stała', () => {
    for (const rodzaj of RODZAJE.filter((r) => REJESTR_ZNACZNIKOW_STANU[r].nosnik === 'gabaryt')) {
      for (const skala of SKALE) {
        const wynik = znacznikiStanu([nosnik(rodzaj, 16)], { skala, wynikiCzytelne: true });
        const oczekiwany = 16 * skala < MIN_SYMBOL_SCREEN_PX;
        expect(wynik.length, `${rodzaj} @ ${skala}`).toBe(oczekiwany ? 1 : 0);
        if (oczekiwany) {
          expect(wynik[0].srednicaSwiata * skala).toBeCloseTo(REJESTR_ZNACZNIKOW_STANU[rodzaj].rozmiarEkranPx, 9);
          // Ta sama kotwica świata na każdej skali.
          expect([wynik[0].x, wynik[0].y]).toEqual([100, 200]);
        }
      }
    }
  });

  it('przekroczenie: znacznik ⇔ pismo wyników nieczytelne — niezależnie od skali', () => {
    for (const skala of SKALE) {
      for (const wynikiCzytelne of [true, false]) {
        const wynik = znacznikiStanu([nosnik('przekroczenie', 0)], { skala, wynikiCzytelne });
        expect(wynik.length).toBe(wynikiCzytelne ? 0 : 1);
      }
    }
  });

  it('skala niewiarygodna (0, ujemna, NaN) nie jest dowodem nierozpoznawalności', () => {
    for (const skala of [0, -1, Number.NaN]) {
      expect(nosnikRozpoznawalny(nosnik('lacznik-otwarty', 16), { skala, wynikiCzytelne: true })).toBe(true);
    }
  });

  it('determinizm: kolejność wejścia nie zmienia wyniku (priorytet rysowania, ref, rodzaj)', () => {
    const wejscie = RODZAJE.flatMap((r) => [nosnik(r, 16, 'b'), nosnik(r, 16, 'a')]);
    const a = znacznikiStanu(wejscie, { skala: 0.1, wynikiCzytelne: false });
    const b = znacznikiStanu([...wejscie].reverse(), { skala: 0.1, wynikiCzytelne: false });
    expect(b).toEqual(a);
    const priorytety = a.map((z) => z.wpis.priorytet);
    expect(priorytety).toEqual([...priorytety].sort((x, y) => x - y));
  });
});

describe('R5 — nośniki wyłącznie z danych sceny (stanu się nie wymyśla)', () => {
  function scenaZSymbolami(symbole: readonly { symbolId: SymbolId; state?: 'open' | 'closed' }[]): Pick<SceneV3, 'symbols'> {
    return {
      symbols: symbole.map((s, i) => ({
        symbolId: s.symbolId,
        x: 40 * i,
        y: 0,
        state: s.state,
        meta: { ownerRef: `s${i}` },
      })) as unknown as SceneV3['symbols'],
    };
  }

  it('ILOCZYN {rodzaj łącznika} × {położenie}: znak tylko dla otwartego łącznika toru; uziemnik otwarty to stan normalny', () => {
    const scene = scenaZSymbolami([
      { symbolId: 'breaker', state: 'open' },
      { symbolId: 'breaker', state: 'closed' },
      { symbolId: 'breaker' },
      { symbolId: 'disconnector', state: 'open' },
      { symbolId: 'earthSwitch', state: 'open' },
      { symbolId: 'noPoint' },
    ]);
    const n = nosnikiZnacznikowStanu({ scene });
    expect(n.map((x) => `${x.ref}:${x.rodzaj}`)).toEqual(['s0:lacznik-otwarty', 's3:lacznik-otwarty', 's5:punkt-rozciecia']);
    const def = SYMBOL_DEFS.breaker;
    expect(n[0]).toMatchObject({ x: def.width / 2, y: def.height / 2, rozmiarSwiata: Math.min(def.width, def.height) });
  });

  it('zaznaczenie, zwarcie, przekroczenie: kotwica = środek nośnika, gabaryt = najmniejszy bok', () => {
    const n = nosnikiZnacznikowStanu({
      scene: { symbols: [] },
      zaznaczenia: [{ ref: 'z', rect: { x: 0, y: 0, width: 40, height: 20 } }],
      punktyZwarcia: [{ ownerRef: 'f', x: 5, y: 6 }],
      srednicaKropkiZwarcia: 10,
      przekroczenia: [{ ref: 'p', x: 7, y: 8, severity: 'WARNING' }],
    });
    expect(n).toEqual([
      { rodzaj: 'zaznaczenie', ref: 'z', x: 20, y: 10, rozmiarSwiata: 20 },
      { rodzaj: 'miejsce-zwarcia', ref: 'f', x: 5, y: 6, rozmiarSwiata: 10 },
      { rodzaj: 'przekroczenie', ref: 'p', x: 7, y: 8, rozmiarSwiata: 0, severity: 'WARNING' },
    ]);
  });
});

describe('R5 — przekroczenie w parze z warstwą liczb wyników (jedno źródło decyzji)', () => {
  it('ILOCZYN {skala} × {przekroczenie}: dokładnie jedno z dwojga — liczba wyniku albo znacznik', () => {
    const scene = buildSceneV3(enm);
    const ref = scene.segments.find((s) => s.meta?.ownerRef)?.meta?.ownerRef as string;
    const wpisy: Record<string, ResultLabelEntry> = {
      [ref]: { ownerRef: ref, resultRef: ref, kind: 'branch', severity: 'CRITICAL', lines: [{ prefix: 'obc.', text: '120,0 %' }] },
    };
    const kotwica = kotwiceWynikow(scene, wpisy).get(ref);
    expect(kotwica).toBeDefined();
    let poprzednio: boolean | undefined;
    for (const skala of [...SKALE, ...[...SKALE].reverse()]) {
      const czytelne = czytelnyNaEkranie(LABEL_TYPOGRAPHY.t4.fontSize, skala, poprzednio);
      poprzednio = czytelne;
      const etykiety = layoutResultLabels(scene, wpisy, [], czytelne);
      const liczba = etykiety.placements.length + etykiety.aggregates.length + etykiety.hiddenRefs.length;
      const znaczniki = znacznikiStanu(
        nosnikiZnacznikowStanu({ scene: { symbols: [] }, przekroczenia: [{ ref, x: kotwica!.cx, y: kotwica!.cy, severity: 'CRITICAL' }] }),
        { skala, wynikiCzytelne: czytelne },
      );
      expect(liczba > 0, `skala ${skala}`).toBe(czytelne);
      expect(znaczniki.length, `skala ${skala}`).toBe(czytelne ? 0 : 1);
    }
  });
});

describe('R5 — kanwa: punkt N.O. ma znacznik przy skali przeglądu i nie ma go przy skali czytania', () => {
  const scene0 = buildSceneV3(enm);
  const enmZNop = zPunktemPodzialuWStacji(enm, scene0.meta.mainTrunkStationIds[0]);
  const scene = buildSceneV3(enmZNop);
  const nop = scene.symbols.find((s) => s.symbolId === 'noPoint');

  it('ILOCZYN {skala przeglądu, skala czytania}: znacznik ⇔ symbol poniżej progu, w kotwicy symbolu', () => {
    expect(nop).toBeDefined();
    const def = SYMBOL_DEFS.noPoint;
    const srodek = { x: nop!.x + def.width / 2, y: nop!.y + def.height / 2 };
    const viewport = { width: 1200, height: 800 };
    for (const skala of [0.1, 0.3, 1, 2]) {
      const { container, unmount } = render(
        <SldCanvasV3 snapshot={enmZNop} width={viewport.width} height={viewport.height} cameraOverride={kameraNaPunkcieSceny(scene, srodek, skala, viewport)} />,
      );
      const znaczniki = [...container.querySelectorAll('[data-testid="sld-v3-znacznik-stanu"][data-znacznik-rodzaj="punkt-rozciecia"]')];
      const ponizejProgu = Math.min(def.width, def.height) * skala < MIN_SYMBOL_SCREEN_PX;
      expect(znaczniki.length > 0, `skala ${skala}`).toBe(ponizejProgu);
      if (ponizejProgu) {
        const romb = znaczniki[0].getAttribute('d') ?? '';
        // Romb: górny wierzchołek nad kotwicą symbolu, na wysokości r = 12 px / skala.
        expect(romb.startsWith(`M ${srodek.x} ${srodek.y - 6 / skala}`)).toBe(true);
        expect(znaczniki[0].getAttribute('aria-label')).toBe('Punkt normalnie otwarty (N.O.)');
      }
      unmount();
    }
  });
});
