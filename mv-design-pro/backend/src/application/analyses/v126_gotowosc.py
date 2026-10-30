"""Gotowość analiz specjalistycznych V12.6 — JEDNA funkcja dla ekranu i dla
uruchomienia (karta B-02 / W3-E, 2026-09-10).

DLACZEGO. Do tej karty gotowość biegu V12.6 istniała wyłącznie jako bramki 422
rozsiane po trasie `POST /cases/{case_id}/runs/v126/{rodzaj}` (brak węzłów,
`generator.q_missing`, `generator.converter_card_missing`,
`generator.harmonic_spectrum_missing`), a ekran nie miał jak pokazać
projektantowi PRZED uruchomieniem, czego brakuje. Dyrektywa właściciela
(B-02 §3.3 E): GOTOWOŚĆ POTWIERDZONA + lista sprawdzonych warunków albo
NIEPOTWIERDZONA + lista braków — i uruchomienie dopiero po tym.

PREDYKATY PARAMI (reguła KLASA §3): ten sam wynik `ocen_gotowosc_v126`
zasila `GET /cases/{case_id}/v126/gotowosc` (ekran) i odmowę 422 na POST.
Nie ma drugiej listy warunków.

ZAKAZ FABRYKACJI (karta §0 poz. 4): dana, której model nie niesie i której
projektant nie podał, jest BRAKIEM — nawet jeśli solver FROZEN ma dla niej
wartość domyślną kontraktu wejścia (uziom 60×40 m, wyposażenie przekaźnika = wszystkie
metody); napięcie powrotne i prąd załączania nie mają już w solverze wartości zastępczej
(karta UX-04/POLE-ZU-SKLADOWA-ZEROWA — brak = nazwany brak w wyniku). Domyślną solvera jest
wyłącznie parametr metody (rozstrojenie dławika, tłumienie prądu resztkowego). Wartości
WYPROWADZALNE z modelu (U_m sieci SN jako napięcie znamionowe wyłącznika, IEC 60038 /
IEC 62271-1) są PROPONOWANE z nazwanym źródłem — projektant je potwierdza
w formularzu, a do biegu trafiają jawnie. Sposób uziemienia punktu neutralnego sieci SN
NIE jest parametrem (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA §0 pkt 4): solver czyta go
z modelu (`V126AcademicInput.uziemienie_sn` z `enm.uziemienie_sekcji`), a gotowość
sprawdza go TYM SAMYM predykatem co solver (`brak_uziemienia_sn`).

ZERO fizyki: moduł sprawdza OBECNOŚĆ danych na wejściu solvera zbudowanym tą
samą funkcją, którą buduje je uruchomienie (`build_v126_input_from_enm`), nie
liczy żadnej wielkości.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from application.analyses.v126_katalog import karta_analizy, nazwa_parametru_pl
from application.analyses.v126_prad_uziomowy import doloz_prad_uziomowy, szyna_uziomu
from enm.hash import compute_enm_hash
from enm.models import EnergyNetworkModel
from enm.nazwy_elementow import nazwa_po_identyfikatorze, zbuduj_indeks_nazw
from enm.uziemienie_sekcji import uziemienie_sieci
from network_model.odmowa_danych import OdmowaDanychError
from network_model.pochodne.pasma_napieciowe import napiecie_najwyzsze_sieci_kv
from network_model.solvers.v126_academic import wielkosc_pradu_uziomowego
from pydantic import BaseModel
from solver_input.moc_bierna_wytworcy import moc_bierna_wytworcy
from solver_input.v126_contracts import (
    ANALIZY_IMPEDANCJI_ZASTEPCZEJ,
    PROJEKT_UZIEMIENIA_WARIANTU,
    V126AcademicInput,
    V126AnalysisType,
    V126EarthingInput,
    V126MotorInput,
    brak_uziemienia_sn,
    braki_poziomu_izolacji,
    build_v126_input_from_enm,
    generatory_przeksztaltnikowe_v126,
    odbiorcy_z_parametrow,
    ograniczniki_bez_uziemienia_sieci,
    pominiete_zrodla_v126,
)
from werdykt import format_liczba

GOTOWOSC_POTWIERDZONA = "POTWIERDZONA"
GOTOWOSC_NIEPOTWIERDZONA = "NIEPOTWIERDZONA"
GOTOWOSC_WYCOFANA = "WYCOFANA"

#: Komunikat bramki „brak węzłów" — cytowany przez istniejące testy API
#: (`tests/api/test_v126_opf_loss_lcc_api.py`), więc zostaje słowo w słowo.
BRAK_WEZLOW_PL = (
    "Przypadek nie ma committed ENM z węzłami. V12.6 nie uruchamia obliczeń z draftu UI."
)

_KOD_Q = "generator.q_missing"
_KOD_KARTA = "generator.converter_card_missing"
_KOD_WIDMO = "generator.harmonic_spectrum_missing"


def _pola_wymagane(klasa: type[BaseModel]) -> tuple[str, ...]:
    """Pola wymagane kontraktu wejścia (bez wartości domyślnej) — JEDNO źródło: warunek
    gotowości i walidacja kontraktu solvera nie mogą się rozjechać (predykaty parami)."""
    return tuple(nazwa for nazwa, pole in klasa.model_fields.items() if pole.is_required())


_KLUCZE_UZIOMU_WYMAGANE: tuple[str, ...] = _pola_wymagane(V126EarthingInput)
#: Pola liczbowe wymagane uziomu (szyna stacji ``bus_ref`` — osobny warunek wyboru z modelu).
_KLUCZE_UZIOMU_LICZBOWE: tuple[str, ...] = tuple(
    k for k in _KLUCZE_UZIOMU_WYMAGANE if k != "bus_ref"
)
_KLUCZE_SILNIKA_WYMAGANE: tuple[str, ...] = _pola_wymagane(V126MotorInput)


@dataclass(frozen=True)
class Warunek:
    """Jeden sprawdzony warunek gotowości (spełniony albo nie)."""

    kod: str
    opis_pl: str
    spelniony: bool
    #: Elementy modelu, których warunek dotyczy (referencje ENM); puste = cała sieć.
    elementy: tuple[str, ...] = ()
    #: Warunek blokujący uruchomienie (False = uwaga o częściowych danych).
    blokujacy: bool = True
    #: Klucz parametru projektanta, który usuwa brak (gdy brak jest do uzupełnienia).
    klucz_parametru: str | None = None
    #: Karta OD-17a: nazwane odmowy braku pakietu danych właściciela, z których wynika warunek
    #: (rekordy ``RekordBrakuPakietu`` w postaci JSON; klucz w odpowiedzi tylko, gdy są).
    braki_pakietow: tuple[dict[str, Any], ...] = ()

    def to_dict(self) -> dict[str, Any]:
        wynik: dict[str, Any] = {
            "kod": self.kod,
            "opis_pl": self.opis_pl,
            "spelniony": self.spelniony,
            "elementy": list(self.elementy),
            "blokujacy": self.blokujacy,
            "klucz_parametru": self.klucz_parametru,
        }
        if self.braki_pakietow:
            wynik["braki_pakietow"] = list(self.braki_pakietow)
        return wynik


@dataclass(frozen=True)
class DanaZModeluWartosc:
    """Dana wejściowa faktycznie odczytana z modelu (do sekcji „z modelu")."""

    nazwa_pl: str
    wartosc_pl: str
    elementy: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "nazwa_pl": self.nazwa_pl,
            "wartosc_pl": self.wartosc_pl,
            "elementy": list(self.elementy),
        }


@dataclass(frozen=True)
class Proponowana:
    """Wartość parametru wyprowadzona z modelu — do potwierdzenia przez projektanta."""

    wartosc: Any
    zrodlo_pl: str

    def to_dict(self) -> dict[str, Any]:
        return {"wartosc": self.wartosc, "zrodlo_pl": self.zrodlo_pl}


@dataclass(frozen=True)
class GotowoscAnalizy:
    kod: str
    gotowosc: str
    warunki: tuple[Warunek, ...] = ()
    dane_z_modelu: tuple[DanaZModeluWartosc, ...] = ()
    proponowane: dict[str, Proponowana] = field(default_factory=dict)
    powod_wycofania_pl: str | None = None

    @property
    def braki(self) -> tuple[Warunek, ...]:
        return tuple(w for w in self.warunki if w.blokujacy and not w.spelniony)

    @property
    def uwagi(self) -> tuple[Warunek, ...]:
        return tuple(w for w in self.warunki if not w.blokujacy and not w.spelniony)

    @property
    def potwierdzona(self) -> bool:
        return self.gotowosc == GOTOWOSC_POTWIERDZONA

    def komunikat_odmowy(self) -> str:
        """Treść odmowy 422 — każdy brak jednym zdaniem, z kodem i elementami."""
        czesci = []
        for brak in self.braki:
            elementy = f" — {', '.join(brak.elementy)}" if brak.elementy else ""
            czesci.append(f"{brak.opis_pl} ({brak.kod}){elementy}")
        return "; ".join(czesci)

    def to_dict(self) -> dict[str, Any]:
        return {
            "kod": self.kod,
            "gotowosc": self.gotowosc,
            "warunki": [w.to_dict() for w in self.warunki],
            "braki": [w.to_dict() for w in self.braki],
            "uwagi": [w.to_dict() for w in self.uwagi],
            "dane_z_modelu": [d.to_dict() for d in self.dane_z_modelu],
            "proponowane": {klucz: p.to_dict() for klucz, p in self.proponowane.items()},
            "powod_wycofania_pl": self.powod_wycofania_pl,
        }


# --- Przedmiot analizy (co opisuje model) -----------------------------------


def czestotliwosc_modelu(enm: EnergyNetworkModel) -> float | None:
    """Częstotliwość sieci WPROST z modelu (z pierwszej szyny, która ją niesie);
    `None`, gdy ŻADNA szyna jej nie niesie.

    JEDYNE źródło prawdy dla `przedmiot_modelu` i `_dane_z_modelu` (karta
    B02-BE-TESTY, reguła KLASA §3, predykaty parami): most solvera
    (`build_v126_input_from_enm` → `V126AcademicInput.base_frequency_hz`)
    podstawia 50 Hz jako ZAŁOŻENIE METODY, gdy model jej nie niesie — to NIE
    jest dana modelu. Przed tą naprawą `przedmiot_modelu` mówił o tym samym ENM
    uczciwie `None`, a `_dane_z_modelu` (czytający `model.base_frequency_hz` PO
    podstawieniu mostu) melduł „Częstotliwość sieci: 50 Hz" jakby to była dana
    ODCZYTANA z modelu — dwie różne odpowiedzi na to samo pytanie z jednego
    modułu (fabrykacja „z modelu").
    """
    return next((b.frequency_hz for b in enm.buses if b.frequency_hz is not None), None)


def przedmiot_modelu(enm: EnergyNetworkModel) -> dict[str, Any]:
    """Zwięzły opis PRZEDMIOTU analiz: liczności, poziomy napięć, punkt przyłączenia.

    Zero fizyki — liczności i odczyt pól modelu. Częstotliwość: `czestotliwosc_modelu`
    (brak = `None`, uczciwie: solver przyjmie 50 Hz, co karta pokazuje jako
    wartość domyślną, nie daną modelu).
    """
    czestotliwosc = czestotliwosc_modelu(enm)
    nazwy_szyn = {b.ref_id: b.name for b in enm.buses}
    zrodlo = next((s for s in enm.sources if s.bus_ref in nazwy_szyn), None)
    punkt = (
        {"ref": zrodlo.bus_ref, "nazwa": nazwy_szyn[zrodlo.bus_ref], "zrodlo": zrodlo.ref_id}
        if zrodlo is not None
        else None
    )
    return {
        "liczba_szyn": len(enm.buses),
        "liczba_galezi": len(enm.branches),
        "liczba_transformatorow": len(enm.transformers),
        "liczba_zrodel_przeksztaltnikowych": len(generatory_przeksztaltnikowe_v126(enm)),
        "liczba_generatorow": len(enm.generators),
        "poziomy_napiec_kv": sorted({float(b.voltage_kv) for b in enm.buses}),
        "czestotliwosc_hz": czestotliwosc,
        "punkt_przylaczenia": punkt,
        "nazwa_modelu": enm.header.name,
        "rewizja": enm.header.revision,
    }


# --- Pomocnicze --------------------------------------------------------------


def _liczba(wartosc: Any) -> bool:
    return isinstance(wartosc, int | float) and not isinstance(wartosc, bool)


def _obecna(wartosc: Any) -> bool:
    if wartosc is None:
        return False
    if isinstance(wartosc, str):
        return wartosc.strip() != ""
    return True


def _warunek_parametru(
    parametry: dict[str, Any],
    klucz: str,
    opis_pl: str,
    *,
    proponowane: dict[str, Proponowana],
) -> Warunek:
    """Parametr projektanta: obecny w żądaniu ALBO proponowany z modelu (wtedy
    trafia do biegu jawnie — patrz `uzupelnij_parametry_z_modelu`)."""
    obecny = _obecna(parametry.get(klucz)) or klucz in proponowane
    return Warunek(
        kod=f"parametr.{klucz}",
        opis_pl=opis_pl,
        spelniony=obecny,
        klucz_parametru=klucz,
    )


def _propozycje_z_modelu(
    enm: EnergyNetworkModel, rodzaj: V126AnalysisType
) -> dict[str, Proponowana]:
    """Wartości parametrów wyprowadzalne z modelu (nazwane źródło)."""
    propozycje: dict[str, Proponowana] = {}
    if rodzaj == V126AnalysisType.TRANSIENT_TRV:
        propozycja_ur = _propozycja_napiecia_wylacznika(enm)
        if propozycja_ur is not None:
            propozycje["breaker_rated_voltage_kv"] = propozycja_ur
    return propozycje


def _propozycja_napiecia_wylacznika(enm: EnergyNetworkModel) -> Proponowana | None:
    """U_r wyłącznika = U_m sieci SN modelu (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA).

    Napięcie znamionowe aparatu łączeniowego jest wartością napięcia najwyższego urządzenia
    U_m (IEC 62271-1), a urządzenie pokrywa sieć, gdy U_m ≥ U_s sieci (IEC 60038 tab. 3–5 —
    jedyna tabela produktu `napiecie_najwyzsze_sieci_kv`). Sieć z JEDYNEJ prawdy o sieciach SN
    (`uziemienie_sieci`, ta sama co U_l projektu uziemienia): analiza napięcia powrotnego
    dotyczy wyłączników SN. Dawniej „najwyższe napięcie szyny modelu" — w modelu GPZ 110 kV
    dla wyłącznika SN. Model bez sieci SN: najwyższe napięcie znamionowe szyny modelu (sieć WN)
    przez tę samą tabelę; poza tablicami (nN) — brak propozycji (parametr wymagany)."""
    sieci_sn = [s.napiecie_kv for s in uziemienie_sieci(enm)]
    if sieci_sn:
        u_n = max(sieci_sn)
        opis = f"sieci SN {format_liczba(u_n)} kV"
    elif enm.buses:
        u_n = max(float(b.voltage_kv) for b in enm.buses)
        opis = f"najwyższego napięcia szyny modelu {format_liczba(u_n)} kV"
    else:
        return None
    u_m = napiecie_najwyzsze_sieci_kv(u_n)
    if u_m is None:
        return None
    return Proponowana(
        u_m,
        f"napięcie najwyższe urządzenia $U_m$ {opis} ({format_liczba(u_m)} kV, IEC 60038 "
        "tab. 3–5; $U_r$ aparatu $= U_m$, IEC 62271-1)",
    )


def uzupelnij_parametry_z_modelu(
    enm: EnergyNetworkModel, rodzaj: V126AnalysisType, parametry: dict[str, Any] | None
) -> dict[str, Any]:
    """Parametry biegu = parametry projektanta + propozycje z modelu tam, gdzie
    projektant nic nie podał. Jawne — bieg zapisuje je w `run.options["model"]`
    (`parameters`), więc proweniencja jest widoczna w zapisie wejścia."""
    wynik = dict(parametry or {})
    for klucz, propozycja in _propozycje_z_modelu(enm, rodzaj).items():
        if not _obecna(wynik.get(klucz)):
            wynik[klucz] = propozycja.wartosc
    return wynik


# --- Warunki per rodzaj -----------------------------------------------------


def _warunki_wspolne(enm: EnergyNetworkModel) -> list[Warunek]:
    return [
        Warunek(
            kod="model.wezly",
            opis_pl=(
                "Model ma węzły (zatwierdzony model sieci przypadku)"
                if enm.buses
                else BRAK_WEZLOW_PL
            ),
            spelniony=bool(enm.buses),
        )
    ]


def _warunki_q_generatorow(enm: EnergyNetworkModel) -> Warunek:
    bez_q = tuple(
        gen.ref_id
        for gen in enm.generators
        if moc_bierna_wytworcy(gen, gen.materialized_params).brak
    )
    return Warunek(
        kod=_KOD_Q,
        opis_pl=(
            "Moc bierna każdego wytwórcy jest znana (pole jawne albo nastawa Q karty katalogowej)"
            if not bez_q
            else "Wytwórcy bez znanej mocy biernej — generatory bez mocy biernej"
        ),
        spelniony=not bez_q,
        elementy=bez_q,
    )


def _warunki_harmoniczne(
    enm: EnergyNetworkModel, model: V126AcademicInput, parametry: dict[str, Any]
) -> list[Warunek]:
    kandydaci = generatory_przeksztaltnikowe_v126(enm)
    pominiete = pominiete_zrodla_v126(enm, parameters=parametry)
    warunki: list[Warunek] = []
    if kandydaci and not model.harmonic_sources:
        # Karta B-02 (2026-09-10): brak nazwany PO PRZYCZYNIE z JEDNEJ oceny karty
        # (`pominiete_zrodla_v126` — ta sama ocena, którą most buduje wejście;
        # predykaty parami). Przed tą naprawą KAŻDY kandydat bez wejścia dostawał
        # kod „brak widma" z kluczem `harmonic_spectra` — także generator BEZ KARTY
        # (bez mocy znamionowej), którego widmo ręczne NIE odblokuje: prąd bazowy
        # wstrzyknięcia liczy się z S_n karty. Ekran wskazywał wtedy formularz
        # widma jako remedium, a bieg po jego wypełnieniu dalej odmawiał 422 —
        # fabrykacja remedium. Gdy `model.harmonic_sources` jest puste, każdy
        # kandydat jest w `pominiete` dokładnie z jednym z dwóch kodów (pinuje
        # `tests/application/analyses/test_v126_gotowosc.py`).
        bez_karty = tuple(p["ref"] for p in pominiete if p["kod"] == _KOD_KARTA)
        bez_widma = tuple(p["ref"] for p in pominiete if p["kod"] == _KOD_WIDMO)
        braki_widma = tuple(
            p["odmowa_pakietu"]
            for p in pominiete
            if p["kod"] == _KOD_WIDMO and "odmowa_pakietu" in p
        )
        if bez_karty:
            warunki.append(
                Warunek(
                    kod=_KOD_KARTA,
                    opis_pl=(
                        "Przekształtniki bez karty katalogowej z mocą znamionową (z niej liczony "
                        "jest prąd bazowy wstrzyknięcia; widmo ręczne jej nie zastępuje) — "
                        "generatory bez karty przekształtnika"
                    ),
                    spelniony=False,
                    elementy=bez_karty,
                )
            )
        if bez_widma:
            warunki.append(
                Warunek(
                    kod=_KOD_WIDMO,
                    opis_pl=(
                        "Przekształtniki z kartą katalogową bez widma harmonicznego (karta "
                        "katalogowa albo wejście ręczne) — generatory bez widma harmonicznego"
                    ),
                    spelniony=False,
                    elementy=bez_widma,
                    klucz_parametru="harmonic_spectra",
                    braki_pakietow=braki_widma,
                )
            )
    else:
        warunki.append(
            Warunek(
                kod="zrodla.odksztalcajace",
                opis_pl=(
                    f"Źródła odkształcające z widmem harmonicznym: {len(model.harmonic_sources)}"
                    if model.harmonic_sources
                    else "Model nie zawiera przekształtników z widmem harmonicznym — brak źródeł "
                    "odkształcających do wstrzyknięcia (analiza dałaby zerowe odkształcenie z braku "
                    "danych, nie z pomiaru)"
                ),
                spelniony=bool(model.harmonic_sources),
                elementy=tuple(z.source_ref for z in model.harmonic_sources),
                klucz_parametru=None if model.harmonic_sources else "harmonic_spectra",
            )
        )
    if pominiete and model.harmonic_sources:
        # Opis nazywa generatory nazwami z modelu; identyfikatory zostają w `elementy`
        # (karta #144).
        nazwy = zbuduj_indeks_nazw(enm)
        warunki.append(
            Warunek(
                kod="zrodla.pominiete",
                opis_pl=(
                    "Część przekształtników pominięta w wejściu (brak karty albo widma): "
                    + ", ".join(
                        f"{nazwa_po_identyfikatorze(p['ref'], indeks=nazwy)} ({p['kod']})"
                        for p in pominiete
                    )
                ),
                spelniony=False,
                elementy=tuple(p["ref"] for p in pominiete),
                blokujacy=False,
            )
        )
    return warunki


def _warunki_ssci(
    enm: EnergyNetworkModel, model: V126AcademicInput, parametry: dict[str, Any]
) -> list[Warunek]:
    kandydaci = generatory_przeksztaltnikowe_v126(enm)
    warunki: list[Warunek] = []
    if kandydaci and not model.converters:
        warunki.append(
            Warunek(
                kod=_KOD_KARTA,
                opis_pl=(
                    "Żaden przekształtnik nie ma karty katalogowej z mocą znamionową — "
                    "generatory bez karty przekształtnika"
                ),
                spelniony=False,
                elementy=tuple(kandydaci),
            )
        )
        return warunki
    warunki.append(
        Warunek(
            kod="przeksztaltnik.obecny",
            opis_pl=(
                f"Przekształtniki z kartą katalogową w modelu: {len(model.converters)}"
                if model.converters
                else "Model nie zawiera przekształtnika (falownika) z kartą katalogową"
            ),
            spelniony=bool(model.converters),
            elementy=tuple(c.ref for c in model.converters),
        )
    )
    if not model.converters:
        return warunki
    ref = parametry.get("ssci_converter_ref")
    wybrany = (
        next((c for c in model.converters if c.ref == ref), None)
        if _obecna(ref)
        else model.converters[0]
    )
    if wybrany is None:
        warunki.append(
            Warunek(
                kod="parametr.ssci_converter_ref",
                # Parametr wskazuje przekształtnik, którego model nie zna — nazwy nie ma skąd
                # wziąć, a identyfikator nie jest nazwą (karta #144); pole parametru niesie
                # `klucz_parametru`.
                opis_pl="Wskazany w parametrach przekształtnik nie występuje w modelu",
                spelniony=False,
                klucz_parametru="ssci_converter_ref",
            )
        )
        return warunki
    warunki.append(
        Warunek(
            kod=_KOD_Q,
            # Element nazywa lista `elementy` (ekran pokazuje nazwę ze schematu) — opis
            # bez surowej referencji modelu (uczciwość natychmiastowa 2026-09-23: dawny opis
            # „przekształtnika gen_pv" wystawiał identyfikator ENM na ekran projektanta).
            opis_pl=(
                "Moc bierna przekształtnika analizy SSCI jest znana"
                if wybrany.q_mvar is not None
                else "Przekształtnik analizy SSCI bez mocy biernej"
            ),
            spelniony=wybrany.q_mvar is not None,
            elementy=(wybrany.ref,),
        )
    )
    brakujace_pola = [
        nazwa_pl
        for nazwa_pl, wartosc in (
            ("pasmo pętli prądowej", wybrany.current_loop_bandwidth_hz),
            ("pasmo PLL", wybrany.pll_bandwidth_hz),
            ("indukcyjność filtra", wybrany.filter_l_pu),
        )
        if wartosc is None
    ]
    warunki.append(
        Warunek(
            kod="przeksztaltnik.karta_ssci",
            opis_pl=(
                "Karta przekształtnika analizy SSCI niesie pasmo pętli prądowej, pasmo PLL "
                "i indukcyjność filtra"
                if not brakujace_pola
                else "Karta przekształtnika analizy SSCI bez pól: " + ", ".join(brakujace_pola)
            ),
            spelniony=not brakujace_pola,
            elementy=(wybrany.ref,),
        )
    )
    return warunki


def _warunki_niezawodnosci(
    enm: EnergyNetworkModel, model: V126AcademicInput, parametry: dict[str, Any]
) -> list[Warunek]:
    warunki = [_warunki_q_generatorow(enm)]
    warunki.append(
        Warunek(
            kod="model.galezie",
            opis_pl=(
                f"Gałęzie do zdarzeń N-1: {len(model.branches)}"
                if model.branches
                else "Model nie zawiera gałęzi — brak zdarzeń N-1"
            ),
            spelniony=bool(model.branches),
        )
    )
    # Liczba odbiorców: TEN SAM odczyt parametru, którym most zbudował
    # `customer_count` szyn (`odbiorcy_z_parametrow`) — predykaty parami.
    odbiorcy = odbiorcy_z_parametrow(parametry)
    szyny_modelu = {b.ref for b in model.buses}
    spoza_modelu = tuple(ref for ref in odbiorcy.liczby if ref not in szyny_modelu)
    suma = sum(b.customer_count for b in model.buses)
    z_odbiorcami = tuple(b.ref for b in model.buses if b.customer_count > 0)
    if odbiorcy.bledne or spoza_modelu:
        opis = (
            "Wpisy liczby odbiorców odrzucone (wartość nie jest liczbą całkowitą ≥ 0 albo szyna spoza modelu): "
            + ", ".join(odbiorcy.bledne + spoza_modelu)
        )
        spelniony = False
        elementy = odbiorcy.bledne + spoza_modelu
    elif suma > 0:
        opis = (
            f"Liczba odbiorców zasilanych z szyn podana przez projektanta: {suma} "
            f"(szyny z odbiorcami: {len(z_odbiorcami)})"
        )
        spelniony = True
        elementy = z_odbiorcami
    else:
        opis = (
            "Brak liczby odbiorców zasilanych z szyn — model sieci nie niesie tej danej, "
            "a wskaźniki SAIDI/SAIFI liczone bez odbiorców byłyby zerami z braku danych, "
            "nie z pomiaru"
        )
        spelniony = False
        elementy = ()
    warunki.append(
        Warunek(
            kod="parametr.customer_counts",
            opis_pl=opis,
            spelniony=spelniony,
            elementy=elementy,
            klucz_parametru="customer_counts",
        )
    )
    bez_obciazalnosci = tuple(b.ref for b in model.branches if b.ampacity_a is None)
    if bez_obciazalnosci:
        warunki.append(
            Warunek(
                kod="galezie.bez_obciazalnosci",
                opis_pl=(
                    f"{len(bez_obciazalnosci)} z {len(model.branches)} gałęzi bez obciążalności "
                    "długotrwałej (model ani karta) — dla nich dotkliwość bez członu przeciążeniowego"
                ),
                spelniony=False,
                elementy=bez_obciazalnosci,
                blokujacy=False,
            )
        )
    return warunki


def _warunki_uziomu(model: V126AcademicInput, parametry: dict[str, Any]) -> list[Warunek]:
    uziom = parametry.get("earthing")
    uziom = uziom if isinstance(uziom, dict) else {}
    brakujace = tuple(k for k in _KLUCZE_UZIOMU_LICZBOWE if not _liczba(uziom.get(k)))
    # Karta B02-BE-TESTY: polskie nazwy z KATALOGU (`nazwa_parametru_pl`), NIE
    # surowe klucze Pythona (`rho1_ohm_m`) — identyfikator z podkreśleniem na
    # ekranie projektanta łamie `prezentacja.straznik.test.tsx`.
    nazwy_brakujacych_pl = [
        nazwa_parametru_pl(V126AnalysisType.EARTHING_SAFETY.value, f"earthing.{klucz}")
        for klucz in brakujace
    ]
    warunki = [
        Warunek(
            kod="parametr.earthing",
            opis_pl=(
                "Dane uziomu stacji podane przez projektanta (geometria siatki, grunt, czas "
                "zwarcia, warstwa powierzchniowa)"
                if not brakujace
                else "Brak danych uziomu stacji: " + ", ".join(nazwy_brakujacych_pl)
            ),
            spelniony=not brakujace,
            klucz_parametru="earthing",
        )
    ]
    # Prąd zwarcia doziemnego stacji z MODELU (EN 50522 tab. 1) albo nadpisanie projektanta —
    # TA SAMA reguła co solver (`wielkosc_pradu_uziomowego`, predykaty parami); brak prądu
    # w formularzu nie blokuje, gdy model go wyznacza.
    szyna = szyna_uziomu(parametry)
    prad = model.prad_uziomowy
    if szyna is None:
        warunki.append(
            Warunek(
                kod="parametr.earthing.bus_ref",
                opis_pl="Nie wskazano szyny stacji, której uziom jest oceniany",
                spelniony=False,
                klucz_parametru="earthing",
            )
        )
        return warunki
    nadpisanie = _liczba(uziom.get("fault_current_ka"))
    wielkosci = [] if prad is None else [wielkosc_pradu_uziomowego(p) for p in prad.przypadki]
    z_modelu = [w for w in wielkosci if w.prad_a is not None]
    przyczyny = [w.brak_pl for w in wielkosci if w.brak_pl]
    if prad is not None and prad.brak_pl:
        przyczyny.insert(0, prad.brak_pl)
    stacja = prad.nazwa_stacji_pl if prad is not None else "stacja"
    if nadpisanie:
        opis = (
            f"Prąd zwarcia doziemnego stacji „{stacja}” — wartość projektanta (nadpisuje prąd "
            "z modelu)"
        )
    elif z_modelu:
        opis = (
            f"Prąd zwarcia doziemnego stacji „{stacja}” z modelu (EN 50522 tab. 1, "
            f"{len(z_modelu)} z {len(wielkosci)} przypadków policzonych)"
        )
    else:
        opis = (
            f"Prąd zwarcia doziemnego stacji „{stacja}” nieoznaczalny z modelu"
            + (": " + "; ".join(przyczyny) if przyczyny else "")
            + " — podaj prąd projektanta albo uzupełnij model"
        )
    warunki.append(
        Warunek(
            kod="model.prad_uziomowy",
            opis_pl=opis,
            spelniony=bool(nadpisanie) or bool(z_modelu),
            elementy=(szyna,),
            klucz_parametru="earthing",
        )
    )
    return warunki


def _warunki_izolacji(enm: EnergyNetworkModel, model: V126AcademicInput) -> list[Warunek]:
    # Miejsca z ogranicznikiem, które NIE weszły do wejścia koordynacji (brak uziemienia
    # punktu neutralnego sieci) — liczone RAZ, czytane przez oba warunki poniżej, żeby zdanie
    # „model nie zawiera ograniczników" nie padło, gdy ograniczniki są, a brakuje uziemienia.
    bez_uziemienia = ograniczniki_bez_uziemienia_sieci(enm)
    if model.insulation:
        opis_ogranicznikow = (
            f"Miejsca zainstalowania ograniczników przepięć w modelu: {len(model.insulation)}"
        )
    elif bez_uziemienia:
        opis_ogranicznikow = (
            f"Ograniczniki przepięć w modelu: {len(bez_uziemienia)} miejsc, żadne nie wchodzi "
            "do koordynacji izolacji — brak uziemienia punktu neutralnego sieci (warunek niżej)"
        )
    else:
        opis_ogranicznikow = (
            "Model nie zawiera ograniczników przepięć (aparaty pierwotne pól i stacji)"
        )
    warunki = [
        Warunek(
            kod="model.ograniczniki",
            opis_pl=opis_ogranicznikow,
            spelniony=bool(model.insulation),
            elementy=tuple(i.location_bus_ref for i in model.insulation),
        )
    ]
    # Karta OD-17a: poziom izolacji udarowej chronionych aparatów to dana karty producenta
    # (pakiet właściciela) — brak nazwany odmową z rekordami, warunek NIEBLOKUJĄCY (status
    # `BRAK_PODSTAWY`: wynik informacyjny wobec poziomu normowego). Ta sama lista trafia do
    # zapisu biegu (`api/v126_academic.py`, pole `braki_pakietow`).
    braki_bil = braki_poziomu_izolacji(enm, model.insulation)
    if braki_bil:
        warunki.append(
            Warunek(
                kod="ograniczniki.poziom_izolacji_z_karty",
                opis_pl=(
                    f"{len(braki_bil)} z {len(model.insulation)} miejsc bez poziomu izolacji "
                    "udarowej chronionych aparatów z karty producenta — margines ochrony "
                    "informacyjnie wobec poziomu normowego IEC 60071-1"
                ),
                spelniony=False,
                elementy=tuple(i.location_bus_ref for i in model.insulation),
                blokujacy=False,
                braki_pakietow=tuple(r.model_dump(mode="json") for r in braki_bil),
            )
        )
    bez_karty = tuple(i.location_bus_ref for i in model.insulation if i.arrester_mcov_kv is None)
    if bez_karty:
        warunki.append(
            Warunek(
                kod="ograniczniki.bez_karty",
                opis_pl=(
                    f"{len(bez_karty)} z {len(model.insulation)} miejsc bez karty katalogowej "
                    "ogranicznika — parametry z doboru wstępnego solvera (reguły IEC 60071)"
                ),
                spelniony=False,
                elementy=bez_karty,
                blokujacy=False,
            )
        )
    # W5-D p. 12 (OD-24): ogranicznik na szynie bez uziemienia punktu neutralnego w
    # modelu nie ma wiersza wejścia (most nie podstawia „isolated") — gotowość mówi
    # to wprost i blokuje, zamiast liczyć koordynację na fabrykowanej kategorii TOV.
    if bez_uziemienia:
        warunki.append(
            Warunek(
                kod="ograniczniki.uziemienie_sieci_nieznane",
                opis_pl=(
                    f"{len(bez_uziemienia)} miejsc z ogranicznikiem bez ustalonego uziemienia "
                    "punktu neutralnego sieci w modelu (zespół uziemiający sekcji bez elementu "
                    "w punkcie neutralnym, a poza SN — źródło ani transformator nie deklarują) — "
                    "kategoria TOV (sieć izolowana/uziemiona) nie może być przyjęta domyślnie"
                ),
                spelniony=False,
                elementy=bez_uziemienia,
            )
        )
    return warunki


def _warunek_uziemienia_sn(
    model: V126AcademicInput, *, projekt_zespolu: bool = False, blokujacy: bool = True
) -> Warunek:
    """Sposób uziemienia punktu neutralnego sieci SN z MODELU — ten sam predykat, którym
    solver odmawia (`brak_uziemienia_sn`, predykaty parami)."""
    powod = brak_uziemienia_sn(model.uziemienie_sn, projekt_zespolu=projekt_zespolu)
    opis = (
        "Sposób uziemienia punktu neutralnego sieci SN z modelu: "
        + (model.uziemienie_sn.opis_pl if model.uziemienie_sn is not None else "")
        if powod is None
        else powod
    )
    return Warunek(
        kod="model.uziemienie_sn",
        opis_pl=opis,
        spelniony=powod is None,
        blokujacy=blokujacy,
    )


def _warunki_detekcji(model: V126AcademicInput, parametry: dict[str, Any]) -> list[Warunek]:
    metody = parametry.get("relay_methods")
    return [
        _warunek_uziemienia_sn(model),
        Warunek(
            kod="parametr.relay_methods",
            opis_pl=(
                "Metody detekcji dostępne w przekaźniku wskazane przez projektanta"
                if isinstance(metody, list) and metody
                else "Brak wyposażenia przekaźnika — wskaż metody detekcji dostępne w przekaźniku"
            ),
            spelniony=isinstance(metody, list) and bool(metody),
            # Zasada nr 4: brak wyposażenia przekaźnika nie blokuje biegu — dobór metody
            # i nastaw biegnie, a kryterium dostępności funkcji jest NIE_OCENIONO z nazwanym
            # brakiem (wartość robocza „przekaźnik ma każdą funkcję” rozstrzygałaby kryterium
            # samym założeniem).
            blokujacy=False,
            klucz_parametru="relay_methods",
        ),
    ]


def _warunki_trv(
    model: V126AcademicInput, parametry: dict[str, Any], proponowane: dict[str, Proponowana]
) -> list[Warunek]:
    warunki = [
        _warunek_parametru(
            parametry,
            "breaker_rated_voltage_kv",
            "Napięcie znamionowe wyłącznika",
            proponowane=proponowane,
        ),
        _warunek_parametru(
            parametry,
            "trv_natural_frequency_hz",
            "Częstotliwość własna napięcia powrotnego obwodu",
            proponowane=proponowane,
        ),
        _warunek_parametru(
            parametry, "trv_tau_s", "Stała czasowa napięcia powrotnego", proponowane=proponowane
        ),
        _warunek_parametru(
            parametry,
            "inrush_multiple_in",
            "Krotność prądu załączania transformatora",
            proponowane=proponowane,
        ),
        # Ferrorezonans (część analizy) czyta sposób uziemienia z modelu; bez niego ryzyko
        # nie jest oceniane (solver: „brak_danych"), a napięcie powrotne i prąd załączania
        # liczą się dalej — warunek NIEBLOKUJĄCY.
        _warunek_uziemienia_sn(model, blokujacy=False),
    ]
    z_susceptancja = [b.ref for b in model.branches if b.b_siemens_per_km is not None]
    if not z_susceptancja:
        warunki.append(
            Warunek(
                kod="galezie.bez_susceptancji",
                opis_pl=(
                    "Żadna gałąź nie niesie susceptancji doziemnej — ocena ferrorezonansu bez "
                    "pojemności doczepnej (wynik „brak przesłanek” z braku danych)"
                ),
                spelniony=False,
                blokujacy=False,
            )
        )
    return warunki


def _warunki_silnikow(parametry: dict[str, Any]) -> list[Warunek]:
    silniki = parametry.get("motors")
    silniki = [s for s in silniki if isinstance(s, dict)] if isinstance(silniki, list) else []
    if not silniki:
        return [
            Warunek(
                kod="parametr.motors",
                opis_pl="Brak silników do zbadania — model sieci nie zawiera silników, podaj je jawnie",
                spelniony=False,
                klucz_parametru="motors",
            )
        ]
    niekompletne = []
    for indeks, silnik in enumerate(silniki):
        brak = [
            k
            for k in _KLUCZE_SILNIKA_WYMAGANE
            if (
                not _obecna(silnik.get(k))
                if k in ("ref", "bus_ref")
                else not _liczba(silnik.get(k))
            )
        ]
        if brak:
            # Karta B02-BE-TESTY (2026-09-10, `solver_input_substitute_guard`
            # D:dictor): `ref` brakującego silnika NIE jest podstawiany liczbą
            # pozycji — `indeks + 1` udawałby oznaczenie silnika, którego
            # projektant nie podał. Pozycja listy jest ETYKIETĄ WYŁĄCZNIE gdy
            # `ref` jest naprawdę nieobecny, i mówi to wprost po polsku (bez
            # surowego klucza Pythona — `nazwa_parametru_pl`, jak niżej).
            nazwa_pola_oznaczenia_pl = nazwa_parametru_pl(
                V126AnalysisType.MOTOR_STARTING.value, "motors[].ref"
            )
            etykieta = (
                silnik.get("ref")
                if _obecna(silnik.get("ref"))
                else f"pozycja {indeks + 1} (brak pola „{nazwa_pola_oznaczenia_pl}”)"
            )
            nazwy_brakujacych_pl = [
                nazwa_parametru_pl(V126AnalysisType.MOTOR_STARTING.value, f"motors[].{k}")
                for k in brak
            ]
            niekompletne.append(f"silnik {etykieta}: " + ", ".join(nazwy_brakujacych_pl))
    return [
        Warunek(
            kod="parametr.motors",
            opis_pl=(
                f"Silniki z kompletem danych tabliczkowych: {len(silniki)}"
                if not niekompletne
                else "Dane silników niekompletne — " + "; ".join(niekompletne)
            ),
            spelniony=not niekompletne,
            klucz_parametru="motors",
        )
    ]


def _warunki_niepewnosci(model: V126AcademicInput) -> list[Warunek]:
    liczba = (
        len(model.transformers)
        + len(model.branches)
        + sum(1 for b in model.buses if b.fault_level_mva)
    )
    return [
        Warunek(
            kod="model.parametry_propagacji",
            opis_pl=(
                f"Parametry z tolerancją katalogową do propagacji: {liczba} (transformatory, "
                "gałęzie, szyny z mocą zwarciową)"
                if liczba
                else "Model nie zawiera transformatorów, gałęzi ani szyn z mocą zwarciową — "
                "nie ma czego propagować"
            ),
            spelniony=liczba > 0,
        )
    ]


def _warunki_punktu_neutralnego(
    model: V126AcademicInput, parametry: dict[str, Any]
) -> list[Warunek]:
    # Zakres sieci i napięcie z TEJ SAMEJ prawdy co solver (`uziemienie_sn.sieci[*]` — każda
    # galwanicznie połączona sieć SN osobno, karta UX-04/POLE-ZU-SKLADOWA-ZEROWA, predykaty
    # parami): gałęzie 110 kV i nN nie należą do sieci SN, sekcja za otwartym sprzęgłem jest
    # osobną siecią, a napięciem sieci nie jest najwyższe napięcie szyny modelu (w GPZ 110 kV).
    uziemienie = model.uziemienie_sn
    sieci = uziemienie.sieci if uziemienie is not None else []
    napiecia = [siec.napiecie_kv for siec in sieci]
    napiecie_kv = napiecia[0] if napiecia and all(napiecia) else None
    zamkniete_sieci = [
        [
            b
            for b in model.branches
            if b.kind in {"line_overhead", "cable"}
            and not b.is_open
            and b.ref in frozenset(siec.galezie_sieci)
        ]
        for siec in sieci
    ]
    zamkniete = [b for galezie in zamkniete_sieci for b in galezie]
    z_b0 = [b.ref for b in zamkniete if b.b0_siemens_per_km is not None]
    bez_b0 = tuple(b.ref for b in zamkniete if b.b0_siemens_per_km is None)
    # Baterie kondensatorów w gwieździe uziemionej też niosą pojemność doziemną (karta
    # UX-04/POLE-BKR-MODEL) — ten sam predykat co suma C0 solvera (`wnosi_pojemnosc_doziemna`
    # i bateria w `baterie_sieci` tej sieci), inaczej gotowość odmawiałaby biegu, który
    # solver liczy (albo odwrotnie).
    baterie_sieci = [
        [
            b.ref
            for b in model.shunt_capacitors
            if b.wnosi_pojemnosc_doziemna and b.ref in frozenset(siec.baterie_sieci)
        ]
        for siec in sieci
    ]
    baterie = [ref for refs in baterie_sieci for ref in refs]
    zrodla_c0 = (*z_b0, *baterie)
    # Sieć bez I_C solver melduje jako „dane niekompletne" (tylko ją): bez żadnego źródła
    # pojemności doziemnej ALBO z odcinkiem bez podstawy B′0 (B′1 nieznane — suma bez niego
    # zaniżałaby I_C; ten sam predykat co `_projekt_uziemienia_sieci` i
    # `UziemienieSekcji.prad_pojemnosciowy_a`). B′0 wejścia to wartość modelu albo robocza
    # odcinka SN (`enm.skladowa_zerowa_galezi`), więc predykat jest jeden dla trzech miejsc.
    # Blokuje bieg dopiero brak I_C we WSZYSTKICH sieciach.
    sieci_bez_c0 = tuple(
        siec.szyna_ref
        for siec, galezie, refs in zip(sieci, zamkniete_sieci, baterie_sieci, strict=True)
        if any(b.b0_siemens_per_km is None for b in galezie)
        or (not any(b.b0_siemens_per_km is not None for b in galezie) and not refs)
    )
    warunki = [
        Warunek(
            kod="galezie.b0",
            opis_pl=(
                f"Linie i kable sieci SN z susceptancją zerową (pojemność doziemna): "
                f"{len(z_b0)} z {len(zamkniete)}"
                + (
                    f"; baterie kondensatorów w gwieździe uziemionej: {len(baterie)}"
                    if baterie
                    else ""
                )
                + (
                    " — w żadnej sieci SN pojemność doziemna nie jest kompletna (odcinki bez "
                    "podstawy B′0 wymienione niżej)"
                    if sieci and len(sieci_bez_c0) == len(sieci)
                    else ""
                )
                if zrodla_c0
                else "Żadna linia ani kabel sieci SN nie niesie susceptancji zerowej ani żadna "
                "bateria kondensatorów sieci SN nie jest w gwieździe uziemionej — pojemności "
                "doziemnej sieci nie da się wyznaczyć"
            ),
            spelniony=bool(zrodla_c0) and len(sieci_bez_c0) < len(sieci),
            elementy=zrodla_c0,
        ),
        Warunek(
            kod="model.napiecie_sieci",
            opis_pl=(
                f"Napięcie znamionowe sieci SN znane ({format_liczba(napiecie_kv)} kV)"
                if napiecie_kv
                else "Brak napięcia znamionowego sieci SN"
            ),
            spelniony=bool(napiecie_kv),
        ),
        _warunek_uziemienia_sn(model, projekt_zespolu=True),
    ]
    if sieci_bez_c0 and zrodla_c0:
        warunki.append(
            Warunek(
                kod="galezie.siec_bez_c0",
                opis_pl=(
                    f"Sieci SN bez wyznaczalnej pojemności doziemnej (bez linii, kabli i baterii "
                    f"w gwieździe uziemionej z susceptancją zerową albo z odcinkiem bez podstawy "
                    f"B′0): {len(sieci_bez_c0)} z {len(sieci)} — projekt uziemienia tych sieci "
                    "niewykonany"
                ),
                spelniony=False,
                elementy=sieci_bez_c0,
                blokujacy=False,
            )
        )
    if bez_b0 and zrodla_c0:
        warunki.append(
            Warunek(
                kod="galezie.bez_b0",
                opis_pl=(
                    f"{len(bez_b0)} z {len(zamkniete)} linii/kabli bez susceptancji zerowej "
                    "i bez podstawy wartości roboczej (susceptancja zgodna nieznana) — "
                    "prąd pojemnościowy ich sieci nie jest liczony (suma bez nich byłaby "
                    "zaniżona)"
                ),
                spelniony=False,
                elementy=bez_b0,
                blokujacy=False,
            )
        )
    wariant = uziemienie.wariant if uziemienie is not None else None
    if PROJEKT_UZIEMIENIA_WARIANTU.get(wariant or "") == "resistor_grounded":
        # Rezystor (R, I_n, t_n) jest daną MODELU (zespół uziemiający) — parametrem biegu
        # zostaje wyłącznie czas wyłączenia zwarcia doziemnego (dana zabezpieczeń).
        klucz = "ner_clearing_time_s"
        warunki.append(
            Warunek(
                kod=f"parametr.{klucz}",
                opis_pl=(
                    "Czas wyłączenia zwarcia doziemnego — bez niego sprawdzenie cieplne "
                    "rezystora nie jest wykonywane"
                ),
                spelniony=_liczba(parametry.get(klucz)),
                klucz_parametru=klucz,
                blokujacy=False,
            )
        )
    return warunki


def _dane_z_modelu(
    model: V126AcademicInput, rodzaj: V126AnalysisType, enm: EnergyNetworkModel
) -> tuple[DanaZModeluWartosc, ...]:
    czestotliwosc = czestotliwosc_modelu(enm)
    wartosc_czestotliwosci = (
        f"{format_liczba(czestotliwosc)} Hz"
        if czestotliwosc is not None
        else (
            f"brak w modelu — solver przyjmie {format_liczba(model.base_frequency_hz)} Hz "
            "jako wartość domyślną"
        )
    )
    dane: list[DanaZModeluWartosc] = [
        DanaZModeluWartosc(
            "Szyny (napięcia znamionowe)", f"{len(model.buses)}", tuple(b.ref for b in model.buses)
        ),
        DanaZModeluWartosc(
            "Gałęzie (impedancje, długości)",
            f"{len(model.branches)}",
            tuple(b.ref for b in model.branches),
        ),
        DanaZModeluWartosc(
            "Transformatory ($S_n$, $u_k$)",
            f"{len(model.transformers)}",
            tuple(t.ref for t in model.transformers),
        ),
        # Karta B02-BE-TESTY: WARTOŚĆ Z MODELU (`czestotliwosc_modelu`), NIE
        # `model.base_frequency_hz` — to pole niesie już podstawienie mostu
        # (50 Hz jako założenie metody, gdy model milczy); pokazanie go wprost
        # jako „dana z modelu" fabrykowałoby pomiar, którego nie było (patrz
        # docstring `czestotliwosc_modelu`).
        DanaZModeluWartosc("Częstotliwość sieci", wartosc_czestotliwosci),
    ]
    if rodzaj in (V126AnalysisType.POWER_QUALITY_HARMONICS, V126AnalysisType.SSCI_IMPEDANCE):
        dane.append(
            DanaZModeluWartosc(
                "Przekształtniki z kartą katalogową",
                f"{len(model.converters)}",
                tuple(c.ref for c in model.converters),
            )
        )
    if rodzaj == V126AnalysisType.POWER_QUALITY_HARMONICS:
        dane.append(
            DanaZModeluWartosc(
                "Źródła harmoniczne z widmem",
                f"{len(model.harmonic_sources)}",
                tuple(z.source_ref for z in model.harmonic_sources),
            )
        )
    if model.uziemienie_sn is not None and model.uziemienie_sn.przyczyna_braku_pl is None:
        dane.append(
            DanaZModeluWartosc(
                "Uziemienie punktu neutralnego sieci SN", model.uziemienie_sn.opis_pl
            )
        )
    if rodzaj == V126AnalysisType.NEUTRAL_EARTHING_DESIGN and model.uziemienie_sn is not None:
        for siec in model.uziemienie_sn.sieci:
            if siec.napiecie_kv:
                dane.append(
                    DanaZModeluWartosc(
                        f"{siec.nazwa_pl} (napięcie znamionowe, linie i kable)",
                        f"{format_liczba(siec.napiecie_kv)} kV, {len(siec.galezie_sieci)}",
                        tuple(siec.galezie_sieci),
                    )
                )
            for rezystor in siec.rezystory:
                dane.append(
                    DanaZModeluWartosc(
                        f"Rezystor punktu neutralnego ({rezystor.nazwa_pl})",
                        f"$R$ = {format_liczba(rezystor.r_ohm)} Ω, $I_n$ = {format_liczba(rezystor.i_n_a)} A, "
                        f"$t_n$ = {format_liczba(rezystor.t_n_s)} s",
                        (rezystor.ref,),
                    )
                )
    if rodzaj == V126AnalysisType.INSULATION_COORDINATION:
        dane.append(
            DanaZModeluWartosc(
                "Miejsca zainstalowania ograniczników",
                f"{len(model.insulation)}",
                tuple(i.location_bus_ref for i in model.insulation),
            )
        )
    if rodzaj == V126AnalysisType.EARTHING_SAFETY and model.prad_uziomowy is not None:
        for przypadek in model.prad_uziomowy.przypadki:
            wielkosc = wielkosc_pradu_uziomowego(przypadek)
            dane.append(
                DanaZModeluWartosc(
                    f"Prąd zwarcia doziemnego stacji — {przypadek.nazwa_pl}",
                    (
                        f"${wielkosc.symbol_latex}$ = {format_liczba(round(wielkosc.prad_a, 1))} A"
                        if wielkosc.prad_a is not None
                        else f"nieoznaczalny: {wielkosc.brak_pl}"
                    ),
                    (przypadek.bus_ref,),
                )
            )
    if rodzaj in ANALIZY_IMPEDANCJI_ZASTEPCZEJ:
        # Przepustowość i rozruch silnika czytają impedancję zastępczą sieci w szynie
        # (przekątna macierzy Z-bus IEC 60909), nie moc zwarciową źródła szyny.
        szyny_z = tuple(b.ref for b in model.buses if b.thevenin_x_ohm is not None)
        dane.append(
            DanaZModeluWartosc(
                "Szyny z impedancją zastępczą sieci (macierz Z-bus IEC 60909)",
                f"{len(szyny_z)}",
                szyny_z,
            )
        )
        return tuple(dane)
    szyny_sk = tuple(b.ref for b in model.buses if b.fault_level_mva)
    # Tor harmoniczny NIE czyta mocy zwarciowej (sieć nadrzędna = admitancja 1e6 S na
    # pierwszej szynie — audyt harmonicznych 2026-09-23); pokazanie jej jako danej tej
    # analizy było tym samym fałszywym twierdzeniem, co w karcie katalogu.
    if szyny_sk and rodzaj != V126AnalysisType.POWER_QUALITY_HARMONICS:
        dane.append(
            DanaZModeluWartosc("Szyny z mocą zwarciową źródła", f"{len(szyny_sk)}", szyny_sk)
        )
    return tuple(dane)


# --- Wejście główne ----------------------------------------------------------


def ocen_gotowosc_v126(
    enm: EnergyNetworkModel,
    rodzaj: V126AnalysisType,
    parametry: dict[str, Any] | None = None,
) -> GotowoscAnalizy:
    """Gotowość analizy `rodzaj` na modelu `enm` z parametrami projektanta.

    Buduje wejście solvera TĄ SAMĄ funkcją, której używa uruchomienie, i sprawdza
    obecność danych każdego rodzaju. Wynik zasila ekran i odmowę 422 (predykaty
    parami). Rodzaj wycofany z powierzchni dostaje `WYCOFANA` bez sprawdzeń.
    """
    karta = karta_analizy(rodzaj.value)
    if (
        not karta.prezentowany
        and karta.powod_wycofania_pl
        and rodzaj
        in (
            V126AnalysisType.HOSTING_CAPACITY,
            V126AnalysisType.OPF_LOSS_LCC,
        )
    ):
        return GotowoscAnalizy(
            kod=rodzaj.value,
            gotowosc=GOTOWOSC_WYCOFANA,
            powod_wycofania_pl=karta.powod_wycofania_pl,
        )
    parametry = dict(parametry or {})
    warunki = _warunki_wspolne(enm)
    if not enm.buses:
        return GotowoscAnalizy(
            kod=rodzaj.value, gotowosc=GOTOWOSC_NIEPOTWIERDZONA, warunki=tuple(warunki)
        )
    try:
        model = doloz_prad_uziomowy(
            build_v126_input_from_enm(enm, parameters=parametry, analysis_type=rodzaj),
            enm,
            rodzaj,
            parametry,
        )
    except OdmowaDanychError as exc:
        # Odmowa danych budowy wejścia (np. rdzeń IEC 60909 impedancji zastępczej szyn
        # odmawia transformatora bez danych) jest warunkiem blokującym TEJ analizy z treścią
        # odmowy — lista gotowości pozostałych rodzajów nie pada razem z nią.
        warunki.append(Warunek(kod="model.odmowa_danych", opis_pl=str(exc), spelniony=False))
        return GotowoscAnalizy(
            kod=rodzaj.value, gotowosc=GOTOWOSC_NIEPOTWIERDZONA, warunki=tuple(warunki)
        )
    proponowane = _propozycje_z_modelu(enm, rodzaj)

    if rodzaj == V126AnalysisType.POWER_QUALITY_HARMONICS:
        warunki += _warunki_harmoniczne(enm, model, parametry)
    elif rodzaj == V126AnalysisType.SSCI_IMPEDANCE:
        warunki += _warunki_ssci(enm, model, parametry)
    elif rodzaj == V126AnalysisType.RELIABILITY_CONTINGENCY:
        warunki += _warunki_niezawodnosci(enm, model, parametry)
    elif rodzaj == V126AnalysisType.EARTHING_SAFETY:
        warunki += _warunki_uziomu(model, parametry)
    elif rodzaj == V126AnalysisType.INSULATION_COORDINATION:
        warunki += _warunki_izolacji(enm, model)
    elif rodzaj == V126AnalysisType.EARTH_FAULT_DETECTION:
        warunki += _warunki_detekcji(model, parametry)
    elif rodzaj == V126AnalysisType.TRANSIENT_TRV:
        warunki += _warunki_trv(model, parametry, proponowane)
    elif rodzaj == V126AnalysisType.MOTOR_STARTING:
        warunki += _warunki_silnikow(parametry)
    elif rodzaj == V126AnalysisType.UNCERTAINTY_SENSITIVITY:
        warunki += _warunki_niepewnosci(model)
    elif rodzaj == V126AnalysisType.NEUTRAL_EARTHING_DESIGN:
        warunki += _warunki_punktu_neutralnego(model, parametry)
    # voltage_stability / benchmark_validation (nieprezentowane, ale uruchamialne dla
    # odtwarzalności) — wyłącznie warunek wspólny.

    blokujace_braki = any(w.blokujacy and not w.spelniony for w in warunki)
    return GotowoscAnalizy(
        kod=rodzaj.value,
        gotowosc=GOTOWOSC_NIEPOTWIERDZONA if blokujace_braki else GOTOWOSC_POTWIERDZONA,
        warunki=tuple(warunki),
        dane_z_modelu=_dane_z_modelu(model, rodzaj, enm),
        proponowane=proponowane,
    )


def gotowosc_wszystkich(
    enm: EnergyNetworkModel, parametry: dict[str, Any] | None = None
) -> list[GotowoscAnalizy]:
    """Gotowość każdego rodzaju kontraktu (kolejność katalogu = kolejność enum)."""
    return [ocen_gotowosc_v126(enm, rodzaj, parametry) for rodzaj in V126AnalysisType]


def odpowiedz_gotowosci(
    case_id: str,
    enm: EnergyNetworkModel,
    analysis_type: V126AnalysisType | None,
    parametry: dict[str, Any],
) -> dict[str, Any]:
    """Kształt odpowiedzi `GET /api/cases/{case_id}/v126/gotowosc` — JEDNO źródło
    prawdy dla końcówki (`api/v126_academic.py::get_v126_gotowosc`) i dla eksportu
    fixtur harnessu (`scripts/eksport_fixtur_harnessu.py`, scena `akademickie`) —
    predykaty parami (reguła KLASA §3): dwa konsumenci wołający TĘ SAMĄ funkcję
    nigdy nie mogą się rozjechać co do kształtu.

    ``analysis_type=None`` → `gotowosc_wszystkich` (komplet 14 rodzajów kontraktu);
    podany → jedna pozycja, oceniona parametrami PO scaleniu z modelem
    (`uzupelnij_parametry_z_modelu`) — TĄ SAMĄ funkcją i TYM SAMYM wywołaniem
    `ocen_gotowosc_v126`, którym POST (`run_v126_analysis`) odmawia 422-ką, więc
    GET i POST oceniają zawsze te same parametry dla jednego wskazanego rodzaju.

    Dla listy kompletnej (`analysis_type=None`) scalanie per rodzaj NIE jest
    wykonywane jawnie w tej funkcji — `ocen_gotowosc_v126` samo uznaje wartość
    WYPROWADZALNĄ z modelu za obecną (sprawdza `proponowane` z tego samego
    źródła `_propozycje_z_modelu`, którym `uzupelnij_parametry_z_modelu` by
    scalał), więc oba warianty dają IDENTYCZNY wynik — pinuje to
    `tests/application/analyses/test_v126_gotowosc.py::
    test_lista_wszystkich_rodzajow_jest_zgodna_z_wynikiem_scalania_per_rodzaj`.
    """
    if analysis_type is None:
        analizy = gotowosc_wszystkich(enm, parametry)
    else:
        analizy = [
            ocen_gotowosc_v126(
                enm, analysis_type, uzupelnij_parametry_z_modelu(enm, analysis_type, parametry)
            )
        ]
    return {
        "case_id": case_id,
        "model_hash": compute_enm_hash(enm) if enm.buses else None,
        "przedmiot": przedmiot_modelu(enm),
        "analizy": [gotowosc.to_dict() for gotowosc in analizy],
    }
