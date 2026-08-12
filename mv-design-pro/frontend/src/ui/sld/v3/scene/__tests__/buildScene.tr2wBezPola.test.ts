/**
 * TR2W-BEZ-POLA — transformator stacji SN/nN rysowany TAKŻE bez jawnego pola
 * roli TR (karta naprawcza; `REJESTR_KONFLIKTOW.md`, wiersz BUGI-PRODUKTU-E2E).
 *
 * DŁUG. Kompozycja v3 zbierała porty LV WYŁĄCZNIE z pól roli TRANSFORMER/
 * RMU_TRANSFORMER, więc stacja o `sn_fields:['IN','OUT','FEEDER']` (wzorzec 29
 * specyfikacji e2e, w tym `critical-run-flow`) NIGDY nie rysowała
 * `transformer2W` ani strony nN — mimo że model ENM niósł rekord `Transformer`
 * zawieszony na szynach stacji i solver go liczył. Rysunek milczał o elemencie,
 * który UCZESTNICZY W OBLICZENIACH — krytyczna niespójność
 * model↔obliczenia↔dokumentacja.
 *
 * ZASADA (§0.B karty). SLD jest PROJEKCJĄ rzeczywistej topologii obliczeniowej:
 * `Transformer(bus_sn, bus_lv)` istnieje ⇒ MUSI być na rysunku. Równocześnie
 * „goły transformator" (bez pola) NIE jest równoprawnym wariantem — to
 * konfiguracja NIEKOMPLETNA, którą rysunek ma pokazać JAKO niekompletną.
 *
 * ILOCZYN CECH (reguła KLASA §2 — nie przykład z karty, tylko iloczyn cech, w
 * których defekt mógłby się schować):
 *   T1  pole TR obecne                       → ZERO regresu (podpis sceny)
 *   T2  pole TR nieobecne                    → symbol + szyna nN + OSTRZEŻENIE
 *                                              + ZERO fabrykowanej aparatury
 *   T3  brak rekordu Transformer             → ZERO symbolu (i zero szyny nN)
 *   T4  2× TR na JEDNEJ sekcji               → dwa niezależne tory
 *   T5  TR1 sekcja A, TR2 sekcja B           → każdy ze SWOJEJ sekcji
 *   T6  TR bez pola + DER nN                 → pełny tor SN→TR→szyna nN→DER
 *   T7  TR bez pola, ZERO rekordów Load      → ZERO fikcyjnego odbioru
 *   T8  potrzeby własne W MODELU             → odbiór widoczny
 * × poziomy LOD 1/2 tam, gdzie kontrakt LOD ma znaczenie (§0.C.8: transformator
 * bez pola pojawia się na TYCH SAMYCH poziomach co transformator z polem).
 *
 * Wejście T1–T3, T6–T8: fixtura `stacjaPolePomiarowe.enm.json` wygenerowana
 * REALNYMI operacjami domenowymi backendu (GPZ + stacja z polami
 * [IN, OUT, MEASUREMENT, TR] + transformator + szyna nN), przekształcana
 * DETERMINISTYCZNIE — usunięcie pola roli TR odtwarza DOKŁADNIE kształt danych
 * z 29 specyfikacji e2e (pola bez „TR" + rekord `Transformer` obecny), bez
 * dopisywania czegokolwiek do modelu.
 *
 * T4/T5 (rozdzielnica sekcjonowana z dwoma transformatorami) żyją w
 * `compose/__tests__/station.tr2wBezPola.test.ts` — tam, gdzie mieszka kotwica
 * topologiczna; fixtury referencyjne nie niosą stacji sekcjonowanej, a kreator
 * backendu jej nie produkuje, więc fixtura sceny byłaby zmyśleniem danych,
 * których operacja domenowa nie generuje.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { STATION_TR_FIELD_GAP_TEXT } from '../../layout/measure';
import { buildSceneV3, type SceneLod, type SceneV3 } from '../buildScene';
import { sceneSignature } from './syntheticNetworks';

const here = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): EnergyNetworkModel {
  const raw = JSON.parse(readFileSync(resolve(here, 'fixtures', name), 'utf8')) as {
    readonly enm: EnergyNetworkModel;
  };
  return raw.enm;
}

const clone = (enm: EnergyNetworkModel): EnergyNetworkModel =>
  JSON.parse(JSON.stringify(enm)) as EnergyNetworkModel;

/** Stacja SN/nN fixtury (ta z polami i transformatorem, nie GPZ). */
function stationOf(enm: EnergyNetworkModel): Record<string, any> {
  const station = (enm.substations ?? []).find((s) => s.ref_id.includes('/station'));
  if (!station) throw new Error('fixtura bez stacji SN/nN');
  return station as unknown as Record<string, any>;
}

/**
 * Usuwa JAWNE pole roli TR ze specyfikacji pól stacji — dokładnie ten kształt
 * danych, który produkuje `insert_station_on_segment_sn` z
 * `sn_fields:['IN','OUT','FEEDER']` + `transformer:{create:true}`: rekord
 * `Transformer` zostaje (model liczy), pola transformatorowego nie ma.
 * Aparat pola TR znika razem z polem (żeby nie zostawić osieroconego łącznika).
 */
function bezPolaTr(enm: EnergyNetworkModel): EnergyNetworkModel {
  const out = clone(enm);
  const station = stationOf(out);
  const specs: Record<string, any>[] = station.meta.field_specs;
  const trSpec = specs.find((s) => s.bay_role === 'TR');
  if (!trSpec) throw new Error('fixtura wejściowa nie ma pola roli TR');
  const usunieteAparaty = new Set<string>(
    (trSpec.equipment_refs as string[]).filter((ref) => !ref.endsWith('/transformer')),
  );
  station.meta.field_specs = specs.filter((s) => s.bay_role !== 'TR');
  (out as any).branches = (out.branches ?? []).filter((b) => !usunieteAparaty.has(b.ref_id));
  (out as any).bays = (out.bays ?? []).filter((b) => !usunieteAparaty.has(b.ref_id));
  return out;
}

/** Usuwa rekord(y) `Transformer` stacji SN/nN (GPZ nietknięty) — T3. */
function bezTransformatora(enm: EnergyNetworkModel): EnergyNetworkModel {
  const out = bezPolaTr(enm);
  const station = stationOf(out);
  const trefs = new Set<string>(station.transformer_refs ?? []);
  station.transformer_refs = [];
  (out as any).transformers = (out.transformers ?? []).filter((t) => !trefs.has(t.ref_id));
  return out;
}

/** Szyna nN stacji — `Bus` o `voltage_kv <= 0,5` należący do stacji. */
function nnBusRef(enm: EnergyNetworkModel): string {
  const station = stationOf(enm);
  const busRefs = new Set<string>(station.bus_refs ?? []);
  const bus = (enm.buses ?? []).find(
    (b) => busRefs.has(b.ref_id) && typeof b.voltage_kv === 'number' && b.voltage_kv <= 0.5,
  );
  if (!bus) throw new Error('fixtura bez szyny nN');
  return bus.ref_id;
}

/** Odbiór potrzeb własnych stacji na szynie nN (wzór `_materialize_station_
 *  auxiliary_load` backendu: rekord `Load` na `nn_bus`) — T8. */
function zPotrzebamiWlasnymi(enm: EnergyNetworkModel): EnergyNetworkModel {
  const out = bezPolaTr(enm);
  const busRef = nnBusRef(out);
  (out as any).loads = [
    ...(out.loads ?? []),
    {
      ref_id: 'stn/test/aux_load',
      name: 'Potrzeby własne stacji',
      bus_ref: busRef,
      p_mw: 0.005,
      q_mvar: 0.002,
      model: 'pq',
      tags: ['station_auxiliary'],
      meta: { load_role: 'STACJA_POTRZEBY_WLASNE' },
    },
  ];
  return out;
}

/** Źródło DER przyłączone do szyny nN stacji — T6. */
function zDerNaNn(enm: EnergyNetworkModel): EnergyNetworkModel {
  const out = bezPolaTr(enm);
  const busRef = nnBusRef(out);
  (out as any).generators = [
    ...(out.generators ?? []),
    {
      // Kształt rekordu 1:1 z fixtury referencyjnej `sldSubstrate52s`
      // (`station_ref` + `connection_variant:'nn_side'` + `gen_type`).
      ref_id: 'gen/test/pv-nn',
      name: 'PV nN',
      bus_ref: busRef,
      gen_type: 'pv_inverter',
      p_mw: 0.4,
      quantity: 1,
      connection_variant: 'nn_side',
      station_ref: stationOf(out).ref_id,
      meta: {},
    },
  ];
  return out;
}

const transformatoryStacji = (scene: SceneV3): SceneV3['symbols'] =>
  scene.symbols.filter(
    (s) => s.symbolId === 'transformer2W' && (s.meta?.ownerRef ?? '').startsWith('stn/'),
  );

const segmentyKonczaceSie = (scene: SceneV3, suffix: string): SceneV3['segments'] =>
  scene.segments.filter((s) => (s.meta?.ownerRef ?? '').endsWith(suffix));

const enmZPolem = loadFixture('stacjaPolePomiarowe.enm.json');

// ---------------------------------------------------------------------------
// T1 — stacja Z polem TR: ZERO REGRESU.
// ---------------------------------------------------------------------------

describe('TR2W-BEZ-POLA T1 — stacja Z polem transformatorowym: zero regresu', () => {
  // Zapadka na cały rysunek: dowolna zmiana geometrii/symboli/etykiet stacji z
  // polem TR zmienia ten podpis. Wartość NIE jest wpisana na sztywno (byłaby
  // zaklęciem) — porównujemy scenę z tą samą sceną policzoną dwa razy ORAZ
  // sprawdzamy niezmienniki, które karta zobowiązała się utrzymać.
  for (const lod of [1, 2] as SceneLod[]) {
    it(`L${lod}: transformator nadal wewnątrz stosu pola TR — bez markera i bez wiersza braku`, () => {
      const scene = buildSceneV3(enmZPolem, lod);
      const tr = transformatoryStacji(scene);
      expect(tr.length).toBe(1);
      // Kluczowanie po POLU (aparat stosu), nie po refie transformatora —
      // dowód, że ścieżka polowa nie została podmieniona na nową.
      expect(tr[0].meta?.ownerRef).toContain('/sn_field/');
      expect(tr[0].meta?.transformerFieldGap).toBeUndefined();
      expect(scene.labels.some((l) => l.text === STATION_TR_FIELD_GAP_TEXT)).toBe(false);
      expect(
        scene.meta.stopNotes.some((n) => n.includes('skonfigurowanego pola transformatorowego')),
      ).toBe(false);
    });
  }

  it('L2: pełny podpis sceny stacji Z polem TR jest STABILNY (determinizm rysunku)', () => {
    const a = JSON.stringify(buildSceneV3(enmZPolem, 2));
    const b = JSON.stringify(buildSceneV3(clone(enmZPolem), 2));
    expect(a).toBe(b);
  });

  /**
   * ODCISK RYSUNKU — zapadka na ZERO REGRESU geometrii (§0.C.7 karty).
   *
   * DLACZEGO ODCISK, A NIE SAM DETERMINIZM. Porównanie „scena == ta sama
   * scena" przechodzi także wtedy, gdy CAŁA geometria przesunie się o stałą —
   * bo obie strony równania są zepsute tak samo. Pomiar iniekcją (dryf osi
   * kolumny pola o 8 j.św. w `compose/station.ts`) pokazał to wprost: zestaw
   * asercji wyżej pozostał ZIELONY, mimo że rysunek stacji był przesunięty.
   * Odcisk podpisu sceny (symbole + trasy + etykiety) łapie KAŻDĄ zmianę
   * rysunku stacji Z polem TR, także jednostajną.
   *
   * POCHODZENIE WARTOŚCI: policzone na ścieżce polowej PO tej karcie i
   * porównane ze stanem SPRZED niej (źródła przywrócone do commitu bazowego
   * `d232b592`, ten sam probe) — IDENTYCZNE, co jest dowodem, że kotwica
   * topologiczna nie tknęła stacji z polem transformatorowym. Aktualizacja
   * odcisku wymaga ZAMIERZONEJ zmiany rysunku, opisanej w tym samym commicie
   * (wzór `kosztSceny.test.ts`).
   */
  const ODCISK_Z_POLEM_TR: Readonly<Record<1 | 2, string>> = {
    1: '287797929716b1b46306cc4af7293823',
    2: 'bf74045d9485d831c6461bc90986c24d',
  };
  for (const lod of [1, 2] as const) {
    it(`L${lod}: odcisk rysunku stacji Z polem TR bez zmian (zapadka na dryf geometrii)`, () => {
      const odcisk = createHash('sha256')
        .update(sceneSignature(buildSceneV3(enmZPolem, lod)))
        .digest('hex')
        .slice(0, 32);
      expect(odcisk).toBe(ODCISK_Z_POLEM_TR[lod]);
    });
  }

  it('L2: aparatura pola TR (rozłącznik/uziemnik) NADAL na rysunku — nie zniknęła przy naprawie', () => {
    const scene = buildSceneV3(enmZPolem, 2);
    const aparatyPolaTr = scene.symbols.filter(
      (s) =>
        (s.meta?.ownerRef ?? '').includes('/sn_field/')
        && s.symbolId !== 'transformer2W'
        && s.symbolId !== 'cableHead',
    );
    expect(aparatyPolaTr.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// T2 — stacja BEZ pola TR: symbol + strona nN + ostrzeżenie, zero fabrykacji.
// ---------------------------------------------------------------------------

describe('TR2W-BEZ-POLA T2 — stacja BEZ pola transformatorowego', () => {
  const enm = bezPolaTr(enmZPolem);

  it('dane wejściowe naprawdę nie mają pola roli TR (zapadka na fikstury)', () => {
    const specs = stationOf(enm).meta.field_specs as Record<string, any>[];
    expect(specs.some((s) => s.bay_role === 'TR')).toBe(false);
    // …a transformator w modelu JEST (inaczej test nie ćwiczyłby niczego).
    expect((enm.transformers ?? []).some((t) => t.ref_id.includes('/transformer'))).toBe(true);
  });

  for (const lod of [1, 2] as SceneLod[]) {
    it(`L${lod}: symbol transformatora WIDOCZNY i kluczowany REALNYM Transformer.ref_id`, () => {
      const scene = buildSceneV3(enm, lod);
      const tr = transformatoryStacji(scene);
      expect(tr.length).toBe(1);
      const ref = tr[0].meta?.ownerRef ?? '';
      expect((enm.transformers ?? []).some((t) => t.ref_id === ref)).toBe(true);
    });

    it(`L${lod}: szyna nN WIDOCZNA (strona nN wynika z modelu, nie z pola rozdzielni)`, () => {
      const scene = buildSceneV3(enm, lod);
      expect(segmentyKonczaceSie(scene, '#lv-bus').length).toBe(1);
    });

    it(`L${lod}: OSTRZEŻENIE o stanie niekompletnym obecne (marker + zdanie + ślad audytu)`, () => {
      const scene = buildSceneV3(enm, lod);
      expect(transformatoryStacji(scene)[0].meta?.transformerFieldGap).toBe(true);
      expect(scene.labels.some((l) => l.text === STATION_TR_FIELD_GAP_TEXT)).toBe(true);
      // Ślad audytu sceny (wzorzec `der.sn.torNiepelny` — kod kompozycji
      // przekładany na zdanie diagnostyczne, nie duplikowany na rysunku).
      const trRef = transformatoryStacji(scene)[0].meta?.ownerRef ?? '';
      expect(
        scene.meta.stopNotes.some(
          (n) => n.includes(trRef) && n.includes('skonfigurowanego pola transformatorowego'),
        ),
      ).toBe(true);
    });

    it(`L${lod}: ZERO fabrykowanej aparatury pola — kolumna transformatora niesie SAM transformator`, () => {
      const scene = buildSceneV3(enm, lod);
      const trRef = transformatoryStacji(scene)[0].meta?.ownerRef ?? '';
      // Nic innego nie może być kluczowane refem transformatora: żaden
      // wyłącznik, rozłącznik, rozłącznik bezpiecznikowy, bezpiecznik, CT, VT,
      // uziemnik ani przekaźnik (§0.C.4 „zakaz fabrykacji").
      const przyTransformatorze = scene.symbols.filter(
        (s) => s.meta?.ownerRef === trRef && s.symbolId !== 'transformer2W',
      );
      expect(przyTransformatorze.map((s) => s.symbolId)).toEqual([]);
      // …ani liczba aparatów stacji nie może urosnąć względem wariantu, w
      // którym transformatora nie ma wcale (poza samym transformatorem).
      const bezTr = buildSceneV3(bezTransformatora(enmZPolem), lod);
      const aparaty = (sc: SceneV3): number =>
        sc.symbols.filter((s) => s.symbolId !== 'transformer2W' && s.symbolId !== 'loadArrow').length;
      expect(aparaty(scene)).toBe(aparaty(bezTr));
    });

    it(`L${lod}: pion z szyny SN do transformatora istnieje (tor przyłączenia narysowany)`, () => {
      const scene = buildSceneV3(enm, lod);
      const trRef = transformatoryStacji(scene)[0].meta?.ownerRef ?? '';
      const zejscie = scene.segments.find((s) => s.meta?.ownerRef === `${trRef}#descent`);
      expect(zejscie).toBeDefined();
      expect(zejscie!.points.length).toBe(2);
      // Pion: ta sama współrzędna X u góry i u dołu.
      expect(zejscie!.points[0].x).toBe(zejscie!.points[1].x);
    });
  }

  it('L0: stacja zwinięta — kontrakt LOD bez zmian (żadnych symboli aparatów, jak przy polu TR)', () => {
    const bezPola = buildSceneV3(enm, 0);
    const zPolem = buildSceneV3(enmZPolem, 0);
    const symbole = (sc: SceneV3): string[] => sc.symbols.map((s) => s.symbolId).sort();
    expect(symbole(bezPola)).toEqual(symbole(zPolem));
  });

  it('determinizm: dwa wywołania ⇒ identyczny JSON sceny (L2)', () => {
    expect(JSON.stringify(buildSceneV3(enm, 2))).toBe(
      JSON.stringify(buildSceneV3(bezPolaTr(enmZPolem), 2)),
    );
  });
});

// ---------------------------------------------------------------------------
// T3 — brak rekordu Transformer: rysunek NIE wymyśla elementu.
// ---------------------------------------------------------------------------

describe('TR2W-BEZ-POLA T3 — brak transformatora w modelu', () => {
  const enm = bezTransformatora(enmZPolem);

  for (const lod of [1, 2] as SceneLod[]) {
    it(`L${lod}: ZERO symboli transformatora stacji i ZERO szyny nN`, () => {
      const scene = buildSceneV3(enm, lod);
      expect(transformatoryStacji(scene).length).toBe(0);
      expect(segmentyKonczaceSie(scene, '#lv-bus').length).toBe(0);
      expect(scene.labels.some((l) => l.text === STATION_TR_FIELD_GAP_TEXT)).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// T6/T7/T8 — strona nN WYŁĄCZNIE z modelu.
// ---------------------------------------------------------------------------

describe('TR2W-BEZ-POLA T6 — transformator bez pola + DER na nN: pełny tor', () => {
  const enm = zDerNaNn(enmZPolem);

  for (const lod of [1, 2] as SceneLod[]) {
    it(`L${lod}: SN → transformator → szyna nN → źródło DER (każde ogniwo obecne)`, () => {
      const scene = buildSceneV3(enm, lod);
      const tr = transformatoryStacji(scene);
      expect(tr.length).toBe(1);
      expect(segmentyKonczaceSie(scene, '#descent').length).toBeGreaterThan(0);
      expect(segmentyKonczaceSie(scene, '#lv-bus').length).toBe(1);
      // Źródło DER zaczepione za transformatorem (rząd nN).
      const der = scene.symbols.filter((s) => (s.meta?.ownerRef ?? '').startsWith('gen/test/'));
      expect(der.length).toBe(1);
      expect(segmentyKonczaceSie(scene, '#der-row-bus').length).toBeGreaterThan(0);
      // …i nie zgubiliśmy przy tym ostrzeżenia o braku pola.
      expect(tr[0].meta?.transformerFieldGap).toBe(true);
    });
  }
});

describe('TR2W-BEZ-POLA T7 — transformator bez pola, ZERO rekordów Load', () => {
  const enm = bezPolaTr(enmZPolem);

  it('zapadka: fixtura naprawdę nie niesie odbioru na szynie nN', () => {
    const busRef = nnBusRef(enm);
    expect((enm.loads ?? []).some((l) => l.bus_ref === busRef)).toBe(false);
  });

  for (const lod of [1, 2] as SceneLod[]) {
    it(`L${lod}: ZERO strzałek odbioru — rysunek pisze jawną granicę modelu, nie fikcyjny odbiór`, () => {
      const scene = buildSceneV3(enm, lod);
      expect(scene.symbols.filter((s) => s.symbolId === 'loadArrow').length).toBe(0);
      expect(segmentyKonczaceSie(scene, '#lv-load-drop').length).toBe(0);
      expect(scene.labels.some((l) => l.text === 'granica modelu — bez odbiorów nN')).toBe(true);
    });
  }
});

describe('TR2W-BEZ-POLA T8 — potrzeby własne stacji W MODELU', () => {
  const enm = zPotrzebamiWlasnymi(enmZPolem);

  for (const lod of [1, 2] as SceneLod[]) {
    it(`L${lod}: odbiór nN WIDOCZNY (strzałka + pion z szyny nN)`, () => {
      const scene = buildSceneV3(enm, lod);
      expect(scene.symbols.filter((s) => s.symbolId === 'loadArrow').length).toBe(1);
      expect(segmentyKonczaceSie(scene, '#lv-load-drop').length).toBe(1);
      // Granica modelu ZNIKA, gdy odbiór jest realny (predykat parami).
      expect(scene.labels.some((l) => l.text === 'granica modelu — bez odbiorów nN')).toBe(false);
    });
  }
});
