// # transpiler.js
import create from 'create-esm-loader';
import { default as ts } from 'typescript';

const config = {
	resolve(specifier, opts) {
		if (!specifier.endsWith('.ts')) return;
		return {
			url: new URL(specifier, opts.parentURL).href,
		};
	},
	format(url) {
		if (!url.endsWith('.ts')) return;
		return { format: 'module' };
	},
	transform(source, opts) {
		if (!opts.url.endsWith('.ts')) return;
		let { outputText } = ts.transpileModule(String(source), {
			compilerOptions: {
				module: ts.ModuleKind.ES2020,
			},
		});
		return outputText;
	},
};
export default config;

export const {
	resolve,
	getFormat,
	getSource,
	transformSource,
	load,
} = create(config);
