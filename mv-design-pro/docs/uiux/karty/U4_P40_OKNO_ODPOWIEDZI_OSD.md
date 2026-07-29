# KARTA ZADANIA P40 — OKNO „ODPOWIEDŹ NA POLECENIA OSD"

**Faza:** U4 · **Epik:** E11 · **Wykonawca:** Opus · **Zależność twarda:** D7 scalona
(końcówka osd-response). **Wiążące:** `PROPOZYCJE_ROZSZERZEN` P40, `MODEL_INTERAKCJI`
§2.7, CLAUDE.md (zero ocen lokalnych, PL-only).

## 1. Cel
Okno „Odpowiedź na polecenia OSD": wybór źródła (DER — wzorzec pulpit/FRT) + rodzaju
polecenia (ograniczenie mocy czynnej do X% Pn / zadany cosφ / zadana Q / odpowiedź
częstotliwościowa przy zadanej f) + parametrów polecenia (formularz z hintami PL
i wartościami wstępnymi — wg SPEC_KREATORY) → jawny bieg końcówki D7 → prezentacja:
1. **Porównanie przed/po** (karty liczbowe): P/Q źródła, straty sieci — wartości
   obu biegów obok siebie + delta (arytmetyka prezentacji z komentarzem).
2. **Tabela napięć węzłów** (wzorzec `TabelaWynikow`): węzeł, U przed [p.u.],
   U po [p.u.], ΔU (sortKey) — tag przy przekroczeniu pasma (flaga z odpowiedzi,
   jeżeli jest; inaczej bez tagu — bez oceny lokalnej; ZBADAJ odpowiedź).
3. **Ślad WHITE BOX** rozwijany (reużycie `SladAnalizy` adapterem — wzór P41/P30):
   co nadpisano + wyniki obu biegów; hash w trybie eksperckim.

## 2. Pliki (TYLKO `frontend/src/ui2/oze/osd/**` + rozszerzenie `ui2/oze/api.ts` + re-eksport `ui2/oze/index.ts`)
`EkranOsd.tsx`, `osdModel.ts`, `strings.ts`, `osd.css`, `index.ts`, `__tests__/`
(≥ 16 testów; fixtures 1:1 z odpowiedzią D7 — ZBADAJ `application/analyses/
odpowiedz_osd.py`; vi.mock API).

## 3. Kryteria
(1) formularz polecenia z hintami i prefill + jawny bieg + stany uczciwe (brak DER,
błąd końcówki PL), (2) porównanie przed/po z deltami, (3) tabela napięć z ΔU,
(4) ślad przez reużycie + hash ekspercko, (5) pełne bramki jak E1.1 §8. Commit
`feat(ui2/oze): okno odpowiedzi na polecenia OSD (P40)` BEZ push. Raport standardowy.
