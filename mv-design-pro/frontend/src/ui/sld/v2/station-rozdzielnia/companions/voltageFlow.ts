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
        "i_a": 51.32,
        "loading_percent": 8.15,
        "p_mw": 1.265,
        "q_mvar": 0.4212,
        "s_mva": 1.3333,
        "white_box": [
          {
            "formula_latex": "\\underline{S} = \\underline{U} \\cdot \\underline{I}^{*}\\ \\text{(rozwiazanie NR)}",
            "inputs": {
              "solver": "newton-raphson"
            },
            "result": {
              "p_mw": 1.265,
              "q_mvar": 0.4212
            },
            "result_unit": "MW / Mvar",
            "source": "solver",
            "substitution_latex": "P = 1.265\\ \\text{MW},\\ Q = 0.4212\\ \\text{Mvar}",
            "title": "Moc galezi S (zespolona)"
          },
          {
            "formula_latex": "S = \\sqrt{P^2 + Q^2}",
            "inputs": {
              "p_mw": 1.265,
              "q_mvar": 0.4212
            },
            "result": {
              "s_mva": 1.3333
            },
            "result_unit": "MVA",
            "source": "interpretacja",
            "substitution_latex": "S = \\sqrt{1.265^2 + 0.4212^2}",
            "title": "Moc pozorna S"
          },
          {
            "formula_latex": "I = \\frac{S \\cdot 10^3}{\\sqrt{3} \\cdot U_n}",
            "inputs": {
              "s_mva": 1.3333,
              "u_n_kv": 15.0
            },
            "result": {
              "i_a": 51.32
            },
            "result_unit": "A",
            "source": "interpretacja",
            "substitution_latex": "I = \\frac{1.3333 \\cdot 10^3}{\\sqrt{3} \\cdot 15.0}",
            "title": "Prad galezi I"
          },
          {
            "formula_latex": "obc. = \\frac{I}{I_{zn}} \\cdot 100\\%",
            "inputs": {
              "i_a": 51.32,
              "i_zn_a": 630.0
            },
            "result": {
              "loading_percent": 8.15
            },
            "result_unit": "%",
            "source": "interpretacja",
            "substitution_latex": "obc. = \\frac{51.32}{630.0} \\cdot 100\\%",
            "title": "Obciazenie pola"
          }
        ]
      },
      "sr/branch/out": {
        "branch_ref": "sr/branch/out",
        "direction": "forward",
        "i_a": 33.22,
        "loading_percent": 5.27,
        "p_mw": 0.8215,
        "q_mvar": 0.253,
        "s_mva": 0.8596,
        "white_box": [
          {
            "formula_latex": "\\underline{S} = \\underline{U} \\cdot \\underline{I}^{*}\\ \\text{(rozwiazanie NR)}",
            "inputs": {
              "solver": "newton-raphson"
            },
            "result": {
              "p_mw": 0.8215,
              "q_mvar": 0.253
            },
            "result_unit": "MW / Mvar",
            "source": "solver",
            "substitution_latex": "P = 0.8215\\ \\text{MW},\\ Q = 0.253\\ \\text{Mvar}",
            "title": "Moc galezi S (zespolona)"
          },
          {
            "formula_latex": "S = \\sqrt{P^2 + Q^2}",
            "inputs": {
              "p_mw": 0.8215,
              "q_mvar": 0.253
            },
            "result": {
              "s_mva": 0.8596
            },
            "result_unit": "MVA",
            "source": "interpretacja",
            "substitution_latex": "S = \\sqrt{0.8215^2 + 0.253^2}",
            "title": "Moc pozorna S"
          },
          {
            "formula_latex": "I = \\frac{S \\cdot 10^3}{\\sqrt{3} \\cdot U_n}",
            "inputs": {
              "s_mva": 0.8596,
              "u_n_kv": 15.0
            },
            "result": {
              "i_a": 33.22
            },
            "result_unit": "A",
            "source": "interpretacja",
            "substitution_latex": "I = \\frac{0.8596 \\cdot 10^3}{\\sqrt{3} \\cdot 15.0}",
            "title": "Prad galezi I"
          },
          {
            "formula_latex": "obc. = \\frac{I}{I_{zn}} \\cdot 100\\%",
            "inputs": {
              "i_a": 33.22,
              "i_zn_a": 630.0
            },
            "result": {
              "loading_percent": 5.27
            },
            "result_unit": "%",
            "source": "interpretacja",
            "substitution_latex": "obc. = \\frac{33.22}{630.0} \\cdot 100\\%",
            "title": "Obciazenie pola"
          }
        ]
      },
      "sr/branch/tr": {
        "branch_ref": "sr/branch/tr",
        "direction": "forward",
        "i_a": 18.11,
        "loading_percent": null,
        "p_mw": 0.44,
        "q_mvar": 0.1611,
        "s_mva": 0.4686,
        "white_box": [
          {
            "formula_latex": "\\underline{S} = \\underline{U} \\cdot \\underline{I}^{*}\\ \\text{(rozwiazanie NR)}",
            "inputs": {
              "solver": "newton-raphson"
            },
            "result": {
              "p_mw": 0.44,
              "q_mvar": 0.1611
            },
            "result_unit": "MW / Mvar",
            "source": "solver",
            "substitution_latex": "P = 0.44\\ \\text{MW},\\ Q = 0.1611\\ \\text{Mvar}",
            "title": "Moc galezi S (zespolona)"
          },
          {
            "formula_latex": "S = \\sqrt{P^2 + Q^2}",
            "inputs": {
              "p_mw": 0.44,
              "q_mvar": 0.1611
            },
            "result": {
              "s_mva": 0.4686
            },
            "result_unit": "MVA",
            "source": "interpretacja",
            "substitution_latex": "S = \\sqrt{0.44^2 + 0.1611^2}",
            "title": "Moc pozorna S"
          },
          {
            "formula_latex": "I = \\frac{S \\cdot 10^3}{\\sqrt{3} \\cdot U_n}",
            "inputs": {
              "s_mva": 0.4686,
              "u_n_kv": 15.0
            },
            "result": {
              "i_a": 18.11
            },
            "result_unit": "A",
            "source": "interpretacja",
            "substitution_latex": "I = \\frac{0.4686 \\cdot 10^3}{\\sqrt{3} \\cdot 15.0}",
            "title": "Prad galezi I"
          },
          {
            "formula_latex": "obc. = \\frac{I}{I_{zn}} \\cdot 100\\%",
            "inputs": {
              "i_a": 18.11,
              "i_zn_a": null
            },
            "result": {
              "loading_percent": null
            },
            "result_unit": "%",
            "source": "interpretacja",
            "substitution_latex": "n/d",
            "title": "Obciazenie pola"
          }
        ]
      }
    },
    "buses": {
      "NN_BUS": {
        "angle_deg": 27.299,
        "bus_ref": "NN_BUS",
        "deviation_percent": -1.871,
        "u_kv": 0.3925,
        "u_percent": 98.129,
        "u_pu": 0.98129,
        "un_kv": 0.4,
        "white_box": [
          {
            "formula_latex": "U_{pu} = |\\underline{U}|\\ \\text{(rozwi\u0105zanie Newton-Raphson)}",
            "inputs": {
              "iteracje": 4,
              "solver": "newton-raphson"
            },
            "result": {
              "u_pu": 0.98129
            },
            "result_unit": "p.u.",
            "source": "solver",
            "substitution_latex": "U_{pu} = 0.98129",
            "title": "Napi\u0119cie w\u0119z\u0142owe U (p.u.)"
          },
          {
            "formula_latex": "U = U_{pu} \\cdot U_n",
            "inputs": {
              "u_n_kv": 0.4,
              "u_pu": 0.98129
            },
            "result": {
              "u_kv": 0.3925
            },
            "result_unit": "kV",
            "source": "interpretacja",
            "substitution_latex": "U = 0.98129 \\cdot 0.4",
            "title": "Napi\u0119cie U [kV]"
          },
          {
            "formula_latex": "\\Delta U = (U_{pu} - 1) \\cdot 100\\%",
            "inputs": {
              "u_pu": 0.98129
            },
            "result": {
              "deviation_percent": -1.871
            },
            "result_unit": "%",
            "source": "interpretacja",
            "substitution_latex": "\\Delta U = (0.98129 - 1) \\cdot 100\\%",
            "title": "Odchy\u0142ka napi\u0119cia \u0394U"
          }
        ]
      },
      "SN_BUS": {
        "angle_deg": -0.243,
        "bus_ref": "SN_BUS",
        "deviation_percent": -0.421,
        "u_kv": 14.9369,
        "u_percent": 99.579,
        "u_pu": 0.99579,
        "un_kv": 15.0,
        "white_box": [
          {
            "formula_latex": "U_{pu} = |\\underline{U}|\\ \\text{(rozwi\u0105zanie Newton-Raphson)}",
            "inputs": {
              "iteracje": 4,
              "solver": "newton-raphson"
            },
            "result": {
              "u_pu": 0.99579
            },
            "result_unit": "p.u.",
            "source": "solver",
            "substitution_latex": "U_{pu} = 0.99579",
            "title": "Napi\u0119cie w\u0119z\u0142owe U (p.u.)"
          },
          {
            "formula_latex": "U = U_{pu} \\cdot U_n",
            "inputs": {
              "u_n_kv": 15.0,
              "u_pu": 0.99579
            },
            "result": {
              "u_kv": 14.9369
            },
            "result_unit": "kV",
            "source": "interpretacja",
            "substitution_latex": "U = 0.99579 \\cdot 15.0",
            "title": "Napi\u0119cie U [kV]"
          },
          {
            "formula_latex": "\\Delta U = (U_{pu} - 1) \\cdot 100\\%",
            "inputs": {
              "u_pu": 0.99579
            },
            "result": {
              "deviation_percent": -0.421
            },
            "result_unit": "%",
            "source": "interpretacja",
            "substitution_latex": "\\Delta U = (0.99579 - 1) \\cdot 100\\%",
            "title": "Odchy\u0142ka napi\u0119cia \u0394U"
          }
        ]
      }
    },
    "case_ref": "ROZPLYW_MAX_OBC",
    "converged": true,
    "enm_hash": "station-substrate/T1",
    "iterations": 4,
    "schema": "sld_voltage_flow_companion_v1",
    "solver_method": "newton-raphson",
    "white_box_steps": 4
  },
  "T2": {
    "base_mva": 100.0,
    "branches": {
      "sr/branch/in": {
        "branch_ref": "sr/branch/in",
        "direction": "forward",
        "i_a": 14.74,
        "loading_percent": 2.34,
        "p_mw": 0.3503,
        "q_mvar": 0.1545,
        "s_mva": 0.3829,
        "white_box": [
          {
            "formula_latex": "\\underline{S} = \\underline{U} \\cdot \\underline{I}^{*}\\ \\text{(rozwiazanie NR)}",
            "inputs": {
              "solver": "newton-raphson"
            },
            "result": {
              "p_mw": 0.3503,
              "q_mvar": 0.1545
            },
            "result_unit": "MW / Mvar",
            "source": "solver",
            "substitution_latex": "P = 0.3503\\ \\text{MW},\\ Q = 0.1545\\ \\text{Mvar}",
            "title": "Moc galezi S (zespolona)"
          },
          {
            "formula_latex": "S = \\sqrt{P^2 + Q^2}",
            "inputs": {
              "p_mw": 0.3503,
              "q_mvar": 0.1545
            },
            "result": {
              "s_mva": 0.3829
            },
            "result_unit": "MVA",
            "source": "interpretacja",
            "substitution_latex": "S = \\sqrt{0.3503^2 + 0.1545^2}",
            "title": "Moc pozorna S"
          },
          {
            "formula_latex": "I = \\frac{S \\cdot 10^3}{\\sqrt{3} \\cdot U_n}",
            "inputs": {
              "s_mva": 0.3829,
              "u_n_kv": 15.0
            },
            "result": {
              "i_a": 14.74
            },
            "result_unit": "A",
            "source": "interpretacja",
            "substitution_latex": "I = \\frac{0.3829 \\cdot 10^3}{\\sqrt{3} \\cdot 15.0}",
            "title": "Prad galezi I"
          },
          {
            "formula_latex": "obc. = \\frac{I}{I_{zn}} \\cdot 100\\%",
            "inputs": {
              "i_a": 14.74,
              "i_zn_a": 630.0
            },
            "result": {
              "loading_percent": 2.34
            },
            "result_unit": "%",
            "source": "interpretacja",
            "substitution_latex": "obc. = \\frac{14.74}{630.0} \\cdot 100\\%",
            "title": "Obciazenie pola"
          }
        ]
      },
      "sr/branch/tr": {
        "branch_ref": "sr/branch/tr",
        "direction": "forward",
        "i_a": 14.74,
        "loading_percent": null,
        "p_mw": 0.35,
        "q_mvar": 0.154,
        "s_mva": 0.3824,
        "white_box": [
          {
            "formula_latex": "\\underline{S} = \\underline{U} \\cdot \\underline{I}^{*}\\ \\text{(rozwiazanie NR)}",
            "inputs": {
              "solver": "newton-raphson"
            },
            "result": {
              "p_mw": 0.35,
              "q_mvar": 0.154
            },
            "result_unit": "MW / Mvar",
            "source": "solver",
            "substitution_latex": "P = 0.35\\ \\text{MW},\\ Q = 0.154\\ \\text{Mvar}",
            "title": "Moc galezi S (zespolona)"
          },
          {
            "formula_latex": "S = \\sqrt{P^2 + Q^2}",
            "inputs": {
              "p_mw": 0.35,
              "q_mvar": 0.154
            },
            "result": {
              "s_mva": 0.3824
            },
            "result_unit": "MVA",
            "source": "interpretacja",
            "substitution_latex": "S = \\sqrt{0.35^2 + 0.154^2}",
            "title": "Moc pozorna S"
          },
          {
            "formula_latex": "I = \\frac{S \\cdot 10^3}{\\sqrt{3} \\cdot U_n}",
            "inputs": {
              "s_mva": 0.3824,
              "u_n_kv": 15.0
            },
            "result": {
              "i_a": 14.74
            },
            "result_unit": "A",
            "source": "interpretacja",
            "substitution_latex": "I = \\frac{0.3824 \\cdot 10^3}{\\sqrt{3} \\cdot 15.0}",
            "title": "Prad galezi I"
          },
          {
            "formula_latex": "obc. = \\frac{I}{I_{zn}} \\cdot 100\\%",
            "inputs": {
              "i_a": 14.74,
              "i_zn_a": null
            },
            "result": {
              "loading_percent": null
            },
            "result_unit": "%",
            "source": "interpretacja",
            "substitution_latex": "n/d",
            "title": "Obciazenie pola"
          }
        ]
      }
    },
    "buses": {
      "NN_BUS": {
        "angle_deg": 27.995,
        "bus_ref": "NN_BUS",
        "deviation_percent": -1.543,
        "u_kv": 0.3938,
        "u_percent": 98.457,
        "u_pu": 0.98457,
        "un_kv": 0.4,
        "white_box": [
          {
            "formula_latex": "U_{pu} = |\\underline{U}|\\ \\text{(rozwi\u0105zanie Newton-Raphson)}",
            "inputs": {
              "iteracje": 4,
              "solver": "newton-raphson"
            },
            "result": {
              "u_pu": 0.98457
            },
            "result_unit": "p.u.",
            "source": "solver",
            "substitution_latex": "U_{pu} = 0.98457",
            "title": "Napi\u0119cie w\u0119z\u0142owe U (p.u.)"
          },
          {
            "formula_latex": "U = U_{pu} \\cdot U_n",
            "inputs": {
              "u_n_kv": 0.4,
              "u_pu": 0.98457
            },
            "result": {
              "u_kv": 0.3938
            },
            "result_unit": "kV",
            "source": "interpretacja",
            "substitution_latex": "U = 0.98457 \\cdot 0.4",
            "title": "Napi\u0119cie U [kV]"
          },
          {
            "formula_latex": "\\Delta U = (U_{pu} - 1) \\cdot 100\\%",
            "inputs": {
              "u_pu": 0.98457
            },
            "result": {
              "deviation_percent": -1.543
            },
            "result_unit": "%",
            "source": "interpretacja",
            "substitution_latex": "\\Delta U = (0.98457 - 1) \\cdot 100\\%",
            "title": "Odchy\u0142ka napi\u0119cia \u0394U"
          }
        ]
      },
      "SN_BUS": {
        "angle_deg": -0.063,
        "bus_ref": "SN_BUS",
        "deviation_percent": -0.132,
        "u_kv": 14.9802,
        "u_percent": 99.868,
        "u_pu": 0.99868,
        "un_kv": 15.0,
        "white_box": [
          {
            "formula_latex": "U_{pu} = |\\underline{U}|\\ \\text{(rozwi\u0105zanie Newton-Raphson)}",
            "inputs": {
              "iteracje": 4,
              "solver": "newton-raphson"
            },
            "result": {
              "u_pu": 0.99868
            },
            "result_unit": "p.u.",
            "source": "solver",
            "substitution_latex": "U_{pu} = 0.99868",
            "title": "Napi\u0119cie w\u0119z\u0142owe U (p.u.)"
          },
          {
            "formula_latex": "U = U_{pu} \\cdot U_n",
            "inputs": {
              "u_n_kv": 15.0,
              "u_pu": 0.99868
            },
            "result": {
              "u_kv": 14.9802
            },
            "result_unit": "kV",
            "source": "interpretacja",
            "substitution_latex": "U = 0.99868 \\cdot 15.0",
            "title": "Napi\u0119cie U [kV]"
          },
          {
            "formula_latex": "\\Delta U = (U_{pu} - 1) \\cdot 100\\%",
            "inputs": {
              "u_pu": 0.99868
            },
            "result": {
              "deviation_percent": -0.132
            },
            "result_unit": "%",
            "source": "interpretacja",
            "substitution_latex": "\\Delta U = (0.99868 - 1) \\cdot 100\\%",
            "title": "Odchy\u0142ka napi\u0119cia \u0394U"
          }
        ]
      }
    },
    "case_ref": "ROZPLYW_MAX_OBC",
    "converged": true,
    "enm_hash": "station-substrate/T2",
    "iterations": 4,
    "schema": "sld_voltage_flow_companion_v1",
    "solver_method": "newton-raphson",
    "white_box_steps": 4
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
        "s_mva": 0.3356,
        "white_box": [
          {
            "formula_latex": "\\underline{S} = \\underline{U} \\cdot \\underline{I}^{*}\\ \\text{(rozwiazanie NR)}",
            "inputs": {
              "solver": "newton-raphson"
            },
            "result": {
              "p_mw": 0.3202,
              "q_mvar": 0.1005
            },
            "result_unit": "MW / Mvar",
            "source": "solver",
            "substitution_latex": "P = 0.3202\\ \\text{MW},\\ Q = 0.1005\\ \\text{Mvar}",
            "title": "Moc galezi S (zespolona)"
          },
          {
            "formula_latex": "S = \\sqrt{P^2 + Q^2}",
            "inputs": {
              "p_mw": 0.3202,
              "q_mvar": 0.1005
            },
            "result": {
              "s_mva": 0.3356
            },
            "result_unit": "MVA",
            "source": "interpretacja",
            "substitution_latex": "S = \\sqrt{0.3202^2 + 0.1005^2}",
            "title": "Moc pozorna S"
          },
          {
            "formula_latex": "I = \\frac{S \\cdot 10^3}{\\sqrt{3} \\cdot U_n}",
            "inputs": {
              "s_mva": 0.3356,
              "u_n_kv": 15.0
            },
            "result": {
              "i_a": 12.95
            },
            "result_unit": "A",
            "source": "interpretacja",
            "substitution_latex": "I = \\frac{0.3356 \\cdot 10^3}{\\sqrt{3} \\cdot 15.0}",
            "title": "Prad galezi I"
          },
          {
            "formula_latex": "obc. = \\frac{I}{I_{zn}} \\cdot 100\\%",
            "inputs": {
              "i_a": 12.95,
              "i_zn_a": 630.0
            },
            "result": {
              "loading_percent": 2.06
            },
            "result_unit": "%",
            "source": "interpretacja",
            "substitution_latex": "obc. = \\frac{12.95}{630.0} \\cdot 100\\%",
            "title": "Obciazenie pola"
          }
        ]
      },
      "sr/branch/in": {
        "branch_ref": "sr/branch/in",
        "direction": "forward",
        "i_a": 32.02,
        "loading_percent": 5.08,
        "p_mw": 0.7921,
        "q_mvar": 0.2542,
        "s_mva": 0.8319,
        "white_box": [
          {
            "formula_latex": "\\underline{S} = \\underline{U} \\cdot \\underline{I}^{*}\\ \\text{(rozwiazanie NR)}",
            "inputs": {
              "solver": "newton-raphson"
            },
            "result": {
              "p_mw": 0.7921,
              "q_mvar": 0.2542
            },
            "result_unit": "MW / Mvar",
            "source": "solver",
            "substitution_latex": "P = 0.7921\\ \\text{MW},\\ Q = 0.2542\\ \\text{Mvar}",
            "title": "Moc galezi S (zespolona)"
          },
          {
            "formula_latex": "S = \\sqrt{P^2 + Q^2}",
            "inputs": {
              "p_mw": 0.7921,
              "q_mvar": 0.2542
            },
            "result": {
              "s_mva": 0.8319
            },
            "result_unit": "MVA",
            "source": "interpretacja",
            "substitution_latex": "S = \\sqrt{0.7921^2 + 0.2542^2}",
            "title": "Moc pozorna S"
          },
          {
            "formula_latex": "I = \\frac{S \\cdot 10^3}{\\sqrt{3} \\cdot U_n}",
            "inputs": {
              "s_mva": 0.8319,
              "u_n_kv": 15.0
            },
            "result": {
              "i_a": 32.02
            },
            "result_unit": "A",
            "source": "interpretacja",
            "substitution_latex": "I = \\frac{0.8319 \\cdot 10^3}{\\sqrt{3} \\cdot 15.0}",
            "title": "Prad galezi I"
          },
          {
            "formula_latex": "obc. = \\frac{I}{I_{zn}} \\cdot 100\\%",
            "inputs": {
              "i_a": 32.02,
              "i_zn_a": 630.0
            },
            "result": {
              "loading_percent": 5.08
            },
            "result_unit": "%",
            "source": "interpretacja",
            "substitution_latex": "obc. = \\frac{32.02}{630.0} \\cdot 100\\%",
            "title": "Obciazenie pola"
          }
        ]
      },
      "sr/branch/main-out": {
        "branch_ref": "sr/branch/main-out",
        "direction": "forward",
        "i_a": 19.07,
        "loading_percent": 3.03,
        "p_mw": 0.4705,
        "q_mvar": 0.151,
        "s_mva": 0.4941,
        "white_box": [
          {
            "formula_latex": "\\underline{S} = \\underline{U} \\cdot \\underline{I}^{*}\\ \\text{(rozwiazanie NR)}",
            "inputs": {
              "solver": "newton-raphson"
            },
            "result": {
              "p_mw": 0.4705,
              "q_mvar": 0.151
            },
            "result_unit": "MW / Mvar",
            "source": "solver",
            "substitution_latex": "P = 0.4705\\ \\text{MW},\\ Q = 0.151\\ \\text{Mvar}",
            "title": "Moc galezi S (zespolona)"
          },
          {
            "formula_latex": "S = \\sqrt{P^2 + Q^2}",
            "inputs": {
              "p_mw": 0.4705,
              "q_mvar": 0.151
            },
            "result": {
              "s_mva": 0.4941
            },
            "result_unit": "MVA",
            "source": "interpretacja",
            "substitution_latex": "S = \\sqrt{0.4705^2 + 0.151^2}",
            "title": "Moc pozorna S"
          },
          {
            "formula_latex": "I = \\frac{S \\cdot 10^3}{\\sqrt{3} \\cdot U_n}",
            "inputs": {
              "s_mva": 0.4941,
              "u_n_kv": 15.0
            },
            "result": {
              "i_a": 19.07
            },
            "result_unit": "A",
            "source": "interpretacja",
            "substitution_latex": "I = \\frac{0.4941 \\cdot 10^3}{\\sqrt{3} \\cdot 15.0}",
            "title": "Prad galezi I"
          },
          {
            "formula_latex": "obc. = \\frac{I}{I_{zn}} \\cdot 100\\%",
            "inputs": {
              "i_a": 19.07,
              "i_zn_a": 630.0
            },
            "result": {
              "loading_percent": 3.03
            },
            "result_unit": "%",
            "source": "interpretacja",
            "substitution_latex": "obc. = \\frac{19.07}{630.0} \\cdot 100\\%",
            "title": "Obciazenie pola"
          }
        ]
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
        "un_kv": 15.0,
        "white_box": [
          {
            "formula_latex": "U_{pu} = |\\underline{U}|\\ \\text{(rozwi\u0105zanie Newton-Raphson)}",
            "inputs": {
              "iteracje": 3,
              "solver": "newton-raphson"
            },
            "result": {
              "u_pu": 0.9974
            },
            "result_unit": "p.u.",
            "source": "solver",
            "substitution_latex": "U_{pu} = 0.9974",
            "title": "Napi\u0119cie w\u0119z\u0142owe U (p.u.)"
          },
          {
            "formula_latex": "U = U_{pu} \\cdot U_n",
            "inputs": {
              "u_n_kv": 15.0,
              "u_pu": 0.9974
            },
            "result": {
              "u_kv": 14.961
            },
            "result_unit": "kV",
            "source": "interpretacja",
            "substitution_latex": "U = 0.9974 \\cdot 15.0",
            "title": "Napi\u0119cie U [kV]"
          },
          {
            "formula_latex": "\\Delta U = (U_{pu} - 1) \\cdot 100\\%",
            "inputs": {
              "u_pu": 0.9974
            },
            "result": {
              "deviation_percent": -0.26
            },
            "result_unit": "%",
            "source": "interpretacja",
            "substitution_latex": "\\Delta U = (0.9974 - 1) \\cdot 100\\%",
            "title": "Odchy\u0142ka napi\u0119cia \u0394U"
          }
        ]
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
        "s_mva": 0.7053,
        "white_box": [
          {
            "formula_latex": "\\underline{S} = \\underline{U} \\cdot \\underline{I}^{*}\\ \\text{(rozwiazanie NR)}",
            "inputs": {
              "solver": "newton-raphson"
            },
            "result": {
              "p_mw": 0.672,
              "q_mvar": 0.214
            },
            "result_unit": "MW / Mvar",
            "source": "solver",
            "substitution_latex": "P = 0.672\\ \\text{MW},\\ Q = 0.214\\ \\text{Mvar}",
            "title": "Moc galezi S (zespolona)"
          },
          {
            "formula_latex": "S = \\sqrt{P^2 + Q^2}",
            "inputs": {
              "p_mw": 0.672,
              "q_mvar": 0.214
            },
            "result": {
              "s_mva": 0.7053
            },
            "result_unit": "MVA",
            "source": "interpretacja",
            "substitution_latex": "S = \\sqrt{0.672^2 + 0.214^2}",
            "title": "Moc pozorna S"
          },
          {
            "formula_latex": "I = \\frac{S \\cdot 10^3}{\\sqrt{3} \\cdot U_n}",
            "inputs": {
              "s_mva": 0.7053,
              "u_n_kv": 15.0
            },
            "result": {
              "i_a": 27.14
            },
            "result_unit": "A",
            "source": "interpretacja",
            "substitution_latex": "I = \\frac{0.7053 \\cdot 10^3}{\\sqrt{3} \\cdot 15.0}",
            "title": "Prad galezi I"
          },
          {
            "formula_latex": "obc. = \\frac{I}{I_{zn}} \\cdot 100\\%",
            "inputs": {
              "i_a": 27.14,
              "i_zn_a": 630.0
            },
            "result": {
              "loading_percent": 4.31
            },
            "result_unit": "%",
            "source": "interpretacja",
            "substitution_latex": "obc. = \\frac{27.14}{630.0} \\cdot 100\\%",
            "title": "Obciazenie pola"
          }
        ]
      },
      "sr/branch/line-b": {
        "branch_ref": "sr/branch/line-b",
        "direction": "forward",
        "i_a": 24.69,
        "loading_percent": 3.92,
        "p_mw": 0.6116,
        "q_mvar": 0.1933,
        "s_mva": 0.6414,
        "white_box": [
          {
            "formula_latex": "\\underline{S} = \\underline{U} \\cdot \\underline{I}^{*}\\ \\text{(rozwiazanie NR)}",
            "inputs": {
              "solver": "newton-raphson"
            },
            "result": {
              "p_mw": 0.6116,
              "q_mvar": 0.1933
            },
            "result_unit": "MW / Mvar",
            "source": "solver",
            "substitution_latex": "P = 0.6116\\ \\text{MW},\\ Q = 0.1933\\ \\text{Mvar}",
            "title": "Moc galezi S (zespolona)"
          },
          {
            "formula_latex": "S = \\sqrt{P^2 + Q^2}",
            "inputs": {
              "p_mw": 0.6116,
              "q_mvar": 0.1933
            },
            "result": {
              "s_mva": 0.6414
            },
            "result_unit": "MVA",
            "source": "interpretacja",
            "substitution_latex": "S = \\sqrt{0.6116^2 + 0.1933^2}",
            "title": "Moc pozorna S"
          },
          {
            "formula_latex": "I = \\frac{S \\cdot 10^3}{\\sqrt{3} \\cdot U_n}",
            "inputs": {
              "s_mva": 0.6414,
              "u_n_kv": 15.0
            },
            "result": {
              "i_a": 24.69
            },
            "result_unit": "A",
            "source": "interpretacja",
            "substitution_latex": "I = \\frac{0.6414 \\cdot 10^3}{\\sqrt{3} \\cdot 15.0}",
            "title": "Prad galezi I"
          },
          {
            "formula_latex": "obc. = \\frac{I}{I_{zn}} \\cdot 100\\%",
            "inputs": {
              "i_a": 24.69,
              "i_zn_a": 630.0
            },
            "result": {
              "loading_percent": 3.92
            },
            "result_unit": "%",
            "source": "interpretacja",
            "substitution_latex": "obc. = \\frac{24.69}{630.0} \\cdot 100\\%",
            "title": "Obciazenie pola"
          }
        ]
      },
      "sr/branch/out": {
        "branch_ref": "sr/branch/out",
        "direction": "forward",
        "i_a": 27.14,
        "loading_percent": 4.31,
        "p_mw": 0.671,
        "q_mvar": 0.212,
        "s_mva": 0.7037,
        "white_box": [
          {
            "formula_latex": "\\underline{S} = \\underline{U} \\cdot \\underline{I}^{*}\\ \\text{(rozwiazanie NR)}",
            "inputs": {
              "solver": "newton-raphson"
            },
            "result": {
              "p_mw": 0.671,
              "q_mvar": 0.212
            },
            "result_unit": "MW / Mvar",
            "source": "solver",
            "substitution_latex": "P = 0.671\\ \\text{MW},\\ Q = 0.212\\ \\text{Mvar}",
            "title": "Moc galezi S (zespolona)"
          },
          {
            "formula_latex": "S = \\sqrt{P^2 + Q^2}",
            "inputs": {
              "p_mw": 0.671,
              "q_mvar": 0.212
            },
            "result": {
              "s_mva": 0.7037
            },
            "result_unit": "MVA",
            "source": "interpretacja",
            "substitution_latex": "S = \\sqrt{0.671^2 + 0.212^2}",
            "title": "Moc pozorna S"
          },
          {
            "formula_latex": "I = \\frac{S \\cdot 10^3}{\\sqrt{3} \\cdot U_n}",
            "inputs": {
              "s_mva": 0.7037,
              "u_n_kv": 15.0
            },
            "result": {
              "i_a": 27.14
            },
            "result_unit": "A",
            "source": "interpretacja",
            "substitution_latex": "I = \\frac{0.7037 \\cdot 10^3}{\\sqrt{3} \\cdot 15.0}",
            "title": "Prad galezi I"
          },
          {
            "formula_latex": "obc. = \\frac{I}{I_{zn}} \\cdot 100\\%",
            "inputs": {
              "i_a": 27.14,
              "i_zn_a": 630.0
            },
            "result": {
              "loading_percent": 4.31
            },
            "result_unit": "%",
            "source": "interpretacja",
            "substitution_latex": "obc. = \\frac{27.14}{630.0} \\cdot 100\\%",
            "title": "Obciazenie pola"
          }
        ]
      },
      "sr/branch/out-b": {
        "branch_ref": "sr/branch/out-b",
        "direction": "forward",
        "i_a": 24.69,
        "loading_percent": 3.92,
        "p_mw": 0.6108,
        "q_mvar": 0.1916,
        "s_mva": 0.6401,
        "white_box": [
          {
            "formula_latex": "\\underline{S} = \\underline{U} \\cdot \\underline{I}^{*}\\ \\text{(rozwiazanie NR)}",
            "inputs": {
              "solver": "newton-raphson"
            },
            "result": {
              "p_mw": 0.6108,
              "q_mvar": 0.1916
            },
            "result_unit": "MW / Mvar",
            "source": "solver",
            "substitution_latex": "P = 0.6108\\ \\text{MW},\\ Q = 0.1916\\ \\text{Mvar}",
            "title": "Moc galezi S (zespolona)"
          },
          {
            "formula_latex": "S = \\sqrt{P^2 + Q^2}",
            "inputs": {
              "p_mw": 0.6108,
              "q_mvar": 0.1916
            },
            "result": {
              "s_mva": 0.6401
            },
            "result_unit": "MVA",
            "source": "interpretacja",
            "substitution_latex": "S = \\sqrt{0.6108^2 + 0.1916^2}",
            "title": "Moc pozorna S"
          },
          {
            "formula_latex": "I = \\frac{S \\cdot 10^3}{\\sqrt{3} \\cdot U_n}",
            "inputs": {
              "s_mva": 0.6401,
              "u_n_kv": 15.0
            },
            "result": {
              "i_a": 24.69
            },
            "result_unit": "A",
            "source": "interpretacja",
            "substitution_latex": "I = \\frac{0.6401 \\cdot 10^3}{\\sqrt{3} \\cdot 15.0}",
            "title": "Prad galezi I"
          },
          {
            "formula_latex": "obc. = \\frac{I}{I_{zn}} \\cdot 100\\%",
            "inputs": {
              "i_a": 24.69,
              "i_zn_a": 630.0
            },
            "result": {
              "loading_percent": 3.92
            },
            "result_unit": "%",
            "source": "interpretacja",
            "substitution_latex": "obc. = \\frac{24.69}{630.0} \\cdot 100\\%",
            "title": "Obciazenie pola"
          }
        ]
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
        "un_kv": 15.0,
        "white_box": [
          {
            "formula_latex": "U_{pu} = |\\underline{U}|\\ \\text{(rozwi\u0105zanie Newton-Raphson)}",
            "inputs": {
              "iteracje": 3,
              "solver": "newton-raphson"
            },
            "result": {
              "u_pu": 0.9978
            },
            "result_unit": "p.u.",
            "source": "solver",
            "substitution_latex": "U_{pu} = 0.9978",
            "title": "Napi\u0119cie w\u0119z\u0142owe U (p.u.)"
          },
          {
            "formula_latex": "U = U_{pu} \\cdot U_n",
            "inputs": {
              "u_n_kv": 15.0,
              "u_pu": 0.9978
            },
            "result": {
              "u_kv": 14.967
            },
            "result_unit": "kV",
            "source": "interpretacja",
            "substitution_latex": "U = 0.9978 \\cdot 15.0",
            "title": "Napi\u0119cie U [kV]"
          },
          {
            "formula_latex": "\\Delta U = (U_{pu} - 1) \\cdot 100\\%",
            "inputs": {
              "u_pu": 0.9978
            },
            "result": {
              "deviation_percent": -0.22
            },
            "result_unit": "%",
            "source": "interpretacja",
            "substitution_latex": "\\Delta U = (0.9978 - 1) \\cdot 100\\%",
            "title": "Odchy\u0142ka napi\u0119cia \u0394U"
          }
        ]
      },
      "SEC_B": {
        "angle_deg": -0.118,
        "bus_ref": "SEC_B",
        "deviation_percent": -0.199,
        "u_kv": 14.9701,
        "u_percent": 99.801,
        "u_pu": 0.99801,
        "un_kv": 15.0,
        "white_box": [
          {
            "formula_latex": "U_{pu} = |\\underline{U}|\\ \\text{(rozwi\u0105zanie Newton-Raphson)}",
            "inputs": {
              "iteracje": 3,
              "solver": "newton-raphson"
            },
            "result": {
              "u_pu": 0.99801
            },
            "result_unit": "p.u.",
            "source": "solver",
            "substitution_latex": "U_{pu} = 0.99801",
            "title": "Napi\u0119cie w\u0119z\u0142owe U (p.u.)"
          },
          {
            "formula_latex": "U = U_{pu} \\cdot U_n",
            "inputs": {
              "u_n_kv": 15.0,
              "u_pu": 0.99801
            },
            "result": {
              "u_kv": 14.9701
            },
            "result_unit": "kV",
            "source": "interpretacja",
            "substitution_latex": "U = 0.99801 \\cdot 15.0",
            "title": "Napi\u0119cie U [kV]"
          },
          {
            "formula_latex": "\\Delta U = (U_{pu} - 1) \\cdot 100\\%",
            "inputs": {
              "u_pu": 0.99801
            },
            "result": {
              "deviation_percent": -0.199
            },
            "result_unit": "%",
            "source": "interpretacja",
            "substitution_latex": "\\Delta U = (0.99801 - 1) \\cdot 100\\%",
            "title": "Odchy\u0142ka napi\u0119cia \u0394U"
          }
        ]
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
