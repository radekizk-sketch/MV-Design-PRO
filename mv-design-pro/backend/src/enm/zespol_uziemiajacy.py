"""Zespół uziemiający pola GPZ: wyposażenie punktu neutralnego transformatora uziemiającego
z wariantu rysunku oraz para przeniesienia/oddania opisu punktu neutralnego źródła.

Karta ZU-JEDEN-NOSNIK (decyzja architekta 2026-11-11): zespół uziemiający jest TRANSFORMATOREM
uziemiającym ZNyn11 (``Transformer``) z typowanym wyposażeniem punktu neutralnego w
``Transformer.hv_neutral`` (``GroundingConfig.dlawik`` / ``rezystor``; ENEA Operator „Stacje
elektroenergetyczne 110 kV. Zeszyt 1”, wersja 02.2023 – 2, §16 s.29–31 i Z.13–Z.15 s.93–95):

* Z.13 — dławik z automatyczną regulacją i AWSC z rezystorem po stronie wtórnej (20 A ÷ 40 A);
* Z.14 — dławik i rezystor w układzie równoległym (każda gałąź z własnym odłącznikiem);
* Z.15 — rezystor.

Wariant NIE jest zapisem w modelu — wynika z wyposażenia (``wariant_zespolu``). Pozycje
katalogu dławika i rezystora dla napięcia sieci dobiera ``pozycje_katalogu_wariantu`` (pierwsza
pozycja typowa w kolejności deterministycznej; Catalog Binding Rule); brak nastawy dławika,
prądu AWSC itd. to wartość robocza ``ESTIMATED`` wyprowadzana przy odczycie
(``enm.punkt_neutralny_zespolu``, zasada nr 4) — operacja nie wpisuje propozycji do modelu.

Para przeniesienia (decyzja D1 karty POLA-GPZ-SZABLONY): opis punktu neutralnego źródła na szynie
SN (fizyka go pomija — W-W5-02) schodzi ze źródła razem z jego danymi składowej zerowej przy
dodaniu pola ZU i wraca przy usunięciu transformatora. Warunek oddania czyta TYLKO typowany zapis
``GroundingConfig.dawca`` (reguła KLASA §3, predykaty parami).
"""

from __future__ import annotations

import copy
from typing import Any, Literal

from network_model.catalog.mv_zespol_uziemiajacy_catalog import (
    get_all_arc_suppression_coil_records,
    get_all_neutral_earthing_resistor_records,
)

from .models import EnergyNetworkModel, GroundingConfig, Transformer
from .punkt_neutralny_zespolu import jest_transformatorem_uziemiajacym
from .topology import derive

#: Rola pola zespołu uziemiającego w słowniku ról pól SN (``enm.rola_pola_sn``).
ROLA_POLA_ZESPOLU_UZIEMIAJACEGO = "ZU"
#: Grupa połączeń transformatora uziemiającego — Zeszyt 1 §16 s.30 („układ połączeń ZNyn 11”).
GRUPA_POLACZEN_TRANSFORMATORA_UZIEMIAJACEGO = "ZNyn11"
#: Napięcie znamionowe uzwojenia dolnego (potrzeb własnych) — Zeszyt 1 §16 s.30 („400 V”).
NAPIECIE_POTRZEB_WLASNYCH_KV = 0.4
NOSNIK_ZRODLA = "neutral_grounding"
NOSNIK_TRANSFORMATORA = "hv_neutral"

WariantZespolu = Literal["Z13", "Z14", "Z15"]

#: Dane składowej zerowej równoważnika sieci (`Source`) — schodzą ze źródła-dawcy przy
#: przeniesieniu punktu neutralnego i wracają przy oddaniu (jedna lista dla obu stron pary).
POLA_ZEROWE_ZRODLA: tuple[str, ...] = ("r0_ohm", "x0_ohm", "z0_z1_ratio")

#: Typ punktu neutralnego wariantu rysunku.
TYP_UZIEMIENIA_WARIANTU: dict[str, str] = {
    "Z13": "petersen_coil",
    "Z14": "petersen_coil",
    "Z15": "resistor_grounded",
}


def wariant_zespolu(cfg: GroundingConfig | dict[str, Any] | None) -> WariantZespolu | None:
    """Wariant rysunku z wyposażenia punktu neutralnego (``None`` — inny opis: uziemienie
    bezpośrednie, izolowany, brak albo niespójny). Jedno odwzorowanie dla operacji i odczytu."""
    if cfg is None:
        return None
    dane = cfg.model_dump(mode="json") if isinstance(cfg, GroundingConfig) else cfg
    dlawik = dane.get("dlawik")
    rezystor = dane.get("rezystor")
    typ = dane.get("type")
    if typ == "petersen_coil" and isinstance(dlawik, dict):
        return "Z14" if isinstance(rezystor, dict) else "Z13"
    if typ == "resistor_grounded" and isinstance(rezystor, dict) and dlawik is None:
        return "Z15"
    return None


def _pierwsza_pozycja(rekordy: list[dict[str, Any]], u_kv: float, **warunki: Any) -> str | None:
    pasujace = sorted(
        str(r["id"])
        for r in rekordy
        if abs(float(r["params"]["u_n_kv"]) - u_kv) < 1e-9
        and all(r["params"].get(k) == v for k, v in warunki.items())
    )
    return pasujace[0] if pasujace else None


def pozycje_katalogu_wariantu(
    wariant: WariantZespolu, u_kv: float
) -> tuple[str | None, str | None, str | None]:
    """(dławik, rezystor, odmowa) — pozycje katalogu wyposażenia wariantu dla napięcia sieci.

    Dławik: dławik z regulacją płynną (Zeszyt 1 §16 s.31 — rozwiązanie wymagane); rezystor:
    pierwsza pozycja typowa napięcia (kolejność identyfikatorów). Brak pozycji dla napięcia =
    odmowa nazwana (dobór pozycji innego napięcia byłby domysłem)."""
    dlawik = rezystor = None
    if wariant in ("Z13", "Z14"):
        dlawik = _pierwsza_pozycja(get_all_arc_suppression_coil_records(), u_kv, regulacja="ciagla")
        if dlawik is None:
            return (
                None,
                None,
                (
                    "Katalog dławików gaszących nie ma pozycji z regulacją płynną na napięcie "
                    f"{u_kv:g} kV — dodaj pozycję dławika dla tego napięcia do katalogu."
                ),
            )
    if wariant in ("Z14", "Z15"):
        rezystor = _pierwsza_pozycja(get_all_neutral_earthing_resistor_records(), u_kv)
        if rezystor is None:
            return (
                None,
                None,
                (
                    f"Katalog rezystorów uziemiających nie ma pozycji na napięcie {u_kv:g} kV — "
                    "dodaj pozycję rezystora dla tego napięcia do katalogu."
                ),
            )
    return dlawik, rezystor, None


def ladunek_wariantu(
    wariant: WariantZespolu, u_kv: float, poprzedni: dict[str, Any] | None
) -> tuple[dict[str, Any] | None, str | None]:
    """Ładunek wyposażenia punktu neutralnego wariantu (``dlawik``/``rezystor`` jak w operacji
    ``add_zespol_uziemiajacy_sn``) albo odmowa. Urządzenie tego samego rodzaju z poprzedniej
    konfiguracji przechodzi bez zmian (pozycja katalogu, nastawa, stan odłącznika, AWSC) — zmiana
    wariantu nie kasuje danych projektanta; brakujące urządzenie dostaje pozycję typową
    katalogu. Z.13 ma AWSC (opis pusty = prąd wymuszany z wartości roboczej §16)."""
    dlawik_ref, rezystor_ref, odmowa = pozycje_katalogu_wariantu(wariant, u_kv)
    if odmowa is not None:
        return None, odmowa
    poprzedni = poprzedni or {}
    ladunek: dict[str, Any] = {"dlawik": None, "rezystor": None}
    if dlawik_ref is not None:
        stary = poprzedni.get("dlawik")
        dlawik = copy.deepcopy(stary) if isinstance(stary, dict) else {"catalog_ref": dlawik_ref}
        if wariant == "Z13":
            dlawik.setdefault("awsc", {})
            if dlawik["awsc"] is None:
                dlawik["awsc"] = {}
        else:
            dlawik["awsc"] = None
        ladunek["dlawik"] = dlawik
    if rezystor_ref is not None:
        stary = poprzedni.get("rezystor")
        ladunek["rezystor"] = (
            copy.deepcopy(stary) if isinstance(stary, dict) else {"catalog_ref": rezystor_ref}
        )
    return ladunek, None


def sekcja_szyny(model: EnergyNetworkModel, bus_ref: str) -> frozenset[str]:
    """Szyny galwanicznie połączonej sekcji ``bus_ref`` (``derive``: bez transformatorów)."""
    for skladowa in derive(model).sekcje:
        if bus_ref in skladowa:
            return frozenset(skladowa)
    return frozenset({bus_ref})


def zrodlo_sekcji(enm: dict[str, Any], bus_ref: str) -> dict[str, Any] | None:
    """Źródło na szynie SN tej samej sekcji galwanicznej co ``bus_ref`` (najmniejszy ``ref_id``
    — deterministycznie); źródło po stronie 110 kV nie opisuje sieci SN."""
    szyny = sekcja_szyny(EnergyNetworkModel.model_validate(enm), bus_ref)
    kandydaci = sorted(
        (
            s
            for s in enm.get("sources", [])
            if isinstance(s, dict)
            and s.get("source_side") != "HV_110"
            and str(s.get("bus_ref")) in szyny
        ),
        key=lambda s: str(s.get("ref_id")),
    )
    return kandydaci[0] if kandydaci else None


def przenies_uziemienie_na_zespol(
    enm: dict[str, Any], *, transformator: dict[str, Any], szyna_sekcji_ref: str
) -> None:
    """Para przeniesienia (mutacja ``enm`` w miejscu — wołający pracuje na kopii): opis punktu
    neutralnego i dane składowej zerowej źródła sekcji schodzą ze źródła do typowanego zapisu
    ``hv_neutral.dawca`` transformatora uziemiającego. Źródło bez opisu i bez Z0 — brak zapisu
    (nie ma czego oddawać)."""
    zrodlo = zrodlo_sekcji(enm, szyna_sekcji_ref)
    if zrodlo is None:
        return
    opis = zrodlo.get(NOSNIK_ZRODLA)
    zerowe = {k: zrodlo.get(k) for k in POLA_ZEROWE_ZRODLA if zrodlo.get(k) is not None}
    if opis is None and not zerowe:
        return
    transformator.setdefault(NOSNIK_TRANSFORMATORA, {})["dawca"] = {
        "zrodlo_ref": zrodlo.get("ref_id"),
        "neutral_grounding": copy.deepcopy(opis),
        **zerowe,
    }
    zrodlo[NOSNIK_ZRODLA] = None
    for klucz in POLA_ZEROWE_ZRODLA:
        zrodlo[klucz] = None


def oddaj_uziemienie_zrodlu(enm: dict[str, Any], transformator: dict[str, Any]) -> str | None:
    """Odwrotność ``przenies_uziemienie_na_zespol``: źródło-dawca z zapisu ``hv_neutral.dawca``
    dostaje z powrotem swój opis punktu neutralnego i dane składowej zerowej. Transformator usuwa
    wołający. Zwraca ref źródła albo ``None`` (brak zapisu / brak dawcy w modelu)."""
    cfg = transformator.get(NOSNIK_TRANSFORMATORA)
    dawca = cfg.get("dawca") if isinstance(cfg, dict) else None
    if not isinstance(dawca, dict) or not dawca.get("zrodlo_ref"):
        return None
    zrodlo = next(
        (
            s
            for s in enm.get("sources", [])
            if isinstance(s, dict) and s.get("ref_id") == dawca["zrodlo_ref"]
        ),
        None,
    )
    if zrodlo is None:
        return None
    zrodlo[NOSNIK_ZRODLA] = copy.deepcopy(dawca.get("neutral_grounding"))
    for klucz in POLA_ZEROWE_ZRODLA:
        if dawca.get(klucz) is not None:
            zrodlo[klucz] = dawca[klucz]
    return str(zrodlo["ref_id"])


#: Typ punktu neutralnego źródła → wariant rysunku, gdy pole ZU powstaje bez wskazanego
#: szablonu: projektant opisał sposób uziemienia sieci na źródle, a pole zespołu przenosi
#: TEN sposób na transformator. Dławik → Z.13 (§16: sieć skompensowana z regulacją nadążną
#: i AWSC), rezystor → Z.15. Inny opis (izolowany, brak) nie wyznacza wariantu — wołający odmawia.
WARIANT_Z_TYPU_UZIEMIENIA_ZRODLA: dict[str, WariantZespolu] = {
    "petersen_coil": "Z13",
    "resistor_grounded": "Z15",
}


def wariant_z_uziemienia_zrodla(enm: dict[str, Any], bus_ref: str) -> WariantZespolu | None:
    """Wariant zespołu z opisu punktu neutralnego źródła sekcji ``bus_ref`` (``None`` — opis nie
    wyznacza wariantu)."""
    zrodlo = zrodlo_sekcji(enm, bus_ref)
    cfg = zrodlo.get(NOSNIK_ZRODLA) if zrodlo else None
    typ = cfg.get("type") if isinstance(cfg, dict) else None
    return WARIANT_Z_TYPU_UZIEMIENIA_ZRODLA.get(str(typ)) if typ else None


def transformator_zespolu_pola(enm: dict[str, Any], bay_ref: str) -> dict[str, Any] | None:
    """Transformator uziemiający pola ZU ``bay_ref`` — pierwszy (``ref_id``) transformator
    uziemiający z wyposażenia pola (``Bay.equipment_refs``). Jedno źródło powiązania pola
    z transformatorem — lustro ``pole_transformatorowe.pole_zespolu_transformatora``."""
    pole = next(
        (b for b in enm.get("bays", []) if isinstance(b, dict) and b.get("ref_id") == bay_ref),
        None,
    )
    if pole is None:
        return None
    refy = {r for r in pole.get("equipment_refs") or [] if isinstance(r, str)}
    for transformator in sorted(
        (t for t in enm.get("transformers", []) if isinstance(t, dict)),
        key=lambda t: str(t.get("ref_id")),
    ):
        if transformator.get("ref_id") in refy and jest_transformatorem_uziemiajacym(
            Transformer.model_validate(transformator)
        ):
            return transformator
    return None
