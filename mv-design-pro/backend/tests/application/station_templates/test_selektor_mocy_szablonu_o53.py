"""Selektory szablonów stacji czytają TĘ SAMĄ regułę mocy, którą sprawdza tor tworzenia.

POWÓD (decyzja O-53, pomiar 2026-09-24 na drzewie integracji AB-H0): selektory szablonu
były drugą, niezależną regułą tej samej klasy „moc źródła × transformator × nastawa":

* dobór jednostki (`_der_catalog_for_power`) czytał moc z TOKENU w nazwie pozycji
  (`-3mw`), nie z tabliczki — pozycje nN `conv-pv-nn-0p5mw-0p4kv` i
  `conv-pv-residential-50kw-04kv` nie dawały tokenu, więc selektor zwracał `None`
  dla KAŻDEJ mocy, a szablon brał pozycję domyślną 50 kW także przy nastawie 0,5 MW
  (tor tworzenia odmawiał wtedy `converter.setpoint_above_rating`);
* dobór transformatora (`_template_der_required_kva`) liczył jednostkę jako `sn_mva`
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
from application.station_templates.apply import _template_der_required_kva
from application.station_templates.schema import (
    _der_catalog_for_power,
    _moc_wymagana_jednostki_der_mva,
    _wymagana_moc_der_domyslna_kva,
    resolve_template_default_transformer_choice,
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
    # Pomiar 2026-09-24: 26 szablonów z DER (73 w katalogu szablonów). Liczba nie jest
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


@pytest.mark.parametrize("szablon", _SZABLONY_Z_DER, ids=lambda t: t.id)
def test_wyswietlanie_i_materializacja_licza_te_sama_moc_wymagana(szablon) -> None:
    # Predykaty parami: `structural_fields()` (wyświetlanie) i `apply()` (materializacja)
    # liczą moc doboru TR tą samą funkcją jednostki — bez nadpisań wynik identyczny.
    assert _wymagana_moc_der_domyslna_kva(szablon) == _template_der_required_kva(szablon, {})


def test_pozycje_nn_bez_tokenu_mocy_w_nazwie_sa_dobierane_po_tabliczce() -> None:
    # Regresja: dawny parser tokenu `-(\\d+)mw` nie widział `-0p5mw-` ani `-50kw-` — dla
    # KAŻDEJ mocy zwracał `None` i szablon brał pozycję domyślną 50 kW.
    szablon = next(t for t in _SZABLONY_Z_DER if t.id == "tpl_pv_prosument_100kw")
    spec = szablon.schema.der_options[0]
    assert _der_catalog_for_power(spec, 0.05) == "conv-pv-residential-50kw-04kv"
    assert _der_catalog_for_power(spec, 0.5) == "conv-pv-nn-0p5mw-0p4kv"
    assert _der_catalog_for_power(spec, 0.2) == "conv-pv-nn-0p5mw-0p4kv"


@pytest.mark.parametrize(
    ("template_id", "oczekiwana_kva", "oczekiwany_tr"),
    [
        # 2 × falownik 50 kW, S_n,jedn = 55 kVA z karty → 110 kVA > 100 kVA: dawny dobór
        # po mocy czynnej (100 kW → 100 kVA) dawał transformator poniżej mocy falowników.
        ("tpl_pv_prosument_100kw", 110, "tr-sn-nn-15-04-160kva-dyn11"),
        # 5 × 55 kVA = 275 kVA > 250 kVA — ta sama klasa.
        ("tpl_pv_prosument_250kw", 275, "tr-sn-nn-15-04-400kva-dyn11"),
        # 1 × 55 kVA (karta 50 kW; mniejszej pozycji PV nN katalog nie ma) → 63 kVA.
        ("tpl_pv_prosument_5kw", 55, "tr-sn-nn-15-04-63kva-dyn11"),
    ],
)
def test_transformator_prosumenta_dobrany_do_mocy_pozornej_falownikow(
    template_id: str, oczekiwana_kva: int, oczekiwany_tr: str
) -> None:
    szablon = next(t for t in _SZABLONY_Z_DER if t.id == template_id)
    assert _wymagana_moc_der_domyslna_kva(szablon) == oczekiwana_kva
    wybor = resolve_template_default_transformer_choice(szablon)
    assert wybor is not None
    assert wybor.catalog_ref == oczekiwany_tr
