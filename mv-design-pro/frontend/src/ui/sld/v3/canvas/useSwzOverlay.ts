/**
 * T2-WYNIKI (PLAN_SLD_NN_TOPOLOGIA_2026-08 §T2, §0 pkt 2 „odznaka SWZ na
 * kanwie" + pkt 1 „panel wyników odpływu nN") — hook orkiestrujący pobranie
 * werdyktu SWZ dla WSZYSTKICH odpływów nN modelu, JEDEN raz, WSPÓLNY dla:
 *  (a) odznaki SWZ przy aparacie na kanwie (`SldCanvasV3.tsx`,
 *      `overlay.swzByOwnerRef` — kontrakt P0.8, dotąd niepodłączony),
 *  (b) sekcji Ik1_min/SWZ panelu wyników odpływu nN klikniętego aparatu
 *      (`nnCircuitResults.ts::buildNnCircuitResultsSections`).
 * JEDEN fetch, DWIE prezentacje tej samej odpowiedzi backendu (werdykt
 * karty §0: „ONE SOURCE OF TRUTH").
 *
 * SEKWENCJA per stacja: `GET /enm/fault-loop-feeders?station_ref=` (odpływy
 * rozpoznane dla stacji + punkt NAJGORSZY per odpływ) → `GET /enm/swz` per
 * odpływ (`breaker_ref=feeder_root_branch_ref`, `bus_ref=worst_point_bus_ref`).
 * Stacja bez odpływów nN (SN-only, `feeders: []`, status≠'OK') pomijana
 * bez błędu — zero fabrykacji, uczciwy brak dla stacji bez rozdzielnicy nN.
 *
 * WYZWALACZ: zmiana `snapshot` (Case Immutability Rule — model inny, refy
 * inne) lub `caseId`. `AbortController` przerywa loty w locie przy re-fetch/
 * odmontowaniu — brak wyścigu, brak setState po unmount.
 */
import { useEffect, useRef, useState } from 'react';

import type { EnergyNetworkModel } from '../../../../types/enm';
import { pobierzOdplywyPetliZwarcia, pobierzSwz, type FaultLoopFeedersResponse } from './nnSwzApi';
import { buildSwzOverlayFromResponses, type SwzApiResponse, type SwzOverlayEntry } from './overlay';

export interface SwzOverlayState {
  /** Odznaka na kanwie — `meta.ownerRef` aparatu → werdykt (P0.8 kontrakt). */
  readonly swzByOwnerRef: Readonly<Record<string, SwzOverlayEntry>>;
  /** Panel wyników — `breakerRef` → PEŁNA koperta backendu (status OK/brak
   *  danych/nie dotyczy + werdykt), potrzebna do trzeciego stanu wprost
   *  (`nnCircuitResults.ts::buildSwzSection`/`buildIkMinSection`). */
  readonly swzResponseByBreakerRef: Readonly<Record<string, SwzApiResponse>>;
  readonly loading: boolean;
}

const EMPTY_STATE: SwzOverlayState = {
  swzByOwnerRef: {},
  swzResponseByBreakerRef: {},
  loading: false,
};

const APPARATUS_BRANCH_TYPES = new Set(['switch', 'breaker', 'fuse', 'disconnector', 'bus_coupler']);

/**
 * Stacje z co najmniej JEDNYM aparatem (switch/fuse — `resolveNnCircuitRef`
 * kryterium IDENTYCZNE) dotykającym szyny nN (`voltage_kv <=
 * STATION_LV_VOLTAGE_LIMIT_KV`) — kandydaci na `fault-loop-feeders`. Sama
 * OBECNOŚĆ szyny nN NIE wystarcza (pomiar na fixturze `sldSubstrate52s`,
 * 54 stacji × szyna nN zadeklarowana, ZERO aparatów odpływu skonfigurowanych
 * — luźniejsze kryterium strzelałoby 54 zapytaniami o odpływy, których
 * backend i tak zwróciłby puste `feeders: []`, KLASA NIE INSTANCJA: filtr
 * musi sprawdzać to samo kryterium co rozwiązanie referencji, nie jego
 * przybliżenie). Zero fetch dla stacji, które i tak nie mają CO pokazać.
 */
function stationsWithNnFeederApparatus(snapshot: EnergyNetworkModel): readonly string[] {
  const busByRef = new Map((snapshot.buses ?? []).map((bus) => [bus.ref_id, bus] as const));
  const isNnBus = (busRef: string): boolean => {
    const bus = busByRef.get(busRef);
    return bus != null && bus.voltage_kv > 0 && bus.voltage_kv <= 0.5;
  };
  const apparatusBranches = (snapshot.branches ?? []).filter((b) => APPARATUS_BRANCH_TYPES.has(b.type));
  const refs: string[] = [];
  for (const station of snapshot.substations ?? []) {
    const stationNnBusRefs = new Set((station.bus_refs ?? []).filter(isNnBus));
    if (stationNnBusRefs.size === 0) continue;
    const hasFeederApparatus = apparatusBranches.some(
      (b) => stationNnBusRefs.has(b.from_bus_ref) || stationNnBusRefs.has(b.to_bus_ref),
    );
    if (hasFeederApparatus) refs.push(station.ref_id);
  }
  return refs;
}

export function useSwzOverlay(
  snapshot: EnergyNetworkModel | null,
  caseId: string | null,
): SwzOverlayState {
  const [state, setState] = useState<SwzOverlayState>(EMPTY_STATE);
  const requestSeq = useRef(0);

  useEffect(() => {
    if (!snapshot || !caseId) {
      setState(EMPTY_STATE);
      return;
    }
    const stationRefs = stationsWithNnFeederApparatus(snapshot);
    if (stationRefs.length === 0) {
      setState(EMPTY_STATE);
      return;
    }
    const seq = (requestSeq.current += 1);
    const controller = new AbortController();
    setState((prev) => ({ ...prev, loading: true }));

    (async () => {
      const responses: SwzApiResponse[] = [];
      for (const stationRef of stationRefs) {
        let feeders: FaultLoopFeedersResponse | undefined;
        try {
          feeders = await pobierzOdplywyPetliZwarcia(caseId, stationRef, controller.signal);
        } catch {
          // Stacja bez policzalnej pętli (np. brak transformatora w modelu)
          // — pomijamy, uczciwy brak dla TEJ stacji, reszta kontynuuje.
          continue;
        }
        if (!feeders || feeders.status !== 'OK') continue;
        for (const feeder of feeders.feeders) {
          if (!feeder.worst_point_bus_ref) continue;
          try {
            const swz = await pobierzSwz(
              caseId,
              stationRef,
              feeder.worst_point_bus_ref,
              feeder.feeder_root_branch_ref,
              controller.signal,
            );
            responses.push(swz);
          } catch {
            // Werdykt tego JEDNEGO odpływu niepobieralny — pomijamy WYŁĄCZNIE
            // jego, reszta odpływów kontynuuje (brak dla jednego ≠ brak dla
            // wszystkich, KLASA NIE INSTANCJA).
          }
        }
      }
      if (controller.signal.aborted || seq !== requestSeq.current) return;
      const byBreakerRef: Record<string, SwzApiResponse> = {};
      for (const response of responses) {
        byBreakerRef[response.breaker_ref] = response;
      }
      setState({
        swzByOwnerRef: buildSwzOverlayFromResponses(responses),
        swzResponseByBreakerRef: byBreakerRef,
        loading: false,
      });
    })().catch(() => {
      if (controller.signal.aborted || seq !== requestSeq.current) return;
      setState(EMPTY_STATE);
    });

    return () => controller.abort();
  }, [snapshot, caseId]);

  return state;
}
