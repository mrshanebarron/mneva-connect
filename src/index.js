#!/usr/bin/env node
/**
 * mneva-connect: your agent's own brain, hosted at Mneva.
 *
 *   npx mneva-connect init     make a brain and wire it into this folder
 *   npx mneva-connect          run as the MCP server your agent starts
 *
 * See `npx mneva-connect help` and https://mneva.dev/docs
 */
const COMMANDS = ['init', 'remove', 'status', 'doctor', 'export', 'hook', 'wake', 'help', '--help', '-h'];
if (COMMANDS.includes(process.argv[2])) {
  const { runCli } = await import('./cli.js');
  await runCli(process.argv.slice(2));
} else {
  await import('./server.js');
}
