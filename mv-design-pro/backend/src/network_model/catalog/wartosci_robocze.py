"""Rejestr WARTOŚCI ROBOCZYCH parametrów urządzeń — jedno źródło propozycji (zasada nr 4).

PO CO (dyrektywa właściciela 2026-10-21, kontrakt werdyktu §3c, V12K-351). Brak parametru
urządzenia w karcie katalogowej nie blokuje obliczeń: system PROPONUJE wartość roboczą z jawnym
źródłem, obliczenie biegnie, a projektant może wartość zmienić na elemencie modelu i przeliczyć.
Wartość robocza nigdy nie udaje danej producenta: katalog dalej niesie wyłącznie dane ze
źródłem (pole pozycji zostaje ``None``), a propozycja żyje TUTAJ, poza pozycją katalogu.

DWIE RZECZY W JEDNYM MIEJSCU:
  1. PROPOZYCJA — dla pary (rodzina urządzenia, parametr) wartość z jednostką, rodzaj źródła
     (``PROFIL_URZADZENIA`` / ``NORMA`` / ``ZALOZENIE_INZYNIERSKIE``), odniesienie, uzasadnienie
     i zdanie o wpływie na wiarygodność oceny;
  2. ROZSTRZYGNIĘCIE PIERWSZEŃSTWA — wartość projektanta na elemencie modelu > dana karty
     katalogowej > propozycja. Zwraca wartość ORAZ pochodzenie; żadna analiza nie wylicza
     pochodzenia po swojemu (predykaty parami — reguła KLASA, NIE INSTANCJA).

Moduł to DANE, nie fizyka: jedyna relacja liczbowa to relacja normowa I_p = 2,5·I_k
(IEC 62271-1:2017 p. 5.7) — przepisanie wartości znamionowej z normy, nie obliczenie skutków
zwarcia. Nie importuje warstw wyższych (model sieci, analizy, werdykt).

RODZINA: aparat SN (``APARAT_SN``) — pierwsza rodzina mechanizmu.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Literal, Protocol

RodzajZrodla = Literal["PROFIL_URZADZENIA", "NORMA", "ZALOZENIE_INZYNIERSKIE"]
PochodzenieWartosci = Literal["KATALOG", "PROJEKTANT", "PROPOZYCJA"]

#: Pochodzenie danej KARTY katalogowej (odczyt metadanych pozycji, nie ocena): pozycja z
#: nazwanym producentem niesie odczyt z karty producenta, pozycja bez producenta — wartość
#: referencyjną szeregu normy.
POCHODZENIE_PRODUCENT = "producent"
POCHODZENIE_REFERENCYJNY = "referencyjny"

#: Data ustalenia wartości rejestru (badanie źródeł 2026-10-21) — wydanie rejestru w podstawie.
WYDANIE_REJESTRU = "2026-10-21"
DOKUMENT_REJESTRU = "Rejestr wartości roboczych MV-DESIGN-PRO (aparat SN)"

PARAMETR_CZAS_WLASNY = "break_time_s"
PARAMETR_I_TH = "i_th_ka"
PARAMETR_T_TH = "i_th_duration_s"
PARAMETR_I_DYN = "i_dyn_ka"

#: Parametry aparatu SN objęte mechanizmem — kolejność stała (determinizm odpowiedzi).
PARAMETRY_APARATU_SN: tuple[str, ...] = (
    PARAMETR_CZAS_WLASNY,
    PARAMETR_I_TH,
    PARAMETR_T_TH,
    PARAMETR_I_DYN,
)

#: Rodzaje aparatu SN (``device_kind``), które przerywają prąd zwarciowy własną komorą
#: gaszeniową — dla nich czas własny wyłączania ISTNIEJE jako parametr.
RODZAJ_WYLACZNIK = "WYLACZNIK"
RODZAJ_REKLOZER = "REKLOZER"

#: Profil typowy czasu własnego wyłączania wyłącznika próżniowego SN [s].
CZAS_WLASNY_PROFIL_S = 0.060
#: Znamionowy czas trwania zwarcia — wartość zalecana normy [s].
CZAS_ZWARCIA_ZALECANY_S = 1.0
#: Stosunek znamionowego prądu szczytowego do krótkotrwałego dla 50 Hz.
WSPOLCZYNNIK_IP_DO_IK_50HZ = 2.5

_ODNIESIENIE_PROFILU_CZASU = (
    "profil typowy wyłącznika próżniowego SN: praktyka kart producentów 45–75 ms "
    "(np. ABB VD4 12 kV, karta 1VCP000267: łączny czas wyłączania 30–65 ms); IEC 62271-100 "
    "definiuje czas wyłączania, ale nie przypisuje mu wartości — deklaruje go producent"
)
_ODNIESIENIE_T_TH = "IEC 62271-1:2017 p. 5.8 (wartość zalecana)"
_ODNIESIENIE_I_DYN = "IEC 62271-1:2017 p. 5.7"
_ODNIESIENIE_I_TH_Z_ICU = (
    "relacja typowa dla wyłączników wg IEC 62271-100 — punkt niepotwierdzony w tekście normy"
)


@dataclass(frozen=True)
class OpisParametru:
    """Opis parametru: nazwa, symbol, jednostka i dopuszczalny zakres wartości projektanta."""

    parametr: str
    nazwa_pl: str
    symbol: str
    jednostka: str
    dopuszczalne_od: float
    dopuszczalne_do: float


#: Opisy parametrów aparatu SN. Zakres jest bramą wartości projektanta (operacja domenowa):
#: wartość spoza zakresu jest odmową, nie korektą.
OPISY_PARAMETROW_APARATU_SN: Mapping[str, OpisParametru] = {
    PARAMETR_CZAS_WLASNY: OpisParametru(
        parametr=PARAMETR_CZAS_WLASNY,
        nazwa_pl="czas własny wyłączania wyłącznika",
        symbol="t_b",
        jednostka="s",
        dopuszczalne_od=0.005,
        dopuszczalne_do=0.3,
    ),
    PARAMETR_I_TH: OpisParametru(
        parametr=PARAMETR_I_TH,
        nazwa_pl="prąd krótkotrwały wytrzymywany",
        symbol="I_k",
        jednostka="kA",
        dopuszczalne_od=0.1,
        dopuszczalne_do=100.0,
    ),
    PARAMETR_T_TH: OpisParametru(
        parametr=PARAMETR_T_TH,
        nazwa_pl="znamionowy czas trwania zwarcia",
        symbol="t_k",
        jednostka="s",
        dopuszczalne_od=0.1,
        dopuszczalne_do=5.0,
    ),
    PARAMETR_I_DYN: OpisParametru(
        parametr=PARAMETR_I_DYN,
        nazwa_pl="prąd szczytowy wytrzymywany",
        symbol="I_p",
        jednostka="kA",
        dopuszczalne_od=0.1,
        dopuszczalne_do=250.0,
    ),
}


class KartaAparatuSN(Protocol):
    """Pola pozycji katalogu APARAT_SN, z których korzysta rejestr (``MVApparatusType``)."""

    @property
    def device_kind(self) -> str: ...

    @property
    def manufacturer(self) -> str | None: ...

    @property
    def breaking_capacity_ka(self) -> float | None: ...

    @property
    def i_th_ka(self) -> float | None: ...

    @property
    def i_th_duration_s(self) -> float | None: ...

    @property
    def i_dyn_ka(self) -> float | None: ...

    @property
    def break_time_s(self) -> float | None: ...


def pochodzenie_danej_karty(manufacturer: str | None) -> str:
    """Pochodzenie danej obecnej w karcie: producent albo wartość referencyjna normy."""
    return POCHODZENIE_PRODUCENT if manufacturer else POCHODZENIE_REFERENCYJNY


def liczba_pl(wartosc: float) -> str:
    """Liczba z przecinkiem dziesiętnym (polski zapis w tekstach rejestru), bez zer zbędnych."""
    return f"{wartosc:.6g}".replace(".", ",")


@dataclass(frozen=True)
class PropozycjaWartosci:
    """Propozycja wartości roboczej: liczba, jednostka, źródło, uzasadnienie i wpływ."""

    parametr: str
    wartosc: float
    jednostka: str
    rodzaj_zrodla: RodzajZrodla
    odniesienie: str
    uzasadnienie_pl: str
    wplyw_pl: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "parametr": self.parametr,
            "nazwa_pl": OPISY_PARAMETROW_APARATU_SN[self.parametr].nazwa_pl,
            "wartosc": self.wartosc,
            "jednostka": self.jednostka,
            "rodzaj_zrodla": self.rodzaj_zrodla,
            "odniesienie": self.odniesienie,
            "uzasadnienie_pl": self.uzasadnienie_pl,
            "wplyw_pl": self.wplyw_pl,
        }


@dataclass(frozen=True)
class WartoscProjektanta:
    """Wartość nadana przez projektanta na elemencie modelu (nośnik: ``overrides`` gałęzi)."""

    parametr: str
    wartosc: float
    powod_pl: str | None = None


_RODZAJ_ZRODLA_PL: Mapping[RodzajZrodla, str] = {
    "PROFIL_URZADZENIA": "profil typowy urządzenia",
    "NORMA": "norma",
    "ZALOZENIE_INZYNIERSKIE": "założenie inżynierskie",
}

_WPLYW_PROJEKTANTA = (
    "wartość nadana przez projektanta bez dokumentu źródłowego — ocena jest wynikiem "
    "obliczeniowym na danej przyjętej, nie potwierdzonym dowodem zgodności"
)


@dataclass(frozen=True)
class WartoscRozstrzygnieta:
    """Wynik rozstrzygnięcia pierwszeństwa: wartość + pochodzenie (+ propozycja / powód).

    ``wartosc is None`` — parametru nie ma ani w modelu, ani w karcie, a rejestr nie zna dla
    niego uzasadnionej propozycji (``powod_braku_pl`` mówi dlaczego, np. parametr nie dotyczy
    rodzaju aparatu).
    """

    parametr: str
    wartosc: float | None
    jednostka: str
    pochodzenie: PochodzenieWartosci | None
    pochodzenie_karty: str | None = None
    propozycja: PropozycjaWartosci | None = None
    powod_projektanta_pl: str | None = None
    powod_braku_pl: str | None = None

    @property
    def robocza(self) -> bool:
        """Wartość robocza = dana przyjęta bez dokumentu (propozycja albo wartość projektanta)."""
        return self.pochodzenie in ("PROJEKTANT", "PROPOZYCJA")

    @property
    def nazwa_pl(self) -> str:
        return OPISY_PARAMETROW_APARATU_SN[self.parametr].nazwa_pl

    def opis_zrodla_pl(self) -> str:
        """Źródło + odniesienie + wpływ jednym zdaniem (``DanaPrzyjeta.powod_pl``, raport)."""
        if self.pochodzenie == "PROPOZYCJA" and self.propozycja is not None:
            p = self.propozycja
            return (
                f"wartość robocza ({_RODZAJ_ZRODLA_PL[p.rodzaj_zrodla]}): {p.odniesienie}. "
                f"{p.uzasadnienie_pl}. Wpływ: {p.wplyw_pl}."
            )
        if self.pochodzenie == "PROJEKTANT":
            powod = (
                f" (uzasadnienie: {self.powod_projektanta_pl})" if self.powod_projektanta_pl else ""
            )
            return f"wartość robocza nadana przez projektanta na elemencie modelu{powod}. " + (
                f"Wpływ: {_WPLYW_PROJEKTANTA}."
            )
        if self.pochodzenie == "KATALOG":
            return f"dana karty katalogowej ({self.pochodzenie_karty})"
        return self.powod_braku_pl or "parametr nieustalony"

    def to_dict(self) -> dict[str, Any]:
        return {
            "parametr": self.parametr,
            "nazwa_pl": self.nazwa_pl,
            "wartosc": self.wartosc,
            "jednostka": self.jednostka,
            "pochodzenie": self.pochodzenie,
            "pochodzenie_karty": self.pochodzenie_karty,
            "wartosc_robocza": self.robocza,
            "propozycja": self.propozycja.to_dict() if self.propozycja is not None else None,
            "powod_projektanta_pl": self.powod_projektanta_pl,
            "powod_braku_pl": self.powod_braku_pl,
            "opis_zrodla_pl": self.opis_zrodla_pl(),
        }


# ---------------------------------------------------------------------------
# Propozycje (jedno źródło)
# ---------------------------------------------------------------------------


def _propozycja_czasu_wlasnego(
    karta: KartaAparatuSN,
) -> tuple[PropozycjaWartosci | None, str | None]:
    rodzaj = karta.device_kind.strip().upper()
    if rodzaj == RODZAJ_WYLACZNIK:
        return (
            PropozycjaWartosci(
                parametr=PARAMETR_CZAS_WLASNY,
                wartosc=CZAS_WLASNY_PROFIL_S,
                jednostka="s",
                rodzaj_zrodla="PROFIL_URZADZENIA",
                odniesienie=_ODNIESIENIE_PROFILU_CZASU,
                uzasadnienie_pl=(
                    "Karta katalogowa wyłącznika nie podaje czasu własnego — przyjęto profil "
                    f"typowy wyłącznika próżniowego SN {liczba_pl(CZAS_WLASNY_PROFIL_S)} s"
                ),
                wplyw_pl=(
                    "czas wyłączenia zwarcia zawiera wartość typową zamiast danej producenta; "
                    "dłuższy rzeczywisty czas własny obniża limit cieplny aparatu"
                ),
            ),
            None,
        )
    if rodzaj == RODZAJ_REKLOZER:
        return (
            PropozycjaWartosci(
                parametr=PARAMETR_CZAS_WLASNY,
                wartosc=CZAS_WLASNY_PROFIL_S,
                jednostka="s",
                rodzaj_zrodla="ZALOZENIE_INZYNIERSKIE",
                odniesienie=(
                    "reklozer to wyłącznik próżniowy z automatyką samoczynnego ponownego "
                    "załączania (IEC 62271-111) — przyjęto profil typowy wyłącznika próżniowego SN"
                ),
                uzasadnienie_pl=(
                    "Karta katalogowa reklozera nie podaje czasu własnego — przyjęto czas "
                    f"własny wyłącznika próżniowego SN {liczba_pl(CZAS_WLASNY_PROFIL_S)} s"
                ),
                wplyw_pl=(
                    "czas wyłączenia zwarcia zawiera założenie zamiast danej producenta; "
                    "dłuższy rzeczywisty czas własny obniża limit cieplny aparatu"
                ),
            ),
            None,
        )
    return None, (
        "czas własny wyłączania nie dotyczy tego rodzaju aparatu — aparat nie przerywa prądu "
        "zwarciowego własną komorą gaszeniową (odłącznik, rozłącznik i uziemnik nie wyłączają "
        "zwarcia; w rozłączniku bezpiecznikowym zwarcie przerywa wkładka wg swojej "
        "charakterystyki)"
    )


def _propozycja_i_th(karta: KartaAparatuSN) -> tuple[PropozycjaWartosci | None, str | None]:
    icu = karta.breaking_capacity_ka
    if karta.device_kind.strip().upper() == RODZAJ_WYLACZNIK and icu is not None and icu > 0:
        return (
            PropozycjaWartosci(
                parametr=PARAMETR_I_TH,
                wartosc=float(icu),
                jednostka="kA",
                rodzaj_zrodla="ZALOZENIE_INZYNIERSKIE",
                odniesienie=_ODNIESIENIE_I_TH_Z_ICU,
                uzasadnienie_pl=(
                    "Przyjęto prąd krótkotrwały wytrzymywany równy znamionowemu prądowi "
                    f"wyłączalnemu zwarciowemu {liczba_pl(float(icu))} kA"
                ),
                wplyw_pl=(
                    "limit cieplny i dynamiczny aparatu opiera się na założeniu, nie na danej "
                    "producenta — aparat o niższym prądzie krótkotrwałym oceniono by zbyt "
                    "optymistycznie"
                ),
            ),
            None,
        )
    return None, (
        "karta nie podaje prądu krótkotrwałego wytrzymywanego, a dla tego rodzaju aparatu nie "
        "ma uzasadnionej propozycji (przyjęcie prądu wyłączalnego dotyczy wyłącznika z jego "
        "znamionowym prądem wyłączalnym)"
    )


def _propozycja_t_th() -> PropozycjaWartosci:
    return PropozycjaWartosci(
        parametr=PARAMETR_T_TH,
        wartosc=CZAS_ZWARCIA_ZALECANY_S,
        jednostka="s",
        rodzaj_zrodla="NORMA",
        odniesienie=_ODNIESIENIE_T_TH,
        uzasadnienie_pl=(
            "Karta nie podaje czasu odniesienia prądu krótkotrwałego — przyjęto wartość "
            f"zalecaną normy {liczba_pl(CZAS_ZWARCIA_ZALECANY_S)} s"
        ),
        wplyw_pl=(
            "limit cieplny przeliczany jest z czasu zalecanego normy; aparat próbowany krócej "
            "oceniono by zbyt optymistycznie"
        ),
    )


def _propozycja_i_dyn(i_th: WartoscRozstrzygnieta) -> tuple[PropozycjaWartosci | None, str | None]:
    if i_th.wartosc is None or i_th.pochodzenie not in ("KATALOG", "PROJEKTANT"):
        return None, (
            "karta nie podaje prądu szczytowego wytrzymywanego, a relacja normowa wymaga prądu "
            "krótkotrwałego z karty albo nadanego przez projektanta"
        )
    zrodlo_i_th = "z karty" if i_th.pochodzenie == "KATALOG" else "nadanego przez projektanta"
    wartosc = round(i_th.wartosc * WSPOLCZYNNIK_IP_DO_IK_50HZ, 3)
    return (
        PropozycjaWartosci(
            parametr=PARAMETR_I_DYN,
            wartosc=wartosc,
            jednostka="kA",
            rodzaj_zrodla="NORMA",
            odniesienie=_ODNIESIENIE_I_DYN,
            uzasadnienie_pl=(
                "Karta nie podaje prądu szczytowego wytrzymywanego — przyjęto relację normową "
                f"I_p = {liczba_pl(WSPOLCZYNNIK_IP_DO_IK_50HZ)}·I_k dla 50 Hz z prądu "
                f"krótkotrwałego {liczba_pl(i_th.wartosc)} kA {zrodlo_i_th}"
            ),
            wplyw_pl=(
                "limit dynamiczny wynika z relacji normowej, nie z próby typu konkretnego "
                "aparatu"
            ),
        ),
        None,
    )


# ---------------------------------------------------------------------------
# Rozstrzygnięcie pierwszeństwa (jedno miejsce)
# ---------------------------------------------------------------------------


def _jednostka(parametr: str) -> str:
    return OPISY_PARAMETROW_APARATU_SN[parametr].jednostka


def _rozstrzygnij(
    parametr: str,
    *,
    projektant: WartoscProjektanta | None,
    z_karty: float | None,
    pochodzenie_karty: str,
    propozycja: PropozycjaWartosci | None,
    powod_braku: str | None,
) -> WartoscRozstrzygnieta:
    jednostka = _jednostka(parametr)
    if projektant is not None:
        return WartoscRozstrzygnieta(
            parametr=parametr,
            wartosc=float(projektant.wartosc),
            jednostka=jednostka,
            pochodzenie="PROJEKTANT",
            powod_projektanta_pl=projektant.powod_pl,
        )
    if z_karty is not None:
        return WartoscRozstrzygnieta(
            parametr=parametr,
            wartosc=float(z_karty),
            jednostka=jednostka,
            pochodzenie="KATALOG",
            pochodzenie_karty=pochodzenie_karty,
        )
    if propozycja is not None:
        return WartoscRozstrzygnieta(
            parametr=parametr,
            wartosc=propozycja.wartosc,
            jednostka=jednostka,
            pochodzenie="PROPOZYCJA",
            propozycja=propozycja,
        )
    return WartoscRozstrzygnieta(
        parametr=parametr,
        wartosc=None,
        jednostka=jednostka,
        pochodzenie=None,
        powod_braku_pl=powod_braku,
    )


def rozstrzygnij_parametry_aparatu_sn(
    karta: KartaAparatuSN,
    wartosci_projektanta: Mapping[str, WartoscProjektanta] | None = None,
) -> dict[str, WartoscRozstrzygnieta]:
    """Wartość i pochodzenie KAŻDEGO parametru aparatu SN (projektant > karta > propozycja).

    Propozycja prądu szczytowego wynika z prądu krótkotrwałego ROZSTRZYGNIĘTEGO wyżej, ale
    tylko gdy ten pochodzi z karty albo od projektanta (relacja normowa na założeniu byłaby
    założeniem na założeniu). Czas odniesienia prądu krótkotrwałego proponowany jest tylko,
    gdy prąd krótkotrwały istnieje — sam czas bez prądu niczego nie ocenia.
    """
    projektant = dict(wartosci_projektanta or {})
    pochodzenie_karty = pochodzenie_danej_karty(karta.manufacturer)

    czas_propozycja, czas_brak = _propozycja_czasu_wlasnego(karta)
    czas = _rozstrzygnij(
        PARAMETR_CZAS_WLASNY,
        projektant=projektant.get(PARAMETR_CZAS_WLASNY),
        z_karty=karta.break_time_s,
        pochodzenie_karty=pochodzenie_karty,
        propozycja=czas_propozycja,
        powod_braku=czas_brak,
    )

    i_th_propozycja, i_th_brak = _propozycja_i_th(karta)
    i_th = _rozstrzygnij(
        PARAMETR_I_TH,
        projektant=projektant.get(PARAMETR_I_TH),
        z_karty=karta.i_th_ka,
        pochodzenie_karty=pochodzenie_karty,
        propozycja=i_th_propozycja,
        powod_braku=i_th_brak,
    )

    t_th = _rozstrzygnij(
        PARAMETR_T_TH,
        projektant=projektant.get(PARAMETR_T_TH),
        z_karty=karta.i_th_duration_s,
        pochodzenie_karty=pochodzenie_karty,
        propozycja=_propozycja_t_th() if i_th.wartosc is not None else None,
        powod_braku="czas odniesienia nie dotyczy aparatu bez prądu krótkotrwałego wytrzymywanego",
    )

    i_dyn_propozycja, i_dyn_brak = _propozycja_i_dyn(i_th)
    i_dyn = _rozstrzygnij(
        PARAMETR_I_DYN,
        projektant=projektant.get(PARAMETR_I_DYN),
        z_karty=karta.i_dyn_ka,
        pochodzenie_karty=pochodzenie_karty,
        propozycja=i_dyn_propozycja,
        powod_braku=i_dyn_brak,
    )
    return {
        PARAMETR_CZAS_WLASNY: czas,
        PARAMETR_I_TH: i_th,
        PARAMETR_T_TH: t_th,
        PARAMETR_I_DYN: i_dyn,
    }


def propozycje_aparatu_sn(karta: KartaAparatuSN) -> list[PropozycjaWartosci]:
    """Propozycje wartości roboczych pozycji katalogu (bez wartości projektanta).

    Przegląd katalogu pokazuje przy pozycji, CZYM obliczenie uzupełni brak karty — wyłącznie
    parametry, których karta nie niesie (kolejność ``PARAMETRY_APARATU_SN``).
    """
    return [
        w.propozycja
        for w in rozstrzygnij_parametry_aparatu_sn(karta).values()
        if w.pochodzenie == "PROPOZYCJA" and w.propozycja is not None
    ]


# ---------------------------------------------------------------------------
# Brama wartości projektanta (operacja domenowa)
# ---------------------------------------------------------------------------


def blad_wartosci_projektanta(parametr: object, wartosc: object) -> str | None:
    """Powód odmowy wartości projektanta po polsku albo ``None`` (wartość dopuszczalna)."""
    if not isinstance(parametr, str) or parametr not in OPISY_PARAMETROW_APARATU_SN:
        dozwolone = ", ".join(f"„{p}”" for p in PARAMETRY_APARATU_SN)
        return (
            f"Parametr „{parametr}” nie jest parametrem aparatu SN, któremu projektant może "
            f"nadać wartość — dozwolone: {dozwolone}."
        )
    opis = OPISY_PARAMETROW_APARATU_SN[parametr]
    if isinstance(wartosc, bool) or not isinstance(wartosc, int | float):
        return f"Wartość parametru {opis.nazwa_pl} musi być liczbą w {opis.jednostka}."
    liczba = float(wartosc)
    if not (opis.dopuszczalne_od <= liczba <= opis.dopuszczalne_do):
        return (
            f"Wartość parametru {opis.nazwa_pl} {liczba_pl(liczba)} {opis.jednostka} leży poza "
            f"zakresem dopuszczalnym {liczba_pl(opis.dopuszczalne_od)}–{liczba_pl(opis.dopuszczalne_do)} "
            f"{opis.jednostka}."
        )
    return None
