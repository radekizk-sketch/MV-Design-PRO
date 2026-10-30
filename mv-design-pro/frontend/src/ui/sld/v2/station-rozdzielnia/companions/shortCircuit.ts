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
 * + rekordy K wytrzymałości (i_p ≤ I_dyn, I_th ≤ I_cw) + the solver White Box trace. The renderer
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
        "oceny": {
          "cieplna": {
            "dowod": {
              "domena_pl": null,
              "metoda": "OBLICZENIE",
              "odniesienie": "tests/reference_networks/station_archetype_substrate.py",
              "poziom": "UNVALIDATED_MODEL",
              "rodzaj_twierdzenia": "STATIC_CALCULATION",
              "status_danych": {
                "dane_przyjete": [
                  {
                    "jakosc": "ESTIMATED",
                    "nazwa_pl": "pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany rozdzielnicy I_cw (1 s)",
                    "powod_pl": "znami\u0119 przyj\u0119te w substracie stacji, nie dana karty producenta",
                    "wartosc": {
                      "jednostka": "kA",
                      "wartosc": 25.0
                    }
                  }
                ],
                "stan": "UNVALIDATED_INPUT"
              },
              "status_modelu": "NIE_DOTYCZY",
              "w_domenie_walidacji": null
            },
            "etykieta": {
              "etykieta_pl": "Kryterium spe\u0142nione \u2014 dow\u00f3d niepe\u0142ny",
              "semantyka": "ostrzegawcza"
            },
            "kompletnosc_dowodu": "NIEPELNY",
            "kryterium": {
              "opis_pl": "Pr\u0105d cieplny zast\u0119pczy zwarcia w punkcie zabudowy pola nie przekracza pr\u0105du kr\u00f3tkotrwa\u0142ego aparatu przeliczonego na czas wy\u0142\u0105czenia zwarcia",
              "relacja": "NIE_WIECEJ",
              "warunek_latex": "I_{th} \\le I_{thr}\\sqrt{\\min\\left(1,\\ \\frac{T_{kr}}{T_k}\\right)}",
              "warunek_wstepny_pl": null,
              "warunek_wstepny_podstawa": null
            },
            "kryterium_id": "substrat_stacji.wytrzymalosc.NN_BUS.cieplna",
            "limit": {
              "jednostka_obwiedni": null,
              "obwiednia": null,
              "pasmo": null,
              "podstawa": {
                "dokument": "znamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)",
                "jednostka_redakcyjna": "\u00a7 4.5 znamionowy pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany I_k i \u00a7 4.7 czas jego trwania t_k",
                "rodzaj": "ZALOZENIE_PROJEKTOWE",
                "status": "WSKAZANE",
                "uwagi_pl": null,
                "wydanie": "bie\u017c\u0105cy stan programu"
              },
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 25.0
              },
              "wersja_profilu": null,
              "zakres_stosowalnosci_pl": "pr\u0105d kr\u00f3tkotrwa\u0142y 25 kA / 1 s przeliczony na czas wy\u0142\u0105czenia T_k = 1 s"
            },
            "margines": {
              "definicja_latex": "m = x_{\\lim} - x",
              "niedefiniowalny": false,
              "powod_pl": null,
              "punkt_pl": "rozdzielnica \u2014 szyna nN 0,4 kV",
              "skala": {
                "jednostka": "kA",
                "wartosc": 25.0
              },
              "skala_rodzaj": "LIMIT",
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 7.926
              },
              "wzgledny": 0.31704
            },
            "niepewnosc": {
              "metoda_pl": null,
              "nie_dotyczy": true,
              "powod_pl": "wielko\u015b\u0107 wyznaczona wzorem zamkni\u0119tym z danych modelu \u2014 niepewno\u015b\u0107 numeryczna nie dotyczy, niepewno\u015b\u0107 danych wej\u015bciowych wyra\u017ca stan danych rekordu",
              "wartosc": null
            },
            "podstawa": {
              "dokument": "IEC 60865-1 (PN-EN 60865-1) Pr\u0105dy zwarciowe \u2014 obliczanie skutk\u00f3w",
              "jednostka_redakcyjna": "wytrzyma\u0142o\u015b\u0107 cieplna urz\u0105dze\u0144 elektrycznych: I_th \u2264 I_thr dla T_k \u2264 T_kr oraz I_th \u2264 I_thr\u00b7\u221a(T_kr/T_k) dla T_k \u2265 T_kr",
              "rodzaj": "NORMA",
              "status": "WSKAZANE",
              "uwagi_pl": "pr\u0105d cieplny zast\u0119pczy zwarcia por\u00f3wnany z pr\u0105dem kr\u00f3tkotrwa\u0142ym aparatu przeliczonym na czas wy\u0142\u0105czenia; przy czasie kr\u00f3tszym od znamionowego limitem jest sam pr\u0105d znamionowy (bez przeliczenia w g\u00f3r\u0119)",
              "wydanie": "2011"
            },
            "powody_niepelnosci": [
              "Obliczenie nie jest dowodem w\u0142a\u015bciwym: zdolno\u015b\u0107 obliczeniowa o poziomie dowodowym \u201emodel niezwalidowany\u201d (wymagany solver zwalidowany \u2014 najwy\u017cszy poziom dowodowy zdolno\u015bci).",
              "Dana przyj\u0119ta bez walidacji: pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany rozdzielnicy I_cw (1 s) = 25 kA, jako\u015b\u0107 danej: oszacowane \u2014 znami\u0119 przyj\u0119te w substracie stacji, nie dana karty producenta."
            ],
            "przedmiot": {
              "element_ref": "NN_BUS",
              "nazwa_pl": "rozdzielnica \u2014 szyna nN 0,4 kV",
              "opis_pl": "rozdzielnica szyny substratu stacji wobec pr\u0105d\u00f3w zwarciowych szyny"
            },
            "slad": [
              {
                "krok": "substrat_stacji.wytrzymalosc.NN_BUS.cieplna",
                "opis_pl": "pr\u0105d cieplny podany do oceny wobec I_th przeliczonego na czas wy\u0142\u0105czenia",
                "run_id": null,
                "wersja_silnika": null
              }
            ],
            "status_maszynowy": "SPELNIA",
            "stosowalnosc": {
              "dotyczy": true,
              "modul_istniejacy": null,
              "podstawa": null,
              "powod_pl": "wielko\u015b\u0107 wyznaczona w biegu dla tego obiektu modelu",
              "technologia": null,
              "typ_modulu": null,
              "warunek_wstepny_nieuruchomiony": false
            },
            "wyjasnienie": {
              "czego_brakuje": [],
              "przyczyna_pl": null,
              "zastrzezenia": [
                "Podstawa \u201eIEC 60865-1 (PN-EN 60865-1) Pr\u0105dy zwarciowe \u2014 obliczanie skutk\u00f3w\u201d, wydanie 2011, wytrzyma\u0142o\u015b\u0107 cieplna urz\u0105dze\u0144 elektrycznych: I_th \u2264 I_thr dla T_k \u2264 T_kr oraz I_th \u2264 I_thr\u00b7\u221a(T_kr/T_k) dla T_k \u2265 T_kr (norma): stan \u017ar\u00f3d\u0142a \u201ewskazane\u201d \u2014 dokument i jednostka redakcyjna wskazane, tre\u015b\u0107 dokumentu nie jest do\u0142\u0105czona do repozytorium.",
                "Podstawa \u201eznamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)\u201d, wydanie bie\u017c\u0105cy stan programu, \u00a7 4.5 znamionowy pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany I_k i \u00a7 4.7 czas jego trwania t_k (za\u0142o\u017cenie projektowe): stan \u017ar\u00f3d\u0142a \u201ewskazane\u201d \u2014 dokument i jednostka redakcyjna wskazane, tre\u015b\u0107 dokumentu nie jest do\u0142\u0105czona do repozytorium.",
                "Poziom dowodowy zdolno\u015bci narz\u0119dzia: \u201emodel niezwalidowany\u201d \u2014 obliczenie bez ustalonej poprawno\u015bci fizycznej nie jest dowodem regulacyjnym.",
                "Dana przyj\u0119ta bez walidacji: pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany rozdzielnicy I_cw (1 s) = 25 kA, jako\u015b\u0107 danej: oszacowane \u2014 znami\u0119 przyj\u0119te w substracie stacji, nie dana karty producenta.",
                "Zakres wa\u017cno\u015bci: Rozdzielnica (szyna nN 0,4 kV) wobec pr\u0105du udarowego i pr\u0105du cieplnego zast\u0119pczego zwarcia maksymalnego (IEC 60909) przy czasie zwarcia T_k = 1.0 s \u2014 wynik nie obejmuje: zwarcia niesymetryczne; rozdzia\u0142 pr\u0105du zwarcia na ga\u0142\u0119zie pola \u2014 por\u00f3wnany pe\u0142ny pr\u0105d podany do oceny."
              ],
              "zdanie_pl": "Pr\u0105d cieplny zast\u0119pczy zwarcia w punkcie zabudowy pola nie przekracza pr\u0105du kr\u00f3tkotrwa\u0142ego aparatu przeliczonego na czas wy\u0142\u0105czenia zwarcia (rozdzielnica \u2014 szyna nN 0,4 kV) \u2014 kryterium spe\u0142nione. Pr\u0105d cieplny zast\u0119pczy zwarcia w punkcie zabudowy: 17,07 kA wobec wymaganych \u2264 25 kA wg \u00a7 4.5 znamionowy pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany I_k i \u00a7 4.7 czas jego trwania t_k \u201eznamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)\u201d (margines +7,926 kA, punkt: rozdzielnica \u2014 szyna nN 0,4 kV, wzgl\u0119dnie +31,7 % warto\u015bci granicznej)."
            },
            "wynik": {
              "chwila_s": null,
              "metoda": "OBLICZENIE",
              "punkt_krytyczny_pl": "rozdzielnica \u2014 szyna nN 0,4 kV",
              "symbol_latex": "I_{th}",
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 17.074
              },
              "wielkosc_pl": "pr\u0105d cieplny zast\u0119pczy zwarcia w punkcie zabudowy"
            },
            "zakres_waznosci": {
              "model_urzadzenia": null,
              "ograniczniki": [],
              "opis_pl": "Rozdzielnica (szyna nN 0,4 kV) wobec pr\u0105du udarowego i pr\u0105du cieplnego zast\u0119pczego zwarcia maksymalnego (IEC 60909) przy czasie zwarcia T_k = 1.0 s.",
              "parametry_sieci": [],
              "regulator": null,
              "rodzaj_analizy": "SHORT_CIRCUIT",
              "symetria_zaklocenia": null,
              "technologia": null,
              "wykluczenia": [
                "zwarcia niesymetryczne",
                "rozdzia\u0142 pr\u0105du zwarcia na ga\u0142\u0119zie pola \u2014 por\u00f3wnany pe\u0142ny pr\u0105d podany do oceny"
              ]
            }
          },
          "dynamiczna": {
            "dowod": {
              "domena_pl": null,
              "metoda": "OBLICZENIE",
              "odniesienie": "tests/reference_networks/station_archetype_substrate.py",
              "poziom": "UNVALIDATED_MODEL",
              "rodzaj_twierdzenia": "STATIC_CALCULATION",
              "status_danych": {
                "dane_przyjete": [
                  {
                    "jakosc": "ESTIMATED",
                    "nazwa_pl": "pr\u0105d szczytowy wytrzymywany rozdzielnicy I_dyn",
                    "powod_pl": "I_dyn = 2.1\u00b7I_cw (klasa wy\u0142\u0105cznik\u00f3w nN), znami\u0119 przyj\u0119te w substracie stacji",
                    "wartosc": {
                      "jednostka": "kA",
                      "wartosc": 52.5
                    }
                  }
                ],
                "stan": "UNVALIDATED_INPUT"
              },
              "status_modelu": "NIE_DOTYCZY",
              "w_domenie_walidacji": null
            },
            "etykieta": {
              "etykieta_pl": "Kryterium spe\u0142nione \u2014 dow\u00f3d niepe\u0142ny",
              "semantyka": "ostrzegawcza"
            },
            "kompletnosc_dowodu": "NIEPELNY",
            "kryterium": {
              "opis_pl": "Pr\u0105d udarowy zwarcia w punkcie zabudowy pola nie przekracza znamionowego pr\u0105du szczytowego wytrzymywanego aparatu",
              "relacja": "NIE_WIECEJ",
              "warunek_latex": "i_p \\le I_{dyn}",
              "warunek_wstepny_pl": null,
              "warunek_wstepny_podstawa": null
            },
            "kryterium_id": "substrat_stacji.wytrzymalosc.NN_BUS.dynamiczna",
            "limit": {
              "jednostka_obwiedni": null,
              "obwiednia": null,
              "pasmo": null,
              "podstawa": {
                "dokument": "znamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)",
                "jednostka_redakcyjna": "\u00a7 4.6 znamionowy pr\u0105d szczytowy wytrzymywany I_p",
                "rodzaj": "ZALOZENIE_PROJEKTOWE",
                "status": "WSKAZANE",
                "uwagi_pl": null,
                "wydanie": "bie\u017c\u0105cy stan programu"
              },
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 52.5
              },
              "wersja_profilu": null,
              "zakres_stosowalnosci_pl": "znamionowy pr\u0105d szczytowy wytrzymywany aparatu I_dyn"
            },
            "margines": {
              "definicja_latex": "m = x_{\\lim} - x",
              "niedefiniowalny": false,
              "powod_pl": null,
              "punkt_pl": "rozdzielnica \u2014 szyna nN 0,4 kV",
              "skala": {
                "jednostka": "kA",
                "wartosc": 52.5
              },
              "skala_rodzaj": "LIMIT",
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 9.051
              },
              "wzgledny": 0.1724
            },
            "niepewnosc": {
              "metoda_pl": null,
              "nie_dotyczy": true,
              "powod_pl": "wielko\u015b\u0107 wyznaczona wzorem zamkni\u0119tym z danych modelu \u2014 niepewno\u015b\u0107 numeryczna nie dotyczy, niepewno\u015b\u0107 danych wej\u015bciowych wyra\u017ca stan danych rekordu",
              "wartosc": null
            },
            "podstawa": {
              "dokument": "IEC 62271-1 (PN-EN 62271-1) Wysokonapi\u0119ciowa aparatura rozdzielcza i sterownicza",
              "jednostka_redakcyjna": "\u00a7 4.6 znamionowy pr\u0105d szczytowy wytrzymywany I_p",
              "rodzaj": "NORMA",
              "status": "WSKAZANE",
              "uwagi_pl": "aparat wytrzymuje dynamicznie zwarcie, gdy pr\u0105d udarowy w miejscu zabudowy nie przekracza jego znamionowego pr\u0105du szczytowego wytrzymywanego",
              "wydanie": "2007"
            },
            "powody_niepelnosci": [
              "Obliczenie nie jest dowodem w\u0142a\u015bciwym: zdolno\u015b\u0107 obliczeniowa o poziomie dowodowym \u201emodel niezwalidowany\u201d (wymagany solver zwalidowany \u2014 najwy\u017cszy poziom dowodowy zdolno\u015bci).",
              "Dana przyj\u0119ta bez walidacji: pr\u0105d szczytowy wytrzymywany rozdzielnicy I_dyn = 52,5 kA, jako\u015b\u0107 danej: oszacowane \u2014 I_dyn = 2.1\u00b7I_cw (klasa wy\u0142\u0105cznik\u00f3w nN), znami\u0119 przyj\u0119te w substracie stacji."
            ],
            "przedmiot": {
              "element_ref": "NN_BUS",
              "nazwa_pl": "rozdzielnica \u2014 szyna nN 0,4 kV",
              "opis_pl": "rozdzielnica szyny substratu stacji wobec pr\u0105d\u00f3w zwarciowych szyny"
            },
            "slad": [
              {
                "krok": "substrat_stacji.wytrzymalosc.NN_BUS.dynamiczna",
                "opis_pl": "pr\u0105d udarowy podany do oceny wobec I_dyn pozycji katalogu",
                "run_id": null,
                "wersja_silnika": null
              }
            ],
            "status_maszynowy": "SPELNIA",
            "stosowalnosc": {
              "dotyczy": true,
              "modul_istniejacy": null,
              "podstawa": null,
              "powod_pl": "wielko\u015b\u0107 wyznaczona w biegu dla tego obiektu modelu",
              "technologia": null,
              "typ_modulu": null,
              "warunek_wstepny_nieuruchomiony": false
            },
            "wyjasnienie": {
              "czego_brakuje": [],
              "przyczyna_pl": null,
              "zastrzezenia": [
                "Podstawa \u201eIEC 62271-1 (PN-EN 62271-1) Wysokonapi\u0119ciowa aparatura rozdzielcza i sterownicza\u201d, wydanie 2007, \u00a7 4.6 znamionowy pr\u0105d szczytowy wytrzymywany I_p (norma): stan \u017ar\u00f3d\u0142a \u201ewskazane\u201d \u2014 dokument i jednostka redakcyjna wskazane, tre\u015b\u0107 dokumentu nie jest do\u0142\u0105czona do repozytorium.",
                "Podstawa \u201eznamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)\u201d, wydanie bie\u017c\u0105cy stan programu, \u00a7 4.6 znamionowy pr\u0105d szczytowy wytrzymywany I_p (za\u0142o\u017cenie projektowe): stan \u017ar\u00f3d\u0142a \u201ewskazane\u201d \u2014 dokument i jednostka redakcyjna wskazane, tre\u015b\u0107 dokumentu nie jest do\u0142\u0105czona do repozytorium.",
                "Poziom dowodowy zdolno\u015bci narz\u0119dzia: \u201emodel niezwalidowany\u201d \u2014 obliczenie bez ustalonej poprawno\u015bci fizycznej nie jest dowodem regulacyjnym.",
                "Dana przyj\u0119ta bez walidacji: pr\u0105d szczytowy wytrzymywany rozdzielnicy I_dyn = 52,5 kA, jako\u015b\u0107 danej: oszacowane \u2014 I_dyn = 2.1\u00b7I_cw (klasa wy\u0142\u0105cznik\u00f3w nN), znami\u0119 przyj\u0119te w substracie stacji.",
                "Zakres wa\u017cno\u015bci: Rozdzielnica (szyna nN 0,4 kV) wobec pr\u0105du udarowego i pr\u0105du cieplnego zast\u0119pczego zwarcia maksymalnego (IEC 60909) przy czasie zwarcia T_k = 1.0 s \u2014 wynik nie obejmuje: zwarcia niesymetryczne; rozdzia\u0142 pr\u0105du zwarcia na ga\u0142\u0119zie pola \u2014 por\u00f3wnany pe\u0142ny pr\u0105d podany do oceny."
              ],
              "zdanie_pl": "Pr\u0105d udarowy zwarcia w punkcie zabudowy pola nie przekracza znamionowego pr\u0105du szczytowego wytrzymywanego aparatu (rozdzielnica \u2014 szyna nN 0,4 kV) \u2014 kryterium spe\u0142nione. Pr\u0105d udarowy zwarcia w punkcie zabudowy: 43,45 kA wobec wymaganych \u2264 52,5 kA wg \u00a7 4.6 znamionowy pr\u0105d szczytowy wytrzymywany I_p \u201eznamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)\u201d (margines +9,051 kA, punkt: rozdzielnica \u2014 szyna nN 0,4 kV, wzgl\u0119dnie +17,24 % warto\u015bci granicznej)."
            },
            "wynik": {
              "chwila_s": null,
              "metoda": "OBLICZENIE",
              "punkt_krytyczny_pl": "rozdzielnica \u2014 szyna nN 0,4 kV",
              "symbol_latex": "i_p",
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 43.449
              },
              "wielkosc_pl": "pr\u0105d udarowy zwarcia w punkcie zabudowy"
            },
            "zakres_waznosci": {
              "model_urzadzenia": null,
              "ograniczniki": [],
              "opis_pl": "Rozdzielnica (szyna nN 0,4 kV) wobec pr\u0105du udarowego i pr\u0105du cieplnego zast\u0119pczego zwarcia maksymalnego (IEC 60909) przy czasie zwarcia T_k = 1.0 s.",
              "parametry_sieci": [],
              "regulator": null,
              "rodzaj_analizy": "SHORT_CIRCUIT",
              "symetria_zaklocenia": null,
              "technologia": null,
              "wykluczenia": [
                "zwarcia niesymetryczne",
                "rozdzia\u0142 pr\u0105du zwarcia na ga\u0142\u0119zie pola \u2014 por\u00f3wnany pe\u0142ny pr\u0105d podany do oceny"
              ]
            }
          }
        },
        "un_kv": 0.4
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
        "oceny": {
          "cieplna": {
            "dowod": {
              "domena_pl": null,
              "metoda": "OBLICZENIE",
              "odniesienie": "tests/reference_networks/station_archetype_substrate.py",
              "poziom": "UNVALIDATED_MODEL",
              "rodzaj_twierdzenia": "STATIC_CALCULATION",
              "status_danych": {
                "dane_przyjete": [
                  {
                    "jakosc": "ESTIMATED",
                    "nazwa_pl": "pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany rozdzielnicy I_cw (1 s)",
                    "powod_pl": "znami\u0119 przyj\u0119te w substracie stacji, nie dana karty producenta",
                    "wartosc": {
                      "jednostka": "kA",
                      "wartosc": 25.0
                    }
                  }
                ],
                "stan": "UNVALIDATED_INPUT"
              },
              "status_modelu": "NIE_DOTYCZY",
              "w_domenie_walidacji": null
            },
            "etykieta": {
              "etykieta_pl": "Kryterium spe\u0142nione \u2014 dow\u00f3d niepe\u0142ny",
              "semantyka": "ostrzegawcza"
            },
            "kompletnosc_dowodu": "NIEPELNY",
            "kryterium": {
              "opis_pl": "Pr\u0105d cieplny zast\u0119pczy zwarcia w punkcie zabudowy pola nie przekracza pr\u0105du kr\u00f3tkotrwa\u0142ego aparatu przeliczonego na czas wy\u0142\u0105czenia zwarcia",
              "relacja": "NIE_WIECEJ",
              "warunek_latex": "I_{th} \\le I_{thr}\\sqrt{\\min\\left(1,\\ \\frac{T_{kr}}{T_k}\\right)}",
              "warunek_wstepny_pl": null,
              "warunek_wstepny_podstawa": null
            },
            "kryterium_id": "substrat_stacji.wytrzymalosc.SN_BUS.cieplna",
            "limit": {
              "jednostka_obwiedni": null,
              "obwiednia": null,
              "pasmo": null,
              "podstawa": {
                "dokument": "znamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)",
                "jednostka_redakcyjna": "\u00a7 4.5 znamionowy pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany I_k i \u00a7 4.7 czas jego trwania t_k",
                "rodzaj": "ZALOZENIE_PROJEKTOWE",
                "status": "WSKAZANE",
                "uwagi_pl": null,
                "wydanie": "bie\u017c\u0105cy stan programu"
              },
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 25.0
              },
              "wersja_profilu": null,
              "zakres_stosowalnosci_pl": "pr\u0105d kr\u00f3tkotrwa\u0142y 25 kA / 1 s przeliczony na czas wy\u0142\u0105czenia T_k = 1 s"
            },
            "margines": {
              "definicja_latex": "m = x_{\\lim} - x",
              "niedefiniowalny": false,
              "powod_pl": null,
              "punkt_pl": "rozdzielnica \u2014 szyna SN 15 kV",
              "skala": {
                "jednostka": "kA",
                "wartosc": 25.0
              },
              "skala_rodzaj": "LIMIT",
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 15.5
              },
              "wzgledny": 0.62
            },
            "niepewnosc": {
              "metoda_pl": null,
              "nie_dotyczy": true,
              "powod_pl": "wielko\u015b\u0107 wyznaczona wzorem zamkni\u0119tym z danych modelu \u2014 niepewno\u015b\u0107 numeryczna nie dotyczy, niepewno\u015b\u0107 danych wej\u015bciowych wyra\u017ca stan danych rekordu",
              "wartosc": null
            },
            "podstawa": {
              "dokument": "IEC 60865-1 (PN-EN 60865-1) Pr\u0105dy zwarciowe \u2014 obliczanie skutk\u00f3w",
              "jednostka_redakcyjna": "wytrzyma\u0142o\u015b\u0107 cieplna urz\u0105dze\u0144 elektrycznych: I_th \u2264 I_thr dla T_k \u2264 T_kr oraz I_th \u2264 I_thr\u00b7\u221a(T_kr/T_k) dla T_k \u2265 T_kr",
              "rodzaj": "NORMA",
              "status": "WSKAZANE",
              "uwagi_pl": "pr\u0105d cieplny zast\u0119pczy zwarcia por\u00f3wnany z pr\u0105dem kr\u00f3tkotrwa\u0142ym aparatu przeliczonym na czas wy\u0142\u0105czenia; przy czasie kr\u00f3tszym od znamionowego limitem jest sam pr\u0105d znamionowy (bez przeliczenia w g\u00f3r\u0119)",
              "wydanie": "2011"
            },
            "powody_niepelnosci": [
              "Obliczenie nie jest dowodem w\u0142a\u015bciwym: zdolno\u015b\u0107 obliczeniowa o poziomie dowodowym \u201emodel niezwalidowany\u201d (wymagany solver zwalidowany \u2014 najwy\u017cszy poziom dowodowy zdolno\u015bci).",
              "Dana przyj\u0119ta bez walidacji: pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany rozdzielnicy I_cw (1 s) = 25 kA, jako\u015b\u0107 danej: oszacowane \u2014 znami\u0119 przyj\u0119te w substracie stacji, nie dana karty producenta."
            ],
            "przedmiot": {
              "element_ref": "SN_BUS",
              "nazwa_pl": "rozdzielnica \u2014 szyna SN 15 kV",
              "opis_pl": "rozdzielnica szyny substratu stacji wobec pr\u0105d\u00f3w zwarciowych szyny"
            },
            "slad": [
              {
                "krok": "substrat_stacji.wytrzymalosc.SN_BUS.cieplna",
                "opis_pl": "pr\u0105d cieplny podany do oceny wobec I_th przeliczonego na czas wy\u0142\u0105czenia",
                "run_id": null,
                "wersja_silnika": null
              }
            ],
            "status_maszynowy": "SPELNIA",
            "stosowalnosc": {
              "dotyczy": true,
              "modul_istniejacy": null,
              "podstawa": null,
              "powod_pl": "wielko\u015b\u0107 wyznaczona w biegu dla tego obiektu modelu",
              "technologia": null,
              "typ_modulu": null,
              "warunek_wstepny_nieuruchomiony": false
            },
            "wyjasnienie": {
              "czego_brakuje": [],
              "przyczyna_pl": null,
              "zastrzezenia": [
                "Podstawa \u201eIEC 60865-1 (PN-EN 60865-1) Pr\u0105dy zwarciowe \u2014 obliczanie skutk\u00f3w\u201d, wydanie 2011, wytrzyma\u0142o\u015b\u0107 cieplna urz\u0105dze\u0144 elektrycznych: I_th \u2264 I_thr dla T_k \u2264 T_kr oraz I_th \u2264 I_thr\u00b7\u221a(T_kr/T_k) dla T_k \u2265 T_kr (norma): stan \u017ar\u00f3d\u0142a \u201ewskazane\u201d \u2014 dokument i jednostka redakcyjna wskazane, tre\u015b\u0107 dokumentu nie jest do\u0142\u0105czona do repozytorium.",
                "Podstawa \u201eznamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)\u201d, wydanie bie\u017c\u0105cy stan programu, \u00a7 4.5 znamionowy pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany I_k i \u00a7 4.7 czas jego trwania t_k (za\u0142o\u017cenie projektowe): stan \u017ar\u00f3d\u0142a \u201ewskazane\u201d \u2014 dokument i jednostka redakcyjna wskazane, tre\u015b\u0107 dokumentu nie jest do\u0142\u0105czona do repozytorium.",
                "Poziom dowodowy zdolno\u015bci narz\u0119dzia: \u201emodel niezwalidowany\u201d \u2014 obliczenie bez ustalonej poprawno\u015bci fizycznej nie jest dowodem regulacyjnym.",
                "Dana przyj\u0119ta bez walidacji: pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany rozdzielnicy I_cw (1 s) = 25 kA, jako\u015b\u0107 danej: oszacowane \u2014 znami\u0119 przyj\u0119te w substracie stacji, nie dana karty producenta.",
                "Zakres wa\u017cno\u015bci: Rozdzielnica (szyna SN 15 kV) wobec pr\u0105du udarowego i pr\u0105du cieplnego zast\u0119pczego zwarcia maksymalnego (IEC 60909) przy czasie zwarcia T_k = 1.0 s \u2014 wynik nie obejmuje: zwarcia niesymetryczne; rozdzia\u0142 pr\u0105du zwarcia na ga\u0142\u0119zie pola \u2014 por\u00f3wnany pe\u0142ny pr\u0105d podany do oceny."
              ],
              "zdanie_pl": "Pr\u0105d cieplny zast\u0119pczy zwarcia w punkcie zabudowy pola nie przekracza pr\u0105du kr\u00f3tkotrwa\u0142ego aparatu przeliczonego na czas wy\u0142\u0105czenia zwarcia (rozdzielnica \u2014 szyna SN 15 kV) \u2014 kryterium spe\u0142nione. Pr\u0105d cieplny zast\u0119pczy zwarcia w punkcie zabudowy: 9,5 kA wobec wymaganych \u2264 25 kA wg \u00a7 4.5 znamionowy pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany I_k i \u00a7 4.7 czas jego trwania t_k \u201eznamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)\u201d (margines +15,5 kA, punkt: rozdzielnica \u2014 szyna SN 15 kV, wzgl\u0119dnie +62 % warto\u015bci granicznej)."
            },
            "wynik": {
              "chwila_s": null,
              "metoda": "OBLICZENIE",
              "punkt_krytyczny_pl": "rozdzielnica \u2014 szyna SN 15 kV",
              "symbol_latex": "I_{th}",
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 9.5
              },
              "wielkosc_pl": "pr\u0105d cieplny zast\u0119pczy zwarcia w punkcie zabudowy"
            },
            "zakres_waznosci": {
              "model_urzadzenia": null,
              "ograniczniki": [],
              "opis_pl": "Rozdzielnica (szyna SN 15 kV) wobec pr\u0105du udarowego i pr\u0105du cieplnego zast\u0119pczego zwarcia maksymalnego (IEC 60909) przy czasie zwarcia T_k = 1.0 s.",
              "parametry_sieci": [],
              "regulator": null,
              "rodzaj_analizy": "SHORT_CIRCUIT",
              "symetria_zaklocenia": null,
              "technologia": null,
              "wykluczenia": [
                "zwarcia niesymetryczne",
                "rozdzia\u0142 pr\u0105du zwarcia na ga\u0142\u0119zie pola \u2014 por\u00f3wnany pe\u0142ny pr\u0105d podany do oceny"
              ]
            }
          },
          "dynamiczna": {
            "dowod": {
              "domena_pl": null,
              "metoda": "OBLICZENIE",
              "odniesienie": "tests/reference_networks/station_archetype_substrate.py",
              "poziom": "UNVALIDATED_MODEL",
              "rodzaj_twierdzenia": "STATIC_CALCULATION",
              "status_danych": {
                "dane_przyjete": [
                  {
                    "jakosc": "ESTIMATED",
                    "nazwa_pl": "pr\u0105d szczytowy wytrzymywany rozdzielnicy I_dyn",
                    "powod_pl": "I_dyn = 2.5\u00b7I_cw (IEC 62271-1, rozdzielnica SN 50 Hz), znami\u0119 przyj\u0119te w substracie stacji",
                    "wartosc": {
                      "jednostka": "kA",
                      "wartosc": 62.5
                    }
                  }
                ],
                "stan": "UNVALIDATED_INPUT"
              },
              "status_modelu": "NIE_DOTYCZY",
              "w_domenie_walidacji": null
            },
            "etykieta": {
              "etykieta_pl": "Kryterium spe\u0142nione \u2014 dow\u00f3d niepe\u0142ny",
              "semantyka": "ostrzegawcza"
            },
            "kompletnosc_dowodu": "NIEPELNY",
            "kryterium": {
              "opis_pl": "Pr\u0105d udarowy zwarcia w punkcie zabudowy pola nie przekracza znamionowego pr\u0105du szczytowego wytrzymywanego aparatu",
              "relacja": "NIE_WIECEJ",
              "warunek_latex": "i_p \\le I_{dyn}",
              "warunek_wstepny_pl": null,
              "warunek_wstepny_podstawa": null
            },
            "kryterium_id": "substrat_stacji.wytrzymalosc.SN_BUS.dynamiczna",
            "limit": {
              "jednostka_obwiedni": null,
              "obwiednia": null,
              "pasmo": null,
              "podstawa": {
                "dokument": "znamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)",
                "jednostka_redakcyjna": "\u00a7 4.6 znamionowy pr\u0105d szczytowy wytrzymywany I_p",
                "rodzaj": "ZALOZENIE_PROJEKTOWE",
                "status": "WSKAZANE",
                "uwagi_pl": null,
                "wydanie": "bie\u017c\u0105cy stan programu"
              },
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 62.5
              },
              "wersja_profilu": null,
              "zakres_stosowalnosci_pl": "znamionowy pr\u0105d szczytowy wytrzymywany aparatu I_dyn"
            },
            "margines": {
              "definicja_latex": "m = x_{\\lim} - x",
              "niedefiniowalny": false,
              "powod_pl": null,
              "punkt_pl": "rozdzielnica \u2014 szyna SN 15 kV",
              "skala": {
                "jednostka": "kA",
                "wartosc": 62.5
              },
              "skala_rodzaj": "LIMIT",
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 45.916
              },
              "wzgledny": 0.734656
            },
            "niepewnosc": {
              "metoda_pl": null,
              "nie_dotyczy": true,
              "powod_pl": "wielko\u015b\u0107 wyznaczona wzorem zamkni\u0119tym z danych modelu \u2014 niepewno\u015b\u0107 numeryczna nie dotyczy, niepewno\u015b\u0107 danych wej\u015bciowych wyra\u017ca stan danych rekordu",
              "wartosc": null
            },
            "podstawa": {
              "dokument": "IEC 62271-1 (PN-EN 62271-1) Wysokonapi\u0119ciowa aparatura rozdzielcza i sterownicza",
              "jednostka_redakcyjna": "\u00a7 4.6 znamionowy pr\u0105d szczytowy wytrzymywany I_p",
              "rodzaj": "NORMA",
              "status": "WSKAZANE",
              "uwagi_pl": "aparat wytrzymuje dynamicznie zwarcie, gdy pr\u0105d udarowy w miejscu zabudowy nie przekracza jego znamionowego pr\u0105du szczytowego wytrzymywanego",
              "wydanie": "2007"
            },
            "powody_niepelnosci": [
              "Obliczenie nie jest dowodem w\u0142a\u015bciwym: zdolno\u015b\u0107 obliczeniowa o poziomie dowodowym \u201emodel niezwalidowany\u201d (wymagany solver zwalidowany \u2014 najwy\u017cszy poziom dowodowy zdolno\u015bci).",
              "Dana przyj\u0119ta bez walidacji: pr\u0105d szczytowy wytrzymywany rozdzielnicy I_dyn = 62,5 kA, jako\u015b\u0107 danej: oszacowane \u2014 I_dyn = 2.5\u00b7I_cw (IEC 62271-1, rozdzielnica SN 50 Hz), znami\u0119 przyj\u0119te w substracie stacji."
            ],
            "przedmiot": {
              "element_ref": "SN_BUS",
              "nazwa_pl": "rozdzielnica \u2014 szyna SN 15 kV",
              "opis_pl": "rozdzielnica szyny substratu stacji wobec pr\u0105d\u00f3w zwarciowych szyny"
            },
            "slad": [
              {
                "krok": "substrat_stacji.wytrzymalosc.SN_BUS.dynamiczna",
                "opis_pl": "pr\u0105d udarowy podany do oceny wobec I_dyn pozycji katalogu",
                "run_id": null,
                "wersja_silnika": null
              }
            ],
            "status_maszynowy": "SPELNIA",
            "stosowalnosc": {
              "dotyczy": true,
              "modul_istniejacy": null,
              "podstawa": null,
              "powod_pl": "wielko\u015b\u0107 wyznaczona w biegu dla tego obiektu modelu",
              "technologia": null,
              "typ_modulu": null,
              "warunek_wstepny_nieuruchomiony": false
            },
            "wyjasnienie": {
              "czego_brakuje": [],
              "przyczyna_pl": null,
              "zastrzezenia": [
                "Podstawa \u201eIEC 62271-1 (PN-EN 62271-1) Wysokonapi\u0119ciowa aparatura rozdzielcza i sterownicza\u201d, wydanie 2007, \u00a7 4.6 znamionowy pr\u0105d szczytowy wytrzymywany I_p (norma): stan \u017ar\u00f3d\u0142a \u201ewskazane\u201d \u2014 dokument i jednostka redakcyjna wskazane, tre\u015b\u0107 dokumentu nie jest do\u0142\u0105czona do repozytorium.",
                "Podstawa \u201eznamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)\u201d, wydanie bie\u017c\u0105cy stan programu, \u00a7 4.6 znamionowy pr\u0105d szczytowy wytrzymywany I_p (za\u0142o\u017cenie projektowe): stan \u017ar\u00f3d\u0142a \u201ewskazane\u201d \u2014 dokument i jednostka redakcyjna wskazane, tre\u015b\u0107 dokumentu nie jest do\u0142\u0105czona do repozytorium.",
                "Poziom dowodowy zdolno\u015bci narz\u0119dzia: \u201emodel niezwalidowany\u201d \u2014 obliczenie bez ustalonej poprawno\u015bci fizycznej nie jest dowodem regulacyjnym.",
                "Dana przyj\u0119ta bez walidacji: pr\u0105d szczytowy wytrzymywany rozdzielnicy I_dyn = 62,5 kA, jako\u015b\u0107 danej: oszacowane \u2014 I_dyn = 2.5\u00b7I_cw (IEC 62271-1, rozdzielnica SN 50 Hz), znami\u0119 przyj\u0119te w substracie stacji.",
                "Zakres wa\u017cno\u015bci: Rozdzielnica (szyna SN 15 kV) wobec pr\u0105du udarowego i pr\u0105du cieplnego zast\u0119pczego zwarcia maksymalnego (IEC 60909) przy czasie zwarcia T_k = 1.0 s \u2014 wynik nie obejmuje: zwarcia niesymetryczne; rozdzia\u0142 pr\u0105du zwarcia na ga\u0142\u0119zie pola \u2014 por\u00f3wnany pe\u0142ny pr\u0105d podany do oceny."
              ],
              "zdanie_pl": "Pr\u0105d udarowy zwarcia w punkcie zabudowy pola nie przekracza znamionowego pr\u0105du szczytowego wytrzymywanego aparatu (rozdzielnica \u2014 szyna SN 15 kV) \u2014 kryterium spe\u0142nione. Pr\u0105d udarowy zwarcia w punkcie zabudowy: 16,58 kA wobec wymaganych \u2264 62,5 kA wg \u00a7 4.6 znamionowy pr\u0105d szczytowy wytrzymywany I_p \u201eznamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)\u201d (margines +45,92 kA, punkt: rozdzielnica \u2014 szyna SN 15 kV, wzgl\u0119dnie +73,47 % warto\u015bci granicznej)."
            },
            "wynik": {
              "chwila_s": null,
              "metoda": "OBLICZENIE",
              "punkt_krytyczny_pl": "rozdzielnica \u2014 szyna SN 15 kV",
              "symbol_latex": "i_p",
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 16.584
              },
              "wielkosc_pl": "pr\u0105d udarowy zwarcia w punkcie zabudowy"
            },
            "zakres_waznosci": {
              "model_urzadzenia": null,
              "ograniczniki": [],
              "opis_pl": "Rozdzielnica (szyna SN 15 kV) wobec pr\u0105du udarowego i pr\u0105du cieplnego zast\u0119pczego zwarcia maksymalnego (IEC 60909) przy czasie zwarcia T_k = 1.0 s.",
              "parametry_sieci": [],
              "regulator": null,
              "rodzaj_analizy": "SHORT_CIRCUIT",
              "symetria_zaklocenia": null,
              "technologia": null,
              "wykluczenia": [
                "zwarcia niesymetryczne",
                "rozdzia\u0142 pr\u0105du zwarcia na ga\u0142\u0119zie pola \u2014 por\u00f3wnany pe\u0142ny pr\u0105d podany do oceny"
              ]
            }
          }
        },
        "un_kv": 15.0
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
        "oceny": {
          "cieplna": {
            "dowod": {
              "domena_pl": null,
              "metoda": "OBLICZENIE",
              "odniesienie": "tests/reference_networks/station_archetype_substrate.py",
              "poziom": "UNVALIDATED_MODEL",
              "rodzaj_twierdzenia": "STATIC_CALCULATION",
              "status_danych": {
                "dane_przyjete": [
                  {
                    "jakosc": "ESTIMATED",
                    "nazwa_pl": "pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany rozdzielnicy I_cw (1 s)",
                    "powod_pl": "znami\u0119 przyj\u0119te w substracie stacji, nie dana karty producenta",
                    "wartosc": {
                      "jednostka": "kA",
                      "wartosc": 25.0
                    }
                  }
                ],
                "stan": "UNVALIDATED_INPUT"
              },
              "status_modelu": "NIE_DOTYCZY",
              "w_domenie_walidacji": null
            },
            "etykieta": {
              "etykieta_pl": "Kryterium spe\u0142nione \u2014 dow\u00f3d niepe\u0142ny",
              "semantyka": "ostrzegawcza"
            },
            "kompletnosc_dowodu": "NIEPELNY",
            "kryterium": {
              "opis_pl": "Pr\u0105d cieplny zast\u0119pczy zwarcia w punkcie zabudowy pola nie przekracza pr\u0105du kr\u00f3tkotrwa\u0142ego aparatu przeliczonego na czas wy\u0142\u0105czenia zwarcia",
              "relacja": "NIE_WIECEJ",
              "warunek_latex": "I_{th} \\le I_{thr}\\sqrt{\\min\\left(1,\\ \\frac{T_{kr}}{T_k}\\right)}",
              "warunek_wstepny_pl": null,
              "warunek_wstepny_podstawa": null
            },
            "kryterium_id": "substrat_stacji.wytrzymalosc.NN_BUS.cieplna",
            "limit": {
              "jednostka_obwiedni": null,
              "obwiednia": null,
              "pasmo": null,
              "podstawa": {
                "dokument": "znamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)",
                "jednostka_redakcyjna": "\u00a7 4.5 znamionowy pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany I_k i \u00a7 4.7 czas jego trwania t_k",
                "rodzaj": "ZALOZENIE_PROJEKTOWE",
                "status": "WSKAZANE",
                "uwagi_pl": null,
                "wydanie": "bie\u017c\u0105cy stan programu"
              },
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 25.0
              },
              "wersja_profilu": null,
              "zakres_stosowalnosci_pl": "pr\u0105d kr\u00f3tkotrwa\u0142y 25 kA / 1 s przeliczony na czas wy\u0142\u0105czenia T_k = 1 s"
            },
            "margines": {
              "definicja_latex": "m = x_{\\lim} - x",
              "niedefiniowalny": false,
              "powod_pl": null,
              "punkt_pl": "rozdzielnica \u2014 szyna nN 0,4 kV",
              "skala": {
                "jednostka": "kA",
                "wartosc": 25.0
              },
              "skala_rodzaj": "LIMIT",
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 7.926
              },
              "wzgledny": 0.31704
            },
            "niepewnosc": {
              "metoda_pl": null,
              "nie_dotyczy": true,
              "powod_pl": "wielko\u015b\u0107 wyznaczona wzorem zamkni\u0119tym z danych modelu \u2014 niepewno\u015b\u0107 numeryczna nie dotyczy, niepewno\u015b\u0107 danych wej\u015bciowych wyra\u017ca stan danych rekordu",
              "wartosc": null
            },
            "podstawa": {
              "dokument": "IEC 60865-1 (PN-EN 60865-1) Pr\u0105dy zwarciowe \u2014 obliczanie skutk\u00f3w",
              "jednostka_redakcyjna": "wytrzyma\u0142o\u015b\u0107 cieplna urz\u0105dze\u0144 elektrycznych: I_th \u2264 I_thr dla T_k \u2264 T_kr oraz I_th \u2264 I_thr\u00b7\u221a(T_kr/T_k) dla T_k \u2265 T_kr",
              "rodzaj": "NORMA",
              "status": "WSKAZANE",
              "uwagi_pl": "pr\u0105d cieplny zast\u0119pczy zwarcia por\u00f3wnany z pr\u0105dem kr\u00f3tkotrwa\u0142ym aparatu przeliczonym na czas wy\u0142\u0105czenia; przy czasie kr\u00f3tszym od znamionowego limitem jest sam pr\u0105d znamionowy (bez przeliczenia w g\u00f3r\u0119)",
              "wydanie": "2011"
            },
            "powody_niepelnosci": [
              "Obliczenie nie jest dowodem w\u0142a\u015bciwym: zdolno\u015b\u0107 obliczeniowa o poziomie dowodowym \u201emodel niezwalidowany\u201d (wymagany solver zwalidowany \u2014 najwy\u017cszy poziom dowodowy zdolno\u015bci).",
              "Dana przyj\u0119ta bez walidacji: pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany rozdzielnicy I_cw (1 s) = 25 kA, jako\u015b\u0107 danej: oszacowane \u2014 znami\u0119 przyj\u0119te w substracie stacji, nie dana karty producenta."
            ],
            "przedmiot": {
              "element_ref": "NN_BUS",
              "nazwa_pl": "rozdzielnica \u2014 szyna nN 0,4 kV",
              "opis_pl": "rozdzielnica szyny substratu stacji wobec pr\u0105d\u00f3w zwarciowych szyny"
            },
            "slad": [
              {
                "krok": "substrat_stacji.wytrzymalosc.NN_BUS.cieplna",
                "opis_pl": "pr\u0105d cieplny podany do oceny wobec I_th przeliczonego na czas wy\u0142\u0105czenia",
                "run_id": null,
                "wersja_silnika": null
              }
            ],
            "status_maszynowy": "SPELNIA",
            "stosowalnosc": {
              "dotyczy": true,
              "modul_istniejacy": null,
              "podstawa": null,
              "powod_pl": "wielko\u015b\u0107 wyznaczona w biegu dla tego obiektu modelu",
              "technologia": null,
              "typ_modulu": null,
              "warunek_wstepny_nieuruchomiony": false
            },
            "wyjasnienie": {
              "czego_brakuje": [],
              "przyczyna_pl": null,
              "zastrzezenia": [
                "Podstawa \u201eIEC 60865-1 (PN-EN 60865-1) Pr\u0105dy zwarciowe \u2014 obliczanie skutk\u00f3w\u201d, wydanie 2011, wytrzyma\u0142o\u015b\u0107 cieplna urz\u0105dze\u0144 elektrycznych: I_th \u2264 I_thr dla T_k \u2264 T_kr oraz I_th \u2264 I_thr\u00b7\u221a(T_kr/T_k) dla T_k \u2265 T_kr (norma): stan \u017ar\u00f3d\u0142a \u201ewskazane\u201d \u2014 dokument i jednostka redakcyjna wskazane, tre\u015b\u0107 dokumentu nie jest do\u0142\u0105czona do repozytorium.",
                "Podstawa \u201eznamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)\u201d, wydanie bie\u017c\u0105cy stan programu, \u00a7 4.5 znamionowy pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany I_k i \u00a7 4.7 czas jego trwania t_k (za\u0142o\u017cenie projektowe): stan \u017ar\u00f3d\u0142a \u201ewskazane\u201d \u2014 dokument i jednostka redakcyjna wskazane, tre\u015b\u0107 dokumentu nie jest do\u0142\u0105czona do repozytorium.",
                "Poziom dowodowy zdolno\u015bci narz\u0119dzia: \u201emodel niezwalidowany\u201d \u2014 obliczenie bez ustalonej poprawno\u015bci fizycznej nie jest dowodem regulacyjnym.",
                "Dana przyj\u0119ta bez walidacji: pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany rozdzielnicy I_cw (1 s) = 25 kA, jako\u015b\u0107 danej: oszacowane \u2014 znami\u0119 przyj\u0119te w substracie stacji, nie dana karty producenta.",
                "Zakres wa\u017cno\u015bci: Rozdzielnica (szyna nN 0,4 kV) wobec pr\u0105du udarowego i pr\u0105du cieplnego zast\u0119pczego zwarcia maksymalnego (IEC 60909) przy czasie zwarcia T_k = 1.0 s \u2014 wynik nie obejmuje: zwarcia niesymetryczne; rozdzia\u0142 pr\u0105du zwarcia na ga\u0142\u0119zie pola \u2014 por\u00f3wnany pe\u0142ny pr\u0105d podany do oceny."
              ],
              "zdanie_pl": "Pr\u0105d cieplny zast\u0119pczy zwarcia w punkcie zabudowy pola nie przekracza pr\u0105du kr\u00f3tkotrwa\u0142ego aparatu przeliczonego na czas wy\u0142\u0105czenia zwarcia (rozdzielnica \u2014 szyna nN 0,4 kV) \u2014 kryterium spe\u0142nione. Pr\u0105d cieplny zast\u0119pczy zwarcia w punkcie zabudowy: 17,07 kA wobec wymaganych \u2264 25 kA wg \u00a7 4.5 znamionowy pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany I_k i \u00a7 4.7 czas jego trwania t_k \u201eznamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)\u201d (margines +7,926 kA, punkt: rozdzielnica \u2014 szyna nN 0,4 kV, wzgl\u0119dnie +31,7 % warto\u015bci granicznej)."
            },
            "wynik": {
              "chwila_s": null,
              "metoda": "OBLICZENIE",
              "punkt_krytyczny_pl": "rozdzielnica \u2014 szyna nN 0,4 kV",
              "symbol_latex": "I_{th}",
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 17.074
              },
              "wielkosc_pl": "pr\u0105d cieplny zast\u0119pczy zwarcia w punkcie zabudowy"
            },
            "zakres_waznosci": {
              "model_urzadzenia": null,
              "ograniczniki": [],
              "opis_pl": "Rozdzielnica (szyna nN 0,4 kV) wobec pr\u0105du udarowego i pr\u0105du cieplnego zast\u0119pczego zwarcia maksymalnego (IEC 60909) przy czasie zwarcia T_k = 1.0 s.",
              "parametry_sieci": [],
              "regulator": null,
              "rodzaj_analizy": "SHORT_CIRCUIT",
              "symetria_zaklocenia": null,
              "technologia": null,
              "wykluczenia": [
                "zwarcia niesymetryczne",
                "rozdzia\u0142 pr\u0105du zwarcia na ga\u0142\u0119zie pola \u2014 por\u00f3wnany pe\u0142ny pr\u0105d podany do oceny"
              ]
            }
          },
          "dynamiczna": {
            "dowod": {
              "domena_pl": null,
              "metoda": "OBLICZENIE",
              "odniesienie": "tests/reference_networks/station_archetype_substrate.py",
              "poziom": "UNVALIDATED_MODEL",
              "rodzaj_twierdzenia": "STATIC_CALCULATION",
              "status_danych": {
                "dane_przyjete": [
                  {
                    "jakosc": "ESTIMATED",
                    "nazwa_pl": "pr\u0105d szczytowy wytrzymywany rozdzielnicy I_dyn",
                    "powod_pl": "I_dyn = 2.1\u00b7I_cw (klasa wy\u0142\u0105cznik\u00f3w nN), znami\u0119 przyj\u0119te w substracie stacji",
                    "wartosc": {
                      "jednostka": "kA",
                      "wartosc": 52.5
                    }
                  }
                ],
                "stan": "UNVALIDATED_INPUT"
              },
              "status_modelu": "NIE_DOTYCZY",
              "w_domenie_walidacji": null
            },
            "etykieta": {
              "etykieta_pl": "Kryterium spe\u0142nione \u2014 dow\u00f3d niepe\u0142ny",
              "semantyka": "ostrzegawcza"
            },
            "kompletnosc_dowodu": "NIEPELNY",
            "kryterium": {
              "opis_pl": "Pr\u0105d udarowy zwarcia w punkcie zabudowy pola nie przekracza znamionowego pr\u0105du szczytowego wytrzymywanego aparatu",
              "relacja": "NIE_WIECEJ",
              "warunek_latex": "i_p \\le I_{dyn}",
              "warunek_wstepny_pl": null,
              "warunek_wstepny_podstawa": null
            },
            "kryterium_id": "substrat_stacji.wytrzymalosc.NN_BUS.dynamiczna",
            "limit": {
              "jednostka_obwiedni": null,
              "obwiednia": null,
              "pasmo": null,
              "podstawa": {
                "dokument": "znamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)",
                "jednostka_redakcyjna": "\u00a7 4.6 znamionowy pr\u0105d szczytowy wytrzymywany I_p",
                "rodzaj": "ZALOZENIE_PROJEKTOWE",
                "status": "WSKAZANE",
                "uwagi_pl": null,
                "wydanie": "bie\u017c\u0105cy stan programu"
              },
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 52.5
              },
              "wersja_profilu": null,
              "zakres_stosowalnosci_pl": "znamionowy pr\u0105d szczytowy wytrzymywany aparatu I_dyn"
            },
            "margines": {
              "definicja_latex": "m = x_{\\lim} - x",
              "niedefiniowalny": false,
              "powod_pl": null,
              "punkt_pl": "rozdzielnica \u2014 szyna nN 0,4 kV",
              "skala": {
                "jednostka": "kA",
                "wartosc": 52.5
              },
              "skala_rodzaj": "LIMIT",
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 9.051
              },
              "wzgledny": 0.1724
            },
            "niepewnosc": {
              "metoda_pl": null,
              "nie_dotyczy": true,
              "powod_pl": "wielko\u015b\u0107 wyznaczona wzorem zamkni\u0119tym z danych modelu \u2014 niepewno\u015b\u0107 numeryczna nie dotyczy, niepewno\u015b\u0107 danych wej\u015bciowych wyra\u017ca stan danych rekordu",
              "wartosc": null
            },
            "podstawa": {
              "dokument": "IEC 62271-1 (PN-EN 62271-1) Wysokonapi\u0119ciowa aparatura rozdzielcza i sterownicza",
              "jednostka_redakcyjna": "\u00a7 4.6 znamionowy pr\u0105d szczytowy wytrzymywany I_p",
              "rodzaj": "NORMA",
              "status": "WSKAZANE",
              "uwagi_pl": "aparat wytrzymuje dynamicznie zwarcie, gdy pr\u0105d udarowy w miejscu zabudowy nie przekracza jego znamionowego pr\u0105du szczytowego wytrzymywanego",
              "wydanie": "2007"
            },
            "powody_niepelnosci": [
              "Obliczenie nie jest dowodem w\u0142a\u015bciwym: zdolno\u015b\u0107 obliczeniowa o poziomie dowodowym \u201emodel niezwalidowany\u201d (wymagany solver zwalidowany \u2014 najwy\u017cszy poziom dowodowy zdolno\u015bci).",
              "Dana przyj\u0119ta bez walidacji: pr\u0105d szczytowy wytrzymywany rozdzielnicy I_dyn = 52,5 kA, jako\u015b\u0107 danej: oszacowane \u2014 I_dyn = 2.1\u00b7I_cw (klasa wy\u0142\u0105cznik\u00f3w nN), znami\u0119 przyj\u0119te w substracie stacji."
            ],
            "przedmiot": {
              "element_ref": "NN_BUS",
              "nazwa_pl": "rozdzielnica \u2014 szyna nN 0,4 kV",
              "opis_pl": "rozdzielnica szyny substratu stacji wobec pr\u0105d\u00f3w zwarciowych szyny"
            },
            "slad": [
              {
                "krok": "substrat_stacji.wytrzymalosc.NN_BUS.dynamiczna",
                "opis_pl": "pr\u0105d udarowy podany do oceny wobec I_dyn pozycji katalogu",
                "run_id": null,
                "wersja_silnika": null
              }
            ],
            "status_maszynowy": "SPELNIA",
            "stosowalnosc": {
              "dotyczy": true,
              "modul_istniejacy": null,
              "podstawa": null,
              "powod_pl": "wielko\u015b\u0107 wyznaczona w biegu dla tego obiektu modelu",
              "technologia": null,
              "typ_modulu": null,
              "warunek_wstepny_nieuruchomiony": false
            },
            "wyjasnienie": {
              "czego_brakuje": [],
              "przyczyna_pl": null,
              "zastrzezenia": [
                "Podstawa \u201eIEC 62271-1 (PN-EN 62271-1) Wysokonapi\u0119ciowa aparatura rozdzielcza i sterownicza\u201d, wydanie 2007, \u00a7 4.6 znamionowy pr\u0105d szczytowy wytrzymywany I_p (norma): stan \u017ar\u00f3d\u0142a \u201ewskazane\u201d \u2014 dokument i jednostka redakcyjna wskazane, tre\u015b\u0107 dokumentu nie jest do\u0142\u0105czona do repozytorium.",
                "Podstawa \u201eznamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)\u201d, wydanie bie\u017c\u0105cy stan programu, \u00a7 4.6 znamionowy pr\u0105d szczytowy wytrzymywany I_p (za\u0142o\u017cenie projektowe): stan \u017ar\u00f3d\u0142a \u201ewskazane\u201d \u2014 dokument i jednostka redakcyjna wskazane, tre\u015b\u0107 dokumentu nie jest do\u0142\u0105czona do repozytorium.",
                "Poziom dowodowy zdolno\u015bci narz\u0119dzia: \u201emodel niezwalidowany\u201d \u2014 obliczenie bez ustalonej poprawno\u015bci fizycznej nie jest dowodem regulacyjnym.",
                "Dana przyj\u0119ta bez walidacji: pr\u0105d szczytowy wytrzymywany rozdzielnicy I_dyn = 52,5 kA, jako\u015b\u0107 danej: oszacowane \u2014 I_dyn = 2.1\u00b7I_cw (klasa wy\u0142\u0105cznik\u00f3w nN), znami\u0119 przyj\u0119te w substracie stacji.",
                "Zakres wa\u017cno\u015bci: Rozdzielnica (szyna nN 0,4 kV) wobec pr\u0105du udarowego i pr\u0105du cieplnego zast\u0119pczego zwarcia maksymalnego (IEC 60909) przy czasie zwarcia T_k = 1.0 s \u2014 wynik nie obejmuje: zwarcia niesymetryczne; rozdzia\u0142 pr\u0105du zwarcia na ga\u0142\u0119zie pola \u2014 por\u00f3wnany pe\u0142ny pr\u0105d podany do oceny."
              ],
              "zdanie_pl": "Pr\u0105d udarowy zwarcia w punkcie zabudowy pola nie przekracza znamionowego pr\u0105du szczytowego wytrzymywanego aparatu (rozdzielnica \u2014 szyna nN 0,4 kV) \u2014 kryterium spe\u0142nione. Pr\u0105d udarowy zwarcia w punkcie zabudowy: 43,45 kA wobec wymaganych \u2264 52,5 kA wg \u00a7 4.6 znamionowy pr\u0105d szczytowy wytrzymywany I_p \u201eznamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)\u201d (margines +9,051 kA, punkt: rozdzielnica \u2014 szyna nN 0,4 kV, wzgl\u0119dnie +17,24 % warto\u015bci granicznej)."
            },
            "wynik": {
              "chwila_s": null,
              "metoda": "OBLICZENIE",
              "punkt_krytyczny_pl": "rozdzielnica \u2014 szyna nN 0,4 kV",
              "symbol_latex": "i_p",
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 43.449
              },
              "wielkosc_pl": "pr\u0105d udarowy zwarcia w punkcie zabudowy"
            },
            "zakres_waznosci": {
              "model_urzadzenia": null,
              "ograniczniki": [],
              "opis_pl": "Rozdzielnica (szyna nN 0,4 kV) wobec pr\u0105du udarowego i pr\u0105du cieplnego zast\u0119pczego zwarcia maksymalnego (IEC 60909) przy czasie zwarcia T_k = 1.0 s.",
              "parametry_sieci": [],
              "regulator": null,
              "rodzaj_analizy": "SHORT_CIRCUIT",
              "symetria_zaklocenia": null,
              "technologia": null,
              "wykluczenia": [
                "zwarcia niesymetryczne",
                "rozdzia\u0142 pr\u0105du zwarcia na ga\u0142\u0119zie pola \u2014 por\u00f3wnany pe\u0142ny pr\u0105d podany do oceny"
              ]
            }
          }
        },
        "un_kv": 0.4
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
        "oceny": {
          "cieplna": {
            "dowod": {
              "domena_pl": null,
              "metoda": "OBLICZENIE",
              "odniesienie": "tests/reference_networks/station_archetype_substrate.py",
              "poziom": "UNVALIDATED_MODEL",
              "rodzaj_twierdzenia": "STATIC_CALCULATION",
              "status_danych": {
                "dane_przyjete": [
                  {
                    "jakosc": "ESTIMATED",
                    "nazwa_pl": "pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany rozdzielnicy I_cw (1 s)",
                    "powod_pl": "znami\u0119 przyj\u0119te w substracie stacji, nie dana karty producenta",
                    "wartosc": {
                      "jednostka": "kA",
                      "wartosc": 25.0
                    }
                  }
                ],
                "stan": "UNVALIDATED_INPUT"
              },
              "status_modelu": "NIE_DOTYCZY",
              "w_domenie_walidacji": null
            },
            "etykieta": {
              "etykieta_pl": "Kryterium spe\u0142nione \u2014 dow\u00f3d niepe\u0142ny",
              "semantyka": "ostrzegawcza"
            },
            "kompletnosc_dowodu": "NIEPELNY",
            "kryterium": {
              "opis_pl": "Pr\u0105d cieplny zast\u0119pczy zwarcia w punkcie zabudowy pola nie przekracza pr\u0105du kr\u00f3tkotrwa\u0142ego aparatu przeliczonego na czas wy\u0142\u0105czenia zwarcia",
              "relacja": "NIE_WIECEJ",
              "warunek_latex": "I_{th} \\le I_{thr}\\sqrt{\\min\\left(1,\\ \\frac{T_{kr}}{T_k}\\right)}",
              "warunek_wstepny_pl": null,
              "warunek_wstepny_podstawa": null
            },
            "kryterium_id": "substrat_stacji.wytrzymalosc.SN_BUS.cieplna",
            "limit": {
              "jednostka_obwiedni": null,
              "obwiednia": null,
              "pasmo": null,
              "podstawa": {
                "dokument": "znamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)",
                "jednostka_redakcyjna": "\u00a7 4.5 znamionowy pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany I_k i \u00a7 4.7 czas jego trwania t_k",
                "rodzaj": "ZALOZENIE_PROJEKTOWE",
                "status": "WSKAZANE",
                "uwagi_pl": null,
                "wydanie": "bie\u017c\u0105cy stan programu"
              },
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 25.0
              },
              "wersja_profilu": null,
              "zakres_stosowalnosci_pl": "pr\u0105d kr\u00f3tkotrwa\u0142y 25 kA / 1 s przeliczony na czas wy\u0142\u0105czenia T_k = 1 s"
            },
            "margines": {
              "definicja_latex": "m = x_{\\lim} - x",
              "niedefiniowalny": false,
              "powod_pl": null,
              "punkt_pl": "rozdzielnica \u2014 szyna SN 15 kV",
              "skala": {
                "jednostka": "kA",
                "wartosc": 25.0
              },
              "skala_rodzaj": "LIMIT",
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 15.5
              },
              "wzgledny": 0.62
            },
            "niepewnosc": {
              "metoda_pl": null,
              "nie_dotyczy": true,
              "powod_pl": "wielko\u015b\u0107 wyznaczona wzorem zamkni\u0119tym z danych modelu \u2014 niepewno\u015b\u0107 numeryczna nie dotyczy, niepewno\u015b\u0107 danych wej\u015bciowych wyra\u017ca stan danych rekordu",
              "wartosc": null
            },
            "podstawa": {
              "dokument": "IEC 60865-1 (PN-EN 60865-1) Pr\u0105dy zwarciowe \u2014 obliczanie skutk\u00f3w",
              "jednostka_redakcyjna": "wytrzyma\u0142o\u015b\u0107 cieplna urz\u0105dze\u0144 elektrycznych: I_th \u2264 I_thr dla T_k \u2264 T_kr oraz I_th \u2264 I_thr\u00b7\u221a(T_kr/T_k) dla T_k \u2265 T_kr",
              "rodzaj": "NORMA",
              "status": "WSKAZANE",
              "uwagi_pl": "pr\u0105d cieplny zast\u0119pczy zwarcia por\u00f3wnany z pr\u0105dem kr\u00f3tkotrwa\u0142ym aparatu przeliczonym na czas wy\u0142\u0105czenia; przy czasie kr\u00f3tszym od znamionowego limitem jest sam pr\u0105d znamionowy (bez przeliczenia w g\u00f3r\u0119)",
              "wydanie": "2011"
            },
            "powody_niepelnosci": [
              "Obliczenie nie jest dowodem w\u0142a\u015bciwym: zdolno\u015b\u0107 obliczeniowa o poziomie dowodowym \u201emodel niezwalidowany\u201d (wymagany solver zwalidowany \u2014 najwy\u017cszy poziom dowodowy zdolno\u015bci).",
              "Dana przyj\u0119ta bez walidacji: pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany rozdzielnicy I_cw (1 s) = 25 kA, jako\u015b\u0107 danej: oszacowane \u2014 znami\u0119 przyj\u0119te w substracie stacji, nie dana karty producenta."
            ],
            "przedmiot": {
              "element_ref": "SN_BUS",
              "nazwa_pl": "rozdzielnica \u2014 szyna SN 15 kV",
              "opis_pl": "rozdzielnica szyny substratu stacji wobec pr\u0105d\u00f3w zwarciowych szyny"
            },
            "slad": [
              {
                "krok": "substrat_stacji.wytrzymalosc.SN_BUS.cieplna",
                "opis_pl": "pr\u0105d cieplny podany do oceny wobec I_th przeliczonego na czas wy\u0142\u0105czenia",
                "run_id": null,
                "wersja_silnika": null
              }
            ],
            "status_maszynowy": "SPELNIA",
            "stosowalnosc": {
              "dotyczy": true,
              "modul_istniejacy": null,
              "podstawa": null,
              "powod_pl": "wielko\u015b\u0107 wyznaczona w biegu dla tego obiektu modelu",
              "technologia": null,
              "typ_modulu": null,
              "warunek_wstepny_nieuruchomiony": false
            },
            "wyjasnienie": {
              "czego_brakuje": [],
              "przyczyna_pl": null,
              "zastrzezenia": [
                "Podstawa \u201eIEC 60865-1 (PN-EN 60865-1) Pr\u0105dy zwarciowe \u2014 obliczanie skutk\u00f3w\u201d, wydanie 2011, wytrzyma\u0142o\u015b\u0107 cieplna urz\u0105dze\u0144 elektrycznych: I_th \u2264 I_thr dla T_k \u2264 T_kr oraz I_th \u2264 I_thr\u00b7\u221a(T_kr/T_k) dla T_k \u2265 T_kr (norma): stan \u017ar\u00f3d\u0142a \u201ewskazane\u201d \u2014 dokument i jednostka redakcyjna wskazane, tre\u015b\u0107 dokumentu nie jest do\u0142\u0105czona do repozytorium.",
                "Podstawa \u201eznamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)\u201d, wydanie bie\u017c\u0105cy stan programu, \u00a7 4.5 znamionowy pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany I_k i \u00a7 4.7 czas jego trwania t_k (za\u0142o\u017cenie projektowe): stan \u017ar\u00f3d\u0142a \u201ewskazane\u201d \u2014 dokument i jednostka redakcyjna wskazane, tre\u015b\u0107 dokumentu nie jest do\u0142\u0105czona do repozytorium.",
                "Poziom dowodowy zdolno\u015bci narz\u0119dzia: \u201emodel niezwalidowany\u201d \u2014 obliczenie bez ustalonej poprawno\u015bci fizycznej nie jest dowodem regulacyjnym.",
                "Dana przyj\u0119ta bez walidacji: pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany rozdzielnicy I_cw (1 s) = 25 kA, jako\u015b\u0107 danej: oszacowane \u2014 znami\u0119 przyj\u0119te w substracie stacji, nie dana karty producenta.",
                "Zakres wa\u017cno\u015bci: Rozdzielnica (szyna SN 15 kV) wobec pr\u0105du udarowego i pr\u0105du cieplnego zast\u0119pczego zwarcia maksymalnego (IEC 60909) przy czasie zwarcia T_k = 1.0 s \u2014 wynik nie obejmuje: zwarcia niesymetryczne; rozdzia\u0142 pr\u0105du zwarcia na ga\u0142\u0119zie pola \u2014 por\u00f3wnany pe\u0142ny pr\u0105d podany do oceny."
              ],
              "zdanie_pl": "Pr\u0105d cieplny zast\u0119pczy zwarcia w punkcie zabudowy pola nie przekracza pr\u0105du kr\u00f3tkotrwa\u0142ego aparatu przeliczonego na czas wy\u0142\u0105czenia zwarcia (rozdzielnica \u2014 szyna SN 15 kV) \u2014 kryterium spe\u0142nione. Pr\u0105d cieplny zast\u0119pczy zwarcia w punkcie zabudowy: 9,5 kA wobec wymaganych \u2264 25 kA wg \u00a7 4.5 znamionowy pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany I_k i \u00a7 4.7 czas jego trwania t_k \u201eznamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)\u201d (margines +15,5 kA, punkt: rozdzielnica \u2014 szyna SN 15 kV, wzgl\u0119dnie +62 % warto\u015bci granicznej)."
            },
            "wynik": {
              "chwila_s": null,
              "metoda": "OBLICZENIE",
              "punkt_krytyczny_pl": "rozdzielnica \u2014 szyna SN 15 kV",
              "symbol_latex": "I_{th}",
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 9.5
              },
              "wielkosc_pl": "pr\u0105d cieplny zast\u0119pczy zwarcia w punkcie zabudowy"
            },
            "zakres_waznosci": {
              "model_urzadzenia": null,
              "ograniczniki": [],
              "opis_pl": "Rozdzielnica (szyna SN 15 kV) wobec pr\u0105du udarowego i pr\u0105du cieplnego zast\u0119pczego zwarcia maksymalnego (IEC 60909) przy czasie zwarcia T_k = 1.0 s.",
              "parametry_sieci": [],
              "regulator": null,
              "rodzaj_analizy": "SHORT_CIRCUIT",
              "symetria_zaklocenia": null,
              "technologia": null,
              "wykluczenia": [
                "zwarcia niesymetryczne",
                "rozdzia\u0142 pr\u0105du zwarcia na ga\u0142\u0119zie pola \u2014 por\u00f3wnany pe\u0142ny pr\u0105d podany do oceny"
              ]
            }
          },
          "dynamiczna": {
            "dowod": {
              "domena_pl": null,
              "metoda": "OBLICZENIE",
              "odniesienie": "tests/reference_networks/station_archetype_substrate.py",
              "poziom": "UNVALIDATED_MODEL",
              "rodzaj_twierdzenia": "STATIC_CALCULATION",
              "status_danych": {
                "dane_przyjete": [
                  {
                    "jakosc": "ESTIMATED",
                    "nazwa_pl": "pr\u0105d szczytowy wytrzymywany rozdzielnicy I_dyn",
                    "powod_pl": "I_dyn = 2.5\u00b7I_cw (IEC 62271-1, rozdzielnica SN 50 Hz), znami\u0119 przyj\u0119te w substracie stacji",
                    "wartosc": {
                      "jednostka": "kA",
                      "wartosc": 62.5
                    }
                  }
                ],
                "stan": "UNVALIDATED_INPUT"
              },
              "status_modelu": "NIE_DOTYCZY",
              "w_domenie_walidacji": null
            },
            "etykieta": {
              "etykieta_pl": "Kryterium spe\u0142nione \u2014 dow\u00f3d niepe\u0142ny",
              "semantyka": "ostrzegawcza"
            },
            "kompletnosc_dowodu": "NIEPELNY",
            "kryterium": {
              "opis_pl": "Pr\u0105d udarowy zwarcia w punkcie zabudowy pola nie przekracza znamionowego pr\u0105du szczytowego wytrzymywanego aparatu",
              "relacja": "NIE_WIECEJ",
              "warunek_latex": "i_p \\le I_{dyn}",
              "warunek_wstepny_pl": null,
              "warunek_wstepny_podstawa": null
            },
            "kryterium_id": "substrat_stacji.wytrzymalosc.SN_BUS.dynamiczna",
            "limit": {
              "jednostka_obwiedni": null,
              "obwiednia": null,
              "pasmo": null,
              "podstawa": {
                "dokument": "znamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)",
                "jednostka_redakcyjna": "\u00a7 4.6 znamionowy pr\u0105d szczytowy wytrzymywany I_p",
                "rodzaj": "ZALOZENIE_PROJEKTOWE",
                "status": "WSKAZANE",
                "uwagi_pl": null,
                "wydanie": "bie\u017c\u0105cy stan programu"
              },
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 62.5
              },
              "wersja_profilu": null,
              "zakres_stosowalnosci_pl": "znamionowy pr\u0105d szczytowy wytrzymywany aparatu I_dyn"
            },
            "margines": {
              "definicja_latex": "m = x_{\\lim} - x",
              "niedefiniowalny": false,
              "powod_pl": null,
              "punkt_pl": "rozdzielnica \u2014 szyna SN 15 kV",
              "skala": {
                "jednostka": "kA",
                "wartosc": 62.5
              },
              "skala_rodzaj": "LIMIT",
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 45.916
              },
              "wzgledny": 0.734656
            },
            "niepewnosc": {
              "metoda_pl": null,
              "nie_dotyczy": true,
              "powod_pl": "wielko\u015b\u0107 wyznaczona wzorem zamkni\u0119tym z danych modelu \u2014 niepewno\u015b\u0107 numeryczna nie dotyczy, niepewno\u015b\u0107 danych wej\u015bciowych wyra\u017ca stan danych rekordu",
              "wartosc": null
            },
            "podstawa": {
              "dokument": "IEC 62271-1 (PN-EN 62271-1) Wysokonapi\u0119ciowa aparatura rozdzielcza i sterownicza",
              "jednostka_redakcyjna": "\u00a7 4.6 znamionowy pr\u0105d szczytowy wytrzymywany I_p",
              "rodzaj": "NORMA",
              "status": "WSKAZANE",
              "uwagi_pl": "aparat wytrzymuje dynamicznie zwarcie, gdy pr\u0105d udarowy w miejscu zabudowy nie przekracza jego znamionowego pr\u0105du szczytowego wytrzymywanego",
              "wydanie": "2007"
            },
            "powody_niepelnosci": [
              "Obliczenie nie jest dowodem w\u0142a\u015bciwym: zdolno\u015b\u0107 obliczeniowa o poziomie dowodowym \u201emodel niezwalidowany\u201d (wymagany solver zwalidowany \u2014 najwy\u017cszy poziom dowodowy zdolno\u015bci).",
              "Dana przyj\u0119ta bez walidacji: pr\u0105d szczytowy wytrzymywany rozdzielnicy I_dyn = 62,5 kA, jako\u015b\u0107 danej: oszacowane \u2014 I_dyn = 2.5\u00b7I_cw (IEC 62271-1, rozdzielnica SN 50 Hz), znami\u0119 przyj\u0119te w substracie stacji."
            ],
            "przedmiot": {
              "element_ref": "SN_BUS",
              "nazwa_pl": "rozdzielnica \u2014 szyna SN 15 kV",
              "opis_pl": "rozdzielnica szyny substratu stacji wobec pr\u0105d\u00f3w zwarciowych szyny"
            },
            "slad": [
              {
                "krok": "substrat_stacji.wytrzymalosc.SN_BUS.dynamiczna",
                "opis_pl": "pr\u0105d udarowy podany do oceny wobec I_dyn pozycji katalogu",
                "run_id": null,
                "wersja_silnika": null
              }
            ],
            "status_maszynowy": "SPELNIA",
            "stosowalnosc": {
              "dotyczy": true,
              "modul_istniejacy": null,
              "podstawa": null,
              "powod_pl": "wielko\u015b\u0107 wyznaczona w biegu dla tego obiektu modelu",
              "technologia": null,
              "typ_modulu": null,
              "warunek_wstepny_nieuruchomiony": false
            },
            "wyjasnienie": {
              "czego_brakuje": [],
              "przyczyna_pl": null,
              "zastrzezenia": [
                "Podstawa \u201eIEC 62271-1 (PN-EN 62271-1) Wysokonapi\u0119ciowa aparatura rozdzielcza i sterownicza\u201d, wydanie 2007, \u00a7 4.6 znamionowy pr\u0105d szczytowy wytrzymywany I_p (norma): stan \u017ar\u00f3d\u0142a \u201ewskazane\u201d \u2014 dokument i jednostka redakcyjna wskazane, tre\u015b\u0107 dokumentu nie jest do\u0142\u0105czona do repozytorium.",
                "Podstawa \u201eznamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)\u201d, wydanie bie\u017c\u0105cy stan programu, \u00a7 4.6 znamionowy pr\u0105d szczytowy wytrzymywany I_p (za\u0142o\u017cenie projektowe): stan \u017ar\u00f3d\u0142a \u201ewskazane\u201d \u2014 dokument i jednostka redakcyjna wskazane, tre\u015b\u0107 dokumentu nie jest do\u0142\u0105czona do repozytorium.",
                "Poziom dowodowy zdolno\u015bci narz\u0119dzia: \u201emodel niezwalidowany\u201d \u2014 obliczenie bez ustalonej poprawno\u015bci fizycznej nie jest dowodem regulacyjnym.",
                "Dana przyj\u0119ta bez walidacji: pr\u0105d szczytowy wytrzymywany rozdzielnicy I_dyn = 62,5 kA, jako\u015b\u0107 danej: oszacowane \u2014 I_dyn = 2.5\u00b7I_cw (IEC 62271-1, rozdzielnica SN 50 Hz), znami\u0119 przyj\u0119te w substracie stacji.",
                "Zakres wa\u017cno\u015bci: Rozdzielnica (szyna SN 15 kV) wobec pr\u0105du udarowego i pr\u0105du cieplnego zast\u0119pczego zwarcia maksymalnego (IEC 60909) przy czasie zwarcia T_k = 1.0 s \u2014 wynik nie obejmuje: zwarcia niesymetryczne; rozdzia\u0142 pr\u0105du zwarcia na ga\u0142\u0119zie pola \u2014 por\u00f3wnany pe\u0142ny pr\u0105d podany do oceny."
              ],
              "zdanie_pl": "Pr\u0105d udarowy zwarcia w punkcie zabudowy pola nie przekracza znamionowego pr\u0105du szczytowego wytrzymywanego aparatu (rozdzielnica \u2014 szyna SN 15 kV) \u2014 kryterium spe\u0142nione. Pr\u0105d udarowy zwarcia w punkcie zabudowy: 16,58 kA wobec wymaganych \u2264 62,5 kA wg \u00a7 4.6 znamionowy pr\u0105d szczytowy wytrzymywany I_p \u201eznamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)\u201d (margines +45,92 kA, punkt: rozdzielnica \u2014 szyna SN 15 kV, wzgl\u0119dnie +73,47 % warto\u015bci granicznej)."
            },
            "wynik": {
              "chwila_s": null,
              "metoda": "OBLICZENIE",
              "punkt_krytyczny_pl": "rozdzielnica \u2014 szyna SN 15 kV",
              "symbol_latex": "i_p",
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 16.584
              },
              "wielkosc_pl": "pr\u0105d udarowy zwarcia w punkcie zabudowy"
            },
            "zakres_waznosci": {
              "model_urzadzenia": null,
              "ograniczniki": [],
              "opis_pl": "Rozdzielnica (szyna SN 15 kV) wobec pr\u0105du udarowego i pr\u0105du cieplnego zast\u0119pczego zwarcia maksymalnego (IEC 60909) przy czasie zwarcia T_k = 1.0 s.",
              "parametry_sieci": [],
              "regulator": null,
              "rodzaj_analizy": "SHORT_CIRCUIT",
              "symetria_zaklocenia": null,
              "technologia": null,
              "wykluczenia": [
                "zwarcia niesymetryczne",
                "rozdzia\u0142 pr\u0105du zwarcia na ga\u0142\u0119zie pola \u2014 por\u00f3wnany pe\u0142ny pr\u0105d podany do oceny"
              ]
            }
          }
        },
        "un_kv": 15.0
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
        "oceny": {
          "cieplna": {
            "dowod": {
              "domena_pl": null,
              "metoda": "OBLICZENIE",
              "odniesienie": "tests/reference_networks/station_archetype_substrate.py",
              "poziom": "UNVALIDATED_MODEL",
              "rodzaj_twierdzenia": "STATIC_CALCULATION",
              "status_danych": {
                "dane_przyjete": [
                  {
                    "jakosc": "ESTIMATED",
                    "nazwa_pl": "pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany rozdzielnicy I_cw (1 s)",
                    "powod_pl": "znami\u0119 przyj\u0119te w substracie stacji, nie dana karty producenta",
                    "wartosc": {
                      "jednostka": "kA",
                      "wartosc": 25.0
                    }
                  }
                ],
                "stan": "UNVALIDATED_INPUT"
              },
              "status_modelu": "NIE_DOTYCZY",
              "w_domenie_walidacji": null
            },
            "etykieta": {
              "etykieta_pl": "Kryterium spe\u0142nione \u2014 dow\u00f3d niepe\u0142ny",
              "semantyka": "ostrzegawcza"
            },
            "kompletnosc_dowodu": "NIEPELNY",
            "kryterium": {
              "opis_pl": "Pr\u0105d cieplny zast\u0119pczy zwarcia w punkcie zabudowy pola nie przekracza pr\u0105du kr\u00f3tkotrwa\u0142ego aparatu przeliczonego na czas wy\u0142\u0105czenia zwarcia",
              "relacja": "NIE_WIECEJ",
              "warunek_latex": "I_{th} \\le I_{thr}\\sqrt{\\min\\left(1,\\ \\frac{T_{kr}}{T_k}\\right)}",
              "warunek_wstepny_pl": null,
              "warunek_wstepny_podstawa": null
            },
            "kryterium_id": "substrat_stacji.wytrzymalosc.ZKSN.cieplna",
            "limit": {
              "jednostka_obwiedni": null,
              "obwiednia": null,
              "pasmo": null,
              "podstawa": {
                "dokument": "znamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)",
                "jednostka_redakcyjna": "\u00a7 4.5 znamionowy pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany I_k i \u00a7 4.7 czas jego trwania t_k",
                "rodzaj": "ZALOZENIE_PROJEKTOWE",
                "status": "WSKAZANE",
                "uwagi_pl": null,
                "wydanie": "bie\u017c\u0105cy stan programu"
              },
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 25.0
              },
              "wersja_profilu": null,
              "zakres_stosowalnosci_pl": "pr\u0105d kr\u00f3tkotrwa\u0142y 25 kA / 1 s przeliczony na czas wy\u0142\u0105czenia T_k = 1 s"
            },
            "margines": {
              "definicja_latex": "m = x_{\\lim} - x",
              "niedefiniowalny": false,
              "powod_pl": null,
              "punkt_pl": "rozdzielnica \u2014 szyna SN 15 kV",
              "skala": {
                "jednostka": "kA",
                "wartosc": 25.0
              },
              "skala_rodzaj": "LIMIT",
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 15.5
              },
              "wzgledny": 0.62
            },
            "niepewnosc": {
              "metoda_pl": null,
              "nie_dotyczy": true,
              "powod_pl": "wielko\u015b\u0107 wyznaczona wzorem zamkni\u0119tym z danych modelu \u2014 niepewno\u015b\u0107 numeryczna nie dotyczy, niepewno\u015b\u0107 danych wej\u015bciowych wyra\u017ca stan danych rekordu",
              "wartosc": null
            },
            "podstawa": {
              "dokument": "IEC 60865-1 (PN-EN 60865-1) Pr\u0105dy zwarciowe \u2014 obliczanie skutk\u00f3w",
              "jednostka_redakcyjna": "wytrzyma\u0142o\u015b\u0107 cieplna urz\u0105dze\u0144 elektrycznych: I_th \u2264 I_thr dla T_k \u2264 T_kr oraz I_th \u2264 I_thr\u00b7\u221a(T_kr/T_k) dla T_k \u2265 T_kr",
              "rodzaj": "NORMA",
              "status": "WSKAZANE",
              "uwagi_pl": "pr\u0105d cieplny zast\u0119pczy zwarcia por\u00f3wnany z pr\u0105dem kr\u00f3tkotrwa\u0142ym aparatu przeliczonym na czas wy\u0142\u0105czenia; przy czasie kr\u00f3tszym od znamionowego limitem jest sam pr\u0105d znamionowy (bez przeliczenia w g\u00f3r\u0119)",
              "wydanie": "2011"
            },
            "powody_niepelnosci": [
              "Obliczenie nie jest dowodem w\u0142a\u015bciwym: zdolno\u015b\u0107 obliczeniowa o poziomie dowodowym \u201emodel niezwalidowany\u201d (wymagany solver zwalidowany \u2014 najwy\u017cszy poziom dowodowy zdolno\u015bci).",
              "Dana przyj\u0119ta bez walidacji: pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany rozdzielnicy I_cw (1 s) = 25 kA, jako\u015b\u0107 danej: oszacowane \u2014 znami\u0119 przyj\u0119te w substracie stacji, nie dana karty producenta."
            ],
            "przedmiot": {
              "element_ref": "ZKSN",
              "nazwa_pl": "rozdzielnica \u2014 szyna SN 15 kV",
              "opis_pl": "rozdzielnica szyny substratu stacji wobec pr\u0105d\u00f3w zwarciowych szyny"
            },
            "slad": [
              {
                "krok": "substrat_stacji.wytrzymalosc.ZKSN.cieplna",
                "opis_pl": "pr\u0105d cieplny podany do oceny wobec I_th przeliczonego na czas wy\u0142\u0105czenia",
                "run_id": null,
                "wersja_silnika": null
              }
            ],
            "status_maszynowy": "SPELNIA",
            "stosowalnosc": {
              "dotyczy": true,
              "modul_istniejacy": null,
              "podstawa": null,
              "powod_pl": "wielko\u015b\u0107 wyznaczona w biegu dla tego obiektu modelu",
              "technologia": null,
              "typ_modulu": null,
              "warunek_wstepny_nieuruchomiony": false
            },
            "wyjasnienie": {
              "czego_brakuje": [],
              "przyczyna_pl": null,
              "zastrzezenia": [
                "Podstawa \u201eIEC 60865-1 (PN-EN 60865-1) Pr\u0105dy zwarciowe \u2014 obliczanie skutk\u00f3w\u201d, wydanie 2011, wytrzyma\u0142o\u015b\u0107 cieplna urz\u0105dze\u0144 elektrycznych: I_th \u2264 I_thr dla T_k \u2264 T_kr oraz I_th \u2264 I_thr\u00b7\u221a(T_kr/T_k) dla T_k \u2265 T_kr (norma): stan \u017ar\u00f3d\u0142a \u201ewskazane\u201d \u2014 dokument i jednostka redakcyjna wskazane, tre\u015b\u0107 dokumentu nie jest do\u0142\u0105czona do repozytorium.",
                "Podstawa \u201eznamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)\u201d, wydanie bie\u017c\u0105cy stan programu, \u00a7 4.5 znamionowy pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany I_k i \u00a7 4.7 czas jego trwania t_k (za\u0142o\u017cenie projektowe): stan \u017ar\u00f3d\u0142a \u201ewskazane\u201d \u2014 dokument i jednostka redakcyjna wskazane, tre\u015b\u0107 dokumentu nie jest do\u0142\u0105czona do repozytorium.",
                "Poziom dowodowy zdolno\u015bci narz\u0119dzia: \u201emodel niezwalidowany\u201d \u2014 obliczenie bez ustalonej poprawno\u015bci fizycznej nie jest dowodem regulacyjnym.",
                "Dana przyj\u0119ta bez walidacji: pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany rozdzielnicy I_cw (1 s) = 25 kA, jako\u015b\u0107 danej: oszacowane \u2014 znami\u0119 przyj\u0119te w substracie stacji, nie dana karty producenta.",
                "Zakres wa\u017cno\u015bci: Rozdzielnica (szyna SN 15 kV) wobec pr\u0105du udarowego i pr\u0105du cieplnego zast\u0119pczego zwarcia maksymalnego (IEC 60909) przy czasie zwarcia T_k = 1.0 s \u2014 wynik nie obejmuje: zwarcia niesymetryczne; rozdzia\u0142 pr\u0105du zwarcia na ga\u0142\u0119zie pola \u2014 por\u00f3wnany pe\u0142ny pr\u0105d podany do oceny."
              ],
              "zdanie_pl": "Pr\u0105d cieplny zast\u0119pczy zwarcia w punkcie zabudowy pola nie przekracza pr\u0105du kr\u00f3tkotrwa\u0142ego aparatu przeliczonego na czas wy\u0142\u0105czenia zwarcia (rozdzielnica \u2014 szyna SN 15 kV) \u2014 kryterium spe\u0142nione. Pr\u0105d cieplny zast\u0119pczy zwarcia w punkcie zabudowy: 9,5 kA wobec wymaganych \u2264 25 kA wg \u00a7 4.5 znamionowy pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany I_k i \u00a7 4.7 czas jego trwania t_k \u201eznamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)\u201d (margines +15,5 kA, punkt: rozdzielnica \u2014 szyna SN 15 kV, wzgl\u0119dnie +62 % warto\u015bci granicznej)."
            },
            "wynik": {
              "chwila_s": null,
              "metoda": "OBLICZENIE",
              "punkt_krytyczny_pl": "rozdzielnica \u2014 szyna SN 15 kV",
              "symbol_latex": "I_{th}",
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 9.5
              },
              "wielkosc_pl": "pr\u0105d cieplny zast\u0119pczy zwarcia w punkcie zabudowy"
            },
            "zakres_waznosci": {
              "model_urzadzenia": null,
              "ograniczniki": [],
              "opis_pl": "Rozdzielnica (szyna SN 15 kV) wobec pr\u0105du udarowego i pr\u0105du cieplnego zast\u0119pczego zwarcia maksymalnego (IEC 60909) przy czasie zwarcia T_k = 1.0 s.",
              "parametry_sieci": [],
              "regulator": null,
              "rodzaj_analizy": "SHORT_CIRCUIT",
              "symetria_zaklocenia": null,
              "technologia": null,
              "wykluczenia": [
                "zwarcia niesymetryczne",
                "rozdzia\u0142 pr\u0105du zwarcia na ga\u0142\u0119zie pola \u2014 por\u00f3wnany pe\u0142ny pr\u0105d podany do oceny"
              ]
            }
          },
          "dynamiczna": {
            "dowod": {
              "domena_pl": null,
              "metoda": "OBLICZENIE",
              "odniesienie": "tests/reference_networks/station_archetype_substrate.py",
              "poziom": "UNVALIDATED_MODEL",
              "rodzaj_twierdzenia": "STATIC_CALCULATION",
              "status_danych": {
                "dane_przyjete": [
                  {
                    "jakosc": "ESTIMATED",
                    "nazwa_pl": "pr\u0105d szczytowy wytrzymywany rozdzielnicy I_dyn",
                    "powod_pl": "I_dyn = 2.5\u00b7I_cw (IEC 62271-1, rozdzielnica SN 50 Hz), znami\u0119 przyj\u0119te w substracie stacji",
                    "wartosc": {
                      "jednostka": "kA",
                      "wartosc": 62.5
                    }
                  }
                ],
                "stan": "UNVALIDATED_INPUT"
              },
              "status_modelu": "NIE_DOTYCZY",
              "w_domenie_walidacji": null
            },
            "etykieta": {
              "etykieta_pl": "Kryterium spe\u0142nione \u2014 dow\u00f3d niepe\u0142ny",
              "semantyka": "ostrzegawcza"
            },
            "kompletnosc_dowodu": "NIEPELNY",
            "kryterium": {
              "opis_pl": "Pr\u0105d udarowy zwarcia w punkcie zabudowy pola nie przekracza znamionowego pr\u0105du szczytowego wytrzymywanego aparatu",
              "relacja": "NIE_WIECEJ",
              "warunek_latex": "i_p \\le I_{dyn}",
              "warunek_wstepny_pl": null,
              "warunek_wstepny_podstawa": null
            },
            "kryterium_id": "substrat_stacji.wytrzymalosc.ZKSN.dynamiczna",
            "limit": {
              "jednostka_obwiedni": null,
              "obwiednia": null,
              "pasmo": null,
              "podstawa": {
                "dokument": "znamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)",
                "jednostka_redakcyjna": "\u00a7 4.6 znamionowy pr\u0105d szczytowy wytrzymywany I_p",
                "rodzaj": "ZALOZENIE_PROJEKTOWE",
                "status": "WSKAZANE",
                "uwagi_pl": null,
                "wydanie": "bie\u017c\u0105cy stan programu"
              },
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 62.5
              },
              "wersja_profilu": null,
              "zakres_stosowalnosci_pl": "znamionowy pr\u0105d szczytowy wytrzymywany aparatu I_dyn"
            },
            "margines": {
              "definicja_latex": "m = x_{\\lim} - x",
              "niedefiniowalny": false,
              "powod_pl": null,
              "punkt_pl": "rozdzielnica \u2014 szyna SN 15 kV",
              "skala": {
                "jednostka": "kA",
                "wartosc": 62.5
              },
              "skala_rodzaj": "LIMIT",
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 45.916
              },
              "wzgledny": 0.734656
            },
            "niepewnosc": {
              "metoda_pl": null,
              "nie_dotyczy": true,
              "powod_pl": "wielko\u015b\u0107 wyznaczona wzorem zamkni\u0119tym z danych modelu \u2014 niepewno\u015b\u0107 numeryczna nie dotyczy, niepewno\u015b\u0107 danych wej\u015bciowych wyra\u017ca stan danych rekordu",
              "wartosc": null
            },
            "podstawa": {
              "dokument": "IEC 62271-1 (PN-EN 62271-1) Wysokonapi\u0119ciowa aparatura rozdzielcza i sterownicza",
              "jednostka_redakcyjna": "\u00a7 4.6 znamionowy pr\u0105d szczytowy wytrzymywany I_p",
              "rodzaj": "NORMA",
              "status": "WSKAZANE",
              "uwagi_pl": "aparat wytrzymuje dynamicznie zwarcie, gdy pr\u0105d udarowy w miejscu zabudowy nie przekracza jego znamionowego pr\u0105du szczytowego wytrzymywanego",
              "wydanie": "2007"
            },
            "powody_niepelnosci": [
              "Obliczenie nie jest dowodem w\u0142a\u015bciwym: zdolno\u015b\u0107 obliczeniowa o poziomie dowodowym \u201emodel niezwalidowany\u201d (wymagany solver zwalidowany \u2014 najwy\u017cszy poziom dowodowy zdolno\u015bci).",
              "Dana przyj\u0119ta bez walidacji: pr\u0105d szczytowy wytrzymywany rozdzielnicy I_dyn = 62,5 kA, jako\u015b\u0107 danej: oszacowane \u2014 I_dyn = 2.5\u00b7I_cw (IEC 62271-1, rozdzielnica SN 50 Hz), znami\u0119 przyj\u0119te w substracie stacji."
            ],
            "przedmiot": {
              "element_ref": "ZKSN",
              "nazwa_pl": "rozdzielnica \u2014 szyna SN 15 kV",
              "opis_pl": "rozdzielnica szyny substratu stacji wobec pr\u0105d\u00f3w zwarciowych szyny"
            },
            "slad": [
              {
                "krok": "substrat_stacji.wytrzymalosc.ZKSN.dynamiczna",
                "opis_pl": "pr\u0105d udarowy podany do oceny wobec I_dyn pozycji katalogu",
                "run_id": null,
                "wersja_silnika": null
              }
            ],
            "status_maszynowy": "SPELNIA",
            "stosowalnosc": {
              "dotyczy": true,
              "modul_istniejacy": null,
              "podstawa": null,
              "powod_pl": "wielko\u015b\u0107 wyznaczona w biegu dla tego obiektu modelu",
              "technologia": null,
              "typ_modulu": null,
              "warunek_wstepny_nieuruchomiony": false
            },
            "wyjasnienie": {
              "czego_brakuje": [],
              "przyczyna_pl": null,
              "zastrzezenia": [
                "Podstawa \u201eIEC 62271-1 (PN-EN 62271-1) Wysokonapi\u0119ciowa aparatura rozdzielcza i sterownicza\u201d, wydanie 2007, \u00a7 4.6 znamionowy pr\u0105d szczytowy wytrzymywany I_p (norma): stan \u017ar\u00f3d\u0142a \u201ewskazane\u201d \u2014 dokument i jednostka redakcyjna wskazane, tre\u015b\u0107 dokumentu nie jest do\u0142\u0105czona do repozytorium.",
                "Podstawa \u201eznamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)\u201d, wydanie bie\u017c\u0105cy stan programu, \u00a7 4.6 znamionowy pr\u0105d szczytowy wytrzymywany I_p (za\u0142o\u017cenie projektowe): stan \u017ar\u00f3d\u0142a \u201ewskazane\u201d \u2014 dokument i jednostka redakcyjna wskazane, tre\u015b\u0107 dokumentu nie jest do\u0142\u0105czona do repozytorium.",
                "Poziom dowodowy zdolno\u015bci narz\u0119dzia: \u201emodel niezwalidowany\u201d \u2014 obliczenie bez ustalonej poprawno\u015bci fizycznej nie jest dowodem regulacyjnym.",
                "Dana przyj\u0119ta bez walidacji: pr\u0105d szczytowy wytrzymywany rozdzielnicy I_dyn = 62,5 kA, jako\u015b\u0107 danej: oszacowane \u2014 I_dyn = 2.5\u00b7I_cw (IEC 62271-1, rozdzielnica SN 50 Hz), znami\u0119 przyj\u0119te w substracie stacji.",
                "Zakres wa\u017cno\u015bci: Rozdzielnica (szyna SN 15 kV) wobec pr\u0105du udarowego i pr\u0105du cieplnego zast\u0119pczego zwarcia maksymalnego (IEC 60909) przy czasie zwarcia T_k = 1.0 s \u2014 wynik nie obejmuje: zwarcia niesymetryczne; rozdzia\u0142 pr\u0105du zwarcia na ga\u0142\u0119zie pola \u2014 por\u00f3wnany pe\u0142ny pr\u0105d podany do oceny."
              ],
              "zdanie_pl": "Pr\u0105d udarowy zwarcia w punkcie zabudowy pola nie przekracza znamionowego pr\u0105du szczytowego wytrzymywanego aparatu (rozdzielnica \u2014 szyna SN 15 kV) \u2014 kryterium spe\u0142nione. Pr\u0105d udarowy zwarcia w punkcie zabudowy: 16,58 kA wobec wymaganych \u2264 62,5 kA wg \u00a7 4.6 znamionowy pr\u0105d szczytowy wytrzymywany I_p \u201eznamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)\u201d (margines +45,92 kA, punkt: rozdzielnica \u2014 szyna SN 15 kV, wzgl\u0119dnie +73,47 % warto\u015bci granicznej)."
            },
            "wynik": {
              "chwila_s": null,
              "metoda": "OBLICZENIE",
              "punkt_krytyczny_pl": "rozdzielnica \u2014 szyna SN 15 kV",
              "symbol_latex": "i_p",
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 16.584
              },
              "wielkosc_pl": "pr\u0105d udarowy zwarcia w punkcie zabudowy"
            },
            "zakres_waznosci": {
              "model_urzadzenia": null,
              "ograniczniki": [],
              "opis_pl": "Rozdzielnica (szyna SN 15 kV) wobec pr\u0105du udarowego i pr\u0105du cieplnego zast\u0119pczego zwarcia maksymalnego (IEC 60909) przy czasie zwarcia T_k = 1.0 s.",
              "parametry_sieci": [],
              "regulator": null,
              "rodzaj_analizy": "SHORT_CIRCUIT",
              "symetria_zaklocenia": null,
              "technologia": null,
              "wykluczenia": [
                "zwarcia niesymetryczne",
                "rozdzia\u0142 pr\u0105du zwarcia na ga\u0142\u0119zie pola \u2014 por\u00f3wnany pe\u0142ny pr\u0105d podany do oceny"
              ]
            }
          }
        },
        "un_kv": 15.0
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
        "oceny": {
          "cieplna": {
            "dowod": {
              "domena_pl": null,
              "metoda": "OBLICZENIE",
              "odniesienie": "tests/reference_networks/station_archetype_substrate.py",
              "poziom": "UNVALIDATED_MODEL",
              "rodzaj_twierdzenia": "STATIC_CALCULATION",
              "status_danych": {
                "dane_przyjete": [
                  {
                    "jakosc": "ESTIMATED",
                    "nazwa_pl": "pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany rozdzielnicy I_cw (1 s)",
                    "powod_pl": "znami\u0119 przyj\u0119te w substracie stacji, nie dana karty producenta",
                    "wartosc": {
                      "jednostka": "kA",
                      "wartosc": 25.0
                    }
                  }
                ],
                "stan": "UNVALIDATED_INPUT"
              },
              "status_modelu": "NIE_DOTYCZY",
              "w_domenie_walidacji": null
            },
            "etykieta": {
              "etykieta_pl": "Kryterium spe\u0142nione \u2014 dow\u00f3d niepe\u0142ny",
              "semantyka": "ostrzegawcza"
            },
            "kompletnosc_dowodu": "NIEPELNY",
            "kryterium": {
              "opis_pl": "Pr\u0105d cieplny zast\u0119pczy zwarcia w punkcie zabudowy pola nie przekracza pr\u0105du kr\u00f3tkotrwa\u0142ego aparatu przeliczonego na czas wy\u0142\u0105czenia zwarcia",
              "relacja": "NIE_WIECEJ",
              "warunek_latex": "I_{th} \\le I_{thr}\\sqrt{\\min\\left(1,\\ \\frac{T_{kr}}{T_k}\\right)}",
              "warunek_wstepny_pl": null,
              "warunek_wstepny_podstawa": null
            },
            "kryterium_id": "substrat_stacji.wytrzymalosc.SEC_A.cieplna",
            "limit": {
              "jednostka_obwiedni": null,
              "obwiednia": null,
              "pasmo": null,
              "podstawa": {
                "dokument": "znamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)",
                "jednostka_redakcyjna": "\u00a7 4.5 znamionowy pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany I_k i \u00a7 4.7 czas jego trwania t_k",
                "rodzaj": "ZALOZENIE_PROJEKTOWE",
                "status": "WSKAZANE",
                "uwagi_pl": null,
                "wydanie": "bie\u017c\u0105cy stan programu"
              },
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 25.0
              },
              "wersja_profilu": null,
              "zakres_stosowalnosci_pl": "pr\u0105d kr\u00f3tkotrwa\u0142y 25 kA / 1 s przeliczony na czas wy\u0142\u0105czenia T_k = 1 s"
            },
            "margines": {
              "definicja_latex": "m = x_{\\lim} - x",
              "niedefiniowalny": false,
              "powod_pl": null,
              "punkt_pl": "rozdzielnica \u2014 szyna SN 15 kV",
              "skala": {
                "jednostka": "kA",
                "wartosc": 25.0
              },
              "skala_rodzaj": "LIMIT",
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 15.5
              },
              "wzgledny": 0.62
            },
            "niepewnosc": {
              "metoda_pl": null,
              "nie_dotyczy": true,
              "powod_pl": "wielko\u015b\u0107 wyznaczona wzorem zamkni\u0119tym z danych modelu \u2014 niepewno\u015b\u0107 numeryczna nie dotyczy, niepewno\u015b\u0107 danych wej\u015bciowych wyra\u017ca stan danych rekordu",
              "wartosc": null
            },
            "podstawa": {
              "dokument": "IEC 60865-1 (PN-EN 60865-1) Pr\u0105dy zwarciowe \u2014 obliczanie skutk\u00f3w",
              "jednostka_redakcyjna": "wytrzyma\u0142o\u015b\u0107 cieplna urz\u0105dze\u0144 elektrycznych: I_th \u2264 I_thr dla T_k \u2264 T_kr oraz I_th \u2264 I_thr\u00b7\u221a(T_kr/T_k) dla T_k \u2265 T_kr",
              "rodzaj": "NORMA",
              "status": "WSKAZANE",
              "uwagi_pl": "pr\u0105d cieplny zast\u0119pczy zwarcia por\u00f3wnany z pr\u0105dem kr\u00f3tkotrwa\u0142ym aparatu przeliczonym na czas wy\u0142\u0105czenia; przy czasie kr\u00f3tszym od znamionowego limitem jest sam pr\u0105d znamionowy (bez przeliczenia w g\u00f3r\u0119)",
              "wydanie": "2011"
            },
            "powody_niepelnosci": [
              "Obliczenie nie jest dowodem w\u0142a\u015bciwym: zdolno\u015b\u0107 obliczeniowa o poziomie dowodowym \u201emodel niezwalidowany\u201d (wymagany solver zwalidowany \u2014 najwy\u017cszy poziom dowodowy zdolno\u015bci).",
              "Dana przyj\u0119ta bez walidacji: pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany rozdzielnicy I_cw (1 s) = 25 kA, jako\u015b\u0107 danej: oszacowane \u2014 znami\u0119 przyj\u0119te w substracie stacji, nie dana karty producenta."
            ],
            "przedmiot": {
              "element_ref": "SEC_A",
              "nazwa_pl": "rozdzielnica \u2014 szyna SN 15 kV",
              "opis_pl": "rozdzielnica szyny substratu stacji wobec pr\u0105d\u00f3w zwarciowych szyny"
            },
            "slad": [
              {
                "krok": "substrat_stacji.wytrzymalosc.SEC_A.cieplna",
                "opis_pl": "pr\u0105d cieplny podany do oceny wobec I_th przeliczonego na czas wy\u0142\u0105czenia",
                "run_id": null,
                "wersja_silnika": null
              }
            ],
            "status_maszynowy": "SPELNIA",
            "stosowalnosc": {
              "dotyczy": true,
              "modul_istniejacy": null,
              "podstawa": null,
              "powod_pl": "wielko\u015b\u0107 wyznaczona w biegu dla tego obiektu modelu",
              "technologia": null,
              "typ_modulu": null,
              "warunek_wstepny_nieuruchomiony": false
            },
            "wyjasnienie": {
              "czego_brakuje": [],
              "przyczyna_pl": null,
              "zastrzezenia": [
                "Podstawa \u201eIEC 60865-1 (PN-EN 60865-1) Pr\u0105dy zwarciowe \u2014 obliczanie skutk\u00f3w\u201d, wydanie 2011, wytrzyma\u0142o\u015b\u0107 cieplna urz\u0105dze\u0144 elektrycznych: I_th \u2264 I_thr dla T_k \u2264 T_kr oraz I_th \u2264 I_thr\u00b7\u221a(T_kr/T_k) dla T_k \u2265 T_kr (norma): stan \u017ar\u00f3d\u0142a \u201ewskazane\u201d \u2014 dokument i jednostka redakcyjna wskazane, tre\u015b\u0107 dokumentu nie jest do\u0142\u0105czona do repozytorium.",
                "Podstawa \u201eznamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)\u201d, wydanie bie\u017c\u0105cy stan programu, \u00a7 4.5 znamionowy pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany I_k i \u00a7 4.7 czas jego trwania t_k (za\u0142o\u017cenie projektowe): stan \u017ar\u00f3d\u0142a \u201ewskazane\u201d \u2014 dokument i jednostka redakcyjna wskazane, tre\u015b\u0107 dokumentu nie jest do\u0142\u0105czona do repozytorium.",
                "Poziom dowodowy zdolno\u015bci narz\u0119dzia: \u201emodel niezwalidowany\u201d \u2014 obliczenie bez ustalonej poprawno\u015bci fizycznej nie jest dowodem regulacyjnym.",
                "Dana przyj\u0119ta bez walidacji: pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany rozdzielnicy I_cw (1 s) = 25 kA, jako\u015b\u0107 danej: oszacowane \u2014 znami\u0119 przyj\u0119te w substracie stacji, nie dana karty producenta.",
                "Zakres wa\u017cno\u015bci: Rozdzielnica (szyna SN 15 kV) wobec pr\u0105du udarowego i pr\u0105du cieplnego zast\u0119pczego zwarcia maksymalnego (IEC 60909) przy czasie zwarcia T_k = 1.0 s \u2014 wynik nie obejmuje: zwarcia niesymetryczne; rozdzia\u0142 pr\u0105du zwarcia na ga\u0142\u0119zie pola \u2014 por\u00f3wnany pe\u0142ny pr\u0105d podany do oceny."
              ],
              "zdanie_pl": "Pr\u0105d cieplny zast\u0119pczy zwarcia w punkcie zabudowy pola nie przekracza pr\u0105du kr\u00f3tkotrwa\u0142ego aparatu przeliczonego na czas wy\u0142\u0105czenia zwarcia (rozdzielnica \u2014 szyna SN 15 kV) \u2014 kryterium spe\u0142nione. Pr\u0105d cieplny zast\u0119pczy zwarcia w punkcie zabudowy: 9,5 kA wobec wymaganych \u2264 25 kA wg \u00a7 4.5 znamionowy pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany I_k i \u00a7 4.7 czas jego trwania t_k \u201eznamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)\u201d (margines +15,5 kA, punkt: rozdzielnica \u2014 szyna SN 15 kV, wzgl\u0119dnie +62 % warto\u015bci granicznej)."
            },
            "wynik": {
              "chwila_s": null,
              "metoda": "OBLICZENIE",
              "punkt_krytyczny_pl": "rozdzielnica \u2014 szyna SN 15 kV",
              "symbol_latex": "I_{th}",
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 9.5
              },
              "wielkosc_pl": "pr\u0105d cieplny zast\u0119pczy zwarcia w punkcie zabudowy"
            },
            "zakres_waznosci": {
              "model_urzadzenia": null,
              "ograniczniki": [],
              "opis_pl": "Rozdzielnica (szyna SN 15 kV) wobec pr\u0105du udarowego i pr\u0105du cieplnego zast\u0119pczego zwarcia maksymalnego (IEC 60909) przy czasie zwarcia T_k = 1.0 s.",
              "parametry_sieci": [],
              "regulator": null,
              "rodzaj_analizy": "SHORT_CIRCUIT",
              "symetria_zaklocenia": null,
              "technologia": null,
              "wykluczenia": [
                "zwarcia niesymetryczne",
                "rozdzia\u0142 pr\u0105du zwarcia na ga\u0142\u0119zie pola \u2014 por\u00f3wnany pe\u0142ny pr\u0105d podany do oceny"
              ]
            }
          },
          "dynamiczna": {
            "dowod": {
              "domena_pl": null,
              "metoda": "OBLICZENIE",
              "odniesienie": "tests/reference_networks/station_archetype_substrate.py",
              "poziom": "UNVALIDATED_MODEL",
              "rodzaj_twierdzenia": "STATIC_CALCULATION",
              "status_danych": {
                "dane_przyjete": [
                  {
                    "jakosc": "ESTIMATED",
                    "nazwa_pl": "pr\u0105d szczytowy wytrzymywany rozdzielnicy I_dyn",
                    "powod_pl": "I_dyn = 2.5\u00b7I_cw (IEC 62271-1, rozdzielnica SN 50 Hz), znami\u0119 przyj\u0119te w substracie stacji",
                    "wartosc": {
                      "jednostka": "kA",
                      "wartosc": 62.5
                    }
                  }
                ],
                "stan": "UNVALIDATED_INPUT"
              },
              "status_modelu": "NIE_DOTYCZY",
              "w_domenie_walidacji": null
            },
            "etykieta": {
              "etykieta_pl": "Kryterium spe\u0142nione \u2014 dow\u00f3d niepe\u0142ny",
              "semantyka": "ostrzegawcza"
            },
            "kompletnosc_dowodu": "NIEPELNY",
            "kryterium": {
              "opis_pl": "Pr\u0105d udarowy zwarcia w punkcie zabudowy pola nie przekracza znamionowego pr\u0105du szczytowego wytrzymywanego aparatu",
              "relacja": "NIE_WIECEJ",
              "warunek_latex": "i_p \\le I_{dyn}",
              "warunek_wstepny_pl": null,
              "warunek_wstepny_podstawa": null
            },
            "kryterium_id": "substrat_stacji.wytrzymalosc.SEC_A.dynamiczna",
            "limit": {
              "jednostka_obwiedni": null,
              "obwiednia": null,
              "pasmo": null,
              "podstawa": {
                "dokument": "znamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)",
                "jednostka_redakcyjna": "\u00a7 4.6 znamionowy pr\u0105d szczytowy wytrzymywany I_p",
                "rodzaj": "ZALOZENIE_PROJEKTOWE",
                "status": "WSKAZANE",
                "uwagi_pl": null,
                "wydanie": "bie\u017c\u0105cy stan programu"
              },
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 62.5
              },
              "wersja_profilu": null,
              "zakres_stosowalnosci_pl": "znamionowy pr\u0105d szczytowy wytrzymywany aparatu I_dyn"
            },
            "margines": {
              "definicja_latex": "m = x_{\\lim} - x",
              "niedefiniowalny": false,
              "powod_pl": null,
              "punkt_pl": "rozdzielnica \u2014 szyna SN 15 kV",
              "skala": {
                "jednostka": "kA",
                "wartosc": 62.5
              },
              "skala_rodzaj": "LIMIT",
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 45.916
              },
              "wzgledny": 0.734656
            },
            "niepewnosc": {
              "metoda_pl": null,
              "nie_dotyczy": true,
              "powod_pl": "wielko\u015b\u0107 wyznaczona wzorem zamkni\u0119tym z danych modelu \u2014 niepewno\u015b\u0107 numeryczna nie dotyczy, niepewno\u015b\u0107 danych wej\u015bciowych wyra\u017ca stan danych rekordu",
              "wartosc": null
            },
            "podstawa": {
              "dokument": "IEC 62271-1 (PN-EN 62271-1) Wysokonapi\u0119ciowa aparatura rozdzielcza i sterownicza",
              "jednostka_redakcyjna": "\u00a7 4.6 znamionowy pr\u0105d szczytowy wytrzymywany I_p",
              "rodzaj": "NORMA",
              "status": "WSKAZANE",
              "uwagi_pl": "aparat wytrzymuje dynamicznie zwarcie, gdy pr\u0105d udarowy w miejscu zabudowy nie przekracza jego znamionowego pr\u0105du szczytowego wytrzymywanego",
              "wydanie": "2007"
            },
            "powody_niepelnosci": [
              "Obliczenie nie jest dowodem w\u0142a\u015bciwym: zdolno\u015b\u0107 obliczeniowa o poziomie dowodowym \u201emodel niezwalidowany\u201d (wymagany solver zwalidowany \u2014 najwy\u017cszy poziom dowodowy zdolno\u015bci).",
              "Dana przyj\u0119ta bez walidacji: pr\u0105d szczytowy wytrzymywany rozdzielnicy I_dyn = 62,5 kA, jako\u015b\u0107 danej: oszacowane \u2014 I_dyn = 2.5\u00b7I_cw (IEC 62271-1, rozdzielnica SN 50 Hz), znami\u0119 przyj\u0119te w substracie stacji."
            ],
            "przedmiot": {
              "element_ref": "SEC_A",
              "nazwa_pl": "rozdzielnica \u2014 szyna SN 15 kV",
              "opis_pl": "rozdzielnica szyny substratu stacji wobec pr\u0105d\u00f3w zwarciowych szyny"
            },
            "slad": [
              {
                "krok": "substrat_stacji.wytrzymalosc.SEC_A.dynamiczna",
                "opis_pl": "pr\u0105d udarowy podany do oceny wobec I_dyn pozycji katalogu",
                "run_id": null,
                "wersja_silnika": null
              }
            ],
            "status_maszynowy": "SPELNIA",
            "stosowalnosc": {
              "dotyczy": true,
              "modul_istniejacy": null,
              "podstawa": null,
              "powod_pl": "wielko\u015b\u0107 wyznaczona w biegu dla tego obiektu modelu",
              "technologia": null,
              "typ_modulu": null,
              "warunek_wstepny_nieuruchomiony": false
            },
            "wyjasnienie": {
              "czego_brakuje": [],
              "przyczyna_pl": null,
              "zastrzezenia": [
                "Podstawa \u201eIEC 62271-1 (PN-EN 62271-1) Wysokonapi\u0119ciowa aparatura rozdzielcza i sterownicza\u201d, wydanie 2007, \u00a7 4.6 znamionowy pr\u0105d szczytowy wytrzymywany I_p (norma): stan \u017ar\u00f3d\u0142a \u201ewskazane\u201d \u2014 dokument i jednostka redakcyjna wskazane, tre\u015b\u0107 dokumentu nie jest do\u0142\u0105czona do repozytorium.",
                "Podstawa \u201eznamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)\u201d, wydanie bie\u017c\u0105cy stan programu, \u00a7 4.6 znamionowy pr\u0105d szczytowy wytrzymywany I_p (za\u0142o\u017cenie projektowe): stan \u017ar\u00f3d\u0142a \u201ewskazane\u201d \u2014 dokument i jednostka redakcyjna wskazane, tre\u015b\u0107 dokumentu nie jest do\u0142\u0105czona do repozytorium.",
                "Poziom dowodowy zdolno\u015bci narz\u0119dzia: \u201emodel niezwalidowany\u201d \u2014 obliczenie bez ustalonej poprawno\u015bci fizycznej nie jest dowodem regulacyjnym.",
                "Dana przyj\u0119ta bez walidacji: pr\u0105d szczytowy wytrzymywany rozdzielnicy I_dyn = 62,5 kA, jako\u015b\u0107 danej: oszacowane \u2014 I_dyn = 2.5\u00b7I_cw (IEC 62271-1, rozdzielnica SN 50 Hz), znami\u0119 przyj\u0119te w substracie stacji.",
                "Zakres wa\u017cno\u015bci: Rozdzielnica (szyna SN 15 kV) wobec pr\u0105du udarowego i pr\u0105du cieplnego zast\u0119pczego zwarcia maksymalnego (IEC 60909) przy czasie zwarcia T_k = 1.0 s \u2014 wynik nie obejmuje: zwarcia niesymetryczne; rozdzia\u0142 pr\u0105du zwarcia na ga\u0142\u0119zie pola \u2014 por\u00f3wnany pe\u0142ny pr\u0105d podany do oceny."
              ],
              "zdanie_pl": "Pr\u0105d udarowy zwarcia w punkcie zabudowy pola nie przekracza znamionowego pr\u0105du szczytowego wytrzymywanego aparatu (rozdzielnica \u2014 szyna SN 15 kV) \u2014 kryterium spe\u0142nione. Pr\u0105d udarowy zwarcia w punkcie zabudowy: 16,58 kA wobec wymaganych \u2264 62,5 kA wg \u00a7 4.6 znamionowy pr\u0105d szczytowy wytrzymywany I_p \u201eznamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)\u201d (margines +45,92 kA, punkt: rozdzielnica \u2014 szyna SN 15 kV, wzgl\u0119dnie +73,47 % warto\u015bci granicznej)."
            },
            "wynik": {
              "chwila_s": null,
              "metoda": "OBLICZENIE",
              "punkt_krytyczny_pl": "rozdzielnica \u2014 szyna SN 15 kV",
              "symbol_latex": "i_p",
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 16.584
              },
              "wielkosc_pl": "pr\u0105d udarowy zwarcia w punkcie zabudowy"
            },
            "zakres_waznosci": {
              "model_urzadzenia": null,
              "ograniczniki": [],
              "opis_pl": "Rozdzielnica (szyna SN 15 kV) wobec pr\u0105du udarowego i pr\u0105du cieplnego zast\u0119pczego zwarcia maksymalnego (IEC 60909) przy czasie zwarcia T_k = 1.0 s.",
              "parametry_sieci": [],
              "regulator": null,
              "rodzaj_analizy": "SHORT_CIRCUIT",
              "symetria_zaklocenia": null,
              "technologia": null,
              "wykluczenia": [
                "zwarcia niesymetryczne",
                "rozdzia\u0142 pr\u0105du zwarcia na ga\u0142\u0119zie pola \u2014 por\u00f3wnany pe\u0142ny pr\u0105d podany do oceny"
              ]
            }
          }
        },
        "un_kv": 15.0
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
        "oceny": {
          "cieplna": {
            "dowod": {
              "domena_pl": null,
              "metoda": "OBLICZENIE",
              "odniesienie": "tests/reference_networks/station_archetype_substrate.py",
              "poziom": "UNVALIDATED_MODEL",
              "rodzaj_twierdzenia": "STATIC_CALCULATION",
              "status_danych": {
                "dane_przyjete": [
                  {
                    "jakosc": "ESTIMATED",
                    "nazwa_pl": "pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany rozdzielnicy I_cw (1 s)",
                    "powod_pl": "znami\u0119 przyj\u0119te w substracie stacji, nie dana karty producenta",
                    "wartosc": {
                      "jednostka": "kA",
                      "wartosc": 25.0
                    }
                  }
                ],
                "stan": "UNVALIDATED_INPUT"
              },
              "status_modelu": "NIE_DOTYCZY",
              "w_domenie_walidacji": null
            },
            "etykieta": {
              "etykieta_pl": "Kryterium spe\u0142nione \u2014 dow\u00f3d niepe\u0142ny",
              "semantyka": "ostrzegawcza"
            },
            "kompletnosc_dowodu": "NIEPELNY",
            "kryterium": {
              "opis_pl": "Pr\u0105d cieplny zast\u0119pczy zwarcia w punkcie zabudowy pola nie przekracza pr\u0105du kr\u00f3tkotrwa\u0142ego aparatu przeliczonego na czas wy\u0142\u0105czenia zwarcia",
              "relacja": "NIE_WIECEJ",
              "warunek_latex": "I_{th} \\le I_{thr}\\sqrt{\\min\\left(1,\\ \\frac{T_{kr}}{T_k}\\right)}",
              "warunek_wstepny_pl": null,
              "warunek_wstepny_podstawa": null
            },
            "kryterium_id": "substrat_stacji.wytrzymalosc.SEC_B.cieplna",
            "limit": {
              "jednostka_obwiedni": null,
              "obwiednia": null,
              "pasmo": null,
              "podstawa": {
                "dokument": "znamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)",
                "jednostka_redakcyjna": "\u00a7 4.5 znamionowy pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany I_k i \u00a7 4.7 czas jego trwania t_k",
                "rodzaj": "ZALOZENIE_PROJEKTOWE",
                "status": "WSKAZANE",
                "uwagi_pl": null,
                "wydanie": "bie\u017c\u0105cy stan programu"
              },
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 25.0
              },
              "wersja_profilu": null,
              "zakres_stosowalnosci_pl": "pr\u0105d kr\u00f3tkotrwa\u0142y 25 kA / 1 s przeliczony na czas wy\u0142\u0105czenia T_k = 1 s"
            },
            "margines": {
              "definicja_latex": "m = x_{\\lim} - x",
              "niedefiniowalny": false,
              "powod_pl": null,
              "punkt_pl": "rozdzielnica \u2014 szyna SN 15 kV",
              "skala": {
                "jednostka": "kA",
                "wartosc": 25.0
              },
              "skala_rodzaj": "LIMIT",
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 15.5
              },
              "wzgledny": 0.62
            },
            "niepewnosc": {
              "metoda_pl": null,
              "nie_dotyczy": true,
              "powod_pl": "wielko\u015b\u0107 wyznaczona wzorem zamkni\u0119tym z danych modelu \u2014 niepewno\u015b\u0107 numeryczna nie dotyczy, niepewno\u015b\u0107 danych wej\u015bciowych wyra\u017ca stan danych rekordu",
              "wartosc": null
            },
            "podstawa": {
              "dokument": "IEC 60865-1 (PN-EN 60865-1) Pr\u0105dy zwarciowe \u2014 obliczanie skutk\u00f3w",
              "jednostka_redakcyjna": "wytrzyma\u0142o\u015b\u0107 cieplna urz\u0105dze\u0144 elektrycznych: I_th \u2264 I_thr dla T_k \u2264 T_kr oraz I_th \u2264 I_thr\u00b7\u221a(T_kr/T_k) dla T_k \u2265 T_kr",
              "rodzaj": "NORMA",
              "status": "WSKAZANE",
              "uwagi_pl": "pr\u0105d cieplny zast\u0119pczy zwarcia por\u00f3wnany z pr\u0105dem kr\u00f3tkotrwa\u0142ym aparatu przeliczonym na czas wy\u0142\u0105czenia; przy czasie kr\u00f3tszym od znamionowego limitem jest sam pr\u0105d znamionowy (bez przeliczenia w g\u00f3r\u0119)",
              "wydanie": "2011"
            },
            "powody_niepelnosci": [
              "Obliczenie nie jest dowodem w\u0142a\u015bciwym: zdolno\u015b\u0107 obliczeniowa o poziomie dowodowym \u201emodel niezwalidowany\u201d (wymagany solver zwalidowany \u2014 najwy\u017cszy poziom dowodowy zdolno\u015bci).",
              "Dana przyj\u0119ta bez walidacji: pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany rozdzielnicy I_cw (1 s) = 25 kA, jako\u015b\u0107 danej: oszacowane \u2014 znami\u0119 przyj\u0119te w substracie stacji, nie dana karty producenta."
            ],
            "przedmiot": {
              "element_ref": "SEC_B",
              "nazwa_pl": "rozdzielnica \u2014 szyna SN 15 kV",
              "opis_pl": "rozdzielnica szyny substratu stacji wobec pr\u0105d\u00f3w zwarciowych szyny"
            },
            "slad": [
              {
                "krok": "substrat_stacji.wytrzymalosc.SEC_B.cieplna",
                "opis_pl": "pr\u0105d cieplny podany do oceny wobec I_th przeliczonego na czas wy\u0142\u0105czenia",
                "run_id": null,
                "wersja_silnika": null
              }
            ],
            "status_maszynowy": "SPELNIA",
            "stosowalnosc": {
              "dotyczy": true,
              "modul_istniejacy": null,
              "podstawa": null,
              "powod_pl": "wielko\u015b\u0107 wyznaczona w biegu dla tego obiektu modelu",
              "technologia": null,
              "typ_modulu": null,
              "warunek_wstepny_nieuruchomiony": false
            },
            "wyjasnienie": {
              "czego_brakuje": [],
              "przyczyna_pl": null,
              "zastrzezenia": [
                "Podstawa \u201eIEC 60865-1 (PN-EN 60865-1) Pr\u0105dy zwarciowe \u2014 obliczanie skutk\u00f3w\u201d, wydanie 2011, wytrzyma\u0142o\u015b\u0107 cieplna urz\u0105dze\u0144 elektrycznych: I_th \u2264 I_thr dla T_k \u2264 T_kr oraz I_th \u2264 I_thr\u00b7\u221a(T_kr/T_k) dla T_k \u2265 T_kr (norma): stan \u017ar\u00f3d\u0142a \u201ewskazane\u201d \u2014 dokument i jednostka redakcyjna wskazane, tre\u015b\u0107 dokumentu nie jest do\u0142\u0105czona do repozytorium.",
                "Podstawa \u201eznamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)\u201d, wydanie bie\u017c\u0105cy stan programu, \u00a7 4.5 znamionowy pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany I_k i \u00a7 4.7 czas jego trwania t_k (za\u0142o\u017cenie projektowe): stan \u017ar\u00f3d\u0142a \u201ewskazane\u201d \u2014 dokument i jednostka redakcyjna wskazane, tre\u015b\u0107 dokumentu nie jest do\u0142\u0105czona do repozytorium.",
                "Poziom dowodowy zdolno\u015bci narz\u0119dzia: \u201emodel niezwalidowany\u201d \u2014 obliczenie bez ustalonej poprawno\u015bci fizycznej nie jest dowodem regulacyjnym.",
                "Dana przyj\u0119ta bez walidacji: pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany rozdzielnicy I_cw (1 s) = 25 kA, jako\u015b\u0107 danej: oszacowane \u2014 znami\u0119 przyj\u0119te w substracie stacji, nie dana karty producenta.",
                "Zakres wa\u017cno\u015bci: Rozdzielnica (szyna SN 15 kV) wobec pr\u0105du udarowego i pr\u0105du cieplnego zast\u0119pczego zwarcia maksymalnego (IEC 60909) przy czasie zwarcia T_k = 1.0 s \u2014 wynik nie obejmuje: zwarcia niesymetryczne; rozdzia\u0142 pr\u0105du zwarcia na ga\u0142\u0119zie pola \u2014 por\u00f3wnany pe\u0142ny pr\u0105d podany do oceny."
              ],
              "zdanie_pl": "Pr\u0105d cieplny zast\u0119pczy zwarcia w punkcie zabudowy pola nie przekracza pr\u0105du kr\u00f3tkotrwa\u0142ego aparatu przeliczonego na czas wy\u0142\u0105czenia zwarcia (rozdzielnica \u2014 szyna SN 15 kV) \u2014 kryterium spe\u0142nione. Pr\u0105d cieplny zast\u0119pczy zwarcia w punkcie zabudowy: 9,5 kA wobec wymaganych \u2264 25 kA wg \u00a7 4.5 znamionowy pr\u0105d kr\u00f3tkotrwa\u0142y wytrzymywany I_k i \u00a7 4.7 czas jego trwania t_k \u201eznamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)\u201d (margines +15,5 kA, punkt: rozdzielnica \u2014 szyna SN 15 kV, wzgl\u0119dnie +62 % warto\u015bci granicznej)."
            },
            "wynik": {
              "chwila_s": null,
              "metoda": "OBLICZENIE",
              "punkt_krytyczny_pl": "rozdzielnica \u2014 szyna SN 15 kV",
              "symbol_latex": "I_{th}",
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 9.5
              },
              "wielkosc_pl": "pr\u0105d cieplny zast\u0119pczy zwarcia w punkcie zabudowy"
            },
            "zakres_waznosci": {
              "model_urzadzenia": null,
              "ograniczniki": [],
              "opis_pl": "Rozdzielnica (szyna SN 15 kV) wobec pr\u0105du udarowego i pr\u0105du cieplnego zast\u0119pczego zwarcia maksymalnego (IEC 60909) przy czasie zwarcia T_k = 1.0 s.",
              "parametry_sieci": [],
              "regulator": null,
              "rodzaj_analizy": "SHORT_CIRCUIT",
              "symetria_zaklocenia": null,
              "technologia": null,
              "wykluczenia": [
                "zwarcia niesymetryczne",
                "rozdzia\u0142 pr\u0105du zwarcia na ga\u0142\u0119zie pola \u2014 por\u00f3wnany pe\u0142ny pr\u0105d podany do oceny"
              ]
            }
          },
          "dynamiczna": {
            "dowod": {
              "domena_pl": null,
              "metoda": "OBLICZENIE",
              "odniesienie": "tests/reference_networks/station_archetype_substrate.py",
              "poziom": "UNVALIDATED_MODEL",
              "rodzaj_twierdzenia": "STATIC_CALCULATION",
              "status_danych": {
                "dane_przyjete": [
                  {
                    "jakosc": "ESTIMATED",
                    "nazwa_pl": "pr\u0105d szczytowy wytrzymywany rozdzielnicy I_dyn",
                    "powod_pl": "I_dyn = 2.5\u00b7I_cw (IEC 62271-1, rozdzielnica SN 50 Hz), znami\u0119 przyj\u0119te w substracie stacji",
                    "wartosc": {
                      "jednostka": "kA",
                      "wartosc": 62.5
                    }
                  }
                ],
                "stan": "UNVALIDATED_INPUT"
              },
              "status_modelu": "NIE_DOTYCZY",
              "w_domenie_walidacji": null
            },
            "etykieta": {
              "etykieta_pl": "Kryterium spe\u0142nione \u2014 dow\u00f3d niepe\u0142ny",
              "semantyka": "ostrzegawcza"
            },
            "kompletnosc_dowodu": "NIEPELNY",
            "kryterium": {
              "opis_pl": "Pr\u0105d udarowy zwarcia w punkcie zabudowy pola nie przekracza znamionowego pr\u0105du szczytowego wytrzymywanego aparatu",
              "relacja": "NIE_WIECEJ",
              "warunek_latex": "i_p \\le I_{dyn}",
              "warunek_wstepny_pl": null,
              "warunek_wstepny_podstawa": null
            },
            "kryterium_id": "substrat_stacji.wytrzymalosc.SEC_B.dynamiczna",
            "limit": {
              "jednostka_obwiedni": null,
              "obwiednia": null,
              "pasmo": null,
              "podstawa": {
                "dokument": "znamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)",
                "jednostka_redakcyjna": "\u00a7 4.6 znamionowy pr\u0105d szczytowy wytrzymywany I_p",
                "rodzaj": "ZALOZENIE_PROJEKTOWE",
                "status": "WSKAZANE",
                "uwagi_pl": null,
                "wydanie": "bie\u017c\u0105cy stan programu"
              },
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 62.5
              },
              "wersja_profilu": null,
              "zakres_stosowalnosci_pl": "znamionowy pr\u0105d szczytowy wytrzymywany aparatu I_dyn"
            },
            "margines": {
              "definicja_latex": "m = x_{\\lim} - x",
              "niedefiniowalny": false,
              "powod_pl": null,
              "punkt_pl": "rozdzielnica \u2014 szyna SN 15 kV",
              "skala": {
                "jednostka": "kA",
                "wartosc": 62.5
              },
              "skala_rodzaj": "LIMIT",
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 45.916
              },
              "wzgledny": 0.734656
            },
            "niepewnosc": {
              "metoda_pl": null,
              "nie_dotyczy": true,
              "powod_pl": "wielko\u015b\u0107 wyznaczona wzorem zamkni\u0119tym z danych modelu \u2014 niepewno\u015b\u0107 numeryczna nie dotyczy, niepewno\u015b\u0107 danych wej\u015bciowych wyra\u017ca stan danych rekordu",
              "wartosc": null
            },
            "podstawa": {
              "dokument": "IEC 62271-1 (PN-EN 62271-1) Wysokonapi\u0119ciowa aparatura rozdzielcza i sterownicza",
              "jednostka_redakcyjna": "\u00a7 4.6 znamionowy pr\u0105d szczytowy wytrzymywany I_p",
              "rodzaj": "NORMA",
              "status": "WSKAZANE",
              "uwagi_pl": "aparat wytrzymuje dynamicznie zwarcie, gdy pr\u0105d udarowy w miejscu zabudowy nie przekracza jego znamionowego pr\u0105du szczytowego wytrzymywanego",
              "wydanie": "2007"
            },
            "powody_niepelnosci": [
              "Obliczenie nie jest dowodem w\u0142a\u015bciwym: zdolno\u015b\u0107 obliczeniowa o poziomie dowodowym \u201emodel niezwalidowany\u201d (wymagany solver zwalidowany \u2014 najwy\u017cszy poziom dowodowy zdolno\u015bci).",
              "Dana przyj\u0119ta bez walidacji: pr\u0105d szczytowy wytrzymywany rozdzielnicy I_dyn = 62,5 kA, jako\u015b\u0107 danej: oszacowane \u2014 I_dyn = 2.5\u00b7I_cw (IEC 62271-1, rozdzielnica SN 50 Hz), znami\u0119 przyj\u0119te w substracie stacji."
            ],
            "przedmiot": {
              "element_ref": "SEC_B",
              "nazwa_pl": "rozdzielnica \u2014 szyna SN 15 kV",
              "opis_pl": "rozdzielnica szyny substratu stacji wobec pr\u0105d\u00f3w zwarciowych szyny"
            },
            "slad": [
              {
                "krok": "substrat_stacji.wytrzymalosc.SEC_B.dynamiczna",
                "opis_pl": "pr\u0105d udarowy podany do oceny wobec I_dyn pozycji katalogu",
                "run_id": null,
                "wersja_silnika": null
              }
            ],
            "status_maszynowy": "SPELNIA",
            "stosowalnosc": {
              "dotyczy": true,
              "modul_istniejacy": null,
              "podstawa": null,
              "powod_pl": "wielko\u015b\u0107 wyznaczona w biegu dla tego obiektu modelu",
              "technologia": null,
              "typ_modulu": null,
              "warunek_wstepny_nieuruchomiony": false
            },
            "wyjasnienie": {
              "czego_brakuje": [],
              "przyczyna_pl": null,
              "zastrzezenia": [
                "Podstawa \u201eIEC 62271-1 (PN-EN 62271-1) Wysokonapi\u0119ciowa aparatura rozdzielcza i sterownicza\u201d, wydanie 2007, \u00a7 4.6 znamionowy pr\u0105d szczytowy wytrzymywany I_p (norma): stan \u017ar\u00f3d\u0142a \u201ewskazane\u201d \u2014 dokument i jednostka redakcyjna wskazane, tre\u015b\u0107 dokumentu nie jest do\u0142\u0105czona do repozytorium.",
                "Podstawa \u201eznamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)\u201d, wydanie bie\u017c\u0105cy stan programu, \u00a7 4.6 znamionowy pr\u0105d szczytowy wytrzymywany I_p (za\u0142o\u017cenie projektowe): stan \u017ar\u00f3d\u0142a \u201ewskazane\u201d \u2014 dokument i jednostka redakcyjna wskazane, tre\u015b\u0107 dokumentu nie jest do\u0142\u0105czona do repozytorium.",
                "Poziom dowodowy zdolno\u015bci narz\u0119dzia: \u201emodel niezwalidowany\u201d \u2014 obliczenie bez ustalonej poprawno\u015bci fizycznej nie jest dowodem regulacyjnym.",
                "Dana przyj\u0119ta bez walidacji: pr\u0105d szczytowy wytrzymywany rozdzielnicy I_dyn = 62,5 kA, jako\u015b\u0107 danej: oszacowane \u2014 I_dyn = 2.5\u00b7I_cw (IEC 62271-1, rozdzielnica SN 50 Hz), znami\u0119 przyj\u0119te w substracie stacji.",
                "Zakres wa\u017cno\u015bci: Rozdzielnica (szyna SN 15 kV) wobec pr\u0105du udarowego i pr\u0105du cieplnego zast\u0119pczego zwarcia maksymalnego (IEC 60909) przy czasie zwarcia T_k = 1.0 s \u2014 wynik nie obejmuje: zwarcia niesymetryczne; rozdzia\u0142 pr\u0105du zwarcia na ga\u0142\u0119zie pola \u2014 por\u00f3wnany pe\u0142ny pr\u0105d podany do oceny."
              ],
              "zdanie_pl": "Pr\u0105d udarowy zwarcia w punkcie zabudowy pola nie przekracza znamionowego pr\u0105du szczytowego wytrzymywanego aparatu (rozdzielnica \u2014 szyna SN 15 kV) \u2014 kryterium spe\u0142nione. Pr\u0105d udarowy zwarcia w punkcie zabudowy: 16,58 kA wobec wymaganych \u2264 62,5 kA wg \u00a7 4.6 znamionowy pr\u0105d szczytowy wytrzymywany I_p \u201eznamiona rozdzielnicy przyj\u0119te w substracie stacji (IEC 62271-1, nie karta producenta)\u201d (margines +45,92 kA, punkt: rozdzielnica \u2014 szyna SN 15 kV, wzgl\u0119dnie +73,47 % warto\u015bci granicznej)."
            },
            "wynik": {
              "chwila_s": null,
              "metoda": "OBLICZENIE",
              "punkt_krytyczny_pl": "rozdzielnica \u2014 szyna SN 15 kV",
              "symbol_latex": "i_p",
              "wartosc": {
                "jednostka": "kA",
                "wartosc": 16.584
              },
              "wielkosc_pl": "pr\u0105d udarowy zwarcia w punkcie zabudowy"
            },
            "zakres_waznosci": {
              "model_urzadzenia": null,
              "ograniczniki": [],
              "opis_pl": "Rozdzielnica (szyna SN 15 kV) wobec pr\u0105du udarowego i pr\u0105du cieplnego zast\u0119pczego zwarcia maksymalnego (IEC 60909) przy czasie zwarcia T_k = 1.0 s.",
              "parametry_sieci": [],
              "regulator": null,
              "rodzaj_analizy": "SHORT_CIRCUIT",
              "symetria_zaklocenia": null,
              "technologia": null,
              "wykluczenia": [
                "zwarcia niesymetryczne",
                "rozdzia\u0142 pr\u0105du zwarcia na ga\u0142\u0119zie pola \u2014 por\u00f3wnany pe\u0142ny pr\u0105d podany do oceny"
              ]
            }
          }
        },
        "un_kv": 15.0
      }
    },
    "enm_hash": "station-substrate/T4",
    "schema": "sld_short_circuit_companion_v1",
    "solver_method": "iec60909-3ph",
    "standard": "IEC 60909",
    "tk_s": 1.0
  }
};
