// Direct SQL approach — no Prisma needed
const https = require('https');
const jwt = require('jsonwebtoken');

const API_URL = 'https://od-admin-operations-executive-suite-production.up.railway.app';
const JWT_SECRET = '58cae64d-568f-47ef-ae66-405af178e3e2';

// Generate a valid admin token
const token = jwt.sign(
  { sub: 'script-admin', email: 'admin@system.local', role: 'admin' },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const TEMPLATES = [
  {
    templateName: 'call_confirmation_short_es',
    channel: 'call',
    templateType: 'call',
    language: 'es',
    shortDescription: 'Short confirmation call script for Spain (low risk). Voice: Polly.Lucia, DTMF enabled.',
    bodyTemplate: `[Voice: Polly.Lucia | Language: es-ES | Script: SHORT (Low Risk)]

GREETING:
"Hola, llamamos de {StoreName} para confirmar su pedido número {OrderNumber}."
⏸ 1s pause

ORDER SUMMARY:
"{Items} por {Amount} euros, entrega contra reembolso."
⏸ 1s pause

⌨ DTMF GATHER (input: speech + dtmf | timeout: 5s | digits: 1):
"Para confirmar, diga SÍ o presione uno. Para cancelar, diga NO o presione dos."

⏰ NO RESPONSE FALLBACK:
"No hemos recibido respuesta. Volveremos a intentar más tarde. Gracias."

─── RESPONSE HANDLING ───
✅ Confirmed (DTMF 1 / Speech "Sí"):
"Perfecto. Su pedido está confirmado. Recibirá la entrega pronto. Gracias."

❌ Cancelled (DTMF 2 / Speech "No"):
"De acuerdo. Su pedido ha sido cancelado. Gracias por avisar."

⚠️ Unclear → Forward to Call Center:
"No hemos entendido su respuesta. Un agente le contactará pronto. Gracias."`,
  },
  {
    templateName: 'call_confirmation_short_it',
    channel: 'call',
    templateType: 'call',
    language: 'it',
    shortDescription: 'Short confirmation call script for Italy (low risk). Voice: Polly.Bianca, DTMF enabled.',
    bodyTemplate: `[Voice: Polly.Bianca | Language: it-IT | Script: SHORT (Low Risk)]

GREETING:
"Buongiorno, chiamiamo da {StoreName} per confermare il suo ordine numero {OrderNumber}."
⏸ 1s pause

ORDER SUMMARY:
"{Items} per {Amount} euro, consegna in contrassegno."
⏸ 1s pause

⌨ DTMF GATHER (input: speech + dtmf | timeout: 5s | digits: 1):
"Per confermare, dica SÌ o prema uno. Per annullare, dica NO o prema due."

⏰ NO RESPONSE FALLBACK:
"Non abbiamo ricevuto risposta. Riproveremo più tardi. Grazie."

─── RESPONSE HANDLING ───
✅ Confirmed (DTMF 1 / Speech "Sì"):
"Perfetto. Il suo ordine è confermato. Riceverà la consegna a breve. Grazie."

❌ Cancelled (DTMF 2 / Speech "No"):
"Va bene. Il suo ordine è stato annullato. Grazie per aver avvisato."

⚠️ Unclear → Forward to Call Center:
"Non abbiamo compreso la sua risposta. Un agente la contatterà a breve. Grazie."`,
  },
  {
    templateName: 'call_confirmation_long_es',
    channel: 'call',
    templateType: 'call',
    language: 'es',
    shortDescription: 'Long confirmation call script for Spain (medium risk). Voice: Polly.Lucia, includes products & address.',
    bodyTemplate: `[Voice: Polly.Lucia | Language: es-ES | Script: LONG (Medium Risk)]

GREETING:
"Hola, llamamos de {StoreName} para confirmar su pedido número {OrderNumber}."
⏸ 1s pause

ORDER SUMMARY:
"Tiene {Items} por {Amount} euros, entrega contra reembolso."
⏸ 1s pause

PRODUCTS:
"Los productos son: {Product}."
⏸ 1s pause

ADDRESS CONFIRMATION:
"¿Puede confirmar su dirección de entrega? {Address}."
⏸ 1s pause

⌨ DTMF GATHER (input: speech + dtmf | timeout: 7s | digits: 1):
"¿Es correcto? Para confirmar todo, diga SÍ o presione uno. Si hay algún problema, diga NO o presione dos."

⏰ NO RESPONSE FALLBACK:
"No hemos recibido respuesta. Un agente le contactará pronto. Gracias."

─── RESPONSE HANDLING ───
✅ Confirmed (DTMF 1 / Speech "Sí"):
"Perfecto. Su pedido está confirmado. Recibirá la entrega pronto. Gracias."

❌ Cancelled (DTMF 2 / Speech "No"):
"De acuerdo. Su pedido ha sido cancelado. Gracias por avisar."

⚠️ Unclear → Forward to Call Center:
"No hemos entendido su respuesta. Un agente le contactará pronto. Gracias."`,
  },
  {
    templateName: 'call_confirmation_long_it',
    channel: 'call',
    templateType: 'call',
    language: 'it',
    shortDescription: 'Long confirmation call script for Italy (medium risk). Voice: Polly.Bianca, includes products & address.',
    bodyTemplate: `[Voice: Polly.Bianca | Language: it-IT | Script: LONG (Medium Risk)]

GREETING:
"Buongiorno, chiamiamo da {StoreName} per confermare il suo ordine numero {OrderNumber}."
⏸ 1s pause

ORDER SUMMARY:
"Ha {Items} per {Amount} euro, consegna in contrassegno."
⏸ 1s pause

PRODUCTS:
"I prodotti sono: {Product}."
⏸ 1s pause

ADDRESS CONFIRMATION:
"Può confermare il suo indirizzo di consegna? {Address}."
⏸ 1s pause

⌨ DTMF GATHER (input: speech + dtmf | timeout: 7s | digits: 1):
"È corretto? Per confermare, dica SÌ o prema uno. Per segnalare un problema, dica NO o prema due."

⏰ NO RESPONSE FALLBACK:
"Non abbiamo ricevuto risposta. Un agente la contatterà a breve. Grazie."

─── RESPONSE HANDLING ───
✅ Confirmed (DTMF 1 / Speech "Sì"):
"Perfetto. Il suo ordine è confermato. Riceverà la consegna a breve. Grazie."

❌ Cancelled (DTMF 2 / Speech "No"):
"Va bene. Il suo ordine è stato annullato. Grazie per aver avvisato."

⚠️ Unclear → Forward to Call Center:
"Non abbiamo compreso la sua risposta. Un agente la contatterà a breve. Grazie."`,
  },
];

function makeRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_URL);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('Token generated, querying existing call templates...');

  // List existing call templates
  const listRes = await makeRequest('GET', '/communication/templates?channel=call');
  console.log(`GET /communication/templates?channel=call → ${listRes.status}`);

  if (listRes.status !== 200) {
    console.error('Failed to list templates:', listRes.data);
    return;
  }

  const existing = listRes.data;
  console.log(`Found ${existing.length} existing call templates:`);
  for (const t of existing) {
    console.log(`  - ${t.templateName} (${t.language}) body: ${(t.bodyTemplate || '').length} chars`);
  }

  console.log('\nUpserting call confirmation templates...\n');

  for (const tpl of TEMPLATES) {
    const match = existing.find((e) => e.templateName === tpl.templateName);

    if (match) {
      // Update existing
      const updateRes = await makeRequest('PUT', `/communication/templates/${match.id}`, {
        bodyTemplate: tpl.bodyTemplate,
        shortDescription: tpl.shortDescription,
      });
      console.log(`✅ Updated ${tpl.templateName} → ${updateRes.status}`);
    } else {
      // Create new
      const createRes = await makeRequest('POST', '/communication/templates', tpl);
      console.log(`✨ Created ${tpl.templateName} → ${createRes.status}`);
      if (createRes.status >= 400) {
        console.log('   Error:', JSON.stringify(createRes.data));
      }
    }
  }

  console.log('\nDone!');
}

main().catch(console.error);
