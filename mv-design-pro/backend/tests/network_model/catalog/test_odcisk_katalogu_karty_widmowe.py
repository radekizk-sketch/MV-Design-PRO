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

import copy
import dataclasses
import hashlib
import json

from network_model.catalog.mv_shunt_capacitor_catalog import (
    _SOURCE as _ZRODLO_BATERII_REFERENCYJNE,
)
from network_model.catalog.odcisk import _kanon, odcisk_katalogu, zrzut_kanoniczny
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.types import POLA_BATERII_KONDENSATOROW_TYPU, POLA_KARTY_PROJEKCJI

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
#: Karta KATALOG-APARATURA-WN (2026-10-22, zakres po decyzji właściciela: 110 kV to granica
#: zasilania GPZ): 2 typy minimalne łączników topologii 110 kV (rekord aparatury łączeniowej
#: + jego projekcja APARAT_SN). Dowód liść po liściu (zrzut kanoniczny baza `956e3e37d` vs
#: drzewo karty): wyłącznie nowe identyfikatory, 0 zmienionych pozycji istniejących — pole
#: `card_field_status` dodane do obu typów jest poza odciskiem, gdy ma wartość `None`
#: (`odcisk._POLA_ADDYTYWNE_POZA_ODCISKIEM_GDY_NONE`). Zrzut z wyciętymi pozycjami karty daje
#: DOKŁADNIE `ODCISK_PO_W5E_TTIT`.
POZYCJE_APARATURY_WN: dict[str, tuple[str, ...]] = {
    "switch_equipment_types": ("sw-cb-110kv", "sw-ds-110kv"),
    "mv_apparatus_types": ("sw-cb-110kv", "sw-ds-110kv"),
}
#: Wartość zrzutu z wyciętymi polami karty projekcji (jak `ODCISK_PO_W5E_TTIT`); pełny odcisk
#: katalogu domyślnego po karcie: 0d50891f64dd97c345b62dbe0bbb7b1b4a6cfdd8477c77cc6154930a26f290fd.
ODCISK_PO_APARATURZE_WN = "f9295f20b4955ebe0decac54818aaa7c5bed0d6d0e58ddd8a0362eaf2638859b"
#: Decyzja architekta 2026-10-22 (karta KATALOG-APARATURA-WN, commit 3): zero nie jest zapisem
#: „nie dotyczy” — wielkość niewłaściwa rodzajowi aparatu jest ``None`` (bramka KAT-T-050;
#: na gałęzi UI/UX nosiła kod KAT-T-048, przenumerowana przy scaleniu z kartą LINIA-110).
#: Dowód liść po liściu (zrzut kanoniczny `757814661` vs drzewo): różni się DOKŁADNIE 41
#: liści, wszystkie wartość → null i wszystkie wypisane w `MIGRACJA_ZERA`: `ik_ka` 17 rekordów
#: łączników (13 × 0.0 rozłączników/odłączników/uziemników, 4 × dodatnia kopia I_cw
#: rozłączników i odłączników ZPUE/Elektrometal), `icw_ka` 7 bezpieczników ETI VV (0.0) i ich
#: lustro `breaking_capacity_ka` w 17 projekcjach APARAT_SN; 0 nowych i 0 usuniętych pozycji.
#: Zrzut z przywróconymi dawnymi wartościami tych liści daje DOKŁADNIE `ODCISK_PO_APARATURZE_WN`.
#: Pełny odcisk katalogu domyślnego po migracji:
#: 1e263e8341928cfc122f72521187c585336dbbb1dbd222531b45e15efab5f157 (przed: 0d50891f…290fd).
ODCISK_PO_MIGRACJI_ZERA = "337501af699a826a088b967352e4b488e2afc7a7ea5ffefa65800f5c01c524a7"
_IK_PRZED_MIGRACJA: dict[str, float] = {
    **{
        ref: 0.0
        for ref in (
            "sw-ds-abb-ojs-12kv-630a",
            "sw-ds-abb-ojs-17kv-630a",
            "sw-ds-abb-ojs-24kv-630a",
            "sw-ds-generic-slupowy-17kv-400a",
            "sw-es-generic-12kv",
            "sw-es-generic-17kv",
            "sw-ls-abb-nal-12kv-400a",
            "sw-ls-abb-nal-12kv-630a",
            "sw-ls-abb-nal-24kv-400a",
            "sw-ls-abb-nal-24kv-630a",
            "sw-ls-schneider-rm6-12kv-630a",
            "sw-ls-schneider-rm6-17kv-400a",
            "sw-ls-schneider-sm6-24kv-630a",
        )
    },
    "sw-ds-elektrometal-12kv-630a": 16.0,
    "sw-ds-elektrometal-24kv-1250a": 20.0,
    "sw-ls-zpue-nal-12kv-630a": 16.0,
    "sw-ls-zpue-nal-24kv-630a": 16.0,
}
#: (przestrzeń, pozycja, pole) → wartość przed migracją (po migracji: ``None``).
MIGRACJA_ZERA: dict[tuple[str, str, str], float] = {
    **{("switch_equipment_types", ref, "ik_ka"): v for ref, v in _IK_PRZED_MIGRACJA.items()},
    **{
        ("mv_apparatus_types", ref, "breaking_capacity_ka"): v
        for ref, v in _IK_PRZED_MIGRACJA.items()
    },
    **{
        ("switch_equipment_types", f"sw-fuse-eti-vv-{wariant}", "icw_ka"): 0.0
        for wariant in ("12kv-16a", "12kv-40a", "12kv-63a", "12kv-100a", "12kv-200a")
        + ("17kv-63a", "17kv-100a")
    },
}
#: Karta LINIA-110 (2026-10-22): nowa przestrzeń `overhead_conductor_types` (4 przewody linii
#: 110 kV z tablicy PN-EN 50182). Dowód: zrzut BEZ tej przestrzeni daje DOKŁADNIE
#: `ODCISK_PO_W5E_TTIT` (żadna inna przestrzeń ani liść nie zmieniły się), a z nią — wartość
#: poniżej.
ODCISK_PO_LINIA_110 = "4f66d5626e211540eb1f1afe34d6da1d90ec50800758e208893e7383f51e9f44"
#: Karta LINIA-110, pkt 2 rozstrzygnięć (2026-10-22): 87 pozycji SN (25 linii, 62 kable) niesie
#: mapę ``wartosci_robocze`` (R′0, X′0, a 10 kabli także R′ i Ith żyły powrotnej — założenia
#: inżynierskie katalogu). Dowód liść po liściu (zrzut przed kartą vs po): 216 różnic, wszystkie
#: to dodane pole ``wartosci_robocze`` (153 linie, 63 kable); 129 z nich było PUSTE, więc pole
#: puste wypada z odcisku (``_POLA_ADDYTYWNE_POZA_ODCISKIEM_GDY_PUSTE``). Zrzut bez tych 87 map
#: daje DOKŁADNIE ``ODCISK_PO_LINIA_110`` — żadna liczba katalogu się nie zmieniła.
ODCISK_PO_Z0_ROBOCZE = "85a046c9e4bcd8dce8fc44507c1280fb72604cbd80cd6b637fc9418b80f855c0"
#: Scalenie gałęzi UI/UX (karta KATALOG-APARATURA-WN) z programem (karta LINIA-110), 2026-10-28:
#: obie karty zmieniły rozłączne przestrzenie katalogu. Dowód obiema drogami w teście niżej:
#: wycięcie zmian LINIA-110 daje DOKŁADNIE ``ODCISK_PO_MIGRACJI_ZERA`` (łańcuch UI/UX), a
#: cofnięcie zmian aparatury WN — DOKŁADNIE ``ODCISK_PO_Z0_ROBOCZE`` (łańcuch programu).
#: Pełny odcisk katalogu domyślnego po scaleniu:
#: d0a62e49f70cc6f6b6eaa74dec2692be74363925483cc2c61b0ffd4fb4568061.
ODCISK_PO_SCALENIU_APARATURY_I_LINII_110 = (
    "f717d81d61ee7f8d1b78d577730c5585defa7fdb4bcd802ba8cfabd23a3342af"
)
#: Karta UX-04/POLE-BKR-MODEL (2026-10-28): typ baterii kondensatorów niesie pola karty
#: (układ połączeń, stopnie, tolerancja, dławik, rezystory rozładowcze), a pozycje referencyjne
#: — układ z ENEA Zeszyt 1 §17 s. 32 i Zał. 16 w źródle. Dowód liść po liściu (zrzut bazy
#: `1465336df` vs drzewo karty): różnią się WYŁĄCZNIE liście `shunt_capacitor_types` — 7 nowych
#: pól × 6 pozycji i `source_reference` 5 pozycji referencyjnych; wycięcie ich daje DOKŁADNIE
#: ``ODCISK_PO_SCALENIU_APARATURY_I_LINII_110``. Pełny odcisk katalogu domyślnego po karcie:
#: 46ec81535a6f8799fa5678885a27ea8b0cd96733d6944f2e88b02fdb7866c47f.
ODCISK_PO_BATERII_BKR = "e0fbf7f1be94901452cf8f77475f505d154bfe915c7d1cc8ed2be7c785a86f39"
_ZRODLO_BATERII_PRZED_KARTA = "Katalog kompensatorów MV-DESIGN-PRO / wartości referencyjne"
PROJEKCJE = ("pv_inverter_types", "bess_inverter_types")


def _wytnij_pola_baterii_bkr(zrzut: dict[str, object]) -> int:
    """Cofa zmiany karty UX-04/POLE-BKR-MODEL w zrzucie; zwraca liczbę zmienionych pozycji."""
    zmienione = 0
    for postac in zrzut["shunt_capacitor_types"].values():  # type: ignore[attr-defined]
        for nazwa in POLA_BATERII_KONDENSATOROW_TYPU:
            postac.pop(nazwa)
        if postac["source_reference"] == _ZRODLO_BATERII_REFERENCYJNE:
            postac["source_reference"] = _ZRODLO_BATERII_PRZED_KARTA
            zmienione += 1
    return zmienione


def _odcisk_zrzutu(zrzut: dict[str, object]) -> str:
    tekst = json.dumps(
        zrzut, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=_kanon
    )
    return hashlib.sha256(tekst.encode("utf-8")).hexdigest()


def _wytnij_wartosci_robocze_sn(zrzut: dict[str, object]) -> int:
    """Usuwa mapy ``wartosci_robocze`` pozycji SN (karta LINIA-110); zwraca ich liczbę."""
    oznaczone = 0
    for przestrzen in ("line_types", "cable_types"):
        for postac in zrzut[przestrzen].values():  # type: ignore[attr-defined]
            if "wartosci_robocze" in postac:
                assert postac["wartosci_robocze"], "pusta mapa wartości roboczych w odcisku"
                postac.pop("wartosci_robocze")
                oznaczone += 1
    return oznaczone


def _cofnij_migracje_zera(zrzut: dict[str, object]) -> None:
    """Przywraca liście sprzed migracji zera (karta KATALOG-APARATURA-WN, commit 3)."""
    assert len(MIGRACJA_ZERA) == 41
    for (przestrzen, identyfikator, pole), dawna in MIGRACJA_ZERA.items():
        postac = zrzut[przestrzen][identyfikator]  # type: ignore[index]
        assert postac[pole] is None, (przestrzen, identyfikator, pole)
        postac[pole] = dawna


def _wytnij_aparature_wn(zrzut: dict[str, object]) -> None:
    """Usuwa typy minimalne łączników 110 kV (karta KATALOG-APARATURA-WN)."""
    for przestrzen, identyfikatory in POZYCJE_APARATURY_WN.items():
        for identyfikator in identyfikatory:
            zrzut[przestrzen].pop(identyfikator)  # type: ignore[attr-defined]


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
    assert _odcisk_zrzutu(zrzut) == ODCISK_PO_BATERII_BKR
    assert _wytnij_pola_baterii_bkr(zrzut) == 5
    assert _odcisk_zrzutu(zrzut) == ODCISK_PO_SCALENIU_APARATURY_I_LINII_110

    # Droga 1 — wycięcie zmian karty LINIA-110 odtwarza łańcuch gałęzi UI/UX.
    zrzut_bez_linii_110 = copy.deepcopy(zrzut)
    assert _wytnij_wartosci_robocze_sn(zrzut_bez_linii_110) == 87
    zrzut_bez_linii_110.pop("overhead_conductor_types")
    assert _odcisk_zrzutu(zrzut_bez_linii_110) == ODCISK_PO_MIGRACJI_ZERA
    _cofnij_migracje_zera(zrzut_bez_linii_110)
    assert _odcisk_zrzutu(zrzut_bez_linii_110) == ODCISK_PO_APARATURZE_WN
    _wytnij_aparature_wn(zrzut_bez_linii_110)
    assert _odcisk_zrzutu(zrzut_bez_linii_110) == ODCISK_PO_W5E_TTIT

    # Droga 2 — cofnięcie zmian karty KATALOG-APARATURA-WN odtwarza łańcuch programu.
    _cofnij_migracje_zera(zrzut)
    _wytnij_aparature_wn(zrzut)
    assert _odcisk_zrzutu(zrzut) == ODCISK_PO_Z0_ROBOCZE
    assert _wytnij_wartosci_robocze_sn(zrzut) == 87
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
