import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) { }

  private normalizePhone(phone: string): string {
    return phone.replace(/[^0-9]/g, '');
  }

  async create(data: any) {
    if (data.phone) {
      const existing = await this.findByPhone(data.phone);
      if (existing) {
        throw new ConflictException(`Customer with phone ${data.phone} already exists`);
      }
    }

    try {
      return await this.prisma.customer.create({ data });
    } catch (error) {
      console.error('Error creating customer:', error);
      throw error;
    }
  }

  async findByPhone(phone: string) {
    const clean = this.normalizePhone(phone);
    if (!clean) return null;

    const candidates = await this.prisma.customer.findMany({
      where: {
        phone: {
          contains: clean,
        }
      },
    });

    const matches = candidates.filter(c => this.normalizePhone(c.phone) === clean);
    if (matches.length === 0) return null;

    // Prioritize Blocked customers to enforce blocking logic on duplicates
    return matches.find(c => c.status === 'Blocked') || matches[0];
  }

  async findAll(search?: string) {
    const where = search
      ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { phone: { contains: search, mode: 'insensitive' as const } },
        ],
      }
      : {};

    return this.prisma.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        orders: {
          orderBy: { orderDate: 'desc' },
          take: 10,
        },
      },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }

    return customer;
  }

  async update(id: string, data: any) {
    try {
      return await this.prisma.customer.update({
        where: { id },
        data,
      });
    } catch (error) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }
  }

  async remove(id: string) {
    try {
      return await this.prisma.customer.delete({
        where: { id },
      });
    } catch (error) {
      console.error(`Error deleting customer ${id}:`, error);
      throw new NotFoundException(`Customer with ID ${id} not found or cannot be deleted`);
    }
  }
}
