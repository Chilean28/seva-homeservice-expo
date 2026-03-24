// Shared package entry. Export shared UI/utilities here.
export { ErrorBoundary } from './ErrorBoundary';
export { isJobChatOpen, JOB_CHAT_OPEN_HOURS } from './jobChatWindow';
export { useRefreshOnAppActive } from './useRefreshOnAppActive';
export {
  BOOKING_DEFAULT_ESTIMATED_HOURS,
  computeBookingTotalFromHours,
  BOOKING_MIN_HOURLY_RATE,
  BOOKING_MAX_HOURLY_RATE,
} from './bookingPricing';
export { isPendingBookingResponseExpired } from './bookingResponseExpiry';
export {
  APP_SCREEN_HEADER_BG,
  APP_SCREEN_HEADER_PADDING_HORIZONTAL,
  APP_SCREEN_HEADER_PADDING_TOP_INNER,
  APP_SCREEN_HEADER_PADDING_BOTTOM,
  appScreenHeaderTitleStyle,
  appScreenHeaderBarPadding,
} from './appScreenHeader';
export { formatAudioTime, parseVoiceDurationMs } from './chat/voiceUtils';
export { useChatKeyboard } from './chat/useChatKeyboard';
export { openPhoneDialer, type PhoneDialerCopy } from './chat/openPhoneDialer';
