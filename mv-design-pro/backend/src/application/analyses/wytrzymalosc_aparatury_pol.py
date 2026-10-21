"""Wytrzymałość zwarciowa aparatury PÓL STACJI liczona Z MODELU (karta KD-6, poz. 2).

CO SIĘ ZMIENIA. Weryfikacja wytrzymałości aparatury (I_dyn / I_th, karta K7-B)
umiała dotąd czytać wyłącznie ZAPISANĄ KONFIGURACJĘ stacji: inżynier musiał
najpierw ręcznie wskazać aparat w osobnym katalogu wytrzymałości i wpisać czas
wyłączenia, zanim ekran wyników zwarciowych mógł cokolwiek powiedzieć. Model
tymczasem WIE, jaki aparat stoi w każdym polu — operacje domenowe wymagają
wskazania pozycji katalogu APARAT_SN (B-12) i zapisują ją na gałęzi aparatu.

Ten moduł domyka to ogniwo: dla punktu zwarcia w stacji werdykty powstają dla
WSZYSTKICH pól tej stacji, z aparatami z MODELU, bez wymogu ręcznej
konfiguracji. Zapisana konfiguracja pozostaje NADRZĘDNA tam, gdzie istnieje
(inżynier mógł świadomie wskazać inny aparat) — każdy wiersz niesie jawne
``zrodlo``: ``model`` albo ``konfiguracja``.

WARSTWA APLIKACJI — ZERO FIZYKI WŁASNEJ:
  - porównanie I_dyn / I_th robi ``network_model.catalog.audit2_catalogs.
    ocen_wytrzymalosc_aparatu`` (jądro werdyktu K7-B),
  - znamiona pochodzą z katalogu (APARAT_SN albo katalog wytrzymałości),
  - prądy pochodzą z WYNIKU zapisanego biegu zwarciowego, PER POLE: wiersz zwarcia
    trójfazowego w punkcie zabudowy pola (szyna pola, przez ``enm.tor_pola.
    szyna_raportowa`` — ten sam węzeł, który wynik raportuje) — ``prady_pol_z_biegu``
    (karta WYTRZYMALOSC-PRAD-POLA: dawniej JEDNA liczba z żądania dla wszystkich pól
    stacji, więc pole po stronie nN albo innej sekcji dostawało cudzy prąd i cudzy czas),
  - czas wyłączenia pochodzi z osobnego dostawcy (poz. 3: człon nastawczy przy prądzie
    TEGO pola + czas własny aparatu z katalogu) albo z konfiguracji.

WERDYKT WYJAŚNIALNY: każdy wiersz niesie dwa rekordy K (``werdykt.OcenaKryterium``) —
dynamiczny ``i_p ≤ I_dyn`` i cieplny ``I_th ≤ I_th,zn·√(min(1, t_zn/t_k))`` — z prądem, czasem,
limitem, marginesem i przyczyną braku. Brak czasu wyłączenia (w tym brak czasu własnego
aparatu) daje ``BRAK_PODSTAWY`` kryterium cieplnego z nazwaną przyczyną, nigdy ``SPELNIA``;
brak prądu pola w biegu daje ``NIE_OCENIONO``.

ZERO FABRYKACJI: pozycja katalogu bez znamion wytrzymałości daje werdykt
„NIEUSTALONE" z kodem gotowości — nigdy przelicznika z prądu łączeniowego ani
werdyktu negatywnego. Brak danej to inny stan niż „nie wytrzymuje".

DETERMINIZM: pola sortowane po (oznaczenie, referencja aparatu); wiersze z
konfiguracji po oznaczeniu. Ten sam model + ta sama konfiguracja + te same
prądy ⇒ identyczna odpowiedź.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from application.analyses.aparaty_pol import aparaty_pol_stacji, znajdz_stacje
from application.analyses.protection.czas_wylaczenia_pola import czasy_wylaczenia_pol_stacji
from application.field_read_model import collect_bays
from enm.mapping import ref_to_graph_id
from enm.models import Bay, EnergyNetworkModel
from enm.nazwy_elementow import nazwa_elementu, opis_bez_nazwy
from enm.rola_pola_sn import nazwa_roli_pola_sn
from enm.tor_pola import szyna_raportowa
from network_model.catalog import get_default_mv_catalog
from network_model.catalog.audit2_catalogs import (
    get_device_withstand,
    ocen_wytrzymalosc_aparatu,
)
from network_model.nazwy import nazwa_nadana
from solver_input.provenance import classify_dynamic_capability
from werdykt import (
    Kryterium,
    LimitKryterium,
    Niepewnosc,
    OcenaKryterium,
    OdnosnikSladu,
    PodstawaWymagania,
    Przedmiot,
    StatusDanych,
    StatusDowodu,
    Stosowalnosc,
    Wielkosc,
    WynikKryterium,
    ZakresWaznosci,
    ocen_kryterium,
)

# ---------------------------------------------------------------------------
# Kody gotowości — jawny brak zamiast cichego zera
# ---------------------------------------------------------------------------

READINESS_STACJA_NIEZNANA = "aparatura.stacja_nieznana"
READINESS_BRAK_PRADU_POLA = "aparatura.brak_pradu_pola_w_biegu"
READINESS_BRAK_POL_Z_APARATEM = "aparatura.brak_pol_z_aparatem"
READINESS_APARAT_SPOZA_KATALOGU = "aparatura.aparat_spoza_katalogu"
READINESS_POZYCJA_BEZ_ZNAMION = "aparatura.pozycja_bez_znamion_wytrzymalosci"
READINESS_CZAS_NIEUSTALONY = "aparatura.czas_wylaczenia_nieustalony"

#: Źródło aparatu w wierszu werdyktu.
ZRODLO_MODEL = "model"
ZRODLO_KONFIGURACJA = "konfiguracja"

#: Zdolność w rejestrze dowodowym (``solver_input.provenance``).
ZDOLNOSC_WYTRZYMALOSCI = "aparatura.wytrzymalosc_zwarciowa_pola"

#: Rodzaj zwarcia, którego wiersz zasila ocenę wytrzymałości (największy prąd w sieci SN
#: z punktem neutralnym izolowanym albo uziemionym przez impedancję — IEC 60909-0 § 1).
_ZWARCIE_TROJFAZOWE = "3F"


@dataclass(frozen=True)
class PradyPola:
    """Prądy zwarcia w punkcie zabudowy JEDNEGO pola, z wiersza zapisanego biegu.

    ``punkt_ref`` — szyna, pod którą wynik raportuje punkt zabudowy pola; ``None`` z kodem
    i powodem, gdy bieg nie niesie wiersza zwarcia trójfazowego dla tego punktu.
    """

    punkt_ref: str | None
    punkt_nazwa: str | None
    ik_ka: float | None
    ip_ka: float | None
    ith_ka: float | None
    kody_gotowosci: tuple[str, ...] = ()
    powod_pl: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "punkt_ref": self.punkt_ref,
            "punkt_nazwa": self.punkt_nazwa,
            "ik_ka": self.ik_ka,
            "ip_ka": self.ip_ka,
            "ith_ka": self.ith_ka,
            "kody_gotowosci": list(self.kody_gotowosci),
            "powod_pl": self.powod_pl,
        }


def _brak_pradow(punkt_ref: str | None, powod_pl: str) -> PradyPola:
    return PradyPola(
        punkt_ref=punkt_ref,
        punkt_nazwa=None,
        ik_ka=None,
        ip_ka=None,
        ith_ka=None,
        kody_gotowosci=(READINESS_BRAK_PRADU_POLA,),
        powod_pl=powod_pl,
    )


def prady_pol_z_biegu(
    *,
    enm: EnergyNetworkModel,
    station_ref: str,
    wiersze_biegu: Sequence[Mapping[str, Any]],
) -> dict[str, PradyPola]:
    """Prądy zwarciowe KAŻDEGO pola stacji z wierszy zapisanego biegu zwarciowego.

    Punkt zabudowy pola = szyna pola (``Bay.bus_ref``); wiersz wyniku dla niej to wiersz
    szyny raportowej (``szyna_raportowa`` — zacisk pomocniczy za zamkniętym aparatem jest
    tym samym węzłem co szyna pola). Wyłącznie wiersze zwarcia trójfazowego. Pole, dla
    którego bieg nie ma wiersza albo wiersz nie niesie prądów, dostaje kod
    ``READINESS_BRAK_PRADU_POLA`` z powodem — nigdy prądu innego pola.
    """
    stacja = znajdz_stacje(enm, station_ref)
    if stacja is None:
        return {}
    migawka = enm.model_dump(mode="json")
    wiersze_3f = [w for w in wiersze_biegu if w.get("fault_type") == _ZWARCIE_TROJFAZOWE]
    wynik: dict[str, PradyPola] = {}
    for bay in collect_bays(enm):
        if bay.substation_ref != stacja.ref_id:
            continue
        punkt = szyna_raportowa(migawka, bay.bus_ref)
        identyfikatory = {punkt, ref_to_graph_id(punkt)}
        wiersz = next(
            (
                w
                for w in wiersze_3f
                if w.get("element_id") in identyfikatory or w.get("target_id") in identyfikatory
            ),
            None,
        )
        if wiersz is None:
            wynik[bay.ref_id] = _brak_pradow(
                punkt,
                "Bieg zwarciowy nie niesie wiersza zwarcia trójfazowego dla punktu zabudowy "
                "tego pola — prądu pola nie ma z czego wziąć (prąd innego pola nie jest "
                "podstawiany).",
            )
            continue
        ik, ip, ith = wiersz.get("ikss_ka"), wiersz.get("ip_ka"), wiersz.get("ith_ka")
        if ik is None or ip is None or ith is None:
            wynik[bay.ref_id] = _brak_pradow(
                punkt,
                "Wiersz biegu dla punktu zabudowy pola nie niesie kompletu prądów "
                "(Ik″, ip, Ith) — punkt bez odniesienia impedancyjnego w biegu.",
            )
            continue
        wynik[bay.ref_id] = PradyPola(
            punkt_ref=punkt,
            punkt_nazwa=nazwa_nadana(wiersz.get("target_name")) or opis_bez_nazwy("buses"),
            ik_ka=float(ik),
            ip_ka=float(ip),
            ith_ka=float(ith),
        )
    return wynik


def _oznaczenia_pola(bay: Bay) -> list[str]:
    """Wszystkie napisy, którymi to pole może być zapisane w konfiguracji stacji.

    Konfigurator stacji zapisuje pole pod oznaczeniem WPISANYM przez inżyniera
    („P-01"), a model zna pole pod referencją i nazwą. Dopasowanie idzie po
    wszystkich znanych napisach — bez tego zapisana konfiguracja nigdy nie
    zostałaby uznana za nadrzędną i ten sam aparat pojawiłby się dwa razy.
    """
    kandydaci = [bay.bay_number, bay.name, bay.ref_id]
    return [str(k) for k in kandydaci if k]


def _oznaczenie_glowne(bay: Bay) -> str:
    """Oznaczenie pola w wyniku: numer wpisany przez inżyniera albo nazwa z modelu — nigdy
    referencja pola (karta #144; pole bez nazwy dostaje opis rodzaju)."""
    return (bay.bay_number or nazwa_elementu(bay, "bays")).strip()


def _znamiona_z_aparat_sn(catalog_ref: str) -> tuple[dict[str, Any] | None, str | None]:
    """Znamiona wytrzymałości pozycji APARAT_SN + etykieta pozycji.

    ``(None, None)`` = pozycji nie ma w katalogu (aparat spoza katalogu).
    """
    pozycja = get_default_mv_catalog().get_mv_apparatus_type(catalog_ref)
    if pozycja is None:
        return None, None
    zapis = pozycja.to_dict()
    return (
        {
            "i_dyn_ka": zapis["i_dyn_ka"],
            "i_dyn_pochodzenie": zapis["i_dyn_pochodzenie"],
            "i_th_ka": zapis["i_th_ka"],
            "i_th_duration_s": zapis["i_th_duration_s"],
            "i_th_pochodzenie": zapis["i_th_pochodzenie"],
        },
        str(zapis["name"]),
    )


def _znamiona_z_katalogu_wytrzymalosci(device_id: str) -> tuple[dict[str, Any] | None, str | None]:
    """Znamiona pozycji z katalogu wytrzymałości (wskazanie ręczne w konfiguracji)."""
    pozycja = get_device_withstand(device_id)
    if pozycja is None:
        return None, None
    return (
        {
            "i_dyn_ka": pozycja.i_dyn_ka,
            # Katalog wytrzymałości niesie znamiona WPROST z kart producentów
            # aparatury rozdzielczej — nie ma tu derywacji normowej.
            "i_dyn_pochodzenie": "producent",
            "i_th_ka": pozycja.i_th_1s_ka,
            "i_th_duration_s": pozycja.i_th_duration_s,
            "i_th_pochodzenie": "producent",
        },
        pozycja.label_pl,
    )


# ---------------------------------------------------------------------------
# Rekordy K werdyktu wyjaśnialnego (kontrakt: docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md)
# ---------------------------------------------------------------------------

_IEC_62271_1 = "IEC 62271-1 (PN-EN 62271-1) Wysokonapięciowa aparatura rozdzielcza i sterownicza"
_IEC_62271_1_WYDANIE = "2007"
_IEC_60865_1 = "IEC 60865-1 (PN-EN 60865-1) Prądy zwarciowe — obliczanie skutków"
_IEC_60865_1_WYDANIE = "2011"

#: Jednostka redakcyjna normy aparatury dla każdej wielkości znamionowej.
_PARAGRAF_ZNAMIENIA = {
    "i_dyn": "§ 4.6 znamionowy prąd szczytowy wytrzymywany I_p",
    "i_th": "§ 4.5 znamionowy prąd krótkotrwały wytrzymywany I_k i § 4.7 czas jego trwania t_k",
}

_PODSTAWA_DYNAMICZNA = PodstawaWymagania(
    rodzaj="NORMA",
    dokument=_IEC_62271_1,
    wydanie=_IEC_62271_1_WYDANIE,
    jednostka_redakcyjna=_PARAGRAF_ZNAMIENIA["i_dyn"],
    status="WSKAZANE",
    uwagi_pl=(
        "aparat wytrzymuje dynamicznie zwarcie, gdy prąd udarowy w miejscu zabudowy nie "
        "przekracza jego znamionowego prądu szczytowego wytrzymywanego"
    ),
)

_PODSTAWA_CIEPLNA = PodstawaWymagania(
    rodzaj="NORMA",
    dokument=_IEC_60865_1,
    wydanie=_IEC_60865_1_WYDANIE,
    jednostka_redakcyjna=(
        "wytrzymałość cieplna urządzeń elektrycznych: I_th ≤ I_thr dla T_k ≤ T_kr oraz "
        "I_th ≤ I_thr·√(T_kr/T_k) dla T_k ≥ T_kr"
    ),
    status="WSKAZANE",
    uwagi_pl=(
        "prąd cieplny zastępczy zwarcia porównany z prądem krótkotrwałym aparatu "
        "przeliczonym na czas wyłączenia; przy czasie krótszym od znamionowego limitem jest "
        "sam prąd znamionowy (bez przeliczenia w górę)"
    ),
)

_NIEPEWNOSC_POROWNANIA = Niepewnosc(
    nie_dotyczy=True,
    powod_pl=(
        "porównanie prądu z biegu zwarciowego IEC 60909 ze znamieniem katalogowym — bez "
        "dyskretyzacji, niepewność numeryczna nie dotyczy"
    ),
)


def _podstawa_znamienia(
    pochodzenie: str | None, etykieta: str, wielkosc: str
) -> PodstawaWymagania | None:
    """Podstawa LIMITU — skąd pochodzi znamię aparatu (``None`` = znamienia nie ma)."""
    if pochodzenie == "producent":
        return PodstawaWymagania(
            rodzaj="KATALOG_PRODUCENTA",
            dokument=f"karta katalogowa producenta pozycji „{etykieta}”",
            wydanie="pozycja katalogu aparatów SN programu",
            jednostka_redakcyjna=_PARAGRAF_ZNAMIENIA[wielkosc],
            status="WSKAZANE",
        )
    if pochodzenie == "referencyjny":
        return PodstawaWymagania(
            rodzaj="NORMA",
            dokument=_IEC_62271_1,
            wydanie=_IEC_62271_1_WYDANIE,
            jednostka_redakcyjna=_PARAGRAF_ZNAMIENIA[wielkosc],
            status="WSKAZANE",
            uwagi_pl=(
                f"pozycja generyczna „{etykieta}” bez producenta — wartość z szeregu "
                "znamionowego normy, nie z karty konkretnego aparatu"
            ),
        )
    if pochodzenie == "derived_iec62271":
        return PodstawaWymagania(
            rodzaj="NORMA",
            dokument=_IEC_62271_1,
            wydanie=_IEC_62271_1_WYDANIE,
            jednostka_redakcyjna="§ 4.6 I_p = 2,5·I_k dla częstotliwości znamionowej 50 Hz",
            status="WSKAZANE",
            uwagi_pl=(
                f"pozycja „{etykieta}” nie podaje I_p — wartość wyprowadzona z jej prądu "
                "krótkotrwałego wg relacji normowej"
            ),
        )
    return None


def _dowod(run_id: str) -> StatusDowodu:
    zdolnosc = classify_dynamic_capability(ZDOLNOSC_WYTRZYMALOSCI)
    return StatusDowodu(
        metoda="OBLICZENIE",
        poziom=zdolnosc.tier,
        rodzaj_twierdzenia=zdolnosc.claim_kind,
        status_modelu="NIE_DOTYCZY",
        status_danych=StatusDanych(stan="ZWALIDOWANE"),
        odniesienie=f"zapisany bieg zwarciowy {run_id}",
    )


def _zakres(prady: PradyPola) -> ZakresWaznosci:
    punkt = nazwa_nadana(prady.punkt_nazwa) or "punkt zabudowy pola nieustalony"
    return ZakresWaznosci(
        rodzaj_analizy="SHORT_CIRCUIT",
        opis_pl=(
            f"Zwarcie trójfazowe w punkcie zabudowy pola ({punkt}) wg zapisanego biegu "
            "IEC 60909; każdy aparat pola przewodzi co najwyżej prąd zwarcia w tym punkcie."
        ),
        wykluczenia=(
            "zwarcia niesymetryczne (osobny tor biegu)",
            "rozdział prądu zwarcia na gałęzie pola — przyjęty pełny prąd punktu zabudowy",
        ),
    )


def _przedmiot(
    *, oznaczenie: str, pole_ref: str | None, aparat_ref: str | None, nazwa: str
) -> Przedmiot:
    return Przedmiot(
        element_ref=aparat_ref or pole_ref,
        nazwa_pl=nazwa,
        opis_pl=f"aparat pola {oznaczenie}",
    )


def _ocena_dynamiczna(
    *,
    kryterium_id: str,
    przedmiot: Przedmiot,
    znamiona: dict[str, Any],
    etykieta: str,
    prady: PradyPola,
    run_id: str,
) -> OcenaKryterium:
    i_dyn = znamiona["i_dyn_ka"]
    podstawa_limitu = _podstawa_znamienia(znamiona["i_dyn_pochodzenie"], etykieta, "i_dyn")
    braki: list[str] = []
    if prady.ip_ka is None and prady.powod_pl:
        braki.append(prady.powod_pl)
    limit: LimitKryterium | None = None
    if i_dyn is not None and podstawa_limitu is not None:
        limit = LimitKryterium(
            wartosc=Wielkosc(wartosc=float(i_dyn), jednostka="kA"), podstawa=podstawa_limitu
        )
    else:
        braki.append(f"pozycja katalogu „{etykieta}” nie niesie prądu szczytowego I_p (I_dyn)")
    wynik = (
        WynikKryterium(
            wielkosc_pl="prąd udarowy zwarcia trójfazowego w punkcie zabudowy pola",
            symbol_latex=r"i_p",
            wartosc=Wielkosc(wartosc=prady.ip_ka, jednostka="kA"),
            punkt_krytyczny_pl=f"zwarcie w punkcie {prady.punkt_nazwa}",
            metoda="OBLICZENIE",
        )
        if prady.ip_ka is not None
        else None
    )
    return ocen_kryterium(
        kryterium_id=f"{kryterium_id}.dynamiczna",
        przedmiot=przedmiot,
        kryterium=Kryterium(
            opis_pl=(
                "Prąd udarowy zwarcia w punkcie zabudowy pola nie przekracza znamionowego "
                "prądu szczytowego wytrzymywanego aparatu"
            ),
            warunek_latex=r"i_p \le I_{dyn}",
            relacja="NIE_WIECEJ",
        ),
        podstawa=_PODSTAWA_DYNAMICZNA,
        stosowalnosc=Stosowalnosc(
            dotyczy=True,
            powod_pl="aparat pola przewodzi prąd zwarcia w punkcie zabudowy pola",
        ),
        wynik=wynik,
        limit=limit,
        niepewnosc=_NIEPEWNOSC_POROWNANIA,
        dowod=_dowod(run_id),
        zakres_waznosci=_zakres(prady),
        slad=(
            OdnosnikSladu(
                run_id=run_id,
                krok=f"{kryterium_id}:dynamiczna",
                opis_pl=(
                    f"i_p = {prady.ip_ka} kA (wiersz biegu, punkt {prady.punkt_ref}); "
                    f"I_dyn = {i_dyn} kA (pochodzenie: {znamiona['i_dyn_pochodzenie']})"
                ),
            ),
        ),
        braki_dodatkowe=braki,
    )


def _ocena_cieplna(
    *,
    kryterium_id: str,
    przedmiot: Przedmiot,
    znamiona: dict[str, Any],
    etykieta: str,
    prady: PradyPola,
    czas: dict[str, Any],
    limit_ka: float | None,
    run_id: str,
) -> OcenaKryterium:
    t_k = czas.get("t_clearing_s")
    podstawa_limitu = _podstawa_znamienia(znamiona["i_th_pochodzenie"], etykieta, "i_th")
    braki: list[str] = []
    if prady.ith_ka is None and prady.powod_pl:
        braki.append(prady.powod_pl)
    if znamiona["i_th_ka"] is None or znamiona["i_th_duration_s"] is None:
        braki.append(
            f"pozycja katalogu „{etykieta}” nie niesie prądu krótkotrwałego I_th z czasem t_th"
        )
    if t_k is None:
        braki.append(str(czas.get("powod_pl") or "czas wyłączenia zwarcia nie jest ustalony"))
    limit: LimitKryterium | None = None
    if limit_ka is not None and podstawa_limitu is not None and t_k is not None:
        limit = LimitKryterium(
            wartosc=Wielkosc(wartosc=float(limit_ka), jednostka="kA"),
            podstawa=podstawa_limitu,
            zakres_stosowalnosci_pl=(
                f"prąd krótkotrwały {znamiona['i_th_ka']} kA / {znamiona['i_th_duration_s']} s "
                f"przeliczony na czas wyłączenia T_k = {t_k} s"
            ),
        )
    wynik = (
        WynikKryterium(
            wielkosc_pl="prąd cieplny zastępczy zwarcia trójfazowego w punkcie zabudowy pola",
            symbol_latex=r"I_{th}",
            wartosc=Wielkosc(wartosc=prady.ith_ka, jednostka="kA"),
            punkt_krytyczny_pl=f"zwarcie w punkcie {prady.punkt_nazwa}",
            metoda="OBLICZENIE",
        )
        if prady.ith_ka is not None
        else None
    )
    return ocen_kryterium(
        kryterium_id=f"{kryterium_id}.cieplna",
        przedmiot=przedmiot,
        kryterium=Kryterium(
            opis_pl=(
                "Prąd cieplny zastępczy zwarcia w punkcie zabudowy pola nie przekracza prądu "
                "krótkotrwałego aparatu przeliczonego na czas wyłączenia zwarcia"
            ),
            warunek_latex=(r"I_{th} \le I_{thr}\sqrt{\min\left(1,\ \frac{T_{kr}}{T_k}\right)}"),
            relacja="NIE_WIECEJ",
        ),
        podstawa=_PODSTAWA_CIEPLNA,
        stosowalnosc=Stosowalnosc(
            dotyczy=True,
            powod_pl="aparat pola nagrzewa się prądem zwarcia do chwili jego wyłączenia",
        ),
        wynik=wynik,
        limit=limit,
        niepewnosc=_NIEPEWNOSC_POROWNANIA,
        dowod=_dowod(run_id),
        zakres_waznosci=_zakres(prady),
        slad=(
            OdnosnikSladu(
                run_id=run_id,
                krok=f"{kryterium_id}:cieplna",
                opis_pl=(
                    f"I_th = {prady.ith_ka} kA (wiersz biegu, punkt {prady.punkt_ref}); "
                    f"T_k = {t_k} s (źródło: {czas.get('zrodlo')}); limit = {limit_ka} kA"
                ),
            ),
        ),
        braki_dodatkowe=braki,
    )


def _wiersz(
    *,
    oznaczenie: str,
    pole_ref: str | None,
    rola: str | None,
    zrodlo: str,
    aparat_ref: str | None,
    aparat_nazwa: str | None,
    catalog_ref: str,
    znamiona: dict[str, Any] | None,
    etykieta: str | None,
    czas: dict[str, Any],
    prady: PradyPola,
    run_id: str,
) -> dict[str, Any]:
    kody: list[str] = list(prady.kody_gotowosci)
    werdykt: dict[str, Any] | None = None
    oceny: list[dict[str, Any]] = []
    komunikat: str

    if znamiona is None:
        kody.append(READINESS_APARAT_SPOZA_KATALOGU)
        komunikat = (
            f"Aparat {catalog_ref} nie występuje w katalogu — "
            "wytrzymałości zwarciowej nie da się sprawdzić."
        )
    else:
        if znamiona["i_dyn_ka"] is None or znamiona["i_th_ka"] is None:
            kody.append(READINESS_POZYCJA_BEZ_ZNAMION)
        kody.extend(k for k in czas.get("kody_gotowosci", []) if k not in kody)
        if czas.get("t_clearing_s") is None:
            kody.append(READINESS_CZAS_NIEUSTALONY)
        nazwa = etykieta or "pozycja katalogu aparatów bez nazwy"
        limit_cieplny_ka: float | None = None
        if prady.ip_ka is not None and prady.ith_ka is not None:
            werdykt = ocen_wytrzymalosc_aparatu(
                etykieta_pl=nazwa,
                i_dyn_ka=znamiona["i_dyn_ka"],
                i_th_ka=znamiona["i_th_ka"],
                i_th_duration_s=znamiona["i_th_duration_s"],
                i_peak_calculated_ka=prady.ip_ka,
                i_thermal_calculated_ka=prady.ith_ka,
                t_clearing_s=czas.get("t_clearing_s"),
            )
            limit_cieplny_ka = werdykt["i_th_effective_ka"]
            komunikat = str(werdykt["message_pl"])
        else:
            komunikat = f"NIEUSTALONE: aparatura „{nazwa}” — {prady.powod_pl or 'brak prądu pola'}"
        kryterium_id = f"aparatura.{pole_ref or oznaczenie}.{aparat_ref or catalog_ref}"
        przedmiot = _przedmiot(
            oznaczenie=oznaczenie,
            pole_ref=pole_ref,
            aparat_ref=aparat_ref,
            nazwa=aparat_nazwa or nazwa,
        )
        oceny = [
            _ocena_dynamiczna(
                kryterium_id=kryterium_id,
                przedmiot=przedmiot,
                znamiona=znamiona,
                etykieta=nazwa,
                prady=prady,
                run_id=run_id,
            ).model_dump(mode="json"),
            _ocena_cieplna(
                kryterium_id=kryterium_id,
                przedmiot=przedmiot,
                znamiona=znamiona,
                etykieta=nazwa,
                prady=prady,
                czas=czas,
                limit_ka=limit_cieplny_ka,
                run_id=run_id,
            ).model_dump(mode="json"),
        ]

    return {
        "pole": oznaczenie,
        "pole_ref": pole_ref,
        "rola": rola,
        # Nazwa roli z kanonu słownictwa ról pól (karta #141) — strefa pierwszoplanowa mówi
        # tym samym słowem co schemat, kreator i szuflada, nie kodem roli.
        "rola_pl": nazwa_roli_pola_sn(rola) if rola else None,
        "zrodlo": zrodlo,
        "aparat_ref": aparat_ref,
        "aparat_nazwa": aparat_nazwa,
        "aparat_catalog_ref": catalog_ref,
        "aparat_etykieta": etykieta,
        "znamiona": znamiona,
        "prady_pola": prady.to_dict(),
        "czas_wylaczenia": czas,
        "werdykt": werdykt,
        "oceny": oceny,
        "komunikat_pl": komunikat,
        "kody_gotowosci": kody,
    }


def _czas_z_konfiguracji(spec: dict[str, Any]) -> dict[str, Any]:
    """Czas wyłączenia zapisany ręcznie w konfiguracji stacji (deklaracja inżyniera)."""
    wartosc = spec.get("t_clearing_s")
    return {
        "t_clearing_s": float(wartosc) if isinstance(wartosc, int | float) else None,
        "zrodlo": ZRODLO_KONFIGURACJA,
        "powod_pl": "Czas wyłączenia wpisany w konfiguracji stacji.",
        "czlon_nastawczy_s": None,
        "czas_wlasny_wylacznika_s": None,
        "zalozenia_pl": [],
        "kody_gotowosci": [],
    }


_CZAS_NIEUSTALONY: dict[str, Any] = {
    "t_clearing_s": None,
    "zrodlo": None,
    "powod_pl": (
        "Czas wyłączenia nie jest ustalony — kryterium cieplne pozostaje nierozstrzygnięte."
    ),
    "czlon_nastawczy_s": None,
    "czas_wlasny_wylacznika_s": None,
    "zalozenia_pl": [],
    "kody_gotowosci": [],
}

_PRADY_WPISU_OSIEROCONEGO = _brak_pradow(
    None,
    "Wpis konfiguracji nie odpowiada żadnemu polu modelu — punktu zabudowy nie da się "
    "ustalić, więc prądu pola nie ma z czego wziąć.",
)


def zbuduj_widok_wytrzymalosci_aparatury(
    *,
    enm: EnergyNetworkModel,
    station_ref: str,
    prady_pol: Mapping[str, PradyPola],
    run_id: str,
    bay_device_withstand: dict[str, Any] | None = None,
    czasy_pol: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Werdykty wytrzymałości dla wszystkich pól stacji (model + konfiguracja).

    Args:
        enm: model, z którego czytamy pola stacji i aparaty katalogowe.
        station_ref: referencja stacji (``ref_id`` albo ``id`` elementu).
        prady_pol: prądy zwarciowe KAŻDEGO pola z zapisanego biegu
            (``prady_pol_z_biegu``), kluczowane referencją pola. Brak wpisu = brak prądu
            pola (kod ``READINESS_BRAK_PRADU_POLA``), nigdy prąd innego pola.
        run_id: identyfikator biegu zwarciowego — odniesienie dowodu i śladu.
        bay_device_withstand: zapisana konfiguracja stacji (oznaczenie pola →
            wskazany aparat + czas wyłączenia). Nadrzędna wobec modelu.
        czasy_pol: czasy wyłączenia wyznaczone z nastaw pól (poz. 3), kluczowane
            referencją pola. Brak wpisu = czas nieustalony (nie zero).

    Returns:
        Widok: stacja, lista pól z werdyktami i rekordami K, kody gotowości. Nigdy nie
        fabrykuje znamion, prądu ani czasu.
    """
    stacja = znajdz_stacje(enm, station_ref)
    if stacja is None:
        return {
            "stacja_ref": station_ref,
            "stacja_nazwa": None,
            "status": "brak danych",
            "bieg_zwarciowy_ref": run_id,
            "pola": [],
            "kody_gotowosci": [READINESS_STACJA_NIEZNANA],
        }

    konfiguracja = {
        str(klucz): dict(wartosc)
        for klucz, wartosc in (bay_device_withstand or {}).items()
        if isinstance(wartosc, dict)
    }
    czasy = dict(czasy_pol or {})
    aparaty = aparaty_pol_stacji(enm, stacja)
    pola_stacji = [bay for bay in collect_bays(enm) if bay.substation_ref == stacja.ref_id]

    wiersze: list[dict[str, Any]] = []
    zuzyte_klucze_konfiguracji: set[str] = set()

    for bay in pola_stacji:
        oznaczenie = _oznaczenie_glowne(bay)
        prady = prady_pol.get(bay.ref_id) or _brak_pradow(
            None, "Bieg zwarciowy nie niesie prądów dla punktu zabudowy tego pola."
        )
        klucz_konfiguracji = next(
            (nazwa for nazwa in _oznaczenia_pola(bay) if nazwa in konfiguracja), None
        )

        if klucz_konfiguracji is not None:
            # KONFIGURACJA NADRZĘDNA: inżynier wskazał aparat ręcznie.
            zuzyte_klucze_konfiguracji.add(klucz_konfiguracji)
            spec = konfiguracja[klucz_konfiguracji]
            device_id = str(spec.get("device_id") or "")
            znamiona, etykieta = _znamiona_z_katalogu_wytrzymalosci(device_id)
            wiersze.append(
                _wiersz(
                    oznaczenie=klucz_konfiguracji,
                    pole_ref=bay.ref_id,
                    rola=bay.bay_role,
                    zrodlo=ZRODLO_KONFIGURACJA,
                    aparat_ref=None,
                    aparat_nazwa=None,
                    catalog_ref=device_id,
                    znamiona=znamiona,
                    etykieta=etykieta,
                    czas=_czas_z_konfiguracji(spec),
                    prady=prady,
                    run_id=run_id,
                )
            )
            continue

        for aparat in aparaty.get(bay.ref_id, []):
            znamiona, etykieta = _znamiona_z_aparat_sn(aparat.catalog_ref)
            wiersze.append(
                _wiersz(
                    oznaczenie=oznaczenie,
                    pole_ref=bay.ref_id,
                    rola=bay.bay_role,
                    zrodlo=ZRODLO_MODEL,
                    aparat_ref=aparat.aparat_ref,
                    aparat_nazwa=aparat.aparat_nazwa,
                    catalog_ref=aparat.catalog_ref,
                    znamiona=znamiona,
                    etykieta=etykieta,
                    czas=czasy.get(bay.ref_id, _CZAS_NIEUSTALONY),
                    prady=prady,
                    run_id=run_id,
                )
            )

    # Wpisy konfiguracji bez odpowiednika w modelu: to ŚWIADOMY zapis inżyniera,
    # więc nie znika z ekranu tylko dlatego, że oznaczenie nie pasuje do pola — ale bez
    # punktu zabudowy nie ma prądu, więc werdykt pozostaje nieustalony.
    for klucz in sorted(set(konfiguracja) - zuzyte_klucze_konfiguracji):
        spec = konfiguracja[klucz]
        device_id = str(spec.get("device_id") or "")
        znamiona, etykieta = _znamiona_z_katalogu_wytrzymalosci(device_id)
        wiersze.append(
            _wiersz(
                oznaczenie=klucz,
                pole_ref=None,
                rola=None,
                zrodlo=ZRODLO_KONFIGURACJA,
                aparat_ref=None,
                aparat_nazwa=None,
                catalog_ref=device_id,
                znamiona=znamiona,
                etykieta=etykieta,
                czas=_czas_z_konfiguracji(spec),
                prady=_PRADY_WPISU_OSIEROCONEGO,
                run_id=run_id,
            )
        )

    wiersze.sort(key=lambda w: (str(w["pole"]), str(w["aparat_catalog_ref"])))

    kody: list[str] = []
    if not wiersze:
        kody.append(READINESS_BRAK_POL_Z_APARATEM)

    return {
        "stacja_ref": stacja.ref_id,
        "stacja_nazwa": stacja.name,
        "status": "OK" if wiersze else "brak danych",
        "bieg_zwarciowy_ref": run_id,
        "pola": wiersze,
        "kody_gotowosci": kody,
    }


def widok_wytrzymalosci_z_biegu(
    *,
    enm: EnergyNetworkModel,
    station_ref: str,
    wiersze_biegu: Sequence[Mapping[str, Any]],
    run_id: str,
    bay_device_withstand: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """JEDYNE złożenie toru: wiersze biegu → prądy pól → czasy pól → werdykty.

    Prąd każdego pola z wiersza biegu dla jego punktu zabudowy; czas wyłączenia pola
    z nastaw jego zabezpieczenia przy TYM prądzie (``czasy_wylaczenia_pol_stacji``);
    werdykty z jądra K7-B. Końcówka HTTP i testy wołają to samo złożenie.
    """
    prady = prady_pol_z_biegu(enm=enm, station_ref=station_ref, wiersze_biegu=wiersze_biegu)
    czasy = czasy_wylaczenia_pol_stacji(
        enm=enm,
        station_ref=station_ref,
        ik_pol_ka={ref: p.ik_ka for ref, p in prady.items()},
    )
    return zbuduj_widok_wytrzymalosci_aparatury(
        enm=enm,
        station_ref=station_ref,
        prady_pol=prady,
        run_id=run_id,
        bay_device_withstand=bay_device_withstand,
        czasy_pol=czasy,
    )
