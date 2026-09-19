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
    GRUPY_KRYTERIOW,
    KRYTERIUM_BILANS_Q,
    KRYTERIUM_DOBOR_DER_SN,
    KRYTERIUM_NAPIECIE,
    KRYTERIUM_OBCIAZENIE_GALEZI,
    KRYTERIUM_OBCIAZENIE_TRAFO,
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
    WYNIK_BRAK_PODSTAW,
    WYNIK_NIE_SPELNIA,
    WYNIK_SPELNIA,
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
    return execute_run(
        create_run(case_id=case_id, klucz_twin=case_id, analysis_type=analysis_type).id
    )


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


def test_elementy_sortuja_niesprawdzone_po_naruszonych_mimo_brakujacego_marginesu() -> None:
    """Znalezisko przy weryfikacji §7 (`solver_input_substitute_guard`,
    `H:local:wiersz.margin_pct`) — naprawione u źródła (dyrektywa architekta):
    `_posortowane_wiersze_walidacji` sortuje `elementy[]` wg rangi statusu
    NAJPIERW, a wiersz bez `margin_pct` (np. NOT_COMPUTED) trafia do WŁASNEJ
    grupy „bez danej" (sortowanej po `target_id`), bez fabrykowanego zapasu
    `float("inf")`. Ten test PRZYPINA kolejność: NOT_COMPUTED ląduje w swoim
    WŁASNYM koszyku (ranga 3) ZAWSZE ZA FAIL/WARNING/PASS (ranga 0/1/2) —
    brak zapasu rozstrzyga wyłącznie kolejność WEWNĄTRZ tego samego statusu
    (po `target_id`), nigdy nie chowa naruszenia za niesprawdzonym elementem
    w widocznej kolejności `elementy[]`."""
    widok = {
        "items": [
            _wiersz_energii("L-PASS", "PASS", 40.0),
            _wiersz_energii("L-NOT-COMPUTED", "NOT_COMPUTED", None),
            _wiersz_energii("L-FAIL", "FAIL", -5.0),
            _wiersz_energii("L-WARNING", "WARNING", 3.0),
        ]
    }
    pozycje = {
        p.definicja.kryterium_id: p for p in _pozycje_walidacji_energetycznej(widok, run_id="r1")
    }
    obciazenie = pozycje[KRYTERIUM_OBCIAZENIE_GALEZI]
    kolejnosc_id = [e.element_id for e in obciazenie.elementy]
    assert kolejnosc_id == ["L-FAIL", "L-WARNING", "L-PASS", "L-NOT-COMPUTED"], kolejnosc_id
    # Stan NIESPRAWDZONE kryterium nie zależy od pozycji w liście (zachowawczość
    # agregacji, patrz nagłówek modułu) — sprawdzone tu jako kontrola dwustronna.
    assert obciazenie.stan == STAN_NARUSZONE


def test_elementy_bez_marginesu_sortuja_sie_po_target_id_wewnatrz_statusu() -> None:
    """Iloczyn cech: WIELE wierszy `NOT_COMPUTED` naraz (grupa „bez danej"
    partycjonowana OSOBNO, `_posortowane_wiersze_walidacji`) — porządek
    wewnątrz tej grupy jest deterministyczny (`target_id`), nie przypadkowy;
    i WIELE wierszy PASS z różnym `margin_pct` naraz — porządek WEWNĄTRZ tej
    samej rangi statusu jest funkcją `margin_pct` (malejąco: `margin_pct=50`
    przed `margin_pct=5`, ten sam kierunek, co poprzednia postać funkcji —
    zmierzone REALNYM wywołaniem, nie założone), a grupa „z zapasem" nigdy
    nie miesza się z grupą „bez zapasu"."""
    widok = {
        "items": [
            _wiersz_energii("N-B", "NOT_COMPUTED", None),
            _wiersz_energii("N-A", "NOT_COMPUTED", None),
            _wiersz_energii("P-MARGIN-50", "PASS", 50.0),
            _wiersz_energii("P-MARGIN-5", "PASS", 5.0),
        ]
    }
    pozycje = {
        p.definicja.kryterium_id: p for p in _pozycje_walidacji_energetycznej(widok, run_id="r1")
    }
    kolejnosc_id = [e.element_id for e in pozycje[KRYTERIUM_OBCIAZENIE_GALEZI].elementy]
    assert kolejnosc_id == [
        "P-MARGIN-50",
        "P-MARGIN-5",
        "N-A",
        "N-B",
    ], kolejnosc_id


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
    execute_run(create_run(case_id="c-all", klucz_twin="c-all", analysis_type="PF").id)
    execute_run(
        create_run(case_id="c-all", klucz_twin="c-all", analysis_type="short_circuit_sn").id
    )

    widok = build_werdykt_projektowy_view("c-all", klucz_twin="c-all")

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
    execute_run(create_run(case_id="c-det", klucz_twin="c-det", analysis_type="PF").id)

    assert build_werdykt_projektowy_view(
        "c-det", klucz_twin="c-det"
    ) == build_werdykt_projektowy_view("c-det", klucz_twin="c-det")


def test_zmiana_modelu_po_biegu_uniewaznia_werdykt() -> None:
    """Pomiar reguly 4 kanonu na sciezce produkcyjnej, nie na atrapie."""
    set_enm("c-stale", build_golden_enm())
    execute_run(create_run(case_id="c-stale", klucz_twin="c-stale", analysis_type="PF").id)
    przed = build_werdykt_projektowy_view("c-stale", klucz_twin="c-stale")
    ocenione_przed = [p for p in przed["pozycje"] if p["stan"] != STAN_NIESPRAWDZONE]
    assert ocenione_przed, "przed zmiana modelu musza byc kryteria ocenione"

    zmieniony = get_enm("c-stale").model_copy(deep=True)
    zmieniony.header.name = "Model po zmianie"
    set_enm("c-stale", zmieniony)

    po = build_werdykt_projektowy_view("c-stale", klucz_twin="c-stale")

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


# ---------------------------------------------------------------------------
# PERF-SC-50: fabryka UoW wołającego dociera do dostawcy cieplnego
# ---------------------------------------------------------------------------


def test_fabryka_uow_wolajacego_dociera_do_dostawcy_cieplnego(monkeypatch) -> None:
    """Wkłady gałęziowe liczą się na żądanie z wejścia biegu; bieg z opcjami audytu 2
    czyta konfigurację WYŁĄCZNIE fabryką wołającego — agregat musi ją przekazać
    dostawcy cieplnemu (inaczej kryterium cieplne spadałoby do „niesprawdzone"
    z powodu braku fabryki, nie braku danych)."""
    import application.analyses.werdykt_projektowy as modul

    bieg_sc = _bieg("c-uow", "short_circuit_sn")
    przechwycone: list[object] = []
    fabryka = object()

    def atrapa_dostawcy(bieg, uow_factory=None):
        przechwycone.append(uow_factory)
        raise ValueError("atrapa dostawcy cieplnego")

    monkeypatch.setattr(modul, "build_wytrzymalosc_cieplna_view", atrapa_dostawcy)
    werdykt = zbuduj_werdykt_projektowy(
        case_id="c-uow",
        model_hash=compute_enm_hash(get_enm("c-uow")),
        bieg_pf=None,
        bieg_sc=bieg_sc,
        uow_factory=fabryka,
    )
    assert przechwycone == [fabryka]
    pozycja = _pozycje_po_id(werdykt)[KRYTERIUM_PRZEWOD_CIEPLNY]
    assert pozycja.stan == STAN_NIESPRAWDZONE
    assert "atrapa dostawcy cieplnego" in (pozycja.powod_pl or "")


# ---------------------------------------------------------------------------
# Karta B02-BE-TESTY §5 — ocena per element (OcenaElementu), ocena/grupy
# ---------------------------------------------------------------------------


def _biegi_pf_i_sc(case_id: str, enm) -> tuple:
    """Realne biegi PF + SC na `enm` (BEZ pomocniczej ×8 z `_bieg` — tu wynik
    obu biegów jest potrzebny naraz, a `_bieg` nadpisywałaby ten sam klucz ENM
    dwa razy z tym samym modelem, co jest nieszkodliwe, ale zbędne)."""
    set_enm(case_id, enm)
    bieg_pf = execute_run(create_run(case_id=case_id, klucz_twin=case_id, analysis_type="PF").id)
    bieg_sc = execute_run(
        create_run(case_id=case_id, klucz_twin=case_id, analysis_type="short_circuit_sn").id
    )
    return bieg_pf, bieg_sc


def _zlota_siec_z_obciazeniem(mnoznik: float):
    """Kopia złotej sieci z obciążeniem KAŻDEGO odbioru pomnożonym przez `mnoznik`
    (p_mw i q_mvar) — ×8 daje realne FAIL napięcia/gałęzi/transformatora
    (zmierzone architekta w karcie), ×1 nie narusza niczego."""
    enm = build_golden_enm().model_copy(deep=True)
    for load in enm.loads:
        load.p_mw *= mnoznik
        load.q_mvar *= mnoznik
    return enm


def test_pf_element_napieciowy_ma_komplet_pol_i_dowod_biegu() -> None:
    bieg_pf, _ = _biegi_pf_i_sc("c-el-pf", build_golden_enm())
    werdykt = zbuduj_werdykt_projektowy(
        case_id="c-el-pf",
        model_hash=bieg_pf.snapshot_hash,
        bieg_pf=bieg_pf,
        bieg_sc=None,
        enm_snapshot=None,
    )
    napiecie = _pozycje_po_id(werdykt)[KRYTERIUM_NAPIECIE]
    definicja = napiecie.definicja
    # Relacja zmierzona REALNYM biegiem (nie założona): dostawca walidacji
    # energetycznej zwraca dokładnie tyle elementów, ile ocenił + niesprawdził.
    assert len(napiecie.elementy) == napiecie.liczba_ocenionych + napiecie.liczba_niesprawdzonych
    assert napiecie.elementy, "złota sieć musi dać co najmniej jeden element napięciowy"
    for element in napiecie.elementy:
        assert element.wynik in (WYNIK_SPELNIA, WYNIK_NIE_SPELNIA, WYNIK_BRAK_PODSTAW)
        assert element.wniosek_pl.strip()
        assert element.dowod is not None
        assert element.dowod["run_id"] == str(bieg_pf.id)
        assert element.jednostka == definicja.jednostka
        if element.wynik == WYNIK_SPELNIA:
            # Zakres tej asercji jest CELOWO wąski (pozycja napięciowa walidacji
            # energetycznej, nie każda pozycja werdyktu) — dostawca cieplny SC
            # zwraca SPELNIA trywialne (gałąź poza drogą zwarcia) z `wartosc`/
            # `odniesienie` = None; sprawdzone poniżej w
            # `test_sc_element_cieplny_spelnia_trywialnie_moze_byc_bez_liczb`.
            assert element.wartosc is not None
            assert element.odniesienie is not None


def test_sc_elementy_cieplny_i_wiarygodnosc_maja_dowod_i_pasmo() -> None:
    _, bieg_sc = _biegi_pf_i_sc("c-el-sc", build_golden_enm())
    werdykt = zbuduj_werdykt_projektowy(
        case_id="c-el-sc",
        model_hash=bieg_sc.snapshot_hash,
        bieg_pf=None,
        bieg_sc=bieg_sc,
        enm_snapshot=None,
    )
    pozycje = _pozycje_po_id(werdykt)
    cieplne = pozycje[KRYTERIUM_PRZEWOD_CIEPLNY]
    wiarygodnosc = pozycje[KRYTERIUM_WIARYGODNOSC_SC]
    assert cieplne.elementy, "złota sieć musi dać co najmniej jeden element cieplny"
    assert wiarygodnosc.elementy, "złota sieć musi dać co najmniej jeden element wiarygodności"
    for element in cieplne.elementy + wiarygodnosc.elementy:
        assert element.dowod is not None
        assert element.dowod["run_id"] == str(bieg_sc.id)
        assert element.wynik in (WYNIK_SPELNIA, WYNIK_NIE_SPELNIA, WYNIK_BRAK_PODSTAW)
        assert element.wniosek_pl.strip()
    # Wiarygodność Ik'' jest kryterium PASMOWYM (WARUNEK_PASMO) — element niesie
    # DWIE granice (dolną i górną), nie jedną.
    for element in wiarygodnosc.elementy:
        assert element.odniesienie_dolne is not None
        assert element.odniesienie is not None


def test_sc_element_cieplny_spelnia_trywialnie_moze_byc_bez_liczb() -> None:
    """Kontrola dwustronna do testu powyżej: SPELNIA bez `wartosc`/`odniesienie`
    JEST legalne dla dostawcy cieplnego (gałąź poza drogą zwarcia — kryterium
    spełnione trywialnie, bez liczenia I²t) — `_wniosek` buduje wtedy zdanie z
    `uzasadnienie_pl`, nie z liczb. Ta asercja jest scoped: NIE jest to
    twierdzenie uniwersalne o WSZYSTKICH pozycjach werdyktu (patrz test
    napięciowy powyżej, gdzie SPELNIA ⇒ liczby, bo dostawca ZAWSZE liczy
    obserwowaną wartość)."""
    _, bieg_sc = _biegi_pf_i_sc("c-el-sc-trywialne", build_golden_enm())
    werdykt = zbuduj_werdykt_projektowy(
        case_id="c-el-sc-trywialne",
        model_hash=bieg_sc.snapshot_hash,
        bieg_pf=None,
        bieg_sc=bieg_sc,
        enm_snapshot=None,
    )
    cieplne = _pozycje_po_id(werdykt)[KRYTERIUM_PRZEWOD_CIEPLNY]
    trywialne = [
        e
        for e in cieplne.elementy
        if e.wynik == WYNIK_SPELNIA and "poza drogą zwarcia" in (e.uzasadnienie_pl or "")
    ]
    assert trywialne, "złota sieć musi dać co najmniej jedną gałąź poza drogą zwarcia"
    for element in trywialne:
        assert element.wartosc is None
        assert element.odniesienie is None
        assert element.wniosek_pl.startswith("Wymaganie spełnione:")


def test_liczniki_ocena_sa_suma_wynikow_po_wszystkich_elementach() -> None:
    bieg_pf, bieg_sc = _biegi_pf_i_sc("c-ocena", build_golden_enm())
    enm = get_enm("c-ocena")
    werdykt = zbuduj_werdykt_projektowy(
        case_id="c-ocena",
        model_hash=bieg_pf.snapshot_hash,
        bieg_pf=bieg_pf,
        bieg_sc=bieg_sc,
        enm_snapshot=enm.model_dump(mode="json"),
    )
    elementy = [element for pozycja in werdykt.pozycje for element in pozycja.elementy]
    spelnia = sum(1 for e in elementy if e.wynik == WYNIK_SPELNIA)
    nie_spelnia = sum(1 for e in elementy if e.wynik == WYNIK_NIE_SPELNIA)
    brak = sum(1 for e in elementy if e.wynik == WYNIK_BRAK_PODSTAW)
    ocena = werdykt.ocena
    assert ocena == {
        "oceniono": spelnia + nie_spelnia,
        "spelnia": spelnia,
        "nie_spelnia": nie_spelnia,
        "brak_podstaw": brak,
    }
    assert elementy, "złota sieć z PF+SC musi dać co najmniej jeden element"


def test_grupy_sa_w_kolejnosci_rejestru_i_pokrywaja_grupy_pozycji() -> None:
    bieg_pf, bieg_sc = _biegi_pf_i_sc("c-grupy", build_golden_enm())
    enm = get_enm("c-grupy")
    d = zbuduj_werdykt_projektowy(
        case_id="c-grupy",
        model_hash=bieg_pf.snapshot_hash,
        bieg_pf=bieg_pf,
        bieg_sc=bieg_sc,
        enm_snapshot=enm.model_dump(mode="json"),
    ).to_dict()
    assert [g["kod"] for g in d["grupy"]] == [kod for kod, _ in GRUPY_KRYTERIOW]
    for grupa in d["grupy"]:
        assert grupa["nazwa_pl"].strip()
    kody_grup_pozycji = {p["grupa"] for p in d["pozycje"]}
    kody_grup = {g["kod"] for g in d["grupy"]}
    assert kody_grup_pozycji <= kody_grup, kody_grup_pozycji - kody_grup


# ---------------------------------------------------------------------------
# Przekroczenia REALNE (×8 obciążenia) vs brak przekroczeń (×1)
# ---------------------------------------------------------------------------


def test_siec_x1_bez_przekroczen_nie_ma_elementow_nie_spelnia() -> None:
    enm = _zlota_siec_z_obciazeniem(1.0)
    bieg_pf, bieg_sc = _biegi_pf_i_sc("c-x1", enm)
    werdykt = zbuduj_werdykt_projektowy(
        case_id="c-x1",
        model_hash=bieg_pf.snapshot_hash,
        bieg_pf=bieg_pf,
        bieg_sc=bieg_sc,
        enm_snapshot=enm.model_dump(mode="json"),
    )
    elementy = [element for pozycja in werdykt.pozycje for element in pozycja.elementy]
    nie_spelnia = [e for e in elementy if e.wynik == WYNIK_NIE_SPELNIA]
    assert nie_spelnia == []


def test_siec_x8_obciazenia_daje_realne_naruszenia_z_ujemnym_marginesem() -> None:
    """×8 = ten sam mnożnik, na którym architekt zmierzył realne FAIL napięcia/
    gałęzi/transformatora — ta sama sieć zasila scenę fixtur harnessu
    `werdykt_projektowy_scena_ocena_przekroczenia` (karta §6)."""
    enm = _zlota_siec_z_obciazeniem(8.0)
    bieg_pf, bieg_sc = _biegi_pf_i_sc("c-x8", enm)
    werdykt = zbuduj_werdykt_projektowy(
        case_id="c-x8",
        model_hash=bieg_pf.snapshot_hash,
        bieg_pf=bieg_pf,
        bieg_sc=bieg_sc,
        enm_snapshot=enm.model_dump(mode="json"),
    )
    elementy = [element for pozycja in werdykt.pozycje for element in pozycja.elementy]
    nie_spelnia = [e for e in elementy if e.wynik == WYNIK_NIE_SPELNIA]
    assert nie_spelnia, "×8 obciążenia musi dać co najmniej jeden element NIE_SPELNIA"
    kryteria_naruszone = {
        p.definicja.kryterium_id
        for p in werdykt.pozycje
        if any(e.wynik == WYNIK_NIE_SPELNIA for e in p.elementy)
    }
    # ×8 narusza CO NAJMNIEJ napięcie i obciążalność (gałąź/transformator) —
    # zmierzone realnym biegiem, nie założone (karta §5 "przekroczenia realne").
    assert {KRYTERIUM_NAPIECIE, KRYTERIUM_OBCIAZENIE_GALEZI, KRYTERIUM_OBCIAZENIE_TRAFO} <= (
        kryteria_naruszone
    )
    for element in nie_spelnia:
        assert element.margines is not None
        assert element.margines < 0
        assert element.wniosek_pl.strip()
        # Wniosek jest zdaniem PL: żadnej ucieczki do surowego statusu dostawcy.
        assert "FAIL" not in element.wniosek_pl
        assert "NIE_SPELNIA" not in element.wniosek_pl
    assert werdykt.werdykt == STAN_NARUSZONE


# ---------------------------------------------------------------------------
# Syntetyczne dane dostawcy — WARNING/NOT_COMPUTED/FAIL, jednostka cos(phi)
# ---------------------------------------------------------------------------


def _wiersz_bilans_q_realny(status: str, cos_phi: float | None) -> dict:
    """Kształt IDENTYCZNY z `analysis/energy_validation/builder.py::
    _check_reactive_balance` (odczytany wprost ze źródła) — `unit="cos(phi)"`
    WYŁĄCZNIE gdy dostawca naprawdę policzył cos φ (status PASS/WARNING/FAIL);
    `NOT_COMPUTED` niesie `unit="p.u."` i `observed_value=None` (dostawca NIE
    zmyśla cos φ, gdy moc bilansowa slacka jest nieznana)."""
    if status == "NOT_COMPUTED":
        return {
            "check_type": "REACTIVE_BALANCE",
            "target_id": "SLACK",
            "target_name": "Węzeł bilansujący",
            "observed_value": None,
            "unit": "p.u.",
            "limit_warn": None,
            "limit_fail": None,
            "margin_pct": None,
            "status": status,
            "why_pl": "Brak mocy bilansowej slack.",
            "white_box": [],
        }
    assert cos_phi is not None
    opisy = {
        "PASS": f"cos(phi) = {cos_phi:.3f} >= 0.9 — bilans mocy biernej prawidlowy.",
        "WARNING": f"cos(phi) = {cos_phi:.3f} — bilans mocy biernej na granicy akceptowalnosci.",
        "FAIL": f"cos(phi) = {cos_phi:.3f} < 0.8 — nadmierny pobor mocy biernej z sieci.",
    }
    return {
        "check_type": "REACTIVE_BALANCE",
        "target_id": "SLACK",
        "target_name": "Węzeł bilansujący",
        "observed_value": cos_phi,
        "unit": "cos(phi)",
        "limit_warn": 0.9,
        "limit_fail": 0.8,
        "margin_pct": None,
        "status": status,
        "why_pl": opisy[status],
        "white_box": [],
    }


def test_synteczne_warning_daje_spelnia_z_uwaga() -> None:
    widok = {"items": [_wiersz_bilans_q_realny("WARNING", 0.85)]}
    pozycje = {
        p.definicja.kryterium_id: p for p in _pozycje_walidacji_energetycznej(widok, run_id="r1")
    }
    element = pozycje[KRYTERIUM_BILANS_Q].elementy[0]
    assert element.wynik == WYNIK_SPELNIA
    assert element.uwaga_pl is not None and element.uwaga_pl.strip()


def test_syntetyczne_not_computed_daje_brak_podstaw_z_uzasadnieniem() -> None:
    widok = {"items": [_wiersz_bilans_q_realny("NOT_COMPUTED", None)]}
    pozycje = {
        p.definicja.kryterium_id: p for p in _pozycje_walidacji_energetycznej(widok, run_id="r1")
    }
    element = pozycje[KRYTERIUM_BILANS_Q].elementy[0]
    assert element.wynik == WYNIK_BRAK_PODSTAW
    assert element.uzasadnienie_pl is not None and element.uzasadnienie_pl.strip()


def test_syntetyczne_fail_daje_nie_spelnia() -> None:
    widok = {"items": [_wiersz_bilans_q_realny("FAIL", 0.65)]}
    pozycje = {
        p.definicja.kryterium_id: p for p in _pozycje_walidacji_energetycznej(widok, run_id="r1")
    }
    element = pozycje[KRYTERIUM_BILANS_Q].elementy[0]
    assert element.wynik == WYNIK_NIE_SPELNIA


def test_jednostka_cos_phi_dostawcy_mapuje_sie_na_jednostke_definicji() -> None:
    """Definicja `KRYTERIUM_BILANS_Q` niesie jednostkę „-" — „cos(phi)" NIE jest
    jednostką fizyczną, więc ekran ma pokazać jednostkę kryterium, nie żargon
    dostawcy."""
    widok = {"items": [_wiersz_bilans_q_realny("PASS", 0.95)]}
    pozycje = {
        p.definicja.kryterium_id: p for p in _pozycje_walidacji_energetycznej(widok, run_id="r1")
    }
    element = pozycje[KRYTERIUM_BILANS_Q].elementy[0]
    assert element.jednostka == "-"
    assert pozycje[KRYTERIUM_BILANS_Q].definicja.jednostka == "-"


@pytest.mark.parametrize("status,cos_phi", [("PASS", 0.95), ("WARNING", 0.85), ("FAIL", 0.65)])
def test_wniosek_nie_konczy_sie_podwojna_kropka_ani_nie_zawiera_zargonu_dostawcy(
    status: str, cos_phi: float
) -> None:
    widok = {"items": [_wiersz_bilans_q_realny(status, cos_phi)]}
    pozycje = {
        p.definicja.kryterium_id: p for p in _pozycje_walidacji_energetycznej(widok, run_id="r1")
    }
    wniosek = pozycje[KRYTERIUM_BILANS_Q].elementy[0].wniosek_pl
    assert not wniosek.endswith("..")
    assert "cos(phi)" not in wniosek


def test_wniosek_not_computed_nie_konczy_sie_podwojna_kropka() -> None:
    """NOT_COMPUTED wciela `uzasadnienie_pl` (`why_pl` dostawcy) WPROST w wniosek
    — sprawdzone osobno, bo to jedyna gałąź `_wniosek`, gdzie tekst dostawcy
    trafia na ekran dosłownie (realny `why_pl` tej kontroli nie wspomina
    „cos(phi)", więc test pinuje faktyczny tekst producenta, nie założenie)."""
    widok = {"items": [_wiersz_bilans_q_realny("NOT_COMPUTED", None)]}
    pozycje = {
        p.definicja.kryterium_id: p for p in _pozycje_walidacji_energetycznej(widok, run_id="r1")
    }
    wniosek = pozycje[KRYTERIUM_BILANS_Q].elementy[0].wniosek_pl
    assert not wniosek.endswith("..")
    assert "cos(phi)" not in wniosek
