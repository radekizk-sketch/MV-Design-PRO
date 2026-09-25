"""Tekst dla projektanta z polskimi znakami i poprawnym zapisem jednostek (karta PL-ZNAKI).

PO CO. Ekrany harnessu i zrzuty dowodowe (materiał do werdyktu właściciela B-02)
pokazywały „Sprzeglo Q1", „Odbior nN", „GPZ 110kV", a komunikaty walidatora,
opisy kryteriów i nazwy katalogowe w ``backend/src`` były pisane bez znaków
diakrytycznych („Nie mozna ocenic…", „Wylacznik glowny nN"). Naprawa objęła klasę:
każdy literał tekstu dla człowieka w ``backend/src`` i nazwy elementów sieci, z
których generatory budują fikstury frontu. Ten test pilnuje, żeby klasa nie
wróciła — lista słów leży w JEDNYM miejscu (``polskie_znaki_slownik.py``).

CO JEST TEKSTEM DLA CZŁOWIEKA (predykat jednego źródła, używany przez skaner i
przez testy detektora):
- literał ``str`` i f-string w module źródłowym, z wyjątkiem docstringów (to
  komentarze) i literałów o postaci identyfikatora (``zrodlo_sn``, ``ZRODLO_SN``,
  ``line/sa`` — klucze, kody, ścieżki);
- z tekstu wycina się: wyrażenia f-stringu, pola ``{nazwa}`` formatowania
  (``.format``) poza komendą LaTeX, pola ``%(nazwa)s`` oraz fragmenty w
  odwrotnych apostrofach (nazwy pól kodu w komunikacie);
- słowo WIELKIMI literami jest kodem (i nie jest oceniane), gdy ten sam napis
  występuje w źródłach jako samodzielny literał-kod albo przylega do ``-``,
  ``/`` lub ``_`` (``KAT-T-001``, ``RATIO/ODLEGLOSC``).

ZAKRES I WYJĄTKI (uzasadnione merytorycznie, nie „poza kartą"):
- rdzenie FROZEN ``network_model/solvers/**`` i profile NC RfG
  ``catalog/profiles/nc_rfg/**`` — edycja wymaga decyzji właściciela (bramka
  B-01); ich trafienia są PRZYPIĘTE zapadką per plik (``ZAMROZONE_TRAFIENIA``),
  działającą w obie strony: wzrost to nowy dług, spadek wymaga obniżenia pinu;
- zapis jednostek w ``network_model/catalog/**`` — opisy źródeł katalogowych
  cytują oznaczenia producenta 1:1 (``ETI VVC3 12kV/16A``, ``TK 521_VD4_40kA_E``,
  ``Vestas V90-2MW``); przepisanie ich zmieniłoby cytat, nie redakcję. Polskie
  znaki w tych samych opisach są sprawdzane bez wyjątku.
"""

from __future__ import annotations

import ast
import json
import re
from collections import Counter
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest

from tests.ci.polskie_znaki_slownik import SKROTY_Z_KROPKA, SLOWA_BEZ_ZNAKOW

BACKEND = Path(__file__).resolve().parents[2]
SRC = BACKEND / "src"
FRONTEND = BACKEND.parent / "frontend"

#: Katalogi, których edycja wymaga zgody właściciela (B-01) — trafienia pinowane.
ZAMROZONE = ("network_model/solvers/", "catalog/profiles/nc_rfg/")

#: Katalog, w którym zapis jednostek cytuje oznaczenia producenta (patrz docstring).
CYTATY_PRODUCENTA = ("network_model/catalog/",)

#: Zapadka FROZEN: plik (względem ``src``) -> liczba literałów ze słowem bez znaków.
#: Pomiar 2026-09-24 po naprawie klasy poza rdzeniami. Pozycje do decyzji
#: właściciela (B-01) — meldunek karty PL-ZNAKI.
#: Karta #145 (2026-09-25): zdjęte `conductor_thermal_withstand.py` (7 -> 0),
#: `machine_sc_iec60909.py` (7 -> 0) i `power_flow_oltc_studies.py` (27 -> 0) — pliki
#: spoza listy B-01 (`scripts/rdzenie_b01.py`), teksty trafiające na ekrany wyników
#: naprawione u źródła (pomiar skanem tego testu po zmianie).
ZAMROZONE_TRAFIENIA: dict[str, int] = {
    "network_model/solvers/cable_voltage_drop.py": 15,
    "network_model/solvers/der_selection_preview.py": 2,
    "network_model/solvers/dynamika/calkowanie.py": 4,
    "network_model/solvers/dynamika/kontrakty.py": 8,
    "network_model/solvers/dynamika/konwencje.py": 5,
    "network_model/solvers/dynamika/obserwable.py": 4,
    "network_model/solvers/dynamika/siec.py": 13,
    "network_model/solvers/dynamika/silnik.py": 38,
    "network_model/solvers/dynamika/skonczonosc.py": 4,
    "network_model/solvers/dynamika/tozsamosc.py": 1,
    "network_model/solvers/dynamika/urzadzenia/bazowe.py": 2,
    "network_model/solvers/dynamika/urzadzenia/fabryka.py": 10,
    "network_model/solvers/dynamika/urzadzenia/magazyn.py": 2,
    "network_model/solvers/dynamika/urzadzenia/maszyna_synchroniczna.py": 6,
    "network_model/solvers/dynamika/urzadzenia/okno_mocy.py": 2,
    "network_model/solvers/dynamika/urzadzenia/pochodne_kierunkowe.py": 1,
    "network_model/solvers/dynamika/urzadzenia/przeksztaltnik_gfl.py": 4,
    "network_model/solvers/dynamika/urzadzenia/przeksztaltnik_gfm.py": 7,
    "network_model/solvers/dynamika/urzadzenia/regulatory.py": 3,
    "network_model/solvers/dynamika/urzadzenia/turbina_wiatrowa.py": 6,
    "network_model/solvers/dynamika/urzadzenia/uklad_stanow.py": 7,
    "network_model/solvers/dynamika/walidacja/malosygnalowa.py": 1,
    "network_model/solvers/dynamika/walidacja/rowne_pola.py": 6,
    "network_model/solvers/dynamika/waznosc.py": 2,
    "network_model/solvers/dynamika/wyspy.py": 4,
    "network_model/solvers/dynamika/zdarzenia.py": 5,
    "network_model/solvers/equipment_checks/cable_thermal_aging.py": 4,
    "network_model/solvers/equipment_checks/ct_burden_saturation.py": 6,
    "network_model/solvers/equipment_checks/transformer_losses.py": 3,
    "network_model/solvers/equipment_checks/vt_burden_voltage_drop.py": 8,
    "network_model/solvers/transformer_rated_currents.py": 6,
    "network_model/solvers/v126_academic.py": 6,
}

_IDENTYFIKATOR = re.compile(r"[A-Za-z0-9_.:/\-{}\[\]*|]*")
_SLOWO = re.compile(r"(?<![\w\\])(?<!\\')[A-Za-z]+(?!\w)")
_JEDNOSTKA_SKLEJONA = re.compile(
    r"(?:^|(?<=[\s(=<>/]))\d+(?:[.,]\d+)?(?:kV|kA|MVA|kVA|MW|kW|Mvar|kvar|MVAr|Hz|V|A)(?!\w)"
)
_POLE_FORMATU = re.compile(r"(?<![A-Za-z])\{[A-Za-z_][\w.\[\]]*(?:![rsa])?(?::[^{}]*)?\}")
_POLE_PROCENTOWE = re.compile(r"%\([^)]*\)")
_KOD_W_TEKSCIE = re.compile(r"`[^`\n]*`")


def _docstringi(drzewo: ast.AST) -> set[int]:
    wynik: set[int] = set()
    for wezel in ast.walk(drzewo):
        if (
            isinstance(wezel, ast.Module | ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef)
            and wezel.body
            and isinstance(wezel.body[0], ast.Expr)
            and isinstance(wezel.body[0].value, ast.Constant | ast.JoinedStr)
        ):
            wynik.add(id(wezel.body[0].value))
    return wynik


def literaly_tekstu(zrodlo: str) -> Iterator[tuple[int, str]]:
    """(linia, tekst) każdego literału tekstu dla człowieka w module źródłowym."""
    drzewo = ast.parse(zrodlo)
    docstringi = _docstringi(drzewo)
    wewnatrz_fstringu: set[int] = set()
    for wezel in ast.walk(drzewo):
        if isinstance(wezel, ast.JoinedStr):
            wewnatrz_fstringu.update(id(v) for v in wezel.values)
    for wezel in ast.walk(drzewo):
        if id(wezel) in docstringi or id(wezel) in wewnatrz_fstringu:
            continue
        if isinstance(wezel, ast.Constant) and isinstance(wezel.value, str):
            if not _IDENTYFIKATOR.fullmatch(wezel.value):
                yield wezel.lineno, wezel.value
        elif isinstance(wezel, ast.JoinedStr):
            tekst = "".join(v.value if isinstance(v, ast.Constant) else "{}" for v in wezel.values)
            if not _IDENTYFIKATOR.fullmatch(tekst):
                yield wezel.lineno, tekst


def kody_zrodel(zrodla: list[str]) -> frozenset[str]:
    """Napisy WIELKIMI literami występujące w źródłach jako samodzielne literały-kody."""
    kody: set[str] = set()
    for zrodlo in zrodla:
        kody.update(m.group(1) for m in re.finditer(r"[\"']([A-Z][A-Z0-9_]+)[\"']", zrodlo))
    return frozenset(kody)


def slowa_bez_znakow(tekst: str, kody: frozenset[str] = frozenset()) -> list[str]:
    """Słowa z ``SLOWA_BEZ_ZNAKOW`` w tekście dla człowieka (po wycięciu kodu i pól)."""
    tekst = _KOD_W_TEKSCIE.sub(" ", tekst)
    tekst = _POLE_FORMATU.sub(" ", tekst)
    tekst = _POLE_PROCENTOWE.sub(" ", tekst)
    trafienia: list[str] = []
    for m in _SLOWO.finditer(tekst):
        slowo = m.group(0)
        if slowo.lower() not in SLOWA_BEZ_ZNAKOW:
            continue
        if slowo.lower() in SKROTY_Z_KROPKA and tekst[m.end() : m.end() + 1] == ".":
            continue
        if slowo.isupper() and len(slowo) > 1:
            przed = tekst[m.start() - 1] if m.start() else ""
            po = tekst[m.end()] if m.end() < len(tekst) else ""
            przylega_do_kodu = (przed != "" and przed in "-/_") or (po != "" and po in "-/_")
            if slowo in kody or przylega_do_kodu:
                continue
        elif not (slowo.islower() or slowo[0].isupper() and slowo[1:].islower()):
            continue
        trafienia.append(slowo)
    return trafienia


def jednostki_sklejone(tekst: str) -> list[str]:
    """Liczba sklejona z jednostką („110kV") w tekście, który nie jest LaTeX-em."""
    if "\\" in tekst:
        return []
    return _JEDNOSTKA_SKLEJONA.findall(tekst)


def _pliki_zrodel() -> list[Path]:
    return sorted(SRC.rglob("*.py"))


def _wzgledna(plik: Path) -> str:
    return plik.relative_to(SRC).as_posix()


def _skan_src() -> tuple[list[str], Counter[str], list[str]]:
    pliki = _pliki_zrodel()
    zrodla = {plik: plik.read_text(encoding="utf-8") for plik in pliki}
    kody = kody_zrodel(list(zrodla.values()))
    naruszenia: list[str] = []
    zamrozone: Counter[str] = Counter()
    jednostki: list[str] = []
    for plik, zrodlo in zrodla.items():
        rel = _wzgledna(plik)
        for linia, tekst in literaly_tekstu(zrodlo):
            slowa = slowa_bez_znakow(tekst, kody)
            if slowa:
                if rel.startswith(ZAMROZONE):
                    zamrozone[rel] += 1
                else:
                    naruszenia.append(f"{rel}:{linia} {slowa}: {tekst[:100]!r}")
            if not rel.startswith(ZAMROZONE + CYTATY_PRODUCENTA):
                sklejone = jednostki_sklejone(tekst)
                if sklejone:
                    jednostki.append(f"{rel}:{linia} {sklejone}: {tekst[:100]!r}")
    return naruszenia, zamrozone, jednostki


@pytest.fixture(scope="module")
def skan_src() -> tuple[list[str], Counter[str], list[str]]:
    return _skan_src()


def test_literaly_tekstu_w_src_maja_polskie_znaki(skan_src):
    naruszenia, _, _ = skan_src
    assert not naruszenia, (
        "Literały tekstu dla człowieka ze słowem bez polskich znaków "
        "(poprawna forma: tests/ci/polskie_znaki_slownik.py):\n" + "\n".join(naruszenia)
    )


def test_literaly_tekstu_w_src_nie_sklejaja_liczby_z_jednostka(skan_src):
    _, _, jednostki = skan_src
    assert not jednostki, "Liczba sklejona z jednostką (pisz „110 kV”):\n" + "\n".join(jednostki)


def test_zapadka_rdzeni_zamrozonych(skan_src):
    """Trafienia w rdzeniach FROZEN są długiem do decyzji właściciela — nie mogą rosnąć,
    a naprawa (po zgodzie B-01) wymaga obniżenia pinu (zapadka w obie strony)."""
    _, zamrozone, _ = skan_src
    assert dict(sorted(zamrozone.items())) == ZAMROZONE_TRAFIENIA


# --- nazwy elementów sieci, z których generatory budują fikstury frontu -------------


def _jest_kluczem_nazwy(klucz: str) -> bool:
    k = klucz.lower()
    return k in ("name", "label") or k.endswith("_name") or k.startswith("nazwa")


def _jest_kluczem_opisu(klucz: str) -> bool:
    k = klucz.lower()
    return k == "description" or k.startswith("opis")


def _nazwy_elementow(obiekt: Any, klucz: str | None = None, *, opisy: bool) -> Iterator[str]:
    """Nazwy (a z ``opisy=True`` także opisy) elementów w dowolnie zagnieżdżonym JSON-ie.

    Opisy sprawdzamy tylko w sieciach budowanych przez testy (ich treść pisze ten
    projekt); w fiksturach opis bywa złożony przez rdzeń FROZEN (np. „krok śladu testu
    T09 (stosowalnosc)" z identyfikatora kroku silnika NC RfG) — ten dług liczy zapadka
    `ZAMROZONE_TRAFIENIA`, a nie ten test."""
    if isinstance(obiekt, dict):
        for k, v in obiekt.items():
            yield from _nazwy_elementow(v, k, opisy=opisy)
    elif isinstance(obiekt, list):
        for v in obiekt:
            yield from _nazwy_elementow(v, klucz, opisy=opisy)
    elif isinstance(obiekt, str) and klucz is not None:
        if _jest_kluczem_nazwy(klucz) or (opisy and _jest_kluczem_opisu(klucz)):
            if not _IDENTYFIKATOR.fullmatch(obiekt):
                yield obiekt


#: Nazwy świadomie NIE poprawione (decyzja do właściciela). Nazwa źródła GPZ sieci
#: referencyjnej gn03 (rejestr G03) jest ziarnem deterministycznych identyfikatorów
#: operacji `add_grid_source_sn` — `gpz/<skrót>/…` całej sieci pochodzi z niej (przypięte
#: testem `test_nazwa_zrodla_gpz_jest_ziarnem_identyfikatorow`). Poprawa zapisu zmieniłaby
#: 60 identyfikatorów `ref_id` sieci, a z nimi piny widoku N-1 i złote szkielety G03 —
#: to nie jest „różnica wyłącznie tekstu nazw", którą karta dopuszcza w pinach.
NAZWY_ZIARNA_IDENTYFIKATOROW: frozenset[str] = frozenset({"GPZ Pierscien"})


def _bledy_nazw(nazwy: Iterator[str]) -> list[str]:
    bledy: list[str] = []
    for nazwa in nazwy:
        if nazwa in NAZWY_ZIARNA_IDENTYFIKATOROW:
            continue
        slowa = slowa_bez_znakow(nazwa)
        sklejone = jednostki_sklejone(nazwa)
        if slowa or sklejone:
            bledy.append(f"{nazwa!r}: {slowa} {sklejone}")
    return sorted(set(bledy))


def _sieci_generatorow() -> list[tuple[str, Any]]:
    from tests.cgmes.golden_enm import build_golden_enm
    from tests.golden.parytet_assemblera.harness import sieci_enm_rejestru
    from tests.golden.parytet_scenariuszy import harness as parytet
    from tests.reference_networks.demo_oze_sc import build_demo_oze_sc_network
    from tests.reference_networks.sld_substrate_52s import build_sld_substrate_52s

    sieci: list[tuple[str, Any]] = [("golden_enm", build_golden_enm().model_dump(mode="json"))]
    sieci += [(klucz, enm.model_dump(mode="json")) for klucz, enm in sieci_enm_rejestru()]
    sieci += [
        ("parytet/pierscien", parytet._pierscien().model_dump(mode="json")),
        ("parytet/napiecie", parytet._napiecie_graniczne().model_dump(mode="json")),
        (
            "parytet/kompensacja",
            parytet._kompensacja(load_q_mvar=0.5, gen_p_mw=1.0).model_dump(mode="json"),
        ),
        ("parytet/promien", parytet._siec_promieniowa().model_dump(mode="json")),
        ("parytet/rozgalezienie", parytet._siec_rozgalezienie().model_dump(mode="json")),
        ("demo_oze_sc", build_demo_oze_sc_network()),
        ("sld_substrate_52s", build_sld_substrate_52s()),
    ]
    return sieci


def test_nazwy_elementow_sieci_generatorow_fikstur():
    bledy: list[str] = []
    for klucz, siec in _sieci_generatorow():
        bledy += [f"{klucz}: {b}" for b in _bledy_nazw(_nazwy_elementow(siec, opisy=True))]
    assert not bledy, "Nazwy elementów bez polskich znaków albo z „110kV”:\n" + "\n".join(bledy)


def test_nazwa_zrodla_gpz_jest_ziarnem_identyfikatorow():
    """Uzasadnienie wyjątku `NAZWY_ZIARNA_IDENTYFIKATOROW` jest faktem, nie deklaracją:
    ta sama operacja z nazwą poprawioną daje INNE identyfikatory GPZ. Gdy ziarno przestanie
    zależeć od nazwy, ten test zczerwienieje i wyjątek trzeba zdjąć (nazwa do poprawy)."""
    from enm.domain_operations import execute_domain_operation

    from tests.reference_networks.builders import _empty_enm

    def _refy_gpz(nazwa: str) -> list[str]:
        wynik = execute_domain_operation(
            _empty_enm(),
            "add_grid_source_sn",
            {
                "voltage_kv": 15.0,
                "source_name": nazwa,
                "sk3_mva": 300.0,
                "rx_ratio": 0.1,
                "catalog_ref": "src-gpz-15kv-300mva-rx010",
                "hv_voltage_kv": 110.0,
                "transformer_sn_mva": 25.0,
            },
        )
        assert wynik.get("error") is None, wynik.get("error")
        return sorted(b["ref_id"] for b in wynik["snapshot"]["buses"])

    (nazwa,) = NAZWY_ZIARNA_IDENTYFIKATOROW
    assert _refy_gpz(nazwa) != _refy_gpz("GPZ Pierścień")


def test_nazwy_w_fiksturach_harnessu_frontu():
    """Fikstury harnessu (to, co widzi ekran i zrzut B-02) — nazwy i etykiety."""
    pliki = sorted((FRONTEND / "src" / "harness-fixtures" / "generated").glob("*.json"))
    assert pliki, "brak fikstur harnessu — zmienił się układ katalogów"
    bledy: list[str] = []
    for plik in pliki:
        dane = json.loads(plik.read_text(encoding="utf-8"))
        bledy += [f"{plik.name}: {b}" for b in _bledy_nazw(_nazwy_elementow(dane, opisy=False))]
    assert not bledy, "\n".join(bledy)


# --- detektor: iloczyn cech, w którym defekt mógłby się schować ---------------------


@pytest.mark.parametrize(
    ("zrodlo", "oczekiwane"),
    [
        # zwykły literał × wielkość liter
        ('X = "Nie mozna ocenic mocy"', ["mozna", "ocenic"]),
        ('X = "Odbior nN"', ["Odbior"]),
        ('X = "wynik liczby dotycza WCZESNIEJSZEJ wersji"', ["dotycza", "WCZESNIEJSZEJ"]),
        # f-string: tekst oceniany, wyrażenie nie
        ('X = f"Galaz {wartosc}: {obj.napiecie} kV"', ["Galaz"]),
        # .format: pole {nazwa} nie jest tekstem, \\text{...} LaTeX jest
        ('X = "Szyna {napiecie} kV".format(napiecie=1)', []),
        ('X = r"P \\le P_{\\text{budzet}}"', ["budzet"]),
        # konkatenacja niejawna w wielu liniach
        ('X = (\n    "pierwsza linia "\n    "druga linia pradu"\n)', ["pradu"]),
        # sekwencja ucieczki przed słowem
        ('X = "a\\nobciazenie"', ["obciazenie"]),
        # akcent LaTeX \\' nie jest początkiem słowa
        ('X = r"bezpo\\\'srednio"', []),
        # kod w odwrotnych apostrofach, identyfikator, docstring, %(pole)s
        ('X = "pole `wartosc` jest puste"', []),
        ('X = "zrodlo_sn"', []),
        # f-string o postaci identyfikatora (klucz kryterium, krok śladu) nie jest tekstem
        ('X = f"lom.{bay}.obecnosc"', []),
        ('X = f"{pole}/sa"', []),
        ('def f():\n    """Zwraca wartosc."""\n    return 1', []),
        ('X = "%(wartosc)s i tyle"', []),
        # kod WIELKIMI literami przy łączniku albo jako samodzielny literał
        ('X = "reguła KAT-T-001"', []),
        ('A = "OSTRZEZENIE"\nB = "zawsze OSTRZEZENIE"', []),
        # słowo przyklejone do liter z diakrytykami nie jest osobnym słowem
        ('X = "moc prawidłową"', []),
        # skrót z kropką („kat." = kategoria) nie jest słowem bez znaków, „kat" bez kropki jest
        ('X = "NC RfG kat. B"', []),
        ('X = "V={} pu, kat={} deg"', ["kat"]),
        # poprawny tekst
        ('X = "Nie można ocenić mocy w węźle"', []),
    ],
)
def test_detektor_slow_bez_znakow(zrodlo: str, oczekiwane: list[str]):
    kody = kody_zrodel([zrodlo])
    znalezione = [s for _, t in literaly_tekstu(zrodlo) for s in slowa_bez_znakow(t, kody)]
    assert znalezione == oczekiwane


@pytest.mark.parametrize(
    ("tekst", "oczekiwane"),
    [
        ("GPZ 110kV", ["110kV"]),
        ("TR 15/0,4kV", ["0,4kV"]),  # człon przekładni po ukośniku też jest liczbą z jednostką
        ("In<=16A", ["16A"]),  # znak porównania bez spacji nie zwalnia z odstępu przed jednostką
        ("Szyna 0,4kV", ["0,4kV"]),
        ("GPZ 110 kV", []),
        ("Vestas V90-2MW", []),
        ("TK 521_VD4_40kA_E", []),
        (r"\sqrt{20A}", []),
        ("(Ur=17.5kV)", ["17.5kV"]),
    ],
)
def test_detektor_jednostek_sklejonych(tekst: str, oczekiwane: list[str]):
    assert jednostki_sklejone(tekst) == oczekiwane


def test_slownik_nie_zawiera_form_poprawnych_bez_znakow():
    """Klucz słownika to forma BEZ znaków, a wartość różni się od klucza wyłącznie
    znakami diakrytycznymi — inaczej detektor zgłaszałby poprawne słowa albo
    podpowiadał formę, która nie jest tym samym słowem."""
    zdjecie = str.maketrans("ąćęłńóśźż", "acelnoszz")
    for klucz, poprawna in SLOWA_BEZ_ZNAKOW.items():
        assert klucz.isascii() and klucz.islower(), klucz
        assert poprawna != klucz, klucz
        assert poprawna.translate(zdjecie) == klucz, (klucz, poprawna)


@pytest.mark.parametrize(
    ("opisy", "oczekiwane"),
    [
        (True, ["Odbior nN", "Szyna 110kV", "Wezel A", "opis sieci", "krok (stosowalnosc)"]),
        (False, ["Odbior nN", "Szyna 110kV", "Wezel A"]),
    ],
)
def test_zbieranie_nazw_i_opisow(opisy: bool, oczekiwane: list[str]):
    """Iloczyn: klucz nazwy × klucz opisu × zagnieżdżenie w liście × identyfikator."""
    dane = {
        "loads": [{"name": "Odbior nN", "ref_id": "load_nn"}],
        "bus_name": "Szyna 110kV",
        "wezly": [{"nazwa_pl": "Wezel A", "label": "zrodlo_sn"}],
        "description": "opis sieci",
        "kroki": [{"opis_pl": "krok (stosowalnosc)"}],
    }
    assert sorted(_nazwy_elementow(dane, opisy=opisy)) == sorted(oczekiwane)
