"""Serwis aplikacyjny: raport zgodności powykonawczej (pomiary z obiektu vs model).

Warstwa APPLICATION (interpretacja, NIE fizyka). Domyka pętlę projekt → budowa →
odbiór: porównuje wartości zmierzone na obiekcie (rejestratory, plik CSV) z GOTOWYM
(FROZEN) wynikiem solvera rozpływu mocy oraz z JAWNYMI tolerancjami.

Zasady (WIĄŻĄCE — CLAUDE.md, karta D12/§0):
- ZERO fizyki, ZERO estymacji stanu, ZERO korekt modelu. Porównanie 1:1
  pomiar–model. Solver WLS (``state_estimation_wls``) ISTNIEJE, ale NIE jest tu
  używany (odnotowane w ``zalozenia_pl``).
- Napięcie U przeliczane na kV z ``u_pu`` przez napięcie znamionowe węzła
  (``U = u_pu · U_n``; ``U_n`` jak ``grid_strength._nominal_kv_by_bus``).
- Moce P/Q gałęzi na ZACISKU wskazanym w rekordzie pomiaru (decyzja O-51, klasa P9,
  miejsce 12): ``od`` — strona początkowa (``p_mw``/``q_mvar`` wiersza gałęzi),
  ``do`` — strona końcowa (``p_to_mw``/``q_to_mvar``). Gałąź z przekładnią albo
  susceptancją ma na końcach inne P/Q, więc rekord bez zacisku NIE jest porównywany z
  żadnym końcem (zakaz domysłu „początek gałęzi") — wiersz dostaje odmowę nazwaną z
  kodem kanonu ``analysis.as_built_measurement_terminal_missing``.
- Konwencja znaku Q nierozstrzygnięta (V12K-040): Q porównywane po wartości
  bezwzględnej; znak odchyłki NIE jest interpretowany.
- Tolerancje wyłącznie JAWNE (No-Heuristics). Brak udokumentowanego źródła
  normatywnego dla wartości domyślnych → wartości domyślnych NIE przyjęto; brak
  jawnej tolerancji dla mierzonych wielkości → błąd 422 PL.
- Determinizm: ``input_hash`` SHA-256 (run_id + pomiary + tolerancje), wiersze
  posortowane po (``element_ref``, ``wielkosc``). Ślad WHITE BOX per wiersz
  (model → pomiar → odchyłka → tolerancja → werdykt).

Odwzorowania (plik:linia w kodzie źródłowym):
- ``u_pu`` per węzeł ← ``enm.canonical_analysis.build_bus_results`` (klucz
  ``element_id``),
- P/Q per gałąź i zacisk ← ``build_branch_results`` (``p_mw``/``q_mvar`` — zacisk
  ``od``, ``p_to_mw``/``q_to_mvar`` — zacisk ``do``); etykiety zacisków z nazwami szyn
  ← ``application.protection_settings.zacisk_zabezpieczenia.zaciski_galezi`` (ta sama
  definicja zacisków co resolver zacisku zabezpieczenia),
- ``U_n`` per węzeł ← ``snapshot.buses[*].voltage_kv`` (wzorzec
  ``grid_strength._nominal_kv_by_bus``).
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
from typing import Any

from application.analyses.opis_przebiegu import rodzaj_przebiegu_pl, stan_przebiegu_pl
from application.protection_settings.zacisk_zabezpieczenia import zaciski_galezi
from domain.canonical_operations import READINESS_CODES
from enm.canonical_analysis import (
    CanonicalRun,
    build_branch_results,
    build_bus_results,
)
from enm.nazwy_elementow import nazwa_po_identyfikatorze, zbuduj_indeks_nazw

# Dozwolone wielkości pomiarowe i ich jednostki kanoniczne.
_WIELKOSCI: tuple[str, ...] = ("U", "P", "Q")
_JEDNOSTKA_LABEL: dict[str, str] = {"U": "kV", "P": "MW", "Q": "Mvar"}
_JEDNOSTKA_KEY: dict[str, str] = {"U": "kv", "P": "mw", "Q": "mvar"}
_CSV_NAGLOWEK: tuple[str, ...] = (
    "element_ref",
    "wielkosc",
    "wartosc",
    "jednostka",
    "zacisk",
)
#: Zaciski gałęzi, na których wykonuje się pomiar mocy (decyzja O-51).
_ZACISKI: tuple[str, ...] = ("od", "do")
#: Kod kanonu dla pomiaru mocy gałęzi bez miejsca pomiaru (decyzja O-51, miejsce 12).
KOD_BRAK_ZACISKU_POMIARU = "analysis.as_built_measurement_terminal_missing"

# Poniżej tej wartości modelowej stosunek procentowy jest nieokreślony (dzielenie
# przez ~0); werdykt opieramy wtedy na odchyłce bezwzględnej.
_EPS: float = 1e-9

# Werdykty (etykiety PL — jedyne dopuszczalne wartości pola ``werdykt``).
_W_TOLERANCJI = "w tolerancji"
_POZA_TOLERANCJA = "poza tolerancją"
_BRAK_ODPOWIEDNIKA = "brak odpowiednika w modelu"
_BRAK_WYNIKU = "brak wyniku dla elementu"
_BRAK_MIEJSCA_POMIARU = "brak miejsca pomiaru"


def _round6(value: float | None) -> float | None:
    return None if value is None else round(float(value), 6)


# --------------------------------------------------------------------------
# Parser CSV (stdlib) — osobna, testowalna funkcja
# --------------------------------------------------------------------------


def parse_measurements_csv(csv_text: str) -> list[dict[str, Any]]:
    """Sparsuj pomiary z tekstu CSV do listy surowych wierszy.

    Nagłówek: ``element_ref;wielkosc;wartosc;jednostka;zacisk`` (``zacisk`` = ``od`` /
    ``do`` dla mocy gałęzi, puste dla napięcia węzła). Separator ``;`` LUB ``,``
    wykrywany po nagłówku; przy ``;`` dopuszczalny polski przecinek dziesiętny.
    Waliduje jedynie strukturę (kolumny, liczbowość ``wartosc``); walidacja
    semantyczna (wielkość/jednostka) w ``_normalize_measurements``. Każdy wiersz
    nosi ``_wiersz`` (numer linii) do komunikatów błędów.

    Raises:
        ValueError: komunikat PL z numerem wiersza przy błędzie parsowania.
    """
    tekst = csv_text.lstrip("﻿")
    if not tekst.strip():
        raise ValueError("Plik CSV jest pusty.")

    naglowek_linia = next((linia for linia in tekst.splitlines() if linia.strip()), "")
    if ";" in naglowek_linia:
        delimiter, przecinek_dziesietny = ";", True
    elif "," in naglowek_linia:
        delimiter, przecinek_dziesietny = ",", False
    else:
        raise ValueError(
            "Nagłówek CSV nie zawiera separatora ';' ani ','; "
            f"oczekiwano: {';'.join(_CSV_NAGLOWEK)}."
        )

    wiersze = list(csv.reader(io.StringIO(tekst), delimiter=delimiter))
    if not wiersze or not any(cell.strip() for cell in wiersze[0]):
        raise ValueError("Plik CSV nie zawiera nagłówka.")

    naglowek = tuple(cell.strip().lower() for cell in wiersze[0])
    if naglowek != _CSV_NAGLOWEK:
        raise ValueError(
            "Nagłówek CSV musi mieć kolumny "
            f"'{';'.join(_CSV_NAGLOWEK)}'; otrzymano: '{delimiter.join(wiersze[0])}'."
        )

    out: list[dict[str, Any]] = []
    for indeks, wiersz in enumerate(wiersze[1:], start=2):
        if not any(cell.strip() for cell in wiersz):
            continue
        if len(wiersz) != len(_CSV_NAGLOWEK):
            raise ValueError(
                f"Wiersz {indeks} CSV: oczekiwano {len(_CSV_NAGLOWEK)} kolumn, "
                f"otrzymano {len(wiersz)}."
            )
        element_ref, wielkosc, wartosc_s, jednostka, zacisk = (cell.strip() for cell in wiersz)
        wartosc_norm = wartosc_s.replace(",", ".") if przecinek_dziesietny else wartosc_s
        try:
            wartosc = float(wartosc_norm)
        except ValueError as exc:
            raise ValueError(
                f"Wiersz {indeks} CSV: wartość '{wartosc_s}' nie jest liczbą."
            ) from exc
        out.append(
            {
                "_wiersz": indeks,
                "element_ref": element_ref,
                "wielkosc": wielkosc,
                "wartosc": wartosc,
                "jednostka": jednostka,
                "zacisk": zacisk or None,
            }
        )
    if not out:
        raise ValueError("Plik CSV nie zawiera żadnych pomiarów (tylko nagłówek).")
    return out


# --------------------------------------------------------------------------
# Walidacja i normalizacja pomiarów (wspólna dla listy i CSV)
# --------------------------------------------------------------------------


def _normalize_measurements(pomiary: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Zwaliduj semantycznie i znormalizuj pomiary; komunikaty błędów PL.

    Raises:
        ValueError: pusta lista, nieznana wielkość, jednostka niezgodna z
            wielkością lub wartość nieliczbowa (z numerem wiersza gdy dostępny).
    """
    if not pomiary:
        raise ValueError("Brak pomiarów: lista pomiarów jest pusta.")

    out: list[dict[str, Any]] = []
    for pozycja, raw in enumerate(pomiary, start=1):
        etykieta = raw.get("_wiersz", pozycja)
        element_ref = str(raw.get("element_ref") or "").strip()
        wielkosc = str(raw.get("wielkosc") or "").strip().upper()
        jednostka = str(raw.get("jednostka") or "").strip()
        if not element_ref:
            raise ValueError(
                f"Pomiar w wierszu {etykieta}: brak identyfikatora elementu (element_ref)."
            )
        if wielkosc not in _WIELKOSCI:
            raise ValueError(
                f"Pomiar w wierszu {etykieta}: nieznana wielkość "
                f"'{raw.get('wielkosc')}' (dozwolone: U, P, Q)."
            )
        wartosc_raw: Any = raw.get("wartosc")
        try:
            wartosc = float(wartosc_raw)
        except (TypeError, ValueError) as exc:
            raise ValueError(
                f"Pomiar w wierszu {etykieta}: wartość '{wartosc_raw}' nie jest liczbą."
            ) from exc
        if jednostka.lower() != _JEDNOSTKA_KEY[wielkosc]:
            raise ValueError(
                f"Pomiar w wierszu {etykieta}: jednostka '{jednostka}' niezgodna "
                f"z wielkością {wielkosc} (oczekiwano {_JEDNOSTKA_LABEL[wielkosc]})."
            )
        zacisk_raw = raw.get("zacisk")
        zacisk = str(zacisk_raw).strip() if zacisk_raw is not None else ""
        if wielkosc == "U" and zacisk:
            raise ValueError(
                f"Pomiar w wierszu {etykieta}: napięcie mierzy się w węźle — zacisk "
                f"'{zacisk}' dotyczy wyłącznie mocy gałęzi (P, Q)."
            )
        if zacisk and zacisk not in _ZACISKI:
            raise ValueError(
                f"Pomiar w wierszu {etykieta}: zacisk '{zacisk}' — dozwolone 'od' "
                "(zacisk początkowy gałęzi) albo 'do' (zacisk końcowy)."
            )
        out.append(
            {
                "element_ref": element_ref,
                "wielkosc": wielkosc,
                "wartosc": wartosc,
                "jednostka": _JEDNOSTKA_LABEL[wielkosc],
                "zacisk": zacisk or None,
            }
        )
    return out


# --------------------------------------------------------------------------
# Odczyt wartości modelowych z wyniku FROZEN rozpływu
# --------------------------------------------------------------------------


def _nominal_kv_by_bus(snapshot: dict[str, Any]) -> dict[str, float | None]:
    """Napięcie znamionowe węzła [kV] per ``ref_id`` (wzorzec grid_strength)."""
    out: dict[str, float | None] = {}
    for bus in snapshot.get("buses") or []:
        if not isinstance(bus, dict):
            continue
        ref_id = bus.get("ref_id")
        if not isinstance(ref_id, str):
            continue
        kv = bus.get("voltage_kv")
        out[ref_id] = float(kv) if kv is not None else None
    return out


def _bus_upu_by_element(run: CanonicalRun) -> dict[str, float | None]:
    out: dict[str, float | None] = {}
    for row in build_bus_results(run).get("rows", []):
        element_id = row.get("element_id")
        if isinstance(element_id, str):
            u_pu = row.get("u_pu")
            out[element_id] = float(u_pu) if u_pu is not None else None
    return out


def _branch_pq_by_element(
    run: CanonicalRun,
) -> dict[str, dict[str, tuple[float | None, float | None]]]:
    """(P, Q) gałęzi per zacisk: `od` = strona początkowa, `do` = strona końcowa."""

    def _liczba(wartosc: Any) -> float | None:
        return float(wartosc) if wartosc is not None else None

    out: dict[str, dict[str, tuple[float | None, float | None]]] = {}
    for row in build_branch_results(run).get("rows", []):
        element_id = row.get("element_id")
        if isinstance(element_id, str):
            out[element_id] = {
                "od": (_liczba(row.get("p_mw")), _liczba(row.get("q_mvar"))),
                "do": (_liczba(row.get("p_to_mw")), _liczba(row.get("q_to_mvar"))),
            }
    return out


# --------------------------------------------------------------------------
# Porównanie pojedynczego punktu
# --------------------------------------------------------------------------


def _werdykt(
    odchylka_bezwzgledna: float, model_mag: float, tolerancja_pct: float
) -> tuple[float | None, str]:
    """Zwróć (odchyłka_pct, werdykt) dla znanej wartości modelowej i tolerancji."""
    if model_mag <= _EPS:
        # Stosunek procentowy nieokreślony (model ≈ 0) — werdykt po wartości
        # bezwzględnej: zgodny tylko gdy pomiar również ≈ 0.
        werdykt = _W_TOLERANCJI if abs(odchylka_bezwzgledna) <= _EPS else _POZA_TOLERANCJA
        return None, werdykt
    pct = odchylka_bezwzgledna / model_mag * 100.0
    werdykt = _W_TOLERANCJI if abs(pct) <= tolerancja_pct else _POZA_TOLERANCJA
    return pct, werdykt


def _slad_braku_w_wyniku(element_ref: object, nazwy: dict[str, str], rola: str) -> str:
    """Ślad pomiaru bez odpowiednika w wyniku rozpływu (`rola`: „węzeł" albo „gałąź").

    Element modelu nazywa nazwą z migawki biegu; identyfikator spoza modelu (pomiar wskazał
    miejsce, którego model nie zna) to jawny brak elementu w modelu — nigdy sam identyfikator
    ani zdanie „Element 'Element spoza modelu'" (karta #144)."""
    klucz = str(element_ref)
    if klucz in nazwy:
        return f"Element '{nazwy[klucz]}' nie występuje jako {rola} w wyniku rozpływu."
    return (
        "Pomiar wskazuje element spoza modelu sieci biegu — nie występuje on jako "
        f"{rola} w wyniku rozpływu."
    )


def _porownaj_punkt(
    pomiar: dict[str, Any],
    *,
    bus_upu: dict[str, float | None],
    nominal_kv: dict[str, float | None],
    branch_pq: dict[str, dict[str, tuple[float | None, float | None]]],
    snapshot: dict[str, Any],
    nazwy: dict[str, str],
    napiecie_pct: float | None,
    moc_pct: float | None,
) -> dict[str, Any]:
    element_ref = pomiar["element_ref"]
    # Ślad nazywa element nazwą z modelu biegu; identyfikator z pomiaru zostaje w polu
    # `element_ref` wiersza (karta #144).
    nazwa = nazwa_po_identyfikatorze(element_ref, indeks=nazwy)
    wielkosc = pomiar["wielkosc"]
    jednostka = pomiar["jednostka"]
    wartosc_pomiar = float(pomiar["wartosc"])

    wiersz: dict[str, Any] = {
        "element_ref": element_ref,
        "wielkosc": wielkosc,
        "jednostka": jednostka,
        "wartosc_pomiar": _round6(wartosc_pomiar),
        "wartosc_model": None,
        "odchylka_bezwzgledna": None,
        "odchylka_pct": None,
        "tolerancja_pct": None,
        "werdykt": _BRAK_ODPOWIEDNIKA,
        # Decyzja O-51: miejsce pomiaru mocy gałęzi (`od`/`do`) i kod odmowy nazwanej,
        # gdy rekord go nie niesie; `None` dla napięcia węzła.
        "zacisk": pomiar.get("zacisk"),
        # Etykieta miejsca pomiaru z nazwą szyny (`zaciski_galezi`) — ta sama, którą
        # formularz pokazuje przy wyborze zacisku; `None` dla napięcia i braku zacisku.
        "miejsce_pomiaru_pl": None,
        "kod_odmowy": None,
        "slad_pl": [],
    }

    if wielkosc == "U":
        tolerancja = napiecie_pct
        if element_ref not in bus_upu:
            wiersz["slad_pl"] = [_slad_braku_w_wyniku(element_ref, nazwy, "węzeł")]
            return wiersz
        u_pu = bus_upu.get(element_ref)
        u_n = nominal_kv.get(element_ref)
        if u_pu is None or u_n is None:
            wiersz["werdykt"] = _BRAK_WYNIKU
            wiersz["slad_pl"] = [
                f"Brak kompletu danych modelowych dla węzła '{nazwa}' "
                "(u_pu lub napięcie znamionowe)."
            ]
            return wiersz
        model = u_pu * u_n
        odchylka = wartosc_pomiar - model
        model_mag = abs(model)
        slad_model = (
            f"Model U = u · U_n (napięcie względne · znamionowe) = "
            f"{u_pu:.6f} × {u_n:.6f} = {model:.6f} kV"
        )
        slad_pomiar = f"Pomiar U = {wartosc_pomiar:.6f} kV"
    else:
        tolerancja = moc_pct
        if element_ref not in branch_pq:
            wiersz["slad_pl"] = [_slad_braku_w_wyniku(element_ref, nazwy, "gałąź")]
            return wiersz
        zacisk = pomiar.get("zacisk")
        if zacisk is None:
            wiersz["werdykt"] = _BRAK_MIEJSCA_POMIARU
            wiersz["kod_odmowy"] = KOD_BRAK_ZACISKU_POMIARU
            wiersz["slad_pl"] = [
                f"{READINESS_CODES[KOD_BRAK_ZACISKU_POMIARU].message_pl} (gałąź "
                f"'{nazwa}', wielkość {wielkosc})."
            ]
            return wiersz
        p_mw, q_mvar = branch_pq[element_ref][zacisk]
        surowa = p_mw if wielkosc == "P" else q_mvar
        zaciski = zaciski_galezi(snapshot, element_ref)
        miejsce = (
            (zaciski.etykieta_od_pl if zacisk == "od" else zaciski.etykieta_do_pl)
            if zaciski is not None
            else f"zacisk {zacisk}"
        )
        wiersz["miejsce_pomiaru_pl"] = miejsce
        if surowa is None:
            wiersz["werdykt"] = _BRAK_WYNIKU
            wiersz["slad_pl"] = [
                f"Brak wyniku {wielkosc} na zacisku {zacisk} ({miejsce}) gałęzi '{nazwa}'."
            ]
            return wiersz
        if wielkosc == "P":
            model = surowa
            odchylka = wartosc_pomiar - model
            model_mag = abs(model)
            slad_model = f"Model P na zacisku {zacisk} ({miejsce}) = {model:.6f} MW"
            slad_pomiar = f"Pomiar P = {wartosc_pomiar:.6f} MW"
        else:
            # Q — porównanie po wartości bezwzględnej (konwencja znaku mocy biernej
            # nierozstrzygnięta w danych pomiarowych; treść śladu bez kodów rejestru).
            model_mag = abs(surowa)
            odchylka = abs(wartosc_pomiar) - model_mag
            model = surowa
            slad_model = (
                f"Model |Q| na zacisku {zacisk} ({miejsce}) = |{surowa:.6f}| = "
                f"{model_mag:.6f} Mvar (znak mocy biernej nieinterpretowany — porównanie po "
                "wartości bezwzględnej)"
            )
            slad_pomiar = f"Pomiar |Q| = |{wartosc_pomiar:.6f}| = {abs(wartosc_pomiar):.6f} Mvar"

    if tolerancja is None:
        # Nie powinno wystąpić — brak tolerancji egzekwowany wcześniej (422).
        wiersz["werdykt"] = _BRAK_WYNIKU
        wiersz["slad_pl"] = [f"Brak jawnej tolerancji dla wielkości {wielkosc}."]
        return wiersz

    odchylka_pct, werdykt = _werdykt(odchylka, model_mag, tolerancja)
    wiersz["wartosc_model"] = _round6(model)
    wiersz["odchylka_bezwzgledna"] = _round6(odchylka)
    wiersz["odchylka_pct"] = _round6(odchylka_pct)
    wiersz["tolerancja_pct"] = _round6(tolerancja)
    wiersz["werdykt"] = werdykt
    pct_txt = "nieokreślona (model ≈ 0)" if odchylka_pct is None else f"{odchylka_pct:.6f}%"
    wiersz["slad_pl"] = [
        slad_model,
        slad_pomiar,
        f"Odchyłka = pomiar − model = {odchylka:.6f} {jednostka} ({pct_txt})",
        f"Tolerancja = ±{tolerancja:.6f}%",
        f"Werdykt: {werdykt}",
    ]
    return wiersz


# --------------------------------------------------------------------------
# input_hash (determinizm)
# --------------------------------------------------------------------------


def _input_hash(
    run: CanonicalRun,
    pomiary: list[dict[str, Any]],
    tolerancje: dict[str, Any],
) -> str:
    payload = {
        "run_id": str(run.id),
        "pomiary": [
            {
                "element_ref": p["element_ref"],
                "wielkosc": p["wielkosc"],
                "wartosc": _round6(p["wartosc"]),
                "jednostka": p["jednostka"],
                "zacisk": p.get("zacisk"),
            }
            for p in pomiary
        ],
        "tolerancje": {
            "napiecie_pct": _round6(tolerancje.get("napiecie_pct")),
            "moc_pct": _round6(tolerancje.get("moc_pct")),
        },
    }
    canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


# --------------------------------------------------------------------------
# Serwis główny
# --------------------------------------------------------------------------


def build_zgodnosc_powykonawcza_view(
    run: CanonicalRun,
    pomiary: list[dict[str, Any]],
    tolerancje: dict[str, Any] | None,
) -> dict[str, Any]:
    """Zbuduj raport zgodności powykonawczej dla przebiegu rozpływu.

    Args:
        run: zakończony (FINISHED) przebieg rozpływu (``PF``).
        pomiary: surowe wiersze pomiarowe (z listy żądania lub z parsera CSV).
        tolerancje: jawne tolerancje ``{"napiecie_pct", "moc_pct"}`` (opcjonalne
            klucze; wymagane dla mierzonych wielkości — brak → ValueError PL).

    Raises:
        ValueError: zły rodzaj/status przebiegu, brak pomiarów, błąd walidacji
            pomiaru lub brak jawnej tolerancji dla mierzonej wielkości (422 PL).
    """
    if run.analysis_type != "PF":
        raise ValueError(
            "Raport zgodności powykonawczej wymaga przebiegu rozpływu mocy; "
            f"wskazany przebieg: {rodzaj_przebiegu_pl(run.analysis_type)}."
        )
    if run.status != "FINISHED":
        raise ValueError(
            f"Przebieg nie jest zakończony (stan: {stan_przebiegu_pl(run.status)}); "
            "wynik rozpływu mocy nie jest dostępny."
        )

    znormalizowane = _normalize_measurements(pomiary)
    tol = dict(tolerancje or {})
    napiecie_pct = tol.get("napiecie_pct")
    moc_pct = tol.get("moc_pct")

    obecne = {p["wielkosc"] for p in znormalizowane}
    if "U" in obecne and napiecie_pct is None:
        raise ValueError(
            "Brak jawnej tolerancji napięcia (tolerancje.napiecie_pct). Nie przyjęto "
            "wartości domyślnej — brak udokumentowanego źródła normatywnego; podaj "
            "tolerancję jawnie."
        )
    if (obecne & {"P", "Q"}) and moc_pct is None:
        raise ValueError(
            "Brak jawnej tolerancji mocy (tolerancje.moc_pct). Nie przyjęto wartości "
            "domyślnej — brak udokumentowanego źródła normatywnego; podaj tolerancję "
            "jawnie."
        )

    bus_upu = _bus_upu_by_element(run)
    nominal_kv = _nominal_kv_by_bus(run.snapshot or {})
    branch_pq = _branch_pq_by_element(run)
    nazwy = zbuduj_indeks_nazw(run.snapshot or {})

    wiersze = [
        _porownaj_punkt(
            pomiar,
            bus_upu=bus_upu,
            nominal_kv=nominal_kv,
            branch_pq=branch_pq,
            snapshot=run.snapshot or {},
            nazwy=nazwy,
            napiecie_pct=napiecie_pct,
            moc_pct=moc_pct,
        )
        for pomiar in znormalizowane
    ]
    wiersze.sort(key=lambda w: (w["element_ref"], w["wielkosc"], w["zacisk"] or ""))

    liczby = {
        _W_TOLERANCJI: 0,
        _POZA_TOLERANCJA: 0,
        _BRAK_ODPOWIEDNIKA: 0,
        _BRAK_WYNIKU: 0,
        _BRAK_MIEJSCA_POMIARU: 0,
    }
    najwieksza_pct: float | None = None
    najwieksza_ref: str | None = None
    najwieksza_wielkosc: str | None = None
    for w in wiersze:
        liczby[w["werdykt"]] += 1
        pct = w["odchylka_pct"]
        if pct is not None and (najwieksza_pct is None or abs(pct) > abs(najwieksza_pct)):
            najwieksza_pct = pct
            najwieksza_ref = w["element_ref"]
            najwieksza_wielkosc = w["wielkosc"]

    zrodlo_tolerancji: dict[str, str] = {}
    if "U" in obecne:
        zrodlo_tolerancji["napiecie_pct"] = "jawna (żądanie)"
    if obecne & {"P", "Q"}:
        zrodlo_tolerancji["moc_pct"] = "jawna (żądanie)"

    return {
        "analysis_id": str(run.id),
        "input_hash": _input_hash(
            run,
            znormalizowane,
            {"napiecie_pct": napiecie_pct, "moc_pct": moc_pct},
        ),
        "tolerancje": {
            "napiecie_pct": _round6(napiecie_pct),
            "moc_pct": _round6(moc_pct),
        },
        "zrodlo_tolerancji": zrodlo_tolerancji,
        "zalozenia_pl": [
            "Porównanie 1:1 pomiar–model (wynik rozpływu tylko do odczytu, bez "
            "modyfikacji); bez estymacji stanu i bez korekt modelu.",
            "Napięcie przeliczane na kV z wartości względnej przez napięcie "
            "znamionowe węzła: $U = u \\cdot U_{n}$.",
            "Moce P/Q odczytywane na zacisku gałęzi wskazanym w rekordzie pomiaru "
            "(zacisk początkowy albo końcowy); pomiar mocy gałęzi bez zacisku nie jest "
            "porównywany z żadnym końcem gałęzi — dostaje odmowę nazwaną.",
            "Konwencja znaku mocy biernej nierozstrzygnięta w danych pomiarowych: "
            "Q porównywane po wartości bezwzględnej $|Q|$; znak odchyłki nie jest "
            "interpretowany.",
            "Tolerancje wyłącznie jawne (z żądania); brak udokumentowanego źródła "
            "normatywnego dla wartości domyślnych, więc domyślnych nie przyjęto.",
        ],
        "podsumowanie": {
            "liczba_punktow": len(wiersze),
            "w_tolerancji": liczby[_W_TOLERANCJI],
            "poza_tolerancja": liczby[_POZA_TOLERANCJA],
            "brak_odpowiednika": liczby[_BRAK_ODPOWIEDNIKA],
            "brak_wyniku": liczby[_BRAK_WYNIKU],
            "brak_miejsca_pomiaru": liczby[_BRAK_MIEJSCA_POMIARU],
            "najwieksza_odchylka_pct": najwieksza_pct,
            "najwieksza_odchylka_element_ref": najwieksza_ref,
            "najwieksza_odchylka_wielkosc": najwieksza_wielkosc,
        },
        "wiersze": wiersze,
    }
