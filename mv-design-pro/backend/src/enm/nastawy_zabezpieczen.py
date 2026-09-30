"""Walidacja zapisu nastaw zabezpieczeń do modelu — JEDNA reguła dla każdego pisarza.

Pisarze nastaw (karta BIEG-ZABEZPIECZEN-Z-MODELU, decyzja D-21 — nastawy bazowe żyją w
modelu przy urządzeniu):

* ``add_relay`` (operacja domenowa V2) — nastawy przy tworzeniu przypisania,
* ``update_protection_settings`` (operacja domenowa V2) — edycja nastaw w karcie pola,
* ``attach_protection`` / ``update_protection`` (operacje topologiczne) — ten sam kształt.

Zapis przyjmuje nastawy NIEKOMPLETNE (projektant wpisuje je stopniowo — brak progu,
jednostki, charakterystyki czy zwłoki to nazwany brak gotowości oceny,
``application.analyses.protection.ocena_nadpradowa.rozwiaz_nastawy``), ale odrzuca
nastawy SPRZECZNE: wartość niedodatnią, próg bez jednostki strony przekładnika (PZ-09),
zwłokę przy charakterystyce zależnej, mnożnik przy czasie niezależnym, drugi wpis tej
samej funkcji, pola innej rodziny funkcji. Sprzeczna nastawa nie ma poprawnego odczytu —
zapisana dawałaby wynik zależny od kolejności czytania pól.

Moduł importuje wyłącznie modele ENM (liść warstwy domeny).
"""

from __future__ import annotations

from typing import Any

from enm.models import ProtectionSetting
from pydantic import ValidationError

#: Funkcje prądowe (próg ``threshold_a`` z jednostką strony przekładnika).
FUNKCJE_PRADOWE: frozenset[str] = frozenset(
    {
        "overcurrent_50",
        "overcurrent_51",
        "earth_fault_50N",
        "earth_fault_51N",
        "directional_67",
        "directional_67N",
    }
)

#: Etykiety jednostki progu prądowego (strona przekładnika, PZ-09) — JEDNO źródło dla słownika
#: edytora nastaw (``ocena_nadpradowa.slownik_nastaw``) i karty pola (``field_read_model``).
ETYKIETY_JEDNOSTEK_PROGU_PL: dict[str, str] = {
    "A_WTORNY": "A (strona wtórna przekładnika)",
    "A_PIERWOTNY": "A (strona pierwotna przekładnika)",
}
#: Opis progu zapisanego bez zadeklarowanej strony przekładnika (model sprzed PZ-09 albo
#: nastawa w trakcie wpisywania) — jednostka nazwana jako nieustalona, nigdy „A" bez strony.
JEDNOSTKA_PROGU_NIEUSTALONA_PL = "A (strona przekładnika niezadeklarowana)"

#: Pola nastaw, które mają sens wyłącznie dla funkcji napięciowo-częstotliwościowych (LoM).
_POLA_LOM = ("threshold_hz_s", "threshold_deg", "threshold_hz")

_ETYKIETY_FUNKCJI_PL: dict[str, str] = {
    "overcurrent_50": "I>> (50)",
    "overcurrent_51": "I> (51)",
    "earth_fault_50N": "I0>> (50N)",
    "earth_fault_51N": "I0> (51N)",
    "directional_67": "kierunkowa (67)",
    "directional_67N": "kierunkowa ziemnozwarciowa (67N)",
    "rocof_81R": "df/dt (81R)",
    "vector_shift_78": "przesunięcie wektora (78)",
    "underfrequency_81U": "f< (81U)",
    "overfrequency_81O": "f> (81O)",
}


def etykieta_funkcji(funkcja: object) -> str:
    """Etykieta funkcji dla projektanta (kod ANSI w nawiasie, nazwa po polsku)."""
    return _ETYKIETY_FUNKCJI_PL.get(str(funkcja), "funkcja spoza słownika")


def bledy_nastaw(settings: object) -> list[str]:
    """Sprzeczności nastaw do zapisu (puste = zapis dozwolony). Zdania po polsku.

    Kontrakt: ``settings`` to lista słowników w kształcie ``ProtectionSetting``.
    """
    if not isinstance(settings, list):
        return ["Nastawy zabezpieczenia muszą być listą stopni (funkcji)."]
    bledy: list[str] = []
    widziane: set[str] = set()
    for indeks, wpis in enumerate(settings, start=1):
        if not isinstance(wpis, dict):
            bledy.append(f"Stopień {indeks}: nastawa musi być słownikiem pól.")
            continue
        try:
            nastawa = ProtectionSetting.model_validate(wpis)
        except ValidationError as blad:
            pola = ", ".join(sorted({str(e["loc"][0]) for e in blad.errors() if e.get("loc")}))
            bledy.append(f"Stopień {indeks}: niepoprawne pola nastawy ({pola}).")
            continue
        etykieta = etykieta_funkcji(nastawa.function_type)
        if nastawa.function_type in widziane:
            bledy.append(f"Funkcja {etykieta} występuje w nastawach więcej niż raz.")
        widziane.add(nastawa.function_type)
        for pole, wartosc in (
            ("threshold_a", nastawa.threshold_a),
            ("time_multiplier", nastawa.time_multiplier),
        ):
            if wartosc is not None and wartosc <= 0:
                bledy.append(f"Funkcja {etykieta}: {_POLA_PL[pole]} musi być dodatni.")
        if nastawa.time_delay_s is not None and nastawa.time_delay_s < 0:
            bledy.append(f"Funkcja {etykieta}: zwłoka nie może być ujemna.")
        if nastawa.function_type in FUNKCJE_PRADOWE:
            if nastawa.time_delay_s is not None and nastawa.time_delay_s == 0:
                bledy.append(
                    f"Funkcja {etykieta}: zwłoka musi być dodatnia — wpisz czas nastawiony "
                    "przekaźnika (co najmniej jego czas własny)."
                )
            if nastawa.threshold_a is not None and nastawa.threshold_unit is None:
                bledy.append(
                    f"Funkcja {etykieta}: próg prądowy wymaga jednostki — strona wtórna albo "
                    "pierwotna przekładnika."
                )
            if nastawa.curve_type == "DT" and nastawa.time_multiplier is not None:
                bledy.append(
                    f"Funkcja {etykieta}: czas niezależny (DT) nie ma mnożnika czasowego — "
                    "czas nastawia zwłoka."
                )
            if (
                nastawa.curve_type is not None
                and nastawa.curve_type != "DT"
                and nastawa.time_delay_s is not None
            ):
                bledy.append(
                    f"Funkcja {etykieta}: charakterystyka zależna nie ma zwłoki niezależnej — "
                    "czas nastawia mnożnik czasowy."
                )
            for pole in _POLA_LOM:
                if getattr(nastawa, pole) is not None:
                    bledy.append(
                        f"Funkcja {etykieta}: pole {_POLA_PL[pole]} należy do funkcji "
                        "częstotliwościowych i napięciowych."
                    )
        else:
            for pole in ("threshold_a", "threshold_unit", "curve_type", "time_multiplier"):
                if getattr(nastawa, pole) is not None:
                    bledy.append(
                        f"Funkcja {etykieta}: pole {_POLA_PL[pole]} należy do funkcji prądowych."
                    )
    return bledy


_POLA_PL: dict[str, str] = {
    "threshold_a": "próg prądowy",
    "threshold_unit": "jednostka progu",
    "curve_type": "charakterystyka",
    "time_multiplier": "mnożnik czasowy",
    "threshold_hz_s": "próg df/dt",
    "threshold_deg": "próg przesunięcia wektora",
    "threshold_hz": "próg częstotliwości",
}


def normalizuj_nastawy(settings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Nastawy po walidacji w kształcie modelu (``exclude_none``), posortowane po funkcji —
    ten sam zapis dla tej samej treści niezależnie od kolejności w żądaniu (determinizm)."""
    return sorted(
        (
            ProtectionSetting.model_validate(wpis).model_dump(mode="json", exclude_none=True)
            for wpis in settings
        ),
        key=lambda n: str(n["function_type"]),
    )


__all__ = ["FUNKCJE_PRADOWE", "bledy_nastaw", "etykieta_funkcji", "normalizuj_nastawy"]
