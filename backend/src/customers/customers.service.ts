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

  private detectCountry(phone: string): string {
    const digits = phone.replace(/[^0-9]/g, '');
    if (!digits) return '';

    const firstDigit = digits[0];
    const firstTwo = digits.substring(0, 2);

    // Italian local numbers: 32x, 33x, 34x, 35x, 36x, 37x, 38x
    const italianPrefixes = ['32', '33', '34', '35', '36', '37', '38'];
    if (italianPrefixes.includes(firstTwo)) return 'Italy';

    // Spanish local numbers: 6xx, 7xx
    if (firstDigit === '6' || firstDigit === '7') return 'Spain';

    return '';
  }

  async bulkBlock(phones: string[], emails: string[]) {
    let blockedExisting = 0;
    let createdAndBlocked = 0;

    try {
      // ─── 1. Handle email-based blocking (existing logic) ───────────
      if (emails?.length) {
        const cleanEmails = emails.map(e => e.trim().toLowerCase()).filter(Boolean);
        if (cleanEmails.length) {
          const emailConditions = cleanEmails.map(e => ({ email: { equals: e, mode: 'insensitive' as const } }));
          const result = await this.prisma.customer.updateMany({
            where: { OR: emailConditions, status: { not: 'Blocked' } },
            data: { status: 'Blocked' },
          });
          blockedExisting += result.count;
        }
      }

      // ─── 2. Handle phone-based blocking with auto-create ───────────
      if (phones?.length) {
        const normalizedPhones = [...new Set(phones.map(p => this.normalizePhone(p)).filter(Boolean))];

        for (const phone of normalizedPhones) {
          // 2a. Try to find existing customer by phone
          const existingCustomer = await this.findByPhone(phone);

          if (existingCustomer) {
            // Customer exists → just block if not already blocked
            if (existingCustomer.status !== 'Blocked') {
              await this.prisma.customer.update({
                where: { id: existingCustomer.id },
                data: { status: 'Blocked' },
              });
              blockedExisting++;
            }
            continue;
          }

          // 2b. No existing customer → try to find order data via customer phone
          let name = `Blocked - ${phone}`;
          let country = this.detectCountry(phone) || 'Unknown';
          let addressLine1 = '';
          let city = '';
          let province = '';
          let postalCode = '';

          // Search for a customer with this phone (partial match) to get order data
          const matchedCustomer = await this.prisma.customer.findFirst({
            where: { phone: { contains: phone } },
            select: { id: true, name: true, country: true, city: true, province: true, addressLine1: true, postalCode: true },
          });

          if (matchedCustomer) {
            // Found a customer → look up their most recent order for address data
            const latestOrder = await this.prisma.order.findFirst({
              where: { customerId: matchedCustomer.id },
              orderBy: { orderDate: 'desc' },
            });

            name = matchedCustomer.name || name;
            if (latestOrder) {
              addressLine1 = latestOrder.shippingAddressLine1 || matchedCustomer.addressLine1 || '';
              city = latestOrder.shippingCity || matchedCustomer.city || '';
              province = latestOrder.shippingProvince || matchedCustomer.province || '';
              postalCode = latestOrder.shippingPostalCode || matchedCustomer.postalCode || '';
              if (latestOrder.shippingCountry) country = latestOrder.shippingCountry;
              else if (matchedCustomer.country) country = matchedCustomer.country;
            } else {
              if (matchedCustomer.country) country = matchedCustomer.country;
              addressLine1 = matchedCustomer.addressLine1 || '';
              city = matchedCustomer.city || '';
              province = matchedCustomer.province || '';
              postalCode = matchedCustomer.postalCode || '';
            }
          }

          // 2c. Create new customer profile as Blocked
          try {
            await this.prisma.customer.create({
              data: {
                name,
                phone,
                country,
                addressLine1: addressLine1 || undefined,
                city: city || undefined,
                province: province || undefined,
                postalCode: postalCode || undefined,
                status: 'Blocked',
                isBlocked: true,
                blockedDate: new Date(),
                blockedReason: 'Bulk block',
              },
            });
            createdAndBlocked++;
          } catch (err: any) {
            // If duplicate phone/email conflict, just skip
            console.warn(`Skipped creating customer for phone ${phone}: ${err?.message}`);
          }
        }
      }
    } catch (err: any) {
      console.error('bulkBlock error:', err?.message, err?.stack);
      throw err;
    }

    return { blockedExisting, createdAndBlocked, blocked: blockedExisting + createdAndBlocked };
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
