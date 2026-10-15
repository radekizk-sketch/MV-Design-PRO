"""Wyłączniki liniowe — wyłączniki w torze odcinka SN, które nie należą do pola rozdzielnicy.

Karta BIEG-ZABEZPIECZEN-Z-MODELU: przekładnik i zabezpieczenie mogą stać przy wyłączniku
wstawionym w odcinek (``insert_section_switch_sn`` z ``switch_type="WYLACZNIK"`` — wyłącznik
sekcyjny z zabezpieczeniem, np. reklozer). Pole rozdzielnicy jest zawsze PIERWSZĄ kotwicą:
wyłącznik wymieniony w wyposażeniu pola (``bays[].equipment_refs`` albo specyfikacje pól stacji
``field_specs``/``nn_field_specs``) jest wyłącznikiem POLA i jego przekładnik/zabezpieczenie
wskazuje się przez pole. Wyłącznik liniowy leży w sieci SN: obie jego szyny mają napięcie w
paśmie SN (``network_model.pochodne.pasma_napieciowe``) — aparat strony nN stacji albo sieci WN
nie jest kotwicą przekładnika i przekaźnika nadprądowego SN. Jedno źródło tej reguły
(``odmowa_kotwicy_wylacznika``) dla operacji zapisu (``add_ct``, ``add_relay``) i read modelu
(``wylaczniki_liniowe``).

Moduł działa na migawce (słownik ``model_dump``) i importuje wyłącznie bibliotekę standardową
oraz liść ``network_model.pochodne.pasma_napieciowe`` (``math``/``typing``).
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Literal

from network_model.pochodne.pasma_napieciowe import pasmo_napieciowe

#: Typ gałęzi łącznika, który jest wyłącznikiem (przerywa prąd zwarciowy).
TYP_WYLACZNIKA = "breaker"


def _specyfikacje_pol(enm: Mapping[str, Any]) -> list[Mapping[str, Any]]:
    wynik: list[Mapping[str, Any]] = [
        pole for pole in enm.get("bays") or [] if isinstance(pole, Mapping)
    ]
    for stacja in enm.get("substations") or []:
        meta = stacja.get("meta") if isinstance(stacja, Mapping) else None
        if not isinstance(meta, Mapping):
            continue
        for klucz in ("field_specs", "nn_field_specs"):
            wynik.extend(s for s in meta.get(klucz) or [] if isinstance(s, Mapping))
    return wynik


def pole_aparatu(enm: Mapping[str, Any], aparat_ref: str) -> str | None:
    """Pole (``ref_id`` elementu ``bays`` albo ``field_ref`` specyfikacji), do którego należy
    aparat, albo ``None``."""
    for pole in _specyfikacje_pol(enm):
        wyposazenie = pole.get("equipment_refs") or []
        if isinstance(wyposazenie, list) and aparat_ref in wyposazenie:
            ref = pole.get("ref_id") or pole.get("field_ref")
            return str(ref) if ref else None
    return None


#: Powód, dla którego aparat NIE jest wyłącznikiem liniowym (kotwicą przekładnika/przekaźnika).
PowodOdmowyKotwicy = Literal["NIE_WYLACZNIK", "W_POLU", "POZA_SIECIA_SN"]


def odmowa_kotwicy_wylacznika(
    enm: Mapping[str, Any], aparat_ref: object
) -> PowodOdmowyKotwicy | None:
    """``None`` — aparat jest wyłącznikiem liniowym SN; inaczej powód odmowy.

    Kolejność kontroli jest częścią kontraktu (od najogólniejszej): gałąź typu ``breaker`` →
    poza wyposażeniem pola → obie szyny w paśmie SN (szyna bez napięcia nie potwierdza pasma).
    """
    galaz = next(
        (
            g
            for g in enm.get("branches") or []
            if isinstance(g, Mapping)
            and g.get("ref_id") == aparat_ref
            and g.get("type") == TYP_WYLACZNIKA
        ),
        None,
    )
    if galaz is None:
        return "NIE_WYLACZNIK"
    if pole_aparatu(enm, str(aparat_ref)) is not None:
        return "W_POLU"
    napiecia = {
        str(szyna.get("ref_id")): szyna.get("voltage_kv")
        for szyna in enm.get("buses") or []
        if isinstance(szyna, Mapping)
    }
    for zacisk in ("from_bus_ref", "to_bus_ref"):
        if pasmo_napieciowe(napiecia.get(str(galaz.get(zacisk)))) != "SN":
            return "POZA_SIECIA_SN"
    return None


def wylaczniki_liniowe(enm: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Wyłączniki liniowe modelu z przekładnikami i zabezpieczeniami przy nich (posortowane)."""
    przekladniki: dict[str, list[str]] = {}
    for pomiar in enm.get("measurements") or []:
        if not isinstance(pomiar, Mapping) or pomiar.get("measurement_type") != "CT":
            continue
        meta = pomiar.get("meta")
        kotwica = meta.get("breaker_ref") if isinstance(meta, Mapping) else None
        if isinstance(kotwica, str):
            przekladniki.setdefault(kotwica, []).append(str(pomiar.get("ref_id")))
    zabezpieczenia: dict[str, list[str]] = {}
    for przypisanie in enm.get("protection_assignments") or []:
        if isinstance(przypisanie, Mapping) and isinstance(przypisanie.get("breaker_ref"), str):
            zabezpieczenia.setdefault(przypisanie["breaker_ref"], []).append(
                str(przypisanie.get("ref_id"))
            )
    wynik: list[dict[str, Any]] = []
    for galaz in enm.get("branches") or []:
        if not isinstance(galaz, Mapping) or galaz.get("type") != TYP_WYLACZNIKA:
            continue
        ref = str(galaz.get("ref_id"))
        if odmowa_kotwicy_wylacznika(enm, ref) is not None:
            continue
        wynik.append(
            {
                "ref_id": ref,
                "nazwa": galaz.get("name"),
                "przekladniki": sorted(przekladniki.get(ref, [])),
                "zabezpieczenia": sorted(zabezpieczenia.get(ref, [])),
            }
        )
    return sorted(wynik, key=lambda w: w["ref_id"])


__all__ = [
    "TYP_WYLACZNIKA",
    "PowodOdmowyKotwicy",
    "odmowa_kotwicy_wylacznika",
    "pole_aparatu",
    "wylaczniki_liniowe",
]
