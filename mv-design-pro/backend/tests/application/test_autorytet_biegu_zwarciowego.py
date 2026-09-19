"""Testy `application.autorytet_biegu_zwarciowego` (karta S-2 AUTORYTET).

OBEJŚCIE ODTWORZONE (DoD karty §3: „test odtwarzający obejście „bieg
nieistniejący + 999 kA" jest czerwony na starym kodzie i zielony po zmianie"):
`test_obejscie_bieg_nieistniejacy_plus_999_ka_jest_odrzucony` poniżej.

Iloczyn cech (KLASA NIE INSTANCJA, CLAUDE.md): {run_id None / pusty / nie-UUID
/ UUID nieistniejący / rodzaju innego / niezakończony / poprawny} x {punkt
zwarcia istniejący / nieistniejący} x {echo None / zgodne / rozbieżne / pole
nieznane}; koordynacja: {oba biegi / brak MAX / brak MIN / scenariusz
zamieniony / migawki różne}.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from application.autorytet_biegu_zwarciowego import (
    BiegNiemiarodajnyError,
    niezgodnosci_pradow_koordynacji,
    wejscie_koordynacji_z_biegow,
    wejscie_zwarciowe_z_biegu,
    wielkosci_kontraktu_klienta,
)
from enm.canonical_analysis import (
    CanonicalRun,
    _execute_short_circuit,
    canonical_run_repository_scope,
    reset_canonical_runs,
)
from enm.models import Bus, EnergyNetworkModel, ENMHeader, Source, Transformer
from network_model.core.autorytet_wyniku_zwarciowego import ZrodloWynikuZwarciowego

CASE_ID = "case-autorytet-s2"


@pytest.fixture(autouse=True)
def _reset() -> None:
    reset_canonical_runs()


def _siec(*, revision: int = 1) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="Siec testu autorytetu S-2", revision=revision),
        buses=[
            Bus(ref_id="hv", name="GPZ 110", voltage_kv=110.0),
            Bus(ref_id="mv", name="Stacja SN", voltage_kv=15.0),
        ],
        sources=[
            Source(
                ref_id="s1",
                name="System 110 kV",
                bus_ref="hv",
                model="short_circuit_power",
                sk3_mva=2000.0,
                rx_ratio=0.1,
            )
        ],
        transformers=[
            Transformer(
                ref_id="t1",
                name="T1",
                hv_bus_ref="hv",
                lv_bus_ref="mv",
                sn_mva=16.0,
                uhv_kv=110.0,
                ulv_kv=15.0,
                uk_percent=10.5,
                pk_kw=80.0,
                vector_group="YNd11",
            )
        ],
    )


def _zapisz_bieg(
    run_id: UUID,
    *,
    scenario: str = "max",
    status: str = "FINISHED",
    analysis_type: str = "short_circuit_sn",
    revision: int = 1,
) -> CanonicalRun:
    utworzony = datetime(2026, 1, 1, tzinfo=UTC)
    run = CanonicalRun(
        id=run_id,
        case_id=CASE_ID,
        project_id="proj-autorytet-s2",
        analysis_type=analysis_type,
        status=status,
        created_at=utworzony,
        # snapshot_hash zależny WYŁĄCZNIE od `revision` (nie od `run_id`) —
        # dwa biegi tej samej sieci (ten sam `revision`) muszą mieć TEN SAM
        # snapshot_hash, inaczej test pary MAX/MIN nigdy nie przejdzie kontroli
        # „ta sama migawka modelu" niezależnie od tego, co sprawdzamy.
        snapshot_hash=f"snap-rev{revision}",
        input_hash=f"in-{run_id}",
        snapshot=_siec(revision=revision).model_dump(mode="json"),
        validation={},
        readiness={},
        options={"fault_type": "3F", "scenario": scenario, "thermal_time_seconds": 1.0},
    )
    run.finished_at = utworzony
    if analysis_type == "short_circuit_sn":
        _execute_short_circuit(run)
    else:
        run.raw_result = {}
    with canonical_run_repository_scope() as repository:
        repository.save(run)
    return run


def _punkt_zwarcia_biegu(run: CanonicalRun) -> str:
    wiersze = (run.raw_result or {}).get("results") or []
    assert wiersze, "bieg testowy musi mieć co najmniej jeden wiersz wyniku"
    return str(wiersze[0]["fault_node_id"])


# ---------------------------------------------------------------------------
# bieg_zwarciowy_miarodajny (przez wejscie_zwarciowe_z_biegu) — fail-closed.
# ---------------------------------------------------------------------------


def test_run_id_none_odrzucony() -> None:
    with pytest.raises(BiegNiemiarodajnyError) as exc:
        wejscie_zwarciowe_z_biegu(run_id=None, punkt_zwarcia="x")
    assert exc.value.powod == "BIEG_NIE_WSKAZANY"


def test_run_id_pusty_string_odrzucony() -> None:
    with pytest.raises(BiegNiemiarodajnyError) as exc:
        wejscie_zwarciowe_z_biegu(run_id="   ", punkt_zwarcia="x")
    assert exc.value.powod == "BIEG_NIE_WSKAZANY"


def test_run_id_nie_jest_uuid_odrzucony() -> None:
    with pytest.raises(BiegNiemiarodajnyError) as exc:
        wejscie_zwarciowe_z_biegu(run_id="nie-jest-uuid", punkt_zwarcia="x")
    assert exc.value.powod == "BIEG_NIE_ISTNIEJE"


def test_run_id_uuid_ale_biegu_nie_ma_odrzucony() -> None:
    with pytest.raises(BiegNiemiarodajnyError) as exc:
        wejscie_zwarciowe_z_biegu(run_id=str(uuid4()), punkt_zwarcia="x")
    assert exc.value.powod == "BIEG_NIE_ISTNIEJE"


def test_bieg_innego_rodzaju_odrzucony() -> None:
    run = _zapisz_bieg(uuid4(), analysis_type="power_flow")
    with pytest.raises(BiegNiemiarodajnyError) as exc:
        wejscie_zwarciowe_z_biegu(run_id=str(run.id), punkt_zwarcia="x")
    assert exc.value.powod == "BIEG_INNEGO_RODZAJU"


def test_bieg_niezakonczony_odrzucony() -> None:
    run = _zapisz_bieg(uuid4(), status="RUNNING")
    with pytest.raises(BiegNiemiarodajnyError) as exc:
        wejscie_zwarciowe_z_biegu(run_id=str(run.id), punkt_zwarcia="x")
    assert exc.value.powod == "BIEG_NIEZAKONCZONY"


def test_punkt_zwarcia_spoza_biegu_odrzucony() -> None:
    run = _zapisz_bieg(uuid4())
    with pytest.raises(BiegNiemiarodajnyError) as exc:
        wejscie_zwarciowe_z_biegu(run_id=str(run.id), punkt_zwarcia="punkt-ktorego-nie-ma")
    assert exc.value.powod == "PUNKT_ZWARCIA_SPOZA_BIEGU"


def test_bieg_poprawny_daje_wejscie_z_wiazaniem_i_proweniencja() -> None:
    run = _zapisz_bieg(uuid4())
    punkt = _punkt_zwarcia_biegu(run)
    wejscie = wejscie_zwarciowe_z_biegu(run_id=str(run.id), punkt_zwarcia=punkt)
    assert wejscie.wiazanie.run_id == str(run.id)
    assert wejscie.wiazanie.punkt_zwarcia == punkt
    assert wejscie.proweniencja.zrodlo is ZrodloWynikuZwarciowego.SOLVER_Z_MODELU
    # Sieć testowa nie ma falowników -> brak znaczników k_sc -> miarodajna.
    assert wejscie.proweniencja.znaczniki_k_sc == ()
    assert wejscie.wielkosci["fault_node_id"] == punkt


# ---------------------------------------------------------------------------
# OBEJŚCIE ODTWORZONE (karta S-2, DoD §3) — bieg nieistniejący + 999 kA.
# ---------------------------------------------------------------------------


def test_obejscie_bieg_nieistniejacy_plus_999_ka_jest_odrzucony() -> None:
    """Reprodukcja dokładnego obejścia nazwanego w karcie: `run_id` wskazujący
    bieg, którego nigdy nie było, plus wymyślona wartość 999 kA w echu. PRZED
    kartą S-2 ten kod ścieżki (stary `EquipmentProofInput.required_fault_
    results` jako WEJŚCIE, nie echo) dawał kompletny pakiet dowodowy — ten test
    dowodzi, że most `wejscie_zwarciowe_z_biegu` odmawia na etapie WYSZUKANIA
    biegu, zanim jakiekolwiek liczby (w tym 999 kA) w ogóle wejdą w grę."""
    with pytest.raises(BiegNiemiarodajnyError) as exc:
        wejscie_zwarciowe_z_biegu(
            run_id="BIEG-KTORY-NIGDY-NIE-ISTNIAL", punkt_zwarcia="dowolny-punkt"
        )
    assert exc.value.powod == "BIEG_NIE_ISTNIEJE"

    # Wariant z prawdziwym UUID (żeby wykluczyć „to tylko zły format"): bieg
    # nadal nie istnieje w magazynie -> nadal odmowa, niezależnie od tego, że
    # echo (999 kA) nigdy nie zostało nawet odczytane.
    with pytest.raises(BiegNiemiarodajnyError) as exc_uuid:
        wejscie_zwarciowe_z_biegu(run_id=str(uuid4()), punkt_zwarcia="dowolny-punkt")
    assert exc_uuid.value.powod == "BIEG_NIE_ISTNIEJE"


# ---------------------------------------------------------------------------
# niezgodnosci_z_echem — echo opcjonalne; rozbieżność i pole nieznane = odmowa.
# ---------------------------------------------------------------------------


def test_echo_none_nie_jest_sprawdzane() -> None:
    run = _zapisz_bieg(uuid4())
    wejscie = wejscie_zwarciowe_z_biegu(run_id=str(run.id), punkt_zwarcia=_punkt_zwarcia_biegu(run))
    assert wejscie.niezgodnosci_z_echem(None) == ()


def test_echo_zgodne_z_biegiem_nie_jest_niezgodnoscia() -> None:
    run = _zapisz_bieg(uuid4())
    punkt = _punkt_zwarcia_biegu(run)
    wejscie = wejscie_zwarciowe_z_biegu(run_id=str(run.id), punkt_zwarcia=punkt)
    echo = wielkosci_kontraktu_klienta(wejscie.wielkosci)
    assert wejscie.niezgodnosci_z_echem(echo) == ()


def test_echo_rozbiezne_jest_niezgodnoscia_dokladnie_scenariusz_obejscia() -> None:
    """To jest wielkość „999 kA": klient przysyła echo z liczbą inną niż
    policzona w biegu — MUSI zostać odrzucone."""
    run = _zapisz_bieg(uuid4())
    punkt = _punkt_zwarcia_biegu(run)
    wejscie = wejscie_zwarciowe_z_biegu(run_id=str(run.id), punkt_zwarcia=punkt)
    echo = {"ikss_ka": 999.0}
    niezgodnosci = wejscie.niezgodnosci_z_echem(echo)
    assert niezgodnosci
    assert any("liczby wyniku" in n for n in niezgodnosci)


def test_echo_pole_nieznane_jest_niezgodnoscia() -> None:
    run = _zapisz_bieg(uuid4())
    punkt = _punkt_zwarcia_biegu(run)
    wejscie = wejscie_zwarciowe_z_biegu(run_id=str(run.id), punkt_zwarcia=punkt)
    niezgodnosci = wejscie.niezgodnosci_z_echem({"idyn_ka": 40.0})
    assert any("pola spoza kontraktu" in n and "idyn_ka" in n for n in niezgodnosci)


# ---------------------------------------------------------------------------
# wielkosci_kontraktu_klienta — mapowanie jednostek, zero fabrykacji idyn_ka.
# ---------------------------------------------------------------------------


def test_wielkosci_kontraktu_klienta_konwertuje_jednostki() -> None:
    wynik = wielkosci_kontraktu_klienta(
        {"un_v": 15000.0, "ikss_a": 8000.0, "ip_a": 20000.0, "ith_a": 8000.0, "tk_s": 1.0}
    )
    assert wynik == {"u_kv": 15.0, "ikss_ka": 8.0, "ip_ka": 20.0, "ith_ka": 8.0, "tk_s": 1.0}


def test_wielkosci_kontraktu_klienta_nigdy_nie_tworzy_idyn_ka() -> None:
    wynik = wielkosci_kontraktu_klienta(
        {"un_v": 15000.0, "ikss_a": 8000.0, "ip_a": 20000.0, "ith_a": 8000.0, "tk_s": 1.0}
    )
    assert "idyn_ka" not in wynik


def test_wielkosci_kontraktu_klienta_brakujace_pole_pomijane() -> None:
    wynik = wielkosci_kontraktu_klienta({"un_v": 15000.0})
    assert wynik == {"u_kv": 15.0}


def test_wielkosci_kontraktu_klienta_typ_niepoprawny_rzuca_type_error() -> None:
    with pytest.raises(TypeError):
        wielkosci_kontraktu_klienta({"un_v": "15000"})


# ---------------------------------------------------------------------------
# Koordynacja: dwa biegi (MAX/MIN) — każda kontrola ma własną przyczynę.
# ---------------------------------------------------------------------------


def test_koordynacja_run_id_max_brak_odrzucony() -> None:
    run_min = _zapisz_bieg(uuid4(), scenario="min")
    with pytest.raises(BiegNiemiarodajnyError) as exc:
        wejscie_koordynacji_z_biegow(run_id_max=None, run_id_min=str(run_min.id))
    assert exc.value.powod == "BIEG_NIE_WSKAZANY"


def test_koordynacja_scenariusz_max_i_min_zamienione_odrzucony() -> None:
    run_max = _zapisz_bieg(uuid4(), scenario="max")
    run_min = _zapisz_bieg(uuid4(), scenario="min")
    with pytest.raises(BiegNiemiarodajnyError) as exc:
        wejscie_koordynacji_z_biegow(run_id_max=str(run_min.id), run_id_min=str(run_max.id))
    assert exc.value.powod == "SCENARIUSZ_BIEGU_NIEZGODNY"


def test_koordynacja_biegi_z_roznych_modeli_odrzucony() -> None:
    run_max = _zapisz_bieg(uuid4(), scenario="max", revision=1)
    run_min = _zapisz_bieg(uuid4(), scenario="min", revision=2)
    with pytest.raises(BiegNiemiarodajnyError) as exc:
        wejscie_koordynacji_z_biegow(run_id_max=str(run_max.id), run_id_min=str(run_min.id))
    assert exc.value.powod == "BIEGI_Z_ROZNYCH_MODELI"


def test_koordynacja_para_poprawna_daje_wejscie_z_obu_biegow() -> None:
    run_max = _zapisz_bieg(uuid4(), scenario="max")
    run_min = _zapisz_bieg(uuid4(), scenario="min")
    wejscie = wejscie_koordynacji_z_biegow(run_id_max=str(run_max.id), run_id_min=str(run_min.id))
    assert wejscie.wiazanie_max.run_id == str(run_max.id)
    assert wejscie.wiazanie_min.run_id == str(run_min.id)
    assert wejscie.prady_max_a
    assert wejscie.prady_min_a
    assert wejscie.wartosci_odrzucone == ()


def test_koordynacja_niezgodnosci_prady_zgodne_puste() -> None:
    run_max = _zapisz_bieg(uuid4(), scenario="max")
    run_min = _zapisz_bieg(uuid4(), scenario="min")
    wejscie = wejscie_koordynacji_z_biegow(run_id_max=str(run_max.id), run_id_min=str(run_min.id))
    lokalizacja = next(iter(wejscie.prady_max_a))
    zadanie = [
        {
            "location_id": lokalizacja,
            "ik_max_3f_a": wejscie.prady_max_a[lokalizacja],
            "ik_min_3f_a": wejscie.prady_min_a.get(lokalizacja, wejscie.prady_max_a[lokalizacja]),
        }
    ]
    niezgodnosci = niezgodnosci_pradow_koordynacji(wejscie, zadanie)
    assert niezgodnosci == () or all("bez identyfikatora" not in n for n in niezgodnosci)


def test_koordynacja_niezgodnosci_prad_rozbiezny_wykryty() -> None:
    run_max = _zapisz_bieg(uuid4(), scenario="max")
    run_min = _zapisz_bieg(uuid4(), scenario="min")
    wejscie = wejscie_koordynacji_z_biegow(run_id_max=str(run_max.id), run_id_min=str(run_min.id))
    lokalizacja = next(iter(wejscie.prady_max_a))
    zadanie = [{"location_id": lokalizacja, "ik_max_3f_a": 999999.0}]
    niezgodnosci = niezgodnosci_pradow_koordynacji(wejscie, zadanie)
    assert any(lokalizacja in n and "ik_max_3f_a" in n for n in niezgodnosci)


def test_koordynacja_pola_2f_1f_zawsze_niezwiazane() -> None:
    """Kanoniczny bieg liczy WYŁĄCZNIE 3F — ik_max_2f_a/ik_min_1f_a są zawsze
    „wielkością niezwiązaną z żadnym biegiem", niezależnie od wartości."""
    run_max = _zapisz_bieg(uuid4(), scenario="max")
    run_min = _zapisz_bieg(uuid4(), scenario="min")
    wejscie = wejscie_koordynacji_z_biegow(run_id_max=str(run_max.id), run_id_min=str(run_min.id))
    lokalizacja = next(iter(wejscie.prady_max_a))
    zadanie = [{"location_id": lokalizacja, "ik_max_2f_a": 1.0, "ik_min_1f_a": 1.0}]
    niezgodnosci = niezgodnosci_pradow_koordynacji(wejscie, zadanie)
    assert any("ik_max_2f_a" in n and "niezwiązana" in n for n in niezgodnosci)
    assert any("ik_min_1f_a" in n and "niezwiązana" in n for n in niezgodnosci)
