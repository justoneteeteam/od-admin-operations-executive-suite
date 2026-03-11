import { IsString, IsOptional, IsUUID, IsBoolean } from 'class-validator';

export class UpdateTicketDto {
    @IsString()
    @IsOptional()
    title?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsString()
    @IsOptional()
    caseType?: string;

    @IsString()
    @IsOptional()
    priority?: string;

    @IsString()
    @IsOptional()
    status?: string;

    @IsString()
    @IsOptional()
    resolution?: string;

    @IsUUID()
    @IsOptional()
    picId?: string;

    @IsString()
    @IsOptional()
    picName?: string;

    @IsBoolean()
    @IsOptional()
    autoPaused?: boolean;

    @IsString()
    @IsOptional()
    country?: string;
}
