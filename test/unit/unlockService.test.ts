import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SongResult } from '@/types';
import type { OmniAudioSource } from '@/types/onlineMusic';

const getStateMock = vi.hoisted(() => vi.fn(() => ({
    unlockVipSongs: true,
    unlockUseCrossProviderFallback: true,
})));

vi.mock('@/stores/useSettingsUiStore', () => ({
    useSettingsUiStore: { getState: getStateMock },
}));

const omniGetAudioSourceMock = vi.hoisted(() => vi.fn());
const omniSearchProviderSongsMock = vi.hoisted(() => vi.fn());
const omniGetProviderAvailabilityMock = vi.hoisted(() => vi.fn(() => ({ configured: true })));
const kuwoResolveMock = vi.hoisted(() => vi.fn(async () => null as string | null));

vi.mock('@/services/onlineMusic/omni', () => ({
    omni: {
        getAudioSource: omniGetAudioSourceMock,
        searchProviderSongs: omniSearchProviderSongsMock,
        getProviderAvailability: omniGetProviderAvailabilityMock,
    },
}));

vi.mock('@/services/kuwoClient', () => ({
    resolveKuwoDirectSource: kuwoResolveMock,
}));

import { resolveUnlockedAudioSource } from '@/services/unlockService';

const makeSong = (overrides: Partial<SongResult> = {}): SongResult => ({
    id: '123',
    name: '晴天',
    artists: [{ id: 1, name: '周杰伦' }],
    album: { id: 1, name: '叶惠美' },
    durationMs: 269000,
    sourceRef: { kind: 'online', providerId: 'netease', mediaId: '123' },
    ...overrides,
});

const providerIdOf = (song: SongResult): string | null =>
    song.sourceRef?.kind === 'online' ? song.sourceRef.providerId : null;

const makeSource = (overrides: Partial<OmniAudioSource> = {}): OmniAudioSource => ({
    url: 'https://example.com/audio.mp3',
    fetchedAt: Date.now(),
    quality: 'high',
    ...overrides,
});

describe('resolveUnlockedAudioSource', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getStateMock.mockReturnValue({ unlockVipSongs: true, unlockUseCrossProviderFallback: true });
    });

    it('returns the standard source untouched when the provider grants one', async () => {
        const song = makeSong();
        const standard = makeSource();
        omniGetAudioSourceMock.mockResolvedValue(standard);

        const result = await resolveUnlockedAudioSource(song, 'high');

        expect(result).toEqual(standard);
        expect(result?.unlocked).toBeUndefined();
        expect(omniGetAudioSourceMock).toHaveBeenCalledWith(song, 'high', { allowUnlock: true });
        expect(omniSearchProviderSongsMock).not.toHaveBeenCalled();
    });

    it('falls back to the same-platform unblock first, then kugou when it still fails', async () => {
        const song = makeSong();
        const kugouSong = makeSong({
            id: 'abc',
            name: '晴天',
            artists: [{ id: 9, name: '周杰伦' }],
            sourceRef: { kind: 'online', providerId: 'kugou', mediaId: 'abc' },
        });
        const kugouSource = makeSource({ url: 'https://fs.kugou.com/audio.flac' });
        // Standard + unblock attempt on the netease song fails; kugou candidate succeeds.
        omniGetAudioSourceMock.mockImplementation((target: SongResult) =>
            providerIdOf(target) === 'kugou' ? Promise.resolve(kugouSource) : Promise.resolve(null),
        );
        omniSearchProviderSongsMock.mockResolvedValue({ items: [kugouSong], hasMore: false, nextOffset: 0 });

        const result = await resolveUnlockedAudioSource(song, 'high');

        expect(result?.url).toBe(kugouSource.url);
        expect(result?.unlocked).toEqual({ from: 'kugou', matchedSongKey: expect.any(String) });
        // The cross-provider source keeps its own provider identity in the matched key.
        expect(result?.unlocked?.matchedSongKey).toContain('kugou');
        expect(omniSearchProviderSongsMock).toHaveBeenCalledWith('kugou', expect.any(String), { limit: 10, offset: 0 });
    });

    it('returns null when every provider fails', async () => {
        const song = makeSong();
        omniGetAudioSourceMock.mockResolvedValue(null);
        omniSearchProviderSongsMock.mockResolvedValue({ items: [], hasMore: false, nextOffset: 0 });

        const result = await resolveUnlockedAudioSource(song, 'high');

        expect(result).toBeNull();
        expect(omniSearchProviderSongsMock).toHaveBeenCalledWith('kugou', expect.any(String), expect.any(Object));
        expect(omniSearchProviderSongsMock).toHaveBeenCalledWith('qq', expect.any(String), expect.any(Object));
    });

    it('does not pick a mismatched candidate (different artist, score below threshold)', async () => {
        const song = makeSong();
        const wrongSong = makeSong({
            id: 'def',
            name: '晴天',
            artists: [{ id: 99, name: '蔡依林' }],
            durationMs: 300000, // far outside the duration window too
            sourceRef: { kind: 'online', providerId: 'kugou', mediaId: 'def' },
        });
        omniGetAudioSourceMock.mockResolvedValue(null);
        omniSearchProviderSongsMock.mockResolvedValue({ items: [wrongSong], hasMore: false, nextOffset: 0 });

        const result = await resolveUnlockedAudioSource(song, 'high');

        expect(result).toBeNull();
        // The candidate audio source must never be requested for a mismatched song.
        expect(omniGetAudioSourceMock).toHaveBeenCalledTimes(1);
    });

    it('keeps the original behaviour when the unlock master switch is off', async () => {
        getStateMock.mockReturnValue({ unlockVipSongs: false, unlockUseCrossProviderFallback: true });
        const song = makeSong();
        omniGetAudioSourceMock.mockResolvedValue(null);

        const result = await resolveUnlockedAudioSource(song, 'high');

        expect(result).toBeNull();
        // No allowUnlock, no cross-provider search.
        expect(omniGetAudioSourceMock).toHaveBeenCalledWith(song, 'high', undefined);
        expect(omniSearchProviderSongsMock).not.toHaveBeenCalled();
    });

    it('skips cross-provider fallback when only that switch is off', async () => {
        getStateMock.mockReturnValue({ unlockVipSongs: true, unlockUseCrossProviderFallback: false });
        const song = makeSong();
        omniGetAudioSourceMock.mockResolvedValue(null);

        const result = await resolveUnlockedAudioSource(song, 'high');

        expect(result).toBeNull();
        expect(omniSearchProviderSongsMock).not.toHaveBeenCalled();
    });

    it('honours an explicit allow option for unavailable-song auto-replace', async () => {
        // 无版权歌的调用方显式传 allow，绕过 store 默认值（unlockVipSongs=false 也不影响）。
        getStateMock.mockReturnValue({ unlockVipSongs: false, unlockUseCrossProviderFallback: true });
        const song = makeSong();
        const kugouSong = makeSong({
            id: 'k1',
            name: '晴天',
            artists: [{ id: 9, name: '周杰伦' }],
            sourceRef: { kind: 'online', providerId: 'kugou', mediaId: 'k1' },
        });
        omniGetAudioSourceMock.mockImplementation((target: SongResult) =>
            providerIdOf(target) === 'kugou' ? Promise.resolve(makeSource({ url: 'https://fs.kugou.com/x.flac' })) : Promise.resolve(null),
        );
        omniSearchProviderSongsMock.mockResolvedValue({ items: [kugouSong], hasMore: false, nextOffset: 0 });

        const result = await resolveUnlockedAudioSource(song, 'high', { allow: true });

        expect(result?.unlocked).toEqual({ from: 'kugou', matchedSongKey: expect.any(String) });
        expect(omniSearchProviderSongsMock).toHaveBeenCalled();
    });

    it('logs a diagnostic warning and returns null when the whole chain fails', async () => {
        getStateMock.mockReturnValue({ unlockVipSongs: true, unlockUseCrossProviderFallback: true });
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const song = makeSong();
        omniGetAudioSourceMock.mockResolvedValue(null);
        kuwoResolveMock.mockResolvedValue(null);
        omniSearchProviderSongsMock.mockResolvedValue({ items: [], hasMore: false, nextOffset: 0 });

        const result = await resolveUnlockedAudioSource(song, 'high');

        expect(result).toBeNull();
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[UnlockService] all unlock channels failed'));
        warnSpy.mockRestore();
    });

    it('falls back to the client-side kuwo direct source before cross-provider search', async () => {
        getStateMock.mockReturnValue({ unlockVipSongs: true, unlockUseCrossProviderFallback: true });
        const song = makeSong();
        omniGetAudioSourceMock.mockResolvedValue(null);
        kuwoResolveMock.mockResolvedValue('http://bd-er.kuwo.cn/trackmedia/song.mp3');

        const result = await resolveUnlockedAudioSource(song, 'high');

        expect(result?.url).toBe('https://bd-er.kuwo.cn/trackmedia/song.mp3');
        expect(result?.unlocked).toEqual({ from: 'kuwo' });
        expect(kuwoResolveMock).toHaveBeenCalledWith('晴天', '周杰伦', 269000);
        expect(omniSearchProviderSongsMock).not.toHaveBeenCalled();
    });
});
