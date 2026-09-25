"""Odpowiedź biegu NC RfG / PTPiREE — JEDNA koperta dla macierzy i zgodności przypadku.

Dwie trasy uruchamiają TEN SAM solver kanoniczny ``NcRfgPtpireeSolver``
(``network_model/solvers/ncrfg_ptpiree``) i odsyłają TEN SAM kontrakt biegu:

- ``POST /api/ncrfg-tests/run`` — bieg „co-jeśli" z wejść skompletowanych przez projektanta
  w oknie macierzy; źródło danych ``ZADANIE_KLIENTA`` (dane bez walidacji w modelu, dowód
  zawsze niepełny) i ŻADNEGO certyfikatu — ciało żądania nie ma na niego pola (plan AB O-27);
- ``GET /api/ncrfg-tests/cases/{case_id}/compliance`` — zgodność przekrojowa przypadku:
  wejścia i dowody certyfikatu zbudowane Z ZATWIERDZONEGO MODELU (most ``model_bridge.py``),
  źródło danych ``ZATWIERDZONY_MODEL``.

Koperta biegu (``NcRfgPtpireeRunResponse``) = wynik solvera (rekordy ``OcenaKryterium`` testów,
dowód certyfikatu w wyniku modułu) + ocena wymagań profilu (``OcenaWymaganModulu`` z rekordami
``WynikWymagania``). Składana JEDNĄ funkcją ``odpowiedz_biegu_ncrfg``, a bieg z oceną — JEDNĄ
funkcją ``bieg_ncrfg`` — dwie trasy nie mogą się rozjechać.

Warstwa APPLICATION: zero fizyki, zero oceny własnej — kompozycja rekordów solvera i oceny
wymagań.
"""

from __future__ import annotations

from collections.abc import Mapping

from application.ncrfg_compliance.model_bridge import (
    NcRfgCertyfikatOdrzucony,
    NcRfgDerPominiety,
    build_ncrfg_module_inputs_from_enm,
)
from application.ncrfg_compliance.ocena_wymagan import (
    OcenaWymaganModulu,
    ocen_wymagania_biegu,
)
from enm.models import EnergyNetworkModel
from network_model.solvers.ncrfg_ptpiree import (
    NcRfgPtpireeModuleInput,
    NcRfgPtpireeRunRequest,
    NcRfgPtpireeRunResult,
    NcRfgPtpireeSolver,
)
from network_model.solvers.ncrfg_ptpiree.contracts import DowodCertyfikatu, ZrodloDanych
from pydantic import BaseModel, ConfigDict, model_validator

_solver = NcRfgPtpireeSolver()
_BRAK_CERTYFIKATOW: Mapping[str, DowodCertyfikatu] = {}


class NcRfgPtpireeRunResponse(NcRfgPtpireeRunResult):
    """Wynik biegu solvera POSZERZONY o ocenę wymagań profilu per moduł.

    ``ocena_wymagan`` jest OBOWIĄZKOWA (także dla biegu „co-jeśli"): kolejność i tożsamość
    modułów muszą być identyczne jak w ``modules`` (walidator — predykat parami). Dowód
    certyfikatu modułu żyje w JEDNYM miejscu: ``modules[i].dowod_certyfikatu``.
    """

    ocena_wymagan: list[OcenaWymaganModulu]

    @model_validator(mode="after")
    def _moduly_oceny_zgodne_z_wynikiem(self) -> NcRfgPtpireeRunResponse:
        wynik = [m.der_ref for m in self.modules]
        ocena = [m.der_ref for m in self.ocena_wymagan]
        if wynik != ocena:
            raise ValueError(
                f"Ocena wymagań obejmuje moduły {ocena}, a wynik solvera moduły {wynik}."
            )
        return self


class NcRfgCaseComplianceResponse(BaseModel):
    """Zgodność NC RfG przypadku: bieg solvera na DER modelu, opakowany per przypadek.

    ``bieg`` jest ``None`` DOKŁADNIE wtedy, gdy solver nie miał żadnego modułu do objęcia
    (``der_count == 0``): kontrakt solvera wymaga ≥ 1 modułu, a pusty bieg z fabrykowanym
    odciskiem byłby fałszem. ``pominiete`` nazywa DER modelu, których solver nie objął (brak
    mocy / brak napięcia przyłączenia); ``certyfikaty_odrzucone`` — tabliczki urządzeń, których
    serwer nie dopasował do wykazu PTPiREE (z powodem).
    """

    model_config = ConfigDict(frozen=True)

    case_id: str
    operator_id: str
    der_count: int
    pominiete: list[NcRfgDerPominiety]
    certyfikaty_odrzucone: list[NcRfgCertyfikatOdrzucony]
    bieg: NcRfgPtpireeRunResponse | None

    @model_validator(mode="after")
    def _bieg_wtedy_gdy_sa_moduly(self) -> NcRfgCaseComplianceResponse:
        if (self.bieg is None) != (self.der_count == 0):
            raise ValueError("Bieg istnieje dokładnie wtedy, gdy model ma moduł do objęcia.")
        if self.bieg is not None and len(self.bieg.modules) != self.der_count:
            raise ValueError("Liczba modułów biegu różni się od liczby DER objętych mostem.")
        return self


class NcRfgWejsciaPrzypadkuResponse(BaseModel):
    """Wejścia modułów NC RfG złożone Z MODELU przypadku przez most ``model_bridge`` — TE SAME
    wejścia, które ocenia zgodność przypadku (``zgodnosc_ncrfg_przypadku``), bez biegu.

    PO CO: formularz biegu „co-jeśli" macierzy startuje z danych modelu (także pól liczonych
    z ``meta`` generatora: statyzm, martwa strefa, cosφ, zakresy Q, zdolności z deklaracji
    kreatora i wiązań) jednym odczytem, bez powielania logiki mostu po stronie klienta.
    ``pola_z_modelu`` (po ``der_ref``) — pola z wartością z danych modelu (pochodzenie
    „z modelu" w formularzu; ``model_bridge.pola_wejscia_z_modelu``). ``pominiete`` — DER
    modelu, których most nie objął (brak mocy / napięcia), z powodem.
    """

    model_config = ConfigDict(frozen=True)

    case_id: str
    operator_id: str
    modules: list[NcRfgPtpireeModuleInput]
    pola_z_modelu: dict[str, list[str]]
    pominiete: list[NcRfgDerPominiety]

    @model_validator(mode="after")
    def _pochodzenie_dla_kazdego_modulu(self) -> NcRfgWejsciaPrzypadkuResponse:
        if set(self.pola_z_modelu) != {m.der_ref for m in self.modules}:
            raise ValueError("Pochodzenie pól istnieje dokładnie dla modułów wejścia.")
        if any(m.operator_id != self.operator_id for m in self.modules):
            raise ValueError("Operator modułu różni się od operatora odpowiedzi.")
        return self


def wejscia_ncrfg_przypadku(
    enm: EnergyNetworkModel, *, operator_id: str, case_id: str
) -> NcRfgWejsciaPrzypadkuResponse:
    """Wejścia solvera NC RfG wszystkich DER modelu — ten sam most co zgodność przypadku
    (``build_ncrfg_module_inputs_from_enm``). Wołający (trasa) sprawdza operatora PRZED
    wywołaniem. Deterministyczne (kolejność DER = kolejność generatorów w modelu)."""
    wejscia = build_ncrfg_module_inputs_from_enm(enm, operator_id=operator_id)
    return NcRfgWejsciaPrzypadkuResponse(
        case_id=case_id,
        operator_id=operator_id,
        modules=wejscia.modules,
        pola_z_modelu=wejscia.pola_z_modelu,
        pominiete=wejscia.pominiete,
    )


def odpowiedz_biegu_ncrfg(
    result: NcRfgPtpireeRunResult, ocena_wymagan: list[OcenaWymaganModulu]
) -> NcRfgPtpireeRunResponse:
    """Koperta biegu z gotowego wyniku solvera i gotowej oceny wymagań — JEDYNE miejsce
    składania odpowiedzi HTTP biegu (obie trasy)."""
    return NcRfgPtpireeRunResponse(**result.model_dump(), ocena_wymagan=ocena_wymagan)


def bieg_ncrfg(
    request: NcRfgPtpireeRunRequest,
    *,
    zrodlo_danych: ZrodloDanych,
    certyfikaty: Mapping[str, DowodCertyfikatu] = _BRAK_CERTYFIKATOW,
    certyfikaty_odrzucone: Mapping[str, str] | None = None,
) -> NcRfgPtpireeRunResponse:
    """Bieg solvera + ocena wymagań profilu + koperta — JEDNA kompozycja dla obu tras.

    ``certyfikaty`` wyłącznie z mostu modelu (serwer); solver odrzuca certyfikaty przy
    ``ZADANIE_KLIENTA``. ``certyfikaty_odrzucone`` (``der_ref`` → powód) trafiają do braków
    wymagań bez metody wykazania.
    """
    result = _solver.run(request, zrodlo_danych=zrodlo_danych, certyfikaty=certyfikaty)
    ocena = ocen_wymagania_biegu(request, result, certyfikaty_odrzucone=certyfikaty_odrzucone)
    return odpowiedz_biegu_ncrfg(result, ocena)


def zgodnosc_ncrfg_przypadku(
    enm: EnergyNetworkModel, *, operator_id: str, case_id: str
) -> NcRfgCaseComplianceResponse:
    """Zgodność NC RfG WSZYSTKICH DER modelu dla wskazanego operatora.

    Most ``build_ncrfg_module_inputs_from_enm`` buduje wejścia i dowody certyfikatu (zero
    fabrykacji: brak danej = ``False``/``None``), ``bieg_ncrfg`` liczy rekordy testów i
    wymagań ze źródłem ``ZATWIERDZONY_MODEL``. Wołający (trasa) sprawdza operatora PRZED
    wywołaniem. Deterministyczne: identyczny model → identyczna odpowiedź (kolejność DER =
    kolejność generatorów w modelu).
    """
    wejscia = build_ncrfg_module_inputs_from_enm(enm, operator_id=operator_id)
    bieg: NcRfgPtpireeRunResponse | None = None
    if wejscia.modules:
        bieg = bieg_ncrfg(
            NcRfgPtpireeRunRequest(modules=wejscia.modules),
            zrodlo_danych="ZATWIERDZONY_MODEL",
            certyfikaty=wejscia.certyfikaty,
            certyfikaty_odrzucone={o.der_ref: o.powod_pl for o in wejscia.certyfikaty_odrzucone},
        )
    return NcRfgCaseComplianceResponse(
        case_id=case_id,
        operator_id=operator_id,
        der_count=len(wejscia.modules),
        pominiete=wejscia.pominiete,
        certyfikaty_odrzucone=wejscia.certyfikaty_odrzucone,
        bieg=bieg,
    )
