"""Pin kanonicznego zbioru DER `GEN_TYPES_PRZEKSZTALTNIKOWE` (dlugi 7 i 8 z V12K-321).

Zbior definiuje KLASE urzadzen przeksztaltnikowych (certyfikacja PTPiREE,
testy NC RfG, bramy gotowosci, walidator E028/E029). Do tej naprawy zyl w
czterech kopiach (dwie identyczne, jedna z luka podciagowa w bramie
transformatora, jedna o INNEJ semantyce — klasyfikacja zwarciowa IEC 60909
pod ta sama nazwa). Piny ponizej trzymaja trzy niezmienniki:

1. zbior == Literal `Generator.gen_type` minus `synchronous` — nowy typ DER
   w modelu MUSI wejsc do klasy (albo swiadomie ja zmienic),
2. konsumenci predykatu DER uzywaja DOKLADNIE tego samego obiektu (zero kopii),
3. klasyfikacja zwarciowa pozostaje ODREBNA semantycznie, ale POKRYWA cala
   klase DER (kazdy typ przeksztaltnikowy ma model zwarciowy: pelny
   przeksztaltnik ALBO maszyna wirujaca).
"""

from typing import get_args

from application.ncrfg_compliance import model_bridge
from enm import domain_operations, mapping
from enm.models import GEN_TYPES_PRZEKSZTALTNIKOWE, Generator


def _wartosci_literalu_gen_type() -> set[str]:
    adnotacja = Generator.model_fields["gen_type"].annotation  # Literal[...] | None
    literal = next(a for a in get_args(adnotacja) if a is not type(None))
    return set(get_args(literal))


def test_zbior_der_rowna_sie_literalowi_modelu_minus_synchronous() -> None:
    assert GEN_TYPES_PRZEKSZTALTNIKOWE == _wartosci_literalu_gen_type() - {"synchronous"}, (
        "GEN_TYPES_PRZEKSZTALTNIKOWE rozjechal sie z Literalem Generator.gen_type — "
        "nowy typ generatora wymaga decyzji: DER (dopisz do zbioru) czy maszyna "
        "synchroniczna (dopisz do wyjatkow tego testu)"
    )


def test_konsumenci_predykatu_der_uzywaja_tego_samego_obiektu() -> None:
    assert domain_operations._GEN_TYPES_PRZEKSZTALTNIKOWE is GEN_TYPES_PRZEKSZTALTNIKOWE
    assert model_bridge._INVERTER_GEN_TYPES is GEN_TYPES_PRZEKSZTALTNIKOWE


def test_klasyfikacja_zwarciowa_odrebna_ale_pokrywa_cala_klase_der() -> None:
    pelne_przeksztaltniki = set(mapping.FULL_CONVERTER_SC_GEN_TYPES)
    maszyny_wirujace = set(mapping._ASYNC_GEN_TYPES)
    # Rozlacznosc: typ ma dokladnie jeden model zwarciowy.
    assert not pelne_przeksztaltniki & maszyny_wirujace
    # Pokrycie: kazdy typ DER ma klasyfikacje zwarciowa IEC 60909.
    assert pelne_przeksztaltniki | maszyny_wirujace == GEN_TYPES_PRZEKSZTALTNIKOWE, (
        "Typ DER bez klasyfikacji zwarciowej (albo klasyfikacja typu spoza klasy "
        "DER) — uzupelnij enm/mapping.py przy zmianie Literalu gen_type"
    )
