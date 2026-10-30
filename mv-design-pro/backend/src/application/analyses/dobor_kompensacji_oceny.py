"""Rekordy werdyktu wyjaśnialnego doboru kompensacji (karta WERDYKT-MIGRACJA-190, D18).

Każdy kandydat z katalogu baterii niesie rekord W ``kompensacja.cosfi_punktu`` nad rekordami
K cosφ punktu kompensowanego w scenariuszu dziennym i (gdy uwzględniony) nocnym. Dawniej
kandydat niósł gołe flagi ``spelnia_dzien`` / ``spelnia_noc`` / ``spelnia``, a ekran tłumaczył
je na „spełnia / nie spełnia” bez kryterium, limitu, marginesu i powodu braku wyniku.

Jedno źródło rozstrzygnięcia: dobór (pierwszy kandydat spełniający) czyta rozstrzygnięcie
liczbowe TEGO SAMEGO rekordu, który widzi projektant (``werdykt.porownanie.rozstrzygniecie``),
więc pole doboru i tabela kandydatów nie mogą się rozjechać. Wielkość niewyznaczona (bieg
wariantu bez rozwiązania, punkt bez gałęzi zasilających) daje ``NIE_OCENIONO`` z powodem —
brak wyniku ≠ spełnia.

Warstwa APLIKACJI — zero fizyki: cosφ punktu przychodzi z pomiaru wariantu
(``dobor_kompensacji._point_cos_phi``), tu wyłącznie porównanie przez pakiet ``werdykt``.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Final, Literal

from solver_input.provenance import classify_dynamic_capability
from werdykt import OcenaKryterium, OdnosnikSladu, Przedmiot, WynikWymagania, ZakresWaznosci
from werdykt.porownanie import (
    Porownanie,
    ocena_porownania,
    podstawa_zalozenia,
    rozstrzygniecie,
    wymaganie_z_ocen,
)

#: Zdolność dowodowa doboru kompensacji (rejestr ``solver_input.provenance``).
ZDOLNOSC_KOMPENSACJI: Final = "kompensacja.dobor_baterii"

_ODNIESIENIE: Final = "application/analyses/dobor_kompensacji.py"

Scenariusz = Literal["dzien", "noc"]

_ZAKRES: Final = ZakresWaznosci(
    rodzaj_analizy="POWER_FLOW",
    opis_pl=(
        "Stan ustalony sieci z próbną baterią z katalogu dopisaną do wskazanej szyny — osobny "
        "bieg rozpływu mocy wariantu na scenariusz (dzień: generacja z modelu; noc: moc czynna "
        "generatorów równa zeru)."
    ),
    wykluczenia=(
        "zmienność obciążenia w ciągu doby poza dwoma scenariuszami",
        "regulacja stopniowa baterii i automatyka załączania",
        "harmoniczne i rezonans baterii z siecią",
        "przepięcia łączeniowe i prąd załączania baterii",
    ),
)

_PODSTAWA: Final = podstawa_zalozenia(
    "Wymagany cosφ punktu kompensowanego — parametr doboru podany przez projektanta",
    "wymagany cosφ punktu (parametr zapytania doboru)",
    uwagi_pl=(
        "wartość wymagania pochodzi z zapytania projektanta (np. z warunków przyłączenia "
        "operatora albo z umowy taryfowej); program jej nie ustala ani nie łagodzi"
    ),
)

_NAZWA_SCENARIUSZA: Final[dict[Scenariusz, str]] = {
    "dzien": "scenariusz dzienny (generacja z modelu)",
    "noc": "scenariusz nocny (moc czynna generatorów równa zeru)",
}

_SLAD: Final = OdnosnikSladu(
    krok="kompensacja.cosfi_punktu",
    opis_pl=(
        "cosφ punktu kompensowanego z bilansu odbioru i baterii w punkcie (ślad doboru: "
        "źródło P/Q, Q_netto = Q_odb − Q_bat)"
    ),
)


def _ocena_scenariusza(
    *,
    scenariusz: Scenariusz,
    pomiar: Mapping[str, Any],
    cos_phi_min: float,
    przedmiot: Przedmiot,
) -> OcenaKryterium:
    cosfi = pomiar.get("cosfi_punktu")
    powod = pomiar.get("powod_braku_pl")
    return ocena_porownania(
        Porownanie(
            kryterium_id=f"kompensacja.cosfi_punktu.{scenariusz}",
            opis_pl=(
                "cosφ punktu kompensowanego po zainstalowaniu baterii nie mniejszy od "
                f"wymaganego — {_NAZWA_SCENARIUSZA[scenariusz]}"
            ),
            warunek_latex=r"\cos\varphi_{\text{punktu}} \ge \cos\varphi_{\min}",
            relacja="NIE_MNIEJ",
            wielkosc_pl="cosφ punktu kompensowanego",
            symbol_latex=r"\cos\varphi_{\text{punktu}}",
            jednostka="1",
            wynik=None if cosfi is None else float(cosfi),
            limit=cos_phi_min,
            limit_pl="wymagany cosφ punktu podany w zapytaniu doboru",
            braki=() if cosfi is not None or not powod else (str(powod),),
        ),
        przedmiot=przedmiot,
        podstawa=_PODSTAWA,
        zdolnosc=classify_dynamic_capability(ZDOLNOSC_KOMPENSACJI),
        zakres=_ZAKRES,
        slad=() if cosfi is None else (_SLAD,),
        odniesienie=_ODNIESIENIE,
    )


def oceny_kandydata(
    *,
    bus_ref: str,
    nazwa_szyny_pl: str,
    nazwa_baterii_pl: str,
    dzien: Mapping[str, Any],
    noc: Mapping[str, Any] | None,
    cos_phi_min: float,
) -> WynikWymagania:
    """Rekord W kandydata: składowe K cosφ punktu w dniu i (``noc is not None``) w nocy."""
    przedmiot = Przedmiot(
        element_ref=bus_ref,
        nazwa_pl=nazwa_szyny_pl,
        opis_pl=f"Punkt kompensowany z próbną baterią „{nazwa_baterii_pl}” z katalogu",
    )
    oceny = [
        _ocena_scenariusza(
            scenariusz="dzien", pomiar=dzien, cos_phi_min=cos_phi_min, przedmiot=przedmiot
        )
    ]
    if noc is not None:
        oceny.append(
            _ocena_scenariusza(
                scenariusz="noc", pomiar=noc, cos_phi_min=cos_phi_min, przedmiot=przedmiot
            )
        )
    return wymaganie_z_ocen(
        wymaganie_id="kompensacja.cosfi_punktu",
        nazwa_pl=f"Wymagany cosφ punktu kompensowanego z baterią „{nazwa_baterii_pl}”",
        podstawa=_PODSTAWA,
        oceny=oceny,
        zdolnosc=classify_dynamic_capability(ZDOLNOSC_KOMPENSACJI),
        zakres=_ZAKRES,
        odniesienie=_ODNIESIENIE,
    )


def spelnia_liczbowo(wymaganie: WynikWymagania) -> bool:
    """Rozstrzygnięcie liczbowe rekordu W (``SPELNIA`` na liczbach każdej składowej) — JEDYNY
    predykat doboru pierwszego kandydata spełniającego."""
    return rozstrzygniecie(wymaganie.oceny_skladowe) == "SPELNIA"


def nierozstrzygniety(wymaganie: WynikWymagania) -> bool:
    """Rekord W bez rozstrzygnięcia liczbowego (choć jedna składowa bez wyniku) — kandydat,
    o którym nie wiadomo, czy spełnia; powód braku doboru nie może go liczyć jako
    niespełniającego."""
    return rozstrzygniecie(wymaganie.oceny_skladowe) is None
