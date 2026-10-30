"""Rodzaje aparatury łączeniowej SN i właściwe im wielkości zwarciowe — JEDNO źródło.

Liść bez importów modułów projektu: czytają go bramka rekordu (KAT-T-050 w
``catalog.types``), projekcja ``APARAT_SN`` (``catalog.repository``), rejestr wartości
roboczych (``catalog.wartosci_robocze`` — ``types`` importuje ten rejestr, więc zbiory nie
mogą żyć w ``types``), most dowodu doboru (``equipment_proof.catalog_bridge``) i eksport
fikstury frontu (``scripts/eksport_fixtur_harnessu.py`` → rozróżnienie „nie dotyczy” /
„brak danych” w interfejsie).

Rozróżnienie dwóch braków liczby w rekordzie aparatu:

* „nie dotyczy” — rodzaj aparatu z definicji normy tej wielkości nie ma (zdolność
  wyłączania zwarć rozłącznika, odłącznika i uziemnika; prąd krótkotrwały wytrzymywany
  bezpiecznika) — rozstrzyga RODZAJ, pole jest zawsze ``None``;
* „brak danych” — wielkość jest właściwa rodzajowi, a karta katalogowa jej nie podaje —
  pole ``None``.

Zero nie jest żadnym z nich (bramka KAT-T-050 odrzuca je w każdej wielkości).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any, Literal

#: Komplet rodzajów aparatury łączeniowej (``SwitchEquipmentType.equipment_kind``).
RODZAJE_APARATURY_LACZENIOWEJ: frozenset[str] = frozenset(
    {
        "CIRCUIT_BREAKER",
        "LOAD_SWITCH",
        "DISCONNECTOR",
        "EARTH_SWITCH",
        "FUSE",
        "RECLOSER",
    }
)
#: Rodzaje aparatury łączeniowej SN ze ZNAMIONOWĄ zdolnością łączeniową zwarciową
#: (``SwitchEquipmentType.ik_ka``): wyłącznik i reklozer (PN-EN 62271-100 / -111) oraz
#: bezpiecznik (PN-EN 60282-1). Rozłącznik, odłącznik i uziemnik tej zdolności nie mają
#: z definicji normy — JEDNO źródło dla bramki rekordu (KAT-T-050) i dla odczytu
#: „nie dotyczy” zdolności wyłączania (``equipment_proof.catalog_bridge``).
RODZAJE_LACZNIKA_ZE_ZDOLNOSCIA_WYLACZANIA: frozenset[str] = frozenset(
    {"CIRCUIT_BREAKER", "RECLOSER", "FUSE"}
)
#: Rodzaje aparatury łączeniowej SN BEZ prądu krótkotrwałego wytrzymywanego
#: (``SwitchEquipmentType.icw_ka``): wkładka bezpiecznikowa przepala się, nie
#: przewodzi zwarcia przez czas znamionowy (PN-EN 60282-1 nie definiuje I_cw).
RODZAJE_LACZNIKA_BEZ_PRADU_KROTKOTRWALEGO: frozenset[str] = frozenset({"FUSE"})


#: Wielkości zwarciowe rekordu łącznika (``SwitchEquipmentType``) objęte bramką KAT-T-050.
WIELKOSCI_ZWARCIOWE_LACZNIKA: tuple[str, ...] = ("ik_ka", "icw_ka", "i_cu_ka")

#: Rodzaj aparatu SN projekcji ``APARAT_SN`` (``MVApparatusType.device_kind``) z rodzaju
#: rekordu łącznika (``SwitchEquipmentType.equipment_kind``) — JEDNO odwzorowanie dla
#: projekcji katalogu (``repository._derive_mv_apparatus_records``) i dla rozstrzygnięcia
#: „nie dotyczy” wielkości aparatu SN.
RODZAJ_APARATU_SN_Z_RODZAJU_LACZNIKA: dict[str, str] = {
    "CIRCUIT_BREAKER": "WYLACZNIK",
    "LOAD_SWITCH": "ROZLACZNIK",
    "DISCONNECTOR": "ODLACZNIK",
    "EARTH_SWITCH": "UZIEMNIK",
    "FUSE": "ROZLACZNIK_BEZPIECZNIKOWY",
    "RECLOSER": "REKLOZER",
}
#: Pole projekcji aparatu SN ← pole rekordu łącznika (te same wielkości zwarciowe).
POLE_LACZNIKA_Z_POLA_APARATU_SN: dict[str, str] = {
    "breaking_capacity_ka": "ik_ka",
    "i_th_ka": "icw_ka",
}
#: Wielkości zwarciowe pozycji aparatu SN (``MVApparatusType``) objęte bramką KAT-T-050.
WIELKOSCI_ZWARCIOWE_APARATU_SN: tuple[str, ...] = (
    "breaking_capacity_ka",
    "making_capacity_ka",
    "i_th_ka",
    "i_dyn_ka",
)


def wielkosc_zwarciowa_lacznika_dotyczy(equipment_kind: str, pole: str) -> bool:
    """Czy wielkość zwarciowa ``pole`` rekordu łącznika jest właściwa jego rodzajowi.

    JEDNO źródło rozstrzygnięcia „nie dotyczy” dla bramki rekordu (KAT-T-050),
    projekcji ``APARAT_SN`` i konsumentów wyjaśnień: ``ik_ka`` (znamionowa zdolność
    wyłączania zwarć) i ``i_cu_ka`` (znamionowy prąd wyłączalny zwarciowy) mają wyłącznie
    rodzaje z ``RODZAJE_LACZNIKA_ZE_ZDOLNOSCIA_WYLACZANIA``, ``icw_ka`` (prąd krótkotrwały
    wytrzymywany) — wszystkie rodzaje poza ``RODZAJE_LACZNIKA_BEZ_PRADU_KROTKOTRWALEGO``.
    """
    if pole in ("ik_ka", "i_cu_ka"):
        return equipment_kind in RODZAJE_LACZNIKA_ZE_ZDOLNOSCIA_WYLACZANIA
    if pole == "icw_ka":
        return equipment_kind not in RODZAJE_LACZNIKA_BEZ_PRADU_KROTKOTRWALEGO
    raise ValueError(f"Nieznana wielkość zwarciowa łącznika: {pole!r}")


def wielkosc_zwarciowa_aparatu_sn_dotyczy(device_kind: str, pole: str) -> bool:
    """Czy wielkość zwarciowa ``pole`` pozycji aparatu SN jest właściwa jego rodzajowi.

    Rozstrzyga przez rodzaj rekordu łącznika (odwrócone
    ``RODZAJ_APARATU_SN_Z_RODZAJU_LACZNIKA``) — ten sam predykat co bramka rekordu.
    Rodzaj spoza odwzorowania (pozycja aparatu SN nie z projekcji katalogu łączników) i
    pole bez odpowiednika w rekordzie łącznika (``making_capacity_ka``, ``i_dyn_ka``) nie
    mają rozstrzygnięcia „nie dotyczy” — wielkość traktowana jako właściwa.
    """
    if pole not in WIELKOSCI_ZWARCIOWE_APARATU_SN:
        raise ValueError(f"Nieznana wielkość zwarciowa aparatu SN: {pole!r}")
    pole_lacznika = POLE_LACZNIKA_Z_POLA_APARATU_SN.get(pole)
    rodzaj_lacznika = _RODZAJ_LACZNIKA_Z_RODZAJU_APARATU_SN.get(device_kind)
    if pole_lacznika is None or rodzaj_lacznika is None:
        return True
    return wielkosc_zwarciowa_lacznika_dotyczy(rodzaj_lacznika, pole_lacznika)


_RODZAJ_LACZNIKA_Z_RODZAJU_APARATU_SN: dict[str, str] = {
    aparat: lacznik for lacznik, aparat in RODZAJ_APARATU_SN_Z_RODZAJU_LACZNIKA.items()
}


# ---------------------------------------------------------------------------
# Rodzaje APARATU POLA (``BayPrimaryDevice.kind``) — porty, stany łącznika, zbiór łączników
# ---------------------------------------------------------------------------
#
# JEDNO źródło dla modelu pola (``enm.models.BayPrimaryDevice``), szablonów pól
# (``catalog.bay_templates``), operacji wyposażenia pola (``enm.wyposazenie_pola``), reguł
# blokad (``enm.interlock_rules``) i lustra frontu (``frontend/src/ui/sld/v3/compose/
# rodzajeAparatuPola.ts`` — równość zbiorów przypina
# ``tests/ci/test_parytet_rodzajow_aparatu_pola.py``).
# Karta UX-04/POLE-LINIOWE-WZORZEC (ENEA Operator, Stacje 110 kV, Zeszyt 1, Z.10 s.89 i §13).

#: Łącznik trójpołożeniowy (rozdzielnica w izolacji SF6 — ENEA Zeszyt 1 §13, druk s.23; łączniki
#: trójpołożeniowe — druk s.25; Z.10 s.89): jeden nóż, trzy położenia — ZAMKNIĘTY (nóż na
#: zestyku szyny), OTWARTY (położenie środkowe, przerwa izolacyjna) i UZIEMIONY (nóż na zestyku
#: uziemiającym).
RODZAJ_LACZNIKA_TROJPOLOZENIOWEGO = "THREE_POSITION_SWITCH"
#: Przekładnik Ferrantiego (przekładnik prądowy pierścieniowy na kablu, Z.10 s.89: „1/100",
#: zasila zabezpieczenie ziemnozwarciowe) — obejmuje kabel, NIE przerywa toru.
RODZAJ_PRZEKLADNIKA_FERRANTIEGO = "CORE_BALANCE_CT"
#: Pojemnościowy wskaźnik napięcia (Z.10 s.89, §13 „stacjonarne wskaźniki napięcia") —
#: odgałęzienie jednoportowe bez obciążenia toru.
RODZAJ_WSKAZNIKA_NAPIECIA = "VOLTAGE_INDICATOR"

#: Aparaty pola baterii kondensatorów (BKR, karta UX-04/POLE-BKR-MODEL; ENEA Operator, Stacje
#: 110 kV, Zeszyt 1, §17 s. 32 i Zał. 16): bateria w układzie podwójnej gwiazdy z izolowanymi
#: punktami gwiazd ma przekładnik prądowy w połączeniu międzygwiazdowym (zabezpieczenie od
#: uszkodzeń kondensatorów Ir>) i dwa przekładniki napięciowe międzyfazowe (L1-L2, L2-L3) do
#: rozładowania baterii i do zabezpieczenia nadnapięciowego U>. Oba rodzaje są aparatami pola
#: (`BayPrimaryDevice.kind`) z portami w JEDNEJ liście portów aparatów pola
#: (``PORTY_APARATU_POLA``) — bez osobnej listy portów pola BKR.
#:
#: Przekładnik prądowy niezrównoważenia: obejmuje połączenie między punktami gwiazd baterii
#: (prąd niezrównoważenia przy uszkodzeniu jednostek kondensatorowych), nie przerywa toru —
#: jedyny port to obwód, który przekładnik OBEJMUJE (``PORT_OBWODU``, jak przekładnik
#: Ferrantiego).
RODZAJ_PRZEKLADNIKA_NIEZROWNOWAZENIA = "UNBALANCE_CT"
#: Przekładnik napięciowy międzyfazowy (nieuziemiony, PN-EN 61869-3 — zaciski pierwotne A i B):
#: rozładowanie baterii po wyłączeniu i pomiar napięcia do zabezpieczenia U>.
RODZAJ_PRZEKLADNIKA_NAPIECIOWEGO_MIEDZYFAZOWEGO = "PHASE_TO_PHASE_VT"

#: Port aparatu w torze od strony szyny (wejście) i od strony odpływu (wyjście). Przekładnik
#: prądowy Z.10: P1 = ``we`` (od wyłącznika), P2 = ``wy`` (od kabla).
PORT_WEJSCIA = "we"
PORT_WYJSCIA = "wy"
#: Jedyny port aparatu odgałęzieniowego (uziemnik, przekładnik napięciowy, ogranicznik
#: przepięć, wskaźnik napięcia) — przyłączenie do węzła toru.
PORT_PRZYLACZA = "przylacze"
#: Jedyny port przekładnika Ferrantiego i przekładnika niezrównoważenia baterii — obwód
#: (kabel, połączenie międzygwiazdowe), który przekładnik OBEJMUJE.
PORT_OBWODU = "obwod"
#: Zaciski pierwotne przekładnika napięciowego nieuziemionego wg PN-EN 61869-3 (oznaczenie
#: A i B). W schemacie jednokreskowym oba przyłączają się do TEGO SAMEGO węzła toru (dwie fazy
#: jednego węzła) — przekładnik międzyfazowy jest odgałęzieniem, nie aparatem w torze.
PORT_FAZY_A = "A"
PORT_FAZY_B = "B"

#: Porty aparatu pola wg rodzaju — kolejność stała (wejście, wyjście). Rodzaj bez wpisu
#: (wytwórca, falownik, bateria — nie są aparatami pola) nie ma portów pola.
PORTY_APARATU_POLA: dict[str, tuple[str, ...]] = {
    "CB": (PORT_WEJSCIA, PORT_WYJSCIA),
    "LOAD_SWITCH": (PORT_WEJSCIA, PORT_WYJSCIA),
    "DS": (PORT_WEJSCIA, PORT_WYJSCIA),
    "FUSE": (PORT_WEJSCIA, PORT_WYJSCIA),
    RODZAJ_LACZNIKA_TROJPOLOZENIOWEGO: (PORT_WEJSCIA, PORT_WYJSCIA),
    "CT": (PORT_WEJSCIA, PORT_WYJSCIA),
    "CABLE_HEAD": (PORT_WEJSCIA, PORT_WYJSCIA),
    "TRANSFORMER_DEVICE": (PORT_WEJSCIA, PORT_WYJSCIA),
    "ES": (PORT_PRZYLACZA,),
    "VT": (PORT_PRZYLACZA,),
    "SURGE_ARRESTER": (PORT_PRZYLACZA,),
    RODZAJ_WSKAZNIKA_NAPIECIA: (PORT_PRZYLACZA,),
    RODZAJ_PRZEKLADNIKA_FERRANTIEGO: (PORT_OBWODU,),
    RODZAJ_PRZEKLADNIKA_NIEZROWNOWAZENIA: (PORT_OBWODU,),
    RODZAJ_PRZEKLADNIKA_NAPIECIOWEGO_MIEDZYFAZOWEGO: (PORT_FAZY_A, PORT_FAZY_B),
}

#: Rodzaje aparatów pola BKR (podzbiór kluczy ``PORTY_APARATU_POLA``) — czytają reguły pola
#: baterii (``enm.bateria_kondensatorow``) i lustro frontu (``RODZAJE_APARATOW_POLA_BKR``).
RODZAJE_APARATOW_POLA_BKR: frozenset[str] = frozenset(
    {
        RODZAJ_PRZEKLADNIKA_NIEZROWNOWAZENIA,
        RODZAJ_PRZEKLADNIKA_NAPIECIOWEGO_MIEDZYFAZOWEGO,
    }
)

#: Liczba przekładników napięciowych międzyfazowych rozładowujących baterię (Zeszyt 1 §17
#: s. 32: „2 PN międzyfazowe do rozładowania"; Zał. 16: L1-L2 i L2-L3 — układ V obejmuje
#: wszystkie trzy fazy baterii).
LICZBA_PRZEKLADNIKOW_ROZLADOWCZYCH_BATERII = 2

#: Port, który łącznik trójpołożeniowy uziemia w położeniu UZIEMIONY: strona odpływowa
#: (tor w kierunku wyłącznika). Kabel uziemia się przez zamknięty wyłącznik (§13, druk s.25) —
#: dlatego reguła blokad pola NIE traktuje zamkniętego wyłącznika przy uziemionym łączniku
#: trójpołożeniowym jako naruszenia (``enm.interlock_rules``).
PORT_UZIEMIANY_LACZNIKA_TROJPOLOZENIOWEGO = PORT_WYJSCIA

#: Położenia łącznika trójpołożeniowego (``BaySwitchState.actual_state``). Stan
#: ``uziemiony`` jest WYŁĄCZNIE położeniem łącznika trójpołożeniowego.
STAN_UZIEMIONY = "uziemiony"
STANY_LACZNIKA_TROJPOLOZENIOWEGO: tuple[str, ...] = (
    "zamkniety",
    "otwarty",
    STAN_UZIEMIONY,
)

#: Rodzaje aparatu pola, które są ŁĄCZNIKAMI (mają położenie łączeniowe): zbiór, który
#: schemat oznacza ramką stanu (zamknięty / otwarty) i który czytają reguły blokad. Ten sam
#: zbiór ma lustro frontu (``RODZAJE_LACZNIKOW_POLA``) — równość przypięta testem.
RODZAJE_LACZNIKOW_POLA: frozenset[str] = frozenset(
    {"CB", "LOAD_SWITCH", "DS", "ES", "FUSE", RODZAJ_LACZNIKA_TROJPOLOZENIOWEGO}
)
#: Uziemnik pola (aparat odgałęzieniowy do ziemi) — jedyny łącznik pola poza torem głównym.
RODZAJ_UZIEMNIKA = "ES"
#: Łączniki TORU GŁÓWNEGO pola (zamknięte = tor przewodzi): komplet łączników bez uziemnika.
#: Reguła blokad uziemnik ↔ tor (``enm.interlock_rules.MAIN_SWITCH_KINDS``) czyta TEN zbiór.
RODZAJE_LACZNIKOW_TORU: frozenset[str] = RODZAJE_LACZNIKOW_POLA - {RODZAJ_UZIEMNIKA}

#: Położenia, w których łącznik NIE przewodzi w torze głównym — jednoznacznie potwierdzone.
#: ``uziemiony`` należy tu, bo łącznik trójpołożeniowy w położeniu uziemienia odcina szynę od
#: toru (nóż na zestyku uziemiającym). Stan nieznany, awaria i brak rekordu NIE są otwarciem
#: (nie zwalniają blokady — zero domysłu).
STANY_OTWARTE_W_TORZE: tuple[str, ...] = (
    "otwarty",
    "otwarty_naped_rozbrojony",
    STAN_UZIEMIONY,
)

#: Węzeł szyny sekcji pola — pierwszy węzeł toru (port ``we`` pierwszego aparatu toru).
WEZEL_SZYNY = "szyna"
#: Ostatni węzeł toru wg rodzaju ostatniego aparatu toru: odejście kablowe za głowicą,
#: zacisk transformatora pola za transformatorem; inaczej odpływ pola.
WEZEL_KABLA = "kabel"
WEZEL_TRANSFORMATORA = "transformator"
WEZEL_ODPLYWU = "odplyw"
_WEZEL_KONCA_TORU: dict[str, str] = {
    "CABLE_HEAD": WEZEL_KABLA,
    "TRANSFORMER_DEVICE": WEZEL_TRANSFORMATORA,
}
#: Węzły końca TORU GŁÓWNEGO pola — tor główny to droga aparatów dwuportowych od węzła szyny
#: do jednego z tych węzłów (``aparaty_poza_torem_glownym``). Lustro frontu
#: ``WEZLY_KONCA_TORU`` (``rodzajeAparatuPola.ts``), równość przypina test parytetu.
WEZLY_KONCA_TORU: frozenset[str] = frozenset({WEZEL_KABLA, WEZEL_TRANSFORMATORA, WEZEL_ODPLYWU})

#: Klucz SEKWENCJI aparatów (wejście ``porty_toru_pola``, nie pole rekordu aparatu):
#: identyfikator odgałęzienia toru, w którym aparat leży. Aparaty o tym samym identyfikatorze
#: tworzą odgałęzienie zaczynające się na węźle toru głównego bieżącym w chwili pierwszego
#: z nich (pole liniowe z pomiarem napięcia zwrotnego, ENEA Zeszyt 1 Z.11.1/Z.11: odgałęzienie
#: przekładnika napięciowego za wyłącznikiem, przed przekładnikiem prądowym). Klucz nie
#: przechodzi do rekordu — położenie aparatu niosą odtąd jego porty.
KLUCZ_ODGALEZIENIA = "odgalezienie"

#: WYKONANIE APARATU (rozstrzygnięcie architekta 2026-10-30 pkt 3, karta UX-04/POLE-LINIOWE-
#: WZORZEC): wyłącznik stały albo człon wysuwny (wyłącznik poziomo wysuwny na wózku, ENEA
#: Zeszyt 1 §13). Jedno źródło słownika dla szablonu pola (`BayDeviceTemplate.wykonanie`),
#: rekordu ENM (`BayPrimaryDevice.wykonanie`), pisarza wyposażenia (`set_bay_equipment`),
#: oceny składu pola (`bay_templates.odlaczenie_wysunieciem_wylacznika`) i rysunku SLD
#: (znacznik „○” członu wysuwnego obok „×” wyłącznika).
WykonanieAparatu = Literal["STALE", "WYSUWNE"]
WYKONANIA_APARATU: tuple[str, ...] = ("STALE", "WYSUWNE")
OPIS_WYKONANIA_APARATU_PL: dict[str, str] = {
    "STALE": "stałe",
    "WYSUWNE": "wysuwne (człon wysuwny na wózku)",
}
#: Rodzaje aparatu, którym zapisuje się wykonanie — wyłącznik pola (ENEA Zeszyt 1 §13 rozróżnia
#: wykonanie stałe i poziomo wysuwne wyłącznika; człon wysuwny niesie wyłącznik).
RODZAJE_Z_WYKONANIEM: frozenset[str] = frozenset({"CB"})


def porty_toru_pola(aparaty: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Porty aparatów pola wyprowadzone z SEKWENCJI aparatów — jedna reguła dla każdej drogi
    budowy pola (szablon, katalogowe pole rodziny, pole źródłowe, wyposażenie od projektanta).

    Kolejność listy jest kolejnością fizyczną od szyny. Aparat dwuportowy (``we``/``wy``) leży
    w torze: ``we`` na bieżącym węźle, ``wy`` na nowym (``w1``, ``w2``… — ostatni aparat toru
    kończy tor węzłem ``kabel``/``transformator``/``odplyw``). Aparat odgałęzieniowy
    (``przylacze``), przekładnik Ferrantiego i przekładnik niezrównoważenia (``obwod``) oraz
    przekładnik napięciowy międzyfazowy (oba zaciski ``A`` i ``B`` — dwie fazy jednego węzła)
    przyłączają się do BIEŻĄCEGO węzła — bez przerwy toru. Rodzaj bez portów pola (wytwórca, falownik, bateria) zostaje bez portów.

    Aparat z kluczem ``KLUCZ_ODGALEZIENIA`` leży w ODGAŁĘZIENIU toru: odgałęzienie zaczyna się
    na węźle toru głównego bieżącym przy jego pierwszym aparacie, jego aparaty dwuportowe
    tworzą węzły ``<id>1``, ``<id>2``…, a jednoportowe przyłączają się do bieżącego węzła
    odgałęzienia. Odgałęzienie nie przesuwa toru głównego i nie kończy go.

    Porty podane jawnie mają pierwszeństwo: lista, w której choć jeden aparat niesie porty,
    wraca bez zmian (dane projektowe nie są nadpisywane regułą). Wynik — nowe słowniki
    (wejście nietknięte); klucz odgałęzienia zostaje w rekordzie aparatu jako dana projektowa
    (`BayPrimaryDevice.odgalezienie`), żeby ponowny zapis wyposażenia odtworzył te same porty.
    Funkcja deterministyczna i idempotentna.
    """
    kopie = [dict(a) for a in aparaty]
    odgalezienia = [kopia.get(KLUCZ_ODGALEZIENIA) for kopia in kopie]
    if any(a.get("ports") for a in kopie):
        return kopie

    def dwuportowy(aparat: Mapping[str, Any]) -> bool:
        return PORTY_APARATU_POLA.get(str(aparat.get("kind"))) == (
            PORT_WEJSCIA,
            PORT_WYJSCIA,
        )

    indeksy_toru = [i for i, a in enumerate(kopie) if dwuportowy(a) and odgalezienia[i] is None]
    ostatni_toru = indeksy_toru[-1] if indeksy_toru else None
    wezel = WEZEL_SZYNY
    numer = 0
    wezly_odgalezien: dict[str, str] = {}
    numery_odgalezien: dict[str, int] = {}
    for i, aparat in enumerate(kopie):
        komplet = PORTY_APARATU_POLA.get(str(aparat.get("kind")), ())
        odgalezienie = odgalezienia[i]
        if odgalezienie is not None:
            identyfikator = str(odgalezienie)
            biezacy = wezly_odgalezien.setdefault(identyfikator, wezel)
            if komplet == (PORT_WEJSCIA, PORT_WYJSCIA):
                numery_odgalezien[identyfikator] = numery_odgalezien.get(identyfikator, 0) + 1
                nastepny = f"{identyfikator}{numery_odgalezien[identyfikator]}"
                aparat["ports"] = [
                    {"port_id": PORT_WEJSCIA, "wezel": biezacy},
                    {"port_id": PORT_WYJSCIA, "wezel": nastepny},
                ]
                wezly_odgalezien[identyfikator] = nastepny
            elif komplet:
                aparat["ports"] = [{"port_id": port, "wezel": biezacy} for port in komplet]
            continue
        if komplet == (PORT_WEJSCIA, PORT_WYJSCIA):
            if i == ostatni_toru:
                nastepny = _WEZEL_KONCA_TORU.get(str(aparat.get("kind")), WEZEL_ODPLYWU)
            else:
                numer += 1
                nastepny = f"w{numer}"
            aparat["ports"] = [
                {"port_id": PORT_WEJSCIA, "wezel": wezel},
                {"port_id": PORT_WYJSCIA, "wezel": nastepny},
            ]
            wezel = nastepny
        elif komplet:
            aparat["ports"] = [{"port_id": port, "wezel": wezel} for port in komplet]
    return kopie


def aparaty_poza_torem_glownym(
    aparaty: Sequence[tuple[str, str, Mapping[str, str | None]]],
) -> frozenset[str]:
    """Aparaty pola leżące POZA torem głównym — w odgałęzieniu toru (z portów aparatów).

    Wejście: ``(ref aparatu, rodzaj, {port_id: węzeł})``. Tor główny to droga aparatów
    dwuportowych od węzła szyny (``WEZEL_SZYNY``) do węzła końca toru (``WEZLY_KONCA_TORU``).
    Aparat dwuportowy spoza tej drogi leży w odgałęzieniu, a aparat jednoportowy — wtedy, gdy
    jego węzeł nie leży na torze głównym. JEDNA reguła dla reguł blokad i zasilenia (łącznik
    odgałęzienia przekładnika napięciowego nie jest łącznikiem toru głównego — jego otwarcie
    nie przerywa toru pola) i lustro obchodu toru frontu (``torPolaZPortow``).

    Odgałęzienie może wychodzić także z WĘZŁA KOŃCA toru (pole pomiaru napięcia ENEA Z.17:
    łącznik trójpołożeniowy kończy tor, a złącze i przekładnik napięciowy leżą w odgałęzieniu
    za nim) — tor główny kończy się na węźle końca, więc aparaty za nim leżą poza torem także
    bez rozwidlenia węzła.

    Brak wniosku = pusty zbiór (każdy aparat traktowany wg rodzaju, jak przed kontraktem
    portów): pole bez portów, tor bez odgałęzienia, oraz tor, w którym do końca toru nie
    prowadzi żadna albo prowadzi więcej niż jedna droga (zero domysłu, który tor jest główny —
    obchód frontu zgłasza to jako brak przyłączenia).
    """
    dwuportowe: list[tuple[str, str, str]] = []
    jednoportowe: list[tuple[str, str]] = []
    for ref, rodzaj, porty in aparaty:
        komplet = PORTY_APARATU_POLA.get(rodzaj, ())
        if komplet == (PORT_WEJSCIA, PORT_WYJSCIA):
            we, wy = porty.get(PORT_WEJSCIA), porty.get(PORT_WYJSCIA)
            if we is not None and wy is not None:
                dwuportowe.append((ref, we, wy))
        elif komplet:
            wezel = porty.get(komplet[0])
            if wezel is not None:
                jednoportowe.append((ref, wezel))
    wyjscia: dict[str, list[tuple[str, str]]] = {}
    for ref, we, wy in dwuportowe:
        wyjscia.setdefault(we, []).append((ref, wy))
    drogi: list[list[str]] = []

    def szukaj(wezel: str, droga: list[str], odwiedzone: frozenset[str]) -> None:
        if wezel in WEZLY_KONCA_TORU:
            drogi.append(droga)
            return
        for ref, wy in wyjscia.get(wezel, []):
            if wy not in odwiedzone:
                szukaj(wy, [*droga, ref], odwiedzone | {wy})

    szukaj(WEZEL_SZYNY, [], frozenset({WEZEL_SZYNY}))
    if len(drogi) != 1:
        return frozenset()
    tor = set(drogi[0])
    wezly_toru = {WEZEL_SZYNY} | {wy for ref, _, wy in dwuportowe if ref in tor}
    poza = {ref for ref, _, _ in dwuportowe if ref not in tor}
    poza |= {ref for ref, wezel in jednoportowe if wezel not in wezly_toru}
    return frozenset(poza)


#: Łączniki ODŁĄCZAJĄCE toru (przerwa izolacyjna w położeniu otwartym — odłącznik, rozłącznik,
#: łącznik trójpołożeniowy; IEC 62271-102 §3.7.1, IEC 62271-103). Wyłącznik nie jest łącznikiem
#: odłączającym (wyłącznik stały bez przerwy izolacyjnej) — uziemienie odcinka za nim wymaga
#: otwarcia odłącznika dalej w drodze do szyny.
RODZAJE_LACZNIKOW_ODLACZAJACYCH: frozenset[str] = frozenset(
    {"DS", "LOAD_SWITCH", RODZAJ_LACZNIKA_TROJPOLOZENIOWEGO}
)


def laczniki_drogi_uziemnika(
    aparaty: Sequence[tuple[str, str, Mapping[str, str | None]]],
) -> dict[str, frozenset[str]]:
    """Łączniki toru SKOJARZONE z uziemnikiem pola — z portów aparatów (jedno źródło par blokad).

    Wejście: ``(ref aparatu, rodzaj, {port_id: węzeł})``. Dla uziemnika (``RODZAJ_UZIEMNIKA``)
    z węzłem przyłączenia: łączniki toru (``RODZAJE_LACZNIKOW_TORU``) na drodze od jego węzła
    w stronę szyny (``WEZEL_SZYNY``) — aż do PIERWSZEGO łącznika odłączającego włącznie
    (``RODZAJE_LACZNIKOW_ODLACZAJACYCH``): to on oddziela uziemiany odcinek od napięcia szyny
    (blokada uziemnika z „przynależnym" łącznikiem, IEC 62271-200 §5.11, IEC 62271-102 §5.105).
    Uziemnik odgałęzienia przekładnika napięciowego (Z.11.1/Z.11 Q51) wiąże więc odłącznik
    odgałęzienia Q5, a uziemnik toru za wyłącznikiem (Q9) — wyłącznik i odłącznik szynowy, bez
    łącznika odgałęzienia.

    Uziemnik pomijany w wyniku (= brak wniosku, reguła blokad bierze wszystkie łączniki toru,
    jak przed kontraktem portów): brak portu przyłączenia, przyłączenie na węźle szyny, droga
    do szyny nieistniejąca albo niejednoznaczna (węzeł z dwoma aparatami dochodzącymi), cykl,
    droga bez żadnego łącznika toru. Funkcja czysta.
    """
    dochodzace: dict[str, list[tuple[str, str, str]]] = {}
    for ref, rodzaj, porty in aparaty:
        if PORTY_APARATU_POLA.get(rodzaj, ()) != (PORT_WEJSCIA, PORT_WYJSCIA):
            continue
        we, wy = porty.get(PORT_WEJSCIA), porty.get(PORT_WYJSCIA)
        if we is not None and wy is not None:
            dochodzace.setdefault(wy, []).append((ref, rodzaj, we))
    wynik: dict[str, frozenset[str]] = {}
    for ref, rodzaj, porty in aparaty:
        if rodzaj != RODZAJ_UZIEMNIKA:
            continue
        laczniki = _laczniki_do_odlaczenia(porty.get(PORT_PRZYLACZA), dochodzace)
        if laczniki is not None:
            wynik[ref] = laczniki
    return wynik


def _laczniki_do_odlaczenia(
    wezel: str | None, dochodzace: Mapping[str, Sequence[tuple[str, str, str]]]
) -> frozenset[str] | None:
    """Łączniki toru od węzła w stronę szyny do pierwszego odłączającego włącznie; ``None`` =
    brak wniosku (brak węzła, węzeł szyny — uziemnik szyn nie jest uziemnikiem pola, droga
    niejednoznaczna albo urwana, cykl, droga do szyny bez łącznika odłączającego)."""
    if wezel is None or wezel == WEZEL_SZYNY:
        return None
    laczniki: list[str] = []
    odwiedzone: set[str] = set()
    while wezel != WEZEL_SZYNY:
        if wezel in odwiedzone:
            return None
        odwiedzone.add(wezel)
        wejscia = dochodzace.get(wezel, ())
        if len(wejscia) != 1:
            return None
        ref, rodzaj, poprzedni = wejscia[0]
        if rodzaj in RODZAJE_LACZNIKOW_TORU:
            laczniki.append(ref)
            if rodzaj in RODZAJE_LACZNIKOW_ODLACZAJACYCH:
                return frozenset(laczniki)
        wezel = poprzedni
    # Szyna osiągnięta bez łącznika odłączającego: uziemiany odcinek nie ma przerwy
    # izolacyjnej w polu — wszystkie łączniki drogi (wyłącznik wysuwny: jego wysunięcie).
    return frozenset(laczniki) if laczniki else None
