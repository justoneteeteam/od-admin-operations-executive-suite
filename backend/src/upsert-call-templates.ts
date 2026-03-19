import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CALL_TEMPLATES: any[] = [
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

async function main() {
  console.log('=== Checking existing call templates ===');

  const existing = await prisma.notificationTemplate.findMany({
    where: { channel: 'call' },
    orderBy: { templateName: 'asc' },
  });

  console.log(`Found ${existing.length} existing call templates:`);
  for (const t of existing) {
    console.log(`  - ${t.templateName} (${t.language}) body length: ${(t.bodyTemplate || '').length}`);
  }

  console.log('\n=== Upserting call confirmation templates ===');

  for (const tpl of CALL_TEMPLATES) {
    const existingTpl = existing.find((e: any) => e.templateName === tpl.templateName);

    if (existingTpl) {
      await prisma.notificationTemplate.update({
        where: { id: existingTpl.id },
        data: {
          bodyTemplate: tpl.bodyTemplate,
          shortDescription: tpl.shortDescription,
        },
      });
      console.log(`✅ Updated: ${tpl.templateName}`);
    } else {
      await prisma.notificationTemplate.create({
        data: tpl,
      });
      console.log(`✨ Created: ${tpl.templateName}`);
    }
  }

  console.log('\n=== Verifying ===');
  const final = await prisma.notificationTemplate.findMany({
    where: { templateName: { startsWith: 'call_confirmation' } },
    orderBy: { templateName: 'asc' },
    select: { templateName: true, language: true, bodyTemplate: true },
  });
  for (const t of final) {
    console.log(`  ✓ ${t.templateName} (${t.language}) — ${(t.bodyTemplate || '').length} chars`);
  }

  console.log('\nDone!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
