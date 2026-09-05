"""Rewizje modelu ENM — pelna, NIEZMIENNA migawka KAZDEJ rewizji (CV-2).

KONTRAKT (docs/architecture/CANONICAL_TWIN_ARCHITECTURE.md, ADR-013 ModelRevision):
kazda rewizja modelu projektu ma trwala migawke `<store>/<digest>.rev/<n>.json.gz`,
zapisana RAZ i nigdy nie nadpisywana tresci innej niz rewizja `n` (adresowanie
trescia przez `hash_sha256` z `enm.hash.compute_enm_hash`). Dziennik zmian
(`enm/dziennik_zmian.py`) niesie przyczyne rewizji, migawka niesie jej TRESC —
razem odpowiadaja na pytania „co sie zmienilo od mojego wyniku" (dziennik) i
„jak dokladnie wygladal model, na ktorym policzono wynik" (`checkout`).

DLUG, KTORY TO ZAMYKA (audyt twin A9 §3.3, pomiar H1/H2): system znal tylko
`header.revision` biezacego modelu i licznik rewizji w dzienniku; zadnej
wczesniejszej rewizji nie dalo sie odczytac, wiec „wynik policzony na rewizji 7"
byl adresem bez tresci. Koperta rewizji biegu (`enm/envelope.py`) wskazuje odtad
rewizje, ktora ISTNIEJE jako plik.

REGULA SPOJNOSCI (glowa modelu jest autorytatywna):
- plik HEAD (`<digest>.json`, `enm/store.py`) pozostaje jedynym zrodlem prawdy
  o rewizji BIEZACEJ — tak jak dotad; migawki sa INDEKSEM historii;
- plik rewizji `n > HEAD.revision` jest SIEROTA (awaria miedzy zatwierdzeniem
  migawki a zatwierdzeniem dziennika, po ktorej wycofanie przywrocilo HEAD) —
  usuwany przy wczytaniu i logowany jako `rewizja_osierocona`, NIGDY promowany;
- plik rewizji `n == HEAD.revision` o innym hashu niz HEAD jest zastepowany trescia
  HEAD (log `rewizja_zastapiona`), brakujacy — odtwarzany z HEAD (log
  `rewizja_odtworzona`; to takze sciezka migracji magazynow sprzed CV-2, ktore nie
  maja katalogu `.rev/`: rewizja biezaca staje sie pierwsza migawka, wczesniejsze
  rewizje nie maja tresci i `checkout` mowi to wprost bledem);
- kolejnosc zapisu w `enm/store.py`: dziennik (plik roboczy) → migawka rewizji
  (plik roboczy) → HEAD (podmiana) → migawka (podmiana) → dziennik (podmiana);
  kazdy krok przed podmiana HEAD nie zostawia sladu, kazdy po niej jest cofany
  przez `_wycofaj_nieudany_zapis` (migawka: `usun_zatwierdzona`), a to, czego
  wycofanie nie zdazylo sprzatnac, lapie regula sieroty przy wczytaniu.

DETERMINIZM: tresc migawki to kanoniczny JSON (`sort_keys`, bez spacji) spakowany
gzipem z `mtime=0` — dwa zapisy tej samej rewizji daja identyczne bajty.
"""

from __future__ import annotations

import gzip
import json
import logging
import os
import shutil
from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
from typing import Any

from enm.dziennik_zmian import sciezka_tymczasowa
from enm.hash import compute_enm_hash
from enm.models import EnergyNetworkModel

logger = logging.getLogger(__name__)

#: Sufiks katalogu migawek rewizji jednego klucza: `<digest>.rev/`.
SUFIKS_KATALOGU_REWIZJI = ".rev"
#: Rozszerzenie pliku migawki: `<n>.json.gz`.
ROZSZERZENIE_MIGAWKI = ".json.gz"

_DEFAULT_STORE_DIR = Path(__file__).resolve().parents[2] / ".enm_store"


class RewizjaNieistniejeError(LookupError):
    """Rewizja nie ma migawki — nigdy nie powstala albo powstala przed CV-2."""

    def __init__(self, klucz: str, rewizja: int) -> None:
        super().__init__(f"Rewizja {rewizja} modelu {klucz!r} nie ma zapisanej migawki")
        self.klucz = klucz
        self.rewizja = rewizja


class RewizjaUszkodzonaError(ValueError):
    """Migawka istnieje, ale jej tresc nie zgadza sie z zapisanym hashem/numerem.

    To NIE jest sytuacja do cichego naprawienia: plik rewizji jest adresowany
    trescia, wiec rozjazd znaczy uszkodzenie nosnika albo reczna ingerencje.
    """


def _store_dir() -> Path:
    # Ta sama zmienna srodowiskowa co `enm.store` i `enm.dziennik_zmian` —
    # migawki rewizji dziela lokalizacje modelu (a wiec i czyszczenie w testach).
    configured = os.getenv("ENM_STORE_DIR")
    return Path(configured) if configured else _DEFAULT_STORE_DIR


def digest_klucza(klucz: str) -> str:
    """Skrot klucza magazynu — ta sama funkcja, ktora nazywa plik HEAD i dziennik."""
    return sha256(klucz.encode("utf-8")).hexdigest()


def katalog_rewizji(klucz: str) -> Path:
    return _store_dir() / f"{digest_klucza(klucz)}{SUFIKS_KATALOGU_REWIZJI}"


def sciezka_rewizji(klucz: str, rewizja: int) -> Path:
    return katalog_rewizji(klucz) / f"{rewizja}{ROZSZERZENIE_MIGAWKI}"


def _numer_z_nazwy(sciezka: Path) -> int | None:
    nazwa = sciezka.name
    if not nazwa.endswith(ROZSZERZENIE_MIGAWKI):
        return None
    rdzen = nazwa[: -len(ROZSZERZENIE_MIGAWKI)]
    return int(rdzen) if rdzen.isdigit() else None


def dostepne_rewizje(klucz: str) -> list[int]:
    """Numery rewizji, ktore maja migawke (rosnaco). Pliki robocze sa pomijane."""
    katalog = katalog_rewizji(klucz)
    if not katalog.is_dir():
        return []
    numery = [n for p in katalog.iterdir() if (n := _numer_z_nazwy(p)) is not None]
    return sorted(numery)


def _serializuj(klucz: str, enm: EnergyNetworkModel, hash_sha256: str) -> bytes:
    # `hash_sha256` to hash TRESCI (`compute_enm_hash`), nie kopia `header.hash_sha256`:
    # naglowek modelu przywroconego z archiwum albo zbudowanego w tescie moze niesc
    # hash pusty lub nieaktualny, a migawka jest adresowana trescia.
    payload = {
        "klucz": klucz,
        "rewizja": enm.header.revision,
        "hash_sha256": hash_sha256,
        "snapshot": enm.model_dump(mode="json"),
    }
    tekst = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return gzip.compress(tekst.encode("utf-8"), compresslevel=6, mtime=0)


@dataclass(frozen=True)
class PrzygotowanaRewizja:
    """Migawka rewizji ZAPISANA na nosnik jako plik roboczy, jeszcze NIEZATWIERDZONA.

    Ten sam wzorzec dwufazowy co `dziennik_zmian.PrzygotowanyWpis`: przygotowanie
    nie zmienia niczego widocznego, `zatwierdz()` podmienia plik atomowo,
    `porzuc()` sprzata plik roboczy operacji, ktora zglosila blad, a
    `usun_zatwierdzona()` cofa podmiane, gdy blad przyszedl PO niej (awaria
    zatwierdzenia dziennika) — HEAD jest wtedy przywracany, wiec migawka `n`
    stalaby sie sierota.
    """

    klucz: str
    rewizja: int
    tmp: Path
    docelowa: Path

    def zatwierdz(self) -> Path:
        self.tmp.replace(self.docelowa)
        return self.docelowa

    def porzuc(self) -> None:
        self.tmp.unlink(missing_ok=True)

    def usun_zatwierdzona(self) -> None:
        self.docelowa.unlink(missing_ok=True)


def przygotuj_rewizje(
    klucz: str, enm: EnergyNetworkModel, *, hash_sha256: str | None = None
) -> PrzygotowanaRewizja:
    """Zapisz migawke rewizji `enm.header.revision` jako plik roboczy (faza 1).

    `hash_sha256` podaje wolajacy, ktory wlasnie go policzyl (`set_enm`); brak =
    policz z tresci.
    """
    katalog = katalog_rewizji(klucz)
    katalog.mkdir(parents=True, exist_ok=True)
    docelowa = sciezka_rewizji(klucz, enm.header.revision)
    tmp = sciezka_tymczasowa(docelowa)
    try:
        tmp.write_bytes(_serializuj(klucz, enm, hash_sha256 or compute_enm_hash(enm)))
    except OSError:
        tmp.unlink(missing_ok=True)
        raise
    return PrzygotowanaRewizja(klucz=klucz, rewizja=enm.header.revision, tmp=tmp, docelowa=docelowa)


def zapewnij_migawke(
    klucz: str, enm: EnergyNetworkModel, *, hash_sha256: str | None = None
) -> bool:
    """Zapisz migawke rewizji biezacej, jesli jej jeszcze nie ma (idempotentnie).

    Uzywane tam, gdzie model trafia na nosnik BEZ podniesienia rewizji: zapis
    rownowazny tresciowo (`set_enm` bez zmiany), przywrocenie z archiwum
    (`restore_enm`), migracja klucza przypadku (CV-1). Zwraca True, gdy plik powstal.
    """
    if sciezka_rewizji(klucz, enm.header.revision).exists():
        return False
    przygotuj_rewizje(klucz, enm, hash_sha256=hash_sha256).zatwierdz()
    return True


def _wczytaj_payload(sciezka: Path) -> dict[str, Any]:
    try:
        surowe = gzip.decompress(sciezka.read_bytes())
        payload = json.loads(surowe.decode("utf-8"))
    except (OSError, EOFError, gzip.BadGzipFile, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RewizjaUszkodzonaError(f"Migawka {sciezka} jest nieczytelna: {exc}") from exc
    if not isinstance(payload, dict) or not isinstance(payload.get("snapshot"), dict):
        raise RewizjaUszkodzonaError(f"Migawka {sciezka} nie ma kanonicznej postaci")
    return payload


def hash_migawki(klucz: str, rewizja: int) -> str | None:
    """Hash zapisany w migawce (bez walidacji modelu); None gdy migawki nie ma."""
    sciezka = sciezka_rewizji(klucz, rewizja)
    if not sciezka.exists():
        return None
    payload = _wczytaj_payload(sciezka)
    wartosc = payload.get("hash_sha256")
    return wartosc if isinstance(wartosc, str) else None


def wczytaj_rewizje(klucz: str, rewizja: int) -> EnergyNetworkModel:
    """Odczytaj migawke rewizji `rewizja` i SPRAWDZ jej tozsamosc.

    Sprawdzane sa dwie rzeczy: numer rewizji (w pliku i w naglowku modelu) oraz
    hash tresci przeliczony `compute_enm_hash` wobec hasha zapisanego w migawce.
    Rozjazd = `RewizjaUszkodzonaError`; brak pliku = `RewizjaNieistniejeError`.
    `header.hash_sha256` modelu NIE jest tu kryterium — hash tresci go wyklucza,
    a naglowek modelu z archiwum/testu moze go nie niesc.
    """
    sciezka = sciezka_rewizji(klucz, rewizja)
    if not sciezka.exists():
        raise RewizjaNieistniejeError(klucz, rewizja)
    payload = _wczytaj_payload(sciezka)
    try:
        model = EnergyNetworkModel.model_validate(payload["snapshot"])
    except ValueError as exc:
        raise RewizjaUszkodzonaError(f"Migawka {sciezka} nie waliduje sie jako ENM: {exc}") from exc
    if payload.get("rewizja") != rewizja or model.header.revision != rewizja:
        raise RewizjaUszkodzonaError(
            f"Migawka {sciezka} deklaruje rewizje {payload.get('rewizja')!r}/"
            f"{model.header.revision}, oczekiwano {rewizja}"
        )
    hash_zapisany = payload.get("hash_sha256")
    hash_przeliczony = compute_enm_hash(model)
    if hash_zapisany != hash_przeliczony:
        raise RewizjaUszkodzonaError(
            f"Migawka {sciezka}: hash zapisany {hash_zapisany!r} nie zgadza sie "
            f"z przeliczonym z tresci {hash_przeliczony!r}"
        )
    return model


@dataclass(frozen=True)
class RaportUzgodnienia:
    """Co zrobilo uzgodnienie indeksu migawek z HEAD przy wczytaniu modelu."""

    usuniete_osierocone: tuple[int, ...] = ()
    odtworzona_biezaca: bool = False
    zastapiona_biezaca: bool = False
    usuniete_robocze: int = 0

    @property
    def cokolwiek(self) -> bool:
        return bool(
            self.usuniete_osierocone
            or self.odtworzona_biezaca
            or self.zastapiona_biezaca
            or self.usuniete_robocze
        )


def uzgodnij_indeks(klucz: str, biezacy: EnergyNetworkModel) -> RaportUzgodnienia:
    """Doprowadz indeks migawek do zgodnosci z HEAD (regula spojnosci z naglowka modulu).

    Wolane RAZ przy wczytaniu modelu z nosnika (`enm/store.py`), pod blokada twin.
    Nigdy nie zmienia HEAD; zmienia wylacznie pliki w `.rev/`.
    """
    katalog = katalog_rewizji(klucz)
    rewizja_head = biezacy.header.revision
    usuniete: list[int] = []
    usuniete_robocze = 0
    if katalog.is_dir():
        for plik in katalog.iterdir():
            if plik.name.endswith(".tmp"):
                plik.unlink(missing_ok=True)
                usuniete_robocze += 1
                continue
            numer = _numer_z_nazwy(plik)
            if numer is not None and numer > rewizja_head:
                plik.unlink(missing_ok=True)
                usuniete.append(numer)
                logger.warning(
                    "rewizja_osierocona klucz=%s rewizja=%s head=%s — migawka bez "
                    "zatwierdzonej rewizji usunieta (nigdy nie promowana)",
                    klucz,
                    numer,
                    rewizja_head,
                )
    odtworzona = False
    zastapiona = False
    hash_head = compute_enm_hash(biezacy)
    hash_biezacej = hash_migawki(klucz, rewizja_head) if katalog.is_dir() else None
    if hash_biezacej is None:
        przygotuj_rewizje(klucz, biezacy, hash_sha256=hash_head).zatwierdz()
        odtworzona = True
        logger.info(
            "rewizja_odtworzona klucz=%s rewizja=%s — migawka biezacej rewizji zapisana z HEAD",
            klucz,
            rewizja_head,
        )
    elif hash_biezacej != hash_head:
        przygotuj_rewizje(klucz, biezacy, hash_sha256=hash_head).zatwierdz()
        zastapiona = True
        logger.warning(
            "rewizja_zastapiona klucz=%s rewizja=%s — migawka o innym hashu niz HEAD "
            "zastapiona trescia HEAD",
            klucz,
            rewizja_head,
        )
    return RaportUzgodnienia(
        usuniete_osierocone=tuple(sorted(usuniete)),
        odtworzona_biezaca=odtworzona,
        zastapiona_biezaca=zastapiona,
        usuniete_robocze=usuniete_robocze,
    )


def przenies_katalog_rewizji(klucz: str, katalog_docelowy: Path) -> bool:
    """Przenies caly katalog migawek klucza do `katalog_docelowy` (migracja CV-1:
    odlozenie przypadku do `legacy_przypadki/`). True, gdy bylo co przenosic."""
    zrodlo = katalog_rewizji(klucz)
    if not zrodlo.is_dir():
        return False
    cel = katalog_docelowy / zrodlo.name
    if cel.exists():
        shutil.rmtree(cel)
    shutil.move(str(zrodlo), str(cel))
    return True


def skopiuj_katalog_rewizji(klucz_zrodla: str, klucz_celu: str) -> int:
    """Skopiuj migawki spod klucza zrodlowego pod klucz celu (bez nadpisywania
    istniejacych). Zwraca liczbe skopiowanych migawek."""
    zrodlo = katalog_rewizji(klucz_zrodla)
    if not zrodlo.is_dir():
        return 0
    cel = katalog_rewizji(klucz_celu)
    cel.mkdir(parents=True, exist_ok=True)
    skopiowane = 0
    for plik in zrodlo.iterdir():
        if _numer_z_nazwy(plik) is None:
            continue
        docelowy = cel / plik.name
        if docelowy.exists():
            continue
        # Migawka jest wewnatrz adresowana kluczem ZRODLA (`payload["klucz"]`);
        # zapisujemy ja pod kluczem celu z przepisanym polem klucza, zeby plik
        # mowil prawde o tym, gdzie lezy. Tresc modelu i hash bez zmian.
        payload = _wczytaj_payload(plik)
        payload["klucz"] = klucz_celu
        tekst = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        tmp = sciezka_tymczasowa(docelowy)
        try:
            tmp.write_bytes(gzip.compress(tekst.encode("utf-8"), compresslevel=6, mtime=0))
            tmp.replace(docelowy)
        except OSError:
            tmp.unlink(missing_ok=True)
            raise
        skopiowane += 1
    return skopiowane


def usun_wszystkie_migawki() -> None:
    """Reset magazynu migawek — uzywany przez testy razem z `reset_enm_store`."""
    katalog = _store_dir()
    if not katalog.exists():
        return
    for sciezka in katalog.glob(f"*{SUFIKS_KATALOGU_REWIZJI}"):
        if sciezka.is_dir():
            shutil.rmtree(sciezka, ignore_errors=True)
