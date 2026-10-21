/**
 * Initialize the CMS, optionally with the given CMS configuration. When the CMS is loaded with a
 * classic `<script>` tag, e.g. from a CDN, it initializes itself automatically unless
 * `window.CMS_MANUAL_INIT` is set to `true` before the script is loaded. When it’s imported as a
 * module, e.g. from the npm package, this method always has to be called. It mounts the app on the
 * `<div id="nc-root">` element if present, or the `<body>` element otherwise, waiting for the page
 * content to be loaded if needed. Calls after the first one are ignored.
 * @param {object} [options] Options.
 * @param {CmsConfig} [options.config] Configuration to be merged with the configuration file, such
 * as `config.yml`. Its options override the file’s, except for arrays such as `collections`, which
 * are concatenated, so an array item can be added but not replaced. Include
 * `load_config_file: false` to prevent the configuration file from being loaded, in which case
 * this has to be a complete configuration.
 * @returns {Promise<void>} Promise that resolves once the app has been mounted.
 * @throws {TypeError} If `config` is neither an object nor `undefined`. As this is an async
 * function, the error is thrown as a rejection of the returned Promise.
 * @see https://decapcms.org/docs/manual-initialization/
 * @see https://sveltiacms.app/en/docs/api/initialization
 */
export function init({ config }?: {
    config?: CmsConfig | undefined;
}): Promise<void>;
import type { CmsConfig } from '../../../types/public';
