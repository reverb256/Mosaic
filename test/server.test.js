'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

describe('Server Smoke Tests', () => {
  let server;
  let app;
  let allocatedPort;
  let tmpDir;

  before(async () => {
    tmpDir = path.join(os.tmpdir(), `mosiac-server-test-${Date.now()}`);
    const testDbPath = path.join(tmpDir, 'mosiac.db');
    fs.mkdirSync(tmpDir, { recursive: true });

    // Set env vars before loading server
    process.env.HAVEN_DATA_DIR = tmpDir;
    process.env.MOSIAC_RP_ID = 'localhost';
    process.env.MOSIAC_ORIGIN = 'http://localhost:0';
    process.env.PORT = '0';
    process.env.JWT_SECRET = 'test-server-secret';

    // Load fresh server instance
    delete require.cache[require.resolve('../server')];
    const mod = require('../server');
    server = mod.server;
    app = mod.app;

    // Wait for server to be ready (asynchronous listen)
    await new Promise((resolve) => {
      const check = () => {
        try {
          const addr = server.address();
          if (addr && addr.port) {
            allocatedPort = addr.port;
            resolve();
          } else {
            setTimeout(check, 100);
          }
        } catch {
          setTimeout(check, 100);
        }
      };
      setTimeout(check, 500);
    });
  });

  after(() => {
    try { server.close(); } catch { /* ok */ }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ok */ }
  });

  function get(path) {
    return new Promise((resolve, reject) => {
      http.get(`http://localhost:${allocatedPort}${path}`, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
          catch { resolve({ status: res.statusCode, body }); }
        });
      }).on('error', reject);
    });
  }

  function post(path, data) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(data || {});
      const req = http.request(`http://localhost:${allocatedPort}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
          catch { resolve({ status: res.statusCode, body }); }
        });
      });
      req.on('error', reject);
      req.end(payload);
    });
  }

  it('GET /mosiac/health returns ok', async () => {
    const res = await get('/mosiac/health');
    assert.equal(res.status, 200);
    assert.ok(res.body.ok);
  });

  it('GET /mosiac/config returns features', async () => {
    const res = await get('/mosiac/config');
    assert.equal(res.status, 200);
    assert.ok(res.body.features);
  });

  it('GET /mosiac/identity/current returns identity data (or null)', async () => {
    const res = await get('/mosiac/identity/current');
    // May be null (no identity created yet) or return an identity — both are valid
    assert.ok(res.status === 200);
    assert.ok('identity' in res.body);
  });

  it('GET /mosiac/contacts returns list', async () => {
    const res = await get('/mosiac/contacts');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });
});
