"""Wiersze wyników pól GPZ i bilansu GPZ dla wyniku rozpływu mocy (karta GPZ-PARYTET).

PO CO. Schemat GPZ pokazuje przy każdym polu rozdzielni pomiar P/Q/I/U, a w nagłówku stacji
bilans mocy i liczbę alarmów. Te wielkości muszą przyjść z BACKENDU — front nie przeszukuje
topologii (nie zgaduje, który odcinek wychodzi z którego pola) i nie sumuje mocy. Dlatego
wynik rozpływu niesie dwa dodatkowe rodzaje wierszy:

* ``Bay`` (po jednym na pole stacji typu GPZ) — wielkości ZACISKU POLA po stronie GPZ:
  napięcie szyny pola oraz moc czynna, bierna, prąd i obciążenie elementu, który pole
  zasila (odcinek odpływu albo transformator pola transformatorowego);
* ``Substation`` (po jednym na stację GPZ) — bilans: moc wtłaczana przez źródła stacji
  (zasilanie) i suma mocy odpływów, oraz liczba alarmów wynikowych.

SKĄD DANE (bez domysłu):

* odcinek odpływu pola liniowego — WYŁĄCZNIE z jedynego źródła prawdy o przyłączeniu
  odcinka do pola, ``enm.zajetosc_pol`` (odcinki przyłączone fizycznie albo pierwszy odcinek
  JEDYNEGO korytarza przydzielonego polu). Dwa odcinki na polu albo dwa korytarze = brak
  rozstrzygnięcia = brak wielkości toru (napięcie szyny zostaje);
* transformator pola transformatorowego — ``Bay.meta.transformer_ref`` albo jedyny
  transformator na liście ``Bay.equipment_refs``;
* strona GPZ elementu — koniec gałęzi, którego węzeł grafu jest punktem przyłączenia pola
  (ta sama funkcja identyfikatora węzła co budowa grafu biegu). Koniec „od" daje moc i prąd
  zacisku początkowego, koniec „do" — zacisku końcowego (oba policzone przez solver);
* granica bilansu — WĘZEŁ ELEKTRYCZNY stacji: szyny stacji (``enm.tor_pola.szyny_stacji``,
  jedno źródło przynależności szyny do stacji) scalone ZAMKNIĘTYMI łącznikami (semantyka
  „w ruchu" ``enm.topology.podziel_krawedzie``, scalanie jądrem
  ``network_model.core.topologia.scal_wezly`` — ta sama reguła co macierz admitancyjna).
  Przepływ przez zamknięty łącznik nie jest wielkością wyniku rozpływu (łącznik nie ma
  impedancji), więc granicę stanowią gałęzie i transformatory w ruchu z JEDNYM końcem w węźle
  elektrycznym stacji; element z oboma końcami w węźle (transformator stacji, odcinek szyny)
  jest wnętrzem stacji — jego straty są stratami transformatora i szyny w bilansie;
* zasilanie — wtrysk netto węzła z wiersza ``Source`` (ten sam wtrysk, który pokazuje
  etykieta źródła na schemacie) dla szyn węzła elektrycznego stacji, liczony RAZ na szynę:
  dwa źródła na jednej szynie nie podwajają wtrysku tego węzła. Znak: dodatni = pobór mocy
  z sieci nadrzędnej (źródło oddaje moc do stacji), ujemny = oddawanie mocy do sieci
  nadrzędnej (generacja w sieci SN przewyższa odbiór) — konwencja bilansu stacji „Grid";
* odpływy — moc zacisku KAŻDEGO elementu granicy po stronie węzła elektrycznego stacji
  (nie tylko elementów przypisanych do pól). Tożsamość bilansu: zasilanie − odpływy = straty
  wnętrza stacji (transformatory i szyny) w granicach tolerancji solvera.

Suma odpływów powstaje WYŁĄCZNIE, gdy jest kompletna: każdy element granicy ma wiersz wyniku
z mocą zacisku po stronie stacji, żaden element nie wychodzi poza szyny migawki, a każdy
odbiór na szynie węzła stacji jest ujęty w wtrysku netto wiersza ``Source`` tej szyny.
Stacja bez elementów granicy (brak odpływów) albo bilans niekompletny = JAWNY BRAK wielkości
(metryka nieobecna, ekran pisze „brak"), nigdy 0,0 — częściowa suma udawałaby pełny bilans.
Zasilanie powstaje wyłącznie, gdy każde źródło i generator na szynach węzła ma wiersz wyniku
z obiema mocami. Alarm wynikowy to przeciążenie
(flaga ``OVERLOADED`` wiersza gałęzi, obciążenie > 100 %) elementu zasilanego z pola GPZ
albo transformatora stacji GPZ — jedyna klasyfikacja przekroczenia, którą wynik rozpływu
niesie dziś jawnie.

Zero fizyki: wartości są przepisywane z wierszy wyniku (już policzonych przez solver i
interpretację kanoniczną); jedyne działanie to suma mocy i licznik flag.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from domain.result_contract_v1 import ZNACZNIK_PRZECIAZENIE
from enm.assembler import _graph_id_from_ref
from enm.pola import czy_pole_nn, pola_stacji, poziom_pol, punkt_przylaczenia_pola, stacje_gpz
from enm.topology import PodzialKrawedzi, podziel_krawedzie
from enm.tor_pola import szyny_stacji
from enm.zajetosc_pol import zajetosc_pol
from network_model.core.topologia import scal_wezly

#: Role pól, które zasilają odcinek terenowy (pole liniowe w szerokim sensie).
ROLE_POL_LINIOWYCH: frozenset[str] = frozenset({"IN", "OUT", "FEEDER", "OZE"})

#: Flaga wiersza gałęzi oznaczająca przeciążenie (``build_branch_results``) — kod z kontraktu
#: wyników, jedno źródło z wierszem gałęzi (karta GPZ-H5-APARATURA).
FLAGA_PRZECIAZENIA = ZNACZNIK_PRZECIAZENIE


def _napis(wartosc: object) -> str | None:
    return wartosc if isinstance(wartosc, str) and wartosc else None


def _liczba(wartosc: object) -> float | None:
    if isinstance(wartosc, bool) or not isinstance(wartosc, int | float):
        return None
    return float(wartosc)


def _slownik(wartosc: object) -> Mapping[str, Any]:
    return wartosc if isinstance(wartosc, Mapping) else {}


def _element_pola(
    pole: Mapping[str, Any],
    zajetosc: Mapping[str, Any],
    korytarze: Mapping[str, Mapping[str, Any]],
    transformatory: frozenset[str],
) -> str | None:
    """Ref elementu zasilanego z pola (odcinek odpływu albo transformator) — None, gdy model
    nie rozstrzyga go jednoznacznie."""
    rola = str(pole.get("bay_role") or "").upper()
    if rola == "TR":
        kandydaci = {
            ref
            for ref in [_napis(_slownik(pole.get("meta")).get("transformer_ref"))]
            + [_napis(r) for r in pole.get("equipment_refs") or []]
            if ref is not None and ref in transformatory
        }
        return next(iter(kandydaci)) if len(kandydaci) == 1 else None
    if rola not in ROLE_POL_LINIOWYCH:
        return None
    stan = zajetosc.get(str(pole.get("ref_id")))
    if stan is None:
        return None
    if len(stan.odcinki_fizyczne) == 1:
        return str(stan.odcinki_fizyczne[0])
    if not stan.odcinki_fizyczne and len(stan.korytarze) == 1:
        kolejnosc = korytarze.get(stan.korytarze[0], {}).get("ordered_segment_refs") or []
        return _napis(kolejnosc[0]) if kolejnosc else None
    return None


def _wielkosci_zacisku(
    wiersz_galezi: Mapping[str, Any], punkt_przylaczenia: str
) -> dict[str, float | None] | None:
    """P/Q/I zacisku gałęzi po stronie punktu przyłączenia pola (None, gdy żaden koniec
    gałęzi nie leży w tym węźle)."""
    wezel = _graph_id_from_ref(punkt_przylaczenia)
    if wiersz_galezi.get("from_bus") == wezel:
        return {
            "p_from_mw": _liczba(wiersz_galezi.get("p_mw")),
            "q_from_mvar": _liczba(wiersz_galezi.get("q_mvar")),
            "i_a": _liczba(wiersz_galezi.get("i_a")),
        }
    if wiersz_galezi.get("to_bus") == wezel:
        return {
            "p_from_mw": _liczba(wiersz_galezi.get("p_to_mw")),
            "q_from_mvar": _liczba(wiersz_galezi.get("q_to_mvar")),
            "i_a": _liczba(wiersz_galezi.get("i_do_a")),
        }
    return None


def _moc_zacisku_szyny(
    wiersz_galezi: Mapping[str, Any] | None, szyna: str
) -> tuple[float, float] | None:
    """P/Q zacisku gałęzi po stronie szyny ``szyna`` (None, gdy wiersza brak, żaden koniec
    nie leży w tej szynie albo moc zacisku nie jest liczbą)."""
    if wiersz_galezi is None:
        return None
    zacisk = _wielkosci_zacisku(wiersz_galezi, szyna)
    if zacisk is None or zacisk["p_from_mw"] is None or zacisk["q_from_mvar"] is None:
        return None
    return zacisk["p_from_mw"], zacisk["q_from_mvar"]


def bilans_wezla_stacji(
    snapshot: Mapping[str, Any],
    stacja: Mapping[str, Any],
    *,
    podzial: PodzialKrawedzi,
    galezie: Mapping[str, Mapping[str, Any]],
    wtrysk_zrodel: Mapping[str, Mapping[str, Any]],
    poziom: Any,
) -> dict[str, float]:
    """Bilans węzła elektrycznego stacji: ``p/q_supply`` i ``p/q_feeders`` — wyłącznie
    wielkości kompletne (opis granicy, znaku i kompletności w nagłówku modułu).

    Granicę i zasilanie wyznacza JEDEN zbiór szyn (węzeł elektryczny stacji), więc
    tożsamość zasilanie − odpływy = straty wnętrza nie zależy od dwóch niezależnych
    warunków przynależności."""
    szyny_migawki = set(podzial.szyny)
    wlasne = {s for s in szyny_stacji(snapshot, stacja, poziom) if s in szyny_migawki}
    if not wlasne:
        return {}
    reprezentant = scal_wezly(
        podzial.szyny,
        ((k.szyna_a, k.szyna_b) for k in podzial.w_ruchu if k.rodzaj == "lacznik"),
    )
    klasy = {reprezentant[s] for s in wlasne}
    wezel = frozenset(s for s in podzial.szyny if reprezentant[s] in klasy)

    bilans: dict[str, float] = {}

    wtrysk_wg_szyny: dict[str, tuple[float, float] | None] = {}
    for zrodlo in sorted(
        (
            z
            for kolekcja in ("sources", "generators")
            for z in snapshot.get(kolekcja) or []
            if isinstance(z, Mapping)
        ),
        key=lambda z: str(z.get("ref_id")),
    ):
        szyna_zrodla = _napis(zrodlo.get("bus_ref"))
        if szyna_zrodla is None or szyna_zrodla not in wezel:
            continue
        wynik_zrodla = wtrysk_zrodel.get(str(zrodlo.get("ref_id")))
        p = _liczba(wynik_zrodla.get("p_injected_mw")) if wynik_zrodla is not None else None
        q = _liczba(wynik_zrodla.get("q_injected_mvar")) if wynik_zrodla is not None else None
        if p is not None and q is not None:
            # Wtrysk węzła (netto) jest ten sam w każdym wierszu źródła tej szyny — raz.
            if wtrysk_wg_szyny.get(szyna_zrodla) is None:
                wtrysk_wg_szyny[szyna_zrodla] = (p, q)
        elif szyna_zrodla not in wtrysk_wg_szyny:
            wtrysk_wg_szyny[szyna_zrodla] = None
    if wtrysk_wg_szyny and all(w is not None for w in wtrysk_wg_szyny.values()):
        wtryski = [w for w in wtrysk_wg_szyny.values() if w is not None]
        bilans["p_supply_mw"] = sum(p for p, _ in wtryski)
        bilans["q_supply_mvar"] = sum(q for _, q in wtryski)

    # Odbiór na szynie węzła bez wiersza ``Source`` nie ma wiersza wyniku — bilans odpływów
    # nie domyka się bez niego (moc znamionowa odbioru ≠ moc w punkcie pracy).
    odbior_poza_wtryskiem = any(
        _napis(odbior.get("bus_ref")) in wezel
        and _napis(odbior.get("bus_ref")) not in wtrysk_wg_szyny
        for odbior in snapshot.get("loads") or []
        if isinstance(odbior, Mapping)
    )
    granica = [k for k in podzial.w_ruchu if (k.szyna_a in wezel) != (k.szyna_b in wezel)]
    pominiety_na_granicy = any(
        _napis(element.get(koniec)) in wezel
        for kolekcja, konce in (
            ("branches", ("from_bus_ref", "to_bus_ref")),
            ("transformers", ("hv_bus_ref", "lv_bus_ref")),
        )
        for element in snapshot.get(kolekcja) or []
        if isinstance(element, Mapping)
        and str(element.get("ref_id")) in set(podzial.krawedzie_pominiete)
        for koniec in konce
    )
    if not granica or odbior_poza_wtryskiem or pominiety_na_granicy:
        return bilans
    suma_p = 0.0
    suma_q = 0.0
    for krawedz in sorted(granica, key=lambda k: k.ref_id):
        if krawedz.rodzaj == "lacznik":
            # Zamknięty łącznik scala szyny — z definicji węzła nie leży na granicy.
            return bilans
        szyna = krawedz.szyna_a if krawedz.szyna_a in wezel else krawedz.szyna_b
        moc = _moc_zacisku_szyny(galezie.get(krawedz.ref_id), szyna)
        if moc is None:
            return bilans
        suma_p += moc[0]
        suma_q += moc[1]
    bilans["p_feeders_mw"] = suma_p
    bilans["q_feeders_mvar"] = suma_q
    return bilans


def wiersze_wynikow_gpz(
    snapshot: Mapping[str, Any],
    element_results: Sequence[Mapping[str, Any]],
    *,
    wspolne: Mapping[str, Any],
) -> list[dict[str, Any]]:
    """Wiersze ``Bay`` i ``Substation`` stacji GPZ dla wyniku rozpływu (posortowane po refie).

    ``element_results`` — gotowe wiersze ``Bus``/``Branch``/``Source`` tego biegu;
    ``wspolne`` — pola dowodowe dopisywane do każdego wiersza (``proof_ref`` itd.)."""
    gpz = stacje_gpz(snapshot)
    if not gpz:
        return []
    napiecie_szyny: dict[str, float] = {}
    galezie: dict[str, Mapping[str, Any]] = {}
    wtrysk_zrodel: dict[str, Mapping[str, Any]] = {}
    for wiersz in element_results:
        ref = _napis(wiersz.get("element_ref"))
        wartosci_wyniku = _slownik(wiersz.get("values"))
        if ref is None:
            continue
        rodzaj = wiersz.get("element_type")
        if rodzaj == "Bus":
            u_kv = _liczba(wartosci_wyniku.get("u_kv"))
            if u_kv is not None:
                napiecie_szyny[ref] = u_kv
        elif rodzaj == "Branch":
            galezie[ref] = wartosci_wyniku
        elif rodzaj == "Source":
            wtrysk_zrodel[ref] = wartosci_wyniku

    zajetosc = zajetosc_pol(snapshot)
    korytarze = {
        str(k["ref_id"]): k
        for k in snapshot.get("corridors") or []
        if isinstance(k, Mapping) and _napis(k.get("ref_id"))
    }
    transformatory = frozenset(
        str(t["ref_id"])
        for t in snapshot.get("transformers") or []
        if isinstance(t, Mapping) and _napis(t.get("ref_id"))
    )
    poziom = poziom_pol(snapshot)
    podzial = podziel_krawedzie(snapshot)
    stacje = {
        str(s["ref_id"]): s
        for s in snapshot.get("substations") or []
        if isinstance(s, Mapping) and str(s.get("ref_id")) in gpz
    }

    wiersze: list[dict[str, Any]] = []
    for stacja_ref in sorted(stacje):
        stacja = stacje[stacja_ref]
        alarmy = 0
        for pole in pola_stacji(snapshot, stacja_ref):
            if not isinstance(pole, Mapping) or czy_pole_nn(snapshot, pole, poziom):
                continue
            pole_ref = str(pole.get("ref_id"))
            punkt = punkt_przylaczenia_pola(pole)
            wartosci: dict[str, Any] = {}
            szyna = _napis(pole.get("bus_ref"))
            if szyna is not None and szyna in napiecie_szyny:
                wartosci["u_kv"] = napiecie_szyny[szyna]
            element = _element_pola(pole, zajetosc, korytarze, transformatory)
            wiersz_galezi = galezie.get(element) if element is not None else None
            zacisk = (
                _wielkosci_zacisku(wiersz_galezi, punkt)
                if wiersz_galezi is not None and punkt is not None
                else None
            )
            if zacisk is not None and wiersz_galezi is not None:
                wartosci["feeder_ref"] = element
                wartosci.update({k: v for k, v in zacisk.items() if v is not None})
                obciazenie = _liczba(wiersz_galezi.get("loading_pct"))
                if obciazenie is not None:
                    wartosci["loading_pct"] = obciazenie
                if FLAGA_PRZECIAZENIA in (wiersz_galezi.get("flags") or []):
                    alarmy += 1
            if any(_liczba(v) is not None for v in wartosci.values()):
                wiersze.append(
                    {
                        "element_ref": pole_ref,
                        "element_type": "Bay",
                        "solver_ref": _graph_id_from_ref(punkt) if punkt else None,
                        "values": dict(sorted(wartosci.items())),
                        **wspolne,
                    }
                )

        # Transformatory stacji bez pola transformatorowego (wieża WN/SN) — ich przeciążenie
        # jest tak samo alarmem stacji jak przeciążenie transformatora z polem.
        refy_tr_pol = {
            str(w["values"].get("feeder_ref"))
            for w in wiersze
            if w["element_type"] == "Bay" and w["values"].get("feeder_ref") in transformatory
        }
        for tr_ref in sorted(
            str(r) for r in stacja.get("transformer_refs") or [] if isinstance(r, str)
        ):
            if tr_ref in refy_tr_pol:
                continue
            if FLAGA_PRZECIAZENIA in (galezie.get(tr_ref, {}).get("flags") or []):
                alarmy += 1

        bilans: dict[str, Any] = {
            "alarm_count": alarmy,
            **bilans_wezla_stacji(
                snapshot,
                stacja,
                podzial=podzial,
                galezie=galezie,
                wtrysk_zrodel=wtrysk_zrodel,
                poziom=poziom,
            ),
        }
        wiersze.append(
            {
                "element_ref": stacja_ref,
                "element_type": "Substation",
                "solver_ref": None,
                "values": dict(sorted(bilans.items())),
                **wspolne,
            }
        )
    wiersze.sort(key=lambda w: str(w["element_ref"]))
    return wiersze
