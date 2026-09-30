"""Opis scenariusza dynamicznego i nastaw solvera dla edytora w interfejsie (karta AB-P1 §0.6).

PO CO. Edytor harmonogramu zdarzeń NIE może mieć własnej listy rodzajów zdarzeń i pól:
rodzaje dokłada równolegle kontrakt danych (`enm.scenariusze.ZdarzenieDynamiczne`) i adapter
biegu, a lista w interfejsie rozjechałaby się z nimi przy pierwszej zmianie. Ten moduł
buduje opis WPROST z kontraktów:

* rodzaje zdarzeń — z unii dyskryminowanej `ZdarzenieDynamiczne` (klasy wariantów),
  pola i ich ograniczenia — z `model_fields` każdej klasy (typ, wymagalność, `ge/le/gt/lt`,
  dopuszczalne wartości `Literal`);
* role referencji (która kolekcja modelu może być wskazana polem) — z predykatu
  `enm.scenariusze._refy_zdarzenia`, tego samego, którym waliduje się scenariusz;
* czy rdzeń WYKONUJE rodzaj zdarzenia — próbą przełożenia zdarzenia wzorcowego adapterem
  biegu (`enm.adapter_dynamiki.harmonogram_z_scenariusza`): rodzaj, który adapter odrzuca
  kodem `dynamika.rodzaj_zdarzenia_nieobslugiwany`, jest w kontrakcie danych, ale nie
  w rdzeniu; każdy inny wynik próby (przekład albo odmowa DANYCH wzorca) znaczy, że rodzaj
  jest rozpoznany i wykonywany;
* detektory przekroczeń — lista obiektów `enm.scenariusze.Detektor`; wielkość detektora to
  unia dyskryminowana (warianty i ich pola z kontraktu), role referencji wariantów z predykatu
  `enm.scenariusze._ref_detektora` (ten sam, którym waliduje się scenariusz);
* nastawy numeryczne — z `enm.adapter_dynamiki.POLA_NASTAW` i adnotacji `NastawySolvera`
  (lista integratorów z `NazwaIntegratora`); które nastawy wolno podać jako BRAK wartości
  (`null`), rozstrzyga predykat adaptera `POLA_NASTAW_Z_WARTOSCIA_NULL` — ten sam, którym
  adapter odmawia biegu. Zero wartości domyślnych: kontrakt solvera ich nie ma, więc opis
  ich nie ma.

Tryb STANOWISKA badawczego (`ScenariuszDynamiczny.stanowisko`: źródło testowe o profilu
U/f/faza zamiast źródła sieciowego) NIE jest opisywany: ekran dynamiki czasowej projektanta
pracuje w trybie SIECI (zakłócenia fizyczne sieci, karta AB-P1 §0.2), a stanowisko badawcze
to bodziec badania zgodności modułu, którego wynik nie jest przebiegiem sieci projektu.
Zapis scenariusza tego ekranu odrzuca stanowisko tym samym predykatem (`tryb_sieci`), a lista
scenariuszy ekranu go nie pokazuje — scenariusz nie traci pola po cichu przy ponownym zapisie.

Etykiety po polsku są jedyną treścią własną modułu (słownik nazw pól i rodzajów). Pole albo
rodzaj spoza słownika dostaje etykietę z nazwy technicznej — nowy rodzaj zdarzenia pojawia
się w edytorze bez zmiany kodu interfejsu, a brak ładnej etykiety widać w teście słownika.
"""

from __future__ import annotations

import types
from typing import Any, Literal, Union, cast, get_args, get_origin

from annotated_types import Ge, Gt, Le, Lt
from enm.adapter_dynamiki import (
    KOD_ZDARZENIE_NIEOBSLUGIWANE,
    POLA_NASTAW,
    POLA_NASTAW_Z_WARTOSCIA_NULL,
    OdmowaWejsciaDynamiki,
    harmonogram_z_scenariusza,
)
from enm.scenariusze import (
    Detektor,
    ScenariuszDynamiczny,
    WielkoscDetektora,
    ZdarzenieDynamiczne,
    _ref_detektora,
    _refy_zdarzenia,
)
from network_model.solvers.dynamika.kontrakty import (
    NastawySolvera,
    NazwaIntegratora,
    OdmowaDynamiki,
)
from network_model.solvers.dynamika.zdarzenia import TYP_ZWARCIA_TROJFAZOWEGO
from pydantic import BaseModel
from pydantic.fields import FieldInfo

KONTRAKT_OPISU = "opis_scenariusza_dynamicznego_v1"

#: Etykiety rodzajów zdarzeń (klucz = wartość dyskryminatora `rodzaj`).
ETYKIETY_RODZAJOW: dict[str, str] = {
    "zwarcie": "Zwarcie",
    "wylaczenie_galezi": "Otwarcie gałęzi lub łącznika",
    "zalaczenie_galezi": "Zamknięcie gałęzi lub łącznika",
    "odlaczenie_zrodla": "Odłączenie źródła",
    "skok_obciazenia": "Skokowa zmiana mocy odbioru",
    "odlaczenie_odbioru": "Odłączenie odbioru",
    "zalaczenie_odbioru": "Ponowne załączenie odbioru",
    "komenda_regulacji": "Zmiana nastawy regulatora źródła",
    "utrata_czesciowa_zrodla": "Częściowa utrata jednostek źródła",
    "synchronizacja": "Synchronizacja źródła z siecią",
}

#: Etykiety wariantów wielkości detektora (klucz = wartość dyskryminatora `rodzaj`); jednostka
#: progu w nawiasie — próg jest w jednostce kanału, który detektor czyta (kontrakt `Detektor`).
ETYKIETY_WIELKOSCI_DETEKTORA: dict[str, str] = {
    "modul_napiecia": "Moduł napięcia szyny [pu]",
    "czestotliwosc": "Częstotliwość szyny [Hz]",
    "modul_pradu_zacisku": "Moduł prądu zacisku gałęzi [pu bazy układu]",
    "stan_urzadzenia": "Zmienna stanu urządzenia [jednostka stanu]",
    "moc_urzadzenia": "Moc oddawana przez urządzenie [pu bazy układu]",
}

#: Etykiety pól zdarzeń i scenariusza (klucz = nazwa pola kontraktu).
ETYKIETY_POL: dict[str, str] = {
    "t_s": "Chwila zdarzenia",
    "bus_ref": "Szyna",
    "element_ref": "Element",
    "polozenie_wzgledne": "Położenie miejsca zwarcia x (ułamek długości od zacisku początkowego)",
    "typ": "Rodzaj zwarcia",
    "r_f_ohm": "Rezystancja przejścia R_f",
    "x_f_ohm": "Reaktancja przejścia X_f",
    "t_usuniecia_s": "Chwila usunięcia zwarcia",
    "sposob_usuniecia": "Sposób usunięcia zwarcia",
    "ref_id": "Element",
    "delta_p_mw": "Zmiana mocy czynnej ΔP",
    "delta_q_mvar": "Zmiana mocy biernej ΔQ",
    "nastawa": "Nowa nastawa",
    "p_mw": "Moc czynna P",
    "q_mvar": "Moc bierna Q",
    "u_pu": "Napięcie odniesienia U",
    "udzial_pozostaly": "Udział jednostek pracujących dalej (względem stanu początkowego)",
    "detektory": "Detektory przekroczeń progu (bez działania na sieć)",
    "ident": "Nazwa detektora",
    "wielkosc": "Obserwowana wielkość",
    "prog": "Próg (w jednostce obserwowanej wielkości)",
    "kierunek": "Kierunek przekroczenia",
    "jednorazowy": "Tylko pierwsze przekroczenie",
    "zacisk": "Zacisk gałęzi",
    "stan": "Nazwa zmiennej stanu urządzenia",
    "skladowa": "Składowa mocy",
    "horyzont_s": "Horyzont symulacji",
    "krok_wyjscia_s": "Krok zapisu przebiegu",
    "dt_s": "Krok całkowania",
    "dt_min_s": "Najmniejszy krok całkowania",
    "dt_max_s": "Największy krok całkowania",
    "tolerancja": "Tolerancja residuum równań",
    "tolerancja_kroku": "Tolerancja błędu lokalnego kroku",
    "eps_init": "Tolerancja stanu początkowego",
    "max_iteracji_newtona": "Największa liczba iteracji Newtona w kroku",
    "max_nawrotow": "Największa liczba nawrotów kroku",
    "integrator": "Metoda całkowania",
    "tolerancja_lokalizacji_zdarzen_s": (
        "Tolerancja lokalizacji chwili przekroczenia (wymagana, gdy są detektory)"
    ),
}

#: Etykiety wartości wyliczeniowych (klucz = (pole, wartość)).
ETYKIETY_WARTOSCI: dict[tuple[str, str], str] = {
    ("typ", "3F"): "trójfazowe (3F)",
    ("typ", "2F"): "dwufazowe (2F)",
    ("typ", "1F"): "jednofazowe doziemne (1F)",
    ("typ", "2FZ"): "dwufazowe doziemne (2FZ)",
    ("sposob_usuniecia", "izolacja"): "izolacja miejsca zwarcia aparatami",
    ("sposob_usuniecia", "samoczynne"): "samoczynne zgaśnięcie (idealizacja)",
    ("integrator", "trapez_niejawny"): "trapezów, niejawna",
    ("integrator", "rk4_jawny"): "Rungego-Kutty 4. rzędu, jawna",
    ("kierunek", "w_dol"): "spadek poniżej progu",
    ("kierunek", "w_gore"): "wzrost powyżej progu",
    ("zacisk", "od"): "zacisk początkowy (od)",
    ("zacisk", "do"): "zacisk końcowy (do)",
    ("skladowa", "p"): "moc czynna P",
    ("skladowa", "q"): "moc bierna Q",
}

#: Pola `ScenariuszDynamiczny` trybu STANOWISKA badawczego — poza opisem edytora ekranu
#: pracującego w trybie sieci (uzasadnienie w docstringu modułu). Predykat `tryb_sieci`
#: czyta TĘ SAMĄ krotkę (zapis i lista scenariuszy ekranu).
POLA_TRYBU_STANOWISKA: tuple[str, ...] = ("stanowisko",)

#: Etykiety kolekcji modelu wskazywanych referencją zdarzenia.
ETYKIETY_KOLEKCJI: dict[str, str] = {
    "buses": "szyny",
    "branches": "linie, kable i łączniki",
    "transformers": "transformatory",
    "shunt_capacitors": "baterie kondensatorów",
    "generators": "wytwórcy",
    "sources": "źródła sieciowe",
    "loads": "odbiory",
}

#: Wartości pól wyliczeniowych, których RDZEŃ nie wykonuje, choć kontrakt danych je
#: przyjmuje — z powodem ze stałej rdzenia (zwarcia niesymetryczne wymagają składowych
#: symetrycznych, rdzeń liczy wyłącznie zwarcie `TYP_ZWARCIA_TROJFAZOWEGO`).
_WARTOSCI_POZA_RDZENIEM: dict[tuple[str, str], str] = {
    ("zwarcie", "typ"): TYP_ZWARCIA_TROJFAZOWEGO,
}


def _jednostka(nazwa: str) -> str | None:
    """Jednostka pola z sufiksu nazwy kontraktu (ta sama konwencja co nazwy stanów rdzenia)."""
    for sufiks, jednostka in (
        ("_ohm", "Ω"),
        ("_mvar", "Mvar"),
        ("_mw", "MW"),
        ("_pu", "pu"),
        ("_s", "s"),
    ):
        if nazwa.endswith(sufiks):
            return jednostka
    return None


def _etykieta_pola(nazwa: str, pole: FieldInfo | None = None) -> str:
    if nazwa in ETYKIETY_POL:
        return ETYKIETY_POL[nazwa]
    if pole is not None and pole.description:
        return pole.description
    return nazwa.replace("_", " ")


def _bez_none(adnotacja: Any) -> tuple[Any, bool]:
    """(adnotacja bez `None`, czy `None` dopuszczalne)."""
    if get_origin(adnotacja) in (Union, types.UnionType):
        czlony = [c for c in get_args(adnotacja) if c is not type(None)]
        dopuszcza_none = len(czlony) != len(get_args(adnotacja))
        if len(czlony) == 1:
            return czlony[0], dopuszcza_none
        return adnotacja, dopuszcza_none
    return adnotacja, False


def _granice(pole: FieldInfo) -> dict[str, float]:
    granice: dict[str, float] = {}
    for meta in pole.metadata:
        if isinstance(meta, Ge):
            granice["minimum"] = float(meta.ge)  # type: ignore[arg-type]
        elif isinstance(meta, Gt):
            granice["minimum_wylaczne"] = float(meta.gt)  # type: ignore[arg-type]
        elif isinstance(meta, Le):
            granice["maksimum"] = float(meta.le)  # type: ignore[arg-type]
        elif isinstance(meta, Lt):
            granice["maksimum_wylaczne"] = float(meta.lt)  # type: ignore[arg-type]
    return granice


def _klasa_modelu(adnotacja: Any) -> type[BaseModel] | None:
    return adnotacja if isinstance(adnotacja, type) and issubclass(adnotacja, BaseModel) else None


def _warianty_unii(adnotacja: Any) -> tuple[type[BaseModel], ...] | None:
    """Klasy unii dyskryminowanej po `rodzaj` (każdy człon to model z polem `rodzaj`)."""
    if get_origin(adnotacja) not in (Union, types.UnionType):
        return None
    czlony = tuple(get_args(adnotacja))
    if all(_klasa_modelu(c) is not None and "rodzaj" in c.model_fields for c in czlony):
        return czlony
    return None


def _element_listy(adnotacja: Any) -> type[BaseModel] | None:
    """Klasa elementu listy `tuple[Model, ...]` (lista obiektów kontraktu)."""
    argumenty = get_args(adnotacja)
    if get_origin(adnotacja) is tuple and len(argumenty) == 2 and argumenty[1] is Ellipsis:
        return _klasa_modelu(argumenty[0])
    return None


def _role_wielkosci_detektora(klasa: type[BaseModel]) -> dict[str, tuple[str, ...]]:
    """Kolekcje dopuszczone dla referencji wariantu wielkości detektora — z predykatu
    walidacji scenariusza `_ref_detektora` (pole referencji rozpoznane po znaczniku)."""
    referencje = _pola_referencji(klasa)
    wzorzec = _wzorzec(klasa, {pole: f"__{pole}__" for pole in referencje})
    detektor = Detektor.model_construct(
        ident="__ident__",
        wielkosc=cast("WielkoscDetektora", wzorzec),
        prog=0.0,
        kierunek="w_dol",
        jednorazowy=False,
    )
    ref, kolekcje = _ref_detektora(detektor)
    role = {pole: kolekcje for pole in referencje if ref == f"__{pole}__"}
    _bez_brakow_rol(klasa, referencje, role)
    return role


#: Unie dyskryminowane opisywane w polach kontraktu -> (etykiety wariantów, role referencji
#: wariantu). Każda unia z rolami referencji MUSI tu być: unia spoza słownika dostaje
#: etykiety z nazw technicznych i referencje bez ról (test słownika pokazuje brak).
_UNIE_POL: dict[str, tuple[dict[str, str], Any]] = {
    "wielkosc": (ETYKIETY_WIELKOSCI_DETEKTORA, _role_wielkosci_detektora),
}


def _opis_wariantu(nazwa_unii: str, klasa: type[BaseModel]) -> dict[str, Any]:
    etykiety, role_wariantu = _UNIE_POL.get(nazwa_unii, ({}, None))
    rodzaj = _rodzaj(klasa)
    role = role_wariantu(klasa) if role_wariantu is not None else {}
    return {
        "rodzaj": rodzaj,
        "etykieta_pl": etykiety.get(rodzaj, rodzaj.replace("_", " ")),
        "pola": [
            _opis_pola(rodzaj, podnazwa, podpole, role)
            for podnazwa, podpole in klasa.model_fields.items()
            if podnazwa != "rodzaj"
        ],
    }


def _opis_pola(
    rodzaj: str | None, nazwa: str, pole: FieldInfo, role: dict[str, tuple[str, ...]]
) -> dict[str, Any]:
    adnotacja, dopuszcza_none = _bez_none(pole.annotation)
    opis: dict[str, Any] = {
        "nazwa": nazwa,
        "etykieta_pl": _etykieta_pola(nazwa, pole),
        "jednostka": _jednostka(nazwa),
        "wymagane": pole.is_required(),
        "dopuszcza_brak": dopuszcza_none,
    }
    warianty = _warianty_unii(adnotacja)
    element_listy = _element_listy(adnotacja)
    if warianty is not None:
        opis["typ"] = "unia"
        opis["warianty"] = [_opis_wariantu(nazwa, klasa) for klasa in warianty]
    elif element_listy is not None:
        opis["typ"] = "lista"
        opis["pola"] = [
            _opis_pola(None, podnazwa, podpole, {})
            for podnazwa, podpole in element_listy.model_fields.items()
        ]
    elif adnotacja is bool:
        opis["typ"] = "logiczna"
    elif get_origin(adnotacja) is Literal:
        obslugiwana = _WARTOSCI_POZA_RDZENIEM.get((rodzaj or "", nazwa))
        opis["typ"] = "wybor"
        opis["wartosci"] = [
            {
                "wartosc": str(wartosc),
                "etykieta_pl": ETYKIETY_WARTOSCI.get((nazwa, str(wartosc)), str(wartosc)),
                "wykonywana_przez_rdzen": obslugiwana is None or str(wartosc) == obslugiwana,
            }
            for wartosc in get_args(adnotacja)
        ]
    elif nazwa in role:
        opis["typ"] = "referencja"
        opis["kolekcje"] = [
            {"kolekcja": kolekcja, "etykieta_pl": ETYKIETY_KOLEKCJI.get(kolekcja, kolekcja)}
            for kolekcja in role[nazwa]
        ]
    elif isinstance(adnotacja, type) and issubclass(adnotacja, BaseModel):
        opis["typ"] = "obiekt"
        opis["pola"] = [
            _opis_pola(None, podnazwa, podpole, {})
            for podnazwa, podpole in adnotacja.model_fields.items()
        ]
    elif adnotacja is int:
        opis["typ"] = "calkowita"
        opis.update(_granice(pole))
    elif adnotacja is float:
        opis["typ"] = "liczba"
        opis.update(_granice(pole))
    else:
        opis["typ"] = "tekst"
    return opis


def _klasy_zdarzen() -> tuple[type[BaseModel], ...]:
    unia = get_args(ZdarzenieDynamiczne)[0]
    return tuple(get_args(unia))


def _wzorzec(klasa: type[BaseModel], ustawione: dict[str, Any]) -> BaseModel:
    """Instancja wzorcowa BEZ walidacji (tylko do zapytania predykatów o role i wykonanie)."""
    return klasa.model_construct(**ustawione)


def _pola_referencji(klasa: type[BaseModel]) -> tuple[str, ...]:
    return tuple(
        nazwa
        for nazwa, pole in klasa.model_fields.items()
        if _bez_none(pole.annotation)[0] is str and (nazwa.endswith("_ref") or nazwa == "ref_id")
    )


def _role_referencji(klasa: type[BaseModel]) -> dict[str, tuple[str, ...]]:
    """Kolekcje dopuszczone dla każdego pola referencji — z predykatu walidacji scenariusza.

    Pole pytane OSOBNO (pozostałe referencje puste), bo predykat rozstrzyga wariant miejsca
    zdarzenia po tym, które pole jest podane (zwarcie w węźle albo w gałęzi x·L).
    """
    role: dict[str, tuple[str, ...]] = {}
    referencje = _pola_referencji(klasa)
    for pole in referencje:
        # Pozostałe referencje: wymagane dostają znacznik (predykat ich potrzebuje),
        # opcjonalne — brak (to one rozstrzygają wariant miejsca zdarzenia).
        ustawione: dict[str, Any] = {
            inne: (f"__{inne}__" if klasa.model_fields[inne].is_required() else None)
            for inne in referencje
        }
        ustawione[pole] = f"__{pole}__"
        if "polozenie_wzgledne" in klasa.model_fields:
            ustawione["polozenie_wzgledne"] = 0.5 if pole == "element_ref" else None
        wpisy = _refy_zdarzenia(_wzorzec(klasa, ustawione))  # type: ignore[arg-type]
        for atrybut, _, kolekcje in wpisy:
            if atrybut == pole:
                role[pole] = kolekcje
    _bez_brakow_rol(klasa, referencje, role)
    return role


def _bez_brakow_rol(
    klasa: type[BaseModel], referencje: tuple[str, ...], role: dict[str, tuple[str, ...]]
) -> None:
    """Pole referencji bez roli z predykatu walidacji trafiłoby do edytora jako tekst — to
    rozjazd opisu z kontraktem, więc opis odmawia budowy zamiast pokazać zły formant."""
    bez_roli = [pole for pole in referencje if pole not in role]
    if bez_roli:
        raise RuntimeError(
            f"Opis scenariusza: pola referencji {bez_roli} klasy {klasa.__name__} bez roli "
            "w predykacie walidacji scenariusza."
        )


def _wartosc_wzorcowa(nazwa: str, pole: FieldInfo) -> Any:
    adnotacja, _ = _bez_none(pole.annotation)
    if get_origin(adnotacja) is Literal:
        return get_args(adnotacja)[0]
    if isinstance(adnotacja, type) and issubclass(adnotacja, BaseModel):
        return adnotacja.model_construct(
            **{
                podnazwa: _wartosc_wzorcowa(podnazwa, podpole)
                for podnazwa, podpole in adnotacja.model_fields.items()
            }
        )
    if adnotacja in (int, float):
        granice = _granice(pole)
        if "minimum_wylaczne" in granice and "maksimum_wylaczne" in granice:
            return (granice["minimum_wylaczne"] + granice["maksimum_wylaczne"]) / 2.0
        return max(granice.get("minimum", 0.0), 0.0)
    return f"__{nazwa}__"


def _wykonywany_przez_rdzen(klasa: type[BaseModel]) -> bool:
    """Czy adapter biegu przekłada rodzaj na zdarzenie rdzenia (patrz docstring modułu)."""
    ustawione = {
        nazwa: _wartosc_wzorcowa(nazwa, pole)
        for nazwa, pole in klasa.model_fields.items()
        if nazwa != "rodzaj" and (pole.is_required() or nazwa in _pola_referencji(klasa))
    }
    wzorzec = _wzorzec(klasa, ustawione)
    scenariusz = ScenariuszDynamiczny.model_construct(
        horyzont_s=600.0,
        krok_wyjscia_s=1.0,
        zdarzenia=(cast("ZdarzenieDynamiczne", wzorzec),),
    )
    try:
        harmonogram_z_scenariusza(
            scenariusz,
            identy_odbiorow=frozenset({str(ustawione.get("ref_id", ""))}),
            identy_odsprzegow=frozenset(),
            base_mva=100.0,
            f_bazowa_hz=50.0,
        )
    except OdmowaWejsciaDynamiki as odmowa:
        return odmowa.kod != KOD_ZDARZENIE_NIEOBSLUGIWANE
    except OdmowaDynamiki:
        # Odmowa DANYCH wzorca w rdzeniu (rodzaj rozpoznany i przełożony na zdarzenie rdzenia).
        return True
    return True


def _rodzaj(klasa: type[BaseModel]) -> str:
    return str(klasa.model_fields["rodzaj"].default)


def opis_rodzajow_zdarzen() -> list[dict[str, Any]]:
    """Rodzaje zdarzeń kontraktu scenariusza w kolejności unii (kolejność kontraktu)."""
    wynik: list[dict[str, Any]] = []
    for klasa in _klasy_zdarzen():
        rodzaj = _rodzaj(klasa)
        role = _role_referencji(klasa)
        wynik.append(
            {
                "rodzaj": rodzaj,
                "etykieta_pl": ETYKIETY_RODZAJOW.get(rodzaj, rodzaj.replace("_", " ")),
                "wykonywany_przez_rdzen": _wykonywany_przez_rdzen(klasa),
                "pola": [
                    _opis_pola(rodzaj, nazwa, pole, role)
                    for nazwa, pole in klasa.model_fields.items()
                    if nazwa != "rodzaj"
                ],
            }
        )
    return wynik


def opis_pol_scenariusza() -> list[dict[str, Any]]:
    """Pola scenariusza poza harmonogramem zdarzeń (horyzont, krok zapisu, detektory) z
    `ScenariuszDynamiczny` — bez pól trybu stanowiska badawczego (`POLA_TRYBU_STANOWISKA`)."""
    return [
        _opis_pola(None, nazwa, pole, {})
        for nazwa, pole in ScenariuszDynamiczny.model_fields.items()
        if nazwa != "zdarzenia" and nazwa not in POLA_TRYBU_STANOWISKA
    ]


def pola_stanowiska_ustawione(scenariusz: ScenariuszDynamiczny) -> tuple[str, ...]:
    """Pola `POLA_TRYBU_STANOWISKA` ustawione w scenariuszu (kolejność krotki)."""
    return tuple(pole for pole in POLA_TRYBU_STANOWISKA if getattr(scenariusz, pole) is not None)


def tryb_sieci(scenariusz: ScenariuszDynamiczny) -> bool:
    """Czy scenariusz jest w trybie SIECI (żadne pole trybu stanowiska nie jest ustawione) —
    predykat zapisu i listy scenariuszy ekranu, parą z opisem edytora."""
    return not pola_stanowiska_ustawione(scenariusz)


def opis_nastaw_solvera() -> list[dict[str, Any]]:
    """Nastawy numeryczne wymagane w opcjach biegu (`POLA_NASTAW`) — bez wartości domyślnych."""
    adnotacje = NastawySolvera.__annotations__
    wynik: list[dict[str, Any]] = []
    for nazwa in POLA_NASTAW:
        typ = adnotacje[nazwa]
        opis: dict[str, Any] = {
            "nazwa": nazwa,
            "etykieta_pl": _etykieta_pola(nazwa),
            "jednostka": _jednostka(nazwa),
            "wymagane": True,
            # Brak wartości (`null`) dopuszczony wyłącznie tam, gdzie przyjmuje go adapter
            # biegu — ten sam predykat, którym adapter odmawia `dynamika.nastawy_solvera_brak`.
            "dopuszcza_brak": nazwa in POLA_NASTAW_Z_WARTOSCIA_NULL,
        }
        if nazwa == "integrator":
            opis["typ"] = "wybor"
            opis["wartosci"] = [
                {
                    "wartosc": wartosc,
                    "etykieta_pl": ETYKIETY_WARTOSCI.get((nazwa, wartosc), wartosc),
                    "wykonywana_przez_rdzen": True,
                }
                for wartosc in get_args(NazwaIntegratora)
            ]
        elif typ is int or str(typ).split(" | ")[0] == "int":
            opis["typ"] = "calkowita"
        else:
            opis["typ"] = "liczba"
        wynik.append(opis)
    return wynik


def opis_scenariusza_dynamicznego() -> dict[str, Any]:
    """Pełny opis dla edytora scenariusza i nastaw (końcówka `GET /api/dynamika/opis-scenariusza`)."""
    return {
        "kontrakt": KONTRAKT_OPISU,
        "pola_scenariusza": opis_pol_scenariusza(),
        "rodzaje_zdarzen": opis_rodzajow_zdarzen(),
        "nastawy_solvera": opis_nastaw_solvera(),
    }


__all__ = [
    "ETYKIETY_KOLEKCJI",
    "ETYKIETY_POL",
    "ETYKIETY_RODZAJOW",
    "ETYKIETY_WARTOSCI",
    "ETYKIETY_WIELKOSCI_DETEKTORA",
    "KONTRAKT_OPISU",
    "POLA_TRYBU_STANOWISKA",
    "opis_nastaw_solvera",
    "opis_pol_scenariusza",
    "opis_rodzajow_zdarzen",
    "opis_scenariusza_dynamicznego",
    "pola_stanowiska_ustawione",
    "tryb_sieci",
]
