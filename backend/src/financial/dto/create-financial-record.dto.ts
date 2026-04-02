import { IsString, IsOptional, IsNumber, IsDateString, IsIn } from 'class-validator';

export class CreateFinancialRecordDto {
    @IsDateString()
    date: string;

    @IsString()
    description: string;

    @IsString()
    @IsIn(['Fulfillment', 'Ads', 'Personnel', 'Others'])
    category: string;

    @IsOptional()
    @IsString()
    @IsIn(['ES', 'IT', 'DE', 'PL'])
    market?: string;

    @IsOptional()
    @IsNumber()
    amountEur?: number;

    @IsOptional()
    @IsNumber()
    amountVnd?: number;

    @IsOptional()
    @IsNumber()
    exchangeRate?: number;

    @IsOptional()
    @IsString()
    source?: string = 'manual';

    @IsOptional()
    @IsString()
    orderId?: string;

    @IsOptional()
    @IsString()
    fulfillmentCenterId?: string;

    @IsOptional()
    @IsString()
    notes?: string;
}
