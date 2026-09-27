import { joinQueue, leaveQueue, ensureSchema } from './src/serverless/database';

async function run() {
  try {
    await ensureSchema();
    console.log("Schema ensured.");
    const match = await joinQueue("test-guild", "test-user-1", "Test User 1");
    console.log("Join 1:", match);
    const match2 = await joinQueue("test-guild", "test-user-2", "Test User 2");
    console.log("Join 2:", match2);
    await leaveQueue("test-guild", "test-user-1");
    await leaveQueue("test-guild", "test-user-2");
    console.log("Done");
  } catch(e) {
    console.error("Error testing:", e);
  }
}

run();
