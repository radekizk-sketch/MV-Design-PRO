"""Testy agregatu werdyktu projektowego (karta F-K3, znalezisko Z3 audytu FLOW).

Rodzaje testow i po co:
1. na REALNYCH biegach zlotej sieci — dowod, ze dostawcy sa naprawde podlaczeni
   (agregat pokazujacy „niesprawdzone" dla wszystkiego przechodzilby testy
   syntetyczne i byl bezuzyteczny w produkcji),
2. na SYNTETYCZNYCH danych dostawcy — dla stanow, ktorych nie da sie wywolac
   zlota siecia bez naciagania modelu (ostrzezenie WARNING, pozycja
   NOT_COMPUTED). Ksztalt payloadu jest zgodny z realnym serializatorem
   (``analysis/energy_validation/serializer.py:item_to_dict``).
"""

from __future__ import annotations

import dataclasses

import pytest
from application.analyses.werdykt_projektowy import (
    KRYTERIUM_BILANS_Q,
    KRYTERIUM_DOBOR_DER_SN,
    KRYTERIUM_NAPIECIE,
    KRYTERIUM_OBCIAZENIE_GALEZI,
    KRYTERIUM_PRZEWOD_CIEPLNY,
    KRYTERIUM_PWP_COS_PHI,
    KRYTERIUM_PWP_MOC,
    KRYTERIUM_WIARYGODNOSC_SC,
    POWOD_BIEG_NIEAKTUALNY,
    POWOD_BIEG_NIEUDANY,
    POWOD_BRAK_BIEGU,
    REJESTR_KRYTERIOW,
    STAN_NARUSZONE,
    STAN_NIE_DOTYCZY,
    STAN_NIESPRAWDZONE,
    STAN_SPELNIONE,
    ZRODLO_PF,
    ZRODLO_SC,
    _pozycje_walidacji_energetycznej,
    build_werdykt_projektowy_view,
    zbuduj_werdykt_projektowy,
)
from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
from enm.hash import compute_enm_hash
from enm.store import get_enm, reset_enm_store, set_enm

from tests.cgmes.golden_enm import build_golden_enm


@pytest.fixture(autouse=True)
def _reset():
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _bieg(case_id: str, analysis_type: str):
    set_enm(case_id, build_golden_enm())
    return execute_run(create_run(case_id=case_id, analysis_type=analysis_type).id)


def _pozycje_po_id(werdykt) -> dict:
    return {pozycja.definicja.kryterium_id: pozycja for pozycja in werdykt.pozycje}


# ---------------------------------------------------------------------------
# Brak podstawy do oceny
# ---------------------------------------------------------------------------


def test_brak_biegow_daje_wszystkie_kryteria_niesprawdzone() -> None:
    werdykt = zbuduj_werdykt_projektowy(
        case_id="c1",
        model_hash="hash-modelu",
        bieg_pf=None,
        bieg_sc=None,
        enm_snapshot=None,
    )

    assert werdykt.werdykt == STAN_NIESPRAWDZONE
    pozycje = _pozycje_po_id(werdykt)
    z_biegow = [
        pozycja for pozycja in werdykt.pozycje if pozycja.definicja.zrodlo in (ZRODLO_PF, ZRODLO_SC)
    ]
    assert z_biegow, "rejestr musi zawierac kryteria oparte na biegach"
    assert {pozycja.stan for pozycja in z_biegow} == {STAN_NIESPRAWDZONE}
    assert {pozycja.powod_kod for pozycja in z_biegow} == {POWOD_BRAK_BIEGU}
    # Brak toru DER-SN to NIE „niesprawdzone": nie ma czego naruszyc.
    assert pozycje[KRYTERIUM_DOBOR_DER_SN].stan == STAN_NIE_DOTYCZY
    # Ani jedno kryterium nie moze udawac spelnionego bez danych.
    assert werdykt.podsumowanie["spelnione"] == 0


def test_bieg_nieaktualny_nie_moze_liczyc_sie_jako_spelnienie() -> None:
    """Regula 4 kanonu: zmiana modelu uniewaznia WSZYSTKIE wyniki przypadku."""
    bieg = _bieg("c-pf", "PF")

    werdykt = zbuduj_werdykt_projektowy(
        case_id="c-pf",
        model_hash="hash-po-zmianie-modelu",
        bieg_pf=bieg,
        bieg_sc=None,
        enm_snapshot=None,
    )

    pozycje = _pozycje_po_id(werdykt)
    assert pozycje[KRYTERIUM_NAPIECIE].stan == STAN_NIESPRAWDZONE
    assert pozycje[KRYTERIUM_NAPIECIE].powod_kod == POWOD_BIEG_NIEAKTUALNY
    zrodlo_pf = next(z for z in werdykt.zrodla if z.rodzaj == ZRODLO_PF)
    assert zrodlo_pf.aktualny is False
    assert zrodlo_pf.dostepny is False
    assert zrodlo_pf.run_id == str(bieg.id)


def test_bieg_nieudany_niesie_wlasny_powod() -> None:
    bieg = dataclasses.replace(_bieg("c-pf", "PF"), status="FAILED")

    werdykt = zbuduj_werdykt_projektowy(
        case_id="c-pf",
        model_hash=bieg.snapshot_hash,
        bieg_pf=bieg,
        bieg_sc=None,
        enm_snapshot=None,
    )

    pozycje = _pozycje_po_id(werdykt)
    assert pozycje[KRYTERIUM_PWP_MOC].powod_kod == POWOD_BIEG_NIEUDANY
    assert "FAILED" in (pozycje[KRYTERIUM_PWP_MOC].powod_pl or "")


def test_bieg_w_toku_nie_jest_biegiem_nieudanym() -> None:
    """Inna przyczyna, inna reakcja: poczekaj kontra napraw dane i uruchom ponownie."""
    bieg = dataclasses.replace(_bieg("c-pf", "PF"), status="RUNNING")

    werdykt = zbuduj_werdykt_projektowy(
        case_id="c-pf",
        model_hash=bieg.snapshot_hash,
        bieg_pf=bieg,
        bieg_sc=None,
        enm_snapshot=None,
    )

    pozycja = _pozycje_po_id(werdykt)[KRYTERIUM_PWP_MOC]
    assert pozycja.stan == STAN_NIESPRAWDZONE
    assert pozycja.powod_kod == POWOD_BRAK_BIEGU
    assert pozycja.powod_kod != POWOD_BIEG_NIEUDANY
    assert "w toku" in (pozycja.powod_pl or "")


# ---------------------------------------------------------------------------
# Realne biegi — dowod podlaczenia dostawcow
# ---------------------------------------------------------------------------


def test_realny_bieg_rozplywu_ocenia_kryteria_energetyczne() -> None:
    bieg = _bieg("c-pf", "PF")

    werdykt = zbuduj_werdykt_projektowy(
        case_id="c-pf",
        model_hash=bieg.snapshot_hash,
        bieg_pf=bieg,
        bieg_sc=None,
        enm_snapshot=None,
    )

    pozycje = _pozycje_po_id(werdykt)
    napiecie = pozycje[KRYTERIUM_NAPIECIE]
    # Dostawca faktycznie odpowiedzial: sa ocenione wezly, a nie powod „brak biegu".
    assert napiecie.powod_kod != POWOD_BRAK_BIEGU
    assert napiecie.liczba_ocenionych > 0
    assert napiecie.stan in (STAN_SPELNIONE, STAN_NARUSZONE, STAN_NIESPRAWDZONE)
    assert pozycje[KRYTERIUM_OBCIAZENIE_GALEZI].liczba_ocenionych > 0
    zrodlo_pf = next(z for z in werdykt.zrodla if z.rodzaj == ZRODLO_PF)
    assert zrodlo_pf.dostepny is True
    assert zrodlo_pf.aktualny is True


def test_zlota_siec_bez_warunkow_osd_daje_kryteria_pwp_niesprawdzone() -> None:
    """Warunki przylaczenia sa DANA WEJSCIOWA projektu, nie wynikiem.

    Zlota siec nie ma ``header.connection_conditions``, wiec oba kryteria punktu
    przylaczenia musza wyjsc NIESPRAWDZONE — a nie spelnione „bo nic nie
    przekroczono".
    """
    bieg = _bieg("c-pf", "PF")

    werdykt = zbuduj_werdykt_projektowy(
        case_id="c-pf",
        model_hash=bieg.snapshot_hash,
        bieg_pf=bieg,
        bieg_sc=None,
        enm_snapshot=None,
    )

    pozycje = _pozycje_po_id(werdykt)
    assert pozycje[KRYTERIUM_PWP_MOC].stan == STAN_NIESPRAWDZONE
    assert pozycje[KRYTERIUM_PWP_COS_PHI].stan == STAN_NIESPRAWDZONE
    assert pozycje[KRYTERIUM_PWP_MOC].powod_pl


def test_realny_bieg_zwarciowy_ocenia_kryterium_cieplne_i_wiarygodnosc() -> None:
    bieg = _bieg("c-sc", "short_circuit_sn")

    werdykt = zbuduj_werdykt_projektowy(
        case_id="c-sc",
        model_hash=bieg.snapshot_hash,
        bieg_pf=None,
        bieg_sc=bieg,
        enm_snapshot=None,
    )

    pozycje = _pozycje_po_id(werdykt)
    cieplne = pozycje[KRYTERIUM_PRZEWOD_CIEPLNY]
    wiarygodnosc = pozycje[KRYTERIUM_WIARYGODNOSC_SC]
    assert cieplne.powod_kod != POWOD_BRAK_BIEGU
    assert cieplne.liczba_ocenionych + cieplne.liczba_niesprawdzonych > 0
    assert wiarygodnosc.liczba_ocenionych > 0
    assert wiarygodnosc.run_id == str(bieg.id)
    zrodlo_sc = next(z for z in werdykt.zrodla if z.rodzaj == ZRODLO_SC)
    assert zrodlo_sc.dostepny is True


# ---------------------------------------------------------------------------
# Zasady agregacji (dane syntetyczne dostawcy — patrz naglowek pliku)
# ---------------------------------------------------------------------------


def _wiersz_energii(target_id: str, status: str, margin_pct: float | None = 10.0) -> dict:
    return {
        "check_type": "BRANCH_LOADING",
        "target_id": target_id,
        "target_name": target_id,
        "observed_value": 100.0,
        "unit": "%",
        "limit_warn": 80.0,
        "limit_fail": 100.0,
        "margin_pct": margin_pct,
        "status": status,
        "why_pl": f"Pozycja {target_id}: {status}.",
        "white_box": [],
    }


def test_niesprawdzona_pozycja_nie_znika_pod_spelnieniem_pozostalych() -> None:
    """„50 z 51 galezi w normie" NIE znaczy „kryterium spelnione"."""
    widok = {
        "items": [
            _wiersz_energii("L1", "PASS"),
            _wiersz_energii("L2", "PASS"),
            _wiersz_energii("L3", "NOT_COMPUTED", None),
        ]
    }

    pozycje = {
        p.definicja.kryterium_id: p for p in _pozycje_walidacji_energetycznej(widok, run_id="r1")
    }

    obciazenie = pozycje[KRYTERIUM_OBCIAZENIE_GALEZI]
    assert obciazenie.stan == STAN_NIESPRAWDZONE
    assert obciazenie.liczba_ocenionych == 2
    assert obciazenie.liczba_niesprawdzonych == 1
    assert obciazenie.wiodacy_element_id == "L3"


def test_naruszenie_dominuje_nad_niesprawdzonym() -> None:
    widok = {
        "items": [
            _wiersz_energii("L1", "FAIL", -12.0),
            _wiersz_energii("L2", "NOT_COMPUTED", None),
        ]
    }

    pozycje = {
        p.definicja.kryterium_id: p for p in _pozycje_walidacji_energetycznej(widok, run_id="r1")
    }

    obciazenie = pozycje[KRYTERIUM_OBCIAZENIE_GALEZI]
    assert obciazenie.stan == STAN_NARUSZONE
    assert obciazenie.liczba_naruszen == 1
    assert obciazenie.liczba_niesprawdzonych == 1
    # Element wiodacy = naruszony, nie niesprawdzony (tam jest praca do wykonania).
    assert obciazenie.wiodacy_element_id == "L1"


def test_ostrzezenie_nie_jest_naruszeniem_ale_jest_zliczone() -> None:
    """WARNING = limit nie przekroczony, wiec kryterium SPELNIONE; margines maly."""
    widok = {
        "items": [
            _wiersz_energii("L1", "PASS", 40.0),
            _wiersz_energii("L2", "WARNING", 5.0),
        ]
    }

    pozycje = {
        p.definicja.kryterium_id: p for p in _pozycje_walidacji_energetycznej(widok, run_id="r1")
    }

    obciazenie = pozycje[KRYTERIUM_OBCIAZENIE_GALEZI]
    assert obciazenie.stan == STAN_SPELNIONE
    assert obciazenie.liczba_ostrzezen == 1
    assert obciazenie.liczba_naruszen == 0
    assert obciazenie.wiodacy_element_id == "L2"


def test_brak_pozycji_kontroli_daje_niesprawdzone_nie_spelnione() -> None:
    pozycje = {
        p.definicja.kryterium_id: p
        for p in _pozycje_walidacji_energetycznej({"items": []}, run_id="r1")
    }

    assert pozycje[KRYTERIUM_BILANS_Q].stan == STAN_NIESPRAWDZONE
    assert pozycje[KRYTERIUM_OBCIAZENIE_GALEZI].stan == STAN_NIESPRAWDZONE


# ---------------------------------------------------------------------------
# Kontrakt widoku
# ---------------------------------------------------------------------------


def test_kolejnosc_pozycji_zgodna_z_rejestrem_kryteriow() -> None:
    werdykt = zbuduj_werdykt_projektowy(
        case_id="c1",
        model_hash="h",
        bieg_pf=None,
        bieg_sc=None,
        enm_snapshot=None,
    )

    kolejnosc = [pozycja.definicja.kryterium_id for pozycja in werdykt.pozycje]
    assert kolejnosc == [definicja.kryterium_id for definicja in REJESTR_KRYTERIOW]


def test_kazde_kryterium_niesie_warunek_i_odniesienie_normowe() -> None:
    """Kontrakt ekranu prowadzacego punkt 3: bez kryterium liczba jest tylko liczba."""
    for definicja in REJESTR_KRYTERIOW:
        assert definicja.warunek_pl.strip(), definicja.kryterium_id
        assert definicja.norma_pl.strip(), definicja.kryterium_id
        assert definicja.etap.startswith("E"), definicja.kryterium_id


def test_widok_niesie_jawny_zakres_kryteriow_poza_automatem() -> None:
    """Werdykt nie moze udawac certyfikatu kompletnosci."""
    werdykt = zbuduj_werdykt_projektowy(
        case_id="c1",
        model_hash="h",
        bieg_pf=None,
        bieg_sc=None,
        enm_snapshot=None,
    ).to_dict()

    zakres = werdykt["zakres_poza_automatem"]
    assert len(zakres) >= 3
    for wpis in zakres:
        assert wpis["kryterium_pl"].strip()
        assert wpis["powod_pl"].strip()
        assert wpis["etap"].startswith("E")


def test_serwis_liczy_werdykt_dla_przypadku_z_realnymi_biegami() -> None:
    """Sciezka produkcyjna: model + biegi z magazynu, bez podawania ich recznie."""
    set_enm("c-all", build_golden_enm())
    execute_run(create_run(case_id="c-all", analysis_type="PF").id)
    execute_run(create_run(case_id="c-all", analysis_type="short_circuit_sn").id)

    widok = build_werdykt_projektowy_view("c-all")

    assert widok["case_id"] == "c-all"
    assert widok["model_hash"] == compute_enm_hash(get_enm("c-all"))
    # Oba biegi sa aktualne wobec modelu (nie zmienil sie po nich).
    assert all(z["aktualny"] for z in widok["zrodla"])
    assert all(z["dostepny"] for z in widok["zrodla"])
    stany = {pozycja["kryterium_id"]: pozycja["stan"] for pozycja in widok["pozycje"]}
    assert stany[KRYTERIUM_NAPIECIE] != STAN_NIESPRAWDZONE
    assert stany[KRYTERIUM_WIARYGODNOSC_SC] != STAN_NIESPRAWDZONE


def test_serwis_jest_deterministyczny() -> None:
    set_enm("c-det", build_golden_enm())
    execute_run(create_run(case_id="c-det", analysis_type="PF").id)

    assert build_werdykt_projektowy_view("c-det") == build_werdykt_projektowy_view("c-det")


def test_zmiana_modelu_po_biegu_uniewaznia_werdykt() -> None:
    """Pomiar reguly 4 kanonu na sciezce produkcyjnej, nie na atrapie."""
    set_enm("c-stale", build_golden_enm())
    execute_run(create_run(case_id="c-stale", analysis_type="PF").id)
    przed = build_werdykt_projektowy_view("c-stale")
    ocenione_przed = [p for p in przed["pozycje"] if p["stan"] != STAN_NIESPRAWDZONE]
    assert ocenione_przed, "przed zmiana modelu musza byc kryteria ocenione"

    zmieniony = get_enm("c-stale").model_copy(deep=True)
    zmieniony.header.name = "Model po zmianie"
    set_enm("c-stale", zmieniony)

    po = build_werdykt_projektowy_view("c-stale")

    assert po["model_hash"] != przed["model_hash"]
    zrodlo_pf = next(z for z in po["zrodla"] if z["rodzaj"] == ZRODLO_PF)
    assert zrodlo_pf["aktualny"] is False
    stany = {pozycja["kryterium_id"]: pozycja["stan"] for pozycja in po["pozycje"]}
    assert stany[KRYTERIUM_NAPIECIE] == STAN_NIESPRAWDZONE
    powody = {
        pozycja["kryterium_id"]: pozycja["powod_kod"]
        for pozycja in po["pozycje"]
        if pozycja["kryterium_id"] == KRYTERIUM_NAPIECIE
    }
    assert powody[KRYTERIUM_NAPIECIE] == POWOD_BIEG_NIEAKTUALNY
