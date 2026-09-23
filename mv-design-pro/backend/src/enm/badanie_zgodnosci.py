"""Badanie zgodnosci na zaciskach urzadzenia — kontrakt OBOK `ScenariuszDynamiczny` (karta AB-1a D4).

PO CO OSOBNY KONTRAKT (karta AB-1a §0 R-4, audyt warstwy regulacyjnej §6.9).
Bodziec na zaciskach (zadany przebieg napiecia U(t), rampa albo skok czestotliwosci)
to INNY WARUNEK BRZEGOWY niz zdarzenie w sieci: siec zostaje zastapiona zrodlem o
przebiegu zadanym za impedancja zastepcza (stanowisko badawcze), a nie
zmodyfikowana topologicznie. Gdyby bodziec byl kolejnym rodzajem w unii
`ZdarzenieDynamiczne`, dalo by sie zlozyc scenariusz „zwarcie w sieci + zadany U(t)
na zaciskach" bez sensu fizycznego, a wynik nie mowilby, ktorym z dwoch badan byl.
Rozlacznosc wymuszona TYPEM jest pewniejsza niz flaga.

`ScenariuszDynamiczny.tresc()` NIE zmienia sie (scenariusz sieciowy nie dostaje
zadnego pola) — hashe istniejacych scenariuszy sa przypiete testem bit w bit.

RODZAJ BADANIA BIEGU `dynamika_rms`. Opcje biegu niosa `rodzaj_badania` ∈
{`scenariusz_sieciowy`, `badanie_zgodnosci`}. Brak pola jest czytany jako
`scenariusz_sieciowy` WYLACZNIE przy odczycie (`rodzaj_badania_z_opcji`) — nic nie
jest dopisywane do opcji, wiec `input_hash` istniejacych biegow sie nie zmienia.
Oba rodzaje naraz (klucz scenariusza sieciowego `dynamika` razem z kluczem
`badanie_zgodnosci`, albo rodzaj sprzeczny z niesionym kluczem) konczy sie odmowa
nazwana `RodzajBadaniaSprzecznyError` (API: 422).

RDZEN NIE WYKONUJE BADANIA ZGODNOSCI. „Szyna o zadanym przebiegu" wymaga zmiany
rdzenia DAE (`network_model/solvers/dynamika/silnik.py` — szyna sztywna trzyma
czestotliwosc znamionowa) i jest zadaniem karty AB-3R. Do tego czasu adapter biegu
konczy bieg z `badanie_zgodnosci` odmowa `bodziec.rdzen_nieobslugiwany`
(`enm/adapter_dynamiki.py`) z pelnym kontekstem — nigdy wynikiem liczonym po cichu
jak scenariusz sieciowy.

ZERO WARTOSCI DOMYSLNYCH dla danych fizycznych: impedancja zastepcza sieci, pasmo
waznosci modelu i kazda wielkosc bodzca sa polami wymaganymi. Dyskryminator
`rodzaj` rowniez nie ma wartosci domyslnej (wolajacy nazywa bodziec jawnie).
"""

from __future__ import annotations

import hashlib
import json
from typing import Annotated, Any, Literal

from enm.dynamika_modele import ProweniencjaParametrow
from enm.scenariusze import _MAX_HORYZONT_DYNAMIKI_S
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

#: Wartosci pola opcji biegu `rodzaj_badania` (zamkniety zbior).
RODZAJ_SCENARIUSZ_SIECIOWY = "scenariusz_sieciowy"
RODZAJ_BADANIE_ZGODNOSCI = "badanie_zgodnosci"
RodzajBadania = Literal["scenariusz_sieciowy", "badanie_zgodnosci"]
RODZAJE_BADANIA: tuple[str, ...] = (RODZAJ_BADANIE_ZGODNOSCI, RODZAJ_SCENARIUSZ_SIECIOWY)

#: Klucze opcji biegu `dynamika_rms`.
KLUCZ_RODZAJU_BADANIA = "rodzaj_badania"
KLUCZ_BADANIA_ZGODNOSCI = "badanie_zgodnosci"
#: Klucz scenariusza sieciowego — ten sam co `adapter_dynamiki.KLUCZ_SCENARIUSZA`
#: (projekcja `OperatingScenario.dynamika`, `scenariusze.opcje_biegu_ze_scenariusza`).
KLUCZ_SCENARIUSZA_SIECIOWEGO = "dynamika"

#: Kod odmowy nazwanej dla sprzecznego rodzaju badania (API: 422).
KOD_RODZAJ_BADANIA_SPRZECZNY = "dynamika.rodzaj_badania_sprzeczny"
#: Kod odmowy nazwanej dla tresci badania zgodnosci niespelniajacej kontraktu (API: 422).
KOD_BADANIE_ZGODNOSCI_NIEPOPRAWNE = "dynamika.badanie_zgodnosci_niepoprawne"


class PasmoWaznosciModeluHz(BaseModel):
    """Pasmo czestotliwosci, w ktorym model RMS urzadzenia jest wazny.

    Po co: model fazorowy RMS jest wyprowadzony przy czestotliwosci bliskiej
    znamionowej; skok albo rampa wyprowadzajace czestotliwosc poza pasmo, dla
    ktorego ktos napisal rownania, dalyby przebieg bez modelu. Rdzen nie niesie
    dzis zadnej liczby tego pasma, wiec pasmo jest DANA WEJSCIOWA z proweniencja
    (karta modelu, dokument walidacji) — nigdy stala dobrana w kodzie.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    f_min_hz: float = Field(gt=0.0)
    f_max_hz: float = Field(gt=0.0)
    proweniencja: ProweniencjaParametrow

    @model_validator(mode="after")
    def _pasmo_niepuste(self) -> PasmoWaznosciModeluHz:
        if self.f_min_hz >= self.f_max_hz:
            raise ValueError(
                f"PasmoWaznosciModeluHz: f_min_hz ({self.f_min_hz}) musi byc mniejsze niz "
                f"f_max_hz ({self.f_max_hz})."
            )
        return self

    def zawiera(self, f_hz: float) -> bool:
        return self.f_min_hz <= f_hz <= self.f_max_hz


class PunktProfiluNapiecia(BaseModel):
    """Jeden punkt zadanego przebiegu napiecia na zaciskach (U w jednostkach wzglednych)."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    t_s: float = Field(ge=0.0, le=_MAX_HORYZONT_DYNAMIKI_S)
    u_pu: float = Field(ge=0.0)


class ProfilNapieciaZaciskow(BaseModel):
    """Zadany przebieg U(t) na zaciskach (np. zapad dla LVRT, wzrost dla HVRT).

    Punkty sa scisle rosnace w czasie (profil monotoniczny w czasie) — dwa punkty
    o tej samej chwili bylyby dwiema wartosciami napiecia jednoczesnie.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    rodzaj: Literal["profil_napiecia_zaciskow"]
    punkty: tuple[PunktProfiluNapiecia, ...] = Field(min_length=2)

    @model_validator(mode="after")
    def _monotoniczny_w_czasie(self) -> ProfilNapieciaZaciskow:
        for poprzedni, nastepny in zip(self.punkty, self.punkty[1:], strict=False):
            if nastepny.t_s <= poprzedni.t_s:
                raise ValueError(
                    "ProfilNapieciaZaciskow: chwile punktow musza byc scisle rosnace "
                    f"(t_s={nastepny.t_s} po t_s={poprzedni.t_s})."
                )
        return self

    @property
    def t_koniec_s(self) -> float:
        return self.punkty[-1].t_s


class RampaCzestotliwosci(BaseModel):
    """Liniowa zmiana czestotliwosci zrodla badawczego od `t_start_s` do `t_koniec_s`."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    rodzaj: Literal["rampa_czestotliwosci"]
    t_start_s: float = Field(ge=0.0, le=_MAX_HORYZONT_DYNAMIKI_S)
    t_koniec_s: float = Field(gt=0.0, le=_MAX_HORYZONT_DYNAMIKI_S)
    f_poczatkowa_hz: float = Field(gt=0.0)
    df_dt_hz_s: float
    pasmo_waznosci_modelu_hz: PasmoWaznosciModeluHz

    @model_validator(mode="after")
    def _spojnosc_rampy(self) -> RampaCzestotliwosci:
        if self.df_dt_hz_s == 0.0:
            raise ValueError(
                "RampaCzestotliwosci: df_dt_hz_s = 0 nie jest rampa — stala czestotliwosc "
                "nie jest bodzcem."
            )
        if self.t_koniec_s <= self.t_start_s:
            raise ValueError(
                f"RampaCzestotliwosci: t_koniec_s ({self.t_koniec_s}) musi byc pozniej niz "
                f"t_start_s ({self.t_start_s})."
            )
        for opis, f_hz in (
            ("poczatkowa", self.f_poczatkowa_hz),
            ("koncowa", self.f_koncowa_hz),
        ):
            if not self.pasmo_waznosci_modelu_hz.zawiera(f_hz):
                raise ValueError(
                    f"RampaCzestotliwosci: czestotliwosc {opis} {f_hz} Hz poza pasmem "
                    f"waznosci modelu [{self.pasmo_waznosci_modelu_hz.f_min_hz}, "
                    f"{self.pasmo_waznosci_modelu_hz.f_max_hz}] Hz."
                )
        return self

    @property
    def f_koncowa_hz(self) -> float:
        """Czestotliwosc na koncu rampy — przebieg zadany liniowy (definicja bodzca)."""
        return self.f_poczatkowa_hz + self.df_dt_hz_s * (self.t_koniec_s - self.t_start_s)


class SkokCzestotliwosci(BaseModel):
    """Skokowa zmiana czestotliwosci zrodla badawczego w chwili `t_s`."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    rodzaj: Literal["skok_czestotliwosci"]
    t_s: float = Field(ge=0.0, le=_MAX_HORYZONT_DYNAMIKI_S)
    f_przed_hz: float = Field(gt=0.0)
    f_do_hz: float = Field(gt=0.0)
    pasmo_waznosci_modelu_hz: PasmoWaznosciModeluHz

    @model_validator(mode="after")
    def _spojnosc_skoku(self) -> SkokCzestotliwosci:
        if self.f_do_hz == self.f_przed_hz:
            raise ValueError(
                "SkokCzestotliwosci: f_do_hz rowne f_przed_hz nie jest skokiem — brak bodzca."
            )
        for opis, f_hz in (("przed skokiem", self.f_przed_hz), ("po skoku", self.f_do_hz)):
            if not self.pasmo_waznosci_modelu_hz.zawiera(f_hz):
                raise ValueError(
                    f"SkokCzestotliwosci: czestotliwosc {opis} {f_hz} Hz poza pasmem "
                    f"waznosci modelu [{self.pasmo_waznosci_modelu_hz.f_min_hz}, "
                    f"{self.pasmo_waznosci_modelu_hz.f_max_hz}] Hz."
                )
        return self


BodziecZaciskow = Annotated[
    ProfilNapieciaZaciskow | RampaCzestotliwosci | SkokCzestotliwosci,
    Field(discriminator="rodzaj"),
]


class ImpedancjaZastepcza(BaseModel):
    """Impedancja zastepcza sieci widziana z zaciskow badanego urzadzenia.

    Stanowisko badawcze zastepuje siec zrodlem o przebiegu zadanym ZA ta
    impedancja — jej wartosc decyduje o tym, jak napiecie na zaciskach odpowiada
    na prad urzadzenia, wiec nie ma dla niej wartosci „typowej" (W-98: zakaz
    domyslnej impedancji sieci). `jednostka="pu"` wymaga jawnej bazy mocy
    (`s_bazowa_mva`), `jednostka="ohm"` zakazuje jej (baza bez uzytku bylaby druga,
    niesprawdzana prawda). Napiecie odniesienia jest wymagane zawsze.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    jednostka: Literal["ohm", "pu"]
    r: float = Field(ge=0.0)
    x: float = Field(ge=0.0)
    u_bazowe_kv: float = Field(gt=0.0)
    s_bazowa_mva: float | None = Field(gt=0.0)
    proweniencja: ProweniencjaParametrow

    @model_validator(mode="after")
    def _spojnosc_bazy(self) -> ImpedancjaZastepcza:
        if self.r == 0.0 and self.x == 0.0:
            raise ValueError(
                "ImpedancjaZastepcza: R = X = 0 to siec nieskonczenie sztywna, nie impedancja "
                "zastepcza — podaj impedancje z danych sieci."
            )
        if self.jednostka == "pu" and self.s_bazowa_mva is None:
            raise ValueError(
                "ImpedancjaZastepcza: jednostka 'pu' wymaga jawnej bazy mocy s_bazowa_mva."
            )
        if self.jednostka == "ohm" and self.s_bazowa_mva is not None:
            raise ValueError(
                "ImpedancjaZastepcza: jednostka 'ohm' nie przyjmuje bazy mocy s_bazowa_mva."
            )
        return self


class BadanieZgodnosci(BaseModel):
    """Badanie zgodnosci na zaciskach jednego urzadzenia (bieg `dynamika_rms`)."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    urzadzenie_ref: str = Field(min_length=1)
    bodziec: BodziecZaciskow
    impedancja_zastepcza_sieci: ImpedancjaZastepcza
    horyzont_s: float = Field(gt=0.0, le=_MAX_HORYZONT_DYNAMIKI_S)
    krok_wyjscia_s: float = Field(gt=0.0, le=_MAX_HORYZONT_DYNAMIKI_S)

    @model_validator(mode="after")
    def _spojnosc_badania(self) -> BadanieZgodnosci:
        if self.krok_wyjscia_s > self.horyzont_s:
            raise ValueError(
                f"BadanieZgodnosci: krok_wyjscia_s ({self.krok_wyjscia_s}) nie moze byc "
                f"wiekszy niz horyzont_s ({self.horyzont_s})."
            )
        bodziec = self.bodziec
        if isinstance(bodziec, ProfilNapieciaZaciskow):
            koniec = bodziec.t_koniec_s
        elif isinstance(bodziec, RampaCzestotliwosci):
            koniec = bodziec.t_koniec_s
        else:
            koniec = bodziec.t_s
        if koniec > self.horyzont_s:
            raise ValueError(
                f"BadanieZgodnosci: bodziec {bodziec.rodzaj!r} konczy sie w t={koniec} s, "
                f"poza horyzont_s ({self.horyzont_s})."
            )
        return self

    def tresc(self) -> dict[str, Any]:
        """Kanoniczna tresc badania (to, co wchodzi do hasha)."""
        return self.model_dump(mode="json")

    def hash(self) -> str:
        """SHA-256 kanonicznej tresci (klucze posortowane, bez spacji)."""
        tekst = json.dumps(self.tresc(), sort_keys=True, ensure_ascii=False, separators=(",", ":"))
        return hashlib.sha256(tekst.encode("utf-8")).hexdigest()


class OpcjeBadaniaError(ValueError):
    """Opcje biegu `dynamika_rms` nie opisuja jednego, poprawnego badania.

    API mapuje te bledy na 422 z kodem — to jest blad TRESCI zadania, nie konflikt
    stanu (409). Podklasy niosa wlasny kod z zamknietego zbioru `KODY_OPCJI_BADANIA`.
    """

    kod: str = ""

    def __init__(self, komunikat: str) -> None:
        super().__init__(f"{komunikat} (kod: {self.kod})")
        self.komunikat = komunikat


class RodzajBadaniaSprzecznyError(OpcjeBadaniaError):
    """Dwa rodzaje badania naraz, rodzaj nieznany albo rodzaj bez swojej tresci."""

    kod = KOD_RODZAJ_BADANIA_SPRZECZNY


class BadanieZgodnosciNiepoprawneError(OpcjeBadaniaError):
    """Tresc `badanie_zgodnosci` nie spelnia kontraktu `BadanieZgodnosci`."""

    kod = KOD_BADANIE_ZGODNOSCI_NIEPOPRAWNE


#: Zamkniety zbior kodow odmow opcji badania (pin w testach kontraktu).
KODY_OPCJI_BADANIA: tuple[str, ...] = (
    KOD_BADANIE_ZGODNOSCI_NIEPOPRAWNE,
    KOD_RODZAJ_BADANIA_SPRZECZNY,
)


def rodzaj_badania_z_opcji(options: dict[str, Any]) -> RodzajBadania:
    """Rodzaj badania biegu `dynamika_rms` z opcji — ODCZYT, bez zapisu domyslki.

    Brak pola `rodzaj_badania` = `scenariusz_sieciowy` (jedyny rodzaj istniejacy
    przed ta karta) — wartosc jest ZWRACANA, nie wpisywana do `options`, wiec opcje
    i `input_hash` biegow sprzed karty zostaja bajtowo te same.

    Odmowa nazwana (`RodzajBadaniaSprzecznyError`), gdy:
    * `rodzaj_badania` spoza zbioru `RODZAJE_BADANIA`;
    * opcje niosa JEDNOCZESNIE scenariusz sieciowy (`dynamika`) i badanie
      zgodnosci (`badanie_zgodnosci`);
    * zadeklarowany rodzaj jest sprzeczny z niesionym kluczem (np. rodzaj
      `badanie_zgodnosci` przy samym scenariuszu sieciowym).
    """
    surowy = options.get(KLUCZ_RODZAJU_BADANIA)
    ma_scenariusz = options.get(KLUCZ_SCENARIUSZA_SIECIOWEGO) is not None
    ma_badanie = options.get(KLUCZ_BADANIA_ZGODNOSCI) is not None
    if ma_scenariusz and ma_badanie:
        raise RodzajBadaniaSprzecznyError(
            "Bieg dynamiki czasowej niesie jednoczesnie scenariusz sieciowy "
            f"(`{KLUCZ_SCENARIUSZA_SIECIOWEGO}`) i badanie zgodnosci na zaciskach "
            f"(`{KLUCZ_BADANIA_ZGODNOSCI}`) — jeden bieg jest jednym rodzajem badania"
        )
    if surowy is None:
        rodzaj: str = RODZAJ_SCENARIUSZ_SIECIOWY
    elif surowy in RODZAJE_BADANIA:
        rodzaj = str(surowy)
    else:
        raise RodzajBadaniaSprzecznyError(
            f"Nieznany rodzaj badania {surowy!r} — dozwolone: {', '.join(RODZAJE_BADANIA)}"
        )
    if rodzaj == RODZAJ_SCENARIUSZ_SIECIOWY and ma_badanie:
        raise RodzajBadaniaSprzecznyError(
            "Rodzaj badania `scenariusz_sieciowy` (jawny albo przez brak pola) jest "
            f"sprzeczny z kluczem `{KLUCZ_BADANIA_ZGODNOSCI}` w opcjach biegu — ustaw "
            "`rodzaj_badania: badanie_zgodnosci`"
        )
    if rodzaj == RODZAJ_BADANIE_ZGODNOSCI and ma_scenariusz:
        raise RodzajBadaniaSprzecznyError(
            "Rodzaj badania `badanie_zgodnosci` jest sprzeczny ze scenariuszem sieciowym "
            f"(`{KLUCZ_SCENARIUSZA_SIECIOWEGO}`) w opcjach biegu"
        )
    if rodzaj == RODZAJ_BADANIE_ZGODNOSCI and not ma_badanie:
        raise RodzajBadaniaSprzecznyError(
            "Rodzaj badania `badanie_zgodnosci` wymaga tresci badania pod kluczem "
            f"`{KLUCZ_BADANIA_ZGODNOSCI}` (urzadzenie, bodziec, impedancja zastepcza sieci, "
            "horyzont, krok wyjscia)"
        )
    return rodzaj  # type: ignore[return-value]


def badanie_zgodnosci_z_opcji(options: dict[str, Any]) -> BadanieZgodnosci:
    """Tresc badania zgodnosci z opcji biegu — kontrakt albo odmowa nazwana.

    Wolane wylacznie, gdy `rodzaj_badania_z_opcji` zwrocil `badanie_zgodnosci`
    (wtedy klucz jest obecny). Blad walidacji kontraktu jest tlumaczony na
    `BadanieZgodnosciNiepoprawneError` z lista naruszen — nie surowy wyjatek
    biblioteki.
    """
    try:
        return BadanieZgodnosci.model_validate(options[KLUCZ_BADANIA_ZGODNOSCI])
    except ValidationError as exc:
        naruszenia = "; ".join(
            f"{'.'.join(str(czesc) for czesc in blad['loc'])}: {blad['msg']}"
            for blad in exc.errors()
        )
        raise BadanieZgodnosciNiepoprawneError(
            f"Badanie zgodnosci nie spelnia kontraktu: {naruszenia}"
        ) from exc


def waliduj_opcje_badania(options: dict[str, Any]) -> RodzajBadania:
    """Walidacja opcji biegu `dynamika_rms` przy TWORZENIU biegu (API: 422 nazwany).

    Ten sam predykat co wykonawca (`rodzaj_badania_z_opcji` +
    `badanie_zgodnosci_z_opcji`) — blad tresci zadania wychodzi przy utworzeniu
    biegu, nie dopiero przy wykonaniu.
    """
    rodzaj = rodzaj_badania_z_opcji(options)
    if rodzaj == RODZAJ_BADANIE_ZGODNOSCI:
        badanie_zgodnosci_z_opcji(options)
    return rodzaj


__all__ = [
    "KLUCZ_BADANIA_ZGODNOSCI",
    "KLUCZ_RODZAJU_BADANIA",
    "KLUCZ_SCENARIUSZA_SIECIOWEGO",
    "KODY_OPCJI_BADANIA",
    "KOD_BADANIE_ZGODNOSCI_NIEPOPRAWNE",
    "KOD_RODZAJ_BADANIA_SPRZECZNY",
    "RODZAJE_BADANIA",
    "RODZAJ_BADANIE_ZGODNOSCI",
    "RODZAJ_SCENARIUSZ_SIECIOWY",
    "BadanieZgodnosci",
    "BadanieZgodnosciNiepoprawneError",
    "BodziecZaciskow",
    "ImpedancjaZastepcza",
    "OpcjeBadaniaError",
    "PasmoWaznosciModeluHz",
    "ProfilNapieciaZaciskow",
    "PunktProfiluNapiecia",
    "RampaCzestotliwosci",
    "RodzajBadania",
    "RodzajBadaniaSprzecznyError",
    "SkokCzestotliwosci",
    "badanie_zgodnosci_z_opcji",
    "rodzaj_badania_z_opcji",
    "waliduj_opcje_badania",
]
