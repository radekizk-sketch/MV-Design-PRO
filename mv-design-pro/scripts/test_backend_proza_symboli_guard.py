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
    for wzgledna, tresc in {guard.PLIK_REJESTRU_V126: "REJESTR = {}\n", **pliki}.items():
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
        ("I_th > lim", False),  # bez słowa
        ("Prąd_I_th", False),  # bez spacji — identyfikator
        ("Pole `i_th_a` jest puste", False),  # identyfikator w odwrotnych apostrofach
        ("Kod NIE_DOTYCZY dla pola", False),  # kod statusu
        ("Zakaz interpolacji, §0.2 karty P0.7", False),  # numer karty, nie symbol P0
        ("Moc bierna generatora (kod 'generator.q_missing')", False),  # kod błędu
        ("Moc bierna Q_g generatora (kod 'generator.q_missing')", True),
        ("Straty jałowe P0 transformatora", True),  # symbol P0 w prozie
        ("Prąd znamionowy jest za duży", False),  # proza słowami
        # Proza bez znaków diakrytycznych i bez słów funkcyjnych — rdzeń słownictwa
        # elektroenergetycznego (luka zmierzona 2026-11-04: 108 tekstów niewidocznych).
        ("Rezystancja R′1 (20 °C)", True),
        ("Zasilanie GPZ 15 kV Sk3 200 MVA", True),
        ("Granica dopuszczalna I2", True),
        ("Rachunek pomija zaleznosc Pk od temperatury", True),
        ("Rezystancja jednostkowa (20 °C)", False),  # rdzeń bez symbolu
        ("Susceptancja B′1", True),  # proza spoza dawnej listy rdzeni
        ("Equivalent impedance is zero; cannot compute Ik''", True),  # proza angielska
        ("Q_inj [MW]", False),  # etykieta bez słowa
        ("Q_inj [Mvar]", True),  # nagłówek eksportu z symbolem — jednostka jest słowem
        ('<Relationship Id="rId1" Target="worksheets/sheet1.xml"/>', False),  # znacznik
        ("kod osd_enea.station.transformer_power_limit", False),  # kod w przestrzeni nazw
        # Indeks w klamrach to zapis LaTeX, nie symbol spłaszczony.
        ("S_{2obl} = S_{aparatow} + I_{2n}^2 R_p", False),
        ("Moc S^{2} sieci", False),
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
        (f'class K:\n    a: int = 1\n    """{PROZA_Z_SYMBOLEM}"""\n', 0),  # docstring atrybutu
        (f'class K:\n    a: str = "{PROZA_Z_SYMBOLEM}"\n', 1),  # wartość pola liczona
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


def test_rejestr_wzorow_ncrfg_klucz_wolny_tylko_w_rejestrze(tmp_path: Path) -> None:
    """Klucz rejestru LaTeX NC RfG to zapis rdzenia; ten sam słownik w innym pliku liczony."""
    tresc = f'W = {{"{PROZA_Z_SYMBOLEM}": "x", "a": "{PROZA_Z_SYMBOLEM} b"}}\n'
    assert _liczba(tmp_path, guard.PLIK_WZOROW_NCRFG, tresc) == 1  # tylko wartość
    assert _liczba(tmp_path / "inny", "application/inny.py", tresc) == 2


@pytest.mark.parametrize(
    ("tresc", "oczekiwane"),
    [
        ('E(latex="Z_s razem z Z_m", name_pl="x")\n', 0),
        ('E(formula_latex="Z_s razem z Z_m")\n', 0),
        ('W = {"wzor_latex": "Z_s razem z Z_m"}\n', 0),
        ('E(formula="Z_s razem z Z_m")\n', 1),  # pole tekstowe — liczone
        ('W = {"opis_pl": "Z_s razem z Z_m"}\n', 1),
    ],
)
def test_pole_latex_wolne_inne_pole_liczone(tmp_path: Path, tresc: str, oczekiwane: int) -> None:
    assert _liczba(tmp_path, "application/x.py", tresc) == oczekiwane


def test_opis_pola_kontraktu_resultset_wolny_tylko_w_kontrakcie(tmp_path: Path) -> None:
    """Opis pola schematu FROZEN ResultSet v1 wolny (reguła 9); inne teksty i pliki liczone."""
    tresc = (
        f'a: str = Field(..., description="{PROZA_Z_SYMBOLEM}")\n'
        f'b: str = Field(..., title="{PROZA_Z_SYMBOLEM}")\n'
    )
    assert _liczba(tmp_path, guard.PLIK_KONTRAKTU_RESULTSET, tresc) == 1  # tylko `title`
    assert _liczba(tmp_path / "inny", "domain/inny_kontrakt.py", tresc) == 2


# --- Druga część klasy: wzór albo podstawienie bez słów (decyzja architekta 2026-11-04) ---


@pytest.mark.parametrize(
    ("tekst", "trafienie"),
    [
        ("Z_k = {} + {} = {}", True),  # podstawienie f-stringu
        ("Ik''={} kA", True),  # bez spacji, ale znak wzoru i miejsce na liczbę
        ("U0 = {} V; U_b = {} V; U_c = {} V", True),
        ("{}×In", True),  # znak działania zamiast spacji — zapis dla człowieka
        ("I_dyn {}%", True),  # miejsce na liczbę jest znakiem wzoru
        ("I²·t ≤ k²·S²", True),  # symbol z kwadratem Unicode
        ("Z_loop = Σ(R_i + jX_i)", True),
        ("Q_inj [MW]", False),  # etykieta bez znaku wzoru
        ("kV / Ω = kA", False),  # algebra jednostek — bez symbolu wielkości
        ("A²·s", False),  # jednostka, nie symbol
        ("S_{2obl} = S_{aparatow} + I_{2n}^2 R_p", False),  # LaTeX — indeks w klamrach
        ("I_th=I_dop", False),  # bez spacji i bez znaku działania — identyfikator
        ("Prąd I_th = {} A", False),  # ma słowo — pierwsza część klasy, nie ta
        ("Prąd zastępczy cieplny = {} A", False),  # słowa, bez symbolu
    ],
)
def test_wykrycie_wzoru_bez_slow(tekst: str, trafienie: bool) -> None:
    assert guard.jest_wzorem_bez_slow(tekst) is trafienie


def test_obie_czesci_klasy_rozlaczne_i_laczone_w_trafieniu() -> None:
    """Para predykatów: proza z symbolem i wzór bez słów nie nakładają się, `jest_trafieniem`
    łączy obie — tekst trafia dokładnie jednym predykatem."""
    proza, wzor = "Prąd I_th = {} A", "I_th = {} A"
    assert guard.jest_proza_z_symbolem(proza) and not guard.jest_wzorem_bez_slow(proza)
    assert guard.jest_wzorem_bez_slow(wzor) and not guard.jest_proza_z_symbolem(wzor)
    assert guard.jest_trafieniem(proza) and guard.jest_trafieniem(wzor)
    assert not guard.jest_trafieniem("Prąd zastępczy cieplny jest za duży")


@pytest.mark.parametrize(
    ("tekst", "trafienie"),
    [
        ("Energia cieplna zwarcia I²t", True),
        ("Wytrzymałość cieplna przewodu k²S²", True),
        ("Straty przy obciążeniu β² razy straty zwarcia", True),
        ("Przekrój żyły 120 mm²", False),  # jednostka z przedrostkiem słownym
        ("Energia zwarcia 5 A²·s", False),  # jednostka amper do kwadratu
    ],
)
def test_symbol_z_kwadratem_unicode(tekst: str, trafienie: bool) -> None:
    assert guard.jest_proza_z_symbolem(tekst) is trafienie


@pytest.mark.parametrize(
    ("tresc", "oczekiwane"),
    [
        # Reguła 10 — zmienna idzie do pola LaTeX: argument nazwany, klucz słownika,
        # przypisanie do klucza `*_latex`, element krotki zwracanej przez funkcję modułu.
        ('def f(a):\n    w = "U_b = {} V"\n    return E(substitution_latex=w)\n', 0),
        ('def f(a):\n    w = "U_b = {} V"\n    return {"result_latex": w}\n', 0),
        ('def f(a):\n    w = "U_b = {} V"\n    k = {}\n    k["substitution_latex"] = w\n', 0),
        (
            'def g():\n    return "U_b = {} V", 1\n'
            "def f():\n    w, n = g()\n    return E(formula_latex=w)\n",
            0,
        ),
        # Para: ta sama wartość, która do pola LaTeX nie idzie, jest liczona.
        ('def f(a):\n    w = "U_b = {} V"\n    return E(substitution=w)\n', 1),
        ('def f(a):\n    w = "U_b = {} V"\n    k = {}\n    k["substitution"] = w\n', 1),
        (
            'def g():\n    return "U_b = {} V", 1\n'
            "def f():\n    w, n = g()\n    return E(formula=w)\n",
            1,
        ),
        # Zmienna o tej samej nazwie w INNEJ funkcji nie dziedziczy wolności.
        (
            'def f():\n    w = "U_b = {} V"\n    return E(formula_latex=w)\n'
            'def h():\n    w = "U_c = {} V"\n    return E(substitution=w)\n',
            1,
        ),
    ],
)
def test_regula_10_przeplyw_do_pola_latex(tmp_path: Path, tresc: str, oczekiwane: int) -> None:
    assert _liczba(tmp_path, "application/x.py", tresc) == oczekiwane


def test_main_wstrzykniety_wzor_bez_slow_czerwieni(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Iniekcja drugiej części klasy: samo podstawienie w polu prozy czerwieni przy pustym
    pinie; naprawa (słowa w prozie, wzór w `substitution_latex`) wraca do zieleni."""
    src = _drzewo(tmp_path, {"modul/a.py": 'K = {"substitution": "U0 = 1 V; U_b = 2 V"}\n'})
    pin = tmp_path / "pin.json"
    pin.write_text(json.dumps({}), encoding="utf-8")
    monkeypatch.setattr(guard, "SRC", src)
    monkeypatch.setattr(guard, "PIN_PLIK", pin)
    assert guard.main([]) == 1
    (src / "modul/a.py").write_text(
        'K = {"substitution": "napięcie składowej zerowej 1 V", '
        '"substitution_latex": "U_0 = 1\\\\ \\\\mathrm{V}"}\n',
        encoding="utf-8",
    )
    assert guard.main([]) == 0


def test_pin_zywego_drzewa_pusty() -> None:
    """Po domknięciu klasy (decyzja architekta 2026-11-04) pin jest pusty: każdy plik
    `backend/src` ma zero trafień, nowy tekst z symbolem albo wzór bez słów czerwieni."""
    assert guard.wczytaj_pin() == {}
    assert guard.zmierz() == {}


# --- Trzecia część klasy: algebra jednostek bez symbolu wielkości (karta ZU, punkt 4) -------


@pytest.mark.parametrize(
    ("tekst", "trafienie"),
    [
        # Iloczyn cech: {iloraz, różnica, iloczyn, pierwiastek z sumy, suma, nierówność,
        # przejście} × {jednostka z przedrostkiem, jednostka względna, procent, bezwymiarowa}.
        ("kV / Ω = kA", True),
        ("% − % = pp; kW · Hz / Hz = kW.", True),
        ("Mvar − Mvar = Mvar; rezerwa nieujemna.", True),
        ("√(A²+A²)=A; (A−A)/A — bezwymiarowe.", True),
        ("A²·Ω·s = W·s = J; porównanie J z J.", True),
        ("p.u. / p.u. = 1.", True),
        ("kV / kV = p.u.", True),
        ("A ≤ A", True),
        ("p.u. ≤ p.u. ≤ p.u. → —", True),
        ("suma Mvar = Mvar; (+) generacja.", True),
        ("Ω/m · 1000 = Ω/km", True),
        # Nie algebra jednostek: porównanie liczby z jednostką, przypisanie jednoliterowe,
        # zakres procentowy, funkcja `min(`, zapis LaTeX, zdanie słowami.
        ("Measurement.sigma musi być > 0 (W = 1/sigma^2).", False),
        ("napięcie > 0 V", False),
        ("0 < i0 % < 10 transformatora", False),
        ("prąd {} A > min(a, b)", False),
        (r"\mathrm{kV}/\Omega = \mathrm{kA}", False),
        ("Zgodność jednostek: napięcie przez impedancję daje prąd w kiloamperach.", False),
        (r"Zgodność jednostek: $\mathrm{Mvar} - \mathrm{Mvar} = \mathrm{Mvar}$.", False),
    ],
)
def test_wykrycie_algebry_jednostek(tekst: str, trafienie: bool) -> None:
    assert guard.jest_algebra_jednostek(tekst) is trafienie
    assert guard.jest_trafieniem(tekst) is trafienie


def test_algebra_jednostek_w_docstringu_i_polu_latex_wolna(tmp_path: Path) -> None:
    tresc = (
        'def f():\n    """Weryfikacja: kV / Ω = kA."""\n'
        '    return {"unit_derivation_latex": "kV / Ω = kA", "unit_check": "kV / Ω = kA"}\n'
    )
    assert _liczba(tmp_path, "application/x.py", tresc) == 1  # tylko `unit_check`


_REJESTR_JEDNOSTEK_V126 = (
    'REJESTR = {}\nJEDNOSTKI_KROKOW_V126 = {\n    "V/Ω=A.": J("Zgodność jednostek: '
    'napięcie przez rezystancję daje prąd.", r"\\\\mathrm{V}/\\\\Omega = \\\\mathrm{A}"),\n}\n'
)


def test_slad_v126_weryfikacja_jednostek_wolna_tylko_z_wpisem_rejestru(tmp_path: Path) -> None:
    """Predykat parami: argument `unit_check` rdzenia V12.6 wolny ⇔ tekst jest kluczem
    `JEDNOSTKI_KROKOW_V126`; tekst spoza rejestru liczony; klucz słownika rejestru wolny."""
    rdzen = (
        "def f(trace):\n"
        '    trace.add("a", "w", {}, "p", {}, "V/Ω=A.", result_pl="x")\n'
        '    trace.add("b", "w", {}, "p", {}, "A²·s = A²·s.", result_pl="x")\n'
    )
    src = _drzewo(
        tmp_path, {guard.PLIK_REJESTRU_V126: _REJESTR_JEDNOSTEK_V126, guard.PLIK_V126: rdzen}
    )
    zmierzone = guard.zmierz(src)
    assert [t for _, t in zmierzone[guard.PLIK_V126]] == ["A²·s = A²·s."]
    assert guard.PLIK_REJESTRU_V126 not in zmierzone
    # Ten sam rdzeń bez rejestru jednostek: oba teksty liczone.
    src_bez = _drzewo(tmp_path / "bez", {guard.PLIK_V126: rdzen})
    assert len(guard.zmierz(src_bez)[guard.PLIK_V126]) == 2


def test_slad_ncrfg_weryfikacja_jednostek_wolna_tylko_z_wpisem_rejestru(tmp_path: Path) -> None:
    rejestr = (
        '_ZAPISY = {}\n_JEDNOSTKI = {\n    "s − s = s.": J("Zgodność jednostek: czas.", "x"),\n}\n'
    )
    rdzen = (
        "def f(trace):\n"
        '    trace.add("id", "nazwa", "wzór", {}, "p", {}, "s − s = s.")\n'
        '    trace.add("id", "nazwa", "wzór", {}, "p", {}, "% − % = pp.")\n'
    )
    src = _drzewo(tmp_path, {guard.PLIK_WZOROW_NCRFG: rejestr, guard.PLIK_NCRFG: rdzen})
    zmierzone = guard.zmierz(src)
    assert [t for _, t in zmierzone[guard.PLIK_NCRFG]] == ["% − % = pp."]
    assert guard.PLIK_WZOROW_NCRFG not in zmierzone


def test_main_wstrzyknieta_algebra_jednostek_czerwieni(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Iniekcja trzeciej części klasy: weryfikacja jednostek zapisana algebrą w polu prozy
    czerwieni przy pustym pinie; naprawa (zdanie słowami + LaTeX w `*_latex`) wraca do zieleni."""
    src = _drzewo(tmp_path, {"modul/a.py": 'K = {"unit_check_pl": "Mvar − Mvar = Mvar."}\n'})
    pin = tmp_path / "pin.json"
    pin.write_text(json.dumps({}), encoding="utf-8")
    monkeypatch.setattr(guard, "SRC", src)
    monkeypatch.setattr(guard, "PIN_PLIK", pin)
    assert guard.main([]) == 1
    (src / "modul/a.py").write_text(
        'K = {"unit_check_pl": "Zgodność jednostek: różnica mocy biernych.", '
        '"unit_check_latex": "\\\\mathrm{Mvar} - \\\\mathrm{Mvar} = \\\\mathrm{Mvar}"}\n',
        encoding="utf-8",
    )
    assert guard.main([]) == 0


def test_rejestry_jednostek_zywego_drzewa_niepuste() -> None:
    """Reguły 6 i 7 czytają klucze rejestrów żywego drzewa (pusty zbiór = rejestr przeniesiony
    albo przemianowany i każdy tekst rdzenia liczony — czerwień zamiast cichego zwolnienia)."""
    assert (
        len(
            guard.klucze_slownika(
                guard.SRC / guard.REJESTR_JEDNOSTEK_V126[0], guard.REJESTR_JEDNOSTEK_V126[1]
            )
        )
        == 5
    )
    assert (
        len(
            guard.klucze_slownika(
                guard.SRC / guard.REJESTR_JEDNOSTEK_NCRFG[0], guard.REJESTR_JEDNOSTEK_NCRFG[1]
            )
        )
        == 10
    )
