"""Pasma wiarygodności parametrów jednostkowych linii napowietrznej 110 kV (karta LINIA-110).

Warstwa INTERPRETACJI (Z15): czyta wynik solvera ``network_model.solvers.
parametry_linii_napowietrznej`` i ocenia, czy każdy parametr leży w paśmie fizycznie możliwym
dla linii 110 kV 50 Hz. NIE liczy fizyki — granice są stałymi; ich wyprowadzenie stoi niżej
i w polu ``podstawa_pl`` każdej oceny. Łapie absurdy (błąd jednostek geometrii, przewód
z innej przestrzeni katalogu, odwrócony GMR/GMD) zanim parametry trafią do analiz.

ZAKRES PASM (ZAŁOŻENIE INŻYNIERSKIE — brak normy podającej takie pasma; każde wyprowadzone
z klasycznych wzorów linii transponowanej dla jawnie podanego zakresu danych wejściowych):

* linia jednotorowa 110 kV, 50 Hz, przewody AL1/STxA wg PN-EN 50182 od 120 do 680 mm²,
  wiązka 1 albo 2 przewody, średnia geometryczna odległość faz GMD od 3 do 9 m, wysokość
  zawieszenia od 10 do 40 m, rezystywność gruntu od 10 do 10 000 Ω·m;
* R′1 (20 °C): tablica PN-EN 50182 — od 0,0425 Ω/km (680-AL1/85) do 0,237 Ω/km (122-AL1/20),
  wiązka 2 dzieli przez dwa → pasmo [0,02; 0,30] Ω/km (z zapasem na przewody odgromowe);
* X′1 = (ωμ0/2π)·ln(GMD/GMR_w): GMR_w od 5 mm (pojedynczy 120 mm²) do 0,12 m (wiązka 2,
  odstęp 0,4 m), GMD od 3 do 9 m → od 0,20 do 0,47 Ω/km → pasmo [0,20; 0,48] Ω/km;
* B′1 = ω·2πε0/ln(GMD/r_w): r_w od 7 mm do 0,15 m → od 2,4 do 5,9 μS/km → pasmo
  [2,2; 6,0] μS/km (metoda odbić podnosi B′1 o kilka procent);
* R′0: R′1 + 3·π²·f·10⁻⁴ Ω/km (pierwszy wyraz Carsona: 0,148 Ω/km przy 50 Hz) plus udział
  przewodów odgromowych → pasmo [0,10; 0,80] Ω/km;
* X′0/X′1: z odgromowym o małej rezystancji ≈ 2, bez odgromowego przy 10 000 Ω·m ≈ 4,5 →
  pasmo [1,8; 5,0];
* B′0/B′1: współczynniki potencjałowe P0 = Ps + 2Pm > P1 = Ps − Pm dla Pm > 0, wysokość
  zawieszenia 10–40 m → pasmo [0,35; 0,90].

Status poza pasmem nie blokuje obliczenia (zasada nr 4) — jest sygnałem do sprawdzenia danych
w wyjaśnieniu parametrów linii.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Final

from analysis.sanity_bounds.oceny import CREDIBLE, OUT_OF_RANGE, kod_wiarygodnosci, ocena_pasma
from network_model.pochodne import simens_na_mikrosimens
from werdykt import OcenaKryterium, WyjasnienieWerdyktu
from werdykt.porownanie import podstawa_zalozenia

#: Podstawa wszystkich pasm (zdanie dla projektanta).
PODSTAWA_PASM_PL = (
    "Założenie inżynierskie: pasmo wyprowadzone z klasycznych wzorów linii transponowanej "
    "(GMD/GMR, współczynniki potencjałowe, pierwszy wyraz Carsona) dla linii jednotorowej "
    "110 kV 50 Hz z przewodami 120–680 mm² wg PN-EN 50182, wiązką 1–2 przewodów i GMD 3–9 m."
)


#: Podstawa pasm jako rekord (ten sam tekst co ``PODSTAWA_PASM_PL``).
_PODSTAWA_PASM: Final = podstawa_zalozenia(
    "Pasma wiarygodności parametrów linii 110 kV programu",
    "parametry jednostkowe linii jednotorowej 110 kV 50 Hz (GMD/GMR, Carson)",
    uwagi_pl=PODSTAWA_PASM_PL,
)


@dataclass(frozen=True)
class PasmoParametruLinii:
    """Pasmo wiarygodności jednego parametru: klucz, nazwa, jednostka, granice."""

    parametr: str
    nazwa_pl: str
    jednostka: str
    dolna: float
    gorna: float


#: Pasma w kolejności prezentacji (determinizm). Granice wyprowadzone w docstringu modułu.
PASMA_LINII_110KV: tuple[PasmoParametruLinii, ...] = (
    PasmoParametruLinii("r1_ohm_per_km", "Rezystancja R′1 (20 °C)", "Ω/km", 0.02, 0.30),
    PasmoParametruLinii("x1_ohm_per_km", "Reaktancja X′1", "Ω/km", 0.20, 0.48),
    PasmoParametruLinii("b1_us_per_km", "Susceptancja B′1", "μS/km", 2.2, 6.0),
    PasmoParametruLinii("r0_ohm_per_km", "Rezystancja R′0", "Ω/km", 0.10, 0.80),
    PasmoParametruLinii("x0_do_x1", "Stosunek X′0/X′1", "—", 1.8, 5.0),
    PasmoParametruLinii("b0_do_b1", "Stosunek B′0/B′1", "—", 0.35, 0.90),
)


@dataclass(frozen=True)
class OcenaParametruLinii:
    """Ocena jednego parametru wobec pasma — wartość, granice, podstawa i zdanie wyjaśnienia."""

    parametr: str
    nazwa_pl: str
    wartosc: float | None
    jednostka: str
    dolna: float
    gorna: float
    w_pasmie: bool
    #: Kod trójstanu wiarygodności — projekcja rekordu ``ocena``.
    ocena_wiarygodnosci: str
    ocena: OcenaKryterium
    wyjasnienie: WyjasnienieWerdyktu
    wyjasnienie_pl: str
    podstawa_pl: str

    def to_dict(self) -> dict[str, object]:
        return {
            "parametr": self.parametr,
            "nazwa_pl": self.nazwa_pl,
            "wartosc": self.wartosc,
            "jednostka": self.jednostka,
            "dolna": self.dolna,
            "gorna": self.gorna,
            "w_pasmie": self.w_pasmie,
            "ocena_wiarygodnosci": self.ocena_wiarygodnosci,
            "ocena": self.ocena.model_dump(mode="json"),
            "wyjasnienie": self.wyjasnienie.model_dump(mode="json"),
            "wyjasnienie_pl": self.wyjasnienie_pl,
            "podstawa_pl": self.podstawa_pl,
        }


def _liczba(wartosc: float) -> str:
    return f"{wartosc:.4g}".replace(".", ",")


#: Symbol parametru w LaTeX (rekord werdyktu wymaga symbolu wyniku liczbowego).
_SYMBOL_LATEX: Final[dict[str, str]] = {
    "r1_ohm_per_km": r"R'_1",
    "x1_ohm_per_km": r"X'_1",
    "b1_us_per_km": r"B'_1",
    "r0_ohm_per_km": r"R'_0",
    "x0_do_x1": r"X'_0 / X'_1",
    "b0_do_b1": r"B'_0 / B'_1",
}


def _ocen(pasmo: PasmoParametruLinii, wartosc: float | None) -> OcenaParametruLinii:
    znana = wartosc is not None and math.isfinite(wartosc)
    ocena = ocena_pasma(
        kryterium_id=f"wiarygodnosc.linia_110kv.{pasmo.parametr}",
        opis_pl=f"{pasmo.nazwa_pl} w paśmie wiarygodności linii 110 kV",
        warunek_latex=r"x_{\min} \le x \le x_{\max}",
        wielkosc_pl=pasmo.nazwa_pl,
        symbol_latex=_SYMBOL_LATEX[pasmo.parametr],
        jednostka="1" if pasmo.jednostka == "—" else pasmo.jednostka,
        relacja="PASMO",
        wynik=wartosc if znana else None,
        pasmo=(pasmo.dolna, pasmo.gorna),
        nazwa_pl="linia 110 kV",
        opis_przedmiotu_pl="Parametry jednostkowe linii 110 kV z geometrii słupa",
        podstawa=_PODSTAWA_PASM,
        rodzaj_analizy="POWER_FLOW",
        braki=() if znana else (f"{pasmo.nazwa_pl}: skończona wartość z obliczenia geometrii.",),
    )
    kod = kod_wiarygodnosci(ocena)
    if wartosc is None or not znana:
        return OcenaParametruLinii(
            parametr=pasmo.parametr,
            nazwa_pl=pasmo.nazwa_pl,
            wartosc=None,
            jednostka=pasmo.jednostka,
            dolna=pasmo.dolna,
            gorna=pasmo.gorna,
            w_pasmie=False,
            ocena_wiarygodnosci=kod,
            ocena=ocena,
            wyjasnienie=ocena.wyjasnienie,
            wyjasnienie_pl=f"{pasmo.nazwa_pl}: brak skończonej wartości do oceny.",
            podstawa_pl=PODSTAWA_PASM_PL,
        )
    jednostka = "" if pasmo.jednostka == "—" else f" {pasmo.jednostka}"
    granice = f"[{_liczba(pasmo.dolna)}; {_liczba(pasmo.gorna)}]{jednostka}"
    # Jedno zdanie liczbowe; rozstrzygnięcie niesie rekord ``ocena``. Poza pasmem — wskazówka
    # naprawcza z kierunkiem odchylenia (liczby, nie słowo werdyktu).
    zdanie = (
        f"{pasmo.nazwa_pl} = {_liczba(wartosc)}{jednostka} wobec pasma {granice} dla linii 110 kV."
    )
    if kod == OUT_OF_RANGE:
        kierunek = "powyżej" if wartosc > pasmo.gorna else "poniżej"
        zdanie += (
            f" Wartość leży {kierunek} pasma — sprawdź geometrię słupa (jednostki, wysokości), "
            "przewód i rezystywność gruntu."
        )
    return OcenaParametruLinii(
        parametr=pasmo.parametr,
        nazwa_pl=pasmo.nazwa_pl,
        wartosc=wartosc,
        jednostka=pasmo.jednostka,
        dolna=pasmo.dolna,
        gorna=pasmo.gorna,
        w_pasmie=kod == CREDIBLE,
        ocena_wiarygodnosci=kod,
        ocena=ocena,
        wyjasnienie=ocena.wyjasnienie,
        wyjasnienie_pl=zdanie,
        podstawa_pl=PODSTAWA_PASM_PL,
    )


def ocen_parametry_linii_110kv(
    *,
    r1_ohm_per_km: float,
    x1_ohm_per_km: float,
    b1_s_per_km: float,
    r0_ohm_per_km: float,
    x0_ohm_per_km: float,
    b0_s_per_km: float,
) -> tuple[OcenaParametruLinii, ...]:
    """Oceny wszystkich pasm (kolejność ``PASMA_LINII_110KV``).

    Stosunki X′0/X′1 i B′0/B′1 to przeliczenie prezentacyjne dwóch liczb solvera (iloraz), nie
    fizyka; przy X′1 albo B′1 równym zero stosunek nie istnieje i ocena jest niekompletna.
    """
    wartosci: dict[str, float | None] = {
        "r1_ohm_per_km": r1_ohm_per_km,
        "x1_ohm_per_km": x1_ohm_per_km,
        "b1_us_per_km": simens_na_mikrosimens(b1_s_per_km),
        "r0_ohm_per_km": r0_ohm_per_km,
        "x0_do_x1": x0_ohm_per_km / x1_ohm_per_km if x1_ohm_per_km else None,
        "b0_do_b1": b0_s_per_km / b1_s_per_km if b1_s_per_km else None,
    }
    return tuple(_ocen(pasmo, wartosci[pasmo.parametr]) for pasmo in PASMA_LINII_110KV)
