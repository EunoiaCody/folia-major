import { describe, expect, it, vi } from 'vitest';
import { dispatchSearchTrackAction } from '@/components/app/search/searchTrackActions';
import type { LocalSong, UnifiedSong } from '@/types';
import { registerOnlineMusicProvider } from '@/services/onlineMusic/providerRegistry';

const getStateMock = vi.hoisted(() => vi.fn(() => ({ unlockUnavailableSongs: false })));
vi.mock('@/stores/useSettingsUiStore', () => ({
    useSettingsUiStore: { getState: getStateMock },
}));

// Netease provider so shouldAutoReplaceUnavailableSong can resolve availability.
registerOnlineMusicProvider({
    id: 'netease',
    displayName: 'netease',
    capabilities: { search: true, playback: true, lyrics: true, auth: true, userLibrary: true, playlists: true, albums: true, artists: true, recommendations: true, mutations: true, wordByWordLyrics: true },
    normalizeSong: raw => raw as UnifiedSong,
    playback: {
        getSongDetail: async () => null,
        getAudioSource: async () => null,
        getAvailability: (song: UnifiedSong) => (song.privilege?.st != null && song.privilege.st < 0
            ? { state: 'unavailable', label: '无版权' }
            : { state: 'playable' }),
    },
});

// Verifies search playback and queue actions dispatch to the matching source.

const localSong: LocalSong = {
    id: 'local-1',
    fileName: 'local.mp3',
    filePath: '/local.mp3',
    duration: 1000,
    fileSize: 1,
    mimeType: 'audio/mpeg',
    addedAt: 1,
    title: 'Local',
    titleOrigin: 'import',
    importedMetadata: { title: 'Local', titleSource: 'filename', artistNames: [], albumName: '' },
};

const track = (patch: Partial<UnifiedSong> = {}): UnifiedSong => ({
    id: 1,
    name: 'Track',
    artists: [],
    album: { id: 1, name: 'Album' },
    durationMs: 1000,
    ...patch,
    sourceRef: patch.sourceRef ?? { kind: 'online', providerId: 'netease', mediaId: '1' },
});

describe('dispatchSearchTrackAction', () => {
    it.each([
        ['local', track({ isLocal: true, localRef: { songId: localSong.id }, sourceRef: { kind: 'local', mediaId: localSong.id } })],
        ['netease', track()],
    ])('dispatches %s tracks to the matching action', (source, song) => {
        const onLocal = vi.fn();
        const onNavidrome = vi.fn();
        const onOnline = vi.fn();

        expect(dispatchSearchTrackAction(song, {
            localSongs: [localSong],
            onLocal,
            onNavidrome,
            onOnline,
        })).toBe(true);

        expect(onLocal).toHaveBeenCalledTimes(source === 'local' ? 1 : 0);
        expect(onOnline).toHaveBeenCalledTimes(source === 'netease' ? 1 : 0);
    });

    it('dispatches Navidrome tracks through their playback carrier', () => {
        const onNavidrome = vi.fn();
        const navidromeData = {
            ...track(),
            id: 'navi-1',
            isNavidrome: true,
        } as any;

        dispatchSearchTrackAction(track({ isNavidrome: true, navidromeData }), {
            localSongs: [],
            onLocal: vi.fn(),
            onNavidrome,
            onOnline: vi.fn(),
        });

        expect(onNavidrome).toHaveBeenCalledWith(navidromeData);
    });

    it('blocks unavailable songs for both play and queue callers', () => {
        const actions = {
            localSongs: [],
            onLocal: vi.fn(),
            onNavidrome: vi.fn(),
            onOnline: vi.fn(),
        };
        const didDispatch = dispatchSearchTrackAction(track({
            privilege: { st: -200 },
        }), actions);

        expect(didDispatch).toBe(false);
        expect(actions.onOnline).not.toHaveBeenCalled();
    });

    it('lets unavailable songs through when auto-replace is enabled', () => {
        getStateMock.mockReturnValue({ unlockUnavailableSongs: true });
        const actions = {
            localSongs: [],
            onLocal: vi.fn(),
            onNavidrome: vi.fn(),
            onOnline: vi.fn(),
        };
        const didDispatch = dispatchSearchTrackAction(track({
            privilege: { st: -200 },
        }), actions);

        expect(didDispatch).toBe(true);
        expect(actions.onOnline).toHaveBeenCalledTimes(1);
        getStateMock.mockReturnValue({ unlockUnavailableSongs: false });
    });
});
