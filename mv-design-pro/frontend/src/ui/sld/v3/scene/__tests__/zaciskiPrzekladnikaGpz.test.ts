/**
 * ZACISKI P1/P2 I TABLICZKA PRZEKŁADNIKA PRĄDOWEGO NA SCENIE POLA GPZ (karta
 * UX-04/POLE-LINIOWE-WZORZEC, decyzja architekta §11.7 pkt 6): „T1 dostaje P1 od strony szyny,
 * P2, przekładnię i klasę rdzeni z danych modelu".
 *
 * Wyrocznia niezależna od kompozycji: oznaczenia z kontraktu zacisków (`P1` = port `we`,
 * `P2` = port `wy`, PN-EN 61869-2), tekst tabliczki z rdzeni rekordu, położenie z portów symbolu
 * na scenie, kolizje z sond sceny (`labelCollisions`, `labelWireCollisions`).
 *
 * Iloczyn cech: wzorzec pola (Z.10 sekcja 1 × Z.10 sekcja 2 × Z.11 z odgałęzieniem i Z.11.1)
 * × poziom szczegółu (L0 × L1 × L2) × porty przekładnika (komplet × brak × port bez węzła ×
 * zamienione `we`/`wy` × aparat poza torem) × rdzenie (jeden × trzy × brak) × szerokość toru
 * (z przekładnikiem Ferrantiego szerszym od pierścienia × bez niego — przekładnik najszerszy).
 */
import { describe, expect, it } from 'vitest';

import type { Bay, BayPrimaryDevice, EnergyNetworkModel } from '../../../../../types/enm';
import fxStaly1 from '../../../../../harness-fixtures/generated/pole_liniowe_z10_gpz_staly_w_sekcji_1.json';
import fxStaly2 from '../../../../../harness-fixtures/generated/pole_liniowe_z10_gpz_staly_w_sekcji_2.json';
import fxZ11 from '../../../../../harness-fixtures/generated/pole_liniowe_z11_gpz_odgalezienie.json';
import { GRID } from '../../core/grid';
import { ZACISKI_PRZEKLADNIKA_PRADOWEGO, ZNACZNIK_ZACISKU_PRZEKLADNIKA } from '../../compose/zaciskiPrzekladnika';
import { SYMBOL_DEFS } from '../../symbols/defs';
import { tekstKlasRdzeni, tekstPrzekladniRdzeni } from '../../../v2/model/tabliczkaPrzekladnika';
import { buildSceneV3, labelCollisions, labelWireCollisions, type SceneV3 } from '../buildScene';

type Fikstura = { readonly snapshot: EnergyNetworkModel };
const FIKSTURY: readonly (readonly [string, EnergyNetworkModel])[] = [
  ['Z.10 sekcja 1', (fxStaly1 as unknown as Fikstura).snapshot],
  ['Z.10 sekcja 2', (fxStaly2 as unknown as Fikstura).snapshot],
  ['Z.11 i Z.11.1', (fxZ11 as unknown as Fikstura).snapshot],
];
const [ZACISK_OD_SZYNY, ZACISK_OD_ODPLYWU] = ZACISKI_PRZEKLADNIKA_PRADOWEGO.pierwotne;

const polaLiniowe = (enm: EnergyNetworkModel): readonly Bay[] =>
  (enm.bays ?? []).filter((b) => (b.tags ?? []).includes('gpz_line_field'));
const przekladnik = (bay: Bay): BayPrimaryDevice => bay.primary_devices!.find((d) => d.kind === 'CT')!;

/** Kopia modelu z podmienionym aparatem CT (albo usuniętym aparatem) w KAŻDYM polu liniowym. */
function zmienPola(enm: EnergyNetworkModel, zmiana: (devices: BayPrimaryDevice[]) => BayPrimaryDevice[]): EnergyNetworkModel {
  const kopia = structuredClone(enm);
  for (const bay of kopia.bays ?? []) {
    if ((bay.tags ?? []).includes('gpz_line_field')) bay.primary_devices = zmiana(bay.primary_devices ?? []);
  }
  return kopia;
}
const zmienCt = (enm: EnergyNetworkModel, f: (d: BayPrimaryDevice) => BayPrimaryDevice): EnergyNetworkModel =>
  zmienPola(enm, (devices) => devices.map((d) => (d.kind === 'CT' ? f(d) : d)));

const etykietyZaciskow = (scena: SceneV3, bayRef: string) =>
  scena.labels.filter((l) => l.ownerRef.startsWith(`${bayRef}${ZNACZNIK_ZACISKU_PRZEKLADNIKA}`));
const tabliczka = (scena: SceneV3, bayRef: string, deviceRef: string) =>
  scena.labels.filter((l) => l.ownerRef === `${bayRef}#ct-rating-${deviceRef}`);
const symbolCt = (scena: SceneV3, deviceRef: string) => scena.symbols.find((s) => s.meta?.deviceRef === deviceRef)!;

/** Kolizje sceny dotyczące oznaczeń zacisków i tabliczek przekładników. */
function kolizjeNowychEtykiet(scena: SceneV3): readonly string[] {
  const nasza = (ref: string) => ref.includes(ZNACZNIK_ZACISKU_PRZEKLADNIKA) || ref.includes('#ct-rating-');
  return [
    ...labelCollisions(scena).filter((k) => nasza(k.aRef) || nasza(k.bRef)).map((k) => `${k.kind}: ${k.aRef} ↔ ${k.bRef}`),
    ...labelWireCollisions(scena).filter((k) => nasza(k.ownerRef)).map((k) => `etykieta-przewód: ${k.ownerRef} (${k.text})`),
    ...((scena.meta?.stopNotes ?? []) as readonly string[]).filter((n) => n.startsWith('label.declutter') && (n.includes(ZNACZNIK_ZACISKU_PRZEKLADNIKA) || n.includes('#ct-rating-'))),
  ];
}

/** Wspólne asercje pola z oznaczeniami: P1 nad pierścieniem przy zacisku od szyny, P2 pod nim,
 *  oba poza kaflem symbolu po lewej toru; tabliczka z rdzeni nad linią pomiarową. */
function sprawdzPole(scena: SceneV3, bay: Bay, oczekiwaneZaciski: boolean, oczekiwanaTabliczka: boolean): void {
  const ct = przekladnik(bay);
  const sym = symbolCt(scena, ct.device_ref);
  const def = SYMBOL_DEFS[sym.symbolId];
  const zaciski = etykietyZaciskow(scena, bay.ref_id);
  if (!oczekiwaneZaciski) {
    expect(zaciski, `${bay.ref_id}: bez oznaczeń zacisków`).toEqual([]);
  } else {
    expect(zaciski.map((l) => l.text).sort(), bay.ref_id).toEqual([ZACISK_OD_SZYNY, ZACISK_OD_ODPLYWU]);
    const gornyPort = sym.y + def.ports.find((p) => p.dir === 'N')!.y;
    const dolnyPort = sym.y + def.ports.find((p) => p.dir === 'S')!.y;
    const gorny = zaciski.find((l) => l.text === ZACISK_OD_SZYNY)!;
    const dolny = zaciski.find((l) => l.text === ZACISK_OD_ODPLYWU)!;
    // P1 przy zacisku od szyny (góra toru), P2 przy zacisku od odpływu.
    expect(gorny.rect.y + gorny.rect.height, `${ZACISK_OD_SZYNY} nad zaciskiem górnym`).toBeLessThanOrEqual(gornyPort);
    expect(gorny.rect.y + gorny.rect.height, `${ZACISK_OD_SZYNY} przy zacisku górnym`).toBeGreaterThan(gornyPort - GRID * 2);
    expect(dolny.rect.y, `${ZACISK_OD_ODPLYWU} pod zaciskiem dolnym`).toBeGreaterThanOrEqual(dolnyPort);
    expect(dolny.rect.y, `${ZACISK_OD_ODPLYWU} przy zacisku dolnym`).toBeLessThan(dolnyPort + GRID);
    for (const l of [gorny, dolny]) {
      expect(l.rect.x + l.rect.width, `${l.text} poza kaflem symbolu`).toBeLessThanOrEqual(sym.x);
      expect(l.rect.x + l.rect.width, `${l.text} przy kaflu`).toBeGreaterThan(sym.x - GRID);
      expect(l.labelClass).toBe('t4');
    }
    // Podpis aparatu toru głównego (kolumna po lewej toru) nie styka się z oznaczeniami
    // zacisków; podpisy aparatów bocznych i odgałęzień stoją po prawej.
    const podpisy = scena.labels.filter((l) => l.ownerRef.startsWith(`${bay.ref_id}#etykieta-aparatu-`) && l.placement === 'left');
    expect(podpisy.length, 'kolumna podpisów toru głównego').toBeGreaterThan(0);
    const lewaZaciskow = Math.min(gorny.rect.x, dolny.rect.x);
    for (const podpis of podpisy) {
      expect(podpis.rect.x + podpis.rect.width, `kolumna podpisów ${podpis.text} przed oznaczeniami`).toBeLessThanOrEqual(lewaZaciskow - GRID / 2);
    }
  }
  const tab = tabliczka(scena, bay.ref_id, ct.device_ref);
  if (!oczekiwanaTabliczka) {
    expect(tab, `${bay.ref_id}: bez tabliczki`).toEqual([]);
    return;
  }
  expect(tab.map((l) => l.text)).toEqual([`${tekstPrzekladniRdzeni(ct.rdzenie)} · ${tekstKlasRdzeni(ct.rdzenie)}`]);
  // Linia pomiarowa z zacisku wtórnego (wschód) — tabliczka w wierszu nad nią.
  const wtorny = def.secondaryPorts.find((p) => p.name === 'wtorny');
  if (wtorny?.dir === 'E') {
    expect(tab[0].rect.y + tab[0].rect.height, 'tabliczka nad linią pomiarową').toBeLessThanOrEqual(sym.y + wtorny.y - GRID / 4);
  }
}

describe('zaciski pierwotne i tabliczka przekładnika — wzorce pól z fikstur generatora', () => {
  for (const [nazwa, enm] of FIKSTURY) {
    it(`${nazwa}: warunek wstępny — pola liniowe z przekładnikiem z portami i rdzeniami`, () => {
      const pola = polaLiniowe(enm);
      expect(pola.length).toBeGreaterThan(0);
      for (const bay of pola) {
        const ct = przekladnik(bay);
        expect(ct.ports?.map((p) => p.port_id).sort()).toEqual(['we', 'wy']);
        expect(ct.rdzenie?.length ?? 0).toBeGreaterThan(0);
      }
    });

    for (const lod of [0, 1, 2] as const) {
      it(`${nazwa} × L${lod}: oznaczenia wyłącznie na L2, zero kolizji`, () => {
        const scena = buildSceneV3(enm, lod);
        for (const bay of polaLiniowe(enm)) {
          if (lod === 2) sprawdzPole(scena, bay, true, true);
          else expect(etykietyZaciskow(scena, bay.ref_id), `${bay.ref_id} L${lod}`).toEqual([]);
        }
        expect(kolizjeNowychEtykiet(scena)).toEqual([]);
      });
    }

    it(`${nazwa}: Z.11 trzy rdzenie — przekładnia wspólnej strony pierwotnej i klasy z FS`, () => {
      const trojrdzeniowe = polaLiniowe(enm).filter((b) => (przekladnik(b).rdzenie?.length ?? 0) === 3);
      const scena = buildSceneV3(enm, 2);
      for (const bay of trojrdzeniowe) {
        expect(tabliczka(scena, bay.ref_id, przekladnik(bay).device_ref).map((l) => l.text)).toEqual([
          '200-400/5/5/5 A · 0,2S FS5 / 0,2 FS5 / 5P20',
        ]);
      }
    });

    const WARIANTY: readonly (readonly [string, (e: EnergyNetworkModel) => EnergyNetworkModel, boolean, boolean])[] = [
      ['brak portów przekładnika', (e) => zmienCt(e, (d) => ({ ...d, ports: [] })), false, true],
      [
        'port „we" bez węzła pola',
        (e) => zmienCt(e, (d) => ({ ...d, ports: (d.ports ?? []).map((p) => (p.port_id === 'we' ? { ...p, wezel: null } : p)) as never })),
        false,
        true,
      ],
      [
        'porty zamienione (we ↔ wy) — aparat poza torem, orientacji brak w modelu',
        (e) => zmienCt(e, (d) => ({ ...d, ports: (d.ports ?? []).map((p) => ({ ...p, port_id: p.port_id === 'we' ? 'wy' : 'we' })) })),
        false,
        true,
      ],
      ['pole rdzeni nieobecne — bez tabliczki, zaciski zostają', (e) => zmienCt(e, (d) => ({ ...d, rdzenie: undefined })), true, false],
      ['pusta lista rdzeni', (e) => zmienCt(e, (d) => ({ ...d, rdzenie: [] })), true, false],
      [
        'bez przekładnika Ferrantiego — pierścień w najszerszym kaflu toru (pasmo zacisków w rezerwie)',
        (e) => zmienPola(e, (devices) => devices.filter((d) => d.kind !== 'CORE_BALANCE_CT')),
        true,
        true,
      ],
    ];
    for (const [opis, zmiana, zaciski, tab] of WARIANTY) {
      it(`${nazwa} × ${opis}`, () => {
        const zmieniony = zmiana(enm);
        const scena = buildSceneV3(zmieniony, 2);
        for (const bay of polaLiniowe(zmieniony)) sprawdzPole(scena, bay, zaciski, tab);
        expect(kolizjeNowychEtykiet(scena)).toEqual([]);
      });
    }
  }

  it('determinizm: dwa przebiegi — te same oznaczenia, prostokąty i właściciele', () => {
    const [, enm] = FIKSTURY[2];
    const zrzut = (s: SceneV3) =>
      s.labels.filter((l) => l.ownerRef.includes(ZNACZNIK_ZACISKU_PRZEKLADNIKA) || l.ownerRef.includes('#ct-rating-')).map((l) => [l.ownerRef, l.text, l.rect]);
    expect(zrzut(buildSceneV3(enm, 2))).toEqual(zrzut(buildSceneV3(enm, 2)));
  });
});
