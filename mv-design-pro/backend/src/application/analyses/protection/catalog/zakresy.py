"""Zakresy nastaw prądowych przekaźnika — JEDNA funkcja porównania dla każdego toru.

Karta BIEG-ZABEZPIECZEN-Z-MODELU (PZ-09): zakres prądowy pozycji katalogu jest cechą STRONY
WTÓRNEJ przekaźnika — krotność prądu znamionowego wejścia (``KROTNOSC_IN``) albo ampery
wtórne (``A_WTORNY``); zakres bez ustalonej jednostki (``None``) nie jest używany. Wartość
nastawy porównuje się z zakresem wyłącznie po stronie wtórnej, więc porównanie wymaga
przekładni przekładnika. Wołają ją ocena zabezpieczeń z modelu
(``ocena_nadpradowa._rozwiaz_stopien``) i dobór aparatu dla nastaw Hoppela
(``catalog.validator.validate_requirement``) — jedno źródło reguły.
"""

from __future__ import annotations

from network_model.pochodne import prad_wtorny_z_pierwotnego_a

from .models import JEDNOSTKA_ZAKRESU_A_WTORNY, JEDNOSTKA_ZAKRESU_KROTNOSC_IN, DeviceCapability

#: Jednostka zakresu w zdaniu dla projektanta.
JEDNOSTKI_ZAKRESU_PL: dict[str, str] = {
    JEDNOSTKA_ZAKRESU_KROTNOSC_IN: "×In",
    JEDNOSTKA_ZAKRESU_A_WTORNY: "A (strona wtórna)",
}


def zakres_pradowy(cap: DeviceCapability, kod_funkcji: str) -> tuple[float | None, float | None]:
    """Granice zakresu prądowego funkcji (``51``, ``50``, ``51N``, ``50N``) w jednostce zakresu."""
    return {
        "51": (cap.i_pickup_51_a_min, cap.i_pickup_51_a_max),
        "50": (cap.i_inst_50_a_min, cap.i_inst_50_a_max),
        "51N": (cap.i_pickup_51n_a_min, cap.i_pickup_51n_a_max),
        "50N": (cap.i_inst_50n_a_min, cap.i_inst_50n_a_max),
    }[kod_funkcji]


def wartosc_w_jednostce_zakresu(
    cap: DeviceCapability, prog_wtorny_a: float, prad_wtorny_znamionowy_a: float
) -> tuple[float, str]:
    """Próg strony wtórnej wyrażony w jednostce zakresu pozycji katalogu: ``(wartość, opis)``.

    Wołający sprawdził, że jednostka zakresu jest ustalona (``cap.jednostka_zakresow_pradowych``
    nie jest ``None``) — dla jednostki nieustalonej porównania nie ma.
    """
    jednostka = cap.jednostka_zakresow_pradowych
    if jednostka == JEDNOSTKA_ZAKRESU_KROTNOSC_IN:
        return prog_wtorny_a / prad_wtorny_znamionowy_a, JEDNOSTKI_ZAKRESU_PL[jednostka]
    if jednostka == JEDNOSTKA_ZAKRESU_A_WTORNY:
        return prog_wtorny_a, JEDNOSTKI_ZAKRESU_PL[jednostka]
    raise ValueError(f"jednostka zakresu nieustalona albo nieznana: {jednostka!r}")


def wartosc_pierwotna_w_jednostce_zakresu(
    cap: DeviceCapability, prad_pierwotny_a: float, przekladnia_a: tuple[float, float]
) -> tuple[float, str]:
    """Jak ``wartosc_w_jednostce_zakresu`` dla progu podanego po stronie pierwotnej."""
    pierwotny_znamionowy, wtorny_znamionowy = przekladnia_a
    prog_wtorny = prad_wtorny_z_pierwotnego_a(
        prad_pierwotny_a, pierwotny_znamionowy, wtorny_znamionowy
    )
    return wartosc_w_jednostce_zakresu(cap, prog_wtorny, wtorny_znamionowy)


def w_zakresie(wartosc: float, minimum: float | None, maksimum: float | None) -> bool:
    """Wartość w granicach zakresu; brak granicy (pozycja jej nie deklaruje) nie jest granicą."""
    if minimum is None or maksimum is None:
        return True
    return minimum <= wartosc <= maksimum


__all__ = [
    "JEDNOSTKI_ZAKRESU_PL",
    "w_zakresie",
    "wartosc_pierwotna_w_jednostce_zakresu",
    "wartosc_w_jednostce_zakresu",
    "zakres_pradowy",
]
