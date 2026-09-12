import 'dotenv/config';
import { prisma } from './lib/prisma.js';

async function monitorDatabase() {
  console.log('🔄 Connecting to Database Monitor for Ultra Smart Shop...');

  // MySQL max connections limit එක 25 ට සකසා stress simulation එක ආරම්භ කරයි
  try {
    await prisma.$executeRawUnsafe(`SET GLOBAL max_connections = 25;`);
    console.log('🔒 MySQL max_connections temporarily set to 25');
  } catch (err) {
    console.warn('⚠️ Could not set global max_connections (requires root privileges):', (err as Error).message);
  }

  setInterval(async () => {
    try {
      const results = await prisma.$queryRaw<Array<{ Variable_name: string; Value: string }>>`
        SHOW STATUS WHERE Variable_name IN ('Threads_connected', 'Threads_running', 'Max_used_connections')
      `;

      console.clear();
      console.log('=== 📊 Ultra Smart Shop - MySQL Live Monitor ===');
      console.log(`⏰ Time: ${new Date().toLocaleTimeString()}`);
      console.table(results);
    } catch (error) {
      console.error('❌ Monitor Query Error:', (error as Error).message);
    }
  }, 1000);
}

monitorDatabase();