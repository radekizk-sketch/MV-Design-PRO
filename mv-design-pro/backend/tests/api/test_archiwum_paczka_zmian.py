"""Paczka zmian archiwum projektu (eksport/import przyrostowy) — serwis i trasy API.

DEFEKT, KTÓRY TEN PLIK PRZYPINA (karta ARCHIWUM PROJEKTU, 2026-09-24). Router
`incremental_archive` był odstawiony, a jego import był pozorny: paczka zmian
nakładana na archiwum w pamięci procesu NIE trafiała do żadnego projektu
(„Nałożono N sekcji" bez skutku), baza importu nie mogła zgodzić się z paczką
(projekt odtworzony z archiwum ma nowe identyfikatory, ten sam projekt po drugim
eksporcie ma w pamięci już nowy stan), a odczyt archiwum projektu szedł DRUGIM
dekoderem ZIP (pierwszy `*.json`, z pominięciem `load_archive`). Teraz baza to
plik archiwum, import zapisuje nowy projekt drogą importu pełnego, a oba pliki
czyta jeden dekoder z nazwanymi błędami.

ILOCZYN CECH (reguła KLASA, NIE INSTANCJA):
* operacja {eksport paczki, import paczki} × plik {archiwum bazowe, paczka} ×
  stan pliku {poprawny, brak klucza głównego, brak klucza zagnieżdżonego, zły typ
  pola zagnieżdżonego, uszkodzony ZIP, niezgodna wersja} × warstwa {serwis, trasa
  API} — poprawny daje wynik, każde uszkodzenie nazwany błąd (serwis) i 422 z
  komunikatem nazywającym PLIK i ścieżkę pola (trasa);
* paczka policzona względem innej bazy → 409 (trasa) / `BaseHashMismatchError`;
* dane sekcji paczki niezgodne ze schematem albo z odciskami paczki → błąd PACZKI
  (nie archiwum bazowego) i ZERO skutku w bazie (liczba projektów bez zmian);
* projekt nieistniejący przy eksporcie → 404, nie 422.
"""

from __future__ import annotations

import io
import json
import zipfile
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

import pytest

pytest.importorskip("fastapi")

from application.project_archive.service import ProjectArchiveService  # noqa: E402
from domain.incremental_archive import (  # noqa: E402
    BaseHashMismatchError,
    IncrementalArchiveError,
    IncrementalStructureError,
    IncrementalVersionError,
)
from domain.project_archive import (  # noqa: E402
    ArchiveError,
    ArchiveProjectNotFoundError,
    ArchiveStructureError,
    ArchiveVersionError,
)
from enm.klucz_twin import klucz_twin_projektu  # noqa: E402
from enm.models import Bus  # noqa: E402
from enm.store import get_enm, reset_enm_store, set_enm  # noqa: E402
from infrastructure.persistence.models import ProjectORM, StudyCaseORM  # noqa: E402


@pytest.fixture(autouse=True)
def _enm_store_tmp(tmp_path, monkeypatch):
    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path / "enm_store"))
    reset_enm_store(remove_persisted=False)
    yield
    reset_enm_store(remove_persisted=False)


# ============================================================================
# POMOCNICZE
# ============================================================================


def _utworz_projekt(uow_factory, nazwa: str, szyny: list[Bus]) -> UUID:
    project_id = uuid4()
    teraz = datetime(2026, 9, 24, 12, 0, tzinfo=UTC)
    with uow_factory() as uow:
        uow.session.add(
            ProjectORM(
                id=project_id,
                name=nazwa,
                description=None,
                schema_version="1.0.0",
                connection_node_id=None,
                sources_jsonb=[],
                created_at=teraz,
                updated_at=teraz,
            )
        )
        uow.session.add(
            StudyCaseORM(
                id=uuid4(),
                project_id=project_id,
                name="Przypadek bazowy",
                description=None,
                study_jsonb={"c_factor_max": 1.1, "c_factor_min": 0.95},
                is_active=True,
                result_status="NONE",
                result_refs_jsonb=[],
                revision=1,
                created_at=teraz,
                updated_at=teraz,
            )
        )
    _ustaw_szyny(project_id, szyny)
    return project_id


def _ustaw_szyny(project_id: UUID, szyny: list[Bus]) -> None:
    klucz = klucz_twin_projektu(project_id)
    model = get_enm(klucz).model_copy(deep=True)
    model.buses = [szyna.model_copy(deep=True) for szyna in szyny]
    set_enm(klucz, model)


def _eksport(uow_factory, project_id: UUID) -> bytes:
    with uow_factory() as uow:
        return ProjectArchiveService(uow.session).export_project(project_id)


def _zip(pliki: dict[str, bytes]) -> bytes:
    bufor = io.BytesIO()
    with zipfile.ZipFile(bufor, "w", zipfile.ZIP_DEFLATED) as zf:
        for nazwa, tresc in pliki.items():
            zf.writestr(nazwa, tresc)
    return bufor.getvalue()


def _json_wpisu(archive_bytes: bytes, wpis: str) -> dict[str, Any]:
    with zipfile.ZipFile(io.BytesIO(archive_bytes), "r") as zf:
        return json.loads(zf.read(wpis).decode("utf-8"))


def _podmien_wpis(archive_bytes: bytes, wpis: str, dane: dict[str, Any]) -> bytes:
    with zipfile.ZipFile(io.BytesIO(archive_bytes), "r") as zf:
        pozostale = {n: zf.read(n) for n in zf.namelist() if n != wpis}
    return _zip({wpis: json.dumps(dane).encode("utf-8"), **pozostale})


def _liczba_projektow(uow_factory) -> int:
    with uow_factory() as uow:
        return uow.session.query(ProjectORM).count()


SZYNA_SN = Bus(ref_id="SN-1", name="Szyna SN GPZ", voltage_kv=15.0)
SZYNA_NN = Bus(ref_id="NN-2", name="Szyna nN stacji", voltage_kv=0.4)


@pytest.fixture()
def seria(uow_factory) -> dict[str, Any]:
    """Projekt → archiwum bazowe → zmiana sieci → paczka zmian (przez serwis)."""
    projekt = _utworz_projekt(uow_factory, "Sieć Wschód", [SZYNA_SN])
    baza = _eksport(uow_factory, projekt)
    _ustaw_szyny(projekt, [SZYNA_SN, SZYNA_NN])
    with uow_factory() as uow:
        eksport = ProjectArchiveService(uow.session).export_incremental(projekt, baza)
    return {"projekt": projekt, "baza": baza, "paczka": eksport.bajty, "eksport": eksport}


# ============================================================================
# USZKODZENIA — archiwum bazowe i paczka zmian
# ============================================================================


def _uszkodzone_bazy(poprawna: bytes) -> dict[str, tuple[bytes, type[ArchiveError], str]]:
    dane = _json_wpisu(poprawna, "project.json")
    return {
        "brak_klucza_glownego": (
            _podmien_wpis(poprawna, "project.json", {k: v for k, v in dane.items() if k != "runs"}),
            ArchiveStructureError,
            "Brak wymaganej sekcji: runs",
        ),
        "brak_klucza_zagniezdzonego": (
            _podmien_wpis(
                poprawna,
                "project.json",
                {
                    **dane,
                    "project_meta": {
                        k: v for k, v in dane["project_meta"].items() if k != "updated_at"
                    },
                },
            ),
            ArchiveStructureError,
            "Brak wymaganego pola: project_meta.updated_at",
        ),
        "zly_typ_pola_zagniezdzonego": (
            _podmien_wpis(
                poprawna,
                "project.json",
                {**dane, "fingerprints": {**dane["fingerprints"], "runs_hash": 7}},
            ),
            ArchiveStructureError,
            "Pole fingerprints.runs_hash nie jest tekstem",
        ),
        "uszkodzony_zip": (b"PK\x03\x04 urwany plik", ArchiveError, "archiwum ZIP"),
        "niezgodna_wersja": (
            _podmien_wpis(poprawna, "project.json", {**dane, "schema_version": "4.0.0"}),
            ArchiveVersionError,
            "Nieobsługiwana wersja schematu archiwum",
        ),
    }


def _uszkodzone_paczki(poprawna: bytes) -> dict[str, tuple[bytes, type[ArchiveError], str]]:
    dane = _json_wpisu(poprawna, "incremental.json")
    delta_0 = {k: v for k, v in dane["deltas"][0].items() if k != "status"}
    return {
        "brak_klucza_glownego": (
            _podmien_wpis(
                poprawna, "incremental.json", {k: v for k, v in dane.items() if k != "deltas"}
            ),
            IncrementalStructureError,
            "Brak wymaganego pola: deltas",
        ),
        "brak_klucza_zagniezdzonego": (
            _podmien_wpis(
                poprawna, "incremental.json", {**dane, "deltas": [delta_0, *dane["deltas"][1:]]}
            ),
            IncrementalStructureError,
            "Brak wymaganego pola: deltas[0].status",
        ),
        "zly_typ_pola_zagniezdzonego": (
            _podmien_wpis(
                poprawna,
                "incremental.json",
                {
                    **dane,
                    "fingerprints": {
                        k: v for k, v in dane["fingerprints"].items() if k != "archive_hash"
                    },
                },
            ),
            IncrementalStructureError,
            "Brak wymaganego pola: fingerprints.archive_hash",
        ),
        "uszkodzony_zip": (b"to nie jest ZIP", IncrementalStructureError, "archiwum ZIP"),
        "niezgodna_wersja": (
            _podmien_wpis(poprawna, "incremental.json", {**dane, "schema_version": "2.0.0"}),
            IncrementalVersionError,
            "Nieobsługiwana wersja schematu przyrostowego",
        ),
    }


RODZAJE = [
    "brak_klucza_glownego",
    "brak_klucza_zagniezdzonego",
    "zly_typ_pola_zagniezdzonego",
    "uszkodzony_zip",
    "niezgodna_wersja",
]


# ============================================================================
# SERWIS — archiwum poprawne
# ============================================================================


def test_serwis_eksport_i_import_paczki_tworza_projekt_ze_zmiana(seria, uow_factory):
    eksport = seria["eksport"]
    assert eksport.wynik.sections_changed >= 1
    zmienione = {d.section_name for d in eksport.paczka.deltas if d.status != "UNCHANGED"}
    assert "enm" in zmienione

    przed = _liczba_projektow(uow_factory)
    with uow_factory() as uow:
        wynik = ProjectArchiveService(uow.session).import_incremental(
            seria["baza"], seria["paczka"], "Sieć Wschód — po zmianach"
        )

    assert wynik.sekcje_zastosowane == len(zmienione)
    assert wynik.wynik.project_id is not None
    assert _liczba_projektow(uow_factory) == przed + 1
    nowy = UUID(wynik.wynik.project_id)
    assert nowy != seria["projekt"]
    model = get_enm(klucz_twin_projektu(nowy))
    assert sorted(b.name for b in model.buses) == ["Szyna SN GPZ", "Szyna nN stacji"]
    with uow_factory() as uow:
        assert uow.session.get(ProjectORM, nowy).name == "Sieć Wschód — po zmianach"


def test_serwis_paczka_deterministyczna_dla_tej_samej_bazy(seria, uow_factory):
    """Ta sama baza i ten sam projekt → ta sama treść paczki (bez stanu w procesie)."""
    with uow_factory() as uow:
        druga = ProjectArchiveService(uow.session).export_incremental(
            seria["projekt"], seria["baza"]
        )
    assert _json_wpisu(druga.bajty, "incremental.json") == _json_wpisu(
        seria["paczka"], "incremental.json"
    )


# ============================================================================
# SERWIS — uszkodzenia (plik × rodzaj)
# ============================================================================


@pytest.mark.parametrize("rodzaj", RODZAJE)
def test_serwis_eksport_uszkodzona_baza(seria, uow_factory, rodzaj):
    bajty, typ, fragment = _uszkodzone_bazy(seria["baza"])[rodzaj]
    with uow_factory() as uow, pytest.raises(typ) as blad:
        ProjectArchiveService(uow.session).export_incremental(seria["projekt"], bajty)
    assert fragment in str(blad.value)
    if isinstance(blad.value, ArchiveStructureError):
        assert blad.value.sciezka and blad.value.sciezka in str(blad.value)


@pytest.mark.parametrize("plik", ["baza", "paczka"])
@pytest.mark.parametrize("rodzaj", RODZAJE)
def test_serwis_import_uszkodzony_plik_bez_skutku(seria, uow_factory, rodzaj, plik):
    if plik == "baza":
        bajty, typ, fragment = _uszkodzone_bazy(seria["baza"])[rodzaj]
        argumenty = (bajty, seria["paczka"])
    else:
        bajty, typ, fragment = _uszkodzone_paczki(seria["paczka"])[rodzaj]
        argumenty = (seria["baza"], bajty)
    przed = _liczba_projektow(uow_factory)

    with uow_factory() as uow, pytest.raises(typ) as blad:
        ProjectArchiveService(uow.session).import_incremental(*argumenty)

    assert fragment in str(blad.value)
    assert _liczba_projektow(uow_factory) == przed, "błąd importu zostawił projekt"
    if plik == "paczka":
        assert isinstance(blad.value, IncrementalArchiveError)
    else:
        assert not isinstance(blad.value, IncrementalArchiveError)


def test_serwis_eksport_nieistniejacy_projekt(seria, uow_factory):
    with uow_factory() as uow, pytest.raises(ArchiveProjectNotFoundError):
        ProjectArchiveService(uow.session).export_incremental(uuid4(), seria["baza"])


def test_serwis_import_paczki_innej_bazy(seria, uow_factory):
    inny = _utworz_projekt(uow_factory, "Inny projekt", [SZYNA_SN])
    with uow_factory() as uow, pytest.raises(BaseHashMismatchError):
        ProjectArchiveService(uow.session).import_incremental(
            _eksport(uow_factory, inny), seria["paczka"]
        )


def test_serwis_dane_sekcji_paczki_niezgodne_ze_schematem_to_blad_paczki(seria, uow_factory):
    """Paczka zmieniająca `project_meta` na obiekt bez nazwy: błąd PACZKI ze ścieżką
    pola, nie archiwum bazowego (ono przeszło walidację) — i zero skutku."""
    dane = _json_wpisu(seria["paczka"], "incremental.json")
    dane["deltas"] = [
        (
            {**d, "status": "MODIFIED", "data": {"id": "x"}}
            if d["section_name"] == "project_meta"
            else d
        )
        for d in dane["deltas"]
    ]
    przed = _liczba_projektow(uow_factory)
    with uow_factory() as uow, pytest.raises(IncrementalStructureError) as blad:
        ProjectArchiveService(uow.session).import_incremental(
            seria["baza"], _podmien_wpis(seria["paczka"], "incremental.json", dane)
        )
    assert "project_meta.name" in str(blad.value)
    assert blad.value.sciezka == "project_meta.name"
    assert _liczba_projektow(uow_factory) == przed


def test_serwis_dane_paczki_niezgodne_z_jej_odciskami_bez_skutku(seria, uow_factory):
    dane = _json_wpisu(seria["paczka"], "incremental.json")
    for d in dane["deltas"]:
        if d["section_name"] == "enm":
            d["data"]["models"][0]["snapshot"]["buses"][0]["name"] = "Podmieniona"
    przed = _liczba_projektow(uow_factory)
    with uow_factory() as uow, pytest.raises(IncrementalArchiveError, match="integralności"):
        ProjectArchiveService(uow.session).import_incremental(
            seria["baza"], _podmien_wpis(seria["paczka"], "incremental.json", dane)
        )
    assert _liczba_projektow(uow_factory) == przed


# ============================================================================
# TRASY API (aplikacja produkcyjna — montaż jest częścią sprawdzenia)
# ============================================================================


def _eksport_api(app_client, projekt: UUID, baza: bytes, nazwa: str = "baza.mvdp.zip"):
    return app_client.post(
        f"/api/projects/{projekt}/export/incremental",
        files={"base_file": (nazwa, baza, "application/zip")},
    )


def _import_api(app_client, baza: bytes, paczka: bytes, **dane: str):
    return app_client.post(
        "/api/projects/import/incremental",
        files={
            "base_file": ("baza.mvdp.zip", baza, "application/zip"),
            "delta_file": ("zmiany.mvdp-delta.zip", paczka, "application/zip"),
        },
        data=dane,
    )


def test_api_eksport_i_import_paczki(seria, app_client, uow_factory):
    eksport = _eksport_api(app_client, seria["projekt"], seria["baza"])
    assert eksport.status_code == 200, eksport.text
    assert eksport.headers["content-type"] == "application/zip"
    assert int(eksport.headers["X-Sections-Changed"]) == seria["eksport"].wynik.sections_changed
    assert _json_wpisu(eksport.content, "incremental.json") == _json_wpisu(
        seria["paczka"], "incremental.json"
    )

    odp = _import_api(app_client, seria["baza"], eksport.content, new_name="Po zmianach")
    assert odp.status_code == 200, odp.text
    wynik = odp.json()
    assert wynik["status"] == "SUCCESS"
    assert wynik["sections_applied"] == seria["eksport"].wynik.sections_changed
    model = get_enm(klucz_twin_projektu(UUID(wynik["project_id"])))
    assert "Szyna nN stacji" in {b.name for b in model.buses}


@pytest.mark.parametrize("rodzaj", RODZAJE)
def test_api_eksport_uszkodzona_baza_422(seria, app_client, rodzaj):
    bajty, _, fragment = _uszkodzone_bazy(seria["baza"])[rodzaj]
    odp = _eksport_api(app_client, seria["projekt"], bajty)
    assert odp.status_code == 422, odp.text
    detail = odp.json()["detail"]
    assert detail.startswith("Archiwum bazowe: ")
    assert fragment in detail


@pytest.mark.parametrize("plik", ["baza", "paczka"])
@pytest.mark.parametrize("rodzaj", RODZAJE)
def test_api_import_uszkodzony_plik_422(seria, app_client, uow_factory, rodzaj, plik):
    if plik == "baza":
        bajty, _, fragment = _uszkodzone_bazy(seria["baza"])[rodzaj]
        odp = _import_api(app_client, bajty, seria["paczka"])
        przedrostek = "Archiwum bazowe: "
    else:
        bajty, _, fragment = _uszkodzone_paczki(seria["paczka"])[rodzaj]
        odp = _import_api(app_client, seria["baza"], bajty)
        przedrostek = "Paczka zmian: "
    assert odp.status_code == 422, odp.text
    detail = odp.json()["detail"]
    assert detail.startswith(przedrostek), detail
    assert fragment in detail


def test_api_import_paczki_innej_bazy_409(seria, app_client, uow_factory):
    inny = _utworz_projekt(uow_factory, "Inny projekt", [SZYNA_SN])
    odp = _import_api(app_client, _eksport(uow_factory, inny), seria["paczka"])
    assert odp.status_code == 409, odp.text
    assert "innego archiwum bazowego" in odp.json()["detail"]


def test_api_eksport_nieistniejacy_projekt_404(seria, app_client):
    odp = _eksport_api(app_client, uuid4(), seria["baza"])
    assert odp.status_code == 404, odp.text
    assert "nie istnieje" in odp.json()["detail"]


@pytest.mark.parametrize(
    ("baza_nazwa", "paczka_nazwa", "fragment"),
    [
        ("baza.txt", "zmiany.mvdp-delta.zip", "archiwum bazowe"),
        ("baza.mvdp.zip", "zmiany.json", "paczka zmian"),
    ],
)
def test_api_import_zle_rozszerzenie_400(seria, app_client, baza_nazwa, paczka_nazwa, fragment):
    odp = app_client.post(
        "/api/projects/import/incremental",
        files={
            "base_file": (baza_nazwa, seria["baza"], "application/zip"),
            "delta_file": (paczka_nazwa, seria["paczka"], "application/zip"),
        },
    )
    assert odp.status_code == 400
    assert fragment in odp.json()["detail"]


def test_api_obcy_wyjatek_nie_staje_sie_4xx(seria, app_client, monkeypatch):
    def _awaria(*_a: object, **_k: object) -> object:
        raise RuntimeError("awaria spoza archiwum")

    monkeypatch.setattr(ProjectArchiveService, "import_incremental", _awaria)
    with pytest.raises(RuntimeError, match="awaria spoza archiwum"):
        _import_api(app_client, seria["baza"], seria["paczka"])
