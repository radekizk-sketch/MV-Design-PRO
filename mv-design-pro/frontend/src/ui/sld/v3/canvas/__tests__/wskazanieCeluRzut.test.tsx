/**
 * Wejścia na schemat (zlecenie architekta 2026-11-12 w granicy karty SLD-SKALA-I-NAWIGACJA,
 * wymaganie przypięte e2e `celWKadrze` w `e2e/wejscia-na-schemat.spec.ts`):
 *
 * (1) Cel bez własnego rysunku (stacja `stn/<id>/station`, GPZ `…/substation`, szyna SN i nN
 *     stacji) ma obrys zaznaczenia RZUTU — z tej samej reguły zakresu, którą kadruje go
 *     wskazanie kamery (`zakresCelu('zaznaczenie', …)`). ILOCZYN {cel: aparat, pole (własny rysunek),
 *     szyna SN, stacja, GPZ, szyna nN (rzut), ref nieznany (brak obrysu)}.
 * (2) Kurtyna kadru przygasza wyłącznie otoczenie NARYSOWANEGO celu; cel bez rysunku nie
 *     przygasza niczego. ILOCZYN {cel narysowany, cel nienarysowany}.
 * (3) Wskazanie celu z projekcji nN (`WskazanieSld.projekcja === 'nn'`) otwiera portal nN stacji
 *     celu. ILOCZYN {projekcja nN, SN} × {tryb kadruj, kotwicz}.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { useAppStateStore } from '../../../../app-state';
import { useSelectionStore } from '../../../../selection';
import { useSnapshotStore } from '../../../../topology/snapshotStore';
import { buildSceneV3 } from '../../scene/buildScene';
import { obrysyZaznaczenia } from '../obrysZaznaczenia';
import { SldCanvasV3 } from '../SldCanvasV3';
import { SldCanvasV3Workspace } from '../SldCanvasV3Workspace';
import { nalezyDoZakresu, zakresCelu } from '../zakresKadru';

const here = dirname(fileURLToPath(import.meta.url));
const enm = (
  JSON.parse(readFileSync(resolve(here, '../../../v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json'), 'utf8')) as {
    readonly enm: EnergyNetworkModel;
  }
).enm;
const scene = buildSceneV3(enm);
const rzut = (ref: string) => {
  const w = zakresCelu('zaznaczenie', enm, [ref], scene);
  return w.dostepny ? w.zakres.refy : [];
};

const stacja = enm.substations.find((s) => s.ref_id.startsWith('stn/'))!.ref_id;
const gpz = enm.substations.find((s) => s.ref_id.startsWith('gpz/'))!.ref_id;
const szynaNn = enm.buses.find((b) => b.ref_id === stacja.replace('/station', '/nn_bus'))!.ref_id;
const pole = scene.symbols.find((s) => s.meta?.ownerRef?.startsWith(stacja.replace('/station', '/sn_field/')))!.meta!.ownerRef!;
const aparat = scene.symbols.find((s) => s.meta?.deviceRef)!.meta!.deviceRef!;
const szynaSn = enm.buses.find((b) => b.ref_id === stacja.replace('/station', '/sn_bus'))!.ref_id;

describe('(1) obrys zaznaczenia: ILOCZYN {cel} — własny rysunek albo rzut reguły wskazania', () => {
  const przypadki: readonly (readonly [string, string, 'wlasny' | 'rzut' | 'brak'])[] = [
    ['aparat', aparat, 'wlasny'],
    ['pole', pole, 'wlasny'],
    // Szyna SN rysowana odcinkiem sekcji `szyna#sn-bus` — rzut na kompozyt sekcji.
    ['szyna SN', szynaSn, 'rzut'],
    ['stacja', stacja, 'rzut'],
    ['GPZ', gpz, 'rzut'],
    ['szyna nN', szynaNn, 'rzut'],
    ['ref nieznany', 'stn/nieistniejaca/station', 'brak'],
  ];
  for (const [nazwa, ref, oczekiwany] of przypadki) {
    it(`${nazwa}: ${oczekiwany}`, () => {
      const obrysy = obrysyZaznaczenia(scene, [ref], rzut);
      if (oczekiwany === 'brak') {
        expect(obrysy).toHaveLength(0);
        return;
      }
      expect(obrysy).toHaveLength(1);
      expect(obrysy[0].ref).toBe(ref);
      expect(obrysy[0].rzut).toBe(oczekiwany === 'rzut');
      // Obrys obejmuje każdy narysowany obiekt rzutu (ta sama relacja co kurtyna kadru).
      const zbior = new Set(oczekiwany === 'rzut' ? rzut(ref) : [ref]);
      const r = obrysy[0].rect;
      let objete = 0;
      for (const s of scene.segments) {
        if (oczekiwany === 'rzut' ? !nalezyDoZakresu(s.meta?.ownerRef, zbior) : s.meta?.ownerRef !== ref) continue;
        objete += 1;
        for (const p of s.points) {
          expect(p.x).toBeGreaterThanOrEqual(r.x);
          expect(p.x).toBeLessThanOrEqual(r.x + r.width);
          expect(p.y).toBeGreaterThanOrEqual(r.y);
          expect(p.y).toBeLessThanOrEqual(r.y + r.height);
        }
      }
      if (oczekiwany === 'rzut') expect(objete).toBeGreaterThan(0);
      // Bez rzutu (dawna reguła) cel bez rysunku nie ma obrysu.
      if (oczekiwany === 'rzut') expect(obrysyZaznaczenia(scene, [ref])).toHaveLength(0);
    });
  }

  it('szyna nN rzutuje się na kompozyt szyny nN stacji (`stacja#lv-bus`)', () => {
    expect(rzut(szynaNn)).toContain(`${stacja}#lv-bus`);
    expect(scene.segments.some((s) => s.meta?.ownerRef === `${stacja}#lv-bus`)).toBe(true);
  });

  it('kanwa: obrys rzutu ma `data-zaznaczenie-ref` celu i znacznik rzutu', () => {
    const { container } = render(<SldCanvasV3 snapshot={enm} width={1200} height={800} zaznaczenieRefy={[stacja]} />);
    const obrys = container.querySelector(`[data-testid="sld-v3-zaznaczenie"] [data-zaznaczenie-ref="${stacja}"]`);
    expect(obrys).not.toBeNull();
    expect(obrys!.getAttribute('data-rzut-celu')).toBe('true');
  });
});

describe('(2) kurtyna kadru: ILOCZYN {cel narysowany, cel nienarysowany}', () => {
  it('cel narysowany: otoczenie pod kurtyną, cel nie', () => {
    const refy = rzut(stacja);
    const { container } = render(<SldCanvasV3 snapshot={enm} width={1200} height={800} refyKadru={refy} />);
    expect(container.querySelectorAll('[data-kadr="poza"]').length).toBeGreaterThan(0);
    const zbior = new Set(refy);
    for (const el of container.querySelectorAll('[data-kadr="poza"] [data-owner-ref]')) {
      expect(nalezyDoZakresu(el.getAttribute('data-owner-ref'), zbior), el.getAttribute('data-owner-ref') ?? '').toBe(false);
    }
  });

  it('cel bez rysunku: nic pod kurtyną (schemat nie gaśnie)', () => {
    const { container } = render(<SldCanvasV3 snapshot={enm} width={1200} height={800} refyKadru={['stn/nieistniejaca/station']} />);
    expect(container.querySelectorAll('[data-kadr="poza"]')).toHaveLength(0);
  });
});

describe('(3) wskazanie celu z projekcji nN: ILOCZYN {nN, SN} × {kadruj, kotwicz}', () => {
  beforeEach(() => {
    useSnapshotStore.getState().reset();
    useSelectionStore.getState().clearSelection();
    useSnapshotStore.setState({ snapshot: enm });
    useAppStateStore.setState({ activeCaseId: 'case-wskazanie-nn' });
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise<Response>(() => {})));
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  for (const [ref, nn] of [
    [szynaNn, true],
    [stacja, false],
  ] as const) {
    for (const tryb of ['kadruj', 'kotwicz'] as const) {
      it(`${nn ? 'nN' : 'SN'} × ${tryb}`, () => {
        render(<SldCanvasV3Workspace width={1200} height={800} />);
        act(() => useSelectionStore.getState().centerSldOnElement(ref, tryb));
        expect(useSelectionStore.getState().sldWskazanie?.projekcja).toBe(nn ? 'nn' : 'sn');
        const portal = screen.queryByTestId('lv-domain-portal');
        if (nn && tryb === 'kadruj') expect(portal).toHaveAttribute('data-station-ref', stacja);
        else expect(portal).toBeNull();
      });
    }
  }
});
