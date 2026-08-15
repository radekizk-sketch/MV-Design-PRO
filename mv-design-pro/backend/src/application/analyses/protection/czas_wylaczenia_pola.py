"""Czas wyłączenia zwarcia PER POLE STACJI z nastaw zabezpieczeń (karta KD-6, poz. 3).

DŁUG, KTÓRY TO ZAMYKA (nazwany w odbiorze V12K-291). Kryterium cieplne
wytrzymałości aparatury (I_th ≤ I_th_zn·√(t_zn/t_wył)) potrzebuje czasu
wyłączenia. Do tej karty czas brał się WYŁĄCZNIE z liczby WPISANEJ RĘCZNIE w
konfiguracji stacji — czyli werdykt cieplny opierał się na deklaracji
projektanta, choć wyglądał jak wynik z modelu. Model tymczasem niesie nastawy
zabezpieczeń pola, a katalog aparatu — jego czas własny.

CO ROBI TEN MODUŁ: dla każdego pola stacji składa czas wyłączenia z DWÓCH
członów, obu pochodzących z danych:

    t_wył = t_nastawy(charakterystyka, prąd zwarciowy) + t_własny(aparat)

WARSTWA ANALIZ, NIE SOLVER: żaden wzór nie powstaje tutaj. Czas członu
nastawczego liczy solver ``protection_iec60255.compute_curve_trip_time``
(IEC 60255-151), wybór stopnia jest ten sam, co dla gałęzi
(``czas_wylaczenia_galezi.nastawa_zwarciowa`` — jedna reguła, nie dwie), a czas
własny to odczyt pozycji katalogu APARAT_SN. Sumowanie dwóch czasów NIE jest
fizyką — to definicja czasu trwania zwarcia (IEC 60909-0 § 4.7).

ZERO HEURYSTYK I ZERO FABRYKACJI:
  - brak nastaw / brak prądu / prąd poniżej rozruchu ⇒ czas ``None`` z kodem
    gotowości i powodem po polsku (NIGDY wartość zastępcza),
  - brak czasu własnego w karcie katalogowej ⇒ czas niesie SAM człon nastawczy
    z JAWNYM założeniem wypisanym w odpowiedzi (a nie cicha wartość 0,05 s,
    którą inne moduły przyjmują jako parametr konfiguracyjny analizy).

WHITE BOX: odpowiedź niesie oba człony osobno, nastawę (funkcja, próg, krzywa,
mnożnik), stałe charakterystyki użyte w rachunku i prąd, przy którym czas
policzono.
"""

from __future__ import annotations

from typing import Any

from application.analyses.aparaty_pol import aparaty_pol_stacji, znajdz_stacje
from application.analyses.protection.czas_wylaczenia_galezi import (
    ZRODLO_PONIZEJ_ROZRUCHU,
    czas_z_nastawy,
    nastawa_zwarciowa,
)
from application.field_read_model import collect_bays
from enm.models import EnergyNetworkModel
from network_model.catalog import get_default_mv_catalog

# ---------------------------------------------------------------------------
# Kody gotowości i źródła — brak nazwany wprost
# ---------------------------------------------------------------------------

READINESS_BRAK_PRADU = "aparatura.brak_pradu_poczatkowego"
READINESS_BRAK_APARATU = "aparatura.pole_bez_aparatu"
READINESS_BRAK_NASTAW = "aparatura.brak_nastaw_pola"
READINESS_PONIZEJ_ROZRUCHU = "aparatura.prad_ponizej_rozruchu"
READINESS_BRAK_CZASU_WLASNEGO = "aparatura.brak_czasu_wlasnego_wylacznika"

ZRODLO_NASTAWY_POLA = "nastawy_pola"

_ZALOZENIE_BEZ_CZASU_WLASNEGO = (
    "Czas wyłączenia to sam człon nastawczy zabezpieczenia — karta katalogowa "
    "aparatu nie niesie czasu własnego, więc nie został doliczony."
)


def _bez_czasu(kod: str, powod_pl: str, **slad: Any) -> dict[str, Any]:
    return {
        "t_clearing_s": None,
        "zrodlo": None,
        "powod_pl": powod_pl,
        "czlon_nastawczy_s": None,
        "czas_wlasny_wylacznika_s": None,
        "zalozenia_pl": [],
        "kody_gotowosci": [kod],
        **slad,
    }


def _przypisanie_pola(
    enm: EnergyNetworkModel, aparat_refy: set[str], protection_ref: str | None
) -> dict[str, Any] | None:
    """Czynne zabezpieczenie pola: po wyłączniku pola albo po ``protection_ref``.

    Kolejność deterministyczna (po ``ref_id``), żeby pole z dwoma przypisaniami
    zawsze dawało ten sam czas.
    """
    kandydaci = [
        wpis
        for wpis in sorted(enm.protection_assignments, key=lambda w: str(w.ref_id))
        if wpis.is_enabled
        and (wpis.breaker_ref in aparat_refy or (protection_ref and wpis.ref_id == protection_ref))
    ]
    if not kandydaci:
        return None
    return kandydaci[0].model_dump()


def _czas_wlasny_aparatu(catalog_refy: list[str]) -> tuple[float | None, str | None]:
    """Czas własny aparatu z katalogu APARAT_SN (wartość, referencja pozycji)."""
    katalog = get_default_mv_catalog()
    for catalog_ref in catalog_refy:
        pozycja = katalog.get_mv_apparatus_type(catalog_ref)
        if pozycja is not None and pozycja.break_time_s is not None:
            return pozycja.break_time_s, catalog_ref
    return None, None


def czasy_wylaczenia_pol_stacji(
    *,
    enm: EnergyNetworkModel,
    station_ref: str,
    ik_ka: float | None,
) -> dict[str, dict[str, Any]]:
    """Czas wyłączenia dla każdego pola stacji, ze śladem pochodzenia.

    Args:
        enm: model (pola, aparaty, nastawy zabezpieczeń).
        station_ref: referencja stacji (``ref_id`` albo ``id``).
        ik_ka: prąd zwarciowy początkowy punktu [kA] — przy nim sprawdzana jest
            charakterystyka zabezpieczenia. ``None`` ⇒ czasu nie da się wyznaczyć
            (charakterystyka odwrotna zależy od prądu, a prądu nie zgadujemy).

    Returns:
        Mapa referencja pola → rozbicie czasu wyłączenia. Pole bez rozstrzygnięcia
        dostaje ``t_clearing_s = None`` z kodem gotowości i powodem po polsku.
    """
    stacja = znajdz_stacje(enm, station_ref)
    if stacja is None:
        return {}

    aparaty = aparaty_pol_stacji(enm, stacja)
    prad_a = ik_ka * 1000.0 if ik_ka is not None else None
    wynik: dict[str, dict[str, Any]] = {}

    for bay in collect_bays(enm):
        if bay.substation_ref != stacja.ref_id:
            continue
        aparaty_pola = aparaty.get(bay.ref_id, [])
        if not aparaty_pola:
            wynik[bay.ref_id] = _bez_czasu(
                READINESS_BRAK_APARATU,
                "Pole nie ma w modelu aparatu z katalogu, więc nie ma czym wyłączyć zwarcia.",
            )
            continue

        wpis = _przypisanie_pola(enm, {a.aparat_ref for a in aparaty_pola}, bay.protection_ref)
        if wpis is None:
            wynik[bay.ref_id] = _bez_czasu(
                READINESS_BRAK_NASTAW,
                "Aparat tego pola nie ma przypisanego czynnego zabezpieczenia, "
                "więc czas zadziałania jest niewyznaczalny.",
            )
            continue

        nastawa = nastawa_zwarciowa(wpis)
        if nastawa is None:
            wynik[bay.ref_id] = _bez_czasu(
                READINESS_BRAK_NASTAW,
                f"Zabezpieczenie {wpis.get('name') or wpis.get('ref_id')} nie ma nastawy "
                "funkcji nadprądowej zwarciowej (50/51) z progiem rozruchowym.",
                urzadzenie_ref=wpis.get("ref_id"),
            )
            continue

        prog = float(nastawa["threshold_a"])
        funkcja = str(nastawa.get("function_type"))
        if prad_a is None:
            wynik[bay.ref_id] = _bez_czasu(
                READINESS_BRAK_PRADU,
                "Wynik biegu nie niesie prądu zwarciowego początkowego, więc nie ma "
                "przy jakim prądzie sprawdzić charakterystyki zabezpieczenia.",
                urzadzenie_ref=wpis.get("ref_id"),
                funkcja=funkcja,
                prad_rozruchowy_a=prog,
            )
            continue

        czas_nastawy, powod_braku, krzywa_txt, stale = czas_z_nastawy(nastawa, prad_a)
        slad: dict[str, Any] = {
            "urzadzenie_ref": wpis.get("ref_id"),
            "urzadzenie_nazwa": wpis.get("name"),
            "funkcja": funkcja,
            "krzywa": krzywa_txt,
            "prad_rozruchowy_a": prog,
            "prad_zwarciowy_a": prad_a,
            "tms": nastawa.get("time_multiplier"),
            "stala_a": stale[0] if stale else None,
            "stala_b": stale[1] if stale else None,
        }

        if czas_nastawy is None:
            ponizej = powod_braku == ZRODLO_PONIZEJ_ROZRUCHU
            wynik[bay.ref_id] = _bez_czasu(
                READINESS_PONIZEJ_ROZRUCHU if ponizej else READINESS_BRAK_NASTAW,
                (
                    (
                        f"Prąd zwarciowy {prad_a:.1f} A nie przekracza progu rozruchowego "
                        f"{prog:g} A funkcji {funkcja}, więc to zabezpieczenie nie zadziała."
                    )
                    if ponizej
                    else (
                        f"Nastawa funkcji {funkcja} jest niekompletna (brak zwłoki albo "
                        f"mnożnika czasowego dla charakterystyki {krzywa_txt})."
                    )
                ),
                **slad,
            )
            continue

        czas_wlasny, pozycja_ref = _czas_wlasny_aparatu([a.catalog_ref for a in aparaty_pola])
        zalozenia: list[str] = []
        kody: list[str] = []
        if czas_wlasny is None:
            zalozenia.append(_ZALOZENIE_BEZ_CZASU_WLASNEGO)
            kody.append(READINESS_BRAK_CZASU_WLASNEGO)

        wynik[bay.ref_id] = {
            "t_clearing_s": round(czas_nastawy + (czas_wlasny or 0.0), 6),
            "zrodlo": ZRODLO_NASTAWY_POLA,
            "powod_pl": (
                f"Czas z charakterystyki {krzywa_txt} zabezpieczenia "
                f"{wpis.get('name') or wpis.get('ref_id')} przy prądzie {prad_a:.1f} A"
                + (" powiększony o czas własny aparatu." if czas_wlasny is not None else ".")
            ),
            "czlon_nastawczy_s": czas_nastawy,
            "czas_wlasny_wylacznika_s": czas_wlasny,
            "czas_wlasny_pozycja_ref": pozycja_ref,
            "zalozenia_pl": zalozenia,
            "kody_gotowosci": kody,
            **slad,
        }

    return wynik
