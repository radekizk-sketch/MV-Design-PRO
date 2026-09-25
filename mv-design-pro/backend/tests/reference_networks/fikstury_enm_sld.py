"""Generator statycznych fikstur ENM kontraktów SLD v3 (karta SLD-SUBSTRAT, zakres rozszerzony).

Do tej karty te pliki były zrzutami z żywego backendu albo ręcznymi rozszerzeniami takich
zrzutów, bez generatora i bez testu świeżości: nosiły nazwy „Odcinek seg/…" sprzed karty #144,
role pól kodami (#140/#141), identyfikatory sprzed zmiany ziarna odcinka (CV-4.3 K1) i nazwę
źródła GPZ sprzed jednej reguły nazw — kontrakty SLD przechodziły na danych, których produkt
już nie wytwarza. Każdy plik powstaje teraz TĄ SAMĄ drogą, którą powstał pierwotnie
(operacje domenowe przez API aplikacji w procesie — ``budowa_przez_api``), a test
``tests/application/test_fikstury_enm_generowane.py`` porównuje pliki bajtowo z generatorem.

Sieci (nazwy plików jak w repo, ścieżki względem ``frontend``):
* ``openTerminal`` — GPZ + jeden odcinek magistrali „F1" z otwartym końcem;
* ``openBranch`` — GPZ + magistrala „F1" ze stacją B + odgałęzienie kablowe z pola GPZ;
* ``openTrunkChain`` — GPZ + dwa odcinki magistrali „F2", „F3", stacja B na drugim (45 %);
* ``gpzFeeder`` (scena + ``public``) — magistrala „F1" ze stacją S01 + odgałęzienie ze stacją S02;
* ``gpzProtectionDataPath`` — ``gpzFeeder`` + pola GPZ z aparatami, przekładniki CT i
  przypisania zabezpieczeń (koordynacja z karty V12K-220, dopisana w modelu, bo żadna
  operacja domenowa nie buduje pól GPZ z listą aparatów pierwotnych);
* ``stacjaPolePomiarowe`` — stacja B z polem pomiarowym (przekładnik napięciowy);
* ``s95GpzSwiezy`` — sam GPZ zaraz po ``add_grid_source_sn``;
* ``s92Bieg`` + nakładki ``s92Zwarcie``/``s92Rozplyw`` — dwa odcinki + szablon stacji
  przelotowej 1250 kVA, biegi kanoniczne zwarcia i rozpływu
  (``GET /api/execution/runs/{id}/results/v1``);
* ``b2Droga-<operacja>`` + ``b2DrogiOperacji`` — pięć dróg operacji budowy i ich wskazania;
* ``b2Mala``/``b2Duza`` ``Przed``/``Po`` + ``Operacja`` — wstawienie stacji w środek odcinka
  w sieci małej (3 → 4 stacje) i dużej (14 → 15 stacji);
* ``nnBoardDemo`` (``public``) — ``openBranch`` + rozdzielnica nN z sekcją 2 i odpływami.

Regeneracja (z katalogu ``backend``):
    poetry run python -m tests.reference_networks.fikstury_enm_sld --write
"""

from __future__ import annotations

import argparse
import logging
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from tests.golden.zapis_fikstur import json_fikstury, zaokraglij_liczby
from tests.reference_networks.budowa_przez_api import (
    APARAT_POLA_SN,
    TRANSFORMATOR_630,
    KlientBudowy,
    normalizuj_migawke,
    pole_gpz,
    segmenty_korytarza,
    wiazanie,
)

FRONTEND = Path(__file__).resolve().parents[3] / "frontend"
SCENA = "src/ui/sld/v3/scene/__tests__/fixtures"
KANWA = "src/ui/sld/v3/canvas/__tests__/fixtures"
PUBLICZNE = "public/test-fixtures"

KOMENDA_REGENERACJI = (
    "cd mv-design-pro/backend && poetry run python -m "
    "tests.reference_networks.fikstury_enm_sld --write"
)

_CZAS = "2026-09-25T00:00:00Z"


def _plik_enm(enm: dict[str, Any], nazwa: str, *, opakuj: bool = True) -> str:
    migawka = normalizuj_migawke(enm, czas=_CZAS)
    migawka["header"]["name"] = nazwa
    from enm.hash import compute_enm_hash
    from enm.models import EnergyNetworkModel

    migawka["header"]["hash_sha256"] = compute_enm_hash(EnergyNetworkModel.model_validate(migawka))
    return json_fikstury({"enm": migawka} if opakuj else migawka)


# --- sieci ------------------------------------------------------------------------


def _open_terminal(b: KlientBudowy) -> dict[str, Any]:
    b.gpz()
    b.odcinek_magistrali(1200, "F1")
    return b.migawka()


def _open_branch(b: KlientBudowy) -> dict[str, Any]:
    b.gpz()
    b.odcinek_magistrali(1200, "F1")
    b.stacja_b(segmenty_korytarza(b.migawka())[0], "Stacja B", nn_odplywy=1)
    b.odgalezienie(pole_gpz(b.migawka(), 0) + ".BRANCH", 140)
    b.domknij_aparaty_nn(glowny="cb_nn_1000a")
    return b.migawka()


def _open_trunk_chain(b: KlientBudowy) -> dict[str, Any]:
    b.gpz()
    b.odcinek_magistrali(205, "F2")
    b.odcinek_magistrali(210, "F3")
    b.stacja_b(segmenty_korytarza(b.migawka())[1], "Stacja B", ratio=0.45, nn_odplywy=1)
    b.domknij_aparaty_nn(glowny="cb_nn_1000a")
    return b.migawka()


def _gpz_feeder(b: KlientBudowy) -> dict[str, Any]:
    b.gpz()
    b.odcinek_magistrali(800, "F1")
    b.stacja_b(segmenty_korytarza(b.migawka())[0], "Stacja S01 (typ B)", nn_odplywy=1)
    b.odgalezienie(pole_gpz(b.migawka(), 0) + ".BRANCH", 600)
    b.stacja_b(segmenty_korytarza(b.migawka(), 1)[0], "Stacja S02 (typ B)", nn_odplywy=1)
    b.domknij_aparaty_nn(glowny="cb_nn_1000a")
    return b.migawka()


def _aparat(
    pole: str,
    kod: str,
    symbol: str,
    rodzaj: str,
    polozenie: str,
    oznaczenie: str | None,
    **inne: Any,
) -> dict[str, Any]:
    aparat: dict[str, Any] = {
        "device_ref": f"{pole}/{kod}",
        "symbol_ref": symbol,
        "kind": rodzaj,
        "placement": polozenie,
    }
    if oznaczenie is not None:
        aparat["designation"] = oznaczenie
    aparat.update(inne)
    return aparat


def _gpz_protection_data_path(b: KlientBudowy) -> dict[str, Any]:
    """``gpzFeeder`` + ścieżka DANYCH zabezpieczeń (karta V12K-220, Z7).

    Koordynacja dobrana fizycznie w karcie źródłowej (dane projektowe tej fikstury, nie
    wynik obliczeń): pole TR — I_n = 25 MVA/(√3·15 kV) = 962 A → CT 1000/5, 51 na
    1,15·I_n = 1100 A, TMS 0,25; pola liniowe — CT 400/5, 51 na 360 A, TMS 0,15
    (selektywność czasowa wobec pola TR); 51N na 20 A (prąd doziemny ≈ 150 A przy
    rezystorze 57,7 Ω — k = 7,5 ≥ 1,5). Pola GPZ z aparatami pierwotnymi, przekładniki i
    przypisania zabezpieczeń są dopisane W MODELU (walidacja Pydantic w
    ``normalizuj_migawke``) — żadna operacja domenowa nie buduje pola GPZ z listą aparatów
    pierwotnych, a tę ścieżkę danych kontrakty SLD muszą mieć na czym sprawdzić.
    """
    enm = _gpz_feeder(b)
    gpz = next(s for s in enm["substations"] if s.get("station_type") == "gpz")
    seed = gpz["ref_id"].split("/")[1]
    sekcja = f"gpz/{seed}/section/001"
    szyna = f"{sekcja}/bus_sn"
    zamkniety = {"actual_state": "zamkniety"}
    otwarty = {"actual_state": "otwarty"}
    #: (kod pola, nazwa, rola, kody zabezpieczeń, opis przekładnika i zabezpieczeń,
    #:  przekładnia CT, obciążenie CT [VA], próg 51 [A], TMS, próg 50 [A], zwłoka 50 [s])
    pola = (
        (
            "tr01",
            "Pole transformatorowe",
            "TR",
            ["51", "50"],
            "pola TR",
            1000,
            15,
            1100,
            0.25,
            7700,
            0.1,
        ),
        (
            "line01",
            "Pole liniowe — Magistrala 01",
            "OUT",
            ["51", "50", "51N"],
            "Magistrala 01",
            400,
            10,
            360,
            0.15,
            4000,
            0.05,
        ),
        (
            "line02",
            "Pole liniowe — Magistrala 02",
            "OUT",
            ["51", "50", "51N"],
            "Magistrala 02",
            400,
            10,
            360,
            0.15,
            4000,
            0.05,
        ),
    )
    enm["bays"] = list(enm.get("bays", []))
    enm["measurements"] = list(enm.get("measurements", []))
    enm["protection_assignments"] = list(enm.get("protection_assignments", []))
    for (
        kod,
        nazwa,
        rola,
        kody,
        opis,
        przekladnia,
        obciazenie,
        prog51,
        tms,
        prog50,
        zwloka50,
    ) in pola:
        pole = f"{sekcja}/bay/{kod}"
        cb = _aparat(
            pole,
            "cb",
            "breaker",
            "CB",
            "MIDSTREAM",
            "Q1",
            switch_state=zamkniety,
            is_controllable=True,
        )
        ct = _aparat(
            pole, "ct", "currentTransformer", "CT", "MIDSTREAM", "T1", linked_ref=f"{pole}/ct"
        )
        es = _aparat(
            pole,
            "es",
            "earthSwitch",
            "ES",
            "DOWNSTREAM",
            "QE1",
            switch_state=otwarty,
            earthing_role="field_earth",
        )
        if rola == "TR":
            aparaty = [
                _aparat(
                    pole, "ds", "disconnector", "DS", "UPSTREAM", "Q11", switch_state=zamkniety
                ),
                cb,
                ct,
                es,
            ]
        else:
            aparaty = [
                _aparat(
                    pole, "ds_bus", "disconnector", "DS", "UPSTREAM", "Q11", switch_state=zamkniety
                ),
                cb,
                ct,
                _aparat(
                    pole, "ds_lin", "disconnector", "DS", "MIDSTREAM", "Q12", switch_state=zamkniety
                ),
                es,
                _aparat(pole, "head", "cableHead", "CABLE_HEAD", "DOWNSTREAM", None),
            ]
        enm["bays"].append(
            {
                "ref_id": pole,
                "name": nazwa,
                "bay_role": rola,
                "substation_ref": gpz["ref_id"],
                "bus_ref": szyna,
                "gpz_section_id": sekcja,
                "protection_codes": kody,
                "primary_devices": aparaty,
                "protection_ref": f"{pole}/prot",
            }
        )
        enm["measurements"].append(
            {
                "ref_id": f"{pole}/ct",
                "name": f"Przekładnik {opis}",
                "measurement_type": "CT",
                "bus_ref": szyna,
                "bay_ref": pole,
                "rating": {
                    "ratio_primary": przekladnia,
                    "ratio_secondary": 5,
                    "accuracy_class": "5P20",
                    "burden_va": obciazenie,
                },
                "purpose": "protection",
                "ct_arrangement": "3xCT",
            }
        )
        enm["protection_assignments"].append(
            {
                "ref_id": f"{pole}/prot",
                "name": f"Zabezpieczenie {opis}",
                "breaker_ref": f"{pole}/cb",
                "ct_ref": f"{pole}/ct",
                "device_type": "overcurrent",
                "settings": [
                    {
                        "function_type": "overcurrent_51",
                        "threshold_a": prog51,
                        "curve_type": "IEC_SI",
                        "time_multiplier": tms,
                    },
                    {
                        "function_type": "overcurrent_50",
                        "threshold_a": prog50,
                        "time_delay_s": zwloka50,
                    },
                ],
            }
        )
        if rola == "OUT":
            enm["protection_assignments"].append(
                {
                    "ref_id": f"{pole}/prot_n",
                    "name": f"Ziemnozwarciowe {opis}",
                    "breaker_ref": f"{pole}/cb",
                    "ct_ref": f"{pole}/ct",
                    "device_type": "earth_fault",
                    "settings": [
                        {"function_type": "earth_fault_51N", "threshold_a": 20, "time_delay_s": 0.3}
                    ],
                }
            )
    return enm


def _stacja_pole_pomiarowe(b: KlientBudowy) -> dict[str, Any]:
    b.gpz()
    b.odcinek_magistrali(80, "Magistrala 1")
    b.operacja(
        "insert_station_on_segment_sn",
        {
            "segment_id": segmenty_korytarza(b.migawka())[0],
            "field_apparatus_catalog_ref": APARAT_POLA_SN,
            "insert_at": {"mode": "RATIO", "value": 0.5},
            "station": {
                "station_type": "B",
                "station_name": "S01",
                "sn_voltage_kv": 15.0,
                "nn_voltage_kv": 0.4,
            },
            "nn_earthing": {"lv_system": "TN-C-S"},
            "sn_fields": [
                {"field_role": "LINIA_IN"},
                {"field_role": "LINIA_OUT"},
                {"field_role": "MEASUREMENT"},
                {"field_role": "TRANSFORMATOROWE"},
            ],
            "transformer": {"create": True, "transformer_catalog_ref": TRANSFORMATOR_630},
            # Bez bloku odpływów nN: stacja BEZ odbiorów (kontrakty TR2W-BEZ-POLA T7 — „zero
            # rekordów Load"; z odpływami magazyn modelu dokłada odbiory katalogowe).
        },
    )
    b.domknij_aparaty_nn(glowny="cb_nn_1000a")
    return b.migawka()


def _s95_gpz_swiezy(b: KlientBudowy) -> dict[str, Any]:
    b.gpz()
    return b.migawka()


def _nn_board_demo(b: KlientBudowy) -> dict[str, Any]:
    """``openBranch`` ze stroną nN: cztery odpływy stacji (odbiory na 1, 2 i 4), odpływ 3
    zasila kablem podrozdzielnicę RGnN-2, która ma sprzęgło sekcji i 14 odpływów w sekcji 2,
    a szyna nN stacji niesie źródło PV (lv-portal-screenshot.spec.ts: portal domeny nN)."""
    b.gpz()
    b.odcinek_magistrali(1200, "F1")
    b.stacja_b(segmenty_korytarza(b.migawka())[0], "Stacja B", nn_odplywy=4)
    b.odgalezienie(pole_gpz(b.migawka(), 0) + ".BRANCH", 140)
    enm = b.migawka()
    stacja = next(s for s in enm["substations"] if s.get("station_type") == "inline")
    szyna_nn = next(r for r in stacja["bus_refs"] if r.endswith("/nn_bus"))
    odplywy = [s for s in stacja["meta"]["nn_field_specs"] if s.get("bay_role") == "FEEDER"]
    for indeks, katalog in (
        (0, "load_mieszk_15kw"),
        (1, "load_mieszk_15kw"),
        (3, "load_uslugi_30kw"),
    ):
        b.operacja(
            "add_nn_load",
            {
                "station_ref": stacja["ref_id"],
                "bus_nn_ref": szyna_nn,
                "feeder_ref": odplywy[indeks]["field_ref"],
                "catalog_binding": wiazanie("OBCIAZENIE", katalog),
                "cos_phi": 0.95,
                "load_name": f"Odbiór {indeks + 1}",
            },
        )
    szyna_odplywu_3 = _szyna_odplywu_nn(b.migawka(), odplywy[2]["field_ref"])
    b.operacja(
        "add_nn_distribution_board",
        {
            "voltage_kv": 0.4,
            "name": "RGnN-2 (podrozdzielnica)",
            "supply": {
                "from_bus_ref": szyna_odplywu_3,
                "length_m": 50,
                "catalog_ref": "kab_nn_4x120_al",
            },
        },
    )
    rozdzielnica = next(
        s for s in b.migawka()["substations"] if s.get("station_type") == "rozdzielnica_nn"
    )
    b.operacja(
        "add_nn_section_coupler",
        {"station_ref": rozdzielnica["ref_id"], "catalog_ref": "cb_nn_630a"},
    )
    rozdzielnica = next(
        s for s in b.migawka()["substations"] if s.get("station_type") == "rozdzielnica_nn"
    )
    szyna_sekcji_2 = rozdzielnica["nn_sections"][1]["bus_ref"]
    for _ in range(14):
        b.operacja(
            "add_nn_outgoing_field",
            {"station_ref": rozdzielnica["ref_id"], "bus_nn_ref": szyna_sekcji_2},
        )
    b.operacja(
        "add_converter_source",
        {
            "source_technology": "PV",
            "connection_variant": "nn_side",
            # Źródło nN na szynie stacji: operacja wymaga transformatora W TEJ stacji
            # (`_has_transformer_in_path` nie przechodzi do rozdzielnicy zasilanej
            # kablem nN — znalezisko karty SLD-SUBSTRAT, zgłoszone w meldunku).
            "station_ref": stacja["ref_id"],
            "bus_nn_ref": szyna_nn,
            "catalog_binding": wiazanie("ZRODLO_NN_PV", "conv-pv-nn-0p5mw-0p4kv"),
            "power_setpoint_mw": 0.02,
            "source_name": "PV stacji B",
        },
    )
    b.domknij_aparaty_nn(glowny="cb_nn_1000a")
    return b.migawka()


def _szyna_odplywu_nn(enm: dict[str, Any], field_ref: str) -> str:
    """Szyna odpływu nN (cel aparatu odpływu promowanego do modelu)."""
    for galaz in enm["branches"]:
        if (galaz.get("meta") or {}).get("nn_field_migrowany_z") == field_ref:
            return str(galaz["to_bus_ref"])
    raise RuntimeError(f"brak aparatu odpływu nN {field_ref!r} w migawce")


def _stacja_b2(b: KlientBudowy, segment_ref: str, nazwa: str) -> dict[str, Any]:
    """Stacja B z polem odgałęźnym (IN + OUT + ODG) — sieci karty B-2."""
    return b.operacja(
        "insert_station_on_segment_sn",
        {
            "segment_id": segment_ref,
            "field_apparatus_catalog_ref": APARAT_POLA_SN,
            "insert_at": {"mode": "RATIO", "value": 0.5},
            "station": {
                "station_type": "B",
                "station_name": nazwa,
                "sn_voltage_kv": 15.0,
                "nn_voltage_kv": 0.4,
            },
            "nn_earthing": {"lv_system": "TN-C-S"},
            "sn_fields": [
                {"field_role": "LINIA_IN"},
                {"field_role": "LINIA_OUT"},
                {"field_role": "LINIA_ODG"},
            ],
            "transformer": {"create": True, "transformer_catalog_ref": TRANSFORMATOR_630},
            "nn_block": {"outgoing_feeders_nn_count": 1},
        },
    )


def _odpowiedz_operacji(wynik: dict[str, Any]) -> dict[str, Any]:
    """Wskazanie i zmiany odpowiedzi operacji — to, co czyta kotwica kamery."""
    return {"selection_hint": wynik["selection_hint"], "changes": wynik["changes"]}


def _b2_magistrala(b: KlientBudowy, liczba_odcinkow: int) -> list[str]:
    """GPZ + odcinki „Magistrala k" o długościach 200/260/320/380 m po kolei; zwraca ziarna."""
    b.gpz()
    ziarna: list[str] = []
    for k in range(liczba_odcinkow):
        wynik = b.odcinek_magistrali(200 + 60 * (k % 4), f"Magistrala {k + 1}")
        segment = next(r for r in wynik["changes"]["created_element_ids"] if r.startswith("seg/"))
        ziarna.append(segment.split("/")[1])
    return ziarna


#: Wstawienia stacji (numer odcinka magistrali, ścieżka połowy odcinka) w sieci DUŻEJ —
#: kolejność operacji odtworzona z zatwierdzonej migawki żywego backendu (karta B-2).
_B2_DUZA_STACJE: tuple[tuple[int, str], ...] = (
    (5, "segment"),
    (5, "segment_R"),
    (5, "segment_R_R"),
    (5, "segment_R_R_R"),
    (6, "segment"),
    (6, "segment_R"),
    (7, "segment"),
    (8, "segment"),
    (8, "segment_R"),
    (9, "segment"),
    (10, "segment"),
    (11, "segment"),
    (13, "segment"),
)
_B2_MALA_STACJE: tuple[tuple[int, str], ...] = ((1, "segment"), (2, "segment"))


def _b2_para(
    klient: TestClient,
    nazwa: str,
    odcinki: int,
    stacje: tuple[tuple[int, str], ...],
    operacja: tuple[int, str],
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    b = KlientBudowy(klient, nazwa)
    ziarna = _b2_magistrala(b, odcinki)
    for numer, (odcinek, polowa) in enumerate(stacje, start=1):
        _stacja_b2(b, f"seg/{ziarna[odcinek - 1]}/{polowa}", f"Stacja S{numer:02d} (typ B)")
    b.domknij_aparaty_nn(glowny="cb_nn_1000a")
    przed = b.migawka()
    srodkowy = f"seg/{ziarna[operacja[0] - 1]}/{operacja[1]}"
    wynik = _stacja_b2(b, srodkowy, f"Stacja S{len(stacje) + 1:02d} (typ B)")
    odpowiedz = {**_odpowiedz_operacji(wynik), "segment_srodkowy": srodkowy}
    # Migawka „po" = model tuż po operacji (tak, jak dostaje go kanwa); aparaty nN nowej
    # stacji czekają jeszcze na akcję naprawczą projektanta — to stan realny, nie defekt.
    return przed, b.migawka(), odpowiedz


def _b2_drogi(klient: TestClient) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    """Pięć dróg operacji budowy: migawka PO każdej i wskazanie z jej odpowiedzi."""
    b = KlientBudowy(klient, "Drogi operacji budowy")
    migawki: dict[str, dict[str, Any]] = {}
    drogi: dict[str, Any] = {}

    def zapisz(nazwa_operacji: str, wynik: dict[str, Any]) -> None:
        wskazanie = wynik["selection_hint"]
        drogi[nazwa_operacji] = {
            "wskazanie": wskazanie["element_id"],
            "typ": wskazanie["element_type"],
            "zoom_to": wskazanie["zoom_to"],
            "utworzone": wynik["changes"]["created_element_ids"],
        }
        migawki[nazwa_operacji] = b.migawka()

    zapisz("add_grid_source_sn", b.gpz())
    b.odcinek_magistrali(300)
    b.odcinek_magistrali(300)
    zapisz("continue_trunk_segment_sn", b.odcinek_magistrali(300))
    zapisz(
        "insert_station_on_segment_sn",
        _stacja_b2(b, segmenty_korytarza(b.migawka())[1], "Stacja S01 (typ B)"),
    )
    stacja = next(s for s in b.migawka()["substations"] if s.get("station_type") == "inline")
    pole_odg = next(
        f["field_ref"] for f in stacja["meta"]["field_specs"] if f.get("bay_role") == "FEEDER"
    )
    zapisz("start_branch_segment_sn", b.odgalezienie(f"{pole_odg}.BRANCH", 180))
    gpz = next(s for s in b.migawka()["substations"] if s.get("station_type") == "gpz")
    szyna_gpz = next(r for r in gpz["bus_refs"] if r.endswith("/bus_sn"))
    zapisz(
        "add_sn_bay",
        b.operacja(
            "add_sn_bay",
            {
                "station_ref": gpz["ref_id"],
                "bus_ref": szyna_gpz,
                "bay_role": "OUT",
                "catalog_binding": wiazanie("APARAT_SN", APARAT_POLA_SN),
            },
        ),
    )
    return migawki, drogi


def _s92(klient: TestClient) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    """Sieć biegu S9-2 i nakładki wyników biegów kanonicznych (zwarcie 3F i rozpływ)."""
    b = KlientBudowy(klient, "Bieg na schemacie")
    b.gpz()
    b.odcinek_magistrali(120, "Odcinek 0")
    b.odcinek_magistrali(121, "Odcinek 1")
    # Szablon stacji PRZELOTOWEJ (wcinanej w odcinek magistrali). Dawny zrzut użył
    # „tpl_sn_nn_1000kva" (RMU + pomiary): od POMIAR-ODG (a2487d16) stacja z pomiarem
    # rozliczeniowym idzie do ODGAŁĘZIENIA przez ZKSN, a ZKSN przed pierwszą stacją ciągu
    # (poprzednikiem jest GPZ) nie ma dziś kanału zejścia na rysunku („punkt poza
    # rysunkiem" — znalezisko karty SLD-SUBSTRAT, zgłoszone w meldunku). Kontrakt S9-2
    # (wyniki biegu na kanwie) potrzebuje stacji NA rysunku, więc sieć niesie stację
    # przelotową najbliższej mocy z typoszeregu.
    b.szablon("tpl_sn_nn_1250kva", segmenty_korytarza(b.migawka())[1])
    b.domknij_aparaty_nn(glowny="cb_nn_2000a")
    nakladki = []
    for rodzaj in ("SC_3F", "LOAD_FLOW"):
        bieg = klient.post(
            f"/api/execution/study-cases/{b.case_id}/runs",
            json={"analysis_type": rodzaj, "solver_input": {}},
        ).json()
        klient.post(f"/api/execution/runs/{bieg['id']}/execute")
        wynik = klient.get(f"/api/execution/runs/{bieg['id']}/results/v1").json()
        # Kształt nakładki = DOKŁADNIE ten, który kanwa dostaje od orkiestratora
        # (`frontend/src/ui2/legacy/useLegacyOrchestrator.ts`: `rawPayload` z `overlay_payload`
        # + `analysis_type`/statusów/czasu z topu ResultSetV1). Identyfikator i czas biegu są
        # losowe (uuid4, zegar) — w fiksturze stałe.
        nakladka = wynik["overlay_payload"]
        globalne = wynik.get("global_results") or {}
        nakladki.append(
            {
                "run_id": f"bieg-{rodzaj.lower()}",
                "analysis_type": nakladka.get("analysis_type") or wynik.get("analysis_type"),
                "elements": nakladka["elements"],
                "quality_status": globalne.get("quality_status"),
                "proof_status": globalne.get("proof_status"),
                "run_finished_at": _CZAS if wynik.get("run_finished_at") else None,
            }
        )
    return b.migawka(), nakladki[0], nakladki[1]


# --- rejestr plików ---------------------------------------------------------------

#: Sieci budowane jednym torem API: (ścieżki plików, nazwa w nagłówku, budowniczy).
_SIECI: tuple[tuple[tuple[str, ...], str, Callable[[KlientBudowy], dict[str, Any]]], ...] = (
    ((f"{SCENA}/openTerminal.enm.json",), "Otwarty koniec magistrali", _open_terminal),
    ((f"{SCENA}/openBranch.enm.json",), "Odgałęzienie z pola GPZ", _open_branch),
    ((f"{SCENA}/openTrunkChain.enm.json",), "Łańcuch odcinków magistrali", _open_trunk_chain),
    (
        (f"{SCENA}/gpzFeeder.enm.json", f"{PUBLICZNE}/gpzFeeder.enm.json"),
        "GPZ z magistralą i odgałęzieniem",
        _gpz_feeder,
    ),
    (
        (f"{SCENA}/gpzProtectionDataPath.enm.json",),
        "GPZ — ścieżka danych (pola, CT, zabezpieczenia)",
        _gpz_protection_data_path,
    ),
    (
        (f"{SCENA}/stacjaPolePomiarowe.enm.json",),
        "Stacja z polem pomiarowym",
        _stacja_pole_pomiarowe,
    ),
)


def render_fikstur_enm_sld() -> dict[str, str]:
    """Ścieżka względem ``frontend`` -> PEŁNA treść pliku (jeden tor zapisu i testu)."""
    from api.main import app

    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("mv_design_pro").setLevel(logging.WARNING)
    tresci: dict[str, str] = {}
    with TestClient(app) as klient:
        for sciezki, nazwa, budowniczy in _SIECI:
            tresc = _plik_enm(budowniczy(KlientBudowy(klient, nazwa)), nazwa)
            for sciezka in sciezki:
                tresci[sciezka] = tresc

        # Model surowy (bez opakowania „enm") — tak czyta go test menu budowy (S9-5).
        tresci[f"{KANWA}/s95GpzSwiezy.enm.json"] = _plik_enm(
            _s95_gpz_swiezy(KlientBudowy(klient, "GPZ bez odcinków")),
            "GPZ bez odcinków",
            opakuj=False,
        )
        tresci[f"{PUBLICZNE}/nnBoardDemo.enm.json"] = _plik_enm(
            _nn_board_demo(KlientBudowy(klient, "Stacja z rozdzielnicą nN")),
            "Stacja z rozdzielnicą nN",
        )

        bieg, zwarcie, rozplyw = _s92(klient)
        tresci[f"{KANWA}/s92Bieg.enm.json"] = _plik_enm(bieg, "Bieg na schemacie", opakuj=False)
        tresci[f"{KANWA}/s92Zwarcie.overlay.json"] = json_fikstury(zwarcie)
        tresci[f"{KANWA}/s92Rozplyw.overlay.json"] = json_fikstury(rozplyw)

        migawki, drogi = _b2_drogi(klient)
        for operacja, migawka in migawki.items():
            tresci[f"{KANWA}/b2Droga-{operacja}.enm.json"] = _plik_enm(
                migawka, "Drogi operacji budowy"
            )
        tresci[f"{KANWA}/b2DrogiOperacji.json"] = json_fikstury(drogi)

        for nazwa, odcinki, stacje, operacja in (
            ("Mala", 4, _B2_MALA_STACJE, (2, "segment_R")),
            ("Duza", 20, _B2_DUZA_STACJE, (8, "segment_R_R")),
        ):
            przed, po, odpowiedz = _b2_para(klient, f"Sieć {nazwa}", odcinki, stacje, operacja)
            tresci[f"{KANWA}/b2{nazwa}Przed.enm.json"] = _plik_enm(przed, f"Sieć {nazwa} — przed")
            tresci[f"{KANWA}/b2{nazwa}Po.enm.json"] = _plik_enm(po, f"Sieć {nazwa} — po")
            tresci[f"{KANWA}/b2{nazwa}Operacja.json"] = json_fikstury(odpowiedz)
    return dict(sorted(tresci.items()))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="zapisz fikstury do frontendu")
    args = parser.parse_args(argv)
    rozjazdy = 0
    for sciezka, tresc in render_fikstur_enm_sld().items():
        plik = FRONTEND / sciezka
        if args.write:
            plik.write_text(tresc, encoding="utf-8")
            print(f"[zapisano] {plik}")
        elif not plik.exists() or plik.read_text(encoding="utf-8") != tresc:
            rozjazdy += 1
            print(f"[rozjazd] {plik}")
    return 1 if rozjazdy else 0


if __name__ == "__main__":
    sys.exit(main())


__all__ = ["render_fikstur_enm_sld", "zaokraglij_liczby"]
