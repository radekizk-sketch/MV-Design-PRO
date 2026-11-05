/**
 * Pole zespołu uziemiającego (ZU) — rysunek z nośnika modelu i W041 po stronie rysunku
 * (karta POLA-GPZ-SZABLONY; ENEA Zeszyt 1 Z.13–Z.15 s.93–95).
 *
 * DLACZEGO. Transformator uziemiający ZNyn11 jest aparatem pola ZU (zapis pary
 * `Transformer.meta.zespol_uziemiajacy.bay_ref`), nie transformatorem rozdzielczym: rysunek
 * stawiał go jako wieżę transformatora, a przy sekcji glif „sieć izolowana” (źródło-dawca ma
 * `isolated` po przeniesieniu punktu neutralnego) — schemat przeczył modelowi. Jedna funkcja
 * (`poleZespoluTransformatora`) wyklucza go z wież i z transformatorów rozdzielczych (W041,
 * marker) i dokłada do stosu pola ZU.
 *
 * ILOCZYN CECH: wariant {Z13, Z14, Z15}
 *   × zapis pary wskazuje {pole ZU, pole innej roli}
 *   × dawca punktu neutralnego {źródło GPZ, brak}
 *   × deklaracja stacji `transformer_refs` {bez transformatora uziemiającego, z nim}
 *   × ścieżka {funkcja widoku, kompozycja GPZ przez adapter (scena), glif}.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel, Transformer } from '../../../../../types/enm';
import fx from '../../../../../harness-fixtures/generated/pola_gpz_szablonow.json';
import { buildCanonicalGpzProps } from '../../canvas/enmToCanonicalGpzAdapter';
import { composeGpz } from '../../../v3/compose/gpz';
import { Transformer2WGlyph } from '../../../v3/symbols/glyphs';
import { uzwojeniaZGrupyPolaczen } from '../../../v3/symbols/uzwojenia';
import {
  selectStationDistributionTransformers,
  transformatoryNalezaceDoStacji,
} from '../../../../shared/transformatoryStacji';
import { zespolUziemiajacyPola } from '../zespolUziemiajacyPola';

const BAZA = (fx as unknown as { snapshot: EnergyNetworkModel }).snapshot;
const ZU = (BAZA.bays ?? []).find((b) => b.bay_role === 'ZU')!;
const TR_ZU = (BAZA.transformers ?? []).find((t) => t.vector_group === 'ZNyn11')!;
const GPZ = (BAZA.substations ?? []).find((s) => s.station_type === 'gpz')!;

const NOSNIK = {
  Z13: { type: 'petersen_coil', x_ohm: 150, r_ohm: null, awsc_prad_wymuszenia_a: 40 },
  Z14: { type: 'petersen_coil', x_ohm: 150, r_ohm: 25, awsc_prad_wymuszenia_a: 40 },
  Z15: { type: 'resistor_grounded', r_ohm: 25, x_ohm: null },
} as const;

/** Źródło po stronie SN na szynie pola ZU (fikstura GPZ 110 kV ma równoważnik po stronie WN, bez
 *  nośnika SN) — po przeniesieniu punktu neutralnego niesie `isolated`. */
const ZRODLO_SN = {
  ref_id: 'zrodlo-sn-testu',
  name: 'Źródło SN',
  bus_ref: ZU.bus_ref,
  model: 'short_circuit_power',
  sk3_mva: 250,
  neutral_grounding: { type: 'isolated' },
};

function wariantMigawki(
  wariant: 'Z13' | 'Z14' | 'Z15',
  opcje: { readonly rolaPola?: string; readonly bezDawcy?: boolean; readonly zadeklarowany?: boolean } = {},
): EnergyNetworkModel {
  return {
    ...BAZA,
    sources: [...(BAZA.sources ?? []), ZRODLO_SN] as EnergyNetworkModel['sources'],
    // Deklaracja stacji wskazująca transformator uziemiający: pole zespołu wygrywa z deklaracją
    // (backend `transformatory_stacji` krok 1) — bez tej cechy filtr wież byłby nietestowany,
    // bo transformator spoza deklaracji i spoza szyn stacji do GPZ i tak nie należy.
    substations: (BAZA.substations ?? []).map((s) =>
      opcje.zadeklarowany && s.ref_id === GPZ.ref_id
        ? { ...s, transformer_refs: [...(s.transformer_refs ?? []), TR_ZU.ref_id] }
        : s,
    ),
    bays: (BAZA.bays ?? []).map((b) => (b.ref_id === ZU.ref_id && opcje.rolaPola ? { ...b, bay_role: opcje.rolaPola } : b)),
    transformers: (BAZA.transformers ?? []).map((t): Transformer => {
      if (t.ref_id !== TR_ZU.ref_id) return t;
      const meta = (t.meta ?? {}) as Record<string, unknown>;
      const zapis = meta.zespol_uziemiajacy as Record<string, unknown>;
      return {
        ...t,
        hv_neutral: { ...NOSNIK[wariant] } as Transformer['hv_neutral'],
        meta: { ...meta, zespol_uziemiajacy: { ...zapis, wariant, zrodlo_ref: opcje.bezDawcy ? null : ZRODLO_SN.ref_id } },
      };
    }),
  };
}

/** Stacja GPZ z TEJ migawki (deklaracja `transformer_refs` wariantu), nie z bazy. */
function stacjaGpz(enm: EnergyNetworkModel) {
  return (enm.substations ?? []).find((s) => s.ref_id === GPZ.ref_id)!;
}

function kompozycja(enm: EnergyNetworkModel) {
  return composeGpz(buildCanonicalGpzProps(enm, GPZ.ref_id), { x: 0, y: 0 });
}

describe('pole zespołu uziemiającego — rysunek z nośnika', () => {
  it('fikstura generatora niesie pole ZU i transformator ZNyn11 z zapisem pary (test nie jest pusty)', () => {
    expect(ZU).toBeDefined();
    expect(TR_ZU).toBeDefined();
    const zapis = ((TR_ZU.meta ?? {}) as Record<string, { bay_ref?: string }>).zespol_uziemiajacy;
    expect(zapis?.bay_ref).toBe(ZU.ref_id);
  });

  for (const wariant of ['Z13', 'Z14', 'Z15'] as const) {
    it(`${wariant}: widok pola z zapisu i nośnika — gałęzie i wartości z modelu`, () => {
      const enm = wariantMigawki(wariant);
      const widok = zespolUziemiajacyPola(ZU, enm);
      expect(widok?.transformatorRef).toBe(TR_ZU.ref_id);
      expect(widok?.wariant).toBe(wariant);
      expect(widok?.dlawik).toBe(wariant !== 'Z15');
      expect(widok?.rezystor).toBe(wariant !== 'Z13');
      expect(widok?.awsc).toBe(wariant === 'Z13');
      expect(widok?.napieciePotrzebWlasnychKv).toBe(0.4);
    });

    for (const [bezDawcy, zadeklarowany] of [[false, false], [true, false], [false, true], [true, true]] as const) {
      it(`${wariant} × dawca ${bezDawcy ? 'brak' : 'źródło GPZ'} × deklaracja stacji ${zadeklarowany ? 'z transformatorem' : 'bez'}: transformator w stosie pola ZU, bez wieży, gałąź punktu neutralnego`, () => {
        const enm = wariantMigawki(wariant, { bezDawcy, zadeklarowany });
        expect(selectStationDistributionTransformers(enm, stacjaGpz(enm)).map((t) => t.ref_id)).not.toContain(TR_ZU.ref_id);
        if (zadeklarowany) expect(transformatoryNalezaceDoStacji(enm, stacjaGpz(enm)).map((t) => t.ref_id)).toContain(TR_ZU.ref_id);
        const c = kompozycja(enm);
        // Bez wieży transformatora uziemiającego — wieże to wyłącznie transformatory 110/15 kV.
        expect(c.transformers.map((t) => t.transformerRef)).not.toContain(TR_ZU.ref_id);
        const wPolu = c.symbols.filter((s) => s.meta.bayRef === ZU.ref_id);
        const tr = wPolu.filter((s) => s.symbolId === 'transformer2W');
        expect(tr).toHaveLength(1);
        expect(tr[0].uzwojenia).toEqual(uzwojeniaZGrupyPolaczen('ZNyn11'));
        const aparaty = wPolu
          .filter((s) => s.symbolId === 'neutralEarthing')
          .map((s) => s.earthingKind)
          .sort();
        expect(aparaty).toEqual(
          wariant === 'Z13' ? ['coil'] : wariant === 'Z14' ? ['coil', 'resistor'] : ['resistor'],
        );
        // Przekładnik prądowy gałęzi rezystora (wejście Io>, Io>> — Z.14/Z.15).
        const ctGalezi = wPolu.filter((s) => s.meta.testId?.endsWith('zespol-rezystor-przekladnik'));
        expect(ctGalezi).toHaveLength(wariant === 'Z13' ? 0 : 1);
        expect(wPolu.filter((s) => s.symbolId === 'surgeArrester' && s.meta.testId?.includes('zespol-'))).toHaveLength(1);
        expect(wPolu.filter((s) => s.symbolId === 'loadArrow')).toHaveLength(1);
        // Przewód punktu neutralnego zaczyna się na zacisku `punktNeutralny` transformatora.
        const przewod = c.segments.find((s) => s.ownerRef === `${ZU.ref_id}#zespol-punkt-neutralny`);
        expect(przewod?.points[0]).toEqual({ x: tr[0].x + 32, y: tr[0].y + 16 });
        // Glif „sieć izolowana” przy sekcji wyłącznie bez dawcy (źródło zachowało nośnik).
        const przySekcji = c.symbols.filter((s) => s.meta.testId === 'gpz-canonical-sn-neutral-earthing');
        expect(przySekcji).toHaveLength(bezDawcy ? 1 : 0);
        // Podpisy wartości z nośnika (zero domysłu).
        const teksty = c.labels.fieldDesignations.map((l) => l.text);
        if (wariant !== 'Z15') expect(teksty.some((t) => t.startsWith('X_N 150 Ω'))).toBe(true);
        if (wariant !== 'Z13') expect(teksty).toContain('R_N 25 Ω');
        expect(teksty).toContain('ZNyn11 · 100 kVA');
      });
    }

    for (const zadeklarowany of [false, true]) {
    it(`${wariant} × zapis na pole innej roli × deklaracja stacji ${zadeklarowany ? 'z transformatorem' : 'bez'}: wykluczenie znika po obu stronach pary (rysunek i W041)`, () => {
      const enm = wariantMigawki(wariant, { rolaPola: 'OUT', zadeklarowany });
      expect(zespolUziemiajacyPola({ ...ZU, bay_role: 'OUT' }, enm)).toBeNull();
      // Bez pola zespołu transformator podlega zwykłej regule stacji (deklaracja / szyny) —
      // wyłącznie ta reguła rozstrzyga, czy jest transformatorem rozdzielczym (W041) i wieżą.
      const nalezy = transformatoryNalezaceDoStacji(enm, stacjaGpz(enm)).some((t) => t.ref_id === TR_ZU.ref_id);
      expect(selectStationDistributionTransformers(enm, stacjaGpz(enm)).some((t) => t.ref_id === TR_ZU.ref_id)).toBe(nalezy);
      const c = kompozycja(enm);
      expect(c.transformers.some((t) => t.transformerRef === TR_ZU.ref_id)).toBe(nalezy);
      expect(c.symbols.filter((s) => s.meta.bayRef === ZU.ref_id && s.symbolId === 'transformer2W')).toHaveLength(0);
      if (zadeklarowany) expect(nalezy).toBe(true);
    });
    }
  }

  it('w polu ZU transformator nie jest transformatorem rozdzielczym stacji (jedna funkcja z W041)', () => {
    const enm = wariantMigawki('Z13', { zadeklarowany: true });
    expect(selectStationDistributionTransformers(enm, stacjaGpz(enm)).map((t) => t.ref_id)).not.toContain(TR_ZU.ref_id);
  });

  it('glif: wyprowadzenie punktu neutralnego tylko przy zygzaku z N (ZNyn11 tak, YNd11 i Yd11 nie)', () => {
    const svg = (grupa: string) =>
      renderToStaticMarkup(
        createElement('svg', null, createElement(Transformer2WGlyph, { x: 0, y: 0, uzwojenia: uzwojeniaZGrupyPolaczen(grupa) } as never)),
      );
    expect(svg('ZNyn11')).toContain('data-punkt-neutralny="wyprowadzony"');
    expect(svg('YNd11')).not.toContain('data-punkt-neutralny');
    expect(svg('Yd11')).not.toContain('data-punkt-neutralny');
  });
});
