import { buildKuwoAudioUrl, buildKuwoHeaders } from '../utils/kuwoSign';

// src/services/kuwoClient.ts
// 酷我音乐（bodian 源）客户端直连：用「用户自己的 IP」完成搜索 → 匹配 → 取直链 → 播放，
// 绕开部署服务器（如 Vercel 海外 IP）访问酷我被风控的问题。与 SPlayer 的 UNM bodian 同链路。
// 仅浏览器环境（JSONP 依赖 document/window）；服务端或 SSR 环境会直接返回 null。

export interface KuwoCandidate {
    id: string;
    name: string;
    artists: string;
    durationMs: number;
    album: string;
}

/** 从酷我搜索 JSONP 响应中提取候选列表（结构对应 bodian.js 的 format）。 */
const extractCandidates = (data: unknown): KuwoCandidate[] => {
    const content = (data as { content?: Array<{ musicpage?: { abslist?: Array<Record<string, unknown>> } }> })?.content;
    const abslist = content?.[1]?.musicpage?.abslist;
    if (!Array.isArray(abslist)) return [];
    return abslist
        .map(song => ({
            id: String((song.MUSICRID as string) || '').split('_').pop() || '',
            name: String(song.SONGNAME || ''),
            artists: String(song.ARTIST || ''),
            durationMs: Number(song.DURATION || 0) * 1000,
            album: String(song.ALBUM || ''),
        }))
        .filter(item => item.id && item.name);
};

/** 动态注入 script 加载酷我搜索 JSONP；响应为 try{var jsondata={...}}，顶层 var 挂到 window。 */
const jsonpSearch = (keyword: string, timeoutMs = 10000): Promise<KuwoCandidate[]> => {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
        return Promise.resolve([]);
    }
    const url = 'https://search.kuwo.cn/r.s?&correct=1&vipver=1&stype=comprehensive&encoding=utf8'
        + '&rformat=json&mobi=1&show_copyright_off=1&searchapi=6&all=' + encodeURIComponent(keyword);
    return new Promise(resolve => {
        const script = document.createElement('script');
        const finish = (candidates: KuwoCandidate[]) => {
            script.remove();
            delete (window as { jsondata?: unknown }).jsondata;
            resolve(candidates);
        };
        const timer = window.setTimeout(() => finish([]), timeoutMs);
        script.onload = () => {
            window.clearTimeout(timer);
            finish(extractCandidates((window as { jsondata?: unknown }).jsondata));
        };
        script.onerror = () => {
            window.clearTimeout(timer);
            finish([]);
        };
        script.src = url;
        document.head.appendChild(script);
    });
};

/** 按时长窗口（±5s）+ 歌手包含选择候选 rid。 */
const matchKuwoCandidate = (candidates: KuwoCandidate[], durationMs: number, artist: string): string | null => {
    const targetArtists = artist.toLowerCase().split('/').map(name => name.trim()).filter(Boolean);
    const byDuration = candidates.filter(item => {
        if (durationMs > 0 && Math.abs(item.durationMs - durationMs) > 5000) return false;
        if (targetArtists.length === 0) return true;
        const artists = item.artists.toLowerCase();
        return targetArtists.some(name => name && artists.includes(name));
    });
    return byDuration[0]?.id ?? null;
};

/** 用酷我 rid 获取音频直链（浏览器 fetch；preflight 已确认允许 plat/ver/channel/devid）。 */
const fetchKuwoAudioUrl = async (rid: string, flac = false): Promise<string | null> => {
    const url = buildKuwoAudioUrl(rid, flac ? '2000kflac' : '320kmp3');
    try {
        const res = await fetch(url, { headers: buildKuwoHeaders() });
        const json = await res.json() as { code?: number; data?: { audioUrl?: string } };
        if (json.code === 200 && typeof json.data?.audioUrl === 'string' && json.data.audioUrl) {
            return json.data.audioUrl;
        }
        return null;
    } catch (error) {
        console.warn('[KuwoClient] fetch audio url failed for rid', rid, error);
        return null;
    }
};

/**
 * 客户端直连酷我解锁：搜索同曲 → 匹配 rid → 取直链。
 * 任一步失败返回 null（由 unlockService 回退到后续渠道）。
 */
export const resolveKuwoDirectSource = async (
    name: string,
    artist: string,
    durationMs: number,
): Promise<string | null> => {
    const keyword = `${name} ${artist}`.trim();
    const candidates = await jsonpSearch(keyword);
    if (candidates.length === 0) {
        console.warn(`[KuwoClient] no candidates for "${keyword}"`);
        return null;
    }
    const rid = matchKuwoCandidate(candidates, durationMs, artist);
    if (!rid) {
        console.warn(`[KuwoClient] no duration/artist match for "${keyword}" (${candidates.length} candidates)`);
        return null;
    }
    const audioUrl = await fetchKuwoAudioUrl(rid);
    if (!audioUrl) {
        console.warn(`[KuwoClient] audio url unavailable for rid ${rid}`);
        return null;
    }
    return audioUrl;
};
