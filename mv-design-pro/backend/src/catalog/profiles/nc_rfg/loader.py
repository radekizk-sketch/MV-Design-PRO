"""Profil regulacyjny NC RfG — złożenie warstw normatywnych z proweniencją każdej wartości.

PLAN AB §6 (decyzje O-1…O-4, delegacja właściciela 2026-09-22) oraz §2.2–§2.3 (O-17, O-28,
O-30, O-31 po przeglądzie adwersarzowym 2026-09-23). Profil jest JEDYNYM źródłem kryteriów
(zero liczb kryterium w solverach) i podstaw wymagań oceny zgodności modułów typu A i B.

WARSTWY (katalogi ``warstwy/`` i ``operatorzy/``), w kolejności nagłówka profilu:

* ``NC_RFG`` (``nc_rfg.yaml``) — istnienie i stosowalność wymagań (typ modułu, technologia,
  prawo operatora do określenia wymagania) oraz GRANICE DOPUSZCZALNE parametrów;
* ``WOS`` (``wos.yaml``) — wartości krajowe wybrane w granicach NC RfG (dziś: progi klas);
* ``PROCEDURA_PTPIREE`` (``procedura_ptpiree.yaml``) — wersja procedury, kryteria akceptacji
  testów T01–T20 i program badań (zbiór scenariuszy);
* ``WIPWC`` (``wipwc.yaml``) — reguła pokrycia wymagań certyfikatem urządzenia, wersje wykazu
  certyfikowanych urządzeń i WSKAZANIE rejestru (snapshot wykazu w ``network_model/catalog``);
* ``OSD`` (``operatorzy/<id>.yaml``) — tożsamość operatora, dokument ruchowy, nadpisania,
  Bank Nastaw, wykonanie prawa do określenia wymagań;
* ``MAGAZYNY`` (``magazyny.yaml``) — wymagania krajowe dla magazynów energii (poza NC RfG);
* ``NIEUSTALONA`` (``zastane.yaml``) — parametry o nieustalonym pochodzeniu (jedna kopia
  dawnych pięciu), używane tylko tam, gdzie warstwy OSD i WOS nie niosą wartości.

PODSTAWA KAŻDEJ WARTOŚCI ma JEDEN typ w produkcie: ``werdykt.kontrakt.PodstawaWymagania``
(rodzaj, dokument, wydanie, jednostka redakcyjna, stan źródła, uwagi). Stan ``WSKAZANE`` albo
``ZWERYFIKOWANE`` wymaga wydania i jednostki redakcyjnej — ``_zrodlo`` przy braku którejś
obniża stan do ``NIEUSTALONE`` i nazywa brak w uwagach (przeetykietowanie nie podnosi stanu).
Stan źródła nie blokuje obliczeń, zakazuje przemilczenia (O-2′).

KLASYFIKACJA MODUŁU (``klasyfikacja_modulu``) jest krajowa — nie zależy od operatora — i jest
JEDYNYM miejscem progów w produkcie; ``klasyfikuj_modul`` zwraca wyłącznie jej pole ``modul``
(jedno ciało reguły). Interfejs użytkownika nie klasyfikuje.

Pakiet jest odczytem danych: zero fizyki, zero obliczeń poza porównaniem progów.
"""

from __future__ import annotations

import hashlib
import json
import math
from collections.abc import Iterable, Mapping
from datetime import date, datetime
from decimal import Decimal
from functools import cache
from pathlib import Path
from types import MappingProxyType
from typing import Any, Literal, Self, TypeAlias, get_args

import yaml
from network_model.pochodne.jednostki import kw_na_mw
from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, model_validator
from werdykt.kontrakt import Jednostka, PodstawaWymagania, RodzajPodstawy, StanZrodla, Tekst

PROFILE_DIR = Path(__file__).parent
_KATALOG_WARSTW = PROFILE_DIR / "warstwy"
_KATALOG_OPERATOROW = PROFILE_DIR / "operatorzy"
#: Korzeń kodu źródłowego backendu — rejestry wskazywane przez warstwy mają ścieżki względne.
_KATALOG_ZRODEL = PROFILE_DIR.parents[2]

#: Stan źródła — JEDNA definicja w produkcie (``werdykt.kontrakt.StanZrodla``).
StatusZrodla: TypeAlias = StanZrodla
#: Warstwy profilu w kolejności nagłówka profilu efektywnego.
WarstwaNormatywna = Literal[
    "NC_RFG", "WOS", "PROCEDURA_PTPIREE", "WIPWC", "OSD", "MAGAZYNY", "NIEUSTALONA"
]
TypModulu = Literal["A", "B", "C", "D"]
#: Typy modułów wyznaczane progiem mocy warstwy WOS (typ A zaczyna się od progu istotności).
TypModuluZProgiem = Literal["B", "C", "D"]
#: PPM — moduł parku energii; SPGM — moduł synchroniczny; MAGAZYN — magazyn energii (poza
#: rozporządzeniem 2016/631, wymagania w warstwie ``MAGAZYNY``).
Technologia = Literal["PPM", "SPGM", "MAGAZYN"]
RodzajOperatora = Literal["OSP", "OSD"]
#: Sposób wykazania wymagania dla konkretnego modułu (typ × technologia × certyfikat):
#: ``NIE_DOTYCZY`` — wymaganie nie stosuje się do typu/technologii (także klasa ``None``:
#: moduł poniżej progu istotności art. 5 ust. 2 lit. a, oraz magazyn energii wobec wymagań
#: NC RfG); ``CERTYFIKAT`` — reguła pokrycia WiPWC wskazuje certyfikat urządzenia dla tego
#: typu i moduł go ma (stan podstawy tej reguły niesie ``pokrycie_zrodlo``); ``TEST`` —
#: wymaganie wykazuje się testem procedury (lista ``testy``); ``BRAK_METODY`` — ani certyfikat,
#: ani test/symulacja narzędzia nie wykazują wymagania (wynik zgodności: BRAK DOWODU, O-3).
SposobWykazania = Literal["NIE_DOTYCZY", "CERTYFIKAT", "TEST", "BRAK_METODY"]
#: Słownik ZAMKNIĘTY pozycji Banku Nastaw operatora (plan AB O-17; kontrakt dla AB-1c/AB-5).
NastawaBanku = Literal[
    "u_min_pu",
    "u_min_czas_s",
    "u_max_pu",
    "u_max_czas_s",
    "f_min_hz",
    "f_min_czas_s",
    "f_max_hz",
    "f_max_czas_s",
    "rocof_hz_s",
    "rocof_czas_s",
    "przesuniecie_fazy_deg",
]

#: Rodzaj podstawy (kontrakt werdyktu §1) wyprowadzany z warstwy — jedno odwzorowanie.
#: Magazyny: wymagania krajowe pochodzą z IRiESD / warunków przyłączenia / ustawy → ``OSD``.
RODZAJ_WARSTWY: Mapping[WarstwaNormatywna, RodzajPodstawy] = MappingProxyType(
    {
        "NC_RFG": "ROZPORZADZENIE_UE",
        "WOS": "WOS",
        "PROCEDURA_PTPIREE": "PROCEDURA_PTPIREE",
        "WIPWC": "WIPWC",
        "OSD": "OSD",
        "MAGAZYNY": "OSD",
        "NIEUSTALONA": "NIEUSTALONA",
    }
)
KOLEJNOSC_WARSTW: tuple[WarstwaNormatywna, ...] = get_args(WarstwaNormatywna)
#: Jednostka każdej pozycji Banku Nastaw (zapis kontraktu werdyktu §1: wartość względna z bazą).
JEDNOSTKI_NASTAW: Mapping[NastawaBanku, str] = MappingProxyType(
    {
        "u_min_pu": "p.u. (U_n)",
        "u_min_czas_s": "s",
        "u_max_pu": "p.u. (U_n)",
        "u_max_czas_s": "s",
        "f_min_hz": "Hz",
        "f_min_czas_s": "s",
        "f_max_hz": "Hz",
        "f_max_czas_s": "s",
        "rocof_hz_s": "Hz/s",
        "rocof_czas_s": "s",
        "przesuniecie_fazy_deg": "deg",
    }
)
#: Technologie dopuszczalne w wymaganiach warstwy (magazyn poza NC RfG — plan AB O-28).
_TECHNOLOGIE_WARSTWY: dict[WarstwaNormatywna, frozenset[Technologia]] = {
    "NC_RFG": frozenset(("PPM", "SPGM")),
    "NIEUSTALONA": frozenset(("PPM", "SPGM")),
    "MAGAZYNY": frozenset(("MAGAZYN",)),
}
#: Klucze proweniencji grupy parametrów (obok wartości w sekcjach YAML).
_KLUCZE_PROWENIENCJI = ("jednostka_redakcyjna", "status", "uwagi_pl")
#: Kolejność stanów źródła od najmocniejszego — złożenie kilku źródeł dziedziczy NAJSŁABSZY.
_KOLEJNOSC_STANOW: tuple[StatusZrodla, ...] = get_args(StanZrodla)
_UWAGA_BEZ_DATY = "wersja dobrana bez daty obowiązywania (nieustalona)"


class _Zamrozony(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


def najslabszy_stan(stany: Iterable[StatusZrodla]) -> StatusZrodla:
    """Stan źródła złożenia kilku wartości = najsłabszy ze składników (pusty zbiór: NIEUSTALONE)."""
    lista = list(stany)
    if not lista:
        return "NIEUSTALONE"
    return max(lista, key=_KOLEJNOSC_STANOW.index)


def _uwagi(*czesci: str | None) -> str | None:
    niepuste = [czesc for czesc in czesci if czesc]
    return "; ".join(niepuste) if niepuste else None


def _kanon_testu(test_id: str) -> bool:
    return len(test_id) == 3 and test_id[0] == "T" and test_id[1:].isdigit()


def _stan_zbioru(
    nazwa: str,
    status: StatusZrodla,
    uwagi_pl: str | None,
    identyfikatory: list[str],
    stany_pozycji: list[StatusZrodla],
) -> None:
    """Spójność sekcji-zbioru (Bank Nastaw, program badań): stan nie mocniejszy niż pozycje.

    Pusty zbiór jest stanem ``NIEUSTALONE`` (brak danych to stan, nie zero), a stan
    ``NIEUSTALONE`` musi nazywać, czego brakuje.
    """
    if len(set(identyfikatory)) != len(identyfikatory):
        raise ValueError(f"{nazwa}: powtórzone pozycje {identyfikatory}.")
    if not identyfikatory and status != "NIEUSTALONE":
        raise ValueError(f"{nazwa}: pusty zbiór pozycji nie może mieć stanu {status}.")
    if najslabszy_stan([status, *stany_pozycji]) != status:
        raise ValueError(
            f"{nazwa}: stan {status} mocniejszy niż najsłabsza pozycja "
            f"({najslabszy_stan(stany_pozycji)})."
        )
    if status == "NIEUSTALONE" and not uwagi_pl:
        raise ValueError(f"{nazwa}: stan NIEUSTALONE wymaga uwag nazywających brak.")


# ---------------------------------------------------------------------------
# Proweniencja warstw
# ---------------------------------------------------------------------------


class DokumentWarstwy(_Zamrozony):
    """Dokument warstwy: tytuł, wydanie, stan potwierdzenia w repo, data obowiązywania.

    ``wydanie`` i ``obowiazuje_od`` są polami JAWNYMI w YAML (``null`` = nieustalone) —
    brak klucza jest błędem, żeby nieustalenie było decyzją, a nie przeoczeniem.
    """

    tytul: Tekst
    wydanie: Tekst | None
    status: StatusZrodla
    adres: Tekst | None = None
    obowiazuje_od: date | None
    uwagi_pl: Tekst | None = None

    @model_validator(mode="after")
    def _wydanie_przy_wskazaniu(self) -> Self:
        if self.status != "NIEUSTALONE" and self.wydanie is None:
            raise ValueError(
                f"Dokument „{self.tytul}” o stanie {self.status} bez wydania — bez niego "
                "stan dokumentu jest NIEUSTALONE."
            )
        return self


class WarstwaProfilu(DokumentWarstwy):
    """Jedna warstwa w złożeniu profilu efektywnego (nagłówek wyniku i dokumentów)."""

    warstwa: WarstwaNormatywna


class WersjaWykazuWipwc(_Zamrozony):
    """Wersja wykazu certyfikowanych urządzeń publikowana pod wydaniem WiPWC."""

    wersja: Tekst
    data_publikacji: date
    akceptowana_od: date | None
    akceptowana_do: date | None

    @model_validator(mode="after")
    def _okno(self) -> Self:
        if (
            self.akceptowana_od is not None
            and self.akceptowana_do is not None
            and self.akceptowana_do < self.akceptowana_od
        ):
            raise ValueError(
                f"Wykaz WiPWC {self.wersja}: okno akceptacji odwrócone "
                f"({self.akceptowana_od} > {self.akceptowana_do})."
            )
        return self


class RejestrCertyfikatow(_Zamrozony):
    """Wskazanie istniejącego rejestru certyfikowanych urządzeń (bez kopii rekordów)."""

    plik: Tekst
    schemat: Tekst


class WykazWipwc(_Zamrozony):
    """Warstwa WiPWC w profilu: wersje wykazu i wskazanie rejestru (reguła pokrycia żyje w
    wymaganiach — ``WymaganieRegulacyjne.certyfikat_pokrywa_typy`` i ``pokrycie_zrodlo``)."""

    wersje: tuple[WersjaWykazuWipwc, ...]
    rejestr: RejestrCertyfikatow


# ---------------------------------------------------------------------------
# Grupy parametrów profilu efektywnego
# ---------------------------------------------------------------------------


class NcRfgModuleType(_Zamrozony):
    """Klasa modułu wytwarzania energii (NC RfG art. 5, progi krajowe WOS).

    ``napiecie_ponizej_kv``: klasa dotyczy wyłącznie przyłączenia na napięciu OSTRO poniżej
    tej wartości (``None`` — bez ograniczenia napięciowego; tak jest dla typu D, który
    obejmuje każdy moduł przyłączony na napięciu co najmniej równym progowi napięciowemu).
    """

    id: TypModulu
    threshold_kw_min: float = Field(ge=0.0)
    threshold_kw_max: float | None = None
    napiecie_ponizej_kv: float | None = None
    description_pl: str


class KlasyfikacjaModulu(_Zamrozony):
    """Wynik klasyfikacji modułu z progami, podstawą i regułą, która zadecydowała.

    ``modul is None`` — moduł poniżej progu istotności (wymagania NC RfG nie mają
    zastosowania; wołający nazywa ten stan, nie przypisuje klasy). ``podstawa`` — podstawa
    progów WOS (dziś ``NIEUSTALONE``: klasyfikacja ważna, rekord niesie zastrzeżenie).
    """

    modul: TypModulu | None
    prog_min_kw: float
    progi_kw: dict[TypModuluZProgiem, float]
    napiecie_d_kv: float
    podstawa: PodstawaWymagania
    powod_pl: Tekst

    @model_validator(mode="after")
    def _komplet_progow(self) -> Self:
        if set(self.progi_kw) != set(get_args(TypModuluZProgiem)):
            raise ValueError(f"Klasyfikacja: niekompletne progi {sorted(self.progi_kw)}.")
        return self


class PasmoCzestotliwosci(_Zamrozony):
    f_min_hz: float
    f_max_hz: float
    czas_min_s: float | None = Field(default=None, gt=0.0)
    opis_pl: str


class ZakresyCzestotliwosci(_Zamrozony):
    """Minimalne czasy pracy bez odłączenia w pasmach częstotliwości (``None`` = bez limitu)."""

    pasma: tuple[PasmoCzestotliwosci, ...]
    zrodlo: PodstawaWymagania


class GraniceLfsmO(_Zamrozony):
    """Granice dopuszczalne progu i statyzmu LFSM-O (warstwa NC RfG)."""

    prog_hz_min: float
    prog_hz_max: float
    statyzm_pct_min: float
    statyzm_pct_max: float
    zrodlo: PodstawaWymagania


class ZaprzestanieGeneracji(_Zamrozony):
    czas_max_s: float = Field(gt=0.0)
    zrodlo: PodstawaWymagania


class NcRfgFrequencyResponse(_Zamrozony):
    steady_state_hz_min: float
    steady_state_hz_max: float
    transient_hz_min: float
    transient_hz_max: float
    pf_droop_percent: float = Field(gt=0.0)
    dead_band_hz: float = Field(ge=0.0)
    # Mianownik czasów odniesienia testów T05/T13 — zero byłoby dzieleniem przez zero.
    ramp_rate_pct_per_min: float = Field(gt=0.0)
    zrodlo: PodstawaWymagania


class NcRfgReactivePower(_Zamrozony):
    q_range_pct_pn_min: float
    q_range_pct_pn_max: float
    cos_phi_min: float
    voltage_control_modes: tuple[str, ...] = ()
    zrodlo: PodstawaWymagania


class NcRfgRideThroughPoint(_Zamrozony):
    time_s: float = Field(ge=0.0)
    voltage_pu: float = Field(ge=0.0, le=2.0)


class NcRfgVoltageLevels(_Zamrozony):
    """Obwiednie FRT — punkty (czas od początku zwarcia, napięcie w punkcie przyłączenia).

    Każda obwiednia ma zakres typów modułów i własną podstawę (jedna obwiednia na profil —
    decyzja O-4 / OD-33; dawne kopie w torze stabilności i w interfejsie są skasowane).
    """

    lvrt: tuple[NcRfgRideThroughPoint, ...]
    hvrt: tuple[NcRfgRideThroughPoint, ...]
    lvrt_typy: tuple[TypModulu, ...]
    hvrt_typy: tuple[TypModulu, ...]
    lvrt_zrodlo: PodstawaWymagania
    hvrt_zrodlo: PodstawaWymagania

    @model_validator(mode="after")
    def _czasy_rosnace(self) -> Self:
        for nazwa, punkty in (("LVRT", self.lvrt), ("HVRT", self.hvrt)):
            czasy = [p.time_s for p in punkty]
            if any(b <= a for a, b in zip(czasy, czasy[1:], strict=False)):
                raise ValueError(f"Obwiednia {nazwa}: czasy punktów muszą rosnąć ściśle ({czasy}).")
        return self


class NcRfgPRecovery(_Zamrozony):
    required_for_modules: tuple[TypModulu, ...]
    p_recovery_time_s: float = Field(gt=0.0)
    p_recovery_rate_pct_per_s: float = Field(gt=0.0)
    zrodlo: PodstawaWymagania


class KryteriaAkceptacji(_Zamrozony):
    """Kryteria akceptacji testów procedury PTPiREE (tolerancje i wartości odniesienia)."""

    tolerancja_statyzmu_pp: float = Field(ge=0.0)
    tolerancja_strefy_martwej_hz: float = Field(ge=0.0)
    min_udzial_rampy_odbudowy: float = Field(gt=0.0, le=1.0)
    krotnosc_czasu_ustalenia: float = Field(gt=0.0)
    min_czas_ustalenia_min: float = Field(gt=0.0)
    udzial_mocy_testu_regulacji: float = Field(gt=0.0, lt=1.0)
    krotnosc_czasu_komendy: float = Field(gt=0.0)
    min_czas_komendy_min: float = Field(gt=0.0)
    udzial_mocy_komendy_zmniejszenia: float = Field(ge=0.0, lt=1.0)
    k_frt_min: float = Field(gt=0.0)
    spadek_napiecia_testu_frt_pu: float = Field(gt=0.0, le=1.0)
    czestotliwosc_testu_nad_hz: float = Field(gt=0.0)
    czestotliwosc_testu_pod_hz: float = Field(gt=0.0)
    thd_u_max_pct: float = Field(gt=0.0)
    zrodlo: PodstawaWymagania


class PozycjaBankuNastaw(_Zamrozony):
    """Nastawa zabezpieczenia modułu wymagana przez operatora — WYŁĄCZNIE z podstawą."""

    id: NastawaBanku
    nazwa_pl: Tekst
    wartosc: FiniteFloat
    jednostka: Jednostka
    zrodlo: PodstawaWymagania

    @model_validator(mode="after")
    def _podstawa_i_jednostka(self) -> Self:
        oczekiwana = JEDNOSTKI_NASTAW[self.id]
        if self.jednostka != oczekiwana:
            raise ValueError(
                f"Nastawa {self.id}: jednostka {self.jednostka!r} ≠ {oczekiwana!r} (słownik "
                "zamknięty Banku Nastaw)."
            )
        if self.zrodlo.status == "NIEUSTALONE":
            raise ValueError(
                f"Nastawa {self.id}: wartość bez podstawy (stan NIEUSTALONE) — brak danych jest "
                "stanem sekcji, nie wartością."
            )
        return self


class BankNastaw(_Zamrozony):
    """Bank Nastaw warstwy operatora (plan AB O-17); pusta sekcja = ``NIEUSTALONE``."""

    status: StatusZrodla
    uwagi_pl: Tekst | None
    pozycje: tuple[PozycjaBankuNastaw, ...]

    @model_validator(mode="after")
    def _spojnosc(self) -> Self:
        _stan_zbioru(
            "Bank Nastaw",
            self.status,
            self.uwagi_pl,
            [p.id for p in self.pozycje],
            [p.zrodlo.status for p in self.pozycje],
        )
        return self


class ScenariuszBadania(_Zamrozony):
    """Scenariusz programu badań (np. głębokość i czas zapadu, poziom P i Q, punkt pracy)."""

    id: Tekst
    test_id: Tekst
    opis_pl: Tekst
    parametry: dict[str, FiniteFloat]
    jednostki: dict[str, Jednostka]
    zrodlo: PodstawaWymagania

    @model_validator(mode="after")
    def _spojnosc(self) -> Self:
        if not _kanon_testu(self.test_id):
            raise ValueError(
                f"Scenariusz {self.id}: identyfikator testu {self.test_id!r} spoza Tnn."
            )
        if not self.parametry:
            raise ValueError(f"Scenariusz {self.id}: brak parametrów.")
        if set(self.parametry) != set(self.jednostki):
            raise ValueError(
                f"Scenariusz {self.id}: klucze parametrów {sorted(self.parametry)} ≠ klucze "
                f"jednostek {sorted(self.jednostki)} (liczba bez jednostki)."
            )
        if self.zrodlo.status == "NIEUSTALONE":
            raise ValueError(
                f"Scenariusz {self.id}: scenariusz bez podstawy (stan NIEUSTALONE) — brak "
                "programu ramowego jest stanem programu badań, nie scenariuszem."
            )
        return self


class ProgramBadan(_Zamrozony):
    """Zbiór scenariuszy programu badań (plan AB O-30); pusty zbiór = ``NIEUSTALONE``."""

    status: StatusZrodla
    uwagi_pl: Tekst | None
    scenariusze: tuple[ScenariuszBadania, ...]

    @model_validator(mode="after")
    def _spojnosc(self) -> Self:
        _stan_zbioru(
            "Program badań",
            self.status,
            self.uwagi_pl,
            [s.id for s in self.scenariusze],
            [s.zrodlo.status for s in self.scenariusze],
        )
        return self


class WymaganieRegulacyjne(_Zamrozony):
    """Wymaganie przyłączeniowe: stosowalność, sposób wykazania, testy, podstawy.

    ``certyfikat_pokrywa_typy`` i ``pokrycie_zrodlo`` pochodzą z warstwy WiPWC.
    ``prawo_operatora`` — rozporządzenie przyznaje operatorowi prawo określenia wymagania;
    ``operator_skorzystal_z_prawa`` (warstwa OSD): ``None`` = nieustalone, ``True``/``False``
    wyłącznie z podstawą; ``wykonanie_prawa_zrodlo`` jest obecne dokładnie wtedy, gdy wymaganie
    niesie prawo operatora. Flagi interpretuje ocena wymagań, nie ten typ.
    """

    id: str = Field(min_length=1)
    nazwa_pl: str = Field(min_length=1)
    typy: tuple[TypModulu, ...]
    technologie: tuple[Technologia, ...]
    certyfikat_pokrywa_typy: tuple[TypModulu, ...]
    pokrycie_zrodlo: PodstawaWymagania
    testy: tuple[str, ...]
    prawo_operatora: bool
    operator_skorzystal_z_prawa: bool | None
    wykonanie_prawa_zrodlo: PodstawaWymagania | None
    zrodlo: PodstawaWymagania

    @model_validator(mode="after")
    def _spojnosc(self) -> Self:
        if not set(self.certyfikat_pokrywa_typy) <= set(self.typy):
            raise ValueError(
                f"Wymaganie {self.id}: certyfikat nie może pokrywać typu, którego wymaganie "
                f"nie dotyczy ({self.certyfikat_pokrywa_typy} ⊄ {self.typy})."
            )
        if self.pokrycie_zrodlo.rodzaj != "WIPWC":
            raise ValueError(
                f"Wymaganie {self.id}: reguła pokrycia certyfikatem pochodzi z warstwy WiPWC, "
                f"nie z {self.pokrycie_zrodlo.rodzaj}."
            )
        for test_id in self.testy:
            if not _kanon_testu(test_id):
                raise ValueError(f"Wymaganie {self.id}: identyfikator testu {test_id!r} spoza Tnn.")
        if not self.prawo_operatora and (
            self.operator_skorzystal_z_prawa is not None or self.wykonanie_prawa_zrodlo is not None
        ):
            raise ValueError(
                f"Wymaganie {self.id}: wykonanie prawa operatora dla wymagania, wobec którego "
                "operator nie ma prawa określenia."
            )
        if self.prawo_operatora and self.wykonanie_prawa_zrodlo is None:
            raise ValueError(
                f"Wymaganie {self.id}: prawo operatora bez podstawy stanu jego wykonania."
            )
        if (
            self.operator_skorzystal_z_prawa is not None
            and self.wykonanie_prawa_zrodlo is not None
            and self.wykonanie_prawa_zrodlo.status == "NIEUSTALONE"
        ):
            raise ValueError(
                f"Wymaganie {self.id}: flaga wykonania prawa operatora bez podstawy (stan "
                "NIEUSTALONE) — nieustalenie zapisuje się jako brak flagi."
            )
        return self

    def dotyczy(self, typ: str | None, technologia: str) -> bool:
        return typ is not None and typ in self.typy and technologia in self.technologie

    def sposob_wykazania(
        self, typ: str | None, technologia: str, certyfikat_zweryfikowany: bool
    ) -> SposobWykazania:
        """JEDYNY predykat „czy i czym moduł wykazuje to wymaganie" (reguła predykatów parami).

        Czyta go solver PTPiREE (czy test wykazujący wymaganie jest wymagany) i ocena
        zgodności per wymaganie (status wymagania) — dwa miejsca, jedno źródło prawdy. Pokrycie
        certyfikatem pochodzi z warstwy WiPWC; jego stan (``pokrycie_zrodlo``) konsumuje ocena
        wymagań — predykat go nie interpretuje.
        """
        if not self.dotyczy(typ, technologia):
            return "NIE_DOTYCZY"
        if certyfikat_zweryfikowany and typ in self.certyfikat_pokrywa_typy:
            return "CERTYFIKAT"
        if self.testy:
            return "TEST"
        return "BRAK_METODY"


# ---------------------------------------------------------------------------
# Profil efektywny
# ---------------------------------------------------------------------------


class NcRfgProfile(_Zamrozony):
    """Profil efektywny operatora — złożenie warstw normatywnych z proweniencją."""

    operator_id: str
    operator_name_pl: str
    rodzaj_operatora: RodzajOperatora
    voltage_level_pl: str
    last_revision: str
    wersja_profilu: str
    skrot_profilu: str
    warstwy: tuple[WarstwaProfilu, ...]
    czestotliwosc_znamionowa_hz: float = Field(gt=0.0)
    module_types: tuple[NcRfgModuleType, ...]
    klasyfikacja_zrodlo: PodstawaWymagania
    zakresy_czestotliwosci: ZakresyCzestotliwosci
    lfsm_o_granice: GraniceLfsmO
    zaprzestanie_generacji: ZaprzestanieGeneracji
    frequency_response: NcRfgFrequencyResponse
    reactive_power: NcRfgReactivePower
    voltage_levels: NcRfgVoltageLevels
    p_recovery_after_fault: NcRfgPRecovery
    kryteria_akceptacji: KryteriaAkceptacji
    program_badan: ProgramBadan
    wipwc: WykazWipwc
    bank_nastaw: BankNastaw
    wymagania: tuple[WymaganieRegulacyjne, ...]

    @model_validator(mode="after")
    def _kolejnosc_warstw(self) -> Self:
        if tuple(w.warstwa for w in self.warstwy) != KOLEJNOSC_WARSTW:
            raise ValueError(
                f"Profil {self.operator_id}: warstwy {[w.warstwa for w in self.warstwy]} ≠ "
                f"kolejność kanoniczna {list(KOLEJNOSC_WARSTW)}."
            )
        return self

    def wymaganie(self, identyfikator: str) -> WymaganieRegulacyjne:
        for wymaganie in self.wymagania:
            if wymaganie.id == identyfikator:
                return wymaganie
        raise KeyError(f"Profil {self.operator_id}: brak wymagania {identyfikator!r}.")

    def wymagania_testu(self, test_id: str) -> tuple[WymaganieRegulacyjne, ...]:
        """Wymagania wykazywane danym testem procedury (może być ich kilka albo żadne)."""
        return tuple(w for w in self.wymagania if test_id in w.testy)

    def wersja_warstwy(self, warstwa: WarstwaNormatywna, data: date | None) -> DokumentWarstwy:
        """Wersja dokumentu warstwy obowiązująca w dniu ``data`` (plan AB O-31).

        Profil niesie dziś JEDNĄ wersję na warstwę — funkcja ją zwraca; wersje kolejnych
        wydań dojdą z dokumentami (zero fabrykowanych dat). Gdy ``data`` jest podana:
        nieustalone ``obowiazuje_od`` → uwaga „wersja dobrana bez daty obowiązywania
        (nieustalona)"; data wcześniejsza niż ``obowiazuje_od`` → stan ``NIEUSTALONE`` z uwagą
        (jedyna wersja w repozytorium jeszcze wtedy nie obowiązywała, właściwa jest nieznana).
        Warstwa OSD to dokument operatora tego profilu.
        """
        if isinstance(data, datetime):
            raise TypeError("Resolver wersji warstw przyjmuje datę (date), nie znacznik czasu.")
        for pozycja in self.warstwy:
            if pozycja.warstwa == warstwa:
                break
        else:
            raise KeyError(f"Profil {self.operator_id}: brak warstwy {warstwa!r}.")
        dane = pozycja.model_dump(exclude={"warstwa"})
        if data is None:
            return DokumentWarstwy.model_validate(dane)
        if pozycja.obowiazuje_od is None:
            dane["uwagi_pl"] = _uwagi(pozycja.uwagi_pl, _UWAGA_BEZ_DATY)
        elif data < pozycja.obowiazuje_od:
            dane["status"] = "NIEUSTALONE"
            dane["uwagi_pl"] = _uwagi(
                pozycja.uwagi_pl,
                f"data {data.isoformat()} poprzedza obowiązywanie jedynej wersji warstwy w "
                f"repozytorium (od {pozycja.obowiazuje_od.isoformat()}) — wersja właściwa dla "
                "tej daty nieustalona",
            )
        return DokumentWarstwy.model_validate(dane)


# ---------------------------------------------------------------------------
# Odczyt warstw
# ---------------------------------------------------------------------------


def _czytaj_yaml(sciezka: Path) -> dict[str, Any]:
    dane = yaml.safe_load(sciezka.read_text(encoding="utf-8"))
    if not isinstance(dane, dict):
        raise ValueError(f"Plik warstwy {sciezka.name} nie jest mapą YAML.")
    return dane


def _czytaj_warstwe(sciezka: Path, warstwa: WarstwaNormatywna) -> dict[str, Any]:
    dane = _czytaj_yaml(sciezka)
    if dane.get("warstwa") != warstwa:
        raise ValueError(
            f"Plik {sciezka.name}: deklaruje warstwę {dane.get('warstwa')!r}, oczekiwana {warstwa}."
        )
    return dane


def _dokument(dane: dict[str, Any], plik: str) -> DokumentWarstwy:
    if "dokument" not in dane:
        raise ValueError(f"Warstwa {plik}: brak sekcji `dokument` (proweniencja jest wymagana).")
    return DokumentWarstwy.model_validate(dane["dokument"])


def _zrodlo(
    warstwa: WarstwaNormatywna,
    dokument: DokumentWarstwy,
    *,
    jednostka_redakcyjna: str | None = None,
    status: StatusZrodla | None = None,
    uwagi_pl: str | None = None,
) -> PodstawaWymagania:
    """Podstawa wartości warstwy (kontrakt werdyktu §1).

    Stan nie może być MOCNIEJSZY niż stan całego dokumentu (dokument wskazany ma wydanie —
    pilnuje ``DokumentWarstwy``), a bez jednostki redakcyjnej jest ``NIEUSTALONE`` (nigdy
    dopisana jednostka). Gdy brak jednostki OBNIŻA stan (dokument i sekcja deklarowały
    ``WSKAZANE``/``ZWERYFIKOWANE``), uwaga nazywa brak; stan zadeklarowany już jako
    ``NIEUSTALONE`` tłumaczą uwagi sekcji albo dokumentu. Uwagi dokumentu warstwy (np.
    pochodzenie rodzaju ``OSD`` warstwy magazynów, brak dokumentu operatora w repozytorium)
    trafiają do każdej podstawy tej warstwy.
    """
    if status is not None and status not in _KOLEJNOSC_STANOW:
        raise ValueError(f"Stan źródła {status!r} spoza słownika {list(_KOLEJNOSC_STANOW)}.")
    stan = dokument.status if status is None else najslabszy_stan([status, dokument.status])
    uwaga_braku = None
    if jednostka_redakcyjna is None and stan != "NIEUSTALONE":
        stan = "NIEUSTALONE"
        uwaga_braku = "brak jednostki redakcyjnej — stan źródła obniżony do NIEUSTALONE"
    return PodstawaWymagania(
        rodzaj=RODZAJ_WARSTWY[warstwa],
        dokument=dokument.tytul,
        wydanie=dokument.wydanie,
        jednostka_redakcyjna=jednostka_redakcyjna,
        status=stan,
        uwagi_pl=_uwagi(uwagi_pl, dokument.uwagi_pl, uwaga_braku),
    )


def _zrodlo_sekcji(
    warstwa: WarstwaNormatywna,
    dokument: DokumentWarstwy,
    sekcja: dict[str, Any],
    *,
    uwagi_pl: str | None = None,
) -> PodstawaWymagania:
    """Podstawa sekcji YAML z jej kluczy proweniencji (``jednostka_redakcyjna``, ``status``,
    ``uwagi_pl``) — jedna droga dla wszystkich warstw."""
    return _zrodlo(
        warstwa,
        dokument,
        jednostka_redakcyjna=sekcja.get("jednostka_redakcyjna"),
        status=sekcja.get("status"),
        uwagi_pl=_uwagi(uwagi_pl, sekcja.get("uwagi_pl")),
    )


def _bez_proweniencji(sekcja: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in sekcja.items() if k not in _KLUCZE_PROWENIENCJI}


@cache
def _warstwy_wspolne(katalog_warstw: Path) -> dict[str, dict[str, Any]]:
    """Warstwy niezależne od operatora — odczyt jeden raz na katalog (dane tylko do odczytu)."""
    return {
        "nc_rfg": _czytaj_warstwe(katalog_warstw / "nc_rfg.yaml", "NC_RFG"),
        "wos": _czytaj_warstwe(katalog_warstw / "wos.yaml", "WOS"),
        "procedura": _czytaj_warstwe(
            katalog_warstw / "procedura_ptpiree.yaml", "PROCEDURA_PTPIREE"
        ),
        "wipwc": _czytaj_warstwe(katalog_warstw / "wipwc.yaml", "WIPWC"),
        "magazyny": _czytaj_warstwe(katalog_warstw / "magazyny.yaml", "MAGAZYNY"),
        "zastane": _czytaj_warstwe(katalog_warstw / "zastane.yaml", "NIEUSTALONA"),
    }


# ---------------------------------------------------------------------------
# Klasyfikacja modułu
# ---------------------------------------------------------------------------


class _ProgiKlas(_Zamrozony):
    a_min_kw: float
    b_od_kw: float
    c_od_kw: float
    d_od_kw: float
    napiecie_d_kv: float
    jednostka_progu_istotnosci: Tekst
    jednostka_reguly_napieciowej: Tekst
    podstawa: PodstawaWymagania


@cache
def _progi_klas(katalog_warstw: Path) -> _ProgiKlas:
    """Progi krajowe (WOS) sprawdzone względem granic NC RfG — JEDYNE źródło progów."""
    warstwy = _warstwy_wspolne(katalog_warstw)
    nc = warstwy["nc_rfg"]
    wos = warstwy["wos"]
    dok_nc = _dokument(nc, "nc_rfg.yaml")
    dok_wos = _dokument(wos, "wos.yaml")
    granice = nc["granice_progow_klas"]
    progi = wos["progi_klas"]
    podstawa_granic = _zrodlo_sekcji("NC_RFG", dok_nc, granice)
    a_min = float(granice["a_min_kw"])
    b_od, c_od, d_od = (float(progi["b_od_kw"]), float(progi["c_od_kw"]), float(progi["d_od_kw"]))
    if not a_min < b_od < c_od < d_od:
        raise ValueError(
            f"Progi klas WOS niespójne: wymagane {a_min} < B {b_od} < C {c_od} < D {d_od} kW."
        )
    for nazwa, wartosc, granica in (
        ("B", b_od, float(granice["b_prog_max_kw"])),
        ("C", c_od, float(granice["c_prog_max_kw"])),
        ("D", d_od, float(granice["d_prog_max_kw"])),
    ):
        if wartosc > granica:
            raise ValueError(
                f"Próg klasy {nazwa} WOS ({wartosc} kW) przekracza maksimum NC RfG ({granica} kW, "
                f"{podstawa_granic.jednostka_redakcyjna})."
            )
    return _ProgiKlas(
        a_min_kw=a_min,
        b_od_kw=b_od,
        c_od_kw=c_od,
        d_od_kw=d_od,
        napiecie_d_kv=float(granice["napiecie_d_kv"]),
        jednostka_progu_istotnosci=granice["jednostka_progu_istotnosci"],
        jednostka_reguly_napieciowej=granice["jednostka_reguly_napieciowej"],
        podstawa=_zrodlo_sekcji("WOS", dok_wos, progi),
    )


def _liczba(wartosc: float) -> str:
    """Liczba po polsku w zapisie DOKŁADNYM (najkrótszy zapis odwracalny, przecinek dziesiętny).

    Powód klasyfikacji porównuje wartość z progiem — zaokrąglenie kłamałoby na granicy
    (moc tuż poniżej progu zapisana jako równa progowi).
    """
    tekst = format(Decimal(repr(wartosc + 0.0)).normalize(), "f")
    return tekst.replace(".", ",")


def _klasyfikacja(progi: _ProgiKlas, p_max_kw: float, napiecie_kv: float) -> KlasyfikacjaModulu:
    for nazwa, wartosc in (("p_max_kw", p_max_kw), ("napiecie_kv", napiecie_kv)):
        if not math.isfinite(wartosc) or wartosc < 0.0:
            raise ValueError(
                f"Klasyfikacja modułu: {nazwa} = {wartosc!r} — wymagana liczba skończona ≥ 0."
            )
    p, u = _liczba(p_max_kw), _liczba(napiecie_kv)
    a, b, c, d = (_liczba(x) for x in (progi.a_min_kw, progi.b_od_kw, progi.c_od_kw, progi.d_od_kw))
    u_d = _liczba(progi.napiecie_d_kv)
    przy_napieciu = f"przy napięciu przyłączenia {u} kV < {u_d} kV"
    modul: TypModulu | None
    if napiecie_kv >= progi.napiecie_d_kv:
        modul = "D"
        powod = (
            f"napięcie przyłączenia {u} kV ≥ {u_d} kV → typ D niezależnie od mocy "
            f"(NC RfG {progi.jednostka_reguly_napieciowej})"
        )
    elif p_max_kw >= progi.d_od_kw:
        modul = "D"
        powod = f"moc {p} kW ≥ {d} kW (próg typu D wg WOS) {przy_napieciu} → typ D"
    elif p_max_kw >= progi.c_od_kw:
        modul = "C"
        powod = (
            f"moc {p} kW w przedziale [{c}; {d}) kW (progi typów C i D wg WOS) "
            f"{przy_napieciu} → typ C"
        )
    elif p_max_kw >= progi.b_od_kw:
        modul = "B"
        powod = (
            f"moc {p} kW w przedziale [{b}; {c}) kW (progi typów B i C wg WOS) "
            f"{przy_napieciu} → typ B"
        )
    elif p_max_kw >= progi.a_min_kw:
        modul = "A"
        powod = (
            f"moc {p} kW w przedziale [{a}; {b}) kW (próg istotności NC RfG "
            f"{progi.jednostka_progu_istotnosci} i próg typu B wg WOS) {przy_napieciu} → typ A"
        )
    else:
        modul = None
        powod = (
            f"moc {p} kW < {a} kW → moduł poniżej progu istotności "
            f"{progi.jednostka_progu_istotnosci} — wymagania NC RfG nie mają zastosowania"
        )
    return KlasyfikacjaModulu(
        modul=modul,
        prog_min_kw=progi.a_min_kw,
        progi_kw={"B": progi.b_od_kw, "C": progi.c_od_kw, "D": progi.d_od_kw},
        napiecie_d_kv=progi.napiecie_d_kv,
        podstawa=progi.podstawa,
        powod_pl=powod,
    )


def klasyfikacja_modulu(p_max_kw: float, napiecie_kv: float) -> KlasyfikacjaModulu:
    """Klasa modułu wytwarzania energii z progami, podstawą progów WOS i powodem.

    Reguła (dane z warstw NC RfG i WOS, żadnej liczby w kodzie):

    * napięcie przyłączenia ≥ progu napięciowego NC RfG → typ D niezależnie od mocy,
    * moc ≥ próg D → D; ≥ próg C → C; ≥ próg B → B; ≥ próg istotności → A,
    * moc poniżej progu istotności (art. 5 ust. 2 lit. a) → ``modul is None``: moduł poniżej
      progu istotności — wymagania NC RfG nie mają zastosowania (wołający nazywa ten stan).

    JEDYNE miejsce progów klas w produkcie (solver PTPiREE, API, walidacja generatora,
    dokument studium). Interfejs użytkownika nie klasyfikuje.
    """
    return _klasyfikacja(_progi_klas(_KATALOG_WARSTW), p_max_kw, napiecie_kv)


def klasyfikuj_modul(p_max_kw: float, napiecie_kv: float) -> TypModulu | None:
    """Sama klasa modułu — pole ``modul`` z ``klasyfikacja_modulu`` (jedno ciało reguły)."""
    return klasyfikacja_modulu(p_max_kw, napiecie_kv).modul


def prog_minimalny_modulu_kw() -> float:
    """Próg istotności modułu (dolny próg typu A z warstwy NC RfG) — do komunikatów o module
    poniżej progu istotności art. 5 ust. 2 lit. a (wymagania NC RfG nie mają zastosowania)."""
    return _progi_klas(_KATALOG_WARSTW).a_min_kw


def _module_types(progi: _ProgiKlas) -> tuple[NcRfgModuleType, ...]:
    napiecie = progi.napiecie_d_kv
    return (
        NcRfgModuleType(
            id="A",
            threshold_kw_min=progi.a_min_kw,
            threshold_kw_max=progi.b_od_kw,
            napiecie_ponizej_kv=napiecie,
            description_pl="Moduły typu A (mikroinstalacje i małe instalacje, zwykle nN)",
        ),
        NcRfgModuleType(
            id="B",
            threshold_kw_min=progi.b_od_kw,
            threshold_kw_max=progi.c_od_kw,
            napiecie_ponizej_kv=napiecie,
            description_pl="Moduły typu B (instalacje przyłączane zwykle do sieci SN)",
        ),
        NcRfgModuleType(
            id="C",
            threshold_kw_min=progi.c_od_kw,
            threshold_kw_max=progi.d_od_kw,
            napiecie_ponizej_kv=napiecie,
            description_pl="Moduły typu C (poza zakresem produktu)",
        ),
        NcRfgModuleType(
            id="D",
            threshold_kw_min=progi.d_od_kw,
            threshold_kw_max=None,
            napiecie_ponizej_kv=None,
            description_pl=(
                f"Moduły typu D (≥ {_liczba(kw_na_mw(progi.d_od_kw))} MW albo przyłączenie "
                f"≥ {_liczba(napiecie)} kV; poza zakresem produktu)"
            ),
        ),
    )


# ---------------------------------------------------------------------------
# Złożenie profilu
# ---------------------------------------------------------------------------


def _parametr(
    nazwa: str,
    osd: dict[str, Any],
    dok_osd: DokumentWarstwy,
    wos: dict[str, Any],
    dok_wos: DokumentWarstwy,
    zastane: dict[str, Any],
    dok_zastane: DokumentWarstwy,
) -> tuple[dict[str, Any], PodstawaWymagania]:
    """Wartość grupy parametrów wg pierwszeństwa OSD > WOS > zastane, z podstawą warstwy."""
    kandydaci: tuple[tuple[WarstwaNormatywna, dict[str, Any], DokumentWarstwy, str | None], ...] = (
        ("OSD", osd.get("nadpisania") or {}, dok_osd, "nadpisanie operatora"),
        ("WOS", wos.get("parametry") or {}, dok_wos, None),
    )
    for warstwa, grupy, dokument, uwaga in kandydaci:
        if nazwa in grupy:
            grupa = dict(grupy[nazwa])
            return _bez_proweniencji(grupa), _zrodlo_sekcji(
                warstwa, dokument, grupa, uwagi_pl=uwaga
            )
    parametry = zastane["parametry"]
    if nazwa not in parametry:
        raise ValueError(f"Profil: brak grupy parametrów {nazwa!r} w żadnej warstwie.")
    grupa = dict(parametry[nazwa])
    return _bez_proweniencji(grupa), _zrodlo_sekcji("NIEUSTALONA", dok_zastane, grupa)


def _wykaz_wipwc(wipwc: dict[str, Any], dok_wipwc: DokumentWarstwy) -> WykazWipwc:
    """Wersje wykazu i wskazanie rejestru — rejestr musi istnieć, kopia rekordów jest zbędna."""
    wykaz = WykazWipwc(
        wersje=tuple(WersjaWykazuWipwc.model_validate(w) for w in wipwc["wersje"]),
        rejestr=RejestrCertyfikatow.model_validate(wipwc["rejestr"]),
    )
    wersje = {w.wersja: w for w in wykaz.wersje}
    if len(wersje) != len(wykaz.wersje):
        raise ValueError(
            f"Warstwa WiPWC: powtórzone wersje wykazu {[w.wersja for w in wykaz.wersje]}."
        )
    biezaca = wersje.get(dok_wipwc.wydanie or "")
    if biezaca is None:
        raise ValueError(
            f"Warstwa WiPWC: wydanie dokumentu {dok_wipwc.wydanie!r} spoza wersji wykazu "
            f"{sorted(wersje)}."
        )
    if dok_wipwc.obowiazuje_od != biezaca.akceptowana_od:
        raise ValueError(
            f"Warstwa WiPWC: obowiązywanie dokumentu ({dok_wipwc.obowiazuje_od}) ≠ początek "
            f"akceptacji wykazu {biezaca.wersja} ({biezaca.akceptowana_od})."
        )
    if not (_KATALOG_ZRODEL / wykaz.rejestr.plik).is_file():
        raise ValueError(f"Warstwa WiPWC: wskazany rejestr {wykaz.rejestr.plik!r} nie istnieje.")
    return wykaz


class _WpisWykonaniaPrawa(_Zamrozony):
    skorzystal: bool
    jednostka_redakcyjna: Tekst
    status: StatusZrodla | None = None
    uwagi_pl: Tekst | None = None


def _wymagania(
    warstwy: dict[str, dict[str, Any]],
    osd: dict[str, Any],
    dok_osd: DokumentWarstwy,
) -> tuple[WymaganieRegulacyjne, ...]:
    """Katalog wymagań: warstwy NC RfG, zastana i magazynów; pokrycie z WiPWC; prawo z OSD."""
    wipwc = warstwy["wipwc"]
    pokrycie = wipwc["pokrycie_certyfikatem"]
    pokrycie_typy: dict[str, list[TypModulu]] = dict(pokrycie.get("wymagania") or {})
    pokrycie_zrodlo = _zrodlo_sekcji("WIPWC", _dokument(wipwc, "wipwc.yaml"), pokrycie)
    wykonanie = osd["wykonanie_prawa"]
    wpisy_prawa = {
        klucz: _WpisWykonaniaPrawa.model_validate(wpis)
        for klucz, wpis in (wykonanie.get("wymagania") or {}).items()
    }
    zrodlo_nieustalonego_prawa = _zrodlo_sekcji("OSD", dok_osd, wykonanie)

    wynik: list[WymaganieRegulacyjne] = []
    zrodla_wymagan: tuple[tuple[str, WarstwaNormatywna], ...] = (
        ("nc_rfg", "NC_RFG"),
        ("zastane", "NIEUSTALONA"),
        ("magazyny", "MAGAZYNY"),
    )
    for klucz, warstwa in zrodla_wymagan:
        dane = warstwy[klucz]
        dokument = _dokument(dane, f"{klucz}.yaml")
        for wpis in dane.get("wymagania") or []:
            identyfikator = wpis["id"]
            poza_warstwa = set(wpis["technologie"]) - _TECHNOLOGIE_WARSTWY[warstwa]
            if poza_warstwa:
                raise ValueError(
                    f"Wymaganie {identyfikator} warstwy {warstwa}: technologie "
                    f"{sorted(poza_warstwa)} spoza zakresu warstwy "
                    f"{sorted(_TECHNOLOGIE_WARSTWY[warstwa])} (magazyn energii — warstwa "
                    "MAGAZYNY, plan AB O-28)."
                )
            prawo = wpis.get("prawo_operatora", False)
            if not isinstance(prawo, bool):
                raise ValueError(
                    f"Wymaganie {identyfikator}: `prawo_operatora` musi być wartością logiczną "
                    f"(jest {prawo!r})."
                )
            skorzystal: bool | None = None
            zrodlo_prawa: PodstawaWymagania | None = None
            if prawo:
                wpis_prawa = wpisy_prawa.get(identyfikator)
                if wpis_prawa is None:
                    zrodlo_prawa = zrodlo_nieustalonego_prawa
                else:
                    skorzystal = wpis_prawa.skorzystal
                    zrodlo_prawa = _zrodlo(
                        "OSD",
                        dok_osd,
                        jednostka_redakcyjna=wpis_prawa.jednostka_redakcyjna,
                        status=wpis_prawa.status,
                        uwagi_pl=wpis_prawa.uwagi_pl,
                    )
            wynik.append(
                WymaganieRegulacyjne(
                    id=identyfikator,
                    nazwa_pl=wpis["nazwa_pl"],
                    typy=tuple(wpis["typy"]),
                    technologie=tuple(wpis["technologie"]),
                    certyfikat_pokrywa_typy=tuple(pokrycie_typy.get(identyfikator, ())),
                    pokrycie_zrodlo=pokrycie_zrodlo,
                    testy=tuple(wpis["testy"]),
                    prawo_operatora=prawo,
                    operator_skorzystal_z_prawa=skorzystal,
                    wykonanie_prawa_zrodlo=zrodlo_prawa,
                    zrodlo=_zrodlo_sekcji(warstwa, dokument, wpis),
                )
            )
    identyfikatory = [w.id for w in wynik]
    if len(identyfikatory) != len(set(identyfikatory)):
        raise ValueError(f"Katalog wymagań: zdublowane identyfikatory {identyfikatory}.")
    nieznane_pokrycie = sorted(set(pokrycie_typy) - set(identyfikatory))
    if nieznane_pokrycie:
        raise ValueError(
            f"Warstwa WiPWC: pokrycie certyfikatem dla wymagań spoza katalogu {nieznane_pokrycie}."
        )
    z_prawem = {w.id for w in wynik if w.prawo_operatora}
    bez_prawa = sorted(set(wpisy_prawa) - z_prawem)
    if bez_prawa:
        raise ValueError(
            f"Warstwa OSD {osd.get('operator_id')!r}: wykonanie prawa dla wymagań {bez_prawa}, "
            "wobec których rozporządzenie nie przyznaje operatorowi prawa określenia (albo "
            "spoza katalogu)."
        )
    return tuple(wynik)


def _program_badan(
    procedura: dict[str, Any],
    dok_proc: DokumentWarstwy,
    wymagania: tuple[WymaganieRegulacyjne, ...],
) -> ProgramBadan:
    if "program_badan" not in procedura:
        raise ValueError("Warstwa procedury PTPiREE: brak sekcji `program_badan`.")
    sekcja = procedura["program_badan"]
    testy_katalogu = {t for w in wymagania for t in w.testy}
    scenariusze: list[ScenariuszBadania] = []
    for wpis in sekcja.get("scenariusze") or []:
        scenariusz = ScenariuszBadania(
            id=wpis["id"],
            test_id=wpis["test_id"],
            opis_pl=wpis["opis_pl"],
            parametry=wpis["parametry"],
            jednostki=wpis["jednostki"],
            zrodlo=_zrodlo_sekcji("PROCEDURA_PTPIREE", dok_proc, wpis),
        )
        if scenariusz.test_id not in testy_katalogu:
            raise ValueError(
                f"Scenariusz {scenariusz.id}: test {scenariusz.test_id} nie wykazuje żadnego "
                "wymagania katalogu."
            )
        scenariusze.append(scenariusz)
    return ProgramBadan(
        status=sekcja["status"], uwagi_pl=sekcja.get("uwagi_pl"), scenariusze=tuple(scenariusze)
    )


def _bank_nastaw(osd: dict[str, Any], dok_osd: DokumentWarstwy) -> BankNastaw:
    sekcja = osd["bank_nastaw"]
    return BankNastaw(
        status=sekcja["status"],
        uwagi_pl=sekcja.get("uwagi_pl"),
        pozycje=tuple(
            PozycjaBankuNastaw(
                id=wpis["id"],
                nazwa_pl=wpis["nazwa_pl"],
                wartosc=wpis["wartosc"],
                jednostka=wpis["jednostka"],
                zrodlo=_zrodlo_sekcji("OSD", dok_osd, wpis),
            )
            for wpis in sekcja.get("pozycje") or []
        ),
    )


def _skrot(dane: dict[str, Any]) -> str:
    kanon = json.dumps(dane, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(kanon.encode("utf-8")).hexdigest()[:16]


def _operatorzy(katalog_operatorow: Path) -> list[str]:
    return sorted(p.stem for p in katalog_operatorow.glob("*.yaml"))


def _zloz_profil(
    operator_id: str,
    katalog_warstw: Path = _KATALOG_WARSTW,
    katalog_operatorow: Path = _KATALOG_OPERATOROW,
) -> NcRfgProfile:
    sciezka = katalog_operatorow / f"{operator_id}.yaml"
    if not sciezka.exists():
        dostepne = ", ".join(_operatorzy(katalog_operatorow))
        raise FileNotFoundError(
            f"Profil NC RfG dla operatora '{operator_id}' nie istnieje. "
            f"Obsługiwane operatory: {dostepne}"
        )
    osd = _czytaj_warstwe(sciezka, "OSD")
    if osd.get("operator_id") != operator_id:
        raise ValueError(
            f"Plik {sciezka.name}: operator_id {osd.get('operator_id')!r} ≠ nazwa pliku."
        )
    for sekcja in ("bank_nastaw", "wykonanie_prawa"):
        if sekcja not in osd:
            raise ValueError(f"Plik {sciezka.name}: brak obowiązkowej sekcji `{sekcja}`.")
    warstwy = _warstwy_wspolne(katalog_warstw)
    nc, wos, procedura, wipwc, magazyny, zastane = (
        warstwy["nc_rfg"],
        warstwy["wos"],
        warstwy["procedura"],
        warstwy["wipwc"],
        warstwy["magazyny"],
        warstwy["zastane"],
    )
    dokumenty: dict[WarstwaNormatywna, DokumentWarstwy] = {
        "NC_RFG": _dokument(nc, "nc_rfg.yaml"),
        "WOS": _dokument(wos, "wos.yaml"),
        "PROCEDURA_PTPIREE": _dokument(procedura, "procedura_ptpiree.yaml"),
        "WIPWC": _dokument(wipwc, "wipwc.yaml"),
        "OSD": _dokument(osd, sciezka.name),
        "MAGAZYNY": _dokument(magazyny, "magazyny.yaml"),
        "NIEUSTALONA": _dokument(zastane, "zastane.yaml"),
    }
    dok_nc, dok_wos, dok_proc = (
        dokumenty["NC_RFG"],
        dokumenty["WOS"],
        dokumenty["PROCEDURA_PTPIREE"],
    )
    dok_osd, dok_zast = dokumenty["OSD"], dokumenty["NIEUSTALONA"]
    grupy_znane = set(zastane["parametry"])
    for opis, grupy in (
        (f"nadpisania operatora ({sciezka.name})", osd.get("nadpisania") or {}),
        ("parametry WOS (wos.yaml)", wos.get("parametry") or {}),
    ):
        nieznane = sorted(set(grupy) - grupy_znane)
        if nieznane:
            raise ValueError(f"Profil {operator_id}: {opis} — nieznane grupy {nieznane}.")

    def parametr(nazwa: str) -> tuple[dict[str, Any], PodstawaWymagania]:
        return _parametr(nazwa, osd, dok_osd, wos, dok_wos, zastane, dok_zast)

    czestotliwosc, zr_czest = parametr("frequency_response")
    bierna, zr_bierna = parametr("reactive_power")
    lvrt, zr_lvrt = parametr("lvrt")
    hvrt, zr_hvrt = parametr("hvrt")
    odbudowa, zr_odb = parametr("p_recovery_after_fault")

    granice_lfsm = nc["lfsm_o_granice"]
    lfsm_o = GraniceLfsmO(
        prog_hz_min=float(granice_lfsm["prog_hz_min"]),
        prog_hz_max=float(granice_lfsm["prog_hz_max"]),
        statyzm_pct_min=float(granice_lfsm["statyzm_pct_min"]),
        statyzm_pct_max=float(granice_lfsm["statyzm_pct_max"]),
        zrodlo=_zrodlo_sekcji("NC_RFG", dok_nc, granice_lfsm),
    )
    f_n = float(nc["czestotliwosc_znamionowa_hz"])
    odpowiedz_f = NcRfgFrequencyResponse(**czestotliwosc, zrodlo=zr_czest)
    prog_lfsm = f_n + odpowiedz_f.dead_band_hz
    if not lfsm_o.prog_hz_min <= prog_lfsm <= lfsm_o.prog_hz_max:
        raise ValueError(
            f"Profil {operator_id}: próg LFSM-O {prog_lfsm:.3f} Hz poza granicami NC RfG "
            f"[{lfsm_o.prog_hz_min}, {lfsm_o.prog_hz_max}] Hz."
        )
    if not lfsm_o.statyzm_pct_min <= odpowiedz_f.pf_droop_percent <= lfsm_o.statyzm_pct_max:
        raise ValueError(
            f"Profil {operator_id}: statyzm LFSM-O {odpowiedz_f.pf_droop_percent} % poza "
            f"granicami NC RfG [{lfsm_o.statyzm_pct_min}, {lfsm_o.statyzm_pct_max}] %."
        )

    zakresy = nc["zakresy_czestotliwosci"]
    zaprzestanie = nc["zaprzestanie_generacji"]
    kryteria = dict(procedura["kryteria_akceptacji"])
    progi = _progi_klas(katalog_warstw)
    wymagania = _wymagania(warstwy, osd, dok_osd)

    tresc: dict[str, Any] = {
        "operator_id": operator_id,
        "operator_name_pl": osd["operator_name_pl"],
        "rodzaj_operatora": osd["rodzaj_operatora"],
        "voltage_level_pl": osd["voltage_level_pl"],
        "last_revision": str(osd["last_revision"]),
        "warstwy": [
            WarstwaProfilu(warstwa=w, **dokumenty[w].model_dump()) for w in KOLEJNOSC_WARSTW
        ],
        "czestotliwosc_znamionowa_hz": f_n,
        "module_types": list(_module_types(progi)),
        "klasyfikacja_zrodlo": progi.podstawa,
        "zakresy_czestotliwosci": ZakresyCzestotliwosci(
            pasma=tuple(PasmoCzestotliwosci(**p) for p in zakresy["pasma"]),
            zrodlo=_zrodlo_sekcji("NC_RFG", dok_nc, zakresy),
        ),
        "lfsm_o_granice": lfsm_o,
        "zaprzestanie_generacji": ZaprzestanieGeneracji(
            czas_max_s=float(zaprzestanie["czas_max_s"]),
            zrodlo=_zrodlo_sekcji("NC_RFG", dok_nc, zaprzestanie),
        ),
        "frequency_response": odpowiedz_f,
        "reactive_power": NcRfgReactivePower(
            q_range_pct_pn_min=float(bierna["q_range_pct_pn_min"]),
            q_range_pct_pn_max=float(bierna["q_range_pct_pn_max"]),
            cos_phi_min=float(bierna["cos_phi_min"]),
            voltage_control_modes=tuple(bierna.get("voltage_control_modes", ())),
            zrodlo=zr_bierna,
        ),
        "voltage_levels": NcRfgVoltageLevels(
            lvrt=tuple(NcRfgRideThroughPoint(**p) for p in lvrt["punkty"]),
            hvrt=tuple(NcRfgRideThroughPoint(**p) for p in hvrt["punkty"]),
            lvrt_typy=tuple(lvrt["typy"]),
            hvrt_typy=tuple(hvrt["typy"]),
            lvrt_zrodlo=zr_lvrt,
            hvrt_zrodlo=zr_hvrt,
        ),
        "p_recovery_after_fault": NcRfgPRecovery(
            required_for_modules=tuple(odbudowa["required_for_modules"]),
            p_recovery_time_s=float(odbudowa["p_recovery_time_s"]),
            p_recovery_rate_pct_per_s=float(odbudowa["p_recovery_rate_pct_per_s"]),
            zrodlo=zr_odb,
        ),
        "kryteria_akceptacji": KryteriaAkceptacji(
            **{k: float(v) for k, v in _bez_proweniencji(kryteria).items()},
            zrodlo=_zrodlo_sekcji("PROCEDURA_PTPIREE", dok_proc, kryteria),
        ),
        "program_badan": _program_badan(procedura, dok_proc, wymagania),
        "wipwc": _wykaz_wipwc(wipwc, dokumenty["WIPWC"]),
        "bank_nastaw": _bank_nastaw(osd, dok_osd),
        "wymagania": list(wymagania),
    }
    wersja = " · ".join(
        [
            f"NC RfG {dok_nc.wydanie}",
            f"WOS {dok_wos.wydanie}",
            f"procedura PTPiREE {dok_proc.wydanie}",
            f"WiPWC {dokumenty['WIPWC'].wydanie}",
            f"{osd['operator_name_pl']} (rewizja {osd['last_revision']})",
        ]
    )
    profil = NcRfgProfile(**tresc, wersja_profilu=wersja, skrot_profilu="")
    skrot = _skrot(profil.model_dump(mode="json", exclude={"skrot_profilu"}))
    return profil.model_copy(update={"skrot_profilu": skrot})


@cache
def load_nc_rfg_profile(operator_id: str) -> NcRfgProfile:
    """Profil efektywny operatora (niezmienny; złożenie warstw liczone raz na operatora)."""
    return _zloz_profil(operator_id)


def list_available_operators() -> list[str]:
    """Operatorzy z plikiem warstwy OSD, posortowani deterministycznie."""
    return _operatorzy(_KATALOG_OPERATOROW)


__all__ = [
    "JEDNOSTKI_NASTAW",
    "KOLEJNOSC_WARSTW",
    "RODZAJ_WARSTWY",
    "BankNastaw",
    "DokumentWarstwy",
    "GraniceLfsmO",
    "KlasyfikacjaModulu",
    "KryteriaAkceptacji",
    "NastawaBanku",
    "NcRfgFrequencyResponse",
    "NcRfgModuleType",
    "NcRfgPRecovery",
    "NcRfgProfile",
    "NcRfgReactivePower",
    "NcRfgRideThroughPoint",
    "NcRfgVoltageLevels",
    "PasmoCzestotliwosci",
    "PozycjaBankuNastaw",
    "ProgramBadan",
    "RejestrCertyfikatow",
    "ScenariuszBadania",
    "SposobWykazania",
    "StatusZrodla",
    "Technologia",
    "TypModulu",
    "TypModuluZProgiem",
    "WarstwaNormatywna",
    "WarstwaProfilu",
    "WersjaWykazuWipwc",
    "WykazWipwc",
    "WymaganieRegulacyjne",
    "ZakresyCzestotliwosci",
    "ZaprzestanieGeneracji",
    "klasyfikacja_modulu",
    "klasyfikuj_modul",
    "list_available_operators",
    "load_nc_rfg_profile",
    "najslabszy_stan",
    "prog_minimalny_modulu_kw",
]
