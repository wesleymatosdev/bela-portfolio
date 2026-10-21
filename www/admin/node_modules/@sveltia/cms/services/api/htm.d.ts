export function parseStyle(cssText: string): Record<string, string>;
/**
 * Tagged template that creates React elements from HTML-like markup, powered by HTM. It lets you
 * write custom preview templates, field types and editor component previews in a JSX-like syntax
 * without a build step. Components are embedded with `<${Component} prop=${value} />`.
 * @type {(strings: TemplateStringsArray, ...values: any[]) => ReactElement | ReactElement[]}
 * @see https://github.com/developit/htm
 */
export const html: (strings: TemplateStringsArray, ...values: any[]) => ReactElement | ReactElement[];
import type { ReactElement } from 'react';
