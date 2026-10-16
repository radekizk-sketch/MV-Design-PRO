/**
 * Po biegu: bieg e2e nie zmienił drzewa repozytorium (`straznikDrzewa.ts`, karta SZYBKIE-TESTY).
 */
import { sprawdzStanPoBiegu } from './straznikDrzewa';

export default async function globalTeardown(): Promise<void> {
  sprawdzStanPoBiegu();
}
