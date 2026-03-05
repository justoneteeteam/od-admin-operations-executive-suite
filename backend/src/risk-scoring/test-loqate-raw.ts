import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AddressVerifyService } from '../address-verify/address-verify.service';
import * as dotenv from 'dotenv';
import { join } from 'path';

async function bootstrap() {
    dotenv.config({ path: join(__dirname, '../../.env') });

    // Explicitly set Loqate config
    process.env.LOQATE_ENABLED = 'true';
    process.env.LOQATE_API_KEY = 'CM72-ZJ79-JF79-GK64';

    const app = await NestFactory.createApplicationContext(AppModule);
    const addressVerifyService = app.get(AddressVerifyService);

    try {
        console.log('--- Debugging Raw Loqate Response ---');
        const testAddress = 'Calle proa 1 casa 34, El ejido, Almería, 04711';
        console.log(`Address: ${testAddress}`);

        let loqateResponse;
        try {
            console.log('Hitting API directly...');
            loqateResponse = await addressVerifyService.callLoqateApi(testAddress);
            console.log('\nRAW API RESPONSE:', JSON.stringify(loqateResponse, null, 2));
        } catch (e) {
            console.error('\nAPI Network/Axios Error:', e.message);
            if (e.response) {
                console.error('Response data:', JSON.stringify(e.response.data, null, 2));
            }
        }

        if (loqateResponse) {
            console.log('\n--- Service Verification Test ---');
            const result = await addressVerifyService.verify(testAddress, 'Spain', false);
            console.log('Final Result Object:');
            console.log(JSON.stringify(result, null, 2));
        }

    } catch (error) {
        console.error('Test script error:', error);
    } finally {
        // Exit forcibly to avoid hanging on SmsWhatsappDeliveryService
        process.exit(0);
    }
}

bootstrap();
