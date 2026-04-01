import { PartialType } from '@nestjs/mapped-types';
import { CreateOrderDto } from './create-order.dto';
import { IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';

export class UpdateOrderDto extends PartialType(CreateOrderDto) {
    @IsOptional()
    @IsString()
    orderStatus?: string;

    @IsOptional()
    @IsNumber()
    shippingFee?: number;

    @IsOptional()
    @IsNumber()
    taxCollected?: number;

    @IsOptional()
    @IsNumber()
    discountGiven?: number;

    @IsString()
    @IsOptional()
    courier?: string;

    @IsOptional()
    shippingStatus?: string;

    @IsOptional()
    orderDate?: string | Date;

    // ─── Return tracking fields (editable from order drawer) ──────────
    @IsOptional()
    @IsString()
    returnTrackingNumber?: string;

    @IsOptional()
    @IsString()
    returnStockState?: string;

    @IsOptional()
    @IsString()
    returnWriteOffReason?: string;

    @IsOptional()
    @IsBoolean()
    needsRestockConfirm?: boolean;
}
