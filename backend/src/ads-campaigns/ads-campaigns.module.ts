import { Module } from '@nestjs/common';
import { AdsCampaignsController } from './ads-campaigns.controller';
import { AdsCampaignsService } from './ads-campaigns.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [AdsCampaignsController],
    providers: [AdsCampaignsService],
    exports: [AdsCampaignsService],
})
export class AdsCampaignsModule { }
