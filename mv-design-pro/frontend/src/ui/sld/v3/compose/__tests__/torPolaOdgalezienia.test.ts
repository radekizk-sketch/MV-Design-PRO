/**
 * Karta UX-04/POLE-LINIOWE-WZORZEC, rozszerzenie 4 — odgałęzienie toru pola z portów
 * (`torPolaZPortow`, `rekordyToruPola`, `planApparatusSymbolIds`, `bayApparatusPlanFootprint`).
 *
 * PO CO. Backend rozstrzyga, które aparaty pola leżą POZA torem głównym
 * (`network_model/catalog/rodzaje_aparatury.py::aparaty_poza_torem_glownym` — reguły blokad
 * i zasilenia), a schemat — które rysuje w kolumnie odgałęzienia. Reguła jest jedna („tor główny
 * = jedyna droga aparatów dwuportowych od szyny do węzła końca toru"), implementacje dwie; ten
 * test czyta fiksturę wygenerowaną Z WYNIKU BACKENDU
 * (`backend/tests/ci/test_parytet_toru_glownego_pola.py` — strażnik równości fikstury z backendem)
 * i sprawdza, że front daje dla każdego przypadku ten sam zbiór aparatów odgałęzień.
 *
 * ILOCZYN CECH: wykonanie pola {Z.10, Z.11.1, Z.11} × wykonanie łączników {trójpołożeniowy,
 * stały z odłącznikiem, wysuwny} (9 szablonów rejestru) × iniekcje {dwie drogi do końca toru,
 * brak drogi do końca toru, odgałęzienie od szyny} × kolejność danych {jak w szablonie,
 * odwrócona}. Dodatkowo: drugie wyjście z węzła odgałęzienia (brak z przyczyną), plan
 * i gabaryt pola z odgałęzieniem.
 */
import { describe, expect, it } from 'vitest';

import type { BayPrimaryDeviceKind, BayPrimaryPlacement } from '../../../../../types/enm';
import {
  bayApparatusPlanFootprint,
  czyAparatBoczny,
  pasOdgalezienia,
  planApparatusSymbolIds,
  polozeniaToruGlownego,
  rekordyToruPola,
  symbolAparatuPola,
  torPolaZPortow,
  type AparatSekwencjiPola,
} from '../apparatusSequence';
import { APPARATUS_STACK_VERTICAL_GAP } from '../../layout/apparatusStack';
import { SYMBOL_DEFS } from '../../symbols/defs';
import przypadki from './fixtures/parytet_toru_glownego.json';

interface PrzypadekParytetu {
  readonly nazwa: string;
  readonly aparaty: readonly {
    readonly designation: string;
    readonly kind: string;
    readonly placement: string;
    readonly render_variant: string | null;
    readonly ports: readonly { readonly port_id: string; readonly wezel: string | null }[];
  }[];
  readonly poza_torem_glownym: readonly string[];
}

const PRZYPADKI = przypadki as readonly PrzypadekParytetu[];

/** Rekord backendu → widok aparatu frontu (ten sam kształt, co adapter `widokPolStacji`). */
function aparaty(p: PrzypadekParytetu): AparatSekwencjiPola[] {
  return p.aparaty.map((a) => ({
    kind: a.kind as BayPrimaryDeviceKind,
    placement: a.placement as BayPrimaryPlacement,
    deviceRef: a.designation,
    renderVariant: a.render_variant,
    ports: a.ports.map((port) => ({ portId: port.port_id, wezel: port.wezel })),
  }));
}

const zSymbolem = (lista: readonly AparatSekwencjiPola[]) => lista.filter((d) => symbolAparatuPola(d) != null);
const refy = (lista: readonly AparatSekwencjiPola[]) => lista.map((d) => d.deviceRef!);
const przypadek = (nazwa: string) => PRZYPADKI.find((p) => p.nazwa === nazwa)!;

describe('parytet toru głównego backend ↔ schemat (fikstura z wyniku backendu)', () => {
  it('fikstura niesie 9 szablonów i 3 iniekcje', () => {
    expect(PRZYPADKI.filter((p) => p.nazwa.startsWith('bay_template_gpz_line_enea_'))).toHaveLength(9);
    expect(PRZYPADKI.filter((p) => p.nazwa.startsWith('iniekcja_'))).toHaveLength(3);
  });

  for (const p of PRZYPADKI) {
    for (const odwrocona of [false, true]) {
      it(`${p.nazwa}${odwrocona ? ' (kolejność danych odwrócona)' : ''}: aparaty odgałęzień = backend`, () => {
        const wejscie = zSymbolem(aparaty(p));
        const { galezie, braki, kolejnosc } = torPolaZPortow(odwrocona ? [...wejscie].reverse() : wejscie);
        expect(refy(galezie.flatMap((g) => g.aparaty)).sort(), p.nazwa).toEqual([...p.poza_torem_glownym].sort());
        // Każdy aparat raz w kolejności rysunku; tor główny przed odgałęzieniami.
        expect(refy(kolejnosc).sort()).toEqual(refy(wejscie).sort());
        const wGalezi = new Set(refy(galezie.flatMap((g) => g.aparaty)));
        const pierwszyGalezi = kolejnosc.findIndex((d) => wGalezi.has(d.deviceRef!));
        if (pierwszyGalezi >= 0) {
          expect(kolejnosc.slice(pierwszyGalezi).every((d) => wGalezi.has(d.deviceRef!) || braki.some((b) => b.deviceRef === d.deviceRef))).toBe(
            true,
          );
        }
        const niejednoznaczny = braki.filter((b) => b.przyczyna.includes('tor główny niejednoznaczny'));
        if (p.nazwa === 'iniekcja_dwie_drogi_do_konca_toru' || p.nazwa === 'iniekcja_brak_drogi_do_konca_toru') {
          // Tor niejednoznaczny: brak wniosku (jak backend) i JAWNY brak z przyczyną.
          expect(galezie).toEqual([]);
          expect(niejednoznaczny.length, p.nazwa).toBeGreaterThan(0);
        } else {
          expect(braki, p.nazwa).toEqual([]);
        }
      });
    }
  }
});

describe('odgałęzienie przekładnika napięciowego Z.11.1/Z.11 — obchód, plan, gabaryt', () => {
  it('kolejność odgałęzienia: łącznik, jego uziemnik, głowica, przekładnik; kotwica = węzeł za wyłącznikiem', () => {
    const { galezie } = torPolaZPortow(zSymbolem(aparaty(przypadek('bay_template_gpz_line_enea_z11_1_staly_z_odlacznikiem'))));
    expect(galezie).toHaveLength(1);
    expect(refy(galezie[0].aparaty)).toEqual(['Q5', 'Q51', 'GK1', 'T3']);
    const q0 = przypadek('bay_template_gpz_line_enea_z11_1_staly_z_odlacznikiem').aparaty.find((a) => a.designation === 'Q0')!;
    expect(galezie[0].wezel).toBe(q0.ports.find((port) => port.port_id === 'wy')!.wezel);
  });

  it('odgałęzienie od węzła szyny: kotwica szyna', () => {
    const { galezie } = torPolaZPortow(zSymbolem(aparaty(przypadek('iniekcja_odgalezienie_od_szyny'))));
    expect(galezie.map((g) => g.wezel)).toEqual(['szyna']);
  });

  it('drugie wyjście z węzła odgałęzienia: brak z przyczyną, aparat bez przewodu z domysłu', () => {
    const lista = zSymbolem(aparaty(przypadek('bay_template_gpz_line_enea_z11_1_staly_z_odlacznikiem')));
    const q5 = lista.find((d) => d.deviceRef === 'Q5')!;
    const wezel = q5.ports!.find((port) => port.portId === 'wy')!.wezel;
    const drugi: AparatSekwencjiPola = { ...q5, deviceRef: 'Q5B', ports: [{ portId: 'we', wezel }, { portId: 'wy', wezel: 'pn9' }] };
    const { galezie, braki } = torPolaZPortow([...lista, drugi]);
    expect(braki.map((b) => b.przyczyna).join(' | ')).toContain('drugie wyjście z węzła odgałęzienia');
    expect(refy(galezie.flatMap((g) => g.aparaty))).not.toContain(braki[0].deviceRef);
  });

  // Korekta P0 karty UX-04/POLE-LINIOWE-WZORZEC (2026-10-29): pole wolne NIE traci już
  // zakończenia toru kablowego (dawne przycinanie rezerwy usuwało GK i przekładnik
  // Ferrantiego z toru — defekt 1/2 korekty). Tor pola jest funkcją wyłącznie rekordów.
  for (const nazwa of ['bay_template_gpz_line_enea_z11_1_trojpolozeniowy', 'bay_template_gpz_line_enea_z11_staly_z_odlacznikiem']) {
    it(`${nazwa}: plan — odgałęzienie poza torem głównym, gabaryt je obejmuje, tor główny pod pasem odgałęzienia`, () => {
      const lista = aparaty(przypadek(nazwa));
      const { rekordy, galezie } = rekordyToruPola(lista);
      expect(refy(rekordy)).toContain('GK');
      expect(refy(rekordy)).toContain('GK1');
      const symbolIds = rekordy.map((d) => symbolAparatuPola(d)!);
      const plan = planApparatusSymbolIds(symbolIds, czyAparatBoczny, { galezie });
      expect(plan.galezie).toHaveLength(1);
      const wGalezi = new Set(galezie.flatMap((g) => g.pozycje));
      expect(refy(galezie[0].pozycje.map((i) => rekordy[i]))).toEqual(
        przypadek(nazwa).poza_torem_glownym.length === 4 ? ['Q5', 'Q51', 'GK1', 'T3'] : ['Q5', 'GK1', 'T3'],
      );
      expect(plan.mainSequenceIndices.some((i) => wGalezi.has(i))).toBe(false);
      expect(plan.laterals.some((l) => wGalezi.has(l.sequenceIndex))).toBe(false);
      // Kotwica odgałęzienia = wyłącznik Q0 toru głównego.
      const kotwica = plan.galezie[0].afterMainIndex;
      expect(rekordy[plan.mainSequenceIndices[kotwica]].deviceRef).toBe('Q0');
      // Kolumna odgałęzienia: łącznik i głowica; przekładnik (i uziemnik) — boczne.
      expect(plan.galezie[0].plan.mainSequenceIndices.map((i) => rekordy[i].deviceRef)).toEqual(['Q5', 'GK1']);
      const zGaleziami = bayApparatusPlanFootprint(plan);
      const bezGalezi = bayApparatusPlanFootprint({ ...plan, galezie: [] });
      expect(zGaleziami.lateralExtension).toBeGreaterThan(bezGalezi.lateralExtension);
      expect(zGaleziami.height).toBeGreaterThanOrEqual(bezGalezi.height);
      // Tor główny za kotwicą stoi pod CAŁYM pasem odgałęzienia (ENEA Z.11.1: przekładnik
      // prądowy pod odgałęzieniem przekładnika napięciowego) — jedna reguła
      // `polozeniaToruGlownego` dla gabarytu i rysunku.
      const polozenia = polozeniaToruGlownego(plan);
      const bez = polozeniaToruGlownego({ ...plan, galezie: [] });
      const dolKotwicy = polozenia.y[kotwica] + SYMBOL_DEFS[plan.mainPath[kotwica]].height;
      const minimalnie = dolKotwicy + pasOdgalezienia(plan.galezie[0]).wysokosc + APPARATUS_STACK_VERTICAL_GAP;
      expect(polozenia.y[kotwica + 1]).toBeGreaterThanOrEqual(minimalnie);
      expect(polozenia.y[kotwica + 1]).toBeLessThan(minimalnie + 8);
      expect(polozenia.y.every((y) => y % 8 === 0)).toBe(true);
      expect(polozenia.y.slice(0, kotwica + 1)).toEqual(bez.y.slice(0, kotwica + 1));
      expect(zGaleziami.mainStack.height).toBe(polozenia.height);
      expect(zGaleziami.mainStack.height).toBeGreaterThan(bezGalezi.mainStack.height);
      expect(zGaleziami.mainStack.width).toBe(bezGalezi.mainStack.width);
    });
  }
});
