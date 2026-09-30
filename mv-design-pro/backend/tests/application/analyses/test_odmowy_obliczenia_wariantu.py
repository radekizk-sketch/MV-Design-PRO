"""Nazwana odmowa obliczenia wariantu zamiast połykania wyjątków (karta #151).

Każde miejsce, które liczy WARIANT w pamięci (`wykonaj_bieg_w_pamieci`) albo bieg
persystowany (`execute_run`), łapało `Exception` i zamieniało KAŻDY błąd — także błąd
programu — w status („niezbieżność", „scenariusz nieoceniony", „przerwany błędem
solvera"). Po karcie łapie wyłącznie `ODMOWY_OBLICZENIA_BIEGU` (`ValueError` —
konwencja odmów dziedziny i solverów — oraz `ArithmeticError` — osobliwość liczbowa
danych); inny wyjątek wybucha.

Iloczyn cech: {miejsce: zdolność przyłączeniowa, obszar PQ, dobór kompensacji,
kontyngencja N-1, stan bazowy N-1, odpowiedź OSD, dokument studium (faza zdolności ×
faza obszaru), nastawy (wariant 3F / 2F / rozpływ), pasmo min/max zwarcia, bieg
persystowany} × {odmowa nazwana `ValueError`, odmowa nazwana `ZeroDivisionError`, obcy
`AttributeError`}.
"""

from __future__ import annotations

from typing import Any

import pytest
from application.analyses import (
    dobor_kompensacji,
    dokument_studium,
    hosting_capacity,
    kontyngencje_n1,
    odpowiedz_osd,
    pq_area,
)
from application.protection_settings import batch_run
from application.protection_settings.batch_run import BrakDanychNastawError
from enm import canonical_analysis
from enm.canonical_analysis import (
    ODMOWY_OBLICZENIA_BIEGU,
    CanonicalRun,
    create_run,
    execute_run,
    get_run,
    reset_canonical_runs,
)
from enm.models import EnergyNetworkModel
from enm.store import reset_enm_store, set_enm

from tests.application.test_pakiet_nastaw import _kotwica
from tests.cgmes.golden_enm import build_golden_enm

NAZWANE: tuple[type[Exception], ...] = (ValueError, ZeroDivisionError)
OBCE: tuple[type[Exception], ...] = (AttributeError, KeyError, TypeError)


@pytest.fixture(autouse=True)
def _czysto() -> Any:
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _bieg_pf() -> CanonicalRun:
    set_enm("c-odmowy", build_golden_enm())
    run = execute_run(create_run(case_id="c-odmowy", klucz_twin="c-odmowy", analysis_type="PF").id)
    assert run.status == "FINISHED", run.error_message
    return run


def _rzucajacy(typ: type[Exception]) -> Any:
    def _wykonaj(*args: Any, **kwargs: Any) -> None:
        raise typ("wstrzyknięty wyjątek")

    return _wykonaj


def test_zbior_odmow_to_valueerror_i_arithmeticerror() -> None:
    """Jedno źródło prawdy (predykat parami): wszystkie miejsca importują TĘ krotkę."""
    assert ODMOWY_OBLICZENIA_BIEGU == (ValueError, ArithmeticError)
    for modul in (
        dobor_kompensacji,
        dokument_studium,
        hosting_capacity,
        kontyngencje_n1,
        odpowiedz_osd,
        pq_area,
        batch_run,
    ):
        assert modul.ODMOWY_OBLICZENIA_BIEGU is ODMOWY_OBLICZENIA_BIEGU, modul.__name__


# ---------------------------------------------------------------------------
# Zdolność przyłączeniowa / obszar PQ / dobór kompensacji / N-1 / OSD
# ---------------------------------------------------------------------------


def _hosting(run: CanonicalRun) -> Any:
    return hosting_capacity.build_hosting_capacity_view(
        run, candidate_bus_refs=["bus_sn_c"], max_steps=2
    )


def _pq(run: CanonicalRun) -> Any:
    return pq_area.build_pq_area_view(run, bus_ref="bus_sn_c", max_steps_p=2, max_steps_q=2)


def _dobor(run: CanonicalRun) -> Any:
    return dobor_kompensacji._point_cos_phi(
        run,
        EnergyNetworkModel.model_validate(run.snapshot),
        record=None,
        bus_ref="bus_sn_c",
        night=False,
    )


def _n1(run: CanonicalRun) -> Any:
    return kontyngencje_n1.build_kontyngencje_n1_view(run, element_refs=["line_b_c"])


def _osd(run: CanonicalRun) -> Any:
    return odpowiedz_osd.build_osd_response_view(
        run, source_ref="gen_pv", command="ograniczenie_p", p_limit_pct=50
    )


MIEJSCA = {
    "zdolnosc_przylaczeniowa": (hosting_capacity, _hosting),
    "obszar_pq": (pq_area, _pq),
    "dobor_kompensacji": (dobor_kompensacji, _dobor),
    "kontyngencje_n1": (kontyngencje_n1, _n1),
    "odpowiedz_osd": (odpowiedz_osd, _osd),
}


def _sprawdz_reakcje_nazwana(miejsce: str, wynik: Any) -> None:
    if miejsce == "zdolnosc_przylaczeniowa":
        scenariusze = wynik["nodes"][0]["scenarios"]
        assert scenariusze[0]["binding"] == {"kind": "non_convergence"}
        assert scenariusze[0]["converged"] is False
    elif miejsce == "obszar_pq":
        pierwszy = wynik["vertices"][0]
        assert pierwszy["feasible"] is False
        assert pierwszy["binding_center"] == {"kind": "non_convergence"}
    elif miejsce == "dobor_kompensacji":
        assert wynik["converged"] is False and wynik["cosfi_punktu"] is None
    elif miejsce == "kontyngencje_n1":
        assert "przerwany błędem solvera" in wynik["przypadek_bazowy"]["powod_pl"]
        assert "wstrzyknięty wyjątek" in wynik["przypadek_bazowy"]["powod_pl"]
    else:
        raise AssertionError(miejsce)


@pytest.mark.parametrize("miejsce", sorted(MIEJSCA))
@pytest.mark.parametrize("typ", NAZWANE)
def test_odmowa_nazwana_daje_status(
    miejsce: str, typ: type[Exception], monkeypatch: pytest.MonkeyPatch
) -> None:
    run = _bieg_pf()
    modul, wolaj = MIEJSCA[miejsce]
    monkeypatch.setattr(modul, "wykonaj_bieg_w_pamieci", _rzucajacy(typ))
    if miejsce == "odpowiedz_osd":
        # Odpowiedź OSD: odmowa obliczenia = twardy błąd wejścia (ValueError z powodem).
        with pytest.raises(ValueError, match="nie mógł zostać policzony: wstrzyknięty wyjątek"):
            wolaj(run)
        return
    _sprawdz_reakcje_nazwana(miejsce, wolaj(run))


@pytest.mark.parametrize("miejsce", sorted(MIEJSCA))
@pytest.mark.parametrize("typ", OBCE)
def test_obcy_wyjatek_wybucha(
    miejsce: str, typ: type[Exception], monkeypatch: pytest.MonkeyPatch
) -> None:
    run = _bieg_pf()
    modul, wolaj = MIEJSCA[miejsce]
    monkeypatch.setattr(modul, "wykonaj_bieg_w_pamieci", _rzucajacy(typ))
    with pytest.raises(typ):
        wolaj(run)


# ---------------------------------------------------------------------------
# Dokument studium — dwie fazy wariantu
# ---------------------------------------------------------------------------


class _Przetwornik:
    pmax_mw = 1.0


def _sekcja_dokumentu(monkeypatch: pytest.MonkeyPatch, faza: str, typ: type[Exception]) -> Any:
    def _pq_ok(run: Any, *, bus_ref: str) -> dict[str, Any]:
        return {"vertices": []}

    def _hc_ok(run: Any, *, candidate_bus_refs: list[str]) -> dict[str, Any]:
        return {"nodes": [{"max_hosting_capacity_mw": 1.0, "binding_criterion": {"kind": "none"}}]}

    monkeypatch.setattr(
        dokument_studium,
        "build_hosting_capacity_view",
        _rzucajacy(typ) if faza == "zdolnosc" else _hc_ok,
    )
    monkeypatch.setattr(
        dokument_studium, "build_pq_area_view", _rzucajacy(typ) if faza == "obszar_pq" else _pq_ok
    )
    monkeypatch.setattr(dokument_studium, "_pasmo_q_pl", lambda widok, pmax: "pasmo")
    monkeypatch.setattr(
        dokument_studium, "build_pq_coverage_view", lambda przetwornik, profil: {"ocena": None}
    )
    return dokument_studium._wariant_sekcja(
        None,  # type: ignore[arg-type]
        _Przetwornik(),  # type: ignore[arg-type]
        None,  # type: ignore[arg-type]
        "bus_sn_c",
        bus_names={"bus_sn_c": "Szyna C"},
        bus_voltages={"bus_sn_c": 15.0},
    )


@pytest.mark.parametrize("faza", ["zdolnosc", "obszar_pq"])
@pytest.mark.parametrize("typ", NAZWANE)
def test_dokument_studium_faza_z_odmowa_nazwana_ma_status_blad(
    faza: str, typ: type[Exception], monkeypatch: pytest.MonkeyPatch
) -> None:
    sekcja = _sekcja_dokumentu(monkeypatch, faza, typ)
    klucz = "zdolnosc" if faza == "zdolnosc" else "obszar_pq"
    assert sekcja[klucz]["status"] == "blad"
    assert sekcja[klucz]["komunikat_bledu"] == "wstrzyknięty wyjątek"


@pytest.mark.parametrize("faza", ["zdolnosc", "obszar_pq"])
@pytest.mark.parametrize("typ", OBCE)
def test_dokument_studium_obcy_wyjatek_wybucha(
    faza: str, typ: type[Exception], monkeypatch: pytest.MonkeyPatch
) -> None:
    with pytest.raises(typ):
        _sekcja_dokumentu(monkeypatch, faza, typ)


# ---------------------------------------------------------------------------
# Nastawy zabezpieczeń — trzy warianty, każdy osobno
# ---------------------------------------------------------------------------


def _nastawy_z_awaria(monkeypatch: pytest.MonkeyPatch, ktory: int, typ: type[Exception]) -> Any:
    prawdziwy = batch_run.wykonaj_bieg_w_pamieci
    licznik = {"n": 0}

    def _wykonaj(run: Any, **kwargs: Any) -> None:
        licznik["n"] += 1
        if licznik["n"] == ktory:
            raise typ("wstrzyknięty wyjątek")
        prawdziwy(run, **kwargs)

    monkeypatch.setattr(batch_run, "wykonaj_bieg_w_pamieci", _wykonaj)
    return batch_run.zbuduj_wejscie_nastaw(
        _kotwica(), line_id="ln1", next_bus_id="b_b", c_min=1.0, zacisk_zabezpieczenia="od"
    )


@pytest.mark.parametrize("ktory", [1, 2, 3])
@pytest.mark.parametrize("typ", NAZWANE)
def test_nastawy_odmowa_nazwana_wariantu_to_brak_danych_z_powodem(
    ktory: int, typ: type[Exception], monkeypatch: pytest.MonkeyPatch
) -> None:
    with pytest.raises(BrakDanychNastawError, match="wstrzyknięty wyjątek") as info:
        _nastawy_z_awaria(monkeypatch, ktory, typ)
    assert isinstance(info.value.__cause__, typ)


@pytest.mark.parametrize("ktory", [1, 2, 3])
@pytest.mark.parametrize("typ", OBCE)
def test_nastawy_obcy_wyjatek_wariantu_wybucha(
    ktory: int, typ: type[Exception], monkeypatch: pytest.MonkeyPatch
) -> None:
    with pytest.raises(typ):
        _nastawy_z_awaria(monkeypatch, ktory, typ)


# ---------------------------------------------------------------------------
# Pasmo min/max zwarcia — wariant liczony na żądanie
# ---------------------------------------------------------------------------


def _kotwica_bez_c() -> CanonicalRun:
    kotwica = _kotwica()
    kotwica.options = {"fault_type": "3F", "thermal_time_seconds": 1.0}
    return kotwica


@pytest.mark.parametrize("typ", NAZWANE)
def test_pasmo_min_max_odmowa_nazwana_to_powod_niedostepnosci(
    typ: type[Exception], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(canonical_analysis, "wykonaj_bieg_w_pamieci", _rzucajacy(typ))
    pasmo = canonical_analysis.dobierz_pasmo_min_max_zwarcia(_kotwica_bez_c())
    assert pasmo.powod_niedostepnosci == f"blad_solvera_wariantu:{typ.__name__}"


@pytest.mark.parametrize("typ", OBCE)
def test_pasmo_min_max_obcy_wyjatek_wybucha(
    typ: type[Exception], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(canonical_analysis, "wykonaj_bieg_w_pamieci", _rzucajacy(typ))
    with pytest.raises(typ):
        canonical_analysis.dobierz_pasmo_min_max_zwarcia(_kotwica_bez_c())


# ---------------------------------------------------------------------------
# Bieg persystowany — `execute_run`
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("typ", NAZWANE)
def test_bieg_persystowany_odmowa_nazwana_to_failed_z_komunikatem(
    typ: type[Exception], monkeypatch: pytest.MonkeyPatch
) -> None:
    set_enm("c-odmowy", build_golden_enm())
    run = create_run(case_id="c-odmowy", klucz_twin="c-odmowy", analysis_type="PF")
    monkeypatch.setattr(canonical_analysis, "_wykonaj_analize_biegu", _rzucajacy(typ))
    wynik = execute_run(run.id)
    assert wynik.status == "FAILED"
    assert wynik.error_message == "wstrzyknięty wyjątek"
    zapisany = get_run(run.id)
    assert zapisany is not None and zapisany.status == "FAILED"


@pytest.mark.parametrize("typ", OBCE)
def test_bieg_persystowany_obcy_wyjatek_failed_i_wybuch(
    typ: type[Exception], monkeypatch: pytest.MonkeyPatch
) -> None:
    """Bieg nie zostaje w RUNNING (atomowe przejęcie zablokowałoby ponowienie), dostaje
    FAILED z NAZWĄ błędu wewnętrznego (bez treści wyjątku), a wyjątek leci dalej."""
    set_enm("c-odmowy", build_golden_enm())
    run = create_run(case_id="c-odmowy", klucz_twin="c-odmowy", analysis_type="PF")
    monkeypatch.setattr(canonical_analysis, "_wykonaj_analize_biegu", _rzucajacy(typ))
    with pytest.raises(typ):
        execute_run(run.id)
    zapisany = get_run(run.id)
    assert zapisany is not None and zapisany.status == "FAILED"
    assert zapisany.error_message is not None
    assert typ.__name__ in zapisany.error_message
    assert "wstrzyknięty wyjątek" not in zapisany.error_message
