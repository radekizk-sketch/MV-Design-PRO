/**
 * K2b §0.1 (c) i §0.4 — KURTYNA KADRU i TRYB WIDOKU kanwy, na renderze DOM.
 *
 * Kurtyna: kadr celu ≠ sieć przyciemnia KAŻDY obiekt rysunku spoza zakresu celu
 * (`data-kadr="poza"`, krycie `KURTYNA_KADRU_OPACITY`) i nie przyciemnia żadnego
 * obiektu celu. Relacja przynależności jest JEDNA (`nalezyDoZakresu`) — ta sama,
 * z której liczy się prostokąt kadru, tusz etykiet i podłoga opisów celu
 * (predykaty parami, reguła KLASA pkt 3).
 *
 * ILOCZYN CECH: rodzaj obiektu (odcinek · symbol · symbol stacji kadru całej sieci · etykieta) × przynależność
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
import { KURTYNA_KADRU_OPACITY, KURTYNA_KADRU_OPACITY_TEKSTU, SldCanvasV3, segmentTestId, symbolTestId } from '../SldCanvasV3';
import { DARK_SCADA_SLD_PALETTE, LIGHT_TECHNICAL_SLD_PALETTE } from '../../theme/palette';
import { MIN_READABLE_LABEL_SCREEN_PX } from '../../core/text';
import { hierarchiaCelowTrafienia, nalezyDoZakresu, zakresCelu } from '../zakresKadru';
import { stopnieCeluObiektu, testIdObszaruCelu } from '../hitAreas';
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
const hierarchia = hierarchiaCelowTrafienia(enm, scena);

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
    // R8 (karta SLD-SKALA-I-NAWIGACJA): w kadrze całej sieci stacja SN/nN bez rozpoznawalnego
    // aparatu jest SYMBOLEM STACJI (szyna i nogi toru) zamiast swoich odcinków i aparatów —
    // kurtyna obejmuje go tą samą relacją przynależności (ref stacji).
    for (const el of container.querySelectorAll('[data-symbol-stacji="true"]')) {
      const ref = el.getAttribute('data-owner-ref') ?? undefined;
      const nalezy = nalezyDoZakresu(ref, zbior);
      expect(pozaKadru(el), `symbol stacji ${ref}`).toBe(!nalezy);
      if (nalezy) cel += 1;
      else obce += 1;
    }
    expect(cel, 'cel musi mieć narysowane obiekty').toBeGreaterThan(0);
    expect(obce, 'sieć musi mieć obiekty spoza celu').toBeGreaterThan(0);
  });

  it('napis poza celem (tusz zmieszany z tłem kryciem kurtyny) ma kontrast ≥ 4,5:1 w obu motywach; rysunek dalej 0,22', () => {
    // B-02 2026-11-13 (P1-04): opis przewodu sąsiada pod kryciem rysunku miał 1,8:1 na tle ciemnym.
    const kanal = (hex: string, i: number): number => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
    const lum = (k: readonly number[]): number => {
      const l = k.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
    };
    for (const paleta of [DARK_SCADA_SLD_PALETTE, LIGHT_TECHNICAL_SLD_PALETTE]) {
      const tlo = [0, 1, 2].map((i) => kanal(paleta.canvasBackground, i));
      const tusz = [0, 1, 2].map((i) => kanal(paleta.baseStroke, i) * KURTYNA_KADRU_OPACITY_TEKSTU + tlo[i] * (1 - KURTYNA_KADRU_OPACITY_TEKSTU));
      const [jasny, ciemny] = [lum(tusz), lum(tlo)].sort((a, b) => b - a);
      expect((jasny + 0.05) / (ciemny + 0.05), paleta.canvasBackground).toBeGreaterThanOrEqual(4.5);
    }
    expect(KURTYNA_KADRU_OPACITY, 'krycie rysunku (tor, aparaty) bez zmian').toBe(0.22);
  });

  it('etykiety: grupa kurtyny ma krycie KURTYNA_KADRU_OPACITY_TEKSTU, a przyciemnione są dokładnie etykiety właścicieli spoza celu', () => {
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
    for (const k of kurtyny) expect(Number(k.getAttribute('opacity'))).toBe(KURTYNA_KADRU_OPACITY_TEKSTU);
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
      [...container.querySelectorAll('[data-hit-klasa="etykieta"]')].map((n) => n.getAttribute('data-hit-owner-ref')),
    );
    // R4 × R8: tożsamość, której slot jest na ekranie nierozpoznawalny, stoi w podpowiedzi celu
    // wyższego (pole albo stacja z hierarchii R6), który przejmuje jej klik — uchwyt celu
    // (`sld-v3-cel-pole:…`/`sld-v3-cel-stacja:…`) z `<title>` niosącym pełny tekst tożsamości.
    const podpowiedziCelow = new Map(
      [...container.querySelectorAll('[data-hit-klasa="pole"], [data-hit-klasa="stacja"]')].map(
        (n) => [n.getAttribute('data-hit-for')!, (n.querySelector('title')?.textContent ?? '').split('\n')] as const,
      ),
    );
    const tozsamosciCelu = scena.labels.filter(
      (l) => klasaInformacjiEtykiety(l) === 'tozsamosc' && nalezyDoZakresu(l.ownerRef, zbiorCelu),
    );
    expect(tozsamosciCelu.length, 'cel ma tożsamości').toBeGreaterThan(0);
    let wPodpowiedziCelu = 0;
    for (const l of tozsamosciCelu) {
      const wyzsze = stopnieCeluObiektu(hierarchia, l.ownerRef, l.rect)
        .slice(1)
        .map((s) => testIdObszaruCelu(s.poziom as 'pole' | 'stacja', s.ref));
      const wPodpowiedzi = wyzsze.some((id) => podpowiedziCelow.get(id)?.includes(l.text) ?? false);
      if (wPodpowiedzi) wPodpowiedziCelu += 1;
      expect(uchwyty.has(l.ownerRef) || wPodpowiedzi, `${l.ownerRef} „${l.text}"`).toBe(true);
    }
    // Skala przeglądu sieci (pełna sieć na kanwie) — obie drogi muszą być ćwiczone.
    expect(wPodpowiedziCelu, 'część tożsamości celu stoi w podpowiedzi pola/stacji').toBeGreaterThan(0);
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
