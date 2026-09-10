"""Pin bramki izolacji kodu badawczego.

Guard, który zawsze przechodzi, jest gorszy od braku guarda: kosztuje czas CI
i wytwarza fałszywą pewność. Dlatego każde sprawdzenie ma tu PARĘ testów —
„wykrywa naruszenie" oraz „przepuszcza stan poprawny". Bez pierwszego nie wiadomo,
czy guard w ogóle patrzy; bez drugiego guard mógłby być stale czerwony.

Dodatkowo `test_guard_jest_wpiety_w_workflow_ci` pilnuje zdania z
`backend/research/README.md` („guard pilnuje tej granicy w CI"). To zdanie było
NIEPRAWDZIWE od chwili jego napisania — guard nie był wywoływany przez żaden
workflow. Deklaracja bez przypiętego sprawdzenia jest fałszywą pewnością, więc
teraz jest sprawdzana.
"""

from __future__ import annotations

from pathlib import Path

import research_isolation_guard as guard


def _laboratorium(tmp_path: Path, moduly: tuple[str, ...], wymienione: tuple[str, ...]) -> Path:
    research = tmp_path / "research"
    (research / "dynamic_lab").mkdir(parents=True)
    for nazwa in moduly:
        (research / "dynamic_lab" / nazwa).write_text("x = 1\n", encoding="utf-8")
    spis = "\n".join(f"| `dynamic_lab/{n}` | opis |" for n in wymienione)
    (research / "README.md").write_text(f"# Lab\n\n{spis}\n", encoding="utf-8")
    return research


# --- spis modułów -----------------------------------------------------------


def test_spis_wykrywa_modul_wymieniony_ale_nieistniejacy(tmp_path, monkeypatch) -> None:
    research = _laboratorium(tmp_path, ("siec.py",), ("siec.py", "inicjalizacja.py"))
    monkeypatch.setattr(guard, "RESEARCH", research)
    monkeypatch.setattr(guard, "README", research / "README.md")
    naruszenia = guard.sprawdz_spis_modulow()
    assert len(naruszenia) == 1
    assert "inicjalizacja.py" in naruszenia[0]
    assert "NIE MA" in naruszenia[0]


def test_spis_wykrywa_modul_istniejacy_ale_niewymieniony(tmp_path, monkeypatch) -> None:
    research = _laboratorium(tmp_path, ("siec.py", "silnik.py"), ("siec.py",))
    monkeypatch.setattr(guard, "RESEARCH", research)
    monkeypatch.setattr(guard, "README", research / "README.md")
    naruszenia = guard.sprawdz_spis_modulow()
    assert len(naruszenia) == 1
    assert "silnik.py" in naruszenia[0]


def test_spis_przepuszcza_zgodny_katalog(tmp_path, monkeypatch) -> None:
    research = _laboratorium(tmp_path, ("siec.py", "silnik.py"), ("siec.py", "silnik.py"))
    monkeypatch.setattr(guard, "RESEARCH", research)
    monkeypatch.setattr(guard, "README", research / "README.md")
    assert guard.sprawdz_spis_modulow() == []


def test_spis_zgadza_sie_w_prawdziwym_repozytorium() -> None:
    """Stan faktyczny repo — nie fikstura."""
    assert guard.sprawdz_spis_modulow() == []


# --- wpięcie w CI -----------------------------------------------------------


def test_guard_jest_wpiety_w_workflow_ci() -> None:
    """README obiecuje działanie w CI — tu jest dowód, że obietnica jest prawdziwa."""
    assert guard.sprawdz_wpiecie_w_ci() == []


def test_brak_wpiecia_w_ci_jest_wykrywany(tmp_path, monkeypatch) -> None:
    puste = tmp_path / "workflows"
    puste.mkdir()
    (puste / "inny.yml").write_text("name: cos innego\n", encoding="utf-8")
    monkeypatch.setattr(guard, "WORKFLOWS", puste)
    naruszenia = guard.sprawdz_wpiecie_w_ci()
    assert len(naruszenia) == 1
    assert "research_isolation_guard.py" in naruszenia[0]


# --- kolizja nazw (bramka KD-9) --------------------------------------------


def test_kolizja_nazw_pakietow_jest_wykrywana(tmp_path, monkeypatch) -> None:
    src = tmp_path / "src"
    (src / "enm").mkdir(parents=True)
    research = tmp_path / "research"
    (research / "enm").mkdir(parents=True)
    monkeypatch.setattr(guard, "SRC", src)
    monkeypatch.setattr(guard, "RESEARCH", research)
    naruszenia = guard.sprawdz_kolizje_nazw()
    assert len(naruszenia) == 1
    assert "research/enm" in naruszenia[0]


def test_brak_kolizji_przepuszcza(tmp_path, monkeypatch) -> None:
    src = tmp_path / "src"
    (src / "enm").mkdir(parents=True)
    research = tmp_path / "research"
    (research / "dynamic_lab").mkdir(parents=True)
    monkeypatch.setattr(guard, "SRC", src)
    monkeypatch.setattr(guard, "RESEARCH", research)
    assert guard.sprawdz_kolizje_nazw() == []


# --- status dowodowy --------------------------------------------------------


def test_kod_badawczy_nie_moze_nadac_sobie_statusu_dowodowego(tmp_path, monkeypatch) -> None:
    research = tmp_path / "research"
    research.mkdir()
    (research / "silnik.py").write_text(
        'reporting_status = "reportable"\n', encoding="utf-8"
    )
    monkeypatch.setattr(guard, "KORZEN", tmp_path)
    monkeypatch.setattr(guard, "RESEARCH", research)
    naruszenia = guard.sprawdz_status_dowodowy()
    assert len(naruszenia) == 1
    assert "status dowodowy" in naruszenia[0]


# --- import produkcja -> laboratorium --------------------------------------


def test_produkcja_importujaca_laboratorium_jest_wykrywana(tmp_path, monkeypatch) -> None:
    src = tmp_path / "src"
    src.mkdir()
    (src / "modul.py").write_text("from dynamic_lab.siec import Galaz\n", encoding="utf-8")
    monkeypatch.setattr(guard, "KORZEN", tmp_path)
    monkeypatch.setattr(guard, "SRC", src)
    naruszenia = guard.sprawdz_importy_produkcji()
    assert len(naruszenia) == 1
    assert "dynamic_lab.siec" in naruszenia[0]


def test_produkcja_dokladajaca_research_do_sys_path_jest_wykrywana(tmp_path, monkeypatch) -> None:
    src = tmp_path / "src"
    src.mkdir()
    (src / "modul.py").write_text(
        'import sys\nsys.path.insert(0, "../research")\n', encoding="utf-8"
    )
    monkeypatch.setattr(guard, "KORZEN", tmp_path)
    monkeypatch.setattr(guard, "SRC", src)
    naruszenia = guard.sprawdz_manipulacje_sciezka()
    assert len(naruszenia) == 1
    assert "sys.path" in naruszenia[0]
