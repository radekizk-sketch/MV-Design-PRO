"""Adapter konwencji znaku mocy biernej (rozstrzygnięcie V12K-040, opcja B).

Warstwa APPLICATION — CZYSTE przekształcenie znaku, ZERO fizyki, ZERO heurystyk.
Nie liczy rozpływu, nie modyfikuje solvera ani ENM (``PowerFlowResult`` pozostaje
FROZEN). Tłumaczy wielkości mocy biernej z konwencji ``PowerFlowResult`` na
JEDNOZNACZNĄ konwencję aplikacyjną, by warstwy wyżej (dobór kompensacji, cosφ)
liczyły na spójnych znakach.

KANONICZNA KONWENCJA APLIKACYJNA (obowiązująca po adapterze)
-----------------------------------------------------------
- ``P > 0`` — pobór mocy czynnej w punkcie,
- ``P < 0`` — oddawanie (generacja / eksport) mocy czynnej,
- ``Q > 0`` — pobór mocy biernej INDUKCYJNEJ,
- ``Q < 0`` — moc bierna POJEMNOŚCIOWA (kompensacja / nadwyżka pojemnościowa).

KONWENCJA SOLVERA (``PowerFlowResult`` — plik:linia)
----------------------------------------------------
``branch_results`` niesie na obu końcach gałęzi pola ``p_from_mw``/``q_from_mvar``
oraz ``p_to_mw``/``q_to_mvar`` (``network_model/solvers/power_flow_result.py:60-91``),
przy czym straty gałęzi = ``s_from + s_to`` (``power_flow_result.py:237-239``), więc
``q_from_mvar + q_to_mvar`` = STRATY bierne gałęzi. Każdy koniec jest INJEKCJĄ
węzła DO gałęzi: węzeł zasilający ma przepływ dodatni, węzeł pobierający — ujemny.

Konwencję tę przywróciła naprawa **F9.8** (commit ``6508c12f``, 2026-07-15):
wcześniej canonical PF pipeline niósł podwójną negację (obciążenia wchodziły do
solvera jako generacja), przez co znaki końców gałęzi były ODWRÓCONE, a napięcie
za obciążeniem rosło. Po F9.8 (pomiar K3, sieć minimalna slack → linia 5 km →
odbiór 1,0+j0,5): ``v_load=0,989299`` (<1 — fizyczny spadek), ``p_to=−1,000000``,
``q_to=−0,500000``, ``slack_q=+0,509650``.

ODWZOROWANIE NA KONWENCJĘ KANONICZNĄ — NEGACJA końca incydentnego
-----------------------------------------------------------------
Przepływ odczytany na KOŃCU INCYDENTNYM z punktem to injekcja punktu DO gałęzi,
więc moc NETTO pobierana przez punkt w konwencji kanonicznej to jej NEGACJA:

    - punkt = koniec ``to`` gałęzi  →  ``(−p_to_mw,  −q_to_mvar)``
    - punkt = koniec ``from`` gałęzi →  ``(−p_from_mw, −q_from_mvar)``

DOWÓD (pomiar K3 po F9.8, ``tests/application/analyses/
test_diagnostyka_znaku_shunt.py`` + ``test_dowod_v12k040.py``):
- odbiór indukcyjny 1,0 + j0,5 → na końcu przy odbiorze ``q_to = −0,500000``,
  ``p_to = −1,000000`` → po negacji ``P = +1,0`` (pobór), ``Q = +0,5``
  (indukcyjny) — dokładnie moc odbioru;
- przepływ ODWROTNY (generacja lokalna 2,0 MW > pobór 1,0 MW): ``p_to = +1,0``
  → po negacji ``P = −1,0`` (punkt eksportuje moc czynną) — znak spójny.

NOTA HISTORYCZNA — „anomalia znaku shuntu" (usunięta przez F9.8)
----------------------------------------------------------------
Przed F9.8 dopisanie kondensatora do odbioru indukcyjnego ZWIĘKSZAŁO ``|q_to|``
gałęzi zasilającej (objaw odwróconego znaku pipeline — pierwotna przyczyna
eskalacji V12K-040). Po F9.8 anomalia ZNIKŁA: przepływ bierny gałęzi MALEJE po
kompensacji (pomiar: ``q_to`` 0,500000 → 0,006904 przy baterii 0,5 Mvar), bo
solver księguje shunt jako ``rated·V²`` odejmowane od zapotrzebowania punktu.
Kompensację w DOBORZE nadal księguje się jako znamionową moc bierną baterii
(``Q_cap_eff = rated·V²``, pojemnościowa → ``Q < 0`` kanonicznie) ODEJMOWANĄ od
zapotrzebowania biernego punktu (``q_netto_po_kompensacji``) — to wielkość
STEROWNIKA doboru (Wymóg 2 właściciela: rozdział cosφ przekroju vs punktu),
a nie korekta wyniku solvera.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any


def _wymagana_moc_galezi(br: Mapping[str, Any], klucz: str) -> float:
    """Wartość mocy gałęzi z rekordu ``branch_results`` (``result_v1``).

    ``PowerFlowBranchResult`` (``network_model/solvers/power_flow_result.py``)
    ma ``p_from_mw``/``q_from_mvar``/``p_to_mw``/``q_to_mvar`` jako pola
    WYMAGANE (bez wartości domyślnej, bez ``| None``) — dla poprawnego wyniku
    solvera te klucze zawsze niosą liczbę. Brak klucza albo ``None`` oznacza
    uszkodzony/niekompletny ``branch_results`` (FAB-E, E1: brak wyniku ≠ zero) —
    adapter konwencji znaku ma podnieść wyjątek, a nie fabrykować zerowy wkład
    gałęzi do mocy punktu (co zaniżyłoby ``p_mw``/``q_mvar`` bez śladu).
    """
    wartosc = br.get(klucz)
    if wartosc is None:
        raise ValueError(
            f"Brak pola {klucz!r} w rekordzie branch_results (branch_id="
            f"{br.get('branch_id')!r}) — wynik solvera niekompletny, adapter "
            "konwencji mocy nie może przeliczyć znaku punktu bez tej wartości."
        )
    return float(wartosc)


def q_bierna_kanoniczna(q_koniec_incydentny_mvar: float) -> float:
    """Moc bierna gałęzi na końcu incydentnym z punktem → znak kanoniczny.

    Odwzorowanie jest NEGACJĄ: przepływ na końcu przy punkcie to injekcja punktu
    DO gałęzi (konwencja solvera po F9.8), więc moc bierna NETTO pobierana przez
    punkt = ``−q_koniec_incydentny`` (``Q > 0`` indukcyjny pobór, ``Q < 0``
    pojemnościowy). Funkcja istnieje dla jednoznacznego, audytowalnego punktu
    styku z konwencją solvera (WHITE BOX) — nie liczy fizyki.
    """
    return -float(q_koniec_incydentny_mvar)


def moc_kanoniczna_punktu(
    *,
    branch_results: Sequence[Mapping[str, Any]],
    endpoints: Mapping[str, tuple[str, str]],
    point_node: str,
) -> dict[str, Any]:
    """Wypadkowa moc NETTO punktu z przepływów gałęzi incydentnych (kanoniczna).

    Sumuje ZANEGOWANY przepływ na końcu incydentnym z ``point_node`` po wszystkich
    gałęziach dotykających punktu (przy jednej gałęzi zasilającej = negacja
    przepływu tej gałęzi). Wynik jest w konwencji kanonicznej: ``p_mw > 0`` pobór
    czynnej, ``q_mvar > 0`` pobór indukcyjnej, ``q_mvar < 0`` pojemnościowa.

    Args:
        branch_results: lista rekordów ``branch_results`` z ``result_v1``.
        endpoints: mapa ``branch_id → (węzeł_from, węzeł_to)`` w przestrzeni ID
            grafu solvera (odtworzona przez wołającego z tego samego snapshotu).
        point_node: ID węzła punktu w przestrzeni grafu solvera.

    Returns:
        Słownik WHITE BOX: ``p_mw``, ``q_mvar`` (kanoniczne), ``incydentne``
        (liczba gałęzi) oraz ``slad`` (wkład każdej gałęzi: koniec, P, Q kanoniczne).
        ``incydentne == 0`` → punkt bez gałęzi w topologii (``p_mw``/``q_mvar`` = 0).
    """
    p_sum = 0.0
    q_sum = 0.0
    incydentne = 0
    slad: list[dict[str, Any]] = []
    for br in branch_results:
        ends = endpoints.get(str(br.get("branch_id")))
        if ends is None:
            continue
        from_node, to_node = ends
        if to_node == point_node:
            koniec = "to"
            p = -_wymagana_moc_galezi(br, "p_to_mw")
            q = q_bierna_kanoniczna(_wymagana_moc_galezi(br, "q_to_mvar"))
        elif from_node == point_node:
            koniec = "from"
            p = -_wymagana_moc_galezi(br, "p_from_mw")
            q = q_bierna_kanoniczna(_wymagana_moc_galezi(br, "q_from_mvar"))
        else:
            continue
        p_sum += p
        q_sum += q
        incydentne += 1
        slad.append(
            {
                "branch_id": str(br.get("branch_id")),
                "koniec": koniec,
                "p_mw": p,
                "q_mvar_kanoniczne": q,
            }
        )
    return {"p_mw": p_sum, "q_mvar": q_sum, "incydentne": incydentne, "slad": slad}


def q_netto_po_kompensacji(
    q_zapotrzebowania_mvar: float,
    q_kompensacji_mvar: float,
) -> float:
    """Moc bierna NETTO punktu po uwzględnieniu baterii kondensatorów (kanoniczna).

    Bateria jest źródłem mocy biernej POJEMNOŚCIOWEJ (kanonicznie ``Q < 0``), więc
    jej znamionowa moc bierna ``q_kompensacji_mvar`` (podawana jako wartość dodatnia
    = wielkość pojemnościowa) jest ODEJMOWANA od zapotrzebowania biernego punktu:

        Q_netto = Q_zapotrzebowania − Q_kompensacji

    Kompensacja odbioru indukcyjnego (``Q_zapotrzebowania > 0``) OBNIŻA ``|Q_netto|``
    aż do zera (pełna kompensacja), a dalej przechodzi w zakres pojemnościowy
    (``Q_netto < 0`` — przekompensowanie). To księgowanie znamionowej mocy baterii
    (wielkość STEROWNIKA doboru — Wymóg 2 właściciela) i NIE fizyka rozpływu —
    ``q_kompensacji_mvar`` to dana znamionowa z katalogu.
    """
    return float(q_zapotrzebowania_mvar) - float(q_kompensacji_mvar)
