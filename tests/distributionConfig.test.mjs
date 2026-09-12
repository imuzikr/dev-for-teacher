import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const firebaseSource = await readFile(new URL('../lib/firebase.js', import.meta.url), 'utf8');
const nextSource = await readFile(new URL('../next.config.mjs', import.meta.url), 'utf8');
const configuredEnv = {
  NEXT_PUBLIC_FIREBASE_API_KEY: 'example-web-key',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'example-school.firebaseapp.com',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'example-school',
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'example-school.firebasestorage.app',
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '1234567890',
  NEXT_PUBLIC_FIREBASE_APP_ID: '1:1234567890:web:example',
};

async function loadFirebase(env) {
  const context = vm.createContext({ process: { env } });
  const calls = [];
  const app = { name: 'test-app' };
  const modules = {
    'firebase/app': { initializeApp: (config) => { calls.push(config); return app; }, getApps: () => [] },
    'firebase/firestore': { getFirestore: () => 'test-db' },
    'firebase/auth': { getAuth: () => 'test-auth' },
    'firebase/storage': { getStorage: () => 'test-storage' },
  };
  const module = new vm.SourceTextModule(firebaseSource, { context });
  await module.link((specifier) => {
    const exports = modules[specifier];
    assert.ok(exports, `Unexpected Firebase import: ${specifier}`);
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    }, { context });
  });
  await module.evaluate();
  return { exports: module.namespace, calls };
}

async function loadHeaders(env) {
  const module = new vm.SourceTextModule(nextSource, { context: vm.createContext({ process: { env } }) });
  await module.link(() => { throw new Error('Unexpected Next config import'); });
  await module.evaluate();
  return (await module.namespace.default.headers())[0].headers.find((h) => h.key === 'Content-Security-Policy').value;
}

test('an unset environment never initializes Firebase', async () => {
  const { exports, calls } = await loadFirebase({});
  assert.equal(exports.isFirebaseConfigured, false);
  assert.equal(exports.db, null);
  assert.equal(exports.auth, null);
  assert.equal(exports.storage, null);
  assert.equal(calls.length, 0);
});

test('the blank example environment stays in demo mode', async () => {
  const { exports, calls } = await loadFirebase(Object.fromEntries(Object.keys(configuredEnv).map((key) => [key, '  '])));
  assert.equal(exports.isFirebaseConfigured, false);
  assert.equal(calls.length, 0);
});

test('a partial configuration fails instead of silently using demo data', async () => {
  await assert.rejects(loadFirebase({ NEXT_PUBLIC_FIREBASE_API_KEY: 'example-web-key' }), /Firebase 설정이 일부 누락/);
});

test('complete configuration initializes only the supplied personal project', async () => {
  const { exports, calls } = await loadFirebase(configuredEnv);
  assert.equal(exports.isFirebaseConfigured, true);
  assert.equal(exports.db, 'test-db');
  assert.equal(exports.auth, 'test-auth');
  assert.equal(exports.storage, 'test-storage');
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), {
    apiKey: configuredEnv.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: configuredEnv.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: configuredEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: configuredEnv.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: configuredEnv.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: configuredEnv.NEXT_PUBLIC_FIREBASE_APP_ID,
  });
});

test('CSP authorizes the configured Firebase domain', async () => {
  const csp = await loadHeaders(configuredEnv);
  assert.ok(csp.includes("frame-src 'self' https://example-school.firebaseapp.com "));
});

test('demo CSP contains no Firebase project frame source', async () => {
  const csp = await loadHeaders({});
  assert.ok(csp.includes("frame-src 'self' https://apis.google.com https://accounts.google.com"));
  assert.equal(csp.includes('firebaseapp.com'), false);
});

test('CSP rejects URLs and directive injection in authDomain', async () => {
  for (const domain of ['https://example-school.firebaseapp.com', "example.com; script-src *", 'example.com/path']) {
    await assert.rejects(loadHeaders({ NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: domain }), /호스트 이름만/);
  }
});
