"""Kontrakty wyniku kanonicznego poza `domain/result_contract_v1.py` (karta W6-1).

`ResultSetV1` (statyczny: rozpływ/zwarcie) mieszka w `domain/result_contract_v1.py`
i pozostaje NIETKNIETY (A-13). `ResultSetDynamicV2` (czasowy) jest OSOBNYM
kontraktem w tym pakiecie — ten sam rejestr biegow (`CanonicalRun`), inny ksztalt
wyniku, zero rozszerzenia FROZEN kontraktu statycznego.
"""
