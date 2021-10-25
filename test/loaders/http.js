// # https.js
import { get } from 'node:http';
import create from 'create-esm-loader';

export const { resolve, getFormat, getSource, transformSource, load } = create({
	resolve(specifier, opts = {}) {
		if (specifier.startsWith('http://')) {
			return { url: specifier };
		} else if (opts.parentURL && opts.parentURL.startsWith('http://')) {
			return {
				url: new URL(specifier, opts.parentURL).href,
			};
		}
	},
	format(url, opts) {
		if (!url.startsWith('http://')) return;
		return { format: 'module' };
	},
	async fetch(url, opts) {
		if (!url.startsWith('http://')) return;
		let source = await new Promise((resolve, reject) => {
			let data = '';
			get(url, res => {
				res.on('data', chunk => data += chunk);
				res.on('end', () => resolve(data));
			}).on('error', err => reject(err));
		});
		return { source };
	},
});
