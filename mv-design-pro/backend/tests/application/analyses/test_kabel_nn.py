"""Kabel nN jako obiekt projektowy — obliczenia odcinka i dobór przekroju (karta OBIEKT-KABEL-NN).

Sieć testowa: SN → TR 630 kVA (TN-C-S) → RGnN → aparat → kabel nN z katalogu → odbiór.
Aparat i kabel są wiązane z katalogiem PRAWDZIWĄ operacją domenową
(`assign_catalog_to_element`) — tak jak robi to kreator i wybór wariantu.

Iloczyn cech (reguła KLASA, NIE INSTANCJA): rodzaj zabezpieczenia (MCB / wkładka gG z
rozłącznikiem / MCCB) × warunki ułożenia (katalogowe / grunt, 2 obwody) × wynik
(spełnia / narusza Iz′ / narusza SWZ). Do tego: zgodność liczb z NIEZALEŻNYM wywołaniem
dostawców (anty-cyrkularność), predykat „wariant = model po wyborze" (parami), brak biegów,
brak zabezpieczenia, determinizm.
"""

from __future__ import annotations

import json
from typing import Any

import pytest
from application.analyses.fault_loop.service import petla_zwarcia_min_w_punkcie
from application.analyses.kabel_nn import (
    K_DOBOR_ZABEZPIECZENIA,
    K_OBCIAZALNOSC,
    K_SPADEK_NAPIECIA,
    K_SWZ,
    K_WYTRZYMALOSC_CIEPLNA,
    K_ZDOLNOSC_WYLACZANIA,
    KOLEJNOSC_KRYTERIOW,
    lokalizuj_obwod_kabla_nn,
    obliczenia_kabla_nn,
    warianty_przekroju_kabla_nn,
    wejscie_dowodu_kabla_nn,
)
from application.analyses.nn_circuit_sheet import delta_u_dla_trasy
from application.proof_engine.packs.lv_circuit_verification import LVCircuitVerificationProofPack
from enm.canonical_analysis import (
    build_branch_results,
    create_run,
    execute_run,
    reset_canonical_runs,
)
from enm.domain_operations import assign_catalog_to_element
from enm.models import (
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    FuseBranch,
    Load,
    Source,
    Substation,
    SwitchBranch,
    Transformer,
)
from enm.scenariusze import (
    SCENARIUSZ_NORMALNY,
    OperatingScenario,
    RodzajScenariusza,
    ScenariuszNieprzystajeError,
    ZamianaKatalogu,
    apply_scenario,
)
from enm.store import reset_enm_store, set_enm
from network_model.catalog.materialization import materialize_catalog_binding
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.types import CatalogBinding
from network_model.solvers.cable_ampacity_derating import obciazalnosc_skorygowana, wspolczynniki_nn

CASE_ID = "case-kabel-nn"
WERSJA = "2024.1"
GRUNT_2_OBWODY = {
    "environment": "grunt",
    "insulation": "PVC",
    "ambient_temperature_c": 20.0,
    "circuit_count": 2,
    "soil_thermal_resistivity_km_w": 2.5,
}


@pytest.fixture(autouse=True)
def _reset() -> Any:
    reset_enm_store()
    reset_canonical_runs()
    yield
    reset_enm_store()
    reset_canonical_runs()


def _zwiaz(enm: dict[str, Any], ref: str, namespace: str, item: str) -> dict[str, Any]:
    wynik = assign_catalog_to_element(
        enm,
        {
            "element_ref": ref,
            "catalog_binding": {
                "catalog_namespace": namespace,
                "catalog_item_id": item,
                "catalog_item_version": WERSJA,
            },
        },
    )
    assert not wynik.get("error"), wynik.get("error")
    return wynik["snapshot"]


def _aparat(namespace: str, item: str) -> dict[str, Any]:
    """Wiązanie aparatu z katalogiem: pola materializacji z MATERIALIZATORA katalogu
    (kontrakt `MaterializationContract`) — te same, które zapisuje operacja tworzenia aparatu."""
    wynik = materialize_catalog_binding(
        CatalogBinding(
            catalog_namespace=namespace, catalog_item_id=item, catalog_item_version=WERSJA
        ),
        get_default_mv_catalog(),
    )
    assert wynik.success
    return {
        "catalog_namespace": namespace,
        "catalog_ref": item,
        "materialized_params": {"catalog_item_id": item, **wynik.solver_fields},
    }


def _siec(
    rodzaj: str = "MCB",
    *,
    ulozenie: dict[str, Any] | None = None,
    p_kw: float = 6.0,
    dlugosc_m: float = 40.0,
    typ_kabla: str = "kab_nn_yaky_4x16_al",
    bez_aparatu: bool = False,
) -> EnergyNetworkModel:
    """SN → TR → RGnN → [aparat] → kabel K → odbiór; aparat wg ``rodzaj``."""
    buses = [
        Bus(ref_id="sn", name="SN", voltage_kv=15.0),
        Bus(ref_id="nn", name="RGnN", voltage_kv=0.4),
        Bus(ref_id="b_ap", name="Za aparatem", voltage_kv=0.4),
        Bus(ref_id="b_end", name="Odbiór", voltage_kv=0.4),
    ]
    branches: list[Any] = []
    if bez_aparatu:
        buses = [b for b in buses if b.ref_id != "b_ap"]
        poczatek = "nn"
    elif rodzaj == "MCB":
        branches.append(
            SwitchBranch(
                ref_id="ap",
                name="Wyłącznik MCB",
                type="breaker",
                from_bus_ref="nn",
                to_bus_ref="b_ap",
                **_aparat("APARAT_NN_MCB", "mcb_nn_b16a"),
            )
        )
        poczatek = "b_ap"
    elif rodzaj == "MCCB":
        branches.append(
            SwitchBranch(
                ref_id="ap",
                name="Wyłącznik MCCB",
                type="breaker",
                from_bus_ref="nn",
                to_bus_ref="b_ap",
                **_aparat("APARAT_NN", "cb_nn_100a"),
            )
        )
        poczatek = "b_ap"
    else:  # gG: korpus rozłącznika + wkładka
        buses.append(Bus(ref_id="b_rb", name="Za rozłącznikiem", voltage_kv=0.4))
        branches.append(
            SwitchBranch(
                ref_id="rb",
                name="Rozłącznik bezpiecznikowy",
                type="switch",
                from_bus_ref="nn",
                to_bus_ref="b_rb",
                **_aparat("APARAT_NN", "rb_nn_100a"),
            )
        )
        branches.append(
            FuseBranch(
                ref_id="ap",
                name="Wkładka gG",
                from_bus_ref="b_rb",
                to_bus_ref="b_ap",
                **_aparat("WKLADKA_NN", "fuse_nn_gg_nh00_25a"),
            )
        )
        poczatek = "b_ap"
    branches.append(
        Cable(
            ref_id="k1",
            name="Kabel K1",
            from_bus_ref=poczatek,
            to_bus_ref="b_end",
            length_km=dlugosc_m / 1000.0,
            r_ohm_per_km=1.0,
            x_ohm_per_km=0.08,
            meta={"cable_laying_conditions": ulozenie} if ulozenie else {},
        )
    )
    enm = EnergyNetworkModel(
        header=ENMHeader(name="Kabel nN", defaults=ENMDefaults(sn_nominal_kv=15.0)),
        buses=buses,
        sources=[
            Source(
                ref_id="src",
                name="GPZ",
                bus_ref="sn",
                model="thevenin",
                r_ohm=0.1,
                x_ohm=0.5,
                catalog_ref="siec-sn-referencyjna",
            )
        ],
        transformers=[
            Transformer(
                ref_id="tr",
                name="TR1",
                hv_bus_ref="sn",
                lv_bus_ref="nn",
                sn_mva=0.63,
                uhv_kv=15.0,
                ulv_kv=0.4,
                uk_percent=4.0,
                pk_kw=6.5,
                vector_group="Dyn11",
                lv_earthing_system="TN-C-S",
                catalog_ref="tr-630kva-referencyjny",
            )
        ],
        loads=[
            Load(
                ref_id="ld",
                name="Odbiór K1",
                bus_ref="b_end",
                p_mw=p_kw / 1000.0,
                q_mvar=p_kw / 1000.0 * 0.33,
            )
        ],
        branches=branches,
        substations=[
            Substation(
                ref_id="stn",
                name="Stacja 1",
                station_type="mv_lv",
                bus_refs=["nn"],
                transformer_refs=["tr"],
            )
        ],
    )
    dane = _zwiaz(enm.model_dump(mode="json"), "k1", "KABEL_NN", typ_kabla)
    return EnergyNetworkModel.model_validate(dane)


def _z_biegami(enm: EnergyNetworkModel) -> EnergyNetworkModel:
    set_enm(CASE_ID, enm)
    for rodzaj in ("PF", "short_circuit_sn"):
        bieg = execute_run(create_run(case_id=CASE_ID, klucz_twin=CASE_ID, analysis_type=rodzaj).id)
        assert bieg.status == "FINISHED", bieg.error_message
    return enm


def _kryterium(wynik: dict[str, Any], kryterium_id: str) -> dict[str, Any]:
    return next(k for k in wynik["kryteria"] if k["kryterium_id"] == kryterium_id)


def _wielkosc(wynik: dict[str, Any], kod: str) -> dict[str, Any]:
    return next(w for w in wynik["wielkosci"] if w["kod"] == kod)


# =============================================================================
# Obwód kabla: stacja, transformator, zabezpieczenie
# =============================================================================


class TestObwod:
    @pytest.mark.parametrize("rodzaj", ["MCB", "MCCB", "gG"])
    def test_zabezpieczenie_to_najblizszy_aparat_przed_kablem(self, rodzaj: str) -> None:
        obwod, odmowa = lokalizuj_obwod_kabla_nn(_siec(rodzaj), "k1")
        assert odmowa is None and obwod is not None
        assert obwod.trafo.ref_id == "tr"
        assert obwod.aparat is not None and obwod.aparat.ref_id == "ap"
        assert (obwod.szyna_poczatku, obwod.szyna_konca) == ("b_ap", "b_end")
        if rodzaj == "gG":
            assert obwod.aparat_korpus is not None and obwod.aparat_korpus.ref_id == "rb"
        else:
            assert obwod.aparat_korpus is None

    def test_kabel_sn_nie_dotyczy(self) -> None:
        enm = _siec()
        enm = enm.model_copy(
            update={
                "branches": [
                    *enm.branches,
                    Cable(
                        ref_id="ksn",
                        name="Kabel SN",
                        from_bus_ref="sn",
                        to_bus_ref="sn2",
                        length_km=0.3,
                        r_ohm_per_km=0.2,
                        x_ohm_per_km=0.1,
                    ),
                ],
                "buses": [*enm.buses, Bus(ref_id="sn2", name="SN2", voltage_kv=15.0)],
            }
        )
        obwod, odmowa = lokalizuj_obwod_kabla_nn(enm, "ksn")
        assert obwod is None and odmowa is not None and odmowa["status"] == "nie dotyczy"


# =============================================================================
# Liczby z niezależnych dostawców (anty-cyrkularność)
# =============================================================================


class TestZgodnoscZDostawcami:
    def test_ib_du_iz_ik1_rowne_niezaleznym_wywolaniom(self) -> None:
        enm = _z_biegami(_siec("MCB", ulozenie=GRUNT_2_OBWODY))
        wynik = obliczenia_kabla_nn(enm, "k1", case_id=CASE_ID)
        assert wynik["status"] == "OK"
        assert [k["kryterium_id"] for k in wynik["kryteria"]] == list(KOLEJNOSC_KRYTERIOW)

        # Ib = prąd zacisku kabla w NIEZALEŻNYM biegu rozpływu na tym samym modelu.
        pf = execute_run(create_run(case_id=CASE_ID, klucz_twin=CASE_ID, analysis_type="PF").id)
        wiersz = next(r for r in build_branch_results(pf)["rows"] if r["element_id"] == "k1")
        assert _wielkosc(wynik, "ib")["wartosc"] == pytest.approx(wiersz["i_a"], rel=1e-6)
        assert _wielkosc(wynik, "straty_w")["wartosc"] == pytest.approx(
            wiersz["losses_p_mw"] * 1e6, rel=1e-6
        )
        # Iz′ = jedyne mnożenie solvera z warunków zapisanych w modelu.
        wsp = wspolczynniki_nn(
            srodowisko="grunt",
            izolacja="PVC",
            temperatura_c=20.0,
            liczba_obwodow=2,
            rezystywnosc_gruntu_km_w=2.5,
        )
        assert _wielkosc(wynik, "iz_prim")["wartosc"] == pytest.approx(
            obciazalnosc_skorygowana(85.0, wsp)
        )
        # ΔU do końca = dekompozycja biegu rozpływu (ta sama co arkusz obwodów).
        obwod, _ = lokalizuj_obwod_kabla_nn(enm, "k1")
        assert obwod is not None
        du = delta_u_dla_trasy(pf, obwod.sciezka.branches, "b_end")
        rekord_du = _kryterium(wynik, K_SPADEK_NAPIECIA)["rekord"]
        assert rekord_du["wynik"]["wartosc"]["wartosc"] == pytest.approx(
            du["wartosc"]["calkowity_procent"], abs=1e-6
        )
        # Ik1 min = pętla zwarcia minimalnego w punkcie końca odcinka.
        petla, _b, _p, _k = petla_zwarcia_min_w_punkcie(enm, "stn", "b_end")
        assert petla is not None
        assert _wielkosc(wynik, "ik1_min_koniec")["wartosc"] == pytest.approx(
            petla.fault_loop.ik_min_a, rel=1e-6
        )

    def test_szczegol_wiersza_to_kroki_pakietu_bez_ogranicznikow(self) -> None:
        enm = _z_biegami(_siec("MCB"))
        wynik = obliczenia_kabla_nn(enm, "k1", case_id=CASE_ID)
        k1 = _kryterium(wynik, K_OBCIAZALNOSC)
        assert [k["nazwa_wzoru_pl"] for k in k1["szczegoly"]] == [
            "Moc pozorna",
            "Prąd obliczeniowy obwodu",
            "Obciążalność dopuszczalna po korektach (Iz′)",
        ]
        for krok in k1["szczegoly"]:
            assert "$$" not in krok["podstawienie_latex"]
            assert krok["wzor_latex"] and krok["parametry"]
        assert k1["sprawdzenie_latex"] and "\\le" in k1["sprawdzenie_latex"]


# =============================================================================
# Iloczyn cech: rodzaj zabezpieczenia × ułożenie × wynik
# =============================================================================

_PRZYPADKI = {
    # przypadek: (parametry sieci wg rodzaju aparatu)
    "spelnia": {"MCB": {}, "gG": {}, "MCCB": {"p_kw": 40.0, "typ_kabla": "kab_nn_yaky_4x35_al"}},
    "narusza_iz": {
        "MCB": {"p_kw": 70.0},
        "gG": {"p_kw": 70.0},
        "MCCB": {"p_kw": 110.0, "typ_kabla": "kab_nn_yaky_4x35_al"},
    },
    "narusza_swz": {
        "MCB": {"dlugosc_m": 1200.0},
        "gG": {"dlugosc_m": 2500.0},
        "MCCB": {"dlugosc_m": 400.0, "typ_kabla": "kab_nn_yaky_4x35_al", "p_kw": 10.0},
    },
}


@pytest.mark.parametrize("rodzaj", ["MCB", "gG", "MCCB"])
@pytest.mark.parametrize("ulozenie", [None, GRUNT_2_OBWODY], ids=["katalogowe", "grunt2"])
@pytest.mark.parametrize("przypadek", ["spelnia", "narusza_iz", "narusza_swz"])
def test_iloczyn_rodzaj_ulozenie_wynik(rodzaj: str, ulozenie: Any, przypadek: str) -> None:
    enm = _z_biegami(_siec(rodzaj, ulozenie=ulozenie, **_PRZYPADKI[przypadek][rodzaj]))
    wynik = obliczenia_kabla_nn(enm, "k1", case_id=CASE_ID)
    assert wynik["status"] == "OK", wynik
    k1 = _kryterium(wynik, K_OBCIAZALNOSC)
    k7 = _kryterium(wynik, K_SWZ)
    # Każde kryterium ma rekord z wyjaśnieniem i ocenę techniczną — nigdy goły status.
    for kryt in wynik["kryteria"]:
        assert kryt["rekord"]["wyjasnienie"]["zdanie_pl"]
        assert kryt["ocena_techniczna_pl"]
    # Iz′ zależy od warunków ułożenia (grunt, 2 obwody → mniejsza obciążalność).
    iz = _wielkosc(wynik, "iz")["wartosc"]
    iz_prim = _wielkosc(wynik, "iz_prim")["wartosc"]
    assert (iz_prim < iz) if ulozenie else (iz_prim == pytest.approx(iz))
    if przypadek == "narusza_iz":
        assert k1["ocena_semantyka"] == "negatywna", k1["ocena_techniczna_pl"]
    else:
        assert k1["ocena_semantyka"] == "pozytywna", k1["ocena_techniczna_pl"]
    if przypadek == "narusza_swz":
        assert k7["ocena_semantyka"] == "negatywna", k7["ocena_techniczna_pl"]
    elif przypadek == "spelnia" and rodzaj != "gG":
        assert k7["ocena_semantyka"] == "pozytywna", k7["ocena_techniczna_pl"]
    # Wytrzymałość cieplna: czas z charakterystyki normowej — MCB/MCCB liczone, gG nie
    # (rejestr bramek bez czasu krótszego niż umowny) — nigdy „zapas" bez czasu.
    k5 = _kryterium(wynik, K_WYTRZYMALOSC_CIEPLNA)
    if rodzaj == "gG":
        assert k5["ocena_semantyka"] == "neutralna"
        assert k5["rekord"]["wynik"] is None
    else:
        assert k5["rekord"]["wynik"] is not None
    # Zdolność wyłączania liczona zawsze dla aparatu z katalogu (gG: kombinacja z rozłącznikiem).
    assert _kryterium(wynik, K_ZDOLNOSC_WYLACZANIA)["rekord"]["limit"] is not None


def test_swz_gg_nierozstrzygalne_nie_jest_zapasem() -> None:
    """Predykat parami: Ia z werdyktu SWZ nierozstrzygalnego nie staje się „zapasem"."""
    enm = _z_biegami(_siec("gG"))
    wynik = obliczenia_kabla_nn(enm, "k1", case_id=CASE_ID)
    k7 = _kryterium(wynik, K_SWZ)
    assert k7["ocena_semantyka"] != "pozytywna"


# =============================================================================
# Braki: bez biegów, bez zabezpieczenia
# =============================================================================


def test_bez_biegow_nazwany_brak_a_obciazalnosc_i_petla_dalej_liczone() -> None:
    enm = _siec("MCB")
    set_enm(CASE_ID, enm)
    wynik = obliczenia_kabla_nn(enm, "k1", case_id=CASE_ID)
    assert wynik["status"] == "OK"
    assert wynik["brakujace_biegi"] == ["LOAD_FLOW", "SC_3F"]
    k1 = _kryterium(wynik, K_OBCIAZALNOSC)
    assert k1["ocena_semantyka"] == "neutralna"
    assert "rozpływ" in k1["ocena_techniczna_pl"]
    assert _wielkosc(wynik, "iz_prim")["wartosc"] == pytest.approx(85.0)
    assert _wielkosc(wynik, "ik1_min_koniec")["wartosc"] is not None


def test_bez_zabezpieczenia_nazwany_brak_aparatu() -> None:
    enm = _z_biegami(_siec("MCB", bez_aparatu=True))
    wynik = obliczenia_kabla_nn(enm, "k1", case_id=CASE_ID)
    k2 = _kryterium(wynik, K_DOBOR_ZABEZPIECZENIA)
    assert k2["ocena_semantyka"] == "neutralna"
    assert "zabezpieczenie odcinka" in k2["ocena_techniczna_pl"]
    assert wynik["obwod"]["aparat_ref"] is None


def test_determinizm_dwoch_wywolan() -> None:
    enm = _z_biegami(_siec("MCB", ulozenie=GRUNT_2_OBWODY))
    a = json.dumps(obliczenia_kabla_nn(enm, "k1", case_id=CASE_ID), sort_keys=True)
    b = json.dumps(obliczenia_kabla_nn(enm, "k1", case_id=CASE_ID), sort_keys=True)
    assert a == b


# =============================================================================
# Dobór przekroju — warianty
# =============================================================================


class TestWarianty:
    def test_kandydaci_z_rodziny_i_rekomendacja_najmniejszy_bez_przekroczen(self) -> None:
        enm = _z_biegami(_siec("MCB", p_kw=70.0))  # 4x16: Ib ≈ 106 A > Iz 85 A
        wynik = warianty_przekroju_kabla_nn(enm, "k1", case_id=CASE_ID)
        assert wynik["status"] == "OK"
        przekroje = [v["przekroj_mm2"] for v in wynik["warianty"]]
        assert przekroje == sorted(przekroje)
        assert {v["material"] for v in wynik["warianty"]} == {"AL"}
        assert {v["izolacja"] for v in wynik["warianty"]} == {"PVC"}
        biezacy = next(v for v in wynik["warianty"] if v["biezacy"])
        assert biezacy["catalog_item_id"] == "kab_nn_yaky_4x16_al"
        assert not biezacy["bez_przekroczen"]
        rekomendacja = next(
            v for v in wynik["warianty"] if v["catalog_item_id"] == wynik["rekomendacja"]
        )
        assert rekomendacja["bez_przekroczen"]
        assert rekomendacja["przekroj_mm2"] > biezacy["przekroj_mm2"]
        # Większy przekrój → mniejszy spadek napięcia (fizyka solvera, nie domysł).
        assert rekomendacja["du_konca_procent"] < biezacy["du_konca_procent"]

    def test_wariant_rowny_modelowi_po_wyborze(self) -> None:
        """Predykat PARAMI: liczby wariantu = liczby obiektu po wykonaniu wyboru w modelu."""
        enm = _z_biegami(_siec("MCB", ulozenie=GRUNT_2_OBWODY, p_kw=70.0))
        warianty = warianty_przekroju_kabla_nn(enm, "k1", case_id=CASE_ID)
        wybrany = next(
            v for v in warianty["warianty"] if v["catalog_item_id"] == warianty["rekomendacja"]
        )
        dane = assign_catalog_to_element(
            enm.model_dump(mode="json"),
            {"element_ref": "k1", "catalog_binding": wybrany["catalog_binding"]},
        )
        po_wyborze = EnergyNetworkModel.model_validate(dane["snapshot"])
        # Warunki ułożenia przechodzą na nowy przekrój.
        kabel = next(b for b in po_wyborze.branches if b.ref_id == "k1")
        assert kabel.meta["cable_laying_conditions"] == GRUNT_2_OBWODY
        set_enm(CASE_ID, po_wyborze)
        obliczenia = obliczenia_kabla_nn(po_wyborze, "k1", case_id=CASE_ID)
        assert _wielkosc(obliczenia, "ib")["wartosc"] == pytest.approx(wybrany["ib_a"])
        assert _wielkosc(obliczenia, "iz_prim")["wartosc"] == pytest.approx(wybrany["iz_prime_a"])
        assert _wielkosc(obliczenia, "ik1_min_koniec")["wartosc"] == pytest.approx(
            wybrany["ik1_min_a"]
        )
        assert [k["ocena_semantyka"] for k in obliczenia["kryteria"]] == [
            k["ocena_semantyka"] for k in wybrany["kryteria"]
        ]


# =============================================================================
# Scenariusz z zamianą katalogu
# =============================================================================


class TestZamianaKatalogu:
    def test_scenariusz_bez_zamian_ma_niezmieniony_hash_tresci(self) -> None:
        assert "zamiany_katalogu" not in SCENARIUSZ_NORMALNY.tresc()

    def test_zamiana_nieistniejacego_elementu_to_odmowa_nazwana(self) -> None:
        scen = OperatingScenario(
            scenario_id="__test_zamiany__",
            name="t",
            kind=RodzajScenariusza.SIZING,
            zamiany_katalogu=(
                ZamianaKatalogu(
                    element_ref="brak",
                    catalog_namespace="KABEL_NN",
                    catalog_item_id="kab_nn_yaky_4x25_al",
                ),
            ),
        )
        with pytest.raises(ScenariuszNieprzystajeError):
            apply_scenario(_siec(), scen)

    def test_zamiana_zostawia_proweniencje_i_zmienia_hash(self) -> None:
        enm = _siec()
        scen = OperatingScenario(
            scenario_id="__test_zamiany__",
            name="t",
            kind=RodzajScenariusza.SIZING,
            zamiany_katalogu=(
                ZamianaKatalogu(
                    element_ref="k1",
                    catalog_namespace="KABEL_NN",
                    catalog_item_id="kab_nn_yaky_4x25_al",
                    catalog_item_version=WERSJA,
                ),
            ),
        )
        migawka = apply_scenario(enm, scen)
        assert migawka.snapshot_hash != migawka.base_hash
        assert [n.pole for n in migawka.nadpisania] == ["catalog_ref"]
        kabel = next(b for b in migawka.snapshot["branches"] if b["ref_id"] == "k1")
        typ = get_default_mv_catalog().get_lv_cable_type("kab_nn_yaky_4x25_al")
        assert typ is not None
        assert kabel["r_ohm_per_km"] == pytest.approx(typ.r_ohm_per_km)


# =============================================================================
# Dowód obwodu z modelu i biegu
# =============================================================================


def test_dowod_z_modelu_ma_11_krokow_i_nazwe_odcinka_z_modelu() -> None:
    enm = _z_biegami(_siec("MCB"))
    wynik = wejscie_dowodu_kabla_nn(
        enm, "k1", case_id=CASE_ID, project_name="Projekt", case_name="Przypadek"
    )
    assert wynik["status"] == "OK", wynik
    wejscie = wynik["wejscie"]
    assert wejscie.nazwa_odcinka == "Kabel K1"  # do karty: zawsze „element spoza modelu"
    doc = LVCircuitVerificationProofPack.generate(wejscie)
    assert doc.summary.total_steps == 11
    obliczenia = obliczenia_kabla_nn(enm, "k1", case_id=CASE_ID)
    krok2 = next(s for s in doc.steps if s.step_number == 2)
    assert krok2.result.value == pytest.approx(_wielkosc(obliczenia, "ib")["wartosc"], rel=1e-6)


def test_dowod_bez_biegu_rozplywu_to_nazwana_odmowa() -> None:
    enm = _siec("MCB")
    set_enm(CASE_ID, enm)
    wynik = wejscie_dowodu_kabla_nn(enm, "k1", case_id=CASE_ID, project_name="P", case_name="C")
    assert wynik["status"] == "brak danych"
    assert wynik["missing_data"] == ["load_flow_run"]
