import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function docker(args, options = {}) {
  const result = spawnSync('docker', args, {
    cwd: projectRoot,
    encoding: 'utf8',
    ...options
  });
  if (result.error) throw result.error;
  return result;
}

const containers = docker(['ps', '--format', '{{.Names}}']);
assert.equal(containers.status, 0, `Could not inspect Docker containers: ${containers.stderr}`);
const config = readFileSync(path.join(projectRoot, 'supabase/config.toml'), 'utf8');
const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
assert.ok(projectId, 'supabase/config.toml does not declare a project_id.');
const dbContainer = `supabase_db_${projectId}`;
assert.ok(containers.stdout.split(/\r?\n/).includes(dbContainer), 'A running local Dřevito Supabase database container is required.');

function psqlArgs(sql, appName = 'drevito-concurrency-control') {
  return [
    'exec', '-e', `PGAPPNAME=${appName}`, '-i', dbContainer,
    'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-U', 'postgres', '-d', 'postgres', '-Atc', sql
  ];
}

function runSql(sql, appName) {
  const result = docker(psqlArgs(sql, appName));
  assert.equal(result.status, 0, `PostgreSQL fixture query failed:\n${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function spawnSql(sql, appName) {
  const child = spawn('docker', psqlArgs(sql, appName), {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  return {
    child,
    result: new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (status, signal) => resolve({ status, signal, stdout, stderr }));
    })
  };
}

async function waitForHierarchyLock(appName) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const count = Number(runSql(`
      select count(*)
      from pg_catalog.pg_locks locks
      join pg_catalog.pg_stat_activity activity using (pid)
      where activity.application_name = '${appName}'
        and locks.locktype = 'advisory'
        and locks.granted
    `));
    if (count > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${appName} to acquire the hierarchy advisory lock.`);
}

async function waitForActiveTransactions(appNames) {
  const expectedNames = appNames.map((name) => `'${name}'`).join(', ');
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const count = Number(runSql(`
      select count(distinct application_name)
      from pg_catalog.pg_stat_activity
      where application_name in (${expectedNames})
        and xact_start is not null
        and state = 'active'
    `));
    if (count === appNames.length) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for overlapping transactions: ${appNames.join(', ')}.`);
}

const ids = {
  a: 'c1000000-0000-4000-8000-000000000001',
  b: 'c1000000-0000-4000-8000-000000000002',
  c: 'c1000000-0000-4000-8000-000000000003',
  d: 'c1000000-0000-4000-8000-000000000004'
};

function resetRoots() {
  runSql(`
    delete from public.product_categories
    where id in ('${ids.a}', '${ids.b}', '${ids.c}', '${ids.d}');
    insert into public.product_categories (id, title, slug, parent_id, is_visible)
    values
      ('${ids.a}', 'Concurrency A', 'concurrency-a', null, true),
      ('${ids.b}', 'Concurrency B', 'concurrency-b', null, true),
      ('${ids.c}', 'Concurrency C', 'concurrency-c', null, true),
      ('${ids.d}', 'Concurrency D', 'concurrency-d', null, true);
  `);
}

function assertHierarchy(expected) {
  const rows = JSON.parse(runSql(`
    select pg_catalog.json_object_agg(id::text, parent_id::text order by id)::text
    from public.product_categories
    where id in ('${ids.a}', '${ids.b}', '${ids.c}', '${ids.d}')
  `));
  Object.entries(expected).forEach(([id, parentId]) => {
    assert.equal(rows[id], parentId, `Unexpected parent for ${id}.`);
  });
}

async function overlap(firstUpdate, secondUpdate, label) {
  const firstApp = `drevito-${label}-first`;
  const first = spawnSql(`begin; ${firstUpdate}; select pg_catalog.pg_sleep(1.2); commit;`, firstApp);
  await waitForHierarchyLock(firstApp);
  const second = spawnSql(`begin; ${secondUpdate}; commit;`, `drevito-${label}-second`);
  const [firstResult, secondResult] = await Promise.all([first.result, second.result]);
  return { firstResult, secondResult };
}

async function overlapRepeatableRead(firstUpdate, secondUpdate) {
  const firstApp = 'drevito-repeatable-read-first';
  const secondApp = 'drevito-repeatable-read-second';
  const transaction = (update) => `
    begin isolation level repeatable read;
    select count(*) from public.product_categories;
    select pg_catalog.pg_sleep(1.2);
    ${update};
    commit;
  `;
  const first = spawnSql(transaction(firstUpdate), firstApp);
  const second = spawnSql(transaction(secondUpdate), secondApp);
  await waitForActiveTransactions([firstApp, secondApp]);
  const [firstResult, secondResult] = await Promise.all([first.result, second.result]);
  return { firstResult, secondResult };
}

try {
  resetRoots();
  let results = await overlap(
    `update public.product_categories set parent_id = '${ids.b}' where id = '${ids.a}'`,
    `update public.product_categories set parent_id = '${ids.a}' where id = '${ids.b}'`,
    'cycle'
  );
  assert.equal(results.firstResult.status, 0, `First cycle transaction failed unexpectedly: ${results.firstResult.stderr}`);
  assert.notEqual(results.secondResult.status, 0, 'Concurrent A→B and B→A transactions both committed.');
  assert.match(results.secondResult.stderr, /product_category_(max_depth_two|with_children_cannot_be_reparented)/, 'Rejected cycle did not use the hierarchy constraint.');
  assertHierarchy({ [ids.a]: ids.b, [ids.b]: null, [ids.c]: null, [ids.d]: null });

  resetRoots();
  results = await overlap(
    `update public.product_categories set parent_id = '${ids.a}' where id = '${ids.c}'`,
    `update public.product_categories set parent_id = '${ids.b}' where id = '${ids.a}'`,
    'third-level'
  );
  assert.equal(results.firstResult.status, 0, `First third-level transaction failed unexpectedly: ${results.firstResult.stderr}`);
  assert.notEqual(results.secondResult.status, 0, 'Concurrent child creation and parent move produced a third hierarchy level.');
  assert.match(results.secondResult.stderr, /product_category_with_children_cannot_be_reparented/, 'Concurrent third-level rejection did not detect the newly committed child.');
  assertHierarchy({ [ids.a]: null, [ids.b]: null, [ids.c]: ids.a, [ids.d]: null });

  resetRoots();
  results = await overlap(
    `update public.product_categories set parent_id = '${ids.b}' where id = '${ids.a}'`,
    `update public.product_categories set parent_id = '${ids.d}' where id = '${ids.c}'`,
    'non-conflicting'
  );
  assert.equal(results.firstResult.status, 0, `First non-conflicting transaction failed: ${results.firstResult.stderr}`);
  assert.equal(results.secondResult.status, 0, `Second non-conflicting transaction failed: ${results.secondResult.stderr}`);
  assertHierarchy({ [ids.a]: ids.b, [ids.b]: null, [ids.c]: ids.d, [ids.d]: null });

  resetRoots();
  results = await overlapRepeatableRead(
    `update public.product_categories set parent_id = '${ids.b}' where id = '${ids.a}'`,
    `update public.product_categories set parent_id = '${ids.a}' where id = '${ids.b}'`
  );
  for (const [label, result] of Object.entries({ first: results.firstResult, second: results.secondResult })) {
    assert.notEqual(result.status, 0, `REPEATABLE READ ${label} hierarchy transaction unexpectedly committed.`);
    assert.match(result.stderr, /25000: product_category_hierarchy_requires_read_committed/, `REPEATABLE READ ${label} transaction did not fail with the deterministic isolation guard.`);
  }
  assertHierarchy({ [ids.a]: null, [ids.b]: null, [ids.c]: null, [ids.d]: null });

  const repeatableReadUnrelatedWrite = docker(psqlArgs(`
    begin isolation level repeatable read;
    select count(*) from public.product_categories;
    update public.product_categories set description = 'Unrelated write remains supported' where id = '${ids.a}';
    commit;
  `, 'drevito-repeatable-read-unrelated'));
  assert.equal(repeatableReadUnrelatedWrite.status, 0, `Unrelated REPEATABLE READ category write was blocked: ${repeatableReadUnrelatedWrite.stderr}`);
  assert.equal(runSql(`select description from public.product_categories where id = '${ids.a}'`), 'Unrelated write remains supported', 'Unrelated REPEATABLE READ write did not persist.');

  const serializable = docker(psqlArgs(`
    begin isolation level serializable;
    select count(*) from public.product_categories;
    update public.product_categories set parent_id = '${ids.b}' where id = '${ids.a}';
    commit;
  `, 'drevito-serializable-guard'));
  assert.notEqual(serializable.status, 0, 'SERIALIZABLE hierarchy transaction unexpectedly committed.');
  assert.match(serializable.stderr, /25000: product_category_hierarchy_requires_read_committed/, 'SERIALIZABLE hierarchy transaction did not fail with the deterministic isolation guard.');
  assertHierarchy({ [ids.a]: null, [ids.b]: null, [ids.c]: null, [ids.d]: null });

  console.log('Dřevito category concurrency test passed.');
  console.log('Verified READ COMMITTED concurrency plus deterministic REPEATABLE READ and SERIALIZABLE hierarchy-write rejection.');
} finally {
  runSql(`delete from public.product_categories where id in ('${ids.a}', '${ids.b}', '${ids.c}', '${ids.d}')`);
}
