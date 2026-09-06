"""JEDEN most ENM → pandapower (wyrocznia niezależna; CV-4.3 K3b).

Buduje sieć pandapower z ``EnergyNetworkModel`` TYMI SAMYMI regułami, którymi
``enm/mapping.py`` buduje IR solvera (semantyka „w ruchu": gałąź ``status == "closed"``,
transformator zawsze; łączniki i bezpieczniki jako łączniki szyna–szyna; liczba torów
z ``enm.models.liczba_torow``; Q wytwórcy z ``solver_input.moc_bierna_wytworcy``;
impedancja źródła z ``enm.mapping._source_positive_impedance_ohm``; współczynnik c
z ``network_model.core.voltage_factor.c_for_node``) — most nie ma własnej definicji
żadnej z tych reguł, więc rozjazd wyniku jest rozjazdem SOLVERA, nie mostu.

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

from enm.mapping import _source_positive_impedance_ohm
from enm.models import (
    Cable,
    EnergyNetworkModel,
    FuseBranch,
    OverheadLine,
    SwitchBranch,
    liczba_torow,
)
from network_model.core.voltage_factor import c_for_node
from network_model.solvers.power_flow_newton_internal import transformer_phase_shift_rad
from network_model.solvers.power_flow_zip import zip_coeffs_from_materialized_params
from solver_input.moc_bierna_wytworcy import moc_bierna_wytworcy

#: Częstotliwość studium do przeliczenia susceptancji B [S/km] na pojemność C [nF/km]
#: (pandapower przyjmuje C): C = B / (2πf) · 1e9.
CZESTOTLIWOSC_HZ = 50.0

#: Tolerancja napięcia nN dla pandapower (``lv_tol_percent``): 6 % ⇒ c_max = 1,05 dla
#: U_n ≤ 1 kV — tak samo jak ``voltage_factor.c_for_node`` (IEC 60909-0 Tab. 1).
LV_TOL_PERCENT = 6

#: Grupa połączeń podstawiana przez ``enm/mapping.py`` przy braku w modelu.
GRUPA_DOMYSLNA = "Dyn11"


def _pandapower() -> Any:
    import pandapower as pp  # type: ignore[import-not-found]

    return pp


def _stopnie_z_grupy(vector_group: str | None) -> float:
    """``shift_degree`` pandapower = kąt, o który strona nN OPÓŹNIA się za SN (Dyn5 → 150°,
    Dyn11 → 330°); solver kanoniczny opisuje tę samą grupę jako wyprzedzenie strony nN
    (``transformer_phase_shift_rad``: Dyn5 → −150°, Dyn11 → +30°) — stąd znak i modulo."""
    return (-math.degrees(transformer_phase_shift_rad(vector_group or GRUPA_DOMYSLNA))) % 360.0


def zbuduj_siec(
    enm: EnergyNetworkModel, *, z_wytworcami: bool = True
) -> tuple[Any, dict[str, int]]:
    """Sieć pandapower z ENM + odwzorowanie ``bus_ref → indeks szyny``.

    ``z_wytworcami=False`` pomija wytwórców (porównanie zwarcia z wkładem samej sieci
    Thevenina — ``ik_thevenin_a`` solvera kanonicznego; falownik w IEC 60909 to źródło
    prądowe o innym modelu wkładu niż ``sgen`` pandapower).
    """
    pp = _pandapower()
    net = pp.create_empty_network(sn_mva=100.0, f_hz=CZESTOTLIWOSC_HZ)
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
                c_nf_per_km=b_s_km * 1e9 / (2.0 * math.pi * CZESTOTLIWOSC_HZ),
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
        z_ohm = _source_positive_impedance_ohm(source, u_kv)
        if z_ohm is None or z_ohm == 0:
            raise ValueError(f"Źródło {source.ref_id} bez impedancji zwarciowej")
        # pandapower: Z_Q = c_max·U²/s_sc_max_mva (IEC 60909-0 eq. 6) — odtwarzamy
        # s_sc z impedancji IR, żeby po obu stronach stała TA SAMA Z_Q. Po CV-4.3 K6
        # (Z_Q mappingu = c_max·U²/S''_kQ) ta liczba jest RÓWNA deklarowanemu
        # ``sk3_mva`` źródła (test ``test_ext_grid_s_sc_rowne_deklarowanemu_sk``);
        # przed K6 wychodziła c_max·S''_kQ — most maskował brak c w mappingu.
        c_max = c_for_node(u_kv, "MAX")
        pp.create_ext_grid(
            net,
            szyny[source.bus_ref],
            vm_pu=1.0,
            va_degree=0.0,
            name=source.ref_id,
            s_sc_max_mva=c_max * u_kv**2 / abs(z_ohm),
            rx_max=z_ohm.real / z_ohm.imag,
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


def zwarcie_3f(enm: EnergyNetworkModel) -> dict[str, float]:
    """Ik'' [A] zwarcia trójfazowego (scenariusz MAX) w każdej szynie — sama sieć
    Thevenina (bez wytwórców), c wg IEC 60909-0 Tab. 1 (nN 1,05; SN/WN 1,10)."""
    import pandapower.shortcircuit as sc  # type: ignore[import-not-found]

    net, szyny = zbuduj_siec(enm, z_wytworcami=False)
    sc.calc_sc(net, fault="3ph", case="max", lv_tol_percent=LV_TOL_PERCENT, ip=False, ith=False)
    return {ref: float(net.res_bus_sc.ikss_ka[idx]) * 1000.0 for ref, idx in szyny.items()}
