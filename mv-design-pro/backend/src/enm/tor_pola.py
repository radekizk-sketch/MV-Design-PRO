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

Obok reguły naruszenia moduł jest jedynym źródłem pytań konsumentów zasady toru:
  * `pola_z_zaciskiem_szyny` / `wolne_pole_szyny` — punkt przyłączenia nowego elementu
    wskazanego szyną główną stacji (operacje budowy: transformator, pierścień, ciąg);
  * `szyny_stacji` / `szyna_glowna_stacji` — przynależność szyny do stacji (zaciski pól SN
    i szyny za aparatami pól nN należą do stacji, choć nie są jej szynami głównymi).

Moduł-liść: biblioteka standardowa + `enm.zajetosc_pol` (liść) + stała znacznika promocji pól
nN; operuje na słowniku ENM (postać operacji domenowych i migawki biegu), a funkcje
przynależności także na obiektach modelu.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from .migrations.nn_field_specs_promocja import META_KLUCZ_GALAZ_ZRODLO_FIELD_REF
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
        # Za polem wejściowym; skład bez pola wejściowego (nie wymagano go) — na początku.
        pozycja = 0
        if ROLA_POLA_WE in role:
            pozycja = role.index(ROLA_POLA_WE) + 1
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


def _atrybut(obiekt: object, klucz: str) -> Any:
    """Pole elementu modelu — słownik migawki albo obiekt `EnergyNetworkModel`."""
    if isinstance(obiekt, Mapping):
        return obiekt.get(klucz)
    return getattr(obiekt, klucz, None)


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


def _pola_z_zaciskiem_wg_szyny(stacja: Mapping[str, Any]) -> dict[str, list[Mapping[str, Any]]]:
    """Pola stacji z WŁASNYM zaciskiem (różnym od szyny pola), pogrupowane po szynie pola."""
    pola_szyny: dict[str, list[Mapping[str, Any]]] = {}
    for spec in _slownik(stacja.get("meta")).get("field_specs") or []:
        if not isinstance(spec, Mapping):
            continue
        szyna_pola = _napis(spec.get("bus_ref"))
        zacisk = zacisk_pola(spec)
        if szyna_pola and zacisk and zacisk != szyna_pola and _napis(spec.get("field_ref")):
            pola_szyny.setdefault(szyna_pola, []).append(spec)
    return pola_szyny


def pola_z_zaciskiem_szyny(enm: Mapping[str, Any], szyna_ref: str) -> list[Mapping[str, Any]]:
    """Pola z własnym zaciskiem stojące na SZYNIE GŁÓWNEJ stacji `szyna_ref` (kolejność danych).

    Pusta lista = szyna nie jest szyną główną stacji z polami (szyna goła, sieć bez
    rozdzielnicy z polami) — zasada toru nie ma tam pola, przez które element mógłby przejść.
    """
    for stacja in enm.get("substations") or []:
        if not isinstance(stacja, Mapping):
            continue
        if szyna_ref not in (stacja.get("bus_refs") or []):
            continue
        pola = _pola_z_zaciskiem_wg_szyny(stacja).get(szyna_ref)
        if pola:
            return pola
    return []


def wolne_pole_szyny(
    enm: Mapping[str, Any], szyna_ref: str, role: tuple[str, ...]
) -> Mapping[str, Any] | None:
    """Pierwsze WOLNE pole z `role` na szynie głównej `szyna_ref` (reguła jak w walidatorze:
    zacisk pola nie niesie żadnego elementu mocy) — punkt przyłączenia nowego elementu."""
    return _wolne_pole(
        pola_z_zaciskiem_szyny(enm, szyna_ref), role, elementy_mocy_na_szynach(enm), set()
    )


def _naruszenia_stacji(
    stacja: Mapping[str, Any],
    galezie: list[Mapping[str, Any]],
    transformatory: list[Mapping[str, Any]],
    elementy_na_szynach: Mapping[str, set[str]],
) -> list[NaruszenieToru]:
    station_ref = _napis(stacja.get("ref_id")) or ""
    szyny_glowne = {s for s in (stacja.get("bus_refs") or []) if _napis(s)}
    pola_szyny = _pola_z_zaciskiem_wg_szyny(stacja)
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


# ---------------------------------------------------------------------------
# Przynależność szyn do stacji (konsumenci zasady toru)
# ---------------------------------------------------------------------------


def _aparaty_pol_nn_stacji(stacja: object, galezie: Sequence[object]) -> list[object]:
    """Aparaty pól nN stacji utworzone promocją `nn_field_specs` (znacznik gałęzi)."""
    meta = _slownik(_atrybut(stacja, "meta"))
    pola_nn = {
        str(spec.get("field_ref"))
        for spec in meta.get("nn_field_specs") or []
        if isinstance(spec, Mapping) and _napis(spec.get("field_ref"))
    }
    if not pola_nn:
        return []
    return [
        galaz
        for galaz in galezie
        if _slownik(_atrybut(galaz, "meta")).get(META_KLUCZ_GALAZ_ZRODLO_FIELD_REF) in pola_nn
    ]


def szyny_stacji(stacja: object, galezie: Sequence[object]) -> frozenset[str]:
    """Szyny NALEŻĄCE do stacji — JEDNO źródło dla każdego pytania „do której stacji należy
    ta szyna" (karta POLA-W-TORZE, inwentarz konsumentów).

    Zasada toru przenosi elementy stacji z szyny głównej na zaciski pól, a zacisk pola nie
    jest szyną główną (`Substation.bus_refs`). Szyny stacji to więc: szyny główne, WŁASNE
    zaciski pól SN (`meta.field_specs`) i szyny za aparatami pól nN (promocja
    `nn_field_specs` — zacisk wyłącznika głównego nN, szyny odpływów i pól źródeł).
    `stacja` i `galezie` — słowniki migawki albo obiekty modelu.
    """
    wynik = {s for s in (_atrybut(stacja, "bus_refs") or []) if _napis(s)}
    for pola in _pola_z_zaciskiem_wg_szyny({"meta": _slownik(_atrybut(stacja, "meta"))}).values():
        wynik.update(str(zacisk_pola(spec)) for spec in pola)
    for aparat in _aparaty_pol_nn_stacji(stacja, galezie):
        for koniec in ("from_bus_ref", "to_bus_ref"):
            szyna = _napis(_atrybut(aparat, koniec))
            if szyna:
                wynik.add(szyna)
    return frozenset(wynik)


def szyna_glowna_stacji(stacja: object, galezie: Sequence[object], szyna_ref: str) -> str | None:
    """Szyna GŁÓWNA stacji, na której stoi pole prowadzące do `szyna_ref`: sama `szyna_ref`,
    gdy jest szyną główną; szyna pola, gdy `szyna_ref` jest własnym zaciskiem pola SN; szyna
    aparatu pola nN, gdy `szyna_ref` leży za aparatem pola nN (np. strona dolna transformatora
    na zacisku wyłącznika głównego nN — szyną rozdzielnicy nN jest szyna po drugiej stronie
    wyłącznika). `None` — szyna nie należy do stacji."""
    glowne = [s for s in (_atrybut(stacja, "bus_refs") or []) if _napis(s)]
    if szyna_ref in glowne:
        return szyna_ref
    for szyna_pola, pola in _pola_z_zaciskiem_wg_szyny(
        {"meta": _slownik(_atrybut(stacja, "meta"))}
    ).items():
        if any(zacisk_pola(spec) == szyna_ref for spec in pola):
            return szyna_pola
    for aparat in _aparaty_pol_nn_stacji(stacja, galezie):
        poczatek, koniec = _atrybut(aparat, "from_bus_ref"), _atrybut(aparat, "to_bus_ref")
        if koniec == szyna_ref and poczatek in glowne:
            return str(poczatek)
    return None


# ---------------------------------------------------------------------------
# Punkt zwarcia na zacisku pola (konsumenci wyniku zwarciowego)
# ---------------------------------------------------------------------------

#: Rodzaje gałęzi łączeniowych — zamknięty łącznik SCALA szyny w jeden węzeł elektryczny.
#: Zbiór równy `enm.topology.TYPY_LACZNIKOW_ENM` (przypięte testem; import stamtąd zamknąłby
#: cykl — `enm.topology` czyta przynależność szyn z tego modułu).
TYPY_LACZNIKOW: frozenset[str] = frozenset(
    {"switch", "breaker", "bus_coupler", "disconnector", "fuse"}
)
#: Znacznik szyny pomocniczej — nie jest celem zwarcia (`enm/assembler.py`).
ZNACZNIK_SZYNY_POMOCNICZEJ = "helper_bus"


def wezel_elektryczny(enm: Mapping[str, Any], szyna_ref: str) -> frozenset[str]:
    """Szyny połączone z `szyna_ref` ZAMKNIĘTYMI łącznikami (zero impedancji) — jeden węzeł
    elektryczny, tak jak scala go solver zwarciowy. Zacisk pola z zamkniętym aparatem należy
    do węzła szyny pola; otwarty aparat pola rozdziela węzły."""
    sasiedzi: dict[str, set[str]] = {}
    for galaz in enm.get("branches") or []:
        if not isinstance(galaz, Mapping) or galaz.get("type") not in TYPY_LACZNIKOW:
            continue
        if galaz.get("status", "closed") != "closed":
            continue
        a, b = _napis(galaz.get("from_bus_ref")), _napis(galaz.get("to_bus_ref"))
        if a and b:
            sasiedzi.setdefault(a, set()).add(b)
            sasiedzi.setdefault(b, set()).add(a)
    wezel = {szyna_ref}
    do_odwiedzenia = [szyna_ref]
    while do_odwiedzenia:
        for nastepna in sorted(sasiedzi.get(do_odwiedzenia.pop(), ())):
            if nastepna not in wezel:
                wezel.add(nastepna)
                do_odwiedzenia.append(nastepna)
    return frozenset(wezel)


def szyna_raportowa(enm: Mapping[str, Any], szyna_ref: str) -> str:
    """Szyna, pod którą wynik zwarciowy raportuje węzeł `szyna_ref`: ona sama, gdy nie jest
    pomocnicza; dla zacisku pola (szyna pomocnicza) — szyna niepomocnicza tego samego węzła
    elektrycznego (pierwsza w porządku identyfikatorów). Zwarcie na zacisku pola za zamkniętym
    aparatem to zwarcie na szynie pola — ten sam węzeł, ten sam prąd. Węzeł bez szyny
    niepomocniczej (aparat otwarty) — sama `szyna_ref` (wynik jej nie raportuje: odmowa
    konsumenta, bez domysłu)."""
    pomocnicze = {
        str(szyna.get("ref_id"))
        for szyna in enm.get("buses") or []
        if isinstance(szyna, Mapping) and ZNACZNIK_SZYNY_POMOCNICZEJ in (szyna.get("tags") or [])
    }
    if szyna_ref not in pomocnicze:
        return szyna_ref
    raportowe = sorted(s for s in wezel_elektryczny(enm, szyna_ref) if s not in pomocnicze)
    return raportowe[0] if raportowe else szyna_ref
