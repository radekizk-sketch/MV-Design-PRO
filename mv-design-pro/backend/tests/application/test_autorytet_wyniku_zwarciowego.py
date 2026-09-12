"""GRANICA AUTORYTETU wyniku zwarciowego — obejścia downstream muszą być martwe.

CO ODRZUCIŁA RECENZJA NIEZALEŻNA (runda 2). Poprzednia remediacja zabramkowała
URUCHOMIENIE nowej analizy, ale cztery zdolności nazwane w decyzji właściciela —
dobór zdolności wyłączalnej, koordynacja zabezpieczeń, dowód wytrzymałości
zwarciowej i dowód regulacyjny — nie miały ANI JEDNEGO wykonywalnego punktu
wywołania bramki. Recenzent zmierzył to wprost: nazwy występowały wyłącznie w
module wyliczenia zdolności.

REGUŁA SPRAWDZANA TUTAJ:

    miarodajny wynik zależny od zwarcia
    wymaga miarodajnej proweniencji wejścia.

ILOCZYN CECH, NIE PRZYKŁAD Z KARTY. Defekt mógł się schować w kombinacji
(droga wejścia wyniku) × (konsument miarodajny). Dlatego przypadki idą przez
OBIE osie: cztery drogi wejścia (świeży bieg, wynik historyczny/odtworzony,
wynik zbudowany ręcznie, liczby wprost z żądania) razy komplet konsumentów.
Sam scenariusz z recenzji pokryłby jedną komórkę tej tabeli.
"""

from __future__ import annotations

from typing import Any

import pytest
from network_model.core.autorytet_wyniku_zwarciowego import (
    KOD_BLOKADY_WYNIK_BEZ_SLADU,
    KOD_BLOKADY_WYNIK_Z_PAYLOADU,
    BrakAutorytetuWyniku,
    ProweniencjaWynikuZwarciowego,
    blokady_autorytetu,
    wymagaj_autorytetu,
    wynik_jest_miarodajny,
)
from network_model.core.inverter import InverterSource
from network_model.core.wklad_zwarciowy_przeksztaltnika import (
    K_SC_ZRODLO_DOMYSLNE,
    K_SC_ZRODLO_NIEPOPRAWNE,
    K_SC_ZRODLO_POZA_DZIEDZINA,
)
from network_model.core.zdolnosci_wkladu_zwarciowego import (
    KOD_BLOKADY_K_SC_DOMYSLNY,
    KOD_BLOKADY_K_SC_NIEPOPRAWNY,
    KOD_BLOKADY_K_SC_POZA_DZIEDZINA,
    ZDOLNOSCI_NIEZALEZNE_OD_WKLADU_ZWARCIOWEGO,
    ZDOLNOSCI_ZALEZNE_OD_WKLADU_ZWARCIOWEGO,
    ZdolnoscMiarodajna,
)


class _GrafZeZrodlami:
    """Minimalny nośnik ``inverter_sources`` — tyle, ile czyta proweniencja."""

    def __init__(self, *zrodla: InverterSource) -> None:
        self.inverter_sources = {z.id: z for z in zrodla}


def _zrodlo(
    ident: str, *, k_sc: Any = None, i_n: float = 1000.0, czynne: bool = True
) -> InverterSource:
    return InverterSource(id=ident, node_id="n1", in_rated_a=i_n, k_sc=k_sc, in_service=czynne)


# ---------------------------------------------------------------------------
# Oś 1: droga, którą wynik wszedł do systemu
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("zdolnosc", sorted(ZDOLNOSCI_ZALEZNE_OD_WKLADU_ZWARCIOWEGO))
def test_M1_wynik_historyczny_bez_sladu_nie_jest_miarodajny(
    zdolnosc: ZdolnoscMiarodajna,
) -> None:
    """M1: wynik odczytany z magazynu/odtworzony z payloadu nie niesie śladu.

    FAIL-CLOSED JEST SEDNEM: „nie wiem, skąd to jest" MUSI dawać blokadę, nie
    przepustkę. Gdyby brak śladu znaczył „brak przeszkód", cała granica dałaby
    się obejść jednym zapisem i odczytem wyniku.
    """
    blokady = blokady_autorytetu(zdolnosc, ProweniencjaWynikuZwarciowego.bez_sladu())
    assert [b.kod for b in blokady] == [KOD_BLOKADY_WYNIK_BEZ_SLADU]


@pytest.mark.parametrize("zdolnosc", sorted(ZDOLNOSCI_ZALEZNE_OD_WKLADU_ZWARCIOWEGO))
def test_M2_brak_proweniencji_jest_traktowany_jak_brak_sladu(
    zdolnosc: ZdolnoscMiarodajna,
) -> None:
    """M2: wynik zbudowany ręcznie w kodzie wywołującego — proweniencja ``None``.

    To jest przypadek, w którym konsument po prostu NIE POMYŚLAŁ o proweniencji.
    Musi zachowywać się identycznie jak jawny brak śladu, inaczej pominięcie
    argumentu byłoby cichą przepustką — czyli najłatwiejszym obejściem ze wszystkich.
    """
    blokady = blokady_autorytetu(zdolnosc, None)
    assert [b.kod for b in blokady] == [KOD_BLOKADY_WYNIK_BEZ_SLADU]


@pytest.mark.parametrize("zdolnosc", sorted(ZDOLNOSCI_ZALEZNE_OD_WKLADU_ZWARCIOWEGO))
def test_M3_liczby_wprost_z_zadania_nie_sa_miarodajne(
    zdolnosc: ZdolnoscMiarodajna,
) -> None:
    """M3: evidence/wielkości podane w żądaniu, bez modelu, z którego wynikają."""
    blokady = blokady_autorytetu(zdolnosc, ProweniencjaWynikuZwarciowego.payload_klienta())
    assert [b.kod for b in blokady] == [KOD_BLOKADY_WYNIK_Z_PAYLOADU]


# ---------------------------------------------------------------------------
# Oś 2: stan danych w modelu, z którego wynik faktycznie powstał
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("zdolnosc", sorted(ZDOLNOSCI_ZALEZNE_OD_WKLADU_ZWARCIOWEGO))
@pytest.mark.parametrize(
    ("k_sc", "i_n", "oczekiwany_kod"),
    [
        (None, 1000.0, KOD_BLOKADY_K_SC_DOMYSLNY),
        (float("nan"), 1000.0, KOD_BLOKADY_K_SC_NIEPOPRAWNY),
        (float("inf"), 1000.0, KOD_BLOKADY_K_SC_NIEPOPRAWNY),
        (0.0, 1000.0, KOD_BLOKADY_K_SC_NIEPOPRAWNY),
        (-1.5, 1000.0, KOD_BLOKADY_K_SC_NIEPOPRAWNY),
        (True, 1000.0, KOD_BLOKADY_K_SC_NIEPOPRAWNY),
        ("1.4", 1000.0, KOD_BLOKADY_K_SC_NIEPOPRAWNY),
        # P1-DELTA-07: OBIE liczby skonczone i dodatnie, iloczyn juz nie.
        (1e308, 1000.0, KOD_BLOKADY_K_SC_POZA_DZIEDZINA),
        (1e200, 1e200, KOD_BLOKADY_K_SC_POZA_DZIEDZINA),
    ],
)
def test_swiezy_bieg_z_niemiarodajnym_wkladem_jest_zablokowany(
    zdolnosc: ZdolnoscMiarodajna,
    k_sc: Any,
    i_n: float,
    oczekiwany_kod: str,
) -> None:
    """Świeży bieg: proweniencja wyprowadzona z grafu, nie zadeklarowana.

    Dwa ostatnie wiersze to P1-DELTA-07 wykonany przez recenzenta niezależnie:
    ``k_sc=1e308`` przy ``I_n=1000 A`` przechodziło jako DEKLARACJA i dawało
    ``I_k=inf``. Kod blokady jest OSOBNY, bo osobna jest naprawa — projektant ma
    poprawić parę danych znamionowych, nie sam współczynnik.
    """
    prow = ProweniencjaWynikuZwarciowego.z_grafu(_GrafZeZrodlami(_zrodlo("i1", k_sc=k_sc, i_n=i_n)))
    blokady = blokady_autorytetu(zdolnosc, prow)
    assert [b.kod for b in blokady] == [oczekiwany_kod]


@pytest.mark.parametrize("zdolnosc", sorted(ZDOLNOSCI_ZALEZNE_OD_WKLADU_ZWARCIOWEGO))
def test_deklaracja_producenta_odblokowuje_kazda_zdolnosc(
    zdolnosc: ZdolnoscMiarodajna,
) -> None:
    """DRUGA STRONA PREDYKATU: bramka, która nigdy nie przepuszcza, jest bezużyteczna."""
    prow = ProweniencjaWynikuZwarciowego.z_grafu(_GrafZeZrodlami(_zrodlo("i1", k_sc=1.35)))
    assert wynik_jest_miarodajny(zdolnosc, prow)


@pytest.mark.parametrize("zdolnosc", sorted(ZDOLNOSCI_ZALEZNE_OD_WKLADU_ZWARCIOWEGO))
def test_model_bez_falownikow_jest_miarodajny(zdolnosc: ZdolnoscMiarodajna) -> None:
    """Brak źródeł falownikowych ≠ brak danych.

    Gdy w modelu nie ma falowników, wkład falownikowy NIE WCHODZI do równań —
    blokowanie takiej sieci byłoby karą bez przyczyny i wywróciłoby zwarcia w
    każdej sieci klasycznej.
    """
    prow = ProweniencjaWynikuZwarciowego.z_grafu(_GrafZeZrodlami())
    assert wynik_jest_miarodajny(zdolnosc, prow)


@pytest.mark.parametrize("zdolnosc", sorted(ZDOLNOSCI_ZALEZNE_OD_WKLADU_ZWARCIOWEGO))
def test_zrodlo_wylaczone_z_ruchu_nie_blokuje(zdolnosc: ZdolnoscMiarodajna) -> None:
    """Falownik ``in_service=False`` nie dokłada prądu, więc nie może blokować."""
    prow = ProweniencjaWynikuZwarciowego.z_grafu(
        _GrafZeZrodlami(_zrodlo("i1", k_sc=None, czynne=False))
    )
    assert wynik_jest_miarodajny(zdolnosc, prow)


def test_jedno_zrodlo_bez_deklaracji_psuje_caly_wynik() -> None:
    """Wystarczy JEDNO czynne źródło bez deklaracji — wynik jest wspólny.

    Prąd zwarciowy w punkcie jest sumą wkładów. Gdyby bramka wymagała, żeby
    WSZYSTKIE źródła były niemiarodajne, sieć z dziesięcioma poprawnymi i jednym
    brakującym przechodziłaby jako miarodajna.
    """
    prow = ProweniencjaWynikuZwarciowego.z_grafu(
        _GrafZeZrodlami(
            _zrodlo("i1", k_sc=1.35),
            _zrodlo("i2", k_sc=1.20),
            _zrodlo("i3", k_sc=None),
        )
    )
    assert not wynik_jest_miarodajny(ZdolnoscMiarodajna.BREAKING_CAPACITY_SELECTION, prow)


# ---------------------------------------------------------------------------
# Granica jest WĄSKA — zdolności niezależne pozostają dostępne
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("zdolnosc", sorted(ZDOLNOSCI_NIEZALEZNE_OD_WKLADU_ZWARCIOWEGO))
@pytest.mark.parametrize(
    "prow",
    [
        None,
        ProweniencjaWynikuZwarciowego.bez_sladu(),
        ProweniencjaWynikuZwarciowego.payload_klienta(),
    ],
    ids=["brak", "bez_sladu", "payload"],
)
def test_zdolnosci_niezalezne_nigdy_nie_sa_blokowane(
    zdolnosc: ZdolnoscMiarodajna,
    prow: ProweniencjaWynikuZwarciowego | None,
) -> None:
    """Recenzja ZAKAZUJE blokowania zdolności niezwiązanych.

    Rozpływ mocy, topologia, schemat i edycja nie mają wkładu zwarciowego w
    równaniach. Ich blokada byłaby karą bez przyczyny — i zamieniłaby naprawę
    granicy w globalny wyłącznik produktu.
    """
    assert blokady_autorytetu(zdolnosc, prow) == ()


def test_kazda_zdolnosc_ma_jawna_klasyfikacje() -> None:
    """Zbiory ROZŁĄCZNE, których suma pokrywa komplet — pin na samej wyroczni.

    Bez tego przypadku nowa zdolność dopisana do wyliczenia wypadałaby po cichu
    poza obie strony granicy i nie byłaby chroniona przez nikogo.
    """
    komplet = set(ZdolnoscMiarodajna)
    assert (
        ZDOLNOSCI_ZALEZNE_OD_WKLADU_ZWARCIOWEGO & ZDOLNOSCI_NIEZALEZNE_OD_WKLADU_ZWARCIOWEGO
        == set()
    )
    assert (
        ZDOLNOSCI_ZALEZNE_OD_WKLADU_ZWARCIOWEGO | ZDOLNOSCI_NIEZALEZNE_OD_WKLADU_ZWARCIOWEGO
        == komplet
    )


# ---------------------------------------------------------------------------
# Proweniencji NIE DA SIĘ ZADEKLAROWAĆ — tylko wyprowadzić
# ---------------------------------------------------------------------------


def test_konstruktory_niemiarodajne_nie_daja_sie_podrobic() -> None:
    """Klient nie ma konstruktora „zaufaj mi".

    DEKLARACJA BEZ TESTU = FAŁSZYWA PEWNOŚĆ. Nagłówek modułu obiecuje, że
    proweniencja powstaje wyłącznie z danych. Ta obietnica musi mieć przypięty
    test, inaczej pierwszy konstruktor przyjmujący gotową flagę wyłączy granicę
    i nikt tego nie zauważy.
    """
    publiczne = {
        n
        for n in dir(ProweniencjaWynikuZwarciowego)
        if not n.startswith("_") and callable(getattr(ProweniencjaWynikuZwarciowego, n))
    }
    assert publiczne == {"z_grafu", "ze_znacznikow", "payload_klienta", "bez_sladu"}

    # Oba stany jawnie niemiarodajne nie przyjmują żadnego argumentu, więc nie da
    # się nimi przemycić znaczników udających deklarację.
    assert ProweniencjaWynikuZwarciowego.payload_klienta().znaczniki_k_sc == ()
    assert ProweniencjaWynikuZwarciowego.bez_sladu().znaczniki_k_sc == ()


@pytest.mark.parametrize(
    "znacznik",
    [K_SC_ZRODLO_DOMYSLNE, K_SC_ZRODLO_NIEPOPRAWNE, K_SC_ZRODLO_POZA_DZIEDZINA],
)
def test_odtworzone_znaczniki_zachowuja_blokade(znacznik: str) -> None:
    """Wynik z zapisanym śladem blokuje tak samo jak świeży bieg.

    ``ze_znacznikow`` jest drogą dla wyniku, który ślad NIESIE. Gdyby samo
    odtworzenie czyściło blokadę, zapis i odczyt byłby praniem proweniencji.
    """
    prow = ProweniencjaWynikuZwarciowego.ze_znacznikow([znacznik])
    assert not wynik_jest_miarodajny(ZdolnoscMiarodajna.REGULATORY_EVIDENCE, prow)


def test_wymagaj_autorytetu_niesie_komplet_blokad() -> None:
    """Wyjątek musi nieść PEŁNĄ listę powodów, nie pierwszy napotkany."""
    prow = ProweniencjaWynikuZwarciowego.z_grafu(_GrafZeZrodlami(_zrodlo("i1", k_sc=None)))
    with pytest.raises(BrakAutorytetuWyniku) as zlapany:
        wymagaj_autorytetu(
            (
                ZdolnoscMiarodajna.BREAKING_CAPACITY_SELECTION,
                ZdolnoscMiarodajna.SC_WITHSTAND_EVIDENCE,
            ),
            prow,
        )
    zdolnosci = {b.zdolnosc for b in zlapany.value.blokady}
    assert zdolnosci == {
        ZdolnoscMiarodajna.BREAKING_CAPACITY_SELECTION,
        ZdolnoscMiarodajna.SC_WITHSTAND_EVIDENCE,
    }
