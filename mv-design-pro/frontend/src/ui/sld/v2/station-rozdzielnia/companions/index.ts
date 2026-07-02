/**
 * GENERATED — DO NOT EDIT BY HAND.
 *
 * Per-archetype frozen-solver power-flow companions for the station-rozdzielnia
 * v2 renderer. Produced by running the FROZEN power-flow solver
 * (`solve_power_flow_physics`) on the per-archetype substrate in
 * `backend/src/application/reference_networks/station_archetype_substrate.py`
 * (READ-ONLY w.r.t. the solver, B-01). Regenerate with:
 *
 *   cd mv-design-pro/backend && poetry run python -m \
 *     application.reference_networks.station_archetype_substrate --write
 *
 * The renderer reads nN load power, PV generation, power-flow DIRECTION and
 * energisation from THESE values (one truth) — never recomputed in the renderer.
 */
import type { SldPowerFlowCompanion } from '../../canvas/SldPowerFlowCompanion';
import type { StationArchetype } from '../contract';

export const STATION_ARCHETYPE_COMPANIONS: Readonly<
  Record<StationArchetype, SldPowerFlowCompanion>
> = {
  "T1": {
    "base_mva": 100.0,
    "branch_flow": {
      "sr/branch/in": {
        "direction": "forward",
        "p_from_mw": 1.114
      },
      "sr/branch/nn-f1": {
        "direction": "forward",
        "p_from_mw": 0.26
      },
      "sr/branch/nn-f2": {
        "direction": "forward",
        "p_from_mw": 0.18
      },
      "sr/branch/nn-pv": {
        "direction": "reverse",
        "p_from_mw": -0.15
      },
      "sr/branch/out": {
        "direction": "forward",
        "p_from_mw": 0.821
      },
      "sr/branch/tr": {
        "direction": "forward",
        "p_from_mw": 0.29
      }
    },
    "case_label": "Stan podstawowy \u2014 T1",
    "case_ref": "case/station/T1",
    "converged": true,
    "de_energized_bus_refs": [],
    "energized_branch_refs": [
      "sr/branch/in",
      "sr/branch/nn-f1",
      "sr/branch/nn-f2",
      "sr/branch/nn-pv",
      "sr/branch/out",
      "sr/branch/tr"
    ],
    "energized_bus_refs": [
      "GPZ",
      "LINE_OUT_END",
      "NN_BUS",
      "NN_F1",
      "NN_F2",
      "NN_PV",
      "SN_BUS"
    ],
    "enm_hash": "station-substrate/T1",
    "iterations": 3,
    "open_point_branch_refs": [],
    "schema": "sld_power_flow_companion_v1",
    "solver_method": "newton-raphson"
  },
  "T2": {
    "base_mva": 100.0,
    "branch_flow": {
      "sr/branch/in": {
        "direction": "forward",
        "p_from_mw": 0.23
      },
      "sr/branch/nn-f1": {
        "direction": "forward",
        "p_from_mw": 0.21
      },
      "sr/branch/nn-f2": {
        "direction": "forward",
        "p_from_mw": 0.14
      },
      "sr/branch/nn-pv": {
        "direction": "reverse",
        "p_from_mw": -0.12
      },
      "sr/branch/tr": {
        "direction": "forward",
        "p_from_mw": 0.23
      }
    },
    "case_label": "Stan podstawowy \u2014 T2",
    "case_ref": "case/station/T2",
    "converged": true,
    "de_energized_bus_refs": [],
    "energized_branch_refs": [
      "sr/branch/in",
      "sr/branch/nn-f1",
      "sr/branch/nn-f2",
      "sr/branch/nn-pv",
      "sr/branch/tr"
    ],
    "energized_bus_refs": [
      "GPZ",
      "NN_BUS",
      "NN_F1",
      "NN_F2",
      "NN_PV",
      "SN_BUS"
    ],
    "enm_hash": "station-substrate/T2",
    "iterations": 3,
    "open_point_branch_refs": [],
    "schema": "sld_power_flow_companion_v1",
    "solver_method": "newton-raphson"
  },
  "T3": {
    "base_mva": 100.0,
    "branch_flow": {
      "sr/branch/branch": {
        "direction": "forward",
        "p_from_mw": 0.32
      },
      "sr/branch/in": {
        "direction": "forward",
        "p_from_mw": 0.792
      },
      "sr/branch/main-out": {
        "direction": "forward",
        "p_from_mw": 0.47
      }
    },
    "case_label": "Stan podstawowy \u2014 T3",
    "case_ref": "case/station/T3",
    "converged": true,
    "de_energized_bus_refs": [],
    "energized_branch_refs": [
      "sr/branch/branch",
      "sr/branch/in",
      "sr/branch/main-out"
    ],
    "energized_bus_refs": [
      "BRANCH_END",
      "GPZ",
      "MAIN_OUT_END",
      "ZKSN"
    ],
    "enm_hash": "station-substrate/T3",
    "iterations": 3,
    "open_point_branch_refs": [],
    "schema": "sld_power_flow_companion_v1",
    "solver_method": "newton-raphson"
  },
  "T4": {
    "base_mva": 100.0,
    "branch_flow": {
      "sr/branch/coupler": {
        "direction": "none",
        "p_from_mw": 0.0
      },
      "sr/branch/in": {
        "direction": "forward",
        "p_from_mw": 0.672
      },
      "sr/branch/line-b": {
        "direction": "forward",
        "p_from_mw": 0.612
      },
      "sr/branch/out": {
        "direction": "forward",
        "p_from_mw": 0.671
      },
      "sr/branch/out-b": {
        "direction": "forward",
        "p_from_mw": 0.611
      }
    },
    "case_label": "Stan podstawowy \u2014 T4",
    "case_ref": "case/station/T4",
    "converged": true,
    "de_energized_bus_refs": [],
    "energized_branch_refs": [
      "sr/branch/in",
      "sr/branch/line-b",
      "sr/branch/out",
      "sr/branch/out-b"
    ],
    "energized_bus_refs": [
      "GPZ_A",
      "LOAD_A",
      "LOAD_B",
      "SEC_A",
      "SEC_B"
    ],
    "enm_hash": "station-substrate/T4",
    "iterations": 3,
    "open_point_branch_refs": [
      "sr/branch/coupler"
    ],
    "schema": "sld_power_flow_companion_v1",
    "solver_method": "newton-raphson"
  }
};
