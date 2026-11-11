"""Zajętość pól liniowych SN — JEDNO źródło prawdy (karta POLE-ZAJĘTE).

Po co: kanon „z jednego pola liniowego NIGDY nie wychodzą dwa kable” (dyrektywa właściciela
2026-07-17) backend egzekwował wyłącznie przy odgałęzieniach z GPZ (`assigned_corridor_ref`
i indeks 0), a front liczył zajętość osobno (zacisk pola i `origin_bay_ref`). Dwa niezależne
predykaty „dziś zgodne” — operacja `continue_trunk_segment_sn` przyjmowała drugi kabel z
zajętego pola stacji (zmierzone, karta S95-START). Ten moduł jest jedynym miejscem, które
rozstrzyga, jakie odcinki terenowe są przyłączone do pola. Czytają go: operacje domenowe
przyłączające odcinek do pola (odmowa kodem `field.line_field_occupied`), walidator modelu
(stan zastany z dwoma odcinkami na polu) i widoki logiczne (`line_fields`), z których front
bierze dostępność punktu startu — front zajętości nie liczy.

Reguły (wyłącznie z JAWNYCH danych modelu, bez domysłu):
  R1 odcinek terenowy z `meta.origin_bay_ref == field_ref`, który kończy się w punkcie
     przyłączenia pola (zacisk pola albo, dla pola bez własnego zacisku, szyna pola) —
     warunek końca odróżnia odcinek wyprowadzony z pola od połówki podzielonego odcinka,
     która w starszych migawkach dziedziczyła metadane pochodzenia;
  R2 pole z WŁASNYM zaciskiem (zacisk ≠ szyna pola): każdy odcinek terenowy, który ma koniec
     na tym zacisku;
  R3 `meta.assigned_corridor_ref` wskazuje istniejący, niepusty korytarz (przydział pola GPZ);
  R4 pole GPZ o indeksie 0 BEZ własnego zacisku (migawki sprzed przydziałów): zajęte, gdy
     magistrala tego GPZ zaczyna się odcinkiem na szynie pola, a odcinek nie niesie
     pochodzenia z pola (przy pochodzeniu rozstrzyga R1).
R1 i R2 to przyłączenie FIZYCZNE (odcinek ma koniec na polu) — tylko one liczą się do stanu
„dwa odcinki na jednym polu”. R3 i R4 to przyłączenie DEKLARATYWNE (pole zasila korytarz).

Pola czyta wyłącznie z rekordów `bays` przez akcesor `enm.pola` (karta W5-B): pola SN stacji
(`pola_sn_stacji`), zacisk pola z `Bay.terminal_bus_ref` (`zacisk_pola`). Operuje na słowniku
ENM (postać operacji domenowych); widok przekazany przez wołającego MUSI nieść `bays` i `buses`
(poziom pola rozstrzyga napięcie szyny).
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any

from .pola import czy_pole_nn, pola_wg_stacji, poziom_pol, zacisk_pola

#: Rodzaje gałęzi, które są odcinkiem terenowym SN (kabel, linia napowietrzna).
TYPY_ODCINKA_TERENOWEGO: frozenset[str] = frozenset({"cable", "line_overhead"})

#: Role pól, z których może wyjść ciąg (ta sama lista co `_is_line_continuation_field`).
ROLE_POLA_WYPROWADZENIA: frozenset[str] = frozenset({"OUT", "FEEDER"})

#: Kod odmowy operacji przyłączającej odcinek do zajętego pola.
KOD_POLE_ZAJETE = "field.line_field_occupied"


@dataclass(frozen=True)
class ZajetoscPola:
    """Zajętość jednego pola rozdzielnicy SN."""

    field_ref: str
    station_ref: str
    bay_role: str
    #: Punkt przyłączenia pola: własny zacisk pola albo szyna pola (pole bez zacisku).
    punkt_przylaczenia: str | None
    #: Czy pole ma własny zacisk (różny od szyny pola).
    wlasny_zacisk: bool
    #: Odcinki przyłączone FIZYCZNIE (R1, R2) — posortowane.
    odcinki_fizyczne: tuple[str, ...]
    #: Korytarze przypisane deklaratywnie (R3, R4) — posortowane.
    korytarze: tuple[str, ...]

    @property
    def zajete(self) -> bool:
        return bool(self.odcinki_fizyczne or self.korytarze)

    @property
    def przeciazone(self) -> bool:
        """Dwa lub więcej odcinków fizycznie na jednym polu — naruszenie kanonu."""
        return len(self.odcinki_fizyczne) > 1


def _slownik(value: object) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _napis(value: object) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def _pola_sn_stacji(enm: Mapping[str, Any]) -> Iterable[tuple[str, Mapping[str, Any]]]:
    """Pola SN stacji modelu (rekordy `bays`, predykat poziomu `enm.pola.czy_pole_nn`) w
    kolejności stacji i zapisu pól. Pola nN i pola ZKSN nie są polami liniowymi stacji SN.

    Jedno przejście po polach (`pola_wg_stacji`) i jeden zbiór danych predykatu poziomu
    (`poziom_pol`) na wywołanie: zajętość liczona jest przy każdej operacji przyłączenia
    i w widokach logicznych, więc filtrowanie całej kolekcji pól dla każdej stacji i
    przeglądanie stacji dla każdego pola dawało koszt kwadratowy w rozmiarze sieci."""
    poziom = poziom_pol(enm)
    wg_stacji = pola_wg_stacji(enm)
    for stacja in enm.get("substations") or []:
        if not isinstance(stacja, Mapping):
            continue
        station_ref = _napis(stacja.get("ref_id")) or ""
        for rekord in wg_stacji.get(station_ref, []):
            if _napis(rekord.get("ref_id")) and not czy_pole_nn(enm, rekord, poziom):
                yield station_ref, rekord


def zajetosc_pol(enm: Mapping[str, Any]) -> dict[str, ZajetoscPola]:
    """Zajętość KAŻDEGO pola rozdzielnicy SN modelu (klucz: identyfikator pola `Bay.ref_id`),
    deterministycznie."""
    odcinki_terenowe = [
        galaz
        for galaz in enm.get("branches") or []
        if isinstance(galaz, Mapping) and galaz.get("type") in TYPY_ODCINKA_TERENOWEGO
    ]
    odcinki_na_szynie: dict[str, set[str]] = {}
    odcinki_z_pochodzenia: dict[str, list[Mapping[str, Any]]] = {}
    for galaz in odcinki_terenowe:
        ref = _napis(galaz.get("ref_id"))
        if not ref:
            continue
        for koniec in (galaz.get("from_bus_ref"), galaz.get("to_bus_ref")):
            szyna = _napis(koniec)
            if szyna:
                odcinki_na_szynie.setdefault(szyna, set()).add(ref)
        pochodzenie = _napis(_slownik(galaz.get("meta")).get("origin_bay_ref"))
        if pochodzenie:
            odcinki_z_pochodzenia.setdefault(pochodzenie, []).append(galaz)

    galezie = {
        ref: galaz
        for galaz in enm.get("branches") or []
        if isinstance(galaz, Mapping) and (ref := _napis(galaz.get("ref_id")))
    }
    korytarze = {
        ref: korytarz
        for korytarz in enm.get("corridors") or []
        if isinstance(korytarz, Mapping) and (ref := _napis(korytarz.get("ref_id")))
    }

    wynik: dict[str, ZajetoscPola] = {}
    for station_ref, spec in _pola_sn_stacji(enm):
        field_ref = str(_napis(spec.get("ref_id")))
        szyna_pola = _napis(spec.get("bus_ref"))
        zacisk = zacisk_pola(spec)
        wlasny_zacisk = bool(zacisk and zacisk != szyna_pola)
        punkt = zacisk if wlasny_zacisk else szyna_pola

        fizyczne: set[str] = set()
        # R1: odcinek wyprowadzony z pola, z końcem w punkcie przyłączenia pola.
        for galaz in odcinki_z_pochodzenia.get(field_ref, []):
            konce = {_napis(galaz.get("from_bus_ref")), _napis(galaz.get("to_bus_ref"))}
            if punkt and punkt in konce:
                fizyczne.add(str(galaz.get("ref_id")))
        # R2: odcinek z końcem na własnym zacisku pola.
        if wlasny_zacisk and zacisk:
            fizyczne |= odcinki_na_szynie.get(zacisk, set())

        meta = _slownik(spec.get("meta"))
        deklaratywne: set[str] = set()
        # R3: jawny przydział korytarza.
        przydzial = _napis(meta.get("assigned_corridor_ref"))
        if przydzial and (korytarze.get(przydzial) or {}).get("ordered_segment_refs"):
            deklaratywne.add(przydzial)
        # R4: pole GPZ o indeksie 0 bez własnego zacisku (migawki sprzed przydziałów): zasila
        # magistralę GPZ, której PIERWSZY odcinek zaczyna się na szynie TEGO pola i nie niesie
        # pochodzenia z pola (gdy niesie — rozstrzyga R1). Dawniej każde pole o indeksie 0
        # każdej sekcji było „zajęte”, gdy JAKAKOLWIEK magistrala GPZ miała odcinki.
        if meta.get("gpz_line_field_index") == 0 and not wlasny_zacisk and szyna_pola:
            prefiks = "/".join(field_ref.split("/")[:2])
            for ref, korytarz in sorted(korytarze.items()):
                kolejnosc = korytarz.get("ordered_segment_refs") or []
                if not ref.startswith(f"{prefiks}/corridor_") or not kolejnosc:
                    continue
                pierwszy = galezie.get(str(kolejnosc[0]))
                if pierwszy is None or _napis(_slownik(pierwszy.get("meta")).get("origin_bay_ref")):
                    continue
                if szyna_pola in (
                    _napis(pierwszy.get("from_bus_ref")),
                    _napis(pierwszy.get("to_bus_ref")),
                ):
                    deklaratywne.add(ref)

        wynik[field_ref] = ZajetoscPola(
            field_ref=field_ref,
            station_ref=station_ref,
            bay_role=str(spec.get("bay_role") or "").upper(),
            punkt_przylaczenia=punkt,
            wlasny_zacisk=wlasny_zacisk,
            odcinki_fizyczne=tuple(sorted(fizyczne)),
            korytarze=tuple(sorted(deklaratywne)),
        )
    return dict(sorted(wynik.items()))


def zajetosc_pola(enm: Mapping[str, Any], field_ref: str | None) -> ZajetoscPola | None:
    """Zajętość jednego pola (None, gdy pola nie ma w modelu)."""
    if not field_ref:
        return None
    return zajetosc_pol(enm).get(field_ref)


def pola_wg_wlasnego_zacisku(zajetosc: Mapping[str, ZajetoscPola]) -> dict[str, ZajetoscPola]:
    """Zajętość pól z WŁASNYM zaciskiem, kluczem jest zacisk; przy dwóch polach na jednym
    zacisku wygrywa pierwsze w kolejności `zajetosc_pol` (ta sama reguła co
    `pole_dla_zacisku`). Wołający, który pyta o wiele zacisków jednego modelu, liczy
    `zajetosc_pol` raz i czyta ten słownik."""
    wynik: dict[str, ZajetoscPola] = {}
    for stan in zajetosc.values():
        if stan.wlasny_zacisk and stan.punkt_przylaczenia:
            wynik.setdefault(stan.punkt_przylaczenia, stan)
    return wynik


def pole_dla_zacisku(enm: Mapping[str, Any], bus_ref: str | None) -> str | None:
    """Pole, którego WŁASNYM zaciskiem jest wskazana szyna (None, gdy żadne)."""
    if not bus_ref:
        return None
    stan = pola_wg_wlasnego_zacisku(zajetosc_pol(enm)).get(bus_ref)
    return stan.field_ref if stan is not None else None


def widok_pol_liniowych(enm: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Wiersze `line_fields` widoków logicznych — model odczytu dla frontu."""
    return [
        {
            "field_ref": z.field_ref,
            "station_ref": z.station_ref,
            "bay_role": z.bay_role,
            "attachment_bus_ref": z.punkt_przylaczenia,
            "occupied": z.zajete,
            "segment_refs": list(z.odcinki_fizyczne),
            "corridor_refs": list(z.korytarze),
        }
        for z in zajetosc_pol(enm).values()
    ]
