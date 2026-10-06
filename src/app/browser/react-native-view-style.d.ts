import 'react-native';

declare module 'react-native' {
    interface ViewStyle {
        colorScheme?: 'light' | 'dark';
    }
}
