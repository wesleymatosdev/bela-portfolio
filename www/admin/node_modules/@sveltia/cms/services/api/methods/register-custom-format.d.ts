/**
 * @import { FileFormatter, FileParser } from '../../../types/public';
 */
/**
 * Register a custom entry file format. A custom format with the same name as a built-in one, such
 * as `json`, takes precedence over it, and registering a format again replaces the previous one.
 * @param {string} name Format name. This should match the `format` option of a collection where the
 * custom format will be used.
 * @param {string} extension File extension without a leading dot, e.g. `json5`. Files in a
 * collection with the custom format use this extension, regardless of the collection’s `extension`
 * option.
 * @param {{ fromFile?: FileParser, toFile?: FileFormatter }} methods Parser and/or formatter
 * methods. Async functions can be used. Without `fromFile`, files in the format are parsed with the
 * built-in parser for the format name, if any; without `toFile`, they are formatted likewise. If
 * the format name isn’t a built-in one, such as `yaml` or `json`, omit neither: without `fromFile`,
 * files in the format can’t be loaded, and without `toFile`, saving an entry fails with an error,
 * leaving the file untouched. A warning is logged when either is missing. `toFile` is also given a
 * context with a `serialize` function, which formats the content with the built-in formatter for
 * a built-in format name, so its output can be post-processed, e.g. with a code formatter.
 * @throws {TypeError} If `name` or `extension` is not a non-empty string, or if `fromFile` or
 * `toFile` is given but not a function.
 * @throws {Error} If neither `fromFile` nor `toFile` is provided.
 * @see https://decapcms.org/docs/custom-formatters/
 * @see https://sveltiacms.app/en/docs/api/file-formats
 */
export function registerCustomFormat(name: string, extension: string, { fromFile, toFile }?: {
    fromFile?: FileParser;
    toFile?: FileFormatter;
}): void;
import type { FileParser } from '../../../types/public';
import type { FileFormatter } from '../../../types/public';
