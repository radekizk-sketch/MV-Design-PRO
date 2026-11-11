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
 * Pole rezerwowe/wolne (`MiniBlockBayDescriptor.reserve`) traci głowicę kablową i kończy się
 * symbolem `bayReserve` (bez portu S — bez odejścia), §0 pkt 5.
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
import { SYMBOL_DEFS, type SymbolId } from '../symbols/defs';
import { FIELD_ROLE, orderByPrimaryPlacement, type FieldRole } from '../../v2/domain/apparatusContracts';
import type { MiniBlockBayDescriptor } from '../../v2/model/widokPolStacji';
import type { BayPrimaryDeviceKind, BayPrimaryPlacement } from '../../../../types/enm';

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
 * Aparaty pola ze ścieżki DANYCH, które dostają symbol pola — w porządku
 * fizycznym `placement` (`orderByPrimaryPlacement`, `v2/domain/apparatusContracts.ts`)
 * i bez kindów niemapowalnych (DER). JEDNA sekwencja dla `resolveBayApparatusSymbolIds`
 * (measure + plan) i `compose/station.ts` `stackItemsForBay` (rysunek + `deviceRef`),
 * więc parowanie indeksów symbol↔aparat nie zależy od tego, czy producent
 * deskryptora posortował listę (W2C-PLAN-ETYKIET: skrypt dowodowy W2c podawał
 * kolejność surową backendu i kompozycja rozkładała laterale na różne kotwice
 * we wspólnej kolumnie — „TV1" lądował na symbolu uziemnika).
 */
export function orderedSymbolPrimaryDevices<T extends { readonly kind: BayPrimaryDeviceKind; readonly placement: BayPrimaryPlacement }>(
  devices: readonly T[] | undefined,
): readonly T[] {
  if (!devices || devices.length === 0) return [];
  return orderByPrimaryPlacement(devices).filter((d) => symbolIdForPrimaryDeviceKind(d.kind) != null);
}

/**
 * Rozstrzygnięcie „dane vs brak danych" — JEDNA prawda używana przez `layout/measure.ts`
 * (rezerwacja gabarytu) i `compose/station.ts` (rysunek + `data-apparatus-source`).
 * Ścieżka danych: aparaty mapowalne na symbol pola (po odfiltrowaniu kindów DER), w porządku
 * fizycznym `orderedSymbolPrimaryDevices`, + elementy modelu pola. Brak danych:
 * `symbolePolaBezDanych`. Pole rezerwowe/wolne: bez głowicy kablowej, zakończone
 * `bayReserve` (`zakonczenieRezerwy` — jedno miejsce reguły).
 */
export function resolveBayApparatusSymbolIds(
  bay: Pick<MiniBlockBayDescriptor, 'fieldRole' | 'primaryDevices' | 'reserve' | 'transformerRef'>,
): { readonly symbolIds: readonly SymbolId[]; readonly source: BayApparatusSource } {
  const ids = orderedSymbolPrimaryDevices(bay.primaryDevices)
    .map((d) => symbolIdForPrimaryDeviceKind(d.kind))
    .filter((id): id is SymbolId => id != null);
  if (ids.length > 0) {
    return {
      symbolIds: zakonczenieRezerwy([...ids, ...elementyModeluPola(bay, ids)], bay.reserve),
      source: 'dane',
    };
  }
  return { symbolIds: zakonczenieRezerwy(symbolePolaBezDanych(bay), bay.reserve), source: 'brak' };
}

/** Pole rezerwowe/wolne: głowica kablowa i odejście nie istnieją — sekwencja traci
 *  `cableHead` i kończy się `bayReserve` (§0 pkt 5). Pozycje usuniętych głowic nie
 *  przesuwają pozostałych aparatów względem ich rekordów — wołający dopasowujący rekordy
 *  (`compose/station.ts stackItemsForBay`) filtruje TĄ SAMĄ funkcją `czyGlowicaRezerwy`. */
export function zakonczenieRezerwy(
  symbolIds: readonly SymbolId[],
  reserve: MiniBlockBayDescriptor['reserve'],
): readonly SymbolId[] {
  if (!reserve) return symbolIds;
  return [...symbolIds.filter((id) => !czyGlowicaRezerwy(id, reserve)), 'bayReserve'];
}

/** Predykat usunięcia z sekwencji pola rezerwowego — jedno źródło dla sekwencji symboli
 *  i dla dopasowania rekordów aparatów (predykaty parami). */
export function czyGlowicaRezerwy(symbolId: SymbolId, reserve: MiniBlockBayDescriptor['reserve']): boolean {
  return Boolean(reserve) && symbolId === 'cableHead';
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
  // GPZ-PARYTET cz. 3: podział tor główny / aparat boczny jako PARAMETR — rozdzielnica GPZ
  // dokłada do zbioru bocznego glif rodzaju źródła pola OZE (`compose/gpz.ts
  // jestAparatemBocznymPolaGpz`), a jej budowa stosu i zaczep trasy używają TEGO SAMEGO
  // predykatu (jedno źródło prawdy measure↔compose↔scena).
  czyBoczny: (symbolId: SymbolId) => boolean = (symbolId) => LATERAL_APPARATUS_SYMBOLS.has(symbolId),
): Omit<BayApparatusPlan, 'source'> {
  const mainPath: SymbolId[] = [];
  const mainSequenceIndices: number[] = [];
  const laterals: LateralApparatusPlanEntry[] = [];
  symbolIds.forEach((symbolId, sequenceIndex) => {
    if (czyBoczny(symbolId)) {
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
  bay: Pick<MiniBlockBayDescriptor, 'fieldRole' | 'primaryDevices' | 'reserve' | 'transformerRef'>,
): BayApparatusPlan {
  const { symbolIds, source } = resolveBayApparatusSymbolIds(bay);
  return { ...planApparatusSymbolIds(symbolIds), source };
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
  return symbolIds.map((symbolId, index) => {
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
  return symbolIds.map((symbolId, index) => {
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
      // W1b (uwaga 12): odstęp aparat–aparat z rastru kontraktowego.
      y += SYMBOL_DEFS[plan.mainPath[i]].height + (i < afterMainIndex ? APPARATUS_STACK_VERTICAL_GAP : 0);
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
