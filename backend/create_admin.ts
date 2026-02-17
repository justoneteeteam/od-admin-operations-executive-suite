import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';

dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: undefined
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('--- Checking Admin User ---');
    const email = 'admin@cod.com';
    const password = 'admin123';
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const user = await prisma.user.findUnique({
        where: { email }
    });

    if (user) {
        console.log('User exists. Updating password...');
        await prisma.user.update({
            where: { email },
            data: { passwordHash, status: 'active', role: 'ADMIN' }
        });
        console.log('Password updated and role set to ADMIN.');
    } else {
        console.log('User does not exist. Creating admin user...');
        await prisma.user.create({
            data: {
                email,
                passwordHash,
                fullName: 'System Admin',
                role: 'ADMIN',
                status: 'active'
            }
        });
        console.log('Admin user created.');
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
