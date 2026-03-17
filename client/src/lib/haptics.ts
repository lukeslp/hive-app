/**
 * Haptic feedback utility for mobile devices.
 * Provides consistent vibration patterns for different interaction types.
 * Falls back silently on devices that don't support the Vibration API.
 */

function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Silently fail on unsupported devices
    }
  }
}

export const haptics = {
  /** Light tap — selecting a node, toggling an option */
  tap: () => vibrate(8),

  /** Medium tap — confirming an action, starring a node */
  medium: () => vibrate(20),

  /** Long press initiated — picking up a tile for drag */
  longPress: () => vibrate(40),

  /** Success — merge complete, export done, brainstorm started */
  success: () => vibrate([15, 40, 15]),

  /** Error or cancel — dropped in invalid area, action failed */
  error: () => vibrate([30, 20, 30, 20, 30]),

  /** Hover over drop target while dragging */
  dragHover: () => vibrate(5),

  /** Expand — node expansion started */
  expand: () => vibrate([10, 30, 10]),

  /** Notification — toast or alert */
  notify: () => vibrate(12),
};
