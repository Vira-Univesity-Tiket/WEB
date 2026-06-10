// cPanel/Passenger bootstrap:
// Passenger may load startup files with CommonJS `require`, so we bridge to ESM.
(async () => {
  try {
    await import('./server.js');
  } catch (error) {
    console.error('Failed to start backend via loader.cjs:', error);
    process.exit(1);
  }
})();
