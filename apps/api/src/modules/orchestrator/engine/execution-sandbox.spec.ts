import {
  runSandboxed,
  COMMAND_DENYLIST,
  WORKSPACE_ROOT,
  SANDBOX_TIMEOUT_DEFAULT,
} from './execution-sandbox';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('execution-sandbox engine (FORGE AI-078)', () => {
  it('runs shell commands inside workspace-only no-network restrictions', () => {
    const out = runSandboxed({ tool: 'shell-exec', command: 'npm test', timeout: 60 });
    expect(out).toEqual({
      ok: true,
      tool: 'shell-exec',
      timeout: 60,
      restrictions: ['workspace-only-fs', 'no-network', 'timeout-60s'],
    });
  });

  it('denies egress unless the host is allowlisted', () => {
    expect(runSandboxed({ tool: 'web-fetch', egress: { host: 'evil.example' } })).toMatchObject({
      reason: 'sandbox-egress-denied:evil.example',
    });
    const ok = runSandboxed({
      tool: 'web-fetch',
      egress: { host: 'api.github.com' },
      egressAllowlist: ['api.github.com'],
    });
    expect(ok.ok).toBe(true);
    expect(ok.restrictions).toContain('egress:api.github.com');
    expect(runSandboxed({ tool: 'web-fetch', egress: {} })).toMatchObject({
      reason: 'sandbox-egress-host-missing',
    });
    expect(
      runSandboxed({ tool: 'web-fetch', egress: { host: 'a.example' }, egressAllowlist: ['a.example', 5] }),
    ).toMatchObject({ reason: 'sandbox-egress-allowlist-invalid' });
  });

  it('confines file writes to the workspace and forbids destructive commands', () => {
    expect(runSandboxed({ tool: 'fs-write', fileWrites: ['/etc/passwd'] })).toMatchObject({
      reason: 'sandbox-path-outside-workspace:/etc/passwd',
    });
    expect(runSandboxed({ tool: 'fs-write', fileWrites: ['/workspace/report.md'] }).ok).toBe(true);
    expect(runSandboxed({ tool: 'shell-exec', command: 'sudo rm -x' })).toMatchObject({
      reason: 'sandbox-command-forbidden:sudo',
    });
    expect(runSandboxed({ tool: 'shell-exec', command: '' })).toMatchObject({
      reason: 'sandbox-command-missing',
    });
    expect(runSandboxed({ tool: 'fs-write', fileWrites: ['/workspace/a.md', ''] })).toMatchObject({
      reason: 'sandbox-path-missing',
    });
  });

  it('refuses unknown tools and invalid timeouts and exposes the sandbox laws', () => {
    expect(runSandboxed({ tool: 'laser' })).toMatchObject({ reason: 'sandbox-tool-unknown:laser' });
    expect(runSandboxed({})).toMatchObject({ reason: 'sandbox-tool-missing' });
    expect(runSandboxed({ tool: 'shell-exec', command: 'npm test', timeout: 0 })).toMatchObject({
      reason: 'sandbox-timeout-invalid:0',
    });
    expect(runSandboxed({ tool: 'shell-exec', command: 'npm test', timeout: 601 })).toMatchObject({
      reason: 'sandbox-timeout-invalid:601',
    });
    expect(runSandboxed({ tool: 'fs-read' }).timeout).toBe(30);
    expect(COMMAND_DENYLIST).toContain('sudo ');
    expect(WORKSPACE_ROOT).toBe('/workspace/');
    expect(SANDBOX_TIMEOUT_DEFAULT).toBe(30);
  });

  it('matches an independent oracle on 500 mulberry32(42) cases', () => {
    const rand = mulberry32(42);
    const TOOL_LIST = [
      'web-search',
      'web-fetch',
      'fs-read',
      'fs-write',
      'shell-exec',
      'db-query',
      'db-migrate',
      'mail-send',
      'laser',
    ];
    const VALID_TOOLS = TOOL_LIST.slice(0, 8);
    const COMMANDS = [
      'npm test',
      'sudo rm -x',
      'rm -rf /tmp',
      'ls -la',
      'mkfs.ext4 /dev/sda',
      'chmod 777 /etc',
      'echo hi',
      '',
      'cat README.md',
    ];
    const HOSTS = ['api.github.com', 'evil.example', ''];
    const PATHS = ['/workspace/a.md', '/etc/x', '', '/workspace/deep/b.ts'];
    const DENY = ['rm -rf /', 'sudo ', 'mkfs', ':(){ :|:& };:', 'chmod 777 /'];
    for (let c = 0; c < 500; c++) {
      const tool = TOOL_LIST[Math.floor(rand() * TOOL_LIST.length)];
      const input: Record<string, unknown> = {};
      if (rand() < 0.9) input.tool = tool;
      if (rand() < 0.7) input.command = COMMANDS[Math.floor(rand() * COMMANDS.length)];
      const tk = rand();
      if (tk < 0.6) input.timeout = 1 + Math.floor(rand() * 600);
      else if (tk < 0.7) input.timeout = 0;
      else if (tk < 0.78) input.timeout = 601 + Math.floor(rand() * 50);
      else if (tk < 0.84) input.timeout = 7.5;
      const ek = rand();
      if (ek < 0.3) {
        input.egress = { host: HOSTS[Math.floor(rand() * HOSTS.length)] };
        if (rand() < 0.6) {
          const allow: unknown[] = [];
          if (rand() < 0.7) allow.push('api.github.com');
          if (rand() < 0.1) allow.push(5);
          input.egressAllowlist = allow;
        }
      }
      if (rand() < 0.5) {
        const writes: string[] = [];
        const wn = Math.floor(rand() * 3);
        for (let i = 0; i < wn; i++) {
          writes.push(PATHS[Math.floor(rand() * PATHS.length)]);
        }
        input.fileWrites = writes;
      }
      const got = runSandboxed(input);
      let expOk = true;
      let expReason = '';
      const tool2 = typeof input.tool === 'string' ? input.tool.trim().toLowerCase() : '';
      if (tool2.length === 0) {
        expOk = false;
        expReason = 'sandbox-tool-missing';
      } else if (!VALID_TOOLS.includes(tool2)) {
        expOk = false;
        expReason = 'sandbox-tool-unknown:' + tool2;
      } else {
        const t = input.timeout === undefined ? 30 : input.timeout;
        if (typeof t !== 'number' || !Number.isInteger(t) || t < 1 || t > 600) {
          expOk = false;
          expReason = 'sandbox-timeout-invalid:' + String(t);
        } else if (
          input.command !== undefined &&
          (typeof input.command !== 'string' || input.command.trim().length === 0)
        ) {
          expOk = false;
          expReason = 'sandbox-command-missing';
        } else if (input.command !== undefined) {
          const lower = ' ' + String(input.command).toLowerCase() + ' ';
          const frag = DENY.find((f) => lower.includes(f.toLowerCase()));
          if (frag) {
            expOk = false;
            expReason = 'sandbox-command-forbidden:' + frag.trim();
          }
        }
        if (expOk && input.egress !== undefined) {
          const h = (input.egress as { host?: unknown })?.host;
          if (typeof h !== 'string' || h.trim().length === 0) {
            expOk = false;
            expReason = 'sandbox-egress-host-missing';
          } else {
            const allow = Array.isArray(input.egressAllowlist) ? input.egressAllowlist : [];
            if (allow.some((x) => typeof x !== 'string')) {
              expOk = false;
              expReason = 'sandbox-egress-allowlist-invalid';
            } else {
              const host = h.trim().toLowerCase();
              if (!allow.includes(host)) {
                expOk = false;
                expReason = 'sandbox-egress-denied:' + host;
              }
            }
          }
        }
        if (expOk && Array.isArray(input.fileWrites)) {
          for (const w of input.fileWrites) {
            if (typeof w !== 'string' || w.trim().length === 0) {
              expOk = false;
              expReason = 'sandbox-path-missing';
              break;
            }
            if (!w.startsWith('/workspace/')) {
              expOk = false;
              expReason = 'sandbox-path-outside-workspace:' + w;
              break;
            }
          }
        }
        if (expOk) {
          const expRestrictions = ['workspace-only-fs', 'no-network', 'timeout-' + t + 's'];
          if (input.egress !== undefined) {
            expRestrictions.push(
              'egress:' + String((input.egress as { host: string }).host).trim().toLowerCase(),
            );
          }
          expect(got).toEqual({ ok: true, tool: tool2, timeout: t, restrictions: expRestrictions });
        }
      }
      expect(got.ok).toBe(expOk);
      if (!expOk) {
        expect(got.reason ?? '').toBe(expReason);
      }
    }
  });
});
