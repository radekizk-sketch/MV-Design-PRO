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

import pytest
from application.analyses.wytrzymalosc_cieplna_przewodow import (
    build_wytrzymalosc_cieplna_view,
    zbuduj_dowod_cieplny,
)
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


def _przebieg(*, z_zabezpieczeniem: bool, prog_a: float = 100.0):
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
    set_enm("c-cieplna", model)
    run = execute_run(create_run(case_id="c-cieplna", analysis_type="short_circuit_sn").id)
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


def test_raport_mowi_czy_liczby_dotycza_biezacej_wersji_modelu() -> None:
    """Uwaga 12 wlasciciela: kazda zmiana modelu musi byc widoczna w raporcie.

    Wynik sprzed zmiany wyglada IDENTYCZNIE jak aktualny — bez tej informacji
    projekt moglby zostac odebrany na nieaktualnym dowodzie.
    """
    run = _przebieg(z_zabezpieczeniem=True)
    widok = build_wytrzymalosc_cieplna_view(run)
    assert widok["aktualnosc"]["aktualny"] is True
    assert widok["aktualnosc"]["model_hash"] == widok["aktualnosc"]["snapshot_hash"]

    # Zmiana modelu (nowy kabel) unieważnia podstawe biegu — raport ma to nazwac.
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
    set_enm("c-cieplna", model)

    po_zmianie = build_wytrzymalosc_cieplna_view(run)
    assert po_zmianie["aktualnosc"]["aktualny"] is False
    assert "WCZESNIEJSZEJ" in po_zmianie["aktualnosc"]["powod_pl"]


def test_ocena_jest_deterministyczna() -> None:
    run = _przebieg(z_zabezpieczeniem=True)
    assert build_wytrzymalosc_cieplna_view(run) == build_wytrzymalosc_cieplna_view(run)
