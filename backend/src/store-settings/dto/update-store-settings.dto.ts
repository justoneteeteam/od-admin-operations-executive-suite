import { IsOptional, IsString, IsBoolean } from 'class-validator';

export class UpdateStoreSettingsDto {
    @IsString()
    @IsOptional()
    storeName?: string;

    @IsString()
    @IsOptional()
    storeUrl?: string;

    @IsString()
    @IsOptional()
    supportEmail?: string;

    @IsString()
    @IsOptional()
    currency?: string;

    @IsString()
    @IsOptional()
    gsProjectId?: string;

    @IsString()
    @IsOptional()
    gsClientEmail?: string;

    @IsString()
    @IsOptional()
    gsPrivateKey?: string;

    @IsString()
    @IsOptional()
    gsSpreadsheetId?: string;

    @IsString()
    @IsOptional()
    gsSheetName?: string;

    @IsString()
    @IsOptional()
    callCenterSheetId?: string;

    @IsString()
    @IsOptional()
    callCenterSheetName?: string;

    @IsBoolean()
    @IsOptional()
    enableTwilioCalls?: boolean;
}
