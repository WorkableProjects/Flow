/**
 * Equation library and symbol palette for the LaTeX app. In snippets, `|`
 * marks where the caret lands.
 */

export interface MathTemplate {
  name: string;
  tex: string;
}

export const LIBRARY: { group: string; items: MathTemplate[] }[] = [
  {
    group: 'Algebra',
    items: [
      { name: 'Quadratic formula', tex: String.raw`x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}` },
      { name: 'Slope-intercept', tex: String.raw`y = mx + b` },
      { name: 'Slope', tex: String.raw`m = \frac{y_2 - y_1}{x_2 - x_1}` },
      { name: 'Difference of squares', tex: String.raw`a^2 - b^2 = (a + b)(a - b)` },
      { name: 'Exponent rules', tex: String.raw`a^m \cdot a^n = a^{m+n}` },
      { name: 'Logarithm', tex: String.raw`\log_b x = \frac{\ln x}{\ln b}` },
      { name: 'Binomial theorem', tex: String.raw`(a+b)^n = \sum_{k=0}^{n} \binom{n}{k} a^{n-k} b^k` },
      { name: 'System of equations', tex: String.raw`\begin{cases} 2x + y = 5 \\ x - y = 1 \end{cases}` },
    ],
  },
  {
    group: 'Geometry & Trig',
    items: [
      { name: 'Pythagorean theorem', tex: String.raw`a^2 + b^2 = c^2` },
      { name: 'Distance formula', tex: String.raw`d = \sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}` },
      { name: 'Circle area', tex: String.raw`A = \pi r^2` },
      { name: 'Pythagorean identity', tex: String.raw`\sin^2\theta + \cos^2\theta = 1` },
      { name: 'Law of sines', tex: String.raw`\frac{a}{\sin A} = \frac{b}{\sin B} = \frac{c}{\sin C}` },
      { name: 'Law of cosines', tex: String.raw`c^2 = a^2 + b^2 - 2ab\cos C` },
      { name: 'Euler’s formula', tex: String.raw`e^{i\theta} = \cos\theta + i\sin\theta` },
    ],
  },
  {
    group: 'Calculus',
    items: [
      { name: 'Derivative (definition)', tex: String.raw`f'(x) = \lim_{h \to 0} \frac{f(x+h) - f(x)}{h}` },
      { name: 'Power rule', tex: String.raw`\frac{d}{dx} x^n = n x^{n-1}` },
      { name: 'Chain rule', tex: String.raw`\frac{dy}{dx} = \frac{dy}{du} \cdot \frac{du}{dx}` },
      { name: 'Fundamental theorem', tex: String.raw`\int_a^b f(x)\,dx = F(b) - F(a)` },
      { name: 'Integration by parts', tex: String.raw`\int u\,dv = uv - \int v\,du` },
      { name: 'Gaussian integral', tex: String.raw`\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}` },
      { name: 'Taylor series', tex: String.raw`f(x) = \sum_{n=0}^{\infty} \frac{f^{(n)}(a)}{n!}(x-a)^n` },
    ],
  },
  {
    group: 'Physics',
    items: [
      { name: 'Newton’s second law', tex: String.raw`\vec{F} = m\vec{a}` },
      { name: 'Kinematics', tex: String.raw`v^2 = v_0^2 + 2a\Delta x` },
      { name: 'Mass–energy', tex: String.raw`E = mc^2` },
      { name: 'Kinetic energy', tex: String.raw`K = \tfrac{1}{2} m v^2` },
      { name: 'Gravitation', tex: String.raw`F = G\frac{m_1 m_2}{r^2}` },
      { name: 'Ohm’s law', tex: String.raw`V = IR` },
      { name: 'Wave speed', tex: String.raw`v = f\lambda` },
    ],
  },
  {
    group: 'Chemistry',
    items: [
      { name: 'Ideal gas law', tex: String.raw`PV = nRT` },
      { name: 'Combustion of methane', tex: String.raw`\ce{CH4 + 2O2 -> CO2 + 2H2O}` },
      { name: 'Photosynthesis', tex: String.raw`\ce{6CO2 + 6H2O ->[light] C6H12O6 + 6O2}` },
      { name: 'Equilibrium', tex: String.raw`\ce{N2 + 3H2 <=> 2NH3}` },
      { name: 'pH', tex: String.raw`\mathrm{pH} = -\log[\ce{H+}]` },
      { name: 'Molarity', tex: String.raw`M = \frac{n}{V}` },
      { name: 'Gibbs free energy', tex: String.raw`\Delta G = \Delta H - T\Delta S` },
    ],
  },
  {
    group: 'Statistics',
    items: [
      { name: 'Mean', tex: String.raw`\bar{x} = \frac{1}{n}\sum_{i=1}^{n} x_i` },
      { name: 'Standard deviation', tex: String.raw`\sigma = \sqrt{\frac{1}{N}\sum_{i=1}^{N}(x_i - \mu)^2}` },
      { name: 'z-score', tex: String.raw`z = \frac{x - \mu}{\sigma}` },
      { name: 'Bayes’ theorem', tex: String.raw`P(A \mid B) = \frac{P(B \mid A)\,P(A)}{P(B)}` },
      { name: 'Combinations', tex: String.raw`\binom{n}{k} = \frac{n!}{k!\,(n-k)!}` },
    ],
  },
];

const GREEK: Record<string, string> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  pi: 'π',
  rho: 'ρ',
  sigma: 'σ',
  tau: 'τ',
  phi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
  Gamma: 'Γ',
  Delta: 'Δ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Pi: 'Π',
  Sigma: 'Σ',
  Phi: 'Φ',
  Psi: 'Ψ',
  Omega: 'Ω',
};

export interface MathSymbol {
  label: string;
  tex: string;
}

export const SYMBOLS: { group: string; items: MathSymbol[] }[] = [
  {
    group: 'Structures',
    items: [
      { label: 'a⁄b', tex: String.raw`\frac{|}{}` },
      { label: '√x', tex: String.raw`\sqrt{|}` },
      { label: 'ⁿ√x', tex: String.raw`\sqrt[|]{}` },
      { label: 'xⁿ', tex: '^{|}' },
      { label: 'xₙ', tex: '_{|}' },
      { label: '∑', tex: String.raw`\sum_{i=1}^{n} |` },
      { label: '∫', tex: String.raw`\int_{a}^{b} | \,dx` },
      { label: '∬', tex: String.raw`\iint | \,dA` },
      { label: '∮', tex: String.raw`\oint | ` },
      { label: 'lim', tex: String.raw`\lim_{x \to |}` },
      { label: 'd/dx', tex: String.raw`\frac{d}{dx}|` },
      { label: '∂/∂x', tex: String.raw`\frac{\partial |}{\partial x}` },
      { label: '( )', tex: String.raw`\left( | \right)` },
      { label: '[ ]', tex: String.raw`\left[ | \right]` },
      { label: '| |', tex: String.raw`\left| | \right|` },
      { label: 'x̄', tex: String.raw`\bar{|}` },
      { label: 'x⃗', tex: String.raw`\vec{|}` },
      { label: 'x̂', tex: String.raw`\hat{|}` },
      { label: 'Matrix', tex: String.raw`\begin{pmatrix} | & b \\ c & d \end{pmatrix}` },
      { label: 'Cases', tex: String.raw`\begin{cases} | & x > 0 \\ 0 & x \le 0 \end{cases}` },
      { label: 'Text', tex: String.raw`\text{|}` },
    ],
  },
  {
    group: 'Greek',
    items: 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi pi rho sigma tau phi chi psi omega Gamma Delta Theta Lambda Pi Sigma Phi Psi Omega'
      .split(' ')
      .map((n) => ({ label: GREEK[n], tex: `\\${n} ` })),
  },
  {
    group: 'Operators',
    items: [
      ['±', '\\pm '], ['∓', '\\mp '], ['×', '\\times '], ['÷', '\\div '], ['·', '\\cdot '], ['∘', '\\circ '],
      ['∇', '\\nabla '], ['∂', '\\partial '], ['∞', '\\infty '], ['°', '^\\circ '], ['!', '!'], ['′', "'"],
    ].map(([label, tex]) => ({ label, tex })),
  },
  {
    group: 'Relations',
    items: [
      ['≤', '\\le '], ['≥', '\\ge '], ['≠', '\\ne '], ['≈', '\\approx '], ['≡', '\\equiv '], ['∝', '\\propto '],
      ['∼', '\\sim '], ['≪', '\\ll '], ['≫', '\\gg '], ['⊥', '\\perp '], ['∥', '\\parallel '], ['≅', '\\cong '],
    ].map(([label, tex]) => ({ label, tex })),
  },
  {
    group: 'Arrows',
    items: [
      ['→', '\\to '], ['←', '\\leftarrow '], ['↔', '\\leftrightarrow '], ['⇒', '\\Rightarrow '], ['⇐', '\\Leftarrow '],
      ['⇔', '\\Leftrightarrow '], ['↦', '\\mapsto '], ['↑', '\\uparrow '], ['↓', '\\downarrow '], ['⇌', '\\rightleftharpoons '],
    ].map(([label, tex]) => ({ label, tex })),
  },
  {
    group: 'Sets & Logic',
    items: [
      ['∈', '\\in '], ['∉', '\\notin '], ['⊂', '\\subset '], ['⊆', '\\subseteq '], ['∪', '\\cup '], ['∩', '\\cap '],
      ['∅', '\\emptyset '], ['ℝ', '\\mathbb{R} '], ['ℤ', '\\mathbb{Z} '], ['ℕ', '\\mathbb{N} '], ['ℚ', '\\mathbb{Q} '], ['ℂ', '\\mathbb{C} '],
      ['∀', '\\forall '], ['∃', '\\exists '], ['¬', '\\neg '], ['∧', '\\land '], ['∨', '\\lor '], ['∴', '\\therefore '],
    ].map(([label, tex]) => ({ label, tex })),
  },
];
