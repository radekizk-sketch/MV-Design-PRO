from __future__ import annotations

import json
import os
import threading
from dataclasses import dataclass
from datetime import UTC, datetime
from hashlib import sha256
from pathlib import Path

from enm.catalog_completion import complete_catalog_defaults
from enm.dziennik_zmian import PrzygotowanyWpis, sciezka_tymczasowa
from enm.dziennik_zmian import przygotuj_dopisanie as przygotuj_wpis_dziennika
from enm.hash import compute_enm_hash
from enm.migrations.punkt_przylaczenia_der import migruj as migruj_punkt_przylaczenia
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader


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


_enm_store: dict[str, EnergyNetworkModel] = {}
_DEFAULT_STORE_DIR = Path(__file__).resolve().parents[2] / ".enm_store"

# Blokady zapisu modelu — JEDNA na przypadek obliczeniowy.
_blokady_przypadkow: dict[str, threading.RLock] = {}
_rejestr_blokad = threading.Lock()


def blokada_przypadku(case_id: str) -> threading.RLock:
    """Blokada CALEGO cyklu odczyt→przeliczenie→zapis modelu jednego przypadku.

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
        blokada = _blokady_przypadkow.get(case_id)
        if blokada is None:
            blokada = threading.RLock()
            _blokady_przypadkow[case_id] = blokada
        return blokada


def _store_dir() -> Path:
    configured = os.getenv("ENM_STORE_DIR")
    return Path(configured) if configured else _DEFAULT_STORE_DIR


def _case_path(case_id: str) -> Path:
    digest = sha256(case_id.encode("utf-8")).hexdigest()
    return _store_dir() / f"{digest}.json"


def _load_persisted_enm(case_id: str) -> EnergyNetworkModel | None:
    path = _case_path(case_id)
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


def _persist_enm(case_id: str, enm: EnergyNetworkModel) -> None:
    store_dir = _store_dir()
    store_dir.mkdir(parents=True, exist_ok=True)
    path = _case_path(case_id)
    tmp_path = sciezka_tymczasowa(path)
    payload = {
        "case_id": case_id,
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


def _tresc_snapshotu(case_id: str) -> bytes | None:
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
        return _case_path(case_id).read_bytes()
    except FileNotFoundError:
        return None


def _przywroc_snapshot(case_id: str, tresc: bytes | None) -> None:
    """Odtworz plik snapshotu DOKLADNIE w stanie sprzed nieudanego zapisu."""
    path = _case_path(case_id)
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


def has_enm(case_id: str) -> bool:
    """Return whether a case already has a materialized ENM snapshot."""
    return case_id in _enm_store or _case_path(case_id).exists()


def get_enm(case_id: str) -> EnergyNetworkModel:
    """Return the current ENM snapshot for a case, creating a default model if needed."""
    with blokada_przypadku(case_id):
        return _get_enm_pod_blokada(case_id)


def _get_enm_pod_blokada(case_id: str) -> EnergyNetworkModel:
    # Odczyt bierze te sama blokade co zapis, bo NIE JEST czystym odczytem:
    # tworzy model domyslny, migruje format i uzupelnia dane katalogowe, a wynik
    # ZAPISUJE (`set_enm` nizej). Bez blokady dwa rownolegle odczyty swiezego
    # przypadku utworzylyby dwa rozne modele domyslne.
    if case_id not in _enm_store:
        persisted = _load_persisted_enm(case_id)
        if persisted is not None:
            _enm_store[case_id] = persisted
        else:
            enm = EnergyNetworkModel(
                header=ENMHeader(
                    name=f"Model sieci - {case_id[:8]}",
                    defaults=ENMDefaults(),
                ),
            )
            enm.header.hash_sha256 = compute_enm_hash(enm)
            _enm_store[case_id] = enm
    # V12K-268: automigracja nazwy klucza punktu przyłączenia wytwórcy. Ta sama
    # ścieżka co uzupełnianie domyślnych katalogowych poniżej — model naprawiony
    # przy wczytaniu jest ZAPISYWANY, żeby migracja wykonała się RAZ, a nie przy
    # każdym odczycie. Kolejność ma znaczenie: migracja idzie PRZED uzupełnianiem
    # katalogu, bo reguły katalogowe mają widzieć już kanoniczne nazwy.
    zmigrowany, zmieniona_nazwa = migruj_punkt_przylaczenia(_enm_store[case_id])
    if zmieniona_nazwa:
        _enm_store[case_id] = zmigrowany

    completed, changed = complete_catalog_defaults(_enm_store[case_id])
    if changed or zmieniona_nazwa:
        return set_enm(case_id, completed)
    return _enm_store[case_id]


def set_enm(
    case_id: str,
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
    with blokada_przypadku(case_id):
        return _set_enm_pod_blokada(case_id, enm, zrodlo_zmiany=zrodlo_zmiany)


def _set_enm_pod_blokada(
    case_id: str,
    enm: EnergyNetworkModel,
    *,
    zrodlo_zmiany: ZrodloZmiany | None,
) -> EnergyNetworkModel:
    enm, _ = complete_catalog_defaults(enm)
    existing = _enm_store.get(case_id)
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
            _persist_enm(case_id, existing)
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
    tresc_snapshotu = _tresc_snapshotu(case_id)

    old_rev = existing.header.revision if existing else 0
    enm.header.revision = old_rev + 1
    enm.header.updated_at = datetime.now(UTC)
    enm.header.hash_sha256 = compute_enm_hash(enm)
    _enm_store[case_id] = enm

    wpis_dziennika: PrzygotowanyWpis | None = None
    snapshot_zatwierdzony = False
    try:
        # KOLEJNOSC ZAPISOW jest czescia naprawy, nie przypadkiem. Najpierw OBIE
        # tresci ida na nosnik jako pliki robocze (dziennik tutaj, snapshot
        # wewnatrz `_persist_enm`), a dopiero potem nastepuja podmiany. Awaria
        # klasy „nosnik odmawia zapisu" (ENOSPC/EACCES/EIO) trafia wiec w faze
        # PRZYGOTOWANIA, kiedy nie ma jeszcze czego cofac na dysku. Dziennik
        # zatwierdzamy jako OSTATNI, bo jego podmiana jest jedynym krokiem, po
        # ktorym nie zostaje juz nic do zrobienia.
        wpis_dziennika = przygotuj_wpis_dziennika(
            case_id,
            rewizja=enm.header.revision,
            operacja=zrodlo_zmiany.operacja if zrodlo_zmiany else None,
            utworzone=zrodlo_zmiany.utworzone if zrodlo_zmiany else (),
            zmienione=zrodlo_zmiany.zmienione if zrodlo_zmiany else (),
            usuniete=zrodlo_zmiany.usuniete if zrodlo_zmiany else (),
            znacznik_czasu=enm.header.updated_at,
        )
        _persist_enm(case_id, enm)
        snapshot_zatwierdzony = True
        wpis_dziennika.zatwierdz()
    except Exception:
        _wycofaj_nieudany_zapis(
            case_id,
            poprzedni,
            wpis_dziennika=wpis_dziennika,
            tresc_snapshotu=tresc_snapshotu,
            snapshot_zatwierdzony=snapshot_zatwierdzony,
        )
        raise
    return enm


def _wycofaj_nieudany_zapis(
    case_id: str,
    poprzedni: EnergyNetworkModel | None,
    *,
    wpis_dziennika: PrzygotowanyWpis | None,
    tresc_snapshotu: bytes | None,
    snapshot_zatwierdzony: bool,
) -> None:
    """Cofnij rewizje, ktorej NIE UDALO SIE zapisac (defekt D4, wariant 2 i 3).

    Wczesniej `_enm_store[case_id] = enm` wykonywalo sie PRZED zapisem pliku, wiec
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
        _enm_store.pop(case_id, None)
    else:
        _enm_store[case_id] = poprzedni
    if wpis_dziennika is not None:
        wpis_dziennika.porzuc()
    if snapshot_zatwierdzony:
        _przywroc_snapshot(case_id, tresc_snapshotu)


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
