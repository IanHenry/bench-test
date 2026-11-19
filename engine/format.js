/*
 * format.js - engineering notation shared by every bench.
 *
 * toPrecision flips to exponential once the exponent reaches the precision,
 * turning 197.3 into "2.0e+2". Round-tripping through Number() avoids that,
 * so an axis label reads "197 mA" rather than scientific notation.
 */

const SI_PREFIXES = [
  [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''],
  [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']
];

/** Trim a number to `sig` significant figures without exponential notation. */
const trim = (x, sig) => String(Number(x.toPrecision(sig || 4)));

/** The same, with a true minus sign, for text a reader sees. */
const trimText = (x, sig) => trim(x, sig).replace(/^-/, MINUS);

/** Round to 4 s.f. so the displayed value, the formula and the netlist agree exactly. */
const round4 = v => parseFloat(v.toPrecision(4));

const NBSP = String.fromCharCode(160);   // no-break space
const MINUS = String.fromCharCode(0x2212);   // a true minus sign, not a hyphen

/**
 * 0.0001414 -> "141.4 µF". Pass a unit, get a unit. The number is joined to
 * its unit with a no-break space, so the two never split across a line.
 */
function eng(x, unit, sig) {
  sig = sig || 4;
  unit = unit || '';
  if (!isFinite(x)) return '—';
  if (x === 0) return '0' + NBSP + unit;
  const sign = x < 0 ? MINUS : '', a = Math.abs(x);
  for (let k = 0; k < SI_PREFIXES.length; k++) {
    const [mul, pre] = SI_PREFIXES[k];
    if (a < mul) continue;
    const s = trim(a / mul, sig);
    // 0.99999 V rounds up to "1000 mV": write it with the next prefix up, "1 V"
    if (Number(s) >= 1000 && k > 0) {
      const [up, upPre] = SI_PREFIXES[k - 1];
      return sign + trim(a / up, sig) + NBSP + upPre + unit;
    }
    return sign + s + NBSP + pre + unit;
  }
  return sign + trim(a / 1e-12, sig) + NBSP + 'p' + unit;
}

/** Same value with a bare SI suffix, the way you would type it into a netlist. */
function sci(v) {
  const a = Math.abs(v);
  for (const [mul, pre] of SI_PREFIXES) {
    if (a >= mul) return trim(v / mul, 4) + (pre === 'µ' ? 'u' : pre);
  }
  return String(v);
}

/** Slider position 0..1000 mapped logarithmically onto [lo, hi]. */
const logMap = (t, [lo, hi]) => lo * Math.pow(hi / lo, t / 1000);
const logUnmap = (v, [lo, hi]) => 1000 * Math.log(v / lo) / Math.log(hi / lo);

const API = { eng, sci, trim, trimText, round4, MINUS, logMap, logUnmap, SI_PREFIXES };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.Fmt = API;
