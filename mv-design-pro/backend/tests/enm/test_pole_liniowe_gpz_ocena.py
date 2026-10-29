"""Ocena pola liniowego GPZ wg klasy pola — `enm.pole_liniowe_gpz` (karta UX-04/POLE-LINIOWE-
WZORZEC, rozszerzenia 1–2).

PO CO. Klasa pola (IRiESD ENEA Operator, wersja 2.3, II.4.5.4.2.1–2.3) rozstrzyga, które funkcje
EAZ pole musi mieć, których mieć nie może (SCO w linii z generacją, SPZ w polu dedykowanym)
i czy sieć za polem zgadza się z klasą (generacja z pola odbiorczego, odbiory za polem
dedykowanym), a próg wytwórcy ≥ 200 kW / odbiorcy > 4 MW (ENEA Zeszyt 1, Z.11) — czy pole wymaga
rdzenia rozliczeniowego. Test pilnuje oceny w iloczynie cech, z jawną wyrocznią reguł.

ILOCZYN CECH: klasa zadeklarowana {brak, odbiorcze, mieszane, dedykowane wytwórcy} × wykonanie
pola {Z.10, Z.11.1, Z.11} × generacja za polem {brak, 150 kW, 1 MW} × odbiór za polem {brak,
5 MW} × sekcja GPZ {1, 2}. Każda scena powstaje operacjami domenowymi (GPZ → odcinek kablowy
z pola → `set_bay_equipment` szablonu z klasą); generator i odbiór są dopisywane na szynie
końca odcinka. Kombinacja, której operacja odmawia (Z.10 w klasie z generacją), jest
sprawdzana jako odmowa z kodem.

INIEKCJE: SCO dopisane w polu mieszanym → W055; SPZ dopisane w polu dedykowanym → W056;
odbiór za polem dedykowanym → W054; generacja za polem odbiorczym → W053; pomiar AJEE bez
rdzenia rozliczeniowego → W057.
"""

from __future__ import annotations

import copy
import functools
import itertools
from typing import Any

import pytest
from application.field_read_model import build_field_read_model
from domain.canonical_operations import READINESS_CODES
from domain.readiness_bridge import ODWZOROWANIE_WALIDATOR_NA_KANON
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from enm.pole_liniowe_gpz import (
    KOD_AJEE_BRAK_RDZENIA,
    KOD_GENERACJA_Z_POLA_ODBIORCZEGO,
    KOD_ODBIORY_ZA_POLEM_DEDYKOWANYM,
    KOD_SCO_W_POLU_Z_GENERACJA,
    KOD_SPZ_W_POLU_DEDYKOWANYM,
    KODY_WALIDATORA_POLA_LINIOWEGO,
    ocena_pola_liniowego,
    oceny_pol_liniowych,
)
from enm.validator import ENMValidator
from network_model.catalog.bay_templates import WYMAGANIA_EAZ_KLASY_POLA
from werdykt.etykiety import etykieta

from tests.reference_networks.sceny_zajetosci_pol import APARAT, KABEL, ZRODLO, ok, op

SZABLON = {
    "Z10": "bay_template_gpz_line_enea_z10_trojpolozeniowy",
    "Z11_1": "bay_template_gpz_line_enea_z11_1_trojpolozeniowy",
    "Z11": "bay_template_gpz_line_enea_z11_trojpolozeniowy",
}
KLASY = [None, "ODBIORCZE", "MIESZANE", "DEDYKOWANE_WYTWORCY"]
GENERACJA_KW = [0, 150, 1000]
ODBIOR_KW = [0, 5000]
SEKCJE = [0, 1]


@functools.cache
def _baza() -> dict[str, Any]:
    pusty = EnergyNetworkModel(header=ENMHeader(name="POLE-KLASA", defaults=ENMDefaults()))
    enm = ok(
        op(
            pusty.model_dump(mode="json"),
            "add_grid_source_sn",
            {
                "voltage_kv": 15.0,
                "sk3_mva": 250.0,
                "catalog_ref": ZRODLO,
                "sections_count": 2,
                "line_fields_per_section": 1,
                "gpz_line_field_apparatus": {"catalog_ref": APARAT},
            },
        )
    )
    for pole in _pola(enm):
        enm = ok(
            op(
                enm,
                "continue_trunk_segment_sn",
                {
                    "field_ref": pole["ref_id"],
                    "segment": {"rodzaj": "KABEL", "dlugosc_m": 300, "catalog_ref": KABEL},
                },
            )
        )
    return enm


def _pola(enm: dict[str, Any]) -> list[dict[str, Any]]:
    return sorted(
        (b for b in enm["bays"] if "gpz_line_field" in (b.get("tags") or [])),
        key=lambda b: b["ref_id"],
    )


def _szyna_konca(enm: dict[str, Any], pole: dict[str, Any]) -> str:
    (odcinek,) = (
        g
        for g in enm["branches"]
        if g["type"] == "cable" and g["from_bus_ref"] == pole["terminal_bus_ref"]
    )
    return odcinek["to_bus_ref"]


def _wyposaz(enm: dict[str, Any], pole: dict[str, Any], wykonanie: str, klasa: str | None):
    payload: dict[str, Any] = {
        "bay_ref": pole["ref_id"],
        "mode": "szablon",
        "bay_template_ref": SZABLON[wykonanie],
    }
    if klasa is not None:
        payload["klasa_pola"] = klasa
    return op(enm, "set_bay_equipment", payload)


def _scena(
    wykonanie: str, klasa: str | None, generacja_kw: int, odbior_kw: int, sekcja: int
) -> tuple[dict[str, Any], dict[str, Any]]:
    enm = copy.deepcopy(_baza())
    pole = _pola(enm)[sekcja]
    enm = ok(_wyposaz(enm, pole, wykonanie, klasa))
    szyna = _szyna_konca(enm, pole)
    if generacja_kw:
        enm["generators"].append(
            {
                "ref_id": "gen-pv",
                "name": "Farma PV",
                "bus_ref": szyna,
                "p_mw": generacja_kw / 1000.0,
                "gen_type": "pv_inverter",
            }
        )
    if odbior_kw:
        enm["loads"].append(
            {
                "ref_id": "odb-zaklad",
                "name": "Zakład",
                "bus_ref": szyna,
                "p_mw": odbior_kw / 1000.0,
                "q_mvar": 1.0,
            }
        )
    return enm, next(b for b in enm["bays"] if b["ref_id"] == pole["ref_id"])


# --- wyrocznia (reguły IRiESD II.4.5.4.2 i ENEA Zeszyt 1 zapisane wprost) --------------------


def _klasa_oceny(klasa: str | None, generacja_kw: int, odbior_kw: int) -> str:
    if klasa is not None:
        return klasa
    if not generacja_kw:
        return "ODBIORCZE"
    return "MIESZANE" if odbior_kw else "DEDYKOWANE_WYTWORCY"


def _oczekiwane_niezgodnosci(
    wykonanie: str, klasa: str | None, kody: list[str], generacja_kw: int, odbior_kw: int
) -> list[str]:
    oceny = _klasa_oceny(klasa, generacja_kw, odbior_kw)
    wynik: list[str] = []
    # II.4.5.4.2.1: pole odbiorcze — bez modułów wytwarzania; pole bez klasy w wykonaniu Z.10
    # (bez przekładnika napięciowego od strony linii) jest polem odbiorczym.
    if generacja_kw and (klasa == "ODBIORCZE" or (klasa is None and wykonanie == "Z10")):
        wynik.append(KOD_GENERACJA_Z_POLA_ODBIORCZEGO)
    # II.4.5.4.2.3: pole dedykowane współpracuje wyłącznie z modułami wytwarzania.
    if klasa == "DEDYKOWANE_WYTWORCY" and odbior_kw:
        wynik.append(KOD_ODBIORY_ZA_POLEM_DEDYKOWANYM)
    # II.4.5.4.7.1 pkt 1: SCO nie w liniach z jednostkami wytwórczymi.
    if oceny in {"MIESZANE", "DEDYKOWANE_WYTWORCY"} and {"SCO", "SPZ/SCO"} & set(kody):
        wynik.append(KOD_SCO_W_POLU_Z_GENERACJA)
    # Rozstrzygnięcie sesji głównej: SPZ w polu dedykowanym jest niezgodnością.
    if oceny == "DEDYKOWANE_WYTWORCY" and {"79", "SPZE"} & set(kody):
        wynik.append(KOD_SPZ_W_POLU_DEDYKOWANYM)
    # Z.11 s.90: wytwórca ≥ 200 kW albo odbiorca > 4 MW — rdzeń rozliczeniowy; ma go tylko CT
    # 200-400/5/5/5 wykonania Z.11.
    if (generacja_kw >= 200 or odbior_kw > 4000) and wykonanie != "Z11":
        wynik.append(KOD_AJEE_BRAK_RDZENIA)
    return wynik


ILOCZYN = list(itertools.product(SZABLON, KLASY, GENERACJA_KW, ODBIOR_KW, SEKCJE))


@pytest.mark.parametrize("wykonanie,klasa,generacja_kw,odbior_kw,sekcja", ILOCZYN)
def test_ocena_pola_w_iloczynie_cech(wykonanie, klasa, generacja_kw, odbior_kw, sekcja):
    if wykonanie == "Z10" and klasa in {"MIESZANE", "DEDYKOWANE_WYTWORCY"}:
        # Operacja odmawia (IRiESD II.4.5.4.2.2–2.3: pole z generacją wymaga przekładnika
        # napięciowego od strony linii) — kod odmowy, model bez zmian.
        enm = copy.deepcopy(_baza())
        odmowa = _wyposaz(enm, _pola(enm)[sekcja], wykonanie, klasa)
        assert odmowa["error_code"] == "pole.klasa_pola_niezgodna_z_wykonaniem"
        return
    enm, pole = _scena(wykonanie, klasa, generacja_kw, odbior_kw, sekcja)
    ocena = ocena_pola_liniowego(enm, pole)
    assert ocena is not None
    oczekiwana_klasa = _klasa_oceny(klasa, generacja_kw, odbior_kw)
    assert ocena.klasa_oceny == oczekiwana_klasa
    assert ocena.klasa_przyjeta is (klasa is None)
    assert ocena.klasa_zadeklarowana == klasa
    assert [m.p_kw for m in ocena.moduly] == ([float(generacja_kw)] if generacja_kw else [])
    assert [p for _r, p in ocena.odbiory] == ([float(odbior_kw)] if odbior_kw else [])
    assert ocena.ajee_wymagany is (generacja_kw >= 200 or odbior_kw > 4000)
    assert ocena.ajee_rdzen_obecny is (wykonanie == "Z11")
    kody = list(pole["protection_codes"])
    assert [n.kod for n in ocena.niezgodnosci] == _oczekiwane_niezgodnosci(
        wykonanie, klasa, kody, generacja_kw, odbior_kw
    )
    # Pole drugiej sekcji nie jest zasilane z tej samej sieci — jego ocena nie widzi generacji.
    drugie = _pola(enm)[1 - sekcja]
    obce = ocena_pola_liniowego(enm, drugie)
    assert obce is not None and obce.moduly == () and obce.odbiory == ()
    # Każda ocena funkcji jest rekordem wyjaśnialnym, a funkcja „na żądanie OSD" nigdy nie
    # dostaje „spełnia" (wymóg zależy od warunków przyłączenia, których model nie niesie).
    assert [f.kod for f in ocena.oceny_funkcji] == [
        kod for kod, _w, _p in WYMAGANIA_EAZ_KLASY_POLA[oczekiwana_klasa]
    ]
    for funkcja in ocena.oceny_funkcji:
        assert funkcja.kompletnosc_dowodu == "NIEPELNY"
        assert "IRiESD ENEA Operator (wersja 2.3) II.4.5.4.2" in funkcja.podstawa
        assert funkcja.wyjasnienie.przyczyna_pl and funkcja.kryterium and funkcja.co_oceniono
        # Etykieta z kanonicznego słownika §9 (poziom kryterium) — ta sama funkcja co karty
        # werdyktu; zastrzeżenie nazywa niepełny dowód (deklaracja, nie nastawy przekaźnika).
        assert funkcja.etykieta == etykieta(funkcja.status, "NIEPELNY", "K")
        assert funkcja.etykieta.etykieta_pl.lower() in funkcja.wyjasnienie.zdanie_pl
        assert any("niepełna" in z for z in funkcja.wyjasnienie.zastrzezenia)
        # Braki są nazwane dokładnie tam, gdzie werdykt z nich wynika.
        assert bool(funkcja.wyjasnienie.czego_brakuje) is (
            funkcja.wymog == "NA_ZADANIE_OSD"
            or (funkcja.status == "NIE_SPELNIA" and funkcja.wymog != "ZAKAZANA")
        )
        assert funkcja.obecna is (funkcja.kod in kody)
        if funkcja.wymog == "NA_ZADANIE_OSD":
            assert funkcja.status in {"BRAK_DOWODU", "NIEJEDNOZNACZNY"}
    # Walidator modelu raportuje TE SAME niezgodności kodami W053–W057, z akcją naprawczą.
    wynik = ENMValidator().validate(EnergyNetworkModel.model_validate(enm))
    zgloszone = sorted(
        i.code
        for i in wynik.issues
        if i.code in KODY_WALIDATORA_POLA_LINIOWEGO.values() and pole["ref_id"] in i.element_refs
    )
    assert zgloszone == sorted(KODY_WALIDATORA_POLA_LINIOWEGO[n.kod] for n in ocena.niezgodnosci)
    for issue in wynik.issues:
        if issue.code in KODY_WALIDATORA_POLA_LINIOWEGO.values():
            assert issue.suggested_fix and issue.fix_action is not None


@pytest.mark.parametrize(
    "kod,wymog,obecna,napowietrzna,status",
    [
        ("51", "OBOWIAZKOWA", True, False, "SPELNIA"),
        ("51", "OBOWIAZKOWA", False, False, "NIE_SPELNIA"),
        ("79", "NAPOWIETRZNA", True, False, "NIE_DOTYCZY"),
        ("79", "NAPOWIETRZNA", True, True, "SPELNIA"),
        ("79", "NAPOWIETRZNA", False, True, "NIE_SPELNIA"),
        ("81U", "NA_ZADANIE_OSD", True, False, "BRAK_DOWODU"),
        ("81U", "NA_ZADANIE_OSD", False, False, "NIEJEDNOZNACZNY"),
        ("SCO", "DOPUSZCZALNA", True, False, "NIE_DOTYCZY"),
        ("SCO", "ZAKAZANA", True, False, "NIE_SPELNIA"),
        ("SCO", "ZAKAZANA", False, False, "SPELNIA"),
    ],
)
def test_status_funkcji_wg_wymogu(kod, wymog, obecna, napowietrzna, status):
    from enm.pole_liniowe_gpz import _ocena_funkcji

    ocena = _ocena_funkcji(
        kod,
        wymog,
        "IRiESD ENEA Operator (wersja 2.3) II.4.5.4.2.2 pkt 1",
        obecna,
        napowietrzna,
        "MIESZANE",
    )
    assert ocena.status == status


def test_linia_napowietrzna_za_polem_wymaga_spz():
    enm, pole = _scena("Z10", "ODBIORCZE", 0, 0, 0)
    szyna = _szyna_konca(enm, pole)
    for galaz in enm["branches"]:
        if galaz["type"] == "cable" and galaz["to_bus_ref"] == szyna:
            galaz["type"] = "line_overhead"
    ocena = ocena_pola_liniowego(enm, pole)
    assert ocena is not None and ocena.linia_napowietrzna
    spz = next(f for f in ocena.oceny_funkcji if f.kod == "79")
    assert spz.status == "SPELNIA"


def test_pole_odbiorcze_z10_ma_f_mniejsze_z_klasy():
    """IRiESD II.4.5.4.2.1 pkt 5: f< obowiązkowe w polu odbiorczym — rysunek Z.10 (s.89) go nie
    wymienia, więc klasa ODBIORCZE dopisuje 81U (rozbieżność rysunku z IRiESD). Pole Z.10 bez
    klasy niesie zestaw rysunku i ocena wskazuje brak f<."""
    _enm, z_klasa = _scena("Z10", "ODBIORCZE", 0, 0, 0)
    assert "81U" in z_klasa["protection_codes"]
    enm, bez_klasy = _scena("Z10", None, 0, 0, 0)
    ocena = ocena_pola_liniowego(enm, bez_klasy)
    assert ocena is not None
    assert next(f for f in ocena.oceny_funkcji if f.kod == "81U").status == "NIE_SPELNIA"


@pytest.mark.parametrize("p_kw,typ", [(150, "A"), (1000, "B"), (20000, "C")])
def test_typ_modulu_za_polem_z_progow_nc_rfg(p_kw, typ):
    enm, pole = _scena("Z11", "DEDYKOWANE_WYTWORCY", p_kw, 0, 1)
    ocena = ocena_pola_liniowego(enm, pole)
    assert ocena is not None
    (modul,) = ocena.moduly
    assert modul.typ == typ and modul.napiecie_kv == 15.0 and modul.powod_pl


def test_moc_modulu_z_granicy_mocy_czynnej():
    enm, pole = _scena("Z11", "DEDYKOWANE_WYTWORCY", 150, 0, 0)
    enm["generators"][-1]["limits"] = {"p_max_mw": 0.5}
    ocena = ocena_pola_liniowego(enm, pole)
    assert ocena is not None and ocena.moduly[0].p_kw == 500.0 and ocena.ajee_wymagany


# --- iniekcje: dopisanie funkcji zakazanej czerwieni ocenę i walidator ----------------------


@pytest.mark.parametrize(
    "klasa,generacja_kw,odbior_kw,dopisany,kod",
    [
        ("MIESZANE", 1000, 5000, "SCO", KOD_SCO_W_POLU_Z_GENERACJA),
        ("DEDYKOWANE_WYTWORCY", 1000, 0, "SCO", KOD_SCO_W_POLU_Z_GENERACJA),
        ("DEDYKOWANE_WYTWORCY", 1000, 0, "79", KOD_SPZ_W_POLU_DEDYKOWANYM),
        ("DEDYKOWANE_WYTWORCY", 1000, 0, "SPZE", KOD_SPZ_W_POLU_DEDYKOWANYM),
    ],
)
def test_iniekcja_funkcji_zakazanej(klasa, generacja_kw, odbior_kw, dopisany, kod):
    enm, pole = _scena("Z11", klasa, generacja_kw, odbior_kw, 0)
    ocena = ocena_pola_liniowego(enm, pole)
    assert ocena is not None and ocena.niezgodnosci == ()
    pole["protection_codes"] = [*pole["protection_codes"], dopisany]
    po = ocena_pola_liniowego(enm, pole)
    assert po is not None and [n.kod for n in po.niezgodnosci] == [kod]
    assert next(f for f in po.oceny_funkcji if f.kod == dopisany).status == "NIE_SPELNIA"
    kody = {i.code for i in ENMValidator().validate(EnergyNetworkModel.model_validate(enm)).issues}
    assert KODY_WALIDATORA_POLA_LINIOWEGO[kod] in kody


def test_iniekcja_rdzen_rozliczeniowy_usuniety_z_z11():
    enm, pole = _scena("Z11", "DEDYKOWANE_WYTWORCY", 1000, 0, 0)
    assert ocena_pola_liniowego(enm, pole).niezgodnosci == ()  # type: ignore[union-attr]
    ct = next(a for a in pole["primary_devices"] if a["kind"] == "CT")
    ct["rdzenie"] = [r for r in ct["rdzenie"] if "ROZLICZENIE" not in r["przeznaczenie"]]
    po = ocena_pola_liniowego(enm, pole)
    assert po is not None and [n.kod for n in po.niezgodnosci] == [KOD_AJEE_BRAK_RDZENIA]


# --- wpięcie: walidator → gotowość, odczyt pola, determinizm --------------------------------


def test_kody_walidatora_zarejestrowane_w_gotowosci():
    for kod_walidatora in KODY_WALIDATORA_POLA_LINIOWEGO.values():
        assert ODWZOROWANIE_WALIDATOR_NA_KANON[kod_walidatora] in READINESS_CODES


def test_odczyt_pola_niesie_ocene_klasy():
    enm, pole = _scena("Z11", "MIESZANE", 1000, 5000, 1)
    odczyt = build_field_read_model("case-klasa", EnergyNetworkModel.model_validate(enm))
    rekord = next(f for f in odczyt["fields"] if f["bay_ref"] == pole["ref_id"])
    ocena = rekord["ocena_pola_liniowego"]
    assert ocena["klasa_oceny"] == "MIESZANE" and ocena["klasa_przyjeta"] is False
    assert ocena["moduly"][0]["typ"] == "B"
    assert {f["kod"] for f in ocena["oceny_funkcji"]} >= {"51", "SCO"}
    # Pole spoza GPZ (brak oceny) niesie jawne `None`, nie pominięty klucz.
    assert all("ocena_pola_liniowego" in f for f in odczyt["fields"])


def test_ocena_deterministyczna():
    enm, _pole = _scena("Z11_1", None, 1000, 5000, 0)
    assert oceny_pol_liniowych(enm) == oceny_pol_liniowych(copy.deepcopy(enm))


def test_siec_za_polem_nie_przechodzi_przez_szyny_sekcji_gpz():
    """Pierścień zamknięty między odcinkami pól obu sekcji: sieć za polem 1 obejmuje odcinek
    pola 2 (zasilany też z pola 1), ale nie szyny sekcji GPZ i tego, co do nich przyłączone."""
    enm, pole = _scena("Z11", "MIESZANE", 1000, 5000, 0)
    drugie = _pola(enm)[1]
    szyna_a, szyna_b = _szyna_konca(enm, pole), _szyna_konca(enm, drugie)
    wzor = next(g for g in enm["branches"] if g["type"] == "cable")
    enm["branches"].append(
        {
            **copy.deepcopy(wzor),
            "ref_id": "kabel-pierscien",
            "id": None,
            "from_bus_ref": szyna_a,
            "to_bus_ref": szyna_b,
        }
    )
    enm["branches"][-1].pop("id")
    enm["loads"].append(
        {
            "ref_id": "odb-pomocnicze",
            "name": "Potrzeby własne",
            "bus_ref": drugie["bus_ref"],
            "p_mw": 0.1,
            "q_mvar": 0.0,
        }
    )
    enm["generators"].append(
        {
            "ref_id": "gen-b",
            "name": "PV B",
            "bus_ref": szyna_b,
            "p_mw": 0.3,
            "gen_type": "pv_inverter",
        }
    )
    ocena = ocena_pola_liniowego(enm, pole)
    assert ocena is not None
    assert [m.ref_id for m in ocena.moduly] == ["gen-b", "gen-pv"]
    assert [r for r, _p in ocena.odbiory] == ["odb-zaklad"]


# --- obwody wtórne funkcji i napięcie zwrotne (uzupełnienie właściciela 2026-10-29) -------------
# Iloczyn: wykonanie {Z.10, Z.11.1, Z.11} × klasa dopuszczająca wykonanie × generacja za polem
# {brak, 1 MW} × rekord ruchu pola {brak, łączność „ok" pod napięciem, „ok" bez napięcia,
# łączność „offline"}. Wyrocznia: obwód każdej funkcji z danych wzorca rozwiązany na aparatach
# TEGO pola; stan napięcia z pomiaru WYŁĄCZNIE przy łączności „ok".

KLASY_WYKONANIA = [
    (w, k)
    for w in SZABLON
    for k in ("ODBIORCZE", "MIESZANE", "DEDYKOWANE_WYTWORCY")
    if not (w == "Z10" and k != "ODBIORCZE")
]


@pytest.mark.parametrize("wykonanie,klasa", KLASY_WYKONANIA)
def test_obwody_funkcji_pola_z_wzorca(wykonanie, klasa):
    enm, pole = _scena(wykonanie, klasa, 1000 if klasa != "ODBIORCZE" else 0, 0, 0)
    ocena = ocena_pola_liniowego(enm, pole)
    assert ocena is not None and ocena.obwody_wtorne is not None
    kody = list(pole["protection_codes"])
    powiazane = [p.funkcja for p in ocena.obwody_wtorne.powiazania]
    # Kolejność: zestaw funkcji pola, potem funkcje wzorca, których pole nie ma.
    assert [o.kod for o in ocena.obwody_funkcji] == [
        *kody,
        *(k for k in powiazane if k not in kody),
    ]
    for obwod in ocena.obwody_funkcji:
        assert obwod.obecna is (obwod.kod in kody)
        if obwod.kod not in powiazane:
            # Funkcja dopisana klasą, której rysunek wzorca nie rysuje (Z.10: f< z IRiESD).
            assert obwod.blok_rysunku is None and "nie rysuje" in obwod.wejscia_pl[0]
            continue
        assert obwod.blok_rysunku and obwod.wejscia_pl and obwod.wyjscia_pl
        assert not any("brak aparatu" in w for w in obwod.wejscia_pl)
    po_kodzie = {o.kod: o for o in ocena.obwody_funkcji}
    assert po_kodzie["67N"].wejscia_pl == (
        "przekładnik Ferrantiego T2, przekładnia 1/100",
        "sygnał „Z, Zz”",
    )
    rdzen = "III" if wykonanie == "Z11" else "I"
    assert po_kodzie["51"].wejscia_pl == (
        f"rdzeń {rdzen} przekładnika prądowego T1: 200-400/5, 15 VA, klasa 5P20",
    )
    if wykonanie == "Z10":
        assert ocena.napiecie_zwrotne is None
        assert po_kodzie["81U"].blok_rysunku is None
    else:
        assert po_kodzie["81U"].wejscia_pl == (
            "uzwojenie III przekładnika napięciowego T3: SN/√3 / 0,1/√3, 7,5 VA, klasa 0,5/3P",
        )


@pytest.mark.parametrize("wykonanie", ["Z11_1", "Z11"])
@pytest.mark.parametrize("generacja_kw", [0, 1000])
@pytest.mark.parametrize(
    "ruch,stan",
    [
        (None, "NIEUSTALONY"),
        ({"secondary_communication_status": "offline"}, "NIEUSTALONY"),
        (
            {
                "secondary_communication_status": "ok",
                "energization_and_safety": {"energized_from_feeder_side": True},
            },
            "POD_NAPIECIEM",
        ),
        (
            {
                "secondary_communication_status": "ok",
                "energization_and_safety": {"energized_from_feeder_side": False},
            },
            "BEZ_NAPIECIA",
        ),
    ],
)
def test_napiecie_zwrotne_pola(wykonanie, generacja_kw, ruch, stan):
    enm, pole = _scena(wykonanie, "MIESZANE", generacja_kw, 5000, 0)
    if ruch is not None:
        pole["runtime_state"] = ruch
    ocena = ocena_pola_liniowego(enm, pole)
    assert ocena is not None
    nz = ocena.napiecie_zwrotne
    assert nz is not None
    assert nz.stan_pomiaru == stan
    assert nz.mozliwe is (generacja_kw > 0)
    assert nz.zrodla_za_polem == (1 if generacja_kw else 0)
    assert nz.blokada_nz is ("NZ" in pole["protection_codes"])
    assert nz.pomiar_pl.startswith("uzwojenie III przekładnika napięciowego T3")
    assert "Blok. ZW" in nz.pomiar_pl and nz.wyjasnienie_pl and nz.stan_pomiaru_pl


def test_iniekcja_aparat_wzorca_usuniety_z_pola():
    """Iniekcja: przekładnik napięciowy pola przemianowany — obwody funkcji nazywają brak aparatu,
    zamiast udawać pomiar z uzwojenia, którego pole nie ma."""
    enm, pole = _scena("Z11_1", "MIESZANE", 1000, 5000, 0)
    (vt,) = (a for a in pole["primary_devices"] if a["kind"] == "VT")
    vt["designation"] = "T9"
    ocena = ocena_pola_liniowego(enm, pole)
    assert ocena is not None and ocena.napiecie_zwrotne is not None
    assert "brak aparatu w polu" in ocena.napiecie_zwrotne.pomiar_pl
    nz = next(o for o in ocena.obwody_funkcji if o.kod == "NZ")
    assert nz.wejscia_pl == ("uzwojenie III przekładnika napięciowego T3 — brak aparatu w polu",)
