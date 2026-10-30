"""W5-C: jedna prawda stanu łączeniowego — migracja zastanego zapisu punktu podziału.

Przed kartą punkt normalnie otwarty (NOP) żył w DWÓCH kopiach obok stanu łącznika:
``Corridor.no_point_ref`` (ref łącznika zapisany przy magistrali przez dawne
``set_normal_open_point``; przy wielu magistralach — w PIERWSZEJ z brzegu) oraz
``LineRun.nop_station_ref`` (kopia tej wartości z chwili utworzenia ciągu, zapisana pod
nazwą „stacji" — nigdy aktualizowana i nigdy nieczytana przez backend). Jedynym
źródłem pozycji normalnej jest teraz ``SwitchBranch.normal_state``; punkty podziału
wyprowadza akcesor ``enm.topology.punkty_podzialu``.

Moduł jest LIŚCIEM (bez importu ``enm.models``) — woła go walidator ``before``
modelu (``EnergyNetworkModel._migracje_zapisu_zastanego_przy_wczytaniu``), więc
migracja obejmuje KAŻDĄ drogę wczytania (magazyn, rewizje, migawki biegów, import
archiwum, operacje domenowe). Magazyn (``enm/store.py``) liczy raport z tej samej
surowej migawki i zapisuje go w dzienniku zmian — utrata nigdy nie jest cicha.

Reguły migracji (bez domysłu):

* ``no_point_ref`` wskazuje łącznik ze stanem normalnym (``switch``/``breaker``/
  ``bus_coupler``/``disconnector``) bez zadeklarowanej pozycji normalnej →
  ``normal_state="open"`` (przeniesione);
* wskazany łącznik ma już ``normal_state="open"`` → sama kopia znika (usunięte);
* wskazany łącznik ma ``normal_state="closed"`` → pozycja z łącznika wygrywa, kopia
  magistrali jest sprzeczna (UTRACONE, nazwane);
* wskazany element nie istnieje albo nie jest łącznikiem ze stanem normalnym
  (bezpiecznik, kabel) → UTRACONE, nazwane;
* ``no_point_ref`` puste (``null``) i ``nop_station_ref`` puste → klucz znika bez wpisu
  (to postać każdej magistrali zapisanej bez punktu podziału);
* ``BranchPointSN.switch_state`` (trzecia kopia: „stan normalny" punktu rozgałęzienia, zwykle
  wpisany DOMYŚLNIE jako ``"closed"`` przez dawne uzupełnianie katalogowe, nigdy nie
  aktualizowany po zmianie łącznika) → klucz znika. Wartość NIE jest przenoszona do
  ``normal_state`` łączników portów (byłaby domysłem podniesionym do deklaracji); zgodna
  z położeniem łączników portów → „usunięta kopia", sprzeczna → UTRACONE, nazwane;
* ``status`` łącznika NIE jest zmieniany — to bieżące położenie, czytane przez fizykę.
  Zapis zastany z ``status="open"`` bez wskazania magistrali NIE staje się punktem
  podziału: otwarcie łącznika operacją ruchową nie jest deklaracją pozycji normalnej.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, get_args

from .slownik_komunikatow import nazwa_rodzaju_galezi, opis_obiektu

#: Rodzaje gałęzi łącznika ENM — typ pola `SwitchBranch.type` (`enm.models`) i lista
#: niosąca POZYCJĘ NORMALNĄ. JEDYNA definicja w backendzie: model bierze stąd typ pola,
#: operacje łączników, topologia i walidator — listę (`enm.models` re-eksportuje ją obok
#: `RODZAJE_GALEZI_APARATU`). Front dostaje ją przez wyrocznię harnessu
#: `rodzaje_wielkosci_zwarciowych_aparatury.json` (`rodzaje_galezi`, test parytetu
#: `types/rodzajeGalezi.ts`). Bezpiecznik (`FuseBranch`) jest aparatem dla topologii (ma `status`),
#: ale nie jest punktem podziału sieci i nie ma pozycji normalnej z projektu.
RodzajGaleziLacznika = Literal["switch", "breaker", "bus_coupler", "disconnector"]
RODZAJE_GALEZI_LACZNIKA: tuple[str, ...] = get_args(RodzajGaleziLacznika)


@dataclass(frozen=True)
class RaportMigracjiPunktowPodzialu:
    """Co migracja punktów podziału przeniosła, usunęła i utraciła — z nazwą elementu.

    Wpisy trafiają do dziennika zmian (``opis_pl`` rewizji, widoczny w historii modelu),
    więc element opisuje jego NAZWA z migawki (``opis_obiektu``), nigdy identyfikator."""

    przeniesione: tuple[str, ...] = ()
    usuniete: tuple[str, ...] = ()
    utracone: tuple[str, ...] = ()

    @property
    def zmieniono(self) -> bool:
        return bool(self.przeniesione or self.usuniete or self.utracone)

    def opis_pl(self) -> str:
        czesci: list[str] = []
        if self.przeniesione:
            czesci.append("przeniesione: " + "; ".join(self.przeniesione))
        if self.usuniete:
            czesci.append("usunięte kopie: " + "; ".join(self.usuniete))
        if self.utracone:
            czesci.append("UTRACONE (sprzeczne lub bez łącznika): " + "; ".join(self.utracone))
        return "Migracja punktów podziału do stanu normalnego łącznika — " + " | ".join(czesci)


#: Położenie łącznika w opisie dziennika (wartość ``status`` / ``normal_state``).
_POZYCJA_PL: dict[str, str] = {"open": "otwarty", "closed": "zamknięty"}


def _lista(data: dict[str, Any], klucz: str) -> list[Any]:
    wartosc = data.get(klucz)
    return wartosc if isinstance(wartosc, list) else []


def migruj_punkty_podzialu_slownika(
    data: dict[str, Any],
) -> tuple[dict[str, Any], RaportMigracjiPunktowPodzialu]:
    """Migracja surowej migawki ENM (słownik) — punkt podziału w ``normal_state``.

    Zwraca (migawka, raport). Bez skasowanych kluczy → TEN SAM obiekt i pusty raport
    (idempotencja: druga migracja niczego nie robi). Migawka wołającego nie jest
    modyfikowana — zmienione kolekcje i rekordy są kopiami.
    """
    korytarze = _lista(data, "corridors")
    ciagi = _lista(data, "line_runs")
    punkty = _lista(data, "branch_points")
    ma_korytarz = any(isinstance(k, dict) and "no_point_ref" in k for k in korytarze)
    ma_ciag = any(isinstance(c, dict) and "nop_station_ref" in c for c in ciagi)
    ma_punkt = any(isinstance(p, dict) and "switch_state" in p for p in punkty)
    if not ma_korytarz and not ma_ciag and not ma_punkt:
        return data, RaportMigracjiPunktowPodzialu()

    przeniesione: list[str] = []
    usuniete: list[str] = []
    utracone: list[str] = []
    galezie = [dict(g) if isinstance(g, dict) else g for g in _lista(data, "branches")]
    indeks = {
        g["ref_id"]: g for g in galezie if isinstance(g, dict) and isinstance(g.get("ref_id"), str)
    }
    zmienione_galezie = False
    stacje = {
        s["ref_id"]: s
        for s in _lista(data, "substations")
        if isinstance(s, dict) and isinstance(s.get("ref_id"), str)
    }

    nowe_korytarze: list[Any] = []
    for korytarz in korytarze:
        if not isinstance(korytarz, dict) or "no_point_ref" not in korytarz:
            nowe_korytarze.append(korytarz)
            continue
        kopia = {k: v for k, v in korytarz.items() if k != "no_point_ref"}
        nowe_korytarze.append(kopia)
        punkt = korytarz.get("no_point_ref")
        if not isinstance(punkt, str) or not punkt:
            continue
        nazwa = opis_obiektu(korytarz, "magistrala")
        galaz = indeks.get(punkt)
        if galaz is None:
            utracone.append(f"{nazwa}: wskazany łącznik punktu podziału nie istnieje w modelu")
            continue
        typ = galaz.get("type")
        if typ not in RODZAJE_GALEZI_LACZNIKA:
            utracone.append(
                f"{nazwa}: wskazany punkt podziału ({opis_obiektu(galaz, nazwa_rodzaju_galezi(typ))}) "
                "nie jest łącznikiem z pozycją normalną"
            )
            continue
        lacznik = opis_obiektu(galaz, nazwa_rodzaju_galezi(typ))
        stan = galaz.get("normal_state")
        if stan is None:
            galaz["normal_state"] = "open"
            zmienione_galezie = True
            przeniesione.append(f"{nazwa}: punkt podziału → pozycja normalna otwarta ({lacznik})")
        elif stan == "open":
            usuniete.append(f"{nazwa}: kopia punktu podziału ({lacznik} już normalnie otwarty)")
        else:
            utracone.append(
                f"{nazwa}: wskazywała {lacznik} jako punkt podziału, a łącznik ma pozycję "
                f"normalną „{_POZYCJA_PL.get(str(stan), str(stan))}” — obowiązuje pozycja łącznika"
            )

    nowe_ciagi: list[Any] = []
    for ciag in ciagi:
        if not isinstance(ciag, dict) or "nop_station_ref" not in ciag:
            nowe_ciagi.append(ciag)
            continue
        wartosc = ciag.get("nop_station_ref")
        if wartosc is not None:
            stacja = stacje.get(wartosc) if isinstance(wartosc, str) else None
            wskazana = (
                opis_obiektu(stacja, "stacja") if stacja is not None else "stacja spoza modelu"
            )
            usuniete.append(
                f"{opis_obiektu(ciag, 'ciąg liniowy')}: martwa kopia stacji punktu podziału "
                f"({wskazana})"
            )
        nowe_ciagi.append({k: v for k, v in ciag.items() if k != "nop_station_ref"})

    nowe_punkty: list[Any] = []
    for punkt_rozgalezienia in punkty:
        if not isinstance(punkt_rozgalezienia, dict) or "switch_state" not in punkt_rozgalezienia:
            nowe_punkty.append(punkt_rozgalezienia)
            continue
        nowe_punkty.append({k: v for k, v in punkt_rozgalezienia.items() if k != "switch_state"})
        stan_punktu = punkt_rozgalezienia.get("switch_state")
        if stan_punktu is None:
            continue
        ref_punktu = punkt_rozgalezienia.get("ref_id")
        polozenia = sorted(
            {
                str(g.get("status") or "closed")
                for g in galezie
                if isinstance(g, dict)
                and isinstance(g.get("meta"), dict)
                and g["meta"].get("branch_point_ref") == ref_punktu
            }
        )
        nazwa = opis_obiektu(punkt_rozgalezienia, "punkt rozgałęzienia")
        kopia_pl = _POZYCJA_PL.get(str(stan_punktu), str(stan_punktu))
        if polozenia and polozenia != [stan_punktu]:
            utracone.append(
                f"{nazwa}: kopia stanu łącznika „{kopia_pl}” sprzeczna z położeniem łączników "
                f"portów ({', '.join(_POZYCJA_PL.get(p, p) for p in polozenia)}) — obowiązuje "
                "położenie łączników"
            )
        else:
            usuniete.append(f"{nazwa}: kopia stanu łącznika „{kopia_pl}”")

    wynik = dict(data)
    if ma_punkt:
        wynik["branch_points"] = nowe_punkty
    if ma_korytarz:
        wynik["corridors"] = nowe_korytarze
    if ma_ciag:
        wynik["line_runs"] = nowe_ciagi
    if zmienione_galezie:
        wynik["branches"] = galezie
    raport = RaportMigracjiPunktowPodzialu(
        przeniesione=tuple(przeniesione),
        usuniete=tuple(usuniete),
        utracone=tuple(utracone),
    )
    return wynik, raport


def raport_migracji_punktow_podzialu(data: dict[str, Any]) -> RaportMigracjiPunktowPodzialu:
    """Sam raport (bez migawki) — dla magazynu, który zapisuje go w dzienniku zmian."""
    return migruj_punkty_podzialu_slownika(data)[1]
