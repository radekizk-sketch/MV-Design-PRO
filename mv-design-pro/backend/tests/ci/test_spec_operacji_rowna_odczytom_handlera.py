"""Specyfikacja pól operacji (``CANONICAL_OPERATIONS``) = klucze czytane przez handler.

DLACZEGO (karta V12K-352, pomiar 2026-10-22). ``OperationSpec.required_fields`` /
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
from collections.abc import Mapping
from pathlib import Path

import pytest
from domain.canonical_operations import (
    _WIAZANIE_KATALOGOWE,
    CANONICAL_OPERATIONS,
    KSZTALTY_ZAGNIEZDZONE,
    REQUIRED_FIELD_ALIASES,
    KsztaltObiektu,
    OperationSpec,
)
from network_model.catalog.types import CatalogBinding

from tests.ci.odczyty_ladunku_handlerow import AnalizaEnm, Odczyty, handlery, odczyty_operacji

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


#: Obiekty zagnieżdżone, których odczytów analiza nie domyka — NIE mają kształtu w
#: ``KSZTALTY_ZAGNIEZDZONE`` (czujnik ładunku ich nie sprawdza). Lista przypięta w obie
#: strony: obiekt domknięty na tej liście albo nowy obiekt niedomknięty spoza niej czerwieni
#: test. Przyczyny merytoryczne — każdy z tych obiektów ma WŁASNĄ kontrolę kluczy albo
#: kształt wyznacza dana, nie kod.
OBIEKTY_BEZ_KSZTALTU: dict[str, str] = {
    # `rozbieznosci_tabliczki` porównuje zadeklarowane dane tabliczki z KLUCZAMI POZYCJI
    # KATALOGU (iteracja po kluczach pozycji) — zbiór kluczy wyznacza pozycja katalogu.
    "add_converter_source.materialized_params": "klucze wyznacza pozycja katalogu",
    # Parametry elementu: handler sam odmawia kluczy spoza listy parametrów kolekcji
    # (`KOLEKCJE_Z_LISTA_PARAMETROW`) albo spoza pól kontraktu elementu
    # (`KOLEKCJE_Z_KONTRAKTEM_POL`, `params.key_not_allowed`).
    "update_element_parameters.parameters": "handler odmawia kluczy spoza listy",
    # Sekcja GPZ: handler odmawia kluczy spoza listy (`gpz_section.update.disallowed_keys`).
    "update_gpz_section.updates": "handler odmawia kluczy spoza listy",
}


def _obiekt(odczyty: Odczyty) -> bool:
    """Wartość czytana jak słownik (napis z ``"." in ref`` nie jest obiektem)."""
    return odczyty.slownikowy and bool(odczyty.klucze)


def _wiazanie(klucz: str) -> bool:
    return klucz.endswith("catalog_binding")


def rozbieznosci_ksztaltow(
    ksztalty: dict[str, dict[str, KsztaltObiektu]],
    odczyty: dict[str, Odczyty],
    bez_ksztaltu: dict[str, str],
    wiazanie: KsztaltObiektu = _WIAZANIE_KATALOGOWE,
) -> dict[str, list[str]]:
    """ścieżka → rozbieżności kształtu zadeklarowanego i odczytów handlera (pusty = zgodność)."""
    wynik: dict[str, list[str]] = {}
    otwarte: set[str] = set()
    odczyty_wiazan: set[str] = set()

    def porownaj(sciezka: str, zadeklarowane: Mapping[str, KsztaltObiektu], od: Odczyty) -> None:
        widziane: set[str] = set()
        for klucz in sorted(od.zagniezdzone):
            pod = od.zagniezdzone[klucz]
            if not _obiekt(pod):
                continue
            s = f"{sciezka}.{klucz}"
            widziane.add(klucz)
            ksztalt = zadeklarowane.get(klucz)
            if _wiazanie(klucz):
                odczyty_wiazan.update(pod.klucze)
                if ksztalt is not wiazanie:
                    wynik.setdefault(s, []).append("wiązanie bez kształtu wiązania katalogowego")
                elif pod.klucze - wiazanie.pola:
                    wynik.setdefault(s, []).append(
                        f"czytane spoza wiązania: {sorted(pod.klucze - wiazanie.pola)}"
                    )
                continue
            if pod.dynamiczne:
                otwarte.add(s)
                if ksztalt is not None:
                    wynik.setdefault(s, []).append(
                        "kształt obiektu, którego odczytów analiza nie domyka"
                    )
                continue
            if ksztalt is None:
                wynik.setdefault(s, []).append(f"obiekt bez kształtu: {sorted(pod.klucze)}")
                continue
            if ksztalt.pola - pod.klucze:
                wynik.setdefault(s, []).append(
                    f"kształt nieczytany: {sorted(ksztalt.pola - pod.klucze)}"
                )
            if pod.klucze - ksztalt.pola:
                wynik.setdefault(s, []).append(
                    f"czytane bez kształtu: {sorted(pod.klucze - ksztalt.pola)}"
                )
            porownaj(s, ksztalt.zagniezdzone, pod)
        for klucz in sorted(set(zadeklarowane) - widziane):
            wynik.setdefault(f"{sciezka}.{klucz}", []).append(
                "kształt obiektu, którego handler nie czyta"
            )

    for op in sorted(set(odczyty) | set(ksztalty)):
        porownaj(op, ksztalty.get(op, {}), odczyty.get(op, Odczyty()))
    for s in sorted(otwarte ^ set(bez_ksztaltu)):
        wynik.setdefault(s, []).append(
            "obiekt niedomknięty spoza listy OBIEKTY_BEZ_KSZTALTU"
            if s in otwarte
            else "wpis OBIEKTY_BEZ_KSZTALTU dla obiektu domkniętego albo nieistniejącego"
        )
    pola_wiazania = set(CatalogBinding("", "", "").to_dict()) | odczyty_wiazan
    if wiazanie.pola != pola_wiazania:
        wynik["wiazanie_katalogowe"] = [
            f"kształt {sorted(wiazanie.pola)} != CatalogBinding ∪ odczyty {sorted(pola_wiazania)}"
        ]
    return wynik


@pytest.fixture(scope="module")
def odczyty_pelne() -> dict[str, Odczyty]:
    analiza = AnalizaEnm(_ENM)
    return {
        op: odczyty_operacji(analiza, plik, funkcja)
        for op, (plik, funkcja) in handlery(analiza).items()
    }


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


def test_ksztalty_zagniezdzone_rowne_odczytom_handlera(odczyty_pelne) -> None:
    assert rozbieznosci_ksztaltow(KSZTALTY_ZAGNIEZDZONE, odczyty_pelne, OBIEKTY_BEZ_KSZTALTU) == {}


def _z_polami(ksztalt: KsztaltObiektu, pola: set[str]) -> KsztaltObiektu:
    return KsztaltObiektu(pola=frozenset(pola), zagniezdzone=ksztalt.zagniezdzone)


def test_iniekcja_ksztalt_poziomu_1_z_polem_fantomowym_wykryta(odczyty_pelne) -> None:
    segment = KSZTALTY_ZAGNIEZDZONE["continue_trunk_segment_sn"]["segment"]
    zatrute = {
        **KSZTALTY_ZAGNIEZDZONE,
        "continue_trunk_segment_sn": {
            **KSZTALTY_ZAGNIEZDZONE["continue_trunk_segment_sn"],
            "segment": _z_polami(segment, set(segment.pola) | {"segment_kind"}),
        },
    }
    assert rozbieznosci_ksztaltow(zatrute, odczyty_pelne, OBIEKTY_BEZ_KSZTALTU) == {
        "continue_trunk_segment_sn.segment": ["kształt nieczytany: ['segment_kind']"]
    }


def test_iniekcja_ksztalt_poziomu_2_bez_pola_czytanego_wykryta(odczyty_pelne) -> None:
    stacja = KSZTALTY_ZAGNIEZDZONE["insert_station_on_segment_sn"]["station"]
    rozdzielnica = stacja.zagniezdzone["switchgear"]
    zatrute = {
        **KSZTALTY_ZAGNIEZDZONE,
        "insert_station_on_segment_sn": {
            **KSZTALTY_ZAGNIEZDZONE["insert_station_on_segment_sn"],
            "station": KsztaltObiektu(
                pola=stacja.pola,
                zagniezdzone={
                    **stacja.zagniezdzone,
                    "switchgear": _z_polami(
                        rozdzielnica, set(rozdzielnica.pola) - {"manufacturer_ref"}
                    ),
                },
            ),
        },
    }
    assert rozbieznosci_ksztaltow(zatrute, odczyty_pelne, OBIEKTY_BEZ_KSZTALTU) == {
        "insert_station_on_segment_sn.station.switchgear": [
            "czytane bez kształtu: ['manufacturer_ref']"
        ]
    }


def test_iniekcja_obiekt_czytany_bez_ksztaltu_i_lista_niedomknietych_wykryte(
    odczyty_pelne,
) -> None:
    bez_segmentu = {
        **KSZTALTY_ZAGNIEZDZONE,
        "connect_secondary_ring_sn": {
            k: v
            for k, v in KSZTALTY_ZAGNIEZDZONE["connect_secondary_ring_sn"].items()
            if k != "segment"
        },
    }
    wynik = rozbieznosci_ksztaltow(bez_segmentu, odczyty_pelne, OBIEKTY_BEZ_KSZTALTU)
    assert list(wynik) == ["connect_secondary_ring_sn.segment"]
    assert wynik["connect_secondary_ring_sn.segment"][0].startswith("obiekt bez kształtu")
    lista = {**OBIEKTY_BEZ_KSZTALTU, "add_relay.protection": "fikcja"}
    assert rozbieznosci_ksztaltow(KSZTALTY_ZAGNIEZDZONE, odczyty_pelne, lista) == {
        "add_relay.protection": [
            "wpis OBIEKTY_BEZ_KSZTALTU dla obiektu domkniętego albo nieistniejącego"
        ]
    }


def test_iniekcja_wiazanie_z_kluczem_spoza_catalog_binding_wykryte(odczyty_pelne) -> None:
    zatrute = KsztaltObiektu(pola=_WIAZANIE_KATALOGOWE.pola | {"item_id"})
    wynik = rozbieznosci_ksztaltow(
        KSZTALTY_ZAGNIEZDZONE, odczyty_pelne, OBIEKTY_BEZ_KSZTALTU, wiazanie=zatrute
    )
    # Każde wiązanie ma teraz kształt inny niż zadeklarowany wspólny, a kształt wspólny
    # ma klucz, którego nie czyta ani brama, ani handler.
    assert "wiazanie_katalogowe" in wynik


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

        def _wybor_klucza(strona):
            # Klucz zależny od strony — ciało to jedno wyrażenie stałe.
            return "k_wn" if strona == "WN" else "k_sn"

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
            wybrany = _wybor_klucza(enm)
            payload.get(wybrany)
            payload.get("l_wn" if enm else "l_sn")
            return isinstance(payload, dict)

        _HANDLERS = {"op": op}
        """,
    )
    assert dynamiczne == set()
    assert klucze == {
        "a",
        "b",
        "c",
        "d",
        "e",
        "f",
        "g",
        "h",
        "i",
        "j",
        "t_{1}_n",
        "k_wn",
        "k_sn",
        "l_wn",
        "l_sn",
    }


@pytest.mark.parametrize(
    "uzycie",
    [
        "zewnetrzna(payload)",  # funkcja spoza enm — odczyty nieznane
        "list(payload.items())",  # iteracja po kluczach
        "zewnetrzna(**payload)",  # rozpakowanie w wywołaniu
        "kontener = [payload]",  # ucieczka do kolekcji
        "payload.get(nazwa_z_zewnatrz())",  # klucz niestały
        "payload.get('a' if enm else nazwa_z_zewnatrz())",  # gałąź warunku niestała
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
