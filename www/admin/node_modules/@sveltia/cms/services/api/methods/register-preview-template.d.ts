/**
 * @import { CustomPreviewTemplate } from '../../../types/public';
 */
/**
 * Register a custom preview template, which replaces the default entry preview. Registering a
 * template with the same name again replaces the previous one.
 * @param {string} name Name of the entry collection, or of the file in a file/singleton collection,
 * whose entries are previewed with the template.
 * @param {CustomPreviewTemplate} component React component.
 * @throws {TypeError} If `name` is not a non-empty string or `component` is not a React component.
 * @see https://decapcms.org/docs/customization/#registerpreviewtemplate
 * @see https://sveltiacms.app/en/docs/api/preview-templates
 */
export function registerPreviewTemplate(name: string, component: CustomPreviewTemplate): void;
import type { CustomPreviewTemplate } from '../../../types/public';
