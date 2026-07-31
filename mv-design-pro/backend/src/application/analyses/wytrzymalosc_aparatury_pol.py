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
  - prądy pochodzą z WYNIKU biegu zwarciowego (wywołujący je podaje),
  - czas wyłączenia pochodzi z osobnego dostawcy (poz. 3) albo z konfiguracji.

ZERO FABRYKACJI: pozycja katalogu bez znamion wytrzymałości daje werdykt
„NIEUSTALONE" z kodem gotowości — nigdy przelicznika z prądu łączeniowego ani
werdyktu negatywnego. Brak danej to inny stan niż „nie wytrzymuje".

DETERMINIZM: pola sortowane po (oznaczenie, referencja aparatu); wiersze z
konfiguracji po oznaczeniu. Ten sam model + ta sama konfiguracja + te same
prądy ⇒ identyczna odpowiedź.
"""

from __future__ import annotations

from typing import Any

from application.field_read_model import collect_bays
from enm.models import Bay, EnergyNetworkModel, Substation
from network_model.catalog import get_default_mv_catalog
from network_model.catalog.audit2_catalogs import (
    get_device_withstand,
    ocen_wytrzymalosc_aparatu,
)

# ---------------------------------------------------------------------------
# Kody gotowości — jawny brak zamiast cichego zera
# ---------------------------------------------------------------------------

READINESS_STACJA_NIEZNANA = "aparatura.stacja_nieznana"
READINESS_BRAK_PRADOW = "aparatura.brak_pradow_biegu"
READINESS_BRAK_POL_Z_APARATEM = "aparatura.brak_pol_z_aparatem"
READINESS_APARAT_SPOZA_KATALOGU = "aparatura.aparat_spoza_katalogu"
READINESS_POZYCJA_BEZ_ZNAMION = "aparatura.pozycja_bez_znamion_wytrzymalosci"
READINESS_CZAS_NIEUSTALONY = "aparatura.czas_wylaczenia_nieustalony"

#: Źródło aparatu w wierszu werdyktu.
ZRODLO_MODEL = "model"
ZRODLO_KONFIGURACJA = "konfiguracja"

#: Kategoria katalogu, którą operacje domenowe wiążą z aparatem pola SN (B-12).
_NAMESPACE_APARAT_SN = "APARAT_SN"

#: Rola pola → nazwa po polsku (strefa pierwszoplanowa mówi po polsku, nie kodem).
_ROLA_PL: dict[str, str] = {
    "IN": "liniowe dopływowe",
    "OUT": "liniowe odpływowe",
    "FEEDER": "odpływowe",
    "TR": "transformatorowe",
    "COUPLER": "sprzęgłowe",
    "MEASUREMENT": "pomiarowe",
    "OZE": "źródłowe OZE",
}


def _stacja(enm: EnergyNetworkModel, station_ref: str) -> Substation | None:
    # Dopasowanie po ref_id (odnośnik domenowy) LUB id (UUID elementu) — spójnie
    # z widokiem pętli zwarcia, bo wołający podaje raz jedno, raz drugie.
    return next(
        (s for s in enm.substations if station_ref in (s.ref_id, str(getattr(s, "id", "")))),
        None,
    )


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
    return (bay.bay_number or bay.name or bay.ref_id).strip()


def _aparaty_pol_stacji(
    enm: EnergyNetworkModel, station: Substation
) -> dict[str, list[dict[str, Any]]]:
    """Aparaty katalogowe pól tej stacji: referencja pola → lista aparatów.

    Aparat pola jest gałęzią łącznikową z wiązaniem katalogu APARAT_SN
    (``insert_station_on_segment_sn`` / ``append_station_on_endpoint`` /
    ``add_sn_bay``). Referencja pola siedzi w ``meta`` gałęzi — raz jako
    ``bay_ref``, raz jako ``field_ref`` (zależnie od operacji), więc czytamy oba.
    """
    wynik: dict[str, list[dict[str, Any]]] = {}
    for branch in enm.branches:
        if getattr(branch, "catalog_namespace", None) != _NAMESPACE_APARAT_SN:
            continue
        catalog_ref = getattr(branch, "catalog_ref", None)
        if not catalog_ref:
            continue
        meta = dict(getattr(branch, "meta", None) or {})
        if meta.get("station_ref") not in (None, station.ref_id):
            continue
        pole_ref = meta.get("bay_ref") or meta.get("field_ref")
        if not isinstance(pole_ref, str) or not pole_ref:
            continue
        wynik.setdefault(pole_ref, []).append(
            {
                "aparat_ref": branch.ref_id,
                "aparat_nazwa": branch.name,
                "catalog_ref": str(catalog_ref),
            }
        )
    for pozycje in wynik.values():
        pozycje.sort(key=lambda p: str(p["aparat_ref"]))
    return wynik


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
    i_peak_ka: float,
    i_thermal_ka: float,
) -> dict[str, Any]:
    kody: list[str] = []
    werdykt: dict[str, Any] | None = None

    if znamiona is None:
        kody.append(READINESS_APARAT_SPOZA_KATALOGU)
    else:
        if znamiona["i_dyn_ka"] is None or znamiona["i_th_ka"] is None:
            kody.append(READINESS_POZYCJA_BEZ_ZNAMION)
        if czas.get("t_clearing_s") is None:
            kody.append(READINESS_CZAS_NIEUSTALONY)
        werdykt = ocen_wytrzymalosc_aparatu(
            etykieta_pl=etykieta or catalog_ref,
            i_dyn_ka=znamiona["i_dyn_ka"],
            i_th_ka=znamiona["i_th_ka"],
            i_th_duration_s=znamiona["i_th_duration_s"],
            i_peak_calculated_ka=i_peak_ka,
            i_thermal_calculated_ka=i_thermal_ka,
            t_clearing_s=czas.get("t_clearing_s"),
        )

    return {
        "pole": oznaczenie,
        "pole_ref": pole_ref,
        "rola": rola,
        "rola_pl": _ROLA_PL.get(str(rola)) if rola else None,
        "zrodlo": zrodlo,
        "aparat_ref": aparat_ref,
        "aparat_nazwa": aparat_nazwa,
        "aparat_catalog_ref": catalog_ref,
        "aparat_etykieta": etykieta,
        "znamiona": znamiona,
        "czas_wylaczenia": czas,
        "werdykt": werdykt,
        "komunikat_pl": (
            werdykt["message_pl"]
            if werdykt is not None
            else (
                f"Aparat {catalog_ref} nie występuje w katalogu — "
                "wytrzymałości zwarciowej nie da się sprawdzić."
            )
        ),
        "kody_gotowosci": kody,
    }


def _czas_z_konfiguracji(spec: dict[str, Any]) -> dict[str, Any]:
    """Czas wyłączenia zapisany ręcznie w konfiguracji stacji (stan dotychczasowy)."""
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


def zbuduj_widok_wytrzymalosci_aparatury(
    *,
    enm: EnergyNetworkModel,
    station_ref: str,
    i_peak_ka: float | None,
    i_thermal_ka: float | None,
    bay_device_withstand: dict[str, Any] | None = None,
    czasy_pol: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Werdykty wytrzymałości dla wszystkich pól stacji (model + konfiguracja).

    Args:
        enm: model, z którego czytamy pola stacji i aparaty katalogowe.
        station_ref: referencja stacji (``ref_id`` albo ``id`` elementu).
        i_peak_ka: prąd udarowy z WYNIKU biegu [kA] (kryterium dynamiczne).
        i_thermal_ka: prąd cieplny zastępczy z WYNIKU biegu [kA].
        bay_device_withstand: zapisana konfiguracja stacji (oznaczenie pola →
            wskazany aparat + czas wyłączenia). Nadrzędna wobec modelu.
        czasy_pol: czasy wyłączenia wyznaczone z nastaw pól (poz. 3), kluczowane
            referencją pola. Brak wpisu = czas nieustalony (nie zero).

    Returns:
        Widok: stacja, lista pól z werdyktami, kody gotowości. Nigdy nie
        fabrykuje znamion ani czasu.
    """
    stacja = _stacja(enm, station_ref)
    if stacja is None:
        return {
            "stacja_ref": station_ref,
            "stacja_nazwa": None,
            "status": "brak danych",
            "pola": [],
            "kody_gotowosci": [READINESS_STACJA_NIEZNANA],
        }

    if i_peak_ka is None or i_thermal_ka is None:
        # Bez prądów nie ma czego porównywać, a podstawienie zera byłoby
        # fabrykacją bezpiecznego werdyktu.
        return {
            "stacja_ref": stacja.ref_id,
            "stacja_nazwa": stacja.name,
            "status": "brak danych",
            "pola": [],
            "kody_gotowosci": [READINESS_BRAK_PRADOW],
        }

    konfiguracja = {
        str(klucz): dict(wartosc)
        for klucz, wartosc in (bay_device_withstand or {}).items()
        if isinstance(wartosc, dict)
    }
    czasy = dict(czasy_pol or {})
    aparaty = _aparaty_pol_stacji(enm, stacja)
    pola_stacji = [bay for bay in collect_bays(enm) if bay.substation_ref == stacja.ref_id]

    wiersze: list[dict[str, Any]] = []
    zuzyte_klucze_konfiguracji: set[str] = set()

    for bay in pola_stacji:
        oznaczenie = _oznaczenie_glowne(bay)
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
                    i_peak_ka=i_peak_ka,
                    i_thermal_ka=i_thermal_ka,
                )
            )
            continue

        for aparat in aparaty.get(bay.ref_id, []):
            znamiona, etykieta = _znamiona_z_aparat_sn(aparat["catalog_ref"])
            wiersze.append(
                _wiersz(
                    oznaczenie=oznaczenie,
                    pole_ref=bay.ref_id,
                    rola=bay.bay_role,
                    zrodlo=ZRODLO_MODEL,
                    aparat_ref=aparat["aparat_ref"],
                    aparat_nazwa=aparat["aparat_nazwa"],
                    catalog_ref=aparat["catalog_ref"],
                    znamiona=znamiona,
                    etykieta=etykieta,
                    czas=czasy.get(bay.ref_id, _CZAS_NIEUSTALONY),
                    i_peak_ka=i_peak_ka,
                    i_thermal_ka=i_thermal_ka,
                )
            )

    # Wpisy konfiguracji bez odpowiednika w modelu: to ŚWIADOMY zapis inżyniera,
    # więc nie znika z ekranu tylko dlatego, że oznaczenie nie pasuje do pola.
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
                i_peak_ka=i_peak_ka,
                i_thermal_ka=i_thermal_ka,
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
        "i_peak_ka": i_peak_ka,
        "i_thermal_ka": i_thermal_ka,
        "pola": wiersze,
        "kody_gotowosci": kody,
    }
