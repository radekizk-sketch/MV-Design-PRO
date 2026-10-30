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

    I_th_eff = I_th_rated                            dla t_clearing <= t_rated
    I_th_eff = I_th_rated * sqrt(t_rated / t_clearing)  dla t_clearing >= t_rated
    wykorzystanie I_dyn [%] = I_peak / I_dyn_rated * 100
    wykorzystanie I_th  [%] = I_th_obl / I_th_eff * 100

Wartosci ponizej sa TWARDYMI literalami; nie sa liczone w tescie ta sama formula
(to byloby kolem w argumentacji). Zmiana implementacji backendu zapala ten test.

USUNIECIE TORU BACKENDU (bramka 3 karty K7-B) — skasowanie / zmiana
`ocen_aparat_katalogu_wytrzymalosci` natychmiast czyni ten test czerwonym.

REKORDY ZAMIAST FLAG (karta WERDYKT-MIGRACJA-190, 2026-10). Dawny slownik
`ok` / `i_dyn_ok` / `i_th_ok` / `message_pl: "OK: …"` zastapily rekordy werdyktu
wyjasnialnego: K dynamiczny, K cieplny i W nad nimi (`network_model/catalog/
audit2_oceny.py`). Parytet liczbowy pozostal ten sam: kolumny `i_dyn_ok` / `i_th_ok`
sa teraz statusami rekordow K (SPELNIA / NIE_SPELNIA), wykorzystanie — te same liczby.

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

AKTUALIZACJA RACHUNKU I_th (karta WYTRZYMALOSC-PRAD-POLA, 2026-10) — UCZCIWIE O ZMIANIE.
Rachunek przeniesiony z UI przeliczal prad krotkotrwaly aparatu na czas wylaczenia
W OBIE STRONY: przy t_wyl krotszym od t_rated limit ROSL jak sqrt(t_rated/t_wyl)
(szyna 50 kA/1 s „wytrzymywala" 111,8 kA przy 0,2 s, rozlacznik 25 kA/1 s — 250 kA przy
0,005 s po przycieciu czasu do 0,01 s). IEC 60865-1 (wytrzymalosc cieplna urzadzen
elektrycznych) dopuszcza przeliczenie tylko W DOL: I_th <= I_thr dla T_k <= T_kr. Trzy
przypadki ponizej z czasem krotszym od znamionowego zmienily wiec wykorzystanie I_th
(zachowawczo w gore), a dwa z nich werdykt (z „wytrzymala" na bloker). Przypadki z czasem
rownym albo dluzszym od znamionowego sa identyczne co do ostatniej cyfry.
"""

from __future__ import annotations

import pytest
from network_model.catalog.audit2_catalogs import (
    DEVICE_WITHSTAND_CATALOG,
    get_device_withstand,
)
from network_model.catalog.audit2_oceny import ocen_aparat_katalogu_wytrzymalosci


def _status(spelniony: bool) -> str:
    return "SPELNIA" if spelniony else "NIE_SPELNIA"


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
        "SF6 31,5 kA/3s — t=0,5 s krotszy od znamionowego NIE podnosi limitu ponad I_th",
        "wstd_breaker_sf6_15_31_5",
        50.0,
        60.0,
        0.5,
        False,
        True,
        False,
        63.49206349206349,
        190.47619047619045,
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
        "szyna 2000 A — krotki czas wylaczania t=0,2 s: limit = I_th 50 kA",
        "wstd_busbar_15_2000_50",
        100.0,
        40.0,
        0.2,
        True,
        True,
        True,
        80.0,
        80.0,
    ),
    (
        "rozlacznik — t=0,005 s nie daje limitu 250 kA: limit = I_th 25 kA",
        "wstd_switch_load_15_25",
        60.0,
        30.0,
        0.005,
        False,
        True,
        False,
        96.0,
        120.0,
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
    ocena = ocen_aparat_katalogu_wytrzymalosci(
        device_id=device_id,
        i_peak_calculated_ka=i_peak,
        i_thermal_calculated_ka=i_th,
        t_clearing_s=t_clearing,
    )
    assert ocena is not None, opis
    assert ocena.dynamiczna.status_maszynowy == _status(i_dyn_ok), opis
    assert ocena.cieplna.status_maszynowy == _status(i_th_ok), opis
    # Rekord W: naruszenie którejkolwiek składowej ⇒ NIE_SPELNIA; obie spełnione na liczbach
    # ⇒ rozstrzygnięcie pozytywne z dowodem niepełnym (zdolność UNVALIDATED_MODEL), nigdy
    # „spełnia” bez zastrzeżenia.
    if ok:
        assert ocena.wymaganie.status_maszynowy == "BRAK_DOWODU", opis
    else:
        assert ocena.wymaganie.status_maszynowy == "NIE_SPELNIA", opis
    assert ocena.utilization_dyn_percent == pytest.approx(util_dyn, rel=0, abs=1e-9), opis
    assert ocena.utilization_th_percent == pytest.approx(util_th, rel=0, abs=1e-9), opis


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
    """Pozycji spoza katalogu nie da się ocenić — funkcja mówi to jawnie (``None``), a nie
    oceną; końcówka HTTP odpowiada 404 z opisem, pakiet dowodów — brakiem danych."""
    assert (
        ocen_aparat_katalogu_wytrzymalosci(
            device_id="wstd_nie_istnieje",
            i_peak_calculated_ka=50.0,
            i_thermal_calculated_ka=20.0,
            t_clearing_s=1.0,
        )
        is None
    )


def test_komunikat_jest_zdaniem_rekordu_po_polsku() -> None:
    """`message_pl` pokazywany na karcie zabezpieczeń to zdanie rekordu W — z liczbami,
    limitem i podstawą, bez słów „OK” / „BLOKER” (karta WERDYKT-MIGRACJA-190)."""
    zgodny = ocen_aparat_katalogu_wytrzymalosci(
        device_id="wstd_breaker_vacuum_15_25",
        i_peak_calculated_ka=50.0,
        i_thermal_calculated_ka=20.0,
        t_clearing_s=1.0,
    )
    naruszony = ocen_aparat_katalogu_wytrzymalosci(
        device_id="wstd_breaker_vacuum_15_25",
        i_peak_calculated_ka=70.0,
        i_thermal_calculated_ka=60.0,
        t_clearing_s=1.0,
    )
    assert zgodny is not None and naruszony is not None
    for ocena in (zgodny, naruszony):
        slownik = ocena.to_dict()
        assert slownik["message_pl"] == ocena.wymaganie.wyjasnienie.zdanie_pl
        assert not slownik["message_pl"].startswith(("OK", "BLOKER"))
        assert "IEC 62271-1" in slownik["message_pl"]
    assert "62,5 kA" in zgodny.dynamiczna.wyjasnienie.zdanie_pl
    assert "nie jest spełnione" in naruszony.wymaganie.wyjasnienie.zdanie_pl
    assert {o.status_maszynowy for o in naruszony.wymaganie.oceny_skladowe} == {"NIE_SPELNIA"}
