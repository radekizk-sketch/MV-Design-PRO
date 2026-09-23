"""Testy wlasne guardu werdyktu wyjasnialnego (karta AB-1a D7, audyt §3.3 p. 8).

Siedem mutacji audytu + mutacja frontu, jako ILOCZYN CECH (KLASA NIE INSTANCJA):
forma nosnika (klasa z Literal | klasa z aliasem | slownik z literalem | slownik ze
stala modulowa | slownik z wyrazeniem warunkowym) x towarzysze (brak | komplet |
w rodzicu) x forma nie-nosnika (definicja typu | mapa etykiet | porownanie | StrEnum).
Lista wyjatkow: adapter istnieje i jest osiagalny z trasy API, adnotacja
WYCOFYWANA trzyma sie rejestru zdolnosci, pozycja spoza FROZEN i martwa pozycja sa
bledami, usuniecie pozycji z prawdziwej listy daje zgloszenie. Na koniec bramka na
prawdziwym drzewie (backend i front) — ta sama, ktora biegnie w CI.
"""

from __future__ import annotations

import ast
import sys
import textwrap
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from explainable_verdict_guard import (  # noqa: E402
    ALLOWLIST,
    ALLOWLIST_FRONTEND,
    BACKEND_SRC,
    FRONTEND_UI2,
    SKAN_FROZEN,
    PozycjaWyjatku,
    _pliki_backendu,
    _pliki_frontu,
    adapter_wolany_z_trasy_api,
    main_backend,
    main_frontend,
    sprawdz_liste_wyjatkow,
    wczytaj_liste_wyjatkow,
    wczytaj_liste_wyjatkow_frontu,
    zbierz_zgloszenia_backend,
    zbierz_zgloszenia_frontend,
)

KOMPLET_POL = """
    wartosc: float | None
    odniesienie: float | None
    margines: float | None
    podstawa: str | None
    dowod: str | None
"""


def _zgloszenia(kod: str, plik: str = "application/x.py") -> list[str]:
    drzewo = ast.parse(textwrap.dedent(kod))
    return [z.ident for z in zbierz_zgloszenia_backend({plik: drzewo})]


# ---------------------------------------------------------------------------
# Mutacja 1 — klasa z gołym Literal jest zgłaszana
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("baza", ["BaseModel", "", "TypedDict"])
def test_m1_klasa_z_golym_literalem_zgloszona(baza: str) -> None:
    naglowek = f"class Verdict({baza}):" if baza else "@dataclass\nclass Verdict:"
    kod = (
        "from typing import Literal\n"
        + naglowek
        + '\n    status: Literal["pass", "fail"]\n    message: str\n'
    )
    assert _zgloszenia(kod) == ["application/x.py::Verdict"]


# ---------------------------------------------------------------------------
# Mutacja 2 — ta sama klasa z pięcioma grupami nie jest zgłaszana
# ---------------------------------------------------------------------------


def test_m2_klasa_z_piecioma_grupami_nie_zgloszona() -> None:
    kod = (
        "from typing import Literal\nclass Verdict(BaseModel):\n"
        '    status: Literal["pass", "fail"]\n' + KOMPLET_POL
    )
    assert _zgloszenia(kod) == []


@pytest.mark.parametrize("brakujace", ["wartosc", "odniesienie", "margines", "podstawa", "dowod"])
def test_m2_brak_jednej_grupy_wystarcza_do_zgloszenia(brakujace: str) -> None:
    pola = "\n".join(
        linia for linia in KOMPLET_POL.splitlines() if not linia.strip().startswith(brakujace)
    )
    kod = (
        "from typing import Literal\nclass Verdict(BaseModel):\n"
        '    status: Literal["pass", "fail"]\n' + pola + "\n"
    )
    assert _zgloszenia(kod) == ["application/x.py::Verdict"]


def test_m2_towarzysze_z_klasy_bazowej_naleza_do_nosnika() -> None:
    kod = (
        "from typing import Literal\nclass Baza(BaseModel):\n"
        + KOMPLET_POL
        + '\nclass Verdict(Baza):\n    status: Literal["PASS", "FAIL"]\n'
    )
    assert _zgloszenia(kod) == []


# ---------------------------------------------------------------------------
# Mutacja 3 — definicja aliasu NIE jest nosnikiem; klasa z aliasem JEST
# ---------------------------------------------------------------------------


def test_m3_sama_definicja_aliasu_nie_zgloszona() -> None:
    assert (
        _zgloszenia('from typing import Literal\nWynik = Literal["SPELNIA", "NIE_SPELNIA"]\n') == []
    )


def test_m3_klasa_z_aliasem_z_innego_pliku_zgloszona() -> None:
    typy = ast.parse('from typing import Literal\nWynik = Literal["SPELNIA", "NIE_SPELNIA"]\n')
    nosnik = ast.parse("class Pozycja(BaseModel):\n    wynik: Wynik\n    opis: str\n")
    zgl = zbierz_zgloszenia_backend({"solver_input/typy.py": typy, "api/p.py": nosnik})
    assert [z.ident for z in zgl] == ["api/p.py::Pozycja"]


def test_m3_strenum_i_klasa_bez_pol_nie_sa_nosnikiem() -> None:
    kod = """
    from enum import StrEnum
    class Status(StrEnum):
        PASS = "PASS"
        FAIL = "FAIL"
    """
    assert _zgloszenia(kod) == []


# ---------------------------------------------------------------------------
# Mutacja 4 — mapa etykiet i porównanie nie są nośnikami
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "kod",
    [
        'ETYKIETY = {"pass": "Spełnia", "fail": "Nie spełnia"}\n',
        'WYNIK = "SPELNIA"\nETYKIETY = {WYNIK: "spełnia"}\n',
        'def f(t):\n    return t.verdict == "pass"\n',
        'def f(t):\n    return {"opis": "pass"}\n',
    ],
)
def test_m4_mapa_etykiet_i_porownanie_nie_zgloszone(kod: str) -> None:
    assert _zgloszenia(kod) == []


# ---------------------------------------------------------------------------
# Mutacja 5 — `return {"status": "zgodny"}` zgłaszany (każda forma wartości)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "kod",
    [
        'def f():\n    return {"status": "zgodny"}\n',
        'ZGODNY = "zgodny"\ndef f():\n    return {"status": ZGODNY}\n',
        'def f(ok):\n    return {"verdict": "PASS" if ok else "FAIL"}\n',
        'def f():\n    return {"overall_status": "niezgodny", "wartosc": 1}\n',
    ],
)
def test_m5_slownik_z_werdyktem_bez_towarzyszy_zgloszony(kod: str) -> None:
    zgl = _zgloszenia(kod)
    assert len(zgl) == 1 and zgl[0].startswith("application/x.py::f[")


def test_m5_slownik_z_towarzyszami_w_slowniku_nadrzednym_nie_zgloszony() -> None:
    kod = """
    def f():
        return {
            "werdykt": {"status": "zgodny"},
            "wartosc": 1, "odniesienie": 2, "margines": 1, "podstawa": "x", "dowod": "y",
        }
    """
    assert _zgloszenia(kod) == []


def test_m5_dwa_nosniki_w_jednej_funkcji_to_dwa_zgloszenia() -> None:
    kod = 'def f():\n    a = {"status": "PASS"}\n    return [a, {"status": "FAIL"}]\n'
    assert _zgloszenia(kod) == ["application/x.py::f[status]", "application/x.py::f[status]#2"]


# ---------------------------------------------------------------------------
# Mutacja 6 — zagnieżdżenie (PozycjaWerdyktu → OcenaElementu) nie jest zgłaszane
# ---------------------------------------------------------------------------


def test_m6_nosnik_zagniezdzony_w_klasie_z_towarzyszami_nie_zgloszony() -> None:
    kod = (
        "from typing import Literal\n"
        'class OcenaElementu(BaseModel):\n    wynik: Literal["SPELNIA", "NIE_SPELNIA"]\n'
        "class PozycjaOceny(BaseModel):\n    elementy: list[OcenaElementu]\n" + KOMPLET_POL
    )
    assert _zgloszenia(kod) == []


def test_m6_klasa_wynik_inzynierski_i_jej_pola_sa_zgodne_z_definicji() -> None:
    kod = (
        "from typing import Literal\n"
        'class Wiersz(BaseModel):\n    status: Literal["PASS"]\n'
        'class WynikInzynierski(BaseModel):\n    status: Literal["PASS"]\n    wiersz: "Wiersz"\n'
    )
    assert _zgloszenia(kod) == []


# ---------------------------------------------------------------------------
# Mutacja 7 — usunięcie pozycji z listy wyjątków daje zgłoszenie (prawdziwe drzewo)
# ---------------------------------------------------------------------------


def _prawdziwe() -> tuple[list, list[PozycjaWyjatku]]:
    zgl = zbierz_zgloszenia_backend(_pliki_backendu(BACKEND_SRC))
    return zgl, wczytaj_liste_wyjatkow(ALLOWLIST.read_text(encoding="utf-8"))


def test_m7_usuniecie_kazdej_pozycji_listy_daje_zgloszenie() -> None:
    zgl, pozycje = _prawdziwe()
    assert pozycje, "lista wyjatkow pusta — mutacja nic by nie sprawdzala"
    for usunieta in pozycje:
        reszta = [p for p in pozycje if p is not usunieta]
        poza, bledy = sprawdz_liste_wyjatkow(zgl, reszta, BACKEND_SRC)
        assert [z.ident for z in poza] == [usunieta.ident]
        assert bledy == []


def test_m7_pliki_frozen_skanowane_zawsze() -> None:
    zgl, _ = _prawdziwe()
    for plik in SKAN_FROZEN:
        assert any(z.plik == plik for z in zgl), plik


# ---------------------------------------------------------------------------
# Lista wyjątków — adapter, adnotacja, zakres FROZEN, martwe wpisy
# ---------------------------------------------------------------------------


def test_kazdy_adapter_listy_istnieje_i_jest_osiagalny_z_trasy_api() -> None:
    _zgl, pozycje = _prawdziwe()
    adaptery = [p.adapter for p in pozycje if "::" in p.adapter]
    assert adaptery
    for adapter in adaptery:
        ok, opis = adapter_wolany_z_trasy_api(BACKEND_SRC, adapter)
        assert ok, opis


def _mini_src(tmp_path: Path, trasa_wola_adapter: bool) -> Path:
    (tmp_path / "api").mkdir()
    (tmp_path / "application").mkdir()
    (tmp_path / "application" / "adapter.py").write_text(
        "def pomocnik(x):\n    return x\n\ndef opakuj(x):\n    return pomocnik(x)\n",
        encoding="utf-8",
    )
    cialo = "    return posredni(1)\n" if trasa_wola_adapter else "    return 1\n"
    (tmp_path / "api" / "trasa.py").write_text(
        "@router.get('/x')\ndef trasa():\n" + cialo + "\ndef posredni(y):\n    return opakuj(y)\n",
        encoding="utf-8",
    )
    return tmp_path


def test_adapter_osiagalny_przez_domkniecie_wywolan(tmp_path: Path) -> None:
    src = _mini_src(tmp_path, trasa_wola_adapter=True)
    assert adapter_wolany_z_trasy_api(src, "application/adapter.py::opakuj")[0]


@pytest.mark.parametrize(
    ("adapter", "wolany"),
    [
        ("application/adapter.py::opakuj", False),  # istnieje, ale zadna trasa go nie woła
        ("application/adapter.py::brak", True),  # funkcja nie istnieje
        ("application/brak.py::opakuj", True),  # plik nie istnieje
        ("application/adapter.py", True),  # bez `::funkcja`
    ],
)
def test_adapter_nieosiagalny_albo_nieistniejacy_to_blad(
    tmp_path: Path, adapter: str, wolany: bool
) -> None:
    src = _mini_src(tmp_path, trasa_wola_adapter=wolany)
    assert not adapter_wolany_z_trasy_api(src, adapter)[0]


def test_adnotacja_wycofywana_trzyma_sie_rejestru_zdolnosci() -> None:
    zgl, pozycje = _prawdziwe()
    wycofywane = [p for p in pozycje if p.adapter.startswith("WYCOFYWANA_AB-1d_min[")]
    assert wycofywane, "brak pozycji WYCOFYWANA — test nic by nie sprawdzal"
    # Prawdziwa adnotacja: wpis rejestru istnieje i nie jest wycofany -> bez bledu.
    assert sprawdz_liste_wyjatkow(zgl, pozycje, BACKEND_SRC)[1] == []
    # Adnotacja wskazujaca zdolnosc spoza rejestru -> blad.
    zmieniona = [
        (
            PozycjaWyjatku(p.ident, "WYCOFYWANA_AB-1d_min[NIE_MA_TAKIEJ_ZDOLNOSCI]", p.powod)
            if p in wycofywane
            else p
        )
        for p in pozycje
    ]
    bledy = sprawdz_liste_wyjatkow(zgl, zmieniona, BACKEND_SRC)[1]
    assert any("NIE_MA_TAKIEJ_ZDOLNOSCI" in b for b in bledy)


def test_pozycja_spoza_frozen_i_martwa_pozycja_sa_bledami() -> None:
    zgl, pozycje = _prawdziwe()
    obca = PozycjaWyjatku(
        "application/analyses/ochrona_lom.py::Verdict",
        "application/ncrfg_compliance/wynik_inzynierski.py::z_testu_ncrfg",
        "proba",
    )
    bledy = sprawdz_liste_wyjatkow(zgl, [*pozycje, obca], BACKEND_SRC)[1]
    assert any("nie lezy w pliku FROZEN" in b for b in bledy)
    assert any("martwy wpis application/analyses/ochrona_lom.py::Verdict" in b for b in bledy)


@pytest.mark.parametrize(
    "linia",
    ["a -> b", "a -> b | ", "tylko ident"],
)
def test_format_listy_wyjatkow_bez_powodu_to_blad(linia: str) -> None:
    with pytest.raises(ValueError):
        wczytaj_liste_wyjatkow(linia)


# ---------------------------------------------------------------------------
# Mutacja frontu — ui2/**/api.ts
# ---------------------------------------------------------------------------


def _zgl_ts(tekst: str) -> list[str]:
    return [z.ident for z in zbierz_zgloszenia_frontend({"src/ui2/x/api.ts": tekst})]


@pytest.mark.parametrize(
    "tekst",
    [
        "export interface Wiersz {\n  readonly status: 'PASS' | 'FAIL';\n  readonly opis: string;\n}\n",
        "export type S = 'SPELNIA' | 'NIE_SPELNIA';\nexport interface Wiersz {\n  status: S;\n}\n",
        'export interface Wiersz {\n  readonly werdykt?: "zgodny" | "niezgodny";\n}\n',
    ],
)
def test_front_propercja_werdyktu_bez_towarzyszy_zgloszona(tekst: str) -> None:
    assert _zgl_ts(tekst) == [
        f"src/ui2/x/api.ts::Wiersz.{'werdykt' if 'werdykt' in tekst else 'status'}"
    ]


def test_front_komplet_towarzyszy_w_interfejsie_rodzicu_albo_bazie_nie_zgloszony() -> None:
    pola = (
        "  wartosc: number | null;\n  odniesienie: number | null;\n  margines: number | null;\n"
        "  podstawa: string | null;\n  dowod: string | null;\n"
    )
    wprost = "export interface Wiersz {\n  status: 'PASS' | 'FAIL';\n" + pola + "}\n"
    w_bazie = (
        "export interface Baza {\n" + pola + "}\n"
        "export interface Wiersz extends Baza {\n  status: 'PASS';\n}\n"
    )
    w_rodzicu = (
        "export interface Element {\n  wynik: 'SPELNIA';\n}\n"
        "export interface Pozycja {\n  elementy: readonly Element[];\n" + pola + "}\n"
    )
    for tekst in (wprost, w_bazie, w_rodzicu):
        assert _zgl_ts(tekst) == [], tekst


def test_front_komentarz_i_mapa_etykiet_nie_sa_nosnikiem() -> None:
    tekst = (
        "// export interface Stary { status: 'PASS' }\n"
        "export const ETYKIETY: Record<string, string> = { PASS: 'spełnia' };\n"
        "export interface Opis {\n  readonly tekst: string;\n}\n"
    )
    assert _zgl_ts(tekst) == []


def test_front_usuniecie_pozycji_listy_daje_zgloszenie_i_martwy_wpis_jest_bledem() -> None:
    zgl = {z.ident for z in zbierz_zgloszenia_frontend(_pliki_frontu(FRONTEND_UI2))}
    wyjatki = wczytaj_liste_wyjatkow_frontu(ALLOWLIST_FRONTEND.read_text(encoding="utf-8"))
    assert wyjatki and set(wyjatki) == zgl  # lista = dokladnie zmierzone nosniki
    with pytest.raises(ValueError):
        wczytaj_liste_wyjatkow_frontu("src/ui2/x/api.ts::A.status | ")


# ---------------------------------------------------------------------------
# Bramka na prawdziwym drzewie (to samo, co krok CI)
# ---------------------------------------------------------------------------


def test_prawdziwe_drzewo_backend_zielone() -> None:
    assert main_backend() == 0


def test_prawdziwe_drzewo_frontend_zielone() -> None:
    assert main_frontend() == 0


def test_ochrona_lom_nie_ma_juz_golego_verdict() -> None:
    """R-5 karty: `ochrona_lom.Verdict` przebudowany na OcenaNastawyLom z towarzyszami."""
    tekst = (BACKEND_SRC / "application" / "analyses" / "ochrona_lom.py").read_text(
        encoding="utf-8"
    )
    assert "class Verdict" not in tekst
    assert "class OcenaNastawyLom" in tekst
