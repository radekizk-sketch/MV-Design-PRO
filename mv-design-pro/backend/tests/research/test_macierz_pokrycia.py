"""§11.3/14 — czy macierz pokrycia pokazuje DZIURY, a nie tylko dorobek.

KOD BADAWCZY — patrz `backend/research/README.md`.
"""

from __future__ import annotations

import ast
import pathlib

import pytest
from dynamic_lab.drabina import DRABINA, NiezaleznoscOdniesienia, PoziomWyroczni
from dynamic_lab.macierz_pokrycia import (
    MACIERZ,
    PokrycieZdolnosci,
    StatusPokrycia,
    Zdolnosc,
    podsumowanie_macierzy,
    pokrycie,
    zdolnosci_bez_dowodu,
)

KATALOG = pathlib.Path(__file__).resolve().parents[2] / "research" / "dynamic_lab"

#: Klasy z `urzadzenia*.py`, które NIE SĄ modelem urządzenia — z uzasadnieniem.
NIE_URZADZENIA: dict[str, str] = {
    "OgranicznikPraduGFM": "protokół strategii ogranicznika, nie model urządzenia",
    "UrzadzenieDynamiczne": "protokół urządzenia dynamicznego, nie model",
    "JednostkaSterowana": "protokół modułu przyjmującego zadanie z regulatora elektrowni",
    "PunktPracyPozaOgranicznikiemError": "wyjątek",
    "PozaZakresemWaznosciModeluError": "wyjątek",
}


def _klasy_urzadzen() -> set[str]:
    nazwy: set[str] = set()
    for plik in ("urzadzenia.py", "urzadzenia_oze.py"):
        drzewo = ast.parse((KATALOG / plik).read_text(encoding="utf-8"))
        for wezel in drzewo.body:
            if isinstance(wezel, ast.ClassDef) and wezel.name not in NIE_URZADZENIA:
                nazwy.add(wezel.name)
    return nazwy


def test_skan_klas_w_ogole_cos_znajduje() -> None:
    """Kontrola narzędzia — skan, który nic nie widzi, przechodzi zawsze."""
    assert len(_klasy_urzadzen()) >= 12


def test_KAZDA_klasa_urzadzenia_ma_przypisana_zdolnosc() -> None:
    """Nowy model dołożony do laboratorium ma czerwienić macierz.

    Zwłaszcza wtedy, gdy nikt nie napisał dla niego dowodu — bo właśnie wtedy
    milczenie macierzy byłoby najgroźniejsze.
    """
    opisane = {klasa for z in MACIERZ for klasa in z.klasy_zrodlowe}
    nieopisane = sorted(_klasy_urzadzen() - opisane)
    assert not nieopisane, f"Klasy urządzeń bez zdolności w macierzy: {nieopisane}"


def test_macierz_nie_opisuje_klas_KTORYCH_NIE_MA() -> None:
    widma = sorted({k for z in MACIERZ for k in z.klasy_zrodlowe} - _klasy_urzadzen())
    assert not widma, f"Zdolności wskazują nieistniejące klasy: {widma}"


def test_KAZDY_dowod_z_rejestru_jest_przypisany_do_zdolnosci() -> None:
    """Druga strona: dowód nieprzypisany do żadnej zdolności nie wchodzi do bilansu.

    Bez tego testu rejestr mógłby rosnąć, a macierz stać w miejscu — i obie
    wyglądałyby spójnie.
    """
    przypisane = {d for z in MACIERZ for d in z.dowody}
    osierocone = sorted({p.identyfikator for p in DRABINA} - przypisane)
    assert not osierocone, f"Pozycje rejestru poza macierzą: {osierocone}"


def test_macierz_nie_wskazuje_dowodow_spoza_rejestru() -> None:
    for zdolnosc in MACIERZ:
        pokrycie(zdolnosc.identyfikator)  # podnosi KeyError przy wskazaniu spoza rejestru


# ---------------------------------------------------------------------------
# BRAK DANYCH NIGDY NIE JEST ZALICZENIEM
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("status", list(StatusPokrycia))
def test_potwierdzenie_jest_funkcja_statusu_dla_KAZDEGO_statusu(status: StatusPokrycia) -> None:
    """Iloczyn WSZYSTKICH stanów, nie przykład.

    Sprawdzane na obiekcie `PokrycieZdolnosci`, a nie na powtórzeniu wzoru z
    modułu: test powtarzający implementację dowodzi wyłącznie tego, że dwie kopie
    tego samego wyrażenia się zgadzają.

    Próg leży przy wyroczni analitycznej — własność metamorficzna mówi, że model
    reaguje we WŁAŚCIWĄ STRONĘ, a nie że reaguje właściwie, więc też nie
    potwierdza.
    """
    sztuczne = PokrycieZdolnosci(
        zdolnosc=MACIERZ[0],
        status=status,
        najmocniejsza_niezaleznosc=None,
        pozycje=(),
    )
    niepotwierdzajace = {
        StatusPokrycia.BRAK_DOWODU,
        StatusPokrycia.TYLKO_KSZTALT,
        StatusPokrycia.WLASNOSC,
    }
    assert sztuczne.potwierdzona is (status not in niepotwierdzajace)


def test_zdolnosc_bez_dowodu_NIE_JEST_potwierdzona() -> None:
    for p in zdolnosci_bez_dowodu():
        assert p.potwierdzona is False
        assert p.status is StatusPokrycia.BRAK_DOWODU
        assert "brak danych" in p.uzasadnienie_pl.lower()


def test_KAZDA_zdolnosc_ma_juz_jakis_dowod_a_stan_jest_PRZYPIETY() -> None:
    """Zbiór dziur jest dziś PUSTY — i to jest stwierdzenie wymagające pilnowania.

    Test celowo przypina obie strony: gdy powstanie nowa zdolność bez dowodu,
    czerwieni się tutaj (a nie milczy), a gdy ktoś usunie dowód — tak samo.
    Pusty zbiór dziur NIE ZNACZY „pokryte": patrz test niżej, w którym większość
    zdolności ma wyłącznie własność metamorficzną.
    """
    bez_dowodu = {p.zdolnosc.identyfikator for p in zdolnosci_bez_dowodu()}
    assert bez_dowodu == set(), f"Zdolności bez ani jednego dowodu: {sorted(bez_dowodu)}"


def test_WIEKSZOSC_zdolnosci_NIE_JEST_potwierdzona_i_to_jest_wynik_pomiaru() -> None:
    """Właściwy produkt macierzy: ile zdolności ma dowód ORZEKAJĄCY O WARTOŚCI.

    Zbiór jest wypisany imiennie, bo „7 z 15" bez nazw nie pozwala niczego
    zaplanować, a przy zmianie rejestru cicho by się przesunęło.
    """
    niepotwierdzone = {
        z.identyfikator for z in MACIERZ if not pokrycie(z.identyfikator).potwierdzona
    }
    assert niepotwierdzone == {
        "falownik-gfl",
        "jednostka-pq",
        "magazyn-bess",
        "regulator-elektrowni",
        "maszyna-dwustronnie-zasilana",
        "algebra-sieci",
        "reinicjalizacja-po-zdarzeniu",
        "ocena-frt",
    }, f"Zmienił się zbiór zdolności bez dowodu o WARTOŚCI: {sorted(niepotwierdzone)}"


def test_tylko_DWIE_zdolnosci_maja_wyrocznie_ZEWNETRZNA() -> None:
    """Niezależność N1 osiągają wyłącznie maszyna synchroniczna i jej regulatory.

    Reszta laboratorium — czyli CAŁY tor przekształtnikowy, który jest sednem
    produktu — opiera się wyłącznie na odniesieniach poziomu N0 (ten sam autor,
    te same równania). To jest najważniejsza liczba w tym pliku.
    """
    zewnetrzne = {
        z.identyfikator
        for z in MACIERZ
        if pokrycie(z.identyfikator).status is StatusPokrycia.WYROCZNIA_ZEWNETRZNA
    }
    assert zewnetrzne == {"maszyna-synchroniczna", "regulatory-avr-governor"}
    for identyfikator in zewnetrzne:
        assert (
            pokrycie(identyfikator).najmocniejsza_niezaleznosc
            is NiezaleznoscOdniesienia.TE_SAME_ROWNANIA_INNY_KOD
        )


def test_zadna_zdolnosc_nie_jest_potwierdzona_pomiarem_na_obiekcie() -> None:
    """Macierz nie może być mocniejsza niż rejestr, z którego liczy."""
    for zdolnosc in MACIERZ:
        p = pokrycie(zdolnosc.identyfikator)
        assert p.najmocniejsza_niezaleznosc is not NiezaleznoscOdniesienia.POMIAR_NA_OBIEKCIE


def test_status_wynika_z_NAJMOCNIEJSZEGO_dowodu_a_nie_z_pierwszego() -> None:
    """Zdolność pokryta i własnością, i wyrocznią ma mieć status wyroczni."""
    p = pokrycie("maszyna-synchroniczna")
    assert p.status is StatusPokrycia.WYROCZNIA_ZEWNETRZNA
    assert any(q.wyrocznia is PoziomWyroczni.W2_WYROCZNIA_ANALITYCZNA for q in p.pozycje)
    assert p.potwierdzona is True


def test_podsumowanie_wymienia_KAZDA_zdolnosc_i_jej_werdykt() -> None:
    tabela = podsumowanie_macierzy()
    for zdolnosc in MACIERZ:
        assert f"`{zdolnosc.identyfikator}`" in tabela
    assert "NIE" in tabela, 'macierz bez ani jednego „NIE" nie mierzy pokrycia, tylko je chwali'


def test_zdolnosc_bez_opisu_nie_ma_sensu() -> None:
    for zdolnosc in MACIERZ:
        assert zdolnosc.opis_pl.strip()
        assert zdolnosc.identyfikator.strip()


def test_identyfikatory_zdolnosci_sa_unikalne() -> None:
    identyfikatory = [z.identyfikator for z in MACIERZ]
    assert len(set(identyfikatory)) == len(identyfikatory)


def test_pokrycie_nieznanej_zdolnosci_jest_bledem_a_nie_pustka() -> None:
    with pytest.raises(ValueError):
        pokrycie("zdolnosc-ktorej-nie-ma")


def test_zdolnosc_moze_nie_byc_klasa() -> None:
    """Algebra sieci i zdarzenia nie są urządzeniami — i to jest poprawne."""
    bezklasowe = [z for z in MACIERZ if not z.klasy_zrodlowe]
    assert bezklasowe
    assert all(isinstance(z, Zdolnosc) for z in bezklasowe)
