"""Jedno zrodlo prawdy: kryteria napieciowe SN (karta W3-J, 2026-09-16).

Warstwa ANALIZY (interpretacja, zero fizyki — same stale i opisy, zadnej
arytmetyki na wynikach solvera). Recenzja karty W3-G2 (pasma zdrowego rozsadku
rozplywu) wykryla KLASE: progi napieciowe byly zdefiniowane NIEZALEZNIE w >=6
miejscach backendu i frontendu, z roznymi liczbami i roznymi (czesem blednymi)
podstawami normatywnymi — m.in. frontend cytowal "EN 50160 / IRiESD ±5 %" dla
pasma 0,95-1,05, podczas gdy PN-EN 50160 w rzeczywistosci dopuszcza ±10 % Un.

Trzy kryteria, KAZDE z osobna, uczciwie nazwana podstawa (`podstawa_pl`), oraz
czwarte WYPROWADZONE z drugiego (spadek wzdluz ciagu SN, sekcja 4 ponizej):

1. ``PASMO_WIARYGODNOSCI_PROCENT`` (10,0 %) — pasmo WIARYGODNOSCI wyniku
   solvera rozplywu (`analysis/sanity_bounds/power_flow_bounds.py`): PN-EN
   50160 dopuszcza ±10 % Un w warunkach normalnej pracy sieci publicznej —
   wynik POZA tym pasmem jest FIZYCZNIE WATPLIWY (podejrzenie bledu modelu),
   NIE "niezgodny z norma projektowa". To jest INNE pytanie niz kryterium 3
   ponizej, mimo tej samej liczby 10 % — patrz docstring `power_flow_bounds.py`.
2. ``KRYTERIUM_OSTRZEZENIE_PROCENT`` (5,0 %) — kryterium PROJEKTOWE planowania
   sieci SN: zapas na spadek napiecia w sieci nN, tak aby napiecie na
   zaciskach odbiorcy koncowego mieszczlo sie w pasmie PN-EN 50160 ±10 % Un.
   PODSTAWA: praktyka projektowa sieci SN / IRiESD — NIE jest to zapis
   PN-EN 50160 wprost, nazwane uczciwie (bledny cytat "EN 50160 ±5 %" w
   dawnym `ui2/wyniki/rozplyw/strings.ts` byl wlasnie tym pomyleniem: podstawa
   PROJEKTOWA podana jako podstawa NORMATYWNA).
3. ``KRYTERIUM_PRZEKROCZENIE_PROCENT`` (10,0 %) — PN-EN 50160 ±10 % Un wprost.

Funkcja `pasmo_pu(procent)` przelicza procent na przedzial [min_pu, max_pu]
wokol 1,0 p.u. (symetryczny, wokol napiecia znamionowego).

KONSUMENCI (jedno zrodlo liczby, zero drugiej kopii — patrz meldunek karty
W3-J dla pelnego inwentarza przed/po):
  - `analysis/normative/models.py::NormativeConfig` (domyslne
    `voltage_warn_pct`/`voltage_fail_pct`)
  - `analysis/energy_validation/models.py::EnergyValidationConfig` (jw., druga
    kopia tych samych domyslnych)
  - `analysis/reactive_adequacy/models.py` (`DEFAULT_U_MIN_PU`/`DEFAULT_U_MAX_PU`
    wyprowadzone z `KRYTERIUM_OSTRZEZENIE_PROCENT` przez `pasmo_pu`)
  - `analysis/sanity_bounds/power_flow_bounds.py::PASMO_NAPIECIA_PROCENT`
    (alias na `PASMO_WIARYGODNOSCI_PROCENT` — nazwa pola i wynik bit w bit
    bez zmian, patrz test parytetu)
  - `analysis/power_flow_interpretation/builder.py` (pasma INFO/WARN/HIGH:
    granica INFO/WARN i granica WARN/HIGH sourcowane z tych samych dwoch
    kryteriow — dawna trzecia, niecytowana granica 2 % skasowana)
  - `api/canonical_run_views.py::get_power_flow_result` (widok wyniku
    rozplywu per bieg, pole addytywne `kryteria_napiecia`)
  - `application/analyses/voltage_profile_view.py::build_voltage_profile_view`
    (widok profilu napiec, pole addytywne `kryteria_napiecia`)
  - `application/analyses/ocena_doboru_magistrali.py` (kryterium 4 ponizej:
    limit spadku napiecia odcinka i ciagu magistrali SN w rekordach oceny
    doboru przekroju kreatora magistrali — karta MAGISTRALA-OCENA)
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

#: Cytat normy PN-EN 50160 (jedno miejsce zrodlowe tresci normy w tym module —
#: cytowane przez DWA rozne kryteria o tej samej liczbie 10 %, patrz docstring
#: modulu).
PODSTAWA_PN_EN_50160_PL = (
    "PN-EN 50160 (Parametry napięcia zasilającego w publicznych sieciach "
    "elektroenergetycznych) — zmiany napięcia zasilającego w warunkach "
    "normalnej pracy: Un ± 10 %."
)

#: Podstawa kryterium ostrzezenia projektowego (5 %) — UCZCIWIE NIE PN-EN
#: 50160 wprost (dawny blad we frontendzie: `strings.ts` cytowal ta liczbe
#: jako "EN 50160 / IRiESD ±5 %", myslac dwie rozne podstawy w jeden zapis).
PODSTAWA_KRYTERIUM_OSTRZEZENIE_PL = (
    "Praktyka projektowa sieci SN / IRiESD: zapas na spadek napięcia w sieci "
    "nN, aby napięcie na zaciskach odbiorcy końcowego mieściło się w paśmie "
    "PN-EN 50160 ± 10 % Un. To NIE jest zapis PN-EN 50160 wprost — jest to "
    "kryterium projektowe planowania sieci SN, nazwane osobno od normy."
)

# =============================================================================
# 1. Pasmo WIARYGODNOSCI wyniku solvera (sanity-bounds)
# =============================================================================

#: Szerokosc pasma wiarygodnosci napiecia [%] wokol Un — czy wynik solvera
#: rozplywu jest fizycznie WIARYGODNY (nie: czy sie mniej podoba projektowo).
PASMO_WIARYGODNOSCI_PROCENT: float = 10.0
PASMO_WIARYGODNOSCI_PODSTAWA_PL = PODSTAWA_PN_EN_50160_PL

# =============================================================================
# 2. Kryterium OSTRZEZENIA (projektowe, planowanie sieci SN)
# =============================================================================

#: Prog ostrzezenia [%] wokol Un — kryterium PROJEKTOWE (zapas dla spadku
#: napiecia w sieci nN), NIE zapis normy wprost.
KRYTERIUM_OSTRZEZENIE_PROCENT: float = 5.0
KRYTERIUM_OSTRZEZENIE_PODSTAWA_PL = PODSTAWA_KRYTERIUM_OSTRZEZENIE_PL

# =============================================================================
# 3. Kryterium PRZEKROCZENIA (PN-EN 50160 wprost)
# =============================================================================

#: Prog przekroczenia [%] wokol Un — PN-EN 50160 ±10 % Un wprost.
KRYTERIUM_PRZEKROCZENIE_PROCENT: float = 10.0
KRYTERIUM_PRZEKROCZENIE_PODSTAWA_PL = PODSTAWA_PN_EN_50160_PL


# =============================================================================
# 4. Kryterium SPADKU NAPIECIA wzdluz ciagu SN (magistrali) — karta MAGISTRALA-OCENA
# =============================================================================

#: Dopuszczalny spadek napiecia wzdluz ciagu SN liczony od szyn SN GPZ [% Un].
#: WYPROWADZONY z kryterium 2 (ta sama liczba, ta sama podstawa projektowa), nie
#: druga niezalezna kopia: napiecie w wezle SN nie moze odchylac sie od Un o wiecej
#: niz ``KRYTERIUM_OSTRZEZENIE_PROCENT``, wiec przy napieciu szyn SN GPZ rownym Un
#: spadek wzdluz ciagu do dowolnego jego punktu nie moze przekroczyc tej samej
#: wartosci. Zalozenie „szyny SN GPZ = Un" jest czescia podstawy i trafia do zakresu
#: waznosci kazdego rekordu oceny, ktory ten limit stosuje (dawniej ta liczba zyla
#: jako `LIMIT_SPADKU_PCT = 5` w module kreatora magistrali we frontendzie — prog
#: zaszyty w interfejsie bez podstawy).
KRYTERIUM_SPADKU_CIAGU_SN_PROCENT: float = KRYTERIUM_OSTRZEZENIE_PROCENT
#: Nazwa dokumentu podstawy (pole `dokument` podstawy rekordu oceny).
KRYTERIUM_SPADKU_CIAGU_SN_DOKUMENT_PL = (
    "Praktyka projektowa sieci SN / IRiESD — kryterium odchylenia napięcia ± 5 % Un "
    "zastosowane do spadku napięcia wzdłuż ciągu SN"
)
KRYTERIUM_SPADKU_CIAGU_SN_PODSTAWA_PL = (
    "zapas na spadek napięcia w sieci nN (napięcie u odbiorcy w paśmie PN-EN 50160 "
    "± 10 % Un) przy napięciu szyn SN GPZ równym Un; to nie jest zapis PN-EN 50160 wprost, "
    "a dokument operatora z wydaniem i jednostką redakcyjną nie jest ustalony w rejestrze "
    "podstaw"
)
#: Rodzaj podstawy w slowniku kontraktu werdyktu (`werdykt.kontrakt.RodzajPodstawy`):
#: kryterium projektowe, nie norma — uczciwie, jak kryterium 2.
KRYTERIUM_SPADKU_CIAGU_SN_RODZAJ_PODSTAWY: Final = "ZALOZENIE_PROJEKTOWE"
#: Wydanie i jednostka redakcyjna dokumentu podstawy — NIEUSTALONE (brak cytowalnego
#: dokumentu operatora z wydaniem i punktem). Kontrakt werdyktu (§1) wymaga obu pol dla
#: stanu `WSKAZANE`/`ZWERYFIKOWANE`; bez nich stan zrodla jest `NIEUSTALONE`, a regula K
#: daje `BRAK_PODSTAWY` — wynik, limit i margines sa nadal pokazywane, ale kryterium nie
#: jest rozstrzygane na podstawie, ktorej nikt nie wskazal. Wpisanie wydania i jednostki
#: redakcyjnej (z dokumentem operatora) w TYM miejscu podnosi stan dla wszystkich ocen.
KRYTERIUM_SPADKU_CIAGU_SN_WYDANIE: str | None = None
KRYTERIUM_SPADKU_CIAGU_SN_JEDNOSTKA_REDAKCYJNA: str | None = None
#: Stan zrodla podstawy (`werdykt.kontrakt.StanZrodla`).
KRYTERIUM_SPADKU_CIAGU_SN_STAN_ZRODLA: Final = "NIEUSTALONE"


def pasmo_pu(procent: float) -> tuple[float, float]:
    """Przedzial [min_pu, max_pu] wokol 1,0 p.u. dla podanego procentu.

    Czysta arytmetyka symetrycznego pasma wokol napiecia znamionowego —
    NIE fizyka sieci (zero topologii, zero wyniku solvera). Uzywana przez
    kazdy konsument tego modulu do wyprowadzenia pasma p.u. z procentu.
    """
    return (1.0 - procent / 100.0, 1.0 + procent / 100.0)


@dataclass(frozen=True)
class KryteriaNapieciowe:
    """Komplet kryteriow napieciowych — ksztalt niesiony w odpowiedzi API
    (widok wyniku rozplywu i profilu napiec, karta W3-J §0.3)."""

    ostrzezenie_pct: float
    przekroczenie_pct: float
    ostrzezenie_min_pu: float
    ostrzezenie_max_pu: float
    przekroczenie_min_pu: float
    przekroczenie_max_pu: float
    podstawa_ostrzezenie_pl: str
    podstawa_przekroczenie_pl: str
    pasmo_wiarygodnosci_pct: float

    def to_dict(self) -> dict[str, float | str]:
        return {
            "ostrzezenie_pct": self.ostrzezenie_pct,
            "przekroczenie_pct": self.przekroczenie_pct,
            "ostrzezenie_min_pu": self.ostrzezenie_min_pu,
            "ostrzezenie_max_pu": self.ostrzezenie_max_pu,
            "przekroczenie_min_pu": self.przekroczenie_min_pu,
            "przekroczenie_max_pu": self.przekroczenie_max_pu,
            "podstawa_ostrzezenie_pl": self.podstawa_ostrzezenie_pl,
            "podstawa_przekroczenie_pl": self.podstawa_przekroczenie_pl,
            "pasmo_wiarygodnosci_pct": self.pasmo_wiarygodnosci_pct,
        }


def zbuduj_kryteria_napiecia() -> KryteriaNapieciowe:
    """Zbuduj komplet kryteriow napieciowych z jednego zrodla prawdy.

    Wolane z warstwy API (`api/canonical_run_views.py::get_power_flow_result`,
    `application/analyses/voltage_profile_view.py::build_voltage_profile_view`)
    do wzbogacenia odpowiedzi ADDYTYWNYM polem `kryteria_napiecia` — zawsze
    swiezo z aktualnych stalych tego modulu (progi sa konfiguracja, nie
    wynikiem fizycznym biegu, wiec nie trzeba ich przechowywac per bieg).
    """
    ostrzezenie_min_pu, ostrzezenie_max_pu = pasmo_pu(KRYTERIUM_OSTRZEZENIE_PROCENT)
    przekroczenie_min_pu, przekroczenie_max_pu = pasmo_pu(KRYTERIUM_PRZEKROCZENIE_PROCENT)
    return KryteriaNapieciowe(
        ostrzezenie_pct=KRYTERIUM_OSTRZEZENIE_PROCENT,
        przekroczenie_pct=KRYTERIUM_PRZEKROCZENIE_PROCENT,
        ostrzezenie_min_pu=ostrzezenie_min_pu,
        ostrzezenie_max_pu=ostrzezenie_max_pu,
        przekroczenie_min_pu=przekroczenie_min_pu,
        przekroczenie_max_pu=przekroczenie_max_pu,
        podstawa_ostrzezenie_pl=KRYTERIUM_OSTRZEZENIE_PODSTAWA_PL,
        podstawa_przekroczenie_pl=KRYTERIUM_PRZEKROCZENIE_PODSTAWA_PL,
        pasmo_wiarygodnosci_pct=PASMO_WIARYGODNOSCI_PROCENT,
    )
