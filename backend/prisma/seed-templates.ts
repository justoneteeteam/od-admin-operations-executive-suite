import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaService } from '../src/prisma/prisma.service';

const prisma = new PrismaService();

async function main() {
    console.log('Seeding Notification Templates...');

    const templates = [
        {
            templateName: 'order_out_for_delivery',
            templateType: 'whatsapp',
            subject: 'Order Out For Delivery',
            bodyTemplate: 'Hello {{1}}, your order {{2}} is now Out for Delivery! 🚚 Track it here: {{3}}',
            variables: { 1: 'Customer Name', 2: 'Order Number', 3: 'Tracking URL' },
            language: 'en',
            isActive: true,
        },
        {
            templateName: 'sms_out_for_delivery_es',
            templateType: 'sms',
            subject: 'Envio en Camino',
            bodyTemplate: 'Tu pedido {{2}} esta en camino. Llegara en 3-5 horas a tu direccion. Gracias!',
            variables: { 2: 'Order Number' },
            language: 'es',
            isActive: true,
        },
        {
            templateName: 'sms_out_for_delivery_it',
            templateType: 'sms',
            subject: 'Ordine in Arrivo',
            bodyTemplate: 'Il tuo ordine {{2}} e in arrivo. Sara consegnato in 3-5 ore. Grazie!',
            variables: { 2: 'Order Number' },
            language: 'it',
            isActive: true,
        },
        {
            templateName: 'sms_out_for_delivery_en',
            templateType: 'sms',
            subject: 'Order Out For Delivery',
            bodyTemplate: 'Your order {{2}} is on the way. It will arrive in 3-5 hours. Thanks!',
            variables: { 2: 'Order Number' },
            language: 'en',
            isActive: true,
        },
        // --- Pre-Call SMS Warning Templates ---
        {
            templateName: 'sms_pre_call_es',
            templateType: 'sms',
            subject: 'Aviso de Llamada',
            bodyTemplate: 'Le llamaremos del {{3}} para confirmar su pedido {{2}}. Conteste.',
            variables: { 2: 'Order Number', 3: 'Twilio Phone Number' },
            language: 'es',
            isActive: true,
        },
        {
            templateName: 'sms_pre_call_it',
            templateType: 'sms',
            subject: 'Avviso di Chiamata',
            bodyTemplate: 'Ti chiameremo dal {{3}} per confermare il tuo ordine {{2}}. Rispondi.',
            variables: { 2: 'Order Number', 3: 'Twilio Phone Number' },
            language: 'it',
            isActive: true,
        },
        {
            templateName: 'sms_pre_call_en',
            templateType: 'sms',
            subject: 'Call Notice',
            bodyTemplate: 'We will call you from {{3}} to confirm your order {{2}}. Please answer.',
            variables: { 2: 'Order Number', 3: 'Twilio Phone Number' },
            language: 'en',
            isActive: true,
        },
        // --- WhatsApp Personal Arrival Templates ---
        {
            templateName: 'wa_arrival_en',
            templateType: 'whatsapp_personal',
            subject: 'Arrival English',
            bodyTemplate: '📦 Hi {{1}}! Your order from {{2}} is arriving soon!\n💰 COD Amount: {{3}}\n📋 Items: {{4}}\n🚚 The delivery driver will arrive in approximately 3-4 hours and will only attempt delivery once, so please be available!\nThank you for shopping with us! 😊',
            variables: { 1: 'Customer Name', 2: 'Store Name', 3: 'COD Amount', 4: 'Items' },
            language: 'en',
            isActive: true,
        },
        {
            templateName: 'wa_arrival_es',
            templateType: 'whatsapp_personal',
            subject: 'Arrival Spanish',
            bodyTemplate: '📦 ¡Hola {{1}}! Tu pedido de {{2}} está llegando pronto.\n💰 Importe COD: €{{3}}\n📋 Artículos: {{4}}\n🚚 El repartidor llegará en aproximadamente 3-4 horas y solo pasará una vez. ¡Por favor, estate disponible!\n¡Gracias por tu compra! 😊',
            variables: { 1: 'Customer Name', 2: 'Store Name', 3: 'COD Amount', 4: 'Items' },
            language: 'es',
            isActive: true,
        },
        {
            templateName: 'wa_arrival_it',
            templateType: 'whatsapp_personal',
            subject: 'Arrival Italian',
            bodyTemplate: '📦 Ciao {{1}}! Il tuo ordine da {{2}} sta per arrivare!\n💰 Importo COD: €{{3}}\n📋 Articoli: {{4}}\n🚚 Il corriere arriverà tra circa 3-4 ore e passerà una sola volta, assicurati di essere disponibile!\nGrazie per il tuo acquisto! 😊',
            variables: { 1: 'Customer Name', 2: 'Store Name', 3: 'COD Amount', 4: 'Items' },
            language: 'it',
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
