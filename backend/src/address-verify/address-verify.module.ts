import { Module } from '@nestjs/common';
import { AddressVerifyService } from './address-verify.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    providers: [AddressVerifyService],
    exports: [AddressVerifyService],
})
export class AddressVerifyModule { }
