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

    const customers = await this.prisma.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    // Aggregate order stats per customer via raw SQL
    const customerIds = customers.map(c => c.id);
    if (customerIds.length === 0) return customers;

    const stats: any[] = await this.prisma.$queryRaw`
      SELECT 
        customer_id, 
        COUNT(*)::int as orders_count, 
        COALESCE(SUM(total_amount), 0)::float as total_spent,
        COALESCE(AVG(risk_score), 0)::float as avg_risk_score
      FROM orders
      WHERE customer_id = ANY(${customerIds}::uuid[])
      GROUP BY customer_id
    `;

    const statsMap = new Map(stats.map(s => [s.customer_id, s]));

    return customers.map(c => ({
      ...c,
      ordersCount: statsMap.get(c.id)?.orders_count || 0,
      totalSpent: statsMap.get(c.id)?.total_spent || 0,
      avgRiskScore: statsMap.get(c.id)?.avg_risk_score || 0,
    }));
  }

  async bulkBlock(phones: string[], emails: string[]) {
    const conditions: any[] = [];

    if (phones?.length) {
      const normalizedPhones = phones.map(p => this.normalizePhone(p)).filter(Boolean);
      if (normalizedPhones.length) {
        conditions.push(...normalizedPhones.map(p => ({ phone: { contains: p } })));
      }
    }

    if (emails?.length) {
      const cleanEmails = emails.map(e => e.trim().toLowerCase()).filter(Boolean);
      if (cleanEmails.length) {
        conditions.push(...cleanEmails.map(e => ({ email: { equals: e, mode: 'insensitive' as const } })));
      }
    }

    if (conditions.length === 0) {
      return { blocked: 0 };
    }

    const result = await this.prisma.customer.updateMany({
      where: { OR: conditions, status: { not: 'Blocked' } },
      data: { status: 'Blocked' },
    });

    return { blocked: result.count };
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
