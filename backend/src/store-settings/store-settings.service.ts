import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StoreSettingsService {
    constructor(private prisma: PrismaService) { }

    // Get all store settings (list of stores)
    async findAll() {
        return this.prisma.storeSettings.findMany({
            orderBy: { createdAt: 'desc' },
        });
    }

    // Get a single store settings by ID
    async findOne(id: string) {
        return this.prisma.storeSettings.findUnique({
            where: { id },
        });
    }

    // Create a new store settings entry
    async create(data: any) {
        return this.prisma.storeSettings.create({
            data,
        });
    }

    // Update store settings
    async update(id: string, data: any) {
        // Strip out non-updateable fields like 'id', 'createdAt', 'updatedAt', 'gsConnected', 'gsLastSyncAt'
        const allowedFields = [
            'storeName', 'storeUrl', 'supportEmail', 'currency',
            'gsProjectId', 'gsClientEmail', 'gsPrivateKey', 'gsSpreadsheetId', 'gsSheetName',
            'callCenterSheetId', 'callCenterSheetName', 'enableTwilioCalls'
        ];

        const updateData: any = {};
        for (const field of allowedFields) {
            if (data[field] !== undefined) {
                updateData[field] = data[field];
            }
        }

        return this.prisma.storeSettings.update({
            where: { id },
            data: updateData,
        });
    }

    // Delete store settings
    async remove(id: string) {
        return this.prisma.storeSettings.delete({
            where: { id },
        });
    }

    // Get just the store names (for dropdowns)
    async getStoreNames() {
        return this.prisma.storeSettings.findMany({
            select: {
                id: true,
                storeName: true,
            },
            orderBy: { storeName: 'asc' },
        });
    }
}
