#!/usr/bin/env python3
"""Testy własne `backend_proza_symboli_guard.py` (karta UX-04 / ZU, punkt 4).

Iloczyn cech: rodzaj tekstu (stała, f-string, docstring, komunikat assert, logger,
`AssertionError`) × zapis symbolu (indeks `_`, znak spłaszczony, symbol bez podkreślnika,
LaTeX z ukośnikiem, segment `$...$`) × reguła miejsca (rejestr równań `notes`, wzór
i podstawienie śladu V12.6 z budowniczym i bez, wzór śladu NC RfG) × ten sam tekst w pliku
spoza reguły (para: wyjątek działa wyłącznie tam, gdzie go uzasadniono) × zapadka per plik
(przekroczenie, pin nieświeży, nowy plik z pinem 0) oraz brzegi `main()` na żywym drzewie.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import backend_proza_symboli_guard as guard  # noqa: E402

PROZA_Z_SYMBOLEM = "Prąd I_th jest za duży"


def _drzewo(tmp_path: Path, pliki: dict[str, str]) -> Path:
    src = tmp_path / "src"
    for wzgledna, tresc in {
        guard.PLIK_REJESTRU_V126: "REJESTR = {}\n",
        **pliki,
    }.items():
        sciezka = src / wzgledna
        sciezka.parent.mkdir(parents=True, exist_ok=True)
        sciezka.write_text(tresc, encoding="utf-8")
    return src


def _liczba(tmp_path: Path, wzgledna: str, tresc: str) -> int:
    return len(guard.zmierz(_drzewo(tmp_path, {wzgledna: tresc})).get(wzgledna, []))


@pytest.mark.parametrize(
    ("tekst", "trafienie"),
    [
        ("Prąd I_th jest za duży", True),  # indeks podkreślnikiem
        ("Początkowy prąd I″k w węźle", True),  # znak spłaszczony (bis)
        ("Rezystancja R′0 przyjęta", True),  # prim
        ("Współczynnik cos φ modułu", True),  # φ
        ("Prąd Ik3 w węźle", True),  # symbol bez podkreślnika
        ("Napięcie Un sieci", True),
        ("Czas t_b wyłączenia", True),
        ("Prąd \\(I_{th}\\) jest za duży", False),  # LaTeX — ukośnik
        ("Prąd $I_{th}$ jest za duży", False),  # segment wzoru
        ("I_th > limit", False),  # bez słowa polskiego
        ("Prąd_I_th", False),  # bez spacji — identyfikator
        ("Pole `i_th_a` jest puste", False),  # identyfikator w odwrotnych apostrofach
        ("Kod NIE_DOTYCZY dla pola", False),  # kod statusu
        ("Zakaz interpolacji, §0.2 karty P0.7", False),  # numer karty, nie symbol P0
        ("Straty jałowe P0 transformatora", True),  # symbol P0 w prozie
        ("Prąd znamionowy jest za duży", False),  # proza słowami
    ],
)
def test_wykrycie_prozy_z_symbolem(tekst: str, trafienie: bool) -> None:
    assert guard.jest_proza_z_symbolem(tekst) is trafienie


@pytest.mark.parametrize(
    ("tresc", "oczekiwane"),
    [
        (f'X = "{PROZA_Z_SYMBOLEM}"\n', 1),
        (f'def f(a):\n    return f"{PROZA_Z_SYMBOLEM} o {{a}} A"\n', 1),  # f-string w całości
        (f'"""{PROZA_Z_SYMBOLEM}"""\n', 0),  # docstring modułu
        (f'def f():\n    """{PROZA_Z_SYMBOLEM}"""\n', 0),  # docstring funkcji
        (f'def f(a):\n    assert a, "{PROZA_Z_SYMBOLEM}"\n', 0),
        (f'import logging\nlog = logging.getLogger()\nlog.warning("{PROZA_Z_SYMBOLEM}")\n', 0),
        (f'raise AssertionError("{PROZA_Z_SYMBOLEM}")\n', 0),
        (f'raise ValueError("{PROZA_Z_SYMBOLEM}")\n', 1),  # komunikat błędu trafia do UI
    ],
)
def test_rodzaj_tekstu(tmp_path: Path, tresc: str, oczekiwane: int) -> None:
    assert _liczba(tmp_path, "modul/a.py", tresc) == oczekiwane


def test_notes_rejestru_rownan_tylko_w_rejestrze(tmp_path: Path) -> None:
    tresc = f'E = EquationDefinition(name_pl="Prąd", notes="{PROZA_Z_SYMBOLEM}")\n'
    assert _liczba(tmp_path, guard.PLIK_REJESTRU_ROWNAN, tresc) == 0
    assert _liczba(tmp_path / "b", "application/inny.py", tresc) == 1
    # Inne pole tej samej definicji liczy się normalnie.
    tresc_nazwa = f'E = EquationDefinition(name_pl="{PROZA_Z_SYMBOLEM}")\n'
    assert _liczba(tmp_path / "c", guard.PLIK_REJESTRU_ROWNAN, tresc_nazwa) == 1


_REJESTR_V126 = (
    "REJESTR_WZOROW_V126 = {\n"
    '    "z_budowniczym": WzorKroku("x", podstawienie=_p),\n'
    '    "bez_budowniczego": WzorKroku("x"),\n'
    '    "jawne_none": WzorKroku("x", podstawienie=None),\n'
    "}\n"
)


def _v126(tmp_path: Path, klucz: str) -> list[tuple[int, str]]:
    tresc = (
        "def f(trace):\n"
        f'    trace.add("{klucz}", "Wzór I_th dla węzła", {{}}, "Podstawienie I_th = 5 w węźle")\n'
        '    formula = "Wzór U_n dla sieci"\n'
    )
    src = _drzewo(tmp_path, {guard.PLIK_V126: tresc, guard.PLIK_REJESTRU_V126: _REJESTR_V126})
    return guard.zmierz(src).get(guard.PLIK_V126, [])


def test_klucze_v126_z_budowniczym_podstawienia(tmp_path: Path) -> None:
    src = _drzewo(tmp_path, {guard.PLIK_REJESTRU_V126: _REJESTR_V126})
    assert guard.klucze_v126_z_podstawieniem(src) == frozenset({"z_budowniczym"})


def test_slad_v126_wzor_zawsze_podstawienie_tylko_z_budowniczym(tmp_path: Path) -> None:
    assert _v126(tmp_path / "a", "z_budowniczym") == []
    for klucz in ("bez_budowniczego", "jawne_none"):
        teksty = [t for _, t in _v126(tmp_path / klucz, klucz)]
        assert teksty == ["Podstawienie I_th = 5 w węźle"]


def test_slad_v126_regula_tylko_w_rdzeniu_v126(tmp_path: Path) -> None:
    tresc = 'def f(trace):\n    trace.add("k", "Wzór I_th dla węzła", {}, "x")\n'
    assert _liczba(tmp_path, "network_model/solvers/inny.py", tresc) == 1


def test_slad_ncrfg_wzor_wolny_pozostale_argumenty_liczone(tmp_path: Path) -> None:
    tresc = (
        "def f(trace):\n"
        '    trace.add("id", "Nazwa kroku I_th w węźle", "Wzór I_th dla węzła", {})\n'
    )
    teksty = [
        t for _, t in guard.zmierz(_drzewo(tmp_path, {guard.PLIK_NCRFG: tresc}))[guard.PLIK_NCRFG]
    ]
    assert teksty == ["Nazwa kroku I_th w węźle"]
    assert _liczba(tmp_path / "b", "network_model/solvers/inny.py", tresc) == 2


def test_porownaj_przekroczenie_nieswiezy_i_nowy_plik() -> None:
    zmierzone = {"a.py": [(1, "x"), (2, "y")], "nowy.py": [(1, "z")], "c.py": [(1, "w")]}
    przekroczenia, nieswieze = guard.porownaj(zmierzone, {"a.py": 1, "b.py": 3, "c.py": 1})
    assert przekroczenia == ["a.py", "nowy.py"]
    assert nieswieze == ["b.py"]
    assert guard.porownaj({"a.py": [(1, "x")]}, {"a.py": 1}) == ([], [])


def test_pin_zywego_drzewa_jest_rowny_pomiarowi() -> None:
    zmierzone = guard.zmierz()
    assert guard.porownaj(zmierzone, guard.wczytaj_pin()) == ([], [])
    assert guard.main([]) == 0


def test_main_wstrzyknieta_proza_czerwieni_a_aktualizuj_odmawia(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    src = _drzewo(tmp_path, {"modul/a.py": f'X = "{PROZA_Z_SYMBOLEM}"\n'})
    pin = tmp_path / "pin.json"
    pin.write_text(json.dumps({}), encoding="utf-8")
    monkeypatch.setattr(guard, "SRC", src)
    monkeypatch.setattr(guard, "PIN_PLIK", pin)
    assert guard.main([]) == 1
    assert guard.main(["--aktualizuj"]) == 1
    assert json.loads(pin.read_text(encoding="utf-8")) == {}
    # Naprawa słowami → pin nieświeży aż do obniżenia, potem zielono.
    (src / "modul/a.py").write_text('X = "Prąd cieplny jest za duży"\n', encoding="utf-8")
    pin.write_text(json.dumps({"modul/a.py": 1}), encoding="utf-8")
    assert guard.main([]) == 1
    assert guard.main(["--aktualizuj"]) == 0
    assert json.loads(pin.read_text(encoding="utf-8")) == {}
    assert guard.main([]) == 0
    assert guard.main(["--inicjuj"]) == 1  # pin już istnieje
