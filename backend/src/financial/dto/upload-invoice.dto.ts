import { IsString, IsOptional, IsIn } from 'class-validator';

export class UploadInvoiceDto {
    @IsString()
    fulfillmentCenterId: string;

    @IsOptional()
    @IsString()
    periodMonth?: string;

    @IsOptional()
    @IsString()
    @IsIn(['per_order', 'monthly'])
    invoiceType?: string = 'per_order';
}
