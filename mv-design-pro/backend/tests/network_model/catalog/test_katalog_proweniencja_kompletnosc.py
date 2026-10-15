"""Karta KATALOG-KOMPLETNY-PROWENIENCJA — kompletność katalogu i proweniencja każdej wartości.

Iloczyn cech (reguła KLASA, NIE INSTANCJA):

* każda pozycja (transformator × przekształtnik × turbina) × ma źródło, a RODZAJ źródła
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
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.types import CatalogStatus, CatalogVerificationStatus
from network_model.catalog.wind_turbines.catalog import (
    WindTurbineCatalogEntry,
    list_wind_turbines,
)
from pydantic import ValidationError

ZWERYFIKOWANY = CatalogVerificationStatus.ZWERYFIKOWANY.value
NIEWERYFIKOWANY = CatalogVerificationStatus.NIEWERYFIKOWANY.value
REFERENCYJNY = CatalogVerificationStatus.REFERENCYJNY.value

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
    if "https://" in zrodlo and "(dostęp " in zrodlo:
        return "KARTA_PRODUCENTA"
    raise AssertionError(f"nierozpoznany rodzaj źródła: {zrodlo!r}")


_STATUS_WG_RODZAJU = {
    "MODEL_REFERENCYJNY": (REFERENCYJNY, CatalogStatus.REFERENCYJNY_V1.value),
    "NORMATYWNA": (REFERENCYJNY, CatalogStatus.REFERENCYJNY_V1.value),
    "DEKLAROWANA": (NIEWERYFIKOWANY, CatalogStatus.REFERENCYJNY_V1.value),
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


def test_kazda_turbina_ma_zrodlo_i_status_modelu_referencyjnego() -> None:
    turbiny = list_wind_turbines()
    assert len(turbiny) == 19
    for turbina in turbiny:
        assert _rodzaj_zrodla(turbina.source_reference) == "MODEL_REFERENCYJNY"
        assert turbina.verification_status == REFERENCYJNY


def test_przyszla_pozycja_bez_zrodla_jest_odrzucana_w_kazdym_katalogu() -> None:
    """Pozycja dopisana bez źródła NIE dostaje źródła domyślnego — trzy wejścia klasy."""
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
    # turbina: pola proweniencji wymagane
    pola = WindTurbineCatalogEntry.model_fields
    assert pola["source_reference"].is_required()
    assert pola["verification_status"].is_required()
    dane = list_wind_turbines()[0].model_dump()
    dane.pop("source_reference")
    with pytest.raises(ValidationError):
        WindTurbineCatalogEntry(**dane)


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
    istniejących + 16 polskich deklaracji); 157 jest zgodnych (156 normatywnych + karta
    Siemens GEAFOL Neo, której straty gwarantowane są równe pułapowi)."""
    wszystkie = tr.get_all_transformer_types()
    niezgodne = [r["id"] for r in wszystkie if _niezgodny_z_tier2(r["params"])]
    assert len(wszystkie) == 207
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
        # falowniki prosumenckie 5/10/30 kW: brak karty producenta w zebranych danych
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
