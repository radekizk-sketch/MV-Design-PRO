/**
 * UI-02b JEDEN-INSPEKTOR — dane prawego inspektora dla obiektu klikniętego na kanwie
 * (`PanelElementuKanwy`, `stanPaneluElementu.ts`). Jedynym konsumentem jest inspektor;
 * kanwa przekazuje mu wyłącznie KONTEKST kliknięcia (`kontekstElementuKanwy.ts`), a dane
 * liczy się tu z bieżących magazynów: migawki modelu (`EnergyNetworkModel`), widoku
 * adaptera SLD (`SldDataPayload`, `v2/canvas/enmToSldAdapter.ts`) i nakładki wyników
 * (`RawOverlayPayload`).
 *
 * Zakres danych jest ZAMKNIĘTY do tego, co inspektor pokazuje: rodzaj, identyfikator,
 * etykieta, kod stacji, kontekst stacji/pola, identyfikator globalny aparatu, stan aparatu
 * z rekordu źródła runtime, dane węzła SN, napięcie szyny nN dla szkicu DER i wielkości
 * wynikowe. Dane techniczne transformatora, pól, odbiorów i źródeł stacji daje karta
 * inspektora z modelu (`InspectorEngineeringView`), nie ten moduł — druga kopia tych danych
 * była drugą prawdą dawnego panelu szczegółów kanwy (skasowanego tą kartą).
 *
 * Moduł nie czyta geometrii rysunku (kamera, układ, trafienia) i nie liczy fizyki: wartości
 * wynikowe pochodzą z backendu, tu wyłącznie ich zapis polski.
 */
import type {
  Bay,
  BayControlMode,
  BaySwitchState,
  Branch,
  EnergyNetworkModel,
  Substation,
} from '../../../types/enm';
import type { SelectedElement } from '../../types';
import { publicTechnicalLabel, segmentPublicIdentity, stationPublicIdentity } from '../../shared/publicTechnicalLabels';
import { selectStationDistributionTransformers, stationRefOfTransformer } from '../../shared/transformatoryStacji';
import { getMetric, type RawOverlayPayload } from '../../sld-overlay/rawResultOverlayStore';
import { formatScalar } from '../v3/canvas/resultLabelTemplates';
import type { SldDataPayload } from '../v2/canvas/enmToSldAdapter';
import { projectBayPrimaryDevices } from '../v2/canvas/enmToSldAdapter';
import {
  stanLacznikaPolaZModelu,
  stanLacznikaToruZModelu,
} from '../v2/model/stanAparatowPola';
import { czyPoleNn, pola, polaNnStacji, polaSnStacji, stacjaPola } from '../../shared/polaStacji';
import { apparatusIdentifiers, symbolIdForPrimaryDeviceKind } from '../v3/compose/apparatusSequence';
import { fieldRoleLabelPl } from '../v2/station-rozdzielnia/contract';
import type { PreviewElementKind } from '../v3/compose/preview';

/**
 * Rodzaj obiektu, dla którego inspektor elementu (prawy panel, `PanelElementuKanwy`)
 * pokazuje dane z kanwy: wyniki, działania, dane węzła, stan aparatu, szkic DER.
 */
export type RodzajElementuKanwy =
  | 'station'
  | 'bay'
  | 'apparatus'
  | 'transformer'
  | 'der'
  | 'cable_run'
  | 'node'
  // K6: źródło OZE (`Generator`), sieć zasilająca (`Source`) i szyna (`Bus`) — dotąd klik
  // w nie dawał `null` (sieć zasilająca: rodzaj „station" z refem źródła — fałszywa kategoria).
  | 'generator'
  | 'grid_source'
  | 'bus'
  | null;

export interface DaneElementuKanwy {
  /** Element kind — determines which tab set to show. */
  readonly kind: RodzajElementuKanwy;
  /** Element id (ref_id). */
  readonly elementId: string | null;
  /** Display label (np. "S08 SN" / "Q01" / "PV-1"). */
  readonly label?: string;
  /** Station code (for breadcrumb). */
  readonly stationCode?: string | null;
  /** Szkic DER: napięcie szyny nN stacji docelowej z modelu (`null` = stacja bez
   *  transformatora w modelu — formularz pokazuje wtedy jawny fallback katalogowy). */
  readonly nnSpec?: {
    readonly busVoltageKv: number | null;
  } | null;
  /** K30-84 → UI-02b: wielkości wynikowe elementu z nakładki wyników (sekcja „Wyniki"
   *  inspektora). `code` = kod metryki backendu, `label` = nazwa polska, `value` = wartość
   *  z jednostką sformatowana z `format_hint` backendu. */
  readonly liveMetrics?: ReadonlyArray<{
    readonly code: string;
    readonly label: string;
    readonly value: string;
  }>;
  /** K30-98: breadcrumb context — parent station label (Stacja › Pole). */
  readonly parentStationLabel?: string | null;
  /** Recenzja NO-GO 2026-07-17 pkt 9: identyfikator GLOBALNY
   *  ⟨stacja⟩.⟨pole⟩.⟨aparat⟩ (np. „S01.F01.Q2") — `null` gdy dane nie
   *  pozwalają go złożyć (brak kodu stacji/rekordu pola). */
  readonly globalId?: string | null;
  /** K30-98: breadcrumb context — parent bay label dla apparatus kind. */
  readonly parentBayLabel?: string | null;
  /** Stan aparatu (kind='apparatus'): `actualState` = położenie łącznika z modelu (ten sam
   *  rachunek co glif kanwy, `stanLacznikaPolaZModelu`; `null` = model nie niesie stanu);
   *  pozostałe pola = rekord ŹRÓDŁA runtime (karta #135: `null` = brak telemetrii, nigdy
   *  wartość domyślna). Całość `null`, gdy model nie ma ani położenia, ani rekordu. */
  readonly apparatusState?: {
    readonly actualState: 'closed' | 'open' | 'unknown' | null;
    readonly controlMode: BayControlMode | null;
    readonly communicationOk: boolean | null;
    readonly interlockBlocked: boolean | null;
    readonly lastChangeAt: string | null;
  } | null;
  /** Obiekt wezlowy magistrali SN: ZKSN, slup rozgalezny, NMO. */
  readonly nodeSpec?: {
    readonly nodeKind: 'zksn' | 'branch_pole' | 'nmo' | 'other';
    readonly rolePl: string;
    readonly voltageKv: number | null;
    readonly connectedSegmentsCount: number | null;
    readonly catalogRef: string | null;
    readonly blockers: readonly string[];
  } | null;
}


export function findSubstationByRef(
  snapshot: EnergyNetworkModel | null,
  substationRef: string,
): Substation | null {
  return (
    (snapshot?.substations ?? []).find(
      (substation) => substation.ref_id === substationRef || substation.id === substationRef,
    ) ?? null
  );
}

/** Etykiety polskie wielkości wynikowych elementu — klucz = kod metryki nakładki
 *  wyników (`RawOverlayPayload.elements[ref].metrics`). Wartość i jednostka zawsze
 *  z backendu, zapis polski tym samym formaterem co etykiety wyników na kanwie
 *  (`formatScalar`), tu wyłącznie nazwa wielkości. */
const ETYKIETA_METRYKI_PL: Readonly<Record<string, string>> = {
  U_kV: 'Napięcie U',
  U_pu: 'Napięcie względne U',
  P_MW: 'Moc czynna P',
  Q_Mvar: 'Moc bierna Q',
  I_A: 'Prąd I',
};

/**
 * K30-84 → UI-02b: wielkości wynikowe elementu (U, U wzgl., P, Q, I) z nakładki wyników
 * aktywnego przebiegu (`RawOverlayPayload`, LF/SC) — sekcja „Wyniki" inspektora elementu.
 * `undefined` = brak payloadu albo brak wielkości dla tego refu (inspektor pokazuje stan
 * „brak", nigdy zero). Stacja czyta szynę SN `⟨stacja⟩/sn_bus`.
 *
 * Bez kolorowania odchyłki napięcia: dawne progi ±5 % / ±10 % zaszyte w tym module były
 * werdyktem bez kryterium, podstawy i marginesu (kontrakt werdyktu wyjaśnialnego) —
 * ocenę napięć wydaje analiza profilu napięć backendu, nie warstwa prezentacji.
 */
export function buildLiveMetrics(
  payload: RawOverlayPayload | null,
  rodzaj: DaneElementuKanwy['kind'],
  elementId: string,
): DaneElementuKanwy['liveMetrics'] {
  if (!payload) return undefined;
  const ref = rodzaj === 'station'
    ? elementId.endsWith('/station')
      ? `${elementId.slice(0, -'/station'.length)}/sn_bus`
      : `${elementId}/sn_bus`
    : elementId;
  const kody = rodzaj === 'station' ? ['U_kV', 'U_pu'] : ['P_MW', 'Q_Mvar', 'I_A', 'U_kV'];
  const metryki: Array<{ code: string; label: string; value: string }> = [];
  for (const code of kody) {
    const m = getMetric(payload, ref, code);
    // Wielkość bez wartości liczbowej nie dostaje wiersza (uczciwy brak, nie „—").
    if (m && typeof m.value === 'number' && Number.isFinite(m.value)) {
      metryki.push({ code, label: ETYKIETA_METRYKI_PL[code] ?? code, value: formatScalar(m) });
    }
  }
  return metryki.length > 0 ? metryki : undefined;
}

/**
 * Dane inspektora dla STACJI (kind='station', K30-72).
 *
 * `stationId` musi być realnym refem stacji (ENM `Substation.ref_id`/`id`
 * LUB `SldDataPayload.stations[].id` — oba adaptery używają tej samej
 * konwencji referencji). Zwraca `null` WYŁĄCZNIE gdy stacja nie istnieje w
 * ŻADNYM z dwóch źródeł (ani ENM, ani `sldData`) — uczciwy brak, inspektor
 * nie pokazuje wtedy sekcji z kanwy.
 */
export function buildDaneStacji(
  snapshot: EnergyNetworkModel | null,
  sldData: SldDataPayload,
  overlayPayload: RawOverlayPayload | null,
  stationId: string,
): DaneElementuKanwy | null {
  const substation = findSubstationByRef(snapshot, stationId);
  const stacjaSld = sldData.stations.find((s) => s.id === stationId);
  if (!substation && !stacjaSld) return null;

  const stationLabelOverride = substation && snapshot
    ? stationPublicIdentity(snapshot, substation).displayName
    : null;

  return {
    kind: 'station',
    elementId: stationId,
    label: stationLabelOverride
      ?? stacjaSld?.name
      ?? stacjaSld?.stationCode
      ?? stationId.split('/').pop()
      ?? stationId,
    stationCode: stacjaSld?.stationCode ?? null,
    liveMetrics: buildLiveMetrics(overlayPayload, 'station', stationId),
  };
}

export function findBusVoltage(snapshot: EnergyNetworkModel | null, busRef: string): number | null {
  return (snapshot?.buses ?? []).find((bus) => bus.ref_id === busRef || bus.id === busRef)?.voltage_kv ?? null;
}

/**
 * Rekord stanu aparatu ZE ŹRÓDŁA runtime zapisanego w modelu (karta #135) — ta sama kolejność
 * źródeł co backend `enm.interlock_rules.runtime_state_record`: rekord `switch_state` aparatu
 * pierwotnego pola, potem `Bay.runtime_state.primary_device_states`. `null` = brak źródła —
 * panel elementu pokazuje wtedy „brak telemetrii", nigdy stanu domyślnego.
 */
function rekordStanuAparatu(bay: Bay, deviceRef: string): BaySwitchState | null {
  const aparat = (bay.primary_devices ?? []).find(
    (device) => device.device_ref === deviceRef && device.switch_state,
  );
  if (aparat?.switch_state) return aparat.switch_state;
  return bay.runtime_state?.primary_device_states?.[deviceRef] ?? null;
}

const INTERNAL_STATION_DEVICE_LABELS_PL: Readonly<Record<string, string>> = {
  'switch-disconnector': 'Rozłącznik',
  fuse: 'Bezpiecznik',
  'earthing-switch': 'Uziemnik',
  'cable-head': 'Głowica kablowa',
  'transformer-device': 'Transformator',
  breaker: 'Wyłącznik',
  disconnector: 'Odłącznik',
  vt: 'Przekładnik napięciowy',
};

/** `id` w postaci `${stationRef}/internal-bay/...`, `${stationRef}/nn/...`,
 *  `${stationRef}/pv/...`, `${stationRef}/transformer/...` — konwencja
 *  `StationInternalView` (K30). */
export function stationRefFromInternalElement(id: string): string | null {
  for (const marker of ['/internal-bay/', '/nn/', '/pv/', '/transformer/']) {
    const markerIndex = id.indexOf(marker);
    if (markerIndex > 0) return id.slice(0, markerIndex);
  }
  return null;
}

export function stationDisplayNameForRef(snapshot: EnergyNetworkModel | null, stationRef: string): string {
  const station = findSubstationByRef(snapshot, stationRef);
  return station && snapshot
    ? stationPublicIdentity(snapshot, station).displayName
    : 'stacja SN/nN';
}

export function stationRefForTransformerSelection(
  snapshot: EnergyNetworkModel | null,
  transformerRef: string,
): string | null {
  // SZYNY-STACJI-LUSTRO (commit 2): stacja transformatora z JEDNEJ reguły „transformatory
  // stacji” (`stationRefOfTransformer`, odwrotność `selectStationDistributionTransformers`).
  // Dawny skrót „ref wewnętrznego widoku stacji” (`stationRefFromInternalElement`) dopasowywał
  // także realne refy modelu — `gpz/<id>/transformer/001/wn_sn` dawał „stację” `gpz/<id>`.
  return stationRefOfTransformer(snapshot, transformerRef);
}

export function describeStationInternalElement(
  snapshot: EnergyNetworkModel | null,
  id: string,
): SelectedElement | null {
  const stationRef = stationRefFromInternalElement(id);
  if (!stationRef) return null;
  const stationName = stationDisplayNameForRef(snapshot, stationRef);

  if (id.includes('/internal-bay/')) {
    const bayPath = id.slice(id.indexOf('/internal-bay/') + '/internal-bay/'.length);
    const [bayKey, deviceKey] = bayPath.split('/');
    const roleKey = bayKey?.split('-')[0] ?? '';
    // Etykieta roli z kanonu słownictwa ról pól (karta #141); rola spoza kanonu — „Pole SN”.
    const bayLabel = fieldRoleLabelPl(roleKey);
    const deviceLabel = deviceKey ? INTERNAL_STATION_DEVICE_LABELS_PL[deviceKey] ?? 'Aparat pola SN' : null;
    return {
      id,
      type: deviceLabel ? 'Switch' : 'BaySN',
      name: deviceLabel
        ? `${deviceLabel} - ${bayLabel}, ${stationName}`
        : `${bayLabel} - ${stationName}`,
    };
  }

  if (id.includes('/nn/')) {
    return {
      id,
      type: 'SwitchNN',
      name: `Wyłącznik nN - ${stationName}`,
    };
  }

  if (id.includes('/pv/nn-pcc')) {
    return {
      id,
      type: 'ConnectionPoint',
      name: `Punkt przyłączenia PV po stronie nN - ${stationName}`,
    };
  }

  if (id.includes('/pv/nn-breaker/')) {
    return {
      id,
      type: 'SwitchNN',
      name: `Wyłącznik nN PV - ${stationName}`,
    };
  }

  if (id.includes('/pv/protection/')) {
    return {
      id,
      type: 'ProtectionNN',
      name: `Zabezpieczenie PV - ${stationName}`,
    };
  }

  if (id.includes('/pv/inverter/')) {
    return {
      id,
      type: 'PVInverter',
      name: `Falownik PV - ${stationName}`,
      semanticHash: `source:${id}`,
      semanticElementKind: 'SOURCE',
      semanticEngineeringRole: 'PV_INVERTER',
    };
  }

  if (id.includes('/transformer/')) {
    return {
      id,
      type: 'TransformerBranch',
      name: `Transformator - ${stationName}`,
    };
  }

  return null;
}

/** `kind` z `onSelectElement` → kind gałęzi panelu elementu. `null` = brak
 *  dedykowanego panelu elementu dla tego `kind` (np. `background`/`section`/
 *  `der_bess`/`der_fw`). */
export function mapKindToRodzajElementu(kind: string): DaneElementuKanwy['kind'] | null {
  if (kind === 'station' || kind === 'gpz') return 'station';
  if (kind === 'bay') return 'bay';
  if (kind === 'apparatus' || kind === 'lv_breaker' || kind === 'protection' || kind === 'pcc' || kind === 'der_pcc_bay') return 'apparatus';
  if (kind === 'transformer' || kind === 'der_block_transformer') return 'transformer';
  if (kind === 'der' || kind === 'pv_inverter') return 'der';
  if (kind === 'cable_run' || kind === 'cable_segment_sn' || kind === 'overhead_line_sn') return 'cable_run';
  if (kind === 'zksn' || kind === 'branch_pole') return 'node';
  return null;
}

/**
 * Dane inspektora dla ODCINKA SN (`cable_run`/`cable_segment_sn`/`overhead_line_sn`):
 * ref i nazwa publiczna klikniętego segmentu (dla całego ciągu — pierwszego segmentu)
 * oraz jego wielkości wynikowe. Zawsze kompletny obiekt — `id` jest ostatecznym refem.
 * Dane trasy i katalogu odcinka daje konfigurator odcinka (E-12), nie ten moduł.
 */
export function buildDaneCiaguSn(
  snapshot: EnergyNetworkModel | null,
  sldData: SldDataPayload,
  overlayPayload: RawOverlayPayload | null,
  id: string,
): DaneElementuKanwy {
  const run = sldData.cableRuns.find((item) =>
    item.id === id || item.segmentRefs?.includes(id),
  );
  const clickedBranch = (snapshot?.branches ?? []).find(
    (item) => item.ref_id === id || item.id === id,
  ) as Branch | undefined;
  const fallbackSegmentRef = run?.segmentRefs?.[0] ?? id;
  const branch = clickedBranch
    ?? ((snapshot?.branches ?? []).find(
      (item) => item.ref_id === fallbackSegmentRef || item.id === fallbackSegmentRef,
    ) as Branch | undefined);
  const elementRef = branch?.ref_id ?? branch?.id ?? fallbackSegmentRef;
  const elementName = branch && snapshot
    ? segmentPublicIdentity(snapshot, branch).displayName
    : run?.label?.trim() || 'Odcinek SN';

  return {
    kind: 'cable_run',
    elementId: elementRef,
    label: elementName,
    liveMetrics: buildLiveMetrics(overlayPayload, 'cable_run', elementRef),
  };
}

/**
 * Dane inspektora dla WĘZŁA SN (`zksn`/`branch_pole`): rola, napięcie szyny węzła, liczba
 * przyłączonych odcinków, pozycja katalogowa (brak = jawna blokada) i wielkości wynikowe.
 * Zawsze kompletny obiekt (jak `buildDaneCiaguSn`).
 */
export function buildDaneWezlaSn(
  snapshot: EnergyNetworkModel | null,
  overlayPayload: RawOverlayPayload | null,
  kind: 'zksn' | 'branch_pole',
  id: string,
): DaneElementuKanwy {
  const branchPoint = (snapshot?.branch_points ?? []).find(
    (item) => item.ref_id === id || item.id === id,
  );
  const elementRef = branchPoint?.ref_id ?? branchPoint?.id ?? id;
  const isZksn = kind === 'zksn';
  const elementName = publicTechnicalLabel(
    branchPoint?.name ?? null,
    isZksn ? 'ZK SN' : 'Słup rozgałęźny SN',
  );

  const branchPointAny = branchPoint as {
    bus_ref?: string | null;
    catalog_ref?: string | null;
  } | undefined;
  const nodeVoltage = branchPointAny?.bus_ref
    ? findBusVoltage(snapshot, branchPointAny.bus_ref)
    : null;
  const connectedSegments = branchPointAny?.bus_ref
    ? (snapshot?.branches ?? []).filter((branchItem) =>
      branchItem.from_bus_ref === branchPointAny.bus_ref || branchItem.to_bus_ref === branchPointAny.bus_ref,
    ).length
    : null;
  return {
    kind: 'node',
    elementId: elementRef,
    label: elementName,
    nodeSpec: {
      nodeKind: isZksn ? 'zksn' : 'branch_pole',
      rolePl: isZksn ? 'Złącze kablowe SN' : 'Słup rozgałęźny SN',
      voltageKv: nodeVoltage,
      connectedSegmentsCount: connectedSegments,
      catalogRef: branchPointAny?.catalog_ref ?? null,
      blockers: branchPointAny?.catalog_ref ? [] : ['Brak pozycji katalogowej węzła SN.'],
    },
    liveMetrics: buildLiveMetrics(overlayPayload, 'apparatus', elementRef),
  };
}

/**
 * Dane stacji docelowej szkicu DER (`kind: 'der'`) po upuszczeniu źródła PV/BESS/FW
 * z palety na stację (K30-78, `useDerDragDrop.dropOnStation`) — wejście formularza
 * `FormularzSzkicuDer` w prawym inspektorze. Rodzaj źródła niesie szkic
 * (`kontekstElementuKanwy.ts`), nie te dane.
 *
 * Karta FAB-K (§0 R3/R4, KLASA NIE INSTANCJA): `nnSpec.busVoltageKv` — REALNA
 * szyna nN stacji (`selectStationDistributionTransformers` → `lv_bus_ref` →
 * `buses[].voltage_kv`, ta sama migawka co `buildDaneStacji`
 * wyżej), nie zgadywane „zawsze 0,4 kV" (dawny `pointVoltageForVariant` ignorował
 * model dla `nn_side` i wpisywał stałą).
 * Falownik przeciągnięty na stację BEZ transformatora w ENM zostaje z `null` —
 * inspektor elementu pokazuje wtedy uczciwy fallback katalogowy, nie fikcyjną
 * pewność.
 */
export function buildDaneSzkicuDer(
  snapshot: EnergyNetworkModel | null,
  sldData: SldDataPayload,
  stationId: string,
): DaneElementuKanwy {
  const stationForDrop = sldData.stations.find((s) => s.id === stationId);
  const substation = findSubstationByRef(snapshot, stationId);
  const tr = selectStationDistributionTransformers(snapshot, substation ?? null)[0];
  const lvBusRef = tr?.lv_bus_ref ?? null;
  const lvBus = lvBusRef && snapshot
    ? (snapshot.buses ?? []).find((b) => b.ref_id === lvBusRef || b.id === lvBusRef)
    : null;
  return {
    kind: 'der',
    elementId: stationId,
    label: stationForDrop?.stationCode
      ?? stationForDrop?.name
      ?? stationId.split('/').pop()
      ?? stationId,
    stationCode: stationForDrop?.stationCode ?? null,
    nnSpec: { busVoltageKv: lvBus?.voltage_kv ?? tr?.ulv_kv ?? null },
  };
}

/**
 * Nazwa elementu z modelu dla identyfikatora (każda kolekcja ENM z `ref_id` i `name`, w tym
 * rekordy pól `bays`) — tytuł panelu elementu nie spada na człon surowego identyfikatora
 * (np. „000" z `…/sn_field_breaker/000`), gdy model zna nazwę elementu.
 */
function nazwaElementuZModelu(
  snapshot: EnergyNetworkModel | null,
  id: string,
): string | null {
  for (const kolekcja of Object.values(snapshot ?? {})) {
    if (!Array.isArray(kolekcja)) continue;
    for (const element of kolekcja as unknown[]) {
      if (typeof element !== 'object' || element === null) continue;
      const rekord = element as { ref_id?: unknown; name?: unknown };
      if (rekord.ref_id === id && typeof rekord.name === 'string' && rekord.name.trim()) {
        return rekord.name.trim();
      }
    }
  }
  return null;
}

/**
 * Dane inspektora dla `station`/`gpz`/`bay`/`apparatus`/`lv_breaker`/`protection`/`pcc`/
 * `der_pcc_bay`/`transformer`/`der_block_transformer`/`der`/`pv_inverter` (kategorie
 * `mapKindToRodzajElementu`). Stacja deleguje do `buildDaneStacji`. `null`, gdy kategoria
 * nie ma danych inspektora (np. `background`/`section`) — bez zgadywania.
 */
export function buildDaneElementuStacji(
  snapshot: EnergyNetworkModel | null,
  sldData: SldDataPayload,
  overlayPayload: RawOverlayPayload | null,
  kind: string,
  id: string,
): DaneElementuKanwy | null {
  const rodzaj = mapKindToRodzajElementu(kind);
  if (!rodzaj) return null;

  const stacjaSld = sldData.stations.find((s) => s.id === id);
  const internalStationRef = stationRefFromInternalElement(id);
  const stationForInternalElement = internalStationRef
    ? sldData.stations.find((s) => s.id === internalStationRef)
    : undefined;
  const transformerStationRef = rodzaj === 'transformer'
    ? stationRefForTransformerSelection(snapshot, id)
    : null;
  const stationForTransformer = transformerStationRef
    ? sldData.stations.find((s) => s.id === transformerStationRef)
    : undefined;
  // Kod stacji z relacji elementu (stacja kliknięta, stacja elementu wewnętrznego, stacja
  // transformatora). Brak relacji ⇒ `null` — dawne `sldData.stations[0]` przypisywało
  // elementowi bez stacji kod PIERWSZEJ stacji rysunku (fałszywy kontekst w inspektorze).
  const stationContext = kind === 'station'
    ? stacjaSld
    : stationForInternalElement ?? stationForTransformer;
  const internalElementDescription = describeStationInternalElement(snapshot, id);
  // Gałąź 'station' ma KOMPLETNY obiekt z budowniczego stacji — użyty wprost.
  const daneStacjiBudowniczego = rodzaj === 'station'
    ? buildDaneStacji(snapshot, sldData, overlayPayload, id)
    : null;
  // Etykieta transformatora: nazwa rekordu modelu (bezpośredniego albo pierwszego
  // transformatora dystrybucyjnego stacji), potem opis elementu wewnętrznego, potem rodzaj
  // bez klasy napięciowej (karta ETYKIETY-TR).
  let transformerLabelOverride: string | null = null;
  if (rodzaj === 'transformer' && snapshot) {
    const directTransformer = (snapshot.transformers ?? []).find(
      (item) => item.ref_id === id || item.id === id,
    );
    const stationRef = transformerStationRef ?? internalStationRef;
    const transformerStation = stationRef ? findSubstationByRef(snapshot, stationRef) : null;
    const tr = directTransformer ?? selectStationDistributionTransformers(snapshot, transformerStation)[0] ?? null;
    transformerLabelOverride = tr?.name ?? internalElementDescription?.name ?? 'Transformator';
  }
  // Karta #135 (e)1: identyfikacja pola i aparatu z MODELU — rekordy `bays` (karta W5-B: jedyny
  // nośnik pól SN, nN i ZKSN; kolejność zapisu). Pole trafione:
  // panel elementu pola → identyfikator pola; aparat → pole, którego `primary_devices` albo
  // `equipment_refs` zawiera identyfikator, albo samo pole, gdy kanwa niesie identyfikator pola
  // (symbol aparatu z konwencji dla pola bez aparatów pierwotnych w modelu — zrzut e2e #135).
  const polaModelu = pola(snapshot);
  const poleTrafione =
    rodzaj === 'bay'
      ? polaModelu.find((b) => b.ref_id === id) ?? null
      : rodzaj === 'apparatus'
        ? polaModelu.find(
            (b) =>
              b.ref_id === id ||
              (b.primary_devices ?? []).some((d) => d.device_ref === id) ||
              b.equipment_refs.includes(id),
          ) ?? null
        : null;
  // Stan aparatu (karta #135 × GPZ-PARYTET cz. 2). Położenie łącznika: TEN SAM rachunek co
  // glif kanwy (`stanLacznikaPolaZModelu` — `status` gałęzi łączeniowej rozstrzygnięty
  // rekordami aparatów pola), więc inspektor i rysunek nie mogą się rozjechać. Tryb
  // sterowania, komunikacja, uzależnienie i chwila zmiany: WYŁĄCZNIE rekord źródła runtime
  // (`rekordStanuAparatu`; `null` = brak telemetrii, nigdy wartość domyślna). Brak obu ⇒ `null`.
  const galezieWgRef = new Map((snapshot?.branches ?? []).map((b) => [b.ref_id, b]));
  let apparatusState: DaneElementuKanwy['apparatusState'] = null;
  if (rodzaj === 'apparatus' && snapshot) {
    // Ref aparatu albo gałęzi pola → stan TEGO łącznika. Ref samego pola (sylwetka „brak
    // danych wyposażenia pola", GEOMETRIA-STACJI §0 pkt 4) → brak położenia: glif nie ma
    // koloru stanu, więc i inspektor nie przypisuje mu agregatu pola (do karty symbol stosu
    // z konwencji brał agregat roli — rysunek i inspektor pokazywały stan aparatu, którego
    // model nie zawiera). Łącznik TORU ciągu (gałąź poza polem stacji) → `status` gałęzi.
    const polozenie = !poleTrafione
      ? stanLacznikaToruZModelu(id, galezieWgRef)
      : poleTrafione.ref_id !== id
        ? stanLacznikaPolaZModelu(id, poleTrafione, galezieWgRef)
        : undefined;
    let rekord: BaySwitchState | null = null;
    for (const bay of snapshot.bays ?? []) {
      rekord = rekordStanuAparatu(bay, id);
      if (rekord) break;
    }
    if (polozenie !== undefined || rekord) {
      apparatusState = {
        actualState: polozenie ?? null,
        controlMode: rekord?.control_mode ?? null,
        communicationOk: rekord?.communication_ok ?? null,
        interlockBlocked: rekord?.interlock_blocked ?? null,
        lastChangeAt: rekord?.last_state_change_at ?? null,
      };
    }
  }
  // Stacja pola z MODELU (`Bay.substation_ref` → stacja rysunku o tym samym identyfikatorze).
  // Dawniej dla pola/aparatu brano `sldData.stations[0]` — PIERWSZĄ stację rysunku, więc pole
  // w innej stacji dostawało cudzy kod stacji (fałszywa identyfikacja). Brak stacji = `null`.
  const stacjaPola = poleTrafione
    ? sldData.stations.find((st) => st.id === poleTrafione.substation_ref)
    : undefined;
  // K30-98: breadcrumb context dla bay/apparatus selections
  let parentStationLabel: string | null = null;
  let parentBayLabel: string | null = null;
  if (rodzaj === 'bay' || rodzaj === 'apparatus') {
    // Stacja rysunku (kod stacji SN/nN), a dla pola GPZ — którego blok nie jest stacją
    // rysunku SN/nN — nazwa rekordu stacji z MODELU (`Bay.substation_ref`). Brak = `null`.
    const stacjaModelu = poleTrafione?.substation_ref && snapshot
      ? findSubstationByRef(snapshot, poleTrafione.substation_ref)
      : null;
    parentStationLabel =
      stacjaPola?.stationCode ?? stacjaPola?.name ?? stacjaModelu?.name?.trim() ?? null;
    if (parentStationLabel === '') parentStationLabel = null;
  }
  if (rodzaj === 'apparatus' && poleTrafione) {
    // Nazwa pola z modelu; bez nazwy — uczciwy brak, nie surowy identyfikator pola.
    parentBayLabel = poleTrafione.name?.trim() || null;
  }

  // Recenzja NO-GO 2026-07-17 pkt 9 (spec §12.5): identyfikator GLOBALNY
  // ⟨stacja⟩.⟨pole⟩.⟨aparat⟩ (np. „S01.F01.Q2") — w INSPEKTORZE. Części: kod stacji
  // (stationCode), oznacznik pola = `Bay.bay_number` (dane) albo numeracja F⟨nn⟩ wg pozycji
  // pola w stacji (kolejność modelu wśród pól tej samej stacji), aparat = TEN SAM
  // identyfikator co na rysunku: sekwencja `projectBayPrimaryDevices` (kolejność
  // `placement`) → symbole `symbolIdForPrimaryDeviceKind` → `apparatusIdentifiers` z
  // oznaczeniami z danych. Brak którejkolwiek części ⇒ `null` (uczciwy brak); rodzaju
  // aparatu NIE zgaduje się z napisu identyfikatora (dawna heurystyka skasowana).
  let globalId: string | null = null;
  const kodStacji = stacjaPola?.stationCode ?? null;
  if (poleTrafione && kodStacji) {
    // Pozycja wśród pól TEJ SAMEJ stacji i TEGO SAMEGO poziomu (SN/nN — `czyPoleNn`): blok SN
    // stacji rysuje wyłącznie pola SN, więc numeracja F⟨nn⟩ pola SN liczy się wśród nich.
    const poziomNn = czyPoleNn(snapshot, poleTrafione);
    const polaPoziomu = (poziomNn ? polaNnStacji : polaSnStacji)(snapshot, poleTrafione.substation_ref);
    const pozycjaPola = polaPoziomu.findIndex((b) => b.ref_id === poleTrafione.ref_id);
    const fieldPart =
      (poleTrafione.bay_number ?? '').trim() ||
      (pozycjaPola >= 0 ? `F${String(pozycjaPola + 1).padStart(2, '0')}` : null);
    if (fieldPart) {
      if (rodzaj === 'bay') {
        globalId = `${kodStacji}.${fieldPart}`;
      } else {
        const sekwencja = (projectBayPrimaryDevices(poleTrafione, galezieWgRef) ?? [])
          .map((d) => ({ ref: d.deviceRef, symbol: symbolIdForPrimaryDeviceKind(d.kind), oznaczenie: d.designation }))
          .filter((d): d is { ref: string; symbol: NonNullable<typeof d.symbol>; oznaczenie: string | undefined } => d.symbol != null);
        const identyfikatory = apparatusIdentifiers(
          sekwencja.map((d) => d.symbol),
          sekwencja.map((d) => d.oznaczenie),
        );
        const pozycjaAparatu = sekwencja.findIndex((d) => d.ref === id);
        const apparatusPart = pozycjaAparatu >= 0 ? identyfikatory[pozycjaAparatu] : null;
        globalId = apparatusPart ? `${kodStacji}.${fieldPart}.${apparatusPart}` : null;
      }
    }
  }
  return rodzaj === 'station' && daneStacjiBudowniczego
    ? daneStacjiBudowniczego
    : {
        kind: rodzaj,
        elementId: id,
        label: transformerLabelOverride
          ?? (rodzaj === 'station'
            ? stacjaSld?.name ?? stacjaSld?.stationCode
            : stacjaSld?.stationCode ?? stacjaSld?.name)
          ?? internalElementDescription?.name
          ?? nazwaElementuZModelu(snapshot, id)
          ?? id.split('/').pop()
          ?? id,
        stationCode: stationContext?.stationCode ?? null,
        liveMetrics: buildLiveMetrics(overlayPayload, rodzaj, id),
        apparatusState,
        parentStationLabel,
        parentBayLabel,
        globalId,
      };
}

/**
 * Dyspozytor kategorii budowniczego (spec §10.1 ARCH-4): odcinek SN → `buildDaneCiaguSn`,
 * węzeł SN → `buildDaneWezlaSn`, reszta → `buildDaneElementuStacji`. Szkic DER ma osobne
 * wejście (`buildDaneSzkicuDer`, stan szkicu z palety). `null`, gdy żadna gałąź nie zna
 * kategorii (np. `section`/`background`) — uczciwy brak danych, bez zgadywania.
 */
export function buildDaneElementuDlaRodzaju(
  kind: string,
  id: string,
  deps: {
    readonly snapshot: EnergyNetworkModel | null;
    readonly sldData: SldDataPayload;
    readonly overlayPayload: RawOverlayPayload | null;
  },
): DaneElementuKanwy | null {
  if (kind === 'cable_run' || kind === 'cable_segment_sn' || kind === 'overhead_line_sn') {
    return buildDaneCiaguSn(deps.snapshot, deps.sldData, deps.overlayPayload, id);
  }
  if (kind === 'zksn' || kind === 'branch_pole') {
    return buildDaneWezlaSn(deps.snapshot, deps.overlayPayload, kind, id);
  }
  return buildDaneElementuStacji(deps.snapshot, deps.sldData, deps.overlayPayload, kind, id);
}

// ---------------------------------------------------------------------------
// UI-02b JEDEN-INSPEKTOR: rozstrzygnięcie danych obiektu klikniętego na kanwie v3
// (`elementKind` sceny + ref właściciela + opcjonalny ref urządzenia).
// ---------------------------------------------------------------------------

/**
 * `elementKind` v3 → `kind` budowniczego `buildDaneElementuDlaRodzaju`. JAWNA,
 * zamknięta tabela; `undefined` = brak danych panelu dla tego rodzaju (bez zgadywania).
 *  - 'station' → 'station';
 *  - 'segment' → 'cable_segment_sn' (dane ciągu SN, `buildDaneCiaguSn`);
 *  - 'transformer'/'apparatus'/'branchPoint' → DEDYKOWANE ścieżki w
 *    `buildDaneElementuKanwy` (ref właściciela symbolu to ref POLA albo punktu
 *    odgałęźnego, nie urządzenia);
 *  - 'der'/'source'/'bus' → DEDYKOWANA ścieżka `buildDaneObiektuModelu` (K6: źródło OZE,
 *    sieć zasilająca i szyna mają kartę techniczną; dawne 'source' → 'gpz' dawało rodzaj
 *    „station" z refem źródła, a 'bus'/'der' — brak danych panelu). Formularz DER dotyczy
 *    wyłącznie szkicu po upuszczeniu z palety (`buildDaneSzkicuDer`).
 */
export function elementKindDlaPanelu(kind: PreviewElementKind | undefined): string | undefined {
  switch (kind) {
    case 'station':
      return 'station';
    case 'segment':
      return 'cable_segment_sn';
    default:
      return undefined;
  }
}

/**
 * K6: dane panelu dla obiektu modelu spoza stacji — źródła OZE (`generators`), sieci zasilającej
 * (`sources`) i szyny (`buses`). Rekord nieznany w modelu ⇒ `null` (uczciwy brak).
 */
export function buildDaneObiektuModelu(
  snapshot: EnergyNetworkModel | null,
  overlayPayload: RawOverlayPayload | null,
  rodzaj: 'generator' | 'grid_source' | 'bus',
  id: string,
): DaneElementuKanwy | null {
  const kolekcja = rodzaj === 'generator'
    ? snapshot?.generators
    : rodzaj === 'grid_source'
      ? snapshot?.sources
      : snapshot?.buses;
  const element = (kolekcja ?? []).find((item) => item.ref_id === id || item.id === id);
  if (!element) return null;
  const domyslna = rodzaj === 'generator' ? 'Źródło OZE' : rodzaj === 'grid_source' ? 'Sieć zasilająca' : 'Szyna';
  return {
    kind: rodzaj,
    elementId: element.ref_id,
    label: publicTechnicalLabel(element.name, domyslna),
    liveMetrics: buildLiveMetrics(overlayPayload, rodzaj, element.ref_id),
  };
}

/** Stacja-właścicielka pola z rekordu `bays` (`stacjaPola`, jedna reguła także dla GPZ). */
export function stationRefForBayOwner(snapshot: EnergyNetworkModel | null, bayRef: string): string | null {
  return snapshot ? stacjaPola(snapshot, bayRef) : null;
}

/**
 * `ownerRef` symbolu transformatora → REALNY ref transformatora. GPZ niesie ref
 * transformatora wprost; stacja niesie ref POLA, więc pole → stacja (`stacjaPola`) →
 * pierwszy transformator dystrybucyjny stacji (`selectStationDistributionTransformers`,
 * ta sama funkcja co budowniczy stacji). `null` = żadna ścieżka nie rozwiązuje refu.
 */
export function resolveTransformerRefForOwnerRef(
  snapshot: EnergyNetworkModel | null,
  ownerRef: string,
): string | null {
  const directMatch = (snapshot?.transformers ?? []).find(
    (t) => t.ref_id === ownerRef || t.id === ownerRef,
  );
  if (directMatch) return directMatch.ref_id ?? directMatch.id ?? ownerRef;

  const stationRef = stationRefForBayOwner(snapshot, ownerRef);
  if (!stationRef) return null;
  const station = findSubstationByRef(snapshot, stationRef);
  const tr = selectStationDistributionTransformers(snapshot, station)[0];
  return tr?.ref_id ?? tr?.id ?? null;
}

/**
 * Dane panelu elementu dla obiektu kanwy v3 (`elementKind` sceny, ref właściciela,
 * opcjonalny ref urządzenia). `null` = brak danych panelu dla tego obiektu.
 *
 * `apparatus`: gdy klik niesie ref POJEDYNCZEGO urządzenia (`deviceRef`, ścieżka danych
 * sceny), budowniczy dostaje JEGO — dwa aparaty jednego pola nie dzielą jednej treści;
 * stacja-właścicielka liczy się z refu POLA (`id`), bo relacja jest zakotwiczona w polu.
 *
 * `branchPoint`: rodzaj węzła (ZK SN / słup rozgałęźny) z REKORDU modelu
 * (`branch_points[].branch_point_type`), nigdy z kształtu refu; punkt nieznany w modelu
 * ⇒ `null`.
 */
export function buildDaneElementuKanwy(
  snapshot: EnergyNetworkModel | null,
  sldData: SldDataPayload,
  overlayPayload: RawOverlayPayload | null,
  elementKind: PreviewElementKind | undefined,
  id: string,
  deviceRef: string | undefined,
): DaneElementuKanwy | null {
  if (elementKind === 'station') {
    return buildDaneStacji(snapshot, sldData, overlayPayload, id);
  }
  if (elementKind === 'transformer') {
    const transformerRef = resolveTransformerRefForOwnerRef(snapshot, id);
    if (!transformerRef) return null;
    return buildDaneElementuDlaRodzaju('transformer', transformerRef, { snapshot, sldData, overlayPayload });
  }
  if (elementKind === 'apparatus') {
    const apparatusRef = deviceRef ?? id;
    const dane = buildDaneElementuDlaRodzaju('apparatus', apparatusRef, {
      snapshot,
      sldData,
      overlayPayload,
    });
    if (!dane) return null;
    const stationRef = stationRefForBayOwner(snapshot, id);
    const stationCode = stationRef
      ? sldData.stations.find((s) => s.id === stationRef)?.stationCode ?? dane.stationCode
      : dane.stationCode;
    return { ...dane, stationCode };
  }
  if (elementKind === 'branchPoint') {
    const punkt = (snapshot?.branch_points ?? []).find((bp) => bp.ref_id === id || bp.id === id);
    if (!punkt) return null;
    return buildDaneWezlaSn(snapshot, overlayPayload, punkt.branch_point_type, id);
  }
  if (elementKind === 'der') return buildDaneObiektuModelu(snapshot, overlayPayload, 'generator', id);
  if (elementKind === 'source') return buildDaneObiektuModelu(snapshot, overlayPayload, 'grid_source', id);
  if (elementKind === 'bus') return buildDaneObiektuModelu(snapshot, overlayPayload, 'bus', id);
  const kind = elementKindDlaPanelu(elementKind);
  if (!kind) return null;
  return buildDaneElementuDlaRodzaju(kind, id, { snapshot, sldData, overlayPayload });
}
