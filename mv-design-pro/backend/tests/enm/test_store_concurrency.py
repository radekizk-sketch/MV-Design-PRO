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
from typing import Any

import enm.store as store
import pytest
from application.station_templates import get_template
from application.station_templates.apply import apply_template_to_case
from enm.domain_operations import execute_domain_operation
from enm.dziennik_zmian import wszystkie_wpisy, wyczysc_dziennik
from enm.models import EnergyNetworkModel
from enm.store import get_enm, reset_enm_store, set_enm

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
        """4 watki x `apply` na jednym przypadku: +4 stacje, rewizja +4, zero bledow."""
        szablon = get_template(SZABLON)
        assert szablon is not None
        case_id = uuid.uuid4()
        case_key = str(case_id)
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
                    case_id=case_id,
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
        assert model_po.header.revision == rewizja_przed + 4

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
        musi miec dokladnie jeden wpis.
        """
        szablon = get_template(SZABLON)
        assert szablon is not None
        case_id = uuid.uuid4()
        case_key = str(case_id)
        segmenty = _zbuduj_magistrale(case_key, 3)
        rewizja_przed = get_enm(case_key).header.revision
        rewizje_przed = [wpis.rewizja for wpis in wszystkie_wpisy(case_key)]

        def zadanie(segment_ref: str) -> Any:
            def wykonaj() -> None:
                apply_template_to_case(
                    template=szablon,
                    case_id=case_id,
                    target_segment_id=segment_ref,
                    insert_at_ratio=0.5,
                    params_override={},
                    catalog_profile=None,
                )

            return wykonaj

        bledy = _rownolegle([zadanie(ref) for ref in segmenty])
        assert bledy == []

        rewizja_po = get_enm(case_key).header.revision
        assert rewizja_po == rewizja_przed + 3
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
        """
        case_key = str(uuid.uuid4())
        model = get_enm(case_key)
        rewizja_przed = model.header.revision
        hash_przed = model.header.hash_sha256
        rewizje_przed = [wpis.rewizja for wpis in wszystkie_wpisy(case_key)]

        # Awaria dotyczy TYLKO proby zapisu nowej rewizji — wycofanie (odtworzenie
        # poprzedniego stanu na dysku) ma sie udac, bo inaczej test nie sprawdzilby,
        # co zostaje w pliku.
        oryginalny_zapis = store._persist_enm
        wywolania = {"licznik": 0}

        def zapis_z_awaria(case_id: str, snapshot: Any) -> None:
            wywolania["licznik"] += 1
            if wywolania["licznik"] == 1:
                raise OSError("nosnik odmowil zapisu")
            oryginalny_zapis(case_id, snapshot)

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
        rewizje_w_dzienniku = [wpis.rewizja for wpis in wszystkie_wpisy(case_key)]
        assert rewizja_przed + 1 not in rewizje_w_dzienniku
        assert rewizje_w_dzienniku == rewizje_przed

        zapisany = json.loads(store._case_path(case_key).read_text(encoding="utf-8"))
        assert zapisany["revision"] == rewizja_przed
        assert zapisany["hash_sha256"] == hash_przed

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
