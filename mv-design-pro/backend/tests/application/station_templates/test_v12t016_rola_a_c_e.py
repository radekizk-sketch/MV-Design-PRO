"""V12T-016 — szablony ról A/C/E: GPZ_110_SN, ROZDZIELNIA_SIECIOWA,
STACJA_ABONENCKA, KOMPENSACJA, REZERWA_ZASILANIA (rejestr długu, przegląd
2026-09).

Iloczyn cech (KLASA NIE INSTANCJA): każdy z 16 nowych szablonów × zastosowanie
na PUSTYM projekcie (GPZ + minimalna magistrala, ten sam wzorzec fikstury co
`test_apply_odgalezienie.py::_magistrala`) × sprawdzenie gotowości modelu
(`ENMValidator`, zero blokerów) — DoD karty „zastosuj → gotowość bez blokad".
Dodatkowo: materializacja CT/VT (pole pomiarowe), materializacja baterii
kondensatorów (kompensacja), zamknięta ścieżka GPZ (`add_grid_source_sn`, nie
wcięcie w segment), oraz regresja klasy „stacja bez transformatora nie
zostawia wyspy grafu" (defekt odkryty i naprawiony przy budowie tej karty).
"""

from __future__ import annotations

from typing import Any

import pytest
from application.station_templates import (
    TemplateCategory,
    get_template,
    list_templates,
    list_templates_by_category,
)
from application.station_templates.apply import TemplateApplyError, apply_template_to_case
from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from enm.store import get_enm, set_enm
from enm.validator import ENMValidator

_VALIDATOR = ENMValidator()


def _wykonaj(enm: dict[str, Any], op_name: str, payload: dict[str, Any]) -> dict[str, Any]:
    wynik = execute_domain_operation(enm_dict=enm, op_name=op_name, payload=payload)
    assert not wynik.get("error"), f"{op_name}: {wynik.get('error_code')} {wynik.get('error')}"
    return wynik


def _binding(namespace: str, item_id: str) -> dict[str, Any]:
    return {
        "catalog_namespace": namespace,
        "catalog_item_id": item_id,
        "catalog_item_version": "2024.1",
    }


def _pusty_enm(voltage_kv: float = 15.0) -> dict[str, Any]:
    return EnergyNetworkModel(
        header=ENMHeader(name="V12T-016", defaults=ENMDefaults(sn_nominal_kv=voltage_kv)),
    ).model_dump(mode="json")


def _magistrala(
    voltage_kv: float = 15.0, liczba_odcinkow: int = 3
) -> tuple[dict[str, Any], list[str]]:
    """GPZ + N odcinków magistrali kablowej na zadanym napięciu SN.

    Ten sam wzorzec fikstury co `test_apply_odgalezienie.py::_magistrala`
    (świadomie zduplikowany — konwencja tego pakietu testów: każdy plik jest
    samowystarczalny, brak wspólnego conftest dla fikstur ENM).
    """
    if voltage_kv == 20.0:
        source_ref = "src-gpz-20kv-250mva-rx010"
        tr_ref = "tr-wn-sn-110-20-25mva-yd11"
    else:
        source_ref = "src-gpz-15kv-250mva-rx010"
        tr_ref = "tr-wn-sn-110-15-25mva-yd11"
    enm = _wykonaj(
        _pusty_enm(voltage_kv),
        "add_grid_source_sn",
        {
            "voltage_kv": voltage_kv,
            "catalog_ref": source_ref,
            "sections_count": 1,
            "transformer_count": 1,
            "transformer_catalog_ref": tr_ref,
            "line_fields_count": 1,
            "gpz_line_field_apparatus": {
                "catalog_ref": "sw-cb-abb-vd4-17kv-630a",
                "apparatus_kind": "BREAKER",
            },
            "grounding": {"type": "isolated"},
        },
    )["snapshot"]
    odcinki: list[str] = []
    for i in range(liczba_odcinkow):
        enm = _wykonaj(
            enm,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": 500 + 50 * i,
                    "name": f"Odcinek {i + 1}",
                    "catalog_binding": _binding("KABEL_SN", "cable-tfk-yakxs-3x120"),
                }
            },
        )["snapshot"]
        odcinki.append(enm["corridors"][0]["ordered_segment_refs"][-1])
    return enm, odcinki


#: Wszystkie 16 nowych szablonów × napięcie fikstury, na którym mają
#: zastosowanie (kompensacja/abonencka mają warianty 20 kV — muszą trafić na
#: magistralę TEGO SAMEGO napięcia, inaczej domena słusznie odmawia).
_ROLA_A_C_E_TEMPLATES: tuple[tuple[str, float], ...] = (
    ("tpl_gpz_110_15_2x16mva_h5", 0.0),  # 0.0 = GPZ, brak magistrali (korzeń)
    ("tpl_gpz_110_15_2x25mva_h5", 0.0),
    ("tpl_gpz_110_20_2x16mva_h5", 0.0),
    ("tpl_rs_2pola_sprzeglo", 15.0),
    ("tpl_rsm_4pola_2wyjscia", 15.0),
    ("tpl_rs_6pola_wezel_petlowy", 15.0),
    ("tpl_abonencka_250kva_pomiar", 15.0),
    ("tpl_abonencka_400kva_pomiar", 15.0),
    ("tpl_abonencka_630kva_pomiar", 15.0),
    ("tpl_abonencka_630kva_pomiar_20kv", 20.0),
    ("tpl_kompensacja_0v6mvar_15kv", 15.0),
    ("tpl_kompensacja_1v2mvar_15kv", 15.0),
    ("tpl_kompensacja_1v8mvar_20kv", 20.0),
    ("tpl_rezerwa_2kierunki_sprzeglo", 15.0),
    ("tpl_rezerwa_2kierunki_1odplyw", 15.0),
    ("tpl_rezerwa_2kierunki_2odplywy", 15.0),
)


def _zastosuj(tpl_id: str, voltage_kv: float, *, klucz_suffix: str = "") -> dict[str, Any]:
    """Zastosuj szablon na świeżej fiksturze; zwraca wynik `apply_template_to_case`."""
    template = get_template(tpl_id)
    assert template is not None, tpl_id
    klucz = f"v12t016:{tpl_id}{klucz_suffix}"
    if voltage_kv == 0.0:
        set_enm(klucz, EnergyNetworkModel.model_validate(_pusty_enm()))
        target_segment_id = None
    else:
        base_enm, odcinki = _magistrala(voltage_kv)
        set_enm(klucz, EnergyNetworkModel.model_validate(base_enm))
        target_segment_id = odcinki[1]
    return (
        apply_template_to_case(
            template=template,
            klucz_twin=klucz,
            target_segment_id=target_segment_id,
            insert_at_ratio=0.5,
            params_override={},
            catalog_profile=None,
        ),
        klucz,
    )


@pytest.mark.parametrize("tpl_id,voltage_kv", _ROLA_A_C_E_TEMPLATES)
def test_kazdy_szablon_rola_a_c_e_aplikuje_sie_do_gotowosci_bez_blokad(
    tpl_id: str, voltage_kv: float
) -> None:
    """DoD karty V12T-016: `apply()` → model waliduje się BEZ blokerów."""
    result, klucz = _zastosuj(tpl_id, voltage_kv)
    assert result["station_ref"], f"{tpl_id}: apply nie wskazał utworzonej stacji"
    assert result["created_element_refs"], f"{tpl_id}: apply nie utworzyło żadnego elementu"

    saved = get_enm(klucz)
    validation = _VALIDATOR.validate(saved)
    readiness = _VALIDATOR.readiness(validation)
    assert readiness.ready, (
        f"{tpl_id}: model NIE jest gotowy po zastosowaniu szablonu — "
        f"blokery: {[b.code for b in readiness.blockers]}"
    )


def test_wszystkie_16_szablonow_v12t016_pokryte_testem_parametrycznym() -> None:
    """Pin liczności: KAŻDY szablon 5 nowych kategorii ma wpis w macierzy
    powyżej — inaczej test parametryczny cicho pomija nowy wariant."""
    nowe_kategorie = (
        TemplateCategory.GPZ_110_SN,
        TemplateCategory.ROZDZIELNIA_SIECIOWA,
        TemplateCategory.STACJA_ABONENCKA,
        TemplateCategory.KOMPENSACJA,
        TemplateCategory.REZERWA_ZASILANIA,
    )
    wszystkie_id = {
        t.id for kategoria in nowe_kategorie for t in list_templates_by_category(kategoria)
    }
    id_w_macierzy = {tpl_id for tpl_id, _ in _ROLA_A_C_E_TEMPLATES}
    assert (
        wszystkie_id == id_w_macierzy
    ), f"Rozjazd: {wszystkie_id.symmetric_difference(id_w_macierzy)}"
    assert len(wszystkie_id) == 16


def test_stacja_abonencka_materializuje_ct_vt_klasy_pomiarowej_na_polu_pomiarowym() -> None:
    """Karta §1: „pole pomiarowe z CT/VT z katalogu" — CT/VT MUSZĄ istnieć w
    modelu po `apply()`, z realną przekładnią z katalogu (nie fabrykowaną)."""
    result, klucz = _zastosuj("tpl_abonencka_250kva_pomiar", 15.0)
    saved = get_enm(klucz)
    d = saved.model_dump(mode="json")
    measurements = [m for m in d.get("measurements", []) if m.get("bay_ref") is not None]
    ct = [m for m in measurements if m["measurement_type"] == "CT"]
    vt = [m for m in measurements if m["measurement_type"] == "VT"]
    assert len(ct) == 1, f"Oczekiwano dokładnie 1 CT, jest {len(ct)}"
    assert len(vt) == 1, f"Oczekiwano dokładnie 1 VT, jest {len(vt)}"
    assert ct[0]["catalog_ref"] == "ct_100_1_0_5_5va_abb"
    assert ct[0]["rating"]["accuracy_class"] == "0.5", "CT musi być klasy POMIAROWEJ, nie ochronnej"
    assert vt[0]["catalog_ref"] == "vt_15kv_100v_05_abb"
    assert ct[0]["rating"]["ratio_primary"] == 100.0
    assert ct[0]["rating"]["ratio_secondary"] == 1.0
    assert result["station_ref"]


def test_kompensacja_materializuje_baterie_kondensatorow_na_szynie_sn() -> None:
    """Karta §1: „bateria kondensatorów SN" — `shunt_capacitors` MUSI zawierać
    wpis po `apply()`, z realną pozycją katalogu KOMPENSATOR_SN."""
    result, klucz = _zastosuj("tpl_kompensacja_1v2mvar_15kv", 15.0)
    saved = get_enm(klucz)
    d = saved.model_dump(mode="json")
    shunts = d.get("shunt_capacitors", [])
    assert len(shunts) == 1, f"Oczekiwano dokładnie 1 baterię, jest {len(shunts)}"
    assert shunts[0]["catalog_ref"] == "KOMP_SN_1V2_15KV"
    assert result["station_ref"]


@pytest.mark.parametrize(
    "tpl_id",
    ["tpl_rs_2pola_sprzeglo", "tpl_kompensacja_1v2mvar_15kv", "tpl_rezerwa_2kierunki_sprzeglo"],
)
def test_stacja_bez_transformatora_nie_zostawia_wyspy_grafu_nn(tpl_id: str) -> None:
    """Regresja defektu odkrytego przy budowie tej karty (KLASA NIE INSTANCJA):
    `insert_station_on_segment_sn` z `transformer.create=False` tworzyło
    bezwarunkowo szynę nN — węzeł-widmo bez żadnego przyłącza, walidator E003
    „graf niespójny" (blocker). Naprawa: brak transformatora ⇒ brak szyny nN.
    Ten test PRZYPINA naprawę — bez niego regresja byłaby niewidoczna (żaden
    z istniejących 57 szablonów nie miał `transformer_options` pustych)."""
    result, klucz = _zastosuj(tpl_id, 15.0)
    saved = get_enm(klucz)
    d = saved.model_dump(mode="json")
    substation = next(s for s in d["substations"] if s["ref_id"] == result["station_ref"])
    for bus_ref in substation["bus_refs"]:
        bus = next(b for b in d["buses"] if b["ref_id"] == bus_ref)
        assert bus["voltage_kv"] != 0.4, (
            f"{tpl_id}: stacja bez transformatora ma szynę nN-widmo {bus_ref} "
            f"(0,4 kV) — wyspa grafu bez przyłącza."
        )
    codes = [i.code for i in _VALIDATOR.validate(saved).issues]
    assert "E003" not in codes, f"{tpl_id}: E003 (graf niespójny) obecny mimo naprawy"


def test_gpz_tworzy_dwie_sekcje_i_sprzeglo_uklad_h5() -> None:
    """Karta §1 rola A: „dwa transformatory, sekcja szyn, sprzęgło" — układ H5
    materializuje się z `add_grid_source_sn(sections_count=2)`."""
    result, klucz = _zastosuj("tpl_gpz_110_15_2x16mva_h5", 0.0)
    saved = get_enm(klucz)
    d = saved.model_dump(mode="json")
    substation = next(s for s in d["substations"] if s["ref_id"] == result["station_ref"])
    buses_by_ref = {b["ref_id"]: b for b in d["buses"]}
    sn_bus_refs = [ref for ref in substation["bus_refs"] if buses_by_ref[ref]["voltage_kv"] == 15.0]
    assert len(sn_bus_refs) == 2, (
        f"GPZ 2-sekcyjny musi mieć 2 szyny SN 15 kV, jest {len(sn_bus_refs)} "
        f"(bus_refs stacji zawiera też szyny 110 kV transformatorów — display-only)"
    )
    assert len(substation["transformer_refs"]) == 2, "Szablon 2x16 MVA musi dać 2 transformatory"
    couplers = [b for b in d["branches"] if b.get("type") == "bus_coupler"]
    assert len(couplers) == 1, "Układ H5 wymaga dokładnie jednego sprzęgła międzysekcyjnego"
    for tr_ref in substation["transformer_refs"]:
        tr = next(t for t in d["transformers"] if t["ref_id"] == tr_ref)
        assert tr["catalog_ref"] == "tr-wn-sn-110-15-16mva-yd11"


def test_gpz_target_segment_id_none_jest_akceptowany() -> None:
    """GPZ jest korzeniem modelu — `target_segment_id=None` NIE jest błędem."""
    template = get_template("tpl_gpz_110_15_2x16mva_h5")
    assert template is not None
    klucz = "v12t016:gpz-none-target"
    set_enm(klucz, EnergyNetworkModel.model_validate(_pusty_enm()))
    result = apply_template_to_case(template=template, klucz_twin=klucz, target_segment_id=None)
    assert result["station_ref"]


@pytest.mark.parametrize(
    "tpl_id",
    ["tpl_gpz_110_15_2x16mva_h5", "tpl_gpz_110_20_2x16mva_h5", "tpl_gpz_110_15_2x25mva_h5"],
)
def test_gpz_ze_wskazanym_odcinkiem_odmawia_zamiast_budowac_nowa_wyspe(tpl_id: str) -> None:
    """DEFEKT ZNALEZIONY PRZEZ NIEZMIENNIK E2E (2026-09-17): żądanie „wstaw
    szablon w odcinek X" dla szablonu GPZ kończyło się SUKCESEM, ale produkt
    robił co innego niż żądanie — budował NOWY korzeń modelu (własną wyspę
    przez `add_grid_source_sn`) i milczał o tej różnicy. W kreatorze wcięcia w
    magistralę 15 kV wybór szablonu GPZ 110/20 dawał osobną wyspę 20 kV obok,
    zamiast stacji w magistrali projektanta.

    Iloczyn cech: KAŻDY szablon GPZ × wskazany odcinek magistrali. Ciche
    rozejście się żądania z wykonaniem jest zakazane — odmowa NAZWANA."""
    template = get_template(tpl_id)
    assert template is not None
    base_enm, odcinki = _magistrala(15.0)
    klucz = f"v12t016:{tpl_id}-z-odcinkiem"
    set_enm(klucz, EnergyNetworkModel.model_validate(base_enm))
    with pytest.raises(TemplateApplyError) as wyjatek:
        apply_template_to_case(template=template, klucz_twin=klucz, target_segment_id=odcinki[0])
    assert wyjatek.value.code == "template.gpz_nie_wchodzi_w_segment"
    assert "korzeniem modelu" in wyjatek.value.message_pl
    # Model NIE zmienił się: odmowa przed jakąkolwiek mutacją.
    po_odmowie = get_enm(klucz).model_dump(mode="json")
    assert len(po_odmowie.get("substations") or []) == len(base_enm.get("substations") or [])


@pytest.mark.parametrize(
    "tpl_id",
    [
        "tpl_rs_2pola_sprzeglo",
        "tpl_abonencka_250kva_pomiar",
        "tpl_kompensacja_1v2mvar_15kv",
        "tpl_rezerwa_2kierunki_sprzeglo",
    ],
)
def test_szablon_niekgpz_bez_target_segment_id_konczy_sie_jawnym_bledem(tpl_id: str) -> None:
    """Iloczyn cech (KLASA NIE INSTANCJA): KAŻDA kategoria niebędąca GPZ musi
    odmówić `target_segment_id=None` jawnym błędem — nigdy cichym 500/None."""
    template = get_template(tpl_id)
    assert template is not None
    klucz = f"v12t016:{tpl_id}-none-target"
    set_enm(klucz, EnergyNetworkModel.model_validate(_pusty_enm()))
    with pytest.raises(TemplateApplyError) as wyjatek:
        apply_template_to_case(template=template, klucz_twin=klucz, target_segment_id=None)
    assert wyjatek.value.code == "template.target_segment_required"


def test_kompensacja_20kv_na_magistrali_15kv_odmawia_niezgodnoscia_napiecia() -> None:
    """Iloczyn cech: szablon 20 kV × magistrala INNEGO napięcia (15 kV) —
    domena musi odmówić jawnym błędem napięcia, nie zmaterializować baterię
    kondensatorów 20 kV na szynie 15 kV (fabrykacja niezgodności)."""
    template = get_template("tpl_kompensacja_1v8mvar_20kv")
    assert template is not None
    base_enm, odcinki = _magistrala(15.0)
    klucz = "v12t016:kompensacja-20kv-na-15kv"
    set_enm(klucz, EnergyNetworkModel.model_validate(base_enm))
    with pytest.raises(TemplateApplyError):
        apply_template_to_case(
            template=template,
            klucz_twin=klucz,
            target_segment_id=odcinki[1],
        )


def test_kazdy_szablon_20kv_poza_gpz_odmawia_na_magistrali_15kv() -> None:
    """KLASA, NIE INSTANCJA (2026-09-17): powyższy test pilnuje JEDNEGO szablonu
    kompensacji. Ten pilnuje KAŻDEGO szablonu o napięciu SN 20 kV, który wchodzi
    w odcinek (GPZ ma własną odmowę — jest korzeniem modelu): na magistrali
    15 kV żaden nie może się zmaterializować, a odmowa musi być NAZWANA.

    Bez tego testu nowy szablon 20 kV dowolnej kategorii mógłby cicho wejść na
    szynę 15 kV, dokładnie tak jak GPZ 110/20 przed tą naprawą.
    """
    from application.station_templates.schema import sn_voltage_kv

    kandydaci = [
        t
        for t in list_templates()
        if sn_voltage_kv(t) == 20.0 and t.category != TemplateCategory.GPZ_110_SN
    ]
    assert kandydaci, "brak szablonów 20 kV wchodzących w odcinek — test straciłby przedmiot"
    for template in kandydaci:
        base_enm, odcinki = _magistrala(15.0)
        klucz = f"v12t016:{template.id}-20kv-na-15kv"
        set_enm(klucz, EnergyNetworkModel.model_validate(base_enm))
        with pytest.raises(TemplateApplyError) as wyjatek:
            apply_template_to_case(
                template=template, klucz_twin=klucz, target_segment_id=odcinki[0]
            )
        assert wyjatek.value.code, f"{template.id}: odmowa musi mieć kod"
        assert wyjatek.value.message_pl, f"{template.id}: odmowa musi mieć komunikat po polsku"
