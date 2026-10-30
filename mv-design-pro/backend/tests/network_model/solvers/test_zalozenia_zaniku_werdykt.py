"""Werdykt I_b ≤ I_cu niesie założenia krzywych zaniku μ/q (karta PODSTAWA-Q, rozstrzygnięcie 2).

PO CO. Pierwsza część karty rozdzieliła podstawę reguł krzywych zaniku: μ (IEC 60909-0:2016
pkt 9.1.1) wolno interpolować wprost z normy, q (pkt 9.1.2) — tylko jako interpretację
inżynierską; krzywa 0,02 s dla t_min < 0,02 s to założenie dla OBU wielkości. Werdykt
„prąd wyłączeniowy I_b ≤ zdolność wyłączania I_cu" stał jednak dalej w zakresie ważności tak,
jakby I_b wynikał z samej normy. Kontrakt werdyktu §4.1 każe zakresowi nazwać założenia, na
których stoi wynik — więc wiersz wyniku zwarciowego niesie addytywne pole ``zalozenia_zaniku``
(zgoda B-01 architekta, wyłącznie pole addytywne, exclude_none), a każdy konsument werdyktu
I_b nazywa je jednym zdaniem (`zdanie_zalozen_zaniku_ib_pl`).

ILOCZYN CECH (każda komórka — osobny bieg REALNĄ ścieżką: migawka ENM → bieg kanoniczny →
wiersz wyniku → konsument):
  {maszyna synchroniczna, asynchroniczna klatkowa, asynchroniczna DFIG}
  × {t_b w węźle krzywej (0,1 s), między węzłami (0,07 s), poniżej zakresu (0,01 s),
     powyżej zakresu (0,3 s)}
  × {zakres ważności werdyktu wyłączania zawiera / nie zawiera założenia}
oraz: kryteria dynamiczne i cieplne tego samego pola (nie zależą od μ/q — zdania brak),
dowód doboru aparatury (uwaga kryterium I_cu i ostrzeżenie dowodu; aparat bez zdolności
wyłączania — brak ostrzeżenia), dowód SC3F (ostrzeżenie), raport PDF/DOCX (linia bilansu),
ślad rdzenia (wejście i komentarz kroku „Ib"), zwarcie jednofazowe (I_b = I″k — pola brak),
sieć bez maszyn (pola brak), determinizm (dwa biegi), predykat parami (wpisy wiersza = wpisy
z rozbicia maszyn dowodu SC3F, a reguła każdego wpisu = reguła śladu μ/q tego wkładu).

Wyrocznia założeń jest zapisana w tym pliku NIEZALEŻNIE od tablicy podstaw solvera: dla
maszyny synchronicznej q nie istnieje, a μ jest założeniem wyłącznie poniżej 0,02 s; dla
maszyny asynchronicznej q jest założeniem także przy interpolacji między krzywymi.
"""

from __future__ import annotations

import io
import json
import uuid
import zipfile
from datetime import UTC, datetime
from typing import Any

import pytest
from api.analysis_run_exports import _sc_row_bilans_linie
from api.main import app
from application.analyses.wytrzymalosc_aparatury_pol import widok_wytrzymalosci_z_biegu
from application.autorytet_biegu_zwarciowego import wielkosci_kontraktu_klienta
from application.equipment_proof.generator import EquipmentProofGenerator
from application.equipment_proof.types import DeviceRating, EquipmentProofInput
from application.proof_engine.packs.sc_symmetrical import SC3FPackInput, SC3FProofPack
from enm.canonical_analysis import (
    CanonicalRun,
    build_execution_result_set,
    build_short_circuit_results,
    canonical_run_repository_scope,
    reset_canonical_runs,
    wykonaj_bieg_w_pamieci,
)
from enm.mapping import map_enm_to_network_graph
from enm.models import EnergyNetworkModel
from fastapi.testclient import TestClient
from network_model.core.wiazanie_wyniku_zwarciowego import wielkosci_do_odcisku
from network_model.solvers.machine_sc_iec60909 import (
    REGULA_INTERPOLACJA,
    REGULA_PONIZEJ_ZAKRESU,
    compute_machine_contributions,
    zalozenia_krzywych_wkladow,
    zdanie_zalozen_zaniku_ib_pl,
    zdanie_zalozenia_krzywej_pl,
)

from tests.network_model.solvers.test_prad_wylaczeniowy_iloczyn_cech import _migawka

MASZYNY = ("synchroniczna", "asynchroniczna", "dfig")
#: t_b → reguła krzywej, którą ten czas wybiera (progi krzywych 0,02 / 0,05 / 0,1 / 0,25 s).
CZASY = {"wezel": 0.1, "interpolacja": 0.07, "ponizej": 0.01, "powyzej": 0.3}

#: Wyrocznia: (maszyna, rodzaj t_b) → zbiór (wielkość, reguła) wyznaczonych na założeniu.
ZALOZENIA_OCZEKIWANE: dict[tuple[str, str], frozenset[tuple[str, str]]] = {
    ("synchroniczna", "wezel"): frozenset(),
    ("synchroniczna", "interpolacja"): frozenset(),  # μ: pkt 9.1.1 zezwala wprost
    ("synchroniczna", "ponizej"): frozenset({("mu", REGULA_PONIZEJ_ZAKRESU)}),
    ("synchroniczna", "powyzej"): frozenset(),
    ("asynchroniczna", "wezel"): frozenset(),
    ("asynchroniczna", "interpolacja"): frozenset({("q", REGULA_INTERPOLACJA)}),
    ("asynchroniczna", "ponizej"): frozenset(
        {("mu", REGULA_PONIZEJ_ZAKRESU), ("q", REGULA_PONIZEJ_ZAKRESU)}
    ),
    ("asynchroniczna", "powyzej"): frozenset(),
}
for _rodzaj in CZASY:
    ZALOZENIA_OCZEKIWANE[("dfig", _rodzaj)] = ZALOZENIA_OCZEKIWANE[("asynchroniczna", _rodzaj)]

#: Wyłącznik SN 24 kV z katalogu APARAT_SN (I_cu 25 kA) — pole stacji na szynie 33 kV maszyny.
WYLACZNIK = "sw-cb-abb-vd4-24kv-630a"
STACJA = "stn/test-zaniku"
POLE = "pole/test-zaniku"
POCZATEK_ZDANIA = "Prąd wyłączeniowy stoi na założeniach inżynierskich krzywych zaniku"


def _migawka_ze_stacja(maszyna: str) -> tuple[dict[str, Any], str]:
    """Sieć IEC 60909 z maszyną na szynie 33 kV i polem stacji z wyłącznikiem na tej szynie."""
    migawka, wezel = _migawka(maszyna)
    szyna = next(b["ref_id"] for b in migawka["buses"] if b["voltage_kv"] == 33.0)
    migawka["buses"].append({"ref_id": "zacisk/pole", "name": "Zacisk pola", "voltage_kv": 33.0})
    migawka["branches"].append(
        {
            "ref_id": "aparat/pole",
            "name": "Wyłącznik pola",
            "type": "breaker",
            "from_bus_ref": szyna,
            "to_bus_ref": "zacisk/pole",
            "catalog_ref": WYLACZNIK,
            "catalog_namespace": "APARAT_SN",
            "meta": {"station_ref": STACJA, "bay_ref": POLE},
        }
    )
    migawka["substations"].append(
        {
            "ref_id": STACJA,
            "name": "Stacja SN",
            "station_type": "mv_lv",
            "bus_refs": [szyna],
        }
    )
    # Jedyny nośnik pól stacji to kolekcja `bays` modelu.
    migawka.setdefault("bays", []).append(
        {
            "ref_id": POLE,
            "name": "P-01",
            "bay_role": "IN",
            "substation_ref": STACJA,
            "bus_ref": szyna,
            "equipment_refs": ["aparat/pole"],
        }
    )
    EnergyNetworkModel.model_validate(migawka)
    return migawka, wezel


def _bieg(migawka: dict[str, Any], tb_s: float, rodzaj: str = "SC_3F") -> CanonicalRun:
    run = CanonicalRun(
        id=uuid.uuid4(),
        case_id="przypadek-zaniku",
        project_id="projekt-zaniku",
        analysis_type="short_circuit_sn",
        status="FINISHED",
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
        snapshot_hash="snap-zaniku",
        input_hash="in-zaniku",
        snapshot=migawka,
        validation={},
        readiness={},
        options={
            "fault_type": rodzaj,
            "scenario": "max",
            "thermal_time_seconds": 1.0,
            "breaking_time_seconds": tb_s,
        },
    )
    run.finished_at = run.created_at
    wykonaj_bieg_w_pamieci(run)
    return run


_PRZEBIEGI: dict[tuple[str, str], tuple[CanonicalRun, dict[str, Any], dict[str, Any], str]] = {}


def _przebieg(
    maszyna: str, rodzaj_tb: str
) -> tuple[CanonicalRun, dict[str, Any], dict[str, Any], str]:
    """(bieg, migawka, wiersz surowy punktu maszyny, węzeł) — jeden bieg na komórkę."""
    klucz = (maszyna, rodzaj_tb)
    if klucz not in _PRZEBIEGI:
        migawka, wezel = _migawka_ze_stacja(maszyna)
        run = _bieg(migawka, CZASY[rodzaj_tb])
        wiersz = next(r for r in run.raw_result["results"] if r["fault_node_id"] == wezel)
        _PRZEBIEGI[klucz] = (run, migawka, wiersz, wezel)
    return _PRZEBIEGI[klucz]


def _krok_ib(wiersz: dict[str, Any]) -> dict[str, Any]:
    (krok,) = (k for k in wiersz["white_box_trace"] if k.get("key") == "Ib")
    return krok


def _oceny_pola(run: CanonicalRun, migawka: dict[str, Any]) -> dict[str, dict[str, Any]]:
    widok = widok_wytrzymalosci_z_biegu(
        enm=EnergyNetworkModel.model_validate(migawka),
        station_ref=STACJA,
        wiersze_biegu=build_short_circuit_results(run)["rows"],
        run_id=str(run.id),
    )
    (pole,) = (p for p in widok["pola"] if p["pole_ref"] == POLE)
    return {o["kryterium_id"].rsplit(".", 1)[-1]: o for o in pole["oceny"]}


KOMORKI = [(m, t) for m in MASZYNY for t in CZASY]


@pytest.mark.parametrize(("maszyna", "rodzaj_tb"), KOMORKI)
def test_wiersz_wyniku_niesie_zalozenia_wg_wyroczni(maszyna: str, rodzaj_tb: str) -> None:
    """Pole wiersza: dokładnie wpisy wyroczni, z regułą, t_min i podstawą; brak wpisów → brak
    klucza (exclude_none — sieć na samych zapisach normy ma wiersz bajt w bajt jak przed kartą)."""
    _, _, wiersz, _ = _przebieg(maszyna, rodzaj_tb)
    oczekiwane = ZALOZENIA_OCZEKIWANE[(maszyna, rodzaj_tb)]
    if not oczekiwane:
        assert "zalozenia_zaniku" not in wiersz
        return
    wpisy = wiersz["zalozenia_zaniku"]
    assert {(w["wielkosc"], w["regula"]) for w in wpisy} == oczekiwane
    assert len(wpisy) == len(oczekiwane)
    for wpis in wpisy:
        assert wpis["podstawa_reguly"] == "ZALOZENIE_INZYNIERSKIE"
        assert wpis["t_min_s"] == CZASY[rodzaj_tb]
        assert wpis["norma"].startswith("IEC 60909-0:2016 pkt 9.1.")
        assert wpis["source_name"]


@pytest.mark.parametrize(("maszyna", "rodzaj_tb"), KOMORKI)
def test_slad_kroku_ib_nazywa_zalozenia(maszyna: str, rodzaj_tb: str) -> None:
    """Krok śladu „Ib" rdzenia: wejście ``zalozenia_zaniku`` i zdanie w komentarzu obliczeń —
    ta sama lista co pole wiersza; bez założeń krok bez wejścia i bez zdania."""
    _, _, wiersz, _ = _przebieg(maszyna, rodzaj_tb)
    krok = _krok_ib(wiersz)
    zdanie = zdanie_zalozen_zaniku_ib_pl(wiersz.get("zalozenia_zaniku") or [])
    if zdanie is None:
        assert "zalozenia_zaniku" not in krok["inputs"]
        assert POCZATEK_ZDANIA not in krok["notes"]
    else:
        assert krok["inputs"]["zalozenia_zaniku"] == wiersz["zalozenia_zaniku"]
        assert zdanie in krok["notes"]


@pytest.mark.parametrize(("maszyna", "rodzaj_tb"), KOMORKI)
def test_zakres_waznosci_werdyktu_wylaczania_nazywa_zalozenia(maszyna: str, rodzaj_tb: str) -> None:
    """Werdykt I_b ≤ I_cu pola stacji (tor końcówki HTTP: wiersze biegu → prądy pola →
    werdykt): zakres ważności zawiera zdanie o założeniach wtedy i tylko wtedy, gdy wyrocznia
    ma wpisy; kryteria dynamiczne i cieplne (I″k, i_p, I_th — nie zależą od μ/q) nigdy."""
    run, migawka, wiersz, _ = _przebieg(maszyna, rodzaj_tb)
    oceny = _oceny_pola(run, migawka)
    wylaczanie = oceny["wylaczanie"]
    assert wylaczanie["wynik"]["symbol_latex"] == "I_b"
    opis = wylaczanie["zakres_waznosci"]["opis_pl"]
    if ZALOZENIA_OCZEKIWANE[(maszyna, rodzaj_tb)]:
        zdanie = zdanie_zalozen_zaniku_ib_pl(wiersz["zalozenia_zaniku"])
        assert zdanie is not None and zdanie in opis
        for wpis in wiersz["zalozenia_zaniku"]:
            assert zdanie_zalozenia_krzywej_pl(wpis) in opis
    else:
        assert POCZATEK_ZDANIA not in opis
    for kryterium in ("dynamiczna", "cieplna"):
        assert POCZATEK_ZDANIA not in oceny[kryterium]["zakres_waznosci"]["opis_pl"]


def _wejscie_dowodu(wiersz: dict[str, Any], *, i_cu_not_applicable: bool) -> EquipmentProofInput:
    return EquipmentProofInput(
        project_id="p",
        case_id="c",
        run_id="r",
        connection_node_id=wiersz["fault_node_id"],
        device=DeviceRating(
            device_id="aparat",
            name_pl="Aparat pola",
            type_ref=None,
            u_m_kv=36.0,
            i_cu_ka=None if i_cu_not_applicable else 25.0,
            i_dyn_ka=63.0,
            i_th_ka=25.0,
            t_th_s=1.0,
            i_cu_not_applicable=i_cu_not_applicable,
        ),
        required_fault_results=wielkosci_kontraktu_klienta(wielkosci_do_odcisku(wiersz)),
        project_name="Projekt",
        case_name="Przypadek",
        zalozenia_zaniku=tuple(wiersz.get("zalozenia_zaniku") or ()),
    )


@pytest.mark.parametrize("i_cu_not_applicable", [False, True], ids=["wylacznik", "rozlacznik"])
@pytest.mark.parametrize(("maszyna", "rodzaj_tb"), KOMORKI)
def test_dowod_doboru_aparatury_nazywa_zalozenia(
    maszyna: str, rodzaj_tb: str, i_cu_not_applicable: bool
) -> None:
    """Dowód doboru aparatury: uwaga kryterium I_cu i ostrzeżenie dowodu niosą to samo zdanie;
    aparat bez zdolności wyłączania (NIE_DOTYCZY) nie dostaje ostrzeżenia — I_b nie wchodzi
    do żadnego porównania."""
    _, _, wiersz, _ = _przebieg(maszyna, rodzaj_tb)
    paczka = EquipmentProofGenerator.generate(
        _wejscie_dowodu(wiersz, i_cu_not_applicable=i_cu_not_applicable)
    )
    (icu,) = (c for c in paczka.result.checks if c.name == "Icu")
    ostrzezenia = paczka.proof_document.summary.warnings
    zdanie = zdanie_zalozen_zaniku_ib_pl(wiersz.get("zalozenia_zaniku") or [])
    if zdanie is None:
        assert not any(POCZATEK_ZDANIA in n for n in icu.notes)
        assert not any(POCZATEK_ZDANIA in w for w in ostrzezenia)
        return
    assert zdanie in icu.notes
    if i_cu_not_applicable:
        assert icu.status == "NIE_DOTYCZY"
        assert zdanie not in ostrzezenia
    else:
        assert zdanie in ostrzezenia


@pytest.mark.parametrize(("maszyna", "rodzaj_tb"), KOMORKI)
def test_dowod_sc3f_i_raport_nazywaja_zalozenia(maszyna: str, rodzaj_tb: str) -> None:
    """Pakiet SC3F (ten sam rachunek z migawki) — ostrzeżenie dowodu; raport PDF/DOCX — linia
    bilansu na każdy wpis. Predykat parami: wpisy wiersza = wpisy wyznaczone z rozbicia maszyn
    tej samej migawki (`compute_machine_contributions` → `zalozenia_krzywych_wkladow`), a wpis
    istnieje dokładnie dla śladu μ/q o podstawie ZALOZENIE_INZYNIERSKIE."""
    run, migawka, wiersz, wezel = _przebieg(maszyna, rodzaj_tb)
    pakiet = SC3FProofPack.generate(
        SC3FPackInput(
            project_name="Projekt",
            case_name="Przypadek",
            snapshot=migawka,
            fault_node_id=wezel,
            run_timestamp=datetime(2026, 1, 1),
            solver_version="test",
            scenariusz="MAX",
            nadpisanie_c=None,
            tk_s=1.0,
            tb_s=CZASY[rodzaj_tb],
        )
    )
    rozbicie = compute_machine_contributions(
        map_enm_to_network_graph(EnergyNetworkModel.model_validate(migawka)),
        wezel,
        c_factor=wiersz["c_factor"],
        t_min_s=CZASY[rodzaj_tb],
    )
    z_rozbicia = zalozenia_krzywych_wkladow(rozbicie.contributions)
    assert z_rozbicia == (wiersz.get("zalozenia_zaniku") or [])
    for wklad in rozbicie.contributions:
        for slad in (wklad.slad_mu, wklad.slad_q):
            if slad is None:
                continue
            w_wierszu = any(
                w["source_id"] == wklad.source_id
                and w["wielkosc"] == slad.wielkosc
                and w["regula"] == slad.regula
                for w in z_rozbicia
            )
            assert w_wierszu is (slad.podstawa.rodzaj_zrodla == "ZALOZENIE_INZYNIERSKIE")

    ostrzezenia = pakiet.proof_sc3f.summary.warnings
    (wiersz_raportu,) = (
        r for r in build_short_circuit_results(run)["rows"] if r["target_id"] == wezel
    )
    bilans = _sc_row_bilans_linie(wiersz_raportu)
    zdanie = zdanie_zalozen_zaniku_ib_pl(wiersz.get("zalozenia_zaniku") or [])
    if zdanie is None:
        assert not any(POCZATEK_ZDANIA in w for w in ostrzezenia)
        assert not any(linia.startswith("Założenie krzywej zaniku") for linia in bilans)
        assert "zalozenia_zaniku" not in wiersz_raportu
        return
    assert zdanie in ostrzezenia
    linie = [linia for linia in bilans if linia.startswith("Założenie krzywej zaniku Ib: ")]
    assert linie == [
        f"Założenie krzywej zaniku Ib: {zdanie_zalozenia_krzywej_pl(w)}"
        for w in wiersz["zalozenia_zaniku"]
    ]


@pytest.mark.parametrize(("maszyna", "rodzaj_tb"), KOMORKI)
def test_result_set_i_wiersz_raportu_niosa_te_same_wpisy(maszyna: str, rodzaj_tb: str) -> None:
    """Oba odczyty wiersza biegu (ResultSet ekranu wyników i wiersze raportu/konsumentów)
    niosą wpisy rdzenia 1:1 albo oba nie niosą klucza — dwa tory, jedno źródło."""
    run, _, wiersz, wezel = _przebieg(maszyna, rodzaj_tb)
    (element,) = (
        e for e in build_execution_result_set(run)["element_results"] if e["solver_ref"] == wezel
    )
    (wiersz_raportu,) = (
        r for r in build_short_circuit_results(run)["rows"] if r["target_id"] == wezel
    )
    for odczyt in (element["values"], wiersz_raportu):
        if "zalozenia_zaniku" in wiersz:
            assert odczyt["zalozenia_zaniku"] == wiersz["zalozenia_zaniku"]
        else:
            assert "zalozenia_zaniku" not in odczyt


@pytest.mark.parametrize("maszyna", MASZYNY)
def test_zwarcie_jednofazowe_bez_pola_zalozen(maszyna: str) -> None:
    """Zwarcie niesymetryczne: I_b = I″k (bez zaniku μ/q) — pole nieobecne przy każdym t_b."""
    migawka, wezel = _migawka_ze_stacja(maszyna)
    run = _bieg(migawka, CZASY["interpolacja"], rodzaj="SC_1F")
    wiersz = next(r for r in run.raw_result["results"] if r["fault_node_id"] == wezel)
    assert "zalozenia_zaniku" not in wiersz
    assert wiersz["ib_a"] == wiersz["ikss_a"]


@pytest.mark.parametrize("rodzaj_tb", list(CZASY))
def test_siec_bez_maszyn_bez_pola_zalozen(rodzaj_tb: str) -> None:
    migawka, _ = _migawka("odlegla")
    run = _bieg(migawka, CZASY[rodzaj_tb])
    assert all("zalozenia_zaniku" not in w for w in run.raw_result["results"])


def test_determinizm_dwa_biegi_ta_sama_lista_zalozen() -> None:
    migawka, wezel = _migawka_ze_stacja("asynchroniczna")
    wiersze = [
        next(
            r
            for r in _bieg(migawka, CZASY["ponizej"]).raw_result["results"]
            if r["fault_node_id"] == wezel
        )
        for _ in range(2)
    ]
    assert json.dumps(wiersze[0]["zalozenia_zaniku"], sort_keys=True) == json.dumps(
        wiersze[1]["zalozenia_zaniku"], sort_keys=True
    )


@pytest.mark.parametrize("rodzaj_tb", ["wezel", "interpolacja"])
def test_dowod_doboru_przez_http_z_zapisanego_biegu(rodzaj_tb: str) -> None:
    """Ścieżka użytkownika: zapisany bieg → `POST /api/equipment-proof/pack` → dowód w paczce
    ZIP niesie ostrzeżenie o założeniu wyłącznie dla t_b między krzywymi q."""
    reset_canonical_runs()
    migawka, wezel = _migawka_ze_stacja("asynchroniczna")
    run = _bieg(migawka, CZASY[rodzaj_tb])
    with canonical_run_repository_scope() as repozytorium:
        repozytorium.save(run)
    wiersz = next(r for r in run.raw_result["results"] if r["fault_node_id"] == wezel)
    with TestClient(app) as klient:
        odpowiedz = klient.post(
            "/api/equipment-proof/pack",
            json={
                "project_id": "projekt-zaniku",
                "case_id": "przypadek-zaniku",
                "run_id": str(run.id),
                "connection_node_id": wezel,
                "device": {
                    "device_id": "wyl-01",
                    "name_pl": "Wyłącznik pola",
                    "u_m_kv": 36.0,
                    "i_cu_ka": 25.0,
                    "i_dyn_ka": 63.0,
                    "i_th_ka": 25.0,
                    "t_th_s": 1.0,
                },
            },
        )
    assert odpowiedz.status_code == 200, odpowiedz.text
    with zipfile.ZipFile(io.BytesIO(odpowiedz.content)) as archiwum:
        dowod = json.loads(archiwum.read("proof_pack/proof.json").decode("utf-8"))
    ostrzezenia = dowod["summary"]["warnings"]
    if rodzaj_tb == "interpolacja":
        zdanie = zdanie_zalozen_zaniku_ib_pl(wiersz["zalozenia_zaniku"])
        assert zdanie in ostrzezenia
    else:
        assert "zalozenia_zaniku" not in wiersz
        assert not any(POCZATEK_ZDANIA in w for w in ostrzezenia)
