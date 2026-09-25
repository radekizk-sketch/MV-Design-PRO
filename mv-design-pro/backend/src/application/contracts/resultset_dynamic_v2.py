"""ResultSetDynamicV2 — kontrakt kanonicznego wyniku czasowego (karta W6-1 SS0 p.6,
karta AB-1b.1 par. 0 pkt 14).

DLACZEGO V2, A NIE ROZSZERZENIE V1. Zmiany nie sa addytywne: probka moze byc `None`
(czestotliwosc niedostepna z kodem jakosci, kat fazora zerowego), a os czasu niesie
POWTORZONE chwile (probki obustronne `L`/`P` w chwilach zdarzen), rozroznione polem
`strona_probki`. Konsument v1 czytajacy `os_czasu_s` jako os scisle rosnaca albo
zamieniajacy brak na liczbe dostalby wynik bledny bez sladu — dlatego nowa nazwa
kontraktu. Kontrakt v1 usuniety bez warstwy zgodnosci (konsumentow interfejsu: zero;
CLAUDE.md, zasady inzynierskie pkt 1).

CANONICAL ALIGNMENT:
- Kontrakt OSOBNY od `domain/result_contract_v1.py::ResultSetV1` (A-13, DT-10) —
  `ResultSetV1` NIE jest rozszerzany; biegi statyczne (PF/SC) i biegi czasowe
  (`dynamika_rms`) maja rozlaczne kontrakty w JEDNYM rejestrze biegow
  (`CanonicalRun`).
- Kontrakt PRODUKCYJNY od karty W6-3B: wykonawca `dynamika_rms`
  (`enm/canonical_analysis.py::_execute_dynamika_rms`) buduje kazda instancje z
  ladunku rdzenia (`solvers/dynamika/wynik.py::ladunek_resultset_dynamic_v2`);
  bieg konczy sie wynikiem albo NAZWANA odmowa, nigdy fasada.
- Zero fizyki: modul niesie WYLACZNIE ksztalt danych i pomocnicze funkcje
  budowy/kwantyzacji, zadnego rownania ruchu ani calkowania.
- Szeregi czasowe (`os_czasu_s`/`probki`) NIE wchodza do `CanonicalRun.raw_result`
  (PERF-SC-50 lekcja: nigdy pelny szereg w wierszu biegu) — osobna tabela
  `canonical_run_time_series` (infrastructure/persistence), API rozdziela
  metadane (`GET .../results/dynamika`) od probek na zadanie
  (`GET .../results/dynamika/time-series?kanaly=...`).
- Kwantyzacja 9 cyfr znaczacych na GRANICY kontraktu (DT-11, ADR-018/M0-2) —
  `zbuduj_resultset_dynamiczny_v2` kwantyzuje kazdy float przez
  `application.analyses.kontrakt_liczb.kwantyzuj_kontrakt` przed zwroceniem.

MODELE:
- KanalDynamicznyV2: opis jednego kanalu wyniku (klucz, przestrzen, jednostka).
- OdbiorOdcietyV2: odbior, ktory w chwili zdarzenia stracil obwod (moc sprzed odciecia).
- ZdarzenieWykonaneV2: zdarzenie z harmonogramu FAKTYCZNIE wykonane przez solver
  (t zaplanowany vs wykonany, residua re-inicjalizacji, skutki topologiczne chwili,
  przypisania stanu z pomiarem ciaglosci, pomiar lokalizacji zdarzenia warunkowego).
- PrzypisanieWykonaneV2: adres stanu, wartosc przed i po przypisaniu.
- PrzekroczenieV2: chwila przekroczenia progu przez wielkosc detektora scenariusza.
- WlasnosciBieguV2: zbieznosc, liczba krokow/odrzuconych, residua, integrator.
- TozsamoscBieguDynamicznegoV2: piec odciskow + wersja solvera (determinizm).
- MetrykaDynamicznaV2: pojedyncza metryka skalarna (np. u_min_pu, cct_s).
- StopienDowodowyV2: mirror `solver_input.provenance.CapabilityEvidence` (JSON).
- ResultSetDynamicV2: kontener najwyzszego poziomu.
"""

from __future__ import annotations

from typing import Any, Final, Literal

from application.analyses.kontrakt_liczb import kwantyzuj_kontrakt
from dziedziny import PozaDziedzinami, dziedziny_rodzaju
from pydantic import BaseModel, Field, model_validator
from solver_input.provenance import CapabilityEvidence
from werdykt.kontrakt import DziedzinaFizyki

RESULTSET_DYNAMIC_CONTRACT: Final[Literal["resultset_dynamic_v2"]] = "resultset_dynamic_v2"

#: Wartosc `ExecutionAnalysisType` biegu czasowego — klucz mapy dziedzin fizyki
#: (`dziedziny.dziedzina_analizy.MAPA_DZIEDZIN`); ta sama wartosc tekstowa co enum w
#: `domain/execution.py` (lisc `dziedziny` nie importuje warstwy domeny).
RODZAJ_ANALIZY_DYNAMIKI: Final = "DYNAMIKA_RMS"

StronaProbki = Literal["C", "L", "P"]
"""Strona próbki: `C` — próbka siatki; `L` — stan PRZED naniesieniem zdarzeń chwili;
`P` — stan PO zdarzeniach i jednej re-inicjalizacji (karta AB-1b.1 par. 0 pkt 6)."""


def dziedzina_fizyki_dynamiki() -> tuple[DziedzinaFizyki, ...]:
    """Dziedziny fizyki wyniku czasowego — WYPROWADZONE z jednej mapy produktu.

    Mapa dziedzin (`dziedziny.dziedzina_analizy`) jest jedynym zrodlem prawdy; wpis
    „poza dziedzinami" dla biegu czasowego bylby sprzecznoscia kontraktu (bieg RMS
    liczy wielkosci fizyczne), wiec konczy sie bledem programu, nie domyslka.
    """
    dziedziny = dziedziny_rodzaju(RODZAJ_ANALIZY_DYNAMIKI)
    if isinstance(dziedziny, PozaDziedzinami):
        raise AssertionError(
            f"Mapa dziedzin wskazuje bieg {RODZAJ_ANALIZY_DYNAMIKI} jako poza dziedzinami "
            f"({dziedziny.powod_pl}) — kontrakt wyniku czasowego tego nie dopuszcza"
        )
    return dziedziny


PrzestrzenKanalu = Literal["siec", "urzadzenie", "regulator", "magazyn", "obserwabla"]
"""Przestrzeń kanału (W6-A): `siec` i `urzadzenie` to zmienne algebraiczne i stany,
`obserwabla` to wielkość WYPROWADZONA z obu jawnym wzorem (częstotliwość węzła,
wielkości zacisków gałęzi). Rozdział jest semantyczny — serializacja jest wspólna,
ale znaczenie kanału nie może się zgubić w jednym słowniku."""


class KanalDynamicznyV2(BaseModel):
    """Opis jednego kanalu szeregu czasowego (bez probek — te w API na zadanie)."""

    klucz: str = Field(min_length=1, description="Klucz kanału (np. 'u_pu@b12', 'omega_pu@g1').")
    przestrzen: PrzestrzenKanalu
    jednostka: str = Field(min_length=1, description="Jednostka fizyczna (pu, Hz, s, MW, Mvar...).")
    element_ref: str | None = Field(default=None, description="Ref_id elementu ENM, gdy dotyczy.")
    opis_pl: str = Field(min_length=1, description="Opis po polsku (bez kodów projektowych).")

    model_config = {"frozen": True, "extra": "forbid"}


class OdbiorOdcietyV2(BaseModel):
    """Odbior, ktory w chwili zdarzenia stracil obwod (obszar beznapieciowy)."""

    ref: str = Field(min_length=1)
    p_pu: float = Field(description="Moc czynna zadana sprzed odcięcia (pu, konwencja poboru).")
    q_pu: float = Field(description="Moc bierna zadana sprzed odcięcia (pu, konwencja poboru).")

    model_config = {"frozen": True, "extra": "forbid"}


class PrzypisanieWykonaneV2(BaseModel):
    """Przypisanie stanu wykonane w chwili zdarzenia (przypisanie, komenda regulacji)."""

    adres: str = Field(min_length=1, description="Adres stanu `urzadzenie.stan`.")
    przed: float = Field(description="Wartość stanu tuz przed przypisaniem.")
    po: float = Field(description="Wartość zadana, przypisana dokładnie.")

    model_config = {"frozen": True, "extra": "forbid"}


#: Rozdzielczosc publikacji czasu (karta AB-1b.1 par. 0 pkt 12): kazdy czas w tym kontrakcie
#: jest skwantyzowany do 9 cyfr znaczacych — przy horyzoncie 600 s to 1e-6 s, grubiej niz
#: typowa tolerancja lokalizacji zdarzen warunkowych. Pelna precyzja zyje w wyniku rdzenia.
OPIS_ROZDZIELCZOSCI_CZASU = (
    "Czas skwantyzowany do 9 cyfr znaczacych na granicy kontraktu (rozdzielczosc publikacji); "
    "chwile zdarzeń warunkowych rdzeń lokalizuje z tolerancja z nastaw solvera w pełnej precyzji."
)


class ZdarzenieWykonaneV2(BaseModel):
    """Zdarzenie harmonogramu FAKTYCZNIE wykonane przez solver (nie zaplanowane).

    Skutki topologiczne CHWILI (wspolne dla zdarzen rownoczesnych, jak pomiar
    re-inicjalizacji): wezly, ktore w tej chwili staly sie beznapieciowe, odbiory,
    ktore stracily obwod, i wezly zasilone ponownie. Przypisania stanu (komendy
    regulacji, przypisania) z pomiarem ciaglosci stanow NIEprzypisanych. Zdarzenie
    WARUNKOWE (akcja dozoru) niesie przyczyne `dozor:<ident>` i pomiar lokalizacji.
    """

    t_zaplanowany_s: float = Field(description=OPIS_ROZDZIELCZOSCI_CZASU)
    t_wykonany_s: float = Field(description=OPIS_ROZDZIELCZOSCI_CZASU)
    rodzaj: str = Field(min_length=1)
    ref: str | None = None
    przyczyna: str = Field(
        min_length=1, description="`harmonogram` albo `dozor:<ident>` (zdarzenie warunkowe)."
    )
    delta_x_nieprzypisane_max: float = Field(
        description=(
            "Maks. skok stanu różniczkowego NIEprzypisanego w tej chwili, wobec stanow sprzed "
            "całej chwili — 0,0 dokładnie (ciągłość stanow mierzona, nie deklarowana)."
        )
    )
    delta_y_max: float = Field(description="Maks. skok stanu algebraicznego przy re-inicjalizacji.")
    residuum_kcl_max: float = Field(
        description="Maks. residuum bilansu prądowego po re-inicjalizacji."
    )
    obszary_odciete: tuple[str, ...] = Field(
        description="Węzły, które w tej chwili stały się beznapięciowe."
    )
    odbiory_odciete: tuple[OdbiorOdcietyV2, ...] = Field(
        description="Odbiory, które w tej chwili straciły obwód."
    )
    obszary_zasilone_ponownie: tuple[str, ...] = Field(
        description="Węzły, które w tej chwili przestały być beznapięciowe."
    )
    przypisania: tuple[PrzypisanieWykonaneV2, ...] = Field(
        description="Przypisania stanu wykonane przez ten wpis (adres, przed, po)."
    )
    t_zlokalizowany_s: float | None = Field(
        description="Chwila pobudzenia dozoru (zdarzenie warunkowe); None dla planowanego. "
        + OPIS_ROZDZIELCZOSCI_CZASU
    )
    szerokosc_przedzialu_s: float | None = Field(
        description="Szerokosc przedziału lokalizacji pobudzenia; None dla planowanego."
    )
    iteracje_lokalizacji: int | None = Field(
        description="Liczba prób kroku lokalizacji pobudzenia; None dla planowanego."
    )
    g_przed: float | None = Field(
        description="Wielkość minus próg na lewym koncu przedziału lokalizacji."
    )
    g_po: float | None = Field(
        description="Wielkość minus próg na prawym koncu przedziału lokalizacji."
    )

    model_config = {"frozen": True, "extra": "forbid"}


#: Kierunek przekroczenia — TEN SAM slownik, co detektor scenariusza (`enm.scenariusze.Detektor`)
#: i dozor rdzenia (`dozory.KierunekDozoru`): `w_dol` — wartosc spada ponizej progu,
#: `w_gore` — rosnie powyzej.
KierunekPrzekroczenia = Literal["w_dol", "w_gore"]


class PrzekroczenieV2(BaseModel):
    """Chwila przekroczenia progu przez wielkosc DETEKTORA scenariusza (bez akcji)."""

    dozor: str = Field(min_length=1, description="Identyfikator detektora ze scenariusza.")
    wielkosc: str = Field(
        min_length=1, description="Klucz kanału wyniku, który detektor czyta (ta sama funkcja)."
    )
    prog: float = Field(description="Próg w jednostce kanału.")
    kierunek: KierunekPrzekroczenia
    t_s: float = Field(
        description="Chwila przekroczenia (strona po przekroczeniu). " + OPIS_ROZDZIELCZOSCI_CZASU
    )
    szerokosc_przedzialu_s: float = Field(
        ge=0.0, description="Szerokosc przedziału lokalizacji (0 dla chwili zdarzenia)."
    )
    iteracje: int = Field(ge=0, description="Liczba prób kroku lokalizacji.")

    model_config = {"frozen": True, "extra": "forbid"}


TrybScenariusza = Literal["siec", "stanowisko"]
"""`siec` — zakłócenia fizyczne sieci; `stanowisko` — sieć zasilana źródłem testowym U/f/θ
(karta AB-1b.1 par. 0 pkt 11, rozdzielenie typowe O-18). Wyprowadzony z wejścia biegu."""


class WlasnosciBieguV2(BaseModel):
    """Wlasnosci numeryczne biegu (zbieznosc, kroki, residua, integrator)."""

    zbiegl: bool
    kroki: int = Field(ge=0)
    kroki_odrzucone: int = Field(ge=0)
    max_residuum_f: float = Field(ge=0.0, description="Maks. residuum równań różniczkowych ||f||.")
    max_residuum_g: float = Field(ge=0.0, description="Maks. residuum równań algebraicznych ||g||.")
    czas_obliczen_s: float = Field(ge=0.0)
    integrator: str = Field(min_length=1)
    dt_s: float = Field(gt=0.0)
    tolerancja: float = Field(gt=0.0)

    model_config = {"frozen": True, "extra": "forbid"}


class TozsamoscBieguDynamicznegoV2(BaseModel):
    """Piec odciskow tozsamosci biegu — determinizm (ta sama piatka => ten sam wynik)."""

    odcisk_migawki: str = Field(min_length=1)
    odcisk_punktu_pracy: str = Field(min_length=1)
    odcisk_nastaw_solvera: str = Field(min_length=1)
    odcisk_harmonogramu: str = Field(min_length=1)
    odcisk_implementacji: str = Field(min_length=1)
    wersja_solvera: str = Field(min_length=1)

    model_config = {"frozen": True, "extra": "forbid"}


class MetrykaDynamicznaV2(BaseModel):
    """Skalarna metryka wyprowadzona z przebiegu (np. u_min_pu, cct_s, rocof_max_hz_s)."""

    klucz: str = Field(min_length=1)
    wartosc: float
    jednostka: str = Field(min_length=1)
    wzor_ref: str | None = Field(
        default=None, description="Odniesienie do wzoru/równania (WHITE BOX)."
    )
    element_ref: str | None = None

    model_config = {"frozen": True, "extra": "forbid"}


class StopienDowodowyV2(BaseModel):
    """Mirror JSON `solver_input.provenance.CapabilityEvidence` (rejestr A-2)."""

    capability_id: str = Field(min_length=1)
    tier: str = Field(min_length=1)
    tier_pl: str = Field(min_length=1)
    claim_kind: str = Field(min_length=1)
    claim_kind_pl: str = Field(min_length=1)
    regulatory_evidence_eligible: bool
    rationale_pl: str = Field(min_length=1)
    audit_ref: str = Field(min_length=1)

    model_config = {"frozen": True, "extra": "forbid"}

    @classmethod
    def z_klasyfikacji(cls, ewidencja: CapabilityEvidence) -> StopienDowodowyV2:
        return cls(**ewidencja.to_dict())


class ResultSetDynamicV2(BaseModel):
    """Kanoniczny wynik czasowy — kontener najwyzszego poziomu (SS0 p.6).

    INVARIANTS:
    - `kontrakt` = "resultset_dynamic_v2" (bump wersji = nowy plik/kontrakt).
    - `strona_probki` ma DOKLADNIE dlugosc `os_czasu_s`, a kazdy szereg `probki` —
      te sama dlugosc (walidator); `None` w probce to wartosc NIEDOSTEPNA (przyczyne
      niesie kanal jakosci albo stan elementu), nigdy liczba podstawiona.
    - `dziedzina_fizyki` wyprowadzona z mapy dziedzin produktu (walidator odrzuca inna).
    - `probki` domyslnie PUSTE w kontenerze zapisanym w `CanonicalRun.raw_result`
      (szeregi czasowe zyja w `canonical_run_time_series`) — kontener z
      niepustymi `probki` istnieje WYLACZNIE w odpowiedzi endpointu
      `.../time-series`, nigdy w wierszu biegu.
    - Kazdy `float` skwantyzowany do 9 cyfr znaczacych na granicy kontraktu
      (`zbuduj_resultset_dynamiczny_v2`), zero NaN/Inf (fail-closed).
    - Kazdy model kontraktu odrzuca pola nieznane (`extra = forbid`): schemat JSON
      `backend/schemas/resultset_dynamic_v2_schema.json` jest scisly i przypiety
      testem do modelu.
    """

    kontrakt: Literal["resultset_dynamic_v2"] = RESULTSET_DYNAMIC_CONTRACT
    run_id: str = Field(min_length=1)
    analysis_type: Literal["dynamika_rms"] = "dynamika_rms"
    dziedzina_fizyki: tuple[DziedzinaFizyki, ...]
    kanaly: tuple[KanalDynamicznyV2, ...] = ()
    os_czasu_s: tuple[float, ...] = Field(default=(), description=OPIS_ROZDZIELCZOSCI_CZASU)
    strona_probki: tuple[StronaProbki, ...] = ()
    probki: dict[str, tuple[float | None, ...]] = Field(default_factory=dict)
    zdarzenia_wykonane: tuple[ZdarzenieWykonaneV2, ...] = ()
    tryb_scenariusza: TrybScenariusza
    przekroczenia: tuple[PrzekroczenieV2, ...] = ()
    wlasnosci_biegu: WlasnosciBieguV2
    tozsamosc: TozsamoscBieguDynamicznegoV2
    metryki: tuple[MetrykaDynamicznaV2, ...] = ()
    stopien_dowodowy: tuple[StopienDowodowyV2, ...] = ()
    zalozenia: tuple[str, ...] = ()

    model_config = {"frozen": True, "extra": "forbid"}

    @model_validator(mode="after")
    def _spojnosc_osi_i_dziedziny(self) -> ResultSetDynamicV2:
        if len(self.strona_probki) != len(self.os_czasu_s):
            raise ValueError(
                f"strona_probki ({len(self.strona_probki)}) i os_czasu_s "
                f"({len(self.os_czasu_s)}) muszą mieć tę samą długość"
            )
        rozne = sorted(k for k, v in self.probki.items() if len(v) != len(self.os_czasu_s))
        if rozne:
            raise ValueError(f"Szeregi o długości innej niż oś czasu: {rozne[:5]}")
        if self.dziedzina_fizyki != dziedzina_fizyki_dynamiki():
            raise ValueError(
                f"dziedzina_fizyki {self.dziedzina_fizyki} różna od mapy dziedzin produktu "
                f"{dziedzina_fizyki_dynamiki()}"
            )
        return self


def zbuduj_resultset_dynamiczny_v2(
    wynik: ResultSetDynamicV2, *, z_probkami: bool
) -> dict[str, Any]:
    """Zserializuj `ResultSetDynamicV2` do slownika skwantyzowanego (DT-11).

    `z_probkami=False` (domyslne dla `CanonicalRun.raw_result`): `os_czasu_s`
    i `probki` wychodza PUSTE — szeregi zyja w osobnej tabeli i wracaja
    wylacznie z endpointu `.../time-series`. `z_probkami=True` jest uzywane
    WYLACZNIE przy budowie odpowiedzi tego endpointu (dane pochodza wtedy z
    `canonical_run_time_series`, nie z tego samego obiektu co metadane —
    wolajacy scala oba zrodla przed wywolaniem tej funkcji z `z_probkami=True`).
    """
    surowy = wynik.model_dump(mode="json")
    if not z_probkami:
        surowy["os_czasu_s"] = []
        surowy["strona_probki"] = []
        surowy["probki"] = {}
    return kwantyzuj_kontrakt(surowy)


__all__ = [
    "RESULTSET_DYNAMIC_CONTRACT",
    "RODZAJ_ANALIZY_DYNAMIKI",
    "KanalDynamicznyV2",
    "MetrykaDynamicznaV2",
    "OPIS_ROZDZIELCZOSCI_CZASU",
    "KierunekPrzekroczenia",
    "OdbiorOdcietyV2",
    "PrzekroczenieV2",
    "PrzestrzenKanalu",
    "PrzypisanieWykonaneV2",
    "ResultSetDynamicV2",
    "StopienDowodowyV2",
    "TozsamoscBieguDynamicznegoV2",
    "WlasnosciBieguV2",
    "StronaProbki",
    "TrybScenariusza",
    "ZdarzenieWykonaneV2",
    "dziedzina_fizyki_dynamiki",
    "zbuduj_resultset_dynamiczny_v2",
]
