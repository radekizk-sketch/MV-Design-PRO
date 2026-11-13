// @vitest-environment node
/**
 * K2 (UI-04, §0.1) — ZAKRES KADRU: cel → refy rysunku, przeszkody (sąsiedzi)
 * i ścieżka kontekstu. Jedno źródło przynależności
 * (`kluczePrzynaleznosci`/`nalezyDo`) dla kotwicy i kadru.
 *
 * ILOCZYN CECH (reguła KLASA pkt 2), sieć referencyjna 52 stacji:
 *  - cel: zaznaczenie · sieć · magistrala · stacja · sekcja · pole;
 *  - obiekt: stacja zwykła (KAŻDA z 53) · GPZ (sekcje GPZ) · pole SN · pole nN ·
 *    aparat pola · szyna stacji · element poza stacją (odcinek kabla);
 *  - liczność: brak zaznaczenia · jeden element · wiele elementów w dwóch stacjach;
 *  - ref nieistniejący (każdy cel);
 *  - prostokąty zakresu na jednej scenie (zagnieżdżenie pole ⊂ sekcja ⊂ stacja) — od
 *    karty SLD-SKALA-I-NAWIGACJA (R1) scena jest jedna i niezależna od skali, więc
 *    dawne „wnętrze od L1" (poziom minimalny kadru) nie istnieje: każdy cel jest
 *    narysowany w pełni przy każdej skali;
 *  - determinizm (kopia migawki → identyczny wynik), unikalność i porządek refów;
 *  - równoważność predykatów: `nalezyDo` ≡ `kluczePrzynaleznosci`, indeks ≡ przegląd zupełny.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, sceneObstacleRects, type SceneV3 } from '../../scene/buildScene';
import { sheetSizeFor } from '../../sheet/outline';
import { MIN_OPIS_CELU_KADRU_PX, fontSizeForScreenFloorWithinProportion } from '../../core/text';
import { planSceneLabels } from '../labelLegibility';
import { przeszkodyEtykietPrzySkali } from '../znacznikiStanu';
import { klasaInformacjiEtykiety } from '../gestoscInformacji';
import { KADR_MAX_SCALE, type BoundingBox } from '../camera';
import { gabarytSymbolu } from '../../symbols/blokZabezpieczen';
import { indeksPrzynaleznosci, kluczePrzynaleznosci, nalezyDo, prostokatRefowWScenie } from '../viewAnchor';
import { stationSnSectionBusRefs } from '../../../shared/stationBusResolution';
import {
  SASIEDZI_ELEKTRYCZNIE_WYMAGANI,
  nalezyDoZakresu,
  podlogaOpisowCelu,
  prostokatyZakresu,
  zakresCelu,
  zakresNarysowany,
  type WynikZakresu,
  type ZakresKadru,
} from '../zakresKadru';

const here = dirname(fileURLToPath(import.meta.url));
const wczytaj = (): EnergyNetworkModel =>
  (
    JSON.parse(
      readFileSync(resolve(here, '../../../v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json'), 'utf8'),
    ) as { enm: EnergyNetworkModel }
  ).enm;
const enm = wczytaj();
const scena = buildSceneV3(enm);
const meta = scena.meta;
const stacjeRysunku = meta.stationTraversalOrder;
const NIE_MA = 'stn/nie-ma-takiej/station';

function dostepny(w: WynikZakresu): ZakresKadru {
  expect(w.dostepny, w.dostepny ? '' : w.przyczyna).toBe(true);
  if (!w.dostepny) throw new Error('niedostępny');
  return w.zakres;
}
function zawiera(zewn: BoundingBox, wewn: BoundingBox): boolean {
  const e = 1e-9;
  return wewn.minX >= zewn.minX - e && wewn.maxX <= zewn.maxX + e && wewn.minY >= zewn.minY - e && wewn.maxY <= zewn.maxY + e;
}
const posortowaneUnikalne = (l: readonly string[]) => expect([...new Set(l)].sort()).toEqual(l);

describe('ścieżka kontekstu: obiekt bez nazwy w modelu nie pokazuje identyfikatora', () => {
  // Klasa „nazwa po identyfikatorze z zapasem = identyfikator” (2026-11): `ix.nazwy.get(ref) ?? ref`
  // wypisywał referencję z odciskiem (`stn/<odcisk>/…`) w ścieżce kadru. Teraz polska etykieta
  // rodzaju z referencji (`etykietaZapasowaRefu`). Iloczyn: stacja zwykła × GPZ × nazwa pusta.
  it.each([
    ['stacja zwykła', stacjeRysunku.find((r) => enm.substations.find((s) => s.ref_id === r)!.station_type !== 'gpz')!],
    ['GPZ', stacjeRysunku.find((r) => enm.substations.find((s) => s.ref_id === r)!.station_type === 'gpz')!],
  ])('%s z pustą nazwą', (_opis, ref) => {
    const bezNazwy: EnergyNetworkModel = {
      ...enm,
      substations: enm.substations.map((s) => (s.ref_id === ref ? { ...s, name: '' } : s)),
    };
    const z = dostepny(zakresCelu('stacja', bezNazwy, [ref], scena));
    const etykieta = z.sciezka[z.sciezka.length - 1]!.etykieta;
    expect(etykieta).not.toBe('');
    expect(etykieta).not.toBe(ref);
    for (const segment of ref.split('/').filter((x) => /^[0-9a-f]{8,}$/i.test(x))) {
      expect(etykieta).not.toContain(segment);
    }
  });
});

describe('zakres celu „Stacja" — każda stacja rysunku (zwykła i GPZ)', () => {
  it.each(stacjeRysunku.map((ref) => [enm.substations.find((s) => s.ref_id === ref)!.name, ref]))(
    '%s: sąsiedzi = wszystkie inne stacje, ścieżka Sieć › stacja, prostokąt narysowany',
    (nazwaStacji, ref) => {
      const z = dostepny(zakresCelu('stacja', enm, [ref], scena));
      expect(z.refy).toContain(ref);
      posortowaneUnikalne(z.refy);
      expect(z.przeszkody.map((p) => p.ref)).toEqual(enm.substations.map((s) => s.ref_id).filter((r) => r !== ref).sort());
      expect(z.sciezka.map((p) => p.etykieta)).toEqual(['Sieć', nazwaStacji]);
      const { cel, przeszkody } = prostokatyZakresu(scena, z);
      expect(cel).not.toBeNull();
      // Przeszkody nie obejmują samej stacji: żaden prostokąt sąsiada nie jest
      // prostokątem tej stacji.
      const wlasny = cel!;
      expect(przeszkody.some((b) => JSON.stringify(b) === JSON.stringify(wlasny))).toBe(false);
    },
  );

  it('predykaty parami: sąsiad jako PRZESZKODA ma ten sam zbiór refów i ten sam prostokąt co ta stacja jako CEL', () => {
    // Pomiar e2e K2: przeszkoda liczona z samego refu stacji gubiła źródło GPZ
    // (osobny rekord `sources`) — jego napis wchodził w kadr sąsiedniej stacji.
    const celStacji = new Map(
      enm.substations.map((s) => [s.ref_id, dostepny(zakresCelu('stacja', enm, [s.ref_id], scena))] as const),
    );
    for (const st of stacjeRysunku) {
      const z = celStacji.get(st)!;
      const { przeszkody } = prostokatyZakresu(scena, z);
      const oczekiwane = z.przeszkody
        .map((p) => prostokatyZakresu(scena, celStacji.get(p.ref)!).cel)
        .filter((b): b is BoundingBox => b !== null);
      expect(przeszkody).toEqual(oczekiwane);
      for (const p of z.przeszkody) expect(p.refy).toEqual(celStacji.get(p.ref)!.refy);
    }
  });

  it('przeszkoda GPZ obejmuje źródło zasilania GPZ (rekord `sources`) i jego napis', () => {
    const gpz = meta.gpzId!;
    const zrodla = enm.sources.filter((zr) => zr.substation_ref === gpz).map((zr) => zr.ref_id);
    expect(zrodla.length).toBeGreaterThan(0);
    const zwykla = stacjeRysunku.find((st) => st !== gpz)!;
    const z = dostepny(zakresCelu('stacja', enm, [zwykla], scena));
    const przeszkodaGpz = z.przeszkody.find((p) => p.ref === gpz)!;
    for (const zr of zrodla) expect(przeszkodaGpz.refy).toContain(zr);
    // Indeks w `przeszkody` (prostokąty) = pozycja wśród przeszkód NARYSOWANYCH.
    const narysowane = z.przeszkody.filter(
      (p) => prostokatyZakresu(scena, dostepny(zakresCelu('stacja', enm, [p.ref], scena))).cel !== null,
    );
    const iGpz = narysowane.findIndex((p) => p.ref === gpz);
    const pz = prostokatyZakresu(scena, z);
    const boxGpz = pz.przeszkody[iGpz]!;
    // Od 2026-11-13 prostokąt przeszkody = obrys obiektu (bez napisów); napis źródła należy do
    // przeszkody przez jej TUSZ etykiet (ten sam plan, który rysuje kanwa) — przy skali kadru
    // z napisem w rozmiarze naturalnym obrys ∪ tusz obejmuje każdy napis źródła GPZ.
    const tusz = pz.tuszEtykiet(KADR_MAX_SCALE).przeszkody[iGpz];
    const suma = tusz
      ? { minX: Math.min(boxGpz.minX, tusz.minX), minY: Math.min(boxGpz.minY, tusz.minY), maxX: Math.max(boxGpz.maxX, tusz.maxX), maxY: Math.max(boxGpz.maxY, tusz.maxY) }
      : boxGpz;
    const napisy = scena.labels.filter((l) => zrodla.some((zr) => nalezyDo(l.ownerRef, zr)));
    expect(napisy.length).toBeGreaterThan(0);
    for (const l of napisy) {
      expect(zawiera(suma, { minX: l.rect.x, minY: l.rect.y, maxX: l.rect.x + l.rect.width, maxY: l.rect.y + l.rect.height })).toBe(true);
    }
    // Symbol źródła GPZ leży w samym obrysie przeszkody.
    for (const sym of scena.symbols.filter((y) => zrodla.some((zr) => nalezyDo(y.meta?.ownerRef, zr)))) {
      const g = gabarytSymbolu(sym);
      expect(zawiera(boxGpz, { minX: g.x, minY: g.y, maxX: g.x + g.width, maxY: g.y + g.height })).toBe(true);
    }
  });

  it('element stacji (pole, aparat, szyna) wskazuje tę samą stację co sama stacja', () => {
    let sprawdzone = 0;
    for (const bay of enm.bays) {
      if (!bay.substation_ref) continue;
      const zStacji = dostepny(zakresCelu('stacja', enm, [bay.substation_ref], scena));
      for (const ref of [bay.ref_id, bay.bus_ref, ...(bay.equipment_refs ?? [])]) {
        expect(dostepny(zakresCelu('stacja', enm, [ref], scena))).toEqual(zStacji);
        sprawdzone += 1;
      }
    }
    expect(sprawdzone).toBeGreaterThan(300);
  });
});

describe('zagnieżdżenie pole ⊂ sekcja ⊂ stacja', () => {
  const polaWStacjach = enm.bays.filter((b) => b.substation_ref);
  it(`każde pole stacji (${polaWStacjach.length}): ścieżka kończy się polem, prostokąty zagnieżdżone`, () => {
    let zSekcja = 0;
    for (const bay of polaWStacjach) {
      const pole = dostepny(zakresCelu('pole', enm, [bay.ref_id], scena));
      const stacja = dostepny(zakresCelu('stacja', enm, [bay.ref_id], scena));
      expect(pole.refy).toContain(bay.ref_id);
      expect(pole.sciezka[pole.sciezka.length - 1]!.etykieta).toBe(bay.name);
      expect(pole.sciezka[1].kontekst).toEqual([bay.substation_ref]);
      const pPole = prostokatyZakresu(scena, pole).cel;
      const pStacja = prostokatyZakresu(scena, stacja).cel;
      const sekcjaW = zakresCelu('sekcja', enm, [bay.ref_id], scena);
      const pSekcja = sekcjaW.dostepny ? prostokatyZakresu(scena, sekcjaW.zakres).cel : null;
      if (sekcjaW.dostepny) zSekcja += 1;
      // Scena jest jedna i pełna: każde pole SN jest narysowane przy każdej skali.
      // Pole nN rysuje widok rozdzielnicy nN (portal stacji), nie schemat SN.
      const napiecie = enm.buses.find((x) => x.ref_id === bay.bus_ref)?.voltage_kv ?? 0;
      if (pPole === null) {
        expect(napiecie, `${bay.ref_id}: pole SN nienarysowane`).toBeLessThanOrEqual(1);
        continue;
      }
      expect(zawiera(pStacja!, pPole!), `${bay.ref_id}: pole w stacji`).toBe(true);
      if (pSekcja) {
        expect(zawiera(pSekcja, pPole!), `${bay.ref_id}: pole w sekcji`).toBe(true);
        expect(zawiera(pStacja!, pSekcja), `${bay.ref_id}: sekcja w stacji`).toBe(true);
      }
    }
    // Każde pole stoi na szynie stacji albo w sekcji GPZ — sekcja zawsze wskazana.
    expect(zSekcja).toBe(polaWStacjach.length);
  });

  it('GPZ: pole GPZ → sekcja GPZ z nazwą z rekordu; ścieżka Sieć › GPZ › Sekcja › Pole', () => {
    const bay = enm.bays.find((b) => b.substation_ref === meta.gpzId)!;
    const z = dostepny(zakresCelu('zaznaczenie', enm, [bay.ref_id], scena));
    const gpz = enm.substations.find((s) => s.ref_id === meta.gpzId)!;
    expect(z.sciezka.map((p) => p.etykieta)).toEqual(['Sieć', gpz.name, gpz.gpz_sections![0].name, bay.name]);
    const sekcja = dostepny(zakresCelu('sekcja', enm, [bay.ref_id], scena));
    expect(sekcja.refy).toContain(gpz.gpz_sections![0].section_id);
    expect(sekcja.refy).toContain(bay.ref_id);
  });

  it('pole SN zwykłej stacji: sekcja to szyna SN z napięciem w etykiecie, nie powtórzona nazwa stacji', () => {
    const bay = enm.bays.find((b) => b.substation_ref && b.ref_id.includes('/sn_field/'))!;
    const sekcja = dostepny(zakresCelu('sekcja', enm, [bay.ref_id], scena));
    const stacja = enm.substations.find((s) => s.ref_id === bay.substation_ref)!;
    const etykieta = sekcja.sciezka[sekcja.sciezka.length - 1]!.etykieta;
    expect(etykieta).toMatch(/^Szyna SN \d+(,\d+)? kV/);
    expect(etykieta).not.toBe(stacja.name);
    // GEOMETRIA-STACJI (Z-03): odcinek szyny SN należy do rekordu `Bus` sekcji.
    expect(sekcja.refy).toContain(`${bay.bus_ref}#sn-bus`);
  });
});

describe('szyna stacji: pasmo z jednego lustra i kompozyt rysunku z jednej reguły wyboru szyny', () => {
  // K2 (pasmo_napieciowe_guard): etykieta sekcji i przypisanie kompozytu `stacja#sn-bus`/
  // `stacja#lv-bus` brały pasmo z własnego progu `voltage_kv >= 1` (1 kV = SN, brak danej
  // = cichy zerowy „nN"). ILOCZYN: napięcie szyny pola (15 kV · 1 kV granica · brak) ×
  // druga szyna SN stacji (brak · wyższa · równa · niższa) — kompozyt ⇔ `pickStationBus`.
  const bay = enm.bays.find((b) => b.substation_ref && b.ref_id.includes('/sn_field/'))!;
  const kopia = (): EnergyNetworkModel => JSON.parse(JSON.stringify(enm)) as EnergyNetworkModel;
  const sekcjaPola = (model: EnergyNetworkModel) => dostepny(zakresCelu('sekcja', model, [bay.ref_id], scena));
  const etykietaPola = (model: EnergyNetworkModel) => {
    const z = sekcjaPola(model);
    return z.sciezka[z.sciezka.length - 1]!.etykieta;
  };

  it('szyna 1 kV (granica pasma włącznie) jest szyną nN, nie SN', () => {
    const model = kopia();
    model.buses.find((b) => b.ref_id === bay.bus_ref)!.voltage_kv = 1;
    expect(etykietaPola(model)).toMatch(/^Szyna nN 1 kV/);
  });

  it('szyna bez napięcia znamionowego nazwana wprost — bez „nN 0 kV" i bez kompozytu', () => {
    const model = kopia();
    const szyna = model.buses.find((b) => b.ref_id === bay.bus_ref)! as { voltage_kv?: number };
    delete szyna.voltage_kv;
    expect(etykietaPola(model)).toMatch(/^Szyna bez napięcia znamionowego/);
    const refy = sekcjaPola(model).refy;
    expect(refy.some((r) => r.endsWith('#sn-bus') || r.endsWith('#lv-bus'))).toBe(false);
  });

  // GEOMETRIA-STACJI (Z-03, §0 pkt 1): każda szyna SN stacji jest SEKCJĄ z własnym odcinkiem
  // `${busRef}#sn-bus` (reguła `stationSnSectionBusRefs`), więc druga szyna SN — wyższa,
  // równa czy niższa — nie odbiera kadrowi sekcji jego odcinka. Dawniej jeden kompozyt
  // `stacja#sn-bus` rozstrzygany `pickStationBus` (najwyższe napięcie, remis = odmowa)
  // gubił odcinek sekcji przy drugiej szynie wyższej lub równej.
  it.each([
    ['brak drugiej szyny SN', null, true],
    ['druga szyna SN wyższa (20 kV)', 20, true],
    ['druga szyna SN równa (remis)', 'rowna', true],
    ['druga szyna SN niższa (6 kV)', 6, true],
  ] as const)('%s: odcinek sekcji szyny pola w kadrze sekcji ⇔ szyna pola jest sekcją SN stacji', (_opis, druga, oczekiwany) => {
    const model = kopia();
    const szynaPola = model.buses.find((b) => b.ref_id === bay.bus_ref)!;
    const stacja = model.substations.find((st) => st.ref_id === bay.substation_ref)!;
    if (druga !== null) {
      const ref = 'bus/k2-druga-szyna-sn';
      model.buses.push({ ...szynaPola, ref_id: ref, name: 'Druga szyna SN', voltage_kv: druga === 'rowna' ? szynaPola.voltage_kv : druga });
      stacja.bus_refs = [...(stacja.bus_refs ?? []), ref];
    }
    const refy = sekcjaPola(model).refy;
    const odcinek = `${bay.bus_ref}#sn-bus`;
    const sekcje = stationSnSectionBusRefs(stacja, new Map(model.buses.map((b) => [b.ref_id, b])));
    expect(refy.includes(odcinek)).toBe(oczekiwany);
    expect(refy.includes(odcinek)).toBe(sekcje.includes(bay.bus_ref!));
    // Odcinek drugiej szyny nie wpada do kadru sekcji pola (to inna sekcja).
    expect(refy.includes('bus/k2-druga-szyna-sn#sn-bus')).toBe(false);
  });
});

describe('liczność zaznaczenia', () => {
  const [a, b] = [stacjeRysunku[3], stacjeRysunku[9]];
  const poleA = enm.bays.find((x) => x.substation_ref === a)!;
  const poleB = enm.bays.find((x) => x.substation_ref === b)!;

  it('brak zaznaczenia: zaznaczenie/stacja/sekcja/pole niedostępne z przyczyną; sieć i magistrala dostępne', () => {
    for (const cel of ['zaznaczenie', 'stacja', 'sekcja', 'pole'] as const) {
      const w = zakresCelu(cel, enm, [], scena);
      expect(w.dostepny).toBe(false);
      if (!w.dostepny) expect(w.przyczyna.length).toBeGreaterThan(20);
    }
    expect(dostepny(zakresCelu('siec', enm, [], scena)).refy).toEqual([]);
    expect(zakresCelu('magistrala', enm, [], scena).dostepny).toBe(true);
  });

  it('dwa pola w dwóch stacjach: „Stacje (2)", refy = suma stacji, przeszkody bez obu', () => {
    const z = dostepny(zakresCelu('stacja', enm, [poleB.ref_id, poleA.ref_id], scena));
    const za = dostepny(zakresCelu('stacja', enm, [a], scena));
    const zb = dostepny(zakresCelu('stacja', enm, [b], scena));
    expect(z.sciezka[z.sciezka.length - 1]!.etykieta).toBe('Stacje (2)');
    expect(z.refy).toEqual([...new Set([...za.refy, ...zb.refy])].sort());
    expect(z.przeszkody.map((p) => p.ref)).not.toContain(a);
    expect(z.przeszkody.map((p) => p.ref)).not.toContain(b);
    expect(z.przeszkody).toHaveLength(enm.substations.length - 2);
    // Kolejność zaznaczenia nie zmienia wyniku.
    expect(dostepny(zakresCelu('stacja', enm, [poleA.ref_id, poleB.ref_id], scena))).toEqual(z);
  });

  it('dwa pola: cel „Pole" daje „Pola (2)", prostokąt obejmuje oba', () => {
    const z = dostepny(zakresCelu('pole', enm, [poleA.ref_id, poleB.ref_id], scena));
    expect(z.sciezka[z.sciezka.length - 1]!.etykieta).toBe('Pola (2)');
    const suma = prostokatyZakresu(scena, z).cel!;
    for (const p of [poleA, poleB]) {
      const jeden = prostokatyZakresu(scena, dostepny(zakresCelu('pole', enm, [p.ref_id], scena))).cel!;
      expect(zawiera(suma, jeden)).toBe(true);
    }
  });

  it('zaznaczenie wielu: ścieżka „Zaznaczenie (2)", przeszkody bez stacji zaznaczonych elementów', () => {
    const z = dostepny(zakresCelu('zaznaczenie', enm, [poleA.ref_id, poleB.ref_id], scena));
    expect(z.sciezka[z.sciezka.length - 1]!.etykieta).toBe('Zaznaczenie (2)');
    expect(z.przeszkody.map((p) => p.ref)).not.toContain(a);
    expect(z.przeszkody.map((p) => p.ref)).not.toContain(b);
  });

  it('zaznaczenie odcinka kabla (poza stacją): przeszkody = wszystkie stacje, zakres narysowany', () => {
    const odcinek = enm.branches.find((br) => br.type === 'cable' || br.type === 'line_overhead')!;
    const z = dostepny(zakresCelu('zaznaczenie', enm, [odcinek.ref_id], scena));
    expect(z.przeszkody).toHaveLength(enm.substations.length);
    expect(zakresNarysowany(scena, z)).toBe(true);
  });
});

describe('ref nieistniejący — uczciwie, bez fabrykacji kadru', () => {
  it('stacja/sekcja/pole: niedostępne z przyczyną; zaznaczenie: zakres nienarysowany', () => {
    for (const cel of ['stacja', 'sekcja', 'pole'] as const) {
      const w = zakresCelu(cel, enm, [NIE_MA], scena);
      expect(w.dostepny).toBe(false);
    }
    const z = dostepny(zakresCelu('zaznaczenie', enm, [NIE_MA], scena));
    expect(zakresNarysowany(scena, z)).toBe(false);
    expect(prostokatyZakresu(scena, z).cel).toBeNull();
  });
});

describe('magistrala', () => {
  it('obejmuje stacje ciągu głównego i GPZ, a NIE obejmuje żadnej stacji odgałęzienia', () => {
    const z = dostepny(zakresCelu('magistrala', enm, [], scena));
    posortowaneUnikalne(z.refy);
    for (const st of [...meta.mainTrunkStationIds, meta.gpzId!]) expect(z.refy).toContain(st);
    const trunk = new Set([...meta.mainTrunkStationIds, meta.gpzId!]);
    const boczne = stacjeRysunku.filter((s) => !trunk.has(s));
    expect(boczne.length).toBeGreaterThan(30);
    for (const st of boczne) {
      const refyBocznej = dostepny(zakresCelu('stacja', enm, [st], scena)).refy;
      expect(z.refy.filter((r) => refyBocznej.includes(r)), `magistrala bez ${st}`).toEqual([]);
    }
    // Prostokąt magistrali obejmuje prostokąt każdej stacji ciągu — obu jako OBIEKTÓW (obrys
    // zaznaczenia, `prostokatObiektuZakresu`; decyzja architekta 2026-11-13: opisy nie powiększają
    // obiektu, więc porównanie z prostokątem indeksu z opisami nie byłoby tą samą miarą).
    const pm = prostokatyZakresu(scena, z).cel!;
    for (const st of meta.mainTrunkStationIds) {
      const ps = prostokatyZakresu(scena, dostepny(zakresCelu('stacja', enm, [st], scena))).cel;
      expect(ps, st).not.toBeNull();
      expect(zawiera(pm, ps!)).toBe(true);
    }
  });
});

describe('determinizm i jedno źródło przynależności', () => {
  it('kopia migawki (inny obiekt, te same dane) daje identyczne zakresy dla każdego celu i każdej stacji', () => {
    const kopia = wczytaj();
    const scenaKopii = buildSceneV3(kopia);
    for (const st of stacjeRysunku) {
      for (const cel of ['zaznaczenie', 'stacja', 'sekcja', 'pole'] as const) {
        expect(zakresCelu(cel, kopia, [st], scenaKopii)).toEqual(zakresCelu(cel, enm, [st], scena));
      }
    }
    expect(zakresCelu('magistrala', kopia, [], scenaKopii)).toEqual(zakresCelu('magistrala', enm, [], scena));
  });

  it('`nalezyDo` ≡ `kluczePrzynaleznosci` dla każdego ownerRef sceny × refy stacji i pól', () => {
    const wlasciciele = new Set<string>();
    for (const s of scena.symbols) if (s.meta?.ownerRef) wlasciciele.add(s.meta.ownerRef);
    for (const s of scena.segments) if (s.meta?.ownerRef) wlasciciele.add(s.meta.ownerRef);
    for (const l of scena.labels) if (l.ownerRef) wlasciciele.add(l.ownerRef);
    const refy = [...stacjeRysunku, ...enm.bays.map((b) => b.ref_id), NIE_MA];
    let zgodne = 0;
    for (const w of wlasciciele) {
      const klucze = kluczePrzynaleznosci(w);
      for (const r of refy) {
        expect(nalezyDo(w, r), `${w} ∈ ${r}`).toBe(klucze.includes(r));
        zgodne += 1;
      }
    }
    expect(zgodne).toBeGreaterThan(100_000);
  });

  it('indeks przynależności ≡ przegląd zupełny sceny (symbole, odcinki, etykiety)', () => {
    // GEOMETRIA-STACJI (Z-03): szyny sekcji stacji należą do rekordów `Bus` sekcji, a do
    // stacji — przez relację sceny `meta.stacjaSzynySekcji`; przegląd zupełny liczy je tak samo.
    const przeglad = (scene: SceneV3, ref: string): BoundingBox | null => {
      const szynyStacji = Object.entries(scene.meta.stacjaSzynySekcji)
        .filter(([, stacja]) => stacja === ref)
        .map(([szyna]) => szyna);
      const nalezy = (ownerRef: string | undefined): boolean =>
        nalezyDo(ownerRef, ref) || szynyStacji.some((szyna) => nalezyDo(ownerRef, szyna));
      let b: BoundingBox | null = null;
      const dolicz = (x0: number, y0: number, x1: number, y1: number) => {
        b = b
          ? { minX: Math.min(b.minX, x0), minY: Math.min(b.minY, y0), maxX: Math.max(b.maxX, x1), maxY: Math.max(b.maxY, y1) }
          : { minX: x0, minY: y0, maxX: x1, maxY: y1 };
      };
      for (const s of scene.symbols) {
        if (!nalezy(s.meta?.ownerRef)) continue;
        // Gabaryt z jedynego źródła geometrii symbolu: blok zabezpieczeń pola to cała ramka.
        const g = gabarytSymbolu(s);
        dolicz(g.x, g.y, g.x + g.width, g.y + g.height);
      }
      for (const s of scene.segments) {
        if (!nalezy(s.meta?.ownerRef)) continue;
        for (const p of s.points) dolicz(p.x, p.y, p.x, p.y);
      }
      for (const l of scene.labels) {
        if (!nalezy(l.ownerRef)) continue;
        dolicz(l.rect.x, l.rect.y, l.rect.x + l.rect.width, l.rect.y + l.rect.height);
      }
      return b;
    };
    const indeks = indeksPrzynaleznosci(scena);
    for (const ref of [...stacjeRysunku, ...enm.bays.map((x) => x.ref_id)]) {
      expect(indeks.get(ref) ?? null, ref).toEqual(przeglad(scena, ref));
    }
  });
});

/**
 * K2 — TUSZ ETYKIET ZAKRESU: ten sam plan etykiet co kanwa. Iloczyn: każda stacja
 * rysunku × skala {górna granica kadru · oddalenie 0,5}.
 */
describe('tusz etykiet zakresu (plan etykiet kanwy przy skali kadru)', () => {
  it('przeszkody tuszu idą w parze z prostokątami przeszkód (ta sama długość i kolejność refów)', () => {
    for (const st of stacjeRysunku) {
      const p = prostokatyZakresu(scena, dostepny(zakresCelu('stacja', enm, [st], scena)));
      expect(p.tuszEtykiet(0.5).przeszkody).toHaveLength(p.przeszkody.length);
    }
  });

  it('przy górnej granicy skali kadru tusz etykiet stacji mieści się w jej slotach; przy oddaleniu pismo powiększone wystaje', () => {
    let wystaje = 0;
    for (const st of stacjeRysunku) {
      const p = prostokatyZakresu(scena, dostepny(zakresCelu('stacja', enm, [st], scena)));
      // Slot napisów = prostokąt indeksu przynależności (rysunek RAZEM z napisami w rozmiarze
      // naturalnym); cel kadru jest od 2026-11-13 obrysem obiektu bez napisów.
      const slot = prostokatRefowWScenie(scena, dostepny(zakresCelu('stacja', enm, [st], scena)).refy)!;
      const blisko = p.tuszEtykiet(KADR_MAX_SCALE).cel;
      if (blisko) expect(zawiera({ minX: slot.minX - 1e-6, minY: slot.minY - 1e-6, maxX: slot.maxX + 1e-6, maxY: slot.maxY + 1e-6 }, blisko)).toBe(true);
      const daleko = p.tuszEtykiet(0.5).cel;
      if (daleko && !zawiera(slot, daleko)) wystaje += 1;
    }
    // Zjawisko, które naprawia tusz w kamerze, występuje na fiksturze (inaczej test niczego nie pilnuje).
    expect(wystaje).toBeGreaterThan(0);
  });

  it('determinizm: ten sam zakres i skala — identyczny tusz', () => {
    const z = dostepny(zakresCelu('stacja', enm, [stacjeRysunku[3]], scena));
    expect(prostokatyZakresu(scena, z).tuszEtykiet(0.5)).toEqual(prostokatyZakresu(scena, z).tuszEtykiet(0.5));
  });

  // R4 (jedno źródło przeszkód planu etykiet): tusz kadru liczony z TYCH SAMYCH wejść planu, które
  // rysuje kanwa — przeszkody przy skali kadru (`przeszkodyEtykietPrzySkali`: rysunek ∪ znaczniki
  // stanu tej skali) i pierwszeństwo nazw stacji. Iloczyn: każda stacja rysunku × skala
  // {oddalenie 0,05 · 0,5} × wejścia {domyślne — kanwa bez nakładki · podane przez kanwę}.
  it('tusz domyślny == plan kanwy bez nakładki (rysunek ∪ znaczniki stanu przy skali kadru)', () => {
    let roznychOdSamegoRysunku = 0;
    for (const st of stacjeRysunku) {
      const z = dostepny(zakresCelu('stacja', enm, [st], scena));
      const refy = new Set(z.refy);
      for (const skala of [0.05, 0.5]) {
        const oczekiwany = planSceneLabels(scena.labels, przeszkodyEtykietPrzySkali(scena)(skala), skala, sheetSizeFor(scena), podlogaOpisowCelu(refy));
        const samRysunek = planSceneLabels(scena.labels, sceneObstacleRects(scena), skala, sheetSizeFor(scena), podlogaOpisowCelu(refy));
        const tuszCelu = (p: typeof oczekiwany) => {
          const r = p.drawn.filter((d) => nalezyDoZakresu(d.label.ownerRef, refy)).map((d) => d.rect);
          return r.length === 0
            ? null
            : { minX: Math.min(...r.map((q) => q.x)), minY: Math.min(...r.map((q) => q.y)), maxX: Math.max(...r.map((q) => q.x + q.width)), maxY: Math.max(...r.map((q) => q.y + q.height)) };
        };
        expect(prostokatyZakresu(scena, z).tuszEtykiet(skala).cel, `${st} @${skala}`).toEqual(tuszCelu(oczekiwany));
        if (JSON.stringify(tuszCelu(oczekiwany)) !== JSON.stringify(tuszCelu(samRysunek))) roznychOdSamegoRysunku += 1;
      }
    }
    // Warunek sensu: znaczniki stanu zmieniają tusz kadru choć jednej stacji (inaczej test nie
    // odróżnia przeszkód kanwy od samego rysunku).
    expect(roznychOdSamegoRysunku).toBeGreaterThan(0);
  });

  it('tusz używa przeszkód i pierwszeństwa podanych przez kanwę', () => {
    const st = stacjeRysunku[3];
    const z = dostepny(zakresCelu('stacja', enm, [st], scena));
    const pelnyArkusz = (): readonly { x: number; y: number; width: number; height: number }[] => [
      { x: -1e6, y: -1e6, width: 2e6, height: 2e6 },
    ];
    // Przeszkoda na cały arkusz: bez pierwszeństwa nazwa stacji nie ma miejsca, z pierwszeństwem stoi
    // na rysunku (R4 `naRysunku`) — oba wejścia muszą dojść do planu kadru.
    const bez = prostokatyZakresu(scena, z, undefined, { przeszkody: pelnyArkusz }).tuszEtykiet(0.05);
    const zPierwszenstwem = prostokatyZakresu(scena, z, undefined, { przeszkody: pelnyArkusz, pierwszenstwo: new Set([st]) }).tuszEtykiet(0.05);
    expect(bez.cel, 'przeszkody kanwy dochodzą do planu kadru').toBeNull();
    expect(zPierwszenstwem.cel, 'pierwszeństwo kanwy dochodzi do planu kadru').not.toBeNull();
  });
});

/**
 * K2b §0.1 — kadr stacji obejmuje WYŁĄCZNIE tę stację. Sąsiad wchodzi do zakresu
 * tylko z listy `SASIEDZI_ELEKTRYCZNIE_WYMAGANI`, która jest pusta (uzasadnienie
 * w `zakresKadru.ts`). Iloczyn: każda stacja rysunku × każda inna stacja.
 */
describe('K2b: zakres stacji bez sąsiadów', () => {
  it('lista sąsiadów elektrycznie wymaganych jest pusta (nowy wpis wymaga przypadku elektrycznego i testu)', () => {
    expect(SASIEDZI_ELEKTRYCZNIE_WYMAGANI).toEqual([]);
  });

  it('refy kadru stacji są rozłączne z refami każdej innej stacji (żaden obiekt sąsiada w zakresie)', () => {
    const zakresy = new Map(stacjeRysunku.map((st) => [st, dostepny(zakresCelu('stacja', enm, [st], scena))] as const));
    for (const [st, z] of zakresy) {
      const wlasne = new Set(z.refy);
      for (const [inna, zInnej] of zakresy) {
        if (inna === st) continue;
        expect(zInnej.refy.filter((r) => wlasne.has(r)), `${st} ∩ ${inna}`).toEqual([]);
      }
    }
  });

  it('`nalezyDoZakresu` ≡ `nalezyDo` dla każdego ownerRef sceny × refy każdej stacji (jedna relacja dla kadru, tuszu, podłogi i kurtyny)', () => {
    const ownerRefy = new Set<string>();
    for (const el of [...scena.symbols, ...scena.segments.map((s) => s.meta ?? {}), ...scena.labels]) {
      const o = (el as { ownerRef?: string }).ownerRef;
      if (o) ownerRefy.add(o);
    }
    for (const st of stacjeRysunku) {
      const refy = dostepny(zakresCelu('stacja', enm, [st], scena)).refy;
      const zbior = new Set(refy);
      for (const o of ownerRefy) expect(nalezyDoZakresu(o, zbior), `${o} ∈ ${st}`).toBe(refy.some((r) => nalezyDo(o, r)));
    }
    expect(nalezyDoZakresu(undefined, new Set(['x']))).toBe(false);
    expect(nalezyDoZakresu(null, new Set(['x']))).toBe(false);
  });
});

/**
 * K2b §0.2 (b) — PODŁOGA OPISÓW CELU w planie etykiet. Iloczyn cech: etykieta
 * celu / spoza celu × skala w granicy sufitu proporcji klasy / poza nią × miejsce
 * jest / brak miejsca (gęsta stacja przy skali 0,6) × każda stacja
 * rysunku. Pomiar na fiksturze 52 stacji (2026-10-21): przy skali ≥ 1 wszystkie
 * opisy celu mają ≥ 13 px i żaden nie jest ukryty; przy 0,6 część opisów gęstych
 * stacji nie mieści się po powiększeniu (karta SLD-SKALA-I-NAWIGACJA: bez licznika
 * na kanwie — dane bez miejsca nie są rysowane, tożsamość idzie do podpowiedzi uchwytu).
 */
/** Piny pomiaru (2026-11-12, karta SLD-SKALA-I-NAWIGACJA) przy skali 1, suma po 53 kadrach
 *  stacji fikstury: 171 danych celu bez miejsca na postać 13 px (pismo naturalne t4 = 8 px nie
 *  jest czytelne, więc postaci standardowej nie ma) i 171 opisów celu narysowanych pismem
 *  standardowym, bo pełna postać celu nie ma miejsca. Przy skali 1,5 i 2,76 — zero. Zapadka
 *  w dół — mniejsza liczba po zmianie układu obniża pin. */
const PIN_BEZ_MIEJSCA_SKALA_1 = 171;
const PIN_PONIZEJ_PODLOGI_SKALA_1 = 171;

describe('K2b: podłoga opisów celu w planie etykiet', () => {
  const plan = (scale: number, refy?: ReadonlySet<string>) =>
    planSceneLabels(
      scena.labels,
      sceneObstacleRects(scena),
      scale,
      sheetSizeFor(scena),
      refy ? podlogaOpisowCelu(refy) : undefined,
    );
  /** Etykiety sceny, których plan NIE narysował (dane bez miejsca albo poniżej progu
   *  i tożsamości oddane do podpowiedzi uchwytu). */
  const nienarysowane = (p: ReturnType<typeof plan>) => {
    const narysowane = new Set(p.drawn.map((d) => d.index));
    return scena.labels.filter((_, i) => !narysowane.has(i));
  };
  const refyStacji = (st: string) => new Set(dostepny(zakresCelu('stacja', enm, [st], scena)).refy);

  it.each([1, 1.5, KADR_MAX_SCALE] as const)('skala %s (w granicy sufitu): każdy opis celu narysowany ≥ 13 px na ekranie albo — dana — bez miejsca na postać celu', (scale) => {
    let bezMiejsca = 0;
    let ponizejPodlogi = 0;
    for (const st of stacjeRysunku) {
      const refy = refyStacji(st);
      const p = plan(scale, refy);
      // Poza rysunkiem mogą zostać WYŁĄCZNIE dane, których postać celu nie ma miejsca przy
      // żadnej stronie (ta sama wyrocznia co dla skali 0,3 niżej). Pomiar 2026-11-12 (karta
      // SLD-SKALA-I-NAWIGACJA): plan dotąd odrzucał takie dane BEZ śladu w żadnej liście
      // (`hiddenDetail` ich nie zawierał), więc ten test był zielony z cichym zerem — numer
      // „52” wyłącznika w czterech polach stacji T1 (slot 9 j.św. między wyłącznikiem a ramką
      // bloku zabezpieczeń) nie mieści się w piśmie 13 px. Tożsamość celu nie ginie nigdy.
      const ukryte = nienarysowane(p).filter((l) => nalezyDoZakresu(l.ownerRef, refy));
      expect(ukryte.filter((l) => klasaInformacjiEtykiety(l) === 'tozsamosc').map((l) => l.text), st).toEqual([]);
      const inne = p.drawn.map((q) => q.rect);
      for (const l of ukryte) {
        const sama = planSceneLabels([l], [...sceneObstacleRects(scena), ...inne], scale, sheetSizeFor(scena), podlogaOpisowCelu(refy));
        expect(sama.drawn.map((q) => q.text), `${st}: „${l.text}" — postać celu ma miejsce, a plan jej nie narysował`).toEqual([]);
        bezMiejsca += 1;
      }
      for (const d of p.drawn) {
        if (!nalezyDoZakresu(d.label.ownerRef, refy) || d.fontSize * scale >= MIN_OPIS_CELU_KADRU_PX - 1e-6) continue;
        // Pismo poniżej podłogi celu tylko wtedy, gdy PEŁNA postać celu nie ma miejsca (R4:
        // tożsamość nie jest skracana — pełne brzmienie w piśmie standardowym wygrywa ze
        // skrótem w piśmie celu; dawniej „FT1 · transformatorowe” stało tu jako „FT1 · tr…”).
        const sama = planSceneLabels([d.label], [...sceneObstacleRects(scena), ...inne.filter((r) => r !== d.rect)], scale, sheetSizeFor(scena), podlogaOpisowCelu(refy));
        expect(
          sama.drawn.filter((q) => q.fontSize * scale >= MIN_OPIS_CELU_KADRU_PX - 1e-6).map((q) => q.text),
          `${st}: „${d.text}" — postać celu ma miejsce, a plan narysował pismo poniżej podłogi`,
        ).toEqual([]);
        ponizejPodlogi += 1;
      }
    }
    // Piny pomiaru 2026-11-12 (zapadka w dół).
    expect(bezMiejsca).toBeLessThanOrEqual(scale === 1 ? PIN_BEZ_MIEJSCA_SKALA_1 : 0);
    expect(ponizejPodlogi).toBeLessThanOrEqual(scale === 1 ? PIN_PONIZEJ_PODLOGI_SKALA_1 : 0);
  });

  // Dwie przyczyny pisma poniżej podłogi (`planSceneLabels`, gałąź `zapasowy`): sufit proporcji
  // klasy wyklucza postać celu albo postać celu nie ma miejsca — wtedy plan rysuje postać
  // standardową. Wyrocznia „brak miejsca" niezależna od kolejności planu: postać celu tej
  // jednej etykiety nie mieści się obok przeszkód sceny i WSZYSTKICH pozostałych narysowanych
  // etykiet (gdyby się mieściła, plan zostawiłby wolne miejsce i narysował pismo za małe).
  // Pomiar 2026-10-30 (tabela posuwów kroju, karta UX-04/POLE-LINIOWE-WZORZEC §11.7 pkt 7):
  // na scenie rząd dwóch źródeł „BESS 500 kW" / „PV 500 kW" (osie co 72 jednostki) dwóch stacji
  // magistrali — „PV 500 kW" w piśmie 43,3 (220 jednostek) nie mieści się między symbolem
  // sąsiada, pionem toru i przewodem pod rzędem; obie przyczyny występują na fiksturze.
  it('skala 0,3 (poza sufitem): opis celu poniżej 13 px tylko tam, gdzie sufit proporcji klasy to wyklucza albo postać celu nie ma miejsca', () => {
    let ponizejSufit = 0;
    for (const st of stacjeRysunku) {
      const refy = refyStacji(st);
      const pelny = plan(0.3, refy);
      for (const d of pelny.drawn) {
        if (!nalezyDoZakresu(d.label.ownerRef, refy) || d.fontSize * 0.3 >= MIN_OPIS_CELU_KADRU_PX - 1e-6) continue;
        if (fontSizeForScreenFloorWithinProportion(d.label.labelClass, 0.3, MIN_OPIS_CELU_KADRU_PX) === null) {
          ponizejSufit += 1;
          continue;
        }
        const inne = pelny.drawn.filter((q) => q !== d).map((q) => q.rect);
        const sama = planSceneLabels([d.label], [...sceneObstacleRects(scena), ...inne], 0.3, sheetSizeFor(scena), podlogaOpisowCelu(refy));
        const postacCelu = sama.drawn.find((q) => q.fontSize * 0.3 >= MIN_OPIS_CELU_KADRU_PX - 1e-6);
        expect(postacCelu, `${st}: „${d.text}" — postać celu ma miejsce, a plan narysował pismo poniżej podłogi`).toBeUndefined();
      }
    }
    // Przypadek „(a) wygrywa" (sufit proporcji) występuje na fiksturze — inaczej test niczego nie pilnuje.
    expect(ponizejSufit).toBeGreaterThan(0);
  });

  it.each([0.3, 0.6, 1] as const)('skala %s: etykieta SPOZA celu ma ten sam rozmiar pisma co bez podłogi (podłoga nie powiększa sąsiadów)', (scale) => {
    for (const st of stacjeRysunku) {
      const refy = refyStacji(st);
      const bez = new Map(plan(scale).drawn.map((d) => [d.index, d.fontSize]));
      for (const d of plan(scale, refy).drawn) {
        if (nalezyDoZakresu(d.label.ownerRef, refy)) continue;
        expect(bez.get(d.index), `${st}: ${d.text}`).toBe(d.fontSize);
      }
    }
  });

  it('brak miejsca (skala 0,6): nienarysowane opisy celu występują i są policzalne — test nie jest pusty trywialnie', () => {
    let ukryte = 0;
    for (const st of stacjeRysunku) {
      const refy = refyStacji(st);
      const p = plan(0.6, refy);
      ukryte += nienarysowane(p).filter((l) => nalezyDoZakresu(l.ownerRef, refy)).length;
    }
    expect(ukryte).toBeGreaterThan(0);
  });

  it('pusty zbiór celu i brak podłogi dają identyczny plan; ten sam cel i skala — identyczny plan (determinizm)', () => {
    for (const scale of [0.3, 0.6, 1.5]) {
      expect(plan(scale, new Set())).toEqual(plan(scale));
      const refy = refyStacji(stacjeRysunku[5]!);
      expect(plan(scale, refy)).toEqual(plan(scale, new Set(refy)));
    }
  });
});
