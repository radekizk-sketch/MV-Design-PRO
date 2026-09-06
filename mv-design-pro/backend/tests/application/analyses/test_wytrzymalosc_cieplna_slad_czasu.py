"""Karta F-K1 faza 5: czas wylaczenia w SCIEZCE PRODUKCYJNEJ oceny cieplnej.

Intencja: dotad kryterium cieplne bralo dla kazdej galezi ten sam ``sc_result.tk_s``
— zalozony czas przypadku obliczeniowego — i nic tego nie ujawnialo. Testy pilnuja
trzech rzeczy naraz:
1. galaz z rozwiazana nastawa dostaje czas Z NASTAWY (przez solver IEC 60255),
2. galaz bez nastawy dalej ma ocene, ale slad mowi wprost „zalozenie przypadku",
3. dowod kryterium zaczyna sie od kroku o ZRODLE czasu (bez tego werdykt nie jest
   audytowalny — czas rozstrzyga o wyniku tak samo mocno jak prad).

Kluczowe ogniwo, ktore te testy chronia: przelozenie ``breaker_ref`` modelu ENM na
identyfikator lacznika w grafie. Gdyby sie rozjechalo, KAZDA galaz raportowalaby
brak nastaw — defekt wygladajacy jak brak danych projektanta.
"""

from __future__ import annotations

import copy
import dataclasses
from uuid import uuid4

import pytest
from application.analyses.wytrzymalosc_cieplna_przewodow import (
    build_wytrzymalosc_cieplna_view,
    zbuduj_dowod_cieplny,
)
from application.twin_key import klucz_twin_dla_przypadku
from enm.canonical_analysis import create_run, execute_run, get_run, reset_canonical_runs
from enm.models import Cable, ProtectionAssignment, ProtectionSetting
from enm.store import reset_enm_store, set_enm

from tests.cgmes.golden_enm import build_golden_enm


@pytest.fixture(autouse=True)
def _czysty_rejestr():
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _nowy_przypadek(uow_factory) -> str:
    """Utworz REALNY projekt + przypadek wprost przez UoW; zwroc `case_id`.

    CV-1-W: `_aktualnosc_wobec_modelu` tlumaczy `run.case_id` na klucz magazynu
    ENM przez `klucz_twin_dla_przypadku`, ktora wymaga PRAWDZIWEGO wiersza
    StudyCase (inwariant I-2) — bez niego zwraca uczciwy stan „nie da sie
    potwierdzic aktualnosci" (aktualny=None), nie True/False.
    """
    from domain.models import Project
    from domain.study_case import StudyCase

    project_id = uuid4()
    case_id = uuid4()
    with uow_factory() as uow:
        uow.projects.add(Project(id=project_id, name="Test wytrzymalosci cieplnej"), commit=False)
        uow.cases.add_study_case(
            StudyCase(id=case_id, project_id=project_id, name="Przypadek testu"),
            commit=False,
        )
        uow.commit()
    return str(case_id)


def _przebieg(*, z_zabezpieczeniem: bool, prog_a: float = 100.0, case_id: str = "c-cieplna"):
    """Bieg zwarciowy na sieci wzorcowej, opcjonalnie z zabezpieczeniem na sprzegle.

    ``sw_coupler`` to jedyny wylacznik sieci wzorcowej i lezy miedzy zasilaniem a
    galeziami SN, wiec to on chroni ocenione przewody.
    """
    model = build_golden_enm()
    if z_zabezpieczeniem:
        model.protection_assignments.append(
            ProtectionAssignment(
                ref_id="prot_coupler",
                name="Zabezpieczenie sprzegla",
                breaker_ref="sw_coupler",
                device_type="overcurrent",
                settings=[
                    ProtectionSetting(
                        function_type="overcurrent_51",
                        threshold_a=prog_a,
                        curve_type="IEC_SI",
                        time_multiplier=0.2,
                    )
                ],
            )
        )
    set_enm(case_id, model)
    run = execute_run(
        create_run(case_id=case_id, klucz_twin=case_id, analysis_type="short_circuit_sn").id
    )
    return get_run(run.id)


def test_bez_mapy_zabezpieczen_czas_jest_jawnym_zalozeniem_przypadku() -> None:
    """Brak nastaw nie odbiera oceny — odbiera prawo nazwania czasu nastawa."""
    widok = build_wytrzymalosc_cieplna_view(_przebieg(z_zabezpieczeniem=False))

    podsumowanie = widok["czasy_wylaczenia"]
    assert podsumowanie["z_nastawy"] == 0
    assert podsumowanie["z_zalozenia"] == podsumowanie["razem"] > 0

    for pozycja in widok["ocena"]["items"]:
        czas = pozycja["czas_wylaczenia"]
        assert czas is not None, "kazda galaz musi miec jawne zrodlo czasu"
        assert czas["zrodlo"] == "zalozenie_przypadku"
        assert czas["tk_s"] == pytest.approx(widok["tk_s"])
        assert "założony czas przypadku" in czas["powod_pl"]


def test_z_mapa_zabezpieczen_czas_pochodzi_z_nastawy_i_rozni_sie_od_zalozenia() -> None:
    """DOWOD ROZNICY: ten sam model z nastawa daje INNY czas niz zalozenie przypadku.

    Gdyby przelozenie ``breaker_ref`` -> lacznik grafu nie dzialalo, oba przebiegi
    dalyby identyczny czas (zalozenie) i test by tego nie odroznil.
    """
    widok = build_wytrzymalosc_cieplna_view(_przebieg(z_zabezpieczeniem=True))

    z_nastawy = [
        pozycja
        for pozycja in widok["ocena"]["items"]
        if (pozycja["czas_wylaczenia"] or {}).get("zrodlo") == "nastawa_zabezpieczenia"
    ]
    assert z_nastawy, "zabezpieczenie na sprzegle musi chronic co najmniej jedna galaz"
    assert widok["czasy_wylaczenia"]["z_nastawy"] == len(z_nastawy)

    for pozycja in z_nastawy:
        czas = pozycja["czas_wylaczenia"]
        assert czas["tk_s"] is not None
        assert czas["tk_s"] != pytest.approx(
            widok["tk_s"]
        ), "czas z charakterystyki nie moze przypadkiem rownac sie zalozeniu przypadku"
        assert czas["urzadzenie_ref"], "slad musi wskazywac aparat"
        assert czas["krzywa"] == "IEC_SI"
        assert czas["funkcja"] == "overcurrent_51"


def test_dowod_zaczyna_sie_od_zrodla_czasu_i_niesie_kroki_kryterium() -> None:
    """Dowod bez kroku o zrodle czasu nie jest audytowalny."""
    run = _przebieg(z_zabezpieczeniem=True)
    widok = build_wytrzymalosc_cieplna_view(run)
    galaz = next(
        pozycja
        for pozycja in widok["ocena"]["items"]
        if (pozycja["czas_wylaczenia"] or {}).get("zrodlo") == "nastawa_zabezpieczenia"
    )

    dowod = zbuduj_dowod_cieplny(run, galaz["branch_id"])

    assert dowod["branch_id"] == galaz["branch_id"]
    assert dowod["status"] == galaz["status"]
    kroki = dowod["kroki"]
    assert kroki[0]["key"] == "conductor_thermal_time_source"
    assert "nastawy" in kroki[0]["title"]
    assert kroki[0]["result"]["tk_s"]["value"] == pytest.approx(galaz["czas_wylaczenia"]["tk_s"])
    # Numeracja krokow jest ciagla (spis krokow okna dowodu opiera sie na niej).
    assert [krok["step"] for krok in kroki] == list(range(1, len(kroki) + 1))
    # Kazdy krok niesie komplet pol kanonu (puste pole jest dopuszczalne, brak — nie).
    for krok in kroki:
        assert set(krok) >= {"step", "title", "inputs", "substitution", "result", "notes"}


def test_dowod_nieznanej_galezi_jest_bledem_z_komunikatem_po_polsku() -> None:
    run = _przebieg(z_zabezpieczeniem=False)
    with pytest.raises(ValueError, match="nie występuje w ocenie cieplnej"):
        zbuduj_dowod_cieplny(run, "nie-ma-takiej-galezi")


def test_raport_mowi_czy_liczby_dotycza_biezacej_wersji_modelu(uow_factory) -> None:
    """Uwaga 12 wlasciciela: kazda zmiana modelu musi byc widoczna w raporcie.

    Wynik sprzed zmiany wyglada IDENTYCZNIE jak aktualny — bez tej informacji
    projekt moglby zostac odebrany na nieaktualnym dowodzie. Bierze REALNY
    przypadek (nie literal bez wiersza w bazie): bez niego `_aktualnosc_wobec_
    modelu` nie znajduje z czym porownac model i zwraca uczciwe `aktualny=None`
    zamiast rozstrzygniecia True/False, ktorego ten test naprawde dowodzi.
    """
    case_id = _nowy_przypadek(uow_factory)
    run = _przebieg(z_zabezpieczeniem=True, case_id=case_id)
    widok = build_wytrzymalosc_cieplna_view(run, uow_factory)
    assert widok["aktualnosc"]["aktualny"] is True
    assert widok["aktualnosc"]["model_hash"] == widok["aktualnosc"]["snapshot_hash"]

    # Zmiana modelu (nowy kabel) unieważnia podstawe biegu — raport ma to nazwac.
    # Zapis idzie pod klucz PROJEKTU (nie surowy case_id): odczyt powyzej juz
    # zmigrowal legacy wpis pod klucz kanoniczny (migracja jest per-projekt,
    # jednorazowa), wiec dalsze zapisy surowym kluczem bylyby martwym legacy
    # wpisem, ktorego kanoniczny odczyt juz nigdy nie zobaczy.
    klucz = klucz_twin_dla_przypadku(case_id, uow_factory)
    model = build_golden_enm()
    model.branches.append(
        Cable(
            ref_id="cab_nowy",
            name="Kabel dolozony po biegu",
            from_bus_ref="bus_sn_b",
            to_bus_ref="bus_sn_c",
            length_km=0.5,
            r_ohm_per_km=0.2,
            x_ohm_per_km=0.1,
        )
    )
    set_enm(klucz, model)

    po_zmianie = build_wytrzymalosc_cieplna_view(run, uow_factory)
    assert po_zmianie["aktualnosc"]["aktualny"] is False
    assert "WCZESNIEJSZEJ" in po_zmianie["aktualnosc"]["powod_pl"]


def test_ocena_jest_deterministyczna() -> None:
    run = _przebieg(z_zabezpieczeniem=True)
    assert build_wytrzymalosc_cieplna_view(run) == build_wytrzymalosc_cieplna_view(run)


# --------------------------------------------------------------------------
# FAB-E (E1): odtworzenie ShortCircuitResult/wkladow galeziowych z zapisu
# biegu — brak wymaganego pola to uszkodzony zapis, nie fikcyjne 0.
# --------------------------------------------------------------------------


def _z_wierszem_wyniku(run, mutate):
    """Kopia biegu z ZMUTOWANYM pierwszym wierszem `raw_result["results"]`."""
    raw_result = copy.deepcopy(run.raw_result)
    mutate(raw_result["results"][0])
    return dataclasses.replace(run, raw_result=raw_result)


def test_brak_pola_wyniku_zwarciowego_podnosi_wyjatek_nie_fabrykuje_zera() -> None:
    """FAB-E (E1): brak np. ikss_a w zapisanym wierszu wyniku zwarciowego to
    uszkodzony zapis biegu — odmowa z nazwa pola, nie fikcyjny prad 0 A
    wpiety w ocene wytrzymalosci cieplnej przewodow."""
    run = _przebieg(z_zabezpieczeniem=False)

    def _usun_ikss(wiersz: dict) -> None:
        del wiersz["ikss_a"]

    zmutowany = _z_wierszem_wyniku(run, _usun_ikss)
    with pytest.raises(ValueError, match="ikss_a"):
        build_wytrzymalosc_cieplna_view(zmutowany)


def test_brak_i_contrib_a_pomija_wklad_galeziowy_nie_fabrykuje_zera(caplog) -> None:
    """FAB-E (E1): brak i_contrib_a w jednym wpisie wkladu galeziowego (inline,
    KLUCZ_ROZPLYWU="branch_contributions" — patrz `pobierz_rozplyw_biegu`)
    pomija TEN wpis (z ostrzezeniem w logu), nie fabrykuje zerowego wkladu
    galezi w ocenie wytrzymalosci cieplnej."""
    run = _przebieg(z_zabezpieczeniem=False)
    fault_node_id = run.raw_result["results"][0]["fault_node_id"]
    branch_id = next(iter(run.snapshot.get("branches", [{}])))["ref_id"]

    def _dopisz_wklad_bez_i_contrib(wiersz: dict) -> None:
        wiersz["branch_contributions"] = [
            {
                "source_id": "src-1",
                "branch_id": branch_id,
                "from_node_id": fault_node_id,
                "to_node_id": fault_node_id,
                "direction": "from_to",
                # i_contrib_a CELOWO pominiete — uszkodzony wpis.
            }
        ]

    zmutowany = _z_wierszem_wyniku(run, _dopisz_wklad_bez_i_contrib)
    with caplog.at_level("WARNING"):
        widok = build_wytrzymalosc_cieplna_view(zmutowany)
    assert "i_contrib_a" in caplog.text
    # Widok sie zbudowal (nie wyjatek) — pominiety wpis, reszta oceny dziala dalej.
    assert widok["ocena"]["items"]
