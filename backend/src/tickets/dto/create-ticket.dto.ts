import { IsString, IsOptional, IsEnum, IsUUID } from 'class-validator';

export class CreateTicketDto {
    @IsString()
    title: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsString()
    @IsOptional()
    caseType?: string;

    @IsString()
    @IsOptional()
    priority?: string;

    @IsUUID()
    @IsOptional()
    orderId?: string;

    @IsString()
    @IsOptional()
    customerId?: string;

    @IsUUID()
    @IsOptional()
    picId?: string;

    @IsString()
    @IsOptional()
    picName?: string;

    @IsString()
    @IsOptional()
    country?: string;
}
