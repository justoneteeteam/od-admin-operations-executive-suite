import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ log: ['error'] });

async function main() {
    console.log('Seeding Notification Templates...');

    const templates = [
        {
            templateName: 'order_in_transit',
            templateType: 'whatsapp',
            subject: 'Order In Transit',
            bodyTemplate: 'Hello {{1}}, your order {{2}} is now In Transit! 🚚 Track it here: {{3}}',
            variables: { 1: 'Customer Name', 2: 'Order Number', 3: 'Tracking URL' },
            language: 'en',
            isActive: true,
        },
        {
            templateName: 'sms_in_transit_es',
            templateType: 'sms',
            subject: 'Envío en Camino',
            bodyTemplate: 'Hola {{1}}, tu pedido {{2}} esta en camino. Llegara en 3-5 horas a tu direccion. Gracias por tu compra en {{3}}!',
            variables: { 1: 'Customer Name', 2: 'Order Number', 3: 'Store Domain' },
            language: 'es',
            isActive: true,
        },
        {
            templateName: 'sms_in_transit_it',
            templateType: 'sms',
            subject: 'Ordine in Arrivo',
            bodyTemplate: 'Ciao {{1}}, il tuo ordine {{2}} è in arrivo. Sara consegnato entro 3-5 ore. Grazie per l\'acquisto da {{3}}!',
            variables: { 1: 'Customer Name', 2: 'Order Number', 3: 'Store Domain' },
            language: 'it',
            isActive: true,
        },
        {
            templateName: 'sms_in_transit_en',
            templateType: 'sms',
            subject: 'Order In Transit',
            bodyTemplate: 'Hi {{1}}, your order {{2}} is on the way and will arrive in 3-5 hours. Thanks for shopping at {{3}}!',
            variables: { 1: 'Customer Name', 2: 'Order Number', 3: 'Store Domain' },
            language: 'en',
            isActive: true,
        }
    ];

    for (const t of templates) {
        const upserted = await prisma.notificationTemplate.upsert({
            where: { templateName: t.templateName },
            update: t,
            create: t,
        });
        console.log(`Upserted template: ${upserted.templateName}`);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
