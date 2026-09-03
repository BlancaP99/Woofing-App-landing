const BREVO_EMAIL_ENDPOINT =
    "https://api.brevo.com/v3/smtp/email";

const BREVO_CONTACTS_ENDPOINT =
    "https://api.brevo.com/v3/contacts";

/*
 * Lista #10: SE BUSCAN PERROS
 * Lista #4: Woofing - Contacto general
 */
const BREVO_LIST_IDS = [10, 4];

const MAX_BASE64_LENGTH = 2_800_000;

function clean(value, maxLength = 500) {
    return String(value || "")
        .trim()
        .slice(0, maxLength);
}

function escapeHtml(value) {
    return clean(value, 3000)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function isEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default async function handler(request, response) {
    if (request.method !== "POST") {
        response.setHeader("Allow", "POST");

        return response.status(405).json({
            error: "Método no permitido."
        });
    }

    const body = request.body || {};

    /*
     * Honeypot invisible contra bots.
     */
    if (body.company) {
        return response.status(200).json({
            ok: true
        });
    }

    const petName = clean(body.petName, 50);
    const neighborhood = clean(body.neighborhood, 80);
    const petStory = clean(body.petStory, 280);
    const ownerName = clean(body.ownerName, 80);

    const email = clean(body.email, 150)
        .toLowerCase();

    const instagram = clean(body.instagram, 60);

    const campaignSource =
        clean(body.campaignSource, 80) || "web";

    const photo = body.photo || {};

    /*
     * Validación de los campos obligatorios.
     */
    if (
        !petName ||
        !neighborhood ||
        !ownerName ||
        !isEmail(email)
    ) {
        return response.status(400).json({
            error: "Revisa los campos obligatorios."
        });
    }

    /*
     * Los dos consentimientos son obligatorios.
     */
    if (
        body.imageConsent !== true ||
        body.privacy !== true
    ) {
        return response.status(400).json({
            error:
                "Es necesario aceptar los consentimientos."
        });
    }

    /*
     * Validación de la fotografía ya comprimida.
     */
    if (
        !photo.content ||
        photo.mimeType !== "image/jpeg" ||
        photo.content.length > MAX_BASE64_LENGTH
    ) {
        return response.status(400).json({
            error:
                "La fotografía no es válida o es demasiado grande."
        });
    }

    /*
     * Comprueba que las variables privadas existen en Vercel.
     */
    if (
        !process.env.BREVO_API_KEY ||
        !process.env.BREVO_SENDER_EMAIL ||
        !process.env.BREVO_RECIPIENT_EMAIL
    ) {
        return response.status(503).json({
            error:
                "El formulario todavía no está configurado."
        });
    }

    const sentAt = new Intl.DateTimeFormat(
        "es-ES",
        {
            dateStyle: "full",
            timeStyle: "short",
            timeZone: "Europe/Madrid"
        }
    ).format(new Date());

    const htmlContent = `
        <div
            style="
                font-family: Arial, sans-serif;
                color: #391d4b;
                max-width: 620px;
                margin: auto;
            "
        >
            <div
                style="
                    background: #5c3277;
                    color: #ffffff;
                    padding: 24px 28px;
                    border-radius: 18px 18px 0 0;
                "
            >
                <p
                    style="
                        margin: 0 0 6px;
                        font-size: 12px;
                        letter-spacing: 1.4px;
                        text-transform: uppercase;
                    "
                >
                    Perros de Madrid
                </p>

                <h1
                    style="
                        margin: 0;
                        font-size: 28px;
                    "
                >
                    Nueva presentación:
                    ${escapeHtml(petName)}
                </h1>
            </div>

            <div
                style="
                    padding: 26px 28px;
                    border: 1px solid #e6ddeb;
                    border-top: 0;
                    border-radius: 0 0 18px 18px;
                "
            >
                <p>
                    <strong>Nombre del perro:</strong>
                    ${escapeHtml(petName)}
                </p>

                <p>
                    <strong>Zona:</strong>
                    ${escapeHtml(neighborhood)}
                </p>

                <p>
                    <strong>Lo que lo hace especial:</strong>
                    <br>
                    ${escapeHtml(
                        petStory || "No indicado"
                    )}
                </p>

                <hr
                    style="
                        border: 0;
                        border-top: 1px solid #e6ddeb;
                        margin: 22px 0;
                    "
                >

                <p>
                    <strong>Persona responsable:</strong>
                    ${escapeHtml(ownerName)}
                </p>

                <p>
                    <strong>Email:</strong>
                    <a href="mailto:${escapeHtml(email)}">
                        ${escapeHtml(email)}
                    </a>
                </p>

                <p>
                    <strong>Instagram:</strong>
                    ${escapeHtml(
                        instagram || "No indicado"
                    )}
                </p>

                <p>
                    <strong>Procedencia del cartel:</strong>
                    ${escapeHtml(campaignSource)}
                </p>

                <p>
                    <strong>Recibido:</strong>
                    ${escapeHtml(sentAt)}
                </p>

                <p
                    style="
                        margin-top: 24px;
                        color: #765d84;
                        font-size: 12px;
                    "
                >
                    La persona ha aceptado la Política de
                    privacidad y la autorización de uso de la
                    fotografía indicada en el formulario.
                </p>
            </div>
        </div>
    `;

    try {
        /*
         * Guarda el email del participante en:
         *
         * #10 SE BUSCAN PERROS
         * #4 Woofing - Contacto general
         */
        const contactResponse = await fetch(
            BREVO_CONTACTS_ENDPOINT,
            {
                method: "POST",
                headers: {
                    accept: "application/json",
                    "api-key":
                        process.env.BREVO_API_KEY,
                    "content-type": "application/json"
                },
                body: JSON.stringify({
                    email,
                    listIds: BREVO_LIST_IDS,
                    updateEnabled: true
                })
            }
        );

        if (!contactResponse.ok) {
            const details =
                await contactResponse.text();

            console.error(
                "Brevo contact rejected:",
                contactResponse.status,
                details.slice(0, 300)
            );

            return response.status(502).json({
                error:
                    "No hemos podido guardar tus datos. Inténtalo de nuevo."
            });
        }

        /*
         * Envía a Woofing el correo con todos los datos
         * y la fotografía adjunta.
         */
        const brevoResponse = await fetch(
            BREVO_EMAIL_ENDPOINT,
            {
                method: "POST",
                headers: {
                    accept: "application/json",
                    "api-key":
                        process.env.BREVO_API_KEY,
                    "content-type": "application/json"
                },
                body: JSON.stringify({
                    sender: {
                        name:
                            process.env
                                .BREVO_SENDER_NAME ||
                            "Woofing App",
                        email:
                            process.env
                                .BREVO_SENDER_EMAIL
                    },

                    to: [
                        {
                            email:
                                process.env
                                    .BREVO_RECIPIENT_EMAIL,
                            name: "Woofing"
                        }
                    ],

                    /*
                     * Cuando pulses Responder, contestarás
                     * directamente al participante.
                     */
                    replyTo: {
                        email,
                        name: ownerName
                    },

                    subject:
                        `🐶 Nuevo perro de ` +
                        `${neighborhood}: ${petName}`,

                    htmlContent,

                    attachment: [
                        {
                            content: photo.content,
                            name:
                                clean(
                                    photo.fileName,
                                    100
                                ) ||
                                `${petName}-woofing.jpg`
                        }
                    ],

                    tags: [
                        "perros-de-madrid"
                    ]
                })
            }
        );

        if (!brevoResponse.ok) {
            const details =
                await brevoResponse.text();

            console.error(
                "Brevo rejected the email:",
                brevoResponse.status,
                details.slice(0, 300)
            );

            return response.status(502).json({
                error:
                    "No hemos podido enviar la presentación. Inténtalo de nuevo."
            });
        }

        return response.status(200).json({
            ok: true
        });
    } catch (error) {
        console.error(
            "Brevo request failed:",
            error.message
        );

        return response.status(502).json({
            error:
                "No hemos podido enviar la presentación. Inténtalo de nuevo."
        });
    }
}
