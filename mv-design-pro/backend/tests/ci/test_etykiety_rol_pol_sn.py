"""Strażnik klasy (karta #141): jedna terminologia ról pól SN w całym produkcie.

Po co: ta sama rola pola rozdzielnicy SN miała w produkcie kilka nazw — „Pole sprzęgła" obok
„Pole sprzęgłowe" i „sprzęgłowe", „Pole liniowe wejściowe" obok „liniowe dopływowe",
„Pole zasilające", „Pole wejściowe SN", „Pole odgałęźne" obok „Pole odgałęźne SN",
„Pole źródłowe PV" obok „Pole przyłączeniowe PV", „Pole OZE", „Pole DER", „Pole źródła PV (SN)",
„pole generatorowe". Kanon słownictwa to mapa kontraktu schematu `FIELD_ROLE_LABEL_PL`
(`frontend/src/ui/sld/v2/station-rozdzielnia/contract.ts`) ↔ backend
`enm/rola_pola_sn.py::NAZWA_ROLI_POLA_SN_PL` (parytet: `tests/enm/test_nazwy_pol_bez_kodow.py`).

Strażnik skanuje źródła frontu i skryptów frontu (poza plikiem kanonu i testami), backendu
(poza modułem kanonu) i pakiety referencyjne JSON. Reguły 1–3 czytają literały napisów (TS/TSX:
literały i tekst JSX; Python: stałe napisowe bez docstringów; JSON: wartości) — komentarze
i docstringi nie są treścią produktu, więc ich nie czytają; reguła 4 czyta kod źródłowy TS
i Pythona (klucze map i przypadki `switch`). Cztery reguły:

* SŁOWO NIEKANONICZNE (każdy literał, także zdanie): przymiotnik „sprzęgłowe" (kanon: „sprzęgła"),
  „dopływowe" i „liniowe odpływowe" (kanon: „liniowe wejściowe/wyjściowe"), „pole wejściowe" /
  „pole wyjściowe" bez „liniowe", „pole zasilające", „pole OZE/DER/PV/BESS/FW", „pole źródła PV",
  „źródłowe OZE", „pole generatorowe", „pole przyłączeniowe OZE/PV/BESS/FW/SN", „pole odpływowe
  SN/GPZ" (pole odpływowe nN to osobna rola rozdzielnicy nN, nie SN);
* ETYKIETA ROLI POZA KANONEM (literał o kształcie etykiety — krótki, bez interpunkcji zdania —
  zaczynający się od nazwy roli pola, także kanonicznej): etykieta roli bierze się WYŁĄCZNIE
  z kanonu (import mapy albo funkcji), nie z drugiej listy literałów. Nie dotyczy JSON-ów
  (dane nie importują kodu; obowiązuje w nich reguła słowa);
* KOD ROLI W ZDANIU O POLU (każdy literał co najmniej trzywyrazowy, w którym mowa o polu albo
  roli): kod roli modelu (IN/OUT/FEEDER/COUPLER/MEASUREMENT) albo kanoniczny (`LINIA_IN`…)
  zamiast nazwy roli z kanonu. `TR` jest też znacznikiem dyspozytorskim kanonu, a `OZE` —
  polskim skrótem, więc nie są tu kodami;
* MAPA ETYKIET RÓL (kod źródłowy TS/Python, nie literał): co najmniej dwa różne kody ról jako
  klucze mapy albo przypadki `switch` z tekstem dla człowieka jako wartością, w odstępie do 15
  linii — to druga lista nazw ról niezależnie od tego, jakimi słowami je zapisano (tak wyglądały
  mapy „Zasilające (wejście)”/„Odgałęźne (wyjście)” czy „Łącznik sekcyjny”, których reguły słów
  nie widzą).

Zapadka na zero: każde znalezisko poza listą `WYJATKI` jest błędem, a wyjątek, który nic nie
znajduje, też jest błędem (lista tylko maleje). Każdy wyjątek niesie uzasadnienie merytoryczne.

Iloczyn cech testów samego strażnika: język {TS, TSX z tekstem JSX, Python, JSON} × kształt
literału {etykieta, zdanie, goły przymiotnik, szablon z interpolacją} × słowo {każde słowo
niekanoniczne, duplikat etykiety kanonu, słowo kanoniczne w zdaniu, kod roli w zdaniu o polu, kod
`BayKind`, pole nN, pole GPZ} × miejsce {literał, komentarz, docstring, plik kanonu, plik
testowy}; mapa etykiet ról {obiekt TS, `switch`, klucze wewnętrzne małymi literami, słownik
Pythona, klucze kanoniczne} × {etykiety, kody, jeden klucz, klucze odległe}.
"""

from __future__ import annotations

import ast
import json
import re
from dataclasses import dataclass
from pathlib import Path

import pytest

PROJEKT = Path(__file__).resolve().parents[3]
FRONT_SRC = PROJEKT / "frontend" / "src"
#: Skrypty renderów i pomiarów frontu — rysują obrazy oceny dla właściciela (ta sama treść).
FRONT_SKRYPTY = PROJEKT / "frontend" / "scripts"
BACK_SRC = PROJEKT / "backend" / "src"

#: Pliki kanonu — jedyne miejsca, w których wolno zapisać nazwy ról pól SN.
KANON_FRONT = "frontend/src/ui/sld/v2/station-rozdzielnia/contract.ts"
KANON_BACK = "backend/src/enm/rola_pola_sn.py"

_POLE = r"\b(?:pol(?:e|a|u|em|ach|ami|om)|pól)\b"

#: Słowa niekanoniczne — w KAŻDYM literale (także w zdaniu), bez względu na wielkość liter.
SLOWA_NIEKANONICZNE: tuple[tuple[str, re.Pattern[str]], ...] = tuple(
    (nazwa, re.compile(wzor, re.IGNORECASE))
    for nazwa, wzor in (
        ("przymiotnik „sprzęgłowe” (kanon: „sprzęgła”)", r"sprzęgłow\w*"),
        ("„dopływowe” (kanon: „liniowe wejściowe”)", r"dopływow\w*"),
        ("„liniowe odpływowe” (kanon: „liniowe wyjściowe”)", r"liniow\w*\s+odpływow\w*"),
        (
            "„pole wejściowe/wyjściowe” bez „liniowe”",
            _POLE + r"\s+(?:wejściow|wyjściow)\w*",
        ),
        ("„pole zasilające” (kanon: „liniowe wejściowe”)", _POLE + r"\s+zasilając\w*"),
        ("„pole OZE/DER” (kanon: „źródłowe”)", _POLE + r"\s+(?:OZE|DER)\b"),
        (
            "„pole PV/BESS/FW” (kanon: „źródłowe PV/BESS/FW”)",
            _POLE + r"\s+(?:PV|BESS|FW)\b(?!\s+nN)",
        ),
        ("„pole źródła PV/BESS/FW” (kanon: „źródłowe”)", _POLE + r"\s+źródła\s+(?:PV|BESS|FW)\b"),
        ("„źródłowe OZE” (kanon: „źródłowe SN”)", r"źródłowe\s+OZE\b"),
        ("„pole generatorowe” (kanon: „źródłowe”)", _POLE + r"\s+generatorow\w*"),
        (
            "„pole przyłączeniowe OZE/PV/BESS/FW/SN” (kanon: „źródłowe”)",
            _POLE + r"\s+przyłączeniow\w*\s+(?:OZE|PV|BESS|FW|SN)\b",
        ),
        (
            "„pole odpływowe SN/GPZ” (kanon: „liniowe wyjściowe”; „odpływowe nN” to rola nN)",
            _POLE + r"\s+odpływow\w*\s+(?:SN|GPZ)\b",
        ),
    )
)

#: Przymiotniki w rodzaju nijakim (-e): „pole”/„pola” — „odgałęźna” (stacja) to nie rola pola.
#: Pola rozdzielnicy nN („Pole odpływowe nN”, „Pole PV nN”) mają własne słownictwo — kanon ról
#: pól SN ich nie obejmuje.
_ROLA_W_ETYKIECIE = (
    r"(?:liniowe\s+(?:wejściowe|wyjściowe|dopływowe|odpływowe)"
    r"|odgałęźne|transformatorowe|pomiarowe|sprzęgła|sprzęgłowe"
    r"|źródłowe\s+(?:SN|PV|BESS|FW|OZE)|odpływowe(?!\s+nN\b)|dopływowe"
    r"|wejściowe|wyjściowe|zasilające|(?:OZE|DER|PV|BESS|FW)(?!\s+nN\b)"
    r"|źródła\s+(?:PV|BESS|FW)|przyłączeniowe\s+(?:OZE|PV|BESS|FW|SN))\b"
)
#: Określenia, które zostawiają literał etykietą (nie zdaniem): poziom napięcia SN, rodzaj
#: sprzęgła, rezerwa, rozliczenie (samo „nN” wskazuje pole rozdzielnicy nN — nie określenie).
_OKRESLENIE = (
    r"(?:SN|SN/nN|sekcji|sekcyjnego|podłużne|podłużnego|poprzeczne|poprzecznego"
    r"|rezerwowe|rozliczeniowe)"
)
#: Etykieta roli: CAŁY literał to „Pole <rola>” z co najwyżej określeniem, oznaczeniem pozycji
#: („L-1”, „2”, wstawka szablonu `${nr}` → „…”), dopiskiem w nawiasie albo po myślniku/plusie.
#: Zdanie, które zaczyna się od kanonicznej nazwy roli („Pole transformatorowe nie ma…”),
#: etykietą nie jest.
ETYKIETA_ROLI = re.compile(
    rf"^[Pp]ol[ea]\s+{_ROLA_W_ETYKIECIE}(?:\s+{_OKRESLENIE})*"
    r"(?:\s+(?:[A-ZĄĆĘŁŃÓŚŹŻ]{0,3}-?\d+[a-z]?|…))*(?:\s*\([^()]*\))?(?:\s+…)?"
    r"(?:\s*[—–+]\s*[^.;:!?]*)?$"
)
#: Przymiotnik roli pola bez rzeczownika „pole”. Czysto ASCII-owe `transformatorowe`/`pomiarowe`
#: pisane małą literą to także kody `BayKind` katalogu (i „uzwojenie pomiarowe”) — nie etykiety;
#: wielką literą („Transformatorowe”) są już etykietą. Samo „liniowe” to termin nadrzędny pól
#: liniowych (podpis rodzaju pola na schemacie), nie rola.
_PRZYMIOTNIK_ROLI = (
    r"(?:liniowe\s+(?:wejściowe|wyjściowe|dopływowe|odpływowe)|odgałęźne|sprzęgłowe|dopływowe"
    r"|odpływowe(?!\s+nN\b)|zasilające|wejściowe|wyjściowe|źródłowe(?:\s+(?:SN|PV|BESS|FW|OZE))?"
    r"|(?-i:Transformatorowe|Pomiarowe))"
)
#: Goły przymiotnik roli jako CAŁY literał: jeden lub kilka przymiotników ról (także „Zasilające
#: odgałęźne”), z dopiskiem w nawiasie („Odgałęźne (wyjście)”) albo wstawką szablonu.
GOLY_PRZYMIOTNIK_ROLI = re.compile(
    rf"^{_PRZYMIOTNIK_ROLI}(?:\s*/?\s*(?:{_PRZYMIOTNIK_ROLI}|SN|sekcji|rezerwowe))*"
    r"(?:\s*\([^()]*\))?(?:\s+…)?$",
    re.IGNORECASE,
)
#: Kształt etykiety: krótki literał bez interpunkcji zdania (kropka dozwolona między cyframi).
_INTERPUNKCJA_ZDANIA = re.compile(r"[;!?]|\.(?!\d)")
#: Kod roli pola (modelu albo kanoniczny) jako samodzielny wyraz tekstu.
KOD_ROLI = re.compile(
    r"(?<![\w.-])(?:IN|OUT|FEEDER|COUPLER|MEASUREMENT|LINIA_IN|LINIA_OUT|LINIA_ODG|SPRZEGLO"
    r"|POMIAROWE|TRANSFORMATOROWE|PV_SN|BESS_SN|FW_SN)(?![\w-])"
)
#: Wyraz „pole”/„rola” w dowolnej formie — tekst mówi o polu albo o jego roli.
SLOWO_POLA_ALBO_ROLI = re.compile(
    r"(?<!\w)(?:pol(?:e|a|u|em|ach|ami|om)|pól|rol(?:a|i|e|ą)|ról)(?!\w)", re.IGNORECASE
)
REGULA_KODU = "kod roli pola w tekście (nazwa roli z kanonu, nie kod roli)"

#: Kod roli pola jako klucz mapy / przypadek `switch`: rola modelu, kanoniczna albo wewnętrzna
#: (małymi literami — identyfikatory pól wewnętrznego układu stacji `in`/`tr`/`coupler`).
_KOD_KLUCZA = (
    r"(?:IN|OUT|FEEDER|TR|COUPLER|MEASUREMENT|OZE|LINIA_IN|LINIA_OUT|LINIA_ODG|SPRZEGLO"
    r"|POMIAROWE|TRANSFORMATOROWE|PV_SN|BESS_SN|FW_SN|in|out|feeder|tr|coupler|measurement|oze)"
)
_WPIS_MAPY = re.compile(
    rf"""(?:^|[\s{{,(\[])(?P<k1>["']?)(?P<klucz>{_KOD_KLUCZA})(?P=k1)\s*:\s*"""
    r"""(?P<q>["'`])(?P<wartosc>[^"'`\n]*)(?P=q)""",
    re.MULTILINE,
)
_PRZYPADEK_SWITCH = re.compile(
    rf"""case\s+(?P<q0>["'])(?P<klucz>{_KOD_KLUCZA})(?P=q0)\s*:\s*(?:\n\s*)?(?:return\s+)?"""
    r"""(?P<q>["'`])(?P<wartosc>[^"'`\n]*)(?P=q)"""
)
#: Wartość to tekst dla człowieka (nie kod): spacja, polski znak albo wielka litera + mała.
_TEKST_DLA_CZLOWIEKA = re.compile(r"[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ ]|^[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]")
REGULA_MAPY = "mapa etykiet ról pól poza kanonem (druga lista nazw ról — weź nazwy z kanonu)"


@dataclass(frozen=True)
class Znalezisko:
    plik: str
    linia: int
    regula: str
    tekst: str

    def __str__(self) -> str:
        return f"{self.plik}:{self.linia}: {self.regula} — {self.tekst[:120]!r}"


@dataclass(frozen=True)
class Wyjatek:
    plik: str
    wzor: str
    uzasadnienie: str


#: Wyjątki z uzasadnieniem merytorycznym (lista tylko maleje — nieużyty wyjątek = błąd).
WYJATKI: tuple[Wyjatek, ...] = (
    Wyjatek(
        plik="frontend/src/ui/protection-coordination/TccChart.tsx",
        wzor=r"polu (zasilającym|odpływowym)",
        uzasadnienie=(
            "Terminologia selektywności zabezpieczeń (para zabezpieczeń: „w polu zasilającym” = "
            "zabezpieczenie nadrzędne, „w polu odpływowym” = podrzędne) — położenie zabezpieczenia "
            "w parze selektywności, nie rola pola rozdzielnicy SN z kanonu."
        ),
    ),
    Wyjatek(
        plik="backend/src/reference_engine/packs/elektrometal_e2alpha/pack.json",
        wzor=r"producent publikuje LISTĘ TYPÓW pól",
        uzasadnienie=(
            "Cytat listy typów pól z kart producenta Elektrometal (K-1.2.2, K-11.1.1, K-0.2.11) "
            "w notatce badawczej pakietu — nazwy wyrobów producenta przepisane z karty, nie "
            "etykiety ról pól produktu (pakiet świadomie nie niesie konfiguracji celek)."
        ),
    ),
)


# ---------------------------------------------------------------------------
# Ekstrakcja literałów
# ---------------------------------------------------------------------------

#: Po tych znakach `/` zaczyna wyrażenie regularne (poza `<`/`>` — w TSX to znaczniki,
#: `</div>` to nie regex; strzałka `=>` jest osobnym tokenem).
_REGEX_PO = set("(,=:[!&|?{};+-*%~^") | {"=>"}
_SLOWA_PRZED_REGEX = {"return", "typeof", "case", "in", "of", "delete", "void", "throw", "new"}


def literaly_ts(tekst: str, *, jsx: bool) -> list[tuple[int, str]]:
    """Literały napisów TS/TSX (z liniami): '…', "…", tekst szablonu `…` (interpolacja → „…”),
    tekst JSX między znacznikami. Komentarze i wyrażenia regularne pominięte."""
    wynik: list[tuple[int, str]] = []
    kod: list[str] = []  # strumień kodu z zamaskowanymi napisami — do tekstu JSX
    i, n, linia = 0, len(tekst), 1
    ostatni = ""  # ostatni znaczący znak/słowo kodu (rozstrzyga `/` = regex czy dzielenie)
    while i < n:
        c = tekst[i]
        if c == "\n":
            linia += 1
            kod.append(c)
            i += 1
            continue
        if tekst.startswith("//", i):
            j = tekst.find("\n", i)
            i = n if j < 0 else j
            continue
        if tekst.startswith("/*", i):
            j = tekst.find("*/", i + 2)
            koniec = n if j < 0 else j + 2
            kod.append("\n" * tekst.count("\n", i, koniec))
            linia += tekst.count("\n", i, koniec)
            i = koniec
            continue
        if c == "/" and (ostatni in _REGEX_PO or ostatni in _SLOWA_PRZED_REGEX or not ostatni):
            j, w_klasie = i + 1, False
            while j < n and tekst[j] != "\n":
                if tekst[j] == "\\":
                    j += 2
                    continue
                if tekst[j] == "[":
                    w_klasie = True
                elif tekst[j] == "]":
                    w_klasie = False
                elif tekst[j] == "/" and not w_klasie:
                    break
                j += 1
            if j < n and tekst[j] == "/":
                i = j + 1
                ostatni = "regex"
                kod.append(" ")
                continue
            # Bez domknięcia w tej linii to nie regex (dzielenie) — `/` zostaje w kodzie.
        if c in "'\"":
            j, bufor = i + 1, []
            while j < n and tekst[j] != c and tekst[j] != "\n":
                if tekst[j] == "\\":
                    bufor.append(tekst[j + 1 : j + 2])
                    j += 2
                    continue
                bufor.append(tekst[j])
                j += 1
            wynik.append((linia, "".join(bufor)))
            kod.append('""')
            ostatni = "napis"
            # Napis niedomknięty w linii (np. apostrof w tekście JSX) kończy się na końcu
            # linii — znak nowej linii zostaje w strumieniu, żeby numeracja linii się zgadzała.
            i = j + 1 if j < n and tekst[j] == c else j
            continue
        if c == "`":
            j, bufor, start, glebokosc = i + 1, [], linia, 0
            while j < n:
                z = tekst[j]
                if z == "\\":
                    bufor.append(tekst[j + 1 : j + 2])
                    j += 2
                    continue
                if z == "\n":
                    linia += 1
                if glebokosc == 0:
                    if z == "`":
                        break
                    if tekst.startswith("${", j):
                        glebokosc = 1
                        bufor.append("…")
                        j += 2
                        continue
                    bufor.append(z)
                else:
                    if z == "{":
                        glebokosc += 1
                    elif z == "}":
                        glebokosc -= 1
                j += 1
            wynik.append((start, "".join(bufor)))
            kod.append('""' + "\n" * (linia - start))
            ostatni = "napis"
            i = j + 1
            continue
        if tekst.startswith("=>", i):
            kod.append("=>")
            ostatni = "=>"
            i += 2
            continue
        kod.append(c)
        if not c.isspace():
            if c.isalnum() or c == "_" or c == "$":
                j = i
                while j < n and (tekst[j].isalnum() or tekst[j] in "_$"):
                    j += 1
                ostatni = tekst[i:j]
                kod.append(tekst[i + 1 : j])
                i = j
                continue
            ostatni = c
        i += 1
    if jsx:
        strumien = "".join(kod)
        for m in re.finditer(r">([^<>{}]*)<", strumien):
            fragment = m.group(1)
            # Kod między `>` a `<` (porównania, typy generyczne) to nie tekst JSX: średnik,
            # przypisanie, strzałka, wywołanie `f(` albo operator logiczny go zdradza. Nawias
            # po spacji zostaje — „Pole źródłowe PV (SN)” to tekst.
            if not fragment.strip() or re.search(r"[;=]|=>|\w\(|&&|\|\|", fragment):
                continue
            poczatek = m.start(1) + len(fragment) - len(fragment.lstrip())
            wynik.append((strumien.count("\n", 0, poczatek) + 1, " ".join(fragment.split())))
    return wynik


def literaly_py(tekst: str) -> list[tuple[int, str]]:
    """Stałe napisowe Pythona (f-string: interpolacja → „…”), bez docstringów i komentarzy.
    Sklejanie literałów sąsiednich robi parser — wzór rozpięty na dwa kawałki jest widoczny."""
    drzewo = ast.parse(tekst)
    docstringi: set[int] = set()
    czesci_fstringow: set[int] = set()
    for wezel in ast.walk(drzewo):
        if (
            isinstance(wezel, ast.Expr)
            and isinstance(wezel.value, ast.Constant)
            and isinstance(wezel.value.value, str)
        ):
            docstringi.add(id(wezel.value))
        if isinstance(wezel, ast.JoinedStr):
            czesci_fstringow.update(id(v) for v in wezel.values)
    wynik: list[tuple[int, str]] = []
    for wezel in ast.walk(drzewo):
        if isinstance(wezel, ast.JoinedStr):
            wynik.append(
                (
                    wezel.lineno,
                    "".join(
                        v.value if isinstance(v, ast.Constant) and isinstance(v.value, str) else "…"
                        for v in wezel.values
                    ),
                )
            )
        elif (
            isinstance(wezel, ast.Constant)
            and isinstance(wezel.value, str)
            and id(wezel) not in docstringi
            and id(wezel) not in czesci_fstringow
        ):
            wynik.append((wezel.lineno, wezel.value))
    return wynik


def literaly_json(tekst: str) -> list[tuple[int, str]]:
    wartosci: list[str] = []

    def zbierz(obiekt: object) -> None:
        if isinstance(obiekt, str):
            wartosci.append(obiekt)
        elif isinstance(obiekt, dict):
            for v in obiekt.values():
                zbierz(v)
        elif isinstance(obiekt, list):
            for v in obiekt:
                zbierz(v)

    zbierz(json.loads(tekst))
    wynik: list[tuple[int, str]] = []
    for wartosc in wartosci:
        pozycja = tekst.find(json.dumps(wartosc, ensure_ascii=False)[1:-1])
        wynik.append((tekst.count("\n", 0, max(pozycja, 0)) + 1, wartosc))
    return wynik


# ---------------------------------------------------------------------------
# Reguły
# ---------------------------------------------------------------------------


def _ksztalt_etykiety(tekst: str) -> bool:
    return len(tekst) <= 80 and not _INTERPUNKCJA_ZDANIA.search(tekst)


def naruszenia_literalu(tekst: str, *, etykiety: bool = True) -> list[str]:
    """Reguły naruszone przez jeden literał (pusta lista = literał czysty)."""
    reguly = [nazwa for nazwa, wzor in SLOWA_NIEKANONICZNE if wzor.search(tekst)]
    if len(tekst.split()) >= 3 and KOD_ROLI.search(tekst) and SLOWO_POLA_ALBO_ROLI.search(tekst):
        reguly.append(REGULA_KODU)
    tekst = tekst.strip()
    if etykiety and _ksztalt_etykiety(tekst):
        if ETYKIETA_ROLI.match(tekst):
            reguly.append("etykieta roli pola poza kanonem (weź ją z kanonu)")
        elif GOLY_PRZYMIOTNIK_ROLI.match(tekst):
            reguly.append("goły przymiotnik roli pola poza kanonem (weź etykietę z kanonu)")
    return reguly


def mapy_etykiet_rol(tekst: str) -> list[tuple[int, str, str]]:
    """Wpisy map etykiet ról (linia, kod roli, tekst): co najmniej dwa różne kody ról z tekstem
    dla człowieka jako wartością w odstępie do 15 linii. Pojedynczy klucz (np. `IN` = prąd
    znamionowy w nastawach zabezpieczeń) mapą ról nie jest."""
    wpisy = sorted(
        (tekst.count("\n", 0, m.start("klucz")) + 1, m.group("klucz").upper(), m.group("wartosc"))
        for wzor in (_WPIS_MAPY, _PRZYPADEK_SWITCH)
        for m in wzor.finditer(tekst)
        if _TEKST_DLA_CZLOWIEKA.search(m.group("wartosc"))
    )
    return [
        (linia, klucz, wartosc)
        for linia, klucz, wartosc in wpisy
        if len({k for li, k, _ in wpisy if abs(li - linia) <= 15}) >= 2
    ]


def _pomijany_front(sciezka: str) -> bool:
    return (
        sciezka == KANON_FRONT
        or "/__tests__/" in sciezka
        or ".test." in sciezka
        or ".spec." in sciezka
        or sciezka.startswith("frontend/src/test/")
    )


def znaleziska_pliku(sciezka_wzgledna: str, tekst: str) -> list[Znalezisko]:
    """Znaleziska w jednym pliku (ścieżka względem `mv-design-pro/` decyduje o języku)."""
    if sciezka_wzgledna.endswith(".py"):
        literaly, etykiety = literaly_py(tekst), True
    elif sciezka_wzgledna.endswith(".json"):
        literaly, etykiety = literaly_json(tekst), False
    else:
        literaly = literaly_ts(tekst, jsx=sciezka_wzgledna.endswith(".tsx"))
        etykiety = True
    wynik: list[Znalezisko] = []
    for linia, literal in literaly:
        for regula in naruszenia_literalu(literal, etykiety=etykiety):
            wynik.append(Znalezisko(sciezka_wzgledna, linia, regula, literal))
    if not sciezka_wzgledna.endswith(".json"):
        for linia, klucz, wartosc in mapy_etykiet_rol(tekst):
            wynik.append(Znalezisko(sciezka_wzgledna, linia, REGULA_MAPY, f"{klucz}: {wartosc}"))
    return wynik


def pliki_produktu() -> list[Path]:
    pliki: list[Path] = []
    for plik in sorted(FRONT_SRC.rglob("*")):
        sciezka = plik.relative_to(PROJEKT).as_posix()
        if plik.suffix in {".ts", ".tsx"} and not _pomijany_front(sciezka):
            pliki.append(plik)
        elif plik.name.endswith(".pack.json"):
            pliki.append(plik)
    pliki.extend(
        plik
        for plik in sorted(FRONT_SKRYPTY.rglob("*"))
        if plik.suffix in {".ts", ".tsx", ".mjs"} and "node_modules" not in plik.parts
    )
    for plik in sorted(BACK_SRC.rglob("*.py")):
        if plik.relative_to(PROJEKT).as_posix() != KANON_BACK:
            pliki.append(plik)
    pliki.extend(sorted((BACK_SRC / "reference_engine" / "packs").glob("*/pack.json")))
    return pliki


def skan_produktu() -> list[Znalezisko]:
    wynik: list[Znalezisko] = []
    for plik in pliki_produktu():
        wynik.extend(
            znaleziska_pliku(plik.relative_to(PROJEKT).as_posix(), plik.read_text(encoding="utf-8"))
        )
    return wynik


def _wyjatek_dla(znalezisko: Znalezisko) -> Wyjatek | None:
    for wyjatek in WYJATKI:
        if wyjatek.plik == znalezisko.plik and re.search(wyjatek.wzor, znalezisko.tekst):
            return wyjatek
    return None


# ---------------------------------------------------------------------------
# Zapadka na produkcie
# ---------------------------------------------------------------------------


def test_zero_etykiet_rol_pol_poza_kanonem() -> None:
    """Każda etykieta roli pola SN pochodzi z kanonu; żadne słowo niekanoniczne w produkcie."""
    naruszenia = [z for z in skan_produktu() if _wyjatek_dla(z) is None]
    assert not naruszenia, "Etykiety ról pól SN poza kanonem:\n" + "\n".join(
        str(z) for z in naruszenia
    )


def test_kazdy_wyjatek_jest_uzywany_i_uzasadniony() -> None:
    """Lista wyjątków tylko maleje: wyjątek bez znaleziska albo bez uzasadnienia = błąd."""
    znaleziska = skan_produktu()
    for wyjatek in WYJATKI:
        assert len(wyjatek.uzasadnienie) > 40, wyjatek
        assert any(
            z.plik == wyjatek.plik and re.search(wyjatek.wzor, z.tekst) for z in znaleziska
        ), f"wyjątek bez znaleziska (usuń go): {wyjatek}"


def test_skan_obejmuje_front_backend_i_pakiety() -> None:
    """Pusty skan nie jest sukcesem: strażnik czyta wszystkie trzy nośniki treści."""
    pliki = [p.relative_to(PROJEKT).as_posix() for p in pliki_produktu()]
    assert any(p.endswith(".tsx") for p in pliki)
    assert any(p.startswith("backend/src/") and p.endswith(".py") for p in pliki)
    assert any(p.endswith("pack.json") for p in pliki)
    assert KANON_FRONT not in pliki and KANON_BACK not in pliki
    assert not any("/__tests__/" in p for p in pliki)


# ---------------------------------------------------------------------------
# Testy samego strażnika — iloczyn cech (język × kształt × słowo × miejsce)
# ---------------------------------------------------------------------------

#: Przykład na KAŻDĄ regułę słowa niekanonicznego: (fragment nazwy reguły, etykieta z tym słowem).
PRZYKLADY_SLOW_NIEKANONICZNYCH: tuple[tuple[str, str], ...] = (
    ("„sprzęgłowe”", "Pole sprzęgłowe"),
    ("„dopływowe”", "Pole liniowe dopływowe"),
    ("„liniowe odpływowe”", "Pole liniowe odpływowe"),
    ("„pole wejściowe/wyjściowe”", "Pole wejściowe SN"),
    ("„pole zasilające”", "Pole zasilające"),
    ("„pole OZE/DER”", "Pole OZE"),
    ("„pole PV/BESS/FW”", "Pole BESS"),
    ("„pole źródła", "Pole źródła PV (SN)"),
    ("„źródłowe OZE”", "Pole źródłowe OZE"),
    ("„pole generatorowe”", "Pole generatorowe"),
    ("„pole przyłączeniowe", "Pole przyłączeniowe PV"),
    ("„pole odpływowe SN/GPZ”", "Pole odpływowe SN"),
)

#: Nośniki treści: TS (także po dzieleniu i wyrażeniu regularnym w tej samej linii kodu), szablon
#: TS z wstawką, tekst JSX (po apostrofie w tekście i w wielu liniach), atrybut JSX, Python,
#: f-string, literał sklejany przez parser, wartość JSON.
NOSNIKI = (
    "ts",
    "ts_po_dzieleniu_i_regex",
    "ts_szablon",
    "tsx_tekst",
    "tsx_atrybut",
    "py",
    "py_fstring",
    "py_sklejany",
    "json",
)
NOSNIKI_KODU = tuple(n for n in NOSNIKI if n != "json")


def _plik(nosnik: str, literal: str) -> tuple[str, str, int]:
    """(ścieżka, treść pliku, linia literału) — ten sam literał w danym nośniku treści."""
    if nosnik == "ts":
        return "frontend/src/ui/x/a.ts", f"// nagłówek\n\nexport const A = '{literal}';\n", 3
    if nosnik == "ts_po_dzieleniu_i_regex":
        tresc = f'const d = n / 2;\nconst r = /a\\/b/u;\nexport const A = "{literal}";\n'
        return "frontend/src/ui/x/a.ts", tresc, 3
    if nosnik == "ts_szablon":
        tresc = (
            "/* blok\n   komentarza */\nexport const A = (nr: number) =>\n  `"
            + literal
            + " ${nr}`;\n"
        )
        return "frontend/src/ui/x/a.ts", tresc, 4
    if nosnik == "tsx_tekst":
        tresc = (
            "export const A = () => (\n  <section>\n    <p>Projektant's</p>\n    <div>\n"
            f"      {literal}\n    </div>\n  </section>\n);\n"
        )
        return "frontend/src/ui/x/A.tsx", tresc, 5
    if nosnik == "tsx_atrybut":
        return "frontend/src/ui/x/A.tsx", f'export const A = () => <div title="{literal}" />;\n', 1
    if nosnik == "py":
        return "backend/src/x.py", f'"""Moduł."""\n\n# komentarz\nA = {literal!r}\n', 4
    if nosnik == "py_fstring":
        return "backend/src/x.py", f'N = 1\nA = f"{literal} {{N}}"\n', 2
    if nosnik == "py_sklejany":
        pol = len(literal) // 2
        return "backend/src/x.py", f"A = (\n    {literal[:pol]!r}\n    {literal[pol:]!r}\n)\n", 2
    if nosnik == "json":
        tresc = json.dumps({"pola": [{"nazwa": literal}]}, ensure_ascii=False, indent=2)
        return "backend/src/reference_engine/packs/x/pack.json", tresc, 4
    raise AssertionError(nosnik)


def _zdanie(etykieta: str) -> str:
    return f"Kreator doda {etykieta[0].lower() + etykieta[1:]} do rozdzielnicy."


def _regula(fragment: str) -> str:
    nazwy = [nazwa for nazwa, _ in SLOWA_NIEKANONICZNE if fragment in nazwa]
    assert len(nazwy) == 1, (fragment, nazwy)
    return nazwy[0]


def _etykiety_kanonu() -> list[str]:
    from enm.rola_pola_sn import NAZWA_POLA_ZRODLOWEGO_SN_PL, NAZWA_ROLI_POLA_SN_PL

    return [*NAZWA_ROLI_POLA_SN_PL.values(), NAZWA_POLA_ZRODLOWEGO_SN_PL]


REGULA_ETYKIETY = "etykieta roli pola poza kanonem (weź ją z kanonu)"
REGULA_GOLEGO = "goły przymiotnik roli pola poza kanonem (weź etykietę z kanonu)"


def test_kazda_regula_slowa_ma_przyklad() -> None:
    """Nowa reguła słowa bez przykładu w iloczynie cech nie przejdzie (deklaracja bez testu)."""
    pokryte = {_regula(fragment) for fragment, _ in PRZYKLADY_SLOW_NIEKANONICZNYCH}
    assert pokryte == {nazwa for nazwa, _ in SLOWA_NIEKANONICZNE}


@pytest.mark.parametrize("ksztalt", ["etykieta", "zdanie"])
@pytest.mark.parametrize("nosnik", NOSNIKI)
@pytest.mark.parametrize("fragment,przyklad", PRZYKLADY_SLOW_NIEKANONICZNYCH)
def test_slowo_niekanoniczne_w_kazdym_nosniku_i_ksztalcie(
    fragment: str, przyklad: str, nosnik: str, ksztalt: str
) -> None:
    literal = przyklad if ksztalt == "etykieta" else _zdanie(przyklad)
    sciezka, tresc, linia = _plik(nosnik, literal)
    znaleziska = znaleziska_pliku(sciezka, tresc)
    assert (linia, _regula(fragment)) in {(z.linia, z.regula) for z in znaleziska}, znaleziska


@pytest.mark.parametrize("nosnik", NOSNIKI)
@pytest.mark.parametrize(
    "wariant",
    ["{}", "{} podłużnego", "{} (sekcja A)", "{} T-1", "{} — rezerwa", "{} SN"],
)
def test_duplikat_etykiety_kanonu_poza_kanonem(wariant: str, nosnik: str) -> None:
    """Etykieta kanonu przepisana literałem (z określeniem, oznaczeniem, dopiskiem) = druga
    lista etykiet; w JSON-ie (dane bez importu kodu) reguła etykiety nie obowiązuje."""
    for etykieta in _etykiety_kanonu():
        sciezka, tresc, linia = _plik(nosnik, wariant.format(etykieta))
        znaleziska = znaleziska_pliku(sciezka, tresc)
        if nosnik == "json":
            assert znaleziska == [], znaleziska
        else:
            assert (linia, REGULA_ETYKIETY) in {(z.linia, z.regula) for z in znaleziska}, (
                etykieta,
                znaleziska,
            )


@pytest.mark.parametrize("nosnik", NOSNIKI)
def test_slowo_kanoniczne_w_zdaniu_jest_dozwolone(nosnik: str) -> None:
    """Zdanie z kanoniczną nazwą roli to treść, nie druga lista etykiet."""
    for etykieta in _etykiety_kanonu():
        for zdanie in (_zdanie(etykieta), f"{etykieta} nie ma wyłącznika; dobierz aparat."):
            sciezka, tresc, _ = _plik(nosnik, zdanie)
            assert znaleziska_pliku(sciezka, tresc) == [], zdanie


@pytest.mark.parametrize("nosnik", NOSNIKI)
@pytest.mark.parametrize(
    "literal",
    [
        "transformatorowe",  # kod `BayKind` katalogu (ASCII), nie etykieta
        "pomiarowe",
        "liniowe_doplywowe",
        "sprzeglowe_podluzne",
        "Pole odpływowe nN",  # rola rozdzielnicy nN, nie SN
        "Pole PV nN",
        "Istniejące pole odpływowe nN",
        "Pole liniowe GPZ",  # termin nadrzędny pól liniowych GPZ (bez kierunku)
        "pole liniowe (GPZ)",
        "liniowe",  # podpis rodzaju pola na schemacie („F01 · liniowe”)
        "Stacja odgałęźna",  # typ stacji (rodzaj żeński), nie rola pola
        "Pole SN",
        "Odłącznik odpływowy",
        "pomiarowe (limit 0,5 %)",  # rodzaj uzwojenia przekładnika, nie rola pola
        "Odpływowe nN",
    ],
)
def test_nazwy_spoza_rol_pol_sn_sa_dozwolone(literal: str, nosnik: str) -> None:
    sciezka, tresc, _ = _plik(nosnik, literal)
    assert znaleziska_pliku(sciezka, tresc) == []


@pytest.mark.parametrize("nosnik", NOSNIKI)
@pytest.mark.parametrize(
    "literal",
    [
        "odgałęźne",
        "liniowe wejściowe",
        "liniowe wyjściowe",
        "źródłowe PV",
        # Mapa etykiet ról z karty stacji (znaleziona przy karcie #141): przymiotnik z dopiskiem,
        # dwa przymiotniki, przymiotnik ASCII pisany wielką literą.
        "Zasilające (wejście)",
        "Odgałęźne (wyjście)",
        "Zasilające odgałęźne",
        "Transformatorowe",
        "Pomiarowe",
    ],
)
def test_goly_przymiotnik_roli_poza_kanonem(literal: str, nosnik: str) -> None:
    sciezka, tresc, linia = _plik(nosnik, literal)
    znaleziska = {(z.linia, z.regula) for z in znaleziska_pliku(sciezka, tresc)}
    if nosnik == "json":
        assert znaleziska == set()
    else:
        assert (linia, REGULA_GOLEGO) in znaleziska


@pytest.mark.parametrize("nosnik", NOSNIKI)
@pytest.mark.parametrize(
    "zdanie",
    [
        "Stacja przelotowa: pola IN/OUT nie są podpięte do szyny SN.",
        "Brak wolnego pola odgałęźnego SN (pole roli FEEDER z wolnym zaciskiem).",
        "Przypisz pola IN i OUT do magistrali SN stacji.",
        "Rola pola COUPLER wymaga dwóch sekcji szyny.",
        "Pole o roli LINIA_OUT nie ma aparatu",
        "Dodaj pole MEASUREMENT przed transformatorem",
    ],
)
def test_kod_roli_w_zdaniu_o_polu(zdanie: str, nosnik: str) -> None:
    """Kod roli w tekście o polu to druga terminologia roli — nazwa roli pochodzi z kanonu."""
    sciezka, tresc, linia = _plik(nosnik, zdanie)
    znaleziska = {(z.linia, z.regula) for z in znaleziska_pliku(sciezka, tresc)}
    assert (linia, REGULA_KODU) in znaleziska, znaleziska


@pytest.mark.parametrize("nosnik", NOSNIKI)
@pytest.mark.parametrize(
    "tekst",
    [
        "Pole TR przyłączone do szyny SN stacji.",  # TR = znacznik dyspozytorski kanonu
        "Źródła OZE w polu nN stacji.",  # OZE = polski skrót, nie kod roli
        "INSTALACJA pola wymaga przeglądu.",  # „IN” wewnątrz wyrazu
        "field_role IN",  # za krótkie na zdanie, bez słowa pola
        "Kod IN w danych wejściowych modelu",  # brak słowa „pole”/„rola”
        "Pole liniowe wejściowe nie ma aparatu",
    ],
)
def test_bez_kodu_roli_w_zdaniu_nie_ma_znaleziska(tekst: str, nosnik: str) -> None:
    sciezka, tresc, _ = _plik(nosnik, tekst)
    assert REGULA_KODU not in {z.regula for z in znaleziska_pliku(sciezka, tresc)}


#: Mapy etykiet ról w różnych zapisach (kształty zastane w produkcie przed kartą #141).
MAPY_ETYKIET_ROL: tuple[tuple[str, str], ...] = (
    (
        "frontend/src/ui/x/a.ts",
        "const L: Record<string, string> = {\n  IN: 'Zasilające (wejście)',\n"
        "  OUT: 'Odgałęźne (wyjście)',\n  COUPLER: 'Łącznik sekcyjny',\n};\n",
    ),
    (
        "frontend/src/ui/x/a.ts",
        "function f(r: string): string {\n  switch (r) {\n    case 'IN':\n"
        "      return 'Zasilające (wejście)';\n    case 'TR':\n      return 'Transformatorowe';\n"
        "    default:\n      return r;\n  }\n}\n",
    ),
    (
        "frontend/src/ui/x/a.ts",
        "const M = {\n  in: 'Pole wejściowe SN',\n  out: 'Pole wyjściowe SN',\n};\n",
    ),
    (
        "backend/src/x.py",
        'ROLA_PL = {\n    "IN": "Zasilające",\n    "FEEDER": "Odejście",\n    "OZE": "Źródło OZE",\n}\n',
    ),
    (
        "frontend/src/ui/x/A.tsx",
        "const E = { LINIA_IN: 'Wejście', LINIA_OUT: 'Wyjście' };\n",
    ),
)


@pytest.mark.parametrize("sciezka,tresc", MAPY_ETYKIET_ROL)
def test_mapa_etykiet_rol_poza_kanonem(sciezka: str, tresc: str) -> None:
    """Druga lista nazw ról — bez względu na słowa (reguły słów nie widzą „Odejście”)."""
    znaleziska = [z for z in znaleziska_pliku(sciezka, tresc) if z.regula == REGULA_MAPY]
    assert len({z.tekst.split(":", 1)[0] for z in znaleziska}) >= 2, znaleziska


@pytest.mark.parametrize(
    "sciezka,tresc",
    [
        # Jeden klucz roli w mapie innej dziedziny (prąd znamionowy In w nastawach).
        ("frontend/src/ui/x/a.ts", "const N = {\n  IN: 'Prąd znamionowy (In)',\n  K: 'x',\n};\n"),
        # Mapy ról na kody (rodzaj pola katalogu, port, grupa) — nie są etykietami.
        (
            "frontend/src/ui/x/a.ts",
            "const K = {\n  LINIA_IN: 'liniowe_doplywowe',\n  TRANSFORMATOROWE: 'transformatorowe',\n};\n",
        ),
        ("backend/src/x.py", 'G = {\n    "IN": "liniowe",\n    "COUPLER": "sprzeglowe",\n}\n'),
        # Dwa klucze ról daleko od siebie (osobne miejsca pliku).
        (
            "frontend/src/ui/x/a.ts",
            "const A = { IN: 'Tekst A' };\n" + "\n" * 20 + "const B = { OUT: 'Tekst B' };\n",
        ),
    ],
)
def test_mapa_bez_etykiet_rol_nie_ma_znaleziska(sciezka: str, tresc: str) -> None:
    assert REGULA_MAPY not in {z.regula for z in znaleziska_pliku(sciezka, tresc)}


def test_mapa_etykiet_rol_w_pliku_kanonu_jest_widoczna_a_pomijana() -> None:
    """Kanon frontu SAM jest mapą etykiet ról — reguła mapy go widzi (więc kopia kanonu
    w innym pliku zostanie złapana), a skan produktu pomija wyłącznie plik kanonu."""
    tresc = (PROJEKT / KANON_FRONT).read_text(encoding="utf-8")
    assert len({klucz for _, klucz, _ in mapy_etykiet_rol(tresc)}) >= 6


@pytest.mark.parametrize("fragment,przyklad", PRZYKLADY_SLOW_NIEKANONICZNYCH)
def test_komentarz_i_docstring_nie_sa_trescia_produktu(fragment: str, przyklad: str) -> None:
    del fragment
    ts = f"// {przyklad}\n/* {przyklad}\n * {przyklad} */\nexport const A = 1; // {przyklad}\n"
    tsx = f"export const A = () => (\n  <div>\n    {{/* {przyklad} */}}\n  </div>\n);\n"
    py = (
        f'"""{przyklad}."""\n\n# {przyklad}\n\n\nclass K:\n    """{przyklad}."""\n\n'
        f'    def f(self) -> int:\n        """{przyklad}."""\n        return 1  # {przyklad}\n'
    )
    assert znaleziska_pliku("frontend/src/ui/x/a.ts", ts) == []
    assert znaleziska_pliku("frontend/src/ui/x/A.tsx", tsx) == []
    assert znaleziska_pliku("backend/src/x.py", py) == []


def test_wyrazenie_regularne_nie_jest_literalem() -> None:
    ts = "export const R = /Pole sprzęgłowe/u;\nexport function f(x: string) {\n"
    ts += "  return /liniowe dopływowe/.test(x);\n}\n"
    assert znaleziska_pliku("frontend/src/ui/x/a.ts", ts) == []


@pytest.mark.parametrize("kanon", [KANON_FRONT, KANON_BACK])
def test_plik_kanonu_niesie_etykiety_a_skan_go_pomija(kanon: str) -> None:
    """Skan pliku kanonu znalazłby etykiety (więc kopia kanonu gdziekolwiek indziej zostanie
    złapana), ale kanon jest jedynym miejscem, którego skan produktu nie czyta."""
    znaleziska = znaleziska_pliku(kanon, (PROJEKT / kanon).read_text(encoding="utf-8"))
    teksty = {z.tekst for z in znaleziska if z.regula == REGULA_ETYKIETY}
    assert set(_etykiety_kanonu()) <= teksty
    assert kanon not in {p.relative_to(PROJEKT).as_posix() for p in pliki_produktu()}


@pytest.mark.parametrize(
    "sciezka,pomijany",
    [
        ("frontend/src/ui/x/__tests__/a.test.ts", True),
        ("frontend/src/ui/x/a.test.tsx", True),
        ("frontend/src/ui/x/a.spec.ts", True),
        ("frontend/src/test/setup.ts", True),
        (KANON_FRONT, True),
        ("frontend/src/ui/x/a.ts", False),
        ("frontend/src/ui/x/testowy.tsx", False),
    ],
)
def test_pliki_testowe_frontu_pominiete(sciezka: str, pomijany: bool) -> None:
    assert _pomijany_front(sciezka) is pomijany


def test_skan_nie_czyta_testow_backendu() -> None:
    pliki = [p.relative_to(PROJEKT).as_posix() for p in pliki_produktu()]
    assert not any(p.startswith("backend/tests/") for p in pliki)
    assert any(p.startswith("frontend/scripts/") and p.endswith(".mjs") for p in pliki)


def test_wyjatek_dziala_tylko_w_swoim_pliku_i_dla_swojego_tekstu() -> None:
    tekst = "zabezpieczenie w polu odpływowym działa wcześniej niż w polu zasilającym."
    regula = _regula("„pole zasilające”")
    w_pliku = Znalezisko("frontend/src/ui/protection-coordination/TccChart.tsx", 1, regula, tekst)
    gdzie_indziej = Znalezisko("frontend/src/ui/x/a.ts", 1, regula, tekst)
    inny_tekst = Znalezisko(
        "frontend/src/ui/protection-coordination/TccChart.tsx", 1, regula, "Pole zasilające"
    )
    assert _wyjatek_dla(w_pliku) is not None
    assert _wyjatek_dla(gdzie_indziej) is None
    assert _wyjatek_dla(inny_tekst) is None
