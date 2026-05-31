/**
 * GENERATED — DO NOT EDIT BY HAND.
 *
 * Per-archetype, per-busbar IEC 60909 SHORT-CIRCUIT companions (gate E). Produced
 * by running the FROZEN ShortCircuitIEC60909Solver on a two-voltage substrate
 * (real SN/nN TransformerBranch) in
 * `backend/src/application/reference_networks/station_archetype_substrate.py`
 * (READ-ONLY w.r.t. the solver, B-01). Regenerate with:
 *
 *   cd mv-design-pro/backend && poetry run python -m \
 *     application.reference_networks.station_archetype_substrate --write
 *
 * Every SN and nN busbar carries Ik''max/min + ip/ib/ith/kappa + Z(R/X) + Sk''
 * + the Ik''max ≤ Icw verification + the solver White Box trace. The renderer
 * INTERPRETS these on L2 — it never recomputes a short circuit.
 */
import type { StationArchetype } from '../contract';
import type { SldShortCircuitCompanion } from './shortCircuitTypes';

export const STATION_ARCHETYPE_SHORT_CIRCUIT: Readonly<
  Record<StationArchetype, SldShortCircuitCompanion>
> = {
  "T1": {
    "buses": {
      "NN_BUS": {
        "bus_ref": "NN_BUS",
        "icw_ka": 25.0,
        "max": {
          "c_factor": 1.1,
          "case_ref": "ZWARCIOWY_MAKS",
          "ib_ka": 17.887,
          "ikss_ka": 15.996,
          "ip_ka": 43.942,
          "ith_ka": 15.996,
          "kappa": 1.943,
          "rx_ratio": 0.0202,
          "sk_mva": 11.08,
          "white_box_trace": [
            {
              "formula_latex": "Z_k = Z_1",
              "inputs": {
                "fault_node_id": "NN_BUS",
                "short_circuit_type": "3F",
                "z1_ohm": {
                  "im": 0.01587809523809524,
                  "re": 0.0003200015999999998
                },
                "z2_ohm": {
                  "im": 0.01587809523809524,
                  "re": 0.0003200015999999998
                }
              },
              "key": "Zk",
              "notes": null,
              "result": {
                "r_ohm": 0.0003200015999999998,
                "x_ohm": 0.01587809523809524,
                "z_equiv_abs_ohm": 0.015881319511111956,
                "z_equiv_ohm": {
                  "im": 0.01587809523809524,
                  "re": 0.0003200015999999998
                }
              },
              "substitution": "\\left(0.000320002 + j 0.0158781\\right)",
              "substitution_latex": "\\left(0.000320002 + j 0.0158781\\right)",
              "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
            },
            {
              "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
              "inputs": {
                "c_factor": 1.1,
                "un_v": 400.0,
                "voltage_factor": 0.5773502691896258,
                "z_equiv_abs_ohm": 0.015881319511111956
              },
              "key": "Ikss",
              "notes": null,
              "result": {
                "ikss_a": 15995.78160150301
              },
              "substitution": "\\frac{1.1 \\cdot 400 \\cdot 0.57735}{0.0158813}",
              "substitution_latex": "\\frac{1.1 \\cdot 400 \\cdot 0.57735}{0.0158813}",
              "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
            },
            {
              "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
              "inputs": {
                "r_ohm": 0.0003200015999999998,
                "rx_ratio": 0.020153651631477913,
                "x_ohm": 0.01587809523809524
              },
              "key": "kappa",
              "notes": null,
              "result": {
                "kappa": 1.9425039121974956
              },
              "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.0201537}",
              "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.0201537}",
              "title": "Wsp\u00f3\u0142czynnik udaru"
            },
            {
              "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
              "inputs": {
                "ikss_a": 15995.78160150301,
                "kappa": 1.9425039121974956
              },
              "key": "Ip",
              "notes": null,
              "result": {
                "ip_a": 43942.25761410001
              },
              "substitution": "1.9425 \\cdot \\sqrt{2} \\cdot 15995.8",
              "substitution_latex": "1.9425 \\cdot \\sqrt{2} \\cdot 15995.8",
              "title": "Pr\u0105d udarowy"
            },
            {
              "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
              "inputs": {
                "exp_factor": 0.5309190916707447,
                "ikss_a": 15995.78160150301,
                "kappa": 1.9425039121974956,
                "ta_s": 0.15794154429395002,
                "tb_s": 0.1
              },
              "key": "Ib",
              "notes": null,
              "result": {
                "ib_a": 17886.642025971738
              },
              "substitution": "15995.8 \\cdot \\sqrt{1 + \\left((1.9425 - 1) \\cdot 0.530919\\right)^2}",
              "substitution_latex": "15995.8 \\cdot \\sqrt{1 + \\left((1.9425 - 1) \\cdot 0.530919\\right)^2}",
              "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
            },
            {
              "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
              "inputs": {
                "ikss_a": 15995.78160150301,
                "tk_s": 1.0
              },
              "key": "Ith",
              "notes": null,
              "result": {
                "ith_a": 15995.78160150301
              },
              "substitution": "15995.8 \\cdot \\sqrt{1}",
              "substitution_latex": "15995.8 \\cdot \\sqrt{1}",
              "title": "Pr\u0105d zast\u0119pczy cieplny"
            },
            {
              "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
              "inputs": {
                "ikss_a": 15995.78160150301,
                "un_v": 400.0
              },
              "key": "Sk",
              "notes": null,
              "result": {
                "sk_mva": 11.08220257623147
              },
              "substitution": "\\sqrt{3} \\cdot 400 \\cdot 15995.8 / 10^6",
              "substitution_latex": "\\sqrt{3} \\cdot 400 \\cdot 15995.8 / 10^6",
              "title": "Moc zwarciowa"
            }
          ]
        },
        "min": {
          "c_factor": 0.95,
          "case_ref": "ZWARCIOWY_MIN",
          "ikss_ka": 13.815,
          "ith_ka": 13.815,
          "kappa": 1.943,
          "sk_mva": 9.57,
          "white_box_trace": [
            {
              "formula_latex": "Z_k = Z_1",
              "inputs": {
                "fault_node_id": "NN_BUS",
                "short_circuit_type": "3F",
                "z1_ohm": {
                  "im": 0.01587809523809524,
                  "re": 0.0003200015999999998
                },
                "z2_ohm": {
                  "im": 0.01587809523809524,
                  "re": 0.0003200015999999998
                }
              },
              "key": "Zk",
              "notes": null,
              "result": {
                "r_ohm": 0.0003200015999999998,
                "x_ohm": 0.01587809523809524,
                "z_equiv_abs_ohm": 0.015881319511111956,
                "z_equiv_ohm": {
                  "im": 0.01587809523809524,
                  "re": 0.0003200015999999998
                }
              },
              "substitution": "\\left(0.000320002 + j 0.0158781\\right)",
              "substitution_latex": "\\left(0.000320002 + j 0.0158781\\right)",
              "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
            },
            {
              "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
              "inputs": {
                "c_factor": 0.95,
                "un_v": 400.0,
                "voltage_factor": 0.5773502691896258,
                "z_equiv_abs_ohm": 0.015881319511111956
              },
              "key": "Ikss",
              "notes": null,
              "result": {
                "ikss_a": 13814.538655843506
              },
              "substitution": "\\frac{0.95 \\cdot 400 \\cdot 0.57735}{0.0158813}",
              "substitution_latex": "\\frac{0.95 \\cdot 400 \\cdot 0.57735}{0.0158813}",
              "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
            },
            {
              "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
              "inputs": {
                "r_ohm": 0.0003200015999999998,
                "rx_ratio": 0.020153651631477913,
                "x_ohm": 0.01587809523809524
              },
              "key": "kappa",
              "notes": null,
              "result": {
                "kappa": 1.9425039121974956
              },
              "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.0201537}",
              "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.0201537}",
              "title": "Wsp\u00f3\u0142czynnik udaru"
            },
            {
              "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
              "inputs": {
                "ikss_a": 13814.538655843506,
                "kappa": 1.9425039121974956
              },
              "key": "Ip",
              "notes": null,
              "result": {
                "ip_a": 37950.13157581364
              },
              "substitution": "1.9425 \\cdot \\sqrt{2} \\cdot 13814.5",
              "substitution_latex": "1.9425 \\cdot \\sqrt{2} \\cdot 13814.5",
              "title": "Pr\u0105d udarowy"
            },
            {
              "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
              "inputs": {
                "exp_factor": 0.5309190916707447,
                "ikss_a": 13814.538655843506,
                "kappa": 1.9425039121974956,
                "ta_s": 0.15794154429395002,
                "tb_s": 0.1
              },
              "key": "Ib",
              "notes": null,
              "result": {
                "ib_a": 15447.554476975589
              },
              "substitution": "13814.5 \\cdot \\sqrt{1 + \\left((1.9425 - 1) \\cdot 0.530919\\right)^2}",
              "substitution_latex": "13814.5 \\cdot \\sqrt{1 + \\left((1.9425 - 1) \\cdot 0.530919\\right)^2}",
              "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
            },
            {
              "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
              "inputs": {
                "ikss_a": 13814.538655843506,
                "tk_s": 1.0
              },
              "key": "Ith",
              "notes": null,
              "result": {
                "ith_a": 13814.538655843506
              },
              "substitution": "13814.5 \\cdot \\sqrt{1}",
              "substitution_latex": "13814.5 \\cdot \\sqrt{1}",
              "title": "Pr\u0105d zast\u0119pczy cieplny"
            },
            {
              "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
              "inputs": {
                "ikss_a": 13814.538655843506,
                "un_v": 400.0
              },
              "key": "Sk",
              "notes": null,
              "result": {
                "sk_mva": 9.570993134018085
              },
              "substitution": "\\sqrt{3} \\cdot 400 \\cdot 13814.5 / 10^6",
              "substitution_latex": "\\sqrt{3} \\cdot 400 \\cdot 13814.5 / 10^6",
              "title": "Moc zwarciowa"
            }
          ]
        },
        "un_kv": 0.4,
        "verification": {
          "icw_ka": 25.0,
          "ikss_max_ka": 15.996,
          "passed": true,
          "rule": "ikss_max_le_icw"
        }
      },
      "SN_BUS": {
        "bus_ref": "SN_BUS",
        "icw_ka": 25.0,
        "max": {
          "c_factor": 1.1,
          "case_ref": "ZWARCIOWY_MAKS",
          "ib_ka": 9.467,
          "ikss_ka": 9.467,
          "ip_ka": 16.584,
          "ith_ka": 9.467,
          "kappa": 1.239,
          "rx_ratio": 0.5,
          "sk_mva": 245.97,
          "white_box_trace": [
            {
              "formula_latex": "Z_k = Z_1",
              "inputs": {
                "fault_node_id": "SN_BUS",
                "short_circuit_type": "3F",
                "z1_ohm": {
                  "im": 0.8999999999999998,
                  "re": 0.4500022499999997
                },
                "z2_ohm": {
                  "im": 0.8999999999999998,
                  "re": 0.4500022499999997
                }
              },
              "key": "Zk",
              "notes": null,
              "result": {
                "r_ohm": 0.4500022499999997,
                "x_ohm": 0.8999999999999998,
                "z_equiv_abs_ohm": 1.0062315961075075,
                "z_equiv_ohm": {
                  "im": 0.8999999999999998,
                  "re": 0.4500022499999997
                }
              },
              "substitution": "\\left(0.450002 + j 0.9\\right)",
              "substitution_latex": "\\left(0.450002 + j 0.9\\right)",
              "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
            },
            {
              "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
              "inputs": {
                "c_factor": 1.1,
                "un_v": 15000.0,
                "voltage_factor": 0.5773502691896258,
                "z_equiv_abs_ohm": 1.0062315961075075
              },
              "key": "Ikss",
              "notes": null,
              "result": {
                "ikss_a": 9467.283156760488
              },
              "substitution": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{1.00623}",
              "substitution_latex": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{1.00623}",
              "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
            },
            {
              "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
              "inputs": {
                "r_ohm": 0.4500022499999997,
                "rx_ratio": 0.5000024999999998,
                "x_ohm": 0.8999999999999998
              },
              "key": "kappa",
              "notes": null,
              "result": {
                "kappa": 1.2386659169449343
              },
              "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500002}",
              "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500002}",
              "title": "Wsp\u00f3\u0142czynnik udaru"
            },
            {
              "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
              "inputs": {
                "ikss_a": 9467.283156760488,
                "kappa": 1.2386659169449343
              },
              "key": "Ip",
              "notes": null,
              "result": {
                "ip_a": 16584.2009783418
              },
              "substitution": "1.23867 \\cdot \\sqrt{2} \\cdot 9467.28",
              "substitution_latex": "1.23867 \\cdot \\sqrt{2} \\cdot 9467.28",
              "title": "Pr\u0105d udarowy"
            },
            {
              "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
              "inputs": {
                "exp_factor": 1.5068989191779398e-07,
                "ikss_a": 9467.283156760488,
                "kappa": 1.2386659169449343,
                "ta_s": 0.0063661658928463516,
                "tb_s": 0.1
              },
              "key": "Ib",
              "notes": null,
              "result": {
                "ib_a": 9467.283156760494
              },
              "substitution": "9467.28 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
              "substitution_latex": "9467.28 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
              "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
            },
            {
              "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
              "inputs": {
                "ikss_a": 9467.283156760488,
                "tk_s": 1.0
              },
              "key": "Ith",
              "notes": null,
              "result": {
                "ith_a": 9467.283156760488
              },
              "substitution": "9467.28 \\cdot \\sqrt{1}",
              "substitution_latex": "9467.28 \\cdot \\sqrt{1}",
              "title": "Pr\u0105d zast\u0119pczy cieplny"
            },
            {
              "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
              "inputs": {
                "ikss_a": 9467.283156760488,
                "un_v": 15000.0
              },
              "key": "Sk",
              "notes": null,
              "result": {
                "sk_mva": 245.96723155725348
              },
              "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 9467.28 / 10^6",
              "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 9467.28 / 10^6",
              "title": "Moc zwarciowa"
            }
          ]
        },
        "min": {
          "c_factor": 0.95,
          "case_ref": "ZWARCIOWY_MIN",
          "ikss_ka": 8.176,
          "ith_ka": 8.176,
          "kappa": 1.239,
          "sk_mva": 212.43,
          "white_box_trace": [
            {
              "formula_latex": "Z_k = Z_1",
              "inputs": {
                "fault_node_id": "SN_BUS",
                "short_circuit_type": "3F",
                "z1_ohm": {
                  "im": 0.8999999999999998,
                  "re": 0.4500022499999997
                },
                "z2_ohm": {
                  "im": 0.8999999999999998,
                  "re": 0.4500022499999997
                }
              },
              "key": "Zk",
              "notes": null,
              "result": {
                "r_ohm": 0.4500022499999997,
                "x_ohm": 0.8999999999999998,
                "z_equiv_abs_ohm": 1.0062315961075075,
                "z_equiv_ohm": {
                  "im": 0.8999999999999998,
                  "re": 0.4500022499999997
                }
              },
              "substitution": "\\left(0.450002 + j 0.9\\right)",
              "substitution_latex": "\\left(0.450002 + j 0.9\\right)",
              "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
            },
            {
              "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
              "inputs": {
                "c_factor": 0.95,
                "un_v": 15000.0,
                "voltage_factor": 0.5773502691896258,
                "z_equiv_abs_ohm": 1.0062315961075075
              },
              "key": "Ikss",
              "notes": null,
              "result": {
                "ikss_a": 8176.289999020421
              },
              "substitution": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{1.00623}",
              "substitution_latex": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{1.00623}",
              "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
            },
            {
              "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
              "inputs": {
                "r_ohm": 0.4500022499999997,
                "rx_ratio": 0.5000024999999998,
                "x_ohm": 0.8999999999999998
              },
              "key": "kappa",
              "notes": null,
              "result": {
                "kappa": 1.2386659169449343
              },
              "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500002}",
              "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500002}",
              "title": "Wsp\u00f3\u0142czynnik udaru"
            },
            {
              "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
              "inputs": {
                "ikss_a": 8176.289999020421,
                "kappa": 1.2386659169449343
              },
              "key": "Ip",
              "notes": null,
              "result": {
                "ip_a": 14322.719026749737
              },
              "substitution": "1.23867 \\cdot \\sqrt{2} \\cdot 8176.29",
              "substitution_latex": "1.23867 \\cdot \\sqrt{2} \\cdot 8176.29",
              "title": "Pr\u0105d udarowy"
            },
            {
              "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
              "inputs": {
                "exp_factor": 1.5068989191779398e-07,
                "ikss_a": 8176.289999020421,
                "kappa": 1.2386659169449343,
                "ta_s": 0.0063661658928463516,
                "tb_s": 0.1
              },
              "key": "Ib",
              "notes": null,
              "result": {
                "ib_a": 8176.289999020427
              },
              "substitution": "8176.29 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
              "substitution_latex": "8176.29 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
              "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
            },
            {
              "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
              "inputs": {
                "ikss_a": 8176.289999020421,
                "tk_s": 1.0
              },
              "key": "Ith",
              "notes": null,
              "result": {
                "ith_a": 8176.289999020421
              },
              "substitution": "8176.29 \\cdot \\sqrt{1}",
              "substitution_latex": "8176.29 \\cdot \\sqrt{1}",
              "title": "Pr\u0105d zast\u0119pczy cieplny"
            },
            {
              "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
              "inputs": {
                "ikss_a": 8176.289999020421,
                "un_v": 15000.0
              },
              "key": "Sk",
              "notes": null,
              "result": {
                "sk_mva": 212.42624543580982
              },
              "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 8176.29 / 10^6",
              "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 8176.29 / 10^6",
              "title": "Moc zwarciowa"
            }
          ]
        },
        "un_kv": 15.0,
        "verification": {
          "icw_ka": 25.0,
          "ikss_max_ka": 9.467,
          "passed": true,
          "rule": "ikss_max_le_icw"
        }
      }
    },
    "enm_hash": "station-substrate/T1",
    "schema": "sld_short_circuit_companion_v1",
    "solver_method": "iec60909-3ph",
    "standard": "IEC 60909",
    "tk_s": 1.0
  },
  "T2": {
    "buses": {
      "NN_BUS": {
        "bus_ref": "NN_BUS",
        "icw_ka": 25.0,
        "max": {
          "c_factor": 1.1,
          "case_ref": "ZWARCIOWY_MAKS",
          "ib_ka": 17.887,
          "ikss_ka": 15.996,
          "ip_ka": 43.942,
          "ith_ka": 15.996,
          "kappa": 1.943,
          "rx_ratio": 0.0202,
          "sk_mva": 11.08,
          "white_box_trace": [
            {
              "formula_latex": "Z_k = Z_1",
              "inputs": {
                "fault_node_id": "NN_BUS",
                "short_circuit_type": "3F",
                "z1_ohm": {
                  "im": 0.01587809523809524,
                  "re": 0.00032000160000000014
                },
                "z2_ohm": {
                  "im": 0.01587809523809524,
                  "re": 0.00032000160000000014
                }
              },
              "key": "Zk",
              "notes": null,
              "result": {
                "r_ohm": 0.00032000160000000014,
                "x_ohm": 0.01587809523809524,
                "z_equiv_abs_ohm": 0.015881319511111956,
                "z_equiv_ohm": {
                  "im": 0.01587809523809524,
                  "re": 0.00032000160000000014
                }
              },
              "substitution": "\\left(0.000320002 + j 0.0158781\\right)",
              "substitution_latex": "\\left(0.000320002 + j 0.0158781\\right)",
              "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
            },
            {
              "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
              "inputs": {
                "c_factor": 1.1,
                "un_v": 400.0,
                "voltage_factor": 0.5773502691896258,
                "z_equiv_abs_ohm": 0.015881319511111956
              },
              "key": "Ikss",
              "notes": null,
              "result": {
                "ikss_a": 15995.78160150301
              },
              "substitution": "\\frac{1.1 \\cdot 400 \\cdot 0.57735}{0.0158813}",
              "substitution_latex": "\\frac{1.1 \\cdot 400 \\cdot 0.57735}{0.0158813}",
              "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
            },
            {
              "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
              "inputs": {
                "r_ohm": 0.00032000160000000014,
                "rx_ratio": 0.020153651631477934,
                "x_ohm": 0.01587809523809524
              },
              "key": "kappa",
              "notes": null,
              "result": {
                "kappa": 1.9425039121974956
              },
              "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.0201537}",
              "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.0201537}",
              "title": "Wsp\u00f3\u0142czynnik udaru"
            },
            {
              "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
              "inputs": {
                "ikss_a": 15995.78160150301,
                "kappa": 1.9425039121974956
              },
              "key": "Ip",
              "notes": null,
              "result": {
                "ip_a": 43942.25761410001
              },
              "substitution": "1.9425 \\cdot \\sqrt{2} \\cdot 15995.8",
              "substitution_latex": "1.9425 \\cdot \\sqrt{2} \\cdot 15995.8",
              "title": "Pr\u0105d udarowy"
            },
            {
              "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
              "inputs": {
                "exp_factor": 0.5309190916707444,
                "ikss_a": 15995.78160150301,
                "kappa": 1.9425039121974956,
                "ta_s": 0.15794154429394985,
                "tb_s": 0.1
              },
              "key": "Ib",
              "notes": null,
              "result": {
                "ib_a": 17886.642025971738
              },
              "substitution": "15995.8 \\cdot \\sqrt{1 + \\left((1.9425 - 1) \\cdot 0.530919\\right)^2}",
              "substitution_latex": "15995.8 \\cdot \\sqrt{1 + \\left((1.9425 - 1) \\cdot 0.530919\\right)^2}",
              "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
            },
            {
              "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
              "inputs": {
                "ikss_a": 15995.78160150301,
                "tk_s": 1.0
              },
              "key": "Ith",
              "notes": null,
              "result": {
                "ith_a": 15995.78160150301
              },
              "substitution": "15995.8 \\cdot \\sqrt{1}",
              "substitution_latex": "15995.8 \\cdot \\sqrt{1}",
              "title": "Pr\u0105d zast\u0119pczy cieplny"
            },
            {
              "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
              "inputs": {
                "ikss_a": 15995.78160150301,
                "un_v": 400.0
              },
              "key": "Sk",
              "notes": null,
              "result": {
                "sk_mva": 11.08220257623147
              },
              "substitution": "\\sqrt{3} \\cdot 400 \\cdot 15995.8 / 10^6",
              "substitution_latex": "\\sqrt{3} \\cdot 400 \\cdot 15995.8 / 10^6",
              "title": "Moc zwarciowa"
            }
          ]
        },
        "min": {
          "c_factor": 0.95,
          "case_ref": "ZWARCIOWY_MIN",
          "ikss_ka": 13.815,
          "ith_ka": 13.815,
          "kappa": 1.943,
          "sk_mva": 9.57,
          "white_box_trace": [
            {
              "formula_latex": "Z_k = Z_1",
              "inputs": {
                "fault_node_id": "NN_BUS",
                "short_circuit_type": "3F",
                "z1_ohm": {
                  "im": 0.01587809523809524,
                  "re": 0.00032000160000000014
                },
                "z2_ohm": {
                  "im": 0.01587809523809524,
                  "re": 0.00032000160000000014
                }
              },
              "key": "Zk",
              "notes": null,
              "result": {
                "r_ohm": 0.00032000160000000014,
                "x_ohm": 0.01587809523809524,
                "z_equiv_abs_ohm": 0.015881319511111956,
                "z_equiv_ohm": {
                  "im": 0.01587809523809524,
                  "re": 0.00032000160000000014
                }
              },
              "substitution": "\\left(0.000320002 + j 0.0158781\\right)",
              "substitution_latex": "\\left(0.000320002 + j 0.0158781\\right)",
              "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
            },
            {
              "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
              "inputs": {
                "c_factor": 0.95,
                "un_v": 400.0,
                "voltage_factor": 0.5773502691896258,
                "z_equiv_abs_ohm": 0.015881319511111956
              },
              "key": "Ikss",
              "notes": null,
              "result": {
                "ikss_a": 13814.538655843506
              },
              "substitution": "\\frac{0.95 \\cdot 400 \\cdot 0.57735}{0.0158813}",
              "substitution_latex": "\\frac{0.95 \\cdot 400 \\cdot 0.57735}{0.0158813}",
              "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
            },
            {
              "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
              "inputs": {
                "r_ohm": 0.00032000160000000014,
                "rx_ratio": 0.020153651631477934,
                "x_ohm": 0.01587809523809524
              },
              "key": "kappa",
              "notes": null,
              "result": {
                "kappa": 1.9425039121974956
              },
              "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.0201537}",
              "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.0201537}",
              "title": "Wsp\u00f3\u0142czynnik udaru"
            },
            {
              "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
              "inputs": {
                "ikss_a": 13814.538655843506,
                "kappa": 1.9425039121974956
              },
              "key": "Ip",
              "notes": null,
              "result": {
                "ip_a": 37950.13157581364
              },
              "substitution": "1.9425 \\cdot \\sqrt{2} \\cdot 13814.5",
              "substitution_latex": "1.9425 \\cdot \\sqrt{2} \\cdot 13814.5",
              "title": "Pr\u0105d udarowy"
            },
            {
              "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
              "inputs": {
                "exp_factor": 0.5309190916707444,
                "ikss_a": 13814.538655843506,
                "kappa": 1.9425039121974956,
                "ta_s": 0.15794154429394985,
                "tb_s": 0.1
              },
              "key": "Ib",
              "notes": null,
              "result": {
                "ib_a": 15447.554476975589
              },
              "substitution": "13814.5 \\cdot \\sqrt{1 + \\left((1.9425 - 1) \\cdot 0.530919\\right)^2}",
              "substitution_latex": "13814.5 \\cdot \\sqrt{1 + \\left((1.9425 - 1) \\cdot 0.530919\\right)^2}",
              "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
            },
            {
              "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
              "inputs": {
                "ikss_a": 13814.538655843506,
                "tk_s": 1.0
              },
              "key": "Ith",
              "notes": null,
              "result": {
                "ith_a": 13814.538655843506
              },
              "substitution": "13814.5 \\cdot \\sqrt{1}",
              "substitution_latex": "13814.5 \\cdot \\sqrt{1}",
              "title": "Pr\u0105d zast\u0119pczy cieplny"
            },
            {
              "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
              "inputs": {
                "ikss_a": 13814.538655843506,
                "un_v": 400.0
              },
              "key": "Sk",
              "notes": null,
              "result": {
                "sk_mva": 9.570993134018085
              },
              "substitution": "\\sqrt{3} \\cdot 400 \\cdot 13814.5 / 10^6",
              "substitution_latex": "\\sqrt{3} \\cdot 400 \\cdot 13814.5 / 10^6",
              "title": "Moc zwarciowa"
            }
          ]
        },
        "un_kv": 0.4,
        "verification": {
          "icw_ka": 25.0,
          "ikss_max_ka": 15.996,
          "passed": true,
          "rule": "ikss_max_le_icw"
        }
      },
      "SN_BUS": {
        "bus_ref": "SN_BUS",
        "icw_ka": 25.0,
        "max": {
          "c_factor": 1.1,
          "case_ref": "ZWARCIOWY_MAKS",
          "ib_ka": 9.467,
          "ikss_ka": 9.467,
          "ip_ka": 16.584,
          "ith_ka": 9.467,
          "kappa": 1.239,
          "rx_ratio": 0.5,
          "sk_mva": 245.97,
          "white_box_trace": [
            {
              "formula_latex": "Z_k = Z_1",
              "inputs": {
                "fault_node_id": "SN_BUS",
                "short_circuit_type": "3F",
                "z1_ohm": {
                  "im": 0.9,
                  "re": 0.45000225000000016
                },
                "z2_ohm": {
                  "im": 0.9,
                  "re": 0.45000225000000016
                }
              },
              "key": "Zk",
              "notes": null,
              "result": {
                "r_ohm": 0.45000225000000016,
                "x_ohm": 0.9,
                "z_equiv_abs_ohm": 1.006231596107508,
                "z_equiv_ohm": {
                  "im": 0.9,
                  "re": 0.45000225000000016
                }
              },
              "substitution": "\\left(0.450002 + j 0.9\\right)",
              "substitution_latex": "\\left(0.450002 + j 0.9\\right)",
              "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
            },
            {
              "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
              "inputs": {
                "c_factor": 1.1,
                "un_v": 15000.0,
                "voltage_factor": 0.5773502691896258,
                "z_equiv_abs_ohm": 1.006231596107508
              },
              "key": "Ikss",
              "notes": null,
              "result": {
                "ikss_a": 9467.283156760483
              },
              "substitution": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{1.00623}",
              "substitution_latex": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{1.00623}",
              "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
            },
            {
              "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
              "inputs": {
                "r_ohm": 0.45000225000000016,
                "rx_ratio": 0.5000025000000001,
                "x_ohm": 0.9
              },
              "key": "kappa",
              "notes": null,
              "result": {
                "kappa": 1.238665916944934
              },
              "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500003}",
              "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500003}",
              "title": "Wsp\u00f3\u0142czynnik udaru"
            },
            {
              "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
              "inputs": {
                "ikss_a": 9467.283156760483,
                "kappa": 1.238665916944934
              },
              "key": "Ip",
              "notes": null,
              "result": {
                "ip_a": 16584.20097834179
              },
              "substitution": "1.23867 \\cdot \\sqrt{2} \\cdot 9467.28",
              "substitution_latex": "1.23867 \\cdot \\sqrt{2} \\cdot 9467.28",
              "title": "Pr\u0105d udarowy"
            },
            {
              "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
              "inputs": {
                "exp_factor": 1.5068989191779237e-07,
                "ikss_a": 9467.283156760483,
                "kappa": 1.238665916944934,
                "ta_s": 0.006366165892846347,
                "tb_s": 0.1
              },
              "key": "Ib",
              "notes": null,
              "result": {
                "ib_a": 9467.283156760488
              },
              "substitution": "9467.28 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
              "substitution_latex": "9467.28 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
              "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
            },
            {
              "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
              "inputs": {
                "ikss_a": 9467.283156760483,
                "tk_s": 1.0
              },
              "key": "Ith",
              "notes": null,
              "result": {
                "ith_a": 9467.283156760483
              },
              "substitution": "9467.28 \\cdot \\sqrt{1}",
              "substitution_latex": "9467.28 \\cdot \\sqrt{1}",
              "title": "Pr\u0105d zast\u0119pczy cieplny"
            },
            {
              "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
              "inputs": {
                "ikss_a": 9467.283156760483,
                "un_v": 15000.0
              },
              "key": "Sk",
              "notes": null,
              "result": {
                "sk_mva": 245.96723155725334
              },
              "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 9467.28 / 10^6",
              "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 9467.28 / 10^6",
              "title": "Moc zwarciowa"
            }
          ]
        },
        "min": {
          "c_factor": 0.95,
          "case_ref": "ZWARCIOWY_MIN",
          "ikss_ka": 8.176,
          "ith_ka": 8.176,
          "kappa": 1.239,
          "sk_mva": 212.43,
          "white_box_trace": [
            {
              "formula_latex": "Z_k = Z_1",
              "inputs": {
                "fault_node_id": "SN_BUS",
                "short_circuit_type": "3F",
                "z1_ohm": {
                  "im": 0.9,
                  "re": 0.45000225000000016
                },
                "z2_ohm": {
                  "im": 0.9,
                  "re": 0.45000225000000016
                }
              },
              "key": "Zk",
              "notes": null,
              "result": {
                "r_ohm": 0.45000225000000016,
                "x_ohm": 0.9,
                "z_equiv_abs_ohm": 1.006231596107508,
                "z_equiv_ohm": {
                  "im": 0.9,
                  "re": 0.45000225000000016
                }
              },
              "substitution": "\\left(0.450002 + j 0.9\\right)",
              "substitution_latex": "\\left(0.450002 + j 0.9\\right)",
              "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
            },
            {
              "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
              "inputs": {
                "c_factor": 0.95,
                "un_v": 15000.0,
                "voltage_factor": 0.5773502691896258,
                "z_equiv_abs_ohm": 1.006231596107508
              },
              "key": "Ikss",
              "notes": null,
              "result": {
                "ikss_a": 8176.289999020418
              },
              "substitution": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{1.00623}",
              "substitution_latex": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{1.00623}",
              "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
            },
            {
              "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
              "inputs": {
                "r_ohm": 0.45000225000000016,
                "rx_ratio": 0.5000025000000001,
                "x_ohm": 0.9
              },
              "key": "kappa",
              "notes": null,
              "result": {
                "kappa": 1.238665916944934
              },
              "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500003}",
              "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500003}",
              "title": "Wsp\u00f3\u0142czynnik udaru"
            },
            {
              "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
              "inputs": {
                "ikss_a": 8176.289999020418,
                "kappa": 1.238665916944934
              },
              "key": "Ip",
              "notes": null,
              "result": {
                "ip_a": 14322.719026749728
              },
              "substitution": "1.23867 \\cdot \\sqrt{2} \\cdot 8176.29",
              "substitution_latex": "1.23867 \\cdot \\sqrt{2} \\cdot 8176.29",
              "title": "Pr\u0105d udarowy"
            },
            {
              "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
              "inputs": {
                "exp_factor": 1.5068989191779237e-07,
                "ikss_a": 8176.289999020418,
                "kappa": 1.238665916944934,
                "ta_s": 0.006366165892846347,
                "tb_s": 0.1
              },
              "key": "Ib",
              "notes": null,
              "result": {
                "ib_a": 8176.289999020423
              },
              "substitution": "8176.29 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
              "substitution_latex": "8176.29 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
              "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
            },
            {
              "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
              "inputs": {
                "ikss_a": 8176.289999020418,
                "tk_s": 1.0
              },
              "key": "Ith",
              "notes": null,
              "result": {
                "ith_a": 8176.289999020418
              },
              "substitution": "8176.29 \\cdot \\sqrt{1}",
              "substitution_latex": "8176.29 \\cdot \\sqrt{1}",
              "title": "Pr\u0105d zast\u0119pczy cieplny"
            },
            {
              "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
              "inputs": {
                "ikss_a": 8176.289999020418,
                "un_v": 15000.0
              },
              "key": "Sk",
              "notes": null,
              "result": {
                "sk_mva": 212.42624543580973
              },
              "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 8176.29 / 10^6",
              "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 8176.29 / 10^6",
              "title": "Moc zwarciowa"
            }
          ]
        },
        "un_kv": 15.0,
        "verification": {
          "icw_ka": 25.0,
          "ikss_max_ka": 9.467,
          "passed": true,
          "rule": "ikss_max_le_icw"
        }
      }
    },
    "enm_hash": "station-substrate/T2",
    "schema": "sld_short_circuit_companion_v1",
    "solver_method": "iec60909-3ph",
    "standard": "IEC 60909",
    "tk_s": 1.0
  },
  "T3": {
    "buses": {
      "ZKSN": {
        "bus_ref": "ZKSN",
        "icw_ka": 25.0,
        "max": {
          "c_factor": 1.1,
          "case_ref": "ZWARCIOWY_MAKS",
          "ib_ka": 9.467,
          "ikss_ka": 9.467,
          "ip_ka": 16.584,
          "ith_ka": 9.467,
          "kappa": 1.239,
          "rx_ratio": 0.5,
          "sk_mva": 245.97,
          "white_box_trace": [
            {
              "formula_latex": "Z_k = Z_1",
              "inputs": {
                "fault_node_id": "ZKSN",
                "short_circuit_type": "3F",
                "z1_ohm": {
                  "im": 0.9,
                  "re": 0.45000225000000016
                },
                "z2_ohm": {
                  "im": 0.9,
                  "re": 0.45000225000000016
                }
              },
              "key": "Zk",
              "notes": null,
              "result": {
                "r_ohm": 0.45000225000000016,
                "x_ohm": 0.9,
                "z_equiv_abs_ohm": 1.006231596107508,
                "z_equiv_ohm": {
                  "im": 0.9,
                  "re": 0.45000225000000016
                }
              },
              "substitution": "\\left(0.450002 + j 0.9\\right)",
              "substitution_latex": "\\left(0.450002 + j 0.9\\right)",
              "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
            },
            {
              "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
              "inputs": {
                "c_factor": 1.1,
                "un_v": 15000.0,
                "voltage_factor": 0.5773502691896258,
                "z_equiv_abs_ohm": 1.006231596107508
              },
              "key": "Ikss",
              "notes": null,
              "result": {
                "ikss_a": 9467.283156760483
              },
              "substitution": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{1.00623}",
              "substitution_latex": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{1.00623}",
              "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
            },
            {
              "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
              "inputs": {
                "r_ohm": 0.45000225000000016,
                "rx_ratio": 0.5000025000000001,
                "x_ohm": 0.9
              },
              "key": "kappa",
              "notes": null,
              "result": {
                "kappa": 1.238665916944934
              },
              "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500003}",
              "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500003}",
              "title": "Wsp\u00f3\u0142czynnik udaru"
            },
            {
              "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
              "inputs": {
                "ikss_a": 9467.283156760483,
                "kappa": 1.238665916944934
              },
              "key": "Ip",
              "notes": null,
              "result": {
                "ip_a": 16584.20097834179
              },
              "substitution": "1.23867 \\cdot \\sqrt{2} \\cdot 9467.28",
              "substitution_latex": "1.23867 \\cdot \\sqrt{2} \\cdot 9467.28",
              "title": "Pr\u0105d udarowy"
            },
            {
              "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
              "inputs": {
                "exp_factor": 1.5068989191779237e-07,
                "ikss_a": 9467.283156760483,
                "kappa": 1.238665916944934,
                "ta_s": 0.006366165892846347,
                "tb_s": 0.1
              },
              "key": "Ib",
              "notes": null,
              "result": {
                "ib_a": 9467.283156760488
              },
              "substitution": "9467.28 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
              "substitution_latex": "9467.28 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
              "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
            },
            {
              "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
              "inputs": {
                "ikss_a": 9467.283156760483,
                "tk_s": 1.0
              },
              "key": "Ith",
              "notes": null,
              "result": {
                "ith_a": 9467.283156760483
              },
              "substitution": "9467.28 \\cdot \\sqrt{1}",
              "substitution_latex": "9467.28 \\cdot \\sqrt{1}",
              "title": "Pr\u0105d zast\u0119pczy cieplny"
            },
            {
              "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
              "inputs": {
                "ikss_a": 9467.283156760483,
                "un_v": 15000.0
              },
              "key": "Sk",
              "notes": null,
              "result": {
                "sk_mva": 245.96723155725334
              },
              "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 9467.28 / 10^6",
              "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 9467.28 / 10^6",
              "title": "Moc zwarciowa"
            }
          ]
        },
        "min": {
          "c_factor": 0.95,
          "case_ref": "ZWARCIOWY_MIN",
          "ikss_ka": 8.176,
          "ith_ka": 8.176,
          "kappa": 1.239,
          "sk_mva": 212.43,
          "white_box_trace": [
            {
              "formula_latex": "Z_k = Z_1",
              "inputs": {
                "fault_node_id": "ZKSN",
                "short_circuit_type": "3F",
                "z1_ohm": {
                  "im": 0.9,
                  "re": 0.45000225000000016
                },
                "z2_ohm": {
                  "im": 0.9,
                  "re": 0.45000225000000016
                }
              },
              "key": "Zk",
              "notes": null,
              "result": {
                "r_ohm": 0.45000225000000016,
                "x_ohm": 0.9,
                "z_equiv_abs_ohm": 1.006231596107508,
                "z_equiv_ohm": {
                  "im": 0.9,
                  "re": 0.45000225000000016
                }
              },
              "substitution": "\\left(0.450002 + j 0.9\\right)",
              "substitution_latex": "\\left(0.450002 + j 0.9\\right)",
              "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
            },
            {
              "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
              "inputs": {
                "c_factor": 0.95,
                "un_v": 15000.0,
                "voltage_factor": 0.5773502691896258,
                "z_equiv_abs_ohm": 1.006231596107508
              },
              "key": "Ikss",
              "notes": null,
              "result": {
                "ikss_a": 8176.289999020418
              },
              "substitution": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{1.00623}",
              "substitution_latex": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{1.00623}",
              "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
            },
            {
              "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
              "inputs": {
                "r_ohm": 0.45000225000000016,
                "rx_ratio": 0.5000025000000001,
                "x_ohm": 0.9
              },
              "key": "kappa",
              "notes": null,
              "result": {
                "kappa": 1.238665916944934
              },
              "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500003}",
              "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500003}",
              "title": "Wsp\u00f3\u0142czynnik udaru"
            },
            {
              "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
              "inputs": {
                "ikss_a": 8176.289999020418,
                "kappa": 1.238665916944934
              },
              "key": "Ip",
              "notes": null,
              "result": {
                "ip_a": 14322.719026749728
              },
              "substitution": "1.23867 \\cdot \\sqrt{2} \\cdot 8176.29",
              "substitution_latex": "1.23867 \\cdot \\sqrt{2} \\cdot 8176.29",
              "title": "Pr\u0105d udarowy"
            },
            {
              "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
              "inputs": {
                "exp_factor": 1.5068989191779237e-07,
                "ikss_a": 8176.289999020418,
                "kappa": 1.238665916944934,
                "ta_s": 0.006366165892846347,
                "tb_s": 0.1
              },
              "key": "Ib",
              "notes": null,
              "result": {
                "ib_a": 8176.289999020423
              },
              "substitution": "8176.29 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
              "substitution_latex": "8176.29 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
              "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
            },
            {
              "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
              "inputs": {
                "ikss_a": 8176.289999020418,
                "tk_s": 1.0
              },
              "key": "Ith",
              "notes": null,
              "result": {
                "ith_a": 8176.289999020418
              },
              "substitution": "8176.29 \\cdot \\sqrt{1}",
              "substitution_latex": "8176.29 \\cdot \\sqrt{1}",
              "title": "Pr\u0105d zast\u0119pczy cieplny"
            },
            {
              "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
              "inputs": {
                "ikss_a": 8176.289999020418,
                "un_v": 15000.0
              },
              "key": "Sk",
              "notes": null,
              "result": {
                "sk_mva": 212.42624543580973
              },
              "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 8176.29 / 10^6",
              "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 8176.29 / 10^6",
              "title": "Moc zwarciowa"
            }
          ]
        },
        "un_kv": 15.0,
        "verification": {
          "icw_ka": 25.0,
          "ikss_max_ka": 9.467,
          "passed": true,
          "rule": "ikss_max_le_icw"
        }
      }
    },
    "enm_hash": "station-substrate/T3",
    "schema": "sld_short_circuit_companion_v1",
    "solver_method": "iec60909-3ph",
    "standard": "IEC 60909",
    "tk_s": 1.0
  },
  "T4": {
    "buses": {
      "SEC_A": {
        "bus_ref": "SEC_A",
        "icw_ka": 25.0,
        "max": {
          "c_factor": 1.1,
          "case_ref": "ZWARCIOWY_MAKS",
          "ib_ka": 9.467,
          "ikss_ka": 9.467,
          "ip_ka": 16.584,
          "ith_ka": 9.467,
          "kappa": 1.239,
          "rx_ratio": 0.5,
          "sk_mva": 245.97,
          "white_box_trace": [
            {
              "formula_latex": "Z_k = Z_1",
              "inputs": {
                "fault_node_id": "SEC_A",
                "short_circuit_type": "3F",
                "z1_ohm": {
                  "im": 0.8999999999999999,
                  "re": 0.4500022499999999
                },
                "z2_ohm": {
                  "im": 0.8999999999999999,
                  "re": 0.4500022499999999
                }
              },
              "key": "Zk",
              "notes": null,
              "result": {
                "r_ohm": 0.4500022499999999,
                "x_ohm": 0.8999999999999999,
                "z_equiv_abs_ohm": 1.0062315961075077,
                "z_equiv_ohm": {
                  "im": 0.8999999999999999,
                  "re": 0.4500022499999999
                }
              },
              "substitution": "\\left(0.450002 + j 0.9\\right)",
              "substitution_latex": "\\left(0.450002 + j 0.9\\right)",
              "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
            },
            {
              "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
              "inputs": {
                "c_factor": 1.1,
                "un_v": 15000.0,
                "voltage_factor": 0.5773502691896258,
                "z_equiv_abs_ohm": 1.0062315961075077
              },
              "key": "Ikss",
              "notes": null,
              "result": {
                "ikss_a": 9467.283156760486
              },
              "substitution": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{1.00623}",
              "substitution_latex": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{1.00623}",
              "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
            },
            {
              "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
              "inputs": {
                "r_ohm": 0.4500022499999999,
                "rx_ratio": 0.5000024999999999,
                "x_ohm": 0.8999999999999999
              },
              "key": "kappa",
              "notes": null,
              "result": {
                "kappa": 1.2386659169449343
              },
              "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500002}",
              "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500002}",
              "title": "Wsp\u00f3\u0142czynnik udaru"
            },
            {
              "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
              "inputs": {
                "ikss_a": 9467.283156760486,
                "kappa": 1.2386659169449343
              },
              "key": "Ip",
              "notes": null,
              "result": {
                "ip_a": 16584.200978341796
              },
              "substitution": "1.23867 \\cdot \\sqrt{2} \\cdot 9467.28",
              "substitution_latex": "1.23867 \\cdot \\sqrt{2} \\cdot 9467.28",
              "title": "Pr\u0105d udarowy"
            },
            {
              "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
              "inputs": {
                "exp_factor": 1.5068989191779345e-07,
                "ikss_a": 9467.283156760486,
                "kappa": 1.2386659169449343,
                "ta_s": 0.00636616589284635,
                "tb_s": 0.1
              },
              "key": "Ib",
              "notes": null,
              "result": {
                "ib_a": 9467.283156760492
              },
              "substitution": "9467.28 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
              "substitution_latex": "9467.28 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
              "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
            },
            {
              "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
              "inputs": {
                "ikss_a": 9467.283156760486,
                "tk_s": 1.0
              },
              "key": "Ith",
              "notes": null,
              "result": {
                "ith_a": 9467.283156760486
              },
              "substitution": "9467.28 \\cdot \\sqrt{1}",
              "substitution_latex": "9467.28 \\cdot \\sqrt{1}",
              "title": "Pr\u0105d zast\u0119pczy cieplny"
            },
            {
              "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
              "inputs": {
                "ikss_a": 9467.283156760486,
                "un_v": 15000.0
              },
              "key": "Sk",
              "notes": null,
              "result": {
                "sk_mva": 245.96723155725343
              },
              "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 9467.28 / 10^6",
              "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 9467.28 / 10^6",
              "title": "Moc zwarciowa"
            }
          ]
        },
        "min": {
          "c_factor": 0.95,
          "case_ref": "ZWARCIOWY_MIN",
          "ikss_ka": 8.176,
          "ith_ka": 8.176,
          "kappa": 1.239,
          "sk_mva": 212.43,
          "white_box_trace": [
            {
              "formula_latex": "Z_k = Z_1",
              "inputs": {
                "fault_node_id": "SEC_A",
                "short_circuit_type": "3F",
                "z1_ohm": {
                  "im": 0.8999999999999999,
                  "re": 0.4500022499999999
                },
                "z2_ohm": {
                  "im": 0.8999999999999999,
                  "re": 0.4500022499999999
                }
              },
              "key": "Zk",
              "notes": null,
              "result": {
                "r_ohm": 0.4500022499999999,
                "x_ohm": 0.8999999999999999,
                "z_equiv_abs_ohm": 1.0062315961075077,
                "z_equiv_ohm": {
                  "im": 0.8999999999999999,
                  "re": 0.4500022499999999
                }
              },
              "substitution": "\\left(0.450002 + j 0.9\\right)",
              "substitution_latex": "\\left(0.450002 + j 0.9\\right)",
              "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
            },
            {
              "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
              "inputs": {
                "c_factor": 0.95,
                "un_v": 15000.0,
                "voltage_factor": 0.5773502691896258,
                "z_equiv_abs_ohm": 1.0062315961075077
              },
              "key": "Ikss",
              "notes": null,
              "result": {
                "ikss_a": 8176.28999902042
              },
              "substitution": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{1.00623}",
              "substitution_latex": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{1.00623}",
              "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
            },
            {
              "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
              "inputs": {
                "r_ohm": 0.4500022499999999,
                "rx_ratio": 0.5000024999999999,
                "x_ohm": 0.8999999999999999
              },
              "key": "kappa",
              "notes": null,
              "result": {
                "kappa": 1.2386659169449343
              },
              "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500002}",
              "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500002}",
              "title": "Wsp\u00f3\u0142czynnik udaru"
            },
            {
              "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
              "inputs": {
                "ikss_a": 8176.28999902042,
                "kappa": 1.2386659169449343
              },
              "key": "Ip",
              "notes": null,
              "result": {
                "ip_a": 14322.719026749734
              },
              "substitution": "1.23867 \\cdot \\sqrt{2} \\cdot 8176.29",
              "substitution_latex": "1.23867 \\cdot \\sqrt{2} \\cdot 8176.29",
              "title": "Pr\u0105d udarowy"
            },
            {
              "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
              "inputs": {
                "exp_factor": 1.5068989191779345e-07,
                "ikss_a": 8176.28999902042,
                "kappa": 1.2386659169449343,
                "ta_s": 0.00636616589284635,
                "tb_s": 0.1
              },
              "key": "Ib",
              "notes": null,
              "result": {
                "ib_a": 8176.289999020425
              },
              "substitution": "8176.29 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
              "substitution_latex": "8176.29 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
              "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
            },
            {
              "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
              "inputs": {
                "ikss_a": 8176.28999902042,
                "tk_s": 1.0
              },
              "key": "Ith",
              "notes": null,
              "result": {
                "ith_a": 8176.28999902042
              },
              "substitution": "8176.29 \\cdot \\sqrt{1}",
              "substitution_latex": "8176.29 \\cdot \\sqrt{1}",
              "title": "Pr\u0105d zast\u0119pczy cieplny"
            },
            {
              "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
              "inputs": {
                "ikss_a": 8176.28999902042,
                "un_v": 15000.0
              },
              "key": "Sk",
              "notes": null,
              "result": {
                "sk_mva": 212.42624543580976
              },
              "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 8176.29 / 10^6",
              "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 8176.29 / 10^6",
              "title": "Moc zwarciowa"
            }
          ]
        },
        "un_kv": 15.0,
        "verification": {
          "icw_ka": 25.0,
          "ikss_max_ka": 9.467,
          "passed": true,
          "rule": "ikss_max_le_icw"
        }
      },
      "SEC_B": {
        "bus_ref": "SEC_B",
        "icw_ka": 25.0,
        "max": {
          "c_factor": 1.1,
          "case_ref": "ZWARCIOWY_MAKS",
          "ib_ka": 9.467,
          "ikss_ka": 9.467,
          "ip_ka": 16.584,
          "ith_ka": 9.467,
          "kappa": 1.239,
          "rx_ratio": 0.5,
          "sk_mva": 245.97,
          "white_box_trace": [
            {
              "formula_latex": "Z_k = Z_1",
              "inputs": {
                "fault_node_id": "SEC_B",
                "short_circuit_type": "3F",
                "z1_ohm": {
                  "im": 0.9,
                  "re": 0.45000225000000016
                },
                "z2_ohm": {
                  "im": 0.9,
                  "re": 0.45000225000000016
                }
              },
              "key": "Zk",
              "notes": null,
              "result": {
                "r_ohm": 0.45000225000000016,
                "x_ohm": 0.9,
                "z_equiv_abs_ohm": 1.006231596107508,
                "z_equiv_ohm": {
                  "im": 0.9,
                  "re": 0.45000225000000016
                }
              },
              "substitution": "\\left(0.450002 + j 0.9\\right)",
              "substitution_latex": "\\left(0.450002 + j 0.9\\right)",
              "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
            },
            {
              "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
              "inputs": {
                "c_factor": 1.1,
                "un_v": 15000.0,
                "voltage_factor": 0.5773502691896258,
                "z_equiv_abs_ohm": 1.006231596107508
              },
              "key": "Ikss",
              "notes": null,
              "result": {
                "ikss_a": 9467.283156760483
              },
              "substitution": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{1.00623}",
              "substitution_latex": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{1.00623}",
              "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
            },
            {
              "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
              "inputs": {
                "r_ohm": 0.45000225000000016,
                "rx_ratio": 0.5000025000000001,
                "x_ohm": 0.9
              },
              "key": "kappa",
              "notes": null,
              "result": {
                "kappa": 1.238665916944934
              },
              "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500003}",
              "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500003}",
              "title": "Wsp\u00f3\u0142czynnik udaru"
            },
            {
              "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
              "inputs": {
                "ikss_a": 9467.283156760483,
                "kappa": 1.238665916944934
              },
              "key": "Ip",
              "notes": null,
              "result": {
                "ip_a": 16584.20097834179
              },
              "substitution": "1.23867 \\cdot \\sqrt{2} \\cdot 9467.28",
              "substitution_latex": "1.23867 \\cdot \\sqrt{2} \\cdot 9467.28",
              "title": "Pr\u0105d udarowy"
            },
            {
              "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
              "inputs": {
                "exp_factor": 1.5068989191779237e-07,
                "ikss_a": 9467.283156760483,
                "kappa": 1.238665916944934,
                "ta_s": 0.006366165892846347,
                "tb_s": 0.1
              },
              "key": "Ib",
              "notes": null,
              "result": {
                "ib_a": 9467.283156760488
              },
              "substitution": "9467.28 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
              "substitution_latex": "9467.28 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
              "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
            },
            {
              "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
              "inputs": {
                "ikss_a": 9467.283156760483,
                "tk_s": 1.0
              },
              "key": "Ith",
              "notes": null,
              "result": {
                "ith_a": 9467.283156760483
              },
              "substitution": "9467.28 \\cdot \\sqrt{1}",
              "substitution_latex": "9467.28 \\cdot \\sqrt{1}",
              "title": "Pr\u0105d zast\u0119pczy cieplny"
            },
            {
              "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
              "inputs": {
                "ikss_a": 9467.283156760483,
                "un_v": 15000.0
              },
              "key": "Sk",
              "notes": null,
              "result": {
                "sk_mva": 245.96723155725334
              },
              "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 9467.28 / 10^6",
              "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 9467.28 / 10^6",
              "title": "Moc zwarciowa"
            }
          ]
        },
        "min": {
          "c_factor": 0.95,
          "case_ref": "ZWARCIOWY_MIN",
          "ikss_ka": 8.176,
          "ith_ka": 8.176,
          "kappa": 1.239,
          "sk_mva": 212.43,
          "white_box_trace": [
            {
              "formula_latex": "Z_k = Z_1",
              "inputs": {
                "fault_node_id": "SEC_B",
                "short_circuit_type": "3F",
                "z1_ohm": {
                  "im": 0.9,
                  "re": 0.45000225000000016
                },
                "z2_ohm": {
                  "im": 0.9,
                  "re": 0.45000225000000016
                }
              },
              "key": "Zk",
              "notes": null,
              "result": {
                "r_ohm": 0.45000225000000016,
                "x_ohm": 0.9,
                "z_equiv_abs_ohm": 1.006231596107508,
                "z_equiv_ohm": {
                  "im": 0.9,
                  "re": 0.45000225000000016
                }
              },
              "substitution": "\\left(0.450002 + j 0.9\\right)",
              "substitution_latex": "\\left(0.450002 + j 0.9\\right)",
              "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
            },
            {
              "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
              "inputs": {
                "c_factor": 0.95,
                "un_v": 15000.0,
                "voltage_factor": 0.5773502691896258,
                "z_equiv_abs_ohm": 1.006231596107508
              },
              "key": "Ikss",
              "notes": null,
              "result": {
                "ikss_a": 8176.289999020418
              },
              "substitution": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{1.00623}",
              "substitution_latex": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{1.00623}",
              "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
            },
            {
              "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
              "inputs": {
                "r_ohm": 0.45000225000000016,
                "rx_ratio": 0.5000025000000001,
                "x_ohm": 0.9
              },
              "key": "kappa",
              "notes": null,
              "result": {
                "kappa": 1.238665916944934
              },
              "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500003}",
              "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500003}",
              "title": "Wsp\u00f3\u0142czynnik udaru"
            },
            {
              "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
              "inputs": {
                "ikss_a": 8176.289999020418,
                "kappa": 1.238665916944934
              },
              "key": "Ip",
              "notes": null,
              "result": {
                "ip_a": 14322.719026749728
              },
              "substitution": "1.23867 \\cdot \\sqrt{2} \\cdot 8176.29",
              "substitution_latex": "1.23867 \\cdot \\sqrt{2} \\cdot 8176.29",
              "title": "Pr\u0105d udarowy"
            },
            {
              "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
              "inputs": {
                "exp_factor": 1.5068989191779237e-07,
                "ikss_a": 8176.289999020418,
                "kappa": 1.238665916944934,
                "ta_s": 0.006366165892846347,
                "tb_s": 0.1
              },
              "key": "Ib",
              "notes": null,
              "result": {
                "ib_a": 8176.289999020423
              },
              "substitution": "8176.29 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
              "substitution_latex": "8176.29 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
              "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
            },
            {
              "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
              "inputs": {
                "ikss_a": 8176.289999020418,
                "tk_s": 1.0
              },
              "key": "Ith",
              "notes": null,
              "result": {
                "ith_a": 8176.289999020418
              },
              "substitution": "8176.29 \\cdot \\sqrt{1}",
              "substitution_latex": "8176.29 \\cdot \\sqrt{1}",
              "title": "Pr\u0105d zast\u0119pczy cieplny"
            },
            {
              "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
              "inputs": {
                "ikss_a": 8176.289999020418,
                "un_v": 15000.0
              },
              "key": "Sk",
              "notes": null,
              "result": {
                "sk_mva": 212.42624543580973
              },
              "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 8176.29 / 10^6",
              "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 8176.29 / 10^6",
              "title": "Moc zwarciowa"
            }
          ]
        },
        "un_kv": 15.0,
        "verification": {
          "icw_ka": 25.0,
          "ikss_max_ka": 9.467,
          "passed": true,
          "rule": "ikss_max_le_icw"
        }
      }
    },
    "enm_hash": "station-substrate/T4",
    "schema": "sld_short_circuit_companion_v1",
    "solver_method": "iec60909-3ph",
    "standard": "IEC 60909",
    "tk_s": 1.0
  }
};
