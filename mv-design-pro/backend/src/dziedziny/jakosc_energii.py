"""Wymaganie jakości energii i parametr metody — typ rejestru (karta AB-H0 §0.12).

JEDEN typ wymagania jakości energii w produkcie; dane (wpisy krajowe, normowe, nakładki
OSD) żyją w warstwie jakości energii profilu regulacyjnego — tu jest wyłącznie kontrakt
i JEDNA funkcja stosowalności z regułami zakazu przenoszenia.

Wpis nazywa DOKŁADNIE: wielkość, rodzaj wymagania (poziom kompatybilności, charakterystyka
napięcia zasilającego, poziom planowania, limit emisji przydzielony, limit emisji
urządzenia), podmiot, poziom napięcia (z granicami w kV i domknięciem z dokumentu — bez
domyślnych granic), punkt pomiaru, agregację (okno, statystyka, okres obserwacji), pasmo,
wartość albo tabelę limitów indywidualnych, odniesienie procentu, podstawę (dokument,
wydanie, jednostka redakcyjna, stan) i wersję.

ZAKAZ PRZENOSZENIA — ``stosowalnosc_wymagania_jakosci(wymaganie, przedmiot)`` (JEDYNE
miejsce reguły; kryteria biorą limity WYŁĄCZNIE przez tę funkcję). ``dotyczy=False``
z powodem PL, gdy:

1. poziom napięcia wpisu ≠ poziom przedmiotu („brak przenoszenia nN→SN" i każda inna para);
2. limit emisji URZĄDZENIA wobec oceny innej niż emisja urządzenia („urządzenie ≠
   instalacja") — i symetrycznie limit przydzielony instalacji wobec oceny urządzenia;
3. poziom kompatybilności / charakterystyka napięcia zasilającego / poziom planowania
   wobec oceny emisji („kompatybilność/charakterystyka ≠ emisja") — i symetrycznie limit
   emisji wobec oceny kompatybilności sieci („emisja ≠ kompatybilność");
4. punkt pomiaru wpisu ≠ punkt oceny;
5. podmiot, do którego adresowane jest wymaganie ≠ podmiot oceny.

Powód wymienia KAŻDĄ naruszoną regułę (nie tylko pierwszą).

IMPORTY: stdlib, pydantic, ``werdykt.kontrakt``, ``dziedziny.*``.
"""

from __future__ import annotations

from typing import Literal, Self

from dziedziny.kanon import Dodatnia, KontraktDziedziny, Przedzial, naruszenie
from pydantic import field_validator, model_validator
from werdykt.kontrakt import PodstawaWymagania, RodzajPodstawy, Stosowalnosc, Tekst, Wielkosc

# ---------------------------------------------------------------------------
# Słowniki zamknięte
# ---------------------------------------------------------------------------

WielkoscJakosci = Literal[
    "THD_U",
    "U_H",
    "THD_I",
    "TDD",
    "I_H",
    "PST",
    "PLT",
    "ODCHYLENIE_U",
    "WSPOLCZYNNIK_ASYMETRII_U",
    "U_PASMA_SUPRAHARMONICZNEGO",
    "I_PASMA_SUPRAHARMONICZNEGO",
]
RodzajWymaganiaJakosci = Literal[
    "POZIOM_KOMPATYBILNOSCI",
    "CHARAKTERYSTYKA_NAPIECIA_ZASILANIA",
    "POZIOM_PLANOWANIA",
    "LIMIT_EMISJI_PRZYDZIELONY",
    "LIMIT_EMISJI_URZADZENIA",
]
PodmiotWymagania = Literal["OSD", "PODMIOT_PRZYLACZANY", "URZADZENIE"]
PoziomNapieciaWymagania = Literal["NN", "SN", "WN"]
PunktPomiaruWymagania = Literal[
    "ZACISKI_ZASILANIA_ODBIORCY", "PUNKT_PRZYLACZENIA", "ZACISKI_URZADZENIA", "SZYNA_ZASILAJACA"
]
RodzajOceny = Literal["EMISJA_INSTALACJI", "EMISJA_URZADZENIA", "KOMPATYBILNOSC_SIECI"]
OdniesienieWymagania = Literal["U_1", "U_N", "U_C", "I_L", "I_N"]

#: Rodzaje wymagań opisujące STAN SIECI (nie emisję).
RODZAJE_STANU_SIECI: frozenset[RodzajWymaganiaJakosci] = frozenset(
    ("POZIOM_KOMPATYBILNOSCI", "CHARAKTERYSTYKA_NAPIECIA_ZASILANIA", "POZIOM_PLANOWANIA")
)
#: Rodzaje wymagań będące limitami EMISJI.
RODZAJE_EMISJI: frozenset[RodzajWymaganiaJakosci] = frozenset(
    ("LIMIT_EMISJI_PRZYDZIELONY", "LIMIT_EMISJI_URZADZENIA")
)
#: Oceny emisji.
OCENY_EMISJI: frozenset[RodzajOceny] = frozenset(("EMISJA_INSTALACJI", "EMISJA_URZADZENIA"))
#: Rodzaje podstawy wpisu rejestru (norma, prawo krajowe, OSD — w tym warunki przyłączenia).
RODZAJE_PODSTAWY_WPISU: frozenset[RodzajPodstawy] = frozenset(("NORMA", "PRAWO_KRAJOWE", "OSD"))
#: Wielkości pasma supraharmonicznego — wymagają pasma (zakresu albo odnośnika).
WIELKOSCI_PASMOWE: frozenset[WielkoscJakosci] = frozenset(
    ("U_PASMA_SUPRAHARMONICZNEGO", "I_PASMA_SUPRAHARMONICZNEGO")
)
#: Etykiety poziomów w komunikatach.
_ETYKIETA_POZIOMU: dict[PoziomNapieciaWymagania, str] = {"NN": "nN", "SN": "SN", "WN": "WN"}


# ---------------------------------------------------------------------------
# Typy
# ---------------------------------------------------------------------------


class ZakresNapieciaWymagania(KontraktDziedziny):
    """Poziom napięcia wpisu z granicami [kV] i domknięciem z dokumentu (bez domyślnych)."""

    poziom: PoziomNapieciaWymagania
    granice_kv: Przedzial | None = None


class AgregacjaWymagania(KontraktDziedziny):
    """Agregacja oceny: okno czasowe [s], statystyka i okres obserwacji — z dokumentu."""

    okno_s: Dodatnia | None = None
    statystyka_pl: Tekst
    okres_obserwacji_pl: Tekst | None = None


class ZakresPasma(KontraktDziedziny):
    """Zakres częstotliwości wpisu [Hz] — domknięty z obu stron, z dokumentu."""

    f_min_hz: Dodatnia
    f_max_hz: Dodatnia

    @model_validator(mode="after")
    def _uporzadkowany(self) -> Self:
        if not self.f_min_hz < self.f_max_hz:
            raise ValueError(
                naruszenie(
                    "jakosc.wpis",
                    f"Pasmo wpisu wymaga f_min < f_max ({self.f_min_hz} ≥ {self.f_max_hz} Hz).",
                )
            )
        return self


class PozycjaTabeliLimitow(KontraktDziedziny):
    """Limit indywidualny dla częstotliwości składowej [Hz]."""

    f_hz: Dodatnia
    wartosc: Wielkosc


class WymaganieJakosciEnergii(KontraktDziedziny):
    """Wpis rejestru wymagań jakości energii (wartość ALBO tabela limitów indywidualnych)."""

    ident: Tekst
    wielkosc: WielkoscJakosci
    rodzaj_wymagania: RodzajWymaganiaJakosci
    podmiot: PodmiotWymagania
    poziom_napiecia: ZakresNapieciaWymagania
    punkt_pomiaru: PunktPomiaruWymagania
    agregacja: AgregacjaWymagania | None = None
    pasmo: ZakresPasma | None = None
    pasmo_ref: Tekst | None = None
    wartosc: Wielkosc | None = None
    tabela: tuple[PozycjaTabeliLimitow, ...] | None = None
    odniesienie: OdniesienieWymagania | None = None
    podstawa: PodstawaWymagania
    wersja: Tekst

    @field_validator("tabela")
    @classmethod
    def _tabela_rosnaco(
        cls, tabela: tuple[PozycjaTabeliLimitow, ...] | None
    ) -> tuple[PozycjaTabeliLimitow, ...] | None:
        if tabela is None:
            return None
        if not tabela:
            raise ValueError(
                naruszenie("jakosc.wpis", "Tabela limitów indywidualnych nie może być pusta.")
            )
        czestotliwosci = [p.f_hz for p in tabela]
        if len(set(czestotliwosci)) != len(czestotliwosci):
            raise ValueError(
                naruszenie(
                    "jakosc.wpis", f"Tabela limitów powtarza częstotliwości: {czestotliwosci} Hz."
                )
            )
        return tuple(sorted(tabela, key=lambda p: p.f_hz))

    @model_validator(mode="after")
    def _kontrakt_wpisu(self) -> Self:
        if (self.wartosc is None) == (self.tabela is None):
            raise ValueError(
                naruszenie(
                    "jakosc.wpis",
                    f"Wpis '{self.ident}': podaj wartość ALBO tabelę limitów — dokładnie jedno.",
                )
            )
        if self.pasmo is not None and self.pasmo_ref is not None:
            raise ValueError(
                naruszenie(
                    "jakosc.wpis",
                    f"Wpis '{self.ident}': pasmo podane dwiema drogami (zakres i odnośnik) — jedno.",
                )
            )
        if self.wielkosc in WIELKOSCI_PASMOWE and self.pasmo is None and self.pasmo_ref is None:
            raise ValueError(
                naruszenie(
                    "jakosc.wpis",
                    f"Wpis '{self.ident}': wielkość pasma supraharmonicznego wymaga pasma (zakresu "
                    "albo odnośnika do definicji pasma z dokumentu).",
                )
            )
        jednostki = (
            [self.wartosc.jednostka]
            if self.wartosc is not None
            else [p.wartosc.jednostka for p in self.tabela or ()]
        )
        if "%" in jednostki and self.odniesienie is None:
            raise ValueError(
                naruszenie(
                    "jakosc.wpis",
                    f"Wpis '{self.ident}': limit w % bez odniesienia (U_1, U_N, U_C, I_L, I_N) — "
                    "goły procent jest niejednoznaczny.",
                )
            )
        if self.podstawa.rodzaj not in RODZAJE_PODSTAWY_WPISU:
            raise ValueError(
                naruszenie(
                    "jakosc.wpis",
                    f"Wpis '{self.ident}': podstawa rodzaju {self.podstawa.rodzaj} — wpis rejestru "
                    "pochodzi z normy, prawa krajowego albo dokumentu OSD.",
                )
            )
        if self.rodzaj_wymagania == "LIMIT_EMISJI_URZADZENIA" and self.podmiot != "URZADZENIE":
            raise ValueError(
                naruszenie(
                    "jakosc.wpis",
                    f"Wpis '{self.ident}': limit emisji urządzenia adresowany do podmiotu "
                    f"{self.podmiot} — limit urządzenia dotyczy urządzenia.",
                )
            )
        return self


class ParametrMetody(KontraktDziedziny):
    """Stała metody oceny z dokumentem (np. wykładnik sumowania migotania, wykładniki α
    sumowania harmonicznych, definicja współczynnika asymetrii) — wartość ALBO definicja."""

    ident: Tekst
    nazwa_pl: Tekst
    wartosc: Wielkosc | None = None
    definicja_latex: Tekst | None = None
    podstawa: PodstawaWymagania
    wersja: Tekst

    @model_validator(mode="after")
    def _jedna_postac(self) -> Self:
        if (self.wartosc is None) == (self.definicja_latex is None):
            raise ValueError(
                naruszenie(
                    "jakosc.parametr_metody",
                    f"Parametr metody '{self.ident}': wartość ALBO definicja — dokładnie jedno.",
                )
            )
        if self.podstawa.rodzaj not in RODZAJE_PODSTAWY_WPISU:
            raise ValueError(
                naruszenie(
                    "jakosc.parametr_metody",
                    f"Parametr metody '{self.ident}': podstawa rodzaju {self.podstawa.rodzaj} — "
                    "stała metody pochodzi z normy, prawa krajowego albo dokumentu OSD.",
                )
            )
        return self


class PrzedmiotOceny(KontraktDziedziny):
    """Przedmiot oceny, wobec którego sprawdzana jest stosowalność wpisu."""

    poziom_napiecia: PoziomNapieciaWymagania
    punkt: PunktPomiaruWymagania
    podmiot: PodmiotWymagania
    rodzaj_oceny: RodzajOceny


# ---------------------------------------------------------------------------
# JEDNA funkcja stosowalności
# ---------------------------------------------------------------------------


def naruszenia_przenoszenia(
    wymaganie: WymaganieJakosciEnergii, przedmiot: PrzedmiotOceny
) -> tuple[str, ...]:
    """Naruszone reguły zakazu przenoszenia (pusta krotka = wpis stosuje się)."""
    powody: list[str] = []
    poziom_wpisu = wymaganie.poziom_napiecia.poziom
    if poziom_wpisu != przedmiot.poziom_napiecia:
        powody.append(
            f"brak przenoszenia {_ETYKIETA_POZIOMU[poziom_wpisu]}→"
            f"{_ETYKIETA_POZIOMU[przedmiot.poziom_napiecia]}: wpis dotyczy sieci "
            f"{_ETYKIETA_POZIOMU[poziom_wpisu]}, przedmiot oceny — "
            f"{_ETYKIETA_POZIOMU[przedmiot.poziom_napiecia]}"
        )
    rodzaj = wymaganie.rodzaj_wymagania
    ocena = przedmiot.rodzaj_oceny
    if rodzaj == "LIMIT_EMISJI_URZADZENIA" and ocena != "EMISJA_URZADZENIA":
        powody.append(
            "urządzenie ≠ instalacja: limit emisji urządzenia nie jest kryterium oceny " f"{ocena}"
        )
    if rodzaj == "LIMIT_EMISJI_PRZYDZIELONY" and ocena == "EMISJA_URZADZENIA":
        powody.append(
            "instalacja ≠ urządzenie: limit przydzielony instalacji nie jest kryterium emisji "
            "pojedynczego urządzenia"
        )
    if rodzaj in RODZAJE_STANU_SIECI and ocena in OCENY_EMISJI:
        powody.append(
            "kompatybilność/charakterystyka ≠ emisja: wpis opisuje stan sieci "
            f"({rodzaj}), a ocena dotyczy emisji ({ocena})"
        )
    if rodzaj in RODZAJE_EMISJI and ocena == "KOMPATYBILNOSC_SIECI":
        powody.append("emisja ≠ kompatybilność: limit emisji nie opisuje stanu sieci")
    if wymaganie.punkt_pomiaru != przedmiot.punkt:
        powody.append(
            f"punkt pomiaru wpisu ({wymaganie.punkt_pomiaru}) ≠ punkt oceny ({przedmiot.punkt})"
        )
    if wymaganie.podmiot != przedmiot.podmiot:
        powody.append(
            f"wymaganie adresowane do {wymaganie.podmiot}, oceniany podmiot {przedmiot.podmiot}"
        )
    return tuple(powody)


def stosowalnosc_wymagania_jakosci(
    wymaganie: WymaganieJakosciEnergii, przedmiot: PrzedmiotOceny
) -> Stosowalnosc:
    """JEDYNA reguła stosowalności wpisu rejestru jakości energii (zakaz przenoszenia)."""
    powody = naruszenia_przenoszenia(wymaganie, przedmiot)
    if powody:
        return Stosowalnosc(
            dotyczy=False,
            powod_pl="; ".join(powody),
            podstawa=wymaganie.podstawa,
        )
    return Stosowalnosc(
        dotyczy=True,
        powod_pl=(
            f"wpis {wymaganie.ident} stosuje się: poziom napięcia, punkt pomiaru, podmiot "
            "i rodzaj oceny zgodne z przedmiotem"
        ),
        podstawa=wymaganie.podstawa,
    )


__all__ = [
    "OCENY_EMISJI",
    "RODZAJE_EMISJI",
    "RODZAJE_PODSTAWY_WPISU",
    "RODZAJE_STANU_SIECI",
    "WIELKOSCI_PASMOWE",
    "AgregacjaWymagania",
    "OdniesienieWymagania",
    "ParametrMetody",
    "PodmiotWymagania",
    "PozycjaTabeliLimitow",
    "PoziomNapieciaWymagania",
    "PrzedmiotOceny",
    "PunktPomiaruWymagania",
    "RodzajOceny",
    "RodzajWymaganiaJakosci",
    "WielkoscJakosci",
    "WymaganieJakosciEnergii",
    "ZakresNapieciaWymagania",
    "ZakresPasma",
    "naruszenia_przenoszenia",
    "stosowalnosc_wymagania_jakosci",
]
