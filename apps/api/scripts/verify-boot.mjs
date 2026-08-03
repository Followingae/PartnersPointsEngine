/**
 * Boots the built server far enough to prove the Nest module graph resolves.
 *
 * Twice a provider has been injected into a module that neither imported nor
 * exported it — AuthService, then SmsSenderService. Both compiled cleanly, both
 * passed every test, and both only failed at boot: the container died on start,
 * DigitalOcean rolled back, and production silently stayed on the old build
 * while the deploy looked pushed.
 *
 * TypeScript can't catch it (Nest resolves at runtime) and vitest can't either
 * (it doesn't emit the decorator metadata Nest reads). Running the real thing
 * can. The database is deliberately unreachable: reaching the connection
 * attempt means every provider already resolved, which is the whole question.
 */
import { spawn } from 'node:child_process';

const child = spawn(process.execPath, ['dist/main.js'], {
  env: {
    ...process.env,
    NODE_ENV: 'production',
    API_PORT: '3999',
    // Unroutable on purpose — see above.
    DATABASE_URL: 'postgresql://u:p@127.0.0.1:1/none',
    DIRECT_URL: 'postgresql://u:p@127.0.0.1:1/none',
    // The boot migrator runs before Nest and is fatal when it can't reach the
    // database — correct in production, but here it would kill the process
    // before the thing this script exists to check (the module graph) is built.
    SKIP_MIGRATIONS: '1',
    JWT_ACCESS_SECRET: 'x'.repeat(32),
    JWT_REFRESH_SECRET: 'y'.repeat(32),
    PII_MASTER_KEY_BASE64: Buffer.alloc(32, 7).toString('base64'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
const done = (code, message) => {
  child.kill('SIGKILL');
  console[code === 0 ? 'log' : 'error'](message);
  process.exit(code);
};

const onData = (buf) => {
  output += buf.toString();

  if (/Nest can't resolve dependencies|UnknownDependenciesException/.test(output)) {
    const line = output.split('\n').find((l) => /can't resolve dependencies/.test(l)) ?? '';
    done(1, `\n  DEPENDENCY GRAPH BROKEN — this would crash on deploy:\n\n  ${line.trim()}\n`);
  }
  // Any of these means DI finished and the app moved on to real work.
  if (/Can't reach database server|P1001|Nest application successfully started|routes|Mapped \{/.test(output)) {
    done(0, '  module graph resolves — safe to deploy');
  }
};

child.stdout.on('data', onData);
child.stderr.on('data', onData);

setTimeout(() => {
  // No verdict either way: treat as a failure rather than wave it through.
  done(1, `\n  boot check inconclusive after 60s. Last output:\n${output.slice(-800)}\n`);
}, 60_000);
