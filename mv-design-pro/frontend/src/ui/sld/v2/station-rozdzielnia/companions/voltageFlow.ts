/**
 * GENERATED — DO NOT EDIT BY HAND.
 *
 * Per-archetype VOLTAGE + POWER-FLOW companions (gate F). Produced by running the
 * FROZEN Newton-Raphson solver (`solve_power_flow_physics`) on a two-voltage
 * substrate (real SN/nN TransformerBranch) in
 * `backend/src/application/reference_networks/station_archetype_substrate.py`
 * (READ-ONLY w.r.t. the solver, B-01). Regenerate with:
 *
 *   cd mv-design-pro/backend && poetry run python -m \
 *     application.reference_networks.station_archetype_substrate --write
 *
 * Every busbar carries U [kV] + [p.u./%] + deviation; every branch carries
 * I/P/Q/S + direction + loading %. The renderer INTERPRETS these on L2 — it
 * never recomputes a power flow.
 */
import type { StationArchetype } from '../contract';
import type { SldVoltageFlowCompanion } from './voltageFlowTypes';

export const STATION_ARCHETYPE_VOLTAGE_FLOW: Readonly<
  Record<StationArchetype, SldVoltageFlowCompanion>
> = {
  "T1": {
    "base_mva": 100.0,
    "branches": {
      "sr/branch/in": {
        "branch_ref": "sr/branch/in",
        "direction": "forward",
        "i_a": 51.07,
        "loading_percent": 8.11,
        "p_mw": 1.265,
        "q_mvar": 0.4,
        "s_mva": 1.3267
      },
      "sr/branch/out": {
        "branch_ref": "sr/branch/out",
        "direction": "forward",
        "i_a": 33.22,
        "loading_percent": 5.27,
        "p_mw": 0.8215,
        "q_mvar": 0.253,
        "s_mva": 0.8596
      },
      "sr/branch/tr": {
        "branch_ref": "sr/branch/tr",
        "direction": "forward",
        "i_a": 17.85,
        "loading_percent": null,
        "p_mw": 0.44,
        "q_mvar": 0.14,
        "s_mva": 0.4617
      }
    },
    "buses": {
      "NN_BUS": {
        "angle_deg": -0.247,
        "bus_ref": "NN_BUS",
        "deviation_percent": -0.413,
        "u_kv": 0.3983,
        "u_percent": 99.587,
        "u_pu": 0.99587,
        "un_kv": 0.4
      },
      "SN_BUS": {
        "angle_deg": -0.245,
        "bus_ref": "SN_BUS",
        "deviation_percent": -0.412,
        "u_kv": 14.9382,
        "u_percent": 99.588,
        "u_pu": 0.99588,
        "un_kv": 15.0
      }
    },
    "case_ref": "ROZPLYW_MAX_OBC",
    "converged": true,
    "enm_hash": "station-substrate/T1",
    "iterations": 3,
    "schema": "sld_voltage_flow_companion_v1",
    "solver_method": "newton-raphson",
    "white_box_steps": 3
  },
  "T2": {
    "base_mva": 100.0,
    "branches": {
      "sr/branch/in": {
        "branch_ref": "sr/branch/in",
        "direction": "forward",
        "i_a": 14.53,
        "loading_percent": 2.31,
        "p_mw": 0.3503,
        "q_mvar": 0.1406,
        "s_mva": 0.3775
      },
      "sr/branch/tr": {
        "branch_ref": "sr/branch/tr",
        "direction": "forward",
        "i_a": 14.53,
        "loading_percent": null,
        "p_mw": 0.35,
        "q_mvar": 0.14,
        "s_mva": 0.377
      }
    },
    "buses": {
      "NN_BUS": {
        "angle_deg": -0.066,
        "bus_ref": "NN_BUS",
        "deviation_percent": -0.127,
        "u_kv": 0.3995,
        "u_percent": 99.873,
        "u_pu": 0.99873,
        "un_kv": 0.4
      },
      "SN_BUS": {
        "angle_deg": -0.064,
        "bus_ref": "SN_BUS",
        "deviation_percent": -0.126,
        "u_kv": 14.9811,
        "u_percent": 99.874,
        "u_pu": 0.99874,
        "un_kv": 15.0
      }
    },
    "case_ref": "ROZPLYW_MAX_OBC",
    "converged": true,
    "enm_hash": "station-substrate/T2",
    "iterations": 3,
    "schema": "sld_voltage_flow_companion_v1",
    "solver_method": "newton-raphson",
    "white_box_steps": 3
  },
  "T3": {
    "base_mva": 100.0,
    "branches": {
      "sr/branch/branch": {
        "branch_ref": "sr/branch/branch",
        "direction": "forward",
        "i_a": 12.95,
        "loading_percent": 2.06,
        "p_mw": 0.3202,
        "q_mvar": 0.1005,
        "s_mva": 0.3356
      },
      "sr/branch/in": {
        "branch_ref": "sr/branch/in",
        "direction": "forward",
        "i_a": 32.02,
        "loading_percent": 5.08,
        "p_mw": 0.7921,
        "q_mvar": 0.2542,
        "s_mva": 0.8319
      },
      "sr/branch/main-out": {
        "branch_ref": "sr/branch/main-out",
        "direction": "forward",
        "i_a": 19.07,
        "loading_percent": 3.03,
        "p_mw": 0.4705,
        "q_mvar": 0.151,
        "s_mva": 0.4941
      }
    },
    "buses": {
      "ZKSN": {
        "angle_deg": -0.153,
        "bus_ref": "ZKSN",
        "deviation_percent": -0.26,
        "u_kv": 14.961,
        "u_percent": 99.74,
        "u_pu": 0.9974,
        "un_kv": 15.0
      }
    },
    "case_ref": "ROZPLYW_MAX_OBC",
    "converged": true,
    "enm_hash": "station-substrate/T3",
    "iterations": 3,
    "schema": "sld_voltage_flow_companion_v1",
    "solver_method": "newton-raphson",
    "white_box_steps": 3
  },
  "T4": {
    "base_mva": 100.0,
    "branches": {
      "sr/branch/in": {
        "branch_ref": "sr/branch/in",
        "direction": "forward",
        "i_a": 27.14,
        "loading_percent": 4.31,
        "p_mw": 0.672,
        "q_mvar": 0.214,
        "s_mva": 0.7053
      },
      "sr/branch/line-b": {
        "branch_ref": "sr/branch/line-b",
        "direction": "forward",
        "i_a": 24.69,
        "loading_percent": 3.92,
        "p_mw": 0.6116,
        "q_mvar": 0.1933,
        "s_mva": 0.6414
      },
      "sr/branch/out": {
        "branch_ref": "sr/branch/out",
        "direction": "forward",
        "i_a": 27.14,
        "loading_percent": 4.31,
        "p_mw": 0.671,
        "q_mvar": 0.212,
        "s_mva": 0.7037
      },
      "sr/branch/out-b": {
        "branch_ref": "sr/branch/out-b",
        "direction": "forward",
        "i_a": 24.69,
        "loading_percent": 3.92,
        "p_mw": 0.6108,
        "q_mvar": 0.1916,
        "s_mva": 0.6401
      }
    },
    "buses": {
      "SEC_A": {
        "angle_deg": -0.13,
        "bus_ref": "SEC_A",
        "deviation_percent": -0.22,
        "u_kv": 14.967,
        "u_percent": 99.78,
        "u_pu": 0.9978,
        "un_kv": 15.0
      },
      "SEC_B": {
        "angle_deg": -0.118,
        "bus_ref": "SEC_B",
        "deviation_percent": -0.199,
        "u_kv": 14.9701,
        "u_percent": 99.801,
        "u_pu": 0.99801,
        "un_kv": 15.0
      }
    },
    "case_ref": "ROZPLYW_MAX_OBC",
    "converged": true,
    "enm_hash": "station-substrate/T4",
    "iterations": 3,
    "schema": "sld_voltage_flow_companion_v1",
    "solver_method": "newton-raphson",
    "white_box_steps": 3
  }
};
