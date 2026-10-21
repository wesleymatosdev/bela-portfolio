/**
 * @import { CustomPageDefinition } from '../../../types/public';
 */
/**
 * Register a custom page, which is listed in the global toolbar, or in the Menu on small screens.
 * The page renders a React component, or embeds a web page in an iframe. With the `newTab` option,
 * the web page is opened in a new browser tab instead. Pages are listed in the order of
 * registration, and registering a page with the same `id` again replaces the previous one in place.
 * @param {CustomPageDefinition} definition Page definition.
 * @throws {TypeError} If `definition` is not an object, `id` is not a string of alphanumeric
 * characters, hyphens and underscores, `label` is not a non-empty string, `icon` is given but not a
 * non-empty string, neither or both of `component` and `url` are given, `component` is not a React
 * component, `url` is not a valid `http` or `https` URL or file path, or `newTab` is given but not
 * a boolean or along with `component`.
 * @see https://sveltiacms.app/en/docs/api/custom-pages
 */
export function registerCustomPage(definition: CustomPageDefinition): void;
import type { CustomPageDefinition } from '../../../types/public';
