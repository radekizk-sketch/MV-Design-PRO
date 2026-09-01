/**
 * T5b-4 — PROFESSIONAL VISUAL GRAMMAR (werdykt B-02 6/10, mandat P0-V1..V10,
 * `docs/nn/PLAN_SLD_NN_TOPOLOGIA_2026-08.md`). Testy pokrywają ILOCZYN CECH
 * (reguła KLASA, CLAUDE.md): [fixtura multi × Stacja C] × [dwa viewporty] ×
 * [tryby etykiet] × [stany sprzęgła] — nie pojedynczy przykład z karty.
 */
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { LvDomainView } from '../LvDomainView';
import { composeLvDomainScene } from '../composeLvDomainScene';
import {
  FIT_SCALE_CLAMP,
  OCCUPANCY,
  TYPE_SCREEN_PX,
  fitSceneToViewport,
  paletaNnDlaMotywu,
  plNumber,
  snKvaLabel,
} from '../visualGrammar';
import { ISLAND_DOMAIN_REFS, ISLAND_DOMAIN_UPSTREAM_EQUIVALENTS, ISLAND_DOMAIN_VIEW } from '../fixtures/islandDomain';
import { MULTI_SOURCE_DOMAIN_VIEW, MULTI_SOURCE_PROJECTION, MULTI_SOURCE_UPSTREAM_EQUIVALENTS } from '../fixtures/multiSourceDomain';
import { buildLvDomainProjectionFixture } from '../fixtures/projectionFixture';
import { STATION_BOARD_DOMAIN_VIEW, STATION_BOARD_PROJECTION, STATION_BOARD_REFS, STATION_BOARD_UPSTREAM_EQUIVALENTS } from '../fixtures/stationBoardDomain';
import type { LvDomainGraphView } from '../types';

const refs = STATION_BOARD_REFS;

function withCouplerStatus(status: 'open' | 'closed'): LvDomainGraphView {
  return {
    ...MULTI_SOURCE_DOMAIN_VIEW,
    branches: MULTI_SOURCE_DOMAIN_VIEW.branches.map((b) => (b.ref_id === 'coupler' ? { ...b, status } : b)),
  };
}

describe('P0-V1 — fitSceneToViewport: pasmo occupancy + clamp + centrowanie (czysta funkcja)', () => {
  const SCENES = [
    { name: 'multi', scene: composeLvDomainScene(MULTI_SOURCE_DOMAIN_VIEW, MULTI_SOURCE_UPSTREAM_EQUIVALENTS) },
    { name: 'stationC', scene: composeLvDomainScene(STATION_BOARD_DOMAIN_VIEW, STATION_BOARD_UPSTREAM_EQUIVALENTS) },
  ] as const;
  const VIEWPORTS = [
    { w: 1400, h: 928 },
    { w: 1280, h: 728 },
  ] as const;

  for (const { name, scene } of SCENES) {
    for (const vp of VIEWPORTS) {
      it(`[${name} @ ${vp.w}×${vp.h}] oś wiążąca trafia target occupancy (chyba że clamp), treść wycentrowana`, () => {
        const fit = fitSceneToViewport(scene.width, scene.height, vp.w, vp.h);
        const occX = (fit.s * scene.width) / vp.w;
        const occY = (fit.s * scene.height) / vp.h;
        const clamped = fit.s === FIT_SCALE_CLAMP.min || fit.s === FIT_SCALE_CLAMP.max;
        if (!clamped) {
          const bindingHit =
            Math.abs(occX - OCCUPANCY.xTarget) < 1e-9 || Math.abs(occY - OCCUPANCY.yTarget) < 1e-9;
          expect(bindingHit, `occX=${occX} occY=${occY}`).toBe(true);
        }
        expect(occX).toBeLessThanOrEqual(OCCUPANCY.xTarget + 1e-9);
        expect(occY).toBeLessThanOrEqual(OCCUPANCY.yTarget + 1e-9);
        // Centrowanie w OBU osiach.
        expect(fit.tx).toBeCloseTo((vp.w - fit.s * scene.width) / 2, 9);
        expect(fit.ty).toBeCloseTo((vp.h - fit.s * scene.height) / 2, 9);
      });
    }
  }

  it('clamp MAX: mikroskopijna scena NIE jest rozdmuchana ponad FIT_SCALE_CLAMP.max', () => {
    const fit = fitSceneToViewport(100, 80, 1400, 900);
    expect(fit.s).toBe(FIT_SCALE_CLAMP.max);
  });

  it('clamp MIN: ogromna scena NIE schodzi poniżej FIT_SCALE_CLAMP.min (czytelność rastru ponad „zmieść wszystko")', () => {
    const fit = fitSceneToViewport(20000, 15000, 1400, 900);
    expect(fit.s).toBe(FIT_SCALE_CLAMP.min);
  });

  it('degeneracja (scena/viewport ≤ 0) daje neutralny fit, zero wyjątku', () => {
    expect(fitSceneToViewport(0, 0, 1400, 900)).toEqual({ s: 1, tx: 0, ty: 0 });
    expect(fitSceneToViewport(800, 600, 0, 0)).toEqual({ s: 1, tx: 0, ty: 0 });
  });
});

describe('P0-V2 — typografia SCREEN-STABLE: rozmiar EKRANOWY tekstu nie zależy od skali fitu', () => {
  it('etykieta PRIMARY transformatora ma fontSize·s == TYPE_SCREEN_PX.primary+1 przy DWÓCH różnych viewportach', () => {
    const screenSizes: number[] = [];
    for (const vp of [{ w: 1400, h: 1000 }, { w: 900, h: 700 }]) {
      const { unmount } = render(
        <LvDomainView
          projection={STATION_BOARD_PROJECTION}
          width={vp.w}
          height={vp.h}
        />,
      );
      const s = Number(screen.getByTestId('lv-domain-svg').getAttribute('data-fit-scale'));
      const trNode = screen.getByTestId('lv-domain-node-stnC/T1');
      const nameText = [...trNode.querySelectorAll('text')].find((t) => t.textContent === 'T1');
      expect(nameText).toBeDefined();
      screenSizes.push(Number(nameText!.getAttribute('font-size')) * s);
      unmount();
    }
    expect(screenSizes[0]).toBeCloseTo(TYPE_SCREEN_PX.primary + 1, 6);
    expect(screenSizes[1]).toBeCloseTo(TYPE_SCREEN_PX.primary + 1, 6);
  });
});

describe('P0-V3 — symbol grammar: sylwetka ZA FUNKCJĄ aparatu (type), nie jeden uniwersalny kwadrat', () => {
  const scene = composeLvDomainScene(STATION_BOARD_DOMAIN_VIEW, STATION_BOARD_UPSTREAM_EQUIVALENTS);

  it('breaker → nnBreaker (MCB), switch → loadBreakSwitch (rozłącznik), fuse → nnFuseSwitch (wkładka) — na JEDNEJ fixturze', () => {
    expect(scene.nodes.find((n) => n.ref === refs.qfTr1Ref)?.symbolId).toBe('nnBreaker');
    expect(scene.nodes.find((n) => n.ref === refs.qf01Ref)?.symbolId).toBe('loadBreakSwitch');
    expect(scene.nodes.find((n) => n.ref === 'stnC/QF-RGN2-01')?.symbolId).toBe('nnFuseSwitch');
  });

  it('trzy RÓŻNE sylwetki są realnie w DOM (data-symbol-canon trzech rodzin)', () => {
    render(
      <LvDomainView
        projection={STATION_BOARD_PROJECTION}
        width={1400}
        height={1000}
      />,
    );
    const root = screen.getByTestId('lv-domain-view-root');
    expect(root.querySelector('g[data-symbol-canon="nnBreaker"]')).not.toBeNull();
    expect(root.querySelector('g[data-symbol-canon="loadBreakSwitch"]')).not.toBeNull();
    expect(root.querySelector('g[data-symbol-canon="nnFuseSwitch"]')).not.toBeNull();
  });
});

describe('P0-V4 — DEVICE BASELINE: aparaty odpływów jednej sekcji na JEDNEJ wysokości', () => {
  it('QF-01/QF-02/QF-03 (RGNN-1) mają identyczne Y', () => {
    const scene = composeLvDomainScene(STATION_BOARD_DOMAIN_VIEW, STATION_BOARD_UPSTREAM_EQUIVALENTS);
    const ys = [refs.qf01Ref, refs.qf02Ref, refs.qf03Ref].map((r) => scene.nodes.find((n) => n.ref === r)!.y);
    expect(new Set(ys).size).toBe(1);
  });
});

describe('P0-V5 — hierarchia magistral: MAIN (sekcja korzeniowa) ≠ SUB (podrozdzielnica)', () => {
  it('kompozytor: busTier=main dla hops 0, busTier=sub dla podrozdzielnicy', () => {
    const scene = composeLvDomainScene(MULTI_SOURCE_DOMAIN_VIEW, MULTI_SOURCE_UPSTREAM_EQUIVALENTS);
    expect(scene.nodes.find((n) => n.ref === 'nn_a')?.meta?.busTier).toBe('main');
    expect(scene.nodes.find((n) => n.ref === 'nn_b')?.meta?.busTier).toBe('main');
    expect(scene.nodes.find((n) => n.ref === 'sub_bus')?.meta?.busTier).toBe('sub');
  });

  it('renderer: kreska MAIN grubsza niż SUB (rozpoznawalne bez czytania etykiety)', () => {
    render(
      <LvDomainView
        projection={MULTI_SOURCE_PROJECTION}
        width={1400}
        height={1000}
      />,
    );
    const mainBar = screen.getByTestId('lv-domain-node-nn_a').querySelector('line');
    const subBar = screen.getByTestId('lv-domain-node-sub_bus').querySelector('line');
    expect(Number(mainBar?.getAttribute('stroke-width'))).toBeGreaterThan(Number(subBar?.getAttribute('stroke-width')));
    expect(screen.getByTestId('lv-domain-node-nn_a').getAttribute('data-bus-tier')).toBe('main');
    expect(screen.getByTestId('lv-domain-node-sub_bus').getAttribute('data-bus-tier')).toBe('sub');
  });
});

describe('P0-V6 — sprzęgło: SYMBOL mówi pierwszy (kolor/wypełnienie glifu), tekst stanu drugorzędny; tor NIE przechodzi POD glifem', () => {
  // KOREKTA (karta LOD nN): pin czytał ton ostrzegawczy jako WPISANY hex
  // `#D8B45C`, czyli literał żyjący wyłącznie w rendererze domeny nN, choć
  // kanwa SN ma dla TEGO SAMEGO znaczenia własny token
  // (`highlight.swzUnknown`). Dwa hexy na jedno znaczenie to dokładnie defekt
  // „chaos kolorów", który tokenizacja kanwy SN zamknęła. INTENCJA pinu bez
  // zmian (sprzęgło otwarte NIE jest w tonie bazowym, a słowo stanu dzieli
  // ton z glifem); forma silniejsza — asercja czyta paletę motywu, więc
  // podmiana wartości tokenu nie może już rozjechać glifu z tekstem.
  it('OTWARTE: glif sprzęgła w tonie ostrzegawczym palety, pusty (fill=none); słowo stanu w tym samym tonie', () => {
    render(
      <LvDomainView
        projection={buildLvDomainProjectionFixture({
          graph: withCouplerStatus('open'),
          upstreamEquivalents: MULTI_SOURCE_UPSTREAM_EQUIVALENTS,
        })}
        width={1400}
        height={1000}
      />,
    );
    const couplerNode = screen.getByTestId('lv-domain-node-coupler');
    const paleta = paletaNnDlaMotywu('dark_scada');
    const rect = couplerNode.querySelector('g[data-symbol-canon="nnBreaker"] rect');
    expect(rect?.getAttribute('fill')).toBe('none');
    expect(rect?.getAttribute('stroke')).toBe(paleta.tonOstrzegawczy);
    expect(rect?.getAttribute('stroke')).not.toBe(paleta.kreskaBazowa);
    const stateText = [...couplerNode.querySelectorAll('text')].find((t) => t.textContent === 'OTWARTE');
    expect(stateText?.getAttribute('fill')).toBe(paleta.tonOstrzegawczy);
  });

  it('ZAMKNIĘTE: glif wypełniony bazowo; słowo stanu MUTED (symbol pierwszy, tekst potwierdza — werdykt pkt 14)', () => {
    render(
      <LvDomainView
        projection={buildLvDomainProjectionFixture({
          graph: withCouplerStatus('closed'),
          upstreamEquivalents: MULTI_SOURCE_UPSTREAM_EQUIVALENTS,
        })}
        width={1400}
        height={1000}
      />,
    );
    const couplerNode = screen.getByTestId('lv-domain-node-coupler');
    const rect = couplerNode.querySelector('g[data-symbol-canon="nnBreaker"] rect');
    expect(rect?.getAttribute('fill')).not.toBe('none');
    const stateText = [...couplerNode.querySelectorAll('text')].find((t) => t.textContent === 'ZAMKNIĘTE');
    expect(stateText?.getAttribute('fill')).toBe('#5B6B7A');
  });

  it('krawędź sprzęgła = DWA kikuty z przerwą na glif (ciągłość toru niesie SYMBOL aparatu, nie kreska pod nim)', () => {
    render(
      <LvDomainView
        projection={buildLvDomainProjectionFixture({
          graph: withCouplerStatus('closed'),
          upstreamEquivalents: MULTI_SOURCE_UPSTREAM_EQUIVALENTS,
        })}
        width={1400}
        height={1000}
      />,
    );
    const couplerEdge = screen.getByTestId('lv-domain-edge-coupler');
    const stubs = couplerEdge.querySelectorAll('line');
    expect(stubs.length).toBe(2);
    const [left, right] = [...stubs];
    expect(Number(left.getAttribute('x2'))).toBeLessThan(Number(right.getAttribute('x1')));
  });
});

describe('P0-V7 — dwa tryby etykiet: ENGINEERING (bez nazw zacisków) / AUDYT (nazwy terminali)', () => {
  it('domyślnie (projektowy): nazwy portów modelu („… zacisk wyjściowy") NIE są tekstem kanwy; hover niesie pełną nazwę (title)', () => {
    render(
      <LvDomainView
        projection={STATION_BOARD_PROJECTION}
        width={1400}
        height={1000}
      />,
    );
    const junction = screen.getByTestId(`lv-domain-node-${refs.qf01OutBusRef}`);
    expect([...junction.querySelectorAll('text')]).toEqual([]);
    expect(junction.querySelector('title')?.textContent).toBe('QF-01 zacisk wyjściowy');
    // Kropka zacisku ZOSTAJE (tor ma jawny punkt) — znika tylko mikroopis.
    expect(junction.querySelector('circle')).not.toBeNull();
  });

  it('przełączenie na AUDYT pokazuje nazwy terminali; powrót na projektowe chowa je z powrotem', () => {
    render(
      <LvDomainView
        projection={STATION_BOARD_PROJECTION}
        width={1400}
        height={1000}
      />,
    );
    fireEvent.click(screen.getByTestId('lv-domain-labelmode-audit'));
    const junction = screen.getByTestId(`lv-domain-node-${refs.qf01OutBusRef}`);
    expect([...junction.querySelectorAll('text')].map((t) => t.textContent)).toContain('QF-01 zacisk wyjściowy');
    fireEvent.click(screen.getByTestId('lv-domain-labelmode-engineering'));
    expect([...junction.querySelectorAll('text')]).toEqual([]);
  });
});

describe('P0-V8 — boundary bez wyglądu przycisku: terminal + referencja tekstowa + strzałka + napięcie', () => {
  it('węzeł referencji granicznej NIE renderuje prostokąta (chip-button); niesie nazwę i napięcie zacisku', () => {
    render(
      <LvDomainView
        projection={MULTI_SOURCE_PROJECTION}
        width={1400}
        height={1000}
      />,
    );
    const chip = screen.getByTestId('lv-domain-node-boundary:tie_to_other');
    expect(chip.querySelector('rect')).toBeNull();
    expect(chip.textContent).toContain('Stacja OBCA');
    expect(chip.textContent).toContain('0,4 kV');
    // A11y affordance zostaje (T5c wepnie nawigację) — wygląd nie jest przyciskiem.
    expect(chip.getAttribute('role')).toBe('button');
    // Strzałka referencji na krawędzi linku.
    const link = screen.getByTestId('lv-domain-edge-boundary:tie_to_other#link');
    expect(link.querySelector('path')).not.toBeNull();
  });

  it('kotwica SN jest opisem, nie dominantą (werdykt pkt 12): zero prostokąta, tekst muted', () => {
    render(
      <LvDomainView
        projection={MULTI_SOURCE_PROJECTION}
        width={1400}
        height={1000}
      />,
    );
    const anchor = screen.getByTestId('lv-domain-node-anchor:tr1');
    expect(anchor.querySelector('rect')).toBeNull();
    expect(anchor.querySelector('text')?.getAttribute('fill')).toBe('#5B6B7A');
  });
});

describe('P0-V10 — oś TR → incomer → środek sekcji; generator NA PRAWO od pasa TR', () => {
  it('multi: TR1 dokładnie na osi RGnN-A, TR2 na osi RGnN-B (1×TR = środek kreski)', () => {
    const scene = composeLvDomainScene(MULTI_SOURCE_DOMAIN_VIEW, MULTI_SOURCE_UPSTREAM_EQUIVALENTS);
    expect(scene.nodes.find((n) => n.ref === 'tr1')!.x).toBe(scene.nodes.find((n) => n.ref === 'nn_a')!.x);
    expect(scene.nodes.find((n) => n.ref === 'tr2')!.x).toBe(scene.nodes.find((n) => n.ref === 'nn_b')!.x);
  });

  it('multi: PV1 (źródło nie-TR na tej samej sekcji) siedzi NA PRAWO od osi TR — TR trzyma centrum kompozycji', () => {
    const scene = composeLvDomainScene(MULTI_SOURCE_DOMAIN_VIEW, MULTI_SOURCE_UPSTREAM_EQUIVALENTS);
    const tr1 = scene.nodes.find((n) => n.ref === 'tr1')!;
    const pv1 = scene.nodes.find((n) => n.ref === 'pv1')!;
    expect(pv1.x).toBeGreaterThan(tr1.x);
    // PV nadal w obrębie kreski własnej sekcji (kikut z magistrali, nie z powietrza).
    const nnA = scene.nodes.find((n) => n.ref === 'nn_a')!;
    expect(Math.abs(pv1.x - nnA.x)).toBeLessThanOrEqual(nnA.busBarHalfWidth ?? 0);
  });

  it('Stacja C: oś T1 == oś QF-TR1 (incomer) == środek RGNN-1 (współosiowość toru zasilania, werdykt pkt 18)', () => {
    const scene = composeLvDomainScene(STATION_BOARD_DOMAIN_VIEW, STATION_BOARD_UPSTREAM_EQUIVALENTS);
    const t1 = scene.nodes.find((n) => n.ref === 'stnC/T1')!;
    const incomer = scene.nodes.find((n) => n.ref === refs.qfTr1Ref)!;
    const rgnn1 = scene.nodes.find((n) => n.ref === refs.rgnn1BusRef)!;
    expect(t1.x).toBe(rgnn1.x);
    expect(incomer.x).toBe(rgnn1.x);
  });
});

describe('P0-V10 (klasa) — źródło WŁASNE sekcji nie siada na torze zasilającym tę sekcję', () => {
  // Defekt zmierzony na zrzucie fixtury wysp (karta LOD nN): oś sekcji
  // PODRZĘDNEJ niesie kikut z sekcji rodzica, więc źródło postawione na osi
  // lądowało glifem NA glifie aparatu odpływu rodzica — dwa aparaty w jednym
  // punkcie rysunku. Pin jest KLASOWY: sprawdza WSZYSTKIE pary
  // (źródło × aparat) we WSZYSTKICH fixturach, nie tylko tę jedną parę.
  const SCENY = [
    { nazwa: 'dwie sekcje', scene: composeLvDomainScene(MULTI_SOURCE_DOMAIN_VIEW, MULTI_SOURCE_UPSTREAM_EQUIVALENTS) },
    { nazwa: 'rozdzielnica z incomerem', scene: composeLvDomainScene(STATION_BOARD_DOMAIN_VIEW, STATION_BOARD_UPSTREAM_EQUIVALENTS) },
    { nazwa: 'energizacja i wyspy', scene: composeLvDomainScene(ISLAND_DOMAIN_VIEW, ISLAND_DOMAIN_UPSTREAM_EQUIVALENTS) },
  ] as const;
  /** Minimalny rozstaw dwóch SYLWETEK urządzeń w jednostkach świata. */
  const MIN_ROZSTAW = 60;

  for (const { nazwa, scene } of SCENY) {
    it(`[${nazwa}] żadna para (źródło, aparat) nie stoi w tym samym punkcie rysunku`, () => {
      const zrodla = scene.nodes.filter((n) => n.kind === 'generator' || n.kind === 'transformer');
      const aparaty = scene.nodes.filter((n) => n.kind === 'apparatus');
      for (const zrodlo of zrodla) {
        for (const aparat of aparaty) {
          const rozstaw = Math.abs(zrodlo.x - aparat.x) >= MIN_ROZSTAW || Math.abs(zrodlo.y - aparat.y) >= MIN_ROZSTAW;
          expect(rozstaw, `${zrodlo.ref} (${zrodlo.x},${zrodlo.y}) × ${aparat.ref} (${aparat.x},${aparat.y})`).toBe(true);
        }
      }
    });
  }

  it('sekcja podrzędna z własnym źródłem: źródło stoi OBOK osi (oś należy do kikuta z sekcji rodzica)', () => {
    const scene = composeLvDomainScene(ISLAND_DOMAIN_VIEW, ISLAND_DOMAIN_UPSTREAM_EQUIVALENTS);
    const podrozdzielnicaDer = scene.nodes.find((n) => n.ref === ISLAND_DOMAIN_REFS.podrozdzielniaDBusRef)!;
    const pv = scene.nodes.find((n) => n.ref === ISLAND_DOMAIN_REFS.pvDRef)!;
    const odlacznik = scene.nodes.find((n) => n.ref === ISLAND_DOMAIN_REFS.qsDRef)!;
    expect(pv.x).not.toBe(podrozdzielnicaDer.x);
    expect(odlacznik.x).toBe(podrozdzielnicaDer.x);
    // …i mimo przesunięcia źródło nadal wisi NA kresce swojej sekcji.
    expect(Math.abs(pv.x - podrozdzielnicaDer.x)).toBeLessThanOrEqual(podrozdzielnicaDer.busBarHalfWidth ?? 0);
  });

  it('sekcja KORZENIOWA zachowuje kanon: oś transformatora == środek kreski (zmiana nie objęła sekcji bez rodzica)', () => {
    const scene = composeLvDomainScene(ISLAND_DOMAIN_VIEW, ISLAND_DOMAIN_UPSTREAM_EQUIVALENTS);
    const sekcjaA = scene.nodes.find((n) => n.ref === ISLAND_DOMAIN_REFS.sekcjaABusRef)!;
    const trA = scene.nodes.find((n) => n.ref === ISLAND_DOMAIN_REFS.trARef)!;
    expect(trA.x).toBe(sekcjaA.x);
  });
});

describe('pomocnicze formaty gramatyki (prezentacja, zero fizyki)', () => {
  it('plNumber: przecinek dziesiętny po polsku', () => {
    expect(plNumber(0.4)).toBe('0,4');
    expect(plNumber(15)).toBe('15');
  });

  it('snKvaLabel: 0.63 MVA → „630 kVA" (konwersja jednostki, zaokrąglenie do 1 kVA)', () => {
    expect(snKvaLabel(0.63)).toBe('630 kVA');
    expect(snKvaLabel(1)).toBe('1000 kVA');
  });
});
