/**
 * GENERATED — DO NOT EDIT BY HAND.
 *
 * KROK 2 Runda 2a — PV OZE-source archetype companions (G1-G3). Produced by
 * running the FROZEN Newton-Raphson + IEC 60909 solvers (READ-ONLY, B-01) on
 * two-voltage OZE substrates with a REAL transformer + an IBG InverterSource
 * (IEC 60909-0:2016 §6.7 limited current). Regenerate with the module --write.
 *
 * Each carries: source meta (machine_type/technology/NC RfG class+mode/power
 * hierarchy), per-bus U + per-branch I/P/Q/S (generation = reverse export), and
 * per-bus Ik''max/min WITH the IBG limited contribution tagged (gate J: IBG is
 * NOT a synchronous machine). The renderer INTERPRETS — it never recomputes.
 */
import type { SldOzeArchetypeCompanion } from './ozeTypes';

export const OZE_ARCHETYPES_2A: Readonly<Record<string, SldOzeArchetypeCompanion>> = {
  "G1": {
    "archetype": "G1",
    "boundary": {
      "enm_connection_variant": "LV_BEHIND_STATION_TRANSFORMER",
      "metered": true,
      "on_bus_ref": "NN_BUS",
      "source_ref": "enm:Generator.connection_variant=LV_BEHIND_STATION_TRANSFORMER",
      "variant": "G-ZALICZNIK"
    },
    "case_ref_pf": "ROZPLYW_GEN_MAX",
    "case_ref_sc": "ZWARCIOWY_MAKS",
    "converged": true,
    "enm_hash": "oze-substrate/G1",
    "fields": [
      {
        "abb_cell": "CBC",
        "apparatus": [],
        "field_id": "g1-conn",
        "interface_protection": true,
        "kind": "POLE_PRZY\u0141\u0104CZENIOWE",
        "on_bus_ref": "NN_BUS",
        "port": null,
        "protection_codes": [
          "67",
          "67N",
          "81U",
          "81O",
          "df/dt",
          "27",
          "59",
          "59N",
          "anti-islanding"
        ],
        "role": "connection",
        "source_ref": "enm:Bay.bay_role=LINIA_OUT"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g1-src",
        "interface_protection": false,
        "kind": "PV",
        "on_bus_ref": "NN_BUS",
        "port": null,
        "protection_codes": [],
        "role": "source",
        "source_ref": "enm:Generator.gen_type=pv_inverter"
      }
    ],
    "pcc_bus_ref": "NN_BUS",
    "schema": "sld_oze_archetype_companion_v1",
    "short_circuit": {
      "buses": {
        "NN_BUS": {
          "bus_ref": "NN_BUS",
          "icw_ka": 25.0,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 16.017,
            "ikss_ka": 16.017,
            "ip_ka": 31.099,
            "ith_ka": 16.017,
            "kappa": 1.373,
            "rx_ratio": 0.3404,
            "sk_mva": 11.1,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "NN_BUS",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.0150961264465,
                    "re": 0.00513871041549
                  },
                  "z2_ohm": {
                    "im": 0.0150961264465,
                    "re": 0.00513871041549
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.00513871041549,
                  "x_ohm": 0.0150961264465,
                  "z_equiv_abs_ohm": 0.015946767021,
                  "z_equiv_ohm": {
                    "im": 0.0150961264465,
                    "re": 0.00513871041549
                  }
                },
                "substitution": "\\left(0.00513871 + j 0.0150961\\right)",
                "substitution_latex": "\\left(0.00513871 + j 0.0150961\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 1.1,
                  "un_v": 400.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.015946767021
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 16016.7354701
                },
                "substitution": "\\frac{1.1 \\cdot 400 \\cdot 0.57735}{0.0159468}",
                "substitution_latex": "\\frac{1.1 \\cdot 400 \\cdot 0.57735}{0.0159468}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.00513871041549,
                  "rx_ratio": 0.340399269555,
                  "x_ohm": 0.0150961264465
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.37296000951
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.340399}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.340399}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 16016.7354701,
                  "kappa": 1.37296000951
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 31099.0332271
                },
                "substitution": "1.37296 \\cdot \\sqrt{2} \\cdot 16016.7",
                "substitution_latex": "1.37296 \\cdot \\sqrt{2} \\cdot 16016.7",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 2.268155667e-05,
                  "ikss_a": 16016.7354701,
                  "kappa": 1.37296000951,
                  "ta_s": 0.00935107430165,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 16016.7354706
                },
                "substitution": "16016.7 \\cdot \\sqrt{1 + \\left((1.37296 - 1) \\cdot 2.26816e-05\\right)^2}",
                "substitution_latex": "16016.7 \\cdot \\sqrt{1 + \\left((1.37296 - 1) \\cdot 2.26816e-05\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 16016.7354701,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 16016.7354701
                },
                "substitution": "16016.7 \\cdot \\sqrt{1}",
                "substitution_latex": "16016.7 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 16016.7354701,
                  "un_v": 400.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 11.0967198422
                },
                "substitution": "\\sqrt{3} \\cdot 400 \\cdot 16016.7 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 400 \\cdot 16016.7 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 13.844,
            "ith_ka": 13.844,
            "kappa": 1.373,
            "sk_mva": 9.59,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "NN_BUS",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.0150961264465,
                    "re": 0.00513871041549
                  },
                  "z2_ohm": {
                    "im": 0.0150961264465,
                    "re": 0.00513871041549
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.00513871041549,
                  "x_ohm": 0.0150961264465,
                  "z_equiv_abs_ohm": 0.015946767021,
                  "z_equiv_ohm": {
                    "im": 0.0150961264465,
                    "re": 0.00513871041549
                  }
                },
                "substitution": "\\left(0.00513871 + j 0.0150961\\right)",
                "substitution_latex": "\\left(0.00513871 + j 0.0150961\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 0.95,
                  "un_v": 400.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.015946767021
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 13844.444616
                },
                "substitution": "\\frac{0.95 \\cdot 400 \\cdot 0.57735}{0.0159468}",
                "substitution_latex": "\\frac{0.95 \\cdot 400 \\cdot 0.57735}{0.0159468}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.00513871041549,
                  "rx_ratio": 0.340399269555,
                  "x_ohm": 0.0150961264465
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.37296000951
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.340399}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.340399}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 13844.444616,
                  "kappa": 1.37296000951
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 26881.1858652
                },
                "substitution": "1.37296 \\cdot \\sqrt{2} \\cdot 13844.4",
                "substitution_latex": "1.37296 \\cdot \\sqrt{2} \\cdot 13844.4",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 2.268155667e-05,
                  "ikss_a": 13844.444616,
                  "kappa": 1.37296000951,
                  "ta_s": 0.00935107430165,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 13844.4446165
                },
                "substitution": "13844.4 \\cdot \\sqrt{1 + \\left((1.37296 - 1) \\cdot 2.26816e-05\\right)^2}",
                "substitution_latex": "13844.4 \\cdot \\sqrt{1 + \\left((1.37296 - 1) \\cdot 2.26816e-05\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 13844.444616,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 13844.444616
                },
                "substitution": "13844.4 \\cdot \\sqrt{1}",
                "substitution_latex": "13844.4 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 13844.444616,
                  "un_v": 400.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 9.591712591
                },
                "substitution": "\\sqrt{3} \\cdot 400 \\cdot 13844.4 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 400 \\cdot 13844.4 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ik_contribution_ka": 0.087,
            "is_synchronous_machine": false,
            "machine_type": "IBG",
            "model": "IEC 60909 \u00a76.7 \u2014 \u017ar\u00f3d\u0142o pr\u0105dowe ograniczone (k\u00b7I_rated)"
          },
          "un_kv": 0.4,
          "verification": {
            "icw_ka": 25.0,
            "ikss_max_ka": 16.017,
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
            "ib_ka": 9.554,
            "ikss_ka": 9.554,
            "ip_ka": 16.736,
            "ith_ka": 9.554,
            "kappa": 1.239,
            "rx_ratio": 0.5,
            "sk_mva": 248.22,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "SN_BUS",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.9,
                    "re": 0.45000225
                  },
                  "z2_ohm": {
                    "im": 0.9,
                    "re": 0.45000225
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.45000225,
                  "x_ohm": 0.9,
                  "z_equiv_abs_ohm": 1.00623159611,
                  "z_equiv_ohm": {
                    "im": 0.9,
                    "re": 0.45000225
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
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 1.00623159611
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 9553.88569714
                },
                "substitution": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{1.00623}",
                "substitution_latex": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{1.00623}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.45000225,
                  "rx_ratio": 0.5000025,
                  "x_ohm": 0.9
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.23866591694
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500003}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500003}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 9553.88569714,
                  "kappa": 1.23866591694
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 16735.9059513
                },
                "substitution": "1.23867 \\cdot \\sqrt{2} \\cdot 9553.89",
                "substitution_latex": "1.23867 \\cdot \\sqrt{2} \\cdot 9553.89",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 1.50689891918e-07,
                  "ikss_a": 9553.88569714,
                  "kappa": 1.23866591694,
                  "ta_s": 0.00636616589285,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 9553.88569714
                },
                "substitution": "9553.89 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
                "substitution_latex": "9553.89 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 9553.88569714,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 9553.88569714
                },
                "substitution": "9553.89 \\cdot \\sqrt{1}",
                "substitution_latex": "9553.89 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 9553.88569714,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 248.217231557
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 9553.89 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 9553.89 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 8.263,
            "ith_ka": 8.263,
            "kappa": 1.239,
            "sk_mva": 214.68,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "SN_BUS",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.9,
                    "re": 0.45000225
                  },
                  "z2_ohm": {
                    "im": 0.9,
                    "re": 0.45000225
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.45000225,
                  "x_ohm": 0.9,
                  "z_equiv_abs_ohm": 1.00623159611,
                  "z_equiv_ohm": {
                    "im": 0.9,
                    "re": 0.45000225
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
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 1.00623159611
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 8262.8925394
                },
                "substitution": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{1.00623}",
                "substitution_latex": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{1.00623}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.45000225,
                  "rx_ratio": 0.5000025,
                  "x_ohm": 0.9
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.23866591694
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500003}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500003}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 8262.8925394,
                  "kappa": 1.23866591694
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 14474.4239997
                },
                "substitution": "1.23867 \\cdot \\sqrt{2} \\cdot 8262.89",
                "substitution_latex": "1.23867 \\cdot \\sqrt{2} \\cdot 8262.89",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 1.50689891918e-07,
                  "ikss_a": 8262.8925394,
                  "kappa": 1.23866591694,
                  "ta_s": 0.00636616589285,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 8262.8925394
                },
                "substitution": "8262.89 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
                "substitution_latex": "8262.89 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 8262.8925394,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 8262.8925394
                },
                "substitution": "8262.89 \\cdot \\sqrt{1}",
                "substitution_latex": "8262.89 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 8262.8925394,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 214.676245436
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 8262.89 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 8262.89 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ik_contribution_ka": 0.087,
            "is_synchronous_machine": false,
            "machine_type": "IBG",
            "model": "IEC 60909 \u00a76.7 \u2014 \u017ar\u00f3d\u0142o pr\u0105dowe ograniczone (k\u00b7I_rated)"
          },
          "un_kv": 15.0,
          "verification": {
            "icw_ka": 25.0,
            "ikss_max_ka": 9.554,
            "passed": true,
            "rule": "ikss_max_le_icw"
          }
        }
      },
      "standard": "IEC 60909"
    },
    "source": {
      "control_mode": "cos\u03c6=const",
      "grid_earthing": {
        "ik_1f_ka": 10.0,
        "imd_it_nn": false,
        "neutral_point": "bezpo\u015brednie (TN)",
        "note_pl": "nN TN: doziemienie z pr\u0105dem (uziemienie bezpo\u015brednie OSD) \u2014 wy\u0142\u0105czane zw\u0142ocznie",
        "source_ref": "norma:PN-EN_60909_doziemienie;OSD:sie\u0107_nN_TN"
      },
      "machine_type": "IBG",
      "nc_rfg_class": "A",
      "power_hierarchy": {
        "p_osiagalna_kw": 45.0,
        "p_przylacz_kw": 50.0,
        "p_zainst_kw": 55.0,
        "pn_ac_kw": 50.0,
        "valid": true
      },
      "protection_codes": [
        "67",
        "67N",
        "81U",
        "81O",
        "df/dt",
        "27",
        "59",
        "59N",
        "anti-islanding"
      ],
      "technology": "PV",
      "withstand": {
        "nn_idyn_ka": 52.5,
        "sn_idyn_ka": 63.0,
        "source_ref": "karta:rozdzielnica_nN"
      }
    },
    "voltage_flow": {
      "branches": {
        "sr/branch/in": {
          "branch_ref": "sr/branch/in",
          "direction": "reverse",
          "i_a": 1.36,
          "loading_percent": 0.22,
          "p_mw": -0.035,
          "q_mvar": 0.004,
          "s_mva": 0.0352
        },
        "sr/branch/tr": {
          "branch_ref": "sr/branch/tr",
          "direction": "reverse",
          "i_a": 1.36,
          "loading_percent": null,
          "p_mw": -0.035,
          "q_mvar": 0.004,
          "s_mva": 0.0352
        }
      },
      "buses": {
        "NN_BUS": {
          "bus_ref": "NN_BUS",
          "deviation_percent": 0.005,
          "u_kv": 0.4,
          "u_pu": 1.00005,
          "un_kv": 0.4
        },
        "SN_BUS": {
          "bus_ref": "SN_BUS",
          "deviation_percent": 0.005,
          "u_kv": 15.0008,
          "u_pu": 1.00005,
          "un_kv": 15.0
        }
      }
    }
  },
  "G2": {
    "archetype": "G2",
    "boundary": {
      "enm_connection_variant": "DEDICATED_MV_CONNECTION",
      "metered": true,
      "on_bus_ref": "PCC_SN",
      "source_ref": "enm:Generator.connection_variant=DEDICATED_MV_CONNECTION",
      "variant": "G-ZKSN"
    },
    "case_ref_pf": "ROZPLYW_GEN_MAX",
    "case_ref_sc": "ZWARCIOWY_MAKS",
    "converged": true,
    "enm_hash": "oze-substrate/G2",
    "fields": [
      {
        "abb_cell": "CBC",
        "apparatus": [],
        "field_id": "g2-conn",
        "interface_protection": true,
        "kind": "POLE_PRZY\u0141\u0104CZENIOWE",
        "on_bus_ref": "PCC_SN",
        "port": null,
        "protection_codes": [
          "67",
          "67N",
          "81U",
          "81O",
          "df/dt",
          "27",
          "59",
          "59N",
          "anti-islanding"
        ],
        "role": "connection",
        "source_ref": "enm:Bay.bay_role=LINIA_OUT"
      },
      {
        "abb_cell": "SDM-V",
        "apparatus": [],
        "field_id": "g2-meter",
        "interface_protection": false,
        "kind": "POLE_POMIAROWE",
        "on_bus_ref": "PCC_SN",
        "port": null,
        "protection_codes": [],
        "role": "measurement",
        "source_ref": "enm:Measurement.purpose=metering"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g2-src",
        "interface_protection": false,
        "kind": "PV",
        "on_bus_ref": "NN_COLLECTOR",
        "port": null,
        "protection_codes": [],
        "role": "source",
        "source_ref": "enm:Generator.gen_type=pv_inverter"
      }
    ],
    "pcc_bus_ref": "PCC_SN",
    "schema": "sld_oze_archetype_companion_v1",
    "short_circuit": {
      "buses": {
        "NN_COLLECTOR": {
          "bus_ref": "NN_COLLECTOR",
          "icw_ka": 31.5,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 28.016,
            "ikss_ka": 26.511,
            "ip_ka": 71.695,
            "ith_ka": 26.511,
            "kappa": 1.912,
            "rx_ratio": 0.0313,
            "sk_mva": 18.37,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "NN_COLLECTOR",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.01024,
                    "re": 0.0003200016
                  },
                  "z2_ohm": {
                    "im": 0.01024,
                    "re": 0.0003200016
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.0003200016,
                  "x_ohm": 0.01024,
                  "z_equiv_abs_ohm": 0.0102449988299,
                  "z_equiv_ohm": {
                    "im": 0.01024,
                    "re": 0.0003200016
                  }
                },
                "substitution": "\\left(0.000320002 + j 0.01024\\right)",
                "substitution_latex": "\\left(0.000320002 + j 0.01024\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 1.1,
                  "un_v": 400.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.0102449988299
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 26510.6451319
                },
                "substitution": "\\frac{1.1 \\cdot 400 \\cdot 0.57735}{0.010245}",
                "substitution_latex": "\\frac{1.1 \\cdot 400 \\cdot 0.57735}{0.010245}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.0003200016,
                  "rx_ratio": 0.03125015625,
                  "x_ohm": 0.01024
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.91229973589
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.0312502}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.0312502}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 26510.6451319,
                  "kappa": 1.91229973589
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 71695.3945751
                },
                "substitution": "1.9123 \\cdot \\sqrt{2} \\cdot 26510.6",
                "substitution_latex": "1.9123 \\cdot \\sqrt{2} \\cdot 26510.6",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.374653899822,
                  "ikss_a": 26510.6451319,
                  "kappa": 1.91229973589,
                  "ta_s": 0.101858654286,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 28016.4336275
                },
                "substitution": "26510.6 \\cdot \\sqrt{1 + \\left((1.9123 - 1) \\cdot 0.374654\\right)^2}",
                "substitution_latex": "26510.6 \\cdot \\sqrt{1 + \\left((1.9123 - 1) \\cdot 0.374654\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 26510.6451319,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 26510.6451319
                },
                "substitution": "26510.6 \\cdot \\sqrt{1}",
                "substitution_latex": "26510.6 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 26510.6451319,
                  "un_v": 400.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 18.3671137239
                },
                "substitution": "\\sqrt{3} \\cdot 400 \\cdot 26510.6 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 400 \\cdot 26510.6 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 23.129,
            "ith_ka": 23.129,
            "kappa": 1.912,
            "sk_mva": 16.02,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "NN_COLLECTOR",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.01024,
                    "re": 0.0003200016
                  },
                  "z2_ohm": {
                    "im": 0.01024,
                    "re": 0.0003200016
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.0003200016,
                  "x_ohm": 0.01024,
                  "z_equiv_abs_ohm": 0.0102449988299,
                  "z_equiv_ohm": {
                    "im": 0.01024,
                    "re": 0.0003200016
                  }
                },
                "substitution": "\\left(0.000320002 + j 0.01024\\right)",
                "substitution_latex": "\\left(0.000320002 + j 0.01024\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 0.95,
                  "un_v": 400.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.0102449988299
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 23129.3840184
                },
                "substitution": "\\frac{0.95 \\cdot 400 \\cdot 0.57735}{0.010245}",
                "substitution_latex": "\\frac{0.95 \\cdot 400 \\cdot 0.57735}{0.010245}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.0003200016,
                  "rx_ratio": 0.03125015625,
                  "x_ohm": 0.01024
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.91229973589
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.0312502}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.0312502}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 23129.3840184,
                  "kappa": 1.91229973589
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 62551.1112697
                },
                "substitution": "1.9123 \\cdot \\sqrt{2} \\cdot 23129.4",
                "substitution_latex": "1.9123 \\cdot \\sqrt{2} \\cdot 23129.4",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.374653899822,
                  "ikss_a": 23129.3840184,
                  "kappa": 1.91229973589,
                  "ta_s": 0.101858654286,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 24443.1189423
                },
                "substitution": "23129.4 \\cdot \\sqrt{1 + \\left((1.9123 - 1) \\cdot 0.374654\\right)^2}",
                "substitution_latex": "23129.4 \\cdot \\sqrt{1 + \\left((1.9123 - 1) \\cdot 0.374654\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 23129.3840184,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 23129.3840184
                },
                "substitution": "23129.4 \\cdot \\sqrt{1}",
                "substitution_latex": "23129.4 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 23129.3840184,
                  "un_v": 400.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 16.024507307
                },
                "substitution": "\\sqrt{3} \\cdot 400 \\cdot 23129.4 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 400 \\cdot 23129.4 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ik_contribution_ka": 1.715,
            "is_synchronous_machine": false,
            "machine_type": "IBG",
            "model": "IEC 60909 \u00a76.7 \u2014 \u017ar\u00f3d\u0142o pr\u0105dowe ograniczone (k\u00b7I_rated)"
          },
          "un_kv": 0.4,
          "verification": {
            "icw_ka": 31.5,
            "ikss_max_ka": 26.511,
            "passed": true,
            "rule": "ikss_max_le_icw"
          }
        },
        "PCC_SN": {
          "bus_ref": "PCC_SN",
          "icw_ka": 25.0,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 11.182,
            "ikss_ka": 11.182,
            "ip_ka": 19.588,
            "ith_ka": 11.182,
            "kappa": 1.239,
            "rx_ratio": 0.5,
            "sk_mva": 290.52,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "PCC_SN",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.9,
                    "re": 0.45000225
                  },
                  "z2_ohm": {
                    "im": 0.9,
                    "re": 0.45000225
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.45000225,
                  "x_ohm": 0.9,
                  "z_equiv_abs_ohm": 1.00623159611,
                  "z_equiv_ohm": {
                    "im": 0.9,
                    "re": 0.45000225
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
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 1.00623159611
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 11182.0134563
                },
                "substitution": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{1.00623}",
                "substitution_latex": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{1.00623}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.45000225,
                  "rx_ratio": 0.5000025,
                  "x_ohm": 0.9
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.23866591694
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500003}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500003}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 11182.0134563,
                  "kappa": 1.23866591694
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 19587.9594421
                },
                "substitution": "1.23867 \\cdot \\sqrt{2} \\cdot 11182",
                "substitution_latex": "1.23867 \\cdot \\sqrt{2} \\cdot 11182",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 1.50689891918e-07,
                  "ikss_a": 11182.0134563,
                  "kappa": 1.23866591694,
                  "ta_s": 0.00636616589285,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 11182.0134563
                },
                "substitution": "11182 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
                "substitution_latex": "11182 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 11182.0134563,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 11182.0134563
                },
                "substitution": "11182 \\cdot \\sqrt{1}",
                "substitution_latex": "11182 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 11182.0134563,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 290.517231557
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 11182 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 11182 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 9.891,
            "ith_ka": 9.891,
            "kappa": 1.239,
            "sk_mva": 256.98,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "PCC_SN",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.9,
                    "re": 0.45000225
                  },
                  "z2_ohm": {
                    "im": 0.9,
                    "re": 0.45000225
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.45000225,
                  "x_ohm": 0.9,
                  "z_equiv_abs_ohm": 1.00623159611,
                  "z_equiv_ohm": {
                    "im": 0.9,
                    "re": 0.45000225
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
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 1.00623159611
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 9891.02029851
                },
                "substitution": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{1.00623}",
                "substitution_latex": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{1.00623}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.45000225,
                  "rx_ratio": 0.5000025,
                  "x_ohm": 0.9
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.23866591694
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500003}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500003}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 9891.02029851,
                  "kappa": 1.23866591694
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 17326.4774905
                },
                "substitution": "1.23867 \\cdot \\sqrt{2} \\cdot 9891.02",
                "substitution_latex": "1.23867 \\cdot \\sqrt{2} \\cdot 9891.02",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 1.50689891918e-07,
                  "ikss_a": 9891.02029851,
                  "kappa": 1.23866591694,
                  "ta_s": 0.00636616589285,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 9891.02029851
                },
                "substitution": "9891.02 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
                "substitution_latex": "9891.02 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 9891.02029851,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 9891.02029851
                },
                "substitution": "9891.02 \\cdot \\sqrt{1}",
                "substitution_latex": "9891.02 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 9891.02029851,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 256.976245436
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 9891.02 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 9891.02 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ik_contribution_ka": 1.715,
            "is_synchronous_machine": false,
            "machine_type": "IBG",
            "model": "IEC 60909 \u00a76.7 \u2014 \u017ar\u00f3d\u0142o pr\u0105dowe ograniczone (k\u00b7I_rated)"
          },
          "un_kv": 15.0,
          "verification": {
            "icw_ka": 25.0,
            "ikss_max_ka": 11.182,
            "passed": true,
            "rule": "ikss_max_le_icw"
          }
        }
      },
      "standard": "IEC 60909"
    },
    "source": {
      "control_mode": "Q(U)",
      "machine_type": "IBG",
      "nc_rfg_class": "C",
      "power_hierarchy": {
        "p_osiagalna_kw": 900.0,
        "p_przylacz_kw": 990.0,
        "p_zainst_kw": 1100.0,
        "pn_ac_kw": 990.0,
        "valid": true
      },
      "protection_codes": [
        "67",
        "67N",
        "81U",
        "81O",
        "df/dt",
        "27",
        "59",
        "59N",
        "anti-islanding"
      ],
      "technology": "PV"
    },
    "voltage_flow": {
      "branches": {
        "sr/branch/in": {
          "branch_ref": "sr/branch/in",
          "direction": "reverse",
          "i_a": 34.23,
          "loading_percent": 5.43,
          "p_mw": -0.8894,
          "q_mvar": 0.0032,
          "s_mva": 0.8894
        },
        "sr/branch/tr": {
          "branch_ref": "sr/branch/tr",
          "direction": "reverse",
          "i_a": 34.23,
          "loading_percent": null,
          "p_mw": -0.891,
          "q_mvar": 0.0,
          "s_mva": 0.891
        }
      },
      "buses": {
        "NN_COLLECTOR": {
          "bus_ref": "NN_COLLECTOR",
          "deviation_percent": 0.177,
          "u_kv": 0.4007,
          "u_pu": 1.00177,
          "un_kv": 0.4
        },
        "PCC_SN": {
          "bus_ref": "PCC_SN",
          "deviation_percent": 0.177,
          "u_kv": 15.0266,
          "u_pu": 1.00177,
          "un_kv": 15.0
        }
      }
    }
  },
  "G3": {
    "archetype": "G3",
    "boundary": {
      "enm_connection_variant": "DEDICATED_MV_CONNECTION",
      "metered": true,
      "on_bus_ref": "PCC_SN",
      "source_ref": "enm:Generator.connection_variant=DEDICATED_MV_CONNECTION",
      "variant": "G-ZKSN"
    },
    "case_ref_pf": "ROZPLYW_GEN_MAX",
    "case_ref_sc": "ZWARCIOWY_MAKS",
    "converged": true,
    "enm_hash": "oze-substrate/G3",
    "fields": [
      {
        "abb_cell": "CBC",
        "apparatus": [],
        "field_id": "g3-conn",
        "interface_protection": true,
        "kind": "POLE_PRZY\u0141\u0104CZENIOWE",
        "on_bus_ref": "PCC_SN",
        "port": null,
        "protection_codes": [
          "67",
          "67N",
          "81U",
          "81O",
          "df/dt",
          "27",
          "59",
          "59N",
          "anti-islanding"
        ],
        "role": "connection",
        "source_ref": "enm:Bay.bay_role=LINIA_OUT"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g3-src",
        "interface_protection": false,
        "kind": "PV",
        "on_bus_ref": "PV_SN",
        "port": null,
        "protection_codes": [],
        "role": "source",
        "source_ref": "enm:Generator.gen_type=pv_inverter"
      }
    ],
    "pcc_bus_ref": "PCC_SN",
    "schema": "sld_oze_archetype_companion_v1",
    "short_circuit": {
      "buses": {
        "PCC_SN": {
          "bus_ref": "PCC_SN",
          "icw_ka": 25.0,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 9.537,
            "ikss_ka": 9.537,
            "ip_ka": 16.706,
            "ith_ka": 9.537,
            "kappa": 1.239,
            "rx_ratio": 0.5,
            "sk_mva": 247.77,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "PCC_SN",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.9,
                    "re": 0.45000225
                  },
                  "z2_ohm": {
                    "im": 0.9,
                    "re": 0.45000225
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.45000225,
                  "x_ohm": 0.9,
                  "z_equiv_abs_ohm": 1.00623159611,
                  "z_equiv_ohm": {
                    "im": 0.9,
                    "re": 0.45000225
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
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 1.00623159611
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 9536.56518906
                },
                "substitution": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{1.00623}",
                "substitution_latex": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{1.00623}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.45000225,
                  "rx_ratio": 0.5000025,
                  "x_ohm": 0.9
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.23866591694
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500003}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500003}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 9536.56518906,
                  "kappa": 1.23866591694
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 16705.5649567
                },
                "substitution": "1.23867 \\cdot \\sqrt{2} \\cdot 9536.57",
                "substitution_latex": "1.23867 \\cdot \\sqrt{2} \\cdot 9536.57",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 1.50689891918e-07,
                  "ikss_a": 9536.56518906,
                  "kappa": 1.23866591694,
                  "ta_s": 0.00636616589285,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 9536.56518906
                },
                "substitution": "9536.57 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
                "substitution_latex": "9536.57 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 9536.56518906,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 9536.56518906
                },
                "substitution": "9536.57 \\cdot \\sqrt{1}",
                "substitution_latex": "9536.57 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 9536.56518906,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 247.767231557
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 9536.57 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 9536.57 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 8.246,
            "ith_ka": 8.246,
            "kappa": 1.239,
            "sk_mva": 214.23,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "PCC_SN",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.9,
                    "re": 0.45000225
                  },
                  "z2_ohm": {
                    "im": 0.9,
                    "re": 0.45000225
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.45000225,
                  "x_ohm": 0.9,
                  "z_equiv_abs_ohm": 1.00623159611,
                  "z_equiv_ohm": {
                    "im": 0.9,
                    "re": 0.45000225
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
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 1.00623159611
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 8245.57203132
                },
                "substitution": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{1.00623}",
                "substitution_latex": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{1.00623}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.45000225,
                  "rx_ratio": 0.5000025,
                  "x_ohm": 0.9
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.23866591694
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500003}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500003}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 8245.57203132,
                  "kappa": 1.23866591694
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 14444.0830051
                },
                "substitution": "1.23867 \\cdot \\sqrt{2} \\cdot 8245.57",
                "substitution_latex": "1.23867 \\cdot \\sqrt{2} \\cdot 8245.57",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 1.50689891918e-07,
                  "ikss_a": 8245.57203132,
                  "kappa": 1.23866591694,
                  "ta_s": 0.00636616589285,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 8245.57203132
                },
                "substitution": "8245.57 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
                "substitution_latex": "8245.57 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 8245.57203132,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 8245.57203132
                },
                "substitution": "8245.57 \\cdot \\sqrt{1}",
                "substitution_latex": "8245.57 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 8245.57203132,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 214.226245436
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 8245.57 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 8245.57 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ik_contribution_ka": 0.069,
            "is_synchronous_machine": false,
            "machine_type": "IBG",
            "model": "IEC 60909 \u00a76.7 \u2014 \u017ar\u00f3d\u0142o pr\u0105dowe ograniczone (k\u00b7I_rated)"
          },
          "un_kv": 15.0,
          "verification": {
            "icw_ka": 25.0,
            "ikss_max_ka": 9.537,
            "passed": true,
            "rule": "ikss_max_le_icw"
          }
        },
        "PV_SN": {
          "bus_ref": "PV_SN",
          "icw_ka": 25.0,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 7.352,
            "ikss_ka": 7.352,
            "ip_ka": 12.878,
            "ith_ka": 7.352,
            "kappa": 1.239,
            "rx_ratio": 0.5,
            "sk_mva": 191.01,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "PV_SN",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 1.17,
                    "re": 0.58500225
                  },
                  "z2_ohm": {
                    "im": 1.17,
                    "re": 0.58500225
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.58500225,
                  "x_ohm": 1.17,
                  "z_equiv_abs_ohm": 1.30810077307,
                  "z_equiv_ohm": {
                    "im": 1.17,
                    "re": 0.58500225
                  }
                },
                "substitution": "\\left(0.585002 + j 1.17\\right)",
                "substitution_latex": "\\left(0.585002 + j 1.17\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 1.1,
                  "un_v": 15000.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 1.30810077307
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 7351.80921809
                },
                "substitution": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{1.3081}",
                "substitution_latex": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{1.3081}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.58500225,
                  "rx_ratio": 0.500001923077,
                  "x_ohm": 1.17
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.23866629541
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500002}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500002}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 7351.80921809,
                  "kappa": 1.23866629541
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 12878.4485328
                },
                "substitution": "1.23867 \\cdot \\sqrt{2} \\cdot 7351.81",
                "substitution_latex": "1.23867 \\cdot \\sqrt{2} \\cdot 7351.81",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 1.50692623132e-07,
                  "ikss_a": 7351.80921809,
                  "kappa": 1.23866629541,
                  "ta_s": 0.00636617323839,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 7351.80921809
                },
                "substitution": "7351.81 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.50693e-07\\right)^2}",
                "substitution_latex": "7351.81 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.50693e-07\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 7351.80921809,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 7351.80921809
                },
                "substitution": "7351.81 \\cdot \\sqrt{1}",
                "substitution_latex": "7351.81 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 7351.80921809,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 191.005606399
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 7351.81 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 7351.81 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 6.359,
            "ith_ka": 6.359,
            "kappa": 1.239,
            "sk_mva": 165.2,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "PV_SN",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 1.17,
                    "re": 0.58500225
                  },
                  "z2_ohm": {
                    "im": 1.17,
                    "re": 0.58500225
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.58500225,
                  "x_ohm": 1.17,
                  "z_equiv_abs_ohm": 1.30810077307,
                  "z_equiv_ohm": {
                    "im": 1.17,
                    "re": 0.58500225
                  }
                },
                "substitution": "\\left(0.585002 + j 1.17\\right)",
                "substitution_latex": "\\left(0.585002 + j 1.17\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 0.95,
                  "un_v": 15000.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 1.30810077307
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 6358.73732912
                },
                "substitution": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{1.3081}",
                "substitution_latex": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{1.3081}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.58500225,
                  "rx_ratio": 0.500001923077,
                  "x_ohm": 1.17
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.23866629541
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500002}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500002}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 6358.73732912,
                  "kappa": 1.23866629541
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 11138.8460986
                },
                "substitution": "1.23867 \\cdot \\sqrt{2} \\cdot 6358.74",
                "substitution_latex": "1.23867 \\cdot \\sqrt{2} \\cdot 6358.74",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 1.50692623132e-07,
                  "ikss_a": 6358.73732912,
                  "kappa": 1.23866629541,
                  "ta_s": 0.00636617323839,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 6358.73732912
                },
                "substitution": "6358.74 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.50693e-07\\right)^2}",
                "substitution_latex": "6358.74 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.50693e-07\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 6358.73732912,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 6358.73732912
                },
                "substitution": "6358.74 \\cdot \\sqrt{1}",
                "substitution_latex": "6358.74 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 6358.73732912,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 165.20484189
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 6358.74 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 6358.74 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ik_contribution_ka": 0.069,
            "is_synchronous_machine": false,
            "machine_type": "IBG",
            "model": "IEC 60909 \u00a76.7 \u2014 \u017ar\u00f3d\u0142o pr\u0105dowe ograniczone (k\u00b7I_rated)"
          },
          "un_kv": 15.0,
          "verification": {
            "icw_ka": 25.0,
            "ikss_max_ka": 7.352,
            "passed": true,
            "rule": "ikss_max_le_icw"
          }
        }
      },
      "standard": "IEC 60909"
    },
    "source": {
      "control_mode": "cos\u03c6(P)",
      "machine_type": "IBG",
      "nc_rfg_class": "C",
      "power_hierarchy": {
        "p_osiagalna_kw": 1350.0,
        "p_przylacz_kw": 1500.0,
        "p_zainst_kw": 1650.0,
        "pn_ac_kw": 1500.0,
        "valid": true
      },
      "protection_codes": [
        "67",
        "67N",
        "81U",
        "81O",
        "df/dt",
        "27",
        "59",
        "59N",
        "anti-islanding"
      ],
      "technology": "PV"
    },
    "voltage_flow": {
      "branches": {
        "sr/branch/in": {
          "branch_ref": "sr/branch/in",
          "direction": "reverse",
          "i_a": 51.78,
          "loading_percent": 8.22,
          "p_mw": -1.3453,
          "q_mvar": 0.0094,
          "s_mva": 1.3453
        },
        "sr/branch/out": {
          "branch_ref": "sr/branch/out",
          "direction": "reverse",
          "i_a": 51.78,
          "loading_percent": 8.22,
          "p_mw": -1.3489,
          "q_mvar": 0.0022,
          "s_mva": 1.3489
        }
      },
      "buses": {
        "PCC_SN": {
          "bus_ref": "PCC_SN",
          "deviation_percent": 0.267,
          "u_kv": 15.04,
          "u_pu": 1.00267,
          "un_kv": 15.0
        },
        "PV_SN": {
          "bus_ref": "PV_SN",
          "deviation_percent": 0.347,
          "u_kv": 15.0521,
          "u_pu": 1.00347,
          "un_kv": 15.0
        }
      }
    }
  },
  "G4-PVBESS-AC": {
    "archetype": "G4-PVBESS-AC",
    "boundary": {
      "enm_connection_variant": "DEDICATED_MV_CONNECTION",
      "metered": true,
      "on_bus_ref": "SN_PCC",
      "source_ref": "enm:Generator.connection_variant=DEDICATED_MV_CONNECTION",
      "variant": "G-ZKSN"
    },
    "case_ref_pf": "ROZPLYW_GEN_MAX",
    "case_ref_sc": "ZWARCIOWY_MAKS",
    "converged": true,
    "enm_hash": "oze-substrate/G4-PVBESS-AC",
    "fields": [
      {
        "abb_cell": "CBC",
        "apparatus": [
          {
            "catalog": null,
            "designation": "Q1 (od\u0142\u0105cznik szynowy)",
            "device_ref": "g4ac-line/ds",
            "kind": "DS",
            "placement": "UPSTREAM",
            "source_ref": "enm:BayPrimaryDevice.kind=DS"
          },
          {
            "catalog": null,
            "designation": "Q0 (wy\u0142\u0105cznik SN)",
            "device_ref": "g4ac-line/cb",
            "kind": "CB",
            "placement": "MIDSTREAM",
            "source_ref": "enm:BayPrimaryDevice.kind=CB"
          },
          {
            "catalog": null,
            "designation": "przek\u0142adnik pr\u0105dowy",
            "device_ref": "g4ac-line/ct",
            "kind": "CT",
            "placement": "MIDSTREAM",
            "source_ref": "std:IEC_61869_CT"
          },
          {
            "catalog": null,
            "designation": "przek\u0142adnik napi\u0119ciowy",
            "device_ref": "g4ac-line/vt",
            "kind": "VT",
            "placement": "OFF_PATH",
            "source_ref": "std:IEC_61869_VT"
          },
          {
            "catalog": null,
            "designation": "ogranicznik przepi\u0119\u0107",
            "device_ref": "g4ac-line/sa",
            "kind": "SURGE_ARRESTER",
            "placement": "OFF_PATH",
            "source_ref": "enm:BayPrimaryDevice.kind=SURGE_ARRESTER"
          },
          {
            "catalog": null,
            "designation": "g\u0142owica kablowa",
            "device_ref": "g4ac-line/head",
            "kind": "CABLE_HEAD",
            "placement": "DOWNSTREAM",
            "source_ref": "enm:BayPrimaryDevice.kind=CABLE_HEAD"
          },
          {
            "catalog": null,
            "designation": "uziemnik",
            "device_ref": "g4ac-line/es",
            "kind": "ES",
            "placement": "GROUND_BRANCH",
            "source_ref": "enm:BayPrimaryDevice.kind=ES"
          }
        ],
        "field_id": "g4ac-line",
        "interface_protection": true,
        "kind": "POLE LINIOWE SN (przy\u0142\u0105cze)",
        "on_bus_ref": "SN_PCC",
        "port": {
          "cable": "kabel SN do OSD (typ wg projektu)",
          "entry_side": "BOK-L",
          "kind": "sn_input",
          "nominal_voltage_kv": 15.0,
          "occupied_by": "seg/kabel-osd",
          "port_id": "g4ac-line/port",
          "source_ref": "enm:Port.kind=sn_input;std:przylacze_SN"
        },
        "protection_codes": [
          "67",
          "67N",
          "81U",
          "81O",
          "df/dt",
          "27",
          "59",
          "59N",
          "anti-islanding"
        ],
        "role": "connection",
        "source_ref": "enm:Bay.bay_role=LINIA_OUT;std:IEC_62271_pole_liniowe"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g4ac-tr",
        "interface_protection": false,
        "kind": "POLE TRAFO \u00b7 2.50 MVA \u00b7 15/0.8 kV",
        "on_bus_ref": "SN_PCC",
        "port": null,
        "protection_codes": [],
        "role": "transformer",
        "source_ref": "enm:Bay.bay_role=TRANSFORMATOR;std:pole_trafo_wspolny"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g4ac-pv1",
        "interface_protection": false,
        "kind": "FALOWNIK PV 1 \u00b7 333 kW",
        "on_bus_ref": "NN",
        "port": null,
        "protection_codes": [],
        "role": "source",
        "source_ref": "enm:Generator.gen_type=pv_inverter;std:falownik_1"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g4ac-pv2",
        "interface_protection": false,
        "kind": "FALOWNIK PV 2 \u00b7 333 kW",
        "on_bus_ref": "NN",
        "port": null,
        "protection_codes": [],
        "role": "source",
        "source_ref": "enm:Generator.gen_type=pv_inverter;std:falownik_2"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g4ac-pv3",
        "interface_protection": false,
        "kind": "FALOWNIK PV 3 \u00b7 333 kW",
        "on_bus_ref": "NN",
        "port": null,
        "protection_codes": [],
        "role": "source",
        "source_ref": "enm:Generator.gen_type=pv_inverter;std:falownik_3"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g4ac-pcs1",
        "interface_protection": false,
        "kind": "PCS BESS 1 \u00b7 500 kW (2-kier.)",
        "on_bus_ref": "NN",
        "port": null,
        "protection_codes": [],
        "role": "source",
        "source_ref": "enm:Generator.gen_type=bess;std:pcs_1"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g4ac-pcs2",
        "interface_protection": false,
        "kind": "PCS BESS 2 \u00b7 500 kW (2-kier.)",
        "on_bus_ref": "NN",
        "port": null,
        "protection_codes": [],
        "role": "source",
        "source_ref": "enm:Generator.gen_type=bess;std:pcs_2"
      }
    ],
    "pcc_bus_ref": "SN_PCC",
    "schema": "sld_oze_archetype_companion_v1",
    "short_circuit": {
      "buses": {
        "NN": {
          "bus_ref": "NN",
          "icw_ka": 50.0,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 29.625,
            "ikss_ka": 29.625,
            "ip_ka": 64.629,
            "ith_ka": 29.625,
            "kappa": 1.543,
            "rx_ratio": 0.2096,
            "sk_mva": 41.05,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "NN",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.0178272999111,
                    "re": 0.00373596934321
                  },
                  "z2_ohm": {
                    "im": 0.0178272999111,
                    "re": 0.00373596934321
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.00373596934321,
                  "x_ohm": 0.0178272999111,
                  "z_equiv_abs_ohm": 0.0182145570644,
                  "z_equiv_ohm": {
                    "im": 0.0178272999111,
                    "re": 0.00373596934321
                  }
                },
                "substitution": "\\left(0.00373597 + j 0.0178273\\right)",
                "substitution_latex": "\\left(0.00373597 + j 0.0178273\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 1.1,
                  "un_v": 800.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.0182145570644
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 29624.7116513
                },
                "substitution": "\\frac{1.1 \\cdot 800 \\cdot 0.57735}{0.0182146}",
                "substitution_latex": "\\frac{1.1 \\cdot 800 \\cdot 0.57735}{0.0182146}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.00373596934321,
                  "rx_ratio": 0.209564508469,
                  "x_ohm": 0.0178272999111
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.54262231193
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.209565}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.209565}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 29624.7116513,
                  "kappa": 1.54262231193
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 64629.1937705
                },
                "substitution": "1.54262 \\cdot \\sqrt{2} \\cdot 29624.7",
                "substitution_latex": "1.54262 \\cdot \\sqrt{2} \\cdot 29624.7",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.00138277462213,
                  "ikss_a": 29624.7116513,
                  "kappa": 1.54262231193,
                  "ta_s": 0.015189112341,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 29624.7199905
                },
                "substitution": "29624.7 \\cdot \\sqrt{1 + \\left((1.54262 - 1) \\cdot 0.00138277\\right)^2}",
                "substitution_latex": "29624.7 \\cdot \\sqrt{1 + \\left((1.54262 - 1) \\cdot 0.00138277\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 29624.7116513,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 29624.7116513
                },
                "substitution": "29624.7 \\cdot \\sqrt{1}",
                "substitution_latex": "29624.7 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 29624.7116513,
                  "un_v": 800.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 41.0492045918
                },
                "substitution": "\\sqrt{3} \\cdot 800 \\cdot 29624.7 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 800 \\cdot 29624.7 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 25.821,
            "ith_ka": 25.821,
            "kappa": 1.543,
            "sk_mva": 35.78,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "NN",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.0178272999111,
                    "re": 0.00373596934321
                  },
                  "z2_ohm": {
                    "im": 0.0178272999111,
                    "re": 0.00373596934321
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.00373596934321,
                  "x_ohm": 0.0178272999111,
                  "z_equiv_abs_ohm": 0.0182145570644,
                  "z_equiv_ohm": {
                    "im": 0.0178272999111,
                    "re": 0.00373596934321
                  }
                },
                "substitution": "\\left(0.00373597 + j 0.0178273\\right)",
                "substitution_latex": "\\left(0.00373597 + j 0.0178273\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 0.95,
                  "un_v": 800.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.0182145570644
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 25821.0488965
                },
                "substitution": "\\frac{0.95 \\cdot 800 \\cdot 0.57735}{0.0182146}",
                "substitution_latex": "\\frac{0.95 \\cdot 800 \\cdot 0.57735}{0.0182146}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.00373596934321,
                  "rx_ratio": 0.209564508469,
                  "x_ohm": 0.0178272999111
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.54262231193
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.209565}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.209565}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 25821.0488965,
                  "kappa": 1.54262231193
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 56331.1330124
                },
                "substitution": "1.54262 \\cdot \\sqrt{2} \\cdot 25821",
                "substitution_latex": "1.54262 \\cdot \\sqrt{2} \\cdot 25821",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.00138277462213,
                  "ikss_a": 25821.0488965,
                  "kappa": 1.54262231193,
                  "ta_s": 0.015189112341,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 25821.0561649
                },
                "substitution": "25821 \\cdot \\sqrt{1 + \\left((1.54262 - 1) \\cdot 0.00138277\\right)^2}",
                "substitution_latex": "25821 \\cdot \\sqrt{1 + \\left((1.54262 - 1) \\cdot 0.00138277\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 25821.0488965,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 25821.0488965
                },
                "substitution": "25821 \\cdot \\sqrt{1}",
                "substitution_latex": "25821 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 25821.0488965,
                  "un_v": 800.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 35.7786948747
                },
                "substitution": "\\sqrt{3} \\cdot 800 \\cdot 25821 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 800 \\cdot 25821 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ik_contribution_ka": 1.731,
            "is_synchronous_machine": false,
            "machine_type": "IBG",
            "model": "IEC 60909 \u00a76.7 \u2014 \u017ar\u00f3d\u0142o pr\u0105dowe ograniczone (k\u00b7I_rated)"
          },
          "un_kv": 0.8,
          "verification": {
            "icw_ka": 50.0,
            "ikss_max_ka": 29.625,
            "passed": true,
            "rule": "ikss_max_le_icw"
          }
        },
        "SN_PCC": {
          "bus_ref": "SN_PCC",
          "icw_ka": 16.0,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 11.2,
            "ikss_ka": 11.2,
            "ip_ka": 26.276,
            "ith_ka": 11.2,
            "kappa": 1.659,
            "rx_ratio": 0.1426,
            "sk_mva": 290.98,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "SN_PCC",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.996,
                    "re": 0.14200225
                  },
                  "z2_ohm": {
                    "im": 0.996,
                    "re": 0.14200225
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.14200225,
                  "x_ohm": 0.996,
                  "z_equiv_abs_ohm": 1.00607188561,
                  "z_equiv_ohm": {
                    "im": 0.996,
                    "re": 0.14200225
                  }
                },
                "substitution": "\\left(0.142002 + j 0.996\\right)",
                "substitution_latex": "\\left(0.142002 + j 0.996\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 1.1,
                  "un_v": 15000.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 1.00607188561
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 11199.970838
                },
                "substitution": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{1.00607}",
                "substitution_latex": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{1.00607}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.14200225,
                  "rx_ratio": 0.142572540161,
                  "x_ohm": 0.996
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.658955589
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.142573}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.142573}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 11199.970838,
                  "kappa": 1.658955589
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 26276.447508
                },
                "substitution": "1.65896 \\cdot \\sqrt{2} \\cdot 11200",
                "substitution_latex": "1.65896 \\cdot \\sqrt{2} \\cdot 11200",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.0113442026223,
                  "ikss_a": 11199.970838,
                  "kappa": 1.658955589,
                  "ta_s": 0.0223261706515,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 11200.2837636
                },
                "substitution": "11200 \\cdot \\sqrt{1 + \\left((1.65896 - 1) \\cdot 0.0113442\\right)^2}",
                "substitution_latex": "11200 \\cdot \\sqrt{1 + \\left((1.65896 - 1) \\cdot 0.0113442\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 11199.970838,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 11199.970838
                },
                "substitution": "11200 \\cdot \\sqrt{1}",
                "substitution_latex": "11200 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 11199.970838,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 290.983778022
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 11200 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 11200 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 9.909,
            "ith_ka": 9.909,
            "kappa": 1.659,
            "sk_mva": 257.44,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "SN_PCC",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.996,
                    "re": 0.14200225
                  },
                  "z2_ohm": {
                    "im": 0.996,
                    "re": 0.14200225
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.14200225,
                  "x_ohm": 0.996,
                  "z_equiv_abs_ohm": 1.00607188561,
                  "z_equiv_ohm": {
                    "im": 0.996,
                    "re": 0.14200225
                  }
                },
                "substitution": "\\left(0.142002 + j 0.996\\right)",
                "substitution_latex": "\\left(0.142002 + j 0.996\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 0.95,
                  "un_v": 15000.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 1.00607188561
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 9908.77273951
                },
                "substitution": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{1.00607}",
                "substitution_latex": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{1.00607}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.14200225,
                  "rx_ratio": 0.142572540161,
                  "x_ohm": 0.996
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.658955589
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.142573}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.142573}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 9908.77273951,
                  "kappa": 1.658955589
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 23247.1450617
                },
                "substitution": "1.65896 \\cdot \\sqrt{2} \\cdot 9908.77",
                "substitution_latex": "1.65896 \\cdot \\sqrt{2} \\cdot 9908.77",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.0113442026223,
                  "ikss_a": 9908.77273951,
                  "kappa": 1.658955589,
                  "ta_s": 0.0223261706515,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 9909.04958921
                },
                "substitution": "9908.77 \\cdot \\sqrt{1 + \\left((1.65896 - 1) \\cdot 0.0113442\\right)^2}",
                "substitution_latex": "9908.77 \\cdot \\sqrt{1 + \\left((1.65896 - 1) \\cdot 0.0113442\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 9908.77273951,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 9908.77273951
                },
                "substitution": "9908.77 \\cdot \\sqrt{1}",
                "substitution_latex": "9908.77 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 9908.77273951,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 257.437467382
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 9908.77 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 9908.77 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ik_contribution_ka": 1.731,
            "is_synchronous_machine": false,
            "machine_type": "IBG",
            "model": "IEC 60909 \u00a76.7 \u2014 \u017ar\u00f3d\u0142o pr\u0105dowe ograniczone (k\u00b7I_rated)"
          },
          "un_kv": 15.0,
          "verification": {
            "icw_ka": 16.0,
            "ikss_max_ka": 11.2,
            "passed": true,
            "rule": "ikss_max_le_icw"
          }
        }
      },
      "standard": "IEC 60909"
    },
    "source": {
      "bidirectional": true,
      "control_mode": "P(f) \u00b7 Q(U) \u00b7 2-kier. (BESS)",
      "grid_earthing": {
        "ik_1f_ka": 0.12,
        "imd_it_nn": true,
        "neutral_point": "kompensowana",
        "note_pl": "nN IT: 1. doziemienie bez pr\u0105du \u2014 IMD; SN 15 kV: I\u2033k1f-z z uziemienia neutralnego OSD",
        "source_ref": "norma:PN-EN_60909_doziemienie;OSD:punkt_neutralny_SN"
      },
      "hybrid": {
        "bess_capacity_kwh": 2000.0,
        "bess_kw": 1000.0,
        "coincidence_factor": 1.0,
        "coupling": "AC_LV",
        "p_export_max_kw": 1999.0,
        "pv_kw": 999.0,
        "source_ref": "std:IEC_62933;std:NC_RfG;enm:Generator.gen_type=pv+bess",
        "variant_pl": "AC-coupled (wsp\u00f3lna szyna nN, jeden trafo przy\u0142\u0105czeniowy)"
      },
      "machine_type": "IBG",
      "nc_rfg_class": "C",
      "power_hierarchy": {
        "p_osiagalna_kw": 1999.0,
        "p_przylacz_kw": 1999.0,
        "p_zainst_kw": 1999.0,
        "pn_ac_kw": 1999.0,
        "valid": true
      },
      "protection_codes": [
        "67",
        "67N",
        "81U",
        "81O",
        "df/dt",
        "27",
        "59",
        "59N",
        "anti-islanding"
      ],
      "storage": {
        "bidirectional": true,
        "capacity_kwh": 2000.0,
        "charge_kw": 1000.0,
        "discharge_kw": 1000.0,
        "duration_h": 2.0,
        "n_pcs": 2,
        "pcs_kw": 500.0,
        "power_kw": 1000.0,
        "source_ref": "std:IEC_62933;enm:Generator.gen_type=bess"
      },
      "technology": "Hybryda PV + BESS \u2014 AC-coupled (wsp\u00f3lna szyna nN, jeden trafo przy\u0142\u0105czeniowy)",
      "withstand": {
        "nn_idyn_ka": 105.0,
        "sn_idyn_ka": 40.0,
        "source_ref": "karta:CTM20_Idyn;karta:rozdzielnica_nN"
      }
    },
    "voltage_flow": {
      "branches": {
        "sr/branch/bess_pcs1": {
          "branch_ref": "sr/branch/bess_pcs1",
          "direction": "reverse",
          "i_a": 360.41,
          "loading_percent": 57.21,
          "p_mw": -0.5,
          "q_mvar": 0.0,
          "s_mva": 0.5
        },
        "sr/branch/bess_pcs2": {
          "branch_ref": "sr/branch/bess_pcs2",
          "direction": "reverse",
          "i_a": 360.41,
          "loading_percent": 57.21,
          "p_mw": -0.5,
          "q_mvar": 0.0,
          "s_mva": 0.5
        },
        "sr/branch/in": {
          "branch_ref": "sr/branch/in",
          "direction": "reverse",
          "i_a": 76.09,
          "loading_percent": 12.08,
          "p_mw": -1.9764,
          "q_mvar": 0.0377,
          "s_mva": 1.9768
        },
        "sr/branch/pv_inv1": {
          "branch_ref": "sr/branch/pv_inv1",
          "direction": "reverse",
          "i_a": 240.04,
          "loading_percent": 38.1,
          "p_mw": -0.333,
          "q_mvar": 0.0,
          "s_mva": 0.333
        },
        "sr/branch/pv_inv2": {
          "branch_ref": "sr/branch/pv_inv2",
          "direction": "reverse",
          "i_a": 240.04,
          "loading_percent": 38.1,
          "p_mw": -0.333,
          "q_mvar": 0.0,
          "s_mva": 0.333
        },
        "sr/branch/pv_inv3": {
          "branch_ref": "sr/branch/pv_inv3",
          "direction": "reverse",
          "i_a": 240.04,
          "loading_percent": 38.1,
          "p_mw": -0.333,
          "q_mvar": 0.0,
          "s_mva": 0.333
        },
        "sr/branch/tr": {
          "branch_ref": "sr/branch/tr",
          "direction": "reverse",
          "i_a": 76.09,
          "loading_percent": null,
          "p_mw": -1.9789,
          "q_mvar": 0.0204,
          "s_mva": 1.979
        }
      },
      "buses": {
        "NN": {
          "bus_ref": "NN",
          "deviation_percent": 0.115,
          "u_kv": 0.8009,
          "u_pu": 1.00115,
          "un_kv": 0.8
        },
        "SN_PCC": {
          "bus_ref": "SN_PCC",
          "deviation_percent": 0.112,
          "u_kv": 15.0168,
          "u_pu": 1.00112,
          "un_kv": 15.0
        }
      }
    }
  },
  "G4-PVBESS-BUS": {
    "archetype": "G4-PVBESS-BUS",
    "boundary": {
      "enm_connection_variant": "DEDICATED_MV_CONNECTION",
      "metered": true,
      "on_bus_ref": "SN_PCC",
      "source_ref": "enm:Generator.connection_variant=DEDICATED_MV_CONNECTION",
      "variant": "G-ZKSN"
    },
    "case_ref_pf": "ROZPLYW_GEN_MAX",
    "case_ref_sc": "ZWARCIOWY_MAKS",
    "converged": true,
    "enm_hash": "oze-substrate/G4-PVBESS-BUS",
    "fields": [
      {
        "abb_cell": "CBC",
        "apparatus": [
          {
            "catalog": null,
            "designation": "Q1 (od\u0142\u0105cznik szynowy)",
            "device_ref": "g4bus-line/ds",
            "kind": "DS",
            "placement": "UPSTREAM",
            "source_ref": "enm:BayPrimaryDevice.kind=DS"
          },
          {
            "catalog": null,
            "designation": "Q0 (wy\u0142\u0105cznik SN)",
            "device_ref": "g4bus-line/cb",
            "kind": "CB",
            "placement": "MIDSTREAM",
            "source_ref": "enm:BayPrimaryDevice.kind=CB"
          },
          {
            "catalog": null,
            "designation": "przek\u0142adnik pr\u0105dowy",
            "device_ref": "g4bus-line/ct",
            "kind": "CT",
            "placement": "MIDSTREAM",
            "source_ref": "std:IEC_61869_CT"
          },
          {
            "catalog": null,
            "designation": "przek\u0142adnik napi\u0119ciowy",
            "device_ref": "g4bus-line/vt",
            "kind": "VT",
            "placement": "OFF_PATH",
            "source_ref": "std:IEC_61869_VT"
          },
          {
            "catalog": null,
            "designation": "ogranicznik przepi\u0119\u0107",
            "device_ref": "g4bus-line/sa",
            "kind": "SURGE_ARRESTER",
            "placement": "OFF_PATH",
            "source_ref": "enm:BayPrimaryDevice.kind=SURGE_ARRESTER"
          },
          {
            "catalog": null,
            "designation": "g\u0142owica kablowa",
            "device_ref": "g4bus-line/head",
            "kind": "CABLE_HEAD",
            "placement": "DOWNSTREAM",
            "source_ref": "enm:BayPrimaryDevice.kind=CABLE_HEAD"
          },
          {
            "catalog": null,
            "designation": "uziemnik",
            "device_ref": "g4bus-line/es",
            "kind": "ES",
            "placement": "GROUND_BRANCH",
            "source_ref": "enm:BayPrimaryDevice.kind=ES"
          }
        ],
        "field_id": "g4bus-line",
        "interface_protection": true,
        "kind": "POLE LINIOWE SN (przy\u0142\u0105cze)",
        "on_bus_ref": "SN_PCC",
        "port": {
          "cable": "kabel SN do OSD (typ wg projektu)",
          "entry_side": "BOK-L",
          "kind": "sn_input",
          "nominal_voltage_kv": 15.0,
          "occupied_by": "seg/kabel-osd",
          "port_id": "g4bus-line/port",
          "source_ref": "enm:Port.kind=sn_input;std:przylacze_SN"
        },
        "protection_codes": [
          "67",
          "67N",
          "81U",
          "81O",
          "df/dt",
          "27",
          "59",
          "59N",
          "anti-islanding"
        ],
        "role": "connection",
        "source_ref": "enm:Bay.bay_role=LINIA_OUT;std:IEC_62271_pole_liniowe"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g4bus-tr-pv",
        "interface_protection": false,
        "kind": "POLE TRAFO PV \u00b7 1.00 MVA \u00b7 15/0.8 kV",
        "on_bus_ref": "SN_PCC",
        "port": null,
        "protection_codes": [],
        "role": "transformer",
        "source_ref": "enm:Bay.bay_role=TRANSFORMATOR;std:pole_trafo_PV"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g4bus-tr-bess",
        "interface_protection": false,
        "kind": "POLE TRAFO BESS \u00b7 1.25 MVA \u00b7 15/0.4 kV",
        "on_bus_ref": "SN_PCC",
        "port": null,
        "protection_codes": [],
        "role": "transformer",
        "source_ref": "enm:Bay.bay_role=TRANSFORMATOR;std:pole_trafo_BESS"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g4bus-pv1",
        "interface_protection": false,
        "kind": "FALOWNIK PV 1 \u00b7 333 kW",
        "on_bus_ref": "PV_NN",
        "port": null,
        "protection_codes": [],
        "role": "source",
        "source_ref": "enm:Generator.gen_type=pv_inverter;std:falownik_1"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g4bus-pv2",
        "interface_protection": false,
        "kind": "FALOWNIK PV 2 \u00b7 333 kW",
        "on_bus_ref": "PV_NN",
        "port": null,
        "protection_codes": [],
        "role": "source",
        "source_ref": "enm:Generator.gen_type=pv_inverter;std:falownik_2"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g4bus-pv3",
        "interface_protection": false,
        "kind": "FALOWNIK PV 3 \u00b7 333 kW",
        "on_bus_ref": "PV_NN",
        "port": null,
        "protection_codes": [],
        "role": "source",
        "source_ref": "enm:Generator.gen_type=pv_inverter;std:falownik_3"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g4bus-pcs1",
        "interface_protection": false,
        "kind": "PCS BESS 1 \u00b7 500 kW (2-kier.)",
        "on_bus_ref": "BESS_NN",
        "port": null,
        "protection_codes": [],
        "role": "source",
        "source_ref": "enm:Generator.gen_type=bess;std:pcs_1"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g4bus-pcs2",
        "interface_protection": false,
        "kind": "PCS BESS 2 \u00b7 500 kW (2-kier.)",
        "on_bus_ref": "BESS_NN",
        "port": null,
        "protection_codes": [],
        "role": "source",
        "source_ref": "enm:Generator.gen_type=bess;std:pcs_2"
      }
    ],
    "pcc_bus_ref": "SN_PCC",
    "schema": "sld_oze_archetype_companion_v1",
    "short_circuit": {
      "buses": {
        "BESS_NN": {
          "bus_ref": "BESS_NN",
          "icw_ka": 50.0,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 32.863,
            "ikss_ka": 32.863,
            "ip_ka": 71.276,
            "ith_ka": 32.863,
            "kappa": 1.534,
            "rx_ratio": 0.2153,
            "sk_mva": 22.77,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "BESS_NN",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.00820538328888,
                    "re": 0.00176700529383
                  },
                  "z2_ohm": {
                    "im": 0.00820538328888,
                    "re": 0.00176700529383
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.00176700529383,
                  "x_ohm": 0.00820538328888,
                  "z_equiv_abs_ohm": 0.008393486917,
                  "z_equiv_ohm": {
                    "im": 0.00820538328888,
                    "re": 0.00176700529383
                  }
                },
                "substitution": "\\left(0.00176701 + j 0.00820538\\right)",
                "substitution_latex": "\\left(0.00176701 + j 0.00820538\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 1.1,
                  "un_v": 400.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.008393486917
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 32862.8341103
                },
                "substitution": "\\frac{1.1 \\cdot 400 \\cdot 0.57735}{0.00839349}",
                "substitution_latex": "\\frac{1.1 \\cdot 400 \\cdot 0.57735}{0.00839349}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.00176700529383,
                  "rx_ratio": 0.215347075404,
                  "x_ohm": 0.00820538328888
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.53363420334
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.215347}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.215347}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 32862.8341103,
                  "kappa": 1.53363420334
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 71275.7503552
                },
                "substitution": "1.53363 \\cdot \\sqrt{2} \\cdot 32862.8",
                "substitution_latex": "1.53363 \\cdot \\sqrt{2} \\cdot 32862.8",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.00115306934016,
                  "ikss_a": 32862.8341103,
                  "kappa": 1.53363420334,
                  "ta_s": 0.014781249552,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 32862.8403314
                },
                "substitution": "32862.8 \\cdot \\sqrt{1 + \\left((1.53363 - 1) \\cdot 0.00115307\\right)^2}",
                "substitution_latex": "32862.8 \\cdot \\sqrt{1 + \\left((1.53363 - 1) \\cdot 0.00115307\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 32862.8341103,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 32862.8341103
                },
                "substitution": "32862.8 \\cdot \\sqrt{1}",
                "substitution_latex": "32862.8 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 32862.8341103,
                  "un_v": 400.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 22.7680393439
                },
                "substitution": "\\sqrt{3} \\cdot 400 \\cdot 32862.8 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 400 \\cdot 32862.8 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 28.736,
            "ith_ka": 28.736,
            "kappa": 1.534,
            "sk_mva": 19.91,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "BESS_NN",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.00820538328888,
                    "re": 0.00176700529383
                  },
                  "z2_ohm": {
                    "im": 0.00820538328888,
                    "re": 0.00176700529383
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.00176700529383,
                  "x_ohm": 0.00820538328888,
                  "z_equiv_abs_ohm": 0.008393486917,
                  "z_equiv_ohm": {
                    "im": 0.00820538328888,
                    "re": 0.00176700529383
                  }
                },
                "substitution": "\\left(0.00176701 + j 0.00820538\\right)",
                "substitution_latex": "\\left(0.00176701 + j 0.00820538\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 0.95,
                  "un_v": 400.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.008393486917
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 28735.7035751
                },
                "substitution": "\\frac{0.95 \\cdot 400 \\cdot 0.57735}{0.00839349}",
                "substitution_latex": "\\frac{0.95 \\cdot 400 \\cdot 0.57735}{0.00839349}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.00176700529383,
                  "rx_ratio": 0.215347075404,
                  "x_ohm": 0.00820538328888
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.53363420334
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.215347}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.215347}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 28735.7035751,
                  "kappa": 1.53363420334
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 62324.4735201
                },
                "substitution": "1.53363 \\cdot \\sqrt{2} \\cdot 28735.7",
                "substitution_latex": "1.53363 \\cdot \\sqrt{2} \\cdot 28735.7",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.00115306934016,
                  "ikss_a": 28735.7035751,
                  "kappa": 1.53363420334,
                  "ta_s": 0.014781249552,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 28735.709015
                },
                "substitution": "28735.7 \\cdot \\sqrt{1 + \\left((1.53363 - 1) \\cdot 0.00115307\\right)^2}",
                "substitution_latex": "28735.7 \\cdot \\sqrt{1 + \\left((1.53363 - 1) \\cdot 0.00115307\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 28735.7035751,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 28735.7035751
                },
                "substitution": "28735.7 \\cdot \\sqrt{1}",
                "substitution_latex": "28735.7 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 28735.7035751,
                  "un_v": 400.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 19.9086794333
                },
                "substitution": "\\sqrt{3} \\cdot 400 \\cdot 28735.7 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 400 \\cdot 28735.7 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ik_contribution_ka": 2.597,
            "is_synchronous_machine": false,
            "machine_type": "IBG",
            "model": "IEC 60909 \u00a76.7 \u2014 \u017ar\u00f3d\u0142o pr\u0105dowe ograniczone (k\u00b7I_rated)"
          },
          "un_kv": 0.4,
          "verification": {
            "icw_ka": 50.0,
            "ikss_max_ka": 32.863,
            "passed": true,
            "rule": "ikss_max_le_icw"
          }
        },
        "PV_NN": {
          "bus_ref": "PV_NN",
          "icw_ka": 50.0,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 14.913,
            "ikss_ka": 14.913,
            "ip_ka": 32.303,
            "ith_ka": 14.913,
            "kappa": 1.532,
            "rx_ratio": 0.2166,
            "sk_mva": 20.66,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "PV_NN",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.0403186497777,
                    "re": 0.00873404709135
                  },
                  "z2_ohm": {
                    "im": 0.0403186497777,
                    "re": 0.00873404709135
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.00873404709135,
                  "x_ohm": 0.0403186497777,
                  "z_equiv_abs_ohm": 0.0412538131388,
                  "z_equiv_ohm": {
                    "im": 0.0403186497777,
                    "re": 0.00873404709135
                  }
                },
                "substitution": "\\left(0.00873405 + j 0.0403186\\right)",
                "substitution_latex": "\\left(0.00873405 + j 0.0403186\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 1.1,
                  "un_v": 800.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.0412538131388
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 14912.8774717
                },
                "substitution": "\\frac{1.1 \\cdot 800 \\cdot 0.57735}{0.0412538}",
                "substitution_latex": "\\frac{1.1 \\cdot 800 \\cdot 0.57735}{0.0412538}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.00873404709135,
                  "rx_ratio": 0.216625485712,
                  "x_ohm": 0.0403186497777
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.53166807026
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.216625}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.216625}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 14912.8774717,
                  "kappa": 1.53166807026
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 32302.8697601
                },
                "substitution": "1.53167 \\cdot \\sqrt{2} \\cdot 14912.9",
                "substitution_latex": "1.53167 \\cdot \\sqrt{2} \\cdot 14912.9",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.00110767689419,
                  "ikss_a": 14912.8774717,
                  "kappa": 1.53166807026,
                  "ta_s": 0.0146940183487,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 14912.8800578
                },
                "substitution": "14912.9 \\cdot \\sqrt{1 + \\left((1.53167 - 1) \\cdot 0.00110768\\right)^2}",
                "substitution_latex": "14912.9 \\cdot \\sqrt{1 + \\left((1.53167 - 1) \\cdot 0.00110768\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 14912.8774717,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 14912.8774717
                },
                "substitution": "14912.9 \\cdot \\sqrt{1}",
                "substitution_latex": "14912.9 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 14912.8774717,
                  "un_v": 800.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 20.6638891744
                },
                "substitution": "\\sqrt{3} \\cdot 800 \\cdot 14912.9 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 800 \\cdot 14912.9 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 13.233,
            "ith_ka": 13.233,
            "kappa": 1.532,
            "sk_mva": 18.34,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "PV_NN",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.0403186497777,
                    "re": 0.00873404709135
                  },
                  "z2_ohm": {
                    "im": 0.0403186497777,
                    "re": 0.00873404709135
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.00873404709135,
                  "x_ohm": 0.0403186497777,
                  "z_equiv_abs_ohm": 0.0412538131388,
                  "z_equiv_ohm": {
                    "im": 0.0403186497777,
                    "re": 0.00873404709135
                  }
                },
                "substitution": "\\left(0.00873405 + j 0.0403186\\right)",
                "substitution_latex": "\\left(0.00873405 + j 0.0403186\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 0.95,
                  "un_v": 800.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.0412538131388
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 13233.4682964
                },
                "substitution": "\\frac{0.95 \\cdot 800 \\cdot 0.57735}{0.0412538}",
                "substitution_latex": "\\frac{0.95 \\cdot 800 \\cdot 0.57735}{0.0412538}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.00873404709135,
                  "rx_ratio": 0.216625485712,
                  "x_ohm": 0.0403186497777
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.53166807026
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.216625}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.216625}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 13233.4682964,
                  "kappa": 1.53166807026
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 28665.0918753
                },
                "substitution": "1.53167 \\cdot \\sqrt{2} \\cdot 13233.5",
                "substitution_latex": "1.53167 \\cdot \\sqrt{2} \\cdot 13233.5",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.00110767689419,
                  "ikss_a": 13233.4682964,
                  "kappa": 1.53166807026,
                  "ta_s": 0.0146940183487,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 13233.4705912
                },
                "substitution": "13233.5 \\cdot \\sqrt{1 + \\left((1.53167 - 1) \\cdot 0.00110768\\right)^2}",
                "substitution_latex": "13233.5 \\cdot \\sqrt{1 + \\left((1.53167 - 1) \\cdot 0.00110768\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 13233.4682964,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 13233.4682964
                },
                "substitution": "13233.5 \\cdot \\sqrt{1}",
                "substitution_latex": "13233.5 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 13233.4682964,
                  "un_v": 800.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 18.3368315597
                },
                "substitution": "\\sqrt{3} \\cdot 800 \\cdot 13233.5 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 800 \\cdot 13233.5 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ik_contribution_ka": 2.597,
            "is_synchronous_machine": false,
            "machine_type": "IBG",
            "model": "IEC 60909 \u00a76.7 \u2014 \u017ar\u00f3d\u0142o pr\u0105dowe ograniczone (k\u00b7I_rated)"
          },
          "un_kv": 0.8,
          "verification": {
            "icw_ka": 50.0,
            "ikss_max_ka": 14.913,
            "passed": true,
            "rule": "ikss_max_le_icw"
          }
        },
        "SN_PCC": {
          "bus_ref": "SN_PCC",
          "icw_ka": 16.0,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 12.066,
            "ikss_ka": 12.066,
            "ip_ka": 28.308,
            "ith_ka": 12.066,
            "kappa": 1.659,
            "rx_ratio": 0.1426,
            "sk_mva": 313.48,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "SN_PCC",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.996,
                    "re": 0.14200225
                  },
                  "z2_ohm": {
                    "im": 0.996,
                    "re": 0.14200225
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.14200225,
                  "x_ohm": 0.996,
                  "z_equiv_abs_ohm": 1.00607188561,
                  "z_equiv_ohm": {
                    "im": 0.996,
                    "re": 0.14200225
                  }
                },
                "substitution": "\\left(0.142002 + j 0.996\\right)",
                "substitution_latex": "\\left(0.142002 + j 0.996\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 1.1,
                  "un_v": 15000.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 1.00607188561
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 12065.9962418
                },
                "substitution": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{1.00607}",
                "substitution_latex": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{1.00607}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.14200225,
                  "rx_ratio": 0.142572540161,
                  "x_ohm": 0.996
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.658955589
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.142573}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.142573}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 12065.9962418,
                  "kappa": 1.658955589
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 28308.2448575
                },
                "substitution": "1.65896 \\cdot \\sqrt{2} \\cdot 12066",
                "substitution_latex": "1.65896 \\cdot \\sqrt{2} \\cdot 12066",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.0113442026223,
                  "ikss_a": 12065.9962418,
                  "kappa": 1.658955589,
                  "ta_s": 0.0223261706515,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 12066.333364
                },
                "substitution": "12066 \\cdot \\sqrt{1 + \\left((1.65896 - 1) \\cdot 0.0113442\\right)^2}",
                "substitution_latex": "12066 \\cdot \\sqrt{1 + \\left((1.65896 - 1) \\cdot 0.0113442\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 12065.9962418,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 12065.9962418
                },
                "substitution": "12066 \\cdot \\sqrt{1}",
                "substitution_latex": "12066 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 12065.9962418,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 313.483778022
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 12066 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 12066 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 10.775,
            "ith_ka": 10.775,
            "kappa": 1.659,
            "sk_mva": 279.94,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "SN_PCC",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.996,
                    "re": 0.14200225
                  },
                  "z2_ohm": {
                    "im": 0.996,
                    "re": 0.14200225
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.14200225,
                  "x_ohm": 0.996,
                  "z_equiv_abs_ohm": 1.00607188561,
                  "z_equiv_ohm": {
                    "im": 0.996,
                    "re": 0.14200225
                  }
                },
                "substitution": "\\left(0.142002 + j 0.996\\right)",
                "substitution_latex": "\\left(0.142002 + j 0.996\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 0.95,
                  "un_v": 15000.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 1.00607188561
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 10774.7981433
                },
                "substitution": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{1.00607}",
                "substitution_latex": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{1.00607}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.14200225,
                  "rx_ratio": 0.142572540161,
                  "x_ohm": 0.996
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.658955589
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.142573}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.142573}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 10774.7981433,
                  "kappa": 1.658955589
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 25278.9424112
                },
                "substitution": "1.65896 \\cdot \\sqrt{2} \\cdot 10774.8",
                "substitution_latex": "1.65896 \\cdot \\sqrt{2} \\cdot 10774.8",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.0113442026223,
                  "ikss_a": 10774.7981433,
                  "kappa": 1.658955589,
                  "ta_s": 0.0223261706515,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 10775.0991896
                },
                "substitution": "10774.8 \\cdot \\sqrt{1 + \\left((1.65896 - 1) \\cdot 0.0113442\\right)^2}",
                "substitution_latex": "10774.8 \\cdot \\sqrt{1 + \\left((1.65896 - 1) \\cdot 0.0113442\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 10774.7981433,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 10774.7981433
                },
                "substitution": "10774.8 \\cdot \\sqrt{1}",
                "substitution_latex": "10774.8 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 10774.7981433,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 279.937467382
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 10774.8 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 10774.8 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ik_contribution_ka": 2.597,
            "is_synchronous_machine": false,
            "machine_type": "IBG",
            "model": "IEC 60909 \u00a76.7 \u2014 \u017ar\u00f3d\u0142o pr\u0105dowe ograniczone (k\u00b7I_rated)"
          },
          "un_kv": 15.0,
          "verification": {
            "icw_ka": 16.0,
            "ikss_max_ka": 12.066,
            "passed": true,
            "rule": "ikss_max_le_icw"
          }
        }
      },
      "standard": "IEC 60909"
    },
    "source": {
      "bidirectional": true,
      "control_mode": "P(f) \u00b7 Q(U) \u00b7 2-kier. (BESS)",
      "grid_earthing": {
        "ik_1f_ka": 0.12,
        "imd_it_nn": true,
        "neutral_point": "kompensowana",
        "note_pl": "nN IT: 1. doziemienie bez pr\u0105du \u2014 IMD; SN 15 kV: I\u2033k1f-z z uziemienia neutralnego OSD",
        "source_ref": "norma:PN-EN_60909_doziemienie;OSD:punkt_neutralny_SN"
      },
      "hybrid": {
        "bess_capacity_kwh": 2000.0,
        "bess_kw": 1000.0,
        "coincidence_factor": 1.0,
        "coupling": "SN_BUS",
        "p_export_max_kw": 1999.0,
        "pv_kw": 999.0,
        "source_ref": "std:IEC_62933;std:NC_RfG;enm:Generator.gen_type=pv+bess",
        "variant_pl": "sprz\u0119\u017cenie na SN (wsp\u00f3lna szyna 15 kV, osobne trafa)"
      },
      "machine_type": "IBG",
      "nc_rfg_class": "C",
      "power_hierarchy": {
        "p_osiagalna_kw": 1999.0,
        "p_przylacz_kw": 1999.0,
        "p_zainst_kw": 1999.0,
        "pn_ac_kw": 1999.0,
        "valid": true
      },
      "protection_codes": [
        "67",
        "67N",
        "81U",
        "81O",
        "df/dt",
        "27",
        "59",
        "59N",
        "anti-islanding"
      ],
      "storage": {
        "bidirectional": true,
        "capacity_kwh": 2000.0,
        "charge_kw": 1000.0,
        "discharge_kw": 1000.0,
        "duration_h": 2.0,
        "n_pcs": 2,
        "pcs_kw": 500.0,
        "power_kw": 1000.0,
        "source_ref": "std:IEC_62933;enm:Generator.gen_type=bess"
      },
      "technology": "Hybryda PV + BESS \u2014 sprz\u0119\u017cenie na SN (wsp\u00f3lna szyna 15 kV, osobne trafa)",
      "withstand": {
        "nn_idyn_ka": 105.0,
        "sn_idyn_ka": 40.0,
        "source_ref": "karta:CTM20_Idyn;karta:rozdzielnica_nN"
      }
    },
    "voltage_flow": {
      "branches": {
        "sr/branch/bess_pcs1": {
          "branch_ref": "sr/branch/bess_pcs1",
          "direction": "reverse",
          "i_a": 720.85,
          "loading_percent": 114.42,
          "p_mw": -0.5,
          "q_mvar": 0.0,
          "s_mva": 0.5
        },
        "sr/branch/bess_pcs2": {
          "branch_ref": "sr/branch/bess_pcs2",
          "direction": "reverse",
          "i_a": 720.85,
          "loading_percent": 114.42,
          "p_mw": -0.5,
          "q_mvar": 0.0,
          "s_mva": 0.5
        },
        "sr/branch/in": {
          "branch_ref": "sr/branch/in",
          "direction": "reverse",
          "i_a": 76.01,
          "loading_percent": 12.06,
          "p_mw": -1.9744,
          "q_mvar": 0.0376,
          "s_mva": 1.9748
        },
        "sr/branch/pv_inv1": {
          "branch_ref": "sr/branch/pv_inv1",
          "direction": "reverse",
          "i_a": 240.04,
          "loading_percent": 38.1,
          "p_mw": -0.333,
          "q_mvar": 0.0,
          "s_mva": 0.333
        },
        "sr/branch/pv_inv2": {
          "branch_ref": "sr/branch/pv_inv2",
          "direction": "reverse",
          "i_a": 240.04,
          "loading_percent": 38.1,
          "p_mw": -0.333,
          "q_mvar": 0.0,
          "s_mva": 0.333
        },
        "sr/branch/pv_inv3": {
          "branch_ref": "sr/branch/pv_inv3",
          "direction": "reverse",
          "i_a": 240.04,
          "loading_percent": 38.1,
          "p_mw": -0.333,
          "q_mvar": 0.0,
          "s_mva": 0.333
        },
        "sr/branch/tr-bess": {
          "branch_ref": "sr/branch/tr-bess",
          "direction": "reverse",
          "i_a": 38.06,
          "loading_percent": null,
          "p_mw": -0.9899,
          "q_mvar": 0.0101,
          "s_mva": 0.99
        },
        "sr/branch/tr-pv": {
          "branch_ref": "sr/branch/tr-pv",
          "direction": "reverse",
          "i_a": 37.95,
          "loading_percent": null,
          "p_mw": -0.9869,
          "q_mvar": 0.0102,
          "s_mva": 0.987
        }
      },
      "buses": {
        "BESS_NN": {
          "bus_ref": "BESS_NN",
          "deviation_percent": 0.112,
          "u_kv": 0.4004,
          "u_pu": 1.00112,
          "un_kv": 0.4
        },
        "PV_NN": {
          "bus_ref": "PV_NN",
          "deviation_percent": 0.115,
          "u_kv": 0.8009,
          "u_pu": 1.00115,
          "un_kv": 0.8
        },
        "SN_PCC": {
          "bus_ref": "SN_PCC",
          "deviation_percent": 0.112,
          "u_kv": 15.0168,
          "u_pu": 1.00112,
          "un_kv": 15.0
        }
      }
    }
  },
  "G4-PVTR": {
    "archetype": "G4-PVTR",
    "boundary": {
      "enm_connection_variant": "DEDICATED_MV_CONNECTION",
      "metered": true,
      "on_bus_ref": "SN_PCC",
      "source_ref": "enm:Generator.connection_variant=DEDICATED_MV_CONNECTION",
      "variant": "G-ZKSN"
    },
    "case_ref_pf": "ROZPLYW_GEN_MAX",
    "case_ref_sc": "ZWARCIOWY_MAKS",
    "converged": true,
    "enm_hash": "oze-substrate/G4-PVTR",
    "fields": [
      {
        "abb_cell": "CBC",
        "apparatus": [
          {
            "catalog": null,
            "designation": "Q9 (od\u0142\u0105cznik szynowy)",
            "device_ref": "vcb/q9",
            "kind": "DS",
            "placement": "UPSTREAM",
            "source_ref": "enm:BayPrimaryDevice.kind=DS"
          },
          {
            "catalog": "TGI 24",
            "designation": "Q0",
            "device_ref": "vcb/q0",
            "kind": "CB",
            "placement": "MIDSTREAM",
            "source_ref": "enm:BayPrimaryDevice.kind=CB"
          },
          {
            "catalog": "CTM 20 \u00b7 40/5/5/5",
            "designation": "T1.3",
            "device_ref": "vcb/ct",
            "kind": "CT",
            "placement": "MIDSTREAM",
            "source_ref": "schemat:CTM20_3rdz"
          },
          {
            "catalog": "VTB 20",
            "designation": "TU1.3",
            "device_ref": "vcb/vt",
            "kind": "VT",
            "placement": "OFF_PATH",
            "source_ref": "schemat:VTB20_4uzw"
          },
          {
            "catalog": null,
            "designation": "POLIM-D 18-06",
            "device_ref": "vcb/sa",
            "kind": "SURGE_ARRESTER",
            "placement": "OFF_PATH",
            "source_ref": "enm:BayPrimaryDevice.kind=SURGE_ARRESTER"
          },
          {
            "catalog": null,
            "designation": "ITK 224",
            "device_ref": "vcb/head",
            "kind": "CABLE_HEAD",
            "placement": "DOWNSTREAM",
            "source_ref": "enm:BayPrimaryDevice.kind=CABLE_HEAD"
          },
          {
            "catalog": null,
            "designation": "uziemnik",
            "device_ref": "vcb/es",
            "kind": "ES",
            "placement": "GROUND_BRANCH",
            "source_ref": "enm:BayPrimaryDevice.kind=ES"
          }
        ],
        "field_id": "g4-vcb",
        "interface_protection": true,
        "kind": "POLE 1 \u2014 VCB (e\u00b2TANGO-800)",
        "on_bus_ref": "SN_PCC",
        "port": {
          "cable": "3\u00d7XRUHAKXS 1\u00d770/25 mm\u00b2 \u00b7 L\u2248484 m",
          "entry_side": "BOK-L",
          "kind": "sn_input",
          "nominal_voltage_kv": 15.75,
          "occupied_by": "seg/kabel-osd",
          "port_id": "vcb/port",
          "source_ref": "enm:Port.kind=sn_input;schemat:kabel_OSD"
        },
        "protection_codes": [
          "I>",
          "I>>",
          "Ust II>",
          "G0>",
          "3U0",
          "I0>"
        ],
        "role": "connection",
        "source_ref": "enm:Bay.bay_role=LINIA_OUT;schemat:POLE_NR_1_VCB"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [
          {
            "catalog": null,
            "designation": "GTR 5 (roz\u0142\u0105cznik)",
            "device_ref": "sl2u/gtr5",
            "kind": "LOAD_SWITCH",
            "placement": "MIDSTREAM",
            "source_ref": "enm:BayPrimaryDevice.kind=LOAD_SWITCH"
          },
          {
            "catalog": null,
            "designation": "uziemnik",
            "device_ref": "sl2u/es",
            "kind": "ES",
            "placement": "GROUND_BRANCH",
            "source_ref": "enm:BayPrimaryDevice.kind=ES"
          },
          {
            "catalog": null,
            "designation": "ITK 224 \u2192 3\u00d7YHAKXS do TR",
            "device_ref": "sl2u/head",
            "kind": "CABLE_HEAD",
            "placement": "DOWNSTREAM",
            "source_ref": "enm:BayPrimaryDevice.kind=CABLE_HEAD"
          }
        ],
        "field_id": "g4-sl2u",
        "interface_protection": false,
        "kind": "POLE 2 \u2014 S\u01412+U (GTR5) \u00b7 pole transformatorowe",
        "on_bus_ref": "SN_PCC",
        "port": null,
        "protection_codes": [],
        "role": "transformer",
        "source_ref": "enm:Bay.bay_role=TRANSFORMATOR;schemat:POLE_NR_2_SL2U"
      },
      {
        "abb_cell": "CBC",
        "apparatus": [],
        "field_id": "g4-q1",
        "interface_protection": true,
        "kind": "Q1 nN \u00b7 3WA1108 800 A",
        "on_bus_ref": "NN_800",
        "port": null,
        "protection_codes": [
          "Ust I>",
          "Ust I<",
          "f>",
          "f<",
          "df/dt",
          "SPZ"
        ],
        "role": "breaker",
        "source_ref": "dok:1.18_karta_Q1_3WA1108"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g4-inv1",
        "interface_protection": false,
        "kind": "FALOWNIK 1 \u00b7 ~333 kW",
        "on_bus_ref": "NN_800",
        "port": null,
        "protection_codes": [],
        "role": "source",
        "source_ref": "enm:Generator.gen_type=pv_inverter;dok:1.18_falownik_1"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g4-inv2",
        "interface_protection": false,
        "kind": "FALOWNIK 2 \u00b7 ~333 kW",
        "on_bus_ref": "NN_800",
        "port": null,
        "protection_codes": [],
        "role": "source",
        "source_ref": "enm:Generator.gen_type=pv_inverter;dok:1.18_falownik_2"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g4-inv3",
        "interface_protection": false,
        "kind": "FALOWNIK 3 \u00b7 ~333 kW",
        "on_bus_ref": "NN_800",
        "port": null,
        "protection_codes": [],
        "role": "source",
        "source_ref": "enm:Generator.gen_type=pv_inverter;dok:1.18_falownik_3"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g4-own",
        "interface_protection": false,
        "kind": "RPW-PV (potrzeby w\u0142asne)",
        "on_bus_ref": "NN_800",
        "port": null,
        "protection_codes": [],
        "role": "load",
        "source_ref": "enm:Bay.specialization=POTRZEBY_WLASNE;schemat:RPW-PV"
      }
    ],
    "pcc_bus_ref": "SN_PCC",
    "schema": "sld_oze_archetype_companion_v1",
    "short_circuit": {
      "buses": {
        "NN_800": {
          "bus_ref": "NN_800",
          "icw_ka": 50.0,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 13.181,
            "ikss_ka": 13.181,
            "ip_ka": 28.552,
            "ith_ka": 13.181,
            "kappa": 1.532,
            "rx_ratio": 0.2166,
            "sk_mva": 18.26,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "NN_800",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.0403186497777,
                    "re": 0.00873404709135
                  },
                  "z2_ohm": {
                    "im": 0.0403186497777,
                    "re": 0.00873404709135
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.00873404709135,
                  "x_ohm": 0.0403186497777,
                  "z_equiv_abs_ohm": 0.0412538131388,
                  "z_equiv_ohm": {
                    "im": 0.0403186497777,
                    "re": 0.00873404709135
                  }
                },
                "substitution": "\\left(0.00873405 + j 0.0403186\\right)",
                "substitution_latex": "\\left(0.00873405 + j 0.0403186\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 1.1,
                  "un_v": 800.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.0412538131388
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 13181.3462794
                },
                "substitution": "\\frac{1.1 \\cdot 800 \\cdot 0.57735}{0.0412538}",
                "substitution_latex": "\\frac{1.1 \\cdot 800 \\cdot 0.57735}{0.0412538}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.00873404709135,
                  "rx_ratio": 0.216625485712,
                  "x_ohm": 0.0403186497777
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.53166807026
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.216625}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.216625}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 13181.3462794,
                  "kappa": 1.53166807026
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 28552.1900742
                },
                "substitution": "1.53167 \\cdot \\sqrt{2} \\cdot 13181.3",
                "substitution_latex": "1.53167 \\cdot \\sqrt{2} \\cdot 13181.3",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.00110767689419,
                  "ikss_a": 13181.3462794,
                  "kappa": 1.53166807026,
                  "ta_s": 0.0146940183487,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 13181.3485652
                },
                "substitution": "13181.3 \\cdot \\sqrt{1 + \\left((1.53167 - 1) \\cdot 0.00110768\\right)^2}",
                "substitution_latex": "13181.3 \\cdot \\sqrt{1 + \\left((1.53167 - 1) \\cdot 0.00110768\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 13181.3462794,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 13181.3462794
                },
                "substitution": "13181.3 \\cdot \\sqrt{1}",
                "substitution_latex": "13181.3 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 13181.3462794,
                  "un_v": 800.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 18.2646091744
                },
                "substitution": "\\sqrt{3} \\cdot 800 \\cdot 13181.3 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 800 \\cdot 13181.3 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 11.502,
            "ith_ka": 11.502,
            "kappa": 1.532,
            "sk_mva": 15.94,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "NN_800",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.0403186497777,
                    "re": 0.00873404709135
                  },
                  "z2_ohm": {
                    "im": 0.0403186497777,
                    "re": 0.00873404709135
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.00873404709135,
                  "x_ohm": 0.0403186497777,
                  "z_equiv_abs_ohm": 0.0412538131388,
                  "z_equiv_ohm": {
                    "im": 0.0403186497777,
                    "re": 0.00873404709135
                  }
                },
                "substitution": "\\left(0.00873405 + j 0.0403186\\right)",
                "substitution_latex": "\\left(0.00873405 + j 0.0403186\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 0.95,
                  "un_v": 800.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.0412538131388
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 11501.9371041
                },
                "substitution": "\\frac{0.95 \\cdot 800 \\cdot 0.57735}{0.0412538}",
                "substitution_latex": "\\frac{0.95 \\cdot 800 \\cdot 0.57735}{0.0412538}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.00873404709135,
                  "rx_ratio": 0.216625485712,
                  "x_ohm": 0.0403186497777
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.53166807026
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.216625}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.216625}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 11501.9371041,
                  "kappa": 1.53166807026
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 24914.4121894
                },
                "substitution": "1.53167 \\cdot \\sqrt{2} \\cdot 11501.9",
                "substitution_latex": "1.53167 \\cdot \\sqrt{2} \\cdot 11501.9",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.00110767689419,
                  "ikss_a": 11501.9371041,
                  "kappa": 1.53166807026,
                  "ta_s": 0.0146940183487,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 11501.9390986
                },
                "substitution": "11501.9 \\cdot \\sqrt{1 + \\left((1.53167 - 1) \\cdot 0.00110768\\right)^2}",
                "substitution_latex": "11501.9 \\cdot \\sqrt{1 + \\left((1.53167 - 1) \\cdot 0.00110768\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 11501.9371041,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 11501.9371041
                },
                "substitution": "11501.9 \\cdot \\sqrt{1}",
                "substitution_latex": "11501.9 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 11501.9371041,
                  "un_v": 800.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 15.9375515597
                },
                "substitution": "\\sqrt{3} \\cdot 800 \\cdot 11501.9 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 800 \\cdot 11501.9 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ik_contribution_ka": 0.866,
            "is_synchronous_machine": false,
            "machine_type": "IBG",
            "model": "IEC 60909 \u00a76.7 \u2014 \u017ar\u00f3d\u0142o pr\u0105dowe ograniczone (k\u00b7I_rated)"
          },
          "un_kv": 0.8,
          "verification": {
            "icw_ka": 50.0,
            "ikss_max_ka": 13.181,
            "passed": true,
            "rule": "ikss_max_le_icw"
          }
        },
        "SN_PCC": {
          "bus_ref": "SN_PCC",
          "icw_ka": 16.0,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 9.884,
            "ikss_ka": 9.884,
            "ip_ka": 23.188,
            "ith_ka": 9.884,
            "kappa": 1.659,
            "rx_ratio": 0.1426,
            "sk_mva": 269.62,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "SN_PCC",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 1.09809,
                    "re": 0.156557480625
                  },
                  "z2_ohm": {
                    "im": 1.09809,
                    "re": 0.156557480625
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.156557480625,
                  "x_ohm": 1.09809,
                  "z_equiv_abs_ohm": 1.10919425388,
                  "z_equiv_ohm": {
                    "im": 1.09809,
                    "re": 0.156557480625
                  }
                },
                "substitution": "\\left(0.156557 + j 1.09809\\right)",
                "substitution_latex": "\\left(0.156557 + j 1.09809\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 1.1,
                  "un_v": 15750.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 1.10919425388
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 9883.57047541
                },
                "substitution": "\\frac{1.1 \\cdot 15750 \\cdot 0.57735}{1.10919}",
                "substitution_latex": "\\frac{1.1 \\cdot 15750 \\cdot 0.57735}{1.10919}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.156557480625,
                  "rx_ratio": 0.142572540161,
                  "x_ohm": 1.09809
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.658955589
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.142573}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.142573}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 9883.57047541,
                  "kappa": 1.658955589
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 23188.017589
                },
                "substitution": "1.65896 \\cdot \\sqrt{2} \\cdot 9883.57",
                "substitution_latex": "1.65896 \\cdot \\sqrt{2} \\cdot 9883.57",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.0113442026223,
                  "ikss_a": 9883.57047541,
                  "kappa": 1.658955589,
                  "ta_s": 0.0223261706515,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 9883.84662096
                },
                "substitution": "9883.57 \\cdot \\sqrt{1 + \\left((1.65896 - 1) \\cdot 0.0113442\\right)^2}",
                "substitution_latex": "9883.57 \\cdot \\sqrt{1 + \\left((1.65896 - 1) \\cdot 0.0113442\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 9883.57047541,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 9883.57047541
                },
                "substitution": "9883.57 \\cdot \\sqrt{1}",
                "substitution_latex": "9883.57 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 9883.57047541,
                  "un_v": 15750.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 269.621828022
                },
                "substitution": "\\sqrt{3} \\cdot 15750 \\cdot 9883.57 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15750 \\cdot 9883.57 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 8.654,
            "ith_ka": 8.654,
            "kappa": 1.659,
            "sk_mva": 236.08,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "SN_PCC",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 1.09809,
                    "re": 0.156557480625
                  },
                  "z2_ohm": {
                    "im": 1.09809,
                    "re": 0.156557480625
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.156557480625,
                  "x_ohm": 1.09809,
                  "z_equiv_abs_ohm": 1.10919425388,
                  "z_equiv_ohm": {
                    "im": 1.09809,
                    "re": 0.156557480625
                  }
                },
                "substitution": "\\left(0.156557 + j 1.09809\\right)",
                "substitution_latex": "\\left(0.156557 + j 1.09809\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 0.95,
                  "un_v": 15750.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 1.10919425388
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 8653.85800062
                },
                "substitution": "\\frac{0.95 \\cdot 15750 \\cdot 0.57735}{1.10919}",
                "substitution_latex": "\\frac{0.95 \\cdot 15750 \\cdot 0.57735}{1.10919}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.156557480625,
                  "rx_ratio": 0.142572540161,
                  "x_ohm": 1.09809
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.658955589
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.142573}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.142573}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 8653.85800062,
                  "kappa": 1.658955589
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 20302.9676401
                },
                "substitution": "1.65896 \\cdot \\sqrt{2} \\cdot 8653.86",
                "substitution_latex": "1.65896 \\cdot \\sqrt{2} \\cdot 8653.86",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.0113442026223,
                  "ikss_a": 8653.85800062,
                  "kappa": 1.658955589,
                  "ta_s": 0.0223261706515,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 8654.09978818
                },
                "substitution": "8653.86 \\cdot \\sqrt{1 + \\left((1.65896 - 1) \\cdot 0.0113442\\right)^2}",
                "substitution_latex": "8653.86 \\cdot \\sqrt{1 + \\left((1.65896 - 1) \\cdot 0.0113442\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 8653.85800062,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 8653.85800062
                },
                "substitution": "8653.86 \\cdot \\sqrt{1}",
                "substitution_latex": "8653.86 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 8653.85800062,
                  "un_v": 15750.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 236.075517382
                },
                "substitution": "\\sqrt{3} \\cdot 15750 \\cdot 8653.86 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15750 \\cdot 8653.86 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ik_contribution_ka": 0.866,
            "is_synchronous_machine": false,
            "machine_type": "IBG",
            "model": "IEC 60909 \u00a76.7 \u2014 \u017ar\u00f3d\u0142o pr\u0105dowe ograniczone (k\u00b7I_rated)"
          },
          "un_kv": 15.75,
          "verification": {
            "icw_ka": 16.0,
            "ikss_max_ka": 9.884,
            "passed": true,
            "rule": "ikss_max_le_icw"
          }
        }
      },
      "standard": "IEC 60909"
    },
    "source": {
      "control_mode": "Q(U)",
      "coordination": {
        "base": {
          "i_b_sn_a": 40.0,
          "in_nn_a": 721.4,
          "in_sn_a": 38.47,
          "sn_kw": 1039.23,
          "u_b_nn_v": 800.0,
          "u_b_sn_kv": 15.0
        },
        "levels": [
          "FALOWNIK (ka\u017cdy)",
          "nN \u2014 Q1 (3WA1108)",
          "SN \u2014 Q0 pole 1 (e\u00b2TANGO-800)"
        ],
        "matrix": [
          {
            "code": "I>",
            "inverter": "tech. producenta",
            "lp": 1,
            "measure": "SN",
            "name": "nadpr\u0105dowe od przeci\u0105\u017ce\u0144",
            "relay_sn": "1,2 I_bSN = 6 A \u2192 48 A SN / 5 s",
            "trips": "SN Q0 pole 1"
          },
          {
            "code": "I>>",
            "inverter": "tech. producenta",
            "lp": 2,
            "measure": "SN",
            "name": "nadpr\u0105dowe zwarciowe",
            "relay_sn": "4 I_bSN = 20 A \u2192 160 A SN / 0,1 s",
            "trips": "SN Q0 pole 1"
          },
          {
            "code": "Ust I>",
            "inverter": "1,1 Un = 880 V (16,5 kV) / 5 s",
            "lp": 3,
            "measure": "SN",
            "name": "przed wzrostem napi\u0119cia",
            "relay_sn": "1,12 U_bSN = 112 V \u2192 16,80 kV / 3 s",
            "trips": "nN Q1"
          },
          {
            "code": "Ust II>",
            "inverter": "1,15 Un = 920 V (17,25 kV) / 0,05 s",
            "lp": 4,
            "measure": "SN",
            "name": "przed wzrostem napi\u0119cia",
            "relay_sn": "1,15 U_bSN = 115 V \u2192 17,25 kV / 0,3 s",
            "trips": "SN Q0 pole 1"
          },
          {
            "code": "Ust I<",
            "inverter": "0,8 Un = 640 V (12,00 kV) / 0,05 s",
            "lp": 5,
            "measure": "nN",
            "name": "przed obni\u017ceniem napi\u0119cia",
            "relay_sn": "0,8 U_bnN = 80 V \u2192 12,00 kV / 5 s",
            "trips": "nN Q1"
          },
          {
            "code": "f>",
            "inverter": "51,5 Hz / 0,05 s",
            "lp": 6,
            "measure": "nN",
            "name": "przed wzrostem cz\u0119stotliwo\u015bci",
            "relay_sn": "51,5 Hz / 0,3 s",
            "trips": "nN Q1"
          },
          {
            "code": "f<",
            "inverter": "47,5 Hz / 0,05 s",
            "lp": 7,
            "measure": "nN",
            "name": "przed obni\u017ceniem cz\u0119stotliwo\u015bci",
            "relay_sn": "47,5 Hz / 0,3 s",
            "trips": "nN Q1"
          },
          {
            "code": "df/dt",
            "inverter": "2 Hz/s / 0,05 s",
            "lp": 8,
            "measure": "nN",
            "name": "cz\u0119stotliwo\u015bciowe (RoCoF)",
            "relay_sn": "2 Hz/s / 0,3 s",
            "trips": "nN Q1"
          },
          {
            "code": "G0>",
            "inverter": "\u2014",
            "lp": 9,
            "measure": "SN",
            "name": "konduktancyjne",
            "relay_sn": "0,8 mS / 0,3 s",
            "trips": "SN Q0 pole 1"
          },
          {
            "code": "3U0",
            "inverter": "\u2014",
            "lp": 10,
            "measure": "SN",
            "name": "zerowo-napi\u0119ciowe",
            "relay_sn": "30 V / 5 s",
            "trips": "SN Q0 pole 1"
          },
          {
            "code": "I0>",
            "inverter": "\u2014",
            "lp": 11,
            "measure": "SN",
            "name": "zerowo-pr\u0105dowe",
            "relay_sn": "10 A / 0,2 s",
            "trips": "SN Q0 pole 1"
          },
          {
            "code": "SPZ",
            "inverter": "od f>, f<, df/dt, Ust I< / 60 s",
            "lp": 12,
            "measure": "nN",
            "name": "samoczynne ponowne za\u0142\u0105czenie",
            "relay_sn": "od f>, f<, df/dt, Ust I< / 600 s",
            "trips": "nN Q1"
          }
        ],
        "philosophy": {
          "hard": "zwarcia/doziemienia/Ust II> \u2192 SN Q0 pole 1 (izolacja od OSD)",
          "soft": "f>/f</df-dt, Ust I>/I< \u2192 nN Q1 (mniej inwazyjne, SPZ 600 s)"
        },
        "source_ref": "dok:1.18_Wykaz_nastaw_i_zabezpieczen_Buk1"
      },
      "grid_earthing": {
        "ik_1f_ka": 0.12,
        "imd_it_nn": true,
        "neutral_point": "kompensowana",
        "note_pl": "nN IT: 1. doziemienie bez pr\u0105du \u2014 IMD sygnalizuje; SN: I\u2033k1f-z z uziemienia neutralnego OSD",
        "source_ref": "norma:PN-EN_60909_doziemienie;OSD:punkt_neutralny_SN"
      },
      "machine_type": "IBG",
      "nc_rfg_class": "C",
      "power_hierarchy": {
        "p_osiagalna_kw": 999.5999999999999,
        "p_przylacz_kw": 999.5999999999999,
        "p_zainst_kw": 999.5999999999999,
        "pn_ac_kw": 999.5999999999999,
        "valid": true
      },
      "protection_codes": [
        "I>",
        "I>>",
        "Ust II>",
        "G0>",
        "3U0",
        "I0>"
      ],
      "schematic": {
        "ct": {
          "cores": [
            "I 5VA 0,2s(FS5) pomiar",
            "II 5VA 0,2s analizator",
            "III 5VA 5P10 zab."
          ],
          "idyn_ka": 40.0,
          "ith_ka": 16.0,
          "ratio": "40/5/5/5 A/A",
          "type": "CTM 20"
        },
        "dc_ac_ratio": 1.0,
        "inverters": "3 \u00d7 ~333 kW (BTVC 315 A/800 V na pole)",
        "nn_grid": "IT",
        "nn_kv": 0.8,
        "nn_main_breaker": "Q1 3WA1108 \u00b7 800 A \u00b7 1000 V \u00b7 I>=720 A (0,9 In) \u00b7 I>>=4000 A (4 In)",
        "own_needs": "RPW-PV \u00b7 TS 5 kVA 800/230 V \u00b7 F0=HN-C20/1 \u00b7 F1-F10",
        "pv_modules": "JA SOLAR JAM72D40-595/MB \u00b7 595 Wp \u00b7 3\u00d7560 szt = 999.6 kWp DC",
        "sn_kv": 15.75,
        "source_ref": "schemat:stacja_TR_PV1MW_Buk1_wykonawczy",
        "transformer": "1000 kVA \u00b7 15,75/0,8 kV \u00b7 POLIM-D18N",
        "vt": {
          "ratio": "15/\u221a3 : 4\u00d7(0,1/\u221a3)",
          "type": "VTB 20",
          "windings": [
            "I pomiar 0,2",
            "II pomiar 0,2",
            "III zab. 3P",
            "IV zab. 3P (otwarty tr\u00f3jk\u0105t)"
          ]
        }
      },
      "technology": "PV 1 MW \u201eBuk 1\u201d",
      "withstand": {
        "nn_idyn_ka": 105.0,
        "sn_idyn_ka": 40.0,
        "source_ref": "karta:CTM20_Idyn;karta:3WA1110_Icm"
      }
    },
    "voltage_flow": {
      "branches": {
        "sr/branch/in": {
          "branch_ref": "sr/branch/in",
          "direction": "reverse",
          "i_a": 37.76,
          "loading_percent": 5.99,
          "p_mw": -0.9809,
          "q_mvar": 0.0145,
          "s_mva": 0.981
        },
        "sr/branch/inv1": {
          "branch_ref": "sr/branch/inv1",
          "direction": "reverse",
          "i_a": 240.32,
          "loading_percent": 38.15,
          "p_mw": -0.3332,
          "q_mvar": 0.0,
          "s_mva": 0.3332
        },
        "sr/branch/inv2": {
          "branch_ref": "sr/branch/inv2",
          "direction": "reverse",
          "i_a": 240.32,
          "loading_percent": 38.15,
          "p_mw": -0.3332,
          "q_mvar": 0.0,
          "s_mva": 0.3332
        },
        "sr/branch/inv3": {
          "branch_ref": "sr/branch/inv3",
          "direction": "reverse",
          "i_a": 240.32,
          "loading_percent": 38.15,
          "p_mw": -0.3332,
          "q_mvar": 0.0,
          "s_mva": 0.3332
        },
        "sr/branch/tr": {
          "branch_ref": "sr/branch/tr",
          "direction": "reverse",
          "i_a": 35.96,
          "loading_percent": null,
          "p_mw": -0.9815,
          "q_mvar": 0.0102,
          "s_mva": 0.9816
        }
      },
      "buses": {
        "NN_800": {
          "bus_ref": "NN_800",
          "deviation_percent": 0.06,
          "u_kv": 0.8005,
          "u_pu": 1.0006,
          "un_kv": 0.8
        },
        "SN_PCC": {
          "bus_ref": "SN_PCC",
          "deviation_percent": 0.056,
          "u_kv": 15.7589,
          "u_pu": 1.00056,
          "un_kv": 15.75
        }
      }
    }
  },
  "G5-BESS": {
    "archetype": "G5-BESS",
    "boundary": {
      "enm_connection_variant": "DEDICATED_MV_CONNECTION",
      "metered": true,
      "on_bus_ref": "SN_PCC",
      "source_ref": "enm:Generator.connection_variant=DEDICATED_MV_CONNECTION",
      "variant": "G-ZKSN"
    },
    "case_ref_pf": "ROZPLYW_GEN_MAX",
    "case_ref_sc": "ZWARCIOWY_MAKS",
    "converged": true,
    "enm_hash": "oze-substrate/G5-BESS",
    "fields": [
      {
        "abb_cell": "CBC",
        "apparatus": [
          {
            "catalog": null,
            "designation": "Q1 (od\u0142\u0105cznik szynowy)",
            "device_ref": "line/ds",
            "kind": "DS",
            "placement": "UPSTREAM",
            "source_ref": "enm:BayPrimaryDevice.kind=DS"
          },
          {
            "catalog": null,
            "designation": "Q0 (wy\u0142\u0105cznik SN)",
            "device_ref": "line/cb",
            "kind": "CB",
            "placement": "MIDSTREAM",
            "source_ref": "enm:BayPrimaryDevice.kind=CB"
          },
          {
            "catalog": null,
            "designation": "przek\u0142adnik pr\u0105dowy",
            "device_ref": "line/ct",
            "kind": "CT",
            "placement": "MIDSTREAM",
            "source_ref": "std:IEC_61869_CT"
          },
          {
            "catalog": null,
            "designation": "przek\u0142adnik napi\u0119ciowy",
            "device_ref": "line/vt",
            "kind": "VT",
            "placement": "OFF_PATH",
            "source_ref": "std:IEC_61869_VT"
          },
          {
            "catalog": null,
            "designation": "ogranicznik przepi\u0119\u0107",
            "device_ref": "line/sa",
            "kind": "SURGE_ARRESTER",
            "placement": "OFF_PATH",
            "source_ref": "enm:BayPrimaryDevice.kind=SURGE_ARRESTER"
          },
          {
            "catalog": null,
            "designation": "g\u0142owica kablowa",
            "device_ref": "line/head",
            "kind": "CABLE_HEAD",
            "placement": "DOWNSTREAM",
            "source_ref": "enm:BayPrimaryDevice.kind=CABLE_HEAD"
          },
          {
            "catalog": null,
            "designation": "uziemnik",
            "device_ref": "line/es",
            "kind": "ES",
            "placement": "GROUND_BRANCH",
            "source_ref": "enm:BayPrimaryDevice.kind=ES"
          }
        ],
        "field_id": "g5-line",
        "interface_protection": true,
        "kind": "POLE LINIOWE SN",
        "on_bus_ref": "SN_PCC",
        "port": {
          "cable": "kabel SN do OSD (typ wg projektu)",
          "entry_side": "BOK-L",
          "kind": "sn_input",
          "nominal_voltage_kv": 15.0,
          "occupied_by": "seg/kabel-osd",
          "port_id": "line/port",
          "source_ref": "enm:Port.kind=sn_input;std:przylacze_SN"
        },
        "protection_codes": [
          "67",
          "67N",
          "81U",
          "81O",
          "df/dt",
          "27",
          "59",
          "59N",
          "anti-islanding"
        ],
        "role": "connection",
        "source_ref": "enm:Bay.bay_role=LINIA_OUT;std:IEC_62271_pole_liniowe"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [
          {
            "catalog": null,
            "designation": "roz\u0142\u0105cznik",
            "device_ref": "trafo/ls",
            "kind": "LOAD_SWITCH",
            "placement": "MIDSTREAM",
            "source_ref": "enm:BayPrimaryDevice.kind=LOAD_SWITCH"
          },
          {
            "catalog": null,
            "designation": "uziemnik",
            "device_ref": "trafo/es",
            "kind": "ES",
            "placement": "GROUND_BRANCH",
            "source_ref": "enm:BayPrimaryDevice.kind=ES"
          },
          {
            "catalog": null,
            "designation": "g\u0142owica \u2192 trafo",
            "device_ref": "trafo/head",
            "kind": "CABLE_HEAD",
            "placement": "DOWNSTREAM",
            "source_ref": "enm:BayPrimaryDevice.kind=CABLE_HEAD"
          }
        ],
        "field_id": "g5-trafo",
        "interface_protection": false,
        "kind": "POLE TRANSFORMATOROWE",
        "on_bus_ref": "SN_PCC",
        "port": null,
        "protection_codes": [],
        "role": "transformer",
        "source_ref": "enm:Bay.bay_role=TRANSFORMATOR;std:IEC_62271_pole_trafo"
      },
      {
        "abb_cell": "CBC",
        "apparatus": [],
        "field_id": "g5-q1",
        "interface_protection": true,
        "kind": "Q1 nN (wy\u0142\u0105cznik g\u0142\u00f3wny)",
        "on_bus_ref": "NN",
        "port": null,
        "protection_codes": [
          "I>",
          "I>>"
        ],
        "role": "breaker",
        "source_ref": "std:IEC_60947_nN_ACB"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g5-pcs1",
        "interface_protection": false,
        "kind": "PCS 1 \u00b7 500 kW (2-kier.)",
        "on_bus_ref": "NN",
        "port": null,
        "protection_codes": [],
        "role": "source",
        "source_ref": "enm:Generator.gen_type=bess;std:NC_RfG_pcs_1"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g5-pcs2",
        "interface_protection": false,
        "kind": "PCS 2 \u00b7 500 kW (2-kier.)",
        "on_bus_ref": "NN",
        "port": null,
        "protection_codes": [],
        "role": "source",
        "source_ref": "enm:Generator.gen_type=bess;std:NC_RfG_pcs_2"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g5-own",
        "interface_protection": false,
        "kind": "potrzeby w\u0142asne (HVAC/BMS)",
        "on_bus_ref": "NN",
        "port": null,
        "protection_codes": [],
        "role": "load",
        "source_ref": "enm:Bay.specialization=POTRZEBY_WLASNE;std:potrzeby_wlasne"
      }
    ],
    "pcc_bus_ref": "SN_PCC",
    "schema": "sld_oze_archetype_companion_v1",
    "short_circuit": {
      "buses": {
        "NN": {
          "bus_ref": "NN",
          "icw_ka": 50.0,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 31.998,
            "ikss_ka": 31.998,
            "ip_ka": 69.399,
            "ith_ka": 31.998,
            "kappa": 1.534,
            "rx_ratio": 0.2153,
            "sk_mva": 22.17,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "NN",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.00820538328888,
                    "re": 0.00176700529383
                  },
                  "z2_ohm": {
                    "im": 0.00820538328888,
                    "re": 0.00176700529383
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.00176700529383,
                  "x_ohm": 0.00820538328888,
                  "z_equiv_abs_ohm": 0.008393486917,
                  "z_equiv_ohm": {
                    "im": 0.00820538328888,
                    "re": 0.00176700529383
                  }
                },
                "substitution": "\\left(0.00176701 + j 0.00820538\\right)",
                "substitution_latex": "\\left(0.00176701 + j 0.00820538\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 1.1,
                  "un_v": 400.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.008393486917
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 31997.6747319
                },
                "substitution": "\\frac{1.1 \\cdot 400 \\cdot 0.57735}{0.00839349}",
                "substitution_latex": "\\frac{1.1 \\cdot 400 \\cdot 0.57735}{0.00839349}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.00176700529383,
                  "rx_ratio": 0.215347075404,
                  "x_ohm": 0.00820538328888
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.53363420334
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.215347}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.215347}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 31997.6747319,
                  "kappa": 1.53363420334
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 69399.3180407
                },
                "substitution": "1.53363 \\cdot \\sqrt{2} \\cdot 31997.7",
                "substitution_latex": "1.53363 \\cdot \\sqrt{2} \\cdot 31997.7",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.00115306934016,
                  "ikss_a": 31997.6747319,
                  "kappa": 1.53363420334,
                  "ta_s": 0.014781249552,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 31997.6807893
                },
                "substitution": "31997.7 \\cdot \\sqrt{1 + \\left((1.53363 - 1) \\cdot 0.00115307\\right)^2}",
                "substitution_latex": "31997.7 \\cdot \\sqrt{1 + \\left((1.53363 - 1) \\cdot 0.00115307\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 31997.6747319,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 31997.6747319
                },
                "substitution": "31997.7 \\cdot \\sqrt{1}",
                "substitution_latex": "31997.7 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 31997.6747319,
                  "un_v": 400.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 22.1686393439
                },
                "substitution": "\\sqrt{3} \\cdot 400 \\cdot 31997.7 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 400 \\cdot 31997.7 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 27.871,
            "ith_ka": 27.871,
            "kappa": 1.534,
            "sk_mva": 19.31,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "NN",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.00820538328888,
                    "re": 0.00176700529383
                  },
                  "z2_ohm": {
                    "im": 0.00820538328888,
                    "re": 0.00176700529383
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.00176700529383,
                  "x_ohm": 0.00820538328888,
                  "z_equiv_abs_ohm": 0.008393486917,
                  "z_equiv_ohm": {
                    "im": 0.00820538328888,
                    "re": 0.00176700529383
                  }
                },
                "substitution": "\\left(0.00176701 + j 0.00820538\\right)",
                "substitution_latex": "\\left(0.00176701 + j 0.00820538\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 0.95,
                  "un_v": 400.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.008393486917
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 27870.5441967
                },
                "substitution": "\\frac{0.95 \\cdot 400 \\cdot 0.57735}{0.00839349}",
                "substitution_latex": "\\frac{0.95 \\cdot 400 \\cdot 0.57735}{0.00839349}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.00176700529383,
                  "rx_ratio": 0.215347075404,
                  "x_ohm": 0.00820538328888
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.53363420334
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.215347}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.215347}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 27870.5441967,
                  "kappa": 1.53363420334
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 60448.0412056
                },
                "substitution": "1.53363 \\cdot \\sqrt{2} \\cdot 27870.5",
                "substitution_latex": "1.53363 \\cdot \\sqrt{2} \\cdot 27870.5",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.00115306934016,
                  "ikss_a": 27870.5441967,
                  "kappa": 1.53363420334,
                  "ta_s": 0.014781249552,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 27870.5494728
                },
                "substitution": "27870.5 \\cdot \\sqrt{1 + \\left((1.53363 - 1) \\cdot 0.00115307\\right)^2}",
                "substitution_latex": "27870.5 \\cdot \\sqrt{1 + \\left((1.53363 - 1) \\cdot 0.00115307\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 27870.5441967,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 27870.5441967
                },
                "substitution": "27870.5 \\cdot \\sqrt{1}",
                "substitution_latex": "27870.5 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 27870.5441967,
                  "un_v": 400.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 19.3092794333
                },
                "substitution": "\\sqrt{3} \\cdot 400 \\cdot 27870.5 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 400 \\cdot 27870.5 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ik_contribution_ka": 1.732,
            "is_synchronous_machine": false,
            "machine_type": "IBG",
            "model": "IEC 60909 \u00a76.7 \u2014 \u017ar\u00f3d\u0142o pr\u0105dowe ograniczone (k\u00b7I_rated)"
          },
          "un_kv": 0.4,
          "verification": {
            "icw_ka": 50.0,
            "ikss_max_ka": 31.998,
            "passed": true,
            "rule": "ikss_max_le_icw"
          }
        },
        "SN_PCC": {
          "bus_ref": "SN_PCC",
          "icw_ka": 16.0,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 11.201,
            "ikss_ka": 11.201,
            "ip_ka": 26.278,
            "ith_ka": 11.201,
            "kappa": 1.659,
            "rx_ratio": 0.1426,
            "sk_mva": 291.01,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "SN_PCC",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.996,
                    "re": 0.14200225
                  },
                  "z2_ohm": {
                    "im": 0.996,
                    "re": 0.14200225
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.14200225,
                  "x_ohm": 0.996,
                  "z_equiv_abs_ohm": 1.00607188561,
                  "z_equiv_ohm": {
                    "im": 0.996,
                    "re": 0.14200225
                  }
                },
                "substitution": "\\left(0.142002 + j 0.996\\right)",
                "substitution_latex": "\\left(0.142002 + j 0.996\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 1.1,
                  "un_v": 15000.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 1.00607188561
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 11200.8368634
                },
                "substitution": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{1.00607}",
                "substitution_latex": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{1.00607}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.14200225,
                  "rx_ratio": 0.142572540161,
                  "x_ohm": 0.996
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.658955589
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.142573}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.142573}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 11200.8368634,
                  "kappa": 1.658955589
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 26278.4793054
                },
                "substitution": "1.65896 \\cdot \\sqrt{2} \\cdot 11200.8",
                "substitution_latex": "1.65896 \\cdot \\sqrt{2} \\cdot 11200.8",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.0113442026223,
                  "ikss_a": 11200.8368634,
                  "kappa": 1.658955589,
                  "ta_s": 0.0223261706515,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 11201.1498132
                },
                "substitution": "11200.8 \\cdot \\sqrt{1 + \\left((1.65896 - 1) \\cdot 0.0113442\\right)^2}",
                "substitution_latex": "11200.8 \\cdot \\sqrt{1 + \\left((1.65896 - 1) \\cdot 0.0113442\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 11200.8368634,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 11200.8368634
                },
                "substitution": "11200.8 \\cdot \\sqrt{1}",
                "substitution_latex": "11200.8 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 11200.8368634,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 291.006278022
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 11200.8 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 11200.8 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 9.91,
            "ith_ka": 9.91,
            "kappa": 1.659,
            "sk_mva": 257.46,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "SN_PCC",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.996,
                    "re": 0.14200225
                  },
                  "z2_ohm": {
                    "im": 0.996,
                    "re": 0.14200225
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.14200225,
                  "x_ohm": 0.996,
                  "z_equiv_abs_ohm": 1.00607188561,
                  "z_equiv_ohm": {
                    "im": 0.996,
                    "re": 0.14200225
                  }
                },
                "substitution": "\\left(0.142002 + j 0.996\\right)",
                "substitution_latex": "\\left(0.142002 + j 0.996\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 0.95,
                  "un_v": 15000.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 1.00607188561
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 9909.63876492
                },
                "substitution": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{1.00607}",
                "substitution_latex": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{1.00607}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.14200225,
                  "rx_ratio": 0.142572540161,
                  "x_ohm": 0.996
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.658955589
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.142573}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.142573}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 9909.63876492,
                  "kappa": 1.658955589
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 23249.1768591
                },
                "substitution": "1.65896 \\cdot \\sqrt{2} \\cdot 9909.64",
                "substitution_latex": "1.65896 \\cdot \\sqrt{2} \\cdot 9909.64",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.0113442026223,
                  "ikss_a": 9909.63876492,
                  "kappa": 1.658955589,
                  "ta_s": 0.0223261706515,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 9909.91563881
                },
                "substitution": "9909.64 \\cdot \\sqrt{1 + \\left((1.65896 - 1) \\cdot 0.0113442\\right)^2}",
                "substitution_latex": "9909.64 \\cdot \\sqrt{1 + \\left((1.65896 - 1) \\cdot 0.0113442\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 9909.63876492,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 9909.63876492
                },
                "substitution": "9909.64 \\cdot \\sqrt{1}",
                "substitution_latex": "9909.64 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 9909.63876492,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 257.459967382
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 9909.64 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 9909.64 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ik_contribution_ka": 1.732,
            "is_synchronous_machine": false,
            "machine_type": "IBG",
            "model": "IEC 60909 \u00a76.7 \u2014 \u017ar\u00f3d\u0142o pr\u0105dowe ograniczone (k\u00b7I_rated)"
          },
          "un_kv": 15.0,
          "verification": {
            "icw_ka": 16.0,
            "ikss_max_ka": 11.201,
            "passed": true,
            "rule": "ikss_max_le_icw"
          }
        }
      },
      "standard": "IEC 60909"
    },
    "source": {
      "bidirectional": true,
      "control_mode": "P(f) \u00b7 Q(U) \u00b7 2-kier.",
      "grid_earthing": {
        "ik_1f_ka": 0.12,
        "imd_it_nn": true,
        "neutral_point": "kompensowana",
        "note_pl": "nN IT: 1. doziemienie bez pr\u0105du \u2014 IMD; SN: I\u2033k1f-z z uziemienia neutralnego OSD",
        "source_ref": "norma:PN-EN_60909_doziemienie;OSD:punkt_neutralny_SN"
      },
      "machine_type": "IBG",
      "nc_rfg_class": "C",
      "power_hierarchy": {
        "p_osiagalna_kw": 950.0,
        "p_przylacz_kw": 1000.0,
        "p_zainst_kw": 1000.0,
        "pn_ac_kw": 1000.0,
        "valid": true
      },
      "protection_codes": [
        "67",
        "67N",
        "81U",
        "81O",
        "df/dt",
        "27",
        "59",
        "59N",
        "anti-islanding"
      ],
      "storage": {
        "bidirectional": true,
        "capacity_kwh": 2000.0,
        "charge_kw": 1000.0,
        "discharge_kw": 1000.0,
        "duration_h": 2.0,
        "n_pcs": 2,
        "pcs_kw": 500.0,
        "power_kw": 1000.0,
        "source_ref": "std:IEC_62933;enm:Generator.gen_type=bess"
      },
      "technology": "BESS (magazyn energii)",
      "withstand": {
        "nn_idyn_ka": 105.0,
        "sn_idyn_ka": 40.0,
        "source_ref": "karta:CTM20_Idyn;karta:rozdzielnica_nN"
      }
    },
    "voltage_flow": {
      "branches": {
        "sr/branch/in": {
          "branch_ref": "sr/branch/in",
          "direction": "reverse",
          "i_a": 38.08,
          "loading_percent": 6.04,
          "p_mw": -0.9893,
          "q_mvar": 0.0145,
          "s_mva": 0.9894
        },
        "sr/branch/pcs1": {
          "branch_ref": "sr/branch/pcs1",
          "direction": "reverse",
          "i_a": 721.24,
          "loading_percent": 114.48,
          "p_mw": -0.5,
          "q_mvar": 0.0,
          "s_mva": 0.5
        },
        "sr/branch/pcs2": {
          "branch_ref": "sr/branch/pcs2",
          "direction": "reverse",
          "i_a": 721.24,
          "loading_percent": 114.48,
          "p_mw": -0.5,
          "q_mvar": 0.0,
          "s_mva": 0.5
        },
        "sr/branch/tr": {
          "branch_ref": "sr/branch/tr",
          "direction": "reverse",
          "i_a": 38.08,
          "loading_percent": null,
          "p_mw": -0.9899,
          "q_mvar": 0.0101,
          "s_mva": 0.99
        }
      },
      "buses": {
        "NN": {
          "bus_ref": "NN",
          "deviation_percent": 0.058,
          "u_kv": 0.4002,
          "u_pu": 1.00058,
          "un_kv": 0.4
        },
        "SN_PCC": {
          "bus_ref": "SN_PCC",
          "deviation_percent": 0.057,
          "u_kv": 15.0086,
          "u_pu": 1.00057,
          "un_kv": 15.0
        }
      }
    }
  },
  "G6-WIND": {
    "archetype": "G6-WIND",
    "boundary": {
      "enm_connection_variant": "DEDICATED_MV_CONNECTION",
      "metered": true,
      "on_bus_ref": "SN_PCC",
      "source_ref": "enm:Generator.connection_variant=DEDICATED_MV_CONNECTION",
      "variant": "G-GPZ"
    },
    "case_ref_pf": "ROZPLYW_GEN_MAX",
    "case_ref_sc": "ZWARCIOWY_MAKS",
    "converged": true,
    "enm_hash": "oze-substrate/G6-WIND",
    "fields": [
      {
        "abb_cell": "CBC",
        "apparatus": [
          {
            "catalog": null,
            "designation": "Q1 (od\u0142\u0105cznik szynowy)",
            "device_ref": "line/ds",
            "kind": "DS",
            "placement": "UPSTREAM",
            "source_ref": "enm:BayPrimaryDevice.kind=DS"
          },
          {
            "catalog": null,
            "designation": "Q0 (wy\u0142\u0105cznik SN)",
            "device_ref": "line/cb",
            "kind": "CB",
            "placement": "MIDSTREAM",
            "source_ref": "enm:BayPrimaryDevice.kind=CB"
          },
          {
            "catalog": null,
            "designation": "przek\u0142adnik pr\u0105dowy",
            "device_ref": "line/ct",
            "kind": "CT",
            "placement": "MIDSTREAM",
            "source_ref": "std:IEC_61869_CT"
          },
          {
            "catalog": null,
            "designation": "przek\u0142adnik napi\u0119ciowy",
            "device_ref": "line/vt",
            "kind": "VT",
            "placement": "OFF_PATH",
            "source_ref": "std:IEC_61869_VT"
          },
          {
            "catalog": null,
            "designation": "ogranicznik przepi\u0119\u0107",
            "device_ref": "line/sa",
            "kind": "SURGE_ARRESTER",
            "placement": "OFF_PATH",
            "source_ref": "enm:BayPrimaryDevice.kind=SURGE_ARRESTER"
          },
          {
            "catalog": null,
            "designation": "g\u0142owica kablowa",
            "device_ref": "line/head",
            "kind": "CABLE_HEAD",
            "placement": "DOWNSTREAM",
            "source_ref": "enm:BayPrimaryDevice.kind=CABLE_HEAD"
          },
          {
            "catalog": null,
            "designation": "uziemnik",
            "device_ref": "line/es",
            "kind": "ES",
            "placement": "GROUND_BRANCH",
            "source_ref": "enm:BayPrimaryDevice.kind=ES"
          }
        ],
        "field_id": "g6-line",
        "interface_protection": true,
        "kind": "POLE LINIOWE SN (przy\u0142\u0105cze)",
        "on_bus_ref": "SN_PCC",
        "port": {
          "cable": "kabel SN do OSD (typ wg projektu)",
          "entry_side": "BOK-L",
          "kind": "sn_input",
          "nominal_voltage_kv": 15.0,
          "occupied_by": "seg/kabel-osd",
          "port_id": "line/port",
          "source_ref": "enm:Port.kind=sn_input;std:przylacze_SN"
        },
        "protection_codes": [
          "67",
          "67N",
          "81U",
          "81O",
          "df/dt",
          "27",
          "59",
          "59N",
          "anti-islanding"
        ],
        "role": "connection",
        "source_ref": "enm:Bay.bay_role=LINIA_OUT;std:IEC_62271_pole_liniowe"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g6-wtg1",
        "interface_protection": false,
        "kind": "WTG 1 \u00b7 2 MW",
        "on_bus_ref": "SN_PCC",
        "port": null,
        "protection_codes": [],
        "role": "source",
        "source_ref": "enm:Generator.gen_type=wind_t4;std:IEC_61400_wtg_1"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g6-wtg2",
        "interface_protection": false,
        "kind": "WTG 2 \u00b7 2 MW",
        "on_bus_ref": "SN_PCC",
        "port": null,
        "protection_codes": [],
        "role": "source",
        "source_ref": "enm:Generator.gen_type=wind_t4;std:IEC_61400_wtg_2"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g6-wtg3",
        "interface_protection": false,
        "kind": "WTG 3 \u00b7 2 MW",
        "on_bus_ref": "SN_PCC",
        "port": null,
        "protection_codes": [],
        "role": "source",
        "source_ref": "enm:Generator.gen_type=wind_t4;std:IEC_61400_wtg_3"
      }
    ],
    "pcc_bus_ref": "SN_PCC",
    "schema": "sld_oze_archetype_companion_v1",
    "short_circuit": {
      "buses": {
        "SN_PCC": {
          "bus_ref": "SN_PCC",
          "icw_ka": 25.0,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 21.496,
            "ikss_ka": 21.495,
            "ip_ka": 50.431,
            "ith_ka": 21.495,
            "kappa": 1.659,
            "rx_ratio": 0.1426,
            "sk_mva": 558.46,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "SN_PCC",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.6096,
                    "re": 0.08690225
                  },
                  "z2_ohm": {
                    "im": 0.6096,
                    "re": 0.08690225
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.08690225,
                  "x_ohm": 0.6096,
                  "z_equiv_abs_ohm": 0.615763072176,
                  "z_equiv_ohm": {
                    "im": 0.6096,
                    "re": 0.08690225
                  }
                },
                "substitution": "\\left(0.0869023 + j 0.6096\\right)",
                "substitution_latex": "\\left(0.0869023 + j 0.6096\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 1.1,
                  "un_v": 15000.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.615763072176
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 21495.2142859
                },
                "substitution": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{0.615763}",
                "substitution_latex": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{0.615763}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.08690225,
                  "rx_ratio": 0.142556184383,
                  "x_ohm": 0.6096
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.65898694162
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.142556}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.142556}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 21495.2142859,
                  "kappa": 1.65898694162
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 50431.2513418
                },
                "substitution": "1.65899 \\cdot \\sqrt{2} \\cdot 21495.2",
                "substitution_latex": "1.65899 \\cdot \\sqrt{2} \\cdot 21495.2",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.0113500331334,
                  "ikss_a": 21495.2142859,
                  "kappa": 1.65898694162,
                  "ta_s": 0.022328732181,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 21495.8155338
                },
                "substitution": "21495.2 \\cdot \\sqrt{1 + \\left((1.65899 - 1) \\cdot 0.01135\\right)^2}",
                "substitution_latex": "21495.2 \\cdot \\sqrt{1 + \\left((1.65899 - 1) \\cdot 0.01135\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 21495.2142859,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 21495.2142859
                },
                "substitution": "21495.2 \\cdot \\sqrt{1}",
                "substitution_latex": "21495.2 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 21495.2142859,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 558.462048941
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 21495.2 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 21495.2 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 19.386,
            "ith_ka": 19.386,
            "kappa": 1.659,
            "sk_mva": 503.65,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "SN_PCC",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.6096,
                    "re": 0.08690225
                  },
                  "z2_ohm": {
                    "im": 0.6096,
                    "re": 0.08690225
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.08690225,
                  "x_ohm": 0.6096,
                  "z_equiv_abs_ohm": 0.615763072176,
                  "z_equiv_ohm": {
                    "im": 0.6096,
                    "re": 0.08690225
                  }
                },
                "substitution": "\\left(0.0869023 + j 0.6096\\right)",
                "substitution_latex": "\\left(0.0869023 + j 0.6096\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 0.95,
                  "un_v": 15000.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.615763072176
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 19385.5747762
                },
                "substitution": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{0.615763}",
                "substitution_latex": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{0.615763}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.08690225,
                  "rx_ratio": 0.142556184383,
                  "x_ohm": 0.6096
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.65898694162
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.142556}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.142556}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 19385.5747762,
                  "kappa": 1.65898694162
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 45481.6956436
                },
                "substitution": "1.65899 \\cdot \\sqrt{2} \\cdot 19385.6",
                "substitution_latex": "1.65899 \\cdot \\sqrt{2} \\cdot 19385.6",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.0113500331334,
                  "ikss_a": 19385.5747762,
                  "kappa": 1.65898694162,
                  "ta_s": 0.022328732181,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 19386.1170148
                },
                "substitution": "19385.6 \\cdot \\sqrt{1 + \\left((1.65899 - 1) \\cdot 0.01135\\right)^2}",
                "substitution_latex": "19385.6 \\cdot \\sqrt{1 + \\left((1.65899 - 1) \\cdot 0.01135\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 19385.5747762,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 19385.5747762
                },
                "substitution": "19385.6 \\cdot \\sqrt{1}",
                "substitution_latex": "19385.6 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 19385.5747762,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 503.652006694
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 19385.6 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 19385.6 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ik_contribution_ka": 0.277,
            "is_synchronous_machine": false,
            "machine_type": "IBG",
            "model": "IEC 60909 \u00a76.7 \u2014 \u017ar\u00f3d\u0142o pr\u0105dowe ograniczone (k\u00b7I_rated)"
          },
          "un_kv": 15.0,
          "verification": {
            "icw_ka": 25.0,
            "ikss_max_ka": 21.495,
            "passed": true,
            "rule": "ikss_max_le_icw"
          }
        },
        "WTG_LV_1": {
          "bus_ref": "WTG_LV_1",
          "icw_ka": 50.0,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 40.459,
            "ikss_ka": 40.459,
            "ip_ka": 87.873,
            "ith_ka": 40.459,
            "kappa": 1.536,
            "rx_ratio": 0.214,
            "sk_mva": 48.35,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "WTG_LV_1",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.0124442174245,
                    "re": 0.00266261934422
                  },
                  "z2_ohm": {
                    "im": 0.0124442174245,
                    "re": 0.00266261934422
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.00266261934422,
                  "x_ohm": 0.0124442174245,
                  "z_equiv_abs_ohm": 0.0127258826444,
                  "z_equiv_ohm": {
                    "im": 0.0124442174245,
                    "re": 0.00266261934422
                  }
                },
                "substitution": "\\left(0.00266262 + j 0.0124442\\right)",
                "substitution_latex": "\\left(0.00266262 + j 0.0124442\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 1.1,
                  "un_v": 690.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.0127258826444
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 40458.9812029
                },
                "substitution": "\\frac{1.1 \\cdot 690 \\cdot 0.57735}{0.0127259}",
                "substitution_latex": "\\frac{1.1 \\cdot 690 \\cdot 0.57735}{0.0127259}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.00266261934422,
                  "rx_ratio": 0.2139643863,
                  "x_ohm": 0.0124442174245
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.53576921762
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.213964}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.213964}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 40458.9812029,
                  "kappa": 1.53576921762
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 87873.0901202
                },
                "substitution": "1.53577 \\cdot \\sqrt{2} \\cdot 40459",
                "substitution_latex": "1.53577 \\cdot \\sqrt{2} \\cdot 40459",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.00120426068312,
                  "ikss_a": 40458.9812029,
                  "kappa": 1.53576921762,
                  "ta_s": 0.0148767695263,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 40458.9896243
                },
                "substitution": "40459 \\cdot \\sqrt{1 + \\left((1.53577 - 1) \\cdot 0.00120426\\right)^2}",
                "substitution_latex": "40459 \\cdot \\sqrt{1 + \\left((1.53577 - 1) \\cdot 0.00120426\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 40458.9812029,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 40458.9812029
                },
                "substitution": "40459 \\cdot \\sqrt{1}",
                "substitution_latex": "40459 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 40458.9812029,
                  "un_v": 690.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 48.3531376355
                },
                "substitution": "\\sqrt{3} \\cdot 690 \\cdot 40459 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 690 \\cdot 40459 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 35.763,
            "ith_ka": 35.763,
            "kappa": 1.536,
            "sk_mva": 42.74,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "WTG_LV_1",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.0124442174245,
                    "re": 0.00266261934422
                  },
                  "z2_ohm": {
                    "im": 0.0124442174245,
                    "re": 0.00266261934422
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.00266261934422,
                  "x_ohm": 0.0124442174245,
                  "z_equiv_abs_ohm": 0.0127258826444,
                  "z_equiv_ohm": {
                    "im": 0.0124442174245,
                    "re": 0.00266261934422
                  }
                },
                "substitution": "\\left(0.00266262 + j 0.0124442\\right)",
                "substitution_latex": "\\left(0.00266262 + j 0.0124442\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 0.95,
                  "un_v": 690.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.0127258826444
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 35763.3734773
                },
                "substitution": "\\frac{0.95 \\cdot 690 \\cdot 0.57735}{0.0127259}",
                "substitution_latex": "\\frac{0.95 \\cdot 690 \\cdot 0.57735}{0.0127259}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.00266261934422,
                  "rx_ratio": 0.2139643863,
                  "x_ohm": 0.0124442174245
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.53576921762
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.213964}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.213964}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 35763.3734773,
                  "kappa": 1.53576921762
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 77674.6731414
                },
                "substitution": "1.53577 \\cdot \\sqrt{2} \\cdot 35763.4",
                "substitution_latex": "1.53577 \\cdot \\sqrt{2} \\cdot 35763.4",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.00120426068312,
                  "ikss_a": 35763.3734773,
                  "kappa": 1.53576921762,
                  "ta_s": 0.0148767695263,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 35763.3809212
                },
                "substitution": "35763.4 \\cdot \\sqrt{1 + \\left((1.53577 - 1) \\cdot 0.00120426\\right)^2}",
                "substitution_latex": "35763.4 \\cdot \\sqrt{1 + \\left((1.53577 - 1) \\cdot 0.00120426\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 35763.3734773,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 35763.3734773
                },
                "substitution": "35763.4 \\cdot \\sqrt{1}",
                "substitution_latex": "35763.4 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 35763.3734773,
                  "un_v": 690.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 42.7413461398
                },
                "substitution": "\\sqrt{3} \\cdot 690 \\cdot 35763.4 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 690 \\cdot 35763.4 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ik_contribution_ka": 0.277,
            "is_synchronous_machine": false,
            "machine_type": "IBG",
            "model": "IEC 60909 \u00a76.7 \u2014 \u017ar\u00f3d\u0142o pr\u0105dowe ograniczone (k\u00b7I_rated)"
          },
          "un_kv": 0.69,
          "verification": {
            "icw_ka": 50.0,
            "ikss_max_ka": 40.459,
            "passed": true,
            "rule": "ikss_max_le_icw"
          }
        }
      },
      "standard": "IEC 60909"
    },
    "source": {
      "collector": {
        "collector_kv": 15.0,
        "n_turbines": 3,
        "source_ref": "std:IEC_61400;enm:Generator.gen_type=wind_t4_collector",
        "topology": "radial",
        "turbine_kw": 2000.0,
        "turbine_lv_kv": 0.69,
        "turbine_transformer": "0.69/15 kV \u00b7 2.5 MVA"
      },
      "control_mode": "P(f) \u00b7 Q(U)",
      "grid_earthing": {
        "ik_1f_ka": 0.06,
        "imd_it_nn": false,
        "neutral_point": "kompensowana",
        "note_pl": "SN kolektor 15 kV: I\u2033k1f-z z uziemienia neutralnego OSD (kompensowana), pr\u0105d resztkowy \u221d Un; LV turbiny za trafem Dyn \u2014 uziemienie lokalne",
        "source_ref": "norma:PN-EN_60909_doziemienie;OSD:punkt_neutralny_SN"
      },
      "machine_type": "IBG",
      "nc_rfg_class": "C",
      "power_hierarchy": {
        "p_osiagalna_kw": 5700.0,
        "p_przylacz_kw": 6000.0,
        "p_zainst_kw": 6000.0,
        "pn_ac_kw": 6000.0,
        "valid": true
      },
      "protection_codes": [
        "67",
        "67N",
        "81U",
        "81O",
        "df/dt",
        "27",
        "59",
        "59N",
        "anti-islanding"
      ],
      "technology": "Wiatr \u2014 turbiny pe\u0142noprzekszta\u0142tnikowe (Typ 4)",
      "withstand": {
        "nn_idyn_ka": 105.0,
        "sn_idyn_ka": 63.0,
        "source_ref": "norma:IEC_62271_Ipk;norma:IEC_61400"
      }
    },
    "voltage_flow": {
      "branches": {
        "sr/branch/in": {
          "branch_ref": "sr/branch/in",
          "direction": "reverse",
          "i_a": 230.43,
          "loading_percent": 36.58,
          "p_mw": -5.986,
          "q_mvar": 0.0977,
          "s_mva": 5.9868
        },
        "sr/branch/wtg-tr1": {
          "branch_ref": "sr/branch/wtg-tr1",
          "direction": "reverse",
          "i_a": 76.81,
          "loading_percent": null,
          "p_mw": -2.0,
          "q_mvar": 0.0002,
          "s_mva": 2.0
        },
        "sr/branch/wtg-tr2": {
          "branch_ref": "sr/branch/wtg-tr2",
          "direction": "reverse",
          "i_a": 76.81,
          "loading_percent": null,
          "p_mw": -2.0,
          "q_mvar": 0.0002,
          "s_mva": 2.0
        },
        "sr/branch/wtg-tr3": {
          "branch_ref": "sr/branch/wtg-tr3",
          "direction": "reverse",
          "i_a": 76.81,
          "loading_percent": null,
          "p_mw": -2.0,
          "q_mvar": 0.0002,
          "s_mva": 2.0
        }
      },
      "buses": {
        "SN_PCC": {
          "bus_ref": "SN_PCC",
          "deviation_percent": 0.218,
          "u_kv": 15.0327,
          "u_pu": 1.00218,
          "un_kv": 15.0
        },
        "WTG_LV_1": {
          "bus_ref": "WTG_LV_1",
          "deviation_percent": 0.22,
          "u_kv": 0.6915,
          "u_pu": 1.0022,
          "un_kv": 0.69
        }
      }
    }
  },
  "G7-BIOGAZ": {
    "archetype": "G7-BIOGAZ",
    "boundary": {
      "enm_connection_variant": "DEDICATED_MV_CONNECTION",
      "metered": true,
      "on_bus_ref": "SN_PCC",
      "source_ref": "enm:Generator.connection_variant=DEDICATED_MV_CONNECTION",
      "variant": "G-GPZ"
    },
    "case_ref_pf": "ROZPLYW_GEN_MAX",
    "case_ref_sc": "ZWARCIOWY_MAKS",
    "converged": true,
    "enm_hash": "oze-substrate/G7-BIOGAZ",
    "fields": [
      {
        "abb_cell": "CBC",
        "apparatus": [
          {
            "catalog": null,
            "designation": "Q1 (od\u0142\u0105cznik szynowy)",
            "device_ref": "g7-line/ds",
            "kind": "DS",
            "placement": "UPSTREAM",
            "source_ref": "enm:BayPrimaryDevice.kind=DS"
          },
          {
            "catalog": null,
            "designation": "Q0 (wy\u0142\u0105cznik SN)",
            "device_ref": "g7-line/cb",
            "kind": "CB",
            "placement": "MIDSTREAM",
            "source_ref": "enm:BayPrimaryDevice.kind=CB"
          },
          {
            "catalog": null,
            "designation": "przek\u0142adnik pr\u0105dowy",
            "device_ref": "g7-line/ct",
            "kind": "CT",
            "placement": "MIDSTREAM",
            "source_ref": "std:IEC_61869_CT"
          },
          {
            "catalog": null,
            "designation": "przek\u0142adnik napi\u0119ciowy",
            "device_ref": "g7-line/vt",
            "kind": "VT",
            "placement": "OFF_PATH",
            "source_ref": "std:IEC_61869_VT"
          },
          {
            "catalog": null,
            "designation": "ogranicznik przepi\u0119\u0107",
            "device_ref": "g7-line/sa",
            "kind": "SURGE_ARRESTER",
            "placement": "OFF_PATH",
            "source_ref": "enm:BayPrimaryDevice.kind=SURGE_ARRESTER"
          },
          {
            "catalog": null,
            "designation": "g\u0142owica kablowa",
            "device_ref": "g7-line/head",
            "kind": "CABLE_HEAD",
            "placement": "DOWNSTREAM",
            "source_ref": "enm:BayPrimaryDevice.kind=CABLE_HEAD"
          },
          {
            "catalog": null,
            "designation": "uziemnik",
            "device_ref": "g7-line/es",
            "kind": "ES",
            "placement": "GROUND_BRANCH",
            "source_ref": "enm:BayPrimaryDevice.kind=ES"
          }
        ],
        "field_id": "g7-line",
        "interface_protection": true,
        "kind": "POLE LINIOWE SN (przy\u0142\u0105cze)",
        "on_bus_ref": "SN_PCC",
        "port": {
          "cable": "kabel SN do OSD (typ wg projektu)",
          "entry_side": "BOK-L",
          "kind": "sn_input",
          "nominal_voltage_kv": 15.0,
          "occupied_by": "seg/kabel-osd",
          "port_id": "g7-line/port",
          "source_ref": "enm:Port.kind=sn_input;std:przylacze_SN"
        },
        "protection_codes": [
          "25",
          "21",
          "40",
          "32",
          "46",
          "87",
          "59N",
          "67N",
          "81U",
          "81O"
        ],
        "role": "connection",
        "source_ref": "enm:Bay.bay_role=LINIA_OUT;std:IEC_62271_pole_liniowe"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g7-gen1",
        "interface_protection": false,
        "kind": "Agregat synchroniczny 1 \u00b7 1 MW",
        "on_bus_ref": "SN_PCC",
        "port": null,
        "protection_codes": [],
        "role": "source",
        "source_ref": "enm:Generator.gen_type=biogas_synchronous;std:IEC_60909_6_3_gen_1"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g7-gen2",
        "interface_protection": false,
        "kind": "Agregat synchroniczny 2 \u00b7 1 MW",
        "on_bus_ref": "SN_PCC",
        "port": null,
        "protection_codes": [],
        "role": "source",
        "source_ref": "enm:Generator.gen_type=biogas_synchronous;std:IEC_60909_6_3_gen_2"
      }
    ],
    "pcc_bus_ref": "SN_PCC",
    "schema": "sld_oze_archetype_companion_v1",
    "short_circuit": {
      "buses": {
        "SN_PCC": {
          "bus_ref": "SN_PCC",
          "icw_ka": 25.0,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 10.115,
            "ikss_ka": 10.115,
            "ip_ka": 18.041,
            "ith_ka": 10.115,
            "kappa": 1.261,
            "rx_ratio": 0.4674,
            "sk_mva": 262.79,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "SN_PCC",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.85321934415,
                    "re": 0.398752809262
                  },
                  "z2_ohm": {
                    "im": 0.85321934415,
                    "re": 0.398752809262
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.398752809262,
                  "x_ohm": 0.85321934415,
                  "z_equiv_abs_ohm": 0.941799900258,
                  "z_equiv_ohm": {
                    "im": 0.85321934415,
                    "re": 0.398752809262
                  }
                },
                "substitution": "\\left(0.398753 + j 0.853219\\right)",
                "substitution_latex": "\\left(0.398753 + j 0.853219\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 1.1,
                  "un_v": 15000.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.941799900258
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 10114.9718098
                },
                "substitution": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{0.9418}",
                "substitution_latex": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{0.9418}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.398752809262,
                  "rx_ratio": 0.467350877586,
                  "x_ohm": 0.85321934415
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.26116948387
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.467351}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.467351}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 10114.9718098,
                  "kappa": 1.26116948387
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 18040.6893502
                },
                "substitution": "1.26117 \\cdot \\sqrt{2} \\cdot 10115",
                "substitution_latex": "1.26117 \\cdot \\sqrt{2} \\cdot 10115",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 4.20315239594e-07,
                  "ikss_a": 10114.9718098,
                  "kappa": 1.26116948387,
                  "ta_s": 0.00681094016187,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 10114.9718098
                },
                "substitution": "10115 \\cdot \\sqrt{1 + \\left((1.26117 - 1) \\cdot 4.20315e-07\\right)^2}",
                "substitution_latex": "10115 \\cdot \\sqrt{1 + \\left((1.26117 - 1) \\cdot 4.20315e-07\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 10114.9718098,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 10114.9718098
                },
                "substitution": "10115 \\cdot \\sqrt{1}",
                "substitution_latex": "10115 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 10114.9718098,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 262.794676377
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 10115 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 10115 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 8.736,
            "ith_ka": 8.736,
            "kappa": 1.261,
            "sk_mva": 226.96,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "SN_PCC",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.85321934415,
                    "re": 0.398752809262
                  },
                  "z2_ohm": {
                    "im": 0.85321934415,
                    "re": 0.398752809262
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.398752809262,
                  "x_ohm": 0.85321934415,
                  "z_equiv_abs_ohm": 0.941799900258,
                  "z_equiv_ohm": {
                    "im": 0.85321934415,
                    "re": 0.398752809262
                  }
                },
                "substitution": "\\left(0.398753 + j 0.853219\\right)",
                "substitution_latex": "\\left(0.398753 + j 0.853219\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 0.95,
                  "un_v": 15000.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.941799900258
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 8735.65747214
                },
                "substitution": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{0.9418}",
                "substitution_latex": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{0.9418}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.398752809262,
                  "rx_ratio": 0.467350877586,
                  "x_ohm": 0.85321934415
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.26116948387
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.467351}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.467351}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 8735.65747214,
                  "kappa": 1.26116948387
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 15580.5953479
                },
                "substitution": "1.26117 \\cdot \\sqrt{2} \\cdot 8735.66",
                "substitution_latex": "1.26117 \\cdot \\sqrt{2} \\cdot 8735.66",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 4.20315239594e-07,
                  "ikss_a": 8735.65747214,
                  "kappa": 1.26116948387,
                  "ta_s": 0.00681094016187,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 8735.65747214
                },
                "substitution": "8735.66 \\cdot \\sqrt{1 + \\left((1.26117 - 1) \\cdot 4.20315e-07\\right)^2}",
                "substitution_latex": "8735.66 \\cdot \\sqrt{1 + \\left((1.26117 - 1) \\cdot 4.20315e-07\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 8735.65747214,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 8735.65747214
                },
                "substitution": "8735.66 \\cdot \\sqrt{1}",
                "substitution_latex": "8735.66 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 8735.65747214,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 226.959038689
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 8735.66 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 8735.66 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ib_contribution_ka": 0.482,
            "ik_contribution_ka": 0.698,
            "is_synchronous_machine": true,
            "machine_type": "SYNCHRONOUS",
            "machines": [
              {
                "ib_partial_ka": 0.241,
                "ikss_partial_ka": 0.349,
                "ir_a": 48.1,
                "mu": 0.6908,
                "node_ref": "SN_PCC",
                "q": 1.0,
                "source_id": "sync/SN_PCC/1"
              },
              {
                "ib_partial_ka": 0.241,
                "ikss_partial_ka": 0.349,
                "ir_a": 48.1,
                "mu": 0.6908,
                "node_ref": "SN_PCC",
                "q": 1.0,
                "source_id": "sync/SN_PCC/2"
              }
            ],
            "model": "IEC 60909-0:2016 \u00a76.3/\u00a76.6 \u2014 maszyna synchroniczna za Z\u2033 (zanik \u03bc)",
            "motors_negligible": true,
            "t_min_s": 0.1
          },
          "un_kv": 15.0,
          "verification": {
            "icw_ka": 25.0,
            "ikss_max_ka": 10.115,
            "passed": true,
            "rule": "ikss_max_le_icw"
          }
        }
      },
      "standard": "IEC 60909"
    },
    "source": {
      "control_mode": "U/Q \u00b7 cos\u03c6",
      "genset": {
        "cos_phi_r": 0.8,
        "genset_kw": 1000.0,
        "n_gensets": 2,
        "sn_kv": 15.0,
        "source_ref": "std:IEC_60909_6_3;enm:Generator.gen_type=biogas_synchronous",
        "xd_subtransient_pu": 0.15
      },
      "machine_type": "SYNCHRONOUS",
      "nc_rfg_class": "C",
      "power_hierarchy": {
        "p_osiagalna_kw": 1900.0,
        "p_przylacz_kw": 2000.0,
        "p_zainst_kw": 2000.0,
        "pn_ac_kw": 2000.0,
        "valid": true
      },
      "protection_codes": [
        "25",
        "21",
        "40",
        "32",
        "46",
        "87",
        "59N",
        "67N",
        "81U",
        "81O"
      ],
      "technology": "Biogazownia \u2014 agregaty synchroniczne (kogeneracja)"
    },
    "voltage_flow": {
      "branches": {
        "sr/branch/in": {
          "branch_ref": "sr/branch/in",
          "direction": "reverse",
          "i_a": 76.68,
          "loading_percent": 12.17,
          "p_mw": -1.9921,
          "q_mvar": 0.0159,
          "s_mva": 1.9922
        }
      },
      "buses": {
        "SN_PCC": {
          "bus_ref": "SN_PCC",
          "deviation_percent": 0.395,
          "u_kv": 15.0593,
          "u_pu": 1.00395,
          "un_kv": 15.0
        }
      }
    }
  },
  "G8-WIND-ASYNC": {
    "archetype": "G8-WIND-ASYNC",
    "boundary": {
      "enm_connection_variant": "DEDICATED_MV_CONNECTION",
      "metered": true,
      "on_bus_ref": "SN_PCC",
      "source_ref": "enm:Generator.connection_variant=DEDICATED_MV_CONNECTION",
      "variant": "G-GPZ"
    },
    "case_ref_pf": "ROZPLYW_GEN_MAX",
    "case_ref_sc": "ZWARCIOWY_MAKS",
    "converged": true,
    "enm_hash": "oze-substrate/G8-WIND-ASYNC",
    "fields": [
      {
        "abb_cell": "CBC",
        "apparatus": [
          {
            "catalog": null,
            "designation": "Q1 (od\u0142\u0105cznik szynowy)",
            "device_ref": "g8-line/ds",
            "kind": "DS",
            "placement": "UPSTREAM",
            "source_ref": "enm:BayPrimaryDevice.kind=DS"
          },
          {
            "catalog": null,
            "designation": "Q0 (wy\u0142\u0105cznik SN)",
            "device_ref": "g8-line/cb",
            "kind": "CB",
            "placement": "MIDSTREAM",
            "source_ref": "enm:BayPrimaryDevice.kind=CB"
          },
          {
            "catalog": null,
            "designation": "przek\u0142adnik pr\u0105dowy",
            "device_ref": "g8-line/ct",
            "kind": "CT",
            "placement": "MIDSTREAM",
            "source_ref": "std:IEC_61869_CT"
          },
          {
            "catalog": null,
            "designation": "przek\u0142adnik napi\u0119ciowy",
            "device_ref": "g8-line/vt",
            "kind": "VT",
            "placement": "OFF_PATH",
            "source_ref": "std:IEC_61869_VT"
          },
          {
            "catalog": null,
            "designation": "ogranicznik przepi\u0119\u0107",
            "device_ref": "g8-line/sa",
            "kind": "SURGE_ARRESTER",
            "placement": "OFF_PATH",
            "source_ref": "enm:BayPrimaryDevice.kind=SURGE_ARRESTER"
          },
          {
            "catalog": null,
            "designation": "g\u0142owica kablowa",
            "device_ref": "g8-line/head",
            "kind": "CABLE_HEAD",
            "placement": "DOWNSTREAM",
            "source_ref": "enm:BayPrimaryDevice.kind=CABLE_HEAD"
          },
          {
            "catalog": null,
            "designation": "uziemnik",
            "device_ref": "g8-line/es",
            "kind": "ES",
            "placement": "GROUND_BRANCH",
            "source_ref": "enm:BayPrimaryDevice.kind=ES"
          }
        ],
        "field_id": "g8-line",
        "interface_protection": true,
        "kind": "POLE LINIOWE SN (przy\u0142\u0105cze)",
        "on_bus_ref": "SN_PCC",
        "port": {
          "cable": "kabel SN do OSD (typ wg projektu)",
          "entry_side": "BOK-L",
          "kind": "sn_input",
          "nominal_voltage_kv": 15.0,
          "occupied_by": "seg/kabel-osd",
          "port_id": "g8-line/port",
          "source_ref": "enm:Port.kind=sn_input;std:przylacze_SN"
        },
        "protection_codes": [
          "67",
          "67N",
          "47",
          "27",
          "59",
          "81U",
          "81O"
        ],
        "role": "connection",
        "source_ref": "enm:Bay.bay_role=LINIA_OUT;std:IEC_62271_pole_liniowe"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g8-wtg1",
        "interface_protection": false,
        "kind": "WTG 1 (async) \u00b7 0.85 MW",
        "on_bus_ref": "SN_PCC",
        "port": null,
        "protection_codes": [],
        "role": "source",
        "source_ref": "enm:Generator.gen_type=wind_t1;std:IEC_61400_wtg_1"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g8-wtg2",
        "interface_protection": false,
        "kind": "WTG 2 (async) \u00b7 0.85 MW",
        "on_bus_ref": "SN_PCC",
        "port": null,
        "protection_codes": [],
        "role": "source",
        "source_ref": "enm:Generator.gen_type=wind_t1;std:IEC_61400_wtg_2"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g8-wtg3",
        "interface_protection": false,
        "kind": "WTG 3 (async) \u00b7 0.85 MW",
        "on_bus_ref": "SN_PCC",
        "port": null,
        "protection_codes": [],
        "role": "source",
        "source_ref": "enm:Generator.gen_type=wind_t1;std:IEC_61400_wtg_3"
      }
    ],
    "pcc_bus_ref": "SN_PCC",
    "schema": "sld_oze_archetype_companion_v1",
    "short_circuit": {
      "buses": {
        "SN_PCC": {
          "bus_ref": "SN_PCC",
          "icw_ka": 25.0,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 10.05,
            "ikss_ka": 10.05,
            "ip_ka": 17.725,
            "ith_ka": 10.05,
            "kappa": 1.247,
            "rx_ratio": 0.4873,
            "sk_mva": 261.1,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "SN_PCC",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.852107955133,
                    "re": 0.415245231204
                  },
                  "z2_ohm": {
                    "im": 0.852107955133,
                    "re": 0.415245231204
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.415245231204,
                  "x_ohm": 0.852107955133,
                  "z_equiv_abs_ohm": 0.947901138958,
                  "z_equiv_ohm": {
                    "im": 0.852107955133,
                    "re": 0.415245231204
                  }
                },
                "substitution": "\\left(0.415245 + j 0.852108\\right)",
                "substitution_latex": "\\left(0.415245 + j 0.852108\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 1.1,
                  "un_v": 15000.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.947901138958
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 10049.8660146
                },
                "substitution": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{0.947901}",
                "substitution_latex": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{0.947901}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.415245231204,
                  "rx_ratio": 0.487315285232,
                  "x_ohm": 0.852107955133
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.24714911951
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.487315}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.487315}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 10049.8660146,
                  "kappa": 1.24714911951
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 17725.3024364
                },
                "substitution": "1.24715 \\cdot \\sqrt{2} \\cdot 10049.9",
                "substitution_latex": "1.24715 \\cdot \\sqrt{2} \\cdot 10049.9",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 2.24484045148e-07,
                  "ikss_a": 10049.8660146,
                  "kappa": 1.24714911951,
                  "ta_s": 0.00653190851652,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 10049.8660146
                },
                "substitution": "10049.9 \\cdot \\sqrt{1 + \\left((1.24715 - 1) \\cdot 2.24484e-07\\right)^2}",
                "substitution_latex": "10049.9 \\cdot \\sqrt{1 + \\left((1.24715 - 1) \\cdot 2.24484e-07\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 10049.8660146,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 10049.8660146
                },
                "substitution": "10049.9 \\cdot \\sqrt{1}",
                "substitution_latex": "10049.9 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 10049.8660146,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 261.103178199
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 10049.9 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 10049.9 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 8.679,
            "ith_ka": 8.679,
            "kappa": 1.247,
            "sk_mva": 225.5,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "SN_PCC",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.852107955133,
                    "re": 0.415245231204
                  },
                  "z2_ohm": {
                    "im": 0.852107955133,
                    "re": 0.415245231204
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.415245231204,
                  "x_ohm": 0.852107955133,
                  "z_equiv_abs_ohm": 0.947901138958,
                  "z_equiv_ohm": {
                    "im": 0.852107955133,
                    "re": 0.415245231204
                  }
                },
                "substitution": "\\left(0.415245 + j 0.852108\\right)",
                "substitution_latex": "\\left(0.415245 + j 0.852108\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 0.95,
                  "un_v": 15000.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.947901138958
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 8679.42973989
                },
                "substitution": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{0.947901}",
                "substitution_latex": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{0.947901}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.415245231204,
                  "rx_ratio": 0.487315285232,
                  "x_ohm": 0.852107955133
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.24714911951
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.487315}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.487315}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 8679.42973989,
                  "kappa": 1.24714911951
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 15308.2157405
                },
                "substitution": "1.24715 \\cdot \\sqrt{2} \\cdot 8679.43",
                "substitution_latex": "1.24715 \\cdot \\sqrt{2} \\cdot 8679.43",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 2.24484045148e-07,
                  "ikss_a": 8679.42973989,
                  "kappa": 1.24714911951,
                  "ta_s": 0.00653190851652,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 8679.42973989
                },
                "substitution": "8679.43 \\cdot \\sqrt{1 + \\left((1.24715 - 1) \\cdot 2.24484e-07\\right)^2}",
                "substitution_latex": "8679.43 \\cdot \\sqrt{1 + \\left((1.24715 - 1) \\cdot 2.24484e-07\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 8679.42973989,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 8679.42973989
                },
                "substitution": "8679.43 \\cdot \\sqrt{1}",
                "substitution_latex": "8679.43 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 8679.42973989,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 225.498199353
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 8679.43 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 8679.43 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ib_contribution_ka": 0.276,
            "ik_contribution_ka": 0.591,
            "is_synchronous_machine": false,
            "machine_type": "ASYNCHRONOUS",
            "machines": [
              {
                "ib_partial_ka": 0.092,
                "ikss_partial_ka": 0.197,
                "ir_a": 880.8,
                "mu": 1.0,
                "node_ref": "WTG_LV_1",
                "q": 0.4673,
                "source_id": "async/WTG_LV_1/1"
              },
              {
                "ib_partial_ka": 0.092,
                "ikss_partial_ka": 0.197,
                "ir_a": 880.8,
                "mu": 1.0,
                "node_ref": "WTG_LV_2",
                "q": 0.4673,
                "source_id": "async/WTG_LV_2/1"
              },
              {
                "ib_partial_ka": 0.092,
                "ikss_partial_ka": 0.197,
                "ir_a": 880.8,
                "mu": 1.0,
                "node_ref": "WTG_LV_3",
                "q": 0.4673,
                "source_id": "async/WTG_LV_3/1"
              }
            ],
            "model": "IEC 60909-0:2016 \u00a76.7/\u00a76.6 \u2014 maszyna asynchroniczna za Z_M (zanik \u03bc\u00b7q)",
            "motors_negligible": false,
            "t_min_s": 0.1
          },
          "un_kv": 15.0,
          "verification": {
            "icw_ka": 25.0,
            "ikss_max_ka": 10.05,
            "passed": true,
            "rule": "ikss_max_le_icw"
          }
        },
        "WTG_LV_1": {
          "bus_ref": "WTG_LV_1",
          "icw_ka": 50.0,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 19.942,
            "ikss_ka": 19.942,
            "ip_ka": 47.17,
            "ith_ka": 19.942,
            "kappa": 1.673,
            "rx_ratio": 0.1355,
            "sk_mva": 23.83,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "WTG_LV_1",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.0217755321387,
                    "re": 0.00295135942989
                  },
                  "z2_ohm": {
                    "im": 0.0217755321387,
                    "re": 0.00295135942989
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.00295135942989,
                  "x_ohm": 0.0217755321387,
                  "z_equiv_abs_ohm": 0.0219746290619,
                  "z_equiv_ohm": {
                    "im": 0.0217755321387,
                    "re": 0.00295135942989
                  }
                },
                "substitution": "\\left(0.00295136 + j 0.0217755\\right)",
                "substitution_latex": "\\left(0.00295136 + j 0.0217755\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 1.1,
                  "un_v": 690.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.0219746290619
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 19941.5814064
                },
                "substitution": "\\frac{1.1 \\cdot 690 \\cdot 0.57735}{0.0219746}",
                "substitution_latex": "\\frac{1.1 \\cdot 690 \\cdot 0.57735}{0.0219746}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.00295135942989,
                  "rx_ratio": 0.135535582372,
                  "x_ohm": 0.0217755321387
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.67258788811
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.135536}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.135536}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 19941.5814064,
                  "kappa": 1.67258788811
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 47169.7463772
                },
                "substitution": "1.67259 \\cdot \\sqrt{2} \\cdot 19941.6",
                "substitution_latex": "1.67259 \\cdot \\sqrt{2} \\cdot 19941.6",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.0141509163282,
                  "ikss_a": 19941.5814064,
                  "kappa": 1.67258788811,
                  "ta_s": 0.0234853372533,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 19942.4846128
                },
                "substitution": "19941.6 \\cdot \\sqrt{1 + \\left((1.67259 - 1) \\cdot 0.0141509\\right)^2}",
                "substitution_latex": "19941.6 \\cdot \\sqrt{1 + \\left((1.67259 - 1) \\cdot 0.0141509\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 19941.5814064,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 19941.5814064
                },
                "substitution": "19941.6 \\cdot \\sqrt{1}",
                "substitution_latex": "19941.6 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 19941.5814064,
                  "un_v": 690.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 23.8324842037
                },
                "substitution": "\\sqrt{3} \\cdot 690 \\cdot 19941.6 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 690 \\cdot 19941.6 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 17.222,
            "ith_ka": 17.222,
            "kappa": 1.673,
            "sk_mva": 20.58,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "WTG_LV_1",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.0217755321387,
                    "re": 0.00295135942989
                  },
                  "z2_ohm": {
                    "im": 0.0217755321387,
                    "re": 0.00295135942989
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.00295135942989,
                  "x_ohm": 0.0217755321387,
                  "z_equiv_abs_ohm": 0.0219746290619,
                  "z_equiv_ohm": {
                    "im": 0.0217755321387,
                    "re": 0.00295135942989
                  }
                },
                "substitution": "\\left(0.00295136 + j 0.0217755\\right)",
                "substitution_latex": "\\left(0.00295136 + j 0.0217755\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 0.95,
                  "un_v": 690.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.0219746290619
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 17222.274851
                },
                "substitution": "\\frac{0.95 \\cdot 690 \\cdot 0.57735}{0.0219746}",
                "substitution_latex": "\\frac{0.95 \\cdot 690 \\cdot 0.57735}{0.0219746}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.00295135942989,
                  "rx_ratio": 0.135535582372,
                  "x_ohm": 0.0217755321387
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.67258788811
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.135536}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.135536}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 17222.274851,
                  "kappa": 1.67258788811
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 40737.5082349
                },
                "substitution": "1.67259 \\cdot \\sqrt{2} \\cdot 17222.3",
                "substitution_latex": "1.67259 \\cdot \\sqrt{2} \\cdot 17222.3",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.0141509163282,
                  "ikss_a": 17222.274851,
                  "kappa": 1.67258788811,
                  "ta_s": 0.0234853372533,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 17223.0548929
                },
                "substitution": "17222.3 \\cdot \\sqrt{1 + \\left((1.67259 - 1) \\cdot 0.0141509\\right)^2}",
                "substitution_latex": "17222.3 \\cdot \\sqrt{1 + \\left((1.67259 - 1) \\cdot 0.0141509\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 17222.274851,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 17222.274851
                },
                "substitution": "17222.3 \\cdot \\sqrt{1}",
                "substitution_latex": "17222.3 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 17222.274851,
                  "un_v": 690.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 20.5825999941
                },
                "substitution": "\\sqrt{3} \\cdot 690 \\cdot 17222.3 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 690 \\cdot 17222.3 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ib_contribution_ka": 2.19,
            "ik_contribution_ka": 6.389,
            "is_synchronous_machine": false,
            "machine_type": "ASYNCHRONOUS",
            "machines": [
              {
                "ib_partial_ka": 1.921,
                "ikss_partial_ka": 5.813,
                "ir_a": 880.8,
                "mu": 0.7071,
                "node_ref": "WTG_LV_1",
                "q": 0.4673,
                "source_id": "async/WTG_LV_1/1"
              },
              {
                "ib_partial_ka": 0.135,
                "ikss_partial_ka": 0.288,
                "ir_a": 880.8,
                "mu": 1.0,
                "node_ref": "WTG_LV_2",
                "q": 0.4673,
                "source_id": "async/WTG_LV_2/1"
              },
              {
                "ib_partial_ka": 0.135,
                "ikss_partial_ka": 0.288,
                "ir_a": 880.8,
                "mu": 1.0,
                "node_ref": "WTG_LV_3",
                "q": 0.4673,
                "source_id": "async/WTG_LV_3/1"
              }
            ],
            "model": "IEC 60909-0:2016 \u00a76.7/\u00a76.6 \u2014 maszyna asynchroniczna za Z_M (zanik \u03bc\u00b7q)",
            "motors_negligible": false,
            "t_min_s": 0.1
          },
          "un_kv": 0.69,
          "verification": {
            "icw_ka": 50.0,
            "ikss_max_ka": 19.942,
            "passed": true,
            "rule": "ikss_max_le_icw"
          }
        }
      },
      "standard": "IEC 60909"
    },
    "source": {
      "collector": {
        "collector_kv": 15.0,
        "n_turbines": 3,
        "source_ref": "std:IEC_61400;enm:Generator.gen_type=wind_t1_collector",
        "topology": "radial",
        "turbine_kw": 850.0,
        "turbine_lv_kv": 0.69,
        "turbine_transformer": "0.69/15 kV \u00b7 1.0 MVA"
      },
      "control_mode": "kompensacja Q (bateria)",
      "machine_type": "ASYNCHRONOUS",
      "nc_rfg_class": "C",
      "power_hierarchy": {
        "p_osiagalna_kw": 2400.0,
        "p_przylacz_kw": 2550.0,
        "p_zainst_kw": 2550.0,
        "pn_ac_kw": 2550.0,
        "valid": true
      },
      "protection_codes": [
        "67",
        "67N",
        "47",
        "27",
        "59",
        "81U",
        "81O"
      ],
      "technology": "Wiatr \u2014 generatory indukcyjne (Typ 1, sta\u0142a pr\u0119dko\u015b\u0107)"
    },
    "voltage_flow": {
      "branches": {
        "sr/branch/in": {
          "branch_ref": "sr/branch/in",
          "direction": "reverse",
          "i_a": 97.66,
          "loading_percent": 15.5,
          "p_mw": -2.5371,
          "q_mvar": 0.026,
          "s_mva": 2.5372
        },
        "sr/branch/wtg-tr1": {
          "branch_ref": "sr/branch/wtg-tr1",
          "direction": "reverse",
          "i_a": 32.55,
          "loading_percent": null,
          "p_mw": -0.85,
          "q_mvar": 0.0001,
          "s_mva": 0.85
        },
        "sr/branch/wtg-tr2": {
          "branch_ref": "sr/branch/wtg-tr2",
          "direction": "reverse",
          "i_a": 32.55,
          "loading_percent": null,
          "p_mw": -0.85,
          "q_mvar": 0.0001,
          "s_mva": 0.85
        },
        "sr/branch/wtg-tr3": {
          "branch_ref": "sr/branch/wtg-tr3",
          "direction": "reverse",
          "i_a": 32.55,
          "loading_percent": null,
          "p_mw": -0.85,
          "q_mvar": 0.0001,
          "s_mva": 0.85
        }
      },
      "buses": {
        "SN_PCC": {
          "bus_ref": "SN_PCC",
          "deviation_percent": 0.502,
          "u_kv": 15.0753,
          "u_pu": 1.00502,
          "un_kv": 15.0
        },
        "WTG_LV_1": {
          "bus_ref": "WTG_LV_1",
          "deviation_percent": 0.502,
          "u_kv": 0.6935,
          "u_pu": 1.00502,
          "un_kv": 0.69
        }
      }
    }
  },
  "G9-WIND-DFIG": {
    "archetype": "G9-WIND-DFIG",
    "boundary": {
      "enm_connection_variant": "DEDICATED_MV_CONNECTION",
      "metered": true,
      "on_bus_ref": "SN_PCC",
      "source_ref": "enm:Generator.connection_variant=DEDICATED_MV_CONNECTION",
      "variant": "G-GPZ"
    },
    "case_ref_pf": "ROZPLYW_GEN_MAX",
    "case_ref_sc": "ZWARCIOWY_MAKS",
    "converged": true,
    "enm_hash": "oze-substrate/G9-WIND-DFIG",
    "fields": [
      {
        "abb_cell": "CBC",
        "apparatus": [
          {
            "catalog": null,
            "designation": "Q1 (od\u0142\u0105cznik szynowy)",
            "device_ref": "g9-line/ds",
            "kind": "DS",
            "placement": "UPSTREAM",
            "source_ref": "enm:BayPrimaryDevice.kind=DS"
          },
          {
            "catalog": null,
            "designation": "Q0 (wy\u0142\u0105cznik SN)",
            "device_ref": "g9-line/cb",
            "kind": "CB",
            "placement": "MIDSTREAM",
            "source_ref": "enm:BayPrimaryDevice.kind=CB"
          },
          {
            "catalog": null,
            "designation": "przek\u0142adnik pr\u0105dowy",
            "device_ref": "g9-line/ct",
            "kind": "CT",
            "placement": "MIDSTREAM",
            "source_ref": "std:IEC_61869_CT"
          },
          {
            "catalog": null,
            "designation": "przek\u0142adnik napi\u0119ciowy",
            "device_ref": "g9-line/vt",
            "kind": "VT",
            "placement": "OFF_PATH",
            "source_ref": "std:IEC_61869_VT"
          },
          {
            "catalog": null,
            "designation": "ogranicznik przepi\u0119\u0107",
            "device_ref": "g9-line/sa",
            "kind": "SURGE_ARRESTER",
            "placement": "OFF_PATH",
            "source_ref": "enm:BayPrimaryDevice.kind=SURGE_ARRESTER"
          },
          {
            "catalog": null,
            "designation": "g\u0142owica kablowa",
            "device_ref": "g9-line/head",
            "kind": "CABLE_HEAD",
            "placement": "DOWNSTREAM",
            "source_ref": "enm:BayPrimaryDevice.kind=CABLE_HEAD"
          },
          {
            "catalog": null,
            "designation": "uziemnik",
            "device_ref": "g9-line/es",
            "kind": "ES",
            "placement": "GROUND_BRANCH",
            "source_ref": "enm:BayPrimaryDevice.kind=ES"
          }
        ],
        "field_id": "g9-line",
        "interface_protection": true,
        "kind": "POLE LINIOWE SN (przy\u0142\u0105cze)",
        "on_bus_ref": "SN_PCC",
        "port": {
          "cable": "kabel SN do OSD (typ wg projektu)",
          "entry_side": "BOK-L",
          "kind": "sn_input",
          "nominal_voltage_kv": 15.0,
          "occupied_by": "seg/kabel-osd",
          "port_id": "g9-line/port",
          "source_ref": "enm:Port.kind=sn_input;std:przylacze_SN"
        },
        "protection_codes": [
          "67",
          "67N",
          "46",
          "47",
          "27",
          "59",
          "81U",
          "81O",
          "df/dt"
        ],
        "role": "connection",
        "source_ref": "enm:Bay.bay_role=LINIA_OUT;std:IEC_62271_pole_liniowe"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g9-wtg1",
        "interface_protection": false,
        "kind": "WTG 1 (DFIG) \u00b7 2.0 MW",
        "on_bus_ref": "SN_PCC",
        "port": null,
        "protection_codes": [],
        "role": "source",
        "source_ref": "enm:Generator.gen_type=wind_t3;std:IEC_61400_wtg_1"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g9-wtg2",
        "interface_protection": false,
        "kind": "WTG 2 (DFIG) \u00b7 2.0 MW",
        "on_bus_ref": "SN_PCC",
        "port": null,
        "protection_codes": [],
        "role": "source",
        "source_ref": "enm:Generator.gen_type=wind_t3;std:IEC_61400_wtg_2"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g9-wtg3",
        "interface_protection": false,
        "kind": "WTG 3 (DFIG) \u00b7 2.0 MW",
        "on_bus_ref": "SN_PCC",
        "port": null,
        "protection_codes": [],
        "role": "source",
        "source_ref": "enm:Generator.gen_type=wind_t3;std:IEC_61400_wtg_3"
      }
    ],
    "pcc_bus_ref": "SN_PCC",
    "schema": "sld_oze_archetype_companion_v1",
    "short_circuit": {
      "buses": {
        "SN_PCC": {
          "bus_ref": "SN_PCC",
          "icw_ka": 31.5,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 10.433,
            "ikss_ka": 10.433,
            "ip_ka": 18.432,
            "ith_ka": 10.433,
            "kappa": 1.249,
            "rx_ratio": 0.4841,
            "sk_mva": 271.05,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "SN_PCC",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.821875337772,
                    "re": 0.397897567613
                  },
                  "z2_ohm": {
                    "im": 0.821875337772,
                    "re": 0.397897567613
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.397897567613,
                  "x_ohm": 0.821875337772,
                  "z_equiv_abs_ohm": 0.913127343337,
                  "z_equiv_ohm": {
                    "im": 0.821875337772,
                    "re": 0.397897567613
                  }
                },
                "substitution": "\\left(0.397898 + j 0.821875\\right)",
                "substitution_latex": "\\left(0.397898 + j 0.821875\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 1.1,
                  "un_v": 15000.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.913127343337
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 10432.5858941
                },
                "substitution": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{0.913127}",
                "substitution_latex": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{0.913127}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.397897567613,
                  "rx_ratio": 0.484133723603,
                  "x_ohm": 0.821875337772
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.24932756604
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.484134}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.484134}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 10432.5858941,
                  "kappa": 1.24932756604
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 18432.4595512
                },
                "substitution": "1.24933 \\cdot \\sqrt{2} \\cdot 10432.6",
                "substitution_latex": "1.24933 \\cdot \\sqrt{2} \\cdot 10432.6",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 2.48081257247e-07,
                  "ikss_a": 10432.5858941,
                  "kappa": 1.24932756604,
                  "ta_s": 0.00657483399039,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 10432.5858941
                },
                "substitution": "10432.6 \\cdot \\sqrt{1 + \\left((1.24933 - 1) \\cdot 2.48081e-07\\right)^2}",
                "substitution_latex": "10432.6 \\cdot \\sqrt{1 + \\left((1.24933 - 1) \\cdot 2.48081e-07\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 10432.5858941,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 10432.5858941
                },
                "substitution": "10432.6 \\cdot \\sqrt{1}",
                "substitution_latex": "10432.6 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 10432.5858941,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 271.046532344
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 10432.6 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 10432.6 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 9.01,
            "ith_ka": 9.01,
            "kappa": 1.249,
            "sk_mva": 234.09,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "SN_PCC",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.821875337772,
                    "re": 0.397897567613
                  },
                  "z2_ohm": {
                    "im": 0.821875337772,
                    "re": 0.397897567613
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.397897567613,
                  "x_ohm": 0.821875337772,
                  "z_equiv_abs_ohm": 0.913127343337,
                  "z_equiv_ohm": {
                    "im": 0.821875337772,
                    "re": 0.397897567613
                  }
                },
                "substitution": "\\left(0.397898 + j 0.821875\\right)",
                "substitution_latex": "\\left(0.397898 + j 0.821875\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 0.95,
                  "un_v": 15000.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.913127343337
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 9009.96054492
                },
                "substitution": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{0.913127}",
                "substitution_latex": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{0.913127}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.397897567613,
                  "rx_ratio": 0.484133723603,
                  "x_ohm": 0.821875337772
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.24932756604
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.484134}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.484134}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 9009.96054492,
                  "kappa": 1.24932756604
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 15918.9423396
                },
                "substitution": "1.24933 \\cdot \\sqrt{2} \\cdot 9009.96",
                "substitution_latex": "1.24933 \\cdot \\sqrt{2} \\cdot 9009.96",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 2.48081257247e-07,
                  "ikss_a": 9009.96054492,
                  "kappa": 1.24932756604,
                  "ta_s": 0.00657483399039,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 9009.96054492
                },
                "substitution": "9009.96 \\cdot \\sqrt{1 + \\left((1.24933 - 1) \\cdot 2.48081e-07\\right)^2}",
                "substitution_latex": "9009.96 \\cdot \\sqrt{1 + \\left((1.24933 - 1) \\cdot 2.48081e-07\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 9009.96054492,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 9009.96054492
                },
                "substitution": "9009.96 \\cdot \\sqrt{1}",
                "substitution_latex": "9009.96 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 9009.96054492,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 234.08564157
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 9009.96 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 9009.96 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ib_contribution_ka": 0.555,
            "ik_contribution_ka": 0.974,
            "is_synchronous_machine": false,
            "machine_type": "DFIG",
            "machines": [
              {
                "ib_partial_ka": 0.185,
                "ikss_partial_ka": 0.325,
                "ir_a": 1936.9,
                "mu": 1.0,
                "node_ref": "WTG_LV_1",
                "q": 0.57,
                "source_id": "async/WTG_LV_1/1"
              },
              {
                "ib_partial_ka": 0.185,
                "ikss_partial_ka": 0.325,
                "ir_a": 1936.9,
                "mu": 1.0,
                "node_ref": "WTG_LV_2",
                "q": 0.57,
                "source_id": "async/WTG_LV_2/1"
              },
              {
                "ib_partial_ka": 0.185,
                "ikss_partial_ka": 0.325,
                "ir_a": 1936.9,
                "mu": 1.0,
                "node_ref": "WTG_LV_3",
                "q": 0.57,
                "source_id": "async/WTG_LV_3/1"
              }
            ],
            "model": "IEC 60909-0:2016 \u00a76.7/\u00a76.6 \u2014 DFIG (Typ 3): crowbar \u2192 maszyna asynchroniczna za Z_M (zanik \u03bc\u00b7q)",
            "motors_negligible": false,
            "t_min_s": 0.1
          },
          "un_kv": 15.0,
          "verification": {
            "icw_ka": 31.5,
            "ikss_max_ka": 10.433,
            "passed": true,
            "rule": "ikss_max_le_icw"
          }
        },
        "WTG_LV_1": {
          "bus_ref": "WTG_LV_1",
          "icw_ka": 63.0,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 41.235,
            "ikss_ka": 41.233,
            "ip_ka": 97.676,
            "ith_ka": 41.233,
            "kappa": 1.675,
            "rx_ratio": 0.1343,
            "sk_mva": 49.28,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "WTG_LV_1",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.0105330192929,
                    "re": 0.00141439205458
                  },
                  "z2_ohm": {
                    "im": 0.0105330192929,
                    "re": 0.00141439205458
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.00141439205458,
                  "x_ohm": 0.0105330192929,
                  "z_equiv_abs_ohm": 0.01062755853,
                  "z_equiv_ohm": {
                    "im": 0.0105330192929,
                    "re": 0.00141439205458
                  }
                },
                "substitution": "\\left(0.00141439 + j 0.010533\\right)",
                "substitution_latex": "\\left(0.00141439 + j 0.010533\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 1.1,
                  "un_v": 690.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.01062755853
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 41233.2572035
                },
                "substitution": "\\frac{1.1 \\cdot 690 \\cdot 0.57735}{0.0106276}",
                "substitution_latex": "\\frac{1.1 \\cdot 690 \\cdot 0.57735}{0.0106276}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.00141439205458,
                  "rx_ratio": 0.134281730171,
                  "x_ohm": 0.0105330192929
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.67504725702
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.134282}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.134282}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 41233.2572035,
                  "kappa": 1.67504725702
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 97676.4135408
                },
                "substitution": "1.67505 \\cdot \\sqrt{2} \\cdot 41233.3",
                "substitution_latex": "1.67505 \\cdot \\sqrt{2} \\cdot 41233.3",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.0147194582478,
                  "ikss_a": 41233.2572035,
                  "kappa": 1.67504725702,
                  "ta_s": 0.0237046309857,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 41235.2926465
                },
                "substitution": "41233.3 \\cdot \\sqrt{1 + \\left((1.67505 - 1) \\cdot 0.0147195\\right)^2}",
                "substitution_latex": "41233.3 \\cdot \\sqrt{1 + \\left((1.67505 - 1) \\cdot 0.0147195\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 41233.2572035,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 41233.2572035
                },
                "substitution": "41233.3 \\cdot \\sqrt{1}",
                "substitution_latex": "41233.3 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 41233.2572035,
                  "un_v": 690.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 49.2784865423
                },
                "substitution": "\\sqrt{3} \\cdot 690 \\cdot 41233.3 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 690 \\cdot 41233.3 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 35.611,
            "ith_ka": 35.611,
            "kappa": 1.675,
            "sk_mva": 42.56,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "WTG_LV_1",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.0105330192929,
                    "re": 0.00141439205458
                  },
                  "z2_ohm": {
                    "im": 0.0105330192929,
                    "re": 0.00141439205458
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.00141439205458,
                  "x_ohm": 0.0105330192929,
                  "z_equiv_abs_ohm": 0.01062755853,
                  "z_equiv_ohm": {
                    "im": 0.0105330192929,
                    "re": 0.00141439205458
                  }
                },
                "substitution": "\\left(0.00141439 + j 0.010533\\right)",
                "substitution_latex": "\\left(0.00141439 + j 0.010533\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 0.95,
                  "un_v": 690.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.01062755853
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 35610.5403121
                },
                "substitution": "\\frac{0.95 \\cdot 690 \\cdot 0.57735}{0.0106276}",
                "substitution_latex": "\\frac{0.95 \\cdot 690 \\cdot 0.57735}{0.0106276}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.00141439205458,
                  "rx_ratio": 0.134281730171,
                  "x_ohm": 0.0105330192929
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.67504725702
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.134282}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.134282}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 35610.5403121,
                  "kappa": 1.67504725702
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 84356.9026034
                },
                "substitution": "1.67505 \\cdot \\sqrt{2} \\cdot 35610.5",
                "substitution_latex": "1.67505 \\cdot \\sqrt{2} \\cdot 35610.5",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.0147194582478,
                  "ikss_a": 35610.5403121,
                  "kappa": 1.67504725702,
                  "ta_s": 0.0237046309857,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 35612.2981947
                },
                "substitution": "35610.5 \\cdot \\sqrt{1 + \\left((1.67505 - 1) \\cdot 0.0147195\\right)^2}",
                "substitution_latex": "35610.5 \\cdot \\sqrt{1 + \\left((1.67505 - 1) \\cdot 0.0147195\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 35610.5403121,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 35610.5403121
                },
                "substitution": "35610.5 \\cdot \\sqrt{1}",
                "substitution_latex": "35610.5 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 35610.5403121,
                  "un_v": 690.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 42.5586929229
                },
                "substitution": "\\sqrt{3} \\cdot 690 \\cdot 35610.5 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 690 \\cdot 35610.5 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ib_contribution_ka": 5.078,
            "ik_contribution_ka": 10.646,
            "is_synchronous_machine": false,
            "machine_type": "DFIG",
            "machines": [
              {
                "ib_partial_ka": 3.867,
                "ikss_partial_ka": 8.522,
                "ir_a": 1936.9,
                "mu": 0.7961,
                "node_ref": "WTG_LV_1",
                "q": 0.57,
                "source_id": "async/WTG_LV_1/1"
              },
              {
                "ib_partial_ka": 0.605,
                "ikss_partial_ka": 1.062,
                "ir_a": 1936.9,
                "mu": 1.0,
                "node_ref": "WTG_LV_2",
                "q": 0.57,
                "source_id": "async/WTG_LV_2/1"
              },
              {
                "ib_partial_ka": 0.605,
                "ikss_partial_ka": 1.062,
                "ir_a": 1936.9,
                "mu": 1.0,
                "node_ref": "WTG_LV_3",
                "q": 0.57,
                "source_id": "async/WTG_LV_3/1"
              }
            ],
            "model": "IEC 60909-0:2016 \u00a76.7/\u00a76.6 \u2014 DFIG (Typ 3): crowbar \u2192 maszyna asynchroniczna za Z_M (zanik \u03bc\u00b7q)",
            "motors_negligible": false,
            "t_min_s": 0.1
          },
          "un_kv": 0.69,
          "verification": {
            "icw_ka": 63.0,
            "ikss_max_ka": 41.233,
            "passed": true,
            "rule": "ikss_max_le_icw"
          }
        }
      },
      "standard": "IEC 60909"
    },
    "source": {
      "collector": {
        "collector_kv": 15.0,
        "n_turbines": 3,
        "source_ref": "std:IEC_61400;enm:Generator.gen_type=wind_t3_collector",
        "topology": "radial",
        "turbine_kw": 2000.0,
        "turbine_lv_kv": 0.69,
        "turbine_transformer": "0.69/15 kV \u00b7 2.5 MVA"
      },
      "control_mode": "U/Q \u00b7 LVRT (crowbar)",
      "machine_type": "DFIG",
      "nc_rfg_class": "C",
      "power_hierarchy": {
        "p_osiagalna_kw": 5800.0,
        "p_przylacz_kw": 6000.0,
        "p_zainst_kw": 6000.0,
        "pn_ac_kw": 6000.0,
        "valid": true
      },
      "protection_codes": [
        "67",
        "67N",
        "46",
        "47",
        "27",
        "59",
        "81U",
        "81O",
        "df/dt"
      ],
      "technology": "Wiatr \u2014 generatory dwustronnie zasilane (Typ 3, DFIG)"
    },
    "voltage_flow": {
      "branches": {
        "sr/branch/in": {
          "branch_ref": "sr/branch/in",
          "direction": "reverse",
          "i_a": 228.3,
          "loading_percent": 36.24,
          "p_mw": -5.9296,
          "q_mvar": 0.1413,
          "s_mva": 5.9313
        },
        "sr/branch/wtg-tr1": {
          "branch_ref": "sr/branch/wtg-tr1",
          "direction": "reverse",
          "i_a": 76.1,
          "loading_percent": null,
          "p_mw": -2.0,
          "q_mvar": 0.0002,
          "s_mva": 2.0
        },
        "sr/branch/wtg-tr2": {
          "branch_ref": "sr/branch/wtg-tr2",
          "direction": "reverse",
          "i_a": 76.1,
          "loading_percent": null,
          "p_mw": -2.0,
          "q_mvar": 0.0002,
          "s_mva": 2.0
        },
        "sr/branch/wtg-tr3": {
          "branch_ref": "sr/branch/wtg-tr3",
          "direction": "reverse",
          "i_a": 76.1,
          "loading_percent": null,
          "p_mw": -2.0,
          "q_mvar": 0.0002,
          "s_mva": 2.0
        }
      },
      "buses": {
        "SN_PCC": {
          "bus_ref": "SN_PCC",
          "deviation_percent": 1.158,
          "u_kv": 15.1737,
          "u_pu": 1.01158,
          "un_kv": 15.0
        },
        "WTG_LV_1": {
          "bus_ref": "WTG_LV_1",
          "deviation_percent": 1.158,
          "u_kv": 0.698,
          "u_pu": 1.01158,
          "un_kv": 0.69
        }
      }
    }
  }
};
