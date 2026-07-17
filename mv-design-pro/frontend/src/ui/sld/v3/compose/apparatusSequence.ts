/**
 * SLD V3 F9.3 — sekwencja aparatów pola (SLD_CAD_SPEC_V3 §12 „Kompozycja
 * celki pola wg fizycznej ścieżki mocy"). Jedno źródło prawdy dla:
 *  - `layout/measure.ts` (`bayColumnFootprint` — REZERWACJA miejsca), i
 *  - `compose/station.ts` (`buildBayStack`/`composeStation` — REALNY rysunek),
 * które MUSZĄ dawać identyczny gabaryt (test „spójność measure↔compose",
 * `compose/__tests__/station.test.ts`) — patrz nagłówek `compose/station.ts`.
 *
 * Dwie warstwy (spec §12.1 „prymat danych nad konwencją"):
 *  1. `apparatusSymbolsForRole` — stos KONWENCJI (fallback rysunkowy, §12.4),
 *     WYŁĄCZNIE gdy pole nie niesie `Bay.primary_devices`. Kolejność OD SZYNY
 *     W DÓŁ (§12.2/V12K-027): pole liniowe `DS→CB→CT→DS→ES→głowica`; pole TR
 *     `DS→bezpiecznik→TR2W`; pole pomiarowe `DS→VT→ES`; pole sprzęgła
 *     `DS→CB→CT`. Zero SA (surgeArrester) w konwencji — V12K-028: mimo że od
 *     F9.6 ENM zna `SURGE_ARRESTER` w `BayPrimaryDeviceKind`, SA WCIĄŻ nigdy
 *     nie jest rysowany „z domysłu" (§12.5) — jedyna ścieżka do glifu
 *     `surgeArrester` to `symbolIdForPrimaryDeviceKind` niżej (dane).
 *  2. `symbolIdForPrimaryDeviceKind` + `resolveBayApparatusSymbolIds` — ścieżka
 *     DANYCH (§12.1): gdy `bay.primaryDevices` niepuste (i mapowalne na co
 *     najmniej jeden symbol pola), stos budowany Z DANYCH, uporządkowanych
 *     już przez adapter wg `placement` (`v2/canvas/enmToSldAdapter.ts`
 *     `projectBayPrimaryDevices` — UPSTREAM przy szynie → DOWNSTREAM przy
 *     głowicy, ta sama kolejność „od szyny w dół" co konwencja).
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
 * `derGenerator` przez `apparatusSymbolsForRole` dla pól DER) — mapują się na
 * `null` i są odfiltrowane ze stosu aparatów (mirror `BAY_PRIMARY_DEVICE_TO_
 * APPARATUS` w `v2/domain/apparatusContracts.ts`, ten sam podział).
 */

import { GRID } from '../core/grid';
import { SYMBOL_DEFS, type SymbolId } from '../symbols/defs';
import { FIELD_ROLE, type FieldRole } from '../../v2/domain/apparatusContracts';
import type { MiniBlockBayDescriptor } from '../../v2/renderer/MiniBlockRmuRenderer';
import type { BayPrimaryDeviceKind } from '../../../../types/enm';

/** Znacznik pochodzenia stosu aparatów (spec §12.1, audytor DOM
 *  `data-apparatus-source`) — `'dane'` gdy stos zbudowany z
 *  `Bay.primary_devices`, `'konwencja'` gdy z tabeli fallback §12.4. */
export type BayApparatusSource = 'dane' | 'konwencja';

/**
 * Stos KONWENCJI (od szyny w dół, spec §12.2/§12.4) — fallback WYŁĄCZNIE dla
 * pola bez `primary_devices`. MUSI zostać zsynchronizowany z
 * `bayColumnFootprint` (`layout/measure.ts`, przez `stackFootprint` niżej —
 * jedna prawda, zero duplikacji tabeli).
 */
export function apparatusSymbolsForRole(role: FieldRole): readonly SymbolId[] {
  if (role === FIELD_ROLE.RMU_TRANSFORMER) {
    // Recenzja NO-GO 2026-07-17 pkt 5/6 (spec §12.5): pole TRANSFORMATOROWE
    // BEZPIECZNIKOWE stacji SN/nN (RMU) — rozłącznik z bezpiecznikami +
    // uziemnik (BOCZNY, §18.1 — dawny szablon w ogóle nie miał ES: pomiar
    // recenzji pkt 6 „nie przedstawia uziemnika właściwego dla pola
    // transformatorowego") + TR2W. Wariant wyłącznikowy = ścieżka DANYCH
    // (`primary_devices` z CB), nie konwencja.
    return ['fuseSwitch', 'earthSwitch', 'transformer2W'];
  }
  if (role === FIELD_ROLE.TRANSFORMER) {
    // pole TR (spec §12.4, poza RMU — GPZ/rozdzielnice wyłącznikowe):
    // DS → bezpiecznik → TR2W (jak dotąd).
    return ['disconnector', 'fuseSwitch', 'transformer2W'];
  }
  if (role === FIELD_ROLE.DER_PV) return ['derPv'];
  if (role === FIELD_ROLE.DER_BESS) return ['derBess'];
  if (role === FIELD_ROLE.DER_FW) return ['derGenerator'];
  if (role === FIELD_ROLE.MEASUREMENT) {
    // pole pomiarowe (spec §12.4): DS → VT → ES.
    return ['disconnector', 'voltageTransformer', 'earthSwitch'];
  }
  if (role === FIELD_ROLE.COUPLER) {
    // pole sprzęgła (spec §12.4): DS → CB → CT.
    return ['disconnector', 'breaker', 'currentTransformer'];
  }
  if (role === FIELD_ROLE.RMU_LINE) {
    // Recenzja NO-GO 2026-07-17 pkt 5 (spec §12.5): pole LINIOWE RMU stacji
    // SN/nN — rozłącznik + uziemnik (BOCZNY) + głowica kablowa. Dawny
    // szablon (DS→CB→CT→DS→ES→głowica) był kopią pola WYŁĄCZNIKOWEGO GPZ
    // („uniwersalny szablon" — pomiar recenzji pkt 5); CB+CT w polu
    // liniowym stacji kompaktowej pojawiają się WYŁĄCZNIE ze ścieżki
    // danych (`primary_devices` — świadomy wybór rozdzielnicy), nigdy z
    // konwencji.
    return ['loadBreakSwitch', 'earthSwitch', 'cableHead'];
  }
  // Domyślnie: pole liniowe WYŁĄCZNIKOWE (LINE_IN/LINE_OUT/LINE_BRANCH/
  // GPZ_LINE_BAY) — spec §12.4/§12.2: DS_szynowy → CB → CT → DS_liniowy →
  // ES → głowica kablowa. (VT)/(SA) są WARUNKOWE (§12.2, obecne wyłącznie w
  // danych) — konwencja rysuje WYŁĄCZNIE elementy bezwarunkowe.
  return ['disconnector', 'breaker', 'currentTransformer', 'disconnector', 'earthSwitch', 'cableHead'];
}

/** Gabaryt stosu symboli: szerokość = najszerszy symbol, wysokość = suma
 *  wysokości + GRID między kolejnymi (spec §3/§12, wzór F6b-1 — jedna prawda
 *  dla `layout/measure.ts` i `compose/station.ts`/`compose/gpz.ts`). */
export function stackFootprint(ids: readonly SymbolId[]): { readonly width: number; readonly height: number } {
  const width = Math.max(...ids.map((id) => SYMBOL_DEFS[id].width));
  const height = ids.reduce((sum, id, index) => sum + SYMBOL_DEFS[id].height + (index > 0 ? GRID : 0), 0);
  return { width, height };
}

/**
 * Mapowanie `BayPrimaryDeviceKind` (ENM) → `SymbolId` (spec §12.1). `null`
 * dla kindów DER (nie są aparatem pola — patrz DECYZJA w nagłówku pliku).
 */
export function symbolIdForPrimaryDeviceKind(kind: BayPrimaryDeviceKind): SymbolId | null {
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
    case 'VT':
      return 'voltageTransformer';
    case 'CABLE_HEAD':
      return 'cableHead';
    case 'TRANSFORMER_DEVICE':
      return 'transformer2W';
    case 'FUSE':
      return 'fuseSwitch';
    case 'SURGE_ARRESTER':
      // F9.6 (§12.5, V12K-028): SA WYŁĄCZNIE ze ścieżki danych — mapowanie
      // istnieje tylko tutaj, NIGDY w `apparatusSymbolsForRole` (konwencja).
      return 'surgeArrester';
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

/**
 * Rozstrzygnięcie „dane vs konwencja" (spec §12.1) — JEDNA prawda używana
 * przez `layout/measure.ts` (rezerwacja gabarytu) i `compose/station.ts`
 * (realny rysunek + znacznik `data-apparatus-source`). Gdy `bay.primaryDevices`
 * niepuste I zawiera co najmniej jeden aparat mapowalny na symbol pola (po
 * odfiltrowaniu DER-kindów) — ścieżka „dane"; inaczej fallback konwencji
 * (§12.4), source `'konwencja'`.
 */
export function resolveBayApparatusSymbolIds(
  bay: Pick<MiniBlockBayDescriptor, 'fieldRole' | 'primaryDevices'>,
): { readonly symbolIds: readonly SymbolId[]; readonly source: BayApparatusSource } {
  const devices = bay.primaryDevices;
  if (devices && devices.length > 0) {
    const ids = devices
      .map((d) => symbolIdForPrimaryDeviceKind(d.kind))
      .filter((id): id is SymbolId => id != null);
    if (ids.length > 0) return { symbolIds: ids, source: 'dane' };
  }
  return { symbolIds: apparatusSymbolsForRole(bay.fieldRole), source: 'konwencja' };
}

// ---------------------------------------------------------------------------
// F10.1 (spec §18.1/§18.2, dyrektywa D2-5, V12K-033) — podział sekwencji na
// TOR GŁÓWNY i APARATY BOCZNE. ES/VT/SA nigdy nie leżą w osi toru
// szeregowego: uziemnik/przekładnik napięciowy/ogranicznik odgałęziają się
// bocznie od węzła toru (portu S poprzedzającego aparatu szeregowego — „po
// stronie kablowej"), a tor główny pozostaje ciągły bez nich. Kolejność
// `placement` (V12K-027) nadal rządzi: pozycja odgałęzienia wynika z miejsca
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

export interface BayApparatusPlan {
  /** Aparaty szeregowe toru głównego, w kolejności sekwencji. */
  readonly mainPath: readonly SymbolId[];
  /** `mainSequenceIndices[i]` = pozycja `mainPath[i]` w oryginalnej sekwencji. */
  readonly mainSequenceIndices: readonly number[];
  readonly laterals: readonly LateralApparatusPlanEntry[];
  readonly source: BayApparatusSource;
}

/**
 * Jedna prawda podziału tor główny / aparaty boczne (measure↔compose, wzór
 * F6b-1). PRZYPADEK ZDEGENEROWANY: sekwencja złożona WYŁĄCZNIE z aparatów
 * bocznych (brak toru głównego, np. syntetyczne pole samego ES) — plan
 * zwraca je jako `mainPath` (uczciwy fallback: nie da się narysować
 * odgałęzienia bez osi; wołający może to raportować przez `missingData`).
 */
export function planApparatusSymbolIds(
  symbolIds: readonly SymbolId[],
): Omit<BayApparatusPlan, 'source'> {
  const mainPath: SymbolId[] = [];
  const mainSequenceIndices: number[] = [];
  const laterals: LateralApparatusPlanEntry[] = [];
  symbolIds.forEach((symbolId, sequenceIndex) => {
    if (LATERAL_APPARATUS_SYMBOLS.has(symbolId)) {
      laterals.push({ symbolId, afterMainIndex: mainPath.length - 1, sequenceIndex });
    } else {
      mainPath.push(symbolId);
      mainSequenceIndices.push(sequenceIndex);
    }
  });
  if (mainPath.length === 0 && laterals.length > 0) {
    return {
      mainPath: symbolIds,
      mainSequenceIndices: symbolIds.map((_, i) => i),
      laterals: [],
    };
  }
  return { mainPath, mainSequenceIndices, laterals };
}

export function planBayApparatus(
  bay: Pick<MiniBlockBayDescriptor, 'fieldRole' | 'primaryDevices'>,
): BayApparatusPlan {
  const { symbolIds, source } = resolveBayApparatusSymbolIds(bay);
  return { ...planApparatusSymbolIds(symbolIds), source };
}

/** Prześwit gałęzi bocznej od osi toru (poziomy jog) — 1×GRID (spec §2). */
export const LATERAL_BRANCH_GAP = GRID;

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
]);

/**
 * Identyfikatory PER-APARAT (spec §19.1: „Q1" wyłącznik, „Q9" odłącznik
 * szynowy, „QE1" uziemnik, „T1" transformator) — WYŁĄCZNIE dla aparatów
 * wymienionych WPROST w spec §19.1: łączniki toru (breaker/disconnector/
 * fuseSwitch → „Q"), uziemnik (earthSwitch → „QE"), transformator
 * (transformer2W → „T"). CT/VT/SA/cableHead/protectionRelay/meter NIE
 * dostają identyfikatora w tej fazie — CT ma WŁASNĄ adnotację
 * (identyfikator+przekładnia, §18.3, F10.4, POZA torem mocy), VT/SA nie mają
 * zdefiniowanej konwencji numeracji w spec §19.1 (zero zgadywania).
 *
 * F10.6 (DOMAIN, V12K-035, D1): `designations` (index-aligned do `symbolIds`)
 * niesie `BayPrimaryDevice.designation` — DANA projektowa — gdy obecna
 * (niepusty, przycięty string) dla danej pozycji, JEJ TEKST wygrywa nad
 * wyliczonym Q/QE/T (prymat danych §12.1); licznik kategorii mimo to ROŚNIE
 * (spójna numeracja pozostałych aparatów pola bez danych w tej samej
 * kategorii). Parametr opcjonalny — wywołanie BEZ niego (dawne callsite'y,
 * `layout/measure.ts`) zachowuje dokładnie poprzednie zachowanie (100%
 * konwencja). Źródło `'dane'`/`'konwencja'` per pozycja —
 * `apparatusIdentifierSources` niżej (JEDNA prawda, ta sama kategoryzacja).
 *
 * Numeracja: JEDEN licznik na kategorię (Q/QE/T) per POLE, rosnąco wg
 * pozycji w PEŁNEJ sekwencji aparatów pola (tor główny + laterale w
 * kolejności `placement`/konwencji, V12K-027) — deterministyczne, licznik
 * resetuje się na każdym polu. Zwraca tablicę index-aligned do `symbolIds`
 * (`null` dla aparatów bez identyfikatora w tej fazie).
 *
 * JEDNA prawda dla `layout/measure.ts` (`apparatusIdentifierLeftReserve` —
 * rezerwacja miejsca PO LEWEJ stosu) i `compose/station.ts`
 * (`buildBayStack` — realne etykiety t4) — wzór F6b-1/F9.3.
 */
export function apparatusIdentifiers(
  symbolIds: readonly SymbolId[],
  designations?: readonly (string | null | undefined)[],
): readonly (string | null)[] {
  let q = 0;
  let qe = 0;
  let t = 0;
  return symbolIds.map((symbolId, index) => {
    const dataDesignation = designations?.[index]?.trim() || null;
    if (Q_IDENTIFIER_SYMBOLS.has(symbolId)) {
      q += 1;
      return dataDesignation ?? `Q${q}`;
    }
    if (symbolId === 'earthSwitch') {
      qe += 1;
      return dataDesignation ?? `QE${qe}`;
    }
    if (symbolId === 'transformer2W') {
      t += 1;
      return dataDesignation ?? `T${t}`;
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
  return symbolIds.map((symbolId, index) => {
    const isIdentifiable =
      Q_IDENTIFIER_SYMBOLS.has(symbolId) || symbolId === 'earthSwitch' || symbolId === 'transformer2W';
    if (!isIdentifiable) return null;
    const dataDesignation = designations?.[index]?.trim();
    return dataDesignation ? 'dane' : 'konwencja';
  });
}

export interface BayApparatusPlanFootprint {
  /** Pełna szerokość: stos toru głównego + (jeżeli są laterale) rozszerzenie
   *  w prawo `lateralExtension`. */
  readonly width: number;
  readonly height: number;
  /** Szerokość doliczona NA PRAWO od stosu głównego na aparaty boczne
   *  (0 gdy pole ich nie ma) — measure i compose liczą z TEGO pola. */
  readonly lateralExtension: number;
  /** Gabaryt samego stosu toru głównego (oś = mainStack.width/2 od lewej —
   *  NIEZMIENIONA względem stanu sprzed F10.1: tapX/zejścia bez regresu). */
  readonly mainStack: { readonly width: number; readonly height: number };
}

/**
 * Gabaryt pola wg planu §18.1: szerokość stosu głównego + rozszerzenie
 * boczne; wysokość = max(tor główny, zwis lateralu: kotwica + wysokość
 * symbolu). Laterale współdzielące kotwicę siedzą OBOK SIEBIE w prawo
 * (kolejne `LATERAL_BRANCH_GAP + width`).
 */
export function bayApparatusPlanFootprint(
  plan: Pick<BayApparatusPlan, 'mainPath' | 'laterals'>,
): BayApparatusPlanFootprint {
  const mainStack = stackFootprint(plan.mainPath);
  if (plan.laterals.length === 0) {
    return { width: mainStack.width, height: mainStack.height, lateralExtension: 0, mainStack };
  }
  // Y kotwicy względem szczytu stosu = suma wysokości mainPath[0..i] + GRID
  // między nimi (port S aparatu `afterMainIndex`); dla -1 → 0 (port N).
  const anchorRelY = (afterMainIndex: number): number => {
    if (afterMainIndex < 0) return 0;
    let y = 0;
    for (let i = 0; i <= afterMainIndex; i++) {
      y += SYMBOL_DEFS[plan.mainPath[i]].height + (i < afterMainIndex ? GRID : 0);
    }
    return y;
  };
  const byAnchor = new Map<number, LateralApparatusPlanEntry[]>();
  for (const lat of plan.laterals) {
    if (!byAnchor.has(lat.afterMainIndex)) byAnchor.set(lat.afterMainIndex, []);
    byAnchor.get(lat.afterMainIndex)!.push(lat);
  }
  let lateralExtension = 0;
  let height = mainStack.height;
  for (const [afterMainIndex, group] of byAnchor) {
    let ext = 0;
    const aY = anchorRelY(afterMainIndex);
    for (const lat of group) {
      const def = SYMBOL_DEFS[lat.symbolId];
      ext += LATERAL_BRANCH_GAP + def.width;
      height = Math.max(height, aY + def.height);
    }
    lateralExtension = Math.max(lateralExtension, ext);
  }
  return { width: mainStack.width + lateralExtension, height, lateralExtension, mainStack };
}
