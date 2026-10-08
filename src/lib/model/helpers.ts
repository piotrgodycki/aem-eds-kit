/**
 * Field builders for Universal Editor models - terse factories that set the
 * right `valueType` per component type, so generators and partials never get it
 * wrong. The shape matches what `eds scaffold ue` already emits.
 */

export interface Field {
	component: string;
	name: string;
	label?: string;
	valueType?: string;
	value?: unknown;
	options?: { name: string; value: string }[];
	multi?: boolean;
	collapsible?: boolean;
	fields?: Field[];
}

export type Option = { name: string; value: string };

export const f = {
	text: (name: string, label?: string): Field => ({
		component: "text",
		valueType: "string",
		name,
		label,
	}),
	textarea: (name: string, label?: string): Field => ({
		component: "textarea",
		valueType: "string",
		name,
		label,
	}),
	richtext: (name: string, label?: string): Field => ({
		component: "richtext",
		valueType: "string",
		name,
		value: "",
		label,
	}),
	number: (name: string, label?: string): Field => ({
		component: "number",
		valueType: "number",
		name,
		label,
	}),
	boolean: (name: string, label?: string, value = false): Field => ({
		component: "boolean",
		valueType: "boolean",
		name,
		value,
		label,
	}),
	dateTime: (name: string, label?: string): Field => ({
		component: "date-time",
		valueType: "date",
		name,
		label,
	}),
	select: (name: string, label: string, options: Option[], value?: string): Field => ({
		component: "select",
		valueType: "string",
		name,
		label,
		options,
		...(value !== undefined ? { value } : {}),
	}),
	multiselect: (name: string, label: string, options: Option[]): Field => ({
		component: "multiselect",
		valueType: "string",
		name,
		label,
		options,
	}),
	radioGroup: (name: string, label: string, options: Option[], value?: string): Field => ({
		component: "radio-group",
		valueType: "string",
		name,
		label,
		options,
		...(value !== undefined ? { value } : {}),
	}),
	checkboxGroup: (name: string, label: string, options: Option[]): Field => ({
		component: "checkbox-group",
		valueType: "string[]",
		name,
		label,
		options,
	}),
	reference: (name: string, label?: string): Field => ({
		component: "reference",
		valueType: "string",
		name,
		label,
	}),
	aemContent: (name: string, label?: string): Field => ({ component: "aem-content", name, label }),
	aemContentFragment: (name: string, label?: string): Field => ({
		component: "aem-content-fragment",
		name,
		label,
	}),
	aemExperienceFragment: (name: string, label?: string): Field => ({
		component: "aem-experience-fragment",
		name,
		label,
	}),
	aemTag: (name: string, label?: string): Field => ({
		component: "aem-tag",
		valueType: "string",
		name,
		label,
	}),
	tab: (name: string, label: string): Field => ({ component: "tab", name, label }),
	container: (name: string, label: string, fields: Field[], collapsible = true): Field => ({
		component: "container",
		name,
		label,
		multi: true,
		collapsible,
		fields,
	}),
};

/** Apply a prefix to a field name: `n('cta', 'link')` -> `ctaLink`, `n('', 'link')` -> `link`. */
export function n(prefix: string, base: string): string {
	if (!prefix) return base;
	return prefix + base.charAt(0).toUpperCase() + base.slice(1);
}
