export const logError = (event, error) => {
  console.error(event, {
    code: error?.code || error?.name || 'UNEXPECTED_ERROR',
    errno: error?.errno,
    // Keep call sites for diagnosis while excluding SQL text, arguments and error payloads.
    frames: typeof error?.stack === 'string' ? error.stack.split('\n').slice(1, 6).filter(line => /^\s+at /.test(line)) : []
  });
};
