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
    # 3610 pol / 577 plikow (CV-4.3 K3b, 2026-09-06): kontrakty ZLOZENIA assemblera
    # rozszerzone o rozplyw per wyspa — `WyspaRozplywu` (slack_node_id, zrodlo_ref,
    # szyny, wezly, pf_input), `WejscieRozplywu.wyspy/pq_specs/pv_specs`,
    # `WejscieZwarcia.wezly_bez_odniesienia` (4 nowe nazwy w zbiorze; reszta juz
    # liczona) — to wyjscia zlozenia z migawki, nie miejsca podstawienia; nowy plik
    # `enm/rozplyw_wysp.py` (scalanie rozwiazan wysp, zero pol kontraktow) wchodzi do
    # zakresu skanu (+1 plik w korzeniu enm). Zapadka dlugu i wykluczenia bez zmian.
    # CV-4.3 K4 (karta CV-4.3-A3): nowy podpakiet `network_model/pochodne/`
    # (`__init__.py` + `wielkosci_pochodne.py`, czyste funkcje bez kontraktow
    # solvera — zero pol kontraktow, zero podstawien) wchodzi do zakresu skanu
    # (+2 pliki w korzeniu `network_model`, bo `solver_input_substitute_guard`
    # skanuje CALE `network_model/**` bez wzgledu na podkatalog — w
    # odroznieniu od `backend_no_physics_guard`, ktory wyklucza konkretnie
    # `network_model/solvers/**` i `network_model/pochodne/**`). Pakiet lezy
    # SIOSTRZANO wobec `network_model/solvers/` (relokacja architekta
    # 2026-09-06, nie zagniezdzony pod `solvers/` — patrz docstring
    # `wielkosci_pochodne.py`), ale ten guard nie rozroznia podkatalogow
    # `network_model/**`, wiec liczba plikow w korzeniu `network_model` jest
    # identyczna niezaleznie od tego, czy `pochodne/` lezy pod `solvers/` czy
    # obok niego — zmierzone na drzewie PO relokacji, nie przed. Zapadka
    # dlugu i wykluczenia bez zmian (pomiar guarda na drzewie po K4).
    # Scalenie K3b + K4 (odbior Fable, 2026-09-06): 3610 pol (K3b) / 579 plikow
    # (577 po K3b + 2 pliki `network_model/pochodne/` z K4).
    # CV-4.3 K6 (Fable, 2026-09-06): +1 pole kontraktu zlozenia —
    # `WejscieZwarcia.zrodla_sieciowe_trace` (slad WHITE BOX wyprowadzenia Z_Q
    # zrodla sieciowego z c, IEC 60909-0:2016 eq. 6; wyjscie zlozenia z migawki,
    # nie miejsce podstawienia). Pliki bez zmian (579), zapadka dlugu i
    # wykluczenia bez zmian — pomiar guarda na drzewie po K6: 3611 pol.
    # 3612 pol / 591 plikow / network_model 147 (+1) / application 332 (+14)
    # (CV-4.3 K1, 2026-09-06): 15 nowych plikow benchmarkow ENM —
    # `network_model/catalog/mv_benchmark_catalog.py` (+1, katalog referencyjny
    # typow benchmarkowych, korzen network_model) i `application/reference_
    # networks/enm_builders/{__init__,_kernel,ieee_4bus,ieee_9bus,ieee_13bus,
    # ieee_14bus,ieee_34bus,ieee_39bus,cigre_mv,cigre_lv_benchmark,
    # pp_simple_four_bus,iec60909_example,pandapower_iec60909_radial,
    # oze_pv_bess}.py` (+14, korzen application) wnosza nowe pola kontraktu:
    # dataclass `EdgeSpec` w `enm/kompilator_grafu.py` (pola `edge_id`/`from_lit`/`to_lit`/
    # `dlugosc_m` — `catalog_ref`/`rodzaj` juz istnialy gdzie indziej, wiec
    # `contract_fields()` jako ZBIOR ich nie dolicza ponownie) daje wiekszosc
    # przyrostu do 3612; `BenchmarkEnm` (`enm`/`bus_map`/`branch_map`) nie
    # dokladala nic nowego (nazwy juz obecne). Zapadka dlugu SUMA spada 291->289 (dwa GENUINE naprawienia,
    # nie nowy dlug — patrz `ZASTANE_ZASTEPNIKI` w `solver_input_substitute_
    # guard.py`): `enm/mapping.py` "B:ifexp:source.rx_ratio" (wydzielenie
    # `_positive_impedance_ohm`, ten sam wzorzec co "liczba_torow" — parametr
    # zamiast atrybutu, bramka niewidzialna, fizyka niezmieniona) i `enm/
    # topology_ops.py` "F:dictget:data.pk_kw" (naprawa NAZWANA w tej samej
    # karcie: `data.get("pk_kw")` bez zapasu liczbowego + jawne `is None` ->
    # BLOCKER, zamiast sentinela 0 — faktyczna eliminacja, nie przeniesienie).
    # Plikow ZASTANE bez zmian (63) — oba naprawione wzorce byly jednymi z
    # WIELU w swoich plikach, zaden plik nie zszedl do zera. Wykluczenia bez
    # zmian (17 plikow / suma 49).
    # Scalenie K6 + K1/A1 (odbior Fable, 2026-09-06, pomiar guarda na drzewie po
    # scaleniu, nie suma deklaracji): 3617 pol (3611 po K6 + przyrost K1 z
    # `EdgeSpec` w `enm/kompilator_grafu.py`), 594 plikow (579 po K3b/K4/K6 + 15
    # modulow benchmarkow K1), network_model 149 (148 + `mv_benchmark_catalog.py`),
    # enm 38 (K3b `rozplyw_wysp.py` zostaje; A1 liczyl 37 na bazie sprzed K3b),
    # application 332 (318 + 14 budowniczych ENM). Zapadka dlugu 289 (A1: −2
    # GENUINE; formula Z_Q po scaleniu jest WARTOSCIOWA —
    # `impedancja_zasilania_systemowego(rx_ratio=...)` — wiec forma
    # "B:ifexp:source.rx_ratio" nie wraca mimo wchloniecia K6 w te sama funkcje).
    # CV-4.3 K7 (2026-09-09, pomiar guarda na drzewie K7): 3625 pol (3617 + 8: trzy pola
    # MIN `Source`/`AddGridSourceSNPayload`/`SourceSystemType` widziane jako kontrakty
    # wejsciowe, `GridSourcePreviewRequest` +3 i `scenariusz_min` odpowiedzi; nazwy
    # `tryb_max`/`tryb_min` w `DaneZwarcioweZrodla` — NIE `max`/`min`, bo pole kontraktu o
    # nazwie `min` kazalo guardowi traktowac kazde `np.max(...)` w repo jako podstawienie),
    # 595 plikow (594 + `enm/zrodlo_zwarcie.py`), enm 39; +1 = `pola_opcjonalne` w
    # `MaterializationContract` (pola addytywne kontraktu materializacji kopiowane tylko
    # z wartoscia) — razem 3626. Zapadka dlugu i wykluczenia bez zmian: K7 nie dodala
    # zadnego zastepnika (dane MIN: brak = `None` + zalozenie nazwane).
    # Karta K7-DOCS (2026-09-09): +1 = `XlsxNetworkImporter.SOURCE_OPTIONAL_COLUMNS`
    # (adnotowany atrybut klasy importera XLSX, nie pole fizyczne — inwentarz guarda
    # zbiera adnotowane atrybuty klas w `application/`); zmierzone różnicą zbiorów
    # `contract_fields()` af2d0f5b → HEAD: dokładnie ten jeden wpis, zero podstawień.
    # PERF-SC-50 (2026-09-09): +1 = `WejscieZwarcia.wklady_w_biegu` (assembler, tryb wkładów
    # gałęziowych: w biegu / na żądanie) — pole sterowania, nie liczba fizyczna; zmierzone
    # guardem na drzewie karty: 3628, zapadka dlugu/wykluczenia bez zmian.
    # W1 (2026-09-09): 3628 -> 3530 pol, 596 -> 545 plikow — kasacja legacy persystencji
    # sieci (NetworkWizardService + dtos, wizard_runtime, application/sld/**, designer,
    # design_synth, sld_projection, diagnostics/diff, 12 eksporterow reporting/, 7 repozytoriow
    # legacy, 19 klas ORM) i przepisanie archiwum na format 3.0.0 (ArchiveSummary 12 -> 4
    # liczb rekordow); zapadka dlugu 63/289 -> 61/286 i wykluczenia 17/49 -> 14/32 ZMALALY
    # wylacznie przez skasowane pliki (network_wizard/service.py, sld/layout.py,
    # power_flow_report_docx.py, project_archive 8 liczb sekcji legacy) — pomiar `--pomiar`
    # na drzewie karty, zero nowych podstawien.
    # K2 (2026-09-09): 3530 -> 3484 pol (application/reference_networks/** skasowane);
    # po scaleniu z W2-C (+9 pol, daf303a3) pomiar na drzewie galezi = 3493 (odbior K2).
    # Odbior W3-D + W3-A + W3-E (2026-09-09, drzewo galezi po K2): 3493 -> 3491 = -3 (W3-D:
    # SourceComplianceResult) -2 (W3-A: bridge SC<->Protection v1) +3 (W3-E: pola 410/
    # wycofany) — pomiar guardem na drzewie scalonym, nie arytmetyka z kart.
    # W3-F (2026-09-09): +1 plik w korzeniu network_model = `network_model/pochodne/
    # jednostki.py` (skalowanie jednostek SI, karta W3-F §0.1; ten guard skanuje
    # CALE `network_model/**` bez wykluczenia `pochodne/`, w odroznieniu od
    # `backend_no_physics_guard` — patrz uzasadnienie K4 wyzej). Zapadka dlugu
    # suma spada 280 -> 279 (wpis "H:local:materialized.rated_power_mva" w
    # `enm/domain_operations.py` zdjety — migracja do `mva_na_kva(...)` zmienila
    # ksztalt AST z BinOp na Call, patrz komentarz przy wpisie w
    # `ZASTANE_ZASTEPNIKI`); plikow dlugu bez zmian (61 — plik ma inne wpisy).
    # Pol kontraktow/wykluczenia bez zmian (funkcje `jednostki.py` sa czystymi
    # przelicznikami literalow, zero pol kontraktu, zero podstawien).
    # W3-B (2026-09-09): 3539 -> 3543 pol (+4, pliki bez zmian — same 545). Roznica zbiorow
    # contract_fields() a16f8d2b -> HEAD (dokladnie 4 nowe nazwy, zero usunietych):
    # `obwod_wtorny` (Measurement.obwod_wtorny, enm/models.py), `vt_uzwojenie`
    # (Measurement.vt_uzwojenie — ktore uzwojenie VT, VT-only), `kody_gotowosci` i `slad`
    # (Kryterium.kody_gotowosci/slad, domain/dobor_przekladnika.py — kryterium `ct.alf`
    # niesie teraz kody gotowosci + slad WHITE BOX z jadra delegowanego). Pola obwodu
    # wtornego wspoldzielone z istniejacym kontraktem `api/equipment_checks.py`
    # (`dlugosc_przewodu_m`/`przekroj_przewodu_mm2`/`obciazenia_aparatow`/`moc_stykow_va`,
    # tez w nowych `dobor_przekladnika.py::WymaganiaToru` i `generators.py::_ObwodWtornyPomiaru`)
    # zbiegaja sie z istniejacymi nazwami zbioru — zero przyrostu z tego tytulu. Zapadka
    # dlugu i wykluczenia bez zmian (61 plikow/suma 280 dlug; 14 plikow/suma 32 wykluczenia) —
    # pomiar guarda na drzewie karty, zero nowych podstawien (filtr `_obwod_wtorny_pomiaru`
    # pomija pozycje bez `moc_va` zamiast podstawiac zero, patrz `api/generators.py`).
    # W2-C (2026-09-09, daf303a3): +9 pol kontraktu (karta ConverterType: widmo harmoniczne,
    # droop P(f)/Q(U); wejscie V12.6: proweniencja widma, pominiete zrodla) — pomiar guardem.
    # W3-I (2026-09-09): +4 pola kontraktu = `WymagalnoscKatalogu` (`tworzenie`/`walidacja`/
    # `import_`/`kod_walidacji`, `network_model/catalog/governance.py`) — nowy jedyny predykat
    # wymagalnosci katalogu (klasa K-A aneksu 3a J8/K8, `docs/plan/KARTA_W3_KONWERGENCJA_
    # FIZYKI_2026-09.md` §0.15). Zbior nazw (nie suma per-klase, patrz FAB-L powyzej):
    # wszystkie cztery nazwy nowe w calym CONTRACT_SOURCES, 3539 + 4 = 3543 bez reszty.
    # Zapadka dlugu (61 plikow, suma 280) i wykluczenia (14 plikow, suma 32) BEZ ZMIAN od
    # tej karty — zmierzone `git diff a16f8d2b..HEAD` linii DODANYCH: zero nowych wzorcow
    # "or <liczba>"/".get(..., <liczba>)"/"else <liczba>" w `backend/src/**` (bramka czyta
    # poziomy z enuma `Poziom`, nie liczby). Suma dlugu 280 (nie 286 z komentarza W1 powyzej)
    # jest STANEM ODZIEDZICZONYM na bazie karty (`a16f8d2b`) sprzed W3-I, nie skutkiem tej
    # karty — nazwane tu uczciwie (brak dopasowania spadku 286 -> 280 w diffie W3-I), zeby
    # nie przypisac sobie cudzej naprawy.
    # W3-C1 (2026-09-09): 3539 -> 3533 pol (-6), 530 plikow (545 - 15) — kasacja V12K-189
    # (druga z trzech zduplikowanych metodyk nastaw nadpradowych, ZERO producentow biegow
    # i ZERO konsumentow frontendu, zmierzone): `application/analyses/protection/
    # overcurrent/**` (9 plikow z dataclassami `OvercurrentSettingsV0` i pokrewnymi),
    # `api/protection_overcurrent_settings.py`, `application/analyses/run_registry.py`
    # (0 wolan po zdjeciu wpisow overcurrent), `run_envelope.py` + 3x `envelope_adapter.py`
    # (iec60909/, energy_validation/, protection/catalog/) po tym, jak ich jedyny
    # producent/konsument znikl w tej samej kasacji. Zapadka fizyczna: 61/280 -> 61/279
    # (`application/analyses/protection/catalog/pipeline.py` -2: `settings.tms_51`/
    # `settings.tms_51n` domyslne 0.0 z workowego slownika ZNIKNELY razem z funkcja,
    # ktora je czytala — `_settings_to_requirement`, zastapiona typowanym
    # `mapper.wymaganie_z_nastaw` czytajacym `ProtectionSettingsResult`; nowy plik
    # `application/proof_engine/pakiet_nastaw.py` +1: `run.c_factor` domyslne 1.10,
    # DOKLADNIE ten sam ksztalt co juz zaakceptowany `kotwica.c_factor` w
    # `protection_settings/batch_run.py` obok — predykaty parami, `dostepnosc_pakietu_
    # nastaw` musi odrzucac kotwice spoza galezi maksymalnej TYM SAMYM warunkiem, ktorego
    # uzywa budowa). Wykluczenia bez zmian (14/32) — kasacja nie dotkneła zadnego wzorca
    # skanera. Pomiar guardem na drzewie karty, zero NOWYCH podstawien.
    # W3-C1: 530 plikow (545 - 15 skasowanych: 9 `overcurrent/**` + `run_registry.py` +
    # `run_envelope.py` + 3x `envelope_adapter.py` + `protection_overcurrent_settings.py`
    # zliczony w `api/`, nie w tej sumie `application/**` — patrz rozbicie ponizej).
    # W3-C1 (2026-09-09): 61/280 -> 61/279, patrz komentarz przy asercji pol kontraktu wyzej.
    # W3-C1 (2026-09-09): application 294 -> 280 plikow (-14: kasacja V12K-189, patrz
    # komentarz przy asercji pol kontraktu wyzej), dlug application suma 112 -> 111 (-1:
    # pipeline.py -2, pakiet_nastaw.py +1); api 64 -> 63 plikow (-1:
    # `protection_overcurrent_settings.py`). Reszta korzeni (network_model, solver_input,
    # enm) bez zmian — karta ich nie dotyka.
    # W3-C2 (2026-09-09): kasacja `application/analyses/protection/line_overcurrent_setting/`
    # (4 pliki, w tym `analyzer.py` — jedyny konsument metodyki FIX-12D, zastapiony kanonem
    # Hoppel/IRiESD `application/protection_settings/engine.py`) zdjela 22 pola kontraktu
    # (dataclassy `LineOvercurrentSettingInput`/`Result`/kryteria w `models.py`) i 4 pliki ze
    # skanu (3539->3517 pol, 545->541 plikow). Ten sam plik: wpis zapadki `analyzer.py`
    # (3 podstawienia: ct_ratio/ik_max_busbars_a/kc) usuniety RAZEM z plikiem — zdjety, nie
    # przeniesiony (61->60 plikow zapadki, suma 280->274). Rownolegle `application/
    # reference_patterns/pattern_line_i_doubleprime_thermal_spz.py` przebudowany na
    # `ProtectionSettingsInput` (schemat plaski, inne nazwy pol) — 12 starych sygnatur (schemat
    # FIX-12D: `window.i_min_primary_a`, `conductor_data.theta_*`, `fixture.kb/kbth/kc/
    # t_breaker_s/t_nast_*`, `spz_data.t_dead_*/t_fault_max_s`, suma 13) zastapionych 7 nowymi
    # (schemat Hoppel: `setting_window.i_min_a`, `fixture.delta_t_s/k_b/k_bth/t_upstream_s/
    # spz_pause_s/lokalna_generacja_wklad_a`, suma 8) — domyslne wartosci MIRRORUJA domyslne
    # `ProtectionSettingsInput` (cytowane w naglowku silnika), nie nowa fabrykacja. Dwa odczyty
    # `local_generation.udzial_el`/`prog_udzialu_zsz` (`or 0.0`) NAPRAWIONE u zrodla (jawne
    # None-sprawdzenie + wyjatek), nie wpisane do zapadki — nowy kod tej karty, nie dlug.
    # Zapadka 60/269 -> suma per plik: -6 (analyzer.py usuniety) -5 (13->8 dla pattern file) = -11
    # z 280 = 269. Pliki zapadki: -1 (tylko analyzer.py znika jako PLIK; pattern file zostaje
    # plikiem, zmieniaja sie tylko jego klucze) = 61-1 = 60.
    # W3-C2 (2026-09-09): 541 plikow (545 - 4 skasowane pliki `line_overcurrent_setting/`).
    # W3-C2 (2026-09-09): zapadka 61/280 -> 60/269 (patrz uzasadnienie wyzej).
    # W3-C2 (2026-09-09): application 294->290 plikow (-4 line_overcurrent_setting/),
    # dlug 34->33 plikow/112->101 suma (-1 plik/-11 suma, patrz uzasadnienie wyzej).
    # Odbior fali 2 W3 (2026-09-10; drzewo scalone W3-F/W3-B/W3-I/W3-C1/W3-C2 na a1b40e9a):
    # POMIAR guardem, nie arytmetyka z kart: pola 3491 -> 3471 (W3-B +4, W3-I +4, W3-C1
    # -15 plikow overcurrent/koperty, W3-C2 -4 pliki FIX-12D i wzorzec na plaskim schemacie
    # Hoppla), pliki 502 -> 484 (+1 pochodne/jednostki.py, -15 W3-C1, -4 W3-C2), zapadka
    # 59/273 -> 58/260 (wpisy skasowanych plikow zdjete; enm 77 -> 76 po migracji W3-F),
    # wykluczenia 13/31 bez zmian. Komentarze kart wyzej zachowane jako zapis ich pomiarow.
    # B-02 / W3-E (2026-09-10; drzewo z kontraktami gotowosci i katalogu analiz V12.6):
    # POMIAR guardem: pola 3471 -> 3506 (+35: `application/analyses/v126_gotowosc.py`
    # — `Warunek`, `DanaZModeluWartosc`, `Proponowana`, `GotowoscAnalizy`;
    # `application/analyses/v126_katalog.py` — karty katalogu z sekcjami danych,
    # kryteriow i zakresu), pliki 484 -> 486 (+2: te same dwa moduly, nowe w tej karcie),
    # zapadka 58/260 i wykluczenia 13/31 bez zmian (zero nowych podstawien).
    # Odbior fali 3 W3 (2026-09-10; drzewo b89c13b3 + TRACE-V2 + W3-G1/G2/G3): POMIAR
    # guardem 3506 -> 3506 — rownosc jest ZBIEGIEM trzech zmian, nie brakiem zmian:
    # -19 (TRACE-V2 skasowal trzy zrodla kontraktow `domain/trace_v2/{artifact,
    # equation_registry_v2,math_spec_version}.py`: derived_in_adapter, eq_id,
    # equation_steps, inputs_used, intermediate_values, latex_symbolic, major,
    # math_spec_version, meaning_pl, minor, patch, run_hash, source_norm, subject_id,
    # substituted_latex, symbolic_latex, trace_signature, valid_from_math_spec,
    # variables), +10 (W3-G2 `analysis/sanity_bounds/power_flow_bounds.py`: actual_kv,
    # lower_kv, upper_kv, deviation_pct, loading_pct, losses_active_mw,
    # load_active_total_mw, losses_pct_of_load, threshold_pct, threshold_why_pl),
    # +9 (W3-G3 pasmo MIN/MAX zwarcia w istniejacych zrodlach kontraktow: bieg_min,
    # bieg_max, zrodlo_min, zrodlo_max, run_kotwicy_id, scenariusz_kotwicy,
    # scenariusz_brakujacy, powod_niedostepnosci, typ_zwarcia). Zbiory pol PRZED/PO
    # zdiffowane na obu drzewach (pomiar, nie arytmetyka z kart).
    # W3-J (2026-09-16; jedno zrodlo kryteriow napieciowych): POMIAR guardem 3506 -> 3515
    # (+9: nowy plik `analysis/normative/kryteria_napiecia.py` dopisany do CONTRACT_SOURCES
    # — dataclass `KryteriaNapieciowe` niesie ostrzezenie_pct, przekroczenie_pct,
    # ostrzezenie_min_pu, ostrzezenie_max_pu, przekroczenie_min_pu, przekroczenie_max_pu,
    # podstawa_ostrzezenie_pl, podstawa_przekroczenie_pl, pasmo_wiarygodnosci_pct). Plik
    # zyje w `analysis/normative/`, poza 5 skanowanymi korzeniami tego guarda (network_model,
    # solver_input, enm, application, api) — plikow_skanowanych/zapadka/wykluczenia per
    # korzen bez zmian (pomiar guardem na drzewie karty, zero nowych podstawien).
    # Karta V12.7 (2026-09-16): POMIAR guardem 3506 -> 3512 (+6 nazw pol, zbior
    # globalny wiec bez powtorzen): `application/analyses/v126_katalog.py` —
    # `symbol_latex`, `warunek_latex`, `wzor_latex`, `wzor_opis_pl`, `zakres_oceny`
    # (pola LaTeX/zakresu katalogu V12.6, karta §0.1/§0.7); `application/analyses/
    # werdykt_projektowy.py` — `margines_wzor_latex` (pozostale nowe pola tego
    # pliku, symbol_latex/warunek_latex/zakres_oceny, juz w zbiorze z katalogu —
    # deduplikacja nazw). Zero naruszen (zapadka/wykluczenia bez zmian) — nowe pola
    # sa napisowe (LaTeX/opis), zadne nie przechodzi przez galaz zapasowa liczbowa.
    # Odbior obu kart na jednym drzewie (2026-09-16, po W3-J i V12.7 razem): POMIAR guardem
    # na drzewie scalonym = 3521 (zbiory nazw pol obu kart rozlaczne — sprawdzone
    # pomiarem, nie arytmetyka: liczba nizej pochodzi z biegu guarda na tym drzewie).
    # Karta S-1/S-4 (W6-0, dowod dynamiczny): POMIAR guardem 3506 -> 3517 (+11
    # nazw pol, deduplikowanych przez guard w calym repo — nie prosta suma
    # nowych AnnAssign). Nowe struktury: `solver_input/provenance.py::
    # CapabilityEvidence` (capability_id, tier, rationale_pl, audit_ref,
    # claim_kind), `solver_input/dowod_ncrfg.py::OcenaDowodowaModulu`/
    # `OcenaDowodowaBiegu` (reporting_status, proof_status, evidence_
    # limitations, evidence_note_pl, per_module, evidence_by_test) oraz nowe
    # pola addytywne `api/ncrfg_ptpiree_tests.py::NcRfgPtpireeRunResponse`
    # (reporting_status, proof_status, evidence_limitations, evidence_note_pl,
    # evidence_per_module, evidence_by_test) — zero podstawien liczby za brak
    # danych wejsciowych (PASS niezmieniony), pliki/zapadka/wykluczenia bez
    # zmian (nowy plik `dowod_ncrfg.py` NIE jest w zapadce dlugu ani w
    # wykluczeniach — zero formul fizycznych, czysta interpretacja rejestru).
    # [Stan 2026-09-23: `solver_input/dowod_ncrfg.py` i pola dowodowe S-1 kontraktu biegu
    # skasowane w karcie AB-1a Pakiet C — wpis nizej.]
    # Odbior S-1/S-4 na tym samym drzewie (2026-09-16, po W3-J + V12.7): POMIAR guardem na
    # drzewie scalonym = 3532 (liczba z biegu guarda na tym drzewie, nie z arytmetyki kart).
    # Karta S-2 AUTORYTET (2026-09-16, k_sc DEFAULT_FORBIDDEN): POMIAR guardem
    # 3506 -> 3522 (+16, dedup po nazwie pola w zakresie skanu — liczba guarda,
    # nie suma reczna). Nowe nosniki pol w tym zakresie: `network_model/core/
    # autorytet_wyniku_zwarciowego.py` (`ProweniencjaWynikuZwarciowego`,
    # `BlokadaAutorytetu`), `network_model/core/wiazanie_wyniku_zwarciowego.py`
    # (`WiazanieWynikuZwarciowego`), `application/autorytet_biegu_zwarciowego.py`
    # (`WejscieZwarcioweZBiegu`, `WejscieKoordynacjiZBiegow`) — wszystkie nowe
    # moduly tej karty; plus pola addytywne na istniejacych kontraktach:
    # `k_sc_znaczniki` (`enm/assembler.py` WejscieZwarcia), `proweniencja`
    # (`application/equipment_proof/types.py` EquipmentProofInput),
    # `sc_run_id_min` (`api/protection_coordination.py` RunCoordinationRequest).
    # Odbior S-2 AUTORYTET na drzewie po W3-J + V12.7 + S-1/S-4 + HARNESS-ZWARCIA (2026-09-16):
    # POMIAR guardem na drzewie scalonym = 3548 (3532 + 16 pol S-2; zbiory nazw rozlaczne —
    # sprawdzone pomiarem, liczba z biegu guarda na tym drzewie, nie z arytmetyki kart).
    # Karta S-3 (W6-0, jeden tor NC RfG, 2026-09-16): POMIAR guardem 3532 -> 3534 (+2 nazwy
    # pol deduplikowane w calym repo: `application/ncrfg_compliance/bieg.py::
    # NcRfgCaseComplianceResponse` (case_id, operator_id, der_count, pominiete, bieg) i
    # `model_bridge.py::NcRfgDerPominiety` (der_ref, der_name, powod, powod_pl) /
    # `WejsciaZgodnosciZModelu` (modules, pominiete); `NcRfgPtpireeRunResponse`
    # przeniesiony z api/ do application/ bez zmiany pol; drugi silnik `checker.py`
    # (ComplianceTestResult/NcRfgComplianceReport/DerDataForCompliance) skasowany —
    # jego nazwy pol byly juz zdeduplikowane z innymi kontraktami, wiec kasacja nie
    # obniza licznika). Zero podstawien liczby za brak danych wejsciowych (PASS
    # niezmieniony), pliki/zapadka/wykluczenia bez zmian.
    # Odbior S-3 NC-RFG-JEDEN-TOR na drzewie po S-2 (2026-09-16): POMIAR guardem na drzewie
    # scalonym = 3550 (3548 + 2 pola S-3: NcRfgCaseComplianceResponse/bieg.py; checker.py
    # skasowany, bieg.py dodany - liczba plikow application 231 bez zmian netto).
    # Karta W5-D (2026-09-16): 3550 -> 3568 (+18 pol; POMIAR guardem na drzewie scalonym po S-3 i W5-D, 2026-09-16):
    # `Load.phases` (enm/models.py), `AddNnLoad.phases` (enm/domain_ops_models.py),
    # pola dataclass `DrogaZerowa`/`DiagnozaNiesymetrii.droga_zerowa`/`WejscieRozplywu
    # Niesymetrycznego`/`WyspaRozplywuNiesymetrycznego` (enm/assembler.py) oraz kontrakt
    # `domain/result_contract_power_flow_unbalanced_v1.py` (wiersze per faza, VUF, wyspy).
    # Karta W5-A (2026-09-16, jedna reprezentacja uziemienia): POMIAR guardem na drzewie karty 3548 -> 3564
    # (+16, dedup po nazwie pola); na drzewie scalonym po W5-D: 3568 -> 3584 (pomiar). Nowe nosniki pol w zakresie skanu: `Source.neutral_grounding`,
    # `Transformer.lv_earthing_system`, `Cable.screen_bonding`, `CableType.z0_reference_bonding`
    # (enm/models.py, catalog/types.py), `enm/grupa_polaczen.py::GrupaPolaczen` (gn_typ,
    # gn_punkt_neutralny, dn_typ, dn_punkt_neutralny, godzina), `enm/uziemienie.py::
    # RaportMigracjiUziemienia`, `api/catalog.py::SlownikGrupPolaczen`/`SlownikiUziemienia`
    # (grupy, typy_punktu_neutralnego, uklady_sieci_nn, uziemienia_ekranu_kabla, role_uziemnika)
    # — zero podstawien liczby za brak danych wejsciowych (PASS niezmieniony).
    # Karta W6-1 (kontrakt czasu, 2026-09-16): POMIAR guardem na drzewie scalonym 3584 -> 3706
    # (+124 nowych nazw pol, -2 skasowane pola: referencja profilu obciazenia odbioru — karta
    # W6-1 K-E, kasacja opisana w `enm/domain_ops_models.py::AddNNLoadPayload` — oraz
    # `standard_compliance` (der_dynamic/models.py) — dedup po nazwie pola w calym repo, zbior
    # policzony narzedziem `comm` na dwoch zrzutach `contract_fields()`, nie z arytmetyki karty).
    # Nowe nosniki: `enm/dynamika_modele.py`
    # (`MaszynaSynchroniczna`/`PrzeksztaltnikGFL`/`PrzeksztaltnikGFM`/`Magazyn`/
    # `TurbinaWiatrowa`/`Crowbar`/regulatory AVR-GOV-PSS/`ProweniencjaParametrow` — Xd/Xq/T-stale
    # czasowe/droop/PLL/pitch/SOC, zero domyslek liczbowych wprost z karty), `enm/scenariusze.py`
    # (`Zwarcie`/`WylaczenieGalezi`/`ZalaczenieGalezi`/`OdlaczenieZrodla`/`SkokObciazenia`/
    # `KomendaRegulacji`/`Synchronizacja`/`ScenariuszDynamiczny` — harmonogram zdarzen
    # dynamicznych), `application/contracts/resultset_dynamic_v1.py` (`ResultSetDynamicV1` i
    # skladowe: kanaly/metryka/tozsamosc biegu/stopien dowodowy), `enm/models.py::
    # Generator.dynamika` — zero podstawien liczby za brak danych wejsciowych (PASS niezmieniony).
    # Karta SZABLONY-ROLA-A (V12T-016, 2026-09-17): 3706 -> 3708 (+2 nowe pola
    # `TemplateSchema.shunt_capacitor_options`/`grid_source_options`,
    # `application/station_templates/schema.py` — addytywne krotki CatalogChoice
    # dla nowych kategorii szablonow rola A/E; zero podstawien liczbowych).
    # Trzy karty tej samej fali podnioszly ten sam licznik; wartosc ponizej jest
    # POMIAREM guardem na drzewie polaczonym, nie suma arytmetyczna kart.
    # KATALOG-NIEZMIENNIKI (2026-09-17): +17 pol kontraktu przegladu wiarygodnosci
    # katalogu w `api/catalog.py` (`OdstepstwoWiarygodnosciOdpowiedz`,
    # `PokrycieRegulyOdpowiedz`, `RegulaWiarygodnosciOdpowiedz`,
    # `RodzinaPrzegladuOdpowiedz`, `RodzinaBezRegulOdpowiedz`,
    # `PrzegladWiarygodnosciOdpowiedz`) — przeglad CZYTA katalog, pozycja
    # niepoliczalna idzie do `pominiete` z nazwanym powodem.
    # HARNESS-RESZTA-2 (2026-09-17): +1 pole `FaktyPolaWytworcy.der_nazwa`
    # (`domain/der_protection_functions.py`) — nazwa wytworcy w etykiecie
    # chronionego obiektu, `str | None = None`, brak danej meldowany jako brak.
    # W6-2 (2026-09-18): +71 pol kontraktu rdzenia dynamiki
    # (`network_model/solvers/dynamika/kontrakty.py` i moduly pakietu:
    # `WejscieDynamiki`, `NastawySolvera`, elementy sieci, harmonogram zdarzen,
    # protokol urzadzenia, struktury wyniku i tozsamosci). KAZDE z tych pol jest
    # WYMAGANE — zero domyslek liczbowych, pilnuje `dynamika_zero_default_guard`.
    # We wszystkich trzech wypadkach zero podstawien — PASS bramki niezmieniony.
    # W6-3A (2026-09-18): 3797 -> 3828 (+31 pol, zero skasowanych). POMIAR: zbior
    # `contract_fields()` zrzucony na drzewie bazowym karty (839fc1eb) i na drzewie
    # karty, roznica policzona `comm`, nie arytmetyka. Nowe nosniki to biblioteka
    # urzadzen dynamicznych `network_model/solvers/dynamika/urzadzenia/**`:
    # `okno_mocy.py::OknoMocy` (dol_pu, gora_pu, domkniecie_gory),
    # `uklad_stanow.py::UkladStanow` (nazwy, uklad), `maszyna_synchroniczna.py`
    # (napiecie_d, napiecie_q, prad_d, prad_q, prad_siec, moc_elektryczna,
    # strumien_szczeliny, nasycenie, wspolczynnik), `magazyn.py::Zasobnik`
    # (pojemnosc_kwh, p_ladowania_max_pu, p_rozladowania_max_pu, zasobnik, rdzen),
    # `turbina_wiatrowa.py` (pitch_min_rad, pitch_max_rad, pitch_tempo_rad_s, tor,
    # prog_pu, prad_pelnego_zadzialania_pu), `fabryka.py::INWENTARZ_POL`
    # (konsumowane, nieskonsumowane, wariant, napiecie_pu, moc_pu, okno_mocy).
    # KAZDE z tych pol jest WYMAGANE — zero domyslek liczbowych; zero podstawien
    # liczby za nieobecna dana wejsciowa, PASS bramki niezmieniony.
    # W6-3B (2026-09-18): 3828 -> 3829 (+1 pole, zero skasowanych). POMIAR: zbior
    # `contract_fields()` zrzucony z `enm/adapter_dynamiki.py` i bez niego, roznica
    # policzona na zbiorach, nie z arytmetyki karty. Jedyna NOWA nazwa w repo to
    # `PunktPracyRozplywu.wstrzyki_pu` (moc wypadkowa szyny z biegu rozplywu, w
    # konwencji generacji) — pozostale pola adaptera (`kod`, `komunikat_pl`,
    # `elementy`, `napiecia_pu`, `base_mva`, `run_id`, `snapshot_hash`, `wezly`,
    # `galezie`, `odsprzegi`, `odbiory`) noszą nazwy juz obecne w repo, wiec dedup
    # po nazwie ich nie liczy. Pole jest WYPROWADZONE z wyniku rozplywu, nigdy
    # podstawione: brak szyny w wyniku konczy sie odmowa
    # `dynamika.punkt_pracy_niepelny`, nie zerem. PASS bramki niezmieniony.
    # W6-A (2026-09-18): 3829 -> 3836 (+7 pol, zero skasowanych). POMIAR: zbior
    # `contract_fields()` zrzucony NA DRZEWIE z `obserwable.py` i BEZ niego, roznica
    # policzona `comm` na posortowanych zbiorach, nie arytmetyka. Nowe nazwy pochodza
    # z dwoch nosnikow warstwy obserwabli `z(t)`
    # (`network_model/solvers/dynamika/obserwable.py`): `CzestotliwoscWezla`
    # (`f_hz`, `niepewnosc_hz`, `jakosc`) i `WielkosciGalezi` (`i_od_pu`, `i_do_pu`,
    # `s_od_pu`, `s_do_pu`). ZADNE z nich nie jest dana WEJSCIOWA — wszystkie sa
    # WYPROWADZONE ze stanow urzadzen i rozwiazania algebraicznego jawnym wzorem, wiec
    # nie istnieje dla nich „brak danej", ktory mozna by podstawic liczba; brak
    # wiarygodnosci kata konczy sie stanem jakosci, nie wartoscia zastepcza.
    # PASS bramki niezmieniony (zero podstawien).
    # W6-A korekta par. 5 (2026-09-18): 3836 -> 3839 (+3 pola, zero skasowanych, zero nowych
    # plikow). POMIAR: zbior `contract_fields()` zrzucony NA DRZEWIE i BEZ `obserwable.py`,
    # roznica policzona `comm`. Nosnikiem jest `PochodnaZNiepewnoscia` (`pochodna_pu_s`,
    # `niepewnosc_napiecia_pu`, `niepewnosc_pochodnej_pu_s`) — struktura WYNIKU pomiaru
    # niepewnosci, nie danych wejsciowych. Zaden z tych kanalow nie ma stanu „brak danej":
    # obie niepewnosci sa LICZONE z residuum i jakobianu, a gdy jakobian jest osobliwy,
    # obserwabla wraca jako NIEDOSTEPNA — nie jako podstawiona liczba. PASS bramki
    # niezmieniony (zero podstawien).
    # Bramka SO-1A (2026-09-18): 3839 -> 3840 (+1 pole, zero skasowanych, zero nowych
    # plikow). POMIAR: zbior `contract_fields()` zrzucony NA DRZEWIE i na HEAD, roznica
    # policzona `comm` na posortowanych zbiorach — jedyna nowa nazwa to `moce_pu`
    # z `enm/adapter_dynamiki.py::UrzadzeniaDynamiki`. To jest WYNIK podzialu mocy wezla
    # miedzy wytworcow, nie dana wejsciowa: kazda pozycja pochodzi albo z wypadkowej szyny
    # z rozplywu (jeden wytworca), albo z `Generator.p_mw` i `moc_bierna_wytworcy` po
    # sprawdzeniu uzgodnienia z ta wypadkowa (kilku wytworcow). Braku danej nie ma czym
    # podstawic: Q nieznane jest POMINIETE tak samo jak w `enm/mapping.py`, a niespojnosc
    # konczy sie odmowa `dynamika.podzial_mocy_wezla_niespojny`, nie liczba zastepcza.
    # PASS bramki niezmieniony (zero podstawien).
    # Walidacja fizyczna dynamiki / naprawa F-8 (2026-09-20): 3840 -> 3841 (+1 pole,
    # zero skasowanych, zero nowych plikow). POMIAR: zbior `contract_fields()` zrzucony
    # NA DRZEWIE i na drzewie bazowym rundy (`5770464c`), roznica policzona `comm` na
    # posortowanych zbiorach, nie arytmetyka karty — jedyna nowa nazwa to
    # `ModelSieci.przydzial_wysp` (`network_model/solvers/dynamika/siec.py`): indeks
    # spojnej skladowej grafu AKTYWNYCH galezi dla kazdego wezla, liczony RAZ w
    # `zloz_model_sieci`. To wielkosc WYPROWADZONA z topologii, nie dana wejsciowa:
    # nie istnieje dla niej stan „brak danej", ktory mozna by podstawic liczba (przy
    # pustym zbiorze galezi kazdy wezel jest wlasna wyspa i to jest odpowiedz
    # poprawna, nie zastepcza), a jej konsument `sprawdz_zasilanie_wysp` melduje
    # `dynamika.wyspa_bez_zrodla` PRZED Newtonem zamiast cokolwiek podstawiac.
    # W tej samej zmianie SKASOWANA zostala wlasciwosc `ModelSieci.liczba_wysp`, na
    # ktorej bramka zapalila sie na CI (run 35536141250): zwracala `0` dla modelu bez
    # wezlow — liczbe podstawiona za brak danych. Nie miala zadnego konsumenta, wiec
    # poszla jako martwy kod, a nie jako wyciszenie. PASS bramki niezmieniony
    # (zero podstawien).
    # Archiwum projektu (2026-09-23, `f9ac289c`): 3841 -> 3843 (+2 pola, zero skasowanych,
    # zero nowych plikow). POMIAR: zbior `contract_fields()` zrzucony na drzewie bazowym
    # (`5770464c`, 3840 + `przydzial_wysp` z F-8) i na HEAD (`cadc584b`), roznica policzona
    # `comm` na posortowanych zbiorach — jedyne nowe nazwy to `surowy` i `archiwum` z
    # `application/project_archive/service.py::_OdczytaneArchiwum` (jeden dekoder ZIP:
    # `project.json` przed `dict_to_archive` i po nim; `manifest` to nazwa juz obecna w
    # repo, dedup po nazwie). To struktura ODCZYTU archiwum, nie dana wejsciowa solvera;
    # brak sekcji konczy sie `ArchiveStructureError`, nie wartoscia zastepcza. Zapadka
    # zapalila sie na CI (run 35857877892) bo naprawa archiwum zmienila liczbe bez tego
    # wiersza. PASS bramki niezmieniony (zero podstawien).
    # Karta AB-1a Pakiet L (2026-09-23): 3843 -> 3750 (-93 pola, zero nowych). POMIAR: zbior
    # `contract_fields()` zrzucony guardem na drzewie `d0d02f0f` (czysty HEAD; 3843 — HEAD po
    # wyrownaniu tego pinu przez zarzadce) i na drzewie `d0d02f0f` + Pakiet L, roznica
    # policzona `comm` na posortowanych zbiorach. Pola zniknely RAZEM z kasowanymi kontraktami
    # bez konsumenta produkcyjnego (LEGACY_USUNAC A2, A35, A39, B8, B14, B24, C38, C41, C46,
    # C51, C55 i sieroty X2 w `domain/protection_device.py`): `PR_EQUATIONS`, `PR_STEP_ORDER`,
    # `accepted_by`, `accepted_fields`, `all_checks_passed`, `animation_token`, `author`,
    # `blocking_reason_pl`, `bound_version`, `bus_names`, `changed_solver_fields`,
    # `changed_ui_fields`, `color_token`, `convergence_check`, `convergence_criterion`,
    # `current_version`, `delta_step`, `downstream_curve_id`, `downstream_max_s`,
    # `downstream_relay_id`, `downstream_trace`, `downstream_trip_time_s`, `drifts`,
    # `element_label`, `energy_balance`, `execution_date`, `final_max_mismatch`,
    # `final_state`, `generation_levels`, `grading_margin_s`, `has_breaking_drifts`,
    # `i2t_ka2s`, `i2t_results`, `i_fault_start_a`, `i_max_allowed_a`, `i_min_required_a`,
    # `i_threshold_a`, `icu_ka`, `ik_max_next_a`, `ik_min_busbars_a`, `initial_state`,
    # `iteration_number`, `ith_device_ka`, `ith_limit_ka2s`, `ithdop_a`, `ithn_a`,
    # `jacobian_step`, `json_representation`, `kb_used`, `kbth_used`, `kc_used`,
    # `latex_representation`, `left`, `materialized_values`, `min_required_margin_s`,
    # `mismatch_step`, `network_definition`, `no_contradictions`, `norm_step`,
    # `nr_method_description`, `numeric_badges`, `oze_id`, `oze_name`, `p_nominal_mw`,
    # `power_flow_equations`, `proof_version`, `protection_comparisons`, `q_slope_pu_per_pu`,
    # `qu_characteristic`, `qu_compliance`, `recommendation_pl`, `relay_pairs`, `report_hash`,
    # `right`, `selectivity`, `selectivity_results`, `state_update_step`, `stroke_token`,
    # `tk_single_s`, `total_bindings_checked`, `u_deadband_high_pu`, `u_deadband_low_pu`,
    # `unit_consistency`, `upstream_curve_id`, `upstream_min_s`, `upstream_relay_id`,
    # `upstream_trace`, `upstream_trip_time_s`, `visual_state`, `voltages_at_buses_pu`,
    # `voltages_at_oze_pu`, `voltages_within_limits`, `ybus_description`. PASS bramki
    # niezmieniony (zero podstawien).
    # Karta AB-H0 (2026-09-23, karty widmowe + sekcje modelu): 3843 -> 3968. POMIAR:
    # zbior `contract_fields()` zrzucony na czystym HEAD (`2ef62bbc`) i na drzewie
    # integracji, roznica `comm` na posortowanych zbiorach, w dwoch krokach:
    # (1) klasy AB-H0 w korzeniach juz objetych mapa: +21 nazw (`dowody`, `harmonic`,
    # `jakosci_zrodel`, `karty`, `karty_bez_typu`, `karty_wg_statusu`, `karty_widmowe`,
    # `liczba_kart`, `liczba_typow`, `modele_widmowe`, `odrzucone`, `pola`, `producent`,
    # `status_weryfikacji_rekordu`, `supraharmonic`, `typ_id`, `typy_z_karta`, `widma`,
    # `widmo`, `wymagany`, `zrodla_modeli_widmowych`) i -1 (`harmonic_spectrum_percent`
    # — kasacja odczytu widma z `materialized_params`, widmo tylko z karty) = 3863;
    # (2) piec korzeni dolozonych do `CONTRACT_SOURCES` na zadanie pinu mapy
    # (`dziedziny/{kanon,karta_widmowa,sekcje,widmo}.py`, `werdykt/kontrakt.py`):
    # +105 nazw = 3968. Najkrotsze nazwy sprawdzone pod katem kolizji (`u` — napiecie
    # punktu pracy widma, `soc` — stan naladowania punktu pracy, `krok`, `skala`,
    # `limit`, `pomiar`) — ZERO nowych trafien (zapadka 56/255 i wykluczenia 13/31
    # bez zmian, RC=0). W tej samej karcie usuniete jedno NOWE podstawienie wykryte
    # przez bramke (`generator.n_parallel or 1` w kontroli mocy przy przypisaniu typu,
    # `enm/domain_operations_v2.py`) — liczba jednostek nie jest dopowiadana.
    # Decyzja O-53 (2026-09-23): 3968 -> 3970. `domain/generator_validation.py`
    # dolozony do `CONTRACT_SOURCES` na zadanie pinu mapy (enm czyta z niego JEDNA
    # regule mocy zrodla); `comm` zbiorow przed/po: +2 nazwy
    # (`przeciazalnosc_transformatora_pu`, `wspolczynnik_jednoczesnosci`; `cos_phi`,
    # `kod`, `komunikat_pl` juz byly w mapie). Zero nowych trafien skanera.
    # Integracja na HEAD 06e8ef79 (Pakiet L + docs) 2026-09-24: liczby ponizej z POMIARU
    # guardem na scalonym drzewie int/h0 (roznice L i AB-H0 sie sumuja).
    # Karta AB-1b.1a (2026-09-23, integracja): 3750 -> 3866 (+116 nazw, zero usunietych).
    # POMIAR skryptem `scratchpad/integracja_1b1/delta_pol_kontraktu.py`: zbior HEAD odtworzony
    # z plikow niezmienionych + `git show HEAD:` plikow zmienionych w zakresie zrodel (3750 =
    # pin HEAD), zbior drzewa = `contract_fields()` guardu. Trzy skladniki:
    # (a) +44 nazwy nowych pol w zrodlach juz objetych mapa (dynamika AB-1b.1a, klasa P9
    # decyzji O-46/O-51 — prady i obciazenie z OBU zaciskow galezi, zacisk zabezpieczenia,
    # miejsce urzadzenia; tozsamosc i odcisk biegu dynamicznego):
    # `POLA_POZA_ODCISKIEM`, `aktywna_na_starcie`, `current_do_ka`, `current_od_ka`,
    # `druga_szyna`, `dziedzina_fizyki`, `element`, `etykieta_do_pl`, `etykieta_od_pl`,
    # `galaz_ref`, `laczeniowy`, `miejsca_zwarc`, `migawka`, `obszary_odciete`,
    # `obszary_zasilone_ponownie`, `odbiory_aktywne`, `odbiory_odciete`, `odsprzeg`,
    # `odsprzegi_aktywne`, `os_czasu`, `polozenie`, `polozenie_wzgledne`, `pozycje_zerowe`,
    # `rated_current_do_a`, `rated_current_od_a`, `sposob_usuniecia`, `start_od_sasiada`,
    # `strona_probki`, `strona_probki_json`, `strony`, `szyna_do_ref`, `szyna_od_ref`,
    # `szyna_przeciwna_ref`, `szyna_zacisku_ref`, `wezly_beznapieciowe`, `wezly_ograniczone`,
    # `zacisk`, `zacisk_decydujacy`, `zacisk_zabezpieczenia`, `zaciski`, `zalaczony`,
    # `zrodlo_zacisku`, `zwarcia_galezi`, `zwarcia_metaliczne`;
    # (b) +8 z nowego korzenia `analysis/obciazenie_galezi.py` (pin mapy zazadal decyzji):
    # `do_a`, `obciazenie_pct`, `od_a`, `powod_braku_pl`, `prad_do_a`, `prad_od_a`,
    # `prad_znamionowy_do_a`, `prad_znamionowy_od_a`;
    # (c) +64 z nowego korzenia `werdykt/kontrakt.py` (czytany przez
    # `application/contracts/resultset_dynamic_v2.py`):
    # `chwila_s`, `czego_brakuje`, `dane_przyjete`, `definicja_latex`, `dokument`, `domena_pl`,
    # `dotyczy`, `etykieta`, `jednostka_obwiedni`, `jednostka_redakcyjna`, `kompletnosc_dowodu`,
    # `krok`, `kryteria_naruszone`, `kryterium_najblizej_granicy`, `limit`, `metoda`, `metoda_pl`,
    # `model_urzadzenia`, `modul_istniejacy`, `nie_dotyczy`, `niedefiniowalny`, `niepewnosc`,
    # `obwiednia`, `oceny_skladowe`, `ograniczniki`, `parametry_sieci`, `pasmo`,
    # `pokrycie_programu`, `pokrycie_programu_pl`, `powody_niepelnosci`, `poziom`, `przedmiot`,
    # `punkt_krytyczny_pl`, `punkt_pl`, `regulator`, `relacja`, `rodzaj_analizy`,
    # `rodzaj_twierdzenia`, `semantyka`, `skala`, `skala_rodzaj`, `sposob_wykazania`,
    # `status_danych`, `status_maszynowy`, `status_modelu`, `stosowalnosc`, `symetria_zaklocenia`,
    # `technologia`, `typ_modulu`, `w_domenie_walidacji`, `warunek_wstepny_nieuruchomiony`,
    # `warunek_wstepny_pl`, `warunek_wstepny_podstawa`, `wersja_profilu`, `wersja_silnika`,
    # `wydanie`, `wyjasnienie`, `wykluczenia`, `wymaganie_id`, `wzgledny`,
    # `zakres_stosowalnosci_pl`, `zakres_waznosci`, `zastrzezenia`, `zdanie_pl`.
    # PASS bramki niezmieniony (zero podstawien — zapadka 55/254 i wykluczenia 13/31 bez zmian).
    # Integracja AB-1b.1a na HEAD z AB-H0 (2026-09-24): 3877 -> 3929 — POMIAR guardem na
    # scalonym drzewie int/1b1: +44 nazwy AB-1b.1a (wymienione wyzej) i +8 z korzenia
    # `analysis/obciazenie_galezi.py`; `werdykt/kontrakt.py` juz w mapie (AB-H0), wiec
    # +64 z pomiaru na bbcc8555 tu nie wchodzi drugi raz.
    # Karta AB-1a Pakiety B + C z odbiorem (2026-09-23, drzewo integracyjne na `2ef62bbc`):
    # 3843 -> 4002 (+177 nazw, -18 skasowanych). POMIAR: zbior `contract_fields()` zrzucony
    # na drzewie czystym (`czysty-head`, `src` = HEAD) i na drzewie integracyjnym, roznica
    # policzona na posortowanych zbiorach, nie arytmetyka karty. Nowe nosniki: warstwy
    # profilu NC RfG (`catalog/profiles/nc_rfg/loader.py` — dokumenty warstw, progi typow
    # WOS, program badan, rejestr wykazu PTPiREE), kontrakt V2 solvera PTPiREE
    # (`ncrfg_ptpiree/contracts.py` — klasyfikacja, dowod certyfikatu, rekord oceny testu),
    # ocena wymagan (`application/ncrfg_compliance/**`), `enm/nastawy_modulu.py`, pola ENM
    # generatora (art. 4, data umowy, nastawy) oraz +58 nazw kontraktu rekordu werdyktu
    # (`werdykt/kontrakt.py`, `werdykt/dokument.py` dolozone do `CONTRACT_SOURCES` — patrz
    # uzasadnienie tamze: 3944 -> 4002). Skasowane: pola dowodowe S-1 z kontraktu biegu
    # (`reporting_status`, `proof_status`, `evidence_*`, `per_module`, `certificate_*`),
    # liczniki modulu (`required_count`, `no_data_count`, `not_required_count`),
    # `run_request`/`deterministic_seed` dokumentow, `acceptance_date`/`voltage_kv_max`
    # dawnego modelu klasyfikacji. Zapadka dlugu (56/255) i wykluczenia (13/31) BEZ ZMIANY
    # — zero nowych podstawien (PASS niezmieniony).
    # Uzupelnienie odbioru Pakietu C (§0 pkt 7-9 karty integracyjnej, 2026-09-23): 4002 -> 4004
    # (+2: `deklaracje_modulu` — blok deklaracji modulu generatora `enm/deklaracje_modulu.py`,
    # `rekord` — `application/ncrfg_compliance/ocena_wymagan.py::BrakWymaganiaModulu`; pozostale
    # pola nowych klas byly juz w mapie przez kontrakt wejscia solvera PTPiREE). POMIAR guardem
    # przed i po, roznica zbiorow `contract_fields()`. PASS niezmieniony (zero podstawien —
    # brak deklaracji konczy sie ocena niewykonana z nazwanym brakiem, nigdy wartoscia).
    # Integracja B+C+D2 na HEAD z AB-H0 i AB-1b.1a (2026-09-24): 3929 -> 4024 — POMIAR guardem
    # na scalonym drzewie int/c (korzen `werdykt/dokument.py` + pola kontraktow B+C nieobecne
    # jeszcze w mapie; `werdykt/kontrakt.py` juz byl z AB-H0).
    # Karta AB-1a Pakiet 0 (2026-09-23): 3750 -> 3825. POMIAR: zbior `contract_fields()`
    # guarda liczony na drzewie `bbcc8555` (czysty HEAD) i `bbcc8555` + Pakiet 0 PRZY TEJ
    # SAMEJ liscie `CONTRACT_SOURCES`, roznica zbiorow na posortowanych nazwach. Dwa skladniki:
    # (1) pin mapy zazadal decyzji dla dwoch korzeni czytanych przez zakres od wpiecia rekordow
    # oceny niewykonanej — `analysis/ssci_stability/models.py` i `werdykt/kontrakt.py` weszly
    # do mapy (precedens `analysis/sanity_bounds/*`): +85 nazw na kodzie HEAD (3750 -> 3835),
    # zero nowych trafien; (2) kod Pakietu 0 na tej samej mapie: 3835 -> 3824 — ubyly pola
    # werdyktu progowego toru T1 i progow SSCI skasowane RAZEM z nimi (`angle_swing_deg`,
    # `clearing_margin_ms`, `criteria_version`, `limiting_factor`, `max_angle_swing_deg`,
    # `max_clearing_time_ms`, `min_frequency_recovery_pu`, `min_voltage_recovery_pu`,
    # `pm_risk_deg`, `pm_unstable_deg`, `stability_index`, `stable`, `topology_effect`,
    # `violated_checks`), doszly `granica`, `negative_resistance_re_min_ohm`, `ocena`;
    # (3) 3824 -> 3825: `podstawa_sposobu_wykazania` rekordu W kontraktu werdyktu (pole, ktore
    # typ interfejsu `WynikWymagania` deklarowal, a backend nie serializowal). PASS bramki
    # niezmieniony (zero podstawien).
    # Ponowne zlozenie Pakietu 0 na HEAD `1b422cdd` (B+C+D2, AB-H0, AB-1b.1a, #135;
    # 2026-09-24): 4024 -> 4033 — POMIAR `contract_fields()` na drzewie #135 i na drzewie
    # po zlozeniu, roznica zbiorow na posortowanych nazwach: +21 (pola widoku stabilnosci
    # SSCI z korzenia `analysis/ssci_stability/models.py`: `consumed_fields`, `converter_ref`,
    # `distance_to_minus_one`, `encirclement_count`, `gain_crossover`, `gain_crossover_mag`,
    # `has_magnitude_crossover`, `is_risk`, `mag`, `max_minor_loop_gain`,
    # `nearest_to_minus_one`, `negative_resistance_f_hz`, `negative_resistance_present`,
    # `negative_resistance_re_min_ohm`, `offending_frequency_hz`, `phase_deg`, `phase_l_deg`,
    # `phase_margin_deg`, `worst_phase_margin_deg`, `worst_phase_margin_f_hz`, `granica`),
    # -12 (pola werdyktu progowego toru T1 skasowane razem z nim: `angle_swing_deg`,
    # `clearing_margin_ms`, `criteria_version`, `limiting_factor`, `max_angle_swing_deg`,
    # `max_clearing_time_ms`, `min_frequency_recovery_pu`, `min_voltage_recovery_pu`,
    # `stability_index`, `stable`, `topology_effect`, `violated_checks`). `werdykt/kontrakt.py`
    # byl juz w mapie (B+C), wiec jego pola nie wchodza do roznicy.
    # Karta AB-1a Pakiet E2 (2026-09-24): 4033 -> 4032 — POMIAR `contract_fields()` na drzewie
    # `7b05931e` i na drzewie karty, roznica zbiorow: -1 (`deterministic_id`, jedyne wystapienie
    # w martwym modelu `api/power_flow_runs.py::PowerFlowRunResponse` — 0 uzyc, skasowany razem
    # z `PowerFlowExecuteResponse`), +0. PASS niezmieniony (zero podstawien).
    # Partia integracji 2 (2026-09-25: archiwum, PL-ZNAKI, #141, E2, #142): 4033 -> 4042 —
    # POMIAR `contract_fields()` na `4d3bb589` i na czubku partii, roznica zbiorow:
    # +11 (karta archiwum: `audytowe`, `identyfikator_audytowy`, `old_value_pl`,
    # `new_value_pl`, `element_type_label_pl`, `section_label_pl` w `api/archive_diff.py`,
    # `paczka`, `bajty`, `sekcje_zastosowane` w `application/project_archive/service.py`;
    # karta #141: `okreslenie_pl` w `station_templates/schema.py`; karta #142:
    # `transformer_name` w `enm/pole_transformatorowe.py`), -2 (`deterministic_id` — E2,
    # `new_archive_hash` — archiwum). PASS niezmieniony (zero podstawien).
    # Karta AB-1b.1b (P6-P8 rdzenia dynamiki, 2026-09-24): 4033 -> 4072 — POMIAR
    # `contract_fields()` na HEAD `7b05931e` i na drzewie karty, roznica zbiorow na
    # posortowanych nazwach: +40 (kontrakty rdzenia `PrzypisanieStanu`, `KomendaRegulacji`,
    # `UtrataCzesciowaZrodla`, `NastawaRegulacji`, `Dozor` i wielkosci dozoru, wpis
    # harmonogramu i `KontekstHarmonogramu`, `ZrodloTestowe` i segmenty profilu,
    # `UrzadzenieCzesciowe`; kontrakt danych `NastawaDynamiczna`, `StanowiskoBadawcze`,
    # `detektory`/`Detektor`, `UtrataCzesciowaZrodla`; kontrakt wyniku `przekroczenia`,
    # `tryb_scenariusza`, `przyczyna`, `przypisania`, pomiar lokalizacji: `akcja`, `akcje`,
    # `delta_x_nieprzypisane_max`, `detektory`, `dozor`, `dozory`, `g_po`, `g_przed`,
    # `identy_odbiorow`, `identy_odsprzegow`, `impedancja_pu`, `iteracje_lokalizacji`,
    # `jednorazowy`, `kasowanie_przy_powrocie`, `kat_deg`, `lokalizacja`, `mnoznik`,
    # `napiecia_wezlow`, `odchylka_hz`, `opoznienie_s`, `profil`, `prog`, `przekroczenia`,
    # `przyczyna`, `przypisania`, `skladowa`, `stanowisko`, `strona`, `szerokosc_przedzialu_s`,
    # `szerokosc_s`, `t_zlokalizowany_s`, `tempo_hz_na_s`, `tempo_pu_na_s`,
    # `tolerancja_lokalizacji_zdarzen_s`, `tryb_scenariusza`, `udzial`, `udzial_pozostaly`,
    # `udzialy_zrodel`, `w_gore`, `zakres`), -1 (`delta_x_max` — pomiar kopii stanow w algebrze
    # zastapiony `delta_x_nieprzypisane_max`, karta AB-1b.1 S19). PASS niezmieniony (zero
    # podstawien liczby za nieobecna dana).
    # Partia integracji 3 (2026-09-25): 4042 -> 4051 — POMIAR `contract_fields()` na `d5f66b6a`
    # i na `103963a2`, roznica zbiorow: +9 (karta #144: `_nazwy_lokalizacji`,
    # `nazwy_lokalizacji`, `nazwa_odcinka`, `projekt`, `przypadek`, `source_nazwa`,
    # `target_nazwa`; karta ETYKIETY-TR: `source_bus_name`, `target_bus_name`), -0; pin nie
    # byl podniesiony przy integracji #144 (czerwony samotest na `a0262d73`/`103963a2`).
    # Po AB-1b.1b na tej samej partii: 4051 -> 4090 (+40, -1 jak wyzej). PASS niezmieniony.
    # Karta MAGISTRALA-OCENA (2026-09-25): 4032 -> 4055 — POMIAR `contract_fields()` na
    # drzewie bazowym karty `73d435c2` (4042: +10 nazw z kart scalonych po Pakiecie E2 bez
    # obnizenia/podniesienia pinu — ten test byl czerwony na bazie) i na drzewie karty,
    # roznica zbiorow: +13 (`brak_typu`, `ciag`, `indeks`, `liczba_odcinkow`, `napiecie_kv`,
    # `ocena_ciagu`, `oceny_odcinka`, `odcinek`, `odcinki_zbudowane`, `prad_obliczeniowy_a`,
    # `prad_z_obciazalnosci`, `spadek`, `spadek_odcinka` — kontrakt trasy oceny doboru
    # magistrali `api/grid_source_preview.py` i modulu `application/analyses/
    # ocena_doboru_magistrali.py`), -0. PASS niezmieniony (zero podstawien — brak pradu
    # roboczego jest dana przyjeta w statusie danych dowodu albo nazwanym brakiem).
    # Integracja MAGISTRALA-OCENA na partii 3 (2026-09-25): 4090 -> 4103 (+13 nazw karty jak
    # wyzej, -0) — POMIAR guardem na drzewie integracji.
    assert "Pol kontraktow wejsciowych: 4103." in wyjscie, wyjscie
    assert (
        # PERF-SC-50: 596 plikow (595 + `enm/wartosci_niefinitowe.py`, mechanika NaN/inf
        # w jednym miejscu), enm 40 — pomiar guarda na drzewie karty.
        # K2 (2026-09-09): 545 -> 504 plikow (application/reference_networks/**: 21
        # pozostalych plikow skasowane w calosci + api/reference_networks.py, -41 razem —
        # reszta pakietu, w tym enm_builders/comparator.py/expected_values.py/wymagane.py/
        # sld_network_model.py/sld_substrate_power_flow.py/station_archetype_substrate.py,
        # przeniesiona pod backend/tests/, poza tym skanem juz wczesniej w tej samej karcie).
        # W3-D (-1: application/compliance/source_compliance.py) + W3-A (-1:
        # application/protection_current_resolver.py) na drzewie po K2: 504 -> 502.
        # B-02 / W3-E (2026-09-10): 484 -> 486 (+2 `application/analyses/v126_gotowosc.py`,
        # `application/analyses/v126_katalog.py`).
        # Odbior fali 3 W3 (2026-09-10): 486 -> 479 (-8 TRACE-V2: `application/
        # trace_emitters/{__init__,deterministic_ids,load_flow_emitter,protection_emitter,
        # sc_emitter,wynik}.py` + `application/trace_export/{__init__,latex_generator}.py`
        # skasowane w calosci; +1 W3-G1: `application/analyses/power_flow_reconstruction.py`).
        # Karta V12.7 (2026-09-16): 479 -> 480 (+1 nowy modul `application/analyses/
        # v126_wzory.py` — rejestr wzorow LaTeX kroku sladu, karta §0.1).
        # Karta S-1/S-4 (W6-0): 479 -> 480 (+1 nowy plik `solver_input/dowod_ncrfg.py`,
        # skasowany w karcie AB-1a Pakiet C — wpis nizej).
        # Odbior na jednym drzewie (2026-09-16): oba nowe pliki razem -> 481 (pomiar guardem).
        # Karta S-2 AUTORYTET (2026-09-16): 479 -> 484 (+5 nowych plikow: `network_model/
        # core/{wklad_zwarciowy_przeksztaltnika,zdolnosci_wkladu_zwarciowego,
        # autorytet_wyniku_zwarciowego,wiazanie_wyniku_zwarciowego}.py` (4) +
        # `application/autorytet_biegu_zwarciowego.py` (1) — zero plikow skasowanych.
        # Odbior S-2 na tym samym drzewie (2026-09-16): 481 + 5 nowych plikow S-2 = 486 (pomiar guardem).
        # Karta W5-D (2026-09-16): 486 -> 489 (+3 nowe pliki: `enm/fazy_odbioru.py`,
        # `enm/rozplyw_niesymetryczny_wynik.py`, `network_model/pochodne/
        # skladowe_symetryczne.py`; zero wpisow w zapadce/wykluczeniach z tych plikow).
        # Karta W5-A (2026-09-16): 486 -> 492 na drzewie karty; po W5-D na drzewie scalonym 489 -> 495 (pomiar) (+6 nowych plikow: `enm/{grupa_polaczen,uziemienie,
        # uklad_sieci_nn}.py`, `network_model/core/uziemienie.py`, `network_model/pochodne/
        # skladowe_zerowe.py`, `solver_input/uklad_sieci_nn.py`; skasowany modul `domain/grounding`
        # lezy POZA zakresem skanu — zero zmiany licznika).
        # Karta W6-1 (2026-09-16): 495 -> 498 (+3 nowe pliki: `enm/dynamika_modele.py`,
        # `application/contracts/__init__.py`, `application/contracts/resultset_dynamic_v1.py`;
        # zero plikow skasowanych w zakresie skanu).
        # Karta SZABLONY-ROLA-A (V12T-016, 2026-09-17): 498 -> 503 (+5 nowych plikow
        # `application/station_templates/templates/{gpz_110_sn,rozdzielnia_sieciowa,
        # stacja_abonencka,kompensacja,rezerwa_zasilania}.py` — nowe kategorie
        # szablonow stacji rola A/C/E; zero plikow skasowanych).
        # Karta KATALOG-NIEZMIENNIKI (2026-09-17): 503 -> 504 (+1 plik
        # `network_model/catalog/niezmienniki_katalogu.py` — rejestr mocy regul
        # katalogu i przeglad wiarygodnosci; modul importuje wylacznie stdlib i nie
        # podstawia zadnej liczby za brak danej, zero plikow skasowanych).
        # Karta KASACJA-UNIEWAZNIACZA (2026-09-17): 504 -> 503 (-1 plik
        # `application/analysis_run/result_invalidator.py` — martwy uniewazniacz
        # wynikow skasowany procedura po pomiarze 0 wolajacych w `backend/src`;
        # zapadka idzie W DOL, bo z zakresu skanu UBYL plik, nie przybyl).
        # Karta W6-2 (2026-09-17): 503 -> 523 (+20 plikow nowego pakietu
        # `network_model/solvers/dynamika/**` — rdzen DAE dynamiki RMS: kontrakty,
        # konwencje, siec, calkowanie, zdarzenia, re-inicjalizacja, skonczonosc,
        # tozsamosc, wynik, silnik, `urzadzenia/**` i `walidacja/**`; zero plikow
        # skasowanych, zero nowych wpisow w zapadce dlugu i w wykluczeniach —
        # pakiet nie podstawia zadnej liczby za nieobecna dana wejsciowa, brak danej
        # konczy sie odmowa `dynamika.<pole>_missing`).
        # Karta W6-3A (2026-09-18): 523 -> 533 (+10 plikow biblioteki urzadzen
        # dynamicznych `network_model/solvers/dynamika/urzadzenia/**`:
        # `pochodne_kierunkowe.py`, `uklad_stanow.py`, `okno_mocy.py`,
        # `regulatory.py`, `maszyna_synchroniczna.py`, `przeksztaltnik_gfl.py`,
        # `przeksztaltnik_gfm.py`, `magazyn.py`, `turbina_wiatrowa.py`,
        # `fabryka.py`; zero plikow skasowanych, zero nowych wpisow w zapadce
        # dlugu i w wykluczeniach — brak danej kontraktu konczy sie odmowa
        # `dynamika.rodzina_nieobslugiwana` / `dynamika.wariant_bez_parametrow`,
        # nigdy podstawieniem liczby).
        # Karta W6-3B (2026-09-18): 533 -> 534 (+1 plik `enm/adapter_dynamiki.py` —
        # adapter biegu czasowego: sklada wejscie rdzenia z migawki efektywnej i
        # punktu pracy z rozplywu. Zero nowych wpisow w zapadce dlugu i w
        # wykluczeniach: modul nie podstawia zadnej liczby za brak danej — brak
        # nastawy numerycznej, scenariusza albo punktu pracy konczy sie nazwana
        # odmowa z rejestru `KODY_ODMOW_ADAPTERA`, plaski start 1,0 p.u. jest w nim
        # ZAKAZANY. Zero plikow skasowanych).
        # Runda adwersarialna W6-A (2026-09-18): 535 -> 536 (+1 plik
        # `network_model/solvers/dynamika/waznosc.py` — straznik ZAKRESU WAZNOSCI
        # modelu, rozdzielony od ogranicznika stanu; wyjscie stanu poza zakres konczy
        # bieg odmowa `dynamika.zakres_waznosci_przekroczony` z adresem, chwila,
        # wartoscia, granica i przekroczeniem. POMIAR: `git diff --name-status HEAD~1
        # HEAD -- backend/src/` daje DOKLADNIE jeden wpis `A`, reszta to `M`; guard na
        # drzewie melduje 536 przy niezmienionej liczbie pol (3840), niezmienionej
        # zapadce dlugu (56 plikow/255) i niezmienionych wykluczeniach (13/31).
        # Modul importuje wylacznie `numpy` i wlasny rejestr kodow, nie czyta zadnego
        # kontraktu wejsciowego i nie podstawia zadnej liczby za brak danej — margines
        # porownania jest WYPROWADZONY z nastaw solvera i ziarnistosci float64
        # (`ceil(horyzont_s/dt_min_s) * ulp(granica)`), nie dobrana stala.
        # Zero plikow skasowanych.
        # Walidacja fizyczna dynamiki / naprawa F-8 (2026-09-20): 536 -> 537 (+1 plik
        # `network_model/solvers/dynamika/wyspy.py` — przydzial wysp z grafu AKTYWNYCH
        # galezi i sprawdzenie zasilania kazdej wyspy PRZED Newtonem; wyspa z odbiorem,
        # ale bez urzadzenia wnoszacego wklad do algebry, konczy sie odmowa
        # `dynamika.wyspa_bez_zrodla`, a nie zbieznoscia na napieciu uciekajacym do
        # 1,37e11 p.u. POMIAR: `git diff --name-status 5770464c HEAD -- backend/src/`
        # daje DOKLADNIE jeden wpis `A`, reszta to `M`. Zapadka dlugu (56/255) i
        # wykluczenia (13/31) BEZ ZMIANY: predykat wkladu jest MIERZONY z rownan
        # urzadzenia (`prad_pu` oraz `jakobian_prad_napiecie`), a nie z listy rodzin,
        # wiec modul nie podstawia zadnej liczby za brak danej. Zero plikow skasowanych.
        # Karta AB-1a Pakiet L (2026-09-23): 537 -> 529 (-8 plikow skasowanych bez
        # konsumenta produkcyjnego: `network_model/proof/{__init__,power_flow_equations,
        # power_flow_proof_builder,power_flow_proof_document,power_flow_proof_export}.py`
        # (A35), `network_model/catalog/drift_detection.py` (A39),
        # `application/proof_engine/packs/qu_regulation.py` (C46),
        # `application/reference_patterns/reporting.py` (C51)); zero nowych plikow.
        # POMIAR guardem na drzewach `d0d02f0f` i `d0d02f0f` + Pakiet L.
        # Karta AB-H0 (2026-09-23): 537 -> 544 (+7 plikow: `network_model/catalog/
        # karty_widmowe/__init__.py`, `network_model/catalog/sekcje_modelu.py`,
        # `enm/katalog_projektu_karty.py`, `enm/rejestr_operacji.py`,
        # `application/model_urzadzenia/{__init__,sekcje_elementu}.py`,
        # `api/karty_widmowe.py`); zero plikow skasowanych, dlug i wykluczenia bez zmian.
        # Integracja na HEAD 06e8ef79 (Pakiet L + docs) 2026-09-24: liczby ponizej z POMIARU
        # guardem na scalonym drzewie int/h0 (roznice L i AB-H0 sie sumuja).
        # Karta AB-1b.1a (2026-09-23): 529 -> 530 (+1 `application/protection_settings/
        # zacisk_zabezpieczenia.py` — resolver zacisku; `application/contracts/
        # resultset_dynamic_v1.py` -> `_v2.py` to wymiana 1:1; `analysis/` i `dziedziny/`
        # leza poza zakresem skanu). Pomiar guardem.
        # Karta AB-1a Pakiety B + C z odbiorem (2026-09-23): 537 -> 539 (pomiar guardem na
        # drzewie integracyjnym): +4 nowe pliki w zakresie skanu (`network_model/solvers/
        # ncrfg_ptpiree/stosowalnosc.py`, `enm/nastawy_modulu.py`, `application/
        # ncrfg_compliance/ocena_wymagan.py`, `application/analyses/sekcja_zgodnosci_ncrfg.py`),
        # -2 skasowane (`solver_input/dowod_ncrfg.py`, `application/analyses/
        # dowod_certyfikatu.py`; skasowany pakiet `compliance/` lezy poza zakresem skanu).
        # Zapadka dlugu i wykluczenia BEZ ZMIANY.
        # Uzupelnienie odbioru Pakietu C (§0 pkt 7-9): 539 -> 540 (+1 `enm/deklaracje_modulu.py`
        # — blok deklaracji modulu i jeden walidator pol NC RfG generatora dla obu pisarzy).
        # Karta AB-1a Pakiet 0 (2026-09-23): 529 -> 530 (+1 `application/ocena_niewykonana.py`
        # — cienka fabryka rekordu oceny niewykonanej na regule K kontraktu werdyktu; zero
        # wpisow w zapadce i wykluczeniach). POMIAR guardem na drzewie `bbcc8555` + Pakiet 0.
        # Pakiet 0 (zlozenie na `1b422cdd`): +1 plik `application/ocena_niewykonana.py`.
        # Karta AB-1a Pakiet E2 (2026-09-24): 541 -> 540 (-1 `application/analyses/
        # run_index.py` — `AnalysisRunIndexEntry` bez wolajacego, skasowany razem z
        # repozytorium `infrastructure/persistence/...`, ktore lezy poza zakresem skanu;
        # zero nowych plikow). POMIAR guardem na drzewie karty.
        # Partia integracji 2 (2026-09-25): 540 -> 542 (+1 `enm/rola_pola_sn.py` — kanon
        # rol pol SN, karta #141; +1 `enm/slownik_komunikatow.py` — slownik nazw pol
        # formularza w komunikatach, karta #142). POMIAR guardem na czubku partii.
        # Karta AB-1b.1b (2026-09-24): 541 -> 544 (+3 moduly rdzenia dynamiki:
        # `solvers/dynamika/dozory.py`, `solvers/dynamika/urzadzenia/czesciowe.py`,
        # `solvers/dynamika/urzadzenia/zrodlo_testowe.py`; zero wpisow w zapadce i wykluczeniach).
        # Partia integracji 3 (2026-09-25): 542 -> 544 (+1 `enm/nazwy_elementow.py`, +1
        # `application/nazwy_biegu.py` — karta #144), potem +3 AB-1b.1b: 544 -> 547.
        # POMIAR guardem na `103963a2` i na drzewie integracji.
        # Karta MAGISTRALA-OCENA (2026-09-25): 540 -> 543 — POMIAR guardem na drzewie karty:
        # +2 enm z kart scalonych przed baza `73d435c2` bez aktualizacji pinu (`enm/
        # rola_pola_sn.py` karta #141, `enm/slownik_komunikatow.py` karta #142; ten test byl
        # czerwony na bazie) i +1 application (`application/analyses/
        # ocena_doboru_magistrali.py`). Zapadka dlugu i wykluczenia BEZ ZMIANY.
        # Integracja MAGISTRALA-OCENA na partii 3: 547 -> 548 (+1
        # `application/analyses/ocena_doboru_magistrali.py`). POMIAR guardem.
        # Karta PASMO-1KV na partii 4 (2026-09-25): 548 -> 549 (+1
        # `network_model/pochodne/pasma_napieciowe.py` — jedno źródło granic pasm napięć;
        # zbiór pól kontraktów bez zmian, 4103). POMIAR guardem na drzewie integracji.
        "Przeskanowano 549 plikow w zakresie: network_model, solver_input, enm, "
        "application, api." in wyjscie
    ), wyjscie
    # W2 pkt 1 (2026-09-09): kasacja fabrykacji stabilnosci dynamicznej zdjela 6 zastepnikow
    # `run.*` z `enm/canonical_analysis.py` — zapadka 61/286 -> 61/280 (CI na a4d94615
    # zameldowal "Dlug ZMALAL" x6; pomiar guardem na drzewie).
    # K2 (2026-09-09): application/reference_networks/** skasowane w calosci (dawny dialekt
    # benchmarkow). Pola 3530 -> 3484, application 294 -> 254 plikow skanowanych; zapadka
    # application 34/112 -> 32/105 (-2 pliki/-7: expected_values.py "F:dictget:item.rtol"x3 +
    # station_archetype_substrate.py "B:ifexp"x2+"C:getattr"x2 — OBA przeniesione pod
    # backend/tests/, poza skanem, nie naprawione u zrodla), wykluczenia application 5/11 ->
    # 4/10 (-1 plik/-1: similarity_matcher.py "H:local:match.confidence_pct" skasowany razem
    # z ekranem). api 64 -> 63 plikow (api/reference_networks.py skasowany, zero wlasnego
    # wpisu w zapadce/wykluczeniach tego guarda). Globalna zapadka 61/280 -> 59/273,
    # wykluczenia 14/32 -> 13/31 — pomiar guardem na drzewie karty, zero nowych podstawien.
    # Odbior fali 3 W3 (2026-09-10): 58/260 -> 57/258 — wpis skasowanego pliku
    # `application/trace_emitters/protection_emitter.py` ("F:dictget:tp.i_a_primary" +
    # "F:dictget:tp.i_a_secondary") zdjety razem z plikiem (TRACE-V2); zero nowych
    # podstawien w W3-G1/G2/G3 (RC=0 guarda na drzewie odbioru).
    # Karta W5-A (2026-09-16): 57/258 -> 56/255 — wpis `enm/zero_sequence_transformer.py`
    # (3 wyrazenia warunkowe: skladowe towarzyszace R/X punktu neutralnego i zabezpieczenie
    # dzielenia przez S_rT) USUNIETY z zapadki: skladowe licza predykaty parami z
    # `enm/uziemienie.py` + `network_model/pochodne/skladowe_zerowe.py`, a S_rT <= 0 odrzuca
    # walidacja modelu. Dlug ZMALAL, zapadka obnizona (pomiar guardem na drzewie karty).
    # Karta AB-1a Pakiet L (2026-09-23): 56/255 -> 55/254 — wpis ZASTANE
    # `network_model/proof/power_flow_proof_builder.py` ("F:dictget:deltas.delta_v_pu": 1)
    # zdjety RAZEM z plikiem (A35: martwy dowod rozplywu, 0 importerow poza testem);
    # z `CONTRACT_SOURCES` zdjety `domain/result_set.py` (C55). Pomiar guardem.
    # Decyzja O-53 (2026-09-23): 56/255 -> 56/254 — wpis "H:local:payload.quantity"
    # (`_converter_required_apparent_power_mva`, jedynka zastepcza liczby jednostek)
    # USUNIETY z zapadki razem z funkcja: moc wymagana zrodla liczy jedna regula
    # domenowa, liczba jednostek z `enm/models.liczba_jednostek_zrodla`.
    # Decyzja O-53 (2026-09-24, klasa w selektorach): 56/254 -> 55/249 — wpis
    # `network_model/solvers/der_selection_preview.py` (k_j/k_obc niedodatnie -> 1,0,
    # ujemna rezerwa -> 0, razem 5) zdjety: dana spoza dziedziny jest bledem wejscia.
    # Klucz `api/grid_source_preview.py` przemianowany (`request.cos_phi` ->
    # `zrodlo.cos_phi`) bez zmiany budzetu — jedna funkcja cosφ doboru kabla dla
    # podgladu i dokumentu DER-SN (dawne zaszyte 0,95 w dokumencie).
    # Integracja na HEAD 06e8ef79 (Pakiet L + docs) 2026-09-24: liczby ponizej z POMIARU
    # guardem na scalonym drzewie int/h0 (roznice L i AB-H0 sie sumuja).
    # Karta AB-1a Pakiet 0 (2026-09-23): 55/254 -> 55/253 — wpis ZASTANE
    # `enm/canonical_analysis.py` ("F:dictget:row.event_seq": 1, sortowanie wierszy sladu
    # automatyki) zdjety RAZEM z narracja zdarzen toru T1. Pomiar guardem.
    # Pakiet 0 (zlozenie na `1b422cdd`): 248 -> 247 — budzet `F:dictget:row.event_seq`
    # (`enm/canonical_analysis.py`) zdjety razem z narracja zdarzen toru T1.
    assert "Zapadka dlugu (fizyczne): 54 plikow, suma 247." in wyjscie, wyjscie
    assert "Wykluczenia skanera (niefizyczne): 13 plikow, suma 31." in wyjscie, wyjscie
    per_korzen = [
        # Karta S-2 AUTORYTET (2026-09-16): network_model 137 -> 141 (+4 nowe pliki
        # `network_model/core/{wklad_zwarciowy_przeksztaltnika,zdolnosci_wkladu_
        # zwarciowego,autorytet_wyniku_zwarciowego,wiazanie_wyniku_zwarciowego}.py`,
        # zero wpisow w zapadce/wykluczeniach z tych plikow).
        # Karta W5-D (2026-09-16): network_model 141 -> 142 (+1 `pochodne/skladowe_symetryczne.py`).
        # Karta W5-A (2026-09-16): network_model +2: `network_model/core/uziemienie.py`
        # — slowniki uziemienia, `network_model/pochodne/skladowe_zerowe.py` — Z_0 = Z_T0 + 3*Z_N;
        # zero wpisow w zapadce/wykluczeniach; na drzewie scalonym W5-D + W5-A pomiar = 144.
        # Karta KATALOG-NIEZMIENNIKI (2026-09-17): network_model 144 -> 145
        # (+1 `catalog/niezmienniki_katalogu.py`); dlug i wykluczenia BEZ ZMIAN —
        # modul rejestru regul nie podstawia zadnej liczby za brak danej.
        # Karta W6-2 (2026-09-17): network_model 145 -> 165 (+20 plikow pakietu
        # `solvers/dynamika/**`); dlug i wykluczenia BEZ ZMIAN. Pakiet UJAWNIL za to
        # jedno ZASTANE podstawienie w cudzym pliku: jego kontrakt `SkokObciazenia`
        # wnosi do mapy pol nazwy `delta_p_pu`/`delta_q_pu`, przez co bramka
        # zobaczyla `mismatch.get("delta_q_pu", 0.0)` w
        # `network_model/proof/power_flow_proof_builder.py`. To bylo REALNE
        # podstawienie: `power_flow_fast_decoupled` zapisuje dla wezla PV SAMO
        # `delta_p_pu` (wezel PV nie ma rownania mocy biernej), wiec dowod drukowal
        # `ΔQ = 0` jako wielkosc ZMIERZONA. Naprawione u zrodla (brakujaca skladowa
        # jest pomijana), nie dopisane do zapadki.
        # Karta W6-3A (2026-09-18): network_model 165 -> 175 (+10 plikow
        # `solvers/dynamika/urzadzenia/**`, biblioteka piecu rodzin urzadzen
        # dynamicznych); dlug i wykluczenia BEZ ZMIAN (14 plikow/suma 77,
        # 3 pliki/suma 6) — zaden z nowych plikow nie ma wpisu ani w zapadce,
        # ani w wykluczeniach.
        # Runda adwersarialna W6-A (2026-09-18): network_model 176 -> 177 (+1
        # `network_model/solvers/dynamika/waznosc.py` — straznik zakresu waznosci
        # modelu). Dlug 14/77 i wykluczenia 3/6 BEZ ZMIANY: modul nie podstawia
        # zadnej liczby, a jego margines porownania jest wyprowadzony z nastaw
        # solvera i ziarnistosci float64, nie z dobranej stalej.
        # Walidacja fizyczna dynamiki / naprawa F-8 (2026-09-20): network_model 177 -> 178
        # (+1 `network_model/solvers/dynamika/wyspy.py`). Dlug 14/77 i wykluczenia 3/6
        # BEZ ZMIANY — modul czyta wylacznie topologie i rownania urzadzen, nie
        # podstawia zadnej liczby za nieobecna dana wejsciowa.
        # Karta AB-1a Pakiet L (2026-09-23): network_model 178 -> 172 (-5 plikow
        # `network_model/proof/**`, -1 `network_model/catalog/drift_detection.py`),
        # dlug 14/77 -> 13/76 (wpis ZASTANE `power_flow_proof_builder.py` zdjety z plikiem).
        # Karta AB-H0 (2026-09-23): network_model 178 -> 180, enm 48 -> 50,
        # application 237 -> 239, api 62 -> 63 (pliki wymienione przy pinie
        # „Przeskanowano"); dlug i wykluczenia per korzen BEZ ZMIAN.
        # Decyzja O-53 (2026-09-24): network_model dlug 14/77 -> 13/72 (wpis
        # `solvers/der_selection_preview.py` zdjety, patrz pin zapadki globalnej).
        # Integracja na HEAD 06e8ef79 (Pakiet L + docs) 2026-09-24: liczby ponizej z POMIARU
        # guardem na scalonym drzewie int/h0 (roznice L i AB-H0 sie sumuja).
        # Karta AB-1a Pakiet C (2026-09-23): network_model 178 -> 179 (+1
        # `network_model/solvers/ncrfg_ptpiree/stosowalnosc.py` — jedna funkcja stosowalnosci
        # wymagania i testu); dlug 14/77 i wykluczenia 3/6 BEZ ZMIANY.
        # Karta AB-1b.1b (2026-09-24): network_model 175 -> 178 (+3: `dozory.py`,
        # `urzadzenia/czesciowe.py`, `urzadzenia/zrodlo_testowe.py`); dlug i wykluczenia BEZ ZMIAN.
        # Karta PASMO-1KV (2026-09-25): network_model 178 -> 179 (+1
        # `pochodne/pasma_napieciowe.py`); dlug i wykluczenia BEZ ZMIAN. POMIAR guardem.
        "  network_model: pliki_skanowane=179, dlug=12 plikow/suma 71, "
        "wykluczenia=3 plikow/suma 6",
        # Karta S-1/S-4 (W6-0): solver_input 10 -> 11 (+1 `dowod_ncrfg.py`, zero
        # dlugu/wykluczen — czysta interpretacja rejestru dowodowego, zero fizyki;
        # plik skasowany w karcie AB-1a Pakiet C — wpis nizej).
        # Karta W5-A (2026-09-16): solver_input 11 -> 12 (+1 `solver_input/uklad_sieci_nn.py` —
        # jedna funkcja mapujaca literal modelu -> enum solvera FROZEN; zero dlugu/wykluczen).
        # Karta AB-1a Pakiet C (2026-09-23): solver_input 12 -> 11 (-1 skasowany
        # `solver_input/dowod_ncrfg.py` — dowod zgodnosci NC RfG to rekordy `WynikWymagania`);
        # dlug 2/8 i wykluczenia 0/0 BEZ ZMIANY.
        "  solver_input: pliki_skanowane=11, dlug=2 plikow/suma 8, " "wykluczenia=0 plikow/suma 0",
        # Karta W5-D (2026-09-16): enm 41 -> 43 (+2 `fazy_odbioru.py`, `rozplyw_niesymetryczny_wynik.py`).
        # Karta W5-A (2026-09-16): enm +3 `enm/{grupa_polaczen,uziemienie,uklad_sieci_nn}.py`,
        # dlug 8/76 -> 7/73 (wpis `enm/zero_sequence_transformer.py` usuniety z zapadki, patrz wyzej);
        # na drzewie scalonym W5-D + W5-A pomiar = 46.
        # Karta W6-1 (2026-09-16): enm 46 -> 47 (+1 `enm/dynamika_modele.py`; zero
        # dlugu/wykluczen — czysty kontrakt Pydantic, brak zastepnikow liczbowych).
        # Karta W6-3B (2026-09-18): enm 47 -> 48 (+1 `enm/adapter_dynamiki.py`; zero
        # dlugu/wykluczen — adapter SKLADA i MAPUJE, kazdy brak danej konczy sie
        # nazwana odmowa, nie liczba podstawiona za brak).
        # Decyzja O-53 (2026-09-23): enm dlug 7/73 -> 7/72 (wpis H:local:payload.quantity
        # zdjety, patrz pin zapadki globalnej wyzej).
        # Karta AB-1a Pakiet C (2026-09-23): enm 48 -> 49 (+1 `enm/nastawy_modulu.py` —
        # kontrakt nastaw zabezpieczen modulu ze zrodlem; brak nastaw = `None`, kryteria
        # koordynacji daja NIE_OCENIONO z nazwanym brakiem); dlug/wykluczenia BEZ ZMIANY.
        # Uzupelnienie odbioru Pakietu C (§0 pkt 7-9): enm 49 -> 50 (+1
        # `enm/deklaracje_modulu.py`); dlug/wykluczenia BEZ ZMIANY.
        # Karta AB-1a Pakiet 0 (2026-09-23): enm dlug 7/73 -> 7/72 (wpis `row.event_seq`
        # w `enm/canonical_analysis.py` zdjety razem z narracja zdarzen toru T1).
        # Partia integracji 2 (2026-09-25): enm 52 -> 54 (`rola_pola_sn.py` — #141,
        # `slownik_komunikatow.py` — #142); dlug/wykluczenia BEZ ZMIANY.
        # Partia integracji 3 (2026-09-25): enm 54 -> 55 (`nazwy_elementow.py` — karta #144);
        # dlug/wykluczenia BEZ ZMIANY. POMIAR guardem na `103963a2`.
        # MAGISTRALA-OCENA (pomiar na drzewie karty): enm 52 -> 54 (`enm/rola_pola_sn.py`
        # karta #141, `enm/slownik_komunikatow.py` karta #142 — scalone przed baza bez pinu).
        "  enm: pliki_skanowane=55, dlug=7 plikow/suma 71, wykluczenia=0 plikow/suma 0",
        # B-02 / W3-E (2026-09-10): application 234 -> 236 (+2 moduly gotowosci/katalogu V12.6).
        # Odbior fali 3 W3 (2026-09-10): application 236 -> 229 plikow (-8 TRACE-V2, +1 W3-G1),
        # dlug 31/93 -> 30/91 (protection_emitter.py skasowany razem z wpisem zapadki).
        # Karta V12.7 (2026-09-16): application 229 -> 230 (+1 v126_wzory.py, patrz uzasadnienie
        # wyzej); dlug/wykluczenia application bez zmian (30/91, 4/10) — nowy plik nie ma
        # zadnej galezi zapasowej liczbowej.
        # Karta S-2 AUTORYTET (2026-09-16): application 229 -> 230 (+1 nowy plik
        # `application/autorytet_biegu_zwarciowego.py`, zero wpisow w zapadce/wykluczeniach).
        # Odbior S-2 na jednym drzewie (2026-09-16): application 230 (V12.7) + 1 (S-2) = 231 (pomiar guardem).
        # Karta W6-1 (2026-09-16): application 231 -> 233 (+2 `application/contracts/
        # {__init__,resultset_dynamic_v1}.py`; zero dlugu/wykluczen — kontrakt wyniku,
        # zero zastepnikow liczbowych).
        # Karta SZABLONY-ROLA-A (V12T-016, 2026-09-17): application 233 -> 238 (+5
        # `application/station_templates/templates/{gpz_110_sn,rozdzielnia_sieciowa,
        # stacja_abonencka,kompensacja,rezerwa_zasilania}.py`; dlug/wykluczenia bez
        # zmian — nowe pliki definiuja wylacznie instancje StationTemplate z opcji
        # CatalogChoice, zero zastepnikow liczbowych).
        # Karta KASACJA-UNIEWAZNIACZA (2026-09-17): application 238 -> 237 (-1
        # `application/analysis_run/result_invalidator.py`, skasowany martwy
        # uniewazniacz wynikow; dlug/wykluczenia bez zmian — ten plik nie mial
        # ani jednego wpisu w zapadce ani w wykluczeniach, wiec ubyl tylko z
        # licznika skanu).
        # Karta AB-1a Pakiet L (2026-09-23): application 237 -> 235 (-1
        # `application/proof_engine/packs/qu_regulation.py`, -1
        # `application/reference_patterns/reporting.py`; zaden nie mial wpisu w
        # zapadce ani w wykluczeniach).
        # Integracja na HEAD 06e8ef79 (Pakiet L + docs) 2026-09-24: liczby ponizej z POMIARU
        # guardem na scalonym drzewie int/h0 (roznice L i AB-H0 sie sumuja).
        # Karta AB-1b.1a (2026-09-23): application 235 -> 236 (+1
        # `protection_settings/zacisk_zabezpieczenia.py`; kontrakt dynamiki v1 -> v2 1:1;
        # zadnego wpisu w zapadce ani w wykluczeniach).
        # Karta AB-1a Pakiet C (2026-09-23): application 237 -> 238 (+2 `application/
        # ncrfg_compliance/ocena_wymagan.py`, `application/analyses/sekcja_zgodnosci_ncrfg.py`;
        # -1 skasowany `application/analyses/dowod_certyfikatu.py`); dlug 30/91 i
        # wykluczenia 4/10 BEZ ZMIANY.
        # Karta AB-1a Pakiet 0 (2026-09-23): application 235 -> 236 (+1
        # `application/ocena_niewykonana.py`; zero wpisow w zapadce i wykluczeniach).
        # Karta AB-1a Pakiet E2 (2026-09-24): application 240 -> 239 (-1 skasowany
        # `application/analyses/run_index.py`; plik nie mial wpisu w zapadce ani w
        # wykluczeniach, wiec ubyl tylko z licznika skanu).
        # Partia integracji 3 (2026-09-25): application 239 -> 240 (`nazwy_biegu.py` — karta
        # #144); dlug 30/91 i wykluczenia 4/10 BEZ ZMIANY. POMIAR guardem na `103963a2`.
        # MAGISTRALA-OCENA: application 239 -> 240 (`application/analyses/
        # ocena_doboru_magistrali.py`).
        # Integracja MAGISTRALA-OCENA na partii 3: application 240 -> 241
        # (`ocena_doboru_magistrali.py`); dlug/wykluczenia BEZ ZMIANY.
        "  application: pliki_skanowane=241, dlug=30 plikow/suma 91, "
        "wykluczenia=4 plikow/suma 10",
        "  api: pliki_skanowane=63, dlug=3 plikow/suma 6, wykluczenia=6 plikow/suma 15",
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
    for pole in (
        "cos_phi",
        "voltage_level",
        "voltage_magnitude",
        "voltage_angle",
        "un_kv",
    ):
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
