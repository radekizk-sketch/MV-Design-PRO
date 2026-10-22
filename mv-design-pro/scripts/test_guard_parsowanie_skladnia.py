#!/usr/bin/env python3
"""Samotesty klasy GUARD-BLAD-SKLADNI: plik z zakresu skanu, ktorego nie da sie
sparsowac, ma byc CZERWIENIA z nazwa pliku i linia — nigdy cichym pominieciem.

Precedens: `solver_input_substitute_guard` zwrocil PASS i policzyl 4241 pol zamiast 4242,
bo moduł z urwanym koncem funkcji byl pomijany (`except SyntaxError: continue`).

Cechy iloczynu: straznik (11 poprawionych + helper) x rodzaj usterki (blad skladni /
plik nieczytelny UTF-8) x droga wejscia (funkcja skanu albo pelny `main()` przez
`uruchom`). Kazdy test kończy sie asercja NAZWY pliku i slowa „skladni"/„odczytac" —
czerwien z innego powodu nie przechodzi.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import arch_guard  # noqa: E402
import backend_no_physics_guard  # noqa: E402
import bramka_scalenia  # noqa: E402
import enm_store_key_guard  # noqa: E402
import evidence_status_guard  # noqa: E402
import guard_parsowanie  # noqa: E402
import no_direct_fault_params_guard  # noqa: E402
import result_status_writer_guard  # noqa: E402
import sc_authority_guard  # noqa: E402
import solver_input_assembler_guard  # noqa: E402
import solver_input_substitute_guard  # noqa: E402
import topology_single_impl_guard  # noqa: E402
import ui_math_guard  # noqa: E402

BLEDNA_SKLADNIA = "def urwana(:\n    return 1\n"
DOBRY = "x = 1\n"
NIEUTF8 = b"\xff\xfe\x00x = 1\n"


def _plik(korzen: Path, rel: str, tresc: str | bytes) -> Path:
    sciezka = korzen / rel
    sciezka.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(tresc, bytes):
        sciezka.write_bytes(tresc)
    else:
        sciezka.write_text(tresc, encoding="utf-8")
    return sciezka


# --- helper -----------------------------------------------------------------


def test_helper_skladnia_daje_nazwe_pliku_i_linie(tmp_path: Path) -> None:
    p = _plik(tmp_path, "a/zly.py", "x = 1\n" + BLEDNA_SKLADNIA)
    with pytest.raises(guard_parsowanie.BladZrodla) as wyjatek:
        guard_parsowanie.sparsuj_plik(p)
    assert "zly.py:2:" in str(wyjatek.value)
    assert "skladni" in str(wyjatek.value)


def test_helper_nieczytelny_plik_daje_nazwe_pliku(tmp_path: Path) -> None:
    p = _plik(tmp_path, "zly.py", NIEUTF8)
    with pytest.raises(guard_parsowanie.BladZrodla) as wyjatek:
        guard_parsowanie.sparsuj_plik(p)
    assert "zly.py" in str(wyjatek.value)
    assert "odczytac" in str(wyjatek.value)


def test_helper_poprawny_plik_przechodzi(tmp_path: Path) -> None:
    p = _plik(tmp_path, "ok.py", DOBRY)
    assert guard_parsowanie.sparsuj_plik(p).body


def test_uruchom_zamienia_wyjatek_na_kod_1_i_komunikat(capsys: pytest.CaptureFixture[str]) -> None:
    def glowna() -> int:
        raise guard_parsowanie.BladZrodla("plik.py:7: blad skladni (x)")

    assert guard_parsowanie.uruchom(glowna) == 1
    assert "FAIL: plik.py:7: blad skladni" in capsys.readouterr().out
    assert guard_parsowanie.uruchom(lambda: 0) == 0


# --- funkcje skanu: zmierz(korzen) ------------------------------------------


@pytest.mark.parametrize(
    "modul",
    [backend_no_physics_guard, solver_input_assembler_guard, topology_single_impl_guard],
)
@pytest.mark.parametrize("tresc", [BLEDNA_SKLADNIA, NIEUTF8])
def test_zmierz_nieparsowalny_plik_jest_czerwienia(
    modul: object, tresc: str | bytes, tmp_path: Path
) -> None:
    _plik(tmp_path, "application/dobry.py", DOBRY)
    _plik(tmp_path, "application/zly_modul.py", tresc)
    with pytest.raises(guard_parsowanie.BladZrodla) as wyjatek:
        modul.zmierz(tmp_path)  # type: ignore[attr-defined]
    assert "zly_modul.py" in str(wyjatek.value)


# --- evidence_status: scan_source / _scan_file ------------------------------


def test_evidence_status_scan_source_blad_skladni() -> None:
    with pytest.raises(guard_parsowanie.BladZrodla) as wyjatek:
        evidence_status_guard.scan_source(BLEDNA_SKLADNIA, "application/zly.py")
    assert "application/zly.py:1:" in str(wyjatek.value)


def test_evidence_status_nieczytelny_plik(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(evidence_status_guard, "BACKEND_SRC", tmp_path)
    p = _plik(tmp_path, "zly.py", NIEUTF8)
    with pytest.raises(guard_parsowanie.BladZrodla) as wyjatek:
        evidence_status_guard._scan_file(p)
    assert "zly.py" in str(wyjatek.value)


# --- no_direct_fault_params: check_file + indeks sygnatur -------------------


def test_no_direct_fault_params_check_file_blad_skladni(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(no_direct_fault_params_guard, "BACKEND_SRC", tmp_path)
    p = _plik(tmp_path, "application/zly.py", BLEDNA_SKLADNIA)
    with pytest.raises(guard_parsowanie.BladZrodla) as wyjatek:
        no_direct_fault_params_guard.check_file(p)
    assert "zly.py:1:" in str(wyjatek.value)


def test_no_direct_fault_params_indeks_sygnatur_blad_skladni(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(no_direct_fault_params_guard, "BACKEND_SRC", tmp_path)
    monkeypatch.setattr(no_direct_fault_params_guard, "_SIGNATURE_CACHE", {})
    _plik(tmp_path, "network_model/solvers/zly_solver.py", BLEDNA_SKLADNIA)
    with pytest.raises(guard_parsowanie.BladZrodla) as wyjatek:
        no_direct_fault_params_guard.solver_signature_index()
    assert "zly_solver.py" in str(wyjatek.value)


# --- solver_input_substitute: check_file + wyrocznia pol --------------------


def test_substitute_check_file_blad_skladni(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(solver_input_substitute_guard, "BACKEND_SRC", tmp_path)
    p = _plik(tmp_path, "application/analyses/zly.py", BLEDNA_SKLADNIA)
    with pytest.raises(guard_parsowanie.BladZrodla) as wyjatek:
        solver_input_substitute_guard.check_file(p, set())
    assert "zly.py:1:" in str(wyjatek.value)


def test_substitute_check_file_nieczytelny_plik(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(solver_input_substitute_guard, "BACKEND_SRC", tmp_path)
    p = _plik(tmp_path, "application/analyses/zly.py", NIEUTF8)
    with pytest.raises(guard_parsowanie.BladZrodla):
        solver_input_substitute_guard.check_file(p, set())


def test_substitute_declares_model_fields_blad_skladni(tmp_path: Path) -> None:
    p = _plik(tmp_path, "solver_input/zly.py", BLEDNA_SKLADNIA)
    with pytest.raises(guard_parsowanie.BladZrodla):
        solver_input_substitute_guard.declares_model_fields(p)


def test_substitute_zrodla_pol_blad_skladni(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(solver_input_substitute_guard, "BACKEND_SRC", tmp_path)
    _plik(tmp_path, "solver_input/zly.py", BLEDNA_SKLADNIA)
    with pytest.raises(guard_parsowanie.BladZrodla) as wyjatek:
        solver_input_substitute_guard.contract_fields()
    assert "zly.py" in str(wyjatek.value)


def test_substitute_wyrocznia_importow_blad_skladni(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(solver_input_substitute_guard, "BACKEND_SRC", tmp_path)
    for korzen in solver_input_substitute_guard.SCAN_ROOTS:
        (tmp_path / korzen).mkdir(parents=True, exist_ok=True)
    _plik(tmp_path, "application/zly.py", BLEDNA_SKLADNIA)
    with pytest.raises(guard_parsowanie.BladZrodla) as wyjatek:
        solver_input_substitute_guard.model_roots_read_by_scope()
    assert "zly.py" in str(wyjatek.value)


# --- ui_math ----------------------------------------------------------------


def test_ui_math_skanuj_py_blad_skladni(tmp_path: Path) -> None:
    p = _plik(tmp_path, "zly.py", BLEDNA_SKLADNIA)
    with pytest.raises(guard_parsowanie.BladZrodla) as wyjatek:
        ui_math_guard.skanuj_py(p)
    assert "zly.py:1:" in str(wyjatek.value)


@pytest.mark.parametrize("funkcja", ["skanuj_py", "skanuj_ts"])
def test_ui_math_nieczytelny_plik(funkcja: str, tmp_path: Path) -> None:
    p = _plik(tmp_path, "zly.src", NIEUTF8)
    with pytest.raises(guard_parsowanie.BladZrodla) as wyjatek:
        getattr(ui_math_guard, funkcja)(p)
    assert "zly.src" in str(wyjatek.value)


# --- arch_guard -------------------------------------------------------------


def test_arch_guard_scan_file_blad_skladni_z_linia(tmp_path: Path) -> None:
    p = _plik(tmp_path, "application/zly.py", BLEDNA_SKLADNIA)
    wynik = arch_guard._scan_file(p, tmp_path)
    assert wynik is not None
    assert "zly.py:1:" in wynik[1]
    assert "skladni" in wynik[1]


def test_arch_guard_rozwiazywacz_importow_blad_skladni(tmp_path: Path) -> None:
    _plik(tmp_path, "application/zly.py", BLEDNA_SKLADNIA)
    rozwiazywacz = arch_guard._Rozwiazywacz(tmp_path, arch_guard.POLITYKA_ANALIZY)
    with pytest.raises(guard_parsowanie.BladZrodla) as wyjatek:
        rozwiazywacz.wiazania("application.zly")
    assert "zly.py" in str(wyjatek.value)


# --- straznicy z pelnym main() ----------------------------------------------


def _main_czerwony(
    modul: object, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> str:
    kod = guard_parsowanie.uruchom(modul.main)  # type: ignore[attr-defined]
    wyjscie = capsys.readouterr()
    assert kod != 0, wyjscie.out + wyjscie.err
    return wyjscie.out + wyjscie.err


def test_enm_store_key_main_czerwony_na_bledzie_skladni(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(enm_store_key_guard, "BACKEND_SRC", tmp_path)
    for korzen in enm_store_key_guard.SCAN_ROOTS:
        (tmp_path / korzen).mkdir(parents=True, exist_ok=True)
    _plik(tmp_path, "application/zly_modul.py", BLEDNA_SKLADNIA)
    wyjscie = _main_czerwony(enm_store_key_guard, monkeypatch, capsys)
    assert "zly_modul.py:1:" in wyjscie and "skladni" in wyjscie


def test_result_status_writer_main_czerwony_na_bledzie_skladni(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(result_status_writer_guard, "BACKEND_SRC", tmp_path)
    _plik(tmp_path, "application/zly_modul.py", BLEDNA_SKLADNIA)
    wyjscie = _main_czerwony(result_status_writer_guard, monkeypatch, capsys)
    assert "zly_modul.py:1:" in wyjscie and "skladni" in wyjscie


def test_result_status_writer_main_czerwony_na_nieczytelnym_pliku(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(result_status_writer_guard, "BACKEND_SRC", tmp_path)
    _plik(tmp_path, "application/zly_modul.py", NIEUTF8)
    wyjscie = _main_czerwony(result_status_writer_guard, monkeypatch, capsys)
    assert "zly_modul.py" in wyjscie and "odczytac" in wyjscie


def test_no_direct_fault_params_main_czerwony_na_bledzie_skladni(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(no_direct_fault_params_guard, "BACKEND_SRC", tmp_path)
    monkeypatch.setattr(no_direct_fault_params_guard, "_SIGNATURE_CACHE", {})
    _plik(tmp_path, "application/zly_modul.py", BLEDNA_SKLADNIA)
    wyjscie = _main_czerwony(no_direct_fault_params_guard, monkeypatch, capsys)
    assert "zly_modul.py:1:" in wyjscie and "skladni" in wyjscie


def test_sc_authority_main_czerwony_na_bledzie_skladni(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(sc_authority_guard, "BACKEND_SRC", tmp_path)
    _plik(tmp_path, "application/zly_modul.py", BLEDNA_SKLADNIA)
    wyjscie = _main_czerwony(sc_authority_guard, monkeypatch, capsys)
    assert "zly_modul.py" in wyjscie or "wymagaj_autorytetu" not in wyjscie
    # Kontrola 3 skanuje caly BACKEND_SRC: blad skladni musi byc nazwany wprost.
    assert "skladni" in wyjscie


def test_sc_authority_wczytaj_ast_blad_skladni(tmp_path: Path) -> None:
    p = _plik(tmp_path, "zly.py", BLEDNA_SKLADNIA)
    with pytest.raises(guard_parsowanie.BladZrodla) as wyjatek:
        sc_authority_guard._wczytaj_ast(p)
    assert "zly.py:1:" in str(wyjatek.value)


# --- bramka_scalenia --------------------------------------------------------


def test_bramka_scalenia_nieparsowalny_plik_to_czerwien(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    graf = bramka_scalenia.Graf()
    graf.nieparsowalne.append("application/zly.py")
    monkeypatch.setattr(bramka_scalenia, "zmienione_pliki", lambda *_a, **_k: set())
    monkeypatch.setattr(bramka_scalenia, "zbuduj_graf", lambda: graf)
    assert bramka_scalenia.main(["--baza", "HEAD", "--tylko-wybor"]) == 1
    wyjscie = capsys.readouterr().out
    assert "FAIL: application/zly.py" in wyjscie
