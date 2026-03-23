import type { TextStyle, ViewStyle } from 'react-native';

/** Yellow app bar (customer + worker). */
export const APP_SCREEN_HEADER_BG = '#FFEB3B';

/** Matches customer home `header` — use with `paddingTop: insets.top + …` when not using SafeAreaView. */
export const APP_SCREEN_HEADER_PADDING_HORIZONTAL = 16;
export const APP_SCREEN_HEADER_PADDING_TOP_INNER = 8;
export const APP_SCREEN_HEADER_PADDING_BOTTOM = 20;

/**
 * Primary screen title — matches customer home `greeting` (fontSize 22, weight 700).
 */
export const appScreenHeaderTitleStyle: TextStyle = {
  fontSize: 22,
  fontWeight: '700',
  color: '#000',
};

/**
 * Padding for the yellow top bar — matches customer home `header`
 * (paddingHorizontal 16, paddingTop 8, paddingBottom 20).
 */
export const appScreenHeaderBarPadding: Pick<
  ViewStyle,
  'paddingHorizontal' | 'paddingTop' | 'paddingBottom'
> = {
  paddingHorizontal: APP_SCREEN_HEADER_PADDING_HORIZONTAL,
  paddingTop: APP_SCREEN_HEADER_PADDING_TOP_INNER,
  paddingBottom: APP_SCREEN_HEADER_PADDING_BOTTOM,
};
