const https = require('https');
const jwt = require('jsonwebtoken');

const API_HOST = 'od-admin-operations-executive-suite-production.up.railway.app';
const JWT_SECRET = '58cae64d-568f-47ef-ae66-405af178e3e2';
const token = jwt.sign(
  { sub: 'script-admin', email: 'admin@system.local', role: 'admin' },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const BODY_TEMPLATE = `[Voice: Polly.Lucia | Language: es-ES | Script: SHORT (Low Risk)]

GREETING:
"Hola, llamamos de {StoreName} para confirmar su pedido numero {OrderNumber}."
\u23f8 1s pause

ORDER SUMMARY:
"{Items} por {Amount} euros, entrega contra reembolso."
\u23f8 1s pause

\u2328 DTMF GATHER (input: speech + dtmf | timeout: 5s | digits: 1):
"Para confirmar, diga SI o presione uno. Para cancelar, diga NO o presione dos."

\u23f0 NO RESPONSE FALLBACK:
"No hemos recibido respuesta. Volveremos a intentar mas tarde. Gracias."

--- RESPONSE HANDLING ---
Confirmed (DTMF 1 / Speech "Si"):
"Perfecto. Su pedido esta confirmado. Recibira la entrega pronto. Gracias."

Cancelled (DTMF 2 / Speech "No"):
"De acuerdo. Su pedido ha sido cancelado. Gracias por avisar."

Unclear -> Forward to Call Center:
"No hemos entendido su respuesta. Un agente le contactara pronto. Gracias."`;

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_HOST,
      path,
      method,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  // Get existing templates
  const listRes = await request('GET', '/communication/templates?channel=call');
  const templates = listRes.data;
  const esShort = templates.find((t) => t.templateName === 'call_confirmation_short_es');

  if (!esShort) {
    console.log('call_confirmation_short_es not found!');
    return;
  }

  console.log('Found:', esShort.id, 'current body length:', (esShort.bodyTemplate || '').length);

  // Update via PATCH
  const patchRes = await request('PATCH', '/communication/templates/' + esShort.id, {
    bodyTemplate: BODY_TEMPLATE,
    shortDescription: 'Short confirmation call script for Spain (low risk). Voice: Polly.Lucia, DTMF enabled.',
  });

  console.log('PATCH status:', patchRes.status);
  if (patchRes.status >= 400) {
    console.log('Error:', JSON.stringify(patchRes.data));
  } else {
    console.log('Updated successfully. New body length:', patchRes.data.bodyTemplate?.length);
  }
}

main().catch(console.error);
