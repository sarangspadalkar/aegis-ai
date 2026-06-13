import { mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Docker Desktop on Windows exposes the daemon via this named pipe.
// The test runner's PATH doesn't include docker-credential-desktop, so we
// bypass the credential helper entirely and connect to the pipe directly.
process.env.DOCKER_HOST = 'npipe:////./pipe/docker_engine';

const dir = join(tmpdir(), 'vitest-docker-config');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'config.json'), JSON.stringify({ auths: {} }));
process.env.DOCKER_CONFIG = dir;
