/**
 * @import { StringTransformer } from '../../../types/public';
 */
/**
 * Register a custom string transformation, which can be used in template tags like the built-in
 * ones, e.g. `{{title | reverse}}` or `{{title | wrap('[', ']')}}`, in the contexts where string
 * transformations are supported, such as the `summary` collection option and the Compute field’s
 * `value` option. Registering a transformation with the same name again replaces the previous one.
 * The transformation should be registered before the CMS is initialized, so it’s available when
 * entry summaries and field values are first rendered.
 * @param {string} name Transformation name, which can contain letters, digits and underscores, and
 * cannot start with a digit or be the name of a built-in transformation, such as `upper`.
 * @param {StringTransformer} transform Function that receives the value and a context
 * object containing the `args` given to the transformation and the content `locale`, and returns
 * the transformed string synchronously. If it throws an error or returns a Promise, the value is
 * passed through unchanged, and the first such failure of the function is logged to the console.
 * @throws {TypeError} If `name` is not a valid transformation name or `transform` is not a
 * function.
 * @throws {Error} If `name` is the name of a built-in transformation.
 * @see https://github.com/decaporg/decap-cms/issues/3677
 * @see https://sveltiacms.app/en/docs/api/string-transformations
 */
export function registerStringTransformation(name: string, transform: StringTransformer): void;
import type { StringTransformer } from '../../../types/public';
