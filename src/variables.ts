import type ModuleInstance from './main.js'

export type VariablesSchema = {
	streams_on: number
	tour_running: string
}

export function UpdateVariableDefinitions(self: ModuleInstance): void {
	self.setVariableDefinitions({
		streams_on: { name: 'Number of streams currently live' },
		tour_running: { name: 'Any guard tour running (yes/no)' },
	})
}
