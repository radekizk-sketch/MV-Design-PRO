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
 * (z przekładnikiem Ferrantiego szerszym od pierścienia × bez niego — przekładnik najszerszy)
 * × przewód przy zacisku po stronie oznaczeń (żaden × odczep uziemnika z węzła zacisku dolnego
 * × z węzła zacisku górnego — wtedy oznaczenie tego zacisku przechodzi na stronę podpisów).
 *
 * Położenie oznaczeń (korekta po oględzinach zrzutów 2026-10-30): P1 przy zacisku górnym, P2 przy
 * dolnym, po stronie przeciwnej do podpisu aparatu, zero przecięć — wyrocznia
 * `oznaczeniaZaciskow.ts` (wspólna z testem kanwy). Iniekcja dawnego zaczepu (wiersze całkiem
 * nad i pod pierścieniem, po lewej) — ostatni test pliku.
 */
import { describe, expect, it } from 'vitest';

import type { Bay, BayPrimaryDevice, EnergyNetworkModel } from '../../../../../types/enm';
import fxStaly1 from '../../../../../harness-fixtures/generated/pole_liniowe_z10_gpz_staly_w_sekcji_1.json';
import fxStaly2 from '../../../../../harness-fixtures/generated/pole_liniowe_z10_gpz_staly_w_sekcji_2.json';
import fxZ11 from '../../../../../harness-fixtures/generated/pole_liniowe_z11_gpz_odgalezienie.json';
import { GRID, snapDown, snapUp } from '../../core/grid';
import { labelLineHeight, measureLabelWidth } from '../../core/text';
import { ZACISKI_PRZEKLADNIKA_PRADOWEGO, ZNACZNIK_ZACISKU_PRZEKLADNIKA } from '../../compose/zaciskiPrzekladnika';
import { SYMBOL_DEFS } from '../../symbols/defs';
import { tekstKlasRdzeni, tekstPrzekladniRdzeni } from '../../../v2/model/tabliczkaPrzekladnika';
import { buildSceneV3, labelCollisions, labelWireCollisions, sceneObstacleRects, type SceneV3 } from '../buildScene';
import { naruszeniaOznaczeniaZacisku, type StronaOznaczenia } from './oznaczeniaZaciskow';

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
/** Uziemnik pola (rekord `ES` fikstury albo nowy, gdy pole go nie ma) przyłączony do węzła
 *  portu `port` przekładnika — odczep aparatu bocznego wychodzi wtedy z węzła tego zacisku. */
function naWezleZacisku(devices: BayPrimaryDevice[], port: 'we' | 'wy'): BayPrimaryDevice[] {
  const ct = devices.find((d) => d.kind === 'CT')!;
  const wezel = ct.ports!.find((p) => p.port_id === port)!.wezel;
  const es = devices.find((d) => d.kind === 'ES');
  const uziemnik: BayPrimaryDevice = {
    ...(es ?? { ...ct, device_ref: `${ct.device_ref}-es`, kind: 'ES', designation: 'Q8', rdzenie: undefined }),
    ports: [{ port_id: 'przylacze', wezel }],
  } as BayPrimaryDevice;
  return [...devices.filter((d) => d.kind !== 'ES'), uziemnik];
}

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

/** Wspólne asercje pola z oznaczeniami: P1 przy zacisku górnym (od szyny), P2 przy dolnym,
 *  po stronie `strony` (domyślnie prawej — przeciwnej do kolumny podpisów aparatów toru), bez
 *  przecięć z bryłami symboli, przewodami i innymi etykietami sceny (`oznaczeniaZaciskow.ts`);
 *  tabliczka z rdzeni nad linią pomiarową. */
function sprawdzPole(
  scena: SceneV3,
  bay: Bay,
  oczekiwaneZaciski: boolean,
  oczekiwanaTabliczka: boolean,
  strony: { readonly odSzyny: StronaOznaczenia; readonly odOdplywu: StronaOznaczenia } = { odSzyny: 'right', odOdplywu: 'right' },
): void {
  const ct = przekladnik(bay);
  const sym = symbolCt(scena, ct.device_ref);
  const def = SYMBOL_DEFS[sym.symbolId];
  const zaciski = etykietyZaciskow(scena, bay.ref_id);
  if (!oczekiwaneZaciski) {
    expect(zaciski, `${bay.ref_id}: bez oznaczeń zacisków`).toEqual([]);
  } else {
    expect(zaciski.map((l) => l.text).sort(), bay.ref_id).toEqual([ZACISK_OD_SZYNY, ZACISK_OD_ODPLYWU]);
    const kafel = { x: sym.x, y: sym.y, width: def.width, height: def.height };
    const gornyPort = sym.y + def.ports.find((p) => p.dir === 'N')!.y;
    const dolnyPort = sym.y + def.ports.find((p) => p.dir === 'S')!.y;
    const przeszkody = [
      ...sceneObstacleRects(scena).map((rect, i) => ({ opis: `przeszkoda sceny ${i}`, rect })),
      ...scena.labels.map((l) => ({ opis: `etykieta „${l.text}" (${l.ownerRef.slice(-40)})`, rect: l.rect, ownerRef: l.ownerRef })),
    ];
    for (const [tekst, y, strona] of [
      [ZACISK_OD_SZYNY, gornyPort, strony.odSzyny],
      [ZACISK_OD_ODPLYWU, dolnyPort, strony.odOdplywu],
    ] as const) {
      const l = zaciski.find((z) => z.text === tekst)!;
      expect(l.labelClass).toBe('t4');
      const inne = przeszkody.filter((p) => !('ownerRef' in p) || p.ownerRef !== l.ownerRef);
      expect(naruszeniaOznaczeniaZacisku(tekst, l.rect, { y, kafel, strona }, inne), `${bay.ref_id}: ${tekst}`).toEqual([]);
    }
    // Strona prawa = przeciwna do podpisu aparatu: podpis T1 stoi w kolumnie po lewej toru.
    const podpisT1 = scena.labels.find((l) => l.ownerRef.endsWith(`#etykieta-aparatu-${ct.device_ref}`));
    expect(podpisT1, `${bay.ref_id}: podpis przekładnika`).toBeDefined();
    expect(podpisT1!.rect.x + podpisT1!.rect.width, 'podpis przekładnika po lewej kafla').toBeLessThanOrEqual(sym.x);
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

    type Strony = { readonly odSzyny: StronaOznaczenia; readonly odOdplywu: StronaOznaczenia };
    const WARIANTY: readonly (readonly [string, (e: EnergyNetworkModel) => EnergyNetworkModel, boolean, boolean, ((fikstura: string) => Strony)?])[] = [
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
        'bez przekładnika Ferrantiego — kafel przekładnika na krawędzi toru, oznaczenia po prawej kafla',
        (e) => zmienPola(e, (devices) => devices.filter((d) => d.kind !== 'CORE_BALANCE_CT')),
        true,
        true,
      ],
      [
        'uziemnik na węźle zacisku dolnego bez wskaźnika napięcia — odczep przy P2, P2 po stronie podpisów',
        (e) => zmienPola(e, (devices) => naWezleZacisku(devices.filter((d) => d.kind !== 'VOLTAGE_INDICATOR'), 'wy')),
        true,
        true,
        () => ({ odSzyny: 'right', odOdplywu: 'left' }),
      ],
      [
        'uziemnik na węźle zacisku górnego — odczep przy P1 (Z.10), P1 po stronie podpisów',
        (e) => zmienPola(e, (devices) => naWezleZacisku(devices, 'we')),
        true,
        true,
        // Z.10: przekładnik wisi tuż pod wyłącznikiem (węzeł `w2` = przewód 8 j.św. między
        // kaflami), więc odczep z węzła wychodzi przy zacisku górnym. Z.11/Z.11.1: węzeł `w2`
        // niesie odgałęzienie przekładnika napięciowego i tor biegnie długim przewodem od
        // wyłącznika do przekładnika — odczep wychodzi pod wyłącznikiem, daleko nad P1.
        (fikstura) => (fikstura.startsWith('Z.10') ? { odSzyny: 'left', odOdplywu: 'right' } : { odSzyny: 'right', odOdplywu: 'right' }),
      ],
    ];
    for (const [opis, zmiana, zaciski, tab, strony] of WARIANTY) {
      it(`${nazwa} × ${opis}`, () => {
        const zmieniony = zmiana(enm);
        const scena = buildSceneV3(zmieniony, 2);
        for (const bay of polaLiniowe(zmieniony)) sprawdzPole(scena, bay, zaciski, tab, strony?.(nazwa));
        expect(kolizjeNowychEtykiet(scena)).toEqual([]);
      });
    }
  }

  it('iniekcja dawnego zaczepu (po lewej, wiersz całkiem nad zaciskiem górnym i całkiem pod dolnym) — wyrocznia czerwona', () => {
    for (const [nazwa, enm] of FIKSTURY) {
      const scena = buildSceneV3(enm, 2);
      for (const bay of polaLiniowe(enm)) {
        const ct = przekladnik(bay);
        const sym = symbolCt(scena, ct.device_ref);
        const def = SYMBOL_DEFS[sym.symbolId];
        const kafel = { x: sym.x, y: sym.y, width: def.width, height: def.height };
        const wysokosc = labelLineHeight('t4');
        for (const [tekst, port, dawnaGora] of [
          [ZACISK_OD_SZYNY, sym.y + def.ports.find((p) => p.dir === 'N')!.y, (y: number) => snapDown(y - wysokosc)],
          [ZACISK_OD_ODPLYWU, sym.y + def.ports.find((p) => p.dir === 'S')!.y, (y: number) => snapUp(y)],
        ] as const) {
          const szerokosc = measureLabelWidth(tekst, 't4');
          const dawny = { x: sym.x - szerokosc, y: dawnaGora(port), width: szerokosc, height: wysokosc };
          const bledy = naruszeniaOznaczeniaZacisku(tekst, dawny, { y: port, kafel, strona: 'right' }, []);
          expect(bledy.length, `${nazwa} ${bay.ref_id} ${tekst}: dawny zaczep ${JSON.stringify(dawny)} narusza wymaganie`).toBeGreaterThan(0);
          expect(bledy.some((b) => b.includes('od kotwicy zacisku')), `${nazwa} ${tekst}: odległość od kotwicy`).toBe(true);
        }
      }
    }
  });

  it('determinizm: dwa przebiegi — te same oznaczenia, prostokąty i właściciele', () => {
    const [, enm] = FIKSTURY[2];
    const zrzut = (s: SceneV3) =>
      s.labels.filter((l) => l.ownerRef.includes(ZNACZNIK_ZACISKU_PRZEKLADNIKA) || l.ownerRef.includes('#ct-rating-')).map((l) => [l.ownerRef, l.text, l.rect]);
    expect(zrzut(buildSceneV3(enm, 2))).toEqual(zrzut(buildSceneV3(enm, 2)));
  });
});
