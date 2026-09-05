"""Magazyn ENM — JEDEN model sieci per KLUCZ TWIN (CV-1: klucz = projekt).

KONTRAKT KLUCZA (docs/architecture/CANONICAL_TWIN_ARCHITECTURE.md §A.2, ADR-012 korekta
2026-09-04): magazyn jest kluczowany kluczem Canonical Project Twin
(`enm/klucz_twin.klucz_twin_projektu(project_id)` → `projekt:<uuid>`). `case_id`
NIE jest kluczem magazynu — jest adresem wejściowym API tłumaczonym na klucz
projektu w jednym miejscu (`application/twin_key.py`). Klucz surowy (dowolny
napis) pozostaje dopuszczalny WYŁĄCZNIE w testach jednostkowych magazynu;
w warstwie API/aplikacji pilnuje tego guard `scripts/enm_store_key_guard.py`.

Migracja zastanych plików per przypadek (`sha256(case_id).json`) do klucza
projektu: `migruj_klucz_przypadku_do_projektu` (niżej) — nic nie jest tracone:
model przypadku aktywnego staje się modelem projektu, pozostałe trafiają do
`legacy_przypadki/` z manifestem (status ZGODNY/ROZBIEZNY).
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import threading
from dataclasses import dataclass
from datetime import UTC, datetime
from hashlib import sha256
from pathlib import Path
from typing import Any

from enm.catalog_completion import complete_catalog_defaults
from enm.dziennik_zmian import (
    OPIS_PRZENIESIENIA_Z_PRZYPADKU,
    OPIS_PRZYWROCENIA_Z_ARCHIWUM,
    OPIS_WPISU_ODTWORZONEGO,
    PrzygotowanyWpis,
    sciezka_tymczasowa,
    skopiuj_dziennik,
    wpis_rewizji,
)
from enm.dziennik_zmian import przygotuj_dopisanie as przygotuj_wpis_dziennika
from enm.hash import compute_enm_hash
from enm.migrations.nn_field_specs_promocja import migruj as promuj_nn_field_specs
from enm.migrations.punkt_przylaczenia_der import migruj as migruj_punkt_przylaczenia
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from enm.rewizje import (
    PrzygotowanaRewizja,
    przenies_katalog_rewizji,
    przygotuj_rewizje,
    skopiuj_katalog_rewizji,
    usun_wszystkie_migawki,
    uzgodnij_indeks,
    wczytaj_rewizje,
    zapewnij_migawke,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ZrodloZmiany:
    """Przyczyna nowej rewizji modelu — kanoniczna nazwa operacji + dotkniete elementy.

    Wypelnia ja warstwa, ktora ZNA operacje (koncowka operacji domenowych), bo
    `set_enm` widzi tylko rezultat. Pola listowe pochodza WPROST z
    `changes.{created,updated,deleted}_element_ids` odpowiedzi operacji — zadna
    z nich nie jest tu wyliczana ani zgadywana.
    """

    operacja: str | None
    utworzone: tuple[str, ...] = ()
    zmienione: tuple[str, ...] = ()
    usuniete: tuple[str, ...] = ()
    #: CV-2: PELNY ladunek komendy domenowej (dokladnie to, co przyszlo w zadaniu
    #: operacji) — dziennik niesie odtad nie tylko nazwe i listy elementow, ale
    #: tresc komendy, ktora wytworzyla rewizje. `None` = zapis bez komendy.
    ladunek: dict[str, Any] | None = None


_enm_store: dict[str, EnergyNetworkModel] = {}
_DEFAULT_STORE_DIR = Path(__file__).resolve().parents[2] / ".enm_store"

# Blokady zapisu modelu — JEDNA na przypadek obliczeniowy.
_blokady_twin: dict[str, threading.RLock] = {}
_rejestr_blokad = threading.Lock()


def blokada_twin(klucz: str) -> threading.RLock:
    """Blokada CALEGO cyklu odczyt→przeliczenie→zapis modelu jednego twin (klucz projektu).

    DLUG, KTORY TO ZAMYKA (defekt D4 audytu 2026-08-01). `set_enm` czyta biezacy
    model, liczy z niego nowa rewizje i podmienia wpis w globalnym slowniku. Ta
    sekwencja nie byla niczym serializowana, a koncowka `POST
    /api/station-templates/{id}/apply` jest zdefiniowana jako `def`, wiec Starlette
    oddaje ja do PULI WATKOW — dwa zadania biegly naprawde rownolegle na tej samej
    bazie wyjsciowej. Zwyciezal ten, ktory zapisal jako ostatni; praca drugiego
    znikala, a API meldowalo HTTP 200 z lista utworzonych elementow, ktorych w
    modelu nie ma (zmierzone: 4 zadania → +1 stacja, rewizja +4).

    DLACZEGO `threading.RLock`, A NIE `asyncio.Lock`. Wyscig siedzi w watkach
    roboczych, a nie w petli zdarzen — blokada asynchroniczna nie obejmuje kodu
    wykonywanego przez pule watkow. `RLock` jest REENTRANTNY, bo `get_enm` moze
    zawolac `set_enm` (migracja formatu, uzupelnienie danych katalogowych), a
    warstwa wyzej (zastosowanie szablonu stacji) trzyma te sama blokade przez caly
    cykl — blokada nie-reentrantna zakleszczylaby sie na wlasnym watku.

    ZAKRES: ochrona W PROCESIE. Blokada miedzyprocesowa (uvicorn z wiecej niz
    jednym pracownikiem, wiele instancji) jest osobna decyzja wdrozeniowa i NIE
    jest tu realizowana — patrz `docs/audit/AUDYT_SZCZYTU_2026-08-01.md`, sekcja 4
    pkt 7.
    """
    with _rejestr_blokad:
        blokada = _blokady_twin.get(klucz)
        if blokada is None:
            blokada = threading.RLock()
            _blokady_twin[klucz] = blokada
        return blokada


def _store_dir() -> Path:
    configured = os.getenv("ENM_STORE_DIR")
    return Path(configured) if configured else _DEFAULT_STORE_DIR


def _case_path(klucz: str) -> Path:
    digest = sha256(klucz.encode("utf-8")).hexdigest()
    return _store_dir() / f"{digest}.json"


def _load_persisted_enm(klucz: str) -> EnergyNetworkModel | None:
    path = _case_path(klucz)
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    snapshot = payload.get("snapshot")
    if not isinstance(snapshot, dict):
        return None
    try:
        return EnergyNetworkModel.model_validate(snapshot)
    except ValueError:
        return None


def _persist_enm(klucz: str, enm: EnergyNetworkModel) -> None:
    store_dir = _store_dir()
    store_dir.mkdir(parents=True, exist_ok=True)
    path = _case_path(klucz)
    tmp_path = sciezka_tymczasowa(path)
    payload = {
        "klucz": klucz,
        "snapshot": enm.model_dump(mode="json"),
        "hash_sha256": enm.header.hash_sha256,
        "revision": enm.header.revision,
        "updated_at": enm.header.updated_at.isoformat(),
    }
    try:
        tmp_path.write_text(
            json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
            encoding="utf-8",
        )
        tmp_path.replace(path)
    except OSError:
        # Nieudany zapis nie moze zostawic po sobie pliku roboczego — nazwa jest
        # teraz unikalna, wiec nikt inny go nie sprzatnie.
        tmp_path.unlink(missing_ok=True)
        raise


def _tresc_snapshotu(klucz: str) -> bytes | None:
    """Bajty zapisanego snapshotu — MATERIAL DO WYCOFANIA nieudanego zapisu.

    Wycofanie odtwarza plik CO DO BAJTU, a nie „zapisuje poprzedni model" —
    poprzedni model w pamieci moze sie roznic od tresci na dysku (np. po
    automigracji formatu, ktora zmienila model, ale jeszcze go nie zapisala), wiec
    zapis z pamieci zostawilby na nosniku slad operacji, ktora zglosila blad.

    `None` znaczy: pliku NIE BYLO przed operacja (wycofanie ma wtedy usunac
    wylacznie to, co ta nieudana proba utworzyla). Bledu odczytu NIE tlumimy:
    skoro nie umiemy zrobic kopii stanu, ktory za chwile nadpiszemy, nie
    zaczynamy zapisu — blad leci przed jakakolwiek zmiana, wiec skutku nie ma.
    """
    try:
        return _case_path(klucz).read_bytes()
    except FileNotFoundError:
        return None


def _przywroc_snapshot(klucz: str, tresc: bytes | None) -> None:
    """Odtworz plik snapshotu DOKLADNIE w stanie sprzed nieudanego zapisu."""
    path = _case_path(klucz)
    if tresc is None:
        path.unlink(missing_ok=True)
        return
    tmp = sciezka_tymczasowa(path)
    try:
        tmp.write_bytes(tresc)
        tmp.replace(path)
    except OSError:
        tmp.unlink(missing_ok=True)
        raise


def has_enm(klucz: str) -> bool:
    """Return whether a case already has a materialized ENM snapshot."""
    return klucz in _enm_store or _case_path(klucz).exists()


def get_enm(klucz: str) -> EnergyNetworkModel:
    """Return the current ENM snapshot for a case, creating a default model if needed."""
    with blokada_twin(klucz):
        return _get_enm_pod_blokada(klucz)


def _get_enm_pod_blokada(klucz: str) -> EnergyNetworkModel:
    # Odczyt bierze te sama blokade co zapis, bo NIE JEST czystym odczytem:
    # tworzy model domyslny, migruje format i uzupelnia dane katalogowe, a wynik
    # ZAPISUJE (`set_enm` nizej). Bez blokady dwa rownolegle odczyty swiezego
    # przypadku utworzylyby dwa rozne modele domyslne.
    if klucz not in _enm_store:
        persisted = _load_persisted_enm(klucz)
        if persisted is not None:
            _enm_store[klucz] = persisted
            _uzgodnij_po_wczytaniu(klucz, persisted)
        else:
            enm = EnergyNetworkModel(
                header=ENMHeader(
                    name=f"Model sieci - {klucz[:8]}",
                    defaults=ENMDefaults(),
                ),
            )
            enm.header.hash_sha256 = compute_enm_hash(enm)
            _enm_store[klucz] = enm
    # V12K-268: automigracja nazwy klucza punktu przyłączenia wytwórcy. Ta sama
    # ścieżka co uzupełnianie domyślnych katalogowych poniżej — model naprawiony
    # przy wczytaniu jest ZAPISYWANY, żeby migracja wykonała się RAZ, a nie przy
    # każdym odczycie. Kolejność ma znaczenie: migracja idzie PRZED uzupełnianiem
    # katalogu, bo reguły katalogowe mają widzieć już kanoniczne nazwy.
    zmigrowany, zmieniona_nazwa = migruj_punkt_przylaczenia(_enm_store[klucz])
    if zmieniona_nazwa:
        _enm_store[klucz] = zmigrowany

    # P0.1 nN (karta P0.1, C §4.2, LV-INV-12): promocja `nn_field_specs` →
    # realne elementy grafu. PO migracji punktu przyłączenia (kolejność ma
    # znaczenie tak samo jak wyżej), PRZED uzupełnianiem katalogu — reguły
    # katalogowe mają widzieć już realne gałęzie/szyny nN, nie worek meta.
    zmigrowany_nn, zmieniona_promocja_nn = promuj_nn_field_specs(_enm_store[klucz])
    if zmieniona_promocja_nn:
        _enm_store[klucz] = zmigrowany_nn

    completed, changed = complete_catalog_defaults(_enm_store[klucz])
    if changed or zmieniona_nazwa or zmieniona_promocja_nn:
        return set_enm(klucz, completed)
    return _enm_store[klucz]


def set_enm(
    klucz: str,
    enm: EnergyNetworkModel,
    *,
    zrodlo_zmiany: ZrodloZmiany | None = None,
) -> EnergyNetworkModel:
    """Persist an ENM snapshot with deterministic hash and revision management.

    `zrodlo_zmiany` (V12K-264) niesie PRZYCZYNE nowej rewizji do dziennika zmian —
    to jedyne miejsce w systemie, w ktorym rewizja rosnie, wiec tylko tutaj wpis
    moze powstac dokladnie raz na rewizje. Parametr jest OPCJONALNY i nie zmienia
    zadnego hasha: dziennik jest zapisem rownoleglym (patrz `enm/dziennik_zmian.py`),
    a nie polem modelu. Zapis bez zrodla trafia do dziennika z `operacja = None` —
    projektant ma wiedziec, ze rewizja powstala, nawet gdy przyczyna nie zostala
    zarejestrowana; cisza w tym miejscu bylaby luka w historii.

    CALY cykl (odczyt biezacego modelu → wyliczenie rewizji → podmiana w pamieci →
    zapis pliku → wpis do dziennika) biegnie w JEDNEJ sekcji krytycznej przypadku
    (defekt D4). Dlatego rewizja i jej wpis w dzienniku powstaja razem albo wcale:
    dziennik odpowiada na pytanie „ktora zmiana uniewaznila moj wynik" (V12K-264) i
    z dziurami nie odpowiada.

    „Razem albo wcale" nie jest tu sama deklaracja — stoi na trzech konkretach
    (przeglad 2026-08-01, znaleziska P4 i P6): material do wycofania jest KOPIA
    stanu sprzed mutacji, a nie referencja do obiektu, ktory ta mutacja wlasnie
    zmienila; wpis dziennika wchodzi do pamieci dopiero po udanej podmianie jego
    pliku (`enm/dziennik_zmian.PrzygotowanyWpis`); a plik snapshotu wraca do stanu
    CO DO BAJTU i tylko wtedy, gdy ta operacja go faktycznie podmienila. Zakres i
    granice tej gwarancji: `_wycofaj_nieudany_zapis` nizej.
    """
    with blokada_twin(klucz):
        return _set_enm_pod_blokada(klucz, enm, zrodlo_zmiany=zrodlo_zmiany)


def _set_enm_pod_blokada(
    klucz: str,
    enm: EnergyNetworkModel,
    *,
    zrodlo_zmiany: ZrodloZmiany | None,
) -> EnergyNetworkModel:
    enm, _ = complete_catalog_defaults(enm)
    existing = _enm_store.get(klucz)
    if existing is not None:
        # KOPIA TYLKO NAGŁÓWKA (karta S9-9). Kandydat służy WYŁĄCZNIE do policzenia
        # hasza „przy rewizji poprzednika" i jest porzucany w tej samej linijce.
        # Jedyna mutacja to `header.revision`, a `compute_enm_hash` czyta model
        # przez `model_dump` (nie mutuje), więc kopiować trzeba SAM nagłówek —
        # reszta pól może zostać współdzielona, bo nikt jej tu nie rusza.
        # Hasz jest funkcją WARTOSCI pól, więc wynik jest identyczny co do bajtu
        # jak przy kopii głębokiej, a wołający nie widzi śladu (przypięte:
        # `tests/enm/test_kopia_graniczna.py::TestKandydatRewizji`).
        # POMIAR (S9-9, model 100 stacji): 60,9 ms → 0,02 ms.
        same_revision_candidate = enm.model_copy(
            update={"header": enm.header.model_copy(deep=True)}
        )
        same_revision_candidate.header.revision = existing.header.revision
        if compute_enm_hash(same_revision_candidate) == existing.header.hash_sha256:
            _persist_enm(klucz, existing)
            # CV-2: rewizja biezaca ma miec migawke takze wtedy, gdy trafila na
            # nosnik bez podniesienia numeru (model domyslny utworzony w pamieci,
            # zapis rownowazny tresciowo).
            zapewnij_migawke(klucz, existing, hash_sha256=existing.header.hash_sha256)
            return existing

    # MATERIAL DO WYCOFANIA pobrany PRZED jakakolwiek mutacja — i trzymany jako
    # KOPIA, nie referencja (znalezisko P4 przegladu 2026-08-01). Wolajacy ma prawo
    # podac TEN SAM obiekt, ktory lezy w magazynie (`enm is existing`) — tak robi
    # `_get_enm_pod_blokada` po automigracji formatu. Podniesienie rewizji ponizej
    # mutuje wtedy rowniez `existing`, wiec „przywrocenie" referencji oddawaloby
    # stan JUZ PODNIESIONY: uzytkownik dostawal blad zapisu, a model po cichu
    # awansowal o rewizje, ktorej dziennik nie zna.
    # KOSZT NAZWANY: kopia to ok. 8 ms na modelu 120 szyn / 119 galezi (~20% czasu
    # calego `set_enm`, zmierzone) — ta sama klasa kosztu co kopia liczona wyzej dla
    # porownania hasza. Kopia jest tu bezwarunkowa, bo wspoldzielenie obiektow miedzy
    # `enm` a magazynem nie musi byc pelnym aliasem (wystarczy wspolny `header`), a
    # kryterium „czy da sie wycofac" nie moze zalezec od domyslu o wolajacym.
    poprzedni = existing.model_copy(deep=True) if existing is not None else None
    tresc_snapshotu = _tresc_snapshotu(klucz)

    old_rev = existing.header.revision if existing else 0
    enm.header.revision = old_rev + 1
    enm.header.updated_at = datetime.now(UTC)
    enm.header.hash_sha256 = compute_enm_hash(enm)
    _enm_store[klucz] = enm

    wpis_dziennika: PrzygotowanyWpis | None = None
    migawka: PrzygotowanaRewizja | None = None
    snapshot_zatwierdzony = False
    migawka_zatwierdzona = False
    try:
        # KOLEJNOSC ZAPISOW jest czescia naprawy, nie przypadkiem. Najpierw WSZYSTKIE
        # tresci ida na nosnik jako pliki robocze (dziennik tutaj, migawka rewizji
        # w `przygotuj_rewizje`, snapshot wewnatrz `_persist_enm`), a dopiero potem
        # nastepuja podmiany. Awaria klasy „nosnik odmawia zapisu" (ENOSPC/EACCES/
        # EIO) trafia wiec w faze PRZYGOTOWANIA, kiedy nie ma jeszcze czego cofac
        # na dysku. Podmiany ida w kolejnosci HEAD → migawka rewizji → dziennik:
        # HEAD jest autorytatywny (regula spojnosci w `enm/rewizje.py`), migawka
        # zatwierdzona bez dziennika jest sierota do sprzatniecia, a dziennik
        # zatwierdzamy jako OSTATNI, bo jego podmiana jest jedynym krokiem, po
        # ktorym nie zostaje juz nic do zrobienia.
        wpis_dziennika = przygotuj_wpis_dziennika(
            klucz,
            rewizja=enm.header.revision,
            operacja=zrodlo_zmiany.operacja if zrodlo_zmiany else None,
            utworzone=zrodlo_zmiany.utworzone if zrodlo_zmiany else (),
            zmienione=zrodlo_zmiany.zmienione if zrodlo_zmiany else (),
            usuniete=zrodlo_zmiany.usuniete if zrodlo_zmiany else (),
            znacznik_czasu=enm.header.updated_at,
            hash_sha256=enm.header.hash_sha256,
            rodzic=old_rev if existing is not None else None,
            ladunek=zrodlo_zmiany.ladunek if zrodlo_zmiany else None,
        )
        migawka = przygotuj_rewizje(klucz, enm, hash_sha256=enm.header.hash_sha256)
        _persist_enm(klucz, enm)
        snapshot_zatwierdzony = True
        migawka.zatwierdz()
        migawka_zatwierdzona = True
        wpis_dziennika.zatwierdz()
    except Exception:
        _wycofaj_nieudany_zapis(
            klucz,
            poprzedni,
            wpis_dziennika=wpis_dziennika,
            tresc_snapshotu=tresc_snapshotu,
            snapshot_zatwierdzony=snapshot_zatwierdzony,
            migawka=migawka,
            migawka_zatwierdzona=migawka_zatwierdzona,
        )
        raise
    return enm


def _uzgodnij_po_wczytaniu(klucz: str, persisted: EnergyNetworkModel) -> None:
    """Po wczytaniu HEAD z nosnika: indeks migawek zgodny z HEAD, dziennik bez luki
    dla rewizji biezacej (CV-2; wolane RAZ na proces i klucz, pod blokada twin).

    Migawka biezacej rewizji brakujaca (magazyn sprzed CV-2) jest odtwarzana z
    HEAD; wpis dziennika brakujacy dla rewizji biezacej jest dopisywany z opisem
    nazywajacym brak przyczyny wprost (`OPIS_WPISU_ODTWORZONEGO`) — nigdy ze
    zgadnieta operacja.
    """
    raport = uzgodnij_indeks(klucz, persisted)
    if raport.cokolwiek:
        logger.info(
            "uzgodnienie_migawek klucz=%s rewizja=%s osierocone=%s odtworzona=%s "
            "zastapiona=%s robocze=%s",
            klucz,
            persisted.header.revision,
            raport.usuniete_osierocone,
            raport.odtworzona_biezaca,
            raport.zastapiona_biezaca,
            raport.usuniete_robocze,
        )
    if wpis_rewizji(klucz, persisted.header.revision) is None:
        przygotuj_wpis_dziennika(
            klucz,
            rewizja=persisted.header.revision,
            operacja=None,
            opis_pl=OPIS_WPISU_ODTWORZONEGO,
            znacznik_czasu=persisted.header.updated_at,
            hash_sha256=compute_enm_hash(persisted),
        ).zatwierdz()


def checkout(klucz: str, rewizja: int) -> EnergyNetworkModel:
    """Model DOKLADNIE w rewizji `rewizja` (CV-2, `ModelRevision.checkout`).

    Rewizja biezaca wraca jako kopia modelu z pamieci (jest tozsama z HEAD,
    takze gdy model domyslny nie trafil jeszcze na nosnik); kazda inna — z
    migawki `enm/rewizje.py`, zweryfikowanej hashem tresci. Brak migawki =
    `RewizjaNieistniejeError` (rewizja sprzed rejestru rewizji albo nigdy nie
    zapisana); rozjazd tresci = `RewizjaUszkodzonaError`. Zwrocony model jest
    KOPIA — mutacja nie dotyka magazynu.
    """
    with blokada_twin(klucz):
        biezacy = _get_enm_pod_blokada(klucz)
        if rewizja == biezacy.header.revision:
            return biezacy.model_copy(deep=True)
        return wczytaj_rewizje(klucz, rewizja)


def rewizja_biezaca(klucz: str) -> int:
    """Numer rewizji biezacej modelu pod kluczem (po ewentualnych automigracjach)."""
    return get_enm(klucz).header.revision


def restore_enm(klucz: str, snapshot: dict) -> EnergyNetworkModel | None:
    """Przywróć snapshot ENM z archiwum projektu 1:1 (import ZIP, N-D1).

    W odróżnieniu od `set_enm` NIE podbija rewizji, NIE przelicza hasha i NIE
    dopisuje wpisu do dziennika zmian — przywrócony model ma być bajtowo
    tożsamy z wyeksportowanym (round-trip archiwum, inwariant LV-INV-10:
    rewizja/hash wyniku wskazują na tę samą rewizję modelu co przed eksportem).
    Zwraca None, gdy snapshot nie waliduje się jako EnergyNetworkModel —
    decyzję o zgłoszeniu ostrzeżenia podejmuje warstwa importu.
    Zapis pod blokadą przypadku (ten sam reżim co set_enm); import tworzy NOWY
    klucz, więc nie ma poprzedniej rewizji do wycofywania.
    """
    try:
        enm = EnergyNetworkModel.model_validate(snapshot)
    except ValueError:
        return None
    with blokada_twin(klucz):
        _enm_store[klucz] = enm
        _persist_enm(klucz, enm)
        # CV-2: rewizja przywrocona ma migawke i wpis dziennika nazywajacy zrodlo
        # (import archiwum) — bez podbicia rewizji i bez zmiany hasha (LV-INV-10);
        # dziennik i migawki leza poza modelem, wiec round-trip archiwum jest
        # nadal bajtowo tozsamy.
        hash_tresci = compute_enm_hash(enm)
        zapewnij_migawke(klucz, enm, hash_sha256=hash_tresci)
        przygotuj_wpis_dziennika(
            klucz,
            rewizja=enm.header.revision,
            operacja=None,
            opis_pl=OPIS_PRZYWROCENIA_Z_ARCHIWUM,
            znacznik_czasu=enm.header.updated_at,
            hash_sha256=hash_tresci,
        ).zatwierdz()
    return enm


def _wycofaj_nieudany_zapis(
    klucz: str,
    poprzedni: EnergyNetworkModel | None,
    *,
    wpis_dziennika: PrzygotowanyWpis | None,
    tresc_snapshotu: bytes | None,
    snapshot_zatwierdzony: bool,
    migawka: PrzygotowanaRewizja | None = None,
    migawka_zatwierdzona: bool = False,
) -> None:
    """Cofnij rewizje, ktorej NIE UDALO SIE zapisac (defekt D4, wariant 2 i 3).

    CV-2: migawka rewizji jest cofana miedzy dziennikiem a snapshotem — plik
    roboczy jest sprzatany, a migawka juz ZATWIERDZONA (blad przyszedl przy
    zatwierdzaniu dziennika) usuwana, bo HEAD wraca do rewizji poprzedniej i
    migawka `n` bylaby sierota. Awaria samego usuniecia migawki nie przerywa
    wycofania (sierote sprzata `uzgodnij_indeks` przy wczytaniu) — jest logowana.

    Wczesniej `_enm_store[klucz] = enm` wykonywalo sie PRZED zapisem pliku, wiec
    wyjatek zapisu zostawial system w stanie, ktorego nikt nie zadeklarowal:
    uzytkownik dostawal „blad zapisu", a zywy model byl juz o rewizje do przodu
    (zmierzone: rewizja +4 przy dwoch odpowiedziach 200), dziennik zas nie mial
    wpisu dla tej rewizji (zmierzone dziury: rewizje 7 i 9 bez wpisu). Operacja,
    ktora melduje blad, ma nie zostawiac po sobie ZADNEGO skutku.

    KOLEJNOSC COFANIA jest odwrotna do ryzyka: najpierw pamiec (nie ma jak sie nie
    udac), potem sprzatniecie pliku roboczego, a NA KONCU jedyny krok dotykajacy
    nosnika. Gdy odtworzenie pliku padnie na tej samej awarii, stan w pamieci jest
    juz cofniety — wyjatek leci wyzej z oryginalnym bledem w kontekscie (awaria
    nosnika w trakcie wycofywania jest faktem, ktory inzynier musi zobaczyc), a nie
    zostawia modelu o rewizje do przodu.

    DZIENNIK nie ma tu czego cofac: jego wpis wchodzi do pamieci dopiero po udanej
    podmianie pliku (`PrzygotowanyWpis`), wiec nieudany zapis nie zostawia
    wpisu-ducha ani w pamieci, ani na dysku. Tutaj sprzatamy wylacznie plik roboczy.

    SNAPSHOT odtwarzamy TYLKO wtedy, gdy jego podmiana faktycznie sie odbyla —
    `_persist_enm` jest atomowy (zapis roboczy + `replace()`), wiec jego wyjatek
    znaczy, ze plik docelowy jest nietkniety i nie wolno go ruszac. Odtworzenie idzie
    z BAJTOW sprzed operacji, a nie z modelu w pamieci; `tresc_snapshotu is None`
    znaczy „pliku nie bylo", wiec usuwamy wylacznie plik powstaly w tej nieudanej
    probie. Skasowanie zastanego snapshotu (np. wczytanego po restarcie procesu)
    byloby utrata pracy projektanta zamiast cofnieciem zmiany.

    DLUG NAZWANY — atomowosc DWOCH plikow. Snapshot i dziennik to dwa osobne pliki;
    system plikow nie daje jednej transakcji na oba, wiec pelnej atomowosci nie da
    sie tu osiagnac bez dziennika zapisu wyprzedzajacego (WAL). Kolejnosc powyzej
    zawezia okno do jednego przypadku: `replace()` snapshotu sie udal, a `replace()`
    dziennika padl — obie tresci lezaly juz wtedy na nosniku, wiec zostaje awaria
    samej podmiany (EIO, znikniecie katalogu). Gdy w tym oknie padnie takze
    odtworzenie snapshotu, na dysku zostaje rewizja bez wpisu w dzienniku; jest ona
    WYKRYWALNA (rewizja snapshotu wyzsza niz najwyzsza rewizja w dzienniku).
    """
    if poprzedni is None:
        _enm_store.pop(klucz, None)
    else:
        _enm_store[klucz] = poprzedni
    if wpis_dziennika is not None:
        wpis_dziennika.porzuc()
    if migawka is not None:
        try:
            if migawka_zatwierdzona:
                migawka.usun_zatwierdzona()
            else:
                migawka.porzuc()
        except OSError:
            logger.warning(
                "wycofanie: nie udalo sie usunac migawki rewizji %s klucza %s — "
                "sierota zostanie sprzatnieta przy wczytaniu",
                migawka.rewizja,
                klucz,
                exc_info=True,
            )
    if snapshot_zatwierdzony:
        _przywroc_snapshot(klucz, tresc_snapshotu)


KATALOG_LEGACY = "legacy_przypadki"
MANIFEST_LEGACY = "manifest.jsonl"


def reset_enm_store(*, remove_persisted: bool = True) -> None:
    # Rejestr blokad NIE jest czyszczony celowo: wymiana obiektu blokady w chwili,
    # gdy inny watek ja trzyma, oddalaby drugiemu watkowi INNA blokade — czyli
    # przywracalaby dokladnie ten wyscig, ktory blokada usuwa. Wpis to jeden
    # obiekt `RLock` na przypadek.
    _enm_store.clear()
    if not remove_persisted:
        return
    store_dir = _store_dir()
    if not store_dir.exists():
        return
    for path in store_dir.glob("*.json"):
        path.unlink(missing_ok=True)
    for path in store_dir.glob("*.tmp"):
        path.unlink(missing_ok=True)
    # CV-1: katalog odlozonych plikow per przypadek + manifest migracji sa czescia
    # magazynu — izolacja testow obejmuje takze je.
    legacy = store_dir / KATALOG_LEGACY
    if legacy.exists():
        for path in legacy.iterdir():
            if path.is_dir():
                shutil.rmtree(path, ignore_errors=True)
            else:
                path.unlink(missing_ok=True)
    # CV-2: migawki rewizji (`<digest>.rev/`) sa czescia magazynu.
    usun_wszystkie_migawki()


# ---------------------------------------------------------------------------
# CV-1: migracja zastanych plików per przypadek → klucz projektu
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class WynikMigracjiKlucza:
    """Skutek przeniesienia modelu zastanego pod kluczem przypadku pod klucz projektu.

    `status`: `BRAK_LEGACY` (nie było modelu pod kluczem przypadku), `PRZENIESIONY`
    (projekt nie miał modelu — model przypadku stał się modelem projektu, bez podbicia
    rewizji, jak `restore_enm`), `ZGODNY` (projekt miał model o tym samym hashu),
    `ROZBIEZNY` (projekt miał model o INNYM hashu — plik odłożony do
    `legacy_przypadki/` i oznaczony w manifeście; wymaga decyzji projektanta:
    wariant sieci). Żaden status nie kasuje danych.
    """

    case_id: str
    klucz_projektu: str
    status: str
    hash_legacy: str | None
    hash_projektu: str | None
    rewizja_legacy: int | None


def hash_tresci_modelu(enm: EnergyNetworkModel) -> str:
    """Hash TRESCI modelu niezalezny od licznika rewizji.

    `compute_enm_hash` obejmuje `header.revision` (dlatego `set_enm` liczy hasz
    kandydata „przy rewizji poprzednika"). Do porownania modeli z ROZNYCH
    przypadkow (rozne liczniki rewizji) potrzebny jest hasz tresci: ta sama siec
    o tej samej nazwie = ten sam hasz, niezaleznie od tego, ile razy ja zapisano.
    """
    kandydat = enm.model_copy(update={"header": enm.header.model_copy(deep=True)})
    kandydat.header.revision = 0
    return compute_enm_hash(kandydat)


def _katalog_legacy() -> Path:
    katalog = _store_dir() / KATALOG_LEGACY
    katalog.mkdir(parents=True, exist_ok=True)
    return katalog


def _odloz_do_legacy(case_id: str, wynik: WynikMigracjiKlucza) -> None:
    """Przenieś plik snapshotu (i dziennika, jeśli jest) przypadku do `legacy_przypadki/`
    i dopisz wiersz manifestu. Zapis manifestu przez plik roboczy + `replace`."""
    katalog = _katalog_legacy()
    zrodlo = _case_path(case_id)
    if zrodlo.exists():
        zrodlo.replace(katalog / zrodlo.name)
    dziennik = _store_dir() / f"{zrodlo.stem}.dziennik.json"
    if dziennik.exists():
        dziennik.replace(katalog / dziennik.name)
    # CV-2: migawki rewizji przypadku ida za jego plikami — nic nie ginie.
    przenies_katalog_rewizji(case_id, katalog)
    manifest = katalog / MANIFEST_LEGACY
    wiersz = json.dumps(
        {
            "case_id": wynik.case_id,
            "klucz_projektu": wynik.klucz_projektu,
            "status": wynik.status,
            "hash_legacy": wynik.hash_legacy,
            "hash_projektu": wynik.hash_projektu,
            "rewizja_legacy": wynik.rewizja_legacy,
            "plik": zrodlo.name,
            "czas": datetime.now(UTC).isoformat(),
        },
        ensure_ascii=False,
        sort_keys=True,
    )
    with manifest.open("a", encoding="utf-8") as plik:
        plik.write(wiersz + "\n")


def migruj_klucz_przypadku_do_projektu(
    case_id: str,
    klucz_projektu: str,
    *,
    przyjmij_jako_model_projektu: bool,
) -> WynikMigracjiKlucza:
    """Przenieś zastany model przypadku pod klucz projektu (procedura kasacji, krok
    „data export → parity → cutover" dla wycinka CV-1).

    `przyjmij_jako_model_projektu=True` dla przypadku AKTYWNEGO projektu (wybór
    należy do wołającego, który zna bazę przypadków — magazyn jej nie zna). Gdy
    projekt ma już model, model przypadku jest porównywany hashem: identyczny →
    `ZGODNY`, inny → `ROZBIEZNY`; w obu przypadkach plik przypadku wędruje do
    `legacy_przypadki/` z wierszem manifestu. Nigdy nie nadpisuje istniejącego
    modelu projektu i nigdy nie kasuje treści.
    """
    with blokada_twin(klucz_projektu), blokada_twin(case_id):
        legacy = _enm_store.get(case_id)
        if legacy is None:
            legacy = _load_persisted_enm(case_id)
        if legacy is None:
            return WynikMigracjiKlucza(case_id, klucz_projektu, "BRAK_LEGACY", None, None, None)
        hash_legacy = hash_tresci_modelu(legacy)
        projekt = _enm_store.get(klucz_projektu)
        if projekt is None:
            projekt = _load_persisted_enm(klucz_projektu)
        if projekt is None and przyjmij_jako_model_projektu:
            _enm_store[klucz_projektu] = legacy
            _persist_enm(klucz_projektu, legacy)
            # CV-2: historia przypadku promowanego na model projektu idzie z nim —
            # dziennik i migawki sa KOPIOWANE pod klucz projektu PRZED odlozeniem
            # plikow przypadku do `legacy_przypadki/` (wczesniej dziennik wedrowal
            # do legacy i projekt zaczynal bez historii — utrata odpowiedzi „ktora
            # zmiana uniewaznila wynik" dla biegow sprzed migracji).
            skopiuj_dziennik(case_id, klucz_projektu)
            skopiuj_katalog_rewizji(case_id, klucz_projektu)
            hash_tresci = compute_enm_hash(legacy)
            zapewnij_migawke(klucz_projektu, legacy, hash_sha256=hash_tresci)
            przygotuj_wpis_dziennika(
                klucz_projektu,
                rewizja=legacy.header.revision,
                operacja=None,
                opis_pl=OPIS_PRZENIESIENIA_Z_PRZYPADKU,
                znacznik_czasu=legacy.header.updated_at,
                hash_sha256=hash_tresci,
            ).zatwierdz()
            wynik = WynikMigracjiKlucza(
                case_id,
                klucz_projektu,
                "PRZENIESIONY",
                hash_legacy,
                hash_legacy,
                legacy.header.revision,
            )
        else:
            hash_projektu = hash_tresci_modelu(projekt) if projekt is not None else None
            status = "ZGODNY" if hash_projektu == hash_legacy else "ROZBIEZNY"
            wynik = WynikMigracjiKlucza(
                case_id, klucz_projektu, status, hash_legacy, hash_projektu, legacy.header.revision
            )
        _enm_store.pop(case_id, None)
        _odloz_do_legacy(case_id, wynik)
        return wynik


def wiersze_manifestu_legacy() -> list[dict]:
    """Odczyt manifestu migracji (dla raportu i testów)."""
    manifest = _store_dir() / KATALOG_LEGACY / MANIFEST_LEGACY
    if not manifest.exists():
        return []
    wiersze: list[dict] = []
    for linia in manifest.read_text(encoding="utf-8").splitlines():
        if linia.strip():
            wiersze.append(json.loads(linia))
    return wiersze
