"""Taksonomia dowodów — JEDEN zbiór identyfikatorów, pilnowany testem.

KOD BADAWCZY — patrz `backend/research/README.md`.

Laboratorium miało dwie sprzeczne definicje „poziomu 4": `benchmarki.py`
nazywał tak sieć SN z DER, `wzorzec_zewnetrzny.py` — porównanie z ANDES.
Sam komentarz tego nie naprawia: bez testu rejestr rozjedzie się z kodem przy
pierwszej nowej pozycji. Te testy pilnują, że rejestr opisuje realny stan.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from dynamic_lab.drabina import (
    DRABINA,
    NiezaleznoscOdniesienia,
    PoziomWyroczni,
    PozycjaDrabiny,
    ZlozonoscPrzypadku,
    czy_walidacja_fizyczna,
    podsumowanie,
    pozycje_o_wyroczni,
)

KATALOG_TESTOW = Path(__file__).resolve().parent


def test_identyfikatory_sa_unikalne() -> None:
    identyfikatory = [p.identyfikator for p in DRABINA]
    assert len(identyfikatory) == len(set(identyfikatory))


def test_etykieta_jest_jednoznaczna_i_ma_WSZYSTKIE_TRZY_osie() -> None:
    """`C1/W3` nie mogło być mylone z `C4/W1` — a dziś dochodzi oś niezależności.

    Trzecia oś (N) powstała, bo dwie nie odróżniały „wzór mój wobec mojego kodu"
    od „narzędzie cudze wobec mojego kodu realizujące TE SAME równania" — a to
    jest różnica między wykryciem błędu implementacji a wykryciem błędu postaci
    modelu.
    """
    for pozycja in DRABINA:
        assert re.fullmatch(r"C[0-4]/W[0-3]/N[0-4]", pozycja.etykieta), pozycja.etykieta


def test_kazda_realizacja_istnieje() -> None:
    """Wpis wskazujący nieistniejący test byłby deklaracją bez pokrycia."""
    tresc_testow = "\n".join(
        p.read_text(encoding="utf-8") for p in KATALOG_TESTOW.glob("test_*.py")
    )
    braki = []
    for pozycja in DRABINA:
        realizacja = pozycja.realizacja
        if realizacja.endswith(".py"):
            if not (KATALOG_TESTOW.parents[1] / realizacja).exists():
                braki.append(realizacja)
        elif f"def {realizacja}" not in tresc_testow:
            braki.append(realizacja)
    assert not braki, f"Rejestr wskazuje nieistniejące realizacje: {braki}"


def test_kazda_os_ma_pokrycie_powyzej_ksztaltu() -> None:
    """Rejestr nie może składać się z samych testów kształtu.

    W0 nie dowodzi fizyki — gdyby wszystkie pozycje były na W0, laboratorium
    byłoby w tym samym stanie co audytowana produkcja (84 % testów kształtu).
    """
    assert not pozycje_o_wyroczni(
        PoziomWyroczni.W0_KSZTALT
    ), "Pozycja na poziomie W0 nie jest dowodem fizyki — nie należy do rejestru."
    assert pozycje_o_wyroczni(PoziomWyroczni.W2_WYROCZNIA_ANALITYCZNA)
    assert pozycje_o_wyroczni(PoziomWyroczni.W3_WYROCZNIA_ZEWNETRZNA)


def test_pokryte_sa_wszystkie_klasy_defektow_z_audytu() -> None:
    """Każdy przypadek osi C ma co najmniej jeden dowód — inaczej klasa defektu wisi."""
    pokryte = {p.zlozonosc for p in DRABINA}
    for zlozonosc in ZlozonoscPrzypadku:
        assert zlozonosc in pokryte, f"Brak dowodu dla {zlozonosc.value}"


def test_podsumowanie_nadaje_sie_do_meldunku() -> None:
    tekst = podsumowanie()
    assert tekst.startswith("| Etykieta |")
    assert tekst.count("\n") == len(DRABINA) + 1
    for pozycja in DRABINA:
        assert pozycja.etykieta in tekst


@pytest.mark.parametrize("nazwa_modulu", ["benchmarki", "wzorzec_zewnetrzny"])
def test_moduly_nie_uzywaja_juz_kolidujacego_nazewnictwa(nazwa_modulu: str) -> None:
    """Stare etykiety „L4"/„Poziom 4" nie mogą wrócić przez kopiowanie docstringów."""
    import importlib

    modul = importlib.import_module(f"dynamic_lab.{nazwa_modulu}")
    tresc = (modul.__doc__ or "").lower()
    assert "poziom 4" not in tresc
    assert "l0–l4" not in tresc and "l0-l4" not in tresc


# ---------------------------------------------------------------------------
# §11.3/13 — OŚ NIEZALEŻNOŚCI: czego NIE WOLNO nazwać walidacją fizyczną
# ---------------------------------------------------------------------------


def test_zaden_dowod_nie_udaje_pomiaru_na_obiekcie() -> None:
    """Stan faktyczny: laboratorium NIE MA ani jednego przebiegu z rzeczywistej jednostki.

    Test istnieje po to, żeby ten stan był EGZEKWOWANY, a nie tylko opisany:
    wpisanie N4 bez dołożenia realnych danych pomiarowych ma czerwienić bramkę.
    """
    z_pomiarem = [
        p for p in DRABINA if p.niezaleznosc is NiezaleznoscOdniesienia.POMIAR_NA_OBIEKCIE
    ]
    assert not z_pomiarem, (
        "Pozycje deklarujące pomiar na obiekcie: "
        + ", ".join(p.identyfikator for p in z_pomiarem)
        + ". Jeżeli takie dane faktycznie są, ten test trzeba zmienić RAZEM z nimi."
    )


def test_walidacja_fizyczna_jest_NIEOSIAGNIETA_i_modul_to_MOWI() -> None:
    """Najmocniejszy dowód w rejestrze to N1 — „te same równania, inny kod".

    §11.3/13 stawia to wprost: „te same równania, inny kod" NIE MOŻE uchodzić za
    niezależną walidację fizyczną. Tu jest to sprawdzane liczbą, a nie zdaniem.
    """
    najmocniejszy = max(p.niezaleznosc.value for p in DRABINA)
    assert najmocniejszy == "N1", (
        f"Najmocniejszy poziom niezależności w rejestrze to {najmocniejszy}. Jeżeli "
        f"podniesiono go świadomie, ten test wymaga zmiany razem z uzasadnieniem."
    )
    assert czy_walidacja_fizyczna() is False


def test_zrodlo_jest_WYMAGANE_dla_literatury_i_pomiaru() -> None:
    """Poziom niezależności bez cytatu jest deklaracją, nie odniesieniem."""
    with pytest.raises(ValueError, match="bez\\s+podanego źródła|bez podanego źródła"):
        PozycjaDrabiny(
            identyfikator="x",
            zlozonosc=ZlozonoscPrzypadku.C0_JEDNO_ROWNANIE,
            wyrocznia=PoziomWyroczni.W2_WYROCZNIA_ANALITYCZNA,
            opis_pl="x",
            realizacja="test_x",
            niezaleznosc=NiezaleznoscOdniesienia.WARTOSC_Z_LITERATURY,
        )


def test_zrodlo_przy_slabym_poziomie_jest_odrzucane() -> None:
    """Druga strona: cytat dopięty do dowodu N0 sugerowałby niezależność, której nie ma."""
    with pytest.raises(ValueError, match="niezależność, której ten dowód nie ma"):
        PozycjaDrabiny(
            identyfikator="x",
            zlozonosc=ZlozonoscPrzypadku.C0_JEDNO_ROWNANIE,
            wyrocznia=PoziomWyroczni.W2_WYROCZNIA_ANALITYCZNA,
            opis_pl="x",
            realizacja="test_x",
            zrodlo_odniesienia="Kundur, Power System Stability and Control, 1994",
        )


def test_wyrocznia_zewnetrzna_nie_moze_miec_niezaleznosci_N0() -> None:
    """Narzędzie zewnętrzne ma co najmniej własny kod — inaczej nie jest zewnętrzne."""
    with pytest.raises(ValueError, match="sprzeczność|sprzecznoscia|sprzecznością"):
        PozycjaDrabiny(
            identyfikator="x",
            zlozonosc=ZlozonoscPrzypadku.C1_MASZYNA_NA_SZYNIE_SZTYWNEJ,
            wyrocznia=PoziomWyroczni.W3_WYROCZNIA_ZEWNETRZNA,
            opis_pl="x",
            realizacja="test_x",
            niezaleznosc=NiezaleznoscOdniesienia.TEN_SAM_AUTOR_TE_SAME_ROWNANIA,
        )


def test_podsumowanie_pokazuje_os_niezaleznosci() -> None:
    """Meldunek ma nieść trzecią oś — inaczej czytelnik jej nie zobaczy."""
    tabela = podsumowanie()
    assert "/N0" in tabela or "/N1" in tabela
