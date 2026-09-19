"""Uziemienie punktu neutralnego — jedna reprezentacja: predykaty i migracja
(karta W5-A, `docs/plan/KARTA_W5_MODEL_FAZOWY_I_UZIEMIENIE_2026-09.md` §1 p. 1–2).

CO TU JEST (moduł-liść: wyłącznie stdlib, importowany przez ``enm/models.py``):

* ``blad_konfiguracji_uziemienia`` — JEDEN predykat spójności konfiguracji
  punktu neutralnego (``resistor_grounded`` bez R_N, ``petersen_coil`` bez X_N).
  Ten sam warunek czyta walidator (``E-W5-01``), operacje domenowe (odmowa
  nazwana na wejściu) i model składowej zerowej (odmowa fizyki) — predykaty
  parami z jednego źródła prawdy.
* ``migruj_uziemienie_slownika`` — migracja przy wczytaniu (Pydantic
  ``model_validator(mode="before")`` na ``EnergyNetworkModel``): skasowane
  reprezentacje zastanego zapisu przenoszone do jedynych nośników:
    - ``Bus.grounding`` → ``Source.neutral_grounding`` źródła na tej szynie
      (albo źródła tej samej stacji — źródło GPZ po stronie 110 kV nie stoi na
      szynie SN, którą dawny kreator uziemiał); brak źródła = utrata NAZWANA
      w raporcie (wpis dziennika zmian robi magazyn ``enm/store.py``),
    - ``substation.meta["nn_earthing_system"]`` → ``Transformer.lv_earthing_system``
      każdego transformatora stacji; stacja bez transformatora = utrata nazwana,
    - ``substation.meta["grounding"]`` / ``["zero_sequence"]`` — trzecia kopia
      wartości źródła (0 czytelników) — usuwane.
  Idempotentna (drugi przebieg nic nie zmienia), deterministyczna, nie
  mutuje słownika wołającego (kopiuje wyłącznie to, co zmienia).
"""

from __future__ import annotations

from collections.abc import Collection
from dataclasses import dataclass, field
from typing import Any

KLUCZ_META_UKLAD_NN = "nn_earthing_system"
KLUCZE_META_STACJI_USUWANE: tuple[str, ...] = ("grounding", "zero_sequence")


def blad_konfiguracji_uziemienia(
    typ: str | None, r_ohm: float | None, x_ohm: float | None
) -> str | None:
    """Komunikat błędu spójności konfiguracji punktu neutralnego albo ``None``.

    Rezystor NER i dławik Petersena mają NIEZEROWĄ, dominującą impedancję —
    brak jej wartości nie może być cicho podstawiony zerem (to zamieniłoby
    uziemienie impedancyjne w bezpośrednie i zawyżyło I''k1). Składowa
    przeciwna (X rezystora, R dławika) jest fizycznie pomijalna — dozwolony brak.
    """
    if typ == "resistor_grounded" and (r_ohm is None or r_ohm <= 0):
        return (
            "uziemienie przez rezystor wymaga dodatniej rezystancji R_N [Ω] "
            "(GroundingConfig.r_ohm) — nie wolno przyjąć R_N = 0"
        )
    if typ == "petersen_coil" and (x_ohm is None or x_ohm <= 0):
        return (
            "cewka Petersena wymaga dodatniej reaktancji dławika X_N [Ω] "
            "(GroundingConfig.x_ohm) — nie wolno przyjąć X_N = 0"
        )
    return None


def uziemienie_grounded(typ: str | None) -> bool:
    """Czy typ opisuje punkt neutralny POŁĄCZONY z ziemią (fizyka stawia 3·Z_N)."""
    return typ in ("directly_grounded", "resistor_grounded", "petersen_coil")


@dataclass(frozen=True)
class RaportMigracjiUziemienia:
    """Co migracja przeniosła, a co utraciła — z nazwą elementu i wartości."""

    przeniesione: tuple[str, ...] = ()
    utracone: tuple[str, ...] = ()
    usuniete_klucze_meta: tuple[str, ...] = ()

    @property
    def zmieniono(self) -> bool:
        return bool(self.przeniesione or self.utracone or self.usuniete_klucze_meta)

    def opis_pl(self) -> str:
        czesci: list[str] = []
        if self.przeniesione:
            czesci.append("przeniesione: " + "; ".join(self.przeniesione))
        if self.utracone:
            czesci.append("UTRACONE (brak nośnika): " + "; ".join(self.utracone))
        if self.usuniete_klucze_meta:
            czesci.append("usunięte klucze meta: " + "; ".join(self.usuniete_klucze_meta))
        return "Migracja uziemienia do jednej reprezentacji (W5-A) — " + " | ".join(czesci)


@dataclass
class _Stan:
    przeniesione: list[str] = field(default_factory=list)
    utracone: list[str] = field(default_factory=list)
    usuniete_meta: list[str] = field(default_factory=list)


def _lista(data: dict[str, Any], klucz: str) -> list[Any]:
    wartosc = data.get(klucz)
    return wartosc if isinstance(wartosc, list) else []


def _stacja_szyny(substations: list[Any], bus_ref: str) -> dict[str, Any] | None:
    for sub in substations:
        if isinstance(sub, dict) and bus_ref in (sub.get("bus_refs") or []):
            return sub
    return None


def _przenies_bus_grounding(data: dict[str, Any], stan: _Stan, kopie: dict[str, list[Any]]) -> None:
    buses = _lista(data, "buses")
    if not any(isinstance(b, dict) and "grounding" in b for b in buses):
        return
    sources = kopie.setdefault(
        "sources", [dict(s) if isinstance(s, dict) else s for s in _lista(data, "sources")]
    )
    substations = _lista(data, "substations")
    nowe_szyny: list[Any] = []
    for bus in buses:
        if not isinstance(bus, dict) or "grounding" not in bus:
            nowe_szyny.append(bus)
            continue
        bus = dict(bus)
        wartosc = bus.pop("grounding")
        nowe_szyny.append(bus)
        if wartosc is None:
            continue
        bus_ref = str(bus.get("ref_id") or "")
        cele = [s for s in sources if isinstance(s, dict) and s.get("bus_ref") == bus_ref]
        if not cele:
            stacja = _stacja_szyny(substations, bus_ref)
            if stacja is not None:
                cele = [
                    s
                    for s in sources
                    if isinstance(s, dict) and s.get("substation_ref") == stacja.get("ref_id")
                ]
        if not cele:
            stan.utracone.append(
                f"szyna {bus_ref}: uziemienie {wartosc!r} bez źródła na szynie ani w stacji"
            )
            continue
        for cel in cele:
            if cel.get("neutral_grounding") in (None, {}):
                cel["neutral_grounding"] = dict(wartosc) if isinstance(wartosc, dict) else wartosc
                stan.przeniesione.append(
                    f"szyna {bus_ref} → źródło {cel.get('ref_id')}: neutral_grounding={wartosc!r}"
                )
            elif cel.get("neutral_grounding") != wartosc:
                stan.utracone.append(
                    f"szyna {bus_ref}: uziemienie {wartosc!r} sprzeczne z "
                    f"neutral_grounding źródła {cel.get('ref_id')} (nowsze wygrywa)"
                )
    kopie["buses"] = nowe_szyny


def _przenies_meta_stacji(
    data: dict[str, Any],
    stan: _Stan,
    kopie: dict[str, list[Any]],
    uklady_nn: Collection[str],
) -> None:
    substations = _lista(data, "substations")
    klucze = (KLUCZ_META_UKLAD_NN, *KLUCZE_META_STACJI_USUWANE)
    if not any(
        isinstance(s, dict)
        and isinstance(s.get("meta"), dict)
        and any(k in s["meta"] for k in klucze)
        for s in substations
    ):
        return
    transformers = kopie.setdefault(
        "transformers",
        [dict(t) if isinstance(t, dict) else t for t in _lista(data, "transformers")],
    )
    tr_wg_ref = {t.get("ref_id"): t for t in transformers if isinstance(t, dict)}
    nowe_stacje: list[Any] = []
    for sub in substations:
        meta = sub.get("meta") if isinstance(sub, dict) else None
        if not isinstance(meta, dict) or not any(k in meta for k in klucze):
            nowe_stacje.append(sub)
            continue
        sub = dict(sub)
        meta = dict(meta)
        sub["meta"] = meta
        nowe_stacje.append(sub)
        sub_ref = str(sub.get("ref_id") or "")
        for klucz in KLUCZE_META_STACJI_USUWANE:
            if klucz in meta:
                meta.pop(klucz)
                stan.usuniete_meta.append(f"stacja {sub_ref}: meta.{klucz}")
        if KLUCZ_META_UKLAD_NN not in meta:
            continue
        uklad = meta.pop(KLUCZ_META_UKLAD_NN)
        if uklad not in uklady_nn:
            stan.utracone.append(
                f"stacja {sub_ref}: meta.{KLUCZ_META_UKLAD_NN}={uklad!r} spoza słownika układów nN"
            )
            continue
        cele = [tr_wg_ref[ref] for ref in (sub.get("transformer_refs") or []) if ref in tr_wg_ref]
        if not cele:
            stan.utracone.append(
                f"stacja {sub_ref}: układ nN {uklad!r} bez transformatora w stacji"
            )
            continue
        for tr in cele:
            if tr.get("lv_earthing_system") is None:
                tr["lv_earthing_system"] = uklad
                stan.przeniesione.append(
                    f"stacja {sub_ref} → transformator {tr.get('ref_id')}: lv_earthing_system={uklad}"
                )
            elif tr.get("lv_earthing_system") != uklad:
                stan.utracone.append(
                    f"stacja {sub_ref}: układ nN {uklad!r} sprzeczny z lv_earthing_system "
                    f"transformatora {tr.get('ref_id')} (nowsze wygrywa)"
                )
    kopie["substations"] = nowe_stacje


def migruj_uziemienie_slownika(
    data: dict[str, Any], *, uklady_nn: Collection[str]
) -> tuple[dict[str, Any], RaportMigracjiUziemienia]:
    """Migracja surowej migawki ENM (słownik) do jednej reprezentacji uziemienia.

    ``uklady_nn`` — słownik układów nN z ``enm.models.UKLADY_SIECI_NN`` (jedyna
    definicja; ten moduł jest liściem importowanym przez ``models.py``, więc
    dostaje go parametrem). Zwraca (migawka, raport). Bez zmian → TEN SAM
    obiekt i pusty raport.
    """
    stan = _Stan()
    kopie: dict[str, list[Any]] = {}
    _przenies_bus_grounding(data, stan, kopie)
    _przenies_meta_stacji(data, stan, kopie, uklady_nn)
    raport = RaportMigracjiUziemienia(
        przeniesione=tuple(stan.przeniesione),
        utracone=tuple(stan.utracone),
        usuniete_klucze_meta=tuple(stan.usuniete_meta),
    )
    if not kopie:
        return data, raport
    wynik = dict(data)
    wynik.update(kopie)
    return wynik, raport


def raport_migracji_uziemienia(
    data: dict[str, Any], *, uklady_nn: Collection[str]
) -> RaportMigracjiUziemienia:
    """Sam raport (bez migawki) — dla magazynu, który loguje utraty do dziennika."""
    return migruj_uziemienie_slownika(data, uklady_nn=uklady_nn)[1]
