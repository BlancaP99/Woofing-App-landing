const BREVO_API_URL = "https://api.brevo.com/v3/contacts";

function sendJson(res, statusCode, data) {
  res.status(statusCode).json(data);
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getListIdByFormType(formType) {
  if (formType === "owner") {
    return Number(process.env.BREVO_LIST_OWNER_ID);
  }

  if (formType === "business") {
    return Number(process.env.BREVO_LIST_BUSINESS_ID);
  }

  if (formType === "newsletter") {
    return Number(process.env.BREVO_LIST_NEWSLETTER_ID);
  }

  return null;
}

function buildAttributes(body) {
  const attributes = {
    ORIGEN_FORMULARIO: body.origen_formulario || "",
    ESTADO_LEAD: "Nuevo",
    IDIOMA: body.language || "ES"
  };

  if (body.form_type === "owner") {
    attributes.TIENE_MASCOTA = body.has_pet || "";
    attributes.NUMERO_MASCOTAS = body.pet_count ? Number(body.pet_count) : undefined;
    attributes.TIPO_MASCOTA = body.pet_types || "";
  }

  if (body.form_type === "newsletter") {
    attributes.ORIGEN_FORMULARIO = body.origen_formulario || "Newsletter footer";
  }

  if (body.form_type === "business") {
    attributes.NOMBRE = body.nombre || "";
    attributes.APELLIDO = body.apellido || "";
    attributes.TELEFONO = body.telefono || "";
    attributes.ASUNTO = body.asunto || "";
    attributes.MENSAJE = body.mensaje || "";
    attributes.TIPO_COMERCIO = body.tipo_comercio || "";
    attributes.ORIGEN_FORMULARIO = body.origen_formulario || "Formulario comercio";
  }

  Object.keys(attributes).forEach((key) => {
    if (
      attributes[key] === "" ||
      attributes[key] === null ||
      attributes[key] === undefined
    ) {
      delete attributes[key];
    }
  });

  return attributes;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, {
      ok: false,
      error: "Method not allowed"
    });
  }

  try {
    const apiKey = process.env.BREVO_API_KEY;

    if (!apiKey) {
      return sendJson(res, 500, {
        ok: false,
        error: "Missing BREVO_API_KEY"
      });
    }

    const body = req.body || {};
    const email = normalizeEmail(body.email);
    const formType = body.form_type;

    if (!email || !isValidEmail(email)) {
      return sendJson(res, 400, {
        ok: false,
        error: "Invalid email"
      });
    }

    if (!formType) {
      return sendJson(res, 400, {
        ok: false,
        error: "Missing form_type"
      });
    }

    const listId = getListIdByFormType(formType);

    if (!listId) {
      return sendJson(res, 400, {
        ok: false,
        error: "Invalid list ID"
      });
    }

    const brevoPayload = {
      email,
      attributes: buildAttributes(body),
      listIds: [listId],
      updateEnabled: true
    };

    const brevoResponse = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "api-key": apiKey
      },
      body: JSON.stringify(brevoPayload)
    });

    const responseText = await brevoResponse.text();

    if (!brevoResponse.ok) {
      return sendJson(res, brevoResponse.status, {
        ok: false,
        error: "Brevo error",
        details: responseText
      });
    }

    return sendJson(res, 200, {
      ok: true
    });
  } catch (error) {
    return sendJson(res, 500, {
      ok: false,
      error: "Server error",
      details: error.message
    });
  }
}
