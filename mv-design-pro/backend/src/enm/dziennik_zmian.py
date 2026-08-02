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

# Maksymalna dlugosc dziennika per przypadek. Dziennik sluzy odpowiedzi „co sie
# zmienilo OD MOJEGO WYNIKU", a nie pelnej historii projektu — ta nalezy do
# archiwum. Limit chroni przed nieograniczonym rosnieciem pliku.
LIMIT_WPISOW = 500

_OPIS_BEZ_OPERACJI = (
    "Zapis modelu bez zarejestrowanej operacji domenowej "
    "(np. uzupelnienie danych katalogowych albo migracja formatu)."
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
        }

    @staticmethod
    def from_dict(dane: dict[str, Any]) -> WpisDziennika | None:
        try:
            rewizja = int(dane["rewizja"])
        except (KeyError, TypeError, ValueError):
            return None
        operacja = dane.get("operacja")
        return WpisDziennika(
            rewizja=rewizja,
            znacznik_czasu=str(dane.get("znacznik_czasu") or ""),
            operacja=operacja if isinstance(operacja, str) else None,
            opis_pl=str(dane.get("opis_pl") or _OPIS_BEZ_OPERACJI),
            utworzone=tuple(dane.get("utworzone") or ()),
            zmienione=tuple(dane.get("zmienione") or ()),
            usuniete=tuple(dane.get("usuniete") or ()),
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
) -> PrzygotowanyWpis:
    """Przygotuj wpis rewizji NA NOSNIKU — bez zmiany stanu widocznego dla kogokolwiek.

    Dopisanie jest idempotentne po numerze rewizji: ponowny zapis tej samej rewizji
    (np. powtorzone zadanie HTTP) nie moze zdublowac wpisu, bo lista zmian ma byc
    obrazem rewizji, a nie licznikiem wywolan. Wtedy wracamy z wpisem juz istniejacym
    i pustym zapisem roboczym — `zatwierdz()` nie ma czego robic.

    Faze druga (`PrzygotowanyWpis.zatwierdz`) wykonuje wolajacy — `enm/store.py`
    zatwierdza dziennik JAKO OSTATNI krok zapisu rewizji, zeby wpis i rewizja
    powstawaly razem albo wcale.
    """
    dziennik = _wczytaj(case_id)
    for istniejacy in dziennik.wpisy:
        if istniejacy.rewizja == rewizja:
            return PrzygotowanyWpis(case_id=case_id, wpis=istniejacy, zapis=None)

    wpis = WpisDziennika(
        rewizja=rewizja,
        znacznik_czasu=(znacznik_czasu or datetime.now(UTC)).isoformat(),
        operacja=operacja,
        opis_pl=opis_operacji(operacja),
        utworzone=tuple(utworzone or ()),
        zmienione=tuple(zmienione or ()),
        usuniete=tuple(usuniete or ()),
    )
    # Nowa tresc powstaje OBOK listy w pamieci — dopiero `zatwierdz()` ja podmienia.
    wpisy_po = [*dziennik.wpisy, wpis]
    wpisy_po.sort(key=lambda w: w.rewizja)
    if len(wpisy_po) > LIMIT_WPISOW:
        del wpisy_po[: len(wpisy_po) - LIMIT_WPISOW]
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
