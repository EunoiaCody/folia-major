// src/utils/kuwoSign.ts
// 酷我音乐 bodian 直连所需的签名与 URL 构造（纯函数，可单测）。
// 算法来自 @unblockneteasemusic/server 的 provider/bodian.js：
// sign = md5(`kuwotest${排序后的查询参数字符串}${pathname}`)

/** 标准 MD5 实现（RFC 1321），无外部依赖，供酷我 sign 使用。 */
export const md5 = (input: string): string => {
    const utf8 = unescape(encodeURIComponent(input));
    const bytes: number[] = [];
    for (let i = 0; i < utf8.length; i++) bytes.push(utf8.charCodeAt(i));

    const originalBitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    bytes.push((originalBitLen >>> 0) & 0xff);
    bytes.push((originalBitLen >>> 8) & 0xff);
    bytes.push((originalBitLen >>> 16) & 0xff);
    bytes.push((originalBitLen >>> 24) & 0xff);
    for (let i = 0; i < 4; i++) bytes.push(0);

    let a0 = 0x67452301;
    let b0 = 0xefcdab89;
    let c0 = 0x98badcfe;
    let d0 = 0x10325476;

    const shift = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
        5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
        4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
        6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
    const K: number[] = [];
    for (let i = 0; i < 64; i++) {
        K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000);
    }

    const leftRotate = (x: number, c: number): number => ((x << c) | (x >>> (32 - c))) >>> 0;

    for (let offset = 0; offset < bytes.length; offset += 64) {
        const M: number[] = [];
        for (let i = 0; i < 16; i++) {
            M[i] = (bytes[offset + i * 4]) | (bytes[offset + i * 4 + 1] << 8)
                | (bytes[offset + i * 4 + 2] << 16) | (bytes[offset + i * 4 + 3] << 24);
        }
        let A = a0, B = b0, C = c0, D = d0;
        for (let i = 0; i < 64; i++) {
            let F = 0, g = 0;
            if (i < 16) { F = (B & C) | (~B & D); g = i; }
            else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
            else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
            else { F = C ^ (B | ~D); g = (7 * i) % 16; }
            F = (F + A + K[i] + M[g]) >>> 0;
            A = D; D = C; C = B;
            B = (B + leftRotate(F, shift[i])) >>> 0;
        }
        a0 = (a0 + A) >>> 0;
        b0 = (b0 + B) >>> 0;
        c0 = (c0 + C) >>> 0;
        d0 = (d0 + D) >>> 0;
    }

    const toHex = (n: number): string => {
        let hex = '';
        for (let i = 0; i < 4; i++) {
            hex += ((n >>> (i * 8)) & 0xff).toString(16).padStart(2, '0');
        }
        return hex;
    };
    return toHex(a0) + toHex(b0) + toHex(c0) + toHex(d0);
};

/**
 * 构造酷我音频直链请求 URL（含 timestamp 与 sign）。
 * @param musicId 酷我 rid（数字）
 * @param br 音质：'320kmp3' | '2000kflac'
 */
export const buildKuwoAudioUrl = (musicId: number | string, br: '320kmp3' | '2000kflac' = '320kmp3'): string => {
    const base = 'http://bd-api.kuwo.cn/api/play/music/v2/audioUrl';
    const timestamp = Date.now();
    const url = `${base}?&br=${br}&musicId=${musicId}&timestamp=${timestamp}`;
    const pathname = '/api/play/music/v2/audioUrl';
    const query = url.substring(url.indexOf('?') + 1);
    const filtered = query.replace(/[^a-zA-Z0-9]/g, '').split('').sort().join('');
    const dataToEncrypt = `kuwotest${filtered}${pathname}`;
    return `${url}&sign=${md5(dataToEncrypt)}`;
};

/** 模拟 bodian 客户端的请求头（酷我按 UA/设备特征分发）。 */
export const buildKuwoHeaders = (): Record<string, string> => ({
    'User-Agent': 'Dart/2.19 (dart:io)',
    plat: 'ar',
    channel: 'aliopen',
    devid: String(Math.floor(Math.random() * 100000000000)),
    ver: '3.9.0',
    host: 'bd-api.kuwo.cn',
    'X-Forwarded-For': '1.0.1.114',
});
