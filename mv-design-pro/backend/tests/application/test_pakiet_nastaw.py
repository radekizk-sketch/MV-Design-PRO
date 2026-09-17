"""Testy bramy pakietu dowodowego nastaw (karta PACK-NASTAWY).

Wolane BEZPOSREDNIO na warstwie aplikacji (funkcje `pakiet_nastaw.py`) — ZERO
TestClient/ASGI (zakaz karty). Pokrycie: dostepnosc x budowa (jedno zrodlo
prawdy), determinizm dwoch pobran, zawartosc ZIP (dowod + zrodlo + wykaz +
odcisk), zrodlo pieciu pol nastaw = silnik (nie wynik biegu).
"""

from __future__ import annotations

import json
import zipfile
from datetime import UTC, datetime
from io import BytesIO
from uuid import UUID, uuid4

import pytest
from application.proof_engine.pakiet_nastaw import (
    PakietNastawError,
    dostepnosc_pakietu_nastaw,
    zbuduj_pakiet_nastaw,
)
from enm.canonical_analysis import CanonicalRun, _execute_short_circuit
from enm.models import BranchRating, Bus, EnergyNetworkModel, ENMHeader, Load, OverheadLine, Source


def _zrodlo() -> Source:
    return Source(
        ref_id="src",
        name="System 15 kV",
        bus_ref="b_src",
        model="short_circuit_power",
        sk3_mva=500.0,
        r_ohm=0.1,
        x_ohm=1.0,
    )


def _linia(ref_id: str, *, od: str, do: str) -> OverheadLine:
    return OverheadLine(
        ref_id=ref_id,
        name=f"Linia {ref_id}",
        from_bus_ref=od,
        to_bus_ref=do,
        length_km=2.0,
        r_ohm_per_km=0.2,
        x_ohm_per_km=0.35,
        rating=BranchRating(in_a=200.0),
        cross_section_mm2=120.0,
        conductor_material="Al",
    )


def _siec() -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="Siec pakietu nastaw"),
        buses=[
            Bus(ref_id="b_src", name="GPZ SN", voltage_kv=15.0),
            Bus(ref_id="b_a", name="Stacja A", voltage_kv=15.0),
            Bus(ref_id="b_b", name="Stacja B", voltage_kv=15.0),
        ],
        sources=[_zrodlo()],
        loads=[Load(ref_id="ld_b", name="Odbior B", bus_ref="b_b", p_mw=1.0, q_mvar=0.3)],
        branches=[_linia("ln1", od="b_src", do="b_a"), _linia("ln2", od="b_a", do="b_b")],
    )


def _kotwica(run_id: UUID | None = None) -> CanonicalRun:
    run = CanonicalRun(
        id=run_id or uuid4(),
        case_id="case-pakiet-nastaw",
        project_id="proj-pakiet-nastaw",
        analysis_type="short_circuit_sn",
        status="FINISHED",
        created_at=datetime(2024, 1, 1, tzinfo=UTC),
        snapshot_hash="snap-hash-pakiet-nastaw",
        input_hash="in-hash-pakiet-nastaw",
        snapshot=_siec().model_dump(mode="json"),
        validation={},
        readiness={},
        options={"fault_type": "3F", "c_factor": 1.10, "thermal_time_seconds": 1.0},
    )
    run.finished_at = run.created_at
    _execute_short_circuit(run)
    return run


def _rozpakuj(zawartosc: bytes) -> dict[str, bytes]:
    with zipfile.ZipFile(BytesIO(zawartosc)) as zf:
        return {name: zf.read(name) for name in zf.namelist() if not name.endswith("/")}


def test_dostepnosc_listuje_linie_i_kandydatow_nastepnej_szyny() -> None:
    dostepnosc = dostepnosc_pakietu_nastaw(_kotwica())
    assert dostepnosc["dostepny"] is True
    linie = {pozycja["line_id"]: pozycja for pozycja in dostepnosc["linie"]}
    assert linie["ln1"]["nastepne_szyny_kandydujace"] == ["b_b"]
    assert linie["ln2"]["nastepne_szyny_kandydujace"] == []


def test_dostepnosc_kotwicy_zlego_rodzaju_jest_niedostepna() -> None:
    kotwica = _kotwica()
    kotwica.analysis_type = "PF"
    dostepnosc = dostepnosc_pakietu_nastaw(kotwica)
    assert dostepnosc["dostepny"] is False
    assert dostepnosc["linie"] == []
    assert dostepnosc["powod_pl"]


def test_zbuduj_pakiet_nastaw_zawiera_dowod_zrodlo_wykaz_odcisk() -> None:
    nazwa, zawartosc = zbuduj_pakiet_nastaw(_kotwica(), line_id="ln1", next_bus_id="b_b", c_min=1.0)
    assert nazwa.endswith(".zip")
    pliki = _rozpakuj(zawartosc)
    assert "proof_pack/proof.json" in pliki
    assert "proof_pack/proof.tex" in pliki
    assert "proof_pack/manifest.json" in pliki
    assert "proof_pack/signature.json" in pliki


def test_zbuduj_pakiet_nastaw_pieciu_pol_nastaw_pochodzi_z_silnika_nie_z_zaszytej_liczby() -> None:
    """Zrodlo pieciu pol wyjsciowych (I>, t>, I>>, I_th_dop, j_thn) = silnik Hoppela.

    Niezaleznie odtwarzamy wejscie i wolamy silnik, po czym porownujemy z liczbami
    w proof.json — jesli generator kiedys zaczalby zaszywac liczby zamiast wolac
    silnik, ten test wychwyci rozjazd.
    """
    from application.protection_settings.batch_run import zbuduj_wejscie_nastaw
    from application.protection_settings.engine import ProtectionSettingsEngine

    kotwica = _kotwica()
    _, zawartosc = zbuduj_pakiet_nastaw(kotwica, line_id="ln1", next_bus_id="b_b", c_min=1.0)
    proof = json.loads(_rozpakuj(zawartosc)["proof_pack/proof.json"])

    wejscie = zbuduj_wejscie_nastaw(kotwica, line_id="ln1", next_bus_id="b_b", c_min=1.0)
    wynik = ProtectionSettingsEngine.calculate(wejscie.engine_input)

    key_results = proof["summary"]["key_results"]
    assert key_results["I_delayed_A"]["value"] == pytest.approx(wynik.delayed.i_setting_a)
    assert key_results["I_instantaneous_A"]["value"] == pytest.approx(
        wynik.instantaneous.i_setting_a
    )
    assert key_results["I_th_dop_A"]["value"] == pytest.approx(wynik.thermal.i_th_dop_a)


def test_dwa_pobrania_tego_samego_biegu_sa_bajt_w_bajt_identyczne() -> None:
    run_id = UUID(int=42)
    _, zawartosc1 = zbuduj_pakiet_nastaw(
        _kotwica(run_id), line_id="ln1", next_bus_id="b_b", c_min=1.0
    )
    _, zawartosc2 = zbuduj_pakiet_nastaw(
        _kotwica(run_id), line_id="ln1", next_bus_id="b_b", c_min=1.0
    )
    assert zawartosc1 == zawartosc2


def test_linia_nieznana_konczy_sie_pakiet_nastaw_error() -> None:
    with pytest.raises(PakietNastawError):
        zbuduj_pakiet_nastaw(_kotwica(), line_id="nieznana", next_bus_id="b_b", c_min=1.0)


# ---------------------------------------------------------------------------
# Parytet dostepnosci i budowy (karta HARNESS-RESZTA-2, 2026-09-17)
# ---------------------------------------------------------------------------


def _siec_z_szyna_pomocnicza() -> EnergyNetworkModel:
    """Siec, w ktorej KONIEC magistrali jest szyna POMOCNICZA (`helper_bus`).

    Dokladnie ten ksztalt (magistrala zakonczona zaciskiem technicznym) niosa
    wszystkie sieci rejestru zbudowane operacjami `continue_trunk_segment_sn`:
    szyna `helper_bus` jest pomijana jako punkt raportowalny
    (`enm/assembler.py::skip_short_circuit_target`), wiec para „odcinek ->
    ta szyna" nie da sie policzyc mimo poprawnej topologii i kompletu danych
    katalogowych.
    """
    siec = _siec()
    siec.buses.append(
        Bus(ref_id="b_help", name="Zacisk koncowy", voltage_kv=15.0, tags=["helper_bus"])
    )
    siec.branches.append(_linia("ln3", od="b_b", do="b_help"))
    return siec


def _kotwica_sieci(siec: EnergyNetworkModel) -> CanonicalRun:
    run = CanonicalRun(
        id=uuid4(),
        case_id="case-parytet-nastaw",
        project_id="proj-parytet-nastaw",
        analysis_type="short_circuit_sn",
        status="FINISHED",
        created_at=datetime(2024, 1, 1, tzinfo=UTC),
        snapshot_hash="snap-hash-parytet",
        input_hash="in-hash-parytet",
        snapshot=siec.model_dump(mode="json"),
        validation={},
        readiness={},
        options={"fault_type": "3F", "c_factor": 1.10, "thermal_time_seconds": 1.0},
    )
    run.finished_at = run.created_at
    _execute_short_circuit(run)
    return run


def test_kazda_reklamowana_para_dostepnosci_daje_nastawy_na_kazdej_sieci_rejestru() -> None:
    """ILOCZYN CECH: siec rejestru x reklamowana para (odcinek, szyna) x obie strony.

    Kontrakt: KAZDA para, ktora `dostepnosc_pakietu_nastaw` pokazuje projektantowi,
    MUSI dac sie policzyc. Pomiar przed naprawa (karta HARNESS-RESZTA-2): 12 par
    reklamowanych na szesciu sieciach, 0 policzalnych — ekran nastaw prowadzil w
    slepy zaulek na kazdej sieci, jaka repozytorium ma. Test jedzie po WSZYSTKICH
    budowniczych rejestru (nie po jednym przykladzie z karty) plus po sieci
    syntetycznej z szyna pomocnicza, ktora odtwarza przyczyne rozjazdu.
    """
    from application.proof_engine.pakiet_nastaw import zbuduj_odpowiedz_nastaw_json
    from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
    from enm.store import reset_enm_store, set_enm

    from tests.reference_networks import builders

    sieci: list[tuple[str, CanonicalRun]] = [
        ("syntetyczna_z_szyna_pomocnicza", _kotwica_sieci(_siec_z_szyna_pomocnicza())),
        ("syntetyczna_podstawowa", _kotwica_sieci(_siec())),
    ]
    for nazwa_budowniczego in (
        "build_gn01_sn_promieniowa",
        "build_gn02_sn_odgalezienie",
        "build_gn03_sn_pierscien",
        "build_gn04_sn_nn_oze",
        "build_gn05_sn_nn_oze_ochrona",
    ):
        opis = getattr(builders, nazwa_budowniczego)()
        siec = EnergyNetworkModel.model_validate(opis["enm"])
        reset_canonical_runs()
        reset_enm_store()
        try:
            set_enm("case-parytet", siec)
            sieci.append(
                (
                    nazwa_budowniczego,
                    execute_run(
                        create_run(
                            case_id="case-parytet",
                            klucz_twin="case-parytet",
                            analysis_type="short_circuit_sn",
                        ).id
                    ),
                )
            )
        finally:
            reset_canonical_runs()
            reset_enm_store()

    reklamowane = 0
    for nazwa_sieci, kotwica in sieci:
        dostepnosc = dostepnosc_pakietu_nastaw(kotwica)
        if not dostepnosc["dostepny"]:
            # Odmowa MUSI byc nazwana — nigdy cichy brak.
            assert dostepnosc["powod_pl"], nazwa_sieci
            assert dostepnosc["linie"] == [], nazwa_sieci
            continue
        # Dostepny znaczy: CO NAJMNIEJ JEDNA para do policzenia (inaczej ekran
        # obiecuje sciezke, ktorej nie ma).
        assert any(
            pozycja["nastepne_szyny_kandydujace"] for pozycja in dostepnosc["linie"]
        ), nazwa_sieci
        for pozycja in dostepnosc["linie"]:
            for szyna in pozycja["nastepne_szyny_kandydujace"]:
                reklamowane += 1
                odpowiedz = zbuduj_odpowiedz_nastaw_json(
                    kotwica, line_id=pozycja["line_id"], next_bus_id=szyna, c_min=1.0
                )
                assert odpowiedz["dostepnosc_pakietu"] is True, (
                    nazwa_sieci,
                    pozycja["line_id"],
                    szyna,
                )
                assert odpowiedz["wynik"]["delayed"]["i_setting_a"] > 0.0

    assert reklamowane > 0, "test nie sprawdzil ANI JEDNEJ pary — bramka bylaby niema"
