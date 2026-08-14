"""Parytet liczbowy: wytrzymalosc aparatury I_dyn / I_th (karta K7-B, 2026-07-31).

PO CO TEN PLIK. Do karty K7-B werdykt „aparatura wytrzymala / nie wytrzymala"
liczyla WARSTWA PREZENTACJI: `frontend/src/ui/network-build/station-der/
protection-catalogs.ts::validateDeviceWithstand` wraz z wlasna kopia katalogu
`DEVICE_WITHSTAND_CATALOG`. Karta zabezpieczen stacji pokazywala te liczby jako
wynik inzynierski, choc nie widzial ich zaden solver ani slad WHITE BOX. K7-B
przeniosla ten rachunek do backendu (reguła NOT-A-SOLVER) i podlaczyla ekran do
`POST /api/v1/catalog/audit2/validate-device-withstand`.

CZEGO PILNUJE TEN TEST. Sam RACHUNEK jest zamrozony — formula i jej wyniki nie
moga sie zmienic przy zadnym refaktorze:

    I_th_eff = I_th_rated * sqrt(t_rated / max(t_clearing, 0,01))
    wykorzystanie I_dyn [%] = I_peak / I_dyn_rated * 100
    wykorzystanie I_th  [%] = I_th_obl / I_th_eff * 100

Wartosci ponizej sa TWARDYMI literalami; nie sa liczone w tescie ta sama formula
(to byloby kolem w argumentacji). Zmiana implementacji backendu zapala ten test.

USUNIECIE TORU BACKENDU (bramka 3 karty K7-B) — skasowanie / zmiana
`validate_device_withstand` natychmiast czyni ten test czerwonym.

AKTUALIZACJA WARTOSCI I_dyn (karta K-Q, 2026-08-14) — UCZCIWIE O ZMIANIE.
Do karty K-Q ten plik deklarowal, ze przeniesienie rachunku „nie moze zmienic ANI
JEDNEJ liczby pokazywanej projektantowi", i pinowal znamiona I_dyn wpisane
recznie: 63 kA przy I_th 25 kA i 80 kA przy 31,5 kA. Zadnej z nich nie dalo sie
wyprowadzic — ani z normy (IEC 62271-1 § 4.6: I_dyn = 2,5 * I_th dla 50 Hz, czyli
62,5 i 78,75 kA), ani z karty jakiegokolwiek producenta, bo katalog nie opisuje
wyrobu, tylko klase wytrzymalosci. K-Q zamienila wpisywanie na wyprowadzanie,
wiec ZNAMIONA sie zmienily (zachowawczo w dol — nizszy limit moze werdykt tylko
zaostrzyc, nigdy falszywie zaliczyc), a wraz z nimi wykorzystanie I_dyn w
przypadkach ponizej. RACHUNEK zostal nietkniety: kolumny wykorzystania I_th sa
identyczne co do ostatniej cyfry przed i po karcie.
"""

from __future__ import annotations

import pytest
from network_model.catalog.audit2_catalogs import (
    DEVICE_WITHSTAND_CATALOG,
    get_device_withstand,
    validate_device_withstand,
)

# (opis, device_id, I_peak [kA], I_th obl [kA], t_clearing [s],
#  ok, i_dyn_ok, i_th_ok, wykorzystanie I_dyn [%], wykorzystanie I_th [%])
PARITY_CASES = [
    (
        "wylacznik prozniowy — oba kryteria spelnione",
        "wstd_breaker_vacuum_15_25",
        50.0,
        20.0,
        1.0,
        True,
        True,
        True,
        80.0,
        80.0,
    ),
    (
        "wylacznik prozniowy — przekroczone I_dyn",
        "wstd_breaker_vacuum_15_25",
        70.0,
        20.0,
        1.0,
        False,
        False,
        True,
        112.00000000000001,
        80.0,
    ),
    (
        "wylacznik prozniowy — przekroczone I_th",
        "wstd_breaker_vacuum_15_25",
        50.0,
        60.0,
        1.0,
        False,
        True,
        False,
        80.0,
        240.0,
    ),
    (
        "SF6 31,5 kA/3s — skalowanie I_th przy t=0,5 s podnosi limit",
        "wstd_breaker_sf6_15_31_5",
        50.0,
        60.0,
        0.5,
        True,
        True,
        True,
        63.49206349206349,
        77.76157913597392,
    ),
    (
        "SF6 31,5 kA/3s — przy t znamionowym 3 s limit nie wystarcza",
        "wstd_breaker_sf6_15_31_5",
        50.0,
        60.0,
        3.0,
        False,
        True,
        False,
        63.49206349206349,
        190.47619047619045,
    ),
    (
        "szyna 2000 A — krotki czas wylaczania t=0,2 s",
        "wstd_busbar_15_2000_50",
        100.0,
        40.0,
        0.2,
        True,
        True,
        True,
        80.0,
        35.77708763999664,
    ),
    (
        "rozlacznik — t ponizej progu 0,01 s jest ograniczane do 0,01 s",
        "wstd_switch_load_15_25",
        60.0,
        30.0,
        0.005,
        True,
        True,
        True,
        96.0,
        12.0,
    ),
]


@pytest.mark.parametrize(
    "opis,device_id,i_peak,i_th,t_clearing,ok,i_dyn_ok,i_th_ok,util_dyn,util_th",
    PARITY_CASES,
    ids=[c[0] for c in PARITY_CASES],
)
def test_parytet_z_rachunkiem_ktory_byl_w_ui(
    opis: str,
    device_id: str,
    i_peak: float,
    i_th: float,
    t_clearing: float,
    ok: bool,
    i_dyn_ok: bool,
    i_th_ok: bool,
    util_dyn: float,
    util_th: float,
) -> None:
    result = validate_device_withstand(
        device_id=device_id,
        i_peak_calculated_ka=i_peak,
        i_thermal_calculated_ka=i_th,
        t_clearing_s=t_clearing,
    )
    assert result["ok"] is ok, opis
    assert result["i_dyn_ok"] is i_dyn_ok, opis
    assert result["i_th_ok"] is i_th_ok, opis
    assert result["utilization_dyn_percent"] == pytest.approx(util_dyn, rel=0, abs=1e-9), opis
    assert result["utilization_th_percent"] == pytest.approx(util_th, rel=0, abs=1e-9), opis


def test_katalog_ma_te_same_identyfikatory_co_zniesiona_kopia_w_ui() -> None:
    """Identyfikatory MUSZA byc te same — inaczej zapisany wybor pola wskazywalby
    donikad (dokladnie ten defekt zamknela V12K-257 dla przekladnikow napieciowych)."""
    ids = {item.id for item in DEVICE_WITHSTAND_CATALOG}
    assert ids == {
        "wstd_breaker_vacuum_15_25",
        "wstd_breaker_sf6_15_31_5",
        "wstd_busbar_15_2000_50",
        "wstd_busbar_15_1250_25",
        "wstd_switch_load_15_25",
    }
    typy = {item.device_type for item in DEVICE_WITHSTAND_CATALOG}
    assert {"breaker_vacuum_15", "breaker_sf6_15", "busbar_15_2000"} <= typy


def test_dane_znamionowe_zgodne_z_kopia_z_ui() -> None:
    """Parametry katalogowe (I_dyn, I_th, t_rated) — bez nich parytet liczbowy
    powyzej bylby przypadkiem.

    I_dyn jest WYPROWADZONY z I_th (2,5 x, IEC 62271-1 § 4.6, karta K-Q), a nie
    wpisany — ten pin trzyma obie liczby razem, zeby para nie mogla sie rozjechac.
    """
    oczekiwane = {
        "wstd_breaker_vacuum_15_25": (62.5, 25.0, 1.0),
        "wstd_breaker_sf6_15_31_5": (78.75, 31.5, 3.0),
        "wstd_busbar_15_2000_50": (125.0, 50.0, 1.0),
        "wstd_busbar_15_1250_25": (62.5, 25.0, 1.0),
        "wstd_switch_load_15_25": (62.5, 25.0, 1.0),
    }
    for device_id, (i_dyn, i_th, t_rated) in oczekiwane.items():
        device = get_device_withstand(device_id)
        assert device is not None, device_id
        assert device.i_dyn_ka == i_dyn
        assert device.i_th_1s_ka == i_th
        assert device.i_th_duration_s == t_rated


def test_brak_aparatu_w_katalogu_daje_uczciwy_brak_a_nie_zgodnosc() -> None:
    result = validate_device_withstand(
        device_id="wstd_nie_istnieje",
        i_peak_calculated_ka=50.0,
        i_thermal_calculated_ka=20.0,
        t_clearing_s=1.0,
    )
    assert result["ok"] is False
    assert "Brak aparatury w katalogu" in result["message_pl"]


def test_komunikat_jest_po_polsku_z_diakrytykami() -> None:
    """`message_pl` jest tekstem POKAZYWANYM na karcie zabezpieczen — od K7-B
    ekran nie sklada juz wlasnego zdania, tylko wyswietla odpowiedz backendu."""
    ok_msg = validate_device_withstand(
        device_id="wstd_breaker_vacuum_15_25",
        i_peak_calculated_ka=50.0,
        i_thermal_calculated_ka=20.0,
        t_clearing_s=1.0,
    )["message_pl"]
    assert "wytrzymała" in ok_msg
    assert "wykorzystanie I_dyn 80%" in ok_msg

    bloker_msg = validate_device_withstand(
        device_id="wstd_breaker_vacuum_15_25",
        i_peak_calculated_ka=70.0,
        i_thermal_calculated_ka=60.0,
        t_clearing_s=1.0,
    )["message_pl"]
    assert bloker_msg.startswith("BLOKER:")
    assert "przekroczenie wytrzymałości dynamicznej" in bloker_msg
    assert "przekroczenie wytrzymałości cieplnej" in bloker_msg
