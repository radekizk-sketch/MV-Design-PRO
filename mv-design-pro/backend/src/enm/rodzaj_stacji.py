"""Rodzaj stacji SN wyprowadzony z topologii — JEDNA reguła (karta ETYKIETA-STACJI-PRZELOTOWEJ).

Po co: rodzaj stacji (końcowa / przelotowa / odgałęźna / sekcyjna) liczyło w produkcie kilka
niezależnych reguł — schemat z liczby pól, drzewo projektu, karty, wyszukiwarka i inspektor
z deklarowanej danej `Substation.station_type`, a hierarchia z portów zewnętrznych. Projektant
widział tę samą stację jako „odgałęźną" na schemacie i „przelotową" w drzewie. Kanon
(`docs/sld/SLD_CAD_SPEC_V3.md` §19.3, decyzja V12K-034, Opcja A): rodzaj jest WYPROWADZANY
Z TOPOLOGII, a deklaracja `station_type` służy wyłącznie walidacji (ostrzeżenie o niezgodności,
kod walidatora `W043`).

Reguła (wyłącznie z JAWNYCH danych modelu, bez domysłu):
  R1 pole sprzęgła w rozdzielnicy SN ⇒ sekcyjna (sprzęgło dzieli szynę na sekcje niezależnie
     od liczby pól liniowych);
  R2 ≥ 3 pola liniowe (wejściowe, wyjściowe, odgałęźne) ⇒ odgałęźna;
  R3 2 pola liniowe ⇒ przelotowa, gdy stacja ma co najmniej dwa POŁĄCZONE wyprowadzenia
     (odcinek terenowy od szyny stacji prowadzi do innej stacji); inaczej końcowa — drugie
     pole jest wolne albo kończy się wiszącym odcinkiem (recenzja NO-GO właściciela
     2026-07-17 pkt 7: „przelotowa ⇔ oba pola liniowe POŁĄCZONE");
  R4 0–1 pole liniowe ⇒ końcowa.

Pola stacji: `meta.field_specs` (droga operacji i szablonów), a gdy stacja ich nie ma —
elementy `bays` stacji (modele sprzed specyfikacji pól); ten sam wybór co rysunek.
Rola pola: `meta.field_role` (rola kanoniczna / katalogowa), a gdy nierozpoznana — `bay_role`.
Rodzaj pola katalogowego (`bay_kind`) potrzeb własnych, rezerwowego i odgromnikowego przesądza
przed rolą: w katalogu rozdzielnic takie pola mają rolę modelu `FEEDER` (jak pole odgałęźne), ale
nie są polami liniowymi. Pole o roli nierozpoznanej NIE liczy się jako liniowe (walidator
zgłasza je kodem `W044`).

Rodzaj nie dotyczy rozdzielni źródłowej (GPZ) ani wolnostojącej rozdzielnicy nN.

Lustro frontendu: `frontend/src/ui/shared/rodzajStacji.ts` — parytet przypięty testem na każdej
stacji każdego modelu ENM z fikstur generowanych (`tests/reference_networks/
rodzaj_stacji_parytet.py`). Moduł-liść: biblioteka standardowa + `enm.tor_pola` (przynależność
szyn do stacji) + słownik nazw rodzajów.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from .slownik_komunikatow import NAZWY_RODZAJOW_STACJI_PL
from .tor_pola import szyny_stacji
from .zajetosc_pol import TYPY_ODCINKA_TERENOWEGO

RODZAJ_KONCOWA = "terminal"
RODZAJ_PRZELOTOWA = "inline"
RODZAJ_ODGALEZNA = "branch"
RODZAJ_SEKCYJNA = "sectional"
#: Rodzaje topologiczne stacji — te same wartości, co deklaracja `Substation.station_type`.
RODZAJE_STACJI: tuple[str, ...] = (
    RODZAJ_KONCOWA,
    RODZAJ_PRZELOTOWA,
    RODZAJ_ODGALEZNA,
    RODZAJ_SEKCYJNA,
)
#: Rodzaje stacji, których rodzaj topologiczny nie dotyczy (rozdzielnia źródłowa, rozdzielnica nN).
TYPY_STACJI_BEZ_RODZAJU: frozenset[str] = frozenset({"gpz", "rozdzielnica_nn"})
#: Deklaracje stacji SN/nN (transformatorowej): funkcja `mv_lv` bez wskazania rodzaju albo rodzaj
#: topologiczny. Dawniej kwalifikacja pętli zwarcia nN i zgodność OSD rozpoznawały stację SN/nN
#: wyłącznie po `mv_lv`, choć operacja wcięcia zapisuje rodzaj — stacje przelotowe, odgałęźne,
#: końcowe i sekcyjne wypadały z obu kontroli.
TYPY_STACJI_SN_NN: frozenset[str] = frozenset({"mv_lv", *RODZAJE_STACJI})

#: Kod walidatora: deklarowany rodzaj stacji niezgodny z rodzajem wyprowadzonym z topologii.
KOD_WALIDATORA_RODZAJ_NIEZGODNY = "W043"
#: Kanoniczny kod gotowości tego samego faktu (`domain/readiness_bridge.py`).
KOD_KANONICZNY_RODZAJ_NIEZGODNY = "station.kind_mismatch"
#: Kod walidatora: pole rozdzielnicy SN stacji o roli nierozpoznanej (nie liczy się do rodzaju).
KOD_WALIDATORA_ROLA_POLA_NIEROZPOZNANA = "W044"
#: Kanoniczny kod gotowości tego samego faktu.
KOD_KANONICZNY_ROLA_POLA_NIEROZPOZNANA = "station.field_role_unknown"

KATEGORIA_LINIOWE = "liniowe"
KATEGORIA_SPRZEGLO = "sprzeglo"
KATEGORIA_INNE = "inne"

#: Rola pola (kanoniczna, katalogowa albo rola modelu `bay_role`) → kategoria dla rodzaju stacji.
#: Lustro frontu: `KATEGORIA_ROLI_POLA` w `ui/shared/rodzajStacji.ts` (parytet testem).
KATEGORIA_ROLI_POLA: dict[str, str] = {
    "LINIA_IN": KATEGORIA_LINIOWE,
    "LINE_IN": KATEGORIA_LINIOWE,
    "IN": KATEGORIA_LINIOWE,
    "LINIA_OUT": KATEGORIA_LINIOWE,
    "LINE_OUT": KATEGORIA_LINIOWE,
    "OUT": KATEGORIA_LINIOWE,
    "LINIA_ODG": KATEGORIA_LINIOWE,
    "LINE_BRANCH": KATEGORIA_LINIOWE,
    "FEEDER": KATEGORIA_LINIOWE,
    "SPRZEGLO": KATEGORIA_SPRZEGLO,
    "COUPLER": KATEGORIA_SPRZEGLO,
    "TRANSFORMATOROWE": KATEGORIA_INNE,
    "TRANSFORMER": KATEGORIA_INNE,
    "TR": KATEGORIA_INNE,
    "POMIAROWE": KATEGORIA_INNE,
    "MEASUREMENT": KATEGORIA_INNE,
    "PV_SN": KATEGORIA_INNE,
    "PV": KATEGORIA_INNE,
    "OZE_PV": KATEGORIA_INNE,
    "BESS_SN": KATEGORIA_INNE,
    "BESS": KATEGORIA_INNE,
    "FW_SN": KATEGORIA_INNE,
    "FW": KATEGORIA_INNE,
    "FARMA_WIATROWA": KATEGORIA_INNE,
    "OZE": KATEGORIA_INNE,
}


#: Rodzaj pola katalogowego (`bay_kind`), który przesądza przed rolą modelu — pola z rolą
#: `FEEDER` w katalogu rozdzielnic, które NIE są polami liniowymi.
KATEGORIA_RODZAJU_POLA: dict[str, str] = {
    "potrzeb_wlasnych": KATEGORIA_INNE,
    "rezerwowe": KATEGORIA_INNE,
    "odgromnikowe": KATEGORIA_INNE,
}


@dataclass(frozen=True)
class PoleNierozpoznane:
    """Pole rozdzielnicy SN, którego rola nie jest rozpoznana (nie liczy się do rodzaju)."""

    field_ref: str
    nazwa: str | None
    rola: str


@dataclass(frozen=True)
class RodzajStacji:
    """Rodzaj jednej stacji wyprowadzony z topologii wraz z danymi, które o nim przesądziły."""

    station_ref: str
    station_name: str | None
    #: Rodzaj wyprowadzony (`RODZAJE_STACJI`).
    rodzaj: str
    #: Liczba pól liniowych rozdzielnicy SN (wejściowe, wyjściowe, odgałęźne).
    pola_liniowe: int
    #: Czy rozdzielnica ma pole sprzęgła.
    sprzeglo: bool
    #: Wyprowadzenia (odcinki terenowe od szyn stacji) prowadzące do innej stacji.
    wyprowadzenia_polaczone: int
    #: Deklaracja `station_type`, gdy jest rodzajem topologicznym; `None` — brak deklaracji
    #: rodzaju (np. `mv_lv`: stacja SN/nN bez wskazania rodzaju).
    deklaracja: str | None
    pola_nierozpoznane: tuple[PoleNierozpoznane, ...]

    @property
    def zgodny_z_deklaracja(self) -> bool:
        return self.deklaracja is None or self.deklaracja == self.rodzaj

    @property
    def nazwa_pl(self) -> str:
        return NAZWY_RODZAJOW_STACJI_PL[self.rodzaj]

    @property
    def przyczyna_pl(self) -> str:
        """Dlaczego stacja ma ten rodzaj — zdanie dla projektanta (liczba pól, sprzęgło)."""
        return przyczyna_rodzaju_pl(
            self.rodzaj, self.pola_liniowe, self.sprzeglo, self.wyprowadzenia_polaczone
        )


def _slownik(value: object) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _napis(value: object) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def liczba_pol_pl(liczba: int, przymiotnik: str = "liniowe") -> str:
    """„1 pole liniowe", „2 pola liniowe", „5 pól liniowych" (odmiana liczebnika)."""
    if liczba == 1:
        return f"1 pole {przymiotnik}"
    if liczba % 10 in (2, 3, 4) and liczba % 100 not in (12, 13, 14):
        return f"{liczba} pola {przymiotnik}"
    dopelniacz = przymiotnik[:-1] + "ych" if przymiotnik.endswith("e") else przymiotnik
    return f"{liczba} pól {dopelniacz}"


def przyczyna_rodzaju_pl(
    rodzaj: str, pola_liniowe: int, sprzeglo: bool, wyprowadzenia_polaczone: int
) -> str:
    """Przyczyna rodzaju w słowach projektanta — ta sama reguła, co `rodzaj_z_topologii`."""
    if rodzaj == RODZAJ_SEKCYJNA and sprzeglo:
        return "rozdzielnica SN ma pole sprzęgła sekcji"
    if rodzaj == RODZAJ_ODGALEZNA:
        return f"rozdzielnica SN ma {liczba_pol_pl(pola_liniowe)}"
    if rodzaj == RODZAJ_PRZELOTOWA:
        return "rozdzielnica SN ma 2 pola liniowe, oba prowadzą do sąsiednich stacji"
    if pola_liniowe == 2:
        prowadzi = "żadne nie prowadzi" if wyprowadzenia_polaczone == 0 else "tylko jedno prowadzi"
        return (
            f"rozdzielnica SN ma 2 pola liniowe, ale {prowadzi} do innej stacji "
            "(pole wolne albo zakończone wiszącym odcinkiem)"
        )
    if pola_liniowe == 0:
        return "rozdzielnica SN nie ma pól liniowych"
    return f"rozdzielnica SN ma {liczba_pol_pl(pola_liniowe)}"


def rodzaj_z_topologii(pola_liniowe: int, sprzeglo: bool, wyprowadzenia_polaczone: int) -> str:
    """Rodzaj stacji z cech topologii (R1–R4 w nagłówku modułu) — funkcja czysta."""
    if sprzeglo:
        return RODZAJ_SEKCYJNA
    if pola_liniowe >= 3:
        return RODZAJ_ODGALEZNA
    if pola_liniowe == 2:
        return RODZAJ_PRZELOTOWA if wyprowadzenia_polaczone >= 2 else RODZAJ_KONCOWA
    return RODZAJ_KONCOWA


def _rola_rozpoznana(wartosc: object) -> str | None:
    rola = _napis(wartosc)
    if rola is None:
        return None
    rola = rola.upper()
    return rola if rola in KATEGORIA_ROLI_POLA else None


def rola_pola(spec: Mapping[str, Any]) -> str | None:
    """Rola pola: `meta.field_role`, a gdy nierozpoznana — `bay_role` (None: nierozpoznana)."""
    return _rola_rozpoznana(_slownik(spec.get("meta")).get("field_role")) or _rola_rozpoznana(
        spec.get("bay_role")
    )


def kategoria_pola(spec: Mapping[str, Any]) -> str | None:
    """Kategoria pola dla rodzaju stacji: z rodzaju pola katalogowego (`bay_kind`, także
    w `meta`), a gdy ten nie przesądza — z roli (`rola_pola`). `None` — rola nierozpoznana."""
    for rodzaj in (spec.get("bay_kind"), _slownik(spec.get("meta")).get("bay_kind")):
        wartosc = _napis(rodzaj)
        if wartosc is not None and wartosc.lower() in KATEGORIA_RODZAJU_POLA:
            return KATEGORIA_RODZAJU_POLA[wartosc.lower()]
    rola = rola_pola(spec)
    return KATEGORIA_ROLI_POLA[rola] if rola is not None else None


def _pola_stacji(
    stacja: Mapping[str, Any], bays: Sequence[Mapping[str, Any]]
) -> list[Mapping[str, Any]]:
    """Pola SN stacji: specyfikacje pól (niepuste), a przy ich braku — elementy `bays` stacji."""
    specyfikacje = [
        spec
        for spec in _slownik(stacja.get("meta")).get("field_specs") or []
        if isinstance(spec, Mapping)
        and (
            _napis(spec.get("field_ref"))
            or _napis(spec.get("bus_ref"))
            or any(_napis(ref) for ref in spec.get("equipment_refs") or [])
        )
    ]
    if specyfikacje:
        return specyfikacje
    odnosniki = {r for r in (_napis(stacja.get("ref_id")), _napis(stacja.get("id"))) if r}
    return [bay for bay in bays if _napis(bay.get("substation_ref")) in odnosniki]


def _wyprowadzenia_polaczone(
    wlasne: frozenset[str],
    obce: frozenset[str],
    galezie: Sequence[Mapping[str, Any]],
) -> int:
    """Odcinki terenowe od szyn stacji, których drugi koniec prowadzi do szyny innej stacji.

    Wędrówka po grafie gałęzi (każdy rodzaj, bez względu na stan łącznika — struktura sieci,
    nie stan ruchowy) przez szyny nienależące do żadnej stacji (punkty rozgałęźne, słupy,
    końce odcinków); szyna innej stacji kończy wędrówkę sukcesem, szyna własnej — bez niego.
    """
    sasiedzi: dict[str, set[str]] = {}
    for galaz in galezie:
        a, b = _napis(galaz.get("from_bus_ref")), _napis(galaz.get("to_bus_ref"))
        if a and b and a != b:
            sasiedzi.setdefault(a, set()).add(b)
            sasiedzi.setdefault(b, set()).add(a)

    def prowadzi_do_innej_stacji(start: str) -> bool:
        odwiedzone = {start}
        do_odwiedzenia = [start]
        while do_odwiedzenia:
            szyna = do_odwiedzenia.pop()
            if szyna in obce:
                return True
            for nastepna in sorted(sasiedzi.get(szyna, ())):
                if nastepna not in odwiedzone and nastepna not in wlasne:
                    odwiedzone.add(nastepna)
                    do_odwiedzenia.append(nastepna)
        return False

    polaczone = 0
    for galaz in galezie:
        if galaz.get("type") not in TYPY_ODCINKA_TERENOWEGO:
            continue
        a, b = _napis(galaz.get("from_bus_ref")), _napis(galaz.get("to_bus_ref"))
        if a in wlasne and b and b not in wlasne:
            polaczone += prowadzi_do_innej_stacji(b)
        elif b in wlasne and a and a not in wlasne:
            polaczone += prowadzi_do_innej_stacji(a)
    return polaczone


def rodzaje_stacji(enm: Mapping[str, Any]) -> dict[str, RodzajStacji]:
    """Rodzaj KAŻDEJ stacji modelu, której rodzaj dotyczy (klucz: `ref_id`), deterministycznie."""
    stacje = [s for s in enm.get("substations") or [] if isinstance(s, Mapping)]
    galezie = [g for g in enm.get("branches") or [] if isinstance(g, Mapping)]
    bays = [b for b in enm.get("bays") or [] if isinstance(b, Mapping)]
    szyny: dict[str, frozenset[str]] = {
        str(_napis(s.get("ref_id"))): szyny_stacji(s, galezie)
        for s in stacje
        if _napis(s.get("ref_id"))
    }
    wynik: dict[str, RodzajStacji] = {}
    for stacja in stacje:
        ref = _napis(stacja.get("ref_id"))
        if ref is None or stacja.get("station_type") in TYPY_STACJI_BEZ_RODZAJU:
            continue
        liniowe = 0
        sprzeglo = False
        nierozpoznane: list[PoleNierozpoznane] = []
        for pole in _pola_stacji(stacja, bays):
            kategoria = kategoria_pola(pole)
            if kategoria is None:
                nierozpoznane.append(
                    PoleNierozpoznane(
                        field_ref=str(_napis(pole.get("field_ref")) or _napis(pole.get("ref_id"))),
                        nazwa=_napis(pole.get("name")),
                        rola=str(
                            _napis(_slownik(pole.get("meta")).get("field_role"))
                            or _napis(pole.get("bay_role"))
                            or ""
                        ),
                    )
                )
                continue
            liniowe += kategoria == KATEGORIA_LINIOWE
            sprzeglo = sprzeglo or kategoria == KATEGORIA_SPRZEGLO
        wlasne = szyny[ref]
        obce = frozenset().union(*(s for r, s in szyny.items() if r != ref))
        polaczone = (
            _wyprowadzenia_polaczone(wlasne, obce, galezie) if liniowe == 2 and not sprzeglo else 0
        )
        deklaracja = stacja.get("station_type")
        wynik[ref] = RodzajStacji(
            station_ref=ref,
            station_name=_napis(stacja.get("name")),
            rodzaj=rodzaj_z_topologii(liniowe, sprzeglo, polaczone),
            pola_liniowe=liniowe,
            sprzeglo=sprzeglo,
            wyprowadzenia_polaczone=polaczone,
            deklaracja=deklaracja if deklaracja in RODZAJE_STACJI else None,
            pola_nierozpoznane=tuple(nierozpoznane),
        )
    return dict(sorted(wynik.items()))


def rodzaj_stacji(enm: Mapping[str, Any], station_ref: str | None) -> RodzajStacji | None:
    """Rodzaj jednej stacji (None: brak stacji albo rodzaj jej nie dotyczy)."""
    if not station_ref:
        return None
    return rodzaje_stacji(enm).get(station_ref)


def rodzaj_ze_skladu_pol(role_pol: Sequence[object], *, polaczone_wyprowadzenia: int) -> str:
    """Rodzaj stacji ze SKŁADU pól (szablon, kreator) i liczby połączonych wyprowadzeń —
    ta sama reguła (`rodzaj_z_topologii`) dla stacji jeszcze nieosadzonej w modelu. Wpis składu
    to rola pola albo rodzaj pola katalogowego (`potrzeb_wlasnych`, `rezerwowe`…)."""
    liniowe = 0
    sprzeglo = False
    for wartosc in role_pol:
        tekst = _napis(wartosc)
        kategoria = (
            KATEGORIA_RODZAJU_POLA.get(tekst.lower())
            if tekst is not None and tekst.lower() in KATEGORIA_RODZAJU_POLA
            else (KATEGORIA_ROLI_POLA[r] if (r := _rola_rozpoznana(wartosc)) else None)
        )
        if kategoria is None:
            continue
        liniowe += kategoria == KATEGORIA_LINIOWE
        sprzeglo = sprzeglo or kategoria == KATEGORIA_SPRZEGLO
    return rodzaj_z_topologii(liniowe, sprzeglo, polaczone_wyprowadzenia)
