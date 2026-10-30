"""Rekordy werdyktu wyjaśnialnego pozycji walidacji energetycznej (karta WERDYKT-MIGRACJA-190).

Każda pozycja walidacji (obciążenie gałęzi i transformatora, odchylenie napięcia, budżet strat,
bilans mocy biernej) niesie rekord K: wielkość z wyniku rozpływu wobec limitu przekroczenia
z podstawą, margines, dowód i zakres ważności. Kod zastany ``status`` jest PROJEKCJĄ tego
rekordu — rozstrzygnięcie ``FAIL`` daje wyłącznie rekord ``NIE_SPELNIA``. Próg ostrzeżenia nie
jest werdyktem: to sygnał bliskości limitu, nakładany na rekord spełniony (``WARNING``).

Warstwa ANALIZY — zero fizyki: wielkości przychodzą gotowe z buildera (wynik rozpływu), tu
tylko porównanie z limitem przez pakiet ``werdykt`` (jedna reguła decyzji produktu).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from analysis.energy_validation.models import EnergyCheckType, EnergyValidationStatus
from analysis.normative.kryteria_napiecia import KRYTERIUM_PRZEKROCZENIE_PROCENT
from solver_input.provenance import classify_dynamic_capability
from werdykt import (
    OcenaKryterium,
    OdnosnikSladu,
    PodstawaWymagania,
    Przedmiot,
    Relacja,
    ZakresWaznosci,
)
from werdykt.porownanie import Porownanie, ocena_porownania, podstawa_normy, podstawa_zalozenia
from werdykt.porownanie import rozstrzygniecie as rozstrzygniecie_ocen

ZDOLNOSC_WALIDACJI: Final = "rozplyw.walidacja_energetyczna"

_ZAKRES: Final = ZakresWaznosci(
    rodzaj_analizy="POWER_FLOW",
    opis_pl=(
        "Stan ustalony jednego biegu rozpływu mocy przy obciążeniach i generacji zapisanych "
        "w modelu; wielkości z wyniku rozpływu porównane z progami walidacji energetycznej."
    ),
    wykluczenia=(
        "inne stany pracy niż zapisany w modelu (szczyt, dolina, stany awaryjne N-1)",
        "przeciążalność krótkotrwała i cykliczna urządzeń",
    ),
)

_DOKUMENT_PROGOW: Final = "Progi walidacji energetycznej programu (konfiguracja walidacji)"


def _podstawa_progu(jednostka_redakcyjna: str, uwagi_pl: str) -> PodstawaWymagania:
    return podstawa_zalozenia(_DOKUMENT_PROGOW, jednostka_redakcyjna, uwagi_pl=uwagi_pl)


_PODSTAWA_PN_EN_50160: Final = podstawa_normy(
    "PN-EN 50160 (Parametry napięcia zasilającego w publicznych sieciach elektroenergetycznych)",
    "2010",
    "4.2.2 i 5.2.2 — zmiany napięcia zasilającego w warunkach normalnej pracy: Un ± 10 %",
)


@dataclass(frozen=True)
class _Definicja:
    kryterium_id: str
    opis_pl: str
    warunek_latex: str
    relacja: Relacja
    wielkosc_pl: str
    symbol_latex: str
    jednostka: str
    limit_pl: str
    opis_przedmiotu_pl: str


_DEFINICJE: Final[dict[EnergyCheckType, _Definicja]] = {
    EnergyCheckType.BRANCH_LOADING: _Definicja(
        kryterium_id="walidacja_energetyczna.obciazenie_galezi",
        opis_pl="Obciążenie gałęzi nie większe od progu przekroczenia prądu znamionowego",
        warunek_latex=r"\varepsilon \le \varepsilon_{\text{limit}}",
        relacja="NIE_WIECEJ",
        wielkosc_pl="obciążenie gałęzi (prąd zacisku wobec prądu znamionowego)",
        symbol_latex=r"\varepsilon",
        jednostka="%",
        limit_pl="próg przekroczenia obciążenia gałęzi",
        opis_przedmiotu_pl="Linia albo kabel w stanie ustalonym biegu rozpływu",
    ),
    EnergyCheckType.TRANSFORMER_LOADING: _Definicja(
        kryterium_id="walidacja_energetyczna.obciazenie_transformatora",
        opis_pl=("Obciążenie transformatora nie większe od progu przekroczenia prądu znamionowego"),
        warunek_latex=r"\varepsilon \le \varepsilon_{\text{limit}}",
        relacja="NIE_WIECEJ",
        wielkosc_pl="obciążenie transformatora (prąd strony wobec prądu znamionowego strony)",
        symbol_latex=r"\varepsilon",
        jednostka="%",
        limit_pl="próg przekroczenia obciążenia transformatora",
        opis_przedmiotu_pl="Transformator w stanie ustalonym biegu rozpływu",
    ),
    EnergyCheckType.VOLTAGE_DEVIATION: _Definicja(
        kryterium_id="walidacja_energetyczna.odchylenie_napiecia",
        opis_pl="Odchylenie napięcia od znamionowego nie większe od dopuszczalnego",
        warunek_latex=r"\delta U \le \delta U_{\text{limit}}",
        relacja="NIE_WIECEJ",
        wielkosc_pl="odchylenie napięcia od znamionowego",
        symbol_latex=r"\delta U",
        jednostka="%",
        limit_pl="dopuszczalne odchylenie napięcia od znamionowego",
        opis_przedmiotu_pl="Szyna w stanie ustalonym biegu rozpływu",
    ),
    EnergyCheckType.LOSS_BUDGET: _Definicja(
        kryterium_id="walidacja_energetyczna.budzet_strat",
        opis_pl="Straty mocy czynnej sieci nie większe od progu budżetu strat",
        warunek_latex=r"\Delta P\% \le \Delta P\%_{\text{limit}}",
        relacja="NIE_WIECEJ",
        wielkosc_pl="straty mocy czynnej odniesione do mocy węzła bilansującego",
        symbol_latex=r"\Delta P\%",
        jednostka="%",
        limit_pl="próg przekroczenia budżetu strat",
        opis_przedmiotu_pl="Cała sieć modelu w stanie ustalonym biegu rozpływu",
    ),
    EnergyCheckType.REACTIVE_BALANCE: _Definicja(
        kryterium_id="walidacja_energetyczna.bilans_mocy_biernej",
        opis_pl="Współczynnik mocy węzła bilansującego nie mniejszy od progu",
        warunek_latex=r"\cos\varphi \ge \cos\varphi_{\text{limit}}",
        relacja="NIE_MNIEJ",
        wielkosc_pl="współczynnik mocy cosφ w węźle bilansującym",
        symbol_latex=r"\cos\varphi",
        jednostka="1",
        limit_pl="próg przekroczenia bilansu mocy biernej",
        opis_przedmiotu_pl="Wymiana mocy z siecią zasilającą w węźle bilansującym",
    ),
}


def _podstawa(check_type: EnergyCheckType, limit: float | None) -> PodstawaWymagania:
    """Podstawa limitu przekroczenia pozycji. Odchylenie napięcia przy progu ±10 % stoi na
    PN-EN 50160 wprost; każdy inny próg (konfiguracja walidacji) jest założeniem programu."""
    if (
        check_type is EnergyCheckType.VOLTAGE_DEVIATION
        and limit is not None
        and limit == KRYTERIUM_PRZEKROCZENIE_PROCENT
    ):
        return _PODSTAWA_PN_EN_50160
    if check_type is EnergyCheckType.BRANCH_LOADING:
        return _podstawa_progu(
            "obciążenie gałęzi — próg przekroczenia prądu znamionowego",
            "prąd znamionowy gałęzi z obciążalności długotrwałej typu katalogowego",
        )
    if check_type is EnergyCheckType.TRANSFORMER_LOADING:
        return _podstawa_progu(
            "obciążenie transformatora — próg przekroczenia prądu znamionowego strony",
            "współczynnik obciążenia K = I / I_r (IEC 60076-7) bez przeciążalności cyklicznej",
        )
    if check_type is EnergyCheckType.VOLTAGE_DEVIATION:
        return _podstawa_progu(
            "odchylenie napięcia — próg z konfiguracji walidacji",
            "próg inny niż ± 10 % Un z PN-EN 50160",
        )
    if check_type is EnergyCheckType.LOSS_BUDGET:
        return _podstawa_progu(
            "budżet strat mocy czynnej sieci",
            "próg projektowy programu, nie wartość normowa",
        )
    return _podstawa_progu(
        "bilans mocy biernej — próg współczynnika mocy węzła bilansującego",
        "próg projektowy programu (przekroczenie cosφ < 0,8, ostrzeżenie cosφ < 0,9), nie "
        "wartość z taryfy operatora",
    )


def ocena_pozycji(
    *,
    check_type: EnergyCheckType,
    nazwa_pl: str,
    wynik: float | None,
    limit: float | None,
    braki: tuple[str, ...] = (),
) -> OcenaKryterium:
    """Rekord K pozycji walidacji. ``wynik is None`` — wielkości nie wyznaczono (``braki``
    nazywają przyczynę; reguła daje ``NIE_OCENIONO``, nigdy spełnienie)."""
    d = _DEFINICJE[check_type]
    return ocena_porownania(
        Porownanie(
            kryterium_id=d.kryterium_id,
            opis_pl=d.opis_pl,
            warunek_latex=d.warunek_latex,
            relacja=d.relacja,
            wielkosc_pl=d.wielkosc_pl,
            symbol_latex=d.symbol_latex,
            jednostka=d.jednostka,
            wynik=wynik,
            limit=limit,
            limit_pl=d.limit_pl,
            braki=braki,
        ),
        przedmiot=Przedmiot(element_ref=None, nazwa_pl=nazwa_pl, opis_pl=d.opis_przedmiotu_pl),
        podstawa=_podstawa(check_type, limit),
        zdolnosc=classify_dynamic_capability(ZDOLNOSC_WALIDACJI),
        zakres=_ZAKRES,
        slad=(
            ()
            if wynik is None
            else (
                OdnosnikSladu(
                    krok=f"energy_validation.{check_type.value.lower()}",
                    opis_pl="Wywód pozycji walidacji energetycznej (wzór, dane, wynik, progi)",
                ),
            )
        ),
        odniesienie="analysis/energy_validation/builder.py",
    )


def status_pozycji(
    ocena: OcenaKryterium, *, wynik: float | None, prog_ostrzezenia: float | None
) -> EnergyValidationStatus:
    """Kod zastany wyprowadzony z rekordu: ``FAIL`` ⇔ ``NIE_SPELNIA``; rekord nierozstrzygnięty
    ⇒ ``NOT_COMPUTED``; rekord spełniony ⇒ ``WARNING``, gdy wielkość przekroczyła próg
    ostrzeżenia w kierunku relacji kryterium (bliskość limitu), inaczej ``PASS``."""
    rozstrzygniete = rozstrzygniecie_ocen((ocena,))
    if rozstrzygniete is None:
        return EnergyValidationStatus.NOT_COMPUTED
    if rozstrzygniete == "NIE_SPELNIA":
        return EnergyValidationStatus.FAIL
    if wynik is None or prog_ostrzezenia is None:
        return EnergyValidationStatus.PASS
    blisko = (
        wynik >= prog_ostrzezenia
        if ocena.kryterium.relacja == "NIE_WIECEJ"
        else wynik < prog_ostrzezenia
    )
    return EnergyValidationStatus.WARNING if blisko else EnergyValidationStatus.PASS
