"""§11.3/14 — MACIERZ POKRYCIA WALIDACYJNEGO, czytelna maszynowo.

KOD BADAWCZY — patrz `backend/research/README.md`.

PO CO. `drabina.py` mówi, JAKIE dowody istnieją. Nie mówi, CZEGO NIE MA — a to
jest pytanie, na które musi odpowiadać każdy raport o gotowości. Rejestr dowodów
czytany bez mapy zdolności zawsze wygląda dobrze: im mniej się zbadało, tym
krótsza lista braków, bo braki w nim nie występują.

Macierz odwraca kierunek: wychodzi od ZDOLNOŚCI (co laboratorium twierdzi, że
modeluje) i dla każdej pyta, jaki najmocniejszy dowód ją pokrywa. Zdolność bez
dowodu jest POZYCJĄ MACIERZY, nie pustym miejscem.

ZASADA, KTÓRA JEST TU CAŁĄ TREŚCIĄ: **BRAK DANYCH NIGDY NIE JEST ZALICZENIEM.**
``StatusPokrycia.BRAK_DOWODU`` i ``TYLKO_KSZTALT`` nie dają
``potwierdzona = True`` w żadnej kombinacji — i jest to sprawdzane iloczynem
wszystkich stanów, a nie przykładem.

SKĄD BIERZE SIĘ LISTA ZDOLNOŚCI. Z DEKLARACJI w tym pliku, ale SPRAWDZANEJ
skanem źródeł: test wymaga, żeby każda klasa urządzenia obecna w
``urzadzenia*.py`` miała przypisaną zdolność. Nowy model dołożony do
laboratorium czerwieni macierz, dopóki nie zostanie w niej opisany — także (a
zwłaszcza) wtedy, gdy nikt nie napisał dla niego żadnego dowodu.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from dynamic_lab.drabina import (
    DRABINA,
    NiezaleznoscOdniesienia,
    PoziomWyroczni,
    PozycjaDrabiny,
)

__all__ = [
    "MACIERZ",
    "PokrycieZdolnosci",
    "StatusPokrycia",
    "Zdolnosc",
    "podsumowanie_macierzy",
    "pokrycie",
    "zdolnosci_bez_dowodu",
]


class StatusPokrycia(StrEnum):
    """Najmocniejszy dowód, jaki pokrywa zdolność. Kolejność = siła."""

    BRAK_DOWODU = "brak_dowodu"
    """Zdolność zadeklarowana, ZERO pozycji w rejestrze. To jest NOT_AVAILABLE —
    i nigdy nie znaczy „w porządku"."""

    TYLKO_KSZTALT = "tylko_ksztalt"
    """Wyłącznie dowody W0: kod się wykonuje, pola są. NIE dowodzi fizyki."""

    WLASNOSC = "wlasnosc"
    """Najmocniejszy dowód to własność metamorficzna (W1): kierunek bez wartości."""

    WYROCZNIA_ANALITYCZNA = "wyrocznia_analityczna"
    """Najmocniejszy dowód to wzór zamknięty (W2) — orzeka o WARTOŚCI."""

    WYROCZNIA_ZEWNETRZNA = "wyrocznia_zewnetrzna"
    """Najmocniejszy dowód to narzędzie zewnętrzne (W3)."""


#: Porządek siły — jedno źródło prawdy dla porównań i dla progu potwierdzenia.
SILA_STATUSU: dict[StatusPokrycia, int] = {
    StatusPokrycia.BRAK_DOWODU: 0,
    StatusPokrycia.TYLKO_KSZTALT: 1,
    StatusPokrycia.WLASNOSC: 2,
    StatusPokrycia.WYROCZNIA_ANALITYCZNA: 3,
    StatusPokrycia.WYROCZNIA_ZEWNETRZNA: 4,
}

_STATUS_Z_WYROCZNI: dict[PoziomWyroczni, StatusPokrycia] = {
    PoziomWyroczni.W0_KSZTALT: StatusPokrycia.TYLKO_KSZTALT,
    PoziomWyroczni.W1_WLASNOSC: StatusPokrycia.WLASNOSC,
    PoziomWyroczni.W2_WYROCZNIA_ANALITYCZNA: StatusPokrycia.WYROCZNIA_ANALITYCZNA,
    PoziomWyroczni.W3_WYROCZNIA_ZEWNETRZNA: StatusPokrycia.WYROCZNIA_ZEWNETRZNA,
}


@dataclass(frozen=True)
class Zdolnosc:
    """Jedna rzecz, o której laboratorium twierdzi, że ją modeluje."""

    identyfikator: str
    opis_pl: str
    klasy_zrodlowe: tuple[str, ...]
    """Klasy w ``research/dynamic_lab/*.py`` realizujące tę zdolność. Pusta krotka
    znaczy „zdolność nie jest klasą" (np. algebra sieci, zdarzenia)."""
    dowody: tuple[str, ...]
    """Identyfikatory pozycji `drabina.DRABINA` pokrywające tę zdolność."""


#: Macierz. Lista zdolności jest ZAMKNIĘTA i pilnowana skanem klas urządzeń.
MACIERZ: tuple[Zdolnosc, ...] = (
    Zdolnosc(
        identyfikator="maszyna-synchroniczna",
        opis_pl="Maszyna synchroniczna 4. rzędu (dwuosiowa, z E' i E'')",
        klasy_zrodlowe=("MaszynaSynchroniczna4Rzedu", "ZespolSynchroniczny"),
        dowody=(
            "konwencje-dq",
            "wahania-malosygnalowe",
            "punkt-pracy-i-wahania-andes",
            "dynamika-4-rzedu-andes-genrou",
            "mapowanie-na-przypadku-natywnym",
        ),
    ),
    Zdolnosc(
        identyfikator="regulatory-avr-governor",
        opis_pl="AVR i governor pierwszego rzędu z ogranicznikami i anti-windup",
        klasy_zrodlowe=(),
        dowody=("regulatory-andes-sexs-tgov1",),
    ),
    Zdolnosc(
        identyfikator="stabilizator-pss",
        opis_pl="Stabilizator systemowy: washout + dwa człony lead-lag",
        klasy_zrodlowe=(),
        dowody=("pss-odpowiedz-czestotliwosciowa",),
    ),
    Zdolnosc(
        identyfikator="falownik-gfl",
        opis_pl="Falownik podążający za siecią, z trybem FRT",
        klasy_zrodlowe=("FalownikGFL",),
        dowody=("der-rozroznialne",),
    ),
    Zdolnosc(
        identyfikator="falownik-gfm",
        opis_pl="Falownik tworzący sieć, z dwiema kandydackimi strategiami ogranicznika",
        klasy_zrodlowe=(
            "FalownikGFM",
            "KandydatOgraniczeniaImpedancjaWirtualna",
            "KandydatOgraniczeniaNasycenieZadania",
        ),
        dowody=("der-rozroznialne", "ogranicznik-gfm-kres-analityczny", "ogranicznik-pradu-gfm"),
    ),
    Zdolnosc(
        identyfikator="jednostka-pq",
        opis_pl="Jednostka sterowana PQ (moduł elektrowni, bez pamięci energii)",
        klasy_zrodlowe=("JednostkaSterowanaPQ",),
        dowody=("jednostka-pq-niezmienniki",),
    ),
    Zdolnosc(
        identyfikator="magazyn-bess",
        opis_pl="Magazyn energii z SOC, statyzmem częstotliwościowym i PLL",
        klasy_zrodlowe=("MagazynEnergiiBESS", "PetlaSynchronizacjiPLL"),
        dowody=("magazyn-energia-ogranicza-wsparcie",),
    ),
    Zdolnosc(
        identyfikator="regulator-elektrowni",
        opis_pl="Regulator elektrowni (PPC) z limitem eksportu i alokacją na moduły",
        klasy_zrodlowe=("RegulatorElektrowniPPC",),
        dowody=("ppc-limit-eksportu",),
    ),
    Zdolnosc(
        identyfikator="maszyna-dwustronnie-zasilana",
        opis_pl="Maszyna dwustronnie zasilana 3. rzędu (DFIG)",
        klasy_zrodlowe=("MaszynaDwustronnieZasilana3Rzedu",),
        dowody=("dwustronnie-zasilana-vs-falownik",),
    ),
    Zdolnosc(
        identyfikator="odbior",
        opis_pl="Odbiór stałej mocy i skok obciążenia bocznikowego",
        klasy_zrodlowe=("OdbiorStalejMocy", "SkokObciazeniaBocznikowego"),
        dowody=("odbior-stalej-mocy-granica-waznosci",),
    ),
    Zdolnosc(
        identyfikator="algebra-sieci",
        opis_pl="Rozwiązanie algebry sieci (Ybus, Newton z globalizacją)",
        klasy_zrodlowe=(),
        dowody=("interakcja-dwoch-maszyn", "uklad-wielozrodlowy-interakcja"),
    ),
    Zdolnosc(
        identyfikator="zdarzenia-i-topologia",
        opis_pl="Zdarzenia zmieniające model: zwarcie, zdjęcie zwarcia, wyłączenie gałęzi",
        klasy_zrodlowe=(),
        dowody=(
            "zdarzenie-zmienia-siec",
            "cct-rowne-pola",
            "permutacja-harmonogramu-bez-wplywu",
        ),
    ),
    Zdolnosc(
        identyfikator="calkowanie-i-sztywnosc",
        opis_pl="Cztery integratory, niezmienniki dyskretne, sztywność zadania",
        klasy_zrodlowe=(),
        dowody=(
            "integratory-zbieznosc",
            "sztywnosc-widmo-i-krok-graniczny",
            "sztywnosc-a-stabilnosc",
        ),
    ),
    Zdolnosc(
        identyfikator="reinicjalizacja-po-zdarzeniu",
        opis_pl="Re-inicjalizacja algebry po zmianie topologii przy ciągłych stanach",
        klasy_zrodlowe=(),
        dowody=("reinicjalizacja-po-topologii",),
    ),
    Zdolnosc(
        identyfikator="ocena-frt",
        opis_pl="Ocena zdolności FRT wobec obwiedni i kryteriów profilu",
        klasy_zrodlowe=(),
        dowody=("frt-ocena-ze-sladu",),
    ),
)


@dataclass(frozen=True)
class PokrycieZdolnosci:
    """Odpowiedź macierzy dla jednej zdolności — ZAWSZE z uzasadnieniem."""

    zdolnosc: Zdolnosc
    status: StatusPokrycia
    najmocniejsza_niezaleznosc: NiezaleznoscOdniesienia | None
    pozycje: tuple[PozycjaDrabiny, ...]

    @property
    def potwierdzona(self) -> bool:
        """Czy zdolność ma dowód ORZEKAJĄCY O WARTOŚCI (W2 albo W3).

        Próg leży przy wyroczni analitycznej świadomie: własność metamorficzna
        mówi, że model reaguje we właściwą stronę, a nie że reaguje właściwie.
        ``BRAK_DOWODU`` i ``TYLKO_KSZTALT`` nie dają ``True`` w żadnej kombinacji —
        to jest reguła „brak danych nigdy nie jest zaliczeniem", zapisana kodem.
        """
        return SILA_STATUSU[self.status] >= SILA_STATUSU[StatusPokrycia.WYROCZNIA_ANALITYCZNA]

    @property
    def uzasadnienie_pl(self) -> str:
        if self.status is StatusPokrycia.BRAK_DOWODU:
            return (
                f'Zdolność „{self.zdolnosc.opis_pl}" NIE MA ani jednej pozycji w rejestrze '
                f"dowodów. To jest brak danych, a nie brak zastrzeżeń."
            )
        etykiety = ", ".join(f"{p.identyfikator} ({p.etykieta})" for p in self.pozycje)
        return (
            f"Najmocniejszy dowód: {self.status.value}"
            f"{'' if self.najmocniejsza_niezaleznosc is None else f', niezależność {self.najmocniejsza_niezaleznosc.value}'}"
            f". Pozycje: {etykiety}."
        )


def _pozycje_po_identyfikatorze() -> dict[str, PozycjaDrabiny]:
    return {p.identyfikator: p for p in DRABINA}


def pokrycie(identyfikator_zdolnosci: str) -> PokrycieZdolnosci:
    """Pokrycie JEDNEJ zdolności — wyliczone z rejestru, nie wpisane."""
    (zdolnosc,) = (z for z in MACIERZ if z.identyfikator == identyfikator_zdolnosci)
    wg_id = _pozycje_po_identyfikatorze()
    brakujace = [d for d in zdolnosc.dowody if d not in wg_id]
    if brakujace:
        raise KeyError(
            f"{zdolnosc.identyfikator}: macierz wskazuje pozycje spoza rejestru: {brakujace}"
        )
    pozycje = tuple(wg_id[d] for d in zdolnosc.dowody)
    if not pozycje:
        return PokrycieZdolnosci(
            zdolnosc=zdolnosc,
            status=StatusPokrycia.BRAK_DOWODU,
            najmocniejsza_niezaleznosc=None,
            pozycje=(),
        )
    status = max((_STATUS_Z_WYROCZNI[p.wyrocznia] for p in pozycje), key=lambda s: SILA_STATUSU[s])
    niezaleznosc = max((p.niezaleznosc for p in pozycje), key=lambda n: n.value)
    return PokrycieZdolnosci(
        zdolnosc=zdolnosc,
        status=status,
        najmocniejsza_niezaleznosc=niezaleznosc,
        pozycje=pozycje,
    )


def zdolnosci_bez_dowodu() -> tuple[PokrycieZdolnosci, ...]:
    """Dziury macierzy — to jest właściwy produkt tego modułu."""
    return tuple(
        p
        for p in (pokrycie(z.identyfikator) for z in MACIERZ)
        if p.status is StatusPokrycia.BRAK_DOWODU
    )


def podsumowanie_macierzy() -> str:
    """Tabela do meldunku — wyliczana, nie przepisywana."""
    wiersze = ["| Zdolność | Status | Niezależność | Potwierdzona |", "|---|---|---|---|"]
    for zdolnosc in MACIERZ:
        p = pokrycie(zdolnosc.identyfikator)
        niez = "—" if p.najmocniejsza_niezaleznosc is None else p.najmocniejsza_niezaleznosc.value
        wiersze.append(
            f"| `{zdolnosc.identyfikator}` | {p.status.value} | {niez} | "
            f"{'TAK' if p.potwierdzona else 'NIE'} |"
        )
    return "\n".join(wiersze)
