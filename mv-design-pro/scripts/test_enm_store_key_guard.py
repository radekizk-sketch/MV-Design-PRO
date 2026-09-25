"""Testy bramki `enm_store_key_guard` (karta CV-1-G, 2026-09-04).

INTENCJA. Magazyn ENM (`enm/store.py`) jest kluczowany kluczem Canonical
Project Twin (`docs/architecture/CANONICAL_TWIN_ARCHITECTURE.md` §A.2); `case_id`
jest tylko adresem wejsciowym API, tlumaczonym na klucz projektu w JEDNYM
miejscu (`application/twin_key.py::klucz_twin_dla_przypadku`). Ta bramka
pilnuje, zeby warstwa API/aplikacji nie wolala magazynu surowym `case_id`
(zapadka na dlug migracji stranglerowej, ktory ma MALEC do zera, nigdy
rosnac po cichu).

Testy sprawdzaja rzeczy naraz - tak jak testy bramki, ktorej wzorzec
reuzywamy (`test_solver_input_substitute_guard.py`):
  * bramka GRYZIE we wszystkich trzech formach argumentu (`name`, `attr`,
    `str`), przez wszystkie rozpoznawane drogi importu (bezposredni alias,
    modul `store.X`, REEKSPORT przez trzeci plik);
  * bramka NIE gryzie na drodze PRZEZ tlumacza (wywolanie wprost albo
    zmienna nazwana "klucz") ani na argumencie niezwiazanym z przypadkiem;
  * `application/twin_key.py` jest POZA zakresem (to jedyne miejsce, gdzie
    surowy `case_id` jest legalnym wejsciem);
  * zapadka dziala W OBIE STRONY (nadwyzka i niedobor sa czerwone);
  * PUSTY SKAN i brak korzenia to RC=1, nigdy RC=0;
  * skan PRAWDZIWEGO repozytorium daje dokladnie zmierzone liczby.

Kod wyjscia odbierany zawsze bezposrednio (`main()`), nigdy przez potok.
"""

from __future__ import annotations

from pathlib import Path

import enm_store_key_guard as guard


def _drzewo(tmp_path: Path, pliki: dict[str, str]) -> Path:
    """Zbuduj sztuczne drzewo `backend/src` z podanymi plikami.

    Korzenie skanowania sa brane Z BRAMKI (`guard.SCAN_ROOTS`), a nie
    wypisane tutaj recznie - rozszerzenie zakresu nie moze wywrocic kazdy
    test naraz na bledzie "korzen nie istnieje" (ta sama zasada, co w
    `test_solver_input_substitute_guard.py::_drzewo`).
    """
    root = tmp_path / "src"
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
    tmp_path: Path,
    monkeypatch,
    capsys,
    pliki: dict[str, str],
    zapadka: dict[str, int] | None = None,
) -> tuple[int, str]:
    root = _drzewo(tmp_path, pliki)
    monkeypatch.setattr(guard, "BACKEND_SRC", root)
    monkeypatch.setattr(guard, "ZASTANE_KLUCZE_PRZYPADKU", zapadka or {})
    kod = guard.main()
    return kod, capsys.readouterr().out


# ---------------------------------------------------------------------------
# BRAMKA GRYZIE - trzy formy argumentu (a, d)
# ---------------------------------------------------------------------------


def test_forma_name_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """Dokladnie forma z karty: `get_enm(case_id)` surowym identyfikatorem."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "api/most.py": (
                "from enm.store import get_enm\n\n\n"
                "def wczytaj(case_id):\n"
                "    return get_enm(case_id)\n"
            )
        },
    )
    assert kod == 1, wyjscie
    assert "get_enm:name:case_id" in wyjscie


def test_forma_attr_jest_wykrywana(tmp_path, monkeypatch, capsys) -> None:
    """`get_enm(payload.case_id)` - atrybut, nie goly identyfikator."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "api/most.py": (
                "from enm.store import get_enm\n\n\n"
                "def wczytaj(payload):\n"
                "    return get_enm(payload.case_id)\n"
            )
        },
    )
    assert kod == 1, wyjscie
    assert "get_enm:attr:payload.case_id" in wyjscie


def test_forma_str_jest_wykrywana(tmp_path, monkeypatch, capsys) -> None:
    """`restore_enm(str(new_case_id), ...)` - `str(...)` wokol identyfikatora."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "application/most.py": (
                "from enm.store import restore_enm\n\n\n"
                "def przywroc(new_case_id, snapshot):\n"
                "    return restore_enm(str(new_case_id), snapshot)\n"
            )
        },
    )
    assert kod == 1, wyjscie
    assert "restore_enm:str:new_case_id" in wyjscie


def test_forma_str_wokol_atrybutu_jest_wykrywana(tmp_path, monkeypatch, capsys) -> None:
    """`get_enm(str(scenario.study_case_id))` - `str(...)` wokol ATRYBUTU (nie Name)."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "api/most.py": (
                "from enm.store import get_enm\n\n\n"
                "def wczytaj(scenario):\n"
                "    return get_enm(str(scenario.study_case_id))\n"
            )
        },
    )
    assert kod == 1, wyjscie
    assert "get_enm:str:scenario.study_case_id" in wyjscie


# ---------------------------------------------------------------------------
# DROGI IMPORTU - alias (c) i modul `store.X`
# ---------------------------------------------------------------------------


def test_alias_importu_z_podkresleniem_jest_wykrywany(tmp_path, monkeypatch, capsys) -> None:
    """`from enm.store import get_enm as _get_enm` - alias NIE maskuje naruszenia."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "api/most.py": (
                "from enm.store import get_enm as _get_enm\n\n\n"
                "def wczytaj(case_id):\n"
                "    return _get_enm(case_id)\n"
            )
        },
    )
    assert kod == 1, wyjscie
    # Sygnatura niesie KANONICZNA nazwe funkcji, nie lokalny alias.
    assert "get_enm:name:case_id" in wyjscie
    assert "_get_enm" not in wyjscie.split("znaleziono")[1].split("(")[0]


def test_wiele_aliasow_w_jednym_imporcie_jest_wykrywane(tmp_path, monkeypatch, capsys) -> None:
    """`from enm.store import get_enm as _get_enm, has_enm as _has_enm` - oba aliasy."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "api/most.py": (
                "from enm.store import get_enm as _get_enm, has_enm as _has_enm\n\n\n"
                "def wczytaj(case_id):\n"
                "    if _has_enm(case_id):\n"
                "        return _get_enm(case_id)\n"
                "    return None\n"
            )
        },
    )
    assert kod == 1, wyjscie
    assert "get_enm:name:case_id" in wyjscie
    assert "has_enm:name:case_id" in wyjscie


def test_forma_modulu_store_x_jest_wykrywana(tmp_path, monkeypatch, capsys) -> None:
    """`from enm import store` + `store.get_enm(case_id)` - druga droga importu."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "api/most.py": (
                "from enm import store\n\n\n"
                "def wczytaj(case_id):\n"
                "    return store.get_enm(case_id)\n"
            )
        },
    )
    assert kod == 1, wyjscie
    assert "get_enm:name:case_id" in wyjscie


def test_import_modulu_enm_store_as_x_jest_wykrywany(tmp_path, monkeypatch, capsys) -> None:
    """`import enm.store as magazyn` - trzecia, rzadsza forma importu modulu."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "api/most.py": (
                "import enm.store as magazyn\n\n\n"
                "def wczytaj(case_id):\n"
                "    return magazyn.get_enm(case_id)\n"
            )
        },
    )
    assert kod == 1, wyjscie
    assert "get_enm:name:case_id" in wyjscie


# ---------------------------------------------------------------------------
# REEKSPORT PRZEZ TRZECI PLIK - ta sama klasa, co realny
# `application/station_templates/apply.py` (wlasny pomiar przy pisaniu karty)
# ---------------------------------------------------------------------------


def test_reeksport_tranzytywny_przez_trzeci_plik_jest_wykrywany(
    tmp_path, monkeypatch, capsys
) -> None:
    """Pierwsza wersja bramki widziala WYLACZNIE import BEZPOSREDNI z `enm.store`
    i milczala dokladnie na tym wzorcu na prawdziwym repo: `api/enm.py`
    importuje `get_enm` z `enm.store` pod aliasem `_get_enm`, a
    `application/station_templates/apply.py` importuje TEN ALIAS z `api.enm`
    (lokalnie, wewnatrz funkcji, zeby uniknac cyklu importow) i wola go
    surowym `case_id`. Ten test odtwarza dokladnie ten ksztalt na minimalnym
    drzewie.
    """
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "api/most.py": (
                "from enm.store import get_enm as _get_enm\n\n\n"
                "def nieuzywana() -> None:\n"
                "    return None\n"
            ),
            "application/daleko.py": (
                "def wczytaj(case_id):\n"
                "    from api.most import _get_enm\n\n"
                "    return _get_enm(case_id)\n"
            ),
        },
    )
    assert kod == 1, wyjscie
    assert "application/daleko.py" in wyjscie
    assert "get_enm:name:case_id" in wyjscie
    # Kontrola: plik-most SAM nie ma naruszenia (nie wola magazynu case_id) -
    # test mierzy REEKSPORT, nie przypadkowe drugie trafienie.
    assert "api/most.py" not in wyjscie


def test_cykl_importow_nie_gubi_naruszenia(tmp_path, monkeypatch, capsys) -> None:
    """Dwa pliki importujace sie NAWZAJEM (mozliwe STATYCZNIE nawet gdy import
    jest lokalny w funkcji wlasnie po to, zeby uniknac cyklu w RUNTIME - patrz
    `application/station_templates/apply.py` na prawdziwym repo). Naprawa
    wlasna przy pisaniu tej karty: pierwsza wersja cache'owala eksport
    policzony W TRAKCIE cyklu, wiec plik odwiedzony jako zaleznosc PIERWSZY
    zamrazal sie w cache jako PUSTY i tracil swoje wlasne naruszenie - cicha
    dziura. Oba pliki musza zostac wykryte, niezaleznie od kolejnosci skanu.
    """
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "api/a.py": (
                "from enm.store import get_enm as _get_enm\n\n\n"
                "def f(case_id):\n"
                "    from api.b import cos\n"
                "    return _get_enm(case_id)\n"
            ),
            "api/b.py": (
                "def cos(case_id):\n"
                "    from api.a import _get_enm\n"
                "    return _get_enm(case_id)\n"
            ),
        },
    )
    assert kod == 1, wyjscie
    assert "api/a.py" in wyjscie
    assert "api/b.py" in wyjscie
    assert wyjscie.count("get_enm:name:case_id") == 2, wyjscie


def test_zaslonieta_lokalna_nazwa_mostu_nie_zawiesza_bramki(tmp_path, monkeypatch, capsys) -> None:
    """Ta sama lokalna nazwa importowana DWUKROTNIE z DWOCH mostow w JEDNYM
    pliku (rzadkie przeslanianie) - wlasna naprawa przy pisaniu tej karty.

    Punkt staly liczacy eksport ITERACYJNIE moze OSCYLOWAC W NIESKONCZONOSC,
    gdy dwie sprzeczne krawedzie tej samej lokalnej nazwy na przemian
    nadpisuja sie w kolejnych przebiegach - warunek zakonczenia petli
    (`zaden przebieg nic nie dodal`) nigdy by sie nie ziscil. Test dowodzi
    DWOCH rzeczy naraz: bramka KONCZY DZIALANIE (nie zawiesza CI), a wynik
    odpowiada DRUGIEJ (pozniejszej w pliku) instrukcji importu - dokladnie
    tak, jak zachowuje sie prawdziwy Python (druga instrukcja podmienia
    zwiazanie pierwszej).
    """
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "api/src1.py": (
                "from enm.store import get_enm as _y\n\n\n" "def a() -> None:\n    return None\n"
            ),
            "api/src2.py": (
                "from enm.store import set_enm as _y\n\n\n" "def b() -> None:\n    return None\n"
            ),
            "application/shadow.py": (
                "def wczytaj(case_id):\n"
                "    from api.src1 import _y as _x\n"
                "    from api.src2 import _y as _x\n"
                "    return _x(case_id)\n"
            ),
        },
    )
    assert kod == 1, wyjscie
    assert "set_enm:name:case_id" in wyjscie
    assert "get_enm:name:case_id" not in wyjscie


# ---------------------------------------------------------------------------
# WYJATEK - DROGA PRZEZ TLUMACZA (b)
# ---------------------------------------------------------------------------


def test_argument_ze_zmiennej_klucz_nie_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """`klucz = klucz_twin_dla_przypadku(case_id, uow); get_enm(klucz)` - droga
    PRZEZ tlumacza, dokladnie tak, jak ma wygladac naprawiony wywolujacy."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "application/most.py": (
                "from enm.store import get_enm\n"
                "from application.twin_key import klucz_twin_dla_przypadku\n\n\n"
                "def wczytaj(case_id, uow):\n"
                "    klucz = klucz_twin_dla_przypadku(case_id, uow)\n"
                "    return get_enm(klucz)\n"
            )
        },
    )
    assert kod == 0, wyjscie


def test_wywolanie_tlumacza_wprost_jako_argument_nie_jest_naruszeniem(
    tmp_path, monkeypatch, capsys
) -> None:
    """`get_enm(klucz_twin_dla_przypadku(case_id, uow))` - tlumacz wywolany
    WPROST w miejscu argumentu, bez posredniej zmiennej."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "application/most.py": (
                "from enm.store import get_enm\n"
                "from application.twin_key import klucz_twin_dla_przypadku\n\n\n"
                "def wczytaj(case_id, uow):\n"
                "    return get_enm(klucz_twin_dla_przypadku(case_id, uow))\n"
            )
        },
    )
    assert kod == 0, wyjscie


def test_argument_z_klucz_twin_dla_projektu_nie_jest_naruszeniem(
    tmp_path, monkeypatch, capsys
) -> None:
    """`klucz_twin_dla_projektu(project_id, uow_factory)` - tlumacz adresu PROJEKTU.

    KOREKTA KANONU (przeglad adwersaryjny CV-1). Wczesniej ten test stal na
    `klucz_twin_projektu` - czystej funkcji klucza, ktora NIE uruchamia migracji
    zastanych plikow per przypadek i wlasnie dlatego zostala objeta REGULA 2.
    Intencja testu jest bez zmian: droga PRZEZ TLUMACZA nie moze byc karana; to
    tlumacz adresu projektu zmienil nazwe na taki, ktory faktycznie migruje.
    """
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "application/most.py": (
                "from enm.store import get_enm\n"
                "from application.twin_key import klucz_twin_dla_projektu\n\n\n"
                "def wczytaj(project_id, uow_factory):\n"
                "    return get_enm(klucz_twin_dla_projektu(project_id, uow_factory))\n"
            )
        },
    )
    assert kod == 0, wyjscie


# ---------------------------------------------------------------------------
# REGULA 2 - czysty klucz projektu poza tlumaczem
# ---------------------------------------------------------------------------


def test_import_klucz_twin_projektu_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """`from enm.klucz_twin import klucz_twin_projektu` w warstwie API/aplikacji.

    Zmierzony defekt: sciezki adresowane projektem (dispatch nN, eksport archiwum)
    budowaly tak klucz i omijaly migracje plikow zastanych - w swiezym procesie
    `get_enm` fabrykowal PUSTY model domyslny, a `has_enm` oddawal `False`
    (archiwum ZIP bez sieci).
    """
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "application/dispatch.py": (
                "from enm.klucz_twin import klucz_twin_projektu\n"
                "from enm.store import get_enm\n\n\n"
                "def wczytaj(project_id):\n"
                "    return get_enm(klucz_twin_projektu(project_id))\n"
            )
        },
    )
    assert kod == 1, wyjscie
    assert "import:klucz_twin_projektu" in wyjscie
    assert "NIE uruchamia migracji" in wyjscie


def test_alias_importu_klucza_projektu_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """Alias nie chowa uzycia - liczy sie NAZWA IMPORTOWANA, nie lokalna."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "api/most.py": (
                "from enm.klucz_twin import klucz_twin_projektu as _klucz\n\n\n"
                "def klucz_projektu(project_id):\n"
                "    return _klucz(project_id)\n"
            )
        },
    )
    assert kod == 1, wyjscie
    assert "import:_klucz" in wyjscie


def test_droga_przez_modul_klucza_projektu_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """`from enm import klucz_twin` + `klucz_twin.klucz_twin_projektu(...)`.

    Druga droga importu tej samej funkcji - bez niej regula lapalaby wylacznie
    forme, ktora ktos akurat przewidzial (regula KLASA-NIE-INSTANCJA, punkt 2).
    """
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "application/most.py": (
                "from enm import klucz_twin\n\n\n"
                "def klucz_projektu(project_id):\n"
                "    return klucz_twin.klucz_twin_projektu(project_id)\n"
            )
        },
    )
    assert kod == 1, wyjscie
    assert "modul:klucz_twin.klucz_twin_projektu" in wyjscie


def test_wzmianka_o_kluczu_projektu_w_komentarzu_nie_jest_naruszeniem(
    tmp_path, monkeypatch, capsys
) -> None:
    """Skan idzie po AST, nie po tekscie - docstring i komentarz sa wolne.

    Kontrola dodatnia dla REGULY 2: bez niej bramka karalaby KAZDY plik, ktory
    tlumaczy w komentarzu, dlaczego NIE uzywa tej funkcji - czyli dokladnie te,
    ktore robia to poprawnie.
    """
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "application/most.py": (
                '"""Klucz projektu wyprowadza `klucz_twin_projektu` - patrz twin_key."""\n\n'
                "# klucz_twin_projektu(project_id) bylby tu naruszeniem REGULY 2\n"
                "def f(x):\n"
                "    return x\n"
            )
        },
    )
    assert kod == 0, wyjscie


def test_argument_bez_case_i_bez_klucz_nie_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """Identyfikator, ktory nie zawiera ani "case", ani "klucz" - poza regula.

    Kontrola dyskryminatora: bramka nie ma karac KAZDEGO argumentu, tylko
    ten faktycznie kojarzacy sie z adresem przypadku.
    """
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "api/most.py": (
                "from enm.store import get_enm\n\n\n"
                "def wczytaj(project_ref):\n"
                "    return get_enm(project_ref)\n"
            )
        },
    )
    assert kod == 0, wyjscie


def test_galaz_none_i_string_nie_sa_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """Wywolanie funkcji spoza magazynu i argument-stala nie sa w zakresie bramki."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "api/most.py": (
                "from enm.store import get_enm\n\n\n"
                "def inna_funkcja(case_id):\n"
                "    return len(case_id)\n\n\n"
                "def wczytaj():\n"
                '    return get_enm("projekt:00000000-0000-0000-0000-000000000000")\n'
            )
        },
    )
    assert kod == 0, wyjscie


# ---------------------------------------------------------------------------
# `application/twin_key.py` JEST POZA ZAKRESEM
# ---------------------------------------------------------------------------


def test_wylaczony_plik_tlumacza_nie_jest_skanowany(tmp_path, monkeypatch, capsys) -> None:
    """`application/twin_key.py` jest JEDYNYM miejscem tlumaczenia - poza regula
    nawet gdyby (hipotetycznie) wolal magazyn surowym case_id."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "application/twin_key.py": (
                "from enm.store import get_enm\n\n\n"
                "def klucz_twin_dla_przypadku(case_id, uow):\n"
                "    return get_enm(case_id)\n"
            )
        },
    )
    assert kod == 0, wyjscie


def test_definicja_klucza_projektu_jest_poza_zakresem(tmp_path, monkeypatch, capsys) -> None:
    """`enm/klucz_twin.py` DEFINIUJE `klucz_twin_projektu` - nie moze byc karany
    REGULA 2 za wystapienie funkcji, ktora sam tworzy."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "enm/klucz_twin.py": (
                "PREFIKS_PROJEKTU = 'projekt:'\n\n\n"
                "def klucz_twin_projektu(project_id):\n"
                "    return f'{PREFIKS_PROJEKTU}{project_id}'\n"
            )
        },
    )
    assert kod == 0, wyjscie


def test_zakres_skanu_obejmuje_warstwe_enm() -> None:
    """`enm/**` NALEZY do zakresu (rozszerzenie 2026-09-05).

    To tam mieszka magazyn i definicja klucza, i to tam `enm/canonical_analysis.py`
    wola `get_enm`. Ciche zwezenie zakresu z powrotem do dwoch warstw wylaczyloby
    REGULE 2 dokladnie w miejscu, w ktorym klucz jest najlatwiej zbudowac na miejscu.
    """
    assert "enm" in guard.SCAN_ROOTS
    assert "enm/klucz_twin.py" in guard.WYLACZONE_PLIKI


# ---------------------------------------------------------------------------
# ZAPADKA - w OBIE strony (e)
# ---------------------------------------------------------------------------


def test_zapadka_przepuszcza_zastany_budzet(tmp_path, monkeypatch, capsys) -> None:
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "api/zastany.py": (
                "from enm.store import get_enm\n\n\n"
                "def wczytaj(case_id):\n"
                "    return get_enm(case_id)\n"
            )
        },
        zapadka={"api/zastany.py": 1},
    )
    assert kod == 0, wyjscie


def test_nadwyzka_ponad_budzet_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """NOWE uzycie surowego case_id w pliku Z ZAPADKI zapala bramke tak samo,
    jak poza nia - inaczej zapadka moglaby cicho rosnac."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {
            "api/zastany.py": (
                "from enm.store import get_enm\n\n\n"
                "def wczytaj(case_id, other_case_id):\n"
                "    a = get_enm(case_id)\n"
                "    b = get_enm(other_case_id)\n"
                "    return a, b\n"
            )
        },
        zapadka={"api/zastany.py": 1},
    )
    assert kod == 1, wyjscie
    assert "budzet 1, znaleziono 2" in wyjscie


def test_niedobor_wobec_budzetu_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """Zapadka dziala W OBIE STRONY - plik juz naprawiony musi obnizyc budzet,
    inaczej poprawa nie zostaje utrwalona (dokladnie jak w
    `solver_input_substitute_guard.py`)."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {"api/naprawiony.py": "def wczytaj():\n    return 1\n"},
        zapadka={"api/naprawiony.py": 1},
    )
    assert kod == 1, wyjscie
    assert "budzet 1, znaleziono 0" in wyjscie
    assert "obniz budzet" in wyjscie


def test_martwy_wpis_zapadki_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """Wpis wskazujacy plik, ktorego nie ma, to martwy budzet - rejestr moze
    tylko malec."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {"api/istniejacy.py": "def f():\n    return 1\n"},
        zapadka={"api/zniknal.py": 1},
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
    (root / "api").mkdir(parents=True)
    monkeypatch.setattr(guard, "BACKEND_SRC", root)
    monkeypatch.setattr(guard, "ZASTANE_KLUCZE_PRZYPADKU", {})
    assert guard.main() == 1
    assert "korzen skanowania 'application' nie istnieje" in capsys.readouterr().out


def test_pusty_skan_jest_bledem(tmp_path, monkeypatch, capsys) -> None:
    root = tmp_path / "src"
    for korzen in guard.SCAN_ROOTS:
        (root / korzen).mkdir(parents=True)
    monkeypatch.setattr(guard, "BACKEND_SRC", root)
    monkeypatch.setattr(guard, "ZASTANE_KLUCZE_PRZYPADKU", {})
    assert guard.main() == 1
    assert "PUSTY SKAN" in capsys.readouterr().out


def test_czysty_zakres_daje_zielen(tmp_path, monkeypatch, capsys) -> None:
    """Kontrola dodatnia: bramka nie jest zawsze czerwona."""
    kod, wyjscie = _uruchom(
        tmp_path,
        monkeypatch,
        capsys,
        {"api/czysty.py": "def f(x):\n    return x * 2\n"},
    )
    assert kod == 0, wyjscie
    assert "PASS" in wyjscie


# ---------------------------------------------------------------------------
# STAN RZECZYWISTEGO REPOZYTORIUM (f)
# ---------------------------------------------------------------------------


def test_biezacy_stan_repozytorium_jest_zielony(capsys) -> None:
    """Bramka na PRAWDZIWYM drzewie repo - budzet odpowiada pomiarowi z
    2026-09-05 (przeglad adwersaryjny CV-1), nie zyczeniu. Pinuje TEZ dokladna
    sume plikow i wywolan, zeby cichy dryf zapadki (np. literowka w liczbie przy
    recznej edycji, ktora przypadkiem nadal "zgadza sie" per-plik) nie schowal
    sie za RC=0 z innego powodu.

    HISTORIA LICZBY: 18 plikow / suma 74 to pomiar sprzed karty CV-1-W, ktora
    przepisala konsumentow na klucz projektu, ale zapadki NIE obnizyla - guard
    byl przez to CZERWONY na HEAD ("Dlug ZMALAL") we wszystkich 18 plikach.
    Zostal JEDEN zapis tymczasowy pod kluczem przypadku, w imporcie archiwum.
    """
    assert guard.main() == 0
    wyjscie = capsys.readouterr().out
    assert "zapadka: 1 plikow, suma 1" in wyjscie


def test_zapadka_wskazuje_wylacznie_pliki_pod_scan_roots() -> None:
    """Kazdy wpis zapadki lezy pod `api/` albo `application/` - zapadka na plik
    spoza zakresu skanu bylaby martwym budzetem (nigdy nie porownanym)."""
    for rel in guard.ZASTANE_KLUCZE_PRZYPADKU:
        assert rel.startswith(("api/", "application/")), rel


def test_zapadka_nie_zawiera_wylaczonego_pliku_tlumacza() -> None:
    """`application/twin_key.py` jest POZA regula z definicji - wpis zapadki
    dla niego bylby bezprzedmiotowy (nigdy nie porownany, bo plik nie jest
    skanowany)."""
    assert "application/twin_key.py" not in guard.ZASTANE_KLUCZE_PRZYPADKU
