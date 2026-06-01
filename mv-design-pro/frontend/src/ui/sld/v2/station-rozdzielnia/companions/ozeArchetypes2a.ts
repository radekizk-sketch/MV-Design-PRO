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
        "field_id": "g1-conn",
        "interface_protection": true,
        "kind": "POLE_PRZY\u0141\u0104CZENIOWE",
        "on_bus_ref": "NN_BUS",
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
        "field_id": "g1-src",
        "interface_protection": false,
        "kind": "PV",
        "on_bus_ref": "NN_BUS",
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
            "ib_ka": 17.983,
            "ikss_ka": 16.082,
            "ip_ka": 44.18,
            "ith_ka": 16.082,
            "kappa": 1.943,
            "rx_ratio": 0.0202,
            "sk_mva": 11.14,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "NN_BUS",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.0158780952381,
                    "re": 0.0003200016
                  },
                  "z2_ohm": {
                    "im": 0.0158780952381,
                    "re": 0.0003200016
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.0003200016,
                  "x_ohm": 0.0158780952381,
                  "z_equiv_abs_ohm": 0.0158813195111,
                  "z_equiv_ohm": {
                    "im": 0.0158780952381,
                    "re": 0.0003200016
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
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.0158813195111
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 16082.3841419
                },
                "substitution": "\\frac{1.1 \\cdot 400 \\cdot 0.57735}{0.0158813}",
                "substitution_latex": "\\frac{1.1 \\cdot 400 \\cdot 0.57735}{0.0158813}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.0003200016,
                  "rx_ratio": 0.0201536516315,
                  "x_ohm": 0.0158780952381
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.9425039122
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.0201537}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.0201537}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 16082.3841419,
                  "kappa": 1.9425039122
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 44180.1647845
                },
                "substitution": "1.9425 \\cdot \\sqrt{2} \\cdot 16082.4",
                "substitution_latex": "1.9425 \\cdot \\sqrt{2} \\cdot 16082.4",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.530919091671,
                  "ikss_a": 16082.3841419,
                  "kappa": 1.9425039122,
                  "ta_s": 0.157941544294,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 17983.4818477
                },
                "substitution": "16082.4 \\cdot \\sqrt{1 + \\left((1.9425 - 1) \\cdot 0.530919\\right)^2}",
                "substitution_latex": "16082.4 \\cdot \\sqrt{1 + \\left((1.9425 - 1) \\cdot 0.530919\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 16082.3841419,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 16082.3841419
                },
                "substitution": "16082.4 \\cdot \\sqrt{1}",
                "substitution_latex": "16082.4 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 16082.3841419,
                  "un_v": 400.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 11.1422025762
                },
                "substitution": "\\sqrt{3} \\cdot 400 \\cdot 16082.4 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 400 \\cdot 16082.4 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 13.901,
            "ith_ka": 13.901,
            "kappa": 1.943,
            "sk_mva": 9.63,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "NN_BUS",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.0158780952381,
                    "re": 0.0003200016
                  },
                  "z2_ohm": {
                    "im": 0.0158780952381,
                    "re": 0.0003200016
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.0003200016,
                  "x_ohm": 0.0158780952381,
                  "z_equiv_abs_ohm": 0.0158813195111,
                  "z_equiv_ohm": {
                    "im": 0.0158780952381,
                    "re": 0.0003200016
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
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.0158813195111
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 13901.1411962
                },
                "substitution": "\\frac{0.95 \\cdot 400 \\cdot 0.57735}{0.0158813}",
                "substitution_latex": "\\frac{0.95 \\cdot 400 \\cdot 0.57735}{0.0158813}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.0003200016,
                  "rx_ratio": 0.0201536516315,
                  "x_ohm": 0.0158780952381
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.9425039122
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.0201537}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.0201537}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 13901.1411962,
                  "kappa": 1.9425039122
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 38188.0387462
                },
                "substitution": "1.9425 \\cdot \\sqrt{2} \\cdot 13901.1",
                "substitution_latex": "1.9425 \\cdot \\sqrt{2} \\cdot 13901.1",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.530919091671,
                  "ikss_a": 13901.1411962,
                  "kappa": 1.9425039122,
                  "ta_s": 0.157941544294,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 15544.3942987
                },
                "substitution": "13901.1 \\cdot \\sqrt{1 + \\left((1.9425 - 1) \\cdot 0.530919\\right)^2}",
                "substitution_latex": "13901.1 \\cdot \\sqrt{1 + \\left((1.9425 - 1) \\cdot 0.530919\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 13901.1411962,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 13901.1411962
                },
                "substitution": "13901.1 \\cdot \\sqrt{1}",
                "substitution_latex": "13901.1 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 13901.1411962,
                  "un_v": 400.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 9.63099313402
                },
                "substitution": "\\sqrt{3} \\cdot 400 \\cdot 13901.1 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 400 \\cdot 13901.1 / 10^6",
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
            "ikss_max_ka": 16.082,
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
      "technology": "PV"
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
        "field_id": "g2-conn",
        "interface_protection": true,
        "kind": "POLE_PRZY\u0141\u0104CZENIOWE",
        "on_bus_ref": "PCC_SN",
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
        "field_id": "g2-meter",
        "interface_protection": false,
        "kind": "POLE_POMIAROWE",
        "on_bus_ref": "PCC_SN",
        "protection_codes": [],
        "role": "measurement",
        "source_ref": "enm:Measurement.purpose=metering"
      },
      {
        "abb_cell": "SDC",
        "field_id": "g2-src",
        "interface_protection": false,
        "kind": "PV",
        "on_bus_ref": "NN_COLLECTOR",
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
        "field_id": "g3-conn",
        "interface_protection": true,
        "kind": "POLE_PRZY\u0141\u0104CZENIOWE",
        "on_bus_ref": "PCC_SN",
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
        "field_id": "g3-src",
        "interface_protection": false,
        "kind": "PV",
        "on_bus_ref": "PV_SN",
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
        "field_id": "g4-vcb",
        "interface_protection": true,
        "kind": "POLE NR 1 \u2014 VCB (e\u00b2TANGO)",
        "on_bus_ref": "SN_PCC",
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
        "source_ref": "enm:Bay.bay_role=LINIA_OUT;schemat:POLE_NR_1_VCB"
      },
      {
        "abb_cell": "SDC",
        "field_id": "g4-sl2u",
        "interface_protection": false,
        "kind": "POLE NR 2 \u2014 S\u01412+U",
        "on_bus_ref": "SN_PCC",
        "protection_codes": [],
        "role": "switch",
        "source_ref": "enm:Bay.bay_role=LINIA_OUT;schemat:POLE_NR_2_SL2U"
      },
      {
        "abb_cell": "SDM-V",
        "field_id": "g4-meter",
        "interface_protection": false,
        "kind": "CTM 20 / VTB 20",
        "on_bus_ref": "SN_PCC",
        "protection_codes": [],
        "role": "measurement",
        "source_ref": "enm:Measurement;schemat:CTM20_VTB20"
      },
      {
        "abb_cell": "SDC",
        "field_id": "g4-own",
        "interface_protection": false,
        "kind": "POTRZEBY W\u0141ASNE (RPW-PV)",
        "on_bus_ref": "NN_800",
        "protection_codes": [],
        "role": "load",
        "source_ref": "enm:Bay.specialization=POTRZEBY_WLASNE;schemat:RPW-PV"
      },
      {
        "abb_cell": "DBC",
        "field_id": "g4-src",
        "interface_protection": false,
        "kind": "PV 1 MW (falowniki)",
        "on_bus_ref": "NN_800",
        "protection_codes": [],
        "role": "source",
        "source_ref": "enm:Generator.gen_type=pv_inverter;schemat:falowniki_AC_DC"
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
            "ib_ka": 14.017,
            "ikss_ka": 13.264,
            "ip_ka": 35.871,
            "ith_ka": 13.264,
            "kappa": 1.912,
            "rx_ratio": 0.0313,
            "sk_mva": 18.38,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "NN_800",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.04096,
                    "re": 0.0012800064
                  },
                  "z2_ohm": {
                    "im": 0.04096,
                    "re": 0.0012800064
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.0012800064,
                  "x_ohm": 0.04096,
                  "z_equiv_abs_ohm": 0.0409799953195,
                  "z_equiv_ohm": {
                    "im": 0.04096,
                    "re": 0.0012800064
                  }
                },
                "substitution": "\\left(0.00128001 + j 0.04096\\right)",
                "substitution_latex": "\\left(0.00128001 + j 0.04096\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 1.1,
                  "un_v": 800.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.0409799953195
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 13263.98282
                },
                "substitution": "\\frac{1.1 \\cdot 800 \\cdot 0.57735}{0.04098}",
                "substitution_latex": "\\frac{1.1 \\cdot 800 \\cdot 0.57735}{0.04098}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.0012800064,
                  "rx_ratio": 0.03125015625,
                  "x_ohm": 0.04096
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
                  "ikss_a": 13263.98282,
                  "kappa": 1.91229973589
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 35871.1180805
                },
                "substitution": "1.9123 \\cdot \\sqrt{2} \\cdot 13264",
                "substitution_latex": "1.9123 \\cdot \\sqrt{2} \\cdot 13264",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.374653899822,
                  "ikss_a": 13263.98282,
                  "kappa": 1.91229973589,
                  "ta_s": 0.101858654286,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 14017.3689649
                },
                "substitution": "13264 \\cdot \\sqrt{1 + \\left((1.9123 - 1) \\cdot 0.374654\\right)^2}",
                "substitution_latex": "13264 \\cdot \\sqrt{1 + \\left((1.9123 - 1) \\cdot 0.374654\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 13263.98282,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 13263.98282
                },
                "substitution": "13264 \\cdot \\sqrt{1}",
                "substitution_latex": "13264 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 13263.98282,
                  "un_v": 800.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 18.3791137239
                },
                "substitution": "\\sqrt{3} \\cdot 800 \\cdot 13264 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 800 \\cdot 13264 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 11.573,
            "ith_ka": 11.573,
            "kappa": 1.912,
            "sk_mva": 16.04,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "NN_800",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.04096,
                    "re": 0.0012800064
                  },
                  "z2_ohm": {
                    "im": 0.04096,
                    "re": 0.0012800064
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.0012800064,
                  "x_ohm": 0.04096,
                  "z_equiv_abs_ohm": 0.0409799953195,
                  "z_equiv_ohm": {
                    "im": 0.04096,
                    "re": 0.0012800064
                  }
                },
                "substitution": "\\left(0.00128001 + j 0.04096\\right)",
                "substitution_latex": "\\left(0.00128001 + j 0.04096\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 0.95,
                  "un_v": 800.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.0409799953195
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 11573.3522632
                },
                "substitution": "\\frac{0.95 \\cdot 800 \\cdot 0.57735}{0.04098}",
                "substitution_latex": "\\frac{0.95 \\cdot 800 \\cdot 0.57735}{0.04098}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.0012800064,
                  "rx_ratio": 0.03125015625,
                  "x_ohm": 0.04096
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
                  "ikss_a": 11573.3522632,
                  "kappa": 1.91229973589
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 31298.9764278
                },
                "substitution": "1.9123 \\cdot \\sqrt{2} \\cdot 11573.4",
                "substitution_latex": "1.9123 \\cdot \\sqrt{2} \\cdot 11573.4",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.374653899822,
                  "ikss_a": 11573.3522632,
                  "kappa": 1.91229973589,
                  "ta_s": 0.101858654286,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 12230.7116223
                },
                "substitution": "11573.4 \\cdot \\sqrt{1 + \\left((1.9123 - 1) \\cdot 0.374654\\right)^2}",
                "substitution_latex": "11573.4 \\cdot \\sqrt{1 + \\left((1.9123 - 1) \\cdot 0.374654\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 11573.3522632,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 11573.3522632
                },
                "substitution": "11573.4 \\cdot \\sqrt{1}",
                "substitution_latex": "11573.4 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 11573.3522632,
                  "un_v": 800.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 16.036507307
                },
                "substitution": "\\sqrt{3} \\cdot 800 \\cdot 11573.4 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 800 \\cdot 11573.4 / 10^6",
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
            "ikss_max_ka": 13.264,
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
            "ib_ka": 9.882,
            "ikss_ka": 9.882,
            "ip_ka": 17.312,
            "ith_ka": 9.882,
            "kappa": 1.239,
            "rx_ratio": 0.5,
            "sk_mva": 269.59,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "SN_PCC",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.99225,
                    "re": 0.496127480625
                  },
                  "z2_ohm": {
                    "im": 0.99225,
                    "re": 0.496127480625
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.496127480625,
                  "x_ohm": 0.99225,
                  "z_equiv_abs_ohm": 1.10937033471,
                  "z_equiv_ohm": {
                    "im": 0.99225,
                    "re": 0.496127480625
                  }
                },
                "substitution": "\\left(0.496127 + j 0.99225\\right)",
                "substitution_latex": "\\left(0.496127 + j 0.99225\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 1.1,
                  "un_v": 15750.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 1.10937033471
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 9882.48555308
                },
                "substitution": "\\frac{1.1 \\cdot 15750 \\cdot 0.57735}{1.10937}",
                "substitution_latex": "\\frac{1.1 \\cdot 15750 \\cdot 0.57735}{1.10937}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.496127480625,
                  "rx_ratio": 0.5000025,
                  "x_ohm": 0.99225
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
                  "ikss_a": 9882.48555308,
                  "kappa": 1.23866591694
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 17311.5268514
                },
                "substitution": "1.23867 \\cdot \\sqrt{2} \\cdot 9882.49",
                "substitution_latex": "1.23867 \\cdot \\sqrt{2} \\cdot 9882.49",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 1.50689891918e-07,
                  "ikss_a": 9882.48555308,
                  "kappa": 1.23866591694,
                  "ta_s": 0.00636616589285,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 9882.48555308
                },
                "substitution": "9882.49 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
                "substitution_latex": "9882.49 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 9882.48555308,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 9882.48555308
                },
                "substitution": "9882.49 \\cdot \\sqrt{1}",
                "substitution_latex": "9882.49 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 9882.48555308,
                  "un_v": 15750.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 269.592231557
                },
                "substitution": "\\sqrt{3} \\cdot 15750 \\cdot 9882.49 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15750 \\cdot 9882.49 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 8.653,
            "ith_ka": 8.653,
            "kappa": 1.239,
            "sk_mva": 236.05,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "SN_PCC",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.99225,
                    "re": 0.496127480625
                  },
                  "z2_ohm": {
                    "im": 0.99225,
                    "re": 0.496127480625
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.496127480625,
                  "x_ohm": 0.99225,
                  "z_equiv_abs_ohm": 1.10937033471,
                  "z_equiv_ohm": {
                    "im": 0.99225,
                    "re": 0.496127480625
                  }
                },
                "substitution": "\\left(0.496127 + j 0.99225\\right)",
                "substitution_latex": "\\left(0.496127 + j 0.99225\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 0.95,
                  "un_v": 15750.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 1.10937033471
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 8652.96825999
                },
                "substitution": "\\frac{0.95 \\cdot 15750 \\cdot 0.57735}{1.10937}",
                "substitution_latex": "\\frac{0.95 \\cdot 15750 \\cdot 0.57735}{1.10937}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.496127480625,
                  "rx_ratio": 0.5000025,
                  "x_ohm": 0.99225
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
                  "ikss_a": 8652.96825999,
                  "kappa": 1.23866591694
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 15157.7345165
                },
                "substitution": "1.23867 \\cdot \\sqrt{2} \\cdot 8652.97",
                "substitution_latex": "1.23867 \\cdot \\sqrt{2} \\cdot 8652.97",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 1.50689891918e-07,
                  "ikss_a": 8652.96825999,
                  "kappa": 1.23866591694,
                  "ta_s": 0.00636616589285,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 8652.96825999
                },
                "substitution": "8652.97 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
                "substitution_latex": "8652.97 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{t_k}",
                "inputs": {
                  "ikss_a": 8652.96825999,
                  "tk_s": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 8652.96825999
                },
                "substitution": "8652.97 \\cdot \\sqrt{1}",
                "substitution_latex": "8652.97 \\cdot \\sqrt{1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 8652.96825999,
                  "un_v": 15750.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 236.051245436
                },
                "substitution": "\\sqrt{3} \\cdot 15750 \\cdot 8652.97 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15750 \\cdot 8652.97 / 10^6",
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
            "ikss_max_ka": 9.882,
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
        "p_osiagalna_kw": 950.0,
        "p_przylacz_kw": 1000.0,
        "p_zainst_kw": 1199.52,
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
        "nn_grid": "IT",
        "nn_kv": 0.8,
        "nn_main_breaker": "3WA1108 \u00b7 800 A \u00b7 1000 V",
        "own_needs": "RPW-PV \u00b7 TS 5 kVA 800/230 V \u00b7 F1-F10",
        "pv_modules": "JA SOLAR JAM72D40-595/MB \u00b7 595 Wp \u00b7 ~2016 szt (\u22481,2 MWp DC)",
        "sn_kv": 15.75,
        "source_ref": "schemat:stacja_TR_PV1MW_wykonawczy",
        "transformer": "1000 kVA \u00b7 15,75/0,8 kV \u00b7 POLIM-D18N",
        "vt": {
          "ratio": "15/\u221a3 : 0,1/\u221a3 \u00d73 : 0,1/3",
          "type": "VTB 20",
          "windings": [
            "I pomiar 0,2",
            "II pomiar 0,2",
            "III zab. 3P",
            "IV zab. 3P (otwarty tr\u00f3jk\u0105t)"
          ]
        }
      },
      "technology": "PV 1 MW"
    },
    "voltage_flow": {
      "branches": {
        "sr/branch/in": {
          "branch_ref": "sr/branch/in",
          "direction": "reverse",
          "i_a": 32.34,
          "loading_percent": 5.13,
          "p_mw": -0.8386,
          "q_mvar": 0.0529,
          "s_mva": 0.8403
        },
        "sr/branch/tr": {
          "branch_ref": "sr/branch/tr",
          "direction": "reverse",
          "i_a": 30.8,
          "loading_percent": null,
          "p_mw": -0.84,
          "q_mvar": 0.0501,
          "s_mva": 0.8415
        }
      },
      "buses": {
        "NN_800": {
          "bus_ref": "NN_800",
          "deviation_percent": 0.146,
          "u_kv": 0.8012,
          "u_pu": 1.00146,
          "un_kv": 0.8
        },
        "SN_PCC": {
          "bus_ref": "SN_PCC",
          "deviation_percent": 0.147,
          "u_kv": 15.7732,
          "u_pu": 1.00147,
          "un_kv": 15.75
        }
      }
    }
  }
};
