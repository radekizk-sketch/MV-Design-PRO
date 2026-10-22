# NORMATIVE COMPLETION PACK — IEC 60909-0:2016 (karta projektowa 4.1; audyt odniesień)

**Status:** CANONICAL & BINDING  
**Język:** PL  
**Zakres:** Zwarcia asymetryczne (1F-Z, 2F, 2F-Z), ślad obliczeń White-Box, pakiet dowodowy, deterministyczne artefakty.


> **RED TEAM II (2026-10-22):** wcześniejsze odwołania do §§4.1–4.8 jako paragrafów obliczeniowych IEC 2016 były błędne: rozdział 4 dotyczy oznaczeń. Mapa poniżej jest korektą lokalizacji tematów, nie potwierdzeniem poprawności wszystkich wzorów. Uogólniony mianownik `K` w EQ_SC1_008 wymaga jawnej definicji zależnej od rodzaju zwarcia. `I_dyn` jest projekcyjną nazwą wielkości do oceny dynamicznej, nie osobnym wynikiem zadekretowanym przytoczonym punktem IEC 60909-0. Źródło spisu treści: https://elstandard.se/documents/preview/1694801. Niezależny audyt w `docs/norms/iec60909/RED_TEAM_FIZYKA_I_ZRODLA_2026_10_22.md`.

## 1. Cel i zakres audytowy

Dokument stanowi mapowanie: **norma → równanie → implementacja → krok dowodu → wynik** dla IEC 60909-0:2016 (przede wszystkim pkt 5.3, rozdziały 7, 8, 14) w zakresie domknięcia asymetrycznych zwarć oraz post-fault outputs:
- I″k,
- κ,
- ip,
- I_th,
- I_dyn.

Zakres implementacyjny obejmuje wyłącznie warstwę śladu i pakietu dowodowego (bez modyfikacji solvera i bez zmian zamrożonego API wyników).

## 2. Reguła anti-double-counting współczynnika napięciowego c

**Reguła wiążąca:** współczynnik napięciowy **c występuje dokładnie raz** w ścieżce asymetrycznej SC1 — tylko w **EQ_SC1_008** (I″k).  
**Zabronione:** użycie c w EQ_SC1_001–007 i EQ_SC1_009–012.

Mechanizm egzekucji w kodzie:
1. Audit dictionary `SC1_PROOF_EQUATIONS_AUDIT` z mapą eq→bool.
2. Twarda walidacja `verify_sc1()`.
3. Test negatywny: po wymuszeniu c poza EQ_SC1_008 walidacja musi zwrócić FAIL.

## 3. Mapa normatywna i implementacyjna

| Norma | Rozdział / Eq. | Treść (parafraza) | Wzór LaTeX | Implementacja (plik) | ID równania | Builder kroku dowodu | Wynik |
|---|---|---|---|---|---|---|---|
| IEC 60909-0:2016 | §5.3.2; §7.3–7.5 | Składowe symetryczne i impedancje sekwencyjne jako baza zwarć niesymetrycznych. | $$Z_k=f(Z_1,Z_2,Z_0)$$ | `backend/src/application/proof_engine/proof_generator.py` | EQ_SC1_001–005 | `_create_sc1_step_z_sequence`, `_create_sc1_step_equiv_impedance` | Z_k |
| IEC 60909-0:2016 | §5.3.2; §7.3–7.5 | Wyznaczenie prądów składowych i rekonstrukcja prądów fazowych operatorem Fortescue. | $$I_1=\frac{U_f}{Z_k},\;[I_a,I_b,I_c]=g(I_0,I_1,I_2,a)$$ | `backend/src/application/proof_engine/proof_generator.py` | EQ_SC1_006–007 | `_create_sc1_step_sequence_currents`, `_create_sc1_step_phase_currents` | I_1, I_2, I_0, I_a, I_b, I_c |
| IEC 60909-0:2016 | §5.3.1; §7.1–7.5; numer równania DO WERYFIKACJI | Początkowy prąd zwarciowy I″k wyznaczany z udziałem c i impedancji zastępczej. | $$I_k''=\frac{c\,U_n}{K\,|Z_k|}$$ | `backend/src/application/proof_engine/equation_registry.py`, `backend/src/application/proof_engine/proof_generator.py` | EQ_SC1_008 | `_create_sc1_step_ikss` | I″k |
| IEC 60909-0:2016 | §8.1 (zakres κ; sposób zależy od konfiguracji sieci) | Współczynnik udaru κ z relacji R/X toru zastępczego. | $$\kappa=1.02+0.98e^{-3R_k/X_k}$$ | `backend/src/application/proof_engine/equation_registry.py`, `backend/src/application/proof_engine/proof_generator.py` | EQ_SC1_009 | `_create_sc1_step_kappa` | κ |
| IEC 60909-0:2016 | §8 (ip; numer równania DO WERYFIKACJI) | Prąd udarowy ip jako funkcja κ i I″k. | $$i_p=\kappa\sqrt{2}\,I_k''$$ | `backend/src/application/proof_engine/equation_registry.py`, `backend/src/application/proof_engine/proof_generator.py` | EQ_SC1_010 | `_create_sc1_step_ip` | ip |
| IEC 60909-0:2016 | §14 oraz załącznik normatywny A (m,n) | Prąd cieplny równoważny I_th w oknie czasowym t_k. | $$I_{th}=I_k''\sqrt{m+n}$$ | `backend/src/application/proof_engine/equation_registry.py`, `backend/src/application/proof_engine/proof_generator.py` | EQ_SC1_011 | `_create_sc1_step_ith` | I_th |
| Pozycja POCHODNA projektu; ip wg IEC 60909-0:2016 §8; nazwa I_dyn wymaga osobnego uzasadnienia | Prąd dynamiczny I_dyn dla oceny sił elektrodynamicznych. | $$I_{dyn}=i_p$$ | `backend/src/application/proof_engine/equation_registry.py`, `backend/src/application/proof_engine/proof_generator.py` | EQ_SC1_012 | `_create_sc1_step_idyn` | I_dyn |

## 4. Spójność jednostek (reguły obowiązkowe)

Dla EQ_SC1_008–012 obowiązują aktywne reguły jednostek w silniku weryfikacji:
- EQ_SC1_008: `kV/Ω = kA`,
- EQ_SC1_009: bezwymiarowe κ,
- EQ_SC1_010: `— · — · kA = kA`,
- EQ_SC1_011: `kA · — = kA`,
- EQ_SC1_012: `kA = kA`.

Walidacja jednostek jest integralną częścią kroku dowodu i jest egzekwowana testem negatywnym.

## 5. Determinizm artefaktów

Wymóg audytowy: dla identycznego wejścia artefakty `proof.json` i `proof.tex` są identyczne byte-for-byte po normalizacji pól niestabilnych identyfikacyjnie (`document_id`, `artifact_id`, `created_at`).

Golden artifacts są wersjonowane w:
- `backend/tests/golden/sc_asymmetrical/1f_z/`,
- `backend/tests/golden/sc_asymmetrical/2f/`,
- `backend/tests/golden/sc_asymmetrical/2f_z/`.

## 6. Powierzchnia użytkowa eksportu

Pakiet dowodowy asymetryczny jest udostępniony przez eksport Proof/Trace jako dedykowany endpoint ZIP.  
Kontrakt zamrożonego Result API IEC 60909 pozostaje nienaruszony.

## 7. Wniosek audytowy

Historyczne domknięcie karty projektowej 4.1 dla asymetrycznych zwarć deklarowało następujące cechy (ich zgodność normowa wymaga osobnej walidacji):
- mapowania normatywnego,
- śladu White-Box,
- deterministycznych artefaktów golden,
- twardych bramek CI,
- egzekucji reguły anti-double-counting c.
