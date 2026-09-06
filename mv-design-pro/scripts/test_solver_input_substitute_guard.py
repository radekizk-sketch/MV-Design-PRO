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

import ast
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
    """Zbuduj sztuczne drzewo `backend/src` z kontraktem i podanymi plikami.

    Korzenie skanowania sa brane Z BRAMKI (`guard.SCAN_ROOTS`), a nie wypisane
    tutaj recznie. Do karty MOST-WEJSCIA-V126 byly wypisane — i dolozenie korzenia
    `enm` wywrocilo CZTERNASCIE testow naraz z powodu „korzen nie istnieje",
    zamiast sprawdzic to, co mialy sprawdzac. Osprzet testowy, ktory trzeba
    poprawiac przy kazdym rozszerzeniu zakresu, uczy ludzi obchodzic bramke.
    """
    root = tmp_path / "src"
    (root / "solver_input").mkdir(parents=True)
    (root / "solver_input" / "kontrakty.py").write_text(KONTRAKT, encoding="utf-8")
    for korzen in guard.SCAN_ROOTS:
        katalog = root / korzen
        katalog.mkdir(parents=True, exist_ok=True)
        (katalog / "__init__.py").write_text("", encoding="utf-8")
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
    wykluczenia: dict[str, dict[str, int]] | None = None,
) -> tuple[int, str]:
    root = _drzewo(tmp_path, pliki)
    monkeypatch.setattr(guard, "BACKEND_SRC", root)
    monkeypatch.setattr(guard, "CONTRACT_SOURCES", ("solver_input",))
    monkeypatch.setattr(guard, "ZASTANE_ZASTEPNIKI", zapadka or {})
    monkeypatch.setattr(guard, "WYKLUCZENIA_SKANERA", wykluczenia or {})
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


def test_forma_getattr_w_zlozeniu_or_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """TRZECIA DROGA do tej samej klasy (karta MOST-WEJSCIA-V126, 2026-08-08).

    `getattr(obiekt, "pole", None) or <liczba>` jest doslownie forma A, tylko
    zapisana innym zapisem ODCZYTU. Regula patrzyla wylacznie na `ast.Attribute`,
    wiec byla na to slepa Z KONSTRUKCJI — a piny mapy pilnowaly, czy pole jest
    ZNANE, nie czy odczyt jest ROZPOZNAWANY.

    POMIAR, KTORY TO WYMUSIL: w `solver_input/v126_contracts.py` — pliku, ktory
    docstring bramki nazywa „NAJGORSZA rodzina w calym zakresie" — zyly cztery
    takie zlozenia, w tym `getattr(rating, "in_a", None) or 300.0` i
    `getattr(branch, "r_ohm", None) or 0.001`. Bramka meldowala RC=0 „PASS".
    """
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "solver_input/most.py": (
                "def buduj(branch):\n"
                '    return float(getattr(branch, "load_mvar", None) or 300.0)\n'
            )
        },
    )
    assert kod == 1, wyjscie
    assert "A:or:branch.load_mvar" in wyjscie


def test_getattr_z_liczbowym_zapasem_liczy_sie_raz(tmp_path, monkeypatch, capsys) -> None:
    """PREDYKATY PARAMI: jedno miejsce w kodzie = jedna pozycja budzetu.

    Gdy `getattr` ma zapas LICZBOWY i stoi jeszcze w `or`, to nadal JEDNO
    podstawienie. Policzenie go dwa razy (raz jako forma C, raz jako forma A)
    rozdmuchaloby budzet o pozycje-widmo, ktorej nie da sie zdjac zadna naprawa —
    a budzet, ktorego nie da sie wyzerowac, uczy ludzi go ignorowac.
    """
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "solver_input/most.py": (
                "def buduj(branch):\n"
                '    return float(getattr(branch, "load_mvar", 0.0) or 300.0)\n'
            )
        },
    )
    assert kod == 1, wyjscie
    assert wyjscie.count("load_mvar") == 1, wyjscie
    assert "C:getattr:load_mvar" in wyjscie


def test_stala_modulu_nie_ukrywa_podstawienia(tmp_path, monkeypatch, capsys) -> None:
    """Nadanie liczbie NAZWY nie moze wygaszac reguly (karta MOST-WEJSCIA-V126).

    Bez tego kazdy zastepnik chowa sie jednym ruchem: `... or _DOMYSLNY_RX`.
    Wykryte na wlasnej skorze — karta sprowadzila zdublowany literal 0,1
    (stosunek R/X wg IEC 60909-0) do jednej stalej modulu i pozycja budzetu
    ZNIKNELA SAMA, bez zadnej zmiany zachowania kodu. Cicha zielen jest gorsza
    niz czerwien, bo nie da sie jej odroznic od naprawy.
    """
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "network_model/solvers/most.py": (
                "_DOMYSLNY_RX = 0.1\n\n\n"
                "def licz(source):\n"
                "    return source.load_mvar or _DOMYSLNY_RX\n"
            )
        },
    )
    assert kod == 1, wyjscie
    assert "A:or:source.load_mvar" in wyjscie


def test_stala_modulu_niebedaca_liczba_nie_jest_trafieniem(tmp_path, monkeypatch, capsys) -> None:
    """Kontrola dwustronna do testu wyzej — granica jest w LICZBIE, nie w NAZWIE.

    Stala modulu zwiazana z napisem albo z wyrazeniem pozostaje poza regula, tak
    samo jak literal napisowy. Bez tej pary „stala modulu gryzie" bylaby regula
    o nazwach, a nie o podstawianiu liczb.
    """
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "network_model/solvers/most.py": (
                '_SPOSOB = "izolowany"\n\n\n'
                "def licz(source):\n"
                "    return source.load_mvar or _SPOSOB\n"
            )
        },
    )
    assert kod == 0, wyjscie


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
# FORMY SLOWNIKOWE (D/F/G) — karta RATCHET-DICT-READ (2026-08-13)
# ---------------------------------------------------------------------------
#
# DLUG ZRODLOWY (rejestr, wiersz MOST-WEJSCIA-V126, odbior 2026-08-09): zapadka
# byla SLEPA na odczyt slownikowy (`x["pole"]`, `x.get("pole", DOMYSLNA)`) —
# 31 zywych wystapien tej formy w zakresie skanu, ZERO widocznych. Nadzorca
# ostrzegl WPROST: „NIE rozszerzam bramki odruchowo: dokladnie te forme
# proponowalem w rundzie QU-FABRYKACJA i wykonawca ja OBALIL POMIAREM — 73 z 79
# trafien bylo legalnymi slownikami parametrow, nie podstawieniami za brak
# danej". Testy nizej cwicza DYSKRYMINATOR (ten sam warunek „<pole> w fields",
# ktory juz odsiewa `model.parameters.get(...)` w formach A/B/C), nie slepa
# syntaktyke — kazda forma sparowana z obiema wartosciami cechy „klucz zadekla-
# rowany / klucz spoza kontraktu" (regula KLASA §2 — iloczyn cech, nie przyklad
# z karty).


def test_forma_d_subskrypcja_or_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """`slownik["pole"] or <liczba>` — forma D, wariant subskrypcja."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "network_model/solvers/dslownik.py": (
                "def licz(dane):\n" '    return dane["nominal_kv"] or 15.0\n'
            )
        },
    )
    assert kod == 1, wyjscie
    assert "D:dictor:dane.nominal_kv" in wyjscie


def test_forma_d_get_bez_zapasu_or_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """`slownik.get("pole") or <liczba>` — forma D, wariant `.get` 1-argumentowy."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "network_model/solvers/dget.py": (
                "def licz(dane):\n" '    return dane.get("load_mvar") or 0.35\n'
            )
        },
    )
    assert kod == 1, wyjscie
    assert "D:dictor:dane.load_mvar" in wyjscie


def test_forma_f_get_z_zapasem_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """`slownik.get("pole", <liczba>)` — forma F."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "network_model/solvers/fget.py": (
                "def licz(dane):\n" '    return float(dane.get("nominal_kv", 15.0))\n'
            )
        },
    )
    assert kod == 1, wyjscie
    assert "F:dictget:dane.nominal_kv" in wyjscie


def test_forma_g_ifexp_slownikowy_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """`... slownik["pole"] ... if <warunek> else <liczba>` — forma G."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "network_model/solvers/gifexp.py": (
                "def licz(dane):\n"
                '    return dane["load_mvar"] if "load_mvar" in dane else 0.35\n'
            )
        },
    )
    assert kod == 1, wyjscie
    assert "G:dictifexp:dane.load_mvar" in wyjscie


def test_dict_get_z_liczbowym_zapasem_liczy_sie_raz(tmp_path, monkeypatch, capsys) -> None:
    """PREDYKATY PARAMI (analogon testu formy C): jedno miejsce = jedna pozycja.

    `slownik.get("pole", <liczba>) or <liczba>` jest DOSLOWNIE forma F (2-argu-
    mentowe `.get`), a nie DODATKOWO forma D — inaczej budzet rozdmuchalby sie o
    pozycje-widmo, tak jak przy `getattr` (`test_getattr_z_liczbowym_zapasem_
    liczy_sie_raz` wyzej — ten sam wzorzec dedupu, druga forma odczytu).
    """
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "solver_input/dedup.py": (
                "def buduj(dane):\n" '    return dane.get("nominal_kv", 0.0) or 300.0\n'
            )
        },
    )
    assert kod == 1, wyjscie
    assert wyjscie.count("nominal_kv") == 1, wyjscie
    assert "F:dictget:dane.nominal_kv" in wyjscie


def test_odczyt_slownikowy_klucza_spoza_kontraktu_nie_jest_naruszeniem(
    tmp_path, monkeypatch, capsys
) -> None:
    """DYSKRYMINATOR, ILOCZYN CECH: forma D/F/G x klucz SPOZA `fields`.

    To jest DOKLADNIE forma, ktora poprzednia (OBALONA) proba karala slepo —
    73 z 79 trafien bylo tej klasy. `trv_tau_s` nie jest zadeklarowanym polem
    zadnej klasy w KONTRAKT — jest kluczem surowego worka parametrow
    projektowych (`model.parameters`), ktorego parytet z kontrolka UI pilnuje
    OSOBNY mechanizm (patrz `test_odczyt_slownika_parametrow_nie_jest_naruszeniem`
    dla form A/B/C — ten test jest jego odpowiednikiem dla D/F/G).
    """
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "network_model/solvers/worek.py": (
                "def licz(model):\n"
                '    a = model.parameters["trv_tau_s"] or 0.00018\n'
                '    b = model.parameters.get("trv_tau_s", 0.00018)\n'
                '    c = model.parameters.get("trv_tau_s") or 0.00018\n'
                "    return a + b + c\n"
            )
        },
    )
    assert kod == 0, wyjscie


def test_odczyt_slownikowy_z_galezia_none_nie_jest_naruszeniem(
    tmp_path, monkeypatch, capsys
) -> None:
    """Forma F, ale zapas jest `None` — uczciwy meldunek braku, nie liczba."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "network_model/solvers/dnone.py": (
                "def licz(dane):\n"
                '    return float(dane.get("nominal_kv")) if dane.get("nominal_kv", None) is not None else None\n'
            )
        },
    )
    assert kod == 0, wyjscie


def test_odczyt_slownikowy_z_galezia_nieliczbowa_nie_jest_naruszeniem(
    tmp_path, monkeypatch, capsys
) -> None:
    """Forma F, ale zapas jest napisem — nie wchodzi do arytmetyki fizyki."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "network_model/solvers/dnapis.py": (
                "def licz(dane):\n" '    return dane.get("nominal_kv", "brak")\n'
            )
        },
    )
    assert kod == 0, wyjscie


def test_klucz_zmienna_nie_jest_analizowalny(tmp_path, monkeypatch, capsys) -> None:
    """`slownik[zmienna]` — klucz NIE jest literalem string, wiec poza regula.

    Granica nr 6 modulu (skladnia nieanalizowalna) — to samo rozroznienie, co
    `eval`/`exec`: nie da sie ustalic, jakie pole faktycznie czyta wyrazenie.
    """
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "network_model/solvers/klucz_zmienna.py": (
                "def licz(dane, klucz):\n" "    return dane[klucz] or 15.0\n"
            )
        },
    )
    assert kod == 0, wyjscie


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
    istniejacy mechanizm — ta bramka go nie powtarza. Oba klucze ponizej (`trv_tau_s`,
    `hosting_monte_carlo_n`) sa CELOWO wybrane jako nazwy NIEKOLIDUJACE z polami
    fikstury `KONTRAKT` — patrz `test_odczyt_slownikowy_koliduje_gdy_klucz_pasuje_
    do_innego_pola` nizej, ktory dokumentuje ODWROTNY (kolizyjny) przypadek jako
    ZNANA granice tej formy, a nie milczaco pomijany szczegol.
    """
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "network_model/solvers/parametry.py": (
                "def licz(model):\n"
                '    a = model.parameters.get("trv_tau_s", 0.00018)\n'
                '    b = model.parameters.get("hosting_monte_carlo_n", 1000)\n'
                "    return a + b\n"
            )
        },
    )
    assert kod == 0, wyjscie


def test_odczyt_slownikowy_koliduje_gdy_klucz_pasuje_do_innego_pola(
    tmp_path, monkeypatch, capsys
) -> None:
    """GRANICA DYSKRYMINATORA D/F/G, NAZWANA I PRZYPIETA TESTEM (regula KLASA §4).

    Warunek „klucz w `fields`" jest rozroznieniem PO NAZWIE, nie po pochodzeniu
    obiektu — jesli klucz worka `model.parameters` NAZWANO tak samo, jak realne
    pole kontraktu GDZIE INDZIEJ (tu: `nominal_kv` z fikstury `KONTRAKT`), forma F
    ZAPALA CZERWIEN, mimo ze semantycznie to wciaz odczyt parametru projektowego.
    Pomiar na realnym drzewie (karta RATCHET-DICT-READ, 2026-08-13): TA kolizja
    nie wystapila w zadnym z 9 kluczy `model.parameters.get(...)` faktycznie
    czytanych w `v126_academic.py` — ale mechanizm jej NIE WYKLUCZA, wiec granica
    musi byc nazwana testem, a nie zalozeniem w komentarzu (precedens: kolizja
    `real`/`imag` w `stability_rms/contracts.py`, ta sama klasa co tutaj).
    """
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "network_model/solvers/kolizja.py": (
                "def licz(model):\n" '    return model.parameters.get("nominal_kv", 15.0)\n'
            )
        },
    )
    assert kod == 1, wyjscie
    assert "F:dictget:model.nominal_kv" in wyjscie


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
    assert "zapadka/wykluczenia wskazuja pliki, ktorych nie ma" in wyjscie


# ---------------------------------------------------------------------------
# WYKLUCZENIA SKANERA — karta GUARD-SUB (2026-09-05), §0.2. Mechanizm
# ODDZIELNY od zapadki dlugu: pozycja tu NIE jest fizycznym zastepnikiem —
# skaner zlapal OCZYWISTY falszywy alarm skladniowy (licznik/indeks, nie
# wielkosc fizyczna). Testy nizej cwicza DOKLADNIE te sama pare wlasciwosci,
# co zapadka dlugu (gryzie w obie strony, wymaga powodu, martwy wpis to
# blad) — bo mechanizm jest bit-w-bit tym samym ksztaltem, tylko inaczej
# nazwanym i inaczej raportowanym.
# ---------------------------------------------------------------------------


def test_wykluczenie_przepuszcza_zastany_budzet(tmp_path, monkeypatch, capsys) -> None:
    """Sygnatura w WYKLUCZENIA_SKANERA nie jest naruszeniem, gdy liczba sie zgadza."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "application/raport.py": (
                "def podsumowanie(dane):\n" '    return dane.get("nominal_kv", 0)\n'
            )
        },
        wykluczenia={"application/raport.py": {"F:dictget:dane.nominal_kv": 1}},
    )
    assert kod == 0, wyjscie


def test_nadwyzka_ponad_wykluczenie_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """NOWE wystapienie tej samej formy w PLIKU Z WYKLUCZENIEM zapala bramke.

    Wykluczenie NIE jest cicha, rosnaca zgoda (§0.5 ZAKAZY: „obnizanie
    czulosci skanera") — dziala jak zapadka dlugu, tylko z innym powodem.
    """
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "application/raport.py": (
                "def podsumowanie(dane):\n"
                '    a = dane.get("nominal_kv", 0)\n'
                '    b = dane.get("nominal_kv", 0)\n'
                "    return a + b\n"
            )
        },
        wykluczenia={"application/raport.py": {"F:dictget:dane.nominal_kv": 1}},
    )
    assert kod == 1, wyjscie
    assert "wykluczenie skanera" in wyjscie
    assert "budzet 1, znaleziono 2" in wyjscie


def test_niedobor_wobec_wykluczenia_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """Zapadka wykluczen dziala W OBIE STRONY — zniknięcie wzorca zada obnizenia."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {"application/naprawiony.py": "def f():\n    return 1.0\n"},
        wykluczenia={"application/naprawiony.py": {"F:dictget:dane.nominal_kv": 1}},
    )
    assert kod == 1, wyjscie
    assert "Wykluczenie ZMALALO" in wyjscie


def test_martwy_wpis_wykluczen_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """Wpis WYKLUCZENIA wskazujacy plik, ktorego nie ma, to tez martwy budzet."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {"application/istniejacy.py": "def f():\n    return 1.0\n"},
        wykluczenia={"application/zniknal.py": {"F:dictget:dane.nominal_kv": 1}},
    )
    assert kod == 1, wyjscie
    assert "zapadka/wykluczenia wskazuja pliki, ktorych nie ma" in wyjscie
    assert "WYKLUCZENIA_SKANERA" in wyjscie


def test_dlug_i_wykluczenie_razem_w_jednym_pliku_dzialaja_niezaleznie(
    tmp_path, monkeypatch, capsys
) -> None:
    """Jeden plik moze miec RAZEM dlug fizyczny i wykluczenie niefizyczne.

    Kazdy budzet dziala na WLASNYCH sygnaturach — dlug na `dane.load_mvar`,
    wykluczenie na `dane.nominal_kv` — bez wzajemnej ingerencji.
    """
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "application/mieszany.py": (
                "def f(dane):\n"
                '    fizyka = dane.get("load_mvar", 0.35)\n'
                '    licznik = dane.get("nominal_kv", 0)\n'
                "    return fizyka, licznik\n"
            )
        },
        zapadka={"application/mieszany.py": {"F:dictget:dane.load_mvar": 1}},
        wykluczenia={"application/mieszany.py": {"F:dictget:dane.nominal_kv": 1}},
    )
    assert kod == 0, wyjscie


def test_sygnatura_nieprzypisana_w_pliku_ze_znanym_budzetem_jest_naruszeniem(
    tmp_path, monkeypatch, capsys
) -> None:
    """Trzecia, NIEPRZYPISANA sygnatura w pliku z dlugiem i wykluczeniem nadal gryzie.

    Plik „znany" (ma choc jeden z dwoch budzetow) nie moze stac sie przez to
    bezpiecznym schronieniem dla KAZDEGO nowego podstawienia.
    """
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "application/mieszany.py": (
                "def f(dane):\n"
                '    fizyka = dane.get("load_mvar", 0.35)\n'
                '    licznik = dane.get("nominal_kv", 0)\n'
                '    nowa = dane.get("fault_level_mva", 25.0)\n'
                "    return fizyka, licznik, nowa\n"
            )
        },
        zapadka={"application/mieszany.py": {"F:dictget:dane.load_mvar": 1}},
        wykluczenia={"application/mieszany.py": {"F:dictget:dane.nominal_kv": 1}},
    )
    assert kod == 1, wyjscie
    assert "F:dictget:dane.fault_level_mva" in wyjscie
    assert "podstawienie liczby za nieobecna dana wejsciowa" in wyjscie


def test_wykluczenie_niesie_powod_przy_kazdym_pliku() -> None:
    """Analogon `test_zapadka_niesie_powod_przy_kazdym_pliku` dla wykluczen.

    Budzet bez powodow bylby cichym wykluczeniem w przebraniu jawnego
    rozstrzygniecia — dokladnie to, czego zakazuje §0.2 karty.
    """
    zrodlo = Path(guard.__file__).read_text(encoding="utf-8")
    blok = zrodlo.split("WYKLUCZENIA_SKANERA: dict[str, dict[str, int]] = {", 1)[1]
    blok = blok.split("\n}\n", 1)[0]
    assert guard.WYKLUCZENIA_SKANERA, "Budzet wykluczen pusty — parser albo lista do poprawy."
    for rel in guard.WYKLUCZENIA_SKANERA:
        przed = blok.split(f'"{rel}":', 1)[0]
        komentarz = [w for w in przed.splitlines() if w.strip().startswith("#")]
        assert komentarz, f"{rel}: wpis wykluczenia bez powodu merytorycznego"
        assert len("".join(komentarz)) > 60, f"{rel}: powod haslowy"


def test_kazdy_wpis_zapadki_lezy_pod_scan_roots() -> None:
    """Wpis zapadki NA PLIK spoza SCAN_ROOTS bylby martwym budzetem — nigdy
    nieporownanym, bo `check_file` jest wolywane WYLACZNIE dla plikow
    znalezionych przez `root.rglob(...)` startujac z korzeni skanowania.
    """
    for rel in guard.ZASTANE_ZASTEPNIKI:
        assert any(
            rel == korzen or rel.startswith(f"{korzen}/") for korzen in guard.SCAN_ROOTS
        ), f"{rel}: wpis zapadki lezy POZA SCAN_ROOTS — nigdy nie zostanie porownany."


def test_kazdy_wpis_wykluczen_lezy_pod_scan_roots() -> None:
    """Analogon powyzszego testu dla `WYKLUCZENIA_SKANERA`."""
    for rel in guard.WYKLUCZENIA_SKANERA:
        assert any(
            rel == korzen or rel.startswith(f"{korzen}/") for korzen in guard.SCAN_ROOTS
        ), f"{rel}: wpis wykluczenia lezy POZA SCAN_ROOTS — nigdy nie zostanie porownany."


def test_dlug_i_wykluczenie_sie_nie_pokrywaja() -> None:
    """Jedna sygnatura NIE MOZE byc jednoczesnie dlugiem fizycznym i wykluczeniem
    niefizycznym w TYM SAMYM pliku — dwie sprzeczne decyzje o tym samym
    miejscu w kodzie sa bledem konstrukcji rejestru, nie osobna klasyfikacja.
    """
    for rel, dlug_budzet in guard.ZASTANE_ZASTEPNIKI.items():
        wykl_budzet = guard.WYKLUCZENIA_SKANERA.get(rel)
        if wykl_budzet is None:
            continue
        wspolne = set(dlug_budzet) & set(wykl_budzet)
        assert (
            not wspolne
        ), f"{rel}: sygnatury {sorted(wspolne)} sa jednoczesnie dlugiem i wykluczeniem"


# ---------------------------------------------------------------------------
# PUSTKA JEST BLEDEM, NIE SUKCESEM
# ---------------------------------------------------------------------------


def test_brak_korzenia_skanowania_jest_bledem(tmp_path, monkeypatch, capsys) -> None:
    monkeypatch.setattr(guard, "BACKEND_SRC", tmp_path / "nie_ma_takiego")
    assert guard.main() == 1
    assert "brak korzenia skanowania" in capsys.readouterr().out


def test_brak_jednego_z_zakresow_jest_bledem(tmp_path, monkeypatch, capsys) -> None:
    """Zmiana ukladu katalogow nie moze po cichu wylaczyc czesci zakresu.

    Drzewo ma TYLKO `solver_input` — brakuje `network_model` (pierwszy korzen w
    `SCAN_ROOTS` po karcie GUARD-SUB), wiec to jego nazwa pojawia sie w komunikacie.
    """
    root = tmp_path / "src"
    (root / "solver_input").mkdir(parents=True)
    (root / "solver_input" / "kontrakty.py").write_text(KONTRAKT, encoding="utf-8")
    monkeypatch.setattr(guard, "BACKEND_SRC", root)
    monkeypatch.setattr(guard, "CONTRACT_SOURCES", ("solver_input",))
    monkeypatch.setattr(guard, "ZASTANE_ZASTEPNIKI", {})
    monkeypatch.setattr(guard, "WYKLUCZENIA_SKANERA", {})
    assert guard.main() == 1
    assert "korzen skanowania 'network_model' nie istnieje" in capsys.readouterr().out


def test_pusta_mapa_pol_kontraktu_jest_bledem(tmp_path, monkeypatch, capsys) -> None:
    """Bez zbioru pol regula milczalaby o WSZYSTKIM — to cicha dziura, nie zielen."""
    root = _drzewo(tmp_path, {"network_model/solvers/x.py": "def f():\n    return 1\n"})
    monkeypatch.setattr(guard, "BACKEND_SRC", root)
    monkeypatch.setattr(guard, "CONTRACT_SOURCES", ("katalog_ktorego_nie_ma",))
    monkeypatch.setattr(guard, "ZASTANE_ZASTEPNIKI", {})
    monkeypatch.setattr(guard, "WYKLUCZENIA_SKANERA", {})
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


def test_biezacy_stan_repozytorium_jest_zielony_i_przypiety_per_korzen(capsys) -> None:
    """Bramka na PRAWDZIWYM drzewie: RC=0, zero naruszen, sumy przypiete PER KORZEN.

    Historia tego testu (uczciwie): karta GUARD-SUB (2026-09-05) pinowala tu
    DOKLADNIE trzy naruszenia odsloniete przez FAB-H (`enm/canonical_analysis.py`
    `B:ifexp:wynik_q.q_mvar`, `enm/mapping.py` `A:or:wynik_q.q_mvar`,
    `solver_input/v126_contracts.py` `A:or:moc_bierna_wytworcy.q_mvar`), swiadomie
    NIE wpisane do zapadki, zeby budzet 1 nie zamaskowal naprawy oczekujacej
    u zrodla. Domkniecie FAB-H (`d58b949e`, `54cb5356`: Q nieznane = wklad
    POMINIETY, nie 0,0; brama SSCI 422) usunelo te sygnatury z drzewa, wiec pin
    trojki poszedl na czerwono zgodnie z zamierzeniem i zostal przepisany na stan
    faktyczny: brak naruszen.

    Stan po FAB-E (`27e8a44b`/`0d549d4a`, 2026-09-05): zapadka fizyczna 89 plikow /
    592 -> 61 / 320 (256 wpisow obnizonych do zera, 37 plikow bez dlugu), wykluczenia
    24 / 64 -> 15 / 46 (wzorce usuniete razem z podstawieniami); trzy nowe pliki w
    zakresie (`network_model/reporting/missing_value.py`, `application/trace_emitters/
    wynik.py`, `application/reference_networks/wymagane.py`).

    Stan po GUARD-SUB-2 (2026-09-05): forma H (nosnik lokalny — zmienna
    przypisana z odczytu pola, podstawienie liczby w NASTEPNEJ instrukcji tej
    samej funkcji) odslonila 30 zywych trafien w 12 plikach na realnym drzewie.
    KLASYFIKACJA per trafienie: 26 fizycznych (dzielenie przez wielkosc
    elektryczna/margines/kardynalnosc oslonione `> 0`/`is not None` — 5 NOWYCH
    plikow w zapadce + dopisane do 4 juz obecnych) i 4 niefizyczne (sort key
    strukturalnie obojetny na wynik, prog walidacji WARNING, wynik dopasowania
    wzorca — 3 NOWE pliki w wykluczeniach). Zapadka fizyczna 61/320 -> 66/346
    (+5 plikow/+26), wykluczenia 15/46 -> 18/50 (+3 plikow/+4). Zero napraw
    kodu produkcyjnego w tej karcie — zaden z 12 plikow nie jest jednym z trzech
    plikow rodziny odtwarzaczy wyniku rozplywu (`energy_validation/service.py`,
    `api/canonical_run_views.py`, `voltage_profile_view.py`), ktore po `98ad6b6a`
    juz nie mialy zadnego trafienia H (zweryfikowane pomiarem, nie zalozeniem).

    Sumy per korzen (nie tylko globalny RC) pilnuja, zeby cichy dryf w JEDNYM
    korzeniu nie schowal sie za poprawnym wynikiem calosciowym. Liczby to POMIAR
    z biezacego drzewa: kazda zmiana zbioru plikow w zakresie skanu (nowy modul,
    kasacja) ma tu swiadomie zaktualizowac pin razem z uzasadnieniem w commicie.
    """
    kod = guard.main()
    wyjscie = capsys.readouterr().out
    # 3653 pol / 601 plikow / enm 36 (CV-3.1 rdzen, 2026-09-05): nowy modul
    # `enm/scenariusze.py` (Nastawa 2 + Wstrzyk 6 + SondaKondensatora 8 = 16 pol
    # kontraktu scenariusza); dlug i wykluczenia bez zmian.
    # 3652 pol / 602 plikow / application 346 (CV-2-W, 2026-09-05): nowy modul
    # `application/study_case/status_wynikow.py` (+1 plik), pole `result_status`
    # przypadku skasowane z kontraktu aplikacji (-1 pole); dlug/wykluczenia bez zmian.
    # 3637 pol / 597 plikow / application 341 (CV-3.2 kasacja C4 + P24+, 2026-09-05):
    # `application/study_scenario/**` (5 plikow: __init__, models, orchestration,
    # repository, serializer) usuniete razem z 15 polami kontraktu scenariusza P23
    # (byt bez konsumenta produkcyjnego); dlug/wykluczenia bez zmian.
    # 3636 pol (FIX-ACTION-KASACJA, 2026-09-05): fantomowy identyfikator akcji
    # naprawczej usuniety z ladunku prezentacji nastaw (application) — -1 pole
    # kontraktu; pliki/dlug/wykluczenia bez zmian.
    # 3609 pol / 583 plikow / zapadka 65 plikow, suma 345 / application 328 / api 65
    # (CV-3.3-A, 2026-09-05): kasacja E3 (execution_engine 4 pliki), E2-widma
    # (unified_runs, unified_run_dispatch, analysis_dispatch 3 pliki) i martwych
    # podmodulow R2 (analysis_run 5 plikow) - 12 plikow produkcji poza skanem;
    # wpis zapadki results_inspector.py (1 podstawienie) zdjety razem z plikiem.
    # 3614 pol / 584 plikow / network_model 145 (FAB-J, 2026-09-05): nowy katalog
    # pakietow baterii BESS `network_model/catalog/mv_bess_battery_catalog.py`
    # (+1 plik) i kontrakt `BESSBatteryType` w `catalog/types.py` (chemistry,
    # capacity_kwh, nominal_voltage_dc_v, c_rate + metadane = +5 pol);
    # dlug/wykluczenia bez zmian.
    # 3608 pol / 582 plikow / application 326 (CV-3.3-A2, 2026-09-05): kasacja
    # klastra osieroconego po E3 — `application/result_mapping/
    # {load_flow_to_resultset_v1,protection_to_overlay_v1}.py` (-2 pliki,
    # -6 pol: `LoadFlowResultSetV1`/`LoadFlowNodeResult`/`LoadFlowBranchResult`/
    # `LoadFlowTotals`) i `domain/analysis_kind.py` (poza zakresem skanu);
    # `sc_binding_meta.py` + `*_to_resultset_v1.py` SC/Protection ZOSTAJA
    # (zamrozone przez `resultset_v1_schema_guard.PROTECTED_FILES`, B-01);
    # dlug/wykluczenia bez zmian.
    # 3599 pol / 576 plikow / application 320 / dlug 63 plikow suma 312 /
    # wykluczenia 17 plikow suma 49 (CV-3.3-B, 2026-09-05): porownania A/B
    # (rozplyw/zabezpieczenia/ogolne) przepiete na R1, R2 `AnalysisRunService`
    # + R3 `study_runs`/`study_results` skasowane procedura. -9 pol kontraktu:
    # spadek pomierzony (3608 -> 3599), przypisany klasom trwalosci R2/R3
    # skasowanym razem z torem (m.in. `PowerFlowComparison`/`ProtectionComparison`
    # — byty R3 z polami liczbowymi delt/statystyk, `ProtectionAnalysisRun` — R2),
    # bez recznego wypisania KAZDEGO pola z osobna (deklaracja bez testu tego
    # rozbicia bylaby falszywa pewnoscia — sam SPADEK jest zmierzony ponizej).
    # -6 plikow w zakresie skanu: `application/analysis_run/
    # service.py`, `application/protection_analysis/service.py` (oba skasowane
    # — martwy wpis zapadki zdjety: -1 plik/-27 sum i -1 plik/-1 sum), oraz
    # `application/active_case/**`+`application/lifecycle/**` (skasowane, poza
    # ZASTANE_ZASTEPNIKI — nie mialy wpisu). `application/power_flow_comparison/
    # service.py` PRZEPISANY na `ResultSetV1` (B1) — 4 pozycje dlugu zniklo razem
    # ze starym ksztaltem odczytu (`bus_a/bus_b.p_injected_mw/q_injected_mvar`,
    # -4 sum) i 1 pozycja wykluczenia (`result_summary.iterations`, -1 sum) —
    # zdjete z zapadki/wykluczen jako Dlug/Wykluczenie ZMALALO; pozostale 4
    # pozycje tego pliku (`summary_a/b.slack_p_mw`/`summary_a/b.total_losses_p_mw`)
    # ZOSTAJA — te same nazwy pol i te same liczby odczytow w przepisanym kodzie.
    # 3601 pol (FAB-K, 2026-09-05): +2 pola kontraktu = `battery_catalog_ref`
    # (wiazanie katalogowe BESS wpiete end-to-end, DER_BINDING_KEYS) oraz
    # `sn_connection_bus_ref` (punkt przylaczenia SN jako element modelu) w
    # `enm/domain_operations_v2.py` — pomiar roznicy zbiorow contract_fields()
    # wobec szczytu fd7cc0e5 (koordynator), nie wyliczenie z pamieci; pliki,
    # dlug i wykluczenia bez zmian.
    # 3609 pol / 577 plikow / enm 37 plikow, dlug 8 plikow suma 84 / zapadka
    # 64 plikow suma 312 (CV-4.1 na szczycie po FAB-K, 2026-09-05; 3601 + 8):
    # zlozenie wejscia rozplywu i
    # zwarcia wyciete 1:1 z `enm/canonical_analysis.py` do NOWEGO pliku
    # `enm/assembler.py` (+1 plik w zakresie skanu). +8 pol kontraktu =
    # nazwy pol dataclass wyniku assemblera (`WejscieRozplywu`/`WejscieZwarcia`),
    # ktorych nie bylo dotad w zadnym kontrakcie zadeklarowanym w skanowanej
    # warstwie (skaner czyta dataclassy warstwy jako kontrakt — pomiar roznicy
    # zbiorow wzgledem szczytu sprzed karty, nie wyliczenie z pamieci). Dlug:
    # 7 pozycji PRZENIESIONYCH z bloku `enm/canonical_analysis.py` do bloku
    # `enm/assembler.py` (suma per korzen `enm` bez zmian: 84; +1 plik dlugu,
    # bo ten sam dlug siedzi teraz w dwoch plikach zamiast jednego).
    # 3604 pol / 576 plikow / application 319 (CV-3.3-C na szczycie po CV-4.1,
    # 2026-09-05; 3609 - 5 pol, 577 - 1 plik): domena serii
    # przebiegow przeszla z `domain/batch_job.py` (skasowany) na `domain/run_batch.py`
    # (poza SCAN_ROOTS — `domain/` nie jest skanowanym korzeniem, wiec plik nie jest
    # zrodlem pol per constructione tej bramki tak czy inaczej niniejszym pinem;
    # CONTRACT_SOURCES aktualizowany osobno w guardzie). Stary `BatchJob` mial DZIESIEC
    # pol AnnAssign (`batch_id/study_case_id/analysis_type/scenario_ids/created_at/
    # status/batch_input_hash/run_ids/result_set_ids/errors`); piec z nich bylo
    # UNIKALNYCH w calym zbiorze CONTRACT_SOURCES (`batch_id`, `scenario_ids`,
    # `run_ids`, `result_set_ids`, `errors` — `study_case_id`/`analysis_type`/
    # `created_at`/`status`/`batch_input_hash` juz istnialy gdzie indziej, np.
    # `domain/fault_scenario.py::study_case_id`, wiec ich usuniecie nie zmienia sumy).
    # Nowy `RunBatch`/`RunBatchItem` NIE odtwarza tych piatki jako pol klasy: to samo
    # znaczenie zyje odtad w WYPROWADZONYCH wlasciwosciach (`@property scenario_ids/
    # run_ids/result_set_ids/errors`) — jedno zrodlo prawdy zamiast drugiej ksiegi
    # (docstring modulu), wiec skaner AST (ktory czyta WYLACZNIE `AnnAssign`, nie
    # `@property`) ich juz nie widzi — uczciwy spadek, nie luka pomiaru. Pozostale
    # nowe pola (`id/project_id/case_id/name/finished_at/envelope/items/analysis_type/
    # status/canonical_run_id/error_message/options_hash/position/options_hash`)
    # pokrywaja sie nazwami z polami juz obecnymi gdzie indziej w CONTRACT_SOURCES
    # (m.in. `enm.canonical_analysis.CanonicalRun.{case_id,finished_at,envelope,
    # status}`, `infrastructure/persistence/models.py` — liczne `id`/`project_id`/
    # `name`), wiec nie dokladaja zadnej NOWEJ unikalnej nazwy — arytmetyka
    # 3609 - 5 = 3604 (na szczycie po FAB-K i CV-4.1) zamyka sie bez reszty. Plik `results_workspace_projection.py`
    # (martwy, skasowany razem z domena) ubral 1 plik ze skanu `application`
    # (320 -> 319); dlug/wykluczenia bez zmian (nie mial wlasnego wpisu w zadnym).
    # 3597 pol / 575 plikow / application 318, dlug 36 plikow suma 115 (CV-4.2,
    # 2026-09-05; 3604 - 7 pol, 576 - 1 plik): kasacja kreatora P2/S4
    # (`build_power_flow_input`/`build_short_circuit_input` + wylacznych pomocnikow
    # `_select_slack_node_id`/`_lookup_node_attrs`/`_normalize_inverter_setpoints`/
    # `_resolve_inverter_q_mvar`/`_normalize_converter_setpoints`/`_resolve_converter_q_mvar`
    # w `application/network_wizard/service.py`, 0 wywolan produkcyjnych — pomiar,
    # nie zalozenie) i calego pliku P5 `application/power_flow_input_builder.py`
    # (DTO `ShortCircuitInput` skasowane z `network_wizard/dtos.py` — poza SCAN_ROOTS,
    # `enm`/`network_model`/`api` bez zmian pol). Dlug: `network_wizard/service.py`
    # traci 11 z 12 pozycji (zapadka zmalala do jednej — `node_data.base_kv`, INNA
    # funkcja `_upsert_node`/import CSV-JSON, poza zakresem karty); `power_flow_
    # input_builder.py` traci caly wpis (8 pozycji, plik skasowany). -1 plik w
    # zakresie skanu `application` (320 -> 319 juz po CV-3.3-C; teraz 319 -> 318).
    # Suma 137 -> 115 jest POMIAREM tego biegu (`--pomiar`), nie recznym
    # zsumowaniem usunietych pozycji — pin idzie z wyjscia guarda, jak wymaga
    # naglowek tej sekcji ("wyrocznia chodzi po tym samym zbiorze co kod").
    # 3598 pol / 575 plikow / zapadka 63 plikow suma 291 / enm 85 / application 318
    # (scalenie CV-4.2 + CV-4.1b na szczycie po CI-PARYTET-4, 2026-09-05): oba
    # bloki wyzej sumuja sie bez reszty — 3597 (CV-4.2) + 1 (`u_set_pu`, CV-4.1b)
    # = 3598; zapadka 290 + 1 (`A:or:node.active_power` 1 -> 2) = 291; enm 84 + 1
    # = 85; application po kasacji P5 318 / 36 / 115. Pin z wyjscia guarda na
    # scalonym drzewie, nie z arytmetyki (arytmetyka jest tu tylko kontrola).
    # 3610 pol / suma 313 (karta CV-4.1b, A3-04, 2026-09-05): +1 pole kontraktu =
    # `AddConverterSourcePayload.u_set_pu` (nastawa napiecia trybu regulacji
    # napiecia, `enm/domain_ops_models.py`) — pomiar roznicy zbiorow contract_fields()
    # wobec szczytu sprzed karty. +1 do zapadki `enm/assembler.py::A:or:node.active_power`
    # (1 -> 2): drugie wystapienie tej samej klasy (b) „brak wstrzykniecia = zero"
    # w petli PVSpec (mapping.py ustawia `active_power` bezwarunkowo dla wezlow
    # PQ i PV, wiec `or 0.0` jest tym samym mostem powtorzonym dla nowego typu
    # wezla) — pliki bez zmian (64), plik enm bez zmian (8), suma per korzen enm
    # 84 -> 85.
    # 3600 pol (FAB-L, 2026-09-05): `contract_fields()` jest ZBIOREM nazw (nie
    # suma per-klase), wiec -1 NIE jest -2+1: usuniecie `fault_current_data_ref`
    # z `api/generators.py::DerCatalogBindingsRequest` (jedyne wystapienie tej
    # nazwy w CONTRACT_SOURCES — pole DRUGIEJ fizyki, ktorej zaden solver nie
    # czytal, karta FAB-L) zmniejsza zbior o 1; dopisanie `bess_operation_mode_
    # refs` do TEGO SAMEGO modelu NIE zwieksza zbioru, bo ta nazwa juz istnieje
    # w `api/audit2_catalogs.py::DerAudit2Spec` i `api/audit2_station_config.py`
    # (oba w CONTRACT_SOURCES) — dodanie zbiega sie z istniejacym elementem
    # zbioru. Zapadka dlugu i wykluczenia bez zmian (pole nie bylo w zadnym z
    # dwoch zbiorow).
    # 3597 pol (scalenie FAB-L na szczycie po CV-4.2 + CV-4.1b, 2026-09-05): 3598
    # (scalenie wyzej) - 1 (`fault_current_data_ref`, FAB-L) = 3597; zapadka i
    # wykluczenia bez zmian wobec scalenia (pomiar guarda na scalonym drzewie).
    # 3606 pol / 576 plikow (CV-4.3 K3, 2026-09-05): nowe kontrakty WYJSCIOWE
    # topologii w `enm/topology.py` — dataclassy `Wyspa` (szyny, zrodla_sieciowe,
    # maszyny, generatory) i `TopologyView` (szyny, wezel_topologiczny, wyspy, sekcje,
    # laczniki_otwarte, galezie_otwarte, krawedzie_pominiete) wchodza do zbioru nazw
    # pol (10 nowych nazw, `szyny` liczone raz jako element zbioru) — to widoki
    # WYPROWADZANE z migawki, nie dane wejsciowe solvera, wiec zadne z nich nie jest
    # miejscem podstawienia; nowy plik `network_model/core/topologia.py` (jadro
    # algorytmow, zero pol kontraktow) wchodzi do zakresu skanu (+1 plik). Zapadka
    # dlugu i wykluczenia bez zmian (pomiar guarda na drzewie K3).
    assert "Pol kontraktow wejsciowych: 3606." in wyjscie, wyjscie
    assert (
        "Przeskanowano 576 plikow w zakresie: network_model, solver_input, enm, "
        "application, api." in wyjscie
    ), wyjscie
    assert "Zapadka dlugu (fizyczne): 63 plikow, suma 291." in wyjscie, wyjscie
    assert "Wykluczenia skanera (niefizyczne): 17 plikow, suma 49." in wyjscie, wyjscie
    per_korzen = [
        "  network_model: pliki_skanowane=146, dlug=14 plikow/suma 77, "
        "wykluczenia=4 plikow/suma 7",
        "  solver_input: pliki_skanowane=10, dlug=2 plikow/suma 8, " "wykluczenia=0 plikow/suma 0",
        "  enm: pliki_skanowane=37, dlug=8 plikow/suma 85, wykluczenia=0 plikow/suma 0",
        "  application: pliki_skanowane=318, dlug=36 plikow/suma 115, "
        "wykluczenia=7 plikow/suma 19",
        "  api: pliki_skanowane=65, dlug=3 plikow/suma 6, wykluczenia=6 plikow/suma 23",
    ]
    for linia in per_korzen:
        assert linia in wyjscie, f"Brak pinowanej sumy per korzen: {linia!r}\n{wyjscie}"

    # Sygnatury FAB-H nie wystepuja w drzewie — brak wpisu w zapadce jest pomiarem.
    for sygnatura in (
        "B:ifexp:wynik_q.q_mvar",
        "A:or:wynik_q.q_mvar",
        "A:or:moc_bierna_wytworcy.q_mvar",
    ):
        assert sygnatura not in wyjscie, f"Sygnatura FAB-H wrocila do drzewa: {sygnatura!r}"
    assert "naruszen." not in wyjscie, wyjscie
    assert "PASS: zadnego nowego podstawienia" in wyjscie, wyjscie
    assert kod == 0, wyjscie


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


# ---------------------------------------------------------------------------
# WYROCZNIA CHODZI PO TYM SAMYM ZBIORZE, CO KOD (runda 3)
# ---------------------------------------------------------------------------
#
# ZNALEZISKO, KTORE WYMUSILO TE SEKCJE. Mapa pol powstawala z dwoch korzeni
# (kontrakt V12.6 + model ENM), a klasyczne solvery czytaja model DOMENOWY
# z `network_model/core/**`. Pomiar: 54 pola `core` poza mapa, 165 ich odczytow
# w warstwie objetej skanem. Iniekcja `return gen.cos_phi or 0.95` dopisana do
# `power_flow_newton.py` — PLIKU W ZAKRESIE SKANU — dawala RC=0 „PASS".
# Bramka deklarowala zakres, ktorego jej wyrocznia nie obejmowala.


def test_iniekcja_cos_phi_w_modelu_domenowym_jest_naruszeniem(
    tmp_path, monkeypatch, capsys
) -> None:
    """Iniekcja nadzorcy z rundy 3, na modelu DOMENOWYM zamiast kontraktu V12.6.

    Przed dolozeniem `network_model/core` do `CONTRACT_SOURCES` ten przypadek
    dawal RC=0. Test stoi na sztucznym drzewie, wiec pilnuje SAMEJ REGULY, a nie
    biezacej zawartosci repozytorium.
    """
    root = tmp_path / "src"
    (root / "network_model" / "core").mkdir(parents=True)
    (root / "network_model" / "core" / "generator.py").write_text(
        "from dataclasses import dataclass\n\n\n"
        "@dataclass\n"
        "class Generator:\n"
        "    id: str\n"
        "    cos_phi: float | None = None\n",
        encoding="utf-8",
    )
    (root / "network_model" / "solvers").mkdir(parents=True)
    (root / "network_model" / "solvers" / "power_flow_newton.py").write_text(
        "def _iniekcja_nadzorcy(gen) -> float:\n    return gen.cos_phi or 0.95\n",
        encoding="utf-8",
    )
    (root / "solver_input").mkdir(parents=True)
    (root / "solver_input" / "kontrakty.py").write_text(KONTRAKT, encoding="utf-8")
    # Komplet korzeni skanowania — brany Z BRAMKI, nie wypisany tutaj (ta sama
    # zasada, co w `_drzewo`): rozszerzenie zakresu nie moze wywracac testu
    # regulacji na bledzie „korzen nie istnieje".
    for korzen in guard.SCAN_ROOTS:
        katalog = root / korzen
        katalog.mkdir(parents=True, exist_ok=True)
        (katalog / "__init__.py").write_text("", encoding="utf-8")

    monkeypatch.setattr(guard, "BACKEND_SRC", root)
    monkeypatch.setattr(guard, "ZASTANE_ZASTEPNIKI", {})
    monkeypatch.setattr(guard, "WYKLUCZENIA_SKANERA", {})
    monkeypatch.setattr(guard, "MODEL_ROOTS_POZA_MAPA", {})

    # Kontrola dwustronna: ze zbiorem pol BEZ modelu domenowego bramka MILCZY —
    # dokladnie tak, jak milczala przed naprawa. To dowodzi, ze test mierzy
    # zawartosc mapy, a nie cokolwiek innego.
    monkeypatch.setattr(guard, "CONTRACT_SOURCES", ("solver_input",))
    assert guard.main() == 0, "Kontrola dwustronna: bez `core` w mapie ma byc cicho."
    capsys.readouterr()

    monkeypatch.setattr(guard, "CONTRACT_SOURCES", ("solver_input", "network_model/core"))
    assert guard.main() == 1
    assert "A:or:gen.cos_phi" in capsys.readouterr().out


def test_kazdy_model_czytany_przez_zakres_jest_w_mapie() -> None:
    """KAZDY korzen modeli importowany przez zakres ma DECYZJE: w mapie albo poza nia.

    To jest pin na SAMEJ WYROCZNI, nie na jej wyniku. Bez niego nastepny solver
    napisany na NOWYM kontrakcie wypadlby poza zasieg reguly po cichu — dokladnie
    tak, jak klasyczne solvery na modelu domenowym wypadly przed runda 3.

    Wzorzec ten sam, co „prezentowane + nieprezentowane = komplet kontraktu":
    dwa zbiory ROZLACZNE, ktorych SUMA pokrywa komplet wyprowadzony z kodu.
    """
    korzenie = guard.model_roots_read_by_scope()
    assert korzenie, "Parser importow nie zobaczyl zadnego modelu — wyrocznia do poprawy."

    bez_decyzji = sorted(
        rel
        for rel in korzenie
        if not guard.is_covered_by_contract_sources(rel) and rel not in guard.MODEL_ROOTS_POZA_MAPA
    )
    assert bez_decyzji == [], (
        "Moduly-modele czytane przez warstwe objeta skanem, a nieujete w mapie pol: "
        f"{bez_decyzji}. Dopisz je do CONTRACT_SOURCES albo do MODEL_ROOTS_POZA_MAPA "
        "z powodem merytorycznym — bramka nie moze deklarowac zakresu, ktorego jej "
        "wyrocznia nie obejmuje."
    )


def test_wylaczenie_wygrywa_z_pokryciem_prefiksem() -> None:
    """Wykluczenie jest ODJECIEM od pokrycia i MUSI wygrywac z prefiksem korzenia.

    INTENCJA ZACHOWANA, KANON ZMIENIONY (runda 4). Pierwotnie test zadal, zeby
    zbiory byly ROZLACZNE: wykluczony modul nie mogl byc objety zadnym wpisem
    `CONTRACT_SOURCES`. Bylo to prawda, dopoki wykluczenie dzialalo „przez
    nieobecnosc". Po dolozeniu `network_model/solvers` jako CALOSCI wykluczony
    `stability_rms/contracts.py` LEZY pod pokrytym prefiksem — i tak ma byc:
    wykluczenie stalo sie jawnym odjeciem stosowanym w `contract_fields()`.
    Rozlacznosc nazw przestala byc wiec wlasciwym niezmiennikiem; wlasciwym jest
    SKUTECZNOSC odjecia, ktora pilnuje `test_wylaczenie_korzenia_dziala_takze_na_mape_pol`.

    Ten test trzyma druga polowe tej samej pary: wpis wykluczenia nie moze byc
    BEZPRZEDMIOTOWY. Modul spoza pokrycia i tak nie wnosilby pol, wiec wpis o nim
    udawalby rozstrzygniecie, ktorego nie ma — i ukrywalby fakt, ze prawdziwe
    zrodlo pol lezy gdzie indziej.
    """
    bezprzedmiotowe = sorted(
        rel for rel in guard.MODEL_ROOTS_POZA_MAPA if not guard.is_covered_by_contract_sources(rel)
    )
    assert bezprzedmiotowe == [], (
        f"Wpisy wykluczen bez skutku (modul i tak poza pokryciem): {bezprzedmiotowe}. "
        "Albo objeto go zrodlem pol i wykluczenie ma sens, albo zdejmij wpis."
    )


def test_kazde_wylaczenie_korzenia_niesie_powod_merytoryczny() -> None:
    """Wylaczenie korzenia to DECYZJA, wiec ma powod — „poza zakresem" nim nie jest."""
    for rel, powod in guard.MODEL_ROOTS_POZA_MAPA.items():
        assert len(powod) > 80, f"{rel}: powod wylaczenia pusty albo haslowy"
        assert "poza zakresem" not in powod.lower(), f"{rel}: odeslanie zamiast powodu"


def test_wylaczony_korzen_jest_realnie_czytany_przez_zakres() -> None:
    """Lista wylaczen nie zawiera pozycji martwych.

    Wpis wskazujacy modul, ktorego zakres juz nie importuje, to nieaktualne
    rozstrzygniecie udajace aktualne — rejestr moze tylko malec.
    """
    korzenie = set(guard.model_roots_read_by_scope())
    martwe = sorted(rel for rel in guard.MODEL_ROOTS_POZA_MAPA if rel not in korzenie)
    assert martwe == [], (
        f"Wylaczenia wskazujace moduly nieczytane juz przez zakres: {martwe} — "
        "zdejmij wpis z MODEL_ROOTS_POZA_MAPA."
    )


def test_model_domenowy_klasycznych_solverow_jest_w_mapie() -> None:
    """Pin na KONKRETNEJ luce rundy 3 — `network_model/core` nie moze wypasc z mapy.

    Ogolny pin wyzej pilnuje mechanizmu; ten pilnuje INSTANCJI, ktora kosztowala
    przepuszczona iniekcje. Oba sa potrzebne: gdyby ktos dopisal `core` do
    MODEL_ROOTS_POZA_MAPA z wiarygodnie brzmiacym powodem, ogolny pin przeszedlby.
    """
    assert guard.is_covered_by_contract_sources("network_model/core/node.py")
    pola = guard.contract_fields()
    for pole in ("cos_phi", "voltage_level", "voltage_magnitude", "voltage_angle", "un_kv"):
        assert pole in pola, f"Pole modelu domenowego '{pole}' wypadlo z mapy bramki."


# ---------------------------------------------------------------------------
# KONTRAKT ZADEKLAROWANY WEWNATRZ SKANOWANEJ WARSTWY (runda 4)
# ---------------------------------------------------------------------------
#
# ZNALEZISKO. `CONTRACT_SOURCES` to korzenie modeli, a pin mapy wyprowadza je
# z IMPORTOW warstwy objetej skanem. Kontrakt zadeklarowany WEWNATRZ tej warstwy
# nie jest przez nia importowany, wiec pin Z KONSTRUKCJI nie mogl zazadac o nim
# decyzji. Pomiar: 36 plikow warstwy deklaruje 976 pol, 675 nazw unikalnych,
# 314 poza mapa; zawezone do `*Input`/`*Options` z typem liczbowym — 28 pol.
# Iniekcja `wejscie.transformer_current_a or 250.0` dawala RC=0 „PASS".


def test_kontrakt_zadeklarowany_w_skanowanej_warstwie_jest_w_mapie(
    tmp_path, monkeypatch, capsys
) -> None:
    """Iniekcja nadzorcy z rundy 4: model zadeklarowany W TYM SAMYM pliku, co solver.

    Kontrola DWUSTRONNA: bez warstwy w zrodlach pol bramka MA milczec (tak bylo
    przed naprawa), z warstwa — gryzc. Inaczej test nie mierzylby zawartosci mapy.
    """
    root = tmp_path / "src"
    (root / "network_model" / "solvers").mkdir(parents=True)
    (root / "network_model" / "solvers" / "dobor.py").write_text(
        "from pydantic import BaseModel\n\n\n"
        "class CableSelectionInput(BaseModel):\n"
        "    transformer_current_a: float | None = None\n\n\n"
        "def licz(wejscie: CableSelectionInput) -> float:\n"
        "    return wejscie.transformer_current_a or 250.0\n",
        encoding="utf-8",
    )
    (root / "solver_input").mkdir(parents=True)
    (root / "solver_input" / "kontrakty.py").write_text(KONTRAKT, encoding="utf-8")
    # Komplet korzeni skanowania — brany Z BRAMKI, nie wypisany tutaj (ta sama
    # zasada, co w `_drzewo`): rozszerzenie zakresu nie moze wywracac testu
    # regulacji na bledzie „korzen nie istnieje".
    for korzen in guard.SCAN_ROOTS:
        katalog = root / korzen
        katalog.mkdir(parents=True, exist_ok=True)
        (katalog / "__init__.py").write_text("", encoding="utf-8")

    monkeypatch.setattr(guard, "BACKEND_SRC", root)
    monkeypatch.setattr(guard, "ZASTANE_ZASTEPNIKI", {})
    monkeypatch.setattr(guard, "WYKLUCZENIA_SKANERA", {})
    monkeypatch.setattr(guard, "MODEL_ROOTS_POZA_MAPA", {})
    monkeypatch.setattr(guard, "SCAN_ROOTS", ("network_model/solvers", "solver_input"))

    monkeypatch.setattr(guard, "CONTRACT_SOURCES", ("solver_input",))
    assert guard.main() == 0, "Kontrola dwustronna: bez warstwy w mapie ma byc cicho."
    capsys.readouterr()

    monkeypatch.setattr(guard, "CONTRACT_SOURCES", ("solver_input", "network_model/solvers"))
    assert guard.main() == 1
    assert "A:or:wejscie.transformer_current_a" in capsys.readouterr().out


def test_kazdy_skanowany_korzen_jest_zrodlem_pol() -> None:
    """INWARIANT ZAMYKAJACY KLASE: co skanujemy, to tez czytamy jako model.

    Pin mapy z rundy 3 pilnuje korzeni ZEWNETRZNYCH (wyprowadzonych z importow).
    Ten pilnuje WEWNETRZNYCH: kazdy korzen skanowania musi byc jednoczesnie
    zrodlem pol, inaczej kontrakt zadeklarowany w skanowanej warstwie jest dla
    bramki niewidzialny — dokladnie luka rundy 4. Oba piny razem zamykaja klase
    z obu stron, wiec nie da sie jej powtorzyc po raz czwarty.
    """
    niepokryte = sorted(
        root
        for root in guard.SCAN_ROOTS
        if not guard.is_covered_by_contract_sources(f"{root}/x.py")
    )
    assert niepokryte == [], (
        f"Korzenie skanowane, ale nieczytane jako zrodlo pol: {niepokryte}. "
        "Kontrakt zadeklarowany w takiej warstwie bylby dla bramki niewidzialny."
    )


def test_wylaczenie_korzenia_dziala_takze_na_mape_pol() -> None:
    """PREDYKATY PARAMI (regula KLASA §3) — jedno zrodlo prawdy dla wejscia i wyjscia.

    Do rundy 4 `MODEL_ROOTS_POZA_MAPA` bylo czytane WYLACZNIE przez pin mapy,
    a `contract_fields()` wykluczalo modul tylko „przez nieobecnosc" w
    `CONTRACT_SOURCES`. Dwa niezalezne warunki, ktore dzis sie zgadzaja: gdy
    runda 4 dolozyla `network_model/solvers` jako CALOSC, wykluczony
    `stability_rms/contracts.py` wrocil do mapy tylnymi drzwiami i przywrocil
    8 kolizji `real`/`imag`. Ten test pilnuje, ze wykluczenie znaczy to samo
    w obu miejscach.
    """
    wykluczone = set(guard.MODEL_ROOTS_POZA_MAPA)
    assert wykluczone, "Brak wykluczen — test bezprzedmiotowy, sprawdz konfiguracje."
    pola = guard.contract_fields()
    for rel in wykluczone:
        sciezka = guard.BACKEND_SRC / rel
        if not sciezka.is_file():
            continue
        wlasne = set()
        drzewo = ast.parse(sciezka.read_text(encoding="utf-8"))
        for node in ast.walk(drzewo):
            if isinstance(node, ast.ClassDef):
                for stmt in node.body:
                    if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name):
                        wlasne.add(stmt.target.id)
        # Pola WYLACZNIE tego modulu nie moga trafic do mapy przez zaden inny korzen.
        tylko_tam = {"real", "imag"} & wlasne
        assert tylko_tam, f"{rel}: modul nie deklaruje juz kolidujacych pol — zdejmij wpis."
        assert not (tylko_tam & pola), (
            f"{rel}: pola {sorted(tylko_tam & pola)} wrocily do mapy mimo wykluczenia — "
            "warunek wejscia i wyjscia ze zbioru rozjechal sie (regula KLASA §3)."
        )


def test_jawna_nie_liczba_nie_jest_podstawieniem() -> None:
    """`float("nan")` to MELDUNEK BRAKU w typie liczbowym, nie zmyslony pomiar.

    Rozroznienie jest strukturalne (argument `float` jest napisem nieliczbowym),
    nie lista wyjatkow: NaN nie moze udawac pomiaru, bo kazde dzialanie na nim
    daje NaN, a warstwa wiarygodnosci lapie to jako wynik niefizyczny.
    Zmierzone: bez tej reguly zapadka zamrozilaby 4 pozycje w
    `power_flow_oltc_studies.py`, gdzie podstawiona wartosc trafia WYLACZNIE
    do tekstu sladu.
    """
    assert guard.is_not_a_number_literal(ast.parse('float("nan")', mode="eval").body)
    assert not guard.is_numeric(ast.parse('float("nan")', mode="eval").body)
    # Kontrola dodatnia: konwersja REALNEJ danej nadal jest liczba.
    assert guard.is_numeric(ast.parse("float(base_p)", mode="eval").body)
    assert guard.is_numeric(ast.parse("float(250)", mode="eval").body)


def test_nieskonczonosc_nie_jest_meldunkiem_braku() -> None:
    """`float("inf")` JEST podstawieniem — dzielenie ja POCHLANIA.

    DLACZEGO TEN TEST ISTNIEJE (odbior rundy 4, 2026-08-08). Regula
    `is_not_a_number_literal` obejmowala pierwotnie takze nieskonczonosc, z
    uzasadnieniem wspolnym dla NaN: „kazde dzialanie na nich daje NaN/inf, a
    warstwa wiarygodnosci lapie to jako wynik niefizyczny". Zdanie jest prawdziwe
    dla NaN i FALSZYWE dla nieskonczonosci.

    POMIAR NADZORCY — iniekcja w `power_flow_newton.py` (plik w zakresie skanu):

        impedancja = gen.internal_impedance_pu or float("inf")
        return 1.0 / impedancja

    daje `0.0`, dla ktorego `math.isfinite` jest PRAWDA. Zero jako „impedancja
    wewnetrzna nieobecna" przechodzi przez `_finite` jak pomiar — czyli dokladnie
    ta klasa, ktora ta bramka zwalcza. Przy szerokiej regule bramka meldowala RC=0.

    Zawezenie kosztowalo ZERO nowych pozycji budzetu: zadne zywe
    `<pole kontraktu> or float("inf")` w zakresie nie istnieje (stan repo
    przypiety `test_biezacy_stan_repozytorium_ma_wylacznie_trzy_oczekujace_
    naruszenia_fab_h` — nazwa skorygowana karta GUARD-SUB 2026-09-05; ta
    dokumentacja odwolywala sie wczesniej do testu, ktory nigdy nie istnial
    pod tamta nazwa).
    """
    import math

    # Wlasnosc, na ktorej stoi rozroznienie — sprawdzana, nie zakladana.
    assert math.isnan(float("nan") / 2.0), "NaN musi propagowac przez dzialanie"
    assert math.isfinite(1.0 / float("inf")), "nieskonczonosc jest POCHLANIANA przez dzielenie"

    assert not guard.is_not_a_number_literal(ast.parse('float("inf")', mode="eval").body)
    assert guard.is_numeric(ast.parse('float("inf")', mode="eval").body)
    # Warianty zapisu tej samej wartosci — regula nie moze ich przepuscic.
    for zapis in ('float("inf")', 'float("-inf")', 'float("Infinity")', 'float("INF")'):
        assert guard.is_numeric(ast.parse(zapis, mode="eval").body), zapis
    # NaN w kazdym zapisie ZOSTAJE uczciwym meldunkiem braku (druga polowa pary).
    for zapis in ('float("nan")', 'float("NaN")', 'float(" nan ")'):
        assert not guard.is_numeric(ast.parse(zapis, mode="eval").body), zapis


# ---------------------------------------------------------------------------
# FORMA H — ZMIENNA LOKALNA JAKO NOSNIK POLA (karta GUARD-SUB-2, 2026-09-05)
# ---------------------------------------------------------------------------
#
# ZNALEZISKO, KTORE TO WYMUSILO (§0 karty): `iterations_raw = result_v1.get(
# "iterations_count")` ... `iterations = int(iterations_raw) if iterations_raw
# is not None else 0` w `application/analyses/energy_validation/service.py`
# PRZED naprawa `98ad6b6a`. Formy A-G patrza na POJEDYNCZY wezel skladni — ten
# defekt rozklada sie na DWA wezly w DWOCH instrukcjach, wiec byl dla nich
# niewidzialny z konstrukcji.
#
# ILOCZYN CECH (regula KLASA §2), nie przyklad z karty: (odczyt `.attr` ×
# `.get` × `[..]`) × (podstawienie `or` × `ifexp` × `int()/float()`
# opakowanie) — dziewiec testow ponizej pokrywa KAZDA z dziewieciu kombinacji
# (sprawdzalne grepem: kazda para odczyt/podstawienie ma WLASNY test, zaden
# nie jest pominiety). Do tego trzy testy NEGATYWNE z §0 pkt 2/5 karty:
# nadpisanie przed uzyciem, zasieg funkcyjny, pole spoza kontraktu — oraz
# jeden test regresyjny na FALSZYWY ALARM znaleziony i naprawiony w TEJ SAMEJ
# karcie (nosnik uzyty jako BAZA dalszej dereferencji nie dubluje formy B).


def test_forma_h_odczyt_atrybutu_i_lub_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """Odczyt `.attr` × podstawienie `or` — dokladnie przyklad `ia = aparat.ii_a
    ... margines = ik1_min_a / ia if ia > 0 else float("inf")` (`werdykt.py`),
    tu w najprostszej postaci `or`."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "network_model/solvers/jakosc_h1.py": (
                "def licz(model):\n"
                "    poziom = model.fault_level_mva\n"
                "    return poziom or 50.0\n"
            )
        },
    )
    assert kod == 1, wyjscie
    assert "H:local:model.fault_level_mva" in wyjscie, wyjscie


def test_forma_h_odczyt_atrybutu_i_wyrazenia_warunkowego_jest_naruszeniem(
    tmp_path, monkeypatch, capsys
) -> None:
    """Odczyt `.attr` × podstawienie `ifexp` bezposrednie (`x if x is not None
    else <liczba>`, jeden z trzech przykladow §0 karty wprost)."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "network_model/solvers/jakosc_h2.py": (
                "def licz(model):\n"
                "    poziom = model.fault_level_mva\n"
                "    return poziom if poziom is not None else 25.0\n"
            )
        },
    )
    assert kod == 1, wyjscie
    assert "H:local:model.fault_level_mva" in wyjscie, wyjscie


def test_forma_h_odczyt_atrybutu_i_opakowania_int_jest_naruszeniem(
    tmp_path, monkeypatch, capsys
) -> None:
    """Odczyt `.attr` × podstawienie `ifexp` z opakowaniem `int(x)` — drugi z
    trzech przykladow §0 karty wprost (`int(x) if x is not None else 0`)."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "network_model/solvers/jakosc_h3.py": (
                "def licz(model):\n"
                "    poziom = model.fault_level_mva\n"
                "    return int(poziom) if poziom is not None else 0\n"
            )
        },
    )
    assert kod == 1, wyjscie
    assert "H:local:model.fault_level_mva" in wyjscie, wyjscie


def test_forma_h_odczytu_dict_get_i_lub_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """Odczyt `.get("pole")` (BEZ zapasu — inaczej byloby juz forma F na tej
    samej linii) × podstawienie `or`."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "network_model/solvers/jakosc_h4.py": (
                "def licz(dane):\n"
                '    poziom = dane.get("fault_level_mva")\n'
                "    return poziom or 50.0\n"
            )
        },
    )
    assert kod == 1, wyjscie
    assert "H:local:dane.fault_level_mva" in wyjscie, wyjscie


def test_forma_h_odczytu_dict_get_i_wyrazenia_warunkowego_jest_naruszeniem(
    tmp_path, monkeypatch, capsys
) -> None:
    """Odczyt `.get("pole")` × podstawienie `ifexp` bezposrednie."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "network_model/solvers/jakosc_h5.py": (
                "def licz(dane):\n"
                '    poziom = dane.get("fault_level_mva")\n'
                "    return poziom if poziom is not None else 25.0\n"
            )
        },
    )
    assert kod == 1, wyjscie
    assert "H:local:dane.fault_level_mva" in wyjscie, wyjscie


def test_forma_h_odczytu_dict_get_i_opakowania_float_jest_naruszeniem(
    tmp_path, monkeypatch, capsys
) -> None:
    """Odczyt `.get("pole")` × podstawienie `ifexp` z opakowaniem `float(x)` —
    trzeci z trzech przykladow §0 karty wprost (`x if x is not None else
    0.0`, tu dodatkowo opakowany)."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "network_model/solvers/jakosc_h6.py": (
                "def licz(dane):\n"
                '    poziom = dane.get("fault_level_mva")\n'
                "    return float(poziom) if poziom is not None else 0.0\n"
            )
        },
    )
    assert kod == 1, wyjscie
    assert "H:local:dane.fault_level_mva" in wyjscie, wyjscie


def test_forma_h_odczytu_subskrypcji_i_lub_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """Odczyt `["pole"]` (subskrypcja, rodzina D/G) × podstawienie `or`."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "network_model/solvers/jakosc_h7.py": (
                "def licz(dane):\n"
                '    poziom = dane["fault_level_mva"]\n'
                "    return poziom or 50.0\n"
            )
        },
    )
    assert kod == 1, wyjscie
    assert "H:local:dane.fault_level_mva" in wyjscie, wyjscie


def test_forma_h_odczytu_subskrypcji_i_wyrazenia_warunkowego_jest_naruszeniem(
    tmp_path, monkeypatch, capsys
) -> None:
    """Odczyt `["pole"]` × podstawienie `ifexp` bezposrednie."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "network_model/solvers/jakosc_h8.py": (
                "def licz(dane):\n"
                '    poziom = dane["fault_level_mva"]\n'
                "    return poziom if poziom is not None else 25.0\n"
            )
        },
    )
    assert kod == 1, wyjscie
    assert "H:local:dane.fault_level_mva" in wyjscie, wyjscie


def test_forma_h_odczytu_subskrypcji_i_opakowania_jest_naruszeniem(
    tmp_path, monkeypatch, capsys
) -> None:
    """Odczyt `["pole"]` × podstawienie `ifexp` z opakowaniem `int(x)` —
    domyka iloczyn 3×3 (dziewiata i ostatnia kombinacja)."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "network_model/solvers/jakosc_h9.py": (
                "def licz(dane):\n"
                '    poziom = dane["fault_level_mva"]\n'
                "    return int(poziom) if poziom is not None else 0\n"
            )
        },
    )
    assert kod == 1, wyjscie
    assert "H:local:dane.fault_level_mva" in wyjscie, wyjscie


def test_forma_h_nadpisanie_przed_uzyciem_nie_jest_naruszeniem(
    tmp_path, monkeypatch, capsys
) -> None:
    """Nazwa NADPISANA inna wartoscia PRZED uzyciem kasuje status nosnika (§0
    pkt 2 karty: „ponowne przypisanie innej wartosci kasuje status nosnika").

    Bez tego kazdy PRAWDZIWY refaktoring zmiennej lokalnej (przypisanie jej
    STALEJ konfiguracyjnej po odczycie pola przy wczesnym `return`/walidacji)
    zapalalby bramke na kodzie, ktory juz nie czyta pola w tym miejscu.
    """
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "network_model/solvers/jakosc_h10.py": (
                "def licz(model):\n"
                "    poziom = model.fault_level_mva\n"
                "    poziom = 5.0\n"
                "    return poziom or 10.0\n"
            )
        },
    )
    assert kod == 0, wyjscie
    assert "H:local:" not in wyjscie, wyjscie


def test_forma_h_nosnik_z_innej_funkcji_nie_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """ZASIEG FUNKCYJNY (§0 pkt 2): nosnik ustanowiony w JEDNEJ funkcji nie
    przenika do INNEJ funkcji o tej samej nazwie zmiennej lokalnej — druga
    funkcja czyta `poziom` jako PARAMETR (nigdy nie odczytany z pola w JEJ
    WLASNYM ciele), wiec nie jest nosnikiem w TYM zasiegu."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "network_model/solvers/jakosc_h11.py": (
                "def buduj(model):\n"
                "    poziom = model.fault_level_mva\n"
                "    return poziom\n"
                "\n"
                "\n"
                "def inny(poziom):\n"
                "    return poziom or 10.0\n"
            )
        },
    )
    assert kod == 0, wyjscie
    assert "H:local:" not in wyjscie, wyjscie


def test_forma_h_pole_spoza_kontraktu_nie_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """Pole NIEZADEKLAROWANE w kontrakcie (nie ma go w `KONTRAKT` — analogon
    `model.parameters.get(...)` z formy A/D) nie ustanawia nosnika, wiec
    pozniejsze `or <liczba>` na tej nazwie NIE jest trafieniem."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "network_model/solvers/jakosc_h12.py": (
                "def licz(model):\n"
                "    wartosc = model.jakies_pole_spoza_kontraktu\n"
                "    return wartosc or 10.0\n"
            )
        },
    )
    assert kod == 0, wyjscie
    assert "H:local:" not in wyjscie, wyjscie


def test_forma_h_nosnik_jako_baza_dereferencji_nie_dubluje_formy_b(
    tmp_path, monkeypatch, capsys
) -> None:
    """REGRESJA na falszywy alarm znaleziony I NAPRAWIONY w tej samej karcie
    (iniekcja nadzorcy: `th = data.thermal` ... `th.i2t_a2s if th.i2t_a2s is
    not None else 0.0` w `lv_circuit_verification.py` melodowalo BLEDNIE
    `H:local:data.thermal`, zamiast poprawnego, JUZ ISTNIEJACEGO
    `B:ifexp:th.i2t_a2s`).

    Nosnik uzyty jako BAZA dalszej dereferencji (`stan.load_mvar`) to odczyt
    INNEGO pola (`load_mvar`, ktore ma WLASNE poprawne wykrycie w formie B),
    nie uzycie WARTOSCI nosnika — forma H nie moze tego dublowac pod ZLA
    nazwa pola.
    """
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "network_model/solvers/jakosc_h13.py": (
                "def diagnostyka(model):\n"
                "    stan = model.fault_level_mva\n"
                "    return stan.load_mvar if stan.load_mvar is not None else 50.0\n"
            )
        },
    )
    assert kod == 1, wyjscie
    assert "B:ifexp:stan.load_mvar" in wyjscie, wyjscie
    assert "H:local:model.fault_level_mva" not in wyjscie, wyjscie
