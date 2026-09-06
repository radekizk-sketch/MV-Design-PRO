"""Rozszerzenia audytu 2 w torze kanonicznym (CV-4.2b) + stan fazowy a katalog uziemienia (K-Q).

Klasa CV-4.2b: wykonawca biegu NIE buduje własnego połączenia z bazą. Konfigurację
audytu 2 stacji wskazaną opcjami biegu czyta `rozszerzenia_audit2_dla_opcji(options,
uow_factory)` fabryką `UnitOfWork` WOŁAJĄCEGO i podaje assemblerowi jako dane
(`rozszerzenia_audit2`); assembler nie zna bazy. Do tej karty `enm/assembler.py::
_maybe_load_audit2_extensions` budował własny silnik z `DATABASE_URL`
(`_uow_factory_biezacy`) — inną bazę niż `app.state.uow_factory`, więc konfiguracja
zapisana przez API bywała dla biegu niewidoczna (test `tests/api/
test_solver_input_audit2_integration.py` musiał wyrównywać `DATABASE_URL`, żeby
produkt w ogóle działał).

Iloczyn cech pokryty niżej (reguła KLASA §2):
  {brak pary, połowa pary, zły UUID, brak fabryki, para bez konfiguracji,
   para z konfiguracją} × {rozpływ, zwarcie} + „assembler nie zna bazy" (źródło).
"""

from __future__ import annotations

import ast
import inspect
from typing import Any
from uuid import UUID, uuid4

import pytest

from tests.application.test_protection_settings_batch_run import (
    _kotwica,
    _siec_promieniowa,
)

pytest.importorskip("sqlalchemy")


class _FabrykaNieDoWolania:
    """Fabryka `UnitOfWork`, której wywołanie jest błędem testu — pin „baza nietknięta"."""

    def __call__(self) -> Any:
        raise AssertionError(
            "wykonawca dotknął bazy, choć opcje nie wskazują konfiguracji audytu 2"
        )


def _rozszerzenia(options: dict[str, Any], uow_factory: Any) -> dict[str, Any] | None:
    from enm.canonical_analysis import rozszerzenia_audit2_dla_opcji

    return rozszerzenia_audit2_dla_opcji(options, uow_factory)


def test_brak_pary_audit2_nie_dotyka_bazy_i_daje_none() -> None:
    assert _rozszerzenia({}, _FabrykaNieDoWolania()) is None
    assert _rozszerzenia({"fault_type": "3F"}, None) is None


@pytest.mark.parametrize(
    "options",
    [
        {"audit2_project_id": str(uuid4())},
        {"audit2_station_id": "st-1"},
        {"audit2_project_id": str(uuid4()), "audit2_station_id": ""},
        {"audit2_project_id": "", "audit2_station_id": "st-1"},
    ],
)
def test_polowa_pary_audit2_to_jawny_blad(options: dict[str, Any]) -> None:
    with pytest.raises(ValueError, match="polowa pary"):
        _rozszerzenia(options, _FabrykaNieDoWolania())


def test_zly_uuid_projektu_to_jawny_blad_a_nie_cichy_bieg_bez_korekt() -> None:
    with pytest.raises(ValueError, match="nie jest poprawnym UUID"):
        _rozszerzenia(
            {"audit2_project_id": "not-a-uuid", "audit2_station_id": "st-1"},
            _FabrykaNieDoWolania(),
        )


def test_para_audit2_bez_fabryki_wolajacego_to_jawny_blad() -> None:
    with pytest.raises(ValueError, match="nie dostal fabryki UnitOfWork"):
        _rozszerzenia({"audit2_project_id": str(uuid4()), "audit2_station_id": "st-1"}, None)


def test_para_audit2_bez_zapisanej_konfiguracji_daje_none(uow_factory) -> None:
    assert (
        _rozszerzenia(
            {
                "audit2_project_id": str(uuid4()),
                "audit2_station_id": "station-bez-konfiguracji",
            },
            uow_factory,
        )
        is None
    )


def _zapisz_projekt_i_konfiguracje(uow_factory, project_id: UUID, station_id: str) -> None:
    from infrastructure.persistence.models import ProjectORM

    with uow_factory() as uow:
        uow.session.add(
            ProjectORM(
                id=project_id,
                name="Projekt audytu 2",
                schema_version="1.0",
                mode="AS-IS",
                voltage_level_kv=15.0,
                frequency_hz=50.0,
            )
        )
        uow.session.flush()
        uow.audit2_station_configs.upsert(
            project_id,
            station_id,
            mv_neutral_grounding_ref="mng_petersen",
            tap_changer_refs=[],
            der_specs=[],
            transformer_tap_changers={"tr_001": "tc_oltc_110sn_19_125"},
            bay_hv_fuses={},
            bay_vts={},
            bay_device_withstand={},
        )


def test_para_audit2_z_zapisana_konfiguracja_daje_rozszerzenia_ta_sama_fabryka(
    uow_factory,
) -> None:
    """Zapis i odczyt TĄ SAMĄ fabryką — bez żadnego `DATABASE_URL` w teście."""
    project_id = uuid4()
    _zapisz_projekt_i_konfiguracje(uow_factory, project_id, "station-canonical-1")

    extensions = _rozszerzenia(
        {
            "audit2_project_id": str(project_id),
            "audit2_station_id": "station-canonical-1",
        },
        uow_factory,
    )

    assert extensions is not None
    assert "tr_001" in extensions["power_flow_extensions"]["transformer_to_tap_changer"]
    assert (
        extensions["sc_iec60909_extensions"]["mv_neutral_grounding"]["grounding_type"]
        == "petersen_coil"
    )


@pytest.mark.parametrize("analysis_type", ["PF", "short_circuit_sn"])
def test_wykonawca_podaje_fabryke_wolajacego_i_rozszerzenia_assemblerowi(
    analysis_type: str, monkeypatch
) -> None:
    """PF × SC: wykonawca woła JEDEN odczyt z fabryką wołającego i oddaje wynik assemblerowi."""
    from enm import canonical_analysis

    fabryka = object()
    widziane: list[tuple[dict[str, Any], Any]] = []

    def _odczyt(options, uow_factory):
        widziane.append((dict(options), uow_factory))
        return None

    monkeypatch.setattr(canonical_analysis, "rozszerzenia_audit2_dla_opcji", _odczyt)
    przekazane: list[Any] = []
    if analysis_type == "PF":
        oryginal = canonical_analysis.zloz_wejscie_rozplywu

        def _assembler(snapshot, options, graph=None, *, rozszerzenia_audit2=None):
            przekazane.append(rozszerzenia_audit2)
            return oryginal(snapshot, options, graph=graph, rozszerzenia_audit2=rozszerzenia_audit2)

        monkeypatch.setattr(canonical_analysis, "zloz_wejscie_rozplywu", _assembler)
        run = _kotwica(_siec_promieniowa(), analysis_type="PF", wykonaj=False)
        run.options = {}
        canonical_analysis._execute_power_flow(run, uow_factory=fabryka)
    else:
        oryginal = canonical_analysis.zloz_wejscie_zwarcia

        def _assembler(snapshot, options, *, rozszerzenia_audit2=None):
            przekazane.append(rozszerzenia_audit2)
            return oryginal(snapshot, options, rozszerzenia_audit2=rozszerzenia_audit2)

        monkeypatch.setattr(canonical_analysis, "zloz_wejscie_zwarcia", _assembler)
        run = _kotwica(_siec_promieniowa(), wykonaj=False)
        canonical_analysis._execute_short_circuit(run, uow_factory=fabryka)

    assert len(widziane) == 1 and widziane[0][1] is fabryka
    assert przekazane == [None]
    assert run.raw_result, "wykonawca policzył bieg po odczycie rozszerzeń"


def _kod_bez_dokumentacji(modul_lub_funkcja: Any) -> str:
    """Źródło bez docstringów (AST): pin klasy sprawdza KOD, nie opis kasacji."""
    drzewo = ast.parse(inspect.getsource(modul_lub_funkcja))
    for wezel in ast.walk(drzewo):
        if isinstance(wezel, ast.Module | ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef):
            cialo = wezel.body
            if (
                cialo
                and isinstance(cialo[0], ast.Expr)
                and isinstance(cialo[0].value, ast.Constant)
                and isinstance(cialo[0].value.value, str)
            ):
                del cialo[0]
    return ast.unparse(drzewo)


def test_assembler_nie_zna_bazy_a_wykonawcy_czytaja_ja_fabryka_wolajacego() -> None:
    """Źródło (bez docstringów) jako pin klasy: brak własnego silnika w assemblerze,
    jedna droga odczytu w wykonawcach."""
    from enm import assembler, canonical_analysis

    kod_assemblera = _kod_bez_dokumentacji(assembler)
    for zakazane in (
        "DATABASE_URL",
        "create_engine",
        "session",
        "uow_factory",
        "_maybe_load_audit2_extensions",
        "_uow_factory_biezacy",
        "infrastructure.persistence",
    ):
        assert zakazane not in kod_assemblera, zakazane
    # Oba wejścia assemblera przyjmują rozszerzenia jako dane i stosują ten sam adjuster.
    for funkcja in (assembler.zloz_wejscie_rozplywu, assembler.zloz_wejscie_zwarcia):
        assert "rozszerzenia_audit2" in inspect.signature(funkcja).parameters
        assert "apply_audit2_to_network_model" in _kod_bez_dokumentacji(funkcja)
    # Wykonawcy NIE składają wejścia sami i czytają rozszerzenia JEDNĄ funkcją z fabryką.
    for wykonawca, wejscie in (
        (canonical_analysis._execute_power_flow, "zloz_wejscie_rozplywu("),
        (canonical_analysis._execute_short_circuit, "zloz_wejscie_zwarcia("),
    ):
        kod = _kod_bez_dokumentacji(wykonawca)
        assert wejscie in kod
        assert "rozszerzenia_audit2=rozszerzenia_audit2_dla_opcji(run.options, uow_factory)" in kod
    assert "_uow_factory_biezacy" not in _kod_bez_dokumentacji(canonical_analysis)


# Stan fazowy SN a katalog uziemienia (karta K-Q, 2026-08-14)
#
# INTENCJA POPRZEDNICH TESTOW (Phase 46) zostala odwrocona SWIADOMIE. Pinowaly
# one zachowanie, w ktorym `_phase_state_default_fault_current_from_grounding`
# brala MEDIANE zgadnietego zakresu `typical_ik1_a_range` i podawala ja solverowi
# `phase_state_sn` jako domyslny prad zwarcia doziemnego (test wprost oczekiwal
# 15,5 A z zakresu 1-30 A). Zakres nie mial zrodla — karta K-O usunela go z
# frontendu, karta K-Q z backendu — wiec pin utrwalal fabrykacje wchodzaca do
# fizyki. Ponizsze testy pilnuja stanu uczciwego: etykieta wariantu uziemienia
# NIE wyznacza zadnego pradu zwarcia.


def test_katalog_uziemienia_nie_niesie_zgadywanego_pradu_zwarcia() -> None:
    """PIN KLASY po WSZYSTKICH pozycjach katalogu uziemienia SN."""
    from network_model.catalog.audit2_catalogs import MV_NEUTRAL_GROUNDING_CATALOG

    assert MV_NEUTRAL_GROUNDING_CATALOG, "katalog nie moze byc pusty"
    for item in MV_NEUTRAL_GROUNDING_CATALOG:
        serialized = item.to_dict()
        assert "typical_ik1_a_range" not in serialized, item.id
        assert "typical_ik1_a_min" not in serialized, item.id
        assert "typical_ik1_a_max" not in serialized, item.id


def test_stan_fazowy_nie_ma_juz_domyslu_z_etykiety_uziemienia() -> None:
    """Zrodlowy pin: helper zgadujacy prad zwarcia zniknal razem z wolaniem."""
    import inspect

    from enm import canonical_analysis

    assert not hasattr(canonical_analysis, "_phase_state_default_fault_current_from_grounding")
    ps_source = inspect.getsource(canonical_analysis._execute_phase_state_sn)
    assert "_phase_state_default_fault_current_from_grounding" not in ps_source
    assert "typical_ik1_a_range" not in ps_source


def test_stan_fazowy_bez_jawnego_pradu_liczy_sie_bez_zwarcia() -> None:
    """Brak `fault_current_a` w opcjach = 0 A na kazdej fazie, a nie mediana."""
    import inspect

    from enm import canonical_analysis

    ps_source = inspect.getsource(canonical_analysis._execute_phase_state_sn)
    fragment = ps_source.split('"fault_current_a"', 1)[1].split("open_phase", 1)[0]
    assert "default=(0.0, 0.0, 0.0)" in fragment, fragment
