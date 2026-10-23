"""Kontrakt podziału e2e na shardy (`scripts/e2e_shardy.py`, karta SZYBKIE-TESTY).

Deklaracje z nagłówka skryptu mają tu przypięte testy (reguła KLASA pkt 4). Iloczyn cech:
{liczba shardów: 1, 2, 4, więcej niż plików} × {pliki: z pomiarem, bez pomiaru} ×
{pomiar pliku usuniętego} — rozłączność, komplet, determinizm i nazwane odstępstwa.
"""

from __future__ import annotations

import json
from pathlib import Path

import e2e_shardy as shardy
import pytest


def _katalog(tmp_path: Path, nazwy: list[str]) -> Path:
    e2e = tmp_path / "e2e"
    e2e.mkdir(parents=True)
    for nazwa in nazwy:
        (e2e / nazwa).write_text("", encoding="utf-8")
    (e2e / "pomocnik.ts").write_text("", encoding="utf-8")  # nie-spec: poza podziałem
    return e2e


@pytest.mark.parametrize("liczba", [1, 2, 4, 9])
def test_shardy_rozlaczne_i_komplet(liczba: int) -> None:
    wagi = {f"e2e/s{i}.spec.ts": float((i * 37) % 11 + 1) for i in range(7)}
    podzial = shardy.przydziel(wagi, liczba)
    wszystkie = [plik for shard in podzial for plik in shard]
    assert len(podzial) == liczba
    assert sorted(wszystkie) == sorted(wagi)
    assert len(wszystkie) == len(set(wszystkie))


def test_przydzial_deterministyczny_przy_remisach() -> None:
    wagi = {f"e2e/s{i}.spec.ts": 5.0 for i in range(8)}
    assert shardy.przydziel(wagi, 3) == shardy.przydziel(dict(reversed(wagi.items())), 3)


def test_lpt_rownowazy_wg_czasu_nie_liczby_plikow() -> None:
    # Jeden długi spec i sześć krótkich: podział po liczbie plików dałby 4 pliki
    # (długi + 3 krótkie) wobec 3 krótkich; LPT daje długi spec sam.
    wagi = {"e2e/dlugi.spec.ts": 60.0, **{f"e2e/k{i}.spec.ts": 10.0 for i in range(6)}}
    podzial = shardy.przydziel(wagi, 2)
    assert ["e2e/dlugi.spec.ts"] in podzial
    assert max(sum(wagi[p] for p in s) for s in podzial) == 60.0


def test_wagi_nazywaja_brak_pomiaru_i_pomiar_bez_pliku() -> None:
    pliki = ["e2e/a.spec.ts", "e2e/b.spec.ts", "e2e/nowy.spec.ts"]
    czasy = {"e2e/a.spec.ts": 10.0, "e2e/b.spec.ts": 30.0, "e2e/usuniety.spec.ts": 50.0}
    wagi, bez_pomiaru, bez_pliku = shardy.wagi(pliki, czasy)
    assert bez_pomiaru == ["e2e/nowy.spec.ts"]
    assert bez_pliku == ["e2e/usuniety.spec.ts"]
    assert wagi["e2e/nowy.spec.ts"] == 30.0  # mediana {10, 30, 50}


def _uruchom(monkeypatch, tmp_path: Path, pliki: list[str], czasy: dict[str, float], argv):
    e2e = _katalog(tmp_path, pliki)
    plik_czasow = e2e / "czasy_specow.json"
    plik_czasow.write_text(json.dumps({"zrodlo": "test", "czasy_s": czasy}), encoding="utf-8")
    monkeypatch.setattr(shardy, "KATALOG_E2E", e2e)
    monkeypatch.setattr(shardy, "PLIK_CZASOW", plik_czasow)
    return shardy.main(argv)


def test_main_suma_shardow_to_komplet_specow(monkeypatch, tmp_path, capsys) -> None:
    pliki = ["a.spec.ts", "b.spec.ts", "c.spec.ts", "nowy.spec.ts"]
    czasy = {"e2e/a.spec.ts": 5.0, "e2e/b.spec.ts": 50.0, "e2e/c.spec.ts": 20.0}
    zebrane: list[str] = []
    for numer in (1, 2, 3):
        assert (
            _uruchom(monkeypatch, tmp_path / str(numer), pliki, czasy, ["--shard", f"{numer}/3"])
            == 0
        )
        wyjscie = capsys.readouterr()
        zebrane += wyjscie.out.split()
        assert "UWAGA: spec bez pomiaru czasu (waga = mediana): e2e/nowy.spec.ts" in wyjscie.err
    assert sorted(zebrane) == [f"e2e/{p}" for p in pliki]


def test_main_pomiar_speku_usunietego_to_blad(monkeypatch, tmp_path, capsys) -> None:
    czasy = {"e2e/a.spec.ts": 5.0, "e2e/usuniety.spec.ts": 9.0}
    assert _uruchom(monkeypatch, tmp_path, ["a.spec.ts"], czasy, ["--shard", "1/2"]) == 2
    assert "e2e/usuniety.spec.ts" in capsys.readouterr().err


@pytest.mark.parametrize("zly", ["0/4", "5/4", "x/4", "2"])
def test_main_zly_numer_sharda_to_blad(monkeypatch, tmp_path, zly: str) -> None:
    assert (
        _uruchom(monkeypatch, tmp_path, ["a.spec.ts"], {"e2e/a.spec.ts": 1.0}, ["--shard", zly])
        == 2
    )


def test_czasy_z_raportu_sumuja_proby_testow_pliku() -> None:
    raport = {
        "suites": [
            {
                "file": "a.spec.ts",
                "specs": [{"tests": [{"results": [{"duration": 1500}, {"duration": 500}]}]}],
                "suites": [
                    {"specs": [{"tests": [{"results": [{"duration": 3000}]}]}], "suites": []}
                ],
            },
            {"file": "b.spec.ts", "specs": [{"tests": [{"results": [{"duration": 250}]}]}]},
        ]
    }
    assert shardy.czasy_z_raportu(raport) == {"e2e/a.spec.ts": 5.0, "e2e/b.spec.ts": 0.2}


def test_repozytorium_plik_czasow_mierzy_wylacznie_istniejace_speki() -> None:
    """Pin stanu repo: każdy wpis pomiaru ma plik speku (CI odrzuciłoby podział)."""
    _wagi, _bez_pomiaru, bez_pliku = shardy.wagi(shardy.speki(), shardy.wczytaj_czasy())
    assert bez_pliku == []
