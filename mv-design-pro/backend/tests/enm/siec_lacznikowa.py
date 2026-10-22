"""Sieci testowe stanu łączeniowego (W5-C) — budowane WYŁĄCZNIE operacjami domenowymi.

Trzy topologie iloczynu cech karty („{pierścień z NOP, promieniowa, łącznik sekcyjny}"):

* ``pierscien_z_nop`` — magistrala GPZ → 3 odcinki, dwa łączniki sekcyjne w torze, odcinek
  zamykający pierścień; łącznik A jest punktem normalnie otwartym (``set_normal_open_point``),
  łącznik B zamknięty bez zadeklarowanej pozycji normalnej;
* ``promieniowa`` — magistrala bez pierścienia z jednym łącznikiem sekcyjnym;
* ``lacznik_sekcyjny`` — GPZ z dwiema sekcjami szyn SN połączonymi sprzęgłem (łącznik
  sekcyjny szyn, typ ``bus_coupler``) i magistralą z sekcji pierwszej.

Poza iloczynem: ``bezpiecznik_nn`` — dwie rozdzielnice nN połączone bezpiecznikiem (typ
``fuse``: łącznik dla topologii, ale bez pozycji normalnej) oraz ``z_odbiorami`` —
odbiory SN na szynach magistrali (rozpływ wymaga obciążenia).

Każda funkcja zwraca ``SiecLacznikowa`` (migawka + nazwane łączniki), deterministycznie.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from enm.domain_operations import execute_domain_operation

KABEL = "cable-tfk-yakxs-3x120"
ROZLACZNIK = "sw-ls-schneider-rm6-17kv-400a"


@dataclass(frozen=True)
class SiecLacznikowa:
    nazwa: str
    enm: dict[str, Any]
    #: Łącznik, na którym operacja jest wykonywana w iloczynie cech.
    cel: str
    #: Łącznik normalnie otwarty przed operacją (``None`` = brak punktu podziału).
    poprzedni_nop: str | None


def _pusty() -> dict[str, Any]:
    return {
        "header": {"name": "Siec lacznikowa", "revision": 0, "defaults": {}},
        "buses": [],
        "branches": [],
        "transformers": [],
        "sources": [],
        "loads": [],
        "generators": [],
        "substations": [],
        "bays": [],
        "junctions": [],
        "corridors": [],
        "measurements": [],
        "protection_assignments": [],
    }


def wykonaj(enm: dict[str, Any], operacja: str, ladunek: dict[str, Any]) -> dict[str, Any]:
    wynik = execute_domain_operation(enm, operacja, ladunek)
    assert wynik.get("error") is None, (operacja, wynik.get("error"), wynik.get("error_code"))
    return wynik["snapshot"]


def galaz(enm: dict[str, Any], ref: str) -> dict[str, Any]:
    return next(b for b in enm["branches"] if b["ref_id"] == ref)


def _gpz(sekcje: int = 1) -> dict[str, Any]:
    ladunek: dict[str, Any] = {
        "voltage_kv": 15.0,
        "source_name": "GPZ Lacznikowy",
        "sk3_mva": 300.0,
        "rx_ratio": 0.1,
        "catalog_ref": "src-gpz-15kv-300mva-rx010",
    }
    if sekcje > 1:
        ladunek["sections_count"] = sekcje
    return wykonaj(_pusty(), "add_grid_source_sn", ladunek)


def _odcinki(enm: dict[str, Any], dlugosci: list[int]) -> dict[str, Any]:
    for dlugosc in dlugosci:
        enm = wykonaj(
            enm,
            "continue_trunk_segment_sn",
            {"segment": {"rodzaj": "KABEL", "dlugosc_m": dlugosc, "catalog_ref": KABEL}},
        )
    return enm


def _kable(enm: dict[str, Any]) -> list[dict[str, Any]]:
    return [b for b in enm["branches"] if b.get("type") == "cable"]


def _wstaw_lacznik(enm: dict[str, Any], segment: str) -> tuple[dict[str, Any], str]:
    przed = {b["ref_id"] for b in enm["branches"]}
    enm = wykonaj(
        enm,
        "insert_section_switch_sn",
        {
            "segment_id": segment,
            "insert_at": {"mode": "RATIO", "value": 0.5},
            "catalog_ref": ROZLACZNIK,
        },
    )
    nowe = [
        b["ref_id"]
        for b in enm["branches"]
        if b["ref_id"] not in przed and b.get("type") in {"switch", "breaker"}
    ]
    assert len(nowe) == 1, nowe
    return enm, nowe[0]


def pierscien_z_nop() -> SiecLacznikowa:
    enm = _odcinki(_gpz(), [200, 250, 300])
    kable = _kable(enm)
    szyna_gpz, koniec = kable[0]["from_bus_ref"], kable[-1]["to_bus_ref"]
    enm, lacznik_a = _wstaw_lacznik(enm, kable[1]["ref_id"])
    enm, lacznik_b = _wstaw_lacznik(enm, _kable(enm)[-1]["ref_id"])
    enm = wykonaj(
        enm,
        "connect_secondary_ring_sn",
        {
            "from_bus_ref": szyna_gpz,
            "to_bus_ref": koniec,
            "segment": {"rodzaj": "KABEL", "dlugosc_m": 400, "catalog_ref": KABEL},
        },
    )
    enm = wykonaj(enm, "set_normal_open_point", {"switch_ref": lacznik_a})
    return SiecLacznikowa("pierscien_z_nop", enm, cel=lacznik_b, poprzedni_nop=lacznik_a)


def promieniowa() -> SiecLacznikowa:
    enm = _odcinki(_gpz(), [200, 250])
    enm, lacznik = _wstaw_lacznik(enm, _kable(enm)[0]["ref_id"])
    return SiecLacznikowa("promieniowa", enm, cel=lacznik, poprzedni_nop=None)


def lacznik_sekcyjny() -> SiecLacznikowa:
    enm = _gpz(sekcje=2)
    sprzegla = [b["ref_id"] for b in enm["branches"] if b.get("type") == "bus_coupler"]
    assert len(sprzegla) == 1, sprzegla
    enm = _odcinki(enm, [200])
    return SiecLacznikowa("lacznik_sekcyjny", enm, cel=sprzegla[0], poprzedni_nop=None)


SIECI = (pierscien_z_nop, promieniowa, lacznik_sekcyjny)

APARAT_NN = "cb_nn_630a"


def bezpiecznik_nn() -> SiecLacznikowa:
    enm = wykonaj(_pusty(), "add_nn_distribution_board", {"voltage_kv": 0.4, "name": "RGnN-1"})
    enm = wykonaj(enm, "add_nn_distribution_board", {"voltage_kv": 0.4, "name": "RGnN-2"})
    szyny = [s["bus_refs"][0] for s in enm["substations"]]
    przed = {b["ref_id"] for b in enm["branches"]}
    enm = wykonaj(
        enm,
        "add_nn_switch_device",
        {
            "from_bus_ref": szyny[0],
            "to_bus_ref": szyny[1],
            "device_class": "fuse",
            "catalog_ref": APARAT_NN,
        },
    )
    (bezpiecznik,) = (b["ref_id"] for b in enm["branches"] if b["ref_id"] not in przed)
    assert galaz(enm, bezpiecznik)["type"] == "fuse"
    return SiecLacznikowa("bezpiecznik_nn", enm, cel=bezpiecznik, poprzedni_nop=None)


def z_odbiorami(siec: SiecLacznikowa) -> SiecLacznikowa:
    """Ta sama sieć z odbiorem SN na każdej szynie SN magistrali (koniec odcinka kabla;
    bez szyny GPZ i bez węzłów łączników)."""
    enm = siec.enm
    konce_odcinkow = sorted({k["to_bus_ref"] for k in _kable(enm)})
    wezly_lacznikow = {
        szyna
        for g in enm["branches"]
        if g.get("type") in {"switch", "breaker"}
        for szyna in (g["from_bus_ref"], g["to_bus_ref"])
    }
    for numer, szyna in enumerate(s for s in konce_odcinkow if s not in wezly_lacznikow):
        enm = wykonaj(
            enm,
            "add_load_sn",
            {
                "bus_ref": szyna,
                "p_mw": 0.3 + 0.1 * numer,
                "q_mvar": 0.1,
                "load_name": f"Odbiór {numer + 1}",
            },
        )
    return SiecLacznikowa(siec.nazwa, enm, cel=siec.cel, poprzedni_nop=siec.poprzedni_nop)
