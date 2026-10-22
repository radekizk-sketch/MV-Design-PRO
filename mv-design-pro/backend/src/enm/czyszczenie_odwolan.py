"""Odwołania do elementów usuniętych z modelu ENM — jedna funkcja dla każdej drogi kasowania.

Karta GPZ-H5 (reguła KLASA NIE INSTANCJA): model miał DWIE drogi usuwania elementów —
operację domenową `delete_element` (`enm/domain_operations.py`) i operacje topologiczne
`/enm/ops` (`enm/topology_ops.py`: `delete_node`, `delete_branch`, `delete_device`). Każda
sprzątała inaczej: `delete_element` kasował CAŁĄ stację po usunięciu jednego jej
transformatora, a `/enm/ops` nie sprzątał niczego (stacja wskazywała usunięty
transformator, sekcja GPZ — usuniętą szynę, źródło toru i łącznik szyn, pole — usunięty
aparat). Obie drogi wołają teraz `oczysc_odwolania_po_usunieciu`.

Zasada: stacja jest KONTENEREM (bez fizyki) — usunięcie jej transformatora, szyny sekcji,
źródła toru zasilania albo łącznika szyn nie usuwa stacji ani jej struktury, tylko
odwołania do usuniętego. Stacja znika wyłącznie wtedy, gdy znikły WSZYSTKIE jej szyny;
pole znika z szyną, na której stoi, i z właścicielem (stacją, punktem rozgałęzienia).
"""

from __future__ import annotations

from typing import Any

from .pola import pola, usun_pole, zmien_pole


def oczysc_odwolania_po_usunieciu(
    enm: dict[str, Any],
    usuniete: set[str],
    usuniete_szyny: set[str],
    usuniete_galezie: set[str],
) -> set[str]:
    """Wyczyść w `enm` (MUTUJE w miejscu) odwołania do elementów `usuniete`.

    `usuniete_szyny`/`usuniete_galezie` — podzbiory `usuniete` będące szynami
    i gałęziami (rozróżnienie zna wołający, który usuwał). Zwraca identyfikatory usunięte
    DODATKOWO (pola na usuniętych szynach, stacje bez szyn, pola bez właściciela, punkty
    rozgałęzienia usuniętych odcinków) — wołający dołącza je do listy zdarzeń."""
    usuniete = set(usuniete)
    przed = set(usuniete)

    # Korytarze: usunięta gałąź wypada z kolejności odcinków.
    if usuniete_galezie:
        for corridor in enm.get("corridors", []):
            ordered = corridor.get("ordered_segment_refs")
            if isinstance(ordered, list):
                corridor["ordered_segment_refs"] = [
                    seg for seg in ordered if seg not in usuniete_galezie
                ]

    # Pola, którym zniknęła szyna albo element: pole na skasowanej szynie znika razem z nią,
    # KAŻDY skasowany element (gałąź, transformator, źródło, odbiór, generator) wypada
    # z `equipment_refs`, skasowany zacisk przestaje być zaciskiem pola (rekord nie wskazuje
    # szyny, której nie ma). Karta GPZ-H5: dawny filtr znał wyłącznie gałęzie
    # i transformatory — pole źródła albo generatora zostawało z odwołaniem do usuniętego.
    for rekord in list(pola(enm)):
        ref_pola = str(rekord.get("ref_id"))
        if ref_pola in usuniete:
            continue
        if rekord.get("bus_ref") in usuniete_szyny:
            usun_pole(enm, ref_pola)
            usuniete.add(ref_pola)
            continue
        equipment_refs = [ref for ref in rekord.get("equipment_refs") or [] if ref not in usuniete]
        zacisk = rekord.get("terminal_bus_ref")
        zmiany: dict[str, Any] = {}
        if equipment_refs != list(rekord.get("equipment_refs") or []):
            zmiany["equipment_refs"] = equipment_refs
        if zacisk in usuniete_szyny:
            zmiany["terminal_bus_ref"] = None
        if zmiany:
            zmien_pole(enm, ref_pola, **zmiany)

    # Stacja jest KONTENEREM (bez fizyki): usunięcie jej transformatora, szyny sekcji, źródła
    # toru zasilania albo łącznika szyn NIE usuwa stacji ani jej struktury — czyści wyłącznie
    # odwołania do usuniętych elementów (karta GPZ-H5, klasa: TR, źródło, szyna, łącznik).
    # Dawniej usunięcie JEDNEGO transformatora kasowało całą stację z polami (GPZ H5 z dwoma
    # transformatorami tracił wszystko), a usunięcie szyny sekcji zostawiało w `bus_refs`
    # i w sekcjach odwołanie do szyny, której nie ma (predykat `bus_ref` stacji nie istniał
    # w kontrakcie). Stacja znika wyłącznie wtedy, gdy znikły WSZYSTKIE jej szyny.
    if usuniete:
        substations_to_delete: set[str] = set()
        for sub in enm.get("substations", []):
            sub_ref = sub.get("ref_id")
            szyny_przed = list(sub.get("bus_refs") or [])
            szyny_po = [ref for ref in szyny_przed if ref not in usuniete_szyny]
            if szyny_przed and not szyny_po:
                if isinstance(sub_ref, str):
                    substations_to_delete.add(sub_ref)
                continue
            sub["bus_refs"] = szyny_po
            sub["transformer_refs"] = [
                ref for ref in sub.get("transformer_refs") or [] if ref not in usuniete
            ]
            if sub.get("gpz_reserve_transformer_ref") in usuniete:
                sub["gpz_reserve_transformer_ref"] = None
            if sub.get("entry_point_ref") in usuniete:
                sub["entry_point_ref"] = None
            for klucz_sekcji in ("gpz_sections", "gpz_hv_sections"):
                sekcje = [
                    sekcja
                    for sekcja in sub.get(klucz_sekcji) or []
                    if sekcja.get("bus_ref") not in usuniete_szyny
                ]
                for sekcja in sekcje:
                    for klucz in ("incoming_source_ref", "left_coupler_ref", "right_coupler_ref"):
                        if sekcja.get(klucz) in usuniete:
                            sekcja[klucz] = None
                if klucz_sekcji in sub:
                    sub[klucz_sekcji] = sekcje
            sekcje_nn = [
                sekcja
                for sekcja in sub.get("nn_sections") or []
                if sekcja.get("bus_ref") not in usuniete_szyny
            ]
            for sekcja in sekcje_nn:
                if sekcja.get("coupler_ref") in usuniete:
                    sekcja["coupler_ref"] = None
            if "nn_sections" in sub:
                sub["nn_sections"] = sekcje_nn
            for port in sub.get("external_ports") or []:
                for klucz in ("bay_ref", "occupied_by"):
                    if port.get(klucz) in usuniete:
                        port[klucz] = None

        if substations_to_delete:
            enm["substations"] = [
                sub
                for sub in enm.get("substations", [])
                if sub.get("ref_id") not in substations_to_delete
            ]
            usuniete.update(substations_to_delete)

    if usuniete_galezie or usuniete_szyny:
        branch_points_to_delete: set[str] = set()
        for bp in enm.get("branch_points", []):
            bp_ref = bp.get("ref_id")
            if (
                bp.get("parent_segment_id") in usuniete_galezie
                or bp.get("bus_ref") in usuniete_szyny
            ):
                if isinstance(bp_ref, str):
                    branch_points_to_delete.add(bp_ref)
                continue

            branch_occupied = bp.get("branch_occupied")
            if isinstance(branch_occupied, dict):
                bp["branch_occupied"] = {
                    key: value
                    for key, value in branch_occupied.items()
                    if value not in usuniete_galezie
                }

        if branch_points_to_delete:
            enm["branch_points"] = [
                bp
                for bp in enm.get("branch_points", [])
                if bp.get("ref_id") not in branch_points_to_delete
            ]
            usuniete.update(branch_points_to_delete)

    # Pole nie istnieje bez właściciela: stacja albo punkt rozgałęzienia ZKSN skasowany (wprost
    # albo kaskadą) zabiera swoje pola — dawniej pola stacji żyły w jej `meta` i znikały
    # z nią same, a rekord pola zostawałby wiszący.
    stacje_po = {s.get("ref_id") for s in enm.get("substations", []) if isinstance(s, dict)}
    punkty_po = {bp.get("ref_id") for bp in enm.get("branch_points", []) if isinstance(bp, dict)}
    for rekord in list(pola(enm)):
        wlasciciel_stacja = rekord.get("substation_ref")
        wlasciciel_punkt = rekord.get("branch_point_ref")
        if (wlasciciel_stacja and wlasciciel_stacja not in stacje_po) or (
            wlasciciel_punkt and wlasciciel_punkt not in punkty_po
        ):
            usun_pole(enm, str(rekord["ref_id"]))
            usuniete.add(str(rekord["ref_id"]))

    # Karta W5-B (kaskada KLASY odwołań, nie instancji): przekładnik stoi na szynie i wskazuje
    # pole (`Measurement.bus_ref`/`bay_ref`), zabezpieczenie działa na wyłącznik
    # (`ProtectionAssignment.breaker_ref`) — usunięcie szyny, pola albo wyłącznika usuwa
    # elementy, które bez nich nie istnieją fizycznie. Dawniej zostawały z odwołaniem do
    # elementu, którego nie ma (przekładnik „w polu" usuniętej stacji).
    if usuniete:
        przekladniki = [
            m
            for m in enm.get("measurements", [])
            if m.get("bus_ref") in usuniete_szyny or m.get("bay_ref") in usuniete
        ]
        refy_przekladnikow = {str(m.get("ref_id")) for m in przekladniki}
        if refy_przekladnikow:
            enm["measurements"] = [
                m
                for m in enm.get("measurements", [])
                if str(m.get("ref_id")) not in refy_przekladnikow
            ]
            usuniete.update(refy_przekladnikow)
        zabezpieczenia = {
            str(pa.get("ref_id"))
            for pa in enm.get("protection_assignments", [])
            if pa.get("breaker_ref") in usuniete_galezie
        }
        if zabezpieczenia:
            enm["protection_assignments"] = [
                pa
                for pa in enm.get("protection_assignments", [])
                if str(pa.get("ref_id")) not in zabezpieczenia
            ]
            usuniete.update(zabezpieczenia)

    return usuniete - przed
