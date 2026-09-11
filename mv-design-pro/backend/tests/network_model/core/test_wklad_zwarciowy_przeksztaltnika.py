"""Wkład zwarciowy falownika: skąd wzięło się ``k_sc`` MUSI być widać w śladzie.

DEFEKT ZMIERZONY (2026-09-11), cztery warstwy jednej sprawy:

1. Liczba ``1.1`` wpisana NA SZTYWNO w dziewięciu niezależnych miejscach, bez
   jednego zdania uzasadnienia w całym repozytorium.
2. `solver_input/builder.py` deklaruje w docstringu „NO heuristics, NO default
   physical values, NO data guessing" — a `k_sc` był dokładnie domyślną wartością
   fizyczną. `SourceKind.DEFAULT_FORBIDDEN` istniał w kontrakcie i NIE BYŁ
   emitowany ANI RAZU (obietnica bez testu).
3. Ślad proweniencji oznaczał `k_sc` jako ``CATALOG`` ze ścieżką
   ``converter_types[<ref>]``, choć ŻADNA ze 176 pozycji przekształtników nie ma
   ani `sc_model`, ani samego pola `k_sc`. Audytor widział daną producenta tam,
   gdzie producent niczego nie podał — fałszywy znacznik UKRYWAŁ domyślkę.
4. `MaterializedSourceParams.k_sc` był polem kontraktu BEZ PRODUCENTA: żadna
   operacja domenowa go nie zapisywała, więc deklaracja projektanta nie miała jak
   dotrzeć do solvera.

Wynik trafia do doboru aparatury i nastaw zabezpieczeń, więc to nie jest
kosmetyka śladu.

CZEGO TE TESTY NIE TWIERDZĄ: że ``1.1`` jest wartością normatywną. Zostaje jako
jawnie nazwana DOMYŚLNA SYSTEMOWA — stan „nikt nie podał danych".
"""

from __future__ import annotations

import ast
import pathlib

import pytest
from network_model.core.generator import GeneratorNN, GeneratorSN
from network_model.core.inverter import InverterSource
from network_model.core.wklad_zwarciowy_przeksztaltnika import (
    K_SC_DOMYSLNY_SYSTEMOWY,
    K_SC_ZRODLO_DEKLARACJA,
    K_SC_ZRODLO_DOMYSLNE,
    wspolczynnik_wkladu_zwarciowego,
)

KORZEN_SRC = pathlib.Path(__file__).resolve().parents[3] / "src"


# ---------------------------------------------------------------------------
# (a) JEDEN predykat akceptacji — iloczyn cech, nie przykład
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("wejscie", "oczekiwana_wartosc", "oczekiwane_zrodlo"),
    [
        (1.35, 1.35, K_SC_ZRODLO_DEKLARACJA),
        (1.0, 1.0, K_SC_ZRODLO_DEKLARACJA),
        (2.5, 2.5, K_SC_ZRODLO_DEKLARACJA),
        (None, K_SC_DOMYSLNY_SYSTEMOWY, K_SC_ZRODLO_DOMYSLNE),
        (0, K_SC_DOMYSLNY_SYSTEMOWY, K_SC_ZRODLO_DOMYSLNE),
        (0.0, K_SC_DOMYSLNY_SYSTEMOWY, K_SC_ZRODLO_DOMYSLNE),
        (-1.2, K_SC_DOMYSLNY_SYSTEMOWY, K_SC_ZRODLO_DOMYSLNE),
        ("1.35", K_SC_DOMYSLNY_SYSTEMOWY, K_SC_ZRODLO_DOMYSLNE),
        (True, K_SC_DOMYSLNY_SYSTEMOWY, K_SC_ZRODLO_DOMYSLNE),
        (False, K_SC_DOMYSLNY_SYSTEMOWY, K_SC_ZRODLO_DOMYSLNE),
    ],
)
def test_predykat_akceptacji_jest_jeden_dla_wszystkich_torow(
    wejscie: object, oczekiwana_wartosc: float, oczekiwane_zrodlo: str
) -> None:
    """Zero, ujemna, tekst i ``bool`` to BRAK DANYCH — nie okazja do korekty.

    ROZJAZD, KTÓRY TO ZAMYKA: ``data.get("k_sc", 1.1)`` przyjmowało zero i
    wartości ujemne (dając wkład zwarciowy 0 albo ujemny), a
    ``isinstance(...) and k_sc > 0`` w innym torze je odrzucało. Ta sama dana
    dawała różny wynik zależnie od tego, którędy weszła do modelu.

    ``bool`` ma własny przypadek, bo jest podklasą ``int``: bez jawnej gałęzi
    ``True`` przeszłoby jako deklaracja ``k_sc = 1.0``.
    """
    wartosc, zrodlo = wspolczynnik_wkladu_zwarciowego(wejscie)
    assert wartosc == pytest.approx(oczekiwana_wartosc)
    assert zrodlo == oczekiwane_zrodlo


# ---------------------------------------------------------------------------
# (b) KLASA, NIE INSTANCJA — skan AST po całym `src`
# ---------------------------------------------------------------------------


def _przypisania_k_sc_ze_stala() -> list[str]:
    """Miejsca, które przypisują ``k_sc`` literałem liczbowym zamiast predykatem."""
    znaleziska: list[str] = []
    for plik in sorted(KORZEN_SRC.rglob("*.py")):
        if plik.name == "wklad_zwarciowy_przeksztaltnika.py":
            continue  # jedyne miejsce, w którym stała ma prawo istnieć
        try:
            drzewo = ast.parse(plik.read_text(encoding="utf-8"))
        except SyntaxError:  # pragma: no cover - plik niepoprawny złapie lint
            continue
        for wezel in ast.walk(drzewo):
            wartosc = None
            if isinstance(wezel, ast.keyword) and wezel.arg == "k_sc":
                wartosc = wezel.value
            elif isinstance(wezel, ast.AnnAssign) and isinstance(wezel.target, ast.Name):
                if wezel.target.id == "k_sc":
                    wartosc = wezel.value
            if isinstance(wartosc, ast.Constant) and isinstance(wartosc.value, int | float):
                znaleziska.append(f"{plik.relative_to(KORZEN_SRC)}: k_sc = {wartosc.value}")
    return znaleziska


def test_zadne_miejsce_w_src_nie_wpisuje_k_sc_literalem() -> None:
    """Skan KLASY: dziewięć kopii tej samej liczby to dziewięć okazji do rozjazdu.

    Test jest strukturalny świadomie. Wersja behawioralna sprawdziłaby tory,
    które ktoś przewidział; ta zapala się na SAMO POJAWIENIE SIĘ nowej kopii —
    także w torze, którego dziś nie ma.
    """
    znaleziska = _przypisania_k_sc_ze_stala()
    assert not znaleziska, (
        "Współczynnik wkładu zwarciowego wpisany literałem zamiast przez "
        "`wspolczynnik_wkladu_zwarciowego`: " + "; ".join(znaleziska)
    )


@pytest.mark.parametrize("klasa", [GeneratorSN, GeneratorNN])
def test_klasy_generatorow_uzywaja_wspolnej_stalej(klasa: type) -> None:
    """Klasy generatorów niosą współczynnik wprost — z jednej wspólnej stałej."""
    assert klasa().k_sc == pytest.approx(K_SC_DOMYSLNY_SYSTEMOWY)


def test_falownik_bez_deklaracji_nie_udaje_ze_ktos_ja_zlozyl() -> None:
    """POMINIĘTY argument daje ``None`` w polu i domyślkę w rachunku.

    Rozróżnienie jest całym sensem tej naprawy, więc ma własny przypadek:
    ``k_sc is None`` mówi „nikt nie podał", a ``k_sc_efektywny`` mówi „czym
    liczymy mimo to". Gdyby pole niosło od razu 1,1, jeden zapis modelu i obieg
    przez `from_dict` zamieniłby brak danych w deklarację.
    """
    falownik = InverterSource(in_rated_a=100.0)
    assert falownik.k_sc is None
    assert falownik.k_sc_efektywny == pytest.approx(K_SC_DOMYSLNY_SYSTEMOWY)
    assert falownik.k_sc_zrodlo == K_SC_ZRODLO_DOMYSLNE


# ---------------------------------------------------------------------------
# (c) ŚLAD ODRÓŻNIA deklarację od domyślki — to jest cała treść naprawy
# ---------------------------------------------------------------------------


def test_zrodlo_wspolczynnika_jest_zapisane_w_modelu() -> None:
    """Bez tego pola wynik z karty producenta i wynik z domyślki są nieodróżnialne."""
    z_deklaracji = InverterSource.from_dict({"in_rated_a": 100.0, "k_sc": 1.35})
    assert z_deklaracji.k_sc == pytest.approx(1.35)
    assert z_deklaracji.k_sc_zrodlo == K_SC_ZRODLO_DEKLARACJA

    bez_deklaracji = InverterSource.from_dict({"in_rated_a": 100.0})
    assert bez_deklaracji.k_sc is None
    assert bez_deklaracji.k_sc_efektywny == pytest.approx(K_SC_DOMYSLNY_SYSTEMOWY)
    assert bez_deklaracji.k_sc_zrodlo == K_SC_ZRODLO_DOMYSLNE


def test_obieg_serializacji_nie_zamienia_domyslki_w_deklaracje() -> None:
    """``from_dict(to_dict(x))`` MUSI zachować rozróżnienie w OBU stanach.

    Gdyby serializacja niosła wartość efektywną zamiast deklaracji, domyślka
    (1,1 — liczba dodatnia) wróciłaby z odczytu jako deklaracja i po jednym
    zapisie modelu ślad White Box przestałby odróżniać oba przypadki. To jest
    predykat PARAMI: zapis i odczyt muszą czytać TO SAMO pole.
    """
    for zrodlo in (InverterSource(in_rated_a=100.0), InverterSource(in_rated_a=100.0, k_sc=1.35)):
        po_obiegu = InverterSource.from_dict(zrodlo.to_dict())
        assert po_obiegu.k_sc == zrodlo.k_sc
        assert po_obiegu.k_sc_zrodlo == zrodlo.k_sc_zrodlo
        assert po_obiegu.ik_sc_a == pytest.approx(zrodlo.ik_sc_a)


def test_wklad_zwarciowy_liczy_sie_z_zadeklarowanego_wspolczynnika() -> None:
    """``I_k = k_sc · I_n`` — deklaracja MUSI zmieniać wynik, inaczej jest phantomem.

    Gdyby `k_sc` docierał do modelu, ale nie do rachunku, cała droga deklaracji
    byłaby kontrolką, której nikt nie czyta (zakaz z dyrektywy „zero fabrykacji").
    """
    domyslny = InverterSource(in_rated_a=200.0)
    zadeklarowany = InverterSource.from_dict({"in_rated_a": 200.0, "k_sc": 1.5})
    assert domyslny.ik_sc_a == pytest.approx(200.0 * K_SC_DOMYSLNY_SYSTEMOWY)
    assert zadeklarowany.ik_sc_a == pytest.approx(300.0)
    assert zadeklarowany.ik_sc_a != pytest.approx(domyslny.ik_sc_a)
