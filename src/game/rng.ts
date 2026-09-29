// Tiny seeded PRNG (mulberry32). Both multiplayer clients derive the same
// layout from the room seed; AI mode seeds from Date.now(). Worklet-safe.
export const mulberry32 = (seed: number) => {
  'worklet';
  let a = seed >>> 0;
  return () => {
    'worklet';
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// Layout for round `index` of a seed. Each client draws ITSELF on the left, so
// the layout is expressed per role: host's pillar, guest's pillar, and the
// horizontal gap (as a fraction of width). Mirroring keeps distances identical
// on both phones, which is what makes the shared sim line up.
export const layoutFor = (seed: number, index: number) => {
  'worklet';
  const rnd = mulberry32(seed + index * 7919);
  return {
    gapFrac: 0.4 + rnd() * 0.32, // opponent x = selfX + gapFrac * w
    hostPillar: 30 + rnd() * 90,
    guestPillar: 30 + rnd() * 90,
  };
};
