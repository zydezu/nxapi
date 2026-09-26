import React, { useCallback, useMemo } from 'react';
import { Image, ImageStyle, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import ipc from '../ipc.js';
import { useAccentColour, useColourScheme, User } from '../util.js';
import { Media, MediaType } from '../../../api/coral-types.js';
import { TEXT_COLOUR_DARK, TEXT_COLOUR_LIGHT } from '../constants.js';
import Section, { HEADER_SIZE } from './section.js';

const PREVIEW_COUNT = 20;

export default function Album(props: {
    user: User<true>;
    media: Media[];
    loading?: boolean;
    error?: Error;
}) {
    const theme = useColourScheme() === 'light' ? light : dark;
    const accent_colour = useAccentColour();
    const { t, i18n } = useTranslation('main_window', { keyPrefix: 'album_section' });

    const showAlbum = useCallback((item?: string) => {
        ipc.showAlbumWindow({user: props.user.user.id, item});
    }, [props.user.user.id]);

    const media = useMemo(() => [...props.media]
        .sort((a, b) => b.capturedAt - a.capturedAt)
        .slice(0, PREVIEW_COUNT), [props.media]);

    const header_buttons = props.media.length ? <TouchableOpacity onPress={() => showAlbum()} style={styles.iconTouchable}>
        <Text style={[styles.viewAll, {color: '#' + accent_colour}]}>{t('view_all')}</Text>
    </TouchableOpacity> : null;

    return <Section title={t('title')} loading={props.loading} error={props.error}
        errorKey={[props.user.nsotoken, 'media']}
        headerButtons={header_buttons}
    >
        {media.length ? <ScrollView horizontal>
            <View style={styles.content}>
                {media.map(item => <TouchableOpacity key={item.id} onPress={() => showAlbum(item.id)} style={styles.item}>
                    <Image source={{uri: item.thumbnailUri, width: 128, height: 72}} style={styles.thumbnail as ImageStyle} />
                    {item.type === MediaType.VIDEO ? <View style={styles.videoBadge}>
                        <Text style={styles.videoBadgeText}>▶ {formatDuration(item.videoDuration)}</Text>
                    </View> : null}
                </TouchableOpacity>)}
            </View>
        </ScrollView> : <View style={styles.noMedia}>
            <Text style={[styles.noMediaText, theme.text]}>{t('no_media')}</Text>
        </View>}
    </Section>;
}

export function formatDuration(ms: number) {
    const seconds = Math.round(ms / 1000);
    return Math.floor(seconds / 60) + ':' + ('' + (seconds % 60)).padStart(2, '0');
}

const styles = StyleSheet.create({
    iconTouchable: {
        marginLeft: 10,
    },
    viewAll: {
        fontSize: HEADER_SIZE === 14 ? 13 : 14,
    },

    content: {
        paddingBottom: 16,
        paddingLeft: ipc.platform === 'win32' ? 24 : 20,
        paddingRight: ipc.platform === 'win32' ? 4 : 0,
        flexDirection: 'row',
    },

    noMedia: {
        paddingVertical: 32,
        paddingHorizontal: 20,
        marginBottom: 20,
    },
    noMediaText: {
        textAlign: 'center',
    },

    item: {
        marginRight: 12,
    },
    thumbnail: {
        borderRadius: 4,
    },
    videoBadge: {
        position: 'absolute',
        right: 4,
        bottom: 4,
        paddingHorizontal: 4,
        paddingVertical: 1,
        borderRadius: 3,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
    },
    videoBadgeText: {
        color: '#ffffff',
        fontSize: 10,
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
