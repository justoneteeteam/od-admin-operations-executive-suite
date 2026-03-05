import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const prisma = app.get(PrismaService);

    try {
        const assessments = await prisma.riskAssessment.findMany({
            take: 10,
            orderBy: { createdAt: 'desc' },
            select: {
                orderId: true,
                totalScore: true,
                riskLevel: true,
                action: true,
                loqateSource: true,
                loqateAvc: true,
                createdAt: true
            }
        });

        console.table(assessments.map(a => ({
            OrderID: a.orderId,
            Score: a.totalScore,
            Level: a.riskLevel,
            Action: a.action,
            Source: a.loqateSource,
            AVC: a.loqateAvc,
            Time: a.createdAt.toISOString()
        })));
    } catch (error) {
        console.error('Error fetching assessments:', error);
    } finally {
        await app.close();
        process.exit(0);
    }
}

bootstrap();
