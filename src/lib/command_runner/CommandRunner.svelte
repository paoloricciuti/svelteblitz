<script lang="ts">
	import { get_file_icon } from '$lib/file_icons';
	import { command_runner } from '$lib/stores/command_runner_store';
	import type { Command } from '$lib/types';
	import { onDestroy, tick } from 'svelte';
	import { parseKeybinding, type KeyBindingMap, tinykeys } from 'tinykeys';
	import Back from '~icons/material-symbols/arrow-back-rounded';
	import Forward from '~icons/material-symbols/arrow-forward-rounded';
	import { get_key_bind } from './shortcuts-utilities';
	import { fuzzy_search_command } from './fuzzy_search';

	// from tinykeys: https://github.com/jamiebuilds/tinykeys/blob/fcf253635231925d660fd6699c9a783ecd038faf/src/tinykeys.ts#L61C1-L62C57
	let PLATFORM = typeof navigator === 'object' ? navigator.platform : '';
	let APPLE_DEVICE = /Mac|iPod|iPhone|iPad/.test(PLATFORM);

	export let commands = [] as Command[];

	let search = '';

	let dialog: HTMLDialogElement;
	let input_element: HTMLInputElement;

	let command_button_elements: Record<number, HTMLButtonElement> = {};
	let current_action_command: Command | null = null;

	let handle_window_click: ((e: MouseEvent) => void) | null = null;
	let unbind_function: () => void | undefined;

	const close_dialog_on_out_click = (e: MouseEvent) => {
		if (dialog === e.target) dialog.close();
	};

	function open_command_runner(command: string | Command = '') {
		if (!dialog.open) {
			dialog.showModal();
			handle_window_click = close_dialog_on_out_click;
		}
		let command_action_candidate = command as Command | undefined;
		if (typeof command === 'string') {
			command_action_candidate = commands.find((cmd) => cmd.command === command);
		}
		if (command_action_candidate) {
			current_action_command = command_action_candidate;
			tick().then(() => {
				search = '> ';
			});
		} else {
			if (typeof command === 'string') {
				tick().then(() => {
					search = command;
				});
			}
		}
	}

	$: key_bind_commands(commands);

	$: mode = search.startsWith('>') ? 'command' : 'file';

	$: filtered_commands =
		mode === 'file'
			? commands.filter(
					(c) =>
						c.category === 'File' && c.title.toLowerCase().includes(search.trim().toLowerCase()),
				)
			: fuzzy_search_command(
					commands.filter((c) => c.category !== 'File'),
					search.substring(1).trim().split(' ')[0],
				);

	$: marked_command = filtered_commands[0] as Command | null;

	$: {
		if ($command_runner.open) {
			open_command_runner($command_runner.command);
		}
	}

	function swap_current_command(where: 1 | -1) {
		const previous_index = filtered_commands.findIndex((command) => command === marked_command);
		let next_index = previous_index + where;
		if (previous_index === -1) {
			input_element?.focus();
			next_index = 0;
		}

		// wrap around
		if (next_index >= filtered_commands.length) next_index = 0;
		if (next_index <= -1) next_index = filtered_commands.length - 1;

		marked_command = filtered_commands[next_index];
		command_button_elements[next_index]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}

	async function key_bind_commands(commands: Command[]) {
		if (typeof unbind_function === 'function') {
			unbind_function();
		}
		const key_binds: KeyBindingMap = {};

		for (let command of commands) {
			if (command.key_bind) {
				key_binds[get_key_bind(command.key_bind)] = (event) => {
					const has_action = typeof command.action === 'function';
					const has_action_component = !!command.action_component;
					// if it has an action or an action component we prevent the default
					if (has_action || has_action_component) {
						event.preventDefault();
						event.stopImmediatePropagation();
						event.stopPropagation();
					}
					// if it has an action we run the action
					if (has_action) {
						command.action?.();
						return;
					}
					// otherwise we open the command runner
					// with the current command
					open_command_runner(command);
				};
			}
		}

		async function open_file_palette(event: KeyboardEvent) {
			event.preventDefault();
			current_action_command = null;
			if (!dialog.open) {
				open_command_runner();
				return;
			}
			search = '';
			await tick();
			input_element?.focus();
		}

		key_binds[
			get_key_bind({
				mod: ['$mod'],
				keys: ['p'],
			})
		] = open_file_palette;

		key_binds[
			get_key_bind({
				mod: ['$mod'],
				keys: ['e'],
			})
		] = open_file_palette;

		async function open_command_palette(event: KeyboardEvent) {
			event.preventDefault();
			current_action_command = null;
			if (!dialog.open) {
				// open command runner in command mode
				open_command_runner('> ');
				return;
			}
			if (!search.startsWith('>')) {
				search = '> ' + search;
			}
			await tick();
			input_element?.focus();
			input_element?.setSelectionRange(1, search.length);
		}

		key_binds[
			get_key_bind({
				mod: ['$mod', 'Shift'],
				keys: ['p'],
			})
		] = open_command_palette;

		key_binds[
			get_key_bind({
				mod: ['$mod'],
				keys: ['k'],
			})
		] = open_command_palette;

		key_binds[
			get_key_bind({
				keys: ['ArrowDown'],
			})
		] = (event) => {
			if (dialog.open) {
				event.preventDefault();
				swap_current_command(1);
			}
		};

		key_binds[
			get_key_bind({
				keys: ['ArrowUp'],
			})
		] = (event) => {
			if (dialog.open) {
				event.preventDefault();
				swap_current_command(-1);
			}
		};

		unbind_function = tinykeys(window, key_binds);
	}

	onDestroy(() => {
		if (typeof unbind_function === 'function') {
			unbind_function();
		}
	});
</script>

<svelte:window on:click={handle_window_click} />

<dialog
	bind:this={dialog}
	on:cancel={(e) => {
		if (!current_action_command) return;
		e.preventDefault();
		current_action_command = null;
	}}
	on:close={() => {
		search = '';
		current_action_command = null;
		handle_window_click = null;
		command_runner.close();
	}}
>
	{#if current_action_command}
		<section class="action-component">
			<div class="header">
				<button
					class="cancel"
					title="Back to Command Palette"
					on:click={() => {
						current_action_command = null;
					}}
				>
					<Back />
				</button>
				<div class="divider" />
				<svelte:component this={current_action_command.icon} />
				<h2>
					{current_action_command.title}
				</h2>
			</div>
			<svelte:component
				this={current_action_command.action_component}
				{...current_action_command.action_component_props ?? {}}
				on:completed={() => {
					dialog.close();
				}}
			/>
		</section>
	{:else}
		<section>
			<form
				on:submit|preventDefault={() => {
					if (typeof marked_command?.action === 'function') {
						marked_command.action();
						dialog.close();
					} else if (marked_command?.action_component) {
						current_action_command = marked_command;
					}
				}}
			>
				<input
					bind:this={input_element}
					bind:value={search}
					on:blur={() => {
						marked_command = null;
					}}
					placeholder={`🔍 Search files... (Type ">" for commands)`}
				/>
			</form>
		</section>
		<ul class="commands">
			{#each filtered_commands as command, index}
				{@const key_bind = command.key_bind
					? parseKeybinding(get_key_bind(command.key_bind))
					: null}
				{@const key_bind_sequence = key_bind?.map((bind) =>
					bind.flat(Infinity).map((key) => key.toString().replace('Control', 'Ctrl')),
				)}
				{@const current = command === marked_command}
				<li>
					<button
						class:current
						aria-current={current}
						bind:this={command_button_elements[index]}
						on:click={() => {
							if (typeof command.action === 'function') {
								command.action();
								dialog.close();
							} else if (command.action_component) {
								current_action_command = command;
							}
						}}
						title="Launch command {command.title}"
					>
						{#if mode === 'file'}
							<svelte:component this={get_file_icon(command.title)} />
						{:else if command.icon}
							<svelte:component this={command.icon} style="color: var(--sk-text-1)" />
						{/if}
						{command.title}
						{#if command.subtitle}
							<small>{command.subtitle}</small>
						{/if}
						<div class="actions">
							{#if key_bind_sequence}
								<ul class="key_binds">
									{#each key_bind_sequence || [] as sequence}
										<li>
											{#each sequence as kbd}
												<kbd>
													{#if kbd === 'Meta'}
														{APPLE_DEVICE ? '⌘' : 'Ctrl'}
													{:else}
														{kbd.startsWith('Key') ? kbd.slice(3) : kbd}
													{/if}
												</kbd>
											{/each}
										</li>
									{/each}
								</ul>
							{/if}
							{#if command.action_component}
								<span class="action-arrow" title="Open">
									<Forward />
								</span>
							{/if}
						</div>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</dialog>

<style>
	dialog {
		border: 0;
		padding: 1px;
		margin: auto;
		max-width: 80rem;
		width: 100%;
		background-color: transparent;
		color: var(--sk-text-1);
		filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.1)) drop-shadow(0 2px 8px rgba(0, 0, 0, 0.05));
		background-color: var(--sk-back-2);
		border-radius: 1rem;
	}

	dialog::backdrop {
		background-color: hsla(0, 0%, 0%, 0.2);
		backdrop-filter: blur(2px);
	}

	input {
		width: 100%;
		border: 0;
		padding: 1.5rem 2.5rem;
		font-size: 2rem;
		color: inherit;
		border-start-start-radius: 1rem;
		border-start-end-radius: 1rem;
		background-color: transparent;
	}

	input:focus-visible {
		outline-style: solid;
		position: relative;
		z-index: 10;
	}

	ul {
		margin: 0;
		list-style: none;
	}

	li {
		min-width: 0;
	}

	ul.commands {
		height: 32rem;
		overflow-y: auto;
		position: relative;
		border-top: 1px solid var(--sk-back-4);
		border-bottom-left-radius: 1rem;
		border-bottom-right-radius: 1rem;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.actions {
		margin-inline-start: auto;
		display: flex;
		gap: 1rem;
	}

	ul.key_binds > li {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	button:hover {
		background-color: var(--sk-back-4);
	}

	button.current {
		background-color: var(--sk-back-3);
	}

	.commands button {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.5rem 1rem;
		border-radius: 0.5rem;
		width: 100%;
		text-align: left;
		z-index: 10;
		position: relative;
	}

	.header {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 2rem;
		border-bottom: 1px solid var(--sk-back-4);
	}

	h2 {
		font-size: 2rem;
	}

	button.cancel {
		border-radius: 0.5rem;
		padding: 0.3rem;
	}

	.divider {
		display: inline-block;
		align-self: stretch;
		width: 1px;
		min-height: 1em;
		background-color: var(--sk-back-4);
	}

	small {
		opacity: 0.5;
	}

	@media (hover: none) {
		kbd {
			display: none;
		}
	}

	.action-arrow {
		margin-inline-start: auto;
		display: flex;
		align-items: center;
	}
</style>
