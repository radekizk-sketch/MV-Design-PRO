/**
 * Karta GPZ-H5-SLD pkt 4 — GPZ z sekcjami 110 kV jako ILOCZYN CECH, nie przykład z karty.
 *
 * Cechy: sieć {H5 2×2 (dwie sekcje 110 kV, dwa źródła, łącznik 110 kV), równoważnik SN na
 * dwóch sekcjach (bez 110 kV)} ×
 * łącznik 110 kV {otwarty, zamknięty; brak w modelu} × łącznik SN {otwarty, zamknięty} ×
 * wynik {bez wyniku, rozpływ, zwarcie}.
 *
 * Wyrocznie (każda z REKORDÓW modelu, nie z rysunku):
 *  - sekcje 110 kV: na rysunku dokładnie jeden odcinek szyny WN na sekcję
 *    (`gpz_hv_sections`), każdy z refem wyniku równym `bus_ref` SWOJEJ sekcji;
 *  - łączniki szyn: symbol każdego `bus_coupler` w stanie z gałęzi (otwarty ≠ zamknięty);
 *  - źródła: symbol każdego równoważnika sieci, stojący na sekcji swojej szyny;
 *  - transformatory: pod sekcją 110 kV i nad sekcją SN swoich szyn;
 *  - odbiory: symbol każdego odbioru modelu;
 *  - wyniki: bez wyniku — zero etykiet; rozpływ — TR niesie P i Q z kierunkiem WN→SN, każda
 *    szyna sekcji ma etykietę napięcia SWOJEJ szyny; zwarcie — każda szyna sekcji ma Ik″
 *    SWOJEJ szyny.
 * Iniekcje (meldunek karty): jedna szyna WN przy dwóch sekcjach, łącznik narysowany w stanie
 * odwrotnym, pominięte drugie źródło — każda daje czerwień tego pliku.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import type { RawOverlayElement, RawOverlayPayload } from '../../../../sld-overlay/rawResultOverlayStore';
import { buildResultLabelsFromScene } from '../../canvas/resultLabels';
import { KIERUNEK_MOCY_TRANSFORMATORA_PL } from '../../canvas/resultLabelTemplates';
import { SYMBOL_DEFS } from '../../symbols/defs';
import { buildSceneV3, type SceneV3 } from '../buildScene';

const SIECI = ['gpzH5_2x2', 'gpzRownowaznikSn2'] as const;
type Stan = 'open' | 'closed';
type Wynik = 'brak' | 'rozplyw' | 'zwarcie';

function wczytaj(nazwa: string): EnergyNetworkModel {
  return (JSON.parse(readFileSync(`${__dirname}/fixtures/${nazwa}.enm.json`, 'utf8')) as { enm: EnergyNetworkModel }).enm;
}

function lacznikiSekcji(enm: EnergyNetworkModel, pole: 'gpz_hv_sections' | 'gpz_sections'): string[] {
  const refy = new Set<string>();
  for (const st of enm.substations ?? []) {
    for (const s of st[pole] ?? []) {
      if (s.left_coupler_ref) refy.add(s.left_coupler_ref);
      if (s.right_coupler_ref) refy.add(s.right_coupler_ref);
    }
  }
  return [...refy].sort();
}

function zeStanami(enm: EnergyNetworkModel, stany: ReadonlyMap<string, Stan>, normalny: Stan): EnergyNetworkModel {
  return {
    ...enm,
    branches: enm.branches.map((b) =>
      stany.has(b.ref_id) ? { ...b, status: stany.get(b.ref_id)!, normal_state: normalny } : b,
    ),
  } as EnergyNetworkModel;
}

interface Przedzial {
  readonly busRef: string;
  readonly lewo: number;
  readonly prawo: number;
}

/** Odcinki szyn sekcji z rysunku (po klasie odcinka), uporządkowane wzdłuż osi X. */
function przedzialySzyn(scene: SceneV3, przyrostek: '#hv-bus' | '#bus-primary'): Przedzial[] {
  return scene.segments
    .filter((s) => s.meta?.elementKind === 'bus' && s.meta?.ownerRef?.endsWith(przyrostek))
    .map((s) => ({
      busRef: String(s.meta?.busResultRef),
      lewo: Math.min(...s.points.map((p) => p.x)),
      prawo: Math.max(...s.points.map((p) => p.x)),
    }))
    .sort((a, b) => a.lewo - b.lewo);
}

/** Sekcja, na której stoi punkt X: ostatnia sekcja zaczynająca się nie dalej niż X. */
function sekcjaPodX(przedzialy: readonly Przedzial[], x: number): string | null {
  let wynik: string | null = null;
  for (const p of przedzialy) if (p.lewo <= x) wynik = p.busRef;
  return wynik;
}

function srodekSymbolu(scene: SceneV3, ownerRef: string): number {
  const symbole = scene.symbols.filter((s) => s.meta?.ownerRef === ownerRef);
  expect(symbole, `symbol ${ownerRef} narysowany dokładnie raz`).toHaveLength(1);
  return symbole[0].x + SYMBOL_DEFS[symbole[0].symbolId].width / 2;
}

function element(ref: string, kind: string, metrics: RawOverlayElement['metrics']): RawOverlayElement {
  return { ref_id: ref, kind, badges: [], metrics, severity: 'INFO' };
}

function payload(enm: EnergyNetworkModel, wynik: Wynik): RawOverlayPayload | null {
  if (wynik === 'brak') return null;
  const elements: Record<string, RawOverlayElement> = {};
  enm.buses.forEach((b, i) => {
    elements[b.ref_id] =
      wynik === 'rozplyw'
        ? element(b.ref_id, 'bus', { U_kV: { code: 'U_kV', value: b.voltage_kv + i / 100, unit: 'kV', format_hint: 'fixed2' } })
        : element(b.ref_id, 'bus', { IK_3F_A: { code: 'IK_3F_A', value: 10000 + 100 * i, unit: 'A', format_hint: 'fixed0' } });
  });
  if (wynik === 'rozplyw') {
    (enm.transformers ?? []).forEach((t, i) => {
      elements[t.ref_id] = element(t.ref_id, 'transformer', {
        LOADING_PCT: { code: 'LOADING_PCT', value: 40 + i, unit: '%', format_hint: 'fixed1' },
        P_MW: { code: 'P_MW', value: 8.5 + i, unit: 'MW', format_hint: 'fixed2' },
        Q_Mvar: { code: 'Q_Mvar', value: -1.25 - i, unit: 'Mvar', format_hint: 'fixed2' },
      });
    });
  }
  return { run_id: `bieg-${wynik}`, analysis_type: wynik === 'rozplyw' ? 'load_flow' : 'short_circuit', elements };
}

interface Wariant {
  readonly siec: (typeof SIECI)[number];
  readonly wn: Stan | null;
  readonly sn: Stan;
  /** Pozycja normalna łączników szyn (`normal_state`) — cecha niezależna od stanu. */
  readonly norm: Stan;
}

const WARIANTY: Wariant[] = SIECI.flatMap((siec) => {
  const enm = wczytaj(siec);
  const maLacznikWn = lacznikiSekcji(enm, 'gpz_hv_sections').length > 0;
  const stanyWn: (Stan | null)[] = maLacznikWn ? ['open', 'closed'] : [null];
  return stanyWn.flatMap((wn) =>
    (['open', 'closed'] as const).flatMap((sn) => (['open', 'closed'] as const).map((norm) => ({ siec, wn, sn, norm }))),
  );
});

describe('GPZ z sekcjami — iloczyn sieć × łącznik 110 kV × łącznik SN × wynik', () => {
  it('iloczyn niepusty i obejmuje oba stany obu łączników', () => {
    expect(WARIANTY.filter((w) => w.wn === 'open').length).toBeGreaterThan(0);
    expect(WARIANTY.filter((w) => w.wn === 'closed').length).toBeGreaterThan(0);
    expect(WARIANTY.filter((w) => w.wn === null).length).toBeGreaterThan(0);
    expect(new Set(WARIANTY.map((w) => w.sn))).toEqual(new Set(['open', 'closed']));
    // Odstępstwo stanu od pozycji normalnej i zgodność — obie obecne w iloczynie.
    expect(WARIANTY.some((w) => w.sn !== w.norm)).toBe(true);
    expect(WARIANTY.some((w) => w.sn === w.norm)).toBe(true);
  });

  for (const w of WARIANTY) {
    const bazowy = wczytaj(w.siec);
    const lacznikiWn = lacznikiSekcji(bazowy, 'gpz_hv_sections');
    const lacznikiSn = lacznikiSekcji(bazowy, 'gpz_sections');
    const stany = new Map<string, Stan>([
      ...lacznikiWn.map((r) => [r, w.wn ?? 'open'] as [string, Stan]),
      ...lacznikiSn.map((r) => [r, w.sn] as [string, Stan]),
    ]);
    const enm = zeStanami(bazowy, stany, w.norm);
    const scene = buildSceneV3(enm, 2);
    const sekcjeWn = (enm.substations ?? []).flatMap((s) => s.gpz_hv_sections ?? []);
    const sekcjeSn = (enm.substations ?? []).flatMap((s) => s.gpz_sections ?? []);
    const szynyWn = przedzialySzyn(scene, '#hv-bus');
    const szynySn = przedzialySzyn(scene, '#bus-primary');
    const nazwa = `${w.siec} · łącznik 110 kV ${w.wn ?? 'brak'} · łącznik SN ${w.sn} · pozycja normalna ${w.norm}`;

    describe(nazwa, () => {
      it('jeden odcinek szyny 110 kV na sekcję modelu, ref wyniku = szyna sekcji', () => {
        expect(szynyWn.map((p) => p.busRef).sort()).toEqual(sekcjeWn.map((s) => s.bus_ref).sort());
        expect(szynySn.map((p) => p.busRef).sort()).toEqual(sekcjeSn.map((s) => s.bus_ref).sort());
      });

      // Stan łącznika (`status`) i pozycja normalna (`normal_state`) to dwa różne fakty
      // modelu. Karta GPZ-H5-SLD etap 2 (wpis 7 architekta): łącznik szyn GPZ NIE jest
      // punktem podziału — na ŻADNYM poziomie szczegółu nie dostaje znacznika `noPoint` ani
      // podpisu „NO" punktu podziału; pozycja normalna jest drugorzędna w jego własnej
      // symbolice (dana glifu), odstępstwo = ramka glifu. Poprawka P0 koordynatora (werdykt
      // właściciela „oznaczenie stanu normalnego nie może zastępować stanu rzeczywistego"):
      // podpis niesie STAN RZECZYWISTY słownie, pozycję normalną — tylko przy odstępstwie, dwoma
      // wierszami drugorzędnymi (dawny podpis „⟨nazwa⟩ · NO" przy zamkniętym łączniku).
      it('łączniki szyn 110 kV i SN w stanie z gałęzi; pozycja normalna w symbolice łącznika, bez znacznika NO', () => {
        for (const [ref, stan] of stany) {
          const symbole = scene.symbols.filter((s) => s.meta?.ownerRef === ref && s.symbolId !== 'noPoint');
          expect(symbole, `łącznik ${ref} narysowany dokładnie raz`).toHaveLength(1);
          expect(symbole[0].state, `stan łącznika ${ref}`).toBe(stan);
          const galaz = enm.branches.find((b) => b.ref_id === ref) as { normal_state?: string; name?: string } | undefined;
          expect(galaz?.normal_state, `fikstura deklaruje pozycję normalną ${ref}`).toMatch(/^(open|closed)$/);
          expect(symbole[0].pozycjaNormalna, `pozycja normalna łącznika ${ref}`).toBe(galaz?.normal_state);
          const podpis = scene.labels.find((l) => l.ownerRef === `${ref}#designation`);
          expect(podpis?.text, `podpis łącznika ${ref}: nazwa gałęzi i stan rzeczywisty słownie`).toBe(
            `${galaz?.name} · ${stan === 'open' ? 'otwarty' : 'zamknięty'}`,
          );
          const odstepstwo = scene.labels
            .filter((l) => l.ownerRef.startsWith(`${ref}#odstepstwo-`))
            .sort((a, b) => a.ownerRef.localeCompare(b.ownerRef))
            .map((l) => l.text);
          expect(odstepstwo, `wiersze odstępstwa ${ref}`).toEqual(
            stan !== galaz?.normal_state
              ? [galaz?.normal_state === 'open' ? 'normalnie otwarty' : 'normalnie zamknięty', '(odstępstwo)']
              : [],
          );
        }
        for (const lod of [0, 1, 2] as const) {
          const scenaLod = buildSceneV3(enm, lod);
          for (const ref of stany.keys()) {
            expect(
              scenaLod.symbols.filter((s) => s.symbolId === 'noPoint' && s.meta?.ownerRef === ref),
              `L${lod}: łącznik szyn ${ref} bez znacznika punktu podziału`,
            ).toHaveLength(0);
            expect(scenaLod.labels.filter((l) => l.ownerRef === `${ref}#no-point`), `L${lod}: bez podpisu NO ${ref}`).toHaveLength(0);
          }
        }
      });

      it('każdy równoważnik sieci narysowany na sekcji swojej szyny', () => {
        const zrodla = enm.sources ?? [];
        const narysowane = scene.symbols.filter((s) => s.symbolId === 'gridSource').map((s) => s.meta?.ownerRef);
        expect(narysowane.sort()).toEqual(zrodla.map((s) => s.ref_id).sort());
        for (const zr of zrodla) {
          const przedzialy = szynyWn.some((p) => p.busRef === zr.bus_ref) ? szynyWn : szynySn;
          expect(sekcjaPodX(przedzialy, srodekSymbolu(scene, zr.ref_id)), `źródło ${zr.ref_id}`).toBe(zr.bus_ref);
        }
      });

      it('transformator pod swoją sekcją 110 kV i nad swoją sekcją SN', () => {
        for (const t of enm.transformers ?? []) {
          const x = srodekSymbolu(scene, t.ref_id);
          expect(sekcjaPodX(szynyWn, x), `TR ${t.ref_id} — sekcja 110 kV`).toBe(t.hv_bus_ref);
          expect(sekcjaPodX(szynySn, x), `TR ${t.ref_id} — sekcja SN`).toBe(t.lv_bus_ref);
        }
      });

      it('każdy odbiór modelu narysowany', () => {
        const odbiory = scene.symbols.filter((s) => s.symbolId === 'loadArrow');
        expect(odbiory.map((s) => s.meta?.ownerRef).sort()).toEqual((enm.loads ?? []).map((l) => l.ref_id).sort());
      });

      for (const wynik of ['brak', 'rozplyw', 'zwarcie'] as const) {
        it(`wynik: ${wynik}`, () => {
          const etykiety = buildResultLabelsFromScene(scene, payload(enm, wynik), new Set<string>());
          const wpisy = Object.values(etykiety);
          if (wynik === 'brak') {
            expect(wpisy).toEqual([]);
            return;
          }
          const szynySekcji = [...sekcjeWn, ...sekcjeSn].map((s) => s.bus_ref);
          const prefiks = wynik === 'rozplyw' ? 'U' : 'Ik″';
          for (const busRef of szynySekcji) {
            const wpis = wpisy.filter((e) => e.kind === 'bus' && e.resultRef === busRef);
            expect(wpis, `etykieta szyny sekcji ${busRef}`).toHaveLength(1);
            expect(wpis[0].lines.map((l) => l.prefix)).toContain(prefiks);
          }
          for (const t of enm.transformers ?? []) {
            const wpis = etykiety[t.ref_id];
            if (wynik === 'rozplyw') {
              expect(wpis?.lines.map((l) => l.prefix)).toEqual(
                expect.arrayContaining([`P ${KIERUNEK_MOCY_TRANSFORMATORA_PL}`, `Q ${KIERUNEK_MOCY_TRANSFORMATORA_PL}`]),
              );
              expect(wpis!.lines.find((l) => l.prefix.startsWith('Q '))!.text).toMatch(/^−|^-/);
            } else {
              expect(wpis, `zwarcie nie podpisuje TR wielkościami rozpływu (${t.ref_id})`).toBeUndefined();
            }
          }
        });
      }
    });
  }
});
