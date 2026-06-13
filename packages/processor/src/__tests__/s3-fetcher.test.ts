import { describe, it, expect, vi } from 'vitest';
import type { S3Client } from '@aws-sdk/client-s3';
import { getObjectContent } from '../s3-fetcher';

function makeS3(body: unknown): S3Client {
  return { send: vi.fn().mockResolvedValue({ Body: body }) } as unknown as S3Client;
}

describe('getObjectContent', () => {
  it('returns the decoded string content of the S3 object', async () => {
    const s3 = makeS3({ transformToString: vi.fn().mockResolvedValue('hello content') });
    const result = await getObjectContent(s3, 'my-bucket', 'path/file.txt');
    expect(result).toBe('hello content');
  });

  it('calls GetObjectCommand with the correct bucket and key', async () => {
    const mockSend = vi.fn().mockResolvedValue({
      Body: { transformToString: vi.fn().mockResolvedValue('') },
    });
    const s3 = { send: mockSend } as unknown as S3Client;

    await getObjectContent(s3, 'bucket-name', 'some/key.txt');

    const commandArg = mockSend.mock.calls[0][0];
    expect(commandArg.input).toEqual({ Bucket: 'bucket-name', Key: 'some/key.txt' });
  });

  it('throws when Body is missing', async () => {
    const s3 = makeS3(undefined);
    await expect(getObjectContent(s3, 'bucket', 'key')).rejects.toThrow('Empty object: bucket/key');
  });
});
