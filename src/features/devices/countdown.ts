const two = (n: number) => String(n).padStart(2, '0');

/** Seconds as m:ss, in Latin digits: it is read next to the pairing code. */
export const countdown = (seconds: number) => `${Math.floor(seconds / 60)}:${two(seconds % 60)}`;
