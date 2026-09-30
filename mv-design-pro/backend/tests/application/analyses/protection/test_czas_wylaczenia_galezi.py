"""Karta F-K1 faza 5 (V12K-209): czas wylaczenia PER GALAZ z mapy zabezpieczen.

Intencja testow: kryterium cieplne przewodu bralo dotad JEDEN czas dla calej sieci —
zalozony czas obliczeniowy przypadku — i wygladalo to jak wynik z modelu. Testy
pilnuja, ze (1) czas z nastawy jest liczony poprawnie i przez solver IEC 60255,
(2) aparat chroniacy wynika z TOPOLOGII (najblizszy wylacznik od strony zasilania,
otwarty lacznik nie tworzy drogi), (3) kazdy brak danych konczy sie JAWNYM brakiem
czasu, a NIGDY podstawieniem wspolnego ``tk_s``.

Wartosci oczekiwane pochodza z NIEZALEZNEGO rachunku (wzor + liczby w komentarzu),
nie z uruchomienia testowanego kodu.
"""

from __future__ import annotations

import pytest
from application.analyses.protection.czas_wylaczenia_galezi import (
    ZRODLO_BRAK_APARATU,
    ZRODLO_BRAK_NASTAW,
    ZRODLO_BRAK_PRADU,
    ZRODLO_NASTAWA,
    ZRODLO_PONIZEJ_ROZRUCHU,
    ZRODLO_ZALOZENIE_PRZYPADKU,
    mapa_tk_s_z_nastaw,
    nastawy_aparatow_modelu,
    podsumowanie_czasow,
    slad_czasu,
    wyznacz_czasy_wylaczenia,
    znajdz_aparat_chroniacy,
)
from network_model.core.branch import BranchType, LineBranch
from network_model.core.graph import NetworkGraph
from network_model.core.grid_source import GridShortCircuitSource
from network_model.core.node import Node, NodeType
from network_model.core.switch import Switch, SwitchState, SwitchType
from enm.mapping import ref_to_graph_id
from enm.models import EnergyNetworkModel, ENMHeader, Measurement, ProtectionAssignment
from network_model.solvers.short_circuit_contributions import (
    ShortCircuitBranchContribution,
)
from network_model.solvers.short_circuit_core import ShortCircuitType
from network_model.solvers.short_circuit_iec60909 import ShortCircuitResult

# ---------------------------------------------------------------------------
# Fixtures: GPZ -[wylacznik CB1]- BUS2 -[kabel A]- BUS3 -[kabel B]- BUS4
# ---------------------------------------------------------------------------


def _graf(*, stan_cb1: SwitchState = SwitchState.CLOSED) -> NetworkGraph:
    graph = NetworkGraph()
    for ident, typ in (
        ("BUS1", NodeType.SLACK),
        ("BUS2", NodeType.PQ),
        ("BUS3", NodeType.PQ),
        ("BUS4", NodeType.PQ),
    ):
        graph.add_node(
            Node(
                id=ident,
                node_type=typ,
                voltage_level=15.0,
                voltage_magnitude=15.0 if typ is NodeType.SLACK else None,
                voltage_angle=0.0 if typ is NodeType.SLACK else None,
                active_power=0.0 if typ is NodeType.PQ else None,
                reactive_power=0.0 if typ is NodeType.PQ else None,
            )
        )
    graph.add_switch(
        Switch(
            id=ref_to_graph_id("CB1"),
            name="Wylacznik pola liniowego",
            switch_type=SwitchType.BREAKER,
            from_node_id="BUS1",
            to_node_id="BUS2",
            state=stan_cb1,
        )
    )
    for ident, nazwa, a, b in (
        ("kabel_A", "Kabel A", "BUS2", "BUS3"),
        ("kabel_B", "Kabel B", "BUS3", "BUS4"),
    ):
        graph.add_branch(
            LineBranch(
                id=ident,
                name=nazwa,
                branch_type=BranchType.CABLE,
                from_node_id=a,
                to_node_id=b,
                r_ohm_per_km=0.2,
                x_ohm_per_km=0.1,
                length_km=1.0,
                rated_current_a=300.0,
                type_ref="cable_pass",
            )
        )
    graph.add_grid_sc_source(
        GridShortCircuitSource(
            id="GPZ", name="Zasilanie GPZ", node_id="BUS1", z_ohm=complex(0.09, 0.9)
        )
    )
    return graph


def _graf_kaskada() -> NetworkGraph:
    """Dwa stopnie ochrony: BUS1 -[CB1]- BUS2 -[kabel_A]- BUS3 -[CB2]- BUS3B -[kabel_B]- BUS4.

    Kabel B lezy ZA drugim wylacznikiem, wiec to CB2 wylaczy jego zwarcie jako pierwszy.
    """
    graph = NetworkGraph()
    for ident, typ in (
        ("BUS1", NodeType.SLACK),
        ("BUS2", NodeType.PQ),
        ("BUS3", NodeType.PQ),
        ("BUS3B", NodeType.PQ),
        ("BUS4", NodeType.PQ),
    ):
        graph.add_node(
            Node(
                id=ident,
                node_type=typ,
                voltage_level=15.0,
                voltage_magnitude=15.0 if typ is NodeType.SLACK else None,
                voltage_angle=0.0 if typ is NodeType.SLACK else None,
                active_power=0.0 if typ is NodeType.PQ else None,
                reactive_power=0.0 if typ is NodeType.PQ else None,
            )
        )
    for ident, nazwa, a, b in (
        ("CB1", "Wylacznik pola liniowego", "BUS1", "BUS2"),
        ("CB2", "Wylacznik odgalezienia", "BUS3", "BUS3B"),
    ):
        graph.add_switch(
            Switch(
                id=ref_to_graph_id(ident),
                name=nazwa,
                switch_type=SwitchType.BREAKER,
                from_node_id=a,
                to_node_id=b,
                state=SwitchState.CLOSED,
            )
        )
    for ident, nazwa, a, b in (
        ("kabel_A", "Kabel A", "BUS2", "BUS3"),
        ("kabel_B", "Kabel B", "BUS3B", "BUS4"),
    ):
        graph.add_branch(
            LineBranch(
                id=ident,
                name=nazwa,
                branch_type=BranchType.CABLE,
                from_node_id=a,
                to_node_id=b,
                r_ohm_per_km=0.2,
                x_ohm_per_km=0.1,
                length_km=1.0,
                rated_current_a=300.0,
                type_ref="cable_pass",
            )
        )
    graph.add_grid_sc_source(
        GridShortCircuitSource(
            id="GPZ", name="Zasilanie GPZ", node_id="BUS1", z_ohm=complex(0.09, 0.9)
        )
    )
    return graph


def _sc_result(*, prad_a: float | None, tk_s: float = 1.0) -> ShortCircuitResult:
    """Wynik SC z rozbiciem na galezie. ``prad_a=None`` = solver bez rozbicia."""
    wklady = (
        None
        if prad_a is None
        else [
            ShortCircuitBranchContribution(
                source_id="GPZ",
                branch_id=ident,
                from_node_id=a,
                to_node_id=b,
                i_contrib_a=prad_a,
                direction="from_to",
            )
            for ident, a, b in (("kabel_A", "BUS2", "BUS3"), ("kabel_B", "BUS3", "BUS4"))
        ]
    )
    return ShortCircuitResult(
        short_circuit_type=ShortCircuitType.THREE_PHASE,
        fault_node_id="BUS4",
        c_factor=1.1,
        un_v=15000.0,
        zkk_ohm=complex(0.3, 0.4),
        ikss_a=6000.0,
        ip_a=12000.0,
        ith_a=6000.0,
        sk_mva=150.0,
        rx_ratio=0.75,
        kappa=1.3,
        tk_s=tk_s,
        ib_a=6000.0,
        tb_s=0.1,
        branch_contributions=wklady,
    )


def _zabezpieczenie(
    *,
    breaker_ref: str = "CB1",
    curve_type: str = "IEC_SI",
    threshold_a: float = 600.0,
    time_multiplier: float | None = 0.2,
    time_delay_s: float | None = None,
    function_type: str = "overcurrent_51",
    is_enabled: bool = True,
) -> ProtectionAssignment:
    """Zabezpieczenie z modelu: próg po stronie PIERWOTNEJ (jednostka jawna, PZ-09),
    przekładnik 600/5 5P20, przekaźnik z katalogu z zakresami w ×In (REF-OC-200)."""
    return ProtectionAssignment(
        ref_id=f"prot-{breaker_ref}",
        name=f"Zabezpieczenie {breaker_ref}",
        breaker_ref=breaker_ref,
        ct_ref="ct",
        device_type="overcurrent",
        catalog_ref="REF-OC-200",
        is_enabled=is_enabled,
        settings=[
            {
                "function_type": function_type,
                "threshold_a": threshold_a,
                "threshold_unit": "A_PIERWOTNY",
                "curve_type": curve_type,
                "time_multiplier": time_multiplier,
                "time_delay_s": time_delay_s,
            }
        ],
    )


def _nastawy(*przypisania: ProtectionAssignment) -> dict:
    """Nastawy wyłączników rozwiązane JEDNĄ ścieżką (`nastawy_aparatow_modelu`)."""
    model = EnergyNetworkModel(
        header=ENMHeader(name="Czas wyłączenia gałęzi — test"),
        measurements=[
            Measurement(
                ref_id="ct",
                name="Przekładnik 600/5",
                measurement_type="CT",
                bus_ref="BUS1",
                rating={"ratio_primary": 600.0, "ratio_secondary": 5.0, "accuracy_class": "5P20"},
            )
        ],
        protection_assignments=list(przypisania),
    )
    return nastawy_aparatow_modelu(model)


# ---------------------------------------------------------------------------
# Rachunek czasu
# ---------------------------------------------------------------------------


def test_czas_z_charakterystyki_odwrotnej_zgadza_sie_z_rachunkiem_recznym() -> None:
    """DOWOD LICZBOWY (IEC 60255-151 tab. 1, krzywa SI: A = 0,14; B = 0,02).

    I = 6000 A, Is = 600 A => M = 10; TMS = 0,2
    t = 0,2 * 0,14 / (10^0,02 - 1) = 0,028 / 0,047128... = 0,59412... s
    """
    czasy = wyznacz_czasy_wylaczenia(
        graph=_graf(),
        sc_result=_sc_result(prad_a=6000.0),
        nastawy_aparatow=_nastawy(_zabezpieczenie()),
    )
    pozycja = czasy["kabel_A"]
    assert pozycja.zrodlo == ZRODLO_NASTAWA
    assert pozycja.z_nastawy is True
    assert pozycja.tk_s == pytest.approx(0.594119, abs=1e-5)
    assert pozycja.urzadzenie_ref == ref_to_graph_id("CB1")
    assert pozycja.funkcja == "overcurrent_51"
    assert pozycja.prad_galezi_a == pytest.approx(6000.0)
    assert pozycja.prad_rozruchowy_a == pytest.approx(600.0)
    assert pozycja.krzywa == "IEC_SI"


def test_charakterystyka_niezalezna_daje_wprost_nastawiona_zwloke() -> None:
    """DT: czas nie zalezy od pradu — t = zwloka nastawiona (0,3 s)."""
    czasy = wyznacz_czasy_wylaczenia(
        graph=_graf(),
        sc_result=_sc_result(prad_a=6000.0),
        nastawy_aparatow=_nastawy(
            _zabezpieczenie(curve_type="DT", time_multiplier=None, time_delay_s=0.3)
        ),
    )
    assert czasy["kabel_A"].tk_s == pytest.approx(0.3)
    assert czasy["kabel_A"].krzywa == "DT"


# ---------------------------------------------------------------------------
# Topologia: ktory aparat chroni galaz
# ---------------------------------------------------------------------------


def test_aparat_chroniacy_to_wylacznik_od_strony_zasilania() -> None:
    graph = _graf()
    assert znajdz_aparat_chroniacy(graph, "kabel_A") == ref_to_graph_id("CB1")
    assert znajdz_aparat_chroniacy(graph, "kabel_B") == ref_to_graph_id("CB1")


def test_galaz_za_drugim_wylacznikiem_ma_czas_z_tego_blizszego_aparatu() -> None:
    """Selektywnosc: kabel B chroni CB2 (blizej), a nie CB1 od strony zasilania.

    Rachunek dla CB2 (DT, zwloka 0,15 s) daje inny czas niz CB1 (SI, 0,594 s) — gdyby
    modul bral pierwszy napotkany aparat, kabel B dostalby czas CB1.
    """
    graph = _graf_kaskada()
    assert znajdz_aparat_chroniacy(graph, "kabel_A") == ref_to_graph_id("CB1")
    assert znajdz_aparat_chroniacy(graph, "kabel_B") == ref_to_graph_id("CB2")

    czasy = wyznacz_czasy_wylaczenia(
        graph=graph,
        sc_result=_sc_result(prad_a=6000.0),
        nastawy_aparatow=_nastawy(
            _zabezpieczenie(),
            _zabezpieczenie(
                breaker_ref="CB2", curve_type="DT", time_multiplier=None, time_delay_s=0.15
            ),
        ),
    )
    assert czasy["kabel_A"].urzadzenie_ref == ref_to_graph_id("CB1")
    assert czasy["kabel_A"].tk_s == pytest.approx(0.594119, abs=1e-5)
    assert czasy["kabel_B"].urzadzenie_ref == ref_to_graph_id("CB2")
    assert czasy["kabel_B"].tk_s == pytest.approx(0.15)


def test_otwarty_wylacznik_nie_tworzy_drogi_zwarcia() -> None:
    """Otwarty lacznik nie przewodzi — galaz za nim nie ma aparatu chroniacego.

    Bez tego droga zwarcia bylaby fikcyjna, a czas wylaczenia policzony dla aparatu,
    przez ktory prad w ogole nie plynie.
    """
    graph = _graf(stan_cb1=SwitchState.OPEN)
    assert znajdz_aparat_chroniacy(graph, "kabel_A") is None

    czasy = wyznacz_czasy_wylaczenia(
        graph=graph,
        sc_result=_sc_result(prad_a=6000.0),
        nastawy_aparatow=_nastawy(_zabezpieczenie()),
    )
    assert czasy["kabel_A"].tk_s is None
    assert czasy["kabel_A"].zrodlo == ZRODLO_BRAK_APARATU


def test_brak_zrodel_w_modelu_daje_brak_aparatu() -> None:
    """Bez zasilania nie ma strony zasilania, wiec nie ma czego szukac."""
    graph = _graf()
    graph.grid_sc_sources.clear()
    assert znajdz_aparat_chroniacy(graph, "kabel_A") is None


# ---------------------------------------------------------------------------
# Braki danych: zawsze JAWNE, nigdy podstawienie wspolnego tk_s
# ---------------------------------------------------------------------------


def test_brak_rozbicia_pradu_na_galezie_daje_jawny_brak_czasu() -> None:
    czasy = wyznacz_czasy_wylaczenia(
        graph=_graf(),
        sc_result=_sc_result(prad_a=None),
        nastawy_aparatow=_nastawy(_zabezpieczenie()),
    )
    assert czasy["kabel_A"].tk_s is None
    assert czasy["kabel_A"].zrodlo == ZRODLO_BRAK_PRADU
    assert "rozbicia" in czasy["kabel_A"].powod_pl


def test_aparat_bez_zabezpieczenia_daje_jawny_brak_czasu() -> None:
    czasy = wyznacz_czasy_wylaczenia(
        graph=_graf(), sc_result=_sc_result(prad_a=6000.0), nastawy_aparatow=_nastawy()
    )
    assert czasy["kabel_A"].tk_s is None
    assert czasy["kabel_A"].zrodlo == ZRODLO_BRAK_NASTAW
    assert czasy["kabel_A"].urzadzenie_ref == ref_to_graph_id("CB1")


def test_zabezpieczenie_wylaczone_z_ruchu_nie_wyznacza_czasu() -> None:
    czasy = wyznacz_czasy_wylaczenia(
        graph=_graf(),
        sc_result=_sc_result(prad_a=6000.0),
        nastawy_aparatow=_nastawy(_zabezpieczenie(is_enabled=False)),
    )
    assert czasy["kabel_A"].tk_s is None
    assert czasy["kabel_A"].zrodlo == ZRODLO_BRAK_NASTAW


def test_funkcja_ziemnozwarciowa_nie_wyznacza_czasu_zwarcia_miedzyfazowego() -> None:
    """51N nie odpowiada za prad zwarcia trojfazowego uzyty w kryterium cieplnym."""
    czasy = wyznacz_czasy_wylaczenia(
        graph=_graf(),
        sc_result=_sc_result(prad_a=6000.0),
        nastawy_aparatow=_nastawy(_zabezpieczenie(function_type="earth_fault_51N")),
    )
    assert czasy["kabel_A"].tk_s is None
    assert czasy["kabel_A"].zrodlo == ZRODLO_BRAK_NASTAW
    # Jedna ścieżka: urządzenie nadprądowe bez stopni 50/51 ma nazwany brak stopni.
    assert "I> (51)" in czasy["kabel_A"].powod_pl


def test_prad_ponizej_rozruchu_jest_nazwany_wprost() -> None:
    """Prad 400 A < prog 600 A: zabezpieczenie NIE zadziala — to nie jest „czas 0"."""
    czasy = wyznacz_czasy_wylaczenia(
        graph=_graf(),
        sc_result=_sc_result(prad_a=400.0),
        nastawy_aparatow=_nastawy(_zabezpieczenie()),
    )
    assert czasy["kabel_A"].tk_s is None
    assert czasy["kabel_A"].zrodlo == ZRODLO_PONIZEJ_ROZRUCHU
    assert "nie przekracza progu rozruchowego" in czasy["kabel_A"].powod_pl


def test_niekompletna_nastawa_krzywej_odwrotnej_daje_jawny_brak() -> None:
    """Krzywa odwrotna bez mnoznika czasowego jest niewyznaczalna (nie zgadujemy TMS)."""
    czasy = wyznacz_czasy_wylaczenia(
        graph=_graf(),
        sc_result=_sc_result(prad_a=6000.0),
        nastawy_aparatow=_nastawy(_zabezpieczenie(time_multiplier=None)),
    )
    assert czasy["kabel_A"].tk_s is None
    assert czasy["kabel_A"].zrodlo == ZRODLO_BRAK_NASTAW
    assert "mnożnika czasowego" in czasy["kabel_A"].powod_pl


# ---------------------------------------------------------------------------
# Kontrakt mapy dla analizy cieplnej
# ---------------------------------------------------------------------------


def test_mape_nadpisan_tworza_WYLACZNIE_czasy_z_nastaw() -> None:
    """Czas przypadku nadpisuje sie tylko tam, gdzie nastawa zostala rozwiazana.

    Wpisanie tu galezi bez czasu odebraloby projektantowi ocene, ktora ma prawo
    zrobic na wlasnym zalozeniu normowym — a wpisanie jej z czasem przypadku
    udawaloby nastawe. Dlatego takiej galezi w mapie po prostu NIE MA.
    """
    czasy = wyznacz_czasy_wylaczenia(
        graph=_graf(), sc_result=_sc_result(prad_a=6000.0), nastawy_aparatow=_nastawy()
    )
    assert mapa_tk_s_z_nastaw(czasy) == {}

    z_nastawa = wyznacz_czasy_wylaczenia(
        graph=_graf(),
        sc_result=_sc_result(prad_a=6000.0),
        nastawy_aparatow=_nastawy(_zabezpieczenie()),
    )
    mapa = mapa_tk_s_z_nastaw(z_nastawa)
    assert set(mapa) == {"kabel_A", "kabel_B"}
    assert all(wartosc == pytest.approx(0.594119, abs=1e-5) for wartosc in mapa.values())
    assert list(mapa) == sorted(mapa), "kolejnosc deterministyczna"


def test_slad_czasu_nazywa_zrodlo_dla_KAZDEJ_galezi() -> None:
    """KLUCZOWY NIEZMIENNIK KARTY.

    Czas z nastawy i czas zalozony przypadku wygladaja w tabeli identycznie. Gdyby
    galaz mogla pokazac czas bez podania zrodla, zalozenie projektanta bylo by
    nieodroznialne od rozwiazanej ochrony — czyli dokladnie ten defekt, ktory ta
    karta usuwa.
    """
    czasy = wyznacz_czasy_wylaczenia(
        graph=_graf(), sc_result=_sc_result(prad_a=6000.0), nastawy_aparatow=_nastawy()
    )
    slad = slad_czasu(czasy, tk_s_zalozony=1.0)
    assert set(slad) == {"kabel_A", "kabel_B"}
    for pozycja in slad.values():
        assert pozycja["zrodlo"] == ZRODLO_ZALOZENIE_PRZYPADKU
        assert pozycja["tk_s"] == pytest.approx(1.0)
        assert "założony czas przypadku" in pozycja["powod_pl"]
    assert podsumowanie_czasow(slad) == {"z_nastawy": 0, "z_zalozenia": 2, "razem": 2}

    z_nastawa = slad_czasu(
        wyznacz_czasy_wylaczenia(
            graph=_graf(),
            sc_result=_sc_result(prad_a=6000.0),
            nastawy_aparatow=_nastawy(_zabezpieczenie()),
        ),
        tk_s_zalozony=1.0,
    )
    assert all(poz["zrodlo"] == ZRODLO_NASTAWA for poz in z_nastawa.values())
    assert podsumowanie_czasow(z_nastawa) == {"z_nastawy": 2, "z_zalozenia": 0, "razem": 2}


def test_wynik_jest_deterministyczny() -> None:
    argumenty = {
        "graph": _graf(),
        "sc_result": _sc_result(prad_a=6000.0),
        "nastawy_aparatow": _nastawy(_zabezpieczenie()),
    }
    pierwszy = wyznacz_czasy_wylaczenia(**argumenty)
    drugi = wyznacz_czasy_wylaczenia(**argumenty)
    assert pierwszy == drugi
