"""Klucz przypadku obliczeniowego — JEDNO źródło prawdy (dług 2 z V12K-315).

DŁUG, KTÓRY TO ZAMYKA. `POST /api/station-templates/{id}/apply` normalizowało
identyfikator przypadku przez `str(UUID(...))`, a WSZYSTKIE pozostałe ścieżki —
w tym KLUCZE MAGAZYNU ENM (`enm.store._case_path` liczy SHA-256 z tekstu
identyfikatora, `blokada_twin` indeksuje tym samym tekstem) — używają
surowego łańcucha z adresu. Dopóki identyfikatory pochodzą z backendu, obie
postacie są identyczne; dla postaci NIEKANONICZNEJ (wielkie litery, klamry,
prefiks `urn:uuid:`, zapis bez myślników) zastosowanie szablonu operowałoby na
INNYM wpisie magazynu niż operacje domenowe: praca lądowałaby pod
`str(UUID(x))`, a `GET /api/cases/{x}/enm` czytałby pusty model spod `x`.
Blokada współbieżności brałaby wtedy inny zamek, więc obie końcówki biegłyby
równolegle po jednym modelu — rozjazd większy niż sama blokada, którą naprawiała
karta T2.

ROZSTRZYGNIĘCIE: wygrywa SUROWY łańcuch z adresu (postać, którą realnie ma
magazyn i wszystkie inne końcówki). Normalizacja znika: `klucz_przypadku` waliduje
format, ale NIGDY nie przekształca wejścia — postać niekanoniczna jest odrzucana
jawnym błędem, a nie po cichu tłumaczona na inny wpis.

Pilnowane własności:
(a) TOŻSAMOŚĆ — dla każdego przyjętego identyfikatora klucz jest BAJTOWO równy
    tekstowi z adresu (funkcja nie jest przekształceniem);
(b) BRAK CICHEGO ROZJAZDU — postać niekanoniczna nie tworzy wpisu-ducha pod
    postacią kanoniczną ani nie rusza wpisu spod adresu;
(c) TEN SAM WPIS — dla identyfikatora kanonicznego szablon i operacje domenowe
    trafiają w DOKŁADNIE ten sam wpis magazynu (iloczyn: obie ścieżki × jeden
    przypadek);
(d) KLASA — żadna ścieżka API nie wyprowadza klucza magazynu przez
    przekształcenie identyfikatora (skan modułów `api/**`, asercja na liście).

STAN PO CV-1-W (korekta 2026-09, żeby akapit „DŁUG, KTÓRY TO ZAMYKA" powyżej nie
mylił jako opis BIEŻĄCEGO stanu): magazyn ENM przestał być kluczowany surowym
tekstem `case_id` — `enm.store` kluczuje kluczem Canonical Project Twin
(`projekt:<uuid_projektu>`, `enm.klucz_twin.klucz_twin_projektu`), tłumaczonym z
`case_id` PRZEZ ZAPYTANIE DO BAZY (`application/twin_key.py::
klucz_twin_dla_przypadku`, JEDYNE miejsce tłumaczenia). Ryzyko z akapitu wyżej
(dwie postacie tego samego UUID trafiające w DWA różne wpisy magazynu) już nie
istnieje: tłumacz sam parsuje `case_id` przez `UUID(...)`, więc obie postacie
tej samej WARTOŚCI UUID dają TEN SAM klucz projektu — POD WARUNKIEM, że
przypadek ma wiersz w bazie (inwariant I-2: przypadek bez wiersza to jawny
błąd, nie „model domyślny"). Własności (a)-(d) niżej nadal obowiązują i są
pilnowane — zmieniła się WYŁĄCZNIE mechanika, którą się posługują (zob. też
`klucz_przypadku` w `api/station_templates.py`, którego docstring ma pełny
opis stanu po CV-1-W).
"""

from __future__ import annotations

import ast
import inspect
import uuid
from pathlib import Path
from typing import Any

import pytest
from api import station_templates
from api.main import app
from api.station_templates import klucz_przypadku
from application.twin_key import klucz_twin_dla_przypadku
from enm.dziennik_zmian import wyczysc_dziennik
from enm.store import has_enm, reset_enm_store
from fastapi.testclient import TestClient

REF_ZRODLO = "src-gpz-15kv-250mva-rx010"
REF_KABEL = "cable-tfk-yakxs-3x120"
SZABLON = "tpl_sn_nn_630kva"

#: Postacie NIEKANONICZNE tego samego identyfikatora — iloczyn cech, nie jeden
#: przykład: wielkość liter × klamry × prefiks URN × zapis bez myślników.
KANONICZNY = "3f2504e0-4f89-41d3-9a0c-0305e82c3301"
NIEKANONICZNE: tuple[str, ...] = (
    KANONICZNY.upper(),
    "{" + KANONICZNY + "}",
    "urn:uuid:" + KANONICZNY,
    KANONICZNY.replace("-", ""),
)


@pytest.fixture()
def klient(tmp_path, monkeypatch, uow_factory) -> TestClient:  # type: ignore[no-untyped-def]
    from api.dependencies import get_uow_factory

    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path))
    reset_enm_store()
    wyczysc_dziennik()
    app.dependency_overrides[get_uow_factory] = lambda: uow_factory
    app.state.uow_factory = uow_factory
    yield TestClient(app)
    app.dependency_overrides.pop(get_uow_factory, None)
    app.state.uow_factory = None
    reset_enm_store()
    wyczysc_dziennik()


def _zasiej_realny_przypadek(uow_factory, case_id: uuid.UUID) -> None:
    """Utwórz REALNY projekt + przypadek z DOKŁADNIE wskazanym `id`.

    CV-1-W: magazyn ENM tłumaczy `case_id` na klucz projektu przez zapytanie
    do bazy (`application/twin_key.py::klucz_twin_dla_przypadku`) — przypadek
    bez wiersza w bazie dostaje 404 (inwariant I-2), niezależnie od tego, czy
    jego tekstowa postać jest kanoniczna. Testy tego pliku badają postać
    TEKSTU (a nie istnienie przypadku), więc potrzebują realnego wiersza pod
    identyfikatorem, którego WARTOŚĆ (nie tekst) się bada — `POST
    /api/study-cases` nie przyjmuje `id` z żądania, więc wiersz wstawiamy
    wprost przez `uow_factory` (ten sam wzorzec co
    `tests/invariants/test_wlasnosc_modelu_projektu.py::_projekt_z_przypadkami`).
    """
    from domain.models import Project
    from domain.study_case import StudyCase

    project_id = uuid.uuid4()
    with uow_factory() as uow:
        uow.projects.add(Project(id=project_id, name="Klucz przypadku — test"), commit=False)
        uow.cases.add_study_case(
            StudyCase(id=case_id, project_id=project_id, name="Przypadek testu"),
            commit=False,
        )
        uow.commit()


def _zasiej_ciag(klient: TestClient, case_id: str) -> str:
    """GPZ + odcinek kablowy pod DOKŁADNIE tym identyfikatorem. Zwraca ref odcinka."""
    for nazwa, payload in (
        (
            "add_grid_source_sn",
            {
                "voltage_kv": 15.0,
                "sk3_mva": 250.0,
                "catalog_ref": REF_ZRODLO,
                "hv_voltage_kv": 110.0,
                "transformer_sn_mva": 25.0,
            },
        ),
        (
            "continue_trunk_segment_sn",
            {"segment": {"rodzaj": "KABEL", "dlugosc_m": 120.0, "catalog_ref": REF_KABEL}},
        ),
    ):
        odpowiedz = klient.post(
            f"/api/cases/{case_id}/enm/domain-ops",
            json={"operation": {"name": nazwa, "payload": payload}},
        )
        assert odpowiedz.status_code == 200, odpowiedz.text
        assert odpowiedz.json().get("error") is None, odpowiedz.text
    snapshot = odpowiedz.json()["snapshot"]
    return str(snapshot["corridors"][0]["ordered_segment_refs"][-1])


# ---------------------------------------------------------------------------
# (a) TOŻSAMOŚĆ — klucz nigdy nie jest przekształceniem wejścia
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("liczba", range(8))
def test_klucz_kanoniczny_jest_tozsamoscia(liczba: int) -> None:
    """Klucz magazynu = DOKŁADNIE tekst z adresu (bajt w bajt)."""
    identyfikator = str(uuid.uuid4())
    assert klucz_przypadku(identyfikator) == identyfikator


@pytest.mark.parametrize("postac", NIEKANONICZNE)
def test_postac_niekanoniczna_jest_odrzucana(postac: str) -> None:
    """Postać, dla której normalizacja ZMIENIŁABY klucz, jest odrzucana jawnie.

    To jest sedno rozstrzygnięcia: dopuszczenie takiej postaci wymagałoby albo
    przekształcenia (czyli rozjazdu z magazynem), albo obsłużenia jej w magazynie
    — a magazyn kluczuje surowym tekstem. Milczące przekształcenie jest defektem,
    jawne odrzucenie nie jest.
    """
    with pytest.raises(ValueError) as blad:
        klucz_przypadku(postac)
    assert "kanonicznej" in str(blad.value)


def test_identyfikator_spoza_kontraktu_jest_odrzucany() -> None:
    with pytest.raises(ValueError):
        klucz_przypadku("nie-jest-uuid")


@pytest.mark.parametrize("otoczenie", [" {0}", "{0} ", "\t{0}", "{0}\n"])
def test_biale_znaki_nie_sa_obcinane(otoczenie: str) -> None:
    """Brak `strip()` — każde oczyszczenie wejścia byłoby tym samym przekształceniem.

    Obcięcie spacji wyglądałoby niewinnie, a dawałoby dokładnie ten defekt:
    klucz magazynu inny niż tekst z adresu.
    """
    with pytest.raises(ValueError):
        klucz_przypadku(otoczenie.format(KANONICZNY))


# ---------------------------------------------------------------------------
# (b) BRAK CICHEGO ROZJAZDU — postać niekanoniczna nie tworzy wpisu-ducha
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("postac", NIEKANONICZNE)
def test_szablon_nie_operuje_na_innym_wpisie_magazynu(
    klient: TestClient, uow_factory, postac: str
) -> None:
    """Zastosowanie szablonu NIE MOŻE trafić w inny wpis magazynu niż adres.

    CZERWONY PRZED NAPRAWĄ: końcówka normalizowała klucz, więc stacja lądowała pod
    `str(UUID(postac))` — wpisie, którego `GET /api/cases/{postac}/enm` nigdy nie
    czyta. Test mierzy DOKŁADNIE to: model spod adresu bez zmian ORAZ brak
    wpisu-ducha pod postacią kanoniczną. Realny wiersz bazy pod WARTOŚCIĄ
    `KANONICZNY` (CV-1-W, inwariant I-2) — każda postać tekstowa niżej tłumaczy
    się na TEN SAM projekt, bo tłumacz `case_id -> klucz` parsuje przez `UUID(...)`.
    """
    _zasiej_realny_przypadek(uow_factory, uuid.UUID(KANONICZNY))
    segment_ref = _zasiej_ciag(klient, postac)
    hash_przed = klient.get(f"/api/cases/{postac}/enm").json()["header"]["hash_sha256"]
    assert not has_enm(KANONICZNY), "wpis kanoniczny istniał jeszcze przed zastosowaniem szablonu"

    odpowiedz = klient.post(
        f"/api/station-templates/{SZABLON}/apply",
        json={"case_id": postac, "target_segment_id": segment_ref, "insert_at_ratio": 0.5},
    )

    assert odpowiedz.status_code == 400, odpowiedz.text
    assert not has_enm(KANONICZNY), (
        "zastosowanie szablonu utworzyło wpis magazynu pod INNYM kluczem niż adres — "
        "praca projektanta byłaby niewidoczna dla wszystkich pozostałych końcówek"
    )
    assert klient.get(f"/api/cases/{postac}/enm").json()["header"]["hash_sha256"] == hash_przed


# ---------------------------------------------------------------------------
# (c) TEN SAM WPIS — szablon i operacje domenowe pod jednym adresem
# ---------------------------------------------------------------------------


def test_szablon_i_operacje_domenowe_trafiaja_w_ten_sam_wpis(
    klient: TestClient, uow_factory
) -> None:
    """Iloczyn cech: jeden przypadek × obie ścieżki zapisu × jeden wpis magazynu."""
    case_id = str(uuid.uuid4())
    _zasiej_realny_przypadek(uow_factory, uuid.UUID(case_id))
    segment_ref = _zasiej_ciag(klient, case_id)
    stacje_przed = len(klient.get(f"/api/cases/{case_id}/enm").json()["substations"])

    odpowiedz = klient.post(
        f"/api/station-templates/{SZABLON}/apply",
        json={"case_id": case_id, "target_segment_id": segment_ref, "insert_at_ratio": 0.5},
    )
    assert odpowiedz.status_code == 200, odpowiedz.text
    station_ref = odpowiedz.json()["station_ref"]

    # Ten sam adres, druga ścieżka odczytu — stacja MUSI tam być.
    snapshot = klient.get(f"/api/cases/{case_id}/enm").json()
    assert len(snapshot["substations"]) == stacje_przed + 1
    assert any(stacja["ref_id"] == station_ref for stacja in snapshot["substations"])

    # ...i nie powstał żaden drugi wpis magazynu pod przekształconym kluczem —
    # ISTNIEJE dokładnie jeden wpis, pod kluczem PROJEKTU (CV-1-W), nigdy pod
    # surowym `case_id` (ten NIGDY nie był kluczem magazynu po CV-1-W) ani pod
    # jego przekształconą postacią.
    klucz = klucz_twin_dla_przypadku(case_id, uow_factory)
    assert has_enm(klucz)
    assert not has_enm(case_id)
    assert not has_enm(case_id.upper())


# ---------------------------------------------------------------------------
# (d) KLASA — żadna ścieżka API nie przekształca identyfikatora w klucz magazynu
# ---------------------------------------------------------------------------


#: INWENTARZ ŚCIEŻEK API SIĘGAJĄCYCH PO MAGAZYN ENM — moduł → sposób wyprowadzenia
#: klucza. To jest KLASA długu 2: rozjazd nie polega na jednej końcówce, tylko na
#: tym, że klucz magazynu bywa wyprowadzany DWIEMA drogami.
#:
#: * ``SUROWY`` — klucz to tekst z adresu, bajt w bajt (kanon: tak kluczuje magazyn).
#: * ``UUID_Z_TRASY`` — trasa deklaruje ``case_id: UUID``, więc FastAPI parsuje
#:   segment adresu, a moduł woła ``str(...)``: DOKŁADNIE ta normalizacja, którą ta
#:   karta usunęła z końcówki szablonów. Pliki są POZA torem tej karty (§0.8),
#:   więc pozycje są tu ZGŁOSZONE i przypięte testem, żeby zbiór nie rósł w ciszy.
#: * ``Z_REKORDU`` — klucz pochodzi z identyfikatora zapisanego w bazie, a nie
#:   z adresu; normalizacji nie ma, bo nie ma czego normalizować.
KLUCZ_SUROWY = "SUROWY"
KLUCZ_UUID_Z_TRASY = "UUID_Z_TRASY"
KLUCZ_Z_REKORDU = "Z_REKORDU"

INWENTARZ_KLUCZA_PRZYPADKU: dict[str, str] = {
    "enm.py": KLUCZ_SUROWY,
    # Karta DIAGNOZA-PRZEBIEGU (D7): diagnostyka i pre-flight biorą model tą samą
    # drogą co `GET /api/cases/{case_id}/enm` — trasa deklaruje `case_id: str`
    # i przekazuje tekst z adresu bajt w bajt do `get_enm`. To jest warunek
    # sensowności powierzchni: diagnoza MUSI opisywać ten sam wpis magazynu,
    # który edytuje projektant i który pójdzie do solvera.
    "diagnostics.py": KLUCZ_SUROWY,
    "generators.py": KLUCZ_SUROWY,
    "der_sn_documents.py": KLUCZ_SUROWY,
    "oze_analysis_runs.py": KLUCZ_SUROWY,
    "reference_engine.py": KLUCZ_SUROWY,
    # Karta P0.10 (nN): pakiet dowodowy LV_CIRCUIT_VERIFICATION i sekcje
    # raportu nN czytają model tą samą drogą co `GET /api/cases/{case_id}/enm`
    # — trasa deklaruje `case_id: str` (Pydantic body) i przekazuje `payload.
    # case_id` do `get_enm` bajt w bajt, bez `UUID(...)`/`str(...)` pomiędzy.
    "nn_proof.py": KLUCZ_SUROWY,
    "fault_scenarios.py": KLUCZ_Z_REKORDU,
    "ncrfg_ptpiree_tests.py": KLUCZ_UUID_Z_TRASY,
    "v126_academic.py": KLUCZ_UUID_Z_TRASY,
}

#: Dług ZGŁOSZONY, nie naprawiony (pliki poza torem karty U1). Zbiór jest zamknięty:
#: każda nowa trasa deklarująca `case_id: UUID` i wołająca magazyn zapali test.
DLUG_NORMALIZACJI_POZA_TOREM: frozenset[str] = frozenset(
    {"ncrfg_ptpiree_tests.py", "v126_academic.py"}
)


def _moduly_api_siegajace_po_magazyn() -> set[str]:
    katalog_api = Path(inspect.getfile(station_templates)).parent
    znalezione: set[str] = set()
    for plik in sorted(katalog_api.glob("*.py")):
        drzewo = ast.parse(plik.read_text(encoding="utf-8"))
        for wezel in ast.walk(drzewo):
            if isinstance(wezel, ast.ImportFrom) and (wezel.module or "").startswith("enm.store"):
                znalezione.add(plik.name)
    return znalezione


def test_inwentarz_sciezek_siegajacych_po_magazyn_jest_domkniety() -> None:
    """Asercja NA LIŚCIE: żadna ścieżka API nie dołącza do magazynu bez werdyktu.

    Bez tego skanu rozjazd wróciłby najtańszą drogą: nowa końcówka deklaruje
    `case_id: UUID`, woła `str(...)` i po cichu operuje na innym wpisie magazynu
    niż `GET /api/cases/{case_id}/enm`.
    """
    znalezione = _moduly_api_siegajace_po_magazyn()
    assert znalezione == set(INWENTARZ_KLUCZA_PRZYPADKU), (
        "Zbiór modułów API wołających magazyn ENM się zmienił — "
        f"doszły: {sorted(znalezione - set(INWENTARZ_KLUCZA_PRZYPADKU))}; "
        f"zniknęły: {sorted(set(INWENTARZ_KLUCZA_PRZYPADKU) - znalezione)}. "
        "Nowy moduł musi wyprowadzać klucz TĄ SAMĄ drogą (surowy tekst z adresu)."
    )


def test_koncowka_szablonow_nie_jest_juz_zrodlem_rozjazdu() -> None:
    """`station_templates` sięga po magazyn POŚREDNIO i przekazuje klucz tożsamościowo.

    CV-1-W: moduł nie importuje `enm.store` — czyta i pisze przez
    `apply_template_to_case`, który bierze już PRZETŁUMACZONY `klucz_twin`
    (nie `case_id`). Jedynym tłumaczeniem `case_id -> klucz` w całej końcówce
    jest wywołanie `klucz_twin_z_sciezki` (JEDYNE miejsce tłumaczenia,
    `api/klucz_twin_dep.py`) — moduł NIE wyprowadza własnego klucza magazynu
    (dawny wektor tego długu: własna konwersja `str(UUID(...))`/`UUID(...)`
    obok tej z `klucz_twin_z_sciezki`).
    """
    assert "station_templates.py" not in _moduly_api_siegajace_po_magazyn()
    zrodlo = Path(inspect.getfile(station_templates)).read_text(encoding="utf-8")
    assert "def klucz_przypadku" in zrodlo
    # Jedyne tłumaczenie `case_id -> klucz` w tej końcówce: `klucz_twin_z_sciezki`
    # — żadnej własnej konwersji między walidacją formatu (`klucz_przypadku`)
    # a wywołaniem `apply_template_to_case`, które dostaje klucz JUŻ gotowy.
    assert "klucz_twin_z_sciezki(case_id_kanoniczny, http_request)" in zrodlo
    assert "apply_template_to_case(" in zrodlo
    assert "klucz_twin=klucz_twin," in zrodlo
    assert "case_id=UUID(klucz)" not in zrodlo
    assert "UUID(request.case_id)" not in zrodlo


def test_dlug_normalizacji_poza_torem_nie_rosnie() -> None:
    """Pozycje ZGŁOSZONE (nie naprawione) są policzalne i domknięte.

    `ncrfg_ptpiree_tests.py` i `v126_academic.py` deklarują trasę `case_id: UUID`
    i wołają `get_enm(str(case_id))`, więc dla adresu niekanonicznego czytają INNY
    wpis magazynu niż `GET /api/cases/{case_id}/enm`. Pliki są poza torem karty U1
    (§0.8 — rozłączność torów), więc dług jest zgłoszony w meldunku i przypięty tu,
    żeby nie urósł niezauważony.
    """
    z_uuid = {
        modul
        for modul, sposob in INWENTARZ_KLUCZA_PRZYPADKU.items()
        if sposob == KLUCZ_UUID_Z_TRASY
    }
    assert z_uuid == set(DLUG_NORMALIZACJI_POZA_TOREM), sorted(
        z_uuid ^ set(DLUG_NORMALIZACJI_POZA_TOREM)
    )

    # Kontrola żywotności: pozycje długu MUSZĄ naprawdę zawierać wzorzec.
    katalog_api = Path(inspect.getfile(station_templates)).parent
    for modul in sorted(DLUG_NORMALIZACJI_POZA_TOREM):
        zrodlo = (katalog_api / modul).read_text(encoding="utf-8")
        assert "case_id: UUID" in zrodlo, modul
        assert "str(case_id)" in zrodlo, modul


def test_koncowka_szablonu_nie_przekazuje_dalej_przeksztalconego_klucza() -> None:
    """Deklaracja z docstringu `klucz_przypadku` ma PRZYPIĘTY dowód.

    Obietnica „klucz jest tożsamością" bez testu jest groźniejsza niż jej brak,
    bo wyłącza czujność. Sprawdzamy niezmiennik, na którym stoi wywołanie
    `apply_template_to_case(case_id=UUID(klucz))`: dla każdego przyjętego
    identyfikatora `str(UUID(klucz)) == klucz`, więc konwersja na `UUID` w
    końcówce nie może zmienić klucza magazynu.
    """
    for _ in range(32):
        identyfikator = str(uuid.uuid4())
        klucz = klucz_przypadku(identyfikator)
        assert str(uuid.UUID(klucz)) == klucz == identyfikator


def test_wszystkie_postacie_niekanoniczne_sa_naprawde_niekanoniczne() -> None:
    """Kontrola żywotności zestawu: każda postać MUSI różnić się od kanonicznej.

    Bez tego test (b) mógłby zzielenieć na postaci, która wcale nie ćwiczy
    rozjazdu (np. gdyby ktoś wpisał tam identyfikator już kanoniczny).
    """
    for postac in NIEKANONICZNE:
        assert str(uuid.UUID(postac)) != postac
        assert str(uuid.UUID(postac)) == KANONICZNY


def test_ksztalt_odpowiedzi_dla_niekanonicznego_identyfikatora(klient: TestClient) -> None:
    """Odrzucenie nazywa PRZYCZYNĘ, a nie samo „invalid"."""
    odpowiedz = klient.post(
        f"/api/station-templates/{SZABLON}/apply",
        json={"case_id": KANONICZNY.upper(), "target_segment_id": "seg-1"},
    )
    assert odpowiedz.status_code == 400, odpowiedz.text
    tresc: Any = odpowiedz.json()["detail"]
    assert "kanonicznej" in str(tresc)
