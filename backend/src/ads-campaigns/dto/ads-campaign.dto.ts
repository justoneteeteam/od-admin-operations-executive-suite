import { IsString, IsOptional, IsNumber, IsDateString } from 'class-validator';

export class CreateAdsCampaignDto {
    @IsDateString()
    date: string;

    @IsString()
    campaign: string;

    @IsOptional()
    @IsString()
    country?: string;

    @IsOptional()
    @IsString()
    platform?: string;

    @IsString()
    sku: string;

    @IsOptional()
    @IsString()
    stage?: string;

    @IsOptional()
    @IsString()
    pic?: string;

    @IsNumber()
    spendVnd: number;

    @IsOptional()
    @IsString()
    notes?: string;

    @IsOptional()
    @IsString()
    source?: string;
}

export class UpdateAdsCampaignDto {
    @IsOptional()
    @IsDateString()
    date?: string;

    @IsOptional()
    @IsString()
    campaign?: string;

    @IsOptional()
    @IsString()
    country?: string;

    @IsOptional()
    @IsString()
    platform?: string;

    @IsOptional()
    @IsString()
    sku?: string;

    @IsOptional()
    @IsString()
    stage?: string;

    @IsOptional()
    @IsString()
    pic?: string;

    @IsOptional()
    @IsNumber()
    spendVnd?: number;

    @IsOptional()
    @IsString()
    notes?: string;
}

export class BulkCreateAdsCampaignDto {
    records: CreateAdsCampaignDto[];
}
