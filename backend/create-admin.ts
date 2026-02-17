
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env before Prisma Import
const envPath = path.join(__dirname, '.env');
dotenv.config({ path: envPath });

console.log(`Loading env from ${envPath}`);
console.log(`DATABASE_URL: ${process.env.DATABASE_URL ? 'Found' : 'Missing'}`);

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

// @ts-ignore
const prisma = new PrismaClient({ adapter });

async function main() {
    const email = 'admin@example.com';
    const password = 'password123';
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.upsert({
        where: { email },
        update: {
            passwordHash: hashedPassword,
            role: 'ADMIN',
            status: 'active',
        },
        create: {
            email,
            passwordHash: hashedPassword,
            fullName: 'System Admin',
            role: 'ADMIN',
            status: 'active',
        },
    });

    console.log(`User ${user.email} created/updated with ID: ${user.id}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
