"""Testy API katalogów konfiguracji stacji (`/api/v1/catalog/konfiguracja-stacji`)."""

from __future__ import annotations

import pytest

pytest.importorskip("fastapi")


def test_list_bess_operation_modes(app_client):
    res = app_client.get("/api/v1/catalog/konfiguracja-stacji/bess-operation-modes")
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
    res = app_client.get("/api/v1/catalog/konfiguracja-stacji/tap-changers")
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
    res = app_client.get("/api/v1/catalog/konfiguracja-stacji/hv-fuses")
    assert res.status_code == 200
    body = res.json()
    assert len(body) >= 4
    classes = {item["class"] for item in body}
    assert "full_range" in classes
    assert "general_purpose" in classes
    assert "back_up" in classes


def test_list_pf_curves(app_client):
    """Warianty nastawy P(f) — bez imienia operatora i bez typu modulu.

    INTENCJA POPRZEDNIEGO TESTU: pilnowal, ze koncowka zwraca krzywe „PSE modul
    B / C / D" z konkretnym statyzmem. Karta K-Q zmierzyla to na tekscie
    rozporzadzenia 2016/631: ono NIE przypisuje statyzmu ani operatorowi, ani
    typowi modulu — podaje przedzial nastawialny 2-12 %. Pin utrwalal wiec
    fabrykacje normatywna. Teraz pozycja jest wariantem nastawy nazwanym swoim
    statyzmem, a test pilnuje granic z rozporzadzenia PO WSZYSTKICH pozycjach.
    """
    res = app_client.get("/api/v1/catalog/konfiguracja-stacji/pf-curves")
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
    res = app_client.get("/api/v1/catalog/konfiguracja-stacji/block-transformers")
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
    z katalogu konfiguracji stacji był DRUGĄ prawdą obok elementów modelu — końcówka i pole snapshotu
    nie istnieją (sposób uziemienia sekcji SN wynika z zespołów uziemiających w ENM)."""
    # Ścieżka złożona z części: pełna nazwa jest wzorcem strażnika wskrzeszenia
    # (`scripts/grep_zero_guard.py`, grupa `zu_`), a ten test pinuje jej NIEOBECNOŚĆ w API.
    sciezka = "mv" + "-neutral-" + "groundings"
    assert app_client.get(f"/api/v1/catalog/konfiguracja-stacji/{sciezka}").status_code == 404
    snapshot = app_client.get("/api/v1/catalog/konfiguracja-stacji/snapshot").json()
    assert not any("grounding" in klucz for klucz in snapshot)


def test_snapshot_aggregator(app_client):
    res = app_client.get("/api/v1/catalog/konfiguracja-stacji/snapshot")
    assert res.status_code == 200
    body = res.json()
    assert "bess_operation_modes" in body
    assert "tap_changers" in body
    assert "hv_fuses" in body
    assert "pf_curves" in body
    assert "block_transformers" in body
    # Wszystkie listy niepuste
    for key, items in body.items():
        assert isinstance(items, list), key
        assert len(items) > 0, key


def test_validate_vt_grounding_isolated_requires_19(app_client):
    res = app_client.post(
        "/api/v1/catalog/konfiguracja-stacji/validate-vt-grounding",
        json={"voltage_factor": 1.5, "grounding_type": "isolated"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is False
    assert "izolowana" in body["message_pl"].lower() or "1.9" in body["message_pl"]


def test_validate_vt_grounding_petersen_19_ok(app_client):
    res = app_client.post(
        "/api/v1/catalog/konfiguracja-stacji/validate-vt-grounding",
        json={"voltage_factor": 1.9, "grounding_type": "petersen_coil"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True


def test_validate_vt_grounding_directly_wymaga_15_nie_12(app_client):
    """Sieć bezpośrednio uziemiona: VT faza–ziemia wymaga 1,5 przez 30 s (V12K-256).

    Ten test twierdzil wczesniej, ze wystarczy 1,2 — bo dawny katalog rozszerzen stacji mial WLASNA,
    lagodniejsza wersje reguly IEC 61869-3 tab. 2. Wspolczynnik 1,2 (ciagly) dotyczy
    przekladnika pracujacego MIEDZY FAZAMI, ktory przy zwarciu doziemnym nie widzi
    wzrostu napiecia; uzwojenie faza-ziemia w sieci skutecznie uziemionej potrzebuje
    1,5 przez 30 s. Regula jest teraz jedna (`domain/dobor_przekladnika`), a to
    sprawdzenie pilnuje, ze lagodniejszy wariant nie wroci — trafialby do PAKIETU
    DOWODOWEGO jako werdykt zgodnosci.
    """
    zanizone = app_client.post(
        "/api/v1/catalog/konfiguracja-stacji/validate-vt-grounding",
        json={"voltage_factor": 1.2, "grounding_type": "directly_grounded"},
    )
    assert zanizone.status_code == 200
    assert zanizone.json()["ok"] is False
    assert "1.5" in zanizone.json()["message_pl"]

    wystarczajace = app_client.post(
        "/api/v1/catalog/konfiguracja-stacji/validate-vt-grounding",
        json={"voltage_factor": 1.5, "grounding_type": "directly_grounded"},
    )
    assert wystarczajace.json()["ok"] is True


def test_validate_vt_grounding_rezystor_wymaga_19(app_client):
    """Sieć uziemiona przez rezystor NIE jest siecią skutecznie uziemioną (V12K-256).

    Poprzednia wersja reguly dopuszczala tam 1,5. Przy zwarciu doziemnym napiecie faz
    zdrowych rosnie praktycznie do miedzyfazowego, wiec wymaganie 1,5 bylo zanizone.
    """
    res = app_client.post(
        "/api/v1/catalog/konfiguracja-stacji/validate-vt-grounding",
        json={"voltage_factor": 1.5, "grounding_type": "resistor_grounded"},
    )
    assert res.json()["ok"] is False
    assert "1.9" in res.json()["message_pl"]


@pytest.mark.parametrize(
    ("sciezka", "cialo"),
    [
        ("validate-vt-grounding", {"voltage_factor": 1.9}),
        ("generate-report", {"project_name": "P"}),
    ],
)
def test_koncowki_post_odrzucaja_niepelne_cialo_422_nigdy_500(app_client, sciezka, cialo):
    """Kazda koncowka POST routera ma typowany kontrakt: niepelne cialo to 422."""
    res = app_client.post(f"/api/v1/catalog/konfiguracja-stacji/{sciezka}", json=cialo)
    assert res.status_code == 422


@pytest.mark.parametrize(
    "pakiet",
    [{}, {"proofs": [{"proof_type": "OBCY", "pass_status": True}]}, {"braki_danych": ["x"]}],
    ids=["pusty", "rodzaj_obcy", "brak_w_zlym_ksztalcie"],
)
def test_generate_report_pakiet_dowolnego_ksztaltu_nie_daje_500(app_client, pakiet):
    """Raport tylko renderuje pakiet (odczyt `.get` z wartosciami domyslnymi) — pakiet
    w nieoczekiwanym ksztalcie nie moze skonczyc sie bledem serwera."""
    res = app_client.post(
        "/api/v1/catalog/konfiguracja-stacji/generate-report",
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


@pytest.mark.parametrize(
    ("metoda", "sciezka"),
    [
        ("get", "device-withstand"),
        ("post", "validate-device-withstand"),
        ("post", "validate-hosting-capacity-export"),
        ("post", "build-station-payload"),
    ],
)
def test_skasowane_koncowki_nie_istnieja(app_client, metoda, sciezka):
    """Karta JEDNA-SCIEZKA-EDYCJI: katalog wytrzymałości obok aparatów modelu, kalkulator
    eksportu z liczb wpisanych obok modelu i składanie bocznego wejścia solvera — skasowane.
    Werdykt wytrzymałości liczy się z aparatów modelu, bilans eksportu z elementów modelu
    w pakiecie dowodów stacji. Dawny prefiks katalogu też nie istnieje."""
    nowa = getattr(app_client, metoda)(f"/api/v1/catalog/konfiguracja-stacji/{sciezka}")
    assert nowa.status_code in (404, 405)
    stara_nazwa = "audit" + "2"
    assert app_client.get(f"/api/v1/catalog/{stara_nazwa}/snapshot").status_code == 404
