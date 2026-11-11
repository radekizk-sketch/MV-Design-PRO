/**
 * enmToCanonicalGpzAdapter — model ENM → `CanonicalGpzProps` (kontrakt kompozycji GPZ v3,
 * `canonicalGpzModel.ts`).
 *
 * Reguły:
 *   - Brak danych → jawne `null` (nie „—", nie „GPZ 1", nie „TR1", nie napięcie domyślne).
 *   - Auto-syntezuje sekcję 1 gdy `gpz_sections=[]` ale są pola bez `gpz_section_id`.
 *   - Mapuje wszystkie aparaty per `BAY_DEVICE_ORDER_POLICY`.
 *   - Stan aparatów wyłącznie z modelu: `status` gałęzi łączeniowych pola, rozstrzygany
 *     rekordem aparatu (`v2/model/stanAparatowPola.ts`, jedna funkcja ze stacjami; brak →
 *     nieznany).
 *   - Zero przeszukiwania topologii: pomiar zacisku pola i bilans GPZ wyznacza backend
 *     (wiersze `Bay`/`Substation` wyniku rozpływu, `enm/wyniki_pol_gpz.py`).
 *
 * @see docs/audit/GPZ_RENDERER_REALITY_CHECK.md
 */

import { sprzeglaMiedzySekcjami } from '../model/sprzeglaSekcji';
import type {
  Bay,
  Branch,
  Bus,
  EnergyNetworkModel,
  Generator,
  Source,
  Substation,
  Transformer,
  ZespolUziemiajacy,
} from '../../../../types/enm';
import type {
  BayFieldRole,
  CanonicalGpzBay,
  CanonicalGpzBusVt,
  CanonicalGpzCoupler,
  CanonicalGpzHvSection,
  CanonicalGpzHvSystemSource,
  CanonicalGpzProps,
  CanonicalGpzSection,
  CanonicalGpzTransformer,
  GpzStatusFlag,
  RolaPolaGpz,
} from './canonicalGpzModel';
import { stanyAparatowPolaZModelu } from '../model/stanAparatowPola';
import { jedynyTransformatorPola, rolaPolaZrodlowego, wytworcyWgPola } from '../model/polaZModelu';
import { bateriaWidokuPola } from '../model/bateriaPola';
import { wPasmieSn, wPasmieWn } from '../../../../ui2/model/pasmaNapieciowe';
// F11.1 (SLD_CAD_SPEC_V3 §17.2/§18.3/§20.1, rejestr device-ref w GPZ):
// reużycie WPROST tych samych projekcji co stacje (`buildExplicitStationMiniBays`,
// `enmToSldAdapter.ts`) — jedna prawda ENM Bay → aparat/adnotacja zabezpieczeń,
// zero duplikacji logiki dopasowania `ProtectionAssignment`/`Measurement`.
import {
  nazwaCeluOdejscia,
  projectBayPrimaryDevices,
  resolveBayCtRatingAnnotations,
  resolveBayProtectionMarking,
  resolveBayVtMountings,
} from './enmToSldAdapter';
import { buildOltcAnnotation } from './oltcGlyph';
import { szynyStacji, type ModelSzyn } from '../../../shared/szynyStacji';
import { polaStacji } from '../../../shared/polaStacji';
import { transformatoryNalezaceDoStacji } from '../../../shared/transformatoryStacji';
import { czyPoleRezerwowe, czyPoleWolne } from '../../../shared/rodzajStacji';

/* =============================================================================
   Public API
   ============================================================================= */

/**
 * Główna funkcja: ENM Substation (typu 'gpz') + ENM context → CanonicalGpzProps.
 *
 * Throws gdy substation NIE jest typu 'gpz' (mini-RMU używa innego renderera).
 */
export function buildCanonicalGpzProps(
  enm: Pick<
    EnergyNetworkModel,
    | 'substations'
    | 'bays'
    | 'transformers'
    | 'buses'
    | 'generators'
    | 'branches'
    // F11.1 (spec §17.2/§18.3): rejestr device-ref — `protectionMarking`
    // (`Bay.protection_ref` → `ProtectionAssignment`) i `ctRatingAnnotations`
    // (`Measurement`) potrzebują tych dwóch kolekcji, dokładnie jak stacje
    // (`buildExplicitStationMiniBays`, `enmToSldAdapter.ts`). Addytywne —
    // istniejący wywołujący (`buildScene.ts`/`SldWorkspaceContainer.tsx`)
    // przekazuje PEŁNY `EnergyNetworkModel`, więc żaden callsite nie wymaga
    // zmiany.
    | 'protection_assignments'
    | 'measurements'
    // F13.1 (spec §21.1, D3-1): derywacja kolumny WN gdy `gpz_hv_sections`
    // puste czyta `snapshot.sources` (źródło systemowe na szynie GPZ) —
    // addytywne, `buildScene.ts` przekazuje PEŁNY `EnergyNetworkModel`.
    | 'sources'
    // Karta UX-04/POLE-ZU: aparat punktu neutralnego sieci SN — zespoły uziemiające stacji.
    | 'zespoly_uziemiajace'
    // UX-04/POLE-BKR-MODEL: baterie kondensatorów na końcu toru pól (`bateriaWidokuPola`).
    | 'shunt_capacitors'
  >,
  substationRef: string,
): CanonicalGpzProps {
  const substation = (enm.substations ?? []).find((s) => s.ref_id === substationRef);
  if (!substation) {
    throw new Error(`Substation '${substationRef}' nie istnieje w ENM.`);
  }
  if (substation.station_type !== 'gpz') {
    throw new Error(`Substation '${substationRef}' nie jest typu 'gpz' (jest ${substation.station_type}).`);
  }

  // Karta W5-B: pola GPZ = rekordy `bays` stacji (JEDEN nośnik pól; pole bez rekordu = brak pola).
  const allBays = [...polaStacji(enm, substationRef)];
  // SZYNY-STACJI-LUSTRO: transformatory GPZ z JEDNEJ reguły „transformatory stacji”.
  const allTransformers = transformatoryNalezaceDoStacji(enm, substation);

  // F11.1: kontekst rejestru device-ref przekazywany DALEJ do `buildBay` —
  // WYŁĄCZNIE pola faktycznie czytane przez `resolveBayProtectionMarking`/
  // `resolveBayCtRatingAnnotations` (`enmToSldAdapter.ts`).
  // GPZ-PARYTET cz. 2 (pkt 2): gałęzie migawki wg refu — stan łączników pól z ich `status`.
  const galezieWgRef: ReadonlyMap<string, Branch> = new Map(
    (enm.branches ?? []).map((galaz) => [galaz.ref_id, galaz]),
  );
  const protectionCtx: ProtectionCtx = {
    protection_assignments: enm.protection_assignments ?? [],
    measurements: enm.measurements ?? [],
    // GEOMETRIA-STACJI (§0 pkt 5): nazwa celu odejścia pola i predykat pola wolnego.
    substations: enm.substations ?? [],
    branches: enm.branches ?? [],
    galezieWgRef,
    // GPZ-PARYTET cz. 3 (pkt 1): rodzaj źródła pola OZE z przyłączonych wytwórców — ta
    // sama relacja i funkcja co pola źródłowe stacji (`v2/model/polaZModelu.ts`).
    generatoryWgPola: wytworcyWgPola(enm),
    // UX-04/POLE-BKR-MODEL: bateria kondensatorów na końcu toru pola (`bateriaWidokuPola`
    // — ta sama relacja co pola stacji i backend `pole_baterii`).
    shunt_capacitors: enm.shunt_capacitors ?? [],
  };

  // GPZ-PARYTET cz. 3 (pkt 2): pole TR, którego JEDYNYM transformatorem jest transformator
  // tej stacji (`jedynyTransformatorPola` — ta sama reguła co pola TR stacji SN/nN), rysuje
  // się jako pole toru transformatora (pole WN TR → TR2W z uzwojeniami → pole TR → szyna SN),
  // nie drugi raz w sekcji. Jeden zbiór przypisań steruje OBIEMA stronami: wyłączeniem pola
  // z sekcji i dołączeniem go do toru transformatora (predykaty parami z jednego źródła).
  const transformatoryWgRef = new Map(allTransformers.map((tr) => [tr.ref_id, tr]));
  const hvSectionIds = new Set((substation.gpz_hv_sections ?? []).map((sec) => sec.section_id));
  const polaTrSn = przypiszPolaTr(
    allBays.filter((bay) => isLvBay(bay, enm.buses ?? [])),
    transformatoryWgRef,
  );
  const polaTrWn = przypiszPolaTr(
    allBays.filter((bay) => bay.gpz_section_id != null && hvSectionIds.has(bay.gpz_section_id)),
    transformatoryWgRef,
  );
  const polaWToruTransformatora = new Set<string>(
    [...polaTrSn.values(), ...polaTrWn.values()].map((bay) => bay.ref_id),
  );
  // GEOMETRIA-STACJI (Z-07): pole sprzęgła wskazujące narysowane sprzęgło NIE jest osobnym
  // polem sekcji — jego oznaczenie i aparat niesie sprzęgło (jedno miejsce na rysunku).
  const couplers = buildCouplers(substation, allBays, enm.branches ?? []);
  const polaSprzegiel = new Set(couplers.map((c) => c.bayRef).filter((ref): ref is string => ref != null));
  const polaSekcji = allBays.filter((bay) => !polaWToruTransformatora.has(bay.ref_id) && !polaSprzegiel.has(bay.ref_id));

  const lvSections = buildLvSections(substation, polaSekcji, enm.buses ?? [], protectionCtx);
  // Mapowanie sectionId po `bus_ref` z `substation.gpz_sections` — używane do
  // przypisania TR do sekcji wg `lv_bus_ref`.
  const sectionIdByLvBusRef = new Map<string, string>();
  for (const sec of substation.gpz_sections ?? []) {
    if (sec.bus_ref) sectionIdByLvBusRef.set(sec.bus_ref, sec.section_id);
  }

  // Każdy transformator stacji rysuje się torem transformatora; pole TR przypisane wyżej
  // niesie stan łączników i tożsamość pola toru (dawniej transformator z polem TR był
  // pomijany, a szablon pola TR w sekcji nie miał symbolu transformatora — znikał z rysunku).
  const transformers = buildTransformers(allTransformers, sectionIdByLvBusRef, (tr) => ({
    poleTr: polaTrSn.has(tr.ref_id) ? buildBay(polaTrSn.get(tr.ref_id)!, protectionCtx) : null,
    poleWn: polaTrWn.has(tr.ref_id) ? buildBay(polaTrWn.get(tr.ref_id)!, protectionCtx) : null,
  }));

  return {
    id: substation.ref_id,
    // Karta GPZ-PARYTET: brak nazwy w modelu = jawny brak (`null`), kompozycja zgłasza
    // `gpz.name.missing` — dawne „—" było wartością zastępczą udającą nazwę.
    name: substation.name?.trim() ? substation.name.trim() : null,
    transformers,
    sections: lvSections,
    // V12K-219 / karta UX-04/POLE-ZU: aparat punktu neutralnego sieci SN — zainstalowany
    // w modelu (zespół uziemiający na szynie SN stacji albo uzwojenie SN transformatora),
    // zero domysłu: brak aparatu daje `null`, a schemat wtedy nie rysuje aparatu.
    snNeutralEarthing: deriveSnNeutralEarthing(
      enm,
      substation,
      enm.buses ?? [],
      allTransformers,
      enm.zespoly_uziemiajace ?? [],
    ),
    couplers,
    hvSections: buildHvSections(substation, polaSekcji, enm.buses ?? [], protectionCtx),
    // F13.1 (spec §21.1): derywacja WYŁĄCZNIE gdy `gpz_hv_sections` puste —
    // ścieżka `hvSectionDefs` (niepuste) jest nadrzędna i NIE potrzebuje tego
    // pola (renderer/compose czyta `hvSections` wprost w tej gałęzi).
    hvSystemSource:
      (substation.gpz_hv_sections ?? []).length === 0
        ? deriveHvSystemSource(enm, substation, enm.buses ?? [], enm.sources ?? [])
        : null,
    // ADAPTER-BUSREF: kanoniczny Bus ref szyny WN GPZ — patrz `gpzHvBusResultRef`
    // (odmowa przy niejednoznaczności, karta WN-WYNIK).
    hvBusRef: gpzHvBusResultRef(substation, enm.buses ?? []),
  };
}

/**
 * Szyny WN (pasmo WN, `wPasmieWn` — od 110 kV) należące do stacji — JEDNO ŹRÓDŁO PRAWDY dla obu
 * pytań o stronę WN GPZ: `hvBusRef` (który WĘZEŁ niesie wynik) i
 * `deriveHvSystemSource` (jaki POZIOM napięcia opisuje szynę). Kolejność wprost
 * z `Substation.bus_refs` — dana modelu, nie kolejność listy `buses`, więc
 * derywacja jest niezależna od układu migawki.
 */
function gpzHvBuses(substation: Substation, buses: readonly Bus[]): readonly Bus[] {
  const byRef = new Map(buses.map((b) => [b.ref_id, b]));
  const out: Bus[] = [];
  for (const ref of substation.bus_refs ?? []) {
    const bus = byRef.get(ref);
    if (bus && wPasmieWn(bus.voltage_kv)) out.push(bus);
  }
  return out;
}

/**
 * ODMOWA ZAMIAST PODSTAWIENIA (karta WN-WYNIK): punkt wyniku RYSOWANEJ szyny WN.
 *
 * Kompozycja rysuje DOKŁADNIE JEDEN odcinek szyny WN (`compose/gpz.ts` krok 7 —
 * span po wszystkich zaczepach WN), więc przypisanie mu punktu wyniku ma sens
 * tylko wtedy, gdy stacja ma w modelu DOKŁADNIE JEDNĄ szynę WN. Kreator GPZ
 * (karta GPZ-MODEL) buduje jedną wspólną szynę 110 kV (`hv_section/001/bus_wn`,
 * tag `gpz_hv_bus`) dla wszystkich transformatorów; kilka szyn WN w stacji
 * powstaje tylko z jawnie dodanych sekcji WN (`add_gpz_section`, strona WN) —
 * wtedy `find(...)` brałoby cicho PIERWSZĄ i jeden narysowany odcinek pokazywałby
 * wielkość JEDNEGO z kilku węzłów, milcząc o pozostałych. To ta sama klasa i ta sama reguła,
 * co odmowy `stationFieldBusRef`/`pickStationBus` w `resultRefBridge.ts` (stacja
 * dwusekcyjna nie dostaje etykiety, bo rysunek ma jeden odcinek szyny).
 *
 * `null` = uczciwy brak (szyna WN bez etykiety wynikowej), nigdy wielkość
 * pierwszego z kilku węzłów.
 */
function gpzHvBusResultRef(substation: Substation, buses: readonly Bus[]): string | null {
  const hv = gpzHvBuses(substation, buses);
  return hv.length === 1 ? hv[0].ref_id : null;
}

/**
 * F13.1 (SLD_CAD_SPEC_V3 §21.1, D3-1/D3-8/D3-10): wywodzi tabliczkę źródła
 * systemowego (sieć zasilająca GPZ) z relacji PIERWSZOKLASOWYCH ENM — zero
 * zgadywania, brak `Source` na szynie GPZ ⇒ `null` (uczciwy brak, `compose/gpz.ts`
 * NIE dopisuje etykiety/tabliczki danych).
 *   1. Karta GPZ-MODEL: źródło systemowe NIE wymaga transformatora WN/SN. Przy
 *      równoważniku sieci na szynach SN transformatorów 110/SN nie ma w modelu,
 *      a tabliczka (nazwa, „Ekwiwalent sieci zasilającej", Sk″/Ik″) jest tam
 *      JEDYNYM opisem zasilania GPZ na rysunku — dawny warunek „najpierw TR w paśmie
 *      WN" pochodził z czasu, gdy kreator dokładał transformator bez zasilania do
 *      każdego GPZ, i w trybie SN gubił tabliczkę.
 *   2. szyna WN = `gpzHvBuses` (wpisy `Substation.bus_refs` w paśmie WN)
 *      — JEDNO źródło prawdy z `hvBusRef`; jej brak (tryb SN) daje
 *      `hvBusVoltageKv = null` i `sourceOnHvBus = false`. Etykieta szyny WN opisuje
 *      POZIOM napięcia, więc kilka szyn WN o TYM SAMYM poziomie (jawne sekcje WN
 *      110 kV) jest tu jednoznaczne; szyny o RÓŻNYCH poziomach ⇒ `null` (karta
 *      WN-WYNIK: rysunek ma jedną szynę WN, a „110 kV" i „220 kV" nie są tym
 *      samym zdaniem — uczciwy brak zamiast pierwszej z brzegu).
 *   3. źródło systemowe = `snapshot.sources` z `bus_ref` na szynie GPZ z lustra
 *      `szynyStacji` (SN lub WN — obie należą do GPZ), nazwa z `meta.source_id` (fallback
 *      `Source.name`).
 */
function deriveHvSystemSource(
  enm: ModelSzyn,
  gpz: Substation,
  buses: readonly Bus[],
  sources: readonly Source[],
): CanonicalGpzHvSystemSource | null {
  const hvBuses = gpzHvBuses(gpz, buses);
  const hvBus = hvBuses[0] ?? null;
  if (hvBus !== null && hvBuses.some((b) => b.voltage_kv !== hvBus.voltage_kv)) return null;

  // SZYNY-STACJI-LUSTRO: źródło należy do GPZ, gdy stoi na szynie GPZ z jednego lustra
  // `szynyStacji` (szyny główne, zaciski pól, końce aparatów pól nN).
  const gpzBusRefs = szynyStacji(enm, gpz);
  const source = sources.find((s) => s.bus_ref != null && gpzBusRefs.has(s.bus_ref));
  if (!source) return null;

  const name = readString(asRecord(source.meta)?.source_id) ?? readString(source.name);
  if (!name) return null;

  // Recenzja NO-GO 2026-07-17 pkt 2/3: napięcie tabliczki = szyna ŹRÓDŁA
  // (spójność Sk″/Ik″/U), a strona zaczepu podąża za `Source.bus_ref` —
  // ekwiwalent na szynach SN NIE jest rysowany jako przyłącze WN.
  const sourceBus = buses.find((b) => b.ref_id === source.bus_ref) ?? null;
  return {
    sourceRef: source.ref_id,
    name,
    sk3Mva: source.sk3_mva ?? null,
    ik3Ka: source.ik3_ka ?? null,
    sk3MinMva: source.sk3_min_mva ?? null,
    ik3MinKa: source.ik3_min_ka ?? null,
    uSetPu: source.u_set_pu ?? null,
    voltageKv: sourceBus?.voltage_kv ?? null,
    // WN-WYNIK (uczciwość w obrębie pliku): „czy źródło stoi po stronie WN" to
    // pytanie o ZBIÓR szyn WN stacji, nie o pierwszą z nich — GPZ z jawnymi
    // sekcjami WN ma kilka szyn 110 kV i źródło na drugiej też jest po stronie WN.
    sourceOnHvBus: hvBuses.some((b) => b.ref_id === source.bus_ref),
    hvBusVoltageKv: hvBus?.voltage_kv ?? null,
  };
}

/* =============================================================================
   Sub-builders
   ============================================================================= */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * GPZ-PARYTET cz. 3 (pkt 2): przypisanie pól TR do transformatorów stacji. Pole `bay_role:
 * "TR"` należy do transformatora, gdy ten jest jego JEDYNYM transformatorem
 * (`jedynyTransformatorPola`); transformator wskazany przez więcej niż jedno pole zostaje bez
 * przypisania (model nie mówi, które pole rysuje tor) — pola zostają wtedy w sekcji.
 * Deterministyczne: kolejność pól nie zmienia wyniku.
 */
function przypiszPolaTr(
  bays: readonly Bay[],
  transformatoryWgRef: ReadonlyMap<string, Transformer>,
): ReadonlyMap<string, Bay> {
  const wgTransformatora = new Map<string, Bay[]>();
  for (const bay of bays) {
    if (bay.bay_role !== 'TR') continue;
    const tr = jedynyTransformatorPola(bay, transformatoryWgRef);
    if (!tr) continue;
    const lista = wgTransformatora.get(tr.ref_id) ?? [];
    lista.push(bay);
    wgTransformatora.set(tr.ref_id, lista);
  }
  const przypisane = new Map<string, Bay>();
  for (const [trRef, lista] of wgTransformatora) {
    if (lista.length === 1) przypisane.set(trRef, lista[0]);
  }
  return przypisane;
}

function buildTransformers(
  transformers: readonly Transformer[],
  sectionIdByLvBusRef: ReadonlyMap<string, string>,
  polaToru: (tr: Transformer) => Pick<CanonicalGpzTransformer, 'poleTr' | 'poleWn'>,
): CanonicalGpzTransformer[] {
  return transformers
    .slice()
    .sort((a, b) => a.ref_id.localeCompare(b.ref_id))
    .map((tr, idx) => ({
      transformerRef: tr.ref_id,
      designation: extractTransformerDesignation(tr.name, idx),
      snMva: tr.sn_mva,
      uhvKv: tr.uhv_kv,
      ulvKv: tr.ulv_kv,
      vectorGroup: tr.vector_group ?? null,
      // Recenzja NO-GO 2026-07-17 pkt 4: uk%/Pk WPROST z ENM (materializacja
      // katalogowa) — tabliczka TR na rysunku bez tych danych była modelowo
      // niekompletna, mimo że model je NIÓSŁ.
      ukPercent: tr.uk_percent ?? null,
      pkKw: tr.pk_kw ?? null,
      lvSectionId: sectionIdByLvBusRef.get(tr.lv_bus_ref) ?? null,
      hvBusRef: tr.hv_bus_ref ?? null,
      // SLD-02 (V12K-091): adnotacja OLTC/DETC z kanonicznego tap_changer
      // (reuse buildOltcAnnotation; null gdy brak regulacji).
      oltc: buildOltcAnnotation(tr.tap_changer),
      ...polaToru(tr),
    }));
}

export function extractTransformerDesignation(name: string | null | undefined, idx: number): string {
  if (!name) return `T${idx + 1}`;
  // Spróbuj wyciągnąć "TR1", "TR-2", "T01" z nazwy.
  const match = name.match(/(TR|T)[\s-]?(\d+)/i);
  if (match) return `${match[1].toUpperCase()}${match[2]}`;
  return `T${idx + 1}`;
}

/** F11.1: kontekst rejestru device-ref (`ProtectionAssignment`/`Measurement`),
 *  wyłącznie pola faktycznie czytane przez `resolveBayProtectionMarking`/
 *  `resolveBayCtRatingAnnotations` — wzorzec `BuildCanonicalGpzOptions`. */
type ProtectionCtx = Pick<
  EnergyNetworkModel,
  'protection_assignments' | 'measurements' | 'substations' | 'branches' | 'shunt_capacitors'
> & {
  /** Gałęzie migawki wg `ref_id` — źródło stanu łączników pól (`stanyAparatowPolaZModelu`). */
  readonly galezieWgRef: ReadonlyMap<string, Branch>;
  /** Wytwórcy wg pola (`Generator.meta.field_ref`) — rodzaj źródła pola OZE. */
  readonly generatoryWgPola: ReadonlyMap<string, readonly Generator[]>;
};

function buildLvSections(
  gpz: Substation,
  bays: readonly Bay[],
  buses: readonly Bus[],
  protectionCtx: ProtectionCtx,
): CanonicalGpzSection[] {
  const sectionDefs = gpz.gpz_sections ?? [];
  const lvBays = bays.filter((b) => isLvBay(b, buses));

  if (sectionDefs.length === 0 && lvBays.length === 0) {
    // Brak sekcji + brak pól — operator widzi explicit "brak danych ENM" w renderze.
    return [];
  }

  if (sectionDefs.length === 0 && lvBays.length > 0) {
    // Auto-synteza: 1 sekcja domyślna gdy brak gpz_sections ale są bays.
    const defaultBus = buses.find((b) => gpz.bus_refs?.includes(b.ref_id) && !wPasmieWn(b.voltage_kv));
    return [{
      sectionId: `${gpz.ref_id}__synth-section-1`,
      order: 1,
      label: 'S1',
      busVoltageKv: defaultBus?.voltage_kv ?? null,
      // ADAPTER-BUSREF: kanoniczny Bus ref sekcji syntetycznej = szyna SN GPZ
      // (ta sama, z której czytamy `busVoltageKv`). `null` gdy brak.
      busRef: defaultBus?.ref_id ?? null,
      bays: lvBays.map((b) => buildBay(b, protectionCtx)),
      busVtMeasurements: busVtMeasurementsOf(defaultBus?.ref_id, protectionCtx),
    }];
  }

  const bayBuckets = assignBaysToLvSections(sectionDefs, lvBays);

  return sectionDefs
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((sec, idx) => {
      const sectionBays = bayBuckets.get(sec.section_id) ?? [];
      const bus = buses.find((b) => b.ref_id === sec.bus_ref);
      return {
        sectionId: sec.section_id,
        order: sec.order,
        label: sec.name ?? `S${idx + 1}`,
        busVoltageKv: bus?.voltage_kv ?? null,
        // ADAPTER-BUSREF: kanoniczny Bus ref sekcji WPROST ze snapshotu
        // (`gpz_sections[].bus_ref`) — prymat danych, zero parsowania refów sceny.
        busRef: sec.bus_ref ?? null,
        bays: sectionBays.map((b) => buildBay(b, protectionCtx)),
        busVtMeasurements: busVtMeasurementsOf(sec.bus_ref, protectionCtx),
      };
    });
}

/**
 * Recenzja NO-GO 2026-07-17 pkt 12 (spec §12.5): VT SZYNY sekcji GPZ —
 * `Measurement{measurement_type:'VT', bus_ref: szyna sekcji}` BEZ `bay_ref`
 * (VT polowe pola niosą `Measurement.bay_ref`, osobny kanał). Zero danych
 * = pusta lista (kompozycja nie fabrykuje pomiaru).
 */
function busVtMeasurementsOf(
  busRef: string | null | undefined,
  protectionCtx: ProtectionCtx,
): CanonicalGpzBusVt[] {
  if (!busRef) return [];
  return (protectionCtx.measurements ?? [])
    .filter((m) => m.measurement_type === 'VT' && m.bus_ref === busRef && !m.bay_ref)
    .map((m) => ({ measurementRef: m.ref_id, arrangement: m.vt_arrangement ?? null }));
}

function assignBaysToLvSections(
  sectionDefs: NonNullable<Substation['gpz_sections']>,
  lvBays: readonly Bay[],
): Map<string, Bay[]> {
  const sortedSections = sectionDefs.slice().sort((a, b) => a.order - b.order);
  const sectionIds = new Set(sortedSections.map((section) => section.section_id));
  const buckets = new Map(sortedSections.map((section) => [section.section_id, [] as Bay[]]));
  const unassigned: Bay[] = [];

  for (const bay of lvBays) {
    if (bay.gpz_section_id && sectionIds.has(bay.gpz_section_id)) {
      buckets.get(bay.gpz_section_id)?.push(bay);
    } else {
      unassigned.push(bay);
    }
  }

  for (const bay of unassigned) {
    const matchingBusSections = sortedSections.filter((section) => section.bus_ref === bay.bus_ref);
    const candidates = matchingBusSections.length > 0 ? matchingBusSections : sortedSections;
    const target = candidates.reduce((best, section) => {
      const bestSize = buckets.get(best.section_id)?.length ?? 0;
      const currentSize = buckets.get(section.section_id)?.length ?? 0;
      return currentSize < bestSize ? section : best;
    });
    buckets.get(target.section_id)?.push(bay);
  }

  return buckets;
}

function buildHvSections(
  gpz: Substation,
  bays: readonly Bay[],
  buses: readonly Bus[],
  protectionCtx: ProtectionCtx,
): CanonicalGpzHvSection[] {
  const hvSectionDefs = gpz.gpz_hv_sections ?? [];
  if (hvSectionDefs.length === 0) {
    // Brak HV sections — adapter NIE syntezuje (Inv 9: brak danych ≠ default).
    // Renderer pokazuje "Strona 110 kV — brak danych ENM".
    return [];
  }
  return hvSectionDefs
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((sec, idx) => {
      const hvBays = bays.filter((b) => b.gpz_section_id === sec.section_id);
      const bus = buses.find((b) => b.ref_id === sec.bus_ref);
      return {
        sectionId: sec.section_id,
        order: sec.order,
        label: sec.name ?? `HV-${idx + 1}`,
        busVoltageKv: bus?.voltage_kv ?? null,
        bays: hvBays.map((b) => buildBay(b, protectionCtx)),
      };
    });
}

function buildBay(bay: Bay, protectionCtx: ProtectionCtx): CanonicalGpzBay {
  const fieldRole = mapBayRoleToFieldRole(bay.bay_role);
  const stany = stanyAparatowPolaZModelu(bay, protectionCtx.galezieWgRef);
  return {
    bayRef: bay.ref_id,
    bayNumber: bay.bay_number ?? null,
    feederName: bay.feeder_short_name ?? bay.name ?? null,
    // GEOMETRIA-STACJI (§0 pkt 5): NAZWA stacji docelowej (jedna funkcja ze stacjami);
    // strzałkę „→" dokłada kompozycja. Dawniej adapter dokładał ją sam do surowego refu,
    // a kompozycja drugi raz — podpis „→ → ⟨ref⟩".
    destinationLabel: bay.outgoing_destination_ref
      ? nazwaCeluOdejscia(protectionCtx, bay.outgoing_destination_ref)
      : null,
    ...(czyPoleRezerwowe(bay)
      ? { reserve: 'rezerwowe' as const }
      : czyPoleWolne(bay, protectionCtx.branches ?? []) ? { reserve: 'wolne' as const } : {}),
    fieldRole,
    rolaPola: rolaPolaGpz(bay.bay_role),
    ...(fieldRole === 'SOURCE' ? { rolaZrodla: rolaPolaZrodlowego(bay, protectionCtx.generatoryWgPola) } : {}),
    ...bateriaWidokuPola(bay, protectionCtx),
    cbState: stany.cbState,
    dsState: stany.dsState,
    esState: stany.esState,
    qDesignations: deriveQDesignations(fieldRole),
    statusFlags: flagiStatusuPola(bay),
    protectionCodes: bay.protection_codes ?? [],
    // F11.1 (SLD_CAD_SPEC_V3 §17.2/§18.3/§20.1, rejestr device-ref w GPZ —
    // parytet ze stacjami): TA SAMA projekcja co `buildExplicitStationMiniBays`
    // (`enmToSldAdapter.ts`), reużyta wprost (zero duplikacji). Pole bez aparatów
    // pierwotnych, przypisań zabezpieczeń i pomiarów w modelu daje tu `undefined` —
    // „brak danych = brak rysunku" (spec §17.2).
    primaryDevices: projectBayPrimaryDevices(bay, protectionCtx.galezieWgRef),
    protectionMarking: resolveBayProtectionMarking(bay, protectionCtx),
    ctRatingAnnotations: resolveBayCtRatingAnnotations(bay, protectionCtx),
    // CTVT-RENDER (spec §20.2, parytet ze stacjami): TA SAMA projekcja montażu
    // VT co `buildExplicitStationMiniBays` — reużyta wprost (zero duplikacji).
    vtMountingAnnotations: resolveBayVtMountings(bay, protectionCtx),
  };
}

/**
 * GEOMETRIA-STACJI (Z-07, §0 pkt 2): sprzęgła GPZ z JEDNEGO źródła — gałęzi `bus_coupler`
 * modelu łączących szyny sekcji SN (`sprzeglaMiedzySekcjami`, ta sama funkcja co stacje SN).
 * Do karty sprzęgło wymagało rekordu pola COUPLER, którego operacja GPZ nie tworzy, więc
 * sprzęgło z modelu znikało z rysunku. Rekord pola sprzęgła, gdy jest, dokłada oznaczenie
 * i rodzaj aparatu; stan rysunku pochodzi ze `status` gałęzi.
 */
function buildCouplers(
  gpz: Substation,
  bays: readonly Bay[],
  branches: readonly Branch[],
): CanonicalGpzCoupler[] {
  const sectionDefs = [...(gpz.gpz_sections ?? [])].sort((a, b) => a.order - b.order);
  if (sectionDefs.length < 2) return [];
  const sectionIdByBus = new Map(sectionDefs.map((sec) => [sec.bus_ref, sec.section_id]));
  return sprzeglaMiedzySekcjami(branches, sectionDefs.map((sec) => sec.bus_ref), bays).flatMap((sprzeglo) => {
    const from = sectionIdByBus.get(sprzeglo.fromBusRef);
    const to = sectionIdByBus.get(sprzeglo.toBusRef);
    if (from == null || to == null) return [];
    const fromOrder = sectionDefs.findIndex((sec) => sec.section_id === from);
    const toOrder = sectionDefs.findIndex((sec) => sec.section_id === to);
    return [{
      couplerId: sprzeglo.ref,
      leftSectionId: fromOrder <= toOrder ? from : to,
      rightSectionId: fromOrder <= toOrder ? to : from,
      designation: sprzeglo.designation,
      closedState: sprzeglo.state,
      rodzaj: sprzeglo.rodzaj,
      bayRef: sprzeglo.bayRef,
    }];
  });
}

/* =============================================================================
   Field role + apparatus mapping
   ============================================================================= */

function mapBayRoleToFieldRole(role: Bay['bay_role']): BayFieldRole {
  switch (role) {
    case 'IN': return 'LINE_IN';
    case 'OUT': return 'LINE_OUT';
    case 'FEEDER': return 'LINE_BRANCH';
    case 'TR': return 'TRANSFORMER';
    case 'COUPLER': return 'COUPLER';
    case 'MEASUREMENT': return 'MEASUREMENT';
    // GPZ-PARYTET cz. 3 (pkt 1): pole źródłowe — gramatyka pola kablowego + glif rodzaju
    // źródła (`rolaZrodla`); dawniej zlewane z polem liniowym odpływowym.
    case 'OZE': return 'SOURCE';
    // UX-04/POLE-BKR-MODEL: dawne `default: return 'LINE_OUT'` robiło z pola baterii pole
    // liniowe odpływowe — kandydata na feeder magistrali sieci. Przełącznik jest teraz
    // wyczerpujący po `Bay.bay_role` (nowa rola bez gałęzi = błąd kompilacji).
    case 'BKR': return 'CAPACITOR_BANK';
    // UX-04/POLE-ZU-SKLADOWA-ZEROWA: pole zespołu uziemiającego — dawniej `default` robił
    // z niego pole liniowe odpływowe (kandydata na pole magistrali sieci).
    case 'ZU': return 'EARTHING_UNIT';
  }
}

function isLvBay(bay: Bay, buses: readonly Bus[]): boolean {
  const bus = buses.find((b) => b.ref_id === bay.bus_ref);
  if (!bus) return false;
  return !wPasmieWn(bus.voltage_kv);
}

function deriveQDesignations(role: BayFieldRole): CanonicalGpzBay['qDesignations'] {
  switch (role) {
    case 'LINE_OUT':
    case 'LINE_IN':
    case 'LINE_BRANCH':
    case 'SOURCE':
      return { cb: 'Q0', dsBus: 'Q1', dsLin: 'Q9', es: 'Q8', ct: 'T1' };
    case 'TRANSFORMER':
      return { cb: 'Q0', dsBus: 'Q1', es: 'Q8', ct: 'T1' };
    case 'COUPLER':
      return { cb: 'Q0', dsBus: 'Q1', ct: 'T1' };
    case 'MEASUREMENT':
      return { dsBus: 'Q1', es: 'Q8' };
    case 'CAPACITOR_BANK':
    case 'EARTHING_UNIT':
      return { cb: 'Q0', dsBus: 'Q1', es: 'Q8', ct: 'T1' };
  }
}

/**
 * Plakietki funkcji automatyki pola (karta GPZ-PARYTET) — WYŁĄCZNIE z kodów funkcji
 * zabezpieczeniowych pola w modelu (`Bay.protection_codes`, dane aktywów EAZ, ADR-022):
 * SPZ ⇔ kod ANSI 79; SCO ⇔ kod 81U na polu, które nie jest polem źródłowym (na polu OZE
 * 81U to zabezpieczenie interfejsu wytwórcy NC RfG, nie odciążenie). Brak kodu = brak
 * plakietki — nigdy domysł z roli pola. Kolejność stała (SPZ, SCO), deterministyczna.
 */
export function flagiStatusuPola(bay: Pick<Bay, 'protection_codes' | 'bay_role'>): GpzStatusFlag[] {
  const kody = new Set((bay.protection_codes ?? []).map((kod) => kod.trim().toUpperCase()));
  const flagi: GpzStatusFlag[] = [];
  if (kody.has('79')) flagi.push('SPZ');
  if (kody.has('81U') && bay.bay_role !== 'OZE') flagi.push('SCO');
  return flagi;
}

/** Rola pola dla tła i legendy (`gpz.bay.panel`) — 1:1 z `Bay.bay_role`, bez zlewania
 *  ról (dawne `mapBayRoleToFieldRole` gubiło rolę OZE, sprowadzając ją do odpływu). */
export function rolaPolaGpz(role: Bay['bay_role']): RolaPolaGpz {
  switch (role) {
    case 'IN': return 'zasilajace';
    case 'OUT':
    case 'FEEDER': return 'liniowe';
    case 'TR': return 'transformatorowe';
    case 'COUPLER': return 'sprzeglo';
    case 'MEASUREMENT': return 'pomiarowe';
    case 'OZE': return 'zrodlowe';
    case 'ZU': return 'uziemiajace';
    case 'BKR': return 'kompensacyjne';
  }
}

/**
 * Aparat punktu neutralnego sieci SN stacji — ZAINSTALOWANY w modelu (V12K-219, karta
 * UX-04/POLE-ZU-SKLADOWA-ZEROWA §0 pkt 1).
 *
 * Nośniki uziemienia sieci SN są dwa i tylko dwa: zespół uziemiający na szynie SN stacji
 * (`zespoly_uziemiajace`: uziemienie bezpośrednie, dławik gaszący, rezystor) i punkt neutralny
 * uzwojenia SN transformatora stacji (`Transformer.lv_neutral`). Schemat rysuje ZAINSTALOWANY
 * aparat — wariantu pracy sieci (stany odłączników, AWSC) ani Z_N nie wyprowadza; to robi
 * backend (`enm.uziemienie_sekcji`). Źródło 110 kV nie jest nośnikiem uziemienia sieci SN:
 * dawne odczytanie `Source.neutral_grounding` źródła GPZ rysowało opis sieci 110 kV jako
 * punkt neutralny sieci SN.
 *
 * Kolejność: zespół pierwszej sekcji (porządek `gpz_sections`), potem zespół na innej szynie SN
 * stacji (po `ref_id`), potem uzwojenie SN transformatora stacji (po `ref_id`). Zespół bez
 * elementu w punkcie neutralnym niczego nie rysuje (brak modelu nazywa walidator). Brak aparatu
 * = `null` (zero domysłu — brak to nie „izolowana").
 */
function deriveSnNeutralEarthing(
  enm: ModelSzyn,
  substation: Substation,
  buses: readonly Bus[],
  transformers: readonly Transformer[],
  zespoly: readonly ZespolUziemiajacy[],
): CanonicalGpzProps['snNeutralEarthing'] {
  // SZYNY-STACJI-LUSTRO: przynależność szyny do stacji z jednego lustra.
  const stationBusRefs = szynyStacji(enm, substation);
  const szynySn = new Set(
    buses.filter((b) => stationBusRefs.has(b.ref_id) && wPasmieSn(b.voltage_kv)).map((b) => b.ref_id),
  );
  if (szynySn.size === 0) return null;
  const kolejnoscSekcji = new Map(
    [...(substation.gpz_sections ?? [])]
      .sort((a, b) => a.order - b.order)
      .map((sekcja, indeks) => [sekcja.bus_ref, indeks] as const),
  );
  const pozycja = (busRef: string) => kolejnoscSekcji.get(busRef) ?? Number.MAX_SAFE_INTEGER;
  const zespolyStacji = zespoly
    .filter((z) => szynySn.has(z.bus_ref))
    .sort((a, b) => pozycja(a.bus_ref) - pozycja(b.bus_ref) || a.ref_id.localeCompare(b.ref_id));
  for (const zespol of zespolyStacji) {
    if (zespol.uziemienie_bezposrednie) return { kind: 'direct' };
    const rOhm = zespol.rezystor?.r_ohm ?? undefined;
    if (zespol.dlawik) return { kind: 'coil', ...(zespol.rezystor ? { rOhm } : {}) };
    if (zespol.rezystor) return { kind: 'resistor', rOhm };
  }
  const uzwojenie = [...transformers]
    .filter((tr) => szynySn.has(tr.lv_bus_ref) && tr.lv_neutral)
    .sort((a, b) => a.ref_id.localeCompare(b.ref_id))[0]?.lv_neutral;
  if (!uzwojenie) return null;
  const kind =
    uzwojenie.type === 'resistor_grounded'
      ? 'resistor'
      : uzwojenie.type === 'petersen_coil'
        ? 'coil'
        : uzwojenie.type === 'directly_grounded'
          ? 'direct'
          : 'isolated';
  return { kind, rOhm: uzwojenie.r_ohm ?? undefined, xOhm: uzwojenie.x_ohm ?? undefined };
}
