"""Parametry jednostkowe linii napowietrznej z geometrii słupa i danych przewodu (WHITE BOX).

PO CO (karta LINIA-110, rozstrzygnięcie architekta w `docs/uiux/KOORDYNACJA_WATKOW_2026-10.md`,
wpis 7 pkt 4). Standard ENEA Operator „Elektroenergetyczne linie napowietrzne i kablowe 110 kV”
(wersja 06.2026, obowiązuje od 01.10.2026) przesądza PRZEWÓD (§4.1: ACSR 240 mm², parametry nie
gorsze niż 243-AL1/39-ST1A), a rezystancję, reaktancję i susceptancję linii dla składowej zgodnej
i zerowej każe wyznaczyć OBLICZENIOWO dla projektu (§7.1 lit. j, s. 34/40). Typ katalogowy wiąże
przewód (dane wyrobu z normy PN-EN 50182), a ten moduł liczy z nich i z geometrii słupa
R′, X′, B′ składowej zgodnej oraz R′0, X′0, B′0 składowej zerowej z wpływem ziemi i przewodów
odgromowych. Wynik wchodzi do istniejących solverów zwarć i rozpływu jako DANE GAŁĘZI
(``r_ohm_per_km`` …) — rdzenie B-01 nie są dotykane.

METODA (każdy krok w śladzie: wzór LaTeX → podstawienie → wynik z jednostką).

1. Rezystancja: R′20 = R′20,DC/n (n — przewody w wiązce fazy); R′θ = R′20·[1 + α(θ − 20 °C)].
   Rezystancja prądu przemiennego 50 Hz = rezystancja prądu stałego z tablicy wyrobu
   (ZAŁOŻENIE INŻYNIERSKIE: naskórkowość przewodu ACSR o średnicy ≤ 32 mm przy 50 Hz zmienia
   rezystancję o ułamek procenta; przy α — IEC 60909-0:2016, wzór R_L(θ_e), α = 0,004 1/K dla
   miedzi, aluminium i stopów aluminium).
2. GMR przewodu (średnia geometryczna odległość przewodu od siebie samego): z tablicy wyrobu,
   gdy ją podaje, inaczej z budowy — druty aluminiowe w warstwach koncentrycznych na rdzeniu
   stalowym, drut jako przewód pełny o GMR = (d/2)·e^(−1/4), odległości między środkami drutów
   (definicja GMR: W. H. Kersting, „Distribution System Modeling and Analysis”, rozdz. 4).
   Prąd płynie w drutach aluminiowych (ZAŁOŻENIE INŻYNIERSKIE zgodne z rezystancją tablicy
   PN-EN 50182, która jest rezystancją części aluminiowej: 28,264 nΩ·m / 243,1 mm² ·
   współczynnik skrętu = 0,1188 Ω/km).
3. Wiązka n przewodów na okręgu o promieniu A = s/(2·sin(π/n)): GMR_w = (n·GMR·A^(n−1))^(1/n),
   promień zastępczy r_w = (n·r·A^(n−1))^(1/n) (ta sama reguła średniej geometrycznej).
4. Macierz impedancji pierwotnych (fazy + przewody odgromowe) wg J. R. Carsona, „Wave
   propagation in overhead wires with ground return”, Bell System Technical Journal 5 (1926)
   539–554 — postać CAŁKOWA, bez obcinania szeregu (rezystywność gruntu ρ jest daną):
       Z_ii = R′_i + jωμ0/(2π)·ln(2h_i/GMR_i) + ΔZ(2h_i, 0)
       Z_ij = jωμ0/(2π)·ln(D′_ij/d_ij) + ΔZ(h_i + h_j, |x_i − x_j|)
       ΔZ(p, q) = (jωμ0/π)·∫₀^∞ e^(−pλ)·cos(qλ) / (λ + √(λ² + jωμ0/ρ)) dλ
   Całka liczona numerycznie (``scipy.integrate.quad``, tolerancja względna 1e-12) — wynik
   deterministyczny dla tego samego wejścia. Kontrolnie ślad podaje zastępczą głębokość
   wnikania δ = 1,851/√(ωμ0/ρ) (pierwszy wyraz szeregu Carsona — to samo co D_e w postaci
   uproszczonej), ale do wyniku wchodzi całka.
5. Przewody odgromowe uziemione na każdym słupie (standard ENEA §4.6, s. 21/40: „każdy słup
   należy uziemić”) → potencjał 0 → redukcja Krona: Z_f = Z_ff − Z_fg·Z_gg⁻¹·Z_gf.
6. Linia transponowana (ZAŁOŻENIE INŻYNIERSKIE — parametry składowych symetrycznych linii, jak
   w IEC 60909-0, mają sens dla linii symetrycznej): Z_s = średnia przekątnej, Z_m = średnia
   elementów pozaprzekątniowych; Z′1 = Z_s − Z_m, Z′0 = Z_s + 2·Z_m.
7. Pojemności z macierzy współczynników potencjałowych (metoda odbić zwierciadlanych, ziemia
   ekwipotencjalna): P_ii = ln(2h_i/r_i)/(2πε0), P_ij = ln(D′_ij/d_ij)/(2πε0) — promień
   ZEWNĘTRZNY (nie GMR); redukcja Krona przewodów odgromowych; P_1 = P_s − P_m, P_0 = P_s + 2P_m;
   B′ = ω/P.
8. Kontrola X′1 klasycznym wzorem średnich geometrycznych: X′1 ≈ ωμ0/(2π)·ln(GMD/GMR_w).

Weryfikacja niezależna (testy): W. H. Kersting, op. cit., przykład 4.1 (macierz impedancji
z neutralnym przewodem, redukcja Krona) i przykład 5.1 (macierz admitancji) — odtwarzane z
tolerancją wynikającą z drugiego wyrazu szeregu Carsona (Kersting stosuje pierwszy wyraz).

DANE PRZYJĘTE. Solver nie wie, które wejście jest wartością roboczą — przekazuje to wołający
(rejestr wartości roboczych, zasada nr 4) listą ``dane_przyjete``; wynik ma wtedy kompletność
dowodu ``NIEPELNY``, a bez danych przyjętych ``PELNY``.

Granica warstw: moduł liczy fizykę i nic więcej; ocena wiarygodności wyniku (sanity-bounds)
leży w warstwie interpretacji (`analysis/sanity_bounds/parametry_linii_bounds.py`).
"""

from __future__ import annotations

import cmath
import hashlib
import json
import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import numpy.typing as npt
from network_model.odmowa_danych import OdmowaDanychError
from network_model.pochodne.wielkosci_pochodne import rezystancja_w_temperaturze
from scipy.integrate import quad
from werdykt.kontrakt import DanaPrzyjeta, KompletnoscDowodu

#: Wersja metody — zmiana wzoru, stałej albo kolejności kroków podnosi wersję (proweniencja
#: parametrów gałęzi w modelu niesie ją obok odcisku wejścia).
WERSJA_METODY = "1.0"
NAZWA_METODY = "Carson (postać całkowa) + redukcja Krona + transpozycja"

#: Przenikalność magnetyczna próżni [H/m] — CODATA 2018 (NIST SP 961).
MI_0_H_PER_M = 1.25663706212e-6
#: Przenikalność elektryczna próżni [F/m] — CODATA 2018 (NIST SP 961).
EPSILON_0_F_PER_M = 8.8541878128e-12
#: Stała pierwszego wyrazu szeregu Carsona: δ = 1,851/√(ωμ0/ρ) — 2·e^(−0,0772) (Carson 1926,
#: Q = −0,0386 + ½·ln(2/k)); w śladzie wyłącznie jako wielkość kontrolna.
STALA_GLEBOKOSCI_WNIKANIA = 2.0 * math.exp(-0.0772)
#: Temperatura odniesienia rezystancji z tablic wyrobu [°C].
TEMPERATURA_ODNIESIENIA_C = 20.0
#: GMR drutu pełnego jako ułamek jego promienia: e^(−1/4) (indukcyjność wewnętrzna μ0/(8π)).
GMR_DRUTU_PELNEGO = math.exp(-0.25)

_KILOMETR_M = 1000.0
_TOLERANCJA_CALKI = 1e-12
_TOLERANCJA_BEZWZGLEDNA_CALKI = 1e-15
_LIMIT_PODZIALOW_CALKI = 400


# ---------------------------------------------------------------------------
# Wejście
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class DanePrzewodu:
    """Dane przewodu z typu katalogowego (norma wyrobu) potrzebne do obliczenia.

    ``gmr_mm`` — z tablicy wyrobu, gdy ją podaje; inaczej ``warstwy_al`` (liczba drutów
    aluminiowych w kolejnych warstwach od rdzenia), ``srednica_drutu_al_mm`` i
    ``srednica_rdzenia_mm`` (rdzeń stalowy; 0 dla przewodu jednorodnego) wyznaczają GMR z budowy.
    """

    identyfikator: str
    nazwa: str
    srednica_mm: float
    r20_ohm_per_km: float
    alfa_1_per_k: float
    gmr_mm: float | None = None
    warstwy_al: tuple[int, ...] = ()
    srednica_drutu_al_mm: float | None = None
    srednica_rdzenia_mm: float | None = None

    def do_odcisku(self) -> dict[str, Any]:
        return {
            "identyfikator": self.identyfikator,
            "srednica_mm": self.srednica_mm,
            "r20_ohm_per_km": self.r20_ohm_per_km,
            "alfa_1_per_k": self.alfa_1_per_k,
            "gmr_mm": self.gmr_mm,
            "warstwy_al": list(self.warstwy_al),
            "srednica_drutu_al_mm": self.srednica_drutu_al_mm,
            "srednica_rdzenia_mm": self.srednica_rdzenia_mm,
        }


@dataclass(frozen=True)
class PolozeniePrzewodu:
    """Położenie przewodu w przekroju poprzecznym linii [m].

    ``x_m`` — odległość pozioma od osi słupa; ``y_m`` — ŚREDNIA wysokość przewodu nad ziemią
    w przęśle (wysokość zawieszenia pomniejszona o 2/3 zwisu — dana projektu).
    """

    x_m: float
    y_m: float


@dataclass(frozen=True)
class GeometriaLinii:
    """Geometria słupa: trzy fazy (L1, L2, L3), wiązka i przewody odgromowe."""

    fazy: tuple[PolozeniePrzewodu, PolozeniePrzewodu, PolozeniePrzewodu]
    liczba_w_wiazce: int = 1
    odstep_wiazki_m: float | None = None
    odgromowe: tuple[PolozeniePrzewodu, ...] = ()

    def do_odcisku(self) -> dict[str, Any]:
        return {
            "fazy": [[p.x_m, p.y_m] for p in self.fazy],
            "liczba_w_wiazce": self.liczba_w_wiazce,
            "odstep_wiazki_m": self.odstep_wiazki_m,
            "odgromowe": [[p.x_m, p.y_m] for p in self.odgromowe],
        }


@dataclass(frozen=True)
class WejscieParametrowLinii:
    """Komplet wejścia obliczenia parametrów linii."""

    przewod_fazowy: DanePrzewodu
    geometria: GeometriaLinii
    rezystywnosc_gruntu_ohm_m: float
    czestotliwosc_hz: float
    #: Temperatura przewodu, dla której ślad podaje R′θ (temperatura dopuszczalna długotrwale).
    temperatura_przewodu_c: float
    #: Typ przewodu odgromowego — wymagany, gdy geometria ma przewody odgromowe.
    przewod_odgromowy: DanePrzewodu | None = None
    #: Dane przyjęte (wartości robocze rejestru) — kompletność dowodu NIEPELNY, gdy niepuste.
    dane_przyjete: tuple[DanaPrzyjeta, ...] = ()

    def odcisk(self) -> str:
        """SHA-256 kanonicznego JSON wejścia fizycznego (bez opisów danych przyjętych)."""
        tresc = {
            "metoda": WERSJA_METODY,
            "przewod_fazowy": self.przewod_fazowy.do_odcisku(),
            "przewod_odgromowy": (
                self.przewod_odgromowy.do_odcisku() if self.przewod_odgromowy else None
            ),
            "geometria": self.geometria.do_odcisku(),
            "rezystywnosc_gruntu_ohm_m": self.rezystywnosc_gruntu_ohm_m,
            "czestotliwosc_hz": self.czestotliwosc_hz,
            "temperatura_przewodu_c": self.temperatura_przewodu_c,
        }
        kanon = json.dumps(tresc, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        return hashlib.sha256(kanon.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Ślad i wynik
# ---------------------------------------------------------------------------


def _wartosc_json(wartosc: float | complex) -> float | dict[str, float]:
    if isinstance(wartosc, complex):
        return {"re": wartosc.real, "im": wartosc.imag}
    return wartosc


@dataclass(frozen=True)
class WielkoscSladu:
    """Wielkość kroku (wejście albo wynik): symbol LaTeX, wartość, jednostka."""

    symbol: str
    wartosc: float | complex
    jednostka: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "symbol": self.symbol,
            "wartosc": _wartosc_json(self.wartosc),
            "jednostka": self.jednostka,
        }


@dataclass(frozen=True)
class KrokSladu:
    """Jeden krok White Box: wzór, wejścia, podstawienie, wynik z jednostką (+ dane pośrednie).

    ``wejscia`` i ``wynik`` to te same liczby co w ``podstawienie_latex``/``wynik_latex``
    w postaci maszynowej — pakiet dowodowy buduje z nich kroki dowodu bez parsowania LaTeX.
    """

    kod: str
    opis_pl: str
    wzor_latex: str
    podstawienie_latex: str
    wynik_latex: str
    wejscia: tuple[WielkoscSladu, ...]
    wynik: WielkoscSladu
    podstawa_pl: str
    dane: Mapping[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "kod": self.kod,
            "opis_pl": self.opis_pl,
            "wzor_latex": self.wzor_latex,
            "podstawienie_latex": self.podstawienie_latex,
            "wynik_latex": self.wynik_latex,
            "wejscia": [w.to_dict() for w in self.wejscia],
            "wynik": self.wynik.to_dict(),
            "podstawa_pl": self.podstawa_pl,
            "dane": dict(self.dane),
        }


@dataclass(frozen=True)
class ParametryLiniiNapowietrznej:
    """Wynik: parametry jednostkowe linii (na km) z pełnym śladem.

    ``r1_ohm_per_km`` jest rezystancją w 20 °C — konwencja pola ``r_ohm_per_km`` gałęzi
    (IEC 60909-0: I″k,max z R_L20; tor I″k,min koryguje temperaturę osobno).
    """

    r1_ohm_per_km: float
    x1_ohm_per_km: float
    b1_s_per_km: float
    r0_ohm_per_km: float
    x0_ohm_per_km: float
    b0_s_per_km: float
    r1_temperatura_ohm_per_km: float
    temperatura_przewodu_c: float
    r0_bez_odgromowych_ohm_per_km: float
    x0_bez_odgromowych_ohm_per_km: float
    gmr_przewodu_m: float
    gmr_fazy_m: float
    promien_zastepczy_fazy_m: float
    gmd_m: float
    x1_kontrolne_ohm_per_km: float
    glebokosc_wnikania_m: float
    liczba_odgromowych: int
    slad: tuple[KrokSladu, ...]
    dane_przyjete: tuple[DanaPrzyjeta, ...]
    odcisk_wejscia: str
    wersja_metody: str = WERSJA_METODY
    metoda: str = NAZWA_METODY

    @property
    def kompletnosc_dowodu(self) -> KompletnoscDowodu:
        """``NIEPELNY``, gdy wynik opiera się na danych przyjętych (zasada nr 4)."""
        return "NIEPELNY" if self.dane_przyjete else "PELNY"

    def to_dict(self) -> dict[str, Any]:
        return {
            "metoda": self.metoda,
            "wersja_metody": self.wersja_metody,
            "odcisk_wejscia": self.odcisk_wejscia,
            "r1_ohm_per_km": self.r1_ohm_per_km,
            "x1_ohm_per_km": self.x1_ohm_per_km,
            "b1_s_per_km": self.b1_s_per_km,
            "r0_ohm_per_km": self.r0_ohm_per_km,
            "x0_ohm_per_km": self.x0_ohm_per_km,
            "b0_s_per_km": self.b0_s_per_km,
            "r1_temperatura_ohm_per_km": self.r1_temperatura_ohm_per_km,
            "temperatura_przewodu_c": self.temperatura_przewodu_c,
            "r0_bez_odgromowych_ohm_per_km": self.r0_bez_odgromowych_ohm_per_km,
            "x0_bez_odgromowych_ohm_per_km": self.x0_bez_odgromowych_ohm_per_km,
            "gmr_przewodu_m": self.gmr_przewodu_m,
            "gmr_fazy_m": self.gmr_fazy_m,
            "promien_zastepczy_fazy_m": self.promien_zastepczy_fazy_m,
            "gmd_m": self.gmd_m,
            "x1_kontrolne_ohm_per_km": self.x1_kontrolne_ohm_per_km,
            "glebokosc_wnikania_m": self.glebokosc_wnikania_m,
            "liczba_odgromowych": self.liczba_odgromowych,
            "kompletnosc_dowodu": self.kompletnosc_dowodu,
            "dane_przyjete": [d.model_dump(mode="json") for d in self.dane_przyjete],
            "slad": [k.to_dict() for k in self.slad],
        }


# ---------------------------------------------------------------------------
# Formatowanie liczb w LaTeX (przecinek dziesiętny)
# ---------------------------------------------------------------------------


def _l(wartosc: float, cyfry: int = 6) -> str:
    """Liczba w LaTeX z polskim przecinkiem dziesiętnym (``{,}``), ``cyfry`` znaczących."""
    tekst = f"{wartosc:.{cyfry}g}"
    if "e" in tekst:
        mantysa, wykladnik = tekst.split("e")
        return f"{mantysa.replace('.', '{,}')} \\cdot 10^{{{int(wykladnik)}}}"
    return tekst.replace(".", "{,}")


def _lz(z: complex, cyfry: int = 6) -> str:
    znak = "+" if z.imag >= 0 else "-"
    return f"{_l(z.real, cyfry)} {znak} j{_l(abs(z.imag), cyfry)}"


# ---------------------------------------------------------------------------
# Walidacja wejścia (odmowa danych, nie korekta)
# ---------------------------------------------------------------------------


def _sprawdz_wejscie(dane: WejscieParametrowLinii) -> None:
    geo = dane.geometria
    if len(geo.fazy) != 3:
        raise OdmowaDanychError("Geometria linii wymaga położenia dokładnie trzech faz.")
    for nazwa, polozenie in [
        *((f"faza L{i + 1}", p) for i, p in enumerate(geo.fazy)),
        *((f"przewód odgromowy {i + 1}", p) for i, p in enumerate(geo.odgromowe)),
    ]:
        if not (math.isfinite(polozenie.x_m) and math.isfinite(polozenie.y_m)):
            raise OdmowaDanychError(f"Położenie ({nazwa}) musi być liczbą skończoną.")
        if polozenie.y_m <= 0:
            raise OdmowaDanychError(
                f"Średnia wysokość przewodu ({nazwa}) nad ziemią musi być dodatnia."
            )
    wszystkie = [*geo.fazy, *geo.odgromowe]
    for i in range(len(wszystkie)):
        for j in range(i + 1, len(wszystkie)):
            if math.dist(_xy(wszystkie[i]), _xy(wszystkie[j])) <= 0:
                raise OdmowaDanychError(
                    "Dwa przewody linii mają to samo położenie — geometria słupa jest sprzeczna."
                )
    if geo.liczba_w_wiazce < 1:
        raise OdmowaDanychError("Liczba przewodów w wiązce fazy musi wynosić co najmniej 1.")
    if geo.liczba_w_wiazce > 1 and (geo.odstep_wiazki_m is None or geo.odstep_wiazki_m <= 0):
        raise OdmowaDanychError("Wiązka przewodów wymaga dodatniego odstępu przewodów w wiązce.")
    if geo.odgromowe and dane.przewod_odgromowy is None:
        raise OdmowaDanychError(
            "Geometria ma przewody odgromowe, ale nie wskazano typu przewodu odgromowego."
        )
    if not (dane.rezystywnosc_gruntu_ohm_m > 0 and math.isfinite(dane.rezystywnosc_gruntu_ohm_m)):
        raise OdmowaDanychError("Rezystywność gruntu musi być dodatnią liczbą skończoną.")
    if not (dane.czestotliwosc_hz > 0 and math.isfinite(dane.czestotliwosc_hz)):
        raise OdmowaDanychError("Częstotliwość musi być dodatnią liczbą skończoną.")
    for przewod in (dane.przewod_fazowy, dane.przewod_odgromowy):
        if przewod is None:
            continue
        if przewod.srednica_mm <= 0 or przewod.r20_ohm_per_km <= 0:
            raise OdmowaDanychError(
                f"Przewód {przewod.nazwa}: średnica i rezystancja muszą być dodatnie."
            )
        if przewod.gmr_mm is None and not (
            przewod.warstwy_al
            and przewod.srednica_drutu_al_mm is not None
            and przewod.srednica_drutu_al_mm > 0
            and przewod.srednica_rdzenia_mm is not None
            and przewod.srednica_rdzenia_mm >= 0
        ):
            raise OdmowaDanychError(
                f"Przewód {przewod.nazwa}: brak GMR i danych budowy do jego wyznaczenia."
            )


def _xy(p: PolozeniePrzewodu) -> tuple[float, float]:
    return (p.x_m, p.y_m)


# ---------------------------------------------------------------------------
# Kroki obliczenia
# ---------------------------------------------------------------------------


def gmr_z_budowy_mm(
    warstwy_al: Sequence[int], srednica_drutu_mm: float, srednica_rdzenia_mm: float
) -> float:
    """GMR przewodu z budowy: średnia geometryczna wszystkich odległości drutów aluminiowych.

    Druty warstwy k leżą na okręgu o promieniu R_k = r_rdzenia + (k − ½)·d (warstwy przylegające),
    kąt drutu i = 2πi/n_k; odległość drutu od siebie = (d/2)·e^(−1/4).
    """
    punkty: list[tuple[float, float]] = []
    promien = srednica_rdzenia_mm / 2.0 + srednica_drutu_mm / 2.0
    for liczba in warstwy_al:
        for i in range(liczba):
            kat = 2.0 * math.pi * i / liczba
            punkty.append((promien * math.cos(kat), promien * math.sin(kat)))
        promien += srednica_drutu_mm
    n = len(punkty)
    ln_wlasny = math.log(srednica_drutu_mm / 2.0 * GMR_DRUTU_PELNEGO)
    suma = 0.0
    for i in range(n):
        for j in range(n):
            suma += ln_wlasny if i == j else math.log(math.dist(punkty[i], punkty[j]))
    return math.exp(suma / (n * n))


def srednica_z_budowy_mm(
    warstwy_al: Sequence[int], srednica_drutu_mm: float, srednica_rdzenia_mm: float
) -> float:
    """Średnica zewnętrzna wynikająca z budowy (kontrola zgodności z tablicą wyrobu)."""
    return srednica_rdzenia_mm + 2.0 * len(warstwy_al) * srednica_drutu_mm


def _gmr_przewodu(przewod: DanePrzewodu, kod: str) -> tuple[float, KrokSladu]:
    """GMR przewodu [m] i krok śladu."""
    if przewod.gmr_mm is not None:
        gmr_mm = przewod.gmr_mm
        return gmr_mm / 1000.0, KrokSladu(
            kod=kod,
            opis_pl=f"GMR przewodu {przewod.nazwa} z tablicy wyrobu",
            wzor_latex=r"GMR = GMR_{\text{tabl}}",
            podstawienie_latex=rf"GMR = {_l(gmr_mm)}\ \text{{mm}}",
            wynik_latex=rf"GMR = {_l(gmr_mm)}\ \text{{mm}}",
            wejscia=(WielkoscSladu(r"GMR_{\text{tabl}}", gmr_mm, "mm"),),
            wynik=WielkoscSladu("GMR", gmr_mm, "mm"),
            podstawa_pl="dana typu katalogowego przewodu",
        )
    assert przewod.srednica_drutu_al_mm is not None and przewod.srednica_rdzenia_mm is not None
    gmr_mm = gmr_z_budowy_mm(
        przewod.warstwy_al, przewod.srednica_drutu_al_mm, przewod.srednica_rdzenia_mm
    )
    d_budowy = srednica_z_budowy_mm(
        przewod.warstwy_al, przewod.srednica_drutu_al_mm, przewod.srednica_rdzenia_mm
    )
    n = sum(przewod.warstwy_al)
    warstwy = "+".join(str(w) for w in przewod.warstwy_al)
    return gmr_mm / 1000.0, KrokSladu(
        kod=kod,
        opis_pl=(
            f"GMR przewodu {przewod.nazwa} z budowy: {n} drutów Al ({warstwy}) "
            f"⌀ {_l(przewod.srednica_drutu_al_mm).replace('{,}', ',')} mm na rdzeniu "
            f"⌀ {_l(przewod.srednica_rdzenia_mm).replace('{,}', ',')} mm"
        ),
        wzor_latex=(
            r"GMR = \Big(\prod_{i=1}^{N}\prod_{j=1}^{N} D_{ij}\Big)^{1/N^2},\quad "
            r"D_{ii} = \tfrac{d}{2}\,e^{-1/4}"
        ),
        podstawienie_latex=(
            rf"N = {n},\ d = {_l(przewod.srednica_drutu_al_mm)}\ \text{{mm}},\ "
            rf"\varnothing_{{\text{{budowy}}}} = {_l(d_budowy)}\ \text{{mm}}"
        ),
        wynik_latex=(
            rf"GMR = {_l(gmr_mm)}\ \text{{mm}} = {_l(gmr_mm / (przewod.srednica_mm / 2.0), 4)}"
            r"\cdot r"
        ),
        wejscia=(
            WielkoscSladu("N", float(n), "—"),
            WielkoscSladu("d", przewod.srednica_drutu_al_mm, "mm"),
            WielkoscSladu(r"\varnothing_{\text{rdzenia}}", przewod.srednica_rdzenia_mm, "mm"),
        ),
        wynik=WielkoscSladu("GMR", gmr_mm, "mm"),
        podstawa_pl=(
            "definicja średniej geometrycznej odległości (Kersting, rozdz. 4); prąd w drutach "
            "aluminiowych — założenie inżynierskie zgodne z rezystancją tablicy PN-EN 50182"
        ),
        dane={
            "warstwy_al": list(przewod.warstwy_al),
            "srednica_z_budowy_mm": d_budowy,
            "srednica_tablicowa_mm": przewod.srednica_mm,
        },
    )


def _promien_wiazki_m(liczba: int, odstep_m: float | None) -> float:
    if liczba == 1 or odstep_m is None:
        return 0.0
    return odstep_m / (2.0 * math.sin(math.pi / liczba))


def poprawka_ziemi_carsona_ohm_per_m(
    p_m: float, q_m: float, czestotliwosc_hz: float, rezystywnosc_ohm_m: float
) -> complex:
    """ΔZ Carsona [Ω/m]: (jωμ0/π)·∫₀^∞ e^(−pλ)·cos(qλ)/(λ + √(λ² + jωμ0/ρ)) dλ."""
    omega = 2.0 * math.pi * czestotliwosc_hz
    m2 = omega * MI_0_H_PER_M / rezystywnosc_ohm_m

    def funkcja_podcalkowa(lam: float) -> complex:
        return math.exp(-p_m * lam) * math.cos(q_m * lam) / (lam + cmath.sqrt(lam * lam + 1j * m2))

    calka_re, _ = quad(
        lambda lam: funkcja_podcalkowa(lam).real,
        0.0,
        math.inf,
        limit=_LIMIT_PODZIALOW_CALKI,
        epsabs=_TOLERANCJA_BEZWZGLEDNA_CALKI,
        epsrel=_TOLERANCJA_CALKI,
    )
    calka_im, _ = quad(
        lambda lam: funkcja_podcalkowa(lam).imag,
        0.0,
        math.inf,
        limit=_LIMIT_PODZIALOW_CALKI,
        epsabs=_TOLERANCJA_BEZWZGLEDNA_CALKI,
        epsrel=_TOLERANCJA_CALKI,
    )
    return 1j * omega * MI_0_H_PER_M / math.pi * complex(calka_re, calka_im)


def _kron(macierz: npt.NDArray[Any], liczba_faz: int) -> npt.NDArray[Any]:
    """Redukcja Krona: eliminacja przewodów o potencjale 0 (indeksy ≥ liczba_faz)."""
    if macierz.shape[0] == liczba_faz:
        return macierz.copy()
    ff = macierz[:liczba_faz, :liczba_faz]
    fg = macierz[:liczba_faz, liczba_faz:]
    gf = macierz[liczba_faz:, :liczba_faz]
    gg = macierz[liczba_faz:, liczba_faz:]
    wynik: npt.NDArray[Any] = ff - fg @ np.linalg.solve(gg, gf)
    return wynik


def _srednie_transpozycji(macierz: npt.NDArray[Any]) -> tuple[complex, complex]:
    """(średnia przekątnej, średnia elementów pozaprzekątniowych) macierzy 3×3."""
    przekatna = complex(sum(complex(macierz[i, i]) for i in range(3)) / 3.0)
    poza = complex(sum(complex(macierz[i, j]) for i in range(3) for j in range(3) if i != j) / 6.0)
    return przekatna, poza


def _macierz_do_danych(macierz: npt.NDArray[Any], *, zespolona: bool) -> list[list[Any]]:
    wiersze: list[list[Any]] = []
    for i in range(macierz.shape[0]):
        wiersz: list[Any] = []
        for j in range(macierz.shape[1]):
            v = complex(macierz[i, j])
            wiersz.append([v.real, v.imag] if zespolona else v.real)
        wiersze.append(wiersz)
    return wiersze


def oblicz_parametry_linii(dane: WejscieParametrowLinii) -> ParametryLiniiNapowietrznej:
    """Parametry jednostkowe linii z geometrii i danych przewodu — pełny ślad White Box."""
    _sprawdz_wejscie(dane)
    geo = dane.geometria
    faz = dane.przewod_fazowy
    odg = dane.przewod_odgromowy
    f = dane.czestotliwosc_hz
    omega = 2.0 * math.pi * f
    rho = dane.rezystywnosc_gruntu_ohm_m
    n_w = geo.liczba_w_wiazce
    slad: list[KrokSladu] = []

    # 1. Rezystancja fazy w 20 °C i w temperaturze przewodu.
    r20_fazy = faz.r20_ohm_per_km / n_w
    slad.append(
        KrokSladu(
            kod="R1_20",
            opis_pl=f"Rezystancja fazy w 20 °C ({n_w} × {faz.nazwa})",
            wzor_latex=r"R'_{20} = \frac{R'_{20,\text{DC}}}{n}",
            podstawienie_latex=rf"R'_{{20}} = \frac{{{_l(faz.r20_ohm_per_km)}}}{{{n_w}}}",
            wynik_latex=rf"R'_{{20}} = {_l(r20_fazy)}\ \Omega/\text{{km}}",
            wejscia=(
                WielkoscSladu(r"R'_{20,\text{DC}}", faz.r20_ohm_per_km, "Ω/km"),
                WielkoscSladu("n", float(n_w), "—"),
            ),
            wynik=WielkoscSladu("R'_{20}", r20_fazy, "Ω/km"),
            podstawa_pl=(
                "rezystancja prądu stałego w 20 °C z tablicy wyrobu (PN-EN 50182); rezystancja "
                "50 Hz równa prądu stałego — założenie inżynierskie"
            ),
        )
    )
    theta = dane.temperatura_przewodu_c
    r_theta = rezystancja_w_temperaturze(
        r20_fazy, faz.alfa_1_per_k, theta, TEMPERATURA_ODNIESIENIA_C
    )
    slad.append(
        KrokSladu(
            kod="R1_THETA",
            opis_pl=f"Rezystancja fazy w temperaturze przewodu {_l(theta).replace('{,}', ',')} °C",
            wzor_latex=r"R'_{\theta} = R'_{20}\,[1 + \alpha(\theta - 20\ ^{\circ}\text{C})]",
            podstawienie_latex=(
                rf"R'_{{\theta}} = {_l(r20_fazy)}\,[1 + {_l(faz.alfa_1_per_k)}"
                rf"\,({_l(theta)} - 20)]"
            ),
            wynik_latex=rf"R'_{{\theta}} = {_l(r_theta)}\ \Omega/\text{{km}}",
            wejscia=(
                WielkoscSladu("R'_{20}", r20_fazy, "Ω/km"),
                WielkoscSladu(r"\alpha", faz.alfa_1_per_k, "1/K"),
                WielkoscSladu(r"\theta", theta, "°C"),
            ),
            wynik=WielkoscSladu(r"R'_{\theta}", r_theta, "Ω/km"),
            podstawa_pl=(
                "IEC 60909-0:2016, wzór R_L(θ_e) (α = 0,004 1/K dla miedzi, aluminium i stopów "
                "aluminium); θ — temperatura dopuszczalna długotrwale przewodu"
            ),
        )
    )

    # 2. GMR przewodu fazowego (i odgromowego).
    gmr_przewodu_m, krok = _gmr_przewodu(faz, "GMR_FAZOWY")
    slad.append(krok)
    gmr_odg_m: float | None = None
    if geo.odgromowe and odg is not None:
        gmr_odg_m, krok_odg = _gmr_przewodu(odg, "GMR_ODGROMOWY")
        slad.append(krok_odg)

    # 3. Wiązka.
    promien_przewodu_m = faz.srednica_mm / 2000.0
    a_w = _promien_wiazki_m(n_w, geo.odstep_wiazki_m)
    if n_w > 1:
        assert geo.odstep_wiazki_m is not None  # _sprawdz_wejscie: wiązka wymaga odstępu
        gmr_fazy = (n_w * gmr_przewodu_m * a_w ** (n_w - 1)) ** (1.0 / n_w)
        r_zast = (n_w * promien_przewodu_m * a_w ** (n_w - 1)) ** (1.0 / n_w)
        slad.append(
            KrokSladu(
                kod="WIAZKA",
                opis_pl=f"Wiązka {n_w} przewodów — GMR i promień zastępczy fazy",
                wzor_latex=(
                    r"A = \frac{s}{2\sin(\pi/n)},\ GMR_w = (n\,GMR\,A^{n-1})^{1/n},\ "
                    r"r_w = (n\,r\,A^{n-1})^{1/n}"
                ),
                podstawienie_latex=(
                    rf"n = {n_w},\ s = {_l(geo.odstep_wiazki_m)}\ \text{{m}},\ "
                    rf"A = {_l(a_w)}\ \text{{m}}"
                ),
                wynik_latex=(
                    rf"GMR_w = {_l(gmr_fazy)}\ \text{{m}},\ r_w = {_l(r_zast)}\ \text{{m}}"
                ),
                wejscia=(
                    WielkoscSladu("n", float(n_w), "—"),
                    WielkoscSladu("s", geo.odstep_wiazki_m, "m"),
                    WielkoscSladu("GMR", gmr_przewodu_m, "m"),
                    WielkoscSladu("r", promien_przewodu_m, "m"),
                ),
                wynik=WielkoscSladu("GMR_w", gmr_fazy, "m"),
                podstawa_pl="średnia geometryczna odległości przewodów wiązki (jak GMR)",
            )
        )
    else:
        gmr_fazy = gmr_przewodu_m
        r_zast = promien_przewodu_m

    # 4. Odległości: przewody i ich odbicia.
    polozenia = [*geo.fazy, *geo.odgromowe]
    liczba = len(polozenia)
    liczba_odg = len(geo.odgromowe)
    odleglosci: list[list[float]] = []
    odleglosci_odbic: list[list[float]] = []
    for i in range(liczba):
        wiersz_d: list[float] = []
        wiersz_dp: list[float] = []
        for j in range(liczba):
            pi_, pj = polozenia[i], polozenia[j]
            wiersz_d.append(math.dist(_xy(pi_), _xy(pj)) if i != j else 0.0)
            wiersz_dp.append(math.hypot(pi_.x_m - pj.x_m, pi_.y_m + pj.y_m))
        odleglosci.append(wiersz_d)
        odleglosci_odbic.append(wiersz_dp)
    d12, d13, d23 = odleglosci[0][1], odleglosci[0][2], odleglosci[1][2]
    gmd = (d12 * d13 * d23) ** (1.0 / 3.0)
    slad.append(
        KrokSladu(
            kod="GMD",
            opis_pl="Średnia geometryczna odległość faz",
            wzor_latex=r"GMD = \sqrt[3]{d_{12}\,d_{13}\,d_{23}}",
            podstawienie_latex=rf"GMD = \sqrt[3]{{{_l(d12)}\cdot{_l(d13)}\cdot{_l(d23)}}}",
            wynik_latex=rf"GMD = {_l(gmd)}\ \text{{m}}",
            wejscia=(
                WielkoscSladu("d_{12}", d12, "m"),
                WielkoscSladu("d_{13}", d13, "m"),
                WielkoscSladu("d_{23}", d23, "m"),
            ),
            wynik=WielkoscSladu("GMD", gmd, "m"),
            podstawa_pl="geometria słupa",
            dane={"d_m": odleglosci, "d_odbic_m": odleglosci_odbic},
        )
    )

    # 5. Głębokość wnikania (kontrolnie) i macierz impedancji pierwotnych.
    delta = STALA_GLEBOKOSCI_WNIKANIA / math.sqrt(omega * MI_0_H_PER_M / rho)
    slad.append(
        KrokSladu(
            kod="DELTA",
            opis_pl="Zastępcza głębokość wnikania prądu w ziemię (wielkość kontrolna)",
            wzor_latex=r"\delta = \frac{1{,}851}{\sqrt{\omega\mu_0/\rho}}",
            podstawienie_latex=(
                rf"\delta = \frac{{1{{,}}851}}{{\sqrt{{{_l(omega)}\cdot{_l(MI_0_H_PER_M)}"
                rf"/{_l(rho)}}}}}"
            ),
            wynik_latex=rf"\delta = {_l(delta)}\ \text{{m}}",
            wejscia=(
                WielkoscSladu(r"\omega", omega, "rad/s"),
                WielkoscSladu(r"\mu_0", MI_0_H_PER_M, "H/m"),
                WielkoscSladu(r"\rho", rho, "Ω·m"),
            ),
            wynik=WielkoscSladu(r"\delta", delta, "m"),
            podstawa_pl=(
                "pierwszy wyraz szeregu Carsona (1926); do wyniku wchodzi pełna całka Carsona"
            ),
        )
    )
    gmr_przewodow = [gmr_fazy] * 3
    promienie = [r_zast] * 3
    if liczba_odg:
        # _sprawdz_wejscie: przewody odgromowe w geometrii wymagają typu przewodu odgromowego.
        assert odg is not None and gmr_odg_m is not None
        gmr_przewodow += [gmr_odg_m] * liczba_odg
        promienie += [odg.srednica_mm / 2000.0] * liczba_odg
    r_przewodow_ohm_per_m = [r20_fazy / _KILOMETR_M] * 3
    if liczba_odg and odg is not None:
        r_przewodow_ohm_per_m += [odg.r20_ohm_per_km / _KILOMETR_M] * liczba_odg
    wsp = omega * MI_0_H_PER_M / (2.0 * math.pi)
    z = np.zeros((liczba, liczba), dtype=complex)
    poprawki: list[list[list[float]]] = []
    for i in range(liczba):
        wiersz_poprawek: list[list[float]] = []
        for j in range(liczba):
            pi_, pj = polozenia[i], polozenia[j]
            dz = poprawka_ziemi_carsona_ohm_per_m(pi_.y_m + pj.y_m, abs(pi_.x_m - pj.x_m), f, rho)
            wiersz_poprawek.append([dz.real * _KILOMETR_M, dz.imag * _KILOMETR_M])
            if i == j:
                z[i, j] = (
                    r_przewodow_ohm_per_m[i]
                    + 1j * wsp * math.log(2.0 * pi_.y_m / gmr_przewodow[i])
                    + dz
                )
            else:
                z[i, j] = 1j * wsp * math.log(odleglosci_odbic[i][j] / odleglosci[i][j]) + dz
        poprawki.append(wiersz_poprawek)
    z_km = z * _KILOMETR_M
    slad.append(
        KrokSladu(
            kod="Z_PIERWOTNE",
            opis_pl=(
                f"Macierz impedancji pierwotnych {liczba}×{liczba} "
                f"(3 fazy, {liczba_odg} przewody odgromowe) z poprawką ziemi Carsona"
            ),
            wzor_latex=(
                r"Z_{ii} = R'_i + j\frac{\omega\mu_0}{2\pi}\ln\frac{2h_i}{GMR_i} + \Delta Z_{ii},\ "
                r"Z_{ij} = j\frac{\omega\mu_0}{2\pi}\ln\frac{D'_{ij}}{d_{ij}} + \Delta Z_{ij},\ "
                r"\Delta Z = \frac{j\omega\mu_0}{\pi}\int_0^{\infty}"
                r"\frac{e^{-(h_i+h_j)\lambda}\cos(x_{ij}\lambda)}"
                r"{\lambda+\sqrt{\lambda^2+j\omega\mu_0/\rho}}\,d\lambda"
            ),
            podstawienie_latex=(
                rf"f = {_l(f)}\ \text{{Hz}},\ \rho = {_l(rho)}\ \Omega\text{{m}},\ "
                rf"Z_{{11}} = {_lz(complex(z_km[0, 0]))}\ \Omega/\text{{km}}"
            ),
            wynik_latex=rf"Z_{{12}} = {_lz(complex(z_km[0, 1]))}\ \Omega/\text{{km}}",
            wejscia=(
                WielkoscSladu("f", f, "Hz"),
                WielkoscSladu(r"\rho", rho, "Ω·m"),
                WielkoscSladu("h_1", geo.fazy[0].y_m, "m"),
                WielkoscSladu("GMR_1", gmr_przewodow[0], "m"),
            ),
            wynik=WielkoscSladu("Z_{11}", complex(z_km[0, 0]), "Ω/km"),
            podstawa_pl=(
                "J. R. Carson, Bell System Technical Journal 5 (1926) 539–554 — postać całkowa; "
                "rezystywność gruntu jako dana"
            ),
            dane={
                "z_ohm_per_km": _macierz_do_danych(z_km, zespolona=True),
                "poprawka_ziemi_ohm_per_km": poprawki,
            },
        )
    )

    # 6. Redukcja Krona i składowe symetryczne (linia transponowana).
    z_faz = _kron(z_km, 3)
    if liczba_odg:
        slad.append(
            KrokSladu(
                kod="KRON_Z",
                opis_pl="Redukcja Krona — przewody odgromowe uziemione na każdym słupie",
                wzor_latex=r"Z_f = Z_{ff} - Z_{fg}\,Z_{gg}^{-1}\,Z_{gf}",
                podstawienie_latex=rf"Z_{{f,11}} = {_lz(complex(z_faz[0, 0]))}\ \Omega/\text{{km}}",
                wynik_latex=rf"Z_{{f,12}} = {_lz(complex(z_faz[0, 1]))}\ \Omega/\text{{km}}",
                wejscia=(
                    WielkoscSladu("Z_{ff,11}", complex(z_km[0, 0]), "Ω/km"),
                    WielkoscSladu("Z_{gg,11}", complex(z_km[3, 3]), "Ω/km"),
                ),
                wynik=WielkoscSladu("Z_{f,11}", complex(z_faz[0, 0]), "Ω/km"),
                podstawa_pl=(
                    "standard ENEA Operator linii 110 kV, §4.6 (każdy słup uziemiony) — "
                    "potencjał przewodu odgromowego 0"
                ),
                dane={"z_f_ohm_per_km": _macierz_do_danych(z_faz, zespolona=True)},
            )
        )
    zs, zm = _srednie_transpozycji(z_faz)
    z1 = zs - zm
    z0 = zs + 2.0 * zm
    slad.append(
        KrokSladu(
            kod="Z1",
            opis_pl="Impedancja składowej zgodnej (linia transponowana)",
            wzor_latex=r"Z'_1 = Z_s - Z_m",
            podstawienie_latex=rf"Z'_1 = ({_lz(zs)}) - ({_lz(zm)})",
            wynik_latex=rf"Z'_1 = {_lz(z1)}\ \Omega/\text{{km}}",
            wejscia=(WielkoscSladu("Z_s", zs, "Ω/km"), WielkoscSladu("Z_m", zm, "Ω/km")),
            wynik=WielkoscSladu("Z'_1", z1, "Ω/km"),
            podstawa_pl="transpozycja linii — założenie inżynierskie",
        )
    )
    slad.append(
        KrokSladu(
            kod="Z0",
            opis_pl=(
                "Impedancja składowej zerowej z wpływem ziemi"
                + (" i przewodów odgromowych" if liczba_odg else "")
            ),
            wzor_latex=r"Z'_0 = Z_s + 2Z_m",
            podstawienie_latex=rf"Z'_0 = ({_lz(zs)}) + 2\,({_lz(zm)})",
            wynik_latex=rf"Z'_0 = {_lz(z0)}\ \Omega/\text{{km}}",
            wejscia=(WielkoscSladu("Z_s", zs, "Ω/km"), WielkoscSladu("Z_m", zm, "Ω/km")),
            wynik=WielkoscSladu("Z'_0", z0, "Ω/km"),
            podstawa_pl="transpozycja linii — założenie inżynierskie; ziemia wg Carsona",
        )
    )
    zs_b, zm_b = _srednie_transpozycji(z_km[:3, :3])
    z0_bez = zs_b + 2.0 * zm_b
    if liczba_odg:
        slad.append(
            KrokSladu(
                kod="Z0_BEZ_ODGROMOWYCH",
                opis_pl="Impedancja składowej zerowej bez przewodów odgromowych (porównawczo)",
                wzor_latex=r"Z'_{0,\text{bez}} = Z_{s,ff} + 2Z_{m,ff}",
                podstawienie_latex=rf"Z'_{{0,\text{{bez}}}} = ({_lz(zs_b)}) + 2\,({_lz(zm_b)})",
                wynik_latex=rf"Z'_{{0,\text{{bez}}}} = {_lz(z0_bez)}\ \Omega/\text{{km}}",
                wejscia=(
                    WielkoscSladu("Z_{s,ff}", zs_b, "Ω/km"),
                    WielkoscSladu("Z_{m,ff}", zm_b, "Ω/km"),
                ),
                wynik=WielkoscSladu(r"Z'_{0,\text{bez}}", z0_bez, "Ω/km"),
                podstawa_pl="ta sama macierz pierwotna bez redukcji Krona",
            )
        )

    # 7. Kontrola X′1 wzorem GMD/GMR.
    x1_kontrolne = wsp * _KILOMETR_M * math.log(gmd / gmr_fazy)
    slad.append(
        KrokSladu(
            kod="X1_KONTROLA",
            opis_pl="Kontrola reaktancji składowej zgodnej wzorem średnich geometrycznych",
            wzor_latex=r"X'_1 \approx \frac{\omega\mu_0}{2\pi}\ln\frac{GMD}{GMR_w}",
            podstawienie_latex=(
                rf"X'_1 \approx {_l(wsp * _KILOMETR_M)}\,\ln\frac{{{_l(gmd)}}}{{{_l(gmr_fazy)}}}"
            ),
            wynik_latex=(
                rf"X'_1 \approx {_l(x1_kontrolne)}\ \Omega/\text{{km}}\ "
                rf"(\text{{macierz: }}{_l(z1.imag)})"
            ),
            wejscia=(
                WielkoscSladu("GMD", gmd, "m"),
                WielkoscSladu("GMR_w", gmr_fazy, "m"),
                WielkoscSladu(r"\frac{\omega\mu_0}{2\pi}", wsp * _KILOMETR_M, "Ω/km"),
            ),
            wynik=WielkoscSladu("X'_1", x1_kontrolne, "Ω/km"),
            podstawa_pl="wzór klasyczny linii transponowanej (wpływ ziemi znosi się w Z′1)",
        )
    )

    # 8. Pojemności — współczynniki potencjałowe.
    k_p = 1.0 / (2.0 * math.pi * EPSILON_0_F_PER_M)
    p = np.zeros((liczba, liczba), dtype=float)
    for i in range(liczba):
        for j in range(liczba):
            if i == j:
                p[i, j] = k_p * math.log(2.0 * polozenia[i].y_m / promienie[i])
            else:
                p[i, j] = k_p * math.log(odleglosci_odbic[i][j] / odleglosci[i][j])
    p_faz = _kron(p, 3)
    ps, pm = _srednie_transpozycji(p_faz)
    p1 = (ps - pm).real
    p0 = (ps + 2.0 * pm).real
    b1_s_per_m = omega / p1
    b0_s_per_m = omega / p0
    b1 = b1_s_per_m * _KILOMETR_M
    b0 = b0_s_per_m * _KILOMETR_M
    slad.append(
        KrokSladu(
            kod="B1_B0",
            opis_pl="Susceptancje składowej zgodnej i zerowej (współczynniki potencjałowe)",
            wzor_latex=(
                r"P_{ii} = \frac{\ln(2h_i/r_i)}{2\pi\varepsilon_0},\ "
                r"P_{ij} = \frac{\ln(D'_{ij}/d_{ij})}{2\pi\varepsilon_0},\ "
                r"B'_1 = \frac{\omega}{P_s - P_m},\ B'_0 = \frac{\omega}{P_s + 2P_m}"
            ),
            podstawienie_latex=(
                rf"P_s = {_l(ps.real)}\ \text{{m/F}},\ P_m = {_l(pm.real)}\ \text{{m/F}},\ "
                rf"\omega = {_l(omega)}\ \text{{rad/s}}"
            ),
            wynik_latex=(
                rf"B'_1 = {_l(b1 * 1e6)}\ \mu\text{{S/km}},\ B'_0 = {_l(b0 * 1e6)}\ "
                r"\mu\text{S/km}"
            ),
            wejscia=(
                WielkoscSladu("P_s", ps.real, "m/F"),
                WielkoscSladu("P_m", pm.real, "m/F"),
                WielkoscSladu(r"\omega", omega, "rad/s"),
            ),
            wynik=WielkoscSladu("B'_1", b1 * 1e6, "μS/km"),
            podstawa_pl=(
                "metoda odbić zwierciadlanych (ziemia ekwipotencjalna), promień zewnętrzny "
                "przewodu; przewody odgromowe o potencjale 0 (redukcja Krona)"
            ),
            dane={"p_m_per_f": _macierz_do_danych(p, zespolona=False)},
        )
    )

    return ParametryLiniiNapowietrznej(
        r1_ohm_per_km=z1.real,
        x1_ohm_per_km=z1.imag,
        b1_s_per_km=b1,
        r0_ohm_per_km=z0.real,
        x0_ohm_per_km=z0.imag,
        b0_s_per_km=b0,
        r1_temperatura_ohm_per_km=r_theta,
        temperatura_przewodu_c=theta,
        r0_bez_odgromowych_ohm_per_km=z0_bez.real,
        x0_bez_odgromowych_ohm_per_km=z0_bez.imag,
        gmr_przewodu_m=gmr_przewodu_m,
        gmr_fazy_m=gmr_fazy,
        promien_zastepczy_fazy_m=r_zast,
        gmd_m=gmd,
        x1_kontrolne_ohm_per_km=x1_kontrolne,
        glebokosc_wnikania_m=delta,
        liczba_odgromowych=liczba_odg,
        slad=tuple(slad),
        dane_przyjete=tuple(dane.dane_przyjete),
        odcisk_wejscia=dane.odcisk(),
    )
