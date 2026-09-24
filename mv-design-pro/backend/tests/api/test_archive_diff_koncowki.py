"""Końcówki porównania archiwów projektu (`api/archive_diff.py`) na REALNEJ ścieżce.

DEFEKT, KTÓRY TEN PLIK PRZYPINA (znalezisko bramki mypy, 2026-09-23). Obie końcówki
wołały metody, których `ProjectArchiveService` nigdy nie miał
(`load_archive_from_bytes`, `build_archive`). `AttributeError` z porównania plików
połykał blok `except (ArchiveError, Exception)`, więc KAŻDE porównanie dwóch
archiwów kończyło się HTTP 400 „Blad odczytu archiwum A: ... has no attribute ...",
a porównanie po `project_id` wybuchało 500. Żaden test nie ćwiczył tych końcówek
na prawdziwych archiwach — stąd funkcja pozorna przez wiele kart.

ŚCIEŻKA. Router `archive_diff` jest ZAMONTOWANY w `api/main.py` pod `/api`
(karta ARCHIWUM PROJEKTU, 2026-09-24 — konsument: okno „Archiwum projektu (ZIP)").
Test woła APLIKACJĘ PRODUKCYJNĄ (`app_client`), więc montaż jest częścią tego,
co test sprawdza; kod końcówek, serwis, magazyn ENM i baza są prawdziwe; archiwa
ZIP powstają przez `ProjectArchiveService.export_project` z projektów w bazie
z realnym modelem sieci.

ILOCZYN CECH (reguła KLASA, NIE INSTANCJA):
* źródło archiwum {pliki ZIP, projekty po `project_id`} × różnica {sieć, sieć +
  metadane/przypadki, brak} — wynik zawsze równy `domain.archive_diff` liczonemu
  NIEZALEŻNIE (własne rozpakowanie ZIP w teście, nie przez serwis);
* rodzaj uszkodzenia archiwum (14 rodzajów, w tym brak pola i zły typ na
  poziomie zagnieżdżonym) × pozycja {A, B} — zawsze 422 z nazwanym błędem
  `ArchiveError`, komunikatem PL nazywającym archiwum i ścieżką pola, nigdy
  połknięty wyjątek obcy;
* ten sam uszkodzony ZIP × wszystkie trzy wejścia serwisu {porównanie, import,
  podgląd} — ten sam komunikat (JEDEN dekoder ZIP, nie trzy kopie);
* wyjątek spoza `ArchiveError` × obie końcówki — wybucha, nie staje się 4xx.
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
from domain.archive_diff import (  # noqa: E402
    DiffStatus,
    compare_archives,
    format_diff_report_pl,
)
from domain.project_archive import (  # noqa: E402
    ArchiveError,
    ArchiveImportStatus,
    ProjectArchive,
    dict_to_archive,
)
from enm.klucz_twin import klucz_twin_projektu  # noqa: E402
from enm.models import Bus, Load  # noqa: E402
from enm.store import get_enm, reset_enm_store, set_enm  # noqa: E402
from infrastructure.persistence.models import ProjectORM, StudyCaseORM  # noqa: E402

URL_PLIKI = "/api/archives/diff"


def _url_projekty(project_id_a: UUID, project_id_b: UUID) -> str:
    return f"/api/archives/diff/projects/{project_id_a}/{project_id_b}"


# ============================================================================
# FIKSTURY
# ============================================================================


@pytest.fixture(autouse=True)
def _enm_store_tmp(tmp_path, monkeypatch):
    """Izolowany katalog magazynu ENM (eksport go czyta, jak w
    `tests/api/test_project_archive_api.py`)."""
    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path / "enm_store"))
    reset_enm_store(remove_persisted=False)
    yield
    reset_enm_store(remove_persisted=False)


@pytest.fixture()
def klient(app_client):
    """Aplikacja produkcyjna (`api.main.app`) — trasa istnieje tylko, jeśli jest zamontowana."""
    return app_client


# ============================================================================
# POMOCNICZE
# ============================================================================


def _utworz_projekt(uow_factory, nazwa: str, szyny: list[Bus]) -> UUID:
    """Projekt z jednym przypadkiem studium i modelem sieci złożonym z `szyny`."""
    project_id = uuid4()
    teraz = datetime(2026, 9, 23, 12, 0, tzinfo=UTC)
    with uow_factory() as uow:
        uow.session.add(
            ProjectORM(
                id=project_id,
                name=nazwa,
                description=f"Opis: {nazwa}",
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


def _archiwum_niezaleznie(archive_bytes: bytes) -> ProjectArchive:
    """Rozpakowanie ZIP WŁASNĄ drogą testu (nie przez serwis) — oczekiwany wynik
    nie może pochodzić z kodu, który test sprawdza."""
    with zipfile.ZipFile(io.BytesIO(archive_bytes), "r") as zf:
        return dict_to_archive(json.loads(zf.read("project.json").decode("utf-8")))


def _oczekiwana_odpowiedz(archiwum_a: ProjectArchive, archiwum_b: ProjectArchive) -> dict:
    wynik = compare_archives(archiwum_a, archiwum_b)
    return {**wynik.to_dict(), "report_pl": format_diff_report_pl(wynik)}


def _porownaj_pliki(klient, bytes_a: bytes, bytes_b: bytes):
    return klient.post(
        URL_PLIKI,
        files={
            "file_a": ("a.mvdp.zip", bytes_a, "application/zip"),
            "file_b": ("b.mvdp.zip", bytes_b, "application/zip"),
        },
    )


def _zip(pliki: dict[str, bytes]) -> bytes:
    bufor = io.BytesIO()
    with zipfile.ZipFile(bufor, "w", zipfile.ZIP_DEFLATED) as zf:
        for nazwa, tresc in pliki.items():
            zf.writestr(nazwa, tresc)
    return bufor.getvalue()


def _project_json(archive_bytes: bytes) -> dict[str, Any]:
    with zipfile.ZipFile(io.BytesIO(archive_bytes), "r") as zf:
        return json.loads(zf.read("project.json").decode("utf-8"))


def _podmien_project_json(archive_bytes: bytes, dane: dict[str, Any]) -> bytes:
    with zipfile.ZipFile(io.BytesIO(archive_bytes), "r") as zf:
        manifest = zf.read("manifest.json")
    return _zip({"project.json": json.dumps(dane).encode("utf-8"), "manifest.json": manifest})


def _roznice(odpowiedz: dict, sekcja: str) -> dict[tuple[str, str], dict]:
    for sd in odpowiedz["section_diffs"]:
        if sd["section_name"] == sekcja:
            return {(ed["element_type"], ed["element_id"]): ed for ed in sd["element_diffs"]}
    raise AssertionError(f"Brak sekcji {sekcja!r} w wyniku porównania")


def _status_sekcji(odpowiedz: dict) -> dict[str, str]:
    return {sd["section_name"]: sd["status"] for sd in odpowiedz["section_diffs"]}


# ============================================================================
# PORÓWNANIE PLIKÓW ZIP
# ============================================================================


def test_porownanie_plikow_dwoch_projektow_rozniacych_sie_siecia(klient, uow_factory) -> None:
    """Dwa różne projekty (inna sieć, inne metadane, inne przypadki) — 200 i wynik
    równy domenie; zmiana sieci widoczna element po elemencie."""
    projekt_a = _utworz_projekt(
        uow_factory, "Projekt A", [Bus(ref_id="SN-1", name="Szyna SN", voltage_kv=15.0)]
    )
    projekt_b = _utworz_projekt(
        uow_factory,
        "Projekt B",
        [
            Bus(ref_id="SN-1", name="Szyna SN", voltage_kv=20.0),
            Bus(ref_id="NN-2", name="Szyna nN", voltage_kv=0.4),
        ],
    )
    bytes_a = _eksport(uow_factory, projekt_a)
    bytes_b = _eksport(uow_factory, projekt_b)

    resp = _porownaj_pliki(klient, bytes_a, bytes_b)

    assert resp.status_code == 200, resp.text
    wynik = resp.json()
    assert wynik == _oczekiwana_odpowiedz(
        _archiwum_niezaleznie(bytes_a), _archiwum_niezaleznie(bytes_b)
    )
    assert wynik["overall_status"] == "MODIFIED"
    assert wynik["section_diffs"], "porównanie różnych projektów nie może być puste"

    siec = _roznice(wynik, "enm")
    assert siec[("buses", "NN-2")]["status"] == "ADDED"
    zmiana_sn = siec[("buses", "SN-1")]
    assert zmiana_sn["status"] == "MODIFIED"
    napiecie = {fc["field_name"]: fc for fc in zmiana_sn["field_changes"]}["voltage_kv"]
    assert (napiecie["old_value"], napiecie["new_value"]) == (15.0, 20.0)

    metadane = _roznice(wynik, "project_meta")[("project_meta", "project_meta")]
    nazwa = {fc["field_name"]: fc for fc in metadane["field_changes"]}["name"]
    assert (nazwa["old_value"], nazwa["new_value"]) == ("Projekt A", "Projekt B")
    assert "NN-2" in wynik["report_pl"]


def test_porownanie_plikow_tego_samego_projektu_po_zmianie_sieci(klient, uow_factory) -> None:
    """Ten sam projekt przed i po zmianie sieci — zmienia się WYŁĄCZNIE sekcja modelu
    sieci, a jej rozbicie wymienia dokładnie zmienione elementy (bez tej sekcji
    wynik mówił „archiwum zmienione", a każda sekcja była identyczna)."""
    projekt = _utworz_projekt(
        uow_factory,
        "Projekt zmieniany",
        [
            Bus(ref_id="SN-1", name="Szyna SN", voltage_kv=15.0),
            Bus(ref_id="SN-USUWANA", name="Szyna do usunięcia", voltage_kv=15.0),
        ],
    )
    przed = _eksport(uow_factory, projekt)
    klucz = klucz_twin_projektu(projekt)
    model = get_enm(klucz).model_copy(deep=True)
    model.buses = [
        szyna.model_copy(update={"voltage_kv": 20.0}) if szyna.ref_id == "SN-1" else szyna
        for szyna in model.buses
        if szyna.ref_id != "SN-USUWANA"
    ] + [Bus(ref_id="NN-2", name="Szyna nN", voltage_kv=0.4)]
    set_enm(klucz, model)
    po = _eksport(uow_factory, projekt)

    resp = _porownaj_pliki(klient, przed, po)

    assert resp.status_code == 200, resp.text
    wynik = resp.json()
    assert wynik == _oczekiwana_odpowiedz(_archiwum_niezaleznie(przed), _archiwum_niezaleznie(po))
    statusy = _status_sekcji(wynik)
    assert {s for s, st in statusy.items() if st == "MODIFIED"} == {"enm"}
    assert wynik["summary"]["sections_modified"] == 1

    siec = _roznice(wynik, "enm")
    assert {(typ, ident, ed["status"]) for (typ, ident), ed in siec.items()} == {
        ("header", "header", "MODIFIED"),
        ("buses", "SN-1", "MODIFIED"),
        ("buses", "SN-USUWANA", "REMOVED"),
        ("buses", "NN-2", "ADDED"),
    }
    assert {fc["field_name"] for fc in siec[("buses", "SN-1")]["field_changes"]} == {"voltage_kv"}
    assert "revision" in {fc["field_name"] for fc in siec[("header", "header")]["field_changes"]}
    assert wynik["summary"]["total_elements_added"] == 1
    assert wynik["summary"]["total_elements_removed"] == 1
    assert wynik["summary"]["total_elements_modified"] == 2


def test_porownanie_plikow_identycznych_archiwow(klient, uow_factory) -> None:
    projekt = _utworz_projekt(
        uow_factory, "Projekt stały", [Bus(ref_id="SN-1", name="Szyna SN", voltage_kv=15.0)]
    )
    bytes_1 = _eksport(uow_factory, projekt)
    bytes_2 = _eksport(uow_factory, projekt)

    resp = _porownaj_pliki(klient, bytes_1, bytes_2)

    assert resp.status_code == 200, resp.text
    wynik = resp.json()
    assert wynik["overall_status"] == "IDENTICAL"
    assert wynik["section_diffs"] == []
    assert wynik == _oczekiwana_odpowiedz(
        _archiwum_niezaleznie(bytes_1), _archiwum_niezaleznie(bytes_2)
    )


def test_porownanie_plikow_odrzuca_zle_rozszerzenie(klient, uow_factory) -> None:
    projekt = _utworz_projekt(uow_factory, "Projekt", [])
    archiwum = _eksport(uow_factory, projekt)

    resp = klient.post(
        URL_PLIKI,
        files={
            "file_a": ("a.mvdp.zip", archiwum, "application/zip"),
            "file_b": ("notatki.txt", archiwum, "text/plain"),
        },
    )

    assert resp.status_code == 400
    assert "rozszerzenie pliku B" in resp.json()["detail"]


def test_porownanie_plikow_rozszerzenie_bez_wzgledu_na_wielkosc_liter(klient, uow_factory):
    """Ten sam predykat co wybór pliku w UI (`jestPlikiemArchiwum` porównuje małe
    litery): „PROJEKT.MVDP.ZIP" przechodzi ekran, więc musi przejść końcówkę."""
    projekt = _utworz_projekt(uow_factory, "Projekt", [])
    archiwum = _eksport(uow_factory, projekt)

    resp = klient.post(
        URL_PLIKI,
        files={
            "file_a": ("PROJEKT.MVDP.ZIP", archiwum, "application/zip"),
            "file_b": ("Kopia.Zip", archiwum, "application/zip"),
        },
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["overall_status"] == "IDENTICAL"


# ============================================================================
# PORÓWNANIE PO project_id
# ============================================================================


def test_porownanie_projektow_rowne_porownaniu_ich_eksportow(klient, uow_factory) -> None:
    """Obie końcówki opisują TE SAME archiwa: wynik po `project_id` jest równy
    wynikowi porównania plików wyeksportowanych z tych projektów."""
    projekt_a = _utworz_projekt(
        uow_factory, "Projekt A", [Bus(ref_id="SN-1", name="Szyna SN", voltage_kv=15.0)]
    )
    projekt_b = _utworz_projekt(
        uow_factory,
        "Projekt B",
        [
            Bus(ref_id="SN-1", name="Szyna SN", voltage_kv=20.0),
            Bus(ref_id="NN-2", name="Szyna nN", voltage_kv=0.4),
        ],
    )

    resp = klient.post(_url_projekty(projekt_a, projekt_b))

    assert resp.status_code == 200, resp.text
    wynik = resp.json()
    bytes_a = _eksport(uow_factory, projekt_a)
    bytes_b = _eksport(uow_factory, projekt_b)
    assert wynik == _oczekiwana_odpowiedz(
        _archiwum_niezaleznie(bytes_a), _archiwum_niezaleznie(bytes_b)
    )
    assert wynik == _porownaj_pliki(klient, bytes_a, bytes_b).json()
    assert _roznice(wynik, "enm")[("buses", "NN-2")]["status"] == "ADDED"


@pytest.mark.parametrize("pozycja", ["A", "B"])
def test_porownanie_projektow_nieistniejacy_projekt_404(klient, uow_factory, pozycja) -> None:
    istniejacy = _utworz_projekt(uow_factory, "Projekt", [])
    brak = uuid4()
    a, b = (brak, istniejacy) if pozycja == "A" else (istniejacy, brak)

    resp = klient.post(_url_projekty(a, b))

    assert resp.status_code == 404
    detail = resp.json()["detail"]
    assert detail.startswith(f"Projekt {pozycja}: ")
    assert f"Projekt o ID {brak} nie istnieje" in detail


# ============================================================================
# ARCHIWA USZKODZONE — jedyny dopuszczalny 422 to nazwany ArchiveError
# ============================================================================


def _uszkodzone_archiwa(poprawne: bytes) -> dict[str, tuple[bytes, str]]:
    """Rodzaj uszkodzenia -> (bajty, fragment oczekiwanego komunikatu PL)."""
    dane = _project_json(poprawne)

    bez_sekcji = {k: v for k, v in dane.items() if k != "cases"}
    bez_pola = {
        **dane,
        "project_meta": {k: v for k, v in dane["project_meta"].items() if k != "id"},
    }
    bez_pola_odcisku = {
        **dane,
        "fingerprints": {k: v for k, v in dane["fingerprints"].items() if k != "cases_hash"},
    }
    zly_typ_pola = {**dane, "project_meta": {**dane["project_meta"], "name": 5}}
    sekcja_nie_obiekt = {**dane, "cases": []}
    lista_nie_lista = {**dane, "runs": {**dane["runs"], "canonical_runs": {}}}
    zla_wersja = {**dane, "schema_version": "9.0.0"}
    naruszona = {**dane, "project_meta": {**dane["project_meta"], "name": "Podmieniona nazwa"}}

    # Uszkodzenie strumienia skompresowanego: nagłówki ZIP zostają poprawne,
    # psują się bajty danych `project.json` (CRC albo zlib wykryje).
    uszkodzona_kompresja = bytearray(poprawne)
    with zipfile.ZipFile(io.BytesIO(poprawne), "r") as zf:
        info = zf.getinfo("project.json")
    poczatek_danych = info.header_offset + 30 + len(info.filename.encode()) + len(info.extra)
    for przesuniecie in range(8, 24):
        uszkodzona_kompresja[poczatek_danych + przesuniecie] ^= 0xFF

    return {
        "nie_zip": (b"to nie jest archiwum ZIP", "Nieprawidłowy format archiwum ZIP"),
        "bez_project_json": (
            _zip({"manifest.json": b"{}"}),
            "Archiwum nie zawiera pliku project.json",
        ),
        "nie_utf8": (_zip({"project.json": b"\xff\xfe\xfd"}), "UTF-8"),
        "json_niepoprawny": (_zip({"project.json": b"{nie json"}), "Błąd parsowania JSON"),
        "json_nie_obiekt": (_zip({"project.json": b"[1, 2]"}), "nie zawiera obiektu archiwum"),
        "brak_sekcji": (
            _podmien_project_json(poprawne, bez_sekcji),
            "Brak wymaganej sekcji: cases",
        ),
        "brak_pola": (
            _podmien_project_json(poprawne, bez_pola),
            "Brak wymaganego pola: project_meta.id",
        ),
        "brak_pola_odcisku": (
            _podmien_project_json(poprawne, bez_pola_odcisku),
            "Brak wymaganego pola: fingerprints.cases_hash",
        ),
        "zly_typ_pola": (
            _podmien_project_json(poprawne, zly_typ_pola),
            "Pole project_meta.name nie jest tekstem",
        ),
        "sekcja_nie_obiekt": (
            _podmien_project_json(poprawne, sekcja_nie_obiekt),
            "Sekcja cases nie jest obiektem",
        ),
        "lista_nie_lista": (
            _podmien_project_json(poprawne, lista_nie_lista),
            "Pole runs.canonical_runs nie jest listą",
        ),
        "zla_wersja": (
            _podmien_project_json(poprawne, zla_wersja),
            "Nieobsługiwana wersja schematu archiwum",
        ),
        "naruszona_integralnosc": (
            _podmien_project_json(poprawne, naruszona),
            "Błąd integralności sekcji 'project_meta'",
        ),
        "uszkodzona_kompresja": (bytes(uszkodzona_kompresja), "archiwum ZIP"),
    }


RODZAJE_USZKODZEN = [
    "nie_zip",
    "bez_project_json",
    "nie_utf8",
    "json_niepoprawny",
    "json_nie_obiekt",
    "brak_sekcji",
    "brak_pola",
    "brak_pola_odcisku",
    "zly_typ_pola",
    "sekcja_nie_obiekt",
    "lista_nie_lista",
    "zla_wersja",
    "naruszona_integralnosc",
    "uszkodzona_kompresja",
]


@pytest.mark.parametrize("pozycja", ["A", "B"])
@pytest.mark.parametrize("rodzaj", RODZAJE_USZKODZEN)
def test_porownanie_plikow_uszkodzone_archiwum_422(klient, uow_factory, rodzaj, pozycja) -> None:
    projekt = _utworz_projekt(
        uow_factory, "Projekt", [Bus(ref_id="SN-1", name="Szyna SN", voltage_kv=15.0)]
    )
    poprawne = _eksport(uow_factory, projekt)
    uszkodzone, fragment = _uszkodzone_archiwa(poprawne)[rodzaj]
    a, b = (uszkodzone, poprawne) if pozycja == "A" else (poprawne, uszkodzone)

    resp = _porownaj_pliki(klient, a, b)

    assert resp.status_code == 422, resp.text
    detail = resp.json()["detail"]
    assert detail.startswith(f"Archiwum {pozycja}: "), detail
    assert fragment in detail, detail
    assert "attribute" not in detail, "komunikat obcego wyjątku zamiast nazwanego błędu"


@pytest.mark.parametrize("rodzaj", RODZAJE_USZKODZEN)
def test_jeden_dekoder_zip_dla_porownania_importu_i_podgladu(
    uow_factory, test_db_session, rodzaj
) -> None:
    """Ten sam uszkodzony ZIP daje TEN SAM komunikat w porównaniu, imporcie i
    podglądzie — dekodowanie archiwum ma jedno źródło prawdy."""
    projekt = _utworz_projekt(
        uow_factory, "Projekt", [Bus(ref_id="SN-1", name="Szyna SN", voltage_kv=15.0)]
    )
    uszkodzone, _ = _uszkodzone_archiwa(_eksport(uow_factory, projekt))[rodzaj]
    service = ProjectArchiveService(test_db_session)

    with pytest.raises(ArchiveError) as blad:
        service.load_archive(uszkodzone)
    komunikat = str(blad.value)

    wynik_importu = service.import_project(uszkodzone)
    assert wynik_importu.status == ArchiveImportStatus.FAILED
    assert wynik_importu.project_id is None

    if rodzaj == "naruszona_integralnosc":
        # Import raportuje błędy integralności osobno; porównanie łączy je w
        # jeden komunikat — każdy z nich musi w nim być.
        assert wynik_importu.errors
        assert all(b in komunikat for b in wynik_importu.errors)
        # Podgląd integralności nie sprawdza (tylko opisuje zawartość).
        assert service.preview_archive(uszkodzone)["valid"] is True
    else:
        assert wynik_importu.errors == [komunikat]
        assert service.preview_archive(uszkodzone) == {"valid": False, "error": komunikat}


def test_load_archive_i_build_archive_daja_to_samo_archiwum(uow_factory, test_db_session) -> None:
    projekt = _utworz_projekt(
        uow_factory, "Projekt", [Bus(ref_id="SN-1", name="Szyna SN", voltage_kv=15.0)]
    )
    service = ProjectArchiveService(test_db_session)

    z_bazy = service.build_archive(projekt)
    z_pliku = service.load_archive(service.export_project(projekt))

    assert z_pliku == z_bazy
    assert z_bazy.enm.models, "archiwum musi nieść model sieci projektu"


def test_build_archive_nieistniejacy_projekt_to_archive_error(test_db_session) -> None:
    brak = uuid4()
    with pytest.raises(ArchiveError, match=f"Projekt o ID {brak} nie istnieje"):
        ProjectArchiveService(test_db_session).build_archive(brak)


def test_podglad_uszkodzonego_manifestu_nazwany_blad(uow_factory, test_db_session) -> None:
    """Manifest to metadane podglądu (data eksportu) — jego uszkodzenie podgląd
    zgłasza nazwanym błędem, a porównanie (które manifestu nie potrzebuje) działa."""
    projekt = _utworz_projekt(uow_factory, "Projekt", [])
    poprawne = _eksport(uow_factory, projekt)
    zly_manifest = _zip(
        {
            "project.json": json.dumps(_project_json(poprawne)).encode("utf-8"),
            "manifest.json": b"{nie json",
        }
    )
    service = ProjectArchiveService(test_db_session)

    podglad = service.preview_archive(zly_manifest)
    assert podglad["valid"] is False
    assert podglad["error"].startswith("Błąd parsowania JSON")
    assert service.load_archive(zly_manifest) == service.load_archive(poprawne)


# ============================================================================
# WYJĄTEK SPOZA ArchiveError WYBUCHA (wykluczenie != naprawa)
# ============================================================================


def test_porownanie_plikow_obcy_wyjatek_nie_staje_sie_4xx(klient, uow_factory, monkeypatch):
    projekt = _utworz_projekt(uow_factory, "Projekt", [])
    archiwum = _eksport(uow_factory, projekt)

    def _awaria(*_args: object, **_kwargs: object) -> ProjectArchive:
        raise RuntimeError("awaria spoza archiwum")

    monkeypatch.setattr(ProjectArchiveService, "load_archive", _awaria, raising=False)

    with pytest.raises(RuntimeError, match="awaria spoza archiwum"):
        _porownaj_pliki(klient, archiwum, archiwum)


def test_porownanie_projektow_obcy_wyjatek_nie_staje_sie_4xx(klient, uow_factory, monkeypatch):
    projekt = _utworz_projekt(uow_factory, "Projekt", [])

    def _awaria(*_args: object, **_kwargs: object) -> ProjectArchive:
        raise RuntimeError("awaria spoza archiwum")

    monkeypatch.setattr(ProjectArchiveService, "build_archive", _awaria, raising=False)

    with pytest.raises(RuntimeError, match="awaria spoza archiwum"):
        klient.post(_url_projekty(projekt, projekt))


def test_zmiana_statusu_sekcji_sieci_zgodna_z_domena(uow_factory) -> None:
    """Sekcja sieci niesie model projektu powielony pod każdym przypadkiem (CV-1-W).
    Dodanie przypadku zmienia bajty sekcji, ale nie sieć — sekcja sieci zostaje
    IDENTYCZNA, a zmiana jest widoczna w sekcji przypadków."""
    projekt = _utworz_projekt(
        uow_factory, "Projekt", [Bus(ref_id="SN-1", name="Szyna SN", voltage_kv=15.0)]
    )
    przed = _archiwum_niezaleznie(_eksport(uow_factory, projekt))
    teraz = datetime(2026, 9, 23, 13, 0, tzinfo=UTC)
    with uow_factory() as uow:
        uow.session.add(
            StudyCaseORM(
                id=uuid4(),
                project_id=projekt,
                name="Przypadek drugi",
                description=None,
                study_jsonb={},
                is_active=False,
                result_status="NONE",
                result_refs_jsonb=[],
                revision=1,
                created_at=teraz,
                updated_at=teraz,
            )
        )
    po = _archiwum_niezaleznie(_eksport(uow_factory, projekt))

    wynik = compare_archives(przed, po)

    assert przed.fingerprints.enm_hash != po.fingerprints.enm_hash
    statusy = {sd.section_name: sd.status for sd in wynik.section_diffs}
    assert statusy["enm"] == DiffStatus.IDENTICAL
    assert statusy["cases"] == DiffStatus.MODIFIED


# ============================================================================
# NAZWY ZAMIAST IDENTYFIKATORÓW (ekran porównania czyta te pola wprost)
# ============================================================================


def test_porownanie_niesie_nazwy_elementow_i_etykiety_pl(klient, uow_factory) -> None:
    """Element dodany/usunięty/zmieniony niesie nazwę nadaną przez projektanta
    (dla usuniętego — ze strony A), a rodzaj elementu i sekcja — etykiety PL."""
    projekt_a = _utworz_projekt(
        uow_factory,
        "Projekt A",
        [
            Bus(ref_id="SN-1", name="Szyna SN", voltage_kv=15.0),
            Bus(ref_id="SN-9", name="Szyna usuwana", voltage_kv=15.0),
        ],
    )
    projekt_b = _utworz_projekt(
        uow_factory,
        "Projekt B",
        [
            Bus(ref_id="SN-1", name="Szyna SN po zmianie", voltage_kv=20.0),
            Bus(ref_id="NN-2", name="Szyna nN", voltage_kv=0.4),
        ],
    )

    resp = klient.post(_url_projekty(projekt_a, projekt_b))

    assert resp.status_code == 200, resp.text
    enm = _roznice(resp.json(), "enm")
    assert enm[("buses", "NN-2")]["element_name"] == "Szyna nN"
    assert enm[("buses", "SN-9")]["element_name"] == "Szyna usuwana"
    assert enm[("buses", "SN-1")]["element_name"] == "Szyna SN po zmianie"
    assert {
        ed["element_type_label_pl"] for ed in enm.values() if ed["element_type"] == "buses"
    } == {"Szyny"}
    etykiety = {sd["section_name"]: sd["section_label_pl"] for sd in resp.json()["section_diffs"]}
    assert etykiety["enm"] == "Model sieci"
    assert etykiety["project_meta"] == "Metadane projektu"


def test_porownanie_pokazuje_odwolania_nazwami_elementow(klient, uow_factory) -> None:
    """Odbiór przełączony na inną szynę: pole `bus_ref` niesie obok surowego
    identyfikatora wartość z NAZWAMI szyn (strona A z projektu A, B z projektu B),
    więc ekran nie pokazuje projektantowi identyfikatorów."""
    szyny = [
        Bus(ref_id="SN-1", name="Szyna SN", voltage_kv=15.0),
        Bus(ref_id="SN-2", name="Szyna rezerwowa", voltage_kv=15.0),
    ]
    projekt_a = _utworz_projekt(uow_factory, "Projekt A", szyny)
    projekt_b = _utworz_projekt(uow_factory, "Projekt B", szyny)
    for projekt, szyna in ((projekt_a, "SN-1"), (projekt_b, "SN-2")):
        klucz = klucz_twin_projektu(projekt)
        model = get_enm(klucz).model_copy(deep=True)
        model.loads = [Load(ref_id="L-1", name="Odbiór 1", bus_ref=szyna, p_mw=1.0, q_mvar=0.2)]
        set_enm(klucz, model)

    resp = klient.post(_url_projekty(projekt_a, projekt_b))

    assert resp.status_code == 200, resp.text
    odbior = _roznice(resp.json(), "enm")[("loads", "L-1")]
    pole = {fc["field_name"]: fc for fc in odbior["field_changes"]}["bus_ref"]
    assert (pole["old_value"], pole["new_value"]) == ("SN-1", "SN-2")
    assert (pole["old_value_pl"], pole["new_value_pl"]) == ("Szyna SN", "Szyna rezerwowa")
    assert "Szyna SN -> Szyna rezerwowa" in resp.json()["report_pl"]


@pytest.mark.parametrize(
    ("typ", "etykieta"),
    [
        ("buses", "Szyny"),
        ("model", "Parametry modelu sieci"),
        ("study_cases", "Przypadki obliczeniowe"),
        ("katalog_projektu.kable", "Katalog projektu › kable"),
        ("przypadek:c-1.buses", "Szyny (przypadek c-1)"),
        ("przypadek:c-1", "Parametry modelu sieci (przypadek c-1)"),
        ("nieznana_kolekcja", "nieznana_kolekcja"),
    ],
)
def test_etykieta_typu_elementu_pl(typ: str, etykieta: str) -> None:
    from domain.archive_diff import etykieta_typu_elementu_pl

    assert etykieta_typu_elementu_pl(typ) == etykieta
