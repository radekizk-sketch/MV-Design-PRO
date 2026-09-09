"""JEDEN most ENM → pandapower (wyrocznia niezależna; CV-4.3 K3b).

Buduje sieć pandapower z ``EnergyNetworkModel`` TYMI SAMYMI regułami, którymi
``enm/mapping.py`` buduje IR solvera (semantyka „w ruchu": gałąź ``status == "closed"``,
transformator zawsze; łączniki i bezpieczniki jako łączniki szyna–szyna; liczba torów
z ``enm.models.liczba_torow``; Q wytwórcy z ``solver_input.moc_bierna_wytworcy``;
impedancja źródła z ``enm.mapping._source_positive_impedance_ohm`` — dla MAX i MIN
osobno (CV-4.3 K7: ``s_sc_max_mva``/``rx_max`` z Z_Qmax, ``s_sc_min_mva``/``rx_min``
z Z_Qmin, oba z TEJ SAMEJ funkcji mappera); współczynnik c
z ``network_model.core.voltage_factor.c_for_node``) — most nie ma własnej definicji
żadnej z tych reguł, więc rozjazd wyniku jest rozjazdem SOLVERA, nie mostu.

PROWENIENCJA (D-2, część Definition of Done K7): ``proweniencja(enm)`` oddaje rekord
z wersją pandapower, wersją mostu (``WERSJA_MOSTU``) i skrótem SHA-256 tego pliku,
haszem wejściowym ENM, deklarowanymi S''kQmax/S''kQmin (albo I''kQ), c_max/c_min pasma
i FAKTYCZNYMI parametrami ``ext_grid`` przekazanymi wyroczni. Rekord jest przypięty
w ``proweniencja_k7.json`` — rozjazd wersji pandapower albo mostu wobec zapisanej
wywala test (do tej karty referencje mówiły 3.4.0, CI instalowało 3.5.4 i nic tego
nie sprawdzało).

ZAKRES scenariusza MIN (jawny): Z_Qmin źródeł + c_min w węźle zwarcia. Korekta
temperaturowa rezystancji linii/kabli (tor kanoniczny: ``build_min_scenario_graph``)
NIE jest odwzorowana (pandapower wymagałby ``endtemp_degree`` per linia) — parytet
MIN dowodzi się na sieci bez gałęzi liniowych; sieć z liniami w MIN = ``ValueError``.

ZAKRES (jawny): szyny, linie/kable (R, X, B na km, tory równoległe), łączniki i
bezpieczniki, transformatory dwuuzwojeniowe (uk, Pk, i0, P0, grupa połączeń jako
przesunięcie kątowe, zaczep stały), źródła sieciowe (``ext_grid`` z mocą zwarciową
odtworzoną z Z_Q i c — po CV-4.3 K6 równą deklarowanemu ``sk3_mva``), odbiory stałomocowe, wytwórcy PQ (``sgen``) i wytwórcy z
regulacją napięcia (``gen``). Element spoza zakresu (odbiór ZIP, bateria
kondensatorów, maszyna wirująca jako źródło zwarciowe) = ``ValueError`` z nazwą —
wyrocznia nie ręczy za to, czego nie modeluje.

Import pandapower LENIWY (fixture/funkcja) — moduł jest importowalny w głównym venv
(gdzie pandapower nie ma), a testy z markerem ``pandapower`` biegną wyłącznie w
izolowanym jobie CI ``pandapower-cross-validation`` (scipy<1.17).
"""

from __future__ import annotations

import math
from typing import Any

from enm.hash import compute_input_hash
from enm.mapping import (
    _source_positive_impedance_ohm,
    impedancja_zrodla_sieciowego,
    map_enm_to_network_graph,
    ref_to_graph_id,
)
from enm.models import (
    Cable,
    EnergyNetworkModel,
    FuseBranch,
    OverheadLine,
    SwitchBranch,
    liczba_torow,
)
from network_model.core.voltage_factor import Scenario, c_for_node
from network_model.solvers.power_flow_newton_internal import transformer_phase_shift_rad
from network_model.solvers.power_flow_zip import zip_coeffs_from_materialized_params
from solver_input.moc_bierna_wytworcy import moc_bierna_wytworcy

#: Tolerancja napięcia nN dla pandapower (``lv_tol_percent``): 6 % ⇒ c_max = 1,05 dla
#: U_n ≤ 1 kV — tak samo jak ``voltage_factor.c_for_node`` (IEC 60909-0 Tab. 1).
LV_TOL_PERCENT = 6

#: Grupa połączeń podstawiana przez ``enm/mapping.py`` przy braku w modelu.
GRUPA_DOMYSLNA = "Dyn11"

#: Wersja reguł mostu (D-2): podnoszona przy KAŻDEJ zmianie odwzorowania ENM → pandapower.
#: "1" = CV-4.3 K3b (rozpływ per wyspa, zwarcie 3F MAX); "2" = CV-4.3 K7 (ext_grid z
#: parametrami MIN z Z_Qmin, proweniencja). Skrót SHA-256 pliku w rekordzie proweniencji
#: identyfikuje dokładną treść mostu niezależnie od tej etykiety.
WERSJA_MOSTU = "2"


def _pandapower_wersja() -> str:
    return str(_pandapower().__version__)


def _skrot_mostu() -> str:
    import hashlib
    from pathlib import Path

    return hashlib.sha256(Path(__file__).read_bytes()).hexdigest()


def _pandapower() -> Any:
    import pandapower as pp  # type: ignore[import-not-found]

    return pp


def _stopnie_z_grupy(vector_group: str | None) -> float:
    """``shift_degree`` pandapower = kąt, o który strona nN OPÓŹNIA się za SN (Dyn5 → 150°,
    Dyn11 → 330°); solver kanoniczny opisuje tę samą grupę jako wyprzedzenie strony nN
    (``transformer_phase_shift_rad``: Dyn5 → −150°, Dyn11 → +30°) — stąd znak i modulo."""
    return (-math.degrees(transformer_phase_shift_rad(vector_group or GRUPA_DOMYSLNA))) % 360.0


def _parametry_ext_grid(source: Any, u_kv: float) -> dict[str, float]:
    """``s_sc_max_mva``/``rx_max`` z Z_Qmax i ``s_sc_min_mva``/``rx_min`` z Z_Qmin —
    oba z ``enm.mapping._source_positive_impedance_ohm`` (jedna funkcja mappera).

    pandapower: Z_Q = c·U²/s_sc (IEC 60909-0 eq. 6; c_max dla ``case="max"``, c_min dla
    ``case="min"``) — odtwarzamy s_sc z impedancji IR, żeby po obu stronach stała TA SAMA
    Z_Q. Po CV-4.3 K6 ``s_sc_max_mva`` jest RÓWNE deklarowanemu ``sk3_mva`` (test
    ``test_ext_grid_s_sc_rowne_deklarowanemu_sk``); po K7 ``s_sc_min_mva`` jest RÓWNE
    deklarowanemu ``sk3_min_mva`` (test ``test_ext_grid_s_sc_min_rowne_deklarowanemu_sk_min``),
    a bez danych MIN wynosi (c_min/c_max)·S''kQmax — dokładnie założenie
    ``source.sk_min_missing`` mappera (Z_Qmin = Z_Qmax), nie liczba wymyślona przez most.
    """
    z_max = _source_positive_impedance_ohm(source, u_kv, "MAX")
    z_min = _source_positive_impedance_ohm(source, u_kv, "MIN")
    if z_max is None or z_max == 0 or z_min is None or z_min == 0:
        raise ValueError(f"Źródło {source.ref_id} bez impedancji zwarciowej")
    return {
        "s_sc_max_mva": c_for_node(u_kv, "MAX") * u_kv**2 / abs(z_max),
        "rx_max": z_max.real / z_max.imag,
        "s_sc_min_mva": c_for_node(u_kv, "MIN") * u_kv**2 / abs(z_min),
        "rx_min": z_min.real / z_min.imag,
    }


def zbuduj_siec(
    enm: EnergyNetworkModel, *, z_wytworcami: bool = True
) -> tuple[Any, dict[str, int]]:
    """Sieć pandapower z ENM + odwzorowanie ``bus_ref → indeks szyny``.

    ``z_wytworcami=False`` pomija wytwórców (porównanie zwarcia z wkładem samej sieci
    Thevenina — ``ik_thevenin_a`` solvera kanonicznego; falownik w IEC 60909 to źródło
    prądowe o innym modelu wkładu niż ``sgen`` pandapower). Źródła sieciowe dostają
    komplet parametrów MAX i MIN (``_parametry_ext_grid``), więc ta sama sieć służy
    ``calc_sc(case="max")`` i ``calc_sc(case="min")``.
    """
    pp = _pandapower()
    # Karta W3-F (§0.6, 2026-09-09): częstotliwość SIECI POD TESTEM (nagłówek
    # ENM), nie literał modułu (usunięty stąd `CZESTOTLIWOSC_HZ = 50.0`) —
    # wyrocznia czyta realną częstotliwość studium, żeby sieć 60 Hz (gdyby się
    # pojawiła w rejestrze złotych sieci) nie dostała po cichu 50 Hz.
    czestotliwosc_hz = enm.header.defaults.frequency_hz
    net = pp.create_empty_network(sn_mva=100.0, f_hz=czestotliwosc_hz)
    szyny: dict[str, int] = {}
    napiecie: dict[str, float] = {}
    for bus in sorted(enm.buses, key=lambda b: b.ref_id):
        szyny[bus.ref_id] = pp.create_bus(net, vn_kv=bus.voltage_kv, name=bus.ref_id)
        napiecie[bus.ref_id] = bus.voltage_kv

    for branch in sorted(enm.branches, key=lambda b: b.ref_id):
        if branch.from_bus_ref not in szyny or branch.to_bus_ref not in szyny:
            continue
        od, do = szyny[branch.from_bus_ref], szyny[branch.to_bus_ref]
        if isinstance(branch, OverheadLine | Cable):
            tory = liczba_torow(branch)
            b_s_km = branch.b_siemens_per_km or 0.0
            pp.create_line_from_parameters(
                net,
                od,
                do,
                length_km=branch.length_km,
                r_ohm_per_km=branch.r_ohm_per_km,
                x_ohm_per_km=branch.x_ohm_per_km,
                c_nf_per_km=b_s_km * 1e9 / (2.0 * math.pi * czestotliwosc_hz),
                max_i_ka=1.0,
                parallel=tory,
                in_service=branch.status == "closed",
                name=branch.ref_id,
            )
        elif isinstance(branch, SwitchBranch | FuseBranch):
            pp.create_switch(
                net, od, do, et="b", closed=branch.status == "closed", name=branch.ref_id
            )
        else:
            raise ValueError(f"Most pandapower nie modeluje gałęzi typu {type(branch).__name__}")

    for trafo in sorted(enm.transformers, key=lambda t: t.ref_id):
        if trafo.hv_bus_ref not in szyny or trafo.lv_bus_ref not in szyny:
            continue
        zaczep: dict[str, Any] = {}
        if trafo.tap_position is not None and trafo.tap_position != 0:
            zaczep = {
                "tap_side": "hv",
                "tap_neutral": 0,
                "tap_pos": trafo.tap_position,
                "tap_min": trafo.tap_min if trafo.tap_min is not None else trafo.tap_position,
                "tap_max": trafo.tap_max if trafo.tap_max is not None else trafo.tap_position,
                "tap_step_percent": (
                    trafo.tap_step_percent if trafo.tap_step_percent is not None else 2.5
                ),
            }
        pp.create_transformer_from_parameters(
            net,
            szyny[trafo.hv_bus_ref],
            szyny[trafo.lv_bus_ref],
            sn_mva=trafo.sn_mva,
            vn_hv_kv=trafo.uhv_kv,
            vn_lv_kv=trafo.ulv_kv,
            vkr_percent=trafo.pk_kw / (10.0 * trafo.sn_mva),
            vk_percent=trafo.uk_percent,
            pfe_kw=trafo.p0_kw or 0.0,
            i0_percent=trafo.i0_percent or 0.0,
            shift_degree=_stopnie_z_grupy(trafo.vector_group),
            parallel=liczba_torow(trafo),
            name=trafo.ref_id,
            **zaczep,
        )

    for source in sorted(enm.sources, key=lambda s: s.ref_id):
        if source.bus_ref not in szyny:
            raise ValueError(f"Źródło {source.ref_id} na nieznanej szynie {source.bus_ref}")
        u_kv = napiecie[source.bus_ref]
        pp.create_ext_grid(
            net,
            szyny[source.bus_ref],
            vm_pu=1.0,
            va_degree=0.0,
            name=source.ref_id,
            **_parametry_ext_grid(source, u_kv),
        )

    for load in sorted(enm.loads, key=lambda ld: ld.ref_id):
        if load.bus_ref not in szyny:
            continue
        if zip_coeffs_from_materialized_params(load.materialized_params) is not None:
            raise ValueError(f"Most pandapower nie modeluje odbioru ZIP ({load.ref_id})")
        pp.create_load(
            net, szyny[load.bus_ref], p_mw=load.p_mw, q_mvar=load.q_mvar, name=load.ref_id
        )

    if getattr(enm, "shunt_capacitors", None):
        raise ValueError("Most pandapower nie modeluje baterii kondensatorów")

    if z_wytworcami:
        for gen in sorted(enm.generators, key=lambda g: g.ref_id):
            if gen.bus_ref not in szyny:
                continue
            meta = gen.meta if isinstance(gen.meta, dict) else {}
            if str(meta.get("control_mode") or "") == "REGULACJA_NAPIECIA":
                pp.create_gen(
                    net,
                    szyny[gen.bus_ref],
                    p_mw=gen.p_mw,
                    vm_pu=float(meta["u_set_pu"]),
                    min_q_mvar=float(meta["q_min_mvar"]),
                    max_q_mvar=float(meta["q_max_mvar"]),
                    name=gen.ref_id,
                )
                continue
            q_mvar = moc_bierna_wytworcy(gen, gen.materialized_params).q_mvar
            if q_mvar is None:
                raise ValueError(f"Wytwórca {gen.ref_id} bez mocy biernej (Q nieznane)")
            pp.create_sgen(net, szyny[gen.bus_ref], p_mw=gen.p_mw, q_mvar=q_mvar, name=gen.ref_id)
    return net, szyny


def rozplyw(enm: EnergyNetworkModel) -> dict[str, Any]:
    """Rozpływ pandapower: ``{"szyny": {bus_ref: (vm_pu, va_deg)}, "zrodla": {ref: (p_mw, q_mvar)}}``.

    ``trafo_model="pi"`` — ten sam model gałęzi transformatorowej co
    ``TransformerBranch`` (admitancja magnesująca dzielona na oba końce).
    """
    pp = _pandapower()
    net, szyny = zbuduj_siec(enm)
    # ``init="auto"`` = start z rozpływu DC przy liczeniu kątów: grupa połączeń
    # (Dyn5: −150°) czyni start płaski (0°) punktem, z którego NR pandapower nie
    # zbiega (pomiar 2026-09-06: 10 iteracji bez zbieżności); solver kanoniczny
    # zaszczepia kąty przesunięciem grupy (``_seed_phase_shift_angles``) — to jego
    # odpowiednik tego startu.
    pp.runpp(
        net,
        algorithm="nr",
        init="auto",
        max_iteration=50,
        tolerance_mva=1e-10,
        trafo_model="pi",
        calculate_voltage_angles=True,
        numba=False,
    )
    wynik_szyn = {
        ref: (float(net.res_bus.vm_pu[idx]), float(net.res_bus.va_degree[idx]))
        for ref, idx in szyny.items()
    }
    zrodla = {
        str(net.ext_grid.name[idx]): (
            float(net.res_ext_grid.p_mw[idx]),
            float(net.res_ext_grid.q_mvar[idx]),
        )
        for idx in net.ext_grid.index
    }
    return {"szyny": wynik_szyn, "zrodla": zrodla}


def zwarcie_3f(
    enm: EnergyNetworkModel, scenariusz: Scenario = "MAX", *, k_t_w_min: bool = False
) -> dict[str, float]:
    """Ik'' [A] zwarcia trójfazowego w każdej szynie — sama sieć Thevenina (bez
    wytwórców), c wg IEC 60909-0 Tab. 1 (MAX: nN 1,05 / SN/WN 1,10; MIN: 0,95 / 1,00).

    MIN (CV-4.3 K7): ``case="min"`` bierze ``s_sc_min_mva``/``rx_min`` ext_grid (z Z_Qmin
    mappera) i c_min w węźle zwarcia. Korekta temperaturowa linii toru kanonicznego nie
    jest odwzorowana — sieć z gałęziami liniowymi w MIN jest odrzucana z nazwą.

    ROZBIEŻNOŚĆ NORMATYWNA (OD-10, pomiar K7): pandapower stosuje współczynnik korekcyjny
    transformatora sieciowego K_T = 0,95·c_max/(1+0,6·x_T) WYŁĄCZNIE dla ``case="max"``
    (``build_branch._transformer_correction_factor``: „shall only be applied in the max
    case according to IEC 60909-0:2016 section 6.3.3"), a rdzeń MV
    (``core/branch.py::get_short_circuit_impedance_pu_corrected``, FROZEN) stosuje K_T w obu
    scenariuszach. ``k_t_w_min=True`` przemnaża ``vk_percent``/``vkr_percent`` każdego
    transformatora przez K_T ODCZYTANE z gałęzi grafu rdzenia (nie liczone w moście),
    żeby wyrocznia widziała tę samą impedancję co solver — to ODWZOROWANIE zachowania
    rdzenia do izolacji rozbieżności, nie rozstrzygnięcie, która strona ma rację
    (decyzja właściciela, rdzeń FROZEN)."""
    import pandapower.shortcircuit as sc  # type: ignore[import-not-found]

    if scenariusz == "MIN" and any(isinstance(b, OverheadLine | Cable) for b in enm.branches):
        raise ValueError(
            "Most pandapower nie odwzorowuje korekty temperaturowej linii scenariusza MIN "
            "(tor kanoniczny: build_min_scenario_graph) — parytet MIN tylko bez gałęzi liniowych"
        )
    net, szyny = zbuduj_siec(enm, z_wytworcami=False)
    if scenariusz == "MIN" and k_t_w_min:
        graf = map_enm_to_network_graph(enm, scenario="MIN")
        for idx, wiersz in net.trafo.iterrows():
            galaz = graf.branches[ref_to_graph_id(str(wiersz["name"]))]
            k_t = galaz.get_kt_correction_factor()  # type: ignore[attr-defined]
            net.trafo.at[idx, "vk_percent"] = float(wiersz["vk_percent"]) * k_t
            net.trafo.at[idx, "vkr_percent"] = float(wiersz["vkr_percent"]) * k_t
    sc.calc_sc(
        net,
        fault="3ph",
        case="max" if scenariusz == "MAX" else "min",
        lv_tol_percent=LV_TOL_PERCENT,
        ip=False,
        ith=False,
    )
    return {ref: float(net.res_bus_sc.ikss_ka[idx]) * 1000.0 for ref, idx in szyny.items()}


def proweniencja(enm: EnergyNetworkModel) -> dict[str, Any]:
    """Rekord proweniencji wyroczni (D-2 w DoD K7): co DOKŁADNIE dostał pandapower.

    Dla każdego źródła: deklaracje ENM (S''kQmax/S''kQmin albo I''kQ, R/X), c_max/c_min
    pasma, tryb danych i scenariusz ze śladu mappera (``impedancja_zrodla_sieciowego``)
    oraz faktyczne parametry ``ext_grid``. Rekord jest deterministyczny (klucze
    posortowane, źródła po ``ref_id``) i porównywalny bit w bit z przypiętym JSON.
    """
    napiecie = {bus.ref_id: bus.voltage_kv for bus in enm.buses}
    zrodla: dict[str, Any] = {}
    for source in sorted(enm.sources, key=lambda s: s.ref_id):
        u_kv = napiecie[source.bus_ref]
        slady = {}
        for scenariusz in ("MAX", "MIN"):
            wynik = impedancja_zrodla_sieciowego(source, u_kv, scenariusz)  # type: ignore[arg-type]
            if wynik is None:
                raise ValueError(f"Źródło {source.ref_id} bez impedancji zwarciowej")
            _z, slad = wynik
            slady[scenariusz] = {
                "tryb": slad["tryb"],
                "c": slad.get("c"),
                "rx_ratio": slad.get("rx_ratio"),
                "rx_ratio_zrodlo": slad.get("rx_ratio_zrodlo"),
                "z_q_ohm": slad["z_q_ohm"],
                "zalozenie": slad.get("zalozenie"),
            }
        zrodla[source.ref_id] = {
            "bus_ref": source.bus_ref,
            "u_nq_kv": u_kv,
            "deklaracja_enm": {
                "sk3_mva": source.sk3_mva,
                "ik3_ka": source.ik3_ka,
                "rx_ratio": source.rx_ratio,
                "sk3_min_mva": source.sk3_min_mva,
                "ik3_min_ka": source.ik3_min_ka,
                "rx_ratio_min": source.rx_ratio_min,
                "r_ohm": source.r_ohm,
                "x_ohm": source.x_ohm,
            },
            "c_max": c_for_node(u_kv, "MAX"),
            "c_min": c_for_node(u_kv, "MIN"),
            "slad_mappera": slady,
            "ext_grid": _parametry_ext_grid(source, u_kv),
        }
    return {
        "pandapower": _pandapower_wersja(),
        "most": {"wersja": WERSJA_MOSTU, "sha256": _skrot_mostu()},
        "enm": {"name": enm.header.name, "input_hash": compute_input_hash(enm)},
        "lv_tol_percent": LV_TOL_PERCENT,
        "zrodla": zrodla,
    }
