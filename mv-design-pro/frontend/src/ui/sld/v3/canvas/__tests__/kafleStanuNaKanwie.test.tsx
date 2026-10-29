/**
 * Dyrektywa właściciela 2026-10-29 „POPRAWA SLD SN" (pkt d, e, h) i rozszerzenie 5 karty
 * UX-04/POLE-LINIOWE-WZORZEC — kafle stanu łączników pola na ŻYWEJ kanwie `SldCanvasV3`
 * (pole liniowe GPZ z fikstury generatora backendu, położenia ustawione na rekordach modelu tak,
 * jak zapisują je operacje).
 *
 * Iloczyn cech: położenie łącznika szynowego Q1 {zamknięty, otwarty, brak rekordu} × wyłącznik
 * Q0 {zamknięty, otwarty} × poziom szczegółu {L0, L1, L2} × motyw {ciemny, jasny} × warstwa
 * {bez nakładki, zaznaczenie pola, energizacja pod napięciem, energizacja bez napięcia}.
 *
 * Asercje (wyrocznia niezależna od kodu kanwy — tabela położenie → kafel z karty):
 *  (d) stan jednoznaczny i spójny między LOD — każdy łącznik narysowany na danym poziomie ma
 *      kafel zgodny z rekordem; ten sam aparat na różnych LOD nigdy nie ma różnych kafli;
 *  (h) geometria identyczna w obu motywach — rysunek po usunięciu atrybutów barwy jest bajt
 *      w bajt ten sam;
 *  (e) cztery warstwy rozdzielone — zaznaczenie nie zmienia kafla, energizacja nie przemalowuje
 *      kafla ani symbolu na kaflu (wynik obliczeń nie udaje stanu łączeniowego).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import type { BayDeviceState, BayPrimaryDevice, Branch, EnergyNetworkModel } from '../../../../../types/enm';
import fxStaly1 from '../../../../../harness-fixtures/generated/pole_liniowe_z10_gpz_staly_w_sekcji_1.json';
import type { ThemeMode } from '../../../../../ui2/theme/themeMode';
import { SldCanvasV3 } from '../SldCanvasV3';
import type { SldV3Overlay } from '../overlay';
import { buildSceneV3, type SceneLod } from '../../scene/buildScene';
import { RODZAJE_LACZNIKOW_POLA } from '../../compose/rodzajeAparatuPola';
import { STATE_COLOR } from '../../theme/colorTokens';

const BAZA = (fxStaly1 as unknown as { snapshot: EnergyNetworkModel }).snapshot;
const W = 1400;
const H = 900;
const LODY: readonly SceneLod[] = [0, 1, 2];
const MOTYWY: readonly ThemeMode[] = ['dark_scada', 'light_technical'];

type StanQ1 = 'zamkniety' | 'otwarty' | 'brak';
type StanQ0 = 'zamkniety' | 'otwarty';
/** Barwy kafla z karty (referencja HMI) — NIEZALEŻNE od palety w kodzie. */
const BARWA: Readonly<Record<'zamkniety' | 'otwarty' | 'nieustalony', string>> = {
  zamkniety: '#C62828',
  otwarty: '#2E7D32',
  nieustalony: '#6B7280',
};

function zPolozeniami(q1: StanQ1, q0: StanQ0): EnergyNetworkModel {
  const kopia = structuredClone(BAZA) as EnergyNetworkModel;
  const rekord = (stan: BayDeviceState) => ({ actual_state: stan }) as NonNullable<BayPrimaryDevice['switch_state']>;
  for (const bay of kopia.bays ?? []) {
    if (!(bay.tags ?? []).includes('gpz_line_field')) continue;
    for (const d of bay.primary_devices ?? []) {
      if (d.designation === 'Q1') d.switch_state = q1 === 'brak' ? null : rekord(q1);
    }
    const galaz = (kopia.branches ?? []).find((g) => g.ref_id === bay.equipment_refs?.[0]) as Branch & { status: string };
    galaz.status = q0 === 'otwarty' ? 'open' : 'closed';
  }
  return kopia;
}

/** Oczekiwany kafel aparatu z rekordu modelu (wyrocznia z karty). */
function kafelOczekiwany(enm: EnergyNetworkModel, bayRef: string, deviceRef: string): keyof typeof BARWA | null {
  const bay = (enm.bays ?? []).find((b) => b.ref_id === bayRef)!;
  const d = (bay.primary_devices ?? []).find((x) => x.device_ref === deviceRef)!;
  if (!RODZAJE_LACZNIKOW_POLA.has(d.kind)) return null;
  if (d.kind === 'CB') {
    const galaz = (enm.branches ?? []).find((g) => g.ref_id === bay.equipment_refs?.[0]) as Branch & { status: string };
    return galaz.status === 'open' ? 'otwarty' : 'zamkniety';
  }
  const stan = d.switch_state?.actual_state;
  if (stan === 'zamkniety') return 'zamkniety';
  if (stan === 'otwarty') return 'otwarty';
  return 'nieustalony';
}

interface Rysunek {
  readonly svg: string;
  readonly kafle: ReadonlyMap<string, { readonly stan: string | null; readonly fill: string | null; readonly glif: readonly string[] }>;
}

function rysuj(
  enm: EnergyNetworkModel,
  lod: SceneLod,
  motyw: ThemeMode,
  extra: { readonly overlay?: SldV3Overlay; readonly zaznaczenieRefy?: readonly string[] } = {},
): Rysunek {
  const { container } = render(
    <SldCanvasV3 snapshot={enm} width={W} height={H} lodOverride={lod} paletteMode={motyw} {...extra} />,
  );
  const kafle = new Map<string, { stan: string | null; fill: string | null; glif: string[] }>();
  for (const g of Array.from(container.querySelectorAll('[data-testid="sld-v3-symbols"] g[data-device-ref]'))) {
    const kafel = g.querySelector('[data-kafel-stanu]');
    kafle.set(`${g.getAttribute('data-owner-ref')}|${g.getAttribute('data-device-ref')}`, {
      stan: kafel?.getAttribute('data-kafel-stanu') ?? null,
      fill: kafel?.querySelector('[data-kafel="tlo"]')?.getAttribute('fill') ?? null,
      glif: kafel
        ? Array.from(kafel.querySelectorAll('[data-symbol-canon] [stroke]')).map((n) => n.getAttribute('stroke') ?? '')
        : [],
    });
  }
  const svg = container.querySelector('svg')!.outerHTML;
  cleanup();
  return { svg, kafle };
}

const polaLiniowe = (enm: EnergyNetworkModel): string[] =>
  (enm.bays ?? []).filter((b) => (b.tags ?? []).includes('gpz_line_field')).map((b) => b.ref_id);

afterEach(() => cleanup());

describe('kafle stanu na kanwie — (d) stan jednoznaczny i spójny na LOD 0/1/2', () => {
  for (const q1 of ['zamkniety', 'otwarty', 'brak'] as const) {
    for (const q0 of ['zamkniety', 'otwarty'] as const) {
      it(`Q1 ${q1} · Q0 ${q0}`, () => {
        const enm = zPolozeniami(q1, q0);
        const naPoziomach = new Map<string, Set<string | null>>();
        let lacznikow = 0;
        for (const lod of LODY) {
          const { kafle } = rysuj(enm, lod, 'dark_scada');
          for (const [klucz, k] of kafle) {
            const [bayRef, deviceRef] = klucz.split('|');
            if (!polaLiniowe(enm).includes(bayRef)) continue;
            const oczekiwany = kafelOczekiwany(enm, bayRef, deviceRef);
            expect(k.stan, `L${lod} ${klucz}`).toBe(oczekiwany);
            expect(k.fill, `L${lod} ${klucz}`).toBe(oczekiwany ? BARWA[oczekiwany] : null);
            if (oczekiwany) lacznikow += 1;
            if (!naPoziomach.has(klucz)) naPoziomach.set(klucz, new Set());
            naPoziomach.get(klucz)!.add(k.stan);
          }
        }
        // Łączniki pól są narysowane co najmniej na poziomie pola (L2).
        expect(lacznikow).toBeGreaterThan(0);
        for (const [klucz, stany] of naPoziomach) expect(stany.size, `${klucz}: jeden kafel na wszystkich LOD`).toBe(1);
      });
    }
  }

  it('scena pola L2 rysuje każdy łącznik toru z kaflem (pokrycie, nie pusty zbiór)', () => {
    const enm = zPolozeniami('otwarty', 'zamkniety');
    const scena = buildSceneV3(enm, 2);
    const { kafle } = rysuj(enm, 2, 'dark_scada');
    for (const bayRef of polaLiniowe(enm)) {
      const laczniki = scena.symbols.filter(
        (s) => s.meta?.ownerRef === bayRef && s.meta?.deviceRef && s.meta.apparatusKind && RODZAJE_LACZNIKOW_POLA.has(s.meta.apparatusKind),
      );
      // Wyrocznia z MODELU: tyle symboli łączników, ile łączników w rekordzie pola (pole Z.10
      // trójpołożeniowe: Q1 + Q0; stałe z odłącznikiem: Q1 + Q0 + Q8) — nie stała liczba.
      const wModelu = ((enm.bays ?? []).find((b) => b.ref_id === bayRef)?.primary_devices ?? []).filter((d) =>
        RODZAJE_LACZNIKOW_POLA.has(d.kind),
      );
      expect(wModelu.length, bayRef).toBeGreaterThanOrEqual(2);
      expect(laczniki.map((s) => s.meta!.deviceRef).sort(), bayRef).toEqual(wModelu.map((d) => d.device_ref).sort());
      for (const s of laczniki) expect(kafle.get(`${bayRef}|${s.meta!.deviceRef}`)?.stan, `${bayRef} ${s.symbolId}`).not.toBeNull();
    }
  });
});

describe('kafle stanu na kanwie — (h) geometria identyczna w obu motywach', () => {
  const bezBarw = (svg: string): string =>
    svg
      .replace(/\s(fill|stroke|stop-color|color|flood-color)="[^"]*"/g, '')
      .replace(/\sstyle="[^"]*"/g, '')
      .replace(/\sdata-theme-mode="[^"]*"/g, '');
  for (const lod of LODY) {
    it(`L${lod}: rysunek ciemny ≡ jasny po usunięciu barw`, () => {
      const enm = zPolozeniami('zamkniety', 'otwarty');
      const [ciemny, jasny] = MOTYWY.map((m) => rysuj(enm, lod, m));
      expect(bezBarw(jasny.svg)).toBe(bezBarw(ciemny.svg));
      // Kafle mają te same barwy w obu motywach (zmienia się tło, nie konwencja).
      expect([...jasny.kafle.entries()]).toEqual([...ciemny.kafle.entries()]);
    });
  }
});

describe('kafle stanu na kanwie — (e) warstwy rozdzielone: zaznaczenie i energizacja nie zmieniają kafla', () => {
  for (const motyw of MOTYWY) {
    for (const q0 of ['zamkniety', 'otwarty'] as const) {
      it(`${motyw} · Q0 ${q0}`, () => {
        const enm = zPolozeniami('zamkniety', q0);
        const pola = polaLiniowe(enm);
        const wzorzec = rysuj(enm, 2, motyw).kafle;
        expect([...wzorzec.values()].some((k) => k.stan !== null)).toBe(true);
        const scena = buildSceneV3(enm, 2);
        const wszystkie = (wartosc: boolean): SldV3Overlay => ({
          energizedByTestId: Object.fromEntries(
            scena.symbols.filter((s) => s.meta?.testId).map((s) => [s.meta!.testId!, wartosc]),
          ),
          energizedByOwnerRef: Object.fromEntries(
            scena.symbols.filter((s) => s.meta?.ownerRef).map((s) => [s.meta!.ownerRef!, wartosc]),
          ),
        });
        const warianty: ReadonlyArray<readonly [string, Parameters<typeof rysuj>[3]]> = [
          ['zaznaczenie pola', { zaznaczenieRefy: pola }],
          ['pod napięciem', { overlay: wszystkie(true) }],
          ['bez napięcia', { overlay: wszystkie(false) }],
        ];
        for (const [nazwa, extra] of warianty) {
          const { kafle } = rysuj(enm, 2, motyw, extra);
          expect([...kafle.entries()], nazwa).toEqual([...wzorzec.entries()]);
          // Symbol na kaflu zawsze w barwie glifu kafla — energizacja go nie przemalowuje.
          for (const k of kafle.values()) for (const s of k.glif) expect(['none', STATE_COLOR.glif], nazwa).toContain(s);
        }
      });
    }
  }
});
