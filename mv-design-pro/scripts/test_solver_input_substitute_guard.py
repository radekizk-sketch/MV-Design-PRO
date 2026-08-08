"""Testy bramki `solver_input_substitute_guard` (karta QU-FABRYKACJA, runda poprawkowa).

INTENCJA. Naprawa karty QU-FABRYKACJA usunela siedem stalych podstawianych za dane
wejsciowe, ale byla INWENTARZOWA, a nie zabezpieczona: iniekcja nadzorcy dopisala
NOWY zastepnik w sasiedniej funkcji tego samego pliku
(`_power_quality`: `harmonic = f_hz / (model.base_frequency_hz or 50.0)`)
i przeszla 26 z 26 testow nowego pliku karty oraz 114 testow rodziny V12.6.
Ta bramka zamyka klase; te testy pilnuja, ze bramka faktycznie ja zamyka.

Testy sprawdzaja trzy rzeczy naraz — tak jak testy bramki, ktorej wzorzec reuzywamy
(`test_no_direct_fault_params_guard.py`):
  * bramka GRYZIE we wszystkich trzech formach (`or`, wyrazenie warunkowe, `getattr`),
    zarowno w pliku z zapadki, jak i poza nia;
  * bramka NIE gryzie tam, gdzie trafienie byloby falszywe (galaz `None` = uczciwy
    meldunek braku, odczyt slownika parametrow, napis, wartosc logiczna, pominiecie
    elementu instrukcja `continue`) — inaczej budzet zamrozilby poprawne konstrukcje
    i nauczylby ludzi ignorowac bramke;
  * PUSTY SKAN i PUSTA MAPA POL to RC=1, nigdy RC=0.

Kod wyjscia odbierany zawsze bezposrednio (`main()`), nigdy przez potok.
"""

from __future__ import annotations

from pathlib import Path

import solver_input_substitute_guard as guard

#: Model wejsciowy drzewa testowego. Zbior pol jest CZYTANY Z KODU, wiec bez tego
#: pliku cala regula nie ma na czym stanac (i bramka musi to powiedzieć wprost).
KONTRAKT = """\
from pydantic import BaseModel


class SzynaWejsciowa(BaseModel):
    ref: str
    nominal_kv: float
    fault_level_mva: float | None = None
    load_mvar: float = 0.0
"""


def _drzewo(tmp_path: Path, pliki: dict[str, str]) -> Path:
    """Zbuduj sztuczne drzewo `backend/src` z kontraktem i podanymi plikami."""
    root = tmp_path / "src"
    (root / "solver_input").mkdir(parents=True)
    (root / "solver_input" / "kontrakty.py").write_text(KONTRAKT, encoding="utf-8")
    (root / "network_model" / "solvers").mkdir(parents=True)
    (root / "network_model" / "solvers" / "__init__.py").write_text("", encoding="utf-8")
    for rel, tresc in pliki.items():
        sciezka = root / rel
        sciezka.parent.mkdir(parents=True, exist_ok=True)
        sciezka.write_text(tresc, encoding="utf-8")
    return root


def _uruchom(
    tmp_path,
    monkeypatch,
    capsys,
    pliki: dict[str, str],
    zapadka: dict[str, dict[str, int]] | None = None,
) -> tuple[int, str]:
    root = _drzewo(tmp_path, pliki)
    monkeypatch.setattr(guard, "BACKEND_SRC", root)
    monkeypatch.setattr(guard, "CONTRACT_SOURCES", ("solver_input",))
    monkeypatch.setattr(guard, "ZASTANE_ZASTEPNIKI", zapadka or {})
    kod = guard.main()
    return kod, capsys.readouterr().out


# ---------------------------------------------------------------------------
# BRAMKA GRYZIE — trzy formy podstawienia
# ---------------------------------------------------------------------------


def test_forma_or_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """Dokladnie iniekcja nadzorcy: `<pole> or <liczba>`.

    To jest test, ktorego brak sprawil, ze naprawa karty byla inwentarzowa.
    """
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "network_model/solvers/jakosc.py": (
                "def licz(model, f_hz):\n" "    return f_hz / (model.fault_level_mva or 50.0)\n"
            )
        },
    )
    assert kod == 1, wyjscie
    assert "A:or:model.fault_level_mva" in wyjscie


def test_forma_wyrazenia_warunkowego_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "network_model/solvers/moc.py": (
                "def licz(bus):\n"
                "    return bus.load_mvar if bus.load_mvar is not None else 0.35\n"
            )
        },
    )
    assert kod == 1, wyjscie
    assert "B:ifexp:bus.load_mvar" in wyjscie


def test_forma_getattr_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "network_model/solvers/most.py": (
                "def licz(branch):\n" '    return float(getattr(branch, "nominal_kv", 15.0))\n'
            )
        },
    )
    assert kod == 1, wyjscie
    assert "C:getattr:nominal_kv" in wyjscie


def test_most_wejsc_jest_w_zakresie(tmp_path, monkeypatch, capsys) -> None:
    """Zastepnik wstrzyknięty PO DRODZE do solvera jest w skutku identyczny.

    Solver nie ma jak odroznic go od pomiaru, wiec `solver_input/**` jest w zakresie
    skanu na rowni z warstwa solverow.
    """
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {"solver_input/most.py": ("def buduj(branch):\n    return branch.nominal_kv or 15.0\n")},
    )
    assert kod == 1, wyjscie
    assert "solver_input/most.py" in wyjscie


# ---------------------------------------------------------------------------
# BRAMKA NIE GRYZIE — formy UCZCIWE i niefizyczne
# ---------------------------------------------------------------------------


def test_galaz_none_nie_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """`... else None` to WLASNIE uczciwy meldunek braku — nie wolno go karac.

    Bez tej granicy budzet zamrozilby poprawne konstrukcje: pomiar na realnym
    drzewie dal 40 trafien, z czego 26 bylo tej klasy.
    """
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "network_model/solvers/uczciwy.py": (
                "def licz(bus):\n"
                "    return float(bus.fault_level_mva) if bus.fault_level_mva is not None else None\n"
            )
        },
    )
    assert kod == 0, wyjscie


def test_pominiecie_elementu_nie_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """Wzorzec z `_grid_source_shunt_admittance` — dana nieobecna, wezel pominiety."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "network_model/solvers/pomijajacy.py": (
                "def licz(model):\n"
                "    for bus in model.buses:\n"
                "        if not bus.fault_level_mva:\n"
                "            continue\n"
                "        yield 1.0 / bus.fault_level_mva\n"
            )
        },
    )
    assert kod == 0, wyjscie


def test_odczyt_slownika_parametrow_nie_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """Parametr projektowy z kontrolka w oknie dociera slownikiem, nie polem kontraktu.

    Rozroznienie jest STRUKTURALNE (klucz slownika nie jest zadeklarowanym polem),
    a nie zapisane w komentarzu. Parytet parametrow z kontrolkami pilnuje osobny,
    istniejacy mechanizm — ta bramka go nie powtarza.
    """
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "network_model/solvers/parametry.py": (
                "def licz(model):\n"
                '    a = model.parameters.get("trv_tau_s", 0.00018)\n'
                '    b = model.parameters.get("nominal_kv", 15.0)\n'
                "    return a + b\n"
            )
        },
    )
    assert kod == 0, wyjscie


def test_galaz_nieliczbowa_nie_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """Napis i wartosc logiczna nie wchodza do arytmetyki fizyki."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "network_model/solvers/opisowy.py": (
                "def licz(bus, item):\n"
                '    nazwa = bus.ref or "bez nazwy"\n'
                "    flaga = item.load_mvar if item is not None else False\n"
                "    return nazwa, flaga\n"
            )
        },
    )
    assert kod == 0, wyjscie


def test_galaz_zapasowa_z_realnej_danej_nie_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """Gdy galaz zapasowa LICZY z innej danej rzeczywistej, to nie jest zmyslenie.

    Wzorzec z `_insulation`: `mcov` wyprowadzone z `u_m_kv`, wiec wynik nadal stoi
    na pomiarze. Kara za to byloby zamrozeniem poprawnego przeliczenia.

    UWAGA NA TEST PRZECHODZACY Z INNEGO POWODU. Galaz `else item.nominal_kv` (samo
    pole) przechodzi juz przez kontrole LICZBOWOSCI, wiec nie cwiczylaby wcale
    reguly „galaz czyta dana rzeczywista". Dlatego galaz jest tu DZIALANIEM
    (`item.nominal_kv * 1.05`): `is_numeric` mowi TAK, a odrzuca ja dopiero
    warunek, ktory ten test opisuje. Sprawdzone dwustronnie asercja ponizej.
    """
    galaz = "item.nominal_kv * 1.05"
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "network_model/solvers/przeliczenie.py": (
                "def licz(item):\n"
                f"    return item.load_mvar if item.load_mvar is not None else {galaz}\n"
            )
        },
    )
    assert kod == 0, wyjscie
    # Kontrola, ze test cwiczy WLASCIWA regule: galaz jest liczbowa, wiec o zieleni
    # rozstrzyga wylacznie to, ze czyta pole kontraktu.
    import ast

    wyrazenie = ast.parse(galaz, mode="eval").body
    assert guard.is_numeric(wyrazenie), "galaz nie jest liczbowa — test cwiczy inna regule"
    assert guard.nested_contract_field(wyrazenie, {"nominal_kv"}) == "item.nominal_kv"


# ---------------------------------------------------------------------------
# ZAPADKA — w OBIE strony
# ---------------------------------------------------------------------------


def test_zapadka_przepuszcza_zastany_budzet(tmp_path, monkeypatch, capsys) -> None:
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "network_model/solvers/zastany.py": (
                "def licz(model):\n    return model.fault_level_mva or 25.0\n"
            )
        },
        zapadka={"network_model/solvers/zastany.py": {"A:or:model.fault_level_mva": 1}},
    )
    assert kod == 0, wyjscie


def test_nadwyzka_ponad_budzet_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """NOWY zastepnik w pliku Z ZAPADKI zapala bramke tak samo jak poza nia.

    To jest mechanizm, ktorego brak pozwalal zapadce cicho rosnac w bramce
    wzorcowej (audyt 2026-08-01, defekt H).
    """
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "network_model/solvers/zastany.py": (
                "def licz(model, bus):\n"
                "    a = model.fault_level_mva or 25.0\n"
                "    b = bus.fault_level_mva or 30.0\n"
                "    return a + b\n"
            )
        },
        zapadka={"network_model/solvers/zastany.py": {"A:or:model.fault_level_mva": 1}},
    )
    assert kod == 1, wyjscie
    assert "budzet 0, znaleziono 1" in wyjscie
    assert "A:or:bus.fault_level_mva" in wyjscie


def test_niedobor_wobec_budzetu_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """Zapadka dziala W OBIE STRONY — inaczej poprawa nie zostaje utrwalona.

    Sprawdzone na sobie przy pisaniu karty: budzet ustawiony „na oko" o jeden za
    wysoko dal RC=1 z zadaniem obnizenia, i to bramka wymusila pomiar.
    """
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {"network_model/solvers/naprawiony.py": "def licz(model):\n    return 1.0\n"},
        zapadka={"network_model/solvers/naprawiony.py": {"A:or:model.fault_level_mva": 1}},
    )
    assert kod == 1, wyjscie
    assert "Dlug ZMALAL" in wyjscie


def test_martwy_wpis_zapadki_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """Wpis wskazujacy plik, ktorego nie ma, to martwy budzet — rejestr moze tylko malec."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {"network_model/solvers/istniejacy.py": "def licz():\n    return 1.0\n"},
        zapadka={"network_model/solvers/zniknal.py": {"A:or:x.nominal_kv": 1}},
    )
    assert kod == 1, wyjscie
    assert "zapadka wskazuje pliki, ktorych nie ma" in wyjscie


# ---------------------------------------------------------------------------
# PUSTKA JEST BLEDEM, NIE SUKCESEM
# ---------------------------------------------------------------------------


def test_brak_korzenia_skanowania_jest_bledem(tmp_path, monkeypatch, capsys) -> None:
    monkeypatch.setattr(guard, "BACKEND_SRC", tmp_path / "nie_ma_takiego")
    assert guard.main() == 1
    assert "brak korzenia skanowania" in capsys.readouterr().out


def test_brak_jednego_z_zakresow_jest_bledem(tmp_path, monkeypatch, capsys) -> None:
    """Zmiana ukladu katalogow nie moze po cichu wylaczyc czesci zakresu."""
    root = tmp_path / "src"
    (root / "solver_input").mkdir(parents=True)
    (root / "solver_input" / "kontrakty.py").write_text(KONTRAKT, encoding="utf-8")
    monkeypatch.setattr(guard, "BACKEND_SRC", root)
    monkeypatch.setattr(guard, "CONTRACT_SOURCES", ("solver_input",))
    monkeypatch.setattr(guard, "ZASTANE_ZASTEPNIKI", {})
    assert guard.main() == 1
    assert "korzen skanowania 'network_model/solvers' nie istnieje" in capsys.readouterr().out


def test_pusta_mapa_pol_kontraktu_jest_bledem(tmp_path, monkeypatch, capsys) -> None:
    """Bez zbioru pol regula milczalaby o WSZYSTKIM — to cicha dziura, nie zielen."""
    root = _drzewo(tmp_path, {"network_model/solvers/x.py": "def f():\n    return 1\n"})
    monkeypatch.setattr(guard, "BACKEND_SRC", root)
    monkeypatch.setattr(guard, "CONTRACT_SOURCES", ("katalog_ktorego_nie_ma",))
    monkeypatch.setattr(guard, "ZASTANE_ZASTEPNIKI", {})
    assert guard.main() == 1
    assert "zbior pol kontraktow wejsciowych jest PUSTY" in capsys.readouterr().out


def test_czysty_zakres_daje_zielen(tmp_path, monkeypatch, capsys) -> None:
    """Kontrola dodatnia: bramka NIE jest zawsze czerwona."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {"network_model/solvers/czysty.py": "def licz(bus):\n    return bus.nominal_kv * 2.0\n"},
    )
    assert kod == 0, wyjscie
    assert "PASS" in wyjscie


# ---------------------------------------------------------------------------
# STAN RZECZYWISTEGO REPOZYTORIUM
# ---------------------------------------------------------------------------


def test_biezacy_stan_repozytorium_jest_zielony() -> None:
    """Bramka na PRAWDZIWYM drzewie — budzet odpowiada pomiarowi, nie zyczeniu."""
    assert guard.main() == 0


def test_zapadka_niesie_powod_przy_kazdym_pliku() -> None:
    """Deklaracja „kazdy wpis ma POWOD" MA PRZYPIETY TEST.

    Budzet bez powodow osunalby sie do listy sciezek, czyli do cichego wykluczenia
    w przebraniu jawnego rozstrzygniecia.
    """
    zrodlo = Path(guard.__file__).read_text(encoding="utf-8")
    blok = zrodlo.split("ZASTANE_ZASTEPNIKI: dict[str, dict[str, int]] = {", 1)[1]
    blok = blok.split("\n}\n", 1)[0]
    assert guard.ZASTANE_ZASTEPNIKI, "Budzet pusty — parser albo zapadka do poprawy."
    for rel in guard.ZASTANE_ZASTEPNIKI:
        przed = blok.split(f'"{rel}":', 1)[0]
        komentarz = [w for w in przed.splitlines() if w.strip().startswith("#")]
        assert komentarz, f"{rel}: wpis zapadki bez powodu merytorycznego"
        assert len("".join(komentarz)) > 60, f"{rel}: powod haslowy"
