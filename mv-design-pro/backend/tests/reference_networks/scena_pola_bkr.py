"""Scena POLA BKR (karta UX-04/POLE-BKR-MODEL) — JEDEN budowniczy sieci z baterią kondensatorów
w rozdzielni SN GPZ dla testów modelu, rozpływu, zwarć, walidatora i fikstury harnessu SLD
(`scripts/eksport_fixtur_harnessu.py`, fikstura ``gpz_110kv_bkr``).

Sieć powstaje wyłącznie operacjami domenowymi (`execute_domain_operation`), tak jak w aplikacji:

* GPZ 110/15 kV ``zbuduj_gpz_110kv`` (dwie sekcje SN, TR1 → sekcja 1, TR2 → sekcja 2);
* pole baterii kondensatorów ``add_sn_bay`` (rola ``BKR``) na sekcji 1 z wyłącznikiem
  z katalogu;
* bateria ``add_shunt_compensator_sn`` na zacisku końca toru pola (`Bay.terminal_bus_ref`)
  z pozycji katalogu ``KOMP_SN_1V2_15KV`` (1,2 Mvar, 15 kV, podwójna gwiazda izolowana,
  jeden stopień);
* wyposażenie pola ``set_bay_equipment`` (tryb ``katalog``): wyłącznik pola, przekładnik
  prądowy pola, głowica kablowa, ogranicznik przepięć, przekładnik niezrównoważenia
  w połączeniu międzygwiazdowym (port ``obwod``) i dwa przekładniki napięciowe międzyfazowe
  L1-L2 i L2-L3 (porty A, B) — ENEA Operator, Stacje 110 kV, Zeszyt 1 §17 s. 32 i Zał. 16;
* parametry baterii projektanta ``update_element_parameters`` (układ, stopnie, dławik,
  rezystory rozładowcze, transformatory wyłączające baterię).

Każdy parametr budowniczego, który ma wartość ``None``, zostaje nienadany — obowiązuje wtedy
tabliczka typu albo wartość robocza rejestru (zasada nr 4).
"""

from __future__ import annotations

from typing import Any

from network_model.catalog.rodzaje_aparatury import (
    RODZAJ_PRZEKLADNIKA_NAPIECIOWEGO_MIEDZYFAZOWEGO,
    RODZAJ_PRZEKLADNIKA_NIEZROWNOWAZENIA,
)

from tests.reference_networks.scena_geometrii_stacji import zbuduj_gpz_110kv
from tests.reference_networks.sceny_zajetosci_pol import APARAT, ok, op

#: Pozycja katalogu baterii sceny (1,2 Mvar, 15 kV, podwójna gwiazda izolowana, 1 stopień).
BATERIA_KATALOG = "KOMP_SN_1V2_15KV"
#: Pozycje katalogu przekładników pola (przestrzenie CT i VT katalogu bieżącego).
PRZEKLADNIK_PRADOWY = "ct_50_1_0_5_5va_arteche"
PRZEKLADNIK_NAPIECIOWY = "vt_15kv_100v_05_abb"
#: Ogranicznik przepięć pola (przestrzeń OGRANICZNIK_SN, U_c dla sieci 15 kV).
OGRANICZNIK_PRZEPIEC = "arrester-abb-polim-d-17p5kv-10ka"

_NIENADANE = object()


def gpz(enm: dict[str, Any]) -> dict[str, Any]:
    return next(s for s in enm["substations"] if s.get("station_type") == "gpz")


def pole_bkr(enm: dict[str, Any]) -> dict[str, Any]:
    return next(b for b in enm["bays"] if b.get("bay_role") == "BKR")


def bateria(enm: dict[str, Any]) -> dict[str, Any]:
    return next(iter(enm["shunt_capacitors"]))


def transformatory_sekcji(enm: dict[str, Any], numer_sekcji: int) -> list[str]:
    szyna = gpz(enm)["gpz_sections"][numer_sekcji - 1]["bus_ref"]
    return sorted(t["ref_id"] for t in enm["transformers"] if t["lv_bus_ref"] == szyna)


def wyposazenie_pola(
    enm: dict[str, Any], *, przekladnik_niezrownowazenia: bool, liczba_vt: int
) -> list[dict[str, Any]]:
    """Aparaty pola BKR wg Zał. 16 (wyłącznik zawsze; przekładniki wg cech sceny)."""
    pole = pole_bkr(enm)
    aparaty: list[dict[str, Any]] = [
        {
            "kind": "CB",
            "placement": "MIDSTREAM",
            "catalog_ref": APARAT,
            "linked_ref": pole["equipment_refs"][0],
            "designation": "Q0",
        }
    ]
    # Tor pola za wyłącznikiem wg Zał. 16: przekładnik prądowy pola, głowica kablowa,
    # ogranicznik przepięć. Odłącznik szynowy (wysuwny człon wyłącznika na rysunku) wymaga
    # drugiej gałęzi łącznikowej pola — buduje ją szablon pola BKR (karta sesji głównej),
    # nie wyposażenie pola dopisane do pola z jednym wyłącznikiem.
    aparaty.extend(
        [
            {
                "kind": "CT",
                "placement": "DOWNSTREAM",
                "catalog_ref": PRZEKLADNIK_PRADOWY,
                "designation": "T1",
            },
            {"kind": "CABLE_HEAD", "placement": "DOWNSTREAM"},
            {
                "kind": "SURGE_ARRESTER",
                "placement": "DOWNSTREAM",
                "catalog_ref": OGRANICZNIK_PRZEPIEC,
                "designation": "F1",
            },
        ]
    )
    if przekladnik_niezrownowazenia:
        aparaty.append(
            {
                "kind": RODZAJ_PRZEKLADNIKA_NIEZROWNOWAZENIA,
                "placement": "OFF_PATH",
                "catalog_ref": PRZEKLADNIK_PRADOWY,
                "designation": "T5",
            }
        )
    for oznaczenie in ("T11", "T12")[:liczba_vt]:
        aparaty.append(
            {
                "kind": RODZAJ_PRZEKLADNIKA_NAPIECIOWEGO_MIEDZYFAZOWEGO,
                "placement": "DOWNSTREAM",
                "catalog_ref": PRZEKLADNIK_NAPIECIOWY,
                "designation": oznaczenie,
            }
        )
    return aparaty


def zbuduj_gpz_z_bkr(
    *,
    uklad: str | None = None,
    liczba_stopni: int | None = None,
    stopnie_zalaczone: list[bool] | None = None,
    dlawik_mh: float | None = None,
    rezystory_wewnetrzne: bool | None = None,
    przekladnik_niezrownowazenia: bool = True,
    liczba_vt: int = 2,
    wylaczenie: object = _NIENADANE,
    rola_pola: str = "BKR",
    z_polem: bool = True,
) -> dict[str, Any]:
    """GPZ 110/15 kV z baterią na sekcji 1 (patrz docstring modułu).

    ``wylaczenie`` — lista transformatorów wyłączających baterię; domyślnie OBA transformatory
    GPZ: sprzęgło sekcji jest zamknięte, więc sekcję 1 zasilają TR1 i TR2 — model kompletny
    wobec IRiESD II.4.5.4.4.2.
    ``z_polem=False`` — bateria wprost na szynie sekcji (bez pola), ``rola_pola`` — rola pola
    baterii (``BKR`` albo inna — przypadki reguły W045).
    """
    enm = zbuduj_gpz_110kv()
    stacja = gpz(enm)
    szyna = stacja["gpz_sections"][0]["bus_ref"]
    if z_polem:
        enm = ok(
            op(
                enm,
                "add_sn_bay",
                {
                    "bus_ref": szyna,
                    "station_ref": stacja["ref_id"],
                    "bay_role": rola_pola,
                    "apparatus_kind": "BREAKER",
                    "catalog_binding": {
                        "catalog_namespace": "APARAT_SN",
                        "catalog_item_id": APARAT,
                    },
                },
            )
        )
        pole = next(
            b
            for b in enm["bays"]
            if b.get("bay_role") == rola_pola
            and b.get("bus_ref") == szyna
            and b["ref_id"] not in stacja["gpz_sections"][0]["line_field_refs"]
        )
        zacisk = pole["terminal_bus_ref"]
    else:
        zacisk = szyna
    enm = ok(
        op(enm, "add_shunt_compensator_sn", {"bus_ref": zacisk, "catalog_ref": BATERIA_KATALOG})
    )
    if z_polem and rola_pola == "BKR":
        enm = ok(
            op(
                enm,
                "set_bay_equipment",
                {
                    "bay_ref": pole_bkr(enm)["ref_id"],
                    "mode": "katalog",
                    "devices": wyposazenie_pola(
                        enm,
                        przekladnik_niezrownowazenia=przekladnik_niezrownowazenia,
                        liczba_vt=liczba_vt,
                    ),
                },
            )
        )
    parametry: dict[str, Any] = {
        "wylaczenie_od_transformatorow": (
            sorted(t["ref_id"] for t in enm["transformers"])
            if wylaczenie is _NIENADANE
            else wylaczenie
        )
    }
    for klucz, wartosc in (
        ("uklad_polaczen", uklad),
        ("liczba_stopni", liczba_stopni),
        ("stopnie_zalaczone", stopnie_zalaczone),
        ("rezystory_rozladowcze_wewnetrzne", rezystory_wewnetrzne),
    ):
        if wartosc is not None:
            parametry[klucz] = wartosc
    if dlawik_mh is not None:
        parametry["dlawik_ograniczajacy"] = True
        parametry["dlawik_indukcyjnosc_mh"] = dlawik_mh
    return ok(
        op(
            enm,
            "update_element_parameters",
            {"element_ref": bateria(enm)["ref_id"], "parameters": parametry},
        )
    )
