import { PartialType } from '@nestjs/mapped-types';
import { CreateOrderDto } from './create-order.dto';
import { IsString, IsOptional, IsNumber } from 'class-validator';

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
}
