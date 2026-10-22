"""Specyfikacja pól operacji (``CANONICAL_OPERATIONS``) = klucze czytane przez handler.

DLACZEGO (karta V12K-351, pomiar 2026-10-22). ``OperationSpec.required_fields`` /
``optional_fields`` deklarowały pola, których handler nie czyta (``trunk_ref``,
``segment_target``, ``station_spec``, ``target_field_ref``, ``ratio``, ``cascade``…), i
pomijały pola, które czyta — 30 z 50 operacji. Dokumentacja kontraktu
(``docs/domain/ENM_OP_CONTRACTS_CANONICAL_FULL.md``), testy walidacji i kreatory opierały się
na tej specyfikacji, a ładunek, który ją spełniał, handler odrzucał (np. „alias"
``sn_voltage_kv`` źródła GPZ, którego handler nie czyta), albo pole wysyłane z frontu
przepadało bez śladu (osadzenie agregatu/UPS w polu).

JEDNA PRAWDA: zbiór ``required ∪ optional ∪ klucze zastępcze`` każdej operacji jest RÓWNY
zbiorowi kluczy najwyższego poziomu ładunku czytanych przez handler — wyznaczonemu
analizą AST handlerów ``enm/**`` (``odczyty_ladunku_handlerow.py``), przechodnio przez
wywołania funkcji pomocniczych. Analiza jest DOMKNIĘTA: użycie ładunku, którego nie umie
przypisać do konkretnych kluczy, jest błędem testu, nie cichym pominięciem.
"""

from __future__ import annotations

import textwrap
from pathlib import Path

import pytest
from domain.canonical_operations import (
    CANONICAL_OPERATIONS,
    REQUIRED_FIELD_ALIASES,
    OperationSpec,
)

from tests.ci.odczyty_ladunku_handlerow import AnalizaEnm, handlery, odczyty_operacji

_ENM = Path(__file__).resolve().parents[2] / "src" / "enm"

#: Klucze ładunku czytane przez bramę katalogową API (``api/domain_ops_policy.py``), a nie
#: przez handler — należą do kontraktu operacji (front je wysyła, brama rozstrzyga nimi
#: odmowę). Każdy wpis ma test zachowania bramy niżej: wpis, którego brama nie czyta,
#: czerwieni ten test.
KLUCZE_BRAMY_API: dict[str, frozenset[str]] = {
    # `_uses_manual_nn_load`: jawna deklaracja trybu eksperckiego odbioru nN bez katalogu.
    "add_nn_load": frozenset({"source_mode"}),
}


def _deklarowane(op: str, spec: OperationSpec, aliasy: dict) -> set[str]:
    zastepcze = {k for wartosci in aliasy.get(op, {}).values() for k in wartosci}
    return set(spec.required_fields) | set(spec.optional_fields) | zastepcze


def rozbieznosci(
    specyfikacje: dict[str, OperationSpec],
    aliasy: dict[str, dict[str, tuple[str, ...]]],
    odczyty: dict[str, set[str]],
) -> dict[str, dict[str, list[str]]]:
    """op → {spec_nieczytane, czytane_bez_spec, ...}; pusty słownik = pełna zgodność."""
    wynik: dict[str, dict[str, list[str]]] = {}
    for op in sorted(set(specyfikacje) | set(odczyty)):
        if op not in odczyty:
            wynik[op] = {"brak_handlera": [op]}
            continue
        if op not in specyfikacje:
            wynik[op] = {"brak_specyfikacji": [op]}
            continue
        spec = specyfikacje[op]
        deklarowane = _deklarowane(op, spec, aliasy)
        roznica = {
            "spec_nieczytane": sorted(deklarowane - odczyty[op]),
            "czytane_bez_spec": sorted(odczyty[op] - deklarowane),
            "wymagane_i_opcjonalne": sorted(set(spec.required_fields) & set(spec.optional_fields)),
            "zastepcze_poza_wymaganymi": sorted(
                set(aliasy.get(op, {})) - set(spec.required_fields)
            ),
        }
        roznica = {k: v for k, v in roznica.items() if v}
        if roznica:
            wynik[op] = roznica
    return wynik


@pytest.fixture(scope="module")
def odczyty_handlerow() -> tuple[dict[str, set[str]], dict[str, set[str]]]:
    analiza = AnalizaEnm(_ENM)
    klucze: dict[str, set[str]] = {}
    dynamiczne: dict[str, set[str]] = {}
    for op, (plik, funkcja) in handlery(analiza).items():
        odczyty = odczyty_operacji(analiza, plik, funkcja)
        klucze[op] = odczyty.klucze | KLUCZE_BRAMY_API.get(op, frozenset())
        dynamiczne[op] = odczyty.dynamiczne | {f"znacznik {z}" for z in odczyty.znaczniki}
    return klucze, dynamiczne


def test_analiza_domknieta_bez_odczytow_dynamicznych(odczyty_handlerow) -> None:
    _, dynamiczne = odczyty_handlerow
    niedomkniete = {op: sorted(d) for op, d in dynamiczne.items() if d}
    assert niedomkniete == {}, (
        "Handler używa ładunku w sposób, którego analiza nie przypisuje do kluczy — "
        "zapisz odczyt jawnie (payload.get('klucz'), stała krotka kluczy) zamiast "
        f"przekazywać/iterować ładunek: {niedomkniete}"
    )


def test_specyfikacja_kazdej_operacji_rowna_odczytom_handlera(odczyty_handlerow) -> None:
    klucze, _ = odczyty_handlerow
    assert set(klucze) == set(CANONICAL_OPERATIONS)
    assert rozbieznosci(CANONICAL_OPERATIONS, REQUIRED_FIELD_ALIASES, klucze) == {}


def test_klucz_bramy_api_zmienia_werdykt_bramy() -> None:
    """``source_mode`` odbioru nN czyta brama: bez niego odbiór bez katalogu to odmowa,
    z deklaracją trybu eksperckiego — przepuszczenie."""
    from api.domain_ops_policy import validate_and_materialize_catalog_binding

    assert KLUCZE_BRAMY_API == {"add_nn_load": frozenset({"source_mode"})}
    bez, _ = validate_and_materialize_catalog_binding("add_nn_load", {"feeder_ref": "pole"})
    assert bez is not None and bez.code == "catalog.ref_required"
    z_deklaracja, _ = validate_and_materialize_catalog_binding(
        "add_nn_load", {"feeder_ref": "pole", "source_mode": "EKSPERCKI_RECZNY"}
    )
    assert z_deklaracja is None


# -- iniekcje: mechanizm porównania i analizy musi WYKRYWAĆ rozjazd ---------------------


def test_iniekcja_pole_fantomowe_w_specyfikacji_wykryte(odczyty_handlerow) -> None:
    klucze, _ = odczyty_handlerow
    spec = CANONICAL_OPERATIONS["add_ct"]
    zatruta = {
        **CANONICAL_OPERATIONS,
        "add_ct": OperationSpec(
            canonical_name=spec.canonical_name,
            category=spec.category,
            description_pl=spec.description_pl,
            target_layer=spec.target_layer,
            required_fields=spec.required_fields,
            optional_fields=(*spec.optional_fields, "target_field_ref"),
        ),
    }
    assert rozbieznosci(zatruta, REQUIRED_FIELD_ALIASES, klucze) == {
        "add_ct": {"spec_nieczytane": ["target_field_ref"]}
    }


def test_iniekcja_pole_czytane_bez_specyfikacji_wykryte(odczyty_handlerow) -> None:
    klucze, _ = odczyty_handlerow
    zatrute = {**klucze, "delete_element": klucze["delete_element"] | {"cascade"}}
    assert rozbieznosci(CANONICAL_OPERATIONS, REQUIRED_FIELD_ALIASES, zatrute) == {
        "delete_element": {"czytane_bez_spec": ["cascade"]}
    }


def test_iniekcja_klucz_zastepczy_bez_odczytu_wykryty(odczyty_handlerow) -> None:
    klucze, _ = odczyty_handlerow
    zatrute = {**REQUIRED_FIELD_ALIASES, "add_grid_source_sn": {"voltage_kv": ("sn_voltage_kv",)}}
    assert rozbieznosci(CANONICAL_OPERATIONS, zatrute, klucze) == {
        "add_grid_source_sn": {"spec_nieczytane": ["sn_voltage_kv"]}
    }


def _analiza_syntetyczna(tmp_path: Path, zrodlo: str) -> tuple[set[str], set[str]]:
    katalog = tmp_path / "enm"
    katalog.mkdir()
    (katalog / "domain_operations.py").write_text(textwrap.dedent(zrodlo), encoding="utf-8")
    (katalog / "domain_operations_v2.py").write_text("ALL_V2_HANDLERS = {}\n", encoding="utf-8")
    analiza = AnalizaEnm(katalog)
    plik, funkcja = handlery(analiza)["op"]
    odczyty = odczyty_operacji(analiza, plik, funkcja)
    return odczyty.klucze, odczyty.dynamiczne


def test_analiza_widzi_odczyty_posrednie(tmp_path: Path) -> None:
    """Każda forma odczytu, którą handlery stosują, daje KONKRETNE klucze."""
    klucze, dynamiczne = _analiza_syntetyczna(
        tmp_path,
        """
        KLUCZE = ("a", "b")
        ZBIOR = frozenset({"c"})

        def _pomoc(ladunek, klucz, *dodatkowe, domyslny="d"):
            wynik = [ladunek.get(klucz), ladunek.get(domyslny)]
            for k in dodatkowe:
                wynik.append(ladunek[k])
            return wynik

        def _pochodny(ladunek):
            return ladunek.get("e"), ladunek.get("nadpisany")

        def op(enm, payload):
            kopia = dict(payload)
            kopia.get("f")
            {k: payload[k] for k in KLUCZE if k in payload}
            for zrodlo in (enm, payload):
                zrodlo.get("g")
            if "h" in payload:
                pass
            payload.get(f"t_{1}_n")
            _pomoc(payload, "i", "j", *ZBIOR)
            _pochodny({**payload, "nadpisany": 1})
            return isinstance(payload, dict)

        _HANDLERS = {"op": op}
        """,
    )
    assert dynamiczne == set()
    assert klucze == {"a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "t_{1}_n"}


@pytest.mark.parametrize(
    "uzycie",
    [
        "zewnetrzna(payload)",  # funkcja spoza enm — odczyty nieznane
        "list(payload.items())",  # iteracja po kluczach
        "zewnetrzna(**payload)",  # rozpakowanie w wywołaniu
        "kontener = [payload]",  # ucieczka do kolekcji
        "payload.get(nazwa_z_zewnatrz())",  # klucz niestały
    ],
)
def test_analiza_zglasza_uzycie_nieprzypisane(tmp_path: Path, uzycie: str) -> None:
    _, dynamiczne = _analiza_syntetyczna(
        tmp_path,
        f"""
        def op(enm, payload):
            {uzycie}

        _HANDLERS = {{"op": op}}
        """,
    )
    assert dynamiczne, f"analiza nie zgłosiła użycia: {uzycie}"
