"""Napięcie SN szablonu jako część kontraktu oferty (nie niespodzianka po kliknięciu).

POWÓD (pomiar 2026-09-17): `industrial-template-mass-flow` na CI (Frontend E2E
full, run 452) padł na `tpl_kompensacja_1v8mvar_20kv` z odmową backendu
`shunt.voltage_mismatch` — bateria 20 kV na szynie 15 kV. Odmowa jest POPRAWNA
fizycznie; defektem było to, że kontrakt szablonu nie niósł napięcia SN dla
szablonów BEZ transformatora, więc przeglądarka oferowała pozycję, której
backend nie przyjmie, i nie mówiła o tym projektantowi.

ILOCZYN CECH (KLASA NIE INSTANCJA): {szablon z transformatorem SN/nN, szablon
GPZ 110/SN (tworzy szynę SN), szablon z baterią kondensatorów bez
transformatora, szablon bez obu} × {źródło wielkości: rekord katalogu
transformatora / rekord katalogu baterii / brak} × {lista i szczegół kontraktu}.
"""

from __future__ import annotations

import pytest
from application.station_templates import list_templates
from application.station_templates.schema import (
    KATEGORIE_KORZENIA_MODELU,
    resolve_template_default_shunt_choice,
    resolve_template_default_transformer_choice,
    shunt_capacitor_rated_kv,
    sn_voltage_kv,
    structural_fields,
    template_wchodzi_w_segment,
    transformer_voltages_kv,
)

# Szablony ŚWIADOMIE napięciowo obojętne: nie wnoszą ani transformatora, ani
# baterii kondensatorów, więc nie wiążą napięcia szyny, do której wchodzą.
# Lista ZAMKNIĘTA — nowy szablon bez wyprowadzalnego napięcia musi trafić tutaj
# świadomą decyzją (albo dostać element wiążący napięcie), nie po cichu.
SZABLONY_NAPIECIOWO_OBOJETNE = {
    "tpl_rezerwa_2kierunki_1odplyw",
    "tpl_rezerwa_2kierunki_2odplywy",
    "tpl_rezerwa_2kierunki_sprzeglo",
    "tpl_rs_2pola_sprzeglo",
    "tpl_rs_6pola_wezel_petlowy",
    "tpl_rsm_4pola_2wyjscia",
}


def test_kazdy_szablon_ma_napiecie_albo_jest_jawnie_obojetny() -> None:
    bez_napiecia = {t.id for t in list_templates() if sn_voltage_kv(t) is None}
    assert bez_napiecia == SZABLONY_NAPIECIOWO_OBOJETNE, (
        "szablon bez wyprowadzalnego napięcia SN musi być wymieniony jawnie "
        f"(różnica: {sorted(bez_napiecia ^ SZABLONY_NAPIECIOWO_OBOJETNE)})"
    )


def test_napiecie_jest_dodatnie_gdy_wyprowadzone() -> None:
    for szablon in list_templates():
        napiecie = sn_voltage_kv(szablon)
        if napiecie is None:
            continue
        assert napiecie > 0.0, f"{szablon.id}: napięcie SN musi być dodatnie"


def test_szablon_gpz_bierze_napiecie_ze_strony_dolnej_transformatora() -> None:
    """GPZ 110/SN TWORZY szynę SN — jego napięciem pracy jest strona dolna."""
    gpz = [t for t in list_templates() if t.schema.grid_source_options]
    assert gpz, "brak szablonów GPZ — test straciłby przedmiot"
    for szablon in gpz:
        transformator = resolve_template_default_transformer_choice(szablon)
        assert transformator is not None
        napiecie_gn_kv, napiecie_dn_kv = transformer_voltages_kv(transformator.catalog_ref)
        assert napiecie_gn_kv == 110.0, f"{szablon.id}: GPZ zasilany z 110 kV"
        assert sn_voltage_kv(szablon) == napiecie_dn_kv


def test_szablon_wpinany_bierze_napiecie_ze_strony_gornej_transformatora() -> None:
    wpinane = [
        t
        for t in list_templates()
        if not t.schema.grid_source_options
        and resolve_template_default_transformer_choice(t) is not None
    ]
    assert wpinane, "brak szablonów z transformatorem — test straciłby przedmiot"
    for szablon in wpinane:
        transformator = resolve_template_default_transformer_choice(szablon)
        assert transformator is not None
        napiecie_gn_kv, _ = transformer_voltages_kv(transformator.catalog_ref)
        assert sn_voltage_kv(szablon) == napiecie_gn_kv


def test_szablon_kompensacji_bierze_napiecie_z_rekordu_baterii() -> None:
    """Ta sama wielkość, którą przy materializacji sprawdza odmowa
    `shunt.voltage_mismatch` — jedno pole katalogu, dwie strony."""
    kompensacja = [
        t
        for t in list_templates()
        if t.schema.shunt_capacitor_options
        and resolve_template_default_transformer_choice(t) is None
    ]
    assert kompensacja, "brak szablonów kompensacji — test straciłby przedmiot"
    for szablon in kompensacja:
        bateria = resolve_template_default_shunt_choice(szablon)
        assert bateria is not None
        assert sn_voltage_kv(szablon) == shunt_capacitor_rated_kv(bateria.catalog_ref)


def test_pole_jest_w_kontrakcie_strukturalnym() -> None:
    for szablon in list_templates():
        pola = structural_fields(szablon)
        assert "sn_voltage_kv" in pola
        assert pola["sn_voltage_kv"] == sn_voltage_kv(szablon)


@pytest.mark.parametrize(
    ("template_id", "oczekiwane_kv"),
    [
        ("tpl_gpz_110_20_2x16mva_h5", 20.0),
        ("tpl_kompensacja_1v8mvar_20kv", 20.0),
        ("tpl_abonencka_630kva_pomiar_20kv", 20.0),
        ("tpl_kompensacja_0v6mvar_15kv", 15.0),
        ("tpl_gpz_110_15_2x16mva_h5", 15.0),
    ],
)
def test_pomiar_rozkladu_napiec_jest_przypiety(template_id: str, oczekiwane_kv: float) -> None:
    """Pomiar z 2026-09-17: 73 szablony = 64 × 15 kV + 3 × 20 kV + 6 obojętnych."""
    szablon = next(t for t in list_templates() if t.id == template_id)
    assert sn_voltage_kv(szablon) == oczekiwane_kv


def test_rozklad_napiec_zgadza_sie_z_pomiarem_w_docstringu() -> None:
    napiecia = [sn_voltage_kv(t) for t in list_templates()]
    assert len(napiecia) == 73
    assert napiecia.count(15.0) == 64
    assert napiecia.count(20.0) == 3
    assert napiecia.count(None) == 6


def test_rola_szablonu_w_modelu_jest_czescia_kontraktu_oferty() -> None:
    """Kontrakt listy i szczegółu niesie `wchodzi_w_segment` dla KAŻDEGO szablonu.

    Bez tego pola front musiałby powtórzyć u siebie listę kategorii będących
    korzeniem modelu — dokładnie ten duplikat predykatu, który reguła KLASA NIE
    INSTANCJA (pkt 3) nazywa defektem czekającym na dane brzegowe.
    """
    for szablon in list_templates():
        pola = structural_fields(szablon)
        assert "wchodzi_w_segment" in pola, szablon.id
        assert isinstance(pola["wchodzi_w_segment"], bool), szablon.id
        assert pola["wchodzi_w_segment"] == template_wchodzi_w_segment(szablon), szablon.id


def test_korzenie_modelu_to_dokladnie_szablony_gpz() -> None:
    """Pomiar 2026-09-17 przypięty: korzeniem modelu jest dziś WYŁĄCZNIE kategoria
    GPZ 110/SN — 3 szablony z 73. Dołożenie kategorii korzenia bez aktualizacji
    `KATEGORIE_KORZENIA_MODELU` zapali ten test, zamiast po cichu wpuścić szablon
    do kreatora wcięcia w magistralę."""
    korzenie = sorted(t.id for t in list_templates() if not template_wchodzi_w_segment(t))
    assert korzenie == [
        "tpl_gpz_110_15_2x16mva_h5",
        "tpl_gpz_110_15_2x25mva_h5",
        "tpl_gpz_110_20_2x16mva_h5",
    ]
    assert len(KATEGORIE_KORZENIA_MODELU) == 1
