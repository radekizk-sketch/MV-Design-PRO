"""Ocena zabezpieczeń ziemnozwarciowych z modelu — JEDNA ścieżka (karta EWALUATORY-ZIEMNOZWARCIOWE).

PO CO. Dyrektywa właściciela: analiza zabezpieczeń nie kończy się na funkcjach nadprądowych
fazowych — model obsługuje także funkcje ziemnozwarciowe (51N, 50N, 67N, Yo>, Go>, Bo>, 32N,
59N i automatykę ZAWSC). Do tej karty każda z nich miała status „nie oceniono".

SKĄD DANE. Sterowniki, funkcje, nastawy (grupa efektywna) i przekładniki wejść ``3I0``/``3U0``
— z modelu (``enm.zabezpieczenie``). Strefa pola — z topologii (``strefa_urzadzenia``, ta sama
reguła co ocena nadprądowa). Wielkości mierzone przez przekaźnik przy zwarciu doziemnym w każdym
węźle SN — z solvera ``network_model.solvers.doziemienie_sn`` (rozpływ składowej zerowej po
boczników sieci, każdy sposób pracy punktu neutralnego, stan przed i po wymuszeniu AWSC).
Czas zadziałania stopni prądowych — z rdzenia IEC 60255 (``czas_stopnia``), funkcji
admitancyjnych, watometrycznej i napięciowej — zwłoka nastawy (czas niezależny).

CO OCENIA (każde kryterium = rekord werdyktu wyjaśnialnego z liczbą, limitem, podstawą):

* CZUŁOŚĆ — przy zwarciu w każdym węźle strefy (współczynnik c_min tabeli 1 IEC 60909-0)
  wielkość decydująca funkcji (3I0, rzut 3I0 na kierunek charakterystyczny, |Y0|, G0, B0, P0,
  U0) osiąga próg nastawy; dla funkcji admitancyjnych i watometrycznej także rozruch U0.
  Rekord niesie punkt najgorszy (brak zadziałania albo najdłuższy czas);
* SELEKTYWNOŚĆ — przy zwarciu poza strefą (szyny, linie sąsiednie; c_max) wielkość decydująca
  nie osiąga progu; dla 59N i ZAWSC NIE_DOTYCZY (zasada działania nie jest selektywna);
* STOPNIOWANIE CZASOWE — zabezpieczenie nadrzędne (strefa obejmuje strefę podrzędnego) działa
  co najmniej o CTI później w każdym punkcie, w którym działają oba; 59N — co najmniej o CTI
  później niż zabezpieczenie pola, które wyłącza zwarcie.

Limit kryterium czułości i selektywności to NASTAWA z modelu (podstawa: założenie projektowe
zapisane w modelu, jak w ocenie nadprądowej); odstęp CTI — założenia koordynacji
(``CoordinationConfig``). Współczynników czułości z IRiESD (II.4.5.4.1.4) nie ma w repozytorium,
więc ocena nie udaje ich spełnienia: rekord porównuje z progiem nastawy i to mówi.

CZEGO NIE ROBI (zakres ważności każdego rekordu): rezystancja przejścia R_F = 0 (zwarcie
metaliczne), konduktancja upływu linii pominięta, straty dławika bez podanego R pominięte (dana
przyjęta), przekładniki idealne, stany przejściowe zapłonu łuku, czas własny wyłącznika.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field, replace
from typing import Any, Literal

from application.analyses.protection.coordination.models import CoordinationConfig
from application.analyses.protection.ocena_nadpradowa import (
    KRZYWE_IEC,
    KRZYWE_IEEE,
    PozycjaGotowosci,
    StopienNastaw,
    StrefaUrzadzenia,
    czas_stopnia,
    strefa_urzadzenia,
    zdania_brakow,
)
from application.analyses.protection.rodziny_eaz import (
    RODZINA_KODU,
    RODZINY_EAZ,
    SposobPracyPunktuNeutralnego,
    WymaganieWspolczynnika,
    podstawa_u0_roboczego,
    sprawdz_wartosci_wiersza,
    wymaganie_k_b,
    wymaganie_k_c,
    wymaganie_k_c_opor,
)
from enm.assembler import wezly_bez_impedancji_do_odniesienia
from enm.mapping import ref_to_graph_id, sklad_sieci_doziemnej
from enm.models import EnergyNetworkModel, ProtectionAssignment
from enm.nazwy_elementow import nazwa_elementu
from enm.zabezpieczenie import (
    aparaty_funkcji,
    brakujace_wejscia,
    nastawy_funkcji,
    nazwa_sterownika,
    numer_grupy_efektywnej,
    przekladnik_pradu_zerowego,
)
from network_model.catalog.funkcje_eaz import FUNKCJE_EAZ, etykieta_funkcji_eaz
from network_model.catalog.wartosci_robocze import dana_przyjeta_b0, liczba_pl
from network_model.core.graph import NetworkGraph
from network_model.core.voltage_factor import c_for_node
from network_model.core.ybus import S_BASE_MVA
from network_model.odmowa_danych import OdmowaDanychError
from network_model.pochodne import (
    impedancja_z_napiecia_i_mocy_ohm,
    prad_pierwotny_z_wtornego_a,
    prad_wtorny_z_pierwotnego_a,
    prad_znamionowy_a,
    simens_na_milisimens,
    w_na_kw,
)
from network_model.pochodne.pasma_napieciowe import pasmo_napieciowe
from network_model.solvers.doziemienie_sn import (
    ETYKIETY_SPOSOBU_UZIEMIENIA_PL,
    ETYKIETY_STANU_PL,
    PODSTAWA_PRADU_UZIOMOWEGO,
    STAN_PO_AWSC,
    STAN_PRZED,
    WZOR_MNOZNIKA_RF_LATEX,
    WZOR_RF_Z_MNOZNIKA_LATEX,
    DaneUziomuStacji,
    PunktDoziemienia,
    SkladowaSieciZerowej,
    StanWymuszenia,
    StrefaPomiaru,
    WejscieDoziemienia,
    WielkosciPola,
    WynikDoziemienia,
    WynikPunktuDoziemienia,
    WynikUziemieniaStacji,
    oblicz_doziemienie,
    rezystancja_przejscia_dla_mnoznika,
    uziemienia_stacji,
)
from network_model.solvers.short_circuit_core import build_zbus
from solver_input.provenance import classify_dynamic_capability
from werdykt import (
    DanaPrzyjeta,
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
    format_wielkosc,
    ocen_kryterium,
)
from werdykt.proweniencja import FieldQuality

ZDOLNOSC_OCENY = "zabezpieczenia.ocena_ziemnozwarciowa"

#: Funkcje rejestru oceniane tą ścieżką — z rejestru (``ocena="ZIEMNOZWARCIOWA"``), nie z listy.
FUNKCJE_ZIEMNOZWARCIOWE: tuple[str, ...] = tuple(
    kod for kod, f in FUNKCJE_EAZ.items() if f.ocena == "ZIEMNOZWARCIOWA"
)
#: Rodzaj wielkości decydującej funkcji — JEDNA mapa dla wielkości, progu, jednostki i opisu.
KierunekRzutu = Literal["ZGODNY", "PRZECIWNY"]
"""Kierunek rzutu 3I₀ względem kierunku działania funkcji 67N (pole ``kierunek_rzutu``)."""

_RODZAJ_WIELKOSCI: dict[str, str] = {
    "51N": "PRAD",
    "50N": "PRAD",
    "67N": "RZUT_PRADU",
    "Yo>": "MODUL_Y0",
    "Go>": "G0",
    "Bo>": "B0",
    "32N": "P0",
    "59N": "U0",
    "ZAWSC": "U0",
}
_KLUCZ_PROGU: dict[str, str] = {
    "MODUL_Y0": "prog_y0_ms",
    "G0": "prog_g0_ms",
    "B0": "prog_b0_ms",
    "P0": "prog_p0_kw",
    "U0": "prog_u0_proc",
}
_JEDNOSTKA: dict[str, str] = {
    "PRAD": "A",
    "RZUT_PRADU": "A",
    "MODUL_Y0": "mS",
    "G0": "mS",
    "B0": "mS",
    "P0": "kW",
    "U0": "% U0n",
}
_SYMBOL: dict[str, str] = {
    "PRAD": r"3I_0",
    "RZUT_PRADU": r"3I_0\cos(\varphi_0-\varphi_{ch})",
    "MODUL_Y0": r"|Y_0|",
    "G0": r"G_0",
    "B0": r"B_0",
    "P0": r"P_0",
    "U0": r"U_0",
}
_OPIS_WIELKOSCI: dict[str, str] = {
    "PRAD": "prąd zerowy 3I0 w polu (strona pierwotna)",
    "RZUT_PRADU": "rzut prądu 3I0 na kierunek charakterystyczny (strona pierwotna)",
    "MODUL_Y0": "moduł admitancji zerowej mierzonej Y0 = 3I0/(−U0)",
    "G0": "konduktancja zerowa mierzona G0 = Re(3I0/(−U0)) w kierunku linii",
    "B0": "susceptancja zerowa mierzona B0 = Im(3I0/(−U0)) w kierunku linii",
    "P0": "moc czynna składowej zerowej P0 = Re((−U0)·3I0*) w kierunku linii",
    "U0": "napięcie przesunięcia punktu neutralnego U0 w % U0n",
}
#: Funkcje z rozruchem napięciowym U0 (nastawa ``prog_u0_proc``) obok wielkości decydującej.
#: 67N (``RZUT_PRADU``) ma rozruch U0> w algorytmie przekaźnika (korekta właściciela 3); bez
#: nastawy ocena przyjmuje wartość roboczą z IRiESD ENEA II.4.5.4.1.5 (dana przyjęta).
_Z_ROZRUCHEM_U0 = frozenset({"MODUL_Y0", "G0", "B0", "P0", "RZUT_PRADU"})
#: Wykładnik skalowania wielkości decydującej z rezystancją przejścia: moduły prądów i napięć
#: ~ m, moc P0 ~ m², admitancja Y0 = 3I0/(−U0) nie zależy od R_F (``mnoznik_rezystancji_
#: przejscia`` solvera).
_WYKLADNIK_RF: dict[str, int] = {
    "PRAD": 1,
    "RZUT_PRADU": 1,
    "U0": 1,
    "P0": 2,
    "MODUL_Y0": 0,
    "G0": 0,
    "B0": 0,
}

#: Rodzaje kryteriów rekordu oceny → nazwa kryterium dla projektanta (lista ZAMKNIĘTA — rekord
#: spoza niej to błąd kontraktu, `RekordOcenyZiemnozwarciowej.__post_init__`; nazwa jedzie
#: w rekordzie jako ``kryterium_pl`` — jedno źródło dla ekranu, karty pola i raportu).
#: Stopniowanie czasowe niesie przyrostek pary (``STOPNIOWANIE_CZASOWE:<urządzenie dalsze>``).
KRYTERIA_ZIEMNOZWARCIOWE: dict[str, str] = {
    "CZULOSC": "czułość",
    "SELEKTYWNOSC": "selektywność",
    "ROZRUCH_U0": "rozruch napięciowy U0",
    "STOPNIOWANIE_CZASOWE": "stopniowanie czasowe",
    "NAPIECIE_UZIOMOWE": "warunek wystarczający U_E ≤ U_Tp",
    "REZYSTANCJA_DOPUSZCZALNA": "rezystancja uziemienia dopuszczalna",
    "NAPIECIE_KROKOWE": "napięcie krokowe",
    "NAPIECIE_DOTYKOWE": "napięcie dotykowe spodziewane U_T",
    "WSPOLCZYNNIK_CZULOSCI": "współczynnik czułości k_c",
    "WSPOLCZYNNIK_CZULOSCI_OPOR": "współczynnik czułości przy doziemieniu oporowym",
    "WSPOLCZYNNIK_ODSTROJENIA": "współczynnik bezpieczeństwa nastawy k_b",
    "ODMOWA": "ocena wstrzymana",
}

KOD_BRAK_WEJSCIA = "zabezpieczenia.ziemnozwarciowe.brak_wejscia"
KOD_BRAK_NASTAWY = "zabezpieczenia.ziemnozwarciowe.brak_nastawy"
KOD_BRAK_PRZEKLADNIKA_3I0 = "zabezpieczenia.ziemnozwarciowe.brak_przekladni_3i0"
KOD_BRAK_WYZWOLENIA = "zabezpieczenia.ziemnozwarciowe.brak_wylacznika"
KOD_BRAK_POMIARU_U0 = "zabezpieczenia.ziemnozwarciowe.brak_miejsca_pomiaru"
KOD_POZA_SIECIA_SN = "zabezpieczenia.ziemnozwarciowe.poza_siecia_sn"
KOD_OBLICZENIE_NIEMOZLIWE = "zabezpieczenia.ziemnozwarciowe.obliczenie_doziemne"
KOD_AWSC_BEZ_ZAWSC = "zabezpieczenia.ziemnozwarciowe.awsc_bez_automatyki"
KOD_BRAK_DROGI_ZEROWEJ = "zabezpieczenia.ziemnozwarciowe.brak_drogi_pradu_zerowego"

#: Wynik przy kryterium punktu krytycznego: „nie zadziała" jest gorsze od każdego czasu.
_NIE_DZIALA = math.inf


def _liczba(wartosc: float) -> str:
    return liczba_pl(float(wartosc))


# ---------------------------------------------------------------------------
# 1. Funkcje sterowników z modelu
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class FunkcjaZiemnozwarciowa:
    """Funkcja ziemnozwarciowa sterownika po rozwiązaniu albo z nazwanymi brakami."""

    urzadzenie_ref: str
    nazwa_urzadzenia_pl: str
    funkcja_ref: str
    kod: str
    nastawy: Mapping[str, Any]
    breaker_ref: str | None
    strefa: StrefaUrzadzenia | None
    wezel_pomiaru: str | None
    stopien: StopienNastaw | None
    przekladnia_3i0: tuple[float, float] | None
    braki: tuple[PozycjaGotowosci, ...]
    #: nastawy przyjęte przez ocenę (wartość robocza bez nastawy w modelu, ESTIMATED)
    przyjete: tuple[DanaPrzyjeta, ...] = ()
    #: grupa nastaw efektywna (numer) i nazwa pola sterownika — identyfikacja wiersza
    grupa: int | None = None
    pole_pl: str | None = None

    @property
    def etykieta_pl(self) -> str:
        return etykieta_funkcji_eaz(self.kod)

    @property
    def rodzaj(self) -> str:
        return _RODZAJ_WIELKOSCI[self.kod]

    @property
    def klucz(self) -> str:
        return f"{self.urzadzenie_ref}/{self.funkcja_ref}"

    @property
    def prog(self) -> float:
        """Próg wielkości decydującej w jednostce ``_JEDNOSTKA`` (strona pierwotna)."""
        if self.stopien is not None:
            return self.stopien.prog_pierwotny_a
        return float(self.nastawy[_KLUCZ_PROGU[self.rodzaj]])

    @property
    def zwloka_s(self) -> float | None:
        wartosc = self.nastawy.get("zwloka_s")
        return float(wartosc) if isinstance(wartosc, int | float) else None

    def to_dict(self) -> dict[str, Any]:
        return {
            "urzadzenie_ref": self.urzadzenie_ref,
            "nazwa_urzadzenia_pl": self.nazwa_urzadzenia_pl,
            "funkcja_ref": self.funkcja_ref,
            "kod": self.kod,
            "etykieta_pl": self.etykieta_pl,
            "nastawy": dict(self.nastawy),
            "breaker_ref": self.breaker_ref,
            "przekladnia_3i0_a": (list(self.przekladnia_3i0) if self.przekladnia_3i0 else None),
            "wielkosc_pl": _OPIS_WIELKOSCI[self.rodzaj],
            "jednostka": _JEDNOSTKA[self.rodzaj],
            "prog": self.prog if not self.braki else None,
            "braki": [b.to_dict() for b in self.braki],
        }


def _liczba_dodatnia(wartosc: object) -> float | None:
    if isinstance(wartosc, bool) or not isinstance(wartosc, int | float):
        return None
    return float(wartosc) if math.isfinite(wartosc) and wartosc > 0 else None


#: Nazwa brakującej nastawy funkcji ziemnozwarciowej (``PozycjaGotowosci.nazwa_braku_pl``) —
#: składana przez ``zdania_brakow`` w jedno zdanie na funkcję.
_NAZWA_PROGU_PL: dict[str, str] = {
    "PRAD": "próg rozruchowy 3I₀",
    "RZUT_PRADU": "próg rozruchowy 3I₀",
    "MODUL_Y0": "próg admitancji zerowej |Y₀|",
    "G0": "próg konduktancji zerowej G₀",
    "B0": "próg susceptancji zerowej B₀",
    "P0": "próg mocy czynnej składowej zerowej P₀",
    "U0": "próg napięcia przesunięcia punktu neutralnego U₀",
}


def _braki_nastaw(kod: str, nastawy: Mapping[str, Any], *, nazwa: str) -> list[PozycjaGotowosci]:
    """Nastawy wymagane przez wielkość decydującą i czas funkcji — brak = nazwany brak modelu.

    Każdy brak niesie pełne zdanie (``komunikat_pl``, szczegóły na żądanie) i krótką nazwę
    nastawy (``nazwa_braku_pl``) — zdanie dla projektanta składa ``zdania_brakow``."""
    etykieta = etykieta_funkcji_eaz(kod)
    akcja = f"Uzupełnij nastawy funkcji {etykieta} zabezpieczenia {nazwa} w karcie pola."
    braki: list[PozycjaGotowosci] = []

    def brak(nazwa_braku: str, opis: str) -> None:
        braki.append(
            PozycjaGotowosci(
                kod=KOD_BRAK_NASTAWY,
                komunikat_pl=f"Funkcja {etykieta} zabezpieczenia {nazwa}: {opis}.",
                akcja_naprawcza_pl=akcja,
                funkcja=kod,
                nazwa_braku_pl=nazwa_braku,
            )
        )

    rodzaj = _RODZAJ_WIELKOSCI[kod]
    if rodzaj in ("PRAD", "RZUT_PRADU"):
        if _liczba_dodatnia(nastawy.get("prog")) is None:
            brak(
                _NAZWA_PROGU_PL[rodzaj],
                "brak dodatniego progu rozruchowego prądu zerowego",
            )
        if nastawy.get("jednostka_progu") not in ("A_WTORNY", "A_PIERWOTNY"):
            brak(
                "strona przekładnika progu (wtórna albo pierwotna)",
                "próg bez zadeklarowanej strony przekładnika (wtórna albo pierwotna)",
            )
        krzywa = nastawy.get("krzywa")
        if krzywa not in KRZYWE_IEC and krzywa not in KRZYWE_IEEE:
            brak("charakterystyka czasowa", "brak charakterystyki czasowej")
        elif krzywa == "DT":
            if _liczba_dodatnia(nastawy.get("zwloka_s")) is None:
                brak(
                    "zwłoka charakterystyki niezależnej",
                    "charakterystyka niezależna bez dodatniej zwłoki",
                )
        elif _liczba_dodatnia(nastawy.get("tms")) is None:
            brak(
                "mnożnik czasowy charakterystyki zależnej",
                "charakterystyka zależna bez dodatniego mnożnika czasowego",
            )
        if rodzaj == "RZUT_PRADU":
            if nastawy.get("kierunek") not in ("DO_LINII", "DO_SZYN"):
                brak(
                    "kierunek działania (do linii albo do szyn)",
                    "brak kierunku działania (do linii albo do szyn)",
                )
            kat = nastawy.get("kat_charakterystyczny_deg")
            if isinstance(kat, bool) or not isinstance(kat, int | float):
                brak("kąt charakterystyczny", "brak kąta charakterystycznego")
            if nastawy.get("tryb_kryterium") not in (None, "RZUT", "SEKTOR"):
                brak("tryb kryterium kierunkowego", "tryb kryterium spoza listy (rzut, sektor)")
            polowa = nastawy.get("polowa_sektora_deg")
            if polowa is not None and not (
                _liczba_dodatnia(polowa) is not None and float(polowa) <= 90.0
            ):
                brak(
                    "połowa szerokości sektora",
                    "połowa szerokości sektora poza przedziałem (0°; 90°]",
                )
            if nastawy.get("prog_u0_proc") is not None and (
                _liczba_dodatnia(nastawy.get("prog_u0_proc")) is None
            ):
                brak("próg rozruchowy napięcia zerowego U₀", "próg U₀> nie jest liczbą dodatnią")
        return braki
    if _liczba_dodatnia(nastawy.get(_KLUCZ_PROGU[rodzaj])) is None:
        brak(
            _NAZWA_PROGU_PL[rodzaj],
            f"brak dodatniego progu ({_OPIS_WIELKOSCI[rodzaj]})",
        )
    if rodzaj in _Z_ROZRUCHEM_U0 and _liczba_dodatnia(nastawy.get("prog_u0_proc")) is None:
        brak(
            "próg rozruchowy napięcia zerowego U₀",
            "brak dodatniego progu rozruchowego napięcia zerowego U0",
        )
    if _liczba_dodatnia(nastawy.get("zwloka_s")) is None:
        brak("zwłoka czasowa", "brak dodatniej zwłoki czasowej")
    return braki


def _stopien_pradowy(
    kod: str,
    nastawy: Mapping[str, Any],
    przekladnia: tuple[float, float] | None,
) -> StopienNastaw | None:
    """Stopień prądowy funkcji ziemnozwarciowej w postaci rdzenia IEC 60255 (próg pierwotny)."""
    prog = float(nastawy["prog"])
    jednostka = str(nastawy["jednostka_progu"])
    if jednostka == "A_WTORNY":
        if przekladnia is None:
            return None
        pierwotny = prad_pierwotny_z_wtornego_a(prog, przekladnia[0], przekladnia[1])
        wtorny = prog
        wzor = r"I_{0s,1} = I_{0s,2}\cdot\frac{I_{1n}}{I_{2n}}"
    else:
        pierwotny = prog
        wtorny = (
            prad_wtorny_z_pierwotnego_a(prog, przekladnia[0], przekladnia[1])
            if przekladnia is not None
            else prog
        )
        wzor = r"I_{0s,1} = \text{nastawa (strona pierwotna)}"
    krzywa = str(nastawy["krzywa"])
    return StopienNastaw(
        funkcja=kod,
        krzywa=krzywa,
        wartosc_progu=prog,
        jednostka_progu=jednostka,
        prog_wtorny_a=wtorny,
        prog_pierwotny_a=pierwotny,
        tms=float(nastawy["tms"]) if krzywa != "DT" else None,
        zwloka_s=float(nastawy["zwloka_s"]) if krzywa == "DT" else None,
        slad={
            "zrodlo_pl": f"nastawa funkcji {etykieta_funkcji_eaz(kod)} zapisana w modelu",
            "wartosc_w_modelu": prog,
            "jednostka_w_modelu": jednostka,
            "przekladnia_a": list(przekladnia) if przekladnia else None,
            "przeliczenie_latex": wzor,
            "prog_pierwotny_a": pierwotny,
        },
    )


def _szyna_pola(enm: EnergyNetworkModel, sterownik: ProtectionAssignment) -> str | None:
    if not sterownik.bay_ref:
        return None
    for pole in enm.bays:
        if pole.ref_id == sterownik.bay_ref:
            return ref_to_graph_id(pole.bus_ref) if pole.bus_ref else None
    return None


def funkcje_ziemnozwarciowe(
    enm: EnergyNetworkModel, graph: NetworkGraph
) -> list[FunkcjaZiemnozwarciowa]:
    """Funkcje ziemnozwarciowe czynnych sterowników modelu (po ``ref_id`` i kolejności funkcji)."""
    wynik: list[FunkcjaZiemnozwarciowa] = []
    for sterownik in sorted(enm.protection_assignments, key=lambda s: s.ref_id):
        if not sterownik.is_enabled:
            continue
        nazwa = nazwa_sterownika(enm, sterownik)
        ct0 = przekladnik_pradu_zerowego(enm, sterownik)
        przekladnia = (
            (ct0.ratio_primary, ct0.ratio_secondary)
            if ct0 is not None and ct0.ratio_primary > 0 and ct0.ratio_secondary > 0
            else None
        )
        for funkcja in sterownik.funkcje:
            if not funkcja.wlaczona or funkcja.kod not in FUNKCJE_ZIEMNOZWARCIOWE:
                continue
            kod = funkcja.kod
            etykieta = etykieta_funkcji_eaz(kod)
            nastawy = nastawy_funkcji(sterownik, funkcja.ref)
            braki: list[PozycjaGotowosci] = []
            for wejscie in brakujace_wejscia(sterownik, kod):
                braki.append(
                    PozycjaGotowosci(
                        kod=KOD_BRAK_WEJSCIA,
                        komunikat_pl=(
                            f"Funkcja {etykieta} zabezpieczenia {nazwa} nie ma przypiętego "
                            f"wejścia {wejscie} — wielkości mierzonej nie da się wyznaczyć."
                        ),
                        akcja_naprawcza_pl=(
                            f"Przypnij przekładnik wejścia {wejscie} sterownika w karcie pola "
                            "(układ Holmgreena albo przekładnik Ferrantiego dla 3I0, otwarty "
                            "trójkąt albo napięcia fazowe dla 3U0)."
                        ),
                        funkcja=kod,
                    )
                )
            braki.extend(_braki_nastaw(kod, nastawy, nazwa=nazwa))
            rodzaj = _RODZAJ_WIELKOSCI[kod]
            aparaty = aparaty_funkcji(sterownik, funkcja.ref)
            breaker = aparaty[0] if aparaty else None
            strefa: StrefaUrzadzenia | None = None
            wezel_pomiaru: str | None = None
            if rodzaj != "U0":
                if breaker is None:
                    braki.append(
                        PozycjaGotowosci(
                            kod=KOD_BRAK_WYZWOLENIA,
                            komunikat_pl=(
                                f"Funkcja {etykieta} zabezpieczenia {nazwa} nie działa na "
                                "wyłącznik (macierz wyzwoleń) — strefy pola nie da się wyznaczyć."
                            ),
                            akcja_naprawcza_pl=(
                                f"Przypisz funkcji {etykieta} wyłącznik pola w macierzy wyzwoleń."
                            ),
                            funkcja=kod,
                        )
                    )
                else:
                    strefa, braki_strefy, _ = strefa_urzadzenia(
                        graph,
                        ref_to_graph_id(breaker),
                        nazwa_aparatu=_nazwa_aparatu(enm, breaker),
                    )
                    braki.extend(braki_strefy)
                    if strefa is not None:
                        wezel_pomiaru = strefa.wezel_zacisku
            else:
                if breaker is not None and ref_to_graph_id(breaker) in graph.switches:
                    lacznik = graph.switches[ref_to_graph_id(breaker)]
                    wezel_pomiaru = lacznik.from_node_id
                else:
                    wezel_pomiaru = _szyna_pola(enm, sterownik)
                if wezel_pomiaru is None:
                    braki.append(
                        PozycjaGotowosci(
                            kod=KOD_BRAK_POMIARU_U0,
                            komunikat_pl=(
                                f"Funkcja {etykieta} zabezpieczenia {nazwa} nie ma miejsca pomiaru "
                                "napięcia zerowego — sterownik nie jest w polu i nie działa na "
                                "wyłącznik."
                            ),
                            akcja_naprawcza_pl=(
                                f"Przypisz sterownik z funkcją {etykieta} do pola rozdzielnicy."
                            ),
                            funkcja=kod,
                        )
                    )
            stopien: StopienNastaw | None = None
            if rodzaj in ("PRAD", "RZUT_PRADU") and not braki:
                stopien = _stopien_pradowy(kod, nastawy, przekladnia)
                if stopien is None:
                    braki.append(
                        PozycjaGotowosci(
                            kod=KOD_BRAK_PRZEKLADNIKA_3I0,
                            komunikat_pl=(
                                f"Próg funkcji {etykieta} zabezpieczenia {nazwa} podano po stronie "
                                "wtórnej, a przekładnia toru prądu zerowego 3I0 jest nieustalona."
                            ),
                            akcja_naprawcza_pl=(
                                "Wskaż przekładnik toru 3I0 z przekładnią (przekładniki fazowe "
                                "układu Holmgreena albo przekładnik Ferrantiego)."
                            ),
                            funkcja=kod,
                        )
                    )
            wynik.append(
                FunkcjaZiemnozwarciowa(
                    urzadzenie_ref=sterownik.ref_id,
                    nazwa_urzadzenia_pl=nazwa,
                    funkcja_ref=funkcja.ref,
                    kod=kod,
                    nastawy=nastawy,
                    breaker_ref=breaker,
                    strefa=strefa,
                    wezel_pomiaru=wezel_pomiaru,
                    stopien=stopien,
                    przekladnia_3i0=przekladnia,
                    braki=tuple(braki),
                    grupa=numer_grupy_efektywnej(sterownik),
                    pole_pl=_nazwa_pola(enm, sterownik),
                )
            )
    return wynik


def _nazwa_pola(enm: EnergyNetworkModel, sterownik: ProtectionAssignment) -> str | None:
    """Nazwa pola sterownika (z modelu) — identyfikacja wiersza tabeli oceny."""
    if not sterownik.bay_ref:
        return None
    for pole in enm.bays:
        if pole.ref_id == sterownik.bay_ref:
            return nazwa_elementu(pole, "bays")
    return None


def _nazwa_aparatu(enm: EnergyNetworkModel, breaker_ref: str) -> str:
    for galaz in enm.branches:
        if galaz.ref_id == breaker_ref:
            return nazwa_elementu(galaz, "branches")
    return "pola"


# ---------------------------------------------------------------------------
# 2. Obliczenie doziemne sieci modelu
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ObliczenieDoziemne:
    """Dwa biegi solvera (c_min do czułości, c_max do selektywności i uziemień) + dane."""

    wynik_min: WynikDoziemienia
    wynik_max: WynikDoziemienia
    c_min: float
    c_max: float
    #: węzeł grafu punktu → (punkt_ref, nazwa)
    punkty: Mapping[str, tuple[str, str]]
    dane_przyjete: tuple[DanaPrzyjeta, ...]
    slad_budowy: tuple[dict[str, Any], ...]
    #: wejście biegu c_max (uziemienia stacji liczą się z tego samego rozwiązania)
    wejscie_max: WejscieDoziemienia

    def to_dict(self) -> dict[str, Any]:
        return {
            "c_min": self.c_min,
            "c_max": self.c_max,
            "r_f_ohm": self.wynik_min.r_f_ohm,
            "wersja_solvera": self.wynik_min.wersja,
            "skladowe": [s.to_dict() for s in self.wynik_min.skladowe],
            "punkty": [
                {
                    "punkt_ref": p.punkt_ref,
                    "nazwa_pl": p.nazwa_pl,
                    "stan": p.stan,
                    "stan_pl": ETYKIETY_STANU_PL[p.stan],
                    "skladowa": p.skladowa,
                    "prad_doziemny_a": abs(p.prad_doziemny_a),
                    "u0_proc": p.u0_punktu_proc,
                }
                for p in self.wynik_min.punkty
            ],
            "dane_przyjete": [d.model_dump(mode="json") for d in self.dane_przyjete],
            "slad": list(self.wynik_min.slad),
        }


def _wartosci_json(wartosc: Any) -> Any:
    """Ślad budowy sieci zerowej w postaci JSON: liczba zespolona → ``{"re", "im"}`` (ta sama
    postać co ślad biegu zwarciowego), skalar numpy → liczba Pythona."""
    if isinstance(wartosc, complex):
        return {"re": float(wartosc.real), "im": float(wartosc.imag)}
    if isinstance(wartosc, dict):
        return {k: _wartosci_json(v) for k, v in wartosc.items()}
    if isinstance(wartosc, list | tuple):
        return [_wartosci_json(v) for v in wartosc]
    if hasattr(wartosc, "item"):
        return _wartosci_json(wartosc.item())
    return wartosc


def oblicz_siec_doziemna(
    enm: EnergyNetworkModel,
    graph: NetworkGraph,
    funkcje: Sequence[FunkcjaZiemnozwarciowa],
) -> ObliczenieDoziemne:
    """Wejście solvera doziemnego z modelu: Y0 z boczników, Z1 = Z2 z sieci zwarciowej IEC 60909
    (rdzeń ``build_zbus``, wyłącznie wołany), punkty = szyny SN, strefy = strefy funkcji.
    """
    node_index, y0, boczniki, slad, propozycje = sklad_sieci_doziemnej(enm, graph)
    wezly_bez = wezly_bez_impedancji_do_odniesienia(graph)
    graf_zgodny = (
        graph.podgraf(w for w in graph.nodes if w not in wezly_bez) if wezly_bez else graph
    )
    builder1, z1 = build_zbus(graf_zgodny)
    indeks1 = builder1.node_id_to_index

    punkty: list[PunktDoziemienia] = []
    meta: dict[str, tuple[str, str]] = {}
    for szyna in sorted(enm.buses, key=lambda b: b.ref_id):
        if pasmo_napieciowe(szyna.voltage_kv) != "SN":
            continue
        wezel = ref_to_graph_id(szyna.ref_id)
        if wezel not in node_index or wezel not in indeks1:
            continue
        u_n = float(graph.nodes[wezel].voltage_level)
        z1_kk = complex(z1[indeks1[wezel], indeks1[wezel]])
        nazwa = nazwa_elementu(szyna, "buses")
        punkty.append(
            PunktDoziemienia(
                punkt_ref=szyna.ref_id,
                nazwa_pl=nazwa,
                wezel=wezel,
                indeks=node_index[wezel],
                z1_pu=z1_kk,
                z2_pu=z1_kk,
                z_base_ohm=impedancja_z_napiecia_i_mocy_ohm(u_n, S_BASE_MVA),
                i_base_a=prad_znamionowy_a(S_BASE_MVA, u_n),
                u_n_kv=u_n,
            )
        )
        meta[wezel] = (szyna.ref_id, nazwa)

    strefy: list[StrefaPomiaru] = []
    for f in funkcje:
        if f.braki or f.wezel_pomiaru is None or f.wezel_pomiaru not in node_index:
            continue
        u_n = float(graph.nodes[f.wezel_pomiaru].voltage_level)
        strefy.append(
            StrefaPomiaru(
                strefa_ref=f.klucz,
                wezly=f.strefa.wezly if f.strefa is not None else frozenset(),
                indeks_pomiaru=node_index[f.wezel_pomiaru],
                i_base_a=prad_znamionowy_a(S_BASE_MVA, u_n),
                u_n_kv=u_n,
            )
        )
    nazwy_galezi = {g.ref_id: nazwa_elementu(g, "branches") for g in enm.branches}
    dane = [
        dana_przyjeta_b0(
            wartosc=wartosc,
            zalozenie=zalozenie,
            miejsce_pl=f"odcinek {nazwy_galezi[ref]}",
        )
        for ref, (wartosc, zalozenie) in sorted(propozycje.items())
    ]
    for b in boczniki:
        pn = b.punkt_neutralny
        if pn is not None and pn.typ == "petersen_coil" and pn.zn_ohm.real == 0:
            dane.append(
                DanaPrzyjeta(
                    nazwa_pl=f"rezystancja strat dławika ({b.nazwa_pl})",
                    wartosc=Wielkosc(wartosc=0.0, jednostka="Ω"),
                    powod_pl=(
                        "Dławik bez podanej rezystancji R_N — straty czynne dławika pominięte "
                        "(prąd czynny zwarcia doziemnego zaniżony). Podaj R uziemienia dławika "
                        "w punkcie neutralnym."
                    ),
                    jakosc=FieldQuality.ESTIMATED,
                )
            )
    if not punkty:
        raise OdmowaDanychError(
            "Żadna szyna SN modelu nie ma impedancji zwarciowej do sieci zasilającej — zwarcia "
            "doziemnego nie ma gdzie policzyć."
        )
    # Współczynnik c tabeli 1 IEC 60909-0 dla sieci SN (jeden wiersz dla całego pasma SN).
    u_sn = min(p.u_n_kv for p in punkty)
    c_min = c_for_node(u_sn, "MIN", tolerancja_nn=None)
    c_max = c_for_node(u_sn, "MAX", tolerancja_nn=None)

    def _wejscie(c: float) -> WejscieDoziemienia:
        return WejscieDoziemienia(
            y0_pu=y0, boczniki=boczniki, punkty=tuple(punkty), strefy=tuple(strefy), c=c
        )

    return ObliczenieDoziemne(
        wynik_min=oblicz_doziemienie(_wejscie(c_min)),
        wynik_max=oblicz_doziemienie(_wejscie(c_max)),
        c_min=c_min,
        c_max=c_max,
        punkty=meta,
        dane_przyjete=tuple(dane),
        slad_budowy=tuple(_wartosci_json(k) for k in slad),
        wejscie_max=_wejscie(c_max),
    )


# ---------------------------------------------------------------------------
# 3. Wielkość decydująca, zadziałanie i czas funkcji
# ---------------------------------------------------------------------------


def wielkosc_decydujaca(f: FunkcjaZiemnozwarciowa, pole: WielkosciPola) -> float:
    """Wielkość decydująca funkcji przy zwarciu (strona pierwotna, jednostka ``_JEDNOSTKA``)."""
    rodzaj = f.rodzaj
    # Kąt i admitancja są nieokreślone (``None``) wyłącznie przy zerowym sygnale pola: solver
    # zwraca ``None`` tylko przy |3I0| = 0 albo |U0| = 0, a w każdym takim polu |3I0| = 0 —
    # zero poniżej to DOKŁADNY rzut zerowego wektora prądu, nie podstawienie (niezmiennik
    # przypięty: `test_doziemienie_sn.py::test_brak_kata_albo_admitancji_tylko_przy_zerowym_
    # sygnale`).
    if rodzaj == "PRAD":
        return abs(pole.prad_3i0_a)
    if rodzaj == "RZUT_PRADU":
        if pole.kat_phi0_deg is None:
            return 0.0
        odchylenie = odchylenie_kierunku_deg(f, pole)
        assert odchylenie is not None
        wartosc = (
            abs(pole.prad_3i0_a)
            if tryb_kryterium(f) == "SEKTOR"
            else abs(pole.prad_3i0_a) * math.cos(math.radians(odchylenie))
        )
        # Poza sektorem działania przekaźnik nie działa: dodatnia wielkość poza sektorem nie jest
        # wielkością działania (0), ujemny rzut zostaje (prąd w kierunku przeciwnym — nazwany).
        return wartosc if abs(odchylenie) <= polowa_sektora_deg(f) else min(wartosc, 0.0)
    if rodzaj == "U0":
        return pole.u0_proc
    if pole.admitancja_y0_s is None:
        return 0.0
    if rodzaj == "MODUL_Y0":
        return simens_na_milisimens(abs(pole.admitancja_y0_s))
    if rodzaj == "G0":
        return simens_na_milisimens(pole.admitancja_y0_s.real)
    if rodzaj == "B0":
        return simens_na_milisimens(pole.admitancja_y0_s.imag)
    return w_na_kw(pole.moc_p0_w)


def tryb_kryterium(f: FunkcjaZiemnozwarciowa) -> str:
    """Tryb kryterium 67N z nastaw (``RZUT`` bez nastawy — kryterium rzutu)."""
    return str(f.nastawy.get("tryb_kryterium") or "RZUT")


def polowa_sektora_deg(f: FunkcjaZiemnozwarciowa) -> float:
    """Połowa szerokości sektora 67N z nastaw (bez nastawy 90° — półpłaszczyzna rzutu)."""
    wartosc = f.nastawy.get("polowa_sektora_deg")
    return float(wartosc) if isinstance(wartosc, int | float) else 90.0


def os_charakterystyki_deg(f: FunkcjaZiemnozwarciowa) -> float:
    """Oś działania względem −U0: kąt charakterystyczny, obrócony o 180° dla kierunku do szyn."""
    kat = float(f.nastawy["kat_charakterystyczny_deg"]) + (
        180.0 if f.nastawy.get("kierunek") == "DO_SZYN" else 0.0
    )
    return (kat + 180.0) % 360.0 - 180.0


def odchylenie_kierunku_deg(f: FunkcjaZiemnozwarciowa, pole: WielkosciPola) -> float | None:
    """Kąt prądu 3I0 względem osi działania w [−180°; 180°) (``None`` — prąd zerowy)."""
    if pole.kat_phi0_deg is None:
        return None
    return (pole.kat_phi0_deg - os_charakterystyki_deg(f) + 180.0) % 360.0 - 180.0


@dataclass(frozen=True)
class Warunek67N:
    """Jeden warunek algorytmu 67N przy jednym zwarciu: wartość, nastawa, zapas."""

    klucz: Literal["U0", "SEKTOR", "PROG"]
    opis_pl: str
    warunek_latex: str
    wartosc: float
    nastawa: float
    jednostka: str
    zapas: float
    spelniony: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "klucz": self.klucz,
            "opis_pl": self.opis_pl,
            "warunek_latex": self.warunek_latex,
            "wartosc": self.wartosc,
            "nastawa": self.nastawa,
            "jednostka": self.jednostka,
            "zapas": self.zapas,
            "spelniony": self.spelniony,
        }


def warunki_67n(f: FunkcjaZiemnozwarciowa, pole: WielkosciPola) -> tuple[Warunek67N, ...]:
    """Warunki algorytmu przekaźnika 67N liczone OSOBNO (korekta właściciela 3): rozruch
    napięciowy U0 ≥ U0>, kierunek |φ0 − φ_os| ≤ połowa sektora, próg (rzut albo moduł 3I0
    w sektorze) ≥ I0>. Zadziałanie = koniunkcja; warunek rozstrzygający — pierwszy niespełniony,
    a gdy wszystkie spełnione, ten o najmniejszym zapasie względnym. Prąd zerowy: kierunek
    nieokreślony — odchylenie 180° (warunek niespełniony)."""
    prog_u0 = float(f.nastawy["prog_u0_proc"])
    polowa = polowa_sektora_deg(f)
    odchylenie = odchylenie_kierunku_deg(f, pole)
    odch = 180.0 if odchylenie is None else abs(odchylenie)
    wielkosc = wielkosc_decydujaca(f, pole)
    rzut = tryb_kryterium(f) == "RZUT"
    return (
        Warunek67N(
            klucz="U0",
            opis_pl="rozruch napięciowy U₀ ≥ U₀>",
            warunek_latex=r"U_0 \ge U_{0>}",
            wartosc=pole.u0_proc,
            nastawa=prog_u0,
            jednostka="%",
            zapas=pole.u0_proc - prog_u0,
            spelniony=pole.u0_proc >= prog_u0,
        ),
        Warunek67N(
            klucz="SEKTOR",
            opis_pl="kierunek: prąd 3I₀ w sektorze działania",
            warunek_latex=r"|\varphi_0 - \varphi_{os}| \le \Delta\varphi",
            wartosc=odch,
            nastawa=polowa,
            jednostka="°",
            zapas=polowa - odch,
            spelniony=odch <= polowa,
        ),
        Warunek67N(
            klucz="PROG",
            opis_pl=(
                "rzut 3I₀ na oś charakterystyki ≥ I₀>" if rzut else "moduł 3I₀ w sektorze ≥ I₀>"
            ),
            warunek_latex=(
                r"3I_0\cos(\varphi_0 - \varphi_{os}) \ge I_{0>}" if rzut else r"|3I_0| \ge I_{0>}"
            ),
            wartosc=wielkosc,
            nastawa=f.prog,
            jednostka="A",
            zapas=wielkosc - f.prog,
            spelniony=wielkosc >= f.prog,
        ),
    )


def warunek_rozstrzygajacy(warunki: Sequence[Warunek67N]) -> Warunek67N:
    """Pierwszy niespełniony warunek albo — gdy działa — warunek o najmniejszym zapasie
    względnym (zapas / nastawa)."""
    for w in warunki:
        if not w.spelniony:
            return w
    return min(warunki, key=lambda w: w.zapas / w.nastawa if w.nastawa else math.inf)


def rusza(f: FunkcjaZiemnozwarciowa, pole: WielkosciPola) -> bool:
    """Rozruch funkcji: wielkość decydująca ≥ próg (i U0 ≥ próg rozruchu, gdy funkcja go ma)."""
    if f.rodzaj == "RZUT_PRADU":
        return all(w.spelniony for w in warunki_67n(f, pole))
    if wielkosc_decydujaca(f, pole) < f.prog:
        return False
    if f.rodzaj in _Z_ROZRUCHEM_U0:
        return pole.u0_proc >= float(f.nastawy["prog_u0_proc"])
    return True


def czas_funkcji(f: FunkcjaZiemnozwarciowa, pole: WielkosciPola) -> tuple[float | None, dict]:
    """Czas zadziałania funkcji w JEDNYM stanie (bez rozruchu → ``None``) i ślad."""
    if not rusza(f, pole):
        return None, {"zadziala": False}
    if f.stopien is not None:
        slad = czas_stopnia(f.stopien, wielkosc_decydujaca(f, pole))
        return (slad["t_s"] if slad["zadziala"] else None), slad
    return f.zwloka_s, {"zadziala": True, "t_s": f.zwloka_s, "zwloka_s": f.zwloka_s}


@dataclass(frozen=True)
class DzialaniePunktu:
    """Działanie funkcji przy zwarciu w punkcie: oba stany wymuszenia i czas wypadkowy."""

    punkt_ref: str
    nazwa_pl: str
    w_strefie: bool
    wartosc_przed: float
    u0_przed: float
    wartosc_po: float | None
    u0_po: float | None
    t_zadzialania_s: float | None
    stan_decydujacy: StanWymuszenia
    t_wymuszenia_s: float | None

    @property
    def wartosc(self) -> float:
        if self.stan_decydujacy == STAN_PO_AWSC and self.wartosc_po is not None:
            return self.wartosc_po
        return self.wartosc_przed

    def to_dict(self) -> dict[str, Any]:
        return {
            "punkt_ref": self.punkt_ref,
            "nazwa_pl": self.nazwa_pl,
            "w_strefie": self.w_strefie,
            "wartosc_przed": self.wartosc_przed,
            "u0_przed_proc": self.u0_przed,
            "wartosc_po_awsc": self.wartosc_po,
            "u0_po_awsc_proc": self.u0_po,
            "t_wymuszenia_s": self.t_wymuszenia_s,
            "stan_decydujacy": self.stan_decydujacy,
            "t_zadzialania_s": self.t_zadzialania_s,
        }


def dzialanie_w_punkcie(
    f: FunkcjaZiemnozwarciowa,
    przed: WynikPunktuDoziemienia,
    po: WynikPunktuDoziemienia | None,
    t_wymuszenia_s: float | None,
) -> DzialaniePunktu:
    """Reguła czasu przy wymuszeniu AWSC (zakres ważności): pobudzenie trwające przez chwilę
    załączenia wymuszenia nie przerywa odmierzania zwłoki; funkcja pobudzona dopiero po
    wymuszeniu działa po czasie t_W + t_funkcji; pobudzenie, które zanika po wymuszeniu przed
    upływem zwłoki, odpada."""
    pole_przed = przed.pole(f.klucz)
    t1, _ = czas_funkcji(f, pole_przed)
    pole_po = po.pole(f.klucz) if po is not None and t_wymuszenia_s is not None else None
    t2 = czas_funkcji(f, pole_po)[0] if pole_po is not None else None
    stan: StanWymuszenia = STAN_PRZED
    if pole_po is None or t_wymuszenia_s is None:
        t = t1
    elif t1 is not None and (t1 <= t_wymuszenia_s or t2 is not None):
        t = t1
    elif t2 is not None:
        t = t_wymuszenia_s + t2
        stan = STAN_PO_AWSC
    else:
        t = None
        if pole_po is not None and wielkosc_decydujaca(f, pole_po) / f.prog > (
            wielkosc_decydujaca(f, pole_przed) / f.prog
        ):
            stan = STAN_PO_AWSC
    return DzialaniePunktu(
        punkt_ref=przed.punkt_ref,
        nazwa_pl=przed.nazwa_pl,
        w_strefie=pole_przed.zwarcie_w_strefie,
        wartosc_przed=wielkosc_decydujaca(f, pole_przed),
        u0_przed=pole_przed.u0_proc,
        wartosc_po=wielkosc_decydujaca(f, pole_po) if pole_po is not None else None,
        u0_po=pole_po.u0_proc if pole_po is not None else None,
        t_zadzialania_s=t,
        stan_decydujacy=stan,
        t_wymuszenia_s=t_wymuszenia_s if pole_po is not None else None,
    )


# ---------------------------------------------------------------------------
# 4. Rekordy werdyktu
# ---------------------------------------------------------------------------


def _podstawa_nastawy(f: FunkcjaZiemnozwarciowa) -> PodstawaWymagania:
    return PodstawaWymagania(
        rodzaj="ZALOZENIE_PROJEKTOWE",
        dokument=(
            f"Nastawy zabezpieczenia {f.nazwa_urzadzenia_pl} zapisane w modelu sieci projektu"
        ),
        wydanie="model sieci biegu oceny (odcisk migawki w kopercie biegu)",
        jednostka_redakcyjna=(
            f"funkcja {f.etykieta_pl}: próg {_liczba(f.prog)} {_JEDNOSTKA[f.rodzaj]} "
            "(strona pierwotna)"
        ),
        status="WSKAZANE",
        uwagi_pl=(
            "funkcja rusza, gdy wielkość decydująca osiąga próg nastawy; współczynniki czułości "
            "IRiESD II.4.5.4.1.4 nie są treścią repozytorium — kryterium porównuje z progiem"
        ),
    )


def _podstawa_cti(cti_s: float) -> PodstawaWymagania:
    konfiguracja = CoordinationConfig()
    return PodstawaWymagania(
        rodzaj="ZALOZENIE_PROJEKTOWE",
        dokument="Założenia koordynacji zabezpieczeń projektu (odstęp czasowy selektywności)",
        wydanie="konfiguracja koordynacji MV-DESIGN-PRO",
        jednostka_redakcyjna=(
            f"CTI = czas własny wyłącznika {_liczba(konfiguracja.breaker_time_s)} s + wybieg "
            f"przekaźnika {_liczba(konfiguracja.relay_overtravel_s)} s + zapas "
            f"{_liczba(konfiguracja.safety_factor_s)} s = {_liczba(cti_s)} s"
        ),
        status="WSKAZANE",
        uwagi_pl="ten sam odstęp co w koordynacji zabezpieczeń nadprądowych",
    )


_NIEPEWNOSC = Niepewnosc(
    nie_dotyczy=True,
    powod_pl=(
        "wielkości z rozwiązania liniowego sieci składowych symetrycznych i czas z "
        "charakterystyki nastawy — bez dyskretyzacji, niepewność numeryczna nie dotyczy"
    ),
)


def _zakres(c: float, *, awsc: bool) -> ZakresWaznosci:
    wykluczenia = [
        "zwarcie przez rezystancję przejścia R_F > 0 (zwarcia wysokooporowe)",
        "konduktancja upływu linii i kabli G0 (pominięta)",
        "błędy przekładników toru 3I0 i 3U0 (przekładniki idealne)",
        "stany przejściowe zapłonu i gaszenia łuku",
        "czas własny wyłącznika i przekaźnika poza zwłoką nastawy",
        "zadziałanie funkcji nadprądowych fazowych (50/51) przy zwarciu doziemnym — ocenia je "
        "ocena nadprądowa przy zwarciach IEC 60909",
    ]
    if awsc:
        wykluczenia.append(
            "wymuszenie AWSC trwa do wyłączenia zwarcia; pobudzenie trwające przez chwilę "
            "załączenia wymuszenia nie przerywa odmierzania zwłoki"
        )
    return ZakresWaznosci(
        rodzaj_analizy="SHORT_CIRCUIT",
        opis_pl=(
            "Zwarcie jednofazowe z ziemią w węzłach sieci SN, stan ustalony, napięcie przed "
            f"zwarciem c·U_n/√3 (c = {_liczba(c)}, IEC 60909-0 tabela 1)"
        ),
        wykluczenia=tuple(wykluczenia),
    )


def _dowod(odniesienie: str, dane: tuple[DanaPrzyjeta, ...]) -> StatusDowodu:
    zdolnosc = classify_dynamic_capability(ZDOLNOSC_OCENY)
    return StatusDowodu(
        metoda="OBLICZENIE",
        poziom=zdolnosc.tier,
        rodzaj_twierdzenia=zdolnosc.claim_kind,
        status_modelu="NIE_DOTYCZY",
        status_danych=(
            StatusDanych(stan="UNVALIDATED_INPUT", dane_przyjete=dane)
            if dane
            else StatusDanych(stan="ZWALIDOWANE")
        ),
        odniesienie=odniesienie,
    )


@dataclass(frozen=True)
class RekordOcenyZiemnozwarciowej:
    """Jeden rekord kryterium funkcji ziemnozwarciowej (albo uziemienia stacji)."""

    urzadzenie_ref: str
    nazwa_urzadzenia_pl: str
    funkcja_ref: str | None
    kod: str | None
    kryterium: str
    ocena: OcenaKryterium
    punkty: tuple[DzialaniePunktu, ...] = ()
    dodatkowe: Mapping[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        # Rekord buduje wyłącznie ten moduł — kryterium spoza listy to błąd programu.
        assert (
            self.kryterium.split(":", 1)[0] in KRYTERIA_ZIEMNOZWARCIOWE
        ), f"Kryterium spoza listy rodzajów oceny: {self.kryterium!r}"

    @property
    def wynik_pl(self) -> str | None:
        """Wynik do kolumny „Wynik” (ekran, karta nastaw, raport PDF/DOCX — jeden zapis):
        liczba z jednostką zapisem generatora werdyktu (``format_wielkosc``, ≤ 4 cyfry znaczące).
        Funkcja kierunkowa (67N) ocenia RZUT prądu 3I₀ na kierunek działania — wynik mówi to
        wprost, a ujemny rzut (prąd w kierunku przeciwnym do kierunku działania) jest nazwany,
        nie zostawiony gołym minusem."""
        wynik = self.ocena.wynik
        if wynik is None:
            return None
        tekst = format_wielkosc(wynik.wartosc)
        kierunek = self.kierunek_rzutu
        if kierunek is None:
            return tekst
        tekst = f"rzut na kierunek działania: {tekst}"
        return f"{tekst} (kierunek przeciwny)" if kierunek == "PRZECIWNY" else tekst

    @property
    def limit_pl(self) -> str | None:
        """Wartość wymagana tym samym zapisem co wynik; ``None`` — kryterium bez limitu
        liczbowego (np. odmowa oceny, brak podstawy limitu)."""
        limit = self.ocena.limit
        if limit is None or limit.wartosc is None:
            return None
        return format_wielkosc(limit.wartosc)

    @property
    def kierunek_rzutu(self) -> KierunekRzutu | None:
        """Kierunek prądu 3I₀ względem kierunku działania (osi charakterystyki) funkcji
        kierunkowej 67N — pole danych rekordu, nie zapis do sformatowania przez ekran:
        ``ZGODNY`` (rzut ≥ 0: prąd w kierunku działania), ``PRZECIWNY`` (rzut < 0: prąd
        w kierunku przeciwnym, np. zwarcie za plecami zabezpieczenia). ``None`` — wynik nie jest
        rzutem (funkcja bezkierunkowa, napięciowa, uziemienie) albo brak wyniku."""
        wynik = self.ocena.wynik
        if wynik is None or self.kod is None:
            return None
        if _RODZAJ_WIELKOSCI.get(self.kod) != "RZUT_PRADU":
            return None
        return "PRZECIWNY" if wynik.wartosc.wartosc < 0 else "ZGODNY"

    def to_dict(self) -> dict[str, Any]:
        return {
            "urzadzenie_ref": self.urzadzenie_ref,
            "nazwa_urzadzenia_pl": self.nazwa_urzadzenia_pl,
            "funkcja_ref": self.funkcja_ref,
            "kod": self.kod,
            "etykieta_pl": etykieta_funkcji_eaz(self.kod) if self.kod else None,
            "kryterium": self.kryterium,
            "kryterium_pl": KRYTERIA_ZIEMNOZWARCIOWE[self.kryterium.split(":", 1)[0]],
            "status": self.ocena.status_maszynowy,
            "zdanie_pl": self.ocena.wyjasnienie.zdanie_pl,
            "wynik_pl": self.wynik_pl,
            "kierunek_rzutu": self.kierunek_rzutu,
            "limit_pl": self.limit_pl,
            "punkty": [p.to_dict() for p in self.punkty],
            **dict(self.dodatkowe),
            "ocena": self.ocena.model_dump(mode="json"),
        }


def _przedmiot(f: FunkcjaZiemnozwarciowa, opis: str) -> Przedmiot:
    return Przedmiot(
        element_ref=f.urzadzenie_ref,
        nazwa_pl=f.nazwa_urzadzenia_pl,
        opis_pl=f"Funkcja {f.etykieta_pl} — {opis}",
    )


def _rekord_liczbowy(
    f: FunkcjaZiemnozwarciowa,
    *,
    kryterium: str,
    opis_przedmiotu: str,
    opis_kryterium: str,
    warunek_latex: str,
    relacja: str,
    wielkosc_pl: str,
    symbol: str,
    wartosc: float,
    jednostka: str,
    limit: float,
    podstawa: PodstawaWymagania,
    punkt_pl: str,
    c: float,
    awsc: bool,
    odniesienie: str,
    dane: tuple[DanaPrzyjeta, ...],
    punkty: Sequence[DzialaniePunktu],
    dodatkowe: Mapping[str, Any],
) -> RekordOcenyZiemnozwarciowej:
    ocena = ocen_kryterium(
        kryterium_id=f"zabezpieczenia.ziemnozwarciowe.{f.urzadzenie_ref}.{f.funkcja_ref}.{kryterium}",
        przedmiot=_przedmiot(f, opis_przedmiotu),
        kryterium=Kryterium(opis_pl=opis_kryterium, warunek_latex=warunek_latex, relacja=relacja),
        podstawa=podstawa,
        stosowalnosc=Stosowalnosc(
            dotyczy=True,
            powod_pl=(
                "funkcja ziemnozwarciowa włączona w sterowniku modelu, strefa i wielkości "
                "pomiarowe wyznaczone z topologii i rozpływu składowej zerowej"
            ),
        ),
        wynik=WynikKryterium(
            wielkosc_pl=wielkosc_pl,
            symbol_latex=symbol,
            wartosc=Wielkosc(wartosc=wartosc, jednostka=jednostka),
            punkt_krytyczny_pl=punkt_pl,
            metoda="OBLICZENIE",
        ),
        limit=LimitKryterium(
            wartosc=Wielkosc(wartosc=limit, jednostka=jednostka), podstawa=podstawa
        ),
        niepewnosc=_NIEPEWNOSC,
        dowod=_dowod(odniesienie, dane),
        zakres_waznosci=_zakres(c, awsc=awsc),
        slad=[
            OdnosnikSladu(
                krok=f"zabezpieczenia_ziemnozwarciowe:{f.klucz}:{kryterium}",
                opis_pl=(
                    "rozpływ składowej zerowej solvera doziemień SN (prawo Kirchhoffa dla "
                    "strefy pola) i czas funkcji z nastaw"
                ),
            )
        ],
    )
    return RekordOcenyZiemnozwarciowej(
        urzadzenie_ref=f.urzadzenie_ref,
        nazwa_urzadzenia_pl=f.nazwa_urzadzenia_pl,
        funkcja_ref=f.funkcja_ref,
        kod=f.kod,
        kryterium=kryterium,
        ocena=ocena,
        punkty=tuple(punkty),
        dodatkowe=dodatkowe,
    )


def _rekord_nie_dotyczy(
    f: FunkcjaZiemnozwarciowa, *, kryterium: str, opis: str, powod: str, c: float
) -> RekordOcenyZiemnozwarciowej:
    ocena = ocen_kryterium(
        kryterium_id=f"zabezpieczenia.ziemnozwarciowe.{f.urzadzenie_ref}.{f.funkcja_ref}.{kryterium}",
        przedmiot=_przedmiot(f, opis),
        kryterium=Kryterium(opis_pl=opis, warunek_latex="", relacja="LOGICZNE"),
        podstawa=_podstawa_nastawy(f),
        stosowalnosc=Stosowalnosc(dotyczy=False, powod_pl=powod),
        wynik=None,
        limit=None,
        niepewnosc=_NIEPEWNOSC,
        dowod=_dowod("ocena ziemnozwarciowa", ()),
        zakres_waznosci=_zakres(c, awsc=False),
        slad=[OdnosnikSladu(krok=f"zabezpieczenia_ziemnozwarciowe:{f.klucz}", opis_pl=powod)],
    )
    return RekordOcenyZiemnozwarciowej(
        urzadzenie_ref=f.urzadzenie_ref,
        nazwa_urzadzenia_pl=f.nazwa_urzadzenia_pl,
        funkcja_ref=f.funkcja_ref,
        kod=f.kod,
        kryterium=kryterium,
        ocena=ocena,
    )


def rekord_odmowy(
    *,
    urzadzenie_ref: str,
    nazwa_pl: str,
    funkcja_ref: str | None,
    kod: str | None,
    braki: Sequence[PozycjaGotowosci],
) -> RekordOcenyZiemnozwarciowej:
    """Rekord ``NIE_OCENIONO`` funkcji wstrzymanej nazwanymi brakami modelu."""
    from application.ocena_niewykonana import ocena_niewykonana
    from werdykt import ClaimKind, EvidenceTier

    etykieta = etykieta_funkcji_eaz(kod) if kod else "ziemnozwarciowa"
    # Wiersz oceny nazywa urządzenie i funkcję — lista braków nastaw bez powtórzenia podmiotu.
    braki_pl = zdania_brakow(braki, z_funkcja=kod is None)
    ocena = ocena_niewykonana(
        kryterium_id=f"zabezpieczenia.ziemnozwarciowe.{urzadzenie_ref}.{funkcja_ref or 'siec'}",
        przedmiot=Przedmiot(
            element_ref=urzadzenie_ref,
            nazwa_pl=nazwa_pl,
            opis_pl=f"Funkcja {etykieta} — ocena wstrzymana brakami modelu",
        ),
        opis_kryterium_pl=(
            f"Czułość, selektywność i czas działania funkcji {etykieta} przy zwarciu doziemnym"
        ),
        podstawa=PodstawaWymagania(
            rodzaj="ZALOZENIE_PROJEKTOWE",
            dokument=f"Nastawy zabezpieczenia {nazwa_pl} zapisane w modelu sieci projektu",
            # Podstawą kryterium są nastawy z modelu (wskazane); ich brak jest brakiem DANYCH
            # (krok WYNIK), nie brakiem dokumentu źródłowego podstawy.
            wydanie="model sieci biegu oceny (odcisk migawki w kopercie biegu)",
            jednostka_redakcyjna="nastawy funkcji sterownika (karta pola)",
            status="WSKAZANE",
            uwagi_pl="nastawy albo tor pomiarowy funkcji niekompletne — patrz braki",
        ),
        powod_stosowalnosci_pl="funkcja ziemnozwarciowa włączona w sterowniku modelu",
        rodzaj_twierdzenia=ClaimKind.STATIC_CALCULATION,
        poziom=EvidenceTier.UNVALIDATED_MODEL,
        status_modelu="NIE_DOTYCZY",
        zakres_waznosci=ZakresWaznosci(
            rodzaj_analizy="SHORT_CIRCUIT",
            opis_pl="Ocena ziemnozwarciowa funkcji — wstrzymana do uzupełnienia modelu",
        ),
        powod_braku_niepewnosci_pl="ocena się nie odbyła — niepewność nie dotyczy",
        czego_brakuje=braki_pl,
        przyczyna="BRAK_DANYCH",
    )
    return RekordOcenyZiemnozwarciowej(
        urzadzenie_ref=urzadzenie_ref,
        nazwa_urzadzenia_pl=nazwa_pl,
        funkcja_ref=funkcja_ref,
        kod=kod,
        kryterium="ODMOWA",
        ocena=ocena,
        dodatkowe={"braki": [b.to_dict() for b in braki], "braki_pl": list(braki_pl)},
    )


# ---------------------------------------------------------------------------
# 5. Ocena funkcji
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class WynikOcenyZiemnozwarciowej:
    funkcje: tuple[FunkcjaZiemnozwarciowa, ...]
    oceny: tuple[RekordOcenyZiemnozwarciowej, ...]
    odmowy: tuple[RekordOcenyZiemnozwarciowej, ...]
    obliczenie: ObliczenieDoziemne | None
    #: uziemienia stacji (PN-EN 50522) z tego samego rozwiązania sieci zerowej
    uziemienia: tuple[RekordOcenyZiemnozwarciowej, ...] = ()
    wyniki_uziemien: tuple[WynikUziemieniaStacji, ...] = ()
    #: jeden wiersz na funkcję w zestawie kolumn jej rodziny (``rodziny_eaz.RODZINY_EAZ``)
    wiersze: tuple[dict[str, Any], ...] = ()
    #: pasek „Sieć” (dane stałe każdej sieci zerowej) i „Przypadek doziemienia”
    siec: tuple[dict[str, Any], ...] = ()
    przypadek: Mapping[str, Any] | None = None
    #: jeden wiersz na stację: I_E, R_E, U_E, U_T, U_Tp, R_E,max, napięcie krokowe
    wiersze_uziemien: tuple[dict[str, Any], ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "rodziny": [r.to_dict() for r in RODZINY_EAZ.values()],
            "wiersze": list(self.wiersze),
            "siec": list(self.siec),
            "przypadek": dict(self.przypadek) if self.przypadek is not None else None,
            "wiersze_uziemien": list(self.wiersze_uziemien),
            "przypisy_uziemien": dict(PRZYPISY_UZIEMIEN_PL),
            "funkcje": [f.to_dict() for f in self.funkcje],
            "oceny": [r.to_dict() for r in self.oceny],
            "odmowy": [r.to_dict() for r in self.odmowy],
            "doziemienie": (self.obliczenie.to_dict() if self.obliczenie is not None else None),
            "uziemienia": [r.to_dict() for r in self.uziemienia],
            "wyniki_uziemien": [w.to_dict() for w in self.wyniki_uziemien],
        }


def _skladowa_wezla(
    wynik: WynikDoziemienia, punkty: Mapping[str, tuple[str, str]], wezel: str
) -> int | None:
    """Składowa sieci zerowej węzła pomiaru (``None`` — węzeł bez wyniku doziemnego)."""
    ref = punkty.get(wezel)
    if ref is None:
        return None
    for p in wynik.punkty:
        if p.punkt_ref == ref[0]:
            return p.skladowa
    return None


def _czasy_wymuszenia(
    funkcje: Sequence[FunkcjaZiemnozwarciowa],
    obliczenie: ObliczenieDoziemne,
    wynik: WynikDoziemienia,
) -> dict[str, float]:
    """Punkt zwarcia → czas załączenia wymuszenia AWSC: największa zwłoka automatyk ZAWSC TEJ
    SAMEJ sieci zerowej co punkt, które ruszają przy tym zwarciu (U0 ≥ próg). Brak pobudzonej
    ZAWSC — wymuszenia nie ma (stan po wymuszeniu nie wchodzi do oceny)."""
    zawsc = [
        (f, _skladowa_wezla(wynik, obliczenie.punkty, f.wezel_pomiaru))
        for f in funkcje
        if f.kod == "ZAWSC" and not f.braki and f.wezel_pomiaru is not None
    ]
    czasy: dict[str, float] = {}
    for punkt in wynik.punkty:
        if punkt.stan != STAN_PRZED:
            continue
        zwloki = [
            float(f.zwloka_s)
            for f, skladowa in zawsc
            if f.zwloka_s is not None
            and skladowa == punkt.skladowa
            and punkt.pole(f.klucz).u0_proc >= float(f.nastawy["prog_u0_proc"])
        ]
        if zwloki:
            czasy[punkt.punkt_ref] = max(zwloki)
    return czasy


def dzialania_funkcji(
    f: FunkcjaZiemnozwarciowa,
    wynik: WynikDoziemienia,
    czasy_wymuszenia: Mapping[str, float],
    skladowa: int | None,
) -> list[DzialaniePunktu]:
    """Działanie funkcji przy zwarciu w każdym punkcie jej sieci zerowej."""
    wyniki: list[DzialaniePunktu] = []
    for przed in wynik.punkty:
        if przed.stan != STAN_PRZED or przed.skladowa != skladowa:
            continue
        po = wynik.punkt(przed.punkt_ref, STAN_PO_AWSC)
        wyniki.append(dzialanie_w_punkcie(f, przed, po, czasy_wymuszenia.get(przed.punkt_ref)))
    return wyniki


def _klucz_najgorszy(d: DzialaniePunktu) -> tuple[int, float, float, str]:
    """Punkt decydujący czułości (``max``): najpierw punkty, w których funkcja nie działa, potem
    najmniejsza wielkość decydująca (najmniejszy zapas do progu — próg jest wspólny dla
    wszystkich punktów funkcji), potem najdłuższy czas. Sam czas nie wystarcza: przy
    charakterystyce niezależnej czas jest równy w każdym punkcie, a rekord musi podać
    najmniejszą wartość strefy, nie dowolną."""
    return (
        1 if d.t_zadzialania_s is None else 0,
        -d.wartosc,
        _NIE_DZIALA if d.t_zadzialania_s is None else d.t_zadzialania_s,
        d.punkt_ref,
    )


def ocen_funkcje(
    funkcje: Sequence[FunkcjaZiemnozwarciowa],
    obliczenie: ObliczenieDoziemne,
    *,
    odniesienie: str,
) -> tuple[list[RekordOcenyZiemnozwarciowej], dict[str, list[DzialaniePunktu]]]:
    """Rekordy czułości, selektywności i stopniowania czasowego każdej gotowej funkcji oraz
    działanie każdej funkcji w każdym punkcie (c_min) — wejście czasu trwania zwarcia t_F.
    """
    cti = CoordinationConfig().get_minimum_grading_margin_s()
    rekordy: list[RekordOcenyZiemnozwarciowej] = []
    gotowe = przygotuj_funkcje(
        [f for f in funkcje if not f.braki and f.wezel_pomiaru is not None], obliczenie
    )
    wymuszenie_min = _czasy_wymuszenia(gotowe, obliczenie, obliczenie.wynik_min)
    wymuszenie_max = _czasy_wymuszenia(gotowe, obliczenie, obliczenie.wynik_max)
    dzialania_min: dict[str, list[DzialaniePunktu]] = {}
    for f in gotowe:
        assert f.wezel_pomiaru is not None
        dane = obliczenie.dane_przyjete + f.przyjete
        skladowa = _skladowa_wezla(obliczenie.wynik_min, obliczenie.punkty, f.wezel_pomiaru)
        if skladowa is None:
            rekordy.append(
                rekord_odmowy(
                    urzadzenie_ref=f.urzadzenie_ref,
                    nazwa_pl=f.nazwa_urzadzenia_pl,
                    funkcja_ref=f.funkcja_ref,
                    kod=f.kod,
                    braki=(
                        PozycjaGotowosci(
                            kod=KOD_POZA_SIECIA_SN,
                            komunikat_pl=(
                                f"Miejsce pomiaru funkcji {f.etykieta_pl} zabezpieczenia "
                                f"{f.nazwa_urzadzenia_pl} nie leży w sieci SN modelu z drogą "
                                "prądu zerowego."
                            ),
                            akcja_naprawcza_pl=(
                                "Sprawdź przypisanie sterownika do pola SN i zasilanie sieci."
                            ),
                            funkcja=f.kod,
                        ),
                    ),
                )
            )
            continue
        dmin = dzialania_funkcji(f, obliczenie.wynik_min, wymuszenie_min, skladowa)
        dmax = dzialania_funkcji(f, obliczenie.wynik_max, wymuszenie_max, skladowa)
        dzialania_min[f.klucz] = dmin
        awsc = any(d.t_wymuszenia_s is not None for d in dmin)
        jednostka = _JEDNOSTKA[f.rodzaj]
        symbol = _SYMBOL[f.rodzaj]
        opis_wielkosci = _OPIS_WIELKOSCI[f.rodzaj]
        podstawa = _podstawa_nastawy(f)
        w_strefie = dmin if f.rodzaj == "U0" else [d for d in dmin if d.w_strefie]
        # --- czułość -------------------------------------------------------------------
        if not w_strefie:
            rekordy.append(
                _rekord_nie_dotyczy(
                    f,
                    kryterium="CZULOSC",
                    opis="czułość przy zwarciu w strefie",
                    powod=(
                        "w strefie pola nie ma węzła sieci SN z drogą prądu zerowego — zwarcie "
                        "doziemne w strefie nie wymusza prądu 3I0 przez przekładnik pola"
                    ),
                    c=obliczenie.c_min,
                )
            )
        else:
            najgorszy = max(w_strefie, key=_klucz_najgorszy)
            stan_pl = ETYKIETY_STANU_PL[najgorszy.stan_decydujacy]
            rekordy.append(
                _rekord_liczbowy(
                    f,
                    kryterium="CZULOSC",
                    opis_przedmiotu="czułość przy zwarciu doziemnym w strefie",
                    opis_kryterium=(
                        f"Przy zwarciu doziemnym w każdym węźle strefy {opis_wielkosci} osiąga "
                        f"próg nastawy funkcji {f.etykieta_pl} — funkcja ruszy"
                        if f.rodzaj != "U0"
                        else f"Przy zwarciu doziemnym w każdym węźle sieci napięcie U0 w miejscu "
                        f"pomiaru osiąga próg funkcji {f.etykieta_pl}"
                    ),
                    warunek_latex=rf"\min_{{k \in S}} {symbol}(k) \ge {symbol}_{{s}}",
                    relacja="NIE_MNIEJ",
                    wielkosc_pl=opis_wielkosci,
                    symbol=symbol,
                    wartosc=najgorszy.wartosc,
                    jednostka=jednostka,
                    limit=f.prog,
                    podstawa=podstawa,
                    punkt_pl=f"zwarcie w punkcie {najgorszy.nazwa_pl} ({stan_pl})",
                    c=obliczenie.c_min,
                    awsc=awsc,
                    odniesienie=odniesienie,
                    dane=dane,
                    punkty=w_strefie,
                    dodatkowe={
                        "punkt_ref": najgorszy.punkt_ref,
                        "nazwa_punktu_pl": najgorszy.nazwa_pl,
                        "t_zadzialania_s": najgorszy.t_zadzialania_s,
                        "stan": najgorszy.stan_decydujacy,
                        "wartosc": najgorszy.wartosc,
                        "jednostka": jednostka,
                        "prog": f.prog,
                    },
                )
            )
            if f.rodzaj in _Z_ROZRUCHEM_U0:
                prog_u0 = float(f.nastawy["prog_u0_proc"])
                najnizsze = min(
                    w_strefie,
                    key=lambda d: (
                        (
                            d.u0_po
                            if d.stan_decydujacy == STAN_PO_AWSC and d.u0_po is not None
                            else d.u0_przed
                        ),
                        d.punkt_ref,
                    ),
                )
                u0 = (
                    najnizsze.u0_po
                    if najnizsze.stan_decydujacy == STAN_PO_AWSC and najnizsze.u0_po is not None
                    else najnizsze.u0_przed
                )
                rekordy.append(
                    _rekord_liczbowy(
                        f,
                        kryterium="ROZRUCH_U0",
                        opis_przedmiotu="rozruch napięciowy przy zwarciu doziemnym w strefie",
                        opis_kryterium=(
                            "Przy zwarciu doziemnym w każdym węźle strefy napięcie U0 osiąga "
                            f"próg rozruchowy funkcji {f.etykieta_pl}"
                        ),
                        warunek_latex=r"\min_{k \in S} U_0(k) \ge U_{0s}",
                        relacja="NIE_MNIEJ",
                        wielkosc_pl=_OPIS_WIELKOSCI["U0"],
                        symbol=_SYMBOL["U0"],
                        wartosc=u0,
                        jednostka=_JEDNOSTKA["U0"],
                        limit=prog_u0,
                        podstawa=podstawa,
                        punkt_pl=f"zwarcie w punkcie {najnizsze.nazwa_pl}",
                        c=obliczenie.c_min,
                        awsc=awsc,
                        odniesienie=odniesienie,
                        dane=dane,
                        punkty=(),
                        dodatkowe={
                            "punkt_ref": najnizsze.punkt_ref,
                            "nazwa_punktu_pl": najnizsze.nazwa_pl,
                            "wartosc": u0,
                            "jednostka": _JEDNOSTKA["U0"],
                            "prog": prog_u0,
                        },
                    )
                )
        # --- selektywność -----------------------------------------------------------------
        if f.rodzaj == "U0":
            rekordy.append(
                _rekord_nie_dotyczy(
                    f,
                    kryterium="SELEKTYWNOSC",
                    opis="selektywność przy zwarciu poza strefą",
                    powod=(
                        f"funkcja {f.etykieta_pl} mierzy napięcie zerowe całej sieci — z zasady "
                        "działania rusza przy zwarciu doziemnym w dowolnym miejscu sieci "
                        "(zabezpieczenie rezerwowe i sygnalizacja), selektywność nie dotyczy"
                    ),
                    c=obliczenie.c_max,
                )
            )
        else:
            poza = [d for d in dmax if not d.w_strefie]
            if not poza:
                rekordy.append(
                    _rekord_nie_dotyczy(
                        f,
                        kryterium="SELEKTYWNOSC",
                        opis="selektywność przy zwarciu poza strefą",
                        powod="w sieci zerowej pola nie ma węzła SN poza strefą pola",
                        c=obliczenie.c_max,
                    )
                )
            else:

                def _maks(d: DzialaniePunktu) -> float:
                    wartosci = [d.wartosc_przed]
                    if d.wartosc_po is not None:
                        wartosci.append(d.wartosc_po)
                    return max(wartosci)

                najgorszy_poza = max(poza, key=lambda d: (_maks(d), d.punkt_ref))
                rekordy.append(
                    _rekord_liczbowy(
                        f,
                        kryterium="SELEKTYWNOSC",
                        opis_przedmiotu="selektywność przy zwarciu doziemnym poza strefą",
                        opis_kryterium=(
                            f"Przy zwarciu doziemnym poza strefą pola (szyny, linie sąsiednie) "
                            f"{opis_wielkosci} nie osiąga progu funkcji {f.etykieta_pl} — "
                            "funkcja nie zadziała zbędnie"
                        ),
                        warunek_latex=rf"\max_{{k \notin S}} {symbol}(k) \le {symbol}_{{s}}",
                        relacja="NIE_WIECEJ",
                        wielkosc_pl=opis_wielkosci,
                        symbol=symbol,
                        wartosc=_maks(najgorszy_poza),
                        jednostka=jednostka,
                        limit=f.prog,
                        podstawa=podstawa,
                        punkt_pl=f"zwarcie poza strefą w punkcie {najgorszy_poza.nazwa_pl}",
                        c=obliczenie.c_max,
                        awsc=awsc,
                        odniesienie=odniesienie,
                        dane=dane,
                        punkty=poza,
                        dodatkowe={
                            "punkt_ref": najgorszy_poza.punkt_ref,
                            "nazwa_punktu_pl": najgorszy_poza.nazwa_pl,
                            "wartosc": _maks(najgorszy_poza),
                            "jednostka": jednostka,
                            "prog": f.prog,
                            "t_zadzialania_s": najgorszy_poza.t_zadzialania_s,
                        },
                    )
                )

    # --- stopniowanie czasowe -----------------------------------------------------------------
    rekordy.extend(
        _stopniowanie(
            gotowe,
            dzialania_min,
            cti=cti,
            obliczenie=obliczenie,
            odniesienie=odniesienie,
        )
    )
    return rekordy, dzialania_min


def _stopniowanie(
    gotowe: Sequence[FunkcjaZiemnozwarciowa],
    dzialania_min: Mapping[str, Sequence[DzialaniePunktu]],
    *,
    cti: float,
    obliczenie: ObliczenieDoziemne,
    odniesienie: str,
) -> list[RekordOcenyZiemnozwarciowej]:
    """Funkcja nadrzędna A × zabezpieczenie podrzędne B: przy każdym zwarciu w strefie B, przy
    którym działają oba, A działa co najmniej o CTI później niż B. Czas B w punkcie = najkrótszy
    czas jego funkcji ziemnozwarciowych, które w tym punkcie działają (wyłącznik otwiera
    pierwsza). Podrzędne = strefa B zawarta właściwie w strefie A; dla 59N (napięcie zerowe całej
    sieci) — każde zabezpieczenie pola z funkcją prądową albo admitancyjną. ZAWSC nie wyłącza
    zwarcia (automatyka), więc nie jest stroną stopniowania."""
    zabezpieczenia_pol: dict[str, list[FunkcjaZiemnozwarciowa]] = {}
    for f in gotowe:
        if f.rodzaj != "U0" and f.strefa is not None and f.klucz in dzialania_min:
            zabezpieczenia_pol.setdefault(f.urzadzenie_ref, []).append(f)
    rekordy: list[RekordOcenyZiemnozwarciowej] = []
    for a in gotowe:
        if a.kod == "ZAWSC" or a.klucz not in dzialania_min:
            continue
        for b_ref in sorted(zabezpieczenia_pol):
            funkcje_b = zabezpieczenia_pol[b_ref]
            if b_ref == a.urzadzenie_ref:
                continue
            strefa_b = funkcje_b[0].strefa
            assert strefa_b is not None
            if a.rodzaj != "U0" and (a.strefa is None or not strefa_b.wezly < a.strefa.wezly):
                continue
            czasy_b: dict[str, float] = {}
            for fb in funkcje_b:
                for d in dzialania_min[fb.klucz]:
                    if d.w_strefie and d.t_zadzialania_s is not None:
                        czasy_b[d.punkt_ref] = min(
                            czasy_b.get(d.punkt_ref, _NIE_DZIALA), d.t_zadzialania_s
                        )
            # Para (działanie A, czas A, czas B) wyłącznie z punktów, w których działają OBIE
            # funkcje — czas A zawężony raz, przy budowie pary (bez podstawienia za brak).
            pary: list[tuple[DzialaniePunktu, float, float]] = []
            for da in dzialania_min[a.klucz]:
                if da.punkt_ref in czasy_b and da.t_zadzialania_s is not None:
                    pary.append((da, da.t_zadzialania_s, czasy_b[da.punkt_ref]))
            if not pary:
                continue
            da, t_a, t_b = min(pary, key=lambda p: (p[1] - p[2], p[0].punkt_ref))
            odstep = t_a - t_b
            nazwa_b = funkcje_b[0].nazwa_urzadzenia_pl
            rekordy.append(
                _rekord_liczbowy(
                    a,
                    kryterium=f"STOPNIOWANIE_CZASOWE:{b_ref}",
                    opis_przedmiotu=f"stopniowanie czasowe względem zabezpieczenia {nazwa_b}",
                    opis_kryterium=(
                        f"Funkcja {a.etykieta_pl} zabezpieczenia {a.nazwa_urzadzenia_pl} działa co "
                        f"najmniej o odstęp CTI później niż zabezpieczenie {nazwa_b} (jego "
                        "najszybsza funkcja ziemnozwarciowa) przy każdym zwarciu doziemnym "
                        f"w strefie {nazwa_b}, przy którym działają oba"
                    ),
                    warunek_latex=r"\min_k\,(t_A(k) - t_B(k)) \ge \Delta t_{CTI}",
                    relacja="NIE_MNIEJ",
                    wielkosc_pl="odstęp czasów zadziałania nadrzędnego i podrzędnego",
                    symbol=r"t_A - t_B",
                    wartosc=odstep,
                    jednostka="s",
                    limit=cti,
                    podstawa=_podstawa_cti(cti),
                    punkt_pl=f"zwarcie w punkcie {da.nazwa_pl}",
                    c=obliczenie.c_min,
                    awsc=da.t_wymuszenia_s is not None,
                    odniesienie=odniesienie,
                    dane=obliczenie.dane_przyjete,
                    punkty=(),
                    dodatkowe={
                        "punkt_ref": da.punkt_ref,
                        "nazwa_punktu_pl": da.nazwa_pl,
                        "urzadzenie_podrzedne_ref": b_ref,
                        "nazwa_podrzednego_pl": nazwa_b,
                        "t_nadrzednego_s": da.t_zadzialania_s,
                        "t_podrzednego_s": t_b,
                        "wartosc": odstep,
                        "jednostka": "s",
                        "prog": cti,
                    },
                )
            )
    return rekordy


# ---------------------------------------------------------------------------
# 5a. Wiersze rodzin: k_b, k_c, rzut w polu i poza, R_F,max, wykres wskazowy
# ---------------------------------------------------------------------------


def sposob_pracy_skladowej(skladowa: SkladowaSieciZerowej) -> SposobPracyPunktuNeutralnego:
    """Sposób pracy punktu neutralnego sieci zerowej z typów punktów neutralnych modelu."""
    typy = {typ for _, typ in skladowa.punkty_neutralne}
    if typy & {"resistor_grounded", "directly_grounded"}:
        return "UZIEMIONY_REZYSTOR"
    if "petersen_coil" in typy:
        return "KOMPENSOWANY_AWSC" if skladowa.ma_awsc else "KOMPENSOWANY"
    return "IZOLOWANY"


ETYKIETY_SPOSOBU_PRACY_PL: dict[str, str] = {
    "IZOLOWANY": "izolowany",
    "KOMPENSOWANY": "skompensowany",
    "KOMPENSOWANY_AWSC": "skompensowany z AWSC",
    "UZIEMIONY_REZYSTOR": "uziemiony przez rezystor",
}


def _skladowa_obliczenia(obliczenie: ObliczenieDoziemne, numer: int) -> SkladowaSieciZerowej:
    for skladowa in obliczenie.wynik_min.skladowe:
        if skladowa.numer == numer:
            return skladowa
    raise KeyError(numer)


def przygotuj_funkcje(
    funkcje: Sequence[FunkcjaZiemnozwarciowa], obliczenie: ObliczenieDoziemne
) -> list[FunkcjaZiemnozwarciowa]:
    """Wartości robocze nastaw algorytmu 67N bez nastawy w modelu (zasada NR 4): U0> — górna
    granica zakresu IRiESD ENEA II.4.5.4.1.5 dla sposobu pracy punktu neutralnego sieci pola,
    jako dana przyjęta ESTIMATED. Idempotentna (nastawa już obecna — bez zmian)."""
    wynik: list[FunkcjaZiemnozwarciowa] = []
    for f in funkcje:
        if (
            f.kod == "67N"
            and f.wezel_pomiaru is not None
            and _liczba_dodatnia(f.nastawy.get("prog_u0_proc")) is None
        ):
            numer = _skladowa_wezla(obliczenie.wynik_min, obliczenie.punkty, f.wezel_pomiaru)
            if numer is not None:
                sposob = sposob_pracy_skladowej(_skladowa_obliczenia(obliczenie, numer))
                wartosc, zdanie = podstawa_u0_roboczego(sposob)
                f = replace(
                    f,
                    nastawy={**f.nastawy, "prog_u0_proc": wartosc},
                    przyjete=f.przyjete
                    + (
                        DanaPrzyjeta(
                            nazwa_pl=f"próg U₀> funkcji {f.etykieta_pl} ({f.nazwa_urzadzenia_pl})",
                            wartosc=Wielkosc(wartosc=wartosc, jednostka="%"),
                            powod_pl=zdanie,
                            jakosc=FieldQuality.ESTIMATED,
                        ),
                    ),
                )
        wynik.append(f)
    return wynik


def _rf_max_pola(f: FunkcjaZiemnozwarciowa, punkt: WynikPunktuDoziemienia) -> float | None:
    """R_F,max przy zwarciu w punkcie (jeden stan): każdy warunek wielkości skalowanej
    m^n (n z ``_WYKLADNIK_RF``) wyznacza mnożnik wymagany (próg/wartość)^(1/n); warunek
    niezależny od R_F (admitancja, kierunek) niespełniony przy R_F = 0 — ``None``."""
    pole = punkt.pole(f.klucz)
    if f.rodzaj == "RZUT_PRADU" and not warunki_67n(f, pole)[1].spelniony:
        return None
    warunki: list[tuple[float, float, int]] = [
        (wielkosc_decydujaca(f, pole), f.prog, _WYKLADNIK_RF[f.rodzaj])
    ]
    if f.rodzaj in _Z_ROZRUCHEM_U0:
        warunki.append((pole.u0_proc, float(f.nastawy["prog_u0_proc"]), 1))
    mnoznik = 0.0
    for wartosc, prog, wykladnik in warunki:
        if wykladnik == 0:
            if wartosc < prog:
                return None
            continue
        if wartosc <= 0:
            return None
        mnoznik = max(mnoznik, (prog / wartosc) ** (1.0 / wykladnik))
    r_f = rezystancja_przejscia_dla_mnoznika(punkt, mnoznik)
    return None if r_f is None or math.isinf(r_f) else r_f


def _rf_max_funkcji(
    f: FunkcjaZiemnozwarciowa, obliczenie: ObliczenieDoziemne, w_strefie: Sequence[DzialaniePunktu]
) -> tuple[float | None, str | None]:
    """R_F,max funkcji = minimum po punktach strefy; w punkcie — większa z wartości stanów
    przed i po wymuszeniu AWSC (funkcja wykrywa w którymkolwiek). ``(None, punkt)`` — w punkcie
    funkcja nie wykrywa doziemienia nawet metalicznego."""
    najmniejsza: tuple[float, str] | None = None
    for d in w_strefie:
        wartosci: list[float] = []
        for stan in (STAN_PRZED, STAN_PO_AWSC):
            punkt = obliczenie.wynik_min.punkt(d.punkt_ref, stan)
            if punkt is None or (stan == STAN_PO_AWSC and d.t_wymuszenia_s is None):
                continue
            r_f = _rf_max_pola(f, punkt)
            if r_f is not None:
                wartosci.append(r_f)
        if not wartosci:
            return None, d.nazwa_pl
        kandydat = (max(wartosci), d.nazwa_pl)
        if najmniejsza is None or kandydat[0] < najmniejsza[0]:
            najmniejsza = kandydat
    return (najmniejsza[0], najmniejsza[1]) if najmniejsza else (None, None)


#: Doziemienie oporowe IRiESD ENEA II.4.5.4.1.4 ppkt 2: składowa zerowa napięcia = 50 %
#: napięcia fazowego sieci.
U0_DOZIEMIENIA_OPOROWEGO_PROC = 50.0


def _k_c_opor(
    f: FunkcjaZiemnozwarciowa, obliczenie: ObliczenieDoziemne, w_strefie: Sequence[DzialaniePunktu]
) -> tuple[float | None, str | None]:
    """Najmniejszy k_c przy doziemieniu oporowym (U0 w miejscu pomiaru = 50 % U0n): wielkość
    decydująca liniowa w I0f skalowana mnożnikiem m = 50 %/U0(R_F = 0). Punkty, w których U0
    przy zwarciu metalicznym nie przekracza 50 %, nie mają takiego doziemienia (pominięte)."""
    najmniejszy: tuple[float, str] | None = None
    for d in w_strefie:
        punkt = obliczenie.wynik_min.punkt(d.punkt_ref, STAN_PRZED)
        if punkt is None:
            continue
        pole = punkt.pole(f.klucz)
        if pole.u0_proc <= U0_DOZIEMIENIA_OPOROWEGO_PROC:
            continue
        m = U0_DOZIEMIENIA_OPOROWEGO_PROC / pole.u0_proc
        k = wielkosc_decydujaca(f, pole) * m / f.prog
        if najmniejszy is None or k < najmniejszy[0]:
            najmniejszy = (k, d.nazwa_pl)
    return (najmniejszy[0], najmniejszy[1]) if najmniejszy else (None, None)


def _wskaz(
    f: FunkcjaZiemnozwarciowa, pole: WielkosciPola, rola: str, punkt_pl: str
) -> dict[str, Any]:
    kat = pole.kat_phi0_deg if pole.kat_phi0_deg is not None else 0.0
    modul = abs(pole.prad_3i0_a)
    warunki = warunki_67n(f, pole)
    return {
        "rola": rola,
        "punkt_pl": punkt_pl,
        "modul_a": modul,
        "kat_deg": kat,
        "re_a": modul * math.cos(math.radians(kat)),
        "im_a": modul * math.sin(math.radians(kat)),
        "wielkosc_a": wielkosc_decydujaca(f, pole),
        "u0_proc": pole.u0_proc,
        "warunki": [w.to_dict() for w in warunki],
        "rozstrzygajacy": warunek_rozstrzygajacy(warunki).klucz,
        "dziala": all(w.spelniony for w in warunki),
    }


def tryb_pl(f: FunkcjaZiemnozwarciowa) -> str:
    """Zapis trybu kryterium 67N dla inżyniera (cos φ, sin φ, sektorowy)."""
    if tryb_kryterium(f) == "SEKTOR":
        return "sektorowy"
    kat = float(f.nastawy["kat_charakterystyczny_deg"])
    if abs(kat) < 1e-9:
        return "cos φ"
    if abs(abs(kat) - 90.0) < 1e-9:
        return "sin φ"
    return "rzut"


def wykres_wskazowy_67n(
    f: FunkcjaZiemnozwarciowa, wskazy: Sequence[dict[str, Any]]
) -> dict[str, Any]:
    """Dane wykresu wskazowego 67N — WYŁĄCZNIE z algorytmu oceny: układ odniesienia −U0 (0°),
    oś działania, granice sektora (wersory), próg jako odcinek prostopadły do osi (tryb rzutu)
    albo łuk o promieniu I0> (tryb sektorowy), wskazy 3I0 w polu i poza polem w amperach.
    Ekran wyłącznie mnoży przez skalę rysunku."""
    os_deg = os_charakterystyki_deg(f)
    polowa = polowa_sektora_deg(f)
    u = (math.cos(math.radians(os_deg)), math.sin(math.radians(os_deg)))
    v = (-u[1], u[0])
    granice = [
        [
            math.cos(math.radians(os_deg + znak * polowa)),
            math.sin(math.radians(os_deg + znak * polowa)),
        ]
        for znak in (-1.0, 1.0)
    ]
    skala = max([f.prog, *(w["modul_a"] for w in wskazy)]) * 1.2
    wykres: dict[str, Any] = {
        "os_deg": os_deg,
        "os": list(u),
        "granice": granice,
        "polowa_sektora_deg": polowa,
        "tryb": tryb_kryterium(f),
        "tryb_pl": tryb_pl(f),
        "prog_a": f.prog,
        "prog_u0_proc": float(f.nastawy["prog_u0_proc"]),
        "skala_a": skala,
        "wskazy": list(wskazy),
    }
    if tryb_kryterium(f) == "RZUT":
        dl = skala if polowa >= 90.0 - 1e-9 else min(f.prog * math.tan(math.radians(polowa)), skala)
        wykres["prog_odcinek"] = [
            [f.prog * u[0] - dl * v[0], f.prog * u[1] - dl * v[1]],
            [f.prog * u[0] + dl * v[0], f.prog * u[1] + dl * v[1]],
        ]
    else:
        wykres["prog_luk"] = {
            "promien_a": f.prog,
            "od": [f.prog * granice[0][0], f.prog * granice[0][1]],
            "do": [f.prog * granice[1][0], f.prog * granice[1][1]],
            "duzy_luk": polowa > 90.0,
        }
    return wykres


def _wartosc(
    wartosc: float | None,
    jednostka: str,
    *,
    spelnia: bool | None = None,
    powod_pl: str | None = None,
    tekst: str | None = None,
) -> dict[str, Any]:
    return {
        "wartosc": wartosc,
        "jednostka": jednostka,
        "spelnia": spelnia,
        "powod_pl": powod_pl,
        "tekst": tekst,
    }


_KOLEJNOSC_STANU = {
    "NIE_SPELNIA": 0,
    "NIEJEDNOZNACZNY": 1,
    "BRAK_PODSTAWY": 2,
    "BRAK_DOWODU": 3,
    "NIE_OCENIONO": 4,
    "SPELNIA": 5,
}


def stan_wiersza(rekordy: Sequence[RekordOcenyZiemnozwarciowej]) -> tuple[str, str | None]:
    """Stan wiersza = najgorszy status rekordów funkcji (NIE_DOTYCZY pominięte) i zdanie
    rekordu, który go wyznacza (podpowiedź stanu)."""
    istotne = [r for r in rekordy if r.ocena.status_maszynowy != "NIE_DOTYCZY"]
    if not istotne:
        return "NIE_OCENIONO", None
    najgorszy = min(istotne, key=lambda r: _KOLEJNOSC_STANU.get(r.ocena.status_maszynowy, 4))
    return najgorszy.ocena.status_maszynowy, najgorszy.ocena.wyjasnienie.zdanie_pl


def _rekord_wspolczynnika(
    f: FunkcjaZiemnozwarciowa,
    *,
    kryterium: str,
    opis: str,
    symbol: str,
    wartosc: float,
    wymaganie: WymaganieWspolczynnika,
    wzor_latex: str,
    punkt_pl: str,
    obliczenie: ObliczenieDoziemne,
    odniesienie: str,
    c: float,
) -> RekordOcenyZiemnozwarciowej:
    dane = obliczenie.dane_przyjete + f.przyjete
    if wymaganie.przyjete:
        dane = dane + (
            DanaPrzyjeta(
                nazwa_pl=f"wymagany {wymaganie.symbol} funkcji {f.etykieta_pl}",
                wartosc=Wielkosc(wartosc=wymaganie.wartosc, jednostka="1"),
                powod_pl=wymaganie.uzasadnienie_pl,
                jakosc=FieldQuality.ESTIMATED,
            ),
        )
    return _rekord_liczbowy(
        f,
        kryterium=kryterium,
        opis_przedmiotu=opis,
        opis_kryterium=f"{opis}: {wymaganie.symbol} nie mniejszy niż wymagany",
        warunek_latex=wzor_latex,
        relacja="NIE_MNIEJ",
        wielkosc_pl=opis,
        symbol=symbol,
        wartosc=wartosc,
        jednostka="1",
        limit=wymaganie.wartosc,
        podstawa=wymaganie.podstawa,
        punkt_pl=punkt_pl,
        c=c,
        awsc=False,
        odniesienie=odniesienie,
        dane=dane,
        punkty=(),
        dodatkowe={"wymaganie": wymaganie.to_dict()},
    )


def _maks_poza(d: DzialaniePunktu) -> float:
    return max([d.wartosc_przed] + ([d.wartosc_po] if d.wartosc_po is not None else []))


def wiersze_funkcji(
    funkcje: Sequence[FunkcjaZiemnozwarciowa],
    rekordy: Sequence[RekordOcenyZiemnozwarciowej],
    obliczenie: ObliczenieDoziemne | None,
    *,
    odniesienie: str,
    wymagania: Mapping[str, float] | None = None,
) -> tuple[list[RekordOcenyZiemnozwarciowej], list[dict[str, Any]]]:
    """Rekordy współczynników k_b, k_c, k_c(U0 = 50 %) i kierunku oraz JEDEN wiersz na funkcję
    w zestawie kolumn jej rodziny (``RODZINY_EAZ``). Wiersz niesie wyłącznie wartości
    z backendu; stan wiersza = najgorszy status rekordów funkcji, pełne wyjaśnienie zostaje
    w rekordach (``kryteria``)."""
    nowe: list[RekordOcenyZiemnozwarciowej] = []
    wiersze: list[dict[str, Any]] = []
    gotowe = (
        {
            f.klucz: f
            for f in przygotuj_funkcje(
                [f for f in funkcje if not f.braki and f.wezel_pomiaru is not None], obliczenie
            )
        }
        if obliczenie is not None
        else {}
    )
    wymuszenie_min = (
        _czasy_wymuszenia(list(gotowe.values()), obliczenie, obliczenie.wynik_min)
        if obliczenie
        else {}
    )
    wymuszenie_max = (
        _czasy_wymuszenia(list(gotowe.values()), obliczenie, obliczenie.wynik_max)
        if obliczenie
        else {}
    )
    for surowa in funkcje:
        f = gotowe.get(surowa.klucz, surowa)
        rodzina = RODZINA_KODU[f.kod]
        wpis = FUNKCJE_EAZ[f.kod]
        wartosci: dict[str, dict[str, Any]] = {}
        wymagane: dict[str, Any] = {}
        wzory: list[dict[str, str]] = []
        wykres: dict[str, Any] | None = None
        warunki: dict[str, Any] | None = None
        skladowa = (
            _skladowa_wezla(obliczenie.wynik_min, obliczenie.punkty, f.wezel_pomiaru)
            if obliczenie is not None and f.wezel_pomiaru is not None and f.klucz in gotowe
            else None
        )
        if obliczenie is not None and skladowa is not None:
            sposob = sposob_pracy_skladowej(_skladowa_obliczenia(obliczenie, skladowa))
            dmin = dzialania_funkcji(f, obliczenie.wynik_min, wymuszenie_min, skladowa)
            dmax = dzialania_funkcji(f, obliczenie.wynik_max, wymuszenie_max, skladowa)
            w_strefie = dmin if f.rodzaj == "U0" else [d for d in dmin if d.w_strefie]
            poza = [d for d in dmax if not d.w_strefie] if f.rodzaj != "U0" else []
            jedn = _JEDNOSTKA[f.rodzaj]
            if f.rodzaj != "U0":
                wartosci["prog"] = _wartosc(f.prog, jedn)
            if f.rodzaj in _Z_ROZRUCHEM_U0 or f.rodzaj == "U0":
                prog_u0 = float(f.nastawy["prog_u0_proc"])
                wartosci["u0_prog"] = _wartosc(
                    prog_u0,
                    "%",
                    powod_pl=f.przyjete[0].powod_pl if f.przyjete else None,
                )
            if f.rodzaj == "RZUT_PRADU":
                wartosci["charakterystyka"] = _wartosc(
                    os_charakterystyki_deg(f),
                    "°",
                    tekst=(
                        f"{liczba_pl(os_charakterystyki_deg(f))} ± "
                        f"{liczba_pl(polowa_sektora_deg(f))} ({tryb_pl(f)})"
                    ),
                )
            najgorszy = max(w_strefie, key=_klucz_najgorszy) if w_strefie else None
            najgorszy_poza = max(poza, key=lambda d: (_maks_poza(d), d.punkt_ref)) if poza else None
            if najgorszy is not None:
                dz = najgorszy.wartosc
                klucz_dz = "rzut_w" if f.rodzaj == "RZUT_PRADU" else "dz"
                wartosci[klucz_dz] = _wartosc(
                    dz, "%" if f.rodzaj == "U0" else jedn, spelnia=dz >= f.prog
                )
                wartosci["t"] = _wartosc(najgorszy.t_zadzialania_s, "s")
                k_c_wym = wymaganie_k_c(f.kod, sposob, wymagania)
                if k_c_wym is not None:
                    k_c = dz / f.prog
                    wartosci["k_c"] = _wartosc(k_c, "1", spelnia=k_c >= k_c_wym.wartosc)
                    wymagane["k_c"] = k_c_wym.to_dict()
                    wzor = (
                        rf"k_c = \frac{{{_SYMBOL[f.rodzaj]}_{{dz,min}}}}{{{_SYMBOL[f.rodzaj]}_s}}"
                        rf" = \frac{{{liczba_pl(dz)}}}{{{liczba_pl(f.prog)}}} = {liczba_pl(k_c)}"
                        rf" \ge {liczba_pl(k_c_wym.wartosc)}"
                    )
                    wzory.append({"symbol_latex": "k_c", "wzor_latex": wzor})
                    nowe.append(
                        _rekord_wspolczynnika(
                            f,
                            kryterium="WSPOLCZYNNIK_CZULOSCI",
                            opis="współczynnik czułości przy doziemieniu metalicznym w polu",
                            symbol="k_c",
                            wartosc=k_c,
                            wymaganie=k_c_wym,
                            wzor_latex=r"k_c = \frac{"
                            + _SYMBOL[f.rodzaj]
                            + r"_{dz,min}}{"
                            + _SYMBOL[f.rodzaj]
                            + r"_s} \ge k_{c,wym}",
                            punkt_pl=f"zwarcie w punkcie {najgorszy.nazwa_pl}",
                            obliczenie=obliczenie,
                            odniesienie=odniesienie,
                            c=obliczenie.c_min,
                        )
                    )
                k_opor_wym = wymaganie_k_c_opor(f.kod, wymagania)
                if k_opor_wym is not None:
                    k_opor, punkt_opor = _k_c_opor(f, obliczenie, w_strefie)
                    if k_opor is None:
                        wartosci["k_c_opor"] = _wartosc(
                            None,
                            "1",
                            powod_pl="U₀ przy doziemieniu metalicznym nie przekracza 50 % — "
                            "doziemienie oporowe w tej definicji nie występuje",
                        )
                    else:
                        wartosci["k_c_opor"] = _wartosc(
                            k_opor, "1", spelnia=k_opor >= k_opor_wym.wartosc
                        )
                        wymagane["k_c_opor"] = k_opor_wym.to_dict()
                        nowe.append(
                            _rekord_wspolczynnika(
                                f,
                                kryterium="WSPOLCZYNNIK_CZULOSCI_OPOR",
                                opis="współczynnik czułości przy doziemieniu oporowym "
                                "(U₀ = 50 % napięcia fazowego)",
                                symbol=r"k_{c,opor}",
                                wartosc=k_opor,
                                wymaganie=k_opor_wym,
                                wzor_latex=(
                                    r"k_{c,opor} = \frac{" + _SYMBOL[f.rodzaj] + r"\cdot "
                                    r"\frac{50\,\%}{U_0}}{" + _SYMBOL[f.rodzaj] + r"_s} "
                                    r"\ge k_{c,opor,wym}"
                                ),
                                punkt_pl=f"zwarcie w punkcie {punkt_opor}",
                                obliczenie=obliczenie,
                                odniesienie=odniesienie,
                                c=obliczenie.c_min,
                            )
                        )
                r_f_max, punkt_rf = _rf_max_funkcji(f, obliczenie, w_strefie)
                wartosci["r_f_max"] = _wartosc(
                    r_f_max,
                    "Ω",
                    spelnia=None if r_f_max is not None else False,
                    powod_pl=(
                        None
                        if r_f_max is not None
                        else f"funkcja nie wykrywa doziemienia metalicznego w punkcie {punkt_rf}"
                    ),
                )
                wzory.append(
                    {
                        "symbol_latex": "R_{F,max}",
                        "wzor_latex": WZOR_MNOZNIKA_RF_LATEX
                        + r";\quad "
                        + WZOR_RF_Z_MNOZNIKA_LATEX,
                    }
                )
            if najgorszy_poza is not None:
                wl_wartosc = _maks_poza(najgorszy_poza)
                if f.rodzaj == "RZUT_PRADU":
                    wartosci["rzut_poza"] = _wartosc(wl_wartosc, jedn, spelnia=wl_wartosc < f.prog)
                    punkt_poza = obliczenie.wynik_max.punkt(najgorszy_poza.punkt_ref, STAN_PRZED)
                    assert punkt_poza is not None
                    wartosci["wl"] = _wartosc(abs(punkt_poza.pole(f.klucz).prad_3i0_a), "A")
                else:
                    wartosci["wl"] = _wartosc(wl_wartosc, jedn, spelnia=wl_wartosc < f.prog)
                k_b_wym = wymaganie_k_b(rodzina, wymagania)
                if k_b_wym is not None:
                    wymagane["k_b"] = k_b_wym.to_dict()
                    if wl_wartosc > 0:
                        k_b = f.prog / wl_wartosc
                        wartosci["k_b"] = _wartosc(k_b, "1", spelnia=k_b >= k_b_wym.wartosc)
                        wzory.append(
                            {
                                "symbol_latex": "k_b",
                                "wzor_latex": (
                                    rf"k_b = \frac{{{_SYMBOL[f.rodzaj]}_s}}"
                                    rf"{{{_SYMBOL[f.rodzaj]}_{{wł,max}}}} = "
                                    rf"\frac{{{liczba_pl(f.prog)}}}{{{liczba_pl(wl_wartosc)}}}"
                                    rf" = {liczba_pl(k_b)} \ge {liczba_pl(k_b_wym.wartosc)}"
                                ),
                            }
                        )
                        nowe.append(
                            _rekord_wspolczynnika(
                                f,
                                kryterium="WSPOLCZYNNIK_ODSTROJENIA",
                                opis="współczynnik bezpieczeństwa nastawy wobec doziemienia "
                                "poza polem",
                                symbol="k_b",
                                wartosc=k_b,
                                wymaganie=k_b_wym,
                                wzor_latex=r"k_b = \frac{"
                                + _SYMBOL[f.rodzaj]
                                + r"_s}{"
                                + _SYMBOL[f.rodzaj]
                                + r"_{wł,max}} \ge k_{b,wym}",
                                punkt_pl=f"zwarcie poza polem w punkcie {najgorszy_poza.nazwa_pl}",
                                obliczenie=obliczenie,
                                odniesienie=odniesienie,
                                c=obliczenie.c_max,
                            )
                        )
                    else:
                        wartosci["k_b"] = _wartosc(
                            None,
                            "1",
                            powod_pl=(
                                "przy doziemieniu poza polem wielkość działania nie jest dodatnia "
                                "(prąd w kierunku przeciwnym do kierunku działania) — odstrojenie "
                                "zapewnia kierunek, k_b nie dotyczy"
                            ),
                            tekst="kierunek",
                        )
            if f.rodzaj == "RZUT_PRADU" and najgorszy is not None:
                przed_w = obliczenie.wynik_min.punkt(najgorszy.punkt_ref, najgorszy.stan_decydujacy)
                assert przed_w is not None
                wskazy = [
                    _wskaz(f, przed_w.pole(f.klucz), "W_POLU", najgorszy.nazwa_pl),
                ]
                if najgorszy_poza is not None:
                    przed_p = obliczenie.wynik_max.punkt(najgorszy_poza.punkt_ref, STAN_PRZED)
                    assert przed_p is not None
                    wskazy.append(
                        _wskaz(f, przed_p.pole(f.klucz), "POZA_POLEM", najgorszy_poza.nazwa_pl)
                    )
                wykres = wykres_wskazowy_67n(f, wskazy)
                warunki = {w["rola"]: w["warunki"] for w in wskazy}
        rekordy_f = [
            r
            for r in [*rekordy, *nowe]
            if r.urzadzenie_ref == f.urzadzenie_ref and r.funkcja_ref == f.funkcja_ref
        ]
        stan, przyczyna = stan_wiersza(rekordy_f)
        sprawdz_wartosci_wiersza(rodzina, set(wartosci))
        braki = list(surowa.braki)
        wiersze.append(
            {
                "rodzina": rodzina,
                "urzadzenie_ref": f.urzadzenie_ref,
                "funkcja_ref": f.funkcja_ref,
                "kod": f.kod,
                "ansi": wpis.ansi or f.kod,
                "oznaczenie_pl": wpis.oznaczenie_pl,
                "etykieta_pl": f.etykieta_pl,
                "pole_pl": f.pole_pl or f.nazwa_urzadzenia_pl,
                "sterownik_pl": f.nazwa_urzadzenia_pl,
                "grupa": f.grupa,
                "stan": stan,
                "przyczyna_pl": przyczyna,
                "wartosci": wartosci,
                "wymagania": wymagane,
                "wzory": wzory,
                "warunki_67n": warunki,
                "wykres_wskazowy": wykres,
                "kryteria": [r.ocena.kryterium_id for r in rekordy_f],
                "braki": [b.to_dict() for b in braki],
                "braki_pl": list(zdania_brakow(braki, z_funkcja=False)) if braki else [],
            }
        )
    return nowe, wiersze


def dane_sieci(
    funkcje: Sequence[FunkcjaZiemnozwarciowa], obliczenie: ObliczenieDoziemne
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Pasek „Sieć” (stałe dane każdej sieci zerowej: punkt neutralny, I_C, v, I_res, AWSC)
    i pasek „Przypadek doziemienia” (R_F, rodzaj, c, U0 i prąd doziemny — zależą od przypadku;
    korekta właściciela 4)."""
    zawsc = [
        (f, _skladowa_wezla(obliczenie.wynik_min, obliczenie.punkty, f.wezel_pomiaru))
        for f in funkcje
        if f.kod == "ZAWSC" and not f.braki and f.wezel_pomiaru is not None
    ]
    prady_awsc = {
        b.element_ref: b.punkt_neutralny.awsc_prad_a
        for b in obliczenie.wejscie_max.boczniki
        if b.punkt_neutralny is not None and b.punkt_neutralny.awsc_prad_a is not None
    }
    siec: list[dict[str, Any]] = []
    for skladowa in obliczenie.wynik_min.skladowe:
        sposob = sposob_pracy_skladowej(skladowa)
        prady_f = [
            abs(p.prad_doziemny_a)
            for p in obliczenie.wynik_max.punkty
            if p.skladowa == skladowa.numer and p.stan == STAN_PRZED
        ]
        i_w = [prady_awsc[r] for r, _ in skladowa.punkty_neutralne if r in prady_awsc]
        t_w = [float(f.zwloka_s) for f, n in zawsc if n == skladowa.numer and f.zwloka_s]
        siec.append(
            {
                "numer": skladowa.numer,
                "sposob": sposob,
                "sposob_pl": ETYKIETY_SPOSOBU_PRACY_PL[sposob],
                "prad_pojemnosciowy_a": skladowa.prad_pojemnosciowy_a,
                "prad_dlawikow_a": skladowa.prad_dlawikow_a if skladowa.prad_dlawikow_a else None,
                "rozstrojenie_proc": (
                    None if skladowa.rozstrojenie is None else skladowa.rozstrojenie * 100.0
                ),
                "prad_resztkowy_a": (
                    max(prady_f) if sposob.startswith("KOMPENSOWANY") and prady_f else None
                ),
                "awsc_prad_a": max(i_w) if i_w else None,
                "awsc_czas_s": max(t_w) if t_w else None,
            }
        )
    punkty = [p for p in obliczenie.wynik_min.punkty if p.stan == STAN_PRZED]
    przypadek = {
        "r_f_ohm": obliczenie.wynik_min.r_f_ohm,
        "rodzaj": "METALICZNE" if obliczenie.wynik_min.r_f_ohm == 0 else "PRZEZ_REZYSTANCJE",
        "c_min": obliczenie.c_min,
        "c_max": obliczenie.c_max,
        "u0_min_proc": min((p.u0_punktu_proc for p in punkty), default=None),
        "u0_max_proc": max((p.u0_punktu_proc for p in punkty), default=None),
        "prad_doziemny_max_a": max(
            (abs(p.prad_doziemny_a) for p in obliczenie.wynik_max.punkty), default=None
        ),
        "stany_awsc": sorted({p.stan for p in obliczenie.wynik_min.punkty}),
        "liczba_punktow": len(punkty),
    }
    return siec, przypadek


def ocen_zabezpieczenia_ziemnozwarciowe(
    enm: EnergyNetworkModel,
    graph: NetworkGraph,
    *,
    odniesienie: str,
    wymagania: Mapping[str, float] | None = None,
) -> WynikOcenyZiemnozwarciowej:
    """JEDNA ścieżka oceny zabezpieczeń ziemnozwarciowych modelu (bieg ``protection_sn``)."""
    funkcje = funkcje_ziemnozwarciowe(enm, graph)
    odmowy = [
        rekord_odmowy(
            urzadzenie_ref=f.urzadzenie_ref,
            nazwa_pl=f.nazwa_urzadzenia_pl,
            funkcja_ref=f.funkcja_ref,
            kod=f.kod,
            braki=f.braki,
        )
        for f in funkcje
        if f.braki
    ]
    if not any(pasmo_napieciowe(s.voltage_kv) == "SN" for s in enm.buses):
        return WynikOcenyZiemnozwarciowej(
            tuple(funkcje),
            (),
            tuple(odmowy),
            None,
            wiersze=tuple(wiersze_funkcji(funkcje, odmowy, None, odniesienie=odniesienie)[1]),
        )
    try:
        obliczenie = oblicz_siec_doziemna(enm, graph, funkcje)
    except (OdmowaDanychError, ValueError) as blad:
        braki = (
            PozycjaGotowosci(
                kod=KOD_OBLICZENIE_NIEMOZLIWE,
                komunikat_pl=f"Obliczenie zwarcia doziemnego sieci SN niemożliwe: {blad}",
                akcja_naprawcza_pl=(
                    "Uzupełnij susceptancję zerową B0 linii i kabli albo sposób pracy punktu "
                    "neutralnego źródła sieci SN."
                ),
            ),
        )
        odmowy.extend(
            rekord_odmowy(
                urzadzenie_ref=f.urzadzenie_ref,
                nazwa_pl=f.nazwa_urzadzenia_pl,
                funkcja_ref=f.funkcja_ref,
                kod=f.kod,
                braki=braki,
            )
            for f in funkcje
            if not f.braki
        )
        return WynikOcenyZiemnozwarciowej(
            tuple(funkcje),
            (),
            tuple(odmowy),
            None,
            wiersze=tuple(wiersze_funkcji(funkcje, odmowy, None, odniesienie=odniesienie)[1]),
        )
    if obliczenie.wynik_min.punkty_bez_drogi_zerowej:
        nazwy = ", ".join(n for _, n in obliczenie.wynik_min.punkty_bez_drogi_zerowej)
        odmowy.append(
            rekord_odmowy(
                urzadzenie_ref=obliczenie.wynik_min.punkty_bez_drogi_zerowej[0][0],
                nazwa_pl="sieć SN bez drogi prądu zerowego",
                funkcja_ref=None,
                kod=None,
                braki=(
                    PozycjaGotowosci(
                        kod=KOD_BRAK_DROGI_ZEROWEJ,
                        komunikat_pl=(
                            f"Węzły {nazwy} leżą w części sieci SN bez pojemności doziemnej i bez "
                            "uziemionego punktu neutralnego w danych — zwarcia doziemnego tam nie "
                            "policzono, a strefy obejmujące te węzły oceniono bez nich."
                        ),
                        akcja_naprawcza_pl=(
                            "Uzupełnij impedancję i susceptancję zerową (R′0, X′0, B′0) odcinków "
                            "linii i kabli tej części sieci."
                        ),
                    ),
                ),
            )
        )
    rekordy, dzialania = ocen_funkcje(funkcje, obliczenie, odniesienie=odniesienie)
    wspolczynniki, wiersze = wiersze_funkcji(
        funkcje, [*rekordy, *odmowy], obliczenie, odniesienie=odniesienie, wymagania=wymagania
    )
    rekordy = [*rekordy, *wspolczynniki]
    siec, przypadek = dane_sieci(funkcje, obliczenie)
    oceny = [r for r in rekordy if r.kryterium != "ODMOWA"]
    odmowy.extend(r for r in rekordy if r.kryterium == "ODMOWA")
    odmowy.extend(_braki_awsc(enm, funkcje, obliczenie))
    wyniki_uziemien, uziemienia = ocen_uziemienia_stacji(
        enm, funkcje, obliczenie, dzialania, odniesienie=odniesienie
    )
    return WynikOcenyZiemnozwarciowej(
        tuple(funkcje),
        tuple(oceny),
        tuple(odmowy),
        obliczenie,
        uziemienia=tuple(uziemienia),
        wyniki_uziemien=wyniki_uziemien,
        wiersze=tuple(wiersze),
        siec=tuple(siec),
        przypadek=przypadek,
        wiersze_uziemien=tuple(wiersze_uziemien(uziemienia)),
    )


# ---------------------------------------------------------------------------
# 6. Uziemienie stacji (PN-EN 50522): prąd uziomowy, napięcie uziomowe, R_E,max
# ---------------------------------------------------------------------------

#: Podstawa limitu napięcia dotykowego dopuszczalnego U_Tp(t_F) — treści normy w repozytorium
#: brak (decyzja O-74 pkt 3, plan A/B §2.3): krzywa U_Tp(t_F) to dane właściciela, więc każdy
#: rekord napięcia uziomowego kończy się statusem BRAK_PODSTAWY z liczbami (nigdy „spełnia").
PODSTAWA_U_TP = PodstawaWymagania(
    rodzaj="NORMA",
    dokument="PN-EN 50522:2011 — dopuszczalne napięcie dotykowe U_Tp(t_F), rysunek 4",
    status="NIEUSTALONE",
    uwagi_pl=(
        "treść normy (krzywa U_Tp w funkcji czasu trwania zwarcia) nie jest w repozytorium — "
        "dane właściciela (decyzja O-74 pkt 3); do ich dostarczenia ocena podaje liczby bez "
        "werdyktu. Odwołanie do rysunku 4 i do warunku U_E ≤ U_Tp (pkt 5.4.3) jest "
        "NIEZWERYFIKOWANE z treścią normy"
    ),
)
#: Napięcie uziomowe U_E (potencjał uziomu względem ziemi odniesienia) to NIE napięcie dotykowe
#: U_T (różnica potencjałów ręka–stopy na powierzchni gruntu). U_T jest częścią U_E (U_T ≤ U_E),
#: więc U_E ≤ U_Tp(t_F) jest warunkiem WYSTARCZAJĄCYM; jego niespełnienie nie oznacza
#: przekroczenia U_Tp — wymaga wyznaczenia U_T z rozkładu potencjału (geometria uziomu).
WARUNEK_WYSTARCZAJACY_UE_PL = (
    "Warunek wystarczający: napięcie uziomowe U_E = R_E·I_E nie większe niż dopuszczalne "
    "napięcie dotykowe U_Tp(t_F). Napięcie dotykowe spodziewane U_T jest częścią napięcia "
    "uziomowego (U_T ≤ U_E), więc spełnienie warunku wystarcza bez wyznaczania U_T; "
    "niespełnienie nie oznacza przekroczenia U_Tp — wymaga wyznaczenia U_T z rozkładu potencjału"
)
KOD_NAPIECIE_DOTYKOWE_BEZ_GEOMETRII = "uziemienie.napiecie_dotykowe_brak_geometrii"
BRAK_GEOMETRII_DOTYKOWE_PL = (
    "Napięcie dotykowe spodziewane U_T zależy od rozkładu potencjału na powierzchni gruntu "
    "(geometria elektrod uziomu, rezystywność gruntu) — model ich nie niesie; U_T nie jest "
    "napięciem uziomowym U_E i nie zastępuje go żadna liczba z modelu."
)
KOD_NAPIECIE_KROKOWE_BEZ_GEOMETRII = "uziemienie.napiecie_krokowe_brak_geometrii"
BRAK_GEOMETRII_UZIOMU_PL = (
    "Brakuje geometrii uziomu stacji (rozmieszczenie i głębokość elektrod) oraz rezystywności "
    "gruntu — model ich nie niesie, a napięcie krokowe zależy od rozkładu potencjału na "
    "powierzchni gruntu; liczba bez geometrii byłaby zgadywaniem."
)
#: Metoda właściwa dla napięcia krokowego (akcja naprawcza rekordu) — dobrana do kryterium,
#: nie ogólna lista metod rodzaju twierdzenia (certyfikat urządzenia nie wykazuje napięcia
#: krokowego uziomu).
METODA_NAPIECIA_KROKOWEGO_PL = (
    "wyznacz napięcie krokowe obliczeniem rozkładu potencjału na powierzchni gruntu z modelem "
    "uziomu (geometria elektrod, rezystywność gruntu — PN-EN 50522) albo pomiarem napięć "
    "krokowych w stacji"
)


def _stacje_uziomu(
    enm: EnergyNetworkModel, obliczenie: ObliczenieDoziemne
) -> tuple[list[DaneUziomuStacji], dict[str, DanaPrzyjeta]]:
    """Stacje z węzłem SN w obliczeniu doziemnym + dane przyjęte stacji (r = 1 przy nieznanym r)."""
    stacje: list[DaneUziomuStacji] = []
    dane: dict[str, DanaPrzyjeta] = {}
    for stacja in sorted(enm.substations, key=lambda s: s.ref_id):
        szyny = set(stacja.bus_refs) | {sek.bus_ref for sek in stacja.gpz_sections}
        wezly = frozenset(
            ref_to_graph_id(ref) for ref in szyny if ref_to_graph_id(ref) in obliczenie.punkty
        )
        if not wezly:
            continue
        nazwa = nazwa_elementu(stacja, "substations")
        r = stacja.uziom_wspolczynnik_redukcji
        if r is None:
            r = 1.0
            dane[stacja.ref_id] = DanaPrzyjeta(
                nazwa_pl=f"współczynnik redukcyjny r uziomu ({nazwa})",
                wartosc=Wielkosc(wartosc=1.0, jednostka="1"),
                powod_pl=(
                    "Współczynnik redukcyjny r nieznany — przyjęto r = 1 zachowawczo (cały prąd "
                    "zwarcia doziemnego wraca przez uziom stacji, bez udziału ekranów kabli "
                    "i przewodów odgromowych). Podaj r w danych uziomu stacji."
                ),
                jakosc=FieldQuality.ESTIMATED,
            )
        stacje.append(
            DaneUziomuStacji(
                stacja_ref=stacja.ref_id,
                nazwa_pl=nazwa,
                wezly=wezly,
                rezystancja_ohm=stacja.uziom_rezystancja_ohm,
                wspolczynnik_r=r,
            )
        )
    return stacje, dane


def _czas_trwania_zwarcia(
    funkcje: Sequence[FunkcjaZiemnozwarciowa],
    dzialania: Mapping[str, Sequence[DzialaniePunktu]],
    punkt_ref: str,
) -> float | None:
    """t_F: czas wyłączenia zwarcia w punkcie — najkrótszy czas funkcji, która je WYŁĄCZA:
    funkcji pola, w którego strefie leży punkt, albo funkcji napięciowej 59N (działa przy
    zwarciu w całej sieci). Zbędne zadziałanie pola zdrowego zwarcia nie wyłącza, ZAWSC nie
    wyłącza (automatyka). ``None`` — żadna funkcja modelu nie wyłącza zwarcia."""
    rodzaj = {f.klucz: f for f in funkcje}
    czasy = [
        d.t_zadzialania_s
        for klucz, lista in dzialania.items()
        if rodzaj[klucz].kod != "ZAWSC"
        for d in lista
        if d.punkt_ref == punkt_ref
        and d.t_zadzialania_s is not None
        and (d.w_strefie or rodzaj[klucz].rodzaj == "U0")
    ]
    return min(czasy) if czasy else None


def ocen_uziemienia_stacji(
    enm: EnergyNetworkModel,
    funkcje: Sequence[FunkcjaZiemnozwarciowa],
    obliczenie: ObliczenieDoziemne,
    dzialania: Mapping[str, Sequence[DzialaniePunktu]],
    *,
    odniesienie: str,
) -> tuple[tuple[WynikUziemieniaStacji, ...], list[RekordOcenyZiemnozwarciowej]]:
    """Prąd uziomowy I_E (tablica 1 PN-EN 50522) i napięcie uziomowe U_E każdej stacji z TEGO
    SAMEGO rozwiązania sieci zerowej (c_max), które zasila ocenę zabezpieczeń; R_E nieznane →
    R_E,max = U_Tp(t_F)/I_E z liczbami (I_E = r·I_odn); r nieznane → r = 1 (dana przyjęta). Napięcie
    krokowe — NIE_OCENIONO (model nie niesie geometrii uziomu)."""
    stacje, dane_r = _stacje_uziomu(enm, obliczenie)
    wyniki = uziemienia_stacji(obliczenie.wynik_max, obliczenie.wejscie_max, stacje)
    rekordy: list[RekordOcenyZiemnozwarciowej] = []
    for w in wyniki:
        t_f = _czas_trwania_zwarcia(funkcje, dzialania, w.punkt_ref)
        przyjete_r = dane_r.get(w.stacja_ref)
        dane = obliczenie.dane_przyjete + ((przyjete_r,) if przyjete_r is not None else ())
        czas_pl = (
            f"t_F = {_liczba(t_f)} s (najszybsza funkcja ziemnozwarciowa wyłączająca zwarcie)"
            if t_f is not None
            else "t_F nieustalone — żadna funkcja ziemnozwarciowa modelu nie wyłącza zwarcia "
            "w tym punkcie (praca z doziemieniem albo sygnalizacja)"
        )
        przedmiot = Przedmiot(
            element_ref=w.stacja_ref,
            nazwa_pl=w.nazwa_pl,
            opis_pl=f"Uziom stacji {w.nazwa_pl} — zwarcie doziemne w punkcie {w.nazwa_punktu_pl}",
        )
        r_e_max_latex = (
            rf"R_{{E,max}} = \frac{{U_{{Tp}}(t_F)}}{{I_E}} = "
            rf"\frac{{U_{{Tp}}(t_F)}}{{{_liczba(w.prad_uziomowy_a)}\,\mathrm{{A}}}}"
        )
        wspolne = {
            "stacja_ref": w.stacja_ref,
            "punkt_ref": w.punkt_ref,
            "nazwa_punktu_pl": w.nazwa_punktu_pl,
            "stan": w.stan,
            "sposob": w.sposob,
            "sposob_pl": ETYKIETY_SPOSOBU_UZIEMIENIA_PL[w.sposob],
            "wzor_latex": w.wzor_latex,
            "prad_zwarcia_a": w.prad_zwarcia_a,
            "prad_dlawika_a": w.prad_dlawika_a,
            "prad_odniesienia_a": w.prad_odniesienia_a,
            "prad_uziomowy_a": w.prad_uziomowy_a,
            "wspolczynnik_r": w.wspolczynnik_r,
            "wspolczynnik_r_przyjety": przyjete_r is not None,
            "rezystancja_uziomu_ohm": w.rezystancja_uziomu_ohm,
            "napiecie_uziomowe_v": w.napiecie_uziomowe_v,
            "t_f_s": t_f,
            "r_e_max_latex": r_e_max_latex,
        }
        zakres = ZakresWaznosci(
            rodzaj_analizy="SHORT_CIRCUIT",
            opis_pl=(
                "Zwarcie jednofazowe z ziemią w węźle SN stacji, stan ustalony, c = "
                f"{_liczba(obliczenie.c_max)} (IEC 60909-0 tabela 1); prąd uziomowy wg "
                f"{PODSTAWA_PRADU_UZIOMOWEGO} — wiersz: {ETYKIETY_SPOSOBU_UZIEMIENIA_PL[w.sposob]}"
            ),
            wykluczenia=(
                "rozkład potencjału na powierzchni gruntu (napięcia dotykowe i krokowe "
                "rzeczywiste) — model nie niesie geometrii uziomu",
                "zwarcie przez rezystancję przejścia R_F > 0",
                "przeniesienie potencjału na sieć nN (układ sieci nN)",
            ),
        )
        slad = [
            OdnosnikSladu(
                krok=f"uziemienie:{w.stacja_ref}",
                opis_pl="prąd uziomowy z rozwiązania sieci zerowej solvera doziemień SN",
            )
        ]
        stosowalnosc = Stosowalnosc(
            dotyczy=True, powod_pl="stacja z węzłem SN w sieci z drogą prądu zerowego"
        )
        if w.napiecie_uziomowe_v is not None:
            kryterium = "NAPIECIE_UZIOMOWE"
            ocena = ocen_kryterium(
                kryterium_id=f"uziemienie.{w.stacja_ref}.napiecie_uziomowe",
                przedmiot=przedmiot,
                kryterium=Kryterium(
                    opis_pl=f"{WARUNEK_WYSTARCZAJACY_UE_PL}; {czas_pl}",
                    warunek_latex=r"U_E = R_E\cdot I_E \le U_{Tp}(t_F)",
                    relacja="NIE_WIECEJ",
                ),
                podstawa=PODSTAWA_U_TP,
                stosowalnosc=stosowalnosc,
                wynik=WynikKryterium(
                    wielkosc_pl="napięcie uziomowe U_E",
                    symbol_latex=r"U_E",
                    wartosc=Wielkosc(wartosc=w.napiecie_uziomowe_v, jednostka="V"),
                    punkt_krytyczny_pl=f"zwarcie w punkcie {w.nazwa_punktu_pl}",
                    metoda="OBLICZENIE",
                ),
                limit=None,
                niepewnosc=_NIEPEWNOSC,
                dowod=_dowod(odniesienie, dane),
                zakres_waznosci=zakres,
                slad=slad,
            )
        else:
            kryterium = "REZYSTANCJA_DOPUSZCZALNA"
            ocena = ocen_kryterium(
                kryterium_id=f"uziemienie.{w.stacja_ref}.rezystancja_dopuszczalna",
                przedmiot=przedmiot,
                kryterium=Kryterium(
                    opis_pl=(
                        "Rezystancja uziemienia stacji R_E nieznana — wymagana rezystancja "
                        "R_E,max = U_Tp(t_F)/I_E z prądem uziomowym I_E = r·I_odn z obliczenia; "
                        f"{czas_pl}"
                    ),
                    warunek_latex=r_e_max_latex,
                    relacja="NIE_WIECEJ",
                ),
                podstawa=PODSTAWA_U_TP,
                stosowalnosc=stosowalnosc,
                wynik=WynikKryterium(
                    wielkosc_pl="prąd uziomowy I_E = r·I_odn (mianownik R_E,max)",
                    symbol_latex=r"I_E",
                    wartosc=Wielkosc(wartosc=w.prad_uziomowy_a, jednostka="A"),
                    punkt_krytyczny_pl=f"zwarcie w punkcie {w.nazwa_punktu_pl}",
                    metoda="OBLICZENIE",
                ),
                limit=None,
                niepewnosc=_NIEPEWNOSC,
                dowod=_dowod(odniesienie, dane),
                zakres_waznosci=zakres,
                slad=slad,
            )
        rekordy.append(
            RekordOcenyZiemnozwarciowej(
                urzadzenie_ref=w.stacja_ref,
                nazwa_urzadzenia_pl=w.nazwa_pl,
                funkcja_ref=None,
                kod=None,
                kryterium=kryterium,
                ocena=ocena,
                dodatkowe=wspolne,
            )
        )
        rekordy.append(_rekord_napiecia_dotykowego(w))
        rekordy.append(_rekord_napiecia_krokowego(w))
    return wyniki, rekordy


def _rekord_napiecia_dotykowego(w: WynikUziemieniaStacji) -> RekordOcenyZiemnozwarciowej:
    """Napięcie dotykowe spodziewane U_T bez geometrii uziomu — NIE_OCENIONO, bez liczby
    (U_T ≠ U_E: rekord nigdy nie podstawia napięcia uziomowego)."""
    from application.ocena_niewykonana import ocena_niewykonana
    from werdykt import ClaimKind, EvidenceTier

    ocena = ocena_niewykonana(
        kryterium_id=f"uziemienie.{w.stacja_ref}.napiecie_dotykowe",
        przedmiot=Przedmiot(
            element_ref=w.stacja_ref,
            nazwa_pl=w.nazwa_pl,
            opis_pl=f"Uziom stacji {w.nazwa_pl} — napięcie dotykowe spodziewane U_T",
        ),
        opis_kryterium_pl=(
            "Napięcie dotykowe spodziewane U_T nie większe niż dopuszczalne U_Tp(t_F)"
        ),
        podstawa=PODSTAWA_U_TP,
        powod_stosowalnosci_pl="stacja z węzłem SN w sieci z drogą prądu zerowego",
        rodzaj_twierdzenia=ClaimKind.STATIC_CALCULATION,
        poziom=EvidenceTier.UNVALIDATED_MODEL,
        status_modelu="NIE_DOTYCZY",
        zakres_waznosci=ZakresWaznosci(
            rodzaj_analizy="SHORT_CIRCUIT",
            opis_pl="Rozkład potencjału na powierzchni gruntu wokół uziomu stacji",
        ),
        powod_braku_niepewnosci_pl="ocena się nie odbyła — niepewność nie dotyczy",
        czego_brakuje=(BRAK_GEOMETRII_DOTYKOWE_PL,),
        przyczyna="BRAK_DANYCH",
        akcja_naprawcza_pl=METODA_NAPIECIA_KROKOWEGO_PL.replace("krokowe", "dotykowe").replace(
            "krokowych", "dotykowych"
        ),
    )
    return RekordOcenyZiemnozwarciowej(
        urzadzenie_ref=w.stacja_ref,
        nazwa_urzadzenia_pl=w.nazwa_pl,
        funkcja_ref=None,
        kod=None,
        kryterium="NAPIECIE_DOTYKOWE",
        ocena=ocena,
        dodatkowe={
            "kod_braku": KOD_NAPIECIE_DOTYKOWE_BEZ_GEOMETRII,
            "czego_brakuje_pl": BRAK_GEOMETRII_DOTYKOWE_PL,
        },
    )


def wiersze_uziemien(
    uziemienia: Sequence[RekordOcenyZiemnozwarciowej],
) -> list[dict[str, Any]]:
    """Jeden wiersz na stację (tabela uziemień, osobna od tabel EAZ): I_E, R_E, U_E, U_T,
    U_Tp(t_F), R_E,max, napięcie krokowe — U_E i U_T w osobnych kolumnach (korekta
    właściciela 6). Wartości bez podstawy albo bez danych są ``None`` z kodem przypisu; przypis
    (zdanie) jest jeden na tabelę (``przypisy``)."""
    stacje: dict[str, list[RekordOcenyZiemnozwarciowej]] = {}
    for r in uziemienia:
        stacje.setdefault(r.urzadzenie_ref, []).append(r)
    wiersze: list[dict[str, Any]] = []
    for ref, rekordy in stacje.items():
        glowny = next(
            r for r in rekordy if r.kryterium in ("NAPIECIE_UZIOMOWE", "REZYSTANCJA_DOPUSZCZALNA")
        )
        d = glowny.dodatkowe
        stan, przyczyna = stan_wiersza(rekordy)
        wiersze.append(
            {
                "stacja_ref": ref,
                "stacja_pl": glowny.nazwa_urzadzenia_pl,
                "punkt_pl": d["nazwa_punktu_pl"],
                "sposob_pl": d["sposob_pl"],
                "prad_uziomowy_a": d["prad_uziomowy_a"],
                "wspolczynnik_r": d["wspolczynnik_r"],
                "wspolczynnik_r_przyjety": d["wspolczynnik_r_przyjety"],
                "rezystancja_uziomu_ohm": d["rezystancja_uziomu_ohm"],
                "napiecie_uziomowe_v": d["napiecie_uziomowe_v"],
                "t_f_s": d["t_f_s"],
                # Wielkości bez podstawy albo bez danych — ``None`` z kodem przypisu:
                "napiecie_dotykowe_v": None,
                "napiecie_dotykowe_dopuszczalne_v": None,
                "rezystancja_maksymalna_ohm": None,
                "napiecie_krokowe_v": None,
                "przypisy_kolumn": {
                    "napiecie_dotykowe_v": "GEOMETRIA",
                    "napiecie_krokowe_v": "GEOMETRIA",
                    "napiecie_dotykowe_dopuszczalne_v": "U_TP",
                    "rezystancja_maksymalna_ohm": "U_TP",
                    **(
                        {"rezystancja_uziomu_ohm": "R_E", "napiecie_uziomowe_v": "R_E"}
                        if d["rezystancja_uziomu_ohm"] is None
                        else {}
                    ),
                },
                "wzor_pradu_latex": d["wzor_latex"],
                "r_e_max_latex": d["r_e_max_latex"],
                "stan": stan,
                "przyczyna_pl": przyczyna,
                "kryteria": [r.ocena.kryterium_id for r in rekordy],
            }
        )
    return wiersze


#: Przypisy tabeli uziemień — jedno zdanie na rodzaj braku (pod tabelą, raz).
PRZYPISY_UZIEMIEN_PL: dict[str, str] = {
    "GEOMETRIA": (
        "U_T i napięcie krokowe wymagają rozkładu potencjału na powierzchni gruntu (geometria "
        "uziomu, rezystywność gruntu, PN-EN 50522) — model ich nie niesie."
    ),
    "U_TP": (
        "Krzywa dopuszczalnego napięcia dotykowego U_Tp(t_F) (PN-EN 50522) nie jest treścią "
        "repozytorium — bez niej U_Tp i R_E,max = U_Tp/I_E pozostają bez liczby."
    ),
    "R_E": "Rezystancja uziemienia stacji R_E nieznana — U_E nieobliczone.",
}


def _rekord_napiecia_krokowego(w: WynikUziemieniaStacji) -> RekordOcenyZiemnozwarciowej:
    """Napięcie krokowe bez geometrii uziomu — NIE_OCENIONO z wyjaśnieniem, bez liczby."""
    from application.ocena_niewykonana import ocena_niewykonana
    from werdykt import ClaimKind, EvidenceTier

    ocena = ocena_niewykonana(
        kryterium_id=f"uziemienie.{w.stacja_ref}.napiecie_krokowe",
        przedmiot=Przedmiot(
            element_ref=w.stacja_ref,
            nazwa_pl=w.nazwa_pl,
            opis_pl=f"Uziom stacji {w.nazwa_pl} — napięcie krokowe",
        ),
        opis_kryterium_pl="Napięcie krokowe przy zwarciu doziemnym w stacji",
        podstawa=PODSTAWA_U_TP,
        powod_stosowalnosci_pl="stacja z węzłem SN w sieci z drogą prądu zerowego",
        rodzaj_twierdzenia=ClaimKind.STATIC_CALCULATION,
        poziom=EvidenceTier.UNVALIDATED_MODEL,
        status_modelu="NIE_DOTYCZY",
        zakres_waznosci=ZakresWaznosci(
            rodzaj_analizy="SHORT_CIRCUIT",
            opis_pl="Rozkład potencjału na powierzchni gruntu wokół uziomu stacji",
        ),
        powod_braku_niepewnosci_pl="ocena się nie odbyła — niepewność nie dotyczy",
        czego_brakuje=(BRAK_GEOMETRII_UZIOMU_PL,),
        # Przyczyna: brak danych modelu (geometria uziomu, rezystywność gruntu), nie brak
        # metody — metodę właściwą dla kryterium nazywa akcja naprawcza.
        przyczyna="BRAK_DANYCH",
        akcja_naprawcza_pl=METODA_NAPIECIA_KROKOWEGO_PL,
    )
    return RekordOcenyZiemnozwarciowej(
        urzadzenie_ref=w.stacja_ref,
        nazwa_urzadzenia_pl=w.nazwa_pl,
        funkcja_ref=None,
        kod=None,
        kryterium="NAPIECIE_KROKOWE",
        ocena=ocena,
        dodatkowe={
            "kod_braku": KOD_NAPIECIE_KROKOWE_BEZ_GEOMETRII,
            "czego_brakuje_pl": BRAK_GEOMETRII_UZIOMU_PL,
        },
    )


def _braki_awsc(
    enm: EnergyNetworkModel,
    funkcje: Sequence[FunkcjaZiemnozwarciowa],
    obliczenie: ObliczenieDoziemne,
) -> list[RekordOcenyZiemnozwarciowej]:
    """Punkt neutralny z AWSC w sieci zerowej bez czynnej automatyki ZAWSC — nazwany brak modelu
    (stan po wymuszeniu nie jest osiągany, ocena liczy wyłącznie stan przed wymuszeniem).
    """
    zawsc_skladowe = {
        _skladowa_wezla(obliczenie.wynik_min, obliczenie.punkty, f.wezel_pomiaru)
        for f in funkcje
        if f.kod == "ZAWSC" and not f.braki and f.wezel_pomiaru is not None
    }
    wynik: list[RekordOcenyZiemnozwarciowej] = []
    for skladowa in obliczenie.wynik_min.skladowe:
        if not skladowa.ma_awsc or skladowa.numer in zawsc_skladowe:
            continue
        wynik.append(
            rekord_odmowy(
                urzadzenie_ref=skladowa.punkty_neutralne[0][0],
                nazwa_pl="punkt neutralny z AWSC",
                funkcja_ref=None,
                kod="ZAWSC",
                braki=(
                    PozycjaGotowosci(
                        kod=KOD_AWSC_BEZ_ZAWSC,
                        komunikat_pl=(
                            "Punkt neutralny sieci SN ma rezystor wymuszania składowej czynnej "
                            "(AWSC), a w sieci nie ma czynnej automatyki ZAWSC z nastawami — "
                            "chwila załączenia wymuszenia jest nieznana, więc stan po wymuszeniu "
                            "nie wchodzi do oceny funkcji."
                        ),
                        akcja_naprawcza_pl=(
                            "Dodaj w polu punktu neutralnego sterownik z automatyką ZAWSC "
                            "i nastawami (próg U0, zwłoka)."
                        ),
                        funkcja="ZAWSC",
                    ),
                ),
            )
        )
    return wynik


def kroki_sladu_ziemnozwarciowego(
    wynik: WynikOcenyZiemnozwarciowej,
) -> list[dict[str, Any]]:
    """Kroki śladu White Box biegu zabezpieczeń dla części ziemnozwarciowej: budowa sieci
    zerowej z modelu, rozwiązanie solvera doziemień (c_min i c_max), prąd i napięcie uziomowe
    stacji. Słowniki o kształcie ``ProtectionTraceStep`` (warstwa domeny buduje kroki).
    """
    kroki: list[dict[str, Any]] = []
    obliczenie = wynik.obliczenie
    if obliczenie is None:
        return kroki
    kroki.append(
        {
            "step": "siec_zerowa_z_modelu",
            "description_pl": (
                "Sieć składowej zerowej z modelu: boczniki pojemnościowe B0 odcinków, punkty "
                "neutralne źródeł i transformatorów (sposób pracy z modelu)"
            ),
            "inputs": {
                "dane_przyjete": [d.model_dump(mode="json") for d in obliczenie.dane_przyjete]
            },
            "outputs": {"slad_budowy": list(obliczenie.slad_budowy)},
        }
    )
    for wariant, rozwiazanie, c in (
        ("c_min", obliczenie.wynik_min, obliczenie.c_min),
        ("c_max", obliczenie.wynik_max, obliczenie.c_max),
    ):
        kroki.append(
            {
                "step": f"zwarcie_doziemne_{wariant}",
                "description_pl": (
                    f"Zwarcie doziemne w każdej szynie SN, c = {_liczba(c)} — prądy 3I0 i napięcia "
                    "3U0 pól (solver doziemień SN)"
                ),
                "inputs": {"c": c, "wersja_solvera": rozwiazanie.wersja},
                "outputs": {
                    "skladowe": [s.to_dict() for s in rozwiazanie.skladowe],
                    "slad": list(rozwiazanie.slad),
                },
            }
        )
    for w in wynik.wyniki_uziemien:
        kroki.append(
            {
                "step": "uziemienie_stacji",
                "description_pl": f"Prąd i napięcie uziomowe stacji {w.nazwa_pl} (PN-EN 50522)",
                "inputs": {"stacja_ref": w.stacja_ref, "punkt_ref": w.punkt_ref},
                "outputs": w.to_dict(),
            }
        )
    return kroki
