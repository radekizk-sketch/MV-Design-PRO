"""Źródło napięcia zerowego 3U₀ funkcji 67N — przypisanie, odmowa, ocena, walidator, odczyt
(karta UX-04/POLE-LINIOWE-WZORZEC, decyzja właściciela 2026-10-29 pkt 4).

PO CO. Szablon pola przypisywał zabezpieczenie kierunkowe ziemnozwarciowe 67N automatycznie,
choć pole liniowe GPZ samo napięcia zerowego nie mierzy (ENEA Zeszyt 1 §26.9: 67N mierzy I0 i U0;
Z.10 s.89 i Z.11.1 s.91 — blok ziemnozwarciowy z wejściami przekładnika Ferrantiego 1/100
i obwodu okrężnego „Z, Zz"; Z.17 s.97 — uzwojenie III przekładnika pola pomiaru napięcia 0,1/3
w otwartym trójkącie na obwód „Z,Zz"). Reguła jest jedna
(`enm.zrodlo_napiecia_zerowego.zrodlo_u0_pola`): 67N wchodzi do pola wyłącznie przy przekładniku
Ferrantiego w polu i powiązaniu `Bay.zrodlo_u0_ref` z przekładnikiem z otwartym trójkątem pola
pomiaru napięcia szyn tej samej sekcji (albo własnym). Bez warunku — funkcja nieprzypisana, ocena
`NIE_OCENIONO` z brakami (kontrakt werdyktu wyjaśnialnego: brak danych ≠ spełnia).

ILOCZYN CECH (ścieżka użytkownika — operacje domenowe): wykonanie pola {Z.10, Z.11.1} × pole
pomiaru napięcia Z.17 w sekcji {obecne, brak} × powiązanie {potwierdzone, brak}; konsumenci
reguły {zestaw funkcji pola, powiązania aparatów (Ferranti, wyłącznik), ocena pola liniowego,
walidator W064, model odczytu pola (kontrolka powiązania, ścieżka zwarcia doziemnego)}. Do tego:
odmowy operacji (każdy kod braku źródła), powiązanie nieaktualne (wyposażenie pola Z.17 zdjęte,
deklaracja ręczna 67N), klasa wszystkich miejsc przypisujących funkcje (szablony rejestru, role,
klasy pola, szablony producenckie), determinizm odcisku.
"""

from __future__ import annotations

import copy
import functools
import itertools
import json
from typing import Any

import pytest
from application.field_read_model import _build_earth_fault_path, build_field_read_model
from enm.domain_operations import execute_domain_operation
from enm.hash import hash_migawki_enm
from enm.models import Bay, EnergyNetworkModel
from enm.pole_liniowe_gpz import ocena_pola_liniowego
from enm.validator import ENMValidator
from enm.zrodlo_napiecia_zerowego import (
    KOD_WALIDATORA_ZRODLA_U0,
    KOD_ZRODLA_U0_NIEPOPRAWNEGO,
    zrodlo_u0_pola,
)
from network_model.catalog.bay_templates import (
    BAY_TEMPLATE_REGISTRY,
    KLASY_POLA_LINIOWEGO,
    WARUNKI_FUNKCJI_EAZ,
    funkcje_eaz_roli,
    funkcje_eaz_szablonu,
)
from network_model.catalog.switchgear.canonical_fallback import (
    list_canonical_fallback_templates,
    list_switchgear_solution_templates_for_manufacturer,
)

from tests.reference_networks.scena_geometrii_stacji import (
    dodaj_pole_pomiaru_napiecia_z17,
    zbuduj_gpz_pola_liniowe,
)

WYKONANIA = ("Z10", "Z11_1")
#: Stan komórki iloczynu: (pole Z.17 w sekcji, powiązanie potwierdzone). Komórka „Z.17 brak ×
#: powiązanie potwierdzone" jest nieosiągalna — próbę pokrywa odmowa `INNA_SEKCJA` niżej.
KOMORKI = (("obecne", True), ("obecne", False), ("brak", False))
WSZYSTKIE_WARUNKI = frozenset(WARUNKI_FUNKCJI_EAZ.values())


def _op(enm: dict[str, Any], nazwa: str, payload: dict[str, Any]) -> dict[str, Any]:
    return execute_domain_operation(enm_dict=copy.deepcopy(enm), op_name=nazwa, payload=payload)


def _ok(odpowiedz: dict[str, Any]) -> dict[str, Any]:
    assert not odpowiedz.get("error"), (odpowiedz.get("error_code"), odpowiedz.get("error"))
    return odpowiedz["snapshot"]


def _sekcje(enm: dict[str, Any]) -> list[str]:
    return sorted({b["gpz_section_id"] for b in enm["bays"] if b.get("gpz_section_id")})


def _pola_liniowe(enm: dict[str, Any], sekcja: str) -> list[dict[str, Any]]:
    return sorted(
        (
            b
            for b in enm["bays"]
            if b.get("gpz_section_id") == sekcja and "gpz_line_field" in (b.get("tags") or [])
        ),
        key=lambda b: b["ref_id"],
    )


def _pole(enm: dict[str, Any], ref: str) -> dict[str, Any]:
    return next(b for b in enm["bays"] if b["ref_id"] == ref)


def _klasa(wykonanie: str) -> str | None:
    return "MIESZANE" if wykonanie == "Z11_1" else None


@functools.cache
def _scena_json(wykonanie: str) -> str:
    """Sekcja 1: pole Z.17 i powiązane pola liniowe; sekcja 2: pola bez pola Z.17."""
    klasa = _klasa(wykonanie)
    return json.dumps(
        zbuduj_gpz_pola_liniowe(
            {1: (wykonanie, "TROJPOLOZENIOWY", klasa), 2: (wykonanie, "TROJPOLOZENIOWY", klasa)},
            sekcje_pomiaru_napiecia=(1,),
        )
    )


def _scena(wykonanie: str) -> dict[str, Any]:
    return json.loads(_scena_json(wykonanie))


@functools.cache
def _scena_z17_bez_powiazania_json(wykonanie: str) -> str:
    """Scena bazowa + pole Z.17 w sekcji 2 BEZ powiązania pól liniowych tej sekcji."""
    enm = _scena(wykonanie)
    enm, _vt = dodaj_pole_pomiaru_napiecia_z17(enm, _sekcje(enm)[1])
    return json.dumps(enm)


def _komorka(wykonanie: str, z17: str, potwierdzone: bool) -> tuple[dict[str, Any], str]:
    """Model i pole liniowe (zajęte kablem odejścia) komórki iloczynu."""
    if z17 == "obecne" and potwierdzone:
        enm = _scena(wykonanie)
        return enm, _pola_liniowe(enm, _sekcje(enm)[0])[0]["ref_id"]
    if z17 == "obecne":
        enm = json.loads(_scena_z17_bez_powiazania_json(wykonanie))
        return enm, _pola_liniowe(enm, _sekcje(enm)[1])[0]["ref_id"]
    enm = _scena(wykonanie)
    return enm, _pola_liniowe(enm, _sekcje(enm)[1])[0]["ref_id"]


def _vt_z17(enm: dict[str, Any], sekcja: str) -> str:
    szyna = _pola_liniowe(enm, sekcja)[0]["bus_ref"]
    pole = next(
        b
        for b in enm["bays"]
        if b.get("funkcja_pomiaru") == "NAPIECIA_SZYN" and b.get("bus_ref") == szyna
    )
    return next(a["device_ref"] for a in pole["primary_devices"] if a["kind"] == "VT")


def _w064(enm: dict[str, Any]) -> dict[str, list[str]]:
    wynik = ENMValidator().validate(EnergyNetworkModel.model_validate(enm))
    zgloszenia: dict[str, list[str]] = {}
    for issue in wynik.issues:
        if issue.code == KOD_WALIDATORA_ZRODLA_U0:
            assert issue.suggested_fix and issue.fix_action is not None
            for ref in issue.element_refs:
                zgloszenia.setdefault(ref, []).append(issue.message_pl)
    return zgloszenia


def _odczyt_pola(enm: dict[str, Any], ref: str) -> dict[str, Any]:
    odczyt = build_field_read_model("case-u0", EnergyNetworkModel.model_validate(enm))
    return next(i for i in odczyt["fields"] if i["bay_ref"] == ref)


# --- iloczyn {wykonanie} × {Z.17} × {powiązanie} × konsumenci reguły -------------------------


@pytest.mark.parametrize("z17,potwierdzone", KOMORKI)
@pytest.mark.parametrize("wykonanie", WYKONANIA)
def test_iloczyn_zestaw_powiazania_ocena_walidator_odczyt(
    wykonanie: str, z17: str, potwierdzone: bool
) -> None:
    enm, ref = _komorka(wykonanie, z17, potwierdzone)
    pole = _pole(enm, ref)
    zrodlo = zrodlo_u0_pola(enm, pole)
    assert zrodlo.potwierdzone is potwierdzone
    assert zrodlo.ferranti

    # 1. Zestaw funkcji pola: 67N wyłącznie przy potwierdzonym źródle (resolver szablonu).
    assert ("67N" in pole["protection_codes"]) is potwierdzone
    assert pole["protection_codes"] == funkcje_eaz_szablonu(
        pole["bay_template_ref"],
        pole.get("klasa_pola"),
        WSZYSTKIE_WARUNKI if potwierdzone else frozenset(),
    )

    # 2. Powiązania aparatów: przekładnik Ferrantiego zasila 67N, wyłącznik ją wykonuje —
    #    wyłącznie gdy pole funkcję ma (zero fikcyjnych połączeń na schemacie).
    ferranti = next(a for a in pole["primary_devices"] if a["kind"] == "CORE_BALANCE_CT")
    wylacznik = next(a for a in pole["primary_devices"] if a["kind"] == "CB")
    assert ("67N" in (ferranti.get("funkcje_eaz_zasilane") or [])) is potwierdzone
    assert ("67N" in (wylacznik.get("funkcje_eaz_wylaczajace") or [])) is potwierdzone
    # 2a. Kryterium prądowe 51N bloku „Zab. ziemnozwarciowe t1, t2" (ENEA Z.10 s.89, Z.11.1
    #     s.91 — linia Io z zacisku 2 przekładnika Ferrantiego) jest w KAŻDEJ komórce, bez
    #     warunku źródła 3U₀: przekładnik Ferrantiego je zasila, wyłącznik je wykonuje (uwaga
    #     właściciela 2026-10-29 pkt 4 — T2 powiązany z przekaźnikiem także bez 67N).
    assert "51N" in pole["protection_codes"]
    assert "51N" in (ferranti.get("funkcje_eaz_zasilane") or [])
    assert "51N" in (wylacznik.get("funkcje_eaz_wylaczajace") or [])

    # 3. Ocena pola liniowego: potwierdzone — ocena jak każdej funkcji; brak — NIE_OCENIONO
    #    z brakami źródła i dowodem z rysunków standardu (nigdy „spełnia").
    ocena = ocena_pola_liniowego(enm, pole)
    assert ocena is not None
    f67n = next(f for f in ocena.oceny_funkcji if f.kod == "67N")
    if potwierdzone:
        assert f67n.status == "SPELNIA" and f67n.obecna
        assert not f67n.wyjasnienie.czego_brakuje
    else:
        assert f67n.status == "NIE_OCENIONO" and not f67n.obecna
        assert f67n.wyjasnienie.czego_brakuje == zrodlo.czego_brakuje
        assert "Z.17" in f67n.dowod
    assert f67n.status != "NIE_SPELNIA"
    # Obwód funkcji 51N (karta pola, raport): wejście wyłącznie z przekładnika Ferrantiego T2,
    # wyjście na wyłącznik Q0 — w każdej komórce, niezależnie od źródła 3U₀.
    o51n = next(o for o in ocena.obwody_funkcji if o.kod == "51N")
    assert o51n.obecna and o51n.blok_rysunku is not None
    assert len(o51n.wejscia_pl) == 1
    assert o51n.wejscia_pl[0].startswith("przekładnik Ferrantiego T2")
    assert o51n.wyjscia_pl.endswith("→ wyłącznik Q0")

    # 4. Walidator: 67N przypisana operacją zawsze ma źródło — W064 milczy w każdej komórce.
    assert ref not in _w064(enm)

    # 5. Model odczytu pola: kontrolka powiązania i ścieżka zwarcia doziemnego.
    # Odczyt w postaci JSON (jak odpowiedź API) — krotki rekordu reguły jako listy.
    item = json.loads(json.dumps(_odczyt_pola(enm, ref)))
    assert item["zrodlo_u0"]["potwierdzone"] is potwierdzone
    assert item["zrodlo_u0"]["kody_brakow"] == list(zrodlo.kody_brakow)
    if potwierdzone:
        assert item["zrodlo_u0"]["kody_brakow"] == []
        assert item["zrodlo_u0"]["vt_ref"] == pole["zrodlo_u0_ref"]
    if z17 == "obecne" and not potwierdzone:
        assert item["zrodlo_u0"]["kody_brakow"] == ["BRAK_POWIAZANIA"]
        assert [k["vt_ref"] for k in item["zrodlo_u0"]["kandydaci"]] == [
            _vt_z17(enm, _pole(enm, ref)["gpz_section_id"])
        ]
    if z17 == "brak":
        assert item["zrodlo_u0"]["kody_brakow"] == ["BRAK_POLA_POMIARU_NAPIECIA"]
        assert item["zrodlo_u0"]["kandydaci"] == []
    # Ścieżka zwarcia doziemnego pola (wyniki projektu pola; scena bez biegu — wywołanie wprost
    # z tym samym rozstrzygnięciem źródła co odczyt): potwierdzone źródło daje tor I0 i U0.
    sciezka = _build_earth_fault_path(
        bay=Bay.model_validate(pole),
        measurement_chain=None,
        sources_by_bus={},
        transformers_by_bus={},
        zrodlo_u0_potwierdzone=bool(item["zrodlo_u0"]["potwierdzone"]),
    )
    if potwierdzone:
        assert sciezka is not None
        assert sciezka.zero_sequence_current_source == "przekladnik_ferrantiego"
        assert sciezka.zero_sequence_voltage_source == "otwarty_trojkat_vt"
    else:
        assert sciezka is None


@pytest.mark.parametrize("wykonanie", WYKONANIA)
def test_powiazanie_i_zdjecie_powiazania_przelicza_zestaw(wykonanie: str) -> None:
    """Predykat parami: powiązanie źródła dodaje 67N, zdjęcie (`null`) ją zdejmuje — ten sam
    resolver, ta sama reguła warunku, w obie strony."""
    enm, ref = _komorka(wykonanie, "obecne", False)
    vt = _vt_z17(enm, _pole(enm, ref)["gpz_section_id"])
    z = _ok(_op(enm, "set_bay_equipment", {"bay_ref": ref, "mode": "szablon", "zrodlo_u0_ref": vt}))
    assert "67N" in _pole(z, ref)["protection_codes"]
    assert _pole(z, ref)["zrodlo_u0_ref"] == vt
    bez = _ok(
        _op(z, "set_bay_equipment", {"bay_ref": ref, "mode": "szablon", "zrodlo_u0_ref": None})
    )
    assert "67N" not in _pole(bez, ref)["protection_codes"]
    assert _pole(bez, ref)["zrodlo_u0_ref"] is None
    assert _pole(bez, ref)["protection_codes"] == _pole(enm, ref)["protection_codes"]


# --- odmowy operacji: każdy kod braku źródła --------------------------------------------------


# --- teksty dla projektanta bez identyfikatorów -------------------------------------------
# Pomiar 2026-10-29 (`scripts/nazwa_bez_identyfikatora_guard.py`): opis kandydata źródła 3U₀
# brał `device_ref` przekładnika, gdy aparat nie miał oznaczenia. Iloczyn: wykonanie pola
# {Z10, Z11_1} × oznaczenie przekładnika Z.17 {jest, brak} × tekst {opis kandydata (pole sekcji
# bez powiązania), przyczyna potwierdzonego źródła}.


@pytest.mark.parametrize("oznaczony", [True, False])
@pytest.mark.parametrize("wykonanie", WYKONANIA)
def test_teksty_zrodla_u0_bez_identyfikatora_aparatu(wykonanie: str, oznaczony: bool) -> None:
    for z17, potwierdzone in (("obecne", True), ("obecne", False)):
        enm, ref = _komorka(wykonanie, z17, potwierdzone)
        sekcja = _pole(enm, ref)["gpz_section_id"]
        vt_ref = _vt_z17(enm, sekcja)
        for aparat in _z17_sekcji(enm, sekcja)["primary_devices"]:
            if aparat["device_ref"] == vt_ref:
                aparat["designation"] = "T1" if oznaczony else None
        zrodlo = zrodlo_u0_pola(enm, _pole(enm, ref))
        assert zrodlo.potwierdzone is potwierdzone
        oczekiwane = "przekładnik T1" if oznaczony else "przekładnik napięciowy"
        if potwierdzone:
            teksty = [zrodlo.przyczyna_pl]
        else:
            assert [k.vt_ref for k in zrodlo.kandydaci] == [vt_ref]
            teksty = [k.opis_pl for k in zrodlo.kandydaci]
        for tekst in teksty:
            assert oczekiwane in tekst, tekst
            assert vt_ref not in tekst, tekst


def _ref_aparatu(enm: dict[str, Any], ref_pola: str, rodzaj: str) -> str:
    return next(
        a["device_ref"] for a in _pole(enm, ref_pola)["primary_devices"] if a["kind"] == rodzaj
    )


def _z17_sekcji(enm: dict[str, Any], sekcja: str) -> dict[str, Any]:
    szyna = _pola_liniowe(enm, sekcja)[0]["bus_ref"]
    return next(
        b
        for b in enm["bays"]
        if b.get("funkcja_pomiaru") == "NAPIECIA_SZYN" and b.get("bus_ref") == szyna
    )


def _cel_odmowy(enm: dict[str, Any], ref: str, kod: str) -> tuple[dict[str, Any], Any]:
    """Model (po ewentualnej iniekcji) i wskazanie źródła dające brak ``kod``."""
    wlasna = _pole(enm, ref)["gpz_section_id"]
    obca = next(s for s in _sekcje(enm) if s != wlasna)
    if kod == "APARAT_NIEOBECNY":
        return enm, "nie-ma-takiego-aparatu"
    if kod == "APARAT_NIE_JEST_VT":
        return enm, _ref_aparatu(enm, ref, "CT")
    if kod == "INNA_SEKCJA":
        return enm, _vt_z17(enm, obca)
    if kod == "BRAK_OTWARTEGO_TROJKATA":
        # Przekładnik drugiego pola liniowego Z.11.1 — trzy uzwojenia w gwieździe (s.91).
        return enm, _ref_aparatu(enm, _pola_liniowe(enm, wlasna)[1]["ref_id"], "VT")
    if kod == "POLE_NIE_MIERZY_SZYN":
        # Iniekcja modelu (import): pole Z.17 przeklasyfikowane na pomiar energii — przekładnik
        # z otwartym trójkątem nie jest już przekładnikiem pola pomiaru napięcia szyn.
        po = copy.deepcopy(enm)
        z17 = _z17_sekcji(po, wlasna)
        vt = next(a["device_ref"] for a in z17["primary_devices"] if a["kind"] == "VT")
        z17["funkcja_pomiaru"] = "UKLAD_ENERGII"
        return po, vt
    return enm, 17  # wskazanie, które nie jest napisem


ODMOWY = [
    (wykonanie, kod)
    for wykonanie in WYKONANIA
    for kod in (
        "APARAT_NIEOBECNY",
        "APARAT_NIE_JEST_VT",
        "INNA_SEKCJA",
        "BRAK_OTWARTEGO_TROJKATA",
        "POLE_NIE_MIERZY_SZYN",
        "NIE_NAPIS",
    )
    # Z.10 nie ma przekładnika napięciowego w polu liniowym (rysunek s.89).
    if not (wykonanie == "Z10" and kod == "BRAK_OTWARTEGO_TROJKATA")
]


@pytest.mark.parametrize("wykonanie,kod", ODMOWY)
def test_odmowa_powiazania_ze_zrodlem_niepoprawnym(wykonanie: str, kod: str) -> None:
    """Pole sekcji 1 (z polem Z.17) — każde wskazanie, które nie jest źródłem 3U₀ tego pola,
    jest odmową z kodem `bay_equipment.zrodlo_u0_niepoprawne`; model bez zmian; reguła
    rozstrzyga ten sam brak co odmowa. Scena z polem Z.17 także w sekcji 2 (przekładnik
    z otwartym trójkątem w INNEJ sekcji)."""
    baza = json.loads(_scena_z17_bez_powiazania_json(wykonanie))
    ref = _pola_liniowe(baza, _sekcje(baza)[0])[0]["ref_id"]
    enm, wskazanie = _cel_odmowy(baza, ref, kod)
    przed = copy.deepcopy(enm)
    odpowiedz = _op(
        enm, "set_bay_equipment", {"bay_ref": ref, "mode": "szablon", "zrodlo_u0_ref": wskazanie}
    )
    assert odpowiedz.get("error_code") == KOD_ZRODLA_U0_NIEPOPRAWNEGO, odpowiedz.get("error")
    assert odpowiedz.get("snapshot") in (None, przed)
    assert enm == przed
    if isinstance(wskazanie, str):
        pole = copy.deepcopy(_pole(enm, ref))
        pole["zrodlo_u0_ref"] = wskazanie
        assert zrodlo_u0_pola(enm, pole).kody_brakow == (kod,)


def test_odmowa_wlasnego_przekladnika_w_gwiezdzie_z11_1() -> None:
    """Z.11.1: własny przekładnik pola ma trzy uzwojenia w gwieździe 0,1/√3 (decyzja właściciela
    2026-10-29 pkt 1 — bez otwartego trójkąta, jak rysunek s.91), więc nie jest źródłem 3U₀."""
    enm = _scena("Z11_1")
    ref = _pola_liniowe(enm, _sekcje(enm)[0])[0]["ref_id"]
    vt = _ref_aparatu(enm, ref, "VT")
    uzwojenia = next(a for a in _pole(enm, ref)["primary_devices"] if a["kind"] == "VT")[
        "uzwojenia"
    ]
    assert uzwojenia and not any(u.get("otwarty_trojkat") for u in uzwojenia)
    odpowiedz = _op(
        enm, "set_bay_equipment", {"bay_ref": ref, "mode": "szablon", "zrodlo_u0_ref": vt}
    )
    assert odpowiedz.get("error_code") == KOD_ZRODLA_U0_NIEPOPRAWNEGO
    pole = copy.deepcopy(_pole(enm, ref))
    pole["zrodlo_u0_ref"] = vt
    assert zrodlo_u0_pola(enm, pole).kody_brakow == ("BRAK_OTWARTEGO_TROJKATA",)


# --- powiązanie nieaktualne i deklaracja ręczna: W064 + NIE_OCENIONO ---------------------------


@pytest.mark.parametrize("wykonanie", WYKONANIA)
def test_zdjete_wyposazenie_pola_z17_zostawia_ostrzezenie_w064(wykonanie: str) -> None:
    """Pole Z.17 bez wyposażenia (przekładnik usunięty) — pola liniowe sekcji zachowują
    deklarację 67N projektanta, ale walidator zgłasza W064 z akcją naprawczą, a ocena funkcji
    jest `NIE_OCENIONO` („funkcja zadeklarowana w polu bez wejścia napięcia zerowego")."""
    enm = _scena(wykonanie)
    sekcja = _sekcje(enm)[0]
    szyna = _pola_liniowe(enm, sekcja)[0]["bus_ref"]
    z17 = next(
        b["ref_id"]
        for b in enm["bays"]
        if b.get("funkcja_pomiaru") == "NAPIECIA_SZYN" and b.get("bus_ref") == szyna
    )
    po = _ok(_op(enm, "set_bay_equipment", {"bay_ref": z17, "mode": "wyczysc"}))
    zgloszenia = _w064(po)
    for pole in _pola_liniowe(po, sekcja):
        assert "67N" in pole["protection_codes"]
        assert pole["ref_id"] in zgloszenia
        assert zrodlo_u0_pola(po, pole).kody_brakow == ("APARAT_NIEOBECNY",)
        ocena = ocena_pola_liniowego(po, pole)
        assert ocena is not None
        f67n = next(f for f in ocena.oceny_funkcji if f.kod == "67N")
        assert f67n.status == "NIE_OCENIONO" and f67n.obecna
        assert "bez wejścia napięcia zerowego" in f67n.wyjasnienie.przyczyna_pl
    for pole in _pola_liniowe(po, _sekcje(po)[1]):
        assert pole["ref_id"] not in zgloszenia


@pytest.mark.parametrize("wykonanie", WYKONANIA)
def test_deklaracja_reczna_67n_bez_zrodla_zglasza_w064(wykonanie: str) -> None:
    """Kody funkcji zmienione operacją ogólną (deklaracja projektanta, nie przypisanie
    automatyczne) — 67N bez źródła nie jest „spełnia": W064 i NIE_OCENIONO."""
    enm, ref = _komorka(wykonanie, "brak", False)
    kody = [*_pole(enm, ref)["protection_codes"], "67N"]
    po = _ok(
        _op(
            enm,
            "update_element_parameters",
            {"element_ref": ref, "parameters": {"protection_codes": kody}},
        )
    )
    assert "67N" in _pole(po, ref)["protection_codes"]
    assert ref in _w064(po)
    ocena = ocena_pola_liniowego(po, _pole(po, ref))
    assert ocena is not None
    assert next(f for f in ocena.oceny_funkcji if f.kod == "67N").status == "NIE_OCENIONO"


# --- klasa miejsc przypisujących funkcje EAZ ---------------------------------------------------


def test_zaden_szablon_rejestru_nie_przypisuje_67n_bez_warunku() -> None:
    """Każdy szablon kanonu × każda klasa pola: bez warunków — bez 67N; z warunkami — 67N
    dokładnie wtedy, gdy szablon (rysunek) ją niesie. Iniekcja „automatyczne 67N" (zdjęcie
    `WARUNKI_FUNKCJI_EAZ` albo filtra w `funkcje_eaz_szablonu`) zapala test."""
    sprawdzone = 0
    for template_id, szablon in sorted(BAY_TEMPLATE_REGISTRY.items()):
        klasy: tuple[str | None, ...] = (
            (None, *KLASY_POLA_LINIOWEGO) if szablon.wykonanie_pola is not None else (None,)
        )
        for klasa in klasy:
            bez = funkcje_eaz_szablonu(template_id, klasa)
            z_warunkami = funkcje_eaz_szablonu(template_id, klasa, WSZYSTKIE_WARUNKI)
            assert bez is not None and z_warunkami is not None
            assert "67N" not in bez, (template_id, klasa)
            assert [k for k in z_warunkami if k not in WARUNKI_FUNKCJI_EAZ] == bez
            sprawdzone += 1
    assert sprawdzone > len(BAY_TEMPLATE_REGISTRY)
    assert any("67N" in s.funkcje_eaz for s in BAY_TEMPLATE_REGISTRY.values())


def test_szablony_producenckie_i_role_nie_przypisuja_67n_bez_warunku() -> None:
    from enm.domain_operations_v2 import _resolve_bay_template_protection_codes
    from enm.rola_pola_sn import ROLE_POLA_MODELU

    szablony = sorted(
        {t.template_ref for t in list_switchgear_solution_templates_for_manufacturer(None)}
        | {t.template_ref for t in list_canonical_fallback_templates()}
    )
    assert szablony
    for template_ref, rola in itertools.product([None, *szablony], ROLE_POLA_MODELU):
        kody = _resolve_bay_template_protection_codes(None, template_ref, rola)
        assert "67N" not in kody, (template_ref, rola)
    for rola in ROLE_POLA_MODELU:
        assert "67N" not in funkcje_eaz_roli(rola)


def test_wymagania_producenta_z_67n_filtrowane_warunkiem(monkeypatch: pytest.MonkeyPatch) -> None:
    """Paczka producenta z `protection_requirements` zawierającymi 67N (dane producenckie mają
    pierwszeństwo w resolverze) — funkcja warunkowa i tak przechodzi przez warunek."""
    from enm.domain_operations_v2 import _resolve_bay_template_protection_codes
    from network_model.catalog.switchgear import canonical_fallback

    wzor = list_canonical_fallback_templates()[0]
    producenta = wzor.model_copy(
        update={"template_ref": "PRODUCENT__TEST", "protection_requirements": ["51", "50", "67N"]}
    )
    monkeypatch.setattr(
        canonical_fallback,
        "list_switchgear_solution_templates_for_manufacturer",
        lambda _ref: [producenta],
    )
    assert _resolve_bay_template_protection_codes("producent", "PRODUCENT__TEST", "OUT") == [
        "51",
        "50",
    ]
    assert _resolve_bay_template_protection_codes(
        "producent", "PRODUCENT__TEST", "OUT", None, WSZYSTKIE_WARUNKI
    ) == ["51", "50", "67N"]


# --- determinizm ---------------------------------------------------------------------------


@pytest.mark.parametrize("wykonanie", WYKONANIA)
def test_determinizm_powiazania_i_odcisku(wykonanie: str) -> None:
    enm, ref = _komorka(wykonanie, "obecne", False)
    vt = _vt_z17(enm, _pole(enm, ref)["gpz_section_id"])
    zadanie = {"bay_ref": ref, "mode": "szablon", "zrodlo_u0_ref": vt}
    a = _op(enm, "set_bay_equipment", zadanie)
    b = _op(enm, "set_bay_equipment", zadanie)
    assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)
    assert hash_migawki_enm(a["snapshot"]) == hash_migawki_enm(b["snapshot"])
    # Powiązanie jest treścią modelu (zmienia odcisk); brak powiązania — poza odciskiem.
    assert hash_migawki_enm(a["snapshot"]) != hash_migawki_enm(enm)
    bez_pola = copy.deepcopy(enm)
    for pole in bez_pola["bays"]:
        if pole.get("zrodlo_u0_ref") is None:
            pole.pop("zrodlo_u0_ref", None)
    assert hash_migawki_enm(bez_pola) == hash_migawki_enm(enm)
