require('dotenv').config();
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

// Use explicit config to handle special chars like @ in password correctly
// The % encoding in the connection string URL can cause auth failures
const pool = new Pool({
  host: 'db.pzsrhswtyacappmjrubv.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'Aruvik@1407',
  ssl: { rejectUnauthorized: false }
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

module.exports = prisma;
