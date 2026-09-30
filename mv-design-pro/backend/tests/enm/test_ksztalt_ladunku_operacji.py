"""Operacje domenowe bez połykania wyjątków (karta #151).

Dyspozytor `execute_domain_operation` miał `except Exception` → odpowiedź 200
`dispatcher.unhandled_exception` („błąd wewnętrzny systemu"): KAŻDY błąd programu w
handlerze znikał z toku (zostawał tylko wpis w dzienniku), a ładunek o złym typie pola
(napis zamiast liczby, napis zamiast słownika odcinka) był nieodróżnialny od defektu.
Po karcie: odmowę danych handler zwraca sam (`payload.invalid_type` dla pola o złym
typie), a wyjątek dociera do wołającego (500 + pełny ślad).

Iloczyn cech sondy: {każdy handler z rejestru} × {model: pusty, z GPZ, z GPZ i
odcinkiem magistrali, magistrala z wciętą stacją z szablonu} × {kształt ładunku: każde
czytane pole osobno i wszystkie naraz, także zagnieżdżone w słownikach odcinka/stacji/
transformatora, z odwołaniami do istniejących szyn, gałęzi, stacji i pól albo bez, z
`element_ref` wskazującym po kolei każdy rodzaj elementu modelu} × {wartość złego typu: napis, lista, słownik, liczba
ujemna, wartość logiczna, `None`}. Wynik: odpowiedź (sukces albo odmowa z kodem) — nigdy
wyjątek.
"""

from __future__ import annotations

import ast
import copy
import inspect
import textwrap
from typing import Any

import pytest
from enm import domain_operations
from enm.domain_operations import (
    KOD_MODELU_NIEZGODNEGO_Z_KONTRAKTEM,
    KOD_TYPU_POLA_LADUNKU,
    execute_domain_operation,
)
from enm.katalog_projektu import kontekst_katalogu
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from enm.rejestr_operacji import HANDLERY
from enm.slownik_komunikatow import nazwa_pola

from tests.catalog_test_helpers import gpz_payload

ZLE_WARTOSCI: tuple[Any, ...] = ("abc", [1], {"a": 1}, -1.0, True, None)
POLA_ZAGNIEZDZONE = (
    "segment",
    "station",
    "transformer",
    "nn_block",
    "insert_at",
    "parameters",
    "profile",
    "from_terminal",
    "catalog_binding",
)
POLA_ODWOLAN = (
    "from_bus_ref",
    "to_bus_ref",
    "bus_ref",
    "endpoint_bus_ref",
    "element_ref",
    "ref_id",
    "from_ref",
    "segment_id",
    "segment_ref",
    "station_ref",
    "substation_ref",
    "bay_ref",
    "field_ref",
)
#: Kolekcje modelu, z których pole `element_ref`/`ref_id` dostaje ISTNIEJĄCY element —
#: każdy rodzaj osobno, żeby handler przeszedł walidację odwołania i doszedł do pól.
KOLEKCJE_ELEMENTOW = (
    "buses",
    "branches",
    "transformers",
    "sources",
    "loads",
    "generators",
    "substations",
    "bays",
)


def _pusty() -> dict[str, Any]:
    return EnergyNetworkModel(
        header=ENMHeader(name="sonda", defaults=ENMDefaults(sn_nominal_kv=15.0))
    ).model_dump(mode="json")


def _z_gpz() -> dict[str, Any]:
    wynik = execute_domain_operation(
        _pusty(), "add_grid_source_sn", gpz_payload(voltage_kv=15.0, sk3_mva=250.0, rx_ratio=0.1)
    )
    assert wynik.get("snapshot") is not None, wynik.get("error")
    return wynik["snapshot"]


def _z_odcinkiem() -> dict[str, Any]:
    wynik = execute_domain_operation(
        _z_gpz(),
        "continue_trunk_segment_sn",
        {"segment": {"rodzaj": "KABEL", "dlugosc_m": 500, "catalog_ref": "cable-tfk-yakxs-3x120"}},
    )
    assert wynik.get("snapshot") is not None, wynik.get("error")
    return wynik["snapshot"]


def _ze_stacja() -> dict[str, Any]:
    """Magistrala z wciętą stacją SN/nN (szablon katalogowy) — pola, transformator, nN."""
    from enm.store import get_enm

    from tests.application.station_templates.test_v12t016_rola_a_c_e import _zastosuj

    _, klucz = _zastosuj("tpl_abonencka_250kva_pomiar", 15.0, klucz_suffix="-sonda-ladunku")
    return get_enm(klucz).model_dump(mode="json")


def _pierwszy_ref(model: dict[str, Any], kolekcja: str, zapas: str) -> str:
    elementy = model.get(kolekcja) or []
    return str(elementy[0]["ref_id"]) if elementy else zapas


def _zestawy_odwolan(model: dict[str, Any]) -> list[dict[str, str]]:
    szyna = _pierwszy_ref(model, "buses", "brak")
    galaz = _pierwszy_ref(model, "branches", szyna)
    stacja = _pierwszy_ref(model, "substations", szyna)
    pole_sn = _pierwszy_ref(model, "bays", szyna)
    baza = {
        k: (
            galaz
            if k.startswith("segment")
            else stacja if "station" in k else pole_sn if k in ("bay_ref", "field_ref") else szyna
        )
        for k in POLA_ODWOLAN
    }
    zestawy = []
    for kolekcja in KOLEKCJE_ELEMENTOW:
        element = _pierwszy_ref(model, kolekcja, szyna)
        zestawy.append({**baza, "element_ref": element, "ref_id": element})
    return zestawy


def _czytane_klucze(handler: Any) -> list[str]:
    """Klucze napisowe czytane przez handler (`x.get("k")`, `x["k"]`) — z AST źródła."""
    drzewo = ast.parse(textwrap.dedent(inspect.getsource(handler)))
    klucze: set[str] = set()
    for wezel in ast.walk(drzewo):
        if (
            isinstance(wezel, ast.Call)
            and isinstance(wezel.func, ast.Attribute)
            and wezel.func.attr == "get"
            and wezel.args
            and isinstance(wezel.args[0], ast.Constant)
            and isinstance(wezel.args[0].value, str)
        ):
            klucze.add(wezel.args[0].value)
        if (
            isinstance(wezel, ast.Subscript)
            and isinstance(wezel.slice, ast.Constant)
            and isinstance(wezel.slice.value, str)
        ):
            klucze.add(wezel.slice.value)
    return sorted(klucze)


def _warianty(handler: Any, zestawy: list[dict[str, str]]) -> list[dict[str, Any]]:
    klucze = _czytane_klucze(handler)
    warianty: list[dict[str, Any]] = []
    for zla in ZLE_WARTOSCI:
        warianty.append({k: copy.deepcopy(zla) for k in klucze})
        for klucz in klucze:
            warianty.append({klucz: copy.deepcopy(zla)})
            for odwolania in zestawy:
                warianty.append({**odwolania, klucz: copy.deepcopy(zla)})
                for pole_zagniezdzone in POLA_ZAGNIEZDZONE:
                    if pole_zagniezdzone in klucze and pole_zagniezdzone != klucz:
                        warianty.append(
                            {**odwolania, pole_zagniezdzone: {klucz: copy.deepcopy(zla)}}
                        )
    return warianty


@pytest.fixture(scope="module")
def modele() -> list[dict[str, Any]]:
    return [_pusty(), _z_gpz(), _z_odcinkiem(), _ze_stacja()]


@pytest.mark.parametrize("nazwa", sorted(HANDLERY))
def test_handler_nie_rzuca_wyjatku_dla_zlego_ksztaltu_ladunku(
    nazwa: str, modele: list[dict[str, Any]]
) -> None:
    handler = HANDLERY[nazwa]
    bledy: list[str] = []
    for model in modele:
        for ladunek in _warianty(handler, _zestawy_odwolan(model)):
            try:
                with kontekst_katalogu(model):
                    wynik = handler(copy.deepcopy(model), copy.deepcopy(ladunek))
            except Exception as blad:  # noqa: BLE001 — sonda ZBIERA wyjątki, żeby je nazwać
                bledy.append(f"{type(blad).__name__}: {blad} — ładunek {ladunek!r}"[:300])
                continue
            assert isinstance(wynik, dict)
    assert not bledy, bledy[:5]


@pytest.mark.parametrize(
    ("operacja", "ladunek", "klucz"),
    [
        ("add_grid_source_sn", {"voltage_kv": "abc"}, "voltage_kv"),
        ("add_grid_source_sn", {"sections_count": "dwa"}, "sections_count"),
        ("continue_trunk_segment_sn", {"segment": "abc"}, "segment"),
        ("continue_trunk_segment_sn", {"segment": {"dlugosc_m": "abc"}}, "dlugosc_m"),
        ("start_branch_segment_sn", {"segment": [1]}, "segment"),
        ("start_branch_segment_sn", {"dlugosc_m": "abc"}, "dlugosc_m"),
        ("connect_secondary_ring_sn", {"from_bus_ref": ["a"], "to_bus_ref": "b"}, "from_bus_ref"),
        ("connect_secondary_ring_sn", {"from_bus_ref": "a", "to_bus_ref": {"x": 1}}, "to_bus_ref"),
        ("connect_secondary_ring_sn", {"segment": "abc"}, "segment"),
        ("insert_station_on_segment_sn", {"sn_fields": 5.0}, "sn_fields"),
        ("insert_station_on_segment_sn", {"station": "abc"}, "station"),
        ("insert_station_on_segment_sn", {"transformer": [1]}, "transformer"),
        ("insert_station_on_segment_sn", {"nn_block": "abc"}, "nn_block"),
        ("insert_station_on_segment_sn", {"insert_at": "abc"}, "insert_at"),
        ("append_station_on_endpoint", {"station": "abc"}, "station"),
        ("append_station_on_endpoint", {"transformer": "abc"}, "transformer"),
        ("update_element_parameters", {"element_ref": "x", "parameters": "abc"}, "parameters"),
        ("add_sn_bay", {"tags": 5.0}, "tags"),
        ("add_load_sn", {"active_power_kw": "abc"}, "active_power_kw"),
        ("add_load_sn", {"p_mw": "abc"}, "p_mw"),
        ("add_generator_sn", {"p_mw": "abc"}, "p_mw"),
        ("set_dynamic_profile", {"element_ref": "x", "profile": "abc"}, "profile"),
    ],
)
def test_pole_zlego_typu_to_nazwana_odmowa_z_nazwa_pola(
    operacja: str, ladunek: dict[str, Any], klucz: str
) -> None:
    """Każda ścieżka `_odmowa_typu_ladunku` → kod `payload.invalid_type` i nazwa pola z mapy
    (klucz w kontekście operacji albo ogólny) — nigdy identyfikator kontraktu w zdaniu."""
    wynik = execute_domain_operation(_z_gpz(), operacja, ladunek)
    assert wynik["error_code"] == KOD_TYPU_POLA_LADUNKU, wynik.get("error")
    assert nazwa_pola(klucz, operacja) in wynik["error"]
    assert wynik["snapshot"] is None


def test_poprawny_typ_liczbowy_w_napisie_nie_jest_odmowa_typu() -> None:
    """`liczba_lub_tekst`: moc „1.5" w napisie była akceptowana (`float()`) i zostaje."""
    wynik = execute_domain_operation(_z_gpz(), "add_load_sn", {"p_mw": "1.5"})
    assert wynik.get("error_code") != KOD_TYPU_POLA_LADUNKU


def test_blad_programu_w_handlerze_wybucha_zamiast_odpowiedzi_200(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Obcy wyjątek z handlera dociera do wołającego (dawniej `dispatcher.unhandled_exception`)."""
    from types import MappingProxyType

    from enm import rejestr_operacji

    def _zepsuty(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
        raise AttributeError("błąd programu")

    monkeypatch.setattr(
        rejestr_operacji,
        "HANDLERY",
        MappingProxyType({**rejestr_operacji.HANDLERY, "add_grid_source_sn": _zepsuty}),
    )
    with pytest.raises(AttributeError, match="błąd programu"):
        execute_domain_operation(_pusty(), "add_grid_source_sn", {})


def test_blad_walidatora_semantyki_wybucha(monkeypatch: pytest.MonkeyPatch) -> None:
    """Dawne ciche `semantic_issues = []` meldowało „brak naruszeń semantyki"."""
    import network_model.validation as walidacja

    def _zepsuty(enm: dict[str, Any]) -> list[dict[str, Any]]:
        raise KeyError("brak klucza")

    monkeypatch.setattr(walidacja, "validate_semantic_as_dicts", _zepsuty)
    with pytest.raises(KeyError, match="brak klucza"):
        execute_domain_operation(
            _pusty(), "add_grid_source_sn", gpz_payload(voltage_kv=15.0, sk3_mva=250.0)
        )


def test_wynik_operacji_niezgodny_z_kontraktem_to_nazwana_odmowa() -> None:
    """`_response` — jedyny punkt każdego sukcesu handlera: migawka łamiąca kontrakt ENM
    daje odmowę z opisem pola i `snapshot=None` (dawniej `_build_readiness` połykał
    `ValidationError`: „nie gotowe, zero blokad", a odmowa wychodziła dopiero przy zapisie
    jako „nie udało się zapisać modelu")."""
    zepsuty = _z_gpz()
    zepsuty["buses"][0]["voltage_kv"] = "nie-liczba"
    wynik = domain_operations._response(zepsuty)
    assert wynik["error_code"] == KOD_MODELU_NIEZGODNEGO_Z_KONTRAKTEM
    assert wynik["snapshot"] is None
    assert wynik["error"].startswith("Operacja odrzucona — dane nie spełniają kontraktu")


def test_katalog_punktow_rozgalezienia_blad_programu_wybucha(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Dawniej `except Exception: return None` = „pozycji nie ma w katalogu"."""
    import network_model.catalog.mv_branch_point_catalog as katalog

    def _zepsuty() -> list[dict[str, Any]]:
        raise TypeError("błąd programu")

    monkeypatch.setattr(katalog, "get_all_branch_point_types", _zepsuty)
    with pytest.raises(TypeError, match="błąd programu"):
        domain_operations._branch_point_catalog_item("cokolwiek")


def test_katalog_punktow_rozgalezienia_brak_pozycji_to_none() -> None:
    assert domain_operations._branch_point_catalog_item("pozycja-ktorej-nie-ma") is None


@pytest.mark.parametrize("port", ["BRANCH_x", "BRANCH_", "BRANCH_1.5"])
def test_port_zksn_z_nieliczbowym_numerem_to_nazwana_odmowa(port: str) -> None:
    """`_resolve_branch_from_ref`: jedyną odmową parsowania numeru portu jest `ValueError`."""
    enm = {"branch_points": [{"ref_id": "zk", "branch_point_type": "zksn", "ports": {}}]}
    wynik = domain_operations._resolve_branch_from_ref(enm, f"zk.{port}")
    assert wynik == (None, "branch_connection.invalid_source_port")


@pytest.mark.parametrize(
    ("kolekcja", "parametry", "kod"),
    [
        ("sources", {"source_mode": ["KATALOG"]}, KOD_MODELU_NIEZGODNEGO_Z_KONTRAKTEM),
        ("sources", {"materialized_params": "abc"}, KOD_MODELU_NIEZGODNEGO_Z_KONTRAKTEM),
        ("branches", {"source_mode": ["KATALOG"]}, KOD_TYPU_POLA_LADUNKU),
        ("branches", {"catalog_namespace": {"x": 1}}, KOD_TYPU_POLA_LADUNKU),
        ("branches", {"length_km": "abc"}, KOD_MODELU_NIEZGODNEGO_Z_KONTRAKTEM),
    ],
)
def test_parametry_elementu_zlego_ksztaltu_to_nazwana_odmowa(
    kolekcja: str, parametry: dict[str, Any], kod: str
) -> None:
    """`update_element_parameters` zapisuje parametry wprost do elementu: typ pól bramy
    katalogowej sprawdza handler, zgodność wyniku z kontraktem ENM — `_response` (dawniej
    `TypeError`/`ValidationError` połykane przez dyspozytora)."""
    model = _z_odcinkiem()
    element = model[kolekcja][0]["ref_id"]
    wynik = execute_domain_operation(
        model, "update_element_parameters", {"element_ref": element, "parameters": parametry}
    )
    assert wynik["error_code"] == kod, wynik.get("error")
    assert wynik["snapshot"] is None


@pytest.mark.parametrize(
    ("ladunek", "nazwa"),
    [
        ({"station": {"station_type": ["B"]}}, "station.station_type"),
        ({"station_type": {"x": 1}}, "station.station_type"),
    ],
)
def test_rodzaj_stacji_zlego_typu_to_nazwana_odmowa(ladunek: dict[str, Any], nazwa: str) -> None:
    model = _z_odcinkiem()
    wynik = execute_domain_operation(
        model,
        "insert_station_on_segment_sn",
        {"segment_id": model["branches"][0]["ref_id"], **ladunek},
    )
    assert wynik["error_code"] == KOD_TYPU_POLA_LADUNKU, wynik.get("error")
    assert nazwa_pola(nazwa) in wynik["error"]


@pytest.mark.parametrize("klucz", ["section_id", "bus_ref", "order"])
def test_sekcja_gpz_zlego_typu_to_nazwana_odmowa(klucz: str) -> None:
    wynik = execute_domain_operation(_z_gpz(), "add_gpz_section", {klucz: [1]})
    assert wynik["error_code"] == KOD_TYPU_POLA_LADUNKU, wynik.get("error")
    assert nazwa_pola(f"gpz_section.{klucz}") in wynik["error"]
