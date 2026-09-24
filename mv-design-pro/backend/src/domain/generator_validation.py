"""
Generator Connection Validation — PV/BESS canonical rules (KROK 2-3).

CANONICAL RULES (BINDING):
A) PV/BESS nigdy nie jest 'bezposrednio do SN' (zawsze przez transformator).
B) Wariant A (nn_side): PV/BESS po stronie nN stacji → przez transformator stacji SN/nN.
   Wymagane: station_ref (wskazuje stacje SN/nN).
C) Wariant B (block_transformer): PV/BESS przez transformator blokowy → do SN.
   Wymagane: blocking_transformer_ref (wskazuje transformator blokowy) + catalog_ref transformatora.
D) Brak connection_variant → FixAction generator.connection_variant_missing.
E) Generatory synchroniczne NIE wymagaja connection_variant.
F) Brak catalog_ref generatora → FixAction catalog.ref_missing.

INVARIANTS:
- Zero fabrication: brak danych → ReadinessIssue, nigdy domyslna wartosc.
- Deterministic: sorted by element_id.
- Immutable output.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from domain.readiness import (
    ReadinessAreaV1,
    ReadinessIssueV1,
    ReadinessPriority,
)
from enm.models import GEN_TYPES_PRZEKSZTALTNIKOWE, liczba_jednostek_zrodla
from network_model.pochodne import kw_na_mw, moc_pozorna_z_czynnej_mva, mva_na_kva

# Generator types that REQUIRE connection_variant — kanoniczny zbiór przekształtnikowy
# (karta AB-H0 Pakiet D: lokalna kopia skasowana; parytet w
# `tests/enm/test_gen_types_przeksztaltnikowe.py`).
_OZE_GEN_TYPES = GEN_TYPES_PRZEKSZTALTNIKOWE
_LV_VARIANTS = frozenset({"nn_side", "LV_BEHIND_STATION_TRANSFORMER"})
_SOURCE_STATION_VARIANTS = frozenset({"SOURCE_CONNECTION_STATION"})
_DEDICATED_MV_VARIANTS = frozenset({"block_transformer", "DEDICATED_MV_CONNECTION"})

#: Decyzja O-53 — klasyfikacja wariantu przyłączenia dla kontroli mocy transformatora z
#: TYCH SAMYCH zbiorów co walidacja przyłączenia: źródło po stronie nN stacji (także
#: stacja przyłączeniowa źródła) i źródło z dedykowanym transformatorem blokowym.
WARIANTY_PRZYLACZENIA_NN = _LV_VARIANTS | _SOURCE_STATION_VARIANTS
WARIANTY_PRZYLACZENIA_TR_BLOKOWY = _DEDICATED_MV_VARIANTS


def validate_generator_connections(
    generators: list[dict[str, Any]],
    transformers_by_ref: dict[str, dict[str, Any]],
    stations_by_ref: dict[str, dict[str, Any]],
) -> list[ReadinessIssueV1]:
    """Validate PV/BESS connection rules.

    Args:
        generators: list of generator dicts with keys:
            ref_id, name, gen_type, bus_ref, catalog_ref,
            connection_variant, blocking_transformer_ref, station_ref
        transformers_by_ref: ref_id → transformer dict
        stations_by_ref: ref_id → station dict

    Returns:
        List of ReadinessIssueV1 (sorted by element_id).
    """
    issues: list[ReadinessIssueV1] = []

    for gen in sorted(generators, key=lambda g: g.get("ref_id", "")):
        ref_id = gen.get("ref_id", "")
        name = gen.get("name", ref_id)
        gen_type = gen.get("gen_type")
        catalog_ref = gen.get("catalog_ref")
        connection_variant = gen.get("connection_variant")
        blocking_tr_ref = gen.get("blocking_transformer_ref")
        station_ref = gen.get("station_ref")

        # Catalog ref required for all generators
        if not catalog_ref:
            issues.append(
                ReadinessIssueV1(
                    code="catalog.ref_missing",
                    area=ReadinessAreaV1.CATALOGS,
                    priority=ReadinessPriority.BLOCKER,
                    message_pl=f"Generator '{name}' ({ref_id}): brak referencji katalogowej",
                    element_id=ref_id,
                    element_type="GENERATOR",
                    fix_hint_pl="Przypisz typ z katalogu do generatora",
                    wizard_step="K6",
                )
            )

        # Synchronous generators don't need connection_variant
        if gen_type not in _OZE_GEN_TYPES:
            continue

        # OZE generators MUST have connection_variant
        if not connection_variant:
            issues.append(
                ReadinessIssueV1(
                    code="generator.connection_variant_missing",
                    area=ReadinessAreaV1.GENERATORS,
                    priority=ReadinessPriority.BLOCKER,
                    message_pl=(
                        f"Generator OZE '{name}' ({ref_id}): brak wariantu przyłączenia "
                        f"(nn_side lub block_transformer)"
                    ),
                    element_id=ref_id,
                    element_type="GENERATOR",
                    fix_hint_pl="Wybierz wariant przyłączenia w kreatorze",
                    wizard_step="K6",
                )
            )
            continue

        if connection_variant in _LV_VARIANTS or connection_variant in _SOURCE_STATION_VARIANTS:
            # Variant A: must have station_ref
            if not station_ref:
                issues.append(
                    ReadinessIssueV1(
                        code="generator.station_ref_missing",
                        area=ReadinessAreaV1.GENERATORS,
                        priority=ReadinessPriority.BLOCKER,
                        message_pl=(
                            f"Generator OZE '{name}' ({ref_id}): wariant 'po stronie nN' "
                            f"wymaga wskazania stacji (station_ref)"
                        ),
                        element_id=ref_id,
                        element_type="GENERATOR",
                        fix_hint_pl="Wskazz stacje SN/nN w kreatorze",
                        wizard_step="K6",
                    )
                )
            elif station_ref not in stations_by_ref:
                issues.append(
                    ReadinessIssueV1(
                        code="generator.station_ref_invalid",
                        area=ReadinessAreaV1.GENERATORS,
                        priority=ReadinessPriority.BLOCKER,
                        message_pl=(
                            f"Generator OZE '{name}' ({ref_id}): stacja '{station_ref}' "
                            f"nie istnieje w modelu"
                        ),
                        element_id=ref_id,
                        element_type="GENERATOR",
                        fix_hint_pl="Popraw referencję do stacji w kreatorze",
                        wizard_step="K6",
                    )
                )

        elif connection_variant in _DEDICATED_MV_VARIANTS:
            # Variant B: must have blocking_transformer_ref
            if not blocking_tr_ref:
                issues.append(
                    ReadinessIssueV1(
                        code="generator.block_transformer_missing",
                        area=ReadinessAreaV1.GENERATORS,
                        priority=ReadinessPriority.BLOCKER,
                        message_pl=(
                            f"Generator OZE '{name}' ({ref_id}): wariant 'transformator blokowy' "
                            f"wymaga wskazania transformatora (blocking_transformer_ref)"
                        ),
                        element_id=ref_id,
                        element_type="GENERATOR",
                        fix_hint_pl="Wskazz transformator blokowy w kreatorze",
                        wizard_step="K6",
                    )
                )
            elif blocking_tr_ref not in transformers_by_ref:
                issues.append(
                    ReadinessIssueV1(
                        code="generator.block_transformer_invalid",
                        area=ReadinessAreaV1.GENERATORS,
                        priority=ReadinessPriority.BLOCKER,
                        message_pl=(
                            f"Generator OZE '{name}' ({ref_id}): transformator blokowy "
                            f"'{blocking_tr_ref}' nie istnieje w modelu"
                        ),
                        element_id=ref_id,
                        element_type="GENERATOR",
                        fix_hint_pl="Dodaj transformator blokowy w kreatorze",
                        wizard_step="K5",
                    )
                )

        else:
            issues.append(
                ReadinessIssueV1(
                    code="generator.connection_variant_invalid",
                    area=ReadinessAreaV1.GENERATORS,
                    priority=ReadinessPriority.BLOCKER,
                    message_pl=(
                        f"Generator OZE '{name}' ({ref_id}): nieznany wariant przyłączenia "
                        f"'{connection_variant}' (dozwolone: nn_side, block_transformer)"
                    ),
                    element_id=ref_id,
                    element_type="GENERATOR",
                    fix_hint_pl="Popraw wariant przyłączenia w kreatorze",
                    wizard_step="K6",
                )
            )

    return issues


# ===========================================================================
# MOC ŹRÓDŁA PRZEKSZTAŁTNIKOWEGO × TRANSFORMATOR × NASTAWA (decyzja O-53)
# ===========================================================================
#
# JEDNA reguła dla KAŻDEJ drogi zapisu źródła przekształtnikowego: tor atomowy
# (`add_converter_source`, nN i TR blokowy), tor stacyjny (`nn_block` operacji
# budujących stację), tor DER-SN, przypisanie typu, aktualizacja parametrów
# generatora i transformatora oraz raport zgodności toru DER-SN. Przed decyzją
# istniały DWIE reguły (atomowa: max(Sn·n, P) wobec Sn stacji; DER-SN: P/cosφ·k_j
# wobec Sn·k_obc, bez mocy znamionowej falownika) z DWOMA kodami — ten sam model
# dostawał różne werdykty zależnie od drogi, a pozycja 5 MW przechodziła na TR 1 MVA.
#
#   S_wym = max(S_n,jedn · n, |P_nastawa| / cosφ) · k_j  ≤  S_n,TR · k_obc
#   |P_nastawa| ≤ P_max,jedn · n
#
# * n — `enm.models.liczba_jednostek_zrodla` (ta sama reguła co solver);
# * S_n,jedn, P_max,jedn — z tabliczki (karty) jednostki;
# * cosφ — jawne wejście, a bez niego pole `cosphi` tabliczki; bez obu człon nastawy
#   liczony jest z |P| (dolna granica mocy pozornej — nie zawyża wymagania);
# * k_j (jednoczesność), k_obc (przeciążalność TR) — WYŁĄCZNIE jawne wejścia; brak =
#   1,0, czyli brak redukcji i brak ulgi (element neutralny mnożenia, nie domysł) —
#   nazwany w zapisie `meta.kontrola_mocy_zrodla` generatora.

KOD_MOC_TRANSFORMATORA = "converter.transformer_capacity_exceeded"
KOD_NASTAWA_POWYZEJ_MOCY_ZNAMIONOWEJ = "converter.setpoint_above_rating"
KOD_WEJSCIE_KONTROLI_MOCY = "converter.power_check_input_invalid"

#: Klucz `Generator.meta` z jawnymi wejściami kontroli mocy (zapisuje tor tworzenia,
#: czyta przypisanie typu, aktualizacja parametrów i raport zgodności).
KLUCZ_META_KONTROLI_MOCY = "kontrola_mocy_zrodla"

#: Technologia źródła wg rodzaju generatora — zbiór kluczy = `GEN_TYPES_PRZEKSZTALTNIKOWE`
#: (parytet przypięty testem).
TECHNOLOGIA_WG_RODZAJU_GENERATORA: dict[str, str] = {
    "pv_inverter": "PV",
    "bess": "BESS",
    "wind_inverter": "FW",
    "fw_pmsg": "FW",
    "fw_dfig": "FW",
    "fw_scig": "FW",
}

#: Pola mocy CZYNNEJ jednostki na tabliczce, w kolejności pierwszeństwa, per technologia
#: (ta sama kolejność, w której tor tworzenia wyznacza moc domyślną generatora);
#: drugi element — czy pole jest w kW.
_POLA_MOCY_CZYNNEJ_JEDNOSTKI: dict[str, tuple[tuple[str, bool], ...]] = {
    "PV": (("pmax_mw", False), ("max_power_kw", True), ("rated_power_ac_kw", True)),
    "BESS": (("pmax_mw", False), ("discharge_power_kw", True), ("charge_power_kw", True)),
    "FW": (("pmax_mw", False), ("max_power_kw", True)),
}

#: Element neutralny mnożenia — współczynnik NIEPODANY nie redukuje ani nie podnosi mocy.
BEZ_REDUKCJI = 1.0
_TOLERANCJA_MVA = 1e-9


def _liczba(wartosc: object) -> float | None:
    if isinstance(wartosc, bool) or not isinstance(wartosc, int | float):
        return None
    return float(wartosc)


def _w_mw(tabliczka: Mapping[str, Any], pole: str, w_kw: bool) -> float | None:
    wartosc = _liczba(tabliczka.get(pole))
    if wartosc is None:
        return None
    return kw_na_mw(wartosc) if w_kw else wartosc


def moc_czynna_jednostki_mw(technologia: str, tabliczka: Mapping[str, Any]) -> float | None:
    """P_max,jedn — moc czynna JEDNEJ jednostki z tabliczki (pierwsze obecne pole)."""
    for pole, w_kw in _POLA_MOCY_CZYNNEJ_JEDNOSTKI.get(technologia, ()):
        wartosc = _w_mw(tabliczka, pole, w_kw)
        if wartosc is not None:
            return wartosc
    return None


def moc_pozorna_jednostki_mva(technologia: str, tabliczka: Mapping[str, Any]) -> float | None:
    """S_n,jedn — moc pozorna jednostki z tabliczki.

    `sn_mva` karty; moce czynne tabliczki są jej DOLNYM ograniczeniem (S ≥ P), więc
    wynik to maksimum dodatnich wartości — karta bez `sn_mva` nie zaniża wymagania
    poniżej mocy czynnej, a karta z `sn_mva` < P (dane niespójne) nie zaniża go wcale.
    """
    kandydaci = [_w_mw(tabliczka, "sn_mva", False)]
    kandydaci.extend(
        _w_mw(tabliczka, pole, w_kw)
        for pole, w_kw in _POLA_MOCY_CZYNNEJ_JEDNOSTKI.get(technologia, ())
    )
    dodatnie = [wartosc for wartosc in kandydaci if wartosc is not None and wartosc > 0]
    return max(dodatnie) if dodatnie else None


@dataclass(frozen=True)
class JawneWejsciaKontroliMocy:
    """Jawne wejścia kontroli mocy transformatora — podane przez projektanta albo brak."""

    cos_phi: float | None = None
    wspolczynnik_jednoczesnosci: float | None = None
    przeciazalnosc_transformatora_pu: float | None = None

    def zapis_meta(self) -> dict[str, Any]:
        """Zapis w `meta.kontrola_mocy_zrodla` — wartości podane albo `None` z nazwanym
        przyjęciem (brak współczynnika = 1,0 bez redukcji, nie domysł)."""
        przyjete: list[str] = []
        if self.wspolczynnik_jednoczesnosci is None:
            przyjete.append(
                "Współczynnika jednoczesności nie podano — przyjęto 1,0 (brak redukcji)."
            )
        if self.przeciazalnosc_transformatora_pu is None:
            przyjete.append("Przeciążalności transformatora nie podano — przyjęto 1,0 (brak ulgi).")
        if self.cos_phi is None:
            przyjete.append(
                "cosφ nie podano — człon nastawy liczony z cosφ karty, a bez niego z |P| "
                "(dolna granica mocy pozornej)."
            )
        return {
            "cos_phi": self.cos_phi,
            "wspolczynnik_jednoczesnosci": self.wspolczynnik_jednoczesnosci,
            "przeciazalnosc_transformatora_pu": self.przeciazalnosc_transformatora_pu,
            "przyjete_pl": przyjete,
        }

    @classmethod
    def z_meta(cls, meta: object) -> JawneWejsciaKontroliMocy:
        zapis = meta.get(KLUCZ_META_KONTROLI_MOCY) if isinstance(meta, Mapping) else None
        if not isinstance(zapis, Mapping):
            return cls()
        return cls(
            cos_phi=_liczba(zapis.get("cos_phi")),
            wspolczynnik_jednoczesnosci=_liczba(zapis.get("wspolczynnik_jednoczesnosci")),
            przeciazalnosc_transformatora_pu=_liczba(zapis.get("przeciazalnosc_transformatora_pu")),
        )


@dataclass(frozen=True)
class OdmowaKontroliMocy:
    kod: str
    komunikat_pl: str


def blad_wejsc_kontroli_mocy(wejscia: JawneWejsciaKontroliMocy) -> OdmowaKontroliMocy | None:
    """Dziedzina jawnych wejść kontroli mocy: cosφ, k_j ∈ (0; 1], k_obc > 0 — JEDNA
    definicja dla operacji domenowych i podglądu doboru toru DER-SN (decyzja O-53)."""
    if wejscia.cos_phi is not None and not 0.0 < wejscia.cos_phi <= 1.0:
        return OdmowaKontroliMocy(
            KOD_WEJSCIE_KONTROLI_MOCY, f"cosφ musi należeć do (0; 1] (podano {wejscia.cos_phi:g})."
        )
    k_j = wejscia.wspolczynnik_jednoczesnosci
    if k_j is not None and not 0.0 < k_j <= 1.0:
        return OdmowaKontroliMocy(
            KOD_WEJSCIE_KONTROLI_MOCY,
            f"Współczynnik jednoczesności musi należeć do (0; 1] (podano {k_j:g}).",
        )
    k_obc = wejscia.przeciazalnosc_transformatora_pu
    if k_obc is not None and not k_obc > 0.0:
        return OdmowaKontroliMocy(
            KOD_WEJSCIE_KONTROLI_MOCY,
            f"Przeciążalność transformatora musi być dodatnia (podano {k_obc:g}).",
        )
    return None


def sprawdz_nastawe_zrodla(
    *,
    technologia: str,
    tabliczka: Mapping[str, Any],
    liczba_jednostek: int,
    moc_czynna_mw: float | None,
) -> OdmowaKontroliMocy | None:
    """|P_nastawa| ≤ P_max,jedn · n. Tabliczka bez mocy czynnej jednostki — brak
    podstawy porównania (tor tworzenia odmawia wtedy wcześniej `generator.power_missing`)."""
    p_jednostki = moc_czynna_jednostki_mw(technologia, tabliczka)
    if p_jednostki is None or moc_czynna_mw is None:
        return None
    znamionowa = p_jednostki * liczba_jednostek
    if abs(moc_czynna_mw) <= znamionowa + _TOLERANCJA_MVA:
        return None
    return OdmowaKontroliMocy(
        KOD_NASTAWA_POWYZEJ_MOCY_ZNAMIONOWEJ,
        (
            f"Moc zadana źródła {technologia} ({abs(moc_czynna_mw):g} MW) przekracza moc "
            f"znamionową instalacji ({znamionowa:g} MW = {p_jednostki:g} MW × {liczba_jednostek} "
            "jedn.). Zmniejsz nastawę albo zwiększ liczbę jednostek."
        ),
    )


def moc_pozorna_wymagana_mva(
    *,
    technologia: str,
    tabliczka: Mapping[str, Any],
    liczba_jednostek: int,
    moc_czynna_mw: float | None,
    cos_phi: float | None,
) -> float | None:
    """max(S_n,jedn · n, |P| / cosφ) — bez współczynnika jednoczesności."""
    czlony: list[float] = []
    s_jednostki = moc_pozorna_jednostki_mva(technologia, tabliczka)
    if s_jednostki is not None:
        czlony.append(s_jednostki * liczba_jednostek)
    if moc_czynna_mw is not None and moc_czynna_mw != 0.0:
        cos = cos_phi if cos_phi is not None else _liczba(tabliczka.get("cosphi"))
        czlony.append(moc_pozorna_z_nastawy_mva(moc_czynna_mw, cos))
    return max(czlony) if czlony else None


def moc_pozorna_z_nastawy_mva(moc_czynna_mw: float, cos_phi: float | None) -> float:
    """Człon nastawy: |P| / cosφ, a bez cosφ z (0; 1] — |P| (dolna granica mocy pozornej).
    Jedyna definicja tego członu (kontrola O-53, podgląd doboru TR blokowego)."""
    if cos_phi is not None and 0.0 < cos_phi <= 1.0:
        return moc_pozorna_z_czynnej_mva(abs(moc_czynna_mw), cos_phi)
    return abs(moc_czynna_mw)


def sprawdz_moc_transformatora(
    *,
    technologia: str,
    tabliczka: Mapping[str, Any],
    liczba_jednostek: int,
    moc_czynna_mw: float | None,
    wejscia: JawneWejsciaKontroliMocy,
    moc_transformatorow_mva: float | None,
) -> OdmowaKontroliMocy | None:
    """S_wym · k_j ≤ S_n,TR · k_obc. Brak transformatora (albo jego mocy) w torze —
    nie ma czego porównać (np. stacja bez transformatora)."""
    blad = blad_wejsc_kontroli_mocy(wejscia)
    if blad is not None:
        return blad
    if moc_transformatorow_mva is None or moc_transformatorow_mva <= 0.0:
        return None
    s_wymagana = moc_pozorna_wymagana_mva(
        technologia=technologia,
        tabliczka=tabliczka,
        liczba_jednostek=liczba_jednostek,
        moc_czynna_mw=moc_czynna_mw,
        cos_phi=wejscia.cos_phi,
    )
    if s_wymagana is None:
        return None
    k_j = BEZ_REDUKCJI
    if wejscia.wspolczynnik_jednoczesnosci is not None:
        k_j = wejscia.wspolczynnik_jednoczesnosci
    k_obc = BEZ_REDUKCJI
    if wejscia.przeciazalnosc_transformatora_pu is not None:
        k_obc = wejscia.przeciazalnosc_transformatora_pu
    obciazenie = s_wymagana * k_j
    dopuszczalna = moc_transformatorow_mva * k_obc
    if obciazenie <= dopuszczalna + _TOLERANCJA_MVA:
        return None
    return OdmowaKontroliMocy(
        KOD_MOC_TRANSFORMATORA,
        (
            f"Moc wymagana źródła {technologia} ({mva_na_kva(obciazenie):.0f} kVA = "
            f"max(S_n,jedn·n; P/cosφ) · k_j, k_j = {k_j:g}) przekracza dopuszczalną moc "
            f"transformatora ({mva_na_kva(dopuszczalna):.0f} kVA = S_n,TR · k_obc, "
            f"k_obc = {k_obc:g}). Wybierz mniejszy wariant źródła albo transformator o "
            "większej mocy."
        ),
    )


def technologia_generatora(generator: Mapping[str, Any]) -> str | None:
    """Technologia źródła przekształtnikowego z rodzaju generatora (`None` — nie dotyczy)."""
    return TECHNOLOGIA_WG_RODZAJU_GENERATORA.get(str(generator.get("gen_type") or ""))


def sprawdz_moc_generatora(
    generator: Mapping[str, Any],
    *,
    moc_transformatorow_mva: float | None,
    tabliczka: Mapping[str, Any] | None = None,
    sprawdz_nastawe: bool = True,
) -> OdmowaKontroliMocy | None:
    """Obie kontrole O-53 dla generatora z MODELU (rekord migawki): nastawa ≤ moc
    znamionowa instalacji oraz moc transformatora zasilającego (`moc_transformatorow_mva`
    wyznacza wołający z topologii). `tabliczka` — nowa tabliczka (przypisanie typu),
    inaczej `materialized_params` generatora; wejścia jawne z `meta.kontrola_mocy_zrodla`."""
    technologia = technologia_generatora(generator)
    if technologia is None:
        return None
    if tabliczka is None:
        zapis = generator.get("materialized_params")
        tabliczka = zapis if isinstance(zapis, Mapping) else {}
    liczba_jednostek = liczba_jednostek_zrodla(generator)
    moc_czynna = _liczba(generator.get("p_mw"))
    if sprawdz_nastawe:
        blad = sprawdz_nastawe_zrodla(
            technologia=technologia,
            tabliczka=tabliczka,
            liczba_jednostek=liczba_jednostek,
            moc_czynna_mw=moc_czynna,
        )
        if blad is not None:
            return blad
    return sprawdz_moc_transformatora(
        technologia=technologia,
        tabliczka=tabliczka,
        liczba_jednostek=liczba_jednostek,
        moc_czynna_mw=moc_czynna,
        wejscia=JawneWejsciaKontroliMocy.z_meta(generator.get("meta")),
        moc_transformatorow_mva=moc_transformatorow_mva,
    )


def moc_pozorna_wymagana_generatora_mva(generator: Mapping[str, Any]) -> float | None:
    """max(S_n,jedn · n, |P|/cosφ) generatora z modelu — ta sama wielkość, którą kontrola
    O-53 porównuje z transformatorem (bez współczynnika jednoczesności)."""
    technologia = technologia_generatora(generator)
    if technologia is None:
        return None
    zapis = generator.get("materialized_params")
    return moc_pozorna_wymagana_mva(
        technologia=technologia,
        tabliczka=zapis if isinstance(zapis, Mapping) else {},
        liczba_jednostek=liczba_jednostek_zrodla(generator),
        moc_czynna_mw=_liczba(generator.get("p_mw")),
        cos_phi=JawneWejsciaKontroliMocy.z_meta(generator.get("meta")).cos_phi,
    )
