import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { PrismaService } from './src/prisma/prisma.service';

async function updateTemplate() {
    const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    const prisma = app.get(PrismaService);
    try {
        const templateName = 'sms_pre_call_es';
        const newBody = 'Le llamaremos del {{3}} para confirmar su pedido {{2}}. Conteste.';

        const updated = await prisma.notificationTemplate.update({
            where: { templateName },
            data: { bodyTemplate: newBody }
        });

        console.log(`Template updated successfully!`);
        console.log(`New format: "${updated.bodyTemplate}"`);
    } catch (error) {
        console.error('Error updating template:', error);
    } finally {
        await app.close();
    }
}

updateTemplate();

updateTemplate();
