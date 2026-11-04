export default async function stopFixture() {
  const results = await Promise.allSettled(
    [5017, 5018].map(async (port) => {
      const response = await fetch(
        `http://127.0.0.1:${port}/__fixture/shutdown`,
        {
          method: "POST",
          headers: {
            "x-vira-fixture-key": process.env.VIRA_BROWSER_FIXTURE_KEY || "",
          },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok || !(await response.json()).ok)
        throw new Error("BROWSER_FIXTURE_CLEANUP_FAILED");
    }),
  );
  if (results.some((result) => result.status === "rejected"))
    throw new Error("BROWSER_FIXTURE_CLEANUP_FAILED");
}
