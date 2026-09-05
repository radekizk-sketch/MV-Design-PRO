"""Testy bramki `result_status_writer_guard` (karta CV-2-W, 2026-09-05).

INTENCJA. Status wynikow PRZYPADKU obliczeniowego jest WYPROWADZANY z jego biegow
i koperty rewizji (`application/study_case/status_wynikow.py`), nigdy zapisywany.
Kasacja siedmiu pisarzy jest odwracalna jednym kopiuj-wklej, wiec bramka trzyma
budzet ZERO. Testy sprawdzaja, ze bramka:

  * GRYZIE we wszystkich czterech regulach (przypisanie atrybutu, konstrukcja
    przypadku, DML `update(StudyCaseORM).values(...)`, powrot typu
    `StudyCaseResultStatus`) i we wszystkich formach przypisania (`=`, `+=`,
    z adnotacja);
  * NIE gryzie na torach POZA karta: `CanonicalRun` (bieg kanoniczny) i legacy
    `AnalysisRun` - rozroznienie ma byc STRUKTURALNE, nie nazwowe, wiec test
    odtwarza dokladny ksztalt obu repozytoriow biegow;
  * NIE gryzie na `self.result_status = ...` w `__init__` (pole wlasne obiektu);
  * respektuje JAWNE wylaczenie archiwum projektu i wykrywa wylaczenie martwe;
  * PUSTY SKAN i brak korzenia to RC=1, nigdy RC=0;
  * jest ZIELONA na prawdziwym repozytorium (kontrola dodatnia).

Kod wyjscia odbierany zawsze bezposrednio (`main()`), nigdy przez potok.
"""

from __future__ import annotations

from pathlib import Path

import result_status_writer_guard as guard


def _drzewo(tmp_path: Path, pliki: dict[str, str]) -> Path:
    root = tmp_path / "src"
    root.mkdir(parents=True, exist_ok=True)
    for rel, tresc in pliki.items():
        sciezka = root / rel
        sciezka.parent.mkdir(parents=True, exist_ok=True)
        sciezka.write_text(tresc, encoding="utf-8")
    return root


def _uruchom(
    tmp_path: Path,
    monkeypatch,
    capsys,
    pliki: dict[str, str],
    wylaczone: frozenset[str] | None = None,
) -> tuple[int, str]:
    root = _drzewo(tmp_path, pliki)
    monkeypatch.setattr(guard, "BACKEND_SRC", root)
    monkeypatch.setattr(guard, "WYLACZONE_PLIKI", wylaczone or frozenset())
    kod = guard.main()
    return kod, capsys.readouterr().out


# ---------------------------------------------------------------------------
# REGULA A - przypisanie atrybutu (trzy formy skladniowe)
# ---------------------------------------------------------------------------


def test_przypisanie_atrybutu_w_repozytorium_przypadku_jest_naruszeniem(
    tmp_path, monkeypatch, capsys
) -> None:
    """Dokladny ksztalt skasowanego `case_repository.mark_case_fresh`."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "infrastructure/case_repository.py": (
                "from infrastructure.persistence.models import StudyCaseORM\n\n\n"
                "def oznacz(session, case_id):\n"
                "    row = session.get(StudyCaseORM, case_id)\n"
                '    row.result_status = "FRESH"\n'
                "    return row\n"
            )
        },
    )
    assert kod == 1, wyjscie
    assert "przypisanie:.result_status" in wyjscie


def test_przypisanie_z_adnotacja_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """`row.result_status: str = "OUTDATED"` - adnotacja nie omija bramki."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "application/most.py": (
                "from domain.study_case import StudyCase\n\n\n"
                "def oznacz(row):\n"
                '    row.result_status: str = "OUTDATED"\n'
            )
        },
    )
    assert kod == 1, wyjscie
    assert "przypisanie:.result_status" in wyjscie


def test_przypisanie_zlozone_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """`row.result_status += ...` - forma `AugAssign` tez jest zapisem."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "application/most.py": (
                "from domain.study_case import StudyCase\n\n\n"
                "def oznacz(row):\n"
                '    row.result_status += "!"\n'
            )
        },
    )
    assert kod == 1, wyjscie
    assert "przypisanie:.result_status" in wyjscie


def test_przypisanie_wielokrotne_liczy_kazdy_cel(tmp_path, monkeypatch, capsys) -> None:
    """`a.result_status = b.result_status = "FRESH"` - dwa cele, dwa naruszenia."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "application/most.py": (
                "from domain.study_case import StudyCase\n\n\n"
                "def oznacz(a, b):\n"
                '    a.result_status = b.result_status = "FRESH"\n'
            )
        },
    )
    assert kod == 1, wyjscie
    assert wyjscie.count("przypisanie:.result_status") == 2, wyjscie


# ---------------------------------------------------------------------------
# REGULA A - WYJATEK: pole wlasne obiektu w `__init__`
# ---------------------------------------------------------------------------


def test_pole_wlasne_w_init_nie_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """`StaleResultsError.__init__` nadawal wlasne pole - to nie jest przejscie
    statusu przypadku, tylko konstrukcja obiektu."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "application/errors.py": (
                "class StudyCaseBlad(Exception):\n"
                "    def __init__(self, run_id, result_status):\n"
                "        self.run_id = run_id\n"
                "        self.result_status = result_status\n"
            )
        },
    )
    assert kod == 0, wyjscie


def test_pole_wlasne_poza_init_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """Wyjatek dotyczy WYLACZNIE `__init__` - `self.result_status = ...` w metodzie
    przejscia jest dokladnie tym, co karta kasuje."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "application/most.py": (
                "class StudyCaseStan:\n"
                "    def mark_as_outdated(self):\n"
                '        self.result_status = "OUTDATED"\n'
            )
        },
    )
    assert kod == 1, wyjscie
    assert "przypisanie:.result_status" in wyjscie


# ---------------------------------------------------------------------------
# REGULA B - konstrukcja przypadku
# ---------------------------------------------------------------------------


def test_konstrukcja_orm_z_result_status_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "infrastructure/repo.py": (
                "from infrastructure.persistence.models import StudyCaseORM\n\n\n"
                "def dodaj(session, case):\n"
                '    session.add(StudyCaseORM(id=case.id, result_status="NONE"))\n'
            )
        },
    )
    assert kod == 1, wyjscie
    assert "konstrukcja:StudyCaseORM(result_status=)" in wyjscie


def test_konstrukcja_domenowa_i_fabryka_sa_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """`StudyCase(...)` i `new_study_case(...)` - obie drogi powstania przypadku."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "domain/fabryka.py": (
                "from domain.study_case import StudyCase, new_study_case\n\n\n"
                "def zbuduj(pid, status):\n"
                "    a = StudyCase(id=1, project_id=pid, name='x', result_status=status)\n"
                "    b = new_study_case(pid, 'y', result_status=status)\n"
                "    return a, b\n"
            )
        },
    )
    assert kod == 1, wyjscie
    assert "konstrukcja:StudyCase(result_status=)" in wyjscie
    assert "konstrukcja:new_study_case(result_status=)" in wyjscie


# ---------------------------------------------------------------------------
# REGULA C - DML na tabeli przypadkow (i jej NIEdzialanie na biegach)
# ---------------------------------------------------------------------------


def test_update_values_na_tabeli_przypadkow_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """Dokladny ksztalt skasowanego `mark_all_cases_outdated`."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "infrastructure/repo.py": (
                "from sqlalchemy import update\n"
                "from infrastructure.persistence.models import StudyCaseORM\n\n\n"
                "def uniewaznij(session, project_id):\n"
                "    stmt = (\n"
                "        update(StudyCaseORM)\n"
                "        .where(StudyCaseORM.project_id == project_id)\n"
                '        .values(result_status="OUTDATED")\n'
                "    )\n"
                "    session.execute(stmt)\n"
            )
        },
    )
    assert kod == 1, wyjscie
    assert "dml:update(StudyCaseORM).values(result_status=)" in wyjscie


def test_update_values_na_biegach_legacy_nie_jest_naruszeniem(
    tmp_path, monkeypatch, capsys
) -> None:
    """Tor legacy `analysis_runs` jest POZA karta - rozroznienie musi byc
    strukturalne (lancuch wywolan), nie nazwowe (sama obecnosc `result_status`).
    Ten test odtwarza dokladny ksztalt `analysis_run_repository.mark_results_outdated`.
    """
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "infrastructure/analysis_run_repository.py": (
                "from sqlalchemy import update\n"
                "from infrastructure.persistence.models import AnalysisRunORM\n\n\n"
                "def uniewaznij(session, project_id):\n"
                "    stmt = (\n"
                "        update(AnalysisRunORM)\n"
                "        .where(AnalysisRunORM.project_id == project_id)\n"
                '        .values(result_status="OUTDATED")\n'
                "    )\n"
                "    session.execute(stmt)\n"
            )
        },
    )
    assert kod == 0, wyjscie


def test_zapis_statusu_biegu_kanonicznego_nie_jest_naruszeniem(
    tmp_path, monkeypatch, capsys
) -> None:
    """`CanonicalRun.result_status` (bieg) jest POZA karta. Ten test odtwarza
    dokladny ksztalt `canonical_run_repository.save` - plik biegow nie wspomina
    `StudyCase` ani razu, wiec regula A go nie obejmuje."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "infrastructure/canonical_run_repository.py": (
                "from infrastructure.persistence.models import CanonicalRunORM\n\n\n"
                "def zapisz(session, run):\n"
                "    row = session.get(CanonicalRunORM, run.id)\n"
                "    row.result_status = run.result_status\n"
                "    return row\n"
            )
        },
    )
    assert kod == 0, wyjscie


def test_zapis_statusu_biegu_w_pliku_wspominajacym_przypadek_jest_naruszeniem(
    tmp_path, monkeypatch, capsys
) -> None:
    """Kierunek bezpieczny: gdy KTOS dolozy zapis `.result_status` do pliku, ktory
    zajmuje sie przypadkiem, bramka gryzie nawet jesli zmienna nazywa sie `run`.
    Rozroznienie po nazwie zmiennej byloby zgadywaniem; rozdzial torow ma isc po
    plikach, a nie po tym, jak ktos nazwal lokalna zmienna."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "application/mieszany.py": (
                "from domain.study_case import StudyCase\n\n\n"
                "def zapisz(run):\n"
                '    run.result_status = "VALID"\n'
            )
        },
    )
    assert kod == 1, wyjscie


# ---------------------------------------------------------------------------
# REGULA D - powrot skasowanego typu
# ---------------------------------------------------------------------------


def test_powrot_typu_statusu_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "domain/study_case.py": (
                "from enum import StrEnum\n\n\n"
                "class StudyCaseResultStatus(StrEnum):\n"
                '    NONE = "NONE"\n\n\n'
                "def domyslny():\n"
                "    return StudyCaseResultStatus.NONE\n"
            )
        },
    )
    assert kod == 1, wyjscie
    assert "typ:StudyCaseResultStatus" in wyjscie


def test_typ_statusu_jako_atrybut_modulu_jest_wykrywany(tmp_path, monkeypatch, capsys) -> None:
    """`study_case.StudyCaseResultStatus.FRESH` - forma atrybutowa, nie `Name`."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "application/most.py": (
                "from domain import study_case\n\n\n"
                "def status():\n"
                "    return study_case.StudyCaseResultStatus.FRESH\n"
            )
        },
    )
    assert kod == 1, wyjscie
    assert "typ:StudyCaseResultStatus" in wyjscie


# ---------------------------------------------------------------------------
# ILOCZYN CECH - jeden plik, kilka regul naraz
# ---------------------------------------------------------------------------


def test_wiele_regul_w_jednym_pliku_liczy_sie_osobno(tmp_path, monkeypatch, capsys) -> None:
    """Zapis atrybutu × konstrukcja × DML × typ - kazde naruszenie ma wlasny wiersz,
    zeby naprawa jednego nie ukryla pozostalych."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "infrastructure/wszystko.py": (
                "from sqlalchemy import update\n"
                "from domain.study_case import StudyCase, StudyCaseResultStatus\n"
                "from infrastructure.persistence.models import StudyCaseORM\n\n\n"
                "def wszystko(session, row, project_id):\n"
                "    row.result_status = StudyCaseResultStatus.OUTDATED\n"
                '    session.add(StudyCaseORM(result_status="NONE"))\n'
                "    session.execute(\n"
                "        update(StudyCaseORM)\n"
                '        .values(result_status="OUTDATED")\n'
                "    )\n"
            )
        },
    )
    assert kod == 1, wyjscie
    assert "przypisanie:.result_status" in wyjscie
    assert "konstrukcja:StudyCaseORM(result_status=)" in wyjscie
    assert "dml:update(StudyCaseORM).values(result_status=)" in wyjscie
    # `StudyCaseResultStatus` pada dwa razy: w imporcie (Name w ImportFrom nie jest
    # wezlem `Name`) i w uzyciu — liczy sie uzycie.
    assert "typ:StudyCaseResultStatus" in wyjscie


# ---------------------------------------------------------------------------
# KONTROLA UJEMNA - czysty kod nie jest karany
# ---------------------------------------------------------------------------


def test_odczyt_statusu_nie_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """Bramka zakazuje ZAPISU, nie odczytu: derywacja statusu CZYTA pole werdyktu
    i sklada je do odpowiedzi - to jest dokladnie droga, ktora ma wymuszac."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "application/status_wynikow.py": (
                "from domain.study_case import StudyCase\n\n\n"
                "def pola(werdykt):\n"
                "    dane = werdykt.to_overlay_fields()\n"
                '    return {"result_status": dane["result_status"]}\n'
            )
        },
    )
    assert kod == 0, wyjscie
    assert "PASS" in wyjscie


def test_slownik_z_kluczem_result_status_nie_jest_naruszeniem(
    tmp_path, monkeypatch, capsys
) -> None:
    """Klucz slownika (kontrakt HTTP) to nie zapis kolumny."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "api/study_cases.py": (
                "from domain.study_case import StudyCase\n\n\n"
                "def odpowiedz(status):\n"
                '    return {"result_status": status, "results_valid": status == "FRESH"}\n'
            )
        },
    )
    assert kod == 0, wyjscie


# ---------------------------------------------------------------------------
# WYLACZENIE ARCHIWUM - jawne, przypiete, i wykrywane gdy martwe
# ---------------------------------------------------------------------------


def test_wylaczony_plik_archiwum_nie_jest_skanowany(tmp_path, monkeypatch, capsys) -> None:
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "application/project_archive/service.py": (
                "from infrastructure.persistence.models import StudyCaseORM\n\n\n"
                "def odtworz(session, sc_data):\n"
                '    session.add(StudyCaseORM(result_status=sc_data["result_status"]))\n'
            ),
            "application/inny.py": "def f():\n    return 1\n",
        },
        wylaczone=frozenset({"application/project_archive/service.py"}),
    )
    assert kod == 0, wyjscie


def test_martwe_wylaczenie_jest_bledem(tmp_path, monkeypatch, capsys) -> None:
    """Wylaczenie wskazujace plik, ktorego nie ma, to cicha dziura w zakresie."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {"application/istnieje.py": "def f():\n    return 1\n"},
        wylaczone=frozenset({"application/zniknal.py"}),
    )
    assert kod == 1, wyjscie
    assert "wylaczenie wskazuje pliki, ktorych nie ma" in wyjscie


# ---------------------------------------------------------------------------
# PUSTKA JEST BLEDEM, NIE SUKCESEM
# ---------------------------------------------------------------------------


def test_brak_korzenia_skanowania_jest_bledem(tmp_path, monkeypatch, capsys) -> None:
    monkeypatch.setattr(guard, "BACKEND_SRC", tmp_path / "nie_ma_takiego")
    assert guard.main() == 1
    assert "brak korzenia skanowania" in capsys.readouterr().out


def test_pusty_skan_jest_bledem(tmp_path, monkeypatch, capsys) -> None:
    root = tmp_path / "src"
    root.mkdir(parents=True)
    monkeypatch.setattr(guard, "BACKEND_SRC", root)
    monkeypatch.setattr(guard, "WYLACZONE_PLIKI", frozenset())
    assert guard.main() == 1
    assert "PUSTY SKAN" in capsys.readouterr().out


# ---------------------------------------------------------------------------
# STAN RZECZYWISTEGO REPOZYTORIUM
# ---------------------------------------------------------------------------


def test_biezacy_stan_repozytorium_jest_zielony(capsys) -> None:
    """Bramka na PRAWDZIWYM drzewie `backend/src` - budzet ZERO od pierwszego dnia
    (karta CV-2-W skasowala wszystkich pisarzy, wiec nie ma czego amnestionowac)."""
    assert guard.main() == 0
    wyjscie = capsys.readouterr().out
    assert "PASS" in wyjscie


def test_wylaczenie_wskazuje_istniejacy_plik_archiwum() -> None:
    """Jedyne wylaczenie musi wskazywac realny plik - inaczej jest ozdoba."""
    assert guard.WYLACZONE_PLIKI == frozenset({"application/project_archive/service.py"})
    for rel in guard.WYLACZONE_PLIKI:
        assert (guard.BACKEND_SRC / rel).is_file(), rel
