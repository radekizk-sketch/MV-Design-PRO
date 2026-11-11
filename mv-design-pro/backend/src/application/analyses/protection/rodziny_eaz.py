"""Rodziny zabezpieczeń ziemnozwarciowych — JEDEN rejestr kolumn, kryteriów i wymagań.

PO CO. Korekta właściciela 1 (2026-11-05): wspólny standard wizualny (typografia, wiersz,
szczegóły, stany), ale każda rodzina zabezpieczeń ma własny zestaw parametrów. Zestaw kolumn
rodziny wynika z deklaracji w tym rejestrze, nie z warunków w komponencie ekranu: ekran oceny,
karta nastaw i raport czytają ``RODZINY_EAZ`` (pole ``rodziny`` wyniku oceny) i renderują
kolumny w kolejności deklaracji. Wiersz oceny niesie wartości pod kluczami kolumn swojej rodziny
— klucz spoza deklaracji to błąd programu (``sprawdz_wartosci_wiersza``).

WYMAGANIA. Wymagany współczynnik czułości k_c i współczynnik bezpieczeństwa (odstrojenia) k_b
nastawy to wielkości RODZAJU zabezpieczenia, a nie dane sieci (rozstrojenie kompensacji v jest
daną sieci i nie występuje w tym rejestrze — korekta właściciela 2). Każda wartość ma podstawę
i stan źródła:

* k_c — IRiESD ENEA Operator, tekst ujednolicony wersji 2.3 obowiązujący od 19.10.2026,
  pkt II.4.5.4.1.4 ppkt 1–5 (s. 51), sprawdzony z treścią dokumentu (stan ZWERYFIKOWANE);
  przypadki, których punkt nie obejmuje (Go> poza siecią z rezystorem i siecią skompensowaną
  z AWSC, 32N), są założeniem inżynierskim (dana przyjęta ESTIMATED);
* k_b — IRiESD ENEA nie podaje współczynnika bezpieczeństwa nastawy zabezpieczeń
  ziemnozwarciowych: wartość robocza 1,2 jest założeniem inżynierskim (ESTIMATED);
* każde wymaganie projektant może zmienić w przypadku obliczeniowym (``wymagania`` oceny) —
  podstawą staje się wtedy założenie projektowe przypadku.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Literal

from network_model.catalog.wartosci_robocze import liczba_pl
from werdykt import PodstawaWymagania

RodzinaZiemnozwarciowa = Literal[
    "ZEROWOPRADOWE",
    "KIERUNKOWE_67N",
    "ADMITANCYJNE",
    "WATOMETRYCZNE",
    "ZEROWONAPIECIOWE",
]


@dataclass(frozen=True)
class KolumnaRodziny:
    """Kolumna tabeli rodziny: klucz wartości wiersza, nagłówek z jednostką, opis podpowiedzi."""

    klucz: str
    naglowek_pl: str
    opis_pl: str

    def to_dict(self) -> dict[str, str]:
        return {"klucz": self.klucz, "naglowek_pl": self.naglowek_pl, "opis_pl": self.opis_pl}


@dataclass(frozen=True)
class RodzinaEaz:
    id: RodzinaZiemnozwarciowa
    nazwa_pl: str
    kody: tuple[str, ...]
    kolumny: tuple[KolumnaRodziny, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "nazwa_pl": self.nazwa_pl,
            "kody": list(self.kody),
            "kolumny": [k.to_dict() for k in self.kolumny],
        }


_PROG_I0 = KolumnaRodziny("prog", "I₀> [A]", "nastawa progu prądu zerowego (strona pierwotna)")
_U0_PROG = KolumnaRodziny("u0_prog", "U₀> [%]", "próg rozruchu napięciowego w % U₀n")
_K_B = KolumnaRodziny(
    "k_b",
    "k_b",
    "współczynnik bezpieczeństwa nastawy: nastawa / wielkość przy doziemieniu poza polem",
)
_K_C = KolumnaRodziny(
    "k_c",
    "k_c",
    "współczynnik czułości przy doziemieniu metalicznym w polu: wielkość / nastawa",
)
_K_C_OPOR = KolumnaRodziny(
    "k_c_opor",
    "k_c (U₀ = 50 %)",
    "współczynnik czułości przy doziemieniu oporowym, przy którym U₀ = 50 % napięcia fazowego",
)
_T = KolumnaRodziny("t", "t [s]", "czas zadziałania w punkcie decydującym czułości")
_R_F_MAX = KolumnaRodziny(
    "r_f_max",
    "R_F,max [Ω]",
    "największa rezystancja przejścia, przy której funkcja wykrywa doziemienie w każdym "
    "punkcie pola",
)

RODZINY_EAZ: dict[RodzinaZiemnozwarciowa, RodzinaEaz] = {
    "ZEROWOPRADOWE": RodzinaEaz(
        "ZEROWOPRADOWE",
        "Zerowoprądowe bezkierunkowe (51N, 50N)",
        ("51N", "50N"),
        (
            _PROG_I0,
            KolumnaRodziny(
                "wl", "3I₀,wł [A]", "prąd własny pola przy doziemieniu poza polem (maksimum)"
            ),
            _K_B,
            KolumnaRodziny(
                "dz", "3I₀ dz. [A]", "prąd 3I₀ w polu przy doziemieniu w polu (minimum strefy)"
            ),
            _K_C,
            _K_C_OPOR,
            _T,
            _R_F_MAX,
        ),
    ),
    "KIERUNKOWE_67N": RodzinaEaz(
        "KIERUNKOWE_67N",
        "Zerowoprądowe kierunkowe (67N)",
        ("67N",),
        (
            _PROG_I0,
            _U0_PROG,
            KolumnaRodziny(
                "charakterystyka",
                "φ_ch ± sektor [°]",
                "kąt charakterystyczny względem −U₀, połowa szerokości sektora i tryb kryterium",
            ),
            KolumnaRodziny(
                "wl", "3I₀,wł [A]", "moduł prądu własnego pola przy doziemieniu poza polem"
            ),
            KolumnaRodziny(
                "rzut_poza",
                "rzut poza [A]",
                "rzut 3I₀ na oś charakterystyki przy doziemieniu poza polem (maksimum)",
            ),
            _K_B,
            KolumnaRodziny(
                "rzut_w",
                "rzut w polu [A]",
                "rzut 3I₀ na oś charakterystyki przy doziemieniu w polu (minimum strefy)",
            ),
            _K_C,
            _K_C_OPOR,
            _T,
            _R_F_MAX,
        ),
    ),
    "ADMITANCYJNE": RodzinaEaz(
        "ADMITANCYJNE",
        "Admitancyjne (Y₀>, G₀>, B₀>)",
        ("Yo>", "Go>", "Bo>"),
        (
            KolumnaRodziny(
                "prog", "nastawa [mS]", "próg admitancji, konduktancji albo susceptancji"
            ),
            _U0_PROG,
            KolumnaRodziny("wl", "poza polem [mS]", "wielkość przy doziemieniu poza polem"),
            _K_B,
            KolumnaRodziny("dz", "w polu [mS]", "wielkość przy doziemieniu w polu (minimum)"),
            _K_C,
            _T,
            _R_F_MAX,
        ),
    ),
    "WATOMETRYCZNE": RodzinaEaz(
        "WATOMETRYCZNE",
        "Watometryczne (32N)",
        ("32N",),
        (
            KolumnaRodziny("prog", "P₀> [kW]", "próg mocy czynnej składowej zerowej"),
            _U0_PROG,
            KolumnaRodziny("wl", "P₀ poza [kW]", "moc P₀ przy doziemieniu poza polem"),
            _K_B,
            KolumnaRodziny("dz", "P₀ w polu [kW]", "moc P₀ przy doziemieniu w polu (minimum)"),
            _K_C,
            _T,
            _R_F_MAX,
        ),
    ),
    "ZEROWONAPIECIOWE": RodzinaEaz(
        "ZEROWONAPIECIOWE",
        "Zerowonapięciowe i automatyka wymuszania (59N, ZAWSC)",
        ("59N", "ZAWSC"),
        (
            _U0_PROG,
            KolumnaRodziny("dz", "U₀ min [%]", "najmniejsze U₀ w miejscu pomiaru przy doziemieniu"),
            _T,
            _R_F_MAX,
        ),
    ),
}

#: Kod funkcji → rodzina (jedno źródło; kod spoza rejestru rodzin to błąd programu).
RODZINA_KODU: dict[str, RodzinaZiemnozwarciowa] = {
    kod: rodzina.id for rodzina in RODZINY_EAZ.values() for kod in rodzina.kody
}


def sprawdz_wartosci_wiersza(rodzina: RodzinaZiemnozwarciowa, klucze: set[str]) -> None:
    """Wiersz niesie wyłącznie wartości kolumn swojej rodziny."""
    dozwolone = {k.klucz for k in RODZINY_EAZ[rodzina].kolumny}
    nadmiar = klucze - dozwolone
    assert not nadmiar, f"Wartości spoza kolumn rodziny {rodzina}: {sorted(nadmiar)}"


# ---------------------------------------------------------------------------
# Źródła wymagań: JEDNA tabela wartości, stanów i odwołań (wymaganie właściciela 3)
# ---------------------------------------------------------------------------

_IRIESD_DOKUMENT = "IRiESD ENEA Operator — Instrukcja Ruchu i Eksploatacji Sieci Dystrybucyjnej"
_IRIESD_WYDANIE = "wersja 2.3, tekst ujednolicony obowiązujący od 19.10.2026"
SposobPracyPunktuNeutralnego = Literal[
    "IZOLOWANY", "KOMPENSOWANY", "KOMPENSOWANY_AWSC", "UZIEMIONY_REZYSTOR"
]

#: Stan źródła wymaganej wartości — rozróżnienie, którego wpięcie w ekran ani raport nie
#: zmienia: wartość sprawdzona z treścią dokumentu ENEA (punkt i strona), założenie inżynierskie
#: (dana przyjęta ESTIMATED), odwołanie wskazane, ale niesprawdzone z treścią dokumentu, oraz
#: wartość podana przez projektanta w przypadku obliczeniowym (nie udaje ENEA).
StanWymagania = Literal[
    "ENEA_ZWERYFIKOWANE", "ZALOZENIE_INZYNIERSKIE", "NIEZWERYFIKOWANE", "WARTOSC_PROJEKTANTA"
]
ETYKIETY_STANU_WYMAGANIA_PL: dict[str, str] = {
    "ENEA_ZWERYFIKOWANE": "zweryfikowano ze źródłem ENEA",
    "ZALOZENIE_INZYNIERSKIE": "założenie inżynierskie (wartość robocza)",
    "NIEZWERYFIKOWANE": "odwołanie niezweryfikowane z treścią dokumentu",
    "WARTOSC_PROJEKTANTA": "wartość projektanta (przypadek obliczeniowy)",
}


@dataclass(frozen=True)
class ZrodloWymagania:
    """Wiersz tabeli źródeł: wymagana wartość, jej stan i odwołanie (dokument, punkt, strona)."""

    klucz: str
    symbol: str
    opis_pl: str
    wartosc: float | None
    jednostka: str
    stan: StanWymagania
    odwolanie_pl: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "klucz": self.klucz,
            "symbol": self.symbol,
            "opis_pl": self.opis_pl,
            "wartosc": self.wartosc,
            "jednostka": self.jednostka,
            "stan": self.stan,
            "stan_pl": ETYKIETY_STANU_WYMAGANIA_PL[self.stan],
            "odwolanie_pl": self.odwolanie_pl,
        }


def _pkt(punkt: str) -> str:
    return f"{_IRIESD_DOKUMENT}, {_IRIESD_WYDANIE}, {punkt}"


#: Odstęp czasowy stopniowania Δt — wartość z założeń koordynacji projektu (``CoordinationConfig``:
#: czas własny wyłącznika + wybieg przekaźnika + zapas); odwołanie do IRiESD pkt II.4.5.1.8 jest
#: wskazane, ale niesprawdzone z treścią dokumentu.
DELTA_T_ODWOLANIE_PL = _pkt("pkt II.4.5.1.8 (stopniowanie czasowe) — niesprawdzone z treścią")

#: JEDNA tabela źródeł wymagań oceny zabezpieczeń ziemnozwarciowych. Funkcje ``wymaganie_*``
#: i ``podstawa_u0_roboczego`` czytają wartości stąd; tabela jedzie w wyniku oceny
#: (``zrodla_wymagan``) do ekranu i raportu bez przekształceń (przypięte testem).
ZRODLA_WYMAGAN_EAZ: tuple[ZrodloWymagania, ...] = (
    ZrodloWymagania(
        "k_c.zerowopradowe",
        "k_c",
        "zabezpieczenia zerowoprądowe podczas zwarć bezoporowych",
        1.5,
        "1",
        "ENEA_ZWERYFIKOWANE",
        _pkt("pkt II.4.5.4.1.4 ppkt 1 (s. 51)"),
    ),
    ZrodloWymagania(
        "k_c_opor.zerowopradowe",
        "k_c,opor",
        "zabezpieczenia zerowoprądowe podczas zwarć oporowych, czyli jeśli składowa zerowa "
        "napięcia wynosi 50 % napięcia fazowego",
        1.2,
        "1",
        "ENEA_ZWERYFIKOWANE",
        _pkt("pkt II.4.5.4.1.4 ppkt 2 (s. 51)"),
    ),
    ZrodloWymagania(
        "k_c.admitancyjne_rezystor",
        "k_c",
        "zabezpieczenia admitancyjne i konduktancyjne w sieciach o punkcie neutralnym "
        "uziemionym przez rezystor",
        2.0,
        "1",
        "ENEA_ZWERYFIKOWANE",
        _pkt("pkt II.4.5.4.1.4 ppkt 3 (s. 51)"),
    ),
    ZrodloWymagania(
        "k_c.konduktancyjne_awsc",
        "k_c",
        "zabezpieczenia konduktancyjne w sieciach skompensowanych z AWSCz",
        1.5,
        "1",
        "ENEA_ZWERYFIKOWANE",
        _pkt("pkt II.4.5.4.1.4 ppkt 4 (s. 51)"),
    ),
    ZrodloWymagania(
        "k_c.admitancyjne_pozostale",
        "k_c",
        "zabezpieczenia admitancyjne i susceptancyjne w pozostałych przypadkach",
        1.2,
        "1",
        "ENEA_ZWERYFIKOWANE",
        _pkt("pkt II.4.5.4.1.4 ppkt 5 (s. 51)"),
    ),
    ZrodloWymagania(
        "k_c.watometryczne",
        "k_c",
        "IRiESD ENEA II.4.5.4.1.4 nie wymienia zabezpieczeń watometrycznych; przyjęto 1,5 "
        "— wartość punktu 4 dla kryterium składowej czynnej (konduktancyjnego)",
        1.5,
        "1",
        "ZALOZENIE_INZYNIERSKIE",
        "założenie inżynierskie oceny (analogia do pkt II.4.5.4.1.4 ppkt 4)",
    ),
    ZrodloWymagania(
        "k_c.konduktancyjne_pozostale",
        "k_c",
        "IRiESD ENEA II.4.5.4.1.4 nie podaje wartości dla zabezpieczenia konduktancyjnego "
        "w tym sposobie pracy punktu neutralnego; przyjęto 1,5 (wartość punktu 4)",
        1.5,
        "1",
        "ZALOZENIE_INZYNIERSKIE",
        "założenie inżynierskie oceny (analogia do pkt II.4.5.4.1.4 ppkt 4)",
    ),
    ZrodloWymagania(
        "k_b",
        "k_b",
        "IRiESD ENEA nie podaje współczynnika bezpieczeństwa nastawy zabezpieczeń "
        "ziemnozwarciowych; przyjęto 1,2 — zapas na uchyb przekładników toru 3I₀ i rozrzut "
        "pojemności doziemnej pola. Zmień w przypadku obliczeniowym, gdy metodyka OSD stanowi "
        "inaczej.",
        1.2,
        "1",
        "ZALOZENIE_INZYNIERSKIE",
        "założenie inżynierskie oceny (IRiESD ENEA nie podaje k_b)",
    ),
    ZrodloWymagania(
        "u0_prog.rezystor",
        "U₀>",
        "zalecany zakres nastawy U₀> 5–10 % w sieci z punktem neutralnym uziemionym przez "
        "rezystor; wartość robocza bez nastawy — górna granica",
        10.0,
        "%",
        "ENEA_ZWERYFIKOWANE",
        _pkt("pkt II.4.5.4.1.5 ppkt 1 (s. 51)"),
    ),
    ZrodloWymagania(
        "u0_prog.izolowany",
        "U₀>",
        "zalecany zakres nastawy U₀> 5–15 % w sieci z izolowanym punktem neutralnym; wartość "
        "robocza bez nastawy — górna granica",
        15.0,
        "%",
        "ENEA_ZWERYFIKOWANE",
        _pkt("pkt II.4.5.4.1.5 ppkt 2 (s. 51)"),
    ),
    ZrodloWymagania(
        "u0_prog.kompensowany",
        "U₀>",
        "zalecany zakres nastawy U₀> 10–20 % w sieci skompensowanej; wartość robocza bez "
        "nastawy — górna granica",
        20.0,
        "%",
        "ENEA_ZWERYFIKOWANE",
        _pkt("pkt II.4.5.4.1.5 ppkt 3 (s. 51)"),
    ),
    ZrodloWymagania(
        "delta_t",
        "Δt",
        "odstęp czasowy stopniowania: czas własny wyłącznika + wybieg przekaźnika + zapas "
        "(założenia koordynacji projektu)",
        None,
        "s",
        "NIEZWERYFIKOWANE",
        DELTA_T_ODWOLANIE_PL,
    ),
    ZrodloWymagania(
        "u_tp",
        "U_Tp(t_F)",
        "dopuszczalne napięcie dotykowe w funkcji czasu trwania zwarcia i warunek wystarczający "
        "U_E ≤ U_Tp",
        None,
        "V",
        "NIEZWERYFIKOWANE",
        "PN-EN 50522:2011, rysunek 4 i pkt 5.4.3 — treści normy brak w repozytorium, odwołanie "
        "niesprawdzone",
    ),
)
_ZRODLO: dict[str, ZrodloWymagania] = {z.klucz: z for z in ZRODLA_WYMAGAN_EAZ}


def zrodlo_wymagania(klucz: str) -> ZrodloWymagania:
    return _ZRODLO[klucz]


def zrodla_wymagan(delta_t_s: float) -> list[dict[str, Any]]:
    """Tabela źródeł do wyniku oceny; Δt z założeń koordynacji biegu (wartość liczbowa)."""
    return [
        {**z.to_dict(), "wartosc": delta_t_s} if z.klucz == "delta_t" else z.to_dict()
        for z in ZRODLA_WYMAGAN_EAZ
    ]


# ---------------------------------------------------------------------------
# Wymagane współczynniki k_b i k_c (podstawa i stan źródła)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class WymaganieWspolczynnika:
    """Wymagana wartość współczynnika z podstawą i stanem (``ZrodloWymagania.stan``);
    ``przyjete`` — wartość robocza (ESTIMATED, wpis w ``dane_przyjete``)."""

    symbol: str
    wartosc: float
    podstawa: PodstawaWymagania
    przyjete: bool
    uzasadnienie_pl: str
    stan: StanWymagania

    def to_dict(self) -> dict[str, Any]:
        return {
            "symbol": self.symbol,
            "wartosc": self.wartosc,
            "przyjete": self.przyjete,
            "zrodlo_pl": (
                f"{self.podstawa.dokument}"
                + (f", {self.podstawa.wydanie}" if self.podstawa.wydanie else "")
                + (
                    f", {self.podstawa.jednostka_redakcyjna}"
                    if self.podstawa.jednostka_redakcyjna
                    else ""
                )
            ),
            "stan_zrodla": self.podstawa.status,
            "stan": self.stan,
            "stan_pl": ETYKIETY_STANU_WYMAGANIA_PL[self.stan],
            "uzasadnienie_pl": self.uzasadnienie_pl,
        }


def _z_tabeli(klucz: str) -> WymaganieWspolczynnika:
    """Wymaganie z tabeli źródeł — wartość, stan i odwołanie bez przekształceń."""
    z = _ZRODLO[klucz]
    assert z.wartosc is not None, klucz
    if z.stan == "ENEA_ZWERYFIKOWANE":
        punkt = z.odwolanie_pl.removeprefix(f"{_IRIESD_DOKUMENT}, {_IRIESD_WYDANIE}, ")
        return WymaganieWspolczynnika(
            symbol=z.symbol,
            wartosc=z.wartosc,
            podstawa=PodstawaWymagania(
                rodzaj="OSD",
                dokument=_IRIESD_DOKUMENT,
                wydanie=_IRIESD_WYDANIE,
                jednostka_redakcyjna=punkt,
                status="ZWERYFIKOWANE",
                uwagi_pl=z.opis_pl,
            ),
            przyjete=False,
            uzasadnienie_pl=f"zalecana wartość współczynnika czułości: {z.opis_pl}",
            stan=z.stan,
        )
    assert z.stan == "ZALOZENIE_INZYNIERSKIE", klucz
    return WymaganieWspolczynnika(
        symbol=z.symbol,
        wartosc=z.wartosc,
        podstawa=PodstawaWymagania(
            rodzaj="ZALOZENIE_PROJEKTOWE",
            dokument="Założenie inżynierskie oceny zabezpieczeń ziemnozwarciowych (wartość robocza)",
            wydanie="wartość robocza oceny zabezpieczeń ziemnozwarciowych",
            jednostka_redakcyjna=f"wymagane {z.symbol} = {liczba_pl(z.wartosc)}",
            status="WSKAZANE",
            uwagi_pl=z.opis_pl,
        ),
        przyjete=True,
        uzasadnienie_pl=z.opis_pl,
        stan=z.stan,
    )


def _z_przypadku(symbol: str, wartosc: float) -> WymaganieWspolczynnika:
    """Wartość projektanta z przypadku obliczeniowego — oznaczona, nie udaje ENEA."""
    return WymaganieWspolczynnika(
        symbol=symbol,
        wartosc=wartosc,
        podstawa=PodstawaWymagania(
            rodzaj="ZALOZENIE_PROJEKTOWE",
            dokument="Wymaganie podane przez projektanta w przypadku obliczeniowym",
            wydanie="przypadek obliczeniowy biegu oceny",
            jednostka_redakcyjna=f"wymagane {symbol} = {liczba_pl(wartosc)}",
            status="WSKAZANE",
        ),
        przyjete=False,
        uzasadnienie_pl="wartość podana przez projektanta w przypadku obliczeniowym",
        stan="WARTOSC_PROJEKTANTA",
    )


#: Klucze wymagań, które projektant może nadpisać w przypadku obliczeniowym
#: (``StudyCaseConfig.wymagania_eaz``) — lista ZAMKNIĘTA, klucz spoza niej to błąd danych.
KLUCZE_WYMAGAN_PRZYPADKU: tuple[str, ...] = ("k_b", "k_c", "k_c_opor")

K_B_ROBOCZE = _ZRODLO["k_b"].wartosc


def wymaganie_k_b(
    rodzina: RodzinaZiemnozwarciowa, wymagania: Mapping[str, float] | None = None
) -> WymaganieWspolczynnika | None:
    """Wymagany k_b rodziny (``None`` — rodzina zerowonapięciowa: działa w całej sieci)."""
    if rodzina == "ZEROWONAPIECIOWE":
        return None
    if wymagania and "k_b" in wymagania:
        return _z_przypadku("k_b", float(wymagania["k_b"]))
    return _z_tabeli("k_b")


def wymaganie_k_c(
    kod: str,
    sposob: SposobPracyPunktuNeutralnego,
    wymagania: Mapping[str, float] | None = None,
) -> WymaganieWspolczynnika | None:
    """Wymagany k_c przy doziemieniu metalicznym w polu (``None`` — funkcja napięciowa)."""
    rodzina = RODZINA_KODU[kod]
    if rodzina == "ZEROWONAPIECIOWE":
        return None
    if wymagania and "k_c" in wymagania:
        return _z_przypadku("k_c", float(wymagania["k_c"]))
    if rodzina in ("ZEROWOPRADOWE", "KIERUNKOWE_67N"):
        return _z_tabeli("k_c.zerowopradowe")
    if rodzina == "WATOMETRYCZNE":
        return _z_tabeli("k_c.watometryczne")
    if sposob == "UZIEMIONY_REZYSTOR" and kod in ("Yo>", "Go>"):
        return _z_tabeli("k_c.admitancyjne_rezystor")
    if sposob == "KOMPENSOWANY_AWSC" and kod == "Go>":
        return _z_tabeli("k_c.konduktancyjne_awsc")
    if kod in ("Yo>", "Bo>"):
        return _z_tabeli("k_c.admitancyjne_pozostale")
    return _z_tabeli("k_c.konduktancyjne_pozostale")


def wymaganie_k_c_opor(
    kod: str, wymagania: Mapping[str, float] | None = None
) -> WymaganieWspolczynnika | None:
    """Wymagany k_c przy doziemieniu oporowym (U₀ = 50 % napięcia fazowego) — wyłącznie
    zabezpieczenia zerowoprądowe (IRiESD II.4.5.4.1.4 ppkt 2)."""
    if RODZINA_KODU[kod] not in ("ZEROWOPRADOWE", "KIERUNKOWE_67N"):
        return None
    if wymagania and "k_c_opor" in wymagania:
        return _z_przypadku("k_c,opor", float(wymagania["k_c_opor"]))
    return _z_tabeli("k_c_opor.zerowopradowe")


#: Zalecany zakres nastawy U₀> (IRiESD ENEA II.4.5.4.1.5, s. 51) — wartość robocza rozruchu
#: napięciowego 67N bez nastawy to GÓRNA granica zakresu (zachowawczo dla czułości); górna
#: granica i punkt — z tabeli źródeł.
ZAKRES_U0_IRIESD: dict[SposobPracyPunktuNeutralnego, tuple[float, str]] = {
    "UZIEMIONY_REZYSTOR": (5.0, "u0_prog.rezystor"),
    "IZOLOWANY": (5.0, "u0_prog.izolowany"),
    "KOMPENSOWANY": (10.0, "u0_prog.kompensowany"),
    "KOMPENSOWANY_AWSC": (10.0, "u0_prog.kompensowany"),
}


def podstawa_u0_roboczego(sposob: SposobPracyPunktuNeutralnego) -> tuple[float, str]:
    """Wartość robocza U₀> i zdanie źródła (dana przyjęta ESTIMATED)."""
    od, klucz = ZAKRES_U0_IRIESD[sposob]
    z = _ZRODLO[klucz]
    assert z.wartosc is not None
    do = z.wartosc
    return do, (
        f"Brak nastawy U₀> — przyjęto {liczba_pl(do)} % U₀n, górną granicę zalecanego zakresu "
        f"{liczba_pl(od)}–{liczba_pl(do)} % ({z.odwolanie_pl}). Uzupełnij nastawę w karcie "
        "nastaw."
    )
