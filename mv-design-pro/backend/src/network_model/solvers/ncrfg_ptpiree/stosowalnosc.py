"""Stosowalność wymagań i testów PTPiREE — JEDNO źródło predykatów (plan AB O-31, O-34).

Dwa miejsca czytają stosowalność: solver (czy test jest wymagany) i ocena zgodności per
wymaganie (``application/ncrfg_compliance/ocena_wymagan.py``: czy wymaganie dotyczy modułu
i czym jest wykazywane). Reguła predykatów parami: oba miejsca wołają TE funkcje, więc test
nigdy nie jest „wymagany, bo wykazuje wymaganie X", gdy wymaganie X nie dotyczy modułu.

``stosowalnosc_wymagania`` — typ modułu (klasyfikacja krajowa z podstawą progów) ×
technologia (magazyn energii poza rozporządzeniem 2016/631 — art. 3 ust. 2 lit. d) × moduł
istniejący (art. 4) × prawo operatora do określenia wymagania (``operator_skorzystal_z_prawa``:
``False`` → nie dotyczy; ``None`` → dotyczy, a ocena wymagań podmienia podstawę na
nieustalone wykonanie prawa).

``stosowalnosc_testu`` — wymuszenie w programie szczegółowym × klasyfikacja × technologia ×
moduł istniejący × „test wykazuje stosowalne wymaganie" (``sposob_wykazania == "TEST"``) ×
zakres procedury (``default_for_modules``) × „wymagany bez certyfikatu"
(``required_without_certificate_for``) × zdolności dodatkowe wskazane w programie (T18).
Stosowalność NIGDY nie zależy od obecności danych — brak danej przy teście wymaganym to ocena
niewykonana z nazwanym brakiem, nie „test niewymagany".

Moduł jest odczytem profilu i danych modułu: zero fizyki, zero liczb kryterium.
"""

from __future__ import annotations

from collections.abc import Sequence

from catalog.profiles.nc_rfg import (
    KlasyfikacjaModulu,
    SposobWykazania,
    Technologia,
    WymaganieRegulacyjne,
)
from werdykt.kontrakt import PodstawaWymagania, RodzajPodstawy, Stosowalnosc

from .contracts import DowodCertyfikatu, NcRfgPtpireeModuleInput, NcRfgPtpireeTestDefinition

#: Rodzaje podstaw wymagań wynikających z rozporządzenia 2016/631 (warstwy NC RfG, WOS,
#: procedury PTPiREE i warstwa zastana) — obejmuje je wyłączenie magazynów (art. 3 ust. 2
#: lit. d) i modułów istniejących (art. 4). Wymagania warstwy magazynów (rodzaj OSD) nie.
RODZAJE_Z_ROZPORZADZENIA: frozenset[RodzajPodstawy] = frozenset(
    ("ROZPORZADZENIE_UE", "WOS", "PROCEDURA_PTPIREE", "NIEUSTALONA")
)

#: Nazwy technologii w tekście (dopełniacz przymiotnikowy: „moduł …").
NAZWA_TECHNOLOGII_PL: dict[Technologia, str] = {
    "PPM": "moduł parku energii",
    "SPGM": "synchroniczny moduł wytwarzania energii",
    "MAGAZYN": "magazyn energii",
}

POWOD_MAGAZYNU_PL = (
    "magazyn energii — art. 3 ust. 2 lit. d rozporządzenia 2016/631 wyłącza urządzenia "
    "magazynujące z zakresu wymagań rozporządzenia; wymagania krajowe dla magazynów należą "
    "do warstwy magazynów profilu"
)
POWOD_MODULU_ISTNIEJACEGO_PL = (
    "moduł istniejący w rozumieniu art. 4 ust. 1 rozporządzenia 2016/631 — wymagania "
    "rozporządzenia nie mają zastosowania bez modernizacji; podstawa: warstwa NC RfG, art. 4"
)
POWOD_WYMUSZENIA_PL = "test wymuszony w programie szczegółowym badań modułu"


def certyfikat_pokrywa(dowod: DowodCertyfikatu | None, klasyfikacja: KlasyfikacjaModulu) -> bool:
    """Czy moduł ma certyfikat z wykazu PTPiREE obejmujący jego typ (jeden predykat)."""
    return dowod is not None and dowod.pokrywa(klasyfikacja.modul)


def _z_rozporzadzenia(wymaganie: WymaganieRegulacyjne) -> bool:
    return wymaganie.zrodlo.rodzaj in RODZAJE_Z_ROZPORZADZENIA


def _opis_modulu(klasyfikacja: KlasyfikacjaModulu, technologia: Technologia) -> str:
    return f"typ {klasyfikacja.modul}, {NAZWA_TECHNOLOGII_PL[technologia]}"


def stosowalnosc_wymagania(
    wymaganie: WymaganieRegulacyjne,
    *,
    klasyfikacja: KlasyfikacjaModulu,
    technologia: Technologia,
    modul_istniejacy: bool | None,
    operator_name_pl: str,
) -> Stosowalnosc:
    """Czy wymaganie profilu dotyczy modułu — reguły w kolejności od najmocniejszej.

    1. moduł poniżej progu istotności (klasa ``None``) → nie dotyczy (powód i podstawa
       klasyfikacji);
    2. magazyn energii wobec wymagania z rozporządzenia → nie dotyczy (art. 3 ust. 2 lit. d);
    3. typ modułu poza zakresem wymagania → nie dotyczy (podstawa: progi klas);
       technologia poza zakresem → nie dotyczy (podstawa: wymaganie);
    4. moduł istniejący (art. 4) wobec wymagania z rozporządzenia → nie dotyczy;
    5. prawo operatora do określenia wymagania, z którego operator nie skorzystał
       (``False``) → nie dotyczy (podstawa: wykonanie prawa w warstwie OSD);
    6. w przeciwnym razie dotyczy (podstawa: progi klas; wykonanie prawa nieustalone jest
       nazwane w powodzie — ocena wymagań podmienia podstawę wymagania).
    """
    typ = klasyfikacja.modul

    def wynik(dotyczy: bool, powod_pl: str, podstawa: PodstawaWymagania | None) -> Stosowalnosc:
        return Stosowalnosc(
            typ_modulu=typ,
            # Nazwa technologii (tekst rekordu), nie kod — kod zostaje w wejściu modułu.
            technologia=NAZWA_TECHNOLOGII_PL[technologia],
            modul_istniejacy=modul_istniejacy,
            dotyczy=dotyczy,
            powod_pl=powod_pl,
            podstawa=podstawa,
        )

    if typ is None:
        return wynik(
            False,
            klasyfikacja.powod_pl,
            podstawa=klasyfikacja.podstawa,
        )
    if technologia == "MAGAZYN" and _z_rozporzadzenia(wymaganie):
        return wynik(False, POWOD_MAGAZYNU_PL, None)
    if typ not in wymaganie.typy:
        return wynik(
            False,
            (
                f"wymaganie dotyczy modułów typu {', '.join(wymaganie.typy)}; oceniany moduł: "
                f"{_opis_modulu(klasyfikacja, technologia)} ({klasyfikacja.powod_pl})"
            ),
            podstawa=klasyfikacja.podstawa,
        )
    if technologia not in wymaganie.technologie:
        zakres = ", ".join(NAZWA_TECHNOLOGII_PL[t] for t in wymaganie.technologie)
        return wynik(
            False,
            (
                f"wymaganie dotyczy technologii: {zakres}; oceniany moduł jest "
                f"{NAZWA_TECHNOLOGII_PL[technologia]}"
            ),
            podstawa=wymaganie.zrodlo,
        )
    if modul_istniejacy is True and _z_rozporzadzenia(wymaganie):
        return wynik(False, POWOD_MODULU_ISTNIEJACEGO_PL, None)
    if wymaganie.prawo_operatora and wymaganie.operator_skorzystal_z_prawa is False:
        return wynik(
            False,
            (
                f"operator {operator_name_pl} nie skorzystał z prawa określenia wymagania "
                f"({wymaganie.zrodlo.jednostka_redakcyjna or wymaganie.id}) — wymaganie nie "
                "ma zastosowania"
            ),
            podstawa=wymaganie.wykonanie_prawa_zrodlo,
        )
    powod = (
        f"wymaganie dotyczy modułów typu {', '.join(wymaganie.typy)}; oceniany moduł: "
        f"{_opis_modulu(klasyfikacja, technologia)} ({klasyfikacja.powod_pl})"
    )
    if wymaganie.prawo_operatora and wymaganie.operator_skorzystal_z_prawa is None:
        powod += (
            f"; wykonanie przez operatora {operator_name_pl} prawa określenia wymagania "
            "nieustalone — wymaganie oceniane jako obowiązujące"
        )
    return wynik(True, powod, klasyfikacja.podstawa)


def sposob_wykazania_wymagania(
    wymaganie: WymaganieRegulacyjne,
    stosowalnosc: Stosowalnosc,
    *,
    klasyfikacja: KlasyfikacjaModulu,
    technologia: Technologia,
    certyfikat: DowodCertyfikatu | None,
) -> SposobWykazania:
    """Sposób wykazania wymagania dla modułu: ``NIE_DOTYCZY`` dla wymagania niestosowalnego,
    inaczej predykat profilu ``WymaganieRegulacyjne.sposob_wykazania`` z certyfikatem
    zweryfikowanym po stronie serwera (rekord wykazu obejmujący typ modułu)."""
    if not stosowalnosc.dotyczy:
        return "NIE_DOTYCZY"
    return wymaganie.sposob_wykazania(
        klasyfikacja.modul, technologia, certyfikat_pokrywa(certyfikat, klasyfikacja)
    )


def _wymagane_zdolnosci_dodatkowe(modul: NcRfgPtpireeModuleInput) -> list[str]:
    zdolnosci = (
        ("praca wyspowa", modul.island_operation_required),
        ("rozruch autonomiczny", modul.black_start_required),
        ("tłumienie oscylacji mocy", modul.power_oscillation_damping_required),
    )
    return [nazwa for nazwa, wymagana in zdolnosci if wymagana]


def stosowalnosc_testu(
    definicja: NcRfgPtpireeTestDefinition,
    wymagania_testu: Sequence[WymaganieRegulacyjne],
    *,
    wymuszony: bool,
    modul: NcRfgPtpireeModuleInput,
    klasyfikacja: KlasyfikacjaModulu,
    technologia: Technologia,
    certyfikat: DowodCertyfikatu | None,
    operator_name_pl: str,
) -> Stosowalnosc:
    """JEDYNA funkcja stosowalności testu (O-34) — reguły w kolejności od najmocniejszej.

    1. wymuszenie w programie szczegółowym → dotyczy;
    2. klasa ``None`` (moduł poniżej progu istotności) → nie dotyczy (powód klasyfikacji);
    3. magazyn energii → nie dotyczy (art. 3 ust. 2 lit. d — procedura PTPiREE wykazuje
       wymagania rozporządzenia);
    4. moduł istniejący (art. 4) → nie dotyczy;
    5. test wykazuje wymaganie stosowalne do modułu, którego nie pokrywa certyfikat
       (``sposob_wykazania_wymagania == "TEST"``) → dotyczy;
    6. zakres procedury dla typu (``default_for_modules``) → dotyczy;
    7. procedura wymaga testu dla typu przy braku certyfikatu obejmującego typ
       (``required_without_certificate_for``) → dotyczy;
    8. zdolność dodatkowa wskazana w programie szczegółowym (T18) → dotyczy;
    9. w przeciwnym razie nie dotyczy (powód nazywa wszystkie sprawdzone reguły).
    """
    typ = klasyfikacja.modul

    def wynik(dotyczy: bool, powod_pl: str, podstawa: PodstawaWymagania | None) -> Stosowalnosc:
        return Stosowalnosc(
            typ_modulu=typ,
            # Nazwa technologii (tekst rekordu), nie kod — kod zostaje w wejściu modułu.
            technologia=NAZWA_TECHNOLOGII_PL[technologia],
            modul_istniejacy=modul.modul_istniejacy,
            dotyczy=dotyczy,
            powod_pl=powod_pl,
            podstawa=podstawa,
        )

    if wymuszony:
        return wynik(True, POWOD_WYMUSZENIA_PL, None)
    if typ is None:
        return wynik(
            False,
            klasyfikacja.powod_pl,
            podstawa=klasyfikacja.podstawa,
        )
    if technologia == "MAGAZYN":
        return wynik(False, POWOD_MAGAZYNU_PL, None)
    if modul.modul_istniejacy is True:
        return wynik(False, POWOD_MODULU_ISTNIEJACEGO_PL, None)
    wykazywane = [
        wymaganie
        for wymaganie in wymagania_testu
        if sposob_wykazania_wymagania(
            wymaganie,
            stosowalnosc_wymagania(
                wymaganie,
                klasyfikacja=klasyfikacja,
                technologia=technologia,
                modul_istniejacy=modul.modul_istniejacy,
                operator_name_pl=operator_name_pl,
            ),
            klasyfikacja=klasyfikacja,
            technologia=technologia,
            certyfikat=certyfikat,
        )
        == "TEST"
    ]
    podstawa: PodstawaWymagania = klasyfikacja.podstawa
    modul_opis = _opis_modulu(klasyfikacja, technologia)
    if wykazywane:
        opis = "; ".join(w.nazwa_pl for w in wykazywane)
        return wynik(
            True,
            (
                f"test wykazuje wymaganie stosowalne do modułu ({modul_opis}), którego nie "
                f"pokrywa certyfikat urządzenia z wykazu PTPiREE: {opis}"
            ),
            podstawa=podstawa,
        )
    if typ in definicja.default_for_modules:
        return wynik(
            True,
            f"zakres procedury PTPiREE dla modułu typu {typ} ({modul_opis})",
            podstawa=podstawa,
        )
    if typ in definicja.required_without_certificate_for and not certyfikat_pokrywa(
        certyfikat, klasyfikacja
    ):
        return wynik(
            True,
            (
                f"procedura PTPiREE wymaga testu dla modułu typu {typ} bez certyfikatu "
                "urządzenia z wykazu PTPiREE obejmującego ten typ"
            ),
            podstawa=podstawa,
        )
    zdolnosci = _wymagane_zdolnosci_dodatkowe(modul) if definicja.test_id == "T18" else []
    if zdolnosci:
        return wynik(
            True,
            ("program szczegółowy wskazuje wymaganą zdolność dodatkową: " + ", ".join(zdolnosci)),
            podstawa=None,
        )
    zakres = ", ".join(definicja.default_for_modules) or "brak typów"
    return wynik(
        False,
        (
            f"test nie jest wymagany dla modułu ({modul_opis}): nie wykazuje żadnego wymagania "
            f"profilu stosowalnego do modułu bez pokrycia certyfikatem, zakres procedury "
            f"obejmuje typy: {zakres}, a program szczegółowy go nie wymusza"
        ),
        podstawa=podstawa,
    )
