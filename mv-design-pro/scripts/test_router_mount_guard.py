"""Testy guardu montazu routerow (karta ROUTERY-MARTWE).

Testy sa IZOLOWANE od repozytorium: buduja SYNTETYCZNE drzewo `backend/src/api/**`
w `tmp_path` i sprawdzaja SAMA REGULE, a nie biezacy stan kodu. Dzieki temu
przypadki, ktorych w repozytorium dzis nie ma (router zagniezdzony, montaz
warunkowy, druga aplikacja FastAPI), sa przecwiczone ZANIM ktos ich uzyje.

POKRYCIE — ILOCZYN CECH, nie przyklad z karty
---------------------------------------------
{prefiks · brak prefiksu · kilka routerow w pliku · nazwa inna niz `router` ·
 deklaracja z anotacja typu}
  x {montaz bezposredni · przez reeksport · przez router pochodny · zagniezdzony ·
     brak montazu}
  x {na liscie odstawionych · poza lista}

KOMBINACJE SWIADOMIE NIEPOKRYTE (i dlaczego):
  * {router pochodny} x {na liscie odstawionych} — router pochodny powstaje po to,
    zeby go zamontowac (kopiuje trasy bazowego, odejmujac wylaczone). Odstawiony
    router pochodny nie ma sensu konstrukcyjnego; gdyby powstal, zlapie go regula
    ogolna `[router-niezamontowany]` na jego zmiennej BAZOWEJ, ktora tez jest
    APIRouterem — a to jest pokryte.
  * {router zbudowany dynamicznie} x {brak montazu} — NIEWYKRYWALNE i tak
    zadeklarowane w naglowku guarda; test `test_router_dynamiczny_niezamontowany_
    jest_niewidoczny` PRZYPINA te granice, zeby nikt nie uwierzyl w szersza
    obietnice.
  * {kilka aplikacji FastAPI} x {cokolwiek} — sprawdzane osobno w
    `check_premises`, bo uniewaznia caly pomiar, a nie pojedynczy router.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Guard i jego test leza w `scripts/`, ktory nie jest pakietem. Przy uruchomieniu
# RAZEM z suita backendu pytest nie doklada tego katalogu do `sys.path`.
sys.path.insert(0, str(Path(__file__).resolve().parent))

import router_mount_guard as guard  # noqa: E402

APIROUTER_IMPORT = "from fastapi import APIRouter\n"


def _drzewo(tmp_path: Path, moduly: dict[str, str], main: str) -> tuple[Path, Path]:
    """Syntetyczne `backend/src/api/**` + `main.py`. Zwraca (api_dir, main_path)."""
    api_dir = tmp_path / "backend" / "src" / "api"
    api_dir.mkdir(parents=True)
    for nazwa, tresc in moduly.items():
        plik = api_dir / f"{nazwa}.py"
        plik.parent.mkdir(parents=True, exist_ok=True)
        plik.write_text(APIROUTER_IMPORT + tresc, encoding="utf-8")
    main_path = api_dir / "main.py"
    main_path.write_text("from fastapi import FastAPI\napp = FastAPI()\n" + main, encoding="utf-8")
    return api_dir, main_path


def _bez_zapadek(monkeypatch, budzet: int = 0) -> None:
    monkeypatch.setattr(guard, "MIN_MODULOW_Z_ROUTEREM", 0)
    monkeypatch.setattr(guard, "BUDZET_ODSTAWIONYCH_TRAS", budzet)
    monkeypatch.setattr(guard, "SWIADOMIE_ODSTAWIONE", {})


def _trasa(router: str = "router", sciezka: str = "/x", metoda: str = "get") -> str:
    return f'@{router}.{metoda}("{sciezka}")\ndef _h{abs(hash(sciezka)) % 9999}(): ...\n'


# ---------------------------------------------------------------------------
# REGULA 1 — router zamontowany przechodzi (kazda forma montazu)
# ---------------------------------------------------------------------------


def test_router_z_prefiksem_zamontowany_bezposrednio_przechodzi(monkeypatch, tmp_path) -> None:
    _bez_zapadek(monkeypatch)
    api_dir, main_path = _drzewo(
        tmp_path,
        {"a": 'router = APIRouter(prefix="/a")\n' + _trasa()},
        "from api.a import router as a_router\napp.include_router(a_router)\n",
    )

    assert guard.check_router_mounts(api_dir, main_path) == []


def test_router_bez_prefiksu_zamontowany_przechodzi(monkeypatch, tmp_path) -> None:
    _bez_zapadek(monkeypatch)
    api_dir, main_path = _drzewo(
        tmp_path,
        {"a": "router = APIRouter()\n" + _trasa()},
        "from api.a import router as a_router\napp.include_router(a_router)\n",
    )

    assert guard.check_router_mounts(api_dir, main_path) == []


def test_router_o_innej_nazwie_zamontowany_przechodzi(monkeypatch, tmp_path) -> None:
    """Nazwa zmiennej NIE jest kontraktem — kontraktem jest `include_router`."""
    _bez_zapadek(monkeypatch)
    api_dir, main_path = _drzewo(
        tmp_path,
        {"a": 'trasy_pola = APIRouter(prefix="/a")\n' + _trasa("trasy_pola")},
        "from api.a import trasy_pola\napp.include_router(trasy_pola)\n",
    )

    assert guard.check_router_mounts(api_dir, main_path) == []


def test_router_zamontowany_przez_reeksport_przechodzi(monkeypatch, tmp_path) -> None:
    """Lancuch `main -> shim -> modul tworzacy router` (wzor `protection_analysis_runs`)."""
    _bez_zapadek(monkeypatch)
    api_dir, main_path = _drzewo(
        tmp_path,
        {
            "zrodlo": 'router = APIRouter(prefix="/z")\n' + _trasa(),
            "shim": "from api.zrodlo import router\n\n__all__ = ['router']\n",
        },
        "from api.shim import router as shim_router\napp.include_router(shim_router)\n",
    )

    assert guard.check_router_mounts(api_dir, main_path) == []


def test_lancuch_reeksportow_znaczy_kazde_ogniwo(monkeypatch, tmp_path) -> None:
    """Trzy ogniwa: srodkowe tez musi byc uznane za zamontowane, nie tylko koncowe."""
    _bez_zapadek(monkeypatch)
    api_dir, main_path = _drzewo(
        tmp_path,
        {
            "zrodlo": 'router = APIRouter(prefix="/z")\n' + _trasa(),
            "srodek": "from api.zrodlo import router\n",
            "wierzch": "from api.srodek import router\n",
        },
        "from api.wierzch import router as w\napp.include_router(w)\n",
    )

    assert guard.check_router_mounts(api_dir, main_path) == []


def test_router_pochodny_znaczy_takze_router_bazowy(monkeypatch, tmp_path) -> None:
    """Wzor `production_router` z `api/catalog.py` i `api/enm.py`.

    Montowany jest router POCHODNY, ale trasy wisza na BAZOWYM — oba muszą byc
    uznane za zamontowane, inaczej guard zglosilby falszywe naruszenie na bazowym.
    """
    _bez_zapadek(monkeypatch)
    modul = (
        'router = APIRouter(prefix="/a")\n'
        + _trasa()
        + "_WYLACZONE = {('/a/x', 'GET')}\n"
        "def _build_production_router():\n"
        "    produkcyjny = APIRouter()\n"
        "    for trasa in router.routes:\n"
        "        if (trasa.path, 'GET') in _WYLACZONE:\n"
        "            continue\n"
        "        produkcyjny.routes.append(trasa)\n"
        "    return produkcyjny\n"
        "production_router = _build_production_router()\n"
    )
    api_dir, main_path = _drzewo(
        tmp_path,
        {"a": modul},
        "from api.a import production_router\napp.include_router(production_router)\n",
    )

    assert guard.check_router_mounts(api_dir, main_path) == []


def test_router_zagniezdzony_w_zamontowanym_przechodzi(monkeypatch, tmp_path) -> None:
    """Sub-router doklejony do zamontowanego routera JEST zamontowany.

    Repozytorium tej formy dzis nie uzywa (jedyne `include_router` sa w `main.py`).
    Test istnieje po to, zeby forma nie stala sie dziura w dniu, w ktorym ktos jej
    uzyje — i zeby nie dawala falszywego `[router-niezamontowany]`.
    """
    _bez_zapadek(monkeypatch)
    api_dir, main_path = _drzewo(
        tmp_path,
        {
            "pod": 'pod_router = APIRouter(prefix="/pod")\n' + _trasa("pod_router", "/p"),
            "a": (
                'router = APIRouter(prefix="/a")\n'
                + _trasa()
                + "from api.pod import pod_router\nrouter.include_router(pod_router)\n"
            ),
        },
        "from api.a import router as a_router\napp.include_router(a_router)\n",
    )

    assert guard.check_router_mounts(api_dir, main_path) == []


def test_modul_w_podkatalogu_jest_skanowany(monkeypatch, tmp_path) -> None:
    _bez_zapadek(monkeypatch)
    api_dir = tmp_path / "backend" / "src" / "api"
    (api_dir / "podkatalog").mkdir(parents=True)
    (api_dir / "podkatalog" / "b.py").write_text(
        APIROUTER_IMPORT + 'router = APIRouter(prefix="/b")\n' + _trasa(), encoding="utf-8"
    )
    main_path = api_dir / "main.py"
    main_path.write_text("from fastapi import FastAPI\napp = FastAPI()\n", encoding="utf-8")

    naruszenia = guard.check_router_mounts(api_dir, main_path)

    assert any("podkatalog/b.py" in v and "[router-niezamontowany]" in v for v in naruszenia)


# ---------------------------------------------------------------------------
# REGULA 2 — router NIEzamontowany jest naruszeniem (o ile nie odstawiony)
# ---------------------------------------------------------------------------


def test_router_niezamontowany_poza_lista_jest_naruszeniem(monkeypatch, tmp_path) -> None:
    _bez_zapadek(monkeypatch)
    api_dir, main_path = _drzewo(
        tmp_path, {"sierota": 'router = APIRouter(prefix="/s")\n' + _trasa()}, ""
    )

    naruszenia = guard.check_router_mounts(api_dir, main_path)

    assert any("[router-niezamontowany]" in v and "sierota" in v for v in naruszenia)


def test_router_niezamontowany_na_liscie_odstawionych_przechodzi(monkeypatch, tmp_path) -> None:
    _bez_zapadek(monkeypatch, budzet=1)
    monkeypatch.setattr(
        guard, "SWIADOMIE_ODSTAWIONE", {"sierota": (("router",), "uzasadnienie merytoryczne")}
    )
    api_dir, main_path = _drzewo(
        tmp_path, {"sierota": 'router = APIRouter(prefix="/s")\n' + _trasa()}, ""
    )

    assert guard.check_router_mounts(api_dir, main_path) == []


def test_jeden_router_zamontowany_drugi_nie_w_TYM_SAMYM_pliku(monkeypatch, tmp_path) -> None:
    """Kilka routerow w jednym pliku — granularnosc MODULU by to przegapila."""
    _bez_zapadek(monkeypatch)
    api_dir, main_path = _drzewo(
        tmp_path,
        {
            "a": (
                'zywy = APIRouter(prefix="/zywy")\n'
                + _trasa("zywy", "/1")
                + 'martwy = APIRouter(prefix="/martwy")\n'
                + _trasa("martwy", "/2")
            )
        },
        "from api.a import zywy\napp.include_router(zywy)\n",
    )

    naruszenia = guard.check_router_mounts(api_dir, main_path)

    assert len(naruszenia) == 1
    assert "[router-niezamontowany]" in naruszenia[0]
    assert "`martwy = APIRouter" in naruszenia[0]


def test_router_z_anotacja_typu_nie_znika_ze_skanu(monkeypatch, tmp_path) -> None:
    """`router: APIRouter = APIRouter(...)` — sama anotacja nie moze ukryc routera.

    `_module_level_assignments` w `api_lifecycle_guard` widzi tylko `ast.Assign`,
    wiec bez wlasnego zbierania anotowanych przypisan ta forma bylaby CICHA ZIELENIA.
    """
    _bez_zapadek(monkeypatch)
    api_dir, main_path = _drzewo(
        tmp_path,
        {"a": 'router: APIRouter = APIRouter(prefix="/a")\n' + _trasa()},
        "",
    )

    naruszenia = guard.check_router_mounts(api_dir, main_path)

    assert any("[router-niezamontowany]" in v for v in naruszenia)


def test_router_dynamiczny_niezamontowany_jest_niewidoczny(monkeypatch, tmp_path) -> None:
    """GRANICA GUARDA, przypieta testem (naglowek, forma 4).

    Router zbudowany funkcja spoza rozpoznanego ksztaltu fabryki i NIEzamontowany
    nie jest widziany. Ten test nie chwali guarda — utrwala, jak daleko siega jego
    obietnica, zeby nikt nie uwierzyl w szersza. Gdyby guard kiedys nauczyl sie tej
    formy, ten test ma UPASC i zostac przepisany razem z naglowkiem.
    """
    _bez_zapadek(monkeypatch)
    api_dir, main_path = _drzewo(
        tmp_path,
        {"a": "def zbuduj():\n    return APIRouter()\nrouter = zbuduj()\n"},
        "",
    )

    assert guard.check_router_mounts(api_dir, main_path) == []


def test_montaz_aliasu_bez_importu_z_api_jest_nierozwiazany(monkeypatch, tmp_path) -> None:
    """Fail-closed: nierozpoznany montaz to naruszenie, nie ciche pominiecie."""
    _bez_zapadek(monkeypatch)
    api_dir, main_path = _drzewo(
        tmp_path,
        {"a": 'router = APIRouter(prefix="/a")\n' + _trasa()},
        "from gdzies import inny_router\napp.include_router(inny_router)\n",
    )

    naruszenia = guard.check_router_mounts(api_dir, main_path)

    assert any("[router-nierozwiazany]" in v for v in naruszenia)


# ---------------------------------------------------------------------------
# REGULA 3 — rejestr odstawionych ma tylko MALEC (zapadka w obie strony)
# ---------------------------------------------------------------------------


def test_wpis_odstawiony_dla_routera_ZAMONTOWANEGO_zapala_czerwien(monkeypatch, tmp_path) -> None:
    _bez_zapadek(monkeypatch)
    monkeypatch.setattr(guard, "SWIADOMIE_ODSTAWIONE", {"a": (("router",), "uzasadnienie")})
    api_dir, main_path = _drzewo(
        tmp_path,
        {"a": 'router = APIRouter(prefix="/a")\n' + _trasa()},
        "from api.a import router as a_router\napp.include_router(a_router)\n",
    )

    naruszenia = guard.check_router_mounts(api_dir, main_path)

    assert any("[router-nieaktualny-wpis]" in v and "ZAMONTOWANY" in v for v in naruszenia)


def test_wpis_odstawiony_dla_nieistniejacego_modulu_zapala_czerwien(monkeypatch, tmp_path) -> None:
    _bez_zapadek(monkeypatch)
    monkeypatch.setattr(guard, "SWIADOMIE_ODSTAWIONE", {"znikniety": (("router",), "uzasadnienie")})
    api_dir, main_path = _drzewo(tmp_path, {}, "")

    naruszenia = guard.check_router_mounts(api_dir, main_path)

    assert any("[router-nieaktualny-wpis]" in v and "JUZ NIE MA" in v for v in naruszenia)


def test_wpis_odstawiony_dla_nieistniejacej_zmiennej_zapala_czerwien(monkeypatch, tmp_path) -> None:
    _bez_zapadek(monkeypatch, budzet=1)
    monkeypatch.setattr(
        guard, "SWIADOMIE_ODSTAWIONE", {"a": (("router", "byly_router"), "uzasadnienie")}
    )
    api_dir, main_path = _drzewo(tmp_path, {"a": 'router = APIRouter(prefix="/a")\n' + _trasa()}, "")

    naruszenia = guard.check_router_mounts(api_dir, main_path)

    assert any("[router-nieaktualny-wpis]" in v and "byly_router" in v for v in naruszenia)


def test_nowy_router_w_odstawionym_module_nie_przechodzi_gratis(monkeypatch, tmp_path) -> None:
    _bez_zapadek(monkeypatch, budzet=1)
    monkeypatch.setattr(guard, "SWIADOMIE_ODSTAWIONE", {"a": (("router",), "uzasadnienie")})
    api_dir, main_path = _drzewo(
        tmp_path,
        {
            "a": (
                'router = APIRouter(prefix="/a")\n'
                + _trasa()
                + 'dorobiony = APIRouter(prefix="/b")\n'
                + _trasa("dorobiony", "/2")
            )
        },
        "",
    )

    naruszenia = guard.check_router_mounts(api_dir, main_path)

    assert any("[router-nowy-w-odstawionym-module]" in v and "dorobiony" in v for v in naruszenia)


def test_budzet_urosl_zapala_czerwien(monkeypatch, tmp_path) -> None:
    _bez_zapadek(monkeypatch, budzet=1)
    monkeypatch.setattr(guard, "SWIADOMIE_ODSTAWIONE", {"a": (("router",), "uzasadnienie")})
    api_dir, main_path = _drzewo(
        tmp_path,
        {"a": 'router = APIRouter(prefix="/a")\n' + _trasa(sciezka="/1") + _trasa(sciezka="/2")},
        "",
    )

    naruszenia = guard.check_router_mounts(api_dir, main_path)

    assert any("[router-budzet-odstawionych]" in v and "UROSL" in v for v in naruszenia)


def test_budzet_zmalal_zapala_czerwien(monkeypatch, tmp_path) -> None:
    """ZAPADKA W OBIE STRONY: usuniety dlug przy niezmienionym budzecie = czerwien.

    Bez tej polowy nieaktualny wpis zostaje w rejestrze jako CICHE WYKLUCZENIE i
    czeka na przyszla regresje pod tym samym adresem (dokladnie ten mechanizm ma
    juz `route_prefix_guard` na sciezkach martwych klientow frontu).
    """
    _bez_zapadek(monkeypatch, budzet=5)
    monkeypatch.setattr(guard, "SWIADOMIE_ODSTAWIONE", {"a": (("router",), "uzasadnienie")})
    api_dir, main_path = _drzewo(tmp_path, {"a": 'router = APIRouter(prefix="/a")\n' + _trasa()}, "")

    naruszenia = guard.check_router_mounts(api_dir, main_path)

    assert any("[router-budzet-odstawionych]" in v and "ZMALAL" in v for v in naruszenia)


def test_pusty_skan_jest_bledem_nie_sukcesem(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(guard, "MIN_MODULOW_Z_ROUTEREM", 3)
    monkeypatch.setattr(guard, "BUDZET_ODSTAWIONYCH_TRAS", 0)
    monkeypatch.setattr(guard, "SWIADOMIE_ODSTAWIONE", {})
    api_dir, main_path = _drzewo(tmp_path, {}, "")

    naruszenia = guard.check_router_mounts(api_dir, main_path)

    assert any("[router-pusty-skan]" in v for v in naruszenia)


# ---------------------------------------------------------------------------
# REGULA 4 — zalozenia guarda sa EGZEKWOWANE, nie tylko opisane
# ---------------------------------------------------------------------------


def test_montaz_warunkowy_jest_naruszeniem(tmp_path) -> None:
    api_dir, main_path = _drzewo(
        tmp_path,
        {"a": 'router = APIRouter(prefix="/a")\n' + _trasa()},
        "import os\nfrom api.a import router as a\n"
        "if os.getenv('FLAGA'):\n    app.include_router(a)\n",
    )

    naruszenia = guard.check_premises(api_dir.parent, main_path)

    assert any("[router-montaz-warunkowy]" in v for v in naruszenia)


def test_druga_aplikacja_fastapi_jest_naruszeniem(tmp_path) -> None:
    api_dir, main_path = _drzewo(tmp_path, {"druga": "from fastapi import FastAPI\ninna = FastAPI()\n"}, "")

    naruszenia = guard.check_premises(api_dir.parent, main_path)

    assert any("[router-wiele-aplikacji]" in v for v in naruszenia)


def test_apirouter_poza_katalogiem_api_jest_naruszeniem(tmp_path) -> None:
    api_dir, main_path = _drzewo(tmp_path, {}, "")
    poza = api_dir.parent / "domain" / "trasy.py"
    poza.parent.mkdir(parents=True)
    poza.write_text(APIROUTER_IMPORT + "router = APIRouter()\n", encoding="utf-8")

    naruszenia = guard.check_premises(api_dir.parent, main_path)

    assert any("[router-poza-katalogiem-api]" in v for v in naruszenia)


def test_zalozenia_sa_spelnione_na_HEAD() -> None:
    """DEKLARACJA PRZYPIETA TESTEM (naglowek guarda, punkty 1-3).

    Naglowek twierdzi, ze repozytorium ma JEDNA aplikacje FastAPI, ZERO montazy
    warunkowych i ZERO `APIRouter` poza `api/**`. Zdanie bez testu jest grozniejsze
    niz sam defekt, bo wylacza czujnosc.
    """
    assert guard.check_premises() == []


def test_guard_jest_zielony_na_HEAD() -> None:
    """DEKLARACJA PRZYPIETA TESTEM: kazdy router w repo jest zamontowany albo
    stoi na liscie odstawionych z uzasadnieniem — a budzet zgadza sie co do trasy."""
    assert guard.check_router_mounts() == []
