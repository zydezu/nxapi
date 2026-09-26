import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, ImageStyle, Pressable, PressableStateCallbackType, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import ipc, { events } from '../ipc.js';
import { RequestState, Root, useAccentColour, useAsync, useColourScheme, useEventListener } from '../util.js';
import { Media, MediaType } from '../../../api/coral-types.js';
import { Button, Skeleton } from '../components/index.js';
import ChevronBack from '../components/icons/chevron-back.js';
import ChevronForward from '../components/icons/chevron-forward.js';
import { HIGHLIGHT_COLOUR_DARK, HIGHLIGHT_COLOUR_LIGHT, TEXT_COLOUR_DARK, TEXT_COLOUR_LIGHT } from '../constants.js';
import { formatDuration } from '../main/album.js';
import type { AlbumZipProgress } from '../../main/album.js';

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

    // Kept here so progress survives switching between the grid and the viewer
    const [zip_state, setZipState] = useState(ActionState.IDLE);
    const [zip_progress, setZipProgress] = useState<AlbumZipProgress | null>(null);
    useEventListener(events, 'album:zip-progress', setZipProgress, []);

    const downloadAll = useCallback(async () => {
        if (!media) return;
        setZipState(ActionState.WORKING);
        setZipProgress(null);
        try {
            const path = await ipc.saveAlbumZip(media);
            setZipState(path ? ActionState.DONE : ActionState.IDLE);
        } catch (err) {
            setZipState(ActionState.IDLE);
            alert(err);
        }
    }, [media]);

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

        return <View style={styles.grid}>
            {[...Array(12)].map((_, i) => <View key={i} style={styles.gridItem}>
                <Skeleton width={200} height={112} />
                <Skeleton width={140} height={11} style={styles.skeletonTitle} />
                <Skeleton width={100} height={9} style={styles.skeletonDate} />
            </View>)}
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

    return <View>
        <View style={styles.toolbar}>
            <Text style={[styles.toolbarText, theme.text]}>{t('item_count', {count: media.length})}</Text>
            <Button title={zip_state === ActionState.WORKING ? zip_progress ?
                    t('download_progress', {done: zip_progress.done, total: zip_progress.total}) : t('download_all') :
                zip_state === ActionState.DONE ? t('download_done') : t('download_all')}
                onPress={zip_state === ActionState.WORKING ? undefined : downloadAll}
                color={'#' + accent_colour} primary={zip_state !== ActionState.WORKING} />
        </View>

        <View style={styles.grid}>
            {media.map(item => <TouchableOpacity key={item.id} onPress={() => setSelectedId(item.id)} style={styles.gridItem}>
                <View>
                    <Image source={{uri: item.thumbnailUri, width: 200, height: 112}} style={[styles.thumbnail, theme.placeholder] as ImageStyle} />
                    {item.type === MediaType.VIDEO ? <View style={styles.videoBadge}>
                        <Text style={styles.videoBadgeText}>▶ {formatDuration(item.videoDuration)}</Text>
                    </View> : null}
                </View>
                <Text style={[styles.gridItemTitle, theme.text]} numberOfLines={1}>{item.appName || t('system')}</Text>
                <Text style={[styles.gridItemDate, theme.text]}>{new Date(item.capturedAt * 1000).toLocaleString(i18n.language, {
                    dateStyle: 'medium', timeStyle: 'short',
                })}</Text>
            </TouchableOpacity>)}
        </View>
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
            await ipc.copyAlbumItem(props.item);
            setCopyState(ActionState.DONE);
        } catch (err) {
            setCopyState(ActionState.IDLE);
            alert(err);
        }
    }, [props.item]);

    const item = props.item;

    const [media_hovered, setMediaHovered] = useState(false);

    return <View style={styles.viewer}>
        <View style={styles.viewerMedia}
            // @ts-expect-error react-native-web
            onMouseEnter={() => setMediaHovered(true)}
            onMouseLeave={() => setMediaHovered(false)}
        >
            {item.type === MediaType.VIDEO ?
                <video key={item.id} src={item.contentUri} poster={item.thumbnailUri} controls autoPlay
                    style={{width: '100%', height: '100%', objectFit: 'contain'}} /> :
                <View style={styles.viewerImage}>
                    {/* The thumbnail is usually cached, so show it until the full image loads */}
                    <Image source={{uri: item.thumbnailUri}} resizeMode="contain" style={StyleSheet.absoluteFill as ImageStyle} />
                    <Image key={item.id} source={{uri: item.contentUri}} resizeMode="contain" style={StyleSheet.absoluteFill as ImageStyle} />
                </View>}

            {props.onPrevious ? <ViewerArrow onPress={props.onPrevious} visible={media_hovered}
                style={styles.arrowPrevious}><ChevronBack title={t('previous')!} /></ViewerArrow> : null}
            {props.onNext ? <ViewerArrow onPress={props.onNext} visible={media_hovered}
                style={styles.arrowNext}><ChevronForward title={t('next')!} /></ViewerArrow> : null}
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
                <View style={styles.button}>
                    <Button title={t(copy_state === ActionState.WORKING ? 'copying' :
                        copy_state === ActionState.DONE ? 'copied' :
                        item.type === MediaType.VIDEO ? 'copy_video' : 'copy')}
                        onPress={copy_state === ActionState.WORKING ? undefined : copy} />
                </View>
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

function ViewerArrow(props: React.PropsWithChildren<{
    onPress: () => void;
    visible: boolean;
    style: ViewStyle;
}>) {
    // react-native-web also passes hovered and focused
    const style = useCallback((state: PressableStateCallbackType) => {
        const { hovered, focused } = state as PressableStateCallbackType & {hovered?: boolean; focused?: boolean};

        return [
            styles.arrow, arrow_web_style, props.style,
            hovered ? styles.arrowHovered : null,
            state.pressed ? styles.arrowPressed : null,
            {opacity: props.visible || hovered || focused ? 1 : 0},
        ];
    }, [props.style, props.visible]);

    return <Pressable onPress={props.onPress} style={style}>
        <Text style={styles.arrowIcon}>{props.children}</Text>
    </Pressable>;
}

const arrow_web_style = {
    transitionProperty: 'opacity, background-color, transform',
    transitionDuration: '150ms',
    backdropFilter: 'blur(8px)',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.35)',
} as ViewStyle;

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

    toolbar: {
        paddingTop: 16,
        paddingHorizontal: ipc.platform === 'win32' ? 24 : 20,
        flexDirection: 'row',
        alignItems: 'center',
    },
    toolbarText: {
        flex: 1,
        fontSize: 13,
        opacity: 0.7,
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
    skeletonTitle: {
        marginTop: 8,
    },
    skeletonDate: {
        marginTop: 6,
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
    arrow: {
        position: 'absolute',
        top: '50%',
        width: 44,
        height: 44,
        marginTop: -22,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.18)',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(20, 20, 20, 0.45)',
    },
    arrowHovered: {
        backgroundColor: 'rgba(20, 20, 20, 0.7)',
        transform: [{scale: 1.08}],
    },
    arrowPressed: {
        transform: [{scale: 0.95}],
    },
    arrowPrevious: {
        left: 16,
    },
    arrowNext: {
        right: 16,
    },
    arrowIcon: {
        color: '#ffffff',
        fontSize: 18,
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
    placeholder: {
        backgroundColor: HIGHLIGHT_COLOUR_LIGHT,
    },
});

const dark = StyleSheet.create({
    text: {
        color: TEXT_COLOUR_DARK,
    },
    placeholder: {
        backgroundColor: HIGHLIGHT_COLOUR_DARK,
    },
});
