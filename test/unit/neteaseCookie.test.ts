import { describe, expect, it } from 'vitest';
import { normalizePastedCookie } from '@/services/netease';

// test/unit/neteaseCookie.test.ts

describe('normalizePastedCookie', () => {
    it('joins newline-separated cookies into a single cookie header string', () => {
        const input = 'MUSIC_U=abc123\n__csrf=deadbeef\nNMTID=001';
        expect(normalizePastedCookie(input)).toBe('MUSIC_U=abc123;__csrf=deadbeef;NMTID=001');
    });

    it('strips quotes from cookie values copied from browser devtools', () => {
        const input = 'MUSIC_U="abc123"; __csrf="deadbeef"';
        expect(normalizePastedCookie(input)).toBe('MUSIC_U=abc123;__csrf=deadbeef');
    });

    it('compresses spaces around semicolons and trims the ends', () => {
        const input = '  MUSIC_U = abc ;  __csrf = xyz  ';
        // 值两侧空格由后端 cookieToJson trim，这里只归一化分号与引号。
        expect(normalizePastedCookie(input)).toBe('MUSIC_U = abc;__csrf = xyz');
    });

    it('handles single quotes too', () => {
        expect(normalizePastedCookie("MUSIC_U='abc';__csrf='1'")).toBe('MUSIC_U=abc;__csrf=1');
    });

    it('leaves a clean cookie untouched', () => {
        const clean = 'MUSIC_U=abc;__csrf=1';
        expect(normalizePastedCookie(clean)).toBe(clean);
    });
});
