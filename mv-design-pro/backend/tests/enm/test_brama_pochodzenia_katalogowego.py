"""Deklaracja pochodzenia katalogowego i parytet kontroli doboru — KLASA, nie instancja.

DŁUG 1 (V12K-315 poz. 7, potwierdzony w V12K-316 poz. 2): aparat pola liniowego
stacji zasilającej (`add_grid_source_sn` → `gpz_line_field_apparatus`) dostawał
`source_mode: KATALOG` / `parameter_source: CATALOG` BEZ materializacji i bez
sprawdzenia, czy pozycja katalogu w ogóle istnieje. Zmierzone przed naprawą:
aparat w migawce z `materialized_params: null` przy zadeklarowanym pochodzeniu
katalogowym — element niósł tabliczkę znikąd, a most „aparat → wytrzymałość
(I_th/I_dyn)" dostawał martwą referencję.

DŁUG 2 (V12K-316 poz. 3): kontrola mocy transformatora
(`_validate_converter_transformer_capacity`) istniała WYŁĄCZNIE w torze atomowym
(`add_converter_source`). Tor stacyjny jej nie miał, więc TA SAMA pozycja
katalogowa bywała przyjęta przy tworzeniu stacji i odrzucona przy dodaniu źródła
osobno — dwa różne werdykty dla tego samego doboru.

Pilnowane własności:

(a) BRAMA APARATU POLA — iloczyn cech, nie przykład z karty: rodzaj aparatu
    (wyłącznik / odłącznik / rozłącznik) × sposób wskazania pozycji (referencja
    korzeniowa vs wiązanie katalogowe) × liczba sekcji i pól. Zła pozycja kończy
    operację kodem `catalog.item_not_found` i NIE zostawia śladu w migawce;
    dobra daje `materialized_params` zgodne z katalogiem.
(b) ASERCJA KLASY NA CAŁEJ MIGAWCE: po pełnym łańcuchu operacji ŻADEN element
    nie deklaruje pochodzenia katalogowego przy pustej tabliczce. Predykat
    wejścia (co uznajemy za deklarację) i wyjścia (co uznajemy za tabliczkę)
    pochodzi z JEDNEGO miejsca w tym pliku.
(c) INWENTARZ ZAMKNIĘTY: skan AST całego modułu — zbiór funkcji zapisujących
    znacznik pochodzenia MUSI być równy `INWENTARZ_DEKLARACJI_KATALOGOWYCH`.
    Nowe miejsce bez wpisu zapala test (deklaracja bez testu = fałszywa pewność).
(d) POZOSTALI CZŁONKOWIE KLASY w tym module: łącznik sekcyjny, punkt
    rozgałęzienia, przypisanie katalogu do istniejącego elementu, znacznik
    pochodzenia podstawiony z payloadu.
(e) PARYTET KONTROLI DOBORU: ta sama pozycja katalogowa źródła i ten sam
    transformator dają TEN SAM werdykt w torze stacyjnym i atomowym — iloczyn
    (technologia PV/BESS) × (moc mieszcząca się / przekraczająca transformator).
"""

from __future__ import annotations

import ast
import copy
import inspect
from pathlib import Path
from typing import Any

import pytest
from enm.domain_operations import (
    INWENTARZ_DEKLARACJI_KATALOGOWYCH,
    execute_domain_operation,
)
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader

# ---------------------------------------------------------------------------
# Rzeczywiste pozycje katalogu (żadnych wymyślonych referencji — V12K-316)
# ---------------------------------------------------------------------------

REF_ZRODLO_SN = "src-gpz-15kv-250mva-rx010"
REF_KABEL_SN = "cable-tfk-yakxs-3x120"
REF_LINIA_SN = "line-base-al-st-70"
REF_TRAFO_630 = "tr-sn-nn-15-04-630kva-dyn11"
REF_APARAT_SN = "sw-cb-abb-vd4-24kv-630a"
REF_APARAT_SN_ALT = "sw-ls-schneider-rm6-17kv-400a"
REF_APARAT_NN = "cb_nn_630a"
REF_CT = "ct_400_5_5p20_15va_abb"
REF_VT = "vt_15kv_100v_3p_abb"
REF_PRZEKAZNIK = "REF-OC-100"
REF_SLUP_ROZGALEZNY = "AFL-SLUP"
REF_ZKSN = "ZKSN-2P-630A"

#: Falownik PV 0,5 MW / 0,55 MVA — mieści się pod transformatorem 630 kVA.
REF_PV_W_ZAKRESIE = "conv-pv-nn-0p5mw-0p4kv"
#: Falownik PV 2,0 MW / 2,2 MVA — PRZEKRACZA transformator 630 kVA.
REF_PV_ZA_DUZY = "conv-pv-nn-2mw-0p4kv"
#: Magazyn 2,0 MW / 2,2 MVA — przekracza transformator 630 kVA.
REF_BESS_ZA_DUZY = "conv-bess-nn-2mw-0p4kv"

LITEROWKA = "-pozycji-ktorej-nie-ma"

MODUL_OPERACJI = Path(inspect.getfile(execute_domain_operation)).resolve()


# ---------------------------------------------------------------------------
# JEDNO źródło prawdy dla predykatu klasy
# ---------------------------------------------------------------------------

#: Kolekcje migawki, w których mogą stać elementy z deklaracją pochodzenia.
KOLEKCJE_ELEMENTOW = (
    "buses",
    "branches",
    "transformers",
    "sources",
    "loads",
    "generators",
    "branch_points",
    "protection_assignments",
)


def _deklaruje_katalog(element: dict[str, Any]) -> bool:
    """Czy element MÓWI o sobie, że pochodzi z katalogu (predykat WEJŚCIA)."""
    return (
        str(element.get("source_mode") or "").strip().upper() == "KATALOG"
        or str(element.get("parameter_source") or "").strip().upper() == "CATALOG"
    )


def _ma_tabliczke(element: dict[str, Any]) -> bool:
    """Czy element NIESIE tabliczkę z materializacji (predykat WYJŚCIA)."""
    tabliczka = element.get("materialized_params")
    return isinstance(tabliczka, dict) and bool(tabliczka)


def tabliczki_znikad(snapshot: dict[str, Any]) -> list[tuple[str, str]]:
    """Elementy deklarujące katalog przy pustej materializacji — MUSI być pusto."""
    winowajcy: list[tuple[str, str]] = []
    for kolekcja in KOLEKCJE_ELEMENTOW:
        for element in snapshot.get(kolekcja, []) or []:
            if not isinstance(element, dict):
                continue
            if _deklaruje_katalog(element) and not _ma_tabliczke(element):
                winowajcy.append((kolekcja, str(element.get("ref_id"))))
    return winowajcy


# ---------------------------------------------------------------------------
# Budowa modelu
# ---------------------------------------------------------------------------


def _pusty_enm() -> dict[str, Any]:
    return EnergyNetworkModel(
        header=ENMHeader(
            name="brama_pochodzenia_katalogowego",
            defaults=ENMDefaults(sn_nominal_kv=15.0),
        ),
    ).model_dump(mode="json")


def _wykonaj(snapshot: dict[str, Any], nazwa: str, payload: dict[str, Any]) -> dict[str, Any]:
    wynik = execute_domain_operation(snapshot, nazwa, payload)
    assert not wynik.get("error"), f"{nazwa}: {wynik.get('error')} ({wynik.get('error_code')})"
    migawka = wynik.get("snapshot")
    assert isinstance(migawka, dict), f"{nazwa}: brak migawki"
    return migawka


def _payload_gpz(
    *,
    apparatus_kind: str = "BREAKER",
    apparatus_ref: str | None = REF_APARAT_SN,
    przez_wiazanie: bool = True,
    sections_count: int = 1,
    line_fields_per_section: int = 1,
    namespace: str = "APARAT_SN",
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "source_name": "Stacja zasilająca",
        "voltage_kv": 15.0,
        "sk3_mva": 250.0,
        "catalog_ref": REF_ZRODLO_SN,
        "sections_count": sections_count,
        "line_fields_per_section": line_fields_per_section,
        # Karta FAB-G: transformator WN/SN GPZ wymaga jawnej pary
        # hv_voltage_kv + transformer_sn_mva (albo transformer_catalog_ref).
        "hv_voltage_kv": 110.0,
        "transformer_sn_mva": 25.0,
    }
    if apparatus_ref is None:
        return payload
    aparat: dict[str, Any] = {"apparatus_kind": apparatus_kind}
    if przez_wiazanie:
        aparat["catalog_binding"] = {
            "catalog_namespace": namespace,
            "catalog_item_id": apparatus_ref,
            "catalog_item_version": "2024.1",
        }
    else:
        aparat["catalog_ref"] = apparatus_ref
    payload["gpz_line_field_apparatus"] = aparat
    return payload


def _aparaty_pol_gpz(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        branch
        for branch in snapshot.get("branches", [])
        if "gpz_field_device" in (branch.get("tags") or [])
    ]


def _blok_stacji(
    *,
    nn_source_ref: str | None = None,
    nn_configuration: str = "PV_INVERTER",
) -> dict[str, Any]:
    blok: dict[str, Any] = {
        "sn_fields": [
            {"field_role": "LINIA_IN", "apparatus_catalog_ref": REF_APARAT_SN},
            {"field_role": "TRANSFORMATOROWE", "apparatus_catalog_ref": REF_APARAT_SN},
        ],
        "field_apparatus_catalog_ref": REF_APARAT_SN,
        "transformer": {"create": True, "transformer_catalog_ref": REF_TRAFO_630},
    }
    if nn_source_ref is not None:
        blok["nn_block"] = {
            "nn_configuration": nn_configuration,
            "source_converter_catalog_ref": nn_source_ref,
            "source_converter_name": "Źródło nN stacji",
            "outgoing_feeders_nn_count": 1,
        }
    return blok


def _ciag_sn() -> tuple[dict[str, Any], str]:
    """Stacja zasilająca + odcinek kablowy. Zwraca (migawka, ref_odcinka)."""
    snapshot = _wykonaj(_pusty_enm(), "add_grid_source_sn", _payload_gpz())
    snapshot = _wykonaj(
        snapshot,
        "continue_trunk_segment_sn",
        {"segment": {"rodzaj": "KABEL", "dlugosc_m": 500.0, "catalog_ref": REF_KABEL_SN}},
    )
    return snapshot, str(snapshot["branches"][-1]["ref_id"])


def _stacja_w_odcinku(nn_source_ref: str | None, nn_configuration: str = "PV_INVERTER") -> Any:
    """Wstaw stację w odcinek SN. Zwraca surową odpowiedź operacji (może być błąd)."""
    snapshot, segment_ref = _ciag_sn()
    payload = {
        "segment_id": segment_ref,
        "insert_at": {"mode": "RATIO", "value": 0.5},
        "station": {
            "station_type": "inline",
            "station_name": "Stacja w odcinku",
            "sn_voltage_kv": 15.0,
            "nn_voltage_kv": 0.4,
        },
        **_blok_stacji(nn_source_ref=nn_source_ref, nn_configuration=nn_configuration),
    }
    return execute_domain_operation(snapshot, "insert_station_on_segment_sn", payload)


# ===========================================================================
# (a) BRAMA APARATU POLA LINIOWEGO — iloczyn cech
# ===========================================================================


@pytest.mark.parametrize("apparatus_kind", ["BREAKER", "DISCONNECTOR", "LOAD_SWITCH"])
@pytest.mark.parametrize("przez_wiazanie", [True, False])
@pytest.mark.parametrize("sekcje_i_pola", [(1, 1), (2, 3)])
def test_zla_pozycja_aparatu_pola_konczy_operacje(
    apparatus_kind: str,
    przez_wiazanie: bool,
    sekcje_i_pola: tuple[int, int],
) -> None:
    """Literówka w referencji aparatu → `catalog.item_not_found`, ZERO skutku.

    Iloczyn cech: rodzaj aparatu × droga wskazania pozycji × krotność pól.
    Defekt chował się w KAŻDEJ kombinacji, bo brama nie istniała w ogóle.
    """
    sections_count, line_fields_per_section = sekcje_i_pola
    wejscie = _pusty_enm()
    przed = copy.deepcopy(wejscie)

    wynik = execute_domain_operation(
        wejscie,
        "add_grid_source_sn",
        _payload_gpz(
            apparatus_kind=apparatus_kind,
            apparatus_ref=REF_APARAT_SN + LITEROWKA,
            przez_wiazanie=przez_wiazanie,
            sections_count=sections_count,
            line_fields_per_section=line_fields_per_section,
        ),
    )

    assert wynik.get("error_code") == "catalog.item_not_found", wynik
    assert wynik.get("snapshot") is None
    assert "APARAT_SN" in str(wynik.get("error"))
    # Operacja meldująca błąd nie zostawia żadnego skutku.
    assert wejscie == przed


@pytest.mark.parametrize("apparatus_kind", ["BREAKER", "DISCONNECTOR", "LOAD_SWITCH"])
@pytest.mark.parametrize("przez_wiazanie", [True, False])
@pytest.mark.parametrize("sekcje_i_pola", [(1, 1), (2, 3)])
def test_dobra_pozycja_aparatu_pola_daje_tabliczke_z_katalogu(
    apparatus_kind: str,
    przez_wiazanie: bool,
    sekcje_i_pola: tuple[int, int],
) -> None:
    """Istniejąca pozycja → tabliczka z katalogu na KAŻDYM aparacie każdego pola."""
    sections_count, line_fields_per_section = sekcje_i_pola
    snapshot = _wykonaj(
        _pusty_enm(),
        "add_grid_source_sn",
        _payload_gpz(
            apparatus_kind=apparatus_kind,
            przez_wiazanie=przez_wiazanie,
            sections_count=sections_count,
            line_fields_per_section=line_fields_per_section,
        ),
    )

    aparaty = _aparaty_pol_gpz(snapshot)
    assert len(aparaty) == sections_count * line_fields_per_section
    for aparat in aparaty:
        assert aparat["source_mode"] == "KATALOG"
        assert aparat["parameter_source"] == "CATALOG"
        assert aparat["catalog_namespace"] == "APARAT_SN"
        tabliczka = aparat["materialized_params"]
        assert isinstance(tabliczka, dict) and tabliczka
        assert tabliczka["catalog_item_id"] == REF_APARAT_SN
    assert tabliczki_znikad(snapshot) == []


def test_aparat_pola_sprawdzany_w_kategorii_wskazanej_przez_wolajacego() -> None:
    """Brama sprawdza DOKŁADNIE tę pozycję, która trafi do migawki.

    Aparat SN wskazany w kategorii APARAT_NN nie istnieje w TAMTEJ kategorii —
    zgoda „bo w APARAT_SN taki jest" byłaby zgodą na inną pozycję niż zapisana.
    """
    wynik = execute_domain_operation(
        _pusty_enm(),
        "add_grid_source_sn",
        _payload_gpz(apparatus_ref=REF_APARAT_SN, namespace="APARAT_NN"),
    )

    assert wynik.get("error_code") == "catalog.item_not_found", wynik
    assert wynik.get("snapshot") is None


def test_stacja_zasilajaca_bez_aparatu_pola_dziala_jak_dotad() -> None:
    """Aparat pola jest OPCJONALNY — brak bloku nie zmienia zachowania."""
    snapshot = _wykonaj(_pusty_enm(), "add_grid_source_sn", _payload_gpz(apparatus_ref=None))

    assert _aparaty_pol_gpz(snapshot) == []
    assert tabliczki_znikad(snapshot) == []


def test_tabliczka_aparatu_pola_pochodzi_z_katalogu_nie_z_domyslnej_wartosci() -> None:
    """Dwie różne pozycje katalogu dają RÓŻNE tabliczki (liczby z katalogu)."""
    pierwsza = _wykonaj(_pusty_enm(), "add_grid_source_sn", _payload_gpz())
    druga = _wykonaj(
        _pusty_enm(),
        "add_grid_source_sn",
        _payload_gpz(apparatus_ref=REF_APARAT_SN_ALT),
    )

    tabliczka_1 = _aparaty_pol_gpz(pierwsza)[0]["materialized_params"]
    tabliczka_2 = _aparaty_pol_gpz(druga)[0]["materialized_params"]
    assert tabliczka_1["catalog_item_id"] == REF_APARAT_SN
    assert tabliczka_2["catalog_item_id"] == REF_APARAT_SN_ALT
    assert tabliczka_1 != tabliczka_2


# ===========================================================================
# (b) ASERCJA KLASY NA CAŁEJ MIGAWCE
# ===========================================================================


def test_pelny_lancuch_operacji_nie_zostawia_ani_jednej_tabliczki_znikad() -> None:
    """Łańcuch: stacja zasilająca → magistrala → stacja → łącznik → odgałęzienie
    → słup rozgałęźny → ZKSN → transformator SN/nN. Po każdym kroku i na końcu
    ŻADEN element nie deklaruje katalogu przy pustej tabliczce.
    """
    snapshot = _wykonaj(_pusty_enm(), "add_grid_source_sn", _payload_gpz(sections_count=2))
    assert tabliczki_znikad(snapshot) == []

    snapshot = _wykonaj(
        snapshot,
        "continue_trunk_segment_sn",
        {"segment": {"rodzaj": "KABEL", "dlugosc_m": 600.0, "catalog_ref": REF_KABEL_SN}},
    )
    assert tabliczki_znikad(snapshot) == []
    odcinek_kablowy = str(snapshot["branches"][-1]["ref_id"])

    snapshot = _wykonaj(
        snapshot,
        "insert_station_on_segment_sn",
        {
            "segment_id": odcinek_kablowy,
            "insert_at": {"mode": "RATIO", "value": 0.5},
            "station": {
                "station_type": "inline",
                "station_name": "Stacja łańcucha",
                "sn_voltage_kv": 15.0,
                "nn_voltage_kv": 0.4,
            },
            **_blok_stacji(nn_source_ref=REF_PV_W_ZAKRESIE),
        },
    )
    assert tabliczki_znikad(snapshot) == []

    odcinki = [b for b in snapshot["branches"] if b.get("type") == "cable"]
    snapshot = _wykonaj(
        snapshot,
        "insert_section_switch_sn",
        {
            "segment_id": str(odcinki[-1]["ref_id"]),
            "insert_at": {"mode": "RATIO", "value": 0.5},
            "switch_type": "ROZLACZNIK",
            "catalog_ref": REF_APARAT_SN_ALT,
        },
    )
    assert tabliczki_znikad(snapshot) == []

    szyna_sn = str(snapshot["substations"][0]["gpz_sections"][0]["bus_ref"])
    snapshot = _wykonaj(
        snapshot,
        "start_branch_segment_sn",
        {
            "from_bus_ref": szyna_sn,
            "segment": {
                "rodzaj": "LINIA_NAPOWIETRZNA",
                "dlugosc_m": 400.0,
                "catalog_ref": REF_LINIA_SN,
            },
        },
    )
    assert tabliczki_znikad(snapshot) == []
    odcinek_napowietrzny = str(snapshot["branches"][-1]["ref_id"])

    snapshot = _wykonaj(
        snapshot,
        "insert_branch_pole_on_segment_sn",
        {
            "segment_id": odcinek_napowietrzny,
            "catalog_ref": REF_SLUP_ROZGALEZNY,
            "insert_at": {"mode": "RATIO", "value": 0.5},
        },
    )
    assert tabliczki_znikad(snapshot) == []

    kable = [b for b in snapshot["branches"] if b.get("type") == "cable"]
    snapshot = _wykonaj(
        snapshot,
        "insert_zksn_on_segment_sn",
        {
            "segment_id": str(kable[0]["ref_id"]),
            "catalog_ref": REF_ZKSN,
            "insert_at": {"mode": "RATIO", "value": 0.5},
            "switch_state": "CLOSED",
        },
    )
    assert tabliczki_znikad(snapshot) == []

    EnergyNetworkModel.model_validate(snapshot)


# ===========================================================================
# (c) INWENTARZ ZAMKNIĘTY — skan AST całego modułu
# ===========================================================================

#: Znaczniki pochodzenia i wartości, które oznaczają „to jest z katalogu".
ZNACZNIKI_POCHODZENIA = {"source_mode": "KATALOG", "parameter_source": "CATALOG"}


def _funkcja_deklaruje_pochodzenie(node: ast.AST) -> bool:
    """Czy ciało funkcji ZAPISUJE znacznik pochodzenia katalogowego.

    Rozpoznaje trzy formy zapisu spotykane w module: wywołanie wspólnego
    zapisywacza `_apply_catalog_metadata`, literał słownika przekazywany do
    konstruktora elementu oraz przypisanie do klucza istniejącego elementu.
    Porównania (`if source_mode == "KATALOG"`) NIE są zapisem i nie liczą się.
    """
    for sub in ast.walk(node):
        if isinstance(sub, ast.Call):
            fn = sub.func
            if isinstance(fn, ast.Name) and fn.id == "_apply_catalog_metadata":
                return True
        if isinstance(sub, ast.Dict):
            for klucz, wartosc in zip(sub.keys, sub.values, strict=False):
                if not isinstance(klucz, ast.Constant):
                    continue
                oczekiwana = ZNACZNIKI_POCHODZENIA.get(str(klucz.value))
                if oczekiwana is None:
                    continue
                for lit in ast.walk(wartosc):
                    if isinstance(lit, ast.Constant) and lit.value == oczekiwana:
                        return True
        if isinstance(sub, ast.Assign):
            for cel in sub.targets:
                if not (isinstance(cel, ast.Subscript) and isinstance(cel.slice, ast.Constant)):
                    continue
                oczekiwana = ZNACZNIKI_POCHODZENIA.get(str(cel.slice.value))
                if oczekiwana is None:
                    continue
                for lit in ast.walk(sub.value):
                    if isinstance(lit, ast.Constant) and lit.value == oczekiwana:
                        return True
    return False


def test_inwentarz_deklaracji_katalogowych_jest_kompletny_i_zamkniety() -> None:
    """Zbiór funkcji zapisujących znacznik = INWENTARZ. Bez nadmiaru i bez braków.

    Bez tego testu deklaracja „lista ZAMKNIĘTA" w module byłaby obietnicą bez
    pokrycia — a obietnica bez testu wyłącza czujność skuteczniej niż sam defekt.
    """
    drzewo = ast.parse(MODUL_OPERACJI.read_text(encoding="utf-8"))
    znalezione = {
        node.name
        for node in ast.walk(drzewo)
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef)
        and _funkcja_deklaruje_pochodzenie(ast.Module(body=list(node.body), type_ignores=[]))
    }

    brakujace = znalezione - set(INWENTARZ_DEKLARACJI_KATALOGOWYCH)
    assert not brakujace, (
        "Funkcje zapisują znacznik pochodzenia katalogowego bez wpisu w inwentarzu: "
        f"{sorted(brakujace)}"
    )
    zbedne = set(INWENTARZ_DEKLARACJI_KATALOGOWYCH) - znalezione
    komunikat_zbednych = f"Inwentarz wymienia funkcje bez deklaracji katalogu: {sorted(zbedne)}"
    assert not zbedne, komunikat_zbednych


def test_kazda_pozycja_inwentarza_nazywa_swoja_brame() -> None:
    """Wpis bez nazwanej bramy nie mówi, CO uprawnia do deklaracji."""
    for funkcja, opis in INWENTARZ_DEKLARACJI_KATALOGOWYCH.items():
        assert opis.strip(), f"{funkcja}: pusty opis bramy"
        assert any(
            marker in opis
            for marker in (
                "_materialize_catalog_payload",
                "_materialize_sn_field_apparatus_catalog",
                "_brama_katalogowa_aparatu_sn",
                "_brama_katalogowa_przypisania",
                "_branch_point_catalog_item",
                "PO materializacji",
            )
        ), f"{funkcja}: opis nie nazywa bramy katalogowej ({opis})"


# ===========================================================================
# (d) POZOSTALI CZŁONKOWIE KLASY W TYM MODULE
# ===========================================================================


def test_lacznik_sekcyjny_ze_zla_pozycja_jest_odrzucany_w_torze_domenowym() -> None:
    """Parytet z torem payloadu: brama API odrzucała, warstwa domenowa przyjmowała."""
    snapshot, segment_ref = _ciag_sn()
    przed = copy.deepcopy(snapshot)

    wynik = execute_domain_operation(
        snapshot,
        "insert_section_switch_sn",
        {
            "segment_id": segment_ref,
            "switch_type": "ROZLACZNIK",
            "catalog_ref": REF_APARAT_SN + LITEROWKA,
        },
    )

    assert wynik.get("error_code") == "catalog.item_not_found", wynik
    assert wynik.get("snapshot") is None
    # Odcinek NIE zniknął: kontrola stoi przed usunięciem odcinka.
    assert snapshot == przed


def test_lacznik_sekcyjny_z_dobra_pozycja_niesie_tabliczke() -> None:
    snapshot, segment_ref = _ciag_sn()
    snapshot = _wykonaj(
        snapshot,
        "insert_section_switch_sn",
        {
            "segment_id": segment_ref,
            "switch_type": "ROZLACZNIK",
            "catalog_ref": REF_APARAT_SN_ALT,
        },
    )

    lacznik = next(b for b in snapshot["branches"] if str(b["ref_id"]).startswith("sw/"))
    assert lacznik["source_mode"] == "KATALOG"
    assert lacznik["parameter_source"] == "CATALOG"
    assert lacznik["catalog_namespace"] == "APARAT_SN"
    assert lacznik["materialized_params"]["catalog_item_id"] == REF_APARAT_SN_ALT
    assert tabliczki_znikad(snapshot) == []


@pytest.mark.parametrize(
    ("operacja", "ref"),
    [
        ("insert_branch_pole_on_segment_sn", REF_SLUP_ROZGALEZNY),
        ("insert_zksn_on_segment_sn", REF_ZKSN),
    ],
)
def test_punkt_rozgalezienia_ze_zla_pozycja_jest_odrzucany(operacja: str, ref: str) -> None:
    """Własny katalog obiektów też jest katalogiem — nieznana pozycja to błąd."""
    snapshot, segment_ref = _ciag_sn()
    if operacja == "insert_branch_pole_on_segment_sn":
        snapshot = _wykonaj(
            snapshot,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "LINIA_NAPOWIETRZNA",
                    "dlugosc_m": 400.0,
                    "catalog_ref": REF_LINIA_SN,
                }
            },
        )
        segment_ref = str(snapshot["branches"][-1]["ref_id"])

    wynik = execute_domain_operation(
        snapshot,
        operacja,
        {
            "segment_id": segment_ref,
            "catalog_ref": ref + LITEROWKA,
            "insert_at": {"mode": "RATIO", "value": 0.5},
        },
    )

    assert wynik.get("error_code") == "catalog.item_not_found", wynik
    assert wynik.get("snapshot") is None


def test_przypisanie_katalogu_do_aparatu_wymaga_istniejacej_pozycji() -> None:
    """`assign_catalog_to_element` materializował TYLKO kable i transformatory.

    Aparat łączeniowy dostawał deklarację katalogu bez tabliczki i bez
    sprawdzenia, czy pozycja istnieje.
    """
    wynik_stacji = _stacja_w_odcinku(nn_source_ref=None)
    assert not wynik_stacji.get("error"), wynik_stacji
    snapshot = wynik_stacji["snapshot"]
    aparat = next(b for b in snapshot["branches"] if b.get("catalog_namespace") == "APARAT_SN")

    zle = execute_domain_operation(
        snapshot,
        "assign_catalog_to_element",
        {
            "element_ref": aparat["ref_id"],
            "catalog_binding": {
                "catalog_namespace": "APARAT_SN",
                "catalog_item_id": REF_APARAT_SN_ALT + LITEROWKA,
                "catalog_item_version": "2024.1",
            },
        },
    )
    assert zle.get("error_code") == "catalog.item_not_found", zle
    assert zle.get("snapshot") is None

    dobre = _wykonaj(
        snapshot,
        "assign_catalog_to_element",
        {
            "element_ref": aparat["ref_id"],
            "catalog_binding": {
                "catalog_namespace": "APARAT_SN",
                "catalog_item_id": REF_APARAT_SN_ALT,
                "catalog_item_version": "2024.1",
            },
        },
    )
    przepiety = next(b for b in dobre["branches"] if b["ref_id"] == aparat["ref_id"])
    assert przepiety["catalog_ref"] == REF_APARAT_SN_ALT
    assert przepiety["source_mode"] == "KATALOG"
    assert przepiety["materialized_params"]["catalog_item_id"] == REF_APARAT_SN_ALT
    assert tabliczki_znikad(dobre) == []


def test_przypisanie_katalogu_bez_ustalonej_kategorii_jest_odrzucane() -> None:
    """Bez kategorii nie ma czego sprawdzić w katalogu — brak deklaracji na wiarę."""
    snapshot = _wykonaj(_pusty_enm(), "add_grid_source_sn", _payload_gpz())
    szyna = snapshot["buses"][0]

    wynik = execute_domain_operation(
        snapshot,
        "assign_catalog_to_element",
        {"element_ref": szyna["ref_id"], "catalog_item_id": REF_APARAT_SN},
    )

    assert wynik.get("error_code") == "catalog.namespace_required", wynik
    assert wynik.get("snapshot") is None


def test_znacznik_pochodzenia_z_payloadu_nie_awansuje_zrodla_do_katalogu() -> None:
    """Ręczny ekwiwalent zwarciowy + `source_mode: KATALOG` z payloadu = zdanie
    nieprawdziwe w migawce; operacja musi je odrzucić, a nie zapisać.

    Karta FAB-G: tabliczka transformatora WN/SN dostaje TEN SAM kod
    `catalog.ref_required`, więc bez jawnej pary hv_voltage_kv/transformer_sn_mva
    test przechodziłby z właściwym kodem, ale z NIEWŁAŚCIWEGO powodu (brama
    transformatora, nie kłamstwo `source_mode`). Para poniżej domyka
    transformator, żeby jedyną pozostałą przyczyną odrzucenia był fałszywy
    znacznik pochodzenia źródła.
    """
    payload = {
        "source_name": "Stacja zasilająca ekspercka",
        "voltage_kv": 15.0,
        "manual_equivalent": {"sk3_mva": 250.0, "rx_ratio": 0.1},
        "source_mode": "KATALOG",
        "hv_voltage_kv": 110.0,
        "transformer_sn_mva": 25.0,
    }

    wynik = execute_domain_operation(_pusty_enm(), "add_grid_source_sn", payload)

    assert wynik.get("error_code") == "catalog.ref_required", wynik
    assert wynik.get("snapshot") is None
    assert "pochodzenia" in str(wynik.get("error")), (
        "Oczekiwano odrzucenia z powodu falszywego znacznika pochodzenia zrodla, "
        f"nie bramy transformatora: {wynik.get('error')}"
    )


def test_recznny_ekwiwalent_bez_znacznika_katalogowego_dziala_jak_dotad() -> None:
    """Tryb ekspercki bez fałszywej deklaracji przechodzi bez zmian.

    Transformator WN/SN GPZ powstaje NIEZALEŻNIE od trybu źródła (karta FAB-G) —
    para hv_voltage_kv/transformer_sn_mva domyka jego własną bramę katalogową.
    """
    snapshot = _wykonaj(
        _pusty_enm(),
        "add_grid_source_sn",
        {
            "source_name": "Stacja zasilająca ekspercka",
            "voltage_kv": 15.0,
            "manual_equivalent": {"sk3_mva": 250.0, "rx_ratio": 0.1},
            "hv_voltage_kv": 110.0,
            "transformer_sn_mva": 25.0,
        },
    )

    zrodlo = snapshot["sources"][0]
    assert zrodlo["source_mode"] == "EKSPERCKI_RECZNY"
    assert zrodlo["parameter_source"] == "MANUAL_EQUIVALENT"
    assert tabliczki_znikad(snapshot) == []


# ===========================================================================
# (e) PARYTET KONTROLI MOCY TRANSFORMATORA — stacja vs operacja atomowa
# ===========================================================================


def _werdykt_toru_stacyjnego(source_ref: str, nn_configuration: str) -> tuple[bool, str | None]:
    """(przyjęte?, kod błędu) dla źródła zakładanego RAZEM ze stacją."""
    wynik = _stacja_w_odcinku(nn_source_ref=source_ref, nn_configuration=nn_configuration)
    if wynik.get("error"):
        return False, str(wynik.get("error_code"))
    return True, None


def _werdykt_toru_atomowego(source_ref: str, technology: str) -> tuple[bool, str | None]:
    """(przyjęte?, kod błędu) dla źródła dokładanego do TEJ SAMEJ stacji osobno."""
    wynik_stacji = _stacja_w_odcinku(nn_source_ref=None)
    assert not wynik_stacji.get("error"), wynik_stacji
    snapshot = wynik_stacji["snapshot"]

    stacja = next(
        sub
        for sub in snapshot["substations"]
        if sub.get("station_type") != "gpz" and sub.get("transformer_refs")
    )
    transformator = next(
        t for t in snapshot["transformers"] if t["ref_id"] in (stacja.get("transformer_refs") or [])
    )
    bus_nn_ref = str(transformator["lv_bus_ref"])

    wynik = execute_domain_operation(
        snapshot,
        "add_converter_source",
        {
            "source_technology": technology,
            "connection_variant": "nn_side",
            "station_ref": stacja["ref_id"],
            "bus_nn_ref": bus_nn_ref,
            "placement": "NEW_FIELD",
            "source_field": {
                "source_field_kind": technology,
                "field_name": f"Pole {technology} nN",
                "catalog_binding": {
                    "catalog_namespace": "APARAT_NN",
                    "catalog_item_id": REF_APARAT_NN,
                    "catalog_item_version": "2024.1",
                },
            },
            "source_name": f"Blok {technology}",
            "quantity": 1,
            "catalog_binding": {
                "catalog_namespace": ("ZRODLO_NN_PV" if technology == "PV" else "ZRODLO_NN_BESS"),
                "catalog_item_id": source_ref,
                "catalog_item_version": "2024.1",
            },
        },
    )
    if wynik.get("error"):
        return False, str(wynik.get("error_code"))
    return True, None


@pytest.mark.parametrize(
    ("source_ref", "nn_configuration", "technology", "oczekiwane_przyjecie"),
    [
        (REF_PV_W_ZAKRESIE, "PV_INVERTER", "PV", True),
        (REF_PV_ZA_DUZY, "PV_INVERTER", "PV", False),
        (REF_BESS_ZA_DUZY, "BESS_INVERTER", "BESS", False),
    ],
)
def test_parytet_kontroli_mocy_transformatora_stacja_vs_operacja_atomowa(
    source_ref: str,
    nn_configuration: str,
    technology: str,
    oczekiwane_przyjecie: bool,
) -> None:
    """TA SAMA pozycja katalogowa i TEN SAM transformator 630 kVA → TEN SAM werdykt.

    Iloczyn cech: technologia (PV/BESS) × relacja mocy do transformatora
    (mieści się / przekracza). Przed naprawą tor stacyjny przyjmował wszystko.
    """
    stacyjny = _werdykt_toru_stacyjnego(source_ref, nn_configuration)
    atomowy = _werdykt_toru_atomowego(source_ref, technology)

    komunikat = f"Rozjazd werdyktów dla {source_ref}: stacyjny={stacyjny}, atomowy={atomowy}"
    assert stacyjny == atomowy, komunikat
    assert stacyjny[0] is oczekiwane_przyjecie, stacyjny
    if not oczekiwane_przyjecie:
        assert stacyjny[1] == "converter.transformer_capacity_exceeded"


def test_parytet_zgodnosci_napiec_zrodla_nn_z_szyna() -> None:
    """Falownik 0,69 kV na szynie 0,4 kV: oba tory odrzucają.

    Zmierzone przed naprawą: tor stacyjny zapisywał generator z tabliczką
    ``un_kv = 0,69`` na szynie 0,4 kV BEZ błędu, a jego moc czynna wchodziła
    wprost do bilansu rozpływu. Tor atomowy tę samą pozycję odrzucał.
    """
    snapshot, segment_ref = _ciag_sn()
    payload = {
        "segment_id": segment_ref,
        "insert_at": {"mode": "RATIO", "value": 0.5},
        "station": {
            "station_type": "inline",
            "station_name": "Stacja 0,4 kV",
            "sn_voltage_kv": 15.0,
            "nn_voltage_kv": 0.4,
        },
        **_blok_stacji(nn_source_ref="conv-pv-nn-0p5mw-0p69kv"),
    }

    wynik = execute_domain_operation(snapshot, "insert_station_on_segment_sn", payload)

    assert wynik.get("error_code") == "converter.voltage_mismatch", wynik
    assert wynik.get("snapshot") is None
    assert "0.69" in str(wynik.get("error")) or "0,69" in str(wynik.get("error"))


def test_parytet_wymogu_transformatora_stacja_vs_operacja_atomowa() -> None:
    """Stacja BEZ transformatora: oba tory odrzucają źródło po stronie nN.

    Ten sam próg wejścia co kontrola mocy, tylko o krok wcześniej — bez niego
    stacja bez transformatora przyjmowała źródło, które `add_converter_source`
    odrzuca kodem `<technologia>.transformer_required`.
    """
    snapshot, segment_ref = _ciag_sn()
    payload = {
        "segment_id": segment_ref,
        "insert_at": {"mode": "RATIO", "value": 0.5},
        "station": {
            "station_type": "inline",
            "station_name": "Stacja bez transformatora",
            "sn_voltage_kv": 15.0,
            "nn_voltage_kv": 0.4,
        },
        "sn_fields": [{"field_role": "LINIA_IN", "apparatus_catalog_ref": REF_APARAT_SN}],
        "field_apparatus_catalog_ref": REF_APARAT_SN,
        "transformer": {"create": False},
        "nn_block": {
            "nn_configuration": "PV_INVERTER",
            "source_converter_catalog_ref": REF_PV_W_ZAKRESIE,
            "source_converter_name": "Źródło nN bez transformatora",
            "outgoing_feeders_nn_count": 1,
        },
    }

    wynik = execute_domain_operation(snapshot, "insert_station_on_segment_sn", payload)

    assert wynik.get("error_code") == "pv.transformer_required", wynik
    assert wynik.get("snapshot") is None


def test_stacja_bez_transformatora_i_bez_zrodla_nn_dziala_jak_dotad() -> None:
    """Sam brak transformatora nie jest błędem — dopiero źródło nN go wymaga."""
    snapshot, segment_ref = _ciag_sn()
    wynikowa = _wykonaj(
        snapshot,
        "insert_station_on_segment_sn",
        {
            "segment_id": segment_ref,
            "insert_at": {"mode": "RATIO", "value": 0.5},
            "station": {
                "station_type": "inline",
                "station_name": "Stacja rozdzielcza",
                "sn_voltage_kv": 15.0,
                "nn_voltage_kv": 0.4,
            },
            "sn_fields": [{"field_role": "LINIA_IN", "apparatus_catalog_ref": REF_APARAT_SN}],
            "field_apparatus_catalog_ref": REF_APARAT_SN,
            "transformer": {"create": False},
        },
    )

    assert tabliczki_znikad(wynikowa) == []


def test_odrzucona_kontrola_mocy_nie_zostawia_stacji_w_migawce() -> None:
    """Werdykt odmowny kończy CAŁĄ operację stacyjną — bez połowicznej stacji."""
    wynik = _stacja_w_odcinku(nn_source_ref=REF_PV_ZA_DUZY)

    assert wynik.get("error_code") == "converter.transformer_capacity_exceeded", wynik
    assert wynik.get("snapshot") is None
