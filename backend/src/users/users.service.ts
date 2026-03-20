import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
    constructor(private prisma: PrismaService) { }

    async findOne(email: string): Promise<User | null> {
        return this.prisma.user.findUnique({
            where: { email },
        });
    }

    async findById(id: string): Promise<User | null> {
        return this.prisma.user.findUnique({
            where: { id },
        });
    }

    async createAdmin(email: string, passwordHash: string): Promise<User> {
        return this.prisma.user.create({
            data: {
                email,
                passwordHash,
                role: 'ADMIN',
                fullName: 'System Admin',
            },
        });
    }

    async createUser(data: {
        email: string;
        password: string;
        fullName: string;
        role: string;
        phone?: string;
    }): Promise<Omit<User, 'passwordHash'>> {
        const passwordHash = await bcrypt.hash(data.password, 10);
        const user = await this.prisma.user.create({
            data: {
                email: data.email,
                passwordHash,
                fullName: data.fullName,
                role: data.role,
                phone: data.phone,
            },
        });
        const { passwordHash: _, ...result } = user;
        return result;
    }

    async listUsers(): Promise<Omit<User, 'passwordHash'>[]> {
        const users = await this.prisma.user.findMany({
            orderBy: { createdAt: 'desc' },
        });
        return users.map(({ passwordHash, ...rest }) => rest);
    }

    async updateUser(
        id: string,
        data: {
            fullName?: string;
            role?: string;
            phone?: string;
            status?: string;
        },
    ): Promise<Omit<User, 'passwordHash'>> {
        const user = await this.prisma.user.update({
            where: { id },
            data,
        });
        const { passwordHash, ...result } = user;
        return result;
    }

    async resetPassword(id: string, newPassword: string): Promise<void> {
        const passwordHash = await bcrypt.hash(newPassword, 10);
        await this.prisma.user.update({
            where: { id },
            data: { passwordHash },
        });
    }

    async deleteUser(id: string): Promise<void> {
        await this.prisma.user.update({
            where: { id },
            data: { status: 'inactive' },
        });
    }
}
