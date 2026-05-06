import 'dotenv/config';
import { countByStatus, getMonthlyCount } from './db.js';

const MONTHLY_LIMIT = +process.env.MONTHLY_LIMIT || 1500;
const counts = Object.fromEntries(countByStatus().map((r) => [r.status, r.n]));
const used = getMonthlyCount();

console.log('Queue:');
console.log(`  pending: ${counts.pending ?? 0}`);
console.log(`  deleted: ${counts.deleted ?? 0}`);
console.log(`  failed:  ${counts.failed ?? 0}`);
console.log(`\nMonthly API usage: ${used}/${MONTHLY_LIMIT} (remaining ${MONTHLY_LIMIT - used})`);
