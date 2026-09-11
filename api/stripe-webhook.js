import crypto from "node:crypto";

export const config = {
  api: {
    bodyParser: false
  }
};

const BREVO_EMAIL_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const ALLOWED_SIZES = new Set(["XS", "S", "M", "L", "XL", "XXL"]);

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function safeEqual(a, b) {
  const first = Buffer.from(a || "", "utf8");
  const second = Buffer.from(b || "", "utf8");
  return first.length === second.length && crypto.timingSafeEqual(first, second);
}

function verifyStripeSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;

  const parts = signatureHeader.split(",");
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));

  if (!timestamp || signatures.length === 0) return false;

  // Rechaza eventos con más de cinco minutos de antigüedad.
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const signedPayload = `${timestamp}.${rawBody.toString("utf8")}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(signedPayload, "utf8")
    .digest("hex");

  return signatures.some((signature) => safeEqual(signature, expected));
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getCustomField(session, label) {
  const field = (session.custom_fields || []).find(
    (item) =>
      String(item?.label?.custom || "").trim().toLowerCase() ===
      label.toLowerCase()
  );

  return field?.text?.value || field?.numeric?.value || "";
}

function getSize(session) {
  const reference = String(session.client_reference_id || "");
  const size = reference.startsWith("camiseta_")
    ? reference.slice("camiseta_".length).toUpperCase()
    : "";

  return ALLOWED_SIZES.has(size) ? size : "";
}

function formatAddress(session) {
  const details =
    session.collected_information?.shipping_details ||
    session.shipping_details ||
    session.customer_details ||
    {};
  const address = details.address || {};

  return [
    address.line1,
    address.line2,
    [address.postal_code, address.city].filter(Boolean).join(" "),
    address.state,
    address.country
  ]
    .filter(Boolean)
    .join(", ");
}

async function sendBrevoEmail(payload) {
  const response = await fetch(BREVO_EMAIL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "api-key": process.env.BREVO_API_KEY
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Brevo rejected the email: ${details}`);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const stripeSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (
    !stripeSecret ||
    !process.env.BREVO_API_KEY ||
    !process.env.BREVO_SENDER_EMAIL ||
    !process.env.BREVO_RECIPIENT_EMAIL
  ) {
    return res.status(500).json({ ok: false, error: "Missing configuration" });
  }

  try {
    const rawBody = await readRawBody(req);
    const signature = req.headers["stripe-signature"];

    if (!verifyStripeSignature(rawBody, signature, stripeSecret)) {
      return res.status(400).json({ ok: false, error: "Invalid signature" });
    }

    const event = JSON.parse(rawBody.toString("utf8"));

    if (
      event.type !== "checkout.session.completed" &&
      event.type !== "checkout.session.async_payment_succeeded"
    ) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const session = event.data?.object || {};
    const size = getSize(session);

    // Solo procesa compras procedentes de la landing de la camiseta.
    if (!size || session.payment_status !== "paid") {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const customer = session.customer_details || {};
    const email = String(customer.email || session.customer_email || "")
      .trim()
      .toLowerCase();

    if (!email) {
      throw new Error("The paid Checkout Session has no customer email");
    }

    const customerName = String(customer.name || "").trim();
    const petName = getCustomField(session, "Nombre de tu mascota");
    const phone = String(customer.phone || "").trim();
    const address = formatAddress(session);
    const amount = new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: String(session.currency || "eur").toUpperCase()
    }).format(Number(session.amount_total || 0) / 100);

    const sender = {
      name: process.env.BREVO_SENDER_NAME || "Woofing",
      email: process.env.BREVO_SENDER_EMAIL
    };

    await sendBrevoEmail({
      sender,
      to: [{ email, name: customerName || undefined }],
      subject: "Pedido confirmado · Camiseta personalizada Woofing",
      htmlContent: `
        <div style="background:#f4eef7;padding:32px 16px;font-family:Arial,sans-serif;color:#311a40">
          <div style="max-width:600px;margin:auto;background:#ffffff;border-radius:18px;overflow:hidden">
            <div style="background:#5c3277;color:#ffffff;padding:30px;text-align:center">
              <h1 style="margin:0;font-size:28px">¡Pedido confirmado!</h1>
            </div>
            <div style="padding:32px;text-align:center;line-height:1.6">
              <p>Hola${customerName ? ` ${escapeHtml(customerName)}` : ""},</p>
              <p>Hemos recibido correctamente el pago de tu camiseta personalizada${petName ? ` de <strong>${escapeHtml(petName)}</strong>` : ""}.</p>
              <p><strong>Talla:</strong> ${escapeHtml(size)}<br><strong>Total pagado:</strong> ${escapeHtml(amount)}</p>
              <p>Ahora prepararemos la ilustración. Nos pondremos en contacto contigo si necesitamos confirmar algún detalle.</p>
              <p style="margin-top:28px">Gracias por formar parte de Woofing 💜</p>
            </div>
          </div>
        </div>
      `,
      tags: ["camiseta-pago-confirmado-cliente"]
    });

    await sendBrevoEmail({
      sender,
      to: [
        {
          email: process.env.BREVO_RECIPIENT_EMAIL,
          name: "Woofing"
        }
      ],
      replyTo: { email, name: customerName || email },
      subject: `PAGO CONFIRMADO · Camiseta ${size}${petName ? ` · ${petName}` : ""}`,
      htmlContent: `
        <div style="font-family:Arial,sans-serif;color:#311a40;line-height:1.6">
          <h1 style="color:#5c3277">Pago de camiseta confirmado</h1>
          <p><strong>Cliente:</strong> ${escapeHtml(customerName || "No indicado")}</p>
          <p><strong>Email:</strong> ${escapeHtml(email)}</p>
          <p><strong>Teléfono:</strong> ${escapeHtml(phone || "No indicado")}</p>
          <p><strong>Mascota:</strong> ${escapeHtml(petName || "No indicado")}</p>
          <p><strong>Talla:</strong> ${escapeHtml(size)}</p>
          <p><strong>Total:</strong> ${escapeHtml(amount)}</p>
          <p><strong>Dirección:</strong> ${escapeHtml(address || "Consultar en Stripe")}</p>
          <p><strong>Sesión de Stripe:</strong> ${escapeHtml(session.id)}</p>
          <p>Este pago ya está confirmado. Puedes localizar la fotografía en el email previo del formulario.</p>
        </div>
      `,
      tags: ["camiseta-pago-confirmado-equipo"]
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Stripe webhook failed:", error.message);
    return res.status(500).json({ ok: false, error: "Webhook processing failed" });
  }
}
