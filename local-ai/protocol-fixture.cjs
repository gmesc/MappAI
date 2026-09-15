// Tests only, never bundled. Exercises real subprocess framing and failure paths.
const readline = require('node:readline');
readline.createInterface({ input: process.stdin }).on('line', line => {
  const req = JSON.parse(line);
  if (req.method === 'cancel') return;
  if (req.method === 'malformed') return process.stdout.write('not-json\n');
  if (req.method === 'exit') return process.exit(4);
  if (req.method === 'hang') return;
  process.stdout.write(JSON.stringify({ id: req.id, progress: { done: 1, total: 1 } }) + '\n');
  process.stdout.write(JSON.stringify({ id: req.id, result: { status: 'ready', text: 'Ω è locale' } }) + '\n');
});
