import type { SongResult, UnifiedSong } from '../../types';
import type { ProviderSongAvailability, ProviderSongReplacement } from '../../types/onlineMusic';
import { getOnlineMusicProviderForSong } from './providerRegistry';
import { getPlaybackSourceRef } from '../../utils/appPlaybackGuards';
import { useAudioSettingsStore } from '../../stores/useAudioSettingsStore';

// src/services/onlineMusic/songAvailability.ts

const PLAYABLE: ProviderSongAvailability = { state: 'playable' };
const UNKNOWN: ProviderSongAvailability = { state: 'unknown' };

// Resolves provider-owned availability without exposing provider-specific fields to UI code.
export const getSongAvailability = (song: SongResult): ProviderSongAvailability => {
    if (getPlaybackSourceRef(song).kind !== 'online') return PLAYABLE;

    const provider = getOnlineMusicProviderForSong(song);
    return provider?.playback?.getAvailability?.(song) || UNKNOWN;
};

export const isSongUnavailable = (song: SongResult | null | undefined): boolean => (
    Boolean(song && getSongAvailability(song).state === 'unavailable')
);

export const getSongUnavailableLabel = (
    song: SongResult | null | undefined,
    fallbackLabel: string,
): string => {
    if (!song) return fallbackLabel;
    return getSongAvailability(song).label || fallbackLabel;
};

// The tag a row shows beside a song's name: why it cannot be played, else that its audio is a
// video's; '' where it shows none.
export const getSongTag = (song: SongResult, labels: { unavailable: string; video: string }): string => {
    if (isSongUnavailable(song)) return getSongUnavailableLabel(song, labels.unavailable);
    return song.isVideo ? labels.video : '';
};

export const getSongReplacement = async (
    song: SongResult,
): Promise<ProviderSongReplacement | null> => {
    if (getPlaybackSourceRef(song).kind !== 'online') return null;
    return getOnlineMusicProviderForSong(song)?.playback?.getReplacement?.(song) || null;
};

/**
 * 无版权歌曲是否应自动替代播放：在线歌 + 被标记无版权 + 用户开启无版权替代。
 * UI 放行（搜索点播/列表过滤/入队/队列切歌）与播放链路共用同一判断，避免各写一份开关逻辑。
 * settings 可选：不传时从 store 读取当前开关，保证各处调用都尊重用户设置。
 */
export const shouldAutoReplaceUnavailableSong = (
    song: SongResult | null | undefined,
    settings?: { unlockUnavailableSongs: boolean },
): boolean => {
    if (!song) return false;
    const enabled = settings?.unlockUnavailableSongs ?? useAudioSettingsStore.getState().unlockUnavailableSongs;
    return enabled && getPlaybackSourceRef(song).kind === 'online' && getSongAvailability(song).state === 'unavailable';
};

/**
 * The song `song` is played as in its place (the platform's getPlayedSong), or null; null without
 * a wait where its platform has no such song, and where the platform could not be asked.
 */
export const askPlayedSong = (song: SongResult): Promise<UnifiedSong | null> | null => {
    if (getPlaybackSourceRef(song).kind !== 'online') return null;
    const playback = getOnlineMusicProviderForSong(song)?.playback;
    return playback?.getPlayedSong ? playback.getPlayedSong(song).catch(() => null) : null;
};
