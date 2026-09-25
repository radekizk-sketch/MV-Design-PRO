"""Opis wyniku `dynamika_rms` dla przeglądarki przebiegów (karta AB-P1 §0.2, §0.8).

Kontrakt wyniku `resultset_dynamic_v2` jest ZAMROŻONY i niesie wyłącznie identyfikatory
(`element_ref` kanału, `ref` zdarzenia, klucz kanału z przedrostkiem wielkości). Projektant
czyta przebiegi po NAZWACH elementów i zacisków (klasa kart #140–#145: nigdy `ref_id`
w pierwszym planie), więc odpowiedź API dostaje OBOK kontraktu dwa bloki addytywne:

* `opis_wyniku` — dla każdego kanału: wielkość po polsku, element (nazwa i rodzaj z migawki
  BIEGU, nie z bieżącego modelu), zacisk gałęzi `od`/`do` z NAZWĄ szyny zacisku (bo
  gałąź z przekładnią albo susceptancją ma na końcach inne wielkości), miejsce zwarcia x·L;
  dla każdej metryki — opis i element; dla każdego zdarzenia wykonanego (lista równoległa
  do `zdarzenia_wykonane`) — opis rodzaju po polsku; słownik nazw elementów wskazanych przez zdarzenia
  i ich skutki topologiczne; baza mocy punktu pracy (jednostki względne mocy);
* `oceny` — rekordy kontraktu werdyktu wyjaśnialnego o statusie `NIE_OCENIONO`: bieg w trybie
  sieci nie wydaje ŻADNEGO werdyktu — ocena zgodności FRT i ocena stabilności kątowej
  (czas krytyczny) wymagają kryteriów i wyroczni, których ten bieg nie ma.

Zero fizyki: moduł tłumaczy klucze na opisy i czyta migawkę; żadna liczba nie jest tu liczona.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from typing import Any

from application.contracts.resultset_dynamic_v2 import TrybScenariusza
from application.dynamika.opis_scenariusza import ETYKIETY_WARTOSCI
from application.ocena_niewykonana import ocena_niewykonana, rekord_json
from enm.adapter_dynamiki import zalozenia_wejscia
from enm.dynamika_z_katalogu import stan_dynamiki_generatorow
from enm.nazwy_elementow import nazwa_elementu
from network_model.solvers.dynamika.zdarzenia import PRZYCZYNA_HARMONOGRAM
from solver_input.provenance import classify_dynamic_capability
from werdykt import (
    ClaimKind,
    DanaPrzyjeta,
    FieldQuality,
    PodstawaWymagania,
    Przedmiot,
    StatusDanych,
    ZakresWaznosci,
)

#: Zdolność dowodowa biegu w rejestrze proweniencji (ta sama, którą czyta wykonawca biegu).
ZDOLNOSC_DYNAMIKI_RMS = "dynamika_rms.przebieg_czasowy"

#: Przedrostek klucza kanału -> (wielkość po polsku, zacisk gałęzi albo None, grupa).
#: Grupa: `szyna`, `urzadzenie`, `galaz`, `miejsce_zwarcia`.
_KANALY: dict[str, tuple[str, str | None, str]] = {
    "u_pu": ("Moduł napięcia", None, "szyna"),
    "kat_deg": ("Kąt napięcia", None, "szyna"),
    "f_hz": ("Częstotliwość elektryczna", None, "szyna"),
    "u_f_est_hz": ("Oszacowanie błędu numerycznego częstotliwości", None, "szyna"),
    "jakosc_f": ("Rozróżnialność odchyłki częstotliwości (kod jakości)", None, "szyna"),
    "stan_zasilania": (
        "Stan zasilania (1 zasilana, 0 beznapięciowa, 2 napięcie narzucone)",
        None,
        "szyna",
    ),
    "p_pu": ("Moc czynna oddawana do sieci", None, "urzadzenie"),
    "q_pu": ("Moc bierna oddawana do sieci", None, "urzadzenie"),
    "stan_galezi": ("Stan gałęzi (1 załączona, 0 wyłączona)", None, "galaz"),
    "i_od_pu": ("Moduł prądu zacisku", "od", "galaz"),
    "i_do_pu": ("Moduł prądu zacisku", "do", "galaz"),
    "i_od_kat_deg": ("Kąt fazora prądu zacisku", "od", "galaz"),
    "i_do_kat_deg": ("Kąt fazora prądu zacisku", "do", "galaz"),
    "p_od_pu": ("Moc czynna wpływająca do gałęzi zaciskiem", "od", "galaz"),
    "q_od_pu": ("Moc bierna wpływająca do gałęzi zaciskiem", "od", "galaz"),
    "p_do_pu": ("Moc czynna wpływająca do gałęzi zaciskiem", "do", "galaz"),
    "q_do_pu": ("Moc bierna wpływająca do gałęzi zaciskiem", "do", "galaz"),
    "i_zwarcia_pu": ("Moduł prądu do ziemi w miejscu zwarcia", None, "miejsce_zwarcia"),
    "u_zwarcia_pu": ("Moduł napięcia w miejscu zwarcia", None, "miejsce_zwarcia"),
    "i_zwarcia_kat_deg": ("Kąt fazora prądu w miejscu zwarcia", None, "miejsce_zwarcia"),
}

#: Zmienne stanu urządzeń (przestrzeń `urzadzenie`) — nazwa stanu rdzenia -> opis.
_STANY_URZADZEN: dict[str, str] = {
    "delta_rad": "Kąt wirnika δ",
    "omega_pu": "Prędkość kątowa wirnika ω",
    "p_mechaniczna_pu": "Moc mechaniczna turbiny",
    "eq_prim_pu": "Siła elektromotoryczna przejściowa E′q",
    "ed_prim_pu": "Siła elektromotoryczna przejściowa E′d",
    "eq_bis_pu": "Siła elektromotoryczna podprzejściowa E″q",
    "ed_bis_pu": "Siła elektromotoryczna podprzejściowa E″d",
    "efd_pu": "Napięcie wzbudzenia E_fd",
    "u_odniesienia_pu": "Napięcie odniesienia regulatora",
    "sem_re_pu": "Siła elektromotoryczna źródła — część rzeczywista",
    "sem_im_pu": "Siła elektromotoryczna źródła — część urojona",
    "sem_modul_pu": "Moduł siły elektromotorycznej źródła",
    "pll_kat_rad": "Kąt pętli PLL",
    "pll_calka_pu": "Całka regulatora pętli PLL",
    "i_czynny_pu": "Prąd czynny przekształtnika",
    "i_bierny_pu": "Prąd bierny przekształtnika",
    "p_zadane_pu": "Moc czynna zadana przekształtnika",
    "q_zadane_pu": "Moc bierna zadana przekształtnika",
    "odbudowa_zwolnienie_pu": "Zwolnienie odbudowy mocy czynnej",
    "wzbudzenie_odniesienie_pu": "Napięcie odniesienia regulatora wzbudzenia",
    "wzbudzenie_wyprzedzenie_pu": "Człon wyprzedzająco-opóźniający regulatora wzbudzenia",
    "turbina_odniesienie_pu": "Moc odniesienia regulatora turbiny",
    "turbina_zawor_pu": "Położenie zaworu turbiny",
    "turbina_wyprzedzenie_pu": "Człon wyprzedzająco-opóźniający turbiny",
    "pss_filtr_pu": "Filtr sygnału stabilizatora systemowego (PSS)",
    "pss_wyprzedzenie1_pu": "Pierwszy człon wyprzedzający stabilizatora systemowego (PSS)",
    "pss_wyprzedzenie2_pu": "Drugi człon wyprzedzający stabilizatora systemowego (PSS)",
    "kat_rad": "Kąt siły elektromotorycznej przekształtnika tworzącego sieć",
    "p_filtr_pu": "Zmierzona (filtrowana) moc czynna przekształtnika",
    "q_filtr_pu": "Zmierzona (filtrowana) moc bierna przekształtnika",
    "soc_pu": "Stan naładowania magazynu energii",
    "omega_wirnika_pu": "Prędkość obrotowa wirnika turbiny wiatrowej",
    "pitch_rad": "Kąt nachylenia łopat turbiny wiatrowej",
    "p_aerodynamiczna_odniesienia_pu": "Moc aerodynamiczna odniesienia turbiny wiatrowej",
    "crowbar_pu": "Stan zabezpieczenia zwierającego wirnik (crowbar; 1 zadziałało, 0 nie)",
    "sem_kat_rad": "Kąt siły elektromotorycznej źródła testowego",
    "sem_modul_tempo_pu_na_s": "Tempo zmiany modułu siły elektromotorycznej źródła testowego",
    "sem_przesuniecie_fazy_rad": "Skok fazy siły elektromotorycznej źródła testowego",
    "odchylka_pulsacji_pu": "Odchyłka pulsacji źródła testowego",
    "odchylka_pulsacji_tempo_pu_na_s": "Tempo zmiany odchyłki pulsacji źródła testowego",
}

#: Przedrostek klucza metryki -> opis po polsku.
_METRYKI: dict[str, str] = {
    "u_min_pu": "Najniższe napięcie szyny w przebiegu",
    "t_u_min_s": "Chwila najniższego napięcia",
    "omega_max_pu": "Największa prędkość kątowa wirnika",
    "omega_min_pu": "Najmniejsza prędkość kątowa wirnika",
    "delta_max_rad": "Największy kąt wirnika",
}

#: Klucz spoza słowników niżej — zdanie po polsku, nigdy kod rdzenia (karta #145).
METRYKA_SPOZA_SLOWNIKA_PL = "wielkość charakterystyczna spoza słownika aplikacji"
ZDARZENIE_SPOZA_SLOWNIKA_PL = "zdarzenie spoza słownika aplikacji"

#: Rodzaj zdarzenia WYKONANEGO przez rdzeń (`RodzajWpisu` harmonogramu rdzenia) -> opis.
#: Zwarcie x·L i jego zdjęcie to osobne wpisy rdzenia (miejscem jest para gałąź, x).
_ZDARZENIA_WYKONANE: dict[str, str] = {
    "zwarcie": "Zwarcie na szynie",
    "zdjecie_zwarcia": "Usunięcie zwarcia na szynie",
    "zwarcie_galezi": "Zwarcie w gałęzi (miejsce x·L)",
    "zdjecie_zwarcia_galezi": "Usunięcie zwarcia w gałęzi",
    "wylaczenie_galezi": "Wyłączenie gałęzi",
    "zalaczenie_galezi": "Załączenie gałęzi",
    "wylaczenie_odsprzegu": "Wyłączenie łącznika sprzęgła",
    "zalaczenie_odsprzegu": "Załączenie łącznika sprzęgła",
    "odlaczenie_odbioru": "Odłączenie odbioru",
    "zalaczenie_odbioru": "Załączenie odbioru",
    "odlaczenie_zrodla": "Odłączenie źródła",
    "utrata_czesciowa_zrodla": "Częściowa utrata jednostek źródła",
    "skok_obciazenia": "Skok obciążenia",
    "przypisanie_stanu": "Przypisanie stanu urządzenia",
    "komenda_regulacji": "Zmiana nastawy regulatora",
}

#: Przedrostek przyczyny wpisu z dozoru (zdarzenie warunkowe) — format rdzenia
#: `f"dozor:{ident}"` (`network_model.solvers.dynamika.zdarzenia`, akcje dozorów).
_PRZEDROSTEK_PRZYCZYNY_DOZORU = "dozor:"


def _przyczyna_pl(przyczyna: object) -> str:
    """Przyczyna wykonania zdarzenia po polsku: harmonogram scenariusza, dozór z nazwą albo
    — dla przyczyny spoza obu form — jej tekst rdzenia (bez domysłu)."""
    tekst = str(przyczyna)
    if tekst == PRZYCZYNA_HARMONOGRAM:
        return "zadane w harmonogramie scenariusza"
    if tekst.startswith(_PRZEDROSTEK_PRZYCZYNY_DOZORU):
        return f"zdarzenie warunkowe detektora „{tekst[len(_PRZEDROSTEK_PRZYCZYNY_DOZORU):]}”"
    return f"przyczyna rdzenia „{tekst}”"


def _opis_stanu(nazwa_stanu: str) -> str:
    return _STANY_URZADZEN.get(nazwa_stanu, f"Zmienna stanu urządzenia „{nazwa_stanu}”")


#: Jednostka zmiennej stanu z sufiksu nazwy (konwencja nazw stanów rdzenia); sufiks złożony
#: sprawdzany PRZED prostym (`_pu_na_s` przed `_s`). Sufiks spoza słownika — `None`.
_JEDNOSTKI_STANOW: tuple[tuple[str, str], ...] = (
    ("_pu_na_s", "pu/s"),
    ("_pu", "pu"),
    ("_rad", "rad"),
    ("_deg", "°"),
    ("_hz", "Hz"),
    ("_s", "s"),
)


def _jednostka_stanu(nazwa_stanu: str) -> str | None:
    for sufiks, jednostka in _JEDNOSTKI_STANOW:
        if nazwa_stanu.endswith(sufiks):
            return jednostka
    return None


#: Kolekcje migawki przeszukiwane przy rozwiązywaniu nazw (kolejność = pierwszeństwo).
_KOLEKCJE_ELEMENTOW: tuple[tuple[str, str], ...] = (
    ("buses", "Szyna"),
    ("branches", "Gałąź"),
    ("transformers", "Transformator"),
    ("generators", "Wytwórca"),
    ("sources", "Źródło sieciowe"),
    ("loads", "Odbiór"),
    ("shunt_capacitors", "Bateria kondensatorów"),
)


def _indeks_elementow(snapshot: Mapping[str, Any]) -> dict[str, dict[str, Any]]:
    indeks: dict[str, dict[str, Any]] = {}
    for kolekcja, rodzaj_pl in _KOLEKCJE_ELEMENTOW:
        for element in snapshot.get(kolekcja) or []:
            if not isinstance(element, Mapping):
                continue
            ref = element.get("ref_id")
            if not isinstance(ref, str) or ref in indeks:
                continue
            indeks[ref] = {"kolekcja": kolekcja, "rodzaj_pl": rodzaj_pl, "element": element}
    return indeks


def komunikat_z_nazwami(tekst: str, refy: Iterable[str], nazwy: Mapping[str, str]) -> str:
    """Komunikat z identyfikatorami wskazanych elementów zamienionymi na ich NAZWY z modelu
    (projektant czyta nazwy, nie `ref_id`). Zamiana dotyczy wyłącznie elementów podanych
    w `refy` i tylko całych tokenów identyfikatora (dłuższy identyfikator najpierw).
    `nazwy` = indeks jednego źródła nazw `enm.nazwy_elementow.zbuduj_indeks_nazw` (element
    bez nazwy ma tam opis rodzaju, nie identyfikator — karta #144)."""
    for ref in sorted(set(refy), key=lambda r: (-len(r), r)):
        nazwa = nazwy.get(ref)
        if nazwa is None:
            continue
        tekst = re.sub(rf"(?<![\w-]){re.escape(ref)}(?![\w-])", f"„{nazwa}”", tekst)
    return tekst


def _nazwa(indeks: Mapping[str, Mapping[str, Any]], ref: str) -> str | None:
    """Nazwa elementu z jednego źródła nazw (`enm.nazwy_elementow.nazwa_elementu`): nazwa
    z modelu albo opis rodzaju („Szyna bez nazwy") — nigdy identyfikator. `None` wyłącznie
    dla odwołania spoza migawki (interfejs pokazuje wtedy jawny opis braku elementu)."""
    wpis = indeks.get(ref)
    if wpis is None:
        return None
    return nazwa_elementu(wpis["element"], str(wpis["kolekcja"]))


def _zaciski(wpis: Mapping[str, Any]) -> tuple[str | None, str | None]:
    """(szyna zacisku `od`, szyna zacisku `do`) gałęzi — ta sama orientacja co adapter biegu
    (`enm.adapter_dynamiki`: linia/kabel/łącznik `from_bus_ref -> to_bus_ref`,
    transformator `hv_bus_ref -> lv_bus_ref`)."""
    element = wpis["element"]
    if wpis["kolekcja"] == "transformers":
        return element.get("hv_bus_ref"), element.get("lv_bus_ref")
    if wpis["kolekcja"] == "branches":
        return element.get("from_bus_ref"), element.get("to_bus_ref")
    return None, None


def _opis_elementu(indeks: Mapping[str, Mapping[str, Any]], ref: str) -> dict[str, Any]:
    wpis = indeks.get(ref)
    if wpis is None:
        return {"ref_id": ref, "nazwa": None, "rodzaj_pl": None, "kolekcja": None, "typ": None}
    typ = wpis["element"].get("type")
    opis: dict[str, Any] = {
        "ref_id": ref,
        "nazwa": _nazwa(indeks, ref),
        "rodzaj_pl": wpis["rodzaj_pl"],
        "kolekcja": wpis["kolekcja"],
        # Dyskryminator elementu w kolekcji (np. gałąź: linia, kabel, łącznik) — interfejs
        # zaznacza element na schemacie właściwym typem, bez sięgania po bieżący model.
        "typ": typ if isinstance(typ, str) else None,
    }
    od, do = _zaciski(wpis)
    if od is not None or do is not None:
        opis["zacisk_od"] = {"szyna_ref": od, "szyna_nazwa": _nazwa(indeks, str(od or ""))}
        opis["zacisk_do"] = {"szyna_ref": do, "szyna_nazwa": _nazwa(indeks, str(do or ""))}
    return opis


def _opis_kanalu(kanal: Mapping[str, Any]) -> dict[str, Any]:
    klucz = str(kanal["klucz"])
    przedrostek, _, reszta = klucz.partition("@")
    element_ref = kanal.get("element_ref")
    polozenie: float | None = None
    if ":x=" in reszta:
        _, _, tekst = reszta.partition(":x=")
        try:
            polozenie = float(tekst)
        except ValueError:
            polozenie = None
    if przedrostek in _KANALY:
        wielkosc, zacisk, grupa = _KANALY[przedrostek]
    else:
        wielkosc = _opis_stanu(przedrostek)
        zacisk, grupa = None, "urzadzenie"
    return {
        "klucz": klucz,
        "wielkosc_pl": wielkosc,
        "jednostka": kanal.get("jednostka"),
        "przestrzen": kanal.get("przestrzen"),
        "grupa": grupa,
        "element_ref": element_ref,
        "zacisk": zacisk,
        "polozenie_zwarcia": polozenie,
    }


def _element_klucza(klucz: str) -> str | None:
    """Element wskazany kluczem kanału `<wielkość>@<element>[:x=<położenie>]`."""
    _, _, reszta = klucz.partition("@")
    element = reszta.partition(":x=")[0]
    return element or None


def _urzadzenie_przypisania(adres: str) -> tuple[str, str]:
    """(urządzenie, nazwa stanu) z adresu przypisania `urzadzenie.stan` (stan bez kropki)."""
    urzadzenie, _, stan = adres.rpartition(".")
    return urzadzenie, stan


def _opis_przypisania(adres: str) -> dict[str, Any]:
    urzadzenie, stan = _urzadzenie_przypisania(adres)
    return {
        "element_ref": urzadzenie,
        "stan_pl": _opis_stanu(stan),
        "jednostka": _jednostka_stanu(stan),
    }


def _refy_wyniku(ladunek: Mapping[str, Any]) -> list[str]:
    refy: list[str] = []
    for kanal in ladunek.get("kanaly") or []:
        if kanal.get("element_ref"):
            refy.append(str(kanal["element_ref"]))
    for metryka in ladunek.get("metryki") or []:
        if metryka.get("element_ref"):
            refy.append(str(metryka["element_ref"]))
    for zdarzenie in ladunek.get("zdarzenia_wykonane") or []:
        if zdarzenie.get("ref"):
            refy.append(str(zdarzenie["ref"]))
        refy.extend(str(r) for r in zdarzenie.get("obszary_odciete") or [])
        refy.extend(str(r) for r in zdarzenie.get("obszary_zasilone_ponownie") or [])
        refy.extend(str(o["ref"]) for o in zdarzenie.get("odbiory_odciete") or [])
        refy.extend(
            _urzadzenie_przypisania(str(p["adres"]))[0] for p in zdarzenie.get("przypisania") or []
        )
    for przekroczenie in ladunek.get("przekroczenia") or []:
        element = _element_klucza(str(przekroczenie["wielkosc"]))
        if element is not None:
            refy.append(element)
    return sorted(set(refy))


def _opis_przekroczenia(
    przekroczenie: Mapping[str, Any], kanaly: Mapping[str, Mapping[str, Any]]
) -> dict[str, Any]:
    """Opis wielkości, którą czytał detektor — z opisu kanału wyniku (ten sam klucz), a gdy
    kanał nie był zapisany — z samego klucza (jednostka wtedy nieznana: `None`)."""
    klucz = str(przekroczenie["wielkosc"])
    kanal = kanaly.get(klucz) or {"klucz": klucz, "element_ref": _element_klucza(klucz)}
    opis = _opis_kanalu(kanal)
    kierunek = str(przekroczenie["kierunek"])
    return {
        "wielkosc_pl": opis["wielkosc_pl"],
        "jednostka": opis["jednostka"],
        "element_ref": opis["element_ref"],
        "zacisk": opis["zacisk"],
        # Ten sam słownik etykiet co wybór kierunku w edytorze detektora.
        "kierunek_pl": ETYKIETY_WARTOSCI.get(("kierunek", kierunek), kierunek),
    }


def opis_wyniku_dynamiki(
    ladunek: Mapping[str, Any], snapshot: Mapping[str, Any], *, baza_mocy_mva: float | None
) -> dict[str, Any]:
    """Opis kanałów, metryk i elementów wyniku — z migawki BIEGU (reguły w docstringu modułu).

    Elementy wskazane przez zaciski gałęzi też są w słowniku `elementy`, więc interfejs
    rozwiązuje KAŻDY identyfikator odpowiedzi bez sięgania po bieżący model.
    """
    indeks = _indeks_elementow(snapshot)
    elementy = {ref: _opis_elementu(indeks, ref) for ref in _refy_wyniku(ladunek)}
    for opis in list(elementy.values()):
        for strona in ("zacisk_od", "zacisk_do"):
            szyna = (opis.get(strona) or {}).get("szyna_ref")
            if isinstance(szyna, str) and szyna not in elementy:
                elementy[szyna] = _opis_elementu(indeks, szyna)
    metryki = []
    for metryka in ladunek.get("metryki") or []:
        przedrostek = str(metryka["klucz"]).partition("@")[0]
        metryki.append(
            {
                "klucz": metryka["klucz"],
                "opis_pl": _METRYKI.get(przedrostek, METRYKA_SPOZA_SLOWNIKA_PL),
                "element_ref": metryka.get("element_ref"),
            }
        )
    zdarzenia = [
        {
            "rodzaj_pl": _ZDARZENIA_WYKONANE.get(
                str(zdarzenie.get("rodzaj")), ZDARZENIE_SPOZA_SLOWNIKA_PL
            ),
            "przyczyna_pl": _przyczyna_pl(zdarzenie.get("przyczyna")),
            # Lista równoległa do `przypisania` wpisu: urządzenie i opis przypisanego stanu.
            "przypisania": [
                _opis_przypisania(str(p["adres"])) for p in zdarzenie.get("przypisania") or []
            ],
        }
        for zdarzenie in ladunek.get("zdarzenia_wykonane") or []
    ]
    kanaly = {str(k["klucz"]): k for k in ladunek.get("kanaly") or []}
    return {
        "kanaly": [_opis_kanalu(kanal) for kanal in ladunek.get("kanaly") or []],
        "metryki": metryki,
        "zdarzenia": zdarzenia,
        # Lista równoległa do `przekroczenia` wyniku (detektory scenariusza, bez działania).
        "przekroczenia": [
            _opis_przekroczenia(p, kanaly) for p in ladunek.get("przekroczenia") or []
        ],
        "elementy": dict(sorted(elementy.items())),
        "baza_mocy_mva": baza_mocy_mva,
        **_podzial_zalozen(ladunek.get("zalozenia") or [], snapshot),
    }


def _podzial_zalozen(zalozenia: list[str], snapshot: Mapping[str, Any]) -> dict[str, list[str]]:
    """Założenia wyniku rozdzielone na część MODELU (adapter wejścia — zdania po polsku
    z nazwami elementów, `enm.adapter_dynamiki.zalozenia_wejscia`) i ZAPIS RDZENIA (zdania
    silnika, który nie zna nazw elementów modelu, z identyfikatorami węzłów).

    Wykonawca biegu zapisuje `zalozenia = [*rdzeń, *zalozenia_wejscia(migawka)]`; ten sam
    predykat — ta sama funkcja na tej samej migawce biegu — rozpoznaje część modelu jako
    SUFIKS listy. Bieg, którego sufiks się nie zgadza (zapis sprzed zmiany treści założeń),
    ma całą listę w zapisie rdzenia: nic nie ginie i nic nie trafia na pierwszy plan
    bez sprawdzenia (karta #145: zapis rdzenia wyłącznie w widoku technicznym).
    """
    if not snapshot:
        # Bieg bez zapisanej migawki modelu: części modelu nie da się rozpoznać tą samą
        # funkcją, więc cała lista zostaje w zapisie rdzenia (brak danej = brak podziału).
        return {"zalozenia_modelu": [], "zalozenia_rdzenia": list(zalozenia)}
    modelu = list(zalozenia_wejscia(dict(snapshot)))
    if modelu and list(zalozenia[-len(modelu) :]) == modelu:
        return {"zalozenia_modelu": modelu, "zalozenia_rdzenia": list(zalozenia[: -len(modelu)])}
    return {"zalozenia_modelu": [], "zalozenia_rdzenia": list(zalozenia)}


#: Czego brakuje do oceny ZGODNOŚCI FRT modułów wytwórczych na tym biegu.
BRAKI_OCENY_FRT: tuple[str, ...] = (
    "Kryteria zdolności do pozostania w pracy i wsparcia napięcia (NC RfG art. 14, 17, 20) "
    "odniesione do przebiegu: obwiednia napięcia z profilu operatora, prąd bierny "
    "dodatkowy i odbudowa mocy czynnej mierzone na zaciskach modułu.",
    "Model przekształtnika zweryfikowany wyrocznią (poziom „symulacja zwalidowana”) — "
    "parametry z profilu typowego normy są deklaracją, nie dowodem zachowania urządzenia.",
    "Zdarzenia zależne od przebiegu (zabezpieczenie podnapięciowe modułu, działanie "
    "automatyki) — bieg wykonuje wyłącznie zdarzenia zadane w harmonogramie.",
)

#: Czego brakuje do oceny STABILNOŚCI KĄTOWEJ (czas krytyczny) na tym biegu.
BRAKI_OCENY_STABILNOSCI: tuple[str, ...] = (
    "Kryterium utraty synchronizmu i wyznaczenie czasu krytycznego wyłączenia zwarcia "
    "(seria biegów z rosnącym czasem usunięcia zwarcia) — pojedynczy przebieg nie jest "
    "oceną stabilności.",
    "Model sieci zweryfikowany wyrocznią dla wszystkich rodzin urządzeń w biegu — rdzeń "
    "ma wyrocznie analityczne wyłącznie dla układu maszyna–szyna sztywna.",
)


#: Źródło bloku parametrów dynamicznych, którego wartości NIE są danymi zwalidowanymi
#: (`enm.dynamika_modele.ZrodloProweniencjiDynamiki`) -> powód po polsku. Karta producenta
#: i certyfikat jednostki są źródłem dokumentowym — nie trafiają na listę danych przyjętych.
_ZRODLA_PRZYJETE: dict[str, str] = {
    "profil_typowy_normy": (
        "wartości typowe klasy urządzenia z profilu katalogowego — nie karta producenta "
        "ani wynik testu tego urządzenia"
    ),
    "deklaracja_uzytkownika": "deklaracja projektanta bez dokumentu źródłowego urządzenia",
}


def dane_przyjete_biegu(migawka: Mapping[str, Any]) -> tuple[DanaPrzyjeta, ...]:
    """Bloki parametrów dynamicznych wytwórców migawki BIEGU, przyjęte bez walidacji
    (kolejność: `ref_id`). Źródło i odniesienie z proweniencji bloku — nie z tej warstwy."""
    wynik: list[DanaPrzyjeta] = []
    for stan in stan_dynamiki_generatorow(migawka):
        powod = _ZRODLA_PRZYJETE.get(stan.zrodlo_proweniencji or "")
        if powod is None:
            continue
        wynik.append(
            DanaPrzyjeta(
                nazwa_pl=f"Parametry dynamiczne źródła {stan.nazwa}",
                wartosc=None,
                powod_pl=f"{powod} ({stan.odniesienie_proweniencji})",
                jakosc=FieldQuality.ESTIMATED,
            )
        )
    return tuple(wynik)


#: Tryb scenariusza biegu (`ResultSetDynamicV2.tryb_scenariusza`) -> opis przedmiotu oceny.
OPISY_TRYBU_SCENARIUSZA: dict[str, str] = {
    "siec": "Sieć w biegu dynamiki czasowej RMS (tryb sieci, scenariusz zdarzeń)",
    "stanowisko": (
        "Sieć w biegu dynamiki czasowej RMS (tryb stanowiska badawczego: źródło testowe "
        "o profilu U/f/faza zamiast źródła sieciowego)"
    ),
}


def oceny_biegu_dynamiki(
    run_id: str,
    snapshot_nazwa: str | None,
    migawka: Mapping[str, Any],
    *,
    tryb_scenariusza: TrybScenariusza,
) -> list[dict[str, Any]]:
    """Dwa rekordy `NIE_OCENIONO` biegu — z powodem i listą braków (tryb z wyniku biegu).

    Poziom dowodowy z rejestru proweniencji (`UNVALIDATED_MODEL`), nie z tej warstwy.
    Status danych: `UNVALIDATED_INPUT` z listą bloków parametrów dynamicznych przyjętych
    bez walidacji (profil typowy katalogu, deklaracja), inaczej `ZWALIDOWANE`.
    """
    ewidencja = classify_dynamic_capability(ZDOLNOSC_DYNAMIKI_RMS)
    przyjete = dane_przyjete_biegu(migawka)
    status_danych = (
        StatusDanych(stan="UNVALIDATED_INPUT", dane_przyjete=przyjete) if przyjete else None
    )
    przedmiot = Przedmiot(
        element_ref=None,
        nazwa_pl=snapshot_nazwa or "Sieć biegu",
        opis_pl=OPISY_TRYBU_SCENARIUSZA[tryb_scenariusza],
    )
    zakres = ZakresWaznosci(
        opis_pl="Przebiegi czasowe RMS składowej zgodnej na punkcie pracy wskazanego rozpływu",
        wykluczenia=(
            "zwarcia niesymetryczne i składowe przeciwna oraz zerowa",
            "zdarzenia warunkowe wyzwalane przebiegiem",
        ),
    )
    wspolne: dict[str, Any] = {
        "przedmiot": przedmiot,
        "rodzaj_twierdzenia": ClaimKind.DYNAMIC_PERFORMANCE,
        "poziom": ewidencja.tier,
        "status_modelu": "UNVALIDATED_MODEL",
        "zakres_waznosci": zakres,
        "powod_braku_niepewnosci_pl": (
            "brak kryterium — przebieg nie jest porównywany z żadnym limitem, więc "
            "niepewność wyniku oceny nie dotyczy"
        ),
        "odniesienie_dowodu": f"bieg {run_id}",
        "status_danych": status_danych,
    }
    return [
        rekord_json(
            ocena_niewykonana(
                kryterium_id=f"dynamika_rms.zgodnosc_frt.{run_id}",
                opis_kryterium_pl="Zgodność modułów wytwórczych z wymaganiami FRT",
                podstawa=PodstawaWymagania(
                    rodzaj="ROZPORZADZENIE_UE",
                    dokument="Rozporządzenie (UE) 2016/631 (NC RfG) art. 14, 17 i 20",
                    status="NIEUSTALONE",
                    uwagi_pl="kryteria nie są odniesione do przebiegu w tym biegu",
                ),
                powod_stosowalnosci_pl="bieg zawiera moduły wytwórcze i zdarzenie zakłóceniowe",
                czego_brakuje=BRAKI_OCENY_FRT,
                **wspolne,
            )
        ),
        rekord_json(
            ocena_niewykonana(
                kryterium_id=f"dynamika_rms.stabilnosc_katowa.{run_id}",
                opis_kryterium_pl="Stabilność kątowa po zakłóceniu (czas krytyczny)",
                podstawa=PodstawaWymagania(
                    rodzaj="NIEUSTALONA",
                    dokument="Kryterium utraty synchronizmu — nieustalone dla tego biegu",
                    status="NIEUSTALONE",
                    uwagi_pl="bieg nie wyznacza czasu krytycznego",
                ),
                powod_stosowalnosci_pl="bieg zawiera zdarzenie zakłóceniowe w sieci",
                czego_brakuje=BRAKI_OCENY_STABILNOSCI,
                **wspolne,
            )
        ),
    ]


__all__ = [
    "BRAKI_OCENY_FRT",
    "BRAKI_OCENY_STABILNOSCI",
    "OPISY_TRYBU_SCENARIUSZA",
    "ZDOLNOSC_DYNAMIKI_RMS",
    "dane_przyjete_biegu",
    "komunikat_z_nazwami",
    "oceny_biegu_dynamiki",
    "opis_wyniku_dynamiki",
]
