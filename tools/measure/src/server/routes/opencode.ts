import { Router, Request, Response } from 'express';
import {
  getSetting,
  setSetting,
  getOpenCodeServers,
  getOpenCodeModel,
} from '../opencode-settings.js';

const router = Router();

const SHOW_PROVIDERS = new Set([
  'opencode',
  'openai',
  'github-copilot',
  'google',
  'anthropic',
]);

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

interface StatusObject {
  servers: Array<{ id: string; label: string; base_url: string }>;
  servers_source: 'setting' | 'env' | 'none';
  text_model: string;
  text_model_source: 'setting' | 'env' | 'default';
}

function buildStatus(): StatusObject {
  const savedServers = getSetting('opencode_servers');
  const servers = getOpenCodeServers();

  let servers_source: 'setting' | 'env' | 'none';
  if (savedServers && savedServers.trim()) {
    servers_source = 'setting';
  } else if (process.env.OPENCODE_SERVER_URL) {
    servers_source = 'env';
  } else {
    servers_source = 'none';
  }

  const savedModel = getSetting('opencode_text_model');
  const text_model = getOpenCodeModel();

  let text_model_source: 'setting' | 'env' | 'default';
  if (savedModel && savedModel.trim()) {
    text_model_source = 'setting';
  } else if (process.env.OPENCODE_MODEL) {
    text_model_source = 'env';
  } else {
    text_model_source = 'default';
  }

  return {
    servers: servers.map((url, i) => ({
      id: String(i),
      label: url,
      base_url: url,
    })),
    servers_source,
    text_model,
    text_model_source,
  };
}

function buildAuthHeader(): Record<string, string> {
  const password = process.env.OPENCODE_SERVER_PASSWORD;
  if (!password) return {};
  const encoded = Buffer.from(`:${password}`).toString('base64');
  return { Authorization: `Basic ${encoded}` };
}

// ──────────────────────────────────────────────
// GET /api/settings/opencode
// ──────────────────────────────────────────────
router.get('/settings/opencode', (_req: Request, res: Response) => {
  res.json(buildStatus());
});

// ──────────────────────────────────────────────
// POST /api/settings/opencode
// Body: { servers?: string; text_model?: string }
// ──────────────────────────────────────────────
router.post('/settings/opencode', (req: Request, res: Response) => {
  const { servers, text_model } = req.body as {
    servers?: string;
    text_model?: string;
  };

  if (servers !== undefined) {
    setSetting('opencode_servers', servers || null);
  }
  if (text_model !== undefined) {
    setSetting('opencode_text_model', text_model || null);
  }

  res.json(buildStatus());
});

// ──────────────────────────────────────────────
// DELETE /api/settings/opencode
// ──────────────────────────────────────────────
router.delete('/settings/opencode', (_req: Request, res: Response) => {
  setSetting('opencode_servers', null);
  setSetting('opencode_text_model', null);
  res.json(buildStatus());
});

// ──────────────────────────────────────────────
// GET /api/settings/opencode/models
// ──────────────────────────────────────────────

interface RawProvider {
  id: string;
  name?: string;
  models?: Array<{
    id: string;
    name?: string;
    cost?: { input?: number; output?: number };
  }>;
}

interface ModelGroup {
  provider: string;
  name: string;
  authed: boolean;
  models: Array<{ id: string; name: string; free: boolean }>;
}

router.get('/settings/opencode/models', async (_req: Request, res: Response) => {
  const servers = getOpenCodeServers();
  if (servers.length === 0) {
    res.status(400).json({ error: 'No OpenCode server configured' });
    return;
  }

  const server = servers[0];
  const authHeader = buildAuthHeader();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const [providersRes, authedRes] = await Promise.all([
      fetch(`${server}/provider`, {
        headers: authHeader,
        signal: controller.signal,
      }),
      fetch(`${server}/provider/auth`, {
        headers: authHeader,
        signal: controller.signal,
      }),
    ]);

    clearTimeout(timeout);

    if (!providersRes.ok) {
      res.status(502).json({ error: `OpenCode /provider returned ${providersRes.status}` });
      return;
    }

    const allProviders = (await providersRes.json()) as RawProvider[];

    // authed endpoint returns providers that still need auth (i.e. NOT yet authenticated)
    let needsAuthIds = new Set<string>();
    if (authedRes.ok) {
      const needsAuth = (await authedRes.json()) as RawProvider[];
      needsAuthIds = new Set(needsAuth.map((p) => p.id));
    }

    const groups: ModelGroup[] = allProviders
      .filter((p) => SHOW_PROVIDERS.has(p.id))
      .map((p) => ({
        provider: p.id,
        name: p.name ?? p.id,
        authed: !needsAuthIds.has(p.id),
        models: (p.models ?? []).map((m) => ({
          id: `${p.id}/${m.id}`,
          name: m.name ?? m.id,
          free: m.cost?.input === 0,
        })),
      }));

    res.json({ groups, server });
  } catch (err: unknown) {
    clearTimeout(timeout);
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `Failed to reach OpenCode server: ${message}` });
  }
});

export default router;
