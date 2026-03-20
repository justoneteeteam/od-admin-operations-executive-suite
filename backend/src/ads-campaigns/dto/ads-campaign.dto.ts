import { IsString, IsOptional, IsNumber, IsDateString, IsInt } from 'class-validator';

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

    @IsOptional()
    @IsString()
    sku?: string;

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

    // ─── Meta Ads Fields ──────────────────────────────────────────────
    @IsOptional()
    @IsString()
    adName?: string;

    @IsOptional()
    @IsString()
    adSetName?: string;

    @IsOptional()
    @IsNumber()
    cpc?: number;

    @IsOptional()
    @IsNumber()
    cpm?: number;

    @IsOptional()
    @IsNumber()
    ctr?: number;

    @IsOptional()
    @IsString()
    resultType?: string;

    @IsOptional()
    @IsNumber()
    costPerResult?: number;

    @IsOptional()
    @IsInt()
    metaPurchases?: number;

    @IsOptional()
    @IsString()
    reportStart?: string;

    @IsOptional()
    @IsString()
    reportEnd?: string;

    @IsOptional()
    @IsString()
    orderNumber?: string; // Human-readable order number — resolved to order_id by backend
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

    // ─── Meta Ads Fields ──────────────────────────────────────────────
    @IsOptional()
    @IsString()
    adName?: string;

    @IsOptional()
    @IsString()
    adSetName?: string;

    @IsOptional()
    @IsNumber()
    cpc?: number;

    @IsOptional()
    @IsNumber()
    cpm?: number;

    @IsOptional()
    @IsNumber()
    ctr?: number;

    @IsOptional()
    @IsString()
    resultType?: string;

    @IsOptional()
    @IsNumber()
    costPerResult?: number;

    @IsOptional()
    @IsInt()
    metaPurchases?: number;

    @IsOptional()
    @IsString()
    reportStart?: string;

    @IsOptional()
    @IsString()
    reportEnd?: string;

    @IsOptional()
    @IsString()
    orderNumber?: string;
}

export class BulkCreateAdsCampaignDto {
    records: CreateAdsCampaignDto[];
}
