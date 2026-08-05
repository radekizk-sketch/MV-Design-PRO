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
          "idyn_ka": 52.5,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 16.575,
            "ikss_ka": 16.575,
            "ip_ka": 32.177,
            "ith_ka": 16.659,
            "kappa": 1.373,
            "rx_ratio": 0.3406,
            "sk_mva": 11.48,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr",
                  "c_max": 1.05,
                  "s_rt_mva": 0.63,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.4,
                  "x_t_ohm_hv": 20.3289278154,
                  "x_t_pu": 0.056920997883
                },
                "key": "KT[sr/branch/tr]",
                "notes": null,
                "result": {
                  "k_t": 0.964557843035,
                  "z_t_pu": {
                    "im": 0.056920997883,
                    "re": 0.018973665961
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.964558 \\cdot \\left(0.0189737 + j 0.056921\\right) = \\left(0.0183012 + j 0.0549036\\right)",
                  "z_tk_pu": {
                    "im": 0.0549035949415,
                    "re": 0.0183011983138
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.056921}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.056921}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr"
              },
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "NN_BUS",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.0145837701439,
                    "re": 0.00496792498129
                  },
                  "z2_ohm": {
                    "im": 0.0145837701439,
                    "re": 0.00496792498129
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.00496792498129,
                  "x_ohm": 0.0145837701439,
                  "z_equiv_abs_ohm": 0.015406707313,
                  "z_equiv_ohm": {
                    "im": 0.0145837701439,
                    "re": 0.00496792498129
                  }
                },
                "substitution": "\\left(0.00496792 + j 0.0145838\\right)",
                "substitution_latex": "\\left(0.00496792 + j 0.0145838\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 1.1,
                  "un_v": 400.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.015406707313
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 16575.1431015
                },
                "substitution": "\\frac{1.1 \\cdot 400 \\cdot 0.57735}{0.0154067}",
                "substitution_latex": "\\frac{1.1 \\cdot 400 \\cdot 0.57735}{0.0154067}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.00496792498129,
                  "rx_ratio": 0.340647509682,
                  "x_ohm": 0.0145837701439
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.37269725085
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.340648}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.340648}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 16575.1431015,
                  "kappa": 1.37269725085
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 32177.1109727
                },
                "substitution": "1.3727 \\cdot \\sqrt{2} \\cdot 16575.1",
                "substitution_latex": "1.3727 \\cdot \\sqrt{2} \\cdot 16575.1",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 2.25053581114e-05,
                  "ikss_a": 16575.1431015,
                  "kappa": 1.37269725085,
                  "ta_s": 0.00934425989142,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 16575.1431021
                },
                "substitution": "16575.1 \\cdot \\sqrt{1 + \\left((1.3727 - 1) \\cdot 2.25054e-05\\right)^2}",
                "substitution_latex": "16575.1 \\cdot \\sqrt{1 + \\left((1.3727 - 1) \\cdot 2.25054e-05\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 16575.1431015,
                  "m_factor": 0.0101318267291,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 16658.8997232
                },
                "substitution": "16575.1 \\cdot \\sqrt{0.0101318 + 1}",
                "substitution_latex": "16575.1 \\cdot \\sqrt{0.0101318 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 16575.1431015,
                  "un_v": 400.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 11.4835959978
                },
                "substitution": "\\sqrt{3} \\cdot 400 \\cdot 16575.1 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 400 \\cdot 16575.1 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 14.327,
            "ith_ka": 14.399,
            "kappa": 1.373,
            "sk_mva": 9.93,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr",
                  "c_max": 1.05,
                  "s_rt_mva": 0.63,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.4,
                  "x_t_ohm_hv": 20.3289278154,
                  "x_t_pu": 0.056920997883
                },
                "key": "KT[sr/branch/tr]",
                "notes": null,
                "result": {
                  "k_t": 0.964557843035,
                  "z_t_pu": {
                    "im": 0.056920997883,
                    "re": 0.018973665961
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.964558 \\cdot \\left(0.0189737 + j 0.056921\\right) = \\left(0.0183012 + j 0.0549036\\right)",
                  "z_tk_pu": {
                    "im": 0.0549035949415,
                    "re": 0.0183011983138
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.056921}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.056921}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr"
              },
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "NN_BUS",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.0145837701439,
                    "re": 0.00496792498129
                  },
                  "z2_ohm": {
                    "im": 0.0145837701439,
                    "re": 0.00496792498129
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.00496792498129,
                  "x_ohm": 0.0145837701439,
                  "z_equiv_abs_ohm": 0.015406707313,
                  "z_equiv_ohm": {
                    "im": 0.0145837701439,
                    "re": 0.00496792498129
                  }
                },
                "substitution": "\\left(0.00496792 + j 0.0145838\\right)",
                "substitution_latex": "\\left(0.00496792 + j 0.0145838\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 0.95,
                  "un_v": 400.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.015406707313
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 14326.7057522
                },
                "substitution": "\\frac{0.95 \\cdot 400 \\cdot 0.57735}{0.0154067}",
                "substitution_latex": "\\frac{0.95 \\cdot 400 \\cdot 0.57735}{0.0154067}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.00496792498129,
                  "rx_ratio": 0.340647509682,
                  "x_ohm": 0.0145837701439
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.37269725085
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.340648}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.340648}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 14326.7057522,
                  "kappa": 1.37269725085
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 27812.2486207
                },
                "substitution": "1.3727 \\cdot \\sqrt{2} \\cdot 14326.7",
                "substitution_latex": "1.3727 \\cdot \\sqrt{2} \\cdot 14326.7",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 2.25053581114e-05,
                  "ikss_a": 14326.7057522,
                  "kappa": 1.37269725085,
                  "ta_s": 0.00934425989142,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 14326.7057527
                },
                "substitution": "14326.7 \\cdot \\sqrt{1 + \\left((1.3727 - 1) \\cdot 2.25054e-05\\right)^2}",
                "substitution_latex": "14326.7 \\cdot \\sqrt{1 + \\left((1.3727 - 1) \\cdot 2.25054e-05\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 14326.7057522,
                  "m_factor": 0.0101318267291,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 14399.1006913
                },
                "substitution": "14326.7 \\cdot \\sqrt{0.0101318 + 1}",
                "substitution_latex": "14326.7 \\cdot \\sqrt{0.0101318 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 14326.7057522,
                  "un_v": 400.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 9.92583290718
                },
                "substitution": "\\sqrt{3} \\cdot 400 \\cdot 14326.7 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 400 \\cdot 14326.7 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ik_contribution_ka": 0.087,
            "is_synchronous_machine": false,
            "machine_type": "IBG",
            "model": "IEC 60909 \u00a76.7 \u2014 \u017ar\u00f3d\u0142o pr\u0105dowe ograniczone (k\u00b7I_rated), sprowadzone przez przek\u0142adni\u0119"
          },
          "un_kv": 0.4,
          "verification": {
            "icw_ka": 25.0,
            "ikss_max_ka": 16.575,
            "passed": true,
            "rule": "ikss_max_le_icw"
          }
        },
        "SN_BUS": {
          "bus_ref": "SN_BUS",
          "icw_ka": 25.0,
          "idyn_ka": 62.5,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 9.47,
            "ikss_ka": 9.47,
            "ip_ka": 16.588,
            "ith_ka": 9.503,
            "kappa": 1.239,
            "rx_ratio": 0.5,
            "sk_mva": 246.03,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr",
                  "c_max": 1.05,
                  "s_rt_mva": 0.63,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.4,
                  "x_t_ohm_hv": 20.3289278154,
                  "x_t_pu": 0.056920997883
                },
                "key": "KT[sr/branch/tr]",
                "notes": null,
                "result": {
                  "k_t": 0.964557843035,
                  "z_t_pu": {
                    "im": 0.056920997883,
                    "re": 0.018973665961
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.964558 \\cdot \\left(0.0189737 + j 0.056921\\right) = \\left(0.0183012 + j 0.0549036\\right)",
                  "z_tk_pu": {
                    "im": 0.0549035949415,
                    "re": 0.0183011983138
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.056921}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.056921}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr"
              },
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
                  "ikss_a": 9469.59255784
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
                  "ikss_a": 9469.59255784,
                  "kappa": 1.23866591694
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 16588.2464443
                },
                "substitution": "1.23867 \\cdot \\sqrt{2} \\cdot 9469.59",
                "substitution_latex": "1.23867 \\cdot \\sqrt{2} \\cdot 9469.59",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 1.50689891918e-07,
                  "ikss_a": 9469.59255784,
                  "kappa": 1.23866591694,
                  "ta_s": 0.00636616589285,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 9469.59255784
                },
                "substitution": "9469.59 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
                "substitution_latex": "9469.59 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 9469.59255784,
                  "m_factor": 0.00697987437408,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 9502.58337322
                },
                "substitution": "9469.59 \\cdot \\sqrt{0.00697987 + 1}",
                "substitution_latex": "9469.59 \\cdot \\sqrt{0.00697987 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 9469.59255784,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 246.027231557
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 9469.59 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 9469.59 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 8.179,
            "ith_ka": 8.207,
            "kappa": 1.239,
            "sk_mva": 212.49,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr",
                  "c_max": 1.05,
                  "s_rt_mva": 0.63,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.4,
                  "x_t_ohm_hv": 20.3289278154,
                  "x_t_pu": 0.056920997883
                },
                "key": "KT[sr/branch/tr]",
                "notes": null,
                "result": {
                  "k_t": 0.964557843035,
                  "z_t_pu": {
                    "im": 0.056920997883,
                    "re": 0.018973665961
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.964558 \\cdot \\left(0.0189737 + j 0.056921\\right) = \\left(0.0183012 + j 0.0549036\\right)",
                  "z_tk_pu": {
                    "im": 0.0549035949415,
                    "re": 0.0183011983138
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.056921}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.056921}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr"
              },
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
                  "ikss_a": 8178.5994001
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
                  "ikss_a": 8178.5994001,
                  "kappa": 1.23866591694
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 14326.7644927
                },
                "substitution": "1.23867 \\cdot \\sqrt{2} \\cdot 8178.6",
                "substitution_latex": "1.23867 \\cdot \\sqrt{2} \\cdot 8178.6",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 1.50689891918e-07,
                  "ikss_a": 8178.5994001,
                  "kappa": 1.23866591694,
                  "ta_s": 0.00636616589285,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 8178.5994001
                },
                "substitution": "8178.6 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
                "substitution_latex": "8178.6 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 8178.5994001,
                  "m_factor": 0.00697987437408,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 8207.09256506
                },
                "substitution": "8178.6 \\cdot \\sqrt{0.00697987 + 1}",
                "substitution_latex": "8178.6 \\cdot \\sqrt{0.00697987 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 8178.5994001,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 212.486245436
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 8178.6 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 8178.6 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ik_contribution_ka": 0.002,
            "is_synchronous_machine": false,
            "machine_type": "IBG",
            "model": "IEC 60909 \u00a76.7 \u2014 \u017ar\u00f3d\u0142o pr\u0105dowe ograniczone (k\u00b7I_rated), sprowadzone przez przek\u0142adni\u0119"
          },
          "un_kv": 15.0,
          "verification": {
            "icw_ka": 25.0,
            "ikss_max_ka": 9.47,
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
      "technology": "PV"
    },
    "voltage_flow": {
      "branches": {
        "sr/branch/in": {
          "branch_ref": "sr/branch/in",
          "direction": "reverse",
          "i_a": 1.35,
          "loading_percent": 0.22,
          "p_mw": -0.035,
          "q_mvar": 0.0041,
          "s_mva": 0.0352
        },
        "sr/branch/tr": {
          "branch_ref": "sr/branch/tr",
          "direction": "reverse",
          "i_a": 1.35,
          "loading_percent": null,
          "p_mw": -0.035,
          "q_mvar": 0.0041,
          "s_mva": 0.0352
        }
      },
      "buses": {
        "NN_BUS": {
          "bus_ref": "NN_BUS",
          "deviation_percent": 0.074,
          "u_kv": 0.4003,
          "u_pu": 1.00074,
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
          "icw_ka": 40.0,
          "idyn_ka": 84.0,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 28.848,
            "ikss_ka": 27.405,
            "ip_ka": 73.997,
            "ith_ka": 28.81,
            "kappa": 1.909,
            "rx_ratio": 0.0324,
            "sk_mva": 18.99,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr",
                  "c_max": 1.05,
                  "s_rt_mva": 1.0,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.4,
                  "x_t_ohm_hv": 13.5,
                  "x_t_pu": 0.06
                },
                "key": "KT[sr/branch/tr]",
                "notes": null,
                "result": {
                  "k_t": 0.962837837838,
                  "z_t_pu": {
                    "im": 0.06,
                    "re": 0.0
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.962838 \\cdot \\left(0 + j 0.06\\right) = \\left(0 + j 0.0577703\\right)",
                  "z_tk_pu": {
                    "im": 0.0577702702703,
                    "re": 0.0
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.06}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.06}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr"
              },
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "NN_COLLECTOR",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.00988324324324,
                    "re": 0.0003200016
                  },
                  "z2_ohm": {
                    "im": 0.00988324324324,
                    "re": 0.0003200016
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.0003200016,
                  "x_ohm": 0.00988324324324,
                  "z_equiv_abs_ohm": 0.00988842242368,
                  "z_equiv_ohm": {
                    "im": 0.00988324324324,
                    "re": 0.0003200016
                  }
                },
                "substitution": "\\left(0.000320002 + j 0.00988324\\right)",
                "substitution_latex": "\\left(0.000320002 + j 0.00988324\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 1.1,
                  "un_v": 400.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.00988842242368
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 27404.7855539
                },
                "substitution": "\\frac{1.1 \\cdot 400 \\cdot 0.57735}{0.00988842}",
                "substitution_latex": "\\frac{1.1 \\cdot 400 \\cdot 0.57735}{0.00988842}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.0003200016,
                  "rx_ratio": 0.032378197331,
                  "x_ohm": 0.00988324324324
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.90928518729
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.0323782}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.0323782}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 27404.7855539,
                  "kappa": 1.90928518729
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 73996.6756239
                },
                "substitution": "1.90929 \\cdot \\sqrt{2} \\cdot 27404.8",
                "substitution_latex": "1.90929 \\cdot \\sqrt{2} \\cdot 27404.8",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.361609250479,
                  "ikss_a": 27404.7855539,
                  "kappa": 1.90928518729,
                  "ta_s": 0.0983099469466,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 28848.1853781
                },
                "substitution": "27404.8 \\cdot \\sqrt{1 + \\left((1.90929 - 1) \\cdot 0.361609\\right)^2}",
                "substitution_latex": "27404.8 \\cdot \\sqrt{1 + \\left((1.90929 - 1) \\cdot 0.361609\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 27404.7855539,
                  "m_factor": 0.105156344353,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 28809.668999
                },
                "substitution": "27404.8 \\cdot \\sqrt{0.105156 + 1}",
                "substitution_latex": "27404.8 \\cdot \\sqrt{0.105156 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 27404.7855539,
                  "un_v": 400.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 18.98659238
                },
                "substitution": "\\sqrt{3} \\cdot 400 \\cdot 27404.8 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 400 \\cdot 27404.8 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 23.902,
            "ith_ka": 25.127,
            "kappa": 1.909,
            "sk_mva": 16.56,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr",
                  "c_max": 1.05,
                  "s_rt_mva": 1.0,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.4,
                  "x_t_ohm_hv": 13.5,
                  "x_t_pu": 0.06
                },
                "key": "KT[sr/branch/tr]",
                "notes": null,
                "result": {
                  "k_t": 0.962837837838,
                  "z_t_pu": {
                    "im": 0.06,
                    "re": 0.0
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.962838 \\cdot \\left(0 + j 0.06\\right) = \\left(0 + j 0.0577703\\right)",
                  "z_tk_pu": {
                    "im": 0.0577702702703,
                    "re": 0.0
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.06}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.06}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr"
              },
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "NN_COLLECTOR",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.00988324324324,
                    "re": 0.0003200016
                  },
                  "z2_ohm": {
                    "im": 0.00988324324324,
                    "re": 0.0003200016
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.0003200016,
                  "x_ohm": 0.00988324324324,
                  "z_equiv_abs_ohm": 0.00988842242368,
                  "z_equiv_ohm": {
                    "im": 0.00988324324324,
                    "re": 0.0003200016
                  }
                },
                "substitution": "\\left(0.000320002 + j 0.00988324\\right)",
                "substitution_latex": "\\left(0.000320002 + j 0.00988324\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 0.95,
                  "un_v": 400.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.00988842242368
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 23901.596201
                },
                "substitution": "\\frac{0.95 \\cdot 400 \\cdot 0.57735}{0.00988842}",
                "substitution_latex": "\\frac{0.95 \\cdot 400 \\cdot 0.57735}{0.00988842}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.0003200016,
                  "rx_ratio": 0.032378197331,
                  "x_ohm": 0.00988324324324
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.90928518729
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.0323782}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.0323782}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 23901.596201,
                  "kappa": 1.90928518729
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 64537.5844122
                },
                "substitution": "1.90929 \\cdot \\sqrt{2} \\cdot 23901.6",
                "substitution_latex": "1.90929 \\cdot \\sqrt{2} \\cdot 23901.6",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.361609250479,
                  "ikss_a": 23901.596201,
                  "kappa": 1.90928518729,
                  "ta_s": 0.0983099469466,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 25160.4843499
                },
                "substitution": "23901.6 \\cdot \\sqrt{1 + \\left((1.90929 - 1) \\cdot 0.361609\\right)^2}",
                "substitution_latex": "23901.6 \\cdot \\sqrt{1 + \\left((1.90929 - 1) \\cdot 0.361609\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 23901.596201,
                  "m_factor": 0.105156344353,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 25126.8915695
                },
                "substitution": "23901.6 \\cdot \\sqrt{0.105156 + 1}",
                "substitution_latex": "23901.6 \\cdot \\sqrt{0.105156 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 23901.596201,
                  "un_v": 400.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 16.5595116009
                },
                "substitution": "\\sqrt{3} \\cdot 400 \\cdot 23901.6 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 400 \\cdot 23901.6 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ik_contribution_ka": 1.715,
            "is_synchronous_machine": false,
            "machine_type": "IBG",
            "model": "IEC 60909 \u00a76.7 \u2014 \u017ar\u00f3d\u0142o pr\u0105dowe ograniczone (k\u00b7I_rated), sprowadzone przez przek\u0142adni\u0119"
          },
          "un_kv": 0.4,
          "verification": {
            "icw_ka": 40.0,
            "ikss_max_ka": 27.405,
            "passed": true,
            "rule": "ikss_max_le_icw"
          }
        },
        "PCC_SN": {
          "bus_ref": "PCC_SN",
          "icw_ka": 25.0,
          "idyn_ka": 62.5,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 9.513,
            "ikss_ka": 9.513,
            "ip_ka": 16.664,
            "ith_ka": 9.546,
            "kappa": 1.239,
            "rx_ratio": 0.5,
            "sk_mva": 247.16,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr",
                  "c_max": 1.05,
                  "s_rt_mva": 1.0,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.4,
                  "x_t_ohm_hv": 13.5,
                  "x_t_pu": 0.06
                },
                "key": "KT[sr/branch/tr]",
                "notes": null,
                "result": {
                  "k_t": 0.962837837838,
                  "z_t_pu": {
                    "im": 0.06,
                    "re": 0.0
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.962838 \\cdot \\left(0 + j 0.06\\right) = \\left(0 + j 0.0577703\\right)",
                  "z_tk_pu": {
                    "im": 0.0577702702703,
                    "re": 0.0
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.06}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.06}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr"
              },
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
                  "ikss_a": 9513.00929808
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
                  "ikss_a": 9513.00929808,
                  "kappa": 1.23866591694
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 16664.301204
                },
                "substitution": "1.23867 \\cdot \\sqrt{2} \\cdot 9513.01",
                "substitution_latex": "1.23867 \\cdot \\sqrt{2} \\cdot 9513.01",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 1.50689891918e-07,
                  "ikss_a": 9513.00929808,
                  "kappa": 1.23866591694,
                  "ta_s": 0.00636616589285,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 9513.00929808
                },
                "substitution": "9513.01 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
                "substitution_latex": "9513.01 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 9513.00929808,
                  "m_factor": 0.00697987437408,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 9546.15137168
                },
                "substitution": "9513.01 \\cdot \\sqrt{0.00697987 + 1}",
                "substitution_latex": "9513.01 \\cdot \\sqrt{0.00697987 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 9513.00929808,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 247.155231557
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 9513.01 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 9513.01 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 8.222,
            "ith_ka": 8.251,
            "kappa": 1.239,
            "sk_mva": 213.61,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr",
                  "c_max": 1.05,
                  "s_rt_mva": 1.0,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.4,
                  "x_t_ohm_hv": 13.5,
                  "x_t_pu": 0.06
                },
                "key": "KT[sr/branch/tr]",
                "notes": null,
                "result": {
                  "k_t": 0.962837837838,
                  "z_t_pu": {
                    "im": 0.06,
                    "re": 0.0
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.962838 \\cdot \\left(0 + j 0.06\\right) = \\left(0 + j 0.0577703\\right)",
                  "z_tk_pu": {
                    "im": 0.0577702702703,
                    "re": 0.0
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.06}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.06}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr"
              },
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
                  "ikss_a": 8222.01614034
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
                  "ikss_a": 8222.01614034,
                  "kappa": 1.23866591694
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 14402.8192524
                },
                "substitution": "1.23867 \\cdot \\sqrt{2} \\cdot 8222.02",
                "substitution_latex": "1.23867 \\cdot \\sqrt{2} \\cdot 8222.02",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 1.50689891918e-07,
                  "ikss_a": 8222.01614034,
                  "kappa": 1.23866591694,
                  "ta_s": 0.00636616589285,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 8222.01614034
                },
                "substitution": "8222.02 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
                "substitution_latex": "8222.02 \\cdot \\sqrt{1 + \\left((1.23867 - 1) \\cdot 1.5069e-07\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 8222.01614034,
                  "m_factor": 0.00697987437408,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 8250.66056352
                },
                "substitution": "8222.02 \\cdot \\sqrt{0.00697987 + 1}",
                "substitution_latex": "8222.02 \\cdot \\sqrt{0.00697987 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 8222.01614034,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 213.614245436
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 8222.02 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 8222.02 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ik_contribution_ka": 0.046,
            "is_synchronous_machine": false,
            "machine_type": "IBG",
            "model": "IEC 60909 \u00a76.7 \u2014 \u017ar\u00f3d\u0142o pr\u0105dowe ograniczone (k\u00b7I_rated), sprowadzone przez przek\u0142adni\u0119"
          },
          "un_kv": 15.0,
          "verification": {
            "icw_ka": 25.0,
            "ikss_max_ka": 9.513,
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
          "i_a": 34.29,
          "loading_percent": 5.44,
          "p_mw": -0.8894,
          "q_mvar": 0.0508,
          "s_mva": 0.8908
        },
        "sr/branch/tr": {
          "branch_ref": "sr/branch/tr",
          "direction": "reverse",
          "i_a": 34.29,
          "loading_percent": null,
          "p_mw": -0.891,
          "q_mvar": 0.0476,
          "s_mva": 0.8923
        }
      },
      "buses": {
        "NN_COLLECTOR": {
          "bus_ref": "NN_COLLECTOR",
          "deviation_percent": 0.016,
          "u_kv": 0.4001,
          "u_pu": 1.00016,
          "un_kv": 0.4
        },
        "PCC_SN": {
          "bus_ref": "PCC_SN",
          "deviation_percent": 0.158,
          "u_kv": 15.0237,
          "u_pu": 1.00158,
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
          "idyn_ka": 62.5,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 9.537,
            "ikss_ka": 9.537,
            "ip_ka": 16.706,
            "ith_ka": 9.57,
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
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 9536.56518906,
                  "m_factor": 0.00697987437408,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 9569.78932829
                },
                "substitution": "9536.57 \\cdot \\sqrt{0.00697987 + 1}",
                "substitution_latex": "9536.57 \\cdot \\sqrt{0.00697987 + 1}",
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
            "ith_ka": 8.274,
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
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 8245.57203132,
                  "m_factor": 0.00697987437408,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 8274.29852013
                },
                "substitution": "8245.57 \\cdot \\sqrt{0.00697987 + 1}",
                "substitution_latex": "8245.57 \\cdot \\sqrt{0.00697987 + 1}",
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
            "model": "IEC 60909 \u00a76.7 \u2014 \u017ar\u00f3d\u0142o pr\u0105dowe ograniczone (k\u00b7I_rated), sprowadzone przez przek\u0142adni\u0119"
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
          "idyn_ka": 62.5,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 7.352,
            "ikss_ka": 7.352,
            "ip_ka": 12.878,
            "ith_ka": 7.377,
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
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 7351.80921809,
                  "m_factor": 0.00697988209956,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 7377.42198307
                },
                "substitution": "7351.81 \\cdot \\sqrt{0.00697988 + 1}",
                "substitution_latex": "7351.81 \\cdot \\sqrt{0.00697988 + 1}",
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
            "ith_ka": 6.381,
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
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 6358.73732912,
                  "m_factor": 0.00697988209956,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 6380.89035839
                },
                "substitution": "6358.74 \\cdot \\sqrt{0.00697988 + 1}",
                "substitution_latex": "6358.74 \\cdot \\sqrt{0.00697988 + 1}",
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
            "model": "IEC 60909 \u00a76.7 \u2014 \u017ar\u00f3d\u0142o pr\u0105dowe ograniczone (k\u00b7I_rated), sprowadzone przez przek\u0142adni\u0119"
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
          "idyn_ka": 105.0,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 30.507,
            "ikss_ka": 30.507,
            "ip_ka": 66.581,
            "ith_ka": 30.756,
            "kappa": 1.543,
            "rx_ratio": 0.2092,
            "sk_mva": 42.27,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr",
                  "c_max": 1.05,
                  "s_rt_mva": 2.5,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.8,
                  "x_t_ohm_hv": 5.27141012499,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/tr]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr"
              },
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "NN",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.0172820379705,
                    "re": 0.00361480002307
                  },
                  "z2_ohm": {
                    "im": 0.0172820379705,
                    "re": 0.00361480002307
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.00361480002307,
                  "x_ohm": 0.0172820379705,
                  "z_equiv_abs_ohm": 0.0176560362375,
                  "z_equiv_ohm": {
                    "im": 0.0172820379705,
                    "re": 0.00361480002307
                  }
                },
                "substitution": "\\left(0.0036148 + j 0.017282\\right)",
                "substitution_latex": "\\left(0.0036148 + j 0.017282\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 1.1,
                  "un_v": 800.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.0176560362375
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 30507.0793291
                },
                "substitution": "\\frac{1.1 \\cdot 800 \\cdot 0.57735}{0.017656}",
                "substitution_latex": "\\frac{1.1 \\cdot 800 \\cdot 0.57735}{0.017656}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.00361480002307,
                  "rx_ratio": 0.209165147608,
                  "x_ohm": 0.0172820379705
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.54324883185
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.209165}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.209165}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 30507.0793291,
                  "kappa": 1.54324883185
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 66581.1950762
                },
                "substitution": "1.54325 \\cdot \\sqrt{2} \\cdot 30507.1",
                "substitution_latex": "1.54325 \\cdot \\sqrt{2} \\cdot 30507.1",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.00140023260304,
                  "ikss_a": 30507.0793291,
                  "kappa": 1.54324883185,
                  "ta_s": 0.0152181130472,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 30507.0881552
                },
                "substitution": "30507.1 \\cdot \\sqrt{1 + \\left((1.54325 - 1) \\cdot 0.00140023\\right)^2}",
                "substitution_latex": "30507.1 \\cdot \\sqrt{1 + \\left((1.54325 - 1) \\cdot 0.00140023\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 30507.0793291,
                  "m_factor": 0.0163883968735,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 30756.0445011
                },
                "substitution": "30507.1 \\cdot \\sqrt{0.0163884 + 1}",
                "substitution_latex": "30507.1 \\cdot \\sqrt{0.0163884 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 30507.0793291,
                  "un_v": 800.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 42.2718491108
                },
                "substitution": "\\sqrt{3} \\cdot 800 \\cdot 30507.1 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 800 \\cdot 30507.1 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 26.583,
            "ith_ka": 26.8,
            "kappa": 1.543,
            "sk_mva": 36.83,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr",
                  "c_max": 1.05,
                  "s_rt_mva": 2.5,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.8,
                  "x_t_ohm_hv": 5.27141012499,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/tr]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr"
              },
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "NN",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.0172820379705,
                    "re": 0.00361480002307
                  },
                  "z2_ohm": {
                    "im": 0.0172820379705,
                    "re": 0.00361480002307
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.00361480002307,
                  "x_ohm": 0.0172820379705,
                  "z_equiv_abs_ohm": 0.0176560362375,
                  "z_equiv_ohm": {
                    "im": 0.0172820379705,
                    "re": 0.00361480002307
                  }
                },
                "substitution": "\\left(0.0036148 + j 0.017282\\right)",
                "substitution_latex": "\\left(0.0036148 + j 0.017282\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 0.95,
                  "un_v": 800.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.0176560362375
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 26583.0937091
                },
                "substitution": "\\frac{0.95 \\cdot 800 \\cdot 0.57735}{0.017656}",
                "substitution_latex": "\\frac{0.95 \\cdot 800 \\cdot 0.57735}{0.017656}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.00361480002307,
                  "rx_ratio": 0.209165147608,
                  "x_ohm": 0.0172820379705
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.54324883185
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.209165}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.209165}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 26583.0937091,
                  "kappa": 1.54324883185
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 58017.1614883
                },
                "substitution": "1.54325 \\cdot \\sqrt{2} \\cdot 26583.1",
                "substitution_latex": "1.54325 \\cdot \\sqrt{2} \\cdot 26583.1",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.00140023260304,
                  "ikss_a": 26583.0937091,
                  "kappa": 1.54324883185,
                  "ta_s": 0.0152181130472,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 26583.1013999
                },
                "substitution": "26583.1 \\cdot \\sqrt{1 + \\left((1.54325 - 1) \\cdot 0.00140023\\right)^2}",
                "substitution_latex": "26583.1 \\cdot \\sqrt{1 + \\left((1.54325 - 1) \\cdot 0.00140023\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 26583.0937091,
                  "m_factor": 0.0163883968735,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 26800.0356335
                },
                "substitution": "26583.1 \\cdot \\sqrt{0.0163884 + 1}",
                "substitution_latex": "26583.1 \\cdot \\sqrt{0.0163884 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 26583.0937091,
                  "un_v": 800.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 36.8346151412
                },
                "substitution": "\\sqrt{3} \\cdot 800 \\cdot 26583.1 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 800 \\cdot 26583.1 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ik_contribution_ka": 1.731,
            "is_synchronous_machine": false,
            "machine_type": "IBG",
            "model": "IEC 60909 \u00a76.7 \u2014 \u017ar\u00f3d\u0142o pr\u0105dowe ograniczone (k\u00b7I_rated), sprowadzone przez przek\u0142adni\u0119"
          },
          "un_kv": 0.8,
          "verification": {
            "icw_ka": 50.0,
            "ikss_max_ka": 30.507,
            "passed": true,
            "rule": "ikss_max_le_icw"
          }
        },
        "SN_PCC": {
          "bus_ref": "SN_PCC",
          "icw_ka": 16.0,
          "idyn_ka": 40.0,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 9.561,
            "ikss_ka": 9.561,
            "ip_ka": 22.432,
            "ith_ka": 9.675,
            "kappa": 1.659,
            "rx_ratio": 0.1426,
            "sk_mva": 248.41,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr",
                  "c_max": 1.05,
                  "s_rt_mva": 2.5,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.8,
                  "x_t_ohm_hv": 5.27141012499,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/tr]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr"
              },
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
                  "ikss_a": 9561.11591093
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
                  "ikss_a": 9561.11591093,
                  "kappa": 1.658955589
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 22431.5012945
                },
                "substitution": "1.65896 \\cdot \\sqrt{2} \\cdot 9561.12",
                "substitution_latex": "1.65896 \\cdot \\sqrt{2} \\cdot 9561.12",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.0113442026223,
                  "ikss_a": 9561.11591093,
                  "kappa": 1.658955589,
                  "ta_s": 0.0223261706515,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 9561.38304714
                },
                "substitution": "9561.12 \\cdot \\sqrt{1 + \\left((1.65896 - 1) \\cdot 0.0113442\\right)^2}",
                "substitution_latex": "9561.12 \\cdot \\sqrt{1 + \\left((1.65896 - 1) \\cdot 0.0113442\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 9561.11591093,
                  "m_factor": 0.0239751154653,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 9675.05148013
                },
                "substitution": "9561.12 \\cdot \\sqrt{0.0239751 + 1}",
                "substitution_latex": "9561.12 \\cdot \\sqrt{0.0239751 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 9561.11591093,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 248.405078022
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 9561.12 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 9561.12 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 8.27,
            "ith_ka": 8.368,
            "kappa": 1.659,
            "sk_mva": 214.86,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr",
                  "c_max": 1.05,
                  "s_rt_mva": 2.5,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.8,
                  "x_t_ohm_hv": 5.27141012499,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/tr]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr"
              },
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
                  "ikss_a": 8269.9178124
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
                  "ikss_a": 8269.9178124,
                  "kappa": 1.658955589
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 19402.1988482
                },
                "substitution": "1.65896 \\cdot \\sqrt{2} \\cdot 8269.92",
                "substitution_latex": "1.65896 \\cdot \\sqrt{2} \\cdot 8269.92",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.0113442026223,
                  "ikss_a": 8269.9178124,
                  "kappa": 1.658955589,
                  "ta_s": 0.0223261706515,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 8270.14887272
                },
                "substitution": "8269.92 \\cdot \\sqrt{1 + \\left((1.65896 - 1) \\cdot 0.0113442\\right)^2}",
                "substitution_latex": "8269.92 \\cdot \\sqrt{1 + \\left((1.65896 - 1) \\cdot 0.0113442\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 8269.9178124,
                  "m_factor": 0.0239751154653,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 8368.46674769
                },
                "substitution": "8269.92 \\cdot \\sqrt{0.0239751 + 1}",
                "substitution_latex": "8269.92 \\cdot \\sqrt{0.0239751 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 8269.9178124,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 214.858767382
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 8269.92 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 8269.92 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ik_contribution_ka": 0.092,
            "is_synchronous_machine": false,
            "machine_type": "IBG",
            "model": "IEC 60909 \u00a76.7 \u2014 \u017ar\u00f3d\u0142o pr\u0105dowe ograniczone (k\u00b7I_rated), sprowadzone przez przek\u0142adni\u0119"
          },
          "un_kv": 15.0,
          "verification": {
            "icw_ka": 16.0,
            "ikss_max_ka": 9.561,
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
      "metering": {
        "ct": {
          "cores": 2,
          "ipn_a": 100.0,
          "isn_a": 5.0
        },
        "source_ref": "norma:IEC_61869-2_CT;norma:IEC_61869-3_VT",
        "vt": {
          "fv": 1.9,
          "usn_v": 100.0
        }
      },
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
      "technology": "Hybryda PV + BESS \u2014 AC-coupled (wsp\u00f3lna szyna nN, jeden trafo przy\u0142\u0105czeniowy)"
    },
    "voltage_flow": {
      "branches": {
        "sr/branch/bess_pcs1": {
          "branch_ref": "sr/branch/bess_pcs1",
          "direction": "reverse",
          "i_a": 352.83,
          "loading_percent": 56.0,
          "p_mw": -0.4925,
          "q_mvar": 0.0149,
          "s_mva": 0.4927
        },
        "sr/branch/bess_pcs2": {
          "branch_ref": "sr/branch/bess_pcs2",
          "direction": "reverse",
          "i_a": 352.83,
          "loading_percent": 56.0,
          "p_mw": -0.4925,
          "q_mvar": 0.0149,
          "s_mva": 0.4927
        },
        "sr/branch/in": {
          "branch_ref": "sr/branch/in",
          "direction": "reverse",
          "i_a": 74.67,
          "loading_percent": 11.85,
          "p_mw": -1.9321,
          "q_mvar": 0.1748,
          "s_mva": 1.94
        },
        "sr/branch/pv_inv1": {
          "branch_ref": "sr/branch/pv_inv1",
          "direction": "reverse",
          "i_a": 236.09,
          "loading_percent": 37.47,
          "p_mw": -0.3297,
          "q_mvar": 0.0067,
          "s_mva": 0.3298
        },
        "sr/branch/pv_inv2": {
          "branch_ref": "sr/branch/pv_inv2",
          "direction": "reverse",
          "i_a": 236.09,
          "loading_percent": 37.47,
          "p_mw": -0.3297,
          "q_mvar": 0.0067,
          "s_mva": 0.3298
        },
        "sr/branch/pv_inv3": {
          "branch_ref": "sr/branch/pv_inv3",
          "direction": "reverse",
          "i_a": 236.09,
          "loading_percent": 37.47,
          "p_mw": -0.3297,
          "q_mvar": 0.0067,
          "s_mva": 0.3298
        },
        "sr/branch/tr": {
          "branch_ref": "sr/branch/tr",
          "direction": "reverse",
          "i_a": 74.67,
          "loading_percent": null,
          "p_mw": -1.9344,
          "q_mvar": 0.1581,
          "s_mva": 1.9409
        }
      },
      "buses": {
        "NN": {
          "bus_ref": "NN",
          "deviation_percent": 0.79,
          "u_kv": 0.8063,
          "u_pu": 1.0079,
          "un_kv": 0.8
        },
        "SN_PCC": {
          "bus_ref": "SN_PCC",
          "deviation_percent": 0.048,
          "u_kv": 15.0072,
          "u_pu": 1.00048,
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
          "idyn_ka": 105.0,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 34.77,
            "ikss_ka": 34.77,
            "ip_ka": 75.429,
            "ith_ka": 35.046,
            "kappa": 1.534,
            "rx_ratio": 0.2151,
            "sk_mva": 24.09,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr-bess",
                  "c_max": 1.05,
                  "s_rt_mva": 1.25,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.4,
                  "x_t_ohm_hv": 10.54282025,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/tr-bess]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr-bess"
              },
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr-pv",
                  "c_max": 1.05,
                  "s_rt_mva": 1.0,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.8,
                  "x_t_ohm_hv": 13.1785253125,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/tr-pv]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr-pv"
              },
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "BESS_NN",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.00793275231857,
                    "re": 0.00170642063376
                  },
                  "z2_ohm": {
                    "im": 0.00793275231857,
                    "re": 0.00170642063376
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.00170642063376,
                  "x_ohm": 0.00793275231857,
                  "z_equiv_abs_ohm": 0.00811421165161,
                  "z_equiv_ohm": {
                    "im": 0.00793275231857,
                    "re": 0.00170642063376
                  }
                },
                "substitution": "\\left(0.00170642 + j 0.00793275\\right)",
                "substitution_latex": "\\left(0.00170642 + j 0.00793275\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 1.1,
                  "un_v": 400.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.00811421165161
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 33191.920163
                },
                "substitution": "\\frac{1.1 \\cdot 400 \\cdot 0.57735}{0.00811421}",
                "substitution_latex": "\\frac{1.1 \\cdot 400 \\cdot 0.57735}{0.00811421}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.00170642063376,
                  "rx_ratio": 0.215110791971,
                  "x_ohm": 0.00793275231857
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.53399842218
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.215111}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.215111}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 33191.920163,
                  "kappa": 1.53399842218
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 72006.5971841
                },
                "substitution": "1.534 \\cdot \\sqrt{2} \\cdot 33191.9",
                "substitution_latex": "1.534 \\cdot \\sqrt{2} \\cdot 33191.9",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.00116166049336,
                  "ikss_a": 33191.920163,
                  "kappa": 1.53399842218,
                  "ta_s": 0.0147974856709,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 33191.9265492
                },
                "substitution": "33191.9 \\cdot \\sqrt{1 + \\left((1.534 - 1) \\cdot 0.00116166\\right)^2}",
                "substitution_latex": "33191.9 \\cdot \\sqrt{1 + \\left((1.534 - 1) \\cdot 0.00116166\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 33191.920163,
                  "m_factor": 0.0159397504275,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 33455.4097862
                },
                "substitution": "33191.9 \\cdot \\sqrt{0.0159398 + 1}",
                "substitution_latex": "33191.9 \\cdot \\sqrt{0.0159398 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 33191.920163,
                  "un_v": 400.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 22.9960368493
                },
                "substitution": "\\sqrt{3} \\cdot 400 \\cdot 33191.9 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 400 \\cdot 33191.9 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 30.5,
            "ith_ka": 30.743,
            "kappa": 1.534,
            "sk_mva": 21.13,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr-bess",
                  "c_max": 1.05,
                  "s_rt_mva": 1.25,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.4,
                  "x_t_ohm_hv": 10.54282025,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/tr-bess]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr-bess"
              },
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr-pv",
                  "c_max": 1.05,
                  "s_rt_mva": 1.0,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.8,
                  "x_t_ohm_hv": 13.1785253125,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/tr-pv]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr-pv"
              },
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "BESS_NN",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.00793275231857,
                    "re": 0.00170642063376
                  },
                  "z2_ohm": {
                    "im": 0.00793275231857,
                    "re": 0.00170642063376
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.00170642063376,
                  "x_ohm": 0.00793275231857,
                  "z_equiv_abs_ohm": 0.00811421165161,
                  "z_equiv_ohm": {
                    "im": 0.00793275231857,
                    "re": 0.00170642063376
                  }
                },
                "substitution": "\\left(0.00170642 + j 0.00793275\\right)",
                "substitution_latex": "\\left(0.00170642 + j 0.00793275\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 0.95,
                  "un_v": 400.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.00811421165161
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 28922.7418819
                },
                "substitution": "\\frac{0.95 \\cdot 400 \\cdot 0.57735}{0.00811421}",
                "substitution_latex": "\\frac{0.95 \\cdot 400 \\cdot 0.57735}{0.00811421}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.00170642063376,
                  "rx_ratio": 0.215110791971,
                  "x_ohm": 0.00793275231857
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.53399842218
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.215111}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.215111}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 28922.7418819,
                  "kappa": 1.53399842218
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 62745.0359582
                },
                "substitution": "1.534 \\cdot \\sqrt{2} \\cdot 28922.7",
                "substitution_latex": "1.534 \\cdot \\sqrt{2} \\cdot 28922.7",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.00116166049336,
                  "ikss_a": 28922.7418819,
                  "kappa": 1.53399842218,
                  "ta_s": 0.0147974856709,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 28922.7474467
                },
                "substitution": "28922.7 \\cdot \\sqrt{1 + \\left((1.534 - 1) \\cdot 0.00116166\\right)^2}",
                "substitution_latex": "28922.7 \\cdot \\sqrt{1 + \\left((1.534 - 1) \\cdot 0.00116166\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 28922.7418819,
                  "m_factor": 0.0159397504275,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 29152.3412038
                },
                "substitution": "28922.7 \\cdot \\sqrt{0.0159398 + 1}",
                "substitution_latex": "28922.7 \\cdot \\sqrt{0.0159398 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 28922.7418819,
                  "un_v": 400.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 20.0382633735
                },
                "substitution": "\\sqrt{3} \\cdot 400 \\cdot 28922.7 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 400 \\cdot 28922.7 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ik_contribution_ka": 3.462,
            "is_synchronous_machine": false,
            "machine_type": "IBG",
            "model": "IEC 60909 \u00a76.7 \u2014 \u017ar\u00f3d\u0142o pr\u0105dowe ograniczone (k\u00b7I_rated), sprowadzone przez przek\u0142adni\u0119"
          },
          "un_kv": 0.4,
          "verification": {
            "icw_ka": 50.0,
            "ikss_max_ka": 34.77,
            "passed": true,
            "rule": "ikss_max_le_icw"
          }
        },
        "PV_NN": {
          "bus_ref": "PV_NN",
          "icw_ka": 50.0,
          "idyn_ka": 105.0,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 14.478,
            "ikss_ka": 14.478,
            "ip_ka": 31.368,
            "ith_ka": 14.593,
            "kappa": 1.532,
            "rx_ratio": 0.2164,
            "sk_mva": 20.06,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr-bess",
                  "c_max": 1.05,
                  "s_rt_mva": 1.25,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.4,
                  "x_t_ohm_hv": 10.54282025,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/tr-bess]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr-bess"
              },
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr-pv",
                  "c_max": 1.05,
                  "s_rt_mva": 1.0,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.8,
                  "x_t_ohm_hv": 13.1785253125,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/tr-pv]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr-pv"
              },
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "PV_NN",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.0389554949262,
                    "re": 0.008431123791
                  },
                  "z2_ohm": {
                    "im": 0.0389554949262,
                    "re": 0.008431123791
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.008431123791,
                  "x_ohm": 0.0389554949262,
                  "z_equiv_abs_ohm": 0.0398574263259,
                  "z_equiv_ohm": {
                    "im": 0.0389554949262,
                    "re": 0.008431123791
                  }
                },
                "substitution": "\\left(0.00843112 + j 0.0389555\\right)",
                "substitution_latex": "\\left(0.00843112 + j 0.0389555\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 1.1,
                  "un_v": 800.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.0398574263259
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 13674.4800583
                },
                "substitution": "\\frac{1.1 \\cdot 800 \\cdot 0.57735}{0.0398574}",
                "substitution_latex": "\\frac{1.1 \\cdot 800 \\cdot 0.57735}{0.0398574}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.008431123791,
                  "rx_ratio": 0.216429641235,
                  "x_ohm": 0.0389554949262
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.53196878069
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.21643}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.21643}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 13674.4800583,
                  "kappa": 1.53196878069
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 29626.1853213
                },
                "substitution": "1.53197 \\cdot \\sqrt{2} \\cdot 13674.5",
                "substitution_latex": "1.53197 \\cdot \\sqrt{2} \\cdot 13674.5",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.00111451303517,
                  "ikss_a": 13674.4800583,
                  "kappa": 1.53196878069,
                  "ta_s": 0.0147073147822,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 13674.4824616
                },
                "substitution": "13674.5 \\cdot \\sqrt{1 + \\left((1.53197 - 1) \\cdot 0.00111451\\right)^2}",
                "substitution_latex": "13674.5 \\cdot \\sqrt{1 + \\left((1.53197 - 1) \\cdot 0.00111451\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 13674.4800583,
                  "m_factor": 0.0158435801538,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 13782.3807151
                },
                "substitution": "13674.5 \\cdot \\sqrt{0.0158436 + 1}",
                "substitution_latex": "13674.5 \\cdot \\sqrt{0.0158436 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 13674.4800583,
                  "un_v": 800.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 18.9479153824
                },
                "substitution": "\\sqrt{3} \\cdot 800 \\cdot 13674.5 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 800 \\cdot 13674.5 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 12.74,
            "ith_ka": 12.841,
            "kappa": 1.532,
            "sk_mva": 17.65,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr-bess",
                  "c_max": 1.05,
                  "s_rt_mva": 1.25,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.4,
                  "x_t_ohm_hv": 10.54282025,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/tr-bess]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr-bess"
              },
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr-pv",
                  "c_max": 1.05,
                  "s_rt_mva": 1.0,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.8,
                  "x_t_ohm_hv": 13.1785253125,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/tr-pv]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr-pv"
              },
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "PV_NN",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.0389554949262,
                    "re": 0.008431123791
                  },
                  "z2_ohm": {
                    "im": 0.0389554949262,
                    "re": 0.008431123791
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.008431123791,
                  "x_ohm": 0.0389554949262,
                  "z_equiv_abs_ohm": 0.0398574263259,
                  "z_equiv_ohm": {
                    "im": 0.0389554949262,
                    "re": 0.008431123791
                  }
                },
                "substitution": "\\left(0.00843112 + j 0.0389555\\right)",
                "substitution_latex": "\\left(0.00843112 + j 0.0389555\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 0.95,
                  "un_v": 800.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.0398574263259
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 11936.2335459
                },
                "substitution": "\\frac{0.95 \\cdot 800 \\cdot 0.57735}{0.0398574}",
                "substitution_latex": "\\frac{0.95 \\cdot 800 \\cdot 0.57735}{0.0398574}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.008431123791,
                  "rx_ratio": 0.216429641235,
                  "x_ohm": 0.0389554949262
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.53196878069
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.21643}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.21643}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 11936.2335459,
                  "kappa": 1.53196878069
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 25860.2203201
                },
                "substitution": "1.53197 \\cdot \\sqrt{2} \\cdot 11936.2",
                "substitution_latex": "1.53197 \\cdot \\sqrt{2} \\cdot 11936.2",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.00111451303517,
                  "ikss_a": 11936.2335459,
                  "kappa": 1.53196878069,
                  "ta_s": 0.0147073147822,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 11936.2356438
                },
                "substitution": "11936.2 \\cdot \\sqrt{1 + \\left((1.53197 - 1) \\cdot 0.00111451\\right)^2}",
                "substitution_latex": "11936.2 \\cdot \\sqrt{1 + \\left((1.53197 - 1) \\cdot 0.00111451\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 11936.2335459,
                  "m_factor": 0.0158435801538,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 12030.4182925
                },
                "substitution": "11936.2 \\cdot \\sqrt{0.0158436 + 1}",
                "substitution_latex": "11936.2 \\cdot \\sqrt{0.0158436 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 11936.2335459,
                  "un_v": 800.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 16.539330362
                },
                "substitution": "\\sqrt{3} \\cdot 800 \\cdot 11936.2 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 800 \\cdot 11936.2 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ik_contribution_ka": 1.731,
            "is_synchronous_machine": false,
            "machine_type": "IBG",
            "model": "IEC 60909 \u00a76.7 \u2014 \u017ar\u00f3d\u0142o pr\u0105dowe ograniczone (k\u00b7I_rated), sprowadzone przez przek\u0142adni\u0119"
          },
          "un_kv": 0.8,
          "verification": {
            "icw_ka": 50.0,
            "ikss_max_ka": 14.478,
            "passed": true,
            "rule": "ikss_max_le_icw"
          }
        },
        "SN_PCC": {
          "bus_ref": "SN_PCC",
          "icw_ka": 16.0,
          "idyn_ka": 40.0,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 9.561,
            "ikss_ka": 9.561,
            "ip_ka": 22.432,
            "ith_ka": 9.675,
            "kappa": 1.659,
            "rx_ratio": 0.1426,
            "sk_mva": 248.41,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr-bess",
                  "c_max": 1.05,
                  "s_rt_mva": 1.25,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.4,
                  "x_t_ohm_hv": 10.54282025,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/tr-bess]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr-bess"
              },
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr-pv",
                  "c_max": 1.05,
                  "s_rt_mva": 1.0,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.8,
                  "x_t_ohm_hv": 13.1785253125,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/tr-pv]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr-pv"
              },
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
                  "ikss_a": 9561.11591093
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
                  "ikss_a": 9561.11591093,
                  "kappa": 1.658955589
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 22431.5012945
                },
                "substitution": "1.65896 \\cdot \\sqrt{2} \\cdot 9561.12",
                "substitution_latex": "1.65896 \\cdot \\sqrt{2} \\cdot 9561.12",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.0113442026223,
                  "ikss_a": 9561.11591093,
                  "kappa": 1.658955589,
                  "ta_s": 0.0223261706515,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 9561.38304714
                },
                "substitution": "9561.12 \\cdot \\sqrt{1 + \\left((1.65896 - 1) \\cdot 0.0113442\\right)^2}",
                "substitution_latex": "9561.12 \\cdot \\sqrt{1 + \\left((1.65896 - 1) \\cdot 0.0113442\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 9561.11591093,
                  "m_factor": 0.0239751154653,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 9675.05148013
                },
                "substitution": "9561.12 \\cdot \\sqrt{0.0239751 + 1}",
                "substitution_latex": "9561.12 \\cdot \\sqrt{0.0239751 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 9561.11591093,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 248.405078022
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 9561.12 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 9561.12 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 8.27,
            "ith_ka": 8.368,
            "kappa": 1.659,
            "sk_mva": 214.86,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr-bess",
                  "c_max": 1.05,
                  "s_rt_mva": 1.25,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.4,
                  "x_t_ohm_hv": 10.54282025,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/tr-bess]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr-bess"
              },
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr-pv",
                  "c_max": 1.05,
                  "s_rt_mva": 1.0,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.8,
                  "x_t_ohm_hv": 13.1785253125,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/tr-pv]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr-pv"
              },
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
                  "ikss_a": 8269.9178124
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
                  "ikss_a": 8269.9178124,
                  "kappa": 1.658955589
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 19402.1988482
                },
                "substitution": "1.65896 \\cdot \\sqrt{2} \\cdot 8269.92",
                "substitution_latex": "1.65896 \\cdot \\sqrt{2} \\cdot 8269.92",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.0113442026223,
                  "ikss_a": 8269.9178124,
                  "kappa": 1.658955589,
                  "ta_s": 0.0223261706515,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 8270.14887272
                },
                "substitution": "8269.92 \\cdot \\sqrt{1 + \\left((1.65896 - 1) \\cdot 0.0113442\\right)^2}",
                "substitution_latex": "8269.92 \\cdot \\sqrt{1 + \\left((1.65896 - 1) \\cdot 0.0113442\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 8269.9178124,
                  "m_factor": 0.0239751154653,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 8368.46674769
                },
                "substitution": "8269.92 \\cdot \\sqrt{0.0239751 + 1}",
                "substitution_latex": "8269.92 \\cdot \\sqrt{0.0239751 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 8269.9178124,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 214.858767382
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 8269.92 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 8269.92 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ik_contribution_ka": 0.092,
            "is_synchronous_machine": false,
            "machine_type": "IBG",
            "model": "IEC 60909 \u00a76.7 \u2014 \u017ar\u00f3d\u0142o pr\u0105dowe ograniczone (k\u00b7I_rated), sprowadzone przez przek\u0142adni\u0119"
          },
          "un_kv": 15.0,
          "verification": {
            "icw_ka": 16.0,
            "ikss_max_ka": 9.561,
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
      "metering": {
        "ct": {
          "cores": 2,
          "ipn_a": 100.0,
          "isn_a": 5.0
        },
        "source_ref": "norma:IEC_61869-2_CT;norma:IEC_61869-3_VT",
        "vt": {
          "fv": 1.9,
          "usn_v": 100.0
        }
      },
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
      "technology": "Hybryda PV + BESS \u2014 sprz\u0119\u017cenie na SN (wsp\u00f3lna szyna 15 kV, osobne trafa)"
    },
    "voltage_flow": {
      "branches": {
        "sr/branch/bess_pcs1": {
          "branch_ref": "sr/branch/bess_pcs1",
          "direction": "reverse",
          "i_a": 683.91,
          "loading_percent": 108.56,
          "p_mw": -0.4719,
          "q_mvar": 0.0561,
          "s_mva": 0.4752
        },
        "sr/branch/bess_pcs2": {
          "branch_ref": "sr/branch/bess_pcs2",
          "direction": "reverse",
          "i_a": 683.91,
          "loading_percent": 108.56,
          "p_mw": -0.4719,
          "q_mvar": 0.0561,
          "s_mva": 0.4752
        },
        "sr/branch/in": {
          "branch_ref": "sr/branch/in",
          "direction": "reverse",
          "i_a": 73.35,
          "loading_percent": 11.64,
          "p_mw": -1.8872,
          "q_mvar": 0.2646,
          "s_mva": 1.9057
        },
        "sr/branch/pv_inv1": {
          "branch_ref": "sr/branch/pv_inv1",
          "direction": "reverse",
          "i_a": 235.77,
          "loading_percent": 37.42,
          "p_mw": -0.3297,
          "q_mvar": 0.0067,
          "s_mva": 0.3298
        },
        "sr/branch/pv_inv2": {
          "branch_ref": "sr/branch/pv_inv2",
          "direction": "reverse",
          "i_a": 235.77,
          "loading_percent": 37.42,
          "p_mw": -0.3297,
          "q_mvar": 0.0067,
          "s_mva": 0.3298
        },
        "sr/branch/pv_inv3": {
          "branch_ref": "sr/branch/pv_inv3",
          "direction": "reverse",
          "i_a": 235.77,
          "loading_percent": 37.42,
          "p_mw": -0.3297,
          "q_mvar": 0.0067,
          "s_mva": 0.3298
        },
        "sr/branch/tr-bess": {
          "branch_ref": "sr/branch/tr-bess",
          "direction": "reverse",
          "i_a": 36.14,
          "loading_percent": null,
          "p_mw": -0.9247,
          "q_mvar": 0.1636,
          "s_mva": 0.9391
        },
        "sr/branch/tr-pv": {
          "branch_ref": "sr/branch/tr-pv",
          "direction": "reverse",
          "i_a": 37.28,
          "loading_percent": null,
          "p_mw": -0.9648,
          "q_mvar": 0.0849,
          "s_mva": 0.9685
        }
      },
      "buses": {
        "BESS_NN": {
          "bus_ref": "BESS_NN",
          "deviation_percent": 0.303,
          "u_kv": 0.4012,
          "u_pu": 1.00303,
          "un_kv": 0.4
        },
        "PV_NN": {
          "bus_ref": "PV_NN",
          "deviation_percent": 0.928,
          "u_kv": 0.8074,
          "u_pu": 1.00928,
          "un_kv": 0.8
        },
        "SN_PCC": {
          "bus_ref": "SN_PCC",
          "deviation_percent": 0.006,
          "u_kv": 15.0008,
          "u_pu": 1.00006,
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
          "idyn_ka": 105.0,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 13.613,
            "ikss_ka": 13.613,
            "ip_ka": 29.493,
            "ith_ka": 13.72,
            "kappa": 1.532,
            "rx_ratio": 0.2164,
            "sk_mva": 18.86,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr",
                  "c_max": 1.05,
                  "s_rt_mva": 1.0,
                  "u_rt_hv_kv": 15.75,
                  "u_rt_lv_kv": 0.8,
                  "x_t_ohm_hv": 14.529324157,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/tr]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr"
              },
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "NN_800",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.0389554949262,
                    "re": 0.008431123791
                  },
                  "z2_ohm": {
                    "im": 0.0389554949262,
                    "re": 0.008431123791
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.008431123791,
                  "x_ohm": 0.0389554949262,
                  "z_equiv_abs_ohm": 0.0398574263259,
                  "z_equiv_ohm": {
                    "im": 0.0389554949262,
                    "re": 0.008431123791
                  }
                },
                "substitution": "\\left(0.00843112 + j 0.0389555\\right)",
                "substitution_latex": "\\left(0.00843112 + j 0.0389555\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 1.1,
                  "un_v": 800.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.0398574263259
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 13612.8200843
                },
                "substitution": "\\frac{1.1 \\cdot 800 \\cdot 0.57735}{0.0398574}",
                "substitution_latex": "\\frac{1.1 \\cdot 800 \\cdot 0.57735}{0.0398574}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.008431123791,
                  "rx_ratio": 0.216429641235,
                  "x_ohm": 0.0389554949262
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.53196878069
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.21643}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.21643}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 13612.8200843,
                  "kappa": 1.53196878069
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 29492.5970746
                },
                "substitution": "1.53197 \\cdot \\sqrt{2} \\cdot 13612.8",
                "substitution_latex": "1.53197 \\cdot \\sqrt{2} \\cdot 13612.8",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.00111451303517,
                  "ikss_a": 13612.8200843,
                  "kappa": 1.53196878069,
                  "ta_s": 0.0147073147822,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 13612.8224768
                },
                "substitution": "13612.8 \\cdot \\sqrt{1 + \\left((1.53197 - 1) \\cdot 0.00111451\\right)^2}",
                "substitution_latex": "13612.8 \\cdot \\sqrt{1 + \\left((1.53197 - 1) \\cdot 0.00111451\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 13612.8200843,
                  "m_factor": 0.0158435801538,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 13720.2342033
                },
                "substitution": "13612.8 \\cdot \\sqrt{0.0158436 + 1}",
                "substitution_latex": "13612.8 \\cdot \\sqrt{0.0158436 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 13612.8200843,
                  "un_v": 800.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 18.8624768162
                },
                "substitution": "\\sqrt{3} \\cdot 800 \\cdot 13612.8 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 800 \\cdot 13612.8 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 11.875,
            "ith_ka": 11.968,
            "kappa": 1.532,
            "sk_mva": 16.45,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr",
                  "c_max": 1.05,
                  "s_rt_mva": 1.0,
                  "u_rt_hv_kv": 15.75,
                  "u_rt_lv_kv": 0.8,
                  "x_t_ohm_hv": 14.529324157,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/tr]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr"
              },
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "NN_800",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.0389554949262,
                    "re": 0.008431123791
                  },
                  "z2_ohm": {
                    "im": 0.0389554949262,
                    "re": 0.008431123791
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.008431123791,
                  "x_ohm": 0.0389554949262,
                  "z_equiv_abs_ohm": 0.0398574263259,
                  "z_equiv_ohm": {
                    "im": 0.0389554949262,
                    "re": 0.008431123791
                  }
                },
                "substitution": "\\left(0.00843112 + j 0.0389555\\right)",
                "substitution_latex": "\\left(0.00843112 + j 0.0389555\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 0.95,
                  "un_v": 800.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.0398574263259
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 11874.5735719
                },
                "substitution": "\\frac{0.95 \\cdot 800 \\cdot 0.57735}{0.0398574}",
                "substitution_latex": "\\frac{0.95 \\cdot 800 \\cdot 0.57735}{0.0398574}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.008431123791,
                  "rx_ratio": 0.216429641235,
                  "x_ohm": 0.0389554949262
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.53196878069
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.21643}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.21643}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 11874.5735719,
                  "kappa": 1.53196878069
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 25726.6320734
                },
                "substitution": "1.53197 \\cdot \\sqrt{2} \\cdot 11874.6",
                "substitution_latex": "1.53197 \\cdot \\sqrt{2} \\cdot 11874.6",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.00111451303517,
                  "ikss_a": 11874.5735719,
                  "kappa": 1.53196878069,
                  "ta_s": 0.0147073147822,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 11874.575659
                },
                "substitution": "11874.6 \\cdot \\sqrt{1 + \\left((1.53197 - 1) \\cdot 0.00111451\\right)^2}",
                "substitution_latex": "11874.6 \\cdot \\sqrt{1 + \\left((1.53197 - 1) \\cdot 0.00111451\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 11874.5735719,
                  "m_factor": 0.0158435801538,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 11968.2717807
                },
                "substitution": "11874.6 \\cdot \\sqrt{0.0158436 + 1}",
                "substitution_latex": "11874.6 \\cdot \\sqrt{0.0158436 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 11874.5735719,
                  "un_v": 800.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 16.4538917958
                },
                "substitution": "\\sqrt{3} \\cdot 800 \\cdot 11874.6 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 800 \\cdot 11874.6 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ik_contribution_ka": 0.866,
            "is_synchronous_machine": false,
            "machine_type": "IBG",
            "model": "IEC 60909 \u00a76.7 \u2014 \u017ar\u00f3d\u0142o pr\u0105dowe ograniczone (k\u00b7I_rated), sprowadzone przez przek\u0142adni\u0119"
          },
          "un_kv": 0.8,
          "verification": {
            "icw_ka": 50.0,
            "ikss_max_ka": 13.613,
            "passed": true,
            "rule": "ikss_max_le_icw"
          }
        },
        "SN_PCC": {
          "bus_ref": "SN_PCC",
          "icw_ka": 16.0,
          "idyn_ka": 40.0,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 9.062,
            "ikss_ka": 9.062,
            "ip_ka": 21.26,
            "ith_ka": 9.17,
            "kappa": 1.659,
            "rx_ratio": 0.1426,
            "sk_mva": 247.21,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr",
                  "c_max": 1.05,
                  "s_rt_mva": 1.0,
                  "u_rt_hv_kv": 15.75,
                  "u_rt_lv_kv": 0.8,
                  "x_t_ohm_hv": 14.529324157,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/tr]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr"
              },
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
                  "ikss_a": 9061.86247829
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
                  "ikss_a": 9061.86247829,
                  "kappa": 1.658955589
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 21260.1940826
                },
                "substitution": "1.65896 \\cdot \\sqrt{2} \\cdot 9061.86",
                "substitution_latex": "1.65896 \\cdot \\sqrt{2} \\cdot 9061.86",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.0113442026223,
                  "ikss_a": 9061.86247829,
                  "kappa": 1.658955589,
                  "ta_s": 0.0223261706515,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 9062.11566543
                },
                "substitution": "9061.86 \\cdot \\sqrt{1 + \\left((1.65896 - 1) \\cdot 0.0113442\\right)^2}",
                "substitution_latex": "9061.86 \\cdot \\sqrt{1 + \\left((1.65896 - 1) \\cdot 0.0113442\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 9061.86247829,
                  "m_factor": 0.0239751154653,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 9169.84866621
                },
                "substitution": "9061.86 \\cdot \\sqrt{0.0239751 + 1}",
                "substitution_latex": "9061.86 \\cdot \\sqrt{0.0239751 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 9061.86247829,
                  "un_v": 15750.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 247.205798022
                },
                "substitution": "\\sqrt{3} \\cdot 15750 \\cdot 9061.86 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15750 \\cdot 9061.86 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 7.832,
            "ith_ka": 7.925,
            "kappa": 1.659,
            "sk_mva": 213.66,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr",
                  "c_max": 1.05,
                  "s_rt_mva": 1.0,
                  "u_rt_hv_kv": 15.75,
                  "u_rt_lv_kv": 0.8,
                  "x_t_ohm_hv": 14.529324157,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/tr]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr"
              },
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
                  "ikss_a": 7832.1500035
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
                  "ikss_a": 7832.1500035,
                  "kappa": 1.658955589
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 18375.1441337
                },
                "substitution": "1.65896 \\cdot \\sqrt{2} \\cdot 7832.15",
                "substitution_latex": "1.65896 \\cdot \\sqrt{2} \\cdot 7832.15",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.0113442026223,
                  "ikss_a": 7832.1500035,
                  "kappa": 1.658955589,
                  "ta_s": 0.0223261706515,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 7832.36883265
                },
                "substitution": "7832.15 \\cdot \\sqrt{1 + \\left((1.65896 - 1) \\cdot 0.0113442\\right)^2}",
                "substitution_latex": "7832.15 \\cdot \\sqrt{1 + \\left((1.65896 - 1) \\cdot 0.0113442\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 7832.1500035,
                  "m_factor": 0.0239751154653,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 7925.48225436
                },
                "substitution": "7832.15 \\cdot \\sqrt{0.0239751 + 1}",
                "substitution_latex": "7832.15 \\cdot \\sqrt{0.0239751 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 7832.1500035,
                  "un_v": 15750.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 213.659487382
                },
                "substitution": "\\sqrt{3} \\cdot 15750 \\cdot 7832.15 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15750 \\cdot 7832.15 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ik_contribution_ka": 0.044,
            "is_synchronous_machine": false,
            "machine_type": "IBG",
            "model": "IEC 60909 \u00a76.7 \u2014 \u017ar\u00f3d\u0142o pr\u0105dowe ograniczone (k\u00b7I_rated), sprowadzone przez przek\u0142adni\u0119"
          },
          "un_kv": 15.75,
          "verification": {
            "icw_ka": 16.0,
            "ikss_max_ka": 9.062,
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
      "metering": {
        "ct": {
          "cores": 3,
          "ipn_a": 40.0,
          "isn_a": 5.0,
          "type": "AD11"
        },
        "source_ref": "norma:IEC_61869-2_CT;norma:IEC_61869-3_VT",
        "vt": {
          "fv": 1.9,
          "usn_v": 100.0
        }
      },
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
      "technology": "PV 1 MW \u201eBuk 1\u201d"
    },
    "voltage_flow": {
      "branches": {
        "sr/branch/in": {
          "branch_ref": "sr/branch/in",
          "direction": "reverse",
          "i_a": 37.07,
          "loading_percent": 5.88,
          "p_mw": -0.959,
          "q_mvar": 0.0881,
          "s_mva": 0.963
        },
        "sr/branch/inv1": {
          "branch_ref": "sr/branch/inv1",
          "direction": "reverse",
          "i_a": 235.89,
          "loading_percent": 37.44,
          "p_mw": -0.3299,
          "q_mvar": 0.0067,
          "s_mva": 0.33
        },
        "sr/branch/inv2": {
          "branch_ref": "sr/branch/inv2",
          "direction": "reverse",
          "i_a": 235.89,
          "loading_percent": 37.44,
          "p_mw": -0.3299,
          "q_mvar": 0.0067,
          "s_mva": 0.33
        },
        "sr/branch/inv3": {
          "branch_ref": "sr/branch/inv3",
          "direction": "reverse",
          "i_a": 235.89,
          "loading_percent": 37.44,
          "p_mw": -0.3299,
          "q_mvar": 0.0067,
          "s_mva": 0.33
        },
        "sr/branch/tr": {
          "branch_ref": "sr/branch/tr",
          "direction": "reverse",
          "i_a": 35.3,
          "loading_percent": null,
          "p_mw": -0.9595,
          "q_mvar": 0.0844,
          "s_mva": 0.9632
        }
      },
      "buses": {
        "NN_800": {
          "bus_ref": "NN_800",
          "deviation_percent": 0.938,
          "u_kv": 0.8075,
          "u_pu": 1.00938,
          "un_kv": 0.8
        },
        "SN_PCC": {
          "bus_ref": "SN_PCC",
          "deviation_percent": 0.02,
          "u_kv": 15.7532,
          "u_pu": 1.0002,
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
          "idyn_ka": 105.0,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 33.039,
            "ikss_ka": 33.039,
            "ip_ka": 71.676,
            "ith_ka": 33.302,
            "kappa": 1.534,
            "rx_ratio": 0.2151,
            "sk_mva": 22.89,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr",
                  "c_max": 1.05,
                  "s_rt_mva": 1.25,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.4,
                  "x_t_ohm_hv": 10.54282025,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/tr]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr"
              },
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "NN",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.00793275231857,
                    "re": 0.00170642063376
                  },
                  "z2_ohm": {
                    "im": 0.00793275231857,
                    "re": 0.00170642063376
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.00170642063376,
                  "x_ohm": 0.00793275231857,
                  "z_equiv_abs_ohm": 0.00811421165161,
                  "z_equiv_ohm": {
                    "im": 0.00793275231857,
                    "re": 0.00170642063376
                  }
                },
                "substitution": "\\left(0.00170642 + j 0.00793275\\right)",
                "substitution_latex": "\\left(0.00170642 + j 0.00793275\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 1.1,
                  "un_v": 400.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.00811421165161
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 33039.3582024
                },
                "substitution": "\\frac{1.1 \\cdot 400 \\cdot 0.57735}{0.00811421}",
                "substitution_latex": "\\frac{1.1 \\cdot 400 \\cdot 0.57735}{0.00811421}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.00170642063376,
                  "rx_ratio": 0.215110791971,
                  "x_ohm": 0.00793275231857
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.53399842218
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.215111}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.215111}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 33039.3582024,
                  "kappa": 1.53399842218
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 71675.6290572
                },
                "substitution": "1.534 \\cdot \\sqrt{2} \\cdot 33039.4",
                "substitution_latex": "1.534 \\cdot \\sqrt{2} \\cdot 33039.4",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.00116166049336,
                  "ikss_a": 33039.3582024,
                  "kappa": 1.53399842218,
                  "ta_s": 0.0147974856709,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 33039.3645592
                },
                "substitution": "33039.4 \\cdot \\sqrt{1 + \\left((1.534 - 1) \\cdot 0.00116166\\right)^2}",
                "substitution_latex": "33039.4 \\cdot \\sqrt{1 + \\left((1.534 - 1) \\cdot 0.00116166\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 33039.3582024,
                  "m_factor": 0.0159397504275,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 33301.6367329
                },
                "substitution": "33039.4 \\cdot \\sqrt{0.0159398 + 1}",
                "substitution_latex": "33039.4 \\cdot \\sqrt{0.0159398 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 33039.3582024,
                  "un_v": 400.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 22.8903388224
                },
                "substitution": "\\sqrt{3} \\cdot 400 \\cdot 33039.4 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 400 \\cdot 33039.4 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 28.77,
            "ith_ka": 28.999,
            "kappa": 1.534,
            "sk_mva": 19.93,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr",
                  "c_max": 1.05,
                  "s_rt_mva": 1.25,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.4,
                  "x_t_ohm_hv": 10.54282025,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/tr]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr"
              },
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "NN",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.00793275231857,
                    "re": 0.00170642063376
                  },
                  "z2_ohm": {
                    "im": 0.00793275231857,
                    "re": 0.00170642063376
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.00170642063376,
                  "x_ohm": 0.00793275231857,
                  "z_equiv_abs_ohm": 0.00811421165161,
                  "z_equiv_ohm": {
                    "im": 0.00793275231857,
                    "re": 0.00170642063376
                  }
                },
                "substitution": "\\left(0.00170642 + j 0.00793275\\right)",
                "substitution_latex": "\\left(0.00170642 + j 0.00793275\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 0.95,
                  "un_v": 400.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.00811421165161
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 28770.1799213
                },
                "substitution": "\\frac{0.95 \\cdot 400 \\cdot 0.57735}{0.00811421}",
                "substitution_latex": "\\frac{0.95 \\cdot 400 \\cdot 0.57735}{0.00811421}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.00170642063376,
                  "rx_ratio": 0.215110791971,
                  "x_ohm": 0.00793275231857
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.53399842218
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.215111}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.215111}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 28770.1799213,
                  "kappa": 1.53399842218
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 62414.0678313
                },
                "substitution": "1.534 \\cdot \\sqrt{2} \\cdot 28770.2",
                "substitution_latex": "1.534 \\cdot \\sqrt{2} \\cdot 28770.2",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.00116166049336,
                  "ikss_a": 28770.1799213,
                  "kappa": 1.53399842218,
                  "ta_s": 0.0147974856709,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 28770.1854567
                },
                "substitution": "28770.2 \\cdot \\sqrt{1 + \\left((1.534 - 1) \\cdot 0.00116166\\right)^2}",
                "substitution_latex": "28770.2 \\cdot \\sqrt{1 + \\left((1.534 - 1) \\cdot 0.00116166\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 28770.1799213,
                  "m_factor": 0.0159397504275,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 28998.5681504
                },
                "substitution": "28770.2 \\cdot \\sqrt{0.0159398 + 1}",
                "substitution_latex": "28770.2 \\cdot \\sqrt{0.0159398 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 28770.1799213,
                  "un_v": 400.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 19.9325653466
                },
                "substitution": "\\sqrt{3} \\cdot 400 \\cdot 28770.2 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 400 \\cdot 28770.2 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ik_contribution_ka": 1.732,
            "is_synchronous_machine": false,
            "machine_type": "IBG",
            "model": "IEC 60909 \u00a76.7 \u2014 \u017ar\u00f3d\u0142o pr\u0105dowe ograniczone (k\u00b7I_rated), sprowadzone przez przek\u0142adni\u0119"
          },
          "un_kv": 0.4,
          "verification": {
            "icw_ka": 50.0,
            "ikss_max_ka": 33.039,
            "passed": true,
            "rule": "ikss_max_le_icw"
          }
        },
        "SN_PCC": {
          "bus_ref": "SN_PCC",
          "icw_ka": 16.0,
          "idyn_ka": 40.0,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 9.515,
            "ikss_ka": 9.515,
            "ip_ka": 22.323,
            "ith_ka": 9.628,
            "kappa": 1.659,
            "rx_ratio": 0.1426,
            "sk_mva": 247.21,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr",
                  "c_max": 1.05,
                  "s_rt_mva": 1.25,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.4,
                  "x_t_ohm_hv": 10.54282025,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/tr]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr"
              },
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
                  "ikss_a": 9514.97407741
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
                  "ikss_a": 9514.97407741,
                  "kappa": 1.658955589
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 22323.2471317
                },
                "substitution": "1.65896 \\cdot \\sqrt{2} \\cdot 9514.97",
                "substitution_latex": "1.65896 \\cdot \\sqrt{2} \\cdot 9514.97",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.0113442026223,
                  "ikss_a": 9514.97407741,
                  "kappa": 1.658955589,
                  "ta_s": 0.0223261706515,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 9515.23992443
                },
                "substitution": "9514.97 \\cdot \\sqrt{1 + \\left((1.65896 - 1) \\cdot 0.0113442\\right)^2}",
                "substitution_latex": "9514.97 \\cdot \\sqrt{1 + \\left((1.65896 - 1) \\cdot 0.0113442\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 9514.97407741,
                  "m_factor": 0.0239751154653,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 9628.35979489
                },
                "substitution": "9514.97 \\cdot \\sqrt{0.0239751 + 1}",
                "substitution_latex": "9514.97 \\cdot \\sqrt{0.0239751 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 9514.97407741,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 247.206278022
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 9514.97 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 9514.97 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 8.224,
            "ith_ka": 8.322,
            "kappa": 1.659,
            "sk_mva": 213.66,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr",
                  "c_max": 1.05,
                  "s_rt_mva": 1.25,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.4,
                  "x_t_ohm_hv": 10.54282025,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/tr]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr"
              },
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
                  "ikss_a": 8223.77597888
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
                  "ikss_a": 8223.77597888,
                  "kappa": 1.658955589
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 19293.9446854
                },
                "substitution": "1.65896 \\cdot \\sqrt{2} \\cdot 8223.78",
                "substitution_latex": "1.65896 \\cdot \\sqrt{2} \\cdot 8223.78",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.0113442026223,
                  "ikss_a": 8223.77597888,
                  "kappa": 1.658955589,
                  "ta_s": 0.0223261706515,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 8224.00575001
                },
                "substitution": "8223.78 \\cdot \\sqrt{1 + \\left((1.65896 - 1) \\cdot 0.0113442\\right)^2}",
                "substitution_latex": "8223.78 \\cdot \\sqrt{1 + \\left((1.65896 - 1) \\cdot 0.0113442\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 8223.77597888,
                  "m_factor": 0.0239751154653,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 8321.77506245
                },
                "substitution": "8223.78 \\cdot \\sqrt{0.0239751 + 1}",
                "substitution_latex": "8223.78 \\cdot \\sqrt{0.0239751 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 8223.77597888,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 213.659967382
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 8223.78 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 8223.78 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ik_contribution_ka": 0.046,
            "is_synchronous_machine": false,
            "machine_type": "IBG",
            "model": "IEC 60909 \u00a76.7 \u2014 \u017ar\u00f3d\u0142o pr\u0105dowe ograniczone (k\u00b7I_rated), sprowadzone przez przek\u0142adni\u0119"
          },
          "un_kv": 15.0,
          "verification": {
            "icw_ka": 16.0,
            "ikss_max_ka": 9.515,
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
      "metering": {
        "ct": {
          "cores": 2,
          "ipn_a": 40.0,
          "isn_a": 5.0
        },
        "source_ref": "norma:IEC_61869-2_CT;norma:IEC_61869-3_VT",
        "vt": {
          "fv": 1.9,
          "usn_v": 100.0
        }
      },
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
      "technology": "BESS (magazyn energii)"
    },
    "voltage_flow": {
      "branches": {
        "sr/branch/in": {
          "branch_ref": "sr/branch/in",
          "direction": "reverse",
          "i_a": 36.15,
          "loading_percent": 5.74,
          "p_mw": -0.9241,
          "q_mvar": 0.1675,
          "s_mva": 0.9392
        },
        "sr/branch/pcs1": {
          "branch_ref": "sr/branch/pcs1",
          "direction": "reverse",
          "i_a": 684.04,
          "loading_percent": 108.58,
          "p_mw": -0.4719,
          "q_mvar": 0.0561,
          "s_mva": 0.4752
        },
        "sr/branch/pcs2": {
          "branch_ref": "sr/branch/pcs2",
          "direction": "reverse",
          "i_a": 684.04,
          "loading_percent": 108.58,
          "p_mw": -0.4719,
          "q_mvar": 0.0561,
          "s_mva": 0.4752
        },
        "sr/branch/tr": {
          "branch_ref": "sr/branch/tr",
          "direction": "reverse",
          "i_a": 36.15,
          "loading_percent": null,
          "p_mw": -0.9247,
          "q_mvar": 0.1636,
          "s_mva": 0.9391
        }
      },
      "buses": {
        "NN": {
          "bus_ref": "NN",
          "deviation_percent": 0.282,
          "u_kv": 0.4011,
          "u_pu": 1.00282,
          "un_kv": 0.4
        },
        "SN_PCC": {
          "bus_ref": "SN_PCC",
          "deviation_percent": -0.015,
          "u_kv": 14.9978,
          "u_pu": 0.99985,
          "un_kv": 15.0
        }
      }
    }
  },
  "G5-WIND-T4": {
    "archetype": "G5-WIND-T4",
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
    "enm_hash": "oze-substrate/G5-WIND-T4",
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
          "idyn_ka": 62.5,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 9.746,
            "ikss_ka": 9.746,
            "ip_ka": 22.865,
            "ith_ka": 9.862,
            "kappa": 1.659,
            "rx_ratio": 0.1426,
            "sk_mva": 253.21,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/wtg-tr1",
                  "c_max": 1.05,
                  "s_rt_mva": 2.5,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 5.27141012499,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/wtg-tr1]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/wtg-tr1"
              },
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/wtg-tr2",
                  "c_max": 1.05,
                  "s_rt_mva": 2.5,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 5.27141012499,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/wtg-tr2]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/wtg-tr2"
              },
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/wtg-tr3",
                  "c_max": 1.05,
                  "s_rt_mva": 2.5,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 5.27141012499,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/wtg-tr3]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/wtg-tr3"
              },
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
                  "ikss_a": 9745.91418509
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
                  "ikss_a": 9745.91418509,
                  "kappa": 1.658955589
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 22865.0597582
                },
                "substitution": "1.65896 \\cdot \\sqrt{2} \\cdot 9745.91",
                "substitution_latex": "1.65896 \\cdot \\sqrt{2} \\cdot 9745.91",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.0113442026223,
                  "ikss_a": 9745.91418509,
                  "kappa": 1.658955589,
                  "ta_s": 0.0223261706515,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 9746.18648454
                },
                "substitution": "9745.91 \\cdot \\sqrt{1 + \\left((1.65896 - 1) \\cdot 0.0113442\\right)^2}",
                "substitution_latex": "9745.91 \\cdot \\sqrt{1 + \\left((1.65896 - 1) \\cdot 0.0113442\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 9745.91418509,
                  "m_factor": 0.0239751154653,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 9862.05191319
                },
                "substitution": "9745.91 \\cdot \\sqrt{0.0239751 + 1}",
                "substitution_latex": "9745.91 \\cdot \\sqrt{0.0239751 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 9745.91418509,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 253.206278022
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 9745.91 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 9745.91 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 8.455,
            "ith_ka": 8.555,
            "kappa": 1.659,
            "sk_mva": 219.66,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/wtg-tr1",
                  "c_max": 1.05,
                  "s_rt_mva": 2.5,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 5.27141012499,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/wtg-tr1]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/wtg-tr1"
              },
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/wtg-tr2",
                  "c_max": 1.05,
                  "s_rt_mva": 2.5,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 5.27141012499,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/wtg-tr2]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/wtg-tr2"
              },
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/wtg-tr3",
                  "c_max": 1.05,
                  "s_rt_mva": 2.5,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 5.27141012499,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/wtg-tr3]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/wtg-tr3"
              },
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
                  "ikss_a": 8454.71608656
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
                  "ikss_a": 8454.71608656,
                  "kappa": 1.658955589
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 19835.7573119
                },
                "substitution": "1.65896 \\cdot \\sqrt{2} \\cdot 8454.72",
                "substitution_latex": "1.65896 \\cdot \\sqrt{2} \\cdot 8454.72",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.0113442026223,
                  "ikss_a": 8454.71608656,
                  "kappa": 1.658955589,
                  "ta_s": 0.0223261706515,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 8454.95231012
                },
                "substitution": "8454.72 \\cdot \\sqrt{1 + \\left((1.65896 - 1) \\cdot 0.0113442\\right)^2}",
                "substitution_latex": "8454.72 \\cdot \\sqrt{1 + \\left((1.65896 - 1) \\cdot 0.0113442\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 8454.71608656,
                  "m_factor": 0.0239751154653,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 8555.46718075
                },
                "substitution": "8454.72 \\cdot \\sqrt{0.0239751 + 1}",
                "substitution_latex": "8454.72 \\cdot \\sqrt{0.0239751 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 8454.71608656,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 219.659967382
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 8454.72 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 8454.72 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ik_contribution_ka": 0.277,
            "is_synchronous_machine": false,
            "machine_type": "IBG",
            "model": "IEC 60909 \u00a76.7 \u2014 \u017ar\u00f3d\u0142o pr\u0105dowe ograniczone (k\u00b7I_rated), sprowadzone przez przek\u0142adni\u0119"
          },
          "un_kv": 15.0,
          "verification": {
            "icw_ka": 25.0,
            "ikss_max_ka": 9.746,
            "passed": true,
            "rule": "ikss_max_le_icw"
          }
        },
        "WTG_LV_1": {
          "bus_ref": "WTG_LV_1",
          "icw_ka": 50.0,
          "idyn_ka": 105.0,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 39.388,
            "ikss_ka": 39.388,
            "ip_ka": 85.963,
            "ith_ka": 39.709,
            "kappa": 1.543,
            "rx_ratio": 0.2092,
            "sk_mva": 47.07,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/wtg-tr1",
                  "c_max": 1.05,
                  "s_rt_mva": 2.5,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 5.27141012499,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/wtg-tr1]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/wtg-tr1"
              },
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/wtg-tr2",
                  "c_max": 1.05,
                  "s_rt_mva": 2.5,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 5.27141012499,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/wtg-tr2]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/wtg-tr2"
              },
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/wtg-tr3",
                  "c_max": 1.05,
                  "s_rt_mva": 2.5,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 5.27141012499,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/wtg-tr3]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/wtg-tr3"
              },
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "WTG_LV_1",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.012856216059,
                    "re": 0.00268907232966
                  },
                  "z2_ohm": {
                    "im": 0.012856216059,
                    "re": 0.00268907232966
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.00268907232966,
                  "x_ohm": 0.012856216059,
                  "z_equiv_abs_ohm": 0.0131344357073,
                  "z_equiv_ohm": {
                    "im": 0.012856216059,
                    "re": 0.00268907232966
                  }
                },
                "substitution": "\\left(0.00268907 + j 0.0128562\\right)",
                "substitution_latex": "\\left(0.00268907 + j 0.0128562\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 1.1,
                  "un_v": 690.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.0131344357073
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 36022.5065448
                },
                "substitution": "\\frac{1.1 \\cdot 690 \\cdot 0.57735}{0.0131344}",
                "substitution_latex": "\\frac{1.1 \\cdot 690 \\cdot 0.57735}{0.0131344}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.00268907232966,
                  "rx_ratio": 0.209165147608,
                  "x_ohm": 0.012856216059
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.54324883185
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.209165}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.209165}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 36022.5065448,
                  "kappa": 1.54324883185
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 78618.5235734
                },
                "substitution": "1.54325 \\cdot \\sqrt{2} \\cdot 36022.5",
                "substitution_latex": "1.54325 \\cdot \\sqrt{2} \\cdot 36022.5",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.00140023260304,
                  "ikss_a": 36022.5065448,
                  "kappa": 1.54324883185,
                  "ta_s": 0.0152181130472,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 36022.5169665
                },
                "substitution": "36022.5 \\cdot \\sqrt{1 + \\left((1.54325 - 1) \\cdot 0.00140023\\right)^2}",
                "substitution_latex": "36022.5 \\cdot \\sqrt{1 + \\left((1.54325 - 1) \\cdot 0.00140023\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 36022.5065448,
                  "m_factor": 0.0163883968735,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 36316.4825574
                },
                "substitution": "36022.5 \\cdot \\sqrt{0.0163884 + 1}",
                "substitution_latex": "36022.5 \\cdot \\sqrt{0.0163884 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 36022.5065448,
                  "un_v": 690.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 43.0510399705
                },
                "substitution": "\\sqrt{3} \\cdot 690 \\cdot 36022.5 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 690 \\cdot 36022.5 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 34.838,
            "ith_ka": 35.123,
            "kappa": 1.543,
            "sk_mva": 41.64,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/wtg-tr1",
                  "c_max": 1.05,
                  "s_rt_mva": 2.5,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 5.27141012499,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/wtg-tr1]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/wtg-tr1"
              },
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/wtg-tr2",
                  "c_max": 1.05,
                  "s_rt_mva": 2.5,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 5.27141012499,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/wtg-tr2]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/wtg-tr2"
              },
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/wtg-tr3",
                  "c_max": 1.05,
                  "s_rt_mva": 2.5,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 5.27141012499,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/wtg-tr3]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/wtg-tr3"
              },
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "WTG_LV_1",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.012856216059,
                    "re": 0.00268907232966
                  },
                  "z2_ohm": {
                    "im": 0.012856216059,
                    "re": 0.00268907232966
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.00268907232966,
                  "x_ohm": 0.012856216059,
                  "z_equiv_abs_ohm": 0.0131344357073,
                  "z_equiv_ohm": {
                    "im": 0.012856216059,
                    "re": 0.00268907232966
                  }
                },
                "substitution": "\\left(0.00268907 + j 0.0128562\\right)",
                "substitution_latex": "\\left(0.00268907 + j 0.0128562\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 0.95,
                  "un_v": 690.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.0131344357073
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 31472.9579998
                },
                "substitution": "\\frac{0.95 \\cdot 690 \\cdot 0.57735}{0.0131344}",
                "substitution_latex": "\\frac{0.95 \\cdot 690 \\cdot 0.57735}{0.0131344}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.00268907232966,
                  "rx_ratio": 0.209165147608,
                  "x_ohm": 0.012856216059
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.54324883185
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.209165}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.209165}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 31472.9579998,
                  "kappa": 1.54324883185
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 68689.2092685
                },
                "substitution": "1.54325 \\cdot \\sqrt{2} \\cdot 31473",
                "substitution_latex": "1.54325 \\cdot \\sqrt{2} \\cdot 31473",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.00140023260304,
                  "ikss_a": 31472.9579998,
                  "kappa": 1.54324883185,
                  "ta_s": 0.0152181130472,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 31472.9671053
                },
                "substitution": "31473 \\cdot \\sqrt{1 + \\left((1.54325 - 1) \\cdot 0.00140023\\right)^2}",
                "substitution_latex": "31473 \\cdot \\sqrt{1 + \\left((1.54325 - 1) \\cdot 0.00140023\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 31472.9579998,
                  "m_factor": 0.0163883968735,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 31729.8056094
                },
                "substitution": "31473 \\cdot \\sqrt{0.0163884 + 1}",
                "substitution_latex": "31473 \\cdot \\sqrt{0.0163884 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 31472.9579998,
                  "un_v": 690.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 37.6138060009
                },
                "substitution": "\\sqrt{3} \\cdot 690 \\cdot 31473 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 690 \\cdot 31473 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ik_contribution_ka": 6.025,
            "is_synchronous_machine": false,
            "machine_type": "IBG",
            "model": "IEC 60909 \u00a76.7 \u2014 \u017ar\u00f3d\u0142o pr\u0105dowe ograniczone (k\u00b7I_rated), sprowadzone przez przek\u0142adni\u0119"
          },
          "un_kv": 0.69,
          "verification": {
            "icw_ka": 50.0,
            "ikss_max_ka": 39.388,
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
      "metering": {
        "ct": {
          "cores": 2,
          "ipn_a": 250.0,
          "isn_a": 5.0
        },
        "source_ref": "norma:IEC_61869-2_CT;norma:IEC_61869-3_VT",
        "vt": {
          "fv": 1.9,
          "usn_v": 100.0
        }
      },
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
      "technology": "Wiatr \u2014 turbiny pe\u0142noprzekszta\u0142tnikowe (Typ 4)"
    },
    "voltage_flow": {
      "branches": {
        "sr/branch/in": {
          "branch_ref": "sr/branch/in",
          "direction": "reverse",
          "i_a": 228.34,
          "loading_percent": 36.24,
          "p_mw": -5.9167,
          "q_mvar": 0.4306,
          "s_mva": 5.9323
        },
        "sr/branch/wtg-tr1": {
          "branch_ref": "sr/branch/wtg-tr1",
          "direction": "reverse",
          "i_a": 76.11,
          "loading_percent": null,
          "p_mw": -1.9796,
          "q_mvar": 0.0916,
          "s_mva": 1.9817
        },
        "sr/branch/wtg-tr2": {
          "branch_ref": "sr/branch/wtg-tr2",
          "direction": "reverse",
          "i_a": 76.11,
          "loading_percent": null,
          "p_mw": -1.9796,
          "q_mvar": 0.0916,
          "s_mva": 1.9817
        },
        "sr/branch/wtg-tr3": {
          "branch_ref": "sr/branch/wtg-tr3",
          "direction": "reverse",
          "i_a": 76.11,
          "loading_percent": null,
          "p_mw": -1.9796,
          "q_mvar": 0.0916,
          "s_mva": 1.9817
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
          "deviation_percent": 1.14,
          "u_kv": 0.6979,
          "u_pu": 1.0114,
          "un_kv": 0.69
        }
      }
    }
  },
  "G6-WIND-DFIG": {
    "archetype": "G6-WIND-DFIG",
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
    "enm_hash": "oze-substrate/G6-WIND-DFIG",
    "fields": [
      {
        "abb_cell": "CBC",
        "apparatus": [
          {
            "catalog": null,
            "designation": "Q1 (od\u0142\u0105cznik szynowy)",
            "device_ref": "g6-line/ds",
            "kind": "DS",
            "placement": "UPSTREAM",
            "source_ref": "enm:BayPrimaryDevice.kind=DS"
          },
          {
            "catalog": null,
            "designation": "Q0 (wy\u0142\u0105cznik SN)",
            "device_ref": "g6-line/cb",
            "kind": "CB",
            "placement": "MIDSTREAM",
            "source_ref": "enm:BayPrimaryDevice.kind=CB"
          },
          {
            "catalog": null,
            "designation": "przek\u0142adnik pr\u0105dowy",
            "device_ref": "g6-line/ct",
            "kind": "CT",
            "placement": "MIDSTREAM",
            "source_ref": "std:IEC_61869_CT"
          },
          {
            "catalog": null,
            "designation": "przek\u0142adnik napi\u0119ciowy",
            "device_ref": "g6-line/vt",
            "kind": "VT",
            "placement": "OFF_PATH",
            "source_ref": "std:IEC_61869_VT"
          },
          {
            "catalog": null,
            "designation": "ogranicznik przepi\u0119\u0107",
            "device_ref": "g6-line/sa",
            "kind": "SURGE_ARRESTER",
            "placement": "OFF_PATH",
            "source_ref": "enm:BayPrimaryDevice.kind=SURGE_ARRESTER"
          },
          {
            "catalog": null,
            "designation": "g\u0142owica kablowa",
            "device_ref": "g6-line/head",
            "kind": "CABLE_HEAD",
            "placement": "DOWNSTREAM",
            "source_ref": "enm:BayPrimaryDevice.kind=CABLE_HEAD"
          },
          {
            "catalog": null,
            "designation": "uziemnik",
            "device_ref": "g6-line/es",
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
          "port_id": "g6-line/port",
          "source_ref": "enm:Port.kind=sn_input;std:przylacze_SN"
        },
        "protection_codes": [
          "67",
          "67N",
          "27",
          "59",
          "81U",
          "81O",
          "df/dt",
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
        "field_id": "g6-wtg2",
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
        "field_id": "g6-wtg3",
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
          "icw_ka": 25.0,
          "idyn_ka": 62.5,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 10.782,
            "ikss_ka": 10.782,
            "ip_ka": 24.541,
            "ith_ka": 10.89,
            "kappa": 1.61,
            "rx_ratio": 0.1694,
            "sk_mva": 280.11,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/wtg-tr1",
                  "c_max": 1.05,
                  "s_rt_mva": 2.5,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 5.27141012499,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/wtg-tr1]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/wtg-tr1"
              },
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/wtg-tr2",
                  "c_max": 1.05,
                  "s_rt_mva": 2.5,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 5.27141012499,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/wtg-tr2]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/wtg-tr2"
              },
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/wtg-tr3",
                  "c_max": 1.05,
                  "s_rt_mva": 2.5,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 5.27141012499,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/wtg-tr3]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/wtg-tr3"
              },
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "SN_PCC",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.871160753522,
                    "re": 0.147594190762
                  },
                  "z2_ohm": {
                    "im": 0.871160753522,
                    "re": 0.147594190762
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.147594190762,
                  "x_ohm": 0.871160753522,
                  "z_equiv_abs_ohm": 0.883575182779,
                  "z_equiv_ohm": {
                    "im": 0.871160753522,
                    "re": 0.147594190762
                  }
                },
                "substitution": "\\left(0.147594 + j 0.871161\\right)",
                "substitution_latex": "\\left(0.147594 + j 0.871161\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 1.1,
                  "un_v": 15000.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.883575182779
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 10781.5154016
                },
                "substitution": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{0.883575}",
                "substitution_latex": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{0.883575}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.147594190762,
                  "rx_ratio": 0.169422451787,
                  "x_ohm": 0.871160753522
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.60950618762
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.169422}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.169422}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 10781.5154016,
                  "kappa": 1.60950618762
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 24540.7288015
                },
                "substitution": "1.60951 \\cdot \\sqrt{2} \\cdot 10781.5",
                "substitution_latex": "1.60951 \\cdot \\sqrt{2} \\cdot 10781.5",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.00488022819533,
                  "ikss_a": 10781.5154016,
                  "kappa": 1.60950618762,
                  "ta_s": 0.0187879400178,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 10781.563098
                },
                "substitution": "10781.5 \\cdot \\sqrt{1 + \\left((1.60951 - 1) \\cdot 0.00488023\\right)^2}",
                "substitution_latex": "10781.5 \\cdot \\sqrt{1 + \\left((1.60951 - 1) \\cdot 0.00488023\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 10781.5154016,
                  "m_factor": 0.0201976877712,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 10889.8519403
                },
                "substitution": "10781.5 \\cdot \\sqrt{0.0201977 + 1}",
                "substitution_latex": "10781.5 \\cdot \\sqrt{0.0201977 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 10781.5154016,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 280.111986873
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 10781.5 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 10781.5 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 9.311,
            "ith_ka": 9.405,
            "kappa": 1.61,
            "sk_mva": 241.91,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/wtg-tr1",
                  "c_max": 1.05,
                  "s_rt_mva": 2.5,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 5.27141012499,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/wtg-tr1]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/wtg-tr1"
              },
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/wtg-tr2",
                  "c_max": 1.05,
                  "s_rt_mva": 2.5,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 5.27141012499,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/wtg-tr2]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/wtg-tr2"
              },
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/wtg-tr3",
                  "c_max": 1.05,
                  "s_rt_mva": 2.5,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 5.27141012499,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/wtg-tr3]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/wtg-tr3"
              },
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "SN_PCC",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.871160753522,
                    "re": 0.147594190762
                  },
                  "z2_ohm": {
                    "im": 0.871160753522,
                    "re": 0.147594190762
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.147594190762,
                  "x_ohm": 0.871160753522,
                  "z_equiv_abs_ohm": 0.883575182779,
                  "z_equiv_ohm": {
                    "im": 0.871160753522,
                    "re": 0.147594190762
                  }
                },
                "substitution": "\\left(0.147594 + j 0.871161\\right)",
                "substitution_latex": "\\left(0.147594 + j 0.871161\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 0.95,
                  "un_v": 15000.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.883575182779
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 9311.30875595
                },
                "substitution": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{0.883575}",
                "substitution_latex": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{0.883575}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.147594190762,
                  "rx_ratio": 0.169422451787,
                  "x_ohm": 0.871160753522
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.60950618762
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.169422}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.169422}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 9311.30875595,
                  "kappa": 1.60950618762
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 21194.2657831
                },
                "substitution": "1.60951 \\cdot \\sqrt{2} \\cdot 9311.31",
                "substitution_latex": "1.60951 \\cdot \\sqrt{2} \\cdot 9311.31",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.00488022819533,
                  "ikss_a": 9311.30875595,
                  "kappa": 1.60950618762,
                  "ta_s": 0.0187879400178,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 9311.34994827
                },
                "substitution": "9311.31 \\cdot \\sqrt{1 + \\left((1.60951 - 1) \\cdot 0.00488023\\right)^2}",
                "substitution_latex": "9311.31 \\cdot \\sqrt{1 + \\left((1.60951 - 1) \\cdot 0.00488023\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 9311.30875595,
                  "m_factor": 0.0201976877712,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 9404.87213025
                },
                "substitution": "9311.31 \\cdot \\sqrt{0.0201977 + 1}",
                "substitution_latex": "9311.31 \\cdot \\sqrt{0.0201977 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 9311.30875595,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 241.914897754
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 9311.31 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 9311.31 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ib_contribution_ka": 0.763,
            "ik_contribution_ka": 1.339,
            "is_synchronous_machine": false,
            "machine_type": "DFIG",
            "machines": [
              {
                "ib_partial_ka": 0.254,
                "ikss_partial_ka": 0.446,
                "ir_a": 1936.9,
                "mu": 1.0,
                "node_ref": "WTG_LV_1",
                "q": 0.57,
                "source_id": "async/WTG_LV_1/1"
              },
              {
                "ib_partial_ka": 0.254,
                "ikss_partial_ka": 0.446,
                "ir_a": 1936.9,
                "mu": 1.0,
                "node_ref": "WTG_LV_2",
                "q": 0.57,
                "source_id": "async/WTG_LV_2/1"
              },
              {
                "ib_partial_ka": 0.254,
                "ikss_partial_ka": 0.446,
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
            "icw_ka": 25.0,
            "ikss_max_ka": 10.782,
            "passed": true,
            "rule": "ikss_max_le_icw"
          }
        },
        "WTG_LV_1": {
          "bus_ref": "WTG_LV_1",
          "icw_ka": 63.0,
          "idyn_ka": 132.3,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 46.441,
            "ikss_ka": 46.441,
            "ip_ka": 95.852,
            "ith_ka": 46.738,
            "kappa": 1.459,
            "rx_ratio": 0.2673,
            "sk_mva": 55.5,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/wtg-tr1",
                  "c_max": 1.05,
                  "s_rt_mva": 2.5,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 5.27141012499,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/wtg-tr1]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/wtg-tr1"
              },
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/wtg-tr2",
                  "c_max": 1.05,
                  "s_rt_mva": 2.5,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 5.27141012499,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/wtg-tr2]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/wtg-tr2"
              },
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/wtg-tr3",
                  "c_max": 1.05,
                  "s_rt_mva": 2.5,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 5.27141012499,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/wtg-tr3]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/wtg-tr3"
              },
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "WTG_LV_1",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.00911573983331,
                    "re": 0.00243708420263
                  },
                  "z2_ohm": {
                    "im": 0.00911573983331,
                    "re": 0.00243708420263
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.00243708420263,
                  "x_ohm": 0.00911573983331,
                  "z_equiv_abs_ohm": 0.00943589381666,
                  "z_equiv_ohm": {
                    "im": 0.00911573983331,
                    "re": 0.00243708420263
                  }
                },
                "substitution": "\\left(0.00243708 + j 0.00911574\\right)",
                "substitution_latex": "\\left(0.00243708 + j 0.00911574\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 1.1,
                  "un_v": 690.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.00943589381666
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 46440.6300907
                },
                "substitution": "\\frac{1.1 \\cdot 690 \\cdot 0.57735}{0.00943589}",
                "substitution_latex": "\\frac{1.1 \\cdot 690 \\cdot 0.57735}{0.00943589}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.00243708420263,
                  "rx_ratio": 0.26734903005,
                  "x_ohm": 0.00911573983331
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.45944188629
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.267349}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.267349}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 46440.6300907,
                  "kappa": 1.45944188629
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 95851.7194057
                },
                "substitution": "1.45944 \\cdot \\sqrt{2} \\cdot 46440.6",
                "substitution_latex": "1.45944 \\cdot \\sqrt{2} \\cdot 46440.6",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.000225088367708,
                  "ikss_a": 46440.6300907,
                  "kappa": 1.45944188629,
                  "ta_s": 0.0119061545173,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 46440.630339
                },
                "substitution": "46440.6 \\cdot \\sqrt{1 + \\left((1.45944 - 1) \\cdot 0.000225088\\right)^2}",
                "substitution_latex": "46440.6 \\cdot \\sqrt{1 + \\left((1.45944 - 1) \\cdot 0.000225088\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 46440.6300907,
                  "m_factor": 0.0128577208094,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 46738.236838
                },
                "substitution": "46440.6 \\cdot \\sqrt{0.0128577 + 1}",
                "substitution_latex": "46440.6 \\cdot \\sqrt{0.0128577 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 46440.6300907,
                  "un_v": 690.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 55.5018962883
                },
                "substitution": "\\sqrt{3} \\cdot 690 \\cdot 46440.6 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 690 \\cdot 46440.6 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 40.108,
            "ith_ka": 40.365,
            "kappa": 1.459,
            "sk_mva": 47.93,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/wtg-tr1",
                  "c_max": 1.05,
                  "s_rt_mva": 2.5,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 5.27141012499,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/wtg-tr1]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/wtg-tr1"
              },
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/wtg-tr2",
                  "c_max": 1.05,
                  "s_rt_mva": 2.5,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 5.27141012499,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/wtg-tr2]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/wtg-tr2"
              },
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/wtg-tr3",
                  "c_max": 1.05,
                  "s_rt_mva": 2.5,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 5.27141012499,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/wtg-tr3]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/wtg-tr3"
              },
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "WTG_LV_1",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.00911573983331,
                    "re": 0.00243708420263
                  },
                  "z2_ohm": {
                    "im": 0.00911573983331,
                    "re": 0.00243708420263
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.00243708420263,
                  "x_ohm": 0.00911573983331,
                  "z_equiv_abs_ohm": 0.00943589381666,
                  "z_equiv_ohm": {
                    "im": 0.00911573983331,
                    "re": 0.00243708420263
                  }
                },
                "substitution": "\\left(0.00243708 + j 0.00911574\\right)",
                "substitution_latex": "\\left(0.00243708 + j 0.00911574\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 0.95,
                  "un_v": 690.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.00943589381666
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 40107.8168965
                },
                "substitution": "\\frac{0.95 \\cdot 690 \\cdot 0.57735}{0.00943589}",
                "substitution_latex": "\\frac{0.95 \\cdot 690 \\cdot 0.57735}{0.00943589}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.00243708420263,
                  "rx_ratio": 0.26734903005,
                  "x_ohm": 0.00911573983331
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.45944188629
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.267349}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.267349}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 40107.8168965,
                  "kappa": 1.45944188629
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 82781.0303958
                },
                "substitution": "1.45944 \\cdot \\sqrt{2} \\cdot 40107.8",
                "substitution_latex": "1.45944 \\cdot \\sqrt{2} \\cdot 40107.8",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.000225088367708,
                  "ikss_a": 40107.8168965,
                  "kappa": 1.45944188629,
                  "ta_s": 0.0119061545173,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 40107.817111
                },
                "substitution": "40107.8 \\cdot \\sqrt{1 + \\left((1.45944 - 1) \\cdot 0.000225088\\right)^2}",
                "substitution_latex": "40107.8 \\cdot \\sqrt{1 + \\left((1.45944 - 1) \\cdot 0.000225088\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 40107.8168965,
                  "m_factor": 0.0128577208094,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 40364.8409055
                },
                "substitution": "40107.8 \\cdot \\sqrt{0.0128577 + 1}",
                "substitution_latex": "40107.8 \\cdot \\sqrt{0.0128577 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 40107.8168965,
                  "un_v": 690.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 47.9334558854
                },
                "substitution": "\\sqrt{3} \\cdot 690 \\cdot 40107.8 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 690 \\cdot 40107.8 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ib_contribution_ka": 6.816,
            "ik_contribution_ka": 15.703,
            "is_synchronous_machine": false,
            "machine_type": "DFIG",
            "machines": [
              {
                "ib_partial_ka": 5.152,
                "ikss_partial_ka": 12.784,
                "ir_a": 1936.9,
                "mu": 0.7071,
                "node_ref": "WTG_LV_1",
                "q": 0.57,
                "source_id": "async/WTG_LV_1/1"
              },
              {
                "ib_partial_ka": 0.832,
                "ikss_partial_ka": 1.46,
                "ir_a": 1936.9,
                "mu": 1.0,
                "node_ref": "WTG_LV_2",
                "q": 0.57,
                "source_id": "async/WTG_LV_2/1"
              },
              {
                "ib_partial_ka": 0.832,
                "ikss_partial_ka": 1.46,
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
            "ikss_max_ka": 46.441,
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
      "grid_earthing": {
        "ik_1f_ka": 0.06,
        "imd_it_nn": false,
        "neutral_point": "kompensowana",
        "note_pl": "SN kolektor 15 kV: I\u2033k1f-z z uziemienia neutralnego OSD (kompensowana), pr\u0105d resztkowy \u221d Un; zacisk DFIG za trafem Dyn \u2014 uziemienie lokalne",
        "source_ref": "norma:PN-EN_60909_doziemienie;OSD:punkt_neutralny_SN"
      },
      "machine_type": "DFIG",
      "metering": {
        "ct": {
          "cores": 2,
          "ipn_a": 250.0,
          "isn_a": 5.0
        },
        "source_ref": "norma:IEC_61869-2_CT;norma:IEC_61869-3_VT",
        "vt": {
          "fv": 1.9,
          "usn_v": 100.0
        }
      },
      "nc_rfg_class": "C",
      "power_hierarchy": {
        "p_osiagalna_kw": 5800.0,
        "p_przylacz_kw": 6000.0,
        "p_zainst_kw": 6000.0,
        "pn_ac_kw": 6000.0,
        "valid": true
      },
      "protection": {
        "converter": [
          "RSC",
          "DC-chopper",
          "64R"
        ],
        "machine": [
          "46",
          "47",
          "49",
          "51"
        ],
        "source_ref": "norma:NC_RfG;norma:IEC_60255;std:DFIG_converter"
      },
      "protection_codes": [
        "67",
        "67N",
        "27",
        "59",
        "81U",
        "81O",
        "df/dt",
        "anti-islanding"
      ],
      "technology": "Wiatr \u2014 generatory dwustronnie zasilane (Typ 3, DFIG)"
    },
    "voltage_flow": {
      "branches": {
        "sr/branch/in": {
          "branch_ref": "sr/branch/in",
          "direction": "reverse",
          "i_a": 228.34,
          "loading_percent": 36.24,
          "p_mw": -5.9167,
          "q_mvar": 0.4306,
          "s_mva": 5.9323
        },
        "sr/branch/wtg-tr1": {
          "branch_ref": "sr/branch/wtg-tr1",
          "direction": "reverse",
          "i_a": 76.11,
          "loading_percent": null,
          "p_mw": -1.9796,
          "q_mvar": 0.0916,
          "s_mva": 1.9817
        },
        "sr/branch/wtg-tr2": {
          "branch_ref": "sr/branch/wtg-tr2",
          "direction": "reverse",
          "i_a": 76.11,
          "loading_percent": null,
          "p_mw": -1.9796,
          "q_mvar": 0.0916,
          "s_mva": 1.9817
        },
        "sr/branch/wtg-tr3": {
          "branch_ref": "sr/branch/wtg-tr3",
          "direction": "reverse",
          "i_a": 76.11,
          "loading_percent": null,
          "p_mw": -1.9796,
          "q_mvar": 0.0916,
          "s_mva": 1.9817
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
          "deviation_percent": 1.14,
          "u_kv": 0.6979,
          "u_pu": 1.0114,
          "un_kv": 0.69
        }
      }
    }
  },
  "G7-WIND-ASYNC": {
    "archetype": "G7-WIND-ASYNC",
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
    "enm_hash": "oze-substrate/G7-WIND-ASYNC",
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
          "67",
          "67N",
          "27",
          "59",
          "81U",
          "81O",
          "df/dt",
          "anti-islanding"
        ],
        "role": "connection",
        "source_ref": "enm:Bay.bay_role=LINIA_OUT;std:IEC_62271_pole_liniowe"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g7-wtg1",
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
        "field_id": "g7-wtg2",
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
        "field_id": "g7-wtg3",
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
          "idyn_ka": 62.5,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 10.046,
            "ikss_ka": 10.046,
            "ip_ka": 23.238,
            "ith_ka": 10.157,
            "kappa": 1.636,
            "rx_ratio": 0.155,
            "sk_mva": 261.01,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/wtg-tr1",
                  "c_max": 1.05,
                  "s_rt_mva": 1.0,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 13.1785253125,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/wtg-tr1]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/wtg-tr1"
              },
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/wtg-tr2",
                  "c_max": 1.05,
                  "s_rt_mva": 1.0,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 13.1785253125,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/wtg-tr2]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/wtg-tr2"
              },
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/wtg-tr3",
                  "c_max": 1.05,
                  "s_rt_mva": 1.0,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 13.1785253125,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/wtg-tr3]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/wtg-tr3"
              },
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "SN_PCC",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.937055053388,
                    "re": 0.145216703467
                  },
                  "z2_ohm": {
                    "im": 0.937055053388,
                    "re": 0.145216703467
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.145216703467,
                  "x_ohm": 0.937055053388,
                  "z_equiv_abs_ohm": 0.9482405096,
                  "z_equiv_ohm": {
                    "im": 0.937055053388,
                    "re": 0.145216703467
                  }
                },
                "substitution": "\\left(0.145217 + j 0.937055\\right)",
                "substitution_latex": "\\left(0.145217 + j 0.937055\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 1.1,
                  "un_v": 15000.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.9482405096
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 10046.2692167
                },
                "substitution": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{0.948241}",
                "substitution_latex": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{0.948241}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.145216703467,
                  "rx_ratio": 0.154971367949,
                  "x_ohm": 0.937055053388
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.63562528066
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.154971}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.154971}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 10046.2692167,
                  "kappa": 1.63562528066
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 23238.2609591
                },
                "substitution": "1.63563 \\cdot \\sqrt{2} \\cdot 10046.3",
                "substitution_latex": "1.63563 \\cdot \\sqrt{2} \\cdot 10046.3",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.00768435288358,
                  "ikss_a": 10046.2692167,
                  "kappa": 1.63562528066,
                  "ta_s": 0.0205399158822,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 10046.3890532
                },
                "substitution": "10046.3 \\cdot \\sqrt{1 + \\left((1.63563 - 1) \\cdot 0.00768435\\right)^2}",
                "substitution_latex": "10046.3 \\cdot \\sqrt{1 + \\left((1.63563 - 1) \\cdot 0.00768435\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 10046.2692167,
                  "m_factor": 0.0220679393424,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 10156.5145438
                },
                "substitution": "10046.3 \\cdot \\sqrt{0.0220679 + 1}",
                "substitution_latex": "10046.3 \\cdot \\sqrt{0.0220679 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 10046.2692167,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 261.009730648
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 10046.3 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 10046.3 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 8.676,
            "ith_ka": 8.772,
            "kappa": 1.636,
            "sk_mva": 225.42,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/wtg-tr1",
                  "c_max": 1.05,
                  "s_rt_mva": 1.0,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 13.1785253125,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/wtg-tr1]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/wtg-tr1"
              },
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/wtg-tr2",
                  "c_max": 1.05,
                  "s_rt_mva": 1.0,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 13.1785253125,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/wtg-tr2]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/wtg-tr2"
              },
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/wtg-tr3",
                  "c_max": 1.05,
                  "s_rt_mva": 1.0,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 13.1785253125,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/wtg-tr3]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/wtg-tr3"
              },
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "SN_PCC",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.937055053388,
                    "re": 0.145216703467
                  },
                  "z2_ohm": {
                    "im": 0.937055053388,
                    "re": 0.145216703467
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.145216703467,
                  "x_ohm": 0.937055053388,
                  "z_equiv_abs_ohm": 0.9482405096,
                  "z_equiv_ohm": {
                    "im": 0.937055053388,
                    "re": 0.145216703467
                  }
                },
                "substitution": "\\left(0.145217 + j 0.937055\\right)",
                "substitution_latex": "\\left(0.145217 + j 0.937055\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 0.95,
                  "un_v": 15000.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.9482405096
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 8676.32341443
                },
                "substitution": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{0.948241}",
                "substitution_latex": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{0.948241}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.145216703467,
                  "rx_ratio": 0.154971367949,
                  "x_ohm": 0.937055053388
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.63562528066
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.154971}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.154971}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 8676.32341443,
                  "kappa": 1.63562528066
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 20069.4071919
                },
                "substitution": "1.63563 \\cdot \\sqrt{2} \\cdot 8676.32",
                "substitution_latex": "1.63563 \\cdot \\sqrt{2} \\cdot 8676.32",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.00768435288358,
                  "ikss_a": 8676.32341443,
                  "kappa": 1.63562528066,
                  "ta_s": 0.0205399158822,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 8676.4269096
                },
                "substitution": "8676.32 \\cdot \\sqrt{1 + \\left((1.63563 - 1) \\cdot 0.00768435\\right)^2}",
                "substitution_latex": "8676.32 \\cdot \\sqrt{1 + \\left((1.63563 - 1) \\cdot 0.00768435\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 8676.32341443,
                  "m_factor": 0.0220679393424,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 8771.53528781
                },
                "substitution": "8676.32 \\cdot \\sqrt{0.0220679 + 1}",
                "substitution_latex": "8676.32 \\cdot \\sqrt{0.0220679 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 8676.32341443,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 225.41749465
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 8676.32 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 8676.32 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ib_contribution_ka": 0.275,
            "ik_contribution_ka": 0.589,
            "is_synchronous_machine": false,
            "machine_type": "ASYNCHRONOUS",
            "machines": [
              {
                "ib_partial_ka": 0.092,
                "ikss_partial_ka": 0.196,
                "ir_a": 880.8,
                "mu": 1.0,
                "node_ref": "WTG_LV_1",
                "q": 0.4673,
                "source_id": "async/WTG_LV_1/1"
              },
              {
                "ib_partial_ka": 0.092,
                "ikss_partial_ka": 0.196,
                "ir_a": 880.8,
                "mu": 1.0,
                "node_ref": "WTG_LV_2",
                "q": 0.4673,
                "source_id": "async/WTG_LV_2/1"
              },
              {
                "ib_partial_ka": 0.092,
                "ikss_partial_ka": 0.196,
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
            "ikss_max_ka": 10.046,
            "passed": true,
            "rule": "ikss_max_le_icw"
          }
        },
        "WTG_LV_1": {
          "bus_ref": "WTG_LV_1",
          "icw_ka": 50.0,
          "idyn_ka": 105.0,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 20.563,
            "ikss_ka": 20.563,
            "ip_ka": 42.264,
            "ith_ka": 20.692,
            "kappa": 1.453,
            "rx_ratio": 0.272,
            "sk_mva": 24.58,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/wtg-tr1",
                  "c_max": 1.05,
                  "s_rt_mva": 1.0,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 13.1785253125,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/wtg-tr1]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/wtg-tr1"
              },
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/wtg-tr2",
                  "c_max": 1.05,
                  "s_rt_mva": 1.0,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 13.1785253125,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/wtg-tr2]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/wtg-tr2"
              },
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/wtg-tr3",
                  "c_max": 1.05,
                  "s_rt_mva": 1.0,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 13.1785253125,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/wtg-tr3]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/wtg-tr3"
              },
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "WTG_LV_1",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.0205634859089,
                    "re": 0.00559337938841
                  },
                  "z2_ohm": {
                    "im": 0.0205634859089,
                    "re": 0.00559337938841
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.00559337938841,
                  "x_ohm": 0.0205634859089,
                  "z_equiv_abs_ohm": 0.0213106275296,
                  "z_equiv_ohm": {
                    "im": 0.0205634859089,
                    "re": 0.00559337938841
                  }
                },
                "substitution": "\\left(0.00559338 + j 0.0205635\\right)",
                "substitution_latex": "\\left(0.00559338 + j 0.0205635\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 1.1,
                  "un_v": 690.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.0213106275296
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 20562.9258785
                },
                "substitution": "\\frac{1.1 \\cdot 690 \\cdot 0.57735}{0.0213106}",
                "substitution_latex": "\\frac{1.1 \\cdot 690 \\cdot 0.57735}{0.0213106}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.00559337938841,
                  "rx_ratio": 0.272005408674,
                  "x_ohm": 0.0205634859089
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.45334593956
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.272005}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.272005}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 20562.9258785,
                  "kappa": 1.45334593956
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 42263.8357119
                },
                "substitution": "1.45335 \\cdot \\sqrt{2} \\cdot 20562.9",
                "substitution_latex": "1.45335 \\cdot \\sqrt{2} \\cdot 20562.9",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.000194456526062,
                  "ikss_a": 20562.9258785,
                  "kappa": 1.45334593956,
                  "ta_s": 0.011702336646,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 20562.9259584
                },
                "substitution": "20562.9 \\cdot \\sqrt{1 + \\left((1.45335 - 1) \\cdot 0.000194457\\right)^2}",
                "substitution_latex": "20562.9 \\cdot \\sqrt{1 + \\left((1.45335 - 1) \\cdot 0.000194457\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 20562.9258785,
                  "m_factor": 0.012640630467,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 20692.4819203
                },
                "substitution": "20562.9 \\cdot \\sqrt{0.0126406 + 1}",
                "substitution_latex": "20562.9 \\cdot \\sqrt{0.0126406 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 20562.9258785,
                  "un_v": 690.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 24.5750623379
                },
                "substitution": "\\sqrt{3} \\cdot 690 \\cdot 20562.9 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 690 \\cdot 20562.9 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 17.759,
            "ith_ka": 17.871,
            "kappa": 1.453,
            "sk_mva": 21.22,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/wtg-tr1",
                  "c_max": 1.05,
                  "s_rt_mva": 1.0,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 13.1785253125,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/wtg-tr1]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/wtg-tr1"
              },
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/wtg-tr2",
                  "c_max": 1.05,
                  "s_rt_mva": 1.0,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 13.1785253125,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/wtg-tr2]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/wtg-tr2"
              },
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/wtg-tr3",
                  "c_max": 1.05,
                  "s_rt_mva": 1.0,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 13.1785253125,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/wtg-tr3]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/wtg-tr3"
              },
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "WTG_LV_1",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.0205634859089,
                    "re": 0.00559337938841
                  },
                  "z2_ohm": {
                    "im": 0.0205634859089,
                    "re": 0.00559337938841
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.00559337938841,
                  "x_ohm": 0.0205634859089,
                  "z_equiv_abs_ohm": 0.0213106275296,
                  "z_equiv_ohm": {
                    "im": 0.0205634859089,
                    "re": 0.00559337938841
                  }
                },
                "substitution": "\\left(0.00559338 + j 0.0205635\\right)",
                "substitution_latex": "\\left(0.00559338 + j 0.0205635\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 0.95,
                  "un_v": 690.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.0213106275296
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 17758.8905314
                },
                "substitution": "\\frac{0.95 \\cdot 690 \\cdot 0.57735}{0.0213106}",
                "substitution_latex": "\\frac{0.95 \\cdot 690 \\cdot 0.57735}{0.0213106}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.00559337938841,
                  "rx_ratio": 0.272005408674,
                  "x_ohm": 0.0205634859089
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.45334593956
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.272005}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.272005}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 17758.8905314,
                  "kappa": 1.45334593956
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 36500.5853876
                },
                "substitution": "1.45335 \\cdot \\sqrt{2} \\cdot 17758.9",
                "substitution_latex": "1.45335 \\cdot \\sqrt{2} \\cdot 17758.9",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.000194456526062,
                  "ikss_a": 17758.8905314,
                  "kappa": 1.45334593956,
                  "ta_s": 0.011702336646,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 17758.8906004
                },
                "substitution": "17758.9 \\cdot \\sqrt{1 + \\left((1.45335 - 1) \\cdot 0.000194457\\right)^2}",
                "substitution_latex": "17758.9 \\cdot \\sqrt{1 + \\left((1.45335 - 1) \\cdot 0.000194457\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 17758.8905314,
                  "m_factor": 0.012640630467,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 17870.7798403
                },
                "substitution": "17758.9 \\cdot \\sqrt{0.0126406 + 1}",
                "substitution_latex": "17758.9 \\cdot \\sqrt{0.0126406 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 17758.8905314,
                  "un_v": 690.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 21.2239174736
                },
                "substitution": "\\sqrt{3} \\cdot 690 \\cdot 17758.9 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 690 \\cdot 17758.9 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ib_contribution_ka": 2.197,
            "ik_contribution_ka": 6.404,
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
                "ib_partial_ka": 0.138,
                "ikss_partial_ka": 0.296,
                "ir_a": 880.8,
                "mu": 1.0,
                "node_ref": "WTG_LV_2",
                "q": 0.4673,
                "source_id": "async/WTG_LV_2/1"
              },
              {
                "ib_partial_ka": 0.138,
                "ikss_partial_ka": 0.296,
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
            "ikss_max_ka": 20.563,
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
      "grid_earthing": {
        "ik_1f_ka": 0.06,
        "imd_it_nn": false,
        "neutral_point": "kompensowana",
        "note_pl": "SN kolektor 15 kV: I\u2033k1f-z z uziemienia neutralnego OSD (kompensowana), pr\u0105d resztkowy \u221d Un; LV turbiny za trafem Dyn \u2014 uziemienie lokalne",
        "source_ref": "norma:PN-EN_60909_doziemienie;OSD:punkt_neutralny_SN"
      },
      "machine_type": "ASYNCHRONOUS",
      "metering": {
        "ct": {
          "cores": 2,
          "ipn_a": 100.0,
          "isn_a": 5.0
        },
        "source_ref": "norma:IEC_61869-2_CT;norma:IEC_61869-3_VT",
        "vt": {
          "fv": 1.9,
          "usn_v": 100.0
        }
      },
      "nc_rfg_class": "C",
      "power_hierarchy": {
        "p_osiagalna_kw": 2400.0,
        "p_przylacz_kw": 2550.0,
        "p_zainst_kw": 2550.0,
        "pn_ac_kw": 2550.0,
        "valid": true
      },
      "protection": {
        "converter": [],
        "machine": [
          "46",
          "47",
          "49",
          "51",
          "37",
          "32"
        ],
        "source_ref": "norma:NC_RfG;norma:IEC_60255;std:induction_generator"
      },
      "protection_codes": [
        "67",
        "67N",
        "27",
        "59",
        "81U",
        "81O",
        "df/dt",
        "anti-islanding"
      ],
      "technology": "Wiatr \u2014 generatory indukcyjne (Typ 1, sta\u0142a pr\u0119dko\u015b\u0107)"
    },
    "voltage_flow": {
      "branches": {
        "sr/branch/in": {
          "branch_ref": "sr/branch/in",
          "direction": "reverse",
          "i_a": 97.11,
          "loading_percent": 15.41,
          "p_mw": -2.5184,
          "q_mvar": 0.1525,
          "s_mva": 2.523
        },
        "sr/branch/wtg-tr1": {
          "branch_ref": "sr/branch/wtg-tr1",
          "direction": "reverse",
          "i_a": 32.37,
          "loading_percent": null,
          "p_mw": -0.8408,
          "q_mvar": 0.0414,
          "s_mva": 0.8418
        },
        "sr/branch/wtg-tr2": {
          "branch_ref": "sr/branch/wtg-tr2",
          "direction": "reverse",
          "i_a": 32.37,
          "loading_percent": null,
          "p_mw": -0.8408,
          "q_mvar": 0.0414,
          "s_mva": 0.8418
        },
        "sr/branch/wtg-tr3": {
          "branch_ref": "sr/branch/wtg-tr3",
          "direction": "reverse",
          "i_a": 32.37,
          "loading_percent": null,
          "p_mw": -0.8408,
          "q_mvar": 0.0414,
          "s_mva": 0.8418
        }
      },
      "buses": {
        "SN_PCC": {
          "bus_ref": "SN_PCC",
          "deviation_percent": 0.098,
          "u_kv": 15.0147,
          "u_pu": 1.00098,
          "un_kv": 15.0
        },
        "WTG_LV_1": {
          "bus_ref": "WTG_LV_1",
          "deviation_percent": 1.071,
          "u_kv": 0.6974,
          "u_pu": 1.01071,
          "un_kv": 0.69
        }
      }
    }
  },
  "G8-BIOGAZ": {
    "archetype": "G8-BIOGAZ",
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
    "enm_hash": "oze-substrate/G8-BIOGAZ",
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
          "27",
          "59",
          "81U",
          "81O",
          "df/dt",
          "anti-islanding"
        ],
        "role": "connection",
        "source_ref": "enm:Bay.bay_role=LINIA_OUT;std:IEC_62271_pole_liniowe"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g8-gen1",
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
        "field_id": "g8-gen2",
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
          "idyn_ka": 62.5,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 10.165,
            "ikss_ka": 10.165,
            "ip_ka": 23.987,
            "ith_ka": 10.29,
            "kappa": 1.669,
            "rx_ratio": 0.1376,
            "sk_mva": 264.09,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "SN_PCC",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.9284545713,
                    "re": 0.127716138797
                  },
                  "z2_ohm": {
                    "im": 0.9284545713,
                    "re": 0.127716138797
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.127716138797,
                  "x_ohm": 0.9284545713,
                  "z_equiv_abs_ohm": 0.93719757953,
                  "z_equiv_ohm": {
                    "im": 0.9284545713,
                    "re": 0.127716138797
                  }
                },
                "substitution": "\\left(0.127716 + j 0.928455\\right)",
                "substitution_latex": "\\left(0.127716 + j 0.928455\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 1.1,
                  "un_v": 15000.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.93719757953
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 10164.6436671
                },
                "substitution": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{0.937198}",
                "substitution_latex": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{0.937198}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.127716138797,
                  "rx_ratio": 0.137557768301,
                  "x_ohm": 0.9284545713
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.66864091037
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.137558}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.137558}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 10164.6436671,
                  "kappa": 1.66864091037
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 23986.6745922
                },
                "substitution": "1.66864 \\cdot \\sqrt{2} \\cdot 10164.6",
                "substitution_latex": "1.66864 \\cdot \\sqrt{2} \\cdot 10164.6",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.0132798856804,
                  "ikss_a": 10164.6436671,
                  "kappa": 1.66864091037,
                  "ta_s": 0.0231400879875,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 10165.0443753
                },
                "substitution": "10164.6 \\cdot \\sqrt{1 + \\left((1.66864 - 1) \\cdot 0.0132799\\right)^2}",
                "substitution_latex": "10164.6 \\cdot \\sqrt{1 + \\left((1.66864 - 1) \\cdot 0.0132799\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 10164.6436671,
                  "m_factor": 0.024844219368,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 10290.135332
                },
                "substitution": "10164.6 \\cdot \\sqrt{0.0248442 + 1}",
                "substitution_latex": "10164.6 \\cdot \\sqrt{0.0248442 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 10164.6436671,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 264.085189085
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 10164.6 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 10164.6 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 8.779,
            "ith_ka": 8.887,
            "kappa": 1.669,
            "sk_mva": 228.07,
            "white_box_trace": [
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "SN_PCC",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.9284545713,
                    "re": 0.127716138797
                  },
                  "z2_ohm": {
                    "im": 0.9284545713,
                    "re": 0.127716138797
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.127716138797,
                  "x_ohm": 0.9284545713,
                  "z_equiv_abs_ohm": 0.93719757953,
                  "z_equiv_ohm": {
                    "im": 0.9284545713,
                    "re": 0.127716138797
                  }
                },
                "substitution": "\\left(0.127716 + j 0.928455\\right)",
                "substitution_latex": "\\left(0.127716 + j 0.928455\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 0.95,
                  "un_v": 15000.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.93719757953
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 8778.55589435
                },
                "substitution": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{0.937198}",
                "substitution_latex": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{0.937198}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.127716138797,
                  "rx_ratio": 0.137557768301,
                  "x_ohm": 0.9284545713
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.66864091037
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.137558}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.137558}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 8778.55589435,
                  "kappa": 1.66864091037
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 20715.7644206
                },
                "substitution": "1.66864 \\cdot \\sqrt{2} \\cdot 8778.56",
                "substitution_latex": "1.66864 \\cdot \\sqrt{2} \\cdot 8778.56",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.0132798856804,
                  "ikss_a": 8778.55589435,
                  "kappa": 1.66864091037,
                  "ta_s": 0.0231400879875,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 8778.90196047
                },
                "substitution": "8778.56 \\cdot \\sqrt{1 + \\left((1.66864 - 1) \\cdot 0.0132799\\right)^2}",
                "substitution_latex": "8778.56 \\cdot \\sqrt{1 + \\left((1.66864 - 1) \\cdot 0.0132799\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 8778.55589435,
                  "m_factor": 0.024844219368,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 8886.93505942
                },
                "substitution": "8778.56 \\cdot \\sqrt{0.0248442 + 1}",
                "substitution_latex": "8778.56 \\cdot \\sqrt{0.0248442 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 8778.55589435,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 228.073572391
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 8778.56 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 8778.56 / 10^6",
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
            "ikss_max_ka": 10.165,
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
        "neutral_earthing": "rezystor NGR (ogranicza I0 stojana)",
        "sn_kv": 15.0,
        "source_ref": "std:IEC_60909_6_3;enm:Generator.gen_type=biogas_synchronous",
        "xd_subtransient_pu": 0.15
      },
      "grid_earthing": {
        "ik_1f_ka": 0.06,
        "imd_it_nn": false,
        "neutral_point": "kompensowana",
        "note_pl": "SN 15 kV: I\u2033k1f-z z uziemienia neutralnego OSD (kompensowana), pr\u0105d resztkowy \u221d Un; agregaty synchroniczne na szynie SN \u2014 punkt gwiazdowy generatora wg karty",
        "source_ref": "norma:PN-EN_60909_doziemienie;OSD:punkt_neutralny_SN"
      },
      "machine_type": "SYNCHRONOUS",
      "metering": {
        "ct": {
          "cores": 2,
          "ipn_a": 100.0,
          "isn_a": 5.0
        },
        "source_ref": "norma:IEC_61869-2_CT;norma:IEC_61869-3_VT",
        "vt": {
          "fv": 1.9,
          "usn_v": 100.0
        }
      },
      "nc_rfg_class": "C",
      "power_hierarchy": {
        "p_osiagalna_kw": 1900.0,
        "p_przylacz_kw": 2000.0,
        "p_zainst_kw": 2000.0,
        "pn_ac_kw": 2000.0,
        "valid": true
      },
      "protection": {
        "converter": [],
        "machine": [
          "87G",
          "40",
          "32",
          "64",
          "46",
          "21",
          "25",
          "27",
          "59",
          "81"
        ],
        "source_ref": "norma:NC_RfG;norma:IEC_60255;std:generator_synchroniczny"
      },
      "protection_codes": [
        "67",
        "67N",
        "27",
        "59",
        "81U",
        "81O",
        "df/dt",
        "anti-islanding"
      ],
      "technology": "Biogazownia \u2014 agregaty synchroniczne (kogeneracja)"
    },
    "voltage_flow": {
      "branches": {
        "sr/branch/in": {
          "branch_ref": "sr/branch/in",
          "direction": "reverse",
          "i_a": 76.89,
          "loading_percent": 12.2,
          "p_mw": -1.9975,
          "q_mvar": 0.0177,
          "s_mva": 1.9976
        }
      },
      "buses": {
        "SN_PCC": {
          "bus_ref": "SN_PCC",
          "deviation_percent": 0.122,
          "u_kv": 15.0183,
          "u_pu": 1.00122,
          "un_kv": 15.0
        }
      }
    }
  },
  "G9-GPO": {
    "archetype": "G9-GPO",
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
    "enm_hash": "oze-substrate/G9-GPO",
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
          "27",
          "59",
          "81U",
          "81O",
          "df/dt",
          "anti-islanding"
        ],
        "role": "connection",
        "source_ref": "enm:Bay.bay_role=LINIA_OUT;std:IEC_62271_pole_liniowe"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g9-pv",
        "interface_protection": false,
        "kind": "PV \u2014 falownik (IBG)",
        "on_bus_ref": "PV_NN",
        "port": null,
        "protection_codes": [
          "anti-islanding",
          "81U",
          "81O",
          "27",
          "59"
        ],
        "role": "source",
        "source_kind": "IBG",
        "source_ref": "enm:Generator.gen_type=pv_inverter;std:IEC_60909_6_7"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g9-sync",
        "interface_protection": false,
        "kind": "Agregat synchroniczny",
        "on_bus_ref": "SN_PCC",
        "port": null,
        "protection_codes": [
          "87G",
          "40",
          "32",
          "64",
          "46",
          "21",
          "25",
          "27",
          "59",
          "81"
        ],
        "role": "source",
        "source_kind": "SYNCHRONOUS",
        "source_ref": "enm:Generator.gen_type=synchronous;std:IEC_60909_6_3"
      },
      {
        "abb_cell": "SDC",
        "apparatus": [],
        "field_id": "g9-async",
        "interface_protection": false,
        "kind": "Wiatr \u2014 generator async",
        "on_bus_ref": "WIND_NN",
        "port": null,
        "protection_codes": [
          "46",
          "47",
          "49",
          "51",
          "37",
          "32"
        ],
        "role": "source",
        "source_kind": "ASYNCHRONOUS",
        "source_ref": "enm:Generator.gen_type=wind_async;std:IEC_60909_6_7"
      }
    ],
    "pcc_bus_ref": "SN_PCC",
    "schema": "sld_oze_archetype_companion_v1",
    "short_circuit": {
      "buses": {
        "PV_NN": {
          "bus_ref": "PV_NN",
          "icw_ka": 65.0,
          "idyn_ka": 136.5,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 61.955,
            "ikss_ka": 61.955,
            "ip_ka": 135.014,
            "ith_ka": 62.457,
            "kappa": 1.541,
            "rx_ratio": 0.2106,
            "sk_mva": 42.92,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr-pv",
                  "c_max": 1.05,
                  "s_rt_mva": 2.5,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.4,
                  "x_t_ohm_hv": 5.27141012499,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/tr-pv]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr-pv"
              },
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr-wind",
                  "c_max": 1.05,
                  "s_rt_mva": 2.0,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 6.58926265624,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/tr-wind]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr-wind"
              },
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "PV_NN",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.00424984972676,
                    "re": 0.000895204046042
                  },
                  "z2_ohm": {
                    "im": 0.00424984972676,
                    "re": 0.000895204046042
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.000895204046042,
                  "x_ohm": 0.00424984972676,
                  "z_equiv_abs_ohm": 0.00434311097994,
                  "z_equiv_ohm": {
                    "im": 0.00424984972676,
                    "re": 0.000895204046042
                  }
                },
                "substitution": "\\left(0.000895204 + j 0.00424985\\right)",
                "substitution_latex": "\\left(0.000895204 + j 0.00424985\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 1.1,
                  "un_v": 400.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.00434311097994
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 61955.3811649
                },
                "substitution": "\\frac{1.1 \\cdot 400 \\cdot 0.57735}{0.00434311}",
                "substitution_latex": "\\frac{1.1 \\cdot 400 \\cdot 0.57735}{0.00434311}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.000895204046042,
                  "rx_ratio": 0.210643694154,
                  "x_ohm": 0.00424984972676
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.54093302843
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.210644}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.210644}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 61955.3811649,
                  "kappa": 1.54093302843
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 135013.686286
                },
                "substitution": "1.54093 \\cdot \\sqrt{2} \\cdot 61955.4",
                "substitution_latex": "1.54093 \\cdot \\sqrt{2} \\cdot 61955.4",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.00133667937248,
                  "ikss_a": 61955.3811649,
                  "kappa": 1.54093302843,
                  "ta_s": 0.0151112943334,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 61955.3973603
                },
                "substitution": "61955.4 \\cdot \\sqrt{1 + \\left((1.54093 - 1) \\cdot 0.00133668\\right)^2}",
                "substitution_latex": "61955.4 \\cdot \\sqrt{1 + \\left((1.54093 - 1) \\cdot 0.00133668\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 61955.3811649,
                  "m_factor": 0.0162744576622,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 62457.4916297
                },
                "substitution": "61955.4 \\cdot \\sqrt{0.0162745 + 1}",
                "substitution_latex": "61955.4 \\cdot \\sqrt{0.0162745 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 61955.3811649,
                  "un_v": 400.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 42.923947192
                },
                "substitution": "\\sqrt{3} \\cdot 400 \\cdot 61955.4 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 400 \\cdot 61955.4 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 53.979,
            "ith_ka": 54.417,
            "kappa": 1.541,
            "sk_mva": 37.4,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr-pv",
                  "c_max": 1.05,
                  "s_rt_mva": 2.5,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.4,
                  "x_t_ohm_hv": 5.27141012499,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/tr-pv]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr-pv"
              },
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr-wind",
                  "c_max": 1.05,
                  "s_rt_mva": 2.0,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 6.58926265624,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/tr-wind]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr-wind"
              },
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "PV_NN",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.00424984972676,
                    "re": 0.000895204046042
                  },
                  "z2_ohm": {
                    "im": 0.00424984972676,
                    "re": 0.000895204046042
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.000895204046042,
                  "x_ohm": 0.00424984972676,
                  "z_equiv_abs_ohm": 0.00434311097994,
                  "z_equiv_ohm": {
                    "im": 0.00424984972676,
                    "re": 0.000895204046042
                  }
                },
                "substitution": "\\left(0.000895204 + j 0.00424985\\right)",
                "substitution_latex": "\\left(0.000895204 + j 0.00424985\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 0.95,
                  "un_v": 400.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.00434311097994
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 53979.29759
                },
                "substitution": "\\frac{0.95 \\cdot 400 \\cdot 0.57735}{0.00434311}",
                "substitution_latex": "\\frac{0.95 \\cdot 400 \\cdot 0.57735}{0.00434311}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.000895204046042,
                  "rx_ratio": 0.210643694154,
                  "x_ohm": 0.00424984972676
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.54093302843
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.210644}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.210644}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 53979.29759,
                  "kappa": 1.54093302843
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 117632.13806
                },
                "substitution": "1.54093 \\cdot \\sqrt{2} \\cdot 53979.3",
                "substitution_latex": "1.54093 \\cdot \\sqrt{2} \\cdot 53979.3",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.00133667937248,
                  "ikss_a": 53979.29759,
                  "kappa": 1.54093302843,
                  "ta_s": 0.0151112943334,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 53979.3117003
                },
                "substitution": "53979.3 \\cdot \\sqrt{1 + \\left((1.54093 - 1) \\cdot 0.00133668\\right)^2}",
                "substitution_latex": "53979.3 \\cdot \\sqrt{1 + \\left((1.54093 - 1) \\cdot 0.00133668\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 53979.29759,
                  "m_factor": 0.0162744576622,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 54416.7667765
                },
                "substitution": "53979.3 \\cdot \\sqrt{0.0162745 + 1}",
                "substitution_latex": "53979.3 \\cdot \\sqrt{0.0162745 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 53979.29759,
                  "un_v": 400.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 37.3979543931
                },
                "substitution": "\\sqrt{3} \\cdot 400 \\cdot 53979.3 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 400 \\cdot 53979.3 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ib_contribution_ka": 3.472,
            "ibg_ka": 3.464,
            "ik_contribution_ka": 9.336,
            "is_synchronous_machine": false,
            "machine_ka": 5.872,
            "machine_type": "MIXED",
            "machines": [
              {
                "ib_partial_ka": 2.406,
                "ikss_partial_ka": 3.88,
                "ir_a": 96.2,
                "mu": 0.62,
                "node_ref": "SN_PCC",
                "q": 1.0,
                "source_id": "sync/SN_PCC/1"
              },
              {
                "ib_partial_ka": 1.066,
                "ikss_partial_ka": 1.991,
                "ir_a": 1554.3,
                "mu": 1.0,
                "node_ref": "WIND_NN",
                "q": 0.5355,
                "source_id": "async/WIND_NN/1"
              }
            ],
            "model": "GPO \u2014 IBG (\u00a76.7) + maszyny synchr./asynchr. (\u00a76.3/\u00a76.7) na wsp\u00f3lnej szynie SN"
          },
          "un_kv": 0.4,
          "verification": {
            "icw_ka": 65.0,
            "ikss_max_ka": 61.955,
            "passed": true,
            "rule": "ikss_max_le_icw"
          }
        },
        "SN_PCC": {
          "bus_ref": "SN_PCC",
          "icw_ka": 25.0,
          "idyn_ka": 62.5,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 10.607,
            "ikss_ka": 10.607,
            "ip_ka": 24.814,
            "ith_ka": 10.731,
            "kappa": 1.654,
            "rx_ratio": 0.145,
            "sk_mva": 275.57,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr-pv",
                  "c_max": 1.05,
                  "s_rt_mva": 2.5,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.4,
                  "x_t_ohm_hv": 5.27141012499,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/tr-pv]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr-pv"
              },
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr-wind",
                  "c_max": 1.05,
                  "s_rt_mva": 2.0,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 6.58926265624,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/tr-wind]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr-wind"
              },
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "SN_PCC",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.896634704259,
                    "re": 0.130054806637
                  },
                  "z2_ohm": {
                    "im": 0.896634704259,
                    "re": 0.130054806637
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.130054806637,
                  "x_ohm": 0.896634704259,
                  "z_equiv_abs_ohm": 0.906017685043,
                  "z_equiv_ohm": {
                    "im": 0.896634704259,
                    "re": 0.130054806637
                  }
                },
                "substitution": "\\left(0.130055 + j 0.896635\\right)",
                "substitution_latex": "\\left(0.130055 + j 0.896635\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 1.1,
                  "un_v": 15000.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.906017685043
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 10606.8280222
                },
                "substitution": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{0.906018}",
                "substitution_latex": "\\frac{1.1 \\cdot 15000 \\cdot 0.57735}{0.906018}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.130054806637,
                  "rx_ratio": 0.145047705625,
                  "x_ohm": 0.896634704259
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.65422859843
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.145048}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.145048}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 10606.8280222,
                  "kappa": 1.65422859843
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 24813.9584003
                },
                "substitution": "1.65423 \\cdot \\sqrt{2} \\cdot 10606.8",
                "substitution_latex": "1.65423 \\cdot \\sqrt{2} \\cdot 10606.8",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.0104955065176,
                  "ikss_a": 10606.8280222,
                  "kappa": 1.65422859843,
                  "ta_s": 0.021945185883,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 10607.0780661
                },
                "substitution": "10606.8 \\cdot \\sqrt{1 + \\left((1.65423 - 1) \\cdot 0.0104955\\right)^2}",
                "substitution_latex": "10606.8 \\cdot \\sqrt{1 + \\left((1.65423 - 1) \\cdot 0.0104955\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 10606.8280222,
                  "m_factor": 0.0235683161382,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 10731.0926472
                },
                "substitution": "10606.8 \\cdot \\sqrt{0.0235683 + 1}",
                "substitution_latex": "10606.8 \\cdot \\sqrt{0.0235683 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 10606.8280222,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 275.573475624
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 10606.8 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 10606.8 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 9.173,
            "ith_ka": 9.281,
            "kappa": 1.654,
            "sk_mva": 238.32,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr-pv",
                  "c_max": 1.05,
                  "s_rt_mva": 2.5,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.4,
                  "x_t_ohm_hv": 5.27141012499,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/tr-pv]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr-pv"
              },
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr-wind",
                  "c_max": 1.05,
                  "s_rt_mva": 2.0,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 6.58926265624,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/tr-wind]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr-wind"
              },
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "SN_PCC",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.896634704259,
                    "re": 0.130054806637
                  },
                  "z2_ohm": {
                    "im": 0.896634704259,
                    "re": 0.130054806637
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.130054806637,
                  "x_ohm": 0.896634704259,
                  "z_equiv_abs_ohm": 0.906017685043,
                  "z_equiv_ohm": {
                    "im": 0.896634704259,
                    "re": 0.130054806637
                  }
                },
                "substitution": "\\left(0.130055 + j 0.896635\\right)",
                "substitution_latex": "\\left(0.130055 + j 0.896635\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 0.95,
                  "un_v": 15000.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.906017685043
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 9173.03911595
                },
                "substitution": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{0.906018}",
                "substitution_latex": "\\frac{0.95 \\cdot 15000 \\cdot 0.57735}{0.906018}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.130054806637,
                  "rx_ratio": 0.145047705625,
                  "x_ohm": 0.896634704259
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.65422859843
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.145048}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.145048}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 9173.03911595,
                  "kappa": 1.65422859843
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 21459.7060074
                },
                "substitution": "1.65423 \\cdot \\sqrt{2} \\cdot 9173.04",
                "substitution_latex": "1.65423 \\cdot \\sqrt{2} \\cdot 9173.04",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.0104955065176,
                  "ikss_a": 9173.03911595,
                  "kappa": 1.65422859843,
                  "ta_s": 0.021945185883,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 9173.25535991
                },
                "substitution": "9173.04 \\cdot \\sqrt{1 + \\left((1.65423 - 1) \\cdot 0.0104955\\right)^2}",
                "substitution_latex": "9173.04 \\cdot \\sqrt{1 + \\left((1.65423 - 1) \\cdot 0.0104955\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 9173.03911595,
                  "m_factor": 0.0235683161382,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 9280.50614222
                },
                "substitution": "9173.04 \\cdot \\sqrt{0.0235683 + 1}",
                "substitution_latex": "9173.04 \\cdot \\sqrt{0.0235683 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 9173.03911595,
                  "un_v": 15000.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 238.32254713
                },
                "substitution": "\\sqrt{3} \\cdot 15000 \\cdot 9173.04 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 9173.04 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ib_contribution_ka": 0.674,
            "ibg_ka": 0.092,
            "ik_contribution_ka": 1.148,
            "is_synchronous_machine": false,
            "machine_ka": 1.055,
            "machine_type": "MIXED",
            "machines": [
              {
                "ib_partial_ka": 0.482,
                "ikss_partial_ka": 0.698,
                "ir_a": 96.2,
                "mu": 0.6908,
                "node_ref": "SN_PCC",
                "q": 1.0,
                "source_id": "sync/SN_PCC/1"
              },
              {
                "ib_partial_ka": 0.192,
                "ikss_partial_ka": 0.358,
                "ir_a": 1554.3,
                "mu": 1.0,
                "node_ref": "WIND_NN",
                "q": 0.5355,
                "source_id": "async/WIND_NN/1"
              }
            ],
            "model": "GPO \u2014 IBG (\u00a76.7) + maszyny synchr./asynchr. (\u00a76.3/\u00a76.7) na wsp\u00f3lnej szynie SN"
          },
          "un_kv": 15.0,
          "verification": {
            "icw_ka": 25.0,
            "ikss_max_ka": 10.607,
            "passed": true,
            "rule": "ikss_max_le_icw"
          }
        },
        "WIND_NN": {
          "bus_ref": "WIND_NN",
          "icw_ka": 50.0,
          "idyn_ka": 105.0,
          "max": {
            "c_factor": 1.1,
            "case_ref": "ZWARCIOWY_MAKS",
            "ib_ka": 39.971,
            "ikss_ka": 39.971,
            "ip_ka": 82.661,
            "ith_ka": 40.23,
            "kappa": 1.462,
            "rx_ratio": 0.2652,
            "sk_mva": 47.77,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr-pv",
                  "c_max": 1.05,
                  "s_rt_mva": 2.5,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.4,
                  "x_t_ohm_hv": 5.27141012499,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/tr-pv]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr-pv"
              },
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr-wind",
                  "c_max": 1.05,
                  "s_rt_mva": 2.0,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 6.58926265624,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/tr-wind]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr-wind"
              },
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "WIND_NN",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.0111573360826,
                    "re": 0.00295873412127
                  },
                  "z2_ohm": {
                    "im": 0.0111573360826,
                    "re": 0.00295873412127
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.00295873412127,
                  "x_ohm": 0.0111573360826,
                  "z_equiv_abs_ohm": 0.0115429743161,
                  "z_equiv_ohm": {
                    "im": 0.0111573360826,
                    "re": 0.00295873412127
                  }
                },
                "substitution": "\\left(0.00295873 + j 0.0111573\\right)",
                "substitution_latex": "\\left(0.00295873 + j 0.0111573\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 1.1,
                  "un_v": 690.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.0115429743161
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 38216.252132
                },
                "substitution": "\\frac{1.1 \\cdot 690 \\cdot 0.57735}{0.011543}",
                "substitution_latex": "\\frac{1.1 \\cdot 690 \\cdot 0.57735}{0.011543}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.00295873412127,
                  "rx_ratio": 0.265182844665,
                  "x_ohm": 0.0111573360826
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.46230692329
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.265183}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.265183}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 38216.252132,
                  "kappa": 1.46230692329
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 79031.7552617
                },
                "substitution": "1.46231 \\cdot \\sqrt{2} \\cdot 38216.3",
                "substitution_latex": "1.46231 \\cdot \\sqrt{2} \\cdot 38216.3",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.000240939482356,
                  "ikss_a": 38216.252132,
                  "kappa": 1.46230692329,
                  "ta_s": 0.0120034117059,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 38216.252369
                },
                "substitution": "38216.3 \\cdot \\sqrt{1 + \\left((1.46231 - 1) \\cdot 0.000240939\\right)^2}",
                "substitution_latex": "38216.3 \\cdot \\sqrt{1 + \\left((1.46231 - 1) \\cdot 0.000240939\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 38216.252132,
                  "m_factor": 0.01296132142,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 38463.1213333
                },
                "substitution": "38216.3 \\cdot \\sqrt{0.0129613 + 1}",
                "substitution_latex": "38216.3 \\cdot \\sqrt{0.0129613 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 38216.252132,
                  "un_v": 690.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 45.6728183535
                },
                "substitution": "\\sqrt{3} \\cdot 690 \\cdot 38216.3 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 690 \\cdot 38216.3 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "min": {
            "c_factor": 0.95,
            "case_ref": "ZWARCIOWY_MIN",
            "ikss_ka": 34.795,
            "ith_ka": 35.019,
            "kappa": 1.462,
            "sk_mva": 41.58,
            "white_box_trace": [
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr-pv",
                  "c_max": 1.05,
                  "s_rt_mva": 2.5,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.4,
                  "x_t_ohm_hv": 5.27141012499,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/tr-pv]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr-pv"
              },
              {
                "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
                "inputs": {
                  "branch_id": "sr/branch/tr-wind",
                  "c_max": 1.05,
                  "s_rt_mva": 2.0,
                  "u_rt_hv_kv": 15.0,
                  "u_rt_lv_kv": 0.69,
                  "x_t_ohm_hv": 6.58926265624,
                  "x_t_pu": 0.058571223611
                },
                "key": "KT[sr/branch/tr-wind]",
                "notes": null,
                "result": {
                  "k_t": 0.963635223507,
                  "z_t_pu": {
                    "im": 0.058571223611,
                    "re": 0.0130158274691
                  },
                  "z_tk_formula_latex": "Z_{TK} = K_T \\cdot Z_T = 0.963635 \\cdot \\left(0.0130158 + j 0.0585712\\right) = \\left(0.0125425 + j 0.0564413\\right)",
                  "z_tk_pu": {
                    "im": 0.0564412941555,
                    "re": 0.0125425098123
                  }
                },
                "substitution": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.0585712}",
                "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr-wind"
              },
              {
                "formula_latex": "Z_k = Z_1",
                "inputs": {
                  "fault_node_id": "WIND_NN",
                  "short_circuit_type": "3F",
                  "z1_ohm": {
                    "im": 0.0111573360826,
                    "re": 0.00295873412127
                  },
                  "z2_ohm": {
                    "im": 0.0111573360826,
                    "re": 0.00295873412127
                  }
                },
                "key": "Zk",
                "notes": null,
                "result": {
                  "r_ohm": 0.00295873412127,
                  "x_ohm": 0.0111573360826,
                  "z_equiv_abs_ohm": 0.0115429743161,
                  "z_equiv_ohm": {
                    "im": 0.0111573360826,
                    "re": 0.00295873412127
                  }
                },
                "substitution": "\\left(0.00295873 + j 0.0111573\\right)",
                "substitution_latex": "\\left(0.00295873 + j 0.0111573\\right)",
                "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
              },
              {
                "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
                "inputs": {
                  "c_factor": 0.95,
                  "un_v": 690.0,
                  "voltage_factor": 0.57735026919,
                  "z_equiv_abs_ohm": 0.0115429743161
                },
                "key": "Ikss",
                "notes": null,
                "result": {
                  "ikss_a": 33039.4449049
                },
                "substitution": "\\frac{0.95 \\cdot 690 \\cdot 0.57735}{0.011543}",
                "substitution_latex": "\\frac{0.95 \\cdot 690 \\cdot 0.57735}{0.011543}",
                "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
              },
              {
                "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
                "inputs": {
                  "r_ohm": 0.00295873412127,
                  "rx_ratio": 0.265182844665,
                  "x_ohm": 0.0111573360826
                },
                "key": "kappa",
                "notes": null,
                "result": {
                  "kappa": 1.46230692329
                },
                "substitution": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.265183}",
                "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.265183}",
                "title": "Wsp\u00f3\u0142czynnik udaru"
              },
              {
                "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
                "inputs": {
                  "ikss_a": 33039.4449049,
                  "kappa": 1.46230692329
                },
                "key": "Ip",
                "notes": null,
                "result": {
                  "ip_a": 68326.0439744
                },
                "substitution": "1.46231 \\cdot \\sqrt{2} \\cdot 33039.4",
                "substitution_latex": "1.46231 \\cdot \\sqrt{2} \\cdot 33039.4",
                "title": "Pr\u0105d udarowy"
              },
              {
                "formula_latex": "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1) \\cdot e^{-t_b/t_a})^2}",
                "inputs": {
                  "exp_factor": 0.000240939482356,
                  "ikss_a": 33039.4449049,
                  "kappa": 1.46230692329,
                  "ta_s": 0.0120034117059,
                  "tb_s": 0.1
                },
                "key": "Ib",
                "notes": null,
                "result": {
                  "ib_a": 33039.4451099
                },
                "substitution": "33039.4 \\cdot \\sqrt{1 + \\left((1.46231 - 1) \\cdot 0.000240939\\right)^2}",
                "substitution_latex": "33039.4 \\cdot \\sqrt{1 + \\left((1.46231 - 1) \\cdot 0.000240939\\right)^2}",
                "title": "Pr\u0105d zwarciowy do oblicze\u0144 cieplnych"
              },
              {
                "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
                "inputs": {
                  "ikss_a": 33039.4449049,
                  "m_factor": 0.01296132142,
                  "n_factor": 1.0
                },
                "key": "Ith",
                "notes": null,
                "result": {
                  "ith_a": 33252.8729864
                },
                "substitution": "33039.4 \\cdot \\sqrt{0.0129613 + 1}",
                "substitution_latex": "33039.4 \\cdot \\sqrt{0.0129613 + 1}",
                "title": "Pr\u0105d zast\u0119pczy cieplny"
              },
              {
                "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
                "inputs": {
                  "ikss_a": 33039.4449049,
                  "un_v": 690.0
                },
                "key": "Sk",
                "notes": null,
                "result": {
                  "sk_mva": 39.4859380881
                },
                "substitution": "\\sqrt{3} \\cdot 690 \\cdot 33039.4 / 10^6",
                "substitution_latex": "\\sqrt{3} \\cdot 690 \\cdot 33039.4 / 10^6",
                "title": "Moc zwarciowa"
              }
            ]
          },
          "source_contribution": {
            "ib_contribution_ka": 5.071,
            "ibg_ka": 2.008,
            "ik_contribution_ka": 14.177,
            "is_synchronous_machine": false,
            "machine_ka": 12.169,
            "machine_type": "MIXED",
            "machines": [
              {
                "ib_partial_ka": 1.187,
                "ikss_partial_ka": 1.91,
                "ir_a": 96.2,
                "mu": 0.6213,
                "node_ref": "SN_PCC",
                "q": 1.0,
                "source_id": "sync/SN_PCC/1"
              },
              {
                "ib_partial_ka": 3.884,
                "ikss_partial_ka": 10.258,
                "ir_a": 1554.3,
                "mu": 0.7071,
                "node_ref": "WIND_NN",
                "q": 0.5355,
                "source_id": "async/WIND_NN/1"
              }
            ],
            "model": "GPO \u2014 IBG (\u00a76.7) + maszyny synchr./asynchr. (\u00a76.3/\u00a76.7) na wsp\u00f3lnej szynie SN"
          },
          "un_kv": 0.69,
          "verification": {
            "icw_ka": 50.0,
            "ikss_max_ka": 39.971,
            "passed": true,
            "rule": "ikss_max_le_icw"
          }
        }
      },
      "standard": "IEC 60909"
    },
    "source": {
      "control_mode": "U/Q \u00b7 cos\u03c6 \u00b7 P(f)",
      "grid_earthing": {
        "ik_1f_ka": 0.06,
        "imd_it_nn": false,
        "neutral_point": "kompensowana",
        "note_pl": "SN 15 kV: I\u2033k1f-z z uziemienia neutralnego OSD (kompensowana); pkt neutralny agregatu synchr. przez rezystor NGR (64/59N)",
        "source_ref": "norma:PN-EN_60909_doziemienie;OSD:punkt_neutralny_SN"
      },
      "machine_type": "MIXED",
      "metering": {
        "ct": {
          "cores": 2,
          "ipn_a": 250.0,
          "isn_a": 5.0
        },
        "source_ref": "norma:IEC_61869-2_CT;norma:IEC_61869-3_VT",
        "vt": {
          "fv": 1.9,
          "usn_v": 100.0
        }
      },
      "nc_rfg_class": "C",
      "power_hierarchy": {
        "p_osiagalna_kw": 5225.0,
        "p_przylacz_kw": 5500.0,
        "p_zainst_kw": 5500.0,
        "pn_ac_kw": 5500.0,
        "valid": true
      },
      "protection_codes": [
        "67",
        "67N",
        "27",
        "59",
        "81U",
        "81O",
        "df/dt",
        "anti-islanding"
      ],
      "technology": "GPO wielopolowe \u2014 PV (IBG) + agregat synchr. + wiatr async"
    },
    "voltage_flow": {
      "branches": {
        "sr/branch/in": {
          "branch_ref": "sr/branch/in",
          "direction": "reverse",
          "i_a": 209.93,
          "loading_percent": 33.32,
          "p_mw": -5.4466,
          "q_mvar": 0.2877,
          "s_mva": 5.4542
        },
        "sr/branch/tr-pv": {
          "branch_ref": "sr/branch/tr-pv",
          "direction": "reverse",
          "i_a": 76.09,
          "loading_percent": null,
          "p_mw": -1.9797,
          "q_mvar": 0.0916,
          "s_mva": 1.9818
        },
        "sr/branch/tr-wind": {
          "branch_ref": "sr/branch/tr-wind",
          "direction": "reverse",
          "i_a": 57.1,
          "loading_percent": null,
          "p_mw": -1.4857,
          "q_mvar": 0.0644,
          "s_mva": 1.4871
        }
      },
      "buses": {
        "PV_NN": {
          "bus_ref": "PV_NN",
          "deviation_percent": 1.168,
          "u_kv": 0.4047,
          "u_pu": 1.01168,
          "un_kv": 0.4
        },
        "SN_PCC": {
          "bus_ref": "SN_PCC",
          "deviation_percent": 0.246,
          "u_kv": 15.0369,
          "u_pu": 1.00246,
          "un_kv": 15.0
        },
        "WIND_NN": {
          "bus_ref": "WIND_NN",
          "deviation_percent": 1.117,
          "u_kv": 0.6977,
          "u_pu": 1.01117,
          "un_kv": 0.69
        }
      }
    }
  }
};
