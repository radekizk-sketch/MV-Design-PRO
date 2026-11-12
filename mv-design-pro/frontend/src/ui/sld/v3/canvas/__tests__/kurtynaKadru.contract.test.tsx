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
import { MIN_READABLE_LABEL_SCREEN_PX } from '../../core/text';
import { nalezyDoZakresu, zakresCelu } from '../zakresKadru';
import { klasaInformacjiEtykiety } from '../gestoscInformacji';

const here = dirname(fileURLToPath(import.meta.url));
const enm = (
  JSON.parse(
    readFileSync(resolve(here, '../../../v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json'), 'utf8'),
  ) as { enm: EnergyNetworkModel }
).enm;
const scena = buildSceneV3(enm);
const stacja = scena.meta.mainTrunkStationIds[2]!;
const zakres = zakresCelu('stacja', enm, [stacja], scena);
if (!zakres.dostepny) throw new Error(zakres.przyczyna);
const refy = zakres.zakres.refy;
const zbior = new Set(refy);

afterEach(() => cleanup());

const pozaKadru = (el: Element) => el.closest('[data-kadr="poza"]') !== null;

describe('kurtyna kadru stacji (L2, DOM)', () => {
  it('odcinki i symbole: przyciemnione dokładnie te spoza zakresu celu', () => {
    const { container } = render(<SldCanvasV3 snapshot={enm} width={1440} height={900} refyKadru={refy} />);
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
    const { container } = render(<SldCanvasV3 snapshot={enm} width={1440} height={900} refyKadru={refy} />);
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
    // Kanał audytu podłogi opisów celu (R4 karty SLD-SKALA-I-NAWIGACJA): opis celu nie znika,
    // więc dawny licznik ukrytych opisów nie istnieje — jawne jest najmniejsze pismo opisu celu.
    expect(svg!.hasAttribute('data-ukryte-opisy-celu')).toBe(false);
    expect(Number(svg!.getAttribute('data-min-opis-celu-px'))).toBeGreaterThanOrEqual(MIN_READABLE_LABEL_SCREEN_PX - 0.01);
  });

  it('bez kadru (sieć, refyKadru puste albo nieobecne): zero kurtyny, zero atrybutów kadru', () => {
    for (const r of [undefined, null, [] as string[]]) {
      const { container } = render(<SldCanvasV3 snapshot={enm} width={1440} height={900} refyKadru={r} />);
      expect(container.querySelectorAll('[data-kadr="poza"]')).toHaveLength(0);
      expect(container.querySelector('[data-kadr-aktywny]')).toBeNull();
      expect(container.querySelector('[data-min-opis-celu-px]')).toBeNull();
      cleanup();
    }
  });
});

/**
 * K2b §0.2 (b): komunikat ukrytych opisów mówi, CZYJE opisy są ukryte. Iloczyn: kadr
 * {brak · stacja L2 · stacja L1} × opisy celu ukryte {tak · nie}. Liczba w komunikacie
 * zawsze ta sama co w kanale audytu (`data-hidden-count`).
 */
/**
 * K2b×K3 po karcie SLD-SKALA-I-NAWIGACJA (R3, R4). INTENCJA dawnego „komunikatu ukrytych opisów
 * w kadrze celu": projektant nie może przeoczyć, że opisu celu nie widać. Kanon zmienił środek,
 * nie cel: licznika „Ukryto N opisów" nie ma, bo tożsamość celu NIE ZNIKA — stoi w całości na
 * rysunku albo w podpowiedzi uchwytu w miejscu slotu, a pismo narysowanej tożsamości nie schodzi
 * poniżej progu czytelności. Iloczyn: cel {stacja, magistrala — rozległa} × kanwa
 * {1440 × 900, 1024 × 640}.
 */
describe('tożsamość celu kadru nie znika i nie ma licznika ukrytych opisów', () => {
  const zakresMagistrali = zakresCelu('magistrala', enm, [], scena);
  if (!zakresMagistrali.dostepny) throw new Error(zakresMagistrali.przyczyna);
  const przypadki = ([[1440, 900], [1024, 640]] as const).flatMap(([szer, wys]) =>
    ([
      ['stacja', refy],
      ['magistrala', zakresMagistrali.zakres.refy],
    ] as const).map(([cel, refyCelu]) => [cel, szer, wys, refyCelu] as const),
  );
  it.each(przypadki)('kadr „%s", kanwa %i × %i: każda tożsamość celu ma uchwyt, pismo narysowanej ≥ próg, zero licznika', (_cel, szer, wys, refyCelu) => {
    const { container } = render(<SldCanvasV3 snapshot={enm} width={szer} height={wys} refyKadru={refyCelu} />);
    expect(container.querySelector('[data-testid="sld-v3-hidden-labels-hint"]')).toBeNull();
    expect(container.textContent ?? '').not.toContain('Ukryto');
    const zbiorCelu = new Set(refyCelu);
    const uchwyty = new Set(
      [...container.querySelectorAll('[data-hit-role="obrys"][data-hit-klasa="etykieta"]')].map((n) => n.getAttribute('data-hit-owner-ref')),
    );
    const tozsamosciCelu = scena.labels.filter(
      (l) => klasaInformacjiEtykiety(l) === 'tozsamosc' && nalezyDoZakresu(l.ownerRef, zbiorCelu),
    );
    expect(tozsamosciCelu.length, 'cel ma tożsamości').toBeGreaterThan(0);
    for (const l of tozsamosciCelu) expect(uchwyty.has(l.ownerRef), `${l.ownerRef} „${l.text}"`).toBe(true);
    const svg = container.querySelector('svg[data-kadr-aktywny="true"]')!;
    const minPx = Number(svg.getAttribute('data-min-opis-celu-px'));
    expect(minPx).toBeGreaterThanOrEqual(MIN_READABLE_LABEL_SCREEN_PX - 0.01);
  });
});

describe('tryb widoku kanwy: roboczy bez ramy arkusza, arkusz z ramą', () => {
  it.each([
    ['roboczy', false],
    ['arkusz', true],
    [undefined, true],
  ] as const)('tryb %s: rama arkusza %s', (tryb, rama) => {
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={1440} height={900} {...(tryb ? { trybWidoku: tryb } : {})} />,
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
