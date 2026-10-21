/**
 * @import {
 * CustomFieldControl,
 * CustomFieldPreview,
 * CustomFieldSchema,
 * CustomFieldTypeDefinition,
 * } from '../../../types/public';
 */
/**
 * Register a custom field type (widget), which can be used with the `widget` field option.
 * Registering a field type with the same name again replaces the previous one.
 * `CMS.registerWidget()` is an alias of this method for compatibility with Netlify/Decap CMS. The
 * field type can be given either as positional arguments or as a single definition object, which
 * also takes a summary component.
 * @param {string | CustomFieldTypeDefinition} name Field type name, which cannot be the name of a
 * built-in field type, or a field type definition. With a definition, the other arguments are
 * ignored.
 * @param {CustomFieldControl | string} [control] React component for the edit pane, or the name of
 * another custom field type whose control is reused. Required unless a definition is given.
 * @param {CustomFieldPreview} [preview] React component for the preview pane. If omitted, no
 * preview is rendered for the field.
 * @param {CustomFieldSchema} [schema] JSON schema to validate the field type’s options in the CMS
 * configuration.
 * @throws {TypeError} If `name` is neither a non-empty string nor a definition object, the control
 * is neither a React component nor a string, the preview or the summary is given but not a React
 * component, or the schema is given but not an object.
 * @throws {Error} If `name` is the name of a built-in field type.
 * @see https://decapcms.org/docs/custom-widgets/
 * @see https://sveltiacms.app/en/docs/api/field-types
 */
export function registerFieldType(name: string | CustomFieldTypeDefinition, control?: CustomFieldControl | string, preview?: CustomFieldPreview, schema?: CustomFieldSchema): void;
import type { CustomFieldTypeDefinition } from '../../../types/public';
import type { CustomFieldControl } from '../../../types/public';
import type { CustomFieldPreview } from '../../../types/public';
import type { CustomFieldSchema } from '../../../types/public';
