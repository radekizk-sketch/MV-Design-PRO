"""Pola V1 (GPZ, stacja, sekcje) materializują wyposażenie PRZEZ RESOLVER katalogu.

Karta K-K-POLA-V1 — domknięcie długu z odbioru S5. Do tej karty aparaty pola
materializował w V1 wyłącznie `template_primary_devices`, który zna JEDNĄ
nomenklaturę referencji (kanoniczny szablon `bay_template_line_out`). Referencja
KATALOGOWEGO POLA RODZINY (`ZPUE_WLOSZCZOWA__RELF__LINE_OUT`) dawała po cichu
pustą listę: pole GPZ albo stacyjne wybrane z katalogu producenta zapisywało się
do ENM BEZ ANI JEDNEGO APARATU, a SLD wracał do rysowania z konwencji. S5
domknął to dla `add_sn_bay`; reszta klasy żyła w V1.

ROZSTRZYGNIĘCIE ARCHITEKTA (§0 karty). GPZ i pola stacyjne budowane pojedynczą
celką używają WYŁĄCZNIE rodzin o torze MODULARNYM (rozdzielnice pierwotne:
ZPUE RELF, ABB UniGear ZS1, Siemens NXAir). Rodziny o torze BLOK_RMU (SafeRing,
RM6, TPM) to rozdzielnice wtórne/kompaktowe — składa się je z BLOKÓW
fabrycznych, więc wskazanie pojedynczej celki takiej rodziny jest błędem
inżynierskim i kanał V1 odrzuca je twardym polskim błędem wskazującym kanał
bloków (`add_sn_bay_from_catalog` + `factory_configuration_ref`).

ILOCZYN CECH (reguła KLASA, NIE INSTANCJA §2) — testy poniżej pokrywają:
{rodzina MODULARNA → pełna kompozycja aparatów z referencjami katalogowymi}
× {rodzina BLOK_RMU → twardy błąd z kodem klasy}
× {bez wskazania katalogowego → zachowanie dotychczasowe, bajtowo}
× {GPZ · wcięcie stacji w odcinek · stacja na końcu ciągu · pole sekcji · pole nN}.

PREDYKATY PARAMI (§3): warunek ODRZUCENIA rodziny blokowej w kanale V1 i warunek
jej PRZYJĘCIA w kanale bloków pochodzą z JEDNEGO źródła — `tor_konfiguracji`
rodziny czytanego przez `rozwiaz_plan_pola`. Test
`test_ta_sama_rodzina_odrzucona_w_v1_jest_przyjeta_kanalem_blokow` pilnuje tej
pary: gdyby ktoś dopisał drugi, niezależny warunek, jedna z jego stron
rozjechałaby się na danych brzegowych.
"""

from __future__ import annotations

import ast
import copy
from pathlib import Path
from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from enm.pole_katalogowe import KOD_BLEDU_POLA_KATALOGOWEGO, pole_katalogowe
from network_model.catalog.switchgear import (
    list_switchgear_families,
    list_switchgear_solution_templates_for_manufacturer,
)

CATALOG_ZRODLO_SN = "src-gpz-15kv-250mva-rx010"
CATALOG_APARAT_SN = "sw-cb-abb-vd4-17kv-630a"
CATALOG_TRAFO = "tr-sn-nn-15-04-630kva-dyn11"
CATALOG_LINIA = "line-base-al-st-70"

#: Rodzina MODULARNA (rozdzielnica pierwotna) — dopuszczona w polach GPZ/stacji.
RODZINA_MODULARNA = "ZPUE_WLOSZCZOWA__RELF"
POLE_MODULARNE = "ZPUE_WLOSZCZOWA__RELF__LINE_OUT"
#: Rodzina BLOKOWA (RMU) — wtórna, budowana blokami fabrycznymi, nie celkami.
RODZINA_BLOKOWA = "ABB__SAFERING"
POLE_BLOKOWE = "ABB__SAFERING__LINE_OUT"
#: Referencja SPOZA katalogu rodzin — ścieżka konwencji, zachowanie dotychczasowe.
POLE_SPOZA_KATALOGU = "tpl-line-out"


def _empty_enm() -> dict[str, Any]:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="pola-v1-resolver", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    )
    return enm.model_dump(mode="json")


def _enm_z_odcinkiem() -> dict[str, Any]:
    return {
        "header": {"name": "pola-v1-resolver"},
        "buses": [
            {"ref_id": "bus-a", "name": "A", "voltage_kv": 15.0},
            {"ref_id": "bus-b", "name": "B", "voltage_kv": 15.0},
        ],
        "branches": [
            {
                "ref_id": "seg-1",
                "name": "Odcinek",
                "type": "cable",
                "from_bus_ref": "bus-a",
                "to_bus_ref": "bus-b",
                "length_km": 1.0,
                "r_ohm": 0.2,
                "x_ohm": 0.1,
            }
        ],
        "transformers": [],
        "substations": [],
        "corridors": [],
    }


def _gpz_z_koncem_ciagu() -> tuple[dict[str, Any], str]:
    """GPZ + jeden odcinek napowietrzny; zwraca (migawka, szyna końca ciągu)."""
    odpowiedz = execute_domain_operation(
        _empty_enm(),
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "sk3_mva": 250.0,
            "catalog_ref": CATALOG_ZRODLO_SN,
            # Aparat pola liniowego GPZ wskazany JAWNIE (brama katalogowa).
            "gpz_line_field_apparatus": {
                "apparatus_kind": "BREAKER",
                "catalog_binding": {
                    "catalog_namespace": "APARAT_SN",
                    "catalog_item_id": CATALOG_APARAT_SN,
                },
            },
            # Karta FAB-G: transformator WN/SN GPZ wymaga jawnej pary
            # hv_voltage_kv + transformer_sn_mva (albo transformer_catalog_ref).
            "hv_voltage_kv": 110.0,
            "transformer_sn_mva": 25.0,
        },
    )
    assert odpowiedz.get("error") in (None, ""), odpowiedz
    snap = odpowiedz["snapshot"]

    odpowiedz = execute_domain_operation(
        snap,
        "continue_trunk_segment_sn",
        {
            "segment": {
                "rodzaj": "LINIA_NAPOWIETRZNA",
                "dlugosc_m": 500.0,
                "catalog_ref": CATALOG_LINIA,
            }
        },
    )
    assert odpowiedz.get("error") in (None, ""), odpowiedz
    snap = odpowiedz["snapshot"]
    return snap, snap["branches"][-1]["to_bus_ref"]


# ---------------------------------------------------------------------------
# Budowa payloadów: JEDNA rodzina/pole wstrzykiwane w KAŻDY tor budowy pola
# ---------------------------------------------------------------------------


def _gpz(pole_ref: str | None, rodzina_ref: str | None) -> dict[str, Any]:
    """Pole GPZ (sekcja GPZ) — tor `add_grid_source_sn`."""
    bay: dict[str, Any] = {"name": "Pole odpływowe 1", "bay_role": "LINIA_ODG"}
    if pole_ref:
        bay["bay_template_ref"] = pole_ref
    payload: dict[str, Any] = {
        "source_name": "GPZ Klasy",
        "voltage_kv": 15.0,
        "catalog_ref": CATALOG_ZRODLO_SN,
        "sections_count": 1,
        "gpz_sections": [{"order": 0, "name": "Sekcja A", "bays": [bay]}],
        "grounding": {"type": "resistor_grounded", "r_ohm": 12.0},
        # Karta FAB-G: transformator WN/SN GPZ wymaga jawnej pary
        # hv_voltage_kv + transformer_sn_mva (albo transformer_catalog_ref).
        "hv_voltage_kv": 110.0,
        "transformer_sn_mva": 25.0,
    }
    if rodzina_ref:
        payload["switchgear_family_ref"] = rodzina_ref
    return payload


def _wciecie(pole_ref: str | None, rodzina_ref: str | None) -> dict[str, Any]:
    """Pole stacji WCIĘTEJ w odcinek — tor `insert_station_on_segment_sn`."""
    pole: dict[str, Any] = {"field_role": "LINIA_OUT"}
    if pole_ref:
        pole["bay_template_ref"] = pole_ref
    if rodzina_ref:
        pole["switchgear_family_ref"] = rodzina_ref
    return {
        "segment_id": "seg-1",
        "station_type": "B",
        "insert_at": {"value": 0.5},
        "station": {"sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4},
        "sn_fields": [pole],
        "field_apparatus_catalog_ref": CATALOG_APARAT_SN,
        "transformer": {"create": True, "transformer_catalog_ref": CATALOG_TRAFO},
    }


def _koniec_ciagu(pole_ref: str | None, rodzina_ref: str | None, endpoint: str) -> dict[str, Any]:
    """Pole stacji na KOŃCU ciągu — tor `append_station_on_endpoint`."""
    pole: dict[str, Any] = {"field_role": "LINIA_OUT", "bay_kind": "liniowe_odplywowe"}
    if pole_ref:
        pole["bay_template_ref"] = pole_ref
    if rodzina_ref:
        pole["switchgear_family_ref"] = rodzina_ref
    return {
        "endpoint_bus_ref": endpoint,
        "field_apparatus_catalog_ref": CATALOG_APARAT_SN,
        "station": {"name": "Stacja Końcowa", "station_type": "terminal"},
        "transformer": {"transformer_catalog_ref": CATALOG_TRAFO},
        "nn_voltage_kv": 0.4,
        "sn_fields": [pole],
    }


def _uruchom(tor: str, pole_ref: str | None, rodzina_ref: str | None) -> dict[str, Any]:
    """Uruchom wskazany tor budowy pola z zadanym wskazaniem katalogowym."""
    if tor == "gpz":
        return execute_domain_operation(
            _empty_enm(), "add_grid_source_sn", _gpz(pole_ref, rodzina_ref)
        )
    if tor == "wciecie":
        return execute_domain_operation(
            _enm_z_odcinkiem(), "insert_station_on_segment_sn", _wciecie(pole_ref, rodzina_ref)
        )
    if tor == "koniec_ciagu":
        snap, endpoint = _gpz_z_koncem_ciagu()
        # Przez DYSPOZYTOR, a nie bezpośrednim wywołaniem handlera: to jest
        # ścieżka, którą idzie API (i użytkownik). Wywołanie handlera wprost
        # omija mapowanie niezgodności katalogowej na błąd dziedziny, więc test
        # ćwiczyłby wtedy ścieżkę, której produkt nie używa.
        return execute_domain_operation(
            snap, "append_station_on_endpoint", _koniec_ciagu(pole_ref, rodzina_ref, endpoint)
        )
    raise AssertionError(f"Nieznany tor budowy pola: {tor}")


def _pola_z_wskazaniem(odpowiedz: dict[str, Any], pole_ref: str) -> list[dict[str, Any]]:
    """Wszystkie `field_spec` migawki, które niosą wskazaną referencję pola."""
    snapshot = odpowiedz.get("snapshot") or {}
    znalezione: list[dict[str, Any]] = []
    for stacja in snapshot.get("substations", []):
        meta = stacja.get("meta") or {}
        for klucz in ("field_specs", "nn_field_specs"):
            for spec in meta.get(klucz, []):
                if isinstance(spec, dict) and spec.get("bay_template_ref") == pole_ref:
                    znalezione.append(spec)
    return znalezione


#: Tory budowy pola V1, w których referencja katalogowa jest OSIĄGALNA z payloadu
#: użytkownika. Lista wynika z inwentarza miejsc budowy `field_spec` (pin niżej).
TORY_Z_WSKAZANIEM_KATALOGOWYM = ["gpz", "wciecie", "koniec_ciagu"]


# ---------------------------------------------------------------------------
# Cecha 1: rodzina MODULARNA → pełna kompozycja aparatów z katalogu
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("tor", TORY_Z_WSKAZANIEM_KATALOGOWYM)
def test_rodzina_modularna_daje_polu_pelna_kompozycje_aparatow(tor: str) -> None:
    """PIN KARTY: pole z rodziny katalogowej ma NIEPUSTĄ listę aparatów, a każdy
    aparat niesie referencję katalogową (pochodzenie jest daną, nie domysłem)."""
    odpowiedz = _uruchom(tor, POLE_MODULARNE, RODZINA_MODULARNA)
    assert odpowiedz.get("error") in (None, ""), odpowiedz

    pola = _pola_z_wskazaniem(odpowiedz, POLE_MODULARNE)
    assert pola, f"tor {tor}: żadne pole nie niesie referencji {POLE_MODULARNE}"
    for spec in pola:
        aparaty = spec.get("primary_devices")
        assert aparaty, f"tor {tor}: pole {spec.get('field_ref')} bez aparatow"
        # Kompletność wobec katalogu: tyle aparatów, ile deklaruje pole katalogowe.
        szablon = pole_katalogowe(POLE_MODULARNE)
        assert szablon is not None
        assert len(aparaty) == len(szablon.device_instances)
        for aparat in aparaty:
            assert aparat.get("catalog_ref"), f"tor {tor}: aparat bez referencji katalogowej"
            assert aparat.get("kind")
            assert aparat.get("designation")


# ---------------------------------------------------------------------------
# Cecha 2: rodzina BLOK_RMU → twardy błąd wskazujący kanał bloków
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("tor", TORY_Z_WSKAZANIEM_KATALOGOWYM)
def test_rodzina_blokowa_jest_odrzucona_z_wskazaniem_kanalu_blokow(tor: str) -> None:
    """Rozdzielnica wtórna (RMU) jako pole GPZ/stacyjne = błąd inżynierski.

    Komunikat MUSI prowadzić projektanta do właściwego kanału — sam komunikat
    „niezgodne" zostawiłby go bez wyjścia.
    """
    odpowiedz = _uruchom(tor, POLE_BLOKOWE, RODZINA_BLOKOWA)

    assert odpowiedz.get("error"), f"tor {tor}: rodzina blokowa przeszla bez bledu"
    assert odpowiedz.get("error_code") == KOD_BLEDU_POLA_KATALOGOWEGO
    komunikat = str(odpowiedz["error"])
    assert "BLOKOW fabrycznych" in komunikat
    assert "add_sn_bay_from_catalog" in komunikat
    assert "factory_configuration_ref" in komunikat
    # Operacja meldująca błąd nie zostawia skutku: brak migawki i brak elementów.
    assert odpowiedz.get("snapshot") is None
    assert not odpowiedz.get("created")


@pytest.mark.parametrize("tor", TORY_Z_WSKAZANIEM_KATALOGOWYM)
def test_odrzucenie_rodziny_blokowej_nie_mutuje_modelu_wejsciowego(tor: str) -> None:
    """Niezgodność katalogowa nie może zostawić PÓŁ-stacji w modelu wejściowym."""
    if tor == "gpz":
        wejscie, operacja, payload = (
            _empty_enm(),
            "add_grid_source_sn",
            _gpz(POLE_BLOKOWE, RODZINA_BLOKOWA),
        )
    elif tor == "wciecie":
        wejscie, operacja, payload = (
            _enm_z_odcinkiem(),
            "insert_station_on_segment_sn",
            _wciecie(POLE_BLOKOWE, RODZINA_BLOKOWA),
        )
    else:
        snap, endpoint = _gpz_z_koncem_ciagu()
        wejscie, operacja, payload = (
            snap,
            "append_station_on_endpoint",
            _koniec_ciagu(POLE_BLOKOWE, RODZINA_BLOKOWA, endpoint),
        )

    przed = copy.deepcopy(wejscie)
    odpowiedz = execute_domain_operation(wejscie, operacja, payload)

    assert odpowiedz.get("error_code") == KOD_BLEDU_POLA_KATALOGOWEGO
    assert wejscie == przed, f"tor {tor}: operacja z bledem zmutowala model wejsciowy"


# ---------------------------------------------------------------------------
# Cecha 3: bez wskazania katalogowego → zachowanie dotychczasowe (zero regresji)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("tor", TORY_Z_WSKAZANIEM_KATALOGOWYM)
def test_pole_bez_wskazania_katalogowego_zachowuje_dotychczasowy_kontrakt(tor: str) -> None:
    """Pole bez referencji szablonu: brak klucza aparatów, migawka jak dotąd."""
    odpowiedz = _uruchom(tor, None, None)
    assert odpowiedz.get("error") in (None, ""), odpowiedz

    snapshot = odpowiedz["snapshot"]
    for stacja in snapshot.get("substations", []):
        meta = stacja.get("meta") or {}
        for klucz in ("field_specs", "nn_field_specs"):
            for spec in meta.get(klucz, []):
                if not spec.get("bay_template_ref"):
                    assert (
                        "primary_devices" not in spec
                    ), f"tor {tor}: pole bez szablonu dostalo aparaty z domyslu"


@pytest.mark.parametrize("tor", TORY_Z_WSKAZANIEM_KATALOGOWYM)
def test_referencja_spoza_katalogu_rodzin_idzie_sciezka_konwencji(tor: str) -> None:
    """Referencja, której katalog rodzin NIE zna, nie jest wyborem katalogowym:
    nie wolno jej odrzucić ani zmyślić dla niej aparatów."""
    assert pole_katalogowe(POLE_SPOZA_KATALOGU) is None
    odpowiedz = _uruchom(tor, POLE_SPOZA_KATALOGU, None)

    assert odpowiedz.get("error") in (None, ""), odpowiedz
    pola = _pola_z_wskazaniem(odpowiedz, POLE_SPOZA_KATALOGU)
    assert pola, f"tor {tor}: referencja spoza katalogu zgubiona"
    for spec in pola:
        assert "primary_devices" not in spec


# ---------------------------------------------------------------------------
# Predykaty parami: JEDNO źródło prawdy o torze konfiguracji rodziny
# ---------------------------------------------------------------------------


def _blok_rodziny(family_ref: str) -> str:
    """Referencja deterministycznie pierwszego bloku fabrycznego rodziny."""
    from network_model.catalog.switchgear import list_factory_configurations

    bloki = sorted(
        konfiguracja.configuration_ref
        for konfiguracja in list_factory_configurations()
        if konfiguracja.switchgear_family_ref == family_ref
    )
    assert bloki, f"rodzina {family_ref} nie ma blokow fabrycznych w katalogu"
    return bloki[0]


def test_ta_sama_rodzina_odrzucona_w_v1_jest_przyjeta_kanalem_blokow() -> None:
    """Para predykatów: ODRZUCENIE w V1 i PRZYJĘCIE w kanale bloków to dwie
    strony JEDNEGO warunku (`tor_konfiguracji` rodziny), nie dwa niezależne.

    Gdyby kanał V1 odrzucał po własnej liście nazw rodzin, ten test przeszedłby
    tylko przypadkiem — dlatego sprawdza obie strony na TEJ SAMEJ rodzinie
    i pilnuje, że odrzucona celka należy do rodziny przyjętego bloku.
    """
    from enm.pole_katalogowe import rozwiaz_plan_pola

    # Strona ODRZUCENIA: pojedyncza celka rodziny blokowej w polu stacji
    # (realna ścieżka użytkownika — operacja domenowa).
    odrzucone = _uruchom("wciecie", POLE_BLOKOWE, RODZINA_BLOKOWA)
    assert odrzucone.get("error_code") == KOD_BLEDU_POLA_KATALOGOWEGO

    # Strona PRZYJĘCIA: TA SAMA rodzina, kanałem bloku fabrycznego.
    plan = rozwiaz_plan_pola(
        {
            "factory_configuration_ref": _blok_rodziny(RODZINA_BLOKOWA),
            "factory_unit_index": 1,
        },
        field_ref="pole-testowe",
    )
    assert plan.switchgear_family_ref == RODZINA_BLOKOWA
    assert plan.aparaty, "kanal blokow musi zmaterializowac wyposazenie jednostki"
    assert all(aparat["catalog_ref"] for aparat in plan.aparaty)

    # Domknięcie pary: odrzucona celka i przyjęty blok to ta sama rodzina.
    odrzucone_pole = pole_katalogowe(POLE_BLOKOWE)
    assert odrzucone_pole is not None
    assert odrzucone_pole.switchgear_family_ref == plan.switchgear_family_ref


# ---------------------------------------------------------------------------
# Pin KLASY: cały katalog, nie jeden przykład
# ---------------------------------------------------------------------------


def test_kazde_pole_kazdej_rodziny_modularnej_materializuje_aparaty() -> None:
    """Deklaracja karty („pole z rodziną katalogową ma niepustą listę aparatów")
    obowiązuje na CAŁYM katalogu rodzin modułowych, a nie na jednym przykładzie.

    Rodzina blokowa jest w tym samym przebiegu sprawdzana od drugiej strony —
    jej pole MUSI zostać odrzucone. Dzięki temu jeden test pilnuje obu stron
    podziału i nie da się „naprawić" go, przesuwając rodzinę do drugiego worka.
    """
    from enm.pole_katalogowe import aparaty_pola_z_referencji
    from network_model.catalog.switchgear import NiezgodnoscKonfiguracjiError

    tory = {
        rodzina.switchgear_family_ref: rodzina.tor_konfiguracji
        for rodzina in list_switchgear_families()
    }
    zbadane_modularne = 0
    zbadane_blokowe = 0
    for szablon in list_switchgear_solution_templates_for_manufacturer(None):
        tor = tory.get(szablon.switchgear_family_ref or "")
        if tor == "MODULARNY":
            aparaty = aparaty_pola_z_referencji(
                field_ref="pole-testowe",
                bay_template_ref=szablon.template_ref,
                switchgear_family_ref=szablon.switchgear_family_ref,
            )
            assert aparaty, f"{szablon.template_ref}: pole katalogowe bez aparatow"
            assert len(aparaty) == len(szablon.device_instances)
            assert all(aparat.get("catalog_ref") for aparat in aparaty)
            zbadane_modularne += 1
        elif tor == "BLOK_RMU":
            with pytest.raises(NiezgodnoscKonfiguracjiError):
                aparaty_pola_z_referencji(
                    field_ref="pole-testowe",
                    bay_template_ref=szablon.template_ref,
                    switchgear_family_ref=szablon.switchgear_family_ref,
                )
            zbadane_blokowe += 1

    # Katalog musi realnie zawierać OBIE strony podziału — inaczej test powyżej
    # przechodziłby, nie sprawdziwszy niczego.
    assert zbadane_modularne > 0
    assert zbadane_blokowe > 0


# ---------------------------------------------------------------------------
# Pin INWENTARZA: nowe miejsce budowy pola musi podjąć decyzję świadomie
# ---------------------------------------------------------------------------

#: Funkcje `domain_operations.py`, które budują `field_spec` pola. Lista jest
#: ZAMKNIĘTA: każde nowe miejsce budowy pola musi rozstrzygnąć, skąd bierze
#: aparaty (resolver katalogu vs jawny argument), więc świadomie dopisać się tu.
#: Bez tego pinu kolejna ścieżka po cichu powtórzyłaby dług tej karty —
#: dokładnie tak powstała ręczna budowa pola w `append_station_on_endpoint`.
#:
#: KOREKTA (karta jednego buildera pola): zbiór „reczne" jest PUSTY. Stacja na
#: końcu ciągu składała specyfikację własnym literałem słownika, przez co każdy
#: klucz kontraktu pola trzeba było dokładać dwukrotnie — i za każdym razem
#: jedno z dwóch miejsc zostawało w tyle (`config_id` i aparaty pierwotne
#: wracały tu osobnymi naprawami, metadane pochodzenia pola gubiło wcięcie
#: w odcinek). Obie drogi budowy stacji wołają teraz JEDEN builder.
MIEJSCA_BUDOWY_POLA: dict[str, set[str]] = {
    # wywołania wspólnego buildera `_build_field_spec` (7 wywołań w 6 funkcjach)
    "_build_field_spec": {
        "_allocate_gpz_line_field_for_branch",  # pole liniowe GPZ dla wyprowadzenia
        "add_grid_source_sn",  # pola sekcji GPZ
        "_build_nn_field_specs",  # wyłącznik główny nN + odpływy nN (2 wywołania)
        "insert_station_on_segment_sn",  # pola stacji wciętej w odcinek
        "append_station_on_endpoint",  # pola stacji na końcu ciągu (z payloadu)
        "_ensure_field_spec",  # pole domykane stacji końca ciągu (bez payloadu)
    },
    # ręczna budowa `field_spec` (poza wspólnym builderem) — ZBIÓR PUSTY
    "reczne": set(),
}


def _funkcja_otaczajaca(drzewo: ast.Module, wezel: ast.AST) -> str:
    """Nazwa najgłębszej funkcji otaczającej węzeł (albo '<modul>')."""
    najlepsza = "<modul>"
    zasieg = -1
    for kandydat in ast.walk(drzewo):
        if not isinstance(kandydat, ast.FunctionDef | ast.AsyncFunctionDef):
            continue
        koniec = getattr(kandydat, "end_lineno", None)
        if koniec is None:
            continue
        if kandydat.lineno <= wezel.lineno <= koniec and kandydat.lineno > zasieg:
            zasieg = kandydat.lineno
            najlepsza = kandydat.name
    return najlepsza


def test_inwentarz_miejsc_budowy_pola_jest_zamkniety() -> None:
    """Każde wywołanie `_build_field_spec` pochodzi z zadeklarowanego miejsca."""
    zrodlo = Path(__file__).resolve().parents[2] / "src" / "enm" / "domain_operations.py"
    drzewo = ast.parse(zrodlo.read_text(encoding="utf-8"))

    znalezione: set[str] = set()
    for wezel in ast.walk(drzewo):
        if not isinstance(wezel, ast.Call):
            continue
        funkcja = wezel.func
        if isinstance(funkcja, ast.Name) and funkcja.id == "_build_field_spec":
            nazwa = _funkcja_otaczajaca(drzewo, wezel)
            # Definicja buildera nie jest jego wywołaniem.
            if nazwa != "_build_field_spec":
                znalezione.add(nazwa)

    assert znalezione == MIEJSCA_BUDOWY_POLA["_build_field_spec"], (
        "Zmienil sie zbior miejsc budujacych pole przez _build_field_spec. "
        "Nowe miejsce MUSI rozstrzygnac, skad bierze aparaty pola (resolver "
        f"katalogu vs jawny argument) i dopisac sie do inwentarza. Roznica: "
        f"{znalezione ^ MIEJSCA_BUDOWY_POLA['_build_field_spec']}"
    )


def test_zadna_operacja_nie_sklada_specyfikacji_pola_recznie() -> None:
    """W `domain_operations*.py` NIE MA ręcznego literału specyfikacji pola.

    Pin inwentarza wyżej łapie wyłącznie WYWOŁANIA wspólnego buildera — ścieżka
    składająca `field_spec` własnym słownikiem jest dla niego niewidzialna,
    a to właśnie ona niosła dług: stacja na końcu ciągu przez lata gubiła po
    kolei `config_id`, aparaty pierwotne i metadane pochodzenia, bo każda
    naprawa dotykała buildera, nie drugiego literału. Zbiór ręcznych miejsc jest
    ZAMKNIĘTY I PUSTY — deklaracja przypięta testem, nie samym docstringiem.

    Rozpoznanie po parze kluczy `field_ref` + `bus_ref`: specyfikacja pola
    ZAWSZE niesie obie (przynależność do pola i do szyny), a metadane tworzonych
    gałęzi/zacisków — nigdy (mają `field_ref`, ale zamiast szyny `station_ref`
    i znaczniki rysunku).
    """
    znalezione: list[str] = []
    for nazwa_pliku in ("domain_operations.py", "domain_operations_v2.py"):
        zrodlo = Path(__file__).resolve().parents[2] / "src" / "enm" / nazwa_pliku
        drzewo = ast.parse(zrodlo.read_text(encoding="utf-8"))
        for wezel in ast.walk(drzewo):
            if not isinstance(wezel, ast.Dict):
                continue
            klucze = {
                klucz.value
                for klucz in wezel.keys
                if isinstance(klucz, ast.Constant) and isinstance(klucz.value, str)
            }
            if {"field_ref", "bus_ref"} <= klucze:
                znalezione.append(
                    f"{nazwa_pliku}:{wezel.lineno} w {_funkcja_otaczajaca(drzewo, wezel)}"
                )

    assert znalezione == [], (
        "Wrocila reczna budowa specyfikacji pola poza wspolnym builderem "
        f"(_build_field_spec): {znalezione}. Kazdy klucz kontraktu pola trzeba "
        "wtedy dokladac w dwoch miejscach naraz — dokladnie stad wzial sie dlug "
        "gubionych metadanych pochodzenia pola."
    )
    assert MIEJSCA_BUDOWY_POLA["reczne"] == set()


def test_obie_drogi_budowy_stacji_materializuja_aparaty_przez_resolver() -> None:
    """Obie drogi budowy stacji dają ten sam efekt dla tego samego wskazania.

    `append_station_on_endpoint` składała specyfikację pola własnym literałem
    słownika (nie przez `_build_field_spec`), więc sam pin inwentarza by jej nie
    złapał — do karty K-K NIGDY nie zapisywała aparatów pola. Ręczna droga
    została zlikwidowana (obie wołają wspólny builder), ale test zostaje: pilnuje
    RÓWNOŚCI WYNIKU obu dróg, czyli tego, po co je scalono.
    """
    odpowiedz = _uruchom("koniec_ciagu", POLE_MODULARNE, RODZINA_MODULARNA)
    assert odpowiedz.get("error") in (None, ""), odpowiedz

    pola = _pola_z_wskazaniem(odpowiedz, POLE_MODULARNE)
    assert pola
    aparaty_reczne = [aparat["kind"] for aparat in pola[0]["primary_devices"]]

    # Ten sam wybór katalogowy przez wspólny builder (tor wcięcia w odcinek).
    przez_builder = _uruchom("wciecie", POLE_MODULARNE, RODZINA_MODULARNA)
    pola_builder = _pola_z_wskazaniem(przez_builder, POLE_MODULARNE)
    assert pola_builder
    aparaty_builder = [aparat["kind"] for aparat in pola_builder[0]["primary_devices"]]

    assert aparaty_reczne == aparaty_builder, (
        "Dwie sciezki budowy pola daja rozne wyposazenie dla tego samego "
        "wskazania katalogowego — to dwie prawdy o tym samym polu."
    )
