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
  GPZSection,
  Load,
  Source,
  Substation,
  Transformer,
} from '../../../../types/enm';
import type {
  BayFieldRole,
  CanonicalGpzBay,
  CanonicalGpzBusVt,
  CanonicalGpzCoupler,
  CanonicalGpzHvSection,
  CanonicalGpzHvSystemSource,
  CanonicalGpzLoad,
  CanonicalGpzProps,
  CanonicalGpzSection,
  CanonicalGpzTransformer,
  GpzStatusFlag,
  RolaPolaGpz,
} from './canonicalGpzModel';
import { stanyAparatowPolaZModelu } from '../model/stanAparatowPola';
import { jedynyTransformatorPola, rolaPolaZrodlowego, wytworcyWgPola } from '../model/polaZModelu';
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
    // Karta GPZ-H5-SLD: odbiory przyłączone do szyn sekcji GPZ rysują się przy sekcji.
    | 'loads'
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
  };

  // GPZ-PARYTET cz. 3 (pkt 2): pole TR, którego JEDYNYM transformatorem jest transformator
  // tej stacji (`jedynyTransformatorPola` — ta sama reguła co pola TR stacji SN/nN), rysuje
  // się jako pole toru transformatora (pole WN TR → TR2W z uzwojeniami → pole TR → szyna SN),
  // nie drugi raz w sekcji. Jeden zbiór przypisań steruje OBIEMA stronami: wyłączeniem pola
  // z sekcji i dołączeniem go do toru transformatora (predykaty parami z jednego źródła).
  const transformatoryWgRef = new Map(allTransformers.map((tr) => [tr.ref_id, tr]));
  // Karta GPZ-H5-SLD: przydział pola do sekcji 110 kV z JEDNEJ funkcji (`sekcjaWnPola`) — tej
  // samej dla pól toru transformatora (niżej) i pól rzędu WN (`buildHvSections`).
  const hvSectionDefs = substation.gpz_hv_sections ?? [];
  const polaTrSn = przypiszPolaTr(
    allBays.filter((bay) => isLvBay(bay, enm.buses ?? [])),
    transformatoryWgRef,
  );
  const polaTrWn = przypiszPolaTr(
    allBays.filter((bay) => sekcjaWnPola(bay, hvSectionDefs) !== null),
    transformatoryWgRef,
  );
  const polaWToruTransformatora = new Set<string>(
    [...polaTrSn.values(), ...polaTrWn.values()].map((bay) => bay.ref_id),
  );
  // GEOMETRIA-STACJI (Z-07): pole sprzęgła wskazujące narysowane sprzęgło NIE jest osobnym
  // polem sekcji — jego oznaczenie i aparat niesie sprzęgło (jedno miejsce na rysunku).
  // Karta GPZ-H5-SLD: łącznik szyn 110 kV z TEGO SAMEGO źródła co sprzęgło SN — gałąź
  // `bus_coupler` między szynami dwóch sekcji tej samej strony (`sprzeglaMiedzySekcjami`).
  const couplers = buildCouplers(substation.gpz_sections ?? [], allBays, enm.branches ?? []);
  const hvCouplers = buildCouplers(hvSectionDefs, allBays, enm.branches ?? []);
  const polaSprzegiel = new Set(
    [...couplers, ...hvCouplers].map((c) => c.bayRef).filter((ref): ref is string => ref != null),
  );
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
  const sectionIdByHvBusRef = new Map<string, string>();
  for (const sec of hvSectionDefs) {
    if (sec.bus_ref) sectionIdByHvBusRef.set(sec.bus_ref, sec.section_id);
  }

  const transformers = buildTransformers(allTransformers, sectionIdByLvBusRef, sectionIdByHvBusRef, (tr) => ({
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
    // V12K-219 / W5-A: sposób pracy punktu neutralnego sieci SN — z
    // `Source.neutral_grounding` źródła GPZ tej stacji (jedyny nośnik po kasacji
    // `Bus.grounding`). Mapowanie 1:1 z kanonu ENM, zero domysłu: brak opisu daje
    // `null`, a schemat wtedy nie rysuje aparatu uziemiającego.
    ...uziemienieSieciSn(enm, substation, enm.buses ?? [], enm.sources ?? []),
    couplers,
    hvSections: buildHvSections(substation, polaSekcji, enm.buses ?? [], protectionCtx),
    hvCouplers,
    // Karta GPZ-H5-SLD: KAŻDE źródło na szynie GPZ (dawniej `sources.find` — jedno S″k dla
    // GPZ zasilanego dwiema liniami 110 kV). Także przy sekcjach 110 kV.
    systemSources: deriveSystemSources(enm, substation, enm.buses ?? [], enm.sources ?? []),
    loads: buildGpzLoads(substation, enm.loads ?? []),
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
 * F13.1 (SLD_CAD_SPEC_V3 §21.1, D3-1/D3-8/D3-10) + karta GPZ-H5-SLD: tabliczki źródeł
 * systemowych (sieć zasilająca GPZ) z relacji PIERWSZOKLASOWYCH ENM — zero zgadywania:
 *   1. źródło systemowe = KAŻDE `Source` z `bus_ref` na szynie GPZ z lustra `szynyStacji`
 *      (SN lub WN — obie należą do GPZ). Dawne `sources.find` brało PIERWSZE źródło, więc
 *      GPZ zasilany dwiema liniami 110 kV (układ H5: równoważnik L1 na sekcji A, L2 na
 *      sekcji B) pokazywał jedno S″k dla całej stacji, a drugie źródło bez opisu;
 *   2. nazwa = `Source.name` (nazwa ŹRÓDŁA z modelu: L1, L2 …); źródło bez nazwy nie dostaje
 *      tabliczki (glif zostaje, nazwa nie jest wymyślana). `meta.source_id` to tożsamość
 *      GPZ w sieci (unikalność kolejnego GPZ, `add_grid_source_sn`), wspólna dla wszystkich
 *      równoważników jednego GPZ — jako etykieta dawała każdemu źródłu 110 kV H5 nazwę stacji
 *      (decyzja architekta 2026-10-22: etykietą źródła jest nazwa źródła z modelu);
 *   3. nazwa toru zasilania = `line_field_name` sekcji, której `incoming_source_ref`
 *      wskazuje to źródło (dana sekcji, bez dopasowania po nazwach);
 *   4. szyna WN = `gpzHvBuses` (wpisy `Substation.bus_refs` w paśmie WN) — `sourceOnHvBus`
 *      pyta o ZBIÓR szyn WN; `hvBusVoltageKv` opisuje POZIOM napięcia, więc szyny WN
 *      o RÓŻNYCH poziomach dają `null` (uczciwy brak zamiast pierwszej z brzegu).
 * Porządek: `sourceRef` (deterministycznie, niezależnie od kolejności tablicy `sources`).
 */
function deriveSystemSources(
  enm: ModelSzyn,
  gpz: Substation,
  buses: readonly Bus[],
  sources: readonly Source[],
): CanonicalGpzHvSystemSource[] {
  const hvBuses = gpzHvBuses(gpz, buses);
  const hvBus = hvBuses[0] ?? null;
  const hvBusVoltageKv =
    hvBus !== null && hvBuses.every((b) => b.voltage_kv === hvBus.voltage_kv) ? hvBus.voltage_kv ?? null : null;
  const gpzBusRefs = szynyStacji(enm, gpz);
  const sekcje = [...(gpz.gpz_hv_sections ?? []), ...(gpz.gpz_sections ?? [])];
  const busesByRef = new Map(buses.map((b) => [b.ref_id, b]));
  return sources
    .filter((s) => s.bus_ref != null && gpzBusRefs.has(s.bus_ref))
    .slice()
    .sort((a, b) => (a.ref_id < b.ref_id ? -1 : a.ref_id > b.ref_id ? 1 : 0))
    .flatMap((source): CanonicalGpzHvSystemSource[] => {
      const name = readString(source.name);
      if (!name) return [];
      const sekcjaToru = sekcje.find((sec) => sec.incoming_source_ref === source.ref_id) ?? null;
      // Recenzja NO-GO 2026-07-17 pkt 2/3: napięcie tabliczki = szyna ŹRÓDŁA
      // (spójność Sk″/Ik″/U), a strona zaczepu podąża za `Source.bus_ref` —
      // ekwiwalent na szynach SN NIE jest rysowany jako przyłącze WN.
      const sourceBus = busesByRef.get(source.bus_ref) ?? null;
      return [{
        sourceRef: source.ref_id,
        busRef: source.bus_ref ?? null,
        lineName: readString(source.supply_line_name) ?? readString(sekcjaToru?.line_field_name),
        supplyingStation: readString(source.supplying_station_name),
        name,
        sk3Mva: source.sk3_mva ?? null,
        ik3Ka: source.ik3_ka ?? null,
        sk3MinMva: source.sk3_min_mva ?? null,
        ik3MinKa: source.ik3_min_ka ?? null,
        uSetPu: source.u_set_pu ?? null,
        voltageKv: sourceBus?.voltage_kv ?? null,
        sourceOnHvBus: hvBuses.some((b) => b.ref_id === source.bus_ref),
        hvBusVoltageKv,
      }];
    });
}

/**
 * Karta GPZ-H5-SLD: odbiory na szynach sekcji GPZ (SN: `gpz_sections`, WN:
 * `gpz_hv_sections`) — rysowane przy swojej sekcji. Odbiór na szynie spoza sekcji (np. zacisk
 * pola) nie jest odbiorem sekcji; porządek `loadRef`.
 */
function buildGpzLoads(gpz: Substation, loads: readonly Load[]): CanonicalGpzLoad[] {
  const sekcjaWgSzyny = new Map<string, { readonly sectionId: string; readonly side: 'sn' | 'wn' }>();
  for (const sec of gpz.gpz_sections ?? []) sekcjaWgSzyny.set(sec.bus_ref, { sectionId: sec.section_id, side: 'sn' });
  for (const sec of gpz.gpz_hv_sections ?? []) sekcjaWgSzyny.set(sec.bus_ref, { sectionId: sec.section_id, side: 'wn' });
  return loads
    .filter((load) => sekcjaWgSzyny.has(load.bus_ref))
    .slice()
    .sort((a, b) => (a.ref_id < b.ref_id ? -1 : a.ref_id > b.ref_id ? 1 : 0))
    .map((load) => {
      const sekcja = sekcjaWgSzyny.get(load.bus_ref)!;
      return {
        loadRef: load.ref_id,
        name: readString(load.name),
        busRef: load.bus_ref,
        sectionId: sekcja.sectionId,
        side: sekcja.side,
        pMw: typeof load.p_mw === 'number' ? load.p_mw : null,
        qMvar: typeof load.q_mvar === 'number' ? load.q_mvar : null,
      };
    });
}

/**
 * Karta GPZ-H5-SLD: sekcja 110 kV pola — `Bay.gpz_section_id` wskazujący sekcję 110 kV, a gdy
 * go brak — sekcja 110 kV, której szyną jest `Bay.bus_ref`. JEDNA funkcja dla pól toru
 * transformatora (pole WN TR) i pól rzędu WN (predykaty parami).
 */
function sekcjaWnPola(bay: Bay, hvSectionDefs: readonly GPZSection[]): GPZSection | null {
  if (bay.gpz_section_id != null) {
    return hvSectionDefs.find((sec) => sec.section_id === bay.gpz_section_id) ?? null;
  }
  return hvSectionDefs.find((sec) => sec.bus_ref === bay.bus_ref) ?? null;
}

/* =============================================================================
   Sub-builders
   ============================================================================= */

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
  sectionIdByHvBusRef: ReadonlyMap<string, string>,
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
      hvSectionId: sectionIdByHvBusRef.get(tr.hv_bus_ref) ?? null,
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
type ProtectionCtx = Pick<EnergyNetworkModel, 'protection_assignments' | 'measurements' | 'substations' | 'branches'> & {
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
      const hvBays = bays.filter((b) => sekcjaWnPola(b, hvSectionDefs)?.section_id === sec.section_id);
      const bus = buses.find((b) => b.ref_id === sec.bus_ref);
      return {
        sectionId: sec.section_id,
        order: sec.order,
        busRef: sec.bus_ref ?? null,
        label: readString(sec.name) ?? `Sekcja ${idx + 1}`,
        busVoltageKv: bus?.voltage_kv ?? null,
        bays: hvBays.map((b) => buildBay(b, protectionCtx)),
        lineFieldName: readString(sec.line_field_name),
        incomingSourceRef: readString(sec.incoming_source_ref),
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
 * modelu łączących szyny sekcji JEDNEJ strony (`sprzeglaMiedzySekcjami`, ta sama funkcja co
 * stacje SN). Karta GPZ-H5-SLD: wołana dla sekcji SN (`gpz_sections`) i dla sekcji 110 kV
 * (`gpz_hv_sections`) — łącznik szyn 110 kV ma to samo źródło stanu co sprzęgło SN.
 * Do karty sprzęgło wymagało rekordu pola COUPLER, którego operacja GPZ nie tworzy, więc
 * sprzęgło z modelu znikało z rysunku. Rekord pola sprzęgła, gdy jest, dokłada oznaczenie
 * i rodzaj aparatu; stan rysunku pochodzi ze `status` gałęzi.
 */
function buildCouplers(
  sekcje: readonly GPZSection[],
  bays: readonly Bay[],
  branches: readonly Branch[],
): CanonicalGpzCoupler[] {
  const sectionDefs = [...sekcje].sort((a, b) => a.order - b.order);
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
      normalState: sprzeglo.normalState,
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
    // Karta GPZ-H5-SLD etap 3: pola funkcyjne sekcji SN mają własne role; dawna gałąź
    // `default → 'LINE_OUT'` rysowała je jako pole liniowe. Wyliczenie wyczerpujące — nowa
    // rola modelu bez odwzorowania jest błędem typu.
    case 'EARTHING': return 'EARTHING';
    case 'CAPACITOR': return 'CAPACITOR';
    default: {
      const nieobsluzona: never = role;
      throw new Error(`Rola pola GPZ bez odwzorowania na rysunku: ${String(nieobsluzona)}`);
    }
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
    // Pola funkcyjne powstają BEZ aparatów (operacja GPZ, `_pola_funkcyjne_sekcji`) — rola
    // nie przesądza składu, więc nie niesie oznaczeń Q; aparaty i ich oznaczenia wyłącznie
    // z rekordów modelu.
    case 'EARTHING':
    case 'CAPACITOR':
      return {};
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
    case 'EARTHING': return 'uziemiajace';
    case 'CAPACITOR': return 'kompensacyjne';
    case 'OZE': return 'zrodlowe';
  }
}

/**
 * Sposób pracy punktu neutralnego sieci SN z modelu (V12K-219).
 *
 * Szukamy szyny SN tej stacji (pasmo SN: powyżej 1 kV i poniżej 110 kV — `wPasmieSn`,
 * to samo lustro granic co `hvBusRef` powyżej) i przepisujemy
 * `Source.neutral_grounding` źródeł stacji. Rozstrzygnięcie należy do MODELU: `isolated` to
 * informacja inżynierska (sieć pracuje z izolowanym punktem neutralnym), a BRAK pola to
 * brak danej — te dwa stany nie mogą się zlać, bo prąd zwarcia doziemnego różni
 * się między konfiguracjami o rzędy wielkości.
 *
 * Karta GPZ-H5-SLD (uczciwość w obrębie pliku, ta sama klasa co `sources.find` źródła
 * systemowego): GPZ z kilkoma źródłami (H5: równoważnik toru L1 i toru L2) może nieść
 * kilka opisów. Zgodne opisy = jeden symbol; RÓŻNE = `null` + `snNeutralEarthingAmbiguous`
 * (dawniej rysunek brał opis pierwszego źródła tablicy).
 */
function uziemienieSieciSn(
  enm: ModelSzyn,
  substation: Substation,
  buses: readonly Bus[],
  sources: readonly Source[],
): Pick<CanonicalGpzProps, 'snNeutralEarthing' | 'snNeutralEarthingAmbiguous'> {
  // SZYNY-STACJI-LUSTRO: przynależność szyny źródła do stacji z jednego lustra.
  const stationBusRefs = szynyStacji(enm, substation);
  const opisy = sources
    .filter(
      (s) =>
        Boolean(s.neutral_grounding)
        && (s.substation_ref === substation.ref_id || stationBusRefs.has(s.bus_ref)),
    )
    .map((s) => s.neutral_grounding!)
    .map((g) => ({
      kind:
        g.type === 'resistor_grounded'
          ? ('resistor' as const)
          : g.type === 'petersen_coil'
            ? ('coil' as const)
            : g.type === 'directly_grounded'
              ? ('direct' as const)
              : ('isolated' as const),
      rOhm: g.r_ohm ?? undefined,
      xOhm: g.x_ohm ?? undefined,
    }));
  if (opisy.length === 0) return { snNeutralEarthing: null };
  const klucz = (o: (typeof opisy)[number]): string => `${o.kind}|${o.rOhm ?? ''}|${o.xOhm ?? ''}`;
  if (new Set(opisy.map(klucz)).size > 1) return { snNeutralEarthing: null, snNeutralEarthingAmbiguous: true };
  // Rysowany przy szynie SN (transformator Yd11 nie ma punktu neutralnego SN) —
  // szyna SN stacji istnieje niezależnie od tego, czy źródło stoi po stronie 110 kV.
  const snBus = buses.find(
    (b) => stationBusRefs.has(b.ref_id) && wPasmieSn(b.voltage_kv),
  );
  if (!snBus) return { snNeutralEarthing: null };
  return { snNeutralEarthing: opisy[0] };
}
