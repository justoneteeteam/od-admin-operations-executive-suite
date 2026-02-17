import { Injectable, UnauthorizedException, OnModuleInit } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService implements OnModuleInit {
    constructor(
        private usersService: UsersService,
        private jwtService: JwtService
    ) { }

    async onModuleInit() {
        // Seed Admin User
        const adminEmail = 'admin@cod.com';
        const existingAdmin = await this.usersService.findOne(adminEmail);
        if (!existingAdmin) {
            console.log('Seeding default admin user...');
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await this.usersService.createAdmin(adminEmail, hashedPassword);
            console.log('Admin user created: admin@cod.com / admin123');
        }
    }

    async validateUser(email: string, pass: string): Promise<any> {
        const user = await this.usersService.findOne(email);
        if (user && (await bcrypt.compare(pass, user.passwordHash))) {
            const { passwordHash, ...result } = user;
            return result;
        }
        return null;
    }

    async login(user: any) {
        const payload = { email: user.email, sub: user.id, role: user.role };
        return {
            access_token: this.jwtService.sign(payload),
        };
    }
}
