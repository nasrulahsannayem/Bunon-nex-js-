/**
 * scripts/migrate.ts — CLI wrapper around server/migrations/index.ts
 *
 *   npm run migrate            -> status
 *   npm run migrate -- up      -> apply all pending
 *   npm run migrate -- down 0001
 *
 * Guard rails:
 *   - refuses `up` unless OMNI_MIGRATE_CONFIRM=1 is exported (a backup is
 *     the operator's responsibility; we just force them to acknowledge it)
 *   - prints the target schema before touching anything
 */
import { runMigrations, migrationStatus } from '../server/migrations/index';

async function main() {
  const [, , cmd = 'status', arg] = process.argv;

  if (cmd === 'status') {
    const rows = await migrationStatus();
    console.log('migration'.padEnd(6), 'applied'.padEnd(9), 'name');
    for (const r of rows) {
      const mark = r.applied ? (r.checksumDrift ? 'DRIFT!' : 'yes') : 'no';
      console.log(r.id.padEnd(6), mark.padEnd(9), r.name);
      if (r.applied) console.log('       ', 'at', r.applied_at, `(${r.duration_ms}ms)`);
    }
    return;
  }

  if (cmd === 'up') {
    if (process.env.OMNI_MIGRATE_CONFIRM !== '1') {
      console.error(
        'Refusing to run migrations without confirmation.\n' +
          'Take a backup first, then re-run with OMNI_MIGRATE_CONFIRM=1'
      );
      process.exit(2);
    }
    const { applied, skipped } = await runMigrations('up');
    console.log('applied:', applied.length ? applied.join(', ') : '(none)');
    console.log('already applied:', skipped.length ? skipped.join(', ') : '(none)');
    return;
  }

  if (cmd === 'down') {
    if (!arg) throw new Error('down requires a migration id, e.g. down 0001');
    if (process.env.OMNI_MIGRATE_CONFIRM !== '1') {
      console.error('Refusing to roll back without OMNI_MIGRATE_CONFIRM=1');
      process.exit(2);
    }
    const { applied } = await runMigrations('down', arg);
    console.log('rolled back:', applied.join(', '));
    return;
  }

  throw new Error(`unknown command: ${cmd}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('MIGRATION FAILED:', e?.message || e);
    process.exit(1);
  });