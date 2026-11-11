"""Czas wyłączenia t_b (minimalny czas zwłoki t_min) punktu zwarcia — jeden nośnik, jedna reguła
danych i jedna wartość robocza (karty SC-IB-ITH-ZRODLA i TB-WARTOSC-ROBOCZA, B-01 (n)).

PO CO. IEC 60909-0:2016 (rozdz. 9, 10) liczy symetryczny prąd wyłączeniowy I_b i składową
nieokresową i_DC w chwili t_b = t_min — najkrótszy czas zadziałania zabezpieczenia plus
najkrótszy czas własny wyłącznika. To DANA PROJEKTOWA (nastawy i aparat), nie stała solvera.

PIERWSZEŃSTWO W PUNKCIE ZWARCIA (zasada nr 4, kontrakt werdyktu §3c, V12K-351 — brak danej nie
blokuje obliczeń). t_b rozstrzyga się PER PUNKT ZWARCIA, jedną funkcją w warstwie wiązania
(``application.solvers.short_circuit_binding.czas_tb_punktu``):

  (a) t_b ze scenariusza zwarciowego (``ShortCircuitConfig.breaking_time_seconds`` → opcja biegu
      ``breaking_time_seconds``) — pochodzenie ``PROJEKTANT``, dotyczy wszystkich punktów;
  (b) inaczej najkrótszy czas wyłączenia pól lokalnych punktu (wzorzec PowerFactory „break time:
      min. of local”) z jedynego rozstrzygnięcia czasu pola
      (``application.analyses.protection.czas_wylaczenia_pola``) — pochodzenie ``Z_POL``
      z odnośnikiem pola; czas własny wyłącznika będący wartością roboczą przenosi się na t_b;
  (c) gdy żadne pole lokalne nie daje czasu — wartość robocza ``CZAS_TB_ROBOCZY_S`` = 0,1 s
      (węzeł tablicy μ IEC 60909-0:2016, rys. 16 / wzory (70)–(73)) — pochodzenie
      ``PROPOZYCJA``, jakość ``ESTIMATED``.

Wartość niefizyczna podana przez projektanta to odmowa ``fault.czas_tb_niepoprawny`` w tym
jednym miejscu — API, magazyn scenariuszy i opcje biegu wołają tę samą funkcję. Stała 0,1 s
żyje WYŁĄCZNIE tutaj (nie jako domyślny argument sygnatury rdzenia).

Moduł jest liściem (stdlib + ``network_model.odmowa_danych``).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Literal

from network_model.odmowa_danych import OdmowaNazwana

__all__ = [
    "CZAS_TB_ROBOCZY_S",
    "KLUCZ_OPCJI_CZASU_TB",
    "KOD_CZAS_TB_NIEPOPRAWNY",
    "KOD_CZAS_TB_WARTOSC_ROBOCZA",
    "POCHODZENIE_TB_PROJEKTANT",
    "POCHODZENIE_TB_PROPOZYCJA",
    "POCHODZENIE_TB_Z_POL",
    "ZRODLO_CZASU_TB_ROBOCZEGO",
    "CzasWylaczeniaTb",
    "OdmowaCzasuTbError",
    "PochodzenieCzasuTb",
    "czas_tb_projektanta",
    "czas_tb_roboczy",
    "czas_tb_z_danych",
]

#: Klucz opcji biegu zwarciowego niosący t_b [s] projektanta (projekcja scenariusza → opcje).
KLUCZ_OPCJI_CZASU_TB = "breaking_time_seconds"
#: Kod założenia biegu: w części punktów zwarcia t_b jest wartością roboczą (propozycja albo
#: czas pola z czasem własnym wyłącznika przyjętym jako wartość robocza).
KOD_CZAS_TB_WARTOSC_ROBOCZA = "fault.czas_tb_wartosc_robocza"
#: Kod odmowy: t_b projektanta nieliczbowe, nieskończone albo niedodatnie.
KOD_CZAS_TB_NIEPOPRAWNY = "fault.czas_tb_niepoprawny"

PochodzenieCzasuTb = Literal["PROJEKTANT", "Z_POL", "PROPOZYCJA"]
POCHODZENIE_TB_PROJEKTANT: PochodzenieCzasuTb = "PROJEKTANT"
POCHODZENIE_TB_Z_POL: PochodzenieCzasuTb = "Z_POL"
POCHODZENIE_TB_PROPOZYCJA: PochodzenieCzasuTb = "PROPOZYCJA"

#: Wartość robocza t_b [s] — JEDYNE miejsce tej liczby w programie.
CZAS_TB_ROBOCZY_S = 0.1
#: Źródło wartości roboczej (odniesienie normowe, tekst dla wyjaśnienia i raportu).
ZRODLO_CZASU_TB_ROBOCZEGO = (
    "węzeł tablicy μ IEC 60909-0:2016 (rys. 16 / wzory (70)–(73), minimalny czas zwłoki 0,1 s)"
)
_UZASADNIENIE_ROBOCZEGO = (
    "żadne pole z wyłącznikiem przyłączone do szyny punktu zwarcia nie daje czasu wyłączenia "
    "z nastaw zabezpieczenia"
)
_WPLYW_ROBOCZEGO = (
    "prąd wyłączeniowy z udziałem maszyn wirujących i składowa nieokresowa policzone przy "
    "założonym czasie wyłączenia; dłuższy rzeczywisty czas wyłączenia daje mniejsze wartości "
    "(ocena zachowawcza), krótszy — większe"
)


def _liczba_pl(wartosc: float) -> str:
    return f"{wartosc:.6g}".replace(".", ",")


@dataclass(frozen=True)
class CzasWylaczeniaTb:
    """t_b punktu zwarcia z pochodzeniem — wejście rdzenia IEC 60909 i pole wiersza wyniku.

    ``robocza`` = wartość przyjęta bez dokumentu (propozycja albo czas pola z czasem własnym
    wyłącznika będącym wartością roboczą) — wynik na niej ma jakość ``ESTIMATED`` w ocenach.
    ``opis_pl`` — jedno zdanie źródła (wyjaśnienie, komentarz obliczeń, raport). Dla
    pochodzenia ``Z_POL`` pola rozbicia niosą odnośnik pola i oba człony czasu.
    """

    wartosc_s: float
    pochodzenie: PochodzenieCzasuTb
    robocza: bool
    opis_pl: str
    pole_ref: str | None = None
    pole_nazwa: str | None = None
    zabezpieczenie_ref: str | None = None
    czlon_nastawczy_s: float | None = None
    czas_wlasny_s: float | None = None
    czas_wlasny_pochodzenie: str | None = None
    prad_zwarciowy_a: float | None = None

    def __post_init__(self) -> None:
        if not (math.isfinite(self.wartosc_s) and self.wartosc_s > 0.0):
            raise AssertionError(f"t_b punktu zwarcia musi być dodatnie: {self.wartosc_s!r}")
        if (self.pochodzenie == POCHODZENIE_TB_Z_POL) != (self.pole_ref is not None):
            raise AssertionError("Odnośnik pola występuje wyłącznie przy pochodzeniu Z_POL.")
        if self.pochodzenie == POCHODZENIE_TB_PROPOZYCJA and not self.robocza:
            raise AssertionError("Propozycja t_b jest zawsze wartością roboczą.")
        if self.pochodzenie == POCHODZENIE_TB_PROJEKTANT and self.robocza:
            raise AssertionError("t_b scenariusza projektanta nie jest wartością roboczą.")

    @property
    def jakosc(self) -> str | None:
        """Jakość danej przyjętej: ``ESTIMATED`` dla wartości roboczej (nigdy ``DATASHEET``);
        ``None`` — t_b projektanta albo z pól z danymi karty: decyzja projektowa, nie dana
        przyjęta."""
        return "ESTIMATED" if self.robocza else None

    def to_dict(self) -> dict[str, Any]:
        wynik: dict[str, Any] = {
            "wartosc_s": float(self.wartosc_s),
            "pochodzenie": self.pochodzenie,
            "wartosc_robocza": self.robocza,
            "jakosc": self.jakosc,
            "opis_pl": self.opis_pl,
        }
        if self.pochodzenie == POCHODZENIE_TB_PROPOZYCJA:
            wynik["zrodlo_pl"] = ZRODLO_CZASU_TB_ROBOCZEGO
        if self.pole_ref is not None:
            wynik.update(
                {
                    "pole_ref": self.pole_ref,
                    "pole_nazwa": self.pole_nazwa,
                    "zabezpieczenie_ref": self.zabezpieczenie_ref,
                    "czlon_nastawczy_s": self.czlon_nastawczy_s,
                    "czas_wlasny_s": self.czas_wlasny_s,
                    "czas_wlasny_pochodzenie": self.czas_wlasny_pochodzenie,
                    "prad_zwarciowy_a": self.prad_zwarciowy_a,
                }
            )
        return wynik


class OdmowaCzasuTbError(OdmowaNazwana):
    """Czas t_b odrzucony — odmowa nazwana z kodem rejestru gotowości w polu ``kod``."""


def czas_tb_z_danych(dane: object) -> float | None:
    """t_b projektanta [s] z danych kontraktu (opcje biegu, konfiguracja scenariusza, API).

    ``None`` = projektant nie podał t_b — rozstrzyga punkt zwarcia (pola lokalne, inaczej
    wartość robocza), obliczenie biegnie bez blokady. Liczba skończona dodatnia = t_b. Każda
    inna postać (napis, wartość logiczna, zero, ujemna, NaN, nieskończoność) =
    ``OdmowaCzasuTbError``.
    """
    if dane is None:
        return None
    if isinstance(dane, bool) or not isinstance(dane, int | float):
        raise OdmowaCzasuTbError(
            f"Czas wyłączenia {dane!r} nie jest liczbą — podaj najkrótszy czas "
            "zadziałania zabezpieczenia powiększony o czas własny wyłącznika, w sekundach.",
            kod=KOD_CZAS_TB_NIEPOPRAWNY,
        )
    wartosc = float(dane)
    if not math.isfinite(wartosc) or wartosc <= 0.0:
        raise OdmowaCzasuTbError(
            f"Czas wyłączenia {dane!r} musi być skończoną liczbą dodatnią w sekundach "
            "(najkrótszy czas zadziałania zabezpieczenia + czas własny wyłącznika).",
            kod=KOD_CZAS_TB_NIEPOPRAWNY,
        )
    return wartosc


def czas_tb_projektanta(wartosc_s: float) -> CzasWylaczeniaTb:
    """t_b podany w scenariuszu zwarciowym (po regule ``czas_tb_z_danych``)."""
    return CzasWylaczeniaTb(
        wartosc_s=float(wartosc_s),
        pochodzenie=POCHODZENIE_TB_PROJEKTANT,
        robocza=False,
        opis_pl=(
            f"Czas wyłączenia {_liczba_pl(wartosc_s)} s podany przez projektanta w scenariuszu "
            "zwarciowym (dotyczy wszystkich punktów zwarcia biegu)."
        ),
    )


def czas_tb_roboczy(powod_pl: str | None = None) -> CzasWylaczeniaTb:
    """Wartość robocza t_b = 0,1 s z jawnym źródłem (punkt bez czasu z pól lokalnych).

    ``powod_pl`` — dlaczego pola lokalne nie dały czasu (doklejane do opisu, gdy znane).
    """
    powod = powod_pl or _UZASADNIENIE_ROBOCZEGO
    return CzasWylaczeniaTb(
        wartosc_s=CZAS_TB_ROBOCZY_S,
        pochodzenie=POCHODZENIE_TB_PROPOZYCJA,
        robocza=True,
        opis_pl=(
            f"Czas wyłączenia {_liczba_pl(CZAS_TB_ROBOCZY_S)} s — wartość robocza "
            f"({ZRODLO_CZASU_TB_ROBOCZEGO}): {powod}. Wpływ: {_WPLYW_ROBOCZEGO}. Zmień czas "
            "wyłączenia w scenariuszu zwarciowym, aby "
            "przeliczyć na wartości projektowej."
        ),
    )
