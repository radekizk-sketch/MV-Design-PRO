"""Rejestr typów zdarzeń domenowych = DOKŁADNIE typy emitowane przez operacje (W5-C).

Dawna lista ``DOMAIN_EVENT_TYPES`` (i jej martwa kopia ``enm/domain_event_types.py``)
rozjechała się z kodem w obu kierunkach: operacje emitowały typy spoza rejestru
(``SWITCH_OPENED`` nie miałby gdzie trafić), a rejestr niósł typy, których nikt nie emituje.
Ten test pilnuje obu kierunków skanem AST całego ``src/enm``:

* literał przy kluczu ``"event_type"`` w słowniku (także obie gałęzie wyrażenia
  warunkowego ``"A" if … else "B"``);
* pierwszy argument lokalnej funkcji emisji ``_emit("…", …)``;
* pośrednie źródła typu — ZAMKNIĘTA lista funkcji, w których wartość ``"event_type"``
  jest zmienną: każda pozycja ma tu jawne wyprowadzenie zbioru typów; nowa pośredniość
  bez wpisu zapala test (inaczej typ spoza rejestru przeszedłby niezauważony).
"""

from __future__ import annotations

import ast
from collections.abc import Callable
from pathlib import Path

from enm.domain_operations import _NN_SOURCE_KIND_MAP
from enm.domain_ops_models import DOMAIN_EVENT_TYPES

SRC_ENM = Path(__file__).resolve().parents[2] / "src" / "enm"


def _moduly() -> list[tuple[Path, ast.Module]]:
    return [
        (sciezka, ast.parse(sciezka.read_text(encoding="utf-8")))
        for sciezka in sorted(SRC_ENM.rglob("*.py"))
    ]


def _stale(wezel: ast.expr) -> list[str] | None:
    """Typy z literału albo z obu gałęzi warunku; ``None`` = wartość nie jest literałem."""
    if isinstance(wezel, ast.Constant) and isinstance(wezel.value, str):
        return [wezel.value]
    if isinstance(wezel, ast.IfExp):
        lewa, prawa = _stale(wezel.body), _stale(wezel.orelse)
        if lewa is not None and prawa is not None:
            return lewa + prawa
    return None


def _typy_konwertera() -> set[str]:
    """``_resolve_converter_defaults`` zwraca krotki ``(nazwa, typ, ZDARZENIE, meta, p)``."""
    (modul,) = (m for s, m in _moduly() if s.name == "domain_operations_v2.py")
    (funkcja,) = (
        w
        for w in ast.walk(modul)
        if isinstance(w, ast.FunctionDef) and w.name == "_resolve_converter_defaults"
    )
    typy: set[str] = set()
    for zwrot in ast.walk(funkcja):
        if isinstance(zwrot, ast.Return) and isinstance(zwrot.value, ast.Tuple):
            stale = _stale(zwrot.value.elts[2])
            assert stale is not None, ast.unparse(zwrot)
            typy.update(stale)
    assert typy, "brak typów zdarzeń konwertera"
    return typy


def _typy_zrodel_nn() -> set[str]:
    return {spec[-1] for spec in _NN_SOURCE_KIND_MAP.values()}


def _typy_zrodel_dyspozycyjnych() -> set[str]:
    """``_zdarzenia_ze_zrodlem(zdarzenia_pola, typ, ref)``: typ zdarzenia źródła to literał
    drugiego argumentu każdego wywołania (agregat, UPS); zdarzenia pola mają typy z literałów
    podoperacji pola (zebrane skanem literałów)."""
    (modul,) = (m for s, m in _moduly() if s.name == "domain_operations_v2.py")
    typy: set[str] = set()
    for wezel in ast.walk(modul):
        if (
            isinstance(wezel, ast.Call)
            and isinstance(wezel.func, ast.Name)
            and wezel.func.id == "_zdarzenia_ze_zrodlem"
        ):
            stale = _stale(wezel.args[1])
            assert stale is not None, ast.unparse(wezel)
            typy.update(stale)
    assert typy, "brak wywołań _zdarzenia_ze_zrodlem"
    return typy


#: ZAMKNIĘTA lista pośrednich źródeł typu zdarzenia: (plik, NAJBLIŻSZA funkcja) → zbiór
#: typów. Zmienna przy ``"event_type"`` poza tą listą to błąd testu (nowa pośredniość
#: bez wpisu — typ spoza rejestru przeszedłby niezauważony).
POSREDNIE: dict[tuple[str, str], Callable[[], set[str]]] = {
    # `_create_nn_source_for_station` zwraca (generator_ref, event_type) z tablicy
    # `_NN_SOURCE_KIND_MAP`; wołający wpisują go do zdarzenia.
    ("domain_operations.py", "insert_station_on_segment_sn"): _typy_zrodel_nn,
    ("domain_operations.py", "append_station_on_endpoint"): _typy_zrodel_nn,
    # Źródło przekształtnikowe SN: typ z `_resolve_converter_defaults`.
    ("domain_operations_v2.py", "add_converter_source"): _typy_konwertera,
    # Lokalna funkcja emisji `_emit(event_type_name, …)` w `_add_converter_source_der_sn`:
    # typy to literały argumentów `_emit("…")` (zebrane skanem wywołań) oraz typ
    # konwertera (`_emit(event_type, …)`).
    ("domain_operations_v2.py", "_emit"): _typy_konwertera,
    # Zdarzenia pól przekazane z podoperacji (`field_events`): ich typy pochodzą
    # z literałów słowników zdarzeń tych podoperacji (zebrane skanem literałów).
    ("domain_operations_v2.py", "add_converter_source#field_events"): set,
    # Agregat/UPS nN w polu: zdarzenia pola + zdarzenie źródła o typie z argumentu.
    ("domain_operations_v2.py", "_zdarzenia_ze_zrodlem"): _typy_zrodel_dyspozycyjnych,
}


def _najblizsze_funkcje(modul: ast.Module) -> dict[int, str]:
    """id węzła → nazwa NAJBLIŻSZEJ obejmującej funkcji (zagnieżdżone liczą się osobno)."""
    wynik: dict[int, str] = {}

    def odwiedz(wezel: ast.AST, funkcja: str) -> None:
        for dziecko in ast.iter_child_nodes(wezel):
            nazwa = (
                dziecko.name
                if isinstance(dziecko, ast.FunctionDef | ast.AsyncFunctionDef)
                else funkcja
            )
            wynik[id(dziecko)] = nazwa
            odwiedz(dziecko, nazwa)

    odwiedz(modul, "<moduł>")
    return wynik


def _zebrane() -> tuple[set[str], list[str]]:
    typy: set[str] = set()
    nieznane: list[str] = []
    for sciezka, modul in _moduly():
        funkcje = _najblizsze_funkcje(modul)
        for wezel in ast.walk(modul):
            if (
                isinstance(wezel, ast.Call)
                and isinstance(wezel.func, ast.Name)
                and wezel.func.id == "_emit"
                and wezel.args
            ):
                stale = _stale(wezel.args[0])
                if stale is not None:
                    typy.update(stale)
            if not isinstance(wezel, ast.Dict):
                continue
            for klucz, wartosc in zip(wezel.keys, wezel.values, strict=True):
                if not (isinstance(klucz, ast.Constant) and klucz.value == "event_type"):
                    continue
                stale = _stale(wartosc)
                if stale is not None:
                    typy.update(stale)
                    continue
                funkcja = funkcje[id(wezel)]
                if ast.unparse(wartosc) == "raw_event['event_type']":
                    funkcja += "#field_events"
                if (sciezka.name, funkcja) not in POSREDNIE:
                    nieznane.append(f"{sciezka.name}:{wezel.lineno} {funkcja}")
    for wyprowadzenie in POSREDNIE.values():
        typy.update(wyprowadzenie())
    return typy, nieznane


def test_kazda_wartosc_event_type_ma_wyprowadzenie() -> None:
    _typy, nieznane = _zebrane()
    assert not nieznane, (
        "Zdarzenie domenowe z typem ze zmiennej bez wpisu w POSREDNIE — dopisz jawne "
        f"wyprowadzenie zbioru typów: {sorted(set(nieznane))}"
    )


def test_rejestr_rowny_typom_emitowanym() -> None:
    emitowane, _ = _zebrane()
    rejestr = set(DOMAIN_EVENT_TYPES)
    assert emitowane - rejestr == set(), f"emitowane spoza rejestru: {sorted(emitowane - rejestr)}"
    assert rejestr - emitowane == set(), f"w rejestrze, nieemitowane: {sorted(rejestr - emitowane)}"


def test_rejestr_bez_powtorzen_i_posortowany() -> None:
    assert len(DOMAIN_EVENT_TYPES) == len(set(DOMAIN_EVENT_TYPES))
    assert list(DOMAIN_EVENT_TYPES) == sorted(DOMAIN_EVENT_TYPES)


def test_operacje_lacznikow_emituja_typy_z_rejestru() -> None:
    """Typy W5-C (otwarcie/zamknięcie łącznika, punkt podziału, wyposażenie pola) oraz
    położenie łącznika pola bez własnej gałęzi (`set_bay_apparatus_position`, karta pola BKR —
    typ był emitowany spoza rejestru, bramka sesji głównej na dbe7c130b)."""
    assert {
        "SWITCH_OPENED",
        "SWITCH_CLOSED",
        "NOP_SET",
        "NOP_CLEARED",
        "BAY_EQUIPMENT_SET",
        "BAY_APPARATUS_POSITION_SET",
    } <= set(DOMAIN_EVENT_TYPES)


def test_martwa_kopia_rejestru_skasowana() -> None:
    assert not (SRC_ENM / "domain_event_types.py").exists()
