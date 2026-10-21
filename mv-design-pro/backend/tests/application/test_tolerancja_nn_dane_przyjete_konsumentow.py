"""Werdykty na prądach sieci nN liczonej z wartością roboczą tolerancji niosą daną przyjętą.

DLACZEGO. Karta TOLERANCJA-NN-WARTOSC-ROBOCZA (zasada nr 4, V12K-351, KONTRAKT_WERDYKTU_
WYJASNIALNEGO §3c): sieć nN bez deklaracji tolerancji napięcia liczy się na wartości roboczej
rejestru (+10 %). Każdy werdykt i każdy dokument, który bierze prąd zwarciowy takiego punktu,
stoi na DANEJ PRZYJĘTEJ — ``dane_przyjete`` (jakość ``ESTIMATED``), stan danych
``UNVALIDATED_INPUT``, kompletność ``NIEPELNY``. Brak deklaracji nie może dać „pełnego dowodu”,
a deklaracja nie może dać „danej przyjętej”.

KONSUMENCI (inwentarz klasy, jedno tłumaczenie ``dana_przyjeta_tolerancji_nn``): łuk
elektryczny, wytrzymałość cieplna przewodów i pozycja werdyktu projektowego, wytrzymałość
aparatury pól, ocena nadprądowa i zdanie koordynacji, SWZ TN, SWZ TT/IT, dobór aparatu nN,
arkusz obwodów nN (Ik″max z biegu, Ik1_min TN, I_d min TT/IT), dowód obwodu nN, dowód
aparatury, nastawy z biegów (punkty zestawu, dowód nastaw, odpowiedź pakietu), wniosek do OSD
(sekcja i wiersze DOCX/PDF), reguły generatorów pola.

ILOCZYN CECH: {deklaracja +6 %, +10 %, brak (wartość robocza), sprzeczna} × {scenariusz MAX,
MIN} × {jedna wyspa nN, dwie wyspy — jedna zadeklarowana} × {punkt nN, punkt SN tej samej
sieci} × konsument. Predykat parami: znacznik czytany jest z TEGO SAMEGO wiersza, z którego
konsument bierze prąd (punkt SN i wyspa zadeklarowana — bez danej przyjętej w tym samym biegu).
"""

from __future__ import annotations

import dataclasses
import json
from collections.abc import Callable
from types import SimpleNamespace
from typing import Any

import pytest
from api.generators import _prady_zwarciowe_szyny
from application.analyses.arc_flash_view import build_arc_flash_view
from application.analyses.nn_circuit_sheet import _ik_z_biegu_zwarciowego, build_nn_circuit_sheet
from application.analyses.nn_device_selection import wybierz_aparat_dla_obwodu_nn
from application.analyses.protection.coordination.analyzer import _dopisek_danych_przyjetych
from application.analyses.swz.service import build_swz_view
from application.analyses.werdykt_projektowy import _pozycja_cieplna
from application.analyses.wniosek_osd import _wiersze_zwarc, _zwarcia_sekcja
from application.analyses.wytrzymalosc_aparatury_pol import (
    prady_pol_z_biegu,
    zbuduj_widok_wytrzymalosci_aparatury,
)
from application.analyses.wytrzymalosc_cieplna_przewodow import build_wytrzymalosc_cieplna_view
from application.autorytet_biegu_zwarciowego import wejscie_zwarciowe_z_biegu
from application.equipment_proof.generator import EquipmentProofGenerator
from application.proof_engine.packs.lv_circuit_verification import LVCircuitVerificationProofPack
from application.proof_engine.packs.protection_settings import ProtectionSettingsProofPack
from application.proof_engine.pakiet_nastaw import _dane_przyjete_odpowiedzi
from application.protection_settings.batch_run import _dane_przyjete_punktow
from enm.canonical_analysis import reset_canonical_runs
from enm.mapping import ref_to_graph_id
from enm.models import EnergyNetworkModel
from enm.store import reset_enm_store
from network_model.catalog.wartosci_robocze import (
    TOLERANCJA_NN_ROBOCZA_WIERSZA,
    dana_przyjeta_tolerancji_nn,
    rozstrzygnij_tolerancje_nn,
)
from werdykt.decyzja import kompletnosc_dowodu

from tests.analysis.test_wytrzymalosc_aparatury_pol import _enm as _enm_pol
from tests.analysis.test_wytrzymalosc_aparatury_pol import _wiersz as _wiersz_pola
from tests.application.analyses.lv_domain.fixtury_stacji_nn import REF_STACJA
from tests.application.analyses.protection.test_ocena_nadpradowa import (
    B2,
    B3,
    B4,
    Q2,
    WIERSZE,
    _model,
    _ocen,
    _przypisanie,
    _stopien_51,
)
from tests.application.analyses.test_nn_circuit_sheet import _siec_referencyjna
from tests.application.equipment_proof.test_equipment_proof import _base_input
from tests.enm.test_canonical_sc_c_per_pasmo import (
    N1,
    N2,
    N4,
    _bieg_zwarciowy,
    _build_mv_lv_enm,
    _dwie_wyspy_nn,
)
from tests.enm.test_tolerancja_nn_iloczyn_cech import _enm_petli_z
from tests.proof_engine.test_lv_circuit_verification_tt_it_w5e_ttit import (
    _enm_it,
    _enm_tt,
    _kontekst,
    _wywolaj,
)
from tests.test_proof_protection_settings import _make_input

#: Wspólny przedrostek nazwy danej przyjętej (``dana_przyjeta_tolerancji_nn``) — znacznik,
#: którego szukają testy w każdym zserializowanym wyniku konsumenta.
ZNACZNIK = "tolerancja napięcia sieci nN ("

#: Deklaracja → czy sieć liczy się na wartości roboczej.
DEKLARACJE_TRAFO: dict[str, str | None] = {"PLUS_6": "PLUS_6", "PLUS_10": "PLUS_10", "brak": None}


@pytest.fixture(autouse=True)
def _czysty_stan():
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _ile(obiekt: Any) -> int:
    """Liczba danych przyjętych tolerancji sieci nN w zserializowanym wyniku konsumenta."""

    def _domyslna(o: Any) -> Any:
        if hasattr(o, "model_dump"):
            return o.model_dump(mode="json")
        if dataclasses.is_dataclass(o) and not isinstance(o, type):
            return dataclasses.asdict(o)
        return str(o)

    return json.dumps(obiekt, ensure_ascii=False, default=_domyslna).count(ZNACZNIK)


def _z_tolerancja(enm: EnergyNetworkModel, tolerancja: str | None) -> EnergyNetworkModel:
    """Ta sama sieć, każdy transformator z tą samą deklaracją (albo bez niej)."""
    return enm.model_copy(
        update={
            "transformers": [
                t.model_copy(update={"lv_voltage_tolerance": tolerancja}) for t in enm.transformers
            ]
        }
    )


# =============================================================================
# 0. Jedno tłumaczenie: dana przyjęta = ESTIMATED; deklaracja nie jest daną przyjętą
# =============================================================================


def test_dana_przyjeta_jest_szacowana_i_nazywa_miejsce() -> None:
    dana = dana_przyjeta_tolerancji_nn(miejsce_pl="punkt zwarcia: Szyna nN")
    assert dana.nazwa_pl == "tolerancja napięcia sieci nN (punkt zwarcia: Szyna nN)"
    assert dana.jakosc.value == "ESTIMATED"
    assert dana.wartosc is not None
    assert (dana.wartosc.wartosc, dana.wartosc.jednostka) == (10.0, "%")
    assert "+10 %" in dana.powod_pl and "IEC 60909-0" in dana.powod_pl
    assert TOLERANCJA_NN_ROBOCZA_WIERSZA.robocza


@pytest.mark.parametrize("deklaracja", ["PLUS_6", "PLUS_10"])
def test_deklaracja_nie_jest_dana_przyjeta_to_blad_programu(deklaracja: str) -> None:
    rozstrzygniecie = rozstrzygnij_tolerancje_nn((deklaracja,))  # type: ignore[arg-type]
    assert not rozstrzygniecie.robocza
    with pytest.raises(AssertionError):
        dana_przyjeta_tolerancji_nn(miejsce_pl="x", rozstrzygniecie=rozstrzygniecie)


# =============================================================================
# 1. Konsumenci zapisanego biegu zwarciowego — jedna wyspa nN × {+6 %, +10 %, brak} × MAX/MIN
# =============================================================================


@pytest.mark.parametrize("scenariusz", ["max", "min"])
@pytest.mark.parametrize("deklaracja", sorted(DEKLARACJE_TRAFO))
def test_konsumenci_wiersza_biegu_jedna_wyspa(deklaracja: str, scenariusz: str) -> None:
    robocza = DEKLARACJE_TRAFO[deklaracja] is None
    case = f"konsumenci-{deklaracja}-{scenariusz}"
    enm = _build_mv_lv_enm("Sieć", tolerancja=DEKLARACJE_TRAFO[deklaracja])  # type: ignore[arg-type]
    run = _bieg_zwarciowy(case, enm, {"scenario": scenariusz})

    # Arkusz obwodów nN — Ik″max z biegu: znacznik wiersza punktu nN, nigdy punktu SN.
    assert _ik_z_biegu_zwarciowego(run, N2)[2] is robocza
    assert _ik_z_biegu_zwarciowego(run, N1)[2] is False

    # Reguły generatorów pola: znacznik z TEGO SAMEGO wiersza co Ik''/ip.
    ik, ip, run_id, znacznik = _prady_zwarciowe_szyny(case, N2)
    assert ik is not None and ip is not None and run_id == str(run.id)
    assert znacznik is robocza
    assert _prady_zwarciowe_szyny(case, N1)[3] is False

    # Wniosek do OSD: sekcja i wiersze tabeli (wspólne dla DOCX i PDF).
    sekcja = _zwarcia_sekcja(run, N2)
    assert ("dane_przyjete" in sekcja) is robocza
    assert _ile(sekcja) == int(robocza)
    wiersze = _wiersze_zwarc(sekcja)
    assert (wiersze[-1][0] == "Dana przyjęta (wartość robocza)") is robocza
    assert "dane_przyjete" not in _zwarcia_sekcja(run, N1)

    # Nastawy z biegów: punkty zestawu (powtórzona szyna liczona raz, szyna SN — nigdy).
    raw = run.raw_result
    dane = _dane_przyjete_punktow(
        enm,
        [
            (raw, ref_to_graph_id(N2), N2),
            (raw, ref_to_graph_id(N1), N1),
            (raw, ref_to_graph_id(N2), N2),
        ],
    )
    assert len(dane) == int(robocza)
    if robocza:
        assert dane[0].nazwa_pl == "tolerancja napięcia sieci nN (szyna „Szyna nN”)"

    # Autorytet biegu → dowód aparatury (ścieżka API pakietu aparatury).
    wejscie = wejscie_zwarciowe_z_biegu(run_id=str(run.id), punkt_zwarcia=ref_to_graph_id(N2))
    assert wejscie.tolerancja_nn_robocza is robocza
    assert (
        wejscie_zwarciowe_z_biegu(
            run_id=str(run.id), punkt_zwarcia=ref_to_graph_id(N1)
        ).tolerancja_nn_robocza
        is False
    )
    wejscie_dowodu = dataclasses.replace(
        _base_input(), tolerancja_nn_robocza=wejscie.tolerancja_nn_robocza
    )
    paczka = EquipmentProofGenerator.generate(wejscie_dowodu)
    assert len(paczka.result.dane_przyjete) == int(robocza)
    assert (paczka.result.to_dict().get("status_danych") == "UNVALIDATED_INPUT") is robocza
    assert ("tolerancja_nn_robocza" in wejscie_dowodu.to_dict()) is robocza
    assert _ile(paczka.proof_document.summary.warnings) == int(robocza)


@pytest.mark.parametrize("deklaracja", sorted(DEKLARACJE_TRAFO))
def test_luk_elektryczny_i_wytrzymalosc_cieplna(deklaracja: str) -> None:
    robocza = DEKLARACJE_TRAFO[deklaracja] is None
    run = _bieg_zwarciowy(
        f"luk-{deklaracja}",
        _build_mv_lv_enm("Sieć", tolerancja=DEKLARACJE_TRAFO[deklaracja]),  # type: ignore[arg-type]
    )
    wiersze = run.raw_result["results"]
    wiersze_nn = [w for w in wiersze if w.get("tolerancja_nn_robocza")]
    assert len(wiersze_nn) == (2 if robocza else 0)  # szyna nN i koniec obwodu nN

    # Łuk elektryczny: dana przyjęta przy KAŻDYM punkcie nN liczonym z wartością roboczą.
    luk = build_arc_flash_view(
        run, working_distance_mm=455.0, conductor_gap_mm=25.0, arc_time_s=0.2
    )
    assert _ile(luk) == len(wiersze_nn)

    # Wytrzymałość cieplna czyta PIERWSZY wiersz biegu — dane przyjęte z TEGO SAMEGO wiersza.
    # Kolejność naturalna: pierwszy wiersz to punkt SN — bez danej przyjętej w każdej sieci.
    widok_sn = build_wytrzymalosc_cieplna_view(run)
    assert "dane_przyjete" not in widok_sn
    # Pierwszy wiersz punktu nN: dana przyjęta wyłącznie, gdy sieć nN liczona jest roboczo.
    wezel_nn = ref_to_graph_id(N2)
    pierwszy_nn = next(w for w in wiersze if w["fault_node_id"] == wezel_nn)
    run_nn = dataclasses.replace(
        run,
        raw_result={
            **run.raw_result,
            "results": [pierwszy_nn, *(w for w in wiersze if w is not pierwszy_nn)],
        },
    )
    widok_nn = build_wytrzymalosc_cieplna_view(run_nn)
    assert (widok_nn.get("status_danych") == "UNVALIDATED_INPUT") is robocza
    assert _ile(widok_nn.get("dane_przyjete", [])) == int(robocza)
    # Werdykt projektowy niesie zastrzeżenie z widoku (pozycja cieplna).
    pozycja = _pozycja_cieplna(widok_nn, run_id=str(run.id))
    assert (_ile(pozycja) > 0) is robocza


# =============================================================================
# 2. Dwie wyspy nN, jedna zadeklarowana — dana przyjęta wyłącznie w wyspie bez deklaracji
# =============================================================================


@pytest.mark.parametrize("scenariusz", ["max", "min"])
@pytest.mark.parametrize("deklaracja_a", ["PLUS_6", "PLUS_10"])
def test_konsumenci_dwie_wyspy(deklaracja_a: str, scenariusz: str) -> None:
    case = f"wyspy-{deklaracja_a}-{scenariusz}"
    enm = _dwie_wyspy_nn(deklaracja_a, None)
    run = _bieg_zwarciowy(case, enm, {"scenario": scenariusz})
    raw = run.raw_result
    for szyna, robocza in ((N2, False), (N4, True)):
        assert _ik_z_biegu_zwarciowego(run, szyna)[2] is robocza
        assert _prady_zwarciowe_szyny(case, szyna)[3] is robocza
        assert ("dane_przyjete" in _zwarcia_sekcja(run, szyna)) is robocza
        assert (
            wejscie_zwarciowe_z_biegu(
                run_id=str(run.id), punkt_zwarcia=ref_to_graph_id(szyna)
            ).tolerancja_nn_robocza
            is robocza
        )
    dane = _dane_przyjete_punktow(
        enm, [(raw, ref_to_graph_id(N2), N2), (raw, ref_to_graph_id(N4), N4)]
    )
    assert [d.nazwa_pl for d in dane] == ["tolerancja napięcia sieci nN (szyna „Szyna nN wyspy B”)"]
    luk = build_arc_flash_view(
        run, working_distance_mm=455.0, conductor_gap_mm=25.0, arc_time_s=0.2
    )
    assert _ile(luk) == 1
    assert "Szyna nN wyspy B" in json.dumps(luk, ensure_ascii=False)


# =============================================================================
# 3. Ocena nadprądowa i zdanie koordynacji — znacznik wiersza punktu oceny
# =============================================================================


@pytest.mark.parametrize("oznaczony", ["zaden", B2, B3, B4, "wszystkie"])
def test_ocena_nadpradowa_dana_przyjeta_punktu_oceny(oznaczony: str) -> None:
    """Q2 ocenia się w punkcie B4 (strefa za Q2): dana przyjęta wyłącznie, gdy wiersz B4 —
    ten sam, z którego ocena bierze prąd — niesie znacznik wartości roboczej."""
    wiersze = [
        (
            {**w, "tolerancja_nn_robocza": True}
            if oznaczony in ("wszystkie", w["fault_node_id"])
            else w
        )
        for w in WIERSZE
    ]
    (ocena,) = _ocen(_model(_przypisanie(Q2, [_stopien_51()])), wiersze=wiersze).oceny
    assert ocena.punkt_ref == B4
    robocza = oznaczony in (B4, "wszystkie")
    status = ocena.ocena.dowod.status_danych
    assert (status.stan == "UNVALIDATED_INPUT") is robocza
    assert [d.nazwa_pl for d in status.dane_przyjete] == (
        ["tolerancja napięcia sieci nN (punkt zwarcia Szyna B4)"] if robocza else []
    )
    kompletnosc, powody = kompletnosc_dowodu(ocena.ocena.dowod, ())
    if robocza:
        assert kompletnosc == "NIEPELNY"
        assert any(ZNACZNIK in p for p in powody), powody
    dopisek = _dopisek_danych_przyjetych(ocena)
    assert (ZNACZNIK in dopisek) is robocza
    assert (dopisek == "") is (not robocza)


# =============================================================================
# 4. Wytrzymałość aparatury pól — znacznik per pole z wiersza szyny pola
# =============================================================================


@pytest.mark.parametrize("oznaczona", ["zadna", "sn1", "sn2"])
def test_wytrzymalosc_aparatury_dana_przyjeta_per_pole(oznaczona: str) -> None:
    wiersze = []
    for szyna, (ik, ip, ith) in (("sn1", (5.0, 12.5, 5.1)), ("sn2", (1.0, 2.5, 1.02))):
        wiersz = _wiersz_pola(szyna, "3F", ik, ip, ith)
        if szyna == oznaczona:
            wiersz["tolerancja_nn_robocza"] = True
        wiersze.append(wiersz)
    enm = _enm_pol()
    prady = prady_pol_z_biegu(enm=enm, station_ref="stn", wiersze_biegu=wiersze)
    szyna_pola = {"pole/in": "sn1", "pole/tr": "sn2"}
    for pole, szyna in szyna_pola.items():
        assert prady[pole].tolerancja_nn_robocza is (szyna == oznaczona)
        assert ("tolerancja_nn_robocza" in prady[pole].to_dict()) is (szyna == oznaczona)
    widok = zbuduj_widok_wytrzymalosci_aparatury(
        enm=enm, station_ref="stn", prady_pol=prady, run_id="bieg"
    )
    for wpis in widok["pola"]:
        oznaczone = wpis["prady_pola"]["punkt_ref"] == oznaczona
        # Każda ocena pola (dynamiczna, cieplna, wyłączalność) stoi na tym samym prądzie.
        assert all((_ile(o) > 0) is oznaczone for o in wpis["oceny"]), wpis["oceny"]


# =============================================================================
# 5. Pętla zwarcia nN: SWZ TN, dobór aparatu, arkusz obwodów, dowód obwodu, TT/IT
# =============================================================================

#: Deklaracja pętli → czy liczona na wartości roboczej (sprzeczna: dwie różne deklaracje).
DEKLARACJE_PETLI = {"PLUS_6": False, "PLUS_10": False, "brak": True, "sprzeczna": True}


@pytest.mark.parametrize("deklaracja", sorted(DEKLARACJE_PETLI))
def test_swz_tn_i_dobor_aparatu(deklaracja: str) -> None:
    robocza = DEKLARACJE_PETLI[deklaracja]
    enm = _enm_petli_z(deklaracja)
    swz = build_swz_view(enm, "stn", "b1", "ap1")["swz"]
    assert (swz.get("status_danych") == "UNVALIDATED_INPUT") is robocza
    assert (_ile(swz.get("dane_przyjete", [])) == 1) is robocza
    assert ("dane_przyjete" in swz) is robocza

    # Ik″max podany przez projektanta (parametr wejścia, nie bieg) — bez danej przyjętej;
    # Ik1_min z pętli tej sieci — z daną przyjętą wyłącznie przy wartości roboczej.
    dobor = wybierz_aparat_dla_obwodu_nn(
        enm=enm, station_ref="stn", bus_ref="b1", ib_a=50.0, iz_prime_a=80.0, ik_max_ka=12.0
    )
    assert dobor["status"] == "OK"
    assert (_ile(dobor["dobor"].get("dane_przyjete_ik1_min", [])) == 1) is robocza
    assert dobor["dobor"]["kandydaci"]
    for kandydat in dobor["dobor"]["kandydaci"]:
        kryteria = {k["nazwa"]: k for k in kandydat["kryteria"]}
        swz_kandydata = kryteria["SWZ przy Ik_min"]
        assert ("dane_przyjete" in swz_kandydata) is robocza
        assert (swz_kandydata.get("status_danych") == "UNVALIDATED_INPUT") is robocza
        assert "dane_przyjete" not in kryteria["Zdolność wyłączania >= Ik″max"]
        assert "dane_przyjete" not in kryteria["Ib<=In<=Iz′"]


@pytest.mark.parametrize("deklaracja", sorted(DEKLARACJE_TRAFO))
def test_arkusz_obwodow_nn_tn_ik1_min_i_swz(deklaracja: str) -> None:
    robocza = DEKLARACJE_TRAFO[deklaracja] is None
    enm = _z_tolerancja(_siec_referencyjna(), DEKLARACJE_TRAFO[deklaracja])
    bieg = _bieg_zwarciowy(f"arkusz-{deklaracja}", enm)
    arkusz = build_nn_circuit_sheet(enm=enm, station_ref="stn", short_circuit_run=bieg)
    for wiersz in arkusz["wiersze"]:
        # Ik″max z biegu (punkt nN najgorszy odpływu) i Ik1_min z pętli tej samej sieci.
        assert wiersz["ik_max"]["status"] == "OK"
        assert (_ile(wiersz["ik_max"]) > 0) is robocza, wiersz["feeder_root_branch_ref"]
        assert ("wartość robocza" in wiersz["ik_max"]["zrodlo_pl"]) is robocza
        assert wiersz["ik_min"]["status"] == "OK"
        assert (_ile(wiersz["ik_min"]) > 0) is robocza, wiersz["feeder_root_branch_ref"]
        assert (wiersz["ik_min"].get("status_danych") == "UNVALIDATED_INPUT") is robocza
        if wiersz["swz"]["status"] in ("OK", "nierozstrzygalne"):
            assert (_ile(wiersz["swz"]) > 0) is robocza


_UKLADY: dict[str, tuple[Callable[[], EnergyNetworkModel], str]] = {
    "TT": (_enm_tt, "a3"),
    "IT": (_enm_it, "a2"),
}


@pytest.mark.parametrize("deklaracja", sorted(DEKLARACJE_TRAFO))
@pytest.mark.parametrize("uklad", sorted(_UKLADY))
def test_tt_it_werdykt_dowod_i_arkusz(uklad: str, deklaracja: str) -> None:
    robocza = DEKLARACJE_TRAFO[deklaracja] is None
    budowa, szyna = _UKLADY[uklad]
    enm = _z_tolerancja(budowa(), DEKLARACJE_TRAFO[deklaracja])
    wynik = _wywolaj(enm, bus_ref=szyna)
    assert wynik["status"] == "OK", wynik
    wejscie = wynik["wejscie"]
    assert wejscie.fault_loop.tolerancja_nn_robocza is robocza
    # Werdykt SWZ TT/IT: dana przyjęta w dowodzie kryteriów liczonych z prądu pętli.
    assert (_ile(wejscie.swz_tt_it) > 0) is robocza
    # Dowód obwodu nN: ostrzeżenie z nazwą danej przyjętej.
    dokument = LVCircuitVerificationProofPack.generate(wejscie, _kontekst())
    assert (_ile(list(dokument.summary.warnings)) == 1) is robocza
    # Arkusz obwodów nN: I_d min pętli doziemnej z tą samą daną przyjętą.
    if uklad == "TT":
        arkusz = build_nn_circuit_sheet(enm=enm, station_ref=REF_STACJA)
        (wiersz,) = (w for w in arkusz["wiersze"] if w["feeder_root_branch_ref"] == "ap_a")
        assert wiersz["ik_min"]["status"] == "OK"
        assert (_ile(wiersz["ik_min"]) > 0) is robocza
        assert (_ile(wiersz["swz"]) > 0) is robocza


# =============================================================================
# 6. Nastawy: dowód nastaw i odpowiedź pakietu — dana przyjęta wejścia, addytywnie
# =============================================================================


@pytest.mark.parametrize("robocza", [False, True])
def test_dowod_i_odpowiedz_nastaw(robocza: bool) -> None:
    dane = (dana_przyjeta_tolerancji_nn(miejsce_pl="Szyna „Szyna nN”"),) if robocza else ()
    wynik = ProtectionSettingsProofPack.generate(_make_input(dane_przyjete=dane))
    assert _ile(list(wynik.proof.summary.warnings)) == int(robocza)
    odpowiedz = _dane_przyjete_odpowiedzi(
        SimpleNamespace(wejscie=SimpleNamespace(dane_przyjete=dane))
    )
    if robocza:
        assert odpowiedz["status_danych"] == "UNVALIDATED_INPUT"
        assert _ile(odpowiedz["dane_przyjete"]) == 1
    else:
        assert odpowiedz == {}
