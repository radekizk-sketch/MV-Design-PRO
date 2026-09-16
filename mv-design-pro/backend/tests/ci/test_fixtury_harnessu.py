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


#: Tolerancja liczb fixtur (ta sama klasa co parytet assemblera na CI, karta
#: CI-PARYTET-2): szkielet (klucze, typy, długości list, teksty, liczby całkowite)
#: DOKŁADNIE, liczby zmiennoprzecinkowe z tolerancją. Dowód klasy: CI run
#: 34467401727 na b89c13b3 — dwie fixtury sceny werdyktu (wartości i marginesy z
#: realnego rozpływu/zwarcia sieci złotej) rozjechały się między maszynami na
#: 10.–11. cyfrze znaczącej (np. 8.913153836959333 vs 8.913153836847659), choć
#: lokalnie test był zielony. Szum solvera (~1e-10 względnie) przekracza ziarno
#: kwantyzacji ADR-018 (9 cyfr), więc samo zaokrąglenie nie zamyka klasy —
#: potrzebna tolerancja porównania, dla KAŻDEJ fixtury z liczbami solvera.
RTOL_FIXTUR = 1e-6
ATOL_FIXTUR = 1e-6


def roznice_z_tolerancja(zloty: object, teraz: object, sciezka: str = "$") -> list[str]:
    """Lista ścieżek, na których fixtura z repo różni się od odpowiedzi backendu."""
    if isinstance(zloty, bool) or isinstance(teraz, bool):
        # `bool` jest częścią kontraktu (True != 1): typ i wartość dokładnie.
        if type(zloty) is type(teraz) and zloty == teraz:
            return []
        return [f"{sciezka}: {zloty!r} != {teraz!r}"]
    if isinstance(zloty, int | float) and isinstance(teraz, int | float):
        if isinstance(zloty, int) and isinstance(teraz, int):
            return [] if zloty == teraz else [f"{sciezka}: {zloty!r} != {teraz!r}"]
        if abs(float(zloty) - float(teraz)) <= ATOL_FIXTUR + RTOL_FIXTUR * abs(float(zloty)):
            return []
        return [f"{sciezka}: {zloty!r} != {teraz!r} (poza tolerancją)"]
    if isinstance(zloty, dict) and isinstance(teraz, dict):
        if set(zloty) != set(teraz):
            return [f"{sciezka}: klucze {sorted(set(zloty) ^ set(teraz))}"]
        return [
            r
            for klucz in zloty
            for r in roznice_z_tolerancja(zloty[klucz], teraz[klucz], f"{sciezka}.{klucz}")
        ]
    if isinstance(zloty, list) and isinstance(teraz, list):
        if len(zloty) != len(teraz):
            return [f"{sciezka}: długość listy {len(zloty)} != {len(teraz)}"]
        return [
            r
            for i, (a, b) in enumerate(zip(zloty, teraz, strict=True))
            for r in roznice_z_tolerancja(a, b, f"{sciezka}[{i}]")
        ]
    return [] if zloty == teraz else [f"{sciezka}: {zloty!r} != {teraz!r}"]


def test_roznice_z_tolerancja_rozroznia_szum_od_regresji() -> None:
    """Pin komparatora: szum ostatnich cyfr przechodzi, zmiana kształtu/typu/tekstu
    i różnica ponad tolerancję — nie (deklaracja bez testu = fałszywa pewność)."""
    assert roznice_z_tolerancja({"a": [8.913153836959333]}, {"a": [8.913153836847659]}) == []
    assert roznice_z_tolerancja(1.0, 1.0 + 5e-6) != []
    assert roznice_z_tolerancja({"a": 1}, {"a": 1.0}) == []
    assert roznice_z_tolerancja(True, 1) != []
    assert roznice_z_tolerancja({"a": 1}, {"b": 1}) != []
    assert roznice_z_tolerancja([1, 2], [1]) != []
    assert roznice_z_tolerancja("x", "y") != []
    assert roznice_z_tolerancja(None, 0.0) != []


@pytest.mark.parametrize("nazwa", sorted(eksport.FIXTURY))
def test_json_w_repo_rowny_odpowiedzi_backendu(nazwa: str) -> None:
    sciezka = eksport.FIXTURES_DIR / f"{nazwa}.json"
    assert sciezka.exists(), f"brak {sciezka} — uruchom scripts/eksport_fixtur_harnessu.py"
    roznice = roznice_z_tolerancja(
        json.loads(sciezka.read_text(encoding="utf-8")), eksport.FIXTURY[nazwa]()
    )
    assert roznice == [], "\n".join(roznice)


@pytest.mark.parametrize("nazwa", sorted(eksport.FIXTURY))
def test_atrapa_jest_deterministyczna(nazwa: str) -> None:
    assert eksport.FIXTURY[nazwa]() == eksport.FIXTURY[nazwa]()


def test_zgodnosc_przekrojowa_ma_ksztalt_trasy() -> None:
    """Ten sam kształt co `run_ncrfg_compliance_from_model` (api/ncrfg_ptpiree_tests.py,
    karta S-3): kontrakt biegu macierzy (`NcRfgPtpireeRunResponse` z polami
    dowodowymi S-1) opakowany per przypadek — solver kanoniczny, numeracja T01–T20."""
    odpowiedz = eksport.zgodnosc_przekrojowa_sceny_macierz()
    assert set(odpowiedz) == {"case_id", "operator_id", "der_count", "pominiete", "bieg"}
    assert odpowiedz["case_id"] == eksport.CASE_ID_HARNESSU
    assert odpowiedz["operator_id"] == eksport.OPERATOR_SCENY_MACIERZ
    assert odpowiedz["pominiete"] == []
    bieg = odpowiedz["bieg"]
    assert bieg is not None
    assert bieg["contract"] == "NcRfgPtpireeTestResultV1"
    assert odpowiedz["der_count"] == len(bieg["modules"]) == len(eksport.DER_SCENY_MACIERZ)
    for modul, (der_ref, p_max_kw, voltage_kv, _gen_type, _karta) in zip(
        bieg["modules"], eksport.DER_SCENY_MACIERZ, strict=True
    ):
        assert modul["der_ref"] == der_ref
        assert modul["p_max_kw"] == p_max_kw
        assert modul["voltage_kv"] == voltage_kv
        # Klasa modułu: progi OD-5 (1 MW / 50 MW) — scena zasiewa moduły klasy B.
        assert modul["module_type"] == "B"
        assert {test["test_id"] for test in modul["tests"]} == {f"T{i:02d}" for i in range(1, 21)}
        assert {t["verdict"] for t in modul["tests"]} <= {"pass", "fail", "no_data", "not_required"}
    # Pola dowodowe S-1 obecne na kopercie biegu i per moduł (jeden kontrakt z `/run`).
    assert {"reporting_status", "proof_status", "evidence_limitations", "evidence_by_test"} <= set(
        bieg
    )
    assert set(bieg["evidence_per_module"]) == {der[0] for der in eksport.DER_SCENY_MACIERZ}
    # Certyfikat PTPiREE z REALNEGO katalogu: PV powiązany (numer dokumentu), BESS bez.
    dowody = {d["der_ref"]: d for d in bieg["certificate_evidence"]}
    assert dowody["pv-1"]["document_number"]
    assert dowody["bess-1"]["document_number"] is None
    statusy = {m["der_ref"]: m["certificate_status"] for m in bieg["modules"]}
    assert statusy == {"pv-1": "ptpiree_verified", "bess-1": "unknown"}


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


# ---------------------------------------------------------------------------
# Karta HARNESS-ZWARCIA-Z-BACKENDU (2026-09-16) — sceny „zwarcia"/„zwarcia-
# -rozplyw": wyniki/wkłady/rozpływ/pasmo z JEDNEGO realnego biegu backendu
# (sieć złota `build_golden_enm`, §0.3 karty: testy kształtu).
# ---------------------------------------------------------------------------


def _run_idy_nie_sa_uuid(widok: dict) -> None:
    """Pin wspólny trzem fixturom kotwicy: co najmniej jeden `run_id`
    (dowód biegu) i ŻADEN nie jest surowym UUID (stabilizacja zadziałała)."""
    run_idy = _wartosci_run_id(widok)
    assert run_idy, "scena musi mieć co najmniej jeden run_id (dowód biegu)"
    assert not any(_WZORZEC_UUID.match(wartosc) for wartosc in run_idy), run_idy


def test_zwarcia_wyniki_ma_co_najmniej_dwa_punkty_zwarcia() -> None:
    wyniki = eksport.zwarcia_wyniki_scena_zwarcia()
    assert wyniki["run_id"] == eksport.RUN_ID_SCENY_ZWARCIA
    assert len(wyniki["rows"]) >= 2
    assert len({row["target_id"] for row in wyniki["rows"]}) == len(
        wyniki["rows"]
    ), "target_id musi być unikalny per punkt zwarcia"
    _run_idy_nie_sa_uuid(wyniki)


def test_zwarcia_wklady_pokrywaja_wszystkie_punkty_wynikow() -> None:
    """KLASA, nie instancja: zbiór punktów mapy wkładów = zbiór punktów
    wyników TEGO SAMEGO biegu — nowy punkt zwarcia bez wpisu w mapie byłby
    czerwony tutaj, nie cichym „dane niedostępne" na ekranie."""
    wyniki = eksport.zwarcia_wyniki_scena_zwarcia()
    wklady = eksport.zwarcia_wklady_scena_zwarcia()
    assert set(wklady) == {row["target_id"] for row in wyniki["rows"]}
    for target_id, odpowiedz in wklady.items():
        assert odpowiedz["fault_node_id"] == target_id
        assert "contributions" in odpowiedz
        assert (
            len(odpowiedz["contributions"]) >= 1
        ), "sieć złota niesie generator synchroniczny widoczny z każdego punktu"


def test_zwarcia_rozplyw_niesie_tor_sieci_nadrzednej_i_tor_falownika() -> None:
    """Karta W3-G3/Z-3: rozpływ gałęziowy MUSI pokazywać OBA tory — sieci
    nadrzędnej (`THEVENIN_GRID`) i falownika (`gen_pv`) — inaczej fixtura nie
    zastępuje uczciwie dawnej ręcznej sceny Z-3 (`run-sc-th1-demo`)."""
    rozplyw = eksport.zwarcia_rozplyw_scena_zwarcia()
    assert rozplyw["target_id"] == eksport.zwarcia_wyniki_scena_zwarcia()["rows"][0]["target_id"]
    wpisy = rozplyw["branch_contributions"] or []
    zrodla = {wpis["source_id"] for wpis in wpisy}
    assert "THEVENIN_GRID" in zrodla, "brak toru sieci nadrzędnej w rozpływie"
    assert any(zrodlo != "THEVENIN_GRID" for zrodlo in zrodla), "brak toru falownika w rozpływie"
    assert "gen_pv" in zrodla, zrodla
    _run_idy_nie_sa_uuid(rozplyw)


def test_zwarcia_pasmo_strona_max_jest_biegiem_kotwicy() -> None:
    pasmo = eksport.zwarcia_pasmo_scena_zwarcia()
    assert pasmo["run_id_kotwicy"] == eksport.RUN_ID_SCENY_ZWARCIA
    assert pasmo["brakujacy_scenariusz"] is None
    assert pasmo["powod_niedostepnosci"] is None
    assert pasmo["max"] is not None and pasmo["min"] is not None
    assert pasmo["max"]["zrodlo"] == "biegu_zapisanego"
    assert pasmo["max"]["run_id"] == eksport.RUN_ID_SCENY_ZWARCIA
    assert pasmo["max"]["bieg_bazowy_id"] == eksport.RUN_ID_SCENY_ZWARCIA
    # Strona MIN — kontrakt karty W3-G3: `obliczony_na_zadanie` dzieli `id` z
    # kotwicą (bez własnego `run_id`), tak działa produkt (§0.1 karty).
    assert pasmo["min"]["zrodlo"] == "obliczony_na_zadanie"
    assert pasmo["min"]["run_id"] is None
    assert pasmo["min"]["bieg_bazowy_id"] == eksport.RUN_ID_SCENY_ZWARCIA
    _run_idy_nie_sa_uuid(pasmo)


def test_zwarcia_pasmo_strona_min_ma_ikss_mniejsze_niz_max_per_szyna() -> None:
    pasmo = eksport.zwarcia_pasmo_scena_zwarcia()
    wiersze_max = {w["target_id"]: w["ikss_ka"] for w in pasmo["max"]["wynik"]["rows"]}
    wiersze_min = {w["target_id"]: w["ikss_ka"] for w in pasmo["min"]["wynik"]["rows"]}
    assert wiersze_max, "pasmo musi nieść co najmniej jedną szynę"
    assert set(wiersze_max) == set(wiersze_min)
    for target_id, ikss_min in wiersze_min.items():
        assert ikss_min < wiersze_max[target_id], (target_id, ikss_min, wiersze_max[target_id])


# ---------------------------------------------------------------------------
# Karta HARNESS-RESZTA (2026-09-16) — sceny „wyniki-stan-fazowy"/
# „wyniki-stabilnosc" (E-31/E-32), realny bieg backendu (phase_state_sn /
# dynamic_stability na sieci złotej).
# ---------------------------------------------------------------------------


def test_stan_fazowy_ma_run_id_stabilny_i_pokazuje_alert_asymetrii() -> None:
    wynik = eksport.stan_fazowy_scena_wyniki()
    assert wynik["run_id"] == eksport.RUN_ID_SCENY_STAN_FAZOWY
    _run_idy_nie_sa_uuid(wynik)
    wiersz = wynik["rows"][0]
    assert wiersz["element_id"] == "bus_sn_b"
    # Dowod, ze scena COS demonstruje (nie tylko przechodzi bez bledu): prady
    # fazowe z opcji sceny sa na tyle asymetryczne, ze solver zglasza alert.
    assert wiersz["flags"]["current_unbalance_alert"] is True
    assert wiersz["ia_a"] == 135.0
    assert wiersz["ib_a"] == 78.0
    assert wiersz["ic_a"] == 100.0


# ---------------------------------------------------------------------------
# Karta HARNESS-RESZTA (kontynuacja, 2026-09-16) — sceny „siła-sieci",
# „migotanie", „kompensacja(-wynik)", „walidacja"/„rozplyw", „cieplna",
# „arcflash": realny bieg backendu (short_circuit_sn/PF na sieci złotej).
# ---------------------------------------------------------------------------


def test_sila_sieci_ma_scr_realny_z_katalogu_i_werdykt_mocna() -> None:
    widok = eksport.sila_sieci_scena_wynik()
    _run_idy_nie_sa_uuid(widok)
    assert widok["context"]["run_id"] == eksport.RUN_ID_SCENY_OZE_ANALIZ
    wpis = widok["entries"][0]
    assert wpis["bus_ref"] == "bus_nn"
    assert wpis["modules"][0]["ref"] == "gen_pv"
    assert wpis["s_installed_mva"] == 0.215, "moc znamionowa MUSI pochodzic z karty katalogu MV"
    assert wpis["scr"] is not None and wpis["scr"] > widok["weak_threshold"]
    assert wpis["verdict"] == "mocna"


def test_migotanie_ma_pst_realny_z_katalogu() -> None:
    widok = eksport.migotanie_scena_wynik()
    _run_idy_nie_sa_uuid(widok)
    bus = widok["buses"][0]
    modul = bus["modules"][0]
    assert modul["gen_ref"] == "gen_pv"
    assert modul["flicker_c"] == 0.3, "wspolczynnik migotania MUSI pochodzic z karty katalogu MV"
    assert modul["included"] is True
    assert bus["pst"] is not None


def test_kompensacja_dobiera_realnego_kandydata_z_katalogu() -> None:
    widok = eksport.kompensacja_scena_wynik()
    _run_idy_nie_sa_uuid(widok)
    assert widok["parameters"]["bus_ref"] == "bus_sn_b"
    assert widok["dobor"] is not None, "scena musi pokazywac REALNY dobor, nie odmowe"
    assert widok["dobor"]["catalog_ref"] == "KOMP_SN_0V6_15KV"
    assert widok["dobor"]["cosfi_punktu_dzien"] >= 0.95
    assert widok["powod_braku"] is None


def test_rozplyw_ma_ksztalt_power_flow_result_v1_z_naruszeniami() -> None:
    widok = eksport.rozplyw_scena_wynik()
    assert {"bus_results", "branch_results", "summary", "converged"} <= set(widok)
    assert widok["converged"] is True
    assert len(widok["bus_results"]) >= 2
    assert len(widok["branch_results"]) >= 1
    # Siec x8 obciazenia MUSI dawac realne odchylenie napiec (nie trywialne
    # ~1.0 pu jak siec bazowa) — dowod, ze mnoznik faktycznie cos zmienia.
    v_pu = [row["v_pu"] for row in widok["bus_results"]]
    assert min(v_pu) < 0.95 or max(v_pu) > 1.05, v_pu


def test_walidacja_energetyczna_na_biegu_x8_ma_naruszenie() -> None:
    widok = eksport.walidacja_scena_wynik()
    assert (
        widok["summary"]["fail_count"] + widok["summary"]["warning_count"] > 0
    ), "siec x8 musi dawac co najmniej jedno realne naruszenie/ostrzezenie"
    kody = {item["check_type"] for item in widok["items"]}
    assert "VOLTAGE_DEVIATION" in kody


def test_walidacja_i_rozplyw_dziela_ten_sam_bieg() -> None:
    rozplyw = eksport.rozplyw_scena_wynik()
    walidacja = eksport.walidacja_scena_wynik()
    # Oba widoki pochodza z JEDNEGO biegu kotwicy (ten sam run_id stabilizowany) —
    # KLASA, nie instancja: dwie sceny czytajace jeden PF nie moga rozjezdzac sie
    # w hashu wejscia.
    _run_idy_a = _wartosci_run_id(walidacja)
    assert eksport.RUN_ID_SCENY_ROZPLYW in _run_idy_a
    assert rozplyw["summary"]["min_v_pu"] < 1.0


def test_cieplna_scena_ocena_ma_pozycje_z_realnym_pradem_i_dowod_na_niej() -> None:
    wynik = eksport.cieplna_scena_wynik()
    _run_idy_nie_sa_uuid(wynik)
    items = wynik["ocena"]["items"]
    assert len(items) >= 1
    najwiekszy = max(items, key=lambda p: (p["i_fault_a"], p["branch_id"]))
    assert najwiekszy["i_fault_a"] > 0.0, "co najmniej jedna galaz musi niesc realny prad zwarcia"
    dowod = eksport.cieplna_scena_dowod()
    assert dowod["branch_id"] == najwiekszy["branch_id"]
    assert len(dowod["kroki"]) >= 1


def test_arcflash_scena_ma_energie_incydentu_realnie_policzona() -> None:
    widok = eksport.arcflash_scena_wynik()
    _run_idy_nie_sa_uuid(widok)
    wynik = widok["results"][0]
    assert wynik["incident_energy_cal_cm2"] > 0.0
    assert wynik["i_bf_ka"] > 0.0
    assert wynik["voltage_kv"] == 15.0


def test_stabilnosc_wyniki_i_slad_dziela_ten_sam_run_id_i_scenariusz() -> None:
    wyniki = eksport.stabilnosc_scena_wyniki()
    slad = eksport.stabilnosc_scena_slad()
    assert wyniki["run_id"] == eksport.RUN_ID_SCENY_STABILNOSC == slad["run_id"]
    _run_idy_nie_sa_uuid(wyniki)
    _run_idy_nie_sa_uuid(slad)
    wiersz = wyniki["rows"][0]
    assert wiersz["source_id"] == "gen_sync"
    assert wiersz["faulted_element_id"] == "line_b_c"
    assert wiersz["cleared_by_element_ids"] == ["fuse_c"]
    assert wiersz["status"] == "STABLE"
    # Karta S-1 (W6-0): zdolnosc dynamic_stability.fault_clear jest
    # UNVALIDATED_MODEL — atrapa NIE MOZE pokazywac "pelny/raportowalny"
    # (defekt starej, recznie wpisanej atrapy, naprawiony tu u zrodla).
    assert wiersz["proof_status"] == "incomplete"
    assert wiersz["reporting_status"] == "not_reportable"
    assert wiersz["dopuszczalnosc_raportowa"] is False
    assert wiersz["evidence"]["tier"] == "UNVALIDATED_MODEL"
    typy_zdarzen = [row["event_type"] for row in slad["rows"]]
    assert typy_zdarzen == [
        "AUTOMATION_STARTED",
        "FAULT_APPLIED",
        "FAULT_CLEARED",
        "POST_FAULT_TOPOLOGY_EFFECT",
        "DYNAMIC_STABILITY_EVALUATED",
    ]
