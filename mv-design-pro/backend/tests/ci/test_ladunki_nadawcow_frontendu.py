"""Ładunki operacji domenowych wysyłane przez seedy, narzędzia i specy e2e — w kontrakcie.

Czujnik dyspozytora (``tests/conftest.py``) widzi tylko nadawców ćwiczonych testami backendu.
Seedy ``frontend/scripts`` i specy e2e wysyłają operacje do żywego backendu poza pytestem —
klucz spoza kontraktu przepadał u nich bez śladu. Pomiar 2026-10-22 (przed naprawą): 8 par
nadawca × klucz — ``designation_q`` pola SN (seedy GN01/GN20/GN30, nazwa pola nigdy nie
trafiała do modelu), ``station.name_pl`` (seed GN01), ``name_pl`` słupa ZKSN (seed GN30),
``p_install_mw`` źródła OZE (generator dużej sieci), ``segment_ref`` punktu normalnie
otwartego (spec K2 — operacja odmawiała, spec był czerwony od karty W5-C).

Iloczyn cech w testach skanera: postać nadawcy {obiekt ``name``+``payload``, wywołanie
``'op', {…}``, wywołanie ``'op', zmienna``, krotka tablicowa, słownik Pythona, wywołanie
Pythona, ``curl -d`` powłoki} × klucz {w kontrakcie, obcy} × poziom {0, 1, element listy}
oraz kontekst formularza (``__mvdpOpenOperationForm``) — NIE ładunek.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from domain.canonical_operations import CANONICAL_OPERATIONS, klucze_spoza_kontraktu

from tests.ci.ladunki_nadawcow_frontendu import (
    Ladunek,
    ladunki_js,
    ladunki_nadawcow,
    ladunki_py,
    ladunki_sh,
    ladunki_zrodel_frontendu,
)

_FRONTEND = Path(__file__).resolve().parents[3] / "frontend"
_OPERACJE = frozenset(CANONICAL_OPERATIONS)

#: Pliki wołające endpoint ``domain-ops`` BEZ wysyłania ładunku — makiety odpowiedzi
#: (``page.route``) i fikstura kształtu odpowiedzi. Lista w obie strony: nadawca, którego
#: skaner nie rozpoznaje, czerwieni test (nie znika po cichu z kontroli).
PLIKI_BEZ_LADUNKU: dict[str, str] = {
    "e2e/create-first-case.spec.ts": "makieta odpowiedzi domain-ops (page.route)",
    "e2e/designer-flow-empty-state-cta.spec.ts": "makieta odpowiedzi domain-ops (page.route)",
    "e2e/designer-flow-multistep.spec.ts": "makieta odpowiedzi domain-ops (page.route)",
    "e2e/fixtures/emptyDomainOpsResponse.ts": "fikstura kształtu odpowiedzi",
    # Makieta odpowiedzi + formularze otwierane hakiem `__mvdpOpenOperationForm`
    # (kontekst formularza, nie ładunek).
    "e2e/ux-feedback-loop.spec.ts": "makieta odpowiedzi i kontekst formularza",
    # Karta UX-04/POLE-LINIOWE-WZORZEC: nasłuch żądań (`page.on('request')`) — spec liczy
    # operacje łączeniowe wysłane przez UI (klik = wybór, zero `open_switch`/`close_switch`),
    # sam nie wysyła ładunku; sieć buduje wyłącznie kanwa i kreatory.
    "e2e/ux04-pole-liniowe-zrzuty-screenshot.spec.ts": "nasłuch żądań domain-ops UI",
}


@pytest.fixture(scope="module")
def nadawcy() -> dict[str, list[Ladunek]]:
    wynik, bledy = ladunki_nadawcow(_FRONTEND, _OPERACJE)
    assert bledy == []
    return wynik


def _obce(ladunki: list[Ladunek]) -> list[str]:
    return [
        f"{x.plik}:{x.linia} {x.operacja} {klucze_spoza_kontraktu(x.operacja, x.tresc)}"
        for x in ladunki
        if klucze_spoza_kontraktu(x.operacja, x.tresc)
    ]


def test_ladunki_nadawcow_w_kontrakcie(nadawcy: dict[str, list[Ladunek]]) -> None:
    ladunki = [x for lista in nadawcy.values() for x in lista]
    assert len(ladunki) >= 300  # pomiar 2026-10-22: 365 ładunków w 72 plikach
    assert [
        f"{x.plik}:{x.linia} {x.operacja}" for x in ladunki if x.operacja not in _OPERACJE
    ] == []
    assert _obce(ladunki) == []


def test_ladunki_kodu_produktu_frontendu_w_kontrakcie() -> None:
    """Nadawcy w kodzie UI (karty, inspektor, menu SLD, kreatory) — pomiar 2026-10-22 przed
    naprawą: 13 ładunków z kluczem obcym w 11 plikach (``source_mode`` przypisania katalogu ×7,
    ``element_id``/``element_type`` kart słupa i ZKSN — przycisk „Dobierz z katalogu" zawsze
    kończył się odmową, ``action_id``/``source`` usuwania z menu SLD, ``source`` siatki
    właściwości, ``reason`` edycji parametrów — pole formularza bez czytelnika)."""
    ladunki, bledy = ladunki_zrodel_frontendu(_FRONTEND, _OPERACJE)
    assert bledy == []
    assert len(ladunki) >= 30  # pomiar 2026-10-22: 33 ładunki w 24 plikach
    assert _obce(ladunki) == []


def test_kazdy_plik_domain_ops_ma_ladunek_albo_wpis(nadawcy: dict[str, list[Ladunek]]) -> None:
    bez = {plik for plik, lista in nadawcy.items() if not lista}
    assert bez == set(PLIKI_BEZ_LADUNKU)


def test_wszystkie_rodzaje_nadawcow_rozpoznane(nadawcy: dict[str, list[Ladunek]]) -> None:
    """Skaner czyta seedy .mjs, skrypty Pythona i powłoki oraz specy e2e — żadna rodzina
    plików nie wypada po cichu (np. po zmianie wzorca wysyłki)."""
    rozszerzenia = {plik.rsplit(".", 1)[1] for plik, lista in nadawcy.items() if lista}
    assert rozszerzenia == {"mjs", "py", "sh", "ts"}


# --- skaner: iloczyn postaci nadawcy × klucz × poziom (źródła syntetyczne) ---------------

_OBCY = "klucz_obcy"


def _js(zrodlo: str) -> list[Ladunek]:
    wynik, bledy = ladunki_js("x.ts", zrodlo, _OPERACJE)
    assert bledy == []
    return wynik


_POSTACI_JS = {
    "obiekt_operacji": "await api({{ operation: {{ name: 'add_grid_source_sn', payload: {L} }} }});",
    "wywolanie_literal": "await op(request, caseId, 'add_grid_source_sn', {L});",
    "wywolanie_zmienna": "const dane = {L};\nawait op(request, caseId, 'add_grid_source_sn', dane);",
    "krotka": "for (const [n, p] of [['add_grid_source_sn', {L}]]) await op(n, p);",
}


@pytest.mark.parametrize("postac", sorted(_POSTACI_JS))
@pytest.mark.parametrize(
    ("ladunek", "oczekiwane"),
    [
        ("{ voltage_kv: 15, catalog_ref: 'x' /* } */ }", []),
        ("{ voltage_kv: 15, line_fields_count: 3 }", ["line_fields_count"]),
        ("{ voltage_kv, 'catalog_ref': `a${b}`, }", []),
    ],
    ids=["w_kontrakcie", "obcy", "skrot_i_szablon"],
)
def test_skaner_js_postac_x_klucz(postac: str, ladunek: str, oczekiwane: list[str]) -> None:
    (x,) = _js(_POSTACI_JS[postac].format(L=ladunek))
    assert (x.operacja, klucze_spoza_kontraktu(x.operacja, x.tresc)) == (
        "add_grid_source_sn",
        oczekiwane,
    )


@pytest.mark.parametrize(
    ("ladunek", "oczekiwane"),
    [
        ("{ segment: { rodzaj: 'KABEL', dlugosc_m: 1 } }", []),
        (f"{{ segment: {{ rodzaj: 'KABEL', {_OBCY}: 1 }} }}", [f"segment.{_OBCY}"]),
        (
            f"{{ segment: {{ catalog_binding: {{ catalog_item_id: f(), {_OBCY}: 1 }} }} }}",
            [f"segment.catalog_binding.{_OBCY}"],
        ),
    ],
    ids=["poziom_1_w_kontrakcie", "poziom_1_obcy", "poziom_2_obcy"],
)
def test_skaner_js_poziom_zagniezdzenia(ladunek: str, oczekiwane: list[str]) -> None:
    (x,) = _js(f"op(r, c, 'continue_trunk_segment_sn', {ladunek});")
    assert klucze_spoza_kontraktu(x.operacja, x.tresc) == oczekiwane


def test_skaner_js_element_listy_obcy() -> None:
    (x,) = _js(
        "op(r, c, 'insert_station_on_segment_sn', "
        f"{{ segment_id: s, sn_fields: ['IN', {{ {_OBCY}: 1 }}] }});"
    )
    assert klucze_spoza_kontraktu(x.operacja, x.tresc) == [f"sn_fields[1].{_OBCY}"]


def test_skaner_js_rozwiniecie_niedomkniete_a_klucz_obcy_wykryty() -> None:
    (x,) = _js(f"op(r, c, 'add_grid_source_sn', {{ ...baza, [k]: 1, {_OBCY}: 2 }});")
    assert x.niedomkniety
    assert klucze_spoza_kontraktu(x.operacja, x.tresc) == [_OBCY]


@pytest.mark.parametrize(
    "zrodlo",
    [
        f"window.__mvdpOpenOperationForm('insert_station_on_segment_sn', {{ {_OBCY}: 1 }});",
        f"g.__mvdpOpenOperationForm?.('insert_station_on_segment_sn', {{ {_OBCY}: 1 }});",
        f"await openOperationForm(page, 'add_converter_source', {{ {_OBCY}: 1 }});",
    ],
    ids=["hak", "hak_opcjonalny", "pomocnik_speku"],
)
def test_skaner_js_kontekst_formularza_nie_jest_ladunkiem(zrodlo: str) -> None:
    assert _js(zrodlo) == []


@pytest.mark.parametrize(
    ("deklaracja", "oczekiwane"),
    [
        ("const dane: Record<string, unknown> = { voltage_kv: 1 };", []),
        (f"const dane: Record<string, unknown> = {{ {_OBCY}: 1 }};", [_OBCY]),
        (f"const dane = {{ voltage_kv: 1 }};\nif (x) dane.{_OBCY} = 2;", [_OBCY]),
        ("const dane = { voltage_kv: 1 };\nif (dane.voltage_kv === 2) f();", []),
    ],
    ids=["adnotacja_w_kontrakcie", "adnotacja_obcy", "dopisany_obcy", "porownanie_nie_dopisuje"],
)
def test_skaner_js_zmienna_z_typem_i_dopisanymi_kluczami(
    deklaracja: str, oczekiwane: list[str]
) -> None:
    (x,) = _js(f"{deklaracja}\nawait op(caseId, 'add_grid_source_sn', dane);")
    assert klucze_spoza_kontraktu(x.operacja, x.tresc) == oczekiwane


def test_skaner_js_alias_formularza_nie_jest_ladunkiem() -> None:
    zrodlo = (
        "const openForm = useNetworkBuildStore((state) => state.openOperationForm);\n"
        f"openForm('continue_trunk_segment_sn', {{ {_OBCY}: 'SN' }});\n"
        f"execute(caseId, 'continue_trunk_segment_sn', {{ {_OBCY}: 1 }});"
    )
    (x,) = _js(zrodlo)  # wyłącznie wysyłka — alias formularza pominięty
    assert klucze_spoza_kontraktu(x.operacja, x.tresc) == [_OBCY]


def test_skaner_js_napis_z_ukosnikiem_i_regex_nie_psuja_nawiasow() -> None:
    zrodlo = (
        "const re = /[{(]/g; const s = 'a\\'{'; // { komentarz\n"
        f"op(r, c, 'add_grid_source_sn', {{ voltage_kv: 1, {_OBCY}: 2 }});"
    )
    (x,) = _js(zrodlo)
    assert klucze_spoza_kontraktu(x.operacja, x.tresc) == [_OBCY]


@pytest.mark.parametrize(
    "zrodlo",
    [
        f'api({{"name": "add_grid_source_sn", "payload": {{"voltage_kv": 1, "{_OBCY}": 2}}}})',
        f'operacja("add_grid_source_sn", {{"voltage_kv": 1, "{_OBCY}": 2}})',
    ],
    ids=["slownik_operacji", "wywolanie"],
)
def test_skaner_py_klucz_obcy(zrodlo: str) -> None:
    (x,) = ladunki_py("x.py", zrodlo, _OPERACJE)
    assert klucze_spoza_kontraktu(x.operacja, x.tresc) == [_OBCY]


def test_skaner_sh_klucz_obcy_zagniezdzony() -> None:
    zrodlo = (
        'curl -s -X POST "$U" -d "{\\"operation\\":{\\"name\\":\\"add_grid_source_sn\\",'
        f'\\"payload\\":{{\\"voltage_kv\\":1,\\"{_OBCY}\\":\\"$X\\"}}}}}}" -o /dev/null\n'
    )
    (x,), bledy = ladunki_sh("x.sh", zrodlo)
    assert bledy == []
    assert klucze_spoza_kontraktu(x.operacja, x.tresc) == [_OBCY]
