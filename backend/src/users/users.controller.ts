import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { Roles } from '../auth/roles.decorator';

@Controller('users')
@Roles('ADMIN')
export class UsersController {
    constructor(private readonly usersService: UsersService) {}

    @Get()
    async listUsers() {
        return this.usersService.listUsers();
    }

    @Post()
    async createUser(
        @Body()
        body: {
            email: string;
            password: string;
            fullName: string;
            role: string;
            phone?: string;
        },
    ) {
        const validRoles = ['ADMIN', 'MARKETING', 'CS'];
        if (!validRoles.includes(body.role)) {
            throw new BadRequestException(
                `Invalid role. Must be one of: ${validRoles.join(', ')}`,
            );
        }

        const existing = await this.usersService.findOne(body.email);
        if (existing) {
            throw new BadRequestException('A user with this email already exists');
        }

        return this.usersService.createUser(body);
    }

    @Put(':id')
    async updateUser(
        @Param('id') id: string,
        @Body()
        body: {
            fullName?: string;
            role?: string;
            phone?: string;
            status?: string;
        },
    ) {
        const user = await this.usersService.findById(id);
        if (!user) {
            throw new NotFoundException('User not found');
        }

        if (body.role) {
            const validRoles = ['ADMIN', 'MARKETING', 'CS'];
            if (!validRoles.includes(body.role)) {
                throw new BadRequestException(
                    `Invalid role. Must be one of: ${validRoles.join(', ')}`,
                );
            }
        }

        return this.usersService.updateUser(id, body);
    }

    @Put(':id/reset-password')
    async resetPassword(
        @Param('id') id: string,
        @Body() body: { password: string },
    ) {
        const user = await this.usersService.findById(id);
        if (!user) {
            throw new NotFoundException('User not found');
        }
        await this.usersService.resetPassword(id, body.password);
        return { message: 'Password reset successfully' };
    }

    @Delete(':id')
    async deleteUser(@Param('id') id: string) {
        const user = await this.usersService.findById(id);
        if (!user) {
            throw new NotFoundException('User not found');
        }
        await this.usersService.deleteUser(id);
        return { message: 'User deactivated successfully' };
    }
}
