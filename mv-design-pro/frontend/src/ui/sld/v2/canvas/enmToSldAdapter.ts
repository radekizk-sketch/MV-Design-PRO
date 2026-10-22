/**
 * enmToSldAdapter — adapter danych ENM → model widoku SLD czytany przez scenę kanwy
 * v3 (`ui/sld/v3/scene/buildScene.ts`), inspektor obiektu kanwy
 * (`sld/shared/daneElementuKanwy.ts`) i drzewo hierarchii.
 *
 * Czysta, deterministyczna funkcja:
 *   buildSldDataFromSnapshot(snapshot, logicalViews, powerFlow?) → {
 *     gpzs, cableRuns, stations, topologyRuns, sources, supplyPath, powerFlow
 *   }
 *
 * Reguły:
 *  - Brak fałszywych danych: jeśli snapshot pusty → puste tablice.
 *  - Brak interpretacji fizycznej i brak geometrii: wyłącznie tożsamość, relacje
 *    i opisy z modelu. Układ rysunku liczy wyłącznie scena v3 (karta GPZ-PARYTET
 *    cz. 3 skasowała pozycje slotowe, korytarze ciągów i declutter etykiet v2,
 *    których po kasacji rendererów v2 nikt nie czytał).
 */

import type {
  BayPrimaryDevice,
  BayPrimaryDeviceKind,
  BayPrimaryPlacement,
  EnergyNetworkModel,
  LogicalViewsV1,
  Bus,
  Branch,
  Substation,
  BranchPointSN,
  Generator,
  Bay,
  ProtectionAssignment,
  Measurement,
} from '../../../../types/enm';
import { pickStationBus, stationSideBusRefs, stationSnSectionBusRefs } from '../../shared/stationBusResolution';
import { stacjaSzyn, szynaGlownaStacji, szynyStacji } from '../../../shared/szynyStacji';
import { sprzeglaMiedzySekcjami } from '../model/sprzeglaSekcji';
import { polaSnStacji, stacjaPola } from '../../../shared/polaStacji';
import { NAZWA_RODZAJU_STACJI_PL, czyPoleRezerwowe, czyPoleWolne, rodzajStacji } from '../../../shared/rodzajStacji';
import type { GpzViewModel } from '../model/widokSld';
import type { StationOnRunViewModel, StationSnSectionView } from '../model/widokSld';
import type { BayPrimaryDeviceView, BayProtectionMarkingView, CtRatingAnnotationView, MiniBlockBayDescriptor, VtMountingAnnotationView } from '../model/widokPolStacji';
import { FIELD_ROLE, type FieldRole } from '../domain/apparatusContracts';
import { stanAparatuZModelu, stanStatusuGalezi, stanyAparatowPolaZModelu } from '../model/stanAparatowPola';
import {
  derFieldRoleForGenerator,
  jedynyTransformatorPola,
  mapGenTypeToDerKind,
  rolaPolaZrodlowego,
  wytworcyWgPola,
} from '../model/polaZModelu';
import { buildSupplyPathHighlight, type SupplyPathHighlight } from './SupplyPathHighlighter';
import {
  buildPowerFlowIndex,
  type SldFlowDirection,
  type SldPowerFlowCompanion,
} from './SldPowerFlowCompanion';
import type { SldTopologyRun } from './SldTopologyContracts';
import {
  kontekstWyboruTransformatorow,
  selectStationTransformerUnits,
  type KontekstWyboruTransformatorow,
  type StationTransformerUnit,
} from '../../../network-build/stationTransformerSelection';
import { powyzejPasmaNn } from '../../../../ui2/model/pasmaNapieciowe';
import { punktyPodzialu } from '../../../shared/stanLacznika';

// =============================================================================
// Cable/line run helpers
// =============================================================================

interface CableRunRendererPropsLight {
  id: string;
  runKind: 'main_trunk' | 'branch' | 'ring' | 'loop';
  segmentKind: 'cable_sn' | 'overhead_line_sn';
  segmentRefs?: readonly string[];
  segmentPaths?: ReadonlyArray<{
    segmentRef: string;
    /** RECOVERY step 5 (connection_contract / §16): jawna TOŻSAMOŚĆ terminali
     *  tego odcinka wprost z ENM — każda renderowana krawędź jest
     *  terminal-to-terminal (busRef = szyna ENM, ownerRef = stacja właściciel);
     *  scena v3 kotwiczy końcówki w pozycjach tych terminali. */
    fromTerminal?: SegmentTerminalRef;
    toTerminal?: SegmentTerminalRef;
    /** K2b §0.4: rodzaj TEGO odcinka wprost z ENM (`Branch.type`) — kabel
     *  rysowany linią ciągłą, linia napowietrzna przerywaną (scena v3
     *  `meta.lineType`). Ciąg mieszany (kabel + linia) ma rodzaj per odcinek,
     *  nie jeden dla całego ciągu (`segmentKind` wyżej to rodzaj PIERWSZEGO). */
    segmentKind?: 'cable_sn' | 'overhead_line_sn';
  }>;
  label?: string;
  segmentLabels?: ReadonlyArray<{
    segmentRef: string;
    text: string;
    /** W3-KABLE-ETYKIETY §7/§6: STRUKTURALNE dane techniczne odcinka (nie
     *  sparsowany string) — WYŁĄCZNIE z modelu/katalogu, dla złożenia etykiety
     *  L2 w v3 (`layout/lineLabel.ts`). Brak danej = pole nieobecne (zero
     *  fabrykacji). `text` (wyżej) pozostaje L1/base dla v2. */
    technical?: {
      /** Etykieta typu z katalogu z żyły×przekrój, bez długości. */
      typeLabel: string | null;
      /** Napięcie znamionowe kabla [kV] (`voltage_rating_kv`), null gdy brak. */
      ratedVoltageKv: number | null;
      /** Długość odcinka [km] (`length_km`), null gdy brak. */
      lengthKm: number | null;
      /** Odcinek napowietrzny (rozróżnienie zakończeń §6). */
      overhead: boolean;
      /** ENM niesie złącze kablowe (mufę) na odcinku (`cable_joints` niepuste). */
      hasJoint: boolean;
    };
  }>;
  /** Czy wszystkie segmenty są pod napięciem zgodnie z `SupplyPathHighlighter`
   *  (topologia, nie fizyka). Renderer może użyć tej flagi do podświetlenia
   *  zielonym torem mocy gdy aktywny jest tryb operatorski. */
  energized?: boolean;
  /** Czy któryś z segmentów jest punktem otwartym (NMO / status='open')
   *  zgodnie z `SupplyPathHighlighter.openPointBranchRefs`. */
  containsOpenPoint?: boolean;
  /** K30-41: napięcie ciągu [kV] z `inferRunVoltageKv`. Renderer dobiera tint
   *  stroke (gdy brak per-segment variant) + rysuje voltage chip przy starcie. */
  voltageKv?: number | null;
  /** P-A POWER-FLOW TOR (one truth): per-segment direction READ from the frozen
   *  solver companion (NOT geometry). 'forward' = power flows along the ENM
   *  branch orientation (from→to, which the route is drawn in); 'reverse' =
   *  against it (OZE backfeed). Renderer flips the arrow on 'reverse'. Absent ⇒
   *  no solver companion ⇒ renderer falls back to geometric arrows. */
  segmentDirections?: Readonly<Record<string, SldFlowDirection>>;
  /** P-A: run-level direction (solver) for the representative energized segment —
   *  drives the single overview flow arrow at L0/L1 where per-segment paths are
   *  not drawn. Absent ⇒ geometric fallback. */
  flowDirection?: SldFlowDirection;
  /** P-A: per-segment energization READ from the solver companion
   *  (`energized_branch_refs`). A segment NOT solved by the solver is
   *  de-energized → renderer dims it. Absent ⇒ topology fallback (`energized`). */
  segmentEnergized?: Readonly<Record<string, boolean>>;
}

/** RECOVERY step 5: named terminal of a rendered cable segment (from ENM).
 *  Exported (SLD V3 F3, spec §16): `v3/layout/route.ts` carries this same
 *  identity through routing untouched — zero cienia modelu, jeden typ. */
export interface SegmentTerminalRef {
  /** ENM bus ref of this endpoint (the electrical node). */
  readonly busRef: string | null;
  /** Owning station ref if the bus resolves to a station; null for a GPZ/pole
   *  bus or an inline splice terminal. */
  readonly ownerRef: string | null;
}

function isCableLikeBranch(b: Branch): boolean {
  return b.type === 'cable' || b.type === 'line_overhead';
}

/**
 * Szyny migawki po refie — `ref_id` ALBO `id`, pierwsza w kolejności `snapshot.buses` (ta sama
 * semantyka co `buses.find((b) => b.ref_id === ref || b.id === ref)`), liczone RAZ na budowę.
 * Dotąd każde pytanie o napięcie albo istnienie szyny przeglądało wszystkie szyny, a pytań
 * jest tyle, ile końców gałęzi — koszt O(gałęzie × szyny), nadliniowy w rodzinie H.
 */
interface IndeksSzynMigawki {
  readonly wgRefu: ReadonlyMap<string, Bus>;
  /** Wyłącznie `ref_id` (klasyfikacja końcówki pyta tylko o tożsamość domenową). */
  readonly refIdy: ReadonlySet<string>;
}

function indeksSzynMigawki(snapshot: EnergyNetworkModel): IndeksSzynMigawki {
  const wgRefu = new Map<string, Bus>();
  const refIdy = new Set<string>();
  for (const bus of snapshot.buses ?? []) {
    refIdy.add(bus.ref_id);
    if (!wgRefu.has(bus.ref_id)) wgRefu.set(bus.ref_id, bus);
    if (typeof bus.id === 'string' && !wgRefu.has(bus.id)) wgRefu.set(bus.id, bus);
  }
  return { wgRefu, refIdy };
}

function isMediumVoltageNetworkBranch(szyny: IndeksSzynMigawki, branch: Branch): boolean {
  // W2c (POLECENIE_DER_SN_TOPOLOGIA_2026-07): gałęzie WEWNĘTRZNE toru DER-SN
  // (kabel SN od TR blokowego, `meta.der_role` obecny — W2b) NIE należą do
  // magistrali sieci: tor DER rysuje `compose/station.ts` POD polem źródłowym
  // (kabel→TR blokowy→szyna nN producenta→źródło). Bez tego wykluczenia kabel
  // od szyny nN-producenta trafiłby do projekcji ciągów liniowych jako stray
  // odcinek magistrali (zaśmiecenie topologii, reguła 4). Poprawka end-to-end —
  // dotyczy TAKŻE realnych snapshotów W2b, nie tylko fixtur testowych.
  if (typeof (branch.meta as { der_role?: unknown } | undefined)?.der_role === 'string') return false;
  const voltages = [readBusVoltageKv(szyny, branch.from_bus_ref), readBusVoltageKv(szyny, branch.to_bus_ref)]
    .filter((value): value is number => value !== null);
  if (voltages.length === 0) return true;
  return voltages.some((value) => powyzejPasmaNn(value));
}

function readBusVoltageKv(szyny: IndeksSzynMigawki, busRef: string | null | undefined): number | null {
  if (!busRef) return null;
  const bus = szyny.wgRefu.get(busRef);
  return typeof bus?.voltage_kv === 'number' ? bus.voltage_kv : null;
}

function classifySegmentKind(b: Branch): 'cable_sn' | 'overhead_line_sn' {
  return b.type === 'cable' ? 'cable_sn' : 'overhead_line_sn';
}

function stationCodeFromName(rawName: string | null | undefined, fallbackOrder: number): string {
  const name = rawName ?? '';
  const explicitCode = name.match(/\bS\d{2,3}\b/i);
  if (explicitCode) return explicitCode[0].toUpperCase();
  const stationOrdinal = name.match(/\bStacja\s+SN\/nN\s+0*(\d{1,3})\b/i)
    ?? name.match(/\bST[-\s]?0*(\d{1,3})\b/i);
  if (stationOrdinal) {
    const ordinal = Number.parseInt(stationOrdinal[1], 10);
    if (Number.isFinite(ordinal) && ordinal > 0) {
      return `S${String(ordinal).padStart(2, '0')}`;
    }
  }
  return `S${String(fallbackOrder).padStart(2, '0')}`;
}

/**
 * SLD-LOC (lokalność pionowa kotwic stacji): baza licznika fallback-numeracji
 * (`stationCodeFromName`, argument `fallbackOrder`), STABILNA i JEDNOZNACZNA
 * per ciąg (line run) / corridor — jedno źródło prawdy dla obu pętli
 * `buildStations` niżej (kluczowane WSPÓLNIE po `lr.id`/`corridor.ref_id`,
 * żeby fallback-kody ciągów z pętli 1 i „orphanów" z pętli 2 też się nie
 * powtarzały).
 *
 * PROBLEM Z LICZNIKIEM GLOBALNYM (pierwotny kod, naprawiony tą kartą): jeden
 * `stationSequence` dzielony między WSZYSTKIMI ciągami sprawiał, że
 * dopisanie stacji do ciągu A przesuwało o +1 fallback-kod KAŻDEJ później
 * przetwarzanej stacji ciągu B — naruszenie lokalności (`buildScene.
 * p1Recenzja.test.ts`, kaskada przez globalny packer pasm lateralnych:
 * dropBandHeight jednego wiersza rósł o kwant siatki, packer przesuwał W DÓŁ
 * WSZYSTKIE kolejne półki, łącznie z półkami INNEGO wiersza arkusza).
 *
 * PROBLEM Z LICZNIKIEM ZERUJĄCYM SIĘ DO 1 W KAŻDYM CIĄGU (odrzucona próba
 * pośrednia — zmierzona): lokalność odzyskana, ale jednoznaczność stracona —
 * DWA RÓŻNE ciągi, każdy z WŁASNĄ stacją bez nazwy jawnej na tej samej
 * pozycji wewnętrznej, dostawały TEN SAM fallback-kod (zmierzone:
 * `busbar_label_probe" — 53 etykiety szyn, tylko 12 unikalnych tekstów).
 *
 * PROBLEM Z BAZĄ Z HASHA (druga odrzucona próba — zmierzona): hash 32-bit
 * modulo dużej przestrzeni daje jednoznaczność, ale liczby fallback rosną do
 * 6-7 cyfr (żeby ryzyko kolizji dla rodziny H, do ~130 ciągów, zostało
 * znikome) — kod „S610001" zamiast „S51" poszerza etykietę o rząd wielkości,
 * czego routing kanałów zejść NIE był projektowany znosić: zmierzone nowe
 * zgłoszenia „kanał zejścia lateralu przecina slot etykiety przęsła" (0→8,
 * `buildScene.test.ts` „WSZYSTKIE 12 lateralów… brak zagnieżdżeń") — inny,
 * ale RÓWNIE realny defekt (routing), nie tylko dryf odcisku.
 *
 * NAPRAWA (trzecia próba — RANGA LEKSYKALNA — odrzucona empirycznie, zmierzona
 * w tej karcie): baza = ranga id ciągu w liście posortowanej LEKSYKALNIE.
 * Naprawiała lokalność I jednoznaczność (macierz `buildScene.p1Recenzja.
 * test.ts`, 9/9 `pionowe=0`), ALE zmieniała same WARTOŚCI fallback względem
 * dawnego licznika globalnego — magistrala główna tej fixtury
 * (`gpz/<hash>/corridor_01`, 12 stacji) sortuje się leksykalnie OSTATNIA
 * wśród 13 id (prefiks „gpz/" > „corridor/"), więc dostawała najwyższą rangę
 * (12) i bazę 121: kody fallback tych 12 stacji urosły z dwóch cyfr
 * („S01".."S12") do trzech („S121".."S132"). Kod fallback jest TREŚCIĄ pasma
 * nazw stacji na KAŻDYM LOD (`scene/buildScene.ts` `name: props.stationCode
 * ?? props.name`) — jeden dodatkowy znak w 12 etykietach przesunął
 * `dropBandHeight`/próg zawijania wierszy arkusza w WIELU miejscach na raz.
 * Zmierzone regresje FUNKCJONALNE (nie tylko dryf odcisku — invarianty
 * geometryczne złamane), złapane dopiero szeroką regresją `src/ui/sld/v3
 * src/ui/sld/v2 src/engine/sld-layout` (macierz L4 tej karty ich NIE łapała,
 * bo mierzy WYŁĄCZNIE Δy przy NIEZMIENIONYM podziale wierszy — nie sam fakt
 * podziału): `buildScene.sheetRows.test.ts` „S9-1 stabilność wierszy" —
 * wstawienie stacji w OSTATNIM wierszu ZMIENIŁO skład wcześniejszych wierszy
 * (5→7 stacji w wierszu 0 — dokładnie ten sam DEFEKT KLASY, który ta karta ma
 * naprawić, tyle że na poziomie PRZYPISANIA do wiersza, nie samej kotwicy);
 * `crossings.test.ts` junction_dot_probe — 21→19 węzłów z kropką (2 węzły T
 * straciły marker, zero-luk złamane); `buildScene.w3Labels.test.ts` anty-dryf
 * — etykieta przęsła powędrowała bliżej CUDZEGO kabla niż własnego. Te trzy
 * to INWARIANTY geometryczne (nie style/hashe), więc naprawa przez zmianę
 * oczekiwanej liczby byłaby MASKOWANIEM defektu (Zero-Debt pkt 5) — odrzucona.
 *
 * NAPRAWA (czwarta próba — przyjęta): baza = INDEKS ciągu w `sortedRuns`
 * (kolejność `compareLineRunsForLayout` — TA SAMA tablica, w TEJ SAMEJ
 * kolejności, w której `buildStations` już iteruje niżej), NIE ponowne
 * sortowanie leksykalne. `compareLineRunsForLayout` porządkuje WYŁĄCZNIE po
 * (a) prefiksie syntetycznym id, (b) `run_kind` (magistrala=0, odgałęzienie=1,
 * pierścień/pętla=2), (c) `id.localeCompare` jako remis w OBRĘBIE tej samej
 * kategorii (a), (b) — WSZYSTKIE trzy są WŁASNOŚCIAMI STRUKTURALNYMI ciągu,
 * ustalonymi gdy ciąg POWSTAJE, niezależnymi od tego, ILE/KTÓRE stacje ciąg
 * niesie. Dopisanie stacji do istniejącego ciągu (ogon/środek) nie rusza ani
 * jego id, ani run_kind — WIĘC NIE RUSZA JEGO INDEKSU w `sortedRuns` (ta sama
 * gwarancja lokalności co ranga leksykalna), a magistrala (run_kind=0) ZAWSZE
 * ląduje na indeksie 0 wśród ciągów niesyntetycznych — DOKŁADNIE tam, gdzie
 * stary (wadliwy) licznik globalny ją stawiał, bo też przetwarzał magistralę
 * PIERWSZĄ. Efekt: baza magistrali = 1 (jak dawniej), ZERO zmiany szerokości
 * kodu na fixturze bez edycji — potwierdzone empirycznie (patrz commit —
 * `totalVerticalSegmentLength` WRÓCIŁ do 20936/43912/43912, WSZYSTKIE 4
 * regresje wyżej ZNIKNĘŁY bez zmiany ich oczekiwanych liczb).
 *
 * STABILNOŚĆ: identyczne uzasadnienie jak przy randze leksykalnej — dopisanie
 * STACJI do istniejącego ciągu (`appendUnitToTrunk`, `insertUnitMidLateral`)
 * NIE zmienia ZBIORU ANI KOLEJNOŚCI ciągów w `sortedRuns`, więc INDEKS
 * (a więc baza) KAŻDEGO ciągu jest bit-identyczny przed i po — zero kaskady,
 * zweryfikowane testem (`buildScene.p1Recenzja.test.ts`, macierz lokalności,
 * 9/9 kombinacji topologia×edycja: `pionowe=0`) ORAZ szeroką regresją
 * `src/ui/sld/v3 src/ui/sld/v2 src/engine/sld-layout` (zero regresji poza
 * tą kartą — patrz meldunek).
 *
 * RYZYKO SZCZĄTKOWE (świadomie przyjęte, udokumentowane liczbą — reguła
 * KLASA §4, nie cicha deklaracja): DOPISANIE CAŁEGO NOWEGO ciągu (trzeci typ
 * edycji tej karty, `appendLateralBranch`) może wsunąć się w `sortedRuns`
 * PRZED istniejący ciąg (ten sam `run_kind`, mniejszy id leksykalnie),
 * przesuwając JEGO indeks o +1 — to NIE jest kaskada (dotyczy TYLKO ciągów
 * sortujących się PO nowym W TEJ SAMEJ kategorii run_kind, każdego o
 * DOKŁADNIE +1, nie łańcuchowo rosnąco jak w liczniku globalnym) i NIE
 * zmienia liczby cyfr kodu, chyba że indeks akurat mija wielokrotność 10 —
 * warunkowe, rzadkie wystąpienie tej samej klasy, nie gwarantowane jak w
 * naprawionym liczniku globalnym. Usunięcie GO całkowicie wymagałoby albo
 * numerów jak w odrzuconej próbie hasha (psuje routing, wyżej), albo
 * globalnego rejestru stanu między budowami (poza zakresem — ta funkcja jest
 * czystym przeliczeniem PER BUDOWA, zero pamięci między wywołaniami, zgodnie
 * z resztą tego adaptera). Zmierzone na macierzy tej karty: WSZYSTKIE 9
 * kombinacji (w tym 3× „+1 odgałęzienie") dają `pionowe=0`.
 *
 * ROZMIAR BLOKU — TRZY WARIANTY ZMIERZONE, JEDEN PRZYJĘTY ŚWIADOMIE Z
 * NAZWANYM RYZYKIEM SZCZĄTKOWYM (Zero-Debt + reguła KLASA §4 — deklaracja
 * BEZ testu jest fałszywą pewnością, więc żaden z poniższych wariantów nie
 * jest ogłoszony „idealny" bez pełnej regresji, która to potwierdza):
 *
 * (i) STAŁA MAŁA `FALLBACK_BLOCK=10` (pierwsza wersja) zakładała w
 * milczeniu, że ŻADEN ciąg nie ma więcej niż 10 stacji — fałsz na tej samej
 * fixturze (magistrala niesie 12: T1..T12). Baza ciągu o randze 1 (=11)
 * leżała WEWNĄTRZ zakresu ciągu o randze 0 (1..12), więc DWIE PARY stacji
 * dostawały TEN SAM kod fallback (`busbar_label_probe`: 53 etykiety, 51
 * unikalnych — jednoznaczność złamana, nie tylko dryf odcisku). ODRZUCONA.
 *
 * (ii) `Math.max` liczby stacji w JEDNYM ciągu/corridorze TEJ KONKRETNEJ
 * sieci (przyjęta OSTATECZNIE, patrz niżej) — jednoznaczność gwarantowana Z
 * KONSTRUKCJI (żaden ciąg fizycznie nie ma więcej stacji niż sam niesie),
 * ale jest CONTENT-DEPENDENT: dopisanie stacji do NAJLICZNIEJSZEGO ciągu tej
 * sieci (magistrala, ta karta, `appendUnitToTrunk`) podnosi `Math.max`, więc
 * PRZESUWA BAZY WSZYSTKICH POZOSTAŁYCH ciągów o ich rangę — tej samej klasy
 * defekt co pierwotny licznik globalny, na innym parametrze. Zmierzone
 * NAZWANE ryzyko szczątkowe: `buildScene.sheetRows.test.ts` „S9-1 stabilność
 * wierszy" — skład wiersza 0 (NIE dotyczącego edytowanego ciągu) różni się
 * między sceną PRZED i PO dopisaniu stacji do ogona magistrali, mimo że
 * liczba wierszy arkusza się nie zmienia (przypadek, który kryterium karty
 * S9-1 explicite miało pokrywać).
 *
 * (iii) STAŁA DUŻA `FALLBACK_BLOCK=1000` (trzecia próba, dowiedziona
 * pomiarem rodziny H — `synthLargeTrunk` dokleja kopie NA OGON TEJ SAMEJ
 * magistrali: zmierzone rozmiary największego ciągu 12/24/60/120 stacji dla
 * 1×/2×/5×/10× kopii, 1000 to margines >8×) — NIEZALEŻNA od treści, więc
 * BEZ ryzyka (ii). ODRZUCONA MIMO TO: szerokość kodu ciągów o randze≥1 (4
 * cyfry zamiast 2) okazała się SZERSZYM defektem niż wąskie ryzyko (ii) —
 * łamie WSZYSTKIE TRZY niezależne geometryczne niezmienniki spoza kart tej
 * naprawy naraz (`crossings.test.ts` junction_dot_probe 21→19,
 * `buildScene.w3Labels.test.ts` anty-dryf, `obszarBezpieczny.contract.
 * test.tsx` inset), PLUS ponownie sheetRows S9-1, PLUS `pionowe=4` (zamiast
 * 0) w macierzy L4 tej karty dla „+1 odgałęzienie" — regresja WIĘKSZA niż
 * (ii), nie mniejsza. RANGA 0 (magistrala, zawsze przetwarzana pierwsza w
 * `sortedRuns`) dostaje bazę=1 NIEZALEŻNIE od rozmiaru bloku (`rank×BLOK+1`
 * z `rank=0` daje 1 zawsze) — więc rozmiar bloku wpływa WYŁĄCZNIE na
 * szerokość kodów ciągów PO magistrali, i TO WŁAŚNIE ta szerokość (nie
 * niestabilność rangi) jest tu dominującym źródłem regresji geometrycznej.
 *
 * DECYZJA: (ii) — `Math.max` policzony PER BUDOWA (patrz wywołanie niżej).
 * Jedyny z trzech wariantów, który na PEŁNEJ regresji tego katalogu testów
 * nie psuje ŻADNEGO z trzech niezależnych niezmienników geometrycznych
 * spoza kart tej naprawy i spełnia WSZYSTKIE 9 kombinacji macierzy L4 tej
 * karty (`pionowe=0`) — kosztem JEDNEGO, nazwanego po imieniu ryzyka
 * szczątkowego (sheetRows S9-1, opisane wyżej), nienaprawialnego w tej
 * sesji bez sięgnięcia w globalny packer pasm (`createLateralShelfPacker`,
 * poza zakresem numeracji stacji — patrz meldunek karty, „dług otwarty").
 */
/**
 * Baza fallback dla każdego id z `orderedIds`, RANGA = POZYCJA W TEJ TABLICY
 * (NIE ponowne sortowanie — kolejność jest już ustalona przez wywołującego,
 * patrz docstring wyżej: `sortedRuns`' `compareLineRunsForLayout` dla
 * ciągów, leksykalnie dla corridorów). Duplikat id (ten sam string w obu
 * źródłach — możliwe, gdy corridor i zsynchronizowany z niego ciąg dzielą
 * `ref_id`) dostaje bazę z PIERWSZEGO wystąpienia — nieszkodliwe: `placed`
 * w `buildStations` gwarantuje, że druga pętla nigdy nie konsumuje stacji
 * już umieszczonej przez pierwszą, więc współdzielona baza nigdy nie
 * generuje kolizji kodów w PRAKTYCE (zero stacji korzysta z obu baz naraz).
 * `blockSize`: MUSI być >= liczbie stacji NAJWIĘKSZEGO ciągu/corridora tej
 * sieci (dowód wywołującego, nie tej funkcji — patrz wywołanie niżej) —
 * inaczej sekwencja jednego ciągu wchodzi w zakres bazy następnego (zmierzony
 * defekt, patrz docstring wyżej).
 */
function fallbackSequenceBaseByRunId(
  orderedIds: readonly string[],
  blockSize: number,
): ReadonlyMap<string, number> {
  const bases = new Map<string, number>();
  let rank = 0;
  for (const id of orderedIds) {
    if (bases.has(id)) continue;
    bases.set(id, rank * blockSize + 1);
    rank += 1;
  }
  return bases;
}

/**
 * K30-58: normalizacja station name z OSD-grade Polish terminology.
 * K30 seed używa ad-hoc nazw "Stacja inline" / "Stacja terminal" które są
 * nieprzyjęte w praktyce OSD. Konwertujemy do nazw stosowanych przez OSD
 * (rodzaj stacji po polsku: przelotowa, końcowa, odgałęźna, sekcyjna).
 */
function normalizeStationName(rawName: string | null | undefined, fallback: string): string {
  const name = (rawName ?? '').trim();
  if (!name) return fallback;
  // Replace ad-hoc "Stacja inline/terminal/branch/sectional" z OSD-compliant
  return name
    .replace(/^Stacja\s+inline\b/iu, 'Stacja przelotowa SN/nN')
    .replace(/^Stacja\s+terminal\b/iu, 'Stacja końcowa SN/nN')
    .replace(/^Stacja\s+branch\b/iu, 'Stacja odgałęźna SN/nN')
    .replace(/^Stacja\s+sectional\b/iu, 'Stacja sekcyjna SN/nN');
}

// =============================================================================
// Adapter result shape
// =============================================================================

export interface SldDataPayload {
  readonly gpzs: GpzViewModel[];
  readonly cableRuns: CableRunRendererPropsLight[];
  readonly stations: StationOnRunViewModel[];
  readonly topologyRuns: readonly SldTopologyRun[];
  /** Wynik `SupplyPathHighlighter` — czysta topologia operatorska (bez fizyki);
   *  flaga `energized` na poziomie cableRuns / stations. */
  readonly supplyPath: SupplyPathHighlight;
  /** P-A: header for the active power-flow case (state declaration shown on the
   *  canvas). Present iff a frozen-solver companion was supplied to
   *  `buildSldDataFromSnapshot`; the per-segment direction/energization on
   *  `cableRuns`/`stations` then come from THAT solver result (one truth). */
  readonly powerFlow: SldPowerFlowCaseHeader | null;
  /** F9.2 (SLD_CAD_SPEC_V3 §13.1): wszystkie widoczne źródła sieci — sieć
   *  zewnętrzna (`Source` ENM, każdy `model` reprezentuje równanie
   *  zastępcze zasilania zewnętrznego) + DER (`Generator` PV/BESS/wind/
   *  generator synchroniczny). Nie zawiera GPZ jako odrębnej pozycji — GPZ
   *  (kontener rozdzielni) jest już widoczny przez `gpzs`; ten widok
   *  wylicza POJEDYNCZE elementy źródłowe ENM. Patrz `buildSources()`.
   *  Zawsze wypełnione (możliwe `[]`). */
  readonly sources: readonly SldSourceView[];
}

/**
 * F9.2 (SLD_CAD_SPEC_V3 §13.1/§13.2) — jedno widoczne źródło sieci.
 * Projekcja WYŁĄCZNIE z danych ENM (`Source`, `Generator`) — zero zgadywania.
 */
export interface SldSourceView {
  readonly id: string;
  /** F8b-1 (f92-2, SLD_CAD_REBUILD_PLAN_V3.md §F9.2 konsekwencja): `'unknown'`
   *  dodany dla `Generator.gen_type` nierozpoznanego/`null` — WCZEŚNIEJ
   *  taki generator był CICHO wykluczany z listy (`buildSources` filtrował
   *  `null`), co naruszało „źródło nieznanego typu NIE może zginąć bez
   *  śladu" (patrz `missingData` niżej). Zero zgadywania: `'unknown'` nie
   *  jest fabrykacją realnego rodzaju, tylko jego HONEST brakiem. */
  readonly kind: 'external_grid' | 'pv' | 'bess' | 'generator' | 'wind' | 'unknown';
  /** Punkt przyłączenia — bus (Source) albo stacja/pole (Generator), wg tego,
   *  co ENM faktycznie niesie dla danego elementu. */
  readonly connectionRef: string;
  /** Moc znamionowa [MW], gdy ENM ją niesie. `Source` (zastępcze zasilanie
   *  zewnętrzne) NIE ma mocy znamionowej w ENM — tylko moc/prąd zwarciowy
   *  (Sk''/Ik''), co jest INNĄ wielkością fizyczną; dlatego zawsze `undefined`
   *  dla `kind='external_grid'` (żadna wartość SC nie jest tu podstawiana). */
  readonly ratedPower?: number | null;
  /** Stan operacyjny źródła (§13.3). F11.3 (finał F9.6b): dla DER czytany z
   *  REALNEGO kanału `Generator.meta['operating_mode']` (zapis: operacja
   *  domenowa `set_source_operating_mode`, backend `domain_operations_v2.py`;
   *  odczyt read-modelu: `field_read_model._generator_operating_mode`) przez
   *  UDOKUMENTOWANĄ regułę `OPERATING_MODE_TO_SOURCE_STATE` (spec §13.3 —
   *  reguła białoskrzynkowa, nie heurystyka). Brak/wartość spoza słownika ⇒
   *  `undefined` (uczciwy brak — ZERO nakładki, zero zgadywania).
   *  `maintenance`/`fault` NIE są wywodliwe z tego kanału (ENM nie niesie
   *  serwisu/awarii na poziomie źródła — ustalenie 8 audytu
   *  `SLD_POWER_PATH_AUDIT_2026-07.md` pozostaje w mocy dla tych dwóch) —
   *  literały zostają w unii jako kontrakt §13.3, dziś nigdy nie nadawane.
   *  `Source` (sieć zewnętrzna) nie ma trybu pracy w ENM ⇒ zawsze `undefined`. */
  readonly operationalState?: 'energized' | 'standby' | 'disconnected' | 'maintenance' | 'fault';
  /** F8b-1 (f92-2): `true`, gdy ten wpis reprezentuje dane niekompletne
   *  (dziś: `kind='unknown'` — `Generator.gen_type` nierozpoznany/`null`).
   *  Ta sama konwencja nazwy co `StationOnRunViewModel.missingData`. */
  readonly missingData?: boolean;
  /** GS-4 (`GRAMATYKA_MINI_RMU_2026-07.md`, recenzja 2026-07-23): strona
   *  przyłączenia DER względem transformatora stacji, z REALNEJ szyny ENM
   *  (`Generator.bus_ref` → `Bus.voltage_kv`): >0,5 kV ⇒ `'sn'` (pole SN),
   *  0<U≤0,5 kV ⇒ `'nn'` (źródło ZA transformatorem, strona nN), brak
   *  szyny/napięcia ⇒ `'unknown'` (uczciwy brak — NIGDY zgadywanie strony).
   *  Próg 0,5 kV = ISTNIEJĄCA konwencja klasyfikacji szyn nN stacji (K30-37 /
   *  recenzja NO-GO 2026-07-17 pkt 6, `buildStationProps`) — jedna reguła,
   *  nie nowa heurystyka. Nadawane WYŁĄCZNIE dla DER (`Generator`);
   *  `external_grid` nie niesie tego pola (zasilanie sieciowe nie jest DER
   *  stacji — pozycjonuje je `compose/gpz.ts`). */
  readonly connectionSide?: 'sn' | 'nn' | 'unknown';
  /** GEOMETRIA-STACJI (Z-03): sekcja (szyna główna) stacji `connectionRef`, na której
   *  leży szyna przyłączenia źródła (`szynaGlownaStacji(Generator.bus_ref)`); brak =
   *  sekcja nieustalona. Nadawane WYŁĄCZNIE dla DER. */
  readonly sectionBusRef?: string;
  /** W2c (POLECENIE_DER_SN_TOPOLOGIA_2026-07): kompletny tor DER przyłączonego
   *  po stronie SN zmaterializowany jako REALNE elementy ENM (W2b). Obecny
   *  WYŁĄCZNIE, gdy `Generator.connection_variant==='block_transformer'` ∧
   *  `blocking_transformer_ref` (tor z TR blokowym); `undefined` dla źródeł bez
   *  toru (nn / stare dane / generator synchroniczny WPROST na SN, przypadek 4).
   *  Struktura LUSTRZANA `StationDerSourceInput.chain` (v3 `compose/sourceKind`,
   *  celowo BEZ importu v3 do v2 — wzór `connectionSide`; parytet strukturalny
   *  pilnuje `scene/buildScene.ts` przy projekcji na `StationDerSourceInput`). */
  readonly derChain?: SldDerSnChain;
}

/** W2c: tor DER-SN — LUSTRO `DerSnChain` (v3 `compose/sourceKind.ts`), bez
 *  importu v3 do v2 (wzór `connectionSide`). Projekcja z REALNYCH elementów
 *  ENM: TR blokowy (rola `TRANSFORMATOR_BLOKOWY_DER`), szyna nN producenta
 *  (`der_role==='producer_lv_bus'`), kabel SN, pole źródłowe SN. */
export interface SldDerSnChain {
  readonly mvFieldRef: string;
  readonly blockTransformer: {
    readonly ref: string;
    readonly role: string;
    readonly primaryVoltageKv?: number;
    readonly secondaryVoltageKv?: number;
    readonly vectorGroup?: string | null;
  };
  readonly producerLvBus: {
    readonly ref: string;
    readonly voltageKv?: number;
    readonly lvSwitchgearVariant?: string;
  };
  readonly cableRef?: string;
  readonly unitCount?: number;
}

export interface SldPowerFlowCaseHeader {
  readonly caseRef: string;
  readonly caseLabel: string;
  readonly converged: boolean;
  readonly enmHash: string;
}

const EMPTY_SUPPLY_PATH_FROZEN: SupplyPathHighlight = Object.freeze({
  energizedBusRefs: Object.freeze([]) as readonly string[],
  energizedBranchRefs: Object.freeze([]) as readonly string[],
  energizedTransformerRefs: Object.freeze([]) as readonly string[],
  openPointBranchRefs: Object.freeze([]) as readonly string[],
  energizedSubstationRefs: Object.freeze([]) as readonly string[],
  energizedGeneratorRefs: Object.freeze([]) as readonly string[],
  sourceRefs: Object.freeze([]) as readonly string[],
});

const EMPTY_SLD_DATA: SldDataPayload = Object.freeze({
  gpzs: [],
  cableRuns: [],
  stations: [],
  topologyRuns: [],
  supplyPath: EMPTY_SUPPLY_PATH_FROZEN,
  powerFlow: null,
  sources: [],
});

// =============================================================================
// Punkty otwarte (NMO / otwarty łącznik sekcyjny) na ciągach
// =============================================================================

/**
 * Ciągi, na których leży punkt otwarty z `open_point_branch_refs` (łącznik otwarty /
 * NMO): ciąg, którego odcinek JEST tym punktem, albo ciąg odcinka dochodzącego do węzła
 * łącznika (strona zasilająca ma pierwszeństwo przed stroną odchodzącą). Rzutowanie
 * relacji odcinek↔węzeł z ENM, bez geometrii; deterministyczne (posortowane refy,
 * kolejność ciągów).
 */
function buildOpenPointRunIds(
  snapshot: EnergyNetworkModel,
  openPointSet: ReadonlySet<string>,
  cableRuns: readonly CableRunRendererPropsLight[],
): ReadonlySet<string> {
  const runIds = new Set<string>();
  if (openPointSet.size === 0) return runIds;
  const branchByRef = new Map((snapshot.branches ?? []).map((b) => [b.ref_id, b]));
  for (const openRef of [...openPointSet].sort((a, b) => a.localeCompare(b))) {
    const openBranch = branchByRef.get(openRef);
    const busNodes = new Set<string>(
      [openBranch?.from_bus_ref, openBranch?.to_bus_ref].filter(
        (ref): ref is string => typeof ref === 'string' && ref.length > 0,
      ),
    );
    let runId: string | null = null;
    for (const run of cableRuns) {
      for (const segmentRef of run.segmentRefs ?? []) {
        if (segmentRef === openRef) {
          runId = run.id;
          continue;
        }
        if (busNodes.size === 0) continue;
        const segBranch = branchByRef.get(segmentRef);
        if (!segBranch) continue;
        if (segBranch.to_bus_ref && busNodes.has(segBranch.to_bus_ref)) runId = run.id;
        if (segBranch.from_bus_ref && busNodes.has(segBranch.from_bus_ref) && runId === null) {
          runId = run.id;
        }
      }
    }
    if (runId !== null) runIds.add(runId);
  }
  return runIds;
}

// =============================================================================
// Main builder
// =============================================================================

export function buildSldDataFromSnapshot(
  snapshot: EnergyNetworkModel | null,
  logicalViews: LogicalViewsV1 | null,
  powerFlow?: SldPowerFlowCompanion | null,
): SldDataPayload {
  if (!snapshot) return EMPTY_SLD_DATA;

  const gpzs = buildGpzs(snapshot);
  const stations = buildStations(snapshot);
  const cableRuns = buildCableRuns(snapshot, logicalViews, stations);

  const sources = buildSources(snapshot);
  const supplyPath = buildSupplyPathHighlight(snapshot);
  const topologyRuns = buildSldTopologyRuns(snapshot);

  // P-A POWER-FLOW TOR — ONE TRUTH. When a frozen-solver companion is supplied,
  // energization + per-segment direction are READ from the solver result (the SLD
  // is a projection of the math model). Without a companion, fall back to the
  // topology-only `SupplyPathHighlighter` (no direction) — pre-P-A behaviour.
  const pfIndex = buildPowerFlowIndex(powerFlow ?? null);

  const energizedBranchSet = new Set(supplyPath.energizedBranchRefs);
  const openPointSet = pfIndex
    ? new Set(powerFlow?.open_point_branch_refs ?? [])
    : new Set(supplyPath.openPointBranchRefs);

  const openPointRunIds = buildOpenPointRunIds(snapshot, openPointSet, cableRuns);

  const cableRunsAnnotated = cableRuns.map((run) => {
    const runHasOpenPoint = openPointRunIds.has(run.id);
    const refs = run.segmentRefs ?? [];
    if (refs.length === 0) {
      return runHasOpenPoint ? { ...run, containsOpenPoint: true } : run;
    }
    if (pfIndex) {
      // Solver-driven: per-segment energization + direction, READ (not computed).
      const segmentEnergized: Record<string, boolean> = {};
      const segmentDirections: Record<string, SldFlowDirection> = {};
      for (const ref of refs) {
        segmentEnergized[ref] = pfIndex.isBranchEnergized(ref);
        segmentDirections[ref] = pfIndex.directionOf(ref);
      }
      const allEnergized = refs.every((ref) => segmentEnergized[ref]);
      const anyOpenPoint = runHasOpenPoint || refs.some((ref) => openPointSet.has(ref));
      // Run-level arrow uses the first energized segment that carries a real
      // (non-zero) direction; this is the representative flow at L0/L1.
      const representative =
        refs.find((ref) => segmentDirections[ref] === 'forward' || segmentDirections[ref] === 'reverse');
      const flowDirection: SldFlowDirection = representative
        ? segmentDirections[representative]
        : 'none';
      return {
        ...run,
        energized: allEnergized,
        containsOpenPoint: anyOpenPoint,
        segmentEnergized,
        segmentDirections,
        flowDirection,
      };
    }
    // Topology fallback (no solver companion).
    const allEnergized = refs.every((ref) => energizedBranchSet.has(ref));
    const anyOpenPoint = runHasOpenPoint || refs.some((ref) => openPointSet.has(ref));
    return {
      ...run,
      energized: allEnergized,
      containsOpenPoint: anyOpenPoint,
    };
  });

  // Per-station energization from the solver (SN bus in the slack island).
  const stacjaWgRefu = new Map<string, Substation>();
  for (const candidate of snapshot.substations ?? []) {
    if (!stacjaWgRefu.has(candidate.ref_id)) stacjaWgRefu.set(candidate.ref_id, candidate);
  }
  const stationsAnnotated = pfIndex
    ? stations.map((station) => ({
        ...station,
        energized: stationEnergizedFromSolver(snapshot, stacjaWgRefu.get(station.id), pfIndex),
      }))
    : stations;

  return {
    gpzs,
    cableRuns: cableRunsAnnotated,
    stations: stationsAnnotated,
    sources,
    topologyRuns,
    supplyPath,
    powerFlow: powerFlow
      ? {
          caseRef: powerFlow.case_ref,
          caseLabel: powerFlow.case_label,
          converged: powerFlow.converged,
          enmHash: powerFlow.enm_hash,
        }
      : null,
  };
}

/** Stacja pod napięciem wg towarzysza solvera (jedna prawda): KTÓRAKOLWIEK szyna stacji
 *  w wyspie bilansującej. Szyny stacji z jednego lustra `szynyStacji` (SZYNY-STACJI-LUSTRO:
 *  szyny główne, zaciski pól SN, końce aparatów pól nN) — nie z wzorca nazwy
 *  `stn/<hash>/sn_bus`, który pomijał stacje o innej gramatyce refów i zaciski pól. */
function stationEnergizedFromSolver(
  snapshot: EnergyNetworkModel,
  station: Substation | undefined,
  pfIndex: ReturnType<typeof buildPowerFlowIndex>,
): boolean {
  if (!pfIndex) return true;
  const szyny = station ? [...szynyStacji(snapshot, station)] : [];
  return szyny.some((busRef) => pfIndex.isBusEnergized(busRef));
}

function buildSldTopologyRuns(snapshot: EnergyNetworkModel): readonly SldTopologyRun[] {
  const fieldStationByRef = collectFieldStationByRef(snapshot);
  return buildTopologyRuns(buildSldLineRunsForLayout(snapshot, fieldStationByRef));
}

function buildTopologyRuns(lineRuns: readonly SldLineRunForLayout[]): readonly SldTopologyRun[] {
  return lineRuns
    .slice()
    .sort(compareLineRunsForLayout)
    .map((run) => ({
      id: run.id,
      kind: run.run_kind,
      lineName: rawTopologyRunLineName(run),
      parentRunRef: run.parent_run_ref ?? null,
      branchOriginStationRef: run.branch_origin_station_ref ?? null,
      nopStationRef: run.nop_station_ref ?? null,
      startingBayRef: run.starting_bay_ref ?? null,
      startingPortRef: run.starting_port_ref ?? null,
      stationRefs: run.stations
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((station) => station.substation_ref),
    }) satisfies SldTopologyRun);
}

/**
 * F10.2 (SLD_CAD_SPEC_V3 §19.2, D2): `LineRun.name` SUROWY. Zwraca `null`, gdy dana nieobecna LUB
 * wygląda na ref/hash programistyczny (nie czytelną nazwę) — ŻADNEJ
 * syntezy fallbacku, bo podpis pola liniowego (§19.2) MUSI odróżnić „mam
 * realną nazwę linii" od „nie mam" (degradacja do samego kierunku, zero
 * fabrykacji numeru).
 */
function rawTopologyRunLineName(run: SldLineRunForLayout): string | null {
  const raw = typeof run.name === 'string' ? run.name.trim() : '';
  if (!raw) return null;
  if (/^(seg|ref|hash)\//i.test(raw)) return null;
  if (/[a-f0-9]{24,}/i.test(raw)) return null;
  return raw;
}

/**
 * Wyszukiwania końcówek gałęzi migawki, liczone RAZ na budowę (wiązania końcówek, końce
 * ciągów): szyny po refie, stacja szyny (lustro `stacjaSzyn`), stacja po refie, punkt
 * rozgałęzienia po szynie, szyny i gałęzie pod prefiksem refu pola (zacisk pola
 * `origin_bay_ref/…`) oraz odcinki SN przy szynie. Każde pole zachowuje semantykę
 * dawnego przeglądu tablicy (pierwszy element w kolejności migawki); dotąd każda końcówka
 * przeglądała całe tablice — koszt O(gałęzie × migawka).
 */
interface IndeksKoncowek {
  readonly szyny: IndeksSzynMigawki;
  readonly stacjaSzyny: ReadonlyMap<string, string>;
  readonly stacjaWgRefu: ReadonlyMap<string, Substation>;
  readonly punktRozgalezieniaWgSzyny: ReadonlyMap<string, BranchPointSN>;
  /** `X` → szyny, których `ref_id` albo `id` zaczyna się od `X/` (kolejność migawki). */
  readonly szynyPodPrefiksem: ReadonlyMap<string, readonly Bus[]>;
  /** `X` → gałęzie, których `ref_id` albo `id` zaczyna się od `X/` (kolejność migawki). */
  readonly galeziePodPrefiksem: ReadonlyMap<string, readonly Branch[]>;
  /** Szyna → odcinki kablowe/napowietrzne sieci SN dotykające jej (kolejność migawki). */
  readonly odcinkiSnPrzySzynie: ReadonlyMap<string, readonly Branch[]>;
}

/** Prefiksy `X` napisu `s`, dla których `s.startsWith(X + '/')`. Migawka bez `id` elementu
 *  (modele zapisane bez identyfikatora technicznego) nie wnosi prefiksów z `id`. */
function prefiksyPrzedUkosnikiem(s: string | null | undefined, wynik: Set<string>): void {
  if (typeof s !== 'string') return;
  for (let i = s.indexOf('/'); i >= 0; i = s.indexOf('/', i + 1)) wynik.add(s.slice(0, i));
}

function indeksPodPrefiksem<T extends { readonly ref_id: string; readonly id?: string | null }>(
  elementy: readonly T[],
): Map<string, T[]> {
  const wynik = new Map<string, T[]>();
  for (const element of elementy) {
    const prefiksy = new Set<string>();
    prefiksyPrzedUkosnikiem(element.ref_id, prefiksy);
    prefiksyPrzedUkosnikiem(element.id, prefiksy);
    for (const prefiks of prefiksy) {
      const lista = wynik.get(prefiks);
      if (lista) lista.push(element);
      else wynik.set(prefiks, [element]);
    }
  }
  return wynik;
}

function indeksKoncowek(snapshot: EnergyNetworkModel): IndeksKoncowek {
  const szyny = indeksSzynMigawki(snapshot);
  const stacjaWgRefu = new Map<string, Substation>();
  for (const stacja of snapshot.substations ?? []) {
    if (!stacjaWgRefu.has(stacja.ref_id)) stacjaWgRefu.set(stacja.ref_id, stacja);
  }
  const punktRozgalezieniaWgSzyny = new Map<string, BranchPointSN>();
  for (const punkt of snapshot.branch_points ?? []) {
    if (!punktRozgalezieniaWgSzyny.has(punkt.bus_ref)) punktRozgalezieniaWgSzyny.set(punkt.bus_ref, punkt);
  }
  const odcinkiSnPrzySzynie = new Map<string, Branch[]>();
  for (const galaz of snapshot.branches ?? []) {
    if (!isCableLikeBranch(galaz) || !isMediumVoltageNetworkBranch(szyny, galaz)) continue;
    for (const szyna of new Set([galaz.from_bus_ref, galaz.to_bus_ref])) {
      const lista = odcinkiSnPrzySzynie.get(szyna);
      if (lista) lista.push(galaz);
      else odcinkiSnPrzySzynie.set(szyna, [galaz]);
    }
  }
  return {
    szyny,
    stacjaSzyny: stacjaSzyn(snapshot),
    stacjaWgRefu,
    punktRozgalezieniaWgSzyny,
    szynyPodPrefiksem: indeksPodPrefiksem(snapshot.buses ?? []),
    galeziePodPrefiksem: indeksPodPrefiksem(snapshot.branches ?? []),
    odcinkiSnPrzySzynie,
  };
}

// -----------------------------------------------------------------------------
// GPZ
// -----------------------------------------------------------------------------

function buildGpzs(snapshot: EnergyNetworkModel): GpzViewModel[] {
  // GPZ-PARYTET cz. 2–3: scena v3 czyta z tej listy wyłącznie tożsamość GPZ
  // (`buildCanonicalGpzProps(snapshot, gpz.id)` w `v3/scene/buildScene.ts` — rozdzielnię
  // składa kanoniczny adapter `enmToCanonicalGpzAdapter.ts`).
  return (snapshot.substations ?? [])
    .filter((s) => s.station_type === 'gpz')
    .map((gpz) => ({ id: gpz.ref_id }));
}

function readCatalogTypeLabel(branch: Branch): string | undefined {
  const materialized = readBranchCatalogData(branch);
  if (materialized && typeof materialized === 'object') {
    for (const key of [
      'type_designation',
      'type_label',
      'trade_name',
      'catalog_label',
      'display_name',
      'designation',
      'name',
      'catalog_item_id',
    ]) {
      const raw = materialized[key];
      if (typeof raw === 'string' && raw.trim()) {
        return formatCatalogTypeLabel(raw, materialized);
      }
    }
  }
  return typeof branch.catalog_ref === 'string' && branch.catalog_ref.trim()
    ? formatCatalogTypeLabel(branch.catalog_ref, materialized)
    : undefined;
}

function readBranchCatalogData(branch: Branch): Record<string, unknown> | null {
  const materialized = branch.materialized_params && typeof branch.materialized_params === 'object'
    ? { ...branch.materialized_params }
    : {};
  if (branch.type === 'cable') {
    for (const key of [
      'return_conductor_cross_section_mm2',
      'return_conductor_material',
      'return_conductor_r_ohm_per_km_20c',
      'return_conductor_jth_1s_a_per_mm2',
      'return_conductor_ith_1s_a',
      'cross_section_mm2',
      'number_of_cores',
      'conductor_material',
    ] as const) {
      const value = branch[key];
      if (value !== null && value !== undefined) materialized[key] = value;
    }
  }
  return Object.keys(materialized).length > 0 ? materialized : null;
}

function formatCatalogTypeLabel(
  raw: string,
  materialized?: Record<string, unknown> | null,
): string {
  const value = raw.trim();
  const overheadLineLabel = formatOverheadLineCatalogLabel(value, materialized);
  if (overheadLineLabel) return overheadLineLabel;
  const canonicalCable = value.match(/^cable-base-(xlpe|epr)-(al|cu)-([13])c-(\d+)$/i);
  if (canonicalCable) {
    const [, insulation, conductor, cores, section] = canonicalCable;
    const phaseSet = cores === '1' ? `3×1×${section}` : `3×${section}`;
    return `Kabel SN ${insulation.toUpperCase()} ${conductor.toLowerCase() === 'cu' ? 'Cu' : 'Al'} ${phaseSet} mm²`;
  }
  const publicTypeLabelPattern = /^[\p{L}0-9][\p{L}0-9/ .-]{2,}$/u;
  if (
    publicTypeLabelPattern.test(value)
    && !value.includes(':')
    && !/^cable-/i.test(value)
    && !/^line-/i.test(value)
  ) {
    return formatSingleCoreMvCableCircuitLabel(value, materialized);
  }
  const directTypePattern = /^[A-Z0-9ĄĆĘŁŃÓŚŹŻ][A-Z0-9ĄĆĘŁŃÓŚŹŻ/ .-]{2,}$/u;
  if (directTypePattern.test(value) && !value.includes(':')) {
    return formatSingleCoreMvCableCircuitLabel(value, materialized);
  }

  const normalized = value
    .replace(/^KABEL_SN:/i, '')
    .replace(/^LINIA_SN:/i, '')
    .replace(/@[^@]+$/u, '')
    .replace(/^cable-/i, '')
    .replace(/^line-/i, '')
    .replace(/^enea[-_\s]+operator[-_\s]+/i, '')
    .replace(/^base-/i, '')
    .replace(/^tfk-/i, '')
    .replace(/^nkt-/i, '')
    .replace(/-/gu, ' ')
    .replace(/\bxlpe\b/giu, 'XLPE')
    .replace(/\bal\b/giu, 'Al')
    .replace(/\bst\b/giu, 'St')
    .replace(/\b1c\s+(\d+)\b/iu, '1x$1')
    .replace(/\b3c\s+(\d+)\b/iu, '3x$1')
    .replace(/\b3x(\d+)\b/iu, '3x$1')
    .trim();

  const normalizedLabel = normalized
    ? normalized.toUpperCase().replace(/\bAL\b/u, 'Al').replace(/\bST\b/u, 'St')
    : value;
  return formatSingleCoreMvCableCircuitLabel(normalizedLabel, materialized);
}

function formatOverheadLineCatalogLabel(
  raw: string,
  materialized?: Record<string, unknown> | null,
): string | null {
  const value = raw.trim();
  const catalogItemId = readStringMaterializedValue(materialized, 'catalog_item_id') ?? '';
  const looksLikeOverheadCatalog =
    /^line[-_:]/i.test(value)
    || /^line[-_:]/i.test(catalogItemId)
    || /^LINIA_SN:/i.test(value)
    || /\blinia\s+napowietrzna\b/iu.test(value);
  if (!looksLikeOverheadCatalog) return null;
  const section =
    readNumericMaterializedValue(materialized, 'phase_conductor_cross_section_mm2')
    ?? readNumericMaterializedValue(materialized, 'conductor_cross_section_mm2')
    ?? readNumericMaterializedValue(materialized, 'cross_section_mm2')
    ?? readSectionFromOverheadRef(value)
    ?? readSectionFromOverheadRef(catalogItemId);
  const material =
    readStringMaterializedValue(materialized, 'phase_conductor_material')
    ?? readStringMaterializedValue(materialized, 'conductor_material')
    ?? readMaterialFromOverheadRef(value)
    ?? readMaterialFromOverheadRef(catalogItemId);
  if (!section || !material) return null;
  return `Linia napowietrzna ${formatOverheadMaterial(material)} ${section} mm²`;
}

function readNumericMaterializedValue(
  materialized: Record<string, unknown> | null | undefined,
  key: string,
): number | null {
  const raw = materialized?.[key];
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}

function readStringMaterializedValue(
  materialized: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const raw = materialized?.[key];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

function readSectionFromOverheadRef(raw: string): number | null {
  const match = raw.match(/(?:^|[-_\s])(?:al|cu|afl|aal|base)(?:[-_\s]+(?:st|steel))?[-_\s]+(\d{2,4})(?:$|[-_\s])/iu)
    ?? raw.match(/\b(\d{2,4})\s*(?:mm(?:2|²))?\b/iu);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

function readMaterialFromOverheadRef(raw: string): string | null {
  if (/\bafl\b/i.test(raw)) return 'AFL';
  if (/\baal\b/i.test(raw)) return 'AAL';
  if (/\bal\b/i.test(raw)) return 'AL';
  if (/\bcu\b/i.test(raw)) return 'CU';
  return null;
}

function formatOverheadMaterial(raw: string): string {
  const value = raw.trim().toUpperCase();
  if (value === 'CU' || value === 'COPPER') return 'Cu';
  if (value === 'AFL') return 'AFL';
  if (value === 'AAL') return 'AAL';
  return 'Al';
}

function formatSingleCoreMvCableCircuitLabel(
  raw: string,
  materialized?: Record<string, unknown> | null,
): string {
  const value = normalizePhasePrefixLabel(addReturnConductorSection(
    stripCableOwnerPrefix(normalizeCableMultiplicationSigns(raw.trim().replace(/\s+/gu, ' '))),
    materialized,
  ));
  if (!value) return raw;
  const hasThreePhaseSet =
    /^3\s*[x×]\s+/iu.test(value)
    || /\b3\s*[x×]\s*1\s*[x×]\s*\d{2,4}\b/iu.test(value)
    || /\b3\s*[x×]\s*\d{2,4}\b/iu.test(value);
  if (hasThreePhaseSet) return ensureMvCableUnit(value);

  const hasSingleCoreDesignation = /\b1×\d{2,4}(?:\s*\/\s*\d{1,3})?\b/iu.test(value);
  const looksLikeMvCable =
    /\b(?:KABEL\s+SN|NA2XS2Y|N2XS2Y|XRUHAKXS|YHAKXS|YHKXS|YAKXS)\b/iu.test(value);
  if (!hasSingleCoreDesignation || !looksLikeMvCable) return value;

  const withUnit = ensureMvCableUnit(value);
  return `3 × ${withUnit}`;
}

function normalizePhasePrefixLabel(raw: string): string {
  return raw
    .replace(/^3\s*[xX×]\s+/u, '3 × ')
    .replace(/\b([13])\s*[xX×]\s*([13])\s*[xX×]\s*(\d{2,4})/gu, '$1×$2×$3')
    .replace(/\b([13])\s*[xX×]\s*(\d{2,4})(\s*\/\s*\d{1,3})?/gu, (_match, count: string, section: string, screen: string | undefined) => {
      const normalizedScreen = screen ? screen.replace(/\s+/gu, '') : '';
      return `${count}×${section}${normalizedScreen}`;
    });
}

function ensureMvCableUnit(raw: string): string {
  if (/\bmm(?:2|²)\b/iu.test(raw)) return raw;
  return raw.replace(/(\b1×\d{2,4}(?:\s*\/\s*\d{1,3})?)(?!\s*mm)/iu, '$1 mm²');
}

function stripCableOwnerPrefix(raw: string): string {
  const normalized = raw.trim();
  const phasePrefix = normalized.match(/^(3\s*[xX×]\s+)(.+)$/u);
  if (phasePrefix) {
    return `${phasePrefix[1]}${stripCableOwnerPrefix(phasePrefix[2])}`.trim();
  }
  return normalized
    .replace(/^\s*ENEA\s+OPERATOR\s+STANDARD\s*[-–—]?\s*/iu, '')
    .replace(/^\s*ENEA\s+OPERATOR\s*[-–—]?\s*/iu, '')
    .replace(/^\s*TELE[-\s]?FONIKA\s+KABLE\s*[-–—]?\s*/iu, '')
    .replace(/^\s*TFK\s+STANDARD\s*[-–—]?\s*/iu, '')
    .replace(/^\s*NKT\s+STANDARD\s*[-–—]?\s*/iu, '')
    .trim();
}

function addReturnConductorSection(raw: string, materialized?: Record<string, unknown> | null): string {
  const screenSection = readReturnConductorSection(materialized);
  if (!screenSection) return raw;
  return raw.replace(
    /\b1×(\d{2,4})(?!\s*\/)(\s*mm(?:2|²))?\b/iu,
    (_match, phaseSection: string, unit: string | undefined) =>
      `1×${phaseSection}/${screenSection}${unit ?? ''}`,
  );
}

/**
 * S9-9 (koszt operacji): formatery liczb TRZYMANE JAKO STAŁE MODUŁU — wzorzec
 * już obecny w repo (`sld/shared/stationInternalViewData.ts`,
 * `v2/canvas/StationInternalView.tsx`), tu tylko domknięty na klasę.
 *
 * `Number.prototype.toLocaleString(locale, opts)` buduje `Intl.NumberFormat`
 * PRZY KAŻDYM WYWOŁANIU. Pomiar S9-9: 5000 wywołań = 140 ms bez stałej wobec
 * 3,4 ms ze stałą (40×). Adapter woła to raz na przęsło/kabel, a scena liczy
 * adapter trzykrotnie (po razie na LOD), więc na sieci 107 stacji samo
 * formatowanie kosztowało ~29 ms na budowę × 3. Wynik tekstowy jest IDENTYCZNY
 * — ta sama lokalizacja i te same opcje, zmienia się wyłącznie moment budowy
 * formatera (pin: `__tests__/enmToSldAdapter.formatowanie.test.ts`).
 */
/** Przekrój żyły powrotnej — bez części ułamkowej (`readReturnConductorSection`). */
const FORMAT_PRZEKROJU_PL = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });
/** Długość [km] całkowita — `minimumFractionDigits: 0` (`formatPolishNumber`). */
const FORMAT_DLUGOSCI_CALKOWITEJ_PL = new Intl.NumberFormat('pl-PL', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
/** Długość [km] ułamkowa — `minimumFractionDigits: 1` (`formatPolishNumber`). */
const FORMAT_DLUGOSCI_ULAMKOWEJ_PL = new Intl.NumberFormat('pl-PL', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

function readReturnConductorSection(materialized?: Record<string, unknown> | null): string | null {
  const raw = materialized?.return_conductor_cross_section_mm2;
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(value) || value <= 0) return null;
  return FORMAT_PRZEKROJU_PL.format(value);
}

function normalizeCableMultiplicationSigns(raw: string): string {
  return raw
    .replace(/\b([13])\s*[xX×]\s*([13])\s*[xX×]\s*(\d{2,4})/gu, '$1×$2×$3')
    .replace(/\b([13])\s*[xX×]\s*(\d{2,4})(\s*\/\s*\d{1,3})?/gu, (_match, count: string, section: string, screen: string | undefined) => {
      const normalizedScreen = screen ? screen.replace(/\s+/gu, '') : '';
      return `${count}×${section}${normalizedScreen}`;
    });
}

// -----------------------------------------------------------------------------
// Sections (GPZ szyny SN)
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// Stations (na ciągach)
// -----------------------------------------------------------------------------

/**
 * Buduje listę stacji na ciągach z dwóch źródeł:
 *  1. **`snapshot.line_runs[]`** (Phase 0B-4 fix): jeśli ENM zawiera explicit
 *     LineRun, każdy ciąg = osobny kanał Y, stacje sortowane po `order`
 *     w `lineRun.stations[]`. Stabilna sortacja po `lineRun.id` (alfabetycznie)
 *     gwarantuje deterministyczne kanały Y.
 *  2. **Kontrola topologii**: stacje pole-wymiarowe NIE wymienione w żadnym
 *     `line_runs[]` nie dostają pozycji na kanwie; trafiają do raportu
 *     czytelności jako błąd materializacji/topologii.
 *
 * Wynik: deterministyczna pozycja stacji w SLD, oparta na ENM truth (Inv 9).
 */
type SldLineRunForLayout = {
  id: string;
  name?: string | null;
  run_kind: 'main_trunk' | 'branch' | 'ring' | 'loop';
  starting_bay_ref: string | null;
  starting_port_ref: string | null;
  segments: Array<{ segment_ref: string; order: number }>;
  stations: Array<{ substation_ref: string; order: number }>;
  nop_station_ref?: string | null;
  parent_run_ref?: string | null;
  branch_origin_station_ref?: string | null;
};

const FIELD_STATION_KINDS = new Set([
  'mv_lv', 'inline', 'branch', 'terminal', 'sectional', 'switching', 'customer',
]);

/** Stacja rozpatrywana przy wyprowadzaniu ciągów z łańcucha gałęzi — wyłącznie tożsamość. */
interface StacjaCiagu {
  readonly id: string;
}

function collectFieldStationByRef(snapshot: EnergyNetworkModel): Map<string, Substation> {
  const fieldStationByRef = new Map<string, Substation>();
  for (const station of snapshot.substations ?? []) {
    if (FIELD_STATION_KINDS.has(station.station_type)) {
      fieldStationByRef.set(station.ref_id, station);
    }
  }
  return fieldStationByRef;
}

function stationShellsForLineInference(
  fieldStationByRef: ReadonlyMap<string, Substation>,
): StacjaCiagu[] {
  return [...fieldStationByRef.values()].map((station) => ({ id: station.ref_id }));
}

/** Szyna → stacja pola (SZYNY-STACJI-LUSTRO: jedno lustro `szynyStacji` na stacjach pól;
 *  szyna wspólna dwóch stacji należy do pierwszej w kolejności modelu, jak w backendzie). */
function fieldStationByBusRef(
  snapshot: EnergyNetworkModel,
  fieldStationByRef: ReadonlyMap<string, Substation>,
): ReadonlyMap<string, string> {
  return stacjaSzyn(snapshot, [...fieldStationByRef.values()]);
}

function resolveFieldStationRefForBus(
  fieldStationByBus: ReadonlyMap<string, string>,
  busRef: string | null | undefined,
): string | null {
  return busRef ? fieldStationByBus.get(busRef) ?? null : null;
}

function inferStationRefsForSegments(
  segmentRefs: readonly string[],
  branchByRef: ReadonlyMap<string, Branch>,
  fieldStationByBus: ReadonlyMap<string, string>,
): string[] {
  const stationRefs: string[] = [];
  for (const segmentRef of segmentRefs) {
    const branch = branchByRef.get(segmentRef);
    if (!branch) continue;
    const candidates = [branch.to_bus_ref, branch.from_bus_ref]
      .map((busRef) => resolveFieldStationRefForBus(fieldStationByBus, busRef))
      .filter((stationRef): stationRef is string => Boolean(stationRef));
    for (const stationRef of candidates) {
      if (!stationRefs.includes(stationRef)) stationRefs.push(stationRef);
    }
  }
  return stationRefs;
}

function normalizeLineRunForLayout(
  lineRun: NonNullable<EnergyNetworkModel['line_runs']>[number],
  branchByRef: ReadonlyMap<string, Branch> = new Map(),
  splitSegmentRefsByParent: ReadonlyMap<string, readonly string[]> = new Map(),
): SldLineRunForLayout {
  const normalizedSegmentRefs = lineRunSegmentRefs(lineRun);
  const seenSegmentRefs = new Set<string>();
  const expandedSegmentRefs = normalizedSegmentRefs.flatMap((segmentRef) => {
    const splitFromBranchPoints = splitSegmentRefsByParent.get(segmentRef);
    // R2: odcinek cięty ŁĄCZNIKAMI (nie branch-pointami) rozwija się po
    // przyrostkach `_L`/`_R` z realnych gałęzi ENM (rekurencyjnie).
    const splitBySuffix = [...branchByRef.keys()]
      .filter((ref) => ref.startsWith(`${segmentRef}_`))
      .sort((a, b) => a.localeCompare(b));
    const refs = branchByRef.has(segmentRef)
      ? [segmentRef]
      : splitFromBranchPoints
        ? [...splitFromBranchPoints]
        : splitBySuffix.length > 0
          ? splitBySuffix
          : [segmentRef];
    return refs.filter((ref) => {
      if (seenSegmentRefs.has(ref)) return false;
      seenSegmentRefs.add(ref);
      return true;
    });
  });
  return {
    id: lineRun.id,
    name: lineRun.name ?? null,
    run_kind: lineRun.run_kind,
    starting_bay_ref: lineRun.starting_bay_ref ?? null,
    starting_port_ref: lineRun.starting_port_ref ?? null,
    segments: expandedSegmentRefs.map((segment_ref, index) => ({ segment_ref, order: index + 1 })),
    stations: [...lineRun.stations],
    // W5-C: stację punktu podziału ciągu wyprowadza `przypiszStacjePunktuPodzialu`
    // z pozycji normalnej łączników (dawna kopia `LineRun.nop_station_ref` skasowana).
    nop_station_ref: null,
    parent_run_ref: lineRun.parent_run_ref ?? null,
    branch_origin_station_ref: lineRun.branch_origin_station_ref ?? null,
  };
}

function splitSegmentRefsByParentFromBranchPoints(
  snapshot: EnergyNetworkModel,
  branchByRef: ReadonlyMap<string, Branch>,
): Map<string, readonly string[]> {
  const refsByParent = new Map<string, readonly string[]>();
  for (const branchPoint of snapshot.branch_points ?? []) {
    const parentRef = branchPoint.parent_segment_id;
    if (!parentRef || branchByRef.has(parentRef)) continue;
    const mainSegmentRefs = branchPointMainSegmentRefs(branchPoint, branchByRef);
    if (mainSegmentRefs.length === 0) continue;
    refsByParent.set(parentRef, mainSegmentRefs);
  }
  return refsByParent;
}

function compareLineRunsForLayout(a: SldLineRunForLayout, b: SldLineRunForLayout): number {
  const aDerived = a.id.startsWith('synth_trunk_') || a.id.startsWith('corridor_sld_');
  const bDerived = b.id.startsWith('synth_trunk_') || b.id.startsWith('corridor_sld_');
  if (aDerived !== bDerived) return aDerived ? 1 : -1;
  const kindRank = lineRunKindLayoutRank(a.run_kind) - lineRunKindLayoutRank(b.run_kind);
  if (kindRank !== 0) return kindRank;
  return a.id.localeCompare(b.id);
}

function lineRunKindLayoutRank(kind: SldLineRunForLayout['run_kind']): number {
  switch (kind) {
    case 'main_trunk':
      return 0;
    case 'branch':
      return 1;
    case 'ring':
    case 'loop':
      return 2;
    default:
      return 3;
  }
}

/**
 * R2: deklarowany odcinek ciągu (`seg/<h>/segment`) może być ROZCIĘTY
 * łącznikami na warianty `_L`/`_R` (rekurencyjnie: `_L_R_L`...). Rysujemy
 * RZECZYWISTE gałęzie ENM: ref bazowy rozwija się do wszystkich połówek
 * w porządku leksykalnym (_L przed _R — zgodnie z orientacją odcinka).
 */
function expandSegmentRefToBranches(
  segmentRef: string,
  branches: readonly Branch[],
): Branch[] {
  const exact = branches.filter((branch) => branch.ref_id === segmentRef);
  if (exact.length > 0) return exact;
  return branches
    .filter((branch) => branch.ref_id.startsWith(`${segmentRef}_`))
    .sort((a, b) => a.ref_id.localeCompare(b.ref_id));
}

/** Ref bazowy odcinka (bez przyrostków cięcia łącznikiem `_L`/`_R`). */
function baseSegmentRef(segmentRef: string): string {
  return segmentRef.replace(/(_[LR])+$/, '');
}

function buildSldLineRunsForLayout(
  snapshot: EnergyNetworkModel,
  fieldStationByRef: ReadonlyMap<string, Substation>,
): SldLineRunForLayout[] {
  const szyny = indeksSzynMigawki(snapshot);
  const cables = (snapshot.branches ?? [])
    .filter((branch) => isCableLikeBranch(branch) && isMediumVoltageNetworkBranch(szyny, branch));
  const branchByRef = new Map(cables.map((branch) => [branch.ref_id, branch]));
  const fieldStationByBus = fieldStationByBusRef(snapshot, fieldStationByRef);
  const splitSegmentRefsByParent = splitSegmentRefsByParentFromBranchPoints(snapshot, branchByRef);
  const explicitRuns = (snapshot.line_runs ?? [])
    .map((lineRun) => normalizeLineRunForLayout(lineRun, branchByRef, splitSegmentRefsByParent))
    .map((run) => {
      // R2: gdy line_run nie deklaruje stacji, wyprowadź je z KOŃCÓWEK
      // rzeczywistych odcinków (kolejność elektryczna) — stacje ciągu nie mogą
      // zależeć od resztkowego korytarza.
      if (run.stations.length > 0) return run;
      const inferred = inferStationRefsForSegments(
        run.segments.map((seg) => seg.segment_ref),
        branchByRef,
        fieldStationByBus,
      );
      // Stacja-RODZIC odgałęzienia (origin) leży na ciągu macierzystym — nie
      // jest stacją TEGO ciągu (jej obecność fałszowałaby koniec ciągu i
      // gasiła marker oczekującego zakończenia).
      const firstSegmentRef = [...run.segments].sort((a, b) => a.order - b.order)[0]?.segment_ref;
      const firstBranch = firstSegmentRef ? branchByRef.get(firstSegmentRef) : undefined;
      // `branch_origin_station_ref` jest refem STACJI (stacji pola albo GPZ) albo refem jej
      // pola — nie szyną; szynę rozstrzyga lustro wyłącznie dla końca pierwszego odcinka.
      const originOwner = run.branch_origin_station_ref
        ? fieldStationByRef.has(run.branch_origin_station_ref)
          ? run.branch_origin_station_ref
          : stacjaPola(snapshot, run.branch_origin_station_ref)
        : run.run_kind === 'branch'
          ? resolveFieldStationRefForBus(fieldStationByBus, firstBranch?.from_bus_ref)
          : null;
      const stations = inferred.filter((stationRef) => stationRef !== originOwner);
      return {
        ...run,
        stations: stations.map((substation_ref, order) => ({ substation_ref, order: order + 1 })),
      };
    });
  const coveredSegments = new Set<string>();
  for (const run of explicitRuns) {
    for (const segmentRef of lineRunSegmentRefs(run)) {
      coveredSegments.add(segmentRef);
      coveredSegments.add(baseSegmentRef(segmentRef));
    }
  }

  const corridorRuns = [...(snapshot.corridors ?? [])]
    .sort((a, b) => a.ref_id.localeCompare(b.ref_id))
    .flatMap((corridor, corridorIndex): SldLineRunForLayout[] => {
      const segmentRefs = (corridor.ordered_segment_refs ?? [])
        .filter((segmentRef) =>
          !coveredSegments.has(segmentRef) && !coveredSegments.has(baseSegmentRef(segmentRef))
          // ref z przestrzeni łączników (`sw/...` = punkt NO korytarza) nie jest
          // odcinkiem do rysowania — nie tworzy ciągu resztkowego (gramatyka
          // ref_id ENM, nie heurystyka nazw)
          && !segmentRef.startsWith('sw/'));
      if (segmentRefs.length === 0) return [];
      for (const segmentRef of segmentRefs) coveredSegments.add(segmentRef);
      const stationRefs = uniqueStrings([
        ...(corridor.station_refs ?? []),
        ...inferStationRefsForSegments(segmentRefs, branchByRef, fieldStationByBus),
      ]).filter((stationRef) => fieldStationByRef.has(stationRef));
      return [{
        id: `corridor_sld_${corridor.ref_id || corridor.id || corridorIndex}`,
        run_kind: corridor.corridor_type === 'ring' ? 'ring' : 'main_trunk',
        starting_bay_ref: null,
        starting_port_ref: null,
        segments: segmentRefs.map((segment_ref, order) => ({ segment_ref, order: order + 1 })),
        stations: stationRefs.map((substation_ref, order) => ({ substation_ref, order: order + 1 })),
        nop_station_ref: null,
      }];
    });

  const uncoveredCables = cables.filter((branch) => !coveredSegments.has(branch.ref_id));
  const layoutRuns: SldLineRunForLayout[] = [...explicitRuns, ...corridorRuns];
  const synthesizedRuns = inferLineRunsFromBranchChain(
    snapshot,
    uncoveredCables,
    stationShellsForLineInference(fieldStationByRef),
  )
    .filter((run) => run.segments.length > 0 && run.stations.length > 0);

  synthesizedRuns.forEach((run, index) => {
    const firstSegment = branchByRef.get(run.segments[0]?.segment_ref ?? '');
    const originStationRef = resolveFieldStationRefForBus(fieldStationByBus, firstSegment?.from_bus_ref);
    const existingRun = originStationRef
      ? layoutRuns.find((candidate) =>
        candidate.stations.some((station) => station.substation_ref === originStationRef),
      )
      : null;

    if (existingRun) {
      const segmentOrderBase = existingRun.segments.reduce(
        (maxOrder, segment) => Math.max(maxOrder, segment.order),
        0,
      );
      const stationOrderBase = existingRun.stations.reduce(
        (maxOrder, station) => Math.max(maxOrder, station.order),
        0,
      );
      existingRun.segments.push(
        ...run.segments.map((segment, segmentIndex) => ({
          ...segment,
          order: segmentOrderBase + segmentIndex + 1,
        })),
      );
      const knownStations = new Set(existingRun.stations.map((station) => station.substation_ref));
      existingRun.stations.push(
        ...run.stations
          .filter((station) => !knownStations.has(station.substation_ref))
          .map((station, stationIndex) => ({
            ...station,
            order: stationOrderBase + stationIndex + 1,
          })),
      );
      return;
    }

    layoutRuns.push({
      id: layoutRuns.length > 0 ? `synth_trunk_extra_${index}` : run.id,
      run_kind: 'main_trunk',
      starting_bay_ref: null,
      starting_port_ref: null,
      segments: run.segments,
      stations: run.stations,
      nop_station_ref: null,
    });
  });

  // V-03: klasyfikuj korytarze odgałęźne jako 'branch' z origin-stacją, by layout
  // rozłożył laterale od stacji-rodzica (drzewo), zamiast stosu lewo-wyrównanego.
  // Run jest lateralem, gdy stacja-rodzic (from_bus pierwszego segmentu) leży na
  // INNYM runie. Główna magistrala wychodzi z GPZ/źródła (origin nie jest stacją).
  const stationToRunId = new Map<string, string>();
  for (const run of layoutRuns) {
    for (const st of run.stations) stationToRunId.set(st.substation_ref, run.id);
  }
  for (const run of layoutRuns) {
    if (run.run_kind !== 'main_trunk') continue;
    const firstSeg = [...run.segments].sort((a, b) => a.order - b.order)[0];
    const branch0 = firstSeg ? branchByRef.get(firstSeg.segment_ref) : null;
    const originStationRef = resolveFieldStationRefForBus(fieldStationByBus, branch0?.from_bus_ref);
    if (!originStationRef) continue;
    const originRunId = stationToRunId.get(originStationRef);
    if (originRunId && originRunId !== run.id) {
      run.run_kind = 'branch';
      run.branch_origin_station_ref = originStationRef;
    }
  }

  przypiszStacjePunktuPodzialu(snapshot, layoutRuns);
  return layoutRuns.sort(compareLineRunsForLayout);
}

/**
 * W5-C: stacja punktu normalnie otwartego ciągu — PIERWSZA (wg kolejności ciągu) stacja,
 * której pole niesie łącznik z pozycją normalną `'open'` (`ui/shared/stanLacznika.ts::
 * punktyPodzialu` — jedno źródło, pozycja normalna łącznika). Punkt podziału poza stacją
 * (łącznik sekcyjny na trasie) nie oznacza żadnej stacji: łącznik jest rysowany jako
 * otwarty z własnego `status`, a kopia „stacji NOP" byłaby domysłem.
 */
function przypiszStacjePunktuPodzialu(
  snapshot: EnergyNetworkModel,
  runs: SldLineRunForLayout[],
): void {
  const punkty = new Set(punktyPodzialu(snapshot).map((galaz) => galaz.ref_id));
  const stacjeZPunktem = new Set<string>();
  if (punkty.size > 0) {
    for (const pole of snapshot.bays ?? []) {
      if (!pole.substation_ref) continue;
      if ((pole.equipment_refs ?? []).some((ref) => punkty.has(ref))) {
        stacjeZPunktem.add(pole.substation_ref);
      }
    }
  }
  for (const run of runs) {
    const stacja = [...run.stations]
      .sort((a, b) => a.order - b.order)
      .find((station) => stacjeZPunktem.has(station.substation_ref));
    run.nop_station_ref = stacja?.substation_ref ?? null;
  }
}

function buildStations(snapshot: EnergyNetworkModel): StationOnRunViewModel[] {
  const corridors = snapshot.corridors ?? [];
  const stations: StationOnRunViewModel[] = [];

  const fieldStationByRef = collectFieldStationByRef(snapshot);
  const kontekstStacji = kontekstStacjiMigawki(snapshot);

  // K30 audit loop: jeśli ENM nie ma jawnych line_runs ALE branches tworzą
  // łańcuch GPZ→S→S→..., zsynchronizuj line_runs z buildCableRuns. Bez tego
  // stacje wpadają w orphan-fallback (4×5 grid cluster), a kable są jeden
  // wspólny main_trunk — visual inconsistency.
  const lineRuns = buildSldLineRunsForLayout(snapshot, fieldStationByRef);

  /* Phase 0B-4: śledzimy które stacje już zostały umieszczone przez line_runs.
   * Reszta to "orphans" (legacy fallback). */
  const placed = new Set<string>();

  // 1. Stacje z line_runs — deterministyczne sortowanie po lineRun.id, potem station.order.
  const sortedRuns = [...lineRuns].sort(compareLineRunsForLayout);
  // SLD-LOC: JEDNA wspólna mapa rang dla WSZYSTKICH ciągów tej budowy —
  // line_runs (pętla 1 niżej) i corridory-orphan (pętla 2 niżej) dzielą tę
  // samą listę wejściową, więc żaden fallback-kod stacji z pętli 1 nie może
  // kolidować z fallback-kodem stacji z pętli 2 (i odwrotnie). Patrz
  // docstring `fallbackSequenceBaseByRunId` wyżej dla uzasadnienia i
  // udokumentowanego ryzyka szczątkowego.
  // Rozmiar bloku: MAKSIMUM liczby stacji w JEDNYM ciągu/corridorze TEJ
  // KONKRETNEJ sieci (patrz docstring wyżej, „ROZMIAR BLOKU" — próba (ii),
  // przyjęta OSTATECZNIE mimo udokumentowanego kompromisu: jedyna z trzech
  // zbadanych opcji, która na PEŁNEJ regresji tego katalogu testów nie
  // psuje ANI JEDNEGO z trzech niezależnych geometrycznych niezmienników
  // spoza kart tej naprawy — `junction_dot_probe`, W3 anty-dryf, obszar
  // bezpieczny pod dokami — które udokumentowana stała ROZMIAR=1000 łamie
  // WSZYSTKIE TRZY jednocześnie, zmierzone w tej karcie). Podłoga 10 dla
  // sieci bardzo małych (mniej niż 10 stacji w każdym ciągu).
  const fallbackBlockSize = Math.max(
    10,
    ...sortedRuns.map((r) => r.stations.length),
    ...corridors.map((c) => (c.station_refs ?? []).length),
  );
  const fallbackBases = fallbackSequenceBaseByRunId(
    [
      ...sortedRuns.map((r) => r.id),
      // Corridory osobno posortowane leksykalnie PRZED złączeniem (nie przez
      // `fallbackSequenceBaseByRunId` — ta już NIE sortuje, patrz docstring
      // funkcji): ta sama kolejność, w której pętla 2 niżej PRZETWARZA
      // corridory (`sortedCorridorsWithStations`), więc ranga = pozycja
      // przetwarzania także dla „orphanów", spójnie z pętlą 1.
      ...[...corridors.map((c) => c.ref_id)].sort(),
    ],
    fallbackBlockSize,
  );
  sortedRuns.forEach((lr) => {
    const sortedStations = [...lr.stations].sort((a, b) => a.order - b.order);
    // SLD-LOC (lokalność pionowa kotwic stacji): fallback numeracji stacji BEZ
    // nazwy jawnej (`stationCodeFromName`) MUSI być lokalny do WŁASNEGO ciągu
    // (line run) — dawniej licznik był dzielony GLOBALNIE między wszystkimi
    // ciągami (`sortedRuns`), więc dopisanie stacji na ogonie main_trunk
    // (przetwarzanego zawsze pierwszy) przesuwało o +1 fallback-kod KAŻDEJ
    // później przetwarzanej stacji odgałęzienia — nawet takiej, której własna
    // elektryczna tożsamość/footprint w ogóle się nie zmieniły. Skutek w
    // warstwie SLD v3: etykieta zejścia jednego lateralu przekraczała próg
    // cyfr (np. „S99"→„S100"), `dropBandHeight` tego wiersza arkusza rósł o
    // jeden kwant siatki, a globalny packer pasm lateralnych
    // (`createLateralShelfPacker`, `scene/buildScene.ts`) kaskadowo przesuwał
    // w dół WSZYSTKIE kolejne półki — łącznie z półkami INNEGO wiersza
    // arkusza, który z dopisaną stacją nie ma nic wspólnego (naruszenie
    // lokalności, `anchorDisplacementMetrics`/`buildScene.p1Recenzja.test.ts`).
    // Baza per-run (`fallbackBases`, ranga w POSORTOWANEJ liście id — patrz
    // docstring `fallbackSequenceBaseByRunId` wyżej) usuwa przyczynę u
    // źródła: numeracja fallback stacji ciągu A nie zależy już od liczby
    // stacji w ciągu B ANI od tego, ile innych ciągów istnieje — a mimo to
    // różne ciągi dostają różne, ROZŁOŻONE zakresy (nie prosty reset do 1,
    // który łamał globalną jednoznaczność — zmierzone: `busbar_label_probe`).
    // Ten sam mechanizm (ta sama mapa `fallbackBases`) zastosowany niżej w
    // pętli 2 — stacje „orphan" dopięte przez corridory
    // (`append_station_on_endpoint`). `.get(lr.id)!`: `lr.id` jest jednym z
    // id użytych do ZBUDOWANIA `fallbackBases` (mapowanie z `sortedRuns`
    // powyżej) — obecność klucza jest gwarancją z konstrukcji, nie
    // założeniem czasu wykonania.
    let stationSequence = fallbackBases.get(lr.id)!;
    sortedStations.forEach((sref) => {
      if (placed.has(sref.substation_ref)) return;
      const sub = fieldStationByRef.get(sref.substation_ref);
      if (!sub) return;
      placed.add(sref.substation_ref);
      const stationSldDetails = buildStationMiniBlockDetails(snapshot, sub, kontekstStacji);
      const isNop = lr.nop_station_ref === sub.ref_id || lr.nop_station_ref === sub.id;
      const stationCode = stationCodeFromName(sub.name, stationSequence);
      stationSequence += 1;

      stations.push({
        id: sub.ref_id,
        name: normalizeStationName(sub.name, sub.ref_id),
        stationCode,
        topologicalType: stationTopologicalType(snapshot, sub),
        snBays: stationSldDetails.snBays,
        snSections: stationSldDetails.snSections,
        snCouplers: stationSldDetails.snCouplers,
        hasTransformer: stationSldDetails.hasTransformer,
        // TR2W-BEZ-POLA (§0.C.2/§0.C.3): jednostki TR z terminalami WN/nN.
        transformerUnits: stationSldDetails.transformerUnits,
        transformerRatedKva: stationSldDetails.transformerRatedKva,
        busVoltageKv: stationSldDetails.mainBusVoltageKv,
        nnVoltageKv: stationSldDetails.nnVoltageKv,
        aggregatedLvLoad: stationSldDetails.aggregatedLvLoad,
        transformerVectorGroup: stationSldDetails.transformerVectorGroup,
        ...(isNop ? { isNop: true } : {}),
      });
    });
  });

  // 2. Stacje dopięte przez append_station_on_endpoint do corridor.station_refs[].
  const sortedCorridorsWithStations = [...corridors]
    .filter((corridor) => (corridor.station_refs ?? []).length > 0)
    .sort((a, b) => a.ref_id.localeCompare(b.ref_id));
  sortedCorridorsWithStations.forEach((corridor) => {
    // SLD-LOC: ta sama naprawa co w pętli 1 wyżej — baza fallback per WŁASNY
    // corridor (ranga jego `ref_id` we WSPÓLNEJ mapie `fallbackBases`, patrz
    // wyżej), żeby stacja doklejona do jednego corridora ani nie przesuwała,
    // ani nie duplikowała fallback-kodu stacji „orphan" innego,
    // niepowiązanego corridora — ani stacji z pętli 1 (line_runs).
    // `.get(corridor.ref_id)!`: gwarancja z konstrukcji, patrz komentarz przy
    // analogicznym lookupie w pętli 1 wyżej.
    let stationSequence = fallbackBases.get(corridor.ref_id)!;
    (corridor.station_refs ?? []).forEach((substationRef) => {
      if (placed.has(substationRef)) return;
      const sub = fieldStationByRef.get(substationRef);
      if (!sub) return;
      placed.add(substationRef);
      const stationSldDetails = buildStationMiniBlockDetails(snapshot, sub, kontekstStacji);
      stations.push({
        id: sub.ref_id,
        name: normalizeStationName(sub.name, sub.ref_id),
        stationCode: stationCodeFromName(sub.name, stationSequence),
        topologicalType: stationTopologicalType(snapshot, sub),
        snBays: stationSldDetails.snBays,
        snSections: stationSldDetails.snSections,
        snCouplers: stationSldDetails.snCouplers,
        hasTransformer: stationSldDetails.hasTransformer,
        // TR2W-BEZ-POLA (§0.C.2/§0.C.3): jednostki TR z terminalami WN/nN.
        transformerUnits: stationSldDetails.transformerUnits,
        transformerRatedKva: stationSldDetails.transformerRatedKva,
        busVoltageKv: stationSldDetails.mainBusVoltageKv,
        nnVoltageKv: stationSldDetails.nnVoltageKv,
        aggregatedLvLoad: stationSldDetails.aggregatedLvLoad,
        transformerVectorGroup: stationSldDetails.transformerVectorGroup,
      });
      stationSequence += 1;
    });
  });

  return stations;
}

interface StationMiniBlockDetails {
  readonly snBays: readonly MiniBlockBayDescriptor[];
  readonly snSections: NonNullable<StationOnRunViewModel['snSections']>;
  readonly snCouplers: NonNullable<StationOnRunViewModel['snCouplers']>;
  readonly hasTransformer: boolean;
  readonly transformerRefs: readonly string[];
  /** TR2W-BEZ-POLA (§0.C.2/§0.C.3): jednostki transformatorowe stacji z
   *  terminalami WN/nN — kotwica topologiczna kolumny transformatora na SLD
   *  (`layout/measure.ts` `stationSnColumnLayout`). `transformerRefs` wyżej to
   *  ta sama lista zredukowana do refów. */
  readonly transformerUnits: readonly StationTransformerUnit[];
  readonly transformerRatedKva: number | null;
  /** K30-37: napięcie głównej szyny SN stacji [kV] — najwyższe voltage_kv
   *  spośród buses zakotwiczonych do tej stacji. Renderer dobiera tint koloru
   *  szyny zgodnie z konwencją dyspozytorską (WN/SN/nN). */
  readonly mainBusVoltageKv: number | null;
  /** Recenzja NO-GO 2026-07-17 pkt 6: napięcie szyny nN [kV] z rekordu
   *  `Bus` (voltage_kv <= 0.5) — `null` gdy stacja nie niesie szyny nN. */
  readonly nnVoltageKv: number | null;
  /** Recenzja NO-GO 2026-07-17 pkt 6: zagregowany odbiór nN (suma
   *  `Load` × quantity na szynach nN) — `null` = zero rekordów (granica
   *  modelu, nie zero mocy). */
  readonly aggregatedLvLoad: { readonly pMw: number; readonly qMvar: number; readonly count: number } | null;
  /** K30-62: vector group transformatora (np. "Dyn5", "Yd11"). Real
   *  industrial SLD pokazuje vector group obok TR symbol per IEC 60076-1. */
  readonly transformerVectorGroup: string | null;
}

/**
 * Dane migawki wspólne dla bloków WSZYSTKICH stacji jednej budowy rysunku, liczone RAZ:
 * indeksy szyn i gałęzi, indeks gałęzi pól nN (szyny stacji) i kontekst wyboru
 * transformatorów. Dotąd każda stacja budowała je od nowa z całej migawki — koszt
 * O(stacje × migawka), nadliniowy w rodzinie H (530 stacji). Wynik bloku stacji z kontekstem
 * jest identyczny jak bez niego (te same mapy, te same reguły).
 */
interface KontekstStacjiMigawki {
  readonly busByRef: ReadonlyMap<string, Bus>;
  readonly branchByRef: ReadonlyMap<string, Branch>;
  readonly transformatory: KontekstWyboruTransformatorow;
}

function kontekstStacjiMigawki(snapshot: EnergyNetworkModel): KontekstStacjiMigawki {
  return {
    busByRef: new Map((snapshot.buses ?? []).map((bus) => [bus.ref_id, bus])),
    branchByRef: new Map((snapshot.branches ?? []).map((b) => [b.ref_id, b])),
    transformatory: kontekstWyboruTransformatorow(snapshot),
  };
}

function buildStationMiniBlockDetails(
  snapshot: EnergyNetworkModel,
  station: Substation,
  kontekst: KontekstStacjiMigawki,
): StationMiniBlockDetails {
  const explicitBays = buildExplicitStationMiniBays(snapshot, station, kontekst.branchByRef);
  const derSourceBays = buildDedicatedDerStationMiniBays(snapshot, station, explicitBays);
  const snBays = [...explicitBays, ...derSourceBays];
  const rodzaj = rodzajStacji(snapshot, station.ref_id);
  if (!rodzaj) {
    throw new Error(`Stacja pola „${station.name}" bez rodzaju topologicznego (GPZ albo rozdzielnica nN).`);
  }
  const transformerUnits = collectStationTransformerUnits(snapshot, station, kontekst.transformatory);
  const transformerRefs = transformerUnits.map((unit) => unit.ref);
  const transformerRatedKva = inferTransformerRatedKva(snapshot, transformerRefs);

  const busByRef = kontekst.busByRef;
  // K30-37: główna szyna SN stacji (najwyższe voltage_kv powyżej granicy stron)
  // i szyna nN — WYBÓR wg JEDNEJ reguły `shared/stationBusResolution.ts`
  // (S9-2). Reguła była tu zapisana wprost, a warstwa wynikowa potrzebuje TEJ
  // SAMEJ decyzji, żeby dopasować punkt wyniku do narysowanej szyny; dwie kopie
  // rozjechałyby się na stacji z dwiema szynami tego samego napięcia.
  const mainBusVoltageKv = pickStationBus(station, busByRef, 'sn').voltageKv;
  const nnBusPick = pickStationBus(station, busByRef, 'nn');
  const nnVoltageKv = nnBusPick.voltageKv;
  // Zbiór refów WSZYSTKICH szyn nN stacji (agregat odbioru nN). To INNY predykat niż
  // wybór jednej szyny wyżej — pytanie brzmi „które szyny należą do strony nN", nie
  // „która jest szyną główną" — dlatego liczony osobno, świadomie. Strona nN z tej samej
  // złożonej reguły co mostek refów wyników kanwy (`stationSideBusRefs`,
  // `resultPointsInStationNnBoard`, SZYNY-STACJI-LUSTRO).
  const nnBusRefs = new Set<string>();
  for (const busRef of stationSideBusRefs(snapshot, station, busByRef, 'nn')) {
    nnBusRefs.add(busRef);
  }
  // Recenzja NO-GO 2026-07-17 pkt 6: ZAGREGOWANY odbiór nN — WYŁĄCZNIE
  // rekordy `Load` na szynach nN tej stacji (× quantity). `null` gdy ZERO
  // rekordów (jawna granica modelu — kompozycja pisze to na rysunku).
  const lvLoads = (snapshot.loads ?? []).filter((l) => nnBusRefs.has(l.bus_ref));
  const aggregatedLvLoad = lvLoads.length > 0
    ? lvLoads.reduce(
        (acc, l) => ({
          pMw: acc.pMw + (l.p_mw ?? 0) * (l.quantity ?? 1),
          qMvar: acc.qMvar + (l.q_mvar ?? 0) * (l.quantity ?? 1),
          count: acc.count + 1,
        }),
        { pMw: 0, qMvar: 0, count: 0 },
      )
    : null;
  const snSections = stationSnSections(station, busByRef);
  const snCouplers = sprzeglaMiedzySekcjami(
    snapshot.branches ?? [],
    snSections.map((section) => section.busRef),
    polaSnStacji(snapshot, station.ref_id),
  );
  return {
    snBays,
    snSections,
    snCouplers,
    transformerRefs,
    transformerUnits,
    hasTransformer:
      transformerRefs.length > 0 ||
      snBays.some((bay) => bay.fieldRole === FIELD_ROLE.RMU_TRANSFORMER || bay.fieldRole === FIELD_ROLE.TRANSFORMER),
    transformerRatedKva,
    mainBusVoltageKv,
    nnVoltageKv,
    aggregatedLvLoad,
    transformerVectorGroup: inferTransformerVectorGroup(snapshot, transformerRefs),
  };
}

/**
 * K30-62: zwróć vector_group z pierwszego transformatora linkowanego ze
 * stacją. Industrial SLD pokazuje vector group per IEC 60076-1 (np. Dyn5,
 * Yd11). Brak vector_group → null (no badge rendered).
 */
function inferTransformerVectorGroup(
  snapshot: EnergyNetworkModel,
  transformerRefs: readonly string[],
): string | null {
  for (const ref of transformerRefs) {
    const tr = (snapshot.transformers ?? []).find(
      (t) => t.ref_id === ref || t.id === ref,
    );
    if (tr?.vector_group) return tr.vector_group;
  }
  return null;
}

function inferTransformerRatedKva(
  snapshot: EnergyNetworkModel,
  transformerRefs: readonly string[],
): number | null {
  if (transformerRefs.length === 0) return null;
  const transformer = (snapshot.transformers ?? []).find(
    (tr) => transformerRefs.includes(tr.ref_id) || transformerRefs.includes(tr.id ?? ''),
  );
  if (!transformer) return null;
  const kva = Math.round(transformer.sn_mva * 1000);
  return kva > 0 ? kva : null;
}

/**
 * TR2W-BEZ-POLA (§0.C.2): jednostki transformatorowe stacji Z TERMINALAMI.
 * `transformerRefs` (lista samych refów, dotychczasowy kontrakt read-modelu)
 * wyprowadzana jest z TEJ SAMEJ listy — jedno źródło prawdy zamiast dwóch
 * niezależnych selekcji (reguła KLASA §3).
 */
function collectStationTransformerUnits(
  snapshot: EnergyNetworkModel,
  station: Substation,
  kontekst: KontekstWyboruTransformatorow,
): StationTransformerUnit[] {
  return selectStationTransformerUnits(snapshot, station, kontekst);
}

/**
 * Pola SN stacji na bloku mini-RMU — JEDNA ścieżka z rekordów `bays` (karta W5-B). Do karty
 * W5-B istniały tu DWIE ścieżki: pola z listy w `meta` stacji (kolejność z danych, oznaczenie
 * z roli, stany z aparatów pola) i rekordy `bays` (sortowanie rankingiem, oznaczenie z nazwy,
 * adnotacje zabezpieczeń i pomiarów), a przy obu kanałach naraz wygrywał pierwszy — ta sama
 * dana pola rysowała się różnie zależnie od kanału. Teraz jeden rekord, jedna projekcja:
 *  - kolejność = kolejność zapisu rekordów (V12K-330, dyrektywa właściciela 2026-08-06: „pole
 *    pomiarowe musi być pierwsze patrząc od kierunku zasilania" — fizyczny układ rozdzielnicy
 *    zadeklarowany przez szablon/operację domenową, NIE ranking ról);
 *  - rola z `field_role` (rola kanoniczna), a bez niej z `bay_role`;
 *  - oznaczenie: numer dyspozytorski (`bay_number`), krótka nazwa odpływu, skrót roli, nazwa;
 *  - stany łączników z modelu (`stanyAparatowPolaZModelu`: `status` gałęzi łączeniowych pola);
 *  - tor pierwotny i konfiguracja pola z danych rekordu.
 * ADNOTACJE pola (oznaczenie zabezpieczeń, miernik, CT, VT) blok stacji NIE projektuje —
 * dokładnie tak, jak rysowała je produkcyjna ścieżka pól stacji przed kartą W5-B (stacje
 * budowane operacjami). Rzutowanie `protection_codes` rekordów pól stacji powiększa arkusz
 * substratu 52 stacji z 8328×5771 do 11096×7467 (171 okręgów przekaźnika) — to zmiana wyglądu
 * SLD wymagająca werdyktu właściciela (B-02), nie skutek zmiany nośnika danych; decyzja
 * nazwana w meldunku karty W5-B/C. Blok GPZ rzutuje adnotacje jak dotąd
 * (`enmToCanonicalGpzAdapter.ts`).
 * Pola nN stacji (szyna pola w paśmie nN, `czyPoleNn`) nie są polami bloku SN.
 */
function buildExplicitStationMiniBays(
  snapshot: EnergyNetworkModel,
  station: Substation,
  // K30-65: gałęzie migawki po ref_id (O(1) wyszukiwanie aparatów) — mapa liczona raz na budowę.
  branchByRef: ReadonlyMap<string, Branch>,
): MiniBlockBayDescriptor[] {
  const generatoryWgPola = wytworcyWgPola(snapshot);
  const transformatoryWgRef = new Map((snapshot.transformers ?? []).map((t) => [t.ref_id, t]));
  const galezieMigawki = snapshot.branches ?? [];
  return polaSnStacji(snapshot, station.ref_id).map((bay, index) => {
    const rola = stationFieldRole(bay, generatoryWgPola);
    const transformatorPola = jedynyTransformatorPola(bay, transformatoryWgRef);
    // GPZ-PARYTET cz. 2 (pkt 2): stan łączników z modelu — `status` gałęzi łączeniowych
    // pola rozstrzygnięty rekordami aparatów; brak danej → `unknown` (nigdy domysł).
    const states = stanyAparatowPolaZModelu(bay, branchByRef);
    return {
      bayRef: bay.ref_id,
      fieldRole: mapStationBayRoleToMiniRole(rola),
      designation: bay.bay_number ?? bay.feeder_short_name ?? stationFieldDesignation(bay, rola, index),
      hasMissingRequiredDevice: bay.equipment_refs.length === 0,
      // TR2W-BEZ-POLA (§0.C.2): szyna pola (`Bay.bus_ref`).
      busRef: bay.bus_ref,
      // GEOMETRIA-STACJI (Z-03): sekcja (szyna główna) pola — lustro backendu.
      ...sekcjaPola(snapshot, station, bay.bus_ref),
      // GPZ-PARYTET cz. 2 (pkt 1): transformator pola i jego grupa połączeń z modelu.
      ...(transformatorPola
        ? {
            transformerRef: transformatorPola.ref_id,
            transformerVectorGroup:
              typeof transformatorPola.vector_group === 'string' ? transformatorPola.vector_group : null,
          }
        : {}),
      cbState: states.cbState,
      dsState: states.dsState,
      esState: states.esState,
      // W1 (RECENZJA_L2 §1/§12.1, V12K-145): tor pierwotny Z DANYCH, gdy pole niesie
      // zmaterializowane aparaty; `undefined` → konwencja §12.4.
      primaryDevices: projectBayPrimaryDevices(bay, branchByRef),
      // W1c (uwaga 10): identyfikator konfiguracji pola przepisany 1:1 (klucz
      // nieprzezroczysty — pin `enmToSldAdapter.configIdOpaque.test.ts`).
      configId: bay.config_id ?? undefined,
      // GEOMETRIA-STACJI (§0 pkt 5): pole rezerwowe (rodzaj pola katalogowego) albo wolne
      // (pole liniowe bez odcinka na zacisku) — jedna para predykatów `rodzajStacji.ts`.
      ...(czyPoleRezerwowe(bay)
        ? { reserve: 'rezerwowe' as const }
        : czyPoleWolne(bay, galezieMigawki) ? { reserve: 'wolne' as const } : {}),
      ...(bay.outgoing_destination_ref
        ? { destinationName: nazwaCeluOdejscia(snapshot, bay.outgoing_destination_ref) }
        : {}),
    };
  });
}

/** GEOMETRIA-STACJI (§0 pkt 5): nazwa celu odejścia pola — `Bay.outgoing_destination_ref`
 *  wskazuje stację docelową (`backend/src/enm/models.py`); nazwa stacji z modelu, a gdy
 *  model jej nie zna — sam ref (bez domysłu). Jedna funkcja dla stacji i GPZ. */
export function nazwaCeluOdejscia(
  snapshot: Pick<EnergyNetworkModel, 'substations'>,
  ref: string,
): string {
  const stacja = (snapshot.substations ?? []).find((s) => s.ref_id === ref || s.id === ref);
  const nazwa = typeof stacja?.name === 'string' ? stacja.name.trim() : '';
  return nazwa || ref;
}

function buildDedicatedDerStationMiniBays(
  snapshot: EnergyNetworkModel,
  station: Substation,
  existingBays: readonly MiniBlockBayDescriptor[],
): MiniBlockBayDescriptor[] {
  const existingDerRoles = new Set<FieldRole>(
    existingBays
      .map((bay) => bay.fieldRole)
      .filter((role) => role === FIELD_ROLE.DER_PV || role === FIELD_ROLE.DER_BESS || role === FIELD_ROLE.DER_FW),
  );
  const roleCounters = new Map<FieldRole, number>();
  const stationRefs = new Set([station.ref_id, station.id].filter(Boolean));
  return [...(snapshot.generators ?? [])]
    .filter((gen) => stationRefs.has(generatorStationRef(gen) ?? ''))
    .filter((gen) => isDedicatedMvDerConnection(gen.connection_variant))
    .sort((a, b) => a.ref_id.localeCompare(b.ref_id, 'pl'))
    .flatMap((gen): MiniBlockBayDescriptor[] => {
      const kind = mapGenTypeToDerKind(gen);
      const fieldRole = derFieldRoleForGenerator(kind);
      if (!fieldRole || existingDerRoles.has(fieldRole)) return [];
      const index = (roleCounters.get(fieldRole) ?? 0) + 1;
      roleCounters.set(fieldRole, index);
      return [{
        bayRef: `${station.ref_id}/der-bay/${sanitizeRefToken(gen.ref_id)}`,
        fieldRole,
        designation: index === 1 ? derFieldDesignation(fieldRole) : `${derFieldDesignation(fieldRole)} ${index}`,
        hasMissingRequiredDevice:
          !gen.catalog_ref ||
          (gen.connection_variant === 'block_transformer' && !gen.blocking_transformer_ref),
        // GPZ-PARYTET cz. 2 (pkt 2): pole wyprowadzone z przyłączenia źródła nie ma w ENM
        // gałęzi łączeniowych ani rekordów aparatów — stan NIEUSTALONY, rysowany jawnie
        // (dawne zaszyte `closed/closed/open` udawało stan, którego model nie niesie).
        cbState: 'unknown',
        dsState: 'unknown',
        esState: 'unknown',
        // GEOMETRIA-STACJI (Z-03): sekcja z szyny przyłączenia wytwórcy (`Generator.bus_ref`).
        ...sekcjaPola(snapshot, station, gen.bus_ref),
      }];
    });
}

/** GEOMETRIA-STACJI (Z-03): sekcja (szyna główna) stacji dla szyny przyłączenia — reguła
 *  `szynaGlownaStacji` (lustro backendu `szyny_stacji`). Brak = sekcja nieustalona. */
function sekcjaPola(
  snapshot: EnergyNetworkModel,
  station: Substation,
  busRef: string | null | undefined,
): { readonly sectionBusRef?: string } {
  if (typeof busRef !== 'string' || !busRef) return {};
  const sekcja = szynaGlownaStacji(snapshot, station, busRef);
  return sekcja ? { sectionBusRef: sekcja } : {};
}

/** GEOMETRIA-STACJI (Z-03): sekcje szyn SN stacji — jedna reguła
 *  `stationSnSectionBusRefs` (`shared/stationBusResolution.ts`). */
function stationSnSections(
  station: Substation,
  busByRef: ReadonlyMap<string, Bus>,
): StationSnSectionView[] {
  return stationSnSectionBusRefs(station, busByRef).map((busRef, index) => ({
    busRef,
    ordinal: index + 1,
    voltageKv: busByRef.get(busRef)?.voltage_kv ?? null,
  }));
}

function isDedicatedMvDerConnection(
  connectionVariant: string | null | undefined,
): boolean {
  return connectionVariant === 'block_transformer'
    || connectionVariant === 'DEDICATED_MV_CONNECTION'
    || connectionVariant === 'SOURCE_CONNECTION_STATION';
}


function derFieldDesignation(role: FieldRole): string {
  if (role === FIELD_ROLE.DER_PV) return 'PV';
  if (role === FIELD_ROLE.DER_BESS) return 'BESS';
  if (role === FIELD_ROLE.DER_FW) return 'FW';
  return 'OZE';
}



function sanitizeRefToken(ref: string): string {
  return ref.replace(/[^a-zA-Z0-9_.-]+/g, '_');
}

/** Rola pola na rysunku: rola kanoniczna (`field_role`), a bez niej rola modelu (`bay_role`);
 *  pole źródłowe `OZE` — z rodzaju przyłączonych wytwórców (`rolaPolaZrodlowego`). */
function stationFieldRole(
  bay: Bay,
  generatoryWgPola: ReadonlyMap<string, readonly Generator[]>,
): MiniBlockBayDescriptor['fieldRole'] {
  const kanoniczna = fieldRoleFromCatalogRole(getString(bay.field_role));
  if (kanoniczna) return kanoniczna;
  if (normalizeRole(bay.bay_role) === 'OZE') return rolaPolaZrodlowego(bay, generatoryWgPola);
  return fieldRoleFromBayRole(bay.bay_role) ?? FIELD_ROLE.LINE_BRANCH;
}

function fieldRoleFromCatalogRole(raw: string | undefined): MiniBlockBayDescriptor['fieldRole'] | null {
  const role = normalizeRole(raw);
  switch (role) {
    case 'LINIA_IN':
    case 'LINE_IN':
    case 'IN':
      return FIELD_ROLE.LINE_IN;
    case 'LINIA_OUT':
    case 'LINE_OUT':
    case 'OUT':
      return FIELD_ROLE.LINE_OUT;
    case 'LINIA_ODG':
    case 'LINE_BRANCH':
    case 'FEEDER':
      return FIELD_ROLE.LINE_BRANCH;
    case 'TRANSFORMATOROWE':
    case 'TRANSFORMER':
    case 'TR':
      return FIELD_ROLE.TRANSFORMER;
    case 'SPRZEGLO':
    case 'COUPLER':
      return FIELD_ROLE.COUPLER;
    case 'POMIAROWE':
    case 'MEASUREMENT':
      return FIELD_ROLE.MEASUREMENT;
    case 'PV_SN':
    case 'PV':
    case 'OZE_PV':
      return FIELD_ROLE.DER_PV;
    case 'BESS_SN':
    case 'BESS':
      return FIELD_ROLE.DER_BESS;
    case 'FW_SN':
    case 'FW':
    case 'FARMA_WIATROWA':
      return FIELD_ROLE.DER_FW;
    default:
      return null;
  }
}

function fieldRoleFromBayRole(raw: string | undefined): MiniBlockBayDescriptor['fieldRole'] | null {
  const role = normalizeRole(raw);
  switch (role) {
    case 'IN':
      return FIELD_ROLE.LINE_IN;
    case 'OUT':
      return FIELD_ROLE.LINE_OUT;
    case 'FEEDER':
      return FIELD_ROLE.LINE_BRANCH;
    case 'TR':
      return FIELD_ROLE.TRANSFORMER;
    case 'COUPLER':
      return FIELD_ROLE.COUPLER;
    case 'MEASUREMENT':
      return FIELD_ROLE.MEASUREMENT;
    case 'PV_SN':
      return FIELD_ROLE.DER_PV;
    case 'BESS_SN':
      return FIELD_ROLE.DER_BESS;
    case 'FW_SN':
      return FIELD_ROLE.DER_FW;
    default:
      return null;
  }
}

function stationFieldDesignation(bay: Bay, role: FieldRole, index: number): string {
  switch (role) {
    case FIELD_ROLE.LINE_IN:
      return 'WE';
    case FIELD_ROLE.LINE_OUT:
      return 'WY';
    case FIELD_ROLE.LINE_BRANCH:
      return 'ODG';
    case FIELD_ROLE.TRANSFORMER:
      return 'TR';
    case FIELD_ROLE.COUPLER:
      return 'SPR';
    case FIELD_ROLE.MEASUREMENT:
      return 'POM';
    case FIELD_ROLE.DER_PV:
      return 'PV';
    case FIELD_ROLE.DER_BESS:
      return 'BESS';
    case FIELD_ROLE.DER_FW:
      return 'FW';
    case FIELD_ROLE.DER_UNKNOWN:
      return 'OZE';
    default:
      return getString(bay.name) ?? `Pole SN ${index + 1}`;
  }
}

function normalizeRole(raw: string | undefined): string {
  return (raw ?? '').trim().toUpperCase();
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}


// =============================================================================
// F9.2 (SLD_CAD_SPEC_V3 §12.1) — projekcja Bay.primary_devices
// =============================================================================

/**
 * W1 (RECENZJA_L2 §1/§12.1, V12K-145) — DOMKNIĘCIE STOP-notatki F9.2. Backend
 * SERIALIZUJE `primary_devices` na `Bay(ENMElement)` w `EnergyNetworkModel` —
 * zmaterializowane z szablonu kreatora (`aparaty_pola_z_referencji`, wspólny resolver
 * pola) przez builder pola `enm.pola.zbuduj_pole`. Karta W5-B: rekord `bays` jest JEDYNYM
 * nośnikiem pól, więc adapter czyta je z jednej ścieżki (`projectBayPrimaryDevices(bay)`
 * niżej — blok stacji i blok GPZ).
 * `BayWithOptionalPrimaryDevices` pozostaje jako alias historyczny (`Bay` już
 * niesie opcjonalne `primary_devices` — `types/enm.ts`); projekcja zwraca
 * `undefined` dla pól bez danych (ścieżka konwencji §12.4, zero regresu).
 */
export type BayWithOptionalPrimaryDevices = Bay & {
  readonly primary_devices?: readonly BayPrimaryDevice[];
};

const PRIMARY_DEVICE_PLACEMENT_ORDER: Readonly<Record<BayPrimaryPlacement, number>> = {
  UPSTREAM: 0,
  MIDSTREAM: 1,
  DOWNSTREAM: 2,
  OFF_PATH: 3,
  GROUND_BRANCH: 4,
};

/**
 * Projekcja `Bay.primary_devices` → `BayPrimaryDeviceView[]`, posortowana wg
 * `placement` (UPSTREAM→MIDSTREAM→DOWNSTREAM→OFF_PATH→GROUND_BRANCH) ze
 * stabilnym tie-breakerem = kolejność źródłowa z ENM (indeks w tablicy).
 * `undefined` gdy pole nie niesie `primary_devices` (ścieżka konwencji §12.4).
 * W1 (V12K-145): AKTYWNA na realnych snapshotach — rekordy `bays` niosą
 * zmaterializowane aparaty kreatora (patrz nota `BayWithOptionalPrimaryDevices`
 * powyżej). Parametr zwężony do `{primary_devices?}` (jedyne czytane pole).
 *
 * F11.1 (SLD_CAD_SPEC_V3 §17.2/§20.1, rejestr device-ref w GPZ): eksportowana
 * — `v2/canvas/enmToCanonicalGpzAdapter.ts` reużywa TĘ SAMĄ funkcję dla
 * `CanonicalGpzBay.primaryDevices` (jedna prawda stacja↔GPZ, zero duplikacji).
 */
export function projectBayPrimaryDevices(
  bay: {
    readonly primary_devices?: readonly BayPrimaryDevice[] | null;
    readonly equipment_refs?: readonly string[] | null;
  },
  // GPZ-PARYTET cz. 2 (pkt 2): gałęzie migawki po `ref_id` — stan aparatu z `status` jego
  // gałęzi łączeniowej (`stanAparatuZModelu`), nie z samego rekordu.
  galezieWgRef: ReadonlyMap<string, Branch>,
): readonly BayPrimaryDeviceView[] | undefined {
  const devices = bay.primary_devices;
  if (!devices || devices.length === 0) return aparatyZGaleziPola(bay.equipment_refs ?? [], galezieWgRef);
  return devices
    .map((device, sourceIndex) => ({ device, sourceIndex }))
    .sort((a, b) => {
      const placementDelta =
        PRIMARY_DEVICE_PLACEMENT_ORDER[a.device.placement] - PRIMARY_DEVICE_PLACEMENT_ORDER[b.device.placement];
      return placementDelta !== 0 ? placementDelta : a.sourceIndex - b.sourceIndex;
    })
    .map(({ device }): BayPrimaryDeviceView => ({
      kind: device.kind,
      placement: device.placement,
      sectionSide: device.section_side ?? null,
      deviceRef: device.device_ref,
      switchState: stanAparatuZModelu(device, devices, galezieWgRef),
      // F9.9 (SLD_CAD_SPEC_V3 §17.2): `linked_ref` — dla CT/VT wskazuje
      // `Measurement.ref_id` (patrz `BayProtectionMarkingView` docstring).
      linkedRef: device.linked_ref ?? undefined,
      // F10.6 (SLD_CAD_SPEC_V3 §19.1, D1, V12K-035): identyfikator per-aparat
      // jako dana projektowa — patrz `BayPrimaryDeviceView.designation`.
      designation: device.designation ?? undefined,
      pochodzenie: 'rekord_pola',
      typeRef: device.catalog_ref ?? null,
    }));
}

/** Klasa wyrobu z katalogu (`materialized_params.device_kind`) → rodzaj aparatu pola —
 *  lustro `_DEVICE_KIND_NA_TYP_GALEZI` backendu (`enm/domain_operations.py`), które z tej
 *  samej klasy wybiera typ gałęzi. Pierwszeństwo przed typem gałęzi: typ `disconnector`
 *  niesie i odłącznik, i uziemnik. */
const RODZAJ_APARATU_Z_KLASY_WYROBU: Readonly<Record<string, BayPrimaryDeviceKind>> = {
  WYLACZNIK: 'CB',
  REKLOZER: 'CB',
  ROZLACZNIK: 'LOAD_SWITCH',
  ROZLACZNIK_BEZPIECZNIKOWY: 'FUSE',
  ODLACZNIK: 'DS',
  UZIEMNIK: 'ES',
};

/** Typ gałęzi łączeniowej → rodzaj aparatu pola, gdy klasa wyrobu nie przesądza. Sprzęgło
 *  (`bus_coupler`) NIE jest aparatem pola — rysuje się między sekcjami (`sprzeglaSekcji.ts`). */
const RODZAJ_APARATU_Z_TYPU_GALEZI: Readonly<Record<string, BayPrimaryDeviceKind>> = {
  breaker: 'CB',
  switch: 'LOAD_SWITCH',
  disconnector: 'DS',
  fuse: 'FUSE',
};

/**
 * GEOMETRIA-STACJI (§0 pkt 4a): aparaty pola z GAŁĘZI łączeniowych modelu wskazanych
 * w `Bay.equipment_refs`, gdy pole nie niesie `primary_devices`. Operacja budowy stacji
 * tworzy aparat główny każdego pola SN jako gałąź z pozycji katalogu (B-12) — to jest
 * rekord aparatu w modelu: rysunek pokazuje jego symbol (z klasy wyrobu albo typu gałęzi),
 * stan (`Branch.status`), typ (`catalog_ref`) i tożsamość (`deviceRef` = ref gałęzi).
 * Brak takich gałęzi = `undefined` (pole bez danych wyposażenia, sylwetka
 * `bayNoEquipment`). Kolejność: wg kolejności `equipment_refs` (dana rekordu pola).
 */
function aparatyZGaleziPola(
  equipmentRefs: readonly string[],
  galezieWgRef: ReadonlyMap<string, Branch>,
): readonly BayPrimaryDeviceView[] | undefined {
  const aparaty: BayPrimaryDeviceView[] = [];
  for (const ref of equipmentRefs) {
    const galaz = galezieWgRef.get(ref);
    if (!galaz) continue;
    const klasa = galaz.materialized_params?.['device_kind'];
    const kind =
      (typeof klasa === 'string' ? RODZAJ_APARATU_Z_KLASY_WYROBU[klasa.trim().toUpperCase()] : undefined)
      ?? RODZAJ_APARATU_Z_TYPU_GALEZI[galaz.type];
    if (!kind || galaz.type === 'bus_coupler') continue;
    aparaty.push({
      kind,
      placement: 'MIDSTREAM',
      sectionSide: null,
      deviceRef: galaz.ref_id,
      ...(galaz.type === 'fuse' ? {} : { switchState: stanStatusuGalezi(galaz.status) }),
      pochodzenie: 'galaz_pola',
      typeRef: galaz.catalog_ref ?? null,
    });
  }
  return aparaty.length > 0 ? aparaty : undefined;
}

// =============================================================================
// F9.9 (SLD_CAD_SPEC_V3 §17.2) — projekcja oznaczenia zabezpieczeń.
// =============================================================================

/**
 * Projekcja adnotacji zabezpieczeń JEDNEGO pola (§17.2, zero zgadywania):
 * `Bay.protection_codes` (WYŁĄCZNIE gdy niepuste — inaczej `undefined`, „brak
 * danych = brak oznaczenia") + `Bay.protection_ref` rozwiązany na
 * `ProtectionAssignment` w `snapshot.protection_assignments` (SUROWE refy
 * `breaker_ref`/`ct_ref` — dopasowanie na aparat NARYSOWANEGO stosu dzieje
 * się w `compose/protectionMarking.ts`, ten adapter nie zna geometrii).
 * Zgodnie z modelem `Bay(ENMElement)` (`backend/src/enm/models.py:701-714`) —
 * w PRZECIWIEŃSTWIE do `primary_devices` (errata E1/V12K-030), `protection_codes`
 * i `protection_ref` żyją WPROST na snapshot `Bay`, nie na field-view — bez
 * defensywnego szwu (kanał danych już domknięty).
 *
 * F11.1 (SLD_CAD_SPEC_V3 §17.2/§20.1, rejestr device-ref w GPZ): eksportowana,
 * `snapshot` zwężony do `Pick<..., 'protection_assignments'>` (jedyne pole
 * faktycznie czytane) — `v2/canvas/enmToCanonicalGpzAdapter.ts` reużywa TĘ
 * SAMĄ funkcję dla `CanonicalGpzBay.protectionMarking` bez potrzeby całego
 * `EnergyNetworkModel` (adapter GPZ dostaje węższy `Pick`, patrz
 * `BuildCanonicalGpzOptions`/`buildCanonicalGpzProps`).
 */
export function resolveBayProtectionMarking(
  bay: Bay,
  snapshot: Pick<EnergyNetworkModel, 'protection_assignments'>,
): BayProtectionMarkingView | undefined {
  const codes = bay.protection_codes ?? [];
  if (codes.length === 0) return undefined;
  const assignment = bay.protection_ref
    ? (snapshot.protection_assignments ?? []).find(
        (pa: ProtectionAssignment) => pa.ref_id === bay.protection_ref || pa.id === bay.protection_ref,
      )
    : undefined;
  return {
    codes,
    breakerRef: assignment?.breaker_ref,
    ctRef: assignment?.ct_ref ?? undefined,
    // F10.6 (SLD_CAD_SPEC_V3 §20.2, D5, V12K-036): CT dodatkowe strefy
    // różnicowej (87T) — `undefined` gdy puste (dana strefy niedostarczona,
    // patrz `BayProtectionMarkingView.ctRefsSecondary` docstring).
    ctRefsSecondary:
      assignment?.ct_refs_secondary && assignment.ct_refs_secondary.length > 0
        ? assignment.ct_refs_secondary
        : undefined,
  };
}

/**
 * F10.4 (SLD_CAD_SPEC_V3 §18.3, CT opisany — część BEZ-DOMAIN): projekcja
 * adnotacji przekładni CT tego pola — WSZYSTKIE `Measurement{measurement_type:
 * 'CT', bay_ref}` pomiary tego pola, niezależnie od `purpose` (§18.3 dotyczy
 * KAŻDEGO CT toru głównego, nie tylko rozliczeniowego — nie tylko pomiaru
 * `purpose==='metering'` dla miernika „M"). Identyfikator = `Measurement.name`
 * (pole engineering-friendly — `ref_id` jest technicznym slugiem, wzorzec
 * §19.2 „numer/nazwa linii" = `.name`, NIE `.ref_id`). Przekładnia = surowe
 * `rating.ratio_primary`/`ratio_secondary` sformatowane jako „primary/
 * secondary" (CZYSTE formatowanie — zero zaokrągleń/fizyki). Dopasowanie na
 * KONKRETNY aparat NARYSOWANEGO stosu (`linked_ref` match) dzieje się w
 * `compose/protectionMarking.ts` `resolveCtRatingAnnotations` (adapter nie
 * zna geometrii — wzorzec `resolveBayProtectionMarking`). `undefined` gdy
 * pole nie ma żadnego CT (brak danych = brak oznaczenia, §18.3 dosłownie).
 * F10.6 (D3, V12K-036): układ pomiarowy (`Measurement.ct_arrangement`)
 * przekazywany 1:1 jako `arrangement` — `undefined` gdy dana niedostarczona
 * (adnotacja rysuje sam identyfikator+przekładnię, zero zgadywania).
 *
 * F11.1 (SLD_CAD_SPEC_V3 §18.3, rejestr device-ref w GPZ): eksportowana,
 * `snapshot` zwężony do `Pick<..., 'measurements'>` — `v2/canvas/
 * enmToCanonicalGpzAdapter.ts` reużywa TĘ SAMĄ funkcję dla
 * `CanonicalGpzBay.ctRatingAnnotations` (jedna prawda stacja↔GPZ).
 */
export function resolveBayCtRatingAnnotations(
  bay: Bay,
  snapshot: Pick<EnergyNetworkModel, 'measurements'>,
): readonly CtRatingAnnotationView[] | undefined {
  const measurements = (snapshot.measurements ?? []).filter(
    (m: Measurement) => m.measurement_type === 'CT' && m.bay_ref === bay.ref_id,
  );
  if (measurements.length === 0) return undefined;
  return measurements.map((m) => ({
    measurementRef: m.ref_id,
    identifier: m.name,
    ratioText: `${m.rating.ratio_primary}/${m.rating.ratio_secondary}`,
    arrangement: m.ct_arrangement ?? undefined,
    // W5 (§12–15/uwaga 7): przeznaczenie CT (pomiarowy/zabezpieczeniowy/łączony)
    // 1:1 z `Measurement.purpose` — dana wariantu, zero domysłu. Kanał
    // geometrycznie neutralny (patrz `CtRatingAnnotationView.purpose`).
    purpose: m.purpose,
    // CTVT-RENDER (CTVT-MODEL/V12K-176): liczba rdzeni CT 1:1 z
    // `Measurement.ct_cores` — dana producenta (IEC 61869-2), doklejana do
    // etykiety WYŁĄCZNIE gdy obecna (`undefined` gdy `null`/brak — uczciwy brak,
    // zero fabrykacji). Domyka konsumenta-render danej wprowadzonej w V12K-176.
    cores: m.ct_cores ?? undefined,
  }));
}

/**
 * CTVT-RENDER (SLD_CAD_SPEC_V3 §20.2, CTVT-MODEL/V12K-176): projekcja adnotacji
 * montażu VT (`Measurement.vt_mounting`) WSZYSTKICH pomiarów VT tego pola z
 * ustawioną daną. `undefined` gdy pole nie ma żadnego VT niosącego `vt_mounting`
 * (brak danych = brak oznaczenia, §20.2 dosłownie). Dopasowanie na aparat
 * NARYSOWANEGO stosu (compose) — TA SAMA reguła co `resolveBayCtRatingAnnotations`
 * (identyfikator = `Measurement.name`, kotwica przez `linked_ref`). Domyka
 * konsumenta-render danej `vt_mounting` wprowadzonej w V12K-176. Oś odrębna od
 * układu VT (`Measurement.vt_arrangement`, open_delta/star = 3U0).
 */
export function resolveBayVtMountings(
  bay: Bay,
  snapshot: Pick<EnergyNetworkModel, 'measurements'>,
): readonly VtMountingAnnotationView[] | undefined {
  const measurements = (snapshot.measurements ?? []).filter(
    (m: Measurement) =>
      m.measurement_type === 'VT' && m.bay_ref === bay.ref_id && m.vt_mounting != null,
  );
  if (measurements.length === 0) return undefined;
  return measurements.map((m) => ({
    measurementRef: m.ref_id,
    identifier: m.name,
    mounting: m.vt_mounting as 'bus' | 'cable',
  }));
}

function mapStationBayRoleToMiniRole(fieldRole: MiniBlockBayDescriptor['fieldRole']): MiniBlockBayDescriptor['fieldRole'] {
  if (
    fieldRole === FIELD_ROLE.LINE_IN ||
    fieldRole === FIELD_ROLE.LINE_OUT ||
    fieldRole === FIELD_ROLE.LINE_BRANCH ||
    fieldRole === FIELD_ROLE.GPZ_LINE_BAY
  ) {
    return FIELD_ROLE.RMU_LINE;
  }
  if (fieldRole === FIELD_ROLE.TRANSFORMER) return FIELD_ROLE.RMU_TRANSFORMER;
  return fieldRole;
}

function generatorStationRef(gen: Generator): string | null {
  return gen.station_ref ?? (typeof gen.meta?.station_ref === 'string' ? gen.meta.station_ref : null);
}

/** Podpis rodzaju stacji na rysunku — rodzaj WYPROWADZONY z topologii JEDNĄ regułą
 *  (`ui/shared/rodzajStacji.ts`, lustro backendu `enm/rodzaj_stacji.py`, SLD_CAD_SPEC_V3
 *  §19.3, V12K-034). Dawne 1:1 mapowanie deklaracji `station_type` (z cichym domyślnym
 *  „końcowa" dla `mv_lv`, `customer`, `switching`) skasowane: deklaracja służy wyłącznie
 *  walidacji (walidator backendu W043). Stacja pola (`FIELD_STATION_KINDS`) zawsze ma rodzaj
 *  — brak wyniku to naruszenie niezmiennika (GPZ albo rozdzielnica nN w stacjach pól). */
function stationTopologicalType(
  snapshot: EnergyNetworkModel,
  station: Substation,
): StationOnRunViewModel['topologicalType'] {
  const wynik = rodzajStacji(snapshot, station.ref_id);
  if (!wynik) {
    throw new Error(
      `Stacja pola „${station.name}" bez rodzaju topologicznego — rodzaj nie dotyczy GPZ ani rozdzielnicy nN.`,
    );
  }
  return NAZWA_RODZAJU_STACJI_PL[wynik.rodzaj];
}

// -----------------------------------------------------------------------------
// Cable runs (kable + linie napowietrzne SN)
// -----------------------------------------------------------------------------

/**
 * Buduje syntetyczne line_runs gdy ENM nie ma jawnie zdefiniowanych line_runs
 * ALE branches tworzą łańcuch GPZ → station → station → ... łączony przez
 * from_bus_ref/to_bus_ref. Bez tego adapter wpada w fallback "każda branch =
 * osobna prosta linia" co dla K30 (30 cables) daje 30 stacked horizontal lines
 * zamiast jednego głównego ciągu. Adresuje user feedback K30 visualization.
 */
function inferLineRunsFromBranchChain(
  snapshot: EnergyNetworkModel,
  cables: readonly Branch[],
  stations: readonly StacjaCiagu[],
): Array<{
  id: string;
  segments: Array<{ segment_ref: string; order: number }>;
  stations: Array<{ substation_ref: string; order: number }>;
}> {
  if (cables.length === 0) return [];

  // Korzenie łańcuchów: szyny GPZ z jednego lustra `szynyStacji` (SZYNY-STACJI-LUSTRO) —
  // szyny główne GPZ i zaciski jego pól (odcinek wychodzi z zacisku pola GPZ), bez
  // rozpoznawania szyn po wzorcu nazwy.
  const gpzBusRefs = new Set<string>();
  for (const s of snapshot.substations ?? []) {
    if (s.station_type === 'gpz') {
      for (const ref of szynyStacji(snapshot, s)) gpzBusRefs.add(ref);
    }
  }

  const graphRuns = inferLineRunsFromMvBusGraph(snapshot, cables, stations, gpzBusRefs);
  if (graphRuns.length > 0) return graphRuns;

  const outgoing = new Map<string, Branch>();
  for (const c of cables) {
    if (typeof c.from_bus_ref === 'string') outgoing.set(c.from_bus_ref, c);
  }

  const rootBuses: string[] = [];
  for (const busRef of outgoing.keys()) {
    if (gpzBusRefs.has(busRef)) rootBuses.push(busRef);
  }
  if (rootBuses.length === 0) return [];

  // Stacja na końcu kabla — z tego samego lustra, zawężona do stacji rysowanych na ciągach.
  const stationIds = new Set(stations.map((s) => s.id));
  const stationByBusRef = stacjaSzyn(
    snapshot,
    (snapshot.substations ?? []).filter((station) => stationIds.has(station.ref_id)),
  );

  const visited = new Set<string>();
  const synthRuns: ReturnType<typeof inferLineRunsFromBranchChain> = [];

  for (const rootBus of rootBuses) {
    if (visited.has(rootBus)) continue;
    const chain: Branch[] = [];
    const chainStationRefs: string[] = [];
    let currentBus: string | null = rootBus;
    let safetyCounter = 0;
    while (currentBus && outgoing.has(currentBus) && safetyCounter < 1000) {
      const cable: Branch = outgoing.get(currentBus) as Branch;
      if (visited.has(currentBus)) break;
      visited.add(currentBus);
      chain.push(cable);
      const stationRef = cable.to_bus_ref ? stationByBusRef.get(cable.to_bus_ref) : undefined;
      if (stationRef && !chainStationRefs.includes(stationRef)) {
        chainStationRefs.push(stationRef);
      }
      currentBus = cable.to_bus_ref ?? null;
      safetyCounter += 1;
    }
    if (chain.length > 0) {
      synthRuns.push({
        id: `synth_trunk_${synthRuns.length}`,
        segments: chain.map((c, i) => ({ segment_ref: c.ref_id, order: i + 1 })),
        stations: chainStationRefs.map((ref, i) => ({ substation_ref: ref, order: i + 1 })),
      });
    }
  }

  return synthRuns;
}

function inferLineRunsFromMvBusGraph(
  snapshot: EnergyNetworkModel,
  cables: readonly Branch[],
  stations: readonly StacjaCiagu[],
  gpzBusRefs: ReadonlySet<string>,
): ReturnType<typeof inferLineRunsFromBranchChain> {
  if (stations.length === 0 || cables.length === 0) return [];

  const stationIds = new Set(stations.map((s) => s.id));
  const busVoltageByRef = new Map<string, number>();
  for (const bus of snapshot.buses ?? []) {
    if (typeof bus.ref_id === 'string' && typeof bus.voltage_kv === 'number') {
      busVoltageByRef.set(bus.ref_id, bus.voltage_kv);
    }
    if (typeof bus.id === 'string' && typeof bus.voltage_kv === 'number') {
      busVoltageByRef.set(bus.id, bus.voltage_kv);
    }
  }

  // SZYNY-STACJI-LUSTRO: szyny stacji z jednego lustra `szynyStacji` (szyny główne, zaciski
  // pól SN — odcinek przyłączony do zacisku pola wchodzi do stacji — i końce aparatów pól
  // nN), zawężone do strony SN (graf ciągów SN). Bez szyn zgadywanych po wzorcu nazwy.
  const stationByBusRef = new Map<string, string>();
  const busRefsByStationRef = new Map<string, string[]>();
  for (const [busRef, stationRef] of stacjaSzyn(
    snapshot,
    (snapshot.substations ?? []).filter((substation) => stationIds.has(substation.ref_id)),
  )) {
    const voltageKv = busVoltageByRef.get(busRef);
    if (voltageKv !== undefined && !powyzejPasmaNn(voltageKv)) continue;
    stationByBusRef.set(busRef, stationRef);
    busRefsByStationRef.set(stationRef, [...(busRefsByStationRef.get(stationRef) ?? []), busRef]);
  }

  const outgoing = new Map<string, Branch[]>();
  for (const cable of [...cables].sort((a, b) => a.ref_id.localeCompare(b.ref_id))) {
    if (typeof cable.from_bus_ref !== 'string') continue;
    const list = outgoing.get(cable.from_bus_ref) ?? [];
    list.push(cable);
    outgoing.set(cable.from_bus_ref, list);
  }

  const stationRootBuses = [...busRefsByStationRef.values()]
    .flat()
    .filter((busRef) => outgoing.has(busRef));
  const rootBuses = uniqueStrings([...outgoing.keys(), ...stationRootBuses])
    .filter((busRef) => gpzBusRefs.has(busRef) || stationByBusRef.has(busRef))
    .sort();
  if (rootBuses.length === 0) return [];

  const visitedSegments = new Set<string>();
  const runs: ReturnType<typeof inferLineRunsFromBranchChain> = [];
  for (const rootBus of rootBuses) {
    const chain: Branch[] = [];
    const chainStationRefs: string[] = [];
    let frontier = [rootBus];
    let safetyCounter = 0;

    while (frontier.length > 0 && safetyCounter < 1000) {
      const cable = pickNextOutgoingCable(outgoing, frontier, visitedSegments);
      if (!cable) break;
      visitedSegments.add(cable.ref_id);
      chain.push(cable);

      const stationRef = cable.to_bus_ref ? stationByBusRef.get(cable.to_bus_ref) ?? null : null;
      if (stationRef && !chainStationRefs.includes(stationRef)) {
        chainStationRefs.push(stationRef);
      }
      frontier = uniqueStrings([
        ...(typeof cable.to_bus_ref === 'string' ? [cable.to_bus_ref] : []),
        ...(stationRef ? busRefsByStationRef.get(stationRef) ?? [] : []),
      ]);
      safetyCounter += 1;
    }

    if (chain.length > 0 && chainStationRefs.length > 0) {
      runs.push({
        id: `synth_trunk_${runs.length}`,
        segments: chain.map((c, i) => ({ segment_ref: c.ref_id, order: i + 1 })),
        stations: chainStationRefs.map((ref, i) => ({ substation_ref: ref, order: i + 1 })),
      });
    }
  }

  return runs;
}

function pickNextOutgoingCable(
  outgoing: ReadonlyMap<string, readonly Branch[]>,
  frontier: readonly string[],
  visitedSegments: ReadonlySet<string>,
): Branch | null {
  for (const busRef of uniqueStrings(frontier).sort()) {
    const next = (outgoing.get(busRef) ?? []).find((branch) => !visitedSegments.has(branch.ref_id));
    if (next) return next;
  }
  return null;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function branchPointMainSegmentRefs(
  branchPoint: BranchPointSN,
  branchByRef: ReadonlyMap<string, Branch>,
): string[] {
  const runtimeRefs = getStringArray(branchPoint.runtime_inputs?.main_segment_refs)
    .filter((segmentRef) => branchByRef.has(segmentRef));
  if (runtimeRefs.length > 0) {
    return orderBranchPointMainSegmentRefs(branchPoint, runtimeRefs, branchByRef);
  }

  const occupiedBranchRefs = new Set(
    Object.values(branchPoint.branch_occupied ?? {})
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
  );
  const expectedType = branchPoint.branch_point_type === 'branch_pole' ? 'line_overhead' : 'cable';
  const connected = [...branchByRef.values()]
    .filter((branch) =>
      (branch.from_bus_ref === branchPoint.bus_ref || branch.to_bus_ref === branchPoint.bus_ref)
      && branch.type === expectedType
      && !occupiedBranchRefs.has(branch.ref_id),
    )
    .map((branch) => branch.ref_id);
  return orderBranchPointMainSegmentRefs(branchPoint, connected, branchByRef);
}

function orderBranchPointMainSegmentRefs(
  branchPoint: BranchPointSN,
  segmentRefs: readonly string[],
  branchByRef: ReadonlyMap<string, Branch>,
): string[] {
  return [...new Set(segmentRefs)]
    .sort((a, b) => {
      const branchA = branchByRef.get(a);
      const branchB = branchByRef.get(b);
      const rankA = branchA ? branchPointMainSegmentRank(branchPoint, branchA) : 9;
      const rankB = branchB ? branchPointMainSegmentRank(branchPoint, branchB) : 9;
      if (rankA !== rankB) return rankA - rankB;
      return a.localeCompare(b);
    });
}

function branchPointMainSegmentRank(branchPoint: BranchPointSN, branch: Branch): number {
  const mainIn = branchPoint.ports?.MAIN_IN;
  const mainOut = branchPoint.ports?.MAIN_OUT;
  if (mainIn && branchTouchesBus(branch, mainIn)) return 0;
  if (mainOut && branchTouchesBus(branch, mainOut)) return 1;
  if (branch.to_bus_ref === branchPoint.bus_ref) return 0;
  if (branch.from_bus_ref === branchPoint.bus_ref) return 1;
  return 2;
}

function branchTouchesBus(branch: Branch, busRef: string): boolean {
  return branch.from_bus_ref === busRef || branch.to_bus_ref === busRef;
}

/** Przynależność szyn do stacji końcówek odcinków — obie mapy z jednego lustra
 *  `szynyStacji` (SZYNY-STACJI-LUSTRO): `polowe` na stacjach pól (kotwice ciągu),
 *  `wszystkie` na wszystkich stacjach modelu, z GPZ (właściciel końcówki odcinka). */
interface PrzynaleznoscSzyn {
  readonly polowe: ReadonlyMap<string, string>;
  readonly wszystkie: ReadonlyMap<string, string>;
}

function przynaleznoscSzyn(
  snapshot: EnergyNetworkModel,
  fieldStationByRef: ReadonlyMap<string, Substation>,
): PrzynaleznoscSzyn {
  return {
    polowe: fieldStationByBusRef(snapshot, fieldStationByRef),
    wszystkie: stacjaSzyn(snapshot),
  };
}

/**
 * Tożsamość terminala (busRef + owner) z końcówki gałęzi ENM — każdy odcinek ciągu
 * jest terminal-to-terminal (from_bus → to_bus), bez krawędzi „tylko-współrzędne"
 * (§16, E03).
 */
function segmentTerminalOf(
  busRef: string | null | undefined,
  szyny: PrzynaleznoscSzyn,
): SegmentTerminalRef {
  return {
    busRef: busRef ?? null,
    ownerRef: busRef
      ? (resolveFieldStationRefForBus(szyny.polowe, busRef)
        ?? szyny.wszystkie.get(busRef)
        ?? null)
      : null,
  };
}

/**
 * Ciągi kablowe/linii SN widoku: tożsamość ciągu (rodzaj, odcinki, napięcie) oraz
 * terminale odcinków z ENM (§16) i etykiety odcinków — to, co czyta scena v3
 * (`v3/scene/buildScene.ts`). Geometria ciągu liczy wyłącznie układ v3; adapter nie
 * niesie współrzędnych (karta GPZ-PARYTET cz. 3: martwe pola widoku skasowane).
 */
function buildCableRuns(
  snapshot: EnergyNetworkModel,
  logicalViews: LogicalViewsV1 | null,
  stations: readonly StacjaCiagu[],
): CableRunRendererPropsLight[] {
  const koncowki = indeksKoncowek(snapshot);
  const branches = (snapshot.branches ?? [])
    .filter((branch) => isCableLikeBranch(branch) && isMediumVoltageNetworkBranch(koncowki.szyny, branch));
  const fieldStationByRef = collectFieldStationByRef(snapshot);
  const lineRuns = buildSldLineRunsForLayout(snapshot, fieldStationByRef);
  const szyny = przynaleznoscSzyn(snapshot, fieldStationByRef);
  const ciag = (
    id: string,
    runKind: CableRunRendererPropsLight['runKind'],
    segments: readonly Branch[],
    labelSegments: readonly Branch[],
    segmentKind: CableRunRendererPropsLight['segmentKind'],
  ): CableRunRendererPropsLight => ({
    id,
    runKind,
    segmentKind,
    segmentRefs: segments.map((segment) => segment.ref_id),
    segmentPaths: buildRunSegmentPaths(segments, szyny),
    label: buildCableRunLabel(labelSegments, segmentKind),
    segmentLabels: buildRunSegmentLabels(segments),
    voltageKv: inferRunVoltageKv(snapshot, segments),
  });

  if (lineRuns.length > 0) {
    return lineRuns.map((lineRun) => {
      // R2: odcinek deklarowany rozwija się do RZECZYWISTYCH gałęzi (połówki
      // cięte łącznikami) — terminale i etykiety liczą się z realnych odcinków.
      const runSegments = lineRunSegmentRefs(lineRun)
        .flatMap((segmentRef) => expandSegmentRefToBranches(segmentRef, branches));
      const firstSegment = runSegments[0] ?? branches[0] ?? null;
      const segmentKind = firstSegment ? classifySegmentKind(firstSegment) : 'cable_sn';
      const labelSegments = runSegments.length > 0 ? runSegments : firstSegment ? [firstSegment] : [];
      return ciag(lineRun.id, lineRun.run_kind, runSegments, labelSegments, segmentKind);
    });
  }

  // FALLBACK A: brak line_runs, ale gałęzie tworzą łańcuch GPZ→S→S→… (≥2 odcinki) →
  // syntetyczna magistrala grupująca wszystkie ogniwa łańcucha jako jeden ciąg
  // (K30: stacje połączone jednym ciągiem, nie osobnymi liniami).
  const synthesizedLineRuns = inferLineRunsFromBranchChain(snapshot, branches, stations)
    .filter((lr) => lr.segments.length >= 2);
  if (synthesizedLineRuns.length > 0) {
    return synthesizedLineRuns.flatMap((lineRun) => {
      const runSegments = lineRun.segments
        .map((seg) => branches.find((b) => b.ref_id === seg.segment_ref))
        .filter((b): b is Branch => Boolean(b));
      if (runSegments.length === 0) return [];
      const segmentKind = classifySegmentKind(runSegments[0]);
      return [ciag(lineRun.id, 'main_trunk', runSegments, runSegments, segmentKind)];
    });
  }

  const odcinkiWgRefow = (refs: readonly string[]): Branch[] =>
    refs
      .map((segId) => branches.find((b) => b.ref_id === segId))
      .filter((b): b is Branch => Boolean(b));

  if (logicalViews && logicalViews.trunks.length > 0) {
    const runs: CableRunRendererPropsLight[] = [];
    // Każdy trunk — pojedynczy ciąg główny.
    for (const trunk of logicalViews.trunks) {
      const segments = odcinkiWgRefow(trunk.segments);
      if (segments.length === 0) continue;
      runs.push(ciag(trunk.corridor_ref, 'main_trunk', segments, segments, classifySegmentKind(segments[0])));
    }
    // Odgałęzienia.
    for (const br of logicalViews.branches) {
      const segments = odcinkiWgRefow(br.segments);
      if (segments.length === 0) continue;
      runs.push(ciag(br.branch_id, 'branch', segments, segments, classifySegmentKind(segments[0])));
    }
    return runs;
  }

  // Tor wstępny: każda gałąź → osobny ciąg (brak logical_views).
  return branches.map((b) => ciag(b.ref_id, 'main_trunk', [b], [b], classifySegmentKind(b)));
}

function inferRunVoltageKv(
  snapshot: EnergyNetworkModel,
  segments: readonly Branch[],
): number | null {
  if (segments.length === 0) return null;
  const fromBusRef = segments[0].from_bus_ref;
  const bus = (snapshot.buses ?? []).find(
    (b) => b.ref_id === fromBusRef || b.id === fromBusRef,
  );
  return bus?.voltage_kv ?? null;
}

function buildCableRunLabel(
  segments: readonly Branch[],
  segmentKind: 'cable_sn' | 'overhead_line_sn',
): string {
  const catalogLabels = distinctCatalogLabels(segments);
  const typeLabel =
    catalogLabels.length === 1
      ? catalogLabels[0]
      : catalogLabels.length > 1
        ? 'różne typy katalogowe'
        : 'brak typu katalogowego';
  void segmentKind;
  return `${typeLabel} · ${formatCableRunLength(segments)}`;
}

function formatCableRunLength(segments: readonly Branch[]): string {
  const lengthKm = totalBranchLengthKm(segments);
  if (lengthKm <= 0) return 'brak długości';
  if (lengthKm < 1) return `${Math.round(lengthKm * 1000)} m`;
  return `${formatPolishNumber(lengthKm)} km`;
}

function formatPolishNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  // S9-9: te same dwie konfiguracje co dotąd — `minimumFractionDigits` zależy
  // od tego, czy liczba jest całkowita — wybrane ze STAŁYCH modułu zamiast
  // budowane na każde wywołanie (uzasadnienie i pomiar przy stałych wyżej).
  return (
    Number.isInteger(rounded) ? FORMAT_DLUGOSCI_CALKOWITEJ_PL : FORMAT_DLUGOSCI_ULAMKOWEJ_PL
  ).format(rounded);
}

function readBranchLengthKm(segment: Branch): number {
  const raw = (segment as unknown as Record<string, unknown>).length_km;
  return typeof raw === 'number' ? raw : Number(raw);
}

function totalBranchLengthKm(segments: readonly Branch[]): number {
  return segments.reduce((sum, segment) => {
    const value = readBranchLengthKm(segment);
    return Number.isFinite(value) && value > 0 ? sum + value : sum;
  }, 0);
}

function buildRunSegmentLabels(
  segments: readonly Branch[],
): NonNullable<CableRunRendererPropsLight['segmentLabels']> {
  // K30-52: dedupe kolejnych identycznych etykiet (np. „EPR Al 1C 150 · 167 m"
  // powtarzane na każdym odcinku magistrali). Etykieta tylko przy pierwszym
  // odcinku ciągu i przy zmianie typu względem poprzedniego odcinka.
  let previousLabel: string | null = null;
  return segments.flatMap((segment) => {
    const label = buildCableRunLabel([segment], classifySegmentKind(segment));
    if (label === previousLabel) {
      return [];
    }
    previousLabel = label;
    return [{
      segmentRef: segment.ref_id,
      text: label,
      technical: segmentTechnicalFields(segment),
    }];
  });
}

function buildRunSegmentPaths(
  segments: readonly Branch[],
  szyny: PrzynaleznoscSzyn,
): NonNullable<CableRunRendererPropsLight['segmentPaths']> {
  // §16: każda krawędź jest terminal-to-terminal — końcówki z gałęzi ENM
  // (from_bus → to_bus), tożsamość niezmienna w trasowaniu v3.
  return segments.map((segment) => ({
    segmentRef: segment.ref_id,
    fromTerminal: segmentTerminalOf(segment.from_bus_ref, szyny),
    toTerminal: segmentTerminalOf(segment.to_bus_ref, szyny),
    segmentKind: classifySegmentKind(segment),
  }));
}

function distinctCatalogLabels(segments: readonly Branch[]): string[] {
  return [...new Set(segments.map(readCatalogTypeLabel).filter((label): label is string => Boolean(label)))];
}

/**
 * W3-KABLE-ETYKIETY §7/§6: STRUKTURALNE dane techniczne JEDNEGO odcinka do
 * złożenia etykiety L2 w v3 (`layout/lineLabel.ts`). WYŁĄCZNIE z modelu/
 * katalogu; brakująca dana ⇒ `null`/`false` (zero fabrykacji). Reużywa
 * istniejące czytniki katalogu (`readCatalogTypeLabel`, `readBranchCatalogData`).
 */
function segmentTechnicalFields(segment: Branch): {
  typeLabel: string | null;
  ratedVoltageKv: number | null;
  lengthKm: number | null;
  overhead: boolean;
  hasJoint: boolean;
} {
  const materialized = readBranchCatalogData(segment);
  // Napięcie znamionowe: surowa liczba (bez Math.round — zachowaj 10,5 kV).
  const readRawKv = (key: string): number | null => {
    const raw = materialized?.[key];
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
    return Number.isFinite(value) && value > 0 ? value : null;
  };
  const ratedVoltageKv = readRawKv('voltage_rating_kv') ?? readRawKv('rated_voltage_kv');
  const lengthRaw = readBranchLengthKm(segment);
  const lengthKm = Number.isFinite(lengthRaw) && lengthRaw > 0 ? lengthRaw : null;
  // V12K-229: `cable_joints` jest w kontrakcie, wiec czytamy je z TYPU. Wczesniej
  // pole brakowalo w lustrze TS i odczyt szedl przez `as unknown as`, ktore wylacza
  // kontrole typow — ten sam mechanizm przepuscil dwie zgadniete nazwy pol (V12K-226).
  const joints = segment.type === 'cable' ? segment.cable_joints : null;
  const hasJoint = Array.isArray(joints) && joints.length > 0;
  return {
    typeLabel: readCatalogTypeLabel(segment) ?? null,
    ratedVoltageKv,
    lengthKm,
    overhead: classifySegmentKind(segment) === 'overhead_line_sn',
    hasJoint,
  };
}

function lineRunSegmentRefs(
  lineRun: { segments: readonly (string | { segment_ref?: string | null })[] },
): string[] {
  return lineRun.segments
    .map((segment) => typeof segment === 'string' ? segment : segment.segment_ref)
    .filter((segmentRef): segmentRef is string => Boolean(segmentRef));
}

// -----------------------------------------------------------------------------
// DERs (PV/BESS/FW)
// -----------------------------------------------------------------------------


// =============================================================================
// F9.2 (SLD_CAD_SPEC_V3 §13.1/§13.2) — widoczne źródła sieci (SldSourceView)
// =============================================================================

/**
 * Mapuje `Generator.gen_type` (ENM) na kind `SldSourceView`. Osobna tabela od
 * `mapGenTypeToDerKind` (`RodzajWytworcyRysunku`: 'PV'/'BESS'/'FW' — inny
 * słownik niż SldSourceView), ale ta sama zasada: `gen_type` nieznany/`null`
 * ⇒ `null` (element wykluczony z widoku źródeł — zero zgadywania), NIE
 * domyślny kind. Różnica względem DER-badge: `synchronous` mapuje na
 * `'generator'` tutaj (dziś NIE rysowany jako DER wcale, `mapGenTypeToDerKind`
 * nie ma dla niego case'u — patrz raport F9.2, STOP-notatka).
 */
/**
 * F8b-1 (f92-2): zawsze zwraca `SldSourceView['kind']` — `'unknown'` dla
 * `gen_type` nierozpoznanego/`null` (WCZEŚNIEJ `null`, co `buildSources`
 * używał jako sygnał do wykluczenia generatora z listy — spłacone niżej).
 */
function mapGeneratorToSourceKind(gen: Generator): SldSourceView['kind'] {
  switch (gen.gen_type) {
    case 'pv_inverter':
      return 'pv';
    case 'bess':
      return 'bess';
    case 'synchronous':
      return 'generator';
    case 'wind_inverter':
    case 'fw_pmsg':
    case 'fw_dfig':
    case 'fw_scig':
      return 'wind';
    default:
      return 'unknown';
  }
}

/**
 * F11.3 (spec §13.3, finał F9.6b) — UDOKUMENTOWANA reguła tryb pracy →
 * stan operacyjny źródła (§13.3: „białoskrzynkowa reguła wywodzenia
 * zdefiniowana tu (nie heurystyka)"). Klucze = pełny słownik operacji
 * domenowej `set_source_operating_mode` (backend `enm/models.py`
 * `BaySourceEndpoint.operating_mode`, kanał zapisu `Generator.meta
 * ['operating_mode']`):
 *  - `praca_sieciowa`/`ladowanie`/`rozladowanie` ⇒ `energized` (źródło
 *    czynnie wymienia moc z siecią — kierunek wymiany nie zmienia stanu
 *    „pod napięciem, w pracy");
 *  - `gotowosc` ⇒ `standby` (przyłączone, nie wymienia mocy);
 *  - `odstawione` ⇒ `disconnected` (odstawione z ruchu).
 * `maintenance`/`fault` NIE mają klucza — nie są wywodliwe z tego kanału
 * (patrz docstring `SldSourceView.operationalState`). Wartość spoza słownika
 * (korupcja/literówka) NIE przecieka — `generatorOperationalState` zwraca
 * `undefined` (ta sama semantyka co backendowy `_generator_operating_mode`,
 * który odrzuca wartości spoza `_OPERATING_MODES`).
 */
const OPERATING_MODE_TO_SOURCE_STATE: Readonly<
  Record<string, NonNullable<SldSourceView['operationalState']>>
> = {
  praca_sieciowa: 'energized',
  ladowanie: 'energized',
  rozladowanie: 'energized',
  gotowosc: 'standby',
  odstawione: 'disconnected',
};

/** F11.3 (spec §13.3): odczyt `Generator.meta['operating_mode']` przez regułę
 *  `OPERATING_MODE_TO_SOURCE_STATE` — brak pola / nie-string / wartość spoza
 *  słownika ⇒ `undefined` (uczciwy brak, zero fabrykacji stanu). */
function generatorOperationalState(gen: Generator): SldSourceView['operationalState'] {
  const raw = gen.meta?.['operating_mode'];
  if (typeof raw !== 'string') return undefined;
  return OPERATING_MODE_TO_SOURCE_STATE[raw];
}

/**
 * Projekcja `SldDataPayload.sources` — WYŁĄCZNIE z `snapshot.sources`
 * (`Source` ENM — sieć zewnętrzna, każdy `model` to inna reprezentacja tego
 * samego zjawiska: zastępcze zasilanie zewnętrzne) i `snapshot.generators`
 * (DER: PV/BESS/wind/generator synchroniczny). GPZ (`Substation`) NIE
 * generuje tu odrębnej pozycji — kontener rozdzielni GPZ jest już widoczny
 * przez `gpzs`; ten widok wylicza pojedyncze elementy źródłowe ENM (zgodnie
 * z `Source.substation_ref`, GPZ i jego `Source` to inne obiekty ENM).
 * Deterministyczne: kolejność = kolejność źródłowa `snapshot.sources` +
 * `snapshot.generators` (stabilna dla tego samego snapshotu).
 */
function buildSources(snapshot: EnergyNetworkModel): SldSourceView[] {
  const gridSources: SldSourceView[] = (snapshot.sources ?? []).map((source): SldSourceView => ({
    id: source.ref_id,
    kind: 'external_grid',
    connectionRef: source.bus_ref,
    ratedPower: undefined,
    operationalState: undefined,
  }));

  // F8b-1 (f92-2): WSZYSTKIE generatory dają wpis — `kind='unknown'` +
  // `missingData=true` dla `gen_type` nierozpoznanego/`null`, NIE cichy
  // wykluczenie (poprzednie zachowanie: `.filter` odrzucał `null`, źródło
  // „ginęło bez śladu" — naruszenie spec §13.1 „każda scena renderuje
  // WSZYSTKIE punkty zasilania jako widoczne symbole źródeł").
  // GS-4: strona przyłączenia względem TR — z REALNEJ szyny generatora
  // (`bus_ref` → `voltage_kv`, próg 0,5 kV jak klasyfikacja szyn nN stacji);
  // brak szyny/napięcia ⇒ 'unknown' (zero zgadywania strony).
  const busVoltageByRef = new Map<string, number>();
  for (const bus of snapshot.buses ?? []) {
    if (typeof bus.ref_id === 'string' && typeof bus.voltage_kv === 'number') {
      busVoltageByRef.set(bus.ref_id, bus.voltage_kv);
    }
  }
  // W2c (POLECENIE_DER_SN_TOPOLOGIA_2026-07, semantyka `connectionSide`):
  // strona = POZIOM NAPIĘCIA PUNKTU PRZYŁĄCZENIA do sieci nadrzędnej, NIE
  // napięcie szyny WŁASNEJ falownika. Dla wariantów z dedykowanym polem SN
  // (`block_transformer`/`DEDICATED_MV_CONNECTION`/`SOURCE_CONNECTION_STATION`)
  // falownik siedzi na szynie nN PRODUCENTA (0,4 kV), ale przyłącza się do SN
  // przez TR blokowy — więc `'sn'` (inaczej klasyfikacja z `bus_ref`→
  // `voltage_kv` dawałaby fałszywe `'nn'`, przez co L0 rysowałby DER „za TR"
  // zamiast markera przy szynie SN — kłamstwo topologiczne, reguła 4/7).
  // `nn_side` (za TR STACJI) ⇒ `'nn'`; pozostałe/brak wariantu ⇒ fallback z
  // napięcia szyny (istniejąca konwencja GS-4, próg 0,5 kV).
  const derConnectionSide = (gen: Generator): NonNullable<SldSourceView['connectionSide']> => {
    if (isDedicatedMvDerConnection(gen.connection_variant)) return 'sn';
    if (gen.connection_variant === 'nn_side' || gen.connection_variant === 'LV_BEHIND_STATION_TRANSFORMER') {
      return 'nn';
    }
    const v = gen.bus_ref ? busVoltageByRef.get(gen.bus_ref) : undefined;
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return 'unknown';
    return v > 0.5 ? 'sn' : 'nn';
  };
  const stacjeWgRefu = new Map((snapshot.substations ?? []).map((sub) => [sub.ref_id, sub]));
  const derSources: SldSourceView[] = (snapshot.generators ?? []).map((gen): SldSourceView => {
    const kind = mapGeneratorToSourceKind(gen);
    const chain = buildDerSnChain(snapshot, gen);
    const stacja = gen.station_ref ? stacjeWgRefu.get(gen.station_ref) : undefined;
    return {
      ...(stacja ? sekcjaPola(snapshot, stacja, gen.bus_ref) : {}),
      id: gen.ref_id,
      kind,
      connectionRef: gen.station_ref ?? gen.bus_ref,
      ratedPower: gen.limits?.p_max_mw ?? gen.p_mw ?? null,
      // F11.3 (spec §13.3): realny kanał `Generator.meta['operating_mode']`
      // przez udokumentowaną regułę (patrz `generatorOperationalState` wyżej).
      operationalState: generatorOperationalState(gen),
      missingData: kind === 'unknown' ? true : undefined,
      connectionSide: derConnectionSide(gen),
      // W2c: tor DER-SN (TR blokowy + szyna nN producenta + kabel + pole SN) —
      // obecny WYŁĄCZNIE gdy snapshot niesie zmaterializowane elementy (W2b).
      derChain: chain,
    };
  });

  return [...gridSources, ...derSources];
}

/**
 * W2c (POLECENIE_DER_SN_TOPOLOGIA_2026-07, reguły 1–7): projekcja kompletnego
 * toru DER przyłączonego po stronie SN z REALNYCH elementów ENM (W2b). Zwraca
 * `undefined`, gdy generator NIE jest wariantem z TR blokowym LUB gdy któregoś
 * elementu toru brak w snapshotcie (stare dane / generator synchroniczny WPROST
 * na SN — przypadek 4): wtedy scena stosuje uczciwą degradację W2 + stopNote
 * `der.sn.torNiepelny` (ZERO fabrykacji — nie dorysowujemy elementów, których
 * snapshot nie niesie). Reguła 5: TR blokowy to OSOBNY element z WŁASNYM
 * `ref_id`/rolą — projektowany jako taki, nigdy współdzielony z TR stacji.
 */
function buildDerSnChain(snapshot: EnergyNetworkModel, gen: Generator): SldDerSnChain | undefined {
  if (!isDedicatedMvDerConnection(gen.connection_variant)) return undefined;
  const blockTrRef = gen.blocking_transformer_ref;
  if (!blockTrRef) return undefined;
  const blockTr = (snapshot.transformers ?? []).find(
    (t) => t.ref_id === blockTrRef || t.id === blockTrRef,
  );
  if (!blockTr) return undefined;
  const role = getString(blockTr.meta?.catalog_role);
  // Reguła 5: tylko element o roli TR blokowego DER wchodzi do toru (odróżnienie
  // od TR stacji — inaczej scena mogłaby wpiąć źródło przez TR odbiorczy, reg. 4).
  if (role !== 'TRANSFORMATOR_BLOKOWY_DER') return undefined;
  const mvFieldRef = getString(gen.meta?.der_mv_field_ref);
  if (!mvFieldRef) return undefined;
  const producerBus = (snapshot.buses ?? []).find((b) => b.ref_id === gen.bus_ref || b.id === gen.bus_ref);
  if (!producerBus) return undefined;

  // Kabel SN: gałąź typu `cable` wychodząca ze strony SN TR blokowego
  // (`from_bus_ref === blockTr.hv_bus_ref` = szyna SN TR blokowego). Opcjonalny —
  // brak realnego kabla ⇒ ownerRef syntetyczny w kompozycji (odcinek rysunkowy).
  const cable = (snapshot.branches ?? []).find(
    (b) => b.type === 'cable' && b.from_bus_ref === blockTr.hv_bus_ref,
  );

  const lvVariant = getString(producerBus.meta?.lv_switchgear_variant);
  const unitCount = (typeof gen.n_parallel === 'number' && gen.n_parallel > 1)
    ? gen.n_parallel
    : (typeof gen.quantity === 'number' && gen.quantity > 1 ? gen.quantity : undefined);

  return {
    mvFieldRef,
    blockTransformer: {
      ref: blockTr.ref_id,
      role,
      primaryVoltageKv: typeof blockTr.uhv_kv === 'number' ? blockTr.uhv_kv : undefined,
      secondaryVoltageKv: typeof blockTr.ulv_kv === 'number' ? blockTr.ulv_kv : undefined,
      // GPZ-PARYTET cz. 2 (pkt 1): grupa połączeń TR blokowego 1:1 z modelu.
      vectorGroup: typeof blockTr.vector_group === 'string' ? blockTr.vector_group : null,
    },
    producerLvBus: {
      ref: producerBus.ref_id,
      voltageKv: typeof producerBus.voltage_kv === 'number' ? producerBus.voltage_kv : undefined,
      lvSwitchgearVariant: lvVariant || undefined,
    },
    cableRef: cable?.ref_id,
    unitCount,
  };
}

