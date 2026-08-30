import type { SongResult } from '../types';
import type { AudioQualityPreference, OmniAudioSource } from '../types/onlineMusic';
import { omni } from './onlineMusic/omni';
import { useSettingsUiStore } from '../stores/useSettingsUiStore';
import { calculateMatchScoreDetails } from '../utils/lyrics/matchScore';
import { buildLyricSearchQuery } from '../utils/lyrics/searchQuery';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';
import { resolveKuwoDirectSource } from './kuwoClient';

// src/services/unlockService.ts
// 显式 cross-provider 编排：当歌曲所属 provider 的标准授权音源不可用时，
// 先允许同平台 unblock（netease unblock=true，provider adapter 内实现），
// 仍失败再跨 provider（酷狗 → QQ）用歌曲元信息搜索同曲替换音源。
// 每次结果都带 unlocked 标记与 sourceRef.providerId，原歌曲身份不被污染。

/** 跨 provider 替换的候选顺序：酷狗（免费率高、无需登录）→ QQ。 */
const UNLOCK_FALLBACK_PROVIDERS = ['kugou', 'qq'] as const;
type UnlockFallbackProviderId = (typeof UNLOCK_FALLBACK_PROVIDERS)[number];

const UNLOCK_SEARCH_LIMIT = 10;
/** 与歌词自动匹配一致的最低可靠分数（0-100）。 */
const UNLOCK_MIN_SCORE = 75;

export interface UnlockResolveOptions {
    /** 覆盖设置中的解锁总开关（默认读 store）。 */
    allow?: boolean;
    /** 覆盖设置中的跨 provider 替换开关（默认读 store）。 */
    allowCrossProvider?: boolean;
}

const isReliableCandidate = (details: ReturnType<typeof calculateMatchScoreDetails>): boolean =>
    details.titleMatched && (details.artistMatched || details.albumMatched === true);

const buildTargetSong = (song: SongResult): { title: string; artist: string; durationMs: number; album?: string } => ({
    title: song.name,
    artist: (song.artists || []).map(artist => artist.name).join('/'),
    durationMs: song.durationMs,
    album: song.album?.name,
});

/** 在指定 provider 搜索同曲并取第一个可播放音源；无可靠匹配或音源不可播返回 null。 */
async function findMatchingSource(
    providerId: UnlockFallbackProviderId,
    target: { title: string; artist: string; durationMs: number; album?: string },
    quality: AudioQualityPreference,
): Promise<OmniAudioSource | null> {
    const query = buildLyricSearchQuery(target.title, target.artist, target.album);
    const page = await omni.searchProviderSongs(providerId, query, { limit: UNLOCK_SEARCH_LIMIT, offset: 0 });
    const scored = page.items
        .map(song => ({ song, details: calculateMatchScoreDetails(target, song) }))
        .sort((a, b) => b.details.score - a.details.score);

    for (const { song, details } of scored) {
        if (!isReliableCandidate(details) || details.score < UNLOCK_MIN_SCORE) continue;
        const audio = await omni.getAudioSource(song, quality);
        if (!audio) continue;
        return {
            ...audio,
            unlocked: {
                from: providerId,
                matchedSongKey: getPlaybackSongKey(song),
            },
        };
    }
    return null;
}

/**
 * 解析歌曲可播放音源，带 VIP 解锁编排：
 * 1. 标准授权音源（provider 原始 grant，未触发任何解锁）
 * 2. 同平台 unblock（netease unblock=true，由 provider adapter 实现，同平台完整音源）
 * 3. 跨 provider 替换（酷狗 → QQ，基于歌曲元信息的语义匹配）
 */
export const resolveUnlockedAudioSource = async (
    song: SongResult,
    quality: AudioQualityPreference,
    options: UnlockResolveOptions = {},
): Promise<OmniAudioSource | null> => {
    const settings = useSettingsUiStore.getState();
    const allow = options.allow ?? settings.unlockVipSongs;
    const allowCrossProvider = options.allowCrossProvider ?? settings.unlockUseCrossProviderFallback;

    // 1 + 2：标准授权；总开关开启时允许同平台 unblock。
    const source = await omni.getAudioSource(song, quality, allow ? { allowUnlock: true } : undefined);
    if (source) return source;
    // 总开关关闭（保持原行为）或不允许跨 provider 替换时到此为止。
    if (!allow || !allowCrossProvider) {
        console.warn(`[UnlockService] source unavailable for "${song.name}" (allow=${allow}, crossProvider=${allowCrossProvider}); provider adapter logged the unlock reason`);
        return null;
    }

    // 3：客户端直连酷我（用户自己的 IP，绕开服务器 IP 被酷我风控的问题；
    // 不依赖任何服务端配置，与 SPlayer 的 bodian 源同链路）。
    const target = buildTargetSong(song);
    try {
        const kuwoUrl = await resolveKuwoDirectSource(target.title, target.artist, target.durationMs);
        if (kuwoUrl) {
            const safeUrl = kuwoUrl.replace(/^http:/, 'https:');
            console.log(`[UnlockService] client-side kuwo direct for "${song.name}" -> ${safeUrl.slice(0, 90)}...`);
            return {
                url: safeUrl,
                fetchedAt: Date.now(),
                quality,
                unlocked: { from: 'kuwo' },
            };
        }
    } catch (error) {
        console.warn(`[UnlockService] kuwo direct failed for song "${song.name}"`, error);
    }

    // 4：跨 provider 替换（显式 cross-provider，保留每条结果的 providerId）。
    for (const providerId of UNLOCK_FALLBACK_PROVIDERS) {
        try {
            // 未配置的 provider（Web 端缺 VITE_KUGOU_API_BASE / VITE_QQ_API_BASE）
            // 直接提示，避免把「未配置」误当成「搜索失败」。
            const availability = omni.getProviderAvailability(providerId);
            if (!availability.configured) {
                console.warn(`[UnlockService] skip ${providerId} fallback for "${song.name}": ${providerId} API not configured`);
                continue;
            }
            const matched = await findMatchingSource(providerId, target, quality);
            if (matched) {
                console.log(`[UnlockService] cross-provider fallback ${providerId} for "${song.name}" -> ${matched.url.slice(0, 90)}...`);
                return matched;
            }
        } catch (error) {
            // 搜索或音源获取失败不阻断其他 provider；保留原有不可播语义。
            console.warn(`[UnlockService] provider ${providerId} fallback failed for song "${song.name}"`, error);
        }
    }
    console.warn(`[UnlockService] all unlock channels failed for "${song.name}" (standard/unblock/match + cross-provider)`);
    return null;
};
