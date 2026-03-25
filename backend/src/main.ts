import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Increase body size limit to 10MB for base64 image uploads
  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

  // Enable CORS with dynamic origins for production
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:5173', 'http://localhost:3000'];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // Use dynamic port for PaaS platforms
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 Backend running on port ${port}`);

  // Log outbound IP for debugging IP whitelisting issues
  try {
    const resp = await fetch('https://api.ipify.org');
    const ip = await resp.text();
    console.log(`🌐 Outbound IP: ${ip}`);
  } catch (e) { console.log('Could not resolve outbound IP'); }
}
bootstrap();
