"""Modele źródeł widmowych urządzenia — kontrakt produktu (karta AB-H0 §0.4).

JEDYNY w produkcie kontrakt danych widma źródła (harmoniczne i supraharmoniczne).
``V126HarmonicSourceInput`` (wejście zamrożonego solvera audytowego V12.6) jest wyłącznie
PROJEKCJĄ tego kontraktu budowaną w ``solver_input`` — nigdy odwrotnie.

Zasady, każda przypięta walidatorem przy konstrukcji (testy iloczynu cech
``tests/dziedziny/test_widmo_iloczyn_cech.py``):

* **Częstotliwość ∈ ℝ⁺, w Hz, jedna jednostka.** ``SkladowaWidma.f_hz`` > 0; pola „rząd"
  NIE MA — rząd jest wielkością pochodną h = f/f₁ liczoną przez konsumenta z f₁ studium.
  Duplikat częstotliwości w modelu = błąd; składowe są porządkowane rosnąco po f
  (permutacja wierszy wejścia daje ten sam odcisk).
* **Zakres częstotliwości modelu z dokumentu.** ``zakres_czestotliwosci`` (Hz) — każda
  składowa i każdy punkt części wewnętrznej leży w zakresie; zapytanie o f spoza zakresu
  zwraca ``OUTSIDE_DOMAIN`` (``wybierz_model``), nigdy ekstrapolację.
* **Amplituda z odniesieniem, nigdy goły procent.** Jednostka ``A`` (widmo prądu),
  ``V`` (widmo napięcia) albo ``%`` — wtedy ``odniesienie_amplitudy`` jest obowiązkowe
  i nazywa bazę (``I_N_URZADZENIA``, ``I_1_W_PUNKCIE_PRACY``, ``U_1``, ``U_N``) wraz
  z wartością odniesienia ALBO wskazaniem pól karty, z których konsument ją wyliczy.
  Liść nie przelicza procentów na ampery (zero fizyki — reguła ``backend_no_physics_guard``).
* **Faza: nieznana ≠ zero.** ``faza_deg = None`` wymaga powodu; składowa, której f/f₁ nie
  jest całkowite (interharmoniczna), MUSI mieć fazę ``None`` z powodem — faza składowej
  niestacjonarnej względem podstawowej nie jest określona. ``faza_znana(model)`` zwraca
  fałsz dla modelu z choćby jedną fazą nieznaną: konsument nie może wtedy użyć sumy
  fazorowej (sonda P10 audytu: suma koherentna z fazą 0 dawała identyczne U₅ dla dwóch
  źródeł 5 % i jednego 10 %).
* **Reguły rodzajów** (``RodzajModeluWidmowego``): widmo prądu / napięcia — tylko źródło;
  równoważnik Nortona — prąd źródła + admitancja na TEJ SAMEJ siatce f; Thévenina —
  napięcie źródła + impedancja na tej samej siatce; widmo zmierzone — komplet parametrów
  pomiaru (``dziedziny.pomiar``); równoważnik zależny od częstotliwości — wyłącznie część
  wewnętrzna (tabela albo model parametryczny), bez źródła.
* **Punkt pracy i domena, bez interpolacji.** Model deklaruje przedziały punktu pracy
  z dokumentu (biny mocy z raportu, z domknięciem z dokumentu). ``wybierz_model`` zwraca
  model zawierający punkt i częstotliwość; poza domeną — ``PozaDomenaModelu`` z nazwanym
  parametrem; dwa modele pokrywające ten sam punkt — ``NiejednoznacznyWybor`` (nigdy
  „pierwszy z listy"). Interpolacja między punktami pracy NIE jest wykonywana.
* **Częstotliwość przełączania** ``czestotliwosc_przelaczania_hz`` — JEDYNE miejsce tego
  pola w produkcie (niezmiennik „f_sw nigdy w DAE"); dopuszczalne wyłącznie dla dziedziny
  supraharmonicznej.

Dozwolona arytmetyka (zero fizyki): porównania zakresów i sprawdzenie całkowitości ilorazu
f/f₁ (``rzad_harmonicznej``) z tolerancją reprezentacji zmiennoprzecinkowej
``TOLERANCJA_CALKOWITOSCI_RZEDU``.

IMPORTY: stdlib, pydantic, ``werdykt.kontrakt``, ``werdykt.proweniencja``, ``dziedziny.*``.
"""

from __future__ import annotations

from typing import Literal, Self

from dziedziny.kanon import (
    Dodatnia,
    KontraktDziedziny,
    Nieujemna,
    Przedzial,
    Skonczona,
    naruszenie,
)
from dziedziny.pomiar import ParametryPomiaru
from pydantic import field_validator, model_validator
from werdykt.kontrakt import DziedzinaFizyki, PodstawaWymagania, RodzajPodstawy, Tekst, Wielkosc
from werdykt.proweniencja import FieldQuality

# ---------------------------------------------------------------------------
# Słowniki zamknięte
# ---------------------------------------------------------------------------

#: Rodzaj modelu źródła widmowego (plan O-19, karta AB-H0 §0.4.1).
RodzajModeluWidmowego = Literal[
    "CURRENT_SPECTRUM",
    "VOLTAGE_SPECTRUM",
    "NORTON_EQUIVALENT",
    "THEVENIN_EQUIVALENT",
    "MEASURED_SPECTRUM",
    "FREQUENCY_DEPENDENT_EQUIVALENT",
]
#: Dziedziny fizyki, w których żyje model widmowy (podzbiór ``DziedzinaFizyki``).
DziedzinaWidmowa = Literal["HARMONIC_FREQUENCY_DOMAIN", "SUPRAHARMONIC_FREQUENCY_DOMAIN"]
#: Baza amplitudy wyrażonej w procentach.
RodzajOdniesieniaAmplitudy = Literal["I_N_URZADZENIA", "I_1_W_PUNKCIE_PRACY", "U_1", "U_N"]
#: Wielkość podstawowa, względem której podano fazy składowych.
WielkoscOdniesieniaFazy = Literal["U_1_ZACISKOW", "I_1_URZADZENIA"]
#: Konwencja fazy względnej: θ_h,rel = θ_h − h·θ₁ (faza składowej h względem podstawowej
#: wielkości odniesienia przesuniętej do częstotliwości składowej).
KonwencjaFazy = Literal["THETA_H_MINUS_H_THETA_1"]
#: Baza mocy punktu pracy.
BazaMocyPunktuPracy = Literal["S_N_URZADZENIA", "P_N_URZADZENIA"]
#: Tryb pracy magazynu energii w punkcie pracy modelu.
TrybPracyMagazynu = Literal["LADOWANIE", "ROZLADOWANIE", "POSTOJ"]
#: Rodzina modelu parametrycznego impedancji wewnętrznej.
RodzinaModeluParametrycznego = Literal["Z_conv_literaturowy"]
#: Parametr punktu pracy albo zapytania, który wyprowadził poza domenę modelu.
ParametrDomeny = Literal[
    "dziedzina", "f_hz", "baza_mocy", "p", "q", "u", "soc", "tryb", "stacjonarnosc"
]

#: Rodzaje modeli z częścią źródłową (składowe widma).
RODZAJE_ZE_ZRODLEM: frozenset[RodzajModeluWidmowego] = frozenset(
    (
        "CURRENT_SPECTRUM",
        "VOLTAGE_SPECTRUM",
        "NORTON_EQUIVALENT",
        "THEVENIN_EQUIVALENT",
        "MEASURED_SPECTRUM",
    )
)
#: Rodzaje modeli, których źródło jest prądowe (jednostka ``A`` albo ``%`` bazy prądowej).
RODZAJE_PRADOWE: frozenset[RodzajModeluWidmowego] = frozenset(
    ("CURRENT_SPECTRUM", "NORTON_EQUIVALENT")
)
#: Rodzaje modeli, których źródło jest napięciowe (``V`` albo ``%`` bazy napięciowej).
RODZAJE_NAPIECIOWE: frozenset[RodzajModeluWidmowego] = frozenset(
    ("VOLTAGE_SPECTRUM", "THEVENIN_EQUIVALENT")
)
#: Bazy procentu dla źródła prądowego i napięciowego.
BAZY_PRADOWE: frozenset[RodzajOdniesieniaAmplitudy] = frozenset(
    ("I_N_URZADZENIA", "I_1_W_PUNKCIE_PRACY")
)
BAZY_NAPIECIOWE: frozenset[RodzajOdniesieniaAmplitudy] = frozenset(("U_1", "U_N"))
#: Jednostki amplitudy dopuszczone w kontrakcie (jedna jednostka na wielkość — bez kA, mV).
JEDNOSTKA_PRADU = "A"
JEDNOSTKA_NAPIECIA = "V"
JEDNOSTKA_PROCENTU = "%"
#: Rodzaje podstawy dopuszczone dla danych widma: karta/raport producenta albo dana
#: inżyniera (karta widmowa projektu, widmo ręczne).
RODZAJE_PODSTAWY_WIDMA: frozenset[RodzajPodstawy] = frozenset(
    ("KATALOG_PRODUCENTA", "ZALOZENIE_PROJEKTOWE")
)
#: Stany źródła podstawy, przy których dana ma ustalone pochodzenie (dokument, wydanie,
#: jednostka redakcyjna).
STANY_USTALONE = frozenset(("WSKAZANE", "ZWERYFIKOWANE"))

#: Tolerancja WZGLĘDNA całkowitości ilorazu f/f₁. Pochłania wyłącznie błąd reprezentacji
#: zmiennoprzecinkowej iloczynu h·f₁ zapisanego w dokumencie (np. 7 · 49,8 Hz =
#: 348,59999999999997 Hz → iloraz 6,999999999999999), NIE rozbieżność siatki pomiarowej:
#: składowa 251 Hz przy f₁ = 50 Hz jest interharmoniczną, nie „piątą harmoniczną".
TOLERANCJA_CALKOWITOSCI_RZEDU = 1e-9
#: Powód obowiązkowy fazy składowej interharmonicznej.
POWOD_FAZY_INTERHARMONICZNEJ = (
    "faza składowej niestacjonarnej względem podstawowej nie jest określona"
)


def rzad_harmonicznej(f_hz: float, f1_hz: float) -> int | None:
    """Rząd h = f/f₁, gdy iloraz jest całkowity (≥ 1), albo ``None`` (interharmoniczna).

    Całkowitość sprawdzana względnie z ``TOLERANCJA_CALKOWITOSCI_RZEDU``. Funkcja nie
    zaokrągla składowej do najbliższego rzędu — zwraca rząd wyłącznie dla wielokrotności
    f₁ w granicy reprezentacji liczby.
    """
    if not f_hz > 0.0 or not f1_hz > 0.0:
        raise ValueError(
            naruszenie(
                "widmo.czestotliwosc",
                f"Częstotliwości muszą być dodatnie (f = {f_hz} Hz, f₁ = {f1_hz} Hz).",
            )
        )
    iloraz = f_hz / f1_hz
    najblizszy = round(iloraz)
    if najblizszy < 1:
        return None
    if abs(iloraz - najblizszy) <= TOLERANCJA_CALKOWITOSCI_RZEDU * najblizszy:
        return int(najblizszy)
    return None


# ---------------------------------------------------------------------------
# Składowe, część wewnętrzna, odniesienia
# ---------------------------------------------------------------------------


class SkladowaWidma(KontraktDziedziny):
    """Jedna składowa widma: częstotliwość [Hz], amplituda z jednostką, faza albo powód braku.

    ``faza_deg`` jest wymagana jawnie (``None`` = faza nieznana — wtedy powód obowiązkowy);
    brak pola nie oznacza zera.
    """

    f_hz: Dodatnia
    amplituda: Wielkosc
    faza_deg: Skonczona | None
    faza_nieznana_powod_pl: Tekst | None = None

    @model_validator(mode="after")
    def _faza_albo_powod(self) -> Self:
        if self.faza_deg is None and self.faza_nieznana_powod_pl is None:
            raise ValueError(
                naruszenie(
                    "widmo.faza",
                    f"Składowa {self.f_hz} Hz: faza nieznana wymaga powodu "
                    "(faza_nieznana_powod_pl) — nieznana faza nie jest zerem.",
                )
            )
        if self.faza_deg is not None and self.faza_nieznana_powod_pl is not None:
            raise ValueError(
                naruszenie(
                    "widmo.faza",
                    f"Składowa {self.f_hz} Hz: faza podana ({self.faza_deg}°) i jednocześnie "
                    "oznaczona jako nieznana — jedno z dwóch.",
                )
            )
        if self.amplituda.wartosc < 0.0:
            raise ValueError(
                naruszenie(
                    "widmo.amplituda",
                    f"Składowa {self.f_hz} Hz: amplituda jest nieujemna (podano "
                    f"{self.amplituda.wartosc} {self.amplituda.jednostka}).",
                )
            )
        if self.amplituda.jednostka not in (
            JEDNOSTKA_PRADU,
            JEDNOSTKA_NAPIECIA,
            JEDNOSTKA_PROCENTU,
        ):
            raise ValueError(
                naruszenie(
                    "widmo.amplituda",
                    f"Składowa {self.f_hz} Hz: jednostka amplitudy {self.amplituda.jednostka!r} "
                    'spoza kontraktu — dopuszczalne: "A", "V" albo "%" z nazwaną bazą.',
                )
            )
        if self.amplituda.jednostka == JEDNOSTKA_PROCENTU and self.amplituda.wartosc > 100.0:
            raise ValueError(
                naruszenie(
                    "widmo.amplituda",
                    f"Składowa {self.f_hz} Hz: udział procentowy {self.amplituda.wartosc} % "
                    "przekracza 100 % bazy.",
                )
            )
        return self


class PunktAdmitancji(KontraktDziedziny):
    """Punkt admitancji wewnętrznej Y(f) = G + jB [S] (równoważnik Nortona / tabela)."""

    f_hz: Dodatnia
    g_s: Skonczona
    b_s: Skonczona


class PunktImpedancji(KontraktDziedziny):
    """Punkt impedancji wewnętrznej Z(f) = R + jX [Ω] (równoważnik Thévenina / tabela)."""

    f_hz: Dodatnia
    r_ohm: Skonczona
    x_ohm: Skonczona


class ParametrModelu(KontraktDziedziny):
    """Parametr modelu parametrycznego: nazwa pola karty, wartość z jednostką, jakość danej."""

    nazwa: Tekst
    wartosc: Wielkosc
    jakosc: FieldQuality


class ModelParametryczny(KontraktDziedziny):
    """Model parametryczny impedancji wewnętrznej (np. Z_conv(f) przekształtnika z pasm
    regulatorów i filtra karty — rodzina literaturowa). Liść NIE liczy Z(f) — nazywa
    rodzinę i niesie parametry; solver modelu należy do warstwy solverów."""

    rodzina: RodzinaModeluParametrycznego
    parametry: tuple[ParametrModelu, ...]

    @field_validator("parametry")
    @classmethod
    def _parametry_niepuste_posortowane(
        cls, parametry: tuple[ParametrModelu, ...]
    ) -> tuple[ParametrModelu, ...]:
        if not parametry:
            raise ValueError(
                naruszenie(
                    "widmo.niepuste", "Model parametryczny wymaga co najmniej jednego parametru."
                )
            )
        nazwy = [p.nazwa for p in parametry]
        if len(set(nazwy)) != len(nazwy):
            raise ValueError(
                naruszenie(
                    "widmo.ksztalt", f"Parametry modelu parametrycznego powtarzają nazwy: {nazwy}."
                )
            )
        return tuple(sorted(parametry, key=lambda p: p.nazwa))


class OdniesienieAmplitudy(KontraktDziedziny):
    """Baza amplitudy wyrażonej w procentach: rodzaj bazy i jej wartość z dokumentu ALBO
    wskazanie pól karty, z których konsument wyliczy bazę (np. ``sn_mva``, ``un_kv`` dla
    prądu znamionowego urządzenia). Dokładnie jedna z dwóch postaci."""

    rodzaj: RodzajOdniesieniaAmplitudy
    wartosc: Wielkosc | None = None
    pola_karty: tuple[Tekst, ...] = ()

    @model_validator(mode="after")
    def _jedna_postac(self) -> Self:
        if (self.wartosc is None) == (not self.pola_karty):
            raise ValueError(
                naruszenie(
                    "widmo.amplituda",
                    f"Odniesienie amplitudy {self.rodzaj}: podaj wartość bazy ALBO pola karty, "
                    "z których konsument ją wyliczy — dokładnie jedno z dwóch.",
                )
            )
        if self.wartosc is not None:
            oczekiwana = JEDNOSTKA_PRADU if self.rodzaj in BAZY_PRADOWE else JEDNOSTKA_NAPIECIA
            if self.wartosc.jednostka != oczekiwana:
                raise ValueError(
                    naruszenie(
                        "widmo.amplituda",
                        f"Odniesienie amplitudy {self.rodzaj}: jednostka bazy "
                        f"{self.wartosc.jednostka!r}, oczekiwana {oczekiwana!r}.",
                    )
                )
            if not self.wartosc.wartosc > 0.0:
                raise ValueError(
                    naruszenie(
                        "widmo.amplituda",
                        f"Odniesienie amplitudy {self.rodzaj}: baza musi być dodatnia "
                        f"(podano {self.wartosc.wartosc}).",
                    )
                )
        if len(set(self.pola_karty)) != len(self.pola_karty):
            raise ValueError(
                naruszenie(
                    "widmo.amplituda",
                    f"Pola karty odniesienia powtarzają się: {list(self.pola_karty)}.",
                )
            )
        return self


class OdniesienieFazy(KontraktDziedziny):
    """Wielkość podstawowa, względem której podano fazy, i konwencja fazy względnej."""

    wielkosc: WielkoscOdniesieniaFazy
    konwencja: KonwencjaFazy


class ZakresCzestotliwosci(KontraktDziedziny):
    """Zakres częstotliwości modelu [Hz] — domknięty z obu stron, z dokumentu."""

    f_min_hz: Nieujemna
    f_max_hz: Dodatnia

    @model_validator(mode="after")
    def _uporzadkowany(self) -> Self:
        if not self.f_min_hz < self.f_max_hz:
            raise ValueError(
                naruszenie(
                    "widmo.czestotliwosc",
                    f"Zakres częstotliwości wymaga f_min < f_max ({self.f_min_hz} ≥ "
                    f"{self.f_max_hz} Hz).",
                )
            )
        return self

    def zawiera(self, f_hz: float) -> bool:
        return self.f_min_hz <= f_hz <= self.f_max_hz


# ---------------------------------------------------------------------------
# Punkt pracy — domena modelu i zapytanie
# ---------------------------------------------------------------------------


class PunktPracyWidma(KontraktDziedziny):
    """Domena punktu pracy modelu (z raportu badań): przedziały P, Q, U, SOC i tryb.

    ``p`` — przedział mocy czynnej w jednostkach względnych nazwanej bazy
    (``baza_mocy``); ``q`` w tej samej bazie; ``u`` w „p.u. (U_n)"; ``soc`` w ułamku
    pojemności [0; 1]. Liczby WYŁĄCZNIE z dokumentu. ``stacjonarny`` — deklaracja
    warunku emisji: model stacjonarny nie jest wybierany dla migawki w stanie
    przejściowym (O-37).
    """

    baza_mocy: BazaMocyPunktuPracy
    p: Przedzial
    q: Przedzial | None = None
    u: Przedzial | None = None
    soc: Przedzial | None = None
    tryb: TrybPracyMagazynu | None = None
    stacjonarny: bool = True


class ZapytaniePunktuPracy(KontraktDziedziny):
    """Punkt pracy, dla którego konsument szuka modelu (migawka punktu pracy)."""

    baza_mocy: BazaMocyPunktuPracy
    p: Skonczona
    q: Skonczona | None = None
    u: Skonczona | None = None
    soc: Skonczona | None = None
    tryb: TrybPracyMagazynu | None = None
    stacjonarny: bool


# ---------------------------------------------------------------------------
# Model źródła widmowego
# ---------------------------------------------------------------------------


class ModelZrodlaWidmowego(KontraktDziedziny):
    """Model źródła widmowego urządzenia w jednym punkcie pracy i jednej dziedzinie."""

    ident: Tekst
    rodzaj: RodzajModeluWidmowego
    dziedzina: DziedzinaWidmowa
    f1_hz: Dodatnia
    zakres_czestotliwosci: ZakresCzestotliwosci
    skladowe: tuple[SkladowaWidma, ...] = ()
    admitancja: tuple[PunktAdmitancji, ...] | None = None
    impedancja: tuple[PunktImpedancji, ...] | None = None
    model_parametryczny: ModelParametryczny | None = None
    punkt_pracy: PunktPracyWidma
    odniesienie_amplitudy: OdniesienieAmplitudy | None = None
    odniesienie_fazy: OdniesienieFazy | None = None
    pomiar: ParametryPomiaru | None = None
    pasmo_ref: Tekst | None = None
    podstawa: PodstawaWymagania
    wersja: Tekst
    czestotliwosc_przelaczania_hz: Dodatnia | None = None

    @field_validator("skladowe")
    @classmethod
    def _skladowe_rosnaco(cls, skladowe: tuple[SkladowaWidma, ...]) -> tuple[SkladowaWidma, ...]:
        return tuple(sorted(skladowe, key=lambda s: s.f_hz))

    @field_validator("admitancja")
    @classmethod
    def _admitancja_rosnaco(
        cls, punkty: tuple[PunktAdmitancji, ...] | None
    ) -> tuple[PunktAdmitancji, ...] | None:
        return None if punkty is None else tuple(sorted(punkty, key=lambda p: p.f_hz))

    @field_validator("impedancja")
    @classmethod
    def _impedancja_rosnaco(
        cls, punkty: tuple[PunktImpedancji, ...] | None
    ) -> tuple[PunktImpedancji, ...] | None:
        return None if punkty is None else tuple(sorted(punkty, key=lambda p: p.f_hz))

    @model_validator(mode="after")
    def _kontrakt_modelu(self) -> Self:
        bledy = bledy_modelu(self)
        if bledy:
            raise ValueError(
                f"Model widmowy '{self.ident}' ({self.rodzaj}, {self.dziedzina}) odrzucony: "
                + " | ".join(bledy)
            )
        return self

    @property
    def siatka_zrodla_hz(self) -> tuple[float, ...]:
        return tuple(s.f_hz for s in self.skladowe)


def _siatka(punkty: tuple[PunktAdmitancji, ...] | tuple[PunktImpedancji, ...]) -> list[float]:
    return [p.f_hz for p in punkty]


def _duplikaty(czestotliwosci: list[float]) -> list[float]:
    widziane: set[float] = set()
    powtorzone: list[float] = []
    for f in czestotliwosci:
        if f in widziane and f not in powtorzone:
            powtorzone.append(f)
        widziane.add(f)
    return powtorzone


def bledy_modelu(model: ModelZrodlaWidmowego) -> list[str]:
    """Lista naruszeń kontraktu modelu (pusta = model poprawny).

    JEDNO ciało reguł: walidator ``ModelZrodlaWidmowego`` woła tę funkcję i odrzuca model
    z pełną listą naruszeń (import karty melduje wszystkie naruszenia naraz, nie pierwsze).
    """
    bledy: list[str] = []
    rodzaj = model.rodzaj
    ma_zrodlo = bool(model.skladowe)
    ma_admitancje = bool(model.admitancja)
    ma_impedancje = bool(model.impedancja)
    ma_parametryczny = model.model_parametryczny is not None

    # --- Proweniencja --------------------------------------------------------
    if model.podstawa.rodzaj not in RODZAJE_PODSTAWY_WIDMA:
        bledy.append(
            naruszenie(
                "widmo.podstawa",
                f"podstawa rodzaju {model.podstawa.rodzaj} — dane widma pochodzą z karty/raportu "
                "producenta (KATALOG_PRODUCENTA) albo od inżyniera (ZALOZENIE_PROJEKTOWE)",
            )
        )

    # --- Reguły rodzajów -----------------------------------------------------
    if rodzaj in RODZAJE_ZE_ZRODLEM and not ma_zrodlo:
        bledy.append(
            naruszenie(
                "widmo.niepuste", f"rodzaj {rodzaj} wymaga niepustej listy składowych źródła"
            )
        )
    if rodzaj == "FREQUENCY_DEPENDENT_EQUIVALENT":
        if ma_zrodlo:
            bledy.append(
                naruszenie(
                    "widmo.ksztalt",
                    "równoważnik zależny od częstotliwości opisuje wyłącznie część wewnętrzną — "
                    "bez składowych źródła",
                )
            )
        postaci = sum((ma_admitancje, ma_impedancje, ma_parametryczny))
        if postaci != 1:
            bledy.append(
                naruszenie(
                    "widmo.ksztalt",
                    "równoważnik zależny od częstotliwości wymaga DOKŁADNIE jednej postaci części "
                    "wewnętrznej (admitancja, impedancja albo model parametryczny), podano "
                    f"{postaci}",
                )
            )
    elif ma_parametryczny:
        bledy.append(
            naruszenie(
                "widmo.ksztalt",
                f"model parametryczny impedancji dopuszczalny wyłącznie dla równoważnika zależnego "
                f"od częstotliwości (rodzaj {rodzaj})",
            )
        )
    if rodzaj == "NORTON_EQUIVALENT":
        if not ma_admitancje:
            bledy.append(
                naruszenie("widmo.ksztalt", "równoważnik Nortona wymaga admitancji wewnętrznej")
            )
        if ma_impedancje:
            bledy.append(
                naruszenie("widmo.ksztalt", "równoważnik Nortona nie niesie impedancji (Thévenin)")
            )
        if (
            ma_admitancje
            and model.admitancja is not None
            and (_siatka(model.admitancja) != list(model.siatka_zrodla_hz))
        ):
            bledy.append(
                naruszenie(
                    "widmo.ksztalt",
                    "równoważnik Nortona: admitancja i prąd źródła muszą leżeć na TEJ SAMEJ siatce "
                    "częstotliwości",
                )
            )
    if rodzaj == "THEVENIN_EQUIVALENT":
        if not ma_impedancje:
            bledy.append(
                naruszenie("widmo.ksztalt", "równoważnik Thévenina wymaga impedancji wewnętrznej")
            )
        if ma_admitancje:
            bledy.append(
                naruszenie("widmo.ksztalt", "równoważnik Thévenina nie niesie admitancji (Norton)")
            )
        if (
            ma_impedancje
            and model.impedancja is not None
            and (_siatka(model.impedancja) != list(model.siatka_zrodla_hz))
        ):
            bledy.append(
                naruszenie(
                    "widmo.ksztalt",
                    "równoważnik Thévenina: impedancja i napięcie źródła muszą leżeć na TEJ SAMEJ "
                    "siatce częstotliwości",
                )
            )
    if rodzaj in ("CURRENT_SPECTRUM", "VOLTAGE_SPECTRUM", "MEASURED_SPECTRUM") and (
        ma_admitancje or ma_impedancje
    ):
        bledy.append(
            naruszenie(
                "widmo.ksztalt",
                f"rodzaj {rodzaj} opisuje wyłącznie źródło — bez części wewnętrznej",
            )
        )

    # --- Jednostki amplitudy -------------------------------------------------
    jednostki = {s.amplituda.jednostka for s in model.skladowe}
    if rodzaj in RODZAJE_PRADOWE and JEDNOSTKA_NAPIECIA in jednostki:
        bledy.append(
            naruszenie(
                "widmo.amplituda",
                f"rodzaj {rodzaj} jest źródłem prądowym — amplituda w A albo % bazy prądu",
            )
        )
    if rodzaj in RODZAJE_NAPIECIOWE and JEDNOSTKA_PRADU in jednostki:
        bledy.append(
            naruszenie(
                "widmo.amplituda",
                f"rodzaj {rodzaj} jest źródłem napięciowym — amplituda w V albo % bazy napięcia",
            )
        )
    if rodzaj == "MEASURED_SPECTRUM" and {JEDNOSTKA_PRADU, JEDNOSTKA_NAPIECIA} <= jednostki:
        bledy.append(
            naruszenie(
                "widmo.amplituda", "widmo zmierzone miesza składowe prądu (A) i napięcia (V)"
            )
        )
    ma_procent = JEDNOSTKA_PROCENTU in jednostki
    if ma_procent and model.odniesienie_amplitudy is None:
        bledy.append(
            naruszenie(
                "widmo.amplituda",
                'amplituda w "%" bez nazwanej bazy (odniesienie_amplitudy) — goły procent jest '
                "niejednoznaczny (% prądu znamionowego ≠ % podstawowej)",
            )
        )
    if not ma_procent and model.odniesienie_amplitudy is not None:
        bledy.append(
            naruszenie(
                "widmo.amplituda",
                "odniesienie amplitudy podane, choć żadna składowa nie jest w % — jedna prawda "
                "o bazie",
            )
        )
    if ma_procent and model.odniesienie_amplitudy is not None:
        baza = model.odniesienie_amplitudy.rodzaj
        if rodzaj in RODZAJE_PRADOWE and baza not in BAZY_PRADOWE:
            bledy.append(naruszenie("widmo.amplituda", f"źródło prądowe z bazą napięciową {baza}"))
        if rodzaj in RODZAJE_NAPIECIOWE and baza not in BAZY_NAPIECIOWE:
            bledy.append(naruszenie("widmo.amplituda", f"źródło napięciowe z bazą prądową {baza}"))
        if rodzaj == "MEASURED_SPECTRUM":
            if JEDNOSTKA_PRADU in jednostki and baza not in BAZY_PRADOWE:
                bledy.append(
                    naruszenie("widmo.amplituda", f"widmo zmierzone prądu z bazą napięciową {baza}")
                )
            if JEDNOSTKA_NAPIECIA in jednostki and baza not in BAZY_NAPIECIOWE:
                bledy.append(
                    naruszenie("widmo.amplituda", f"widmo zmierzone napięcia z bazą prądową {baza}")
                )

    # --- Częstotliwości ------------------------------------------------------
    for nazwa, siatka in (
        ("składowych", list(model.siatka_zrodla_hz)),
        ("admitancji", _siatka(model.admitancja) if model.admitancja else []),
        ("impedancji", _siatka(model.impedancja) if model.impedancja else []),
    ):
        powtorzone = _duplikaty(siatka)
        if powtorzone:
            bledy.append(
                naruszenie(
                    "widmo.czestotliwosc", f"duplikat częstotliwości {nazwa}: {powtorzone} Hz"
                )
            )
        poza = [f for f in siatka if not model.zakres_czestotliwosci.zawiera(f)]
        if poza:
            bledy.append(
                naruszenie(
                    "widmo.czestotliwosc",
                    f"częstotliwości {nazwa} poza zakresem modelu "
                    f"[{model.zakres_czestotliwosci.f_min_hz}; "
                    f"{model.zakres_czestotliwosci.f_max_hz}] Hz: {poza}",
                )
            )

    # --- Faza ----------------------------------------------------------------
    for skladowa in model.skladowe:
        if skladowa.faza_deg is not None and rzad_harmonicznej(skladowa.f_hz, model.f1_hz) is None:
            bledy.append(
                naruszenie(
                    "widmo.faza",
                    f"składowa {skladowa.f_hz} Hz jest interharmoniczną (f/f₁ niecałkowite przy "
                    f"f₁ = {model.f1_hz} Hz) — {POWOD_FAZY_INTERHARMONICZNEJ}; faza musi być "
                    "nieznana z powodem",
                )
            )
    if any(s.faza_deg is not None for s in model.skladowe) and model.odniesienie_fazy is None:
        bledy.append(
            naruszenie(
                "widmo.faza",
                "faza składowych podana bez wielkości odniesienia fazy (odniesienie_fazy)",
            )
        )
    if model.odniesienie_fazy is not None and all(s.faza_deg is None for s in model.skladowe):
        bledy.append(
            naruszenie("widmo.faza", "odniesienie fazy podane, choć żadna faza nie jest znana")
        )

    # --- Pomiar --------------------------------------------------------------
    supraharmoniczna = model.dziedzina == "SUPRAHARMONIC_FREQUENCY_DOMAIN"
    if rodzaj == "MEASURED_SPECTRUM":
        if model.pomiar is None:
            bledy.append(
                naruszenie(
                    "widmo.pomiar",
                    "widmo zmierzone wymaga parametrów pomiaru (metoda, rozdzielczość, okno, "
                    "agregacja, podstawa)",
                )
            )
        else:
            braki = model.pomiar.braki_kompletu(supraharmoniczna=supraharmoniczna)
            if braki:
                bledy.append(
                    naruszenie(
                        "widmo.pomiar",
                        f"widmo zmierzone bez kompletu parametrów pomiaru: {list(braki)}",
                    )
                )
    elif model.pomiar is not None and supraharmoniczna and model.pomiar.rbw_hz is None:
        bledy.append(
            naruszenie(
                "widmo.pomiar",
                "pomiar w dziedzinie supraharmonicznej wymaga pasma rozdzielczości rbw_hz",
            )
        )

    # --- Częstotliwość przełączania -----------------------------------------
    if model.czestotliwosc_przelaczania_hz is not None and not supraharmoniczna:
        bledy.append(
            naruszenie(
                "widmo.przelaczanie",
                "częstotliwość przełączania dopuszczalna wyłącznie w modelu dziedziny "
                "supraharmonicznej",
            )
        )
    return bledy


def faza_znana(model: ModelZrodlaWidmowego) -> bool:
    """Czy WSZYSTKIE składowe źródła mają znaną fazę.

    Fałsz dla modelu z choćby jedną fazą nieznaną i dla modelu bez źródła — konsument nie
    może wtedy użyć sumy fazorowej (nieznana faza nie jest zerem).
    """
    return bool(model.skladowe) and all(s.faza_deg is not None for s in model.skladowe)


# ---------------------------------------------------------------------------
# Wybór modelu dla (dziedzina, f, punkt pracy)
# ---------------------------------------------------------------------------


class ModelWybrany(KontraktDziedziny):
    """Wynik wyboru: dokładnie jeden model zawiera zapytanie."""

    status: Literal["WYBRANY"] = "WYBRANY"
    model: ModelZrodlaWidmowego


class PozaDomenaModelu(KontraktDziedziny):
    """Wynik wyboru ``OUTSIDE_DOMAIN``: żaden model nie zawiera zapytania — z parametrem,
    który wyprowadził poza domenę najbliższego kandydata."""

    status: Literal["OUTSIDE_DOMAIN"] = "OUTSIDE_DOMAIN"
    parametr: ParametrDomeny
    powod_pl: Tekst


class NiejednoznacznyWybor(KontraktDziedziny):
    """Wynik wyboru ``NIEJEDNOZNACZNY_WYBOR``: co najmniej dwa modele zawierają zapytanie."""

    status: Literal["NIEJEDNOZNACZNY_WYBOR"] = "NIEJEDNOZNACZNY_WYBOR"
    modele: tuple[Tekst, ...]
    powod_pl: Tekst


WynikWyboruModelu = ModelWybrany | PozaDomenaModelu | NiejednoznacznyWybor


def _poza_punktem_pracy(
    domena: PunktPracyWidma, zapytanie: ZapytaniePunktuPracy
) -> tuple[ParametrDomeny, str] | None:
    """Pierwszy parametr punktu pracy poza domeną modelu (kolejność stała) albo ``None``."""
    if domena.stacjonarny and not zapytanie.stacjonarny:
        return (
            "stacjonarnosc",
            "migawka w stanie przejściowym — model emisji jest stacjonarny",
        )
    if domena.baza_mocy != zapytanie.baza_mocy:
        return (
            "baza_mocy",
            f"punkt pracy w bazie {zapytanie.baza_mocy}, model w bazie {domena.baza_mocy}",
        )
    if not domena.p.zawiera(zapytanie.p):
        return ("p", f"p = {zapytanie.p} poza przedziałem modelu {domena.p.zapis_pl()}")
    przedzialy: tuple[tuple[ParametrDomeny, Przedzial | None, float | None], ...] = (
        ("q", domena.q, zapytanie.q),
        ("u", domena.u, zapytanie.u),
        ("soc", domena.soc, zapytanie.soc),
    )
    for nazwa, przedzial, wartosc in przedzialy:
        if przedzial is None:
            continue
        if wartosc is None:
            return (
                nazwa,
                f"model deklaruje przedział {nazwa} {przedzial.zapis_pl()}, a punkt pracy "
                f"nie podaje {nazwa} — przynależność nieustalona",
            )
        if not przedzial.zawiera(wartosc):
            return (nazwa, f"{nazwa} = {wartosc} poza przedziałem modelu {przedzial.zapis_pl()}")
    if domena.tryb is not None and domena.tryb != zapytanie.tryb:
        return ("tryb", f"tryb pracy {zapytanie.tryb}, model dla trybu {domena.tryb}")
    return None


def wybierz_model(
    modele: tuple[ModelZrodlaWidmowego, ...],
    dziedzina: DziedzinaFizyki,
    f_hz: float,
    punkt_pracy: ZapytaniePunktuPracy,
) -> WynikWyboruModelu:
    """Wybierz JEDEN model zawierający (dziedzina, f, punkt pracy) — bez interpolacji.

    ``OUTSIDE_DOMAIN`` nazywa parametr, który wyprowadził poza domenę: kolejność sprawdzeń
    to dziedzina → częstotliwość → punkt pracy (stacjonarność, baza, P, Q, U, SOC, tryb);
    przy wielu kandydatach nazwany jest parametr kandydata, który przeszedł najdalej.
    Dwa modele zawierające zapytanie = ``NIEJEDNOZNACZNY_WYBOR`` (lista identyfikatorów).
    """
    if not f_hz > 0.0:
        raise ValueError(
            naruszenie(
                "widmo.czestotliwosc",
                f"Częstotliwość zapytania musi być dodatnia (podano {f_hz} Hz).",
            )
        )
    w_dziedzinie = [m for m in modele if m.dziedzina == dziedzina]
    if not w_dziedzinie:
        return PozaDomenaModelu(
            parametr="dziedzina",
            powod_pl=f"brak modelu w dziedzinie {dziedzina}",
        )
    w_zakresie_f = [m for m in w_dziedzinie if m.zakres_czestotliwosci.zawiera(f_hz)]
    if not w_zakresie_f:
        zakresy = ", ".join(
            f"[{m.zakres_czestotliwosci.f_min_hz}; {m.zakres_czestotliwosci.f_max_hz}]"
            for m in sorted(w_dziedzinie, key=lambda m: m.ident)
        )
        return PozaDomenaModelu(
            parametr="f_hz",
            powod_pl=f"f = {f_hz} Hz poza zakresem częstotliwości modeli ({zakresy} Hz)",
        )
    trafione: list[ModelZrodlaWidmowego] = []
    pierwsze_odrzucenie: tuple[ParametrDomeny, str] | None = None
    for model in sorted(w_zakresie_f, key=lambda m: m.ident):
        odrzucenie = _poza_punktem_pracy(model.punkt_pracy, punkt_pracy)
        if odrzucenie is None:
            trafione.append(model)
        elif pierwsze_odrzucenie is None:
            pierwsze_odrzucenie = odrzucenie
    if len(trafione) == 1:
        return ModelWybrany(model=trafione[0])
    if len(trafione) > 1:
        return NiejednoznacznyWybor(
            modele=tuple(m.ident for m in trafione),
            powod_pl=(
                f"{len(trafione)} modele zawierają ten sam punkt pracy i częstotliwość — "
                "wybór nie jest rozstrzygnięty (dokument musi rozdzielić przedziały)"
            ),
        )
    assert pierwsze_odrzucenie is not None  # w_zakresie_f niepuste, żaden nie trafił
    parametr, powod = pierwsze_odrzucenie
    return PozaDomenaModelu(parametr=parametr, powod_pl=powod)


__all__ = [
    "BAZY_NAPIECIOWE",
    "BAZY_PRADOWE",
    "POWOD_FAZY_INTERHARMONICZNEJ",
    "RODZAJE_NAPIECIOWE",
    "RODZAJE_PODSTAWY_WIDMA",
    "RODZAJE_PRADOWE",
    "RODZAJE_ZE_ZRODLEM",
    "STANY_USTALONE",
    "TOLERANCJA_CALKOWITOSCI_RZEDU",
    "BazaMocyPunktuPracy",
    "DziedzinaWidmowa",
    "KonwencjaFazy",
    "ModelParametryczny",
    "ModelWybrany",
    "ModelZrodlaWidmowego",
    "NiejednoznacznyWybor",
    "OdniesienieAmplitudy",
    "OdniesienieFazy",
    "ParametrDomeny",
    "ParametrModelu",
    "PozaDomenaModelu",
    "PunktAdmitancji",
    "PunktImpedancji",
    "PunktPracyWidma",
    "RodzajModeluWidmowego",
    "RodzajOdniesieniaAmplitudy",
    "RodzinaModeluParametrycznego",
    "SkladowaWidma",
    "TrybPracyMagazynu",
    "WielkoscOdniesieniaFazy",
    "WynikWyboruModelu",
    "ZakresCzestotliwosci",
    "ZapytaniePunktuPracy",
    "bledy_modelu",
    "faza_znana",
    "rzad_harmonicznej",
    "wybierz_model",
]
