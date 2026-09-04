"""Wspolbieznosc koncowek API mutujacych model ENM — blokada obejmuje CALY cykl.

DEFEKT, KTORY TE TESTY ZAMYKAJA (znalezisko P5 przegladu fali 2026-08-01,
krytyczny). Doktryna zostala postawiona wprost w `application/station_templates/
apply.py`: „blokada zalozona dopiero na zapisie nie pomaga, bo stary model zostal
odczytany wczesniej". Zrealizowano ja jednak WYLACZNIE dla zastosowania szablonu
stacji. Trzy inne koncowki mutuja ten sam model tym samym cyklem
odczyt → operacja domenowa → zapis, kazda BEZ blokady calego cyklu:

* `POST /api/cases/{case_id}/enm/domain-ops`      (`api/enm.py`),
* `POST /api/projects/{p}/cases/{c}/generators`   (`api/generators.py`),
* `PATCH /api/projects/{p}/cases/{c}/generators/{ref}/bindings` (`api/generators.py`).

Zmierzony skutek na HEAD przed naprawa: zatwierdzenie szablonu i operacja domenowa
biegnace rownolegle na jednym przypadku konczyly sie OBIE `HTTP 200`, a w modelu
zostawal dorobek tylko jednej z nich. Odpowiedz szablonu wymieniala `station_ref`
i 16 `created_element_refs`, ktorych w zapisanej migawce NIE MA — API meldowalo
sukces operacji, ktorej skutek nie istnieje (fabrykacja wobec phantom rule).

DLACZEGO PRZEZ REALNA SCIEZKE HTTP. Wyscig zachodzi miedzy koncowka `async def`
(petla zdarzen) a koncowka `def` (pula watkow Starlette) — para, ktorej nie widac,
gdy test wola funkcje aplikacyjne bezposrednio. Dotychczasowa bramka
(`tests/enm/test_store_concurrency.py`) bada wylacznie `apply` przeciw `apply`,
wiec ta klasa wyscigu przezyla odbior. Kazdy test ponizej idzie przez pelny stos
ASGI: routing, walidacja pydantic, handler, serializacja odpowiedzi.

DLACZEGO OKNO, A NIE „odpal watki i licz na wyscig". Wyscig wymaga ukladu, w
ktorym drugi uczestnik wchodzi w cykl ZANIM pierwszy zapisze. Naturalne pasmo
strat zmierzone sonda przegladu to 0,1–1,0 ms — test oparty na przypadkowym
przeplocie bywalby zielony na zepsutym kodzie i nie bylby bramka. Okno jest wiec
rozciagane deterministycznie: opakowanie `execute_domain_operation` czeka miedzy
odczytem modelu a jego zapisem. Opakowanie WOLA ORYGINAL i nie zmienia kolejnosci
krokow koncowki — to ta sama technika, co `threading.Barrier` w bramce szablonow.

Oczekiwanie jest ZAWSZE ograniczone czasem (`OKNO_S`). Poprawnie dzialajaca
blokada calego cyklu sprawia, ze drugi uczestnik nie moze wejsc w okno — wiec
czekanie MUSI konczyc sie samo, inaczej bramka zakleszczalaby sie na wlasnej
naprawie.

ZAKRES: ochrona W PROCESIE (blokada per przypadek obliczeniowy). Blokada
miedzyprocesowa (uvicorn z wieloma pracownikami) to osobna decyzja wdrozeniowa —
patrz `docs/audit/AUDYT_SZCZYTU_2026-08-01.md`, sekcja 4 pkt 7.

REWIZJE PONIZEJ FORMULY „+N" (P0.1 nN, LV-INV-12). Kazde zastosowanie szablonu
`tpl_sn_nn_630kva` i kazde `POST /generators` (zrodlo nn_side) zostawia po sobie
NIEPROMOWANY wpis `substation.meta.nn_field_specs` (odpowiednio: pole glowne +
odplywy nN; pole zrodlowe DER). `get_enm` promuje WSZYSTKIE oczekujace wpisy
JEDNEGO przypadku w JEDNYM przebiegu automigracji
(`enm/migrations/nn_field_specs_promocja.py`), ktora — jak kazda automigracja
tej rodziny — PODNOSI REWIZJE, gdy cos zmienila (ten sam wzorzec co migracja
punktu przylaczenia w `enm/store.py::_get_enm_pod_blokada`). Kazdy odczyt modelu
(`_model(case_id)`, czyli `get_enm`) miedzy dwoma zapisami — WLASNY na starcie
kazdej zablokowanej koncowki i KONCOWY w asercji ponizej — moze wiec dolozyc
WLASNA rewizje promocji, ponad „1 zapis = 1 rewizja" tego testu. Formuly ponizej
sa WYPROWADZONE (nie zgadywane) z tej mechaniki dla KAZDEGO wariantu wyscigu
osobno — patrz komentarz przy kazdej asercji.
"""

from __future__ import annotations

import threading
import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from typing import Any

import pytest

pytest.importorskip("fastapi")

# Ile czasu koncowka czeka w rozciagnietym oknie miedzy odczytem a zapisem.
# Przy DZIALAJACEJ blokadzie drugi uczestnik nie wejdzie w okno nigdy, wiec to
# jest staly koszt kazdego testu wyscigowego — stad wartosc mala, ale z zapasem
# na zwolniona maszyne CI (naturalne pasmo strat to ulamki milisekundy).
OKNO_S = 1.5

SZABLON = "tpl_sn_nn_630kva"
CATALOG_VERSION = "2024.1"
CABLE_ID = "cable-tfk-yakxs-3x120"
SOURCE_ID = "src-gpz-15kv-250mva-rx010"
KATALOG_PV_NN = "conv-pv-nn-0p5mw-0p4kv"


@pytest.fixture(autouse=True)
def _czysty_magazyn(tmp_path, monkeypatch) -> Iterator[None]:
    from enm.dziennik_zmian import wyczysc_dziennik
    from enm.store import reset_enm_store

    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path))
    reset_enm_store()
    wyczysc_dziennik()
    yield
    reset_enm_store()
    wyczysc_dziennik()


# ---------------------------------------------------------------------------
# Budowa przypadku (wylacznie przez realne koncowki HTTP)
# ---------------------------------------------------------------------------


def _binding(namespace: str, item_id: str) -> dict[str, str]:
    return {
        "catalog_namespace": namespace,
        "catalog_item_id": item_id,
        "catalog_item_version": CATALOG_VERSION,
    }


def _projekt_i_przypadek(app_client) -> tuple[str, str]:
    suffix = uuid.uuid4().hex[:8]
    projekt = app_client.post(
        "/api/projects",
        json={
            "name": f"Projekt wspolbieznosci {suffix}",
            "mode": "TO-BE",
            "voltage_level_kv": 15.0,
            "frequency_hz": 50.0,
        },
    )
    assert projekt.status_code == 201, projekt.text
    project_id = projekt.json()["id"]

    przypadek = app_client.post(
        "/api/study-cases",
        json={
            "project_id": project_id,
            "name": f"Przypadek wspolbieznosci {suffix}",
            "set_active": True,
        },
    )
    assert przypadek.status_code == 201, przypadek.text
    return project_id, przypadek.json()["id"]


def _operacja_domenowa(app_client, case_id: str, nazwa: str, payload: dict[str, Any]) -> Any:
    """Wywolaj `POST /enm/domain-ops` — zwraca surowa odpowiedz HTTP."""
    return app_client.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={
            "project_id": "",
            "snapshot_base_hash": "",
            "operation": {
                "name": nazwa,
                "idempotency_key": f"wspolbieznosc-{uuid.uuid4()}",
                "payload": payload,
            },
        },
    )


def _udana_operacja(
    app_client, case_id: str, nazwa: str, payload: dict[str, Any]
) -> dict[str, Any]:
    odpowiedz = _operacja_domenowa(app_client, case_id, nazwa, payload)
    assert odpowiedz.status_code == 200, odpowiedz.text
    tresc = odpowiedz.json()
    assert tresc.get("error") is None, tresc.get("error")
    return tresc


def _payload_odcinka(numer: int) -> dict[str, Any]:
    return {
        "segment": {
            "rodzaj": "KABEL",
            "dlugosc_m": 120,
            "name": f"Odcinek {numer}",
            "catalog_binding": _binding("KABEL_SN", CABLE_ID),
        },
    }


def _zbuduj_magistrale(app_client, case_id: str, liczba_odcinkow: int) -> list[str]:
    """Zrodlo GPZ + magistrala z N odcinkow — po jednym na kazdego uczestnika wyscigu."""
    _udana_operacja(
        app_client,
        case_id,
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "sk3_mva": 250.0,
            "rx_ratio": 0.1,
            "catalog_binding": _binding("ZRODLO_SN", SOURCE_ID),
        },
    )
    for numer in range(liczba_odcinkow):
        tresc = _udana_operacja(
            app_client, case_id, "continue_trunk_segment_sn", _payload_odcinka(numer + 1)
        )
    segmenty = list(tresc["snapshot"]["corridors"][0]["ordered_segment_refs"])
    assert len(segmenty) == liczba_odcinkow
    return segmenty


def _zastosuj_szablon(app_client, case_id: str, segment_ref: str) -> Any:
    return app_client.post(
        f"/api/station-templates/{SZABLON}/apply",
        json={
            "case_id": case_id,
            "target_segment_id": segment_ref,
            "insert_at_ratio": 0.5,
            "params_override": {},
        },
    )


def _utworz_wytworce(
    app_client, project_id: str, case_id: str, station_ref: str, nazwa: str
) -> Any:
    return app_client.post(
        f"/api/projects/{project_id}/cases/{case_id}/generators",
        json={
            "station_ref": station_ref,
            "der_kind": "PV",
            "power_mw": 0.5,
            "connection_variant": "nn_side",
            "catalog_ref": KATALOG_PV_NN,
            "source_name": nazwa,
            "nc_rfg_module": "A",
        },
    )


# ---------------------------------------------------------------------------
# Odczyt zapisanego modelu (zrodlo prawdy dla asercji „zero utraty")
# ---------------------------------------------------------------------------


def _model(case_id: str) -> Any:
    from enm.store import get_enm

    return get_enm(case_id)


# Klucze, pod ktorymi model trzyma TOZSAMOSC elementu. Elementy kolekcji glownych
# (szyny, galezie, transformatory, wytworcy, stacje) uzywaja `ref_id`; pola stacji i
# GPZ zyja jako `field_spec` w `meta` stacji i uzywaja `field_ref` (`_build_field_spec`
# w `enm/domain_operations.py`). Zbior musi obejmowac OBA — inaczej bramka „brak
# fabrykacji" zglasza falszywy alarm na poprawnie zapisanym polu nN wytworcy.
KLUCZE_TOZSAMOSCI = ("ref_id", "field_ref")


def _refy_modelu(case_id: str) -> set[str]:
    """Rekurencyjny zbior WSZYSTKICH identyfikatorow elementow zapisanej migawki.

    Sluzy do wykrycia fabrykacji: kazdy identyfikator, ktory koncowka zwrocila
    jako utworzony, musi w tym zbiorze byc.
    """
    zebrane: set[str] = set()

    def przejdz(wezel: Any) -> None:
        if isinstance(wezel, dict):
            for klucz in KLUCZE_TOZSAMOSCI:
                wartosc = wezel.get(klucz)
                if isinstance(wartosc, str):
                    zebrane.add(wartosc)
            for podwezel in wezel.values():
                przejdz(podwezel)
        elif isinstance(wezel, list):
            for podwezel in wezel:
                przejdz(podwezel)

    przejdz(_model(case_id).model_dump(mode="json"))
    return zebrane


def _utworzone_refy(tresc: dict[str, Any]) -> list[str]:
    """Identyfikatory, ktore odpowiedz koncowki OGLASZA jako utworzone."""
    zmiany = tresc.get("changes") or {}
    refy = list(zmiany.get("created_element_ids") or ())
    refy += [ref for ref in (tresc.get("created_element_refs") or ()) if isinstance(ref, str)]
    station_ref = tresc.get("station_ref")
    if isinstance(station_ref, str):
        refy.append(station_ref)
    return refy


def _bez_pokrycia_w_modelu(case_id: str, oglaszane: list[str]) -> list[str]:
    obecne = _refy_modelu(case_id)
    return [ref for ref in oglaszane if ref not in obecne]


# ---------------------------------------------------------------------------
# Rozciaganie okna miedzy odczytem modelu a jego zapisem
# ---------------------------------------------------------------------------


@contextmanager
def _okno_z_bariera(modul: Any, nazwa: str, uczestnikow: int) -> Iterator[None]:
    """Wstrzymaj KAZDEGO uczestnika tuz po odczycie modelu, az zbierze sie komplet.

    Bariera z limitem czasu, a nie bez: przy DZIALAJACEJ blokadzie calego cyklu
    komplet nigdy sie nie zbierze (drugi uczestnik czeka na blokade, wiec do
    bariery nie dojdzie). Zerwana bariera jest tu POPRAWNYM wynikiem — uczestnik
    po prostu kontynuuje, a serializacje zapewnia blokada.
    """
    bariera = threading.Barrier(uczestnikow, timeout=OKNO_S)
    oryginal = getattr(modul, nazwa)

    def opakowanie(*args: Any, **kwargs: Any) -> Any:
        try:
            bariera.wait()
        except threading.BrokenBarrierError:
            pass
        return oryginal(*args, **kwargs)

    setattr(modul, nazwa, opakowanie)
    try:
        yield
    finally:
        setattr(modul, nazwa, oryginal)


def _rownolegle(zadania: list[Callable[[], None]]) -> list[BaseException]:
    bledy: list[BaseException] = []
    zamek = threading.Lock()

    def opakowanie(zadanie: Callable[[], None]) -> None:
        try:
            zadanie()
        except BaseException as exc:  # noqa: BLE001 - blad watku ma dotrzec do asercji
            with zamek:
                bledy.append(exc)

    watki = [threading.Thread(target=opakowanie, args=(z,)) for z in zadania]
    for watek in watki:
        watek.start()
    for watek in watki:
        watek.join(timeout=120)
        assert not watek.is_alive(), "Watek nie zakonczyl sie w limicie czasu"
    return bledy


def _wyscig_z_szablonem(
    modul: Any,
    nazwa: str,
    *,
    zadanie_koncowki: Callable[[], None],
    zadanie_szablonu: Callable[[], None],
) -> None:
    """Uklad zmierzony w przegladzie: koncowka czyta model, szablon robi CALY cykl,
    koncowka zapisuje to, co policzyla ze STAREGO modelu.

    Kolejnosc jest wymuszona, a nie losowa: watek koncowki startuje pierwszy i
    melduje wejscie w okno, dopiero potem rusza szablon. Bez blokady szablon
    przechodzi caly cykl w tym oknie i jego dorobek ginie pod spoznionym zapisem
    koncowki. Z blokada szablon czeka, okno wygasa po `OKNO_S`, a oba zapisy ida
    po kolei.
    """
    w_oknie = threading.Event()
    szablon_zakonczony = threading.Event()
    oryginal = getattr(modul, nazwa)

    def opakowanie(*args: Any, **kwargs: Any) -> Any:
        w_oknie.set()
        szablon_zakonczony.wait(timeout=OKNO_S)
        return oryginal(*args, **kwargs)

    bledy: list[BaseException] = []
    zamek = threading.Lock()

    def bezpiecznie(zadanie: Callable[[], None]) -> Callable[[], None]:
        def wykonaj() -> None:
            try:
                zadanie()
            except BaseException as exc:  # noqa: BLE001 - blad watku ma dotrzec do asercji
                with zamek:
                    bledy.append(exc)

        return wykonaj

    setattr(modul, nazwa, opakowanie)
    try:
        watek_koncowki = threading.Thread(target=bezpiecznie(zadanie_koncowki))
        watek_koncowki.start()
        assert w_oknie.wait(timeout=60), "Koncowka nie weszla w okno miedzy odczytem a zapisem"

        watek_szablonu = threading.Thread(target=bezpiecznie(zadanie_szablonu))
        watek_szablonu.start()
        watek_szablonu.join(timeout=120)
        assert not watek_szablonu.is_alive(), (
            "Zastosowanie szablonu nie zakonczylo sie w limicie czasu — "
            "podejrzenie zakleszczenia na blokadzie przypadku"
        )
        szablon_zakonczony.set()

        watek_koncowki.join(timeout=120)
        assert not watek_koncowki.is_alive(), "Koncowka nie zakonczyla sie w limicie czasu"
    finally:
        setattr(modul, nazwa, oryginal)
        szablon_zakonczony.set()

    assert bledy == [], f"Rownolegle zadania zglosily blad: {bledy}"


# ---------------------------------------------------------------------------
# POST /api/cases/{case_id}/enm/domain-ops
# ---------------------------------------------------------------------------


class TestWyscigOperacjiDomenowych:
    def test_cztery_rownolegle_operacje_daja_cztery_odcinki(self, app_client) -> None:
        """4 rownolegle zadania HTTP na jednym przypadku: rewizja +4, zero utraty."""
        import enm.domain_operations as domain_operations

        _, case_id = _projekt_i_przypadek(app_client)
        _zbuduj_magistrale(app_client, case_id, 1)

        model_przed = _model(case_id)
        rewizja_przed = model_przed.header.revision
        odcinkow_przed = len(model_przed.branches)

        odpowiedzi: list[dict[str, Any]] = []
        zamek = threading.Lock()

        def zadanie(numer: int) -> Callable[[], None]:
            def wykonaj() -> None:
                odpowiedz = _operacja_domenowa(
                    app_client, case_id, "continue_trunk_segment_sn", _payload_odcinka(numer)
                )
                assert odpowiedz.status_code == 200, odpowiedz.text
                tresc = odpowiedz.json()
                assert tresc.get("error") is None, tresc.get("error")
                with zamek:
                    odpowiedzi.append(tresc)

            return wykonaj

        with _okno_z_bariera(domain_operations, "execute_domain_operation", 4):
            bledy = _rownolegle([zadanie(numer) for numer in range(10, 14)])

        assert bledy == [], f"Rownolegle operacje zglosily blad: {bledy}"
        assert len(odpowiedzi) == 4

        model_po = _model(case_id)
        assert model_po.header.revision == rewizja_przed + 4, (
            "Rownolegle operacje domenowe zgubily zapis: rewizja "
            f"{model_po.header.revision} zamiast {rewizja_przed + 4}"
        )
        assert len(model_po.branches) == odcinkow_przed + 4, (
            "Rownolegle operacje domenowe zgubily odcinki: "
            f"{len(model_po.branches)} zamiast {odcinkow_przed + 4}"
        )

        oglaszane = [ref for tresc in odpowiedzi for ref in _utworzone_refy(tresc)]
        assert oglaszane, "Operacje nie oglosily zadnego utworzonego elementu"
        brakujace = _bez_pokrycia_w_modelu(case_id, oglaszane)
        assert brakujace == [], (
            "Koncowka zwrocila identyfikatory elementow, ktorych nie ma w zapisanej "
            f"migawce (fabrykacja wyniku): {brakujace}"
        )

    def test_operacja_domenowa_rownolegla_z_szablonem_nie_gubi_stacji(self, app_client) -> None:
        """Uklad zmierzony w przegladzie: `domain-ops` (petla zdarzen) x `apply` (pula watkow).

        Bez blokady calego cyklu szablon zglaszal `station_ref` i 16
        `created_element_refs`, a spozniony zapis operacji domenowej kasowal cala
        te prace — obie koncowki melduly `HTTP 200`.
        """
        import enm.domain_operations as domain_operations

        _, case_id = _projekt_i_przypadek(app_client)
        segmenty = _zbuduj_magistrale(app_client, case_id, 1)

        model_przed = _model(case_id)
        rewizja_przed = model_przed.header.revision
        stacji_przed = len(model_przed.substations)
        odcinkow_przed = len(model_przed.branches)

        wyniki: dict[str, dict[str, Any]] = {}

        def operacja() -> None:
            odpowiedz = _operacja_domenowa(
                app_client, case_id, "continue_trunk_segment_sn", _payload_odcinka(99)
            )
            assert odpowiedz.status_code == 200, odpowiedz.text
            tresc = odpowiedz.json()
            assert tresc.get("error") is None, tresc.get("error")
            wyniki["operacja"] = tresc

        def szablon() -> None:
            odpowiedz = _zastosuj_szablon(app_client, case_id, segmenty[0])
            assert odpowiedz.status_code == 200, odpowiedz.text
            wyniki["szablon"] = odpowiedz.json()

        _wyscig_z_szablonem(
            domain_operations,
            "execute_domain_operation",
            zadanie_koncowki=operacja,
            zadanie_szablonu=szablon,
        )

        model_po = _model(case_id)
        # +2 wlasne zapisy (operacja + szablon) + 1 promocja pola nN pozostawionego
        # przez szablon, wychwycona dopiero TYM odczytem (patrz nota na gorze pliku).
        assert model_po.header.revision == rewizja_przed + 3, (
            "Jeden z dwoch zapisow przepadl: rewizja "
            f"{model_po.header.revision} zamiast {rewizja_przed + 3}"
        )
        assert len(model_po.substations) == stacji_przed + 1, (
            "Praca kreatora stacji przepadla mimo HTTP 200 — stacji "
            f"{len(model_po.substations)} zamiast {stacji_przed + 1}"
        )
        assert len(model_po.branches) > odcinkow_przed, (
            "Praca operacji domenowej przepadla mimo HTTP 200 — odcinkow "
            f"{len(model_po.branches)}, przed wyscigiem {odcinkow_przed}"
        )

        oglaszane = _utworzone_refy(wyniki["operacja"]) + _utworzone_refy(wyniki["szablon"])
        brakujace = _bez_pokrycia_w_modelu(case_id, oglaszane)
        assert brakujace == [], (
            "Koncowki zwrocily identyfikatory elementow, ktorych nie ma w zapisanej "
            f"migawce (fabrykacja wyniku): {brakujace}"
        )


# ---------------------------------------------------------------------------
# POST /api/projects/{p}/cases/{c}/generators
# ---------------------------------------------------------------------------


def _przypadek_ze_stacja(app_client) -> tuple[str, str, str, list[str]]:
    """Projekt + przypadek + JEDNA stacja z szablonu; zwraca wolne odcinki magistrali."""
    project_id, case_id = _projekt_i_przypadek(app_client)
    segmenty = _zbuduj_magistrale(app_client, case_id, 3)

    odpowiedz = _zastosuj_szablon(app_client, case_id, segmenty[0])
    assert odpowiedz.status_code == 200, odpowiedz.text
    station_ref = odpowiedz.json()["station_ref"]
    assert isinstance(station_ref, str) and station_ref

    return project_id, case_id, station_ref, segmenty[1:]


class TestWyscigTworzeniaWytworcy:
    def test_trzy_rownolegle_zadania_daja_trzech_wytworcow(self, app_client) -> None:
        """3 rownolegle `POST /generators` na jednej stacji: rewizja +6, zero utraty.

        P0.1 nN: kazde zadanie DER (`add_converter_source`, nn_side) zostawia WLASNE
        pole zrodlowe nN jako nowy niepromowany wpis `nn_field_specs`
        (`_append_converter_field_if_needed`). Zadania sa serializowane blokada
        przypadku (P5), wiec KAZDE kolejne najpierw promuje pole POPRZEDNIEGO
        zadania (+1), potem zapisuje WLASNE (+1) — to 2 rewizje na zadanie, a
        ostatnie zadanie zostawia WLASNE pole do promocji przy koncowym odczycie
        ponizej (patrz nota na gorze pliku) — stad +6, nie +3.
        """
        import api.generators as generators_api

        project_id, case_id, station_ref, _ = _przypadek_ze_stacja(app_client)

        model_przed = _model(case_id)
        rewizja_przed = model_przed.header.revision
        wytworcow_przed = len(model_przed.generators)

        odpowiedzi: list[dict[str, Any]] = []
        zamek = threading.Lock()

        def zadanie(numer: int) -> Callable[[], None]:
            def wykonaj() -> None:
                odpowiedz = _utworz_wytworce(
                    app_client, project_id, case_id, station_ref, f"PV rownolegle {numer}"
                )
                assert odpowiedz.status_code == 201, odpowiedz.text
                with zamek:
                    odpowiedzi.append(odpowiedz.json())

            return wykonaj

        with _okno_z_bariera(generators_api, "execute_domain_operation", 3):
            bledy = _rownolegle([zadanie(numer) for numer in range(3)])

        assert bledy == [], f"Rownolegle zadania DER zglosily blad: {bledy}"
        assert len(odpowiedzi) == 3

        model_po = _model(case_id)
        assert model_po.header.revision == rewizja_przed + 2 * 3, (
            "Rownolegle zadania DER zgubily zapis: rewizja "
            f"{model_po.header.revision} zamiast {rewizja_przed + 2 * 3}"
        )
        assert len(model_po.generators) == wytworcow_przed + 3, (
            "Rownolegle zadania DER zgubily wytworcow: "
            f"{len(model_po.generators)} zamiast {wytworcow_przed + 3}"
        )

        oglaszane = [ref for tresc in odpowiedzi for ref in _utworzone_refy(tresc)]
        assert oglaszane, "Koncowka nie oglosila zadnego utworzonego elementu"
        brakujace = _bez_pokrycia_w_modelu(case_id, oglaszane)
        assert brakujace == [], (
            "Koncowka DER zwrocila identyfikatory elementow, ktorych nie ma w "
            f"zapisanej migawce (fabrykacja wyniku): {brakujace}"
        )

    def test_tworzenie_wytworcy_rownolegle_z_szablonem_nie_gubi_pracy(self, app_client) -> None:
        """P0.1 nN: oba zadania (DER + szablon) zostawiaja WLASNE pole nN do promocji
        (patrz nota na gorze pliku) — 2 wlasne zapisy + 2 promocje (jedna wewnatrz
        wyscigu, gdy drugie zadanie startuje po pierwszym; jedna przy koncowym
        odczycie dla ostatniego) = +4, niezaleznie od kolejnosci wykonania.
        """
        import api.generators as generators_api

        project_id, case_id, station_ref, wolne = _przypadek_ze_stacja(app_client)

        model_przed = _model(case_id)
        rewizja_przed = model_przed.header.revision
        stacji_przed = len(model_przed.substations)
        wytworcow_przed = len(model_przed.generators)

        wyniki: dict[str, dict[str, Any]] = {}

        def wytworca() -> None:
            odpowiedz = _utworz_wytworce(
                app_client, project_id, case_id, station_ref, "PV w wyscigu"
            )
            assert odpowiedz.status_code == 201, odpowiedz.text
            wyniki["wytworca"] = odpowiedz.json()

        def szablon() -> None:
            odpowiedz = _zastosuj_szablon(app_client, case_id, wolne[0])
            assert odpowiedz.status_code == 200, odpowiedz.text
            wyniki["szablon"] = odpowiedz.json()

        _wyscig_z_szablonem(
            generators_api,
            "execute_domain_operation",
            zadanie_koncowki=wytworca,
            zadanie_szablonu=szablon,
        )

        model_po = _model(case_id)
        assert model_po.header.revision == rewizja_przed + 4, (
            "Jeden z dwoch zapisow przepadl: rewizja "
            f"{model_po.header.revision} zamiast {rewizja_przed + 4}"
        )
        assert len(model_po.substations) == stacji_przed + 1, (
            "Praca kreatora stacji przepadla mimo HTTP 200 — stacji "
            f"{len(model_po.substations)} zamiast {stacji_przed + 1}"
        )
        assert len(model_po.generators) == wytworcow_przed + 1, (
            "Konfiguracja DER przepadla mimo HTTP 201 — wytworcow "
            f"{len(model_po.generators)} zamiast {wytworcow_przed + 1}"
        )

        oglaszane = _utworzone_refy(wyniki["wytworca"]) + _utworzone_refy(wyniki["szablon"])
        brakujace = _bez_pokrycia_w_modelu(case_id, oglaszane)
        assert brakujace == [], (
            "Koncowki zwrocily identyfikatory elementow, ktorych nie ma w zapisanej "
            f"migawce (fabrykacja wyniku): {brakujace}"
        )


# ---------------------------------------------------------------------------
# PATCH /api/projects/{p}/cases/{c}/generators/{ref}/bindings
# ---------------------------------------------------------------------------


def _wytworca_do_wiazan(app_client) -> tuple[str, str, str, list[str]]:
    project_id, case_id, station_ref, wolne = _przypadek_ze_stacja(app_client)
    odpowiedz = _utworz_wytworce(app_client, project_id, case_id, station_ref, "PV wiazania")
    assert odpowiedz.status_code == 201, odpowiedz.text
    generator_ref = odpowiedz.json()["snapshot"]["generators"][-1]["ref_id"]
    return project_id, case_id, generator_ref, wolne


def _wiazania_z_modelu(case_id: str, generator_ref: str) -> dict[str, Any]:
    for generator in _model(case_id).model_dump(mode="json")["generators"]:
        if generator.get("ref_id") == generator_ref:
            return dict(generator.get("materialized_params") or {})
    raise AssertionError(f"Wytworca {generator_ref} zniknal z modelu")


class TestWyscigWiazanWytworcy:
    def test_trzy_rownolegle_zadania_nie_kasuja_wzajemnie_wiazan(self, app_client) -> None:
        """3 rownolegle `PATCH /bindings`, kazde na INNYM polu: wszystkie trzy przezywaja.

        Sekwencyjnie to zachowanie jest juz bramkowane („pominiecie != null"), ale
        rozstrzyga o nim `model_fields_set` w koncowce — a przy wyscigu calego
        cyklu kasowanie brало sie ze STAREGO modelu odczytanego przed zapisem
        sasiada, nie z ksztaltu zadania.
        """
        import api.generators as generators_api

        project_id, case_id, generator_ref, _ = _wytworca_do_wiazan(app_client)
        baza = f"/api/projects/{project_id}/cases/{case_id}/generators/{generator_ref}/bindings"

        rewizja_przed = _model(case_id).header.revision
        pola = {
            "protection_catalog_ref": "REF-OC-200",
            "ct_catalog_ref": "ct_200_5_5p10_10va_abb",
            "vt_catalog_ref": "vt_10kv_100v_05_abb",
        }

        def zadanie(pole: str, wartosc: str) -> Callable[[], None]:
            def wykonaj() -> None:
                odpowiedz = app_client.patch(baza, json={pole: wartosc})
                assert odpowiedz.status_code == 200, odpowiedz.text

            return wykonaj

        with _okno_z_bariera(generators_api, "execute_domain_operation", len(pola)):
            bledy = _rownolegle([zadanie(pole, wartosc) for pole, wartosc in pola.items()])

        assert bledy == [], f"Rownolegle zadania wiazan zglosily blad: {bledy}"

        model_po = _model(case_id)
        assert model_po.header.revision == rewizja_przed + len(pola), (
            "Rownolegle zadania wiazan zgubily zapis: rewizja "
            f"{model_po.header.revision} zamiast {rewizja_przed + len(pola)}"
        )

        zapisane = _wiazania_z_modelu(case_id, generator_ref)
        zgubione = {
            pole: wartosc for pole, wartosc in pola.items() if zapisane.get(pole) != wartosc
        }
        assert zgubione == {}, (
            "Rownolegle zadania wiazan skasowaly sie wzajemnie mimo HTTP 200 — "
            f"brakuje: {sorted(zgubione)}"
        )

    def test_wiazania_rownolegle_z_szablonem_nie_gubia_pracy(self, app_client) -> None:
        """P0.1 nN: PATCH /bindings sam nie tworzy wpisu `nn_field_specs` (tylko
        szablon zostawia WLASNE pole nN do promocji, patrz nota na gorze pliku) —
        2 wlasne zapisy + 1 promocja pola szablonu (wewnatrz wyscigu albo przy
        koncowym odczycie, zaleznie od kolejnosci — zawsze dokladnie jedna) = +3.
        """
        import api.generators as generators_api

        project_id, case_id, generator_ref, wolne = _wytworca_do_wiazan(app_client)
        baza = f"/api/projects/{project_id}/cases/{case_id}/generators/{generator_ref}/bindings"

        model_przed = _model(case_id)
        rewizja_przed = model_przed.header.revision
        stacji_przed = len(model_przed.substations)

        wynik_szablonu: dict[str, dict[str, Any]] = {}

        def wiazania() -> None:
            odpowiedz = app_client.patch(baza, json={"protection_catalog_ref": "REF-OC-200"})
            assert odpowiedz.status_code == 200, odpowiedz.text

        def szablon() -> None:
            odpowiedz = _zastosuj_szablon(app_client, case_id, wolne[0])
            assert odpowiedz.status_code == 200, odpowiedz.text
            wynik_szablonu["szablon"] = odpowiedz.json()

        _wyscig_z_szablonem(
            generators_api,
            "execute_domain_operation",
            zadanie_koncowki=wiazania,
            zadanie_szablonu=szablon,
        )

        model_po = _model(case_id)
        assert model_po.header.revision == rewizja_przed + 3, (
            "Jeden z dwoch zapisow przepadl: rewizja "
            f"{model_po.header.revision} zamiast {rewizja_przed + 3}"
        )
        assert len(model_po.substations) == stacji_przed + 1, (
            "Praca kreatora stacji przepadla mimo HTTP 200 — stacji "
            f"{len(model_po.substations)} zamiast {stacji_przed + 1}"
        )
        zapisane = _wiazania_z_modelu(case_id, generator_ref)
        assert zapisane.get("protection_catalog_ref") == "REF-OC-200", (
            "Wiazanie zabezpieczenia przepadlo mimo HTTP 200 — w modelu: "
            f"{zapisane.get('protection_catalog_ref')!r}"
        )

        brakujace = _bez_pokrycia_w_modelu(case_id, _utworzone_refy(wynik_szablonu["szablon"]))
        assert brakujace == [], (
            "Szablon zwrocil identyfikatory elementow, ktorych nie ma w zapisanej "
            f"migawce (fabrykacja wyniku): {brakujace}"
        )


# ---------------------------------------------------------------------------
# Brak zakleszczenia
# ---------------------------------------------------------------------------


class TestBrakZakleszczenia:
    def test_szablon_i_operacja_domenowa_naraz_konczy_sie_bez_zakleszczenia(
        self, app_client
    ) -> None:
        """Reentrancja: `apply` trzyma blokade przypadku i wola kod, ktory bierze ja ponownie.

        Blokada jest jedna na przypadek i REENTRANTNA (`threading.RLock`), a w calym
        backendzie nie ma drugiego rodzaju blokady, ktora mozna by wziac w odwrotnej
        kolejnosci — ten test pilnuje, ze rozszerzenie blokady na koncowki API tego
        nie zmienia. Bez limitow czasu zakleszczenie zawiesiloby caly bieg testow,
        wiec kazde oczekiwanie jest ograniczone.

        P0.1 nN: 3 wlasne zapisy (2x szablon + 1x operacja domenowa) + 2 promocje
        (po jednej na kazdy szablon — ktorys wpis zawsze zostaje promowany PRZEZ
        nastepny zablokowany zapis w kolejce, ostatni przez koncowy odczyt ponizej;
        patrz nota na gorze pliku) = +5, niezaleznie od kolejnosci trzech zadan.
        """
        _, case_id = _projekt_i_przypadek(app_client)
        segmenty = _zbuduj_magistrale(app_client, case_id, 2)

        model_przed = _model(case_id)
        rewizja_przed = model_przed.header.revision
        stacji_przed = len(model_przed.substations)

        def szablon(segment_ref: str) -> Callable[[], None]:
            def wykonaj() -> None:
                odpowiedz = _zastosuj_szablon(app_client, case_id, segment_ref)
                assert odpowiedz.status_code == 200, odpowiedz.text

            return wykonaj

        def operacja() -> None:
            odpowiedz = _operacja_domenowa(
                app_client, case_id, "continue_trunk_segment_sn", _payload_odcinka(77)
            )
            assert odpowiedz.status_code == 200, odpowiedz.text
            assert odpowiedz.json().get("error") is None

        bledy = _rownolegle([szablon(segmenty[0]), operacja, szablon(segmenty[1])])

        assert bledy == [], f"Rownolegle zadania zglosily blad: {bledy}"

        model_po = _model(case_id)
        assert model_po.header.revision == rewizja_przed + 5, (
            "Zapis przepadl przy trzech rownoleglych zadaniach: rewizja "
            f"{model_po.header.revision} zamiast {rewizja_przed + 5}"
        )
        assert len(model_po.substations) == stacji_przed + 2, (
            "Praca kreatora stacji przepadla — stacji "
            f"{len(model_po.substations)} zamiast {stacji_przed + 2}"
        )
