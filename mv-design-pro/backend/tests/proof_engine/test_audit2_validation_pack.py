"""
Testy ProofPack audytu 2 (Phase 4).

5 typow dowodow + agregator + determinizm.
"""

from __future__ import annotations

import pytest
from application.proof_engine.packs.audit2_validation import (
    BrakDanychDowodu,
    SpecDowoduEksportuStacji,
    SpecDowoduPlanuZaczepow,
    SpecDowoduTrybowBess,
    SpecDowoduUziemieniaPrzekladnika,
    SpecDowoduWytrzymalosciAparatu,
    generate_bess_modes_proof,
    generate_device_withstand_proof,
    generate_hosting_capacity_export_proof,
    generate_station_audit2_proof_pack,
    generate_tap_changer_plan_proof,
    generate_vt_grounding_validation_proof,
)
from pydantic import ValidationError


def test_bess_modes_proof_passes_with_compatible_pcs():
    proof = generate_bess_modes_proof(
        SpecDowoduTrybowBess(
            der_id="der_bess_001",
            der_nazwa="Magazyn energii 001",
            pcs_four_quadrant=True,
            pcs_grid_forming=True,
            selected_mode_refs=["mode_fcr_n", "mode_voltage_support"],
        ),
        generated_at_iso="2026-04-01T00:00:00Z",
    )
    assert proof.pass_status is True
    assert "OK" in proof.summary_pl


def test_bess_modes_proof_fails_when_pcs_lacks_4q():
    proof = generate_bess_modes_proof(
        SpecDowoduTrybowBess(
            der_id="der_bess_002",
            der_nazwa="Magazyn energii 002",
            pcs_four_quadrant=False,
            pcs_grid_forming=False,
            selected_mode_refs=["mode_fcr_n"],  # Wymaga 4Q
        ),
        generated_at_iso="2026-04-01T00:00:00Z",
    )
    assert proof.pass_status is False
    assert "4-quadrant" in proof.summary_pl or any(
        "4-quadrant" in i for i in proof.details["issues"]
    )


def test_dowod_nie_zarzuca_juz_braku_trybu_wymaganego_przez_norme():
    """Karta K-Q — obalona deklaracja normatywna.

    INTENCJA POPRZEDNIEGO TESTU: pilnowal, ze dowod zglasza niezgodnosc, gdy
    modul typu C nie ma wybranego „wymaganego" trybu (FCR-N, Q(U)). Sprawdzone
    na tekscie rozporzadzenia 2016/631: ono nie nakazuje modulom wytworczym
    swiadczenia FCR-N / FCR-D / aFRR / mFRR — to produkty rynku bilansujacego.
    Dowod oglaszal wiec niezgodnosc z norma, ktorej nie ma, i szedl z tym do
    pakietu dowodowego. Sprawdzenie ZDOLNOSCI przeksztaltnika zostalo (test
    ponizej), bo ono wynika z definicji uslugi.

    KANON PO KARCIE PROOFPACK-KONTRAKT: pusta lista trybow nie jest juz dowodem (to brak
    danych — pakiet stacji oznacza go jawnie), wiec intencje przypina tryb, ktory nie
    wymaga zadnej zdolnosci (redukcja szczytow): dowod nie dokleja „wymaganego trybu".
    """
    proof = generate_bess_modes_proof(
        SpecDowoduTrybowBess(
            der_id="der_bess_003",
            der_nazwa="Magazyn energii 003",
            pcs_four_quadrant=True,
            pcs_grid_forming=False,
            selected_mode_refs=["mode_peak_shaving"],
        ),
        generated_at_iso="2026-04-01T00:00:00Z",
    )
    assert proof.pass_status is True
    assert proof.details["issues"] == []
    assert "required_modes_for_module" not in proof.details
    assert not any("wymaganego trybu" in formula for formula in proof.formulas_latex)


def test_tap_changer_plan_proof_passes_for_oltc_110sn():
    proof = generate_tap_changer_plan_proof(
        SpecDowoduPlanuZaczepow(
            transformer_id="tr_001",
            transformer_nazwa="Transformator T1",
            transformer_type="transformer_110_15",
            tap_changer_ref="tc_oltc_110sn_19_125",
            requires_avr=True,
        ),
        generated_at_iso="2026-04-01T00:00:00Z",
    )
    assert proof.pass_status is True


def test_tap_changer_plan_fails_when_avr_required_but_detc():
    proof = generate_tap_changer_plan_proof(
        SpecDowoduPlanuZaczepow(
            transformer_id="tr_002",
            transformer_nazwa="Transformator T2",
            transformer_type="transformer_15_04",
            tap_changer_ref="tc_detc_snnn_5_25",  # DETC nie ma AVR
            requires_avr=True,
        ),
        generated_at_iso="2026-04-01T00:00:00Z",
    )
    assert proof.pass_status is False
    assert any("AVR" in i for i in proof.details["issues"])


def test_tap_changer_plan_fails_for_wrong_transformer_type():
    proof = generate_tap_changer_plan_proof(
        SpecDowoduPlanuZaczepow(
            transformer_id="tr_003",
            transformer_nazwa="Transformator T3",
            transformer_type="transformer_15_04",
            tap_changer_ref="tc_oltc_110sn_19_125",  # 110/SN nie pasuje
            requires_avr=False,
        ),
        generated_at_iso="2026-04-01T00:00:00Z",
    )
    assert proof.pass_status is False


def test_hosting_capacity_proof_passes_for_normal_export():
    proof = generate_hosting_capacity_export_proof(
        SpecDowoduEksportuStacji(
            station_id="station_001",
            p_export_kw=1200,
            p_import_kw=1000,
        ),
        generated_at_iso="2026-04-01T00:00:00Z",
    )
    assert proof.pass_status is True
    assert proof.details["status"] == "normal_export"


def test_hosting_capacity_proof_fails_for_critical_export():
    proof = generate_hosting_capacity_export_proof(
        SpecDowoduEksportuStacji(
            station_id="station_002",
            p_export_kw=5000,
            p_import_kw=1000,
        ),
        generated_at_iso="2026-04-01T00:00:00Z",
    )
    assert proof.pass_status is False
    assert proof.details["status"] == "requires_ramp_down"


def test_device_withstand_proof_passes_within_limits():
    proof = generate_device_withstand_proof(
        SpecDowoduWytrzymalosciAparatu(
            bay_designation="Pole 01",
            device_id="wstd_breaker_vacuum_15_25",
            i_peak_calculated_ka=50,
            i_thermal_calculated_ka=20,
            t_clearing_s=1.0,
        ),
        generated_at_iso="2026-04-01T00:00:00Z",
    )
    assert proof.pass_status is True


def test_device_withstand_proof_fails_idyn_exceeded():
    proof = generate_device_withstand_proof(
        SpecDowoduWytrzymalosciAparatu(
            bay_designation="Pole 01",
            device_id="wstd_breaker_vacuum_15_25",
            i_peak_calculated_ka=70,  # > 63 kA limit
            i_thermal_calculated_ka=20,
            t_clearing_s=1.0,
        ),
        generated_at_iso="2026-04-01T00:00:00Z",
    )
    assert proof.pass_status is False
    assert "I_dyn" in proof.summary_pl


def test_vt_grounding_proof_passes_for_19_petersen():
    proof = generate_vt_grounding_validation_proof(
        SpecDowoduUziemieniaPrzekladnika(
            bay_designation="POLE-01",
            vt_voltage_factor=1.9,
            grounding_type="petersen_coil",
        ),
        generated_at_iso="2026-04-01T00:00:00Z",
    )
    assert proof.pass_status is True


def test_vt_grounding_proof_fails_for_15_isolated():
    proof = generate_vt_grounding_validation_proof(
        SpecDowoduUziemieniaPrzekladnika(
            bay_designation="POLE-02",
            vt_voltage_factor=1.5,
            grounding_type="isolated",
        ),
        generated_at_iso="2026-04-01T00:00:00Z",
    )
    assert proof.pass_status is False
    assert "1.9" in proof.summary_pl


def test_vt_grounding_proof_unknown_type():
    """INTENCJA (bez zmian): typ uziemienia spoza slownika nie daje zgodnosci. KANON PO
    KARCIE PROOFPACK-KONTRAKT: nie dociera do generatora wcale — odrzuca go kontrakt
    specyfikacji (`TypPunktuNeutralnego`), a pakiet stacji oznacza wpis spoza katalogu
    uziemien jako brak danych (`test_audit2_skladanie.py`)."""
    with pytest.raises(ValidationError):
        SpecDowoduUziemieniaPrzekladnika(
            bay_designation="POLE-03",
            vt_voltage_factor=1.9,
            grounding_type="unknown_grounding",
        )


def test_station_audit2_proof_pack_aggregates_proofs():
    proofs = [
        generate_hosting_capacity_export_proof(
            SpecDowoduEksportuStacji(
                station_id="station_X",
                p_export_kw=1200,
                p_import_kw=1000,
            ),
        ),
        generate_vt_grounding_validation_proof(
            SpecDowoduUziemieniaPrzekladnika(
                bay_designation="POLE-01",
                vt_voltage_factor=1.9,
                grounding_type="petersen_coil",
            ),
        ),
    ]
    pack = generate_station_audit2_proof_pack(
        station_id="station_X", station_nazwa="Stacja X", proofs=proofs
    )
    assert pack.station_id == "station_X"
    assert pack.all_pass is True
    assert pack.fail_count == 0
    assert len(pack.proofs) == 2


def test_station_audit2_proof_pack_reports_failures():
    proofs = [
        generate_hosting_capacity_export_proof(
            SpecDowoduEksportuStacji(
                station_id="station_Y",
                p_export_kw=5000,
                p_import_kw=1000,  # requires_ramp_down -> FAIL
            ),
        ),
        generate_vt_grounding_validation_proof(
            SpecDowoduUziemieniaPrzekladnika(
                bay_designation="POLE-02",
                vt_voltage_factor=1.5,
                grounding_type="isolated",  # requires 1.9 -> FAIL
            ),
        ),
    ]
    pack = generate_station_audit2_proof_pack(
        station_id="station_Y", station_nazwa="Stacja Y", proofs=proofs
    )
    assert pack.all_pass is False
    assert pack.fail_count == 2


def test_determinism_same_input_same_output():
    """Identyczny input -> identyczny output (DETERMINISM Rule)."""
    p1 = generate_device_withstand_proof(
        SpecDowoduWytrzymalosciAparatu(
            bay_designation="Pole 01",
            device_id="wstd_breaker_vacuum_15_25",
            i_peak_calculated_ka=50,
            i_thermal_calculated_ka=20,
            t_clearing_s=1.0,
        ),
        generated_at_iso="2026-04-01T00:00:00Z",
    )
    p2 = generate_device_withstand_proof(
        SpecDowoduWytrzymalosciAparatu(
            bay_designation="Pole 01",
            device_id="wstd_breaker_vacuum_15_25",
            i_peak_calculated_ka=50,
            i_thermal_calculated_ka=20,
            t_clearing_s=1.0,
        ),
        generated_at_iso="2026-04-01T00:00:00Z",
    )
    assert p1.to_dict() == p2.to_dict()
    # Identyfikator dowodu wyprowadzony z danych (UUID v5), nie losowany.
    assert p1.proof_id == p2.proof_id


def test_brak_wspolczynnika_daje_dowod_NIEZALICZONY_a_nie_domyslne_19() -> None:
    """Nieznany wspolczynnik napieciowy nie moze stac sie liczba (V12K-258).

    Wolajacy podstawial `VT_CATALOG_FOR_FACTOR.get(vt_ref, 1.9)` — czteroelementowa mapa
    syntetycznych identyfikatorow frontu z wartoscia domyslna 1,9. Kazdy typ spoza tej
    mapy (czyli KAZDY typ z realnego katalogu) dostawal wspolczynnik z powietrza, a
    pakiet dowodowy oglaszal na tej podstawie ZGODNOSC. Brak danej musi byc widoczny
    w dokumencie, bo dokument jest dowodem.
    """
    dowod = generate_vt_grounding_validation_proof(
        SpecDowoduUziemieniaPrzekladnika(
            bay_designation="J01",
            vt_voltage_factor=None,
            grounding_type="petersen_coil",
        ),
    )
    assert dowod.pass_status is False
    assert "nieznany" in dowod.summary_pl.lower()
    assert dowod.details["vt_voltage_factor"] is None
    # Wzor bez danych nie jest dowodem — nie udajemy rachunku.
    assert dowod.formulas_latex == []


@pytest.mark.parametrize(
    ("four_quadrant", "grid_forming", "zgodny"),
    [(True, True, True), (False, False, False)],
    ids=["zgodny", "niezgodny"],
)
def test_teksty_dowodu_trybow_bess_nazywaja_zrodlo_nazwa_nigdy_identyfikatorem(
    four_quadrant: bool, grid_forming: bool, zgodny: bool
) -> None:
    """Karta #144: podsumowanie i pozycje kontroli nazywają źródło nazwą z modelu;
    identyfikator zostaje wyłącznie w `details` (iloczyn: wynik zgodny / niezgodny)."""
    proof = generate_bess_modes_proof(
        SpecDowoduTrybowBess(
            der_id="der/9f3c21aa/bess",
            der_nazwa="Magazyn energii Łąkowa",
            pcs_four_quadrant=four_quadrant,
            pcs_grid_forming=grid_forming,
            selected_mode_refs=["mode_fcr_n", "mode_voltage_support"],
        ),
        generated_at_iso="2026-04-01T00:00:00Z",
    )
    assert proof.pass_status is zgodny
    teksty = [proof.summary_pl, *proof.details["issues"]]
    assert "Magazyn energii Łąkowa" in proof.summary_pl
    assert all("der/9f3c21aa/bess" not in tekst for tekst in teksty)
    assert proof.details["der_id"] == "der/9f3c21aa/bess"


@pytest.mark.parametrize("requires_avr", [False, True], ids=["bez_avr", "z_avr"])
def test_teksty_dowodu_zaczepow_nazywaja_transformator_nazwa(requires_avr: bool) -> None:
    proof = generate_tap_changer_plan_proof(
        SpecDowoduPlanuZaczepow(
            transformer_id="transformer/5b0f7d1e",
            transformer_nazwa="Transformator T1 stacji Łąkowa",
            transformer_type="transformer_15_04",
            tap_changer_ref="tc_detc_snnn_5_25",
            requires_avr=requires_avr,
        ),
        generated_at_iso="2026-04-01T00:00:00Z",
    )
    teksty = [proof.summary_pl, *proof.details["issues"]]
    assert "Transformator T1 stacji Łąkowa" in proof.summary_pl
    assert all("transformer/5b0f7d1e" not in tekst for tekst in teksty)


# =============================================================================
# Kontrakt wejscia: typowana specyfikacja = sygnatura generatora (karta PROOFPACK-KONTRAKT)
# =============================================================================

_SPECYFIKACJE_POPRAWNE = {
    "bess": (
        SpecDowoduTrybowBess,
        {
            "der_id": "d1",
            "der_nazwa": "Magazyn 1",
            "pcs_four_quadrant": True,
            "pcs_grid_forming": None,
            "selected_mode_refs": ["mode_peak_shaving"],
        },
    ),
    "zaczepy": (
        SpecDowoduPlanuZaczepow,
        {
            "transformer_id": "t1",
            "transformer_nazwa": "T1",
            "transformer_type": "transformer_15_04",
            "tap_changer_ref": "tc_detc_snnn_5_25",
            "requires_avr": False,
        },
    ),
    "eksport": (
        SpecDowoduEksportuStacji,
        {"station_id": "s1", "p_export_kw": 10.0, "p_import_kw": 10.0},
    ),
    "wytrzymalosc": (
        SpecDowoduWytrzymalosciAparatu,
        {
            "bay_designation": "Pole 1",
            "device_id": "wstd_breaker_vacuum_15_25",
            "i_peak_calculated_ka": 1.0,
            "i_thermal_calculated_ka": 1.0,
            "t_clearing_s": 1.0,
        },
    ),
    "przekladniki": (
        SpecDowoduUziemieniaPrzekladnika,
        {"bay_designation": "Pole 1", "vt_voltage_factor": 1.9, "grounding_type": "isolated"},
    ),
}
_POLA_NAZW = {
    "bess": "der_nazwa",
    "zaczepy": "transformer_nazwa",
    "wytrzymalosc": "bay_designation",
    "przekladniki": "bay_designation",
}


@pytest.mark.parametrize("rodzaj", sorted(_SPECYFIKACJE_POPRAWNE))
def test_specyfikacja_odrzuca_pole_spoza_kontraktu(rodzaj: str) -> None:
    """Dawna koncowka rozpakowywala `**spec` — pole spoza sygnatury konczylo sie HTTP 500.
    Specyfikacja z `extra="forbid"` odrzuca je przy budowie, zanim cokolwiek policzy."""
    klasa, pola = _SPECYFIKACJE_POPRAWNE[rodzaj]
    klasa(**pola)  # wariant poprawny sie buduje
    with pytest.raises(ValidationError):
        klasa(**pola, pole_spoza_kontraktu=1)


@pytest.mark.parametrize("pusta", ["", "   ", "\t"], ids=["pusty", "spacje", "tab"])
@pytest.mark.parametrize("rodzaj", sorted(_POLA_NAZW))
def test_specyfikacja_odrzuca_brak_nazwy_elementu(rodzaj: str, pusta: str) -> None:
    """Karta #144 uczynila nazwy wymaganymi; brak nazwy jest odmowa kontraktu z polskim
    komunikatem (nigdy dowodem z identyfikatorem w tekscie ani bledem 500)."""
    klasa, pola = _SPECYFIKACJE_POPRAWNE[rodzaj]
    with pytest.raises(ValidationError, match="nazwą z modelu"):
        klasa(**{**pola, _POLA_NAZW[rodzaj]: pusta})
    bez_pola = {k: v for k, v in pola.items() if k != _POLA_NAZW[rodzaj]}
    with pytest.raises(ValidationError):
        klasa(**bez_pola)


@pytest.mark.parametrize(
    ("rodzaj", "pole", "wartosc"),
    [
        ("eksport", "p_export_kw", float("inf")),
        ("eksport", "p_import_kw", -1.0),
        ("wytrzymalosc", "t_clearing_s", 0.0),
        ("wytrzymalosc", "i_peak_calculated_ka", float("nan")),
        ("przekladniki", "vt_voltage_factor", 0.0),
        ("bess", "selected_mode_refs", []),
        ("zaczepy", "transformer_type", "transformer_110_30"),
    ],
)
def test_specyfikacja_odrzuca_wartosci_spoza_dziedziny(
    rodzaj: str, pole: str, wartosc: object
) -> None:
    klasa, pola = _SPECYFIKACJE_POPRAWNE[rodzaj]
    with pytest.raises(ValidationError):
        klasa(**{**pola, pole: wartosc})


def test_pakiet_stacji_niesie_nazwe_etykiety_rodzajow_i_braki() -> None:
    dowod = generate_hosting_capacity_export_proof(
        SpecDowoduEksportuStacji(station_id="s1", p_export_kw=10.0, p_import_kw=10.0)
    )
    pakiet = generate_station_audit2_proof_pack(
        station_id="s1",
        station_nazwa="Stacja Łąkowa",
        proofs=[dowod],
        braki_danych=[
            BrakDanychDowodu("AUDIT2_VT_GROUNDING_VALIDATION", "Brak przekładników."),
            BrakDanychDowodu("AUDIT2_BESS_OPERATION_MODES", "Brak magazynu."),
        ],
    ).to_dict()
    assert pakiet["station_nazwa"] == "Stacja Łąkowa"
    assert pakiet["proofs"][0]["rodzaj_pl"] == "Zdolność przyłączeniowa — eksport wobec importu"
    # Braki w kolejnosci rodzaju (deterministycznie), z polska nazwa rodzaju.
    assert [b["proof_type"] for b in pakiet["braki_danych"]] == [
        "AUDIT2_BESS_OPERATION_MODES",
        "AUDIT2_VT_GROUNDING_VALIDATION",
    ]
    assert pakiet["braki_danych"][0]["rodzaj_pl"] == "Tryby pracy magazynu energii"
    # Brak danych nie jest dowodem niezaliczonym — licznik dowodow go nie obejmuje.
    assert pakiet["proof_count"] == 1 and pakiet["fail_count"] == 0
