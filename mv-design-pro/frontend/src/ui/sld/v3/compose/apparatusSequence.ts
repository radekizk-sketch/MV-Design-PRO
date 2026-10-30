/**
 * SLD V3 F9.3 — sekwencja aparatów pola (SLD_CAD_SPEC_V3 §12 „Kompozycja
 * celki pola wg fizycznej ścieżki mocy"). Jedno źródło prawdy dla:
 *  - `layout/measure.ts` (`bayColumnFootprint` — REZERWACJA miejsca), i
 *  - `compose/station.ts` (`buildBayStack`/`composeStation` — REALNY rysunek),
 * które MUSZĄ dawać identyczny gabaryt (test „spójność measure↔compose",
 * `compose/__tests__/station.test.ts`) — patrz nagłówek `compose/station.ts`.
 *
 * Dwie ścieżki (karta GEOMETRIA-STACJI §0 pkt 4, dyrektywa właściciela 2026-10-21 —
 * rozstrzyga konflikt z dawną regułą SLD_CAD_SPEC_V3 §12.1/§12.4 „konwencja jako fallback",
 * wpis `docs/v12xx/REJESTR_KONFLIKTOW.md` GEOMETRIA-STACJI-BRAK-WYPOSAZENIA):
 *  1. ścieżka DANYCH (§12.1): `bay.primaryDevices` niepuste (i mapowalne na co najmniej
 *     jeden symbol pola) — stos z DANYCH, uporządkowanych przez adapter wg `placement`
 *     (`v2/canvas/enmToSldAdapter.ts` `projectBayPrimaryDevices` — UPSTREAM przy szynie →
 *     DOWNSTREAM przy głowicy). Rekordem aparatu jest `Bay.primary_devices`, a gdy pole go
 *     nie niesie — gałąź łączeniowa modelu wskazana w `Bay.equipment_refs` (aparat główny
 *     pola, który operacja budowy stacji tworzy zawsze z pozycji katalogu).
 *  2. BRAK DANYCH: pole bez żadnego rekordu aparatu rysuje JEDNĄ sylwetkę
 *     `bayNoEquipment` („brak danych wyposażenia pola", bez stanu) i za nią wyłącznie
 *     element MODELU, którego pole jest nośnikiem (transformator pola TR, źródło pola OZE)
 *     — `elementyModeluPola`. Dawny stos konwencji (DS→CB→CT→DS→ES→głowica i jego warianty
 *     per rola) SKASOWANY: rysował aparaty, których model nie ma, i barwił je stanem
 *     zagregowanym z innych gałęzi.
 * Pole rezerwowe/wolne (`MiniBlockBayDescriptor.reserve`) rysuje WSZYSTKIE aparaty swoich
 * rekordów (także głowicę kablową i przekładnik Ferrantiego — zero fabrykacji w obie strony:
 * aparat z modelu nie znika z rysunku) i kończy się symbolem `bayReserve` (EN 60617 03-01-14
 * „koniec kabla niepodłączony", bez portu S — kabla odpływowego nie ma w modelu), §0 pkt 5.
 *
 * DECYZJA (mapowanie `LOAD_SWITCH`): biblioteka symboli v3 (`symbols/defs.ts`)
 * nie ma dziś dedykowanego glifu „rozłącznik" (odróżnialnego od odłącznika)
 * — mapujemy na `disconnector` (najbliższy istniejący, wizualnie zbliżony
 * łącznik beznapięciowy) jako udokumentowaną aproksymację, NIE zgadywanie
 * fizyki (kind→symbol jest jawny, 1:1, z komentarzem). Nowy dedykowany glif
 * to kandydat na osobną fazę (wymaga koordynacji `symbols/*`, poza zakresem
 * F9.3 — patrz raport).
 *
 * DECYZJA (`GENERATOR_*`/`PCS`/`BATTERY` w `primary_devices`): to nie są
 * aparaty POLA (są źródłem/DER, renderowanym osobno, `derPv`/`derBess`/
 * `derWind`/`derUnknown` przez `glifZrodlaRoliPola` dla pól OZE bez rekordów) — mapują się na
 * `null` i są odfiltrowane ze stosu aparatów (mirror `BAY_PRIMARY_DEVICE_TO_
 * APPARATUS` w `v2/domain/apparatusContracts.ts`, ten sam podział).
 */

import { APPARATUS_STACK_VERTICAL_GAP, APPARATUS_STACK_LATERAL_TAP } from '../layout/apparatusStack';
import { SYMBOL_DEFS, rodzajSymbolu, type SymbolId } from '../symbols/defs';
import { labelLineHeight, measureLabelWidth } from '../core/text';
import { FIELD_ROLE, orderByPrimaryPlacement, type FieldRole } from '../../v2/domain/apparatusContracts';
import type { MiniBlockBayDescriptor, PortAparatuPolaView } from '../../v2/model/widokPolStacji';
import type { BayPrimaryDeviceKind, BayPrimaryPlacement } from '../../../../types/enm';
import { PORTY_APARATU_POLA, PORT_WEJSCIA, PORT_WYJSCIA, WEZEL_SZYNY, WEZLY_KONCA_TORU, czyRodzajWTorze } from './rodzajeAparatuPola';
import { GRID, snapToGrid, snapUp } from '../core/grid';

/** Znacznik pochodzenia stosu aparatów (audytor DOM `data-apparatus-source`) — `'dane'`
 *  gdy stos zbudowany z rekordów aparatów modelu, `'brak'` gdy model ich nie niesie
 *  (sylwetka `bayNoEquipment`, karta GEOMETRIA-STACJI §0 pkt 4c). */
export type BayApparatusSource = 'dane' | 'brak';

/** Glif źródła pola OZE wg roli pola — rodzaj źródła jest daną modelu (rola pola
 *  wyprowadzona przez adapter z przyłączonych wytwórców), nie aparatem. `null` dla ról
 *  nie-źródłowych. JEDNA tabela dla stacji i GPZ (`compose/gpz.ts glifZrodlaPolaGpz`). */
export function glifZrodlaRoliPola(role: FieldRole): SymbolId | null {
  if (role === FIELD_ROLE.DER_PV) return 'derPv';
  if (role === FIELD_ROLE.DER_BESS) return 'derBess';
  // GPZ-PARYTET cz. 2 (pkt 3): farma wiatrowa glifem turbiny, źródło nierozstrzygnięte
  // glifem źródła nieokreślonego (nie PV, nie generator).
  if (role === FIELD_ROLE.DER_FW) return 'derWind';
  if (role === FIELD_ROLE.DER_UNKNOWN) return 'derUnknown';
  return null;
}

function czyRolaTransformatorowa(role: FieldRole): boolean {
  return role === FIELD_ROLE.TRANSFORMER || role === FIELD_ROLE.RMU_TRANSFORMER;
}

/** Pole, którego elementy modelu rozstrzyga `elementyModeluPola`: rola (z rekordu pola
 *  i przyłączonych wytwórców, adapter) i transformator wskazany przez pole (rekord). */
export type PoleElementowModelu = Pick<MiniBlockBayDescriptor, 'fieldRole' | 'transformerRef' | 'bateria'>;

/**
 * Elementy MODELU, których pole jest nośnikiem — NIE aparaty pola: transformator pola TR,
 * źródło pola OZE i bateria kondensatorów na końcu toru pola. Transformator WYŁĄCZNIE z rekordu `Transformer` wskazanego przez pole
 * (`transformerRef`, adapter) — rola TR bez rekordu transformatora nie rysuje transformatora
 * (byłby fabrykacją elementu, którego solver nie liczy). Glif źródła OZE z roli pola, którą
 * adapter wyprowadza z przyłączonych wytwórców (dana modelu). Dokładane za stosem aparatów,
 * gdy dane aparatów ich nie zawierają (rekord `TRANSFORMER_DEVICE` już niesie transformator;
 * wytwórca w `primary_devices` nie ma symbolu pola).
 */
export function elementyModeluPola(bay: PoleElementowModelu, symbolIds: readonly SymbolId[]): readonly SymbolId[] {
  // UX-04/POLE-BKR-MODEL: bateria kondensatorów na zacisku końca toru pola (`bay.bateria`,
  // relacja `ShuntCapacitor.bus_ref === Bay.terminal_bus_ref`) zamyka stos pola — dana
  // modelu, nie rola: pole BKR bez baterii nie rysuje baterii.
  const bateria: readonly SymbolId[] = bay.bateria ? ['capacitorBank'] : [];
  return [...elementyModeluPolaBezBaterii(bay, symbolIds), ...bateria];
}

function elementyModeluPolaBezBaterii(bay: PoleElementowModelu, symbolIds: readonly SymbolId[]): readonly SymbolId[] {
  if (czyRolaTransformatorowa(bay.fieldRole)) {
    return bay.transformerRef && !symbolIds.includes('transformer2W') ? ['transformer2W'] : [];
  }
  // Glif źródła WYŁĄCZNIE przy polu bez rekordów aparatów: pole OZE z rekordami prowadzi
  // tor do źródła z modelu (kabel → TR blokowy → źródło, `buildScene` tor DER-SN), który
  // rysuje symbol źródła sam — drugi glif w polu byłby drugim, niepołączonym źródłem.
  if (symbolIds.length > 0) return [];
  const glif = glifZrodlaRoliPola(bay.fieldRole);
  return glif ? [glif] : [];
}

/** Sylwetka pola bez rekordów aparatów: `bayNoEquipment` + elementy modelu pola. */
export function symbolePolaBezDanych(bay: PoleElementowModelu): readonly SymbolId[] {
  return ['bayNoEquipment', ...elementyModeluPola(bay, [])];
}

/** Gabaryt stosu symboli: szerokość = najszerszy symbol, wysokość = suma
 *  wysokości + GRID między kolejnymi (spec §3/§12, wzór F6b-1 — jedna prawda
 *  dla `layout/measure.ts` i `compose/station.ts`/`compose/gpz.ts`). */
export function stackFootprint(ids: readonly SymbolId[]): { readonly width: number; readonly height: number } {
  const width = Math.max(...ids.map((id) => SYMBOL_DEFS[id].width));
  const height = ids.reduce(
    // W1b (uwaga 12): odstęp aparat–aparat z rastru kontraktowego, nie literał.
    (sum, id, index) => sum + SYMBOL_DEFS[id].height + (index > 0 ? APPARATUS_STACK_VERTICAL_GAP : 0),
    0,
  );
  return { width, height };
}

/** Wariant rysunku aparatu pola z symbolami EN 60617 kolekcji QElectroTech
 *  (`BayPrimaryDevice.render_variant` szablonów pola liniowego GPZ wg ENEA Zeszyt 1, Z.10 —
 *  `backend/src/network_model/catalog/bay_templates.py`). Karta UX-04/POLE-LINIOWE-WZORZEC. */
export const WARIANT_RYSUNKU_QET = 'qet_en60617';

/**
 * Symbole wariantu QET wg rodzaju aparatu — lustro pola `frontend_symbol_id_qet` słownika
 * `iec60617` (Reference Engine; parytet przypina `apparatusSequence.referenceParity.test.ts`).
 * Rodzaje bez wpisu (przekładnik napięciowy, ogranicznik przepięć, transformator pola) nie mają
 * elementu QET w repozytorium (`docs/sld/vendor/qet/import_manifest.json`) i w wariancie QET
 * rysują się symbolem kanonicznym — jawnie, nie domysłem.
 */
export const SYMBOL_QET_RODZAJU: Readonly<Partial<Record<BayPrimaryDeviceKind, SymbolId>>> = {
  CB: 'qetBreaker',
  LOAD_SWITCH: 'qetLoadBreakSwitch',
  DS: 'qetDisconnector',
  ES: 'qetEarthSwitch',
  FUSE: 'qetFuseSwitch',
  THREE_POSITION_SWITCH: 'qetThreePositionSwitch',
  CT: 'qetCurrentTransformer',
  VT: 'qetVoltageTransformer',
  CORE_BALANCE_CT: 'qetCoreBalanceCt',
  CABLE_HEAD: 'qetCableHead',
  VOLTAGE_INDICATOR: 'qetVoltageIndicator',
};

/**
 * Mapowanie `BayPrimaryDeviceKind` (ENM) → `SymbolId` (spec §12.1). `null`
 * dla kindów DER (nie są aparatem pola — patrz DECYZJA w nagłówku pliku).
 * `renderVariant` = `BayPrimaryDevice.render_variant` rekordu: wariant QET
 * (`WARIANT_RYSUNKU_QET`) wybiera symbol z `SYMBOL_QET_RODZAJU`; każdy inny (w tym brak)
 * — symbol kanoniczny. Łącznik trójpołożeniowy, przekładnik Ferrantiego i wskaźnik napięcia
 * mają WYŁĄCZNIE rysunek QET (biblioteka kanoniczna nie ma ich glifów w torze pola).
 */
export function symbolIdForPrimaryDeviceKind(
  kind: BayPrimaryDeviceKind,
  renderVariant?: string | null,
  cechy: CechyRysunkuAparatu = {},
): SymbolId | null {
  if (renderVariant === WARIANT_RYSUNKU_QET) {
    if (kind === 'VT') return symbolQetPrzekladnikaNapieciowego(cechy.liczbaUzwojenWtornych);
    // Karta UX-04/POLE-LINIOWE-WZORZEC (korekta P0 pkt 7): napęd silnikowy wyłącznika z modelu
    // — rysunek wyłącznika ze znakiem napędu EN 60617 02-13-26 w kaflu (ENEA Z.11.1).
    if (kind === 'CB' && cechy.naped === 'SILNIKOWY') return 'qetBreakerZNapedem';
    const qet = SYMBOL_QET_RODZAJU[kind];
    if (qet) return qet;
  }
  return symbolKanonicznyRodzaju(kind);
}

/** Cechy rekordu aparatu wybierające rysunek QET: liczba uzwojeń wtórnych przekładnika
 *  napięciowego (liczba okręgów) i napęd wyłącznika (znak napędu silnikowego). Rysunek
 *  kanoniczny ich nie rozróżnia (znak ogólny aparatu). */
export interface CechyRysunkuAparatu {
  readonly liczbaUzwojenWtornych?: number;
  readonly naped?: 'SILNIKOWY';
}

/** WSZYSTKIE rysunki, którymi może się narysować aparat danego rodzaju — oba warianty
 *  rysunku × wszystkie cechy rekordu wybierające rysunek (`CechyRysunkuAparatu`). Zbiory
 *  symboli rodzajów (łączniki, sondy sceny) wyprowadza się Z TEJ funkcji, więc nowy wariant
 *  rysunku nie wypada z sond (predykaty parami: wybór rysunku i zbiór rysunków z jednego
 *  obchodu `symbolIdForPrimaryDeviceKind`). */
export function symboleRodzajuAparatu(kind: BayPrimaryDeviceKind): readonly SymbolId[] {
  const wynik: SymbolId[] = [];
  const cechyRysunku: readonly CechyRysunkuAparatu[] = [
    {},
    { naped: 'SILNIKOWY' },
    ...[1, 2, 3].map((liczbaUzwojenWtornych) => ({ liczbaUzwojenWtornych })),
  ];
  for (const wariant of [null, WARIANT_RYSUNKU_QET]) {
    for (const cechy of cechyRysunku) {
      const symbol = symbolIdForPrimaryDeviceKind(kind, wariant, cechy);
      if (symbol && !wynik.includes(symbol)) wynik.push(symbol);
    }
  }
  return wynik;
}

/**
 * Karta UX-04/POLE-LINIOWE-WZORZEC (korekta P0 pkt 3): rysunek QET przekładnika napięciowego
 * z LICZBĄ OKRĘGÓW z modelu (`BayPrimaryDevice.uzwojenia`; EN 60617 06-13-01 forma 1 — okrąg
 * uzwojenia pierwotnego + jeden okrąg na każde uzwojenie wtórne): 2 uzwojenia → trzy okręgi,
 * 3 uzwojenia → cztery okręgi w romb (ENEA Zeszyt 1, Z.11.1). Tabliczka niepodana, jedno
 * uzwojenie i więcej niż trzy (rysunek źródła nie ma takiej formy) → znak ogólny przekładnika
 * (dwa okręgi); liczbę i przekładnię uzwojeń niesie wtedy podpis aparatu.
 */
export function symbolQetPrzekladnikaNapieciowego(liczbaUzwojenWtornych: number | undefined): SymbolId {
  if (liczbaUzwojenWtornych === 2) return 'qetVoltageTransformer2';
  if (liczbaUzwojenWtornych === 3) return 'qetVoltageTransformer3';
  return 'qetVoltageTransformer';
}

function symbolKanonicznyRodzaju(kind: BayPrimaryDeviceKind): SymbolId | null {
  switch (kind) {
    case 'CB':
      return 'breaker';
    case 'LOAD_SWITCH':
      // Recenzja NO-GO 2026-07-17 pkt 5: dedykowany glif rozłącznika
      // (spec §12.5) — dawna aproksymacja `→disconnector` skasowana.
      return 'loadBreakSwitch';
    case 'DS':
      return 'disconnector';
    case 'ES':
      return 'earthSwitch';
    case 'CT':
      return 'currentTransformer';
    case 'UNBALANCE_CT':
      // UX-04/POLE-BKR-MODEL: przekładnik niezrównoważenia OBEJMUJE połączenie między
      // punktami gwiazd baterii (Zeszyt 1 Zał. 16), nie leży w torze pola — rysuje go glif
      // baterii (`capacitorBank`, okrąg na połączeniu międzygwiazdowym, gdy pole niesie
      // rekord; `v2/model/bateriaPola.ts`). Symbol w osi toru pola byłby fałszywą topologią.
      return null;
    case 'VT':
      return 'voltageTransformer';
    case 'PHASE_TO_PHASE_VT':
      // Przekładnik napięciowy międzyfazowy (rozładowanie baterii, U>) — symbol przekładnika
      // napięciowego; para faz jest daną pola, nie kształtem symbolu.
      return 'voltageTransformer';
    case 'CABLE_HEAD':
      return 'cableHead';
    case 'TRANSFORMER_DEVICE':
      return 'transformer2W';
    case 'FUSE':
      return 'fuseSwitch';
    case 'SURGE_ARRESTER':
      // F9.6 (§12.5, V12K-028): SA WYŁĄCZNIE ze ścieżki danych — mapowanie
      // istnieje tylko tutaj, nigdy z domysłu (brak danych = sylwetka `bayNoEquipment`).
      return 'surgeArrester';
    case 'THREE_POSITION_SWITCH':
      return 'qetThreePositionSwitch';
    case 'CORE_BALANCE_CT':
      return 'qetCoreBalanceCt';
    case 'VOLTAGE_INDICATOR':
      return 'qetVoltageIndicator';
    case 'GENERATOR_PV':
    case 'GENERATOR_BESS':
    case 'GENERATOR_FW':
    case 'PCS':
    case 'BATTERY':
      // DER — nie jest aparatem POLA (renderowane osobno). Patrz nagłówek.
      return null;
    default:
      return null;
  }
}

/** Aparat pola z danymi potrzebnymi do wyboru symbolu i ułożenia toru z portów. */
export interface AparatSekwencjiPola {
  readonly kind: BayPrimaryDeviceKind;
  readonly placement: BayPrimaryPlacement;
  readonly deviceRef?: string;
  readonly renderVariant?: string | null;
  readonly ports?: readonly PortAparatuPolaView[];
  /** Liczba uzwojeń wtórnych przekładnika napięciowego z rekordu (wybór rysunku QET). */
  readonly liczbaUzwojenWtornych?: number;
  /** Napęd wyłącznika z rekordu (wybór rysunku QET ze znakiem napędu). */
  readonly naped?: 'SILNIKOWY';
}

/** Symbol aparatu pola z jego rekordu (rodzaj + wariant rysunku + cechy rysunku: liczba
 *  uzwojeń wtórnych przekładnika napięciowego, napęd wyłącznika) — JEDNO wywołanie dla measure, stacji, GPZ i sond sceny. */
export function symbolAparatuPola(
  device: Pick<AparatSekwencjiPola, 'kind' | 'renderVariant' | 'liczbaUzwojenWtornych' | 'naped'>,
): SymbolId | null {
  return symbolIdForPrimaryDeviceKind(device.kind, device.renderVariant, {
    liczbaUzwojenWtornych: device.liczbaUzwojenWtornych,
    naped: device.naped,
  });
}

/** Brak przyłączenia w polu SN rysunku (stacja i GPZ — `StationComposition.brakiPrzylaczy`,
 *  `GpzComposition.brakiPrzylaczy`). */
export interface BrakPrzylaczaPolaSn {
  readonly bayRef: string;
  /** `null` = brak dotyczy całego pola (żaden aparat nie niesie portów). */
  readonly deviceRef: string | null;
  readonly przyczyna: string;
}

/** Brak przyłączenia aparatu pola na schemacie: aparat i przyczyna (pełne zdanie). */
export interface BrakPrzylaczaAparatu {
  readonly deviceRef: string;
  readonly przyczyna: string;
}

/** Węzły pola, którymi aparat wchodzi do toru (`wejscie`) i z niego wychodzi (`wyjscie`):
 *  aparat toru (`czyRodzajWTorze`) — `we`/`wy`; aparat poza torem (odgałęzienie `przylacze`,
 *  przekładnik Ferrantiego i niezrównoważenia `obwod`, przekładnik międzyfazowy `A`/`B`) — oba
 *  końce na węźle jego pierwszego portu (bez przerwy toru; zaciski A i B przekładnika
 *  międzyfazowego to dwie fazy tego samego węzła). `null` = port niepodany albo bez węzła. */
export function wezlyAparatuWTorze(device: Pick<AparatSekwencjiPola, 'kind' | 'ports'>): {
  readonly wejscie: string | null;
  readonly wyjscie: string | null;
} {
  const komplet = PORTY_APARATU_POLA[device.kind] ?? [];
  const wezel = (portId: string): string | null => device.ports?.find((p) => p.portId === portId)?.wezel ?? null;
  if (czyRodzajWTorze(device.kind)) return { wejscie: wezel(PORT_WEJSCIA), wyjscie: wezel(PORT_WYJSCIA) };
  if (komplet.length >= 1) {
    const jedyny = wezel(komplet[0]);
    return { wejscie: jedyny, wyjscie: jedyny };
  }
  return { wejscie: null, wyjscie: null };
}

/** Pole niesie porty aparatów (kontrakt portów ENM) — co najmniej jeden aparat ma port. */
export function czyPoleNiesiePorty(devices: readonly Pick<AparatSekwencjiPola, 'ports'>[] | undefined): boolean {
  return (devices ?? []).some((d) => (d.ports?.length ?? 0) > 0);
}

/** Odgałęzienie toru pola z portów: węzeł toru głównego, z którego wychodzi, i jego aparaty
 *  w kolejności obchodu (dwuportowe w kolejności węzłów, jednoportowe przy swoich węzłach). */
export interface OdgalezienieToruPola<T> {
  readonly wezel: string;
  readonly aparaty: readonly T[];
}

/**
 * Karta UX-04/POLE-LINIOWE-WZORZEC — TOR POLA Z PORTÓW: kolejność aparatów wyprowadzona
 * z węzłów portów ENM (`BayPrimaryDevice.ports`), nie z umiejscowienia. Obchód od węzła szyny
 * (`WEZEL_SZYNY`): na bieżącym węźle najpierw aparaty jednoportowe (w kolejności wejścia),
 * potem aparat dwuportowy o `we` = węzeł, a jego `wy` staje się bieżącym węzłem.
 *
 * ROZGAŁĘZIENIE (rozszerzenie 4 karty: odgałęzienie przekładnika napięciowego strony liniowej,
 * ENEA Zeszyt 1 Z.11.1/Z.11). Gdy z węzła wychodzi więcej niż jeden aparat dwuportowy, tor
 * GŁÓWNY to JEDYNA droga aparatów dwuportowych od szyny do węzła końca toru
 * (`WEZLY_KONCA_TORU`) — ta sama reguła co `rodzaje_aparatury.aparaty_poza_torem_glownym`
 * w backendzie (parytet przypina test). Pozostałe aparaty wychodzące z węzłów toru głównego
 * zaczynają ODGAŁĘZIENIA (`galezie`): obchód odgałęzienia idzie tą samą regułą, a drugie
 * wyjście z węzła odgałęzienia jest brakiem. Gdy do końca toru nie prowadzi żadna albo prowadzi
 * więcej niż jedna droga, toru głównego nie da się wskazać bez domysłu: pierwszy aparat
 * (kolejność wejścia) prowadzi tor, kolejne trafiają do `braki`.
 *
 * Aparat bez kompletu portów rodzaju albo z portem bez węzła, cykl i aparat nieosiągalny od
 * szyny trafiają do `braki` z przyczyną. Kolejność: tor główny, odgałęzienia (kolejność
 * węzłów kotwic), aparaty z brakami (kolejność wejścia) — symbol zostaje na rysunku, przewód
 * do niego nie powstaje. Wejście = aparaty z symbolem pola w porządku `placement`
 * (`orderedSymbolPrimaryDevices`). Funkcja czysta, deterministyczna.
 */
export function torPolaZPortow<T extends AparatSekwencjiPola>(
  devices: readonly T[],
): {
  readonly kolejnosc: readonly T[];
  readonly braki: readonly BrakPrzylaczaAparatu[];
  readonly galezie: readonly OdgalezienieToruPola<T>[];
} {
  const braki: BrakPrzylaczaAparatu[] = [];
  const refAparatu = (device: T, index: number): string => device.deviceRef ?? `#${index}`;
  const poprawne: number[] = [];
  devices.forEach((device, index) => {
    const komplet = PORTY_APARATU_POLA[device.kind] ?? [];
    const wady: string[] = [];
    for (const portId of komplet) {
      const port = device.ports?.find((p) => p.portId === portId);
      if (!port) wady.push(`brak portu „${portId}"`);
      else if (port.wezel == null) wady.push(`port „${portId}" bez węzła pola`);
    }
    if (wady.length > 0) braki.push({ deviceRef: refAparatu(device, index), przyczyna: wady.join(', ') });
    else poprawne.push(index);
  });
  const dwuportowy = (index: number): boolean => czyRodzajWTorze(devices[index].kind);
  const wejscie = (index: number): string | null => wezlyAparatuWTorze(devices[index]).wejscie;
  const wyjscie = (index: number): string => wezlyAparatuWTorze(devices[index]).wyjscie!;
  const wyjsciaWezla = new Map<string, number[]>();
  for (const index of poprawne) {
    if (!dwuportowy(index)) continue;
    const lista = wyjsciaWezla.get(wejscie(index)!) ?? [];
    lista.push(index);
    wyjsciaWezla.set(wejscie(index)!, lista);
  }
  // Tor główny przy rozgałęzieniu: jedyna droga od szyny do węzła końca toru (parytet backendu).
  // Aparaty za węzłem końca toru (pole pomiaru napięcia Z.17: złącze i przekładnik za łącznikiem
  // trójpołożeniowym) zaczynają odgałęzienie od tego węzła także bez rozwidlenia — obchód toru
  // głównego kończy się na węźle końca (`WEZLY_KONCA_TORU`, ta sama reguła co backend).
  let torGlowny: ReadonlySet<number> | null = null;
  let liczbaDrog = 0;
  if ([...wyjsciaWezla.values()].some((lista) => lista.length > 1)) {
    const drogi: number[][] = [];
    const szukaj = (wezel: string, droga: number[], odwiedzone: ReadonlySet<string>): void => {
      if (WEZLY_KONCA_TORU.has(wezel)) {
        drogi.push(droga);
        return;
      }
      for (const index of wyjsciaWezla.get(wezel) ?? []) {
        const wy = wyjscie(index);
        if (!odwiedzone.has(wy)) szukaj(wy, [...droga, index], new Set([...odwiedzone, wy]));
      }
    };
    szukaj(WEZEL_SZYNY, [], new Set([WEZEL_SZYNY]));
    liczbaDrog = drogi.length;
    if (drogi.length === 1) torGlowny = new Set(drogi[0]);
  }
  const pozostale = new Set(poprawne);
  const odwiedzone = new Set<string>([WEZEL_SZYNY]);
  const poczatkiGalezi: { readonly wezel: string; readonly index: number }[] = [];

  /** Obchód jednego toru od węzła `start`; `wybierz` rozstrzyga wyjście przy rozgałęzieniu. */
  const obchod = (start: string, pierwszy: number | null, wTorzeGlownym: boolean): number[] => {
    const tor: number[] = [];
    let wezel = start;
    let wymuszony = pierwszy;
    for (;;) {
      for (const index of poprawne) {
        if (pozostale.has(index) && !dwuportowy(index) && wejscie(index) === wezel) {
          tor.push(index);
          pozostale.delete(index);
        }
      }
      const nastepne =
        wymuszony != null
          ? [wymuszony]
          : (wyjsciaWezla.get(wezel) ?? []).filter((index) => pozostale.has(index));
      wymuszony = null;
      if (nastepne.length === 0) break;
      if (wTorzeGlownym && WEZLY_KONCA_TORU.has(wezel)) {
        for (const index of nastepne) poczatkiGalezi.push({ wezel, index });
        break;
      }
      let biezacy: number;
      if (nastepne.length === 1) {
        [biezacy] = nastepne;
      } else if (wTorzeGlownym && torGlowny) {
        biezacy = nastepne.find((index) => torGlowny!.has(index)) ?? nastepne[0];
        for (const index of nastepne) if (index !== biezacy) poczatkiGalezi.push({ wezel, index });
      } else {
        [biezacy] = nastepne;
        const powod = wTorzeGlownym
          ? `do węzła końca toru prowadzi ${liczbaDrog === 0 ? 'żadna droga' : `${liczbaDrog} dróg`} — tor główny niejednoznaczny`
          : 'drugie wyjście z węzła odgałęzienia';
        for (const index of nastepne.slice(1)) {
          braki.push({
            deviceRef: refAparatu(devices[index], index),
            przyczyna: `drugi aparat wychodzący z węzła „${wezel}" (${powod})`,
          });
          pozostale.delete(index);
        }
      }
      tor.push(biezacy);
      pozostale.delete(biezacy);
      const wy = wyjscie(biezacy);
      if (odwiedzone.has(wy)) {
        braki.push({
          deviceRef: refAparatu(devices[biezacy], biezacy),
          przyczyna: `port „wy" wraca do węzła „${wy}" (cykl toru)`,
        });
        break;
      }
      odwiedzone.add(wy);
      wezel = wy;
    }
    return tor;
  };

  const tor = obchod(WEZEL_SZYNY, null, true);
  const galezie: { readonly wezel: string; readonly aparaty: number[] }[] = [];
  for (const { wezel, index } of poczatkiGalezi) {
    if (!pozostale.has(index)) continue;
    galezie.push({ wezel, aparaty: obchod(wezel, index, false) });
  }
  for (const index of pozostale) {
    braki.push({
      deviceRef: refAparatu(devices[index], index),
      przyczyna: `aparat nieosiągalny torem od szyny (węzeł wejścia „${wejscie(index)}")`,
    });
  }
  const ulozone = [...tor, ...galezie.flatMap((g) => g.aparaty)];
  const wTorze = new Set(ulozone);
  const kolejnosc = [...ulozone, ...devices.map((_, index) => index).filter((index) => !wTorze.has(index))].map(
    (index) => devices[index],
  );
  return {
    kolejnosc,
    braki,
    galezie: galezie.map((g) => ({ wezel: g.wezel, aparaty: g.aparaty.map((index) => devices[index]) })),
  };
}

/** Odgałęzienie w SEKWENCJI aparatów pola: pozycja aparatu toru głównego, za którym odchodzi
 *  (jego port `wy` = węzeł odgałęzienia; `-1` = od węzła szyny), i pozycje aparatów
 *  odgałęzienia w kolejności obchodu. */
export interface GalazSekwencji {
  readonly zaPozycja: number;
  readonly pozycje: readonly number[];
}

/**
 * Odgałęzienia toru w sekwencji pola — pozycje w `sekwencja` (wpis `undefined` = element bez
 * rekordu aparatu: element modelu pola, zakończenie rezerwy). Ten sam obchód co
 * `orderedSymbolPrimaryDevices`; `zrodlo` — aparaty, z których obchód wyprowadził odgałęzienia,
 * gdy sekwencja jest ich podzbiorem (pole rezerwowe bez głowicy toru głównego — obchód liczony
 * na pełnym polu, bo bez głowicy tor nie dochodzi do węzła końca toru).
 */
export function galezieSekwencji<T extends AparatSekwencjiPola>(
  sekwencja: readonly (T | undefined)[],
  zrodlo?: readonly T[],
): readonly GalazSekwencji[] {
  const aparaty = (zrodlo ?? sekwencja).filter((d): d is T => d != null);
  if (!czyPoleNiesiePorty(aparaty)) return [];
  const { galezie } = torPolaZPortow(aparaty);
  const wynik: GalazSekwencji[] = [];
  for (const galaz of galezie) {
    const pozycje = galaz.aparaty.map((d) => sekwencja.indexOf(d)).filter((i) => i >= 0);
    if (pozycje.length === 0) continue;
    const zaPozycja =
      galaz.wezel === WEZEL_SZYNY
        ? -1
        : sekwencja.findIndex(
            (d) => d != null && !galaz.aparaty.includes(d) && dwuportowyRodzaj(d) && wezlyAparatuWTorze(d).wyjscie === galaz.wezel,
          );
    wynik.push({ zaPozycja, pozycje });
  }
  return wynik;
}

function dwuportowyRodzaj(device: Pick<AparatSekwencjiPola, 'kind'>): boolean {
  return czyRodzajWTorze(device.kind);
}

/**
 * Rekordy aparatów pola w kolejności rysunku z odgałęzieniami — JEDNO źródło dla stosu stacji
 * (`compose/station.ts`), pola GPZ (`compose/gpz.ts`) i rezerwacji (`layout/measure.ts`).
 * Każdy rekord aparatu z symbolem pola jest rysowany — także w polu rezerwowym/wolnym
 * (karta UX-04/POLE-LINIOWE-WZORZEC, korekta P0 pkt 1: dawne odcięcie głowicy kablowej
 * i przekładnika Ferrantiego pola wolnego usuwało z rysunku aparaty, które model niesie).
 * Rekordy i odgałęzienia z jednego obchodu (predykaty parami).
 */
export function rekordyToruPola<T extends AparatSekwencjiPola>(
  devices: readonly T[] | undefined,
): { readonly rekordy: readonly T[]; readonly galezie: readonly GalazSekwencji[] } {
  const rekordy = orderedSymbolPrimaryDevices(devices);
  return { rekordy, galezie: galezieSekwencji(rekordy) };
}

/**
 * Aparaty pola ze ścieżki DANYCH, które dostają symbol pola — bez kindów niemapowalnych
 * (DER), w porządku fizycznym: z PORTÓW (`torPolaZPortow`), gdy pole niesie porty aparatów
 * (karta UX-04/POLE-LINIOWE-WZORZEC), inaczej wg `placement` (`orderByPrimaryPlacement`,
 * `v2/domain/apparatusContracts.ts`). JEDNA sekwencja dla `resolveBayApparatusSymbolIds`
 * (measure + plan), `compose/station.ts` `stackItemsForBay` i `compose/gpz.ts`
 * (rysunek + `deviceRef`), więc parowanie indeksów symbol↔aparat nie zależy od tego, czy
 * producent deskryptora posortował listę (W2C-PLAN-ETYKIET: skrypt dowodowy W2c podawał
 * kolejność surową backendu i kompozycja rozkładała laterale na różne kotwice we wspólnej
 * kolumnie — „TV1" lądował na symbolu uziemnika).
 */
export function orderedSymbolPrimaryDevices<T extends AparatSekwencjiPola>(
  devices: readonly T[] | undefined,
): readonly T[] {
  if (!devices || devices.length === 0) return [];
  const zSymbolem = orderByPrimaryPlacement(devices).filter((d) => symbolAparatuPola(d) != null);
  return czyPoleNiesiePorty(zSymbolem) ? torPolaZPortow(zSymbolem).kolejnosc : zSymbolem;
}

/** Braki przyłączeń aparatów pola (puste, gdy pole nie niesie portów — wtedy kolejność
 *  wg `placement`, a brak całego kontraktu portów zgłasza wołający). Ten sam obchód co
 *  `orderedSymbolPrimaryDevices` (predykaty parami: kolejność i braki z jednego obchodu). */
export function brakiPrzylaczyPola(devices: readonly AparatSekwencjiPola[] | undefined): readonly BrakPrzylaczaAparatu[] {
  if (!devices || devices.length === 0) return [];
  const zSymbolem = orderByPrimaryPlacement(devices).filter((d) => symbolAparatuPola(d) != null);
  return czyPoleNiesiePorty(zSymbolem) ? torPolaZPortow(zSymbolem).braki : [];
}

/** Pozycja toru głównego stosu pola dla przewodów z portów: narysowany symbol i rekord
 *  aparatu (brak rekordu = element bez portów ENM: zakończenie rezerwy, transformator
 *  pola z modelu, sylwetka braku wyposażenia). */
export interface PozycjaToruPola {
  readonly symbolId: SymbolId;
  readonly x: number;
  readonly y: number;
  readonly device?: Pick<AparatSekwencjiPola, 'kind' | 'ports'>;
}

/** Przewód port → port: z portu S symbolu `a` do portu N symbolu `b`; przy różnych osiach
 *  (port szynowy łącznika trójpołożeniowego leży obok osi) — odcinek poziomy na wysokości
 *  portu S, potem pion do portu N. `null` = któryś symbol nie ma portu w tym kierunku. */
export function przewodPortPort(
  a: Pick<PozycjaToruPola, 'symbolId' | 'x' | 'y'>,
  b: Pick<PozycjaToruPola, 'symbolId' | 'x' | 'y'>,
): readonly { readonly x: number; readonly y: number }[] | null {
  const south = SYMBOL_DEFS[a.symbolId].ports.find((port) => port.dir === 'S');
  const north = SYMBOL_DEFS[b.symbolId].ports.find((port) => port.dir === 'N');
  if (!south || !north) return null;
  const od = { x: a.x + south.x, y: a.y + south.y };
  const do_ = { x: b.x + north.x, y: b.y + north.y };
  return od.x === do_.x ? [od, do_] : [od, { x: do_.x, y: od.y }, do_];
}

/**
 * Karta UX-04/POLE-LINIOWE-WZORZEC (§0 pkt 5) — PRZEWODY TORU GŁÓWNEGO Z PORTÓW ENM: przewód
 * między kolejnymi pozycjami toru powstaje WYŁĄCZNIE, gdy port wyjścia aparatu i port wejścia
 * następnego leżą na tym samym węźle pola (zero przewodu z domysłu). Zakończenie rezerwy pola
 * wolnego (bez rekordu ENM — kabla nie ma) stoi na węźle wyjścia ostatniego aparatu: przewód
 * tylko, gdy ten węzeł istnieje w portach. JEDNA reguła pola stacji (`compose/station.ts`)
 * i pola GPZ (`compose/gpz.ts`).
 */
export function przewodyToruZPortow(
  tor: readonly PozycjaToruPola[],
): readonly (readonly { readonly x: number; readonly y: number }[])[] {
  const przewody: (readonly { readonly x: number; readonly y: number }[])[] = [];
  for (let i = 0; i + 1 < tor.length; i++) {
    const a = tor[i];
    const b = tor[i + 1];
    if (!a.device) continue;
    let polaczone: boolean;
    if (!b.device) {
      polaczone = b.symbolId === 'bayReserve' && wezlyAparatuWTorze(a.device).wyjscie != null;
    } else {
      const wspolny = wezlyAparatuWTorze(a.device).wyjscie;
      polaczone = wspolny != null && wspolny === wezlyAparatuWTorze(b.device).wejscie;
    }
    if (!polaczone) continue;
    const points = przewodPortPort(a, b);
    if (points) przewody.push(points);
  }
  return przewody;
}

/** Odgałęzienie boczne (§18.1) z portów: jego węzeł przyłączenia = węzeł kotwicy — wyjście
 *  aparatu, za którym wisi; przed torem: wejście pierwszego aparatu, a gdy tor zaczyna się
 *  elementem modelu bez rekordu aparatu (transformator pola) — węzeł szyny, do którego
 *  schodzi zejście pola. Fałsz = odgałęzienie bez przewodu (symbol zostaje, brak zgłasza
 *  obchód portów). */
export function czyOdgalezienieNaWezleKotwicy(
  kotwica: Pick<AparatSekwencjiPola, 'kind' | 'ports'> | undefined,
  zaKotwica: boolean,
  boczny: Pick<AparatSekwencjiPola, 'kind' | 'ports'> | undefined,
): boolean {
  if (!boczny) return false;
  if (zaKotwica && !kotwica) return false;
  const wezelKotwicy = zaKotwica
    ? wezlyAparatuWTorze(kotwica!).wyjscie
    : kotwica
      ? wezlyAparatuWTorze(kotwica).wejscie
      : WEZEL_SZYNY;
  const wezelBoczny = wezlyAparatuWTorze(boczny).wejscie;
  return wezelBoczny != null && wezelBoczny === wezelKotwicy;
}

/** Tor z portów zaczyna się na węźle szyny (inaczej pole nie dostaje zejścia z szyny).
 *  Pierwsza pozycja toru bez rekordu aparatu (element modelu pola — transformator pola
 *  z `Bay.equipment_refs`) nie ma portów ENM: schodzi do niej zejście z szyny jak dotąd. */
export function czyTorOdSzyny(pierwszy: Pick<AparatSekwencjiPola, 'kind' | 'ports'> | undefined): boolean {
  return pierwszy == null || wezlyAparatuWTorze(pierwszy).wejscie === WEZEL_SZYNY;
}

/**
 * Rozstrzygnięcie „dane vs brak danych" — JEDNA prawda używana przez `layout/measure.ts`
 * (rezerwacja gabarytu) i `compose/station.ts` (rysunek + `data-apparatus-source`).
 * Ścieżka danych: aparaty mapowalne na symbol pola (po odfiltrowaniu kindów DER), w porządku
 * fizycznym `rekordyToruPola` (obchód portów z odgałęzieniami), + elementy modelu pola.
 * Brak danych: `symbolePolaBezDanych`. Pole rezerwowe/wolne: zakończone `bayReserve`.
 * `galezie` — odgałęzienia toru (pozycje w `symbolIds`).
 */
export function resolveBayApparatusSymbolIds(
  bay: Pick<MiniBlockBayDescriptor, 'fieldRole' | 'primaryDevices' | 'reserve' | 'transformerRef'>,
): {
  readonly symbolIds: readonly SymbolId[];
  readonly source: BayApparatusSource;
  readonly galezie: readonly GalazSekwencji[];
} {
  const pelne = orderedSymbolPrimaryDevices(bay.primaryDevices).map((d) => symbolAparatuPola(d)!);
  if (pelne.length > 0) {
    const { rekordy, galezie } = rekordyToruPola(bay.primaryDevices);
    return {
      symbolIds: [
        ...rekordy.map((d) => symbolAparatuPola(d)!),
        ...elementyModeluPola(bay, pelne),
        ...(bay.reserve ? (['bayReserve'] as const) : []),
      ],
      source: 'dane',
      galezie,
    };
  }
  return { symbolIds: zakonczenieRezerwy(symbolePolaBezDanych(bay), bay.reserve), source: 'brak', galezie: [] };
}

/** Pole rezerwowe/wolne: sekwencja kończy się `bayReserve` — kabla odpływowego nie ma
 *  w modelu (§0 pkt 5). Aparaty sekwencji zostają bez zmian (zero fabrykacji w obie strony). */
export function zakonczenieRezerwy(
  symbolIds: readonly SymbolId[],
  reserve: MiniBlockBayDescriptor['reserve'],
): readonly SymbolId[] {
  return reserve ? [...symbolIds, 'bayReserve'] : symbolIds;
}

/** Koniec toru kablowego pola (zakończenie, przy którym trasa kabla dochodzi do pola): głowica
 *  kablowa (kanoniczna i QET) oraz przekładnik Ferrantiego, który w polu wg ENEA Z.10 obejmuje
 *  kabel ZA głowicą (ostatni symbol toru). Rodzaj semantyczny (`rodzajSymbolu`) — jeden
 *  predykat dla podpisu zakończenia toru i wyroczni dojścia trasy (`scene/buildScene.ts`). */
export function czyZakonczenieToruKablowego(symbolId: SymbolId): boolean {
  const rodzaj = rodzajSymbolu(symbolId);
  return rodzaj === 'cableHead' || rodzaj === 'qetCoreBalanceCt';
}

// ---------------------------------------------------------------------------
// F10.1 (spec §18.1/§18.2, dyrektywa D2-5, V12K-033) — podział sekwencji na
// TOR GŁÓWNY i APARATY BOCZNE. ES/VT/SA nigdy nie leżą w osi toru
// szeregowego: uziemnik/przekładnik napięciowy/ogranicznik odgałęziają się
// bocznie od węzła toru (portu S poprzedzającego aparatu szeregowego — „po
// stronie kablowej"), a tor główny pozostaje ciągły bez nich. Kolejność
// `placement` (V12K-040) nadal rządzi: pozycja odgałęzienia wynika z miejsca
// aparatu w sekwencji danych/konwencji — zmienia się WYŁĄCZNIE geometria
// (bok zamiast osi), nie porządek.
// ---------------------------------------------------------------------------

/** Aparaty z definicji BOCZNE (spec §18.1: „ES, VT, SA są z definicji BOCZNE
 *  i nigdy nie leżą w torze szeregowym"). */
export const LATERAL_APPARATUS_SYMBOLS: ReadonlySet<SymbolId> = new Set<SymbolId>([
  'earthSwitch',
  'voltageTransformer',
  'surgeArrester',
]);

/** Aparat boczny (§18.1) — rodzaj semantyczny symbolu (`rodzajSymbolu`: uziemnik QET jest
 *  uziemnikiem). JEDEN predykat dla planu, stacji, GPZ i sond sceny. */
export function czyAparatBoczny(symbolId: SymbolId): boolean {
  return LATERAL_APPARATUS_SYMBOLS.has(rodzajSymbolu(symbolId));
}

export interface LateralApparatusPlanEntry {
  readonly symbolId: SymbolId;
  /** Kotwica odgałęzienia: gałąź odchodzi od portu S aparatu
   *  `mainPath[afterMainIndex]` (węzeł toru po stronie kablowej tego
   *  aparatu). `-1` = przed pierwszym aparatem szeregowym (odgałęzienie od
   *  strony szyny — port N `mainPath[0]`). */
  readonly afterMainIndex: number;
  /** Pozycja w ORYGINALNEJ sekwencji (`resolveBayApparatusSymbolIds`) —
   *  zachowuje parowanie `deviceRef`/`switchState` ze ścieżki danych. */
  readonly sequenceIndex: number;
}

/** Odgałęzienie toru w PLANIE pola (rozszerzenie 4 karty UX-04/POLE-LINIOWE-WZORZEC):
 *  kolumna aparatów odchodząca od kotwicy toru głównego na prawo od aparatów bocznych. */
export interface GalazPlanu {
  /** Kotwica: port S aparatu `mainPath[afterMainIndex]` (węzeł odgałęzienia); `-1` = węzeł
   *  szyny (port N `mainPath[0]`). */
  readonly afterMainIndex: number;
  /** Plan samego odgałęzienia (kolumna + jego aparaty boczne, ten sam predykat aparatu
   *  bocznego). Indeksy sekwencji (`mainSequenceIndices`, `laterals[].sequenceIndex`)
   *  wskazują pozycje w ORYGINALNEJ sekwencji pola. */
  readonly plan: Omit<BayApparatusPlan, 'source' | 'galezie' | 'rezerwaEtykietBocznych'>;
  /** Szerokość pasa podpisów na prawo od aparatów odgałęzienia (podpisy aparatów kolumny
   *  i jej aparatów bocznych stoją po prawej) — doliczana do pasa odgałęzienia. */
  readonly rezerwaEtykiet: number;
}

export interface BayApparatusPlan {
  /** Aparaty szeregowe toru głównego, w kolejności sekwencji. */
  readonly mainPath: readonly SymbolId[];
  /** `mainSequenceIndices[i]` = pozycja `mainPath[i]` w oryginalnej sekwencji. */
  readonly mainSequenceIndices: readonly number[];
  readonly laterals: readonly LateralApparatusPlanEntry[];
  /** Odgałęzienia toru z portów (puste, gdy pole ma jeden tor). */
  readonly galezie: readonly GalazPlanu[];
  /** Pas podpisów na PRAWO od aparatów bocznych toru głównego, gdy podpisy stoją po prawej
   *  (pole GPZ z symbolami QET) — liczony w kolizjach z odgałęzieniem; 0 = podpisy pod
   *  symbolem (stacja). */
  readonly rezerwaEtykietBocznych: number;
  readonly source: BayApparatusSource;
}

/** Opcje planu: odgałęzienia toru (pozycje z `galezieSekwencji`/`rekordyToruPola`)
 *  i rezerwy podpisów (patrz `GalazPlanu.rezerwaEtykiet`, `rezerwaEtykietBocznych`). */
export interface OpcjePlanuPola {
  readonly galezie?: readonly GalazSekwencji[];
  readonly rezerwaEtykietGalezi?: (pozycje: readonly number[]) => number;
  readonly rezerwaEtykietBocznych?: number;
}

function planToru(
  symbolIds: readonly SymbolId[],
  pozycje: readonly number[],
  czyBoczny: (symbolId: SymbolId) => boolean,
): Omit<BayApparatusPlan, 'source' | 'galezie' | 'rezerwaEtykietBocznych'> {
  const mainPath: SymbolId[] = [];
  const mainSequenceIndices: number[] = [];
  const laterals: LateralApparatusPlanEntry[] = [];
  for (const sequenceIndex of pozycje) {
    const symbolId = symbolIds[sequenceIndex];
    if (czyBoczny(symbolId)) {
      laterals.push({ symbolId, afterMainIndex: mainPath.length - 1, sequenceIndex });
    } else {
      mainPath.push(symbolId);
      mainSequenceIndices.push(sequenceIndex);
    }
  }
  if (mainPath.length === 0 && laterals.length > 0) {
    return { mainPath: pozycje.map((i) => symbolIds[i]), mainSequenceIndices: pozycje, laterals: [] };
  }
  return { mainPath, mainSequenceIndices, laterals };
}

/**
 * Jedna prawda podziału tor główny / aparaty boczne / odgałęzienia (measure↔compose, wzór
 * F6b-1). PRZYPADEK ZDEGENEROWANY: sekwencja złożona WYŁĄCZNIE z aparatów bocznych (brak toru
 * głównego, np. syntetyczne pole samego ES) — plan zwraca je jako `mainPath` (uczciwy
 * fallback: nie da się narysować odgałęzienia bez osi; wołający może to raportować przez
 * `missingData`). Pozycje odgałęzień (`opcje.galezie`) nie wchodzą do toru głównego ani do
 * jego aparatów bocznych — każde odgałęzienie dostaje własny plan tą samą regułą.
 */
export function planApparatusSymbolIds(
  symbolIds: readonly SymbolId[],
  // GPZ-PARYTET cz. 3: podział tor główny / aparat boczny jako PARAMETR — rozdzielnica GPZ
  // dokłada do zbioru bocznego glif rodzaju źródła pola OZE (`compose/gpz.ts
  // jestAparatemBocznymPolaGpz`), a jej budowa stosu i zaczep trasy używają TEGO SAMEGO
  // predykatu (jedno źródło prawdy measure↔compose↔scena).
  czyBoczny: (symbolId: SymbolId) => boolean = czyAparatBoczny,
  opcje: OpcjePlanuPola = {},
): Omit<BayApparatusPlan, 'source'> {
  const galezie = opcje.galezie ?? [];
  const wGalezi = new Set(galezie.flatMap((g) => g.pozycje));
  const tor = planToru(
    symbolIds,
    symbolIds.map((_, i) => i).filter((i) => !wGalezi.has(i)),
    czyBoczny,
  );
  return {
    ...tor,
    galezie: galezie.map((g) => ({
      afterMainIndex: g.zaPozycja < 0 ? -1 : tor.mainSequenceIndices.indexOf(g.zaPozycja),
      plan: planToru(symbolIds, g.pozycje, czyBoczny),
      rezerwaEtykiet: opcje.rezerwaEtykietGalezi?.(g.pozycje) ?? 0,
    })),
    rezerwaEtykietBocznych: opcje.rezerwaEtykietBocznych ?? 0,
  };
}

/** Pas podpisów identyfikatorów (§19.1, konwencja — stały margines niezależny od danych,
 *  jak `layout/measure.ts apparatusIdentifierLeftReserve`) aparatów odgałęzienia pola stacji:
 *  podpisy kolumny odgałęzienia stoją PO PRAWEJ jej aparatów. */
export function rezerwaIdentyfikatorowNaPozycjach(
  symbolIds: readonly SymbolId[],
): (pozycje: readonly number[]) => number {
  const identyfikatory = apparatusIdentifiers(symbolIds);
  return (pozycje) => {
    const szerokosci = pozycje
      .map((i) => identyfikatory[i])
      .filter((t): t is string => t != null)
      .map((t) => measureLabelWidth(t, 't4'));
    return szerokosci.length > 0 ? snapUp(GRID + Math.max(...szerokosci)) : 0;
  };
}

export function planBayApparatus(
  bay: Pick<MiniBlockBayDescriptor, 'fieldRole' | 'primaryDevices' | 'reserve' | 'transformerRef'>,
): BayApparatusPlan {
  const { symbolIds, source, galezie } = resolveBayApparatusSymbolIds(bay);
  return {
    ...planApparatusSymbolIds(symbolIds, czyAparatBoczny, {
      galezie,
      rezerwaEtykietGalezi: rezerwaIdentyfikatorowNaPozycjach(symbolIds),
    }),
    source,
  };
}

/** Prześwit gałęzi bocznej od osi toru (poziomy jog) — długość odczepu z
 *  rastru kontraktowego (W1b uwaga 12, `layout/apparatusStack.ts`). Alias
 *  zachowany: dawni wołający (`compose/station.ts`) importują tę nazwę. */
export const LATERAL_BRANCH_GAP = APPARATUS_STACK_LATERAL_TAP;

// ---------------------------------------------------------------------------
// F10.2 (spec §19.1, dyrektywa D2-3, V12K-035) — identyfikator PER-APARAT
// (Q/QE/T), zastępujący dawny `bayApparatusDesignation` (Q/T jako etykieta
// CAŁEGO pola, usunięty z `compose/directions.ts`). „Q" identyfikuje
// KONKRETNY aparat toru (wyłącznik/rozłącznik/odłącznik), NIE pole.
// ---------------------------------------------------------------------------

/** Aparaty toru, którym spec §19.1 przypisuje literę „Q" (wyłącznik/
 *  rozłącznik/odłącznik — wszystkie łączniki BEZ własnej litery). `fuseSwitch`
 *  („rozłącznik z bezpiecznikiem") mieści się w tej samej kategorii —
 *  spec wymienia „wyłącznik/rozłącznik/odłącznik" jako JEDNĄ grupę „Q". */
const Q_IDENTIFIER_SYMBOLS: ReadonlySet<SymbolId> = new Set<SymbolId>([
  'breaker',
  'disconnector',
  // Recenzja NO-GO 2026-07-17 pkt 5 (spec §12.5): rozłącznik = ta sama
  // grupa „Q" (wyłącznik/rozłącznik/odłącznik, §19.1).
  'loadBreakSwitch',
  'fuseSwitch',
  // UX-04/POLE-LINIOWE-WZORZEC: łącznik trójpołożeniowy (ENEA Zeszyt 1 §13) — łącznik toru
  // w grupie „Q" (§19.1: wyłącznik/rozłącznik/odłącznik; nóż łączy tor albo uziemia).
  'qetThreePositionSwitch',
]);

/**
 * Identyfikatory PER-APARAT (spec §19.1: „Q1" wyłącznik, „Q9" odłącznik
 * szynowy, „QE1" uziemnik, „T1" transformator) — WYŁĄCZNIE dla aparatów
 * wymienionych WPROST w spec §19.1: łączniki toru (breaker/disconnector/
 * fuseSwitch → „Q"), uziemnik (earthSwitch → „QE"), transformator
 * (transformer2W → „T") — oraz przekładnik napięciowy (voltageTransformer →
 * „TV", klasa przekładników wg PN-EN 81346-2: TA=prądowy, TV=napięciowy;
 * dyrektywa właściciela 2026-08-06 po audycie sieci pokazowej: przekładnik
 * pola pomiarowego rysowany bez oznacznika był nieodróżnialny od
 * transformatora mocy — „mały TR" na prawym skraju stacji) — oraz ogranicznik
 * przepięć (surgeArrester → „F", klasa ochronników wg PN-EN 81346-2; decyzja
 * właściciela 2026-08-07, rejestr V12K-335 pkt 3 — dług „SA bez konwencji"
 * nazwany przy TV w V12K-329 ROZSTRZYGNIĘTY: rodzina F, spójnie z TV; kolizja
 * wizualna z producenckimi „F1" bezpieczników jest rozmyślnie zaakceptowana —
 * oba są klasą F wg 81346-2, a dana producencka i tak wygrywa nad konwencją).
 * CT/cableHead/protectionRelay/meter NIE dostają identyfikatora w tej fazie —
 * CT ma WŁASNĄ adnotację (identyfikator+przekładnia, §18.3, F10.4, POZA torem
 * mocy).
 *
 * PRYMAT DANYCH NAD KONWENCJĄ (spec §12.1, Z3 audytu powykonawczego SLD
 * `docs/sld/AUDYT_POWYKONAWCZY_SLD_2026-07.md` §Z3 + dług W1c). Priorytet
 * rozstrzygania oznaczenia aparatu (od najsilniejszego):
 *   (1) `designations[i]` — `BayPrimaryDevice.designation` (DANA per-aparat,
 *       np. z packa producenckiego / szablonu kreatora: „Q0", „Q9", „F1",
 *       „TR", „QE1"): gdy obecna (niepusty, przycięty string), JEJ TEKST
 *       wygrywa. Źródło `'dane'`. Producenckie „F1"/„TR" — które NIE pasują do
 *       wzorca §19.1 Q\d+/QE\d+/T\d+ — są tu PEŁNOPRAWNE (dług W1c domknięty:
 *       oznaczenie identyfikowalne aparatu = DANA, nie tylko wzorzec konwencji;
 *       wyrocznia sceny `apparatusIdentifierGaps` rozpoznaje je po
 *       `designationSource==='dane'`).
 *   (2) „designation pola + indeks wg konwencji": gdy brak danej per-aparat,
 *       tożsamość pola (`MiniBlockBayDescriptor.designation`, np. „WE"/„WY"/
 *       „ODG"/„TR") jest renderowana OSOBNO jako etykieta pola (sidecar
 *       funkcyjny / podpis kierunku, `compose/directions.ts`), a TEN
 *       identyfikator dokłada indeks konwencji per-aparat — razem w scenie
 *       tworzą „⟨pole⟩ + ⟨Q/QE/T⟩". Świadomie NIE wklejamy prefiksu pola w
 *       glif aparatu (poszerzałby etykietę t4 ⇒ wzrost `apparatusIdentifier
 *       LeftReserve` ⇒ zmiana geometrii/kotwic — zakazana inwariantem Z3
 *       „geometria nietknięta, zmienia się WYŁĄCZNIE treść etykiet"; wariant z
 *       prefiksem w glifie = jawny dług layoutowy, wymaga karty poszerzenia
 *       rezerwy, patrz raport Z3).
 *   (3) czysta konwencja §19.1 (Q{n}/QE{n}/T{n}), gdy pole nie niesie żadnej
 *       tożsamości ani danej per-aparat.
 *
 * UNIKALNOŚĆ W OBRĘBIE POLA (Z3 §0.3): identyfikatory KONWENCJI (Q{n}/QE{n}/
 * T{n}) są z natury unikalne w polu (rosnące liczniki). Kolizja może wystąpić
 * WYŁĄCZNIE między DANYMI (dwa aparaty pola z identycznym `designation` — np.
 * niespójny pack) — wtedy deterministyczny sufiks „·{k}" (k=2,3,… wg
 * kolejności w sekwencji), ZERO cichego nadpisania (disambiguacja JAWNA i
 * powtarzalna: te same dane ⇒ te same oznaczenia).
 *
 * F10.6 (DOMAIN, V12K-035, D1): parametr `designations` opcjonalny — wywołanie
 * BEZ niego (`layout/measure.ts` `apparatusIdentifierLeftReserve`) zachowuje
 * dokładnie zachowanie 100% konwencji (rezerwacja szerokości LICZONA Z
 * KONWENCJI — stały margines geometryczny niezależny od danych, dlatego glif
 * priorytetu (2) nie może poszerzać etykiety, patrz wyżej). Źródło
 * `'dane'`/`'konwencja'` per pozycja — `apparatusIdentifierSources` niżej.
 *
 * Numeracja: JEDEN licznik na kategorię (Q/QE/T/TV/F) per POLE, rosnąco wg
 * pozycji w PEŁNEJ sekwencji aparatów pola (tor główny + laterale w
 * kolejności `placement`/konwencji, V12K-040) — deterministyczne, licznik
 * resetuje się na każdym polu. Zwraca tablicę index-aligned do `symbolIds`
 * (`null` dla aparatów bez identyfikatora w tej fazie).
 */
export function apparatusIdentifiers(
  symbolIds: readonly SymbolId[],
  designations?: readonly (string | null | undefined)[],
): readonly (string | null)[] {
  let q = 0;
  let qe = 0;
  let t = 0;
  let tv = 0;
  let f = 0;
  // Z3 §0.3: mapa zajętych oznaczeń pola (dzielona dane↔konwencja — celem jest
  // unikalność RENDEROWANEGO tekstu w polu). Konwencja nigdy nie koliduje;
  // sufiks fire'uje wyłącznie przy powtórzonej DANEJ.
  const used = new Map<string, number>();
  const disambiguate = (base: string): string => {
    const seen = used.get(base);
    if (seen === undefined) {
      used.set(base, 1);
      return base;
    }
    const next = seen + 1;
    used.set(base, next);
    return `${base}·${next}`;
  };
  return symbolIds.map((symbolIdRysunku, index) => {
    // UX-04/POLE-LINIOWE-WZORZEC: rodzaj semantyczny — symbol QET tego samego aparatu
    // dostaje tę samą literę (wyłącznik QET = „Q", uziemnik QET = „QE").
    const symbolId = rodzajSymbolu(symbolIdRysunku);
    const dataDesignation = designations?.[index]?.trim() || null;
    if (Q_IDENTIFIER_SYMBOLS.has(symbolId)) {
      q += 1;
      return disambiguate(dataDesignation ?? `Q${q}`);
    }
    if (symbolId === 'earthSwitch') {
      qe += 1;
      return disambiguate(dataDesignation ?? `QE${qe}`);
    }
    if (symbolId === 'transformer2W') {
      t += 1;
      return disambiguate(dataDesignation ?? `T${t}`);
    }
    if (symbolId === 'voltageTransformer') {
      tv += 1;
      return disambiguate(dataDesignation ?? `TV${tv}`);
    }
    if (symbolId === 'surgeArrester') {
      // V12K-335 pkt 3 (decyzja właściciela 2026-08-07): ogranicznik przepięć
      // → rodzina F wg PN-EN 81346-2 (F1, F2… per pole, jak Q/QE/T/TV).
      f += 1;
      return disambiguate(dataDesignation ?? `F${f}`);
    }
    return null;
  });
}

/**
 * Pochodzenie ('dane'/'konwencja') identyfikatora PER-APARAT na tej samej
 * pozycji co `apparatusIdentifiers` zwraca (F10.6, DOMAIN, V12K-035) —
 * `null` dla pozycji BEZ identyfikatora w tej fazie (symetryczne do `null` w
 * `apparatusIdentifiers`). `'dane'` WYŁĄCZNIE gdy `designations[index]` jest
 * niepustym (po przycięciu) stringiem — ta sama reguła co wyżej, bez
 * duplikacji liczników (source nie zależy od numeracji, tylko od obecności
 * danej).
 */
export function apparatusIdentifierSources(
  symbolIds: readonly SymbolId[],
  designations?: readonly (string | null | undefined)[],
): readonly ('dane' | 'konwencja' | null)[] {
  return symbolIds.map((symbolIdRysunku, index) => {
    const symbolId = rodzajSymbolu(symbolIdRysunku);
    const isIdentifiable =
      Q_IDENTIFIER_SYMBOLS.has(symbolId)
      || symbolId === 'earthSwitch'
      || symbolId === 'transformer2W'
      || symbolId === 'voltageTransformer'
      || symbolId === 'surgeArrester';
    if (!isIdentifiable) return null;
    const dataDesignation = designations?.[index]?.trim();
    return dataDesignation ? 'dane' : 'konwencja';
  });
}

/** Pas elementu bocznego pola: od kotwicy `y0` w dół o `wysokosc`, `szerokosc` w prawo. */
interface PasBoczny {
  readonly y0: number;
  readonly szerokosc: number;
  readonly wysokosc: number;
}

/**
 * Ułożenie pasów bocznych pola (aparaty boczne §18.1 i odgałęzienia toru) na prawo od toru
 * głównego. Pasy stawiane od NAJNIŻSZEJ kotwicy w górę (przy wspólnej kotwicy w kolejności
 * wejścia), każdy w pierwszym od toru miejscu, w którym (a) nie nachodzi na pas już postawiony
 * i (b) nie przecina ODCZEPU pasa już postawionego — odczep biegnie poziomo na wysokości
 * kotwicy od osi toru do lewej krawędzi pasu. Odczep stawianego pasa nie przecina pasów
 * postawionych, bo te mają kotwice nie wyżej (pas zaczyna się na swojej kotwicy). Zwraca
 * odstęp od prawej krawędzi toru głównego do lewej krawędzi każdego pasu.
 */
function ulozPasyBoczne(pasy: readonly PasBoczny[]): readonly number[] {
  const postawione: { readonly x0: number; readonly x1: number; readonly y0: number; readonly y1: number }[] = [];
  const odstepy = new Array<number>(pasy.length).fill(0);
  const kolejnosc = pasy.map((pas, index) => ({ pas, index })).sort((a, b) => b.pas.y0 - a.pas.y0 || a.index - b.index);
  for (const { pas, index } of kolejnosc) {
    const y0 = pas.y0;
    const y1 = pas.y0 + pas.wysokosc;
    let x = LATERAL_BRANCH_GAP;
    for (;;) {
      const kolizja = postawione.find(
        (p) =>
          (p.y0 < y1 && y0 < p.y1 && p.x0 < x + pas.szerokosc && x < p.x1)
          // Pas sięgający wysokości odczepu postawionego pasu po jego lewej stronie.
          || (y0 < p.y0 && p.y0 < y1 && x < p.x0),
      );
      if (!kolizja) break;
      x = kolizja.x1 + LATERAL_BRANCH_GAP;
    }
    postawione.push({ x0: x, x1: x + pas.szerokosc, y0, y1 });
    odstepy[index] = x;
  }
  return odstepy;
}

/**
 * Odstęp poziomy (od prawej krawędzi toru głównego do lewej krawędzi symbolu) każdego
 * odgałęzienia bocznego pola (§18.1) — JEDNA reguła planu (`bayApparatusPlanFootprint`)
 * i rysunku (`compose/station.ts::buildBayStack`, `compose/gpz.ts::buildFieldStack`).
 *
 * Odgałęzienie zajmuje pas pionowy od kotwicy do dołu symbolu z podpisem identyfikatora
 * pod nim (`labelLineHeight('t4')`), ułożony regułą `ulozPasyBoczne`. Skutki: laterale
 * wspólnej kotwicy siedzą obok siebie (kolejne `LATERAL_BRANCH_GAP + width`, jak dotąd);
 * karta UX-04 — odgałęzienia na RÓŻNYCH węzłach toru z portów (przekładnik napięciowy za
 * przekładnikiem prądowym, uziemnik za odłącznikiem liniowym) stoją jedno pod drugim, gdy
 * pasy się mieszczą, a gdy symbol z podpisem sięga do niższej kotwicy, wyższe odgałęzienie
 * odsuwa się w prawo, a jego odczep biegnie NAD niższym.
 */
export function przesunieciaOdgalezien(
  laterals: readonly Pick<LateralApparatusPlanEntry, 'symbolId' | 'afterMainIndex'>[],
  kotwicaY: (afterMainIndex: number) => number,
): readonly number[] {
  return ukladBocznyPola({ laterals, galezie: [], rezerwaEtykietBocznych: 0 }, kotwicaY).boczne;
}

/** Wysokość podpisu pod symbolem bocznym (pas aparatu bocznego). */
function wysokoscPasaBocznego(symbolId: SymbolId): number {
  return SYMBOL_DEFS[symbolId].height + labelLineHeight('t4');
}

/** Gabaryt pasa odgałęzienia: kolumna z jej aparatami bocznymi i pasem podpisów po prawej;
 *  wysokość od kotwicy: odstęp rastru + kolumna. */
export function pasOdgalezienia(galaz: GalazPlanu): { readonly szerokosc: number; readonly wysokosc: number } {
  const sub = bayApparatusPlanFootprint({ ...galaz.plan, galezie: [], rezerwaEtykietBocznych: 0 });
  return {
    szerokosc: sub.width + galaz.rezerwaEtykiet,
    wysokosc: APPARATUS_STACK_VERTICAL_GAP + sub.height + labelLineHeight('t4'),
  };
}

/**
 * Położenie poziome aparatów bocznych i odgałęzień toru pola — JEDNA reguła planu
 * (`bayApparatusPlanFootprint`) i rysunku (stacja, GPZ). Aparat boczny: pas symbolu
 * z podpisem (+ `rezerwaEtykietBocznych`, gdy podpis stoi po prawej); odgałęzienie: pas
 * `pasOdgalezienia` od kotwicy. Wspólne ułożenie `ulozPasyBoczne` — odczep odgałęzienia nie
 * przecina aparatu bocznego i odwrotnie.
 */
export function ukladBocznyPola(
  plan: {
    readonly laterals: readonly Pick<LateralApparatusPlanEntry, 'symbolId' | 'afterMainIndex'>[];
    readonly galezie: readonly GalazPlanu[];
    readonly rezerwaEtykietBocznych: number;
  },
  kotwicaY: (afterMainIndex: number) => number,
): { readonly boczne: readonly number[]; readonly galezie: readonly number[] } {
  const pasy: PasBoczny[] = [
    ...plan.laterals.map((lat) => ({
      y0: kotwicaY(lat.afterMainIndex),
      szerokosc: SYMBOL_DEFS[lat.symbolId].width + plan.rezerwaEtykietBocznych,
      wysokosc: wysokoscPasaBocznego(lat.symbolId),
    })),
    ...plan.galezie.map((g) => ({ y0: kotwicaY(g.afterMainIndex), ...pasOdgalezienia(g) })),
  ];
  const odstepy = ulozPasyBoczne(pasy);
  return { boczne: odstepy.slice(0, plan.laterals.length), galezie: odstepy.slice(plan.laterals.length) };
}

export interface BayApparatusPlanFootprint {
  /** Pełna szerokość: stos toru głównego + (jeżeli są laterale/odgałęzienia) rozszerzenie
   *  w prawo `lateralExtension`. */
  readonly width: number;
  readonly height: number;
  /** Szerokość doliczona NA PRAWO od stosu głównego na aparaty boczne i odgałęzienia
   *  (0 gdy pole ich nie ma) — measure i compose liczą z TEGO pola. */
  readonly lateralExtension: number;
  /** Gabaryt samego stosu toru głównego (oś = mainStack.width/2 od lewej —
   *  NIEZMIENIONA względem stanu sprzed F10.1: tapX/zejścia bez regresu). */
  readonly mainStack: { readonly width: number; readonly height: number };
}

/**
 * Położenia pionowe aparatów TORU GŁÓWNEGO względem szczytu stosu — JEDNA reguła planu
 * (`bayApparatusPlanFootprint`), stosu stacji (`compose/station.ts::buildBayStack`) i pola GPZ
 * (`compose/gpz.ts::buildFieldStack`). Kolejny aparat stoi raster (`APPARATUS_STACK_VERTICAL_GAP`)
 * pod poprzednim; aparat toru głównego za KOTWICĄ odgałęzienia toru (port S aparatu
 * `afterMainIndex ≥ 0`) stoi pod CAŁYM pasem odgałęzienia (`pasOdgalezienia`: kolumna z podpisami)
 * + raster — jak na schemacie ENEA Zeszyt 1, Z.11.1 (przekładnik prądowy pola pod odgałęzieniem
 * przekładnika napięciowego). Dzięki temu poziome linie obwodów wtórnych aparatów toru
 * głównego (pomiar do przekaźnika pola) biegną pod odgałęzieniem, nie przez nie. Odgałęzienie
 * od węzła szyny (`afterMainIndex = -1`) wisi równolegle do toru od szyny i nie przesuwa toru
 * (przesunięcie odsunęłoby cały tor od szyny o wysokość odgałęzienia).
 */
export function polozeniaToruGlownego(
  plan: Pick<BayApparatusPlan, 'mainPath'> & Partial<Pick<BayApparatusPlan, 'galezie'>>,
): { readonly y: readonly number[]; readonly height: number } {
  const galezie = plan.galezie ?? [];
  const y: number[] = [];
  let szczyt = 0;
  plan.mainPath.forEach((symbolId, i) => {
    y.push(szczyt);
    const dol = szczyt + SYMBOL_DEFS[symbolId].height;
    // W1b (uwaga 12): odstęp aparat–aparat z rastru kontraktowego.
    let nastepny = dol + APPARATUS_STACK_VERTICAL_GAP;
    for (const galaz of galezie) {
      // Pas odgałęzienia niesie wiersz podpisu (t4, wysokość spoza rastru) — położenie aparatu
      // toru przyciągnięte w górę do siatki (aparaty i porty toru zawsze na rastrze).
      if (galaz.afterMainIndex === i) {
        nastepny = Math.max(nastepny, snapUp(dol + pasOdgalezienia(galaz).wysokosc + APPARATUS_STACK_VERTICAL_GAP));
      }
    }
    szczyt = nastepny;
  });
  const n = plan.mainPath.length;
  return { y, height: n > 0 ? y[n - 1] + SYMBOL_DEFS[plan.mainPath[n - 1]].height : 0 };
}

/** Y kotwicy względem szczytu stosu = dół aparatu `afterMainIndex` toru głównego
 *  (`polozeniaToruGlownego`, port S); dla -1 → 0 (port N). */
function kotwicaWzglednaY(
  plan: Pick<BayApparatusPlan, 'mainPath'> & Partial<Pick<BayApparatusPlan, 'galezie'>>,
  afterMainIndex: number,
): number {
  if (afterMainIndex < 0) return 0;
  return polozeniaToruGlownego(plan).y[afterMainIndex] + SYMBOL_DEFS[plan.mainPath[afterMainIndex]].height;
}

/**
 * Gabaryt pola wg planu §18.1: szerokość stosu głównego + rozszerzenie
 * boczne; wysokość = max(tor główny, zwis lateralu: kotwica + wysokość
 * symbolu, zwis odgałęzienia: kotwica + raster + kolumna). Położenie poziome —
 * `ukladBocznyPola` (ta sama funkcja co rysunek stacji i GPZ).
 */
export function bayApparatusPlanFootprint(
  plan: Pick<BayApparatusPlan, 'mainPath' | 'laterals'> & Partial<Pick<BayApparatusPlan, 'galezie' | 'rezerwaEtykietBocznych'>>,
): BayApparatusPlanFootprint {
  const galezie = plan.galezie ?? [];
  const mainStack = { width: stackFootprint(plan.mainPath).width, height: polozeniaToruGlownego(plan).height };
  if (plan.laterals.length === 0 && galezie.length === 0) {
    return { width: mainStack.width, height: mainStack.height, lateralExtension: 0, mainStack };
  }
  const anchorRelY = (afterMainIndex: number): number => kotwicaWzglednaY(plan, afterMainIndex);
  const uklad = ukladBocznyPola(
    { laterals: plan.laterals, galezie, rezerwaEtykietBocznych: plan.rezerwaEtykietBocznych ?? 0 },
    anchorRelY,
  );
  let lateralExtension = 0;
  let height = mainStack.height;
  plan.laterals.forEach((lat, i) => {
    const def = SYMBOL_DEFS[lat.symbolId];
    lateralExtension = Math.max(lateralExtension, uklad.boczne[i] + def.width);
    height = Math.max(height, anchorRelY(lat.afterMainIndex) + def.height);
  });
  galezie.forEach((galaz, i) => {
    const sub = bayApparatusPlanFootprint({ ...galaz.plan, galezie: [], rezerwaEtykietBocznych: 0 });
    lateralExtension = Math.max(lateralExtension, uklad.galezie[i] + sub.width + galaz.rezerwaEtykiet);
    height = Math.max(height, anchorRelY(galaz.afterMainIndex) + APPARATUS_STACK_VERTICAL_GAP + sub.height);
  });
  return { width: mainStack.width + lateralExtension, height, lateralExtension, mainStack };
}

/** Pozycja symbolu odgałęzienia na rysunku. */
export interface PozycjaOdgalezienia {
  readonly sequenceIndex: number;
  readonly symbolId: SymbolId;
  readonly x: number;
  readonly y: number;
  /** Aparat boczny odgałęzienia (podpis i odczep jak aparat boczny toru głównego). */
  readonly boczny: boolean;
}

/**
 * Rysunek JEDNEGO odgałęzienia toru pola — JEDNA reguła stacji (`compose/station.ts`) i GPZ
 * (`compose/gpz.ts`). Kolumna odgałęzienia stoi osią `lewaX + mainStack.width/2` (lewa
 * krawędź pasu z `ukladBocznyPola`), pierwszy aparat o raster poniżej kotwicy; aparaty boczne
 * odgałęzienia wiszą na prawo od kolumny (`ukladBocznyPola` planu odgałęzienia). Odczep:
 * poziomo z kotwicy do osi portu N pierwszego aparatu, potem pion do portu. Przewody kolumny
 * z portów (`przewodyToruZPortow`), odczepy aparatów bocznych wyłącznie na węźle kotwicy
 * (`czyOdgalezienieNaWezleKotwicy`) — zero przewodu z domysłu. `urzadzenie(i)` = rekord
 * aparatu pozycji `i` sekwencji pola; `kotwicaUrzadzenie` = rekord aparatu toru głównego,
 * za którym odchodzi odgałęzienie (`undefined` = od węzła szyny).
 */
export function ukladGalezi(
  galaz: GalazPlanu,
  kotwica: { readonly x: number; readonly y: number },
  lewaX: number,
  urzadzenie: (sequenceIndex: number) => Pick<AparatSekwencjiPola, 'kind' | 'ports'> | undefined,
  kotwicaUrzadzenie: Pick<AparatSekwencjiPola, 'kind' | 'ports'> | undefined,
): {
  readonly pozycje: readonly PozycjaOdgalezienia[];
  readonly odczep: readonly { readonly x: number; readonly y: number }[] | null;
  readonly przewody: readonly (readonly { readonly x: number; readonly y: number }[])[];
} {
  const sub = bayApparatusPlanFootprint({ ...galaz.plan, galezie: [], rezerwaEtykietBocznych: 0 });
  const osX = lewaX + sub.mainStack.width / 2;
  const kolumna: PozycjaOdgalezienia[] = [];
  let y = kotwica.y + APPARATUS_STACK_VERTICAL_GAP;
  galaz.plan.mainPath.forEach((symbolId, i) => {
    const def = SYMBOL_DEFS[symbolId];
    kolumna.push({ sequenceIndex: galaz.plan.mainSequenceIndices[i], symbolId, x: snapToGrid(osX - def.width / 2), y, boczny: false });
    y += def.height + APPARATUS_STACK_VERTICAL_GAP;
  });
  const prawaKolumnyX = Math.max(...kolumna.map((k) => k.x + SYMBOL_DEFS[k.symbolId].width));
  const portKolumny = (k: PozycjaOdgalezienia, dir: 'N' | 'S') => {
    const def = SYMBOL_DEFS[k.symbolId];
    const port = def.ports.find((p) => p.dir === dir) ?? def.ports[0];
    return { x: k.x + port.x, y: k.y + port.y };
  };
  const kotwicaBocznegoY = (afterMainIndex: number): number =>
    afterMainIndex >= 0 ? portKolumny(kolumna[afterMainIndex], 'S').y : portKolumny(kolumna[0], 'N').y;
  const odstepy = przesunieciaOdgalezien(galaz.plan.laterals, kotwicaBocznegoY);
  const boczne: PozycjaOdgalezienia[] = [];
  const przewody: (readonly { readonly x: number; readonly y: number }[])[] = [
    ...przewodyToruZPortow(
      kolumna.map((k) => ({ symbolId: k.symbolId, x: k.x, y: k.y, device: urzadzenie(k.sequenceIndex) })),
    ),
  ];
  galaz.plan.laterals.forEach((lat, i) => {
    const def = SYMBOL_DEFS[lat.symbolId];
    const zaczep =
      lat.afterMainIndex >= 0 ? portKolumny(kolumna[lat.afterMainIndex], 'S') : portKolumny(kolumna[0], 'N');
    const x = prawaKolumnyX + odstepy[i];
    boczne.push({ sequenceIndex: lat.sequenceIndex, symbolId: lat.symbolId, x, y: zaczep.y, boczny: true });
    const kotwicaBocznego =
      lat.afterMainIndex >= 0
        ? urzadzenie(galaz.plan.mainSequenceIndices[lat.afterMainIndex])
        : urzadzenie(galaz.plan.mainSequenceIndices[0]);
    if (!czyOdgalezienieNaWezleKotwicy(kotwicaBocznego, lat.afterMainIndex >= 0, urzadzenie(lat.sequenceIndex))) return;
    const north = def.ports.find((p) => p.dir === 'N') ?? def.ports[0];
    przewody.push([zaczep, { x: x + north.x, y: zaczep.y }]);
  });
  const pierwszy = kolumna[0];
  const north = pierwszy ? portKolumny(pierwszy, 'N') : null;
  const naWezle =
    pierwszy != null
    && czyOdgalezienieNaWezleKotwicy(kotwicaUrzadzenie, galaz.afterMainIndex >= 0, urzadzenie(pierwszy.sequenceIndex));
  const odczep = north && naWezle ? [{ x: kotwica.x, y: kotwica.y }, { x: north.x, y: kotwica.y }, north] : null;
  return { pozycje: [...kolumna, ...boczne], odczep, przewody };
}
