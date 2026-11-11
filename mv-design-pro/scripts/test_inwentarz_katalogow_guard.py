#!/usr/bin/env python3
"""Samotest strażnika tabeli gotowości katalogów (`inwentarz_katalogow_guard.py`).

PO CO (karta POLA-GPZ-SZABLONY, pkt 7). Strażnik obiecuje w docstringu „0 = tabela zgodna,
1 = rozjazd / brak znaczników / brak dokumentu”, ale tej obietnicy nie przypinał żaden test —
meldunek wykonawcy opisał bieg, w którym na nieaktualnej tabeli zobaczył „Napraw” i kod 0.
Pomiar tej karty: sam strażnik i miernik `--sprawdz` zwracają 1 na rozjeździe (kod 0 bierze się
z potoku `cmd | tail`, który zwraca kod ostatniego członu). Deklaracja bez testu jest fałszywą
pewnością, więc każdy kod wyjścia jest tu przypięty — na KOPII dokumentu w katalogu tymczasowym
(zapis do drzewa repozytorium odrzuca hak `scripts/conftest.py`), plus jeden bieg podprocesem
na prawdziwym repozytorium i jeden podprocesem na zepsutej kopii (kod wyjścia procesu, nie
wartość funkcji).
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend" / "scripts"))
sys.path.insert(0, str(REPO / "scripts"))

import inwentarz_katalogow  # noqa: E402
import inwentarz_katalogow_guard  # noqa: E402

PRAWDZIWY = inwentarz_katalogow.DOKUMENT


def _kopia(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, tresc: str | None) -> Path:
    """Dokument strażnika i miernika przekierowany na kopię w katalogu tymczasowym."""
    kopia = tmp_path / "SPEC_KATALOGI.md"
    if tresc is not None:
        kopia.write_text(tresc, encoding="utf-8")
    monkeypatch.setattr(inwentarz_katalogow, "DOKUMENT", kopia)
    monkeypatch.setattr(inwentarz_katalogow_guard, "DOKUMENT", kopia)
    return kopia


def _zgodna() -> str:
    """Treść zgodna z pomiarem (miernik na prawdziwym dokumencie)."""
    return inwentarz_katalogow.zloz_dokument(
        PRAWDZIWY.read_text(encoding="utf-8"),
        inwentarz_katalogow.renderuj_blok_generowany(
            inwentarz_katalogow.zmierz_katalog(), inwentarz_katalogow.zmierz_karty_widmowe()
        ),
    )


def _rozjechana() -> str:
    tresc = _zgodna()
    blok = tresc.index(inwentarz_katalogow.ZNACZNIK_POCZATEK)
    return tresc[:blok] + tresc[blok:].replace("Pozycji łącznie: ", "Pozycji łącznie: 1", 1)


def test_zgodna_tabela_kod_0(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys) -> None:
    _kopia(tmp_path, monkeypatch, _zgodna())
    assert inwentarz_katalogow_guard.main() == 0
    assert "OK" in capsys.readouterr().out


def test_rozjazd_tabeli_kod_1(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys) -> None:
    _kopia(tmp_path, monkeypatch, _rozjechana())
    assert inwentarz_katalogow_guard.main() == 1
    wyjscie = capsys.readouterr().out
    assert "VIOLATION" in wyjscie and "Napraw" in wyjscie


def test_brak_znacznikow_kod_1(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    tresc = _zgodna().replace(inwentarz_katalogow.ZNACZNIK_KONIEC, "")
    _kopia(tmp_path, monkeypatch, tresc)
    assert inwentarz_katalogow_guard.main() == 1


def test_brak_dokumentu_kod_1(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _kopia(tmp_path, monkeypatch, None)
    assert inwentarz_katalogow_guard.main() == 1


def test_miernik_sprawdz_ten_sam_kod(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Miernik w trybie `--sprawdz` i strażnik orzekają tak samo (jedna funkcja dokumentu)."""
    _kopia(tmp_path, monkeypatch, _rozjechana())
    assert inwentarz_katalogow.main(["--sprawdz"]) == 1
    _kopia(tmp_path, monkeypatch, _zgodna())
    assert inwentarz_katalogow.main(["--sprawdz"]) == 0


def test_proces_na_repozytorium_kod_0() -> None:
    wynik = subprocess.run(
        [sys.executable, str(REPO / "scripts" / "inwentarz_katalogow_guard.py")],
        capture_output=True,
        text=True,
        check=False,
    )
    assert wynik.returncode == 0, wynik.stdout + wynik.stderr


def test_proces_na_rozjechanej_kopii_kod_1(tmp_path: Path) -> None:
    """Kod wyjścia PROCESU (nie wartość `main`) na rozjechanej tabeli — `sys.exit(main())`."""
    kopia = tmp_path / "SPEC_KATALOGI.md"
    kopia.write_text(_rozjechana(), encoding="utf-8")
    program = (
        "import sys; from pathlib import Path; "
        f"sys.path[:0] = [{str(REPO / 'backend' / 'scripts')!r}, {str(REPO / 'scripts')!r}]; "
        "import inwentarz_katalogow as m, inwentarz_katalogow_guard as g; "
        f"m.DOKUMENT = g.DOKUMENT = Path({str(kopia)!r}); sys.exit(g.main())"
    )
    wynik = subprocess.run(
        [sys.executable, "-c", program], capture_output=True, text=True, check=False
    )
    assert wynik.returncode == 1, wynik.stdout + wynik.stderr
    assert "Napraw" in wynik.stdout
