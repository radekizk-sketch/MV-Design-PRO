"""
BayTemplate — kanoniczne szablony pól rozdzielczych SN (PR-3 rebuild SLD).

Każdy szablon definiuje:
- kanoniczną sekwencję aparatury (Q-szynowy → CB → Q-liniowy → CT → ES → głowica),
- listę portów technicznych (Port) wymaganych dla pola,
- bay_role mapping na PortKind.

Brief 2 §6/9 + plan rebuild §3 + STATION_INTERNAL_SLD.md.
"""

from __future__ import annotations

from collections.abc import Collection, Iterable
from typing import Any, Literal

from enm.rola_pola_sn import (
    RolaPolaModelu,
    nazwa_roli_pola_sn,
    nazwa_roli_pola_sn_z_okresleniem,
)
from network_model.brak_zasobu import BrakZasobuError
from network_model.catalog.funkcje_eaz import (
    funkcja_eaz,
    kody_spoza_slownika,
    opis_funkcji_eaz_pl,
)
from network_model.catalog.obwody_wtorne_pola import (
    OBWODY_WTORNE_WYKONANIA_POLA,
    RODZAJ_APARATU_WEJSCIA,
    ObwodyWtornePola,
    StatusWeryfikacji,
)
from network_model.catalog.przekladniki import (
    RdzenPrzekladnikaPradowego,
    UzwojeniePrzekladnikaNapieciowego,
)
from network_model.catalog.rodzaje_aparatury import (
    KLUCZ_ODGALEZIENIA,
    RODZAJE_LACZNIKOW_TORU,
    RODZAJE_Z_WYKONANIEM,
    WykonanieAparatu,
    porty_toru_pola,
)
from pydantic import BaseModel, Field, model_validator

#: Osie szablonu pola liniowego GPZ (opis przy szablonach `BAY_TEMPLATES_GPZ_LINE`).
WykonaniePolaLiniowegoGpz = Literal["Z10", "Z11_1", "Z11"]
WykonanieLacznikowPola = Literal["TROJPOLOZENIOWY", "STALY_Z_ODLACZNIKIEM", "WYSUWNY"]


class BayDeviceTemplate(BaseModel):
    """Szablon aparatu w polu — kanoniczna pozycja i typ."""

    kind: Literal[
        "CB",  # wyłącznik
        "DS_BUS",  # odłącznik szynowy
        "DS_LINE",  # odłącznik liniowy
        "DS_BRANCH",  # odłącznik odgałęzienia (przekładnika napięciowego, Z.11/Z.11.1)
        "ES",  # uziemnik (boczny)
        "CT",  # przekładnik prądowy (w osi)
        "VT",  # przekładnik napięciowy (boczny)
        "FUSE",
        "SURGE_ARRESTER",  # ogranicznik przepięć
        "CABLE_HEAD",  # głowica kablowa (trójkąt)
        "TRANSFORMER_DEVICE",  # transformator pola
        "THREE_POSITION_SWITCH",  # łącznik trójpołożeniowy (SF6, ENEA Zeszyt 1 §13, Z.10)
        "VOLTAGE_INDICATOR",  # pojemnościowy wskaźnik napięcia (odgałęzienie jednoportowe)
        "CORE_BALANCE_CT",  # przekładnik Ferrantiego na kablu (bez przerwy toru)
        "UNBALANCE_CT",  # przekładnik niezrównoważenia baterii (połączenie międzygwiazdowe)
        "PHASE_TO_PHASE_VT",  # przekładnik napięciowy międzyfazowy (rozładowanie baterii)
    ]
    designation_q: str  # oznaczenie Q (Q1, Q2, ...)
    position: int  # 0..n od góry do dołu
    placement: Literal["UPSTREAM", "MIDSTREAM", "DOWNSTREAM", "OFF_PATH", "GROUND_BRANCH"]
    optional: bool = False
    # Podstawa pozycji w szablonie (rysunek/punkt standardu), np. „ENEA Zeszyt 1, Z.10".
    # Szablon bez podstawy normatywnej (kanon pól RMU) — None.
    podstawa: str | None = None
    # Pozycja katalogowa aparatu, gdy szablon wskazuje typ (reguła 10 — wiązanie katalogowe);
    # None = szablon nie przesądza typu (aparat jako wartość robocza, `dane_przyjete`).
    catalog_ref: str | None = None
    # Odgałęzienie toru, w którym aparat leży (`rodzaje_aparatury.KLUCZ_ODGALEZIENIA`): aparaty
    # o tym samym identyfikatorze tworzą odgałęzienie zaczynające się na węźle toru głównego
    # bieżącym przy pierwszym z nich (Z.11/Z.11.1: przekładnik napięciowy za wyłącznikiem,
    # przed przekładnikiem prądowym). None = aparat toru głównego albo przyłączony do jego węzła.
    odgalezienie: str | None = None
    # Tabliczka przekładnika wg rysunku standardu (`przekladniki`): rdzenie CT, uzwojenia VT.
    rdzenie: list[RdzenPrzekladnikaPradowego] = Field(default_factory=list)
    uzwojenia: list[UzwojeniePrzekladnikaNapieciowego] = Field(default_factory=list)
    # Przekładnia przekładnika Ferrantiego zapisana jak na rysunku standardu (Z.10/Z.11/Z.11.1:
    # „1/100") — WYŁĄCZNIE `CORE_BALANCE_CT`; rysunek nie podaje mocy ani klasy, więc to nie
    # rdzeń `RdzenPrzekladnikaPradowego`. None = szablon jej nie przesądza.
    przekladnia: str | None = Field(default=None, min_length=1)
    # Wykonanie wyłącznika (`rodzaje_aparatury.WykonanieAparatu`): stałe albo wysuwne — WYŁĄCZNIE
    # `CB`. Wartość domyślna rekordu aparatu (`template_primary_devices`), edytowalna w
    # inspektorze pola. None = szablon nie przesądza (pola RMU).
    wykonanie: WykonanieAparatu | None = None

    @model_validator(mode="after")
    def _tabliczka_zgodna_z_rodzajem(self) -> BayDeviceTemplate:
        if self.wykonanie is not None and self.kind not in RODZAJE_Z_WYKONANIEM:
            raise ValueError(
                f"Szablon aparatu {self.designation_q}: wykonanie (stałe / wysuwne) wyłącznie "
                "dla wyłącznika."
            )
        if self.rdzenie and self.kind != "CT":
            raise ValueError(f"Szablon aparatu {self.designation_q}: rdzenie wyłącznie dla CT.")
        if self.uzwojenia and self.kind != "VT":
            raise ValueError(f"Szablon aparatu {self.designation_q}: uzwojenia wyłącznie dla VT.")
        if self.przekladnia is not None and self.kind != "CORE_BALANCE_CT":
            raise ValueError(
                f"Szablon aparatu {self.designation_q}: przekładnia wyłącznie dla przekładnika "
                "Ferrantiego."
            )
        return self


class BayPortTemplate(BaseModel):
    """Szablon portu pola — wnioskowany z roli."""

    kind: Literal[
        "sn_input",
        "sn_output",
        "sn_branch",
        "sn_transformer",
        "sn_measurement",
        "sn_der_pv",
        "sn_der_bess",
        "sn_der_fw",
        "sn_coupler",
        "sn_reserve",
        "nn_feeder",
        "nn_load",
        "nn_der_pv",
        "nn_der_bess",
        "nn_der_fw",
    ]
    suffix: str  # sufiks dla port_id (np. "in", "out", "trafo")


class BayTemplate(BaseModel):
    """Kanoniczny szablon pola SN (PR-3 rebuild SLD).

    Reużywany przez Builder przy tworzeniu nowego pola w stacji / GPZ.
    """

    template_id: str
    name: str  # PL: nazwa roli z kanonu `enm.rola_pola_sn` (karta #141) albo nazwa funkcji
    bay_role: RolaPolaModelu
    description: str
    devices: list[BayDeviceTemplate] = Field(default_factory=list)
    ports: list[BayPortTemplate] = Field(default_factory=list)
    # Podstawa szablonu (standard, rysunek, wariant), np. „ENEA Zeszyt 1, Z.10 (s.89)".
    podstawa: str | None = None
    # Wariant rysunku aparatów pola (`BayPrimaryDevice.render_variant`): „kanoniczny" —
    # glify SLD v3; „qet_en60617" — geometria QElectroTech z kolekcji EN 60617.
    render_variant: str = "kanoniczny"
    # Funkcje EAZ pola (kody słownika `funkcje_eaz`) — zestaw należy do SZABLONU, nie do roli
    # (Z.10 ≠ Z.11 przy tej samej roli). Pusta lista = pole bez funkcji wyzwalających (pole
    # rezerwowe, pomiarowe, pole potrzeb własnych z bezpiecznikiem) — uczciwie puste.
    funkcje_eaz: list[str] = Field(default_factory=list)
    # Osie szablonu pola liniowego GPZ (None = szablon spoza standardu ENEA).
    wykonanie_pola: WykonaniePolaLiniowegoGpz | None = None
    wykonanie_lacznikow: WykonanieLacznikowPola | None = None
    # Szablon wyłącznie dla rozdzielnicy SN stacji GPZ 110 kV/SN (kreator stacji SN/nN go nie
    # pokazuje).
    tylko_gpz: bool = False
    # Obwody wtórne wzorca (`obwody_wtorne_pola`): funkcja EAZ → rdzeń CT / uzwojenie VT /
    # przekładnik Ferrantiego / sygnał, sygnały do wyłącznika i obwody okrężne rysunku.
    # None = szablon bez rysunku obwodów wtórnych (kanon pól RMU, pola GPZ poza liniowym).
    obwody_wtorne: ObwodyWtornePola | None = None

    @model_validator(mode="after")
    def _funkcje_ze_slownika(self) -> BayTemplate:
        nieznane = kody_spoza_slownika(self.funkcje_eaz)
        if nieznane:
            raise ValueError(
                f"Szablon {self.template_id}: kody funkcji EAZ spoza słownika: {nieznane}."
            )
        if self.obwody_wtorne is not None:
            _sprawdz_obwody_wtorne(self)
        return self


def _sprawdz_obwody_wtorne(szablon: BayTemplate) -> None:
    """Obwody wtórne wzorca zgodne z aparatami i funkcjami szablonu: każda funkcja zestawu
    rysunku powiązana dokładnie raz (i żadna spoza zestawu), wejście wskazuje aparat właściwego
    rodzaju i istniejący rdzeń/uzwojenie, wyłącznik wykonawczy jest wyłącznikiem, a każdy rdzeń
    CT i każde uzwojenie VT ma dokładnie jedno przeznaczenie na rysunku (funkcja EAZ albo
    odbiornik pomiarowy, albo jawne „niepodłączone")."""
    obwody = szablon.obwody_wtorne
    assert obwody is not None
    # Nazwa szablonu w komunikacie (nie identyfikator — `nazwa_bez_identyfikatora_guard`).
    nazwa = szablon.description
    aparaty = {d.designation_q: d for d in szablon.devices}
    powiazane = [p.funkcja for p in obwody.powiazania]
    if sorted(powiazane) != sorted(szablon.funkcje_eaz):
        raise ValueError(
            f"Szablon {nazwa}: powiązania obwodów wtórnych {sorted(powiazane)} ≠ funkcje EAZ "
            f"szablonu {sorted(szablon.funkcje_eaz)}."
        )
    liczba_obwodow = {"CT": "rdzenie", "VT": "uzwojenia"}
    rodzaj_wejscia = RODZAJ_APARATU_WEJSCIA

    def _obwod(oznaczenie: str, rodzaj: str, numer: int | None, kto: str) -> None:
        aparat = aparaty.get(oznaczenie)
        if aparat is None or aparat.kind != rodzaj:
            raise ValueError(f"Szablon {nazwa}, {kto}: {oznaczenie} nie jest aparatem {rodzaj}.")
        if numer is not None and numer > len(getattr(aparat, liczba_obwodow[rodzaj])):
            raise ValueError(f"Szablon {nazwa}, {kto}: {oznaczenie} nie ma obwodu nr {numer}.")

    obwody_eaz: set[tuple[str, int]] = set()
    for p in obwody.powiazania:
        if p.wylacznik is not None and getattr(aparaty.get(p.wylacznik), "kind", None) != "CB":
            raise ValueError(f"Szablon {nazwa}, {p.funkcja}: {p.wylacznik} nie jest wyłącznikiem.")
        for w in p.wejscia:
            if w.aparat is None:
                continue
            _obwod(w.aparat, rodzaj_wejscia[w.rodzaj], w.numer, p.funkcja)
            if w.numer is not None:
                obwody_eaz.add((w.aparat, w.numer))
    obwody_poza: set[tuple[str, int]] = set()
    for przypisanie in obwody.obwody_przekladnikow:
        klucz = (przypisanie.aparat, przypisanie.numer)
        rodzaj = getattr(aparaty.get(przypisanie.aparat), "kind", "")
        if rodzaj not in liczba_obwodow:
            raise ValueError(f"Szablon {nazwa}: {przypisanie.aparat} nie jest przekładnikiem.")
        _obwod(przypisanie.aparat, rodzaj, przypisanie.numer, "przypisanie obwodu")
        if klucz in obwody_eaz or klucz in obwody_poza:
            raise ValueError(f"Szablon {nazwa}: obwód {klucz} ma dwa przeznaczenia.")
        obwody_poza.add(klucz)
    wszystkie = {
        (d.designation_q, n)
        for d in szablon.devices
        if d.kind in liczba_obwodow
        for n in range(1, len(getattr(d, liczba_obwodow[d.kind])) + 1)
    }
    if wszystkie != obwody_eaz | obwody_poza:
        raise ValueError(
            f"Szablon {nazwa}: obwody przekładników bez przeznaczenia na rysunku: "
            f"{sorted(wszystkie - obwody_eaz - obwody_poza)}."
        )


# ---------------------------------------------------------------------------
# Kanoniczne 10 szablonów BayTemplate (brief 2 §3 + STATION_INTERNAL_SLD §3)
# ---------------------------------------------------------------------------

BAY_TEMPLATE_LINE_IN = BayTemplate(
    template_id="bay_template_line_in",
    name=nazwa_roli_pola_sn("LINIA_IN"),
    bay_role="IN",
    description="Pole liniowe wejściowe SN — kabel/linia od ciągu nadrzędnego.",
    devices=[
        BayDeviceTemplate(kind="DS_BUS", designation_q="Q1", position=0, placement="UPSTREAM"),
        BayDeviceTemplate(kind="CB", designation_q="Q0", position=1, placement="MIDSTREAM"),
        BayDeviceTemplate(kind="CT", designation_q="T1", position=2, placement="MIDSTREAM"),
        BayDeviceTemplate(kind="DS_LINE", designation_q="Q9", position=3, placement="DOWNSTREAM"),
        BayDeviceTemplate(kind="ES", designation_q="Q8", position=4, placement="GROUND_BRANCH"),
        BayDeviceTemplate(
            kind="CABLE_HEAD", designation_q="GK", position=5, placement="DOWNSTREAM"
        ),
    ],
    # Pole dopływowe: nadprądowe zwłoczne + zwarciowe + ziemnozwarciowe (PTPiREE/IRiESD).
    funkcje_eaz=["51", "50", "51N"],
    ports=[BayPortTemplate(kind="sn_input", suffix="in")],
)

BAY_TEMPLATE_LINE_OUT = BayTemplate(
    template_id="bay_template_line_out",
    name=nazwa_roli_pola_sn("LINIA_OUT"),
    bay_role="OUT",
    description="Pole liniowe wyjściowe SN — kabel/linia do ciągu podrzędnego.",
    devices=[
        BayDeviceTemplate(kind="DS_BUS", designation_q="Q1", position=0, placement="UPSTREAM"),
        BayDeviceTemplate(kind="CB", designation_q="Q0", position=1, placement="MIDSTREAM"),
        BayDeviceTemplate(kind="CT", designation_q="T1", position=2, placement="MIDSTREAM"),
        BayDeviceTemplate(kind="DS_LINE", designation_q="Q9", position=3, placement="DOWNSTREAM"),
        BayDeviceTemplate(kind="ES", designation_q="Q8", position=4, placement="GROUND_BRANCH"),
        BayDeviceTemplate(
            kind="CABLE_HEAD", designation_q="GK", position=5, placement="DOWNSTREAM"
        ),
    ],
    # Pole odpływowe: + kierunkowe ziemnozwarciowe (sieci skompensowane/izolowane).
    funkcje_eaz=["51", "50", "51N", "67N"],
    ports=[BayPortTemplate(kind="sn_output", suffix="out")],
)

# ---------------------------------------------------------------------------
# UX-04/POLE-LINIOWE-WZORZEC: pola liniowe SN rozdzielni GPZ 110 kV/SN wg standardu ENEA
# Operator „Stacje elektroenergetyczne 110 kV", Zeszyt 1 — rysunki Z.10 (s.89) „Pole linii
# odpływowej SN", Z.11.1 (s.91) „Pole linii SN z pomiarem napięcia zwrotnego", Z.11 (s.90)
# „Pole linii SN z pomiarem rozliczeniowym energii i napięcia zwrotnego" oraz §13 „Rozdzielnia
# SN" (druk s.23–26). Odczyt rysunków (pozycje, kolejność, interpretacje):
# `docs/uiux/GPZ_SN_ENEA_ODCZYT_RYSUNKOW_2026-10-28.md`. Szablony RMU (`bay_template_line_out`)
# opisują stacje SN/nN, których ten standard nie obejmuje — dlatego pole GPZ ma WŁASNE szablony.
#
# DWIE OSIE SZABLONU (iloczyn 3 × 3 = 9 szablonów, bez medium w szablonie):
#
# * `wykonanie_pola` — rysunek standardu: Z.10 (pole odbiorcze), Z.11.1 (z przekładnikiem
#   napięciowym od strony linii — napięcie zwrotne), Z.11 (jak Z.11.1 + przekładnik prądowy
#   trójrdzeniowy z rdzeniem rozliczeniowym i analizatorem jakości energii);
# * `wykonanie_lacznikow` — §13: łącznik trójpołożeniowy przy szynie (rozdzielnice z izolacją
#   gazową i stało-powietrzną), wyłącznik stały z odłącznikiem szynowym albo wyłącznik poziomo
#   wysuwny na wózku (izolacja powietrzna, „w uzasadnionych przypadkach"). Wykonanie zmienia
#   SEKWENCJĘ aparatów (odłącznik szynowy, uziemnik stały wyprowadzenia), więc jest osią
#   szablonu, a nie atrybutem rodziny.
#
# IZOLACJA I MEDIUM — WYŁĄCZNIE z rodziny rozdzielnicy pola (`Bay.switchgear_family_ref →
# insulation_type / medium_lacznikow`), nigdy z identyfikatora szablonu. Zgodność wykonania
# łączników z izolacją rozstrzyga `odmowa_wykonania_lacznikow_w_izolacji` (łącznik
# trójpołożeniowy w rozdzielnicy z izolacją powietrzną → odmowa, §13); zakaz gazów
# fluorowanych w obiektach projektowanych — `network_model/catalog/gazy_fluorowane`.
#
# Wspólny tor: (wskaźnik napięcia przy szynie — Z.11, Z.11.1) → łączniki przy szynie →
# wyłącznik próżniowy z napędem (§13) → [odgałęzienie przekładnika napięciowego za wyłącznikiem,
# przed przekładnikiem prądowym — Z.11, Z.11.1] → przekładnik prądowy w torze (P1 od wyłącznika)
# → wskaźnik napięcia od strony kabla → [uziemnik stały wyprowadzenia — wykonania bez łącznika
# trójpołożeniowego, §13 „uziemienie wyprowadzeń uziemnikami stałymi"] → głowica kablowa →
# przekładnik Ferrantiego na kablu (1/100, bez przerwy toru). Odłącznika liniowego i osobnego
# uziemnika kabla przy łączniku trójpołożeniowym standard NIE rysuje: kabel uziemia się przez
# zamknięty wyłącznik przy łączniku trójpołożeniowym w położeniu „uziemiony" (§13, druk s.25).
#
# Oznaczenia aparatów — WARTOŚĆ ROBOCZA (ZASADA NR 4), dana modelu edytowalna przez projektanta,
# z JEDNEGO schematu: praktyka DIN 40719-2 dla łączników (Q0 wyłącznik albo rozłącznik toru, Q1
# i Q2 odłączniki szynowe, Q8 uziemnik, Q9 odłącznik liniowy), T1 przekładnik prądowy toru,
# T2 przekładnik Ferrantiego; odgałęzienie przekładnika napięciowego Q5/Q51/GK1/T3 i głowica GK
# to oznaczenia robocze bez podstawy normowej. Rysunki ENEA oznaczeń literowo-cyfrowych NIE
# podają — szablon nie twierdzi zgodności oznaczeń z ENEA. Ten sam schemat proponują: konfiguracje
# pól silnika referencyjnego (`reference_engine.field_configuration_catalog`) i adapter schematu
# GPZ (`enmToCanonicalGpzAdapter.ts`, rekord bez oznaczenia); jednoznaczność oznaczeń w polu
# pilnuje walidator (W063, `enm.oznaczenia_aparatow_pola`). Wskaźnik napięcia
# ma oznaczenie „PF…" (litera klasy P — prezentacja informacji, IEC 81346-2), a NIE „P1":
# w polu z przekładnikiem prądowym „P1"/„P2" to zaciski pierwotne przekładnika, a „P1" jest
# też wzorcem kryptonimu zakazanym w tekstach UI (CLAUDE.md reguła 8).
# ---------------------------------------------------------------------------

WYKONANIA_POLA_LINIOWEGO_GPZ: tuple[str, ...] = ("Z10", "Z11_1", "Z11")
WYKONANIA_LACZNIKOW_POLA: tuple[str, ...] = (
    "TROJPOLOZENIOWY",
    "STALY_Z_ODLACZNIKIEM",
    "WYSUWNY",
)
NAZWY_WYKONANIA_POLA_PL: dict[str, str] = {
    "Z10": "pole linii odpływowej SN (ENEA Z.10)",
    "Z11_1": "pole linii SN z pomiarem napięcia zwrotnego (ENEA Z.11.1)",
    "Z11": "pole linii SN z pomiarem rozliczeniowym energii i napięcia zwrotnego (ENEA Z.11)",
}
NAZWY_WYKONANIA_LACZNIKOW_PL: dict[str, str] = {
    "TROJPOLOZENIOWY": "łącznik trójpołożeniowy przy szynie",
    "STALY_Z_ODLACZNIKIEM": "wyłącznik stały z odłącznikiem szynowym",
    "WYSUWNY": "wyłącznik poziomo wysuwny na wózku",
}
_PODSTAWA_WYKONANIA_POLA: dict[str, str] = {
    "Z10": "ENEA Zeszyt 1, Z.10 (s.89)",
    "Z11_1": "ENEA Zeszyt 1, Z.11.1 (s.91)",
    "Z11": "ENEA Zeszyt 1, Z.11 (s.90)",
}
_PODSTAWA_P13 = "ENEA Zeszyt 1, §13 (druk s.23–26)"

#: Izolacja rozdzielnicy (`SwitchgearFamily.insulation_type`), w której standard NIE dopuszcza
#: wykonania łączników: §13 dla izolacji powietrznej wymienia wyłącznie wyłącznik stały
#: z odłącznikiem szynowym albo wyłącznik poziomo wysuwny z wózkiem.
_WYKONANIA_NIEDOPUSZCZONE_W_IZOLACJI: dict[str, frozenset[str]] = {
    "air": frozenset({"TROJPOLOZENIOWY"}),
}
KOD_ODMOWY_WYKONANIA_LACZNIKOW = "pole.wykonanie_lacznikow_niezgodne_z_izolacja"


def odmowa_wykonania_lacznikow_w_izolacji(
    wykonanie_lacznikow: str | None, insulation_type: str | None, *, nazwa_rodziny: str
) -> str | None:
    """Zdanie odmowy, gdy wykonanie łączników szablonu pola nie jest dopuszczone w izolacji
    rodziny rozdzielnicy (§13); `None` — zgodne albo brak danej (szablon bez osi wykonania,
    rodzina bez izolacji). JEDNO źródło dla operacji (zapis pola) i walidatora (model wczytany).
    """
    if wykonanie_lacznikow is None or insulation_type is None:
        return None
    if wykonanie_lacznikow not in _WYKONANIA_NIEDOPUSZCZONE_W_IZOLACJI.get(insulation_type, ()):
        return None
    dopuszczone = ", ".join(
        NAZWY_WYKONANIA_LACZNIKOW_PL[w]
        for w in WYKONANIA_LACZNIKOW_POLA
        if w not in _WYKONANIA_NIEDOPUSZCZONE_W_IZOLACJI[insulation_type]
    )
    return (
        f"Rozdzielnica {nazwa_rodziny} ma izolację powietrzną — {_PODSTAWA_P13} dopuszcza w niej "
        f"wyłącznie: {dopuszczone}. Wykonanie „{NAZWY_WYKONANIA_LACZNIKOW_PL[wykonanie_lacznikow]}” "
        "wymaga rozdzielnicy z izolacją gazową bez gazów fluorowanych albo stało-powietrzną: "
        "zmień wykonanie łączników pola albo rodzinę rozdzielnicy."
    )


# ---------------------------------------------------------------------------
# Funkcje EAZ WARUNKOWE (decyzja właściciela 2026-10-29, karta UX-04/POLE-LINIOWE-WZORZEC).
# Funkcja, której wielkości wejściowej pole nie dostarcza samo, trafia do zestawu funkcji pola
# (`Bay.protection_codes`) WYŁĄCZNIE przy spełnionym warunku rozstrzygniętym na MODELU
# (`enm.zrodlo_napiecia_zerowego.warunki_funkcji_eaz_pola`). Rysunek standardu ją niesie
# (`BayTemplate.funkcje_eaz`, `PozycjaProfiluEaz.na_rysunku`), ale przypisanie bez potwierdzonego
# źródła byłoby funkcją bez wejścia — fikcją, a nie zabezpieczeniem.
#
# 67N (kierunkowe ziemnozwarciowe): ENEA Zeszyt 1, Z.10 (s.89) i Z.11.1 (s.91) — blok
# „Zab. ziemnozwarciowe" ma wejście I0 z przekładnika Ferrantiego 1/100 i wejście U0 z obwodu
# okrężnego „Z, Zz"; obwód „Z, Zz" WYCHODZI z pola pomiaru napięcia SN (Z.17, s.97): uzwojenie III
# przekładnika SN/√3 / 0,1/√3 / 0,1/√3 / 0,1/3 (15 VA, kl. 3P) w otwartym trójkącie zasila
# wejście Uo> sterownika pola i obwód okrężny „Z,Zz". Zeszyt 1 §26.9: zabezpieczenia od zwarć
# doziemnych pól liniowych mierzą „składowe zerowe prądu (I0) i napięcia (U0)". Ten sam warunek
# obowiązuje KAŻDY szablon i każdą drogę przypisania (szablon kanonu, szablon producenta, rola
# pola) — `bez_niespelnionych_warunkow`.
# ---------------------------------------------------------------------------

#: Warunek przypisania funkcji 67N: źródło 3U₀ i kryterium prądowe I0 potwierdzone w modelu.
WARUNEK_ZRODLA_U0 = "ZRODLO_U0"
#: Funkcja warunkowa → warunek jej przypisania (lista ZAMKNIĘTA, przypięta testem
#: `tests/enm/test_zrodlo_napiecia_zerowego.py`).
WARUNKI_FUNKCJI_EAZ: dict[str, str] = {"67N": WARUNEK_ZRODLA_U0}
OPIS_WARUNKU_FUNKCJI_EAZ_PL: dict[str, str] = {
    WARUNEK_ZRODLA_U0: (
        "przypisana wyłącznie przy źródle napięcia zerowego 3U₀ powiązanym w modelu — uzwojeniu "
        "otwartego trójkąta przekładnika napięciowego pola pomiaru napięcia szyn tej samej sekcji "
        "(ENEA Zeszyt 1, Z.17 s.97, obwód okrężny „Z, Zz”) albo tego pola — i kryterium prądowym "
        "z przekładnika Ferrantiego pola"
    ),
}


def bez_niespelnionych_warunkow(kody: Iterable[str], warunki: Collection[str]) -> list[str]:
    """Zestaw funkcji bez funkcji warunkowych (`WARUNKI_FUNKCJI_EAZ`), których warunek nie
    jest w ``warunki``. Kolejność wejścia zachowana. JEDNO miejsce reguły dla każdej drogi
    przypisania funkcji EAZ do pola."""
    return [
        kod
        for kod in kody
        if (warunek := WARUNKI_FUNKCJI_EAZ.get(kod)) is None or warunek in warunki
    ]


#: Funkcje EAZ wg rysunku (kody słownika `funkcje_eaz`). Z.10: I>, I>>, zabezpieczenie
#: ziemnozwarciowe z wejściami Io i U0, ZS, LRW, SPZ, SCO (obwody okrężne SCO1, SCO2 i SCO/SPZ
#: do sterownika pola — jedna funkcja `SCO` z ponownym załączeniem po SCO). Blok „Zab.
#: ziemnozwarciowe" rysunku ma wejście Io z przekładnika Ferrantiego (czerwona linia z zacisku 2
#: przekładnika 1/100) i wejście U0 z obwodu okrężnego „Z, Zz" pod znakiem kierunku „↦" nad
#: członami t1, t2 — zestaw rozdziela go na kryterium prądowe Io> (51N, z samego przekładnika
#: Ferrantiego pola, BEZ warunku) i kierunkowe (67N, warunkowe — źródło 3U₀ spoza pola, decyzja
#: właściciela 2026-10-29). Pole bez potwierdzonego źródła 3U₀ ma więc zabezpieczenie
#: ziemnozwarciowe prądowe z przekładnika Ferrantiego, a nie żadnego. Z.11/Z.11.1:
#: I>, I> kierunkowe (ZS), I>>, ziemnozwarciowe, U>, U<, f<, f>, df/dt, ZS, LRW, SPZ, SPZE,
#: wyłączenie od zabezpieczeń transformatora (OWG), automatyka blokowania od napięcia
#: zwrotnego (NZ — Zeszyt 1 §26.9.3 i §26.10.3; rysunek s.91 niesie jej obwód pomiaru napięcia
#: zwrotnego, a lista funkcji §26.9.3 nazywa ją wprost) i SCO z ponownym załączeniem po SCO
#: (obwody okrężne SCO1, SCO2, „SCO/SPZ" na s.90 i s.91 — zweryfikowane na rysunku 2026-10-29;
#: rysunek nie ma osobnego bloku „SPZ po SCO", 400 dpi 2026-10-30). Obwody wtórne każdej
#: funkcji (z czego mierzy, na co działa) — `obwody_wtorne_pola`. Zestaw wg KLASY pola (odbiorcze,
#: mieszane, dedykowane wytwórcy — IRiESD II.4.5.4.2) wyprowadza `funkcje_eaz_pola_liniowego`.
_FUNKCJE_EAZ_WYKONANIA_POLA: dict[str, list[str]] = {
    "Z10": ["51", "50", "51N", "67N", "ZS", "50BF", "79", "SCO"],
    "Z11_1": [
        "51",
        "50",
        "67",
        "51N",
        "67N",
        "27",
        "59",
        "81U",
        "81O",
        "81R",
        "ZS",
        "50BF",
        "79",
        "SPZE",
        "OWG",
        "NZ",
        "SCO",
    ],
}
_FUNKCJE_EAZ_WYKONANIA_POLA["Z11"] = list(_FUNKCJE_EAZ_WYKONANIA_POLA["Z11_1"])

#: Typ katalogowy przekładnika prądowego pola wg rysunku (rdzenie — z pozycji katalogu).
_CT_WYKONANIA_POLA: dict[str, str] = {
    "Z10": "ct_typ_ogolny_osd_200_400_5_5p20_15va",
    "Z11_1": "ct_typ_ogolny_osd_200_400_5_5p20_15va",
    "Z11": "ct_typ_ogolny_osd_200_400_5_5_5_z11",
}


def _rdzenie_typu_ct(catalog_ref: str) -> list[RdzenPrzekladnikaPradowego]:
    """Rdzenie typu katalogowego CT (`mv_auxiliary_catalog`) — JEDNO źródło tabliczki
    przekładnika: szablon pola niesie rdzenie pozycji, którą wskazuje, a nie własną kopię.
    """
    from network_model.catalog.mv_auxiliary_catalog import get_all_ct_types

    for wpis in get_all_ct_types():
        if wpis["id"] == catalog_ref:
            return [
                RdzenPrzekladnikaPradowego.model_validate(r)
                for r in wpis["params"].get("rdzenie") or []
            ]
    raise KeyError(f"Szablon pola wskazuje typ CT spoza katalogu: {catalog_ref}")


_OPIS_CT_WYKONANIA_POLA: dict[str, str] = {
    "Z10": "1 rdzeń 200-400/5 A, 15 VA, 5P20",
    "Z11_1": "1 rdzeń 200-400/5 A, 15 VA, 5P20",
    "Z11": (
        "3 rdzenie 200-400/5/5/5 A: 10 VA 0,2S FS5 (rozliczenie i analizator jakości energii), "
        "10 VA 0,2 FS5 (układy regulacyjne), 15 VA 5P20 (zabezpieczenia)"
    ),
}

#: Uzwojenia przekładnika napięciowego odgałęzienia (Z.11 s.90, Z.11.1 s.91): SN/√3 / 0,1/√3
#: / 0,1/√3 / 0,1/√3 — trzy uzwojenia wtórne fazowe, BEZ otwartego trójkąta (zweryfikowane na
#: rysunkach s.90 i s.91 2026-10-29: czwarty ułamek „0,1/√3", nie „0,1/3"; napięcie zerowe
#: zabezpieczenia ziemnozwarciowego przychodzi obwodami okrężnymi „Z, Zz" z przekładnika
#: szyn — otwarty trójkąt ma wyłącznie pole pomiaru napięcia szyn Z.17) — przekładnia zapisana
#: jak na rysunku („SN" = napięcie sieci), bo szablon
#: obsługuje rozdzielnice 15 kV i 20 kV; typ katalogowy przekładnika (napięcie pierwotne)
#: wybiera projektant w wyposażeniu pola — szablon go nie przesądza. Rozliczenie w uzwojeniu I
#: wyłącznie w Z.11 (pomiar rozliczeniowy, uzwojenie II — układy regulacyjne); w Z.11.1 rysunek
#: pozostawia uzwojenia I i II niepodłączone, a napięcie po stronie linii (napięcie zwrotne)
#: mierzy uzwojenie III — bloki U>/U< i f</f>/df/dt (`obwody_wtorne_pola`, jak w Z.11).
_UZWOJENIA_VT_WYKONANIA_POLA: dict[str, tuple[UzwojeniePrzekladnikaNapieciowego, ...]] = {
    wykonanie: (
        UzwojeniePrzekladnikaNapieciowego(
            przekladnia="SN/√3 / 0,1/√3",
            moc_va=10.0,
            klasa="0,2",
            przeznaczenie=("ROZLICZENIE",) if wykonanie == "Z11" else ("POMIAR",),
        ),
        UzwojeniePrzekladnikaNapieciowego(
            przekladnia="SN/√3 / 0,1/√3",
            moc_va=7.5,
            klasa="0,2",
            przeznaczenie=("POMIAR",),
        ),
        UzwojeniePrzekladnikaNapieciowego(
            przekladnia="SN/√3 / 0,1/√3",
            moc_va=7.5,
            klasa="0,5/3P",
            przeznaczenie=("POMIAR", "ZABEZPIECZENIA"),
        ),
    )
    for wykonanie in ("Z11_1", "Z11")
}
#: Identyfikator odgałęzienia przekładnika napięciowego (`BayDeviceTemplate.odgalezienie`):
#: węzły odgałęzienia `pn1`, `pn2`… (`rodzaje_aparatury.porty_toru_pola`).
ODGALEZIENIE_PRZEKLADNIKA_NAPIECIOWEGO = "pn"


def _sekwencja_pola_liniowego_gpz(
    wykonanie_pola: str, wykonanie_lacznikow: str
) -> list[BayDeviceTemplate]:
    podstawa = _PODSTAWA_WYKONANIA_POLA[wykonanie_pola]
    z_vt = wykonanie_pola in ("Z11_1", "Z11")
    trojpolozeniowy = wykonanie_lacznikow == "TROJPOLOZENIOWY"
    plan: list[dict[str, Any]] = []
    if z_vt:
        plan.append(
            {
                "kind": "VOLTAGE_INDICATOR",
                "designation_q": "PF0",
                "placement": "OFF_PATH",
                "podstawa": f"{podstawa} — wskaźnik napięcia przy szynie",
            }
        )
    if trojpolozeniowy:
        plan.append(
            {
                "kind": "THREE_POSITION_SWITCH",
                "designation_q": "Q1",
                "placement": "UPSTREAM",
                "podstawa": f"{podstawa} — łącznik trójpołożeniowy; {_PODSTAWA_P13}",
            }
        )
    elif wykonanie_lacznikow == "STALY_Z_ODLACZNIKIEM":
        plan.append(
            {
                "kind": "DS_BUS",
                "designation_q": "Q1",
                "placement": "UPSTREAM",
                "podstawa": f"{_PODSTAWA_P13} — wyłącznik stały z odłącznikiem szynowym",
            }
        )
    plan.append(
        {
            "kind": "CB",
            "designation_q": "Q0",
            "placement": "MIDSTREAM",
            "wykonanie": "WYSUWNE" if wykonanie_lacznikow == "WYSUWNY" else "STALE",
            "podstawa": (
                f"{podstawa} — wyłącznik z napędem; {_PODSTAWA_P13} — wyłącznik próżniowy"
                + (", poziomo wysuwny na wózku" if wykonanie_lacznikow == "WYSUWNY" else "")
            ),
        }
    )
    if z_vt:
        odg = ODGALEZIENIE_PRZEKLADNIKA_NAPIECIOWEGO
        podstawa_odg = f"{podstawa} — odgałęzienie przekładnika napięciowego za wyłącznikiem"
        if trojpolozeniowy:
            plan.append(
                {
                    "kind": "THREE_POSITION_SWITCH",
                    "designation_q": "Q5",
                    "placement": "OFF_PATH",
                    "odgalezienie": odg,
                    "podstawa": f"{podstawa_odg}: odłącznik z uziemieniem",
                }
            )
        else:
            plan.append(
                {
                    "kind": "DS_BRANCH",
                    "designation_q": "Q5",
                    "placement": "OFF_PATH",
                    "odgalezienie": odg,
                    "podstawa": f"{podstawa_odg}: odłącznik",
                }
            )
            plan.append(
                {
                    "kind": "ES",
                    "designation_q": "Q51",
                    "placement": "GROUND_BRANCH",
                    "odgalezienie": odg,
                    "podstawa": f"{podstawa_odg}: uziemnik; {_PODSTAWA_P13} — uziemniki stałe",
                }
            )
        plan.append(
            {
                "kind": "CABLE_HEAD",
                "designation_q": "GK1",
                "placement": "OFF_PATH",
                "odgalezienie": odg,
                "podstawa": f"{podstawa_odg}: głowica (złącze) przekładnika",
            }
        )
        plan.append(
            {
                "kind": "VT",
                "designation_q": "T3",
                "placement": "OFF_PATH",
                "odgalezienie": odg,
                "uzwojenia": list(_UZWOJENIA_VT_WYKONANIA_POLA[wykonanie_pola]),
                "podstawa": (
                    f"{podstawa_odg}: przekładnik napięciowy SN/√3 / 0,1/√3 / 0,1/√3 / 0,1/√3"
                ),
            }
        )
    plan.append(
        {
            "kind": "CT",
            "designation_q": "T1",
            "placement": "MIDSTREAM",
            "catalog_ref": _CT_WYKONANIA_POLA[wykonanie_pola],
            "rdzenie": _rdzenie_typu_ct(_CT_WYKONANIA_POLA[wykonanie_pola]),
            "podstawa": f"{podstawa} — przekładnik prądowy, {_OPIS_CT_WYKONANIA_POLA[wykonanie_pola]}",
        }
    )
    plan.append(
        {
            "kind": "VOLTAGE_INDICATOR",
            "designation_q": "PF1",
            "placement": "OFF_PATH",
            "podstawa": f"{podstawa} — wskaźnik napięcia; {_PODSTAWA_P13} — wskaźniki stacjonarne",
        }
    )
    if not trojpolozeniowy:
        plan.append(
            {
                "kind": "ES",
                "designation_q": "Q8",
                "placement": "GROUND_BRANCH",
                "podstawa": f"{_PODSTAWA_P13} — uziemnik stały wyprowadzenia",
            }
        )
    plan.append(
        {
            "kind": "CABLE_HEAD",
            "designation_q": "GK",
            "placement": "DOWNSTREAM",
            "podstawa": f"{podstawa} — głowica kablowa",
        }
    )
    plan.append(
        {
            "kind": "CORE_BALANCE_CT",
            "designation_q": "T2",
            "placement": "DOWNSTREAM",
            "przekladnia": "1/100",
            "podstawa": f"{podstawa} — przekładnik Ferrantiego 1/100",
        }
    )
    return [BayDeviceTemplate(position=i, **pozycja) for i, pozycja in enumerate(plan)]


def _identyfikator_szablonu_pola_liniowego_gpz(
    wykonanie_pola: str, wykonanie_lacznikow: str
) -> str:
    return f"bay_template_gpz_line_enea_{wykonanie_pola.lower()}_{wykonanie_lacznikow.lower()}"


def _szablon_pola_liniowego_gpz(wykonanie_pola: str, wykonanie_lacznikow: str) -> BayTemplate:
    return BayTemplate(
        template_id=_identyfikator_szablonu_pola_liniowego_gpz(wykonanie_pola, wykonanie_lacznikow),
        name=nazwa_roli_pola_sn("LINIA_OUT"),
        bay_role="OUT",
        description=(
            f"{NAZWY_WYKONANIA_POLA_PL[wykonanie_pola][0].upper()}"
            f"{NAZWY_WYKONANIA_POLA_PL[wykonanie_pola][1:]} rozdzielni GPZ — "
            f"{NAZWY_WYKONANIA_LACZNIKOW_PL[wykonanie_lacznikow]}, wyłącznik próżniowy; "
            "izolacja i medium wg rodziny rozdzielnicy pola."
        ),
        podstawa=f"{_PODSTAWA_WYKONANIA_POLA[wykonanie_pola]}; {_PODSTAWA_P13}",
        render_variant="qet_en60617",
        wykonanie_pola=wykonanie_pola,
        wykonanie_lacznikow=wykonanie_lacznikow,
        tylko_gpz=True,
        funkcje_eaz=list(_FUNKCJE_EAZ_WYKONANIA_POLA[wykonanie_pola]),
        obwody_wtorne=OBWODY_WTORNE_WYKONANIA_POLA[wykonanie_pola],
        devices=_sekwencja_pola_liniowego_gpz(wykonanie_pola, wykonanie_lacznikow),
        ports=[BayPortTemplate(kind="sn_output", suffix="out")],
    )


#: Szablony pola liniowego GPZ — iloczyn wykonania pola × wykonania łączników (kolejność stała).
BAY_TEMPLATES_GPZ_LINE: tuple[BayTemplate, ...] = tuple(
    _szablon_pola_liniowego_gpz(pole, laczniki)
    for pole in WYKONANIA_POLA_LINIOWEGO_GPZ
    for laczniki in WYKONANIA_LACZNIKOW_POLA
)


def szablon_pola_liniowego_gpz(wykonanie_pola: str, wykonanie_lacznikow: str) -> BayTemplate:
    """Szablon pola liniowego GPZ dla pary wykonań (KeyError — para spoza iloczynu)."""
    identyfikator = _identyfikator_szablonu_pola_liniowego_gpz(wykonanie_pola, wykonanie_lacznikow)
    for szablon in BAY_TEMPLATES_GPZ_LINE:
        if szablon.template_id == identyfikator:
            return szablon
    raise KeyError(f"Brak szablonu pola liniowego GPZ: {wykonanie_pola} × {wykonanie_lacznikow}")


#: Szablon domyślny pola liniowego budowanego z GPZ (`domain_operations.create_gpz`): pole
#: odbiorcze Z.10 z łącznikiem trójpołożeniowym (§13 — wykonanie podstawowe rozdzielnic
#: z izolacją gazową i stało-powietrzną). Rodzina z izolacją powietrzną dostaje pierwsze
#: wykonanie dopuszczone w jej izolacji (`szablon_domyslny_pola_liniowego_gpz`).
BAY_TEMPLATE_GPZ_LINE_DOMYSLNY = szablon_pola_liniowego_gpz("Z10", "TROJPOLOZENIOWY")


def szablon_domyslny_pola_liniowego_gpz(insulation_type: str | None) -> BayTemplate:
    """Szablon domyślny pola liniowego GPZ w rozdzielnicy o tej izolacji — pole odbiorcze Z.10
    z PIERWSZYM wykonaniem łączników (kolejność `WYKONANIA_LACZNIKOW_POLA`) dopuszczonym w izolacji
    rodziny przez TĘ SAMĄ tablicę §13, którą czyta odmowa (`odmowa_wykonania_lacznikow_w_izolacji`):
    izolacja powietrzna → wyłącznik stały z odłącznikiem szynowym, pozostałe i brak rodziny →
    łącznik trójpołożeniowy. System proponuje wykonanie zgodne ze standardem zamiast odmawiać
    zapisu (ZASADA NR 4); projektant zmienia je wyborem szablonu."""
    niedopuszczone = _WYKONANIA_NIEDOPUSZCZONE_W_IZOLACJI.get(insulation_type or "", frozenset())
    wykonanie = next(w for w in WYKONANIA_LACZNIKOW_POLA if w not in niedopuszczone)
    return szablon_pola_liniowego_gpz("Z10", wykonanie)


# ---------------------------------------------------------------------------
# Klasa pola liniowego SN GPZ (IRiESD ENEA Operator, wersja 2.3, II.4.5.4.2.1–2.3)
#
# Trzy klasy pola linii SN: ODBIORCZE (bez modułów wytwarzania), MIESZANE (moduły wytwarzania
# i odbiorcy na jednej linii), DEDYKOWANE_WYTWORCY (wyłącznie moduły wytwarzania). Klasa jest
# JEDYNYM źródłem trybu pracy pola: tryb „linia SN z generacją" (katalog sygnałów telemechaniki
# ENEA, sekcja „Linia SN z generacją") = klasa mieszana albo dedykowana. Klasa z generacją
# wymaga przekładnika napięciowego od strony linii (U<, U>, f<, f>, df/dt, blokada załączenia
# przy napięciu w linii — IRiESD II.4.5.4.2.2 pkt 6–7, II.4.5.4.2.3 pkt 5–6), więc dopuszcza
# wyłącznie wykonania Z.11.1 i Z.11; Z.10 (bez przekładnika napięciowego) — wyłącznie pole
# odbiorcze.
# ---------------------------------------------------------------------------

KlasaPolaLiniowego = Literal["ODBIORCZE", "MIESZANE", "DEDYKOWANE_WYTWORCY"]
KLASY_POLA_LINIOWEGO: tuple[str, ...] = ("ODBIORCZE", "MIESZANE", "DEDYKOWANE_WYTWORCY")
KLASY_POLA_Z_GENERACJA: frozenset[str] = frozenset({"MIESZANE", "DEDYKOWANE_WYTWORCY"})
NAZWY_KLASY_POLA_PL: dict[str, str] = {
    "ODBIORCZE": "pole odbiorcze (bez modułów wytwarzania)",
    "MIESZANE": "pole linii mieszanej (moduły wytwarzania i odbiorcy)",
    "DEDYKOWANE_WYTWORCY": "pole dedykowane modułom wytwarzania",
}
_PODSTAWA_IRIESD = "IRiESD ENEA Operator (wersja 2.3)"
PODSTAWA_KLASY_POLA: dict[str, str] = {
    "ODBIORCZE": f"{_PODSTAWA_IRIESD} II.4.5.4.2.1",
    "MIESZANE": f"{_PODSTAWA_IRIESD} II.4.5.4.2.2",
    "DEDYKOWANE_WYTWORCY": f"{_PODSTAWA_IRIESD} II.4.5.4.2.3",
}
#: Wykonania pola dopuszczone w klasie (JEDNO źródło odmowy operacji, walidatora i filtra API).
WYKONANIA_POLA_KLASY: dict[str, tuple[str, ...]] = {
    "ODBIORCZE": ("Z10", "Z11_1", "Z11"),
    "MIESZANE": ("Z11_1", "Z11"),
    "DEDYKOWANE_WYTWORCY": ("Z11_1", "Z11"),
}
KOD_ODMOWY_KLASY_POLA = "pole.klasa_pola_niezgodna_z_wykonaniem"
KOD_ODMOWY_SZABLONU_TYLKO_GPZ = "pole.szablon_tylko_gpz"

WymogFunkcjiEaz = Literal[
    "OBOWIAZKOWA", "NAPOWIETRZNA", "NA_ZADANIE_OSD", "DOPUSZCZALNA", "ZAKAZANA"
]
OPIS_WYMOGU_PL: dict[str, str] = {
    "OBOWIAZKOWA": "wymagana",
    "NAPOWIETRZNA": "wymagana w linii napowietrznej i napowietrzno-kablowej",
    "NA_ZADANIE_OSD": "wymagana, jeżeli zażąda jej operator systemu dystrybucyjnego",
    "DOPUSZCZALNA": "dopuszczalna, niewymagana",
    "ZAKAZANA": "niedopuszczalna",
}


def _wymogi(
    klasa: str, wpisy: tuple[tuple[str, str, str], ...]
) -> tuple[tuple[str, str, str], ...]:
    return tuple((kod, wymog, f"{PODSTAWA_KLASY_POLA[klasa]} {pkt}") for kod, wymog, pkt in wpisy)


#: Wymagania funkcji EAZ wg klasy pola: (kod słownika `funkcje_eaz`, wymóg, podstawa). Funkcje
#: „może wymagać OSD" (`NA_ZADANIE_OSD`) zależą od warunków przyłączenia, których model nie
#: niesie — ich ocena nigdy nie jest „spełnia" (`enm.pole_liniowe_gpz`). SPZ w polu
#: dedykowanym: IRiESD II.4.5.4.2.3 nie wymienia SPZ, a pole dedykowane nie ma odbiorców, dla
#: których SPZ przywraca zasilanie — sesja główna rozstrzygnęła (rozszerzenie 2 karty
#: UX-04/POLE-LINIOWE-WZORZEC), że SPZ w tym polu jest niezgodnością (`ZAKAZANA`).
#: Kryteria zabezpieczenia ziemnozwarciowego stosowane w praktyce obok 67N (sygnalizacja U0>,
#: G0> pola liniowego z generacją na sterowniku polowym — referencja HMI właściciela
#: 2026-10-29). IRiESD II.4.5.4.2.x pkt 2 wymaga zabezpieczenia ziemnozwarciowego z kryterium
#: wg sposobu pracy punktu neutralnego, nie konkretnego kryterium — wymóg spełnia 67N, a te
#: kryteria są DOPUSZCZALNE, nie obowiązkowe.
_PKT_KRYTERIUM_ZIEMNOZWARCIOWE = (
    "pkt 2 (kryterium zabezpieczenia ziemnozwarciowego do wyboru wg sposobu pracy punktu "
    "neutralnego; wymóg spełnia 67N); praktyka eksploatacyjna, referencja właściciela 2026-10-29"
)
_KRYTERIA_ZIEMNOZWARCIOWE_PRAKTYKI: tuple[tuple[str, str, str], ...] = (
    ("59N", "DOPUSZCZALNA", _PKT_KRYTERIUM_ZIEMNOZWARCIOWE),
    ("Yo>", "DOPUSZCZALNA", _PKT_KRYTERIUM_ZIEMNOZWARCIOWE),
    ("Go>", "DOPUSZCZALNA", _PKT_KRYTERIUM_ZIEMNOZWARCIOWE),
)
#: Zabezpieczenie od skutków mocy zwrotnej (P>, 32) w polu z generacją: lista funkcji klasy go
#: nie wymienia, a IRiESD II.4.5.5.4 oddaje decyzję operatorowi („ENEA Operator decyduje
#: o potrzebie wyposażenia jednostek wytwórczych lub linii w zabezpieczenie od skutków mocy
#: zwrotnej") — wymóg „na żądanie operatora".
_PKT_MOCY_ZWROTNEJ = "(lista funkcji bez zabezpieczenia od mocy zwrotnej); II.4.5.5.4"

WYMAGANIA_EAZ_KLASY_POLA: dict[str, tuple[tuple[str, str, str], ...]] = {
    "ODBIORCZE": _wymogi(
        "ODBIORCZE",
        (
            ("51", "OBOWIAZKOWA", "pkt 1"),
            ("50", "OBOWIAZKOWA", "pkt 1"),
            ("67N", "OBOWIAZKOWA", "pkt 2"),
            ("79", "NAPOWIETRZNA", "pkt 3"),
            ("ZS", "OBOWIAZKOWA", "pkt 4"),
            ("50BF", "OBOWIAZKOWA", "pkt 4"),
            ("81U", "OBOWIAZKOWA", "pkt 5"),
            # Udział pola w SCO i ponowne załączenie po SCO: pkt 6 („SPZ/SCO — jeśli ENEA
            # Operator tego wymaga") i II.4.5.4.7.1 pkt 1–2 (SCO działa na wyłączenie
            # WYBRANYCH pól; SPZ/SCO w uzgodnieniu z OSD) — o udziale pola decyduje operator.
            ("SCO", "NA_ZADANIE_OSD", "pkt 6; II.4.5.4.7.1 pkt 1–2"),
            *_KRYTERIA_ZIEMNOZWARCIOWE_PRAKTYKI,
        ),
    ),
    "MIESZANE": _wymogi(
        "MIESZANE",
        (
            ("51", "OBOWIAZKOWA", "pkt 1"),
            ("50", "OBOWIAZKOWA", "pkt 1"),
            ("67N", "OBOWIAZKOWA", "pkt 2"),
            ("79", "NAPOWIETRZNA", "pkt 3"),
            ("ZS", "OBOWIAZKOWA", "pkt 4; II.4.5.4.7.1 pkt 3–4"),
            ("50BF", "OBOWIAZKOWA", "pkt 4; II.4.5.4.7.1 pkt 3–4"),
            ("81U", "NA_ZADANIE_OSD", "pkt 5"),
            ("81O", "NA_ZADANIE_OSD", "pkt 5"),
            ("81R", "NA_ZADANIE_OSD", "pkt 5"),
            ("27", "NA_ZADANIE_OSD", "pkt 6"),
            ("59", "NA_ZADANIE_OSD", "pkt 6"),
            ("NZ", "NA_ZADANIE_OSD", "pkt 7"),
            ("67", "NA_ZADANIE_OSD", "pkt 8"),
            ("32", "NA_ZADANIE_OSD", _PKT_MOCY_ZWROTNEJ),
            ("SCO", "ZAKAZANA", "pkt 6; II.4.5.4.7.1 pkt 1"),
            *_KRYTERIA_ZIEMNOZWARCIOWE_PRAKTYKI,
        ),
    ),
    "DEDYKOWANE_WYTWORCY": _wymogi(
        "DEDYKOWANE_WYTWORCY",
        (
            ("51", "OBOWIAZKOWA", "pkt 1"),
            ("50", "OBOWIAZKOWA", "pkt 1"),
            ("67N", "OBOWIAZKOWA", "pkt 2"),
            ("ZS", "OBOWIAZKOWA", "pkt 3; II.4.5.4.7.1 pkt 3–4"),
            ("50BF", "OBOWIAZKOWA", "pkt 3; II.4.5.4.7.1 pkt 3–4"),
            ("81U", "NA_ZADANIE_OSD", "pkt 4"),
            ("81O", "NA_ZADANIE_OSD", "pkt 4"),
            ("81R", "NA_ZADANIE_OSD", "pkt 4"),
            ("27", "NA_ZADANIE_OSD", "pkt 5"),
            ("59", "NA_ZADANIE_OSD", "pkt 5"),
            ("NZ", "NA_ZADANIE_OSD", "pkt 6"),
            ("32", "NA_ZADANIE_OSD", _PKT_MOCY_ZWROTNEJ),
            ("79", "ZAKAZANA", "(lista funkcji bez SPZ)"),
            ("SPZE", "ZAKAZANA", "(lista funkcji bez SPZ)"),
            ("SCO", "ZAKAZANA", "II.4.5.4.7.1 pkt 1"),
            *_KRYTERIA_ZIEMNOZWARCIOWE_PRAKTYKI,
        ),
    ),
}

#: Kody, których klasa pola usuwa z zestawu rysunku wykonania (zakazane) i które dopisuje.
_KODY_ZAKAZANE_KLASY: dict[str, frozenset[str]] = {
    klasa: frozenset(kod for kod, wymog, _ in wymogi if wymog == "ZAKAZANA")
    for klasa, wymogi in WYMAGANIA_EAZ_KLASY_POLA.items()
}
#: Pole dedykowane: bez blokady kierunkowej wyłączenia (IRiESD II.4.5.4.2.3 — brak w liście;
#: rozszerzenie 2 karty: „dedykowane = mieszane bez SPZ i bez blokady kierunkowej").
_KODY_POMIJANE_KLASY: dict[str, frozenset[str]] = {
    "ODBIORCZE": frozenset(),
    "MIESZANE": frozenset(),
    "DEDYKOWANE_WYTWORCY": frozenset({"67"}),
}
#: Kody dopisywane klasą do zestawu rysunku: (kod, kod, za którym staje). Pole mieszane —
#: blokada kierunkowa wyłączenia (67; IRiESD II.4.5.4.2.2 pkt 8). Pole odbiorcze —
#: zabezpieczenie podczęstotliwościowe z blokadą zależną od kierunku przepływu mocy (81U;
#: IRiESD II.4.5.4.2.1 pkt 5), którego rysunek Z.10 (s.89) nie wymienia (rozbieżność rysunku
#: z IRiESD — `docs/uiux/RAPORT_ROZBIEZNOSCI_GPT_GPZ_SN_2026-10-28.md`).
_KODY_DOPISYWANE_KLASY: dict[str, tuple[tuple[str, str], ...]] = {
    "ODBIORCZE": (("81U", "67N"),),
    "MIESZANE": (("67", "50"),),
    "DEDYKOWANE_WYTWORCY": (),
}


def funkcje_eaz_pola_liniowego(
    wykonanie_pola: str, klasa_pola: str | None, warunki: Collection[str] = frozenset()
) -> list[str]:
    """Funkcje EAZ pola liniowego GPZ: zestaw rysunku wykonania (Z.10/Z.11.1/Z.11) skorygowany
    klasą pola, bez funkcji warunkowych o niespełnionym warunku (``warunki`` — warunki spełnione
    w modelu, `enm.zrodlo_napiecia_zerowego.warunki_funkcji_eaz_pola`; domyślnie żaden — 67N nie
    trafia do pola bez potwierdzonego źródła 3U₀). Klasa nieustalona (`None`) — zestaw rysunku bez
    korekty klasy. Kolejność rysunku; kod dopisany klasą stoi za wskazanym kodem rysunku (na
    początku, gdy rysunek go nie ma)."""
    zestaw = list(_FUNKCJE_EAZ_WYKONANIA_POLA[wykonanie_pola])
    if klasa_pola is None:
        return bez_niespelnionych_warunkow(zestaw, warunki)
    usuwane = _KODY_ZAKAZANE_KLASY[klasa_pola] | _KODY_POMIJANE_KLASY[klasa_pola]
    zestaw = [kod for kod in zestaw if kod not in usuwane]
    for kod, po_kodzie in _KODY_DOPISYWANE_KLASY[klasa_pola]:
        if kod in zestaw:
            continue
        if po_kodzie in zestaw:
            zestaw.insert(zestaw.index(po_kodzie) + 1, kod)
        else:
            # Rysunek nie ma kodu odniesienia — kod klasy otwiera zestaw (pozycja listy, nie dana).
            zestaw.insert(0, kod)
    # Funkcje warunkowe odpadają NA KOŃCU: kod dopisany klasą może stać za kodem warunkowym
    # (81U za 67N w polu odbiorczym), więc pozycja kodu klasy nie zależy od spełnienia warunku.
    return bez_niespelnionych_warunkow(zestaw, warunki)


def odmowa_klasy_pola(
    klasa_pola: str | None, wykonanie_pola: str | None, *, opis_pola: str
) -> str | None:
    """Zdanie odmowy, gdy klasa pola nie dopuszcza wykonania szablonu; `None` — zgodne albo brak
    danej. JEDNO źródło dla operacji, walidatora i filtra szablonów API."""
    if klasa_pola is None or wykonanie_pola is None:
        return None
    if wykonanie_pola in WYKONANIA_POLA_KLASY[klasa_pola]:
        return None
    dopuszczone = ", ".join(
        _PODSTAWA_WYKONANIA_POLA[w].removeprefix("ENEA Zeszyt 1, ")
        for w in WYKONANIA_POLA_KLASY[klasa_pola]
    )
    return (
        f"Klasa {opis_pola} — {NAZWY_KLASY_POLA_PL[klasa_pola]} "
        f"({PODSTAWA_KLASY_POLA[klasa_pola]}) — nie dopuszcza wykonania ENEA Zeszyt 1, "
        f"{_PODSTAWA_WYKONANIA_POLA[wykonanie_pola].removeprefix('ENEA Zeszyt 1, ')}: wykonanie "
        "nie ma przekładnika napięciowego od strony linii, którego wymagają funkcje pola "
        "z generacją (U<, U>, f<, f>, df/dt, blokada załączenia przy napięciu w linii). Wybierz "
        f"wykonanie {dopuszczone} albo zmień klasę pola na odbiorcze."
    )


def odmowa_szablonu_tylko_gpz(tylko_gpz: bool, *, pole_gpz: bool, opis_pola: str) -> str | None:
    """Zdanie odmowy, gdy szablon pola rozdzielni GPZ wskazano w polu stacji spoza GPZ."""
    if not tylko_gpz or pole_gpz:
        return None
    return (
        f"Szablon pola liniowego rozdzielni GPZ (ENEA Zeszyt 1, Z.10/Z.11.1/Z.11) wskazano "
        f"dla {opis_pola} stacji, która nie jest GPZ — wzorce Z.10/Z.11.1/Z.11 opisują pola "
        "rozdzielni SN stacji 110 kV/SN. Wybierz szablon pola stacji SN."
    )


# Rodzaje APARATU GŁÓWNEGO (łącznika toru głównego) dopuszczalne dla roli pola SN.
# Wartości = `device_kind` pozycji katalogu APARAT_SN (`catalog/repository.py`
# `kind_map`), więc lista jest FILTREM po realnym katalogu, a nie osobnym słownikiem
# wariantów.
#
# DLACZEGO TO ISTNIEJE (karta KOMPLETNOSC-POLA-TR §0 pkt 1). Kreator stacji pokazywał
# dla KAŻDEGO pola tę samą, niefiltrowaną listę 48 pozycji katalogu — łącznie z
# uziemnikiem i reklozerem jako „aparatem pola transformatorowego". To nie jest wybór
# wariantu, tylko brak wyboru: projektant nie widział, że pole transformatorowe realnie
# ma DWA rozwiązania (rozłącznik bezpiecznikowy dla stacji rozdzielczych małej mocy,
# wyłącznik dla stacji abonenckich/większych jednostek), bo tonęły w pozycjach, które w
# tym polu nie występują.
#
# ZASTOSOWANE ROZWIĄZANIA (praktyka krajowa PTPiREE/IRiESD, rozdzielnice RMU i pola
# wyłącznikowe):
#   * pole transformatorowe — rozłącznik bezpiecznikowy (RMU do ~630 kVA) albo
#     wyłącznik (pole wyłącznikowe); rozłącznik bez bezpieczników nie zabezpiecza
#     transformatora, więc NIE jest tu wariantem,
#   * pola liniowe (dopływ/odpływ/odgałęzienie) — wyłącznik, rozłącznik, reklozer
#     (pole liniowe ciągu z automatyką SPZ),
#   * sprzęgło — wyłącznik albo rozłącznik,
#   * pole pomiarowe — tor przekładników napięciowych bez łącznika głównego
#     (odłącznik jako aparat separujący),
#   * pole źródłowe OZE — wyłącznik albo rozłącznik (interfejs NC RfG wymaga
#     łącznika zdolnego do wyłączania).
#
# Rola spoza tablicy = brak zawężenia (cały katalog) — nie zgadujemy dla ról, których
# ta tablica nie opisuje.
BAY_PRIMARY_APPARATUS_KINDS_BY_ROLE: dict[str, list[str]] = {
    "IN": ["WYLACZNIK", "ROZLACZNIK", "REKLOZER"],
    "OUT": ["WYLACZNIK", "ROZLACZNIK", "REKLOZER"],
    "FEEDER": ["WYLACZNIK", "ROZLACZNIK", "REKLOZER"],
    "TR": ["ROZLACZNIK_BEZPIECZNIKOWY", "WYLACZNIK"],
    "COUPLER": ["WYLACZNIK", "ROZLACZNIK"],
    "MEASUREMENT": ["ODLACZNIK"],
    "OZE": ["WYLACZNIK", "ROZLACZNIK"],
    # Pole baterii kondensatorów: wyłącznik (Zeszyt 1 Zał. 16 — pole wyłącznikowe; łączenie
    # baterii i wyłączanie od zabezpieczeń TR wg IRiESD II.4.5.4.4.2 wymaga łącznika
    # zdolnego do wyłączania prądu pojemnościowego).
    "BKR": ["WYLACZNIK"],
}


def primary_apparatus_kinds_for_bay_role(bay_role: str) -> list[str]:
    """Dopuszczalne rodzaje aparatu głównego dla roli pola (pusta = brak zawężenia)."""
    return list(BAY_PRIMARY_APPARATUS_KINDS_BY_ROLE.get(bay_role, []))


BAY_TEMPLATE_TRANSFORMER = BayTemplate(
    template_id="bay_template_transformer",
    name=nazwa_roli_pola_sn("TRANSFORMATOROWE"),
    bay_role="TR",
    description="Pole transformatorowe SN — przyłączenie transformatora SN/nN.",
    devices=[
        BayDeviceTemplate(kind="DS_BUS", designation_q="Q1", position=0, placement="UPSTREAM"),
        BayDeviceTemplate(kind="CB", designation_q="Q0", position=1, placement="MIDSTREAM"),
        BayDeviceTemplate(kind="CT", designation_q="T1", position=2, placement="MIDSTREAM"),
        BayDeviceTemplate(kind="DS_LINE", designation_q="Q9", position=3, placement="DOWNSTREAM"),
        BayDeviceTemplate(kind="ES", designation_q="Q8", position=4, placement="GROUND_BRANCH"),
        BayDeviceTemplate(
            kind="TRANSFORMER_DEVICE",
            designation_q="TR",
            position=5,
            placement="DOWNSTREAM",
        ),
    ],
    # Różnicowe 87T + nadprądowe 51/50 + ziemnozwarciowe 51N + technologiczne transformatora
    # (63 Buchholz / 26 temperatura / 63P ciśnienie — kody IEEE C37.2, jedna nomenklatura
    # słownika `funkcje_eaz`), które wyzwalają wyłącznik pola Q0.
    funkcje_eaz=["87T", "51", "50", "51N", "63", "26", "63P"],
    ports=[BayPortTemplate(kind="sn_transformer", suffix="trafo")],
)

BAY_TEMPLATE_MEASUREMENT = BayTemplate(
    template_id="bay_template_measurement",
    name=nazwa_roli_pola_sn("POMIAROWE"),
    bay_role="MEASUREMENT",
    description="Pole pomiarowe SN — boczny tor pomiarowy z przekładnikami napięciowymi.",
    devices=[
        BayDeviceTemplate(kind="DS_BUS", designation_q="Q1", position=0, placement="UPSTREAM"),
        BayDeviceTemplate(kind="VT", designation_q="T2", position=1, placement="OFF_PATH"),
        BayDeviceTemplate(kind="ES", designation_q="Q8", position=2, placement="GROUND_BRANCH"),
    ],
    ports=[BayPortTemplate(kind="sn_measurement", suffix="meas")],
)

BAY_TEMPLATE_COUPLER = BayTemplate(
    template_id="bay_template_coupler",
    name=nazwa_roli_pola_sn("SPRZEGLO"),
    bay_role="COUPLER",
    description="Sprzęgło sekcyjne — łącznik dwóch sekcji szyny SN.",
    devices=[
        BayDeviceTemplate(kind="DS_BUS", designation_q="Q1", position=0, placement="UPSTREAM"),
        BayDeviceTemplate(kind="CB", designation_q="Q0", position=1, placement="MIDSTREAM"),
        BayDeviceTemplate(kind="DS_BUS", designation_q="Q2", position=2, placement="DOWNSTREAM"),
        BayDeviceTemplate(kind="ES", designation_q="Q8", position=3, placement="GROUND_BRANCH"),
    ],
    funkcje_eaz=["51", "50"],
    ports=[
        BayPortTemplate(kind="sn_coupler", suffix="left"),
        BayPortTemplate(kind="sn_coupler", suffix="right"),
    ],
)

#: Zabezpieczenia interfejsu pola źródłowego SN: kierunkowe 67/67N, napięciowe 27/59,
#: częstotliwościowe 81U/81O i ROCOF 81R — każda funkcja raz. Ochronę od pracy wyspowej (LoM)
#: realizują TE kryteria (LoM `application/analyses/ochrona_lom.py` rozpoznaje 81R i 78
#: w `Bay.protection_codes`); dawny kod-agregat „anti-islanding" obok nich był duplikatem
#: semantycznym (decyzja architekta 2026-10-30, `funkcje_eaz`).
_FUNKCJE_EAZ_INTERFEJSU_OZE: tuple[str, ...] = (
    "67",
    "67N",
    "27",
    "59",
    "81U",
    "81O",
    "81R",
)

BAY_TEMPLATE_DER_PV = BayTemplate(
    template_id="bay_template_der_pv",
    name=nazwa_roli_pola_sn("PV_SN"),
    bay_role="OZE",
    description="Pole źródłowe SN dla farmy PV — przyłączenie inwerterów + transformatora.",
    devices=[
        BayDeviceTemplate(kind="DS_BUS", designation_q="Q1", position=0, placement="UPSTREAM"),
        BayDeviceTemplate(kind="CB", designation_q="Q0", position=1, placement="MIDSTREAM"),
        BayDeviceTemplate(kind="CT", designation_q="T1", position=2, placement="MIDSTREAM"),
        BayDeviceTemplate(kind="VT", designation_q="T2", position=3, placement="OFF_PATH"),
        BayDeviceTemplate(kind="DS_LINE", designation_q="Q9", position=4, placement="DOWNSTREAM"),
        BayDeviceTemplate(kind="ES", designation_q="Q8", position=5, placement="GROUND_BRANCH"),
        BayDeviceTemplate(
            kind="CABLE_HEAD", designation_q="GK", position=6, placement="DOWNSTREAM"
        ),
    ],
    # Interfejs przyłączeniowy źródła OZE/DER (NC RfG / PTPiREE): kierunkowe nadprądowe
    # (67/67N), napięciowe (27/59), częstotliwościowe (81U/81O), ROCOF (81R) i ochrona przed
    # pracą wyspową. PEŁNA ochrona maszyny (87G, 40, 32, 64, 46, 21/25) mieszka na
    # source.protection, NIE na polu interfejsu.
    funkcje_eaz=list(_FUNKCJE_EAZ_INTERFEJSU_OZE),
    ports=[BayPortTemplate(kind="sn_der_pv", suffix="pv")],
)

BAY_TEMPLATE_DER_BESS = BayTemplate(
    template_id="bay_template_der_bess",
    name=nazwa_roli_pola_sn("BESS_SN"),
    bay_role="OZE",
    description="Pole źródłowe SN dla magazynu energii BESS — PCS + transformator.",
    devices=BAY_TEMPLATE_DER_PV.devices.copy(),
    funkcje_eaz=list(_FUNKCJE_EAZ_INTERFEJSU_OZE),
    ports=[BayPortTemplate(kind="sn_der_bess", suffix="bess")],
)

BAY_TEMPLATE_DER_FW = BayTemplate(
    template_id="bay_template_der_fw",
    name=nazwa_roli_pola_sn("FW_SN"),
    bay_role="OZE",
    description="Pole źródłowe SN dla farmy wiatrowej — kable kolektorowe + transformator główny.",
    devices=BAY_TEMPLATE_DER_PV.devices.copy(),
    funkcje_eaz=list(_FUNKCJE_EAZ_INTERFEJSU_OZE),
    ports=[BayPortTemplate(kind="sn_der_fw", suffix="fw")],
)

BAY_TEMPLATE_RESERVE = BayTemplate(
    template_id="bay_template_reserve",
    name="Pole rezerwowe",
    bay_role="FEEDER",
    description="Pole rezerwowe — przygotowane miejsce dla przyszłego przyłączenia.",
    devices=[
        BayDeviceTemplate(kind="DS_BUS", designation_q="Q1", position=0, placement="UPSTREAM"),
        BayDeviceTemplate(kind="ES", designation_q="Q8", position=1, placement="GROUND_BRANCH"),
    ],
    ports=[BayPortTemplate(kind="sn_reserve", suffix="reserve")],
)

BAY_TEMPLATE_AUX = BayTemplate(
    template_id="bay_template_aux",
    name="Pole potrzeb własnych",
    bay_role="FEEDER",
    description="Pole potrzeb własnych stacji — zasilanie urządzeń pomocniczych.",
    devices=[
        BayDeviceTemplate(kind="DS_BUS", designation_q="Q1", position=0, placement="UPSTREAM"),
        BayDeviceTemplate(kind="FUSE", designation_q="F1", position=1, placement="MIDSTREAM"),
        BayDeviceTemplate(kind="ES", designation_q="Q8", position=2, placement="GROUND_BRANCH"),
    ],
    ports=[BayPortTemplate(kind="sn_reserve", suffix="aux")],
)


# ---------------------------------------------------------------------------
# Decyzja właściciela 2026-10-29 (karta UX-04/POLE-LINIOWE-WZORZEC): pole pomiaru napięcia SN
# rozdzielni GPZ wg ENEA Zeszyt 1, Z.17 (s.97) — źródło napięcia zerowego 3U₀ funkcji 67N pól
# liniowych sekcji (obwód okrężny „Z,Zz”, `enm.zrodlo_napiecia_zerowego`).
# ---------------------------------------------------------------------------

#: Podstawa pola pomiaru napięcia: rysunek Z.17, wymóg jednego pola na sekcję (§13 s.25) i gniazda
#: przekładników bez wkładek bezpiecznikowych (§13 s.26), zestaw funkcji §26.9.8.
PODSTAWA_POLA_POMIARU_NAPIECIA_Z17 = (
    "ENEA Zeszyt 1, Z.17 (s.97) „Pole pomiaru napięcia SN”; §13 (s.25) — pola pomiaru napięcia "
    "po jednym w każdej sekcji; §13 (s.26) — gniazda dla bezpośredniego przyłączenia "
    "przekładników napięciowych, bez wkładek bezpiecznikowych; §26.9.8 — zabezpieczenia pól "
    "pomiaru napięcia"
)

#: Uzwojenia przekładnika napięciowego Z.17 (tabliczka rysunku s.97): SN/√3 / 0,1/√3 / 0,1/√3 /
#: 0,1/3 — I 0-10 VA kl. 0,2 (obwód „UL1-2-3-N Pom. en.” — pomiar energii), II 15 VA kl. 0,5/3P
#: (wejście sterownika pola: U>, U<, f<, df/dt; obwód okrężny „UL1,UL2,UL3,N” i automatyka SZR),
#: III 15 VA kl. 3P w OTWARTYM TRÓJKĄCIE (wejście Uo> sterownika pola i obwód okrężny „Z,Zz” —
#: napięcie zerowe zabezpieczeń ziemnozwarciowych pól liniowych sekcji). Odczyt rysunku
#: 2026-10-29 (współrzędne strony 2480×3509 px: tabliczka x≈600–860, y≈2010–2180; uzwojenie III
#: — symbol trójkąta pod gwiazdami, linia do wejścia Uo> i obwodu „Z,Zz”).
UZWOJENIA_VT_POLA_POMIARU_NAPIECIA_Z17: tuple[UzwojeniePrzekladnikaNapieciowego, ...] = (
    UzwojeniePrzekladnikaNapieciowego(
        przekladnia="SN/√3 / 0,1/√3",
        moc_va=10.0,
        klasa="0,2",
        przeznaczenie=("POMIAR",),
    ),
    UzwojeniePrzekladnikaNapieciowego(
        przekladnia="SN/√3 / 0,1/√3",
        moc_va=15.0,
        klasa="0,5/3P",
        przeznaczenie=("POMIAR", "ZABEZPIECZENIA"),
    ),
    UzwojeniePrzekladnikaNapieciowego(
        przekladnia="SN/√3 / 0,1/3",
        moc_va=15.0,
        klasa="3P",
        przeznaczenie=("ZABEZPIECZENIA",),
        otwarty_trojkat=True,
    ),
)

#: Funkcje EAZ pola pomiaru napięcia — §26.9.8 w kolejności tekstu: U> (59), U< (27), 3Uo>
#: (59N), f< (81U) ze stopniami SCO 1 i 2 i SPZ po SCO (jedna automatyka SCO), df/dt (81R);
#: rysunek s.97 — bloki „U>, U<, Uo>, f<, df/dt” sterownika pola i obwody okrężne SCO1, SCO2,
#: SCO/SPZ.
FUNKCJE_EAZ_POLA_POMIARU_NAPIECIA_Z17: tuple[str, ...] = (
    "59",
    "27",
    "59N",
    "81U",
    "SCO",
    "81R",
)

BAY_TEMPLATE_GPZ_POMIAR_NAPIECIA_Z17 = BayTemplate(
    template_id="bay_template_gpz_pomiar_napiecia_enea_z17",
    name=nazwa_roli_pola_sn("POMIAROWE"),
    bay_role="MEASUREMENT",
    description=(
        "Pole pomiaru napięcia SN rozdzielni GPZ (ENEA Z.17) — łącznik trójpołożeniowy z napędem, "
        "wskaźnik napięcia, przekładnik napięciowy wtykowy z uzwojeniem otwartego trójkąta "
        "(źródło napięcia zerowego 3U₀ sekcji)."
    ),
    podstawa=PODSTAWA_POLA_POMIARU_NAPIECIA_Z17,
    render_variant="qet_en60617",
    wykonanie_lacznikow="TROJPOLOZENIOWY",
    tylko_gpz=True,
    funkcje_eaz=list(FUNKCJE_EAZ_POLA_POMIARU_NAPIECIA_Z17),
    devices=[
        BayDeviceTemplate(
            kind="THREE_POSITION_SWITCH",
            designation_q="Q1",
            position=0,
            placement="UPSTREAM",
            podstawa=(
                "ENEA Z.17 (s.97) — łącznik trójpołożeniowy z napędem (szyna / otwarty / "
                f"uziemiony); {_PODSTAWA_P13}"
            ),
        ),
        BayDeviceTemplate(
            kind="VOLTAGE_INDICATOR",
            designation_q="PF1",
            position=1,
            placement="OFF_PATH",
            podstawa=f"ENEA Z.17 (s.97) — wskaźnik napięcia; {_PODSTAWA_P13} — wskaźniki stacjonarne",
        ),
        BayDeviceTemplate(
            kind="CABLE_HEAD",
            designation_q="GK1",
            position=2,
            placement="OFF_PATH",
            odgalezienie=ODGALEZIENIE_PRZEKLADNIKA_NAPIECIOWEGO,
            podstawa=(
                "ENEA Z.17 (s.97) — złącze wtykowe przekładnika; §13 (s.26) — gniazda dla "
                "bezpośredniego przyłączenia przekładników napięciowych, bez wkładek "
                "bezpiecznikowych"
            ),
        ),
        BayDeviceTemplate(
            kind="VT",
            designation_q="T1",
            position=3,
            placement="OFF_PATH",
            odgalezienie=ODGALEZIENIE_PRZEKLADNIKA_NAPIECIOWEGO,
            uzwojenia=list(UZWOJENIA_VT_POLA_POMIARU_NAPIECIA_Z17),
            podstawa=(
                "ENEA Z.17 (s.97) — przekładnik napięciowy SN/√3 / 0,1/√3 / 0,1/√3 / 0,1/3, "
                "trzy jednofazowe (znacznik „3”), uzwojenie III w otwartym trójkącie"
            ),
        ),
    ],
    ports=[BayPortTemplate(kind="sn_measurement", suffix="meas")],
)

BAY_TEMPLATE_REGISTRY: dict[str, BayTemplate] = {
    t.template_id: t
    for t in [
        BAY_TEMPLATE_LINE_IN,
        BAY_TEMPLATE_LINE_OUT,
        BAY_TEMPLATE_TRANSFORMER,
        BAY_TEMPLATE_MEASUREMENT,
        BAY_TEMPLATE_GPZ_POMIAR_NAPIECIA_Z17,
        BAY_TEMPLATE_COUPLER,
        BAY_TEMPLATE_DER_PV,
        BAY_TEMPLATE_DER_BESS,
        BAY_TEMPLATE_DER_FW,
        BAY_TEMPLATE_RESERVE,
        BAY_TEMPLATE_AUX,
        *BAY_TEMPLATES_GPZ_LINE,
    ]
}

#: Szablon KANONICZNY roli pola — źródło funkcji EAZ pola tworzonego wg roli, bez wskazanego
#: szablonu (pole stacji SN/nN z kreatora, pole źródłowe z konfiguracji DER-SN). Pole odgałęźne
#: (`FEEDER`) ma wyposażenie pola linii odpływowej. Zestaw funkcji jest zawsze zestawem
#: SZABLONU — rola wskazuje wyłącznie, który szablon jest wzorcem (jedno źródło).
SZABLON_KANONICZNY_ROLI: dict[str, BayTemplate] = {
    "IN": BAY_TEMPLATE_LINE_IN,
    "OUT": BAY_TEMPLATE_LINE_OUT,
    "FEEDER": BAY_TEMPLATE_LINE_OUT,
    "TR": BAY_TEMPLATE_TRANSFORMER,
    "COUPLER": BAY_TEMPLATE_COUPLER,
    "MEASUREMENT": BAY_TEMPLATE_MEASUREMENT,
    "OZE": BAY_TEMPLATE_DER_PV,
}


def odlaczenie_wysunieciem_wylacznika(primary_devices: Iterable[Any]) -> bool:
    """Czy pole odłącza się od szyny WYSUNIĘCIEM wyłącznika (wyłącznik poziomo wysuwny na
    wózku, ENEA Zeszyt 1 §13) — bez odłącznika szynowego i bez łącznika trójpołożeniowego.
    Jedno źródło prawdy: WYKONANIE wyłącznika w rekordzie aparatu ENM
    (`BayPrimaryDevice.wykonanie` = ``WYSUWNE``, domyślnie z szablonu pola, edytowalne
    w inspektorze) — to samo pole rysuje znacznik członu wysuwnego na SLD (predykaty parami:
    ocena składu i rysunek z jednej danej). Pole bez wyłącznika wysuwnego — ``False`` (zero
    domysłu, także dla pola z szablonem „WYSUWNY", którego wyłącznik zapisano jako stały).
    """
    for aparat in primary_devices:
        kind = aparat.get("kind") if isinstance(aparat, dict) else getattr(aparat, "kind", None)
        wykonanie = (
            aparat.get("wykonanie")
            if isinstance(aparat, dict)
            else getattr(aparat, "wykonanie", None)
        )
        if kind in RODZAJE_Z_WYKONANIEM and wykonanie == "WYSUWNE":
            return True
    return False


def funkcje_eaz_szablonu(
    template_id: str | None,
    klasa_pola: str | None = None,
    warunki: Collection[str] = frozenset(),
) -> list[str] | None:
    """Funkcje EAZ kanonicznego szablonu pola przypisywane do pola; `None` — szablon spoza
    rejestru kanonu. Szablon pola liniowego GPZ: zestaw rysunku skorygowany klasą pola
    (`funkcje_eaz_pola_liniowego`); inny szablon klasy nie ma (klasa dotyczy pola linii SN).
    Każdy szablon — bez funkcji warunkowych o niespełnionym warunku
    (`bez_niespelnionych_warunkow`)."""
    szablon = BAY_TEMPLATE_REGISTRY.get(template_id or "")
    if szablon is None:
        return None
    if szablon.wykonanie_pola is not None:
        return funkcje_eaz_pola_liniowego(szablon.wykonanie_pola, klasa_pola, warunki)
    return bez_niespelnionych_warunkow(szablon.funkcje_eaz, warunki)


# ---------------------------------------------------------------------------
# Profil funkcjonalny EAZ wzorca pola liniowego GPZ (uzupełnienie właściciela 2026-10-29):
# każda funkcja zestawu rysunku i wymagań klasy ze statusem obowiązkowa / wariantowa /
# opcjonalna, wymogiem w KAŻDEJ klasie dopuszczającej wykonanie i statusem weryfikacji źródła.
# ---------------------------------------------------------------------------

WymagalnoscFunkcjiProfilu = Literal["OBOWIAZKOWA", "WARIANTOWA", "OPCJONALNA"]
#: Wymóg funkcji w klasie: wymóg IRiESD (`WymogFunkcjiEaz`), „WG_RYSUNKU" — funkcja rysunku
#: standardu, której lista klasy nie wymienia, „NIE_WYSTEPUJE" — klasa usuwa funkcję rysunku
#: (`_KODY_POMIJANE_KLASY`: pole dedykowane bez blokady kierunkowej).
WymogKlasyProfilu = Literal[
    "OBOWIAZKOWA",
    "NAPOWIETRZNA",
    "NA_ZADANIE_OSD",
    "DOPUSZCZALNA",
    "ZAKAZANA",
    "WG_RYSUNKU",
    "NIE_WYSTEPUJE",
]
OPIS_WYMOGU_PROFILU_PL: dict[str, str] = {
    **OPIS_WYMOGU_PL,
    "WG_RYSUNKU": "wymagana rysunkiem standardu operatora (lista funkcji klasy jej nie wymienia)",
    "NIE_WYSTEPUJE": "nie występuje w polu tej klasy",
}
OPIS_WYMAGALNOSCI_PROFILU_PL: dict[str, str] = {
    "OBOWIAZKOWA": "obowiązkowa w każdej klasie pola, w której wykonanie jest dopuszczone",
    "WARIANTOWA": (
        "zależna od klasy pola, od rodzaju linii (IRiESD II.4.5.4.2) albo od warunku przypisania "
        "(źródło wielkości wejściowej funkcji w modelu)"
    ),
    "OPCJONALNA": "dopuszczalna albo na żądanie operatora — nie jest wymagana z mocy listy",
}
_WYMOGI_WYMAGANE = frozenset({"OBOWIAZKOWA", "WG_RYSUNKU"})
_WYMOGI_OPCJONALNE = frozenset({"DOPUSZCZALNA", "NA_ZADANIE_OSD", "NIE_WYSTEPUJE"})
#: Wymogi, których podstawą nie jest tekst listy funkcji, lecz wniosek: kryteria
#: ziemnozwarciowe z praktyki (referencja właściciela 2026-10-29) i zakaz SPZ w polu
#: dedykowanym (rozstrzygnięcie sesji głównej — rozszerzenie 2 karty UX-04/POLE-LINIOWE-WZORZEC).
_WYMOGI_Z_INTERPRETACJI: frozenset[tuple[str, str]] = frozenset(
    {
        (klasa, kod)
        for klasa in KLASY_POLA_LINIOWEGO
        for kod, _w, _p in _KRYTERIA_ZIEMNOZWARCIOWE_PRAKTYKI
    }
    | {("DEDYKOWANE_WYTWORCY", "79"), ("DEDYKOWANE_WYTWORCY", "SPZE")}
)


class WymogFunkcjiWKlasie(BaseModel):
    """Wymóg funkcji EAZ w jednej klasie pola z podstawą i statusem weryfikacji źródła."""

    klasa: str
    wymog: WymogKlasyProfilu
    wymog_pl: str
    podstawa: str
    weryfikacja: StatusWeryfikacji


class PozycjaProfiluEaz(BaseModel):
    """Funkcja profilu EAZ wzorca: wymagalność (nie werdykt oceny), wymóg w każdej klasie i obecność na rysunku."""

    kod: str
    opis_pl: str  # zapis rysunku, numer IEEE C37.2 i nazwa (`opis_funkcji_eaz_pl`)
    wymagalnosc: WymagalnoscFunkcjiProfilu
    wymagalnosc_pl: str
    na_rysunku: bool
    wymogi: list[WymogFunkcjiWKlasie]
    #: Warunek przypisania funkcji warunkowej (`WARUNKI_FUNKCJI_EAZ`) — zdanie z podstawą;
    #: `None` — funkcja bez warunku przypisania.
    warunek_pl: str | None = None


def profil_eaz_szablonu(template_id: str | None) -> list[PozycjaProfiluEaz] | None:
    """Profil funkcjonalny EAZ szablonu pola liniowego GPZ; `None` — szablon bez wykonania
    pola (profil klas dotyczy pola linii SN). Zbiór funkcji: zestaw rysunku wykonania ∪ kody
    wymagań KAŻDEJ klasy dopuszczającej wykonanie (`WYKONANIA_POLA_KLASY`). Status:
    obowiązkowa — w każdej klasie wymagana (lista klasy albo rysunek standardu); opcjonalna —
    w każdej klasie dopuszczalna, na żądanie operatora albo nieobecna; wariantowa — pozostałe
    (zależność od klasy pola, zakaz w części klas, wymóg tylko w linii napowietrznej).
    Kolejność: zestaw rysunku, potem kody wymagań w kolejności klas — deterministyczna.
    """
    szablon = BAY_TEMPLATE_REGISTRY.get(template_id or "")
    if szablon is None or szablon.wykonanie_pola is None:
        return None
    wykonanie = szablon.wykonanie_pola
    klasy = [k for k in KLASY_POLA_LINIOWEGO if wykonanie in WYKONANIA_POLA_KLASY[k]]
    rysunek = list(_FUNKCJE_EAZ_WYKONANIA_POLA[wykonanie])
    kody = list(rysunek)
    for klasa in klasy:
        for kod, _wymog, _pkt in WYMAGANIA_EAZ_KLASY_POLA[klasa]:
            if kod not in kody:
                kody.append(kod)
    wynik: list[PozycjaProfiluEaz] = []
    for kod in kody:
        wymogi: list[WymogFunkcjiWKlasie] = []
        for klasa in klasy:
            wpis = next((w for w in WYMAGANIA_EAZ_KLASY_POLA[klasa] if w[0] == kod), None)
            if wpis is not None:
                wymog, podstawa = wpis[1], wpis[2]
                weryfikacja: StatusWeryfikacji = (
                    "INTERPRETACJA" if (klasa, kod) in _WYMOGI_Z_INTERPRETACJI else "ODCZYT_TEKSTU"
                )
            # Zestaw rysunku w klasie z KAŻDYM warunkiem spełnionym: profil opisuje wzorzec,
            # a nie stan konkretnego pola (warunek przypisania niesie `warunek_pl`).
            elif kod in funkcje_eaz_pola_liniowego(
                wykonanie, klasa, frozenset(WARUNKI_FUNKCJI_EAZ.values())
            ):
                wymog, podstawa = (
                    "WG_RYSUNKU",
                    f"{szablon.podstawa}; {funkcja_eaz(kod).podstawa}",
                )
                weryfikacja = "ZWERYFIKOWANE_NA_RYSUNKU"
            else:
                wymog = "NIE_WYSTEPUJE"
                podstawa = f"{PODSTAWA_KLASY_POLA[klasa]} (lista funkcji klasy jej nie wymienia)"
                weryfikacja = "ODCZYT_TEKSTU"
            wymogi.append(
                WymogFunkcjiWKlasie(
                    klasa=klasa,
                    wymog=wymog,
                    wymog_pl=OPIS_WYMOGU_PROFILU_PL[wymog],
                    podstawa=podstawa,
                    weryfikacja=weryfikacja,
                )
            )
        zbior = {w.wymog for w in wymogi}
        warunek = WARUNKI_FUNKCJI_EAZ.get(kod)
        # Funkcja warunkowa jest WARIANTOWA zawsze: nawet wymagana w każdej klasie trafia do
        # pola dopiero przy spełnionym warunku (decyzja właściciela 2026-10-29 — 67N).
        wymagalnosc: WymagalnoscFunkcjiProfilu = (
            "WARIANTOWA"
            if warunek is not None
            else (
                "OBOWIAZKOWA"
                if zbior <= _WYMOGI_WYMAGANE
                else "OPCJONALNA" if zbior <= _WYMOGI_OPCJONALNE else "WARIANTOWA"
            )
        )
        wynik.append(
            PozycjaProfiluEaz(
                kod=kod,
                opis_pl=opis_funkcji_eaz_pl(kod),
                wymagalnosc=wymagalnosc,
                wymagalnosc_pl=OPIS_WYMAGALNOSCI_PROFILU_PL[wymagalnosc],
                na_rysunku=kod in rysunek,
                wymogi=wymogi,
                warunek_pl=(OPIS_WARUNKU_FUNKCJI_EAZ_PL[warunek] if warunek is not None else None),
            )
        )
    return wynik


#: Funkcje EAZ roli pola, która NIE ma szablonu kanonicznego (``SZABLON_KANONICZNY_ROLI``) —
#: rozłącznie z tamtą tablicą: rola bierze zestaw z dokładnie jednego miejsca (przypina test
#: `tests/network_model/catalog/test_funkcje_eaz_roli.py`). Pole baterii kondensatorów
#: równoległych SN (karta UX-04/POLE-BKR-MODEL; ENEA Operator, Stacje 110 kV, Zeszyt 1
#: §26.9.7 s. 54 i Zał. 16; IRiESD II.4.5.4.4.1 s. 54): zwarciowe I>> (50), przeciążeniowe I>
#: na wartości skutecznej z harmonicznymi (51), ziemnozwarciowe zerowoprądowe (51N), nadprądowe
#: różnicowe od uszkodzeń kondensatorów — prąd niezrównoważenia między punktami gwiazd, Ir> na
#: Zał. 16 (60N), nadnapięciowe U> (59) i pobudzenie lokalnej rezerwy wyłącznikowej LRW (50BF;
#: IRiESD II.4.5.4.7.1 pkt 3). Blokowanie zabezpieczenia szyn od I> i sterowanie zegarem nie
#: mają kodu ANSI funkcji — są automatyką rozdzielni, nie funkcją zabezpieczeniową pola. Szablon
#: kanoniczny pola BKR (z odłącznikiem pola) przeniesie ten zestaw do ``BayTemplate.funkcje_eaz``.
FUNKCJE_EAZ_ROLI_BEZ_SZABLONU: dict[str, tuple[str, ...]] = {
    "BKR": ("51", "50", "51N", "60N", "59", "50BF"),
}


def funkcje_eaz_roli(bay_role: str, warunki: Collection[str] = frozenset()) -> list[str]:
    """Funkcje EAZ roli pola: szablonu kanonicznego roli albo — dla roli bez szablonu
    kanonicznego — ``FUNKCJE_EAZ_ROLI_BEZ_SZABLONU``; pusta lista dla roli spoza obu tablic.
    Bez funkcji warunkowych o niespełnionym warunku (`bez_niespelnionych_warunkow`)."""
    szablon = SZABLON_KANONICZNY_ROLI.get(bay_role)
    if szablon is not None:
        return bez_niespelnionych_warunkow(szablon.funkcje_eaz, warunki)
    return bez_niespelnionych_warunkow(FUNKCJE_EAZ_ROLI_BEZ_SZABLONU.get(bay_role, ()), warunki)


# ---------------------------------------------------------------------------
# W1 (RECENZJA_L2 §1/§12, V12K-145): materializacja aparatów PIERWOTNYCH pola
# (Bay.primary_devices, spec §12.1) z kanonicznego szablonu pola. „Schemat =
# bezpośrednie odwzorowanie konfiguracji kreatora" — szablon wybrany w kreatorze
# JEST daną projektową, więc jego stos aparatów spływa na field_spc i dalej na
# SLD (adapter → scena, tor pierwotny Z DANYCH zamiast jednego fallbacku §12.4).
# ---------------------------------------------------------------------------

# Mapowanie typu aparatu SZABLONU (BayDeviceTemplate.kind) → typu aparatu
# PIERWOTNEGO pola (BayPrimaryDevice.kind, spec §12.1). DS_BUS/DS_LINE to warianty
# POŁOŻENIA jednego typu „odłącznik" (DS) — glif SLD ten sam, rozróżnia je
# `placement` (UPSTREAM vs DOWNSTREAM). Zero fabrykacji: 1:1, jawne, z komentarzem.
_TEMPLATE_DEVICE_KIND_TO_PRIMARY_KIND: dict[str, str] = {
    "CB": "CB",
    "DS_BUS": "DS",
    "DS_LINE": "DS",
    "DS_BRANCH": "DS",
    "ES": "ES",
    "CT": "CT",
    "VT": "VT",
    "FUSE": "FUSE",
    "SURGE_ARRESTER": "SURGE_ARRESTER",
    "CABLE_HEAD": "CABLE_HEAD",
    "TRANSFORMER_DEVICE": "TRANSFORMER_DEVICE",
    "THREE_POSITION_SWITCH": "THREE_POSITION_SWITCH",
    "VOLTAGE_INDICATOR": "VOLTAGE_INDICATOR",
    "CORE_BALANCE_CT": "CORE_BALANCE_CT",
    "UNBALANCE_CT": "UNBALANCE_CT",
    "PHASE_TO_PHASE_VT": "PHASE_TO_PHASE_VT",
}

# Aparaty łączeniowe toru (sterowalne, ze stanem otwarty/zamknięty) — łączniki toru głównego
# z JEDNEGO źródła (`rodzaje_aparatury.RODZAJE_LACZNIKOW_TORU`) bez bezpiecznika: wkładka
# bezpiecznikowa nie ma napędu (jej stan to stan gałęzi rozłącznika bezpiecznikowego).
_SWITCHABLE_PRIMARY_KINDS: frozenset[str] = RODZAJE_LACZNIKOW_TORU - {"FUSE"}


def _main_apparatus_primary_kind(apparatus_kind: str | None) -> str | None:
    """Wybór GŁÓWNEGO aparatu łączeniowego pola z kreatora (`apparatus_kind`)
    → typ aparatu pierwotnego. Pole wyłącznikowe (CB) vs rozłącznikowe
    (LOAD_SWITCH/DS/FUSE). `None` = brak jawnego wyboru (zostaje typ z szablonu).
    """
    normalized = apparatus_kind.strip().upper() if isinstance(apparatus_kind, str) else ""
    if normalized in {"DISCONNECTOR", "DS", "ODLACZNIK", "ODŁĄCZNIK"}:
        return "DS"
    if normalized in {"LOAD_SWITCH", "LS", "ROZLACZNIK", "ROZŁĄCZNIK"}:
        return "LOAD_SWITCH"
    if normalized in {
        "FUSE",
        "FUSE_SWITCH",
        "ROZLACZNIK_BEZPIECZNIKOWY",
        "BEZPIECZNIK",
    }:
        return "FUSE"
    if normalized in {"CB", "BREAKER", "WYLACZNIK", "WYŁĄCZNIK"}:
        return "CB"
    return None


#: Pola wzorca ADDYTYWNE wobec odcisku szablonu (`CompleteMvBayTemplate.compute_hash`, odcisk
#: do unieważniania wyników): `None` = szablon sprzed atrybutu albo atrybut nieprzesądzony —
#: poza odciskiem (szablon o niezmienionej treści zachowuje odcisk); wartość nadana jest treścią
#: szablonu. To samo prawo co `enm/hash.py::_POLA_ZAGNIEZDZONE_POZA_HASHEM_GDY_NONE` dla
#: modelu. Test: `tests/network_model/catalog/test_obwody_wtorne_pola.py`.
POLA_SZABLONU_POZA_ODCISKIEM_GDY_NONE: tuple[str, ...] = ("obwody_wtorne",)
POLA_APARATU_SZABLONU_POZA_ODCISKIEM_GDY_NONE: tuple[str, ...] = (
    "przekladnia",
    "wykonanie",
)


def postac_odcisku_szablonu(szablon: BayTemplate) -> dict[str, Any]:
    """Zrzut szablonu do odcisku — bez pól addytywnych o wartości `None`."""
    zrzut = szablon.model_dump(mode="json")
    for pole in POLA_SZABLONU_POZA_ODCISKIEM_GDY_NONE:
        if zrzut.get(pole) is None:
            zrzut.pop(pole, None)
    for aparat in zrzut["devices"]:
        for pole in POLA_APARATU_SZABLONU_POZA_ODCISKIEM_GDY_NONE:
            if aparat.get(pole) is None:
                aparat.pop(pole, None)
    return zrzut


def template_primary_devices(
    template_id: str | None,
    *,
    field_ref: str,
    main_apparatus_kind: str | None = None,
) -> list[dict[str, Any]]:
    """Materializuje listę aparatów pierwotnych pola (Bay.primary_devices, spec
    §12.1) z kanonicznego szablonu `BayTemplate.devices`. Kolejność = pozycja w
    szablonie (od szyny w dół: UPSTREAM → … → głowica). `device_ref`
    DETERMINISTYCZNY (`field_ref` + pozycja) — zero losowości/seedu, ten sam
    wynik dla tego samego pola. Zwraca `[]`, gdy szablon nieznany/brak
    (wsteczna zgodność: pole bez danych → ścieżka konwencji §12.4 na SLD).

    `main_apparatus_kind` (opcjonalny wybór z kreatora): nadpisuje typ GŁÓWNEGO
    aparatu łączeniowego (CB szablonu) — pole wyłącznikowe (CB) vs rozłącznikowe
    (LOAD_SWITCH/DS/FUSE). Pozostałe aparaty (CT/ES/głowica/TR/VT/SA) bez zmian.
    """
    if not template_id:
        return []
    template = BAY_TEMPLATE_REGISTRY.get(template_id)
    if template is None:
        return []
    override = _main_apparatus_primary_kind(main_apparatus_kind)
    devices: list[dict[str, Any]] = []
    for device in template.devices:
        primary_kind = _TEMPLATE_DEVICE_KIND_TO_PRIMARY_KIND.get(device.kind)
        if primary_kind is None:
            continue
        # Nadpisanie GŁÓWNEGO łącznika pola (CB szablonu) wyborem kreatora.
        if primary_kind == "CB" and override is not None:
            primary_kind = override
        entry: dict[str, Any] = {
            "device_ref": f"{field_ref}::dev::{device.position}",
            "symbol_ref": f"symbol:{primary_kind.lower()}",
            "kind": primary_kind,
            "placement": device.placement,
            "is_controllable": primary_kind in _SWITCHABLE_PRIMARY_KINDS,
            "render_variant": template.render_variant,
            "designation": device.designation_q,
        }
        if device.catalog_ref is not None:
            entry["catalog_ref"] = device.catalog_ref
        if device.rdzenie:
            entry["rdzenie"] = [r.model_dump(mode="json") for r in device.rdzenie]
        if device.uzwojenia:
            entry["uzwojenia"] = [u.model_dump(mode="json") for u in device.uzwojenia]
        if device.przekladnia is not None:
            entry["przekladnia"] = device.przekladnia
        if device.wykonanie is not None and primary_kind in RODZAJE_Z_WYKONANIEM:
            # Wykonanie wyłącznika z szablonu — wartość domyślna rekordu (nadpisanie głównego
            # łącznika rozłącznikiem w kreatorze zdejmuje je razem z rodzajem).
            entry["wykonanie"] = device.wykonanie
        if device.odgalezienie is not None:
            entry[KLUCZ_ODGALEZIENIA] = device.odgalezienie
        if primary_kind == "ES":
            # Uziemnik pola (typologia §12.5) — odróżnia go od uziemienia ekranów
            # kabla/konstrukcji/punktu neutralnego. Szablon to uziemnik pola.
            entry["earthing_role"] = "field_earth"
        devices.append(entry)
    # Porty aparatów z sekwencji szablonu (karta UX-04/POLE-LINIOWE-WZORZEC) — ta sama reguła
    # co każda droga budowy pola (`rodzaje_aparatury.porty_toru_pola`).
    return porty_toru_pola(devices)


# ---------------------------------------------------------------------------
# W2b-DANE (POLECENIE_DER_SN_TOPOLOGIA_2026-07): materializacja aparatów
# PIERWOTNYCH dedykowanego POLA ŹRÓDŁOWEGO SN dla DER przyłączonego po stronie
# SN — sterowana JAWNĄ konfiguracją pola z kreatora (mvFieldConfiguration), a nie
# stałym szablonem. Każda kontrolka kreatora (switchingDevice / ct / vt /
# earthingSwitch / surgeArrester / cableHead) mapuje 1:1 na obecność aparatu
# pierwotnego — zero fabrykacji (phantom rule): odznaczenie CT realnie usuwa CT.
# Kanoniczna KOLEJNOŚĆ i oznaczenia Q są lustrem `BAY_TEMPLATE_DER_PV` (jedno
# źródło porządku pola źródłowego); protection_relay mapuje na Bay.protection_codes
# (NIE na aparat pierwotny) przez `funkcje_eaz_roli("OZE")`.
# ---------------------------------------------------------------------------


def mv_source_field_primary_devices(
    field_ref: str,
    *,
    switching_device: str = "CB",
    ct: bool = True,
    vt: bool = False,
    earthing_switch: bool = True,
    surge_arrester: bool = False,
    cable_head: bool = True,
) -> list[dict[str, Any]]:
    """Aparaty pierwotne pola źródłowego SN wg jawnej konfiguracji (kreator DER-SN).

    Struktura stała toru (odłącznik szynowy Q1, główny łącznik Q0, odłącznik
    liniowy Q2) jest zawsze obecna — to szkielet pola, nie przełącznik UI.
    Aparaty opcjonalne (CT/VT/uziemnik/ogranicznik/głowica) pojawiają się WYŁĄCZNIE
    gdy konfiguracja tak stanowi. `switching_device` różnicuje pole wyłącznikowe
    (CB) od rozłącznikowego (LBS→LOAD_SWITCH). `device_ref` deterministyczny
    (`field_ref` + pozycja) — ten sam wynik dla tego samego pola, zero seedu.
    """
    main_kind = (
        "LOAD_SWITCH" if str(switching_device).strip().upper() in {"LBS", "LOAD_SWITCH"} else "CB"
    )

    plan: list[tuple[str, str, str]] = [
        ("DS", "Q1", "UPSTREAM"),  # odłącznik szynowy — szkielet pola
        (main_kind, "Q0", "MIDSTREAM"),  # główny aparat łączeniowy (CB/LBS)
    ]
    if ct:
        plan.append(("CT", "T1", "MIDSTREAM"))
    if vt:
        plan.append(("VT", "T2", "OFF_PATH"))
    plan.append(("DS", "Q9", "DOWNSTREAM"))  # odłącznik liniowy — szkielet pola
    if earthing_switch:
        plan.append(("ES", "Q8", "GROUND_BRANCH"))
    if surge_arrester:
        plan.append(("SURGE_ARRESTER", "Z1", "GROUND_BRANCH"))
    if cable_head:
        plan.append(("CABLE_HEAD", "GK", "DOWNSTREAM"))

    devices: list[dict[str, Any]] = []
    for position, (kind, designation, placement) in enumerate(plan):
        entry: dict[str, Any] = {
            "device_ref": f"{field_ref}::dev::{position}",
            "symbol_ref": f"symbol:{kind.lower()}",
            "kind": kind,
            "placement": placement,
            "is_controllable": kind in _SWITCHABLE_PRIMARY_KINDS,
            "render_variant": "kanoniczny",
            "designation": designation,
        }
        if kind == "ES":
            entry["earthing_role"] = "field_earth"
        elif kind == "SURGE_ARRESTER":
            # Ogranicznik przepięć to odgałęzienie DO ZIEMI (uwaga 6) — niesie
            # `earthing_role` spójnie z mostem producenckim i macierzą W1b.
            entry["earthing_role"] = "surge_ground"
        devices.append(entry)
    return porty_toru_pola(devices)


def get_bay_template(template_id: str) -> BayTemplate:
    """Pobiera kanoniczny szablon pola po ID. Raises KeyError if not found."""

    if template_id not in BAY_TEMPLATE_REGISTRY:
        available = ", ".join(sorted(BAY_TEMPLATE_REGISTRY.keys()))
        raise BrakZasobuError(f"Unknown bay_template_id: {template_id}. Available: {available}")
    return BAY_TEMPLATE_REGISTRY[template_id]


def list_bay_templates() -> list[BayTemplate]:
    """Lista wszystkich kanonicznych szablonów pola (deterministyczna kolejność)."""

    return sorted(BAY_TEMPLATE_REGISTRY.values(), key=lambda t: t.template_id)


# ---------------------------------------------------------------------------
# W1c (RECENZJA_MACIERZ_WYPOSAZENIA_2026-07 uwagi 10/15/16/17): ENUMERACJA
# KANONICZNA katalogu konfiguracji pól. Macierz wyposażenia jest TESTEM
# REFERENCYJNYM SILNIKA generowanym Z KATALOGU (uwaga 16), nie z ręcznej listy
# przykładów (uwaga 17). Źródłem przypadków jest ta enumeracja: KAŻDY kanoniczny
# szablon (`BAY_TEMPLATE_REGISTRY`) + warianty pola źródłowego SN (W2b,
# `mv_source_field_primary_devices`) staje się przypadkiem macierzy. Most
# producencki (`cell_configurations` → `primary_devices`) dokłada
# `reference_engine.field_configuration_catalog` (warstwa, która może zależeć od
# katalogu producentów) — tu WYŁĄCZNIE kanon, bez zależności od reference_engine.
# ---------------------------------------------------------------------------

# Grupowanie funkcjonalne konfiguracji (uwaga 15): sekcje macierzy dowodowej i
# testu. Wyprowadzone z ROLI pola (`BayTemplate.bay_role`) — dana katalogowa, nie
# domysł. FEEDER (rezerwowe / potrzeb własnych) → „specjalne".
_FUNCTIONAL_GROUP_BY_ROLE: dict[str, str] = {
    "IN": "liniowe",
    "OUT": "liniowe",
    "FEEDER": "specjalne",
    "TR": "transformatorowe",
    "COUPLER": "sprzeglowe",
    "MEASUREMENT": "pomiarowe",
    "OZE": "OZE",
    "BKR": "kompensacyjne",
}

# Mapowanie roli pola → rola pola we frontendowym read-modelu (`field_role`,
# `enmToSldAdapter`). Lustro mapowania roli macierzy W1 (LINIA_IN /
# TRANSFORMATOROWE) — potrzebne generatorowi macierzy do ustawienia roli pola
# hosta (render podąża za DANYMI, nie za rolą — uwaga 10, ale rola jest metadaną).
_FIELD_ROLE_BY_BAY_ROLE: dict[str, str] = {
    "IN": "LINIA_IN",
    "OUT": "LINIA_OUT",
    "FEEDER": "FEEDER",
    "TR": "TRANSFORMATOROWE",
    "COUPLER": "SPRZEGLO",
    "MEASUREMENT": "POMIAROWE",
    "OZE": "OZE",
    "BKR": "BATERIA_KONDENSATOROW",
}


def functional_group_for_role(bay_role: str) -> str:
    """Grupa funkcjonalna macierzy (uwaga 15) dla roli pola. Domyślnie „specjalne"."""
    return _FUNCTIONAL_GROUP_BY_ROLE.get(bay_role, "specjalne")


#: Rejestr katalogowych pól rodzin producentów (`template_ref` →
#: `manufacturer_ref`), budowany leniwie i raz. Klucz i wartość pochodzą z
#: JEDNEGO źródła — `list_switchgear_solution_templates_for_manufacturer(None)`,
#: czyli dokładnie z tego wywołania, którym resolver pola (`enm/pole_katalogowe`
#: `pole_katalogowe`) rozstrzyga nomenklaturę referencji. Dzięki temu prefiks
#: identyfikatora konfiguracji i ścieżka materializacji aparatów NIE mogą się
#: rozjechać (predykaty parami).
_REJESTR_POL_RODZIN: dict[str, str] | None = None


def _producent_pola_rodziny(template_ref: str) -> str | None:
    """`manufacturer_ref` producenta KATALOGOWEGO POLA RODZINY (`None`, gdy to nie ono).

    Import katalogu rodzin jest LENIWY (wewnątrz funkcji): pakiet `switchgear`
    importuje ten moduł (`BayTemplate` jest bazą kompozycji
    `CompleteMvBayTemplate`), więc import na poziomie modułu byłby cyklem.
    Wywołanie następuje w czasie działania, gdy oba moduły są już wczytane.
    """
    global _REJESTR_POL_RODZIN
    if _REJESTR_POL_RODZIN is None:
        from .switchgear import list_switchgear_solution_templates_for_manufacturer

        rejestr: dict[str, str] = {}
        for szablon in list_switchgear_solution_templates_for_manufacturer(None):
            if not szablon.manufacturer_ref:
                # Katalogowe pole rodziny BEZ producenta jest niespójnością
                # katalogu (rodzina ma `manufacturer_ref` wymagany), a nie
                # przypadkiem do cichego pominięcia: pominięte pole dostałoby
                # prefiks `kanoniczny:`, czyli dokładnie tę fabrykację
                # pochodzenia, którą ta funkcja usuwa.
                raise ValueError(
                    "Katalogowe pole rodziny bez producenta — niespójność katalogu "
                    f"rozdzielnic: {szablon.template_ref}"
                )
            rejestr[szablon.template_ref] = szablon.manufacturer_ref
        _REJESTR_POL_RODZIN = rejestr
    return _REJESTR_POL_RODZIN.get(template_ref)


def config_ref_for_template(template_ref: str) -> str:
    """Stabilny identyfikator konfiguracji pola (uwaga 10) — deterministyczny,
    wyprowadzony z referencji szablonu; NIE zależy od stanu aparatu (wariant
    stanu zamknięty/otwarty dokłada konsument: `<config_ref>::<stan>`).

    PREFIKS NIESIE POCHODZENIE, WIĘC NIE MOŻE GO FABRYKOWAĆ. W danych krążą dwie
    nomenklatury referencji pola (opis: `enm/pole_katalogowe`):

    * kanoniczny szablon pola (`bay_template_line_out`) → `kanoniczny:<ref>`,
    * katalogowe pole rodziny producenta (`ZPUE_WLOSZCZOWA__RELF__LINE_OUT`,
      `CompleteMvBayTemplate`) → `producent:<manufacturer_ref>:<template_ref>`
      wzorem mostu celek producenckich z `reference_engine.
      field_configuration_catalog` (tam drugi człon to ref pakietu
      referencyjnego, tu ref producenta z katalogu rodzin — oba człony są
      DANĄ KATALOGOWĄ, nie parsowaniem nazwy).

    Do naprawy tego długu (karta K-L) każda referencja dostawała prefiks
    `kanoniczny:`, więc pole wybrane z katalogu producenta niosło identyfikator
    twierdzący, że pochodzi z kanonu — pochodzenie było zmyślone.

    O nomenklaturze rozstrzyga KATALOG, nie wołający, i to tym samym zapytaniem
    (`list_switchgear_solution_templates_for_manufacturer`), którym resolver
    aparatów pola wybiera ścieżkę materializacji. Referencja, której katalog
    rodzin nie zna (kanoniczny szablon, kanoniczny fallback
    `CANONICAL_FALLBACK__*`, referencja nieznana), idzie ścieżką kanoniczną w
    OBU miejscach — identyfikator mówi więc, którą ścieżką pole realnie powstało.
    """
    manufacturer_ref = _producent_pola_rodziny(template_ref)
    if manufacturer_ref is not None:
        return f"producent:{manufacturer_ref}:{template_ref}"
    return f"kanoniczny:{template_ref}"


def config_ref_for_mv_source(switching_device: str) -> str:
    """Stabilny identyfikator konfiguracji pola źródłowego SN (W2b) — kanoniczny."""
    main = "lbs" if str(switching_device).strip().upper() in {"LBS", "LOAD_SWITCH"} else "cb"
    return f"kanoniczny:mv_source_{main}"


def _canonical_config_entry(template: BayTemplate) -> dict[str, Any]:
    """Jeden przypadek macierzy z kanonicznego szablonu pola (uwaga 16)."""
    config_ref = config_ref_for_template(template.template_id)
    primary_devices = template_primary_devices(template.template_id, field_ref=config_ref)
    return {
        "config_ref": config_ref,
        "source": "kanoniczny",
        "group": functional_group_for_role(template.bay_role),
        "bay_role": template.bay_role,
        "field_role": _FIELD_ROLE_BY_BAY_ROLE.get(template.bay_role, template.bay_role),
        "template_id": template.template_id,
        "name": template.name,
        "primary_devices": primary_devices,
        # Zestaw, który operacja zapisze w polu bez wskazanej klasy i bez spełnionych warunków
        # funkcji warunkowych — TA SAMA reguła co resolver operacji (`funkcje_eaz_szablonu`).
        "protection_codes": funkcje_eaz_szablonu(template.template_id) or [],
        "wykonanie_pola": template.wykonanie_pola,
        "wykonanie_lacznikow": template.wykonanie_lacznikow,
        "tylko_gpz": template.tylko_gpz,
    }


def _mv_source_config_entry(
    *, switching_device: str, ct: bool, vt: bool, surge_arrester: bool
) -> dict[str, Any]:
    """Przypadek macierzy z pola źródłowego SN (W2b) — jawna konfiguracja DER-SN."""
    config_ref = config_ref_for_mv_source(switching_device)
    name = nazwa_roli_pola_sn_z_okresleniem(
        "OZE", "(wyłącznikowe)" if config_ref.endswith("cb") else "(rozłącznikowe)"
    )
    primary_devices = mv_source_field_primary_devices(
        config_ref,
        switching_device=switching_device,
        ct=ct,
        vt=vt,
        earthing_switch=True,
        surge_arrester=surge_arrester,
        cable_head=True,
    )
    return {
        "config_ref": config_ref,
        "source": "kanoniczny",
        "group": "OZE",
        "bay_role": "OZE",
        "field_role": "OZE",
        "template_id": None,
        "name": name,
        "primary_devices": primary_devices,
        "protection_codes": funkcje_eaz_roli("OZE"),
        "wykonanie_pola": None,
        "wykonanie_lacznikow": None,
        "tylko_gpz": False,
    }


def enumerate_canonical_configurations() -> list[dict[str, Any]]:
    """Enumeracja KANONICZNA katalogu konfiguracji pól (uwaga 16/17): każdy szablon
    `BAY_TEMPLATE_REGISTRY` + dwa warianty pola źródłowego SN (W2b). Deterministyczna
    kolejność (config_ref) — ten sam wynik przy każdym wywołaniu. Zwraca listę
    słowników (JSON-serializowalnych) z `config_ref` (uwaga 10), grupą funkcjonalną
    (uwaga 15), rolą pola i zmaterializowanymi `primary_devices` (tor pierwotny).
    """
    entries: list[dict[str, Any]] = [_canonical_config_entry(t) for t in list_bay_templates()]
    entries.append(
        _mv_source_config_entry(switching_device="CB", ct=True, vt=False, surge_arrester=True)
    )
    entries.append(
        _mv_source_config_entry(switching_device="LBS", ct=True, vt=True, surge_arrester=True)
    )
    return sorted(entries, key=lambda e: str(e["config_ref"]))


# Typy pól z uwagi 9 (RECENZJA_MACIERZ_WYPOSAZENIA), które NIE mają szablonu w
# katalogu — jawny rejestr braków (zero fabrykacji: nie wymyślamy szablonu,
# którego katalog nie niesie). Bateria kondensatorów i generator synchroniczny
# (odróżniony od źródła OZE inwerterowego) czekają na decyzję danych/domeny.
FIELD_TYPES_WITHOUT_TEMPLATE: list[str] = [
    "bateria_kondensatorow",
    "generator_synchroniczny",
]
