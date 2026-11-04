"""Zwarcie doziemne w sieci SN — rozpływ składowej zerowej po polach (WHITE BOX).

Karta EWALUATORY-ZIEMNOZWARCIOWE. Solver liczy, co mierzą zabezpieczenia ziemnozwarciowe
pól (51N, 50N, 67N, Yo>, Go>, Bo>, 32N, 59N, ZAWSC) i jaki prąd płynie do ziemi w miejscu
zwarcia, w KAŻDYM sposobie pracy punktu neutralnego: izolowanym, kompensowanym (dławik),
kompensowanym z automatyką wymuszania składowej czynnej (AWSC), uziemionym przez rezystor
i bezpośrednio. Sposób pracy NIE jest gałęzią kodu — wynika wyłącznie z macierzy admitancji
składowej zerowej (Y0) złożonej z modelu (pojemności doziemne linii i kabli z modelu π,
baterie z uziemioną gwiazdą, boczniki punktów neutralnych źródeł i transformatorów
``Z_T0 + 3·Z_N``). Ten sam wzór daje prąd pojemnościowy sieci izolowanej, prąd resztkowy
sieci kompensowanej i prąd zwarcia sieci uziemionej przez rezystor.

Metoda (składowe symetryczne, zwarcie jednofazowe z ziemią przez R_F w węźle k, p.u.):

* prąd składowej zerowej w miejscu zwarcia ``I0_f = c / (Z1_kk + Z2_kk + Z0_kk + 3·Z_F)``
  (napięcie przed zwarciem ``c·U_n/√3``; Z1 = Z2 z sieci zwarciowej IEC 60909),
* napięcia składowej zerowej węzłów ``V0 = −Z0[:, k]·I0_f`` (Z0 = Y0⁻¹),
* prąd do ziemi każdego bocznika ``I0_s = y_s·V0(węzeł bocznika)``,
* prąd składowej zerowej w polu (przekładnik pola, kierunek szyny → strefa) z prawa
  Kirchhoffa dla strefy pola: ``I0_pole = Σ_{boczniki strefy} I0_s + I0_f·[k ∈ strefa]``,
  prąd mierzony ``3I0 = 3·I0_pole`` (układ Holmgreena albo przekładnik Ferrantiego),
* wielkości przekaźnika względem napięcia przesunięcia punktu neutralnego U0 (= V0 węzła
  pomiaru): admitancja ``Y0 = 3I0/(−U0) = G0 + jB0``, moc czynna
  ``P0 = Re{(−U0)·(3I0)*}``, kąt ``φ0 = arg(3I0) − arg(−U0)``; dla pola uszkodzonego
  Y0 = admitancja reszty sieci z punktem neutralnym, dla pola zdrowego Y0 = −Y0 własne pola.

AWSC: rezystor wymuszający ``R_W = U_n/(√3·I_W)`` RÓWNOLEGLE do dławika —
``Z_N' = Z_N·R_W/(Z_N + R_W)``, bocznik punktu neutralnego ``1/(Z0_bocznika − 3Z_N + 3Z_N')``.
Stan ``PO_WYMUSZENIU_AWSC`` liczy się dla punktów zwarcia, w których składowej sieci zerowej
jest punkt neutralny z AWSC (wymuszenie działa w sieci, w której powstało napięcie zerowe);
stan ``PRZED_WYMUSZENIEM`` — zawsze.

Prąd pojemnościowy składowej sieci przy pełnym przesunięciu (V0 = 1 p.u.):
``I_C = 3·Σ B_s·I_base`` (linie, kable, baterie), prąd dławików ``I_L = 3·Σ (−B_N)·I_base``,
rozstrojenie kompensacji ``v = (I_L − I_C)/I_C``.

Czego moduł NIE robi: nie porównuje z żadną nastawą ani limitem (ewaluator
``application.analyses.protection.ocena_ziemnozwarciowa``), nie zgaduje danych (brak = odmowa
po stronie budowniczego), nie stosuje heurystyk. Zamrożony rdzeń IEC 60909 (``build_zbus``)
jest wyłącznie wołany przez budowniczego; tu wchodzą gotowe macierze.

Niezmienniki: determinizm (kolejność wejścia = kolejność wyniku), ślad WHITE BOX każdego kroku,
granice wiarygodności (skończone wartości, |V0| ≤ 1,5·c) — przekroczenie to odmowa nazwana.
"""

from __future__ import annotations

import cmath
import math
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any, Literal

import numpy as np
from network_model.odmowa_danych import OdmowaDanychError

DOZIEMIENIE_SN_SOLVER_VERSION = "1.0.0"

StanWymuszenia = Literal["PRZED_WYMUSZENIEM", "PO_WYMUSZENIU_AWSC"]
STAN_PRZED: StanWymuszenia = "PRZED_WYMUSZENIEM"
STAN_PO_AWSC: StanWymuszenia = "PO_WYMUSZENIU_AWSC"
ETYKIETY_STANU_PL: dict[str, str] = {
    STAN_PRZED: "przed wymuszeniem składowej czynnej",
    STAN_PO_AWSC: "po załączeniu wymuszenia składowej czynnej (AWSC)",
}

RodzajBocznika = Literal["POJEMNOSC_LINII", "BATERIA", "PUNKT_NEUTRALNY"]

#: Granica wiarygodności napięcia składowej zerowej (krotność c): przy zwarciu doziemnym
#: |V0| węzła nie przekracza napięcia przed zwarciem z zapasem na rezonans szeregowy
#: — wartość większa to sygnał błędu danych (np. niemal idealny rezonans bez strat).
GRANICA_V0_KROTNOSC_C = 1.5


@dataclass(frozen=True)
class PunktNeutralnyDoziemienia:
    """Punkt neutralny uziemiony impedancyjnie — dane potrzebne do stanu AWSC i śladu."""

    typ: str
    zn_ohm: complex
    zn3_pu: complex
    z_base_ohm: float
    u_n_kv: float
    awsc_prad_a: float | None = None


@dataclass(frozen=True)
class BocznikZerowy:
    """Jeden bocznik do ziemi macierzy Y0 (stempel budowniczego, bez kopii fizyki)."""

    element_ref: str
    nazwa_pl: str
    rodzaj: RodzajBocznika
    wezel: str
    indeks: int
    y_pu: complex
    i_base_a: float
    punkt_neutralny: PunktNeutralnyDoziemienia | None = None


@dataclass(frozen=True)
class PunktDoziemienia:
    """Węzeł, w którym liczy się zwarcie doziemne."""

    punkt_ref: str
    nazwa_pl: str
    wezel: str
    indeks: int
    z1_pu: complex
    z2_pu: complex
    z_base_ohm: float
    i_base_a: float
    u_n_kv: float


@dataclass(frozen=True)
class StrefaPomiaru:
    """Strefa pola (węzły grafu za przekładnikiem) i węzeł pomiaru napięcia zerowego."""

    strefa_ref: str
    wezly: frozenset[str]
    indeks_pomiaru: int
    i_base_a: float
    u_n_kv: float


@dataclass(frozen=True, eq=False)
class WejscieDoziemienia:
    y0_pu: np.ndarray
    boczniki: tuple[BocznikZerowy, ...]
    punkty: tuple[PunktDoziemienia, ...]
    strefy: tuple[StrefaPomiaru, ...]
    c: float = 1.0
    r_f_ohm: float = 0.0


def _zespolona(z: complex) -> dict[str, float]:
    return {
        "re": float(z.real),
        "im": float(z.imag),
        "modul": float(abs(z)),
        "kat_deg": float(math.degrees(cmath.phase(z))) if z != 0 else 0.0,
    }


@dataclass(frozen=True)
class WielkosciPola:
    """Co mierzy zabezpieczenie pola przy zwarciu w jednym punkcie i jednym stanie."""

    strefa_ref: str
    zwarcie_w_strefie: bool
    prad_3i0_a: complex
    u0_v: complex
    u0_proc: float
    admitancja_y0_s: complex | None
    moc_p0_w: float
    kat_phi0_deg: float | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "strefa_ref": self.strefa_ref,
            "zwarcie_w_strefie": self.zwarcie_w_strefie,
            "prad_3i0_a": _zespolona(self.prad_3i0_a),
            "u0_v": _zespolona(self.u0_v),
            "u0_proc": self.u0_proc,
            "admitancja_y0_ms": (
                None if self.admitancja_y0_s is None else _zespolona(self.admitancja_y0_s * 1000.0)
            ),
            "moc_p0_kw": self.moc_p0_w / 1000.0,
            "kat_phi0_deg": self.kat_phi0_deg,
        }


@dataclass(frozen=True)
class WynikPunktuDoziemienia:
    punkt_ref: str
    nazwa_pl: str
    stan: StanWymuszenia
    skladowa: int
    prad_doziemny_a: complex
    u0_punktu_v: complex
    u0_punktu_proc: float
    pola: tuple[WielkosciPola, ...]
    prady_punktow_neutralnych_a: tuple[tuple[str, complex], ...]

    def pole(self, strefa_ref: str) -> WielkosciPola:
        for wielkosci in self.pola:
            if wielkosci.strefa_ref == strefa_ref:
                return wielkosci
        raise KeyError(strefa_ref)

    def to_dict(self) -> dict[str, Any]:
        return {
            "punkt_ref": self.punkt_ref,
            "nazwa_pl": self.nazwa_pl,
            "stan": self.stan,
            "stan_pl": ETYKIETY_STANU_PL[self.stan],
            "skladowa": self.skladowa,
            "prad_doziemny_a": _zespolona(self.prad_doziemny_a),
            "u0_punktu_v": _zespolona(self.u0_punktu_v),
            "u0_punktu_proc": self.u0_punktu_proc,
            "pola": [p.to_dict() for p in self.pola],
            "prady_punktow_neutralnych_a": [
                {"element_ref": ref, "prad_a": _zespolona(prad)}
                for ref, prad in self.prady_punktow_neutralnych_a
            ],
        }


@dataclass(frozen=True)
class SkladowaSieciZerowej:
    """Galwanicznie spójna sieć składowej zerowej (np. sieć SN jednego transformatora)."""

    numer: int
    wezly: tuple[str, ...]
    prad_pojemnosciowy_a: float
    prad_dlawikow_a: float
    rozstrojenie: float | None
    punkty_neutralne: tuple[tuple[str, str], ...]
    ma_awsc: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "numer": self.numer,
            "wezly": list(self.wezly),
            "prad_pojemnosciowy_a": self.prad_pojemnosciowy_a,
            "prad_dlawikow_a": self.prad_dlawikow_a,
            "rozstrojenie": self.rozstrojenie,
            "punkty_neutralne": [{"element_ref": r, "typ": t} for r, t in self.punkty_neutralne],
            "ma_awsc": self.ma_awsc,
        }


@dataclass(frozen=True)
class WynikDoziemienia:
    wersja: str
    c: float
    r_f_ohm: float
    punkty: tuple[WynikPunktuDoziemienia, ...]
    skladowe: tuple[SkladowaSieciZerowej, ...]
    slad: tuple[dict[str, Any], ...] = field(default_factory=tuple)
    #: Punkty w części sieci bez żadnego bocznika do ziemi (brak pojemności doziemnej i punktu
    #: neutralnego w danych) — ``(punkt_ref, nazwa)``; zwarcia doziemnego tam nie liczy się
    #: (prąd ziemny nie ma drogi), ocena nazywa je brakiem danych zamiast cichego pominięcia.
    punkty_bez_drogi_zerowej: tuple[tuple[str, str], ...] = ()

    def punkt(self, punkt_ref: str, stan: StanWymuszenia) -> WynikPunktuDoziemienia | None:
        for wynik in self.punkty:
            if wynik.punkt_ref == punkt_ref and wynik.stan == stan:
                return wynik
        return None

    def skladowa_punktu(self, punkt_ref: str) -> SkladowaSieciZerowej | None:
        for wynik in self.punkty:
            if wynik.punkt_ref == punkt_ref:
                for skladowa in self.skladowe:
                    if skladowa.numer == wynik.skladowa:
                        return skladowa
        return None

    def to_dict(self) -> dict[str, Any]:
        return {
            "wersja": self.wersja,
            "c": self.c,
            "r_f_ohm": self.r_f_ohm,
            "punkty": [p.to_dict() for p in self.punkty],
            "skladowe": [s.to_dict() for s in self.skladowe],
            "punkty_bez_drogi_zerowej": [
                {"punkt_ref": ref, "nazwa_pl": nazwa}
                for ref, nazwa in self.punkty_bez_drogi_zerowej
            ],
            "slad": list(self.slad),
        }


def _skladowe(y0: np.ndarray) -> list[int]:
    """Numer składowej spójnej każdego indeksu (krawędź = niezerowy element pozadiagonalny)."""
    n = y0.shape[0]
    numer = [-1] * n
    biezacy = 0
    for start in range(n):
        if numer[start] >= 0:
            continue
        stos = [start]
        numer[start] = biezacy
        while stos:
            i = stos.pop()
            for j in np.nonzero(y0[i, :])[0]:
                j = int(j)
                if j != i and numer[j] < 0:
                    numer[j] = biezacy
                    stos.append(j)
        biezacy += 1
    return numer


def _bocznik_awsc_pu(bocznik: BocznikZerowy) -> complex | None:
    """Admitancja bocznika punktu neutralnego po dołączeniu rezystora wymuszającego."""
    pn = bocznik.punkt_neutralny
    if pn is None or pn.awsc_prad_a is None:
        return None
    r_w_ohm = pn.u_n_kv * 1000.0 / (math.sqrt(3.0) * pn.awsc_prad_a)
    zn_rownolegle = pn.zn_ohm * r_w_ohm / (pn.zn_ohm + r_w_ohm)
    z_bocznika = 1.0 / bocznik.y_pu
    z_po = z_bocznika - pn.zn3_pu + 3.0 * zn_rownolegle / pn.z_base_ohm
    return 1.0 / z_po


def _odwroc(y0: np.ndarray, aktywne: Sequence[int], opis: str) -> np.ndarray:
    """Z0 = Y0⁻¹ na indeksach ``aktywne`` (składowe z bocznikiem do ziemi); pozostałe wiersze
    i kolumny zerowe — węzeł bez drogi prądu zerowego nie ma napięcia od zwarcia gdzie indziej."""
    n = y0.shape[0]
    z0 = np.zeros((n, n), dtype=complex)
    if not aktywne:
        return z0
    podmacierz = y0[np.ix_(aktywne, aktywne)]
    if np.linalg.matrix_rank(podmacierz) < len(aktywne):
        raise OdmowaDanychError(
            f"Macierz admitancji składowej zerowej ({opis}) jest osobliwa mimo bocznika do ziemi "
            "w każdej składowej — sprawdź impedancje zerowe gałęzi (wartości zerowe albo "
            "wzajemnie znoszące się)."
        )
    z0[np.ix_(aktywne, aktywne)] = np.linalg.inv(podmacierz)
    return z0


def oblicz_doziemienie(wejscie: WejscieDoziemienia) -> WynikDoziemienia:
    """Zwarcie doziemne w każdym punkcie wejścia, w każdym stanie wymuszenia (WHITE BOX)."""
    y0 = np.array(wejscie.y0_pu, dtype=complex)
    if not np.all(np.isfinite(y0)):
        raise OdmowaDanychError(
            "Macierz admitancji składowej zerowej zawiera wartości nieskończone"
        )
    if not (wejscie.c > 0 and math.isfinite(wejscie.c)):
        raise OdmowaDanychError(f"Współczynnik napięciowy c = {wejscie.c!r} musi być dodatni")
    if not (wejscie.r_f_ohm >= 0 and math.isfinite(wejscie.r_f_ohm)):
        raise OdmowaDanychError(f"Rezystancja przejścia R_F = {wejscie.r_f_ohm!r} Ω musi być ≥ 0")
    slad: list[dict[str, Any]] = []
    numer_skladowej = _skladowe(y0)
    uziemione = {numer_skladowej[b.indeks] for b in wejscie.boczniki if b.y_pu != 0}
    aktywne = [i for i in range(y0.shape[0]) if numer_skladowej[i] in uziemione]
    bez_drogi = tuple(
        (p.punkt_ref, p.nazwa_pl)
        for p in wejscie.punkty
        if numer_skladowej[p.indeks] not in uziemione
    )
    if bez_drogi:
        slad.append(
            {
                "key": "punkty_bez_drogi_zerowej",
                "title": "Punkty bez drogi prądu zerowego do ziemi",
                "formula_latex": r"\sum_{s \in 	ext{składowa}} y_s = 0",
                "inputs": {"punkty": [ref for ref, _ in bez_drogi]},
                "substitution": (
                    "Część sieci bez pojemności doziemnej i bez uziemionego punktu neutralnego "
                    "w danych — zwarcia doziemnego w tych punktach się nie liczy: "
                    + ", ".join(nazwa for _, nazwa in bez_drogi)
                ),
                "result": {"liczba_punktow": len(bez_drogi)},
            }
        )

    # --- składowe sieci zerowej: I_C, I_L, rozstrojenie ------------------------------
    skladowe: list[SkladowaSieciZerowej] = []
    numery_z_punktami = sorted({numer_skladowej[p.indeks] for p in wejscie.punkty} & uziemione)
    for numer in numery_z_punktami:
        wezly = tuple(
            sorted(
                {b.wezel for b in wejscie.boczniki if numer_skladowej[b.indeks] == numer}
                | {p.wezel for p in wejscie.punkty if numer_skladowej[p.indeks] == numer}
            )
        )
        i_c = sum(
            3.0 * b.y_pu.imag * b.i_base_a
            for b in wejscie.boczniki
            if numer_skladowej[b.indeks] == numer and b.rodzaj != "PUNKT_NEUTRALNY"
        )
        neutralne = [
            b
            for b in wejscie.boczniki
            if numer_skladowej[b.indeks] == numer and b.rodzaj == "PUNKT_NEUTRALNY"
        ]
        i_l = sum(
            3.0 * (-b.y_pu.imag) * b.i_base_a
            for b in neutralne
            if b.punkt_neutralny is not None and b.punkt_neutralny.typ == "petersen_coil"
        )
        ma_dlawik = any(
            b.punkt_neutralny is not None and b.punkt_neutralny.typ == "petersen_coil"
            for b in neutralne
        )
        rozstrojenie = (i_l - i_c) / i_c if ma_dlawik and i_c > 0 else None
        skladowa = SkladowaSieciZerowej(
            numer=numer,
            wezly=wezly,
            prad_pojemnosciowy_a=float(i_c),
            prad_dlawikow_a=float(i_l),
            rozstrojenie=None if rozstrojenie is None else float(rozstrojenie),
            punkty_neutralne=tuple(
                (b.element_ref, b.punkt_neutralny.typ if b.punkt_neutralny else "directly_grounded")
                for b in neutralne
            ),
            ma_awsc=any(
                b.punkt_neutralny is not None and b.punkt_neutralny.awsc_prad_a is not None
                for b in neutralne
            ),
        )
        skladowe.append(skladowa)
        slad.append(
            {
                "key": f"skladowa_zerowa[{numer}]",
                "title": "Prąd pojemnościowy i kompensacja sieci składowej zerowej",
                "formula_latex": (
                    r"I_C = 3\sum_s B_s\,I_{b,s};\quad I_L = 3\sum_N (-B_N)\,I_{b,N};\quad "
                    r"v = \frac{I_L - I_C}{I_C}"
                ),
                "inputs": {
                    "boczniki": [
                        {
                            "element_ref": b.element_ref,
                            "nazwa_pl": b.nazwa_pl,
                            "rodzaj": b.rodzaj,
                            "y_pu": _zespolona(b.y_pu),
                            "i_base_a": b.i_base_a,
                        }
                        for b in wejscie.boczniki
                        if numer_skladowej[b.indeks] == numer
                    ]
                },
                "substitution": (
                    f"I_C = {i_c:.4g} A; I_L = {i_l:.4g} A"
                    + (f"; v = {rozstrojenie:.4g}" if rozstrojenie is not None else "")
                ),
                "result": skladowa.to_dict(),
            }
        )

    # --- stany wymuszenia: macierze Z0 --------------------------------------------------
    z0_przed = _odwroc(y0, aktywne, "przed wymuszeniem")
    awsc = [(b, _bocznik_awsc_pu(b)) for b in wejscie.boczniki]
    awsc = [(b, y) for b, y in awsc if y is not None]
    z0_po_skladowej: dict[int, np.ndarray] = {}
    for numer in sorted({numer_skladowej[b.indeks] for b, _ in awsc}):
        y0_po = y0.copy()
        for bocznik, y_po in awsc:
            if numer_skladowej[bocznik.indeks] != numer:
                continue
            y0_po[bocznik.indeks, bocznik.indeks] += y_po - bocznik.y_pu
            pn = bocznik.punkt_neutralny
            assert pn is not None and pn.awsc_prad_a is not None
            slad.append(
                {
                    "key": f"awsc[{bocznik.element_ref}]",
                    "title": f"Wymuszenie składowej czynnej — {bocznik.nazwa_pl}",
                    "formula_latex": (
                        r"R_W = \frac{U_n}{\sqrt{3}\,I_W};\quad "
                        r"Z_N' = \frac{Z_N R_W}{Z_N + R_W};\quad "
                        r"Y_N' = \frac{1}{Z_{0} - 3Z_N + 3Z_N'}"
                    ),
                    "inputs": {
                        "u_n_kv": pn.u_n_kv,
                        "i_w_a": pn.awsc_prad_a,
                        "z_n_ohm": _zespolona(pn.zn_ohm),
                    },
                    "substitution": (
                        f"R_W = {pn.u_n_kv * 1000.0 / (math.sqrt(3.0) * pn.awsc_prad_a):.4g} Ω"
                    ),
                    "result": {"y_przed_pu": _zespolona(bocznik.y_pu), "y_po_pu": _zespolona(y_po)},
                }
            )
        z0_po_skladowej[numer] = _odwroc(y0_po, aktywne, "po wymuszeniu AWSC")

    boczniki_strefy = {
        strefa.strefa_ref: [b for b in wejscie.boczniki if b.wezel in strefa.wezly]
        for strefa in wejscie.strefy
    }
    neutralne_wszystkie = [b for b in wejscie.boczniki if b.rodzaj == "PUNKT_NEUTRALNY"]

    wyniki: list[WynikPunktuDoziemienia] = []
    for punkt in wejscie.punkty:
        numer = numer_skladowej[punkt.indeks]
        if numer not in uziemione:
            continue
        stany: list[tuple[StanWymuszenia, np.ndarray, dict[str, complex]]] = [
            (STAN_PRZED, z0_przed, {})
        ]
        if numer in z0_po_skladowej:
            stany.append(
                (
                    STAN_PO_AWSC,
                    z0_po_skladowej[numer],
                    {b.element_ref: y for b, y in awsc if numer_skladowej[b.indeks] == numer},
                )
            )
        for stan, z0, y_zmienione in stany:
            z_f_pu = wejscie.r_f_ohm / punkt.z_base_ohm
            mianownik = punkt.z1_pu + punkt.z2_pu + z0[punkt.indeks, punkt.indeks] + 3.0 * z_f_pu
            if mianownik == 0:
                raise OdmowaDanychError(
                    f"Zerowa impedancja pętli zwarcia doziemnego w punkcie {punkt.nazwa_pl}"
                )
            i0_f = wejscie.c / mianownik
            v0 = -z0[:, punkt.indeks] * i0_f
            granica = GRANICA_V0_KROTNOSC_C * wejscie.c
            if not np.all(np.isfinite(v0)) or float(np.max(np.abs(v0))) > granica:
                raise OdmowaDanychError(
                    f"Zwarcie doziemne w punkcie {punkt.nazwa_pl}: napięcie składowej zerowej "
                    f"poza granicą wiarygodności |V0| ≤ {granica:.3g} p.u. "
                    f"(max |V0| = {float(np.max(np.abs(v0))):.4g} p.u.) — sprawdź dane "
                    "punktu neutralnego (dławik bez strat w rezonansie) i susceptancji B0."
                )

            def _y(b: BocznikZerowy, y_zm: dict[str, complex] = y_zmienione) -> complex:
                return y_zm.get(b.element_ref, b.y_pu)

            pola: list[WielkosciPola] = []
            for strefa in wejscie.strefy:
                w_strefie = punkt.wezel in strefa.wezly
                i0_pole = sum(
                    (_y(b) * complex(v0[b.indeks]) for b in boczniki_strefy[strefa.strefa_ref]),
                    start=0j,
                )
                if w_strefie:
                    i0_pole += i0_f
                prad_3i0 = 3.0 * i0_pole * strefa.i_base_a
                u0 = complex(v0[strefa.indeks_pomiaru]) * strefa.u_n_kv * 1000.0 / math.sqrt(3.0)
                minus_u0 = -u0
                if abs(u0) > 0:
                    y0_s: complex | None = prad_3i0 / minus_u0
                    kat: float | None = (
                        math.degrees(cmath.phase(prad_3i0) - cmath.phase(minus_u0))
                        if abs(prad_3i0) > 0
                        else None
                    )
                    if kat is not None:
                        kat = (kat + 180.0) % 360.0 - 180.0
                else:
                    y0_s = None
                    kat = None
                pola.append(
                    WielkosciPola(
                        strefa_ref=strefa.strefa_ref,
                        zwarcie_w_strefie=w_strefie,
                        prad_3i0_a=prad_3i0,
                        u0_v=u0,
                        u0_proc=float(abs(v0[strefa.indeks_pomiaru]) * 100.0),
                        admitancja_y0_s=y0_s,
                        moc_p0_w=float((minus_u0 * prad_3i0.conjugate()).real),
                        kat_phi0_deg=kat,
                    )
                )
            prad_doziemny = 3.0 * i0_f * punkt.i_base_a
            u0_punktu = complex(v0[punkt.indeks]) * punkt.u_n_kv * 1000.0 / math.sqrt(3.0)
            prady_neutralne = tuple(
                (b.element_ref, 3.0 * _y(b) * complex(v0[b.indeks]) * b.i_base_a)
                for b in neutralne_wszystkie
                if numer_skladowej[b.indeks] == numer
            )
            wynik = WynikPunktuDoziemienia(
                punkt_ref=punkt.punkt_ref,
                nazwa_pl=punkt.nazwa_pl,
                stan=stan,
                skladowa=numer,
                prad_doziemny_a=prad_doziemny,
                u0_punktu_v=u0_punktu,
                u0_punktu_proc=float(abs(v0[punkt.indeks]) * 100.0),
                pola=tuple(pola),
                prady_punktow_neutralnych_a=prady_neutralne,
            )
            wyniki.append(wynik)
            slad.append(
                {
                    "key": f"doziemienie[{punkt.punkt_ref}][{stan}]",
                    "title": (
                        f"Zwarcie doziemne w punkcie {punkt.nazwa_pl} — {ETYKIETY_STANU_PL[stan]}"
                    ),
                    "formula_latex": (
                        r"I_{0f} = \frac{c}{Z_{1,kk} + Z_{2,kk} + Z_{0,kk} + 3Z_F};\quad "
                        r"I_F = 3 I_{0f} I_b;\quad V_0 = -Z_0[:,k]\,I_{0f};\quad "
                        r"3I_{0,pole} = 3\Big(\sum_{s\in S} y_s V_{0,s} + I_{0f}[k\in S]\Big) I_b"
                    ),
                    "inputs": {
                        "c": wejscie.c,
                        "r_f_ohm": wejscie.r_f_ohm,
                        "z1_kk_pu": _zespolona(punkt.z1_pu),
                        "z2_kk_pu": _zespolona(punkt.z2_pu),
                        "z0_kk_pu": _zespolona(complex(z0[punkt.indeks, punkt.indeks])),
                        "i_base_a": punkt.i_base_a,
                    },
                    "substitution": (
                        f"I_F = {abs(prad_doziemny):.4g} A; |U0| = {abs(u0_punktu):.5g} V "
                        f"({wynik.u0_punktu_proc:.3g} % U0n)"
                    ),
                    "result": wynik.to_dict(),
                }
            )

    return WynikDoziemienia(
        wersja=DOZIEMIENIE_SN_SOLVER_VERSION,
        c=wejscie.c,
        r_f_ohm=wejscie.r_f_ohm,
        punkty=tuple(wyniki),
        skladowe=tuple(skladowe),
        slad=tuple(slad),
        punkty_bez_drogi_zerowej=bez_drogi,
    )
