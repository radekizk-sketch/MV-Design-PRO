/**
 * W2c — FIXTURY TORU DER PRZYŁĄCZONEGO PO STRONIE SN (POLECENIE_DER_SN_TOPOLOGIA_
 * 2026-07, reguły 1–7). Podejście (jak W1, karta „rozszerz sieć referencyjną
 * testową"): klonujemy realną, placeable sieć referencyjną `sldSubstrate52s`
 * i WSTRZYKUJEMY kompletny tor DER-SN na WYBRANĄ, istniejącą stację (z REALNĄ
 * szyną SN i TR odbiorczym stacji — przypadek 8 kanonu z definicji). Tor
 * odwzorowuje DOKŁADNE kształty snapshotu z backendu
 * `tests/enm/test_der_sn_topology_domain_ops.py` (TR blokowy jako OSOBNY
 * `Transformer` z rolą `TRANSFORMATOR_BLOKOWY_DER`, szyna nN producenta
 * `meta.der_role==='producer_lv_bus'`, szyna SN TR blokowego
 * `der_role==='block_hv_bus'`, kabel SN typu `cable`, pole źródłowe SN
 * `bay_role==='OZE'` z `primary_devices` [DS,CB,CT,VT,DS,ES,SURGE_ARRESTER,
 * CABLE_HEAD], generator na szynie nN producenta z `connection_variant=
 * 'block_transformer'` + `blocking_transformer_ref` + `meta.der_mv_field_ref`).
 * Frontend NIE woła backendu — fixtura jest niezależnym lustrem kontraktu.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BayPrimaryDevice, EnergyNetworkModel } from '../../../../../types/enm';

const HERE = dirname(fileURLToPath(import.meta.url));
// Baza: MAŁA, renderowalna sieć (GPZ + 2 stacje inline z TR odbiorczym, BEZ
// nN DER) — najbliższa kanonicznemu `_sn_station_enm` backendu (stacja SN z
// TR odbiorczym = przypadek 8 z definicji), bez atypowego rzędu nN DER, który
// występuje tylko w dużej sieci referencyjnej. Tor DER-SN wstrzykiwany na
// pierwszą stację inline.
const BASE_FIXTURE = resolve(HERE, 'gpzFeeder.enm.json');

function loadBase(): EnergyNetworkModel {
  const parsed = JSON.parse(readFileSync(BASE_FIXTURE, 'utf8')) as { readonly enm?: EnergyNetworkModel };
  return parsed.enm ?? (parsed as unknown as EnergyNetworkModel);
}

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T;

/** Aparat pierwotny pola źródłowego SN (lustro `_build_field_spec` backendu). */
function device(
  ref: string,
  kind: BayPrimaryDevice['kind'],
  placement: BayPrimaryDevice['placement'],
  extra: Partial<BayPrimaryDevice> = {},
): BayPrimaryDevice {
  return {
    device_ref: ref,
    symbol_ref: `symbol:${kind.toLowerCase()}`,
    kind,
    placement,
    is_controllable: kind === 'CB' || kind === 'DS',
    render_variant: 'kanoniczny',
    ...extra,
  };
}

/** Stos pola źródłowego SN — DOKŁADNA sekwencja z backendu (przypadek 2):
 *  [DS, CB, CT, VT, DS, ES, SURGE_ARRESTER, CABLE_HEAD]. VT/ES/SA = aparaty
 *  BOCZNE (OFF_PATH/GROUND_BRANCH); głowica ZAWSZE na styku kabla (DOWNSTREAM).
 *  `withVt`/`withSa` = false ⇒ realne USUNIĘCIE aparatu (zero fabrykacji —
 *  odwzorowanie `test_case2_mv_field_config_is_load_bearing_no_phantom`). */
function ozePrimaryDevices(prefix: string, withVt = true, withSa = true): BayPrimaryDevice[] {
  const out: BayPrimaryDevice[] = [
    device(`${prefix}/ds1`, 'DS', 'UPSTREAM', { designation: 'Q1' }),
    device(`${prefix}/cb`, 'CB', 'MIDSTREAM', { designation: 'Q0' }),
    device(`${prefix}/ct`, 'CT', 'MIDSTREAM'),
  ];
  if (withVt) out.push(device(`${prefix}/vt`, 'VT', 'OFF_PATH'));
  out.push(device(`${prefix}/ds2`, 'DS', 'MIDSTREAM', { designation: 'Q9' }));
  out.push(device(`${prefix}/es`, 'ES', 'GROUND_BRANCH', { earthing_role: 'field_earth', designation: 'QE1' }));
  if (withSa) out.push(device(`${prefix}/sa`, 'SURGE_ARRESTER', 'GROUND_BRANCH', { earthing_role: 'surge_ground' }));
  out.push(device(`${prefix}/head`, 'CABLE_HEAD', 'DOWNSTREAM'));
  return out;
}

export interface DerSnInjectOptions {
  /** Technologia źródła (mapuje na `gen_type`/symbol DER). */
  readonly technology?: 'PV' | 'BESS' | 'FW';
  /** Wariant rozdzielni nN producenta (`Bus.meta.lv_switchgear_variant`). */
  readonly lvSwitchgearVariant?: 'single-bus' | 'multi-feeder' | 'combiner' | 'integrated-skid';
  /** Liczba jednostek (`n_parallel`) — >1 ⇒ krotność w etykiecie (decyzja W2c). */
  readonly quantity?: number;
  /** VT/SA obecne w polu źródłowym SN (load-bearing, nie phantom). */
  readonly withVt?: boolean;
  readonly withSa?: boolean;
  /** Sufiks id — do wstrzyknięcia WIELU DER na TĘ SAMĄ szynę SN (przypadek 7). */
  readonly suffix?: string;
  /** W2c przypadek 4 / §0: DER na SN BEZ zmaterializowanego TR blokowego
   *  (generator synchroniczny WPROST na SN / stare dane) ⇒ adapter NIE
   *  zbuduje toru ⇒ uczciwa degradacja + stopNote `der.sn.torNiepelny`. */
  readonly withoutBlockTransformer?: boolean;
}

const GEN_TYPE: Record<NonNullable<DerSnInjectOptions['technology']>, string> = {
  PV: 'pv_inverter',
  BESS: 'bess',
  FW: 'wind_inverter',
};

/** Zwraca ref pierwszej NIE-GPZ stacji fixtury (deterministyczny wybór). */
export function firstInjectableStationRef(enm: EnergyNetworkModel): string {
  const st = (enm.substations ?? []).find((s) => s.station_type !== 'gpz');
  if (!st) throw new Error('w2cDerSnFixtures: brak nie-GPZ stacji w fixturze referencyjnej');
  return st.ref_id;
}

/** Szyna SN stacji (`.../sn_bus`) — punkt przyłączenia pola źródłowego SN. */
function stationSnBus(enm: EnergyNetworkModel, stationRef: string): string {
  const st = (enm.substations ?? []).find((s) => s.ref_id === stationRef);
  const sn = (st?.bus_refs ?? []).find((b) => b.endsWith('/sn_bus'));
  if (!sn) throw new Error(`w2cDerSnFixtures: stacja ${stationRef} bez szyny SN`);
  return sn;
}

/** Ref TR odbiorczego stacji (`.../transformer`) — dowód „TR blokowy ≠ TR
 *  stacji" (reguła 5, przypadek 8). `null` gdy stacja bez TR. */
export function stationTransformerRef(enm: EnergyNetworkModel, stationRef: string): string | null {
  const base = stationRef.replace(/\/station$/, '');
  const tr = (enm.transformers ?? []).find((t) => t.ref_id === `${base}/transformer`);
  return tr?.ref_id ?? null;
}

export interface InjectedDer {
  readonly stationRef: string;
  readonly snBusRef: string;
  readonly ozeFieldRef: string;
  readonly blockTransformerRef: string | null;
  readonly producerLvBusRef: string;
  readonly cableRef: string;
  readonly sourceId: string;
}

/**
 * Wstrzykuje kompletny tor DER-SN na `stationRef` (MUTUJE `enm`). Zwraca ref-y
 * elementów toru do asercji. Determinizm: id wyprowadzone z `stationRef` +
 * `suffix` (bez losowości).
 */
export function injectDerSnChain(
  enm: EnergyNetworkModel,
  stationRef: string,
  opts: DerSnInjectOptions = {},
): InjectedDer {
  const tech = opts.technology ?? 'PV';
  const suffix = opts.suffix ?? '';
  const base = stationRef.replace(/\/station$/, '');
  const nsp = `${base}/der${suffix}`;
  const snBusRef = stationSnBus(enm, stationRef);

  const producerLvBusRef = `${nsp}/producer_lv_bus`;
  const blockHvBusRef = `${nsp}/block_hv_bus`;
  const blockTrRef = `${nsp}/block_transformer`;
  const cableRef = `${nsp}/mv_cable`;
  const ozeFieldRef = `${nsp}/field`;
  const sourceId = `${nsp}/converter`;

  const buses = (enm.buses ??= []);
  buses.push({
    id: producerLvBusRef,
    ref_id: producerLvBusRef,
    name: 'Szyna nN producenta',
    voltage_kv: 0.4,
    tags: [],
    meta: {
      der_role: 'producer_lv_bus',
      has_manufacturer_lv_switchgear: true,
      lv_switchgear_variant: opts.lvSwitchgearVariant ?? 'multi-feeder',
    },
  } as unknown as EnergyNetworkModel['buses'][number]);

  if (!opts.withoutBlockTransformer) {
    buses.push({
      id: blockHvBusRef,
      ref_id: blockHvBusRef,
      name: 'Szyna SN TR blokowego',
      voltage_kv: 15.0,
      tags: [],
      meta: { der_role: 'block_hv_bus' },
    } as unknown as EnergyNetworkModel['buses'][number]);

    (enm.transformers ??= []).push({
      id: blockTrRef,
      ref_id: blockTrRef,
      name: 'TR blokowy DER',
      hv_bus_ref: blockHvBusRef,
      lv_bus_ref: producerLvBusRef,
      sn_mva: 1.0,
      uhv_kv: 15.0,
      ulv_kv: 0.4,
      uk_percent: 6.0,
      pk_kw: 8.0,
      vector_group: 'Dyn11',
      tags: [],
      meta: { catalog_role: 'TRANSFORMATOR_BLOKOWY_DER' },
    } as unknown as EnergyNetworkModel['transformers'][number]);

    // Kabel SN toru DER — REALNY `Branch` (jak backend W2b), oznaczony
    // `meta.der_role='mv_cable'` żeby projekcja topologii SLD go POMINĘŁA
    // (tor DER rysuje `compose/station.ts` pod polem źródłowym, NIE jako
    // odcinek magistrali — inaczej kabel od szyny nN-producenta zaśmieciłby
    // ciąg liniowy). Adapter `buildDerSnChain` znajduje go po `from_bus_ref`.
    (enm.branches ??= []).push({
      id: cableRef,
      ref_id: cableRef,
      name: 'Kabel SN DER',
      type: 'cable',
      from_bus_ref: blockHvBusRef,
      to_bus_ref: snBusRef,
      length_km: 0.05,
      tags: [],
      meta: { der_role: 'mv_cable' },
    } as unknown as EnergyNetworkModel['branches'][number]);
  }

  // Pole źródłowe SN (bay_role OZE) — DOPISANE do istniejących field_specs
  // stacji (append, nie replace: stacja zachowuje pola liniowe + TR).
  const st = (enm.substations ?? []).find((s) => s.ref_id === stationRef)!;
  const meta = (st.meta ??= {}) as Record<string, unknown>;
  const fieldSpecs = (Array.isArray(meta.field_specs) ? meta.field_specs : []) as unknown[];
  fieldSpecs.push({
    field_ref: ozeFieldRef,
    name: `Pole źródłowe ${tech}`,
    bay_role: 'OZE',
    bus_ref: snBusRef,
    equipment_refs: [`${ozeFieldRef}/cb`],
    protection_ref: null,
    tags: [],
    meta: {},
    primary_devices: ozePrimaryDevices(ozeFieldRef, opts.withVt ?? true, opts.withSa ?? true),
    protection_codes: ['anti-islanding'],
  });
  meta.field_specs = fieldSpecs;

  (enm.generators ??= []).push({
    id: sourceId,
    ref_id: sourceId,
    name: `Blok ${tech}`,
    bus_ref: producerLvBusRef,
    p_mw: 1.0,
    gen_type: GEN_TYPE[tech] as EnergyNetworkModel['generators'][number]['gen_type'],
    station_ref: stationRef,
    quantity: opts.quantity ?? 1,
    n_parallel: opts.quantity ?? 1,
    connection_variant: 'block_transformer',
    blocking_transformer_ref: opts.withoutBlockTransformer ? null : blockTrRef,
    catalog_ref: `conv-${tech.toLowerCase()}-04kv`,
    tags: [],
    meta: { der_mv_field_ref: ozeFieldRef },
  } as unknown as EnergyNetworkModel['generators'][number]);

  return {
    stationRef,
    snBusRef,
    ozeFieldRef,
    blockTransformerRef: opts.withoutBlockTransformer ? null : blockTrRef,
    producerLvBusRef,
    cableRef,
    sourceId,
  };
}

/** Buduje fixturę: klon sieci referencyjnej + wstrzyknięty(e) tor(y) DER-SN. */
export function buildDerSnFixture(
  injections: readonly DerSnInjectOptions[],
): { readonly enm: EnergyNetworkModel; readonly stationRef: string; readonly injected: readonly InjectedDer[] } {
  const enm = clone(loadBase());
  const stationRef = firstInjectableStationRef(enm);
  const injected = injections.map((opts) => injectDerSnChain(enm, stationRef, opts));
  return { enm, stationRef, injected };
}
