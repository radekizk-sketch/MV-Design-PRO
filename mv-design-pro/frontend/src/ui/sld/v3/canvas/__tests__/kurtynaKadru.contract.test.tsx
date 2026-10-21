/**
 * K2b §0.1 (c) i §0.4 — KURTYNA KADRU i TRYB WIDOKU kanwy, na renderze DOM.
 *
 * Kurtyna: kadr celu ≠ sieć przyciemnia KAŻDY obiekt rysunku spoza zakresu celu
 * (`data-kadr="poza"`, krycie `KURTYNA_KADRU_OPACITY`) i nie przyciemnia żadnego
 * obiektu celu. Relacja przynależności jest JEDNA (`nalezyDoZakresu`) — ta sama,
 * z której liczy się prostokąt kadru, tusz etykiet i podłoga opisów celu
 * (predykaty parami, reguła KLASA pkt 3).
 *
 * ILOCZYN CECH: rodzaj obiektu (odcinek · symbol · etykieta) × przynależność
 * (cel · spoza celu) × kadr (stacja · brak kadru = sieć) × tryb widoku
 * (roboczy · arkusz · domyślny).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3 } from '../../scene/buildScene';
import { KURTYNA_KADRU_OPACITY, SldCanvasV3, segmentTestId, symbolTestId } from '../SldCanvasV3';
import { nalezyDoZakresu, zakresCelu } from '../zakresKadru';
import { hiddenLabelsHintText, hiddenLabelsHintTextKadru, hiddenLabelsHintTextPozaCelem } from '../chromeLayout';

const here = dirname(fileURLToPath(import.meta.url));
const enm = (
  JSON.parse(
    readFileSync(resolve(here, '../../../v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json'), 'utf8'),
  ) as { enm: EnergyNetworkModel }
).enm;
const scena = buildSceneV3(enm, 2);
const stacja = scena.meta.mainTrunkStationIds[2]!;
const zakres = zakresCelu('stacja', enm, [stacja], scena);
if (!zakres.dostepny) throw new Error(zakres.przyczyna);
const refy = zakres.zakres.refy;
const zbior = new Set(refy);

afterEach(() => cleanup());

const pozaKadru = (el: Element) => el.closest('[data-kadr="poza"]') !== null;

describe('kurtyna kadru stacji (L2, DOM)', () => {
  it('odcinki i symbole: przyciemnione dokładnie te spoza zakresu celu', () => {
    const { container } = render(<SldCanvasV3 snapshot={enm} width={1440} height={900} lodOverride={2} refyKadru={refy} />);
    let cel = 0;
    let obce = 0;
    const sprawdz = (testId: string, ownerRef: string | undefined) => {
      for (const el of container.querySelectorAll(`[data-testid="${CSS.escape(testId)}"]`)) {
        const nalezy = nalezyDoZakresu(ownerRef, zbior);
        expect(pozaKadru(el), `${testId} (${ownerRef ?? 'bez właściciela'})`).toBe(!nalezy);
        if (nalezy) cel += 1;
        else obce += 1;
      }
    };
    scena.segments.forEach((s, i) => sprawdz(segmentTestId(s, i), s.meta?.ownerRef));
    scena.symbols.forEach((s, i) => sprawdz(symbolTestId(s, i), s.meta?.ownerRef));
    expect(cel, 'cel musi mieć narysowane obiekty').toBeGreaterThan(0);
    expect(obce, 'sieć musi mieć obiekty spoza celu').toBeGreaterThan(0);
  });

  it('etykiety: grupa kurtyny ma krycie KURTYNA_KADRU_OPACITY, a przyciemnione są dokładnie etykiety właścicieli spoza celu', () => {
    const { container } = render(<SldCanvasV3 snapshot={enm} width={1440} height={900} lodOverride={2} refyKadru={refy} />);
    const warstwa = container.querySelector('[data-testid="sld-v3-labels"]')!;
    const kurtyny = [...warstwa.children].filter((el) => el.getAttribute('data-kadr') === 'poza');
    expect(kurtyny.length).toBeGreaterThan(0);
    // Każda narysowana etykieta: przyciemniona ⇔ jej właściciel spoza zakresu celu.
    let celu = 0;
    for (const el of warstwa.querySelectorAll('[data-owner-ref]')) {
      const nalezy = nalezyDoZakresu(el.getAttribute('data-owner-ref'), zbior);
      expect(pozaKadru(el), el.getAttribute('data-owner-ref')!).toBe(!nalezy);
      if (nalezy) celu += 1;
    }
    expect(celu, 'opisy celu muszą być narysowane').toBeGreaterThan(0);
    for (const k of kurtyny) expect(Number(k.getAttribute('opacity'))).toBe(KURTYNA_KADRU_OPACITY);
    const svg = container.querySelector('svg[data-kadr-aktywny="true"]');
    expect(svg).not.toBeNull();
    // Kanał audytu podłogi opisów celu: liczba ukrytych opisów celu jest jawna.
    expect(svg!.getAttribute('data-ukryte-opisy-celu')).toMatch(/^\d+$/);
  });

  it('bez kadru (sieć, refyKadru puste albo nieobecne): zero kurtyny, zero atrybutów kadru', () => {
    for (const r of [undefined, null, [] as string[]]) {
      const { container } = render(<SldCanvasV3 snapshot={enm} width={1440} height={900} lodOverride={2} refyKadru={r} />);
      expect(container.querySelectorAll('[data-kadr="poza"]')).toHaveLength(0);
      expect(container.querySelector('[data-kadr-aktywny]')).toBeNull();
      expect(container.querySelector('[data-ukryte-opisy-celu]')).toBeNull();
      cleanup();
    }
  });
});

/**
 * K2b §0.2 (b): komunikat ukrytych opisów mówi, CZYJE opisy są ukryte. Iloczyn: kadr
 * {brak · stacja L2 · stacja L1} × opisy celu ukryte {tak · nie}. Liczba w komunikacie
 * zawsze ta sama co w kanale audytu (`data-hidden-count`).
 */
describe('komunikat ukrytych opisów w kadrze celu', () => {
  const komunikat = (container: HTMLElement) => {
    const el = container.querySelector('[data-testid="sld-v3-hidden-labels-hint"]');
    return el ? { tekst: el.textContent, n: Number(el.getAttribute('data-hidden-count')), celu: el.getAttribute('data-opisy-celu') } : null;
  };
  it('bez kadru: komunikat ogólny', () => {
    const { container } = render(<SldCanvasV3 snapshot={enm} width={1440} height={900} lodOverride={2} />);
    const k = komunikat(container)!;
    expect(k.celu).toBeNull();
    expect(k.tekst).toBe(hiddenLabelsHintText(k.n));
  });
  it.each([1, 2] as const)('kadr stacji, L%i: wariant „celu kadru" ⇔ ukryte opisy celu > 0, inaczej „poza celem kadru"', (lod) => {
    const { container } = render(<SldCanvasV3 snapshot={enm} width={1440} height={900} lodOverride={lod} refyKadru={refy} />);
    const k = komunikat(container)!;
    const ukryteCelu = Number(container.querySelector('svg[data-kadr-aktywny="true"]')!.getAttribute('data-ukryte-opisy-celu'));
    if (ukryteCelu > 0) {
      expect(k.celu).toBe(String(ukryteCelu));
      expect(k.tekst).toBe(hiddenLabelsHintTextKadru(k.n, ukryteCelu));
    } else {
      expect(k.celu).toBeNull();
      expect(k.tekst).toBe(hiddenLabelsHintTextPozaCelem(k.n));
    }
  });
});

describe('tryb widoku kanwy: roboczy bez ramy arkusza, arkusz z ramą', () => {
  it.each([
    ['roboczy', false],
    ['arkusz', true],
    [undefined, true],
  ] as const)('tryb %s: rama arkusza %s', (tryb, rama) => {
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={1440} height={900} lodOverride={2} {...(tryb ? { trybWidoku: tryb } : {})} />,
    );
    expect(container.querySelector('[data-testid="sld-sheet-border"]') !== null).toBe(rama);
    expect(container.querySelector('[data-testid="sld-sheet-zone-markers"]') !== null).toBe(rama);
    expect(container.querySelector('[data-testid="sld-sheet-scale-label"]') !== null).toBe(rama);
    // Rysunek sieci jest w obu trybach (ten sam układ współrzędnych).
    expect(container.querySelector('[data-testid="sld-sheet-content"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sld-v3-segments"]')!.children.length).toBeGreaterThan(0);
    expect(container.querySelector('[data-testid="sld-sheet-frame"]')!.getAttribute('data-tryb-widoku')).toBe(tryb ?? 'arkusz');
  });
});
