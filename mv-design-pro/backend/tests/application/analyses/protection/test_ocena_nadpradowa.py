"""Jedna ścieżka oceny zabezpieczeń nadprądowych z modelu (karta BIEG-ZABEZPIECZEN-Z-MODELU).

Intencja: ocena, którą widzi projektant, liczy się na URZĄDZENIACH i NASTAWACH Z MODELU,
prądzie płynącym przez wyłącznik urządzenia i czasie z rdzenia IEC 60255 — bez
syntetycznego urządzenia, bez wartości domyślnych (TMS 0,3 / I> = minimum pola / 100 A) i
bez marginesów w milionach procent.

Testy są ILOCZYNEM CECH (reguła KLASA, NIE INSTANCJA):
- źródło nastaw {komplet, brak nastaw, poza zakresem, jednostka progu nieustalona, jednostka
  zakresu katalogu nieustalona, brak przekładnika} × wynik rozwiązania,
- krzywa {IEC SI, VI, EI, LI, DT, IEEE MI, VI, EI} × czas z rdzenia wobec NIEZALEŻNEGO
  rachunku wg wzoru normy (stałe wpisane w teście),
- punkt zwarcia {w strefie przy zacisku, w strefie dalej, poza strefą, inny poziom napięcia}
  × strefa {jednoznaczna, pierścień zamknięty, aparat poza torem, aparat otwarty},
- wiarygodność {prąd w granicy ALF, powyżej ALF, klasa pomiarowa}.

Wartości oczekiwane pochodzą z rachunku ręcznego (w komentarzu), nie z uruchomienia kodu.
"""

from __future__ import annotations

import math
from typing import Any

import pytest
from application.analyses.protection.ocena_nadpradowa import (
    KOD_APARAT_OTWARTY,
    KOD_APARAT_POZA_TOREM,
    KOD_BRAK_MNOZNIKA,
    KOD_BRAK_POZYCJI_KATALOGU,
    KOD_BRAK_PROGU,
    KOD_BRAK_PRZEKLADNIKA,
    KOD_BRAK_STOPNI,
    KOD_BRAK_ZWLOKI,
    KOD_CHARAKTERYSTYKA_SPOZA_KATALOGU,
    KOD_JEDNOSTKA_PROGU_NIEUSTALONA,
    KOD_JEDNOSTKA_ZAKRESU_NIEUSTALONA,
    KOD_MNOZNIK_POZA_ZAKRESEM,
    KOD_PROG_POZA_ZAKRESEM,
    KOD_STREFA_NIEJEDNOZNACZNA,
    KOD_WEJSCIE_NIEZGODNE,
    KRZYWE_IEC,
    NIEWIARYGODNY,
    POMINIETE_BEZ_FUNKCJI_NADPRADOWYCH,
    POMINIETE_WYLACZONE,
    WIARYGODNOSC_NIEUSTALONA,
    WIARYGODNY,
    alf_z_klasy,
    czas_stopnia,
    ocen_zabezpieczenia,
    rozwiaz_nastawy,
)
from enm.mapping import ref_to_graph_id
from enm.models import (
    EnergyNetworkModel,
    ENMHeader,
    Measurement,
    ProtectionAssignment,
)
from network_model.core.branch import BranchType, LineBranch
from network_model.core.graph import NetworkGraph
from network_model.core.grid_source import GridShortCircuitSource
from network_model.core.node import Node, NodeType
from network_model.core.switch import Switch, SwitchState, SwitchType
from network_model.solvers.protection_iec60255 import IEC60255_CURVE_PARAMS, IEC60255CurveType

#: Pozycja katalogu ZABEZPIECZENIE z zakresami w ×In i podstawą (profil referencyjny D-33):
#: I> 0,05–5 ×In, I>> 0,1–40 ×In, TMS 0,05–1,0, zwłoka 0,05–100 s, krzywe IEC_NI/IEC_VI/DT.
REL_REF = "REF-OC-200"
#: Pozycja producenta z zakresami BEZ ustalonej jednostki (brak karty producenta w repo).
REL_BEZ_JEDNOSTKI = "EM_ETANGO_400_V0"

# ---------------------------------------------------------------------------
# Fikstury: SIEC —[Q1]— B2 —kabel A— B3 —[Q2]— B3B —kabel B— B4
# ---------------------------------------------------------------------------

B1, B2, B3, B3B, B4 = "wezel-b1", "wezel-b2", "wezel-b3", "wezel-b3b", "wezel-b4"
KABEL_A, KABEL_B = ref_to_graph_id("kabel-a"), ref_to_graph_id("kabel-b")
Q1, Q2 = "q1", "q2"


def _wezel(ident: str, *, slack: bool = False, kv: float = 15.0) -> Node:
    return Node(
        id=ident,
        node_type=NodeType.SLACK if slack else NodeType.PQ,
        voltage_level=kv,
        voltage_magnitude=kv if slack else None,
        voltage_angle=0.0 if slack else None,
        active_power=None if slack else 0.0,
        reactive_power=None if slack else 0.0,
    )


def _kabel(ident: str, od: str, do: str) -> LineBranch:
    return LineBranch(
        id=ident,
        name=f"Kabel {ident[:4]}",
        branch_type=BranchType.CABLE,
        from_node_id=od,
        to_node_id=do,
        r_ohm_per_km=0.2,
        x_ohm_per_km=0.1,
        length_km=1.0,
        rated_current_a=300.0,
        type_ref="cable_pass",
    )


def _graf(
    *,
    pierscien: bool = False,
    stan_q2: SwitchState = SwitchState.CLOSED,
    q3_poza_torem: bool = False,
    wezel_nn: bool = False,
) -> NetworkGraph:
    graph = NetworkGraph()
    graph.add_node(_wezel(B1, slack=True))
    for ident in (B2, B3, B3B, B4):
        graph.add_node(_wezel(ident))
    for ref, od, do, stan in ((Q1, B1, B2, SwitchState.CLOSED), (Q2, B3, B3B, stan_q2)):
        graph.add_switch(
            Switch(
                id=ref_to_graph_id(ref),
                name=f"Wyłącznik {ref}",
                switch_type=SwitchType.BREAKER,
                from_node_id=od,
                to_node_id=do,
                state=stan,
            )
        )
    graph.add_branch(_kabel(KABEL_A, B2, B3))
    graph.add_branch(_kabel(KABEL_B, B3B, B4))
    if pierscien:
        graph.add_branch(_kabel(ref_to_graph_id("kabel-c"), B4, B1))
    if q3_poza_torem:
        graph.add_node(_wezel("wezel-zacisk"))
        graph.add_switch(
            Switch(
                id=ref_to_graph_id("q3"),
                name="Wyłącznik pola bez elementu",
                switch_type=SwitchType.BREAKER,
                from_node_id=B2,
                to_node_id="wezel-zacisk",
                state=SwitchState.CLOSED,
            )
        )
    if wezel_nn:
        graph.add_node(_wezel("wezel-nn", kv=0.4))
        graph.add_branch(_kabel(ref_to_graph_id("kabel-nn"), B4, "wezel-nn"))
    graph.add_grid_sc_source(
        GridShortCircuitSource(
            id="GPZ", name="Sieć nadrzędna", node_id=B1, z_ohm=complex(0.09, 0.9)
        )
    )
    return graph


def _ct(
    ref: str, *, pierwotny: float = 600.0, wtorny: float = 5.0, klasa: str = "5P20"
) -> Measurement:
    return Measurement(
        ref_id=ref,
        name=f"Przekładnik {ref}",
        measurement_type="CT",
        bus_ref="szyna",
        rating={
            "ratio_primary": pierwotny,
            "ratio_secondary": wtorny,
            "accuracy_class": klasa,
        },
    )


def _stopien_51(**nad: Any) -> dict[str, Any]:
    wpis = {
        "function_type": "overcurrent_51",
        "threshold_a": 2.0,  # A wtórne → 2,0·600/5 = 240 A pierwotne; 0,4 ×In w zakresie
        "threshold_unit": "A_WTORNY",
        "curve_type": "IEC_SI",
        "time_multiplier": 0.2,
    }
    wpis.update(nad)
    return wpis


def _stopien_50(**nad: Any) -> dict[str, Any]:
    wpis = {
        "function_type": "overcurrent_50",
        "threshold_a": 20.0,  # A wtórne → 2400 A pierwotne; 4 ×In
        "threshold_unit": "A_WTORNY",
        "curve_type": "DT",
        "time_delay_s": 0.3,
    }
    wpis.update(nad)
    return wpis


def _przypisanie(
    breaker: str,
    settings: list[dict[str, Any]],
    *,
    ct_ref: str | None = "ct",
    catalog_ref: str | None = REL_REF,
    device_type: str = "overcurrent",
    is_enabled: bool = True,
) -> ProtectionAssignment:
    return ProtectionAssignment(
        ref_id=f"zab-{breaker}",
        name=f"Zabezpieczenie {breaker}",
        breaker_ref=breaker,
        ct_ref=ct_ref,
        device_type=device_type,
        catalog_ref=catalog_ref,
        settings=settings,
        is_enabled=is_enabled,
    )


def _model(*przypisania: ProtectionAssignment, ct: Measurement | None = None) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="Ocena nadprądowa — test"),
        measurements=[ct if ct is not None else _ct("ct")],
        protection_assignments=list(przypisania),
    )


def _wiersz(punkt: str, ikss: float) -> dict[str, Any]:
    return {"fault_node_id": punkt, "ikss_a": ikss, "contributions": []}


def _wklad(galaz: str, prad: float, od: str, do: str) -> dict[str, Any]:
    return {
        "source_id": "THEVENIN_GRID",
        "branch_id": galaz,
        "from_node_id": od,
        "to_node_id": do,
        "i_contrib_a": prad,
        "direction": "from_to",
    }


#: Rozpływ syntetyczny zwarcia w B4 (4000 A) i w B2 (9000 A) — promieniowo, bez źródeł w strefie.
ROZPLYW = {
    B4: [_wklad(KABEL_A, 4000.0, B2, B3), _wklad(KABEL_B, 4000.0, B3B, B4)],
    B2: [],
    B3: [_wklad(KABEL_A, 6000.0, B2, B3)],
}
WIERSZE = [_wiersz(B2, 9000.0), _wiersz(B3, 6000.0), _wiersz(B4, 4000.0)]


def _ocen(model: EnergyNetworkModel, graph: NetworkGraph | None = None, **kw: Any):
    return ocen_zabezpieczenia(
        enm=model,
        graph=graph or _graf(),
        wiersze_zwarcia=kw.get("wiersze", WIERSZE),
        rozplyw_punktu=lambda p: kw.get("rozplyw", ROZPLYW).get(p),
        nazwy_wezlow={B2: "Szyna B2", B3: "Szyna B3", B4: "Szyna B4"},
        odniesienie_biegu="bieg testowy",
    )


# ---------------------------------------------------------------------------
# 1. Nastawy z modelu — iloczyn: źródło nastaw × wynik rozwiązania
# ---------------------------------------------------------------------------


def test_komplet_nastaw_daje_progi_pierwotne_z_przekladni() -> None:
    """Próg wtórny 2,0 A przy przekładni 600/5 → pierwotny 2,0·600/5 = 240 A (PZ-09)."""
    nastawy = rozwiaz_nastawy(_model(), _przypisanie(Q1, [_stopien_51(), _stopien_50()]))
    assert nastawy.gotowe, nastawy.braki
    progi = {s.funkcja: s.prog_pierwotny_a for s in nastawy.stopnie}
    assert progi == {
        "overcurrent_51": pytest.approx(240.0),
        "overcurrent_50": pytest.approx(2400.0),
    }
    assert nastawy.alf == 20.0


def test_prog_pierwotny_przeliczany_na_wtorny_do_sprawdzenia_zakresu() -> None:
    """Próg podany po stronie pierwotnej 240 A = 2,0 A wtórne = 0,4 ×In — w zakresie."""
    stopien = _stopien_51(threshold_a=240.0, threshold_unit="A_PIERWOTNY")
    nastawy = rozwiaz_nastawy(_model(), _przypisanie(Q1, [stopien]))
    assert nastawy.gotowe
    assert nastawy.stopnie[0].prog_wtorny_a == pytest.approx(2.0)


@pytest.mark.parametrize(
    ("przypisanie", "ct", "kod"),
    [
        # model bez nastaw stopni nadprądowych
        (_przypisanie(Q1, []), None, KOD_BRAK_STOPNI),
        # stopień bez progu (dawniej: I> = 100 A z wartości domyślnej)
        (_przypisanie(Q1, [_stopien_51(threshold_a=None)]), None, KOD_BRAK_PROGU),
        # jednostka progu nieustalona (dawniej: próg czytany jako pierwotny)
        (
            _przypisanie(Q1, [_stopien_51(threshold_unit=None)]),
            None,
            KOD_JEDNOSTKA_PROGU_NIEUSTALONA,
        ),
        # charakterystyka zależna bez TMS (dawniej: TMS = 0,3 z wartości domyślnej)
        (_przypisanie(Q1, [_stopien_51(time_multiplier=None)]), None, KOD_BRAK_MNOZNIKA),
        # DT bez zwłoki (dawniej: 0 s)
        (_przypisanie(Q1, [_stopien_50(time_delay_s=None)]), None, KOD_BRAK_ZWLOKI),
        # próg poza zakresem katalogu: 0,1 A wtórne = 0,02 ×In < 0,05 ×In
        (_przypisanie(Q1, [_stopien_51(threshold_a=0.1)]), None, KOD_PROG_POZA_ZAKRESEM),
        # TMS poza zakresem 0,05–1,0
        (_przypisanie(Q1, [_stopien_51(time_multiplier=1.5)]), None, KOD_MNOZNIK_POZA_ZAKRESEM),
        # charakterystyka spoza katalogu przekaźnika (REF-OC-200: IEC_NI, IEC_VI, DT)
        (
            _przypisanie(Q1, [_stopien_51(curve_type="IEC_EI")]),
            None,
            KOD_CHARAKTERYSTYKA_SPOZA_KATALOGU,
        ),
        # zakres katalogu bez ustalonej jednostki (pozycja producenta bez karty w repo)
        (
            _przypisanie(Q1, [_stopien_51()], catalog_ref=REL_BEZ_JEDNOSTKI),
            None,
            KOD_JEDNOSTKA_ZAKRESU_NIEUSTALONA,
        ),
        # brak pozycji katalogu
        (_przypisanie(Q1, [_stopien_51()], catalog_ref=None), None, KOD_BRAK_POZYCJI_KATALOGU),
        # brak przekładnika
        (_przypisanie(Q1, [_stopien_51()], ct_ref=None), None, KOD_BRAK_PRZEKLADNIKA),
        # prąd wtórny CT (2 A) spoza wejść przekaźnika (1 A, 5 A) przy zakresie w ×In
        (_przypisanie(Q1, [_stopien_51()]), _ct("ct", wtorny=2.0), KOD_WEJSCIE_NIEZGODNE),
    ],
)
def test_kazdy_brak_jest_nazwany_i_blokuje_ocene(przypisanie, ct, kod) -> None:
    nastawy = rozwiaz_nastawy(_model(ct=ct), przypisanie)
    assert not nastawy.gotowe
    kody = {b.kod for b in nastawy.braki}
    assert kod in kody
    assert all(b.akcja_naprawcza_pl for b in nastawy.braki)


def test_brak_blokuje_tylko_swoje_urzadzenie() -> None:
    """Pozycja gotowości wstrzymuje ocenę TEGO urządzenia i tylko jego (§0.2 karty)."""
    wynik = _ocen(
        _model(
            _przypisanie(Q1, [_stopien_51()]),
            _przypisanie(Q2, [_stopien_51(threshold_a=None)]),
        )
    )
    assert {o.urzadzenie_ref for o in wynik.odmowy} == {"zab-q2"}
    assert {o.urzadzenie_ref for o in wynik.oceny} == {"zab-q1"}


def test_urzadzenie_wylaczone_i_bez_funkcji_nadpradowych_sa_pominiete_z_przyczyna() -> None:
    lom = _przypisanie(
        Q2,
        [{"function_type": "rocof_81R", "threshold_hz_s": 2.0, "time_delay_s": 0.5}],
        device_type="custom",
    )
    wynik = _ocen(_model(_przypisanie(Q1, [_stopien_51()], is_enabled=False), lom))
    assert {(p.urzadzenie_ref, p.kod) for p in wynik.pominiete} == {
        ("zab-q1", POMINIETE_WYLACZONE),
        ("zab-q2", POMINIETE_BEZ_FUNKCJI_NADPRADOWYCH),
    }
    assert wynik.oceny == ()


# ---------------------------------------------------------------------------
# 2. Krzywe — czas z rdzenia wobec NIEZALEŻNEGO rachunku wg normy
# ---------------------------------------------------------------------------

#: IEC 60255-151:2009 tab. 1 (A, B): t = TMS·A/(M^B − 1).
_IEC = {
    "IEC_SI": (0.14, 0.02),
    "IEC_VI": (13.5, 1.0),
    "IEC_EI": (80.0, 2.0),
    "IEC_LI": (120.0, 1.0),
}
#: IEEE C37.112 (A, B, p): t = TD·(A/(M^p − 1) + B).
_IEEE = {
    "IEEE_MI": (0.0515, 0.114, 0.02),
    "IEEE_VI": (19.61, 0.491, 2.0),
    "IEEE_EI": (28.2, 0.1217, 2.0),
}


def _stopien_z_krzywa(krzywa: str):
    if krzywa == "DT":
        wpis = _stopien_51(curve_type="DT", time_multiplier=None, time_delay_s=0.35)
    else:
        wpis = _stopien_51(curve_type=krzywa, time_multiplier=0.2)
    przypisanie = _przypisanie(Q1, [wpis])
    return rozwiaz_nastawy(_model(), przypisanie)


@pytest.mark.parametrize(
    "krzywa", ["IEC_SI", "IEC_VI", "IEC_EI", "IEC_LI", "DT", "IEEE_MI", "IEEE_VI", "IEEE_EI"]
)
@pytest.mark.parametrize("krotnosc", [1.5, 4.0, 10.0])
def test_czas_krzywej_zgodny_ze_wzorem_normy(krzywa: str, krotnosc: float) -> None:
    """Rdzeń IEC 60255 wobec rachunku z wzoru normy liczonego w teście (Is = 240 A).

    Katalog REF-OC-200 nie ma krzywych EI/LI/IEEE — tu badany jest WYŁĄCZNIE czas stopnia,
    więc stopień budowany jest z nastaw rozwiązanych bez sprawdzenia katalogu krzywej.
    """
    nastawy = _stopien_z_krzywa("IEC_SI")
    stopien = nastawy.stopnie[0]
    from dataclasses import replace

    stopien = replace(
        stopien,
        krzywa=krzywa,
        tms=None if krzywa == "DT" else 0.2,
        zwloka_s=0.35 if krzywa == "DT" else None,
    )
    prad = krotnosc * 240.0
    slad = czas_stopnia(stopien, prad)
    if krzywa == "DT":
        oczekiwany = 0.35
    elif krzywa in _IEC:
        a, b = _IEC[krzywa]
        oczekiwany = 0.2 * a / (krotnosc**b - 1.0)
    else:
        a, b, p = _IEEE[krzywa]
        oczekiwany = 0.2 * (a / (krotnosc**p - 1.0) + b)
    assert slad["zadziala"] is True
    # Rdzeń IEC zaokrągla czas do 6 miejsc (determinizm) — tolerancja 1e-6 s.
    assert slad["t_s"] == pytest.approx(oczekiwany, abs=1e-6)
    assert slad["M"] == pytest.approx(krotnosc, rel=1e-9)


def test_rachunek_reczny_si_i_ieee_vi() -> None:
    """Wartości policzone ręcznie wg IEC 60255-151 / IEEE C37.112.

    SI: M = 10, TMS = 0,2 → t = 0,2·0,14/(10^0,02 − 1) = 0,028/0,047128548 = 0,594121 s.
    IEEE VI: M = 5, TD = 0,2 → t = 0,2·(19,61/(25 − 1) + 0,491) = 0,2·1,308083 = 0,261617 s.
    """
    nastawy = _stopien_z_krzywa("IEC_SI")
    assert czas_stopnia(nastawy.stopnie[0], 2400.0)["t_s"] == pytest.approx(0.594121, abs=2e-6)
    from dataclasses import replace

    vi = replace(nastawy.stopnie[0], krzywa="IEEE_VI")
    assert czas_stopnia(vi, 1200.0)["t_s"] == pytest.approx(0.261617, abs=2e-6)


def test_odwzorowanie_krzywych_iec_idzie_po_stalych_a_nie_po_nazwie() -> None:
    """IEC_SI → NI (0,14; 0,02), IEC_LI → „RI" rdzenia = stałe (120; 1) — po wzorze, nie nazwie."""
    for nazwa, stale in _IEC.items():
        assert IEC60255_CURVE_PARAMS[KRZYWE_IEC[nazwa]] == stale, nazwa
    assert KRZYWE_IEC["DT"] is IEC60255CurveType.DT


def test_ponizej_progu_brak_zadzialania_bez_czasu() -> None:
    nastawy = _stopien_z_krzywa("IEC_SI")
    slad = czas_stopnia(nastawy.stopnie[0], 200.0)  # M = 0,833
    assert slad["zadziala"] is False
    assert slad["t_s"] is None


# ---------------------------------------------------------------------------
# 3. Punkt zwarcia × strefa — prąd gałęzi pola z rozpływu, nie Ik'' szyny
# ---------------------------------------------------------------------------


def test_prad_przekaznika_to_prad_galezi_a_nie_ikss_szyny() -> None:
    """Zwarcie w B4: przez Q2 i Q1 płynie 4000 A (prąd kabli), nie Ik'' innych szyn.
    Zwarcie w B2 (klaster zacisku Q1): przez Q1 płynie całe Ik'' = 9000 A."""
    wynik = _ocen(_model(_przypisanie(Q1, [_stopien_51()]), _przypisanie(Q2, [_stopien_51()])))
    prady = {(o.urzadzenie_ref, o.punkt_ref): o.prad_przekaznika_a for o in wynik.oceny}
    assert prady == {
        ("zab-q1", B2): pytest.approx(9000.0),
        ("zab-q1", B3): pytest.approx(6000.0),
        ("zab-q1", B4): pytest.approx(4000.0),
        ("zab-q2", B4): pytest.approx(4000.0),
    }


def test_punkt_poza_strefa_nie_jest_oceniany() -> None:
    """B2 i B3 leżą PRZED Q2 (od strony zasilania) — Q2 ich nie ocenia."""
    wynik = _ocen(_model(_przypisanie(Q2, [_stopien_51()])))
    assert {o.punkt_ref for o in wynik.oceny} == {B4}


def test_pierscien_zamkniety_daje_odmowe_niejednoznacznej_strefy_z_kandydatami() -> None:
    wynik = _ocen(_model(_przypisanie(Q2, [_stopien_51()])), _graf(pierscien=True))
    (odmowa,) = wynik.odmowy
    assert {b.kod for b in odmowa.braki} == {KOD_STREFA_NIEJEDNOZNACZNA}
    assert odmowa.kandydaci_naprawy
    assert wynik.oceny == ()


def test_aparat_poza_torem_pradowym_daje_odmowe() -> None:
    """Styk POLA-W-TORZE: wyłącznik pola bez elementu za zaciskiem nie widzi prądu."""
    wynik = _ocen(_model(_przypisanie("q3", [_stopien_51()])), _graf(q3_poza_torem=True))
    (odmowa,) = wynik.odmowy
    assert {b.kod for b in odmowa.braki} == {KOD_APARAT_POZA_TOREM}


def test_aparat_otwarty_daje_odmowe() -> None:
    wynik = _ocen(_model(_przypisanie(Q2, [_stopien_51()])), _graf(stan_q2=SwitchState.OPEN))
    (odmowa,) = wynik.odmowy
    assert {b.kod for b in odmowa.braki} == {KOD_APARAT_OTWARTY}


def test_punkt_innego_poziomu_napiecia_nazwany_i_nieoceniany() -> None:
    """Rozpływ biegu SC podaje prąd gałęzi w bazie napięcia punktu zwarcia (rdzeń B-01),
    więc punkt nN za transformatorem nie jest oceniany przez przekaźnik SN — z powodem."""
    wiersze = [*WIERSZE, _wiersz("wezel-nn", 18000.0)]
    wynik = _ocen(_model(_przypisanie(Q2, [_stopien_51()])), _graf(wezel_nn=True), wiersze=wiersze)
    assert {o.punkt_ref for o in wynik.oceny} == {B4}
    pominiete = wynik.strefy["zab-q2"]["punkty_innego_poziomu_napiecia"]
    assert [p["punkt_ref"] for p in pominiete] == ["wezel-nn"]


# ---------------------------------------------------------------------------
# 4. Wiarygodność i werdykt wyjaśnialny
# ---------------------------------------------------------------------------


def test_alf_z_klasy_przekladnika() -> None:
    assert alf_z_klasy("5P20") == 20.0
    assert alf_z_klasy("10P10") == 10.0
    assert alf_z_klasy("5PR20") == 20.0
    assert alf_z_klasy("0.5") is None
    assert alf_z_klasy(None) is None


@pytest.mark.parametrize(
    ("klasa", "oczekiwana"),
    [("5P20", WIARYGODNY), ("5P10", NIEWIARYGODNY), ("0.5", WIARYGODNOSC_NIEUSTALONA)],
)
def test_wiarygodnosc_wg_granicy_dokladnosci_przekladnika(klasa: str, oczekiwana: str) -> None:
    """Zwarcie w B2: 9000 A. ALF·I1n: 5P20 → 12 000 A (w granicy), 5P10 → 6000 A (nasycenie).
    Wynik niewiarygodny nie niesie marginesu liczbowego — nigdy liczba bez podstawy."""
    wynik = _ocen(_model(_przypisanie(Q1, [_stopien_51()]), ct=_ct("ct", klasa=klasa)))
    punkt_b2 = next(o for o in wynik.oceny if o.punkt_ref == B2)
    assert punkt_b2.wiarygodnosc == oczekiwana
    if oczekiwana == NIEWIARYGODNY:
        assert punkt_b2.margines_procent is None
    else:
        # M = 9000/240 = 37,5 → (M − 1)·100 = 3650 %
        assert punkt_b2.margines_procent == pytest.approx(3650.0)


def test_rekord_werdyktu_niesie_kryterium_wynik_limit_i_dowod() -> None:
    wynik = _ocen(_model(_przypisanie(Q2, [_stopien_51()])))
    (ocena,) = wynik.oceny
    rekord = ocena.ocena
    assert rekord.status_maszynowy == "SPELNIA"
    assert rekord.wynik is not None and rekord.wynik.wartosc.jednostka == "A"
    assert rekord.limit is not None and rekord.limit.wartosc is not None
    assert rekord.limit.wartosc.wartosc == pytest.approx(240.0)
    assert rekord.dowod.metoda == "OBLICZENIE"
    assert rekord.wyjasnienie.zdanie_pl


def test_odmowa_ma_rekord_nie_ocenionej_oceny_z_brakami() -> None:
    wynik = _ocen(_model(_przypisanie(Q1, [_stopien_51(threshold_a=None)])))
    (odmowa,) = wynik.odmowy
    assert odmowa.ocena.status_maszynowy == "NIE_OCENIONO"
    assert odmowa.ocena.wyjasnienie.czego_brakuje


def test_decyduje_najszybszy_stopien_ktory_ruszyl() -> None:
    """Zwarcie w B2: I = 9000 A. Stopień 51 SI TMS 0,2: M = 37,5 → t = 0,028/(37,5^0,02 − 1)
    = 0,028/0,075198 = 0,3723 s; stopień 50 DT 0,3 s (M = 3,75) → decyduje 50 (0,3 s)."""
    wynik = _ocen(_model(_przypisanie(Q1, [_stopien_51(), _stopien_50()])))
    punkt_b2 = next(o for o in wynik.oceny if o.punkt_ref == B2)
    assert punkt_b2.stopien_decydujacy == "overcurrent_50"
    assert punkt_b2.t_zadzialania_s == pytest.approx(0.3)
    punkt_b4 = next(o for o in wynik.oceny if o.punkt_ref == B4)
    # 4000 A < 2400 A? nie — 4000 > 2400, M50 = 1,667 → DT 0,3 s; 51: M = 16,67 →
    # t = 0,028/(16,67^0,02 − 1) = 0,028/0,057887 = 0,4837 s → decyduje 50.
    assert punkt_b4.stopien_decydujacy == "overcurrent_50"


def test_wynik_deterministyczny() -> None:
    model = _model(_przypisanie(Q1, [_stopien_51()]), _przypisanie(Q2, [_stopien_51()]))
    pierwszy = [o.to_dict() for o in _ocen(model).oceny]
    drugi = [o.to_dict() for o in _ocen(model).oceny]
    assert pierwszy == drugi
    assert all(not math.isnan(o["prad_przekaznika_a"]) for o in pierwszy)


def test_brak_urzadzen_w_modelu_nie_tworzy_syntetycznego_urzadzenia() -> None:
    """Czerwony na bazie: bieg bez przypisań budował `device_{węzeł}` z szablonu przypadku."""
    wynik = _ocen(_model())
    assert wynik.oceny == () and wynik.odmowy == () and wynik.pominiete == ()
