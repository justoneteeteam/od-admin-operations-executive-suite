import { Module } from '@nestjs/common';
import { LogisticCompaniesController } from './logistic-companies.controller';
import { LogisticCompaniesService } from './logistic-companies.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [LogisticCompaniesController],
    providers: [LogisticCompaniesService],
    exports: [LogisticCompaniesService],
})
export class LogisticCompaniesModule {}
