"""Dziennik zmian modelu — ODPOWIEDZ na pytanie „ktora zmiana uniewaznila wynik".

DLUG, KTORY TEN MODUL ZAMYKA (V12K-264). Model niosl FAKT zmiany, nigdy PRZYCZYNY:
`ENMHeader.revision` rosl przy kazdym zapisie, przypadek dostawal
`result_status = OUTDATED`, a ekran pokazywal `przyczyna: 'model-zmieniony'` —
STALA, nie dana. Projektant widzial „wyniki nieaktualne" i musial sam odtworzyc
w pamieci, co zrobil miedzy biegiem a teraz. Przy sieci z kilkudziesiecioma
elementami to jest wybor miedzy przeliczaniem wszystkiego na slepo a rezygnacja
z aktualizacji.

DANE JUZ ISTNIALY I BYLY WYRZUCANE. `execute_domain_operation` zwraca
`changes.{created,updated,deleted}_element_ids` oraz `domain_events`, a
`canonical_operations.py` niesie `description_pl` kazdej operacji. Koncowka
oddawala to wywolujacemu i nie zapisywala nigdzie — wiec wiedza gineła
natychmiast po odpowiedzi HTTP.

DLACZEGO OSOBNY MAGAZYN, A NIE POLE W NAGLOWKU ENM. `compute_enm_hash` liczy
hash z CALEGO modelu poza kilkoma jawnie wykluczonymi polami naglowka. Dopisanie
dziennika do `ENMHeader` zmienialoby hash kazdego snapshotu — czyli lamalo
determinizm i wszystkie zapisane hasze (regula kanonu: „ten sam wejscie = ten sam
wynik"). Dziennik jest wiec RÓWNOLEGŁYM zapisem, kluczowanym po `case_id`,
i NIE WCHODZI do zadnego hasha.

ZERO FABRYKACJI. Wpis powstaje wylacznie z danych, ktore operacja faktycznie
zwrocila. Zapis bez znanej operacji (np. migracja formatu, uzupelnienie domyslnych
wartosci katalogu) dostaje `operacja = None` i opis nazywajacy ten stan wprost —
NIGDY zgadnietej nazwy operacji. Brak wiedzy o przyczynie jest sam w sobie
informacja dla projektanta i musi byc odrozniony od przyczyny znanej.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from datetime import UTC, datetime
from hashlib import sha256
from pathlib import Path
from typing import Any
from uuid import uuid4

from domain.canonical_operations import CANONICAL_OPERATIONS

# BEZ LIMITU DLUGOSCI (CV-2, R4). Wczesniejszy `LIMIT_WPISOW = 500` obcinal
# najstarsze wpisy — a dziennik jest odtad REJESTREM REWIZJI: kazda rewizja ma tu
# hash swojej migawki (`enm/rewizje.py`) i przyczyne; obciecie historii = utrata
# odpowiedzi „ktora zmiana uniewaznila wynik" dla biegow policzonych na starszych
# rewizjach. Retencja migawek (pruning rewizji, ktorych nie wskazuje zaden bieg)
# jest decyzja produktowa wlasciciela (OD-4, DECISION_FREEZE_REGISTER) i NIE jest
# realizowana po cichu tutaj.

_OPIS_BEZ_OPERACJI = (
    "Zapis modelu bez zarejestrowanej operacji domenowej "
    "(np. uzupelnienie danych katalogowych albo migracja formatu)."
)

#: Opis wpisu ODTWORZONEGO przy wczytaniu modelu z nosnika, gdy rewizja biezaca
#: HEAD nie ma wpisu w dzienniku (zapis przerwany przed zatwierdzeniem dziennika
#: albo dziennik sprzed CV-2). Nazywa brak wprost — nie zgaduje operacji.
OPIS_WPISU_ODTWORZONEGO = (
    "Rewizja bez zarejestrowanej przyczyny — wpis odtworzony przy wczytaniu modelu "
    "(zapis przerwany przed wpisem do dziennika albo dziennik sprzed rejestru rewizji)."
)

#: Opis wpisu dla modelu przywroconego 1:1 z archiwum projektu (`restore_enm`).
OPIS_PRZYWROCENIA_Z_ARCHIWUM = "Model przywrocony 1:1 z archiwum projektu (import)."

#: Opis wpisu dla modelu przeniesionego spod klucza przypadku pod klucz projektu
#: (migracja CV-1) — rewizja i hash bez zmian, zmienia sie wylacznie klucz.
OPIS_PRZENIESIENIA_Z_PRZYPADKU = (
    "Model przeniesiony spod klucza przypadku obliczeniowego pod klucz projektu "
    "(migracja magazynu per projekt)."
)


@dataclass(frozen=True)
class WpisDziennika:
    """Jedna rewizja modelu wraz z przyczyna jej powstania."""

    rewizja: int
    znacznik_czasu: str
    operacja: str | None
    opis_pl: str
    utworzone: tuple[str, ...] = ()
    zmienione: tuple[str, ...] = ()
    usuniete: tuple[str, ...] = ()
    #: CV-2: hash migawki tej rewizji (`enm/rewizje.py`) — ten sam, ktory niesie
    #: `header.hash_sha256` modelu; `None` wylacznie dla wpisow sprzed rejestru
    #: rewizji (dane zastane, nie kod).
    hash_sha256: str | None = None
    #: CV-2: rewizja, z ktorej ta rewizja powstala (`None` = pierwsza rewizja
    #: pod tym kluczem albo wpis zastany bez tej informacji).
    rodzic: int | None = None
    #: CV-2: PELNY ladunek komendy domenowej, ktora wytworzyla rewizje (nie tylko
    #: nazwa i listy elementow) — dokladnie to, co przyszlo w zadaniu operacji.
    #: `None` = zapis bez komendy (migracja, uzupelnienie katalogu, import).
    ladunek: dict[str, Any] | None = None

    def liczba_elementow(self) -> int:
        return len(self.utworzone) + len(self.zmienione) + len(self.usuniete)

    def to_dict(self) -> dict[str, Any]:
        return {
            "rewizja": self.rewizja,
            "znacznik_czasu": self.znacznik_czasu,
            "operacja": self.operacja,
            "opis_pl": self.opis_pl,
            "utworzone": list(self.utworzone),
            "zmienione": list(self.zmienione),
            "usuniete": list(self.usuniete),
            "liczba_elementow": self.liczba_elementow(),
            "hash_sha256": self.hash_sha256,
            "rodzic": self.rodzic,
            "ladunek": self.ladunek,
        }

    @staticmethod
    def from_dict(dane: dict[str, Any]) -> WpisDziennika | None:
        try:
            rewizja = int(dane["rewizja"])
        except (KeyError, TypeError, ValueError):
            return None
        operacja = dane.get("operacja")
        hash_sha256 = dane.get("hash_sha256")
        rodzic = dane.get("rodzic")
        ladunek = dane.get("ladunek")
        return WpisDziennika(
            rewizja=rewizja,
            znacznik_czasu=str(dane.get("znacznik_czasu") or ""),
            operacja=operacja if isinstance(operacja, str) else None,
            opis_pl=str(dane.get("opis_pl") or _OPIS_BEZ_OPERACJI),
            utworzone=tuple(dane.get("utworzone") or ()),
            zmienione=tuple(dane.get("zmienione") or ()),
            usuniete=tuple(dane.get("usuniete") or ()),
            hash_sha256=hash_sha256 if isinstance(hash_sha256, str) else None,
            rodzic=rodzic if isinstance(rodzic, int) and not isinstance(rodzic, bool) else None,
            ladunek=ladunek if isinstance(ladunek, dict) else None,
        )


@dataclass
class _Dziennik:
    wpisy: list[WpisDziennika] = field(default_factory=list)


_dzienniki: dict[str, _Dziennik] = {}
_DEFAULT_STORE_DIR = Path(__file__).resolve().parents[2] / ".enm_store"


def _store_dir() -> Path:
    # Ta sama zmienna srodowiskowa co `enm.store` — dziennik jest zapisem
    # towarzyszacym modelowi i ma dzielic jego lokalizacje (a wiec i czyszczenie
    # miedzy testami).
    configured = os.getenv("ENM_STORE_DIR")
    return Path(configured) if configured else _DEFAULT_STORE_DIR


def sciezka_tymczasowa(sciezka_docelowa: Path) -> Path:
    """Unikalna nazwa pliku roboczego zapisu atomowego (defekt D4 audytu 2026-08-01).

    Wspolna nazwa `<digest>.tmp` byla dzielona przez WSZYSTKIE rownolegle zapisy
    tego samego przypadku: pierwszy watek robil `replace()`, drugi trafial na
    `FileNotFoundError` (`…<digest>.tmp -> …<digest>.json`), a uzytkownik dostawal
    HTTP 422 „blad zapisu" mimo ze model w pamieci juz awansowal o rewizje. Nazwa
    z identyfikatorem procesu i losowym znacznikiem daje kazdemu zapisowi WLASNY
    plik roboczy; atomowa podmiana `replace()` zostaje bez zmian.

    Helper mieszka tutaj (a nie w `enm/store.py`), bo `store` importuje dziennik —
    odwrotny kierunek byłby cyklem importu. Uzywaja go OBA zapisy towarzyszace
    modelowi: snapshot i dziennik.
    """
    return sciezka_docelowa.with_name(f"{sciezka_docelowa.name}.{os.getpid()}.{uuid4().hex}.tmp")


def _sciezka(case_id: str) -> Path:
    digest = sha256(case_id.encode("utf-8")).hexdigest()
    return _store_dir() / f"{digest}.dziennik.json"


def _wczytaj(case_id: str) -> _Dziennik:
    if case_id in _dzienniki:
        return _dzienniki[case_id]
    dziennik = _Dziennik()
    sciezka = _sciezka(case_id)
    if sciezka.exists():
        try:
            payload = json.loads(sciezka.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            payload = None
        if isinstance(payload, dict) and isinstance(payload.get("wpisy"), list):
            for surowy in payload["wpisy"]:
                if isinstance(surowy, dict):
                    wpis = WpisDziennika.from_dict(surowy)
                    if wpis is not None:
                        dziennik.wpisy.append(wpis)
    _dzienniki[case_id] = dziennik
    return dziennik


@dataclass(frozen=True)
class _ZapisRoboczy:
    """Tresc dziennika lezaca juz NA NOSNIKU, czekajaca na atomowa podmiane."""

    tmp: Path
    docelowa: Path
    wpisy_po: tuple[WpisDziennika, ...]


@dataclass(frozen=True)
class PrzygotowanyWpis:
    """Wpis rewizji ZAPISANY na nosnik, ale jeszcze NIEZATWIERDZONY.

    DLUG, KTORY TO ZAMYKA (znalezisko P6 przegladu 2026-08-01). Dopisanie wkladalo
    wpis do listy w PAMIECI, a dopiero potem zapisywalo plik. Awaria nosnika miedzy
    tymi krokami zostawiala WPIS-DUCHA: model wracal o rewizje (wycofanie w
    `enm/store.py`), a `_dzienniki[case_id]` trzymal opis operacji, ktora zostala
    cofnieta. Idempotencja po numerze rewizji (`przygotuj_dopisanie` nizej) czynila
    ten stan TRWALYM — kolejna, UDANA operacja dostawala ten sam numer rewizji,
    trafiala na ducha i wracala bez dopisania czegokolwiek. Dziennik na stale
    opisywal rewizje operacja, ktora sie nie odbyla (fabrykacja wobec phantom rule),
    a operacja, ktora sie faktycznie odbyla, nie miala wpisu NIGDZIE.

    DWIE FAZY ZAMYKAJA TO U ZRODLA, a nie sprzataniem po fakcie: przygotowanie
    zapisuje PLIK ROBOCZY i nie rusza stanu widocznego dla kogokolwiek, a
    `zatwierdz()` podmienia plik atomowo i DOPIERO POTEM wpisuje nowa liste do
    pamieci. Awaria zapisu nie ma czego zostawic — ducha nie ma z czego zrobic.
    """

    case_id: str
    wpis: WpisDziennika
    zapis: _ZapisRoboczy | None

    def zatwierdz(self) -> WpisDziennika:
        """Podmien plik dziennika i dopiero po tym wpisz nowa tresc do pamieci."""
        zapis = self.zapis
        if zapis is None:
            # Rewizja ma juz swoj wpis (idempotencja) — nie ma czego zatwierdzac.
            return self.wpis
        zapis.tmp.replace(zapis.docelowa)
        _wczytaj(self.case_id).wpisy = list(zapis.wpisy_po)
        return self.wpis

    def porzuc(self) -> None:
        """Sprzatnij plik roboczy operacji, ktora zglosila blad."""
        if self.zapis is not None:
            self.zapis.tmp.unlink(missing_ok=True)


def _zapisz_roboczo(case_id: str, wpisy: list[WpisDziennika]) -> _ZapisRoboczy:
    katalog = _store_dir()
    katalog.mkdir(parents=True, exist_ok=True)
    sciezka = _sciezka(case_id)
    # Nazwa pliku roboczego unikalna per proces i zapis — wspolna `<digest>.dziennik.tmp`
    # gubila sie przy rownoleglych zapisach tego samego przypadku (`replace()`
    # drugiego watku konczyl sie `FileNotFoundError`); ta sama poprawka co w
    # `enm/store.py` (defekt D4 audytu 2026-08-01).
    tmp = sciezka_tymczasowa(sciezka)
    payload = {
        "case_id": case_id,
        "wpisy": [w.to_dict() for w in wpisy],
    }
    try:
        tmp.write_text(
            json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
            encoding="utf-8",
        )
    except OSError:
        tmp.unlink(missing_ok=True)
        raise
    return _ZapisRoboczy(tmp=tmp, docelowa=sciezka, wpisy_po=tuple(wpisy))


def opis_operacji(operacja: str | None) -> str:
    """Opis operacji z KANONU — nigdy wymyslony na miejscu.

    `canonical_operations.py` jest jedynym zrodlem nazw i opisow operacji. Gdy
    operacja jest nieznana kanonowi, mowimy to wprost zamiast tworzyc opis
    z identyfikatora (taki opis wygladalby jak dana, a bylby zgadniety).
    """
    if operacja is None:
        return _OPIS_BEZ_OPERACJI
    spec = CANONICAL_OPERATIONS.get(operacja)
    if spec is None:
        return f"Operacja '{operacja}' nie wystepuje w kanonie operacji."
    return spec.description_pl


def przygotuj_dopisanie(
    case_id: str,
    *,
    rewizja: int,
    operacja: str | None,
    utworzone: list[str] | tuple[str, ...] | None = None,
    zmienione: list[str] | tuple[str, ...] | None = None,
    usuniete: list[str] | tuple[str, ...] | None = None,
    znacznik_czasu: datetime | None = None,
    hash_sha256: str | None = None,
    rodzic: int | None = None,
    ladunek: dict[str, Any] | None = None,
    opis_pl: str | None = None,
) -> PrzygotowanyWpis:
    """Przygotuj wpis rewizji NA NOSNIKU — bez zmiany stanu widocznego dla kogokolwiek.

    Dopisanie jest idempotentne po numerze rewizji: ponowny zapis tej samej rewizji
    (np. powtorzone zadanie HTTP) nie moze zdublowac wpisu, bo lista zmian ma byc
    obrazem rewizji, a nie licznikiem wywolan. Wtedy wracamy z wpisem juz istniejacym
    i pustym zapisem roboczym — `zatwierdz()` nie ma czego robic.

    Faze druga (`PrzygotowanyWpis.zatwierdz`) wykonuje wolajacy — `enm/store.py`
    zatwierdza dziennik JAKO OSTATNI krok zapisu rewizji, zeby wpis i rewizja
    powstawaly razem albo wcale.

    `opis_pl` wolno podac WYLACZNIE dla zapisu bez operacji domenowej (`operacja is
    None`) — nazywa on zrodlo rewizji, ktorego kanon operacji nie zna (odtworzenie
    wpisu przy wczytaniu, import archiwum, migracja klucza). Dla operacji z kanonu
    opis zawsze pochodzi z kanonu (`opis_operacji`), nigdy z parametru.
    """
    if opis_pl is not None and operacja is not None:
        raise ValueError("opis_pl wolno podac tylko dla zapisu bez operacji domenowej")
    dziennik = _wczytaj(case_id)
    for istniejacy in dziennik.wpisy:
        if istniejacy.rewizja == rewizja:
            return PrzygotowanyWpis(case_id=case_id, wpis=istniejacy, zapis=None)

    wpis = WpisDziennika(
        rewizja=rewizja,
        znacznik_czasu=(znacznik_czasu or datetime.now(UTC)).isoformat(),
        operacja=operacja,
        opis_pl=opis_pl if opis_pl is not None else opis_operacji(operacja),
        utworzone=tuple(utworzone or ()),
        zmienione=tuple(zmienione or ()),
        usuniete=tuple(usuniete or ()),
        hash_sha256=hash_sha256,
        rodzic=rodzic,
        ladunek=dict(ladunek) if ladunek is not None else None,
    )
    # Nowa tresc powstaje OBOK listy w pamieci — dopiero `zatwierdz()` ja podmienia.
    wpisy_po = [*dziennik.wpisy, wpis]
    wpisy_po.sort(key=lambda w: w.rewizja)
    return PrzygotowanyWpis(
        case_id=case_id,
        wpis=wpis,
        zapis=_zapisz_roboczo(case_id, wpisy_po),
    )


def wpisy_od(case_id: str, od_rewizji: int) -> list[WpisDziennika]:
    """Zmiany PO wskazanej rewizji — czyli dokladnie te, ktore uniewaznily wynik.

    `od_rewizji` to rewizja modelu, na ktorej policzono wynik. Zwracamy wpisy
    o rewizji WIEKSZEJ, bo rewizja biegu jest nadal ta, ktora wynik opisuje.
    """
    return [w for w in _wczytaj(case_id).wpisy if w.rewizja > od_rewizji]


def wszystkie_wpisy(case_id: str) -> list[WpisDziennika]:
    return list(_wczytaj(case_id).wpisy)


def wpis_rewizji(case_id: str, rewizja: int) -> WpisDziennika | None:
    """Wpis dokladnie tej rewizji albo None (rewizja bez wpisu)."""
    for wpis in _wczytaj(case_id).wpisy:
        if wpis.rewizja == rewizja:
            return wpis
    return None


def najwyzsza_rewizja(case_id: str) -> int | None:
    wpisy = _wczytaj(case_id).wpisy
    return max((w.rewizja for w in wpisy), default=None)


def ma_historie(klucz: str) -> bool:
    """Czy klucz MA historie rewizji — predykat „cel ma historie" migracji CV-1.

    Predykat jest „ma plik dziennika ALBO ma wpisy w pamieci", a NIE „ma wpis w
    pamieci": `_wczytaj` cachuje PUSTY dziennik przy kazdym odczycie, wiec sam
    odczyt klucza nie moze go zamienic w klucz „z historia". Jedno zrodlo dla
    decyzji o przeniesieniu dziennika i migawek (`store.migruj_klucz_przypadku_
    do_projektu`) oraz dla zabezpieczenia w `przenies_dziennik`.
    """
    if _sciezka(klucz).exists():
        return True
    dziennik = _dzienniki.get(klucz)
    return dziennik is not None and bool(dziennik.wpisy)


def przenies_dziennik(z_klucza: str, do_klucza: str) -> bool:
    """Przenies historie rewizji pod NOWY klucz — dziennik idzie ZA modelem (CV-1).

    DLUG, KTORY TO ZAMYKA (przeglad adwersaryjny CV-1). Migracja zastanych plikow
    per przypadek promuje model przypadku aktywnego na model PROJEKTU BEZ podbicia
    rewizji (`store.migruj_klucz_przypadku_do_projektu`) — model zachowuje wiec
    licznik rewizji N. Dziennik tego samego przypadku byl przy tym odkladany do
    `legacy_przypadki/` razem z dziennikami przypadkow ODRZUCONYCH, wiec projekt
    startowal z historia PUSTA przy modelu w rewizji N. Nastepny zapis dopisywal
    rewizje N+1, a `GET /enm/dziennik-zmian?od_rewizji=R` (odpowiedz na „ktora
    zmiana uniewaznila moj wynik") oddawal liste Z DZIURA — wygladajaca na
    kompletna. To jest dokladnie stan, ktorego naglowek tego modulu zabrania:
    „z dziurami nie odpowiada".

    Zwraca `True`, gdy historia faktycznie przeszla pod nowy klucz. `False`, gdy
    nie bylo czego przenosic ALBO gdy klucz docelowy MA JUZ wlasna historie
    (`ma_historie`) — nadpisanie cudzej historii byloby utrata danych, wiec
    dziennik zrodlowy zostaje na miejscu (wolajacy odklada go wtedy do
    `legacy_przypadki/` z wpisem manifestu, dokladnie tak jak odklada model).

    KOLEJNOSC jest odporna na awarie nosnika: najpierw powstaje plik DOCELOWY
    (zapis roboczy + atomowa podmiana), a dopiero potem znika zrodlowy. Przerwanie
    w srodku zostawia OBIE kopie (stan nadmiarowy, odtwarzalny), nigdy zadnej.
    """
    if z_klucza == do_klucza:
        return False
    if ma_historie(do_klucza):
        return False
    zrodlo = _sciezka(z_klucza)
    if not zrodlo.exists() and z_klucza not in _dzienniki:
        return False
    wpisy = list(_wczytaj(z_klucza).wpisy)
    if not wpisy:
        # Pusta historia nie jest historia — nie tworzymy pliku „na wszelki wypadek".
        _dzienniki.pop(z_klucza, None)
        return False
    zapis = _zapisz_roboczo(do_klucza, wpisy)
    try:
        zapis.tmp.replace(zapis.docelowa)
    except OSError:
        zapis.tmp.unlink(missing_ok=True)
        raise
    _dzienniki[do_klucza] = _Dziennik(wpisy=list(wpisy))
    _dzienniki.pop(z_klucza, None)
    zrodlo.unlink(missing_ok=True)
    return True


def wyczysc_dziennik(*, usun_pliki: bool = True) -> None:
    """Reset magazynu — uzywany przez testy razem z `reset_enm_store`."""
    _dzienniki.clear()
    if not usun_pliki:
        return
    katalog = _store_dir()
    if not katalog.exists():
        return
    for path in katalog.glob("*.dziennik.json"):
        path.unlink(missing_ok=True)
    # Dwa wzorce: `<digest>.dziennik.json.<pid>.<znacznik>.tmp` (nazwa unikalna,
    # po naprawie kolizji plikow roboczych) oraz historyczne `<digest>.dziennik.tmp`.
    for path in katalog.glob("*.dziennik.json.*.tmp"):
        path.unlink(missing_ok=True)
    for path in katalog.glob("*.dziennik.tmp"):
        path.unlink(missing_ok=True)
