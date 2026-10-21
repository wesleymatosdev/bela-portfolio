/**
 * Register a custom stylesheet to be applied to the entry preview pane. Multiple stylesheets can
 * be registered. A stylesheet can be limited to the entries of a collection, or to a file in a
 * file/singleton collection.
 * @param {string} style URL or file path of a stylesheet, or a raw CSS string if the `raw` option
 * is `true`. A relative path is resolved against the current page URL.
 * @param {object} [options] Options.
 * @param {boolean} [options.raw] Whether `style` is a raw CSS string. Default: `false`.
 * @param {string} [options.collection] Name of the collection whose entries the stylesheet is
 * applied to. Use `_singletons` for the singleton collection. Default: all collections.
 * @param {string} [options.file] Name of the file in the file/singleton collection given with the
 * `collection` option that the stylesheet is applied to. Default: all files in the collection.
 * @throws {TypeError} If `style` is not a non-empty string, `raw` is not a boolean, `style` is not
 * a valid URL or file path when `raw` is `false`, `collection` or `file` is given but not a
 * non-empty string, or `file` is given without `collection`.
 * @see https://decapcms.org/docs/customization/#registerpreviewstyle
 * @see https://sveltiacms.app/en/docs/api/preview-styles
 */
export function registerPreviewStyle(style: string, { raw, collection, file }?: {
    raw?: boolean | undefined;
    collection?: string | undefined;
    file?: string | undefined;
}): void;
