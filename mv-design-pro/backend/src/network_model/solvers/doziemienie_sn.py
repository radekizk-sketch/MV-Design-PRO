"""Doziemienie jednofazowe w sieci SN wg sposobu pracy punktu neutralnego (WHITE BOX).

Karta UX-04/POLE-ZU-SKLADOWA-ZEROWA, warunek odbioru właściciela 2026-10-29: cztery sposoby
pracy punktu neutralnego NIE przechodzą przez jeden model impedancyjny Ik1 = 3·c·U_f/|Z1 +
Z2 + Z0|. Każdy tryb ma własną fizykę, wzór i podstawę:

* **izolowany** — prąd doziemny jest prądem pojemnościowym sieci galwanicznej
  I_C = 3·ω·C_0·U_f = √3·U_n·B_0 (B_0 = Σ susceptancji zerowych odcinków i baterii
  w gwieździe uziemionej). Nie jest to prąd zwarciowy IEC 60909: IEC 60909-0:2016 rozdz. 1
  wyłącza doziemienia w sieciach z punktem neutralnym izolowanym i skompensowanym, a ich
  podwójne zwarcie doziemne opisuje IEC 60909-3 (tu nie liczone — odmowa nazwana);
* **kompensowany** (dławik gaszący, także z automatyką wymuszania składowej czynnej —
  ENEA Zeszyt 1 §16, Z.13, w obu stanach automatyki) — prąd resztkowy
  I_res = √(I_w² + (I_C − I_L)²), rozstrojenie v = (I_C − I_L)/I_C; I_L i I_w z admitancji
  punktów neutralnych modelu (dławik, rezystor wymuszający AWSC w stanie przypadku,
  impedancja zerowa transformatora uziemiającego w szeregu);
* **rezystor** (Z.15, także dławik ‖ rezystor Z.14) — I_F = |I_N + j·I_C|,
  I_N = Σ U_f/(Z_N + Z_0/3): dla czystego rezystora bez Z_0 I_F = √(I_R² + I_C²),
  I_R = U_f/R_N; impedancja zerowa transformatora uziemiającego (albo transformatora sieci
  dla punktu neutralnego uzwojenia) wchodzi do R_N/X_N, w Z.14 obie gałęzie łącznie;
* **bezpośrednio uziemiony** — prąd zwarciowy Ik1 wg IEC 60909-0 przez Z0 (rdzeń zwarć);
  ten moduł wyznacza dla niego napięcia faz zdrowych i U0 z impedancji składowych punktu.

Napięcia (faza a doziemiona przez impedancję przejścia Z_f; Z_f = 0 — metalicznie):

* tryby izolowany, kompensowany i rezystorowy bez impedancji składowych punktu: impedancje
  podłużne sieci pominięte wobec obwodu zerowego (1/(3ωC_0), 3·Z_N). Sieć widziana z miejsca
  doziemienia to źródło U_f za admitancją Y = I/U_f (I — prąd doziemienia metalicznego,
  zespolony: I_N + j·I_C), więc I_F = U_f·Y/(1 + Z_f·Y), przesunięcie punktu neutralnego
  V_N = −E_a/(1 + Z_f·Y): U0 = U_f/|1 + Z_f·Y|, U_b = U_f·|a² − 1/(1 + Z_f·Y)|,
  U_c = U_f·|a − 1/(1 + Z_f·Y)|; metalicznie U0 = U_f, U_b = U_c = √3·U_f (współczynnik
  zwarcia doziemnego k = √3, IEC 60071-1);
* tryby rezystorowy i bezpośredni z impedancjami składowych punktu z rdzenia IEC 60909:
  I0 = U_f/(Z1 + Z2 + Z0 + 3·Z_f), U0 = |Z0·I0|, U_b = |a²·(U_f − Z1·I0) − a·Z2·I0 − Z0·I0|,
  U_c — a ↔ a² (metoda składowych symetrycznych; E = U_f — napięcie robocze, współczynnik
  c dotyczy wartości prądu zwarciowego, nie napięć faz zdrowych).

Moduł importuje bibliotekę standardową, liść słowników ``network_model.core.uziemienie``
(tryb doziemienia — jedno odwzorowanie z typem punktu neutralnego) i algebrę punktu
neutralnego ``network_model.pochodne.punkt_neutralny`` (U_f, I_C, v — jedno miejsce wzorów);
dane z modelu zbiera ``enm.uziemienie_sekcji.UziemienieSekcji.dane_doziemienia``.
"""

from __future__ import annotations

import cmath
import math
from dataclasses import dataclass, field
from typing import Any, Literal

from network_model.core.uziemienie import TrybDoziemienia
from network_model.pochodne.punkt_neutralny import (
    napiecie_fazowe_punktu_neutralnego_v,
    prad_pojemnosciowy_doziemienia_a,
    stopien_rozstrojenia,
)
from werdykt import format_liczba

CharakterPradu = Literal["pojemnosciowy", "resztkowy", "rezystancyjno_pojemnosciowy", "zwarciowy"]

CHARAKTER_TRYBU: dict[str, CharakterPradu] = {
    "izolowany": "pojemnosciowy",
    "kompensowany": "resztkowy",
    "rezystor": "rezystancyjno_pojemnosciowy",
    "bezposrednie": "zwarciowy",
}

ETYKIETA_PL_CHARAKTERU: dict[str, str] = {
    "pojemnosciowy": "prąd pojemnościowy sieci",
    "resztkowy": "prąd resztkowy sieci skompensowanej",
    "rezystancyjno_pojemnosciowy": "prąd rezystancyjno-pojemnościowy",
    "zwarciowy": "prąd zwarciowy IEC 60909",
}

ETYKIETA_PL_TRYBU: dict[str, str] = {
    "izolowany": "punkt neutralny izolowany",
    "kompensowany": "punkt neutralny kompensowany (dławik gaszący)",
    "rezystor": "punkt neutralny uziemiony przez rezystor",
    "bezposrednie": "punkt neutralny uziemiony bezpośrednio",
}

_A = cmath.rect(1.0, 2.0 * math.pi / 3.0)

PODSTAWA_ZAKRESU_PL = (
    "IEC 60909-0:2016 rozdz. 1 — zakres normy nie obejmuje doziemień w sieciach z punktem "
    "neutralnym izolowanym i skompensowanym (prąd doziemny nie jest prądem zwarciowym)"
)
PODSTAWA_NAPIEC_PL = (
    "Metoda składowych symetrycznych; współczynnik zwarcia doziemnego k = U_fazy zdrowej/U_f "
    "(IEC 60071-1)"
)
PODWOJNE_DOZIEMIENIE_PL = (
    "Podwójne zwarcie doziemne (dwa doziemienia w różnych fazach i miejscach) opisuje "
    "IEC 60909-3; program go nie liczy — wynik dotyczy pojedynczego doziemienia."
)
ZASTRZEZENIE_STRAT_PL = (
    "Straty czynne dławika i upływność izolacji sieci nie są opisane w modelu — składowa "
    "czynna I_w zawiera wyłącznie rezystor wymuszający (AWSC) i rezystancję zerową "
    "transformatora uziemiającego; rzeczywisty prąd resztkowy jest nie mniejszy."
)
ZASTRZEZENIE_PODLUZNYCH_PL = (
    "Impedancje podłużne sieci (linie, kable, transformator zasilający) pominięte wobec "
    "impedancji obwodu zerowego punktu neutralnego i pojemności doziemnych — prąd "
    "doziemny nie zależy od miejsca doziemienia w sieci galwanicznej."
)
ZASTRZEZENIE_DROGI_SZEREGOWEJ_PL = (
    "Punkt neutralny uzwojenia transformatora o obu gwiazdach uziemionych (YNyn): droga prądu "
    "zerowego biegnie dalej przez sieć drugiej strony transformatora — jej impedancja zerowa "
    "pominięta w prądzie doziemienia (prąd zawyżony)."
)
ZASTRZEZENIE_ZEROWEJ_POJEMNOSCI_PL = (
    "Model sieci nie zawiera linii, kabli ani baterii w gwieździe uziemionej — pojemność "
    "doziemna modelu równa zeru; prąd pojemnościowy 0 A dotyczy modelu (pojemności szyn "
    "i uzwojeń nie są opisane)."
)


@dataclass(frozen=True)
class PunktNeutralnyDoziemienia:
    """Punkt uziemienia sieci w ruchu: impedancja punktu neutralnego Z_N [Ω] (gałęzie
    w ruchu równolegle: dławik jX_L, rezystor R, rezystor wymuszający AWSC; 0 — wprost)
    i impedancja zerowa w szeregu z nim Z_0 [Ω/fazę] (transformator uziemiający Z_0,TU albo
    transformator sieci Z_T0 dla punktu neutralnego uzwojenia; ``None`` — brak)."""

    nazwa_pl: str
    z_n_ohm: complex
    z0_tu_ohm: complex | None


@dataclass(frozen=True)
class DaneDoziemienia:
    """Wejście jednej galwanicznie połączonej sieci SN.

    ``b0_s`` — Σ susceptancji zerowych B_0 sieci [S] (``None`` — pojemność doziemna
    nieoznaczalna, ``brak_b0_pl`` mówi dlaczego); ``punkty`` — punkty uziemienia w ruchu
    w stanie AWSC przypadku; ``z1_ohm``/``z2_ohm``/``z0_ohm`` — impedancje składowych punktu
    zwarcia z rdzenia IEC 60909 (tryby uziemione przez małą impedancję); ``ikss_iec_a`` —
    prąd Ik1 rdzenia (tryb bezpośredni); ``z_f_ohm`` — impedancja przejścia w miejscu
    doziemienia (``None`` — metaliczne)."""

    tryb: TrybDoziemienia
    napiecie_kv: float
    b0_s: float | None
    punkty: tuple[PunktNeutralnyDoziemienia, ...] = ()
    brak_b0_pl: str | None = None
    z1_ohm: complex | None = None
    z2_ohm: complex | None = None
    z0_ohm: complex | None = None
    ikss_iec_a: float | None = None
    z_f_ohm: complex | None = None
    #: W ruchu jest dławik (zespół albo punkt neutralny uzwojenia przez dławik) — wtedy
    #: wynik niesie stopień rozstrojenia v (także w układzie dławik ‖ rezystor Z.14).
    dlawik_w_ruchu: bool = False
    #: Punkt neutralny uzwojenia YNyn — droga zerowa przez sieć drugiej strony (zastrzeżenie).
    droga_szeregowa: bool = False


@dataclass(frozen=True)
class WynikDoziemienia:
    """Wynik doziemienia sieci (wartości skuteczne, prądy [A], napięcia [V])."""

    tryb: TrybDoziemienia
    charakter: CharakterPradu
    prad_a: float | None
    i_c_a: float | None
    i_l_a: float | None
    i_w_a: float | None
    rozstrojenie: float | None
    u_f_v: float
    u0_v: float | None
    u_faza_b_v: float | None
    u_faza_c_v: float | None
    wspolczynnik_k: float | None
    wzor_latex: str
    podstawa_pl: str
    zastrzezenia_pl: tuple[str, ...]
    brak_pl: str | None
    z_f_ohm: complex | None = None
    slad: tuple[dict[str, Any], ...] = field(default=())

    def to_dict(self) -> dict[str, Any]:
        return {
            "tryb": self.tryb,
            "tryb_pl": ETYKIETA_PL_TRYBU[self.tryb],
            "charakter": self.charakter,
            "charakter_pl": ETYKIETA_PL_CHARAKTERU[self.charakter],
            "prad_a": _r(self.prad_a),
            "i_c_a": _r(self.i_c_a),
            "i_l_a": _r(self.i_l_a),
            "i_w_a": _r(self.i_w_a),
            "rozstrojenie": _r(self.rozstrojenie, 6),
            "u_f_v": _r(self.u_f_v),
            "u0_v": _r(self.u0_v),
            "u_faza_b_v": _r(self.u_faza_b_v),
            "u_faza_c_v": _r(self.u_faza_c_v),
            "wspolczynnik_k": _r(self.wspolczynnik_k, 6),
            "z_f_ohm": _z(self.z_f_ohm),
            "wzor_latex": self.wzor_latex,
            "podstawa_pl": self.podstawa_pl,
            "zastrzezenia_pl": list(self.zastrzezenia_pl),
            "brak_pl": self.brak_pl,
            "podwojne_doziemienie_pl": (
                PODWOJNE_DOZIEMIENIE_PL if self.tryb in ("izolowany", "kompensowany") else None
            ),
            "slad": [dict(krok) for krok in self.slad],
        }


def _r(wartosc: float | None, miejsca: int = 4) -> float | None:
    return None if wartosc is None else round(wartosc, miejsca)


def _z(wartosc: complex | None) -> dict[str, float] | None:
    return None if wartosc is None else {"re": wartosc.real, "im": wartosc.imag}


def _pl(wartosc: float, wzor: str) -> str:
    """Liczba podstawienia śladu w zapisie polskim (przecinek dziesiętny) o stałej liczbie
    miejsc — podstawienie czyta projektant (ekran składowych, raport), nie tylko audyt."""
    return format(wartosc, wzor).replace(".", ",")


def _tex(wartosc: float, wzor: str) -> str:
    """Liczba podstawienia w LaTeX-u: przecinek dziesiętny jako ``{,}`` (bez odstępu KaTeX-a)."""
    return format(wartosc, wzor).replace(".", "{,}")


def _zespolona_pl(z: complex) -> str:
    """Liczba zespolona prozy podstawienia: ``a + jb`` / ``a − jb`` (znak przy ``j``)."""
    znak = "−" if z.imag < 0.0 else "+"
    return f"{_pl(z.real, '.4f')} {znak} j{_pl(abs(z.imag), '.4f')}"


def _zespolona_tex(z: complex) -> str:
    """Liczba zespolona podstawienia LaTeX: ``a + j\\,b`` / ``a - j\\,b``."""
    znak = "-" if z.imag < 0.0 else "+"
    return rf"{_tex(z.real, '.4f')} {znak} j\,{_tex(abs(z.imag), '.4f')}"


def _napiecia_latex(u0: float, u_b: float, u_c: float) -> str:
    return (
        rf"U_0 = {_tex(u0, '.2f')}\ \mathrm{{V}};\quad U_b = {_tex(u_b, '.2f')}\ \mathrm{{V}};"
        rf"\quad U_c = {_tex(u_c, '.2f')}\ \mathrm{{V}}"
    )


def _krok(
    key: str,
    title: str,
    formula_latex: str,
    inputs: dict[str, Any],
    substitution: str,
    substitution_latex: str | None,
    result: dict[str, Any],
) -> dict[str, Any]:
    """Krok śladu: ``substitution`` — proza podstawienia (raport), ``substitution_latex`` —
    to samo podstawienie do KaTeX-a (ekran; matematyka wyłącznie z pól ``*_latex``)."""
    return {
        "key": key,
        "title": title,
        "formula_latex": formula_latex,
        "inputs": inputs,
        "substitution": substitution,
        "substitution_latex": substitution_latex,
        "result": result,
    }


def prad_punktow_neutralnych_a(
    u_f_v: float, punkty: tuple[PunktNeutralnyDoziemienia, ...]
) -> complex:
    """I_N = Σ U_f/(Z_N + Z_0/3) [A] — prąd obwodu punktów neutralnych przy przesunięciu
    punktu neutralnego o U_f (zwrot: Re > 0 czynny, Im < 0 indukcyjny)."""
    return sum(
        (
            u_f_v / (p.z_n_ohm + (p.z0_tu_ohm / 3.0 if p.z0_tu_ohm is not None else 0j))
            for p in punkty
        ),
        0j,
    )


def napiecia_faz_przy_doziemieniu(
    u_f_v: float,
    z1_ohm: complex,
    z2_ohm: complex,
    z0_ohm: complex,
    z_f_ohm: complex = 0j,
) -> tuple[float, float, float]:
    """(U0, U_b, U_c) [V] doziemienia fazy a z impedancji składowych punktu zwarcia, E = U_f:
    I0 = E/(Z1 + Z2 + Z0 + 3·Z_f); U0 = |Z0·I0|; U_b = |a²·(E − Z1·I0) − a·Z2·I0 − Z0·I0|,
    U_c — a ↔ a²."""
    e = complex(u_f_v, 0.0)
    i = e / (z1_ohm + z2_ohm + z0_ohm + 3.0 * z_f_ohm)
    v1, v2, v0 = e - z1_ohm * i, -z2_ohm * i, -z0_ohm * i
    v_b = v0 + _A * _A * v1 + _A * v2
    v_c = v0 + _A * v1 + _A * _A * v2
    return abs(v0), abs(v_b), abs(v_c)


#: Próg współczynnika zwarcia doziemnego warunku pojemności linii w składowej zerowej
#: (IEC 60909-0:2016 pkt 5.2 f)): pojemności wchodzą, gdy k jest WIĘKSZY niż 1,4.
PROG_WSPOLCZYNNIKA_ZWARCIA_DOZIEMNEGO = 1.4

#: Podstawa warunku pojemności linii w składowej zerowej zwarć IEC 60909 — JEDNO źródło tekstu
#: dla złożenia macierzy Y0 (``enm.mapping``) i jego kroku śladu WHITE BOX.
PODSTAWA_WARUNKU_POJEMNOSCI_ZEROWEJ_PL = (
    "IEC 60909-0:2016 pkt 5.2 f) — w składowej zerowej pojemności linii uwzględnia się "
    "w sieciach uziemionych przez małą impedancję, gdy współczynnik zwarcia doziemnego jest "
    "większy niż 1,4 (parafraza normy, nie cytat — ustalenie właściciela 2026-10-22). "
    "Współczynnik zwarcia doziemnego k = U_fazy zdrowej/U_f przy zwarciu jednofazowym "
    "metalicznym (IEC 60071-1) z impedancji składowych miejsca zwarcia, Z_2 = Z_1, wyznaczony "
    "z sieci zerowej BEZ pojemności linii; sieć zerowa (składowa spójna macierzy Y0) dostaje "
    "pojemności B0 wszystkich swoich linii i kabli, gdy największe k jej węzłów liczonych "
    "zwarciem IEC 60909 jest większe niż 1,4. Sieć izolowana i skompensowana — poza zakresem "
    "normy (rozdz. 1): jej pojemności opisuje doziemienie sieci, nie macierz Y0 zwarć."
)


def wspolczynnik_zwarcia_doziemnego(z1: complex, z2: complex, z0: complex) -> float:
    """k = max(U_b, U_c)/U_f zwarcia jednofazowego metalicznego fazy a z impedancji składowych
    miejsca zwarcia (dowolna spójna jednostka — Ω albo pu jednej bazy); ten sam wzór co napięcia
    faz zdrowych doziemienia (``napiecia_faz_przy_doziemieniu``)."""
    _, u_b, u_c = napiecia_faz_przy_doziemieniu(1.0, z1, z2, z0)
    return max(u_b, u_c)


def pojemnosci_w_skladowej_zerowej(wspolczynnik_k: float) -> bool:
    """JEDEN predykat warunku pkt 5.2 f): pojemności linii w składowej zerowej, gdy k > 1,4
    (nierówność ostra — k równy 1,4 ich nie włącza)."""
    return wspolczynnik_k > PROG_WSPOLCZYNNIKA_ZWARCIA_DOZIEMNEGO


def napiecia_faz_z_admitancji_sieci(
    u_f_v: float, y_s: complex, z_f_ohm: complex = 0j
) -> tuple[float, float, float]:
    """(U0, U_b, U_c) [V] przy impedancjach podłużnych pominiętych: V_N = −E_a/(1 + Z_f·Y);
    U0 = U_f/|1 + Z_f·Y|, U_b = U_f·|a² − 1/(1 + Z_f·Y)|, U_c = U_f·|a − 1/(1 + Z_f·Y)|."""
    d = 1.0 / (1.0 + z_f_ohm * y_s)
    return u_f_v * abs(d), u_f_v * abs(_A * _A - d), u_f_v * abs(_A - d)


_TYTUL_PRADU: dict[str, str] = {
    "izolowany": "Prąd doziemienia — prąd pojemnościowy sieci",
    "kompensowany": "Prąd resztkowy sieci skompensowanej",
    "rezystor": "Prąd doziemienia sieci uziemionej przez rezystor",
    "bezposrednie": "Prąd zwarcia jednofazowego z ziemią IEC 60909 (wiersz zwarcia)",
}


def oblicz_doziemienie(dane: DaneDoziemienia) -> WynikDoziemienia:
    """Doziemienie sieci wg trybu punktu neutralnego (wzory w docstringu modułu)."""
    u_f_v = napiecie_fazowe_punktu_neutralnego_v(dane.napiecie_kv)
    tryb = dane.tryb
    z_f = dane.z_f_ohm if dane.z_f_ohm is not None else 0j
    slad: list[dict[str, Any]] = []
    zastrzezenia: list[str] = []
    brak: str | None = None
    z_skladowe = (
        (dane.z1_ohm, dane.z2_ohm, dane.z0_ohm)
        if dane.z1_ohm is not None and dane.z2_ohm is not None and dane.z0_ohm is not None
        else None
    )
    i_c: float | None = None
    i_l: float | None = None
    i_w: float | None = None
    rozstrojenie: float | None = None
    prad: float | None = None
    u0: float | None = None
    u_b: float | None = None
    u_c: float | None = None

    if tryb == "bezposrednie":
        # Uziemienie bezpośrednie: prąd zwarciowy przez Z0 sieci (rdzeń IEC 60909; pojemności
        # doziemne w Y0 pod warunkiem pkt 5.2 f), ``PODSTAWA_WARUNKU_POJEMNOSCI_ZEROWEJ_PL``)
        # — osobny prąd pojemnościowy nie jest wielkością tego trybu.
        prad = dane.ikss_iec_a
        wzor = r"I''_{k1} = \frac{3\,c\,U_f}{|Z_1 + Z_2 + Z_0 + 3 Z_f|}"
        podstawa = "IEC 60909-0:2016 — prąd zwarcia jednofazowego z ziemią (wiersz zwarcia)"
        if prad is None or z_skladowe is None:
            brak = (
                "Sieć uziemiona bezpośrednio: prąd i napięcia doziemienia wyznacza zwarcie "
                "jednofazowe IEC 60909 w punkcie zwarcia (impedancje składowych punktu)."
            )
        else:
            # Ślad nazywa model trybu: prąd jest wynikiem rdzenia IEC 60909 (współczynnik c
            # w rdzeniu), tu tylko zapis impedancji pętli punktu zwarcia, z której wynika.
            petla = z_skladowe[0] + z_skladowe[1] + z_skladowe[2] + 3.0 * z_f
            slad.append(
                _krok(
                    "doziemienie_prad_bezposrednie",
                    _TYTUL_PRADU[tryb],
                    wzor,
                    {
                        "z1_ohm": _z(z_skladowe[0]),
                        "z2_ohm": _z(z_skladowe[1]),
                        "z0_ohm": _z(z_skladowe[2]),
                        "z_f_ohm": _z(dane.z_f_ohm),
                        "ikss_iec_a": _r(prad),
                    },
                    f"|Z_1 + Z_2 + Z_0 + 3Z_f| = |{_zespolona_pl(petla)}| Ω; "
                    f"I″k1 = {_pl(prad, '.4f')} A (rdzeń IEC 60909)",
                    rf"\left|Z_1 + Z_2 + Z_0 + 3 Z_f\right| = \left|{_zespolona_tex(petla)}\right|"
                    rf"\ \Omega;\quad I''_{{k1}} = {_tex(prad, '.4f')}\ \mathrm{{A}}",
                    {"prad_a": _r(prad), "petla_ohm": _r(abs(petla))},
                )
            )
    else:
        if dane.b0_s == 0.0:
            zastrzezenia.append(ZASTRZEZENIE_ZEROWEJ_POJEMNOSCI_PL)
        if dane.droga_szeregowa:
            zastrzezenia.append(ZASTRZEZENIE_DROGI_SZEREGOWEJ_PL)
        if dane.b0_s is not None:
            i_c = prad_pojemnosciowy_doziemienia_a(dane.napiecie_kv, dane.b0_s)
        slad.append(
            _krok(
                "doziemienie_prad_pojemnosciowy",
                "Prąd pojemnościowy sieci galwanicznej",
                r"I_C = 3\,\omega C_0 U_f = \sqrt{3}\,U_n B_0",
                {"u_n_kv": dane.napiecie_kv, "b0_s": dane.b0_s, "brak_b0_pl": dane.brak_b0_pl},
                (
                    f"I_C = √3·{format_liczba(dane.napiecie_kv)} kV·{format_liczba(dane.b0_s)} S "
                    f"= {_pl(i_c, '.4f')} A"
                    if i_c is not None and dane.b0_s is not None
                    else f"B_0 nieoznaczalne: {dane.brak_b0_pl}"
                ),
                (
                    rf"I_C = \sqrt{{3}}\cdot {format_liczba(dane.napiecie_kv).replace(',', '{,}')}"
                    rf"\ \mathrm{{kV}}\cdot {format_liczba(dane.b0_s).replace(',', '{,}')}"
                    rf"\ \mathrm{{S}} = {_tex(i_c, '.4f')}\ \mathrm{{A}}"
                    if i_c is not None and dane.b0_s is not None
                    else None
                ),
                {"i_c_a": _r(i_c)},
            )
        )
        i_n = 0j
        if tryb != "izolowany":
            i_n = prad_punktow_neutralnych_a(u_f_v, dane.punkty)
            i_w, i_l = i_n.real, -i_n.imag
            slad.append(
                _krok(
                    "doziemienie_punkty_neutralne",
                    "Prąd obwodu punktów neutralnych przy przesunięciu punktu neutralnego o U_f",
                    r"I_N = \sum_p \frac{U_f}{Z_{N,p} + Z_{0,p}/3},\ I_w = \mathrm{Re}\,I_N,"
                    r"\ I_L = -\mathrm{Im}\,I_N",
                    {
                        "u_f_v": u_f_v,
                        "punkty": [
                            {
                                "nazwa_pl": p.nazwa_pl,
                                "z_n_ohm": _z(p.z_n_ohm),
                                "z0_ohm": _z(p.z0_tu_ohm),
                            }
                            for p in dane.punkty
                        ],
                    },
                    f"I_N = {_zespolona_pl(i_n)} A",
                    rf"I_N = {_zespolona_tex(i_n)}\ \mathrm{{A}}",
                    {"i_w_a": _r(i_w), "i_l_a": _r(i_l)},
                )
            )
        if tryb == "izolowany":
            wzor = r"I_C = 3\,\omega C_0 U_f = \sqrt{3}\,U_n B_0"
            podstawa = f"{PODSTAWA_ZAKRESU_PL}; prąd doziemny = prąd pojemnościowy sieci"
        elif tryb == "kompensowany":
            zastrzezenia.append(ZASTRZEZENIE_STRAT_PL)
            wzor = r"I_{res} = \sqrt{I_w^2 + (I_C - I_L)^2},\quad v = \frac{I_C - I_L}{I_C}"
            podstawa = (
                f"{PODSTAWA_ZAKRESU_PL}; kompensacja prądu pojemnościowego dławikiem gaszącym "
                "(ENEA Zeszyt 1 §16, Z.13)"
            )
        else:
            wzor = (
                r"I_F = \left|I_N + j I_C\right|,\ I_N = \sum_p \frac{U_f}{Z_{N,p} + Z_{0,p}/3}"
                r"\ \ (Z_N = R_N:\ I_F = \sqrt{I_R^2 + I_C^2})"
            )
            podstawa = (
                "Sieć uziemiona przez rezystor (ENEA Zeszyt 1 §16, Z.14/Z.15): prąd punktów "
                "neutralnych i prąd pojemnościowy sieci; prąd zwarciowy IEC 60909-0 "
                "(współczynnik c, impedancje podłużne) — wiersz zwarcia"
            )
        if i_c is None:
            brak = f"Prąd pojemnościowy nieoznaczalny: {dane.brak_b0_pl}"
        else:
            # Admitancja sieci widziana z miejsca doziemienia: Y = (I_N + j·I_C)/U_f.
            i_metal = i_n + complex(0.0, i_c)
            y_s = i_metal / u_f_v
            prad = abs(i_metal / (1.0 + z_f * y_s))
            if dane.dlawik_w_ruchu and i_c > 0.0 and i_l is not None:
                rozstrojenie = stopien_rozstrojenia(i_l, i_c)
            slad.append(
                _krok(
                    f"doziemienie_prad_{tryb}",
                    _TYTUL_PRADU[tryb],
                    wzor + (r";\ I_F = \frac{U_f Y}{1 + Z_f Y}" if dane.z_f_ohm else ""),
                    {
                        "i_c_a": _r(i_c),
                        "i_l_a": _r(i_l),
                        "i_w_a": _r(i_w),
                        "z_f_ohm": _z(dane.z_f_ohm),
                    },
                    f"|{_zespolona_pl(i_metal)}| A"
                    + (
                        f" przez Z_f → {_pl(prad, '.4f')} A"
                        if dane.z_f_ohm
                        else f" = {_pl(prad, '.4f')} A"
                    )
                    + (f"; v = {_pl(rozstrojenie, '.4f')}" if rozstrojenie is not None else ""),
                    rf"\left|{_zespolona_tex(i_metal)}\right|"
                    r"\ \mathrm{A}"
                    + (r"\ \xrightarrow{Z_f}\ " if dane.z_f_ohm else " = ")
                    + rf"{_tex(prad, '.4f')}\ \mathrm{{A}}"
                    + (
                        rf";\quad v = {_tex(rozstrojenie, '.4f')}"
                        if rozstrojenie is not None
                        else ""
                    ),
                    {"prad_a": _r(prad), "rozstrojenie": _r(rozstrojenie, 6)},
                )
            )
            if z_skladowe is None or tryb != "rezystor":
                zastrzezenia.append(ZASTRZEZENIE_PODLUZNYCH_PL)
                u0, u_b, u_c = napiecia_faz_z_admitancji_sieci(u_f_v, y_s, z_f)
                slad.append(
                    _krok(
                        "doziemienie_napiecia_faz",
                        "Napięcia przy doziemieniu (impedancje podłużne pominięte)",
                        r"U_0 = \frac{U_f}{|1 + Z_f Y|},\ U_b = U_f\left|a^2 - "
                        r"\frac{1}{1 + Z_f Y}\right|,\ U_c = U_f\left|a - \frac{1}{1 + Z_f Y}\right|",
                        {"u_f_v": u_f_v, "y_s": _z(y_s), "z_f_ohm": _z(dane.z_f_ohm)},
                        f"U0 = {_pl(u0, '.2f')} V; U_b = {_pl(u_b, '.2f')} V; U_c = {_pl(u_c, '.2f')} V",
                        _napiecia_latex(u0, u_b, u_c),
                        {"u0_v": _r(u0), "u_faza_b_v": _r(u_b), "u_faza_c_v": _r(u_c)},
                    )
                )
    if u0 is None and z_skladowe is not None and tryb in ("rezystor", "bezposrednie"):
        u0, u_b, u_c = napiecia_faz_przy_doziemieniu(u_f_v, *z_skladowe, z_f)
        slad.append(
            _krok(
                "doziemienie_napiecia_faz",
                "Napięcia przy doziemieniu z impedancji składowych punktu zwarcia",
                (
                    r"I_0 = \frac{U_f}{Z_1 + Z_2 + Z_0 + 3 Z_f},\ U_0 = |Z_0 I_0|,\ "
                    r"U_b = |a^2(U_f - Z_1 I_0) - a Z_2 I_0 - Z_0 I_0|"
                ),
                {
                    "u_f_v": u_f_v,
                    "z1_ohm": _z(z_skladowe[0]),
                    "z2_ohm": _z(z_skladowe[1]),
                    "z0_ohm": _z(z_skladowe[2]),
                    "z_f_ohm": _z(dane.z_f_ohm),
                },
                f"U0 = {_pl(u0, '.2f')} V; U_b = {_pl(u_b, '.2f')} V; U_c = {_pl(u_c, '.2f')} V",
                _napiecia_latex(u0, u_b, u_c),
                {"u0_v": _r(u0), "u_faza_b_v": _r(u_b), "u_faza_c_v": _r(u_c)},
            )
        )
    k = max(u_b, u_c) / u_f_v if u_b is not None and u_c is not None else None
    return WynikDoziemienia(
        tryb=tryb,
        charakter=CHARAKTER_TRYBU[tryb],
        prad_a=prad,
        i_c_a=i_c,
        i_l_a=i_l,
        i_w_a=i_w,
        rozstrojenie=rozstrojenie,
        u_f_v=u_f_v,
        u0_v=u0,
        u_faza_b_v=u_b,
        u_faza_c_v=u_c,
        wspolczynnik_k=k,
        wzor_latex=wzor,
        podstawa_pl=f"{podstawa}. {PODSTAWA_NAPIEC_PL}.",
        zastrzezenia_pl=tuple(zastrzezenia),
        brak_pl=brak,
        z_f_ohm=dane.z_f_ohm,
        slad=tuple(slad),
    )
