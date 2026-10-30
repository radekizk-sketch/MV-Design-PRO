"""
Testy API katalogow audytu 2 (eng.5/6/9/10/11/13/15/17/18/20 + B.1/B.5).
"""

from __future__ import annotations

import re

import pytest

pytest.importorskip("fastapi")


def test_list_bess_operation_modes(app_client):
    res = app_client.get("/api/v1/catalog/audit2/bess-operation-modes")
    assert res.status_code == 200
    body = res.json()
    assert isinstance(body, list)
    assert len(body) >= 9  # 9 trybow w katalogu
    codes = {item["mode_code"] for item in body}
    assert "fcr_n" in codes
    assert "afrr" in codes
    assert "voltage_support" in codes
    assert "island_backup" in codes
    # Karta FAB-L (migracja z usunietego testu frontowego eng.10 —
    # `audit-round2-fixes.test.ts`, ktory sprawdzal te same fakty na mirrorze
    # frontu usunietym w tej karcie): FCR-N wymaga 4-kwadrantowego PCS, praca
    # wyspowa wymaga PCS grid-forming (falownik TWORZACY napiecie, nie tylko
    # podazajacy za siecia).
    by_code = {item["mode_code"]: item for item in body}
    assert by_code["fcr_n"]["requires_four_quadrant"] is True
    assert by_code["island_backup"]["requires_grid_forming"] is True


def test_list_tap_changers(app_client):
    res = app_client.get("/api/v1/catalog/audit2/tap-changers")
    assert res.status_code == 200
    body = res.json()
    assert len(body) >= 4
    types = {item["type"] for item in body}
    assert "oltc" in types
    assert "detc" in types
    # OLTC 110/SN ma 17 lub 19 zaczepow
    oltcs = [t for t in body if t["type"] == "oltc"]
    assert any(t["tap_count"] in (17, 19) for t in oltcs)
    # Karta FAB-L (migracja z usunietego testu frontowego eng.13): OLTC 110/SN
    # reguluje pod obciazeniem (AVR), krok 1,25%; DETC SN/nN przelacza sie
    # WYLACZNIE bez obciazenia (brak AVR) — to rozroznia oba typy przelacznikow.
    oltc_110 = next(t for t in oltcs if "transformer_110_15" in t["applicable_to"])
    assert oltc_110["step_percent"] == 1.25
    assert oltc_110["supports_avr"] is True
    detcs = [t for t in body if t["type"] == "detc"]
    assert detcs and all(t["supports_avr"] is False for t in detcs)


def test_list_hv_fuses(app_client):
    res = app_client.get("/api/v1/catalog/audit2/hv-fuses")
    assert res.status_code == 200
    body = res.json()
    assert len(body) >= 4
    classes = {item["class"] for item in body}
    assert "full_range" in classes
    assert "general_purpose" in classes
    assert "back_up" in classes


def test_list_device_withstand(app_client):
    res = app_client.get("/api/v1/catalog/audit2/device-withstand")
    assert res.status_code == 200
    body = res.json()
    assert len(body) >= 5
    types = {item["device_type"] for item in body}
    assert "breaker_vacuum_15" in types
    assert "breaker_sf6_15" in types
    assert "busbar_15_2000" in types


def test_list_pf_curves(app_client):
    """Warianty nastawy P(f) — bez imienia operatora i bez typu modulu.

    INTENCJA POPRZEDNIEGO TESTU: pilnowal, ze koncowka zwraca krzywe „PSE modul
    B / C / D" z konkretnym statyzmem. Karta K-Q zmierzyla to na tekscie
    rozporzadzenia 2016/631: ono NIE przypisuje statyzmu ani operatorowi, ani
    typowi modulu — podaje przedzial nastawialny 2-12 %. Pin utrwalal wiec
    fabrykacje normatywna. Teraz pozycja jest wariantem nastawy nazwanym swoim
    statyzmem, a test pilnuje granic z rozporzadzenia PO WSZYSTKICH pozycjach.
    """
    res = app_client.get("/api/v1/catalog/audit2/pf-curves")
    assert res.status_code == 200
    body = res.json()
    assert len(body) >= 3
    for item in body:
        assert "operator_code" not in item, item["id"]
        assert "module_type" not in item, item["id"]
        assert 2.0 <= item["droop_percent"] <= 12.0, item["id"]
        assert 0.2 <= item["deadband_hz"] <= 0.5, item["id"]
        assert (item["f_min_hz"], item["f_max_hz"]) == (47.5, 51.5), item["id"]
        assert "eur-lex.europa.eu" in item["zrodlo_pl"], item["id"]
    statyzmy = {item["droop_percent"] for item in body}
    assert {2.0, 3.0, 4.0, 5.0, 12.0} <= statyzmy


def test_list_block_transformers(app_client):
    res = app_client.get("/api/v1/catalog/audit2/block-transformers")
    assert res.status_code == 200
    body = res.json()
    assert len(body) >= 5
    der_kinds = set()
    for item in body:
        der_kinds.update(item["applicable_der_kinds"])
    assert "PV" in der_kinds
    assert "BESS" in der_kinds
    assert "FW" in der_kinds
    # Każda pozycja niesie proweniencję katalogu transformatorów i jawną flagę SN/SN.
    for item in body:
        assert isinstance(item["is_mv_to_mv"], bool)
        assert item["source_reference"].strip()
        assert item["verification_status"] in {"REFERENCYJNY", "ZWERYFIKOWANY"}
    # Karta KATALOG-KOMPLETNY-PROWENIENCJA (2026-10-15): dawna pozycja SN/SN 15/6,3 kV
    # 10 MVA miała parametry szacowane bez źródła — usunięta. Pozycja SN/SN jest
    # ZABLOKOWANA danymi (brak źródła u_k i strat dla strony dolnej > 1,1 kV); pin
    # nieobecności zmienia się świadomie, gdy dojdzie karta producenta.
    assert [b for b in body if b["is_mv_to_mv"]] == []


def test_katalog_wariantow_uziemienia_sn_skasowany(app_client):
    """Karta UX-04/POLE-ZU-SKLADOWA-ZEROWA: wybór wariantu uziemienia punktu neutralnego SN
    z katalogu audytu 2 był DRUGĄ prawdą obok elementów modelu — końcówka i pole snapshotu
    nie istnieją (sposób uziemienia sekcji SN wynika z zespołów uziemiających w ENM)."""
    # Ścieżka złożona z części: pełna nazwa jest wzorcem strażnika wskrzeszenia
    # (`scripts/grep_zero_guard.py`, grupa `zu_`), a ten test pinuje jej NIEOBECNOŚĆ w API.
    sciezka = "mv" + "-neutral-" + "groundings"
    assert app_client.get(f"/api/v1/catalog/audit2/{sciezka}").status_code == 404
    snapshot = app_client.get("/api/v1/catalog/audit2/snapshot").json()
    assert not any("grounding" in klucz for klucz in snapshot)


def test_snapshot_aggregator(app_client):
    res = app_client.get("/api/v1/catalog/audit2/snapshot")
    assert res.status_code == 200
    body = res.json()
    assert "bess_operation_modes" in body
    assert "tap_changers" in body
    assert "hv_fuses" in body
    assert "device_withstand" in body
    assert "pf_curves" in body
    assert "block_transformers" in body
    # Wszystkie listy niepuste
    for key, items in body.items():
        assert isinstance(items, list), key
        assert len(items) > 0, key


# Karta WERDYKT-MIGRACJA-190: walidatory zwracają rekord werdyktu wyjaśnialnego (`ocena` — K,
# `wymaganie` — W) i jego zdanie (`message_pl`); dawne flagi `ok` / `i_dyn_ok` / `i_th_ok`
# i słowa statusu eksportu z progów bez podstawy usunięte.


def _vt(app_client, wspolczynnik: float, uziemienie: str) -> dict:
    res = app_client.post(
        "/api/v1/catalog/audit2/validate-vt-grounding",
        json={"voltage_factor": wspolczynnik, "grounding_type": uziemienie},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["message_pl"] == body["ocena"]["wyjasnienie"]["zdanie_pl"]
    return body


def test_validate_vt_grounding_isolated_requires_19(app_client):
    body = _vt(app_client, 1.5, "isolated")
    assert body["ocena"]["status_maszynowy"] == "NIE_SPELNIA"
    assert body["ocena"]["limit"]["wartosc"]["wartosc"] == 1.9
    assert "izolowany" in body["message_pl"]


def test_validate_vt_grounding_petersen_19_ok(app_client):
    body = _vt(app_client, 1.9, "petersen_coil")
    # Spełnione na liczbach; dowód niepełny (zdolność bez walidacji) — nigdy „OK” bez
    # zastrzeżenia.
    assert body["ocena"]["status_maszynowy"] == "SPELNIA"
    assert body["ocena"]["kompletnosc_dowodu"] == "NIEPELNY"


def test_validate_vt_grounding_directly_wymaga_15_nie_12(app_client):
    """Sieć bezpośrednio uziemiona: VT faza–ziemia wymaga 1,5 przez 30 s (V12K-256).

    Ten test twierdzil wczesniej, ze wystarczy 1,2 — bo `audit2_catalogs` mial WLASNA,
    lagodniejsza wersje reguly IEC 61869-3 tab. 2. Wspolczynnik 1,2 (ciagly) dotyczy
    przekladnika pracujacego MIEDZY FAZAMI, ktory przy zwarciu doziemnym nie widzi
    wzrostu napiecia; uzwojenie faza-ziemia w sieci skutecznie uziemionej potrzebuje
    1,5 przez 30 s. Regula jest teraz jedna (`domain/dobor_przekladnika`), a to
    sprawdzenie pilnuje, ze lagodniejszy wariant nie wroci — trafialby do PAKIETU
    DOWODOWEGO jako werdykt zgodnosci.
    """
    zanizone = _vt(app_client, 1.2, "directly_grounded")
    assert zanizone["ocena"]["status_maszynowy"] == "NIE_SPELNIA"
    assert zanizone["ocena"]["limit"]["wartosc"]["wartosc"] == 1.5
    assert "1,5" in zanizone["message_pl"]

    wystarczajace = _vt(app_client, 1.5, "directly_grounded")
    assert wystarczajace["ocena"]["status_maszynowy"] == "SPELNIA"


def test_validate_vt_grounding_rezystor_wymaga_19(app_client):
    """Sieć uziemiona przez rezystor NIE jest siecią skutecznie uziemioną (V12K-256).

    Poprzednia wersja reguly dopuszczala tam 1,5. Przy zwarciu doziemnym napiecie faz
    zdrowych rosnie praktycznie do miedzyfazowego, wiec wymaganie 1,5 bylo zanizone.
    """
    body = _vt(app_client, 1.5, "resistor_grounded")
    assert body["ocena"]["status_maszynowy"] == "NIE_SPELNIA"
    assert "1,9" in body["message_pl"]


def test_validate_vt_grounding_nieznany_typ_uziemienia_to_422_nie_ocena(app_client):
    """Typ uziemienia spoza słownika to błąd żądania, nie ocena przekładnika."""
    res = app_client.post(
        "/api/v1/catalog/audit2/validate-vt-grounding",
        json={"voltage_factor": 1.9, "grounding_type": "kosmiczne"},
    )
    assert res.status_code == 422
    assert "kosmiczne" in res.json()["detail"]


def _wytrzymalosc(app_client, i_peak: float, i_th: float = 20.0) -> dict:
    res = app_client.post(
        "/api/v1/catalog/audit2/validate-device-withstand",
        json={
            "device_id": "wstd_breaker_vacuum_15_25",
            "i_peak_calculated_ka": i_peak,
            "i_thermal_calculated_ka": i_th,
            "t_clearing_s": 1.0,
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["message_pl"] == body["wymaganie"]["wyjasnienie"]["zdanie_pl"]
    return body


def _statusy_skladowych(body: dict) -> dict[str, str]:
    return {
        o["kryterium_id"].rsplit(".", 1)[-1]: o["status_maszynowy"]
        for o in body["wymaganie"]["oceny_skladowe"]
    }


def test_validate_device_withstand_within_limits(app_client):
    body = _wytrzymalosc(app_client, 50)
    assert _statusy_skladowych(body) == {"dynamiczna": "SPELNIA", "cieplna": "SPELNIA"}
    assert body["wymaganie"]["status_maszynowy"] == "BRAK_DOWODU"
    assert body["utilization_dyn_percent"] == pytest.approx(80.0)


def test_validate_device_withstand_idyn_exceeded(app_client):
    body = _wytrzymalosc(app_client, 70)
    assert _statusy_skladowych(body) == {"dynamiczna": "NIE_SPELNIA", "cieplna": "SPELNIA"}
    assert body["wymaganie"]["status_maszynowy"] == "NIE_SPELNIA"


def test_validate_device_withstand_pozycja_spoza_katalogu_to_404(app_client):
    res = app_client.post(
        "/api/v1/catalog/audit2/validate-device-withstand",
        json={
            "device_id": "wstd_nie_istnieje",
            "i_peak_calculated_ka": 50,
            "i_thermal_calculated_ka": 20,
            "t_clearing_s": 1.0,
        },
    )
    assert res.status_code == 404
    assert "wstd_nie_istnieje" not in res.json()["detail"]


@pytest.mark.parametrize(
    ("p_export_kw", "p_import_kw", "status"),
    [
        (500, 1000, "NIE_DOTYCZY"),
        (0, 0, "NIE_DOTYCZY"),
        (2500, 1000, "BRAK_PODSTAWY"),
        (5000, 1000, "BRAK_PODSTAWY"),
        (100, 0, "BRAK_PODSTAWY"),
    ],
    ids=["autokonsumpcja", "bez_zrodel_i_odbiorow", "eksport", "eksport_duzy", "bez_odbiorow"],
)
def test_validate_hosting_capacity_rekord_bez_progow_bez_podstawy(
    app_client, p_export_kw, p_import_kw, status
):
    """Granica eksportu wynika z warunków przyłączenia OSD, których model nie niesie:
    eksport netto to BRAK_PODSTAWY z wynikiem informacyjnym, brak eksportu — NIE_DOTYCZY.
    Dawne progi 0,8 / 1,5 / 3,0 stosunku eksportu do importu i zalecenia „WYMAGANE: studium
    NC RfG…” nie miały podstawy (karta WERDYKT-MIGRACJA-190). Import zerowy nie daje
    stosunku `inf` (karta PROOFPACK-KONTRAKT) — stosunku nie ma wcale."""
    res = app_client.post(
        "/api/v1/catalog/audit2/validate-hosting-capacity-export",
        json={"station_id": "stacja-004", "p_export_kw": p_export_kw, "p_import_kw": p_import_kw},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["ocena"]["status_maszynowy"] == status
    assert body["p_net_export_kw"] == p_export_kw - p_import_kw
    assert body["message_pl"] == body["ocena"]["wyjasnienie"]["zdanie_pl"]
    assert "export_to_import_ratio" not in body and "status" not in body
    for slowo in ("curtailment", "ramp-down", "WYMAGANE"):
        assert slowo not in body["message_pl"]
    assert re.search(r"\binf\b", body["message_pl"]) is None
    if status == "BRAK_PODSTAWY":
        assert body["ocena"]["wynik"]["wartosc"] == {
            "wartosc": float(p_export_kw - p_import_kw),
            "jednostka": "kW",
        }


@pytest.mark.parametrize(
    ("sciezka", "cialo"),
    [
        ("validate-vt-grounding", {"voltage_factor": 1.9}),
        ("validate-device-withstand", {"device_id": "wstd_breaker_vacuum_15_25"}),
        ("validate-hosting-capacity-export", {"station_id": "s", "p_export_kw": "duzo"}),
        ("build-station-payload", {"der_specs": []}),
        ("generate-report", {"project_name": "P"}),
    ],
)
def test_koncowki_post_odrzucaja_niepelne_cialo_422_nigdy_500(app_client, sciezka, cialo):
    """Kazda koncowka POST routera ma typowany kontrakt: niepelne cialo to 422."""
    res = app_client.post(f"/api/v1/catalog/audit2/{sciezka}", json=cialo)
    assert res.status_code == 422


def test_build_station_payload_deterministyczny(app_client):
    payload = {
        "station_id": "station_api_001",
        "tap_changer_refs": ["tc_oltc_110sn_19_125"],
        "der_specs": [
            {"der_id": "der_pv_001", "der_kind": "PV", "pf_curve_ref": "pf_droop_5"},
            {
                "der_id": "der_bess_001",
                "der_kind": "BESS",
                "bess_operation_mode_refs": ["mode_fcr_n", "mode_voltage_support"],
            },
        ],
    }
    pierwszy = app_client.post("/api/v1/catalog/audit2/build-station-payload", json=payload)
    drugi = app_client.post("/api/v1/catalog/audit2/build-station-payload", json=payload)
    assert pierwszy.status_code == drugi.status_code == 200
    assert pierwszy.content == drugi.content
    body = pierwszy.json()
    assert len(body["payload"]["der_payloads"]) == 2
    assert "power_flow_extensions" in body["solver_extensions"]


@pytest.mark.parametrize(
    "pakiet",
    [{}, {"proofs": [{"proof_type": "OBCY", "summary_pl": "x"}]}, {"braki_danych": ["x"]}],
    ids=["pusty", "rodzaj_obcy", "brak_w_zlym_ksztalcie"],
)
def test_generate_report_pakiet_dowolnego_ksztaltu_nie_daje_500(app_client, pakiet):
    """Raport tylko renderuje pakiet (odczyt `.get` z wartosciami domyslnymi) — pakiet
    w nieoczekiwanym ksztalcie nie moze skonczyc sie bledem serwera."""
    res = app_client.post(
        "/api/v1/catalog/audit2/generate-report",
        json={
            "project_name": "P",
            "station_id": "s",
            "station_name": "Stacja S",
            "proof_pack": pakiet,
            "formats": ["json", "text_pl", "latex"],
        },
    )
    assert res.status_code == 200
    assert "Stacja S" in res.json()["text_pl"]
