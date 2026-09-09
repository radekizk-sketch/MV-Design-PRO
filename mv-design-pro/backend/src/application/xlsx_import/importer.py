"""
Import sieci SN z arkusza XLSX — ODCZYT I WALIDACJA (bez zapisu).

Format arkusza (uzgodniony z operatorami sieci):
- Arkusz "Szyny"    (wymagany):  id, nazwa, napięcie_kV
- Arkusz "Linie"    (wymagany):  id, szyna_pocz, szyna_kon, typ, długość_km
                                 + DOKŁADNIE JEDNA droga do typu przewodu (W1):
                                 (a) typ_katalogowy — identyfikator typu z katalogu
                                     statycznego; wartości podane obok (R_ohm_km, X_ohm_km,
                                     I_dop_A, Un_kV) muszą się z nim zgadzać (jedna prawda),
                                 (b) pełna tabliczka przewodu: rodzaj (LINIA|KABEL), R_ohm_km,
                                     X_ohm_km, Un_kV, I_dop_A oraz dla LINIA: B_uS_km
                                     [T_max_C, przekroj_mm2 mogą być puste — dana nieznana
                                     z definicji źródła]; dla KABEL: C_nF_km, T_max_C,
                                     przekroj_mm2, zyly — z tabliczki powstaje pozycja
                                     KATALOGU PROJEKTU (`enm/katalog_projektu.py`)
- Arkusz "Trafo"    (opcjonalny): id, szyna_HV, szyna_LV + (a) typ_katalogowy ALBO
                                 (b) tabliczka: Sn_MVA, uk_pct, Pk_kW, grupa, zaczep_min,
                                 zaczep_max, zaczep_krok_pct [U_HV_kV, U_LV_kV — puste =
                                 napięcia szyn; przyjęcie nazwane w ostrzeżeniu i w rekordzie
                                 typu, nigdy ciche]
- Arkusz "Źródła"   (opcjonalny): id, szyna, typ, RX_ratio + (Sk_MVA i/lub Ik_kA — co
                                 najmniej jedna z tych dwu kolumn scenariusza MAX) [opcjonalnie
                                 scenariusz MIN wg IEC 60909-0:2016 §6.2.1 eq. 6 z c_min —
                                 CV-4.3 K7: Sk_min_MVA, Ik_min_kA, RX_min; U_pu — napięcie
                                 zadane szyny bilansującej w p.u. (0,8–1,2), puste = 1,0]
- Arkusz "Odbiory"  (opcjonalny): id, szyna, P_MW, Q_Mvar

ZASADY:
- ZERO FIZYKI. Ten moduł NIE liczy żadnej wielkości elektrycznej. Dane źródła
  (Sk'', Ik'', R/X) trafiają do modelu jako DANE WEJŚCIOWE w kanonicznym kształcie
  (`manual_equivalent` operacji `add_grid_source_sn` — jak w kreatorze sieci);
  impedancję zastępczą liczy warstwa solverowa.
- ZERO ZGADYWANIA. Nazwa handlowa z arkusza (kolumna `typ`) NIE jest dopasowywana
  do katalogu po podobieństwie. Typ elementu pochodzi WYŁĄCZNIE z jawnej kolumny
  `typ_katalogowy` albo z pełnej tabliczki w wierszu. Element bez żadnej z tych dróg
  to BŁĄD WIERSZA — nie „bramka do domapowania później": element bez typu nie ma
  parametrów, a model bez parametrów nie jest modelem (mapa domknięcia W1, K-A/K-C).
- ZERO WARTOŚCI FIKCYJNYCH. Żadna dana tabliczki nie ma wartości domyślnej: brak
  obciążalności nie staje się 0 A, brak grupy połączeń nie staje się Dyn11, brak
  susceptancji nie staje się 0. Brakująca kolumna tabliczki = błąd wiersza z nazwą
  kolumny. Jedyne przyjęcia (U_HV/U_LV transformatora z napięć szyn) są NAZWANE w
  ostrzeżeniu i zapisane w rekordzie typu (`verification_note`).
- JEDNA PRAWDA. Wartość podana w arkuszu obok `typ_katalogowy` musi być równa polu
  typu; rozjazd jest błędem wiersza, nie cichym nadpisaniem w żadną stronę.
- Błędy są strukturalne (arkusz/wiersz/kolumna/komunikat) — front pokazuje je
  przy wierszu, bez parsowania arkusza w przeglądarce.
- Wynik odczytu (`SiecZArkusza`) to rekordy dla KOMPILATORA GRAFU
  (`enm/kompilator_grafu.py`), który buduje model wyłącznie operacjami domenowymi —
  tą samą drogą, którą sieć powstaje klik po kliku w kreatorach. Importer nie zna
  żadnej warstwy trwałości.
- CV-4.3 K7 (dane zwarciowe scenariusza MIN): kolumny `Sk_min_MVA`/`Ik_min_kA`/`RX_min`
  są OPCJONALNE — puste = klucz pominięty w rekordzie (IEC 60909-0:2016 §6.2.1 eq. 6
  z c_min; brak danych MIN = biegi scenariusza MIN liczą się z impedancji dla S''kQmax,
  założenie jawnie oznaczone kodem `source.sk_min_missing` w warstwie domenowej).
  Sprzeczność danych (Sk_min_MVA > Sk_MVA, Ik_min_kA > Ik_kA, RX_min bez własnej mocy
  zwarciowej MIN) NIE jest tu twardym błędem odrzucającym import — importer POKAZUJE ją
  jako ostrzeżenie (rozstrzygnięcie należy do warstwy domenowej, która dane konsumuje).
  Kolumna `Sk_MVA` jest opcjonalna: źródło wymaga co najmniej jednej z `Sk_MVA`/`Ik_kA`
  (tryb prądowy — I''kQ jako jedyna dana zwarciowa — jest policzalny, jak w kreatorze).
"""

from __future__ import annotations

import io
import re
from dataclasses import dataclass, field
from typing import Any

from enm.katalog_projektu import STATUS_KATALOGU_PROJEKTU, STATUS_WERYFIKACJI_ARKUSZA
from enm.zrodlo_zwarcie import PASMO_U_SET_PU, u_set_pu_w_pasmie
from network_model.catalog.repository import CatalogRepository, get_default_mv_catalog

# Nazwy arkuszy i kolumn — jedyne zrodlo prawdy formatu (uzywane tez przez API/dokumentacje).
ARKUSZ_SZYNY = "Szyny"
ARKUSZ_LINIE = "Linie"
ARKUSZ_TRAFO = "Trafo"
ARKUSZ_ZRODLA = "Źródła"
ARKUSZ_ODBIORY = "Odbiory"

ARKUSZE_WYMAGANE: tuple[str, ...] = (ARKUSZ_SZYNY, ARKUSZ_LINIE)
ARKUSZE_OPCJONALNE: tuple[str, ...] = (ARKUSZ_TRAFO, ARKUSZ_ZRODLA, ARKUSZ_ODBIORY)


class XlsxValidationError(Exception):
    """Blad walidacji importu XLSX."""

    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__(f"Błędy walidacji importu XLSX: {len(errors)} błędów")


@dataclass(frozen=True)
class BladArkusza:
    """Pojedyncze zastrzezenie do zawartosci arkusza.

    `wiersz` = None oznacza zastrzezenie do calego arkusza (np. brak kolumny),
    `kolumna` = None oznacza zastrzezenie do calego wiersza (np. brak szyny docelowej).
    """

    arkusz: str
    komunikat: str
    wiersz: int | None = None
    kolumna: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "arkusz": self.arkusz,
            "wiersz": self.wiersz,
            "kolumna": self.kolumna,
            "komunikat": self.komunikat,
        }

    def jako_tekst(self) -> str:
        czesci = [f"Arkusz '{self.arkusz}'"]
        if self.wiersz is not None:
            czesci.append(f"wiersz {self.wiersz}")
        if self.kolumna is not None:
            czesci.append(f"kolumna '{self.kolumna}'")
        return f"{', '.join(czesci)}: {self.komunikat}"


@dataclass(frozen=True)
class SiecZArkusza:
    """Zawartość arkusza przełożona na rekordy dla kompilatora grafu (bez zapisu).

    Rekordy są słownikami o kluczach kompilatora (`enm/kompilator_grafu.py`: `SzynaSpec`,
    `EdgeSpec`, `TransformatorSpec`, `ZrodloSpec`, `OdbiorSpec`); `typy_projektu` to
    sekcja `katalog_projektu` modelu (`enm/katalog_projektu.py`) — pozycje powstałe z
    tabliczek arkusza, do których odwołują się `catalog_ref` odcinków/transformatorów.
    Każdy rekord niesie `wiersz` arkusza (proweniencja do komunikatów kompilatora).
    """

    wezly: list[dict[str, Any]] = field(default_factory=list)
    galezie: list[dict[str, Any]] = field(default_factory=list)
    transformatory: list[dict[str, Any]] = field(default_factory=list)
    zrodla: list[dict[str, Any]] = field(default_factory=list)
    odbiory: list[dict[str, Any]] = field(default_factory=list)
    typy_projektu: dict[str, list[dict[str, Any]]] = field(default_factory=dict)


@dataclass
class XlsxImportResult:
    """Wynik odczytu arkusza (bez zapisu)."""

    success: bool
    siec: SiecZArkusza | None = None
    bus_count: int = 0
    branch_count: int = 0
    source_count: int = 0
    load_count: int = 0
    trafo_count: int = 0
    warnings: list[str] = field(default_factory=list)
    bledy: list[BladArkusza] = field(default_factory=list)
    #: Identyfikatory elementów, których typ powstał z tabliczki arkusza (pozycja
    #: katalogu projektu o statusie NIEWERYFIKOWANY) — projektant ma je zweryfikować.
    elementy_typow_projektu: list[str] = field(default_factory=list)

    @property
    def errors(self) -> list[str]:
        """Błędy jako płaskie komunikaty (zgodność z dotychczasowym kontraktem API)."""
        return [blad.jako_tekst() for blad in self.bledy]

    def to_dict(self) -> dict[str, Any]:
        return {
            "success": self.success,
            "bus_count": self.bus_count,
            "branch_count": self.branch_count,
            "source_count": self.source_count,
            "load_count": self.load_count,
            "trafo_count": self.trafo_count,
            "warnings": self.warnings,
            "errors": self.errors,
            "bledy": [blad.to_dict() for blad in self.bledy],
            "elementy_typow_projektu": self.elementy_typow_projektu,
        }


class XlsxNetworkImporter:
    """Odczyt sieci SN z arkusza Excel.

    Użycie:
        importer = XlsxNetworkImporter()
        wynik = importer.import_from_bytes(xlsx_bytes, nazwa_pliku="siec.xlsx")
        if wynik.success:
            siec = wynik.siec  # rekordy dla kompilatora grafu (XlsxImportService)
    """

    REQUIRED_SHEETS = set(ARKUSZE_WYMAGANE)
    OPTIONAL_SHEETS = set(ARKUSZE_OPCJONALNE)

    BUS_COLUMNS: dict[str, type] = {"id": str, "nazwa": str, "napięcie_kV": float}
    LINE_COLUMNS: dict[str, type] = {
        "id": str,
        "szyna_pocz": str,
        "szyna_kon": str,
        "typ": str,
        "długość_km": float,
    }
    # W1: odcinek wiąże się z typem KATALOGU (`typ_katalogowy`) ALBO niesie pełną tabliczkę
    # przewodu, z której powstaje pozycja katalogu PROJEKTU (`enm/katalog_projektu.py`).
    # Nie ma trzeciej drogi: parametr wpisany wprost do elementu byłby wstrzyknięciem
    # z pominięciem katalogu (reguła 10), a brakująca dana podstawiona zerem — fabrykacją.
    LINE_OPTIONAL_COLUMNS: dict[str, type] = {
        "typ_katalogowy": str,
        "rodzaj": str,  # LINIA (napowietrzna) | KABEL — wymagane bez typu katalogowego
        "R_ohm_km": float,
        "X_ohm_km": float,
        "B_uS_km": float,  # LINIA: susceptancja doziemna
        "C_nF_km": float,  # KABEL: pojemność robocza
        "Un_kV": float,  # napięcie znamionowe przewodu (tabliczka), nie napięcie szyny
        "I_dop_A": float,  # obciążalność długotrwała
        "T_max_C": float,  # LINIA: może być puste (dana nieznana z definicji źródła)
        "przekroj_mm2": float,  # LINIA: może być puste; KABEL: wymagane
        "zyly": float,  # KABEL: liczba żył (1 albo 3)
    }
    TRAFO_COLUMNS: dict[str, type] = {"id": str, "szyna_HV": str, "szyna_LV": str}
    TRAFO_OPTIONAL_COLUMNS: dict[str, type] = {
        "typ_katalogowy": str,
        "Sn_MVA": float,
        "uk_pct": float,
        "Pk_kW": float,
        "grupa": str,
        "zaczep_min": float,
        "zaczep_max": float,
        "zaczep_krok_pct": float,
        "U_HV_kV": float,  # puste = napięcie szyny HV (przyjęcie nazwane w rekordzie typu)
        "U_LV_kV": float,  # puste = napięcie szyny LV (j.w.)
    }
    SOURCE_COLUMNS: dict[str, type] = {
        "id": str,
        "szyna": str,
        "typ": str,
        "RX_ratio": float,
    }
    # `Sk_MVA` opcjonalna (CV-4.3 K7): zrodlo wymaga co najmniej Sk_MVA albo Ik_kA
    # (tryb pradowy) — sprawdzane w `_waliduj_wartosci`, nie na poziomie kolumn
    # wymaganych (arkusz bez ZADNEJ z dwoch kolumn nadal ma czytelna strukture).
    SOURCE_OPTIONAL_COLUMNS: dict[str, type] = {
        "Sk_MVA": float,
        "Ik_kA": float,
        "Sk_min_MVA": float,
        "Ik_min_kA": float,
        "RX_min": float,
        # Napięcie zadane szyny bilansującej [p.u. Un szyny]; puste = 1,0 (znamionowe).
        "U_pu": float,
    }
    LOAD_COLUMNS: dict[str, type] = {
        "id": str,
        "szyna": str,
        "P_MW": float,
        "Q_Mvar": float,
    }

    def __init__(self, catalog: CatalogRepository | None = None) -> None:
        self._catalog = catalog

    def _katalog(self) -> CatalogRepository:
        if self._catalog is None:
            self._catalog = get_default_mv_catalog()
        return self._catalog

    # ------------------------------------------------------------------
    # Wejscie glowne
    # ------------------------------------------------------------------

    def import_from_bytes(self, data: bytes, nazwa_pliku: str | None = None) -> XlsxImportResult:
        """Odczytaj sieć z bajtów pliku XLSX.

        `nazwa_pliku` wchodzi WYŁĄCZNIE do proweniencji pozycji katalogu projektu
        (`source_reference = arkusz:<plik>#<arkusz>:<wiersz>`).
        """
        import openpyxl  # zaleznosc glowna (pyproject) — brak = blad srodowiska, nie danych

        try:
            wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        except Exception as e:
            return XlsxImportResult(
                success=False,
                bledy=[
                    BladArkusza(
                        arkusz="—",
                        komunikat=(
                            "Nie można otworzyć pliku jako arkusza XLSX "
                            f"(plik uszkodzony lub w innym formacie): {e}"
                        ),
                    )
                ],
            )

        try:
            bledy: list[BladArkusza] = []
            ostrzezenia: list[str] = []

            nazwy_arkuszy = set(wb.sheetnames)
            for wymagany in ARKUSZE_WYMAGANE:
                if wymagany not in nazwy_arkuszy:
                    bledy.append(
                        BladArkusza(
                            arkusz=wymagany,
                            komunikat="Brak wymaganego arkusza w pliku",
                        )
                    )
            if bledy:
                return XlsxImportResult(success=False, bledy=bledy)

            # RAPORT ZBIORCZY: parsowanie NIE przerywa pracy przy pierwszym potknieciu.
            # Wiersz z bledna komorka jest pomijany, ale pozostale wiersze i pozostale
            # arkusze sa czytane dalej, a walidacje krzyzowe biegna na tym, co sie
            # odczytalo. Inaczej projektant poprawia arkusz w ping-pongu: jeden blad na
            # wyslanie. Przerwanie zostaje TYLKO dla braku arkusza/kolumny — bez kolumny
            # nie ma czego walidowac.
            struktura_ok = True
            szyny, ok = self._parse_sheet(
                wb[ARKUSZ_SZYNY], self.BUS_COLUMNS, {}, ARKUSZ_SZYNY, bledy
            )
            struktura_ok &= ok
            linie, ok = self._parse_sheet(
                wb[ARKUSZ_LINIE],
                self.LINE_COLUMNS,
                self.LINE_OPTIONAL_COLUMNS,
                ARKUSZ_LINIE,
                bledy,
            )
            struktura_ok &= ok
            trafo: list[dict[str, Any]] = []
            if ARKUSZ_TRAFO in nazwy_arkuszy:
                trafo, ok = self._parse_sheet(
                    wb[ARKUSZ_TRAFO],
                    self.TRAFO_COLUMNS,
                    self.TRAFO_OPTIONAL_COLUMNS,
                    ARKUSZ_TRAFO,
                    bledy,
                )
                struktura_ok &= ok
            zrodla: list[dict[str, Any]] = []
            if ARKUSZ_ZRODLA in nazwy_arkuszy:
                zrodla, ok = self._parse_sheet(
                    wb[ARKUSZ_ZRODLA],
                    self.SOURCE_COLUMNS,
                    self.SOURCE_OPTIONAL_COLUMNS,
                    ARKUSZ_ZRODLA,
                    bledy,
                )
                struktura_ok &= ok
            odbiory: list[dict[str, Any]] = []
            if ARKUSZ_ODBIORY in nazwy_arkuszy:
                odbiory, ok = self._parse_sheet(
                    wb[ARKUSZ_ODBIORY], self.LOAD_COLUMNS, {}, ARKUSZ_ODBIORY, bledy
                )
                struktura_ok &= ok
        finally:
            wb.close()

        if not struktura_ok:
            return XlsxImportResult(success=False, bledy=bledy)

        bledy.extend(self._waliduj_powiazania(szyny, linie, trafo, zrodla, odbiory))
        bledy.extend(self._waliduj_wartosci(szyny, linie, trafo, zrodla))
        bledy.extend(self._waliduj_typy(linie, trafo))

        if bledy:
            return XlsxImportResult(success=False, bledy=bledy)

        siec, elementy_typow_projektu = self._zbuduj_rekordy(
            szyny, linie, trafo, zrodla, odbiory, ostrzezenia, nazwa_pliku
        )

        return XlsxImportResult(
            success=True,
            siec=siec,
            bus_count=len(szyny),
            branch_count=len(linie) + len(trafo),
            source_count=len(zrodla),
            load_count=len(odbiory),
            trafo_count=len(trafo),
            warnings=ostrzezenia,
            elementy_typow_projektu=elementy_typow_projektu,
        )

    # ------------------------------------------------------------------
    # Odczyt arkusza
    # ------------------------------------------------------------------

    def _parse_sheet(
        self,
        sheet: Any,
        kolumny: dict[str, type],
        kolumny_opcjonalne: dict[str, type],
        nazwa_arkusza: str,
        bledy: list[BladArkusza],
    ) -> tuple[list[dict[str, Any]], bool]:
        """Odczytaj arkusz do listy rekordow.

        Returns:
            (rekordy poprawnych wierszy, czy STRUKTURA arkusza jest czytelna).
            Struktura nieczytelna (pusty arkusz, brak kolumny) => dalsze walidacje
            krzyzowe nie maja sensu i wolajacy przerywa.
        """
        wiersze = list(sheet.iter_rows(min_row=1, values_only=True))
        if not wiersze:
            bledy.append(BladArkusza(arkusz=nazwa_arkusza, komunikat="Arkusz jest pusty"))
            return [], False

        naglowki = [str(h).strip() if h is not None else "" for h in wiersze[0]]

        brakujace = [nazwa for nazwa in kolumny if nazwa not in naglowki]
        for nazwa in brakujace:
            bledy.append(
                BladArkusza(
                    arkusz=nazwa_arkusza,
                    kolumna=nazwa,
                    komunikat="Brak wymaganej kolumny w nagłówku arkusza",
                )
            )
        if brakujace:
            return [], False

        indeksy = {nazwa: naglowki.index(nazwa) for nazwa in kolumny}
        indeksy_opcjonalne = {
            nazwa: naglowki.index(nazwa) for nazwa in kolumny_opcjonalne if nazwa in naglowki
        }

        wiersze_danych = wiersze[1:]
        if not any(self._wiersz_niepusty(w) for w in wiersze_danych):
            bledy.append(
                BladArkusza(
                    arkusz=nazwa_arkusza,
                    komunikat="Arkusz nie zawiera żadnego wiersza danych (sam nagłówek)",
                )
            )
            return [], False

        rekordy: list[dict[str, Any]] = []
        for numer_wiersza, wiersz in enumerate(wiersze_danych, start=2):
            if not self._wiersz_niepusty(wiersz):
                continue  # pusty wiersz separujacy — pomijany, nie jest bledem danych

            rekord: dict[str, Any] = {}
            wiersz_poprawny = True

            for nazwa, typ_kolumny in kolumny.items():
                wartosc = self._komorka(wiersz, indeksy[nazwa])
                if wartosc is None:
                    bledy.append(
                        BladArkusza(
                            arkusz=nazwa_arkusza,
                            wiersz=numer_wiersza,
                            kolumna=nazwa,
                            komunikat="Pusta wartość w wymaganej kolumnie",
                        )
                    )
                    wiersz_poprawny = False
                    continue
                przekonwertowana = self._konwertuj(wartosc, typ_kolumny)
                if przekonwertowana is None:
                    bledy.append(
                        BladArkusza(
                            arkusz=nazwa_arkusza,
                            wiersz=numer_wiersza,
                            kolumna=nazwa,
                            komunikat=(
                                f"Nieprawidłowa wartość '{wartosc}' — "
                                f"oczekiwano: {self._nazwa_typu(typ_kolumny)}"
                            ),
                        )
                    )
                    wiersz_poprawny = False
                    continue
                rekord[nazwa] = przekonwertowana

            for nazwa, typ_kolumny in kolumny_opcjonalne.items():
                if nazwa not in indeksy_opcjonalne:
                    continue
                wartosc = self._komorka(wiersz, indeksy_opcjonalne[nazwa])
                if wartosc is None:
                    continue
                przekonwertowana = self._konwertuj(wartosc, typ_kolumny)
                if przekonwertowana is None:
                    bledy.append(
                        BladArkusza(
                            arkusz=nazwa_arkusza,
                            wiersz=numer_wiersza,
                            kolumna=nazwa,
                            komunikat=(
                                f"Nieprawidłowa wartość '{wartosc}' — "
                                f"oczekiwano: {self._nazwa_typu(typ_kolumny)}"
                            ),
                        )
                    )
                    wiersz_poprawny = False
                    continue
                rekord[nazwa] = przekonwertowana

            rekord["_wiersz"] = numer_wiersza
            if wiersz_poprawny:
                rekordy.append(rekord)

        return rekordy, True

    @staticmethod
    def _wiersz_niepusty(wiersz: tuple[Any, ...]) -> bool:
        return any(komorka is not None and str(komorka).strip() != "" for komorka in wiersz)

    @staticmethod
    def _komorka(wiersz: tuple[Any, ...], indeks: int) -> Any:
        wartosc = wiersz[indeks] if indeks < len(wiersz) else None
        if wartosc is None or str(wartosc).strip() == "":
            return None
        return wartosc

    @staticmethod
    def _konwertuj(wartosc: Any, typ_kolumny: type) -> Any:
        try:
            if typ_kolumny is str:
                return str(wartosc).strip()
            return typ_kolumny(wartosc)
        except (ValueError, TypeError):
            return None

    @staticmethod
    def _nazwa_typu(typ_kolumny: type) -> str:
        return "liczba" if typ_kolumny is float else "tekst"

    # ------------------------------------------------------------------
    # Walidacje
    # ------------------------------------------------------------------

    def _waliduj_powiazania(
        self,
        szyny: list[dict[str, Any]],
        linie: list[dict[str, Any]],
        trafo: list[dict[str, Any]],
        zrodla: list[dict[str, Any]],
        odbiory: list[dict[str, Any]],
    ) -> list[BladArkusza]:
        bledy: list[BladArkusza] = []
        identyfikatory_szyn = {s["id"] for s in szyny}

        odwolania = (
            (ARKUSZ_LINIE, linie, ("szyna_pocz", "szyna_kon")),
            (ARKUSZ_TRAFO, trafo, ("szyna_HV", "szyna_LV")),
            (ARKUSZ_ZRODLA, zrodla, ("szyna",)),
            (ARKUSZ_ODBIORY, odbiory, ("szyna",)),
        )
        for nazwa_arkusza, rekordy, kolumny in odwolania:
            for rekord in rekordy:
                for kolumna in kolumny:
                    if rekord[kolumna] not in identyfikatory_szyn:
                        bledy.append(
                            BladArkusza(
                                arkusz=nazwa_arkusza,
                                wiersz=rekord["_wiersz"],
                                kolumna=kolumna,
                                komunikat=(
                                    f"Szyna '{rekord[kolumna]}' nie występuje "
                                    f"w arkuszu '{ARKUSZ_SZYNY}'"
                                ),
                            )
                        )

        duplikaty = (
            (ARKUSZ_SZYNY, szyny),
            (ARKUSZ_LINIE, linie),
            (ARKUSZ_TRAFO, trafo),
            (ARKUSZ_ZRODLA, zrodla),
            (ARKUSZ_ODBIORY, odbiory),
        )
        for nazwa_arkusza, rekordy in duplikaty:
            widziane: dict[str, int] = {}
            for rekord in rekordy:
                identyfikator = rekord["id"]
                if identyfikator in widziane:
                    bledy.append(
                        BladArkusza(
                            arkusz=nazwa_arkusza,
                            wiersz=rekord["_wiersz"],
                            kolumna="id",
                            komunikat=(
                                f"Powtórzony identyfikator '{identyfikator}' "
                                f"(pierwsze wystąpienie: wiersz {widziane[identyfikator]})"
                            ),
                        )
                    )
                else:
                    widziane[identyfikator] = rekord["_wiersz"]

        return bledy

    def _waliduj_wartosci(
        self,
        szyny: list[dict[str, Any]],
        linie: list[dict[str, Any]],
        trafo: list[dict[str, Any]],
        zrodla: list[dict[str, Any]],
    ) -> list[BladArkusza]:
        bledy: list[BladArkusza] = []
        for szyna in szyny:
            if szyna["napięcie_kV"] <= 0:
                bledy.append(
                    BladArkusza(
                        arkusz=ARKUSZ_SZYNY,
                        wiersz=szyna["_wiersz"],
                        kolumna="napięcie_kV",
                        komunikat="Napięcie znamionowe musi być większe od zera",
                    )
                )
        for linia in linie:
            if linia["długość_km"] <= 0:
                bledy.append(
                    BladArkusza(
                        arkusz=ARKUSZ_LINIE,
                        wiersz=linia["_wiersz"],
                        kolumna="długość_km",
                        komunikat="Długość musi być większa od zera",
                    )
                )
            for kolumna in ("R_ohm_km", "X_ohm_km", "B_uS_km", "C_nF_km"):
                wartosc = linia.get(kolumna)
                if wartosc is not None and wartosc < 0:
                    bledy.append(
                        BladArkusza(
                            arkusz=ARKUSZ_LINIE,
                            wiersz=linia["_wiersz"],
                            kolumna=kolumna,
                            komunikat="Wartość jednostkowa nie może być ujemna",
                        )
                    )
            for kolumna in ("Un_kV", "I_dop_A", "T_max_C", "przekroj_mm2"):
                wartosc = linia.get(kolumna)
                if wartosc is not None and wartosc <= 0:
                    bledy.append(
                        BladArkusza(
                            arkusz=ARKUSZ_LINIE,
                            wiersz=linia["_wiersz"],
                            kolumna=kolumna,
                            komunikat="Wartość musi być większa od zera",
                        )
                    )
            zyly = linia.get("zyly")
            if zyly is not None and zyly not in (1.0, 3.0):
                bledy.append(
                    BladArkusza(
                        arkusz=ARKUSZ_LINIE,
                        wiersz=linia["_wiersz"],
                        kolumna="zyly",
                        komunikat="Liczba żył kabla musi wynosić 1 albo 3",
                    )
                )
            if linia["szyna_pocz"] == linia["szyna_kon"]:
                bledy.append(
                    BladArkusza(
                        arkusz=ARKUSZ_LINIE,
                        wiersz=linia["_wiersz"],
                        kolumna="szyna_kon",
                        komunikat="Początek i koniec odcinka wskazują tę samą szynę",
                    )
                )
        for transformator in trafo:
            for kolumna in ("Sn_MVA", "uk_pct", "U_HV_kV", "U_LV_kV"):
                wartosc = transformator.get(kolumna)
                if wartosc is not None and wartosc <= 0:
                    bledy.append(
                        BladArkusza(
                            arkusz=ARKUSZ_TRAFO,
                            wiersz=transformator["_wiersz"],
                            kolumna=kolumna,
                            komunikat="Wartość musi być większa od zera",
                        )
                    )
            for kolumna in ("Pk_kW", "zaczep_krok_pct"):
                wartosc = transformator.get(kolumna)
                if wartosc is not None and wartosc < 0:
                    bledy.append(
                        BladArkusza(
                            arkusz=ARKUSZ_TRAFO,
                            wiersz=transformator["_wiersz"],
                            kolumna=kolumna,
                            komunikat="Wartość nie może być ujemna",
                        )
                    )
            for kolumna in ("zaczep_min", "zaczep_max"):
                wartosc = transformator.get(kolumna)
                if wartosc is not None and float(wartosc) != int(wartosc):
                    bledy.append(
                        BladArkusza(
                            arkusz=ARKUSZ_TRAFO,
                            wiersz=transformator["_wiersz"],
                            kolumna=kolumna,
                            komunikat="Numer zaczepu musi być liczbą całkowitą",
                        )
                    )
            zaczep_min, zaczep_max = transformator.get("zaczep_min"), transformator.get(
                "zaczep_max"
            )
            if (
                zaczep_min is not None
                and zaczep_max is not None
                and not (zaczep_min <= 0 <= zaczep_max)
            ):
                bledy.append(
                    BladArkusza(
                        arkusz=ARKUSZ_TRAFO,
                        wiersz=transformator["_wiersz"],
                        kolumna="zaczep_min",
                        komunikat=(
                            "Zakres zaczepów musi obejmować położenie znamionowe 0 "
                            "(zaczep_min <= 0 <= zaczep_max)"
                        ),
                    )
                )
            if transformator["szyna_HV"] == transformator["szyna_LV"]:
                bledy.append(
                    BladArkusza(
                        arkusz=ARKUSZ_TRAFO,
                        wiersz=transformator["_wiersz"],
                        kolumna="szyna_LV",
                        komunikat="Strona HV i LV wskazują tę samą szynę",
                    )
                )
        for zrodlo in zrodla:
            sk_mva = zrodlo.get("Sk_MVA")
            ik_ka = zrodlo.get("Ik_kA")
            if sk_mva is None and ik_ka is None:
                bledy.append(
                    BladArkusza(
                        arkusz=ARKUSZ_ZRODLA,
                        wiersz=zrodlo["_wiersz"],
                        komunikat=(
                            "Źródło musi mieć podaną moc zwarciową Sk_MVA "
                            "albo prąd zwarciowy Ik_kA (tryb prądowy)"
                        ),
                    )
                )
            if sk_mva is not None and sk_mva <= 0:
                bledy.append(
                    BladArkusza(
                        arkusz=ARKUSZ_ZRODLA,
                        wiersz=zrodlo["_wiersz"],
                        kolumna="Sk_MVA",
                        komunikat="Moc zwarciowa musi być większa od zera",
                    )
                )
            if ik_ka is not None and ik_ka <= 0:
                bledy.append(
                    BladArkusza(
                        arkusz=ARKUSZ_ZRODLA,
                        wiersz=zrodlo["_wiersz"],
                        kolumna="Ik_kA",
                        komunikat="Prąd zwarciowy musi być większy od zera",
                    )
                )
            if zrodlo["RX_ratio"] < 0:
                bledy.append(
                    BladArkusza(
                        arkusz=ARKUSZ_ZRODLA,
                        wiersz=zrodlo["_wiersz"],
                        kolumna="RX_ratio",
                        komunikat="Stosunek R/X nie może być ujemny",
                    )
                )
            # CV-4.3 K7: dane scenariusza MIN — puste = pominięte (zero fabrykacji), ale
            # gdy PODANE muszą być fizycznie sensowne (dodatnie / nieujemne). Sprzeczność
            # MIN > MAX NIE jest tu odrzucana (to rozstrzyga warstwa domenowa, ktora dane
            # docelowo konsumuje) — patrz ostrzeżenie w `_zbuduj_rekordy`.
            sk_min_mva = zrodlo.get("Sk_min_MVA")
            if sk_min_mva is not None and sk_min_mva <= 0:
                bledy.append(
                    BladArkusza(
                        arkusz=ARKUSZ_ZRODLA,
                        wiersz=zrodlo["_wiersz"],
                        kolumna="Sk_min_MVA",
                        komunikat="Minimalna moc zwarciowa musi być większa od zera",
                    )
                )
            ik_min_ka = zrodlo.get("Ik_min_kA")
            if ik_min_ka is not None and ik_min_ka <= 0:
                bledy.append(
                    BladArkusza(
                        arkusz=ARKUSZ_ZRODLA,
                        wiersz=zrodlo["_wiersz"],
                        kolumna="Ik_min_kA",
                        komunikat="Minimalny prąd zwarciowy musi być większy od zera",
                    )
                )
            rx_min = zrodlo.get("RX_min")
            if rx_min is not None and rx_min < 0:
                bledy.append(
                    BladArkusza(
                        arkusz=ARKUSZ_ZRODLA,
                        wiersz=zrodlo["_wiersz"],
                        kolumna="RX_min",
                        komunikat="Stosunek R/X (scenariusz MIN) nie może być ujemny",
                    )
                )
            u_pu = zrodlo.get("U_pu")
            if u_pu is not None and not u_set_pu_w_pasmie(u_pu):
                bledy.append(
                    BladArkusza(
                        arkusz=ARKUSZ_ZRODLA,
                        wiersz=zrodlo["_wiersz"],
                        kolumna="U_pu",
                        komunikat=(
                            "Napięcie zadane szyny bilansującej musi mieścić się w paśmie "
                            f"{PASMO_U_SET_PU[0]:g}–{PASMO_U_SET_PU[1]:g} p.u."
                        ),
                    )
                )
        return bledy

    # ------------------------------------------------------------------
    # W1: wiązanie typów — katalog statyczny ALBO pełna tabliczka (typ projektu)
    # ------------------------------------------------------------------

    _KOLUMNY_TABLICZKI_LINII: dict[str, tuple[str, ...]] = {
        "LINIA": ("R_ohm_km", "X_ohm_km", "B_uS_km", "Un_kV", "I_dop_A"),
        "KABEL": (
            "R_ohm_km",
            "X_ohm_km",
            "C_nF_km",
            "Un_kV",
            "I_dop_A",
            "T_max_C",
            "przekroj_mm2",
            "zyly",
        ),
    }
    _KOLUMNY_TABLICZKI_TRAFO: tuple[str, ...] = (
        "Sn_MVA",
        "uk_pct",
        "Pk_kW",
        "grupa",
        "zaczep_min",
        "zaczep_max",
        "zaczep_krok_pct",
    )
    #: Kolumna arkusza -> pole typu katalogowego (do sprawdzenia jednej prawdy, gdy arkusz
    #: podaje wartość OBOK typu katalogowego).
    _POLA_KRZYZOWE_LINII: tuple[tuple[str, str], ...] = (
        ("R_ohm_km", "r_ohm_per_km"),
        ("X_ohm_km", "x_ohm_per_km"),
        ("I_dop_A", "rated_current_a"),
        ("Un_kV", "voltage_rating_kv"),
    )
    _POLA_KRZYZOWE_TRAFO: tuple[tuple[str, str], ...] = (
        ("Sn_MVA", "rated_power_mva"),
        ("uk_pct", "uk_percent"),
        ("Pk_kW", "pk_kw"),
    )

    @staticmethod
    def _rodzaj_linii(linia: dict[str, Any]) -> str | None:
        surowy = linia.get("rodzaj")
        if surowy is None:
            return None
        return str(surowy).strip().upper() or None

    @staticmethod
    def _rowne(a: float, b: float) -> bool:
        return abs(float(a) - float(b)) <= 1e-6 * max(1.0, abs(float(b)))

    def _waliduj_typy(
        self, linie: list[dict[str, Any]], trafo: list[dict[str, Any]]
    ) -> list[BladArkusza]:
        """Każdy odcinek i transformator ma DOKŁADNIE jedną drogę do typu:

        * `typ_katalogowy` — pozycja katalogu statycznego (musi istnieć; wartości podane
          obok w arkuszu muszą się z nią zgadzać — jedna prawda, zero cichego rozjazdu),
        * pełna tabliczka — powstaje pozycja katalogu PROJEKTU (`enm/katalog_projektu.py`);
          brakująca kolumna tabliczki to błąd wiersza, nigdy wartość domyślna.
        Dwa wiersze z tym samym `typ` (linie) muszą nieść tę samą tabliczkę — inaczej ta
        sama nazwa znaczyłaby dwa różne przewody.
        """
        bledy: list[BladArkusza] = []
        katalog = self._katalog()
        tabliczki_wg_typu: dict[tuple[str, str], tuple[dict[str, Any], int]] = {}
        for linia in linie:
            typ_katalogowy = linia.get("typ_katalogowy") or None
            rodzaj = self._rodzaj_linii(linia)
            if rodzaj is not None and rodzaj not in self._KOLUMNY_TABLICZKI_LINII:
                bledy.append(
                    BladArkusza(
                        arkusz=ARKUSZ_LINIE,
                        wiersz=linia["_wiersz"],
                        kolumna="rodzaj",
                        komunikat="Rodzaj odcinka musi być LINIA (napowietrzna) albo KABEL",
                    )
                )
                continue
            if typ_katalogowy:
                w_liniach = typ_katalogowy in katalog.line_types
                w_kablach = typ_katalogowy in katalog.cable_types
                if not (w_liniach or w_kablach):
                    bledy.append(
                        BladArkusza(
                            arkusz=ARKUSZ_LINIE,
                            wiersz=linia["_wiersz"],
                            kolumna="typ_katalogowy",
                            komunikat=(
                                f"Typ '{typ_katalogowy}' nie występuje w katalogu — popraw "
                                "identyfikator albo usuń kolumnę i podaj pełną tabliczkę przewodu"
                            ),
                        )
                    )
                    continue
                rodzaj_katalogu = "KABEL" if w_kablach else "LINIA"
                if rodzaj is not None and rodzaj != rodzaj_katalogu:
                    bledy.append(
                        BladArkusza(
                            arkusz=ARKUSZ_LINIE,
                            wiersz=linia["_wiersz"],
                            kolumna="rodzaj",
                            komunikat=(
                                f"Arkusz podaje rodzaj {rodzaj}, a typ katalogowy "
                                f"'{typ_katalogowy}' to {rodzaj_katalogu}"
                            ),
                        )
                    )
                typ = (
                    katalog.cable_types[typ_katalogowy]
                    if w_kablach
                    else katalog.line_types[typ_katalogowy]
                )
                for kolumna, pole in self._POLA_KRZYZOWE_LINII:
                    wartosc = linia.get(kolumna)
                    if wartosc is None:
                        continue
                    z_katalogu = getattr(typ, pole)
                    if not self._rowne(wartosc, z_katalogu):
                        bledy.append(
                            BladArkusza(
                                arkusz=ARKUSZ_LINIE,
                                wiersz=linia["_wiersz"],
                                kolumna=kolumna,
                                komunikat=(
                                    f"Arkusz podaje {wartosc:g}, a typ katalogowy "
                                    f"'{typ_katalogowy}' ma {float(z_katalogu):g} — jedna prawda: "
                                    "usuń wartość z arkusza albo wskaż inny typ"
                                ),
                            )
                        )
                continue
            if rodzaj is None:
                bledy.append(
                    BladArkusza(
                        arkusz=ARKUSZ_LINIE,
                        wiersz=linia["_wiersz"],
                        kolumna="rodzaj",
                        komunikat=(
                            "Odcinek bez typu katalogowego wymaga kolumny rodzaj (LINIA/KABEL) "
                            "i pełnej tabliczki przewodu"
                        ),
                    )
                )
                continue
            brakujace = [
                kolumna
                for kolumna in self._KOLUMNY_TABLICZKI_LINII[rodzaj]
                if linia.get(kolumna) is None
            ]
            if brakujace:
                bledy.append(
                    BladArkusza(
                        arkusz=ARKUSZ_LINIE,
                        wiersz=linia["_wiersz"],
                        komunikat=(
                            f"Odcinek {rodzaj} bez typu katalogowego wymaga pełnej tabliczki — "
                            f"brak kolumn: {', '.join(brakujace)} (żadna z nich nie ma wartości "
                            "domyślnej)"
                        ),
                    )
                )
                continue
            klucz = (rodzaj, self._nazwa_typu_projektu(linia))
            tabliczka = self._tabliczka_linii(linia, rodzaj)
            poprzednia = tabliczki_wg_typu.get(klucz)
            if poprzednia is None:
                tabliczki_wg_typu[klucz] = (tabliczka, linia["_wiersz"])
            elif poprzednia[0] != tabliczka:
                bledy.append(
                    BladArkusza(
                        arkusz=ARKUSZ_LINIE,
                        wiersz=linia["_wiersz"],
                        kolumna="typ",
                        komunikat=(
                            f"Typ '{linia['typ']}' ma inną tabliczkę niż w wierszu "
                            f"{poprzednia[1]} — ta sama nazwa typu musi znaczyć ten sam przewód"
                        ),
                    )
                )
        for transformator in trafo:
            typ_katalogowy = transformator.get("typ_katalogowy") or None
            if typ_katalogowy:
                typ_trafo = katalog.transformer_types.get(typ_katalogowy)
                if typ_trafo is None:
                    bledy.append(
                        BladArkusza(
                            arkusz=ARKUSZ_TRAFO,
                            wiersz=transformator["_wiersz"],
                            kolumna="typ_katalogowy",
                            komunikat=(
                                f"Typ '{typ_katalogowy}' nie występuje w katalogu "
                                "transformatorów — popraw identyfikator albo podaj pełną tabliczkę"
                            ),
                        )
                    )
                    continue
                for kolumna, pole in self._POLA_KRZYZOWE_TRAFO:
                    wartosc = transformator.get(kolumna)
                    if wartosc is None:
                        continue
                    z_katalogu = getattr(typ_trafo, pole)
                    if not self._rowne(wartosc, z_katalogu):
                        bledy.append(
                            BladArkusza(
                                arkusz=ARKUSZ_TRAFO,
                                wiersz=transformator["_wiersz"],
                                kolumna=kolumna,
                                komunikat=(
                                    f"Arkusz podaje {wartosc:g}, a typ katalogowy "
                                    f"'{typ_katalogowy}' ma {float(z_katalogu):g} — jedna prawda: "
                                    "usuń wartość z arkusza albo wskaż inny typ"
                                ),
                            )
                        )
                continue
            brakujace = [
                kolumna
                for kolumna in self._KOLUMNY_TABLICZKI_TRAFO
                if transformator.get(kolumna) is None
                or (kolumna == "grupa" and not str(transformator.get(kolumna)).strip())
            ]
            if brakujace:
                bledy.append(
                    BladArkusza(
                        arkusz=ARKUSZ_TRAFO,
                        wiersz=transformator["_wiersz"],
                        komunikat=(
                            "Transformator bez typu katalogowego wymaga pełnej tabliczki — "
                            f"brak kolumn: {', '.join(brakujace)} (żadna z nich nie ma wartości "
                            "domyślnej)"
                        ),
                    )
                )
        return bledy

    # ------------------------------------------------------------------
    # Budowa rekordów dla kompilatora grafu (`enm/kompilator_grafu.py`)
    # ------------------------------------------------------------------

    @staticmethod
    def _slug(tekst: str) -> str:
        slug = re.sub(r"[^a-z0-9]+", "-", str(tekst).lower()).strip("-")
        return slug or "typ"

    @classmethod
    def _nazwa_typu_projektu(cls, linia: dict[str, Any]) -> str:
        return str(linia["typ"]).strip()

    @staticmethod
    def _tabliczka_linii(linia: dict[str, Any], rodzaj: str) -> dict[str, Any]:
        """Pola typu katalogowego z kolumn arkusza (bez proweniencji — ta jest per wiersz)."""
        wspolne = {
            "r_ohm_per_km": float(linia["R_ohm_km"]),
            "x_ohm_per_km": float(linia["X_ohm_km"]),
            "rated_current_a": float(linia["I_dop_A"]),
            "voltage_rating_kv": float(linia["Un_kV"]),
        }
        if rodzaj == "LINIA":
            return {
                **wspolne,
                "b_us_per_km": float(linia["B_uS_km"]),
                "max_temperature_c": (
                    float(linia["T_max_C"]) if linia.get("T_max_C") is not None else None
                ),
                "cross_section_mm2": (
                    float(linia["przekroj_mm2"]) if linia.get("przekroj_mm2") is not None else None
                ),
            }
        return {
            **wspolne,
            "c_nf_per_km": float(linia["C_nF_km"]),
            "max_temperature_c": float(linia["T_max_C"]),
            "cross_section_mm2": float(linia["przekroj_mm2"]),
            "number_of_cores": int(linia["zyly"]),
        }

    def _zbuduj_rekordy(
        self,
        szyny: list[dict[str, Any]],
        linie: list[dict[str, Any]],
        trafo: list[dict[str, Any]],
        zrodla: list[dict[str, Any]],
        odbiory: list[dict[str, Any]],
        ostrzezenia: list[str],
        nazwa_pliku: str | None,
    ) -> tuple[SiecZArkusza, list[str]]:
        """Rekordy kanoniczne dla kompilatora grafu + sekcja typów projektu.

        Zero fabrykacji: parametr elementu pochodzi WYŁĄCZNIE z typu (katalog statyczny
        albo tabliczka arkusza jako typ projektu); brak danej = brak klucza, nigdy 0/Dyn11.
        """
        katalog = self._katalog()
        plik = nazwa_pliku or "arkusz.xlsx"
        typy_projektu: dict[str, dict[str, dict[str, Any]]] = {
            "line_types": {},
            "cable_types": {},
            "transformer_types": {},
        }
        elementy_typow_projektu: list[str] = []

        wezly = [
            {
                "ref": szyna["id"],
                "name": szyna["nazwa"],
                "voltage_kv": float(szyna["napięcie_kV"]),
                "wiersz": szyna["_wiersz"],
            }
            for szyna in szyny
        ]
        napiecia_szyn = {s["id"]: float(s["napięcie_kV"]) for s in szyny}

        galezie: list[dict[str, Any]] = []
        for linia in linie:
            typ_katalogowy = linia.get("typ_katalogowy") or None
            if typ_katalogowy:
                rodzaj = "KABEL" if typ_katalogowy in katalog.cable_types else "LINIA"
                catalog_ref = typ_katalogowy
            else:
                rodzaj = self._rodzaj_linii(linia) or "LINIA"
                nazwa_typu = self._nazwa_typu_projektu(linia)
                catalog_ref = f"arkusz-{rodzaj.lower()}-{self._slug(nazwa_typu)}"
                sekcja = "cable_types" if rodzaj == "KABEL" else "line_types"
                if catalog_ref not in typy_projektu[sekcja]:
                    typy_projektu[sekcja][catalog_ref] = {
                        "id": catalog_ref,
                        "name": f"{nazwa_typu} (arkusz)",
                        "params": {
                            **self._tabliczka_linii(linia, rodzaj),
                            "source_reference": f"arkusz:{plik}#{ARKUSZ_LINIE}:{linia['_wiersz']}",
                            "verification_status": STATUS_WERYFIKACJI_ARKUSZA,
                            "catalog_status": STATUS_KATALOGU_PROJEKTU,
                        },
                    }
                elementy_typow_projektu.append(linia["id"])
            galezie.append(
                {
                    "ref": linia["id"],
                    "name": linia["id"],
                    "from_ref": linia["szyna_pocz"],
                    "to_ref": linia["szyna_kon"],
                    # Jednostka kompilatora (`EdgeSpec.dlugosc_m`) — przeliczenie km→m to
                    # zamiana jednostki długości, nie wielkość elektryczna.
                    "dlugosc_m": float(linia["długość_km"]) * 1000.0,
                    "catalog_ref": catalog_ref,
                    "rodzaj": rodzaj,
                    "wiersz": linia["_wiersz"],
                }
            )

        transformatory: list[dict[str, Any]] = []
        for transformator in trafo:
            typ_katalogowy = transformator.get("typ_katalogowy") or None
            if typ_katalogowy:
                catalog_ref = typ_katalogowy
            else:
                catalog_ref = f"arkusz-trafo-{self._slug(transformator['id'])}"
                u_hv = transformator.get("U_HV_kV")
                u_lv = transformator.get("U_LV_kV")
                przyjete: list[str] = []
                if u_hv is None:
                    u_hv = napiecia_szyn[transformator["szyna_HV"]]
                    przyjete.append(
                        f"U_HV = napięcie szyny {transformator['szyna_HV']} ({u_hv:g} kV)"
                    )
                if u_lv is None:
                    u_lv = napiecia_szyn[transformator["szyna_LV"]]
                    przyjete.append(
                        f"U_LV = napięcie szyny {transformator['szyna_LV']} ({u_lv:g} kV)"
                    )
                if przyjete:
                    ostrzezenia.append(
                        f"Transformator '{transformator['id']}': napięcia znamionowe uzwojeń "
                        "przyjęte z napięć szyn (brak kolumn U_HV_kV/U_LV_kV): "
                        + "; ".join(przyjete)
                    )
                typy_projektu["transformer_types"][catalog_ref] = {
                    "id": catalog_ref,
                    "name": (
                        f"{transformator['id']} {float(transformator['Sn_MVA']):g} MVA "
                        f"{float(u_hv):g}/{float(u_lv):g} kV (arkusz)"
                    ),
                    "params": {
                        "rated_power_mva": float(transformator["Sn_MVA"]),
                        "voltage_hv_kv": float(u_hv),
                        "voltage_lv_kv": float(u_lv),
                        "uk_percent": float(transformator["uk_pct"]),
                        "pk_kw": float(transformator["Pk_kW"]),
                        "vector_group": str(transformator["grupa"]).strip(),
                        "tap_min": int(transformator["zaczep_min"]),
                        "tap_max": int(transformator["zaczep_max"]),
                        "tap_step_percent": float(transformator["zaczep_krok_pct"]),
                        "source_reference": (
                            f"arkusz:{plik}#{ARKUSZ_TRAFO}:{transformator['_wiersz']}"
                        ),
                        "verification_status": STATUS_WERYFIKACJI_ARKUSZA,
                        "catalog_status": STATUS_KATALOGU_PROJEKTU,
                        **({"verification_note": "; ".join(przyjete)} if przyjete else {}),
                    },
                }
                elementy_typow_projektu.append(transformator["id"])
            transformatory.append(
                {
                    "ref": transformator["id"],
                    "name": transformator["id"],
                    "hv_ref": transformator["szyna_HV"],
                    "lv_ref": transformator["szyna_LV"],
                    "catalog_ref": catalog_ref,
                    "wiersz": transformator["_wiersz"],
                }
            )

        rekordy_zrodel = [
            {
                "ref": zrodlo["id"],
                "node_ref": zrodlo["szyna"],
                "name": zrodlo["id"],
                "rodzaj_z_arkusza": zrodlo["typ"],
                "rx_ratio": float(zrodlo["RX_ratio"]),
                # Puste w arkuszu = klucz pominięty (zero fabrykacji) — nie 0/None.
                **({"sk3_mva": float(zrodlo["Sk_MVA"])} if "Sk_MVA" in zrodlo else {}),
                **({"ik3_ka": float(zrodlo["Ik_kA"])} if "Ik_kA" in zrodlo else {}),
                # CV-4.3 K7: dane scenariusza MIN (IEC 60909-0:2016 §6.2.1 eq. 6 z c_min).
                **({"sk3_min_mva": float(zrodlo["Sk_min_MVA"])} if "Sk_min_MVA" in zrodlo else {}),
                **({"ik3_min_ka": float(zrodlo["Ik_min_kA"])} if "Ik_min_kA" in zrodlo else {}),
                **({"rx_ratio_min": float(zrodlo["RX_min"])} if "RX_min" in zrodlo else {}),
                # Napięcie zadane szyny bilansującej (MATPOWER `Vm` slack) — puste = 1,0.
                **({"u_set_pu": float(zrodlo["U_pu"])} if "U_pu" in zrodlo else {}),
                "wiersz": zrodlo["_wiersz"],
            }
            for zrodlo in zrodla
        ]
        # CV-4.3 K7: sprzeczność MIN/MAX NIE jest błędem odrzucającym import (rozstrzyga ją
        # warstwa domenowa, która dane docelowo konsumuje — `source.manual_equivalent_invalid`
        # / `sources.sk_min_exceeds_max`) — importer ją POKAZUJE w podglądzie, nie połyka.
        for zrodlo in zrodla:
            sk_min, sk_max = zrodlo.get("Sk_min_MVA"), zrodlo.get("Sk_MVA")
            if sk_min is not None and sk_max is not None and sk_min > sk_max:
                ostrzezenia.append(
                    f"Źródło '{zrodlo['id']}': Sk_min_MVA ({sk_min:g}) przekracza Sk_MVA "
                    f"({sk_max:g}) — dane scenariusza minimalnego muszą być nie większe "
                    "niż maksymalnego, sprawdź arkusz przed użyciem tego źródła."
                )
            ik_min, ik_max = zrodlo.get("Ik_min_kA"), zrodlo.get("Ik_kA")
            if ik_min is not None and ik_max is not None and ik_min > ik_max:
                ostrzezenia.append(
                    f"Źródło '{zrodlo['id']}': Ik_min_kA ({ik_min:g}) przekracza Ik_kA "
                    f"({ik_max:g}) — dane scenariusza minimalnego muszą być nie większe "
                    "niż maksymalnego, sprawdź arkusz przed użyciem tego źródła."
                )
            if zrodlo.get("RX_min") is not None and sk_min is None and ik_min is None:
                ostrzezenia.append(
                    f"Źródło '{zrodlo['id']}': RX_min podany bez Sk_min_MVA/Ik_min_kA — "
                    "stosunek R/X scenariusza minimalnego nie ma zastosowania bez własnej "
                    "mocy zwarciowej minimalnej tego źródła."
                )
        rekordy_odbiorow = [
            {
                "ref": odbior["id"],
                "node_ref": odbior["szyna"],
                "name": odbior["id"],
                "p_mw": float(odbior["P_MW"]),
                "q_mvar": float(odbior["Q_Mvar"]),
                "wiersz": odbior["_wiersz"],
            }
            for odbior in odbiory
        ]
        sekcja_typow = {
            rodzaj: [
                typy_projektu[rodzaj][identyfikator]
                for identyfikator in sorted(typy_projektu[rodzaj])
            ]
            for rodzaj in ("line_types", "cable_types", "transformer_types")
        }
        siec = SiecZArkusza(
            wezly=wezly,
            galezie=galezie,
            transformatory=transformatory,
            zrodla=rekordy_zrodel,
            odbiory=rekordy_odbiorow,
            typy_projektu=sekcja_typow,
        )
        return siec, elementy_typow_projektu
