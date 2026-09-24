"""OD-35 = (c) i klasa P9: prąd OBU zacisków gałęzi i obciążenie z jednej definicji.

Rdzeń rozpływu (FROZEN `power_flow_newton_internal`) liczy prąd strony `from`; wiersz
gałęzi niósł go jako `i_a` bez nazwy strony. Gałąź z susceptancją albo z przekładnią ma
na obu końcach INNY prąd, więc `build_branch_results` niesie `i_do_a` — prąd zacisku
końcowego z mocy strony `to` (FROZEN `PowerFlowBranchResult`) i napięcia węzła `to` — a
`loading_pct` liczy się z WIĘKSZEGO ilorazu prąd zacisku / prąd znamionowy zacisku
(decyzje O-46, O-51; jedna funkcja `analysis/obciazenie_galezi.py`). Transformator ma
prąd znamionowy KAŻDEGO zacisku z S_n i U_n strony — dawniej `loading_pct = None`.

Wyrocznia prądów: model pi z idealnym transformatorem po stronie `od` (W6-A par. 7.2),
`I_od = (y + jB/2)/|a|^2 V_od - y/conj(a) V_do`, `I_do = -y/a V_od + (y + jB/2) V_do`,
liczony w teście wprost — nie kodem produktu. Iloczyn cech klasy (rodzaj gałęzi × zacisk
decydujący × próg) i zmierzone różnice prądów zacisków (kabel G17 5,46 %, kabel G16
1,18 %) — `tests/analysis/przypadki_obciazenia_galezi.py`.
"""

from __future__ import annotations

import cmath
import math
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import pytest
from api.canonical_run_views import build_power_flow_interpretation
from application.analyses.energy_validation.service import build_energy_validation_view
from application.analyses.sanity_bounds import build_power_flow_sanity_bounds_view
from enm.canonical_analysis import (
    CanonicalRun,
    _execute_power_flow,
    build_branch_results,
)
from enm.mapping import ref_to_graph_id
from enm.models import (
    BranchRating,
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMHeader,
    OverheadLine,
    Transformer,
)

from tests.analysis.przypadki_obciazenia_galezi import (
    OBCIAZALNOSC_KABLA_A,
    OBCIAZALNOSC_LINII_A,
    Przypadek,
    Rodzaj,
    wszystkie_przypadki,
)
from tests.golden.enm_builders.dynamika_rms import build_dynamika_rms_enm
from tests.golden.enm_builders.so1a_pv_magazyn import build_so1a_pv_magazyn_enm

S_BAZOWA_MVA = 100.0
GALAZ = ref_to_graph_id("G")
WEZEL_OD = ref_to_graph_id("F")
WEZEL_DO = ref_to_graph_id("T")


def _prad_bazowy_a(u_n_kv: float) -> float:
    return S_BAZOWA_MVA * 1e3 / (math.sqrt(3.0) * u_n_kv)


def _enm_jednej_galezi(rodzaj: Rodzaj, *, obciazalnosc_a: float | None = None) -> dict[str, Any]:
    """Migawka ENM z jedną gałęzią `G` między szynami `F` (od) i `T` (do)."""
    if rodzaj == "transformator":
        enm = EnergyNetworkModel(
            header=ENMHeader(name="P9 — transformator"),
            buses=[
                Bus(ref_id="F", name="GPZ 110 kV", voltage_kv=110.0),
                Bus(ref_id="T", name="Szyna 15 kV", voltage_kv=15.0),
            ],
            transformers=[
                Transformer(
                    ref_id="G",
                    name="TR 110/15",
                    hv_bus_ref="F",
                    lv_bus_ref="T",
                    sn_mva=25.0,
                    uhv_kv=110.0,
                    ulv_kv=15.0,
                    uk_percent=11.0,
                    pk_kw=120.0,
                    vector_group="Dyn11",
                    tap_position=2,
                    tap_step_percent=1.5,
                )
            ],
        )
        return enm.model_dump(mode="json")
    klasa = Cable if rodzaj == "kabel" else OverheadLine
    domyslna = OBCIAZALNOSC_KABLA_A if rodzaj == "kabel" else OBCIAZALNOSC_LINII_A
    obciazalnosc = domyslna if obciazalnosc_a is None else obciazalnosc_a
    enm = EnergyNetworkModel(
        header=ENMHeader(name=f"P9 — {rodzaj}"),
        buses=[
            Bus(ref_id="F", name="Szyna od", voltage_kv=15.0),
            Bus(ref_id="T", name="Szyna do", voltage_kv=15.0),
        ],
        branches=[
            klasa(
                ref_id="G",
                name=f"Gałąź {rodzaj}",
                from_bus_ref="F",
                to_bus_ref="T",
                length_km=6.0,
                r_ohm_per_km=0.125,
                x_ohm_per_km=0.11,
                b_siemens_per_km=90e-6,
                rating=BranchRating(in_a=obciazalnosc),
            )
        ],
    )
    return enm.model_dump(mode="json")


def _bieg(snapshot: dict[str, Any], raw_result: dict[str, Any]) -> CanonicalRun:
    return CanonicalRun(
        id=uuid4(),
        case_id="case-od35",
        project_id=None,
        analysis_type="PF",
        status="FINISHED",
        created_at=datetime.now(UTC),
        snapshot_hash="sha256:od35",
        input_hash="sha256:od35",
        snapshot=snapshot,
        validation={},
        readiness={},
        options={},
        raw_result=raw_result,
    )


def _raw_result(
    *,
    s_od: complex,
    s_do: complex,
    i_od_a: float,
    u_od_kv: float,
    u_do_kv: float,
) -> dict[str, Any]:
    return {
        "result_v1": {
            "bus_results": [],
            "branch_results": [
                {
                    "branch_id": GALAZ,
                    "p_from_mw": s_od.real,
                    "q_from_mvar": s_od.imag,
                    "p_to_mw": s_do.real,
                    "q_to_mvar": s_do.imag,
                    "losses_p_mw": (s_od + s_do).real,
                    "losses_q_mvar": (s_od + s_do).imag,
                }
            ],
        },
        "graph": {
            "branches": {
                GALAZ: {
                    "name": "Gałąź",
                    "from_node_id": WEZEL_OD,
                    "to_node_id": WEZEL_DO,
                }
            }
        },
        "branch_current_ka": {GALAZ: i_od_a / 1e3},
        "node_voltage_kv": {WEZEL_OD: u_od_kv, WEZEL_DO: u_do_kv},
    }


def _bieg_pi(
    *,
    rodzaj: Rodzaj,
    y: complex,
    b: float,
    a: complex,
    v_od: complex,
    v_do: complex,
    u_n_od_kv: float,
    u_n_do_kv: float,
) -> tuple[CanonicalRun, float, float]:
    """Bieg PF z JEDNĄ gałęzią, której moce i prąd `from` wyliczono modelem pi."""
    i_od = (y + 1j * b / 2.0) / abs(a) ** 2 * v_od - y / a.conjugate() * v_do
    i_do = -y / a * v_od + (y + 1j * b / 2.0) * v_do
    s_od = v_od * i_od.conjugate() * S_BAZOWA_MVA
    s_do = v_do * i_do.conjugate() * S_BAZOWA_MVA
    i_od_a = abs(i_od) * _prad_bazowy_a(u_n_od_kv)
    i_do_a = abs(i_do) * _prad_bazowy_a(u_n_do_kv)
    run = _bieg(
        _enm_jednej_galezi(rodzaj),
        _raw_result(
            s_od=s_od,
            s_do=s_do,
            i_od_a=i_od_a,
            u_od_kv=abs(v_od) * u_n_od_kv,
            u_do_kv=abs(v_do) * u_n_do_kv,
        ),
    )
    return run, i_od_a, i_do_a


@pytest.mark.parametrize(
    ("rodzaj", "y", "b", "a", "u_n_od_kv", "u_n_do_kv"),
    [
        (
            "transformator",
            1.0 / complex(0.01, 0.1),
            0.02,
            cmath.rect(1.025, -math.pi / 6.0),
            110.0,
            15.0,
        ),
        ("kabel", 1.0 / complex(0.2, 0.1), 0.15, 1.0 + 0j, 15.0, 15.0),
    ],
    ids=["transformator_z_przekladnia_zespolona", "kabel_z_susceptancja"],
)
def test_prad_zacisku_koncowego_wobec_modelu_pi(
    rodzaj: Rodzaj, y: complex, b: float, a: complex, u_n_od_kv: float, u_n_do_kv: float
) -> None:
    run, i_od_a, i_do_a = _bieg_pi(
        rodzaj=rodzaj,
        y=y,
        b=b,
        a=a,
        v_od=cmath.rect(1.01, 0.0),
        v_do=cmath.rect(0.97, -0.58),
        u_n_od_kv=u_n_od_kv,
        u_n_do_kv=u_n_do_kv,
    )
    (wiersz,) = build_branch_results(run)["rows"]
    assert wiersz["i_a"] == pytest.approx(i_od_a, rel=1e-12)
    assert wiersz["i_do_a"] == pytest.approx(i_do_a, rel=1e-12)
    # Dwie strony NIE są tym samym prądem (inaczej pole byłoby kopią `i_a`).
    assert abs(wiersz["i_do_a"] - wiersz["i_a"]) > 1e-3 * wiersz["i_a"]


def test_obciazenie_liczone_z_wiekszego_pradu_zaciskow() -> None:
    """Kabel z generacją bierną (Q strony `from` ujemne): prąd strony `to` WIĘKSZY niż
    `from` o 4,7 % — obciążenie z niego.

    Zmiana semantyczna OD-35: dotąd `loading_pct` liczono z samego prądu `from`, co dla
    takiej gałęzi zaniżało obciążenie (tu o 4,7 %, rząd zmierzonych 5,46 % kabla G17).
    """
    run, i_od_a, i_do_a = _bieg_pi(
        rodzaj="kabel",
        y=1.0 / complex(0.2, 0.1),
        b=0.15,
        a=1.0 + 0j,
        v_od=cmath.rect(1.01, 0.0),
        v_do=cmath.rect(0.96, -0.02),
        u_n_od_kv=15.0,
        u_n_do_kv=15.0,
    )
    (wiersz,) = build_branch_results(run)["rows"]
    assert i_do_a / i_od_a == pytest.approx(1.0467, abs=1e-4)
    assert wiersz["loading_pct"] == pytest.approx(
        max(i_od_a, i_do_a) / OBCIAZALNOSC_KABLA_A * 100.0, rel=1e-12
    )
    assert wiersz["loading_powod_braku_pl"] is None


PRZYPADKI = wszystkie_przypadki()


@pytest.mark.parametrize("p", PRZYPADKI, ids=[p.nazwa for p in PRZYPADKI])
def test_iloczyn_cech_tabela_galezi(p: Przypadek) -> None:
    """Tabela gałęzi (P9) na iloczynie {rodzaj} × {zacisk decydujący} × {próg}: obciążenie
    z wyroczni, flaga przeciążenia wyłącznie powyżej 100 % (na progu bez flagi)."""
    u_od_kv = 110.0 if p.rodzaj == "transformator" else 15.0
    run = _bieg(
        _enm_jednej_galezi(p.rodzaj),
        _raw_result(
            s_od=-p.moc_do_mva * 1.01,
            s_do=p.moc_do_mva,
            i_od_a=p.prad_od_a,
            u_od_kv=u_od_kv,
            u_do_kv=p.napiecie_do_kv,
        ),
    )
    (wiersz,) = build_branch_results(run)["rows"]
    assert wiersz["loading_pct"] == pytest.approx(p.obciazenie_pct, rel=1e-9)
    assert wiersz["i_a"] == pytest.approx(p.prad_od_a, rel=1e-12)
    assert wiersz["i_do_a"] == pytest.approx(p.prad_do_a, rel=1e-9)
    przeciazona = "OVERLOADED" in wiersz["flags"]
    assert przeciazona == (wiersz["loading_pct"] > 100.0)
    if p.prog == "powyzej":
        assert przeciazona
    if p.prog == "ponizej" or p.dokladnie_na_progu:
        assert not przeciazona
    if p.dokladnie_na_progu:
        assert wiersz["loading_pct"] == 100.0


def test_brak_napiecia_wezla_koncowego_to_brak_pradu_i_obciazenia() -> None:
    run, _, _ = _bieg_pi(
        rodzaj="kabel",
        y=1.0 / complex(0.2, 0.1),
        b=0.15,
        a=1.0 + 0j,
        v_od=cmath.rect(1.01, 0.0),
        v_do=cmath.rect(0.99, -0.01),
        u_n_od_kv=15.0,
        u_n_do_kv=15.0,
    )
    del run.raw_result["node_voltage_kv"][WEZEL_DO]
    (wiersz,) = build_branch_results(run)["rows"]
    assert wiersz["i_do_a"] is None
    assert wiersz["loading_pct"] is None
    assert "zacisku końcowego" in wiersz["loading_powod_braku_pl"]


def test_brak_obciazalnosci_w_modelu_to_nazwany_brak() -> None:
    run, _, _ = _bieg_pi(
        rodzaj="kabel",
        y=1.0 / complex(0.2, 0.1),
        b=0.15,
        a=1.0 + 0j,
        v_od=cmath.rect(1.01, 0.0),
        v_do=cmath.rect(0.99, -0.01),
        u_n_od_kv=15.0,
        u_n_do_kv=15.0,
    )
    run.snapshot["branches"][0]["rating"] = None
    (wiersz,) = build_branch_results(run)["rows"]
    assert wiersz["loading_pct"] is None
    assert "prądu znamionowego" in wiersz["loading_powod_braku_pl"]
    assert wiersz["i_a"] is not None and wiersz["i_do_a"] is not None


def _bieg_realny(builder: Any) -> tuple[CanonicalRun, dict[str, Any]]:
    snapshot = EnergyNetworkModel.model_validate(builder()).model_dump(mode="json")
    run = CanonicalRun(
        id=uuid4(),
        case_id="case-od35",
        project_id=None,
        analysis_type="PF",
        status="CREATED",
        created_at=datetime.now(UTC),
        snapshot_hash="sha256:real",
        input_hash="sha256:pf",
        snapshot=snapshot,
        validation={},
        readiness={},
        options={},
    )
    _execute_power_flow(run)
    run.status = "FINISHED"
    return run, snapshot


def test_realny_rozplyw_kabla_z_susceptancja_spelnia_bilans_zaciskow() -> None:
    """Ścieżka produktu: migawka G16 -> rozpływ -> wiersz gałęzi `kab-odplyw`.

    `i_do_a` (z mocy strony `to`) MUSI zgadzać się z prądem wyliczonym z DRUGIEJ strony:
    `I_do = j(B/2)(V_od + V_do) - I_od`, gdzie `I_od = conj(S_od / V_od)` (dane strony
    `from` i susceptancja kabla z ENM) — dwie niezależne drogi do tego samego prądu.
    """
    run, snapshot = _bieg_realny(build_dynamika_rms_enm)
    wiersze = {w["element_id"]: w for w in build_branch_results(run)["rows"]}
    wiersz = wiersze["kab-odplyw"]
    kabel = next(g for g in snapshot["branches"] if g["ref_id"] == "kab-odplyw")
    u_n_kv = 15.0
    z_bazowa = u_n_kv**2 / S_BAZOWA_MVA
    b_pu = kabel["b_siemens_per_km"] * kabel["length_km"] * z_bazowa
    napiecia: dict[str, Any] = {
        w["bus_id"]: cmath.rect(w["v_pu"], math.radians(w["angle_deg"]))
        for w in run.raw_result["result_v1"]["bus_results"]
    }
    wynik = next(
        w
        for w in run.raw_result["result_v1"]["branch_results"]
        if w["branch_id"] == wiersz["branch_id"]
    )
    v_od, v_do = napiecia[wiersz["from_bus"]], napiecia[wiersz["to_bus"]]
    i_od = (complex(wynik["p_from_mw"], wynik["q_from_mvar"]) / S_BAZOWA_MVA / v_od).conjugate()
    i_do = 1j * b_pu / 2.0 * (v_od + v_do) - i_od
    assert wiersz["i_do_a"] == pytest.approx(abs(i_do) * _prad_bazowy_a(u_n_kv), rel=1e-9)
    assert wiersz["i_a"] == pytest.approx(abs(i_od) * _prad_bazowy_a(u_n_kv), rel=1e-9)
    assert wiersz["i_do_a"] != pytest.approx(wiersz["i_a"], rel=1e-6)


def test_realny_transformator_110_15_obciazenie_z_pradow_zaciskow_stron() -> None:
    """Transformator GPZ 110/15 kV sieci G16: prąd KAŻDEGO zacisku w amperach jego
    WŁASNEGO napięcia, a obciążenie z prądu znamionowego każdego zacisku
    I_r = S_n / (√3 · U_n,strona) — decyzja O-51 (dawniej `loading_pct = None`).

    Wartość przypięta (zmierzona 2026-09-23 na tym drzewie) i sprawdzona wyrocznią wprost
    ze wzoru na danych ENM transformatora.
    """
    run, snapshot = _bieg_realny(build_dynamika_rms_enm)
    wiersz = {w["element_id"]: w for w in build_branch_results(run)["rows"]}["tr-gpz"]
    trafo = next(t for t in snapshot["transformers"] if t["ref_id"] == "tr-gpz")
    n = trafo.get("n_parallel") or 1
    s_n = trafo["sn_mva"] * n
    ir_gn = s_n * 1000.0 / (math.sqrt(3.0) * trafo["uhv_kv"])
    ir_dn = s_n * 1000.0 / (math.sqrt(3.0) * trafo["ulv_kv"])
    assert 6.0 < wiersz["i_do_a"] / wiersz["i_a"] < 8.0
    wyrocznia = max(wiersz["i_a"] / ir_gn, wiersz["i_do_a"] / ir_dn) * 100.0
    assert wiersz["loading_pct"] == pytest.approx(wyrocznia, rel=1e-12)
    assert wiersz["loading_pct"] == pytest.approx(16.3856, abs=5e-5)
    assert wiersz["loading_powod_braku_pl"] is None


@pytest.mark.parametrize(
    "builder", [build_dynamika_rms_enm, build_so1a_pv_magazyn_enm], ids=["G16", "G17"]
)
def test_jedno_zrodlo_obciazenia_we_wszystkich_miejscach(builder: Any) -> None:
    """JEDNA definicja obciążenia gałęzi w produkcie (decyzja O-51): na tym samym biegu
    tabela gałęzi, walidacja energetyczna, pasma wiarygodności i interpretacja rozpływu
    pokazują BITOWO tę samą liczbę dla każdej linii, kabla i transformatora.

    Na tych sieciach klasa jest mierzalna: kabel `kab-magistrala` (G17) ma prądy zacisków
    różne o 5,46 %, kabel `kab-odplyw` (G16) o 1,18 % — obciążenie z jednego zacisku
    rozjeżdżałoby się właśnie o tyle."""
    run, _ = _bieg_realny(builder)
    tabela = {
        w["branch_id"]: w["loading_pct"]
        for w in build_branch_results(run)["rows"]
        if w["loading_pct"] is not None
    }
    assert tabela, "sieć bez policzonego obciążenia — test byłby pusty"
    walidacja = {
        i["target_id"]: i["observed_value"]
        for i in build_energy_validation_view(run)["items"]
        if i["check_type"] in ("BRANCH_LOADING", "TRANSFORMER_LOADING")
        and i["observed_value"] is not None
    }
    pasma = {
        i["target_id"]: i["loading_pct"]
        for i in build_power_flow_sanity_bounds_view(run)["obciazenia"]["items"]
        if i["loading_pct"] is not None
    }
    interpretacja = {
        f["branch_id"]: f["loading_pct"]
        for f in build_power_flow_interpretation(run)["branch_findings"]
        if f["loading_pct"] is not None
    }
    assert walidacja == tabela
    assert pasma == tabela
    assert interpretacja == tabela
