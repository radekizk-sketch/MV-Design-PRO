"""Dobór aparatu pola do prądu roboczego i klasy napięciowej — etap materializacji.

WARSTWA DOMENY (NOT-A-SOLVER). Moduł nie liczy fizyki sieci: porównuje dane
katalogowe z prądem roboczym policzonym z tabliczki i z napięciem szyny, na
której pole powstaje. Żadnej iteracji, żadnej impedancji, żadnego zwarcia.

PO CO TO ISTNIEJE. Kreator i biblioteka szablonów materializują pola stacji
ZANIM istnieje kompletny model, po którym da się policzyć prąd zwarciowy.
Pole bez wiązania katalogowego blokuje gotowość inżynierską (`switch.catalog_ref_missing`),
więc na tym etapie potrzebny jest dobór z danych, które JUŻ SĄ: tabliczka
transformatora albo przekształtnika + napięcie szyny.

DWA ETAPY DOBORU, ŚWIADOMIE ROZDZIELONE — i to jest granica tego modułu:

  * TU (materializacja): klasa napięciowa + prąd roboczy ciągły. Warunek
    KONIECZNY. Wynik niesie jawną listę kryteriów ODŁOŻONYCH.
  * `application.analyses.nn_device_selection` (analiza, gotowy model): pełny
    dobór normatywny nN — Ib ≤ In ≤ Iz′, I2 ≤ 1,45·Iz′, Icu ≥ Ik″max, SWZ przy
    Ik_min. Tam są cztery kryteria, bo tam JEST czym je policzyć.

To NIE jest dwie ścieżki tej samej fizyki (dług architektoniczny), tylko dwa
różne zadania: pre-dobór z tabliczki i weryfikacja normatywna z modelu. Ten
moduł NIE powiela kryteriów tamtego i nie wystawia werdyktu normatywnego.

DLACZEGO W `domain/`, A NIE W `application/`. Moduł wołają OBIE strony: warstwa
aplikacji (materializacja szablonu stacji) i warstwa operacji domenowych
(`enm.domain_operations_v2`, gdzie dopiero rozstrzyga się, po której stronie
transformatora blokowego wisi przekształtnik). Umieszczenie go w `application/`
wymuszałoby import w górę warstw albo — gorzej — drugą kopię reguły doboru.
Precedens tej samej klasy: `domain/dobor_przekladnika.py`.

ZERO FABRYKACJI (§20 kanonu). Brak pozycji spełniającej warunki zwraca
``None`` z uzasadnieniem. Pole powstaje wtedy BEZ wiązania, a gotowość
inżynierska słusznie zostaje zablokowana. Związanie aparatu mniejszego niż prąd
roboczy albo o niższej klasie napięciowej byłoby wpisaniem do projektu
urządzenia niezdolnego do pracy w tym miejscu.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

#: Górna granica niskiego napięcia wg IEC 60038 (≤ 1000 V AC). Powyżej — SN.
GRANICA_NN_KV = 1.0

#: Przestrzenie katalogu aparatury pola.
PRZESTRZEN_APARAT_NN = "APARAT_NN"
PRZESTRZEN_APARAT_SN = "APARAT_SN"

#: Szereg napięć najwyższych urządzenia ``U_m`` wg IEC 60038 tab. 3 / IEC 62271-1,
#: przypisany do napięcia znamionowego sieci ``U_n``. Aparat SN dobiera się do
#: ``U_m`` sieci, nie do ``U_n``: rodzina „12 / 17,5 / 24 kV" JEST z definicji
#: normy napięciem najwyższym urządzenia, więc sieć 15 kV wymaga aparatu 17,5 kV,
#: a NIE 12 kV. Mapa jest ZAMKNIĘTA — napięcie spoza szeregu nie dostaje
#: domyślnego ``U_m``, tylko odmowę doboru (patrz `napiecie_najwyzsze_sieci_kv`).
SZEREG_U_M_KV: dict[float, float] = {
    3.0: 3.6,
    6.0: 7.2,
    10.0: 12.0,
    15.0: 17.5,
    20.0: 24.0,
    30.0: 36.0,
    35.0: 40.5,
}

#: Rodzaje aparatu w katalogu APARAT_NN / APARAT_SN dla ról pola.
RODZAJ_WYLACZNIK_GLOWNY_NN = "WYLACZNIK_GLOWNY"
RODZAJ_WYLACZNIK_ODPLYWOWY_NN = "WYLACZNIK_ODPLYWOWY"
RODZAJ_WYLACZNIK_SN = "WYLACZNIK"

#: Kryteria, których na etapie materializacji NIE DA SIĘ sprawdzić — nazwane
#: jawnie w wyniku, żeby „dobrano" nie znaczyło „dobór kompletny".
KRYTERIUM_ICU = (
    "zdolność wyłączalna Icu wobec spodziewanego prądu zwarciowego w miejscu "
    "zabudowy (IEC 60947-2 / IEC 62271-100) — prąd zwarciowy nie jest policzony "
    "na etapie materializacji, sprawdza to warstwa zabezpieczeń/SWZ na gotowym modelu"
)
KRYTERIUM_OBCIAZALNOSC = (
    "obciążalność prądowa długotrwała toru Iz′ z uwzględnieniem warunków "
    "ułożenia (IEC 60364-4-43) — tor odpływowy nie jest jeszcze zdefiniowany"
)
KRYTERIUM_SELEKTYWNOSC = (
    "selektywność i zabezpieczenie rezerwowe wobec aparatów sąsiednich — "
    "wymaga pasm czasowo-prądowych całego ciągu, dostępnych po zbudowaniu modelu"
)


@dataclass(frozen=True)
class WynikDoboru:
    """Rozstrzygnięcie doboru: pozycja albo UZASADNIONA odmowa.

    ``pozycja is None`` nie jest błędem technicznym ani stanem do obejścia —
    to poprawny wynik inżynierski „nie ma czego związać". ``uzasadnienie`` jest
    ZAWSZE niepuste: odmowa bez powodu byłaby nieaudytowalna.
    """

    przestrzen: str | None
    pozycja: str | None
    uzasadnienie: str
    kryteria_odlozone: tuple[str, ...] = ()

    @property
    def dobrano(self) -> bool:
        return self.pozycja is not None and self.przestrzen is not None


def prad_znamionowy_a(*, moc_mva: float, napiecie_kv: float) -> float | None:
    """``I = S / (√3 · U)`` w amperach; ``None`` gdy dane nie pozwalają liczyć.

    Trzymamy JEDEN wzór w jednym miejscu, bo powtórzony w dwóch ścieżkach
    zaczyna się rozjeżdżać na współczynnikach jednostek.
    """
    if moc_mva <= 0.0 or napiecie_kv <= 0.0:
        return None
    return moc_mva * 1.0e6 / (math.sqrt(3.0) * napiecie_kv * 1.0e3)


def napiecie_najwyzsze_sieci_kv(napiecie_znamionowe_kv: float) -> float | None:
    """``U_m`` sieci SN wg szeregu IEC; ``None`` dla napięcia spoza szeregu.

    Świadomie BEZ zaokrąglania „do najbliższego wyższego": sieć o napięciu,
    którego nie ma w szeregu normy, jest sygnałem błędu danych albo zakresu
    nieobsługiwanego przez produkt. Domyślenie ``U_m`` byłoby wtedy zgadnięciem
    klasy izolacji aparatu — dokładnie tym, czego zakazuje zasada zero
    fabrykacji.
    """
    for u_n, u_m in SZEREG_U_M_KV.items():
        if math.isclose(napiecie_znamionowe_kv, u_n, rel_tol=1e-9, abs_tol=1e-9):
            return u_m
    return None


def przestrzen_aparatu_dla_napiecia(napiecie_kv: float | None) -> str:
    """Przestrzeń katalogu aparatu pola WYNIKAJĄCA z napięcia szyny.

    JEDNO ŹRÓDŁO PRAWDY DLA CAŁEGO ŁAŃCUCHA. Regułę czytają trzy ogniwa, które
    wcześniej miały ją zaszytą osobno, każde na stałe ``APARAT_NN``:

      1. zapis pola źródłowego (`enm.domain_operations_v2`),
      2. sprawdzenie istnienia aparatu przed mutacją (`_blad_aparatu_pola`),
      3. promocja wpisu do realnego łącznika
         (`enm.migrations.nn_field_specs_promocja`).

    Rozjazd któregokolwiek z nich kończył się TAK SAMO i po cichu: wiązanie
    aparatu SN nie materializowało się w przestrzeni nN, więc łącznik powstawał
    bez ``catalog_ref`` i gotowość meldowała `switch.catalog_ref_missing` —
    mimo że pole wiązanie MIAŁO. Dlatego reguła jest tu, a nie w trzech
    miejscach „które dziś się zgadzają".

    Szyna nieznana (``None``) daje ``APARAT_NN``: dotyczy wyłącznie ścieżek,
    które i tak przerwą się dalej na braku szyny — to nie jest domyślny poziom
    napięcia dla realnego pola.
    """
    if napiecie_kv is None or napiecie_kv <= GRANICA_NN_KV:
        return PRZESTRZEN_APARAT_NN
    return PRZESTRZEN_APARAT_SN


def _napiecie_aparatu_nn_kv(aparat: Any) -> float:
    """Znamionowe napięcie łączeniowe ``U_e`` aparatu nN [kV] wg IEC 60947-2.

    Pole ``u_m_kv`` (``U_e`` z karty katalogowej) jest właściwą podstawą doboru
    klasy napięciowej i to ono decyduje, gdy jest podane. ``u_n_kv`` opisuje
    poziom sieci, do którego pozycja została wpisana, i służy wyłącznie jako
    odczyt zastępczy dla wpisów bez ``U_e`` — nigdy jako uzupełnienie „albo".
    """
    u_e = getattr(aparat, "u_m_kv", None)
    if u_e is not None:
        return float(u_e)
    return float(getattr(aparat, "u_n_kv", 0.0) or 0.0)


def _katalog() -> Any | None:
    try:
        from network_model.catalog import get_default_mv_catalog
    except ImportError:  # pragma: no cover - katalog jest twardą zależnością runtime
        return None
    return get_default_mv_catalog()


def _wybierz_najmniejszy(
    kandydaci: list[Any], *, prad_wymagany_a: float
) -> tuple[Any | None, float | None]:
    """Najmniejsza pozycja o ``I_n ≥ prad_wymagany_a`` (remis: po ``id``).

    Przewymiarowanie NIE jest zapasem: nadmiarowy ``I_n`` podnosi nastawy członu
    zwłocznego i psuje selektywność wobec aparatów za polem, więc „największy,
    jaki jest" nie jest doborem. Remis rozstrzygany po ``id``, żeby kolejność
    iteracji katalogu nie mogła zmienić wyniku (reguła determinizmu).
    """
    pasujace = [a for a in kandydaci if float(a.i_n_a) >= prad_wymagany_a]
    if not pasujace:
        najwiekszy = max((float(a.i_n_a) for a in kandydaci), default=None)
        return None, najwiekszy
    return min(pasujace, key=lambda a: (float(a.i_n_a), a.id)), None


def dobierz_aparat_nn(
    *, napiecie_szyny_kv: float, prad_roboczy_a: float, rodzaj: str
) -> WynikDoboru:
    """Aparat pola nN: klasa napięciowa ``U_e ≥ U_szyny``, potem ``I_n ≥ I_rob``.

    KOLEJNOŚĆ WARUNKÓW NIE JEST KOSMETYCZNA. Bramka napięciowa idzie PIERWSZA,
    bo kryterium prądowe samo w sobie przepuszcza aparat o rażąco za niskiej
    klasie izolacji: transformator WN/SN 110/15 kV daje ``I_n = 385 A``, więc
    pierwsza pozycja rodziny nN (400 A, ``U_e = 0,69 kV``) „pasuje" prądowo na
    szynę 15 kV. Rodzina nN kończy się na 690 V, więc dla szyny SN nie ma i nie
    może być dopasowania — aparat takiej szyny należy do rodziny SN.
    """
    katalog = _katalog()
    if katalog is None:
        return WynikDoboru(None, None, "Katalog niedostępny.")
    rodzina = [
        a for a in katalog.list_lv_apparatus_types() if getattr(a, "device_kind", None) == rodzaj
    ]
    if not rodzina:
        return WynikDoboru(
            None, None, f"W katalogu APARAT_NN nie ma rodziny aparatów rodzaju '{rodzaj}'."
        )

    w_klasie = [a for a in rodzina if _napiecie_aparatu_nn_kv(a) >= napiecie_szyny_kv]
    if not w_klasie:
        najwyzsze = max(_napiecie_aparatu_nn_kv(a) for a in rodzina)
        return WynikDoboru(
            None,
            None,
            f"Szyna ma napięcie {napiecie_szyny_kv:.3f} kV, a najwyższe znamionowe napięcie "
            f"łączeniowe w rodzinie '{rodzaj}' katalogu APARAT_NN wynosi {najwyzsze:.3f} kV. "
            f"Dobór nie jest wykonywany: aparat tej szyny należy do rodziny SN, nie nN. "
            f"Pole powstaje bez wiązania — związanie aparatu o niższej klasie napięciowej "
            f"byłoby fabrykacją.",
        )

    wybrany, najwiekszy_a = _wybierz_najmniejszy(w_klasie, prad_wymagany_a=prad_roboczy_a)
    if wybrany is None:
        return WynikDoboru(
            None,
            None,
            f"Prąd roboczy pola wynosi {prad_roboczy_a:.0f} A i przekracza największą pozycję "
            f"rodziny '{rodzaj}' w klasie {napiecie_szyny_kv:.3f} kV "
            f"({(najwiekszy_a or 0.0):.0f} A). Pole powstaje bez wiązania — dobranie mniejszego "
            f"aparatu byłoby fabrykacją urządzenia niezdolnego do przewodzenia prądu roboczego.",
        )
    return WynikDoboru(
        PRZESTRZEN_APARAT_NN,
        wybrany.id,
        f"Prąd roboczy {prad_roboczy_a:.0f} A na szynie {napiecie_szyny_kv:.3f} kV; z pozycji "
        f"rodziny '{rodzaj}' o U_e ≥ {napiecie_szyny_kv:.3f} kV dobrano najmniejszą o "
        f"I_n ≥ tej wartości: {wybrany.id} ({wybrany.i_n_a:.0f} A, "
        f"U_e = {_napiecie_aparatu_nn_kv(wybrany):.3f} kV).",
        kryteria_odlozone=(KRYTERIUM_ICU, KRYTERIUM_OBCIAZALNOSC, KRYTERIUM_SELEKTYWNOSC),
    )


def dobierz_aparat_sn(
    *, napiecie_szyny_kv: float, prad_roboczy_a: float, rodzaj: str = RODZAJ_WYLACZNIK_SN
) -> WynikDoboru:
    """Aparat pola SN: ``U_m(aparatu) ≥ U_m(sieci)``, potem ``I_n ≥ I_rob``.

    ``U_n`` aparatu SN JEST jego ``U_m`` z definicji IEC 62271-1 — rodzina
    „12 / 17,5 / 24 kV" to szereg napięć najwyższych urządzenia, nie napięć
    pracy. Dlatego sieć 15 kV wymaga aparatu 17,5 kV: pozycja 12 kV ma za niską
    klasę izolacji, choć „12 > 15" nikomu nie przyjdzie do głowy sprawdzać, a
    „12 kV do sieci 15 kV" wygląda znajomo.

    RODZAJ APARATU JEST CZĘŚCIĄ DOBORU. Domyślnym rodzajem jest WYŁĄCZNIK, bo
    pole źródłowe DER musi dać się otworzyć przy zwarciu, do którego samo
    dokłada prąd; rozłącznik ani odłącznik nie mają zdolności wyłączania zwarć z
    definicji normy, więc nie są kandydatami na to pole.
    """
    katalog = _katalog()
    if katalog is None:
        return WynikDoboru(None, None, "Katalog niedostępny.")

    u_m_sieci = napiecie_najwyzsze_sieci_kv(napiecie_szyny_kv)
    if u_m_sieci is None:
        return WynikDoboru(
            None,
            None,
            f"Napięcie znamionowe szyny {napiecie_szyny_kv:.3f} kV nie występuje w szeregu "
            f"IEC 60038 ({', '.join(f'{u:g}' for u in sorted(SZEREG_U_M_KV))} kV), więc nie da "
            f"się wskazać wymaganego napięcia najwyższego urządzenia U_m. Dobór nie jest "
            f"wykonywany — domyślenie klasy izolacji byłoby zgadywaniem.",
        )

    rodzina = [
        a for a in katalog.list_mv_apparatus_types() if getattr(a, "device_kind", None) == rodzaj
    ]
    if not rodzina:
        return WynikDoboru(
            None, None, f"W katalogu APARAT_SN nie ma rodziny aparatów rodzaju '{rodzaj}'."
        )

    w_klasie = [a for a in rodzina if float(a.u_n_kv) >= u_m_sieci]
    if not w_klasie:
        najwyzsze = max(float(a.u_n_kv) for a in rodzina)
        return WynikDoboru(
            None,
            None,
            f"Sieć {napiecie_szyny_kv:.3f} kV wymaga aparatu o U_m ≥ {u_m_sieci:.1f} kV, a "
            f"najwyższa klasa w rodzinie '{rodzaj}' katalogu APARAT_SN to {najwyzsze:.1f} kV. "
            f"Pole powstaje bez wiązania — związanie aparatu o niższej klasie izolacji byłoby "
            f"fabrykacją.",
        )

    wybrany, najwiekszy_a = _wybierz_najmniejszy(w_klasie, prad_wymagany_a=prad_roboczy_a)
    if wybrany is None:
        return WynikDoboru(
            None,
            None,
            f"Prąd roboczy pola wynosi {prad_roboczy_a:.0f} A i przekracza największą pozycję "
            f"rodziny '{rodzaj}' w klasie U_m ≥ {u_m_sieci:.1f} kV "
            f"({(najwiekszy_a or 0.0):.0f} A). Pole powstaje bez wiązania — dobranie mniejszego "
            f"aparatu byłoby fabrykacją urządzenia niezdolnego do przewodzenia prądu roboczego.",
        )
    return WynikDoboru(
        PRZESTRZEN_APARAT_SN,
        wybrany.id,
        f"Prąd roboczy {prad_roboczy_a:.0f} A na szynie {napiecie_szyny_kv:.3f} kV "
        f"(U_m sieci {u_m_sieci:.1f} kV wg IEC 60038); z pozycji rodziny '{rodzaj}' o "
        f"U_m ≥ {u_m_sieci:.1f} kV dobrano najmniejszą o I_n ≥ prądu roboczego: {wybrany.id} "
        f"({wybrany.i_n_a:.0f} A, U_m = {wybrany.u_n_kv:.1f} kV).",
        kryteria_odlozone=(KRYTERIUM_ICU, KRYTERIUM_SELEKTYWNOSC),
    )


def dobierz_aparat_pola_zrodlowego(
    *, przestrzen: str, napiecie_szyny_kv: float, moc_zrodla_mva: float
) -> WynikDoboru:
    """Aparat pola źródłowego DER — rodzina WYNIKA z napięcia szyny, nie z założenia.

    DEFEKT, KTÓRY TO NAPRAWIA (pomiar 2026-09-11, 26 z 57 szablonów). Pole
    źródłowe przekształtnika powstawało bez wiązania katalogowego, bo ścieżka
    materializacji żadnego nie podawała, a przestrzeń katalogu była ZASZYTA na
    ``APARAT_NN`` niezależnie od napięcia szyny. Rozkład zmierzony: 66 z 78 pól
    siedzi na szynie 15 kV (przyłączenie przez transformator blokowy, 21–127 A),
    12 na szynie 0,4 kV (prosument, 79 A). Żądanie aparatu 690 V do pola 15 kV
    jest tą samą klasą defektu, co dobór wyłącznika głównego po samym prądzie.

    PRZESTRZEŃ PRZYCHODZI Z ZEWNĄTRZ, I TO JEST CELOWE. Rodziny nie wybiera
    ta funkcja: dostaje ją gotową od wołającego, który wyliczył ją z napięcia
    szyny przez `przestrzen_aparatu_dla_napiecia`. Gdyby liczyła ją sama,
    powstałby drugi, niezależny warunek na to samo — a dwa warunki, które
    „dziś się zgadzają", to defekt czekający na dane brzegowe. Przy okazji
    znacznik pochodzenia zapisywany do migawki pozostaje TĄ SAMĄ nazwą, która
    pojechała do materializacji (bramka `test_znacznik_nie_powstaje_z_payloadu`).

    Napięcie szyny nadal jest potrzebne — nie do wyboru rodziny, tylko do
    sprawdzenia klasy napięciowej WEWNĄTRZ rodziny (``U_e`` dla nN, ``U_m`` dla
    SN) i do policzenia prądu roboczego.
    """
    prad = prad_znamionowy_a(moc_mva=moc_zrodla_mva, napiecie_kv=napiecie_szyny_kv)
    if prad is None:
        return WynikDoboru(
            None,
            None,
            f"Nie da się policzyć prądu roboczego pola: moc źródła {moc_zrodla_mva} MVA, "
            f"napięcie szyny {napiecie_szyny_kv} kV. Dobór nie jest wykonywany.",
        )
    if przestrzen == PRZESTRZEN_APARAT_NN:
        return dobierz_aparat_nn(
            napiecie_szyny_kv=napiecie_szyny_kv,
            prad_roboczy_a=prad,
            rodzaj=RODZAJ_WYLACZNIK_ODPLYWOWY_NN,
        )
    if przestrzen == PRZESTRZEN_APARAT_SN:
        return dobierz_aparat_sn(napiecie_szyny_kv=napiecie_szyny_kv, prad_roboczy_a=prad)
    return WynikDoboru(
        None,
        None,
        f"Przestrzeń katalogu '{przestrzen}' nie jest rodziną aparatury pola "
        f"({PRZESTRZEN_APARAT_NN} albo {PRZESTRZEN_APARAT_SN}). Dobór nie jest wykonywany.",
    )
