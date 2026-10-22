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
import { MIN_OPIS_CELU_KADRU_PX, nalezyDoZakresu, zakresCelu } from '../zakresKadru';
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
  /**
   * K2b×K3: czytelność (b) ma dwa sposoby niespełnienia — opis celu UKRYTY albo
   * NARYSOWANY poniżej podłogi. Wariant „opisy celu widoczne w całości" wolno
   * wybrać WYŁĄCZNIE, gdy oba są zerowe — deklaracja komunikatu przypięta do
   * kanału audytu (`data-min-opis-celu-px`). Iloczyn: LOD {1, 2} × cel {stacja,
   * magistrala — rozległa, pismo poniżej podłogi występuje}.
   */
  const zakresMagistrali = zakresCelu('magistrala', enm, [], scena);
  if (!zakresMagistrali.dostepny) throw new Error(zakresMagistrali.przyczyna);
  const ponizejWDomu: number[] = [];
  it.each([
    [1, 'stacja', refy],
    [2, 'stacja', refy],
    [1, 'magistrala', zakresMagistrali.zakres.refy],
    [2, 'magistrala', zakresMagistrali.zakres.refy],
  ] as const)('L%i, kadr „%s": wariant „celu kadru" ⇔ opis celu ukryty albo poniżej podłogi, inaczej „poza celem kadru"', (lod, _cel, refyCelu) => {
    const { container } = render(<SldCanvasV3 snapshot={enm} width={1440} height={900} lodOverride={lod} refyKadru={refyCelu} />);
    const svg = container.querySelector('svg[data-kadr-aktywny="true"]')!;
    const ukryteCelu = Number(svg.getAttribute('data-ukryte-opisy-celu'));
    const ponizej = Number(svg.getAttribute('data-opisy-celu-ponizej-podlogi'));
    const minPx = Number(svg.getAttribute('data-min-opis-celu-px'));
    expect(Number.isInteger(ponizej)).toBe(true);
    // Para „poniżej podłogi" ↔ „najmniejsze pismo opisu celu": jedno źródło (plan).
    expect(ponizej > 0, `min ${minPx} px, poniżej ${ponizej}`).toBe(minPx < MIN_OPIS_CELU_KADRU_PX - 0.01);
    ponizejWDomu.push(ponizej);
    const k = komunikat(container);
    if (ukryteCelu > 0 || ponizej > 0) {
      expect(k, 'opis celu ukryty albo poniżej podłogi — komunikat obowiązkowy').not.toBeNull();
      expect(k!.celu).toBe(ukryteCelu > 0 ? String(ukryteCelu) : null);
      expect(container.querySelector('[data-testid="sld-v3-hidden-labels-hint"]')!.getAttribute('data-opisy-celu-ponizej-podlogi')).toBe(
        ponizej > 0 ? String(ponizej) : null,
      );
      expect(k!.tekst).toBe(hiddenLabelsHintTextKadru(k!.n, ukryteCelu, ponizej, MIN_OPIS_CELU_KADRU_PX));
    } else if (k !== null) {
      expect(k.celu).toBeNull();
      expect(k.tekst).toBe(hiddenLabelsHintTextPozaCelem(k.n));
    }
  });
  it('przypadek „poniżej podłogi" występuje w iloczynie (test nie jest pusty)', () => {
    expect(ponizejWDomu.some((n) => n > 0)).toBe(true);
  });
});

describe('treść komunikatu kadru celu (czyste funkcje)', () => {
  it('ukryte i poniżej podłogi: oba człony; tylko poniżej podłogi: bez „Ukryto 0"; tylko ukryte: jak dotąd', () => {
    expect(hiddenLabelsHintTextKadru(5, 2, 3, 13)).toBe(
      'Ukryto 5 opisów (celu kadru: 2); opisy celu poniżej 13 px: 3 — cały cel w kadrze; opisy szczegółowe po przybliżeniu',
    );
    expect(hiddenLabelsHintTextKadru(0, 0, 3, 13)).toBe(
      'Opisy celu poniżej 13 px: 3 — cały cel w kadrze; opisy szczegółowe po przybliżeniu',
    );
    expect(hiddenLabelsHintTextKadru(1, 1, 0, 13)).toBe(
      'Ukryto 1 opis (celu kadru: 1) — cały cel w kadrze; opisy szczegółowe po przybliżeniu',
    );
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
