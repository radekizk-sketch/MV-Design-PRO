/**
 * Pole zespołu uziemiającego (ZU) — trzy warianty ENEA Zeszyt 1 Z.13–Z.15 (s.93–95) na scenie
 * (karta UX-04/ROZDZIELNICA-SN-KOREKTA, kryterium K4).
 *
 * Wada z oględzin zrzutu `po/pole-zu-z13-*`: automatyka wymuszania składowej czynnej (AWSC)
 * była dopiskiem do podpisu dławika („dławik · AWSC”) — rysunek nie odróżniał dławika od
 * automatyki, choć Z.13 rysuje rezystor AWSC ze stycznikiem jako osobny obwód.
 *
 * Kontrakt (wyrocznia z ENM, nie z kompozytora):
 *  (a) rozróżnienie aparatów punktu neutralnego wg wariantu z wyposażenia `hv_neutral`:
 *      Z.13 — dławik (glif cewki) i automatyka AWSC (stycznik otwarty w spoczynku + rezystor),
 *      Z.14 — dławik i rezystor uziemiający z przekładnikiem prądowym, bez AWSC,
 *      Z.15 — sam rezystor z przekładnikiem prądowym;
 *  (b) każdy aparat ma WŁASNY podpis: dławik — „dławik …” bez AWSC, AWSC — „AWSC …”,
 *      rezystor — „$R_{N}$ … Ω” albo „rezystor”;
 *  (c) opisy pola ZU (tabliczka transformatora uziemiającego, potrzeby własne, podpisy gałęzi,
 *      oznaczenie przekładnika gałęzi) nie zachodzą na symbol, na inny napis ani na przewód
 *      i leżą w całości w tle pola (obrys pola GPZ).
 * Iloczyn cech: wariant {Z.13, Z.14, Z.15} × poziom szczegółu {1, 2}.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../types/enm';
import { buildSceneV3, labelWireCollisions, type SceneV3 } from '../buildScene';
import { obrysNaScenie, zachodzi, zawiera } from './wyroczniaOpisowPola';

function wczytaj(nazwa: string): EnergyNetworkModel {
  const plik = JSON.parse(readFileSync(`public/test-fixtures/${nazwa}.enm.json`, 'utf8'));
  return plik.enm ?? plik;
}

const WARIANTY = [
  { nazwa: 'gpz110kvPoleZuZ13', dlawik: true, awsc: true, rezystor: false },
  { nazwa: 'gpz110kvPoleZuZ14', dlawik: true, awsc: false, rezystor: true },
  { nazwa: 'gpz110kvPoleZuZ15', dlawik: false, awsc: false, rezystor: true },
] as const;

/** Pole ZU fikstury — z ENM (rola `ZU`). */
function poleZu(enm: EnergyNetworkModel): string {
  const pole = (enm.bays ?? []).find((b) => b.bay_role === 'ZU');
  if (!pole) throw new Error('fikstura bez pola ZU');
  return pole.ref_id;
}

/** Opisy pola ZU objęte kontraktem (c). */
const OPIS_ZU = /#zespol-(tabliczka|potrzeby-wlasne-podpis|dlawik-wartosc|awsc-wartosc|rezystor-wartosc|rezystor-przekladnik-oznaczenie)$/;

function naruszeniaOpisowZu(scena: SceneV3, bay: string): string[] {
  const n: string[] = [];
  const opisy = scena.labels.filter((l) => l.ownerRef.startsWith(`${bay}#`) && OPIS_ZU.test(l.ownerRef));
  const panel = scena.meta.gpzAdnotacje?.panele.find((p) => p.bayRef === bay)?.rect ?? null;
  if (!panel) n.push(`(c) brak tła pola ${bay}`);
  for (const l of opisy) {
    for (const s of scena.symbols) {
      if (zachodzi(l.rect, obrysNaScenie(s))) n.push(`(c) ${l.ownerRef} ∩ symbol ${s.symbolId} ${s.meta?.ownerRef ?? '—'}`);
    }
    for (const inna of scena.labels) {
      if (inna !== l && zachodzi(l.rect, inna.rect)) n.push(`(c) ${l.ownerRef} ∩ napis ${inna.ownerRef}`);
    }
    if (panel && !zawiera(panel, l.rect)) n.push(`(c) ${l.ownerRef} poza tłem pola`);
  }
  for (const k of labelWireCollisions(scena)) {
    if (opisy.some((l) => l.ownerRef === k.ownerRef)) {
      n.push(`(c) ${k.ownerRef} ∩ przewód ${scena.segments[k.segmentIndex].meta?.ownerRef ?? '—'}`);
    }
  }
  return n;
}

describe('pole ZU — dławik / rezystor / automatyka AWSC wg Z.13–Z.15, opisy bez kolizji', () => {
  for (const w of WARIANTY) {
    for (const lod of [1, 2] as const) {
      it(`${w.nazwa} × L${lod}`, () => {
        const enm = wczytaj(w.nazwa);
        const bay = poleZu(enm);
        const scena = buildSceneV3(enm, lod);
        const ogon = scena.symbols.filter((s) => (s.meta?.testId ?? '').includes('-zespol-'));
        // Warunek wstępny: ogon zespołu jest na scenie (pusta wyrocznia = fałszywa pewność).
        expect(ogon.length, 'ogon zespołu').toBeGreaterThan(0);
        const zTestId = (przyrostek: string) => ogon.filter((s) => (s.meta?.testId ?? '').endsWith(`-zespol-${przyrostek}`));
        // (a) aparaty punktu neutralnego.
        const dlawik = zTestId('dlawik-aparat');
        const awsc = zTestId('awsc-aparat');
        const stycznik = zTestId('awsc-stycznik');
        const rezystor = zTestId('rezystor-aparat');
        expect(dlawik.map((s) => s.earthingKind)).toEqual(w.dlawik ? ['coil'] : []);
        expect(awsc.map((s) => s.earthingKind)).toEqual(w.awsc ? ['resistor'] : []);
        expect(stycznik.map((s) => `${s.symbolId}:${s.state}`)).toEqual(w.awsc ? ['loadBreakSwitch:open'] : []);
        expect(rezystor.map((s) => s.earthingKind)).toEqual(w.rezystor ? ['resistor'] : []);
        expect(zTestId('rezystor-przekladnik').length, 'przekładnik gałęzi rezystora').toBe(w.rezystor ? 1 : 0);
        // (b) własny podpis każdego aparatu.
        const podpis = (galaz: string) => scena.labels.find((l) => l.ownerRef === `${bay}#zespol-${galaz}-wartosc`)?.text;
        if (w.dlawik) {
          expect(podpis('dlawik')).toMatch(/^dławik/);
          expect(podpis('dlawik')).not.toContain('AWSC');
        } else {
          expect(podpis('dlawik')).toBeUndefined();
        }
        if (w.awsc) expect(podpis('awsc')).toMatch(/^AWSC/);
        else expect(podpis('awsc')).toBeUndefined();
        if (w.rezystor) expect(podpis('rezystor')).toMatch(/^(\$R_\{N\}\$ .* Ω|rezystor)$/);
        else expect(podpis('rezystor')).toBeUndefined();
        // (c) opisy pola ZU bez kolizji, w tle pola.
        expect(naruszeniaOpisowZu(scena, bay)).toEqual([]);
      });
    }
  }

  it('wyrocznia (c) gryzie: podpis dławika przesunięty na glif dławika', () => {
    const enm = wczytaj('gpz110kvPoleZuZ13');
    const bay = poleZu(enm);
    const scena = buildSceneV3(enm, 2);
    const glif = scena.symbols.find((s) => (s.meta?.testId ?? '').endsWith('-zespol-dlawik-aparat'))!;
    const zle: SceneV3 = {
      ...scena,
      labels: scena.labels.map((l) =>
        l.ownerRef === `${bay}#zespol-dlawik-wartosc` ? { ...l, rect: { ...l.rect, x: glif.x, y: glif.y } } : l,
      ),
    };
    expect(naruszeniaOpisowZu(zle, bay).some((n) => n.includes('dlawik-wartosc ∩ symbol'))).toBe(true);
  });
});
