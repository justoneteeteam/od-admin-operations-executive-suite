import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User } from '@prisma/client';

@Injectable()
export class UsersService {
    constructor(private prisma: PrismaService) { }

    async findOne(email: string): Promise<User | null> {
        return this.prisma.user.findUnique({
            where: { email },
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
}
