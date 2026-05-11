export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { upid } = req.query;
  if (!upid) return res.status(400).json({ error: "upid required" });

  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: "Shopify not configured" });
  }

  try {
    const tokenRes = await fetch("https://api.shopify.com/auth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
      }),
    });
    if (!tokenRes.ok) throw new Error("Shopify auth failed");
    const { access_token } = await tokenRes.json();

    const productRes = await fetch(
      `https://discover.shopifyapps.com/global/v2/p/${upid}`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    );
    if (!productRes.ok) throw new Error(`Product error ${productRes.status}`);
    const data = await productRes.json();
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
