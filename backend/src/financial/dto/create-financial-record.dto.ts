import { IsString, IsOptional, IsNumber, IsDateString, IsIn } from 'class-validator';

export class CreateFinancialRecordDto {
    @IsDateString()
    date: string;

    @IsString()
    description: string;

    @IsString()
    @IsIn(['Ads', 'Software', 'COGS', 'Office', 'Rate Exchange', 'Shipping Fee', 'Other', 'Storage fee', 'Fulfillment', 'R&D', 'Commission', 'Transaction fee', 'Testing fee', 'People'])
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
    @IsIn(['Fixed Cost', 'Variable Cost'])
    spendType?: string;

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

export class UpdateFinancialRecordDto {
    @IsOptional()
    @IsDateString()
    date?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsString()
    @IsIn(['Ads', 'Software', 'COGS', 'Office', 'Rate Exchange', 'Shipping Fee', 'Other', 'Storage fee', 'Fulfillment', 'R&D', 'Commission', 'Transaction fee', 'Testing fee', 'People'])
    category?: string;

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
    source?: string;

    @IsOptional()
    @IsString()
    @IsIn(['Fixed Cost', 'Variable Cost'])
    spendType?: string;

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
