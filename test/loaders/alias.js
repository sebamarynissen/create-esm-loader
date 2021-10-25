import create from 'create-esm-loader';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../files');

export const { resolve, load } = create({
	resolve(specifier, opts) {
		let url = new URL(specifier, opts.parentURL);
		if (!url.pathname.endsWith('.txt')) return;
		return {
			url: String(url),
			format: 'module',
		};
	},
	transform(source, opts) {
		let url = new URL(opts.url);
		if (!url.pathname.endsWith('.txt')) return;
		return `export default ${JSON.stringify(String(source))}`;
	},
});
