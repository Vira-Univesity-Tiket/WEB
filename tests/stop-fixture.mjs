export default async function stopFixture() {
  const response = await fetch('http://127.0.0.1:5017/__fixture/shutdown', {
    method: 'POST',
    headers: { 'x-vira-fixture-key': process.env.VIRA_BROWSER_FIXTURE_KEY || '' },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok || !(await response.json()).ok) throw new Error('BROWSER_FIXTURE_CLEANUP_FAILED');
}
