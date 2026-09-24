"""Asercje wspólne testów uczciwości natychmiastowej."""

from __future__ import annotations

import importlib.util
from functools import lru_cache
from pathlib import Path
from types import ModuleType
from typing import Any

from werdykt import OcenaKryterium

_SKRYPT_FIXTUR = Path(__file__).resolve().parents[2] / "scripts" / "eksport_fixtur_harnessu.py"


def sprawdz_ocene_niewykonana(ocena: Any) -> OcenaKryterium:
    """Rekord ``NIE_OCENIONO`` jest PEŁNYM rekordem kontraktu werdyktu (``werdykt.OcenaKryterium``).

    Odczyt z JSON przechodzi walidację kontraktu (reguła K, etykieta, braki, zastrzeżenia —
    wyprowadzone ponownie i porównane), więc rekord zbudowany poza regułą albo okrojony
    (np. sam status bez wyjaśnienia) jest odrzucany. Ponadto: status ``NIE_OCENIONO``,
    etykieta „Ocena niewykonana" o semantyce neutralnej z jedynego słownika, niepuste zdanie
    z generatora i niepusta lista „czego brakuje"."""
    assert isinstance(ocena, dict), ocena
    rekord = OcenaKryterium.model_validate(ocena)
    assert rekord.status_maszynowy == "NIE_OCENIONO"
    assert rekord.etykieta.etykieta_pl == "Ocena niewykonana"
    assert rekord.etykieta.semantyka == "neutralna"
    assert rekord.wyjasnienie.zdanie_pl.strip()
    assert rekord.wyjasnienie.czego_brakuje
    assert rekord.wynik is None and rekord.dowod.metoda == "BRAK_METODY"
    return rekord


def braki_tekstem(ocena: dict[str, Any]) -> str:
    """Pozycje „czego brakuje" rekordu jako jeden tekst (do sprawdzeń treści braków)."""
    return " ".join(ocena["wyjasnienie"]["czego_brakuje"])


@lru_cache(maxsize=1)
def eksport_fixtur() -> ModuleType:
    """Skrypt eksportu fixtur harnessu jako moduł (sieć demonstracyjna sceny „akademickie")."""
    spec = importlib.util.spec_from_file_location(
        "eksport_fixtur_harnessu_uczciwosc", _SKRYPT_FIXTUR
    )
    assert spec is not None and spec.loader is not None
    modul = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modul)
    return modul


def parametry_sceny(kod_rodzaju: str) -> dict[str, Any]:
    """Parametry projektanta sceny „akademickie" dla rodzaju — JEDNO źródło prawdy:
    `PARAMETRY_SCENY_AKADEMICKIE` skryptu fixtur (ten sam moduł składa sieć sceny, więc kopia
    parametrów w testach mogłaby rozjechać się z siecią, np. z identyfikatorem falownika
    nadanym przez operację toru DER-SN)."""
    parametry: dict[str, Any] = eksport_fixtur().PARAMETRY_SCENY_AKADEMICKIE.get(kod_rodzaju, {})
    return parametry


def enm_sceny_akademickiej() -> Any:
    """Sieć złota sceny „akademickie" — TEN SAM model co skrypt fixtur harnessu.

    Jedno źródło prawdy: model składa `_enm_sceny_akademickiej` skryptu (farma PV przyłączona
    torem DER-SN kanoniczną operacją `add_converter_source`, tą samą drogą co projektant), więc
    testy uczciwości liczą na DOKŁADNIE tej sieci, którą pokazuje scena."""
    return eksport_fixtur()._enm_sceny_akademickiej()


def model_sceny_akademickiej(rodzaj: Any) -> Any:
    """Model wejścia V12.6 sieci demonstracyjnej sceny „akademickie" (ta sama, na której audyt
    harmonicznych zmierzył THD_U 3049 %) — złożony DOKŁADNIE tą ścieżką, co bieg z API."""
    from api.v126_academic import _with_parameter_payloads
    from application.analyses.v126_gotowosc import (
        ocen_gotowosc_v126,
        uzupelnij_parametry_z_modelu,
    )
    from enm.store import set_enm
    from solver_input.v126_contracts import build_v126_input_from_enm

    enm = enm_sceny_akademickiej()
    set_enm("c-akademicka", enm)
    parametry = uzupelnij_parametry_z_modelu(enm, rodzaj, parametry_sceny(rodzaj.value))
    assert ocen_gotowosc_v126(enm, rodzaj, parametry).potwierdzona
    return _with_parameter_payloads(build_v126_input_from_enm(enm, parameters=parametry), parametry)


def bieg_sceny_akademickiej(rodzaj: Any) -> tuple[Any, Any]:
    """Bieg V12.6 sieci demonstracyjnej przez rejestr kanoniczny (ta sama ścieżka co API)."""
    from enm.canonical_analysis import create_run, execute_run

    model = model_sceny_akademickiej(rodzaj)
    bieg = execute_run(
        create_run(
            case_id="c-akademicka",
            klucz_twin="c-akademicka",
            analysis_type=f"v126:{rodzaj.value}",
            options={"model": model.model_dump(mode="json"), "pominiete_zrodla": []},
        ).id
    )
    assert bieg.status == "FINISHED", bieg.error_message
    return bieg, model
