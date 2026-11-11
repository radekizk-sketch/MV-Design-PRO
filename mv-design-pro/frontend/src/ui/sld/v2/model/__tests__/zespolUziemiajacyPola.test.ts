/**
 * Pole zespołu uziemiającego (ZU) — rysunek z JEDYNEGO nośnika modelu i W041 po stronie rysunku
 * (karty POLA-GPZ-SZABLONY, ZU-JEDEN-NOSNIK; ENEA Zeszyt 1 Z.13–Z.15 s.93–95).
 *
 * DLACZEGO. Transformator uziemiający ZNyn11 jest aparatem pola ZU (wskazany typowanym
 * wyposażeniem pola `Bay.equipment_refs`), nie transformatorem rozdzielczym: rysunek stawiał go
 * jako wieżę transformatora. Jedna funkcja (`poleZespoluTransformatora`) wyklucza go z wież
 * i z transformatorów rozdzielczych (W041, marker) i dokłada do stosu pola ZU; wyposażenie
 * punktu neutralnego (dławik z AWSC, rezystor) czyta typowany `Transformer.hv_neutral`. Jeden
 * nośnik = jeden symbol: przy sekcji nie ma drugiego glifu punktu neutralnego.
 *
 * ILOCZYN CECH: wariant {Z13, Z14, Z15}
 *   × wyposażenie wskazuje transformator w polu {ZU, innej roli}
 *   × zapis dawcy punktu neutralnego (`hv_neutral.dawca`) {jest, brak}
 *   × deklaracja stacji `transformer_refs` {bez transformatora uziemiającego, z nim}
 *   × ścieżka {funkcja widoku, kompozycja GPZ przez adapter (scena), glif}.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { BayModelRole, EnergyNetworkModel, Transformer } from '../../../../../types/enm';
import fx from '../../../../../harness-fixtures/generated/pola_gpz_szablonow.json';
import { buildCanonicalGpzProps } from '../../canvas/enmToCanonicalGpzAdapter';
import { composeGpz, KLASA_ETYKIETY_APARATU_GPZ } from '../../../v3/compose/gpz';
import { measureLabelWidth } from '../../../v3/core/text';
import { SYMBOL_DEFS } from '../../../v3/symbols/defs';
import { buildSceneV3 } from '../../../v3/scene/buildScene';
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

const DLAWIK = { catalog_ref: 'DL_40_400A_15KV_CIAGLY', i_nastawy_a: 100, stan_odlacznika: 'zamkniety' };
const REZYSTOR = { catalog_ref: 'REZ_200A_15KV', r_ohm: 25, stan_odlacznika: 'zamkniety' };
const NOSNIK = {
  Z13: { type: 'petersen_coil', dlawik: { ...DLAWIK, awsc: { i_wymuszany_a: 40 } } },
  Z14: { type: 'petersen_coil', dlawik: DLAWIK, rezystor: REZYSTOR },
  Z15: { type: 'resistor_grounded', rezystor: REZYSTOR },
} as const;

/** Źródło po stronie SN na szynie pola ZU — dawca opisu punktu neutralnego (zapis
 *  `hv_neutral.dawca`; fizyka i rysunek go nie czytają). */
const ZRODLO_SN = {
  ref_id: 'zrodlo-sn-testu',
  name: 'Źródło SN',
  bus_ref: ZU.bus_ref,
  model: 'short_circuit_power',
  sk3_mva: 250,
};

function wariantMigawki(
  wariant: 'Z13' | 'Z14' | 'Z15',
  opcje: { readonly rolaPola?: BayModelRole; readonly bezDawcy?: boolean; readonly zadeklarowany?: boolean } = {},
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
      return {
        ...t,
        hv_neutral: {
          ...NOSNIK[wariant],
          ...(opcje.bezDawcy ? {} : { dawca: { zrodlo_ref: ZRODLO_SN.ref_id, neutral_grounding: { type: 'isolated' } } }),
        } as Transformer['hv_neutral'],
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
  it('fikstura generatora niesie pole ZU, którego wyposażenie wskazuje transformator ZNyn11 z wyposażeniem punktu neutralnego (test nie jest pusty)', () => {
    expect(ZU).toBeDefined();
    expect(TR_ZU).toBeDefined();
    expect(ZU.equipment_refs ?? []).toContain(TR_ZU.ref_id);
    expect(TR_ZU.hv_neutral?.dlawik).toBeTruthy();
    expect(zespolUziemiajacyPola(ZU, BAZA)?.wariant).toBe('Z13');
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
      expect(widok?.awscA).toBe(wariant === 'Z13' ? 40 : null);
      expect(widok?.iNastawyDlawikaA).toBe(wariant === 'Z15' ? null : 100);
      expect(widok?.rOhm).toBe(wariant === 'Z13' ? null : 25);
      expect(widok?.napieciePotrzebWlasnychKv).toBe(0.4);
    });

    for (const [bezDawcy, zadeklarowany] of [[false, false], [true, false], [false, true], [true, true]] as const) {
      it(`${wariant} × zapis dawcy ${bezDawcy ? 'brak' : 'źródło SN'} × deklaracja stacji ${zadeklarowany ? 'z transformatorem' : 'bez'}: transformator w stosie pola ZU, bez wieży, gałąź punktu neutralnego`, () => {
        const enm = wariantMigawki(wariant, { bezDawcy, zadeklarowany });
        expect(selectStationDistributionTransformers(enm, stacjaGpz(enm)).map((t) => t.ref_id)).not.toContain(TR_ZU.ref_id);
        // Przynależność do stacji przez pole zespołu (`Bay.substation_ref`) — z deklaracją i bez.
        expect(transformatoryNalezaceDoStacji(enm, stacjaGpz(enm)).map((t) => t.ref_id)).toContain(TR_ZU.ref_id);
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
        // Jeden nośnik = jeden symbol: przy sekcji brak drugiego glifu punktu neutralnego —
        // niezależnie od zapisu dawcy (zapis pary przenieś/oddaj nie jest nośnikiem).
        const przySekcji = c.symbols.filter((s) => s.meta.testId === 'gpz-canonical-sn-neutral-earthing');
        expect(przySekcji).toHaveLength(0);
        // Podpisy wartości z wyposażenia punktu neutralnego (zero domysłu): nastawa dławika,
        // AWSC dławika (Z.13), R_N rezystora (Z.14, Z.15).
        const teksty = c.labels.fieldDesignations.map((l) => l.text);
        if (wariant === 'Z13') expect(teksty).toContain('dławik 100 A · AWSC 40 A');
        if (wariant === 'Z14') expect(teksty).toEqual(expect.arrayContaining(['dławik 100 A', '$R_{N}$ 25 Ω']));
        if (wariant === 'Z15') expect(teksty).toContain('$R_{N}$ 25 Ω');
        expect(teksty.some((t) => t.includes('AWSC'))).toBe(wariant === 'Z13');
        // Kolumna następnej gałęzi stoi za podpisem wartości poprzedniej (podpis nie nachodzi na
        // aparat sąsiedniej gałęzi).
        const kolumny = wPolu.filter((s) => s.symbolId === 'neutralEarthing').map((s) => s.x).sort((a, b) => a - b);
        if (kolumny.length === 2) {
          // Podpis dławika (na prawo od aparatu) kończy się przed lewą krawędzią aparatu rezystora.
          const szer = SYMBOL_DEFS.neutralEarthing.width;
          expect(kolumny[0] + szer + measureLabelWidth('dławik 100 A', KLASA_ETYKIETY_APARATU_GPZ)).toBeLessThan(kolumny[1]);
        }
        // Kropki węzłów punktu neutralnego: ogranicznik i każde zejście poza ostatnim (narożnik).
        const scena = buildSceneV3(enm, 2);
        const yPrzewodu = scena.segments.find((s) => s.meta?.ownerRef === `${ZU.ref_id}#zespol-punkt-neutralny`)!.points[0].y;
        const kropki = scena.symbols.filter(
          (s) => s.symbolId === 'junction' && String(s.meta?.testId ?? '').endsWith(`-${yPrzewodu}`),
        );
        expect(kropki).toHaveLength(wariant === 'Z14' ? 2 : 1);
        expect(teksty).toContain('ZNyn11 · 100 kVA');
      });
    }

    for (const zadeklarowany of [false, true]) {
    it(`${wariant} × wskazanie w polu innej roli × deklaracja stacji ${zadeklarowany ? 'z transformatorem' : 'bez'}: wykluczenie znika po obu stronach pary (rysunek i W041)`, () => {
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
