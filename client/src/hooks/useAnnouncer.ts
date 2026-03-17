/**
 * useAnnouncer Hook
 *
 * Provides screen reader announcements via ARIA live regions.
 * Manages a queue of announcements with appropriate politeness levels.
 *
 * WCAG 2.1 Level AA Compliance:
 * - 4.1.3 Status Messages (Level AA)
 *
 * Usage:
 * const announce = useAnnouncer();
 * announce('Node generated successfully', 'polite');
 * announce('Error occurred', 'assertive');
 */

import { useEffect, useRef, useCallback } from 'react';

export type Politeness = 'polite' | 'assertive' | 'off';

interface AnnouncementQueue {
  message: string;
  politeness: Politeness;
  id: number;
}

let globalAnnouncementId = 0;

/**
 * Hook to manage screen reader announcements
 */
export function useAnnouncer() {
  const politeRegionRef = useRef<HTMLDivElement | null>(null);
  const assertiveRegionRef = useRef<HTMLDivElement | null>(null);
  const queueRef = useRef<AnnouncementQueue[]>([]);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize live regions on mount
  useEffect(() => {
    // Create polite live region
    if (!politeRegionRef.current) {
      const politeRegion = document.createElement('div');
      politeRegion.setAttribute('role', 'status');
      politeRegion.setAttribute('aria-live', 'polite');
      politeRegion.setAttribute('aria-atomic', 'true');
      politeRegion.className = 'sr-only';
      politeRegion.style.cssText =
        'position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden;';
      document.body.appendChild(politeRegion);
      politeRegionRef.current = politeRegion;
    }

    // Create assertive live region
    if (!assertiveRegionRef.current) {
      const assertiveRegion = document.createElement('div');
      assertiveRegion.setAttribute('role', 'alert');
      assertiveRegion.setAttribute('aria-live', 'assertive');
      assertiveRegion.setAttribute('aria-atomic', 'true');
      assertiveRegion.className = 'sr-only';
      assertiveRegion.style.cssText =
        'position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden;';
      document.body.appendChild(assertiveRegion);
      assertiveRegionRef.current = assertiveRegion;
    }

    // Cleanup on unmount
    return () => {
      if (politeRegionRef.current) {
        document.body.removeChild(politeRegionRef.current);
        politeRegionRef.current = null;
      }
      if (assertiveRegionRef.current) {
        document.body.removeChild(assertiveRegionRef.current);
        assertiveRegionRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  /**
   * Process the announcement queue
   */
  const processQueue = useCallback(() => {
    if (queueRef.current.length === 0) return;

    const announcement = queueRef.current.shift();
    if (!announcement) return;

    const region =
      announcement.politeness === 'assertive'
        ? assertiveRegionRef.current
        : politeRegionRef.current;

    if (region) {
      // Clear previous content
      region.textContent = '';

      // Small delay to ensure screen readers detect the change
      setTimeout(() => {
        region.textContent = announcement.message;
      }, 100);

      // Clear after announcement to prepare for next one
      timeoutRef.current = setTimeout(() => {
        region.textContent = '';
        processQueue(); // Process next in queue
      }, 1000);
    }
  }, []);

  /**
   * Announce a message to screen readers
   */
  const announce = useCallback(
    (message: string, politeness: Politeness = 'polite') => {
      if (!message || politeness === 'off') return;

      // Add to queue
      queueRef.current.push({
        message,
        politeness,
        id: ++globalAnnouncementId,
      });

      // Start processing if not already running
      if (queueRef.current.length === 1) {
        processQueue();
      }
    },
    [processQueue]
  );

  return announce;
}

/**
 * Hook for common HiveMind-specific announcements
 */
export function useHiveMindAnnouncer() {
  const announce = useAnnouncer();

  return {
    announceNodeGenerated: useCallback(
      (count: number = 1) => {
        const message =
          count === 1
            ? 'Node generated successfully'
            : `${count} nodes generated successfully`;
        announce(message, 'polite');
      },
      [announce]
    ),

    announceNodeSelected: useCallback(
      (nodeText: string) => {
        announce(`Selected: ${nodeText}`, 'polite');
      },
      [announce]
    ),

    announceNodeDeleted: useCallback(
      (nodeText: string) => {
        announce(`Deleted: ${nodeText}`, 'polite');
      },
      [announce]
    ),

    announceTemplateLoaded: useCallback(
      (templateName: string) => {
        announce(`Template loaded: ${templateName}`, 'polite');
      },
      [announce]
    ),

    announceError: useCallback(
      (error: string) => {
        announce(`Error: ${error}`, 'assertive');
      },
      [announce]
    ),

    announceSearchResults: useCallback(
      (count: number) => {
        const message =
          count === 0
            ? 'No results found'
            : count === 1
              ? '1 result found'
              : `${count} results found`;
        announce(message, 'polite');
      },
      [announce]
    ),

    announceUndo: useCallback(() => {
      announce('Action undone', 'polite');
    }, [announce]),

    announceRedo: useCallback(() => {
      announce('Action redone', 'polite');
    }, [announce]),

    announceNodeNavigated: useCallback(
      (nodeText: string, direction?: string) => {
        const directionText = direction ? ` (${direction})` : '';
        announce(`Navigated to: ${nodeText}${directionText}`, 'polite');
      },
      [announce]
    ),

    announceNavigationBlocked: useCallback(
      (direction: string) => {
        announce(`No node ${direction}`, 'polite');
      },
      [announce]
    ),

    // Generic announcement for custom messages
    announce,
  };
}

export default useAnnouncer;
