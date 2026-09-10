"""Atrapy harnessu scen liczone z backendu (E2E-FULL-FIX-3, 2026-09-10).

JSON w `frontend/src/harness-fixtures/generated/` MUSI być równy świeżo
policzonej odpowiedzi (`scripts/eksport_fixtur_harnessu.py`) — rozjazd znaczy,
że kontrakt albo dane sceny się zmieniły, a zrzut do oceny pokazywałby stan
sprzed zmiany. Dwa uruchomienia dają identyczny wynik (determinizm atrapy).
"""

from __future__ import annotations

import importlib.util
import json
import re
from pathlib import Path

import pytest

_SKRYPT = Path(__file__).resolve().parents[2] / "scripts" / "eksport_fixtur_harnessu.py"
_spec = importlib.util.spec_from_file_location("eksport_fixtur_harnessu", _SKRYPT)
assert _spec is not None and _spec.loader is not None
eksport = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(eksport)


@pytest.mark.parametrize("nazwa", sorted(eksport.FIXTURY))
def test_json_w_repo_rowny_odpowiedzi_backendu(nazwa: str) -> None:
    sciezka = eksport.FIXTURES_DIR / f"{nazwa}.json"
    assert sciezka.exists(), f"brak {sciezka} — uruchom scripts/eksport_fixtur_harnessu.py"
    assert json.loads(sciezka.read_text(encoding="utf-8")) == eksport.FIXTURY[nazwa]()


@pytest.mark.parametrize("nazwa", sorted(eksport.FIXTURY))
def test_atrapa_jest_deterministyczna(nazwa: str) -> None:
    assert eksport.FIXTURY[nazwa]() == eksport.FIXTURY[nazwa]()


def test_zgodnosc_przekrojowa_ma_ksztalt_trasy() -> None:
    """Ten sam kształt co `run_ncrfg_compliance_from_model` (api/ncrfg_ptpiree_tests.py)."""
    odpowiedz = eksport.zgodnosc_przekrojowa_sceny_macierz()
    assert set(odpowiedz) == {"case_id", "operator_id", "der_count", "reports"}
    assert odpowiedz["der_count"] == len(odpowiedz["reports"]) == len(eksport.MODULY_SCENY_MACIERZ)
    for raport, modul in zip(odpowiedz["reports"], eksport.MODULY_SCENY_MACIERZ, strict=True):
        assert raport["der_ref"] == modul.der_ref
        assert raport["p_max_kw"] == modul.p_max_kw
        assert raport["voltage_kv"] == modul.voltage_kv
        # Klasa modułu: progi OD-5 (1 MW / 50 MW) — scena zasiewa moduły klasy B.
        assert raport["module_type"] == "B"
        assert {"overall_pass", "total_tests", "passed_count", "no_module_count"} <= set(raport)


def test_werdykt_bez_biegow_jest_niesprawdzony() -> None:
    """Scena `uwaga` zasiewa rozpływ tylko w kliencie — backend biegu nie zna."""
    werdykt = eksport.werdykt_projektowy_sceny_uwaga()
    assert werdykt["case_id"] == eksport.CASE_ID_HARNESSU
    assert werdykt["werdykt"] == "NIESPRAWDZONE"
    assert werdykt["podsumowanie"]["naruszone"] == 0
    assert all(
        pozycja["stan"] in {"NIESPRAWDZONE", "NIE_DOTYCZY"} for pozycja in werdykt["pozycje"]
    )


# ---------------------------------------------------------------------------
# Karta B02-BE-TESTY §6 — katalog analiz V12.6, gotowość, werdykt (ocena/przekroczenia)
# ---------------------------------------------------------------------------

_WZORZEC_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def _wartosci_run_id(dane: dict) -> list[str]:
    """Wszystkie wartości pól nazwanych `run_id` w drzewie JSON (w tym zagnieżdżone
    `dowod.run_id`) — czyta TEKST JSON, żeby złapać KAŻDE wystąpienie, tak samo
    jak stabilizacja w skrypcie eksportu."""
    return re.findall(r'"run_id":\s*"([^"]+)"', json.dumps(dane, ensure_ascii=False))


def test_katalog_analiz_v126_ma_14_pozycji_i_4_wycofane() -> None:
    katalog = eksport.katalog_analiz_v126()
    assert katalog["namespace"] == "analysis-catalog"
    assert len(katalog["items"]) == 14
    wycofane = [item for item in katalog["items"] if not item["prezentowany"]]
    assert len(wycofane) == 4


def test_gotowosc_v126_scena_akademickie_ma_14_analiz_i_rozklad_stanow() -> None:
    gotowosc = eksport.gotowosc_v126_scena_akademickie()
    assert gotowosc["case_id"] == eksport.CASE_ID_HARNESSU
    assert gotowosc["model_hash"], "złota sieć ma szyny -> model_hash nie może być pusty"
    analizy = gotowosc["analizy"]
    assert len(analizy) == 14
    stany = [a["gotowosc"] for a in analizy]
    assert stany.count("POTWIERDZONA") >= 1
    assert stany.count("NIEPOTWIERDZONA") >= 1
    assert stany.count("WYCOFANA") == 2


#: Stan gotowości KAŻDEGO rodzaju z parametrami sceny — zmierzony REALNYM
#: wywołaniem na złotej sieci, nie założony. Harmoniczne i SSCI zostają
#: NIEPOTWIERDZONE, bo `gen_pv` złotej sieci nie ma karty przekształtnika (mocy
#: znamionowej) — żaden parametr formularza tego nie zastąpi; fixtura pokazuje
#: tę przyczynę po nazwie zamiast udawać komplet danych.
_OCZEKIWANE_STANY_Z_PARAMETRAMI: dict[str, tuple[str, str | None]] = {
    "power_quality_harmonics": ("NIEPOTWIERDZONA", "generator.converter_card_missing"),
    "ssci_impedance": ("NIEPOTWIERDZONA", "generator.converter_card_missing"),
    "earthing_safety": ("POTWIERDZONA", None),
    "earth_fault_detection": ("POTWIERDZONA", None),
    "neutral_earthing_design": ("POTWIERDZONA", None),
    "transient_trv": ("POTWIERDZONA", None),
    "motor_starting": ("POTWIERDZONA", None),
    "reliability_contingency": ("POTWIERDZONA", None),
}


def _klucz_najwyzszy(klucz: str) -> str:
    """`earthing.rho1_ohm_m` -> `earthing`, `motors[].ref` -> `motors`."""
    return klucz.split(".")[0].split("[")[0]


def test_parametry_sceny_pokrywaja_kazdy_prezentowany_rodzaj_z_polami_od_uzytkownika() -> None:
    """KLASA, nie instancja: zbiór rodzajów z parametrami sceny = zbiór rodzajów
    prezentowanych, których karta katalogu ma sekcję „od użytkownika". Nowa
    karta z parametrem bez wpisu sceny (albo wpis dla karty bez parametrów) jest
    czerwony tutaj, nie cichym brakiem zrzutu."""
    katalog = eksport.katalog_analiz_v126()["items"]
    z_parametrami = {
        item["kod"] for item in katalog if item["prezentowany"] and item["dane"]["od_uzytkownika"]
    }
    assert set(eksport.PARAMETRY_SCENY_AKADEMICKIE) == z_parametrami
    assert set(_OCZEKIWANE_STANY_Z_PARAMETRAMI) == z_parametrami


def test_parametry_sceny_maja_klucze_z_karty_katalogu() -> None:
    """Każdy klucz parametru sceny jest kluczem sekcji „od użytkownika" karty
    (po najwyższym członie: `earthing`, `motors`) — parametr spoza karty byłby
    kontrolką-fantomem, której formularz nie ma jak wypełnić."""
    katalog = {item["kod"]: item for item in eksport.katalog_analiz_v126()["items"]}
    for kod, parametry in eksport.PARAMETRY_SCENY_AKADEMICKIE.items():
        klucze_karty = {
            _klucz_najwyzszy(pole["klucz"]) for pole in katalog[kod]["dane"]["od_uzytkownika"]
        }
        assert set(parametry) <= klucze_karty, (kod, set(parametry) - klucze_karty)


def test_gotowosc_z_parametrami_ma_ksztalt_koncowki_i_oczekiwane_stany() -> None:
    fixtura = eksport.gotowosc_v126_scena_akademickie_parametry()
    assert set(fixtura) == {"case_id", "model_hash", "przedmiot", "parametry", "analizy"}
    assert fixtura["case_id"] == eksport.CASE_ID_HARNESSU
    assert fixtura["model_hash"] == eksport.gotowosc_v126_scena_akademickie()["model_hash"]
    assert fixtura["parametry"] == eksport.PARAMETRY_SCENY_AKADEMICKIE
    assert [a["kod"] for a in fixtura["analizy"]] == list(eksport.PARAMETRY_SCENY_AKADEMICKIE)
    for analiza in fixtura["analizy"]:
        stan, kod_braku = _OCZEKIWANE_STANY_Z_PARAMETRAMI[analiza["kod"]]
        assert analiza["gotowosc"] == stan, (analiza["kod"], analiza["braki"])
        if kod_braku is None:
            assert analiza["braki"] == []
            assert all(w["spelniony"] for w in analiza["warunki"] if w["blokujacy"])
        else:
            assert [b["kod"] for b in analiza["braki"]] == [kod_braku]
            assert analiza["braki"][0]["klucz_parametru"] is None


def test_gotowosc_z_parametrami_rozni_sie_od_gotowosci_bez_parametrow() -> None:
    """Dowód, że parametry sceny COŚ zmieniają: każdy rodzaj POTWIERDZONY z
    parametrami jest NIEPOTWIERDZONY bez nich (fixtura bazowa) — inaczej scena
    „wypełnienie formularza" nie pokazywałaby żadnej zmiany stanu."""
    bez = {a["kod"]: a["gotowosc"] for a in eksport.gotowosc_v126_scena_akademickie()["analizy"]}
    z_parametrami = {
        a["kod"]: a["gotowosc"]
        for a in eksport.gotowosc_v126_scena_akademickie_parametry()["analizy"]
    }
    for kod, (stan, _) in _OCZEKIWANE_STANY_Z_PARAMETRAMI.items():
        if stan == "POTWIERDZONA":
            assert bez[kod] == "NIEPOTWIERDZONA", kod
            assert z_parametrami[kod] == "POTWIERDZONA", kod


def test_werdykt_projektowy_scena_ocena_ma_oceny_bez_naruszen() -> None:
    werdykt = eksport.werdykt_projektowy_scena_ocena()
    assert werdykt["ocena"]["spelnia"] > 0
    assert werdykt["ocena"]["nie_spelnia"] == 0
    assert werdykt["ocena"]["brak_podstaw"] > 0
    assert all(zrodlo["dostepny"] and zrodlo["aktualny"] for zrodlo in werdykt["zrodla"])
    run_idy = _wartosci_run_id(werdykt)
    assert run_idy, "scena musi mieć co najmniej jeden run_id (dowód biegu)"
    assert not any(_WZORZEC_UUID.match(wartosc) for wartosc in run_idy), run_idy


def test_werdykt_projektowy_scena_ocena_przekroczenia_ma_naruszenia() -> None:
    werdykt = eksport.werdykt_projektowy_scena_ocena_przekroczenia()
    assert werdykt["ocena"]["nie_spelnia"] > 0
    assert any(pozycja["stan"] == "NARUSZONE" for pozycja in werdykt["pozycje"])
    run_idy = _wartosci_run_id(werdykt)
    assert run_idy, "scena musi mieć co najmniej jeden run_id (dowód biegu)"
    assert not any(_WZORZEC_UUID.match(wartosc) for wartosc in run_idy), run_idy
