import { Module } from '@nestjs/common';
import { ProfitsService } from './profits.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    providers: [ProfitsService],
    exports: [ProfitsService],
})
export class ProfitsModule { }
