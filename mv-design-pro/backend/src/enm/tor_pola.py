"""Zasada toru pola stacji — JEDNO źródło (karta POLA-W-TORZE).

Po co: stacja wstawiona w odcinek i stacja końca ciągu przyłączały kable i transformator do
szyny głównej, z pominięciem aparatów swoich pól. Aparat pola był martwy elektrycznie — jego
otwarcie niczego nie odłączało i nie płynął przez niego prąd — a GPZ tę samą fizykę realizował
przez zaciski pól. Rozstrzygnięcie architekta (wariant (a)): element, któremu pole służy, jest
przyłączony do ZACISKU tego pola, a aparat pola leży w jego torze prądowym. Szyna główna
(sekcja) niesie wyłącznie aparaty pól i sprzęgła.

Ten moduł jest jedynym miejscem, które mówi:
  * jaka rola pola służy któremu elementowi przy budowie stacji (`ROLA_POLA_WE`,
    `ROLA_POLA_WY`, `ROLA_POLA_TR`) i które pola operacja budowy stacji DOMYKA, gdy skład pól
    ich nie ma (`pola_do_domkniecia`, `POLE_DOMYKANE`);
  * które elementy zastanego modelu omijają pole, które im służy (`naruszenia_zasady_toru`)
    — czyta go walidator (kod `W042`), a akcja naprawcza przepina element operacją
    `przepnij_element_na_pole` na zacisk wskazanego pola.

Reguła naruszenia (wyłącznie z JAWNYCH danych modelu, bez domysłu):
  N1 odcinek terenowy SN (kabel, linia) z końcem na szynie głównej stacji, która ma pola SN
     z WŁASNYM zaciskiem. Pole, które mu służy: dla końca `to` odcinka (odcinek dochodzi do
     stacji — kierunek ENM `from` = strona zasilania) pierwsze WOLNE pole roli `IN` tej szyny,
     dla końca `from` (odcinek wychodzi ze stacji) pierwsze WOLNE pole roli `OUT`, a przy jego
     braku `FEEDER`. Brak wolnego pola = naruszenie bez wskazania pola (akcja: dodaj pole).
  N2 transformator ze stroną górną na szynie głównej stacji, która ma pole roli `TR` z własnym
     zaciskiem. Pole, które mu służy: pole TR, którego `equipment_refs` wskazuje transformator,
     inaczej pierwsze WOLNE pole TR tej szyny.
Pole WOLNE = jego zacisk nie niesie żadnego elementu mocy (odcinka, transformatora, źródła,
odbioru) — to ta sama zajętość fizyczna, którą liczy `enm.zajetosc_pol` dla pól liniowych.

Moduł-liść: biblioteka standardowa + `enm.zajetosc_pol` (liść), operuje na słowniku ENM
(postać operacji domenowych i migawki biegu).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from .zajetosc_pol import TYPY_ODCINKA_TERENOWEGO, zacisk_pola

#: Rola pola (`Bay.bay_role`), na którego zacisku kończy się połówka odcinka od strony zasilania.
ROLA_POLA_WE = "IN"
#: Rola pola, z którego zacisku wychodzi połówka dalsza odcinka (ciąg dalej).
ROLA_POLA_WY = "OUT"
#: Rola pola odgałęźnego — też pole liniowe, z którego może wyjść odcinek.
ROLA_POLA_ODG = "FEEDER"
#: Rola pola, na którego zacisku leży strona górna transformatora.
ROLA_POLA_TR = "TR"

#: Kod ostrzeżenia walidatora: element przyłączony do szyny stacji z pominięciem pola.
KOD_WALIDATORA_ELEMENT_OMIJA_POLE = "W042"
#: Kanoniczny kod gotowości tego samego faktu (`domain/readiness_bridge.py`).
KOD_KANONICZNY_ELEMENT_OMIJA_POLE = "station.element_bypasses_field"
#: Operacja domenowa akcji naprawczej: przepięcie elementu na zacisk pola.
OPERACJA_PRZEPIECIA = "przepnij_element_na_pole"

#: Role pól, którym może służyć koniec odcinka dochodzący do stacji (`to`) i wychodzący (`from`).
ROLE_KONCA_DOCHODZACEGO: tuple[str, ...] = (ROLA_POLA_WE,)
ROLE_KONCA_WYCHODZACEGO: tuple[str, ...] = (ROLA_POLA_WY, ROLA_POLA_ODG)


def indeks_pola_toru(role_pol: Sequence[str], rola: str) -> int | None:
    """Indeks PIERWSZEGO pola danej roli w składzie pól (kolejność z danych, V12K-330)."""
    for indeks, rola_pola in enumerate(role_pol):
        if str(rola_pola).upper() == rola:
            return indeks
    return None


#: Rola kanoniczna (`field_role`) i rodzaj jednostki (`bay_kind`) pola DOMYKANEGO operacją —
#: te same wartości w obu drogach budowy stacji (wcięcie w odcinek, stacja końca ciągu).
POLE_DOMYKANE: dict[str, tuple[str, str]] = {
    ROLA_POLA_WE: ("LINIA_IN", "liniowe_doplywowe"),
    ROLA_POLA_WY: ("LINIA_OUT", "liniowe_odplywowe"),
    ROLA_POLA_TR: ("TRANSFORMATOROWE", "transformatorowe"),
}
#: Status źródła pola domykanego — rozwiązanie z katalogu (aparat ze wspólnego wskazania).
STATUS_POLA_DOMYKANEGO = "catalog_solution"


def pola_do_domkniecia(
    role_pol: Sequence[str], *, wymaga_pola_we: bool, wymaga_pola_wy: bool, wymaga_pola_tr: bool
) -> list[tuple[int, str]]:
    """Pola, których skład nie ma, a element stacji ich wymaga: `(pozycja, rola)` do wstawienia
    kolejno w skład pól (pozycje liczone po wcześniejszych wstawieniach).

    Połówka odcinka od strony zasilania kończy się na polu wejściowym (na początku składu),
    połówka dalsza wychodzi z pola wyjściowego (zaraz za wejściowym), transformator leży na
    polu transformatorowym (na końcu składu). Operacja DOMYKA brakujące pole zamiast wieszać
    element na szynie głównej — ta sama reguła w obu drogach budowy stacji.
    """
    role = [str(r).upper() for r in role_pol]
    wynik: list[tuple[int, str]] = []
    if wymaga_pola_we and ROLA_POLA_WE not in role:
        role.insert(0, ROLA_POLA_WE)
        wynik.append((0, ROLA_POLA_WE))
    if wymaga_pola_wy and ROLA_POLA_WY not in role:
        pozycja = role.index(ROLA_POLA_WE) + 1 if ROLA_POLA_WE in role else 0
        role.insert(pozycja, ROLA_POLA_WY)
        wynik.append((pozycja, ROLA_POLA_WY))
    if wymaga_pola_tr and ROLA_POLA_TR not in role:
        role.append(ROLA_POLA_TR)
        wynik.append((len(role) - 1, ROLA_POLA_TR))
    return wynik


# ---------------------------------------------------------------------------
# Naruszenia zasady toru w zastanym modelu
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class NaruszenieToru:
    """Element mocy przyłączony do szyny głównej stacji z pominięciem pola, które mu służy."""

    station_ref: str
    station_name: str
    element_ref: str
    element_name: str
    #: `odcinek` albo `transformator`.
    rodzaj_elementu: str
    #: Szyna główna, na której element leży dziś.
    szyna_ref: str
    #: Pole, które służy elementowi (wolne pole właściwej roli) — `None`, gdy takiego nie ma.
    field_ref: str | None
    #: Zacisk tego pola (cel przepięcia) — `None` razem z `field_ref`.
    zacisk_ref: str | None


def _slownik(value: object) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _napis(value: object) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def elementy_mocy_na_szynach(enm: Mapping[str, Any]) -> dict[str, set[str]]:
    """Szyna → elementy MOCY przyłączone do niej (bez aparatów łączeniowych)."""
    wynik: dict[str, set[str]] = {}

    def dodaj(szyna: object, ref: object) -> None:
        s, r = _napis(szyna), _napis(ref)
        if s and r:
            wynik.setdefault(s, set()).add(r)

    for galaz in enm.get("branches") or []:
        if isinstance(galaz, Mapping) and galaz.get("type") in TYPY_ODCINKA_TERENOWEGO:
            dodaj(galaz.get("from_bus_ref"), galaz.get("ref_id"))
            dodaj(galaz.get("to_bus_ref"), galaz.get("ref_id"))
    for transformator in enm.get("transformers") or []:
        if isinstance(transformator, Mapping):
            dodaj(transformator.get("hv_bus_ref"), transformator.get("ref_id"))
            dodaj(transformator.get("lv_bus_ref"), transformator.get("ref_id"))
    for kolekcja in ("sources", "loads", "generators"):
        for element in enm.get(kolekcja) or []:
            if isinstance(element, Mapping):
                dodaj(element.get("bus_ref"), element.get("ref_id"))
    return wynik


def _wolne_pole(
    pola: list[Mapping[str, Any]],
    role: tuple[str, ...],
    elementy_na_szynach: Mapping[str, set[str]],
    zajete_zaciski: set[str],
) -> Mapping[str, Any] | None:
    """Pierwsze pole z `role` (w kolejności ról, potem danych), którego zacisk nic nie niesie."""
    for rola in role:
        for spec in pola:
            if str(spec.get("bay_role") or "").upper() != rola:
                continue
            zacisk = str(zacisk_pola(spec))
            if elementy_na_szynach.get(zacisk) or zacisk in zajete_zaciski:
                continue
            return spec
    return None


def _naruszenia_stacji(
    stacja: Mapping[str, Any],
    galezie: list[Mapping[str, Any]],
    transformatory: list[Mapping[str, Any]],
    elementy_na_szynach: Mapping[str, set[str]],
) -> list[NaruszenieToru]:
    station_ref = _napis(stacja.get("ref_id")) or ""
    szyny_glowne = {s for s in (stacja.get("bus_refs") or []) if _napis(s)}
    # Pola z WŁASNYM zaciskiem, pogrupowane po szynie pola.
    pola_szyny: dict[str, list[Mapping[str, Any]]] = {}
    for spec in _slownik(stacja.get("meta")).get("field_specs") or []:
        if not isinstance(spec, Mapping):
            continue
        szyna_pola = _napis(spec.get("bus_ref"))
        zacisk = zacisk_pola(spec)
        if szyna_pola and zacisk and zacisk != szyna_pola and _napis(spec.get("field_ref")):
            pola_szyny.setdefault(szyna_pola, []).append(spec)
    wynik: list[NaruszenieToru] = []
    if not pola_szyny:
        return wynik
    zajete_zaciski: set[str] = set()

    def zapisz(
        element: Mapping[str, Any], rodzaj: str, szyna: str, spec: Mapping[str, Any] | None
    ) -> None:
        zacisk = str(zacisk_pola(spec)) if spec is not None else None
        if zacisk:
            zajete_zaciski.add(zacisk)
        wynik.append(
            NaruszenieToru(
                station_ref=station_ref,
                station_name=str(stacja.get("name") or ""),
                element_ref=str(element.get("ref_id") or ""),
                element_name=str(element.get("name") or ""),
                rodzaj_elementu=rodzaj,
                szyna_ref=szyna,
                field_ref=_napis(spec.get("field_ref")) if spec is not None else None,
                zacisk_ref=zacisk,
            )
        )

    # N1: odcinki terenowe na szynie głównej stacji z polami liniowymi.
    for galaz in galezie:
        if galaz.get("type") not in TYPY_ODCINKA_TERENOWEGO:
            continue
        for koniec, role in (
            ("to_bus_ref", ROLE_KONCA_DOCHODZACEGO),
            ("from_bus_ref", ROLE_KONCA_WYCHODZACEGO),
        ):
            szyna = _napis(galaz.get(koniec))
            if szyna and szyna in szyny_glowne and szyna in pola_szyny:
                pole = _wolne_pole(pola_szyny[szyna], role, elementy_na_szynach, zajete_zaciski)
                zapisz(galaz, "odcinek", szyna, pole)
    # N2: strona górna transformatora na szynie głównej stacji z polem TR.
    for transformator in transformatory:
        szyna = _napis(transformator.get("hv_bus_ref"))
        if not szyna or szyna not in szyny_glowne or szyna not in pola_szyny:
            continue
        pola_tr = [
            s for s in pola_szyny[szyna] if str(s.get("bay_role") or "").upper() == ROLA_POLA_TR
        ]
        if not pola_tr:
            continue  # brak pola TR to inny fakt — `W041` (`enm.pole_transformatorowe`)
        wskazane = next(
            (
                s
                for s in pola_tr
                if transformator.get("ref_id") in (s.get("equipment_refs") or [])
                and not elementy_na_szynach.get(str(zacisk_pola(s)))
                and str(zacisk_pola(s)) not in zajete_zaciski
            ),
            None,
        )
        pole = wskazane or _wolne_pole(
            pola_tr, (ROLA_POLA_TR,), elementy_na_szynach, zajete_zaciski
        )
        zapisz(transformator, "transformator", szyna, pole)
    return wynik


def naruszenia_zasady_toru(enm: Mapping[str, Any]) -> list[NaruszenieToru]:
    """Elementy omijające pole, które im służy (reguły N1, N2 z opisu modułu), deterministycznie."""
    elementy_na_szynach = elementy_mocy_na_szynach(enm)
    galezie = sorted(
        (g for g in enm.get("branches") or [] if isinstance(g, Mapping)),
        key=lambda g: str(g.get("ref_id") or ""),
    )
    transformatory = sorted(
        (t for t in enm.get("transformers") or [] if isinstance(t, Mapping)),
        key=lambda t: str(t.get("ref_id") or ""),
    )
    wynik: list[NaruszenieToru] = []
    for stacja in sorted(
        (s for s in enm.get("substations") or [] if isinstance(s, Mapping)),
        key=lambda s: str(s.get("ref_id") or ""),
    ):
        wynik.extend(_naruszenia_stacji(stacja, galezie, transformatory, elementy_na_szynach))
    wynik.sort(key=lambda n: (n.station_ref, n.rodzaj_elementu, n.element_ref, n.szyna_ref))
    return wynik
