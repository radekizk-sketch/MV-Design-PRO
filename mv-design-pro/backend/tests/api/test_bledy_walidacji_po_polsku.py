"""Błąd walidacji danych nigdy nie dociera do projektanta tekstem biblioteki (pydantic, uuid).

Klasa defektu: odpowiedź API przepuszczała surowy ``str(exc)`` albo ``exc.errors()[i]["msg"]``
biblioteki — angielskie zdania („Field required", „Input should be a valid number",
„badly formed hexadecimal UUID string"). Inwentarz klasy (każde miejsce, którym błąd walidacji
dochodzi do odpowiedzi) i jedno mapowanie komunikatów ``enm.slownik_komunikatow.
opis_pozycji_walidacji``:

- domyślny handler FastAPI ``RequestValidationError`` (ciało, ścieżka, zapytanie KAŻDEJ trasy)
  → ``api/exception_handlers.py::request_validation_handler``;
- harmonogram scenariusza dynamiki (``api/dynamika.py`` — ``exc.errors()``);
- migawka ENM z żądania pakietu dowodowego i wkładów zwarciowych (``api/proof_pack.py`` ×2);
- sekcje ``parameters`` analizy akademickiej (``api/v126_academic.py``);
- identyfikatory biegów porównania (``api/comparison.py`` — tekst ``uuid``);
- liczby pomiarów estymacji stanu (``application/analyses/state_estimation/service.py``);
- warunki ułożenia kabla nN (``application/analyses/nn_circuit_sheet.py``);
- rekord pola (``enm/pola.py`` → operacja ``update_field``);
- ostrzeżenie importu archiwum 2.x (``application/project_archive/service.py``).

Test jest ILOCZYNEM CECH: droga (handler globalny × trasa, wywołanie jawne × trasa) × rodzaj
błędu walidacji (brak pola, zły typ liczby/tekstu, granica, pole spoza kontraktu, zły JSON,
zły UUID, wartość spoza listy). Dla każdej pary: status bez zmian, treść po polsku, zero
fragmentów tekstu biblioteki, ścieżka pola (``loc``/``pole``) zachowana dla klienta.
"""

from __future__ import annotations

from typing import Any
from uuid import uuid4

import pytest
from enm.slownik_komunikatow import opis_bledu_walidacji, opis_pozycji_walidacji
from network_model.odmowa_danych import OdmowaDanychError
from pydantic import BaseModel, ConfigDict, Field, ValidationError

#: Fragmenty komunikatów bibliotek (pydantic-core, json, uuid, float) — żaden nie może
#: wyjść w treści odpowiedzi.
FRAGMENTY_BIBLIOTEKI = (
    "Field required",
    "Input should",
    "Value error",
    "Extra inputs",
    "String should",
    "should be",
    "valid number",
    "valid integer",
    "JSON decode",
    "Invalid JSON",
    "badly formed",
    "could not convert",
    "validation error",
    "For further information",
    "Zero-sequence",
)


def _teksty(
    wartosc: Any, *, pomin: frozenset[str] = frozenset({"loc", "type", "pole"})
) -> list[str]:
    """Wszystkie napisy odpowiedzi poza kluczami maszynowymi (``loc``, ``type``, ``pole``)."""
    if isinstance(wartosc, str):
        return [wartosc]
    if isinstance(wartosc, list):
        return [t for element in wartosc for t in _teksty(element, pomin=pomin)]
    if isinstance(wartosc, dict):
        return [t for k, v in wartosc.items() if k not in pomin for t in _teksty(v, pomin=pomin)]
    return []


def _bez_tekstu_biblioteki(teksty: list[str]) -> None:
    assert teksty, "odpowiedź bez treści"
    for tekst in teksty:
        for fragment in FRAGMENTY_BIBLIOTEKI:
            assert fragment not in tekst, (fragment, tekst)


def _nowy_przypadek(client) -> str:
    projekt = client.post("/api/projects", json={"name": "Walidacja po polsku"})
    assert projekt.status_code == 201, projekt.text
    przypadek = client.post(
        "/api/study-cases", json={"project_id": projekt.json()["id"], "name": "Przypadek"}
    )
    assert przypadek.status_code == 201, przypadek.text
    return str(przypadek.json()["id"])


# ---------------------------------------------------------------------------
# Droga 1: handler globalny `RequestValidationError` × trasa × rodzaj błędu
# ---------------------------------------------------------------------------

#: (trasa, metoda, ciało albo surowy tekst, oczekiwany rodzaj, oczekiwana ścieżka, treść).
#: ``{case}`` = realny przypadek; ``None`` w treści = pole spoza słownika („wartość …").
PRZYPADKI_HANDLERA: list[tuple[str, str, Any, str, tuple[Any, ...], str]] = [
    # brak pola × dwie trasy
    (
        "/api/dynamika/study-cases/{case}/scenariusze",
        "POST",
        {"dynamika": {}},
        "missing",
        ("body", "name"),
        "jest wymagana",
    ),
    (
        "/api/projects/{uuid}/protection-runs",
        "POST",
        {},
        "missing",
        ("body", "sc_run_id"),
        "jest wymagana",
    ),
    # zły typ tekstu / granica długości
    (
        "/api/dynamika/study-cases/{case}/scenariusze",
        "POST",
        {"name": 5, "dynamika": {}},
        "string_type",
        ("body", "name"),
        "musi być tekstem",
    ),
    (
        "/api/dynamika/study-cases/{case}/scenariusze",
        "POST",
        {"name": "", "dynamika": {}},
        "string_too_short",
        ("body", "name"),
        "nie może być puste",
    ),
    # zły typ liczby
    (
        "/api/proof/sc3f/contributions",
        "POST",
        {"snapshot": {}, "fault_node_id": "a", "scenariusz": "MAX", "t_min_s": "abc"},
        "float_parsing",
        ("body", "t_min_s"),
        "musi być liczbą",
    ),
    # pole spoza kontraktu
    (
        "/api/proof/sc3f/contributions",
        "POST",
        {"snapshot": {}, "fault_node_id": "a", "scenariusz": "MAX", "obce": 1},
        "extra_forbidden",
        ("body", "obce"),
        "nie należy do tego formularza",
    ),
    # wartość spoza listy
    (
        "/api/proof/sc3f/contributions",
        "POST",
        {"snapshot": {}, "fault_node_id": "a", "scenariusz": "SREDNI"},
        "literal_error",
        ("body", "scenariusz"),
        "ma wartość spoza dozwolonej listy",
    ),
    # zły JSON
    (
        "/api/proof/sc3f/contributions",
        "POST",
        "{nie-json",
        "json_invalid",
        ("body", 1),
        "nie jest poprawnym zapisem JSON",
    ),
    # zły UUID w ścieżce
    (
        "/api/analysis-runs/to-nie-uuid/results/short-circuit",
        "GET",
        None,
        "uuid_parsing",
        ("path", "run_id"),
        "musi być identyfikatorem UUID",
    ),
]


@pytest.mark.parametrize(
    ("trasa", "metoda", "cialo", "rodzaj", "sciezka", "tresc"),
    PRZYPADKI_HANDLERA,
    ids=[f"{p[3]}@{p[0].split('/')[2]}" for p in PRZYPADKI_HANDLERA],
)
def test_handler_globalny_oddaje_polski_komunikat(
    app_client, trasa: str, metoda: str, cialo: Any, rodzaj: str, sciezka: tuple, tresc: str
) -> None:
    url = trasa.format(case=_nowy_przypadek(app_client) if "{case}" in trasa else "", uuid=uuid4())
    if isinstance(cialo, str):
        odpowiedz = app_client.request(
            metoda, url, content=cialo, headers={"Content-Type": "application/json"}
        )
    else:
        odpowiedz = app_client.request(metoda, url, json=cialo)

    assert odpowiedz.status_code == 422, odpowiedz.text
    tresc_json = odpowiedz.json()
    pozycje = tresc_json["detail"]
    pasujace = [p for p in pozycje if tuple(p["loc"]) == sciezka]
    assert pasujace, pozycje
    assert pasujace[0]["type"] == rodzaj
    assert tresc in pasujace[0]["msg"], pasujace[0]["msg"]
    # Kształt pozycji zgodny ze schematem `HTTPValidationError` OpenAPI — bez echa wejścia
    # i kontekstu biblioteki.
    assert set(pasujace[0]) == {"type", "loc", "msg"}
    assert tresc_json["error_type"] == "RequestValidationError"
    _bez_tekstu_biblioteki(_teksty(tresc_json, pomin=frozenset({"loc", "type", "request_id"})))


# ---------------------------------------------------------------------------
# Droga 2: jawne `exc.errors()` harmonogramu dynamiki × rodzaj błędu
# ---------------------------------------------------------------------------

PRZYPADKI_HARMONOGRAMU: list[tuple[dict[str, Any], str, str]] = [
    ({"krok_wyjscia_s": 0.01}, "horyzont_s", "jest wymagana"),
    ({"horyzont_s": "abc", "krok_wyjscia_s": 0.01}, "horyzont_s", "musi być liczbą"),
    ({"horyzont_s": -1.0, "krok_wyjscia_s": 0.01}, "horyzont_s", "musi być większa od 0"),
    ({"horyzont_s": 1.0, "krok_wyjscia_s": 0.01, "obce": 1}, "obce", "nie należy do tego"),
    ({"horyzont_s": 1.0, "krok_wyjscia_s": 0.01, "zdarzenia": "x"}, "zdarzenia", "musi być"),
]


@pytest.mark.parametrize(("dynamika", "pole", "tresc"), PRZYPADKI_HARMONOGRAMU)
def test_harmonogram_dynamiki_po_polsku(app_client, dynamika, pole: str, tresc: str) -> None:
    case_id = _nowy_przypadek(app_client)
    odpowiedz = app_client.post(
        f"/api/dynamika/study-cases/{case_id}/scenariusze",
        json={"name": "Scenariusz", "dynamika": dynamika},
    )

    assert odpowiedz.status_code == 422, odpowiedz.text
    bledy = odpowiedz.json()["detail"]
    pasujace = [b for b in bledy if b["pole"] == pole]
    assert pasujace, bledy
    assert tresc in pasujace[0]["komunikat"], pasujace[0]["komunikat"]
    assert set(pasujace[0]) == {"pole", "komunikat"}
    _bez_tekstu_biblioteki(_teksty(bledy))


# ---------------------------------------------------------------------------
# Droga 3: migawka ENM z żądania (pakiet dowodowy, wkłady) × rodzaj błędu
# ---------------------------------------------------------------------------

PRZYPADKI_MIGAWKI: list[tuple[dict[str, Any], str]] = [
    ({"buses": "x"}, "musi być listą"),
    ({"buses": [{"ref_id": "b1", "name": "B1", "voltage_kv": "abc"}]}, "musi być liczbą"),
    ({"buses": [{"ref_id": "b1", "name": "B1"}]}, "jest wymagana"),
]


@pytest.mark.parametrize(("migawka", "tresc"), PRZYPADKI_MIGAWKI)
def test_migawka_wkladow_zwarciowych_po_polsku(app_client, migawka, tresc: str) -> None:
    odpowiedz = app_client.post(
        "/api/proof/sc3f/contributions",
        json={"snapshot": migawka, "fault_node_id": "b1", "scenariusz": "MAX"},
    )

    assert odpowiedz.status_code == 422, odpowiedz.text
    detail = odpowiedz.json()["detail"]
    assert detail.startswith("Nie udało się wyznaczyć wkładów zwarciowych: "), detail
    assert tresc in detail, detail
    _bez_tekstu_biblioteki([detail])


# ---------------------------------------------------------------------------
# Droga 4: sekcje `parameters` analizy akademickiej × rodzaj błędu
# ---------------------------------------------------------------------------

PRZYPADKI_V126: list[tuple[dict[str, Any], str]] = [
    ({"earthing": {"length_m": "abc"}}, "„Długość uziomu” musi być liczbą"),
    (
        {"earthing": {"split_factor": 1.5}},
        "„Współczynnik podziału prądu” nie może być większa od 1",
    ),
    ({"motors": [{"ref": "M1", "rated_kw": "abc"}]}, "„Moc znamionowa” musi być liczbą"),
    ({"motors": [{"ref": "M1"}]}, "Dane silnika niezgodne z kontraktem"),
]


@pytest.mark.parametrize(("parametry", "tresc"), PRZYPADKI_V126)
def test_parametry_analizy_akademickiej_po_polsku(parametry, tresc: str) -> None:
    from api.v126_academic import _with_parameter_payloads
    from solver_input.v126_contracts import V126AcademicInput

    with pytest.raises(OdmowaDanychError) as odmowa:
        _with_parameter_payloads(V126AcademicInput.model_construct(), parametry)

    assert tresc in str(odmowa.value), str(odmowa.value)
    _bez_tekstu_biblioteki([str(odmowa.value)])


# ---------------------------------------------------------------------------
# Droga 5: tekst biblioteki spoza pydantic (uuid, float) × trasa
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("cialo", "strona"),
    [
        ({"run_a_id": "zly", "run_b_id": str(uuid4())}, "A"),
        ({"run_a_id": str(uuid4()), "run_b_id": "zly"}, "B"),
    ],
)
def test_porownanie_z_identyfikatorem_spoza_uuid(app_client, cialo, strona: str) -> None:
    odpowiedz = app_client.post("/api/comparison/runs", json=cialo)

    assert odpowiedz.status_code == 400, odpowiedz.text
    detail = odpowiedz.json()["detail"]
    assert detail == f"Identyfikator biegu {strona} porównania nie jest poprawnym UUID."
    _bez_tekstu_biblioteki([detail])


# ---------------------------------------------------------------------------
# Mapowanie: jedno źródło dla obu postaci błędu (pydantic i FastAPI)
# ---------------------------------------------------------------------------


class _Formularz(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dlugosc_m: float = Field(gt=0)
    nazwa: str = Field(min_length=1, max_length=5)
    liczba: int


@pytest.mark.parametrize(
    ("dane", "oczekiwane"),
    [
        ({"nazwa": "a", "liczba": 1}, "„Długość odcinka” jest wymagana"),
        ({"dlugosc_m": "x", "nazwa": "a", "liczba": 1}, "„Długość odcinka” musi być liczbą"),
        ({"dlugosc_m": 0, "nazwa": "a", "liczba": 1}, "„Długość odcinka” musi być większa od 0"),
        ({"dlugosc_m": 1, "nazwa": "abcdefg", "liczba": 1}, "nie może być dłuższe niż 5 znaków"),
        ({"dlugosc_m": 1, "nazwa": "a", "liczba": 1.5}, "musi być liczbą całkowitą"),
        ({"dlugosc_m": 1, "nazwa": "a", "liczba": 1, "x": 1}, "nie należy do tego formularza"),
    ],
)
def test_opis_bledu_i_pozycji_z_jednego_mapowania(dane, oczekiwane: str) -> None:
    with pytest.raises(ValidationError) as blad:
        _Formularz.model_validate(dane)

    opis = opis_bledu_walidacji(blad.value)
    assert oczekiwane in opis, opis
    # Ta sama treść z pozycji (droga FastAPI czyta pozycje, nie wyjątek).
    assert opis == "; ".join(dict.fromkeys(opis_pozycji_walidacji(p) for p in blad.value.errors()))
    _bez_tekstu_biblioteki([opis])


# ---------------------------------------------------------------------------
# Droga 6: warstwa aplikacji — liczby pomiarów i warunki ułożenia kabla nN
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("pomiar", "tresc"),
    [
        ({"value": "abc", "sigma": 0.01}, "Wartość pomiaru („value”) musi być liczbą."),
        ({"value": 1.0, "sigma": "x"}, "Odchylenie standardowe pomiaru („sigma”) musi być liczbą."),
        ({"value": [1], "sigma": 0.01}, "Wartość pomiaru („value”) musi być liczbą."),
    ],
)
def test_liczby_pomiarow_estymacji_po_polsku(pomiar, tresc: str) -> None:
    from application.analyses.state_estimation.service import _parse_measurements

    with pytest.raises(OdmowaDanychError) as odmowa:
        _parse_measurements([{"meas_type": "V_MAGNITUDE", "bus_ref": "b1", **pomiar}], {"b1": 0})

    assert str(odmowa.value) == tresc
    _bez_tekstu_biblioteki([str(odmowa.value)])


@pytest.mark.parametrize(
    ("warunki", "tresc"),
    [
        (
            {"insulation": "PVC", "ambient_temperature_c": 30, "circuit_count": 1},
            "brak pola „Środowisko ułożenia”",
        ),
        (
            {
                "environment": "powietrze",
                "insulation": "PVC",
                "ambient_temperature_c": "abc",
                "circuit_count": 1,
            },
            "pole „Temperatura otoczenia” ma niepoprawną wartość",
        ),
        (
            {
                "environment": "powietrze",
                "insulation": "PVC",
                "ambient_temperature_c": 30,
                "circuit_count": "dwa",
            },
            "pole „Liczba obwodów w wiązce/wykopie” ma niepoprawną wartość",
        ),
    ],
)
def test_warunki_ulozenia_kabla_nn_po_polsku(warunki, tresc: str) -> None:
    from application.analyses.nn_circuit_sheet import _iz_prime_dla_kabla
    from enm.models import Cable

    kabel = Cable(
        ref_id="k1",
        name="Kabel K1",
        from_bus_ref="b1",
        to_bus_ref="b2",
        length_km=0.1,
        r_ohm_per_km=0.2,
        x_ohm_per_km=0.08,
        materialized_params={"i_max_a": 100.0},
        meta={"cable_laying_conditions": warunki},
    )

    wiersz = _iz_prime_dla_kabla(kabel)

    assert wiersz["status"] == "nierozstrzygalne"
    assert tresc in wiersz["reason_pl"], wiersz["reason_pl"]
    _bez_tekstu_biblioteki([wiersz["reason_pl"]])


# ---------------------------------------------------------------------------
# Droga 7: rekord pola rozdzielnicy (`enm.pola`) w operacji zmiany parametrów pola
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("parametry", "tresc"),
    [
        ({"protection_codes": "50/51"}, "„Kody zabezpieczeń pola” musi być listą"),
        ({"bay_number": {"x": 1}}, "wartość musi być tekstem"),
        ({"meta": {"__klucz_meta__": 1}}, "adnotacje powielające parametry pola"),
    ],
)
def test_parametry_pola_rozdzielnicy_po_polsku(parametry, tresc: str) -> None:
    from enm.migrations.klucze_meta_pola import KLUCZE_META_ZAKAZANE

    from tests.reference_networks.scena_geometrii_stacji import zbuduj_gpz_110kv
    from tests.reference_networks.sceny_zajetosci_pol import op

    if "meta" in parametry:
        parametry = {"meta": {sorted(KLUCZE_META_ZAKAZANE)[0]: 1}}
    enm = zbuduj_gpz_110kv()
    pole_ref = enm["bays"][0]["ref_id"]

    odpowiedz = op(
        enm, "update_element_parameters", {"element_ref": pole_ref, "parameters": parametry}
    )

    assert odpowiedz["error_code"] == "params.invalid_value", odpowiedz
    assert tresc in odpowiedz["error"], odpowiedz["error"]
    assert pole_ref not in odpowiedz["error"]
    _bez_tekstu_biblioteki([odpowiedz["error"]])


# ---------------------------------------------------------------------------
# Strażnik klasy: żaden handler błędu walidacji nie wkleja surowego wyjątku do tekstu
# ---------------------------------------------------------------------------

#: Miejsca, w których surowy tekst wyjątku walidacji zostaje w komunikacie, z uzasadnieniem:
#: komunikat nie trafia do odpowiedzi API (uszkodzony zapis magazynu = błąd programu; API
#: oddaje stałe zdanie albo 500 bez treści, tekst idzie wyłącznie do dziennika).
WYJATKI_STRAZNIKA: dict[str, str] = {
    "enm/rewizje.py": "RewizjaUszkodzonaError — API oddaje 409 ze stałym zdaniem (api/enm.py)",
    "enm/scenariusze.py": "ScenariuszUszkodzonyError — uszkodzony magazyn, 500 bez treści",
}

_WALIDACJE = {"model_validate", "model_validate_json", "validate_python", "validate_json"}


def _naruszenia_klasy(*, z_wyjatkami: bool = False) -> list[str]:
    import ast
    from pathlib import Path

    src = Path(__file__).resolve().parents[2] / "src"
    naruszenia: list[str] = []
    for plik in sorted(src.rglob("*.py")):
        wzgledna = plik.relative_to(src).as_posix()
        if wzgledna.split("/")[0] not in {"api", "application", "enm", "solver_input"}:
            continue
        drzewo = ast.parse(plik.read_text(encoding="utf-8"))
        for wezel in ast.walk(drzewo):
            if not isinstance(wezel, ast.Try):
                continue
            waliduje = any(
                isinstance(n, ast.Call)
                and isinstance(n.func, ast.Attribute)
                and n.func.attr in _WALIDACJE
                for s in wezel.body
                for n in ast.walk(s)
            )
            for obsluga in wezel.handlers:
                if obsluga.name is None or obsluga.type is None:
                    continue
                typy = obsluga.type.elts if isinstance(obsluga.type, ast.Tuple) else [obsluga.type]
                nazwy = {ast.unparse(t).rsplit(".", 1)[-1] for t in typy}
                if not ("ValidationError" in nazwy or (waliduje and "ValueError" in nazwy)):
                    continue
                surowe = [
                    n
                    for s in obsluga.body
                    for n in ast.walk(s)
                    if (
                        isinstance(n, ast.Call)
                        and ast.unparse(n.func) == "str"
                        and any(isinstance(a, ast.Name) and a.id == obsluga.name for a in n.args)
                    )
                    or (
                        isinstance(n, ast.FormattedValue)
                        and isinstance(n.value, ast.Name)
                        and n.value.id == obsluga.name
                    )
                ]
                if surowe and (z_wyjatkami or wzgledna not in WYJATKI_STRAZNIKA):
                    naruszenia.append(f"{wzgledna}:{obsluga.lineno}")
    return naruszenia


def test_zaden_handler_walidacji_nie_wkleja_surowego_wyjatku() -> None:
    assert _naruszenia_klasy() == []


def test_wyjatki_straznika_sa_zywe() -> None:
    """Wpis wyjątku bez miejsca w kodzie to martwa furtka — każdy wpis ma dziś naruszenie."""
    pliki = {miejsce.split(":", 1)[0] for miejsce in _naruszenia_klasy(z_wyjatkami=True)}
    assert set(WYJATKI_STRAZNIKA) <= pliki, sorted(set(WYJATKI_STRAZNIKA) - pliki)
