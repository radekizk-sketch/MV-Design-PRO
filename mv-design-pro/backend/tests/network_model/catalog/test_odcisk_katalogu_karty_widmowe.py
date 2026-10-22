"""Odcisk katalogu po karcie AB-H0 — zmiana WYŁĄCZNIE tam, gdzie zmieniły się dane.

Reguły ``network_model.catalog.odcisk`` (wzorzec ``enm/hash.py``):

* pola karty w projekcjach PV/BESS są w zrzucie WYŁĄCZNIE, gdy niosą wartość;
* skasowane ``ConverterType.harmonic_spectrum_percent`` zostaje w zrzucie jako ``null``
  (176/176 pozycji miało ``None`` — kasacja pola nie jest zmianą danych);
* pusta przestrzeń kart widmowych nie wchodzi do zrzutu; pierwsza karta zmienia odcisk.

Test kotwiczący: zrzut dzisiejszego katalogu z WYCIĘTYMI polami karty projekcji daje
DOKŁADNIE odcisk sprzed karty (``ODCISK_SPRZED_KARTY`` — wartość zamrożona w fiksturach
harnessu ``frontend/src/harness-fixtures/generated/*.json`` przed tą kartą). Zmiana odcisku
jest więc w całości wyjaśniona wzbogaceniem trzech projekcji kart referencyjnych.
"""

from __future__ import annotations

import dataclasses
import hashlib
import json

from network_model.catalog.odcisk import _kanon, odcisk_katalogu, zrzut_kanoniczny
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.types import POLA_KARTY_PROJEKCJI

from tests.dziedziny import fabryki as f

#: Karta PL-ZNAKI (2026-09-24): odcisk przeliczony po poprawie zapisu tekstów katalogu
#: (polskie znaki w nazwach, notach, źródłach). Dowód liść po liściu: zrzut kanoniczny
#: sprzed i po karcie ma IDENTYCZNY zbiór kluczy, a różnią się wyłącznie liście tekstowe
#: (source_reference 7533, verification_note 578, ptpiree_note 304, note 42, source_ref 42,
#: name 36, data_source 22, name_pl 12, notes_pl 10) — żadna liczba ani identyfikator.
#: Poprzednia wartość: 0115ee1a3faf1c42a814ef7cf160e7277ae2f926b1fdb48aced9919e0d6b2d95.
#: Karta BIEG-ZABEZPIECZEN-Z-MODELU (2026-09-30, PZ-09): odcisk przeliczony po nadaniu zakresom
#: prądowym szablonów nastaw nazwanego stanu jednostki. Dowód liść po liściu (zrzut kanoniczny
#: baza `3840e239` vs drzewo karty): różnią się WYŁĄCZNIE liście
#: `protection_setting_templates/<szablon>/setting_fields[i]` pól I>, I>>, I0>, I0>> — 13 razy
#: `unit`: "A" → null i 13 nowych kluczy `jednostka_status`: "NIEUSTALONA" w 8 szablonach;
#: żadna liczba ani identyfikator. Poprzednia wartość:
#: ab3da79f495b3c17fec0d89f964a7c0b063b5d776e6e0e7e5ec6e609d2f0d455.
#: Karta KATALOG-KOMPLETNY-PROWENIENCJA (2026-10-15): odcisk przeliczony po nadaniu każdej
#: pozycji źródła i statusu z jego rodzaju oraz po zastąpieniu szacunku transformatorów
#: blokowych pułapami Tier 2. Dowód liść po liściu (zrzut kanoniczny z wyciętymi polami karty
#: projekcji, baza `c136c6bbd` vs drzewo karty):
#: transformer_types +85 / −70 identyfikatorów (−70: 4,0/5,0 MVA i strona dolna 3,15/6/6,3 kV
#: dawnego szacunku; +85: 48 pozycji Tier 2 0,4 kV, 36 blokowych 0,385/0,434 kV, karta GEAFOL
#: Neo), 122 zmienione: liczby WYŁĄCZNIE w 72 zachowanych pozycjach blokowych
#: (0,5/0,69/0,8/1,0 kV × 500–3150 kVA × 15/20 kV: p0_kw, pk_kw, i0_percent po 72,
#: uk_percent 24), teksty source_reference 122, verification_note 122, name 72,
#: manufacturer 72, cooling_class 75, statusy 50+50 (jednostki istniejące i polskie);
#: converter_types +7 / −1 (karty SMA/Huawei; bess_pcs_sma_2200), 175 zmienionych wyłącznie
#: tekstowo (source_reference 175, verification_note 37, verification_status 3,
#: card_field_status quality/source_ref/note po 33, nowy klucz e_kwh 1);
#: pv_inverter_types +7, 66 zmienionych tekstowo; bess_inverter_types −1, 63 zmienione
#: tekstowo. Poprzednia wartość:
#: a5337e4acef0664f0d68b262ae3d62f5169e994c084fc7c08091d96443111dd6.
#: Druga część karty KATALOG-KOMPLETNY-PROWENIENCJA (2026-10-15, runda 3 danych): dowód liść
#: po liściu (zrzut z wyciętymi polami karty projekcji, baza `b1f5aad60` vs drzewo):
#: converter_types +6 (SMA STP 8.0/10.0-3AV-40, Fronius Symo 10.0-3-M, 3 × Tesla Megapack 2
#: XL), 6 zmienionych — `model` SMA SC 2200-10, SC 2475-10, SC 4000/4200/4400/4600 UP
#: (oznaczenie typu z karty zamiast nazwy handlowej) i w ślad za nim 9 kluczy `ptpiree_*`
#: (NIEPOWIAZANY → POWIAZANY); pv_inverter_types +3, 6 zmienionych (te same klucze
#: `ptpiree_*`); bess_inverter_types +3;
#: transformer_types +18 (blokowe 0,48 kV); cable_types 8 i switch_equipment_types 12 oraz
#: mv_apparatus_types 12 zmienionych wyłącznie w verification_status, catalog_status,
#: source_reference, verification_note (pozycje deklarowane polskich producentów);
#: bess_battery_types 2 i load_types 3 — wyłącznie source_reference. Żadna liczba nie
#: zmieniła się w żadnej istniejącej pozycji. Poprzednia wartość:
#: af5870bada5cec0c5e006883de568982ba1c2874335a50200426444791a563f0.
#: Karta KATALOG-TURBINY-TOR-V112 (2026-10-15): dowód liść po liściu (baza `2dc3c7044` vs
#: drzewo): converter_types +4 (Vestas V112-3.0 PMSG, V112-3.3 PMSG, V112-3.3 klatkowy,
#: V112-3.45 klatkowy — tor maszyny jako pola addytywne `POLA_TORU_MASZYNY`, poza odciskiem
#: pozycji, które ich nie niosą), transformer_types +18 (blokowe 0,65 kV); 0 zmienionych
#: pozycji istniejących. Poprzednia wartość:
#: 001314a4d39aaad8faedd59a538eb8a06888ac2b4305776208247d2a4ee425cc.
ODCISK_SPRZED_KARTY = "1a8bcd4ba4a73c5dfb14a1f0315f82492a820cbb785226991432f8636f0cae56"
#: Karta W5-E-TTIT (2026-09-30, scalona w partii 9): nowa przestrzeń `lv_rcd_types` (56
#: rekordów RCCB, IEC 61008-1). Dowód: zrzut kanoniczny BEZ tej przestrzeni daje DOKŁADNIE
#: `ODCISK_SPRZED_KARTY` (żadna inna przestrzeń ani liść nie zmieniły się), a z nią — wartość
#: poniżej (przeliczona na drzewie partii 9, po katalogu z proweniencją i torze V112).
ODCISK_PO_W5E_TTIT = "e83ee88bce1a45b0ef7e57931612c100764968c4fcd42281b133215fc3b1c062"
#: Karta LINIA-110 (2026-10-22): nowa przestrzeń `overhead_conductor_types` (4 przewody linii
#: 110 kV z tablicy PN-EN 50182). Dowód: zrzut BEZ tej przestrzeni daje DOKŁADNIE
#: `ODCISK_PO_W5E_TTIT` (żadna inna przestrzeń ani liść nie zmieniły się), a z nią — wartość
#: poniżej.
ODCISK_PO_LINIA_110 = "4f66d5626e211540eb1f1afe34d6da1d90ec50800758e208893e7383f51e9f44"
PROJEKCJE = ("pv_inverter_types", "bess_inverter_types")


def _odcisk_zrzutu(zrzut: dict[str, object]) -> str:
    tekst = json.dumps(
        zrzut, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=_kanon
    )
    return hashlib.sha256(tekst.encode("utf-8")).hexdigest()


def test_zmiana_odcisku_wylacznie_z_pol_karty_projekcji() -> None:
    zrzut = zrzut_kanoniczny(get_default_mv_catalog())
    wzbogacone = []
    for przestrzen in PROJEKCJE:
        for typ_id, postac in zrzut[przestrzen].items():  # type: ignore[attr-defined]
            if any(nazwa in postac for nazwa in POLA_KARTY_PROJEKCJI):
                wzbogacone.append(typ_id)
            for nazwa in POLA_KARTY_PROJEKCJI:
                postac.pop(nazwa, None)
    assert sorted(wzbogacone) == [
        "conv-bess-card-sungrow-sc2000ud-mv",
        "conv-bess-nn-tesla-megapack-2xl-2h-c010-0p48kv",
        "conv-bess-nn-tesla-megapack-2xl-4h-c010-0p48kv",
        "conv-bess-nn-tesla-megapack-2xl-4h-c012-0p48kv",
        "conv-pv-card-huawei-sun2000-215ktl",
        "conv-pv-card-sungrow-sg3150u-mv",
        "conv-pv-nn-fronius-symo-10p0-3-m-0p4kv",
        "conv-pv-nn-huawei-sun2000-330ktl-h1-0p8kv",
        "conv-pv-nn-sma-sc2200-0p385kv",
        "conv-pv-nn-sma-sc2475-0p434kv",
        "conv-pv-nn-sma-sc4000up-0p6kv",
        "conv-pv-nn-sma-sc4200up-0p63kv",
        "conv-pv-nn-sma-sc4400up-0p66kv",
        "conv-pv-nn-sma-sc4600up-0p69kv",
        "conv-pv-nn-sma-stp10p0-3av-40-0p4kv",
        "conv-pv-nn-sma-stp8p0-3av-40-0p4kv",
    ]
    assert _odcisk_zrzutu(zrzut) == ODCISK_PO_LINIA_110
    bez_przewodow_wn = {
        przestrzen: postac
        for przestrzen, postac in zrzut.items()
        if przestrzen != "overhead_conductor_types"
    }
    assert _odcisk_zrzutu(bez_przewodow_wn) == ODCISK_PO_W5E_TTIT
    bez_rcd = {
        przestrzen: postac
        for przestrzen, postac in bez_przewodow_wn.items()
        if przestrzen != "lv_rcd_types"
    }
    assert _odcisk_zrzutu(bez_rcd) == ODCISK_SPRZED_KARTY


def test_pole_skasowane_zostaje_w_zrzucie_jako_null() -> None:
    zrzut = zrzut_kanoniczny(get_default_mv_catalog())
    przeksztaltniki = zrzut["converter_types"]
    assert len(przeksztaltniki) == 192
    assert all(p["harmonic_spectrum_percent"] is None for p in przeksztaltniki.values())


def test_pusta_przestrzen_kart_poza_zrzutem_a_karta_zmienia_odcisk() -> None:
    katalog = get_default_mv_catalog()
    assert "karty_widmowe" not in zrzut_kanoniczny(katalog)
    karta = f.karta(id="karta-1", urzadzenie_ref="conv-pv-gfm-2mw-15kv")
    z_karta = dataclasses.replace(katalog, karty_widmowe={karta.id: karta})
    zrzut = zrzut_kanoniczny(z_karta)
    assert zrzut["karty_widmowe"] == {"karta-1": karta.model_dump(mode="json")}
    assert odcisk_katalogu(z_karta) != odcisk_katalogu(katalog)
    # Determinizm: ta sama karta — ten sam odcisk.
    assert odcisk_katalogu(z_karta) == odcisk_katalogu(
        dataclasses.replace(katalog, karty_widmowe={karta.id: karta})
    )
