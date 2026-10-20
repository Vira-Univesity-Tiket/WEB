// One submission per continuously visible code; another code is ready immediately.
export const createScanGate = (clearAfterMs = 750) => {
  let previous = '';
  let emptySince: number | null = null;
  return (value: string, now: number): boolean => {
    if (!value) {
      emptySince ??= now;
      if (now - emptySince >= clearAfterMs) previous = '';
      return false;
    }
    emptySince = null;
    if (value === previous) return false;
    previous = value;
    return true;
  };
};
