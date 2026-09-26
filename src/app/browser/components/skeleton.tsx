import React, { useEffect } from 'react';
import { Animated, DimensionValue, Easing, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { HIGHLIGHT_COLOUR_DARK, HIGHLIGHT_COLOUR_LIGHT } from '../constants.js';
import { useColourScheme } from '../util.js';

// Shared so every skeleton on the page pulses in sync
const pulse = new Animated.Value(1);
let pulse_users = 0;
const pulse_animation = Animated.loop(Animated.sequence([
    Animated.timing(pulse, {toValue: 0.4, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: false}),
    Animated.timing(pulse, {toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: false}),
]));

export default function Skeleton(props: {
    width?: DimensionValue;
    height?: DimensionValue;
    radius?: number;
    style?: StyleProp<ViewStyle>;
}) {
    const theme = useColourScheme() === 'light' ? light : dark;

    useEffect(() => {
        if (!pulse_users++) pulse_animation.start();
        return () => {
            if (!--pulse_users) pulse_animation.stop();
        };
    }, []);

    return <Animated.View style={[
        theme.skeleton,
        {width: props.width, height: props.height, borderRadius: props.radius ?? 4, opacity: pulse},
        props.style,
    ]} />;
}

const light = StyleSheet.create({
    skeleton: {
        backgroundColor: HIGHLIGHT_COLOUR_LIGHT,
    },
});

const dark = StyleSheet.create({
    skeleton: {
        backgroundColor: HIGHLIGHT_COLOUR_DARK,
    },
});
