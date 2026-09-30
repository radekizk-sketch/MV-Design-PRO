"""Jedna reguła nazwy elementu (karta NAZWY-JEDNO-ZRODLO).

PO CO. Karty #142 (słownik komunikatów) i #144 (nazwy elementów) powstały równolegle i po
scaleniu miały dwa predykaty „czy element ma nazwę": słownik odrzucał nazwy o kształcie
identyfikatora i kodu (`tr_sn_nn`, `QF-03_zrodlo`), moduł nazw przyjmował każdy niepusty napis.
Element „T_1" nazwany tak przez projektanta był nazwą w etykiecie wyniku i „bez nazwy" w zdaniu
komunikatu. Poza tymi dwoma w `src/**` żyło ponad sto lokalnych odpowiedzi na to samo pytanie
(`payload.get("name") or "Kabel nN"`, `nazwa.strip() and nazwa.strip() != ref`,
`d.get("name", "—")`), z których każda inaczej traktowała pusty napis i same spacje.

CO PRZYPINA:
  1. Strażnik klasy (AST, zapadka): żaden moduł `src/**` poza liściem `network_model/nazwy.py`
     (predykat, jedyna ścieżka importu — `enm/nazwy_elementow.py` go nie re-eksportuje)
     nie rozstrzyga sam, czy wartość pola nazwy jest nazwą — pyta
     `jest_nazwa`/`nazwa_nadana*`. Wyjątki wyłącznie w rdzeniach B-01 (`DOZWOLONE`).
  2. Iloczyn cech: wartość {nazwa zwykła, pusta, same spacje, kształt identyfikatora, kształt
     kodu, oznaczenie z arkusza} × miejsce {nazwa nadana przez operację, etykieta wyniku,
     zdanie komunikatu, nazwa pozycji katalogu} — jedna odpowiedź w każdym polu.

CZEGO SKANER NIE WIDZI (reguła KLASA pkt 4 — zieleń nie znaczy więcej, niż znaczy):
  * nazwy przekazanej przez strukturę (`t = (x.get("name"),)` i odczyt `t[0]`) albo przez
    parametr funkcji o nazwie bez tokenu `name`/`nazwa` (`def f(etykieta): if etykieta: …`);
  * prawdziwości pola nazwy czytanego kluczem dynamicznym (`x.get(klucz)`);
  * pól nazwy bez tokenu `name`/`nazwa` (`label`, `title`) — te rodziny
    pilnuje `scripts/nazwa_bez_identyfikatora_guard.py` od strony „nazwa nigdy z
    identyfikatora", nie od strony predykatu.
"""

from __future__ import annotations

import ast
import copy
from pathlib import Path
from typing import Any

import pytest
from enm import nazwy_elementow as nazwy
from enm import slownik_komunikatow as slownik
from network_model import nazwy as predykat

SRC = Path(__file__).resolve().parents[2] / "src"

# ---------------------------------------------------------------------------
# 1. Strażnik klasy — AST na całym `src/**`
# ---------------------------------------------------------------------------

#: Moduł, który JEDYNY odpowiada, czy wartość jest nazwą (liść `network_model`; powód
#: położenia w nagłówku liścia). Importuje się go wyłącznie spod tej nazwy.
MODUL_NAZW = "network_model/nazwy.py"

#: Nazwy PROGRAMOWE (plik, arkusz, kolumna, operacja, klasa, pole kontraktu, kubełek, krój
#: pisma) — to nie są nazwy elementów sieci ani pozycji katalogu. Ta sama lista co
#: `WYKLUCZONE_NAZWY` strażnika `scripts/nazwa_bez_identyfikatora_guard.py` + `bucket_name`.
NAZWY_PROGRAMOWE = frozenset(
    {
        "filename",
        "file_name",
        "nazwa_pliku",
        "sheet_name",
        "nazwa_arkusza",
        "column_name",
        "nazwa_kolumny",
        "op_name",
        "operation_name",
        "class_name",
        "module_name",
        "param_name",
        "attr_name",
        "key_name",
        "tag_name",
        "table_name",
        "schema_name",
        "queue_name",
        "task_name",
        "logger_name",
        "env_name",
        "bucket_name",
    }
)

#: Lista dozwolona (TOŻSAMOŚĆ `plik:funkcja:forma` → (liczba, uzasadnienie)). Zapadka w obie
#: strony: nowe wystąpienie albo wzrost = czerwony; spadek albo zniknięcie = czerwony („obniż
#: wpis"). Wyłącznie rdzenie zamrożone B-01 (`scripts/rdzenie_b01.py`) — ich edycja wymaga
#: decyzji właściciela; zapasy nie odpalają w torze kanonicznym (uzasadnienia przy wpisach).
DOZWOLONE: dict[str, tuple[int, str]] = {
    "network_model/solvers/short_circuit_iec60909.py:"
    "ShortCircuitIEC60909Solver._append_transformer_kt_trace:or": (
        1,
        "Rdzeń B-01 (IEC 60909). Zapas `branch.name or branch_id` nie odpala: mapowanie "
        "ENM → graf (`enm/mapping.py`) nadaje każdej gałęzi grafu nazwę przez "
        "`nazwa_elementu` (nazwa z modelu albo opis rodzaju, nigdy pusta).",
    ),
    "network_model/solvers/ncrfg_ptpiree/engine.py:NcRfgPtpireeSolver._run_module:or": (
        1,
        "Rdzeń B-01 (NC RfG/PTPiREE). Moduł DER budowany przez most modelu "
        "(`application/ncrfg_compliance/model_bridge.py`) zawsze niesie `der_name` z "
        "`nazwa_elementu` — zapas na identyfikator nie odpala.",
    ),
    "network_model/solvers/ncrfg_ptpiree/engine.py:NcRfgPtpireeSolver._build_report:or": (
        1,
        "Rdzeń B-01 (NC RfG/PTPiREE) — ten sam zapas co w `_run_module`, nie odpala.",
    ),
}


def _nazwa_pola(tekst: str) -> bool:
    """Klucz/zmienna/atrybut nazwy: token `name`/`nazwa` rozdzielony podkreśleniem."""
    tekst = tekst.lower()
    if tekst in NAZWY_PROGRAMOWE:
        return False
    return any(token in ("name", "nazwa") for token in tekst.split("_"))


def _stala(wezel: ast.AST | None) -> str | None:
    if isinstance(wezel, ast.Constant) and isinstance(wezel.value, str):
        return wezel.value
    return None


def _odczyt_nazwy(wezel: ast.AST) -> bool:
    """Surowy odczyt pola nazwy: `x.get("name")`, `x["name"]`, `x.name`, `getattr(x, "name")`
    (także owinięty w `str(…)`, `….strip()` albo `… or ""`)."""
    if isinstance(wezel, ast.Call):
        funkcja = wezel.func
        if isinstance(funkcja, ast.Attribute) and funkcja.attr == "get" and wezel.args:
            klucz = _stala(wezel.args[0])
            return klucz is not None and _nazwa_pola(klucz)
        if isinstance(funkcja, ast.Name) and funkcja.id == "getattr" and len(wezel.args) >= 2:
            klucz = _stala(wezel.args[1])
            return klucz is not None and _nazwa_pola(klucz)
        if isinstance(funkcja, ast.Name) and funkcja.id == "str" and len(wezel.args) == 1:
            return _odczyt_nazwy(wezel.args[0])
        if isinstance(funkcja, ast.Attribute) and funkcja.attr == "strip":
            return _odczyt_nazwy(funkcja.value)
        return False
    if isinstance(wezel, ast.Subscript):
        klucz = _stala(wezel.slice)
        return klucz is not None and _nazwa_pola(klucz)
    if isinstance(wezel, ast.Attribute):
        # `run.font.name` — krój pisma dokumentu, nie nazwa elementu.
        kroj = isinstance(wezel.value, ast.Attribute) and wezel.value.attr == "font"
        return _nazwa_pola(wezel.attr) and not kroj
    if isinstance(wezel, ast.BoolOp) and isinstance(wezel.op, ast.Or):
        return _odczyt_nazwy(wezel.values[0])
    if isinstance(wezel, ast.IfExp):
        return _odczyt_nazwy(wezel.body) or _odczyt_nazwy(wezel.orelse)
    return False


class _Skaner(ast.NodeVisitor):
    """Formy lokalnej odpowiedzi „czy to jest nazwa":
    `or`       — odczyt nazwy (albo zmienna-nośnik odczytu) jako nie-ostatni człon `A or B`;
    `test`     — prawdziwość odczytu/nośnika albo `.strip()` na nazwie w teście `if`/`while`/
                 `… if … else …` i w członie `and`/`or`/`not`/`bool(…)`;
    `zapas`    — wartość zapasowa odczytu nazwy (`x.get("name", "—")`, `getattr(x, "name",
                 zapas)`); `None` i `""` nie są rozstrzygnięciem (brak zostaje brakiem).
    Zmienna-nośnik: zmienna lokalna przypisana z odczytu nazwy (zasięg funkcji, sekwencyjnie —
    ponowne przypisanie innej wartości kasuje nośnik)."""

    def __init__(self) -> None:
        self.trafienia: set[tuple[int, int, str, str]] = set()
        self._funkcje: list[str] = []
        self._nosniki: list[set[str]] = [set()]

    def _funkcja(self, wezel: ast.FunctionDef | ast.AsyncFunctionDef) -> None:
        self._funkcje.append(wezel.name)
        self._nosniki.append(set())
        self.generic_visit(wezel)
        self._nosniki.pop()
        self._funkcje.pop()

    visit_FunctionDef = _funkcja
    visit_AsyncFunctionDef = _funkcja

    def _klasa(self, wezel: ast.ClassDef) -> None:
        self._funkcje.append(wezel.name)
        self.generic_visit(wezel)
        self._funkcje.pop()

    visit_ClassDef = _klasa

    def _symbol(self) -> str:
        return ".".join(self._funkcje) or "<moduł>"

    def _surowa(self, wezel: ast.AST) -> bool:
        if _odczyt_nazwy(wezel):
            return True
        if isinstance(wezel, ast.Name):
            return wezel.id in self._nosniki[-1]
        if isinstance(wezel, ast.Call):
            funkcja = wezel.func
            if isinstance(funkcja, ast.Name) and funkcja.id == "str" and len(wezel.args) == 1:
                return self._surowa(wezel.args[0])
            if isinstance(funkcja, ast.Attribute) and funkcja.attr == "strip":
                return self._surowa(funkcja.value)
        if isinstance(wezel, ast.BoolOp) and isinstance(wezel.op, ast.Or):
            return self._surowa(wezel.values[0])
        return False

    def _strip_nazwy(self, wezel: ast.AST) -> bool:
        return (
            isinstance(wezel, ast.Call)
            and isinstance(wezel.func, ast.Attribute)
            and wezel.func.attr == "strip"
            and (
                self._surowa(wezel.func.value)
                or (isinstance(wezel.func.value, ast.Name) and _nazwa_pola(wezel.func.value.id))
                or (
                    isinstance(wezel.func.value, ast.Attribute)
                    and _nazwa_pola(wezel.func.value.attr)
                )
            )
        )

    def _test(self, wezel: ast.AST, forma: str = "test") -> None:
        if isinstance(wezel, ast.UnaryOp) and isinstance(wezel.op, ast.Not):
            self._test(wezel.operand, forma)
            return
        if isinstance(wezel, ast.BoolOp):
            return  # człony sprawdza `visit_BoolOp` (każdy człon raz)
        if isinstance(wezel, ast.Compare):
            for czlon in (wezel.left, *wezel.comparators):
                if self._strip_nazwy(czlon):
                    self._zapisz(czlon, forma)
            return
        if self._surowa(wezel) or self._strip_nazwy(wezel):
            self._zapisz(wezel, forma)

    def _zapisz(self, wezel: ast.AST, forma: str) -> None:
        self.trafienia.add(
            (
                getattr(wezel, "lineno", 0),
                getattr(wezel, "col_offset", 0),
                forma,
                self._symbol(),
            )
        )

    def _przypisanie(self, cel: ast.AST, wartosc: ast.AST | None) -> None:
        if not isinstance(cel, ast.Name) or wartosc is None:
            return
        if _odczyt_nazwy(wartosc):
            self._nosniki[-1].add(cel.id)
        else:
            self._nosniki[-1].discard(cel.id)

    def visit_Assign(self, wezel: ast.Assign) -> None:
        self.generic_visit(wezel)
        for cel in wezel.targets:
            self._przypisanie(cel, wezel.value)

    def visit_AnnAssign(self, wezel: ast.AnnAssign) -> None:
        self.generic_visit(wezel)
        self._przypisanie(wezel.target, wezel.value)

    def visit_If(self, wezel: ast.If) -> None:
        self._test(wezel.test)
        self.generic_visit(wezel)

    def visit_While(self, wezel: ast.While) -> None:
        self._test(wezel.test)
        self.generic_visit(wezel)

    def visit_IfExp(self, wezel: ast.IfExp) -> None:
        self._test(wezel.test)
        self.generic_visit(wezel)

    def visit_comprehension(self, wezel: ast.comprehension) -> None:
        for warunek in wezel.ifs:
            self._test(warunek)
        self.generic_visit(wezel)

    def visit_BoolOp(self, wezel: ast.BoolOp) -> None:
        czlony = wezel.values[:-1] if isinstance(wezel.op, ast.Or) else wezel.values
        if (
            isinstance(wezel.op, ast.Or)
            and len(wezel.values) == 2
            and isinstance(wezel.values[-1], ast.Constant)
            and wezel.values[-1].value in (None, "")
        ):
            # `x.get("name") or ""` sprowadza brak klucza do pustego napisu — to jeszcze nie
            # rozstrzygnięcie; rozstrzyga dalsze użycie (nośnik, test), które skaner widzi.
            czlony = []
        for czlon in czlony:
            self._test(czlon, "or" if isinstance(wezel.op, ast.Or) else "test")
        self.generic_visit(wezel)

    def visit_Call(self, wezel: ast.Call) -> None:
        funkcja = wezel.func
        zapas: ast.AST | None = None
        if isinstance(funkcja, ast.Attribute) and funkcja.attr == "get" and len(wezel.args) == 2:
            klucz = _stala(wezel.args[0])
            if klucz is not None and _nazwa_pola(klucz):
                zapas = wezel.args[1]
        if isinstance(funkcja, ast.Name) and funkcja.id == "getattr" and len(wezel.args) == 3:
            klucz = _stala(wezel.args[1])
            if klucz is not None and _nazwa_pola(klucz):
                zapas = wezel.args[2]
        if zapas is not None and not (
            isinstance(zapas, ast.Constant) and zapas.value in (None, "")
        ):
            self._zapisz(wezel, "zapas")
        if isinstance(funkcja, ast.Name) and funkcja.id == "bool" and len(wezel.args) == 1:
            self._test(wezel.args[0])
        self.generic_visit(wezel)


def zmierz(korzen: Path = SRC) -> dict[str, list[str]]:
    """Tożsamość `plik:symbol:forma` → lista `plik:linia` trafień (poza modułem nazw)."""
    wynik: dict[str, list[str]] = {}
    for plik in sorted(korzen.rglob("*.py")):
        wzgledna = plik.relative_to(korzen).as_posix()
        if wzgledna == MODUL_NAZW:
            continue
        skaner = _Skaner()
        skaner.visit(ast.parse(plik.read_text(encoding="utf-8")))
        for linia, _kolumna, forma, symbol in sorted(skaner.trafienia):
            wynik.setdefault(f"{wzgledna}:{symbol}:{forma}", []).append(f"{wzgledna}:{linia}")
    return wynik


def test_jeden_predykat_nazwy_w_calym_src() -> None:
    """Żaden moduł `src/**` nie rozstrzyga sam, czy wartość pola nazwy jest nazwą — pyta
    liść `network_model.nazwy` albo zbudowane na nim funkcje `enm.nazwy_elementow` (zapadka
    w obie strony względem `DOZWOLONE`)."""
    pomiar = zmierz()
    bledy: list[str] = []
    for tozsamosc, miejsca in sorted(pomiar.items()):
        dozwolone = DOZWOLONE.get(tozsamosc, (0, ""))[0]
        if len(miejsca) > dozwolone:
            bledy.append(f"lokalny predykat nazwy ({len(miejsca)} > {dozwolone}): {miejsca}")
    for tozsamosc, (liczba, _powod) in sorted(DOZWOLONE.items()):
        zmierzone = len(pomiar.get(tozsamosc, []))
        if zmierzone < liczba:
            bledy.append(f"obniż wpis listy dozwolonej ({zmierzone} < {liczba}): {tozsamosc}")
    assert not bledy, "\n".join(bledy)


def test_lista_dozwolona_tylko_rdzenie_b01_z_uzasadnieniem() -> None:
    import importlib.util

    sciezka = SRC.parents[1] / "scripts" / "rdzenie_b01.py"
    spec = importlib.util.spec_from_file_location("rdzenie_b01", sciezka)
    assert spec is not None and spec.loader is not None
    rdzenie = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(rdzenie)
    for tozsamosc, (liczba, powod) in DOZWOLONE.items():
        assert liczba > 0 and len(powod) > 40, tozsamosc
        assert rdzenie.jest_rdzeniem_b01(tozsamosc.split(":", 1)[0]), tozsamosc


@pytest.mark.parametrize(
    ("kod", "oczekiwane"),
    [
        ('x = p.get("name") or "Kabel nN"', ["or"]),
        ('x = p.get("source_name") or p.get("name_pl") or "Źródło"', ["or", "or"]),
        ('x = d.get("name", "—")', ["zapas"]),
        ('x = getattr(d, "name", "—")', ["zapas"]),
        ('x = d.get("name", "")', []),
        ('x = d.get("name", None)', []),
        ("if n.name:\n    pass", ["test"]),
        ("y = 1 if n.name and n.name.strip() else 2", ["test", "test"]),
        ('n = p.get("name")\nif n:\n    pass', ["test"]),
        ('n = p.get("name")\nn = inne(n)\nif n:\n    pass', []),
        ("ok = isinstance(nazwa, str) and nazwa.strip() != ref", ["test"]),
        ("ok = bool(nazwa.strip())", ["test"]),
        ('x = nazwa_nadana(p.get("name")) or "Kabel nN"', []),
        ('x = p.get("file_name") or "plik"', []),
        ('x = p.get("names") or []', []),
        ('x = str(p.get("name") or "").strip()', []),
        ('n = str(p.get("name") or "").strip()\nif n:\n    pass', ["test"]),
        (
            "xs = [name for name in names if isinstance(name, str) and name.strip()]",
            ["test"],
        ),
    ],
)
def test_skaner_rozpoznaje_formy(kod: str, oczekiwane: list[str]) -> None:
    """Samotest skanera: każda forma lokalnego predykatu jest widziana, postać przez moduł nazw
    i nazwy programowe — nie."""
    skaner = _Skaner()
    skaner.visit(ast.parse(kod))
    assert sorted(forma for _l, _k, forma, _s in skaner.trafienia) == sorted(oczekiwane)


def test_predykat_ma_jedna_sciezke_importu() -> None:
    """Każdy konsument — `backend/src/**`, `backend/tests/**` i `scripts/**` — bierze
    `jest_nazwa`/`nazwa_nadana` z `network_model.nazwy` (import z nazwy albo odwołanie przez
    alias modułu); moduł nazw elementów ich nie wystawia (bez re-eksportu — zasada: jedna
    ścieżka, zero warstw zgodności)."""
    predykaty = {"jest_nazwa", "nazwa_nadana"}
    backend = SRC.parent
    bledy: list[str] = []
    for korzen in (SRC, backend / "tests", backend.parent / "scripts"):
        for plik in sorted(korzen.rglob("*.py")):
            miejsce = plik.relative_to(backend.parent).as_posix()
            drzewo = ast.parse(plik.read_text(encoding="utf-8"))
            aliasy_lisca: set[str] = set()
            for wezel in ast.walk(drzewo):
                if isinstance(wezel, ast.ImportFrom) and wezel.module:
                    zle = predykaty & {a.name for a in wezel.names}
                    if zle and wezel.module != "network_model.nazwy":
                        bledy.append(f"{miejsce}:{wezel.lineno} {wezel.module} {zle}")
                    if wezel.module == "network_model":
                        aliasy_lisca |= {
                            a.asname or a.name for a in wezel.names if a.name == "nazwy"
                        }
                elif isinstance(wezel, ast.Import):
                    aliasy_lisca |= {
                        a.asname
                        for a in wezel.names
                        if a.name == "network_model.nazwy" and a.asname
                    }
            for wezel in ast.walk(drzewo):
                if (
                    isinstance(wezel, ast.Attribute)
                    and wezel.attr in predykaty
                    and isinstance(wezel.value, ast.Name)
                    and wezel.value.id not in aliasy_lisca
                ):
                    bledy.append(f"{miejsce}:{wezel.lineno} {wezel.value.id}.{wezel.attr}")
    assert not bledy, bledy
    assert not hasattr(nazwy, "jest_nazwa")
    zrodlo = (SRC / "enm" / "nazwy_elementow.py").read_text(encoding="utf-8")
    assert "import nazwa_nadana as" not in zrodlo and "import jest_nazwa as" not in zrodlo


def test_slownik_nie_ma_wlasnego_predykatu_nazwy() -> None:
    """Kolizje nazw usunięte: słownik komunikatów nie definiuje funkcji nazwy elementu ani
    pozycji katalogu (tylko zdania `opis_*`), predykatu kształtu nie ma nigdzie."""
    for nazwa in (
        "nazwa_elementu",
        "nazwa_pozycji_katalogu",
        "wyglada_na_identyfikator",
        "_nazwa_do_zdania",
        "_nazwa_czytelna",
    ):
        assert not hasattr(slownik, nazwa), nazwa
    zrodla = "\n".join(p.read_text(encoding="utf-8") for p in SRC.rglob("*.py"))
    assert "wyglada_na_identyfikator" not in zrodla
    assert "_KSZTALT_KODU" not in zrodla


# ---------------------------------------------------------------------------
# 2. Iloczyn cech: wartość × miejsce — jedna odpowiedź w każdym polu
# ---------------------------------------------------------------------------

#: Wartość pola nazwy → nazwa oczekiwana (`None` = brak nazwy). Jedna kolumna odpowiedzi dla
#: wszystkich miejsc; kształt identyfikatora i kodu NIE jest brakiem (rozstrzygnięcie karty).
WARTOSCI: dict[str, tuple[object, str | None]] = {
    "zwykla": ("Stacja Północ", "Stacja Północ"),
    "zwykla_ze_spacjami_brzegowymi": ("  Stacja Północ ", "Stacja Północ"),
    "pusta": ("", None),
    "same_spacje": ("   ", None),
    "brak_pola": (None, None),
    "nie_napis": (17, None),
    "ksztalt_identyfikatora": ("stn/0f3a9c2e/sn_bus", "stn/0f3a9c2e/sn_bus"),
    "ksztalt_hex": (
        "0f3a9c2e7b1d4f6a8c0e2b4d6f8a1c3e",
        "0f3a9c2e7b1d4f6a8c0e2b4d6f8a1c3e",
    ),
    "ksztalt_kodu": ("QF-03_zrodlo", "QF-03_zrodlo"),
    "oznaczenie_z_arkusza": ("RGN-2", "RGN-2"),
}


def _element(wartosc: object) -> dict[str, Any]:
    element: dict[str, Any] = {
        "ref_id": "stn-x",
        "station_type": "mv_lv",
        "bus_refs": [],
    }
    if wartosc is not None:
        element["name"] = wartosc
    return element


@pytest.mark.parametrize("przypadek", sorted(WARTOSCI))
def test_predykat_i_nazwa_nadana(przypadek: str) -> None:
    wartosc, oczekiwana = WARTOSCI[przypadek]
    assert predykat.jest_nazwa(wartosc) is (oczekiwana is not None)
    assert predykat.nazwa_nadana(wartosc) == oczekiwana


@pytest.mark.parametrize("przypadek", sorted(WARTOSCI))
def test_miejsce_nazwa_nadana_przez_operacje(przypadek: str) -> None:
    """Operacja z jawną nazwą w ładunku nadaje ją elementowi; brak nazwy (także pusta, same
    spacje, nie-napis) = nazwa domyślna z rodzaju — nigdy wartość z ładunku ani identyfikator.
    Dwie operacje z dwóch modułów operacji (`domain_operations`, `domain_operations_v2`).
    """
    from enm.domain_operations import execute_domain_operation
    from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader

    from tests.enm.test_append_station_on_endpoint import op

    wartosc, oczekiwana = WARTOSCI[przypadek]
    pusty = EnergyNetworkModel(
        header=ENMHeader(name="iloczyn nazw", defaults=ENMDefaults(sn_nominal_kv=15.0))
    ).model_dump(mode="json")

    ladunek: dict[str, Any] = {"voltage_kv": 15.0, "sk3_mva": 250.0}
    if wartosc is not None:
        ladunek["source_name"] = wartosc
    migawka = op(copy.deepcopy(pusty), "add_grid_source_sn", ladunek)
    (zrodlo,) = migawka["sources"]
    assert zrodlo["name"] == (oczekiwana or "Źródło GPZ 15 kV"), zrodlo["name"]

    ladunek_nn: dict[str, Any] = {"voltage_kv": 0.4}
    if wartosc is not None:
        ladunek_nn["name"] = wartosc
    wynik = execute_domain_operation(copy.deepcopy(pusty), "add_nn_distribution_board", ladunek_nn)
    assert not wynik.get("error"), wynik.get("error")
    (rozdzielnica,) = wynik["snapshot"]["substations"]
    assert rozdzielnica["name"] == (oczekiwana or "Rozdzielnica nN")


@pytest.mark.parametrize("przypadek", sorted(WARTOSCI))
def test_miejsce_etykieta_wyniku(przypadek: str) -> None:
    """Etykieta wyniku: nazwa elementu, indeks nazw migawki i nazwa węzła grafu biegu."""
    wartosc, oczekiwana = WARTOSCI[przypadek]
    element = _element(wartosc)
    etykieta = oczekiwana or "Stacja bez nazwy"
    assert nazwy.nazwa_elementu(element, "substations") == etykieta
    assert nazwy.zbuduj_indeks_nazw({"substations": [element]}) == {"stn-x": etykieta}
    assert nazwy.nazwa_po_identyfikatorze("stn-x", {"substations": [element]}) == etykieta
    graf = {"graph": {"nodes": {"n1": {"name": wartosc}}}}
    assert nazwy.nazwy_wezlow_grafu(graf) == {"n1": oczekiwana or "Szyna bez nazwy"}


@pytest.mark.parametrize("przypadek", sorted(WARTOSCI))
def test_miejsce_zdanie_komunikatu(przypadek: str) -> None:
    """Zdanie komunikatu: element w ręku, element po identyfikatorze w migawce (słownik
    i obiekt modelu) i nazwa w ręku — ta sama odpowiedź co etykieta wyniku."""
    from enm.models import Substation

    wartosc, oczekiwana = WARTOSCI[przypadek]
    zdanie = f"Stacja „{oczekiwana}”" if oczekiwana is not None else "Stacja bez nazwy"
    element = _element(wartosc)
    assert slownik.opis_obiektu(element, "Stacja") == zdanie
    assert slownik.opis_elementu({"substations": [element]}, "stn-x", "Stacja") == zdanie
    assert slownik.opis_nazwy(wartosc, "Stacja") == zdanie
    if isinstance(wartosc, str):
        obiekt = Substation(ref_id="stn-x", name=wartosc, station_type="mv_lv", bus_refs=[])
        assert slownik.opis_obiektu(obiekt, "Stacja") == zdanie
        model = {"substations": [obiekt]}
        assert nazwy.nazwa_nadana_po_identyfikatorze(model, "stn-x") == oczekiwana


@pytest.mark.parametrize("przypadek", sorted(WARTOSCI))
def test_miejsce_nazwa_pozycji_katalogu(przypadek: str) -> None:
    """Nazwa pozycji katalogu: rekord-słownik (`name`, `name_pl`) i typ katalogu (obiekt) —
    nigdy identyfikator pozycji, także gdy nazwa jest mu równa."""
    from types import SimpleNamespace

    wartosc, oczekiwana = WARTOSCI[przypadek]
    rekord = {"id": "stn/0f3a9c2e/sn_bus", "name": wartosc}
    assert nazwy.nazwa_nadana_pozycji_katalogu(rekord) == oczekiwana
    assert nazwy.nazwa_pozycji_katalogu(rekord) == (oczekiwana or nazwy.POZYCJA_KATALOGU_BEZ_NAZWY)
    assert nazwy.nazwa_nadana_pozycji_katalogu({"id": "x", "name_pl": wartosc}) == oczekiwana
    typ = SimpleNamespace(id="stn/0f3a9c2e/sn_bus", name=wartosc)
    assert nazwy.nazwa_nadana_pozycji_katalogu(typ) == oczekiwana


def test_pozycja_katalogu_w_zdaniu_z_katalogu_operacji() -> None:
    """Zdanie komunikatu o pozycji katalogu: nazwa z katalogu bieżącego (statyczny + projekt),
    „spoza katalogu" dla nieznanego identyfikatora — identyfikator nigdy w treści."""
    from enm.katalog_projektu import katalog_biezacy
    from network_model.catalog.materialization import pozycja_w_katalogu

    ref = "tr-sn-nn-15-04-630kva-dyn11"
    pozycja = pozycja_w_katalogu(katalog_biezacy(), None, ref)
    nazwa = nazwy.nazwa_nadana_pozycji_katalogu(pozycja)
    assert nazwa is not None and nazwa != ref
    assert slownik.opis_pozycji_katalogu(ref, None, "typ") == f"typ „{nazwa}”"
    assert slownik.opis_pozycji_katalogu("brak-takiej-pozycji", None, "typ") == (
        "typ spoza katalogu"
    )
    assert slownik.opis_pozycji_katalogu("  ", None, "typ") == "typ spoza katalogu"


def test_jedna_odpowiedz_we_wszystkich_miejscach() -> None:
    """Dla każdej wartości wszystkie miejsca zgadzają się, CZY jest nazwa (predykaty parami)."""
    for przypadek, (wartosc, _oczekiwana) in WARTOSCI.items():
        element = _element(wartosc)
        odpowiedzi = {
            "predykat": predykat.jest_nazwa(wartosc),
            "etykieta": nazwy.nazwa_elementu(element, "substations") != "Stacja bez nazwy",
            "zdanie": slownik.opis_obiektu(element, "Stacja") != "Stacja bez nazwy",
            "katalog": nazwy.nazwa_nadana_pozycji_katalogu({"name": wartosc}) is not None,
            "graf": nazwy.nazwy_wezlow_grafu({"graph": {"nodes": {"n": {"name": wartosc}}}})["n"]
            != "Szyna bez nazwy",
        }
        assert len(set(odpowiedzi.values())) == 1, (przypadek, odpowiedzi)
