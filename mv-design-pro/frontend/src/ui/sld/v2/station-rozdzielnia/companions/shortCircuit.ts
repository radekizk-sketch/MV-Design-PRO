/**
 * GENERATED — DO NOT EDIT BY HAND.
 *
 * Per-archetype, per-busbar IEC 60909 SHORT-CIRCUIT companions (gate E). Produced
 * by running the FROZEN ShortCircuitIEC60909Solver on a two-voltage substrate
 * (real SN/nN TransformerBranch) in
 * `backend/tests/reference_networks/station_archetype_substrate.py`
 * (READ-ONLY w.r.t. the solver, B-01). Regenerate with:
 *
 *   cd mv-design-pro/backend && poetry run python -m \
 *     tests.reference_networks.station_archetype_substrate --write
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
        "idyn_ka": 52.5,
        "max": {
          "c_factor": 1.05,
          "case_ref": "ZWARCIOWY_MAKS",
          "ib_ka": 15.833,
          "ikss_ka": 15.833,
          "ip_ka": 43.449,
          "ith_ka": 17.074,
          "kappa": 1.94,
          "rx_ratio": 0.0209,
          "sk_mva": 10.97,
          "white_box_trace": [
            {
              "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
              "inputs": {
                "branch_id": "sr/branch/tr",
                "c_max": 1.05,
                "s_rt_mva": 0.63,
                "u_rt_hv_kv": 15.0,
                "u_rt_lv_kv": 0.4,
                "x_t_ohm_hv": 21.4285714286,
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
              "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.06}",
              "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr"
            },
            {
              "formula_latex": "Z_k = Z_1",
              "inputs": {
                "fault_node_id": "NN_BUS",
                "short_circuit_type": "3F",
                "z1_ohm": {
                  "im": 0.0153118146718,
                  "re": 0.0003200016
                },
                "z2_ohm": {
                  "im": 0.0153118146718,
                  "re": 0.0003200016
                }
              },
              "key": "Zk",
              "notes": null,
              "result": {
                "r_ohm": 0.0003200016,
                "x_ohm": 0.0153118146718,
                "z_equiv_abs_ohm": 0.0153151581633,
                "z_equiv_ohm": {
                  "im": 0.0153118146718,
                  "re": 0.0003200016
                }
              },
              "substitution_latex": "\\left(0.000320002 + j 0.0153118\\right)",
              "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
            },
            {
              "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
              "inputs": {
                "c_factor": 1.05,
                "un_v": 400.0,
                "voltage_factor": 0.57735026919,
                "z_equiv_abs_ohm": 0.0153151581633
              },
              "key": "Ikss",
              "notes": null,
              "result": {
                "ikss_a": 15833.1445535
              },
              "substitution_latex": "\\frac{1.05 \\cdot 400 \\cdot 0.57735}{0.0153152}",
              "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
            },
            {
              "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
              "inputs": {
                "r_ohm": 0.0003200016,
                "rx_ratio": 0.0208989990317,
                "x_ohm": 0.0153118146718
              },
              "key": "kappa",
              "notes": null,
              "result": {
                "kappa": 1.94044345901
              },
              "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.020899}",
              "title": "Wsp\u00f3\u0142czynnik udaru"
            },
            {
              "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
              "inputs": {
                "ikss_a": 15833.1445535,
                "kappa": 1.94044345901
              },
              "key": "Ip",
              "notes": null,
              "result": {
                "ip_a": 43449.3383486
              },
              "substitution_latex": "1.94044 \\cdot \\sqrt{2} \\cdot 15833.1",
              "title": "Pr\u0105d udarowy"
            },
            {
              "formula_latex": "I_b = I_{k}''",
              "inputs": {
                "ikss_a": 15833.1445535,
                "przypadek": "odlegle_od_generatora"
              },
              "key": "Ib",
              "notes": "Zwarcie odleg\u0142e od generatora (brak maszyn wiruj\u0105cych w sieci): sk\u0142adowa okresowa nie zanika, Ib = Ik'' (IEC 60909-0:2016, rozdz. 9). \u0179r\u00f3d\u0142a przekszta\u0142tnikowe s\u0105 \u017ar\u00f3d\u0142ami pr\u0105dowymi bez zaniku \u2014 ich udzia\u0142 wchodzi do Ib w ca\u0142o\u015bci.",
              "result": {
                "ib_a": 15833.1445535
              },
              "substitution_latex": "15833.1",
              "title": "Pr\u0105d wy\u0142\u0105czeniowy symetryczny"
            },
            {
              "formula_latex": "i_{DC} = \\sqrt{2} \\cdot I_{k}'' \\cdot e^{-2 \\pi f \\, t_b \\, R/X}",
              "inputs": {
                "f_hz": 50.0,
                "ikss_a": 15833.1445535,
                "rx_ratio": 0.0208989990317,
                "tb_s": 0.1,
                "wspolczynnik_zaniku": 0.518631629146,
                "wykladnik": 0.656561418254
              },
              "key": "iDC",
              "notes": "Ik'' cz\u0119\u015bci sieci nios\u0105cej sk\u0142adow\u0105 nieokresow\u0105 (sie\u0107 zasilaj\u0105ca i maszyny wiruj\u0105ce); \u017ar\u00f3d\u0142a przekszta\u0142tnikowe nie maj\u0105 sk\u0142adowej nieokresowej (IEC 60909-0:2016). R/X \u2014 ten sam stosunek p\u0119tli zwarcia co we wsp\u00f3\u0142czynniku \u03ba.",
              "result": {
                "i_dc_a": 11612.913032
              },
              "substitution_latex": "\\sqrt{2} \\cdot 15833.1 \\cdot e^{-2 \\pi \\cdot 50 \\cdot 0.1 \\cdot 0.020899}",
              "title": "Sk\u0142adowa nieokresowa pr\u0105du zwarciowego w chwili t_b"
            },
            {
              "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
              "inputs": {
                "ikss_a": 15833.1445535,
                "m_factor": 0.162855747211,
                "n_factor": 1.0
              },
              "key": "Ith",
              "notes": null,
              "result": {
                "ith_a": 17073.7964136
              },
              "substitution_latex": "15833.1 \\cdot \\sqrt{0.162856 + 1}",
              "title": "Pr\u0105d zast\u0119pczy cieplny"
            },
            {
              "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
              "inputs": {
                "ikss_a": 15833.1445535,
                "un_v": 400.0
              },
              "key": "Sk",
              "notes": null,
              "result": {
                "sk_mva": 10.9695243241
              },
              "substitution_latex": "\\sqrt{3} \\cdot 400 \\cdot 15833.1 / 10^6",
              "title": "Moc zwarciowa"
            }
          ]
        },
        "min": {
          "c_factor": 0.95,
          "case_ref": "ZWARCIOWY_MIN",
          "ikss_ka": 14.325,
          "ith_ka": 15.448,
          "kappa": 1.94,
          "sk_mva": 9.92,
          "white_box_trace": [
            {
              "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
              "inputs": {
                "branch_id": "sr/branch/tr",
                "c_max": 1.05,
                "s_rt_mva": 0.63,
                "u_rt_hv_kv": 15.0,
                "u_rt_lv_kv": 0.4,
                "x_t_ohm_hv": 21.4285714286,
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
              "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.06}",
              "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr"
            },
            {
              "formula_latex": "Z_k = Z_1",
              "inputs": {
                "fault_node_id": "NN_BUS",
                "short_circuit_type": "3F",
                "z1_ohm": {
                  "im": 0.0153118146718,
                  "re": 0.0003200016
                },
                "z2_ohm": {
                  "im": 0.0153118146718,
                  "re": 0.0003200016
                }
              },
              "key": "Zk",
              "notes": null,
              "result": {
                "r_ohm": 0.0003200016,
                "x_ohm": 0.0153118146718,
                "z_equiv_abs_ohm": 0.0153151581633,
                "z_equiv_ohm": {
                  "im": 0.0153118146718,
                  "re": 0.0003200016
                }
              },
              "substitution_latex": "\\left(0.000320002 + j 0.0153118\\right)",
              "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
            },
            {
              "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
              "inputs": {
                "c_factor": 0.95,
                "un_v": 400.0,
                "voltage_factor": 0.57735026919,
                "z_equiv_abs_ohm": 0.0153151581633
              },
              "key": "Ikss",
              "notes": null,
              "result": {
                "ikss_a": 14325.2260246
              },
              "substitution_latex": "\\frac{0.95 \\cdot 400 \\cdot 0.57735}{0.0153152}",
              "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
            },
            {
              "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
              "inputs": {
                "r_ohm": 0.0003200016,
                "rx_ratio": 0.0208989990317,
                "x_ohm": 0.0153118146718
              },
              "key": "kappa",
              "notes": null,
              "result": {
                "kappa": 1.94044345901
              },
              "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.020899}",
              "title": "Wsp\u00f3\u0142czynnik udaru"
            },
            {
              "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
              "inputs": {
                "ikss_a": 14325.2260246,
                "kappa": 1.94044345901
              },
              "key": "Ip",
              "notes": null,
              "result": {
                "ip_a": 39311.3061249
              },
              "substitution_latex": "1.94044 \\cdot \\sqrt{2} \\cdot 14325.2",
              "title": "Pr\u0105d udarowy"
            },
            {
              "formula_latex": "I_b = I_{k}''",
              "inputs": {
                "ikss_a": 14325.2260246,
                "przypadek": "odlegle_od_generatora"
              },
              "key": "Ib",
              "notes": "Zwarcie odleg\u0142e od generatora (brak maszyn wiruj\u0105cych w sieci): sk\u0142adowa okresowa nie zanika, Ib = Ik'' (IEC 60909-0:2016, rozdz. 9). \u0179r\u00f3d\u0142a przekszta\u0142tnikowe s\u0105 \u017ar\u00f3d\u0142ami pr\u0105dowymi bez zaniku \u2014 ich udzia\u0142 wchodzi do Ib w ca\u0142o\u015bci.",
              "result": {
                "ib_a": 14325.2260246
              },
              "substitution_latex": "14325.2",
              "title": "Pr\u0105d wy\u0142\u0105czeniowy symetryczny"
            },
            {
              "formula_latex": "i_{DC} = \\sqrt{2} \\cdot I_{k}'' \\cdot e^{-2 \\pi f \\, t_b \\, R/X}",
              "inputs": {
                "f_hz": 50.0,
                "ikss_a": 14325.2260246,
                "rx_ratio": 0.0208989990317,
                "tb_s": 0.1,
                "wspolczynnik_zaniku": 0.518631629146,
                "wykladnik": 0.656561418254
              },
              "key": "iDC",
              "notes": "Ik'' cz\u0119\u015bci sieci nios\u0105cej sk\u0142adow\u0105 nieokresow\u0105 (sie\u0107 zasilaj\u0105ca i maszyny wiruj\u0105ce); \u017ar\u00f3d\u0142a przekszta\u0142tnikowe nie maj\u0105 sk\u0142adowej nieokresowej (IEC 60909-0:2016). R/X \u2014 ten sam stosunek p\u0119tli zwarcia co we wsp\u00f3\u0142czynniku \u03ba.",
              "result": {
                "i_dc_a": 10506.9213147
              },
              "substitution_latex": "\\sqrt{2} \\cdot 14325.2 \\cdot e^{-2 \\pi \\cdot 50 \\cdot 0.1 \\cdot 0.020899}",
              "title": "Sk\u0142adowa nieokresowa pr\u0105du zwarciowego w chwili t_b"
            },
            {
              "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
              "inputs": {
                "ikss_a": 14325.2260246,
                "m_factor": 0.162855747211,
                "n_factor": 1.0
              },
              "key": "Ith",
              "notes": null,
              "result": {
                "ith_a": 15447.7205647
              },
              "substitution_latex": "14325.2 \\cdot \\sqrt{0.162856 + 1}",
              "title": "Pr\u0105d zast\u0119pczy cieplny"
            },
            {
              "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
              "inputs": {
                "ikss_a": 14325.2260246,
                "un_v": 400.0
              },
              "key": "Sk",
              "notes": null,
              "result": {
                "sk_mva": 9.9248077218
              },
              "substitution_latex": "\\sqrt{3} \\cdot 400 \\cdot 14325.2 / 10^6",
              "title": "Moc zwarciowa"
            }
          ]
        },
        "un_kv": 0.4,
        "verification": {
          "icw_ka": 25.0,
          "ikss_max_ka": 15.833,
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
          "ib_ka": 9.467,
          "ikss_ka": 9.467,
          "ip_ka": 16.584,
          "ith_ka": 9.5,
          "kappa": 1.239,
          "rx_ratio": 0.5,
          "sk_mva": 245.97,
          "white_box_trace": [
            {
              "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
              "inputs": {
                "branch_id": "sr/branch/tr",
                "c_max": 1.05,
                "s_rt_mva": 0.63,
                "u_rt_hv_kv": 15.0,
                "u_rt_lv_kv": 0.4,
                "x_t_ohm_hv": 21.4285714286,
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
              "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.06}",
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
                "ikss_a": 9467.28315676
              },
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
              "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500002}",
              "title": "Wsp\u00f3\u0142czynnik udaru"
            },
            {
              "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
              "inputs": {
                "ikss_a": 9467.28315676,
                "kappa": 1.23866591694
              },
              "key": "Ip",
              "notes": null,
              "result": {
                "ip_a": 16584.2009783
              },
              "substitution_latex": "1.23867 \\cdot \\sqrt{2} \\cdot 9467.28",
              "title": "Pr\u0105d udarowy"
            },
            {
              "formula_latex": "I_b = I_{k}''",
              "inputs": {
                "ikss_a": 9467.28315676,
                "przypadek": "odlegle_od_generatora"
              },
              "key": "Ib",
              "notes": "Zwarcie odleg\u0142e od generatora (brak maszyn wiruj\u0105cych w sieci): sk\u0142adowa okresowa nie zanika, Ib = Ik'' (IEC 60909-0:2016, rozdz. 9). \u0179r\u00f3d\u0142a przekszta\u0142tnikowe s\u0105 \u017ar\u00f3d\u0142ami pr\u0105dowymi bez zaniku \u2014 ich udzia\u0142 wchodzi do Ib w ca\u0142o\u015bci.",
              "result": {
                "ib_a": 9467.28315676
              },
              "substitution_latex": "9467.28",
              "title": "Pr\u0105d wy\u0142\u0105czeniowy symetryczny"
            },
            {
              "formula_latex": "i_{DC} = \\sqrt{2} \\cdot I_{k}'' \\cdot e^{-2 \\pi f \\, t_b \\, R/X}",
              "inputs": {
                "f_hz": 50.0,
                "ikss_a": 9467.28315676,
                "rx_ratio": 0.5000025,
                "tb_s": 0.1,
                "wspolczynnik_zaniku": 1.50689891918e-07,
                "wykladnik": 15.7080418078
              },
              "key": "iDC",
              "notes": "Ik'' cz\u0119\u015bci sieci nios\u0105cej sk\u0142adow\u0105 nieokresow\u0105 (sie\u0107 zasilaj\u0105ca i maszyny wiruj\u0105ce); \u017ar\u00f3d\u0142a przekszta\u0142tnikowe nie maj\u0105 sk\u0142adowej nieokresowej (IEC 60909-0:2016). R/X \u2014 ten sam stosunek p\u0119tli zwarcia co we wsp\u00f3\u0142czynniku \u03ba.",
              "result": {
                "i_dc_a": 0.00201755083335
              },
              "substitution_latex": "\\sqrt{2} \\cdot 9467.28 \\cdot e^{-2 \\pi \\cdot 50 \\cdot 0.1 \\cdot 0.500002}",
              "title": "Sk\u0142adowa nieokresowa pr\u0105du zwarciowego w chwili t_b"
            },
            {
              "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
              "inputs": {
                "ikss_a": 9467.28315676,
                "m_factor": 0.00697987437408,
                "n_factor": 1.0
              },
              "key": "Ith",
              "notes": null,
              "result": {
                "ith_a": 9500.26592649
              },
              "substitution_latex": "9467.28 \\cdot \\sqrt{0.00697987 + 1}",
              "title": "Pr\u0105d zast\u0119pczy cieplny"
            },
            {
              "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
              "inputs": {
                "ikss_a": 9467.28315676,
                "un_v": 15000.0
              },
              "key": "Sk",
              "notes": null,
              "result": {
                "sk_mva": 245.967231557
              },
              "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 9467.28 / 10^6",
              "title": "Moc zwarciowa"
            }
          ]
        },
        "min": {
          "c_factor": 1.0,
          "case_ref": "ZWARCIOWY_MIN",
          "ikss_ka": 8.607,
          "ith_ka": 8.637,
          "kappa": 1.239,
          "sk_mva": 223.61,
          "white_box_trace": [
            {
              "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
              "inputs": {
                "branch_id": "sr/branch/tr",
                "c_max": 1.05,
                "s_rt_mva": 0.63,
                "u_rt_hv_kv": 15.0,
                "u_rt_lv_kv": 0.4,
                "x_t_ohm_hv": 21.4285714286,
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
              "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.06}",
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
              "substitution_latex": "\\left(0.450002 + j 0.9\\right)",
              "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
            },
            {
              "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
              "inputs": {
                "c_factor": 1.0,
                "un_v": 15000.0,
                "voltage_factor": 0.57735026919,
                "z_equiv_abs_ohm": 1.00623159611
              },
              "key": "Ikss",
              "notes": null,
              "result": {
                "ikss_a": 8606.6210516
              },
              "substitution_latex": "\\frac{1 \\cdot 15000 \\cdot 0.57735}{1.00623}",
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
              "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500002}",
              "title": "Wsp\u00f3\u0142czynnik udaru"
            },
            {
              "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
              "inputs": {
                "ikss_a": 8606.6210516,
                "kappa": 1.23866591694
              },
              "key": "Ip",
              "notes": null,
              "result": {
                "ip_a": 15076.5463439
              },
              "substitution_latex": "1.23867 \\cdot \\sqrt{2} \\cdot 8606.62",
              "title": "Pr\u0105d udarowy"
            },
            {
              "formula_latex": "I_b = I_{k}''",
              "inputs": {
                "ikss_a": 8606.6210516,
                "przypadek": "odlegle_od_generatora"
              },
              "key": "Ib",
              "notes": "Zwarcie odleg\u0142e od generatora (brak maszyn wiruj\u0105cych w sieci): sk\u0142adowa okresowa nie zanika, Ib = Ik'' (IEC 60909-0:2016, rozdz. 9). \u0179r\u00f3d\u0142a przekszta\u0142tnikowe s\u0105 \u017ar\u00f3d\u0142ami pr\u0105dowymi bez zaniku \u2014 ich udzia\u0142 wchodzi do Ib w ca\u0142o\u015bci.",
              "result": {
                "ib_a": 8606.6210516
              },
              "substitution_latex": "8606.62",
              "title": "Pr\u0105d wy\u0142\u0105czeniowy symetryczny"
            },
            {
              "formula_latex": "i_{DC} = \\sqrt{2} \\cdot I_{k}'' \\cdot e^{-2 \\pi f \\, t_b \\, R/X}",
              "inputs": {
                "f_hz": 50.0,
                "ikss_a": 8606.6210516,
                "rx_ratio": 0.5000025,
                "tb_s": 0.1,
                "wspolczynnik_zaniku": 1.50689891918e-07,
                "wykladnik": 15.7080418078
              },
              "key": "iDC",
              "notes": "Ik'' cz\u0119\u015bci sieci nios\u0105cej sk\u0142adow\u0105 nieokresow\u0105 (sie\u0107 zasilaj\u0105ca i maszyny wiruj\u0105ce); \u017ar\u00f3d\u0142a przekszta\u0142tnikowe nie maj\u0105 sk\u0142adowej nieokresowej (IEC 60909-0:2016). R/X \u2014 ten sam stosunek p\u0119tli zwarcia co we wsp\u00f3\u0142czynniku \u03ba.",
              "result": {
                "i_dc_a": 0.00183413712122
              },
              "substitution_latex": "\\sqrt{2} \\cdot 8606.62 \\cdot e^{-2 \\pi \\cdot 50 \\cdot 0.1 \\cdot 0.500002}",
              "title": "Sk\u0142adowa nieokresowa pr\u0105du zwarciowego w chwili t_b"
            },
            {
              "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
              "inputs": {
                "ikss_a": 8606.6210516,
                "m_factor": 0.00697987437408,
                "n_factor": 1.0
              },
              "key": "Ith",
              "notes": null,
              "result": {
                "ith_a": 8636.60538772
              },
              "substitution_latex": "8606.62 \\cdot \\sqrt{0.00697987 + 1}",
              "title": "Pr\u0105d zast\u0119pczy cieplny"
            },
            {
              "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
              "inputs": {
                "ikss_a": 8606.6210516,
                "un_v": 15000.0
              },
              "key": "Sk",
              "notes": null,
              "result": {
                "sk_mva": 223.606574143
              },
              "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 8606.62 / 10^6",
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
        "idyn_ka": 52.5,
        "max": {
          "c_factor": 1.05,
          "case_ref": "ZWARCIOWY_MAKS",
          "ib_ka": 15.833,
          "ikss_ka": 15.833,
          "ip_ka": 43.449,
          "ith_ka": 17.074,
          "kappa": 1.94,
          "rx_ratio": 0.0209,
          "sk_mva": 10.97,
          "white_box_trace": [
            {
              "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
              "inputs": {
                "branch_id": "sr/branch/tr",
                "c_max": 1.05,
                "s_rt_mva": 0.63,
                "u_rt_hv_kv": 15.0,
                "u_rt_lv_kv": 0.4,
                "x_t_ohm_hv": 21.4285714286,
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
              "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.06}",
              "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr"
            },
            {
              "formula_latex": "Z_k = Z_1",
              "inputs": {
                "fault_node_id": "NN_BUS",
                "short_circuit_type": "3F",
                "z1_ohm": {
                  "im": 0.0153118146718,
                  "re": 0.0003200016
                },
                "z2_ohm": {
                  "im": 0.0153118146718,
                  "re": 0.0003200016
                }
              },
              "key": "Zk",
              "notes": null,
              "result": {
                "r_ohm": 0.0003200016,
                "x_ohm": 0.0153118146718,
                "z_equiv_abs_ohm": 0.0153151581633,
                "z_equiv_ohm": {
                  "im": 0.0153118146718,
                  "re": 0.0003200016
                }
              },
              "substitution_latex": "\\left(0.000320002 + j 0.0153118\\right)",
              "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
            },
            {
              "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
              "inputs": {
                "c_factor": 1.05,
                "un_v": 400.0,
                "voltage_factor": 0.57735026919,
                "z_equiv_abs_ohm": 0.0153151581633
              },
              "key": "Ikss",
              "notes": null,
              "result": {
                "ikss_a": 15833.1445535
              },
              "substitution_latex": "\\frac{1.05 \\cdot 400 \\cdot 0.57735}{0.0153152}",
              "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
            },
            {
              "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
              "inputs": {
                "r_ohm": 0.0003200016,
                "rx_ratio": 0.0208989990317,
                "x_ohm": 0.0153118146718
              },
              "key": "kappa",
              "notes": null,
              "result": {
                "kappa": 1.94044345901
              },
              "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.020899}",
              "title": "Wsp\u00f3\u0142czynnik udaru"
            },
            {
              "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
              "inputs": {
                "ikss_a": 15833.1445535,
                "kappa": 1.94044345901
              },
              "key": "Ip",
              "notes": null,
              "result": {
                "ip_a": 43449.3383486
              },
              "substitution_latex": "1.94044 \\cdot \\sqrt{2} \\cdot 15833.1",
              "title": "Pr\u0105d udarowy"
            },
            {
              "formula_latex": "I_b = I_{k}''",
              "inputs": {
                "ikss_a": 15833.1445535,
                "przypadek": "odlegle_od_generatora"
              },
              "key": "Ib",
              "notes": "Zwarcie odleg\u0142e od generatora (brak maszyn wiruj\u0105cych w sieci): sk\u0142adowa okresowa nie zanika, Ib = Ik'' (IEC 60909-0:2016, rozdz. 9). \u0179r\u00f3d\u0142a przekszta\u0142tnikowe s\u0105 \u017ar\u00f3d\u0142ami pr\u0105dowymi bez zaniku \u2014 ich udzia\u0142 wchodzi do Ib w ca\u0142o\u015bci.",
              "result": {
                "ib_a": 15833.1445535
              },
              "substitution_latex": "15833.1",
              "title": "Pr\u0105d wy\u0142\u0105czeniowy symetryczny"
            },
            {
              "formula_latex": "i_{DC} = \\sqrt{2} \\cdot I_{k}'' \\cdot e^{-2 \\pi f \\, t_b \\, R/X}",
              "inputs": {
                "f_hz": 50.0,
                "ikss_a": 15833.1445535,
                "rx_ratio": 0.0208989990317,
                "tb_s": 0.1,
                "wspolczynnik_zaniku": 0.518631629146,
                "wykladnik": 0.656561418254
              },
              "key": "iDC",
              "notes": "Ik'' cz\u0119\u015bci sieci nios\u0105cej sk\u0142adow\u0105 nieokresow\u0105 (sie\u0107 zasilaj\u0105ca i maszyny wiruj\u0105ce); \u017ar\u00f3d\u0142a przekszta\u0142tnikowe nie maj\u0105 sk\u0142adowej nieokresowej (IEC 60909-0:2016). R/X \u2014 ten sam stosunek p\u0119tli zwarcia co we wsp\u00f3\u0142czynniku \u03ba.",
              "result": {
                "i_dc_a": 11612.913032
              },
              "substitution_latex": "\\sqrt{2} \\cdot 15833.1 \\cdot e^{-2 \\pi \\cdot 50 \\cdot 0.1 \\cdot 0.020899}",
              "title": "Sk\u0142adowa nieokresowa pr\u0105du zwarciowego w chwili t_b"
            },
            {
              "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
              "inputs": {
                "ikss_a": 15833.1445535,
                "m_factor": 0.162855747211,
                "n_factor": 1.0
              },
              "key": "Ith",
              "notes": null,
              "result": {
                "ith_a": 17073.7964136
              },
              "substitution_latex": "15833.1 \\cdot \\sqrt{0.162856 + 1}",
              "title": "Pr\u0105d zast\u0119pczy cieplny"
            },
            {
              "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
              "inputs": {
                "ikss_a": 15833.1445535,
                "un_v": 400.0
              },
              "key": "Sk",
              "notes": null,
              "result": {
                "sk_mva": 10.9695243241
              },
              "substitution_latex": "\\sqrt{3} \\cdot 400 \\cdot 15833.1 / 10^6",
              "title": "Moc zwarciowa"
            }
          ]
        },
        "min": {
          "c_factor": 0.95,
          "case_ref": "ZWARCIOWY_MIN",
          "ikss_ka": 14.325,
          "ith_ka": 15.448,
          "kappa": 1.94,
          "sk_mva": 9.92,
          "white_box_trace": [
            {
              "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
              "inputs": {
                "branch_id": "sr/branch/tr",
                "c_max": 1.05,
                "s_rt_mva": 0.63,
                "u_rt_hv_kv": 15.0,
                "u_rt_lv_kv": 0.4,
                "x_t_ohm_hv": 21.4285714286,
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
              "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.06}",
              "title": "Korekcja impedancji transformatora sieciowego sr/branch/tr"
            },
            {
              "formula_latex": "Z_k = Z_1",
              "inputs": {
                "fault_node_id": "NN_BUS",
                "short_circuit_type": "3F",
                "z1_ohm": {
                  "im": 0.0153118146718,
                  "re": 0.0003200016
                },
                "z2_ohm": {
                  "im": 0.0153118146718,
                  "re": 0.0003200016
                }
              },
              "key": "Zk",
              "notes": null,
              "result": {
                "r_ohm": 0.0003200016,
                "x_ohm": 0.0153118146718,
                "z_equiv_abs_ohm": 0.0153151581633,
                "z_equiv_ohm": {
                  "im": 0.0153118146718,
                  "re": 0.0003200016
                }
              },
              "substitution_latex": "\\left(0.000320002 + j 0.0153118\\right)",
              "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
            },
            {
              "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
              "inputs": {
                "c_factor": 0.95,
                "un_v": 400.0,
                "voltage_factor": 0.57735026919,
                "z_equiv_abs_ohm": 0.0153151581633
              },
              "key": "Ikss",
              "notes": null,
              "result": {
                "ikss_a": 14325.2260246
              },
              "substitution_latex": "\\frac{0.95 \\cdot 400 \\cdot 0.57735}{0.0153152}",
              "title": "Pr\u0105d zwarciowy pocz\u0105tkowy symetryczny"
            },
            {
              "formula_latex": "\\kappa = 1.02 + 0.98 \\cdot e^{-3 R/X}",
              "inputs": {
                "r_ohm": 0.0003200016,
                "rx_ratio": 0.0208989990317,
                "x_ohm": 0.0153118146718
              },
              "key": "kappa",
              "notes": null,
              "result": {
                "kappa": 1.94044345901
              },
              "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.020899}",
              "title": "Wsp\u00f3\u0142czynnik udaru"
            },
            {
              "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
              "inputs": {
                "ikss_a": 14325.2260246,
                "kappa": 1.94044345901
              },
              "key": "Ip",
              "notes": null,
              "result": {
                "ip_a": 39311.3061249
              },
              "substitution_latex": "1.94044 \\cdot \\sqrt{2} \\cdot 14325.2",
              "title": "Pr\u0105d udarowy"
            },
            {
              "formula_latex": "I_b = I_{k}''",
              "inputs": {
                "ikss_a": 14325.2260246,
                "przypadek": "odlegle_od_generatora"
              },
              "key": "Ib",
              "notes": "Zwarcie odleg\u0142e od generatora (brak maszyn wiruj\u0105cych w sieci): sk\u0142adowa okresowa nie zanika, Ib = Ik'' (IEC 60909-0:2016, rozdz. 9). \u0179r\u00f3d\u0142a przekszta\u0142tnikowe s\u0105 \u017ar\u00f3d\u0142ami pr\u0105dowymi bez zaniku \u2014 ich udzia\u0142 wchodzi do Ib w ca\u0142o\u015bci.",
              "result": {
                "ib_a": 14325.2260246
              },
              "substitution_latex": "14325.2",
              "title": "Pr\u0105d wy\u0142\u0105czeniowy symetryczny"
            },
            {
              "formula_latex": "i_{DC} = \\sqrt{2} \\cdot I_{k}'' \\cdot e^{-2 \\pi f \\, t_b \\, R/X}",
              "inputs": {
                "f_hz": 50.0,
                "ikss_a": 14325.2260246,
                "rx_ratio": 0.0208989990317,
                "tb_s": 0.1,
                "wspolczynnik_zaniku": 0.518631629146,
                "wykladnik": 0.656561418254
              },
              "key": "iDC",
              "notes": "Ik'' cz\u0119\u015bci sieci nios\u0105cej sk\u0142adow\u0105 nieokresow\u0105 (sie\u0107 zasilaj\u0105ca i maszyny wiruj\u0105ce); \u017ar\u00f3d\u0142a przekszta\u0142tnikowe nie maj\u0105 sk\u0142adowej nieokresowej (IEC 60909-0:2016). R/X \u2014 ten sam stosunek p\u0119tli zwarcia co we wsp\u00f3\u0142czynniku \u03ba.",
              "result": {
                "i_dc_a": 10506.9213147
              },
              "substitution_latex": "\\sqrt{2} \\cdot 14325.2 \\cdot e^{-2 \\pi \\cdot 50 \\cdot 0.1 \\cdot 0.020899}",
              "title": "Sk\u0142adowa nieokresowa pr\u0105du zwarciowego w chwili t_b"
            },
            {
              "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
              "inputs": {
                "ikss_a": 14325.2260246,
                "m_factor": 0.162855747211,
                "n_factor": 1.0
              },
              "key": "Ith",
              "notes": null,
              "result": {
                "ith_a": 15447.7205647
              },
              "substitution_latex": "14325.2 \\cdot \\sqrt{0.162856 + 1}",
              "title": "Pr\u0105d zast\u0119pczy cieplny"
            },
            {
              "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
              "inputs": {
                "ikss_a": 14325.2260246,
                "un_v": 400.0
              },
              "key": "Sk",
              "notes": null,
              "result": {
                "sk_mva": 9.9248077218
              },
              "substitution_latex": "\\sqrt{3} \\cdot 400 \\cdot 14325.2 / 10^6",
              "title": "Moc zwarciowa"
            }
          ]
        },
        "un_kv": 0.4,
        "verification": {
          "icw_ka": 25.0,
          "ikss_max_ka": 15.833,
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
          "ib_ka": 9.467,
          "ikss_ka": 9.467,
          "ip_ka": 16.584,
          "ith_ka": 9.5,
          "kappa": 1.239,
          "rx_ratio": 0.5,
          "sk_mva": 245.97,
          "white_box_trace": [
            {
              "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
              "inputs": {
                "branch_id": "sr/branch/tr",
                "c_max": 1.05,
                "s_rt_mva": 0.63,
                "u_rt_hv_kv": 15.0,
                "u_rt_lv_kv": 0.4,
                "x_t_ohm_hv": 21.4285714286,
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
              "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.06}",
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
                "ikss_a": 9467.28315676
              },
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
              "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500003}",
              "title": "Wsp\u00f3\u0142czynnik udaru"
            },
            {
              "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
              "inputs": {
                "ikss_a": 9467.28315676,
                "kappa": 1.23866591694
              },
              "key": "Ip",
              "notes": null,
              "result": {
                "ip_a": 16584.2009783
              },
              "substitution_latex": "1.23867 \\cdot \\sqrt{2} \\cdot 9467.28",
              "title": "Pr\u0105d udarowy"
            },
            {
              "formula_latex": "I_b = I_{k}''",
              "inputs": {
                "ikss_a": 9467.28315676,
                "przypadek": "odlegle_od_generatora"
              },
              "key": "Ib",
              "notes": "Zwarcie odleg\u0142e od generatora (brak maszyn wiruj\u0105cych w sieci): sk\u0142adowa okresowa nie zanika, Ib = Ik'' (IEC 60909-0:2016, rozdz. 9). \u0179r\u00f3d\u0142a przekszta\u0142tnikowe s\u0105 \u017ar\u00f3d\u0142ami pr\u0105dowymi bez zaniku \u2014 ich udzia\u0142 wchodzi do Ib w ca\u0142o\u015bci.",
              "result": {
                "ib_a": 9467.28315676
              },
              "substitution_latex": "9467.28",
              "title": "Pr\u0105d wy\u0142\u0105czeniowy symetryczny"
            },
            {
              "formula_latex": "i_{DC} = \\sqrt{2} \\cdot I_{k}'' \\cdot e^{-2 \\pi f \\, t_b \\, R/X}",
              "inputs": {
                "f_hz": 50.0,
                "ikss_a": 9467.28315676,
                "rx_ratio": 0.5000025,
                "tb_s": 0.1,
                "wspolczynnik_zaniku": 1.50689891918e-07,
                "wykladnik": 15.7080418078
              },
              "key": "iDC",
              "notes": "Ik'' cz\u0119\u015bci sieci nios\u0105cej sk\u0142adow\u0105 nieokresow\u0105 (sie\u0107 zasilaj\u0105ca i maszyny wiruj\u0105ce); \u017ar\u00f3d\u0142a przekszta\u0142tnikowe nie maj\u0105 sk\u0142adowej nieokresowej (IEC 60909-0:2016). R/X \u2014 ten sam stosunek p\u0119tli zwarcia co we wsp\u00f3\u0142czynniku \u03ba.",
              "result": {
                "i_dc_a": 0.00201755083335
              },
              "substitution_latex": "\\sqrt{2} \\cdot 9467.28 \\cdot e^{-2 \\pi \\cdot 50 \\cdot 0.1 \\cdot 0.500003}",
              "title": "Sk\u0142adowa nieokresowa pr\u0105du zwarciowego w chwili t_b"
            },
            {
              "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
              "inputs": {
                "ikss_a": 9467.28315676,
                "m_factor": 0.00697987437408,
                "n_factor": 1.0
              },
              "key": "Ith",
              "notes": null,
              "result": {
                "ith_a": 9500.26592649
              },
              "substitution_latex": "9467.28 \\cdot \\sqrt{0.00697987 + 1}",
              "title": "Pr\u0105d zast\u0119pczy cieplny"
            },
            {
              "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
              "inputs": {
                "ikss_a": 9467.28315676,
                "un_v": 15000.0
              },
              "key": "Sk",
              "notes": null,
              "result": {
                "sk_mva": 245.967231557
              },
              "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 9467.28 / 10^6",
              "title": "Moc zwarciowa"
            }
          ]
        },
        "min": {
          "c_factor": 1.0,
          "case_ref": "ZWARCIOWY_MIN",
          "ikss_ka": 8.607,
          "ith_ka": 8.637,
          "kappa": 1.239,
          "sk_mva": 223.61,
          "white_box_trace": [
            {
              "formula_latex": "K_T = 0.95 \\cdot \\frac{c_{max}}{1 + 0.6 \\cdot x_T}",
              "inputs": {
                "branch_id": "sr/branch/tr",
                "c_max": 1.05,
                "s_rt_mva": 0.63,
                "u_rt_hv_kv": 15.0,
                "u_rt_lv_kv": 0.4,
                "x_t_ohm_hv": 21.4285714286,
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
              "substitution_latex": "0.95 \\cdot \\frac{1.05}{1 + 0.6 \\cdot 0.06}",
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
              "substitution_latex": "\\left(0.450002 + j 0.9\\right)",
              "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
            },
            {
              "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
              "inputs": {
                "c_factor": 1.0,
                "un_v": 15000.0,
                "voltage_factor": 0.57735026919,
                "z_equiv_abs_ohm": 1.00623159611
              },
              "key": "Ikss",
              "notes": null,
              "result": {
                "ikss_a": 8606.6210516
              },
              "substitution_latex": "\\frac{1 \\cdot 15000 \\cdot 0.57735}{1.00623}",
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
              "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500003}",
              "title": "Wsp\u00f3\u0142czynnik udaru"
            },
            {
              "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
              "inputs": {
                "ikss_a": 8606.6210516,
                "kappa": 1.23866591694
              },
              "key": "Ip",
              "notes": null,
              "result": {
                "ip_a": 15076.5463439
              },
              "substitution_latex": "1.23867 \\cdot \\sqrt{2} \\cdot 8606.62",
              "title": "Pr\u0105d udarowy"
            },
            {
              "formula_latex": "I_b = I_{k}''",
              "inputs": {
                "ikss_a": 8606.6210516,
                "przypadek": "odlegle_od_generatora"
              },
              "key": "Ib",
              "notes": "Zwarcie odleg\u0142e od generatora (brak maszyn wiruj\u0105cych w sieci): sk\u0142adowa okresowa nie zanika, Ib = Ik'' (IEC 60909-0:2016, rozdz. 9). \u0179r\u00f3d\u0142a przekszta\u0142tnikowe s\u0105 \u017ar\u00f3d\u0142ami pr\u0105dowymi bez zaniku \u2014 ich udzia\u0142 wchodzi do Ib w ca\u0142o\u015bci.",
              "result": {
                "ib_a": 8606.6210516
              },
              "substitution_latex": "8606.62",
              "title": "Pr\u0105d wy\u0142\u0105czeniowy symetryczny"
            },
            {
              "formula_latex": "i_{DC} = \\sqrt{2} \\cdot I_{k}'' \\cdot e^{-2 \\pi f \\, t_b \\, R/X}",
              "inputs": {
                "f_hz": 50.0,
                "ikss_a": 8606.6210516,
                "rx_ratio": 0.5000025,
                "tb_s": 0.1,
                "wspolczynnik_zaniku": 1.50689891918e-07,
                "wykladnik": 15.7080418078
              },
              "key": "iDC",
              "notes": "Ik'' cz\u0119\u015bci sieci nios\u0105cej sk\u0142adow\u0105 nieokresow\u0105 (sie\u0107 zasilaj\u0105ca i maszyny wiruj\u0105ce); \u017ar\u00f3d\u0142a przekszta\u0142tnikowe nie maj\u0105 sk\u0142adowej nieokresowej (IEC 60909-0:2016). R/X \u2014 ten sam stosunek p\u0119tli zwarcia co we wsp\u00f3\u0142czynniku \u03ba.",
              "result": {
                "i_dc_a": 0.00183413712122
              },
              "substitution_latex": "\\sqrt{2} \\cdot 8606.62 \\cdot e^{-2 \\pi \\cdot 50 \\cdot 0.1 \\cdot 0.500003}",
              "title": "Sk\u0142adowa nieokresowa pr\u0105du zwarciowego w chwili t_b"
            },
            {
              "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
              "inputs": {
                "ikss_a": 8606.6210516,
                "m_factor": 0.00697987437408,
                "n_factor": 1.0
              },
              "key": "Ith",
              "notes": null,
              "result": {
                "ith_a": 8636.60538772
              },
              "substitution_latex": "8606.62 \\cdot \\sqrt{0.00697987 + 1}",
              "title": "Pr\u0105d zast\u0119pczy cieplny"
            },
            {
              "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
              "inputs": {
                "ikss_a": 8606.6210516,
                "un_v": 15000.0
              },
              "key": "Sk",
              "notes": null,
              "result": {
                "sk_mva": 223.606574143
              },
              "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 8606.62 / 10^6",
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
        "idyn_ka": 62.5,
        "max": {
          "c_factor": 1.1,
          "case_ref": "ZWARCIOWY_MAKS",
          "ib_ka": 9.467,
          "ikss_ka": 9.467,
          "ip_ka": 16.584,
          "ith_ka": 9.5,
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
                "ikss_a": 9467.28315676
              },
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
              "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500003}",
              "title": "Wsp\u00f3\u0142czynnik udaru"
            },
            {
              "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
              "inputs": {
                "ikss_a": 9467.28315676,
                "kappa": 1.23866591694
              },
              "key": "Ip",
              "notes": null,
              "result": {
                "ip_a": 16584.2009783
              },
              "substitution_latex": "1.23867 \\cdot \\sqrt{2} \\cdot 9467.28",
              "title": "Pr\u0105d udarowy"
            },
            {
              "formula_latex": "I_b = I_{k}''",
              "inputs": {
                "ikss_a": 9467.28315676,
                "przypadek": "odlegle_od_generatora"
              },
              "key": "Ib",
              "notes": "Zwarcie odleg\u0142e od generatora (brak maszyn wiruj\u0105cych w sieci): sk\u0142adowa okresowa nie zanika, Ib = Ik'' (IEC 60909-0:2016, rozdz. 9). \u0179r\u00f3d\u0142a przekszta\u0142tnikowe s\u0105 \u017ar\u00f3d\u0142ami pr\u0105dowymi bez zaniku \u2014 ich udzia\u0142 wchodzi do Ib w ca\u0142o\u015bci.",
              "result": {
                "ib_a": 9467.28315676
              },
              "substitution_latex": "9467.28",
              "title": "Pr\u0105d wy\u0142\u0105czeniowy symetryczny"
            },
            {
              "formula_latex": "i_{DC} = \\sqrt{2} \\cdot I_{k}'' \\cdot e^{-2 \\pi f \\, t_b \\, R/X}",
              "inputs": {
                "f_hz": 50.0,
                "ikss_a": 9467.28315676,
                "rx_ratio": 0.5000025,
                "tb_s": 0.1,
                "wspolczynnik_zaniku": 1.50689891918e-07,
                "wykladnik": 15.7080418078
              },
              "key": "iDC",
              "notes": "Ik'' cz\u0119\u015bci sieci nios\u0105cej sk\u0142adow\u0105 nieokresow\u0105 (sie\u0107 zasilaj\u0105ca i maszyny wiruj\u0105ce); \u017ar\u00f3d\u0142a przekszta\u0142tnikowe nie maj\u0105 sk\u0142adowej nieokresowej (IEC 60909-0:2016). R/X \u2014 ten sam stosunek p\u0119tli zwarcia co we wsp\u00f3\u0142czynniku \u03ba.",
              "result": {
                "i_dc_a": 0.00201755083335
              },
              "substitution_latex": "\\sqrt{2} \\cdot 9467.28 \\cdot e^{-2 \\pi \\cdot 50 \\cdot 0.1 \\cdot 0.500003}",
              "title": "Sk\u0142adowa nieokresowa pr\u0105du zwarciowego w chwili t_b"
            },
            {
              "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
              "inputs": {
                "ikss_a": 9467.28315676,
                "m_factor": 0.00697987437408,
                "n_factor": 1.0
              },
              "key": "Ith",
              "notes": null,
              "result": {
                "ith_a": 9500.26592649
              },
              "substitution_latex": "9467.28 \\cdot \\sqrt{0.00697987 + 1}",
              "title": "Pr\u0105d zast\u0119pczy cieplny"
            },
            {
              "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
              "inputs": {
                "ikss_a": 9467.28315676,
                "un_v": 15000.0
              },
              "key": "Sk",
              "notes": null,
              "result": {
                "sk_mva": 245.967231557
              },
              "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 9467.28 / 10^6",
              "title": "Moc zwarciowa"
            }
          ]
        },
        "min": {
          "c_factor": 1.0,
          "case_ref": "ZWARCIOWY_MIN",
          "ikss_ka": 8.607,
          "ith_ka": 8.637,
          "kappa": 1.239,
          "sk_mva": 223.61,
          "white_box_trace": [
            {
              "formula_latex": "Z_k = Z_1",
              "inputs": {
                "fault_node_id": "ZKSN",
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
              "substitution_latex": "\\left(0.450002 + j 0.9\\right)",
              "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
            },
            {
              "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
              "inputs": {
                "c_factor": 1.0,
                "un_v": 15000.0,
                "voltage_factor": 0.57735026919,
                "z_equiv_abs_ohm": 1.00623159611
              },
              "key": "Ikss",
              "notes": null,
              "result": {
                "ikss_a": 8606.6210516
              },
              "substitution_latex": "\\frac{1 \\cdot 15000 \\cdot 0.57735}{1.00623}",
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
              "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500003}",
              "title": "Wsp\u00f3\u0142czynnik udaru"
            },
            {
              "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
              "inputs": {
                "ikss_a": 8606.6210516,
                "kappa": 1.23866591694
              },
              "key": "Ip",
              "notes": null,
              "result": {
                "ip_a": 15076.5463439
              },
              "substitution_latex": "1.23867 \\cdot \\sqrt{2} \\cdot 8606.62",
              "title": "Pr\u0105d udarowy"
            },
            {
              "formula_latex": "I_b = I_{k}''",
              "inputs": {
                "ikss_a": 8606.6210516,
                "przypadek": "odlegle_od_generatora"
              },
              "key": "Ib",
              "notes": "Zwarcie odleg\u0142e od generatora (brak maszyn wiruj\u0105cych w sieci): sk\u0142adowa okresowa nie zanika, Ib = Ik'' (IEC 60909-0:2016, rozdz. 9). \u0179r\u00f3d\u0142a przekszta\u0142tnikowe s\u0105 \u017ar\u00f3d\u0142ami pr\u0105dowymi bez zaniku \u2014 ich udzia\u0142 wchodzi do Ib w ca\u0142o\u015bci.",
              "result": {
                "ib_a": 8606.6210516
              },
              "substitution_latex": "8606.62",
              "title": "Pr\u0105d wy\u0142\u0105czeniowy symetryczny"
            },
            {
              "formula_latex": "i_{DC} = \\sqrt{2} \\cdot I_{k}'' \\cdot e^{-2 \\pi f \\, t_b \\, R/X}",
              "inputs": {
                "f_hz": 50.0,
                "ikss_a": 8606.6210516,
                "rx_ratio": 0.5000025,
                "tb_s": 0.1,
                "wspolczynnik_zaniku": 1.50689891918e-07,
                "wykladnik": 15.7080418078
              },
              "key": "iDC",
              "notes": "Ik'' cz\u0119\u015bci sieci nios\u0105cej sk\u0142adow\u0105 nieokresow\u0105 (sie\u0107 zasilaj\u0105ca i maszyny wiruj\u0105ce); \u017ar\u00f3d\u0142a przekszta\u0142tnikowe nie maj\u0105 sk\u0142adowej nieokresowej (IEC 60909-0:2016). R/X \u2014 ten sam stosunek p\u0119tli zwarcia co we wsp\u00f3\u0142czynniku \u03ba.",
              "result": {
                "i_dc_a": 0.00183413712122
              },
              "substitution_latex": "\\sqrt{2} \\cdot 8606.62 \\cdot e^{-2 \\pi \\cdot 50 \\cdot 0.1 \\cdot 0.500003}",
              "title": "Sk\u0142adowa nieokresowa pr\u0105du zwarciowego w chwili t_b"
            },
            {
              "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
              "inputs": {
                "ikss_a": 8606.6210516,
                "m_factor": 0.00697987437408,
                "n_factor": 1.0
              },
              "key": "Ith",
              "notes": null,
              "result": {
                "ith_a": 8636.60538772
              },
              "substitution_latex": "8606.62 \\cdot \\sqrt{0.00697987 + 1}",
              "title": "Pr\u0105d zast\u0119pczy cieplny"
            },
            {
              "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
              "inputs": {
                "ikss_a": 8606.6210516,
                "un_v": 15000.0
              },
              "key": "Sk",
              "notes": null,
              "result": {
                "sk_mva": 223.606574143
              },
              "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 8606.62 / 10^6",
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
        "idyn_ka": 62.5,
        "max": {
          "c_factor": 1.1,
          "case_ref": "ZWARCIOWY_MAKS",
          "ib_ka": 9.467,
          "ikss_ka": 9.467,
          "ip_ka": 16.584,
          "ith_ka": 9.5,
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
                "ikss_a": 9467.28315676
              },
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
              "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500002}",
              "title": "Wsp\u00f3\u0142czynnik udaru"
            },
            {
              "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
              "inputs": {
                "ikss_a": 9467.28315676,
                "kappa": 1.23866591694
              },
              "key": "Ip",
              "notes": null,
              "result": {
                "ip_a": 16584.2009783
              },
              "substitution_latex": "1.23867 \\cdot \\sqrt{2} \\cdot 9467.28",
              "title": "Pr\u0105d udarowy"
            },
            {
              "formula_latex": "I_b = I_{k}''",
              "inputs": {
                "ikss_a": 9467.28315676,
                "przypadek": "odlegle_od_generatora"
              },
              "key": "Ib",
              "notes": "Zwarcie odleg\u0142e od generatora (brak maszyn wiruj\u0105cych w sieci): sk\u0142adowa okresowa nie zanika, Ib = Ik'' (IEC 60909-0:2016, rozdz. 9). \u0179r\u00f3d\u0142a przekszta\u0142tnikowe s\u0105 \u017ar\u00f3d\u0142ami pr\u0105dowymi bez zaniku \u2014 ich udzia\u0142 wchodzi do Ib w ca\u0142o\u015bci.",
              "result": {
                "ib_a": 9467.28315676
              },
              "substitution_latex": "9467.28",
              "title": "Pr\u0105d wy\u0142\u0105czeniowy symetryczny"
            },
            {
              "formula_latex": "i_{DC} = \\sqrt{2} \\cdot I_{k}'' \\cdot e^{-2 \\pi f \\, t_b \\, R/X}",
              "inputs": {
                "f_hz": 50.0,
                "ikss_a": 9467.28315676,
                "rx_ratio": 0.5000025,
                "tb_s": 0.1,
                "wspolczynnik_zaniku": 1.50689891918e-07,
                "wykladnik": 15.7080418078
              },
              "key": "iDC",
              "notes": "Ik'' cz\u0119\u015bci sieci nios\u0105cej sk\u0142adow\u0105 nieokresow\u0105 (sie\u0107 zasilaj\u0105ca i maszyny wiruj\u0105ce); \u017ar\u00f3d\u0142a przekszta\u0142tnikowe nie maj\u0105 sk\u0142adowej nieokresowej (IEC 60909-0:2016). R/X \u2014 ten sam stosunek p\u0119tli zwarcia co we wsp\u00f3\u0142czynniku \u03ba.",
              "result": {
                "i_dc_a": 0.00201755083335
              },
              "substitution_latex": "\\sqrt{2} \\cdot 9467.28 \\cdot e^{-2 \\pi \\cdot 50 \\cdot 0.1 \\cdot 0.500002}",
              "title": "Sk\u0142adowa nieokresowa pr\u0105du zwarciowego w chwili t_b"
            },
            {
              "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
              "inputs": {
                "ikss_a": 9467.28315676,
                "m_factor": 0.00697987437408,
                "n_factor": 1.0
              },
              "key": "Ith",
              "notes": null,
              "result": {
                "ith_a": 9500.26592649
              },
              "substitution_latex": "9467.28 \\cdot \\sqrt{0.00697987 + 1}",
              "title": "Pr\u0105d zast\u0119pczy cieplny"
            },
            {
              "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
              "inputs": {
                "ikss_a": 9467.28315676,
                "un_v": 15000.0
              },
              "key": "Sk",
              "notes": null,
              "result": {
                "sk_mva": 245.967231557
              },
              "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 9467.28 / 10^6",
              "title": "Moc zwarciowa"
            }
          ]
        },
        "min": {
          "c_factor": 1.0,
          "case_ref": "ZWARCIOWY_MIN",
          "ikss_ka": 8.607,
          "ith_ka": 8.637,
          "kappa": 1.239,
          "sk_mva": 223.61,
          "white_box_trace": [
            {
              "formula_latex": "Z_k = Z_1",
              "inputs": {
                "fault_node_id": "SEC_A",
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
              "substitution_latex": "\\left(0.450002 + j 0.9\\right)",
              "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
            },
            {
              "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
              "inputs": {
                "c_factor": 1.0,
                "un_v": 15000.0,
                "voltage_factor": 0.57735026919,
                "z_equiv_abs_ohm": 1.00623159611
              },
              "key": "Ikss",
              "notes": null,
              "result": {
                "ikss_a": 8606.6210516
              },
              "substitution_latex": "\\frac{1 \\cdot 15000 \\cdot 0.57735}{1.00623}",
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
              "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500002}",
              "title": "Wsp\u00f3\u0142czynnik udaru"
            },
            {
              "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
              "inputs": {
                "ikss_a": 8606.6210516,
                "kappa": 1.23866591694
              },
              "key": "Ip",
              "notes": null,
              "result": {
                "ip_a": 15076.5463439
              },
              "substitution_latex": "1.23867 \\cdot \\sqrt{2} \\cdot 8606.62",
              "title": "Pr\u0105d udarowy"
            },
            {
              "formula_latex": "I_b = I_{k}''",
              "inputs": {
                "ikss_a": 8606.6210516,
                "przypadek": "odlegle_od_generatora"
              },
              "key": "Ib",
              "notes": "Zwarcie odleg\u0142e od generatora (brak maszyn wiruj\u0105cych w sieci): sk\u0142adowa okresowa nie zanika, Ib = Ik'' (IEC 60909-0:2016, rozdz. 9). \u0179r\u00f3d\u0142a przekszta\u0142tnikowe s\u0105 \u017ar\u00f3d\u0142ami pr\u0105dowymi bez zaniku \u2014 ich udzia\u0142 wchodzi do Ib w ca\u0142o\u015bci.",
              "result": {
                "ib_a": 8606.6210516
              },
              "substitution_latex": "8606.62",
              "title": "Pr\u0105d wy\u0142\u0105czeniowy symetryczny"
            },
            {
              "formula_latex": "i_{DC} = \\sqrt{2} \\cdot I_{k}'' \\cdot e^{-2 \\pi f \\, t_b \\, R/X}",
              "inputs": {
                "f_hz": 50.0,
                "ikss_a": 8606.6210516,
                "rx_ratio": 0.5000025,
                "tb_s": 0.1,
                "wspolczynnik_zaniku": 1.50689891918e-07,
                "wykladnik": 15.7080418078
              },
              "key": "iDC",
              "notes": "Ik'' cz\u0119\u015bci sieci nios\u0105cej sk\u0142adow\u0105 nieokresow\u0105 (sie\u0107 zasilaj\u0105ca i maszyny wiruj\u0105ce); \u017ar\u00f3d\u0142a przekszta\u0142tnikowe nie maj\u0105 sk\u0142adowej nieokresowej (IEC 60909-0:2016). R/X \u2014 ten sam stosunek p\u0119tli zwarcia co we wsp\u00f3\u0142czynniku \u03ba.",
              "result": {
                "i_dc_a": 0.00183413712122
              },
              "substitution_latex": "\\sqrt{2} \\cdot 8606.62 \\cdot e^{-2 \\pi \\cdot 50 \\cdot 0.1 \\cdot 0.500002}",
              "title": "Sk\u0142adowa nieokresowa pr\u0105du zwarciowego w chwili t_b"
            },
            {
              "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
              "inputs": {
                "ikss_a": 8606.6210516,
                "m_factor": 0.00697987437408,
                "n_factor": 1.0
              },
              "key": "Ith",
              "notes": null,
              "result": {
                "ith_a": 8636.60538772
              },
              "substitution_latex": "8606.62 \\cdot \\sqrt{0.00697987 + 1}",
              "title": "Pr\u0105d zast\u0119pczy cieplny"
            },
            {
              "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
              "inputs": {
                "ikss_a": 8606.6210516,
                "un_v": 15000.0
              },
              "key": "Sk",
              "notes": null,
              "result": {
                "sk_mva": 223.606574143
              },
              "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 8606.62 / 10^6",
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
        "idyn_ka": 62.5,
        "max": {
          "c_factor": 1.1,
          "case_ref": "ZWARCIOWY_MAKS",
          "ib_ka": 9.467,
          "ikss_ka": 9.467,
          "ip_ka": 16.584,
          "ith_ka": 9.5,
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
                "ikss_a": 9467.28315676
              },
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
              "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500003}",
              "title": "Wsp\u00f3\u0142czynnik udaru"
            },
            {
              "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
              "inputs": {
                "ikss_a": 9467.28315676,
                "kappa": 1.23866591694
              },
              "key": "Ip",
              "notes": null,
              "result": {
                "ip_a": 16584.2009783
              },
              "substitution_latex": "1.23867 \\cdot \\sqrt{2} \\cdot 9467.28",
              "title": "Pr\u0105d udarowy"
            },
            {
              "formula_latex": "I_b = I_{k}''",
              "inputs": {
                "ikss_a": 9467.28315676,
                "przypadek": "odlegle_od_generatora"
              },
              "key": "Ib",
              "notes": "Zwarcie odleg\u0142e od generatora (brak maszyn wiruj\u0105cych w sieci): sk\u0142adowa okresowa nie zanika, Ib = Ik'' (IEC 60909-0:2016, rozdz. 9). \u0179r\u00f3d\u0142a przekszta\u0142tnikowe s\u0105 \u017ar\u00f3d\u0142ami pr\u0105dowymi bez zaniku \u2014 ich udzia\u0142 wchodzi do Ib w ca\u0142o\u015bci.",
              "result": {
                "ib_a": 9467.28315676
              },
              "substitution_latex": "9467.28",
              "title": "Pr\u0105d wy\u0142\u0105czeniowy symetryczny"
            },
            {
              "formula_latex": "i_{DC} = \\sqrt{2} \\cdot I_{k}'' \\cdot e^{-2 \\pi f \\, t_b \\, R/X}",
              "inputs": {
                "f_hz": 50.0,
                "ikss_a": 9467.28315676,
                "rx_ratio": 0.5000025,
                "tb_s": 0.1,
                "wspolczynnik_zaniku": 1.50689891918e-07,
                "wykladnik": 15.7080418078
              },
              "key": "iDC",
              "notes": "Ik'' cz\u0119\u015bci sieci nios\u0105cej sk\u0142adow\u0105 nieokresow\u0105 (sie\u0107 zasilaj\u0105ca i maszyny wiruj\u0105ce); \u017ar\u00f3d\u0142a przekszta\u0142tnikowe nie maj\u0105 sk\u0142adowej nieokresowej (IEC 60909-0:2016). R/X \u2014 ten sam stosunek p\u0119tli zwarcia co we wsp\u00f3\u0142czynniku \u03ba.",
              "result": {
                "i_dc_a": 0.00201755083335
              },
              "substitution_latex": "\\sqrt{2} \\cdot 9467.28 \\cdot e^{-2 \\pi \\cdot 50 \\cdot 0.1 \\cdot 0.500003}",
              "title": "Sk\u0142adowa nieokresowa pr\u0105du zwarciowego w chwili t_b"
            },
            {
              "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
              "inputs": {
                "ikss_a": 9467.28315676,
                "m_factor": 0.00697987437408,
                "n_factor": 1.0
              },
              "key": "Ith",
              "notes": null,
              "result": {
                "ith_a": 9500.26592649
              },
              "substitution_latex": "9467.28 \\cdot \\sqrt{0.00697987 + 1}",
              "title": "Pr\u0105d zast\u0119pczy cieplny"
            },
            {
              "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
              "inputs": {
                "ikss_a": 9467.28315676,
                "un_v": 15000.0
              },
              "key": "Sk",
              "notes": null,
              "result": {
                "sk_mva": 245.967231557
              },
              "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 9467.28 / 10^6",
              "title": "Moc zwarciowa"
            }
          ]
        },
        "min": {
          "c_factor": 1.0,
          "case_ref": "ZWARCIOWY_MIN",
          "ikss_ka": 8.607,
          "ith_ka": 8.637,
          "kappa": 1.239,
          "sk_mva": 223.61,
          "white_box_trace": [
            {
              "formula_latex": "Z_k = Z_1",
              "inputs": {
                "fault_node_id": "SEC_B",
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
              "substitution_latex": "\\left(0.450002 + j 0.9\\right)",
              "title": "Impedancja zast\u0119pcza w punkcie zwarcia"
            },
            {
              "formula_latex": "I_{k}'' = \\frac{c \\cdot U_n \\cdot k_U}{\\left|Z_k\\right|}",
              "inputs": {
                "c_factor": 1.0,
                "un_v": 15000.0,
                "voltage_factor": 0.57735026919,
                "z_equiv_abs_ohm": 1.00623159611
              },
              "key": "Ikss",
              "notes": null,
              "result": {
                "ikss_a": 8606.6210516
              },
              "substitution_latex": "\\frac{1 \\cdot 15000 \\cdot 0.57735}{1.00623}",
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
              "substitution_latex": "1.02 + 0.98 \\cdot e^{-3 \\cdot 0.500003}",
              "title": "Wsp\u00f3\u0142czynnik udaru"
            },
            {
              "formula_latex": "I_p = \\kappa \\cdot \\sqrt{2} \\cdot I_{k}''",
              "inputs": {
                "ikss_a": 8606.6210516,
                "kappa": 1.23866591694
              },
              "key": "Ip",
              "notes": null,
              "result": {
                "ip_a": 15076.5463439
              },
              "substitution_latex": "1.23867 \\cdot \\sqrt{2} \\cdot 8606.62",
              "title": "Pr\u0105d udarowy"
            },
            {
              "formula_latex": "I_b = I_{k}''",
              "inputs": {
                "ikss_a": 8606.6210516,
                "przypadek": "odlegle_od_generatora"
              },
              "key": "Ib",
              "notes": "Zwarcie odleg\u0142e od generatora (brak maszyn wiruj\u0105cych w sieci): sk\u0142adowa okresowa nie zanika, Ib = Ik'' (IEC 60909-0:2016, rozdz. 9). \u0179r\u00f3d\u0142a przekszta\u0142tnikowe s\u0105 \u017ar\u00f3d\u0142ami pr\u0105dowymi bez zaniku \u2014 ich udzia\u0142 wchodzi do Ib w ca\u0142o\u015bci.",
              "result": {
                "ib_a": 8606.6210516
              },
              "substitution_latex": "8606.62",
              "title": "Pr\u0105d wy\u0142\u0105czeniowy symetryczny"
            },
            {
              "formula_latex": "i_{DC} = \\sqrt{2} \\cdot I_{k}'' \\cdot e^{-2 \\pi f \\, t_b \\, R/X}",
              "inputs": {
                "f_hz": 50.0,
                "ikss_a": 8606.6210516,
                "rx_ratio": 0.5000025,
                "tb_s": 0.1,
                "wspolczynnik_zaniku": 1.50689891918e-07,
                "wykladnik": 15.7080418078
              },
              "key": "iDC",
              "notes": "Ik'' cz\u0119\u015bci sieci nios\u0105cej sk\u0142adow\u0105 nieokresow\u0105 (sie\u0107 zasilaj\u0105ca i maszyny wiruj\u0105ce); \u017ar\u00f3d\u0142a przekszta\u0142tnikowe nie maj\u0105 sk\u0142adowej nieokresowej (IEC 60909-0:2016). R/X \u2014 ten sam stosunek p\u0119tli zwarcia co we wsp\u00f3\u0142czynniku \u03ba.",
              "result": {
                "i_dc_a": 0.00183413712122
              },
              "substitution_latex": "\\sqrt{2} \\cdot 8606.62 \\cdot e^{-2 \\pi \\cdot 50 \\cdot 0.1 \\cdot 0.500003}",
              "title": "Sk\u0142adowa nieokresowa pr\u0105du zwarciowego w chwili t_b"
            },
            {
              "formula_latex": "I_{th} = I_{k}'' \\cdot \\sqrt{m + n}",
              "inputs": {
                "ikss_a": 8606.6210516,
                "m_factor": 0.00697987437408,
                "n_factor": 1.0
              },
              "key": "Ith",
              "notes": null,
              "result": {
                "ith_a": 8636.60538772
              },
              "substitution_latex": "8606.62 \\cdot \\sqrt{0.00697987 + 1}",
              "title": "Pr\u0105d zast\u0119pczy cieplny"
            },
            {
              "formula_latex": "S_k = \\sqrt{3} \\cdot U_n \\cdot I_{k}'' / 10^6",
              "inputs": {
                "ikss_a": 8606.6210516,
                "un_v": 15000.0
              },
              "key": "Sk",
              "notes": null,
              "result": {
                "sk_mva": 223.606574143
              },
              "substitution_latex": "\\sqrt{3} \\cdot 15000 \\cdot 8606.62 / 10^6",
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
