"""Ocena zabezpieczeń nadprądowych z modelu — JEDNA ścieżka (karta BIEG-ZABEZPIECZEN-Z-MODELU).

PO CO. Do tej karty ocena, którą widział projektant, liczyła się na JEDNYM syntetycznym
urządzeniu ``device_{węzeł}`` w pierwszym po sortowaniu węźle zwarcia, z nastawami z szablonu
przypadku i cichymi wartościami domyślnymi (TMS 0,3, I> = minimum pola szablonu 0,1, I0> =
100 A). Porównywała Ik'' szyny zamiast prądu, który płynie przez przekładnik pola, i dawała
marginesy bez związku z siecią (18 535 590,85 %). Obok żyło siedem torów liczących czas,
margines albo selektywność, każdy z innego źródła urządzeń.

CO ROBI TEN MODUŁ — JEDYNE miejsce, które:

1. rozwiązuje nastawy urządzenia z MODELU (``protection_assignments``, decyzja D-21) — stopnie
   nadprądowe 50/51 z jednostką progu zadeklarowaną w polu (PZ-09), przekładnią przekładnika
   pola z wiązania CT, zakresem nastaw z katalogu IED (jednostka i podstawa jawne) —
   ``rozwiaz_nastawy``;
2. wyznacza strefę urządzenia z topologii modelu (strona wyłącznika odległa od zasilania
   sieciowego) — ``strefa_urzadzenia``; niejednoznaczność to odmowa z kandydatami naprawy;
3. wyznacza punkty zwarcia strefy — szyny z wynikiem biegu SC oraz zacisk pola za
   wyłącznikiem (szyna pomocnicza, którą wynik raportuje pod szyną pola —
   ``enm.tor_pola.szyna_raportowa``, jedno źródło z pakietem nastaw) —
   ``punkty_zwarcia_strefy``;
4. wyznacza prąd widziany przez przekaźnik = prąd gałęzi pola z rozpływu zwarciowego biegu SC
   (bilans węzłów zacisku za wyłącznikiem) — ``prad_przekaznika``;
5. liczy czas zadziałania WYŁĄCZNIE rdzeniem IEC 60255 (``compute_curve_trip_time``,
   ``compute_ieee_c37112_generic``) — ``czas_stopnia``;
6. składa rekord werdyktu wyjaśnialnego (``werdykt``) z wiarygodnością wyniku.

ZERO WARTOŚCI DOMYŚLNYCH: każdy brak (próg, jednostka, charakterystyka, zwłoka, mnożnik,
przekładnik, pozycja katalogu, jednostka zakresu katalogu, zakres) to NAZWANA pozycja
gotowości z akcją naprawczą, która wstrzymuje ocenę TEGO urządzenia i tylko jego.

WARSTWA ANALIZ, NIE SOLVER: żaden wzór krzywej nie powstaje tutaj. Przeliczenie przekładni
(I₁ = I₂·I₁n/I₂n) to wielkość pochodna z ``network_model.pochodne``. Bilans prądów węzła
zacisku to suma wkładów solvera SC netto wg kierunku — ta sama reguła, którą czyta
``application.analyses.prad_zwarciowy_galezi`` (moduł sumowania, wspólny).

DETERMINIZM: urządzenia po ``ref_id``, punkty po identyfikatorze węzła, gałęzie po
identyfikatorze — ten sam model i ten sam bieg dają te same bajty wyniku.
"""

from __future__ import annotations

import math
import re
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

from application.analyses.prad_zwarciowy_galezi import prad_netto_galezi_z_wkladow
from application.analyses.protection.catalog.catalog_store import load_device_capability
from application.analyses.protection.catalog.models import (
    JEDNOSTKA_ZAKRESU_KROTNOSC_IN,
    DeviceCapability,
)
from application.analyses.protection.catalog.zakresy import (
    w_zakresie,
    zakres_pradowy,
)
from application.analyses.protection.catalog.zakresy import (
    wartosc_w_jednostce_zakresu as wartosc_w_jednostce_zakresu_katalogu,
)
from enm.katalog_projektu import katalog_dla_modelu
from enm.mapping import ref_to_graph_id
from enm.models import EnergyNetworkModel, Measurement, ProtectionAssignment, ProtectionSetting
from enm.nastawy_zabezpieczen import ETYKIETY_JEDNOSTEK_PROGU_PL
from enm.nazwy_elementow import nazwa_elementu
from enm.tor_pola import szyna_raportowa
from network_model.core.branch import TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.switch import SwitchState, SwitchType
from network_model.core.topologia import skladowe_spojne
from network_model.odmowa_danych import odmowa_rdzenia_b01
from network_model.pochodne import prad_pierwotny_z_wtornego_a, prad_wtorny_z_pierwotnego_a
from network_model.solvers.protection_iec60255 import (
    IEC60255_CURVE_FORMULAS_LATEX,
    IEC60255_CURVE_PARAMS,
    IEC60255CurveType,
    compute_curve_trip_time,
    compute_ieee_c37112_generic,
)
from protection.curves.ieee_curves import IEEECurveParams, IEEECurveType
from solver_input.provenance import classify_dynamic_capability
from werdykt import (
    Kryterium,
    LimitKryterium,
    Niepewnosc,
    OcenaKryterium,
    OdnosnikSladu,
    PodstawaWymagania,
    Przedmiot,
    StatusDanych,
    StatusDowodu,
    Stosowalnosc,
    Wielkosc,
    WynikKryterium,
    ZakresWaznosci,
    ocen_kryterium,
)

# ---------------------------------------------------------------------------
# Kody gotowości — każdy brak nazwany; akcja naprawcza wskazuje, co zrobić w modelu
# ---------------------------------------------------------------------------

KOD_BRAK_PRZEKLADNIKA = "zabezpieczenia.brak_przekladnika"
KOD_PRZEKLADNIK_NIE_PRADOWY = "zabezpieczenia.przekladnik_nie_pradowy"
KOD_PRZEKLADNIA_NIEPOPRAWNA = "zabezpieczenia.przekladnia_niepoprawna"
KOD_BRAK_POZYCJI_KATALOGU = "zabezpieczenia.brak_pozycji_katalogu"
KOD_KATALOG_BEZ_ZAKRESOW = "zabezpieczenia.katalog_bez_zakresow_nastaw"
KOD_JEDNOSTKA_ZAKRESU_NIEUSTALONA = "zabezpieczenia.jednostka_zakresu_nieustalona"
KOD_WEJSCIE_NIEZGODNE = "zabezpieczenia.wejscie_przekaznika_niezgodne"
KOD_BRAK_PROGU = "zabezpieczenia.brak_progu"
KOD_JEDNOSTKA_PROGU_NIEUSTALONA = "zabezpieczenia.jednostka_progu_nieustalona"
KOD_BRAK_CHARAKTERYSTYKI = "zabezpieczenia.brak_charakterystyki"
KOD_BRAK_ZWLOKI = "zabezpieczenia.brak_zwloki"
KOD_BRAK_MNOZNIKA = "zabezpieczenia.brak_mnoznika_czasowego"
KOD_CHARAKTERYSTYKA_SPOZA_KATALOGU = "zabezpieczenia.charakterystyka_spoza_katalogu"
KOD_FUNKCJA_SPOZA_KATALOGU = "zabezpieczenia.funkcja_spoza_katalogu"
KOD_PROG_POZA_ZAKRESEM = "zabezpieczenia.prog_poza_zakresem"
KOD_MNOZNIK_POZA_ZAKRESEM = "zabezpieczenia.mnoznik_poza_zakresem"
KOD_ZWLOKA_POZA_ZAKRESEM = "zabezpieczenia.zwloka_poza_zakresem"
KOD_BRAK_STOPNI = "zabezpieczenia.brak_stopni_nadpradowych"
KOD_APARAT_NIEOBECNY = "zabezpieczenia.aparat_nieobecny_w_biegu"
KOD_APARAT_NIE_WYLACZA = "zabezpieczenia.aparat_nie_wylacza_zwarc"
KOD_APARAT_OTWARTY = "zabezpieczenia.aparat_otwarty"
KOD_APARAT_POZA_TOREM = "zabezpieczenia.aparat_poza_torem_pradowym"
KOD_STREFA_NIEJEDNOZNACZNA = "zabezpieczenia.strefa_niejednoznaczna"
KOD_APARAT_BEZ_ZASILANIA = "zabezpieczenia.aparat_bez_zasilania"
KOD_STRONA_DOLNA_TRANSFORMATORA = "zabezpieczenia.prad_strony_dolnej_transformatora"
KOD_BRAK_ROZPLYWU = "zabezpieczenia.brak_rozplywu_zwarciowego"
KOD_PRAD_NIELICZBOWY = "zabezpieczenia.prad_zwarciowy_nieliczbowy"
KOD_BRAK_PUNKTOW_W_STREFIE = "zabezpieczenia.brak_punktow_zwarcia_w_strefie"

#: Przyczyny pominięcia urządzenia (nie odmowa: ocena nadprądowa go nie dotyczy).
POMINIETE_WYLACZONE = "zabezpieczenia.urzadzenie_wylaczone_z_ruchu"
POMINIETE_BEZ_FUNKCJI_NADPRADOWYCH = "zabezpieczenia.brak_funkcji_nadpradowych"

#: Stan wiarygodności wyniku punktu (czy przekładnik odwzorowuje prąd przekaźnikowi).
WIARYGODNY = "WIARYGODNY"
NIEWIARYGODNY = "NIEWIARYGODNY"
WIARYGODNOSC_NIEUSTALONA = "NIEUSTALONA"

#: Funkcje nadprądowe fazowe, które ta ścieżka ocenia. Stopień 50 (I>>) i 51 (I>) są
#: niezależne: wyłącznik otwiera ten, który zadziała pierwszy (IEC 60255-151, stopnie
#: działają równolegle), więc czas urządzenia = najkrótszy czas stopni, które ruszyły.
FUNKCJE_OCENIANE: tuple[str, ...] = ("overcurrent_51", "overcurrent_50")

#: Funkcje, których ta ścieżka NIE ocenia — z nazwanym powodem (jawnie, nie cicho).
#: Funkcja ziemnozwarciowa widzi 3·I0 w torze składowej zerowej, a rozpływ biegu SC niesie
#: rozkład składowej zgodnej; kierunkowa wymaga kierunku mocy zwarciowej, którego bieg nie
#: wyznacza. Odpowiedź na oba to osobny tor (rozpływ składowej zerowej, kierunek).
FUNKCJE_NIEOCENIANE: dict[str, str] = {
    "earth_fault_50N": (
        "Funkcja ziemnozwarciowa 50N widzi prąd 3·I0 toru składowej zerowej, a rozpływ biegu "
        "zwarciowego niesie rozkład składowej zgodnej — ta ocena jej nie obejmuje."
    ),
    "earth_fault_51N": (
        "Funkcja ziemnozwarciowa 51N widzi prąd 3·I0 toru składowej zerowej, a rozpływ biegu "
        "zwarciowego niesie rozkład składowej zgodnej — ta ocena jej nie obejmuje."
    ),
    "directional_67": (
        "Funkcja kierunkowa 67 wymaga kierunku mocy zwarciowej w miejscu przekaźnika, którego "
        "bieg zwarciowy nie wyznacza — ta ocena jej nie obejmuje."
    ),
    "directional_67N": (
        "Funkcja kierunkowa 67N wymaga kierunku i składowej zerowej — ta ocena jej nie obejmuje."
    ),
}

ETYKIETY_FUNKCJI_PL: dict[str, str] = {
    "overcurrent_51": "I> (51)",
    "overcurrent_50": "I>> (50)",
}

#: Krzywa modelu → kod krzywej w katalogu IED (``curves_supported``).
KRZYWA_W_KATALOGU: dict[str, str] = {
    "DT": "DT",
    "IEC_SI": "IEC_NI",
    "IEC_VI": "IEC_VI",
    "IEC_EI": "IEC_EI",
    "IEC_LI": "IEC_LTI",
    "IEEE_MI": "IEEE_MI",
    "IEEE_VI": "IEEE_VI",
    "IEEE_EI": "IEEE_EI",
}

#: Krzywa modelu → typ rdzenia IEC 60255 (dopasowanie po WZORZE — parze stałych A, B z
#: IEC 60255-151 tab. 1 — a nie po nazwie; IEC_LI ma stałe (120; 1), które rdzeń nazywa „RI").
KRZYWE_IEC: dict[str, IEC60255CurveType] = {
    "DT": IEC60255CurveType.DT,
    "IEC_SI": IEC60255CurveType.NI,
    "IEC_VI": IEC60255CurveType.VI,
    "IEC_EI": IEC60255CurveType.EI,
    "IEC_LI": IEC60255CurveType.RI,
}

#: Krzywa modelu → typ IEEE C37.112 (stałe A, B, p z ``IEEECurveParams`` — jedno źródło).
KRZYWE_IEEE: dict[str, IEEECurveType] = {
    "IEEE_MI": IEEECurveType.MODERATELY_INVERSE,
    "IEEE_VI": IEEECurveType.VERY_INVERSE,
    "IEEE_EI": IEEECurveType.EXTREMELY_INVERSE,
}

ETYKIETY_KRZYWYCH_PL: dict[str, str] = {
    "DT": "czas niezależny (DT)",
    "IEC_SI": "IEC normalnie odwrotna (NI)",
    "IEC_VI": "IEC bardzo odwrotna (VI)",
    "IEC_EI": "IEC skrajnie odwrotna (EI)",
    "IEC_LI": "IEC długozwłoczna (LTI)",
    "IEEE_MI": "IEEE umiarkowanie odwrotna (MI)",
    "IEEE_VI": "IEEE bardzo odwrotna (VI)",
    "IEEE_EI": "IEEE skrajnie odwrotna (EI)",
}

#: Aparaty, które PRZERYWAJĄ prąd zwarciowy — tylko one mogą być wykonawcą zabezpieczenia.
_APARATY_WYLACZAJACE = frozenset({SwitchType.BREAKER, SwitchType.RECLOSER})

#: Klasa zabezpieczeniowa przekładnika wg IEC 61869-2 (5P20, 10P10, 5PR20...): liczba po P
#: (albo PR) to współczynnik granicy dokładności ALF.
_KLASA_ZABEZPIECZENIOWA = re.compile(r"^\s*(5|10)\s*P\s*R?\s*(\d+(?:[.,]\d+)?)\s*$", re.IGNORECASE)

#: Zdolność w rejestrze dowodowym (``solver_input.provenance``).
ZDOLNOSC_OCENY = "zabezpieczenia.ocena_nadpradowa"


# ---------------------------------------------------------------------------
# Struktury wyniku
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PozycjaGotowosci:
    """Nazwany brak wstrzymujący ocenę urządzenia — kod, zdanie i akcja naprawcza."""

    kod: str
    komunikat_pl: str
    akcja_naprawcza_pl: str
    funkcja: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "kod": self.kod,
            "komunikat_pl": self.komunikat_pl,
            "akcja_naprawcza_pl": self.akcja_naprawcza_pl,
            "funkcja": self.funkcja,
        }


@dataclass(frozen=True)
class StopienNastaw:
    """Rozwiązany stopień nadprądowy: wartości z modelu + wielkości wyprowadzone + ślad."""

    funkcja: str
    krzywa: str
    wartosc_progu: float
    jednostka_progu: str
    prog_wtorny_a: float
    prog_pierwotny_a: float
    tms: float | None
    zwloka_s: float | None
    slad: dict[str, Any]

    @property
    def etykieta_pl(self) -> str:
        return ETYKIETY_FUNKCJI_PL[self.funkcja]

    def to_dict(self) -> dict[str, Any]:
        return {
            "funkcja": self.funkcja,
            "etykieta_pl": self.etykieta_pl,
            "krzywa": self.krzywa,
            "krzywa_pl": ETYKIETY_KRZYWYCH_PL[self.krzywa],
            "wartosc_progu": self.wartosc_progu,
            "jednostka_progu": self.jednostka_progu,
            "prog_wtorny_a": self.prog_wtorny_a,
            "prog_pierwotny_a": self.prog_pierwotny_a,
            "tms": self.tms,
            "zwloka_s": self.zwloka_s,
            "slad": self.slad,
        }


@dataclass(frozen=True)
class NastawyUrzadzenia:
    """Nastawy urządzenia z modelu po rozwiązaniu — albo nazwane braki, które je blokują."""

    urzadzenie_ref: str
    nazwa_pl: str
    breaker_ref: str
    ct_ref: str | None
    przekladnia_a: tuple[float, float] | None
    klasa_ct: str | None
    alf: float | None
    pozycja_katalogu: str | None
    zakresy: dict[str, Any] | None
    stopnie: tuple[StopienNastaw, ...]
    braki: tuple[PozycjaGotowosci, ...]
    funkcje_nieoceniane: tuple[dict[str, str], ...]

    @property
    def gotowe(self) -> bool:
        return not self.braki and bool(self.stopnie)

    def to_dict(self) -> dict[str, Any]:
        return {
            "urzadzenie_ref": self.urzadzenie_ref,
            "nazwa_pl": self.nazwa_pl,
            "breaker_ref": self.breaker_ref,
            "ct_ref": self.ct_ref,
            "przekladnia_a": list(self.przekladnia_a) if self.przekladnia_a else None,
            "klasa_ct": self.klasa_ct,
            "alf": self.alf,
            "pozycja_katalogu": self.pozycja_katalogu,
            "zakresy": self.zakresy,
            "stopnie": [s.to_dict() for s in self.stopnie],
            "braki": [b.to_dict() for b in self.braki],
            "funkcje_nieoceniane": list(self.funkcje_nieoceniane),
            "gotowe": self.gotowe,
        }


@dataclass(frozen=True)
class StrefaUrzadzenia:
    """Strefa urządzenia: węzły po stronie wyłącznika odległej od zasilania sieciowego."""

    wezly: frozenset[str]
    klaster_zacisku: frozenset[str]
    wezel_zacisku: str

    def to_dict(self, nazwy: Mapping[str, str]) -> dict[str, Any]:
        return {
            "wezly_strefy": sorted(self.wezly),
            "wezly_strefy_nazwy_pl": [nazwy[w] for w in sorted(self.wezly)],
            "klaster_zacisku": sorted(self.klaster_zacisku),
            "wezel_zacisku": self.wezel_zacisku,
        }


@dataclass(frozen=True)
class OcenaPunktu:
    """Ocena urządzenia przy zwarciu w jednym punkcie jego strefy (White Box + werdykt)."""

    urzadzenie_ref: str
    nazwa_urzadzenia_pl: str
    breaker_ref: str
    punkt_ref: str
    nazwa_punktu_pl: str
    prad_przekaznika_a: float
    stopien_decydujacy: str | None
    prog_decydujacy_a: float
    krzywa_decydujaca: str | None
    t_zadzialania_s: float | None
    zadziala: bool
    krotnosc_m: float
    margines_procent: float | None
    wiarygodnosc: str
    wiarygodnosc_powod_pl: str
    stopnie: tuple[dict[str, Any], ...]
    bilans_pradu: dict[str, Any]
    ocena: OcenaKryterium

    def to_dict(self) -> dict[str, Any]:
        return {
            "urzadzenie_ref": self.urzadzenie_ref,
            "nazwa_urzadzenia_pl": self.nazwa_urzadzenia_pl,
            "breaker_ref": self.breaker_ref,
            "punkt_ref": self.punkt_ref,
            "nazwa_punktu_pl": self.nazwa_punktu_pl,
            "prad_przekaznika_a": self.prad_przekaznika_a,
            "stopien_decydujacy": self.stopien_decydujacy,
            "prog_decydujacy_a": self.prog_decydujacy_a,
            "krzywa_decydujaca": self.krzywa_decydujaca,
            "t_zadzialania_s": self.t_zadzialania_s,
            "zadziala": self.zadziala,
            "krotnosc_m": self.krotnosc_m,
            "margines_procent": self.margines_procent,
            "wiarygodnosc": self.wiarygodnosc,
            "wiarygodnosc_powod_pl": self.wiarygodnosc_powod_pl,
            "stopnie": list(self.stopnie),
            "bilans_pradu": self.bilans_pradu,
            "ocena": self.ocena.model_dump(mode="json"),
        }


@dataclass(frozen=True)
class OdmowaUrzadzenia:
    """Urządzenie, którego ocena jest wstrzymana — z nazwanymi brakami i akcjami naprawczymi."""

    urzadzenie_ref: str
    nazwa_pl: str
    breaker_ref: str
    braki: tuple[PozycjaGotowosci, ...]
    ocena: OcenaKryterium
    kandydaci_naprawy: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "urzadzenie_ref": self.urzadzenie_ref,
            "nazwa_pl": self.nazwa_pl,
            "breaker_ref": self.breaker_ref,
            "braki": [b.to_dict() for b in self.braki],
            "kandydaci_naprawy": list(self.kandydaci_naprawy),
            "ocena": self.ocena.model_dump(mode="json"),
        }


@dataclass(frozen=True)
class PominieteUrzadzenie:
    """Urządzenie, którego ocena nadprądowa nie dotyczy (z przyczyną)."""

    urzadzenie_ref: str
    nazwa_pl: str
    kod: str
    powod_pl: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "urzadzenie_ref": self.urzadzenie_ref,
            "nazwa_pl": self.nazwa_pl,
            "kod": self.kod,
            "powod_pl": self.powod_pl,
        }


@dataclass(frozen=True)
class WynikOceny:
    """Wynik jednej ścieżki: oceny punktów, odmowy, pominięcia i ślad White Box."""

    oceny: tuple[OcenaPunktu, ...]
    odmowy: tuple[OdmowaUrzadzenia, ...]
    pominiete: tuple[PominieteUrzadzenie, ...]
    nastawy: tuple[NastawyUrzadzenia, ...]
    strefy: dict[str, dict[str, Any]] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# 1. Nastawy z modelu
# ---------------------------------------------------------------------------


def alf_z_klasy(klasa: str | None) -> float | None:
    """Współczynnik granicy dokładności ALF z klasy zabezpieczeniowej CT (IEC 61869-2).

    ``5P20`` → 20, ``10P10`` → 10, ``5PR20`` → 20. Klasa pomiarowa (``0.5``, ``0.2S``) albo brak
    klasy → ``None``: granica odwzorowania prądu zwarciowego jest nieustalona.
    """
    if not klasa:
        return None
    dopasowanie = _KLASA_ZABEZPIECZENIOWA.match(klasa)
    if dopasowanie is None:
        return None
    return float(dopasowanie.group(2).replace(",", "."))


def _przekladnik(
    enm: EnergyNetworkModel, assignment: ProtectionAssignment
) -> tuple[Measurement | None, list[PozycjaGotowosci]]:
    nazwa = nazwa_elementu(assignment, "protection_assignments")
    if not assignment.ct_ref:
        return None, [
            PozycjaGotowosci(
                kod=KOD_BRAK_PRZEKLADNIKA,
                komunikat_pl=(
                    f"Zabezpieczenie {nazwa} nie ma przypisanego przekładnika prądowego — "
                    "prąd rozruchowy po stronie pierwotnej jest niewyznaczalny."
                ),
                akcja_naprawcza_pl=(
                    "Dodaj przekładnik prądowy w polu zabezpieczenia i przypisz go do "
                    "zabezpieczenia (karta pola → Zabezpieczenia)."
                ),
            )
        ]
    ct = next((m for m in enm.measurements if m.ref_id == assignment.ct_ref), None)
    if ct is None or ct.measurement_type != "CT":
        return None, [
            PozycjaGotowosci(
                kod=KOD_PRZEKLADNIK_NIE_PRADOWY,
                komunikat_pl=(
                    f"Przekładnik przypisany do zabezpieczenia {nazwa} nie jest przekładnikiem "
                    "prądowym tego modelu."
                ),
                akcja_naprawcza_pl="Wskaż w zabezpieczeniu przekładnik prądowy pola.",
            )
        ]
    if ct.rating.ratio_primary <= 0 or ct.rating.ratio_secondary <= 0:
        return ct, [
            PozycjaGotowosci(
                kod=KOD_PRZEKLADNIA_NIEPOPRAWNA,
                komunikat_pl=(
                    f"Przekładnik {nazwa_elementu(ct, 'measurements')} ma niedodatnią przekładnię "
                    "— przeliczenie nastawy na stronę pierwotną jest niemożliwe."
                ),
                akcja_naprawcza_pl="Wybierz przekładnik z katalogu o właściwej przekładni.",
            )
        ]
    return ct, []


def _zdolnosc_katalogu(
    enm: EnergyNetworkModel, assignment: ProtectionAssignment
) -> tuple[DeviceCapability | None, list[PozycjaGotowosci]]:
    nazwa = nazwa_elementu(assignment, "protection_assignments")
    if not assignment.catalog_ref:
        return None, [
            PozycjaGotowosci(
                kod=KOD_BRAK_POZYCJI_KATALOGU,
                komunikat_pl=(
                    f"Zabezpieczenie {nazwa} nie ma pozycji katalogowej — zakres nastaw "
                    "przekaźnika jest nieznany, więc nastaw nie da się sprawdzić."
                ),
                akcja_naprawcza_pl="Wskaż typ przekaźnika z katalogu zabezpieczeń.",
            )
        ]
    # JEDEN RESOLVER katalogu (`enm.katalog_projektu`): katalog statyczny + pozycje projektu
    # niesione przez model — ten sam, którym operacje zapisu sprawdzają `catalog_ref`.
    typ = katalog_dla_modelu(enm).get_protection_device_type(assignment.catalog_ref)
    ref_analityczny = typ.analytical_library_ref if typ is not None else None
    zdolnosc = load_device_capability(ref_analityczny) if ref_analityczny else None
    if zdolnosc is None:
        return None, [
            PozycjaGotowosci(
                kod=KOD_KATALOG_BEZ_ZAKRESOW,
                komunikat_pl=(
                    f"Pozycja katalogowa zabezpieczenia {nazwa} nie niesie zakresów nastaw "
                    "(brak powiązania z katalogiem analitycznym urządzeń)."
                ),
                akcja_naprawcza_pl=(
                    "Wybierz typ przekaźnika, którego pozycja katalogowa ma zakresy nastaw."
                ),
            )
        ]
    if zdolnosc.jednostka_zakresow_pradowych is None:
        return zdolnosc, [
            PozycjaGotowosci(
                kod=KOD_JEDNOSTKA_ZAKRESU_NIEUSTALONA,
                komunikat_pl=(
                    f"Zakresy nastaw prądowych pozycji katalogu „{zdolnosc.model}” nie mają "
                    "ustalonej jednostki ani podstawy (karta producenta) — nie są używane do "
                    "oceny."
                ),
                akcja_naprawcza_pl=(
                    "Wybierz typ przekaźnika z zakresami potwierdzonymi kartą producenta albo "
                    "profilem referencyjnym."
                ),
            )
        ]
    return zdolnosc, []


def _kod_funkcji(funkcja: str) -> str:
    return "51" if funkcja == "overcurrent_51" else "50"


def progi_stopnia(
    nastawa: ProtectionSetting, ct: Measurement | None
) -> tuple[float, float, str] | None:
    """(próg wtórny [A], próg pierwotny [A], wzór przeliczenia LaTeX) — JEDNO przeliczenie.

    Próg z modelu jest podany po stronie zadeklarowanej w ``threshold_unit`` (PZ-09); druga
    strona wynika z przekładni przekładnika pola. Brak progu, jednostki albo przekładni
    przekładnika prądowego → ``None`` (wołający nazywa brak — ocena, czasy wyłączenia,
    widok nastaw pola czytają to samo przeliczenie).
    """
    if nastawa.threshold_a is None or nastawa.threshold_a <= 0 or nastawa.threshold_unit is None:
        return None
    if ct is None or ct.measurement_type != "CT":
        return None
    i1n = ct.rating.ratio_primary
    i2n = ct.rating.ratio_secondary
    if i1n <= 0 or i2n <= 0:
        return None
    if nastawa.threshold_unit == "A_WTORNY":
        return (
            nastawa.threshold_a,
            prad_pierwotny_z_wtornego_a(nastawa.threshold_a, i1n, i2n),
            r"I_{s,1} = I_{s,2} \cdot \frac{I_{1n}}{I_{2n}}",
        )
    return (
        prad_wtorny_z_pierwotnego_a(nastawa.threshold_a, i1n, i2n),
        nastawa.threshold_a,
        r"I_{s,2} = I_{s,1} \cdot \frac{I_{2n}}{I_{1n}}",
    )


def _rozwiaz_stopien(
    *,
    nastawa: ProtectionSetting,
    nazwa: str,
    ct: Measurement,
    zdolnosc: DeviceCapability,
) -> tuple[StopienNastaw | None, list[PozycjaGotowosci]]:
    """Jeden stopień 50/51: kompletność, przeliczenie na stronę pierwotną, zakresy katalogu."""
    funkcja = nastawa.function_type
    etykieta = ETYKIETY_FUNKCJI_PL[funkcja]
    braki: list[PozycjaGotowosci] = []

    def brak(kod: str, komunikat: str, akcja: str) -> None:
        braki.append(
            PozycjaGotowosci(
                kod=kod, komunikat_pl=komunikat, akcja_naprawcza_pl=akcja, funkcja=funkcja
            )
        )

    akcja_nastaw = f"Uzupełnij nastawy stopnia {etykieta} zabezpieczenia {nazwa} w karcie pola."
    if nastawa.threshold_a is None or nastawa.threshold_a <= 0:
        brak(
            KOD_BRAK_PROGU,
            f"Stopień {etykieta} zabezpieczenia {nazwa} nie ma dodatniego progu rozruchowego.",
            akcja_nastaw,
        )
    if nastawa.threshold_unit is None:
        brak(
            KOD_JEDNOSTKA_PROGU_NIEUSTALONA,
            f"Próg stopnia {etykieta} zabezpieczenia {nazwa} nie ma zadeklarowanej jednostki "
            "(strona wtórna albo pierwotna przekładnika).",
            akcja_nastaw,
        )
    if nastawa.curve_type is None:
        brak(
            KOD_BRAK_CHARAKTERYSTYKI,
            f"Stopień {etykieta} zabezpieczenia {nazwa} nie ma charakterystyki czasowej.",
            akcja_nastaw,
        )
    elif nastawa.curve_type == "DT":
        if nastawa.time_delay_s is None or nastawa.time_delay_s <= 0:
            brak(
                KOD_BRAK_ZWLOKI,
                f"Stopień {etykieta} zabezpieczenia {nazwa} (czas niezależny) nie ma dodatniej "
                "zwłoki — wpisz czas nastawiony przekaźnika.",
                akcja_nastaw,
            )
    elif nastawa.time_multiplier is None or nastawa.time_multiplier <= 0:
        brak(
            KOD_BRAK_MNOZNIKA,
            f"Stopień {etykieta} zabezpieczenia {nazwa} (charakterystyka zależna) nie ma "
            "dodatniego mnożnika czasowego.",
            akcja_nastaw,
        )
    if braki:
        return None, braki

    assert nastawa.threshold_a is not None and nastawa.threshold_unit is not None
    assert nastawa.curve_type is not None
    i1n = ct.rating.ratio_primary
    i2n = ct.rating.ratio_secondary
    progi = progi_stopnia(nastawa, ct)
    assert progi is not None
    prog_wtorny, prog_pierwotny, wzor = progi

    kod = _kod_funkcji(funkcja)
    if kod not in zdolnosc.functions_supported:
        brak(
            KOD_FUNKCJA_SPOZA_KATALOGU,
            f"Przekaźnik „{zdolnosc.model}” nie ma funkcji {kod} według katalogu.",
            f"Usuń stopień {etykieta} albo wybierz przekaźnik z funkcją {kod}.",
        )
    krzywa_katalogu = KRZYWA_W_KATALOGU[nastawa.curve_type]
    if krzywa_katalogu not in zdolnosc.curves_supported:
        brak(
            KOD_CHARAKTERYSTYKA_SPOZA_KATALOGU,
            f"Przekaźnik „{zdolnosc.model}” nie ma charakterystyki "
            f"{ETYKIETY_KRZYWYCH_PL[nastawa.curve_type]} według katalogu.",
            f"Wybierz dla stopnia {etykieta} charakterystykę dostępną w przekaźniku.",
        )

    # Zakres prądowy katalogu jest cechą STRONY WTÓRNEJ (PZ-09): ×In albo A wtórne — jedna
    # funkcja porównania dla oceny z modelu i doboru aparatu (`catalog.zakresy`).
    minimum, maksimum = zakres_pradowy(zdolnosc, _kod_funkcji(funkcja))
    wartosc_w_jednostce_zakresu, jednostka_zakresu_pl = wartosc_w_jednostce_zakresu_katalogu(
        zdolnosc, prog_wtorny, i2n
    )
    if (
        zdolnosc.jednostka_zakresow_pradowych == JEDNOSTKA_ZAKRESU_KROTNOSC_IN
        and i2n not in zdolnosc.rated_current_inputs_a
    ):
        brak(
            KOD_WEJSCIE_NIEZGODNE,
            f"Prąd znamionowy wtórny przekładnika ({_liczba(i2n)} A) nie jest prądem "
            f"znamionowym wejścia przekaźnika „{zdolnosc.model}” "
            f"({', '.join(_liczba(v) for v in zdolnosc.rated_current_inputs_a)} A).",
            "Wybierz przekładnik o prądzie wtórnym zgodnym z wejściem przekaźnika.",
        )
    if not w_zakresie(wartosc_w_jednostce_zakresu, minimum, maksimum):
        brak(
            KOD_PROG_POZA_ZAKRESEM,
            f"Próg stopnia {etykieta} zabezpieczenia {nazwa} po stronie wtórnej wynosi "
            f"{_liczba(wartosc_w_jednostce_zakresu)} {jednostka_zakresu_pl}, poza zakresem "
            f"przekaźnika {_liczba(minimum)}–{_liczba(maksimum)} {jednostka_zakresu_pl}.",
            f"Popraw próg stopnia {etykieta} albo przekładnię przekładnika pola.",
        )
    sprawdzenia: list[dict[str, Any]] = [
        {
            "wielkosc_pl": f"próg {etykieta} po stronie wtórnej",
            "wartosc": wartosc_w_jednostce_zakresu,
            "jednostka": jednostka_zakresu_pl,
            "minimum": minimum,
            "maksimum": maksimum,
            "w_zakresie": w_zakresie(wartosc_w_jednostce_zakresu, minimum, maksimum),
            "podstawa_pl": zdolnosc.podstawa_zakresow_pl,
        }
    ]
    if nastawa.curve_type == "DT":
        zwloka = nastawa.time_delay_s
        assert zwloka is not None
        if zdolnosc.t_51_s_min is not None and zdolnosc.t_51_s_max is not None:
            czas_w_zakresie = w_zakresie(zwloka, zdolnosc.t_51_s_min, zdolnosc.t_51_s_max)
            sprawdzenia.append(
                {
                    "wielkosc_pl": f"zwłoka {etykieta}",
                    "wartosc": zwloka,
                    "jednostka": "s",
                    "minimum": zdolnosc.t_51_s_min,
                    "maksimum": zdolnosc.t_51_s_max,
                    "w_zakresie": czas_w_zakresie,
                    "podstawa_pl": zdolnosc.podstawa_zakresow_pl,
                }
            )
            if not czas_w_zakresie:
                brak(
                    KOD_ZWLOKA_POZA_ZAKRESEM,
                    f"Zwłoka stopnia {etykieta} ({_liczba(zwloka)} s) jest poza zakresem "
                    f"przekaźnika {_liczba(zdolnosc.t_51_s_min)}–"
                    f"{_liczba(zdolnosc.t_51_s_max)} s.",
                    f"Popraw zwłokę stopnia {etykieta}.",
                )
    else:
        tms = nastawa.time_multiplier
        assert tms is not None
        czas_w_zakresie = w_zakresie(tms, zdolnosc.tms_51_min, zdolnosc.tms_51_max)
        sprawdzenia.append(
            {
                "wielkosc_pl": f"mnożnik czasowy {etykieta}",
                "wartosc": tms,
                "jednostka": "1",
                "minimum": zdolnosc.tms_51_min,
                "maksimum": zdolnosc.tms_51_max,
                "w_zakresie": czas_w_zakresie,
                "podstawa_pl": zdolnosc.podstawa_zakresow_pl,
            }
        )
        if not czas_w_zakresie:
            brak(
                KOD_MNOZNIK_POZA_ZAKRESEM,
                f"Mnożnik czasowy stopnia {etykieta} ({_liczba(tms)}) jest poza zakresem "
                f"przekaźnika {_liczba(zdolnosc.tms_51_min)}–{_liczba(zdolnosc.tms_51_max)}.",
                f"Popraw mnożnik czasowy stopnia {etykieta}.",
            )
    if braki:
        return None, braki

    return (
        StopienNastaw(
            funkcja=funkcja,
            krzywa=nastawa.curve_type,
            wartosc_progu=nastawa.threshold_a,
            jednostka_progu=nastawa.threshold_unit,
            prog_wtorny_a=prog_wtorny,
            prog_pierwotny_a=prog_pierwotny,
            tms=nastawa.time_multiplier if nastawa.curve_type != "DT" else None,
            zwloka_s=nastawa.time_delay_s if nastawa.curve_type == "DT" else None,
            slad={
                "zrodlo_pl": (
                    f"nastawa stopnia {etykieta} zapisana w modelu przy zabezpieczeniu {nazwa}"
                ),
                "wartosc_w_modelu": nastawa.threshold_a,
                "jednostka_w_modelu": nastawa.threshold_unit,
                "przekladnia_a": [i1n, i2n],
                "przeliczenie_latex": wzor,
                "prog_wtorny_a": prog_wtorny,
                "prog_pierwotny_a": prog_pierwotny,
                "sprawdzenia_zakresu": sprawdzenia,
            },
        ),
        [],
    )


def rozwiaz_nastawy(enm: EnergyNetworkModel, assignment: ProtectionAssignment) -> NastawyUrzadzenia:
    """Nastawy urządzenia z modelu — JEDYNE rozwiązanie (ocena, czasy wyłączenia, edytor).

    Stopień nadprądowy obecny na liście nastaw musi być kompletny: próg z jednostką,
    charakterystyka, zwłoka (DT) albo mnożnik (zależna). Stopnia wyłączonego nie ma na liście.
    """
    nazwa = nazwa_elementu(assignment, "protection_assignments")
    braki: list[PozycjaGotowosci] = []
    ct, braki_ct = _przekladnik(enm, assignment)
    braki.extend(braki_ct)
    zdolnosc, braki_katalogu = _zdolnosc_katalogu(enm, assignment)
    braki.extend(braki_katalogu)

    nieoceniane = tuple(
        {"funkcja": n.function_type, "powod_pl": FUNKCJE_NIEOCENIANE[n.function_type]}
        for n in assignment.settings
        if n.function_type in FUNKCJE_NIEOCENIANE
    )
    nastawy_oc = [n for n in assignment.settings if n.function_type in FUNKCJE_OCENIANE]
    stopnie: list[StopienNastaw] = []
    if not nastawy_oc:
        braki.append(
            PozycjaGotowosci(
                kod=KOD_BRAK_STOPNI,
                komunikat_pl=(
                    f"Zabezpieczenie {nazwa} nie ma nastaw stopni nadprądowych I> (51) ani "
                    "I>> (50)."
                ),
                akcja_naprawcza_pl=f"Wpisz nastawy stopni nadprądowych zabezpieczenia {nazwa}.",
            )
        )
    for nastawa in sorted(nastawy_oc, key=lambda n: n.function_type, reverse=True):
        if ct is None or braki_ct or zdolnosc is None or braki_katalogu:
            # Bez przekładnika i zakresów katalogu stopień i tak zgłasza braki kompletności —
            # projektant widzi komplet tego, czego brakuje, nie tylko pierwszą przeszkodę.
            braki.extend(_braki_kompletnosci(nastawa, nazwa))
            continue
        stopien, braki_stopnia = _rozwiaz_stopien(
            nastawa=nastawa, nazwa=nazwa, ct=ct, zdolnosc=zdolnosc
        )
        braki.extend(braki_stopnia)
        if stopien is not None:
            stopnie.append(stopien)

    klasa = ct.rating.accuracy_class if ct is not None else None
    return NastawyUrzadzenia(
        urzadzenie_ref=assignment.ref_id,
        nazwa_pl=nazwa,
        breaker_ref=assignment.breaker_ref,
        ct_ref=assignment.ct_ref,
        przekladnia_a=(
            (ct.rating.ratio_primary, ct.rating.ratio_secondary)
            if ct is not None and not braki_ct
            else None
        ),
        klasa_ct=klasa,
        alf=alf_z_klasy(klasa),
        pozycja_katalogu=assignment.catalog_ref,
        zakresy=_zakresy_katalogu(zdolnosc) if zdolnosc is not None else None,
        stopnie=tuple(stopnie),
        braki=tuple(braki),
        funkcje_nieoceniane=nieoceniane,
    )


def _braki_kompletnosci(nastawa: ProtectionSetting, nazwa: str) -> list[PozycjaGotowosci]:
    """Braki kompletności stopnia niezależne od przekładnika i katalogu."""
    etykieta = ETYKIETY_FUNKCJI_PL[nastawa.function_type]
    akcja = f"Uzupełnij nastawy stopnia {etykieta} zabezpieczenia {nazwa} w karcie pola."
    wynik: list[PozycjaGotowosci] = []
    if nastawa.threshold_a is None or nastawa.threshold_a <= 0:
        wynik.append(
            PozycjaGotowosci(
                kod=KOD_BRAK_PROGU,
                komunikat_pl=(
                    f"Stopień {etykieta} zabezpieczenia {nazwa} nie ma dodatniego progu "
                    "rozruchowego."
                ),
                akcja_naprawcza_pl=akcja,
                funkcja=nastawa.function_type,
            )
        )
    if nastawa.threshold_unit is None:
        wynik.append(
            PozycjaGotowosci(
                kod=KOD_JEDNOSTKA_PROGU_NIEUSTALONA,
                komunikat_pl=(
                    f"Próg stopnia {etykieta} zabezpieczenia {nazwa} nie ma zadeklarowanej "
                    "jednostki (strona wtórna albo pierwotna przekładnika)."
                ),
                akcja_naprawcza_pl=akcja,
                funkcja=nastawa.function_type,
            )
        )
    if nastawa.curve_type is None:
        wynik.append(
            PozycjaGotowosci(
                kod=KOD_BRAK_CHARAKTERYSTYKI,
                komunikat_pl=(
                    f"Stopień {etykieta} zabezpieczenia {nazwa} nie ma charakterystyki czasowej."
                ),
                akcja_naprawcza_pl=akcja,
                funkcja=nastawa.function_type,
            )
        )
    return wynik


def _zakresy_katalogu(zdolnosc: DeviceCapability) -> dict[str, Any]:
    """Zakresy nastaw pozycji katalogu z jednostką i podstawą — dla edytora i śladu."""
    jednostka = zdolnosc.jednostka_zakresow_pradowych
    return {
        "pozycja": zdolnosc.device_id,
        "model": zdolnosc.model,
        "jednostka_zakresow_pradowych": jednostka,
        "podstawa_pl": zdolnosc.podstawa_zakresow_pl,
        "wejscia_pradowe_a": list(zdolnosc.rated_current_inputs_a),
        "funkcje": list(zdolnosc.functions_supported),
        "krzywe": list(zdolnosc.curves_supported),
        # Charakterystyki MODELU dostępne w tej pozycji (odwzorowanie nazw modelu na kody
        # katalogu — jedno miejsce, `KRZYWA_W_KATALOGU`); edytor nastaw nie mapuje nazw sam.
        "charakterystyki": [
            {"kod": kod, "etykieta_pl": ETYKIETY_KRZYWYCH_PL[kod]}
            for kod, kod_katalogu in KRZYWA_W_KATALOGU.items()
            if kod_katalogu in zdolnosc.curves_supported
        ],
        "overcurrent_51": {
            "prog": [zdolnosc.i_pickup_51_a_min, zdolnosc.i_pickup_51_a_max],
            "mnoznik": [zdolnosc.tms_51_min, zdolnosc.tms_51_max],
            "zwloka_s": (
                [zdolnosc.t_51_s_min, zdolnosc.t_51_s_max]
                if zdolnosc.t_51_s_min is not None and zdolnosc.t_51_s_max is not None
                else None
            ),
        },
        "overcurrent_50": {
            "prog": [zdolnosc.i_inst_50_a_min, zdolnosc.i_inst_50_a_max],
            "zwloka_s": (
                [zdolnosc.t_51_s_min, zdolnosc.t_51_s_max]
                if zdolnosc.t_51_s_min is not None and zdolnosc.t_51_s_max is not None
                else None
            ),
        },
    }


def slownik_nastaw() -> dict[str, Any]:
    """Słownik edytora nastaw (etykiety po polsku) — funkcje oceniane, charakterystyki modelu
    i jednostki progu. Źródło list wyboru edytora dla urządzenia bez zakresów katalogu."""
    return {
        "funkcje": [
            {"kod": funkcja, "etykieta_pl": ETYKIETY_FUNKCJI_PL[funkcja]}
            for funkcja in FUNKCJE_OCENIANE
        ],
        "charakterystyki": [
            {"kod": kod, "etykieta_pl": etykieta} for kod, etykieta in ETYKIETY_KRZYWYCH_PL.items()
        ],
        "jednostki_progu": [
            {"kod": kod, "etykieta_pl": etykieta}
            for kod, etykieta in ETYKIETY_JEDNOSTEK_PROGU_PL.items()
        ],
    }


def urzadzenia_nadpradowe(
    enm: EnergyNetworkModel,
) -> tuple[list[ProtectionAssignment], list[PominieteUrzadzenie]]:
    """Przypisania objęte oceną nadprądową (po ``ref_id``) + pominięte z przyczyną.

    Oceną jest objęte urządzenie czynne z co najmniej jedną funkcją nadprądową fazową albo
    zadeklarowane jako nadprądowe (``device_type == "overcurrent"``) — to drugie bez nastaw
    to ODMOWA z nazwanym brakiem, nie pominięcie.
    """
    objete: list[ProtectionAssignment] = []
    pominiete: list[PominieteUrzadzenie] = []
    for assignment in sorted(enm.protection_assignments, key=lambda a: a.ref_id):
        nazwa = nazwa_elementu(assignment, "protection_assignments")
        ma_funkcje_oc = any(n.function_type in FUNKCJE_OCENIANE for n in assignment.settings)
        if not ma_funkcje_oc and assignment.device_type != "overcurrent":
            pominiete.append(
                PominieteUrzadzenie(
                    urzadzenie_ref=assignment.ref_id,
                    nazwa_pl=nazwa,
                    kod=POMINIETE_BEZ_FUNKCJI_NADPRADOWYCH,
                    powod_pl=(
                        f"Zabezpieczenie {nazwa} nie ma funkcji nadprądowych fazowych I>/I>> — "
                        "ocena nadprądowa go nie dotyczy."
                    ),
                )
            )
            continue
        if not assignment.is_enabled:
            pominiete.append(
                PominieteUrzadzenie(
                    urzadzenie_ref=assignment.ref_id,
                    nazwa_pl=nazwa,
                    kod=POMINIETE_WYLACZONE,
                    powod_pl=f"Zabezpieczenie {nazwa} jest wyłączone z ruchu w modelu.",
                )
            )
            continue
        objete.append(assignment)
    return objete, pominiete


# ---------------------------------------------------------------------------
# 2. Strefa urządzenia z topologii modelu
# ---------------------------------------------------------------------------


def _krawedzie_przewodzace(
    graph: NetworkGraph, *, bez_lacznika: str | None = None
) -> tuple[list[tuple[str, str]], list[tuple[str, str]]]:
    """(krawędzie gałęzi w służbie, krawędzie łączników zamkniętych) — posortowane."""
    galezie: list[tuple[str, str]] = []
    for branch_id in sorted(graph.branches):
        galaz = graph.branches[branch_id]
        if not galaz.in_service:
            continue
        galezie.append((galaz.from_node_id, galaz.to_node_id))
    laczniki: list[tuple[str, str]] = []
    for switch_id in sorted(graph.switches):
        if switch_id == bez_lacznika:
            continue
        lacznik = graph.switches[switch_id]
        if lacznik.state != SwitchState.CLOSED or not lacznik.in_service:
            continue
        laczniki.append((lacznik.from_node_id, lacznik.to_node_id))
    return galezie, laczniki


def _wezly_zasilania_sieciowego(graph: NetworkGraph) -> set[str]:
    """Węzły źródeł sieciowych (sieć nadrzędna) — wyznaczają kierunek zasilania."""
    return {zrodlo.node_id for zrodlo in graph.get_grid_sc_sources()}


def strefa_urzadzenia(
    graph: NetworkGraph, breaker_graph_id: str, *, nazwa_aparatu: str
) -> tuple[StrefaUrzadzenia | None, list[PozycjaGotowosci], tuple[str, ...]]:
    """Strefa urządzenia za wyłącznikiem albo nazwana odmowa (z kandydatami naprawy).

    REGUŁA: po usunięciu wyłącznika z grafu przewodzącego jedna jego strona zawiera
    zasilanie sieciowe (strona zasilania), druga nie — ta druga jest strefą. Obie strony z
    zasilaniem (pierścień zamknięty, zasilanie dwustronne) → niejednoznaczność: kierunku
    nie wolno zgadywać (P-04/P-05). Żadna → aparat bez zasilania.
    """
    lacznik = graph.switches.get(breaker_graph_id)
    if lacznik is None:
        return (
            None,
            [
                PozycjaGotowosci(
                    kod=KOD_APARAT_NIEOBECNY,
                    komunikat_pl=(
                        f"Wyłącznik {nazwa_aparatu} nie występuje w modelu biegu zwarciowego — "
                        "bieg policzono przed jego dodaniem albo aparat nie jest łącznikiem."
                    ),
                    akcja_naprawcza_pl="Uruchom ponownie obliczenie zwarciowe na bieżącym modelu.",
                )
            ],
            (),
        )
    if lacznik.switch_type not in _APARATY_WYLACZAJACE:
        return (
            None,
            [
                PozycjaGotowosci(
                    kod=KOD_APARAT_NIE_WYLACZA,
                    komunikat_pl=(
                        f"Aparat {nazwa_aparatu} nie jest wyłącznikiem ani reklozerem — nie "
                        "przerywa prądu zwarciowego, więc nie jest wykonawcą zabezpieczenia."
                    ),
                    akcja_naprawcza_pl="Przypisz zabezpieczenie do wyłącznika pola.",
                )
            ],
            (),
        )
    if lacznik.state != SwitchState.CLOSED:
        return (
            None,
            [
                PozycjaGotowosci(
                    kod=KOD_APARAT_OTWARTY,
                    komunikat_pl=(
                        f"Wyłącznik {nazwa_aparatu} jest otwarty w modelu — przez przekaźnik "
                        "nie płynie prąd zwarciowy."
                    ),
                    akcja_naprawcza_pl="Zamknij wyłącznik w modelu albo oceń inny stan pracy.",
                )
            ],
            (),
        )

    galezie, laczniki = _krawedzie_przewodzace(graph, bez_lacznika=breaker_graph_id)
    wezly = sorted(graph.nodes)
    skladowe = skladowe_spojne(wezly, [*galezie, *laczniki])
    indeks = {w: i for i, skladowa in enumerate(skladowe) for w in skladowa}
    strona_od = indeks[lacznik.from_node_id]
    strona_do = indeks[lacznik.to_node_id]
    zasilanie = _wezly_zasilania_sieciowego(graph)
    zasilane = {indeks[w] for w in zasilanie if w in indeks}
    if strona_od == strona_do:
        return (
            None,
            [
                PozycjaGotowosci(
                    kod=KOD_STREFA_NIEJEDNOZNACZNA,
                    komunikat_pl=(
                        f"Obie strony wyłącznika {nazwa_aparatu} łączy inna droga (pierścień "
                        "zamknięty albo obejście) — kierunek zasilania i strefa urządzenia są "
                        "niejednoznaczne, a zabezpieczenie bezkierunkowe nie ma strefy."
                    ),
                    akcja_naprawcza_pl=(
                        "Otwórz punkt podziału pierścienia albo zastosuj zabezpieczenie "
                        "kierunkowe ze wskazaniem kierunku."
                    ),
                )
            ],
            (
                "Otwórz łącznik punktu podziału pierścienia w modelu.",
                "Zastąp zabezpieczenie bezkierunkowe kierunkowym i wskaż kierunek strefy.",
            ),
        )
    od_zasilany = strona_od in zasilane
    do_zasilany = strona_do in zasilane
    if od_zasilany and do_zasilany:
        return (
            None,
            [
                PozycjaGotowosci(
                    kod=KOD_STREFA_NIEJEDNOZNACZNA,
                    komunikat_pl=(
                        f"Obie strony wyłącznika {nazwa_aparatu} mają zasilanie z sieci "
                        "nadrzędnej — strefa urządzenia jest niejednoznaczna."
                    ),
                    akcja_naprawcza_pl=(
                        "Rozdziel zasilanie (punkt podziału) albo zastosuj zabezpieczenie "
                        "kierunkowe ze wskazaniem kierunku."
                    ),
                )
            ],
            (
                "Otwórz łącznik rozdzielający dwa zasilania w modelu.",
                "Zastąp zabezpieczenie bezkierunkowe kierunkowym i wskaż kierunek strefy.",
            ),
        )
    if not od_zasilany and not do_zasilany:
        return (
            None,
            [
                PozycjaGotowosci(
                    kod=KOD_APARAT_BEZ_ZASILANIA,
                    komunikat_pl=(
                        f"Żadna strona wyłącznika {nazwa_aparatu} nie ma zasilania z sieci "
                        "nadrzędnej — przez przekaźnik nie płynie prąd zwarciowy sieci."
                    ),
                    akcja_naprawcza_pl="Połącz odcinek z wyłącznikiem z siecią zasilającą.",
                )
            ],
            (),
        )
    wezel_zacisku = lacznik.to_node_id if od_zasilany else lacznik.from_node_id
    strefa = frozenset(skladowe[strona_do if od_zasilany else strona_od])
    # Klaster zacisku: węzły osiągalne od zacisku za wyłącznikiem po zamkniętych łącznikach —
    # prąd wyłącznika to bilans gałęzi i zwarcia tego klastra (łączniki mają zerową impedancję).
    klaster_skladowe = skladowe_spojne(sorted(strefa), [k for k in laczniki if k[0] in strefa])
    klaster = next(frozenset(s) for s in klaster_skladowe if wezel_zacisku in s)
    ma_galaz = any(od in klaster or do in klaster for od, do in galezie)
    if not ma_galaz:
        return (
            None,
            [
                PozycjaGotowosci(
                    kod=KOD_APARAT_POZA_TOREM,
                    komunikat_pl=(
                        f"Za wyłącznikiem {nazwa_aparatu} nie ma żadnej gałęzi — aparat pola "
                        "leży poza torem prądowym elementu, któremu pole służy, więc "
                        "przekaźnik nie widzi prądu zwarciowego."
                    ),
                    akcja_naprawcza_pl=(
                        "Przyłącz element pola (odcinek, transformator) do zacisku pola za "
                        "wyłącznikiem."
                    ),
                )
            ],
            (),
        )
    return (
        StrefaUrzadzenia(wezly=strefa, klaster_zacisku=klaster, wezel_zacisku=wezel_zacisku),
        [],
        (),
    )


@dataclass(frozen=True)
class PunktZwarciaStrefy:
    """Punkt zwarcia strefy i wiersz wyniku SC, pod którym bieg raportuje ten węzeł."""

    punkt_ref: str
    punkt_wyniku_ref: str


def punkty_zwarcia_strefy(
    *,
    enm: EnergyNetworkModel,
    graph: NetworkGraph,
    strefa: StrefaUrzadzenia,
    punkty_wyniku: frozenset[str],
) -> tuple[list[PunktZwarciaStrefy], list[str]]:
    """Punkty zwarcia strefy na poziomie napięcia przekaźnika + punkty innego poziomu.

    JEDNO źródło punktów oceny urządzenia (karta POLA-W-TORZE): punktem jest
    (a) węzeł strefy, dla którego bieg SC ma wiersz z Ik'' (``punkty_wyniku``), oraz
    (b) ZACISK POLA za wyłącznikiem — szyna pomocnicza (``helper_bus``) strefy bez własnego
    wiersza, którą wynik raportuje pod szyną pola po STRONIE ZASILANIA
    (``enm.tor_pola.szyna_raportowa``: ten sam węzeł elektryczny za zamkniętym aparatem,
    ten sam Ik'' i ten sam rozpływ). To zwarcie tuż za przekładnikiem pola (głowica kabla
    odpływu) — punkt największego prądu przekaźnika, dla którego wynik nie ma własnego
    wiersza, bo szyna pomocnicza nie jest celem zwarcia (``enm/assembler.py``). Zacisk
    pomocniczy, którego szyna raportowa leży W strefie, jest tym samym punktem co ona
    (ten sam węzeł, ten sam bilans) i nie jest oceniany drugi raz.

    Zwraca ``(punkty poziomu przekaźnika, punkty z wynikiem na innym poziomie napięcia)``,
    oba posortowane po identyfikatorze węzła.
    """
    poziom = graph.nodes[strefa.wezel_zacisku].voltage_level
    punkty = [
        PunktZwarciaStrefy(punkt_ref=p, punkt_wyniku_ref=p)
        for p in sorted(punkty_wyniku)
        if p in strefa.wezly and graph.nodes[p].voltage_level == poziom
    ]
    innego_poziomu = sorted(
        p for p in punkty_wyniku if p in strefa.wezly and graph.nodes[p].voltage_level != poziom
    )
    migawka = enm.model_dump(mode="json")
    szyny_modelu = {ref_to_graph_id(szyna.ref_id): szyna.ref_id for szyna in enm.buses}
    for wezel in sorted(strefa.klaster_zacisku - punkty_wyniku):
        szyna_ref = szyny_modelu.get(wezel)
        if szyna_ref is None:
            continue
        wynik_ref = ref_to_graph_id(szyna_raportowa(migawka, szyna_ref))
        if wynik_ref == wezel or wynik_ref in strefa.wezly or wynik_ref not in punkty_wyniku:
            continue
        punkty.append(PunktZwarciaStrefy(punkt_ref=wezel, punkt_wyniku_ref=wynik_ref))
    return sorted(punkty, key=lambda p: p.punkt_ref), innego_poziomu


# ---------------------------------------------------------------------------
# 3. Prąd widziany przez przekaźnik
# ---------------------------------------------------------------------------


def prad_przekaznika(
    *,
    graph: NetworkGraph,
    strefa: StrefaUrzadzenia,
    punkt_ref: str,
    punkt_wyniku_ref: str | None = None,
    wklady_galezi: Sequence[Mapping[str, Any]],
    wklady_zrodel: Sequence[Mapping[str, Any]],
    ikss_punktu_a: float,
) -> tuple[float | None, dict[str, Any], PozycjaGotowosci | None]:
    """Prąd pierwotny płynący przez wyłącznik przy zwarciu w ``punkt_ref`` (bilans klastra).

    I_Q = Σ prądów wypływających z klastra gałęziami + Ik'' (gdy zwarcie w klastrze)
          − Σ wkładów źródeł przyłączonych w klastrze.
    Sumowanie netto wg kierunku (from_to +, to_from −) — ta sama reguła, którą czyta
    ``prad_zwarciowy_galezi``. Gałąź transformatora dotykająca klastra stroną ``to`` niesie w
    rozpływie prąd strony ``from`` — przeliczenie na drugą stronę to fizyka przekładni, więc
    jest to nazwana odmowa, nie domysł.

    ``punkt_wyniku_ref`` — węzeł, pod którym bieg raportuje zwarcie w ``punkt_ref`` (zacisk
    pola za wyłącznikiem: szyna pola, ``punkty_zwarcia_strefy``); Ik'' i wkłady pochodzą z
    TEGO wiersza, a przynależność zwarcia do klastra — z ``punkt_ref``.
    """
    if punkt_wyniku_ref is None:
        punkt_wyniku_ref = punkt_ref
    klaster = strefa.klaster_zacisku
    skladniki: list[dict[str, Any]] = []
    suma = 0.0
    for branch_id in sorted(graph.branches):
        galaz = graph.branches[branch_id]
        if not galaz.in_service:
            continue
        od_w = galaz.from_node_id in klaster
        do_w = galaz.to_node_id in klaster
        if od_w == do_w:
            continue
        if do_w and isinstance(galaz, TransformerBranch):
            return (
                None,
                {"skladniki": skladniki},
                PozycjaGotowosci(
                    kod=KOD_STRONA_DOLNA_TRANSFORMATORA,
                    komunikat_pl=(
                        "Za wyłącznikiem jest strona dolna transformatora, a rozpływ zwarciowy "
                        "podaje prąd strony górnej — prąd przekaźnika jest niewyznaczalny bez "
                        "przeliczenia przez przekładnię transformatora."
                    ),
                    akcja_naprawcza_pl=(
                        "Oceń zabezpieczenie strony górnej transformatora albo zabezpieczenie "
                        "odpływu za szyną strony dolnej."
                    ),
                ),
            )
        netto_od_do = prad_netto_galezi_z_wkladow(wklady_galezi, branch_id)
        wyplyw = netto_od_do if od_w else -netto_od_do
        suma += wyplyw
        skladniki.append(
            {
                "galaz_ref": branch_id,
                "prad_netto_od_do_a": netto_od_do,
                "wyplyw_z_klastra_a": wyplyw,
            }
        )
    zwarcie_w_klastrze = punkt_ref in klaster
    if zwarcie_w_klastrze:
        suma += ikss_punktu_a
    zrodla_klastra = [
        w
        for w in sorted(wklady_zrodel, key=lambda w: str(w["source_id"]))
        if str(w["node_id"]) in klaster
    ]
    if any(w["i_contrib_a"] is None for w in zrodla_klastra):
        return (
            None,
            {"skladniki": skladniki},
            PozycjaGotowosci(
                kod=KOD_BRAK_ROZPLYWU,
                komunikat_pl=(
                    "Wynik zwarciowy nie podaje prądu źródła przyłączonego za wyłącznikiem — "
                    "bilansu prądu przekaźnika nie da się domknąć."
                ),
                akcja_naprawcza_pl="Uruchom ponownie obliczenie zwarciowe na bieżącym modelu.",
            ),
        )
    wplywy_zrodel = [
        {"zrodlo_ref": str(w["source_id"]), "prad_a": float(w["i_contrib_a"])}
        for w in zrodla_klastra
    ]
    for wplyw in wplywy_zrodel:
        suma -= wplyw["prad_a"]
    if not math.isfinite(suma):
        # Wkład gałęzi, prąd punktu albo wkład źródła nie jest skończoną liczbą (NaN, ∞):
        # każde porównanie z NaN jest fałszem, więc bez tej odmowy przekaźnik „nie
        # zadziałałby" na liczbie, której nie ma — werdykt bez pokrycia w fizyce.
        return (
            None,
            {"skladniki": skladniki, "wplywy_zrodel_w_klastrze": wplywy_zrodel},
            PozycjaGotowosci(
                kod=KOD_PRAD_NIELICZBOWY,
                komunikat_pl=(
                    "Rozpływ zwarciowy podaje za wyłącznikiem prąd, który nie jest skończoną "
                    "liczbą — prądu przekaźnika nie wyznaczono."
                ),
                akcja_naprawcza_pl="Uruchom ponownie obliczenie zwarciowe na bieżącym modelu.",
            ),
        )
    bilans = {
        "wzor_latex": (
            r"I_Q = \sum_{b \in \partial K} I_{b,\mathrm{wyp}} + I''_{k}\,[F \in K] "
            r"- \sum_{s \in K} I_{s}"
        ),
        "klaster_zacisku": sorted(klaster),
        "skladniki_galezi": skladniki,
        "zwarcie_w_klastrze": zwarcie_w_klastrze,
        "punkt_wyniku_ref": punkt_wyniku_ref,
        "ikss_punktu_a": ikss_punktu_a if zwarcie_w_klastrze else None,
        "wplywy_zrodel_w_klastrze": wplywy_zrodel,
        "prad_wylacznika_a": abs(suma),
        "kierunek_pl": (
            "od strony zasilania do strefy" if suma >= 0 else "od strefy do strony zasilania"
        ),
        "regula_pl": (
            "Bilans prądów klastra zacisku za wyłącznikiem; wkłady źródeł z rozpływu solvera "
            "sumowane netto wg kierunku (moduł sumy) — reguła prądu gałęzi z rozpływu."
        ),
    }
    return abs(suma), bilans, None


def _wezly_z_wstrzykiwaniem(graph: NetworkGraph) -> set[str]:
    """Węzły z odbiorem, generacją albo źródłem — prąd roboczy wyłącznika w ich klastrze jest
    sumą fazorów kilku prądów, której rozpływ nie podaje."""
    wezly = {
        wezel_id
        for wezel_id, wezel in graph.nodes.items()
        if (wezel.active_power not in (None, 0.0))
        or (wezel.reactive_power not in (None, 0.0))
        or wezel.node_type.value != "PQ"
    }
    for zrodla in (
        graph.get_inverter_sources(),
        graph.get_synchronous_machine_sources(),
        graph.get_asynchronous_machine_sources(),
        graph.get_grid_sc_sources(),
    ):
        wezly.update(z.node_id for z in zrodla)
    return wezly


def prad_roboczy_przekaznika(
    *,
    graph: NetworkGraph,
    strefa: StrefaUrzadzenia,
    prady_galezi: Mapping[str, tuple[float | None, float | None]],
) -> tuple[float | None, str | None, str | None]:
    """Prąd roboczy wyłącznika z biegu rozpływu: ``(prąd [A], gałąź, powód braku)``.

    Ten sam klaster zacisku co ``prad_przekaznika``. Prąd wyłącznika jest prądem JEDYNEJ
    gałęzi opuszczającej klaster (zacisk tej gałęzi w klastrze: ``od`` → prąd początku,
    ``do`` → prąd końca). Gdy z klastra wychodzi kilka gałęzi albo w klastrze jest odbiór,
    generacja lub źródło, prąd wyłącznika jest sumą FAZORÓW — rozpływ podaje moduły prądów
    zacisków gałęzi, więc zamiast sumy modułów (błąd fizyki) jest nazwany brak.
    """
    klaster = strefa.klaster_zacisku
    if klaster & _wezly_z_wstrzykiwaniem(graph):
        return (
            None,
            None,
            "W węźle zacisku za wyłącznikiem przyłączony jest odbiór, generacja albo źródło — "
            "prąd roboczy wyłącznika jest sumą fazorów, a bieg rozpływu podaje moduły prądów "
            "gałęzi; prądu roboczego nie wyznaczono.",
        )
    brzegowe = [
        (branch_id, graph.branches[branch_id])
        for branch_id in sorted(graph.branches)
        if graph.branches[branch_id].in_service
        and (graph.branches[branch_id].from_node_id in klaster)
        != (graph.branches[branch_id].to_node_id in klaster)
    ]
    if len(brzegowe) != 1:
        return (
            None,
            None,
            f"Za wyłącznikiem rozchodzi się {len(brzegowe)} gałęzi — prąd roboczy wyłącznika "
            "jest sumą fazorów ich prądów, a bieg rozpływu podaje moduły; prądu roboczego nie "
            "wyznaczono.",
        )
    branch_id, galaz = brzegowe[0]
    od_a, do_a = prady_galezi.get(branch_id, (None, None))
    prad = od_a if galaz.from_node_id in klaster else do_a
    if prad is None:
        return (
            None,
            branch_id,
            "Bieg rozpływu nie podaje prądu zacisku gałęzi za wyłącznikiem — prądu roboczego "
            "nie wyznaczono.",
        )
    if not math.isfinite(float(prad)):
        return (
            None,
            branch_id,
            "Bieg rozpływu podaje prąd zacisku gałęzi za wyłącznikiem, który nie jest skończoną "
            "liczbą — prądu roboczego nie wyznaczono.",
        )
    return float(prad), branch_id, None


# ---------------------------------------------------------------------------
# 4. Czas zadziałania — WYŁĄCZNIE rdzeń IEC 60255
# ---------------------------------------------------------------------------


def czas_stopnia(stopien: StopienNastaw, prad_pierwotny_a: float) -> dict[str, Any]:
    """Czas zadziałania stopnia przy prądzie pierwotnym przekaźnika — ślad rdzenia.

    Zwraca słownik White Box: ``zadziala``, ``t_s``, ``M``, stałe krzywej, pośrednie
    (M^B, mianownik), wzór i podstawienie. Brak zadziałania (M ≤ 1) → ``t_s = None``.
    """
    krzywa = stopien.krzywa
    if krzywa in KRZYWE_IEC:
        typ = KRZYWE_IEC[krzywa]
        tms = stopien.zwloka_s if typ is IEC60255CurveType.DT else stopien.tms
        assert tms is not None
        # Rdzeń B-01 odmawia nastawy spoza dziedziny (rozruch albo TMS/zwłoka ≤ 0) gołym
        # `ValueError` — granica tłumaczy go na odmowę danych (karta ODMOWA-DANYCH-422).
        with odmowa_rdzenia_b01():
            wynik = compute_curve_trip_time(
                curve_type=typ,
                i_fault_a=prad_pierwotny_a,
                is_pickup_a=stopien.prog_pierwotny_a,
                tms=tms,
            )
        return {
            "funkcja": stopien.funkcja,
            "etykieta_pl": stopien.etykieta_pl,
            "krzywa": krzywa,
            "norma": "IEC 60255-151:2009",
            "wzor_latex": IEC60255_CURVE_FORMULAS_LATEX[typ],
            "stale": (
                {"A": IEC60255_CURVE_PARAMS[typ][0], "B": IEC60255_CURVE_PARAMS[typ][1]}
                if typ in IEC60255_CURVE_PARAMS
                else None
            ),
            "I_a": prad_pierwotny_a,
            "Is_a": stopien.prog_pierwotny_a,
            "TMS": stopien.tms,
            "zwloka_s": stopien.zwloka_s,
            "M": wynik.current_multiple_M,
            "M_do_B": wynik.M_power_B,
            "mianownik": wynik.denominator,
            "czas_bazowy_s": wynik.base_time_s,
            "zadziala": wynik.will_trip,
            "t_s": wynik.calculated_time_s,
            "podstawienie": wynik.substitution_latex,
        }
    typ_ieee = KRZYWE_IEEE[krzywa]
    stale = IEEECurveParams.get_standard_params(typ_ieee)
    assert stopien.tms is not None
    with odmowa_rdzenia_b01():  # rdzeń B-01 — jak wyżej
        punkt = compute_ieee_c37112_generic(
            i_fault_a=prad_pierwotny_a,
            is_pickup_a=stopien.prog_pierwotny_a,
            time_dial=stopien.tms,
            a=stale.a,
            b=stale.b,
            p=stale.p,
        )
    return {
        "funkcja": stopien.funkcja,
        "etykieta_pl": stopien.etykieta_pl,
        "krzywa": krzywa,
        "norma": "IEEE C37.112",
        "wzor_latex": r"t = TD \cdot \left(\frac{A}{M^{p} - 1} + B\right)",
        "stale": {"A": stale.a, "B": stale.b, "p": stale.p},
        "I_a": prad_pierwotny_a,
        "Is_a": stopien.prog_pierwotny_a,
        "TMS": stopien.tms,
        "zwloka_s": None,
        "M": punkt.current_multiple_m,
        "M_do_B": punkt.m_power_p,
        "mianownik": punkt.denominator,
        "czas_bazowy_s": punkt.base_time_s,
        "zadziala": punkt.will_trip,
        "t_s": punkt.trip_time_s,
        "podstawienie": (
            f"t = {_liczba(stopien.tms)}·({_liczba(stale.a)}/({_liczba(punkt.current_multiple_m)}"
            f"^{_liczba(stale.p)} − 1) + {_liczba(stale.b)})"
            if punkt.will_trip
            else "M ≤ 1, brak zadziałania"
        ),
    }


def czas_urzadzenia(
    stopnie: Sequence[StopienNastaw], prad_pierwotny_a: float
) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    """(ślad wszystkich stopni, stopień decydujący) — decyduje NAJSZYBSZY stopień, który ruszył."""
    slady = [czas_stopnia(s, prad_pierwotny_a) for s in stopnie]
    zadzialaly = [s for s in slady if s["zadziala"] and s["t_s"] is not None]
    if not zadzialaly:
        return slady, None
    return slady, min(zadzialaly, key=lambda s: (s["t_s"], s["funkcja"]))


# ---------------------------------------------------------------------------
# 5. Rekord werdyktu wyjaśnialnego
# ---------------------------------------------------------------------------


def _podstawa_nastawy(nastawy: NastawyUrzadzenia, stopien: StopienNastaw) -> PodstawaWymagania:
    return PodstawaWymagania(
        rodzaj="ZALOZENIE_PROJEKTOWE",
        dokument=f"Nastawy zabezpieczenia {nastawy.nazwa_pl} zapisane w modelu sieci projektu",
        wydanie="model sieci biegu oceny (odcisk migawki w kopercie biegu)",
        jednostka_redakcyjna=(
            f"stopień {stopien.etykieta_pl}: próg {_liczba(stopien.wartosc_progu)} A "
            f"({'strona wtórna' if stopien.jednostka_progu == 'A_WTORNY' else 'strona pierwotna'})"
        ),
        status="WSKAZANE",
        uwagi_pl=(
            "prąd rozruchowy po stronie pierwotnej wyprowadzony z przekładni przekładnika pola; "
            "zadziałanie przy prądzie powyżej progu wg definicji rozruchu IEC 60255-151"
        ),
    )


def _dowod_obliczenia(odniesienie: str) -> StatusDowodu:
    zdolnosc = classify_dynamic_capability(ZDOLNOSC_OCENY)
    return StatusDowodu(
        metoda="OBLICZENIE",
        poziom=zdolnosc.tier,
        rodzaj_twierdzenia=zdolnosc.claim_kind,
        status_modelu="NIE_DOTYCZY",
        status_danych=StatusDanych(stan="ZWALIDOWANE"),
        odniesienie=odniesienie,
    )


_NIEPEWNOSC_OBLICZENIA = Niepewnosc(
    nie_dotyczy=True,
    powod_pl=(
        "prąd przekaźnika z rozpływu zwarciowego i czas z charakterystyki normowej — bez "
        "dyskretyzacji, niepewność numeryczna nie dotyczy"
    ),
)


def _zakres_waznosci(wiarygodnosc: str, powod: str) -> ZakresWaznosci:
    wykluczenia = [
        "funkcje ziemnozwarciowe i kierunkowe (osobny tor)",
        "czas własny wyłącznika i przekaźnika (poza charakterystyką nastawy)",
    ]
    if wiarygodnosc != WIARYGODNY:
        wykluczenia.append(powod)
    return ZakresWaznosci(
        rodzaj_analizy="SHORT_CIRCUIT",
        opis_pl=(
            "Zadziałanie stopni nadprądowych fazowych przy prądzie początkowym zwarcia "
            "biegu IEC 60909 płynącym przez wyłącznik urządzenia"
        ),
        wykluczenia=tuple(wykluczenia),
    )


def ocena_punktu_rekord(
    *,
    nastawy: NastawyUrzadzenia,
    stopien: StopienNastaw,
    punkt_ref: str,
    nazwa_punktu: str,
    prad_a: float,
    wiarygodnosc: str,
    powod_wiarygodnosci: str,
    odniesienie_biegu: str,
) -> OcenaKryterium:
    """Rekord K: prąd przekaźnika ≥ prąd rozruchowy stopnia (zadziałanie w strefie)."""
    braki: list[str] = []
    if wiarygodnosc == NIEWIARYGODNY:
        braki.append(powod_wiarygodnosci)
    return ocen_kryterium(
        kryterium_id=f"zabezpieczenia.{nastawy.urzadzenie_ref}.{punkt_ref}.{stopien.funkcja}",
        przedmiot=Przedmiot(
            element_ref=nastawy.urzadzenie_ref,
            nazwa_pl=nastawy.nazwa_pl,
            opis_pl=f"Zabezpieczenie nadprądowe — zwarcie w punkcie {nazwa_punktu}",
        ),
        kryterium=Kryterium(
            opis_pl=(
                f"Prąd widziany przez przekaźnik przy zwarciu w punkcie {nazwa_punktu} "
                f"przekracza prąd rozruchowy stopnia {stopien.etykieta_pl} — stopień zadziała"
            ),
            warunek_latex=r"I_Q \ge I_{s,1}",
            relacja="NIE_MNIEJ",
        ),
        podstawa=_podstawa_nastawy(nastawy, stopien),
        stosowalnosc=Stosowalnosc(
            dotyczy=True,
            powod_pl="punkt zwarcia leży w strefie urządzenia wyznaczonej z topologii modelu",
        ),
        wynik=WynikKryterium(
            wielkosc_pl="prąd pierwotny płynący przez wyłącznik urządzenia",
            symbol_latex=r"I_Q",
            wartosc=Wielkosc(wartosc=prad_a, jednostka="A"),
            punkt_krytyczny_pl=f"zwarcie w punkcie {nazwa_punktu}",
            metoda="OBLICZENIE",
        ),
        limit=LimitKryterium(
            wartosc=Wielkosc(wartosc=stopien.prog_pierwotny_a, jednostka="A"),
            podstawa=_podstawa_nastawy(nastawy, stopien),
        ),
        niepewnosc=_NIEPEWNOSC_OBLICZENIA,
        dowod=_dowod_obliczenia(odniesienie_biegu),
        zakres_waznosci=_zakres_waznosci(wiarygodnosc, powod_wiarygodnosci),
        slad=[
            OdnosnikSladu(
                krok=f"zabezpieczenia:{nastawy.urzadzenie_ref}:{punkt_ref}",
                opis_pl=(
                    "bilans prądu klastra zacisku za wyłącznikiem i czas z charakterystyki "
                    "stopnia (rdzeń IEC 60255)"
                ),
            )
        ],
        braki_dodatkowe=braki,
    )


def odmowa_rekord(
    *, urzadzenie_ref: str, nazwa_pl: str, braki: Sequence[PozycjaGotowosci]
) -> OcenaKryterium:
    """Rekord K ``NIE_OCENIONO`` urządzenia wstrzymanego nazwanymi brakami."""
    from application.ocena_niewykonana import ocena_niewykonana
    from werdykt import ClaimKind, EvidenceTier

    return ocena_niewykonana(
        kryterium_id=f"zabezpieczenia.{urzadzenie_ref}",
        przedmiot=Przedmiot(
            element_ref=urzadzenie_ref,
            nazwa_pl=nazwa_pl,
            opis_pl="Zabezpieczenie nadprądowe — ocena wstrzymana brakami danych",
        ),
        opis_kryterium_pl=(
            "Zadziałanie stopni nadprądowych zabezpieczenia przy zwarciach w jego strefie"
        ),
        podstawa=PodstawaWymagania(
            rodzaj="ZALOZENIE_PROJEKTOWE",
            dokument=f"Nastawy zabezpieczenia {nazwa_pl} zapisane w modelu sieci projektu",
            status="NIEUSTALONE",
            uwagi_pl="nastawy albo dane toru pomiarowego niekompletne — patrz braki",
        ),
        powod_stosowalnosci_pl="zabezpieczenie nadprądowe czynne w modelu",
        rodzaj_twierdzenia=ClaimKind.STATIC_CALCULATION,
        poziom=EvidenceTier.UNVALIDATED_MODEL,
        status_modelu="NIE_DOTYCZY",
        zakres_waznosci=ZakresWaznosci(
            rodzaj_analizy="SHORT_CIRCUIT",
            opis_pl="Ocena nadprądowa urządzenia — wstrzymana do uzupełnienia danych",
        ),
        powod_braku_niepewnosci_pl="ocena się nie odbyła — niepewność nie dotyczy",
        czego_brakuje=tuple(f"{b.komunikat_pl} {b.akcja_naprawcza_pl}" for b in braki),
    )


# ---------------------------------------------------------------------------
# 6. Wejście publiczne — jedna ścieżka dla całego modelu i biegu zwarciowego
# ---------------------------------------------------------------------------


def wiarygodnosc_punktu(nastawy: NastawyUrzadzenia, prad_a: float) -> tuple[str, str]:
    """Czy przekładnik odwzorowuje prąd przekaźnikowi (granica dokładności ALF, IEC 61869-2).

    Prąd pierwotny powyżej ALF·I₁n nasyca rdzeń zabezpieczeniowy: prąd wtórny nie jest
    proporcjonalny, więc czas z charakterystyki i margines są niewiarygodne. Klasa bez ALF
    (pomiarowa albo nieznana) → wiarygodność nieustalona, nazwana w zakresie ważności.
    """
    if nastawy.przekladnia_a is None:
        return WIARYGODNOSC_NIEUSTALONA, "przekładnia przekładnika nieustalona"
    i1n = nastawy.przekladnia_a[0]
    if nastawy.alf is None:
        return (
            WIARYGODNOSC_NIEUSTALONA,
            f"klasa przekładnika ({nastawy.klasa_ct or 'nieznana'}) nie jest klasą "
            "zabezpieczeniową z granicą dokładności — nasycenia przekładnika nie sprawdzono",
        )
    granica = nastawy.alf * i1n
    if prad_a > granica:
        return (
            NIEWIARYGODNY,
            f"prąd {_liczba(prad_a)} A przekracza granicę dokładności przekładnika "
            f"ALF·I₁n = {_liczba(nastawy.alf)}·{_liczba(i1n)} A = {_liczba(granica)} A — "
            "rdzeń nasyca się, czas zadziałania i margines są niewiarygodne",
        )
    return (
        WIARYGODNY,
        f"prąd {_liczba(prad_a)} A w granicy dokładności przekładnika "
        f"ALF·I₁n = {_liczba(granica)} A",
    )


def ocen_zabezpieczenia(
    *,
    enm: EnergyNetworkModel,
    graph: NetworkGraph,
    wiersze_zwarcia: Sequence[Mapping[str, Any]],
    rozplyw_punktu: Callable[[str], list[dict[str, Any]] | None],
    nazwy_wezlow: Mapping[str, str],
    odniesienie_biegu: str,
) -> WynikOceny:
    """Ocena wszystkich urządzeń nadprądowych modelu w punktach zwarcia ich stref.

    Args:
        enm: model, z którego pochodzą urządzenia i nastawy (D-21).
        graph: graf modelu biegu zwarciowego (topologia strefy, identyfikatory rozpływu).
        wiersze_zwarcia: wiersze wyniku biegu SC (``fault_node_id``, ``ikss_a``,
            ``contributions``).
        rozplyw_punktu: dostęp do wkładów gałęziowych punktu (``pobierz_rozplyw_biegu``);
            ``None`` = rozpływ nieobliczalny dla punktu (jawny brak).
        nazwy_wezlow: nazwa KAŻDEGO węzła grafu biegu (``nazwy_wezlow_grafu``) — węzeł bez
            nazwy w słowniku to błąd kontraktu (``KeyError``), nigdy identyfikator na ekranie.
        odniesienie_biegu: opis biegu źródłowego do dowodu rekordu werdyktu.
    """
    urzadzenia, pominiete = urzadzenia_nadpradowe(enm)
    # Wiersz bez Ik'' (punkt, którego bieg nie policzył) nie jest punktem oceny; wiersz bez
    # identyfikatora punktu to błąd kontraktu wyniku, nie punkt do pominięcia.
    wiersze = {str(w["fault_node_id"]): w for w in wiersze_zwarcia if w["ikss_a"] is not None}
    oceny: list[OcenaPunktu] = []
    odmowy: list[OdmowaUrzadzenia] = []
    wszystkie_nastawy: list[NastawyUrzadzenia] = []
    strefy: dict[str, dict[str, Any]] = {}
    rozplywy: dict[str, list[dict[str, Any]] | None] = {}

    def rozplyw(punkt: str) -> list[dict[str, Any]] | None:
        if punkt not in rozplywy:
            rozplywy[punkt] = rozplyw_punktu(punkt)
        return rozplywy[punkt]

    for assignment in urzadzenia:
        nastawy = rozwiaz_nastawy(enm, assignment)
        wszystkie_nastawy.append(nastawy)
        nazwa_aparatu = _nazwa_aparatu(enm, assignment.breaker_ref)
        braki: list[PozycjaGotowosci] = list(nastawy.braki)
        strefa, braki_strefy, kandydaci = strefa_urzadzenia(
            graph, ref_to_graph_id(assignment.breaker_ref), nazwa_aparatu=nazwa_aparatu
        )
        braki.extend(braki_strefy)
        punkty: list[PunktZwarciaStrefy] = []
        if strefa is not None:
            opis_strefy = strefa.to_dict(nazwy_wezlow)
            punkty, innego_poziomu = punkty_zwarcia_strefy(
                enm=enm, graph=graph, strefa=strefa, punkty_wyniku=frozenset(wiersze)
            )
            # Punkty strefy na INNYM poziomie napięcia (za transformatorem) nie są oceniane:
            # rozpływ biegu SC podaje prądy gałęzi w amperach bazy napięcia PUNKTU zwarcia
            # (rdzeń IEC 60909, ``_build_branch_contributions_for_thevenin``: I = |f|·Ik''),
            # więc prąd gałęzi SN przy zwarciu po stronie nN jest w bazie nN. Przeliczenie
            # przez przekładnię byłoby ukrytą korektą rdzenia — decyzja B-01 właściciela.
            opis_strefy["punkty_innego_poziomu_napiecia"] = [
                {
                    "punkt_ref": p,
                    "nazwa_pl": nazwy_wezlow[p],
                    "powod_pl": (
                        "Punkt zwarcia na innym poziomie napięcia niż przekaźnik — rozpływ biegu "
                        "zwarciowego podaje prąd gałęzi w bazie napięcia punktu zwarcia, więc "
                        "prąd przekaźnika nie jest wyznaczany (decyzja rdzenia IEC 60909 "
                        "do właściciela)."
                    ),
                }
                for p in innego_poziomu
            ]
            strefy[assignment.ref_id] = opis_strefy
            if not punkty:
                braki.append(
                    PozycjaGotowosci(
                        kod=KOD_BRAK_PUNKTOW_W_STREFIE,
                        komunikat_pl=(
                            f"Bieg zwarciowy nie ma żadnego punktu zwarcia z prądem w strefie "
                            f"zabezpieczenia {nastawy.nazwa_pl}."
                        ),
                        akcja_naprawcza_pl=(
                            "Uruchom obliczenie zwarciowe obejmujące szyny strefy zabezpieczenia."
                        ),
                    )
                )
        if braki:
            odmowy.append(
                OdmowaUrzadzenia(
                    urzadzenie_ref=assignment.ref_id,
                    nazwa_pl=nastawy.nazwa_pl,
                    breaker_ref=assignment.breaker_ref,
                    braki=tuple(braki),
                    kandydaci_naprawy=kandydaci,
                    ocena=odmowa_rekord(
                        urzadzenie_ref=assignment.ref_id, nazwa_pl=nastawy.nazwa_pl, braki=braki
                    ),
                )
            )
            continue
        assert strefa is not None
        braki_punktow: list[PozycjaGotowosci] = []
        for punkt_strefy in punkty:
            punkt = punkt_strefy.punkt_ref
            wiersz = wiersze[punkt_strefy.punkt_wyniku_ref]
            wklady = rozplyw(punkt_strefy.punkt_wyniku_ref)
            nazwa_punktu = nazwy_wezlow[punkt]
            if wklady is None:
                braki_punktow.append(
                    PozycjaGotowosci(
                        kod=KOD_BRAK_ROZPLYWU,
                        komunikat_pl=(
                            f"Bieg zwarciowy nie ma rozpływu prądu na gałęzie dla punktu "
                            f"{nazwa_punktu} — prądu przekaźnika nie da się wyznaczyć."
                        ),
                        akcja_naprawcza_pl="Uruchom ponownie obliczenie zwarciowe.",
                    )
                )
                continue
            prad, bilans, brak_pradu = prad_przekaznika(
                graph=graph,
                strefa=strefa,
                punkt_ref=punkt,
                punkt_wyniku_ref=punkt_strefy.punkt_wyniku_ref,
                wklady_galezi=wklady,
                wklady_zrodel=list(wiersz["contributions"]),
                ikss_punktu_a=float(wiersz["ikss_a"]),
            )
            if brak_pradu is not None or prad is None:
                assert brak_pradu is not None
                braki_punktow.append(brak_pradu)
                continue
            oceny.append(
                _ocena_punktu(
                    nastawy=nastawy,
                    punkt=punkt,
                    nazwa_punktu=nazwa_punktu,
                    prad=prad,
                    bilans=bilans,
                    odniesienie_biegu=odniesienie_biegu,
                )
            )
        if braki_punktow:
            unikalne = list({(b.kod, b.komunikat_pl): b for b in braki_punktow}.values())
            odmowy.append(
                OdmowaUrzadzenia(
                    urzadzenie_ref=assignment.ref_id,
                    nazwa_pl=nastawy.nazwa_pl,
                    breaker_ref=assignment.breaker_ref,
                    braki=tuple(unikalne),
                    ocena=odmowa_rekord(
                        urzadzenie_ref=assignment.ref_id,
                        nazwa_pl=nastawy.nazwa_pl,
                        braki=unikalne,
                    ),
                )
            )
    return WynikOceny(
        oceny=tuple(oceny),
        odmowy=tuple(odmowy),
        pominiete=tuple(pominiete),
        nastawy=tuple(wszystkie_nastawy),
        strefy=strefy,
    )


def _ocena_punktu(
    *,
    nastawy: NastawyUrzadzenia,
    punkt: str,
    nazwa_punktu: str,
    prad: float,
    bilans: dict[str, Any],
    odniesienie_biegu: str,
) -> OcenaPunktu:
    slady, decydujacy = czas_urzadzenia(nastawy.stopnie, prad)
    # Stopień odniesienia rekordu i marginesu: decydujący (gdy ruszył) albo najczulszy
    # (najniższy próg — ten, którego brak zadziałania rozstrzyga o braku zadziałania urządzenia).
    najczulszy = min(nastawy.stopnie, key=lambda s: (s.prog_pierwotny_a, s.funkcja))
    stopien_odn = (
        next(s for s in nastawy.stopnie if s.funkcja == decydujacy["funkcja"])
        if decydujacy is not None
        else najczulszy
    )
    wiarygodnosc, powod = wiarygodnosc_punktu(nastawy, prad)
    krotnosc = prad / stopien_odn.prog_pierwotny_a
    margines = None if wiarygodnosc == NIEWIARYGODNY else round((krotnosc - 1.0) * 100.0, 2)
    return OcenaPunktu(
        urzadzenie_ref=nastawy.urzadzenie_ref,
        nazwa_urzadzenia_pl=nastawy.nazwa_pl,
        breaker_ref=nastawy.breaker_ref,
        punkt_ref=punkt,
        nazwa_punktu_pl=nazwa_punktu,
        prad_przekaznika_a=prad,
        stopien_decydujacy=decydujacy["funkcja"] if decydujacy is not None else None,
        prog_decydujacy_a=stopien_odn.prog_pierwotny_a,
        krzywa_decydujaca=stopien_odn.krzywa,
        t_zadzialania_s=decydujacy["t_s"] if decydujacy is not None else None,
        zadziala=decydujacy is not None,
        krotnosc_m=krotnosc,
        margines_procent=margines,
        wiarygodnosc=wiarygodnosc,
        wiarygodnosc_powod_pl=powod,
        stopnie=tuple(slady),
        bilans_pradu=bilans,
        ocena=ocena_punktu_rekord(
            nastawy=nastawy,
            stopien=stopien_odn,
            punkt_ref=punkt,
            nazwa_punktu=nazwa_punktu,
            prad_a=prad,
            wiarygodnosc=wiarygodnosc,
            powod_wiarygodnosci=powod,
            odniesienie_biegu=odniesienie_biegu,
        ),
    )


def _nazwa_aparatu(enm: EnergyNetworkModel, breaker_ref: str) -> str:
    aparat = next((b for b in enm.branches if b.ref_id == breaker_ref), None)
    return nazwa_elementu(aparat, "branches") if aparat is not None else "spoza modelu"


def _liczba(wartosc: float) -> str:
    """Liczba w zdaniu dla projektanta: przecinek dziesiętny, bez zer końcowych."""
    tekst = f"{wartosc:.4f}".rstrip("0").rstrip(".")
    return tekst.replace(".", ",")


__all__ = [
    "FUNKCJE_NIEOCENIANE",
    "FUNKCJE_OCENIANE",
    "NIEWIARYGODNY",
    "WIARYGODNOSC_NIEUSTALONA",
    "WIARYGODNY",
    "NastawyUrzadzenia",
    "OcenaPunktu",
    "OdmowaUrzadzenia",
    "PominieteUrzadzenie",
    "PozycjaGotowosci",
    "StopienNastaw",
    "StrefaUrzadzenia",
    "WynikOceny",
    "alf_z_klasy",
    "czas_stopnia",
    "czas_urzadzenia",
    "ocen_zabezpieczenia",
    "prad_przekaznika",
    "progi_stopnia",
    "rozwiaz_nastawy",
    "strefa_urzadzenia",
    "urzadzenia_nadpradowe",
    "wiarygodnosc_punktu",
]
