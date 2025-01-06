const mod = ['Shift', 'Meta', 'Alt', 'Control', '$mod'] as const;

type Mods = (typeof mod)[number];

export type KeyBinds = {
	mod?: Mods[];
	keys?: string[];
	// next?: KeyBinds;
};

/**
 * allows for typesafe tinykey bindings
 */
export function get_key_bind(key_bind: KeyBinds): string {
	return [...(key_bind?.mod ?? []), ...(key_bind?.keys ?? [])].join('+');
	// +(key_bind.next ? ' ' + get_key_bind(key_bind.next) : '');
}
