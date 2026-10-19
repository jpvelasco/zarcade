// Size-scaled physics constants, shared by the simulation and by the
// terrain builder (which lays balloon things along a real jump arc).
export const REF = 20; // reference diameter (cm) the constants are tuned at

// A bigger ball falls harder and rolls faster, but less than in proportion,
// so it feels heavier and grander without crawling.
export function physicsFor(D) {
  const s = D / REF;
  const G = 980 * Math.sqrt(s);
  const vmax = 250 * Math.pow(s, 0.75);
  return { G, vmax, vnat: vmax * 0.72, jumpH: D * 1.3 + 10 * Math.sqrt(s) };
}
