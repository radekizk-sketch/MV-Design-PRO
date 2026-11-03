# Zgodność odsyłaczy IEC 60909-0:2016 — audyt dokumentacji

Źródło: załączony przez właściciela skan **PN-EN 60909-0:2016**, 82 strony; w sekcjach IEC: strona wydrukowana = strona PDF - 8. Raport porównuje przypisania w `docs/proof_engine/EQUATIONS_IEC60909_SC3F.md` i `docs/proof/NORMATIVE_COMPLETION_PACK_IEC_60909.md` do **tego wydania**, bez twierdzeń o stanie solvera.

| Istniejący identyfikator | Błędny odsyłacz w dokumencie repo | Załączony skan, właściwy odsyłacz | Stan |
|---|---|---|---|
| `EQ_SC3F_002`: ZQ | wzór (10) | §6.2, wzór **(4)**, IEC s. 23 / PDF 31; wzór (10) dotyczy TR 3-uzwojeniowego | rozbieżność |
| `EQ_SC3F_004`: Iʺk 3F | wzór (29) | §7.2.1, wzór **(33)**, IEC s. 43 / PDF 51 | rozbieżność |
| `EQ_SC3F_005`: κ | wzór (55) | §8.1.1, wzór **(57)**, IEC s. 50 / PDF 58 | rozbieżność |
| `EQ_SC3F_006`: ip | wzór (54) | §8.1.1, wzór **(56)**, IEC s. 49 / PDF 57 | rozbieżność |
| `EQ_SC3F_007`: Sʺk | wzór (33) | definicja w §3.6, IEC s. 9 / PDF 17; wzór (33) opisuje prąd 3F | rozbieżność |
| `EQ_SC3F_008`: Ith | wzory (100)–(105) | §14, wzory (108)–(112), IEC s. 65–66 / PDF 73–74; załącznik A, IEC s. 68 / PDF 76 | rozbieżność |

Dodatkowo: dokument `NORMATIVE_COMPLETION_PACK_IEC_60909.md` przypisuje obliczenia niesymetryczne do §4.2–4.8, natomiast §4 niniejszego wydania to oznaczenia i symbole, a obliczenia typów zwarć znajdują się w §7.3–7.5 i udarowe w §8.

**P0 do weryfikacji w kodzie:** w tablicy 1 dla SN 15 kV: `cmin=1,00`, a nie `0,95` (IEC s. 22 / PDF 30). Obecność przykładu z 0,95 nie jest dowodem błędu produkcyjnego solvera. Wymagana niezależna sonda konfiguracji MAX/MIN z rzeczywistą ścieżką wejścia.

**Granica audytu:** odsyłacze dokumentacyjne nie stanowią dowodu błędnych wartości obliczeniowych. Nie zmieniono zamrożonych identyfikatorów `EQ_SC3F_*`, wzorów solvera ani kontraktów wyników. `c` w impedancji źródła z zadanych warunków zwarciowych (np. §6.2) i w źródle napięciowym musi być interpretowane w pełnym kontekście metody, a nie mechanicznie liczone jako „dwa użycia c”.
