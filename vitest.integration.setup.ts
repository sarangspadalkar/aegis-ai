import { mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// On Windows, Docker Desktop exposes the daemon via a named pipe and the
// credential helper (docker-credential-desktop) is not in the test runner's
// PATH. Connect directly via the pipe and supply a credential-free config.
// On Linux (CI), the Unix socket and default config work without any setup.
if (process.platform === 'win32') {
  process.env.DOCKER_HOST = 'npipe:////./pipe/docker_engine';

  const dir = join(tmpdir(), 'vitest-docker-config');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ auths: {} }));
  process.env.DOCKER_CONFIG = dir;
}
