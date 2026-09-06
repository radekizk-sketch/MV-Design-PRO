"""Swiezosc wyniku wzgledem modelu — JEDNO zrodlo prawdy dla WSZYSTKICH nakladek.

DLUG, KTORY TEN MODUL ZAMYKA (K-S). Trzy koncowki nakladek SLD obiecywaly
projektantowi status FRESH/OUTDATED/NONE i ZADNA go nie liczyla:

  1. `api/protection_runs.py` — nakladka zabezpieczen meldowala `"FRESH"`
     LITERALEM (komentarz „For now, assume FRESH if run is FINISHED"),
  2. `api/canonical_run_views.py` — nakladka biegu kanonicznego oddawala
     `run.result_status`, czyli pole o wartosci domyslnej `"VALID"`, ktorego
     NIKT w calym repo nigdy nie zmienial (pomiar: brak przypisania innej
     wartosci poza odczytem z bazy) — do tego w innym slowniku niz ten, ktorego
     szuka konsument (`ui/results-inspector/SldOverlay.tsx` porownuje z
     `'OUTDATED'`, wiec baner „Wyniki nieaktualne" nie mogl zapalic sie nigdy),
  3. `api/analysis_runs.py` — koncowka `/analysis-runs/{id}/overlay` status
     WYRZUCALA z odpowiedzi, wiec klient (`ui/results-inspector/api.ts`)
     dopisywal sobie `result_status: 'VALID'` z palca.

Skutek dla projektanta byl w kazdym z trzech przypadkow ten sam: wynik policzony
na modelu sprzed edycji prezentowal sie jak wynik aktualny. To jest gorsze niz
brak statusu, bo wylacza czujnosc.

MECHANIZM (zadnej nowej fizyki, zadnych heurystyk). Odcisk modelu to ten SAM
`compute_enm_hash`, ktorym `enm/canonical_analysis.create_run` znakuje kazdy
bieg (`CanonicalRun.snapshot_hash`). Status powstaje z POROWNANIA odciskow:
zapisanego przy biegu z odciskiem modelu biezacego. `current_model_hash` jest
JEDYNYM wejsciem do „odcisku modelu biezacego" w calym systemie — strona
zapisujaca odcisk przy biegu i strona oceniajaca swiezosc wolaja DOKLADNIE te
sama funkcje (regula predykatow parami: warunek wejscia i wyjscia z jednego
zrodla prawdy).

UCZCIWOSC PRZY BRAKU DANYCH. Bieg zapisany zanim odcisk zaczal byc utrwalany
(albo bieg zwarciowy spoza kanalu kanonicznego) NIE MA kotwicy — i wtedy status
NIE MOZE brzmiec FRESH. Taki przypadek dostaje OUTDATED z kodem przyczyny
nazywajacym stan wprost („nie da sie potwierdzic"), a nie zgadnieta aktualnosc.
Brak wyniku to osobny stan (NONE), niezalezny od modelu.

KOPERTA REWIZJI (CV-2). Bieg kanoniczny niesie odtad `RevisionEnvelope`
(`enm/envelope.py`): numer rewizji modelu, odcisk katalogu i odcisk opcji.
Swiezosc biegu z koperta jest WYPROWADZANA z porownania koperty z biezacym
stanem projektu (`evaluate_envelope_freshness`): rewizja modelu inna → OUTDATED
z LISTA ZMIAN z dziennika (`enm/dziennik_zmian.wpisy_od`) — projektant widzi,
KTORE operacje uniewaznily wynik; odcisk katalogu inny → OUTDATED z przyczyna
„katalog zmieniony" (dotad zmiana typu katalogowego nie uniewazniala niczego).
Bieg bez koperty (zapisany przed CV-2) wraca na sciezke kotwic hashowych — ta
sama funkcja, uczciwie mniej informacji. Zaden pisarz statusu nie jest
potrzebny: ta sama funkcja ocenia bieg w nakladce, w liscie biegow i status
przypadku obliczeniowego (`status_wynikow_przypadku`).
"""

from __future__ import annotations

from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from application.twin_key import klucz_twin_dla_przypadku
from enm.dziennik_zmian import WpisDziennika, wpisy_od
from enm.envelope import RevisionEnvelope
from enm.hash import compute_enm_hash
from enm.klucz_twin import PrzypadekBezProjektuError
from enm.scenariusze import StanScenariusza, czy_scenariusz_przejsciowy
from enm.scenariusze import stan_scenariusza as stan_scenariusza_z_magazynu
from enm.store import get_enm, has_enm
from network_model.catalog.odcisk import odcisk_katalogu_domyslnego


class ResultFreshness(StrEnum):
    """Slownik statusu wyniku nakladki (kontrakt: NONE / FRESH / OUTDATED)."""

    NONE = "NONE"
    FRESH = "FRESH"
    OUTDATED = "OUTDATED"


class FreshnessReason(StrEnum):
    """Kod przyczyny statusu — stabilny, maszynowy (bez diakrytykow)."""

    BRAK_WYNIKU = "brak-wyniku"
    BRAK_MODELU_BIEZACEGO = "brak-modelu-biezacego"
    BRAK_ODCISKU_W_BIEGU = "brak-odcisku-modelu-w-biegu"
    MODEL_ZMIENIONY = "model-zmieniony"
    MODEL_NIEZMIENIONY = "model-niezmieniony"
    KATALOG_ZMIENIONY = "katalog-zmieniony"
    KOPERTA_NIESPOJNA = "koperta-rewizji-niespojna"
    SCENARIUSZ_ZMIENIONY = "scenariusz-zmieniony"
    SCENARIUSZ_USUNIETY = "scenariusz-usuniety"
    ZRODLO_NIEAKTUALNE = "zrodlo-biegu-nieaktualne"


# Zdanie dla projektanta — po polsku, JEDNO na kod przyczyny. Kazdy kod ma tu
# wpis (pin: `test_kazdy_kod_przyczyny_ma_zdanie_pl`), zeby nie dalo sie dodac
# przyczyny bez tekstu i oddac uzytkownikowi surowego kodu.
REASON_TEXTS_PL: dict[FreshnessReason, str] = {
    FreshnessReason.BRAK_WYNIKU: (
        "Brak zapisanego wyniku dla tego przebiegu — nie ma czego nałożyć na schemat."
    ),
    FreshnessReason.BRAK_MODELU_BIEZACEGO: (
        "Bieżący model przypadku jest niedostępny — nie da się potwierdzić, "
        "że wynik odpowiada modelowi."
    ),
    FreshnessReason.BRAK_ODCISKU_W_BIEGU: (
        "Przebieg zapisano bez odcisku modelu — nie da się potwierdzić, "
        "że wynik odpowiada bieżącemu modelowi."
    ),
    FreshnessReason.MODEL_ZMIENIONY: (
        "Model zmienił się po obliczeniu — wynik opisuje poprzedni stan sieci."
    ),
    FreshnessReason.MODEL_NIEZMIENIONY: "Model nie zmienił się od chwili obliczenia.",
    FreshnessReason.KATALOG_ZMIENIONY: (
        "Biblioteka typów katalogowych zmieniła się po obliczeniu — parametry "
        "zmaterializowane w chwili biegu mogą różnić się od obowiązujących."
    ),
    FreshnessReason.KOPERTA_NIESPOJNA: (
        "Koperta rewizji przebiegu jest niespójna z własnym odciskiem — zapis "
        "przebiegu został zmieniony poza systemem; wyniku nie da się uznać za aktualny."
    ),
    FreshnessReason.SCENARIUSZ_ZMIENIONY: (
        "Scenariusz roboczy przebiegu ma nowszą rewizję — wynik opisuje poprzednią "
        "postać scenariusza."
    ),
    FreshnessReason.SCENARIUSZ_USUNIETY: (
        "Scenariusz roboczy przebiegu został usunięty z projektu — wynik nie ma "
        "już swojego scenariusza."
    ),
    FreshnessReason.ZRODLO_NIEAKTUALNE: (
        "Przebieg źródłowy (np. zwarciowy), z którego pochodzi ten wynik, jest "
        "nieaktualny wobec bieżącego modelu — interpretacja opiera się na "
        "wartościach sprzed zmiany."
    ),
}


@dataclass(frozen=True)
class ZmianaOdBiegu:
    """Jedna rewizja modelu powstala PO rewizji biegu — to ona uniewaznila wynik."""

    rewizja: int
    operacja: str | None
    opis_pl: str
    elementy: tuple[str, ...] = ()

    @staticmethod
    def z_wpisu(wpis: WpisDziennika) -> ZmianaOdBiegu:
        return ZmianaOdBiegu(
            rewizja=wpis.rewizja,
            operacja=wpis.operacja,
            opis_pl=wpis.opis_pl,
            elementy=(*wpis.utworzone, *wpis.zmienione, *wpis.usuniete),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "rewizja": self.rewizja,
            "operacja": self.operacja,
            "opis_pl": self.opis_pl,
            "elementy": list(self.elementy),
        }


@dataclass(frozen=True)
class FreshnessVerdict:
    """Werdykt swiezosci: status + przyczyna maszynowa + zdanie dla czlowieka.

    CV-2 (addytywnie): `rewizja_biegu` / `rewizja_biezaca` z koperty rewizji i
    `zmiany` — rewizje modelu powstale po biegu (z dziennika zmian), czyli
    odpowiedz na pytanie „ktora zmiana uniewaznila wynik". Puste dla biegow bez
    koperty i dla werdyktow z kotwic hashowych.
    """

    status: ResultFreshness
    reason: FreshnessReason
    rewizja_biegu: int | None = None
    rewizja_biezaca: int | None = None
    zmiany: tuple[ZmianaOdBiegu, ...] = field(default=())

    @property
    def reason_pl(self) -> str:
        return REASON_TEXTS_PL[self.reason]

    def to_overlay_fields(self) -> dict[str, Any]:
        """Pola statusu dodawane do odpowiedzi nakladki (ten sam ksztalt wszedzie)."""
        return {
            "result_status": self.status.value,
            "result_status_reason": self.reason.value,
            "result_status_reason_pl": self.reason_pl,
            "rewizja_biegu": self.rewizja_biegu,
            "rewizja_biezaca": self.rewizja_biezaca,
            "zmiany_od_biegu": [zmiana.to_dict() for zmiana in self.zmiany],
        }


def current_model_hash(case_ref: str | None, uow_factory: Callable[[], Any] | None) -> str | None:
    """Odcisk BIEZACEGO modelu przypadku — jedyne wejscie do tej wartosci.

    `None` gdy przypadek nie ma jeszcze materializowanego modelu ENM: to jest
    uczciwy brak wiedzy, nie „model pusty". Swiadomie NIE wolamy `get_enm` dla
    przypadku bez snapshotu, bo ta funkcja TWORZY model domyslny i zapisuje go —
    ocena swiezosci (czysty odczyt) nie moze zakladac modelu, ktorego uzytkownik
    nie zbudowal. Ten sam uczciwy brak obejmuje TERAZ (CV-1-W) przypadek, ktory
    nie nalezy juz do zadnego projektu (`PrzypadekBezProjektuError`) — nie da sie
    potwierdzic swiezosci wobec modelu, ktorego nie da sie zidentyfikowac.

    `case_ref` jest tu SUROWYM `case_id` (np. `CanonicalRun.case_id`);
    `klucz_twin_dla_przypadku` tlumaczy go na klucz magazynu ENM. Wolane TU
    (nie na granicy API), bo `uow_factory` jest przekazywany z wolajacego —
    wyjatek SS0 pkt 3 dla „freshness".
    """
    if not case_ref or uow_factory is None:
        return None
    try:
        klucz = klucz_twin_dla_przypadku(case_ref, uow_factory)
    except PrzypadekBezProjektuError:
        return None
    if not has_enm(klucz):
        return None
    return compute_enm_hash(get_enm(klucz))


def evaluate_result_freshness(
    *,
    has_result: bool,
    run_model_hashes: Sequence[str | None],
    current_hash: str | None,
) -> FreshnessVerdict:
    """Werdykt swiezosci z POROWNANIA odciskow — funkcja czysta (bez wejscia/wyjscia).

    `run_model_hashes` to KOTWICE biegu: odciski modelu, ktore bieg zapisal
    (np. odcisk przypadku w chwili utworzenia biegu ORAZ odcisk modelu biegu
    zwarciowego, z ktorego wynik pochodzi). Kotwica nieznana (`None`) jest
    POMIJANA — nie udaje zgodnosci ani niezgodnosci. Wynik jest AKTUALNY tylko
    wtedy, gdy znana jest co najmniej jedna kotwica i KAZDA znana rowna sie
    odciskowi biezacemu; jedna rozbiezna kotwica wystarczy do OUTDATED, bo
    wynik opisuje wtedy stan sieci sprzed zmiany.
    """
    if not has_result:
        return FreshnessVerdict(ResultFreshness.NONE, FreshnessReason.BRAK_WYNIKU)
    if current_hash is None:
        return FreshnessVerdict(ResultFreshness.OUTDATED, FreshnessReason.BRAK_MODELU_BIEZACEGO)
    anchors = [value for value in run_model_hashes if value]
    if not anchors:
        return FreshnessVerdict(ResultFreshness.OUTDATED, FreshnessReason.BRAK_ODCISKU_W_BIEGU)
    if any(anchor != current_hash for anchor in anchors):
        return FreshnessVerdict(ResultFreshness.OUTDATED, FreshnessReason.MODEL_ZMIENIONY)
    return FreshnessVerdict(ResultFreshness.FRESH, FreshnessReason.MODEL_NIEZMIENIONY)


def evaluate_envelope_freshness(
    *,
    has_result: bool,
    envelope: RevisionEnvelope | None,
    rewizja_biezaca: int | None,
    hash_biezacy: str | None,
    odcisk_katalogu_biezacy: str,
    zmiany: Iterable[WpisDziennika] = (),
    kotwice_hashowe: Sequence[str | None] = (),
    stan_scenariusza: StanScenariusza | None = None,
) -> FreshnessVerdict:
    """Werdykt z KOPERTY REWIZJI — funkcja czysta (wejscia podaje wolajacy).

    Kolejnosc sprawdzen (pierwsza rozbieznosc rozstrzyga, bo wynik opisuje wtedy
    stan sprzed zmiany): brak wyniku → NONE; brak modelu biezacego → OUTDATED;
    brak koperty → sciezka kotwic hashowych (`evaluate_result_freshness`);
    koperta niespojna z wlasnym odciskiem → OUTDATED; rewizja modelu inna →
    OUTDATED + lista zmian; hash modelu inny przy tej samej rewizji (rewizja bez
    podbicia = niemozliwe przez `set_enm`, mozliwe przez ingerencje w plik) →
    OUTDATED; odcisk katalogu inny → OUTDATED (katalog); scenariusz NAZWANY biegu
    (CV-3.1) usuniety albo nieobecny w magazynie → OUTDATED (scenariusz usuniety),
    w nowszej rewizji → OUTDATED (scenariusz zmieniony); inaczej FRESH.
    `stan_scenariusza` podaje wolajacy z magazynu (`enm.scenariusze.stan_scenariusza`)
    dla scenariusza nazwanego z koperty; scenariusz przejsciowy nie ma rewizji w
    magazynie i nie jest sprawdzany.
    """
    if not has_result:
        return FreshnessVerdict(ResultFreshness.NONE, FreshnessReason.BRAK_WYNIKU)
    if rewizja_biezaca is None or hash_biezacy is None:
        return FreshnessVerdict(ResultFreshness.OUTDATED, FreshnessReason.BRAK_MODELU_BIEZACEGO)
    if envelope is None:
        return evaluate_result_freshness(
            has_result=True, run_model_hashes=kotwice_hashowe, current_hash=hash_biezacy
        )
    if not envelope.spojna:
        return FreshnessVerdict(
            ResultFreshness.OUTDATED,
            FreshnessReason.KOPERTA_NIESPOJNA,
            rewizja_biegu=envelope.model_revision,
            rewizja_biezaca=rewizja_biezaca,
        )
    lista_zmian = tuple(
        ZmianaOdBiegu.z_wpisu(wpis) for wpis in zmiany if wpis.rewizja > envelope.model_revision
    )
    if envelope.model_revision != rewizja_biezaca or envelope.snapshot_hash != hash_biezacy:
        return FreshnessVerdict(
            ResultFreshness.OUTDATED,
            FreshnessReason.MODEL_ZMIENIONY,
            rewizja_biegu=envelope.model_revision,
            rewizja_biezaca=rewizja_biezaca,
            zmiany=lista_zmian,
        )
    if envelope.catalog_fingerprint != odcisk_katalogu_biezacy:
        return FreshnessVerdict(
            ResultFreshness.OUTDATED,
            FreshnessReason.KATALOG_ZMIENIONY,
            rewizja_biegu=envelope.model_revision,
            rewizja_biezaca=rewizja_biezaca,
        )
    if envelope.scenario_ref is not None and not czy_scenariusz_przejsciowy(
        envelope.scenario_ref[0]
    ):
        if stan_scenariusza is None or stan_scenariusza.usuniety:
            return FreshnessVerdict(
                ResultFreshness.OUTDATED,
                FreshnessReason.SCENARIUSZ_USUNIETY,
                rewizja_biegu=envelope.model_revision,
                rewizja_biezaca=rewizja_biezaca,
            )
        if stan_scenariusza.rewizja != envelope.scenario_ref[1]:
            return FreshnessVerdict(
                ResultFreshness.OUTDATED,
                FreshnessReason.SCENARIUSZ_ZMIENIONY,
                rewizja_biegu=envelope.model_revision,
                rewizja_biezaca=rewizja_biezaca,
            )
    return FreshnessVerdict(
        ResultFreshness.FRESH,
        FreshnessReason.MODEL_NIEZMIENIONY,
        rewizja_biegu=envelope.model_revision,
        rewizja_biezaca=rewizja_biezaca,
    )


@dataclass(frozen=True)
class StanBiezacyModelu:
    """Biezacy stan projektu potrzebny do oceny swiezosci — pobierany RAZ na zapytanie."""

    klucz: str | None
    rewizja: int | None
    hash_sha256: str | None
    odcisk_katalogu: str

    @staticmethod
    def dla_przypadku(
        case_ref: str | None, uow_factory: Callable[[], Any] | None
    ) -> StanBiezacyModelu:
        """Stan modelu projektu przypadku; `klucz=None` gdy przypadku nie da sie
        zidentyfikowac albo model nie jest zmaterializowany (uczciwy brak — patrz
        `current_model_hash`)."""
        odcisk = odcisk_katalogu_domyslnego()
        if not case_ref or uow_factory is None:
            return StanBiezacyModelu(None, None, None, odcisk)
        try:
            klucz = klucz_twin_dla_przypadku(case_ref, uow_factory)
        except PrzypadekBezProjektuError:
            return StanBiezacyModelu(None, None, None, odcisk)
        if not has_enm(klucz):
            return StanBiezacyModelu(klucz, None, None, odcisk)
        model = get_enm(klucz)
        return StanBiezacyModelu(klucz, model.header.revision, compute_enm_hash(model), odcisk)


def swiezosc_biegu_kanonicznego(
    run: Any,
    stan: StanBiezacyModelu,
    *,
    kotwice_hashowe: Sequence[str | None] = (),
    biegi_zrodlowe: Sequence[Any] = (),
) -> FreshnessVerdict:
    """Werdykt dla biegu kanonicznego (`CanonicalRun`) z koperty rewizji.

    `run` musi miec `status`, `raw_result`, `envelope` (slownik lub None) i
    `snapshot_hash`. `kotwice_hashowe` uzupelniaja `snapshot_hash` dla biegow bez
    koperty (np. odcisk modelu biegu zwarciowego, z ktorego wynik pochodzi).

    `biegi_zrodlowe` (CV-3.3-B): biegi R1, KTORYCH WYNIK ten bieg interpretuje
    (np. bieg zwarciowy pod ocena zabezpieczen — `options["sc_run_id"]`).
    Wlasna koperta biegu potrafi byc aktualna, gdy koperta biegu zrodlowego juz
    nie jest (bieg zabezpieczen utworzony PO edycji modelu, odwolujacy sie do
    biegu zwarciowego sprzed tej edycji) — interpretacja jest wtedy rowniez
    NIEAKTUALNA, mimo ze wlasny bieg zgadza sie z biezacym modelem. Sprawdzane
    DOPIERO gdy wlasny werdykt jest FRESH (pierwsza rozbieznosc rozstrzyga).
    """
    koperta = RevisionEnvelope.from_dict(getattr(run, "envelope", None))
    zmiany: list[WpisDziennika] = []
    stan_scenariusza: StanScenariusza | None = None
    if koperta is not None and stan.klucz is not None and stan.rewizja is not None:
        if koperta.model_revision != stan.rewizja:
            zmiany = wpisy_od(stan.klucz, koperta.model_revision)
        if koperta.scenario_ref is not None and not czy_scenariusz_przejsciowy(
            koperta.scenario_ref[0]
        ):
            stan_scenariusza = stan_scenariusza_z_magazynu(stan.klucz, koperta.scenario_ref[0])
    werdykt = evaluate_envelope_freshness(
        has_result=run.status == "FINISHED" and bool(run.raw_result),
        envelope=koperta,
        rewizja_biezaca=stan.rewizja,
        hash_biezacy=stan.hash_sha256,
        odcisk_katalogu_biezacy=stan.odcisk_katalogu,
        zmiany=zmiany,
        kotwice_hashowe=(run.snapshot_hash, *kotwice_hashowe),
        stan_scenariusza=stan_scenariusza,
    )
    if werdykt.status != ResultFreshness.FRESH:
        return werdykt
    for zrodlo in biegi_zrodlowe:
        werdykt_zrodla = swiezosc_biegu_kanonicznego(zrodlo, stan)
        if werdykt_zrodla.status != ResultFreshness.FRESH:
            return FreshnessVerdict(
                ResultFreshness.OUTDATED,
                FreshnessReason.ZRODLO_NIEAKTUALNE,
                rewizja_biegu=werdykt.rewizja_biegu,
                rewizja_biezaca=werdykt.rewizja_biezaca,
                zmiany=werdykt_zrodla.zmiany,
            )
    return werdykt


def status_wynikow_przypadku(
    biegi: Iterable[Any], stan: StanBiezacyModelu
) -> tuple[ResultFreshness, FreshnessVerdict | None]:
    """Status wynikow PRZYPADKU obliczeniowego WYPROWADZONY z jego biegow
    (kontrakt HTTP `StudyCase.result_status`: NONE / FRESH / OUTDATED).

    NONE — zaden bieg nie ma wyniku; FRESH — co najmniej jeden bieg z wynikiem jest
    aktualny wobec biezacego modelu i katalogu; OUTDATED — sa biegi z wynikiem,
    ale zaden nie jest aktualny. Zwraca tez werdykt biegu rozstrzygajacego
    (najswiezszy aktualny albo, gdy brak, ostatni nieaktualny) — z lista zmian.
    Kasuje potrzebe pisarzy `mark_all_outdated` / `mark_case_outdated` /
    `mark_case_fresh`: status jest funkcja danych, nie stanem do utrzymania.
    """
    najlepszy: FreshnessVerdict | None = None
    for bieg in biegi:
        werdykt = swiezosc_biegu_kanonicznego(bieg, stan)
        if werdykt.status == ResultFreshness.NONE:
            continue
        if werdykt.status == ResultFreshness.FRESH:
            return ResultFreshness.FRESH, werdykt
        najlepszy = werdykt
    if najlepszy is None:
        return ResultFreshness.NONE, None
    return ResultFreshness.OUTDATED, najlepszy
