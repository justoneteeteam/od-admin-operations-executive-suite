import { IsString, IsNotEmpty, IsOptional, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class CreateOrderItemDto {
    @IsString()
    @IsOptional()
    productId?: string;

    @IsString()
    @IsNotEmpty()
    productName: string;

    @IsString()
    @IsNotEmpty()
    sku: string;

    @IsNumber()
    quantity: number;

    @IsNumber()
    unitPrice: number;

    @IsNumber()
    @IsOptional()
    unitCost?: number;
}

export class CreateOrderDto {
    @IsString()
    @IsOptional()
    orderNumber?: string;

    @IsString()
    @IsNotEmpty()
    customerId: string;

    @IsString()
    @IsNotEmpty()
    storeId: string;

    @IsString()
    @IsOptional()
    storeName?: string;

    @IsString()
    @IsNotEmpty()
    shippingAddressLine1: string;

    @IsString()
    @IsOptional()
    shippingAddressLine2?: string;

    @IsString()
    @IsNotEmpty()
    shippingCity: string;

    @IsString()
    @IsOptional()
    shippingProvince?: string;

    @IsString()
    @IsNotEmpty()
    shippingCountry: string;

    @IsString()
    @IsOptional()
    shippingPostalCode?: string;

    @IsNumber()
    subtotal: number;

    @IsOptional()
    @IsNumber()
    shippingFee?: number;

    @IsOptional()
    @IsNumber()
    taxCollected?: number;

    @IsOptional()
    @IsNumber()
    discountGiven?: number;

    @IsNumber()
    totalAmount: number;

    @IsString()
    @IsOptional()
    orderStatus?: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateOrderItemDto)
    items: CreateOrderItemDto[];

    @IsString()
    @IsOptional()
    fulfillmentCenterId?: string;

    @IsString()
    @IsOptional()
    notes?: string;
}
