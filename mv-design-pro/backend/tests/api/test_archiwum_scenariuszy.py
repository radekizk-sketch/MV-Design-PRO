"""Magazyn scenariuszy w archiwum projektu i wyszukiwanie scenariusza w obrębie projektu
(karta EDYTOR-DELT-SCENARIUSZA-ZABEZPIECZEN).

Ścieżka użytkownika: projektant ma w przypadku A wybór zabezpieczeń (grupa nastaw 2) i scenariusz
zwarciowy, liczy bieg, eksportuje projekt do pliku ZIP i importuje go z powrotem do TEJ SAMEJ
instancji. Zaimportowany projekt ma te same scenariusze (identyfikatory scenariuszy bez zmian)
z przypadkiem przemapowanym na nowy, bieg ze scenariusza przechodzi w obu projektach, a każdy
projekt czyta WŁASNY scenariusz — identyfikator scenariusza jest unikalny tylko w projekcie.

Iloczyn cech: rodzaj scenariusza {wybór zabezpieczeń przypadku, scenariusz zwarciowy, wybór
zdjęty nagrobkiem} × projekt {źródłowy, zaimportowany} × operacja {odczyt, bieg ze scenariusza,
bieg przypadku z wyborem, świeżość po imporcie} × droga archiwum {pełne, paczka zmian,
porównanie archiwów} × projekt bez scenariuszy {treść i `archive_hash` bez sekcji} × archiwum
naruszone {treść sekcji zmieniona, sekcja bez odcisku, rejestr wadliwy}.
"""

from __future__ import annotations

import io
import json
import zipfile
from typing import Any
from uuid import UUID

import pytest
from application.project_archive.service import ProjectArchiveService
from domain.archive_diff import compare_archives
from domain.incremental_archive import SectionChangeStatus
from domain.project_archive import (
    NAZWY_SEKCJI_ARCHIWUM_PL,
    ArchiveImportStatus,
    compute_hash,
)
from enm.scenariusze import id_scenariusza_przypadku, stan_scenariusza
from fastapi.testclient import TestClient

from tests.api import test_przypadek_zabezpieczen_scenariusz_api as _scen
from tests.api.test_przypadek_zabezpieczen_scenariusz_api import (
    _model,
    stacja_z_grupa_2,  # noqa: F401 — fikstura
)
from tests.api.test_wybor_zabezpieczen_przypadku_api import (
    _bieg_sc,
    _czas_pola,
    _klucz,
    _status,
    _zapisz_wybor,
)
from tests.utils.biegi import wykonaj_bieg

#: Fikstura klienta API ze wspólnym magazynem i bazą sesji testu wytrzymałości aparatury.
klient = _scen.klient

_SCEN = "/api/execution/study-cases/{case_id}/fault-scenarios"
_WYBOR = "/api/scenariusze-laczeniowe/study-cases/{case_id}/zabezpieczenia-przypadku"


@pytest.fixture(autouse=True)
def _jedna_baza_projektow_i_biegow(db_engine: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    """Rejestr biegów w TEJ SAMEJ bazie co projekty — jak w torze produkcyjnym (jeden
    `DATABASE_URL`). Fikstura klienta daje projektom bazę testu, a rejestr biegów czyta
    `DATABASE_URL`; bez zrównania eksport projektu nie widziałby biegów przypadku."""
    monkeypatch.setenv("DATABASE_URL", str(db_engine.url))


def _projekt(klient: TestClient, case_id: str) -> str:
    return str(klient.get(f"/api/study-cases/{case_id}").json()["project_id"])


def _project_json(archiwum: bytes) -> dict[str, Any]:
    with zipfile.ZipFile(io.BytesIO(archiwum), "r") as zf:
        return json.loads(zf.read("project.json").decode("utf-8"))


def _archiwum_z_project_json(dane: dict[str, Any], wzor: bytes) -> bytes:
    """ZIP z podmienionym `project.json` (pozostałe wpisy jak we wzorze)."""
    wyjscie = io.BytesIO()
    with (
        zipfile.ZipFile(io.BytesIO(wzor), "r") as zrodlo,
        zipfile.ZipFile(wyjscie, "w", zipfile.ZIP_DEFLATED) as cel,
    ):
        for nazwa in zrodlo.namelist():
            tresc = zrodlo.read(nazwa)
            if nazwa == "project.json":
                tresc = json.dumps(dane, ensure_ascii=False, sort_keys=True).encode("utf-8")
            cel.writestr(nazwa, tresc)
    return wyjscie.getvalue()


def _eksport(klient: TestClient, project_id: str) -> bytes:
    odp = klient.post(f"/api/projects/{project_id}/export")
    assert odp.status_code == 200, odp.text
    return odp.content


def _import(klient: TestClient, archiwum: bytes) -> Any:
    return klient.post(
        "/api/projects/import",
        files={"file": ("projekt.mvdp.zip", archiwum, "application/zip")},
        data={"new_name": "Projekt zaimportowany"},
    )


def _jedyny_przypadek(klient: TestClient, project_id: str) -> str:
    (przypadek,) = _project_json(_eksport(klient, project_id))["cases"]["study_cases"]
    return str(przypadek["id"])


def _szyna(klient: TestClient, case_id: str) -> str:
    return str(_model(klient, case_id)["buses"][0]["ref_id"])


def _utworz_scenariusz_zwarciowy(klient: TestClient, case_id: str, szyna: str) -> str:
    odp = klient.post(
        _SCEN.format(case_id=case_id),
        json={
            "name": "Zwarcie na szynie stacji",
            "fault_type": "SC_3F",
            "location": {"element_ref": szyna, "location_type": "BUS", "position": None},
            "config": {"scenariusz": "MAX"},
        },
    )
    assert odp.status_code == 201, odp.text
    return str(odp.json()["scenario_id"])


def _bieg_ze_scenariusza_zwarciowego(klient: TestClient, case_id: str, sid: str) -> None:
    odp = klient.post(f"{_SCEN.format(case_id=case_id)}/{sid}/runs", json={})
    assert odp.status_code == 201, odp.text
    assert odp.json()["study_case_id"] == case_id
    koniec = wykonaj_bieg(klient, odp.json()["id"])
    assert koniec.json()["status"] == "DONE", koniec.json()


@pytest.fixture()
def projekt_ze_scenariuszami(
    klient: TestClient,
    stacja_z_grupa_2: dict[str, Any],  # noqa: F811
) -> dict[str, Any]:
    """Przypadek A z wyborem grupy 2, scenariuszem zwarciowym i biegiem przypadku."""
    s = stacja_z_grupa_2
    case_a = s["case_id"]
    odp = _zapisz_wybor(klient, case_a, protection_groups={s["ref"]: 2})
    assert odp.status_code == 200, odp.text
    sid = _utworz_scenariusz_zwarciowy(klient, case_a, _szyna(klient, case_a))
    _bieg_sc(klient, case_a)
    return {**s, "sid": sid, "project_id": _projekt(klient, case_a)}


def test_round_trip_archiwum_odtwarza_scenariusze_i_wybory_w_nowym_projekcie(
    klient: TestClient, projekt_ze_scenariuszami: dict[str, Any]
) -> None:
    p = projekt_ze_scenariuszami
    case_a, sid = p["case_id"], p["sid"]
    archiwum = _eksport(klient, p["project_id"])
    dane = _project_json(archiwum)
    rejestry = {r["scenario_id"]: r for r in dane["scenariusze"]["rejestry"]}
    assert set(rejestry) == {id_scenariusza_przypadku(case_a), sid}
    assert all("klucz" not in r for r in rejestry.values())
    assert dane["fingerprints"]["scenariusze_hash"] == compute_hash(dane["scenariusze"])
    biegi = [b for b in dane["runs"]["canonical_runs"] if b["status"] == "FINISHED"]
    assert biegi, dane["runs"]

    odp = _import(klient, archiwum)
    assert odp.status_code == 200, odp.text
    assert odp.json()["status"] in {"SUCCESS", "CATALOG_MAPPING_REQUIRED"}, odp.json()
    projekt_b = str(odp.json()["project_id"])
    case_a2 = _jedyny_przypadek(klient, projekt_b)
    assert case_a2 != case_a

    # Rejestry po imporcie = rejestry źródła z przypadkiem przemapowanym (wszystkie rewizje).
    dane_b = _project_json(_eksport(klient, projekt_b))
    rejestry_b = {r["scenario_id"]: r for r in dane_b["scenariusze"]["rejestry"]}
    assert set(rejestry_b) == {id_scenariusza_przypadku(case_a2), sid}
    oczekiwane = json.loads(json.dumps(dane["scenariusze"]["rejestry"]).replace(case_a, case_a2))
    assert dane_b["scenariusze"]["rejestry"] == sorted(oczekiwane, key=lambda r: r["scenario_id"])

    # Wybór przypadku: ta sama treść i rewizja w przypadku zaimportowanym.
    wybor_a = klient.get(_WYBOR.format(case_id=case_a)).json()
    wybor_a2 = klient.get(_WYBOR.format(case_id=case_a2)).json()
    assert wybor_a2["protection_groups"] == wybor_a["protection_groups"] == {p["ref"]: 2}
    assert wybor_a2["revision"] == wybor_a["revision"]
    assert wybor_a2["scenario_id"] == id_scenariusza_przypadku(case_a2)

    # Bieg zaimportowany jest świeży: rewizja wyboru w opcjach biegu = rewizja w magazynie.
    assert _status(klient, case_a2) == ("FRESH", "model-niezmieniony")

    # Ten sam `scenario_id` w dwóch projektach: każdy przypadek czyta własny scenariusz.
    for przypadek in (case_a, case_a2):
        odczyt = klient.get(f"{_SCEN.format(case_id=przypadek)}/{sid}")
        assert odczyt.status_code == 200, odczyt.text
        assert odczyt.json()["study_case_id"] == przypadek
        _bieg_ze_scenariusza_zwarciowego(klient, przypadek, sid)

    # Bieg przypadku zaimportowanego nakłada wybór (grupa 2 → człon 0,5 s).
    sc_a2 = _bieg_sc(klient, case_a2)
    czas = _czas_pola(klient, case_a2, p["station_ref"], sc_a2, p["bay_ref"])
    assert czas["czlon_nastawczy_s"] == pytest.approx(0.5)


def test_scenariusz_innego_projektu_i_innego_przypadku_to_brak(
    klient: TestClient, projekt_ze_scenariuszami: dict[str, Any]
) -> None:
    """Trasa przypadku nie sięga do scenariusza innego projektu ani innego przypadku."""
    p = projekt_ze_scenariuszami
    sid = p["sid"]
    inny_projekt = klient.post("/api/projects", json={"name": "Projekt obcy"}).json()["id"]
    obcy = klient.post("/api/study-cases", json={"project_id": inny_projekt, "name": "Obcy"})
    assert obcy.status_code == 201, obcy.text
    case_obcy = str(obcy.json()["id"])
    ten_sam_projekt = klient.post(
        "/api/study-cases", json={"project_id": p["project_id"], "name": "Przypadek B"}
    )
    case_b = str(ten_sam_projekt.json()["id"])
    for przypadek in (case_obcy, case_b):
        sciezka = f"{_SCEN.format(case_id=przypadek)}/{sid}"
        assert klient.get(sciezka).status_code == 404
        assert klient.get(f"{sciezka}/eligibility").status_code == 404
        assert klient.get(f"{sciezka}/sld-overlay").status_code == 404
        assert klient.post(f"{sciezka}/runs", json={}).status_code == 404
        assert klient.put(sciezka, json={"name": "Obca zmiana"}).status_code == 404
        assert klient.delete(sciezka).status_code == 404
    # Scenariusz właściciela nietknięty.
    assert klient.get(f"{_SCEN.format(case_id=p['case_id'])}/{sid}").json()["revision"] == 1


def test_wybor_zdjety_nagrobkiem_przechodzi_przez_archiwum_jako_zdjety(
    klient: TestClient, projekt_ze_scenariuszami: dict[str, Any]
) -> None:
    p = projekt_ze_scenariuszami
    assert _zapisz_wybor(klient, p["case_id"]).status_code == 200  # pusty stan = nagrobek
    odp = _import(klient, _eksport(klient, p["project_id"]))
    assert odp.status_code == 200, odp.text
    case_a2 = _jedyny_przypadek(klient, str(odp.json()["project_id"]))
    stan = stan_scenariusza(_klucz(klient, case_a2), id_scenariusza_przypadku(case_a2))
    assert stan is not None and stan.usuniety and stan.rewizja == 2
    assert klient.get(_WYBOR.format(case_id=case_a2)).json()["scenario_id"] is None


def test_projekt_bez_scenariuszy_nie_niesie_sekcji_a_archive_hash_bez_zmian(
    klient: TestClient,
) -> None:
    projekt = klient.post("/api/projects", json={"name": "Bez scenariuszy"}).json()["id"]
    assert klient.post("/api/study-cases", json={"project_id": projekt, "name": "P"}).is_success
    dane = _project_json(_eksport(klient, str(projekt)))
    assert "scenariusze" not in dane
    assert "scenariusze_hash" not in dane["fingerprints"]
    fp = dane["fingerprints"]
    # `archive_hash` = hash odcisków siedmiu sekcji formatu sprzed sekcji scenariuszy.
    assert fp["archive_hash"] == compute_hash(
        {
            "project_meta": fp["project_meta_hash"],
            "cases": fp["cases_hash"],
            "runs": fp["runs_hash"],
            "results": fp["results_hash"],
            "interpretations": fp["interpretations_hash"],
            "issues": fp["issues_hash"],
            "enm": fp["enm_hash"],
        }
    )


@pytest.mark.parametrize(
    "naruszenie", ["tresc_zmieniona", "sekcja_bez_odcisku", "rejestr_bez_rewizji"]
)
def test_naruszona_sekcja_scenariuszy_odmawia_importu(
    klient: TestClient, projekt_ze_scenariuszami: dict[str, Any], naruszenie: str
) -> None:
    p = projekt_ze_scenariuszami
    archiwum = _eksport(klient, p["project_id"])
    dane = _project_json(archiwum)
    if naruszenie == "tresc_zmieniona":
        dane["scenariusze"]["rejestry"][0]["rewizje"][0]["revision"] = 7
    elif naruszenie == "sekcja_bez_odcisku":
        del dane["fingerprints"]["scenariusze_hash"]
    else:
        dane["scenariusze"]["rejestry"][0]["rewizje"] = []
        sekcja = compute_hash(dane["scenariusze"])
        dane["fingerprints"]["scenariusze_hash"] = sekcja
        fp = dane["fingerprints"]
        dane["fingerprints"]["archive_hash"] = compute_hash(
            {
                "project_meta": fp["project_meta_hash"],
                "cases": fp["cases_hash"],
                "runs": fp["runs_hash"],
                "results": fp["results_hash"],
                "interpretations": fp["interpretations_hash"],
                "issues": fp["issues_hash"],
                "enm": fp["enm_hash"],
                "scenariusze": sekcja,
            }
        )
    projekty_przed = klient.get("/api/projects").json()["total"]
    odp = _import(klient, _archiwum_z_project_json(dane, archiwum))
    tresc = json.dumps(odp.json(), ensure_ascii=False)
    assert odp.status_code in {200, 400, 422}, odp.text
    assert "FAILED" in tresc or odp.status_code != 200, tresc
    # Odmowa wskazuje sekcję scenariuszy: błąd integralności (treść albo odcisk) nazywa sekcję
    # nazwą polską z jednego słownika (`NAZWY_SEKCJI_ARCHIWUM_PL`), błąd struktury rejestru —
    # ścieżką pola w archiwum (`ArchiveStructureError.sciezka`, ta sama w komunikacie).
    if naruszenie == "rejestr_bez_rewizji":
        assert "scenariusze.rejestry[0].rewizje" in tresc, tresc
    else:
        assert NAZWY_SEKCJI_ARCHIWUM_PL["scenariusze"] in tresc, tresc
    assert klient.get("/api/projects").json()["total"] == projekty_przed


def test_paczka_zmian_i_porownanie_archiwow_niosa_sekcje_scenariuszy(
    klient: TestClient,
    stacja_z_grupa_2: dict[str, Any],  # noqa: F811
) -> None:
    s = stacja_z_grupa_2
    case_a = s["case_id"]
    projekt = _projekt(klient, case_a)
    baza = _eksport(klient, projekt)
    assert "scenariusze" not in _project_json(baza)
    assert _zapisz_wybor(klient, case_a, protection_groups={s["ref"]: 2}).status_code == 200

    with klient.app.state.uow_factory() as uow:
        serwis = ProjectArchiveService(uow.session)
        eksport = serwis.export_incremental(_uuid(projekt), baza)
        (delta,) = (d for d in eksport.paczka.deltas if d.section_name == "scenariusze")
        assert delta.status == SectionChangeStatus.ADDED
        import_paczki = serwis.import_incremental(baza, eksport.bajty, "Z paczki zmian")
        assert import_paczki.wynik.status != ArchiveImportStatus.FAILED, import_paczki.wynik
        nowy_projekt = str(import_paczki.wynik.project_id)
        uow.commit()

        archiwum_a = serwis.build_archive(_uuid(projekt))
        bez_zmian = compare_archives(archiwum_a, archiwum_a)
        assert bez_zmian.overall_status.value == "IDENTICAL"
        roznica = compare_archives(ProjectArchiveService.load_archive(baza), archiwum_a)
        (sekcja,) = (d for d in roznica.section_diffs if d.section_name == "scenariusze")
        assert sekcja.status.value == "MODIFIED"
        assert sekcja.elements_added == 1
        assert sekcja.section_label_pl == "Scenariusze i zabezpieczenia przypadków"

    case_nowy = _jedyny_przypadek(klient, nowy_projekt)
    wybor = klient.get(_WYBOR.format(case_id=case_nowy)).json()
    assert wybor["protection_groups"] == {s["ref"]: 2}


def test_porownanie_projektow_bez_scenariuszy_nie_liczy_sekcji_scenariuszy(
    klient: TestClient,
) -> None:
    projekty = [
        str(klient.post("/api/projects", json={"name": f"Porównanie {i}"}).json()["id"])
        for i in range(2)
    ]
    odp = klient.post(f"/api/archives/diff/projects/{projekty[0]}/{projekty[1]}")
    assert odp.status_code == 200, odp.text
    nazwy = {s["section_name"] for s in odp.json()["section_diffs"]}
    assert "scenariusze" not in nazwy
    assert odp.json()["summary"]["sections_total"] == 7


def _uuid(tekst: str) -> UUID:
    return UUID(tekst)
