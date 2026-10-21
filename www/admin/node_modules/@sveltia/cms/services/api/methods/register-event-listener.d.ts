/**
 * @import { AppEventListener } from '../../../types/public';
 */
/**
 * Register an event listener. Multiple listeners can be registered for the same event; they are
 * called in the order of registration.
 * @param {AppEventListener} eventListener Event listener.
 * @throws {TypeError} If the event listener is not an object, `name` is not a string, or `handler`
 * is not a function.
 * @throws {RangeError} If the event listener name is not a supported event type.
 * @see https://decapcms.org/docs/registering-events/
 * @see https://sveltiacms.app/en/docs/api/events
 */
export function registerEventListener(eventListener: AppEventListener): void;
import type { AppEventListener } from '../../../types/public';
