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
 * z `SYMBOL_DEFS` (przewód port → port), tabela położenie → kafel stanu, gabaryty i prostokąty
 * etykiet z gotowej sceny. Iniekcje: zamiana portów przekładnika i wyłącznika zmienia
 * kolejność na rysunku; usunięcie portu aparatu daje wpis braku i brak przewodu; odgałęzienie
 * z węzła spoza toru daje wpis braku i brak odczepu.
 *
 * Kafel stanu (rozszerzenie 5, referencja HMI właściciela 2026-10-29) zastąpił ramkę SCADA:
 * intencja dawnych asercji ramki zostaje — tylko łączniki pola niosą oznaczenie stanu, kolor
 * z jednej tabeli, kafel nie wchodzi na sąsiedni aparat ani etykietę — a stan nieustalony
 * ma WŁASNY kafel „?" zamiast braku ramki i dopisku „stan nieznany" w etykiecie.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { BayDeviceState, BayPrimaryDevice, Branch, EnergyNetworkModel } from '../../../../../types/enm';
import fxStaly1 from '../../../../../harness-fixtures/generated/pole_liniowe_z10_gpz_staly_w_sekcji_1.json';
import fxStaly2 from '../../../../../harness-fixtures/generated/pole_liniowe_z10_gpz_staly_w_sekcji_2.json';
import fxZ11 from '../../../../../harness-fixtures/generated/pole_liniowe_z11_gpz_odgalezienie.json';
import fxStacjeZamkniete from '../../../../../harness-fixtures/generated/geometria_stacji_zamkniete.json';
import fxGpz110 from '../../../../../harness-fixtures/generated/geometria_stacji_gpz_110kv.json';
import { buildCanonicalGpzProps } from '../../../v2/canvas/enmToCanonicalGpzAdapter';
import { allGpzSymbolsOnGrid, composeGpz, gpzInternalSegmentsEndAtPortsOrBus, noGpzSymbolOverlaps } from '../../compose/gpz';
import { daneGlifuSymbolu, type PreviewSymbol } from '../../compose/preview';
import { RODZAJE_LACZNIKOW_POLA } from '../../compose/rodzajeAparatuPola';
import { obrysSymbolu, rodzajSymbolu, SYMBOL_DEFS, type SymbolId } from '../../symbols/defs';
import { prostokatKaflaStanu, SYMBOL_GLYPHS, type SwitchState } from '../../symbols/glyphs';
import { DARK_SCADA_SLD_PALETTE, type StanKafla } from '../../theme/colorTokens';
import { LIGHT_TECHNICAL_SLD_PALETTE } from '../../theme/palette';
import { GRID } from '../../core/grid';
import { zaczepTekstuEtykiety, type OwnedLabel } from '../../layout/labels';
import { buildSceneV3, labelCollisions, labelWireCollisions, noSceneSymbolOverlaps, symbolWireCollisions, type SceneLod, type SceneV3 } from '../buildScene';
import { interiorCrossings, junctionDotGaps, wezlyModeluEnm } from '../crossings';

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

/** Tabela odczytu rysunków: tor główny od szyny — oznaczenie → symbol QET (uziemnik Q8
 *  wykonania stałego jest aparatem bocznym, odgałęzienie przekładnika — osobną kolumną).
 *  Wyłącznik Q0 rysunków Z.10/Z.11.1/Z.11 ma napęd silnikowy „M" (wymaganie właściciela
 *  2026-10-29 pkt 4) — symbol złożony `qetBreakerZNapedem`; dobór symbolu idzie z rekordu
 *  modelu (`BayPrimaryDevice.naped`), co przypina iniekcja zdjęcia napędu niżej. Łącznik
 *  trójpołożeniowy Q1 ma napęd zasobnikowy ręczny (rysunki s.89/s.91 w 400 dpi, decyzja
 *  architekta 2026-10-30: atrybut łącznika, nie nowy aparat) — `qetThreePositionSwitchZNapedem`;
 *  łącznik Q5 odgałęzienia rysunek s.91 rysuje bez napędu. */
function torOczekiwany(pole: WykonaniePola, laczniki: Laczniki): ReadonlyArray<readonly [string, string]> {
  return [
    ...(pole === 'Z10' ? [] : ([['PF0', 'qetVoltageIndicator']] as const)),
    ['Q1', laczniki === 'TROJPOLOZENIOWY' ? 'qetThreePositionSwitchZNapedem' : 'qetDisconnector'],
    ['Q0', 'qetBreakerZNapedem'],
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
    // Przekładnik T3 ma trzy uzwojenia wtórne w gwieździe 0,1/√3 (rysunek s.91, decyzja
    // właściciela 2026-10-29 pkt 1) — symbol z liczbą uzwojeń z modelu.
    boczne: [...(laczniki === 'STALY' ? ([['Q51', 'qetEarthSwitch']] as const) : []), ['T3', 'qetVoltageTransformer3']],
    zaczep: { Q51: 'Q5', T3: 'GK1' },
  };
}
/* Pole wolne (bez kabla odejścia) rysuje KOMPLET aparatów rekordu — głowica GK i przekładnik
 * Ferrantiego T2 są aparatami pola (rekordy modelu), nie kabla, więc nie znikają, gdy kabla brak
 * (dawne przycinanie toru pola wolnego było defektem: rysunek ENEA ma GK i T2 w każdym polu).
 * Koniec toru pola wolnego oznacza symbol „koniec kabla niepodłączony" (QET EN 60617 03-01-14,
 * `bayReserve`) — nigdy znak uziemienia. Pole zajęte kończy się kablem odejścia (gałąź modelu)
 * z portu S ostatniego aparatu toru. */
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
/** Kafel stanu wg położenia (karta rozszerzenia 5): „uziemiony" łącznika trójpołożeniowego =
 *  zestyk uziemiający ZAMKNIĘTY (kafel zamknięty); stan bez rekordu albo sprzeczny — kafel
 *  nieustalony (nigdy brak kafla). Wartości barw z karty — NIEZALEŻNE od palety w kodzie,
 *  identyczne w obu motywach. */
function kafelOczekiwany(symbolId: string, state: SwitchState | undefined): StanKafla {
  if (state === 'closed') return 'zamkniety';
  if (state === 'open') return 'otwarty';
  // Rodzaj SEMANTYCZNY rysunku (znak napędu nie zmienia rodzaju łącznika). Uziemiony łącznik
  // trójpołożeniowy ma kafel OTWARTY: tor główny jest otwarty, nóż spoczywa na zestyku
  // uziemiającym (jedna tabela stanu `glyphs.tsx::POLOZENIE_ZE_STANU`, UX04 §11.13; dawna
  // wyrocznia „zamknięty" sprzed tej tabeli czytała uziemienie jak zamknięcie toru).
  if (state === 'earthed' && rodzajSymbolu(symbolId as SymbolId) === 'qetThreePositionSwitch') return 'otwarty';
  return 'nieustalony';
}
const BARWA_KAFLA: Readonly<Record<StanKafla, string>> = {
  zamkniety: '#C62828',
  otwarty: '#2E7D32',
  nieustalony: '#6B7280',
  bledny: '#8E44AD',
};
const czyLacznik = (s: PreviewSymbol): boolean =>
  s.meta?.apparatusKind !== undefined && RODZAJE_LACZNIKOW_POLA.has(s.meta.apparatusKind);

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

/** Szyna za aparatem pola (zacisk pola) — koniec gałęzi wyłącznika pola w modelu. */
function szynyPola(enm: EnergyNetworkModel, bayRef: string): Set<string> {
  const bay = (enm.bays ?? []).find((b) => b.ref_id === bayRef);
  const galaz = (enm.branches ?? []).find((g) => g.ref_id === bay?.equipment_refs?.[0]);
  return new Set(galaz && 'to_bus_ref' in galaz ? [galaz.to_bus_ref as string] : []);
}

/** Kable odejścia pola w MODELU: gałęzie typu kabel wychodzące z zacisku pola. */
function kableOdejsciaPola(enm: EnergyNetworkModel, bayRef: string): Branch[] {
  const szyny = szynyPola(enm, bayRef);
  return (enm.branches ?? []).filter(
    (g) => g.type === 'cable' && 'from_bus_ref' in g && szyny.has(g.from_bus_ref as string),
  );
}

function polaLiniowe(enm: EnergyNetworkModel): PoleLiniowe[] {
  const bays = (enm.bays ?? []).filter((b) => (b.tags ?? []).includes('gpz_line_field'));
  const sekcje = [...new Set(bays.map((b) => b.gpz_section_id!))].sort();
  return bays
    .map((b) => {
      const dopasowanie = WZORZEC_SZABLONU.exec(b.bay_template_ref ?? '');
      if (!dopasowanie) throw new Error(`pole ${b.ref_id}: szablon spoza wzorców Z.10/Z.11.1/Z.11 (${b.bay_template_ref})`);
      return {
        ref: b.ref_id,
        sekcja: sekcje.indexOf(b.gpz_section_id!) + 1,
        pole: dopasowanie[1].toUpperCase() as WykonaniePola,
        laczniki: (dopasowanie[2] === 'trojpolozeniowy' ? 'TROJPOLOZENIOWY' : 'STALY') as Laczniki,
        zajete: kableOdejsciaPola(enm, b.ref_id).length > 0,
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
  // Kolumna odgałęzienia na prawo od OSI toru głównego (aparaty w osi). Aparat boczny toru
  // głównego (uziemnik Q8 wykonania stałego, kafel stanu 48 × 48) stoi także po prawej osi —
  // niżej, po stronie kablowej — więc dzieli z kolumną pas X; wymagany jest brak nakładania
  // obrysów (sprawdzane wprost niżej, oprócz wyroczni sceny `noSceneSymbolOverlaps`).
  const obrys = (s: PreviewSymbol): Rect => {
    const o = obrysSymbolu(s.symbolId);
    return { x: s.x + o.x, y: s.y + o.y, width: o.width, height: o.height };
  };
  const prawaToru = Math.max(...tor.map((s) => obrys(s).x + obrys(s).width));
  for (const s of kolumna) {
    expect(obrys(s).x, `${nazwa}: kolumna na prawo od osi toru`).toBeGreaterThan(prawaToru);
  }
  const boczneToru = symbolePola(scena, pole.ref).filter(
    (s) => s.meta?.odgalezienieToru == null && !tor.includes(s),
  );
  for (const s of galaz) {
    for (const b of boczneToru) {
      expect(zachodzi(obrys(s), obrys(b)), `${nazwa}: odgałęzienie × aparat boczny toru`).toBe(false);
    }
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
  // 1. Kolejność wg rysunku (pole wolne z kompletem aparatów i znakiem końca kabla).
  const oczekiwany = torOczekiwany(pole.pole, pole.laczniki).map(([ozn, sym]) => `${ozn}:${sym}`);
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
  // 3. Uziemnik Q8 wykonania stałego — aparat boczny toru głównego po stronie kablowej.
  const es = symbolePola(scena, pole.ref).filter((s) => s.symbolId === 'qetEarthSwitch' && s.meta?.odgalezienieToru == null);
  expect(es.map((s) => mapa.get(s.meta?.deviceRef ?? '')), nazwa).toEqual(pole.laczniki === 'STALY' ? ['Q8'] : []);
  if (es.length === 1) {
    expect(es[0].x, nazwa).toBeGreaterThan(portSwiata(q0Sym, 'S').x);
    expect(scena.segments.some((s) => s.meta?.ownerRef?.startsWith(`${pole.ref}#lateral-`)), nazwa).toBe(true);
  }
  // 4. Odgałęzienie przekładnika napięciowego (Z.11.1/Z.11); Z.10 — brak.
  sprawdzOdgalezienie(scena, pole, mapa, tor, nazwa);
  // 5. Stany glifów z rekordów modelu.
  expect(q1Sym.state, `${nazwa}: Q1`).toBe(RYSUNEK_Q1[q1]);
  expect(q0Sym.state, `${nazwa}: Q0`).toBe(RYSUNEK_Q0[q0]);
  // 6. Etykieta aparatu = samo oznaczenie z modelu (pola fikstur bez numeru pola — bez
  //    przedrostka); stan niesie kafel, nie podpis (dawny dopisek „· stan nieznany" usunięty).
  for (const s of symbolePola(scena, pole.ref)) {
    const deviceRef = s.meta?.deviceRef;
    if (!deviceRef) continue;
    const etykieta = scena.labels.find((l) => l.ownerRef === `${pole.ref}#etykieta-aparatu-${deviceRef}`);
    expect(etykieta, `${nazwa}: etykieta ${deviceRef}`).toBeDefined();
    expect(etykieta!.text, nazwa).toBe(mapa.get(deviceRef)!);
  }
}

/** Kafle stanu łączników pól liniowych — prostokąty w układzie sceny. */
function kaflePola(scena: SceneV3, bayRef: string): { readonly symbol: PreviewSymbol; readonly rect: Rect }[] {
  return symbolePola(scena, bayRef)
    .filter(czyLacznik)
    .map((s) => {
      const r = prostokatKaflaStanu(s.symbolId);
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

describe('UX-04 — kafle stanu na scenie (iloczyn × motyw): obrys, kolor, brak kolizji', () => {
  for (const [nazwaFx, enm] of FIKSTURY) {
    for (const q0 of STANY_Q0) {
      for (const q1 of ['zamkniety', 'otwarty', 'uziemiony', 'brak'] as const) {
        for (const [motyw, paleta] of MOTYWY) {
          it(`${nazwaFx} · Q1 ${q1} · Q0 ${q0} · ${motyw}`, () => {
            const { enm: model, scena } = scenaZ(nazwaFx, enm, q1, q0);
            for (const pole of polaLiniowe(model)) {
              const symbole = symbolePola(scena, pole.ref);
              // Każdy łącznik pola (także łącznik odgałęzienia Q5) rysuje kafel wg położenia —
              // także w stanie nieustalonym; inne aparaty — nigdy.
              for (const s of symbole) {
                const Glyph = SYMBOL_GLYPHS[s.symbolId];
                const markup = renderToStaticMarkup(
                  <svg>
                    <Glyph x={s.x} y={s.y} stroke="#000" {...daneGlifuSymbolu(s)} kafleStanu={paleta.state} />
                  </svg>,
                );
                const kafle = Array.from(
                  new DOMParser().parseFromString(markup, 'image/svg+xml').querySelectorAll('[data-kafel-stanu]'),
                );
                expect(markup, `${pole.ref} ${s.symbolId}: symbol zostaje`).toContain(`data-symbol-canon="${s.symbolId}"`);
                if (!czyLacznik(s)) {
                  expect(kafle, `${pole.ref} ${s.symbolId} ${s.state}`).toHaveLength(0);
                  continue;
                }
                const oczekiwany = kafelOczekiwany(s.symbolId, s.state);
                expect(kafle, `${pole.ref} ${s.symbolId} ${s.state}`).toHaveLength(1);
                expect(kafle[0].getAttribute('data-kafel-stanu')).toBe(oczekiwany);
                expect(kafle[0].querySelector('[data-kafel="tlo"]')!.getAttribute('fill')).toBe(BARWA_KAFLA[oczekiwany]);
              }
              // Kafel nie wchodzi na sąsiednie aparaty pola ani na etykiety sceny.
              for (const { symbol, rect } of kaflePola(scena, pole.ref)) {
                for (const inny of symbole) {
                  if (inny === symbol) continue;
                  const o = obrysSymbolu(inny.symbolId);
                  const obrys = { x: inny.x + o.x, y: inny.y + o.y, width: o.width, height: o.height };
                  expect(zachodzi(rect, obrys), `kafel ${symbol.symbolId} × ${inny.symbolId} (${pole.ref})`).toBe(false);
                }
                for (const l of scena.labels) {
                  expect(zachodzi(rect, l.rect), `kafel ${symbol.symbolId} × etykieta „${l.text}"`).toBe(false);
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

/** Kable na scenie: odcinki, których właściciel jest gałęzią typu kabel w MODELU (wyrocznia
 *  z modelu, nie z rodzaju odcinka sceny). Kabel jest jedną polilinią — scena nie rozcina go
 *  w punktach przecięć (rozstrzygnięcie S7-P2: przecięcie bez węzła modelu = mostek). */
const wlascicielKabla = (s: SceneV3['segments'][number]): string => s.meta?.ownerRef ?? '';
const refyKabliModelu = (enm: EnergyNetworkModel): ReadonlySet<string> =>
  new Set((enm.branches ?? []).filter((g) => g.type === 'cable').map((g) => g.ref_id));
const kableSceny = (enm: EnergyNetworkModel, scena: SceneV3): SceneV3['segments'] => {
  const refy = refyKabliModelu(enm);
  return scena.segments.filter((s) => refy.has(wlascicielKabla(s)) && s.meta?.kind !== 'openTerminal');
};
const rowne = (a: { x: number; y: number }, b: { x: number; y: number }): boolean => a.x === b.x && a.y === b.y;

/** Wyrocznia kabla odejścia (wymaganie właściciela 2026-10-29 pkt 3 i 8, niezależna od kodu
 *  sceny): pole ZAJĘTE — każdy kabel odejścia z MODELU (gałąź z zacisku pola) jest na scenie
 *  odcinkiem z własnym `ownerRef`, który zaczyna się w porcie S ostatniego aparatu toru
 *  (przekładnik Ferrantiego T2), a żaden inny odcinek SN nie startuje z tego portu; pole WOLNE —
 *  z portu S przekładnika T2 nie wychodzi żaden odcinek SN (koniec toru niesie symbol końca
 *  kabla). Zwraca listę naruszeń (pusta = zgodne). */
function naruszeniaKablaOdejscia(enm: EnergyNetworkModel, scena: SceneV3): string[] {
  const naruszenia: string[] = [];
  for (const pole of polaLiniowe(enm)) {
    const tor = torGlowny(scena, pole.ref).filter((s) => s.symbolId !== 'bayReserve');
    const ostatni = tor[tor.length - 1];
    if (ostatni?.symbolId !== 'qetCoreBalanceCt') {
      naruszenia.push(`${pole.ref}: ostatni aparat toru ${ostatni?.symbolId} zamiast przekładnika Ferrantiego`);
      continue;
    }
    const port = portSwiata(ostatni, 'S');
    const kable = kableOdejsciaPola(enm, pole.ref);
    const zPortu = kableSceny(enm, scena).filter((s) => rowne(s.points[0], port));
    if (!pole.zajete) {
      for (const s of zPortu) naruszenia.push(`${pole.ref} (wolne): odcinek ${wlascicielKabla(s)} z portu T2`);
      continue;
    }
    for (const k of kable) {
      const odcinek = kableSceny(enm, scena).find((s) => s.meta?.ownerRef === k.ref_id);
      if (!odcinek) naruszenia.push(`${pole.ref}: kabel ${k.ref_id} nieobecny na scenie`);
      else if (!rowne(odcinek.points[0], port)) {
        naruszenia.push(
          `${pole.ref}: kabel ${k.ref_id} zaczyna się w (${odcinek.points[0].x}, ${odcinek.points[0].y}), port S T2 w (${port.x}, ${port.y})`,
        );
      }
    }
    const refyKabli = new Set(kable.map((k) => k.ref_id));
    for (const s of zPortu) {
      if (!refyKabli.has(wlascicielKabla(s))) naruszenia.push(`${pole.ref}: z portu T2 wychodzi obcy odcinek ${wlascicielKabla(s)}`);
    }
  }
  return naruszenia;
}

/** Odcinki kabli RÓŻNYCH właścicieli leżące współliniowo na wspólnym odcinku dodatniej długości
 *  (dwa kable jedną kreską). */
function nakladaniaKabli(enm: EnergyNetworkModel, scena: SceneV3): string[] {
  type Krawedz = { readonly owner: string; readonly staly: number; readonly od: number; readonly do: number };
  const poziome: Krawedz[] = [];
  const pionowe: Krawedz[] = [];
  for (const s of kableSceny(enm, scena)) {
    for (let i = 0; i + 1 < s.points.length; i++) {
      const [a, b] = [s.points[i], s.points[i + 1]];
      if (a.y === b.y && a.x !== b.x) poziome.push({ owner: wlascicielKabla(s), staly: a.y, od: Math.min(a.x, b.x), do: Math.max(a.x, b.x) });
      if (a.x === b.x && a.y !== b.y) pionowe.push({ owner: wlascicielKabla(s), staly: a.x, od: Math.min(a.y, b.y), do: Math.max(a.y, b.y) });
    }
  }
  const wynik: string[] = [];
  for (const zbior of [poziome, pionowe]) {
    for (let i = 0; i < zbior.length; i++) {
      for (let j = i + 1; j < zbior.length; j++) {
        const [p, q] = [zbior[i], zbior[j]];
        if (p.owner === q.owner || p.staly !== q.staly) continue;
        if (Math.min(p.do, q.do) - Math.max(p.od, q.od) > 0) wynik.push(`${p.owner} ≡ ${q.owner} @${p.staly}`);
      }
    }
  }
  return wynik;
}

/** Kropki bez węzła modelu: kropka węzłowa, której `wezelModelu` nie jest szyną, polem ani
 *  transformatorem modelu (`wezlyModeluEnm`) — połączenie narysowane bez odpowiednika w sieci. */
const kropkiBezWezlaModelu = (enm: EnergyNetworkModel, scena: SceneV3): string[] =>
  junctionDotGaps(scena, SYMBOL_DEFS, wezlyModeluEnm(enm))
    .filter((g) => g.reason === 'kropka-bez-wezla-modelu')
    .map((g) => g.testId ?? `${g.x},${g.y}`);

/** Iniekcja „stara postać modelu" (defekt ciągłości magistrali naprawiony w backendzie, karta
 *  UX-04): odcinek pola 2.1 doklejony do ciągu pola 1.1 zamiast własnego ciągu z pola 2.1. */
function zOdcinkiemDoklejonymDoCiaguGlownego(enm: EnergyNetworkModel): EnergyNetworkModel {
  type Ciag = { ref_id?: string; id?: string; ordered_segment_refs?: string[]; meta?: Record<string, unknown>; run_kind?: string; segments?: { order: number; segment_ref: string }[] };
  const model = structuredClone(enm) as EnergyNetworkModel & { corridors?: Ciag[]; line_runs?: Ciag[] };
  const glowny = model.corridors!.find((c) => !(c.meta ?? {})['gpz_field_ref'])!;
  const odejscie = model.corridors!.find((c) => (c.meta ?? {})['gpz_field_ref'])!;
  glowny.ordered_segment_refs = [...glowny.ordered_segment_refs!, ...odejscie.ordered_segment_refs!];
  model.corridors = model.corridors!.filter((c) => c !== odejscie);
  const runGlowny = model.line_runs!.find((r) => r.id === glowny.ref_id)!;
  runGlowny.segments = [
    ...runGlowny.segments!,
    ...odejscie.ordered_segment_refs!.map((segment_ref, i) => ({ order: runGlowny.segments!.length + i + 1, segment_ref })),
  ];
  model.line_runs = model.line_runs!.filter((r) => r.id !== odejscie.ref_id);
  return model;
}

const LODY: readonly SceneLod[] = [0, 1, 2];

describe('UX-04 — kabel odejścia pola jako gałąź modelu i rozłączność kabli różnych pól', () => {
  for (const [nazwaFx, enm] of FIKSTURY) {
    it(`${nazwaFx} · L2: pole zajęte — kabel z portu S przekładnika T2; pole wolne — żaden`, () => {
      const pola = polaLiniowe(enm);
      expect(pola.filter((p) => p.zajete).length, 'pola zajęte').toBeGreaterThanOrEqual(2);
      expect(pola.filter((p) => !p.zajete).length, 'pola wolne').toBeGreaterThanOrEqual(2);
      // Pola zajęte w RÓŻNYCH sekcjach — każde ma własny kabel odejścia z własnego ciągu.
      expect(new Set(pola.filter((p) => p.zajete).map((p) => p.sekcja))).toEqual(new Set([1, 2]));
      for (const [q1, q0] of [['zamkniety', 'zamkniety'], ['otwarty', 'otwarty'], ['brak', 'nieznany']] as const) {
        const { enm: model, scena } = scenaZ(nazwaFx, enm, q1, q0);
        expect(naruszeniaKablaOdejscia(model, scena), `${q1}/${q0}`).toEqual([]);
      }
    });

    for (const lod of LODY) {
      it(`${nazwaFx} · L${lod}: kable różnych pól bez nakładań, bez przecięć i bez kropek bez węzła modelu`, () => {
        const scena = buildSceneV3(enm, lod);
        expect(nakladaniaKabli(enm, scena)).toEqual([]);
        const przecieciaKabli = interiorCrossings(kableSceny(enm, scena));
        expect(przecieciaKabli).toEqual([]);
        expect(kropkiBezWezlaModelu(enm, scena)).toEqual([]);
      });
    }
  }

  it('iniekcja: odcinek pola 2.1 doklejony do ciągu pola 1.1 (stara postać modelu) — wyrocznia czerwona', () => {
    for (const [nazwaFx, enm] of FIKSTURY) {
      const zly = zOdcinkiemDoklejonymDoCiaguGlownego(enm);
      const naruszenia = naruszeniaKablaOdejscia(zly, buildSceneV3(zly, 2));
      expect(naruszenia.length, nazwaFx).toBeGreaterThan(0);
      expect(naruszenia.some((n) => n.includes('zaczyna się w')), `${nazwaFx}: ${naruszenia.join('; ')}`).toBe(true);
    }
  });

  it('iniekcja: kabel odejścia przesunięty o jedną kratkę od portu T2 — wyrocznia czerwona', () => {
    const [, enm] = FIKSTURY[0];
    const scena = buildSceneV3(enm, 2);
    const kabel = kableOdejsciaPola(enm, polaLiniowe(enm).find((p) => p.zajete)!.ref)[0];
    const przesuniety: SceneV3 = {
      ...scena,
      segments: scena.segments.map((s) =>
        s.meta?.ownerRef === kabel.ref_id ? { ...s, points: s.points.map((p, i) => (i === 0 ? { x: p.x + GRID, y: p.y } : p)) } : s,
      ),
    };
    expect(naruszeniaKablaOdejscia(enm, przesuniety).length).toBeGreaterThan(0);
  });

  it('iniekcje wyroczni rozłączności: dwa kable jedną kreską i kropka bez węzła modelu — czerwień', () => {
    const [, enm] = FIKSTURY[0];
    const scena = buildSceneV3(enm, 2);
    const [k1, k2] = polaLiniowe(enm)
      .filter((p) => p.zajete)
      .map((p) => kableOdejsciaPola(enm, p.ref)[0].ref_id);
    const s1 = scena.segments.find((s) => s.meta?.ownerRef === k1)!;
    const nakladka: SceneV3 = {
      ...scena,
      segments: [...scena.segments, { ...s1, meta: { ...s1.meta!, ownerRef: k2 } }],
    };
    expect(nakladaniaKabli(enm, nakladka).length).toBeGreaterThan(0);
    const zKropka: SceneV3 = {
      ...scena,
      symbols: [...scena.symbols, { symbolId: 'junction', x: 0, y: 0, meta: { elementKind: 'apparatus', testId: 'sld-v3-wezel-wstrzykniety' } }],
    };
    expect(kropkiBezWezlaModelu(enm, zKropka)).toEqual(['sld-v3-wezel-wstrzykniety']);
    // Kropka z odwołaniem do węzła, którego w modelu NIE ma — też czerwień (nazwa ≠ węzeł).
    const zFikcyjnymWezlem: SceneV3 = {
      ...scena,
      symbols: [...scena.symbols, { symbolId: 'junction', x: 0, y: 0, meta: { elementKind: 'apparatus', testId: 'sld-v3-wezel-fikcja', wezelModelu: 'bus/nie-istnieje' } }],
    };
    expect(kropkiBezWezlaModelu(enm, zFikcyjnymWezlem)).toEqual(['sld-v3-wezel-fikcja']);
  });
});

describe('UX-04 — przekaźnik pola obok pola (wymaganie właściciela 2026-10-29 pkt 6)', () => {
  for (const [nazwaFx, enm] of FIKSTURY) {
    it(`${nazwaFx}: okrąg przekaźnika na prawo od planu pola (aparaty i ich podpisy) w odstępie od GRID do 6×GRID`, () => {
      const scena = buildSceneV3(enm, 2);
      for (const pole of polaLiniowe(enm)) {
        const przekaznik = scena.symbols.find((s) => s.meta?.ownerRef === pole.ref && s.symbolId === 'protectionRelay');
        expect(przekaznik, pole.ref).toBeDefined();
        const aparaty = symbolePola(scena, pole.ref).map((s) => {
          const o = obrysSymbolu(s.symbolId);
          return s.x + o.x + o.width;
        });
        // Plan pola = aparaty, ich podpisy i pasmo adnotacji CT/VT (tabliczka przekładnika
        // z rdzeni modelu, decyzja architekta §11.7 pkt 6 — `polozenieOkreguPrzekaznika` stawia
        // okrąg ZA tym pasmem): przekaźnik stoi obok tak rozumianego planu.
        const podpisy = scena.labels
          .filter((l) => /#(etykieta-aparatu-|ct-rating-|vt-mounting-)/.test(l.ownerRef ?? '') && (l.ownerRef ?? '').startsWith(`${pole.ref}#`))
          .map((l) => l.rect.x + l.rect.width);
        const prawaPlanu = Math.max(...aparaty, ...podpisy);
        const lewaPrzekaznika = przekaznik!.x + obrysSymbolu(przekaznik!.symbolId).x;
        const odstep = lewaPrzekaznika - prawaPlanu;
        expect(odstep, `${pole.ref}: odstęp ${odstep}`).toBeGreaterThanOrEqual(GRID);
        expect(odstep, `${pole.ref}: odstęp ${odstep}`).toBeLessThanOrEqual(6 * GRID);
      }
    });
  }
});

/**
 * Uwagi właściciela 2026-10-29 pkt 4 i 5 (oderwane etykiety przekaźnika): blok przekaźnika
 * układu powiązań niesie KAŻDĄ funkcję pola DOKŁADNIE raz (okrąg: dwie pierwsze, wiersze —
 * pozostałe), ramka bloku obejmuje okrąg, wiersze i odniesienie źródła 3U₀ i nie wchodzi na
 * obce elementy, numeru „52" bez związku nie ma, linia wyłączania kończy się na zacisku
 * sterującym cewki wyłączającej Q0 (port `wylacz` symbolu wyłącznika), a przekładnik
 * Ferrantiego T2 ma linię pomiarową do przekaźnika (funkcja ziemnozwarciowa 51N z rdzenia T2,
 * ENEA Z.10 s.89: „Zab. ziemnozwarciowe t1, t2"). Wyrocznia z modelu (`Bay.protection_codes`,
 * rekordy aparatów), nie z kompozycji; iniekcje na gotowej scenie czerwienią każdy warunek.
 * Iloczyn: wykonanie {Z.10, Z.11.1, Z.11} × łączniki {trójpołożeniowy, stały} × sekcja {1, 2}
 * × pole {zajęte, wolne} (fikstury) × warunek bloku {kody, ramka, „52", cewka, T2}.
 */
function prostokatBloku(przekaznik: PreviewSymbol): Rect | null {
  const r = przekaznik.meta?.ramkaBlokuPrzekaznika;
  return r ? { x: przekaznik.x + r.x, y: przekaznik.y + r.y, width: r.width, height: r.height } : null;
}

function naruszeniaBlokuPrzekaznika(enm: EnergyNetworkModel, scena: SceneV3): string[] {
  const bledy: string[] = [];
  const zawiera = (a: Rect, b: Rect): boolean =>
    b.x >= a.x && b.y >= a.y && b.x + b.width <= a.x + a.width && b.y + b.height <= a.y + a.height;
  for (const pole of polaLiniowe(enm)) {
    const bay = (enm.bays ?? []).find((b) => b.ref_id === pole.ref)!;
    const kodyModelu = [...(bay.protection_codes ?? [])];
    const przekaznik = scena.symbols.find((s) => s.meta?.ownerRef === pole.ref && s.symbolId === 'protectionRelay');
    if (!przekaznik) {
      bledy.push(`${pole.ref}: brak przekaźnika`);
      continue;
    }
    const wiersze = scena.labels.filter((l) => /#protection-codes-full(-\d+)?$/.test(l.ownerRef ?? '') && (l.ownerRef ?? '').startsWith(`${pole.ref}#`));
    const odniesienia = scena.labels.filter((l) => /#zrodlo-u0(-\d+)?$/.test(l.ownerRef ?? '') && (l.ownerRef ?? '').startsWith(`${pole.ref}#`));
    const wBloku = [...(przekaznik.meta?.protectionCodes ?? []), ...wiersze.flatMap((l) => l.text.split(' · '))];
    if (new Set(wBloku).size !== wBloku.length) bledy.push(`${pole.ref}: funkcja powtórzona w bloku (${wBloku.join(', ')})`);
    if ([...wBloku].sort().join() !== [...kodyModelu].sort().join()) bledy.push(`${pole.ref}: funkcje bloku ≠ model`);
    const rama = prostokatBloku(przekaznik);
    if (!rama) {
      bledy.push(`${pole.ref}: brak ramki bloku`);
    } else {
      const o = obrysSymbolu(przekaznik.symbolId);
      const okrag = { x: przekaznik.x + o.x, y: przekaznik.y + o.y, width: o.width, height: o.height };
      for (const r of [okrag, ...wiersze.map((l) => l.rect), ...odniesienia.map((l) => l.rect)]) {
        if (!zawiera(rama, r)) bledy.push(`${pole.ref}: element bloku poza ramką`);
      }
      const wlasne = new Set([...wiersze, ...odniesienia].map((l) => l.ownerRef));
      for (const l of scena.labels) {
        if (!wlasne.has(l.ownerRef) && zachodzi(rama, l.rect)) bledy.push(`${pole.ref}: ramka bloku × etykieta ${l.ownerRef}`);
      }
      for (const sym of scena.symbols) {
        if (sym === przekaznik) continue;
        const os = obrysSymbolu(sym.symbolId);
        if (zachodzi(rama, { x: sym.x + os.x, y: sym.y + os.y, width: os.width, height: os.height })) {
          bledy.push(`${pole.ref}: ramka bloku × symbol ${sym.meta?.testId ?? sym.symbolId}`);
        }
      }
    }
    // Wiersze bloku (kody poza okręgiem i odniesienie źródła 3U₀) — kolumna o wspólnej lewej
    // krawędzi prostokątów i tekst zaczepiony w tej krawędzi (zrzut pola Z.10 2026-10-29:
    // wiersze wyśrodkowane w prostokątach szacowanej szerokości rozjeżdżały się o 36 px).
    const wierszeBloku = [...wiersze, ...odniesienia];
    if (new Set(wierszeBloku.map((l) => l.rect.x)).size > 1) {
      bledy.push(`${pole.ref}: wiersze bloku bez wspólnej lewej krawędzi (${wierszeBloku.map((l) => l.rect.x).join(', ')})`);
    }
    for (const l of wierszeBloku) {
      if (l.wyrownanieTekstu !== 'poczatek') bledy.push(`${pole.ref}: wiersz bloku ${l.ownerRef} nie zaczepiony w lewej krawędzi (${l.wyrownanieTekstu ?? 'środek'})`);
    }
    if (scena.labels.some((l) => l.ownerRef === `${pole.ref}#device-number`)) bledy.push(`${pole.ref}: numer „52" bez związku`);
    const q0 = symbolePola(scena, pole.ref).find((s) => s.symbolId === 'qetBreaker' || s.symbolId === 'qetBreakerZNapedem');
    const wylacz = q0 ? SYMBOL_DEFS[q0.symbolId].secondaryPorts.find((p) => p.name === 'wylacz') : undefined;
    const wyzwalanie = scena.segments.find((g) => g.meta?.ownerRef === `${pole.ref}#trip-line`);
    if (!q0 || !wylacz || !wyzwalanie) {
      bledy.push(`${pole.ref}: brak wyłącznika z cewką albo linii wyłączania`);
    } else {
      const cel = { x: q0.x + wylacz.x, y: q0.y + wylacz.y };
      if (!wyzwalanie.points.some((q) => rowne(q, cel))) bledy.push(`${pole.ref}: linia wyłączania nie kończy się na cewce Q0`);
    }
    const t2 = symbolePola(scena, pole.ref).find((s) => s.symbolId === 'qetCoreBalanceCt');
    const t2Port = t2 ? SYMBOL_DEFS.qetCoreBalanceCt.secondaryPorts.find((p) => p.name === 'wtorny') : undefined;
    const pomiary = scena.segments.filter((g) => g.meta?.kind === 'measurementLink' && (g.meta?.ownerRef ?? '').startsWith(`${pole.ref}#`));
    if (!t2 || !t2Port) bledy.push(`${pole.ref}: brak przekładnika Ferrantiego`);
    else if (!pomiary.some((g) => rowne(g.points[0], { x: t2.x + t2Port.x, y: t2.y + t2Port.y }))) {
      bledy.push(`${pole.ref}: przekładnik Ferrantiego bez linii pomiarowej do przekaźnika`);
    }
  }
  return bledy;
}

describe('UX-04 — blok przekaźnika: jedna reprezentacja funkcji, cewka Q0, T2 → przekaźnik (uwagi właściciela pkt 4 i 5)', () => {
  for (const [nazwaFx, enm] of FIKSTURY) {
    it(`${nazwaFx} · L2: każda funkcja raz w bloku, ramka bez kolizji, bez „52", wyłączanie do cewki, T2 z linią pomiarową`, () => {
      const scena = buildSceneV3(enm, 2);
      expect(polaLiniowe(enm).length).toBeGreaterThan(0);
      expect(naruszeniaBlokuPrzekaznika(enm, scena)).toEqual([]);
    });
  }

  const [, enmZ11] = FIKSTURY[2];
  const scenaBazowa = buildSceneV3(enmZ11, 2);
  const poleZ111 = polaLiniowe(enmZ11).find((p) => p.pole === 'Z11_1')!;
  const zmien = (f: (s: { -readonly [K in keyof SceneV3]: SceneV3[K] }) => void): SceneV3 => {
    const kopia = structuredClone(scenaBazowa) as { -readonly [K in keyof SceneV3]: SceneV3[K] };
    f(kopia);
    return kopia;
  };
  const przekaznikZ = (s: SceneV3) => s.symbols.find((x) => x.meta?.ownerRef === poleZ111.ref && x.symbolId === 'protectionRelay')!;

  it('warunek wstępny: Z.11.1 — blok z wierszami kodów i odniesieniem źródła 3U₀', () => {
    expect(poleZ111).toBeDefined();
    expect(scenaBazowa.labels.some((l) => l.ownerRef === `${poleZ111.ref}#protection-codes-full`)).toBe(true);
    expect(prostokatBloku(przekaznikZ(scenaBazowa))).not.toBeNull();
  });

  it('iniekcja: ramka bloku węższa o kratkę — wiersz bloku poza ramką', () => {
    const s = zmien((k) => {
      const p = przekaznikZ(k) as { meta: { ramkaBlokuPrzekaznika: Rect } };
      p.meta.ramkaBlokuPrzekaznika = { ...p.meta.ramkaBlokuPrzekaznika, width: p.meta.ramkaBlokuPrzekaznika.width - GRID };
    });
    expect(naruszeniaBlokuPrzekaznika(enmZ11, s).join('\n')).toContain(`${poleZ111.ref}: element bloku poza ramką`);
  });

  it('iniekcja: pełna lista z kodami okręgu (stan przed naprawą) — funkcja powtórzona', () => {
    const s = zmien((k) => {
      const kody = przekaznikZ(k).meta!.protectionCodes!;
      const l = k.labels.find((x) => x.ownerRef === `${poleZ111.ref}#protection-codes-full`) as { text: string };
      l.text = `${kody.join(' · ')} · ${l.text}`;
    });
    expect(naruszeniaBlokuPrzekaznika(enmZ11, s).join('\n')).toContain('funkcja powtórzona w bloku');
  });

  it('iniekcja: numer „52" w połowie linii wyłączania (stan przed naprawą) — numer bez związku', () => {
    const s = zmien((k) => {
      const wzor = k.labels.find((x) => x.ownerRef === `${poleZ111.ref}#protection-codes-full`)!;
      k.labels = [...k.labels, { ...wzor, ownerRef: `${poleZ111.ref}#device-number`, text: '52', rect: { ...wzor.rect, x: -500, y: -500 } }];
    });
    expect(naruszeniaBlokuPrzekaznika(enmZ11, s).join('\n')).toContain('numer „52" bez związku');
  });

  it('iniekcja: wiersz bloku wyśrodkowany w prostokącie (stan przed naprawą) — wiersz nie zaczepiony w lewej krawędzi', () => {
    const s = zmien((k) => {
      const l = k.labels.find((x) => x.ownerRef === `${poleZ111.ref}#protection-codes-full-2`) as { wyrownanieTekstu?: string };
      delete l.wyrownanieTekstu;
    });
    expect(naruszeniaBlokuPrzekaznika(enmZ11, s).join('\n')).toContain(`wiersz bloku ${poleZ111.ref}#protection-codes-full-2 nie zaczepiony w lewej krawędzi (środek)`);
  });

  it('iniekcja: wiersz bloku przesunięty o kratkę — wiersze bez wspólnej lewej krawędzi', () => {
    const s = zmien((k) => {
      const l = k.labels.find((x) => x.ownerRef === `${poleZ111.ref}#protection-codes-full-2`) as { rect: Rect };
      l.rect = { ...l.rect, x: l.rect.x + GRID };
    });
    expect(naruszeniaBlokuPrzekaznika(enmZ11, s).join('\n')).toContain(`${poleZ111.ref}: wiersze bloku bez wspólnej lewej krawędzi`);
  });

  it('iniekcja: linia wyłączania do środka kafla Q0 — nie kończy się na cewce', () => {
    const s = zmien((k) => {
      const q0 = symbolePola(k, poleZ111.ref).find((x) => x.symbolId === 'qetBreakerZNapedem')!;
      const g = k.segments.find((x) => x.meta?.ownerRef === `${poleZ111.ref}#trip-line`) as { points: { x: number; y: number }[] };
      g.points = [{ x: q0.x + 24, y: q0.y + 24 }, ...g.points.slice(1)];
    });
    expect(naruszeniaBlokuPrzekaznika(enmZ11, s).join('\n')).toContain('linia wyłączania nie kończy się na cewce Q0');
  });

  it('iniekcja: linia pomiarowa T2 zdjęta — przekładnik Ferrantiego bez powiązania z przekaźnikiem', () => {
    const t2 = symbolePola(scenaBazowa, poleZ111.ref).find((x) => x.symbolId === 'qetCoreBalanceCt')!;
    const port = SYMBOL_DEFS.qetCoreBalanceCt.secondaryPorts.find((p) => p.name === 'wtorny')!;
    const s = zmien((k) => {
      k.segments = k.segments.filter((g) => !(g.meta?.kind === 'measurementLink' && rowne(g.points[0], { x: t2.x + port.x, y: t2.y + port.y })));
    });
    expect(naruszeniaBlokuPrzekaznika(enmZ11, s).join('\n')).toContain('przekładnik Ferrantiego bez linii pomiarowej');
  });

  it('ramka bloku rysowana przez glif przekaźnika z meta sceny (ten sam prostokąt, kreska cieńsza od okręgu)', () => {
    const p = przekaznikZ(scenaBazowa);
    const Glyph = SYMBOL_GLYPHS.protectionRelay;
    const doc = new DOMParser().parseFromString(
      renderToStaticMarkup(
        <svg>
          <Glyph x={p.x} y={p.y} {...daneGlifuSymbolu(p)} />
        </svg>,
      ),
      'image/svg+xml',
    );
    const rama = doc.querySelector('[data-przekaznik="ramka-bloku"]')!;
    expect(rama).not.toBeNull();
    const r = p.meta!.ramkaBlokuPrzekaznika!;
    expect([rama.getAttribute('x'), rama.getAttribute('y'), rama.getAttribute('width'), rama.getAttribute('height')].map(Number)).toEqual([r.x, r.y, r.width, r.height]);
    const okrag = doc.querySelector('circle')!;
    expect(Number(rama.getAttribute('stroke-width'))).toBeLessThan(Number(okrag.getAttribute('stroke-width')));
  });
});

/** Rodzaj etykiety warstwy adnotacji zabezpieczeń z sufiksu `ownerRef` (kontrakt kompozytorów
 *  `compose/gpz.ts`, `compose/station.ts`). */
function rodzajAdnotacjiZabezpieczen(l: OwnedLabel): string {
  const sufiks = (l.ownerRef ?? '').split('#')[1] ?? '';
  if (/^protection-codes-full(-\d+)?$/.test(sufiks)) return 'wiersz kodów';
  if (/^zrodlo-u0(-\d+)?$/.test(sufiks)) return 'odniesienie 3U₀';
  if (sufiks.startsWith('ct-rating-')) return 'adnotacja CT';
  if (sufiks.startsWith('vt-mounting-')) return 'adnotacja VT';
  if (sufiks === 'device-number') return 'numer 52';
  return `nieznany (${sufiks})`;
}

describe('UX-04 — tekst etykiet warstwy adnotacji zabezpieczeń zaczepiony w krawędzi prostokąta', () => {
  // Iloczyn: kompozytor (pole GPZ z powiązaniami obwodów — blok przekaźnika; GPZ bez powiązań;
  // stacja SN — lista R-2 pod okręgiem) × rodzaj etykiety (wiersz kodów, odniesienie 3U₀,
  // adnotacja CT/VT, numer 52) × LOD (1, 2). Strona prostokąta względem kotwicy wyznacza
  // krawędź zaczepu tekstu: z prawej kotwicy — lewa krawędź, wiersze prawo-dosunięte pod
  // okręgiem — prawa.
  const ZESTAW: ReadonlyArray<readonly [string, EnergyNetworkModel]> = [
    ...FIKSTURY,
    ['stacje SN i GPZ (geometria stacji, łączniki zamknięte)', (fxStacjeZamkniete as unknown as { snapshot: EnergyNetworkModel }).snapshot],
    ['GPZ 110 kV (geometria stacji)', (fxGpz110 as unknown as { snapshot: EnergyNetworkModel }).snapshot],
  ];
  const pokrycie = new Set<string>();
  for (const [nazwaFx, enm] of ZESTAW) {
    for (const lod of [1, 2] as const) {
      it(`${nazwaFx} · L${lod}: każda etykieta zabezpieczeń niesie wyrównanie zgodne ze stroną kotwicy`, () => {
        const scena = buildSceneV3(enm, lod);
        const bledy: string[] = [];
        for (const l of scena.labels.filter((x) => x.ownerKind === 'protection')) {
          const rodzaj = rodzajAdnotacjiZabezpieczen(l);
          const oczekiwane = l.placement === 'right' ? 'poczatek' : l.placement === 'below' ? 'koniec' : undefined;
          pokrycie.add(`${rodzaj} · ${l.placement ?? 'brak'} · ${l.wyrownanieTekstu ?? 'środek'}`);
          if (rodzaj.startsWith('nieznany')) bledy.push(`${l.ownerRef}: ${rodzaj}`);
          if (oczekiwane === undefined) bledy.push(`${l.ownerRef}: strona ${l.placement ?? 'brak'} bez reguły zaczepu`);
          else if (l.wyrownanieTekstu !== oczekiwane) bledy.push(`${l.ownerRef} (${rodzaj}, ${l.placement}): ${l.wyrownanieTekstu ?? 'środek'} ≠ ${oczekiwane}`);
        }
        expect(bledy).toEqual([]);
      });
    }
  }
  it('pokrycie iloczynu na scenie: blok przekaźnika (prawa strona, lewa krawędź) i lista pola GPZ bez powiązań (pod okręgiem, prawa krawędź)', () => {
    // Kolejność `it` w pliku: ten test biegnie po komórkach iloczynu wyżej. Lista stacji SN
    // pod okręgiem i adnotacje CT/„52" stacji — kompozytor stacji,
    // `compose/__tests__/station.test.ts` (opis „R-2 × zaczep tekstu").
    expect([...pokrycie].sort()).toEqual(
      expect.arrayContaining([
        'wiersz kodów · right · poczatek',
        'odniesienie 3U₀ · right · poczatek',
        'wiersz kodów · below · koniec',
      ]),
    );
  });

  it('zaczep tekstu: lewa krawędź / prawa krawędź / środek; etykieta obrócona zawsze w środku (obrót wokół środka)', () => {
    const r = { x: 16, y: 40, width: 96, height: 14 };
    expect(zaczepTekstuEtykiety(r, 'poczatek', false)).toEqual({ x: 16, y: 47, textAnchor: 'start' });
    expect(zaczepTekstuEtykiety(r, 'koniec', false)).toEqual({ x: 112, y: 47, textAnchor: 'end' });
    expect(zaczepTekstuEtykiety(r, undefined, false)).toEqual({ x: 64, y: 47, textAnchor: 'middle' });
    for (const w of ['poczatek', 'koniec', undefined] as const) {
      expect(zaczepTekstuEtykiety(r, w, true)).toEqual({ x: 64, y: 47, textAnchor: 'middle' });
    }
  });
});

describe('UX-04 — tło pola obejmuje podpis pola i opisy jego zabezpieczeń (przekaźnik obok pola)', () => {
  const zawiera = (a: Rect, b: Rect): boolean =>
    b.x >= a.x && b.y >= a.y && b.x + b.width <= a.x + a.width && b.y + b.height <= a.y + a.height;
  // Etykiety pola w tle: podpis pola, opisy zabezpieczeń i tabliczki przekładników z pasma
  // adnotacji CT/VT (pasmo leży między torem a przekaźnikiem — wewnątrz pola).
  const ETYKIETY_POLA = /#(designation|protection-codes-full(-\d+)?|zrodlo-u0(-\d+)?|device-number|ct-rating-.+|vt-mounting-.+)$/;
  for (const [nazwaFx, enm] of FIKSTURY) {
    it(`${nazwaFx} · L2: podpis pola i kody funkcji w całości w tle pola; tła rozłączne parami`, () => {
      const scena = buildSceneV3(enm, 2);
      const panele = scena.meta.gpzAdnotacje?.panele ?? [];
      let poza = 0;
      for (const pole of polaLiniowe(enm)) {
        const panel = panele.find((p) => p.bayRef === pole.ref);
        expect(panel, pole.ref).toBeDefined();
        const etykiety = scena.labels.filter((l) => (l.ownerRef ?? '').startsWith(`${pole.ref}#`) && ETYKIETY_POLA.test(l.ownerRef ?? ''));
        expect(etykiety.some((l) => l.ownerRef === `${pole.ref}#designation`), `${pole.ref}: podpis pola`).toBe(true);
        for (const l of etykiety) expect(zawiera(panel!.rect, l.rect), `${l.ownerRef} w tle pola`).toBe(true);
        // Warunek wstępny (nie pusta wyrocznia): etykieta pola (podpis albo wiersz kodów
        // funkcji) sięga za obrys samych symboli pola i przekaźnika — tło liczone bez etykiet
        // przecinałoby tekst (stan przed naprawą).
        const prawaSymboli = Math.max(
          ...scena.symbols
            .filter((s) => s.meta?.ownerRef === pole.ref)
            .map((s) => s.x + obrysSymbolu(s.symbolId).x + obrysSymbolu(s.symbolId).width),
        );
        if (etykiety.some((l) => l.rect.x + l.rect.width > prawaSymboli)) poza += 1;
      }
      expect(poza, 'pola z etykietą dłuższą niż obrys symboli').toBeGreaterThan(0);
      panele.forEach((a, i) => panele.slice(i + 1).forEach((b) => expect(zachodzi(a.rect, b.rect), `${a.bayRef} × ${b.bayRef}`).toBe(false)));
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

  it('rekord odłącznika w położeniu „uziemiony" (sprzeczny z rodzajem) — stan nieustalony, kafel „?"', () => {
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
        expect(kaflePola(scena, pole.ref).map((r) => r.symbol)).toContain(q1);
        expect(kafelOczekiwany(q1.symbolId, q1.state)).toBe('nieustalony');
        const etykieta = scena.labels.find((l) => l.ownerRef === `${pole.ref}#etykieta-aparatu-${q1.meta!.deviceRef}`);
        expect(etykieta?.text).toBe('Q1');
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

/* ── Wymaganie właściciela 2026-10-29 pkt 8: kanwa względem topologii ENM ──────────────────
 * Dwie wyrocznie niezależne od kodu kompozycji, liczone z rekordów modelu i z gotowej sceny:
 *  (a) aparaty: każdy symbol pola z `deviceRef` ma rekord aparatu TEGO pola i rysunek równy
 *      tabeli rodzaju rekordu (napęd wyłącznika, liczba uzwojeń przekładnika napięciowego), każdy
 *      rekord ma dokładnie jeden symbol, a jedyny symbol pola bez rekordu to znak „koniec kabla
 *      niepodłączony" pola wolnego — zero aparatów fikcyjnych;
 *  (b) połączenia: końce aparatów (`deviceRef` × strona N/S) łączone przewodami pola (tor, odczep
 *      aparatu bocznego, odgałęzienie przekładnika) tworzą składowe spójne; dwa końce leżą w jednej
 *      składowej WTEDY I TYLKO WTEDY, gdy model przypisuje im ten sam węzeł pola (`ports[].wezel`).
 *      Kierunek „tylko wtedy" łapie połączenie narysowane bez węzła w modelu, kierunek „wtedy"
 *      — węzeł modelu bez połączenia na rysunku. Zejście z szyny kończy się na końcu z węzłem
 *      „szyna". Aparat jednoportowy w osi toru (wskaźnik napięcia, przekładnik Ferrantiego) łączy
 *      swój koniec N i S — to ten sam węzeł modelu.
 * ILOCZYN: fikstury {Z.10 stały w sekcji 1, w sekcji 2, Z.11.1 + Z.11} × pole {zajęte, wolne}
 * × poziom szczegółu {L1, L2} (L0 rysuje pole zwinięte jednym znakiem, bez aparatów).
 * Iniekcje: symbol bez rekordu, rekord bez symbolu, węzeł wyjścia wyłącznika zmieniony w modelu,
 * przewód dorysowany między końcami różnych węzłów, napęd zdjęty z rekordu, liczba uzwojeń T3. */

/** Rysunek QET rekordu aparatu pola — tabela §2 dokumentu karty (niezależna od kompozycji). */
function rysunekRekordu(d: BayPrimaryDevice): string {
  const liczbaUzwojen = d.uzwojenia?.length ?? 0;
  const tabela: Readonly<Partial<Record<BayPrimaryDevice['kind'], string>>> = {
    CB: d.naped === 'SILNIKOWY' ? 'qetBreakerZNapedem' : 'qetBreaker',
    VT: liczbaUzwojen === 3 ? 'qetVoltageTransformer3' : liczbaUzwojen === 2 ? 'qetVoltageTransformer2' : 'qetVoltageTransformer',
    DS: 'qetDisconnector',
    ES: 'qetEarthSwitch',
    THREE_POSITION_SWITCH: d.naped === 'ZASOBNIKOWY_RECZNY' ? 'qetThreePositionSwitchZNapedem' : 'qetThreePositionSwitch',
    CT: 'qetCurrentTransformer',
    CORE_BALANCE_CT: 'qetCoreBalanceCt',
    CABLE_HEAD: 'qetCableHead',
    VOLTAGE_INDICATOR: 'qetVoltageIndicator',
  };
  const symbol = tabela[d.kind];
  if (!symbol) throw new Error(`rodzaj ${d.kind} spoza wzorców pola liniowego`);
  return symbol;
}

const rekordyPola = (enm: EnergyNetworkModel, bayRef: string): readonly BayPrimaryDevice[] =>
  (enm.bays ?? []).find((b) => b.ref_id === bayRef)?.primary_devices ?? [];

function aparatyBezOdpowiednika(enm: EnergyNetworkModel, scena: SceneV3): string[] {
  const naruszenia: string[] = [];
  for (const pole of polaLiniowe(enm)) {
    const rekordy = new Map(rekordyPola(enm, pole.ref).map((d) => [d.device_ref, d]));
    const symbole = symbolePola(scena, pole.ref);
    for (const s of symbole) {
      const deviceRef = s.meta?.deviceRef;
      if (!deviceRef) {
        if (s.symbolId !== 'bayReserve' || pole.zajete) naruszenia.push(`${pole.ref}: symbol ${s.symbolId} bez rekordu aparatu`);
        continue;
      }
      const d = rekordy.get(deviceRef);
      if (!d) {
        naruszenia.push(`${pole.ref}: symbol ${s.symbolId} (${deviceRef}) bez rekordu aparatu pola`);
        continue;
      }
      if (s.symbolId !== rysunekRekordu(d)) {
        naruszenia.push(`${pole.ref}: ${d.designation} narysowany ${s.symbolId}, rekord wymaga ${rysunekRekordu(d)}`);
      }
    }
    for (const d of rekordy.values()) {
      const n = symbole.filter((s) => s.meta?.deviceRef === d.device_ref).length;
      if (n !== 1) naruszenia.push(`${pole.ref}: rekord ${d.designation} ma ${n} symboli`);
    }
  }
  return naruszenia;
}

/** Węzeł pola po stronie N/S rysunku aparatu: dwuportowy — `we`/`wy`, jednoportowy — jedyny port. */
function wezelStrony(d: BayPrimaryDevice, strona: 'N' | 'S'): string | null {
  const porty = d.ports ?? [];
  if (porty.length === 1) return porty[0].wezel ?? null;
  return porty.find((p) => p.port_id === (strona === 'N' ? 'we' : 'wy'))?.wezel ?? null;
}

const KONIEC_KABLA_NIEPODLACZONEGO = '#koniec-kabla';

function polaczeniaBezOdpowiednika(enm: EnergyNetworkModel, scena: SceneV3): string[] {
  const naruszenia: string[] = [];
  for (const pole of polaLiniowe(enm)) {
    const rekordy = new Map(rekordyPola(enm, pole.ref).map((d) => [d.device_ref, d]));
    /** Koniec aparatu → węzeł modelu; znak końca kabla pola wolnego leży na węźle „kabel". */
    const wezelKonca = new Map<string, string | null>();
    const koncePunktu = new Map<string, string[]>();
    const rodzic = new Map<string, string>();
    const korzen = (k: string): string => {
      let r = k;
      while (rodzic.get(r) !== r) r = rodzic.get(r)!;
      return r;
    };
    const polacz = (a: string, b: string) => rodzic.set(korzen(a), korzen(b));
    for (const s of symbolePola(scena, pole.ref)) {
      const d = s.meta?.deviceRef ? rekordy.get(s.meta.deviceRef) : undefined;
      const id = d ? d.device_ref : s.symbolId === 'bayReserve' ? KONIEC_KABLA_NIEPODLACZONEGO : null;
      if (!id) continue;
      const porty = SYMBOL_DEFS[s.symbolId].ports.filter((p) => p.dir === 'N' || p.dir === 'S');
      for (const p of porty) {
        const koniec = `${id}|${p.dir}`;
        wezelKonca.set(koniec, d ? wezelStrony(d, p.dir as 'N' | 'S') : 'kabel');
        rodzic.set(koniec, koniec);
        const punkt = `${s.x + p.x},${s.y + p.y}`;
        koncePunktu.set(punkt, [...(koncePunktu.get(punkt) ?? []), koniec]);
      }
      if (porty.length === 2 && (!d || (d.ports ?? []).length === 1)) polacz(`${id}|N`, `${id}|S`);
    }
    const przewody = scena.segments.filter((s) => {
      const r = s.meta?.ownerRef ?? '';
      return r.startsWith(`${pole.ref}#wire-`) || r.startsWith(`${pole.ref}#lateral-`) || r.startsWith(`${pole.ref}#odgalezienie-`);
    });
    for (const w of przewody) {
      const konce = [w.points[0], w.points[w.points.length - 1]].map((p) => koncePunktu.get(`${p.x},${p.y}`));
      if (konce.some((k) => !k)) {
        naruszenia.push(`${pole.ref}: przewód ${w.meta?.ownerRef} kończy się poza portem aparatu`);
        continue;
      }
      const wszystkie = konce.flat() as string[];
      for (const k of wszystkie.slice(1)) polacz(wszystkie[0], k);
    }
    const zejscie = scena.segments.find((s) => s.meta?.ownerRef === `${pole.ref}#descent`);
    const dolZejscia = zejscie?.points[zejscie.points.length - 1];
    const konceZejscia = dolZejscia ? koncePunktu.get(`${dolZejscia.x},${dolZejscia.y}`) ?? [] : [];
    if (!konceZejscia.some((k) => wezelKonca.get(k) === 'szyna')) naruszenia.push(`${pole.ref}: zejście z szyny nie kończy się na węźle „szyna"`);
    const konce = [...wezelKonca.keys()].sort();
    for (let i = 0; i < konce.length; i++) {
      for (let j = i + 1; j < konce.length; j++) {
        const [a, b] = [konce[i], konce[j]];
        const wspolnyWezel = wezelKonca.get(a) != null && wezelKonca.get(a) === wezelKonca.get(b);
        const polaczone = korzen(a) === korzen(b);
        if (wspolnyWezel && !polaczone) naruszenia.push(`${pole.ref}: węzeł ${wezelKonca.get(a)} (${a} · ${b}) bez połączenia na rysunku`);
        if (!wspolnyWezel && polaczone) naruszenia.push(`${pole.ref}: połączenie ${a} · ${b} bez wspólnego węzła w modelu`);
      }
    }
  }
  return naruszenia;
}

describe('UX-04 — kanwa względem topologii ENM: aparaty i połączenia z modelu (wymaganie 8)', () => {
  for (const [nazwaFx, enm] of FIKSTURY) {
    for (const lod of [1, 2] as const) {
      it(`${nazwaFx} · L${lod}: każdy aparat ma rekord, każde połączenie — wspólny węzeł modelu, i odwrotnie`, () => {
        const scena = buildSceneV3(enm, lod);
        expect(aparatyBezOdpowiednika(enm, scena)).toEqual([]);
        expect(polaczeniaBezOdpowiednika(enm, scena)).toEqual([]);
      });
    }
  }

  it('warunek wstępny: fikstury niosą napęd silnikowy Q0 i T3 Z.11.1 z trzema uzwojeniami w gwieździe (decyzja właściciela pkt 1)', () => {
    let z111 = 0;
    for (const [, enm] of FIKSTURY) {
      for (const pole of polaLiniowe(enm)) {
        const rekordy = rekordyPola(enm, pole.ref);
        expect(rekordy.find((d) => d.designation === 'Q0')?.naped, pole.ref).toBe('SILNIKOWY');
        // Łącznik trójpołożeniowy Q1 — napęd zasobnikowy ręczny; Q5 odgałęzienia i odłącznik
        // wykonania stałego — bez napędu (rysunki s.89/s.91).
        const q1 = rekordy.find((d) => d.designation === 'Q1')!;
        expect(q1.naped ?? null, pole.ref).toBe(q1.kind === 'THREE_POSITION_SWITCH' ? 'ZASOBNIKOWY_RECZNY' : null);
        const q5 = rekordy.find((d) => d.designation === 'Q5');
        if (q5) expect(q5.naped ?? null, pole.ref).toBeNull();
        if (pole.pole !== 'Z11_1') continue;
        z111 += 1;
        const t3 = rekordy.find((d) => d.designation === 'T3')!;
        expect(t3.uzwojenia?.map((u) => [u.przekladnia, u.otwarty_trojkat]), pole.ref).toEqual([
          ['SN/√3 / 0,1/√3', false],
          ['SN/√3 / 0,1/√3', false],
          ['SN/√3 / 0,1/√3', false],
        ]);
      }
    }
    expect(z111).toBeGreaterThan(0);
  });

  const [, fxZ11Model] = FIKSTURY[2];
  const poleZ111 = polaLiniowe(fxZ11Model).find((p) => p.pole === 'Z11_1' && p.zajete)!;

  it('iniekcja: symbol z deviceRef spoza rekordów pola i rekord bez symbolu — wyrocznia aparatów czerwona', () => {
    const scena = buildSceneV3(fxZ11Model, 2);
    const wzor = symbolePola(scena, poleZ111.ref).find((s) => s.meta?.deviceRef)!;
    const fikcyjny: SceneV3 = {
      ...scena,
      symbols: [...scena.symbols, { ...wzor, x: wzor.x + 10 * GRID, meta: { ...wzor.meta!, deviceRef: `${poleZ111.ref}::dev::99` } }],
    };
    expect(aparatyBezOdpowiednika(fxZ11Model, fikcyjny).some((n) => n.includes('bez rekordu aparatu pola'))).toBe(true);
    const bezSymbolu: SceneV3 = { ...scena, symbols: scena.symbols.filter((s) => s !== wzor) };
    expect(aparatyBezOdpowiednika(fxZ11Model, bezSymbolu).some((n) => n.includes('ma 0 symboli'))).toBe(true);
  });

  it('iniekcja: węzeł wyjścia Q0 zmieniony w modelu, rysunek z dawnego modelu — połączenie bez wspólnego węzła', () => {
    const scena = buildSceneV3(fxZ11Model, 2);
    const model = structuredClone(fxZ11Model) as EnergyNetworkModel;
    const q0 = model.bays!.find((b) => b.ref_id === poleZ111.ref)!.primary_devices!.find((d) => d.designation === 'Q0')!;
    q0.ports = (q0.ports ?? []).map((p) => (p.port_id === 'wy' ? { ...p, wezel: 'w9' } : p));
    const naruszenia = polaczeniaBezOdpowiednika(model, scena);
    expect(naruszenia.some((n) => n.includes('bez wspólnego węzła w modelu')), naruszenia.join('; ')).toBe(true);
  });

  it('iniekcja: przewód T1 → PF1 usunięty ze sceny — węzeł modelu bez połączenia na rysunku', () => {
    const scena = buildSceneV3(fxZ11Model, 2);
    const mapa = oznaczenia(fxZ11Model, poleZ111.ref);
    const tor = torGlowny(scena, poleZ111.ref);
    const t1 = tor.find((s) => mapa.get(s.meta?.deviceRef ?? '') === 'T1')!;
    const wyjscieT1 = portSwiata(t1, 'S');
    const bezPrzewodu: SceneV3 = {
      ...scena,
      segments: scena.segments.filter(
        (s) => !((s.meta?.ownerRef ?? '').startsWith(`${poleZ111.ref}#wire-`) && rowne(s.points[0], wyjscieT1)),
      ),
    };
    expect(bezPrzewodu.segments.length).toBe(scena.segments.length - 1);
    const naruszenia = polaczeniaBezOdpowiednika(fxZ11Model, bezPrzewodu);
    expect(naruszenia.some((n) => n.includes('w3') && n.includes('bez połączenia na rysunku')), naruszenia.join('; ')).toBe(true);
  });

  it('iniekcja: przewód dorysowany z wyjścia Q1 do wejścia T1 (różne węzły modelu) — wyrocznia połączeń czerwona', () => {
    const scena = buildSceneV3(fxZ11Model, 2);
    const mapa = oznaczenia(fxZ11Model, poleZ111.ref);
    const tor = torGlowny(scena, poleZ111.ref);
    const q1 = tor.find((s) => mapa.get(s.meta?.deviceRef ?? '') === 'Q1')!;
    const t1 = tor.find((s) => mapa.get(s.meta?.deviceRef ?? '') === 'T1')!;
    const wzor = scena.segments.find((s) => s.meta?.ownerRef === `${poleZ111.ref}#wire-0`)!;
    const dorysowany: SceneV3 = {
      ...scena,
      segments: [
        ...scena.segments,
        { ...wzor, points: [portSwiata(q1, 'S'), portSwiata(t1, 'N')], meta: { ...wzor.meta!, ownerRef: `${poleZ111.ref}#wire-99` } },
      ],
    };
    expect(polaczeniaBezOdpowiednika(fxZ11Model, dorysowany).some((n) => n.includes('bez wspólnego węzła w modelu'))).toBe(true);
  });

  it('iniekcja: napęd zdjęty z rekordów Q0 i Q1 — łączniki bez znaku napędu; z napędem — ze znakiem (symbol z modelu)', () => {
    let trojpolozeniowe = 0;
    for (const [nazwaFx, enm] of FIKSTURY) {
      const model = structuredClone(enm) as EnergyNetworkModel;
      for (const bay of model.bays ?? []) {
        if (!(bay.tags ?? []).includes('gpz_line_field')) continue;
        for (const d of bay.primary_devices ?? []) if (d.kind === 'CB' || d.kind === 'THREE_POSITION_SWITCH') d.naped = null;
      }
      const scena = buildSceneV3(model, 2);
      for (const pole of polaLiniowe(model)) {
        const mapa = oznaczenia(model, pole.ref);
        const tor = torGlowny(scena, pole.ref);
        const q0 = tor.find((s) => mapa.get(s.meta?.deviceRef ?? '') === 'Q0')!;
        expect(q0.symbolId, `${nazwaFx} ${pole.ref}`).toBe('qetBreaker');
        const q1 = tor.find((s) => mapa.get(s.meta?.deviceRef ?? '') === 'Q1')!;
        if (rodzajSymbolu(q1.symbolId) !== 'qetThreePositionSwitch') continue;
        trojpolozeniowe += 1;
        expect(q1.symbolId, `${nazwaFx} ${pole.ref}`).toBe('qetThreePositionSwitch');
      }
      expect(aparatyBezOdpowiednika(model, scena), nazwaFx).toEqual([]);
      // Rysunek z napędem przy rekordzie bez napędu — wyrocznia aparatów czerwona.
      const naruszenia = aparatyBezOdpowiednika(model, buildSceneV3(enm, 2));
      expect(naruszenia.some((n) => n.includes('qetBreakerZNapedem')), nazwaFx).toBe(true);
      expect(naruszenia.some((n) => n.includes('qetThreePositionSwitchZNapedem')), nazwaFx).toBe(true);
    }
    expect(trojpolozeniowe).toBeGreaterThan(0);
  });

  it('iniekcja: liczba uzwojeń wtórnych T3 z rekordu {3, 2, 1, 0} → rysunek {3, 2, 1, 1} okręgów wtórnych', () => {
    const oczekiwany: Readonly<Record<number, string>> = {
      3: 'qetVoltageTransformer3',
      2: 'qetVoltageTransformer2',
      1: 'qetVoltageTransformer',
      0: 'qetVoltageTransformer',
    };
    for (const liczba of [3, 2, 1, 0]) {
      const model = structuredClone(fxZ11Model) as EnergyNetworkModel;
      const t3 = model.bays!.find((b) => b.ref_id === poleZ111.ref)!.primary_devices!.find((d) => d.designation === 'T3')!;
      t3.uzwojenia = (t3.uzwojenia ?? []).slice(0, liczba);
      const scena = buildSceneV3(model, 2);
      const symbol = symbolePola(scena, poleZ111.ref).find((s) => s.meta?.deviceRef === t3.device_ref)!;
      expect(symbol.symbolId, `${liczba} uzwojeń`).toBe(oczekiwany[liczba]);
      expect(aparatyBezOdpowiednika(model, scena), `${liczba} uzwojeń`).toEqual([]);
      if (liczba !== 3) {
        // Rysunek trzech uzwojeń przy rekordzie z inną liczbą — wyrocznia czerwona.
        expect(aparatyBezOdpowiednika(model, buildSceneV3(fxZ11Model, 2)).some((n) => n.includes('qetVoltageTransformer3'))).toBe(true);
      }
    }
  });
});
