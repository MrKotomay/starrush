require('dotenv').config({ path: '.env' });
const { PrismaClient } = require('@prisma/client');

(async () => {
  const db = new PrismaClient();
  try {
    const cnt = await db.user.count();
    console.log('count=' + cnt);
    const rows = await db.user.findMany({ orderBy: { createdAt: 'desc' }, take: 5 });
    const safe = JSON.stringify(rows, (key, value) => (typeof value === 'bigint' ? value.toString() : value), 2);
    console.log(safe);
  } catch (e) {
    console.error('ERROR', e);
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
})();
