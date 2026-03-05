import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { PrismaService } from './src/prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);

  const orderId = '62cceabb-8c92-41c6-84d3-79ce5b7468e0'; // Order 1526

  const logs = await prisma.callLog.findMany({
    where: { orderId },
    orderBy: { createdAt: 'desc' },
  });
  console.log("=== Call Logs ===");
  console.dir(logs, { depth: null });

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  console.log("\n=== Order Status ===");
  console.dir({
    confirmationStatus: order?.confirmationStatus,
    orderStatus: order?.orderStatus,
    confirmationNotes: order?.confirmationNotes,
  }, { depth: null });

  const risk = await prisma.riskAssessment.findFirst({ where: { orderId }, orderBy: { createdAt: 'desc' } });
  console.log("\n=== Risk Assessment ===");
  console.dir(risk, { depth: null });

  await app.close();
  process.exit(0);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
