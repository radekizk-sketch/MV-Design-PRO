/**
 * SLD-nN-TOPOLOGIA T0 (`docs/nn/PLAN_SLD_NN_TOPOLOGIA_2026-08.md` §0.2) —
 * fixture „Stacja B" (stacja przelotowa): K-in→F01→S01→F02→K-out;
 * S01→FT1→T1 630 kVA 15/0,4→LV terminal→QF-TR1→RGNN-1 0,4 kV→QF-01 MCB→
 * kabel→Odbiór-1; QF-02→kabel→RGN-2 (podrozdzielnica); QF-03→kabel→Odbiór-3.
 *
 * PROWENIENCJA (reużycie zamiast duplikacji, dyrektywa właściciela §0.7):
 * strona SN (GPZ→K-in→S01→K-out, transformator T1) jest skopiowana BEZ ZMIAN
 * z `sld/v3/scene/__tests__/fixtures/openBranch.enm.json` — fixture
 * DOSŁOWNIE nazywa swoją stację "Stacja B" i ma już dokładnie kształt
 * przelotowej stacji SN/nN z kartą P0.8 (pola LINIA_IN/LINIA_OUT/
 * TRANSFORMATOROWE, transformator 630 kVA 15/0,4 kV Dyn11) — dowód, że ta
 * strona modelu jest REALNYM kształtem ENM, przechodzącym już dziś przez
 * pełny potok `buildSceneV3` (patrz `scene/__tests__/buildScene.lvPortal.test.ts`
 * — ten plik stosuje wzorzec rozszerzenia wg dyspozycji §0.2 „skopiuj wzorce
 * z istniejących fixtures").
 *
 * Strona nN jest DOPISANA tutaj, deterministycznie, w kształcie zgodnym z
 * `types/enm.ts` (`Bus`/`SwitchBranch`/`Cable`/`Load`/`Substation`) i z
 * konwencją katalogu nN (`APARAT_NN_MCB` + `materialized_params.device_kind`/
 * `curve_class`/`in_a`) rozpoznawaną przez graf elektryczny
 * (`electrical/terminalGraph.ts`). LV DOMAIN PROJECTION (po B-02): wnętrze nN
 * tej fixtury NIE jest rysowane w projekcji SN (portal na zacisku nN) —
 * fixtura służy wyroczniom grafu elektrycznego CAŁEJ sieci SN–TR–nN
 * (`pathInvariants`, `sceneConformance`, `sceneCompositionT1`) i dowodowi, że
 * scena SN nie przecieka wnętrzem nN.
 *
 * Rozstrzygnięcie topologiczne (LV terminal ODRĘBNY od RGNN-1): zamiast
 * pozostawić `Transformer.lv_bus_ref` wskazujący WPROST na szynę odpływową
 * (jak w bazowej fixturze), T1 dostaje WŁASNĄ szynę „zacisk nN" (LV
 * terminal), a RGNN-1 jest ODDZIELNĄ szyną połączoną przez QF-TR1 (wyłącznik
 * główny nN) — DOKŁADNIE łańcuch z dyspozycji karty. Stacja BEZPIECZNIE
 * pozostaje z jedną szyną nN w `station.bus_refs` (RGNN-1/`nn_bus`, ref
 * NIETKNIĘTY z bazowej fixtury) — `nn_lv_terminal` nowa szyna NIE wchodzi do
 * `bus_refs` stacji, więc dobór szyny nN stacji (`nnBusPick`,
 * `enmToSldAdapter.ts`) pozostaje jednoznaczny (bez czego wpadłby w remis
 * dwóch szyn 0,4 kV i sekcje nN zniknęłyby z renderu — zmierzone przy
 * budowie tej fixtury).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Bus, EnergyNetworkModel, Load, Substation, SwitchBranch } from '../../../../../../types/enm';

const here = dirname(fileURLToPath(import.meta.url));

const BASE_FIXTURE_PATH = resolve(
  here,
  '../../../scene/__tests__/fixtures/openBranch.enm.json',
);

const STATION_ID = 'stn/ed91b18ec60d43a0fb4cb92e778fa53e';
const TRANSFORMER_REF = `${STATION_ID}/transformer`;

/** Referencje publiczne (używane przez `pathInvariants.test.ts` i
 *  `sceneConformance.test.ts` — JEDNO źródło refów, zero zgadywania stringów
 *  po obu stronach). */
export const STACJA_B_REFS = {
  stationRef: `${STATION_ID}/station`,
  snBusRef: `${STATION_ID}/sn_bus`,
  /** Wyłącznik pola TRANSFORMATOROWE (FT1, `catalog_namespace='APARAT_SN'`) —
   *  z bazowej fixtury `openBranch.enm.json`, ref NIETKNIĘTY. */
  snFieldBreakerTrRef: `${STATION_ID}/sn_field_breaker/002`,
  transformerRef: TRANSFORMER_REF,
  lvTerminalBusRef: `${STATION_ID}/nn_lv_terminal`,
  rgnn1BusRef: `${STATION_ID}/nn_bus`,
  qfTr1Ref: `${STATION_ID}/nn_qf_tr1`,
  qf01Ref: `${STATION_ID}/nn_qf01`,
  odbior1BusRef: `${STATION_ID}/nn_odbior1_bus`,
  odbior1LoadRef: `load/${STATION_ID}/odbior1`,
  qf02Ref: `${STATION_ID}/nn_qf02`,
  rgn2BusRef: `${STATION_ID}/nn_rgn2_bus`,
  rgn2StationRef: 'stn/rgn2/station',
  qf03Ref: `${STATION_ID}/nn_qf03`,
  odbior3BusRef: `${STATION_ID}/nn_odbior3_bus`,
  odbior3LoadRef: `load/${STATION_ID}/odbior3`,
  cableQf01Ref: `${STATION_ID}/nn_qf01_cable`,
  cableQf02Ref: `${STATION_ID}/nn_qf02_cable`,
  cableQf03Ref: `${STATION_ID}/nn_qf03_cable`,
  gpzSourceRef: 'gpz/860003b4514aa388b39561d5005ce584/source/main',
} as const;

function loadBaseFixture(): EnergyNetworkModel {
  const raw = JSON.parse(readFileSync(BASE_FIXTURE_PATH, 'utf8')) as { readonly enm: EnergyNetworkModel };
  // Klon głęboki — WYŁĄCZNIE ten builder mutuje kopię, plik źródłowy
  // `openBranch.enm.json` (współdzielony z `scene/__tests__`) pozostaje
  // NIETKNIĘTY (tylko odczyt, zero zmian w cudzych fixture'ach).
  return JSON.parse(JSON.stringify(raw.enm)) as EnergyNetworkModel;
}

function withId(ref: string, rest: Record<string, unknown>): Record<string, unknown> {
  return { id: ref, ref_id: ref, tags: [], meta: {}, ...rest };
}

function nnBus(ref: string, name: string): Bus {
  return withId(ref, { name, voltage_kv: 0.4, phase_system: '3ph' }) as unknown as Bus;
}

function nnMcb(
  ref: string,
  name: string,
  fromBusRef: string,
  toBusRef: string,
  materialized: Record<string, unknown>,
): SwitchBranch {
  return withId(ref, {
    name,
    type: 'switch',
    from_bus_ref: fromBusRef,
    to_bus_ref: toBusRef,
    status: 'closed',
    catalog_namespace: 'APARAT_NN_MCB',
    materialized_params: materialized,
  }) as unknown as SwitchBranch;
}

function nnCable(ref: string, name: string, fromBusRef: string, toBusRef: string): Record<string, unknown> {
  return withId(ref, {
    name,
    type: 'cable',
    from_bus_ref: fromBusRef,
    to_bus_ref: toBusRef,
    status: 'closed',
    length_km: 0.03,
    r_ohm_per_km: 0.32,
    x_ohm_per_km: 0.08,
  });
}

function nnLoad(ref: string, name: string, busRef: string, pMw: number): Load {
  return withId(ref, { name, bus_ref: busRef, p_mw: pMw, q_mvar: pMw * 0.15, model: 'pq' }) as unknown as Load;
}

/**
 * Zbuduj fixture „Stacja B" wg dyspozycji karty T0. Deterministyczna (brak
 * `Date.now()`/`Math.random()`) — dwa wywołania dają bajt-identyczny wynik
 * (dowód: `determinizm sha256` w `pathInvariants.test.ts`).
 */
export function buildStacjaBFixture(): EnergyNetworkModel {
  const enm = loadBaseFixture();
  const refs = STACJA_B_REFS;

  const buses = [...(enm.buses ?? [])] as Bus[];
  const branches = [...(enm.branches ?? [])];
  const loads: Load[] = [];
  const substations = [...(enm.substations ?? [])] as Substation[];

  // T1 dostaje WŁASNĄ szynę „zacisk nN" (LV terminal) — ODDZIELNĄ od RGNN-1.
  buses.push(nnBus(refs.lvTerminalBusRef, 'T1 zacisk nN (strona dolna)'));

  // Istniejąca szyna `nn_bus` bazowej fixtury STAJE SIĘ RGNN-1 (ref
  // NIETKNIĘTY — tylko etykieta zmieniona na inżyniersko czytelną).
  const rgnn1 = buses.find((b) => b.ref_id === refs.rgnn1BusRef);
  if (!rgnn1) throw new Error('fixtura bazowa bez szyny nn_bus');
  (rgnn1 as { name: string }).name = 'RGNN-1 (rozdzielnica nN 0,4 kV)';

  // Transformator T1: LV terminal ODDZIELNY od RGNN-1 (dyspozycja karty).
  const transformers = [...(enm.transformers ?? [])];
  const t1Index = transformers.findIndex((t) => t.ref_id === refs.transformerRef);
  if (t1Index === -1) throw new Error('fixtura bazowa bez transformatora stacji');
  transformers[t1Index] = { ...transformers[t1Index], lv_bus_ref: refs.lvTerminalBusRef };

  // QF-TR1: wyłącznik główny nN — LV terminal → RGNN-1.
  branches.push(
    nnMcb(refs.qfTr1Ref, 'QF-TR1 (wyłącznik główny nN)', refs.lvTerminalBusRef, refs.rgnn1BusRef, {
      device_kind: 'WYLACZNIK_GLOWNY',
      in_a: 1000,
    }),
  );

  // QF-01 MCB → kabel → Odbiór-1.
  buses.push(nnBus(refs.odbior1BusRef, 'Zacisk Odbiór-1'));
  branches.push(
    nnMcb(refs.qf01Ref, 'QF-01', refs.rgnn1BusRef, refs.odbior1BusRef, { device_kind: 'WYLACZNIK_ODPLYWOWY', curve_class: 'B', in_a: 25 }),
  );
  loads.push(nnLoad(refs.odbior1LoadRef, 'Odbiór-1', refs.odbior1BusRef, 0.012));

  // QF-02 → kabel → RGN-2 (podrozdzielnica nN).
  buses.push(nnBus(refs.rgn2BusRef, 'Szyna RGN-2'));
  branches.push(
    nnMcb(refs.qf02Ref, 'QF-02', refs.rgnn1BusRef, refs.rgn2BusRef, { device_kind: 'WYLACZNIK_ODPLYWOWY', curve_class: 'C', in_a: 40 }),
  );
  substations.push(
    withId(refs.rgn2StationRef, {
      name: 'RGN-2 (podrozdzielnica)',
      station_type: 'rozdzielnica_nn',
      bus_refs: [refs.rgn2BusRef],
      transformer_refs: [],
    }) as unknown as Substation,
  );

  // QF-03 → kabel → Odbiór-3.
  buses.push(nnBus(refs.odbior3BusRef, 'Zacisk Odbiór-3'));
  branches.push(
    nnMcb(refs.qf03Ref, 'QF-03', refs.rgnn1BusRef, refs.odbior3BusRef, { device_kind: 'WYLACZNIK_ODPLYWOWY', curve_class: 'B', in_a: 16 }),
  );
  loads.push(nnLoad(refs.odbior3LoadRef, 'Odbiór-3', refs.odbior3BusRef, 0.009));

  // Kable QF-01/02/03 → cel (dowód „chodzenia po torze", wzorzec
  // `enmToSldAdapter.nnBoard.test.ts` „łańcuch kabli"): aparat → kabel →
  // odbiorca — bez pośredniego kabla odbiorca siedziałby WPROST za MCB, co
  // jest topologicznie poprawne, ale test P0.12 wymaga jawnego „kabel" w
  // torze każdego odpływu (dyspozycja: „QF-01 MCB→kabel→Odbiór-1"). Kabel
  // wstawiony MIĘDZY aparat a odbiorcę (własna szyna pośrednia), aparat
  // MCB→szyna pośrednia→kabel→szyna odbiorcy.
  const qf01OutBusRef = `${STATION_ID}/nn_qf01_out`;
  const qf02OutBusRef = `${STATION_ID}/nn_qf02_out`;
  const qf03OutBusRef = `${STATION_ID}/nn_qf03_out`;
  buses.push(nnBus(qf01OutBusRef, 'QF-01 zacisk wyjściowy'));
  buses.push(nnBus(qf02OutBusRef, 'QF-02 zacisk wyjściowy'));
  buses.push(nnBus(qf03OutBusRef, 'QF-03 zacisk wyjściowy'));

  // Przepinamy MCB tak, żeby kończyły się na szynie pośredniej, a kabel
  // dokańczał tor do odbiorcy/RGN-2 — jeden spójny wzorzec dla WSZYSTKICH
  // trzech odpływów.
  const rewireToIntermediate = (branchRef: string, intermediateBusRef: string): void => {
    const idx = branches.findIndex((b) => (b as { ref_id: string }).ref_id === branchRef);
    if (idx === -1) throw new Error(`brak gałęzi ${branchRef} do przepięcia`);
    (branches[idx] as { to_bus_ref: string }).to_bus_ref = intermediateBusRef;
  };
  rewireToIntermediate(refs.qf01Ref, qf01OutBusRef);
  rewireToIntermediate(refs.qf02Ref, qf02OutBusRef);
  rewireToIntermediate(refs.qf03Ref, qf03OutBusRef);

  branches.push(nnCable(refs.cableQf01Ref, 'Kabel odpływu QF-01', qf01OutBusRef, refs.odbior1BusRef));
  branches.push(nnCable(refs.cableQf02Ref, 'Kabel odpływu QF-02', qf02OutBusRef, refs.rgn2BusRef));
  branches.push(nnCable(refs.cableQf03Ref, 'Kabel odpływu QF-03', qf03OutBusRef, refs.odbior3BusRef));

  return {
    ...enm,
    buses,
    branches: branches as EnergyNetworkModel['branches'],
    transformers: transformers as EnergyNetworkModel['transformers'],
    loads,
    substations,
  };
}
