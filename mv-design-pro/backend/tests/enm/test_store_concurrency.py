"""Wspolbieznosc magazynu ENM — dwa rownolegle zapisy nie moga zgubic operacji.

DEFEKT, KTORY TE TESTY ZAMYKAJA (D4 audytu 2026-08-01, krytyczny). `set_enm`
czytal biezacy model, liczyl z niego nowa rewizje i podmienial wpis w globalnym
slowniku BEZ zadnej serializacji, a koncowka `POST /api/station-templates/{id}/apply`
jest zdefiniowana jako `def` — Starlette wykonuje ja w puli watkow, wiec dwa
zatwierdzenia szablonu na tym samym przypadku bieglo naprawde rownolegle. Zmierzony
skutek: 4 zadania konczyly sie HTTP 200 z lista 12 utworzonych elementow kazde, a w
modelu przybywala JEDNA stacja (rewizja rosla o 4). API meldowalo sukces operacji,
ktorej skutek nie istnieje.

DLACZEGO BARIERA, A NIE „odpal watki i licz na wyscig". Wyscig wymaga, zeby
wszystkie watki weszly w cykl odczytu ZANIM ktorykolwiek zapisze. `threading.Barrier`
wymusza ten uklad deterministycznie — bez niej test bywalby zielony na zepsutym
kodzie (watki ustawilyby sie w kolejce przypadkiem) i nie bylby bramka. Sprawdzone
iniekcja: po zdjeciu blokady z `enm/store.py` i `application/station_templates/apply.py`
test wyscigowy jest czerwony w 5 z 5 przebiegow.

ZAKRES: ochrona W PROCESIE (blokada per przypadek). Blokada miedzyprocesowa
(uvicorn z wieloma pracownikami) i bramka `snapshot_base_hash`/409 dla szablonow to
osobne decyzje wdrozeniowe — patrz `docs/audit/AUDYT_SZCZYTU_2026-08-01.md` sekcja 4
pkt 7.
"""

from __future__ import annotations

import json
import threading
import uuid
from pathlib import Path
from typing import Any

import enm.store as store
import pytest
from application.station_templates import get_template
from application.station_templates.apply import apply_template_to_case
from enm.catalog_completion import complete_catalog_defaults
from enm.domain_operations import execute_domain_operation
from enm.dziennik_zmian import wszystkie_wpisy, wyczysc_dziennik
from enm.models import EnergyNetworkModel, Generator
from enm.store import ZrodloZmiany, get_enm, reset_enm_store, set_enm

CATALOG_VERSION = "2024.1"
CABLE_ID = "cable-tfk-yakxs-3x120"
SOURCE_ID = "src-gpz-15kv-250mva-rx010"
SZABLON = "tpl_sn_nn_630kva"


@pytest.fixture(autouse=True)
def _czysty_magazyn(tmp_path, monkeypatch):
    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path))
    reset_enm_store()
    wyczysc_dziennik()
    yield
    reset_enm_store()
    wyczysc_dziennik()


def _pliki_robocze(katalog: Path) -> list[str]:
    """Pliki robocze zapisu atomowego pozostawione w magazynie.

    Nieudana operacja ma po sobie nie zostawiac RÓWNIEŻ smieci: plik roboczy
    dziennika powstaje przed podmiana snapshotu, wiec bez sprzatniecia rosłby
    z kazda odrzucona proba zapisu.
    """
    return sorted(p.name for p in katalog.glob("*.tmp"))


def _binding(namespace: str, item_id: str) -> dict[str, str]:
    return {
        "catalog_namespace": namespace,
        "catalog_item_id": item_id,
        "catalog_item_version": CATALOG_VERSION,
    }


def _operacja(enm_dict: dict[str, Any], nazwa: str, payload: dict[str, Any]) -> dict[str, Any]:
    wynik = execute_domain_operation(enm_dict=enm_dict, op_name=nazwa, payload=payload)
    assert not wynik.get("error"), wynik.get("error")
    snapshot = wynik.get("snapshot")
    assert isinstance(snapshot, dict)
    return snapshot


def _zbuduj_magistrale(case_key: str, liczba_odcinkow: int) -> list[str]:
    """Zrodlo GPZ + magistrala z N odcinkow — po jednym na kazdy rownolegly watek."""
    enm_dict = get_enm(case_key).model_dump(mode="json")
    enm_dict = _operacja(
        enm_dict,
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "sk3_mva": 250.0,
            "rx_ratio": 0.1,
            "catalog_binding": _binding("ZRODLO_SN", SOURCE_ID),
        },
    )
    for numer in range(liczba_odcinkow):
        enm_dict = _operacja(
            enm_dict,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": 120,
                    "name": f"Odcinek {numer + 1}",
                    "catalog_binding": _binding("KABEL_SN", CABLE_ID),
                },
            },
        )
    set_enm(case_key, EnergyNetworkModel.model_validate(enm_dict))
    segmenty = list(enm_dict["corridors"][0]["ordered_segment_refs"])
    assert len(segmenty) == liczba_odcinkow
    return segmenty


def _oczekiwane_rewizje(
    rewizje_przed: list[int],
    rewizja_modelu_przed: int,
    rewizja_modelu_po: int,
) -> list[int]:
    """Wpisy dziennika oczekiwane po zapisach: stan wyjsciowy + KAZDA nowa rewizja.

    Pomiar jest wzgledem stanu wyjsciowego, bo rewizja 1 to model DOMYSLNY tworzony
    w pamieci przez `get_enm` (`ENMHeader.revision = 1`) — nigdy nie przeszla przez
    zapis, wiec nie ma i nie powinna miec wpisu „co sie zmienilo". Kazda rewizja
    powstala z zapisu musi wpis miec — inaczej dziennik nie odpowie na pytanie
    „ktora zmiana uniewaznila moj wynik".
    """
    return rewizje_przed + list(range(rewizja_modelu_przed + 1, rewizja_modelu_po + 1))


def _rownolegle(zadania: list[Any]) -> list[BaseException]:
    """Uruchom zadania na wlasnych watkach, zsynchronizowane bariera.

    Bariera stoi w KAZDYM watku tuz przed wywolaniem — dopiero to wymusza uklad,
    w ktorym wszystkie watki czytaja model, zanim ktorykolwiek go zapisze.
    """
    bariera = threading.Barrier(len(zadania), timeout=60)
    bledy: list[BaseException] = []
    zamek = threading.Lock()

    def opakowanie(zadanie: Any) -> None:
        bariera.wait()
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


class TestWyscigZastosowaniaSzablonu:
    def test_cztery_rownolegle_zastosowania_daja_cztery_stacje(self) -> None:
        """4 watki x `apply` na jednym przypadku: +4 stacje, rewizja +8, zero bledow.

        P0.1 nN (karta P0.1, LV-INV-12): `apply_template_to_case` zaczyna od
        `get_enm`, ktory TERAZ TAKZE promuje `nn_field_specs` -> realne elementy
        (`enm/migrations/nn_field_specs_promocja.py`), a promocja MUTUJE model i
        podbija rewizje jak kazda inna automigracja (ten sam wzorzec co migracja
        punktu przylaczenia — `enm/store.py::_get_enm_pod_blokada`). Szablon zawsze
        zostawia po sobie nN-owe „field spec" do promocji, wiec kazde z 4 zastosowan
        (poza pierwszym, ktore nie zastaje niczego do promocji) na starcie promuje
        ODPLYWY POPRZEDNIEGO zastosowania (+1 rewizja), a WLASNE zapisuje wlasnym
        `set_enm` (+1 rewizja) — i ostatnie zastosowanie zostawia WLASNE odplywy
        niepromowane az do koncowego odczytu ponizej. Stad 2 rewizje na zastosowanie
        (4 wlasne zapisy + 3 promocje miedzy watkami + 1 promocja przy koncowym
        odczycie = 8), a NIE 1:1 — liczba STACJI (fizyczny skutek, ktory ten test
        bramkuje wobec defektu D4) zostaje +4, bez zmian.
        """
        szablon = get_template(SZABLON)
        assert szablon is not None
        case_key = str(uuid.uuid4())
        segmenty = _zbuduj_magistrale(case_key, 4)

        model_przed = get_enm(case_key)
        stacje_przed = len(model_przed.substations)
        rewizja_przed = model_przed.header.revision

        wyniki: list[dict[str, Any]] = []
        zamek = threading.Lock()

        def zadanie(segment_ref: str) -> Any:
            def wykonaj() -> None:
                wynik = apply_template_to_case(
                    template=szablon,
                    klucz_twin=case_key,
                    target_segment_id=segment_ref,
                    insert_at_ratio=0.5,
                    params_override={},
                    catalog_profile=None,
                )
                with zamek:
                    wyniki.append(wynik)

            return wykonaj

        bledy = _rownolegle([zadanie(ref) for ref in segmenty])

        assert bledy == [], f"Rownolegle zastosowania zglosily blad: {bledy}"
        assert len(wyniki) == 4

        model_po = get_enm(case_key)
        stacje_po = {stacja.ref_id for stacja in model_po.substations}
        assert len(model_po.substations) == stacje_przed + 4, (
            "Rownolegle zastosowania zgubily stacje: "
            f"{len(model_po.substations)} zamiast {stacje_przed + 4}"
        )
        assert model_po.header.revision == rewizja_przed + 2 * len(segmenty)

        brakujace = [
            wynik["station_ref"] for wynik in wyniki if wynik["station_ref"] not in stacje_po
        ]
        assert brakujace == [], (
            "API zwrocilo stacje, ktorych nie ma w modelu (fabrykacja wyniku): " f"{brakujace}"
        )

    def test_dziennik_ma_wpis_dla_kazdej_rewizji_po_wyscigu(self) -> None:
        """Liczba wpisow dziennika == liczba rewizji, bez dziur (wariant 3 defektu).

        Dziennik odpowiada na pytanie „ktora zmiana uniewaznila moj wynik" (V12K-264).
        Rewizja bez wpisu czyni te odpowiedz niemozliwa, wiec kazda rewizja modelu
        musi miec dokladnie jeden wpis — NIEZALEZNIE od PRZYCZYNY rewizji (wlasny
        zapis szablonu czy automigracja promocji nN uruchomiona przy odczycie, P0.1
        nN, patrz uzasadnienie `2 * len(segmenty)` w
        `test_cztery_rownolegle_zastosowania_daja_cztery_stacje` wyzej): kazda z nich
        idzie przez `set_enm`, wiec kazda dostaje wpis.
        """
        szablon = get_template(SZABLON)
        assert szablon is not None
        case_key = str(uuid.uuid4())
        segmenty = _zbuduj_magistrale(case_key, 3)
        rewizja_przed = get_enm(case_key).header.revision
        rewizje_przed = [wpis.rewizja for wpis in wszystkie_wpisy(case_key)]

        def zadanie(segment_ref: str) -> Any:
            def wykonaj() -> None:
                apply_template_to_case(
                    template=szablon,
                    klucz_twin=case_key,
                    target_segment_id=segment_ref,
                    insert_at_ratio=0.5,
                    params_override={},
                    catalog_profile=None,
                )

            return wykonaj

        bledy = _rownolegle([zadanie(ref) for ref in segmenty])
        assert bledy == []

        rewizja_po = get_enm(case_key).header.revision
        assert rewizja_po == rewizja_przed + 2 * len(segmenty)
        rewizje_w_dzienniku = [wpis.rewizja for wpis in wszystkie_wpisy(case_key)]
        oczekiwane = _oczekiwane_rewizje(rewizje_przed, rewizja_przed, rewizja_po)
        assert rewizje_w_dzienniku == oczekiwane, (
            "Dziura w dzienniku zmian — rewizje bez wpisu: "
            f"{sorted(set(oczekiwane) - set(rewizje_w_dzienniku))}"
        )


class TestWyscigZapisuModelu:
    def test_dwadziescia_powtorzen_rownoleglego_zapisu_bez_bledu_pliku(self) -> None:
        """20 rund x 4 rownolegle `set_enm`: zero bledow zapisu, rewizja +4 na runde.

        Ta bramka pilnuje kolizji WSPOLNEGO pliku roboczego: przed naprawa oba
        zapisy (snapshot i dziennik) uzywaly nazwy `<digest>.tmp`, wiec `replace()`
        drugiego watku konczyl sie `FileNotFoundError`, a uzytkownik dostawal blad
        zapisu mimo ze model w pamieci juz awansowal o rewizje.
        """
        case_key = str(uuid.uuid4())
        rewizja_startowa = get_enm(case_key).header.revision
        rewizje_przed = [wpis.rewizja for wpis in wszystkie_wpisy(case_key)]

        for runda in range(20):
            rewizja_przed = get_enm(case_key).header.revision

            def zadanie(numer: int, runda: int = runda) -> Any:
                def wykonaj() -> None:
                    model = get_enm(case_key).model_copy(deep=True)
                    model.header.name = f"Sieć {runda}-{numer}"
                    set_enm(case_key, model)

                return wykonaj

            bledy = _rownolegle([zadanie(numer) for numer in range(4)])
            assert bledy == [], f"Runda {runda}: rownolegly zapis zglosil blad {bledy}"

            model_po = get_enm(case_key)
            assert model_po.header.revision == rewizja_przed + 4, (
                f"Runda {runda}: rewizja {model_po.header.revision} zamiast "
                f"{rewizja_przed + 4} — zapis zostal zgubiony"
            )

        rewizja_koncowa = get_enm(case_key).header.revision
        assert rewizja_koncowa == rewizja_startowa + 80
        rewizje_w_dzienniku = [wpis.rewizja for wpis in wszystkie_wpisy(case_key)]
        assert rewizje_w_dzienniku == _oczekiwane_rewizje(
            rewizje_przed, rewizja_startowa, rewizja_koncowa
        )

    def test_nieudany_zapis_nie_awansuje_modelu_ani_dziennika(self) -> None:
        """Blad zapisu = ZERO skutku (wariant 2 defektu).

        Iniekcja bledu nosnika jest tu jedynym sposobem, zeby wejsc w sciezke
        wyjatku zapisu — sama sciezka jest produkcyjna (`_persist_enm` w
        `enm/store.py`). Przed naprawa `_enm_store[case_id] = enm` wykonywalo sie
        PRZED zapisem pliku, wiec uzytkownik dostawal HTTP 422 „blad zapisu", a zywy
        model byl juz o rewizje do przodu i bez wpisu w dzienniku.

        INTENCJA WZMOCNIONA (przeglad 2026-08-01, znaleziska P4/P6). Wczesniej test
        badal przypadek, ktorego plik jeszcze nie istnial, i sprawdzal, ze wycofanie
        ZAPISZE na dysk poprzednia rewizje. To bylo mierzenie skutku ubocznego:
        wycofanie zapisywalo plik, ktorego przed operacja NIE BYLO — czyli nieudana
        operacja zostawiala slad na nosniku. Teraz przypadek jest najpierw zapisany
        (plik istnieje), a bramka mierzy wprost to, co obiecuje docstring `set_enm`:
        po bledzie zapisu tresc pliku jest IDENTYCZNA CO DO BAJTU.
        """
        case_key = str(uuid.uuid4())
        poczatkowy = get_enm(case_key).model_copy(deep=True)
        poczatkowy.header.name = "Sieć przed nieudanym zapisem"
        model = set_enm(case_key, poczatkowy)
        rewizja_przed = model.header.revision
        hash_przed = model.header.hash_sha256
        rewizje_przed = [wpis.rewizja for wpis in wszystkie_wpisy(case_key)]
        bajty_przed = store._case_path(case_key).read_bytes()

        def zapis_z_awaria(case_id: str, snapshot: Any) -> None:
            raise OSError("nosnik odmowil zapisu")

        zmieniony = get_enm(case_key).model_copy(deep=True)
        zmieniony.header.name = "Sieć po nieudanym zapisie"
        # Wlasny kontekst podmiany, a NIE wspoldzielony `monkeypatch` testu: ten
        # sam obiekt trzyma podmiane `ENM_STORE_DIR` z fikstury, wiec `undo()`
        # przestawilby magazyn na katalog domyslny repozytorium w srodku testu.
        with pytest.MonkeyPatch.context() as podmiana:
            podmiana.setattr(store, "_persist_enm", zapis_z_awaria)
            with pytest.raises(OSError):
                set_enm(case_key, zmieniony)

        model_po = get_enm(case_key)
        assert model_po.header.revision == rewizja_przed
        assert model_po.header.hash_sha256 == hash_przed
        assert model_po.header.name == "Sieć przed nieudanym zapisem"
        rewizje_w_dzienniku = [wpis.rewizja for wpis in wszystkie_wpisy(case_key)]
        assert rewizja_przed + 1 not in rewizje_w_dzienniku
        assert rewizje_w_dzienniku == rewizje_przed

        assert store._case_path(case_key).read_bytes() == bajty_przed
        zapisany = json.loads(store._case_path(case_key).read_text(encoding="utf-8"))
        assert zapisany["revision"] == rewizja_przed
        assert zapisany["hash_sha256"] == hash_przed
        assert _pliki_robocze(store._store_dir()) == []

    def test_nieudany_zapis_nie_kasuje_snapshotu_z_dysku(self) -> None:
        """Wycofanie nie moze usunac stanu, ktorego nie zapisala ta operacja.

        Przypadek wczytany po restarcie procesu nie jest jeszcze w pamieci, wiec
        `set_enm` nie ma z czego odtworzyc modelu — wolno mu wtedy usunac WYLACZNIE
        plik powstaly w nieudanej probie. Skasowanie zastanego snapshotu byloby
        utrata pracy projektanta zamiast cofnieciem zmiany.
        """
        case_key = str(uuid.uuid4())
        model = get_enm(case_key).model_copy(deep=True)
        model.header.name = "Sieć zapisana wcześniej"
        zapisany_model = set_enm(case_key, model)
        tresc_przed = store._case_path(case_key).read_text(encoding="utf-8")

        # Pamiec pusta, plik zostaje — dokladnie stan po restarcie procesu.
        reset_enm_store(remove_persisted=False)

        def zepsuty_zapis(*_args: Any, **_kwargs: Any) -> None:
            raise OSError("nosnik odmowil zapisu")

        nowy = zapisany_model.model_copy(deep=True)
        nowy.header.name = "Sieć po nieudanym zapisie"
        with pytest.MonkeyPatch.context() as podmiana:
            podmiana.setattr(store, "_persist_enm", zepsuty_zapis)
            with pytest.raises(OSError):
                set_enm(case_key, nowy)

        assert store._case_path(case_key).exists(), "Wycofanie skasowalo zastany snapshot"
        assert store._case_path(case_key).read_text(encoding="utf-8") == tresc_przed


class TestWycofanieNieudanegoZapisu:
    """Operacja, ktora melduje blad, nie zostawia ZADNEGO skutku.

    DEFEKT, KTORY TE TESTY ZAMYKAJA (przeglad 2026-08-01, znaleziska P4 i P6).
    Docstring `set_enm` obiecywal „rewizja i jej wpis powstaja razem albo wcale",
    ale wycofanie nieudanego zapisu bylo niepelne w dwoch niezaleznych miejscach:

    1. ALIAS — gdy wolajacy podaje TEN SAM obiekt, ktory lezy w magazynie,
       podniesienie rewizji mutowalo rowniez „poprzedni" stan, wiec wycofanie
       przywracalo stan JUZ PODNIESIONY. Sciezka jest produkcyjna: po automigracji
       formatu `_get_enm_pod_blokada` wola `set_enm` obiektem z magazynu.
    2. DZIENNIK — wpis wchodzil do pamieci PRZED zapisem pliku, wiec awaria zapisu
       zostawiala wpis-ducha opisujacy operacje, ktora zostala cofnieta. Idempotencja
       po numerze rewizji czynila ten stan trwalym: kolejna, UDANA operacja o tym
       samym numerze trafiala na ducha i nie dopisywala niczego.

    ILOCZYN CECH, KTOREGO BRAKOWALO. Wczesniejsze bramki podawaly do `set_enm`
    wylacznie `model_copy(deep=True)` (nigdy obiektu z magazynu) i wstrzykiwaly
    awarie wylacznie w `_persist_enm` (nigdy w zapis dziennika) — obie galezie byly
    poza zasiegiem testow. Tutaj obie sa ćwiczone wprost.
    """

    @staticmethod
    def _zepsuty_zapis(*_args: Any, **_kwargs: Any) -> None:
        raise OSError("nosnik odmowil zapisu")

    def test_alias_z_magazynu_nie_awansuje_rewizji_po_nieudanym_zapisie(self) -> None:
        """`set_enm(case, obiekt_z_magazynu)` + awaria zapisu = rewizja bez zmian."""
        case_key = str(uuid.uuid4())
        poczatkowy = get_enm(case_key).model_copy(deep=True)
        poczatkowy.header.name = "Sieć bazowa"
        set_enm(case_key, poczatkowy, zrodlo_zmiany=ZrodloZmiany(operacja="add_sn_bay"))
        rewizja_przed = get_enm(case_key).header.revision
        bajty_przed = store._case_path(case_key).read_bytes()
        rewizje_przed = [wpis.rewizja for wpis in wszystkie_wpisy(case_key)]

        # ALIAS: `get_enm` oddaje ZYWY obiekt magazynu, a nie kopie — to jest
        # najzwyklejszy ksztalt wywolania i wlasnie on byl poza testami.
        aliasowany = get_enm(case_key)
        assert aliasowany is store._enm_store[case_key]
        # `set_enm` przepuszcza model przez uzupelnienie katalogowe; gdyby ono
        # zwrocilo NOWY obiekt, galaz aliasu nie zostalaby dotknieta i test badalby
        # co innego niz deklaruje.
        assert complete_catalog_defaults(aliasowany)[0] is aliasowany
        aliasowany.header.description = "zmiana wykonana na żywym obiekcie"

        with pytest.MonkeyPatch.context() as podmiana:
            podmiana.setattr(store, "_persist_enm", self._zepsuty_zapis)
            with pytest.raises(OSError):
                set_enm(case_key, aliasowany)

        assert store._enm_store[case_key].header.revision == rewizja_przed, (
            "Wycofanie przywrocilo stan JUZ PODNIESIONY o rewizje: poprzedni stan byl "
            "referencja do zmutowanego obiektu, a nie kopia sprzed mutacji"
        )
        assert store._case_path(case_key).read_bytes() == bajty_przed
        assert [wpis.rewizja for wpis in wszystkie_wpisy(case_key)] == rewizje_przed
        assert _pliki_robocze(store._store_dir()) == []
        # GRANICA GWARANCJI, powiedziana wprost: zmiana, ktora wolajacy wykonal na
        # zywym obiekcie PRZED wywolaniem, nie jest skutkiem `set_enm` i nie ma jej
        # z czego odtworzyc — stan wraca do tego z chwili WEJSCIA w zapis. `set_enm`
        # odpowiada za to, zeby nie DOLOZYC wlasnego skutku: rewizji, pliku ani wpisu.
        assert store._enm_store[case_key].header.description == "zmiana wykonana na żywym obiekcie"

    def test_automigracja_nie_zostawia_awansowanej_rewizji_po_nieudanym_zapisie(self) -> None:
        """Produkcyjne zrodlo aliasu: `get_enm` → automigracja → `set_enm` tym samym obiektem.

        Projekt zapisany starszym kodem (zastany klucz punktu przylaczenia) po
        restarcie procesu: pierwszy odczyt migruje model i probuje zapisac nowa
        rewizje. Gdy nosnik odmawia, projektant dostaje blad — i nie moze przy tym
        dostac modelu po cichu awansowanego o rewizje, ktorej dziennik nie zna.
        """
        case_key = str(uuid.uuid4())
        model = get_enm(case_key).model_copy(deep=True)
        model.generators = [
            Generator(
                ref_id="g1",
                name="Wytwórca 1",
                bus_ref="bus-1",
                p_mw=1.0,
                meta={"pcc_ref": "bus-1"},
            )
        ]
        zapisany = set_enm(case_key, model, zrodlo_zmiany=ZrodloZmiany(operacja="add_sn_bay"))
        # Bez `get_enm` w tym miejscu: odczyt sam uruchomilby automigracje i zapisal
        # juz zmigrowany model, wiec badany scenariusz (zastany klucz na dysku)
        # przestalby istniec.
        rewizja_przed = zapisany.header.revision
        bajty_przed = store._case_path(case_key).read_bytes()
        rewizje_przed = [wpis.rewizja for wpis in wszystkie_wpisy(case_key)]
        assert b"pcc_ref" in bajty_przed, "Zastany klucz nie trafil na dysk — nie ma co migrowac"

        # Restart procesu: pamiec pusta, pliki zostaja.
        reset_enm_store(remove_persisted=False)
        wyczysc_dziennik(usun_pliki=False)

        # Opakowanie tylko OBSERWUJE (wola oryginal) — sluzy dowodowi, ze alias
        # faktycznie powstaje na sciezce produkcyjnej, a nie tylko w teorii.
        oryginalny_set_enm = store.set_enm
        obserwacje: dict[str, bool] = {}

        def obserwowany_set_enm(
            case_id: str,
            enm: EnergyNetworkModel,
            *,
            zrodlo_zmiany: ZrodloZmiany | None = None,
        ) -> EnergyNetworkModel:
            obserwacje["alias"] = enm is store._enm_store.get(case_id)
            return oryginalny_set_enm(case_id, enm, zrodlo_zmiany=zrodlo_zmiany)

        with pytest.MonkeyPatch.context() as podmiana:
            podmiana.setattr(store, "set_enm", obserwowany_set_enm)
            podmiana.setattr(store, "_persist_enm", self._zepsuty_zapis)
            with pytest.raises(OSError):
                get_enm(case_key)

        assert obserwacje.get("alias") is True, (
            "Automigracja nie oddala do `set_enm` obiektu z magazynu — test nie "
            "dotknal galezi aliasu"
        )
        assert store._enm_store[case_key].header.revision == rewizja_przed
        assert store._case_path(case_key).read_bytes() == bajty_przed
        assert [wpis.rewizja for wpis in wszystkie_wpisy(case_key)] == rewizje_przed

    def test_nieudany_zapis_dziennika_nie_zostawia_wpisu_ducha(self) -> None:
        """Awaria zapisu pliku DZIENNIKA: brak wpisu w pamieci i na dysku, model bez zmian.

        Iniekcja siedzi na poziomie nosnika (`Path.write_text` dla pliku roboczego
        dziennika), a nie w podmianie funkcji produkcyjnej — to ta sama klasa awarii
        (ENOSPC), dla ktorej wycofanie zostalo napisane.
        """
        case_key = str(uuid.uuid4())
        poczatkowy = get_enm(case_key).model_copy(deep=True)
        poczatkowy.header.name = "Sieć bazowa"
        set_enm(
            case_key,
            poczatkowy,
            zrodlo_zmiany=ZrodloZmiany(operacja="add_grid_source_sn", utworzone=("ZRODLO-1",)),
        )
        rewizja_przed = get_enm(case_key).header.revision
        bajty_przed = store._case_path(case_key).read_bytes()
        rewizje_przed = [wpis.rewizja for wpis in wszystkie_wpisy(case_key)]

        oryginalny_write_text = Path.write_text

        def zapis_dziennika_z_awaria(self: Path, dane: str, **kwargs: Any) -> int:
            if ".dziennik.json." in self.name:
                raise OSError(28, "No space left on device")
            return oryginalny_write_text(self, dane, **kwargs)

        zmieniony = get_enm(case_key).model_copy(deep=True)
        zmieniony.header.name = "Sieć ze stacją, której nie ma"
        with pytest.MonkeyPatch.context() as podmiana:
            podmiana.setattr(Path, "write_text", zapis_dziennika_z_awaria)
            with pytest.raises(OSError):
                set_enm(
                    case_key,
                    zmieniony,
                    zrodlo_zmiany=ZrodloZmiany(
                        operacja="insert_station_on_segment_sn",
                        utworzone=("STACJA-A",),
                    ),
                )

        assert get_enm(case_key).header.revision == rewizja_przed
        assert store._case_path(case_key).read_bytes() == bajty_przed
        assert [wpis.rewizja for wpis in wszystkie_wpisy(case_key)] == rewizje_przed
        assert _pliki_robocze(store._store_dir()) == []

        # TRWALOSC ducha byla druga polowa defektu: idempotencja po numerze rewizji
        # sprawiala, ze kolejna UDANA operacja o tym samym numerze trafiala na wpis
        # operacji COFNIETEJ i nie dopisywala niczego. Dziennik na stale opisywalby
        # rewizje operacja, ktora sie nie odbyla.
        powtorka = get_enm(case_key).model_copy(deep=True)
        powtorka.header.name = "Sieć po udanej powtórce"
        set_enm(
            case_key,
            powtorka,
            zrodlo_zmiany=ZrodloZmiany(operacja="add_transformer_sn_nn", utworzone=("TRAFO-B",)),
        )
        wpisy_nowej_rewizji = [
            wpis for wpis in wszystkie_wpisy(case_key) if wpis.rewizja == rewizja_przed + 1
        ]
        assert len(wpisy_nowej_rewizji) == 1
        assert wpisy_nowej_rewizji[0].operacja == "add_transformer_sn_nn"
        assert wpisy_nowej_rewizji[0].utworzone == ("TRAFO-B",)
        assert all("STACJA-A" not in wpis.utworzone for wpis in wszystkie_wpisy(case_key))

    def test_nieudana_podmiana_dziennika_odtwarza_snapshot_co_do_bajtu(self) -> None:
        """Snapshot zapisany, podmiana dziennika padla → plik snapshotu wraca bajtowo.

        To jedyne okno, w ktorym nieudana operacja zdazyla juz podmienic plik
        snapshotu. Odtworzenie idzie z BAJTOW sprzed operacji, wiec na nosniku nie
        zostaje ani nowa rewizja, ani przepisany model.
        """
        case_key = str(uuid.uuid4())
        poczatkowy = get_enm(case_key).model_copy(deep=True)
        poczatkowy.header.name = "Sieć bazowa"
        set_enm(case_key, poczatkowy, zrodlo_zmiany=ZrodloZmiany(operacja="add_sn_bay"))
        rewizja_przed = get_enm(case_key).header.revision
        bajty_przed = store._case_path(case_key).read_bytes()
        rewizje_przed = [wpis.rewizja for wpis in wszystkie_wpisy(case_key)]

        oryginalny_replace = Path.replace

        def podmiana_dziennika_z_awaria(self: Path, cel: Any) -> Path:
            if str(cel).endswith(".dziennik.json"):
                raise OSError(5, "Input/output error")
            return oryginalny_replace(self, cel)

        zmieniony = get_enm(case_key).model_copy(deep=True)
        zmieniony.header.name = "Sieć ze stacją, której nie ma"
        with pytest.MonkeyPatch.context() as podmiana:
            podmiana.setattr(Path, "replace", podmiana_dziennika_z_awaria)
            with pytest.raises(OSError):
                set_enm(
                    case_key,
                    zmieniony,
                    zrodlo_zmiany=ZrodloZmiany(
                        operacja="insert_station_on_segment_sn",
                        utworzone=("STACJA-A",),
                    ),
                )

        assert get_enm(case_key).header.revision == rewizja_przed
        assert (
            store._case_path(case_key).read_bytes() == bajty_przed
        ), "Snapshot zostal na dysku o rewizje do przodu, choc operacja zglosila blad"
        assert [wpis.rewizja for wpis in wszystkie_wpisy(case_key)] == rewizje_przed
        assert _pliki_robocze(store._store_dir()) == []

    def test_blad_w_samym_wycofaniu_leci_wyzej_z_oryginalna_przyczyna(self) -> None:
        """Awaria PODCZAS wycofywania: pamiec cofnieta, blad widoczny z przyczyna.

        Gdy nosnik odmawia rowniez odtworzenia snapshotu, cofniecie pamieci jest juz
        wykonane (kolejnosc: pamiec przed nosnikiem), a wyjatek leci wyzej z
        ORYGINALNA przyczyna w kontekscie — awaria w trakcie wycofywania jest faktem,
        ktory inzynier musi zobaczyc, a nie stanem do przemilczenia.

        DLUG NAZWANY. Snapshot i dziennik to dwa osobne pliki i nie ma na nie jednej
        transakcji systemu plikow. W tym oknie na dysku zostaje rewizja bez wpisu —
        WYKRYWALNA (rewizja snapshotu wyzsza niz najwyzsza rewizja dziennika). Test
        mierzy ten stan wprost, zeby granica gwarancji byla faktem, a nie deklaracja.
        Od CV-2 (`enm/rewizje.py`) ten stan jest przy kolejnym wczytaniu modelu
        DOMYKANY: migawka rewizji biezacej jest odtwarzana z HEAD, a brakujacy wpis
        dziennika dopisywany z opisem nazywajacym brak przyczyny wprost.

        INTENCJA INIEKCJI (CV-2): awaria „wycofywania" ma trafic WYLACZNIE w
        odtworzenie snapshotu (`_przywroc_snapshot` pisze bajty do pliku roboczego
        w korzeniu magazynu). Zapis migawki rewizji (`enm/rewizje.py`, plik w
        katalogu `<digest>.rev/`) tez uzywa `Path.write_bytes`, ale jest krokiem
        PRZYGOTOWANIA, nie wycofania — iniekcja go omija, inaczej test mierzylby
        awarie przygotowania zamiast awarii wycofania.
        """
        case_key = str(uuid.uuid4())
        poczatkowy = get_enm(case_key).model_copy(deep=True)
        poczatkowy.header.name = "Sieć bazowa"
        set_enm(case_key, poczatkowy, zrodlo_zmiany=ZrodloZmiany(operacja="add_sn_bay"))
        rewizja_przed = get_enm(case_key).header.revision
        rewizje_przed = [wpis.rewizja for wpis in wszystkie_wpisy(case_key)]

        oryginalny_replace = Path.replace
        oryginalny_write_bytes = Path.write_bytes

        def podmiana_dziennika_z_awaria(self: Path, cel: Any) -> Path:
            if str(cel).endswith(".dziennik.json"):
                raise OSError(5, "podmiana dziennika odmowila")
            return oryginalny_replace(self, cel)

        def zapis_bajtow_z_awaria(self: Path, dane: bytes) -> int:
            if self.parent.name.endswith(".rev"):
                return oryginalny_write_bytes(self, dane)
            raise OSError(28, "wycofywanie: brak miejsca na nosniku")

        zmieniony = get_enm(case_key).model_copy(deep=True)
        zmieniony.header.name = "Sieć ze stacją, której nie ma"
        with pytest.MonkeyPatch.context() as podmiana:
            podmiana.setattr(Path, "replace", podmiana_dziennika_z_awaria)
            podmiana.setattr(Path, "write_bytes", zapis_bajtow_z_awaria)
            with pytest.raises(OSError) as blad:
                set_enm(
                    case_key,
                    zmieniony,
                    zrodlo_zmiany=ZrodloZmiany(operacja="insert_station_on_segment_sn"),
                )

        assert "wycofywanie" in str(blad.value)
        przyczyna = blad.value.__context__
        assert isinstance(przyczyna, OSError)
        assert "podmiana dziennika odmowila" in str(przyczyna)

        assert store._enm_store[case_key].header.revision == rewizja_przed
        assert [wpis.rewizja for wpis in wszystkie_wpisy(case_key)] == rewizje_przed

        # Granica gwarancji (dlug nazwany): snapshotu nie dalo sie odtworzyc.
        zapisany = json.loads(store._case_path(case_key).read_text(encoding="utf-8"))
        assert zapisany["revision"] == rewizja_przed + 1
        assert max(wpis.rewizja for wpis in wszystkie_wpisy(case_key)) < zapisany["revision"]
