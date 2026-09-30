"""Cennik wersjonowany powiązany z typem katalogowym (karta W10-2a, decyzja OD-16).

PO CO. Koszty (lista materiałowa, koszt cyklu życia, porównanie wariantów) wymagają cen, a
typy katalogowe są NIEMUTOWALNE i nie niosą ceny. Cena nie jest cechą typu (zmienia się w
czasie, zależy od dostawcy i daty oferty), więc żyje w OSOBNYM, wersjonowanym pliku
``cennik_RRRR-MM.yaml`` powiązanym z katalogiem wyłącznie po ``type_id``. Hash katalogu i
złote hashe sieci wzorcowych nie zależą od cennika.

ZASADY (OD-16, ostateczne):
  * stan źródła KAŻDEJ wartości — ten sam typ co profil NC RfG (``werdykt.kontrakt.StanZrodla``:
    ``ZWERYFIKOWANE`` / ``WSKAZANE`` / ``NIEUSTALONE``). Stan ``WSKAZANE`` albo
    ``ZWERYFIKOWANE`` wymaga dokumentu źródłowego i daty; brak którejś obniża stan do
    ``NIEUSTALONE`` z uwagą nazywającą brak (przeetykietowanie nie podnosi stanu). Stan nie
    blokuje liczenia, zakazuje przemilczenia — wynik kosztowy niesie najsłabszy stan użytych cen;
  * aktualizacja wyłącznie NOWĄ wersją pliku (nowy miesiąc = nowy plik; plik wydany się nie
    zmienia). Zero przeliczania inflacją czy indeksacji — nie ma takiego pola;
  * brak ceny to brak (``None``), nigdy zero; funkcja kosztowa bez ceny zwraca odmowę
    ``BRAK_CENNIKA`` z listą ``type_id`` (``application/koszty``);
  * STRAŻNIK (``naruszenia_cennika``, wołany przy wczytaniu i przez
    ``scripts/cennik_guard.py``): ``type_id`` istnieje w katalogu, waluta jest kodem ISO 4217
    z listy obsługiwanej, data cen należy do miesiąca wersji, stan źródła spójny, jednostka
    ceny z listy jednostek listy materiałowej, bez powtórzeń ``type_id``.

Plik cennika w repozytorium zawiera wyłącznie pozycje z jawnym źródłem albo jest pustym
szablonem — cen z pamięci się nie wpisuje.

Moduł jest odczytem danych: zero fizyki, zero arytmetyki kosztu (ta żyje w
``network_model/pochodne/koszty.py``).
"""

from __future__ import annotations

import hashlib
import json
import math
import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import date
from functools import cache
from pathlib import Path
from typing import Any, get_args

import yaml
from network_model.catalog.indeks_typow import identyfikatory_typow
from network_model.catalog.repository import CatalogRepository
from network_model.odmowa_danych import OdmowaDanychError
from werdykt.kontrakt import StanZrodla

KATALOG_CENNIKOW = Path(__file__).parent
#: Nazwa pliku cennika: jedna wersja na miesiąc.
WZORZEC_PLIKU = re.compile(r"^cennik_(\d{4}-\d{2})\.yaml$")
#: Waluty obsługiwane przez funkcje kosztowe (jedna waluta na plik; przeliczeń kursowych brak).
WALUTY_OBSLUGIWANE: tuple[str, ...] = ("PLN",)
#: Jednostki ceny = jednostki pozycji listy materiałowej (`application/analyses/lista_materialowa`).
JEDNOSTKI_CENY: tuple[str, ...] = ("szt.", "km")
#: Kolejność stanów od najmocniejszego — złożenie dziedziczy najsłabszy (jak profil NC RfG).
KOLEJNOSC_STANOW: tuple[StanZrodla, ...] = get_args(StanZrodla)
UWAGA_OBNIZENIA = "stan obniżony do NIEUSTALONE: brak {braki} źródła ceny"

__all__ = [
    "JEDNOSTKI_CENY",
    "KATALOG_CENNIKOW",
    "WALUTY_OBSLUGIWANE",
    "BladCennika",
    "CenaEnergii",
    "Cennik",
    "PozycjaCennika",
    "ZrodloCeny",
    "aktualny_cennik",
    "cennik_z_danych",
    "identyfikatory_typow",
    "najslabszy_stan",
    "naruszenia_cennika",
    "pliki_cennikow",
    "wczytaj_cennik",
]


class BladCennika(OdmowaDanychError):
    """Plik cennika narusza kontrakt (strażnik) — dane właściciela do poprawy, nie program."""


def najslabszy_stan(stany: Iterable[StanZrodla]) -> StanZrodla:
    """Stan złożenia kilku cen = najsłabszy ze składników (pusty zbiór: NIEUSTALONE)."""
    lista = list(stany)
    if not lista:
        return "NIEUSTALONE"
    return max(lista, key=KOLEJNOSC_STANOW.index)


@dataclass(frozen=True)
class ZrodloCeny:
    """Skąd pochodzi wartość ceny: dokument (oferta, cennik producenta, wskaźnik OSD), data."""

    status: StanZrodla
    dokument: str | None
    data: date | None
    uwagi_pl: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "dokument": self.dokument,
            "data": None if self.data is None else self.data.isoformat(),
            "uwagi_pl": self.uwagi_pl,
        }


@dataclass(frozen=True)
class PozycjaCennika:
    """Cena typu katalogowego: nakład inwestycyjny na jednostkę i koszt eksploatacji roczny.

    ``capex_pln`` — cena jednostkowa zakupu i montażu [waluta/jednostka]; ``opex_pln_rok`` —
    roczny koszt eksploatacji [waluta/(jednostka·rok)]. Każde z pól może być ``None`` (brak
    ceny ≠ zero); co najmniej jedno jest podane.
    """

    type_id: str
    jednostka: str
    capex_pln: float | None
    opex_pln_rok: float | None
    zrodlo: ZrodloCeny

    def to_dict(self) -> dict[str, Any]:
        return {
            "type_id": self.type_id,
            "jednostka": self.jednostka,
            "capex_pln": self.capex_pln,
            "opex_pln_rok": self.opex_pln_rok,
            "zrodlo": self.zrodlo.to_dict(),
        }


@dataclass(frozen=True)
class CenaEnergii:
    """Cena energii do wyceny strat [waluta/MWh] z własnym stanem źródła (``None`` = brak)."""

    cena_pln_mwh: float | None
    zrodlo: ZrodloCeny

    def to_dict(self) -> dict[str, Any]:
        return {"cena_pln_mwh": self.cena_pln_mwh, "zrodlo": self.zrodlo.to_dict()}


@dataclass(frozen=True)
class Cennik:
    """Jedna wersja cennika (plik ``cennik_RRRR-MM.yaml``); pozycje posortowane po ``type_id``."""

    wersja: str
    waluta: str
    data_cen: date
    opis_pl: str
    energia_strat: CenaEnergii
    pozycje: tuple[PozycjaCennika, ...]

    def pozycja(self, type_id: str) -> PozycjaCennika | None:
        for pozycja in self.pozycje:
            if pozycja.type_id == type_id:
                return pozycja
        return None

    def to_dict(self) -> dict[str, Any]:
        return {
            "wersja": self.wersja,
            "waluta": self.waluta,
            "data_cen": self.data_cen.isoformat(),
            "opis_pl": self.opis_pl,
            "energia_strat": self.energia_strat.to_dict(),
            "pozycje": [pozycja.to_dict() for pozycja in self.pozycje],
        }

    @property
    def hash_cennika(self) -> str:
        """SHA-256 kanonicznego JSON cennika (klucze posortowane) — stabilny między biegami."""
        kanon = json.dumps(
            self.to_dict(), sort_keys=True, ensure_ascii=False, separators=(",", ":")
        )
        return hashlib.sha256(kanon.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Wczytanie i strażnik
# ---------------------------------------------------------------------------


def _napis(wartosc: object) -> str | None:
    if wartosc is None:
        return None
    tekst = str(wartosc).strip()
    return tekst or None


def _data(wartosc: object, gdzie: str) -> date | None:
    if wartosc is None:
        return None
    if isinstance(wartosc, date):
        return wartosc
    try:
        return date.fromisoformat(str(wartosc))
    except ValueError as exc:
        raise BladCennika(f"{gdzie}: data „{wartosc}” nie jest datą RRRR-MM-DD.") from exc


def _cena(wartosc: object, gdzie: str) -> float | None:
    if wartosc is None:
        return None
    if isinstance(wartosc, bool) or not isinstance(wartosc, int | float):
        raise BladCennika(f"{gdzie}: cena „{wartosc}” nie jest liczbą.")
    liczba = float(wartosc)
    if not math.isfinite(liczba) or liczba < 0.0:
        raise BladCennika(f"{gdzie}: cena {liczba} musi być skończoną liczbą nieujemną.")
    return liczba


def _zrodlo(surowe: object, gdzie: str) -> ZrodloCeny:
    """Źródło ceny z obniżeniem stanu przy braku dokumentu lub daty (OD-16)."""
    if not isinstance(surowe, Mapping):
        raise BladCennika(f"{gdzie}: brak sekcji „zrodlo” (stan źródła każdej wartości).")
    status = surowe.get("status")
    if status not in KOLEJNOSC_STANOW:
        raise BladCennika(f"{gdzie}: stan źródła „{status}” spoza {', '.join(KOLEJNOSC_STANOW)}.")
    dokument = _napis(surowe.get("dokument"))
    data = _data(surowe.get("data"), gdzie)
    uwagi = _napis(surowe.get("uwagi_pl"))
    if status != "NIEUSTALONE":
        braki = [
            nazwa for nazwa, wartosc in (("dokumentu", dokument), ("daty", data)) if not wartosc
        ]
        if braki:
            uwaga = UWAGA_OBNIZENIA.format(braki=" i ".join(braki))
            return ZrodloCeny(
                status="NIEUSTALONE",
                dokument=dokument,
                data=data,
                uwagi_pl=uwaga if uwagi is None else f"{uwagi}; {uwaga}",
            )
    elif uwagi is None:
        raise BladCennika(f"{gdzie}: stan NIEUSTALONE wymaga uwag nazywających brak źródła.")
    return ZrodloCeny(status=status, dokument=dokument, data=data, uwagi_pl=uwagi)


def _pozycja(surowa: object, indeks: int) -> PozycjaCennika:
    gdzie = f"Pozycja {indeks + 1} cennika"
    if not isinstance(surowa, Mapping):
        raise BladCennika(f"{gdzie}: oczekiwano sekcji z polami type_id, jednostka, ceny.")
    type_id = _napis(surowa.get("type_id"))
    if type_id is None:
        raise BladCennika(f"{gdzie}: brak identyfikatora typu katalogowego.")
    gdzie = f"{gdzie} ({type_id})"
    capex = _cena(surowa.get("capex_pln"), gdzie)
    opex = _cena(surowa.get("opex_pln_rok"), gdzie)
    if capex is None and opex is None:
        raise BladCennika(f"{gdzie}: pozycja bez żadnej ceny — pomiń ją zamiast wpisywać pustą.")
    return PozycjaCennika(
        type_id=type_id,
        jednostka=str(surowa.get("jednostka") or ""),
        capex_pln=capex,
        opex_pln_rok=opex,
        zrodlo=_zrodlo(surowa.get("zrodlo"), gdzie),
    )


def naruszenia_cennika(
    cennik: Cennik, *, katalog: CatalogRepository | None = None, nazwa_pliku: str | None = None
) -> list[str]:
    """Strażnik cennika: lista naruszeń kontraktu (pusta = cennik dopuszczalny)."""
    naruszenia: list[str] = []
    if nazwa_pliku is not None:
        dopasowanie = WZORZEC_PLIKU.match(nazwa_pliku)
        if dopasowanie is None:
            naruszenia.append(f"Plik „{nazwa_pliku}” nie ma nazwy cennik_RRRR-MM.yaml.")
        elif dopasowanie.group(1) != cennik.wersja:
            naruszenia.append(
                f"Plik „{nazwa_pliku}” deklaruje wersję {cennik.wersja} — nazwa i wersja różne."
            )
    if re.fullmatch(r"\d{4}-\d{2}", cennik.wersja) is None:
        naruszenia.append(f"Wersja „{cennik.wersja}” nie ma postaci RRRR-MM.")
    elif cennik.data_cen.strftime("%Y-%m") != cennik.wersja:
        naruszenia.append(
            f"Data cen {cennik.data_cen.isoformat()} spoza miesiąca wersji {cennik.wersja}."
        )
    if cennik.waluta not in WALUTY_OBSLUGIWANE:
        naruszenia.append(
            f"Waluta „{cennik.waluta}” nieobsługiwana (dozwolone: {', '.join(WALUTY_OBSLUGIWANE)})."
        )
    znane = identyfikatory_typow(katalog)
    widziane: set[str] = set()
    for pozycja in cennik.pozycje:
        if pozycja.type_id in widziane:
            naruszenia.append(f"Typ {pozycja.type_id} wyceniony więcej niż raz.")
        widziane.add(pozycja.type_id)
        if pozycja.type_id not in znane:
            naruszenia.append(f"Typ {pozycja.type_id} nie istnieje w katalogu.")
        if pozycja.jednostka not in JEDNOSTKI_CENY:
            naruszenia.append(
                f"Typ {pozycja.type_id}: jednostka „{pozycja.jednostka}” spoza "
                f"{', '.join(JEDNOSTKI_CENY)}."
            )
        if pozycja.zrodlo.data is not None and pozycja.zrodlo.data > cennik.data_cen:
            naruszenia.append(
                f"Typ {pozycja.type_id}: źródło ceny z {pozycja.zrodlo.data.isoformat()} "
                f"późniejsze niż data cen {cennik.data_cen.isoformat()}."
            )
    return naruszenia


def cennik_z_danych(dane: object, *, nazwa_pliku: str | None = None) -> Cennik:
    """Zbuduj cennik z danych YAML i sprawdź strażnikiem (naruszenie → ``BladCennika``)."""
    if not isinstance(dane, Mapping):
        raise BladCennika("Cennik: oczekiwano sekcji głównej z polami wersja, waluta, data_cen.")
    data_cen = _data(dane.get("data_cen"), "Cennik")
    if data_cen is None:
        raise BladCennika("Cennik: brak daty cen (data_cen).")
    energia = dane.get("energia_strat")
    if not isinstance(energia, Mapping):
        raise BladCennika("Cennik: brak sekcji energia_strat (cena null jest dopuszczalna).")
    pozycje_surowe = dane.get("pozycje")
    if not isinstance(pozycje_surowe, list):
        raise BladCennika("Cennik: sekcja pozycje musi być listą (pusta lista = szablon).")
    cennik = Cennik(
        wersja=str(dane.get("wersja") or ""),
        waluta=str(dane.get("waluta") or ""),
        data_cen=data_cen,
        opis_pl=str(dane.get("opis_pl") or ""),
        energia_strat=CenaEnergii(
            cena_pln_mwh=_cena(energia.get("cena_pln_mwh"), "Cena energii strat"),
            zrodlo=_zrodlo(energia.get("zrodlo"), "Cena energii strat"),
        ),
        pozycje=tuple(
            sorted(
                (_pozycja(surowa, indeks) for indeks, surowa in enumerate(pozycje_surowe)),
                key=lambda pozycja: pozycja.type_id,
            )
        ),
    )
    naruszenia = naruszenia_cennika(cennik, nazwa_pliku=nazwa_pliku)
    if naruszenia:
        raise BladCennika("Cennik narusza kontrakt: " + " ".join(naruszenia))
    return cennik


def wczytaj_cennik(sciezka: Path) -> Cennik:
    """Wczytaj jeden plik cennika i sprawdź go strażnikiem."""
    with sciezka.open(encoding="utf-8") as plik:
        dane = yaml.safe_load(plik)
    return cennik_z_danych(dane, nazwa_pliku=sciezka.name)


def pliki_cennikow(katalog: Path = KATALOG_CENNIKOW) -> tuple[Path, ...]:
    """Pliki ``cennik_RRRR-MM.yaml`` posortowane po wersji rosnąco."""
    return tuple(sorted(p for p in katalog.glob("cennik_*.yaml") if WZORZEC_PLIKU.match(p.name)))


@cache
def aktualny_cennik() -> Cennik | None:
    """Najnowsza wersja cennika w repozytorium (``None`` — w katalogu nie ma żadnego pliku)."""
    pliki = pliki_cennikow()
    return wczytaj_cennik(pliki[-1]) if pliki else None
