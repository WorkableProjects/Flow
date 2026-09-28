/**
 * Periodic table data (hydrogen to xenon) and electron configurations for
 * the Elements app: aufbau order, Hund's rule, and the real exceptions
 * (Cr, Cu, Nb, Mo, Ru, Rh, Pd, Ag).
 */

export interface ChemElement {
  z: number;
  symbol: string;
  name: string;
  /** Standard atomic weight (rounded). */
  mass: number;
}

const DATA = `H Hydrogen 1.008|He Helium 4.0026|Li Lithium 6.94|Be Beryllium 9.0122|B Boron 10.81|C Carbon 12.011|N Nitrogen 14.007|O Oxygen 15.999|F Fluorine 18.998|Ne Neon 20.180|Na Sodium 22.990|Mg Magnesium 24.305|Al Aluminium 26.982|Si Silicon 28.085|P Phosphorus 30.974|S Sulfur 32.06|Cl Chlorine 35.45|Ar Argon 39.948|K Potassium 39.098|Ca Calcium 40.078|Sc Scandium 44.956|Ti Titanium 47.867|V Vanadium 50.942|Cr Chromium 51.996|Mn Manganese 54.938|Fe Iron 55.845|Co Cobalt 58.933|Ni Nickel 58.693|Cu Copper 63.546|Zn Zinc 65.38|Ga Gallium 69.723|Ge Germanium 72.630|As Arsenic 74.922|Se Selenium 78.971|Br Bromine 79.904|Kr Krypton 83.798|Rb Rubidium 85.468|Sr Strontium 87.62|Y Yttrium 88.906|Zr Zirconium 91.224|Nb Niobium 92.906|Mo Molybdenum 95.95|Tc Technetium 98|Ru Ruthenium 101.07|Rh Rhodium 102.91|Pd Palladium 106.42|Ag Silver 107.87|Cd Cadmium 112.41|In Indium 114.82|Sn Tin 118.71|Sb Antimony 121.76|Te Tellurium 127.60|I Iodine 126.90|Xe Xenon 131.29`;

export const ELEMENTS: ChemElement[] = DATA.split('|').map((row, i) => {
  const [symbol, name, mass] = row.split(' ');
  return { z: i + 1, symbol, name, mass: +mass };
});

export const MAX_Z = ELEMENTS.length;

export const elementByZ = (z: number) => ELEMENTS[Math.max(1, Math.min(MAX_Z, Math.round(z))) - 1];

export function findElement(q: string): ChemElement | undefined {
  const s = q.trim().toLowerCase();
  if (!s) return undefined;
  if (/^\d+$/.test(s)) return ELEMENTS[+s - 1];
  return ELEMENTS.find((e) => e.symbol.toLowerCase() === s) ?? ELEMENTS.find((e) => e.name.toLowerCase().startsWith(s));
}

export type SubshellLetter = 's' | 'p' | 'd' | 'f';
const LETTERS: SubshellLetter[] = ['s', 'p', 'd', 'f'];

export interface Subshell {
  n: number;
  l: number;
  electrons: number;
}

export const subshellName = (s: { n: number; l: number }) => `${s.n}${LETTERS[s.l]}`;
export const capacity = (l: number) => 2 * (2 * l + 1);

/** Aufbau (Madelung) filling order up to 5p. */
export const AUFBAU: { n: number; l: number }[] = [
  [1, 0], [2, 0], [2, 1], [3, 0], [3, 1], [4, 0], [3, 2], [4, 1], [5, 0], [4, 2], [5, 1],
].map(([n, l]) => ({ n, l }));

/** Ground states that break the aufbau pattern: an ns electron moves into (n−1)d. */
const EXCEPTIONS: Record<number, { d: number; s: number }> = {
  24: { d: 5, s: 1 }, 29: { d: 10, s: 1 },
  41: { d: 4, s: 1 }, 42: { d: 5, s: 1 }, 44: { d: 7, s: 1 }, 45: { d: 8, s: 1 }, 46: { d: 10, s: 0 }, 47: { d: 10, s: 1 },
};

/** Ground-state configuration in filling order (occupied subshells only). */
export function configuration(z: number): Subshell[] {
  let left = Math.max(1, Math.min(MAX_Z, Math.round(z)));
  const out: Subshell[] = [];
  for (const s of AUFBAU) {
    if (left <= 0) break;
    const e = Math.min(capacity(s.l), left);
    out.push({ ...s, electrons: e });
    left -= e;
  }
  const ex = EXCEPTIONS[Math.round(z)];
  if (ex) {
    const period = z > 36 ? 5 : 4;
    const s = out.find((x) => x.n === period && x.l === 0);
    const d = out.find((x) => x.n === period - 1 && x.l === 2);
    if (s && d) {
      s.electrons = ex.s;
      d.electrons = ex.d;
    }
  }
  return out.filter((x) => x.electrons > 0);
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (n: number) => String(n).split('').map((d) => SUP[+d]).join('');

/** "1s² 2s² 2p⁴" — written in shell order (3d before 4s), as textbooks do. */
export function configurationText(z: number): string {
  return configuration(z)
    .slice()
    .sort((a, b) => a.n - b.n || a.l - b.l)
    .map((s) => `${subshellName(s)}${sup(s.electrons)}`)
    .join(' ');
}

/** Electrons per shell (n = 1, 2, …), e.g. potassium → [2, 8, 8, 1]. */
export function shellCounts(z: number): number[] {
  const out: number[] = [];
  for (const s of configuration(z)) out[s.n - 1] = (out[s.n - 1] ?? 0) + s.electrons;
  return Array.from(out, (v) => v ?? 0);
}

/** Hund's rule: spins per orbital of a subshell (1 = up only, 2 = paired). */
export function orbitalFilling(l: number, electrons: number): number[] {
  const orbitals = 2 * l + 1;
  return Array.from({ length: orbitals }, (_, i) => (electrons > i ? 1 : 0) + (electrons > orbitals + i ? 1 : 0));
}
