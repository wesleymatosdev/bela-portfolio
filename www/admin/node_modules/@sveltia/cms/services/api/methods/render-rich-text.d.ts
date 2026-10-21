/**
 * @import { RenderRichTextOptions } from '../../../types/public';
 */
/**
 * Render a Markdown/rich text value into the given element with the same pipeline as the built-in
 * RichText field preview: editor component previews (including nested components), Markdown
 * parsing, syntax highlighting, image URL resolution and HTML sanitization. This is primarily
 * intended for an editor component `toPreview()` that returns an `HTMLElement`, so the verbatim
 * value of a nested RichText or Markdown field can be rendered recursively.
 * @param {HTMLElement} target The element to render the preview into. The content is rendered
 * asynchronously, and the element doesn’t have to be attached to the document yet.
 * @param {string} value Markdown string.
 * @param {RenderRichTextOptions} [options] Options.
 * @returns {() => void} Function to remove the rendered preview and destroy any editor component
 * previews within it. Call it when the target element is no longer needed, e.g. when the element
 * preview receives an `Unmount` event.
 * @throws {TypeError} If `target` is not an element, `value` is not a string, or `fieldConfig` is
 * given but not an object.
 * @see https://sveltiacms.app/en/docs/api/editor-components
 */
export function renderRichText(target: HTMLElement, value: string, { fieldConfig }?: RenderRichTextOptions): () => void;
import type { RenderRichTextOptions } from '../../../types/public';
