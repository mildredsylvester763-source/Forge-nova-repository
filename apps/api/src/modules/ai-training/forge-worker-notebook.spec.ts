/**
 * Pins the Phase 0 worker notebook contract (notebooks/forge-worker.ipynb).
 *
 * The notebook is the provider-agnostic training executor: it pulls the planned
 * run and its pinned dataset snapshot (fingerprint-verified), fine-tunes with
 * QLoRA 4-bit under the free-tier parameter limit, streams checkpoints, cost and
 * metrics, fingerprints weights with sha256, registers the version with lineage
 * (idempotently), closes the run honestly and NEVER promotes - the staged
 * promotion law (experimental -> internal -> beta -> stable) belongs to the
 * Forge gates, not the worker.
 */
import * as fs from 'fs';
import * as path from 'path';

interface NotebookCell {
  cell_type: string;
  source: string[] | string;
}

interface Notebook {
  nbformat: number;
  cells: NotebookCell[];
}

function findNotebookPath(): string {
  let dir = __dirname;
  for (let depth = 0; depth < 8; depth++) {
    const candidate = path.join(dir, 'notebooks', 'forge-worker.ipynb');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    dir = path.join(dir, '..');
  }
  throw new Error('notebooks/forge-worker.ipynb not found above ' + __dirname);
}

function loadNotebook(): Notebook {
  return JSON.parse(fs.readFileSync(findNotebookPath(), 'utf8')) as Notebook;
}

function cellText(cell: NotebookCell): string {
  return Array.isArray(cell.source) ? cell.source.join('') : cell.source;
}

function loadAllCode(nb: Notebook): string {
  return nb.cells
    .filter((cell) => cell.cell_type === 'code')
    .map(cellText)
    .join('\n@@CELL@@\n');
}

describe('Forge worker notebook (Phase 0 executor contract)', () => {
  it('is a valid ipynb whose cells are all non-empty', () => {
    const nb = loadNotebook();
    expect(nb.nbformat).toBe(4);
    expect(nb.cells.length).toBeGreaterThan(10);
    const codeCells = nb.cells.filter((cell) => cell.cell_type === 'code');
    expect(codeCells.length).toBeGreaterThan(5);
    for (const cell of nb.cells) {
      expect(cellText(cell).trim().length).toBeGreaterThan(0);
    }
  });

  it('keeps secrets out of code: the token is typed or read from Colab secrets', () => {
    const code = loadAllCode(loadNotebook());
    expect(code).toContain('def _load_token()');
    expect(code).toMatch(/userdata|getpass/);
    expect(code).not.toMatch(/sk-[A-Za-z0-9]{8,}/);
    expect(code).not.toMatch(/Bearer\s+[A-Za-z0-9._-]{16,}/);
  });

  it('talks to the real Forge API routes and no others', () => {
    const code = loadAllCode(loadNotebook());
    expect(code).toContain('def forge(method, path');
    expect(code).toContain('"/ai-training/runs/" + RUN_ID');
    expect(code).toContain('"/ai-training/datasets/" + run["datasetId"]');
    expect(code).toContain('"/ai-training/runs/" + RUN_ID + "/transition"');
    expect(code).toContain('"/ai-training/runs/" + RUN_ID + "/checkpoint"');
    expect(code).toContain('"/ai-training/runs/" + RUN_ID + "/cost"');
    expect(code).toContain('"/ai-training/runs/" + RUN_ID + "/metrics"');
    expect(code).toContain('"/ai-training/models/register"');
    expect(code).toContain('"/ai-training/models/" + MODEL_ID');
    const allowed = [
      '/ai-training/runs/',
      '/ai-training/datasets/',
      '/ai-training/models/',
      '/ai-training/models/register',
    ];
    const mentioned =
      code.match(/\/ai-training\/[A-Za-z0-9\-\/\{\}\._]*/g) || [];
    expect(mentioned.length).toBeGreaterThan(0);
    for (const route of mentioned) {
      expect(allowed).toContain(route);
    }
  });

  it('pins the dataset snapshot by fingerprint before training (the data diet law)', () => {
    const code = loadAllCode(loadNotebook());
    expect(code).toContain(
      'assert dataset["fingerprint"] == run["datasetFingerprint"], "snapshot-fingerprint-mismatch"',
    );
    expect(code).toContain(
      'assert manifest["fingerprint"] == run["datasetFingerprint"], "snapshot-fingerprint-mismatch"',
    );
    expect(code).toContain('unknown-record-shape');
  });

  it('enforces free-tier discipline: 4-bit QLoRA, under 3B parameters, gradient checkpointing', () => {
    const code = loadAllCode(loadNotebook());
    expect(code).toContain('MAX_PARAMS = 3_000_000_000');
    expect(code).toContain('model-over-free-tier-limit');
    expect(code).toContain('load_in_4bit=True');
    expect(code).toContain('use_gradient_checkpointing="unsloth"');
    expect(code).toContain('adamw_8bit');
    expect(code).toContain('save_total_limit=2');
  });

  it('streams checkpoints, cost and metrics with the real DTO shapes', () => {
    const code = loadAllCode(loadNotebook());
    expect(code).toContain('{"step": step, "loss": loss}');
    expect(code).toContain('{"step": step, "units":');
    expect(code).toContain('CHECKPOINT_EVERY');
    expect(code).toContain('LOG_EVERY');
  });

  it('resumes from checkpoint as the default, never the exception', () => {
    const code = loadAllCode(loadNotebook());
    expect(code).toContain('resume_from_checkpoint');
    expect(code).toContain('checkpoint-');
    expect(code).toContain('{"to": "running"}');
    expect(code).toContain('{"to": "succeeded"}');
  });

  it('fingerprints weights with sha256 and registers with lineage, idempotently', () => {
    const code = loadAllCode(loadNotebook());
    expect(code).toContain('def sha256_file(');
    expect(code).toContain('wf_sha256_');
    expect(code).toContain('"weightsFingerprint": WEIGHTS_FINGERPRINT');
    expect(code).toContain(
      '"lineage": {"datasetId": run["datasetId"], "runFingerprint": run["runFingerprint"]}',
    );
    expect(code).toContain('registration.get("reused")');
  });

  it('never promotes: the staged promotion law belongs to the gates, not the worker', () => {
    const code = loadAllCode(loadNotebook());
    expect(code).not.toContain('models/promote');
    expect(code).toContain('latest.get("stage")');
    expect(code).toContain('experimental -> internal -> beta -> stable');
  });
});
