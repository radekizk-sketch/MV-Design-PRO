"""Adapter konwencji znaku mocy biernej (rozstrzygnięcie V12K-027, opcja B).

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
``q_from_mvar + q_to_mvar`` = STRATY bierne gałęzi.

ODWZOROWANIE NA KONWENCJĘ KANONICZNĄ — TOŻSAMOŚĆ (bez odwracania znaku)
----------------------------------------------------------------------
Przepływ odczytany na KOŃCU INCYDENTNYM z punktem jest już wprost mocą NETTO
pobieraną przez ten punkt w konwencji kanonicznej:

    - punkt = koniec ``to`` gałęzi  →  ``(p_to_mw,  q_to_mvar)``
    - punkt = koniec ``from`` gałęzi →  ``(p_from_mw, q_from_mvar)``

DOWÓD (twarda prawda liczbowa K1, ``tests/application/analyses/
test_diagnostyka_znaku_shunt.py``):
- ``test_znaki_przeplywu_galezi_bez_i_z_shuntem`` (:222-244): odbiór indukcyjny
  1,0 + j0,5 MVA → na końcu przy odbiorze ``q_to = +0,500000`` (== moc bierna
  odbioru), ``p_to ≈ +1,0`` → ``P > 0`` pobór, ``Q > 0`` indukcyjny. Zgodnie z
  bilansem węzła ``q_to = -q_injected`` (pomiar), więc przepływ końca incydentnego
  jest NETTO zapotrzebowaniem punktu. Przy przepływie ODWROTNYM (generacja lokalna
  > pobór) znak zmienia się spójnie: ``p_to`` staje się ujemne (punkt eksportuje
  moc czynną) — patrz scenariusz OZE/BESS w testach kontraktowych K2.

ANOMALIA ZNAKU SHUNTU (dlaczego kompensacji NIE czyta się z przepływu gałęzi)
----------------------------------------------------------------------------
``ShuntCapacitor`` (+jB) księguje się w przepływie gałęzi ze ZNAKIEM PRZECIWNYM
niż odbiór pojemnościowy tej samej wielkości (K1
``test_shunt_przeciwny_znakowo_do_odbioru_wyprzedzajacego`` :203-214). Skutek
(pomiar, K1 :236-241): dopisanie kondensatora do odbioru INDUKCYJNEGO ZWIĘKSZA
``q_to`` (``q_to = Q_odb + B·V²``) zamiast je zmniejszać. Dlatego mocy biernej
kompensacji NIE wolno odczytywać z przepływu gałęzi po wstawieniu shuntu do
modelu; kompensację uwzględnia się jako znamionową moc bierną baterii
(pojemnościowa → ``Q < 0`` kanonicznie), ODEJMOWANĄ od zapotrzebowania biernego
punktu (``q_netto_po_kompensacji``). To nie korekta wyniku solvera, lecz
poprawne KSIĘGOWANIE elementu kompensującego w konwencji kanonicznej.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any


def q_bierna_kanoniczna(q_koniec_incydentny_mvar: float) -> float:
    """Moc bierna gałęzi na końcu incydentnym z punktem → znak kanoniczny.

    Odwzorowanie jest TOŻSAMOŚCIĄ: przepływ na końcu przy punkcie jest już mocą
    bierną NETTO pobieraną przez punkt (``Q > 0`` indukcyjny pobór, ``Q < 0``
    pojemnościowy). Funkcja istnieje dla jednoznacznego, audytowalnego punktu
    styku z konwencją solvera (WHITE BOX) — nie liczy fizyki.
    """
    return float(q_koniec_incydentny_mvar)


def moc_kanoniczna_punktu(
    *,
    branch_results: Sequence[Mapping[str, Any]],
    endpoints: Mapping[str, tuple[str, str]],
    point_node: str,
) -> dict[str, Any]:
    """Wypadkowa moc NETTO punktu z przepływów gałęzi incydentnych (kanoniczna).

    Sumuje przepływ na końcu incydentnym z ``point_node`` po wszystkich gałęziach
    dotykających punktu (przy jednej gałęzi zasilającej = przepływ tej gałęzi).
    Wynik jest w konwencji kanonicznej: ``p_mw > 0`` pobór czynnej, ``q_mvar > 0``
    pobór indukcyjnej, ``q_mvar < 0`` pojemnościowa.

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
            p = float(br.get("p_to_mw") or 0.0)
            q = q_bierna_kanoniczna(float(br.get("q_to_mvar") or 0.0))
        elif from_node == point_node:
            koniec = "from"
            p = float(br.get("p_from_mw") or 0.0)
            q = q_bierna_kanoniczna(float(br.get("q_from_mvar") or 0.0))
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
    (``Q_netto < 0`` — przekompensowanie). To księgowanie znamionowej mocy baterii,
    a NIE odczyt z przepływu gałęzi (patrz „ANOMALIA ZNAKU SHUNTU" w docstringu
    modułu) i NIE fizyka rozpływu — ``q_kompensacji_mvar`` to dana znamionowa z
    katalogu.
    """
    return float(q_zapotrzebowania_mvar) - float(q_kompensacji_mvar)
