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

WERDYKT WYJAŚNIALNY: każdy wiersz niesie trzy rekordy K (``werdykt.OcenaKryterium``) —
dynamiczny ``i_p ≤ I_dyn``, cieplny ``I_th ≤ I_th,zn·√(min(1, t_zn/t_k))`` i zdolności
wyłączania ``I_b ≤ I_cu`` (wyłącznik SN/WN) albo ``I″k ≤ I_cu`` (nN, bezpiecznik) — z prądem,
czasem, limitem, marginesem i przyczyną braku. Wielkość kryterium wyłączania wybiera JEDEN
predykat (``application.equipment_proof.wielkosc_wylaczania``), wspólny z dowodem doboru
aparatury (karta SC-IB-ITH-ZRODLA); rekord nazywa porównaną wielkość i jej normę. Brak czasu
wyłączenia z powodu braku MODELU (brak nastaw, wyłącznik poza polem) daje ``BRAK_PODSTAWY``
kryterium cieplnego z nazwaną przyczyną, nigdy ``SPELNIA``; brak prądu pola w biegu daje
``NIE_OCENIONO``.

WARTOŚCI ROBOCZE (zasada nr 4, kontrakt werdyktu §3c, V12K-351). Brak parametru URZĄDZENIA w
karcie (czas własny wyłącznika, I_k, t_k, I_p) nie blokuje oceny: znamiona i czas własny
pochodzą z JEDNEGO rozstrzygnięcia ``aparaty_pol.parametry_aparatu`` (projektant > karta >
propozycja rejestru), status kryterium wynika z liczb, a każda wartość robocza stoi w
``dane_przyjete`` (jakość ``ESTIMATED``, stan danych ``UNVALIDATED_INPUT``, kompletność
``NIEPELNY``). Podstawa limitu na wartości roboczej nigdy nie jest ``KATALOG_PRODUCENTA``.
Prąd punktu zabudowy w sieci nN liczonej z wartością roboczą tolerancji napięcia (znacznik
wiersza biegu ``tolerancja_nn_robocza``, karta TOLERANCJA-NN-WARTOSC-ROBOCZA) jest tak samo
daną przyjętą każdego kryterium, które go porównuje.

ZERO FABRYKACJI: parametr, dla którego rejestr nie zna uzasadnionej propozycji (np. prąd
krótkotrwały rozłącznika bezpiecznikowego — wytrzymałość zestawu wyznacza wkładka), daje
„NIEUSTALONE" z kodem gotowości — nigdy werdykt negatywny. Brak danej to inny stan niż
„nie wytrzymuje".

DETERMINIZM: pola sortowane po (oznaczenie, referencja aparatu); wiersze z
konfiguracji po oznaczeniu. Ten sam model + ta sama konfiguracja + te same
prądy ⇒ identyczna odpowiedź.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from application.analyses.aparaty_pol import (
    AparatPola,
    aparaty_pol_stacji,
    dana_przyjeta,
    parametry_aparatu,
    znajdz_stacje,
)
from application.analyses.protection.czas_wylaczenia_pola import czasy_wylaczenia_pol_stacji
from application.equipment_proof.catalog_bridge import resolve_um_icu_from_catalog
from application.equipment_proof.wielkosc_wylaczania import (
    WIELKOSC_IB,
    WielkoscKryteriumWylaczania,
    wielkosc_kryterium_wylaczania,
)
from enm.dane_przyjete_galezi import KLUCZ_WIERSZA_DANE_GALEZI, dane_przyjete_galezi_wiersza
from enm.mapping import ref_to_graph_id
from enm.models import Bay, EnergyNetworkModel
from enm.nazwy_elementow import nazwa_elementu
from enm.pola import pola_stacji as pola_stacji_modelu
from enm.rola_pola_sn import nazwa_roli_pola_sn
from enm.tor_pola import szyna_raportowa
from network_model.catalog.audit2_catalogs import (
    get_device_withstand,
    ocen_wytrzymalosc_aparatu,
)
from network_model.catalog.rodzaje_aparatury import wielkosc_zwarciowa_aparatu_sn_dotyczy
from network_model.catalog.wartosci_robocze import (
    DOKUMENT_REJESTRU,
    PARAMETR_I_DYN,
    PARAMETR_I_TH,
    PARAMETR_T_TH,
    WYDANIE_REJESTRU,
    WartoscRozstrzygnieta,
    dana_przyjeta_tolerancji_nn,
    dane_przyjete_maszyn,
)
from network_model.nazwy import nazwa_nadana, opis_rodzaju_i_nazwy
from network_model.solvers.machine_sc_iec60909 import zdanie_zalozen_zaniku_ib_pl
from solver_input.provenance import classify_dynamic_capability
from werdykt import (
    DanaPrzyjeta,
    FieldQuality,
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
#: Aparat, który z definicji normy przerywa prąd zwarciowy (wyłącznik, reklozer, bezpiecznik),
#: bez znamionowej zdolności wyłączania w katalogu — kryterium wyłączania bez limitu.
READINESS_BRAK_ZDOLNOSCI_WYLACZANIA = "aparatura.brak_zdolnosci_wylaczania"

#: Rodzaje pozycji KATALOGU WYTRZYMAŁOŚCI (ręczne wskazanie w konfiguracji stacji) wobec
#: zdolności wyłączania zwarć. Katalog wytrzymałości niesie znamiona I_dyn/I_th, a nie
#: zdolność wyłączania — wyłącznik z tego katalogu ma więc kryterium wyłączania BEZ limitu
#: (brak podstawy), a rozłącznik i tor szynowy kryterium nie podlegają (nie przerywają prądu
#: zwarciowego z definicji normy). Lista ZAMKNIĘTA: każdą pozycję katalogu przypina test
#: (``test_kazda_pozycja_katalogu_wytrzymalosci_ma_rodzaj_wylaczania``); rodzaj spoza listy
#: = brak podstawy z nazwaną przyczyną, nigdy cichy „nie dotyczy".
RODZAJ_WYLACZANIA_KATALOGU_WYTRZYMALOSCI: dict[str, bool] = {
    "breaker_vacuum_15": True,
    "breaker_sf6_15": True,
    "switch_load_15": False,
    "busbar_15_1250": False,
    "busbar_15_2000": False,
}

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
    #: Karta SC-IB-ITH-ZRODLA — wielkości kryterium wyłączania z TEGO SAMEGO wiersza biegu:
    #: symetryczny prąd wyłączeniowy I_b, składowa nieokresowa i_DC(t_b) (informacyjnie),
    #: czas t_b punktu i napięcie znamionowe punktu (pasmo wybiera wielkość porównywaną
    #: z I_cu). ``None`` wyłącznie dla wiersza bez solvera albo zapisu bez tych pól.
    ib_ka: float | None = None
    i_dc_ka: float | None = None
    tb_s: float | None = None
    un_kv: float | None = None
    #: Karta TB-WARTOSC-ROBOCZA: pochodzenie t_b punktu z wiersza biegu (``None`` = t_b ze
    #: scenariusza projektanta) — wartość robocza za porównywanym I_b to dana przyjęta.
    tb_zrodlo: dict[str, Any] | None = None
    #: Karta TOLERANCJA-NN-WARTOSC-ROBOCZA: punkt w sieci nN liczonej z wartością roboczą
    #: tolerancji napięcia (znacznik wiersza biegu) — prądy pola stoją na danej przyjętej.
    tolerancja_nn_robocza: bool = False
    #: Karta LINIA-110: dane przyjęte gałęzi z wartością roboczą, których impedancja wchodzi
    #: do prądu punktu (znacznik wiersza biegu ``dane_przyjete_galezi``).
    dane_galezi: tuple[DanaPrzyjeta, ...] = ()
    #: Karta PODSTAWA-Q: krzywe zaniku μ/q maszyn tego punktu wyznaczone na założeniu
    #: inżynierskim (wpisy `machine_sc_iec60909.zalozenia_krzywych_wkladow` z wiersza biegu) —
    #: I_b stoi na tych założeniach, więc zakres ważności kryterium wyłączania je nazywa.
    zalozenia_zaniku: tuple[dict[str, Any], ...] = ()
    #: Karta PODSTAWA-Q (rozstrzygnięcie 3): wartości robocze parametrów maszyn wirujących
    #: wyspy punktu (wpisy `wartosci_robocze.wpis_parametru_maszyny` z wiersza biegu) — dane
    #: przyjęte kryteriów, których porównywana wielkość od nich zależy.
    parametry_robocze_maszyn: tuple[dict[str, Any], ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "punkt_ref": self.punkt_ref,
            "punkt_nazwa": self.punkt_nazwa,
            "ik_ka": self.ik_ka,
            "ip_ka": self.ip_ka,
            "ith_ka": self.ith_ka,
            "ib_ka": self.ib_ka,
            "i_dc_ka": self.i_dc_ka,
            "tb_s": self.tb_s,
            "un_kv": self.un_kv,
            "kody_gotowosci": list(self.kody_gotowosci),
            "powod_pl": self.powod_pl,
            # Karta TB-WARTOSC-ROBOCZA (addytywnie, exclude-None).
            **({"tb_zrodlo": self.tb_zrodlo} if self.tb_zrodlo is not None else {}),
            **({"tolerancja_nn_robocza": True} if self.tolerancja_nn_robocza else {}),
            **(
                {KLUCZ_WIERSZA_DANE_GALEZI: [d.model_dump(mode="json") for d in self.dane_galezi]}
                if self.dane_galezi
                else {}
            ),
            # Karta PODSTAWA-Q (addytywnie, exclude-empty).
            **(
                {"zalozenia_zaniku": [dict(w) for w in self.zalozenia_zaniku]}
                if self.zalozenia_zaniku
                else {}
            ),
            **(
                {"parametry_robocze_maszyn": [dict(w) for w in self.parametry_robocze_maszyn]}
                if self.parametry_robocze_maszyn
                else {}
            ),
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
    for bay in pola_stacji_modelu(enm, stacja.ref_id):
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
            punkt_nazwa=nazwa_nadana(wiersz.get("target_name")),
            ik_ka=float(ik),
            ip_ka=float(ip),
            ith_ka=float(ith),
            ib_ka=_liczba(wiersz.get("ib_ka")),
            i_dc_ka=_liczba(wiersz.get("i_dc_ka")),
            tb_s=_liczba(wiersz.get("tb_s")),
            un_kv=_liczba(wiersz.get("un_kv")),
            tb_zrodlo=(
                dict(wiersz["tb_zrodlo"]) if isinstance(wiersz.get("tb_zrodlo"), Mapping) else None
            ),
            tolerancja_nn_robocza=bool(wiersz.get("tolerancja_nn_robocza")),
            dane_galezi=dane_przyjete_galezi_wiersza(wiersz),
            zalozenia_zaniku=tuple(
                dict(w) for w in (wiersz.get("zalozenia_zaniku") or ()) if isinstance(w, Mapping)
            ),
            parametry_robocze_maszyn=tuple(
                dict(w)
                for w in (wiersz.get("parametry_robocze_maszyn") or ())
                if isinstance(w, Mapping)
            ),
        )
    return wynik


def _liczba(wartosc: object) -> float | None:
    """Liczba z wiersza biegu albo ``None`` (brak pola w starszym zapisie = brak danej)."""
    if isinstance(wartosc, bool) or not isinstance(wartosc, int | float):
        return None
    return float(wartosc)


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


#: Pochodzenie znamienia w odpowiedzi — dla danej karty pochodzenie karty (producent /
#: referencyjny), dla wartości roboczej jej rodzaj (projektant / wartość robocza).
POCHODZENIE_PROJEKTANT = "projektant"
POCHODZENIE_WARTOSC_ROBOCZA = "wartosc_robocza"


def _pochodzenie_znamienia(wartosc: WartoscRozstrzygnieta) -> str | None:
    if wartosc.pochodzenie == "KATALOG":
        return wartosc.pochodzenie_karty
    if wartosc.pochodzenie == "PROJEKTANT":
        return POCHODZENIE_PROJEKTANT
    if wartosc.pochodzenie == "PROPOZYCJA":
        return POCHODZENIE_WARTOSC_ROBOCZA
    return None


def _znamiona_z_aparat_sn(aparat: AparatPola) -> tuple[dict[str, Any] | None, str | None]:
    """Znamiona wytrzymałości aparatu pola z JEDNEGO rozstrzygnięcia + etykieta pozycji.

    ``(None, None)`` = pozycji nie ma w katalogu (aparat spoza katalogu). Każda liczba niesie
    pochodzenie; ``wartosci`` — pełne rozstrzygnięcie (wartość, pochodzenie, propozycja ze
    źródłem i wpływem) trzech znamion, z którego biorą się dane przyjęte werdyktu.
    """
    pozycja, parametry = parametry_aparatu(aparat)
    if pozycja is None:
        return None, None
    i_th, t_th, i_dyn = (
        parametry[PARAMETR_I_TH],
        parametry[PARAMETR_T_TH],
        parametry[PARAMETR_I_DYN],
    )
    # Zdolność wyłączania z TEGO SAMEGO odczytu katalogu co dowód doboru aparatury
    # (`resolve_um_icu_from_catalog`): I_cu, „nie dotyczy" rozłącznika/odłącznika/uziemnika
    # i znacznik bezpiecznika — jedna reguła klasy aparatu dla obu torów.
    icu = resolve_um_icu_from_catalog(aparat.catalog_ref)
    i_cu_ka = icu.i_cu_ka if icu.i_cu_ka is not None and icu.i_cu_ka > 0 else None
    return (
        {
            "i_dyn_ka": i_dyn.wartosc,
            "i_dyn_pochodzenie": _pochodzenie_znamienia(i_dyn),
            "i_th_ka": i_th.wartosc,
            "i_th_duration_s": t_th.wartosc,
            "i_th_pochodzenie": _pochodzenie_znamienia(i_th),
            "i_th_duration_pochodzenie": _pochodzenie_znamienia(t_th),
            "wartosci": {w.parametr: w.to_dict() for w in (i_th, t_th, i_dyn)},
            "i_cu_ka": i_cu_ka,
            "i_cu_pochodzenie": (
                None
                if i_cu_ka is None
                else ("producent" if pozycja.manufacturer else "referencyjny")
            ),
            "i_cu_nie_dotyczy": icu.i_cu_not_applicable,
            "bezpiecznik": icu.bezpiecznik,
            # „Nie dotyczy” prądu krótkotrwałego i szczytowego wytrzymywanego (rozłącznik
            # bezpiecznikowy, IEC 62271-105 § 4.5–4.6) rozstrzyga RODZAJ pozycji — ten sam
            # predykat co bramka rekordu KAT-T-050; liczba podana przez projektanta wygrywa.
            "i_th_nie_dotyczy": (
                i_th.wartosc is None
                and not wielkosc_zwarciowa_aparatu_sn_dotyczy(pozycja.device_kind, "i_th_ka")
            ),
        },
        pozycja.name,
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
            "i_th_duration_pochodzenie": "producent",
            "wartosci": {},
            # Katalog wytrzymałości nie niesie zdolności wyłączania — tylko rodzaj aparatu
            # (zamknięta lista ``RODZAJ_WYLACZANIA_KATALOGU_WYTRZYMALOSCI``).
            "i_cu_ka": None,
            "i_cu_pochodzenie": None,
            "i_cu_nie_dotyczy": (
                RODZAJ_WYLACZANIA_KATALOGU_WYTRZYMALOSCI.get(pozycja.device_type) is False
            ),
            "bezpiecznik": False,
            # Katalog wytrzymałości niesie znamiona I_dyn/I_th każdej pozycji.
            "i_th_nie_dotyczy": False,
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
    "i_cu": (
        "znamionowa zdolność wyłączania zwarciowa I_cu (wyłącznik SN: IEC 62271-100 § 4.101 "
        "znamionowy prąd wyłączalny zwarciowy I_sc)"
    ),
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


def _podstawa_wartosci_roboczej(
    zapis: dict[str, Any], etykieta: str, wielkosc: str
) -> PodstawaWymagania:
    """Podstawa LIMITU opartego na wartości roboczej — nigdy ``KATALOG_PRODUCENTA`` (§3c pkt 4).

    Propozycja normowa cytuje normę (relacja albo wartość zalecana z punktem normy), propozycja
    z profilu albo założenia — rejestr wartości roboczych, wartość projektanta — model sieci.
    Każda z nich jest WSKAZANA (źródło nazwane), a niepełność dowodu niesie dana przyjęta.
    """
    propozycja = zapis.get("propozycja")
    if zapis.get("pochodzenie") == "PROPOZYCJA" and isinstance(propozycja, dict):
        if propozycja["rodzaj_zrodla"] == "NORMA":
            return PodstawaWymagania(
                rodzaj="NORMA",
                dokument=_IEC_62271_1,
                wydanie="2017",
                jednostka_redakcyjna=str(propozycja["odniesienie"]),
                status="WSKAZANE",
                uwagi_pl=(
                    f"wartość robocza pozycji „{etykieta}” (karta jej nie podaje): "
                    f"{propozycja['uzasadnienie_pl']} — nie dana producenta"
                ),
            )
        return PodstawaWymagania(
            rodzaj="ZALOZENIE_PROJEKTOWE",
            dokument=DOKUMENT_REJESTRU,
            wydanie=WYDANIE_REJESTRU,
            jednostka_redakcyjna=f"{zapis['nazwa_pl']} ({propozycja['rodzaj_zrodla']})",
            status="WSKAZANE",
            uwagi_pl=(
                f"wartość robocza pozycji „{etykieta}” (karta jej nie podaje): "
                f"{propozycja['odniesienie']} — nie dana producenta"
            ),
        )
    return PodstawaWymagania(
        rodzaj="ZALOZENIE_PROJEKTOWE",
        dokument=f"wartość nadana przez projektanta na elemencie modelu (aparat „{etykieta}”)",
        wydanie="bieżący stan modelu sieci",
        jednostka_redakcyjna=f"{zapis['nazwa_pl']} — {_PARAGRAF_ZNAMIENIA[wielkosc]}",
        status="WSKAZANE",
        uwagi_pl=zapis.get("powod_projektanta_pl") or "wartość robocza projektanta bez dokumentu",
    )


def _podstawa_znamienia(
    pochodzenie: str | None,
    etykieta: str,
    wielkosc: str,
    zapis_roboczy: dict[str, Any] | None = None,
) -> PodstawaWymagania | None:
    """Podstawa LIMITU — skąd pochodzi znamię aparatu (``None`` = znamienia nie ma)."""
    if zapis_roboczy is not None and zapis_roboczy.get("wartosc_robocza"):
        return _podstawa_wartosci_roboczej(zapis_roboczy, etykieta, wielkosc)
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
    return None


def _zapis_roboczy(znamiona: dict[str, Any], parametr: str) -> dict[str, Any] | None:
    zapis = (znamiona.get("wartosci") or {}).get(parametr)
    return zapis if isinstance(zapis, dict) else None


def _dane_przyjete(
    zapisy: list[dict[str, Any] | None], *, aparat_pl: str
) -> tuple[DanaPrzyjeta, ...]:
    """Dane przyjęte kryterium: każda wartość robocza z listy (kolejność stała, bez powtórzeń)."""
    widziane: set[str] = set()
    dane: list[DanaPrzyjeta] = []
    for zapis in zapisy:
        if zapis is None or not zapis.get("wartosc_robocza") or zapis["parametr"] in widziane:
            continue
        widziane.add(str(zapis["parametr"]))
        dane.append(dana_przyjeta(zapis, aparat_pl=aparat_pl))
    return tuple(dane)


def _dane_pradow(prady: PradyPola, *, wielkosc: str | None) -> tuple[DanaPrzyjeta, ...]:
    """Dane przyjęte PRĄDU pola porównywanego w kryterium (``wielkosc``: ``ip``/``ith``/``ib``/
    ``ikss``): punkt w sieci nN liczonej z wartością roboczą tolerancji (karta
    TOLERANCJA-NN-WARTOSC-ROBOCZA), linie 110 kV z wartością roboczą geometrii w wyspie punktu
    (karta LINIA-110 — impedancja gałęzi wchodzi do każdej wielkości zwarciowej punktu) oraz
    wartości robocze parametrów maszyn wirujących wyspy punktu, od których ta wielkość zależy
    (karta PODSTAWA-Q, rozstrzygnięcie 3). ``None`` — wielkości porównania nie ustalono (bieg
    bez napięcia punktu): tolerancja i gałęzie, bez wpisów maszyn."""
    tolerancja = (
        (dana_przyjeta_tolerancji_nn(miejsce_pl=_opis_punktu(prady)),)
        if prady.tolerancja_nn_robocza
        else ()
    )
    if wielkosc is None:
        return tolerancja + prady.dane_galezi
    return (
        tolerancja
        + prady.dane_galezi
        + dane_przyjete_maszyn(prady.parametry_robocze_maszyn, wielkosc=wielkosc)
    )


def _dowod(run_id: str, dane_przyjete: tuple[DanaPrzyjeta, ...] = ()) -> StatusDowodu:
    """Dowód kryterium; wartości robocze ⇒ ``UNVALIDATED_INPUT`` (kompletność ``NIEPELNY``)."""
    zdolnosc = classify_dynamic_capability(ZDOLNOSC_WYTRZYMALOSCI)
    return StatusDowodu(
        metoda="OBLICZENIE",
        poziom=zdolnosc.tier,
        rodzaj_twierdzenia=zdolnosc.claim_kind,
        status_modelu="NIE_DOTYCZY",
        status_danych=(
            StatusDanych(stan="UNVALIDATED_INPUT", dane_przyjete=dane_przyjete)
            if dane_przyjete
            else StatusDanych(stan="ZWALIDOWANE")
        ),
        odniesienie=f"zapisany bieg zwarciowy {run_id}",
    )


def _opis_punktu(prady: PradyPola) -> str:
    """Punkt zabudowy pola w zdaniu: szyna z nazwą albo opis braku nazwy — JEDNA reguła nazwy
    (`network_model.nazwy`); identyfikator szyny nigdy nie zastępuje nazwy."""
    if prady.punkt_ref is None:
        return "punkt zabudowy pola nieustalony"
    return opis_rodzaju_i_nazwy("szyna", prady.punkt_nazwa)


def _zakres(prady: PradyPola, *, z_zanikiem: bool = False) -> ZakresWaznosci:
    """Zakres ważności rekordu pola. ``z_zanikiem`` — rekord porównuje I_b (prąd wyłączeniowy
    z zanikiem prądów maszyn): zakres nazywa wtedy krzywe zaniku μ/q wyznaczone na założeniu
    inżynierskim (karta PODSTAWA-Q, kontrakt werdyktu §4.1 — „rodzaj analizy i założenia").
    Rekordy porównujące I″k, i_p i I_th od μ/q nie zależą — ich zakres założeń nie niesie."""
    punkt = _opis_punktu(prady)
    zdanie = zdanie_zalozen_zaniku_ib_pl(prady.zalozenia_zaniku) if z_zanikiem else None
    dopisek = "" if zdanie is None else f" {zdanie}"
    return ZakresWaznosci(
        rodzaj_analizy="SHORT_CIRCUIT",
        opis_pl=(
            f"Zwarcie trójfazowe w punkcie zabudowy pola ({punkt}) wg zapisanego biegu "
            "IEC 60909; każdy aparat pola przewodzi co najwyżej prąd zwarcia w tym punkcie."
            + dopisek
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


#: Powód „nie dotyczy” kryteriów wytrzymałości dynamicznej i cieplnej aparatu, którego rodzaj
#: z definicji normy nie ma prądu krótkotrwałego ani szczytowego wytrzymywanego.
_POWOD_WYTRZYMALOSC_NIE_DOTYCZY_PL = (
    "rozłącznik bezpiecznikowy: wytrzymałość zwarciową zestawu wyznacza wkładka, która "
    "ogranicza i przerywa prąd zwarcia — prąd krótkotrwały i szczytowy wytrzymywany nie są "
    "zestawowi przypisywane (IEC 62271-105 § 4.5 i § 4.6); zestaw ocenia kryterium "
    "wyłączania wkładki"
)


def _stosowalnosc_wytrzymalosci(znamiona: dict[str, Any], powod_pl: str) -> Stosowalnosc:
    """Stosowalność kryterium dynamicznego/cieplnego — „nie dotyczy” wyłącznie z rodzaju
    (``znamiona["i_th_nie_dotyczy"]``), nigdy z braku danej."""
    if znamiona.get("i_th_nie_dotyczy"):
        return Stosowalnosc(dotyczy=False, powod_pl=_POWOD_WYTRZYMALOSC_NIE_DOTYCZY_PL)
    return Stosowalnosc(dotyczy=True, powod_pl=powod_pl)


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
    zapis_i_dyn = _zapis_roboczy(znamiona, PARAMETR_I_DYN)
    podstawa_limitu = _podstawa_znamienia(
        znamiona["i_dyn_pochodzenie"], etykieta, "i_dyn", zapis_i_dyn
    )
    # Prąd szczytowy z relacji normowej niesie też prąd krótkotrwały, z którego wynika.
    zapis_i_th = (
        _zapis_roboczy(znamiona, PARAMETR_I_TH)
        if zapis_i_dyn is not None and zapis_i_dyn.get("pochodzenie") == "PROPOZYCJA"
        else None
    )
    dane = _dane_przyjete([zapis_i_dyn, zapis_i_th], aparat_pl=przedmiot.nazwa_pl) + (
        _dane_pradow(prady, wielkosc="ip")
    )
    nie_dotyczy = bool(znamiona.get("i_th_nie_dotyczy"))
    braki: list[str] = []
    if prady.ip_ka is None and prady.powod_pl:
        braki.append(prady.powod_pl)
    limit: LimitKryterium | None = None
    if i_dyn is not None and podstawa_limitu is not None:
        limit = LimitKryterium(
            wartosc=Wielkosc(wartosc=float(i_dyn), jednostka="kA"), podstawa=podstawa_limitu
        )
    elif not nie_dotyczy:
        braki.append(
            f"pozycja katalogu „{etykieta}” nie niesie prądu szczytowego I_p (I_dyn), a "
            "propozycji wartości roboczej nie ma: "
            + str((zapis_i_dyn or {}).get("powod_braku_pl") or "brak uzasadnionego źródła")
        )
    wynik = (
        WynikKryterium(
            wielkosc_pl="prąd udarowy zwarcia trójfazowego w punkcie zabudowy pola",
            symbol_latex=r"i_p",
            wartosc=Wielkosc(wartosc=prady.ip_ka, jednostka="kA"),
            punkt_krytyczny_pl=f"zwarcie w punkcie zabudowy pola: {_opis_punktu(prady)}",
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
        stosowalnosc=_stosowalnosc_wytrzymalosci(
            znamiona, "aparat pola przewodzi prąd zwarcia w punkcie zabudowy pola"
        ),
        wynik=wynik,
        limit=limit,
        niepewnosc=_NIEPEWNOSC_POROWNANIA,
        # Rekord NIE_DOTYCZY niczego nie porównuje — nie stoi na żadnej danej przyjętej.
        dowod=_dowod(run_id, () if nie_dotyczy else dane),
        zakres_waznosci=_zakres(prady),
        slad=(
            OdnosnikSladu(
                run_id=run_id,
                krok=f"{kryterium_id}:dynamiczna",
                opis_pl=(
                    f"i_p = {prady.ip_ka} kA (wiersz biegu, punkt: {_opis_punktu(prady)}); "
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
    zapis_i_th = _zapis_roboczy(znamiona, PARAMETR_I_TH)
    zapis_t_th = _zapis_roboczy(znamiona, PARAMETR_T_TH)
    podstawa_limitu = _podstawa_znamienia(
        znamiona["i_th_pochodzenie"], etykieta, "i_th", zapis_i_th
    )
    zapis_czasu_wlasnego = czas.get("czas_wlasny") if t_k is not None else None
    dane = _dane_przyjete(
        [
            zapis_i_th,
            zapis_t_th,
            zapis_czasu_wlasnego if isinstance(zapis_czasu_wlasnego, dict) else None,
        ],
        aparat_pl=przedmiot.nazwa_pl,
    ) + _dane_pradow(prady, wielkosc="ith")
    nie_dotyczy = bool(znamiona.get("i_th_nie_dotyczy"))
    braki: list[str] = []
    if prady.ith_ka is None and prady.powod_pl:
        braki.append(prady.powod_pl)
    if not nie_dotyczy and (znamiona["i_th_ka"] is None or znamiona["i_th_duration_s"] is None):
        braki.append(
            f"pozycja katalogu „{etykieta}” nie niesie prądu krótkotrwałego I_th z czasem t_th, "
            "a propozycji wartości roboczej nie ma: "
            + str((zapis_i_th or {}).get("powod_braku_pl") or "brak uzasadnionego źródła")
        )
    if t_k is None and not nie_dotyczy:
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
            punkt_krytyczny_pl=f"zwarcie w punkcie zabudowy pola: {_opis_punktu(prady)}",
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
        stosowalnosc=_stosowalnosc_wytrzymalosci(
            znamiona, "aparat pola nagrzewa się prądem zwarcia do chwili jego wyłączenia"
        ),
        wynik=wynik,
        limit=limit,
        niepewnosc=_NIEPEWNOSC_POROWNANIA,
        dowod=_dowod(run_id, () if nie_dotyczy else dane),
        zakres_waznosci=_zakres(prady),
        slad=(
            OdnosnikSladu(
                run_id=run_id,
                krok=f"{kryterium_id}:cieplna",
                opis_pl=(
                    f"I_th = {prady.ith_ka} kA (wiersz biegu, punkt: {_opis_punktu(prady)}); "
                    f"T_k = {t_k} s (źródło: {czas.get('zrodlo')}); limit = {limit_ka} kA"
                ),
            ),
        ),
        braki_dodatkowe=braki,
    )


def _podstawa_wylaczania(wielkosc: WielkoscKryteriumWylaczania | None) -> PodstawaWymagania:
    """Podstawa kryterium wyłączania — z wybranej wielkości (``None`` = wyboru brak)."""
    if wielkosc is None:
        return PodstawaWymagania(
            rodzaj="NORMA",
            dokument="IEC 62271-100 (wyłącznik SN/WN) / IEC 60364-4-43 (nN)",
            wydanie="2008",
            jednostka_redakcyjna=(
                "wielkość porównywana zależy od pasma napięcia punktu zwarcia: I_b (SN/WN) "
                "albo I″k (nN)"
            ),
            status="WSKAZANE",
            uwagi_pl="bieg nie niesie napięcia znamionowego punktu — pasma nie da się ustalić",
        )
    return PodstawaWymagania(
        rodzaj="NORMA",
        dokument=wielkosc.dokument,
        wydanie=wielkosc.wydanie,
        jednostka_redakcyjna=wielkosc.jednostka_redakcyjna,
        status="WSKAZANE",
        uwagi_pl=(
            f"zdolność wyłączania aparatu porównana z {wielkosc.opis_pl} w punkcie zabudowy "
            f"pola ({wielkosc.norma})"
        ),
    )


def _ocena_wylaczania(
    *,
    kryterium_id: str,
    przedmiot: Przedmiot,
    znamiona: dict[str, Any],
    etykieta: str,
    prady: PradyPola,
    run_id: str,
) -> OcenaKryterium:
    """Rekord K zdolności wyłączania: I_cu aparatu wobec wielkości z jedynego predykatu.

    Wyłącznik SN/WN → I_b (IEC 62271-100 § 4.101, IEC 60909-0 rozdz. 9); nN i bezpiecznik →
    I″k spodziewany. Rozłącznik, odłącznik, uziemnik i tor szynowy — NIE_DOTYCZY z powodem.
    Brak I_b w wierszu to nazwany brak, nigdy podmiana na I″k. i_DC(t_b) — informacja
    w śladzie (katalog nie niesie znamionowej składowej nieokresowej, porównania z nią nie
    wystawiamy).

    Karta TB-WARTOSC-ROBOCZA (§0.4): I_b porównywany z I_cu policzony przy t_b będącym
    wartością roboczą (propozycja 0,1 s albo czas pola z roboczym czasem własnym wyłącznika)
    stoi na danej przyjętej — ``dane_przyjete`` (jakość ``ESTIMATED``), stan danych
    ``UNVALIDATED_INPUT``, kompletność ``NIEPELNY`` (SPELNIA → BRAK_DOWODU na poziomie
    werdyktu). Dotyczy wyłącznie I_b z udziałem maszyn wirujących — bez nich I_b = I″k nie
    zależy od t_b (IEC 60909-0:2016 rozdz. 9), a i_DC nie jest porównywana.
    """
    nie_dotyczy = bool(znamiona.get("i_cu_nie_dotyczy"))
    wielkosc = wielkosc_kryterium_wylaczania(
        prady.un_kv, bezpiecznik=bool(znamiona.get("bezpiecznik"))
    )
    i_cu = znamiona.get("i_cu_ka")
    braki: list[str] = []
    wartosc: float | None = None
    if wielkosc is None:
        if prady.powod_pl:
            braki.append(prady.powod_pl)
        else:
            braki.append(
                "wiersz biegu nie niesie napięcia znamionowego punktu zabudowy pola — nie "
                "wiadomo, czy porównać I_b (SN/WN, IEC 62271-100), czy I″k (nN)"
            )
    else:
        wartosc = prady.ib_ka if wielkosc.klucz == "ib_ka" else prady.ik_ka
        if wartosc is None and prady.powod_pl:
            braki.append(prady.powod_pl)
        elif wartosc is None:
            braki.append(
                f"wiersz biegu nie niesie wielkości {wielkosc.nazwa_pl} w punkcie zabudowy pola "
                "— przelicz bieg zwarciowy"
            )
    podstawa_limitu = _podstawa_znamienia(znamiona.get("i_cu_pochodzenie"), etykieta, "i_cu")
    limit: LimitKryterium | None = None
    if not nie_dotyczy:
        if i_cu is not None and podstawa_limitu is not None:
            limit = LimitKryterium(
                wartosc=Wielkosc(wartosc=float(i_cu), jednostka="kA"), podstawa=podstawa_limitu
            )
        else:
            braki.append(
                f"pozycja katalogu „{etykieta}” nie niesie znamionowej zdolności wyłączania "
                "zwarciowej I_cu"
            )
    wynik = (
        WynikKryterium(
            wielkosc_pl=f"{wielkosc.nazwa_pl} zwarcia trójfazowego w punkcie zabudowy pola",
            symbol_latex=wielkosc.symbol,
            wartosc=Wielkosc(wartosc=wartosc, jednostka="kA"),
            punkt_krytyczny_pl=f"zwarcie w punkcie zabudowy pola: {_opis_punktu(prady)}",
            metoda="OBLICZENIE",
        )
        if wielkosc is not None and wartosc is not None
        else None
    )
    symbol = wielkosc.symbol if wielkosc is not None else "I_b"
    dane = _dane_przyjete_czasu_tb(prady, wielkosc)
    tb_txt = (
        "nie podano"
        if prady.tb_s is None
        else f"{prady.tb_s} s ("
        + (
            str(prady.tb_zrodlo.get("opis_pl"))
            if prady.tb_zrodlo is not None
            else "scenariusz zwarciowy projektanta"
        )
        + ")"
    )
    idc_txt = "nieobliczona" if prady.i_dc_ka is None else f"{prady.i_dc_ka} kA"
    return ocen_kryterium(
        kryterium_id=f"{kryterium_id}.wylaczanie",
        przedmiot=przedmiot,
        kryterium=Kryterium(
            opis_pl=(
                "Prąd, który aparat ma przerwać w punkcie zabudowy pola, nie przekracza jego "
                "znamionowej zdolności wyłączania zwarciowej"
                + (f" ({wielkosc.nazwa_pl})" if wielkosc is not None else "")
            ),
            warunek_latex=rf"{symbol} \le I_{{cu}}",
            relacja="NIE_WIECEJ",
        ),
        podstawa=_podstawa_wylaczania(wielkosc),
        stosowalnosc=(
            Stosowalnosc(
                dotyczy=False,
                powod_pl=(
                    "aparat nie przerywa prądu zwarciowego z definicji normy (rozłącznik, "
                    "odłącznik, uziemnik, tor szynowy) — kryterium wyłączania go nie dotyczy"
                ),
            )
            if nie_dotyczy
            else Stosowalnosc(
                dotyczy=True,
                powod_pl="aparat pola przerywa prąd zwarciowy w punkcie zabudowy pola",
            )
        ),
        wynik=wynik,
        limit=limit,
        niepewnosc=_NIEPEWNOSC_POROWNANIA,
        # Suma danych przyjętych rekordu, deterministyczna kolejność: t_b roboczy (karta
        # TB-WARTOSC-ROBOCZA), potem tolerancja sieci nN (TOLERANCJA-NN-WARTOSC-ROBOCZA), potem
        # parametry robocze maszyn wpływające na porównywaną wielkość (PODSTAWA-Q).
        # Rekord NIE_DOTYCZY niczego nie porównuje — nie stoi na żadnej danej przyjętej.
        dowod=_dowod(
            run_id,
            (
                ()
                if nie_dotyczy
                else dane
                + _dane_pradow(
                    prady, wielkosc=wielkosc.wielkosc_zwarciowa if wielkosc is not None else None
                )
            ),
        ),
        # Karta PODSTAWA-Q: zakres nazywa założenia krzywych zaniku wyłącznie, gdy rekord
        # porównuje I_b (ten sam predykat wyboru wielkości co werdykt i dowód doboru).
        zakres_waznosci=_zakres(prady, z_zanikiem=wielkosc is WIELKOSC_IB and not nie_dotyczy),
        slad=(
            OdnosnikSladu(
                run_id=run_id,
                krok=f"{kryterium_id}:wylaczanie",
                opis_pl=(
                    f"{symbol} = {wartosc} kA (wiersz biegu, punkt: {_opis_punktu(prady)}, "
                    f"U_n = {prady.un_kv} kV); I_cu = {i_cu} kA; t_b = {tb_txt}; składowa "
                    f"nieokresowa i_DC(t_b) = {idc_txt} — informacyjnie (IEC 60909-0 "
                    "rozdz. 10), katalog nie niesie znamionowej składowej nieokresowej"
                ),
            ),
        ),
        braki_dodatkowe=braki,
    )


def _dane_przyjete_czasu_tb(
    prady: PradyPola, wielkosc: WielkoscKryteriumWylaczania | None
) -> tuple[DanaPrzyjeta, ...]:
    """Dana przyjęta kryterium wyłączania: t_b punktu będące wartością roboczą, gdy stoi za
    porównywanym I_b (karta TB-WARTOSC-ROBOCZA, §0.4) — nigdy ``DATASHEET``.

    Warunek z JEDNEGO źródła — flag wiersza wyniku: ``tb_zrodlo.wartosc_robocza``
    (``CzasWylaczeniaTb.robocza``) i ``tb_zrodlo.ib_z_udzialem_maszyn`` (rdzeń: I_b liczony
    z zanikiem prądów maszyn, więc zależny od t_b). Porównanie z I″k (nN, bezpiecznik) nie
    zależy od t_b — brak danej przyjętej.
    """
    zrodlo = prady.tb_zrodlo
    if (
        wielkosc is None
        or wielkosc.klucz != "ib_ka"
        or zrodlo is None
        or prady.tb_s is None
        or not zrodlo.get("wartosc_robocza")
        or not zrodlo.get("ib_z_udzialem_maszyn")
    ):
        return ()
    return (
        DanaPrzyjeta(
            nazwa_pl=f"czas wyłączenia t_b ({_opis_punktu(prady)})",
            wartosc=Wielkosc(wartosc=float(prady.tb_s), jednostka="s"),
            powod_pl=str(zrodlo["opis_pl"]),
            jakosc=FieldQuality.ESTIMATED,
        ),
    )


def _dopisek_wartosci_roboczych(znamiona: dict[str, Any], czas: dict[str, Any]) -> str:
    """Jedno zdanie komunikatu, gdy ocena stoi na wartościach roboczych (bez banera).

    Werdykt jądra mówi „OK”/„BLOKER” z liczb; dopisek mówi, że liczby aparatu nie pochodzą
    w całości z karty producenta — ocena jest obliczeniowa, nie potwierdzonym dowodem.
    """
    nazwy = [
        str(zapis["nazwa_pl"])
        for zapis in (
            *(znamiona.get("wartosci") or {}).values(),
            czas.get("czas_wlasny") if czas.get("t_clearing_s") is not None else None,
        )
        if isinstance(zapis, dict) and zapis.get("wartosc_robocza")
    ]
    if not nazwy:
        return ""
    return (
        f" Ocena na wartościach roboczych ({', '.join(nazwy)}) — wynik obliczeniowy, nie "
        "potwierdzony dowód zgodności."
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
        # „Nie dotyczy” (rodzaj) nie jest brakiem znamion — bez kodu gotowości.
        if not znamiona.get("i_th_nie_dotyczy") and (
            znamiona["i_dyn_ka"] is None or znamiona["i_th_ka"] is None
        ):
            kody.append(READINESS_POZYCJA_BEZ_ZNAMION)
        kody.extend(k for k in czas.get("kody_gotowosci", []) if k not in kody)
        # Czas wyłączenia służy wyłącznie kryterium cieplnemu — przy „nie dotyczy” nie brakuje.
        if czas.get("t_clearing_s") is None and not znamiona.get("i_th_nie_dotyczy"):
            kody.append(READINESS_CZAS_NIEUSTALONY)
        if not znamiona["i_cu_nie_dotyczy"] and znamiona["i_cu_ka"] is None:
            kody.append(READINESS_BRAK_ZDOLNOSCI_WYLACZANIA)
        nazwa = etykieta or "pozycja katalogu aparatów bez nazwy"
        limit_cieplny_ka: float | None = None
        if znamiona.get("i_th_nie_dotyczy"):
            komunikat = f"NIE DOTYCZY: aparatura „{nazwa}” — {_POWOD_WYTRZYMALOSC_NIE_DOTYCZY_PL}."
        elif prady.ip_ka is not None and prady.ith_ka is not None:
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
            komunikat = str(werdykt["message_pl"]) + _dopisek_wartosci_roboczych(znamiona, czas)
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
            _ocena_wylaczania(
                kryterium_id=kryterium_id,
                przedmiot=przedmiot,
                znamiona=znamiona,
                etykieta=nazwa,
                prady=prady,
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
        "czas_wlasny": None,
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
    "czas_wlasny": None,
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
    # Pola stacji z rekordów `bays` (jedyny nośnik pól, karta W5-B) — te same, które widzi
    # read-model pola, w kolejności identyfikatorów.
    pola_stacji = sorted(pola_stacji_modelu(enm, stacja.ref_id), key=lambda b: b.ref_id)

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
            znamiona, etykieta = _znamiona_z_aparat_sn(aparat)
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
