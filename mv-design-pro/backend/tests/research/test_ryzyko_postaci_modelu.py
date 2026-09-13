"""§11.3/8 — czy inwentarz ograniczników jest KOMPLETNY wobec ŹRÓDEŁ.

KOD BADAWCZY — patrz `backend/research/README.md`.

Rdzeniem pliku jest jeden test: przejście drzewem składni WSZYSTKICH modułów
laboratorium i żądanie, żeby każde miejsce ograniczające wielkość miało wpis w
`INWENTARZ`. Bez niego zdanie „lista jest zamknięta" byłoby obietnicą bez testu
— czyli rzeczą groźniejszą od samego braku listy, bo wyłącza czujność.
"""

from __future__ import annotations

import ast
import pathlib

import pytest
from dynamic_lab.ryzyko_postaci_modelu import (
    INWENTARZ,
    KlasaRyzyka,
    PostacOgranicznika,
    PozycjaOgranicznika,
    miejsca_inwentarza,
    pozycje_o_ryzyku,
)

KATALOG = pathlib.Path(__file__).resolve().parents[2] / "research" / "dynamic_lab"

#: Wywołania, które OGRANICZAJĄ wielkość fizyczną. Lista jest częścią kontraktu
#: testu: dołożenie nowego prymitywu ograniczającego wymaga dopisania go TUTAJ,
#: inaczej skan przestałby widzieć całą jego rodzinę.
WYWOLANIA_OGRANICZAJACE = frozenset(
    {
        "_ogranicz",
        "ogranicz_do_przedzialu",
        "ogranicz_prad",
        "ogranicz_okregiem",
        "OgraniczenieStanu",
    }
)

#: Moduły, w których ograniczenie NIE jest modelem urządzenia i nie podlega
#: inwentarzowi ryzyka postaci. Każdy wpis wymaga uzasadnienia — bo wyjątek bez
#: uzasadnienia jest sposobem na ciche wypisanie się z bramki.
POZA_INWENTARZEM: dict[str, str] = {
    "calkowanie.py": (
        "warstwa NUMERYCZNA: rzutowanie wykonuje integrator na granicach ZADEKLAROWANYCH "
        "przez urządzenia — ryzyko postaci należy do deklarującego, nie do wykonawcy"
    ),
    "ryzyko_postaci_modelu.py": (
        "sam inwentarz: opisuje ograniczniki, a nie ogranicza niczego — skanowanie go "
        "kazaloby rejestrowac wlasne wpisy jako miejsca ograniczajace"
    ),
}


def _miejsca_w_zrodlach() -> dict[tuple[str, str], list[int]]:
    """``(plik, symbol) -> [linie]`` dla każdego wywołania ograniczającego."""
    znalezione: dict[tuple[str, str], list[int]] = {}
    for sciezka in sorted(KATALOG.glob("*.py")):
        if sciezka.name in POZA_INWENTARZEM:
            continue
        drzewo = ast.parse(sciezka.read_text(encoding="utf-8"))
        rodzic: dict[ast.AST, ast.AST] = {}
        for wezel in ast.walk(drzewo):
            for dziecko in ast.iter_child_nodes(wezel):
                rodzic[dziecko] = wezel
        for wezel in ast.walk(drzewo):
            if not isinstance(wezel, ast.Call):
                continue
            funkcja = wezel.func
            nazwa = (
                funkcja.id
                if isinstance(funkcja, ast.Name)
                else funkcja.attr if isinstance(funkcja, ast.Attribute) else None
            )
            if nazwa not in WYWOLANIA_OGRANICZAJACE:
                continue
            sciezka_symboli: list[str] = []
            biezacy: ast.AST | None = rodzic.get(wezel)
            while biezacy is not None:
                if isinstance(biezacy, ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef):
                    sciezka_symboli.append(biezacy.name)
                biezacy = rodzic.get(biezacy)
            symbol = ".".join(reversed(sciezka_symboli)) or "<modul>"
            znalezione.setdefault((sciezka.name, symbol), []).append(wezel.lineno)
    return znalezione


def test_skan_zrodel_w_ogole_cos_znajduje() -> None:
    """Kontrola samego narzędzia: skan, który nic nie widzi, przechodzi zawsze.

    Bez tego testu literówka w `WYWOLANIA_OGRANICZAJACE` albo zmiana układu
    katalogów zamieniłaby bramkę kompletności w test tożsamościowo prawdziwy.
    """
    miejsca = _miejsca_w_zrodlach()
    assert len(miejsca) >= 14, f"skan znalazł tylko {len(miejsca)} miejsc — to podejrzanie mało"
    assert sum(len(linie) for linie in miejsca.values()) >= 30


def test_KAZDE_miejsce_ograniczajace_ma_wpis_w_inwentarzu() -> None:
    """SEDNO §11.3/8: nie da się dołożyć ogranicznika bez świadomej klasyfikacji."""
    w_zrodlach = set(_miejsca_w_zrodlach())
    zarejestrowane = miejsca_inwentarza()
    brakujace = sorted(w_zrodlach - zarejestrowane)
    assert (
        not brakujace
    ), "Miejsca ograniczające bez wpisu w INWENTARZ (plik, symbol): " + ", ".join(
        f"{plik}:{symbol}" for plik, symbol in brakujace
    )


def test_inwentarz_nie_opisuje_miejsc_KTORYCH_NIE_MA() -> None:
    """Druga strona tej samej równości — wpis-widmo jest tak samo szkodliwy.

    Wyjątkiem są pozycje opisujące KLASĘ, a nie wywołanie (strategie ogranicznika
    GFM i GFM bez ogranicznika): ich „miejscem" jest istnienie typu, nie linia z
    wywołaniem prymitywu. Są wypisane imiennie, żeby wyjątek nie był workiem.
    """
    bez_wywolania = {
        # Strategie GFM: „miejscem" jest istnienie typu realizującego protokół,
        # a nie linia z wywołaniem prymitywu — obie liczą ograniczenie same.
        ("urzadzenia.py", "KandydatOgraniczeniaNasycenieZadania.prad_ograniczony"),
        ("urzadzenia.py", "KandydatOgraniczeniaImpedancjaWirtualna.prad_ograniczony"),
        # GFM bez ogranicznika: pozycja opisuje BRAK, więc z definicji nie ma
        # wywołania, które by ją potwierdzało. Bez tego wyjątku luka modelu nie
        # mogłaby w ogóle trafić do rejestru — a właśnie ona jest tam najbardziej
        # potrzebna.
        ("urzadzenia.py", "FalownikGFM"),
        # Prymityw wspólny: `ogranicz_do_przedzialu` jest DEFINICJĄ, nie wywołaniem
        # (wywołania jego są rejestrowane przez symbole, które go wołają).
        ("konwencje.py", "ogranicz_do_przedzialu"),
    }
    w_zrodlach = set(_miejsca_w_zrodlach())
    widma = sorted(miejsca_inwentarza() - w_zrodlach - bez_wywolania)
    assert not widma, f"Wpisy inwentarza bez odpowiednika w źródłach: {widma}"


def test_wyjatki_ze_skanu_maja_uzasadnienie_i_istnieja() -> None:
    """Wyjątek bez uzasadnienia jest cichym wypisaniem się z bramki."""
    for nazwa, powod in POZA_INWENTARZEM.items():
        assert (KATALOG / nazwa).exists(), f"wyjątek dla nieistniejącego pliku: {nazwa}"
        assert len(powod.strip()) > 20, f"wyjątek `{nazwa}` bez rzeczywistego uzasadnienia"


def test_klasy_ze_strategiami_gfm_naprawde_istnieja() -> None:
    """Wyjątek „miejscem jest typ" musi wskazywać typ, który jest w źródle."""
    zrodlo = (KATALOG / "urzadzenia.py").read_text(encoding="utf-8")
    for klasa in (
        "KandydatOgraniczeniaNasycenieZadania",
        "KandydatOgraniczeniaImpedancjaWirtualna",
        "FalownikGFM",
    ):
        assert f"class {klasa}" in zrodlo


# ---------------------------------------------------------------------------
# WŁASNOŚCI SAMEJ KLASYFIKACJI
# ---------------------------------------------------------------------------


def test_identyfikatory_sa_unikalne() -> None:
    identyfikatory = [p.identyfikator for p in INWENTARZ]
    assert len(set(identyfikatory)) == len(identyfikatory)


def test_kazda_pozycja_o_zmierzonej_alternatywie_podaje_LICZBE() -> None:
    """„Zmierzone" bez liczby jest deklaracją — a deklaracja nie jest pomiarem."""
    for pozycja in pozycje_o_ryzyku(KlasaRyzyka.ALTERNATYWA_ZMIERZONA):
        assert any(znak.isdigit() for znak in pozycja.pomiar_pl), (
            f"{pozycja.identyfikator}: klasa ALTERNATYWA_ZMIERZONA, a w opisie pomiaru "
            f"nie ma ani jednej cyfry"
        )


def test_kazda_pozycja_o_niezmierzonej_alternatywie_MOWI_TO_WPROST() -> None:
    """Brak pomiaru ma być widoczny w treści, a nie wyłącznie w etykiecie enuma."""
    for pozycja in pozycje_o_ryzyku(KlasaRyzyka.ALTERNATYWA_NIEZMIERZONA):
        assert (
            "NIE ZMIERZONO" in pozycja.pomiar_pl
        ), f"{pozycja.identyfikator}: alternatywa niezmierzona, a opis tego nie mówi"
        assert (
            pozycja.alternatywy_pl
        ), f'{pozycja.identyfikator}: „alternatywa niezmierzona" bez wskazania alternatywy'


def test_postac_wymuszona_nie_moze_miec_alternatyw() -> None:
    """Sprzeczność wewnętrzna jest łapana konstruktorem — tu jest to przypięte."""
    with pytest.raises(ValueError, match="WYMUSZONA i mieć alternatyw"):
        PozycjaOgranicznika(
            identyfikator="test",
            plik="x.py",
            symbol="f",
            wielkosc_pl="x",
            jednostka="p.u.",
            postac=PostacOgranicznika.OBCIECIE_ZADANIA,
            klasa_ryzyka=KlasaRyzyka.POSTAC_WYMUSZONA,
            alternatywy_pl=("inna postać",),
            uzasadnienie_pl="cokolwiek",
            pomiar_pl="",
            test_przypinajacy="test_x",
        )


def test_zmierzona_alternatywa_bez_pomiaru_jest_odrzucana() -> None:
    with pytest.raises(ValueError, match="bez podanego pomiaru"):
        PozycjaOgranicznika(
            identyfikator="test",
            plik="x.py",
            symbol="f",
            wielkosc_pl="x",
            jednostka="p.u.",
            postac=PostacOgranicznika.OBCIECIE_ZADANIA,
            klasa_ryzyka=KlasaRyzyka.ALTERNATYWA_ZMIERZONA,
            alternatywy_pl=("inna postać",),
            uzasadnienie_pl="cokolwiek",
            pomiar_pl="   ",
            test_przypinajacy="test_x",
        )


def test_wpis_bez_testu_przypinajacego_jest_odrzucany() -> None:
    with pytest.raises(ValueError, match="obietnica bez testu"):
        PozycjaOgranicznika(
            identyfikator="test",
            plik="x.py",
            symbol="f",
            wielkosc_pl="x",
            jednostka="p.u.",
            postac=PostacOgranicznika.OBCIECIE_ZADANIA,
            klasa_ryzyka=KlasaRyzyka.POSTAC_WYMUSZONA,
            alternatywy_pl=(),
            uzasadnienie_pl="cokolwiek",
            pomiar_pl="",
            test_przypinajacy="",
        )


def test_luka_modelu_jest_JAWNA_a_nie_ukryta_w_komentarzu() -> None:
    """Jedyna luka (GFM bez ogranicznika) ma być widoczna w rejestrze, z pomiarem."""
    luki = pozycje_o_ryzyku(KlasaRyzyka.LUKA_MODELU)
    assert len(luki) == 1
    (luka,) = luki
    assert luka.identyfikator == "gfm-bez-ogranicznika"
    assert luka.postac is PostacOgranicznika.BRAK_OGRANICZNIKA
    assert "2,4425" in luka.pomiar_pl


def test_rozklad_ryzyka_jest_RAPORTOWALNY() -> None:
    """Meldunek ma pochodzić z danych, nie z przepisania ręcznego."""
    razem = sum(len(pozycje_o_ryzyku(k)) for k in KlasaRyzyka)
    assert razem == len(INWENTARZ)


# ---------------------------------------------------------------------------
# WPISY REJESTRU MUSZĄ WSKAZYWAĆ TESTY, KTÓRE ISTNIEJĄ
# ---------------------------------------------------------------------------


def _nazwy_testow_laboratorium() -> frozenset[str]:
    katalog = pathlib.Path(__file__).resolve().parent
    nazwy: set[str] = set()
    for plik in katalog.glob("test_*.py"):
        drzewo = ast.parse(plik.read_text(encoding="utf-8"))
        for wezel in ast.walk(drzewo):
            if isinstance(wezel, ast.FunctionDef | ast.AsyncFunctionDef) and wezel.name.startswith(
                "test_"
            ):
                nazwy.add(wezel.name)
    return frozenset(nazwy)


def test_KAZDY_test_przypinajacy_z_rejestru_ISTNIEJE() -> None:
    """Wpis wskazujący nieistniejący test jest gorszy niż brak wpisu.

    Pierwsza wersja `INWENTARZ` wskazywała 15 nazw z 20, których w repozytorium
    NIE BYŁO — nazwy brzmiały wiarygodnie i cały rejestr wyglądał na przypięty.
    To jest dokładnie „deklaracja bez testu = fałszywa pewność": rejestr wyłączał
    czujność, zamiast ją podtrzymywać.
    """
    istniejace = _nazwy_testow_laboratorium()
    brakujace = sorted({p.test_przypinajacy for p in INWENTARZ} - istniejace)
    assert not brakujace, "Wpisy INWENTARZ wskazują testy, których nie ma: " + ", ".join(brakujace)
