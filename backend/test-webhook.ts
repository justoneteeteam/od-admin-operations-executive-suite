import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { TrackingService } from './src/tracking/tracking.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const trackingService = app.get(TrackingService);
  
  const payload = {
    "event": "TRACKING_UPDATED",
    "data": {
      "number": "32300027886184201251908",
      "carrier_code": "cainiao",
      "carrier_name": "Cainiao",
      "track_info": {
        "latest_status": {
          "status": "In Transit",
          "sub_status": "InTransit_Arrival"
        },
        "latest_event": {
          "description": "Arrived at destination country hub",
          "location": "Milan, IT",
          "time_utc": "2026-03-03T10:00:00Z"
        }
      }
    }
  };

  console.log("Invoking handleWebhook...");
  await trackingService.handleWebhook(payload);
  console.log("Done invoking.");
  await app.close();
}

bootstrap().catch(console.error);
