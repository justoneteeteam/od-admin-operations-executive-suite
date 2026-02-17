
import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
    const email = 'admin@cod.com';
    const user = await prisma.user.findUnique({
        where: { email },
    });

    if (user) {
        console.log(`✅ Admin user found: ${user.email}`);
        console.log(`User ID: ${user.id}`);
        console.log(`Role: ${user.role}`);
    } else {
        console.error(`❌ Admin user NOT found: ${email}`);
    }
}

main()
    .catch(console.error)
    .finally(async () => await prisma.$disconnect());
