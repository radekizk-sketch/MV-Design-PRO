"""Wyrocznia pandapower dla scenariusza MIN źródła sieciowego (CV-4.3 K7) + proweniencja (D-2).

Łańcuch dowodowy DoD K7 (rozstrzygnięcie właściciela W-3, 2026-09-09):
S''kQmax / S''kQmin → ``Source`` ENM → asercja mapowania (``ext_grid.s_sc_min_mva`` RÓWNE
deklarowanemu ``sk3_min_mva``, ``rx_min`` równe ``rx_ratio_min``) → solver kanoniczny
(White Box: ślad ``zrodla_sieciowe``) → pandapower ``calc_sc(case="min")`` → wyrocznia
liczbowa (ΔIk''/Ik'' ≤ ``TOLERANCJA_IK_WZGL``). Rekord proweniencji (wersja pandapower,
wersja i skrót mostu, hasz ENM, deklaracje, c_max/c_min, parametry ext_grid) jest
PRZYPIĘTY w ``proweniencja_k7.json`` — rozjazd wersji pandapower albo mostu wobec
zapisanej wywala test.

Sieć: źródło 110 kV z danymi MAX i MIN, transformator 110/15 kV, szyna 15 kV; wariant
nN (0,4 kV, c_min = 0,95) i wariant bez danych MIN (założenie ``source.sk_min_missing``:
Z_Qmin = Z_Qmax, więc ``s_sc_min_mva`` = (c_min/c_max)·S''kQmax — po obu stronach ta sama
impedancja). Bez gałęzi liniowych (most nie odwzorowuje korekty temperaturowej MIN).

Marker ``pandapower``: biegnie wyłącznie w izolowanym jobie CI
``pandapower-cross-validation`` (pandapower 3.5.4, scipy<1.17).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from enm.canonical_analysis import _execute_short_circuit
from enm.mapping import _ref_to_uuid
from enm.models import Bus, EnergyNetworkModel, ENMHeader, Source, Transformer
from network_model.core.voltage_factor import c_for_node

from tests.golden.parytet_assemblera.harness import _bieg
from tests.golden.wyrocznie import pandapower as most
from tests.golden.wyrocznie.test_pandapower_wyspy import TOLERANCJA_IK_WZGL

pytestmark = pytest.mark.pandapower

PROWENIENCJA = Path(__file__).with_name("proweniencja_k7.json")


def _siec_110_15(**pola_min: float) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="k7-pandapower-110-15"),
        buses=[
            Bus(ref_id="hv", name="HV", voltage_kv=110.0),
            Bus(ref_id="mv", name="MV", voltage_kv=15.0),
        ],
        sources=[
            Source(
                ref_id="s1",
                name="GPZ 110",
                bus_ref="hv",
                model="short_circuit_power",
                sk3_mva=4000.0,
                rx_ratio=0.1,
                **pola_min,
            )
        ],
        transformers=[
            Transformer(
                ref_id="t1",
                name="T1",
                hv_bus_ref="hv",
                lv_bus_ref="mv",
                sn_mva=25.0,
                uhv_kv=110.0,
                ulv_kv=15.0,
                uk_percent=10.0,
                pk_kw=100.0,
                vector_group="YNd11",
            )
        ],
    )


def _siec_nn(**pola_min: float) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="k7-pandapower-nn"),
        buses=[Bus(ref_id="nn", name="nN", voltage_kv=0.4)],
        sources=[
            Source(
                ref_id="s_nn",
                name="Zasilanie nN",
                bus_ref="nn",
                model="short_circuit_power",
                sk3_mva=10.0,
                rx_ratio=0.3,
                **pola_min,
            )
        ],
    )


SIECI = {
    "110-15 z danymi MIN (Sk''min, R/X min)": lambda: _siec_110_15(
        sk3_min_mva=2500.0, rx_ratio_min=0.15
    ),
    "110-15 z Ik''min": lambda: _siec_110_15(ik3_min_ka=13.0),
    "110-15 bez danych MIN (zalozenie)": lambda: _siec_110_15(),
    "nN z danymi MIN": lambda: _siec_nn(sk3_min_mva=6.0),
    "nN bez danych MIN": lambda: _siec_nn(),
}


def _ik_kanoniczne(enm: EnergyNetworkModel, scenariusz: str) -> dict[str, float]:
    run = _bieg(
        enm,
        klucz=f"pp-k7-{scenariusz}",
        analysis_type="short_circuit_sn",
        options={"fault_type": "3F", "scenario": scenariusz, "thermal_time_seconds": 1.0},
    )
    _execute_short_circuit(run)
    wiersze = {str(row["fault_node_id"]): row for row in run.raw_result["results"]}
    wynik = {}
    for bus in enm.buses:
        wiersz = wiersze[_ref_to_uuid(bus.ref_id)]
        assert wiersz["reporting_status"] == "reportable", (enm.header.name, bus.ref_id)
        wynik[bus.ref_id] = float(wiersz["ik_thevenin_a"])
    return wynik


#: Rozbieżność K_T w MIN (OD-10): pandapower nie stosuje K_T dla ``case="min"``, rdzeń MV
#: stosuje. Pomiar 2026-09-09 (sieć 110/15 kV, S_rT 25 MVA, u_k 10 %, P_k 100 kW): szyna
#: 15 kV za transformatorem — Ik''min MV 8 865,8 A wobec pandapower 8 752,0 A (+1,30 %);
#: szyna 110 kV (bez transformatora w torze) identyczna. Próg PONIŻEJ zmierzonej różnicy
#: przypina, że rozbieżność ISTNIEJE (gdy rdzeń zmieni K_T w MIN — test ma się zapalić).
ROZBIEZNOSC_K_T_MIN_WZGL = 1e-2


@pytest.mark.parametrize("nazwa", list(SIECI))
@pytest.mark.parametrize("scenariusz", ["max", "min"])
def test_zwarcie_3f_min_i_max_zgodne_z_pandapower(nazwa: str, scenariusz: str) -> None:
    """MAX: parytet surowy. MIN: parytet z K_T odwzorowanym w pandapower (``k_t_w_min``) —
    jedyna różnica między stronami to K_T transformatora (OD-10), co pokazuje test niżej."""
    enm = SIECI[nazwa]()
    nasze = _ik_kanoniczne(enm, scenariusz)
    pp = most.zwarcie_3f(enm, "MAX" if scenariusz == "max" else "MIN", k_t_w_min=True)
    max_wzgl = max(abs(nasze[ref] - pp[ref]) / pp[ref] for ref in nasze)
    assert max_wzgl <= TOLERANCJA_IK_WZGL, (nazwa, scenariusz, max_wzgl, nasze, pp)


@pytest.mark.parametrize("nazwa", [n for n in SIECI if n.startswith("110-15")])
def test_min_bez_k_t_w_pandapower_rozni_sie_tylko_za_transformatorem(nazwa: str) -> None:
    """Rozbieżność OD-10 zmierzona i przypięta: surowe ``case="min"`` pandapower (K_T = 1)
    zgadza się z rdzeniem w węźle przyłączenia (bez transformatora w torze) i różni się
    za transformatorem DOKŁADNIE o K_T — po odwzorowaniu K_T (test wyżej) parytet wraca."""
    enm = SIECI[nazwa]()
    nasze = _ik_kanoniczne(enm, "min")
    surowe = most.zwarcie_3f(enm, "MIN", k_t_w_min=False)
    assert abs(nasze["hv"] - surowe["hv"]) / surowe["hv"] <= TOLERANCJA_IK_WZGL
    roznica_mv = (nasze["mv"] - surowe["mv"]) / surowe["mv"]
    assert roznica_mv > ROZBIEZNOSC_K_T_MIN_WZGL, (nazwa, roznica_mv, nasze, surowe)


@pytest.mark.parametrize("nazwa", [n for n in SIECI if n.startswith("nN")])
def test_min_bez_transformatora_parytet_surowy(nazwa: str) -> None:
    enm = SIECI[nazwa]()
    nasze = _ik_kanoniczne(enm, "min")
    surowe = most.zwarcie_3f(enm, "MIN", k_t_w_min=False)
    assert abs(nasze["nn"] - surowe["nn"]) / surowe["nn"] <= TOLERANCJA_IK_WZGL


def test_ext_grid_s_sc_min_rowne_deklarowanemu_sk_min() -> None:
    """Asercja mapowania (D-2): to, co dostaje pandapower, pochodzi z ZADEKLAROWANEGO
    pola ENM, nie z pośredniego wyniku MV."""
    enm = _siec_110_15(sk3_min_mva=2500.0, rx_ratio_min=0.15)
    net, _ = most.zbuduj_siec(enm)
    wiersz = net.ext_grid.iloc[0]
    assert float(wiersz["s_sc_max_mva"]) == pytest.approx(4000.0, rel=1e-12)
    assert float(wiersz["rx_max"]) == pytest.approx(0.1, rel=1e-12)
    assert float(wiersz["s_sc_min_mva"]) == pytest.approx(2500.0, rel=1e-12)
    assert float(wiersz["rx_min"]) == pytest.approx(0.15, rel=1e-12)
    # Ik''min: pandapower z I''kQmin — s_sc_min = √3·U·I''kQmin.
    enm = _siec_110_15(ik3_min_ka=13.0)
    net, _ = most.zbuduj_siec(enm)
    assert float(net.ext_grid.iloc[0]["s_sc_min_mva"]) == pytest.approx(
        3.0**0.5 * 110.0 * 13.0, rel=1e-12
    )
    assert float(net.ext_grid.iloc[0]["rx_min"]) == pytest.approx(0.1, rel=1e-12)
    # Bez danych MIN: założenie mappera Z_Qmin = Z_Qmax ⇒ s_sc_min = (c_min/c_max)·S''kQmax.
    enm = _siec_110_15()
    net, _ = most.zbuduj_siec(enm)
    assert float(net.ext_grid.iloc[0]["s_sc_min_mva"]) == pytest.approx(
        4000.0 * c_for_node(110.0, "MIN") / c_for_node(110.0, "MAX"), rel=1e-12
    )


def test_ik_min_w_pcc_rowne_deklarowanemu_po_obu_stronach() -> None:
    """Ik''(PCC, MIN) = I''kQmin dokładnie — w solverze kanonicznym I w pandapower."""
    enm = _siec_110_15(sk3_min_mva=2500.0)
    deklarowane_a = 2500.0 / (3.0**0.5 * 110.0) * 1000.0
    assert _ik_kanoniczne(enm, "min")["hv"] == pytest.approx(deklarowane_a, rel=1e-9)
    assert most.zwarcie_3f(enm, "MIN")["hv"] == pytest.approx(deklarowane_a, rel=1e-6)


def test_proweniencja_przypieta() -> None:
    """Rekord D-2 bit w bit z przypiętym JSON: wersja pandapower i mostu, hasz ENM,
    deklaracje, c, parametry ext_grid. Aktualizacja = świadoma zmiana (regeneracja
    zapisem `PROWENIENCJA_K7_ZAPISZ=1`) opisana w commicie."""
    import os

    rekord = {nazwa: most.proweniencja(budowniczy()) for nazwa, budowniczy in SIECI.items()}
    tekst = json.dumps(rekord, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if os.environ.get("PROWENIENCJA_K7_ZAPISZ") == "1":
        PROWENIENCJA.write_text(tekst, encoding="utf-8")
    assert PROWENIENCJA.exists(), "brak proweniencja_k7.json — zapisz PROWENIENCJA_K7_ZAPISZ=1"
    zapisany = json.loads(PROWENIENCJA.read_text(encoding="utf-8"))
    assert zapisany == rekord, "rekord proweniencji rozjechal sie z przypietym"
    for wpis in rekord.values():
        assert wpis["pandapower"] == "3.5.4"
        assert wpis["most"]["wersja"] == most.WERSJA_MOSTU
