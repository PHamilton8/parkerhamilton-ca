import { preview } from 'astro';

// Keep Astro's real built preview in the test runner's process lifecycle.
// The CLI may detach automatically in agent environments.
const server = await preview({ server: { host: '127.0.0.1', port: 4321 } });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await server.stop();
    process.exit(0);
  });
}
