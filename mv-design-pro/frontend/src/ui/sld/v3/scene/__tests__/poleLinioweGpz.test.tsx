/**
 * Karta UX-04/POLE-LINIOWE-WZORZEC — pole liniowe SN GPZ wg ENEA Zeszyt 1 (Z.10, Z.11.1, Z.11)
 * na scenie kanwy (`buildSceneV3`), z modelu zbudowanego operacjami backendu (fikstury
 * generatora: `pole_liniowe_z10_gpz_staly_w_sekcji_{1,2}` — GPZ 110/15 kV, dwie sekcje SN, w jednej
 * sekcji Z.10 z łącznikiem trójpołożeniowym, w drugiej Z.10 z wyłącznikiem stałym i odłącznikiem
 * szynowym (§13); `pole_liniowe_z11_gpz_odgalezienie` — sekcja 1: Z.11.1 z łącznikiem
 * trójpołożeniowym (klasa mieszana), sekcja 2: Z.11 z wyłącznikiem stałym (klasa dedykowana
 * wytwórcy); wykonania ustawione `set_bay_equipment`; w każdej sekcji jedno pole zajęte kablem
 * odejścia i jedno wolne).
 *
 * ILOCZYN CECH (reguła KLASA §2):
 *   wykonanie pola {Z.10, Z.11.1, Z.11} × wykonanie łączników {trójpołożeniowy, stały
 *   z odłącznikiem} × sekcja {1, 2} × pole {zajęte, wolne}
 *   × łącznik szynowy Q1 {zamknięty, otwarty, uziemiony (tylko trójpołożeniowy), brak rekordu}
 *   × wyłącznik Q0 {zamknięty, otwarty, nieznany (rekord sprzeczny ze statusem gałęzi)}
 *   × motyw {ciemny, jasny}.
 * Pola Z.11.1/Z.11 rysują ODGAŁĘZIENIE przekładnika napięciowego od strony linii (za
 * wyłącznikiem, rozszerzenie 4 karty) jako kolumnę na prawo od toru głównego, z odczepem
 * z portu wyłącznika. Położenia ustawiane są na REKORDACH modelu (`BayPrimaryDevice.switch_state`,
 * `Branch.status`) tak, jak zapisują je operacje backendu — scena czyta je tą samą drogą co kanwa.
 *
 * Wyrocznie niezależne od kodu kompozycji: tabele odczytu Z.10/Z.11.1/Z.11 (kolejność oznaczeń
 * toru głównego i odgałęzienia, `docs/uiux/GPZ_SN_ENEA_ODCZYT_RYSUNKOW_2026-10-28.md`), porty
 * z `SYMBOL_DEFS` (przewód port → port), tabela położenie → ramka, gabaryty i prostokąty
 * etykiet z gotowej sceny. Iniekcje: zamiana portów przekładnika i wyłącznika zmienia
 * kolejność na rysunku; usunięcie portu aparatu daje wpis braku i brak przewodu; odgałęzienie
 * z węzła spoza toru daje wpis braku i brak odczepu.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { BayDeviceState, BayPrimaryDevice, Branch, EnergyNetworkModel } from '../../../../../types/enm';
import fxStaly1 from '../../../../../harness-fixtures/generated/pole_liniowe_z10_gpz_staly_w_sekcji_1.json';
import fxStaly2 from '../../../../../harness-fixtures/generated/pole_liniowe_z10_gpz_staly_w_sekcji_2.json';
import fxZ11 from '../../../../../harness-fixtures/generated/pole_liniowe_z11_gpz_odgalezienie.json';
import { buildCanonicalGpzProps } from '../../../v2/canvas/enmToCanonicalGpzAdapter';
import { allGpzSymbolsOnGrid, composeGpz, gpzInternalSegmentsEndAtPortsOrBus, noGpzSymbolOverlaps, STAN_NIEZNANY_PL } from '../../compose/gpz';
import { daneGlifuSymbolu, type PreviewSymbol } from '../../compose/preview';
import { czyLacznikPola } from '../../compose/rodzajeAparatuPola';
import { obrysSymbolu, SYMBOL_DEFS } from '../../symbols/defs';
import { prostokatRamkiScada, SYMBOL_GLYPHS, type SwitchState } from '../../symbols/glyphs';
import { DARK_SCADA_SLD_PALETTE } from '../../theme/colorTokens';
import { LIGHT_TECHNICAL_SLD_PALETTE } from '../../theme/palette';
import { buildSceneV3, labelCollisions, labelWireCollisions, noSceneSymbolOverlaps, symbolWireCollisions, type SceneV3 } from '../buildScene';

type WykonaniePola = 'Z10' | 'Z11_1' | 'Z11';
type Laczniki = 'TROJPOLOZENIOWY' | 'STALY';
type StanQ1 = 'zamkniety' | 'otwarty' | 'uziemiony' | 'brak';
type StanQ0 = 'zamkniety' | 'otwarty' | 'nieznany';
interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const FIKSTURY: ReadonlyArray<readonly [string, EnergyNetworkModel]> = [
  ['Z.10, wyłącznik stały w sekcji 1', (fxStaly1 as unknown as { snapshot: EnergyNetworkModel }).snapshot],
  ['Z.10, wyłącznik stały w sekcji 2', (fxStaly2 as unknown as { snapshot: EnergyNetworkModel }).snapshot],
  ['Z.11.1 i Z.11 z odgałęzieniem', (fxZ11 as unknown as { snapshot: EnergyNetworkModel }).snapshot],
];

/** Tabela odczytu rysunków: tor główny od szyny — oznaczenie → symbol QET (uziemnik Q9
 *  wykonania stałego jest aparatem bocznym, odgałęzienie przekładnika — osobną kolumną). */
function torOczekiwany(pole: WykonaniePola, laczniki: Laczniki): ReadonlyArray<readonly [string, string]> {
  return [
    ...(pole === 'Z10' ? [] : ([['PF0', 'qetVoltageIndicator']] as const)),
    ['Q1', laczniki === 'TROJPOLOZENIOWY' ? 'qetThreePositionSwitch' : 'qetDisconnector'],
    ['Q0', 'qetBreaker'],
    ['T1', 'qetCurrentTransformer'],
    ['PF1', 'qetVoltageIndicator'],
    ['GK', 'qetCableHead'],
    ['T2', 'qetCoreBalanceCt'],
  ];
}

interface OdgalezienieOczekiwane {
  readonly kolumna: ReadonlyArray<readonly [string, string]>;
  readonly boczne: ReadonlyArray<readonly [string, string]>;
  /** Aparat kolumny, od którego odchodzi aparat boczny (oznaczenie → oznaczenie). */
  readonly zaczep: Readonly<Record<string, string>>;
}
/** Odgałęzienie przekładnika napięciowego od strony linii (Z.11.1/Z.11, za wyłącznikiem Q0):
 *  kolumna od węzła odgałęzienia i jej aparaty boczne (uziemnik Q51 wykonania stałego,
 *  przekładnik T3 na końcu odgałęzienia). */
function odgalezienieOczekiwane(pole: WykonaniePola, laczniki: Laczniki): OdgalezienieOczekiwane | null {
  if (pole === 'Z10') return null;
  return {
    kolumna: [
      ['Q5', laczniki === 'TROJPOLOZENIOWY' ? 'qetThreePositionSwitch' : 'qetDisconnector'],
      ['GK1', 'qetCableHead'],
    ],
    boczne: [...(laczniki === 'STALY' ? ([['Q51', 'qetEarthSwitch']] as const) : []), ['T3', 'qetVoltageTransformer']],
    zaczep: { Q51: 'Q5', T3: 'GK1' },
  };
}
/** Pole wolne nie ma kabla: zakończenie toru kablowego (głowica, przekładnik Ferrantiego)
 *  ustępuje zakończeniu rezerwy; głowica odgałęzienia GK1 zostaje (nie kończy toru kablowego). */
const ZAKONCZENIE_KABLA = new Set(['GK', 'T2']);
/** Adnotacje pola (§17: przekaźnik z kodami EAZ, miernik) — nie pozycje toru. */
const ADNOTACJE = new Set(['protectionRelay', 'meter']);

const STANY_Q1: Readonly<Record<Laczniki, readonly StanQ1[]>> = {
  TROJPOLOZENIOWY: ['zamkniety', 'otwarty', 'uziemiony', 'brak'],
  STALY: ['zamkniety', 'otwarty', 'brak'],
};
const STANY_Q0: readonly StanQ0[] = ['zamkniety', 'otwarty', 'nieznany'];

const MOTYWY = [
  ['ciemny', DARK_SCADA_SLD_PALETTE],
  ['jasny', LIGHT_TECHNICAL_SLD_PALETTE],
] as const;

/** Oczekiwany stan rysunku Q1 — niezależna tabela (rekord → glif). */
const RYSUNEK_Q1: Readonly<Record<StanQ1, SwitchState | undefined>> = {
  zamkniety: 'closed',
  otwarty: 'open',
  uziemiony: 'earthed',
  brak: undefined,
};
const RYSUNEK_Q0: Readonly<Record<StanQ0, SwitchState>> = { zamkniety: 'closed', otwarty: 'open', nieznany: 'unknown' };
/** Ramka SCADA wg położenia (karta §0 pkt 7): uziemiony = tor otwarty = zielona. */
const RAMKA: Readonly<Record<string, 'zamkniety' | 'otwarty' | null>> = {
  closed: 'zamkniety',
  open: 'otwarty',
  earthed: 'otwarty',
  unknown: null,
  brak: null,
};

const zachodzi = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

interface PoleLiniowe {
  readonly ref: string;
  readonly sekcja: number;
  readonly pole: WykonaniePola;
  readonly laczniki: Laczniki;
  readonly zajete: boolean;
}

const WZORZEC_SZABLONU = /^bay_template_gpz_line_enea_(z10|z11_1|z11)_(trojpolozeniowy|staly_z_odlacznikiem)$/;

function polaLiniowe(enm: EnergyNetworkModel): PoleLiniowe[] {
  const bays = (enm.bays ?? []).filter((b) => (b.tags ?? []).includes('gpz_line_field'));
  const sekcje = [...new Set(bays.map((b) => b.gpz_section_id!))].sort();
  const kable = (enm.branches ?? []).filter((g) => g.type === 'cable');
  const szynyPola = (bay: (typeof bays)[number]): Set<string> => {
    const galaz = (enm.branches ?? []).find((g) => g.ref_id === bay.equipment_refs?.[0]);
    return new Set(galaz && 'to_bus_ref' in galaz ? [galaz.to_bus_ref as string] : []);
  };
  return bays
    .map((b) => {
      const dopasowanie = WZORZEC_SZABLONU.exec(b.bay_template_ref ?? '');
      if (!dopasowanie) throw new Error(`pole ${b.ref_id}: szablon spoza wzorców Z.10/Z.11.1/Z.11 (${b.bay_template_ref})`);
      return {
        ref: b.ref_id,
        sekcja: sekcje.indexOf(b.gpz_section_id!) + 1,
        pole: dopasowanie[1].toUpperCase() as WykonaniePola,
        laczniki: (dopasowanie[2] === 'trojpolozeniowy' ? 'TROJPOLOZENIOWY' : 'STALY') as Laczniki,
        zajete: kable.some((k) => 'from_bus_ref' in k && szynyPola(b).has(k.from_bus_ref as string)),
      };
    })
    .sort((a, b) => a.ref.localeCompare(b.ref));
}

/** Model z położeniami na rekordach: Q1 (`switch_state` albo brak rekordu) i Q0 — `status`
 *  gałęzi wyłącznika; „nieznany" = rekord wyłącznika sprzeczny ze statusem gałęzi (K6a). */
function zPolozeniami(enm: EnergyNetworkModel, q1: StanQ1, q0: StanQ0): EnergyNetworkModel {
  const kopia = structuredClone(enm) as EnergyNetworkModel;
  const rekord = (stan: BayDeviceState) => ({ actual_state: stan }) as NonNullable<BayPrimaryDevice['switch_state']>;
  for (const bay of kopia.bays ?? []) {
    if (!(bay.tags ?? []).includes('gpz_line_field')) continue;
    for (const d of bay.primary_devices ?? []) {
      if (d.designation === 'Q1') d.switch_state = q1 === 'brak' ? null : rekord(q1);
      if (d.kind === 'CB') d.switch_state = q0 === 'nieznany' ? rekord('otwarty') : null;
    }
    const galaz = (kopia.branches ?? []).find((g) => g.ref_id === bay.equipment_refs?.[0]) as Branch & { status: string };
    galaz.status = q0 === 'otwarty' ? 'open' : 'closed';
  }
  return kopia;
}

function symbolePola(scena: SceneV3, bayRef: string): PreviewSymbol[] {
  return scena.symbols.filter((s) => s.meta?.ownerRef === bayRef && !ADNOTACJE.has(s.symbolId));
}

function oznaczenia(enm: EnergyNetworkModel, bayRef: string): ReadonlyMap<string, string> {
  const bay = (enm.bays ?? []).find((b) => b.ref_id === bayRef)!;
  return new Map((bay.primary_devices ?? []).map((d) => [d.device_ref, d.designation ?? '']));
}

function portSwiata(s: PreviewSymbol, dir: 'N' | 'S'): { x: number; y: number } {
  const p = SYMBOL_DEFS[s.symbolId].ports.find((port) => port.dir === dir)!;
  return { x: s.x + p.x, y: s.y + p.y };
}

/** Tor główny pola na scenie: symbole w osi (bez aparatów bocznych i odgałęzienia), od szyny. */
function torGlowny(scena: SceneV3, bayRef: string): PreviewSymbol[] {
  const sym = symbolePola(scena, bayRef).filter((s) => s.symbolId !== 'qetEarthSwitch' && s.meta?.odgalezienieToru == null);
  return [...sym].sort((a, b) => a.y - b.y);
}

const zOznaczeniem = (mapa: ReadonlyMap<string, string>, s: PreviewSymbol): string =>
  `${s.meta?.deviceRef ? mapa.get(s.meta.deviceRef) : '-'}:${s.symbolId}`;

function przewodMiedzy(
  przewody: SceneV3['segments'],
  od: { readonly x: number; readonly y: number },
  do_: { readonly x: number; readonly y: number },
): SceneV3['segments'][number] | undefined {
  return przewody.find((p) => {
    const a = p.points[0];
    const b = p.points[p.points.length - 1];
    return a.x === od.x && a.y === od.y && b.x === do_.x && b.y === do_.y;
  });
}

/** Odgałęzienie przekładnika napięciowego: skład kolumny i aparatów bocznych wg tabeli,
 *  położenie na prawo od toru głównego, odczep z portu S wyłącznika Q0 (węzeł odgałęzienia)
 *  do portu N pierwszego aparatu kolumny, przewody kolumny i odczepy aparatów bocznych. */
function sprawdzOdgalezienie(
  scena: SceneV3,
  pole: PoleLiniowe,
  mapa: ReadonlyMap<string, string>,
  tor: readonly PreviewSymbol[],
  nazwa: string,
): void {
  const oczekiwane = odgalezienieOczekiwane(pole.pole, pole.laczniki);
  const galaz = symbolePola(scena, pole.ref).filter((s) => s.meta?.odgalezienieToru != null);
  const odczep = scena.segments.find((s) => s.meta?.ownerRef === `${pole.ref}#odgalezienie-0`);
  if (!oczekiwane) {
    expect(galaz, `${nazwa}: Z.10 bez odgałęzienia`).toEqual([]);
    expect(odczep, nazwa).toBeUndefined();
    return;
  }
  expect(new Set(galaz.map((s) => s.meta?.odgalezienieToru)), nazwa).toEqual(new Set([0]));
  const boczny = (s: PreviewSymbol) => oczekiwane.boczne.some(([o]) => o === mapa.get(s.meta?.deviceRef ?? ''));
  const kolumna = galaz.filter((s) => !boczny(s)).sort((a, b) => a.y - b.y);
  const boczne = galaz.filter(boczny).sort((a, b) => a.y - b.y);
  expect(kolumna.map((s) => zOznaczeniem(mapa, s)), `${nazwa}: kolumna odgałęzienia`).toEqual(
    oczekiwane.kolumna.map(([o, sym]) => `${o}:${sym}`),
  );
  expect(boczne.map((s) => zOznaczeniem(mapa, s)), `${nazwa}: aparaty boczne odgałęzienia`).toEqual(
    oczekiwane.boczne.map(([o, sym]) => `${o}:${sym}`),
  );
  const prawaToru = Math.max(
    ...symbolePola(scena, pole.ref)
      .filter((s) => s.meta?.odgalezienieToru == null)
      .map((s) => s.x + obrysSymbolu(s.symbolId).x + obrysSymbolu(s.symbolId).width),
  );
  for (const s of kolumna) {
    expect(s.x + obrysSymbolu(s.symbolId).x, `${nazwa}: kolumna na prawo od toru`).toBeGreaterThan(prawaToru);
  }
  const osKolumny = portSwiata(kolumna[0], 'N').x;
  for (const s of boczne) expect(portSwiata(s, 'N').x, `${nazwa}: aparat boczny na prawo od kolumny`).toBeGreaterThan(osKolumny);
  const q0 = tor.find((s) => mapa.get(s.meta?.deviceRef ?? '') === 'Q0')!;
  expect(odczep, `${nazwa}: odczep odgałęzienia`).toBeDefined();
  expect(odczep!.points[0], nazwa).toEqual(portSwiata(q0, 'S'));
  expect(odczep!.points[odczep!.points.length - 1], nazwa).toEqual(portSwiata(kolumna[0], 'N'));
  const przewody = scena.segments.filter((s) => s.meta?.ownerRef?.startsWith(`${pole.ref}#odgalezienie-0-wire-`));
  for (let i = 0; i + 1 < kolumna.length; i++) {
    expect(
      przewodMiedzy(przewody, portSwiata(kolumna[i], 'S'), portSwiata(kolumna[i + 1], 'N')),
      `${nazwa}: przewód kolumny ${zOznaczeniem(mapa, kolumna[i])} → ${zOznaczeniem(mapa, kolumna[i + 1])}`,
    ).toBeDefined();
  }
  for (const s of boczne) {
    const ozn = mapa.get(s.meta?.deviceRef ?? '')!;
    const kotwica = kolumna.find((k) => mapa.get(k.meta?.deviceRef ?? '') === oczekiwane.zaczep[ozn])!;
    expect(przewodMiedzy(przewody, portSwiata(kotwica, 'S'), portSwiata(s, 'N')), `${nazwa}: odczep ${ozn}`).toBeDefined();
  }
  expect(przewody, nazwa).toHaveLength(kolumna.length - 1 + boczne.length);
}

function sprawdzPole(enm: EnergyNetworkModel, scena: SceneV3, pole: PoleLiniowe, q1: StanQ1, q0: StanQ0): void {
  const nazwa = `${pole.ref} (${pole.pole}, ${pole.laczniki}, sekcja ${pole.sekcja}, ${pole.zajete ? 'zajęte' : 'wolne'})`;
  const tor = torGlowny(scena, pole.ref);
  const mapa = oznaczenia(enm, pole.ref);
  // 1. Kolejność wg rysunku (pole wolne bez zakończenia kabla, z zakończeniem rezerwy).
  const oczekiwany = torOczekiwany(pole.pole, pole.laczniki)
    .filter(([ozn]) => pole.zajete || !ZAKONCZENIE_KABLA.has(ozn))
    .map(([ozn, sym]) => `${ozn}:${sym}`);
  if (!pole.zajete) oczekiwany.push('-:bayReserve');
  expect(tor.map((s) => zOznaczeniem(mapa, s)), nazwa).toEqual(oczekiwany);
  // 2. Przewody port → port między kolejnymi symbolami toru i zejście z szyny do portu
  //    pierwszego aparatu toru.
  const przewody = scena.segments.filter((s) => s.meta?.ownerRef?.startsWith(`${pole.ref}#wire-`));
  expect(przewody, nazwa).toHaveLength(tor.length - 1);
  for (let i = 0; i + 1 < tor.length; i++) {
    expect(
      przewodMiedzy(przewody, portSwiata(tor[i], 'S'), portSwiata(tor[i + 1], 'N')),
      `${nazwa}: przewód ${tor[i].symbolId} → ${tor[i + 1].symbolId}`,
    ).toBeDefined();
  }
  const zejscie = scena.segments.find((s) => s.meta?.ownerRef === `${pole.ref}#descent`);
  expect(zejscie, nazwa).toBeDefined();
  const koniec = zejscie!.points[zejscie!.points.length - 1];
  expect(koniec, nazwa).toEqual(portSwiata(tor[0], 'N'));
  expect(zejscie!.points.every((p) => p.x === koniec.x), `${nazwa}: zejście pionowe w osi portu`).toBe(true);
  const q1Sym = tor.find((s) => mapa.get(s.meta?.deviceRef ?? '') === 'Q1')!;
  const q0Sym = tor.find((s) => mapa.get(s.meta?.deviceRef ?? '') === 'Q0')!;
  // 3. Uziemnik Q9 wykonania stałego — aparat boczny toru głównego po stronie kablowej.
  const es = symbolePola(scena, pole.ref).filter((s) => s.symbolId === 'qetEarthSwitch' && s.meta?.odgalezienieToru == null);
  expect(es.map((s) => mapa.get(s.meta?.deviceRef ?? '')), nazwa).toEqual(pole.laczniki === 'STALY' ? ['Q9'] : []);
  if (es.length === 1) {
    expect(es[0].x, nazwa).toBeGreaterThan(portSwiata(q0Sym, 'S').x);
    expect(scena.segments.some((s) => s.meta?.ownerRef?.startsWith(`${pole.ref}#lateral-`)), nazwa).toBe(true);
  }
  // 4. Odgałęzienie przekładnika napięciowego (Z.11.1/Z.11); Z.10 — brak.
  sprawdzOdgalezienie(scena, pole, mapa, tor, nazwa);
  // 5. Stany glifów z rekordów modelu.
  expect(q1Sym.state, `${nazwa}: Q1`).toBe(RYSUNEK_Q1[q1]);
  expect(q0Sym.state, `${nazwa}: Q0`).toBe(RYSUNEK_Q0[q0]);
  // 6. Etykieta „stan nieznany" wyłącznie przy łączniku w stanie nieznanym; symbol zostaje.
  for (const s of symbolePola(scena, pole.ref)) {
    const deviceRef = s.meta?.deviceRef;
    if (!deviceRef) continue;
    const etykieta = scena.labels.find((l) => l.ownerRef === `${pole.ref}#etykieta-aparatu-${deviceRef}`);
    expect(etykieta, `${nazwa}: etykieta ${deviceRef}`).toBeDefined();
    const nieznany = czyLacznikPola(s.meta?.apparatusKind) && (s.state === undefined || s.state === 'unknown');
    expect(etykieta!.text.endsWith(` · ${STAN_NIEZNANY_PL}`), `${nazwa}: ${etykieta!.text}`).toBe(nieznany);
    expect(etykieta!.text.startsWith(mapa.get(deviceRef)!), nazwa).toBe(true);
  }
}

/** Ramki stanu SCADA łączników pól liniowych — prostokąty w układzie sceny. */
function ramkiPola(scena: SceneV3, bayRef: string): { readonly symbol: PreviewSymbol; readonly rect: Rect }[] {
  return symbolePola(scena, bayRef)
    .filter((s) => daneGlifuSymbolu(s).ramkaLacznika && RAMKA[s.state ?? 'brak'] !== null)
    .map((s) => {
      const r = prostokatRamkiScada(s.symbolId);
      return { symbol: s, rect: { x: s.x + r.x, y: s.y + r.y, width: r.width, height: r.height } };
    });
}

const sceny = new Map<string, { enm: EnergyNetworkModel; scena: SceneV3 }>();
function scenaZ(nazwa: string, enm: EnergyNetworkModel, q1: StanQ1, q0: StanQ0) {
  const klucz = `${nazwa}|${q1}|${q0}`;
  const gotowa = sceny.get(klucz);
  if (gotowa) return gotowa;
  const model = zPolozeniami(enm, q1, q0);
  const wynik = { enm: model, scena: buildSceneV3(model, 2) };
  sceny.set(klucz, wynik);
  return wynik;
}

describe('UX-04 — pola liniowe GPZ na scenie: pokrycie iloczynu fikstur', () => {
  it('fikstury niosą {Z.10, Z.11.1, Z.11} × {trójpołożeniowy, stały} × {sekcja 1, 2} × {zajęte, wolne}', () => {
    const kombinacje = new Set<string>();
    for (const [, enm] of FIKSTURY) {
      for (const p of polaLiniowe(enm)) kombinacje.add(`${p.pole}|${p.laczniki}|${p.sekcja}|${p.zajete}`);
    }
    const oczekiwane = [
      ...['TROJPOLOZENIOWY', 'STALY'].flatMap((l) => [1, 2].map((s) => `Z10|${l}|${s}`)),
      'Z11_1|TROJPOLOZENIOWY|1',
      'Z11|STALY|2',
    ];
    for (const k of oczekiwane) {
      for (const z of [true, false]) expect(kombinacje, `${k}|${z}`).toContain(`${k}|${z}`);
    }
  });
});

describe('UX-04 — pole liniowe na scenie (iloczyn wykonanie × łączniki × sekcja × pole × Q1 × Q0)', () => {
  for (const [nazwaFx, enm] of FIKSTURY) {
    for (const q0 of STANY_Q0) {
      for (const q1 of ['zamkniety', 'otwarty', 'uziemiony', 'brak'] as const) {
        it(`${nazwaFx} · Q1 ${q1} · Q0 ${q0}`, () => {
          // Uziemiony dotyczy tylko łącznika trójpołożeniowego: rekord odłącznika w tym
          // położeniu jest odrzucany przez walidator backendu — te pola pomijamy (iniekcja niżej).
          const { enm: model, scena } = scenaZ(nazwaFx, enm, q1, q0);
          const pola = polaLiniowe(model).filter((p) => STANY_Q1[p.laczniki].includes(q1));
          expect(pola.length, `pola w stanie ${q1}`).toBeGreaterThan(0);
          for (const pole of pola) sprawdzPole(model, scena, pole, q1, q0);
          // Braki przyłączeń: żaden aparat pola nie wypada z obchodu portów.
          expect(scena.meta.missingData.filter((k) => k.startsWith('gpz.bay.port')), 'braki portów').toEqual([]);
          // Sekcje fikstury różnią się wykonaniem łączników.
          const wykonaniaSekcji = new Map(polaLiniowe(model).map((p) => [p.sekcja, p.laczniki]));
          expect([...wykonaniaSekcji.values()].sort()).toEqual(['STALY', 'TROJPOLOZENIOWY']);
        });
      }
    }
  }
});

describe('UX-04 — ramki SCADA na scenie (iloczyn × motyw): obrys, kolor, brak kolizji', () => {
  for (const [nazwaFx, enm] of FIKSTURY) {
    for (const q0 of STANY_Q0) {
      for (const q1 of ['zamkniety', 'otwarty', 'uziemiony', 'brak'] as const) {
        for (const [motyw, paleta] of MOTYWY) {
          it(`${nazwaFx} · Q1 ${q1} · Q0 ${q0} · ${motyw}`, () => {
            const { enm: model, scena } = scenaZ(nazwaFx, enm, q1, q0);
            for (const pole of polaLiniowe(model)) {
              const symbole = symbolePola(scena, pole.ref);
              // Każdy łącznik pola (także łącznik odgałęzienia Q5) rysuje ramkę wg położenia;
              // inne aparaty — nigdy.
              for (const s of symbole) {
                const Glyph = SYMBOL_GLYPHS[s.symbolId];
                const markup = renderToStaticMarkup(
                  <svg>
                    <Glyph x={s.x} y={s.y} stroke="#000" {...daneGlifuSymbolu(s)} ramkaScada={paleta.ramkaScada} />
                  </svg>,
                );
                const ramki = Array.from(
                  new DOMParser().parseFromString(markup, 'image/svg+xml').querySelectorAll('[data-qet="ramka-scada"]'),
                );
                const oczekiwana = czyLacznikPola(s.meta?.apparatusKind) ? RAMKA[s.state ?? 'brak'] : null;
                expect(markup, `${pole.ref} ${s.symbolId}: symbol zostaje`).toContain(`data-symbol-canon="${s.symbolId}"`);
                if (oczekiwana === null) {
                  expect(ramki, `${pole.ref} ${s.symbolId} ${s.state}`).toHaveLength(0);
                  continue;
                }
                expect(ramki, `${pole.ref} ${s.symbolId} ${s.state}`).toHaveLength(1);
                expect(ramki[0].getAttribute('fill')).toBe('none');
                expect(ramki[0].getAttribute('stroke')).toBe(paleta.ramkaScada[oczekiwana]);
              }
              // Ramka nie wchodzi na sąsiednie aparaty pola ani na etykiety sceny.
              for (const { symbol, rect } of ramkiPola(scena, pole.ref)) {
                for (const inny of symbole) {
                  if (inny === symbol) continue;
                  const o = obrysSymbolu(inny.symbolId);
                  const obrys = { x: inny.x + o.x, y: inny.y + o.y, width: o.width, height: o.height };
                  expect(zachodzi(rect, obrys), `ramka ${symbol.symbolId} × ${inny.symbolId} (${pole.ref})`).toBe(false);
                }
                for (const l of scena.labels) {
                  expect(zachodzi(rect, l.rect), `ramka ${symbol.symbolId} × etykieta „${l.text}"`).toBe(false);
                }
              }
            }
          });
        }
      }
    }
  }
});

describe('UX-04 — cała scena GPZ bez kolizji i z kompozycją na siatce', () => {
  for (const [nazwaFx, enm] of FIKSTURY) {
    for (const q1 of ['zamkniety', 'brak'] as const) {
      for (const q0 of ['zamkniety', 'nieznany'] as const) {
        it(`${nazwaFx} · Q1 ${q1} · Q0 ${q0}: wyrocznie sceny i kompozycji GPZ`, () => {
          const { enm: model, scena } = scenaZ(nazwaFx, enm, q1, q0);
          expect(noSceneSymbolOverlaps(scena)).toBe(true);
          expect(labelCollisions(scena)).toEqual([]);
          expect(symbolWireCollisions(scena)).toEqual([]);
          expect(labelWireCollisions(scena)).toEqual([]);
          const gpz = model.substations!.find((s) => s.station_type === 'gpz')!;
          const props = buildCanonicalGpzProps(model, gpz.ref_id);
          const zrodla = (model.sources ?? []).map((src) => ({ id: src.ref_id, connectionRef: src.bus_ref }));
          const kompozycja = composeGpz(props, { x: 0, y: 0 }, zrodla);
          expect(allGpzSymbolsOnGrid(kompozycja)).toBe(true);
          expect(noGpzSymbolOverlaps(kompozycja)).toBe(true);
          expect(gpzInternalSegmentsEndAtPortsOrBus(kompozycja)).toBe(true);
          expect(kompozycja.brakiPrzylaczy).toEqual([]);
        });
      }
    }
  }

  it('przedłużenie szyny WN kończy się w zaczepie zejścia źródła; kikut za zejściem czerwieni wyrocznię', () => {
    const [, enm] = FIKSTURY[0];
    const gpz = enm.substations!.find((s) => s.station_type === 'gpz')!;
    const zrodla = (enm.sources ?? []).map((src) => ({ id: src.ref_id, connectionRef: src.bus_ref }));
    const kompozycja = composeGpz(buildCanonicalGpzProps(enm, gpz.ref_id), { x: 0, y: 0 }, zrodla);
    const przedluzenie = kompozycja.segments.find((s) => s.ownerRef.endsWith('#hv-bus-source-extension'))!;
    const zejscie = kompozycja.segments.find((s) => s.ownerRef.endsWith('#grid-source-drop'))!;
    expect(przedluzenie.points[przedluzenie.points.length - 1]).toEqual(zejscie.points[zejscie.points.length - 1]);
    expect(gpzInternalSegmentsEndAtPortsOrBus(kompozycja)).toBe(true);
    // Iniekcja: dawny kikut (przedłużenie do prawej krawędzi symbolu źródła).
    const [a, b] = przedluzenie.points;
    const zKikutem = {
      ...kompozycja,
      segments: kompozycja.segments.map((s) => (s === przedluzenie ? { ...s, points: [a, { x: b.x + 8, y: b.y }] } : s)),
    };
    expect(gpzInternalSegmentsEndAtPortsOrBus(zKikutem)).toBe(false);
    // Iniekcja: przedłużenie oderwane od szyny (początek poza szyną) — samo siebie nie uprawomocnia.
    const oderwane = {
      ...kompozycja,
      segments: kompozycja.segments.map((s) => (s === przedluzenie ? { ...s, points: [{ x: a.x + 8, y: a.y - 8 }, { x: b.x, y: a.y - 8 }] } : s)),
    };
    expect(gpzInternalSegmentsEndAtPortsOrBus(oderwane)).toBe(false);
  });

  for (const [nazwaFx, enm] of FIKSTURY) {
    it(`${nazwaFx} · determinizm: ta sama migawka → ta sama scena (symbole, odcinki, etykiety)`, () => {
      const a = buildSceneV3(zPolozeniami(enm, 'uziemiony', 'nieznany'), 2);
      const b = buildSceneV3(zPolozeniami(enm, 'uziemiony', 'nieznany'), 2);
      expect(JSON.stringify(b.symbols)).toBe(JSON.stringify(a.symbols));
      expect(JSON.stringify(b.segments)).toBe(JSON.stringify(a.segments));
      expect(JSON.stringify(b.labels)).toBe(JSON.stringify(a.labels));
    });

    it(`${nazwaFx} · zmiana położenia łącznika nie przesuwa układu pola (geometria niezależna od stanu)`, () => {
      const geometria = (s: SceneV3) => JSON.stringify(s.symbols.map((x) => [x.symbolId, x.x, x.y]));
      const wzorzec = geometria(buildSceneV3(zPolozeniami(enm, 'zamkniety', 'zamkniety'), 2));
      for (const q1 of ['otwarty', 'uziemiony', 'brak'] as const) {
        for (const q0 of STANY_Q0) expect(geometria(buildSceneV3(zPolozeniami(enm, q1, q0), 2)), `${q1}/${q0}`).toBe(wzorzec);
      }
    });
  }
});

describe('UX-04 — iniekcje na modelu pola', () => {
  const [, enm] = FIKSTURY[1];
  const poleTrojpolozeniowe = polaLiniowe(enm).find((p) => p.laczniki === 'TROJPOLOZENIOWY' && p.zajete)!;

  it('zamiana portów przekładnika T1 i wyłącznika Q0 zmienia kolejność rysunku (tor z portów)', () => {
    const model = structuredClone(enm) as EnergyNetworkModel;
    const bay = model.bays!.find((b) => b.ref_id === poleTrojpolozeniowe.ref)!;
    const q0 = bay.primary_devices!.find((d) => d.designation === 'Q0')!;
    const t1 = bay.primary_devices!.find((d) => d.designation === 'T1')!;
    [q0.ports, t1.ports] = [t1.ports, q0.ports];
    const scena = buildSceneV3(model, 2);
    const mapa = oznaczenia(model, poleTrojpolozeniowe.ref);
    const kolejnosc = torGlowny(scena, poleTrojpolozeniowe.ref).map((s) => (s.meta?.deviceRef ? mapa.get(s.meta.deviceRef) : '-'));
    expect(kolejnosc.slice(0, 3)).toEqual(['Q1', 'T1', 'Q0']);
  });

  it('rekord odłącznika w położeniu „uziemiony" (sprzeczny z rodzajem) — stan nieustalony, bez ramki', () => {
    for (const [, fx] of FIKSTURY) {
      const model = zPolozeniami(fx, 'uziemiony', 'zamkniety');
      const scena = buildSceneV3(model, 2);
      const stale = polaLiniowe(model).filter((p) => p.laczniki === 'STALY');
      expect(stale.length).toBeGreaterThan(0);
      for (const pole of stale) {
        const mapa = oznaczenia(model, pole.ref);
        const q1 = torGlowny(scena, pole.ref).find((s) => mapa.get(s.meta?.deviceRef ?? '') === 'Q1')!;
        expect(q1.symbolId).toBe('qetDisconnector');
        expect(q1.state, pole.ref).toBe('unknown');
        expect(ramkiPola(scena, pole.ref).map((r) => r.symbol)).not.toContain(q1);
        const etykieta = scena.labels.find((l) => l.ownerRef === `${pole.ref}#etykieta-aparatu-${q1.meta!.deviceRef}`);
        expect(etykieta?.text).toBe(`Q1 · ${STAN_NIEZNANY_PL}`);
      }
    }
  });

  it('usunięcie portu wyjścia przekładnika T1: wpis braku z przyczyną, bez przewodu z domysłu', () => {
    const model = structuredClone(enm) as EnergyNetworkModel;
    const bay = model.bays!.find((b) => b.ref_id === poleTrojpolozeniowe.ref)!;
    const t1 = bay.primary_devices!.find((d) => d.designation === 'T1')!;
    t1.ports = (t1.ports ?? []).filter((p) => p.port_id !== 'wy');
    const scena = buildSceneV3(model, 2);
    expect(scena.meta.missingData).toContain(`gpz.bay.port.missing:${poleTrojpolozeniowe.ref}:${t1.device_ref}`);
    const tor = torGlowny(scena, poleTrojpolozeniowe.ref);
    const t1Sym = tor.find((s) => s.meta?.deviceRef === t1.device_ref);
    // Aparat nadal narysowany (symbol nigdy nie znika), ale żaden przewód nie wychodzi z jego portu S.
    expect(t1Sym).toBeDefined();
    const s = portSwiata(t1Sym!, 'S');
    const przewody = scena.segments.filter((seg) => seg.meta?.ownerRef?.startsWith(`${poleTrojpolozeniowe.ref}#wire-`));
    expect(przewody.some((p) => p.points[0].x === s.x && p.points[0].y === s.y)).toBe(false);
  });

  it('odgałęzienie z węzła spoza toru (Q5 „we" na węźle bez aparatu): braki z przyczyną, bez odczepu z domysłu', () => {
    const [, fx] = FIKSTURY[2];
    for (const pole of polaLiniowe(fx)) {
      const model = structuredClone(fx) as EnergyNetworkModel;
      const bay = model.bays!.find((b) => b.ref_id === pole.ref)!;
      const q5 = bay.primary_devices!.find((d) => d.designation === 'Q5')!;
      q5.ports = (q5.ports ?? []).map((p) => (p.port_id === 'we' ? { ...p, wezel: 'w77' } : p));
      const scena = buildSceneV3(model, 2);
      expect(scena.meta.missingData, pole.ref).toContain(`gpz.bay.port.missing:${pole.ref}:${q5.device_ref}`);
      expect(scena.segments.some((s) => s.meta?.ownerRef === `${pole.ref}#odgalezienie-0`), pole.ref).toBe(false);
      // Tor główny bez zmian: aparaty toru dalej połączone przewodami port → port.
      const mapa = oznaczenia(model, pole.ref);
      expect(torGlowny(scena, pole.ref).filter((s) => s.meta?.deviceRef).map((s) => mapa.get(s.meta!.deviceRef!)), pole.ref).toEqual(
        expect.arrayContaining(['PF0', 'Q1', 'Q0', 'T1', 'PF1']),
      );
    }
  });
});
