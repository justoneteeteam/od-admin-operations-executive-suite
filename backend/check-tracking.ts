import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  console.log("Checking for order 32300027789699501083398...");
  const order = await prisma.order.findFirst({
    where: { trackingNumber: '32300027789699501083398' },
    include: { trackingHistory: true }
  });

  if (!order) {
    console.log("Order not found!");
  } else {
    console.log("Order id:", order.id);
    console.log("Order Carrier Name: ", order.courier);
    console.log("Tracking History Items:", order.trackingHistory?.length);
    console.log(JSON.stringify(order.trackingHistory, null, 2));
  }

  await prisma.$disconnect();
}
main().catch(e => {
  console.error(e);
  process.exit(1);
});
