import { describe, expect, it } from 'vitest';
import { buildKuwoAudioUrl, md5 } from '@/utils/kuwoSign';

// test/unit/kuwoSign.test.ts

describe('md5', () => {
    it('matches standard MD5 vectors', () => {
        expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
        expect(md5('abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
        expect(md5('晴天')).toBe(md5('晴天')); // 稳定
        expect(md5('kuwotestbr320kmp3musicId228908timestamp1/api/play/music/v2/audioUrl')).toHaveLength(32);
    });

    it('is deterministic for the same input', () => {
        const input = 'the quick brown fox jumps over the lazy dog';
        expect(md5(input)).toBe(md5(input));
    });
});

describe('buildKuwoAudioUrl', () => {
    it('produces a signed URL with timestamp and md5 sign', () => {
        const url = buildKuwoAudioUrl(228908, '320kmp3');
        expect(url).toMatch(/^http:\/\/bd-api\.kuwo\.cn\/api\/play\/music\/v2\/audioUrl\?&br=320kmp3&musicId=228908&timestamp=\d+&sign=[a-f0-9]{32}$/);
    });

    it('signs with the bodian algorithm (kuwotest + sorted alphanumerics + pathname)', () => {
        // 从生成 URL 中解析 timestamp 与 sign，用 bodian 算法重算验证可复现。
        const url = buildKuwoAudioUrl(228908, '320kmp3');
        const signMatch = url.match(/timestamp=(\d+)&sign=([a-f0-9]{32})$/);
        expect(signMatch).not.toBeNull();
        const [, ts, sign] = signMatch!;
        const pathname = '/api/play/music/v2/audioUrl';
        const query = `&br=320kmp3&musicId=228908&timestamp=${ts}`;
        const filtered = query.replace(/[^a-zA-Z0-9]/g, '').split('').sort().join('');
        expect(sign).toBe(md5(`kuwotest${filtered}${pathname}`));
    });
});
