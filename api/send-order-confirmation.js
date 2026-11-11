export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    clientEmail,
    clientName,
    brandName,
    itemName,
    itemSize,
    itemColor,
    itemPrice,
    productUrl,
    clientAddress,
  } = req.body || {};

  if (!clientEmail || !brandName || !itemName) {
    return res.status(400).json({ error: 'Missing required order fields' });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const senderEmail = process.env.SENDER_EMAIL || 'StylePool MTL <onboarding@resend.dev>';

  // If RESEND_API_KEY is not configured yet, return simulated success for testing
  if (!resendApiKey) {
    console.log(`[SIMULATED EMAIL TO ${clientEmail}]: Order placed for ${itemName} (${brandName})`);
    return res.status(200).json({
      success: true,
      simulated: true,
      message: `Simulated confirmation email sent to ${clientEmail}`,
    });
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: senderEmail,
        to: [clientEmail],
        subject: `Order Confirmed! Your ${brandName} item has been ordered`,
        html: `
          <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <h2 style="color: #0f172a; margin-top: 0;">Great news, ${clientName}!</h2>
            <p style="color: #334155; line-height: 1.6;">
              Your pooled clothing order with <strong>${brandName}</strong> has officially been placed by our Montreal admin team. You paid <strong>$0.00 in shipping</strong>!
            </p>
            <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 4px 0;"><strong>Brand:</strong> ${brandName}</p>
              <p style="margin: 4px 0;"><strong>Item:</strong> ${itemName}</p>
              <p style="margin: 4px 0;"><strong>Size / Color:</strong> ${itemSize} / ${itemColor}</p>
              <p style="margin: 4px 0;"><strong>Price:</strong> $${Number(itemPrice).toFixed(2)} CAD</p>
              <p style="margin: 4px 0;"><strong>Delivery Address on File:</strong> ${clientAddress}</p>
              <p style="margin: 8px 0 0 0;"><a href="${productUrl}" style="color: #4f46e5;">View Original Item Link</a></p>
            </div>
            <p style="color: #64748b; font-size: 13px;">
              We will notify you as soon as your package arrives in Montreal for local handover.
            </p>
          </div>
        `,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.message || 'Email dispatch failed' });
    }

    return res.status(200).json({ success: true, id: data.id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}