"""Przypadek odbiorowy GPZ H5 110/15 kV (karta GPZ-H5, ENEA Operator Zeszyt 1 §11.1).

JEDEN budowniczy dla testu odbiorowego (`tests/enm/test_gpz_h5_akceptacja.py`), fikstury
frontu (`scripts/eksport_fixtur_harnessu.py`, `gpz_h5_przypadek_odbiorowy`) i sceny geometrii
stacji. Sieć powstaje WYŁĄCZNIE operacjami domenowymi (`execute_domain_operation` — ten sam
dyspozytor, który woła `POST /api/cases/{id}/enm/domain-ops`):

* dwie linie 110 kV L1 i L2, każda na własnej sekcji szyn 110 kV z własnym równoważnikiem
  sieci (S″k max/min, R/X, Z0/Z1) — **przykładowe dane przypadku testowego** (nie dane OSD);
* łącznik szyn 110 kV normalnie OTWARTY (stan normalny jest daną, ENEA §11.1 nie przesądza);
* dwa transformatory 110/15 kV 25 MVA z katalogu, przypisane jawnie: TR1 sekcja 110 kV 1 →
  sekcja SN A, TR2 sekcja 110 kV 2 → sekcja SN B;
* tryb rezerwy transformatorowej jawny w danych (§26.10.5): ukryta (łącznik szyn SN normalnie
  otwarty) albo jawna (TR2 rezerwowy, łącznik szyn SN normalnie zamknięty);
* pola funkcyjne sekcji SN (§13, zał. Z.2): zespół uziemiający, bateria kondensatorów, pomiar —
  bez aparatów i bez elementów; łącznik szyn SN w dwóch celach;
* po jednym odpływie SN na sekcję (pole liniowe z wyłącznikiem z katalogu);
* odbiory 6 + j2 MVA na sekcji A i 4 + j1,5 MVA na sekcji B (przykładowe dane).

Uziemienie punktu neutralnego SN NIE jest zakładane (§16 — dana projektu): transformator
Yd11 z katalogu nie ma wyprowadzonego punktu neutralnego po żadnej stronie, a zespół
uziemiający w polu sekcji nie ma elementu w danych — zwarcie doziemne na szynach SN jest
odmową z przyczyną (brak drogi prądu zerowego), nigdy wynikiem z założenia.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Any

from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader

#: Znacznik danych L1/L2 i odbiorów (ustalenie 7 koordynatora): wartości są przykładem
#: przypadku testowego, nie danymi warunków przyłączenia OSD.
OPIS_DANYCH = "przykładowe dane przypadku testowego"

TRAFO_110_15 = "tr-wn-sn-110-15-25mva-yd11"
APARAT_SN_15 = "sw-cb-abb-vd4-17kv-630a"
#: Z0/Z1 równoważników 110 kV (przykładowe dane przypadku testowego).
Z0_Z1_110 = 1.2
#: R/X równoważników 110 kV (MAX i MIN).
RX_110 = 0.1

#: Tory zasilania: (nazwa linii, stacja zasilająca, S″k max [MVA], S″k min [MVA]).
TOR_L1 = ("L1", f"Stacja zasilająca A — {OPIS_DANYCH}", 2500.0, 1800.0)
TOR_L2 = ("L2", f"Stacja zasilająca B — {OPIS_DANYCH}", 1800.0, 1200.0)

#: Odbiory sekcji SN: (nazwa, P [MW], Q [Mvar]).
ODBIOR_A = ("Odbiór sekcji A", 6.0, 2.0)
ODBIOR_B = ("Odbiór sekcji B", 4.0, 1.5)

#: Propozycja składu aparatów pól 110 kV (§11.1) — ta sama co szablonu H5.
PROPOZYCJA_APARATOW_110 = {
    "basis": "ENEA Operator, Zeszyt 1 „Stacje 110 kV” §11.1 (układ H5)",
    "line": ["OSZ(U)", "W", "PIU", "OL(U)", "OGR"],
    "transformer": ["OSZ(U)", "W", "PIU", "OGR"],
    "coupler": ["OS(U)", "W", "PIU", "(U)OS"],
}


def tor_zasilania(
    tor: tuple[str, str, float, float], *, z0: bool = True, rx: float = RX_110
) -> dict[str, Any]:
    """Wpis `hv_sections[]` — tor zasilania sekcji 110 kV (tożsamość i równoważnik)."""
    linia, stacja, sk_max, sk_min = tor
    rownowaznik: dict[str, Any] = {
        "hv_voltage_kv": 110.0,
        "sk3_hv_mva": sk_max,
        "sk3_min_mva": sk_min,
        "rx_ratio": rx,
        "rx_ratio_min": rx,
    }
    if z0:
        rownowaznik["z0_z1_ratio"] = Z0_Z1_110
    return {
        "supply": {
            "line_name": linia,
            "supplying_station_name": stacja,
            "manual_equivalent": rownowaznik,
        }
    }


def ladunek_h5(
    *,
    reserve_mode: str = "hidden",
    z0: bool = True,
    hv_coupler_state: str = "open",
    line_fields_count: int = 1,
) -> dict[str, Any]:
    """Ładunek `add_grid_source_sn` GPZ H5 110/15 kV (kontrakt ENM karty GPZ-H5)."""
    ladunek: dict[str, Any] = {
        "voltage_kv": 15.0,
        "source_name": "GPZ H5 110/15 kV",
        "sections_count": 2,
        "gpz_sections": [
            {
                "name": "Sekcja SN A",
                "line_fields_count": line_fields_count,
                "function_bays": ["EARTHING", "CAPACITOR", "MEASUREMENT"],
            },
            {
                "name": "Sekcja SN B",
                "line_fields_count": line_fields_count,
                "function_bays": ["EARTHING", "CAPACITOR", "MEASUREMENT"],
            },
        ],
        "hv_sections": [tor_zasilania(TOR_L1, z0=z0), tor_zasilania(TOR_L2, z0=z0)],
        "hv_coupler": {"normal_state": hv_coupler_state},
        "transformers": [
            {"hv_section": 1, "sn_section": 1, "transformer_catalog_ref": TRAFO_110_15},
            {"hv_section": 2, "sn_section": 2, "transformer_catalog_ref": TRAFO_110_15},
        ],
        "sn_coupler": {"cells": 2},
        "reserve_mode": reserve_mode,
        "gpz_line_field_apparatus": {"catalog_ref": APARAT_SN_15},
        "hv_bay_apparatus_proposal": copy.deepcopy(PROPOZYCJA_APARATOW_110),
    }
    if reserve_mode == "explicit":
        ladunek["reserve_transformer"] = 2
        ladunek["reserve_transformer_apparatus"] = {"catalog_ref": APARAT_SN_15}
    return ladunek


@dataclass(frozen=True)
class RefyH5:
    """Identyfikatory elementów przypadku H5 odczytane z REJESTRÓW stacji (nie z przyrostków)."""

    stacja: str
    szyna_wn_1: str
    szyna_wn_2: str
    szyna_sn_a: str
    szyna_sn_b: str
    zrodlo_l1: str
    zrodlo_l2: str
    lacznik_wn: str
    lacznik_sn: str
    tr1: str
    tr2: str
    odbior_a: str | None
    odbior_b: str | None


def _operacja(enm: dict[str, Any], nazwa: str, ladunek: dict[str, Any]) -> dict[str, Any]:
    wynik = execute_domain_operation(enm_dict=enm, op_name=nazwa, payload=ladunek)
    blad = wynik.get("error")
    assert blad is None, f"{nazwa}: {blad} ({wynik.get('error_code')})"
    return dict(wynik["snapshot"])


def refy(enm: dict[str, Any]) -> RefyH5:
    """Refy elementów H5 z rejestrów stacji GPZ (sekcje 110 kV, sekcje SN, transformatory)."""
    (stacja,) = (s for s in enm["substations"] if s.get("gpz_hv_sections"))
    wn = sorted(stacja["gpz_hv_sections"], key=lambda s: s["order"])
    sn = sorted(stacja["gpz_sections"], key=lambda s: s["order"])
    transformatory = {t["hv_bus_ref"]: t["ref_id"] for t in enm["transformers"]}
    odbiory = {o["bus_ref"]: o["ref_id"] for o in enm.get("loads") or []}
    return RefyH5(
        stacja=stacja["ref_id"],
        szyna_wn_1=wn[0]["bus_ref"],
        szyna_wn_2=wn[1]["bus_ref"],
        szyna_sn_a=sn[0]["bus_ref"],
        szyna_sn_b=sn[1]["bus_ref"],
        zrodlo_l1=wn[0]["incoming_source_ref"],
        zrodlo_l2=wn[1]["incoming_source_ref"],
        lacznik_wn=wn[0]["right_coupler_ref"],
        lacznik_sn=sn[0]["right_coupler_ref"],
        tr1=transformatory[wn[0]["bus_ref"]],
        tr2=transformatory[wn[1]["bus_ref"]],
        odbior_a=odbiory.get(sn[0]["bus_ref"]),
        odbior_b=odbiory.get(sn[1]["bus_ref"]),
    )


def pusty_model() -> dict[str, Any]:
    return EnergyNetworkModel(
        header=ENMHeader(name=f"GPZ H5 110/15 kV — {OPIS_DANYCH}", defaults=ENMDefaults())
    ).model_dump(mode="json")


def zbuduj_h5(
    *,
    reserve_mode: str = "hidden",
    z0: bool = True,
    odbiory: bool = True,
    line_fields_count: int = 1,
) -> dict[str, Any]:
    """Migawka ENM przypadku odbiorowego H5 (operacje domenowe, deterministycznie)."""
    enm = _operacja(
        pusty_model(),
        "add_grid_source_sn",
        ladunek_h5(reserve_mode=reserve_mode, z0=z0, line_fields_count=line_fields_count),
    )
    if odbiory:
        r = refy(enm)
        for szyna, (nazwa, p_mw, q_mvar) in ((r.szyna_sn_a, ODBIOR_A), (r.szyna_sn_b, ODBIOR_B)):
            enm = _operacja(
                enm,
                "add_load_sn",
                {"bus_ref": szyna, "p_mw": p_mw, "q_mvar": q_mvar, "load_name": nazwa},
            )
    return enm


def ladunek_gpz_110kv(
    sekcje_sn: int = 1,
    *,
    tory: int | None = None,
    sk3_hv_mva: float = 3000.0,
    rx_ratio: float = RX_110,
    transformer_catalog_ref: str = TRAFO_110_15,
    reserve_mode: str = "hidden",
) -> dict[str, Any]:
    """Fragment ładunku `add_grid_source_sn` GPZ ze stroną 110 kV w kontrakcie karty GPZ-H5
    dla testów, które badają INNĄ cechę niż sam układ H5 (regulacja zaczepów, pola, granica
    zasilania): `tory` torów 110 kV (domyślnie po jednym na sekcję SN), transformator k
    przypisany jawnie sekcja 110 kV min(k, tory) → sekcja SN k, łącznik szyn 110 kV normalnie
    otwarty i tryb rezerwy transformatorowej przy dwóch sekcjach SN. Wartości równoważnika to
    przykładowe dane przypadku testowego."""
    liczba_torow = sekcje_sn if tory is None else tory
    ladunek: dict[str, Any] = {
        "sections_count": sekcje_sn,
        "hv_sections": [
            {
                "supply": {
                    "line_name": f"Linia 110 kV L{n}",
                    "supplying_station_name": f"Stacja zasilająca {n} — {OPIS_DANYCH}",
                    "manual_equivalent": {
                        "hv_voltage_kv": 110.0,
                        "sk3_hv_mva": sk3_hv_mva,
                        "rx_ratio": rx_ratio,
                    },
                }
            }
            for n in range(1, liczba_torow + 1)
        ],
        "transformers": [
            {
                "hv_section": min(k, liczba_torow),
                "sn_section": k,
                "transformer_catalog_ref": transformer_catalog_ref,
            }
            for k in range(1, sekcje_sn + 1)
        ],
    }
    if liczba_torow >= 2:
        ladunek["hv_coupler"] = {"normal_state": "open"}
    if sekcje_sn >= 2:
        ladunek["reserve_mode"] = reserve_mode
        if reserve_mode == "explicit":
            ladunek["reserve_transformer"] = sekcje_sn
    return ladunek
