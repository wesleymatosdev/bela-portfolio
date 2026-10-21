/**
 * @import { FieldTypeDefinition } from '../../../types/public';
 */
/**
 * Get the definition of a field type (widget), so that a custom field type can reuse the control
 * and/or preview component of another field type. The components are React components; for a
 * built-in field type, they render the built-in Svelte components internally. Only the built-in
 * field types that work outside the entry editor can be reused: `boolean`, `color`, `datetime`,
 * `map`, `number`, `select`, `string`, `text` and `uuid`. `CMS.getWidget()` is an alias of this
 * method for compatibility with Netlify/Decap CMS.
 * @param {string} name Field type name.
 * @returns {FieldTypeDefinition | undefined} Field type definition, or `undefined` if the field
 * type is not registered or cannot be reused.
 * @throws {TypeError} If `name` is not a non-empty string.
 * @see https://sveltiacms.app/en/docs/api/field-types
 */
export function getFieldType(name: string): FieldTypeDefinition | undefined;
import type { FieldTypeDefinition } from '../../../types/public';
