"""Nakladka ROZNIC A/B na schemacie: porownanie zwarciowe -> kontrakt overlay v1.

CZYM JEST TA WARSTWA. Mapperem. Bierze GOTOWE porownanie dwoch przebiegow
(`domain.zwarcia_porownanie.ZwarciaPorownanie` — delty policzone w domenie) i
ukladajac je w kontrakt `ResultsContractV1` (`domain/result_contract_v1.py`)
oddaje dokladnie ten ksztalt, ktory warstwa wynikowa schematu juz czyta dla
zwyklych przebiegow (`elements[ref].metrics[kod]` + `severity`). Dzieki temu
roznice rysuje TA SAMA warstwa etykiet co wyniki pojedynczego przebiegu —
zero rownoleglego kanalu renderu.

ZERO FIZYKI. Tu nie powstaje ani jedna wielkosc elektryczna: wartosci przychodza
z dwoch zestawow wynikow, roznice policzyla domena. Ta warstwa wybiera refy,
jednostki i podpowiedzi formatu — czyli PREZENTACJE gotowych liczb.

DLACZEGO POWSTALA (dlug „klient bez dostawcy", V12K-326). Klient nakladki delta
wolal `/api/execution/comparisons/{id}/sld-delta-overlay` — trase, ktorej ZADEN
router nie serwuje: modul `api/batch_execution.py` nie jest wpiety w `main.py`,
a stojaca za nim usluga (`ScComparisonService` nad `ExecutionEngineService`)
trzyma przebiegi we WLASNEJ pamieci, do ktorej produkcyjna sciezka
(`enm/canonical_analysis.py`) niczego nie zapisuje. Samo wpiecie routera dalo by
wiec koncowke odpowiadajaca „nie znaleziono przebiegu" na KAZDY realny
identyfikator — trase zywa formalnie, martwa faktycznie. Dostawca stoi wiec tam,
gdzie stoi ZYWE porownanie zwarciowe ekranu porownan
(`/api/short-circuit-comparisons`), i korzysta z tego samego wyniku domeny.

REF NA SCHEMACIE. Punkt zwarcia ma dwa identyfikatory: `target_id` (wezel grafu
przebiegu) i `element_id` (element modelu). Nakladka adresuje elementy schematu,
wiec bierze `element_id`, a przy jego braku (starszy wynik) schodzi na
`target_id`. To DOKLADNIE regula akcji „Pokaz na schemacie" ekranu zwarc
(`pokazNaSchemacie.ts`: `row.element_id ?? row.target_id`) — jedno zrodlo prawdy
dla tozsamosci punktu na schemacie.

DETERMINIZM. Elementy wstawiane w kolejnosci rosnacej po refie, metryki w stalej
kolejnosci priorytetu, brak wartosci = brak metryki (nigdy zero zastepcze).
Ten sam wynik porownania daje identyczny payload i identyczny `content_hash`.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

from domain.result_contract_v1 import (
    OverlayElementKind,
    OverlayElementV1,
    OverlayLegendEntryV1,
    OverlayLegendV1,
    OverlayMetricSource,
    OverlayMetricV1,
    OverlayPayloadV1,
    OverlaySeverity,
)
from domain.zwarcia_porownanie import OBECNY_W_OBU, PunktZwarciowyDiff, ZwarciaPorownanie

#: Rodzaj analizy nakladki. Prefiks „DELTA_" jest KONTRAKTOWY — po nim warstwa
#: prezentacji rozpoznaje rodzine szablonow etykiet roznicowych (podpisy „Δ Ik″"
#: zamiast „Ik″"), wiec roznica NIGDY nie moze zostac wzieta za wartosc
#: bezwzgledna.
RODZAJ_ANALIZY = "DELTA_SC"

#: Metryki roznicowe w KOLEJNOSCI PRIORYTETU (pierwsza = najwazniejsza na
#: schemacie). Krotka: (kod, atrybut punktu, jednostka, podpowiedz formatu).
#: Kody sa WLASNE dla roznic (`DELTA_*`) — nie moga kolidowac z kodami wartosci
#: bezwzglednych (`IK_3F_A` itd.), zeby zadna warstwa nie pomylila delty
#: z wielkoscia.
METRYKI_ROZNICOWE: tuple[tuple[str, str, str, str], ...] = (
    ("DELTA_IK_3F_KA", "delta_ikss_ka", "kA", "fixed2"),
    ("DELTA_IK_3F_PCT", "delta_ikss_percent", "%", "fixed1"),
    ("DELTA_IP_KA", "delta_ip_ka", "kA", "fixed2"),
    ("DELTA_ITH_KA", "delta_ith_ka", "kA", "fixed2"),
    ("DELTA_SK_MVA", "delta_sk_mva", "MVA", "fixed1"),
)

#: Wartosci BEZWZGLEDNE przebiegu B (stanu, ktory schemat pokazuje) — karta
#: S9-13: etykieta roznicy bez wartosci, ktorej dotyczy, zmusza projektanta do
#: rachunku w glowie („+0,4 kA wzgledem czego?"). Kody `B_*` sa WLASNE (nie
#: koliduja ani z `DELTA_*`, ani z kodami pojedynczego przebiegu `IK_3F_A`
#: itd.), a podpis po stronie prezentacji niesie „(B)".
#:
#: PREDYKATY PARAMI (regula KLASA-NIE-INSTANCJA pkt 3): wartosci B sa WYLACZNIE
#: WYSWIETLANE — o wadze punktu („czy sie zmienil") i o licznikach czterech grup
#: decyduja METRYKI ROZNICOWE. Punkt bez ani jednej roznicy NIE wchodzi do
#: nakladki, nawet gdy ma wartosci B (element z sama wartoscia B sugerowalby
#: „bez zmian" tam, gdzie prawda jest „brak danych").
METRYKI_WARTOSCI_B: tuple[tuple[str, str, str, str], ...] = (
    ("B_IK_3F_KA", "ikss_ka_b", "kA", "fixed2"),
    ("B_IP_KA", "ip_ka_b", "kA", "fixed2"),
    ("B_ITH_KA", "ith_ka_b", "kA", "fixed2"),
    ("B_SK_MVA", "sk_mva_b", "MVA", "fixed1"),
)

#: Legenda nakladki (polska, autorytatywna po stronie backendu — warstwa
#: prezentacji legendy NIE wymysla). Dwa wpisy, bo dwa stany maja punkty
#: WSPOLNE; punkty bez odpowiednika nie trafiaja do nakladki w ogole (nie
#: istnieje dla nich zadna roznica) i sa raportowane LICZBA.
LEGENDA_ROZNIC = OverlayLegendV1(
    title="Legenda roznic A/B",
    entries=[
        OverlayLegendEntryV1(
            severity=OverlaySeverity.INFO,
            label="Bez zmian",
            description="Wszystkie porownywane wielkosci identyczne w obu przebiegach",
        ),
        OverlayLegendEntryV1(
            severity=OverlaySeverity.WARNING,
            label="Zmiana",
            description="Co najmniej jedna wielkosc rozni sie miedzy przebiegami",
        ),
    ],
)


@dataclass(frozen=True)
class NakladkaRoznic:
    """Nakladka roznic gotowa do wystawienia przez API.

    `payload` niesie elementy i legende w kontrakcie overlay v1; liczniki dziela
    WSZYSTKIE punkty porownania na cztery rozlaczne grupy (suma = liczba punktow
    porownania — inwariant przybity testem): zmienione, bez zmian, bez
    odpowiednika w drugim przebiegu i wspolne, ale bez ani jednej porownywalnej
    wielkosci. Dwie ostatnie grupy NIE sa elementami nakladki (nie istnieje dla
    nich roznica), za to ich liczba jest jawna — brak nie moze byc niemy.
    """

    payload: OverlayPayloadV1
    liczba_punktow_zmienionych: int
    liczba_punktow_bez_zmian: int
    liczba_punktow_bez_odpowiednika: int
    liczba_punktow_bez_danych: int

    def content_hash(self) -> str:
        """Odcisk tresci nakladki (SHA-256 po kanonicznym JSON-ie).

        Ten sam wzorzec co pozostale odciski w systemie. Determinizm wynika
        z kolejnosci wstawiania elementow (rosnaco po refie) i stalej kolejnosci
        metryk.
        """
        return hashlib.sha256(
            self.payload.model_dump_json(exclude_none=False).encode("utf-8")
        ).hexdigest()


def ref_punktu_na_schemacie(punkt: PunktZwarciowyDiff) -> str:
    """Ref elementu schematu dla punktu zwarcia (`element_id`, inaczej `target_id`).

    JEDNO ZRODLO PRAWDY dla tozsamosci punktu na schemacie — ta sama regula co
    w akcji „Pokaz na schemacie" ekranu zwarc.
    """
    return punkt.element_id or punkt.target_id


def _metryki_wg_tabeli(
    punkt: PunktZwarciowyDiff,
    tabela: tuple[tuple[str, str, str, str], ...],
) -> dict[str, OverlayMetricV1]:
    """Metryki punktu wg tabeli (kod, atrybut, jednostka, format).

    Wielkosc nieobecna w punkcie NIE dostaje metryki (punkt bez odpowiednika,
    starszy wynik bez pola, A = 0 przy procencie). Wtedy metryki NIE MA —
    konsument pokaze brak, nigdy zera zastepczego.
    """
    metryki: dict[str, OverlayMetricV1] = {}
    for kod, atrybut, jednostka, format_hint in tabela:
        wartosc = getattr(punkt, atrybut)
        if wartosc is None:
            continue
        metryki[kod] = OverlayMetricV1(
            code=kod,
            value=wartosc,
            unit=jednostka,
            format_hint=format_hint,
            source=OverlayMetricSource.SOLVER,
        )
    return metryki


def _metryki_punktu(punkt: PunktZwarciowyDiff) -> dict[str, OverlayMetricV1]:
    """Metryki ROZNICOWE punktu — jedyne zrodlo wagi i licznikow grup."""
    return _metryki_wg_tabeli(punkt, METRYKI_ROZNICOWE)


def _metryki_wartosci_b(punkt: PunktZwarciowyDiff) -> dict[str, OverlayMetricV1]:
    """Wartosci bezwzgledne przebiegu B — WYLACZNIE do wyswietlenia (S9-13).

    NIE wolno ich mieszac do predykatu wagi ani licznikow: wartosc bezwzgledna
    jest niezerowa niemal zawsze, wiec kazdy punkt „bez zmian" staly by sie
    „zmieniony". Para (predykat, zbior pokazany) ma jedno zrodlo — METRYKI
    ROZNICOWE.
    """
    return _metryki_wg_tabeli(punkt, METRYKI_WARTOSCI_B)


def _severity_punktu(metryki: dict[str, OverlayMetricV1]) -> OverlaySeverity:
    """Waga punktu WYLACZNIE z metryk, ktore faktycznie trafily do nakladki.

    Predykat „czy sie zmienil" i zbior pokazanych roznic musza pochodzic z
    JEDNEGO zrodla: gdyby wage liczyc z pol punktu, a metryki z innego zbioru,
    element moglby zostac pokolorowany jako zmieniony BEZ ani jednej widocznej
    roznicy (albo odwrotnie).
    """
    zmiana = any(float(m.value) != 0.0 for m in metryki.values())
    return OverlaySeverity.WARNING if zmiana else OverlaySeverity.INFO


def zbuduj_nakladke_roznic(porownanie: ZwarciaPorownanie) -> NakladkaRoznic:
    """Zbuduj nakladke roznic A/B ze zbudowanego porownania zwarciowego.

    Do nakladki trafiaja WYLACZNIE punkty obecne w OBU przebiegach — tylko dla
    nich roznica istnieje. Punkt wspolny, ktory nie niesie ani jednej roznicy
    (starszy wynik bez wielkosci), rowniez nie trafia do nakladki: element bez
    metryk nie ma czego pokazac, a jego obecnosc sugerowalaby „bez zmian" tam,
    gdzie prawda jest „brak danych".

    Wszystkie cztery liczniki pochodza z TEJ SAMEJ petli, wiec ich suma zawsze
    rowna sie liczbie punktow porownania. Liczenie ich osobno (np. sieroty
    z licznikow porownania, reszta stad) daloby dwa niezalezne zrodla prawdy
    o jednym zbiorze — dokladnie ta klasa rozjazdu, ktora ta karta zamyka.
    """
    elementy: dict[str, OverlayElementV1] = {}
    zmienione = 0
    bez_zmian = 0
    bez_odpowiednika = 0
    bez_danych = 0

    for punkt in sorted(porownanie.punkty, key=ref_punktu_na_schemacie):
        if punkt.obecny_w != OBECNY_W_OBU:
            bez_odpowiednika += 1
            continue
        metryki = _metryki_punktu(punkt)
        if not metryki:
            bez_danych += 1
            continue
        # Waga i liczniki WYLACZNIE z metryk roznicowych (predykaty parami) —
        # wartosci B doklejane PO rozstrzygnieciu, jako tresc do wyswietlenia.
        severity = _severity_punktu(metryki)
        if severity == OverlaySeverity.WARNING:
            zmienione += 1
        else:
            bez_zmian += 1
        metryki.update(_metryki_wartosci_b(punkt))
        ref = ref_punktu_na_schemacie(punkt)
        elementy[ref] = OverlayElementV1(
            ref_id=ref,
            kind=OverlayElementKind.BUS,
            badges=[],
            metrics=metryki,
            severity=severity,
        )

    return NakladkaRoznic(
        payload=OverlayPayloadV1(elements=elementy, legend=LEGENDA_ROZNIC, warnings=[]),
        liczba_punktow_zmienionych=zmienione,
        liczba_punktow_bez_zmian=bez_zmian,
        liczba_punktow_bez_odpowiednika=bez_odpowiednika,
        liczba_punktow_bez_danych=bez_danych,
    )
