import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, ImageStyle, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import ipc, { events } from '../ipc.js';
import { RequestState, Root, useAccentColour, useAsync, useColourScheme, useEventListener } from '../util.js';
import { Media, MediaType } from '../../../api/coral-types.js';
import { Button } from '../components/index.js';
import { TEXT_COLOUR_DARK, TEXT_COLOUR_LIGHT } from '../constants.js';
import { formatDuration } from '../main/album.js';

export interface AlbumProps {
    /** Nintendo Account ID */
    user: string;
    /** Media ID to open */
    item?: string;
}

export default function AlbumWindow(props: AlbumProps) {
    const [token] = useAsync(useCallback(() => ipc.getNintendoAccountCoralToken(props.user), [ipc, props.user]));
    const [user] = useAsync(useCallback(() => token ?
        ipc.getSavedCoralToken(token) : Promise.resolve(null), [ipc, token]));
    const [media, media_error, media_state, forceRefreshMedia] = useAsync(useCallback(() => token ?
        ipc.getCoralMedia(token) : Promise.resolve(null), [ipc, token]));

    useEventListener(events, 'window:refresh', forceRefreshMedia, []);

    return <Root title={i18n => i18n.t('album_window:title')} titleUser={user ?? undefined} scrollable
        i18nNamespace="album_window"
    >
        <Album media={media} error={media_error} loading={media_state === RequestState.LOADING}
            retry={forceRefreshMedia} initialItem={props.item} />
    </Root>;
}

function Album(props: {
    media: Media[] | null;
    error: Error | null;
    loading: boolean;
    retry: () => void;
    initialItem?: string;
}) {
    const theme = useColourScheme() === 'light' ? light : dark;
    const accent_colour = useAccentColour();
    const { t, i18n } = useTranslation('album_window');

    const media = useMemo(() => props.media ?
        [...props.media].sort((a, b) => b.capturedAt - a.capturedAt) : null, [props.media]);

    const [selected_id, setSelectedId] = useState<string | null>(props.initialItem ?? null);
    useEventListener(events, 'album:select', setSelectedId, []);

    const selected_index = media && selected_id ? media.findIndex(m => m.id === selected_id) : -1;
    const selected = selected_index >= 0 ? media![selected_index] : null;

    const select = useCallback((offset: number) => {
        if (!media || selected_index < 0) return;
        const next = media[selected_index + offset];
        if (next) setSelectedId(next.id);
    }, [media, selected_index]);

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setSelectedId(null);
            else if (event.key === 'ArrowLeft') select(-1);
            else if (event.key === 'ArrowRight') select(1);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [select]);

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [selected_id]);

    if (!media) {
        if (props.error && !props.loading) {
            return <View style={styles.message}>
                <Text style={[styles.messageText, theme.text]}>{t('error')}</Text>
                <Button title={t('retry')} onPress={props.retry} color={'#' + accent_colour} primary />
            </View>;
        }

        return <View style={styles.message}>
            <ActivityIndicator size="large" color={'#' + accent_colour} />
        </View>;
    }

    if (selected) {
        return <Viewer item={selected}
            onBack={() => setSelectedId(null)}
            onPrevious={selected_index > 0 ? () => select(-1) : undefined}
            onNext={selected_index < media.length - 1 ? () => select(1) : undefined} />;
    }

    if (!media.length) {
        return <View style={styles.message}>
            <Text style={[styles.messageText, theme.text]}>{t('no_media')}</Text>
        </View>;
    }

    return <View style={styles.grid}>
        {media.map(item => <TouchableOpacity key={item.id} onPress={() => setSelectedId(item.id)} style={styles.gridItem}>
            <View>
                <Image source={{uri: item.thumbnailUri, width: 200, height: 112}} style={styles.thumbnail as ImageStyle} />
                {item.type === MediaType.VIDEO ? <View style={styles.videoBadge}>
                    <Text style={styles.videoBadgeText}>▶ {formatDuration(item.videoDuration)}</Text>
                </View> : null}
            </View>
            <Text style={[styles.gridItemTitle, theme.text]} numberOfLines={1}>{item.appName || t('system')}</Text>
            <Text style={[styles.gridItemDate, theme.text]}>{new Date(item.capturedAt * 1000).toLocaleString(i18n.language, {
                dateStyle: 'medium', timeStyle: 'short',
            })}</Text>
        </TouchableOpacity>)}
    </View>;
}

enum ActionState {
    IDLE,
    WORKING,
    DONE,
}

function Viewer(props: {
    item: Media;
    onBack: () => void;
    onPrevious?: () => void;
    onNext?: () => void;
}) {
    const theme = useColourScheme() === 'light' ? light : dark;
    const accent_colour = useAccentColour();
    const { t, i18n } = useTranslation('album_window');

    const [save_state, setSaveState] = useState(ActionState.IDLE);
    const [copy_state, setCopyState] = useState(ActionState.IDLE);

    useEffect(() => {
        setSaveState(ActionState.IDLE);
        setCopyState(ActionState.IDLE);
    }, [props.item.id]);

    const save = useCallback(async () => {
        setSaveState(ActionState.WORKING);
        try {
            const path = await ipc.saveAlbumItem(props.item);
            setSaveState(path ? ActionState.DONE : ActionState.IDLE);
        } catch (err) {
            setSaveState(ActionState.IDLE);
            alert(err);
        }
    }, [props.item]);

    const copy = useCallback(async () => {
        setCopyState(ActionState.WORKING);
        try {
            await ipc.copyAlbumImage(props.item);
            setCopyState(ActionState.DONE);
        } catch (err) {
            setCopyState(ActionState.IDLE);
            alert(err);
        }
    }, [props.item]);

    const item = props.item;

    return <View style={styles.viewer}>
        <View style={styles.viewerMedia}>
            {item.type === MediaType.VIDEO ?
                <video key={item.id} src={item.contentUri} poster={item.thumbnailUri} controls autoPlay
                    style={{width: '100%', height: '100%', objectFit: 'contain'}} /> :
                <Image source={{uri: item.contentUri}} resizeMode="contain" style={styles.viewerImage as ImageStyle} />}
        </View>

        <View style={styles.viewerDetails}>
            <View style={styles.viewerInfo}>
                <Text style={[styles.viewerTitle, theme.text]}>{item.appName || t('system')}</Text>
                <Text style={[styles.viewerDate, theme.text]}>
                    {t('captured_at', {
                        date: new Date(item.capturedAt * 1000),
                        formatParams: { date: { dateStyle: 'medium', timeStyle: 'short' } },
                    })}
                </Text>
                <Text style={[styles.viewerDate, theme.text]}>
                    {t('expires_at', {
                        date: new Date(item.expiresAt * 1000),
                        formatParams: { date: { dateStyle: 'medium' } },
                    })}
                </Text>
            </View>

            <View style={styles.viewerButtons}>
                <View style={styles.button}>
                    <Button title={t('back')} onPress={props.onBack} />
                </View>
                {props.onPrevious ? <View style={styles.button}>
                    <Button title={t('previous')} onPress={props.onPrevious} />
                </View> : null}
                {props.onNext ? <View style={styles.button}>
                    <Button title={t('next')} onPress={props.onNext} />
                </View> : null}
                {item.type === MediaType.IMAGE ? <View style={styles.button}>
                    <Button title={t(copy_state === ActionState.WORKING ? 'copying' :
                        copy_state === ActionState.DONE ? 'copied' : 'copy')}
                        onPress={copy_state === ActionState.WORKING ? undefined : copy} />
                </View> : null}
                <View style={styles.button}>
                    <Button title={t(save_state === ActionState.WORKING ? 'saving' :
                        save_state === ActionState.DONE ? 'saved' : 'save')}
                        onPress={save_state === ActionState.WORKING ? undefined : save}
                        color={'#' + accent_colour} primary />
                </View>
            </View>
        </View>
    </View>;
}

const styles = StyleSheet.create({
    message: {
        flex: 1,
        paddingVertical: 32,
        paddingHorizontal: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    messageText: {
        marginBottom: 16,
        textAlign: 'center',
    },

    grid: {
        paddingVertical: 16,
        paddingLeft: ipc.platform === 'win32' ? 24 : 20,
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    gridItem: {
        width: 200,
        marginRight: 16,
        marginBottom: 20,
    },
    thumbnail: {
        borderRadius: 4,
    },
    gridItemTitle: {
        marginTop: 6,
        fontSize: 13,
    },
    gridItemDate: {
        marginTop: 2,
        fontSize: 11,
        opacity: 0.7,
    },
    videoBadge: {
        position: 'absolute',
        right: 6,
        bottom: 6,
        paddingHorizontal: 5,
        paddingVertical: 2,
        borderRadius: 3,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
    },
    videoBadgeText: {
        color: '#ffffff',
        fontSize: 11,
    },

    viewer: {
        // @ts-expect-error vh unit only supported on web
        height: '100vh',
    },
    viewerMedia: {
        flex: 1,
        backgroundColor: '#000000',
    },
    viewerImage: {
        flex: 1,
    },
    viewerDetails: {
        paddingVertical: 14,
        paddingHorizontal: ipc.platform === 'win32' ? 24 : 20,
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
    },
    viewerInfo: {
        flex: 1,
        minWidth: 200,
        marginVertical: 4,
    },
    viewerTitle: {
        fontSize: 15,
        marginBottom: 4,
    },
    viewerDate: {
        fontSize: 12,
        opacity: 0.7,
    },
    viewerButtons: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginVertical: 4,
    },
    button: {
        marginLeft: 8,
    },
});

const light = StyleSheet.create({
    text: {
        color: TEXT_COLOUR_LIGHT,
    },
});

const dark = StyleSheet.create({
    text: {
        color: TEXT_COLOUR_DARK,
    },
});
