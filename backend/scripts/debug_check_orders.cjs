// Debug script to check Twilio call eligibility for specific orders
require('dotenv').config({ path: __dirname + '/../.env' });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const orderNumbers = ['JSP-QUI1305', 'JSP-QUI1306', 'JSP-QUI1307'];
  const orders = await prisma.order.findMany({
    where: { orderNumber: { in: orderNumbers } },
    include: { callLogs: true, items: { include: { product: true } }, storeSettings: true },
  });
  for (const o of orders) {
    console.log('Order:', o.orderNumber);
    console.log('  status:', o.orderStatus);
    console.log('  confirmationStatus:', o.confirmationStatus);
    console.log('  riskAction:', o.riskAction);
    console.log('  createdAt:', o.createdAt);
    console.log('  callLogs count:', o.callLogs.length);
    console.log('  callLogs details:', o.callLogs.map(cl => ({ id: cl.id, status: cl.callStatus, intent: cl.intentDetected })));
    console.log('  items count:', o.items.length);
    console.log('  any SKU items?', o.items.some(i => i.sku && !i.sku.startsWith('NO-SKU-')));
  }
  const store = await prisma.storeSettings.findFirst();
  console.log('Store enableTwilioCalls:', store?.enableTwilioCalls);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
