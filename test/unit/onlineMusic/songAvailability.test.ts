import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SongResult, UnifiedSong } from '@/types';
import { shouldAutoReplaceUnavailableSong } from '@/services/onlineMusic/songAvailability';
import { registerOnlineMusicProvider, unregisterOnlineMusicProvider } from '@/services/onlineMusic/providerRegistry';

// test/unit/onlineMusic/songAvailability.test.ts

const storeStateMock = vi.hoisted(() => vi.fn(() => ({ unlockUnavailableSongs: true })));
vi.mock('@/stores/useSettingsUiStore', () => ({
    useSettingsUiStore: { getState: storeStateMock },
}));

const makeSong = (overrides: Partial<SongResult> = {}): SongResult => ({
    id: '1',
    name: '歌',
    artists: [{ id: 1, name: '歌手' }],
    album: { id: 1, name: '专辑' },
    durationMs: 180000,
    sourceRef: { kind: 'online', providerId: 'netease', mediaId: '1' },
    ...overrides,
});

describe('shouldAutoReplaceUnavailableSong', () => {
    beforeEach(() => {
        storeStateMock.mockReturnValue({ unlockUnavailableSongs: true });
        registerOnlineMusicProvider({
            id: 'netease',
            displayName: 'netease',
            capabilities: { search: true, playback: true, lyrics: true, auth: true, userLibrary: true, playlists: true, albums: true, artists: true, recommendations: true, mutations: true, wordByWordLyrics: true },
            normalizeSong: raw => raw as UnifiedSong,
            playback: {
                getSongDetail: async () => null,
                getAudioSource: async () => null,
                getAvailability: (song: SongResult) => (song.privilege?.st != null && song.privilege.st < 0
                    ? { state: 'unavailable', label: '无版权' }
                    : { state: 'playable' }),
            },
        });
    });

    afterEach(() => {
        unregisterOnlineMusicProvider('netease');
    });

    it('returns true for an unavailable online song when the switch is on', () => {
        const song = makeSong({ privilege: { st: -200 } as SongResult['privilege'] });
        expect(shouldAutoReplaceUnavailableSong(song)).toBe(true);
    });

    it('returns false when the switch is off', () => {
        storeStateMock.mockReturnValue({ unlockUnavailableSongs: false });
        const song = makeSong({ privilege: { st: -200 } as SongResult['privilege'] });
        expect(shouldAutoReplaceUnavailableSong(song)).toBe(false);
    });

    it('respects an explicit settings argument over the store', () => {
        storeStateMock.mockReturnValue({ unlockUnavailableSongs: true });
        const song = makeSong({ privilege: { st: -200 } as SongResult['privilege'] });
        expect(shouldAutoReplaceUnavailableSong(song, { unlockUnavailableSongs: false })).toBe(false);
        expect(shouldAutoReplaceUnavailableSong(song, { unlockUnavailableSongs: true })).toBe(true);
    });

    it('returns false for a playable song', () => {
        expect(shouldAutoReplaceUnavailableSong(makeSong())).toBe(false);
    });

    it('returns false for a local song', () => {
        const local = makeSong({
            sourceRef: { kind: 'local', mediaId: 'local-1' } as SongResult['sourceRef'],
        });
        expect(shouldAutoReplaceUnavailableSong(local)).toBe(false);
    });

    it('returns false for null/undefined', () => {
        expect(shouldAutoReplaceUnavailableSong(null)).toBe(false);
        expect(shouldAutoReplaceUnavailableSong(undefined)).toBe(false);
    });
});
