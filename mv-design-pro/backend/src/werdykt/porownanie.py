"""Wspólny budowniczy rekordu K dla porównania wielkości z limitem (karta WERDYKT-MIGRACJA-190).

PO CO. Każda domena produktu (aparatura, przekładniki, przewody, rozpływ, siła sieci, SWZ,
obwody nN, wzorce referencyjne …) oceniała dotąd wielkość wobec limitu WŁASNĄ kopią warunku
i zwracała samo słowo statusu (``PASS`` / ``FAIL`` / ``OK`` / ``ZGODNE``). Kontrakt werdyktu
wyjaśnialnego (``docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md``) wymaga przy każdym statusie
rekordu: co oceniono, kryterium, wynik z jednostką, limit z podstawą i stanem źródła, margines,
przyczyna, dowód i zakres ważności. Ten moduł składa taki rekord z pól, które producent oceny
już ma — JEDNYM ciałem dla wszystkich domen, żeby żadna nie pisała własnego tekstu werdyktu.

Moduł jest cienką nakładką na ``werdykt.decyzja.ocen_kryterium`` / ``zagreguj_wymaganie``:
nie ma własnej reguły decyzji, etykiety ani tekstu — status, margines, kompletność, etykietę
i zdanie wyprowadza reguła pakietu. Importuje wyłącznie pakiet ``werdykt`` (liść), więc
korzystają z niego solvery, warstwa analizy i aplikacji.

PROJEKCJA STATUSU. Kontrakty HTTP zastane niosą kody ``PASS``/``FAIL``/``OK`` (zmiany
wyłącznie addytywne). Kod jest wtedy POCHODNĄ rekordu — ``projekcja_statusu`` czyta statusy
maszynowe ocen składowych (jedno źródło prawdy: rekord), nigdy własny warunek liczbowy.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from typing import Final, Protocol

from werdykt.decyzja import jednostka_marginesu, ocen_kryterium, zagreguj_wymaganie
from werdykt.kontrakt import (
    JEDNOSTKA_LOGICZNA,
    DanaPrzyjeta,
    Kryterium,
    LimitKryterium,
    MetodaDowodu,
    Niepewnosc,
    OcenaKryterium,
    OdnosnikSladu,
    PodstawaWymagania,
    Przedmiot,
    Relacja,
    StatusDanych,
    StatusDowodu,
    StatusModelu,
    StatusWerdyktu,
    Stosowalnosc,
    Wielkosc,
    WynikKryterium,
    WynikWymagania,
    ZakresWaznosci,
)
from werdykt.proweniencja import ClaimKind, EvidenceTier


class ZdolnoscDowodowa(Protocol):
    """Klasyfikacja dowodowa zdolności obliczeniowej (``solver_input.provenance.
    CapabilityEvidence``): poziom zdolności narzędzia i rodzaj twierdzenia."""

    @property
    def tier(self) -> EvidenceTier: ...

    @property
    def claim_kind(self) -> ClaimKind: ...


#: Niepewność porównania wielkości wyznaczonej wzorem zamkniętym (bez dyskretyzacji czasu).
NIEPEWNOSC_ANALITYCZNA: Final = Niepewnosc(
    nie_dotyczy=True,
    powod_pl=(
        "wielkość wyznaczona wzorem zamkniętym z danych modelu — niepewność numeryczna nie "
        "dotyczy, niepewność danych wejściowych wyraża status danych rekordu"
    ),
)

#: Powód stosowalności oceny wyznaczonej dla konkretnego obiektu modelu.
DOTYCZY_OBIEKTU: Final = "wielkość wyznaczona w biegu dla tego obiektu modelu"


def podstawa_normy(
    dokument: str,
    wydanie: str,
    jednostka_redakcyjna: str,
    *,
    uwagi_pl: str | None = None,
) -> PodstawaWymagania:
    """Podstawa z normy wskazanej z wydaniem i jednostką redakcyjną (stan ``WSKAZANE`` —
    treść normy nie jest dołączona do repozytorium)."""
    return PodstawaWymagania(
        rodzaj="NORMA",
        dokument=dokument,
        wydanie=wydanie,
        jednostka_redakcyjna=jednostka_redakcyjna,
        status="WSKAZANE",
        uwagi_pl=uwagi_pl,
    )


def podstawa_katalogu(pozycja_pl: str, parametr_pl: str) -> PodstawaWymagania:
    """Podstawa limitu z karty katalogowej pozycji (wartość znamionowa urządzenia)."""
    return PodstawaWymagania(
        rodzaj="KATALOG_PRODUCENTA",
        dokument=f"karta katalogowa pozycji „{pozycja_pl}”",
        wydanie="pozycja katalogu typów programu",
        jednostka_redakcyjna=parametr_pl,
        status="WSKAZANE",
    )


def podstawa_zalozenia(
    dokument: str,
    jednostka_redakcyjna: str,
    *,
    wydanie: str = "bieżący stan programu",
    uwagi_pl: str | None = None,
) -> PodstawaWymagania:
    """Podstawa z jawnego założenia projektowego programu (nie wartość normowa)."""
    return PodstawaWymagania(
        rodzaj="ZALOZENIE_PROJEKTOWE",
        dokument=dokument,
        wydanie=wydanie,
        jednostka_redakcyjna=jednostka_redakcyjna,
        status="WSKAZANE",
        uwagi_pl=uwagi_pl,
    )


def podstawa_nieustalona(dokument: str, *, uwagi_pl: str | None = None) -> PodstawaWymagania:
    """Podstawa bez ustalonego pochodzenia (stan ``NIEUSTALONE`` — reguła daje
    ``BRAK_PODSTAWY`` z wynikiem informacyjnym)."""
    return PodstawaWymagania(
        rodzaj="NIEUSTALONA", dokument=dokument, status="NIEUSTALONE", uwagi_pl=uwagi_pl
    )


def dowod_obliczenia(
    zdolnosc: ZdolnoscDowodowa,
    dane_przyjete: Iterable[DanaPrzyjeta] = (),
    *,
    odniesienie: str | None = None,
    metoda: MetodaDowodu = "OBLICZENIE",
    status_modelu: StatusModelu = "NIE_DOTYCZY",
) -> StatusDowodu:
    """Dowód oceny: metoda, poziom zdolności, rodzaj twierdzenia i status danych (dane przyjęte
    bez powtórzeń — każda wartość robocza ``ESTIMATED`` daje ``UNVALIDATED_INPUT``)."""
    unikalne = tuple(dict.fromkeys(dane_przyjete))
    return StatusDowodu(
        metoda=metoda,
        poziom=zdolnosc.tier,
        rodzaj_twierdzenia=zdolnosc.claim_kind,
        status_modelu=status_modelu,
        status_danych=(
            StatusDanych(stan="UNVALIDATED_INPUT", dane_przyjete=unikalne)
            if unikalne
            else StatusDanych(stan="ZWALIDOWANE")
        ),
        odniesienie=odniesienie,
    )


@dataclass(frozen=True)
class Porownanie:
    """Jedno kryterium: wielkość wyniku wobec limitu (wartość albo pasmo) albo kryterium
    logiczne (``relacja == "LOGICZNE"``, ``spelniony`` zamiast liczby).

    ``wynik is None`` (relacja liczbowa) albo ``spelniony is None`` (logiczne) = wielkości nie
    wyznaczono — reguła daje ``NIE_OCENIONO``, a ``braki`` nazywają, czego brakuje (brak danych
    ≠ spełnia). ``limit``/``pasmo`` ``None`` przy wyniku — brak limitu, reguła daje
    ``BRAK_PODSTAWY``.
    """

    kryterium_id: str
    opis_pl: str
    relacja: Relacja
    wielkosc_pl: str
    warunek_latex: str = ""
    symbol_latex: str = ""
    jednostka: str = JEDNOSTKA_LOGICZNA
    wynik: float | None = None
    limit: float | None = None
    pasmo: tuple[float, float] | None = None
    limit_pl: str | None = None
    tolerancja: float | None = None
    #: Kryterium logiczne: ``True`` — stan wymagany, ``False`` — stan przeciwny.
    spelniony: bool | None = None
    #: Opis stanu kryterium logicznego (punkt krytyczny wyniku).
    stan_pl: str | None = None
    punkt_krytyczny_pl: str | None = None
    braki: tuple[str, ...] = ()
    dotyczy: bool = True
    powod_stosowalnosci_pl: str = DOTYCZY_OBIEKTU
    metoda_wyniku: MetodaDowodu = "OBLICZENIE"
    dane_przyjete: tuple[DanaPrzyjeta, ...] = field(default=())


def _wynik(p: Porownanie, przedmiot: Przedmiot) -> WynikKryterium | None:
    if p.relacja == "LOGICZNE":
        if p.spelniony is None:
            return None
        return WynikKryterium(
            wielkosc_pl=p.wielkosc_pl,
            symbol_latex=p.symbol_latex,
            wartosc=Wielkosc(wartosc=1.0 if p.spelniony else 0.0, jednostka=JEDNOSTKA_LOGICZNA),
            punkt_krytyczny_pl=p.stan_pl or p.punkt_krytyczny_pl or przedmiot.nazwa_pl,
            metoda=p.metoda_wyniku,
        )
    if p.wynik is None:
        return None
    return WynikKryterium(
        wielkosc_pl=p.wielkosc_pl,
        symbol_latex=p.symbol_latex,
        wartosc=Wielkosc(wartosc=p.wynik, jednostka=p.jednostka),
        punkt_krytyczny_pl=p.punkt_krytyczny_pl or przedmiot.nazwa_pl,
        metoda=p.metoda_wyniku,
    )


def _limit(p: Porownanie, podstawa_limitu: PodstawaWymagania) -> LimitKryterium | None:
    if p.relacja == "LOGICZNE":
        return None
    if p.pasmo is not None:
        dolna, gorna = p.pasmo
        return LimitKryterium(
            pasmo=(
                Wielkosc(wartosc=dolna, jednostka=p.jednostka),
                Wielkosc(wartosc=gorna, jednostka=p.jednostka),
            ),
            podstawa=podstawa_limitu,
            zakres_stosowalnosci_pl=p.limit_pl,
        )
    if p.limit is None:
        return None
    return LimitKryterium(
        wartosc=Wielkosc(wartosc=p.limit, jednostka=p.jednostka),
        podstawa=podstawa_limitu,
        zakres_stosowalnosci_pl=p.limit_pl,
    )


def ocena_porownania(
    p: Porownanie,
    *,
    przedmiot: Przedmiot,
    podstawa: PodstawaWymagania,
    zdolnosc: ZdolnoscDowodowa,
    zakres: ZakresWaznosci,
    podstawa_limitu: PodstawaWymagania | None = None,
    dane_przyjete: Sequence[DanaPrzyjeta] = (),
    slad: Sequence[OdnosnikSladu] = (),
    odniesienie: str | None = None,
    niepewnosc: Niepewnosc = NIEPEWNOSC_ANALITYCZNA,
    status_modelu: StatusModelu = "NIE_DOTYCZY",
) -> OcenaKryterium:
    """Rekord K porównania (status, margines, kompletność, etykieta i zdanie z reguły pakietu).

    ``podstawa`` — podstawa KRYTERIUM (np. norma); ``podstawa_limitu`` — podstawa wartości
    granicznej, gdy inna niż kryterium (np. karta katalogowa urządzenia). ``dane_przyjete``
    wspólne dla wszystkich kryteriów obiektu (np. wartość robocza prądu zwarciowego) łączą się
    z danymi przyjętymi samego porównania. Kryterium nie stosujące się (``dotyczy=False``) nie
    stoi na żadnej danej przyjętej.
    """
    wynik = _wynik(p, przedmiot)
    limit = _limit(p, podstawa_limitu or podstawa)
    braki = list(p.braki)
    if wynik is None and not braki and p.dotyczy:
        braki.append(f"{p.wielkosc_pl} — wielkość nie została wyznaczona w biegu")
    dane = () if not p.dotyczy else (*dane_przyjete, *p.dane_przyjete)
    return ocen_kryterium(
        kryterium_id=p.kryterium_id,
        przedmiot=przedmiot,
        kryterium=Kryterium(opis_pl=p.opis_pl, warunek_latex=p.warunek_latex, relacja=p.relacja),
        podstawa=podstawa,
        stosowalnosc=Stosowalnosc(dotyczy=p.dotyczy, powod_pl=p.powod_stosowalnosci_pl),
        wynik=wynik,
        limit=limit,
        niepewnosc=niepewnosc,
        dowod=dowod_obliczenia(
            zdolnosc,
            dane,
            odniesienie=odniesienie,
            metoda=p.metoda_wyniku,
            status_modelu=status_modelu,
        ),
        zakres_waznosci=zakres,
        slad=slad,
        tolerancja=(
            None
            if p.tolerancja is None or p.relacja == "LOGICZNE"
            else Wielkosc(wartosc=p.tolerancja, jednostka=jednostka_marginesu(p.jednostka))
        ),
        braki_dodatkowe=braki,
    )


def wymaganie_z_ocen(
    *,
    wymaganie_id: str,
    nazwa_pl: str,
    podstawa: PodstawaWymagania,
    oceny: Sequence[OcenaKryterium],
    zdolnosc: ZdolnoscDowodowa,
    zakres: ZakresWaznosci,
    odniesienie: str | None = None,
    powod_stosowalnosci_pl: str = DOTYCZY_OBIEKTU,
    braki: Sequence[str] = (),
) -> WynikWymagania:
    """Rekord W wykazywany obliczeniem jednego biegu: agregacja §2.3 nad ocenami składowymi,
    dowód z danymi przyjętymi wszystkich STOSOWALNYCH składowych."""
    dane = [
        dana
        for ocena in oceny
        if ocena.status_maszynowy != "NIE_DOTYCZY"
        for dana in ocena.dowod.status_danych.dane_przyjete
    ]
    return zagreguj_wymaganie(
        wymaganie_id=wymaganie_id,
        nazwa_pl=nazwa_pl,
        podstawa=podstawa,
        stosowalnosc=Stosowalnosc(dotyczy=True, powod_pl=powod_stosowalnosci_pl),
        sposob_wykazania="OBLICZENIE",
        oceny_skladowe=oceny,
        pokrycie_programu="NIE_DOTYCZY",
        pokrycie_programu_pl=(
            "wymaganie wykazywane obliczeniem jednego biegu — program badań nie dotyczy"
        ),
        dowod=dowod_obliczenia(zdolnosc, dane, odniesienie=odniesienie),
        zakres_waznosci=zakres,
        slad=[odnosnik for ocena in oceny for odnosnik in ocena.slad],
        braki_dodatkowe=braki,
    )


#: Statusy rozstrzygające kryterium na liczbach (bez nich wynik jest nierozstrzygnięty).
_ROZSTRZYGAJACE: Final[frozenset[StatusWerdyktu]] = frozenset(("SPELNIA", "NIE_SPELNIA"))


def rozstrzygniecie(oceny: Iterable[OcenaKryterium]) -> StatusWerdyktu | None:
    """Rozstrzygnięcie liczbowe zbioru ocen składowych — JEDNO źródło kodów zastanych.

    ``NIE_SPELNIA`` — którakolwiek stosowalna ocena naruszona (udowodnione naruszenie nie staje
    się nierozstrzygnięte przez brak innej wielkości); ``SPELNIA`` — każda stosowalna ocena
    spełniona na liczbach (kompletność dowodu nie zmienia rozstrzygnięcia liczbowego — niesie
    ją rekord); ``None`` — choć jedna stosowalna ocena nierozstrzygnięta (brak wyniku, brak
    podstawy, niejednoznaczna) albo żadna nie stosuje się (brak danych ≠ spełnia).
    """
    statusy = [o.status_maszynowy for o in oceny if o.status_maszynowy != "NIE_DOTYCZY"]
    if "NIE_SPELNIA" in statusy:
        return "NIE_SPELNIA"
    if statusy and all(s in _ROZSTRZYGAJACE for s in statusy):
        return "SPELNIA"
    return None


def projekcja_statusu(
    oceny: Iterable[OcenaKryterium],
    *,
    spelnia: str,
    nie_spelnia: str,
    nierozstrzygniete: str,
) -> str:
    """Kod statusu kontraktu zastanego wyprowadzony z rekordów (``rozstrzygniecie``)."""
    wynik = rozstrzygniecie(oceny)
    if wynik is None:
        return nierozstrzygniete
    return spelnia if wynik == "SPELNIA" else nie_spelnia
