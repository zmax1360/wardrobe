/**
 * Mock “scrape” for store URLs — replace with real headless / affiliate API.
 */
export async function mockScrapeProductFromUrl(url) {
  if (!url || typeof url !== "string" || !url.trim()) {
    throw new Error("Paste a product URL");
  }
  await new Promise((r) => setTimeout(r, 700));
  const hash = Math.abs(url.split("").reduce((a, c) => a + c.charCodeAt(0), 0));
  const mockPrice = 49 + (hash % 200);
  return {
    title: "Imported piece (mock)",
    price: mockPrice,
    mockPrice,
    imageUrl: `https://picsum.photos/seed/fos${hash}/400/520`,
    sourceUrl: url.trim(),
  };
}
