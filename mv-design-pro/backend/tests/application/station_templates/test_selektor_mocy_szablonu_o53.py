"""Selektory szablonów stacji czytają TĘ SAMĄ regułę mocy, którą sprawdza tor tworzenia.

POWÓD (decyzja O-53, pomiar 2026-09-24 na drzewie integracji AB-H0): selektory szablonu
były drugą, niezależną regułą tej samej klasy „moc źródła × transformator × nastawa":

* dobór jednostki (`_der_catalog_for_power`) czytał moc z TOKENU w nazwie pozycji
  (`-3mw`), nie z tabliczki — pozycje nN `conv-pv-nn-0p5mw-0p4kv` i
  `conv-pv-residential-50kw-04kv` nie dawały tokenu, więc selektor zwracał `None`
  dla KAŻDEJ mocy, a szablon brał pozycję domyślną 50 kW także przy nastawie 0,5 MW
  (tor tworzenia odmawiał wtedy `converter.setpoint_above_rating`);
* dobór transformatora (dziś `schema.wymagania_transformatora_stacji`) liczył jednostkę jako `sn_mva`
  pozycji, a bez pozycji — jako moc CZYNNĄ nastawy; szablony prosumenckie dobierały
  przez to transformator do mocy czynnej (100 kW → 100 kVA) przy falownikach
  2 × 55 kVA (S_n,jedn z karty), czyli ponad moc znamionową transformatora.

Teraz oba selektory wołają funkcje `domain.generator_validation` na tabliczce z tej
samej materializacji, którą tor tworzenia zapisuje do generatora
(`enm.domain_operations_v2.tabliczka_zrodla_przeksztaltnikowego`).

ILOCZYN CECH (KLASA NIE INSTANCJA): {każdy szablon z DER} × {każdy rodzaj DER szablonu}
× {każda pozycja katalogu rodzaju} × {moc zadana: dokładnie P_max,jedn pozycji / między
pozycjami / poniżej najmniejszej / powyżej największej}; parytet wielkości doboru TR
z regułą domenową na generatorach utworzonych przez szablon sprawdza
`tests/api/test_station_templates_apply_api.py` (ścieżka API, każdy szablon z DER).
"""

from __future__ import annotations

import pytest
from application.station_templates import list_templates
from application.station_templates.schema import (
    COS_PHI_ODBIORU_NN_SZABLONU,
    _der_catalog_for_power,
    _moc_wymagana_jednostki_der_mva,
    resolve_template_default_transformer_choice,
    wymagania_transformatora_stacji,
)
from domain.generator_validation import (
    moc_czynna_jednostki_mw,
    moc_pozorna_jednostki_mva,
    moc_pozorna_wymagana_mva,
)
from enm.domain_operations_v2 import tabliczka_zrodla_przeksztaltnikowego

_SZABLONY_Z_DER = tuple(t for t in list_templates() if t.schema.der_options)

#: (szablon, rodzaj DER) — każdy rodzaj każdego szablonu z DER, bez skrótów.
_RODZAJE = tuple(
    pytest.param(t, spec, id=f"{t.id}-{spec.kind}-{i}")
    for t in _SZABLONY_Z_DER
    for i, spec in enumerate(t.schema.der_options)
)


def _moce_pozycji(spec) -> list[tuple[float, str]]:
    """(P_max,jedn z tabliczki, ref) każdej pozycji rodzaju — wyrocznia z reguły domenowej."""
    moce = []
    for opcja in spec.catalog_options:
        tabliczka = tabliczka_zrodla_przeksztaltnikowego(spec.kind, opcja.catalog_ref)
        assert tabliczka is not None, (
            f"pozycja {opcja.catalog_ref} rodzaju {spec.kind} nie materializuje się — "
            "szablon oferuje pozycję, której tor tworzenia nie przyjmie"
        )
        moc = moc_czynna_jednostki_mw(spec.kind, tabliczka)
        assert moc is not None and moc > 0, opcja.catalog_ref
        moce.append((moc, opcja.catalog_ref))
    return sorted(moce)


def test_iloczyn_obejmuje_wszystkie_szablony_z_der() -> None:
    # Pomiar 2026-10-15: 24 szablony z DER (71 w katalogu szablonów). Liczba nie jest
    # pinem zakresu, tylko strażnikiem, że parametryzacja nie jest pusta.
    assert len(_SZABLONY_Z_DER) >= 1
    assert len(_RODZAJE) >= len(_SZABLONY_Z_DER)


@pytest.mark.parametrize(("szablon", "spec"), _RODZAJE)
def test_dobor_jednostki_czyta_moc_z_tabliczki_kazdej_pozycji(szablon, spec) -> None:
    moce = _moce_pozycji(spec)
    # (1) moc zadana równa P_max,jedn pozycji → dokładnie ta moc
    for moc, _ref in moce:
        wybrana = _der_catalog_for_power(spec, moc)
        tabliczka = tabliczka_zrodla_przeksztaltnikowego(spec.kind, wybrana)
        assert moc_czynna_jednostki_mw(spec.kind, tabliczka) == pytest.approx(moc, abs=1e-12)
    # (2) między pozycjami → NAJMNIEJSZA pozycja, która tę moc wyda
    for (nizsza, _), (wyzsza, ref_wyzszej) in zip(moce, moce[1:], strict=False):
        if wyzsza - nizsza <= 1e-9:
            continue
        srodek = (nizsza + wyzsza) / 2.0
        assert _der_catalog_for_power(spec, srodek) == ref_wyzszej
    # (3) poniżej najmniejszej → najmniejsza
    najmniejsza, ref_najmniejszej = moce[0]
    assert _der_catalog_for_power(spec, najmniejsza / 2.0) == ref_najmniejszej
    # (4) powyżej największej → największa (nastawa zostanie nazwana odmową w torze tworzenia)
    najwieksza, ref_najwiekszej = moce[-1]
    assert _der_catalog_for_power(spec, najwieksza * 2.0) == ref_najwiekszej


@pytest.mark.parametrize(("szablon", "spec"), _RODZAJE)
def test_moc_wymagana_jednostki_selektora_to_regula_domenowa(szablon, spec) -> None:
    moce = _moce_pozycji(spec)
    nastawy = sorted({spec.default_p_mw_each, *(m for m, _ in moce), moce[-1][0] * 2.0})
    for moc_zadana in nastawy:
        ref = _der_catalog_for_power(spec, moc_zadana)
        tabliczka = tabliczka_zrodla_przeksztaltnikowego(spec.kind, ref)
        oczekiwana = moc_pozorna_wymagana_mva(
            technologia=spec.kind,
            tabliczka=tabliczka,
            liczba_jednostek=1,
            moc_czynna_mw=moc_zadana,
            cos_phi=None,
        )
        assert _moc_wymagana_jednostki_der_mva(spec.kind, ref, moc_zadana) == oczekiwana
        # S_n,jedn z karty jest dolnym ograniczeniem wielkości doboru (nie moc czynna)
        s_jednostki = moc_pozorna_jednostki_mva(spec.kind, tabliczka)
        assert oczekiwana is not None and s_jednostki is not None
        assert oczekiwana >= s_jednostki - 1e-12


def test_pozycje_nn_bez_tokenu_mocy_w_nazwie_sa_dobierane_po_tabliczce() -> None:
    # Regresja: dawny parser tokenu `-(\\d+)mw` nie widział `-0p5mw-` ani `-50kw-` — dla
    # KAŻDEJ mocy zwracał `None` i szablon brał pozycję domyślną. Od 2026-10-15 prosument
    # oferuje wyłącznie pozycje z kartą producenta (SMA STP 8.0 / 10.0, token mocy
    # `stp8p0`/`stp10p0` też nie pasuje do parsera) — dobór idzie po P_max z tabliczki.
    szablon = next(t for t in _SZABLONY_Z_DER if t.id == "tpl_pv_prosument_100kw")
    spec = szablon.schema.der_options[0]
    assert _der_catalog_for_power(spec, 0.004) == "conv-pv-nn-sma-stp8p0-3av-40-0p4kv"
    assert _der_catalog_for_power(spec, 0.008) == "conv-pv-nn-sma-stp8p0-3av-40-0p4kv"
    assert _der_catalog_for_power(spec, 0.009) == "conv-pv-nn-sma-stp10p0-3av-40-0p4kv"
    assert _der_catalog_for_power(spec, 0.01) == "conv-pv-nn-sma-stp10p0-3av-40-0p4kv"


@pytest.mark.parametrize(
    ("template_id", "oczekiwana_zrodel_kva", "oczekiwany_tr"),
    [
        # Skład z kartą producenta (2026-10-15): 10 × SMA STP 10.0, S_n,jedn = 10 kVA
        # z karty → 100 kVA źródeł; odbiory nN 105 kVA przeważają → 160 kVA. Dawny dobór
        # po mocy czynnej i bez odbiorów dawał 100 kVA.
        ("tpl_pv_prosument_100kw", 100, "tr-sn-nn-15-04-160kva-dyn11"),
        # 25 × 10 kVA = 250 kVA (suma zmiennoprzecinkowa 250,00000000000006) — granica
        # równości: transformator 250 kVA wystarcza, tolerancja doboru 1e-6 kVA nie może
        # odrzucić go szumem sumowania ani przeskoczyć na 400 kVA.
        ("tpl_pv_prosument_250kw", 250, "tr-sn-nn-15-04-250kva-dyn11"),
    ],
)
def test_transformator_prosumenta_dobrany_do_mocy_pozornej_falownikow(
    template_id: str, oczekiwana_zrodel_kva: int, oczekiwany_tr: str
) -> None:
    szablon = next(t for t in _SZABLONY_Z_DER if t.id == template_id)
    wymagania = wymagania_transformatora_stacji(szablon)
    assert round(wymagania.moc_zrodel_nn_kva) == oczekiwana_zrodel_kva
    wybor = resolve_template_default_transformer_choice(szablon)
    assert wybor is not None
    assert wybor.catalog_ref == oczekiwany_tr


def test_transformator_prosumenta_pokrywa_tez_odbiory_nn() -> None:
    # Korekta 2026-10-15: transformator stacji zasila także odbiory nN szablonu (2 × 50 kW
    # przy cosφ 0,95 = 105 kVA). Dawny dobór patrzył wyłącznie na moc źródeł i dla
    # mikroinstalacji 5 kW dawał 63 kVA przy 105 kVA odbiorów.
    szablon = next(t for t in _SZABLONY_Z_DER if t.id == "tpl_pv_prosument_8kw")
    wymagania = wymagania_transformatora_stacji(szablon)
    odbiory_kva = 2 * 50.0 / COS_PHI_ODBIORU_NN_SZABLONU
    assert wymagania.moc_odbiorow_kva == pytest.approx(odbiory_kva)
    assert wymagania.wymagana_kva == pytest.approx(odbiory_kva)
    wybor = resolve_template_default_transformer_choice(szablon)
    assert wybor is not None and wybor.catalog_ref == "tr-sn-nn-15-04-160kva-dyn11"
