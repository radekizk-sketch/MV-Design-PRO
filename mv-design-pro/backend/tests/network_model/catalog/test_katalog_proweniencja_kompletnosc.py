"""Karta KATALOG-KOMPLETNY-PROWENIENCJA — kompletność katalogu i proweniencja każdej wartości.

Iloczyn cech (reguła KLASA, NIE INSTANCJA):

* każda pozycja (transformator × przekształtnik, w tym turbina wiatrowa rodzaju WIND) × ma
  źródło, a RODZAJ źródła
  wyznacza status weryfikacji w obie strony (karta producenta z adresem ⇔ ZWERYFIKOWANY);
  przyszła pozycja bez źródła jest odrzucana już przy budowie rekordu;
* transformator × zgodność z Tier 2 rozporządzenia (UE) 548/2014 w brzmieniu 2019/1783
  (tab. I.1/I.2 albo minimalny PEI tab. I.7) — znacznik przekroczenia w nocie ⇔ obliczona
  niezgodność, a przekroczenie wyklucza status ZWERYFIKOWANY;
* pozycja normatywna × straty RÓWNE pułapowi (nie mniejsze „na zapas", nie większe);
* każda moc z inwentarza potrzeb szablonów × istnieje pozycja (albo jest jawnie zablokowana
  danymi — wtedy test przypina NIEOBECNOŚĆ, żeby dopisanie danych zmieniło pin);
* brak funkcji szacujących parametry w modułach katalogu.

Zgodność z Tier 2 jest liczona TU (warstwa testu), nie w `src` — katalog niesie dane i ich
proweniencję, a nie fizykę.
"""

from __future__ import annotations

import math
import re
from pathlib import Path
from typing import Any

import pytest
from network_model.catalog import mv_converter_catalog as konw
from network_model.catalog import mv_transformer_catalog as tr
from network_model.catalog.mv_ptpiree_catalog import (
    get_all_ptpiree_generator_certificates,
    manufacturers_match,
    match_ptpiree_certificate,
    model_match_keys,
    normalize_ptpiree_key,
)
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.types import CatalogStatus, CatalogVerificationStatus

ZWERYFIKOWANY = CatalogVerificationStatus.ZWERYFIKOWANY.value
NIEWERYFIKOWANY = CatalogVerificationStatus.NIEWERYFIKOWANY.value
REFERENCYJNY = CatalogVerificationStatus.REFERENCYJNY.value
CZESCIOWO = CatalogVerificationStatus.CZESCIOWO_ZWERYFIKOWANY.value

_KATALOG_SRC = Path(tr.__file__).resolve().parent


# ---------------------------------------------------------------------------
# Rodzaj źródła -> status (jedno źródło prawdy dla trzech katalogów)
# ---------------------------------------------------------------------------


def _rodzaj_zrodla(zrodlo: str) -> str:
    """Klasyfikacja źródła po jego treści; nieznany rodzaj = błąd testu (nowa pozycja
    z „zgadniętym" źródłem nie przejdzie po cichu)."""
    assert zrodlo and zrodlo.strip(), "pozycja bez źródła"
    if zrodlo == konw.ZRODLO_MODELU_REFERENCYJNEGO:
        return "MODEL_REFERENCYJNY"
    if zrodlo.startswith(tr.ZRODLO_TIER2):
        return "NORMATYWNA"
    if zrodlo.startswith("Deklarowane: "):
        return "DEKLAROWANA"
    if zrodlo.startswith(konw.PREFIKS_KOPII_KARTY):
        assert "https://" in zrodlo and "(dostęp " in zrodlo, zrodlo
        return "KOPIA_KARTY"
    if "https://" in zrodlo and "(dostęp " in zrodlo:
        return "KARTA_PRODUCENTA"
    raise AssertionError(f"nierozpoznany rodzaj źródła: {zrodlo!r}")


_STATUS_WG_RODZAJU = {
    "MODEL_REFERENCYJNY": (REFERENCYJNY, CatalogStatus.REFERENCYJNY_V1.value),
    "NORMATYWNA": (REFERENCYJNY, CatalogStatus.REFERENCYJNY_V1.value),
    "DEKLAROWANA": (NIEWERYFIKOWANY, CatalogStatus.REFERENCYJNY_V1.value),
    # Kopia dokumentu producenta u strony trzeciej: treść producenta, autentyczność
    # i wersja niepotwierdzone u producenta -> częściowo zweryfikowana, poza doborem.
    "KOPIA_KARTY": (CZESCIOWO, CatalogStatus.REFERENCYJNY_V1.value),
    "KARTA_PRODUCENTA": (ZWERYFIKOWANY, CatalogStatus.PRODUKCYJNY_V1.value),
}


def oczekiwana_proweniencja(zrodlo: str) -> tuple[str, str]:
    """Para (status weryfikacji, status katalogowy) z RODZAJU źródła — jedyna reguła,
    którą importują pozostałe testy katalogu (predykat w jednym miejscu)."""
    return _STATUS_WG_RODZAJU[_rodzaj_zrodla(zrodlo)]


def _rekordy_katalogu() -> list[tuple[str, str, dict[str, Any]]]:
    rekordy: list[tuple[str, str, dict[str, Any]]] = []
    for rekord in tr.get_all_transformer_types():
        rekordy.append(("TRANSFORMATOR", rekord["id"], rekord["params"]))
    for rekord in konw.get_all_converter_types():
        rekordy.append(("PRZEKSZTALTNIK", rekord["id"], rekord["params"]))
    return rekordy


@pytest.mark.parametrize(
    ("klasa", "rekord_id", "params"),
    _rekordy_katalogu(),
    ids=lambda v: v if isinstance(v, str) else "",
)
def test_kazda_pozycja_ma_zrodlo_a_status_wynika_z_rodzaju_zrodla(
    klasa: str, rekord_id: str, params: dict[str, Any]
) -> None:
    rodzaj = _rodzaj_zrodla(params["source_reference"])
    assert (params["verification_status"], params["catalog_status"]) == _STATUS_WG_RODZAJU[
        rodzaj
    ], (klasa, rekord_id, rodzaj)
    assert params.get("verification_note", "").strip(), (klasa, rekord_id)


def test_przyszla_pozycja_bez_zrodla_jest_odrzucana_w_kazdym_katalogu() -> None:
    """Pozycja dopisana bez źródła NIE dostaje źródła domyślnego — każde wejście klasy."""
    # przekształtnik: konstruktor rekordu wymaga źródła
    with pytest.raises(TypeError, match="source_reference"):
        konw._converter_record(  # type: ignore[call-arg]
            item_id="x",
            name="x",
            kind="PV",
            un_kv=0.4,
            sn_mva=0.1,
            pmax_mw=0.1,
            qmin_mvar=0.0,
            qmax_mvar=0.0,
            cosphi_min=1.0,
            cosphi_max=1.0,
            manufacturer="x",
            model="x",
        )
    # przekształtnik: rekord literalny bez źródła
    with pytest.raises(ValueError, match="catalog.source_missing"):
        konw._apply_quality_defaults({"id": "x", "params": {"kind": "PV"}})
    # turbina wiatrowa jest pozycją przekształtnika (rodzaj WIND) — te same dwa wejścia;
    # równoległy model turbin (`wind_turbines.catalog`) skasowany kartą
    # KATALOG-TURBINY-TOR-V112, więc trzeciego wejścia klasy już nie ma.
    with pytest.raises(ValueError, match="catalog.source_missing"):
        konw._apply_quality_defaults({"id": "x", "params": {"kind": "WIND"}})


def test_dobor_szablonu_dopuszcza_wylacznie_karte_producenta() -> None:
    """Predykat wykluczenia z doboru szablonów × każdy rekord: dopuszczony ⇔ karta
    producenta (źródło z adresem dokumentu)."""
    dopuszczone = []
    for rekord in konw.get_all_converter_types():
        params = rekord["params"]
        z_karty = _rodzaj_zrodla(params["source_reference"]) == "KARTA_PRODUCENTA"
        assert konw.dopuszczona_do_doboru_szablonu(params) == z_karty, rekord["id"]
        if z_karty:
            dopuszczone.append(rekord["id"])
    assert sorted(dopuszczone) == sorted(r["id"] for r in konw.CONVERTER_PV_NN_KARTY_PRODUCENTOW)


# ---------------------------------------------------------------------------
# Transformator × Tier 2
# ---------------------------------------------------------------------------


def _pei_procent(p0_kw: float, pk_kw: float, sr_kva: float) -> float:
    """PEI wg rozporządzenia 548/2014 zał. III przy P_c0 = 0 (górne ograniczenie PEI)."""
    return 100.0 * (1.0 - 2.0 * math.sqrt(p0_kw * pk_kw) / sr_kva)


def _pei_min_tab_i7(sr_mva: float) -> float:
    tabela = tr.TIER2_PEI_OLEJOWE_DUZEJ_MOCY_PROC
    moce = sorted(tabela)
    if sr_mva in tabela:
        return tabela[sr_mva]
    for dolna, gorna in zip(moce, moce[1:], strict=False):
        if dolna < sr_mva < gorna:
            udzial = (sr_mva - dolna) / (gorna - dolna)
            return tabela[dolna] + udzial * (tabela[gorna] - tabela[dolna])
    raise AssertionError(f"moc {sr_mva} MVA poza tab. I.7")


def _niezgodny_z_tier2(params: dict[str, Any]) -> bool:
    sr_kva = params["rated_power_mva"] * 1000.0
    if sr_kva > 3150.0:
        # tab. I.7 — transformatory dużej mocy (tu wyłącznie WN 110 kV, olejowe)
        assert params["voltage_hv_kv"] > 36.0
        return _pei_procent(params["p0_kw"], params["pk_kw"], sr_kva) < _pei_min_tab_i7(
            params["rated_power_mva"]
        )
    # tab. I.1/I.2 bez korekty I.3: strona dolna <= 1,1 kV, górna Um <= 24 kV
    assert params["voltage_lv_kv"] <= 1.1 and params["voltage_hv_kv"] <= 24.0
    rodzaj = tr.rodzaj_izolacji_transformatora(params["cooling_class"])
    assert rodzaj is not None, params
    pulap = tr.pulap_strat_tier2_w(rodzaj, sr_kva)
    assert pulap is not None
    pk_max_w, p0_max_w = pulap
    return params["pk_kw"] * 1000.0 > pk_max_w + 1e-6 or params["p0_kw"] * 1000.0 > p0_max_w + 1e-6


@pytest.mark.parametrize("rekord", tr.get_all_transformer_types(), ids=lambda r: str(r["id"]))
def test_znacznik_przekroczenia_wtedy_i_tylko_wtedy_gdy_niezgodny_z_tier2(
    rekord: dict[str, Any],
) -> None:
    params = rekord["params"]
    niezgodny = _niezgodny_z_tier2(params)
    znacznik = tr.ZNACZNIK_PRZEKROCZENIA_TIER2 in params.get("verification_note", "")
    assert znacznik == niezgodny, (rekord["id"], niezgodny)
    if niezgodny:
        assert params["verification_status"] != ZWERYFIKOWANY, rekord["id"]


def test_pomiar_przekroczen_tier2() -> None:
    """Pomiar 2026-10-15: 50 pozycji przekracza Tier 2 (10 WN/SN + 24 SN/nN jednostek
    istniejących + 16 polskich deklaracji); 193 są zgodne (192 normatywne — po rundzie 3
    także 18 blokowych 0,48 kV, po karcie KATALOG-TURBINY-TOR-V112 także 18 blokowych
    0,65 kV — + karta Siemens GEAFOL Neo, której straty gwarantowane są równe pułapowi)."""
    wszystkie = tr.get_all_transformer_types()
    niezgodne = [r["id"] for r in wszystkie if _niezgodny_z_tier2(r["params"])]
    assert len(wszystkie) == 243
    assert len(niezgodne) == 50


@pytest.mark.parametrize(
    "rekord",
    tr.TRANSFORMER_SN_NN_04_TIER2 + tr.TRANSFORMER_SN_NN_INVERTER_BLOCK,
    ids=lambda r: str(r["id"]),
)
def test_pozycja_normatywna_ma_straty_rowne_pulapowi_i_u_k_serii(rekord: dict[str, Any]) -> None:
    params = rekord["params"]
    sr_kva = round(params["rated_power_mva"] * 1000.0)
    rodzaj = tr.rodzaj_izolacji_transformatora(params["cooling_class"])
    assert rodzaj is not None
    pk_max_w, p0_max_w = tr.pulap_strat_tier2_w(rodzaj, float(sr_kva)) or (0.0, 0.0)
    # równe pułapowi z dokładnością do zaokrąglenia w dół (0,1 W), nigdy powyżej
    assert 0.0 <= pk_max_w - params["pk_kw"] * 1000.0 < 0.1 + 1e-6
    assert 0.0 <= p0_max_w - params["p0_kw"] * 1000.0 < 0.1 + 1e-6
    uk, i0 = tr.GEAFOL_24KV_UK_I0_PROC[sr_kva]
    assert params["uk_percent"] == uk
    assert params["i0_percent"] == (i0 if rodzaj == tr.RODZAJ_SUCHY else None)
    assert "manufacturer" not in params
    assert "NORMATYWNA/TYPOWA — nie egzemplarz producenta" in params["verification_note"]


@pytest.mark.parametrize(
    ("rekord_id", "pk_kw", "p0_kw", "uk", "i0"),
    [
        # tab. I.2 sucha 1000 kVA: 9000 / 1395 W; GEAFOL 6 % / 0,6 %
        ("tr-sn-nn-15-04-1000kva-dyn11-tier2-suchy", 9.0, 1.395, 6.0, 0.6),
        # tab. I.1 olejowa 800 kVA: 6000 / 585 W; i0 bez źródła
        ("tr-sn-nn-20-04-800kva-dyn11-tier2-olej", 6.0, 0.585, 6.0, None),
        # tab. I.1 olejowa 3150 kVA: 23000 / 1980 W; u_k 8 %
        ("tr-sn-nn-15-04-3150kva-dyn11-tier2-olej", 23.0, 1.98, 8.0, None),
        # tab. I.2 sucha 500 kVA — interpolacja 400..630: Pk 5630,43 W, P0 811,96 W
        ("tr-sn-nn-15-0p69-0p5mva-dyn11-inverter", 5.6304, 0.8119, 6.0, 0.8),
        # tab. I.2 sucha 2500 kVA blokowa
        ("tr-sn-nn-20-0p385-2p5mva-dyn11-inverter", 19.0, 2.79, 6.0, 0.5),
    ],
)
def test_wartosci_literalne_pozycji_normatywnych(
    rekord_id: str, pk_kw: float, p0_kw: float, uk: float, i0: float | None
) -> None:
    params = {r["id"]: r["params"] for r in tr.get_all_transformer_types()}[rekord_id]
    assert params["pk_kw"] == pytest.approx(pk_kw, abs=1e-9)
    assert params["p0_kw"] == pytest.approx(p0_kw, abs=1e-9)
    assert params["uk_percent"] == uk
    assert params["i0_percent"] == i0


def test_karta_producenta_transformatora_cytuje_dokument() -> None:
    karta = {r["id"]: r for r in tr.TRANSFORMER_KARTY_PRODUCENTOW}[
        "tr-sn-nn-20-0p48-2mva-dyn11-siemens-geafol-neo-4gy6364"
    ]["params"]
    assert karta["verification_status"] == ZWERYFIKOWANY
    assert "4GY6364-1EC" in karta["source_reference"]
    assert (karta["pk_kw"], karta["p0_kw"], karta["uk_percent"]) == (16.0, 2.34, 6.0)
    assert karta["i0_percent"] is None  # karta nie podaje prądu jałowego


# ---------------------------------------------------------------------------
# Każda potrzeba szablonów × pozycja (katalog_dane/POTRZEBY.md, pomiar 2026-10-15)
# ---------------------------------------------------------------------------


def _transformatory(hv: float, lv: float) -> list[dict[str, Any]]:
    return [
        r["params"]
        for r in tr.get_sn_nn_transformer_types()
        if r["params"]["voltage_hv_kv"] == hv and r["params"]["voltage_lv_kv"] == lv
    ]


@pytest.mark.parametrize("s_wymagana_mva", [0.55, 1.1, 2.2])
def test_potrzeby_b_transformator_blokowy_15_0p69_istnieje(s_wymagana_mva: float) -> None:
    """B1–B3: najmniejsza pozycja 15/0,69 kV o S_n >= S_wymaganej istnieje i ma źródło."""
    kandydaci = [p for p in _transformatory(15.0, 0.69) if p["rated_power_mva"] >= s_wymagana_mva]
    assert kandydaci, s_wymagana_mva
    najmniejsza = min(kandydaci, key=lambda p: p["rated_power_mva"])
    assert _rodzaj_zrodla(najmniejsza["source_reference"]) == "NORMATYWNA"


def test_potrzeby_b4_transformator_powyzej_3150_kva_zablokowany_danymi() -> None:
    """B4 (turbina 3 MW, S = 3,3 MVA): powyżej 3150 kVA rozporządzenie podaje tylko PEI,
    a żadne dołączone źródło nie podaje u_k — pozycji NIE MA. Pin nieobecności: dopisanie
    pozycji ze źródłem zmienia ten test świadomie."""
    assert not [p for p in _transformatory(15.0, 0.69) if p["rated_power_mva"] >= 3.3]
    assert max(p["rated_power_mva"] for p in _transformatory(15.0, 0.69)) == 3.15


@pytest.mark.parametrize(
    ("hv", "moc_kva"),
    [(15.0, m) for m in (63, 100, 160, 250, 400, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150)]
    + [(20.0, m) for m in (400, 630, 800, 1000, 1250, 2000, 2500, 3150)],
)
def test_potrzeby_c_transformator_stacyjny_kazdej_mocy_istnieje(hv: float, moc_kva: int) -> None:
    """C + luki mocy karty (15/0,4: 800, 3150; 20/0,4: 800, 2000, 2500, 3150)."""
    moce = {round(p["rated_power_mva"] * 1000) for p in _transformatory(hv, 0.4)}
    assert moc_kva in moce


@pytest.mark.parametrize(
    "rekord_id",
    [f"tr-sn-nn-15-04-{m}kva-dyn11" for m in (63, 100, 160, 250, 400, 630, 1000, 1250, 1600)]
    + ["tr-sn-nn-15-04-2000kva-dyn11", "tr-sn-nn-15-04-2500kva-dyn11"]
    + [f"tr-sn-nn-20-04-{m}kva-dyn11" for m in (400, 630, 1000, 1250)],
)
def test_potrzeby_c_identyfikatory_istniejace_zachowane(rekord_id: str) -> None:
    ids = {r["id"] for r in tr.get_all_transformer_types()}
    assert rekord_id in ids


@pytest.mark.parametrize(
    "rekord_id",
    [
        "conv-pv-nn-0p5mw-0p69kv",
        "conv-pv-nn-1mw-0p69kv",
        "conv-pv-nn-2mw-0p69kv",
        "conv-bess-nn-0p5mw-0p69kv",
        "conv-bess-nn-1mw-0p69kv",
        "conv-bess-nn-2mw-0p69kv",
        "conv-wind-nn-2mw-0p69kv",
        "conv-wind-nn-3mw-0p69kv",
        "conv-pv-residential-50kw-04kv",
    ],
)
def test_potrzeby_f_identyfikatory_istniejace_maja_proweniencje(rekord_id: str) -> None:
    params = {r["id"]: r["params"] for r in konw.get_all_converter_types()}[rekord_id]
    assert _rodzaj_zrodla(params["source_reference"]) == "MODEL_REFERENCYJNY"
    assert not konw.dopuszczona_do_doboru_szablonu(params)


@pytest.mark.parametrize(
    "rekord_id",
    [
        # turbina ok. 1 MW: źródła nie podają napięcia generatora ani S_n
        "conv-wind-nn-1mw-0p69kv",
        # falowniki prosumenckie 5/30 kW: brak karty producenta w zebranych danych
        # (10 kW ma pozycje z kart: SMA STP10.0-3AV-40, Fronius Symo 10.0-3-M — pod
        # identyfikatorami producenta, nie pod identyfikatorem mocy)
        "conv-pv-nn-5kw-0p4kv",
        "conv-pv-nn-10kw-0p4kv",
        "conv-pv-nn-30kw-0p4kv",
    ],
)
def test_potrzeby_pozycje_zablokowane_danymi_nie_istnieja(rekord_id: str) -> None:
    """Pin NIEOBECNOŚCI pozycji zablokowanych danymi (POTRZEBY.md, „Nadane
    identyfikatory"): pozycja bez źródła nie może powstać z wymyślonych liczb."""
    repo = get_default_mv_catalog()
    assert rekord_id not in repo.converter_types


def test_karta_producenta_pv_pokrywa_moce_wymagane_szablonami() -> None:
    """Pozycje z kart producentów dopuszczone do doboru: najmniejsza moc 330 kVA
    (Huawei), następnie 2,2 / 2,475 MVA (SMA) — mają odpowiadające transformatory blokowe
    o tym samym napięciu strony nN (oprócz SC UP > 3150 kVA, zablokowanych danymi)."""
    for rekord in konw.CONVERTER_PV_NN_KARTY_PRODUCENTOW:
        params = rekord["params"]
        bloki = [
            p
            for p in _transformatory(15.0, params["un_kv"])
            if p["rated_power_mva"] >= params["sn_mva"]
        ]
        if params["sn_mva"] > 3.15:
            assert not bloki, rekord["id"]
        else:
            assert bloki, rekord["id"]


# ---------------------------------------------------------------------------
# Brak funkcji szacujących
# ---------------------------------------------------------------------------


def test_brak_funkcji_szacujacych_w_katalogu() -> None:
    wzorzec = re.compile(r"def\s+_?(estimate\w*|\w*szacuj\w*|\w*oszacuj\w*)\s*\(")
    trafienia = []
    for plik in sorted(_KATALOG_SRC.rglob("*.py")):
        for numer, linia in enumerate(plik.read_text(encoding="utf-8").splitlines(), 1):
            if wzorzec.search(linia):
                trafienia.append(f"{plik.name}:{numer}: {linia.strip()}")
    assert trafienia == []


# ---------------------------------------------------------------------------
# Runda 3: kopie kart, magazyny, małe falowniki, flagi certyfikatu, źródło jawne wszędzie
# ---------------------------------------------------------------------------


def _surowe_rekordy_wszystkich_katalogow() -> list[tuple[str, dict[str, Any]]]:
    """Surowe rekordy WSZYSTKICH rodzin, z których składa się katalog domyślny
    (`repository.get_default_mv_catalog`) — to samo wejście, które czyta repozytorium."""
    from network_model.catalog import mv_auxiliary_catalog as aux
    from network_model.catalog import mv_benchmark_catalog as bench
    from network_model.catalog import mv_bess_battery_catalog as bat
    from network_model.catalog import mv_cable_line_catalog as cl
    from network_model.catalog import mv_ptpiree_catalog as pt
    from network_model.catalog import mv_shunt_capacitor_catalog as sc
    from network_model.catalog import mv_source_catalog as so
    from network_model.catalog import mv_surge_arrester_catalog as sa
    from network_model.catalog import mv_switch_catalog as sw

    zrodla = (
        cl.get_all_line_types,
        bench.get_all_benchmark_line_records,
        cl.get_all_cable_types,
        tr.get_all_transformer_types,
        bench.get_all_benchmark_transformer_records,
        sw.get_all_switch_equipment_types,
        konw.get_all_converter_types,
        bat.get_all_bess_battery_types,
        aux.get_all_protection_device_types,
        aux.get_all_protection_curves,
        aux.get_all_protection_setting_templates,
        aux.get_all_lv_cable_types,
        aux.get_all_load_types,
        aux.get_all_lv_apparatus_types,
        aux.get_all_lv_breaker_mcb_types,
        aux.get_all_lv_fuse_link_types,
        aux.get_all_ct_types,
        aux.get_all_vt_types,
        so.get_all_source_system_types,
        sa.get_all_surge_arrester_types,
        sc.get_all_shunt_capacitor_records,
        bench.get_all_benchmark_shunt_capacitor_records,
        bench.get_all_benchmark_synchronous_generator_records,
        pt.get_all_ptpiree_generator_certificates,
    )
    rekordy: list[tuple[str, dict[str, Any]]] = []
    for funkcja in zrodla:
        for rekord in funkcja():
            params = rekord.get("params", rekord)
            rekordy.append((f"{funkcja.__name__}:{rekord.get('id')}", {**rekord, **params}))
    return rekordy


def test_kazdy_surowy_rekord_kazdego_katalogu_ma_jawne_zrodlo() -> None:
    """Źródło domyślne typu (`_catalog_metadata_kwargs(default_source_reference=…)`) nie
    może zastępować źródła pozycji: każdy rekord danych niesie `source_reference` jawnie
    (przed rundą 3: 3 obciążenia bez źródła, 2 baterie z ogólnikiem „profil przemysłowy").
    Pomiar 2026-10-15: 7851 = 7829 + 18 transformatorów blokowych 0,65 kV + 4 warianty
    Vestas V112 (karta KATALOG-TURBINY-TOR-V112). Pomiar 2026-10-22: 7853 = 7851 + 2 typy
    minimalne łączników 110 kV karty KATALOG-APARATURA-WN (wyłącznik, odłącznik). Pomiar
    2026-10-28: 7855 = 7853 + 2 rozłączniki próżniowe typu ogólnego karty
    UX-04/POLE-LINIOWE-WZORZEC. Pomiar 2026-10-29: 7857 = 7855 + 2 przekładniki prądowe typu
    ogólnego OSD pól liniowych GPZ (ENEA Z.10/Z.11.1 i Z.11) tej samej karty."""
    rekordy = _surowe_rekordy_wszystkich_katalogow()
    assert len(rekordy) == 7857
    bez_zrodla = [klucz for klucz, dane in rekordy if not str(dane.get("source_reference") or "")]
    assert bez_zrodla == []


def test_flaga_certyfikatu_wymaga_zrodla_z_dokumentem_we_wszystkich_katalogach() -> None:
    """Flaga `ptpire_certified` ⇒ źródło z adresem dokumentu i datą dostępu — dla KAŻDEJ
    rodziny katalogu. Pomiar rundy 3: flag bez dokumentu było 8 (kable) + 12 (aparatura,
    jedno miejsce w kodzie) + 16 (transformatory, runda 1) — wszystkie zdjęte."""
    flagowane = [
        (klucz, str(dane.get("source_reference") or ""))
        for klucz, dane in _surowe_rekordy_wszystkich_katalogow()
        if dane.get("ptpire_certified")
    ]
    bez_dokumentu = [
        klucz for klucz, zrodlo in flagowane if not ("https://" in zrodlo and "(dostęp " in zrodlo)
    ]
    assert bez_dokumentu == []


def test_flaga_certyfikatu_bez_dokumentu_bylaby_wykryta() -> None:
    """Sprawdzian samego predykatu na rekordzie syntetycznym (deklaracja bez testu = fałszywa
    pewność): flaga z ogólnikowym źródłem nie przechodzi."""
    zrodlo = "ZPUE Włoszczowa Rotoblok katalog 2024 / PTPiREE WiPWC"
    assert not ("https://" in zrodlo and "(dostęp " in zrodlo)


@pytest.mark.parametrize(
    ("rodzina", "prefiks_id", "liczba"),
    [("kable", "cable-polish-", 8), ("aparatura", "sw-", 12)],
)
def test_pozycje_deklarowane_polskich_producentow_niezweryfikowane(
    rodzina: str, prefiks_id: str, liczba: int
) -> None:
    repo = get_default_mv_catalog()
    typy = repo.list_cable_types() if rodzina == "kable" else repo.list_switch_equipment_types()
    deklarowane = [
        t.to_dict()
        for t in typy
        if t.to_dict()["id"].startswith(prefiks_id)
        and str(t.to_dict()["source_reference"]).startswith("Deklarowane: ")
    ]
    assert len(deklarowane) == liczba
    for dane in deklarowane:
        assert dane["verification_status"] == NIEWERYFIKOWANY, dane["id"]
        assert dane["catalog_status"] == CatalogStatus.REFERENCYJNY_V1.value, dane["id"]
        assert "PTPiREE" in dane["verification_note"], dane["id"]


def test_bateria_bez_zrodla_nie_powstaje_a_pozycje_to_model_referencyjny() -> None:
    from network_model.catalog import mv_bess_battery_catalog as bat

    with pytest.raises(TypeError, match="source_reference"):
        bat._battery_record(  # type: ignore[call-arg]
            item_id="x",
            name="x",
            chemistry="LFP",
            capacity_kwh=1.0,
            nominal_voltage_dc_v=1.0,
            c_rate=0.5,
            note="x",
        )
    baterie = get_default_mv_catalog().list_bess_battery_types()
    assert len(baterie) == 2  # Sungrow ST2752UX zablokowany danymi (brak U_DC zn., C-rate)
    for bateria in baterie:
        assert bateria.source_reference == konw.ZRODLO_MODELU_REFERENCYJNEGO
        assert bateria.verification_status == REFERENCYJNY


#: Iloczyn: pozycja z dokumentu producenta × kanał dokumentu (producent / kopia) × status
#: × dopuszczenie do doboru × jakość pól karty — wartości literalne z dokumentów.
_RUNDA_3 = [
    # (id, kanał, un_kv, sn_mva, pmax_mw, |Q| albo None, e_kwh albo None)
    ("conv-pv-nn-sma-stp8p0-3av-40-0p4kv", "KARTA_PRODUCENTA", 0.4, 0.008, 0.008, 0.0048, None),
    ("conv-pv-nn-sma-stp10p0-3av-40-0p4kv", "KARTA_PRODUCENTA", 0.4, 0.01, 0.01, 0.006, None),
    ("conv-pv-nn-fronius-symo-10p0-3-m-0p4kv", "KOPIA_KARTY", 0.4, 0.01, 0.01, 0.01, None),
    ("conv-bess-nn-tesla-megapack-2xl-2h-c010-0p48kv", "KOPIA_KARTY", 0.48, 2.4, 1.927, None, 3854),
    (
        "conv-bess-nn-tesla-megapack-2xl-4h-c010-0p48kv",
        "KOPIA_KARTY",
        0.48,
        1.32,
        0.979,
        None,
        3916,
    ),
    (
        "conv-bess-nn-tesla-megapack-2xl-4h-c012-0p48kv",
        "KOPIA_KARTY",
        0.48,
        1.32,
        1.075,
        None,
        4300,
    ),
]


@pytest.mark.parametrize(
    ("rekord_id", "kanal", "un_kv", "sn_mva", "pmax_mw", "q_mvar", "e_kwh"), _RUNDA_3
)
def test_pozycje_rundy_3_z_dokumentu_producenta(
    rekord_id: str,
    kanal: str,
    un_kv: float,
    sn_mva: float,
    pmax_mw: float,
    q_mvar: float | None,
    e_kwh: float | None,
) -> None:
    from solver_input.provenance import resolve_card_field_quality_map

    repo = get_default_mv_catalog()
    typ = repo.converter_types[rekord_id]
    params = {r["id"]: r["params"] for r in konw.get_all_converter_types()}[rekord_id]
    assert _rodzaj_zrodla(params["source_reference"]) == kanal
    assert (typ.un_kv, typ.sn_mva, typ.pmax_mw) == (un_kv, sn_mva, pmax_mw)
    if q_mvar is None:
        # karta nie podaje zakresu Q ani cos φ — pola puste, nie zgadywane
        assert (typ.qmin_mvar, typ.qmax_mvar, typ.cosphi_min, typ.cosphi_max) == (None,) * 4
    else:
        assert (typ.qmin_mvar, typ.qmax_mvar) == (-q_mvar, q_mvar)
    assert typ.e_kwh == e_kwh
    z_kanalu_producenta = kanal == "KARTA_PRODUCENTA"
    assert konw.dopuszczona_do_doboru_szablonu(params) is z_kanalu_producenta
    jakosc = resolve_card_field_quality_map(typ)
    oczekiwana = "DATASHEET" if z_kanalu_producenta else "ESTIMATED"
    for pole in ("un_kv", "sn_mva", "pmax_mw"):
        assert jakosc[pole].quality.value == oczekiwana, (rekord_id, pole)
    if e_kwh is not None:
        # magazyn zintegrowany: projekcja BESS powstaje (wymaga e_kwh)
        assert rekord_id in {t.id for t in repo.list_bess_inverter_types()}


def test_zablokowane_danymi_po_rundzie_3() -> None:
    """Pin nieobecności: magazyn Sungrow ST2752UX (karta wstępna, brak napięcia DC
    znamionowego i C-rate), transformatory > 3150 kVA."""
    repo = get_default_mv_catalog()
    assert not any("st2752" in i.lower() for i in repo.bess_battery_types)
    assert not any("st2752" in i.lower() for i in repo.converter_types)
    assert (
        max(t.rated_power_mva for t in repo.list_transformer_types() if t.voltage_lv_kv <= 1.1)
        == 3.15
    )


def _rekordy_z_dokumentu_producenta() -> list[dict[str, Any]]:
    """Pozycje, których dane pochodzą z dokumentu producenta (karta albo jej kopia)."""
    return [
        r
        for r in konw.get_all_converter_types()
        if _rodzaj_zrodla(r["params"]["source_reference"]) in {"KARTA_PRODUCENTA", "KOPIA_KARTY"}
    ]


def test_pozycja_z_dokumentu_producenta_obecna_w_wykazie_ptpiree_jest_powiazana() -> None:
    """KLASA: pole `model` pozycji z dokumentu producenta niesie OZNACZENIE TYPU, pod którym
    urządzenie figuruje w wykazie PTPiREE. Nazwa handlowa z oznaczeniem w nawiasie
    („Sunny Central 2200 (SC-2200-10)") nie trafiała w żaden klucz wykazu i dawała fałszywy
    NIEPOWIAZANY certyfikowanemu falownikowi. Wykrycie niezależne od dopasowania
    produkcyjnego: oznaczenie typu (ostatni człon klucza wykazu) zawarte w złożonej nazwie
    modelu pozycji tego samego producenta ⇒ pozycja musi być POWIAZANY."""
    wykaz = get_all_ptpiree_generator_certificates()
    rekordy = _rekordy_z_dokumentu_producenta()
    # Pomiar 2026-10-15: 9 kart producentów PV (SMA SC, SMA STP, Huawei) + 4 kopie kart
    # (Fronius Symo, 3 × Tesla Megapack 2 XL) + 3 kopie dokumentów Vestas V112 (karta
    # KATALOG-TURBINY-TOR-V112; żadna turbina V112 nie figuruje w wykazie PTPiREE).
    assert len(rekordy) == 16
    for rekord in rekordy:
        params = rekord["params"]
        model = normalize_ptpiree_key(params["model"])
        trafienia = [
            w["id"]
            for w in wykaz
            if manufacturers_match(params["manufacturer"], w["params"]["manufacturer"])
            and any(
                re.search(rf"(^| ){re.escape(klucz)}($| )", model)
                for klucz in model_match_keys(w["params"]["model"])[-1:]
            )
        ]
        if trafienia:
            assert params["ptpiree_status"] == "POWIAZANY", (rekord["id"], trafienia)


def test_oznaczenie_typu_w_nawiasie_byloby_wykryte() -> None:
    """Iniekcja: dawny zapis modelu (nazwa handlowa + oznaczenie w nawiasie) nie trafia
    w wykaz, a detektor klasy go widzi."""
    zapis = "Sunny Central 2200 (SC-2200-10)"
    assert match_ptpiree_certificate(manufacturer="SMA", model=zapis) is None
    assert re.search(r"(^| )SC 2200 10($| )", normalize_ptpiree_key(zapis))
    assert match_ptpiree_certificate(manufacturer="SMA", model="SC 2200-10") is not None
