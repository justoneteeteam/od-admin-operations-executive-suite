import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
