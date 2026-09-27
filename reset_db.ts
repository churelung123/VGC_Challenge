import { query } from './src/serverless/database';
async function resetDb() {
  try {
    console.log('Resetting database...');
    await query(`TRUNCATE TABLE ryusei_ladder_ratings CASCADE;`);
    await query(`TRUNCATE TABLE ryusei_ladder_matches CASCADE;`);
    await query(`TRUNCATE TABLE ryusei_ladder_seasons_history CASCADE;`);
    console.log('Database reset successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}
resetDb();
